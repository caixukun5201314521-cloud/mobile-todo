import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allow configurable data path for cloud container volumes
const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, 'data');
const DATA_FILE = path.extname(DATA_DIR) ? DATA_DIR : path.join(DATA_DIR, 'todos.json');
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || ''; // Optional secret token

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory and file exist
if (!fs.existsSync(path.dirname(DATA_FILE))) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
}

// In-memory SSE clients
const sseClients = new Set();

function broadcastEvent(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Watch data file for external edits (e.g. from Agent or CLI)
let fileDebounceTimer = null;
let lastKnownFileHash = '';

function getFileHash() {
  try {
    const stats = fs.statSync(DATA_FILE);
    return `${stats.mtimeMs}-${stats.size}`;
  } catch {
    return '';
  }
}
lastKnownFileHash = getFileHash();

try {
  fs.watch(DATA_FILE, () => {
    clearTimeout(fileDebounceTimer);
    fileDebounceTimer = setTimeout(() => {
      const currentHash = getFileHash();
      if (currentHash !== lastKnownFileHash) {
        lastKnownFileHash = currentHash;
        const todos = readTodos();
        broadcastEvent('sync', { action: 'file_changed', todos });
      }
    }, 100);
  });
} catch (err) {
  console.warn('文件热监听启动警告:', err.message);
}

function readTodos() {
  try {
    const content = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(content || '[]');
  } catch (err) {
    console.error('读取数据文件错误:', err);
    return [];
  }
}

function writeTodos(todos) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(todos, null, 2), 'utf-8');
    lastKnownFileHash = getFileHash();
    return true;
  } catch (err) {
    console.error('写入数据文件错误:', err);
    return false;
  }
}

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// Optional Auth Middleware for write API
function requireAuth(req, res, next) {
  if (!API_KEY) return next();
  const providedKey = req.headers['x-api-key'] || req.query.key;
  if (providedKey === API_KEY) return next();
  return res.status(401).json({ error: '未经授权：缺少或无效的 API 密钥' });
}

// SSE endpoint
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
  sseClients.add(res);

  const pingInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(pingInterval);
    sseClients.delete(res);
  });
});

// API: List todos
app.get('/api/todos', (req, res) => {
  const todos = readTodos();
  res.json({ success: true, todos });
});

// API: Add todo
app.post('/api/todos', requireAuth, (req, res) => {
  const { title, date, time, priority, category, notes } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: '标题不能为空' });
  }

  const todos = readTodos();
  const now = new Date();
  const newTodo = {
    id: `todo-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    title: title.trim(),
    date: date || now.toISOString().split('T')[0],
    time: time || '',
    priority: priority || 'medium',
    category: category || '工作',
    notes: (notes || '').trim(),
    completed: false,
    completedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    source: req.body.source || 'phone'
  };

  todos.unshift(newTodo);
  writeTodos(todos);

  broadcastEvent('todo_added', { todo: newTodo, todos });
  res.status(201).json({ success: true, todo: newTodo });
});

// API: Update todo
app.patch('/api/todos/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const todos = readTodos();
  const index = todos.findIndex((t) => t.id === id);

  if (index === -1) {
    return res.status(404).json({ error: '未找到待办事项' });
  }

  const existing = todos[index];
  const now = new Date().toISOString();

  if (typeof updates.completed === 'boolean') {
    existing.completed = updates.completed;
    existing.completedAt = updates.completed ? now : null;
  }

  if (updates.title !== undefined) existing.title = updates.title.trim();
  if (updates.date !== undefined) existing.date = updates.date;
  if (updates.time !== undefined) existing.time = updates.time;
  if (updates.priority !== undefined) existing.priority = updates.priority;
  if (updates.category !== undefined) existing.category = updates.category;
  if (updates.notes !== undefined) existing.notes = updates.notes;
  existing.updatedAt = now;

  writeTodos(todos);
  broadcastEvent('todo_updated', { todo: existing, todos });
  res.json({ success: true, todo: existing });
});

// API: Delete todo
app.delete('/api/todos/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const todos = readTodos();
  const index = todos.findIndex((t) => t.id === id);

  if (index === -1) {
    return res.status(404).json({ error: '未找到待办事项' });
  }

  const [removed] = todos.splice(index, 1);
  writeTodos(todos);

  broadcastEvent('todo_deleted', { id, removed, todos });
  res.json({ success: true, removed });
});

// API: Network and QR code info
app.get('/api/network', async (req, res) => {
  const ips = getLocalIpAddresses();
  const host = req.get('host') || `${ips[0] || 'localhost'}:${PORT}`;
  const protocol = req.protocol || 'http';
  const url = `${protocol}://${host}`;
  let qrDataUrl = '';

  try {
    qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 256 });
  } catch (err) {
    console.error('QR code generation failed:', err);
  }

  res.json({
    ips,
    port: PORT,
    primaryUrl: url,
    qrDataUrl,
    activeConnections: sseClients.size
  });
});

const server = app.listen(PORT, '0.0.0.0', async () => {
  const ips = getLocalIpAddresses();
  const primaryIp = ips[0] || 'localhost';
  const mobileUrl = `http://${primaryIp}:${PORT}`;

  console.log('='.repeat(55));
  console.log(`🚀 待办日历看板服务已启动！`);
  console.log(`💻 本地访问: http://localhost:${PORT}`);
  console.log(`📱 局域网访问: ${mobileUrl}`);
  console.log(`⚡ 监听端口: ${PORT}`);
  if (API_KEY) console.log(`🔒 API 鉴权已开启`);
  console.log('='.repeat(55));

  try {
    const terminalQR = await QRCode.toString(mobileUrl, { type: 'terminal', small: true });
    console.log('\n📲 扫码访问：');
    console.log(terminalQR);
  } catch {
    // ignore
  }
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

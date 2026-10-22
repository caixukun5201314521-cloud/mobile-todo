import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import { AppError, fail } from './lib/validation.js';
import { createStore } from './lib/store.js';
import { appendSession, clearBike, createEntity, createTodo, parkBike, updateEntity, updateSettings, updateTodo } from './lib/models.js';
import { buildExport } from './lib/exports.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) if (iface.family === 'IPv4' && !iface.internal) addresses.push(iface.address);
  }
  return addresses;
}

function jsonError(res, error) {
  if (error instanceof AppError) return res.status(error.status).json({ error: error.message, code: error.code });
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: '请求 JSON 格式无效' });
  console.error('request failed:', error?.message || error);
  return res.status(500).json({ error: '服务器无法处理请求' });
}
function routeError(handler) {
  return (req, res, next) => {
    try { const result = handler(req, res, next); if (result?.catch) result.catch(error => jsonError(res, error)); }
    catch (error) { jsonError(res, error); }
  };
}
function authMiddleware(apiKey) {
  return (req, res, next) => {
    if (!apiKey) return next();
    const supplied = req.headers['x-api-key'] || req.query.key;
    if (supplied === apiKey) return next();
    return res.status(401).json({ error: '未经授权：缺少或无效的 API 密钥' });
  };
}
function sendEntity(res, singular, value, status = 200) { return res.status(status).json({ success: true, [singular]: value }); }
function entityKeyForPath(name) { return name === 'study-sessions' ? 'studySessions' : name; }
const ENTITY_ROUTES = [
  { route: 'workouts', key: 'workouts', singular: 'workout' },
  { route: 'study-sessions', key: 'studySessions', singular: 'studySession' },
  { route: 'papers', key: 'papers', singular: 'paper' },
  { route: 'transactions', key: 'transactions', singular: 'transaction' }
];

export function createApp(options = {}) {
  const app = express();
  const port = Number(options.port ?? process.env.PORT ?? 3000);
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';
  const apiKey = options.apiKey ?? process.env.API_KEY ?? '';
  const store = options.store || createStore({ dataPath: options.dataPath ?? process.env.DATA_PATH, baseDir: __dirname });
  const clients = new Set();
  let closed = false;
  const broadcast = (event, payload) => {
    const output = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients) {
      try { client.write(output); } catch { clients.delete(client); }
    }
  };
  const broadcastChanged = (key, value) => {
    if (key === 'todos') broadcast('sync', { action: 'file_changed', todos: value });
    if (key === 'bike') broadcast('bike_updated', { bike: value });
    broadcast('data_changed', { dataset: key, action: 'file_changed' });
  };
  if (options.watch !== false) store.watch((key, value) => { if (!closed) broadcastChanged(key, value); }, key => {
    if (!closed) broadcast('data_changed', { dataset: key, error: '数据文件不可用或格式无效，请恢复有效数据' });
  });

  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(express.static(path.join(__dirname, 'public')));
  const requireAuth = authMiddleware(apiKey);

  // Network metadata and QR are intentionally public: they contain no personal data.
  app.get('/api/network', routeError(async (req, res) => {
    const ips = getLocalIpAddresses();
    const configuredPort = Number.isFinite(port) ? port : 3000;
    const hostHeader = req.get('host') || `${ips[0] || 'localhost'}:${configuredPort}`;
    const protocol = req.protocol || 'http';
    const url = `${protocol}://${hostHeader}`;
    let qrDataUrl = '';
    try { qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 256 }); } catch (error) { console.error('QR code generation failed:', error.message); }
    res.json({ ips, port: configuredPort, primaryUrl: url, qrDataUrl, activeConnections: clients.size });
  }));

  app.get('/api/events', requireAuth, routeError((req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: connected\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
    clients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25_000);
    ping.unref?.();
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
  }));

  app.get('/api/state', requireAuth, routeError((req, res) => res.json({ success: true, ...store.state() })));
  app.get('/api/todos', requireAuth, routeError((req, res) => res.json({ success: true, todos: store.read('todos') })));
  app.post('/api/todos', requireAuth, routeError((req, res) => {
    const now = Date.now();
    const todo = createTodo(req.body, now);
    const todos = store.mutate('todos', list => [todo, ...list]);
    broadcast('todo_added', { todo, todos });
    res.status(201).json({ success: true, todo });
  }));
  app.patch('/api/todos/:id', requireAuth, routeError((req, res) => {
    const now = Date.now();
    let updated;
    const todos = store.mutate('todos', list => {
      const index = list.findIndex(item => item.id === req.params.id);
      if (index < 0) fail('未找到待办事项', 404, 'NOT_FOUND');
      updated = updateTodo(list[index], req.body, now);
      const copy = [...list]; copy[index] = updated; return copy;
    });
    broadcast('todo_updated', { todo: updated, todos });
    res.json({ success: true, todo: updated });
  }));
  app.post('/api/todos/:id/sessions', requireAuth, routeError((req, res) => {
    const now = Date.now(); let updated; let entry;
    const todos = store.mutate('todos', list => {
      const index = list.findIndex(item => item.id === req.params.id);
      if (index < 0) fail('未找到待办事项', 404, 'NOT_FOUND');
      ({ record: updated, entry } = appendSession(list[index], req.body, now));
      const copy = [...list]; copy[index] = updated; return copy;
    });
    broadcast('todo_updated', { todo: updated, todos });
    res.status(201).json({ success: true, todo: updated, session: entry });
  }));
  app.delete('/api/todos/:id', requireAuth, routeError((req, res) => {
    let removed;
    const todos = store.mutate('todos', list => {
      const index = list.findIndex(item => item.id === req.params.id);
      if (index < 0) fail('未找到待办事项', 404, 'NOT_FOUND');
      [removed] = list.splice(index, 1); return list;
    });
    broadcast('todo_deleted', { id: req.params.id, removed, todos });
    res.json({ success: true, removed });
  }));

  for (const definition of ENTITY_ROUTES) {
    const { route, key, singular } = definition;
    app.get(`/api/${route}`, requireAuth, routeError((req, res) => res.json({ success: true, [key]: store.read('life')[key] })));
    app.get(`/api/${route}/:id`, requireAuth, routeError((req, res) => {
      const entity = store.read('life')[key].find(item => item.id === req.params.id);
      if (!entity) fail('未找到记录', 404, 'NOT_FOUND');
      return sendEntity(res, singular, entity);
    }));
    app.post(`/api/${route}`, requireAuth, routeError((req, res) => {
      const now = Date.now(); const entity = createEntity(key, req.body, now);
      store.mutate('life', life => ({ ...life, [key]: [entity, ...life[key]] }));
      broadcast('data_changed', { dataset: key, [singular]: entity, state: store.state() });
      return sendEntity(res, singular, entity, 201);
    }));
    app.patch(`/api/${route}/:id`, requireAuth, routeError((req, res) => {
      const now = Date.now(); let updated;
      store.mutate('life', life => {
        const index = life[key].findIndex(item => item.id === req.params.id);
        if (index < 0) fail('未找到记录', 404, 'NOT_FOUND');
        updated = updateEntity(key, life[key][index], req.body, now);
        const items = [...life[key]]; items[index] = updated; return { ...life, [key]: items };
      });
      broadcast('data_changed', { dataset: key, [singular]: updated, state: store.state() });
      return sendEntity(res, singular, updated);
    }));
    app.delete(`/api/${route}/:id`, requireAuth, routeError((req, res) => {
      let removed;
      store.mutate('life', life => {
        const index = life[key].findIndex(item => item.id === req.params.id);
        if (index < 0) fail('未找到记录', 404, 'NOT_FOUND');
        const items = [...life[key]]; [removed] = items.splice(index, 1); return { ...life, [key]: items };
      });
      broadcast('data_changed', { dataset: key, id: req.params.id, removed, state: store.state() });
      return res.json({ success: true, removed });
    }));
    if (key === 'papers') {
      app.post(`/api/${route}/:id/sessions`, requireAuth, routeError((req, res) => {
        const now = Date.now(); let updated; let entry;
        store.mutate('life', life => {
          const index = life.papers.findIndex(item => item.id === req.params.id);
          if (index < 0) fail('未找到记录', 404, 'NOT_FOUND');
          ({ record: updated, entry } = appendSession(life.papers[index], req.body, now));
          const papers = [...life.papers]; papers[index] = updated; return { ...life, papers };
        });
        broadcast('data_changed', { dataset: 'papers', paper: updated, state: store.state() });
        return res.status(201).json({ success: true, paper: updated, session: entry });
      }));
    }
  }

  app.get('/api/settings', requireAuth, routeError((req, res) => res.json({ success: true, settings: store.read('life').settings })));
  app.patch('/api/settings', requireAuth, routeError((req, res) => {
    let settings;
    const now = Date.now();
    store.mutate('life', life => {
      settings = updateSettings(life.settings, req.body, now);
      return { ...life, settings };
    });
    broadcast('data_changed', { dataset: 'settings', settings, state: store.state() });
    res.json({ success: true, settings });
  }));

  app.get('/api/export', requireAuth, routeError((req, res) => {
    const output = buildExport(store.state(), req.query);
    res.setHeader('Content-Type', output.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${output.filename}"`);
    res.send(output.body);
  }));

  app.get('/api/bike', requireAuth, routeError((req, res) => res.json({ success: true, bike: store.read('bike') })));
  app.post('/api/bike', requireAuth, routeError((req, res) => {
    const now = Date.now(); let bike;
    store.mutate('bike', current => {
      bike = parkBike(current, req.body, now);
      return bike;
    });
    broadcast('bike_updated', { bike }); broadcast('data_changed', { dataset: 'bike', bike, state: store.state() });
    res.json({ success: true, bike });
  }));
  app.post('/api/bike/clear', requireAuth, routeError((req, res) => {
    const now = Date.now(); let bike;
    store.mutate('bike', current => {
      bike = clearBike(current, now);
      return bike;
    });
    broadcast('bike_updated', { bike }); broadcast('data_changed', { dataset: 'bike', bike, state: store.state() });
    res.json({ success: true, bike });
  }));

  app.use((error, req, res, next) => jsonError(res, error));
  app.use((req, res) => res.status(404).json({ error: '未找到请求资源' }));

  const api = {
    app, store, clients, port, host,
    async listen() { return new Promise((resolve, reject) => {
      const server = app.listen(port, host, () => resolve(server));
      server.once('error', reject);
    }); },
    close() { closed = true; clients.forEach(client => { try { client.end(); } catch {} }); clients.clear(); store.close(); }
  };
  return api;
}

export async function startServer(options = {}) {
  const api = createApp(options);
  const server = await api.listen();
  const port = server.address()?.port ?? options.port ?? process.env.PORT ?? 3000;
  const ips = getLocalIpAddresses();
  console.log(`待办日历看板服务已启动: http://${ips[0] || 'localhost'}:${port}`);
  if (options.apiKey ?? process.env.API_KEY) console.log('API 鉴权已开启');
  return { ...api, server, close() { api.close(); return new Promise(resolve => server.close(() => resolve())); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startServer().catch(error => { console.error(error.message); process.exitCode = 1; });
}

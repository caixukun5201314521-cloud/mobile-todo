#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'data', 'todos.json');
const CONFIG_FILE = path.join(__dirname, '.config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return {
    remoteUrl: process.env.TODO_SERVER_URL || '',
    apiKey: process.env.TODO_API_KEY || ''
  };
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

const config = loadConfig();

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Local File Operations
function readLocalTodos() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '[]');
  } catch (err) {
    console.error('读取本地待办失败:', err.message);
    return [];
  }
}

function writeLocalTodos(todos) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(todos, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('保存本地待办失败:', err.message);
    return false;
  }
}

// Remote API Operations
async function remoteFetch(endpoint, method = 'GET', body = null) {
  const url = `${config.remoteUrl.replace(/\/+$/, '')}${endpoint}`;
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['x-api-key'] = config.apiKey;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`云端请求失败 [${res.status}]: ${errorText}`);
  }
  return await res.json();
}

const args = process.argv.slice(2);
const command = args[0] || 'list';

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

async function main() {
  const isRemote = Boolean(config.remoteUrl);
  const locationTag = isRemote ? `☁️ 云端 (${config.remoteUrl})` : '💻 本地文件';

  switch (command) {
    case 'config':
    case 'set-remote': {
      const url = args[1];
      const key = args[2] || '';
      if (!url) {
        console.log(`当前连接配置: ${locationTag}`);
        console.log(`如需设置云端: node cli.js set-remote https://<your-app>.zeabur.app [api_key]`);
        console.log(`如需切换回本地: node cli.js set-remote local`);
        return;
      }
      if (url === 'local' || url === 'clear') {
        saveConfig({ remoteUrl: '', apiKey: '' });
        console.log('✅ 已切换回本地文件模式！');
      } else {
        saveConfig({ remoteUrl: url, apiKey: key });
        console.log(`✅ 已成功绑定云端服务: ${url}`);
      }
      break;
    }

    case 'list': {
      const flags = parseFlags(args.slice(1));
      let todos = [];

      if (isRemote) {
        try {
          const res = await remoteFetch('/api/todos');
          todos = res.todos || [];
        } catch (err) {
          console.error(`❌ 获取云端数据失败: ${err.message}`);
          return;
        }
      } else {
        todos = readLocalTodos();
      }

      const today = getTodayStr();
      let filtered = todos;
      if (flags.today) {
        filtered = todos.filter((t) => t.date === today);
        console.log(`\n📅 [${locationTag}] 今日（${today}）代办清单：`);
      } else if (flags.date) {
        filtered = todos.filter((t) => t.date === flags.date);
        console.log(`\n📅 [${locationTag}] 日期（${flags.date}）代办清单：`);
      } else if (!flags.all) {
        filtered = todos.filter((t) => !t.completed || t.date === today);
        console.log(`\n📋 [${locationTag}] 代办事项（未核销 & 今日事项）：`);
      } else {
        console.log(`\n📋 [${locationTag}] 全部待办事项：`);
      }

      if (filtered.length === 0) {
        console.log('   （暂无匹配事项）');
      } else {
        filtered.forEach((t, idx) => {
          const status = t.completed ? '✅ [已核销]' : '⬜ [待完成]';
          const pMap = { high: '🔴高', medium: '🟡中', low: '🟢低' };
          const priority = pMap[t.priority] || '⚪普通';
          const timeStr = t.time ? ` ⏰${t.time}` : '';
          const catStr = t.category ? ` [${t.category}]` : '';
          const notesStr = t.notes ? `\n      💬 备注: ${t.notes}` : '';
          const srcStr = t.source === 'agent' ? ' (来自Agent)' : '';

          console.log(` ${idx + 1}. ${status} ${t.title}${catStr} (${priority}${timeStr} 📅${t.date})${srcStr}`);
          console.log(`      🆔 ID: ${t.id}${notesStr}`);
        });
      }
      console.log('');
      break;
    }

    case 'add': {
      const title = args[1];
      if (!title) {
        console.error('❌ 请提供任务标题，例如: node cli.js add "写周报" --date 2026-10-22 --priority high');
        process.exit(1);
      }
      const flags = parseFlags(args.slice(2));

      // Parse links and images from flags
      const links = [];
      if (flags.link) {
        const linkItems = Array.isArray(flags.link) ? flags.link : [flags.link];
        linkItems.forEach((l) => {
          if (l.includes('|')) {
            const [t, u] = l.split('|');
            links.push({ title: t.trim(), url: u.trim() });
          } else {
            links.push({ title: l.trim(), url: l.trim() });
          }
        });
      }

      const images = [];
      if (flags.image) {
        const imgItems = Array.isArray(flags.image) ? flags.image : [flags.image];
        imgItems.forEach((img) => images.push(img.trim()));
      }

      const content = flags.content || flags.desc || flags.notes || '';

      const payload = {
        title,
        date: flags.date || getTodayStr(),
        time: flags.time || '',
        priority: flags.priority || 'medium',
        category: flags.category || '工作',
        notes: content,
        content: content,
        links,
        images,
        source: 'agent'
      };

      if (isRemote) {
        try {
          const res = await remoteFetch('/api/todos', 'POST', payload);
          console.log(`\n✨ [Agent -> 云端] 成功添加待办事项：`);
          console.log(`   📌 标题: ${res.todo.title}`);
          console.log(`   📅 日期: ${res.todo.date} ${res.todo.time}`);
          if (content) console.log(`   📝 详情: ${content}`);
          if (links.length) console.log(`   🔗 链接: ${links.length} 个`);
          if (images.length) console.log(`   🖼️ 图片: ${images.length} 张`);
          console.log(`   🆔 ID: ${res.todo.id}\n`);
        } catch (err) {
          console.error(`❌ 云端添加失败: ${err.message}`);
        }
      } else {
        const todos = readLocalTodos();
        const now = new Date();
        const newTodo = {
          id: `todo-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          ...payload,
          completed: false,
          completedAt: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };
        todos.unshift(newTodo);
        if (writeLocalTodos(todos)) {
          console.log(`\n✨ [Agent -> 本地] 成功添加待办事项：`);
          console.log(`   📌 标题: ${newTodo.title}`);
          console.log(`   📅 日期: ${newTodo.date} ${newTodo.time}`);
          if (content) console.log(`   📝 详情: ${content}`);
          if (links.length) console.log(`   🔗 链接: ${links.length} 个`);
          if (images.length) console.log(`   🖼️ 图片: ${images.length} 张`);
          console.log(`   🆔 ID: ${newTodo.id}\n`);
        }
      }
      break;
    }

    case 'view':
    case 'show': {
      const query = args[1];
      if (!query) {
        console.error('❌ 请提供任务 ID 或标题关键字');
        process.exit(1);
      }
      let todos = [];
      if (isRemote) {
        const res = await remoteFetch('/api/todos');
        todos = res.todos || [];
      } else {
        todos = readLocalTodos();
      }
      const target = todos.find((t) => t.id === query || t.title.includes(query));
      if (!target) {
        console.error(`❌ 未找到匹配的任务: "${query}"`);
        return;
      }
      console.log('\n' + '='.repeat(48));
      console.log(`📌 任务标题: ${target.title}`);
      console.log(`📊 状态: ${target.completed ? '✅ [已核销]' : '⬜ [待完成]'}`);
      console.log(`📅 截止时间: ${target.date} ${target.time || '(全天)'}`);
      console.log(`🕒 发布时间: ${target.createdAt || '-'}`);
      if (target.completedAt) console.log(`🎉 核销时间: ${target.completedAt}`);
      console.log(`🏷️  分类: ${target.category} | 优先级: ${target.priority}`);
      console.log(`🤖 来源: ${target.source}`);
      console.log(`🆔 ID: ${target.id}`);
      if (target.content || target.notes) {
        console.log(`\n📝 任务具体内容:\n${target.content || target.notes}`);
      }
      if (target.links && target.links.length > 0) {
        console.log('\n🔗 相关链接:');
        target.links.forEach((l) => console.log(`   - ${l.title}: ${l.url}`));
      }
      if (target.images && target.images.length > 0) {
        console.log(`\n🖼️ 附件图片 (${target.images.length} 张):`);
        target.images.forEach((img) => console.log(`   - ${img.slice(0, 60)}...`));
      }
      console.log('='.repeat(48) + '\n');
      break;
    }

    case 'complete':
    case 'done': {
      const query = args[1];
      if (!query) {
        console.error('❌ 请提供要核销的任务 ID 或标题关键字');
        process.exit(1);
      }

      if (isRemote) {
        const { todos } = await remoteFetch('/api/todos');
        const target = todos.find((t) => t.id === query || t.title.includes(query));
        if (!target) {
          console.error(`❌ 未找到匹配的任务: "${query}"`);
          return;
        }
        await remoteFetch(`/api/todos/${encodeURIComponent(target.id)}`, 'PATCH', { completed: true });
        console.log(`\n🎉 [Agent -> 云端] 成功核销任务：【${target.title}】 (ID: ${target.id})\n`);
      } else {
        const todos = readLocalTodos();
        const target = todos.find((t) => t.id === query || t.title.includes(query));
        if (!target) {
          console.error(`❌ 未找到匹配的任务: "${query}"`);
          return;
        }
        target.completed = true;
        target.completedAt = new Date().toISOString();
        target.updatedAt = new Date().toISOString();
        if (writeLocalTodos(todos)) {
          console.log(`\n🎉 [Agent -> 本地] 成功核销任务：【${target.title}】 (ID: ${target.id})\n`);
        }
      }
      break;
    }

    case 'uncomplete':
    case 'undone': {
      const query = args[1];
      if (!query) {
        console.error('❌ 请提供要恢复的任务 ID 或标题关键字');
        process.exit(1);
      }

      if (isRemote) {
        const { todos } = await remoteFetch('/api/todos');
        const target = todos.find((t) => t.id === query || t.title.includes(query));
        if (!target) {
          console.error(`❌ 未找到匹配的任务: "${query}"`);
          return;
        }
        await remoteFetch(`/api/todos/${encodeURIComponent(target.id)}`, 'PATCH', { completed: false });
        console.log(`\n↩️ [Agent -> 云端] 已恢复任务为待办：【${target.title}】\n`);
      } else {
        const todos = readLocalTodos();
        const target = todos.find((t) => t.id === query || t.title.includes(query));
        if (!target) {
          console.error(`❌ 未找到匹配的任务: "${query}"`);
          return;
        }
        target.completed = false;
        target.completedAt = null;
        target.updatedAt = new Date().toISOString();
        if (writeLocalTodos(todos)) {
          console.log(`\n↩️ [Agent -> 本地] 已恢复任务为待办：【${target.title}】\n`);
        }
      }
      break;
    }

    case 'delete':
    case 'remove': {
      const query = args[1];
      if (!query) {
        console.error('❌ 请提供要删除的任务 ID 或标题关键字');
        process.exit(1);
      }

      if (isRemote) {
        const { todos } = await remoteFetch('/api/todos');
        const target = todos.find((t) => t.id === query || t.title.includes(query));
        if (!target) {
          console.error(`❌ 未找到匹配的任务: "${query}"`);
          return;
        }
        await remoteFetch(`/api/todos/${encodeURIComponent(target.id)}`, 'DELETE');
        console.log(`\n🗑️ [Agent -> 云端] 已成功删除任务：【${target.title}】\n`);
      } else {
        const todos = readLocalTodos();
        const initialLen = todos.length;
        const remaining = todos.filter((t) => t.id !== query && !t.title.includes(query));
        if (remaining.length === initialLen) {
          console.error(`❌ 未找到匹配的任务: "${query}"`);
          return;
        }
        if (writeLocalTodos(remaining)) {
          console.log(`\n🗑️ [Agent -> 本地] 已成功删除任务（已移除 ${initialLen - remaining.length} 项）\n`);
        }
      }
      break;
    }

    default:
      console.log(`
待办事项 Agent 终端管理工具:
  node cli.js list [--all | --today | --date YYYY-MM-DD]   # 查看待办
  node cli.js add "<标题>" [--date ...] [--time ...]        # 添加待办
  node cli.js done "<ID 或标题关键字>"                       # 核销完成
  node cli.js undone "<ID 或标题关键字>"                     # 恢复待办
  node cli.js delete "<ID 或标题关键字>"                     # 删除待办
  node cli.js set-remote <url> [api_key]                  # 绑定/切换云端服务
`);
  }
}

main().catch((err) => {
  console.error('执行出错:', err.message);
  process.exit(1);
});

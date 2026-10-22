#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './lib/store.js';
import { newSession } from './lib/validation.js';
import { createTodo } from './lib/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const store = createStore({ dataPath: process.env.DATA_PATH, baseDir: __dirname });
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
    return store.read('todos');
  } catch (err) {
    console.error('读取本地待办失败:', err.message);
    throw err;
  }
}

function writeLocalTodos(expectedTodos, updatedTodos) {
  try {
    store.mutate('todos', current => {
      if (JSON.stringify(current) !== JSON.stringify(expectedTodos)) {
        throw new Error('数据已被服务器或其他进程修改；请重试以免覆盖更新');
      }
      return updatedTodos;
    });
    return true;
  } catch (err) {
    console.error('保存本地待办失败:', err.message);
    process.exitCode = 1;
    return false;
  }
}

function completionInput(flags) {
  if (!flags.start || !flags.end || flags.minutes === undefined) {
    throw new Error('完成任务必须提供 --start <带时区ISO> --end <带时区ISO> --minutes <正数>');
  }
  const input = {
    startAt: flags.start,
    endAt: flags.end,
    durationMinutes: Number(flags.minutes),
    notes: flags.notes || ''
  };
  if (flags.energy !== undefined) input.energy = Number(flags.energy);
  return input;
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
        module: flags.module || 'life',
        subject: flags.subject || '',
        estimatedMinutes: flags.minutes === undefined ? null : Number(flags.minutes),
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
        const newTodo = createTodo(payload);
        const nextTodos = [newTodo, ...todos];
        if (writeLocalTodos(todos, nextTodos)) {
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
      const flags = parseFlags(args.slice(2));
      let completion;
      try { completion = completionInput(flags); newSession(completion); }
      catch (err) { console.error(`❌ ${err.message}`); process.exitCode = 1; return; }

      if (isRemote) {
        const { todos } = await remoteFetch('/api/todos');
        const target = todos.find((t) => t.id === query || t.title.includes(query));
        if (!target) {
          console.error(`❌ 未找到匹配的任务: "${query}"`);
          return;
        }
        await remoteFetch(`/api/todos/${encodeURIComponent(target.id)}`, 'PATCH', { completed: true, completion });
        console.log(`\n🎉 [Agent -> 云端] 成功核销任务：【${target.title}】 (ID: ${target.id})\n`);
      } else {
        const todos = readLocalTodos();
        const target = todos.find((t) => t.id === query || t.title.includes(query));
        if (!target) {
          console.error(`❌ 未找到匹配的任务: "${query}"`);
          return;
        }
        if (target.completed) {
          console.error('❌ 该任务已经完成；请先撤销完成后再核销');
          return;
        }
        const now = Date.now();
        const completedSession = newSession(completion, now);
        const updated = {
          ...target,
          completed: true,
          completedAt: new Date(now).toISOString(),
          timeEntries: [...(Array.isArray(target.timeEntries) ? target.timeEntries : []), completedSession],
          updatedAt: new Date(now).toISOString()
        };
        const nextTodos = todos.map(todo => todo.id === target.id ? updated : todo);
        if (writeLocalTodos(todos, nextTodos)) {
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
        const updated = { ...target, completed: false, completedAt: null, updatedAt: new Date().toISOString() };
        const nextTodos = todos.map(todo => todo.id === target.id ? updated : todo);
        if (writeLocalTodos(todos, nextTodos)) {
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
        if (writeLocalTodos(todos, remaining)) {
          console.log(`\n🗑️ [Agent -> 本地] 已成功删除任务（已移除 ${initialLen - remaining.length} 项）\n`);
        }
      }
      break;
    }

    case 'bike': {
      const sub = args[1];
      if (sub === 'clear' || sub === 'finish') {
        if (isRemote) {
          await remoteFetch('/api/bike/clear', 'POST');
        } else {
          try {
            const before = store.read('bike');
            const cleared = { ...before, active: false, retrievedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            store.mutate('bike', current => {
              if (JSON.stringify(current) !== JSON.stringify(before)) throw new Error('单车数据已被服务器或其他进程修改；请重试');
              return cleared;
            });
          } catch (err) {
            console.error(`❌ 单车归档失败: ${err.message}`);
            process.exitCode = 1;
            return;
          }
        }
        console.log('\n🎉 [Agent] 已确认取车，单车停放记录已归档核销！\n');
        return;
      }

      let bike = { active: false };
      if (isRemote) {
        const res = await remoteFetch('/api/bike');
        bike = res.bike || { active: false };
      } else {
        bike = store.read('bike');
      }

      console.log('\n' + '='.repeat(48));
      console.log('🚲 【我的单车去哪了】状态看板');
      if (bike.active) {
        console.log('🟢 状态: 单车停放中 (未取车)');
        console.log(`⏰ 停放时间: ${bike.timestamp}`);
        console.log(`📍 坐标: [纬度 ${bike.latitude}, 经度 ${bike.longitude}] (精度 ±${Math.round(bike.accuracy || 0)}m)`);
        if (bike.note) console.log(`📝 位置特征: ${bike.note}`);
        if (bike.photo) console.log('📸 包含停车现场照片附件');
        console.log(`🧭 高德导航: https://uri.amap.com/marker?position=${bike.longitude},${bike.latitude}&name=我的单车`);
      } else {
        console.log('⚪ 状态: 单车当前未停放或已取走');
        if (bike.retrievedAt) console.log(`上次取车时间: ${bike.retrievedAt}`);
      }
      console.log('='.repeat(48) + '\n');
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

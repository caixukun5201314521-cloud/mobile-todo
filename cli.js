#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'data', 'todos.json');

function readTodos() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
      return [];
    }
    const content = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(content || '[]');
  } catch (err) {
    console.error('读取待办数据失败:', err.message);
    return [];
  }
}

function writeTodos(todos) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(todos, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('保存待办数据失败:', err.message);
    return false;
  }
}

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

switch (command) {
  case 'list': {
    const flags = parseFlags(args.slice(1));
    const todos = readTodos();
    const today = getTodayStr();

    let filtered = todos;
    if (flags.today) {
      filtered = todos.filter((t) => t.date === today);
      console.log(`\n📅 今日（${today}）代办清单：`);
    } else if (flags.date) {
      filtered = todos.filter((t) => t.date === flags.date);
      console.log(`\n📅 日期（${flags.date}）代办清单：`);
    } else if (!flags.all) {
      // By default list pending + today's completed
      filtered = todos.filter((t) => !t.completed || t.date === today);
      console.log(`\n📋 全部待办事项（未核销 & 今日事项）：`);
    } else {
      console.log(`\n📋 全部待办事项（含所有历史核销）：`);
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
    const todos = readTodos();
    const now = new Date();

    const newTodo = {
      id: `todo-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title,
      date: flags.date || getTodayStr(),
      time: flags.time || '',
      priority: flags.priority || 'medium',
      category: flags.category || '工作',
      notes: flags.notes || '',
      completed: false,
      completedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      source: 'agent',
    };

    todos.push(newTodo);
    if (writeTodos(todos)) {
      console.log(`\n✨ [Agent] 成功添加待办事项：`);
      console.log(`   📌 标题: ${newTodo.title}`);
      console.log(`   📅 日期: ${newTodo.date} ${newTodo.time}`);
      console.log(`   🏷️  分类: ${newTodo.category} | 优先级: ${newTodo.priority}`);
      console.log(`   🆔 ID: ${newTodo.id}\n`);
    }
    break;
  }

  case 'complete':
  case 'done': {
    const query = args[1];
    if (!query) {
      console.error('❌ 请提供要核销的任务 ID 或标题关键字');
      process.exit(1);
    }
    const todos = readTodos();
    const target = todos.find((t) => t.id === query || t.title.includes(query));
    if (!target) {
      console.error(`❌ 未找到匹配的任务: "${query}"`);
      process.exit(1);
    }
    target.completed = true;
    target.completedAt = new Date().toISOString();
    target.updatedAt = new Date().toISOString();

    if (writeTodos(todos)) {
      console.log(`\n🎉 [Agent] 成功核销任务：【${target.title}】 (ID: ${target.id})\n`);
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
    const todos = readTodos();
    const target = todos.find((t) => t.id === query || t.title.includes(query));
    if (!target) {
      console.error(`❌ 未找到匹配的任务: "${query}"`);
      process.exit(1);
    }
    target.completed = false;
    target.completedAt = null;
    target.updatedAt = new Date().toISOString();

    if (writeTodos(todos)) {
      console.log(`\n↩️ [Agent] 已恢复任务为待办：【${target.title}】\n`);
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
    const todos = readTodos();
    const initialLen = todos.length;
    const remaining = todos.filter((t) => t.id !== query && !t.title.includes(query));
    if (remaining.length === initialLen) {
      console.error(`❌ 未找到匹配的任务: "${query}"`);
      process.exit(1);
    }

    if (writeTodos(remaining)) {
      console.log(`\n🗑️ [Agent] 已成功删除任务（已移除 ${initialLen - remaining.length} 项）\n`);
    }
    break;
  }

  case 'clear-completed': {
    const todos = readTodos();
    const pending = todos.filter((t) => !t.completed);
    const count = todos.length - pending.length;
    if (writeTodos(pending)) {
      console.log(`\n🧹 已清理 ${count} 项已核销任务\n`);
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
  node cli.js clear-completed                             # 清理所有已核销
`);
}

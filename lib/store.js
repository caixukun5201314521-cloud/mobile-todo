import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { AppError, isObject } from './validation.js';

export const defaultSettings = () => ({ monthlyBudget: 4000, currency: 'CNY', budgets: {} });
const emptyLife = () => ({ schemaVersion: 1, workouts: [], studySessions: [], papers: [], transactions: [], settings: defaultSettings() });
const storageError = () => new AppError(503, '数据文件不可用或格式无效；请恢复有效数据后重试，原文件未被覆盖', 'STORAGE_ERROR');

export function resolveDataPaths(dataPath, baseDir) {
  const target = path.resolve(dataPath || path.join(baseDir, 'data'));
  let isFile = /\.json$/i.test(target);
  if (fs.existsSync(target)) isFile = fs.statSync(target).isFile();
  const todos = isFile ? target : path.join(target, 'todos.json');
  const dir = path.dirname(todos);
  const bike = path.join(dir, 'bike.json'), life = path.join(dir, 'life.json');
  if (todos === bike || todos === life) throw new AppError(500, 'DATA_PATH 与保留数据文件名冲突', 'CONFIG_ERROR');
  return { dir, todos, bike, life };
}

export function atomicWriteJson(file, value) {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  let fd;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temp, file);
  } catch {
    throw storageError();
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
    try { fs.unlinkSync(temp); } catch {}
  }
}

export function createStore({ dataPath, baseDir }) {
  const paths = resolveDataPaths(dataPath, baseDir);
  const known = new Set(['todos', 'bike', 'life'].filter(key => fs.existsSync(paths[key])));
  const fingerprints = new Map();
  let watcher, timer;
  function fingerprint(key) {
    try { return createHash('sha256').update(fs.readFileSync(paths[key])).digest('hex'); }
    catch { return 'missing-or-unreadable'; }
  }
  function read(key) {
    let value;
    try {
      value = JSON.parse(fs.readFileSync(paths[key], 'utf8').replace(/^﻿/, ''));
      known.add(key);
    } catch (error) {
      if (error.code === 'ENOENT' && !known.has(key)) {
        return key === 'todos' ? [] : key === 'bike' ? { active: false } : emptyLife();
      }
      throw storageError();
    }
    if (key === 'todos') {
      if (!Array.isArray(value) || value.some(item => !isObject(item))) throw storageError();
    } else if (key === 'bike') {
      if (!isObject(value) || typeof value.active !== 'boolean') throw storageError();
    } else {
      if (!isObject(value)) throw storageError();
      for (const entity of ['workouts', 'studySessions', 'papers', 'transactions']) {
        if (Object.hasOwn(value, entity) && (!Array.isArray(value[entity]) || value[entity].some(item => !isObject(item)))) throw storageError();
      }
      if (Object.hasOwn(value, 'settings') && (!isObject(value.settings) || (Object.hasOwn(value.settings, 'budgets') && !isObject(value.settings.budgets)))) throw storageError();
      value = { ...emptyLife(), ...value, settings: { ...defaultSettings(), ...value.settings } };
    }
    return value;
  }
  function mutate(key, update) {
    const lock = `${paths[key]}.lock`;
    let fd;
    try {
      fs.mkdirSync(paths.dir, { recursive: true });
      try { fd = fs.openSync(lock, 'wx', 0o600); }
      catch (error) {
        if (error.code === 'EEXIST') throw new AppError(409, '数据正在被其他进程修改，请重试', 'STORAGE_BUSY');
        throw storageError();
      }
      const before = fingerprint(key);
      const current = read(key); // Never substitute [] for malformed or empty existing files.
      const updated = update(current);
      if (fingerprint(key) !== before) throw new AppError(409, '数据已被外部修改，请刷新后重试', 'STORAGE_CONFLICT');
      atomicWriteJson(paths[key], updated);
      known.add(key);
      fingerprints.set(key, fingerprint(key));
      return updated;
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch {}
        try { fs.unlinkSync(lock); } catch {}
      }
    }
  }
  function state() {
    const life = read('life');
    return { todos: read('todos'), workouts: life.workouts, studySessions: life.studySessions, papers: life.papers, transactions: life.transactions, settings: life.settings, bike: read('bike') };
  }
  function watch(onChange, onError) {
    fs.mkdirSync(paths.dir, { recursive: true });
    for (const key of ['todos', 'bike', 'life']) fingerprints.set(key, fingerprint(key));
    // Watch the directory, not an inode: atomic rename from the CLI/editor stays observable.
    watcher = fs.watch(paths.dir, { persistent: false }, (_event, filename) => {
      if (filename && !['todos', 'bike', 'life'].some(key => path.basename(paths[key]) === String(filename))) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const key of ['todos', 'bike', 'life']) {
          const next = fingerprint(key);
          if (fingerprints.get(key) === next) continue;
          fingerprints.set(key, next);
          try { onChange(key, read(key)); }
          catch { onError?.(key); }
        }
      }, 80);
      timer.unref?.();
    });
    watcher.on('error', () => onError?.('watcher'));
  }
  function close() { clearTimeout(timer); watcher?.close(); }
  return { paths, read, mutate, state, watch, close };
}

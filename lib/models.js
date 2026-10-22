import { randomUUID } from 'node:crypto';
import { AppError, fail, has, object, text, number, enumeration, boolean, date, interval, newSession, money, localToday, rejectManaged, httpUrl } from './validation.js';
import { defaultSettings } from './store.js';

const stamp = (prefix, now) => ({ id: `${prefix}-${randomUUID()}`, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
const optionalText = (body, result, fields) => {
  for (const key of fields) if (has(body, key)) result[key] = text(body[key], key);
};
function entries(record) {
  if (record.timeEntries === undefined) return [];
  if (!Array.isArray(record.timeEntries)) throw new AppError(503, '已有时段数据格式无效，未修改记录', 'STORAGE_ERROR');
  return record.timeEntries;
}
function prepare(body) {
  object(body);
  rejectManaged(body);
}
function complete(result, body, existing, now, isPaper = false) {
  const requested = isPaper ? has(body, 'status') && body.status === 'completed' : body.completed === true;
  const alreadyDone = isPaper ? existing?.status === 'completed' : existing?.completed === true;
  if (requested && alreadyDone) fail('记录已经完成；请先撤销完成再记录新的完成时段', 409, 'ALREADY_COMPLETED');
  if (has(body, 'completion') && !requested) fail('completion 只能与完成操作一起提交');
  if (requested) {
    const entry = newSession(body.completion, now);
    result.timeEntries = [...entries(existing || result), entry];
    result.completedAt = new Date(now).toISOString();
  } else if ((isPaper && has(body, 'status') && body.status !== 'completed') || (!isPaper && body.completed === false)) {
    result.completedAt = null;
  }
  return result;
}
export function createTodo(body, now = Date.now()) {
  prepare(body);
  if (body.completed === true || has(body, 'completion')) fail('新建待办不能直接标记完成；请创建后携带 completion 更新');
  const result = {
    ...stamp('todo', now), title: '', date: localToday(new Date(now)), time: '', priority: 'medium', category: '工作',
    module: 'life', subject: '', estimatedMinutes: null, notes: '', content: '', links: [], images: [],
    completed: false, completedAt: null, timeEntries: [], source: 'phone'
  };
  const todo = todoFields(result, body);
  text(todo.title, 'title', { required: true });
  if (!has(body, 'content') && has(body, 'notes')) todo.content = todo.notes;
  return complete(todo, body, undefined, now);
}
function todoFields(result, body) {
  if (has(body, 'title')) result.title = text(body.title, 'title', { required: true });
  if (has(body, 'date')) result.date = date(body.date);
  if (has(body, 'time')) {
    if (typeof body.time !== 'string' || (body.time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time))) fail('time 必须为空或 HH:mm');
    result.time = body.time;
  }
  if (has(body, 'priority')) result.priority = enumeration(body.priority, 'priority', ['low', 'medium', 'high']);
  if (has(body, 'module')) result.module = enumeration(body.module, 'module', ['life', 'learning', 'research', 'training']);
  if (has(body, 'estimatedMinutes')) result.estimatedMinutes = body.estimatedMinutes === null ? null : number(body.estimatedMinutes, 'estimatedMinutes', { positive: true });
  if (has(body, 'completed')) result.completed = boolean(body.completed, 'completed');
  optionalText(body, result, ['category', 'subject', 'notes', 'content', 'source']);
  if (has(body, 'links')) {
    if (!Array.isArray(body.links)) fail('links 必须是数组');
    result.links = body.links.map(link => {
      if (typeof link === 'string') return httpUrl(link, 'link');
      object(link, 'link');
      return { ...link, title: has(link, 'title') ? text(link.title, 'link.title') : '', url: httpUrl(link.url, 'link.url') };
    });
  }
  if (has(body, 'images')) {
    if (!Array.isArray(body.images)) fail('images 必须是数组');
    result.images = body.images.map(value => text(value, 'image'));
  }
  return result;
}
export function updateTodo(existing, body, now = Date.now()) {
  prepare(body);
  return complete(todoFields({ ...existing, updatedAt: new Date(now).toISOString() }, body), body, existing, now);
}
export function appendSession(existing, body, now = Date.now()) {
  const entry = newSession(body, now);
  return { record: { ...existing, timeEntries: [...entries(existing), entry], updatedAt: new Date(now).toISOString() }, entry };
}

function exercises(value) {
  if (!Array.isArray(value)) fail('exercises 必须是数组');
  return value.map((item, index) => {
    object(item, `exercises[${index}]`);
    const result = { name: text(item.name, 'exercise.name', { required: true }) };
    for (const key of ['sets', 'reps', 'weightKg', 'durationMinutes', 'distanceKm']) {
      if (has(item, key)) result[key] = number(item[key], `exercise.${key}`, { integer: ['sets', 'reps'].includes(key), positive: ['sets', 'reps'].includes(key) });
    }
    return result;
  });
}
function workoutFields(result, body, now) {
  optionalText(body, result, ['location', 'notes']);
  if (has(body, 'title')) result.title = text(body.title, 'title', { required: true });
  if (has(body, 'type')) result.type = enumeration(body.type, 'type', ['cardio', 'strength', 'mixed']);
  if (has(body, 'intensity')) result.intensity = body.intensity === null ? null : number(body.intensity, 'intensity', { min: 1, max: 10, integer: true });
  if (has(body, 'energy')) result.energy = body.energy === null ? null : number(body.energy, 'energy', { min: 1, max: 10, integer: true });
  if (has(body, 'exercises')) result.exercises = exercises(body.exercises);
  for (const key of ['startAt', 'endAt', 'durationMinutes']) if (has(body, key)) result[key] = body[key];
  text(result.title, 'title', { required: true });
  enumeration(result.type, 'type', ['cardio', 'strength', 'mixed']);
  Object.assign(result, interval(result, now, { allowFuture: true }));
  return result;
}
function studyFields(result, body, now) {
  optionalText(body, result, ['topic', 'resource', 'notes']);
  if (has(body, 'subject')) result.subject = text(body.subject, 'subject', { required: true });
  if (has(body, 'energy')) result.energy = body.energy === null ? null : number(body.energy, 'energy', { min: 1, max: 10, integer: true });
  text(result.subject, 'subject', { required: true });
  for (const key of ['startAt', 'endAt', 'durationMinutes']) if (has(body, key)) result[key] = body[key];
  Object.assign(result, interval(result, now, { allowFuture: true }));
  return result;
}
function paperFields(result, body) {
  if (has(body, 'title')) result.title = text(body.title, 'title', { required: true });
  text(result.title, 'title', { required: true });
  optionalText(body, result, ['field', 'question', 'method', 'findings', 'notes']);
  if (has(body, 'authors')) {
    result.authors = Array.isArray(body.authors) ? body.authors.map(author => text(author, 'author', { required: true })) : text(body.authors, 'authors');
  }
  if (has(body, 'year')) result.year = body.year === null ? null : number(body.year, 'year', { min: 1, max: 9999, integer: true });
  if (has(body, 'url')) result.url = httpUrl(body.url, 'url');
  if (has(body, 'status')) result.status = enumeration(body.status, 'status', ['queued', 'reading', 'completed']);
  return result;
}
function transactionFields(result, body) {
  if (has(body, 'type')) result.type = enumeration(body.type, 'type', ['expense', 'income', 'investment']);
  enumeration(result.type, 'type', ['expense', 'income', 'investment']);
  if (has(body, 'category')) result.category = text(body.category, 'category', { required: true });
  text(result.category, 'category', { required: true });
  if (has(body, 'amount')) result.amount = body.amount;
  result.amountCents = money(result.amount);
  if (has(body, 'date')) result.date = date(body.date);
  date(result.date);
  if (has(body, 'necessary')) result.necessary = boolean(body.necessary, 'necessary');
  optionalText(body, result, ['note', 'account', 'asset']);
  return result;
}
const definitions = {
  workouts: { prefix: 'workout', defaults: () => ({ title: '', type: 'mixed', location: '', intensity: null, energy: null, notes: '', exercises: [] }), fields: workoutFields },
  studySessions: { prefix: 'study', defaults: () => ({ subject: '', topic: '', resource: '', energy: null, notes: '' }), fields: studyFields },
  papers: { prefix: 'paper', defaults: () => ({ title: '', authors: [], year: null, url: '', field: '', status: 'queued', question: '', method: '', findings: '', notes: '', completedAt: null, timeEntries: [] }), fields: paperFields },
  transactions: { prefix: 'transaction', defaults: () => ({ type: 'expense', category: '', note: '', necessary: false, account: '', asset: '' }), fields: transactionFields }
};
export function createEntity(kind, body, now = Date.now()) {
  prepare(body);
  if (kind === 'transactions' && has(body, 'amountCents')) fail('amountCents 由 amount 计算');
  if (kind !== 'papers' && has(body, 'completion')) fail('此实体不接受 completion');
  const def = definitions[kind];
  const result = def.fields({ ...stamp(def.prefix, now), ...def.defaults() }, body, now);
  return kind === 'papers' ? complete(result, body, undefined, now, true) : result;
}
export function updateEntity(kind, existing, body, now = Date.now()) {
  prepare(body);
  if (kind === 'transactions' && has(body, 'amountCents')) fail('amountCents 由 amount 计算');
  if (kind !== 'papers' && has(body, 'completion')) fail('此实体不接受 completion');
  const result = definitions[kind].fields({ ...existing, updatedAt: new Date(now).toISOString() }, body, now);
  return kind === 'papers' ? complete(result, body, existing, now, true) : result;
}
export function updateSettings(existing, body, now = Date.now()) {
  object(body);
  const result = { ...defaultSettings(), ...existing };
  for (const key of Object.keys(body)) if (!['monthlyBudget', 'currency', 'budgets'].includes(key)) fail(`不支持的设置字段: ${key}`);
  if (has(body, 'monthlyBudget')) { money(body.monthlyBudget, 'monthlyBudget', { allowZero: true }); result.monthlyBudget = body.monthlyBudget; }
  if (has(body, 'currency')) result.currency = enumeration(body.currency, 'currency', ['CNY']);
  if (has(body, 'budgets')) {
    object(body.budgets, 'budgets');
    const values = [];
    for (const [key, value] of Object.entries(body.budgets)) {
      text(key, '预算分类', { required: true });
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('预算分类名称无效');
      money(value, `budgets.${key}`, { allowZero: true });
      values.push([key, value]);
    }
    result.budgets = Object.fromEntries(values); // Explicit replacement allows clearing categories with {}.
  }
  return { ...result, updatedAt: new Date(now).toISOString() };
}
export function parkBike(existing, body, now = Date.now()) {
  object(body);
  const timestamp = new Date(now).toISOString();
  const latitude = number(body.latitude, 'latitude', { min: -90, max: 90 });
  const longitude = number(body.longitude, 'longitude', { min: -180, max: 180 });
  const accuracy = body.accuracy == null ? null : number(body.accuracy, 'accuracy（米）');
  return {
    ...existing, id: existing.id || `bike-${randomUUID()}`, createdAt: existing.createdAt || timestamp,
    updatedAt: timestamp, active: true, latitude, longitude, accuracy, timestamp,
    note: has(body, 'note') ? text(body.note, 'note') : '', photo: body.photo == null ? null : text(body.photo, 'photo'), retrievedAt: null
  };
}
export function clearBike(existing, now = Date.now()) {
  const timestamp = new Date(now).toISOString();
  return { ...existing, id: existing.id || `bike-${randomUUID()}`, createdAt: existing.createdAt || timestamp, updatedAt: timestamp, active: false, retrievedAt: timestamp };
}

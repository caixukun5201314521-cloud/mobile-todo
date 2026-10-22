import { fail, date, number } from './validation.js';

export const DATA_DICTIONARY = {
  todos: 'Plan 时段：todo.date 是计划日期（不按时区移位）；todo.timeEntries 是完成/补记历史。按 from/to 选 todo 母记录，再将随附 timeEntries 限为发生时间在范围内；与 timeEntries dataset 独立筛选。保留全部 legacy/未知字段。',
  durationMinutes: '时长，单位为分钟；适用于 todo/paper 单个时段、workout 整场训练、studySession 整次学习及 workout 单个 exercise；不可跨层级重复加总。',
  energy: '主观能量等级，整数 1..10，无物理单位。intensity 同为 1..10 的主观训练强度等级。',
  timezoneOffsetMinutes: '直接传入 Date.getTimezoneOffset() 的值；未传 IANA timezone 时，当地墙上日期 = UTC 时间减去 timezoneOffsetMinutes 分钟，例如上海 -480。若提供 timezone IANA ID 则按该时区规则（含 DST）优先。',
  timeEntries: '按 startAt 经 timezoneOffsetMinutes 映射的本地日期过滤，不受 todo.date 计划日期限制。扁平行保留时段全部字段，并添加 ownerType（todo/paper）、ownerId、ownerTitle、module/subject/status。JSON/CSV 的 selected 使用相同筛选；母记录另列于 data.relatedTodos / data.relatedPapers，不改变 data.todos 的计划日语义。跨午夜时段按开始当地日期归属。',
  workouts: '按 startAt 当地日期过滤；母训练连同 exercises 返回。时间范围筛选时，以母记录开始时间为准。durationMinutes 是整场训练分钟数。',
  exercises: '从符合 startAt 当地日期过滤条件的 workouts 展开；保留运动明细全部字段并添加 workoutId、workoutTitle、startAt。sets 单位为组，reps 为次数，weightKg 为千克，distanceKm 为千米，exercise.durationMinutes 为该动作分钟数；不可将练习时间与整场 workouts.durationMinutes 相加重复统计。',
  studySessions: '按 startAt 当地日期过滤；主题、资源和笔记跟随时段母记录；durationMinutes 单位为分钟，energy（若提供）为 1 至 10 等级。',
  papers: '无时间范围时保留论文及所有阅读 timeEntries；有范围时仅选创建日期或至少一个阅读时段日期命中的论文，并只附带范围内阅读时段。',
  transactions: '按记账 date (YYYY-MM-DD) 过滤，与查看者时区无关；amount 为货币单位，amountCents 为整数分，精确至两位小数。',
  settings: '偏好与每月预算。monthlyBudget 是 CNY 月度规划数值而非流水；不按月份追溯历史预算，不进行建议或投资解释。',
  bike: '当前单车位置/归档状态；不是个人活动日期过滤记录。',
  dataset: 'JSON/Markdown 包含 schemaVersion、导出时间、时区偏移、全部实体/bike 与数据字典。selected 是 data[dataset] 的重复视图；relatedTodos / relatedPapers 是关联原记录，timeEntries、data.todos、related* 与 selected 可能展示同一实体的不同视图，汇总时须按实体 id / 时段 id 去重，绝不可将这些数组相加。timeEntries / exercises 是展开视图；母子关联通过 ownerId / todoId / paperId / workoutId 表示。独立 timeEntries 导出所需母记录在 relatedTodos / relatedPapers 引用，不改变按计划日筛选的 data.todos。'
};

function filtersFrom(query) {
  const timezoneOffsetMinutes = query.timezoneOffsetMinutes === undefined ? 0 : Number(query.timezoneOffsetMinutes);
  if (!Number.isInteger(timezoneOffsetMinutes) || Math.abs(timezoneOffsetMinutes) > 840) fail('timezoneOffsetMinutes 必须是 -840 至 840 的整数');
  const timezone = query.timezone === undefined ? null : query.timezone;
  if (timezone !== null) {
    if (typeof timezone !== 'string' || !timezone.trim() || timezone.length > 100) fail('timezone 必须是有效 IANA 时区');
    try { new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()); }
    catch { fail('timezone 必须是有效 IANA 时区'); }
  }
  const from = query.from === undefined ? null : date(query.from, 'from');
  const to = query.to === undefined ? null : date(query.to, 'to');
  if (from && to && from > to) fail('from 不能晚于 to');
  const datasets = ['todos', 'timeEntries', 'workouts', 'exercises', 'studySessions', 'papers', 'transactions'];
  const dataset = query.dataset === undefined ? 'todos' : query.dataset;
  if (!datasets.includes(dataset)) fail(`dataset 必须是 ${datasets.join(' / ')}`);
  const format = query.format === undefined ? 'json' : query.format;
  if (!['json', 'csv', 'markdown'].includes(format)) fail('format 必须是 json / csv / markdown');
  return { dataset, format, from, to, timezoneOffsetMinutes, timezone };
}
function localDate(instant, filter) {
  if (!instant || typeof instant !== 'string') return null;
  const ms = Date.parse(instant);
  if (!Number.isFinite(ms)) return null;
  if (filter.timezone) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: filter.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ms);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
  return new Date(ms - filter.timezoneOffsetMinutes * 60_000).toISOString().slice(0, 10);
}
function inRange(day, filter) { return Boolean(day && (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to)); }
function inTimeRange(start, filter) {
  if (!filter.from && !filter.to) return true;
  return inRange(localDate(start, filter), filter);
}
function filterSessions(entries, filter) {
  const source = Array.isArray(entries) ? entries : [];
  return source.filter(item => inTimeRange(item.startAt, filter));
}
const cleanNested = (item, filter) => ({ ...item, timeEntries: filterSessions(item.timeEntries, filter) });
function filterRows(state, filter) {
  const allTodos = Array.isArray(state.todos) ? state.todos : [];
  const allWorkouts = Array.isArray(state.workouts) ? state.workouts : [];
  const allStudy = Array.isArray(state.studySessions) ? state.studySessions : [];
  const allPapers = Array.isArray(state.papers) ? state.papers : [];
  const allTransactions = Array.isArray(state.transactions) ? state.transactions : [];
  const todos = allTodos.filter(row => (!filter.from && !filter.to) || inRange(row.date, filter)).map(row => cleanNested(row, filter));
  const workouts = allWorkouts.filter(row => inTimeRange(row.startAt, filter));
  const studySessions = allStudy.filter(row => inTimeRange(row.startAt, filter));
  const papers = allPapers.filter(row => {
    if (!filter.from && !filter.to) return true;
    const sessions = filterSessions(row.timeEntries, filter);
    return sessions.length > 0 || inTimeRange(row.createdAt, filter);
  }).map(row => cleanNested(row, filter));
  const transactions = allTransactions.filter(row => (!filter.from && !filter.to) || inRange(row.date, filter));
  // A session's actual local start date is independent of a todo's planned date.
  const relatedTodos = allTodos.map(row => ({ ...row, timeEntries: filterSessions(row.timeEntries, filter) })).filter(row => row.timeEntries.length > 0);
  const relatedPapers = allPapers.map(row => ({ ...row, timeEntries: filterSessions(row.timeEntries, filter) })).filter(row => row.timeEntries.length > 0);
  const timeEntries = [
    ...relatedTodos.flatMap(row => row.timeEntries.map(entry => ({ ...entry, ownerType: 'todo', ownerId: row.id, ownerTitle: row.title, todoId: row.id, module: row.module ?? null, subject: row.subject ?? null }))),
    ...relatedPapers.flatMap(row => row.timeEntries.map(entry => ({ ...entry, ownerType: 'paper', ownerId: row.id, ownerTitle: row.title, paperId: row.id, status: row.status ?? null })))
  ];
  const exercises = workouts.flatMap(row => (Array.isArray(row.exercises) ? row.exercises : []).map(exercise => ({ ...exercise, workoutId: row.id, workoutTitle: row.title, startAt: row.startAt })));
  return { todos, timeEntries, relatedTodos, relatedPapers, workouts, exercises, studySessions, papers, transactions, settings: state.settings, bike: state.bike };
}
export function buildExport(state, query = {}, now = new Date()) {
  const filters = filtersFrom(query);
  const rows = filterRows(state, filters);
  const selected = rows[filters.dataset];
  const timezone = {
    timezoneOffsetMinutes: filters.timezoneOffsetMinutes,
    ianaTimezone: filters.timezone,
    dateBasis: filters.timezone ? 'IANA timezone rules (DST-aware)' : 'UTC minus timezoneOffsetMinutes',
    meaning: 'Date.getTimezoneOffset() value; local wall time = UTC - timezoneOffsetMinutes minutes (Shanghai: -480)'
  };
  const envelope = {
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    timezone,
    filters: { from: filters.from, to: filters.to, dataset: filters.dataset, timezone: filters.timezone, timezoneOffsetMinutes: filters.timezoneOffsetMinutes },
    dataDictionary: DATA_DICTIONARY,
    data: rows,
    selected
  };
  if (filters.format === 'json') return { contentType: 'application/json; charset=utf-8', filename: `mobile-todo-${filters.dataset}.json`, body: JSON.stringify(envelope, null, 2) };
  if (filters.format === 'csv') return { contentType: 'text/csv; charset=utf-8', filename: `mobile-todo-${filters.dataset}.csv`, body: csv(filters.dataset, selected) };
  const counts = Object.fromEntries(Object.entries(rows).map(([key, value]) => [key, Array.isArray(value) ? value.length : value && typeof value === 'object' ? 1 : 0]));
  const markdown = `# Mobile Todo Agent Export\n\n- Schema: ${envelope.schemaVersion}\n- Exported at: ${envelope.exportedAt}\n- Timezone offset: ${timezone.timezoneOffsetMinutes} minutes (local = UTC - Date.getTimezoneOffset(); Shanghai -480)\n- Dataset: ${filters.dataset}\n- Date filters: ${filters.from || 'no lower bound'} through ${filters.to || 'no upper bound'}\n\n## Data dictionary and filtering\n\n${Object.entries(DATA_DICTIONARY).map(([key, value]) => `- **${key}**: ${value}`).join('\n')}\n\n## Summary\n\n${Object.entries(counts).map(([key, value]) => `- ${key}: ${value}`).join('\n')}\n\n## Complete JSON record set\n\n\`\`\`json\n${JSON.stringify(envelope, null, 2)}\n\`\`\`\n`;
  return { contentType: 'text/markdown; charset=utf-8', filename: `mobile-todo-${filters.dataset}.md`, body: markdown };
}
const columns = {
  todos: ['id', 'title', 'date', 'time', 'priority', 'category', 'module', 'subject', 'estimatedMinutes', 'completed', 'completedAt', 'timeEntries', 'notes', 'content', 'links', 'images', 'createdAt', 'updatedAt'],
  timeEntries: ['id', 'ownerType', 'ownerId', 'ownerTitle', 'todoId', 'paperId', 'module', 'subject', 'status', 'startAt', 'endAt', 'durationMinutes', 'notes', 'energy', 'createdAt', 'updatedAt'],
  workouts: ['id', 'title', 'type', 'startAt', 'endAt', 'durationMinutes', 'location', 'intensity', 'notes', 'exercises', 'createdAt', 'updatedAt'],
  exercises: ['workoutId', 'workoutTitle', 'startAt', 'name', 'sets', 'reps', 'weightKg', 'durationMinutes', 'distanceKm'],
  studySessions: ['id', 'subject', 'topic', 'startAt', 'endAt', 'durationMinutes', 'resource', 'notes', 'createdAt', 'updatedAt'],
  papers: ['id', 'title', 'authors', 'year', 'url', 'field', 'status', 'question', 'method', 'findings', 'notes', 'completedAt', 'timeEntries', 'createdAt', 'updatedAt'],
  transactions: ['id', 'type', 'category', 'amount', 'amountCents', 'date', 'note', 'necessary', 'account', 'asset', 'createdAt', 'updatedAt']
};
function safe(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  return /^[\s\u0000-\u001f﻿]*[=+\-@]/u.test(text) ? `'${text}` : text;
}
function csv(dataset, values) {
  const keys = columns[dataset];
  const record = (values ?? []).map(row => keys.map(key => {
    const value = safe(row?.[key]);
    return `"${value.replaceAll('"', '""')}"`;
  }).join(','));
  return `﻿${[keys.map(key => `"${key}"`).join(','), ...record].join('\r\n')}\r\n`;
}

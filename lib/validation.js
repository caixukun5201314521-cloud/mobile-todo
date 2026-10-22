import { randomUUID } from 'node:crypto';

export class AppError extends Error {
  constructor(status, message, code = 'VALIDATION_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const fail = (message, status = 400, code) => { throw new AppError(status, message, code); };
export const has = (obj, key) => Object.hasOwn(obj, key);
export const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export function object(value, name = 'body') {
  if (!isObject(value)) fail(`${name} 必须是对象`);
  return value;
}
export function text(value, name, { required = false } = {}) {
  if (typeof value !== 'string' || (required && !value.trim())) fail(`${name} 必须是${required ? '非空' : ''}字符串`);
  return value.trim();
}
export function number(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false, positive = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (positive && value <= 0) || (integer && !Number.isSafeInteger(value))) {
    fail(`${name} 数值或单位无效`);
  }
  return value;
}
export function enumeration(value, name, values) {
  if (!values.includes(value)) fail(`${name} 必须是 ${values.join(' / ')}`);
  return value;
}
export function boolean(value, name) {
  if (typeof value !== 'boolean') fail(`${name} 必须是布尔值`);
  return value;
}
export function date(value, name = 'date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${name} 必须是有效 YYYY-MM-DD 日期`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(`${name} 日期无效`);
  return value;
}
export function iso(value, name) {
  if (typeof value !== 'string') fail(`${name} 必须是带时区的 ISO 时间`);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  const offsetHour = +(match?.[8] || 0), offsetMinute = +(match?.[9] || 0);
  if (!match || +match[2] > 23 || +match[3] > 59 || +(match[4] || 0) > 59 || offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) fail(`${name} 必须是有效且带时区的 ISO 时间`);
  date(match[1], name);
  if (!Number.isFinite(Date.parse(value))) fail(`${name} 时间无效`);
  return value;
}
export function interval(input, now = Date.now(), { allowFuture = false } = {}) {
  object(input, '时段');
  const startAt = iso(input.startAt, 'startAt');
  const endAt = iso(input.endAt, 'endAt');
  const start = Date.parse(startAt), end = Date.parse(endAt);
  if (end < start) fail('endAt 不能早于 startAt');
  if (!allowFuture && end > now + 60_000) fail('endAt 不能在未来（容忍一分钟）');
  const durationMinutes = number(input.durationMinutes, 'durationMinutes（分钟）', { positive: true });
  if (durationMinutes > (end - start) / 60_000 + 1e-9) fail('durationMinutes 不能超过起止时间段的分钟数');
  return { startAt, endAt, durationMinutes };
}
export function session(input, now = Date.now()) {
  const times = interval(input, now);
  return {
    ...times,
    notes: has(input, 'notes') ? text(input.notes, 'notes') : '',
    energy: input.energy == null ? null : number(input.energy, 'energy', { min: 1, max: 10, integer: true })
  };
}
export function newSession(input, now = Date.now()) {
  const validated = session(input, now);
  const timestamp = new Date(now).toISOString();
  return { id: `session-${randomUUID()}`, ...validated, createdAt: timestamp, updatedAt: timestamp };
}
export function money(value, name = 'amount', { allowZero = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) fail(`${name} 必须是${allowZero ? '非负' : '正'}金额`);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) fail(`${name} 最多保留两位小数`);
  // Parse decimal digits into integer cents; never validate via floating point rounding.
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) fail(`${name} 超出安全金额范围`);
  return Number(cents);
}
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function rejectManaged(input, extra = []) {
  for (const key of ['id', 'createdAt', 'updatedAt', 'completedAt', 'timeEntries', ...extra]) {
    if (has(input, key)) fail(`${key} 由服务器管理；时段请使用 sessions 或 completion`);
  }
}
export function httpUrl(value, name) {
  const result = text(value, name);
  if (result) {
    let parsed;
    try { parsed = new URL(result); } catch { fail(`${name} 必须是 HTTP(S) URL`); }
    if (!['http:', 'https:'].includes(parsed.protocol)) fail(`${name} 必须是 HTTP(S) URL`);
  }
  return result;
}

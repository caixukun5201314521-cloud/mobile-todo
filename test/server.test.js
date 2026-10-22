import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server.js';
import { buildExport } from '../lib/exports.js';

let tempDir;
let running;
let base;
const key = 'test-secret';
const headers = { 'content-type': 'application/json', 'x-api-key': key };
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
async function request(url, options = {}) {
  const response = await fetch(`${base}${url}`, options);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  let body;
  try { body = JSON.parse(text.replace(/^﻿/, '')); } catch { body = text; }
  return { response, body, text, bytes };
}
async function json(url, method = 'GET', body, withKey = true) {
  return request(url, { method, headers: withKey ? headers : { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-todo-server-'));
  running = await startServer({ dataPath: tempDir, host: '127.0.0.1', port: 0, apiKey: key });
  base = `http://127.0.0.1:${running.server.address().port}`;
});
afterAll(async () => {
  await running?.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('life backend API', () => {
  test('protects personal API but leaves network metadata public', async () => {
    const unauthenticated = await json('/api/state', 'GET', undefined, false);
    expect(unauthenticated.response.status).toBe(401);
    const network = await json('/api/network', 'GET', undefined, false);
    expect(network.response.status).toBe(200);
    expect(network.body.primaryUrl).toContain('http://');
    const events = await json('/api/events', 'GET', undefined, false);
    expect(events.response.status).toBe(401);
  });

  test('requires completion interval and preserves history through undo/recomplete', async () => {
    const created = await json('/api/todos', 'POST', {
      title: '=SUM(1),"quote"', date: '2025-04-01', module: 'learning', subject: 'Python', estimatedMinutes: 30,
      category: '学习', content: '<not html>', links: ['https://example.com/a?x=1'], images: ['image.png']
    });
    expect(created.response.status).toBe(201);
    const id = created.body.todo.id;
    const file = path.join(tempDir, 'todos.json');
    const beforeInvalid = fs.readFileSync(file, 'utf8');
    const missing = await json(`/api/todos/${id}`, 'PATCH', { completed: true });
    expect(missing.response.status).toBe(400);
    expect(fs.readFileSync(file, 'utf8')).toBe(beforeInvalid);

    const completed = await json(`/api/todos/${id}`, 'PATCH', {
      completed: true,
      completion: { startAt: '2025-04-02T23:30:00+00:00', endAt: '2025-04-03T00:30:00+00:00', durationMinutes: 60, notes: 'deep work', energy: 8 }
    });
    expect(completed.response.status).toBe(200);
    expect(completed.body.todo.completed).toBe(true);
    expect(completed.body.todo.timeEntries).toHaveLength(1);
    const afterComplete = fs.readFileSync(file, 'utf8');
    const duplicate = await json(`/api/todos/${id}`, 'PATCH', {
      completed: true,
      completion: { startAt: '2025-04-04T00:00:00Z', endAt: '2025-04-04T00:30:00Z', durationMinutes: 30 }
    });
    expect(duplicate.response.status).toBe(409);
    expect(fs.readFileSync(file, 'utf8')).toBe(afterComplete);

    const undone = await json(`/api/todos/${id}`, 'PATCH', { completed: false });
    expect(undone.response.status).toBe(200);
    expect(undone.body.todo.completed).toBe(false);
    expect(undone.body.todo.timeEntries).toHaveLength(1);
    const recompleted = await json(`/api/todos/${id}`, 'PATCH', {
      completed: true,
      completion: { startAt: '2025-04-05T00:00:00Z', endAt: '2025-04-05T00:20:00Z', durationMinutes: 20, energy: 6 }
    });
    expect(recompleted.response.status).toBe(200);
    expect(recompleted.body.todo.timeEntries).toHaveLength(2);

    const crossMidnight = await json('/api/todos', 'POST', { title: '跨午夜', date: '2025-04-01' });
    const interval = await json(`/api/todos/${crossMidnight.body.todo.id}`, 'PATCH', {
      completed: true,
      completion: { startAt: '2025-04-01T23:30:00Z', endAt: '2025-04-02T00:30:00Z', durationMinutes: 60 }
    });
    expect(interval.response.status).toBe(200);

    const appended = await json(`/api/todos/${id}/sessions`, 'POST', {
      startAt: '2025-04-06T00:00:00Z', endAt: '2025-04-06T00:10:00Z', durationMinutes: 10, notes: '补记'
    });
    expect(appended.response.status).toBe(201);
    expect(appended.body.todo.timeEntries).toHaveLength(3);
  });

  test('validates CRUD entities, money units, and does not write invalid updates', async () => {
    const workout = await json('/api/workouts', 'POST', {
      title: 'Mixed training', type: 'mixed', startAt: '2025-05-01T09:00:00Z', endAt: '2025-05-01T10:00:00Z', durationMinutes: 60,
      location: 'Gym', intensity: 7, energy: 8, notes: 'steady', exercises: [{ name: 'Squat', sets: 3, reps: 8, weightKg: 40, durationMinutes: 15, distanceKm: 0 }]
    });
    expect(workout.response.status).toBe(201);
    const lifeFile = path.join(tempDir, 'life.json');
    const beforeInvalid = fs.readFileSync(lifeFile, 'utf8');
    const invalidWorkout = await json(`/api/workouts/${workout.body.workout.id}`, 'PATCH', { intensity: 11 });
    expect(invalidWorkout.response.status).toBe(400);
    expect(fs.readFileSync(lifeFile, 'utf8')).toBe(beforeInvalid);
    const patchedWorkout = await json(`/api/workouts/${workout.body.workout.id}`, 'PATCH', { notes: 'updated' });
    expect(patchedWorkout.response.status).toBe(200);
    expect((await json(`/api/workouts/${workout.body.workout.id}`)).body.workout.notes).toBe('updated');

    const study = await json('/api/study-sessions', 'POST', {
      subject: 'Python', topic: 'pandas', startAt: '2025-05-02T09:00:00+08:00', endAt: '2025-05-02T10:00:00+08:00', durationMinutes: 60, resource: 'book'
    });
    expect(study.response.status).toBe(201);
    expect((await json(`/api/study-sessions/${study.body.studySession.id}`, 'PATCH', { topic: 'numpy' })).response.status).toBe(200);

    const paper = await json('/api/papers', 'POST', { title: 'Causal paper', authors: ['A'], year: 2024, status: 'reading', field: '计量经济学' });
    expect(paper.response.status).toBe(201);
    const paperId = paper.body.paper.id;
    expect((await json(`/api/papers/${paperId}/sessions`, 'POST', { startAt: '2025-05-03T09:00:00Z', endAt: '2025-05-03T09:30:00Z', durationMinutes: 30, energy: 5 })).response.status).toBe(201);
    const paperDone = await json(`/api/papers/${paperId}`, 'PATCH', { status: 'completed', completion: { startAt: '2025-05-03T09:30:00Z', endAt: '2025-05-03T10:00:00Z', durationMinutes: 30 } });
    expect(paperDone.response.status).toBe(200);
    // Editing a completed paper without status is allowed and does not create a duplicate completion.
    const paperEdit = await json(`/api/papers/${paperId}`, 'PATCH', { notes: 'edited after completion' });
    expect(paperEdit.response.status).toBe(200);
    expect(paperEdit.body.paper.timeEntries).toHaveLength(2);
    expect((await json(`/api/papers/${paperId}`, 'PATCH', { status: 'completed', completion: { startAt: '2025-05-03T11:00:00Z', endAt: '2025-05-03T11:10:00Z', durationMinutes: 10 } })).response.status).toBe(409);

    const transaction = await json('/api/transactions', 'POST', { type: 'expense', category: 'food, "quoted"', amount: 12.34, date: '2025-05-04', note: 'meal', necessary: true, account: 'cash' });
    expect(transaction.response.status).toBe(201);
    expect(transaction.body.transaction.amountCents).toBe(1234);
    const invalidMoney = await json('/api/transactions', 'POST', { type: 'expense', category: 'bad', amount: 12.345, date: '2025-05-04', necessary: false });
    expect(invalidMoney.response.status).toBe(400);

    const settings = await json('/api/settings', 'PATCH', { monthlyBudget: 4000, currency: 'CNY', budgets: {} });
    expect(settings.response.status).toBe(200);
    expect(settings.body.settings.monthlyBudget).toBe(4000);
    expect((await json(`/api/workouts/${workout.body.workout.id}`, 'DELETE')).response.status).toBe(200);
    expect((await json(`/api/study-sessions/${study.body.studySession.id}`, 'DELETE')).response.status).toBe(200);
    expect((await json(`/api/papers/${paperId}`, 'DELETE')).response.status).toBe(200);
    expect((await json(`/api/transactions/${transaction.body.transaction.id}`, 'DELETE')).response.status).toBe(200);
  });

  test('exports independent time-entry dates, timezone metadata, CSV escaping, and all state', async () => {
    const todo = await json('/api/todos', 'POST', { title: 'planned old day', date: '2025-06-01' });
    await json(`/api/todos/${todo.body.todo.id}/sessions`, 'POST', { startAt: '2025-06-02T00:30:00Z', endAt: '2025-06-02T01:00:00Z', durationMinutes: 30 });
    const timeExport = await json('/api/export?format=json&dataset=timeEntries&from=2025-06-02&to=2025-06-02&timezoneOffsetMinutes=0');
    expect(timeExport.response.status).toBe(200);
    expect(timeExport.body.selected).toHaveLength(1);
    expect(timeExport.body.data.todos).toHaveLength(0);
    expect(timeExport.body.data.relatedTodos).toHaveLength(1);
    expect(timeExport.body.timezone.meaning).toContain('UTC - timezoneOffsetMinutes');

    const shanghai = await json('/api/todos', 'POST', { title: 'timezone item', date: '2025-06-02' });
    await json(`/api/todos/${shanghai.body.todo.id}/sessions`, 'POST', { startAt: '2025-06-01T16:30:00Z', endAt: '2025-06-01T17:00:00Z', durationMinutes: 30 });
    const localExport = await json('/api/export?format=json&dataset=timeEntries&from=2025-06-02&to=2025-06-02&timezoneOffsetMinutes=-480');
    expect(localExport.body.selected.some(item => item.ownerId === shanghai.body.todo.id)).toBe(true);

    const csv = await request('/api/export?format=csv&dataset=todos', { headers: { 'x-api-key': key } });
    expect(csv.response.status).toBe(200);
    expect(Array.from(csv.bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv.text).toContain("'=SUM(1)");
    expect(csv.text).toContain('""quote""');
    const markdown = await request('/api/export?format=markdown&dataset=transactions', { headers: { 'x-api-key': key } });
    expect(markdown.response.status).toBe(200);
    expect(markdown.text).toContain('Complete JSON record set');
    expect(markdown.text).toContain('monthlyBudget');
  });

  test('bike validation and malformed JSON leave files intact, then state persists after restart', async () => {
    const bike = await json('/api/bike', 'POST', { latitude: 31.2, longitude: 121.5, accuracy: 5, note: 'rack' });
    expect(bike.response.status).toBe(200);
    expect((await json('/api/bike')).body.bike.active).toBe(true);
    const bikeBad = await json('/api/bike', 'POST', { latitude: 100, longitude: 0 });
    expect(bikeBad.response.status).toBe(400);
    const malformed = await request('/api/todos', { method: 'POST', headers, body: '{bad json' });
    expect(malformed.response.status).toBe(400);
    expect(readJson(path.join(tempDir, 'todos.json'))).toBeArray();
    const old = running;
    await old.close();
    running = await startServer({ dataPath: tempDir, host: '127.0.0.1', port: 0, apiKey: key });
    base = `http://127.0.0.1:${running.server.address().port}`;
    const state = await json('/api/state');
    expect(state.response.status).toBe(200);
    expect(state.body.todos.length).toBeGreaterThan(0);
    expect(state.body.bike.active).toBe(true);
  });
});

describe('export utility timezone relation', () => {
  test('uses UTC minus Date.getTimezoneOffset and retains legacy fields', () => {
    const state = { todos: [{ id: 't', title: 'old', date: '2025-01-01', customLegacy: 'keep', timeEntries: [{ id: 'e', startAt: '2025-01-01T16:30:00Z', endAt: '2025-01-01T17:00:00Z', durationMinutes: 30 }] }], workouts: [], studySessions: [], papers: [], transactions: [], settings: {}, bike: { active: false } };
    const output = JSON.parse(buildExport(state, { format: 'json', dataset: 'timeEntries', from: '2025-01-02', to: '2025-01-02', timezoneOffsetMinutes: -480 }).body);
    expect(output.selected).toHaveLength(1);
    expect(output.data.relatedTodos[0].customLegacy).toBe('keep');
    expect(output.timezone.meaning).toContain('Shanghai: -480');
    const nyState = { todos: [{ id: 'dst', date: '2025-03-09', timeEntries: [{ id: 'dst-entry', startAt: '2025-03-09T07:30:00Z', endAt: '2025-03-09T08:00:00Z', durationMinutes: 30 }] }], workouts: [], studySessions: [], papers: [], transactions: [], settings: {}, bike: { active: false } };
    const nyOutput = JSON.parse(buildExport(nyState, { format: 'json', dataset: 'timeEntries', from: '2025-03-09', to: '2025-03-09', timezone: 'America/New_York' }).body);
    expect(nyOutput.selected).toHaveLength(1);
  });
});

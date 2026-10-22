import { icons, icon, escapeHtml as esc, localDate, localInput, dateLabel, timeLabel, minutesLabel, money, safeUrl, moduleOf, dueDate, countdown, financeSummary, sumMinutes } from './utils.js';

const NAV = [
  ['overview', '总览', 'home'], ['tasks', '任务清单', 'check'], ['deadlines', '截止倒计时', 'clock'],
  ['training', '训练日志', 'activity'], ['learning', '课外拓展', 'book'], ['papers', '论文阅读', 'paper'],
  ['finance', '财务管理', 'wallet'], ['export', '数据导出', 'download']
];
const SUBJECTS = [
  ['Python', 'Py', '数据处理与编程', 'blue'], ['Stata', 'St', '实证研究工具', 'purple'],
  ['LaTeX', 'TᴇX', '学术写作与排版', 'green'], ['MATLAB', 'M', '数值计算', 'orange'],
  ['经济学', 'Ec', '微观、宏观与理论', 'blue'], ['统计学', 'σ', '概率与统计基础', 'purple'],
  ['计量经济学', 'β', '识别与因果推断', 'green'], ['IELTS', 'Aa', '听说读写的积累', 'orange']
];
const MODULES = { life: '日常事务', learning: '课外拓展', research: '论文研究', training: '训练计划' };
const TYPES = { cardio: '有氧训练', strength: '无氧 / 力量', mixed: '综合训练' };
const state = {
  todos: [], workouts: [], studySessions: [], papers: [], transactions: [], settings: { monthlyBudget: 4000, budgets: {} }, bike: {},
  page: NAV.some(n => n[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'overview',
  selectedDate: localDate(), taskFilter: 'pending', taskModule: 'all', search: '', subject: 'all', paperFilter: 'all',
  financeMonth: localDate().slice(0, 7), transactionType: 'all', workoutDate: '', workoutType: 'all',
  exportFrom: '', exportTo: '', csvDataset: 'todos',
  key: sessionStorage.getItem('daymark_key') || '', loaded: false, online: false
};
const main = document.querySelector('#main');
const dialog = document.querySelector('#appDialog');
let eventSource, refreshTimer, toastTimer, dialogSubmit, currentDialog, fetchSequence = 0;
let clockDay = localDate();

function button(label, action, style = 'secondary', extra = '') { return `<button type="button" class="button button-${style}" data-action="${action}" ${extra}>${label}</button>`; }
function navLink([id, label, glyph], mobile = false) { return `<a href="#${id}" class="${mobile ? 'mobile-nav-link' : 'nav-link'} ${state.page === id ? 'active' : ''}" ${state.page === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${id === 'tasks' && state.todos.filter(t => !t.completed).length ? `<span class="nav-badge">${state.todos.filter(t => !t.completed).length}</span>` : ''}</a>`; }
function renderNavigation() {
  document.querySelector('#mainNav').innerHTML = NAV.map((n, i) => `${i === 3 ? '<p class="nav-section-label">我的积累</p>' : i === 7 ? '<div class="nav-separator"></div>' : ''}${navLink(n)}`).join('');
  document.querySelector('#mobileNav').innerHTML = NAV.filter(n => ['overview', 'tasks', 'training', 'finance'].includes(n[0])).map(n => navLink(n, true)).join('') + `<button class="mobile-nav-link ${['deadlines', 'learning', 'papers', 'export'].includes(state.page) ? 'active' : ''}" data-action="more">${icon('grid')}<span>更多</span></button>`;
  document.querySelector('#pageCrumb').textContent = NAV.find(n => n[0] === state.page)?.[1] || '总览';
  document.title = `${NAV.find(n => n[0] === state.page)?.[1]} · Daymark`;
}
function setOnline(value, label) {
  state.online = value;
  const el = document.querySelector('#syncStatus');
  el.className = `sync-status ${value ? 'online' : 'offline'}`;
  el.innerHTML = `<i></i><span>${esc(label || (value ? '实时同步' : '连接中断'))}</span>`;
}
function toast(message, error = false) {
  clearTimeout(toastTimer);
  const el = document.querySelector('#toastRegion');
  el.innerHTML = `<div class="toast ${error ? 'error' : ''}">${icon(error ? 'alert' : 'check')}<span>${esc(message)}</span></div>`;
  toastTimer = setTimeout(() => { el.innerHTML = ''; }, 4200);
}
async function api(path, method = 'GET', body) {
  let res;
  try {
    res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(state.key ? { 'x-api-key': state.key } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  } catch { setOnline(false); throw new Error('无法连接服务器。请检查网络，已填写的内容会保留。'); }
  if (!res.ok) {
    let data = {}; try { data = await res.json(); } catch { /* A proxy may return HTML. */ }
    const error = new Error(data.error || `请求失败 (${res.status})`); error.status = res.status; throw error;
  }
  return res.json();
}
async function refresh(silent = false) {
  const sequence = ++fetchSequence;
  try {
    const data = await api('/api/state');
    if (sequence !== fetchSequence) return;
    for (const key of ['todos', 'workouts', 'studySessions', 'papers', 'transactions', 'settings', 'bike']) if (data[key] !== undefined) state[key] = data[key];
    state.loaded = true; setOnline(true); render();
  } catch (err) {
    setOnline(false, err.status === 401 ? '需要访问密钥' : '暂时离线');
    if (!state.loaded) main.innerHTML = `<div class="empty-state"><div class="empty-icon">${icon('cloud')}</div><h1>${err.status === 401 ? '连接你的个人空间' : '还没有连接上服务器'}</h1><p>${esc(err.status === 401 ? '此空间启用了访问密钥。输入后即可继续。' : err.message)}</p>${button(err.status === 401 ? '输入访问密钥' : '重新连接', err.status === 401 ? 'auth' : 'retry', 'primary')}</div>`;
    else if (!silent) toast(err.message, true);
  }
}
function connectEvents() {
  eventSource?.close();
  eventSource = new EventSource(`/api/events${state.key ? `?key=${encodeURIComponent(state.key)}` : ''}`);
  eventSource.addEventListener('connected', () => { setOnline(true); if (state.loaded) scheduleRefresh(); });
  for (const type of ['sync', 'todo_added', 'todo_updated', 'todo_deleted', 'bike_updated', 'data_changed']) eventSource.addEventListener(type, scheduleRefresh);
  eventSource.onerror = () => setOnline(false, '正在重新连接');
}
function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refresh(true), 160); }
function render() {
  renderNavigation();
  if (!state.loaded) return;
  const renderers = { overview: overviewPage, tasks: tasksPage, deadlines: deadlinesPage, training: trainingPage, learning: learningPage, papers: papersPage, finance: financePage, export: exportPage };
  main.innerHTML = renderers[state.page]();
}
function heading(kicker, title, sub, action = '') { return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="page-subtitle">${sub}</p></div>${action ? `<div class="heading-actions">${action}</div>` : ''}</div>`; }
function empty(title, description, action = '', glyph = 'spark') { return `<div class="empty-state"><span class="empty-icon">${icon(glyph)}</span><h3>${title}</h3><p>${description}</p>${action}</div>`; }
function stat(label, value, unit, foot, glyph, color = 'blue') { return `<div class="stat-card"><div class="stat-label"><span>${label}</span><span class="stat-icon ${color}">${icon(glyph)}</span></div><div class="stat-value">${value}<span class="stat-unit">${unit}</span></div><p class="stat-footnote">${foot}</p></div>`; }
function taskEntries(todos = state.todos) { return todos.flatMap(t => (t.timeEntries || []).map(s => ({ ...s, taskId: t.id, title: t.title, subject: t.subject || '', module: moduleOf(t) }))); }
function todayMinutes() {
  const today = localDate();
  return sumMinutes([...taskEntries(), ...state.studySessions, ...state.papers.flatMap(p => p.timeEntries || [])].filter(s => localDate(new Date(s.startAt)) === today));
}
function completionCount(date) { return state.todos.filter(t => t.completed && t.completedAt && localDate(new Date(t.completedAt)) === date).length; }
function overviewPage() {
  const today = localDate(), todayTodos = state.todos.filter(t => t.date === today), done = todayTodos.filter(t => t.completed).length;
  const percent = todayTodos.length ? Math.round(done / todayTodos.length * 100) : 0;
  const month = financeSummary(state.transactions, state.settings.monthlyBudget, today.slice(0, 7));
  const upcoming = state.todos.filter(t => !t.completed && dueDate(t)).sort((a,b) => dueDate(a) - dueDate(b)).slice(0, 3);
  const selected = state.todos.filter(t => t.date === state.selectedDate).sort((a,b) => Number(a.completed) - Number(b.completed) || (a.time || '99').localeCompare(b.time || '99'));
  const weekStart = new Date(); weekStart.setHours(0,0,0,0); weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + 6) % 7);
  const weekWorkouts = state.workouts.filter(w => new Date(w.startAt) >= weekStart);
  return heading('A LITTLE BETTER, EVERY DAY', '把日子，过成自己的样子。', `${new Date().toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric', weekday:'long' })} <span class="heading-dot">·</span> 欢迎回到你的个人空间。`) +
    `<section class="hero"><div class="hero-copy"><div class="hero-label">${icon('spark')} 认真生活的每一天，都值得被记录</div><h2 class="hero-title">小小的行动。<br><span>长长的进步。</span></h2><p class="hero-subtitle">从一个待办、一场训练、一页阅读开始。<br>把今天的努力，留给明天的自己。</p><div class="hero-actions">${button(`开始今天 ${icon('arrow')}`, 'go-tasks', 'primary')}${button('记录一段学习', 'new-study', 'plain')}</div><p class="hero-footnote">不必一口气做到最好，只要比昨天多走一步。</p></div><div class="hero-art" aria-label="今日计划完成 ${percent}%"><div class="hero-spark spark-one">✦</div><div class="orbit-ring" style="--progress:${percent}%"><div class="orbit-ring-inner"><span class="ring-label">TODAY’S PROGRESS</span><span class="ring-number">${percent}<small>%</small></span><span class="ring-note">${done} / ${todayTodos.length} 项今日计划</span></div></div><div class="hero-spark spark-two">✧</div></div></section>
    <section class="stats-grid" aria-label="记录概况">${stat('今日已完成', completionCount(today), '项', `还有 ${todayTodos.filter(t=>!t.completed).length} 项今日计划`, 'check', 'blue')}${stat('今日投入', todayMinutes(), '分钟', '任务、学习与阅读的实际记录', 'clock', 'purple')}${stat('本周训练', weekWorkouts.length, '次', `累计 ${sumMinutes(weekWorkouts)} 分钟 · 周一开始`, 'activity', 'green')}${stat('本月可用资金', money(month.available), '', '基准 + 收入 − 支出 − 投入', 'wallet', 'orange')}</section>
    <div class="content-grid"><section class="card"><div class="card-header"><div><h2 class="card-title">留给今天的事</h2><p class="card-subtitle">让每个小目标，有一个着落。</p></div><a class="text-button" href="#tasks">全部任务 ${icon('chevron')}</a></div>${weekStrip()}<div class="section-heading"><span>${state.selectedDate === today ? '今天' : dateLabel(state.selectedDate)}的计划</span><span class="subtle">${selected.length} 项</span></div><div class="task-list">${selected.length ? selected.map(t => taskRow(t)).join('') : empty('今天，给自己一点空间', '添加一个小目标，或从全部任务中安排今天。', button('添加任务', 'new-task', 'secondary'))}</div></section><div class="stack"><section class="card"><div class="card-header"><h2 class="card-title">即将到站</h2><a href="#deadlines" class="text-button">倒计时 ${icon('chevron')}</a></div>${upcoming.length ? upcoming.map(t => `<button class="mini-countdown" data-action="task-detail" data-id="${esc(t.id)}"><span class="mini-countdown-icon">${icon('clock')}</span><span class="task-body"><strong>${esc(t.title)}</strong><small>${dateLabel(t.date)} ${esc(t.time || '23:59')}</small></span><span class="pill ${dueDate(t) < new Date() ? 'red' : 'blue'}" data-countdown="${esc(t.id)}">${countdown(t)}</span></button>`).join('') : empty('没有临近的截止任务', '给目标一个日期，就能在这里看到倒计时。', '', 'clock')}</section><section class="card"><div class="card-header"><h2 class="card-title">给未来的自己</h2><span class="pill purple">PRE-DOC JOURNEY</span></div>${feature('book','课外拓展','技能、经济学与 IELTS','learning','blue')}${feature('paper','论文阅读','从读懂一篇论文开始','papers','purple')}<div class="section-note">慢慢积累，为更大的世界做准备。</div></section></div></div>
    <section class="export-banner"><div class="export-banner-icon">${icon('download')}</div><div><h3>你的记录，值得有下一章。</h3><p>完整导出任务、训练、学习与账本，交给 agent，制定更适合自己的计划。</p></div><a class="button button-secondary" href="#export">导出我的数据 ${icon('arrow')}</a></section>`;
}
function feature(glyph, title, subtitle, page, color) { return `<a class="feature-row" href="#${page}"><span class="feature-icon ${color}">${icon(glyph)}</span><span class="feature-copy"><strong>${title}</strong><small>${subtitle}</small></span>${icon('chevron')}</a>`; }
function weekStrip() {
  const start = new Date(`${state.selectedDate}T12:00:00`); start.setDate(start.getDate() - (start.getDay()+6)%7);
  return `<div class="week-strip"><button class="week-nav" data-action="week-prev" aria-label="上一周">${icon('left')}</button>${Array.from({length:7}, (_,i)=>{ const d=new Date(start); d.setDate(d.getDate()+i); const ds=localDate(d); return `<button class="week-day ${ds===state.selectedDate?'selected':''} ${ds===localDate()?'today':''}" data-action="select-day" data-date="${ds}" aria-label="${ds}" aria-pressed="${ds===state.selectedDate}"><span class="week-label">${['一','二','三','四','五','六','日'][i]}</span><span class="week-number">${d.getDate()}</span><span class="week-dot ${state.todos.some(t=>t.date===ds)?'has-tasks':''}"></span></button>`; }).join('')}<button class="week-nav" data-action="week-next" aria-label="下一周">${icon('chevron')}</button></div>`;
}
function taskRow(t) {
  return `<article class="task-row"><button class="task-check ${t.completed?'checked':''}" data-action="${t.completed?'reopen-task':'complete-task'}" data-id="${esc(t.id)}" aria-label="${t.completed?'恢复待办':'完成并记录时间'}：${esc(t.title)}">${t.completed?icon('check'):''}</button><button class="task-body" data-action="task-detail" data-id="${esc(t.id)}"><span class="task-title ${t.completed?'done':''}">${esc(t.title)}</span><span class="task-meta"><span class="priority-dot ${esc(t.priority||'medium')}"></span><span>${esc(t.subject || MODULES[moduleOf(t)] || t.category)}</span><span>·</span><span>${dateLabel(t.date)}${t.time?` ${esc(t.time)}`:''}</span>${t.estimatedMinutes?`<span>· 预计 ${t.estimatedMinutes} 分钟</span>`:''}</span></button><div class="task-right">${t.completed?`<span class="pill green">已完成</span><small>${(t.timeEntries||[]).length?`${sumMinutes(t.timeEntries)} 分钟`:'旧记录 · 未记录时段'}</small>`:`<span class="pill ${t.priority==='high'?'orange':'gray'}">${t.priority==='high'?'优先处理':t.priority==='low'?'从容安排':'进行计划'}</span>`}</div></article>`;
}
function tasksPage() {
  let todos = state.todos.filter(t => state.taskFilter==='all'||(state.taskFilter==='completed'?t.completed:state.taskFilter==='today'?t.date===localDate():!t.completed));
  if (state.taskModule!=='all') todos=todos.filter(t=>moduleOf(t)===state.taskModule);
  if (state.search) todos=todos.filter(t=>`${t.title} ${t.content||''} ${t.subject||''}`.toLowerCase().includes(state.search.toLowerCase()));
  todos.sort((a,b)=>Number(a.completed)-Number(b.completed)||(a.date||'9999').localeCompare(b.date||'9999')||(a.time||'99').localeCompare(b.time||'99'));
  return heading('MAKE ROOM FOR WHAT MATTERS','任务清单','计划在这里开始，完成时留下真实的投入。',button(`${icon('plus')} 新建任务`,'new-task','primary'))+
    `<section class="card"><div class="toolbar"><div class="segmented" role="group" aria-label="任务状态">${[['pending','待完成'],['today','今天'],['completed','已核销'],['all','全部']].map(([v,l])=>`<button data-action="task-filter" data-filter="${v}" class="${state.taskFilter===v?'active':''}" aria-pressed="${state.taskFilter===v}">${l}</button>`).join('')}</div><div class="filter-row"><label class="search-field">${icon('search')}<input id="taskSearch" type="search" placeholder="搜索任务或学习主题" value="${esc(state.search)}" aria-label="搜索任务"></label><select id="taskModuleFilter" class="filter-select" aria-label="任务分类"><option value="all">所有分类</option>${Object.entries(MODULES).map(([v,l])=>`<option value="${v}" ${state.taskModule===v?'selected':''}>${l}</option>`).join('')}</select></div></div><div class="section-heading"><span>${state.taskFilter==='completed'?'已完成记录':'一步一步，完成它'}</span><span class="subtle">${todos.length} 项任务</span></div><div class="task-list">${todos.length?todos.map(taskRow).join(''):empty('这里暂时没有任务','换一个筛选，或写下下一个想完成的目标。',button('新建任务','new-task','primary'),'check')}</div></section><p class="section-note">${icon('clock')} 每次核销都记录起止时间与实际用时。分多次完成的任务，也可以先记录一段投入。</p>`;
}
function deadlinesPage() {
  const todos=state.todos.filter(t=>!t.completed&&dueDate(t)).sort((a,b)=>dueDate(a)-dueDate(b));
  const overdue=todos.filter(t=>dueDate(t)<new Date());
  return heading('A CLEARER SENSE OF TIME','截止倒计时','看清剩余的时间，把注意力留给重要的事情。',button(`${icon('plus')} 设置新目标`,'new-task','primary'))+
    `<div class="filter-row deadline-summary"><span class="pill blue">${todos.length} 项有截止日期的任务</span>${overdue.length?`<span class="pill red">${overdue.length} 项已逾期</span>`:''}<span class="subtle">实时更新 · 未设置时间时按当日 23:59</span></div><div class="deadline-grid">${todos.length?todos.map(t=>`<article class="deadline-card ${dueDate(t)<new Date()?'overdue':''}"><div class="deadline-top"><span class="pill ${dueDate(t)<new Date()?'red':'blue'}">${esc(MODULES[moduleOf(t)])}</span>${icon('clock')}</div><div class="countdown-value" data-countdown="${esc(t.id)}">${countdown(t)}</div><p class="countdown-label">${dueDate(t)<new Date()?'逾期任务 · 可以重新安排':'距离计划截止'}</p><h2 class="deadline-title">${esc(t.title)}</h2><p class="record-meta">${dateLabel(t.date)} · ${esc(t.time||'23:59')}</p><div class="deadline-footer">${button('查看 / 调整','task-detail','plain',`data-id="${esc(t.id)}"`)}${button('完成核销','complete-task','secondary',`data-id="${esc(t.id)}"`)}</div></article>`).join(''):empty('时间，留给新的期待','新建一项有截止日期的任务，倒计时会在这里出现。',button('添加任务','new-task','primary'),'clock')}</div>`;
}
function trainingPage() {
  let items=[...state.workouts].sort((a,b)=>new Date(b.startAt)-new Date(a.startAt));
  if(state.workoutDate) items=items.filter(w=>localDate(new Date(w.startAt))===state.workoutDate);
  if(state.workoutType!=='all') items=items.filter(w=>w.type===state.workoutType);
  const month=state.workouts.filter(w=>localDate(new Date(w.startAt)).startsWith(localDate().slice(0,7)));
  return heading('MOVE WELL. FEEL BETTER.','训练日志','记录每一次认真出汗，也记录身体给你的反馈。',button(`${icon('plus')} 记录训练`,'new-workout','primary'))+
    `<div class="stats-grid three-stats">${stat('本月训练',month.length,'次','有氧、力量与综合训练','activity','green')}${stat('本月时长',sumMinutes(month),'分钟','来自实际起止时段','clock','blue')}${stat('训练项目',month.reduce((n,w)=>n+(w.exercises||[]).length,0),'项','动作、组次、负重与距离','strength','purple')}</div><section class="card"><div class="toolbar"><h2 class="card-title">训练记录</h2><div class="filter-row"><input type="date" id="workoutDate" class="filter-select" value="${state.workoutDate}" aria-label="筛选训练日期"><select id="workoutType" class="filter-select" aria-label="训练类型"><option value="all">全部类型</option>${Object.entries(TYPES).map(([v,l])=>`<option value="${v}" ${state.workoutType===v?'selected':''}>${l}</option>`).join('')}</select>${state.workoutDate?button('清除日期','clear-workout-date','plain'):''}</div></div><div class="record-list">${items.length?items.map(w=>`<article class="record-card"><div class="record-header"><span class="stat-icon ${w.type==='strength'?'purple':'green'}">${icon(w.type==='strength'?'strength':'activity')}</span><div class="record-title"><h3>${esc(w.title)}</h3><p class="record-meta">${dateLabel(localDate(new Date(w.startAt)))} · ${timeLabel(w.startAt)}–${timeLabel(w.endAt)} · ${esc(w.location||'未填写地点')}</p></div><span class="pill green">${w.durationMinutes} 分钟</span></div><div class="exercise-tags"><span class="pill gray">${TYPES[w.type]}</span>${w.intensity?`<span class="pill gray">主观强度 ${w.intensity}/10</span>`:''}${(w.exercises||[]).map(e=>`<span class="chip">${esc(e.name)}${e.sets?` · ${e.sets} × ${e.reps||'—'}`:''}${e.weightKg?` · ${e.weightKg} kg`:''}${e.distanceKm?` · ${e.distanceKm} km`:''}${e.durationMinutes?` · ${e.durationMinutes} 分钟`:''}</span>`).join('')}</div>${w.notes?`<p class="record-notes">${esc(w.notes)}</p>`:''}<div class="record-actions">${button('编辑记录','edit-workout','plain',`data-id="${esc(w.id)}"`)}${button('删除','delete-record','plain',`data-kind="workouts" data-id="${esc(w.id)}"`)}</div></article>`).join(''):empty('每次开始，都值得被记录','记录有氧或力量训练，填写地点、时段和具体动作。',button('记录第一次训练','new-workout','primary'),'activity')}</div></section>`;
}
function learningPage() {
  const sessions=[...state.studySessions.map(s=>({...s,kind:'study'})),...taskEntries(state.todos.filter(t=>moduleOf(t)==='learning')).map(s=>({...s,topic:s.title,kind:'task'}))].sort((a,b)=>new Date(b.startAt)-new Date(a.startAt));
  const shown=state.subject==='all'?sessions:sessions.filter(s=>s.subject===state.subject);
  const subjects=[...SUBJECTS,...[...new Set(sessions.map(s=>s.subject))].filter(s=>s&&!SUBJECTS.some(x=>x[0]===s)).map(s=>[s,s.slice(0,2),'自定义学习方向','blue'])];
  return heading('STAY CURIOUS. GO FURTHER.','课外拓展','为了未来的 Pre-doc，也为了更大的世界。保持好奇，持续积累。',button(`${icon('plus')} 记录学习`,'new-study','primary'))+
    `<div class="learning-grid">${subjects.map(([subject,symbol,desc,color])=>`<button class="subject-card ${state.subject===subject?'selected':''}" data-action="subject-filter" data-subject="${esc(subject)}"><div class="subject-header"><span class="subject-symbol ${color}">${symbol}</span>${icon('arrow')}</div><h2>${esc(subject)}</h2><p>${desc}</p><div class="subject-meta"><strong>${sumMinutes(sessions.filter(s=>s.subject===subject))}<span> 分钟</span></strong><span>${sessions.filter(s=>s.subject===subject).length} 次记录</span></div></button>`).join('')}</div><section class="card"><div class="card-header"><div><h2 class="card-title">${state.subject==='all'?'学习足迹':esc(state.subject)+' · 学习足迹'}</h2><p class="card-subtitle">时长来自学习日志与已记录的拓展任务，不自动推断熟练程度。</p></div>${state.subject!=='all'?button('查看全部','subject-filter','plain','data-subject="all"'):button('安排学习任务','new-learning-task','plain')}</div><div class="record-list">${shown.length?shown.map(s=>`<article class="record-card"><div class="record-header"><span class="stat-icon blue">${icon('book')}</span><div class="record-title"><h3>${esc(s.topic||s.subject||'学习任务')}</h3><p class="record-meta">${dateLabel(localDate(new Date(s.startAt)))} · ${timeLabel(s.startAt)}–${timeLabel(s.endAt)} · ${esc(s.subject||'未分类')}</p></div><span class="pill blue">${s.durationMinutes} 分钟</span></div>${s.notes?`<p class="record-notes">${esc(s.notes)}</p>`:''}${s.resource?`<p class="record-meta">学习材料：${esc(s.resource)}</p>`:''}<div class="record-actions">${s.kind==='task'?button('查看关联任务','task-detail','plain',`data-id="${esc(s.taskId)}"`):button('编辑','edit-study','plain',`data-id="${esc(s.id)}"`)+button('删除','delete-record','plain',`data-kind="study-sessions" data-id="${esc(s.id)}"`)}</div></article>`).join(''):empty('学习的积累，从这一次开始','选一个感兴趣的方向，记录学了什么、学了多久和遇到的问题。',button('记录学习','new-study','primary'),'book')}</div></section>`;
}
function papersPage() {
  const shown=state.papers.filter(p=>state.paperFilter==='all'||p.status===state.paperFilter);
  return heading('READ. QUESTION. CONNECT.','论文阅读','把问题、方法与启发，留在同一个地方。',button(`${icon('plus')} 添加论文`,'new-paper','primary'))+
    `<div class="toolbar"><div class="segmented" role="group" aria-label="阅读状态">${[['all','全部论文'],['queued','待读'],['reading','阅读中'],['completed','已读完']].map(([v,l])=>`<button data-action="paper-filter" data-filter="${v}" class="${state.paperFilter===v?'active':''}">${l}</button>`).join('')}</div><span class="subtle">${state.papers.length} 篇论文 · ${sumMinutes(state.papers.flatMap(p=>p.timeEntries||[]))} 分钟阅读</span></div><div class="paper-grid">${shown.length?shown.map(p=>`<article class="paper-card"><div class="deadline-top"><span class="pill ${p.status==='completed'?'green':p.status==='reading'?'blue':'gray'}">${{queued:'待读',reading:'阅读中',completed:'已读完'}[p.status]}</span><span class="subtle">${esc(p.year||'')}</span></div><h2>${esc(p.title)}</h2><p class="paper-authors">${esc(p.authors||'作者待补充')}${p.field?` · ${esc(p.field)}`:''}</p>${p.question?`<div class="paper-notes"><small>研究问题</small><p>${esc(p.question)}</p></div>`:''}${p.method?`<div class="paper-notes"><small>方法与识别</small><p>${esc(p.method)}</p></div>`:''}${p.findings?`<div class="paper-notes"><small>发现与启发</small><p>${esc(p.findings)}</p></div>`:''}<p class="record-meta">${(p.timeEntries||[]).length} 次阅读 · ${sumMinutes(p.timeEntries||[])} 分钟</p><div class="record-actions">${button('阅读笔记','paper-detail','plain',`data-id="${esc(p.id)}"`)}${p.status!=='completed'?button('记录阅读','paper-session','secondary',`data-id="${esc(p.id)}"`):'<span class="pill green">已完成阅读</span>'}</div></article>`).join(''):empty('从一篇论文开始','记录研究问题、识别策略和自己的理解，慢慢建立阅读积累。',button('添加论文','new-paper','primary'),'paper')}</div>`;
}
function financePage() {
  const totals=financeSummary(state.transactions,state.settings.monthlyBudget,state.financeMonth);
  const items=state.transactions.filter(t=>t.date.startsWith(state.financeMonth)&&(state.transactionType==='all'||t.type===state.transactionType)).sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||'').localeCompare(a.createdAt||''));
  const spentPercent=totals.funds>0?Math.min(100,(totals.expense+totals.investment)/totals.funds*100):0;
  const categories=Object.create(null); state.transactions.filter(t=>t.date.startsWith(state.financeMonth)&&t.type==='expense').forEach(t=>categories[t.category]=(categories[t.category]||0)+Math.round(t.amount*100));
  return heading('SPEND WITH INTENTION','财务管理','好好吃饭，认真生活。让每一笔钱，都去向值得的地方。',button(`${icon('plus')} 记一笔`,'new-transaction','primary'))+
    `<div class="toolbar"><label class="field-inline">查看月份 <input type="month" id="financeMonth" class="filter-select" value="${state.financeMonth}" required></label>${button('调整资金基准','budget','plain')}</div><div class="finance-grid"><section class="balance-card"><span class="hero-label">本月可用资金 <span class="pill gray">CNY</span></span><div class="balance-amount ${totals.available<0?'negative':''}">${money(totals.available)}</div><p>${totals.available<0?'本月记录已超出可用资金':'给生活留余地，也给未来留一点可能。'}</p><div class="budget-bar"><span style="width:${spentPercent}%"></span></div><div class="budget-legend"><span>已支出 / 投入 ${money(totals.expense+totals.investment)}</span><span>本月资金 ${money(totals.funds)}</span></div><div class="balance-breakdown"><div><small>月度基准</small><strong>${money(Number(state.settings.monthlyBudget))}</strong></div><div><small>额外收入</small><strong class="income">+${money(totals.income)}</strong></div></div></section><div class="money-grid">${stat('生活支出',money(totals.expense),'','日常消费，不含投资转出','wallet','orange')}${stat('ETF / 投资转入',money(totals.investment),'','本金投入，不代表收益或消费','trend','blue')}${stat('必要支出',money(totals.necessary),'','由你在记账时标注','check','green')}${stat('非必要支出',money(totals.discretionary),'','保留原始记录，便于后续复盘','spark','purple')}</div></div><div class="content-grid"><section class="card"><div class="card-header"><h2 class="card-title">每一笔，都有去处</h2><select id="transactionType" class="filter-select" aria-label="收支类型">${[['all','全部记录'],['expense','支出'],['income','收入'],['investment','投资转入']].map(([v,l])=>`<option value="${v}" ${state.transactionType===v?'selected':''}>${l}</option>`).join('')}</select></div>${items.length?items.map(t=>`<article class="transaction-row"><span class="transaction-icon ${t.type}">${icon(t.type==='income'?'arrowDown':t.type==='investment'?'trend':'wallet')}</span><button class="transaction-content" data-action="edit-transaction" data-id="${esc(t.id)}"><strong>${esc(t.category)}${t.asset?` · ${esc(t.asset)}`:''}</strong><small>${dateLabel(t.date)}${t.note?` · ${esc(t.note)}`:''}${t.type==='expense'?` · ${t.necessary?'必要':'非必要'}`:''}</small></button><span class="transaction-amount ${t.type}">${t.type==='income'?'+':'−'}${money(t.amount)}</span></article>`).join(''):empty('账本，从第一笔开始','记录生活支出、助教收入，或一笔 ETF 定投。',button('记一笔','new-transaction','primary'),'wallet')}</section><div class="stack"><section class="card"><div class="card-header"><h2 class="card-title">生活支出去向</h2></div>${Object.keys(categories).length?Object.entries(categories).sort((a,b)=>b[1]-a[1]).map(([c,cents])=>`<div class="category-budget"><div class="budget-legend"><span>${esc(c)}</span><strong>${money(cents/100)}</strong></div><div class="progress-track"><span class="progress-fill" style="width:${totals.expense?cents/100/totals.expense*100:0}%"></span></div></div>`).join(''):'<p class="section-note">记录支出后，分类金额会显示在这里。</p>'}</section><div class="finance-callout">${icon('leaf')}<h3>健康生活，也是值得的投入。</h3><p>吃得健康、干净优先。必要与非必要由你判断，不预设不适合你的消费配额。</p><small>月度基准用于预算，不会自动生成收入流水。ETF 仅记录转入本金；当前余额不包含跨月结转、持仓市值或投资收益。</small></div></div></div>`;
}
function exportPage() {
  const counts=[['任务',state.todos.length],['任务时段',taskEntries().length],['训练',state.workouts.length],['动作明细',state.workouts.reduce((s,w)=>s+(w.exercises||[]).length,0)],['学习日志',state.studySessions.length],['论文',state.papers.length],['阅读时段',state.papers.reduce((s,p)=>s+(p.timeEntries||[]).length,0)],['财务流水',state.transactions.length]];
  return heading('YOUR DATA. YOUR NEXT CHAPTER.','把记录，变成下一步。','下载完整、可读的数据文件，交给你信任的 agent 分析，再制定更适合自己的计划。')+
    `<section class="card export-settings"><div class="card-header"><div><h2 class="card-title">选择导出范围</h2><p class="card-subtitle">留空即导出全部历史。范围包含起止当天，按浏览器本地时区筛选。</p></div><span class="pill green">不上传第三方</span></div><div class="form-grid"><label class="form-field"><span>开始日期</span><input type="date" id="exportFrom" class="form-control" value="${esc(state.exportFrom)}"></label><label class="form-field"><span>结束日期</span><input type="date" id="exportTo" class="form-control" value="${esc(state.exportTo)}"></label></div><div class="data-checklist">${counts.map(([label,count])=>`<span>${icon('check')} ${label}<strong>${count}</strong></span>`).join('')}</div><p class="field-hint">上方数量为全部历史记录。日期筛选作用于导出结果；任务按计划日期，训练与学习按开始日期，账本按交易日期筛选。时段会独立筛选并保留对应的任务 / 论文关联。</p></section>
    <div class="export-grid"><section class="export-card"><div class="export-icon blue">${icon('code')}</div><span class="export-format">JSON</span><h2>交给你的 agent</h2><p>包含原始记录、稳定 ID、时间与单位说明。保留完整细节，适合后续分析和个性化规划。</p><span class="pill blue">推荐 · 完整数据包</span>${button(`${icon('download')} 下载 JSON`,'download-json','primary')}</section><section class="export-card"><div class="export-icon green">${icon('table')}</div><span class="export-format">CSV</span><h2>整理成表格</h2><p>选择一个数据集，以 UTF-8 CSV 下载。可以在 Excel、Python 或 Stata 中继续整理。</p><select id="csvDataset" class="form-control" aria-label="CSV 数据集">${[['todos','任务清单'],['timeEntries','任务与论文时间记录'],['workouts','训练日志'],['exercises','训练动作明细'],['studySessions','学习日志'],['papers','论文阅读'],['transactions','财务流水']].map(([v,l])=>`<option value="${v}" ${state.csvDataset===v?'selected':''}>${l}</option>`).join('')}</select>${button(`${icon('download')} 下载 CSV`,'download-csv','secondary')}</section><section class="export-card"><div class="export-icon purple">${icon('paper')}</div><span class="export-format">MARKDOWN</span><h2>带着上下文出发</h2><p>可直接阅读的数据说明与记录，方便让 agent 理解每一个字段、统计口径和你的时间投入。</p><span class="pill purple">适合阅读与交接</span>${button(`${icon('download')} 下载 Markdown`,'download-markdown','secondary')}</section></div><div class="note-box">${icon('shield')}<div><strong>分析由你决定，记录由这里完成。</strong><p>不会自动生成健康、投资或学习建议。导出文件可能包含个人日程和财务明细，请只分享给你信任的工具。当前页面是导出工具，JSON 暂不提供一键导入恢复。</p></div></div>`;
}

function field(label, name, value = '', type = 'text', options = '') { return `<label class="form-field"><span class="field-label">${label}</span><input class="form-control" type="${type}" name="${name}" value="${esc(value??'')}" ${options}></label>`; }
function textarea(label, name, value = '', hint = '') { return `<label class="form-field full"><span class="field-label">${label}</span><textarea class="form-control" name="${name}" rows="3">${esc(value||'')}</textarea>${hint?`<small class="field-hint">${hint}</small>`:''}</label>`; }
function select(label, name, values, current = '') { return `<label class="form-field"><span class="field-label">${label}</span><select class="form-control" name="${name}">${values.map(([v,l])=>`<option value="${v}" ${v===current?'selected':''}>${l}</option>`).join('')}</select></label>`; }
function openDialog(title, description, content, { submit, submitLabel = '保存记录', kicker = 'DAYMARK', wide = false, footer = '' } = {}) {
  currentDialog = document.activeElement;
  dialogSubmit = submit;
  dialog.classList.toggle('wide-dialog',wide);
  document.querySelector('#dialogContent').innerHTML = `<${submit?'form id="dialogForm"':'div'}><div class="dialog-header"><div><p class="dialog-kicker">${kicker}</p><h2 id="dialogTitle" class="dialog-title">${title}</h2>${description?`<p class="dialog-description">${description}</p>`:''}</div><button type="button" class="dialog-close" data-action="close-dialog" aria-label="关闭">${icon('close')}</button></div><div class="dialog-body">${content}<p class="form-error" id="formError" role="alert" hidden></p></div>${submit?`<div class="dialog-footer">${button('取消','close-dialog','secondary')}<button class="button button-primary" type="submit" id="submitButton">${submitLabel}</button></div>`:footer?`<div class="dialog-footer">${footer}</div>`:''}</${submit?'form':'div'}>`;
  if (!dialog.open) dialog.showModal();
  if(submit) document.querySelector('#dialogForm').addEventListener('submit', onSubmit);
}
async function onSubmit(event) {
  event.preventDefault(); const form=event.currentTarget;
  if(!form.reportValidity())return;
  const button=form.querySelector('[type=submit]'), original=button.textContent;
  const error=form.querySelector('#formError'); error.hidden=true; button.disabled=true; button.textContent='正在保存…';
  try { await dialogSubmit(new FormData(form),form); } catch(err) { error.hidden=false; error.textContent=err.message; error.scrollIntoView({block:'nearest'}); }
  finally { if(button.isConnected){button.disabled=false;button.textContent=original;} }
}
async function save(path, method, payload, message='已保存，继续积累。') { await api(path,method,payload); dialog.close(); toast(message); await refresh(true); }
function taskForm(id, initialModule = 'life') {
  const t=state.todos.find(t=>t.id===id)||{};
  openDialog(t.id?'编辑任务':'给未来，写一个小目标','安排计划时间；完成时再记录真实的起止时段。',`<div class="form-grid">${field('任务名称 *','title',t.title,'text','required maxlength="240" placeholder="想完成的一件事"')}${select('归属板块','module',Object.entries(MODULES),t.id?moduleOf(t):initialModule)}${field('计划 / 截止日期 *','date',t.date||state.selectedDate,'date','required')}${field('截止时间','time',t.time,'time')}${select('优先级','priority',[['medium','普通'],['high','优先处理'],['low','从容安排']],t.priority||'medium')}${field('预计投入（分钟）','estimatedMinutes',t.estimatedMinutes,'number','min="1" max="100000" step="1" placeholder="选填"')}${field('主题 / 技能','subject',t.subject,'text','list="subjectOptions" placeholder="例如 Python、IELTS"')}<datalist id="subjectOptions">${SUBJECTS.map(([s])=>`<option value="${s}">`).join('')}</datalist>${field('原始分类 / 标签','category',t.category||'生活','text','maxlength="80"')}${textarea('具体内容与完成标准','content',t.content||t.notes,'把任务拆小一点。可以写下参考材料、具体要求或要解决的问题。')}${textarea('参考链接（每行一个网址）','links',(t.links||[]).map(l=>typeof l==='string'?l:l.url).join('\n'))}${textarea('图片链接（每行一个网址或 /uploads/ 路径）','images',(t.images||[]).join('\n'))}<label class="form-field full"><span class="field-label">添加图片附件</span><input class="form-control" type="file" name="attachments" accept="image/png,image/jpeg,image/webp,image/gif" multiple><small class="field-hint">最多 4 张新图片，每张不超过 1 MB。原有图片链接会保留。</small></label></div>`, { submit: async(f)=>{
    const links=String(f.get('links')).split('\n').map(x=>x.trim()).filter(Boolean); if(links.some(x=>!safeUrl(x)))throw new Error('参考链接只支持有效的 http / https 网址。');
    const images=String(f.get('images')).split('\n').map(x=>x.trim()).filter(Boolean); if(images.some(x=>!safeUrl(x,true)))throw new Error('图片地址需要是 http / https、/uploads/ 路径或有效图片数据。');
    const files=f.getAll('attachments').filter(x=>x instanceof File&&x.size); if(files.length>4)throw new Error('一次最多添加 4 张图片。');
    for(const file of files) { if(file.size>1024*1024)throw new Error('每张图片需小于 1 MB。'); if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error('请上传 PNG、JPEG、WebP 或 GIF 图片。'); images.push(await readDataUrl(file)); }
    const payload={title:String(f.get('title')).trim(),module:f.get('module'),date:f.get('date'),time:f.get('time'),priority:f.get('priority'),subject:String(f.get('subject')).trim(),category:String(f.get('category')).trim(),content:f.get('content'),notes:f.get('content'),links:links.map(url=>({title:url,url})),images,estimatedMinutes:f.get('estimatedMinutes')?Number(f.get('estimatedMinutes')):null,source:t.source||'web'};
    await save(`/api/todos${t.id?'/'+encodeURIComponent(t.id):''}`,t.id?'PATCH':'POST',payload,'任务已保存。一步一步，来得及。');
  }, submitLabel:t.id?'保存修改':'添加任务' });
}
function readDataUrl(file) {return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('图片读取失败'));reader.readAsDataURL(file);});}
function sessionFields(s = {}) {
  return `<div class="form-grid">${field('开始时间 *','startAt',s.startAt?localInput(new Date(s.startAt)):'','datetime-local','required')}${field('结束时间 *','endAt',s.endAt?localInput(new Date(s.endAt)):localInput(new Date()),'datetime-local','required')}${field('实际投入（分钟）*','durationMinutes',s.durationMinutes,'number',`required min="0.1" step="0.1" placeholder="先填写时间段，可排除休息" ${s.durationMinutes?'data-manually-set="true"':''}`)}${select('精力 / 主观感受','energy',[['','不记录'],...Array.from({length:10},(_,i)=>[String(i+1),`${i+1}${{1:' · 很疲惫',3:' · 较疲惫',5:' · 一般',7:' · 状态不错',10:' · 非常专注'}[i+1]||''}`])],String(s.energy||''))}<p class="field-hint full">实际用时可少于时间段长度，以排除休息。支持跨日记录，不允许记录未来已经完成的活动。</p>${textarea('完成内容、困难与备注','notes',s.notes)}</div>`;
}
function getSession(f) {
  const start=new Date(String(f.get('startAt'))), end=new Date(String(f.get('endAt'))), minutes=Number(f.get('durationMinutes'));
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new Error('结束时间必须晚于开始时间。');
  if(end.getTime()>Date.now()+60000)throw new Error('实际完成时段不能在未来。');
  if(!Number.isFinite(minutes)||minutes<=0||minutes>(end-start)/60000+0.001)throw new Error('实际用时必须大于 0，且不能超过起止时间段。');
  return {startAt:start.toISOString(),endAt:end.toISOString(),durationMinutes:minutes,notes:f.get('notes')||'',energy:f.get('energy')?Number(f.get('energy')):null};
}
function completionForm(kind,id,finish=true) {
  const item=(kind==='todos'?state.todos:state.papers).find(t=>t.id===id); if(!item)return;
  openDialog(finish?'做到了。记录这一刻。':'记下一段真实的投入',`「${esc(item.title)}」${finish?'完成前，请填写实际时间。':'可以分多次记录，最后一次再完成核销。'}`, sessionFields(), {submitLabel:finish?'保存并完成':'保存时间记录',submit:async f=>{
    const completion=getSession(f);
    if(finish) await save(`/api/${kind}/${encodeURIComponent(id)}`,'PATCH',{...(kind==='todos'?{completed:true}:{status:'completed'}),completion},'已完成，认真付出的时间也已保存。');
    else await save(`/api/${kind}/${encodeURIComponent(id)}/sessions`,'POST',completion,'这一段投入，已经记下。');
  }});
}
function sessionHistory(entries=[]) { return entries.length?`<div class="session-list">${[...entries].reverse().map(s=>`<div class="session-row"><div><strong>${dateLabel(localDate(new Date(s.startAt)))} · ${timeLabel(s.startAt)} — ${dateLabel(localDate(new Date(s.endAt)))} ${timeLabel(s.endAt)}</strong>${s.notes?`<p>${esc(s.notes)}</p>`:''}${s.energy?`<small>主观状态 ${s.energy}/10</small>`:''}</div><span class="pill blue">${s.durationMinutes} 分钟</span></div>`).join('')}</div>`:'<p class="section-note">还没有实际时间记录。旧任务不会补造时长。</p>'; }
function taskDetail(id) {
  const t=state.todos.find(x=>x.id===id);if(!t)return;
  openDialog(esc(t.title),`${esc(MODULES[moduleOf(t)])} · ${dateLabel(t.date)} ${esc(t.time||'全天 / 截止 23:59')}`,`<div class="detail-meta"><span class="pill ${t.completed?'green':'blue'}">${t.completed?'已核销':'待完成'}</span>${t.subject?`<span class="pill gray">${esc(t.subject)}</span>`:''}${t.estimatedMinutes?`<span class="pill gray">预计 ${t.estimatedMinutes} 分钟</span>`:''}<span class="pill gray">已记录 ${sumMinutes(t.timeEntries||[])} 分钟</span></div><div class="detail-content">${esc(t.content||t.notes||'还没有补充具体内容。')}</div>${(t.links||[]).length?`<div class="detail-links">${t.links.map(l=>{const url=safeUrl(typeof l==='string'?l:l.url);return url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon('link')}${esc(typeof l==='string'?l:l.title||l.url)} ${icon('external')}</a>`:'';}).join('')}</div>`:''}${(t.images||[]).length?`<div class="detail-images">${t.images.map(src=>{const url=safeUrl(src,true);return url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(url)}" alt="任务图片附件" loading="lazy"></a>`:'';}).join('')}</div>`:''}<h3 class="section-heading">实际投入记录</h3>${sessionHistory(t.timeEntries)}<div class="action-grid">${t.completed?button('恢复为待办','reopen-task','secondary',`data-id="${esc(id)}"`):button('记录一个时段','task-session','secondary',`data-id="${esc(id)}"`)+button('完成核销','complete-task','primary',`data-id="${esc(id)}"`)}</div><div class="danger-zone">${button('编辑任务','edit-task','plain',`data-id="${esc(id)}"`)}${button('删除任务','delete-record','danger',`data-kind="todos" data-id="${esc(id)}"`)}</div>`);
}
function exerciseRow(e={},index=0) { return `<div class="exercise-row"><div class="input-row"><input class="form-control" name="exerciseName" value="${esc(e.name||'')}" placeholder="动作 / 项目，例如深蹲、慢跑" aria-label="训练项目 ${index+1} 名称" required><button type="button" class="icon-button" data-action="remove-exercise" aria-label="删除此动作">${icon('close')}</button></div><div class="exercise-fields">${field('组数','exerciseSets',e.sets,'number','min="1" step="1"')}${field('每组次数','exerciseReps',e.reps,'number','min="1" step="1"')}${field('负重 kg','exerciseWeight',e.weightKg,'number','min="0" step="0.1"')}${field('时长 分钟','exerciseDuration',e.durationMinutes,'number','min="0.1" step="0.1"')}${field('距离 km','exerciseDistance',e.distanceKm,'number','min="0.01" step="0.01"')}</div></div>`; }
function workoutForm(id) {
  const w=state.workouts.find(w=>w.id===id)||{};
  openDialog(w.id?'编辑训练记录':'今天，为身体做了什么？','按真实训练填写；动作明细会一起导出，方便后续调整计划。',`<div class="form-grid">${field('训练名称 *','title',w.title,'text','required maxlength="240" placeholder="例如：下肢力量 + 轻松跑"')}${select('训练类型','type',Object.entries(TYPES),w.type||'strength')}${field('训练地点','location',w.location,'text','placeholder="例如：学校健身房"')}${field('主观强度 RPE（1–10）','intensity',w.intensity,'number','min="1" max="10" step="1" placeholder="选填"')}</div>${sessionFields(w)}<div class="section-heading"><h3>具体动作与项目</h3>${button(`${icon('plus')} 添加动作`,'add-exercise','plain')}</div><div id="exerciseRows" class="exercise-editor">${(w.exercises?.length?w.exercises:[{}]).map(exerciseRow).join('')}</div>`,{wide:true,submit:async(f,form)=>{
    const exercises=[...form.querySelectorAll('.exercise-row')].map(row=>{const get=name=>row.querySelector(`[name="${name}"]`).value;const value={name:get('exerciseName').trim()};for(const [key,name] of [['sets','exerciseSets'],['reps','exerciseReps'],['weightKg','exerciseWeight'],['durationMinutes','exerciseDuration'],['distanceKm','exerciseDistance']])if(get(name)!=='')value[key]=Number(get(name));return value;});
    await save(`/api/workouts${w.id?'/'+encodeURIComponent(w.id):''}`,w.id?'PATCH':'POST',{...getSession(f),title:f.get('title'),type:f.get('type'),location:f.get('location'),intensity:f.get('intensity')?Number(f.get('intensity')):null,exercises});
  }});
}
function studyForm(id) {
  const s=state.studySessions.find(s=>s.id===id)||{};
  openDialog(s.id?'编辑学习记录':'今天，又多懂了一点。','独立学习用这里记录；已通过任务记录的同一时段，无需重复填写。',`<div class="form-grid">${field('学习方向 *','subject',s.subject||(state.subject==='all'?'Python':state.subject),'text','required list="studySubjects"')}<datalist id="studySubjects">${SUBJECTS.map(([x])=>`<option value="${x}">`).join('')}</datalist>${field('具体主题 *','topic',s.topic,'text','required maxlength="240" placeholder="例如 pandas 数据清洗"')}${field('学习材料 / 来源','resource',s.resource,'text','placeholder="课程、书籍、链接或章节"')}</div>${sessionFields(s)}`,{submit:async f=>save(`/api/study-sessions${s.id?'/'+encodeURIComponent(s.id):''}`,s.id?'PATCH':'POST',{...getSession(f),subject:f.get('subject'),topic:f.get('topic'),resource:f.get('resource')})});
}
function paperForm(id) {
  const p=state.papers.find(p=>p.id===id)||{};
  openDialog(p.id?'整理阅读笔记':'把一篇论文放进阅读清单','技能学习在课外拓展，论文的问题、方法和启发记录在这里。',`<div class="form-grid">${field('论文标题 *','title',p.title,'text','required maxlength="500"')}${field('作者','authors',p.authors)}${field('发表年份','year',p.year,'number','min="1800" max="2100" step="1"')}${field('研究领域','field',p.field,'text','placeholder="例如 劳动经济学"')}${field('论文链接','url',p.url,'url','placeholder="https://…"')}${p.status==='completed'?'<div class="form-field"><span class="field-label">阅读状态</span><span class="pill green">已读完 · 编辑笔记保留状态</span></div>':select('阅读状态','status',[['queued','待读'],['reading','阅读中']],p.status||'queued')}${textarea('研究问题','question',p.question)}${textarea('方法与识别策略','method',p.method)}${textarea('主要发现与启发','findings',p.findings)}${textarea('疑问、后续想法与笔记','notes',p.notes)}</div>`,{submit:async f=>{
    if(f.get('url')&&!safeUrl(f.get('url')))throw new Error('论文链接只支持 http / https。');
    const body={title:f.get('title'),authors:f.get('authors'),year:f.get('year')?Number(f.get('year')):null,field:f.get('field'),url:f.get('url'),question:f.get('question'),method:f.get('method'),findings:f.get('findings'),notes:f.get('notes')};if(p.status!=='completed')body.status=f.get('status');
    await save(`/api/papers${p.id?'/'+encodeURIComponent(p.id):''}`,p.id?'PATCH':'POST',body);
  },submitLabel:'保存论文与笔记'});
}
function paperDetail(id) {
  const p=state.papers.find(p=>p.id===id);if(!p)return;
  openDialog(esc(p.title),`${esc(p.authors||'作者待补充')} ${esc(p.year||'')}`,`<div class="detail-meta"><span class="pill purple">${esc(p.field||'未分类')}</span><span class="pill blue">${sumMinutes(p.timeEntries||[])} 分钟阅读</span></div>${safeUrl(p.url)?`<a class="text-button" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer">打开论文 ${icon('external')}</a>`:''}${[['question','研究问题'],['method','方法与识别策略'],['findings','主要发现与启发'],['notes','阅读笔记']].map(([k,l])=>`<h3 class="section-heading">${l}</h3><div class="detail-content">${esc(p[k]||'暂未填写')}</div>`).join('')}<h3 class="section-heading">阅读时间记录</h3>${sessionHistory(p.timeEntries)}<div class="action-grid">${p.status!=='completed'?button('记录一次阅读','paper-session','secondary',`data-id="${esc(id)}"`)+button('完成阅读','complete-paper','primary',`data-id="${esc(id)}"`):button('重新打开阅读','reopen-paper','secondary',`data-id="${esc(id)}"`)}</div><div class="danger-zone">${button('编辑笔记','edit-paper','plain',`data-id="${esc(id)}"`)}${button('删除论文','delete-record','danger',`data-kind="papers" data-id="${esc(id)}"`)}</div>`);
}
function transactionForm(id) {
  const t=state.transactions.find(t=>t.id===id)||{};
  openDialog(t.id?'编辑这笔记录':'每一笔，都心中有数。','支出、额外收入和投资转入分别记录。金额统一使用人民币。',`<div class="form-grid">${select('收支类型','type',[['expense','生活支出'],['income','额外收入'],['investment','ETF / 投资转入']],t.type||'expense')}${field('金额（元）*','amount',t.amount,'number','required min="0.01" step="0.01" max="100000000" inputmode="decimal"')}${field('日期 *','date',t.date||localDate(),'date','required')}${field('分类 *','category',t.category,'text','required list="financeCategories" placeholder="例如 健康饮食、雅思助教、ETF定投"')}<datalist id="financeCategories">${['健康饮食','交通','学习资料','日用品','住房','医疗健康','运动','娱乐','雅思助教','兼职','奖学金','ETF定投','其他收入','其他支出'].map(v=>`<option value="${v}">`).join('')}</datalist>${field('账户 / 支付方式','account',t.account,'text','placeholder="银行卡、支付宝等"')}${field('投资标的（仅投资）','asset',t.asset,'text','placeholder="ETF 名称或代码，选填"')}${select('是否属于必要支出','necessary',[['true','必要 · 健康与基本生活'],['false','非必要 / 不适用']],String(t.necessary??true))}${textarea('备注 / 用途','note',t.note)}</div><p class="field-hint">每月 ${money(state.settings.monthlyBudget)} 为预算基准，不要再次录为收入。投资转入减少可用现金，但不记作生活消费。</p>${t.id?`<div class="danger-zone">${button('删除这笔流水','delete-record','danger',`data-kind="transactions" data-id="${esc(t.id)}"`)}</div>`:''}`,{submit:async f=>{
    const amount=Number(f.get('amount'));if(!Number.isFinite(amount)||amount<=0||Math.abs(amount*100-Math.round(amount*100))>1e-6)throw new Error('请输入大于 0 且最多两位小数的金额。');
    await save(`/api/transactions${t.id?'/'+encodeURIComponent(t.id):''}`,t.id?'PATCH':'POST',{type:f.get('type'),amount,date:f.get('date'),category:f.get('category'),necessary:f.get('type')==='expense'&&f.get('necessary')==='true',account:f.get('account'),asset:f.get('type')==='investment'?f.get('asset'):'',note:f.get('note')},'这笔流水已记好。');
  }});
}
function deleteDialog(kind,id) {
  const map={todos:state.todos,workouts:state.workouts,'study-sessions':state.studySessions,papers:state.papers,transactions:state.transactions};
  const item=map[kind]?.find(i=>i.id===id);if(!item)return;
  openDialog('删除这条记录？','删除后无法在网页恢复。相关时间记录和明细也会一并删除。',`<div class="note-box">${icon('alert')}<p>${esc(item.title||item.topic||`${item.category} ${money(item.amount)}`)}</p></div><p class="field-hint">如需保留原始数据，可以先到「数据导出」下载完整 JSON。</p>`,{submitLabel:'确认删除',submit:async()=>save(`/api/${kind}/${encodeURIComponent(id)}`,'DELETE',undefined,'记录已删除。')});
}
function budgetForm() { openDialog('给每个月，一个清晰的起点。','这是预算资金基准，不是银行余额，也不会自动创建收入流水。',`<div class="form-grid">${field('每月基准资金（元）*','monthlyBudget',state.settings.monthlyBudget,'number','required min="0" step="0.01" max="100000000"')}</div><p class="section-note">初始值来自你提供的每月 4000 元。更改后会用于所有月份的预算展示；历史交易不受影响，暂不计算跨月结转。</p>`,{submit:async f=>save('/api/settings','PATCH',{monthlyBudget:Number(f.get('monthlyBudget'))},'月度资金基准已更新。')}); }
async function download(format) {
  const from=document.querySelector('#exportFrom').value,to=document.querySelector('#exportTo').value;
  if(from&&to&&from>to)throw new Error('开始日期不能晚于结束日期。');
  const query=new URLSearchParams({format,timezoneOffsetMinutes:String(new Date().getTimezoneOffset()),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});
  if(from)query.set('from',from);if(to)query.set('to',to);if(format==='csv')query.set('dataset',state.csvDataset);
  const res=await fetch(`/api/export?${query}`,{headers:state.key?{'x-api-key':state.key}:{}});
  if(!res.ok){let message='导出失败，请稍后再试';try{message=(await res.json()).error||message;}catch{}throw new Error(message);}
  const blob=await res.blob(), url=URL.createObjectURL(blob), a=document.createElement('a');
  const name=`daymark-${format==='csv'?query.get('dataset')+'-':''}${from||'all'}_${to||localDate()}.${format==='markdown'?'md':format}`;
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('数据文件已准备好，请查看浏览器下载。');
}
function authDialog() {openDialog('连接你的个人空间','密钥仅保存在当前浏览器标签会话中。',field('访问密钥 *','key','','password','required autocomplete="off"'),{submitLabel:'连接',submit:async f=>{const previous=state.key;state.key=String(f.get('key'));try{await api('/api/state');}catch(e){state.key=previous;throw e;}sessionStorage.setItem('daymark_key',state.key);dialog.close();await refresh();connectEvents();}});}
function settingsDialog() {openDialog('我的个人空间','让工具按你的习惯工作。',`<div class="feature-row"><span class="feature-icon blue">${icon('sun')}</span><span class="feature-copy"><strong>外观</strong><small>切换浅色与深色主题</small></span>${button('切换','theme','secondary')}</div><div class="feature-row"><span class="feature-icon green">${icon('wallet')}</span><span class="feature-copy"><strong>每月资金基准</strong><small>${money(state.settings.monthlyBudget)} / 月</small></span>${button('调整','budget','secondary')}</div><div class="feature-row"><span class="feature-icon purple">${icon('shield')}</span><span class="feature-copy"><strong>访问密钥</strong><small>服务器设置 API_KEY 时使用</small></span>${button('设置','auth','secondary')}</div><div class="feature-row"><span class="feature-icon orange">${icon('bike')}</span><span class="feature-copy"><strong>我的单车</strong><small>${state.bike.active?'查看已记录的停车位置':'记录停车位置与照片'}</small></span>${button('打开','bike','secondary')}</div><div class="note-box"><p>记录保存在当前服务器的数据目录。手机与电脑通过同一个服务器同步；网页没有离线写入功能，请定期导出数据。</p></div>`);}
async function networkDialog() {
  const network=await api('/api/network');
  const publicUrl=network.primaryUrl;
  openDialog('在手机上，继续你的日常。','手机和电脑连接同一个 Wi-Fi 后，可通过局域网地址打开。',`<div class="connection-url">${esc(publicUrl)}</div>${network.qrDataUrl?`<img class="qr-code" src="${esc(network.qrDataUrl)}" alt="打开当前网站的二维码">`:''}<p class="field-hint">二维码对应当前访问地址。如果显示 localhost，请在手机上使用以下局域网地址。</p><div class="detail-links">${(network.ips||[]).map(ip=>`<a href="http://${esc(ip)}:${network.port}" target="_blank" rel="noopener noreferrer">http://${esc(ip)}:${network.port} ${icon('external')}</a>`).join('')}</div><p class="section-note">仅在受信任的网络使用。启用服务器 API_KEY 后，手机首次访问需要输入同一密钥。</p>`);
}
function bikeDialog() {
  const b=state.bike;
  if(b.active){openDialog('单车，在这里等你。',b.timestamp?dateLabel(localDate(new Date(b.timestamp)))+' '+timeLabel(b.timestamp):'停车位置已记录',`<p class="detail-content">${esc(b.note||'没有补充位置描述')}</p><p class="record-meta">坐标 ${b.latitude}, ${b.longitude}${b.accuracy?` · 精度约 ${Math.round(b.accuracy)} 米`:''}</p>${b.photo&&safeUrl(b.photo,true)?`<div class="detail-images"><img src="${esc(safeUrl(b.photo,true))}" alt="停车照片"></div>`:''}<div class="action-grid"><a class="button button-primary" href="https://uri.amap.com/marker?position=${encodeURIComponent(b.longitude+','+b.latitude)}&name=${encodeURIComponent('我的单车')}" target="_blank" rel="noopener noreferrer">${icon('location')} 地图找车</a>${button('已找到单车','clear-bike','secondary')}</div>`);return;}
  openDialog('记住，这次停在哪里。','定位需要浏览器授权，非 HTTPS 的局域网可能无法获取位置，可以手动填写坐标。',`<div class="form-grid">${field('纬度 *','latitude','','number','required min="-90" max="90" step="any"')}${field('经度 *','longitude','','number','required min="-180" max="180" step="any"')}${textarea('位置特征','note','','例如：图书馆东门，第二排树旁。')}<label class="form-field full"><span>停车照片</span><input type="file" class="form-control" name="photo" accept="image/png,image/jpeg,image/webp"></label></div>${button(`${icon('location')} 获取当前位置`,'locate-bike','secondary')}<p class="field-hint" id="locationStatus"></p>`,{submit:async(f,form)=>{let photo=null;const file=f.get('photo');if(file?.size){if(file.size>1024*1024)throw new Error('停车照片需小于 1 MB。');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请上传 PNG、JPEG 或 WebP 图片。');photo=await readDataUrl(file);}await save('/api/bike','POST',{latitude:Number(f.get('latitude')),longitude:Number(f.get('longitude')),note:f.get('note'),photo,accuracy:form.dataset.accuracy?Number(form.dataset.accuracy):null},'停车位置已保存。');}});
}
function locateBike() {
  const form=document.querySelector('#dialogForm'), status=document.querySelector('#locationStatus');
  if(!navigator.geolocation){status.textContent='此浏览器不支持定位，请手动填写。';return;}
  status.textContent='正在请求定位…';
  navigator.geolocation.getCurrentPosition(p=>{if(!form.isConnected)return;form.elements.latitude.value=p.coords.latitude;form.elements.longitude.value=p.coords.longitude;form.dataset.accuracy=p.coords.accuracy;status.textContent=`位置已获取，精度约 ${Math.round(p.coords.accuracy)} 米。`;},()=>{if(status.isConnected)status.textContent='未能获取位置。请检查定位权限、HTTPS 连接，或手动填写坐标。';},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
}
function toggleTheme() {
  const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
  document.documentElement.dataset.theme=next;localStorage.setItem('todo_theme',next);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = next === 'dark' ? '#111114' : '#f5f5f7';
  document.querySelector('#themeButton').innerHTML=icon(next==='dark'?'sun':'moon');
  document.querySelector('#themeButton').setAttribute('aria-label',next==='dark'?'切换浅色模式':'切换深色模式');
}
async function action(target) {
  const a=target.dataset.action,id=target.dataset.id;
  switch(a){
    case 'new-task':return taskForm();case 'new-learning-task':return taskForm(null,'learning');case 'edit-task':return taskForm(id);
    case 'task-detail':return taskDetail(id);case 'complete-task':return completionForm('todos',id,true);case 'task-session':return completionForm('todos',id,false);
    case 'reopen-task':return save(`/api/todos/${encodeURIComponent(id)}`,'PATCH',{completed:false},'任务已恢复，历史投入记录已保留。');
    case 'go-tasks':location.hash='tasks';return;
    case 'select-day':state.selectedDate=target.dataset.date;render();return;
    case 'week-prev':case 'week-next':{const d=new Date(state.selectedDate+'T12:00:00');d.setDate(d.getDate()+(a==='week-prev'?-7:7));state.selectedDate=localDate(d);render();return;}
    case 'task-filter':state.taskFilter=target.dataset.filter;render();return;
    case 'new-workout':return workoutForm();case 'edit-workout':return workoutForm(id);
    case 'add-exercise':document.querySelector('#exerciseRows').insertAdjacentHTML('beforeend',exerciseRow({},document.querySelectorAll('.exercise-row').length));return;
    case 'remove-exercise':target.closest('.exercise-row').remove();return;
    case 'clear-workout-date':state.workoutDate='';render();return;
    case 'new-study':return studyForm();case 'edit-study':return studyForm(id);
    case 'subject-filter':state.subject=target.dataset.subject;render();return;
    case 'new-paper':return paperForm();case 'edit-paper':return paperForm(id);case 'paper-detail':return paperDetail(id);
    case 'paper-filter':state.paperFilter=target.dataset.filter;render();return;
    case 'paper-session':return completionForm('papers',id,false);case 'complete-paper':return completionForm('papers',id,true);
    case 'reopen-paper':return save(`/api/papers/${encodeURIComponent(id)}`,'PATCH',{status:'reading'},'已重新打开阅读，历史时间记录保留。');
    case 'new-transaction':return transactionForm();case 'edit-transaction':return transactionForm(id);case 'budget':return budgetForm();
    case 'download-json':case 'download-csv':case 'download-markdown':return download(a.slice(9));
    case 'delete-record':return deleteDialog(target.dataset.kind,id);
    case 'theme':return toggleTheme();case 'network':return networkDialog();case 'settings':return settingsDialog();case 'auth':return authDialog();
    case 'bike':return bikeDialog();case 'locate-bike':return locateBike();case 'clear-bike':return save('/api/bike/clear','POST',{},'已取车。下次出发再见。');
    case 'close-dialog':dialog.close();return;
    case 'more':return openDialog('你的个人空间','日常的每一面，都在这里。',`<div class="mobile-more-grid">${NAV.map(([id,label,glyph])=>`<a class="more-item" href="#${id}">${icon(glyph)}<span>${label}</span></a>`).join('')}</div>${button('个人设置与单车','settings','secondary')}`);
    case 'retry':await refresh();connectEvents();return;
  }
}
document.addEventListener('click',async e=>{
  const target=e.target.closest('[data-action]');if(!target||target.disabled)return;
  try{await action(target);}catch(error){toast(error.message,true);}
});
document.addEventListener('change',e=>{
  if(['exportFrom','exportTo','csvDataset'].includes(e.target.id)){state[e.target.id]=e.target.value;return;}
  const values={taskModuleFilter:'taskModule',workoutDate:'workoutDate',workoutType:'workoutType',financeMonth:'financeMonth',transactionType:'transactionType'};
  if(values[e.target.id]){if(e.target.id==='financeMonth'&&!e.target.value)return;state[values[e.target.id]]=e.target.value;render();}
  if(e.target.name==='startAt'||e.target.name==='endAt'){
    const form=e.target.form;if(!form)return;
    const start=new Date(form.elements.startAt.value),end=new Date(form.elements.endAt.value),duration=form.elements.durationMinutes;
    if(duration&&!duration.dataset.manuallySet&&end>start)duration.value=Math.round((end-start)/6000)/10;
  }
});
document.addEventListener('input',e=>{
  if(e.target.name==='durationMinutes')e.target.dataset.manuallySet='true';
  if(e.target.id==='taskSearch'){const position=e.target.selectionStart;state.search=e.target.value;render();const input=document.querySelector('#taskSearch');input.focus();try{input.setSelectionRange(position,position);}catch{}}
});
window.addEventListener('hashchange',()=>{
  const page=location.hash.slice(1);if(!NAV.some(n=>n[0]===page))return;state.page=page;dialog.close();render();window.scrollTo({top:0,behavior:'instant'});main.focus({preventScroll:true});
});
dialog.addEventListener('close',()=>{dialogSubmit=null;if(currentDialog?.isConnected)currentDialog.focus({preventScroll:true});});
window.addEventListener('online',()=>{refresh(true);connectEvents();});
window.addEventListener('offline',()=>setOnline(false));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
setInterval(()=>{
  document.querySelectorAll('[data-countdown]').forEach(el=>{const t=state.todos.find(t=>t.id===el.dataset.countdown);if(t)el.textContent=countdown(t);});
  if(clockDay!==localDate()){if(state.selectedDate===clockDay)state.selectedDate=localDate();clockDay=localDate();render();}
},1000);
const savedTheme=localStorage.getItem('todo_theme');
const activeTheme=['dark','light'].includes(savedTheme)?savedTheme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
document.documentElement.dataset.theme=activeTheme;
const initMetaTheme = document.querySelector('meta[name="theme-color"]');
if (initMetaTheme) initMetaTheme.content = activeTheme === 'dark' ? '#111114' : '#f5f5f7';
document.querySelector('#themeButton').innerHTML=icon(activeTheme==='dark'?'sun':'moon');
document.querySelector('#networkButton').innerHTML=icon('phone');
renderNavigation();
refresh().then(()=>{if(state.loaded)connectEvents();});

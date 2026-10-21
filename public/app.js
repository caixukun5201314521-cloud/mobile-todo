// ==========================================================================
// Modern Mobile Todo & Calendar App
// ==========================================================================

const state = {
  todos: [],
  selectedDate: getFormattedDate(new Date()),
  weekOffset: 0,
  activeFilter: 'current-date', // 'current-date' | 'all-pending' | 'upcoming' | 'completed'
  theme: localStorage.getItem('todo_theme') || 'auto',
  networkInfo: null
};

// Date utilities
function getFormattedDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateStr(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getDayOfWeekName(d) {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return days[d.getDay()];
}

function getFullChineseDate(d) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// Sound feedback using Web Audio API
class SoundEffects {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }
  playSuccess() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.2);
    } catch {
      // Audio not permitted or supported
    }
  }
}
const sfx = new SoundEffects();

// DOM Elements
const syncStatusEl = document.getElementById('syncStatus');
const headerDateTextEl = document.getElementById('headerDateText');
const headerWeekdayTextEl = document.getElementById('headerWeekdayText');
const pendingCountEl = document.getElementById('pendingCount');
const completedCountEl = document.getElementById('completedCount');
const calendarMonthLabelEl = document.getElementById('calendarMonthLabel');
const calendarDaysRowEl = document.getElementById('calendarDaysRow');
const todosListEl = document.getElementById('todosList');
const emptyStateEl = document.getElementById('emptyState');
const listSectionTitleEl = document.getElementById('listSectionTitle');
const listSectionBadgeEl = document.getElementById('listSectionBadge');
const toastContainerEl = document.getElementById('toastContainer');

// Buttons & Dialogs
const addTodoBtn = document.getElementById('addTodoBtn');
const todoDialog = document.getElementById('todoDialog');
const closeDialogBtn = document.getElementById('closeDialogBtn');
const cancelDialogBtn = document.getElementById('cancelDialogBtn');
const todoForm = document.getElementById('todoForm');
const dialogTitleEl = document.getElementById('dialogTitle');
const editTodoIdEl = document.getElementById('editTodoId');
const todoTitleInput = document.getElementById('todoTitleInput');
const todoDateInput = document.getElementById('todoDateInput');
const todoTimeInput = document.getElementById('todoTimeInput');
const todoCategoryInput = document.getElementById('todoCategoryInput');
const todoNotesInput = document.getElementById('todoNotesInput');
const categoryChips = document.getElementById('categoryChips');

const qrBtn = document.getElementById('qrBtn');
const qrDialog = document.getElementById('qrDialog');
const closeQrBtn = document.getElementById('closeQrBtn');
const qrImageEl = document.getElementById('qrImage');
const qrUrlTextEl = document.getElementById('qrUrlText');
const copyUrlBtn = document.getElementById('copyUrlBtn');

const prevWeekBtn = document.getElementById('prevWeekBtn');
const nextWeekBtn = document.getElementById('nextWeekBtn');
const todayShortcutBtn = document.getElementById('todayShortcutBtn');
const themeBtn = document.getElementById('themeBtn');

// ==========================================================================
// Modern Dialog Setup & Light-Dismiss Fallbacks (Modern Web Guidance)
// ==========================================================================
function setupDialogFallback(dialog) {
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (isDialogContent) return;
      dialog.close();
    });
  }
}
setupDialogFallback(todoDialog);
setupDialogFallback(qrDialog);

// ==========================================================================
// Toast Notification
// ==========================================================================
function showToast(message, icon = '✨') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  toastContainerEl.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

// ==========================================================================
// Theme Management
// ==========================================================================
function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
}
applyTheme(state.theme);

themeBtn.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  state.theme = newTheme;
  localStorage.setItem('todo_theme', newTheme);
  applyTheme(newTheme);
});

// ==========================================================================
// Calendar Strip Logic
// ==========================================================================
function getWeekDates(weekOffset) {
  const today = new Date();
  const currentDay = today.getDay(); // 0 is Sunday, 1 is Monday
  const distanceToMonday = (currentDay + 6) % 7;
  
  const monday = new Date(today);
  monday.setDate(today.getDate() - distanceToMonday + weekOffset * 7);

  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    week.push(d);
  }
  return week;
}

function renderCalendarStrip() {
  const week = getWeekDates(state.weekOffset);
  const todayStr = getFormattedDate(new Date());

  // Update month label based on the middle day of the week
  const midDay = week[3];
  calendarMonthLabelEl.textContent = `${midDay.getFullYear()}年 ${midDay.getMonth() + 1}月`;

  calendarDaysRowEl.innerHTML = '';
  const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];

  week.forEach((date, index) => {
    const dateStr = getFormattedDate(date);
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === state.selectedDate && state.activeFilter === 'current-date';
    
    // Check if there are active (uncompleted) todos on this date
    const hasTodos = state.todos.some((t) => t.date === dateStr && !t.completed);

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `day-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`;
    cell.setAttribute('role', 'tab');
    cell.setAttribute('aria-selected', isSelected);
    cell.dataset.date = dateStr;

    cell.innerHTML = `
      <span class="day-name">${dayLabels[index]}</span>
      <span class="day-num">${date.getDate()}</span>
      <span class="day-dot ${hasTodos ? 'has-todos' : ''}"></span>
    `;

    cell.addEventListener('click', () => {
      state.selectedDate = dateStr;
      state.activeFilter = 'current-date';
      updateFilterTabsUI();
      renderCalendarStrip();
      renderTodoList();
      updateHeaderDateDisplay();
    });

    calendarDaysRowEl.appendChild(cell);
  });
}

function updateHeaderDateDisplay() {
  const todayStr = getFormattedDate(new Date());
  if (state.activeFilter === 'current-date') {
    const targetDate = parseDateStr(state.selectedDate);
    headerDateTextEl.textContent = getFullChineseDate(targetDate);
    const isToday = state.selectedDate === todayStr;
    headerWeekdayTextEl.textContent = isToday ? `今天 · ${getDayOfWeekName(targetDate)}` : getDayOfWeekName(targetDate);
  } else if (state.activeFilter === 'all-pending') {
    headerDateTextEl.textContent = '全部待办事项';
    headerWeekdayTextEl.textContent = '按紧急度与日期排列';
  } else if (state.activeFilter === 'upcoming') {
    headerDateTextEl.textContent = '未来日程规划';
    headerWeekdayTextEl.textContent = '明天及以后的事项';
  } else if (state.activeFilter === 'completed') {
    headerDateTextEl.textContent = '已核销归档';
    headerWeekdayTextEl.textContent = '已完成的事项记录';
  }
}

// Calendar Navigation buttons
prevWeekBtn.addEventListener('click', () => {
  state.weekOffset -= 1;
  renderCalendarStrip();
});

nextWeekBtn.addEventListener('click', () => {
  state.weekOffset += 1;
  renderCalendarStrip();
});

todayShortcutBtn.addEventListener('click', () => {
  state.weekOffset = 0;
  state.selectedDate = getFormattedDate(new Date());
  state.activeFilter = 'current-date';
  updateFilterTabsUI();
  renderCalendarStrip();
  renderTodoList();
  updateHeaderDateDisplay();
});

// ==========================================================================
// Filter Tabs UI
// ==========================================================================
const filterTabs = document.querySelectorAll('.filter-tab');
function updateFilterTabsUI() {
  filterTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.filter === state.activeFilter);
  });
}

filterTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    state.activeFilter = tab.dataset.filter;
    updateFilterTabsUI();
    renderCalendarStrip();
    renderTodoList();
    updateHeaderDateDisplay();
  });
});

// ==========================================================================
// Category Chips in Modal
// ==========================================================================
categoryChips.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    categoryChips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    todoCategoryInput.value = chip.dataset.cat;
  });
});

// ==========================================================================
// Render Todos & Verification (核销)
// ==========================================================================
function renderTodoList() {
  const todayStr = getFormattedDate(new Date());
  let filtered = [];

  switch (state.activeFilter) {
    case 'current-date':
      listSectionTitleEl.textContent = `${state.selectedDate === todayStr ? '今日' : state.selectedDate} 事项`;
      filtered = state.todos.filter((t) => t.date === state.selectedDate);
      break;
    case 'all-pending':
      listSectionTitleEl.textContent = '全部待办';
      filtered = state.todos.filter((t) => !t.completed);
      break;
    case 'upcoming':
      listSectionTitleEl.textContent = '未来待办';
      filtered = state.todos.filter((t) => !t.completed && t.date > todayStr);
      break;
    case 'completed':
      listSectionTitleEl.textContent = '已核销记录';
      filtered = state.todos.filter((t) => t.completed);
      break;
  }

  // Sort: uncompleted first, then by priority (high > medium > low), then by time
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  filtered.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const pa = priorityOrder[a.priority] ?? 1;
    const pb = priorityOrder[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.time || '').localeCompare(b.time || '');
  });

  listSectionBadgeEl.textContent = `${filtered.length} 项`;
  todosListEl.innerHTML = '';

  if (filtered.length === 0) {
    emptyStateEl.style.display = 'block';
  } else {
    emptyStateEl.style.display = 'none';
    filtered.forEach((todo) => {
      const card = createTodoCardElement(todo);
      todosListEl.appendChild(card);
    });
  }

  // Update Stats Counters
  const pendingTotal = state.todos.filter((t) => !t.completed).length;
  const completedTotal = state.todos.filter((t) => t.completed).length;
  pendingCountEl.textContent = pendingTotal;
  completedCountEl.textContent = completedTotal;
}

function createTodoCardElement(todo) {
  const card = document.createElement('div');
  card.className = `todo-card ${todo.completed ? 'completed' : ''}`;
  card.id = `card-${todo.id}`;

  const priorityLabels = { high: '🔴 紧急', medium: '🟡 优先', low: '🟢 普通' };
  const priorityText = priorityLabels[todo.priority] || '普通';

  const timeHtml = todo.time ? `<span class="meta-chip chip-time">⏰ ${todo.time}</span>` : '';
  const dateHtml = state.activeFilter !== 'current-date' ? `<span class="meta-chip chip-time">📅 ${todo.date}</span>` : '';
  const notesHtml = todo.notes ? `<div class="todo-notes">${escapeHtml(todo.notes)}</div>` : '';
  const sourceLabel = todo.source === 'agent' ? '<span class="meta-chip chip-source">🤖 Agent</span>' : '';

  card.innerHTML = `
    <button class="check-btn" type="button" aria-label="${todo.completed ? '取消核销' : '完成核销'}" data-action="toggle">
      <div class="check-ring">
        <svg class="check-svg" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
    </button>
    <div class="todo-body">
      <div class="todo-title">${escapeHtml(todo.title)}</div>
      <div class="todo-meta">
        ${dateHtml}
        ${timeHtml}
        <span class="meta-chip chip-cat" data-cat="${escapeHtml(todo.category)}">${escapeHtml(todo.category)}</span>
        <span class="meta-chip chip-priority ${todo.priority}">${priorityText}</span>
        ${sourceLabel}
      </div>
      ${notesHtml}
    </div>
    <div class="todo-actions">
      <button class="card-action-btn" type="button" aria-label="编辑" data-action="edit" title="编辑">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </button>
      <button class="card-action-btn" type="button" aria-label="删除" data-action="delete" title="删除">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </div>
  `;

  // Event delegation on card
  card.querySelector('[data-action="toggle"]').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTodoVerification(todo);
  });

  card.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
    e.stopPropagation();
    openEditTodoDialog(todo);
  });

  card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTodoItem(todo);
  });

  return card;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

// ==========================================================================
// Verification (核销) Action
// ==========================================================================
async function toggleTodoVerification(todo) {
  const newStatus = !todo.completed;
  
  // Haptic feedback for mobile
  if (navigator.vibrate) {
    navigator.vibrate(35);
  }

  // Audio feedback
  if (newStatus) {
    sfx.playSuccess();
    showToast(`已核销: ${todo.title}`, '✅');
  } else {
    showToast(`已恢复为待办: ${todo.title}`, '↩️');
  }

  // Optimistic UI update
  todo.completed = newStatus;
  todo.completedAt = newStatus ? new Date().toISOString() : null;
  renderTodoList();
  renderCalendarStrip();

  try {
    const res = await fetch(`/api/todos/${encodeURIComponent(todo.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: newStatus })
    });
    if (!res.ok) throw new Error('网络请求失败');
  } catch (err) {
    console.error('核销失败:', err);
    showToast('核销保存失败，请检查网络连接', '⚠️');
    // Revert optimistic update
    todo.completed = !newStatus;
    renderTodoList();
    renderCalendarStrip();
  }
}

// ==========================================================================
// Delete Action
// ==========================================================================
async function deleteTodoItem(todo) {
  if (!confirm(`确定要删除待办事项「${todo.title}」吗？`)) return;

  state.todos = state.todos.filter((t) => t.id !== todo.id);
  renderTodoList();
  renderCalendarStrip();
  showToast(`已删除「${todo.title}」`, '🗑️');

  try {
    await fetch(`/api/todos/${encodeURIComponent(todo.id)}`, { method: 'DELETE' });
  } catch (err) {
    console.error('删除待办失败:', err);
    fetchTodos();
  }
}

// ==========================================================================
// Modal Operations (Add / Edit)
// ==========================================================================
function openAddTodoDialog() {
  dialogTitleEl.textContent = '新建待办事项';
  editTodoIdEl.value = '';
  todoTitleInput.value = '';
  todoDateInput.value = state.selectedDate;
  todoTimeInput.value = '';
  todoCategoryInput.value = '工作';
  todoNotesInput.value = '';

  categoryChips.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.cat === '工作');
  });

  const pMedium = document.querySelector('input[name="priority"][value="medium"]');
  if (pMedium) pMedium.checked = true;

  todoDialog.showModal();
}

function openEditTodoDialog(todo) {
  dialogTitleEl.textContent = '编辑待办事项';
  editTodoIdEl.value = todo.id;
  todoTitleInput.value = todo.title;
  todoDateInput.value = todo.date;
  todoTimeInput.value = todo.time || '';
  todoCategoryInput.value = todo.category || '工作';
  todoNotesInput.value = todo.notes || '';

  categoryChips.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.cat === (todo.category || '工作'));
  });

  const pRadio = document.querySelector(`input[name="priority"][value="${todo.priority}"]`);
  if (pRadio) pRadio.checked = true;

  todoDialog.showModal();
}

addTodoBtn.addEventListener('click', openAddTodoDialog);
closeDialogBtn.addEventListener('click', () => todoDialog.close());
cancelDialogBtn.addEventListener('click', () => todoDialog.close());

todoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = editTodoIdEl.value;
  const title = todoTitleInput.value.trim();
  const date = todoDateInput.value;
  const time = todoTimeInput.value;
  const category = todoCategoryInput.value;
  const priority = document.querySelector('input[name="priority"]:checked')?.value || 'medium';
  const notes = todoNotesInput.value.trim();

  if (!title) return;

  todoDialog.close();

  try {
    if (id) {
      // Edit
      const res = await fetch(`/api/todos/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, date, time, category, priority, notes })
      });
      if (res.ok) {
        showToast('已更新待办事项', '✏️');
      }
    } else {
      // Create
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, date, time, category, priority, notes, source: 'phone' })
      });
      if (res.ok) {
        showToast('新建待办成功', '🎉');
      }
    }
  } catch (err) {
    console.error('提交失败:', err);
    showToast('保存失败，请检查连接', '⚠️');
  }
});

// ==========================================================================
// QR Code & Mobile Connection Modal
// ==========================================================================
qrBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/network');
    const data = await res.json();
    state.networkInfo = data;
    qrImageEl.src = data.qrDataUrl;
    qrUrlTextEl.textContent = data.primaryUrl;
    qrDialog.showModal();
  } catch (err) {
    console.error('获取网络信息失败:', err);
    showToast('获取手机连接地址失败', '⚠️');
  }
});

closeQrBtn.addEventListener('click', () => qrDialog.close());

copyUrlBtn.addEventListener('click', () => {
  if (state.networkInfo?.primaryUrl) {
    navigator.clipboard.writeText(state.networkInfo.primaryUrl).then(() => {
      copyUrlBtn.textContent = '已复制！';
      setTimeout(() => copyUrlBtn.textContent = '复制网址', 2000);
    });
  }
});

// ==========================================================================
// Real-time Sync (Server-Sent Events)
// ==========================================================================
function setupSSE() {
  const evtSource = new EventSource('/api/events');

  evtSource.addEventListener('connected', () => {
    syncStatusEl.querySelector('.status-dot').className = 'status-dot online';
    syncStatusEl.querySelector('.status-label').textContent = 'Agent 实时在线';
  });

  evtSource.addEventListener('sync', (e) => {
    const data = JSON.parse(e.data);
    state.todos = data.todos;
    renderTodoList();
    renderCalendarStrip();
    showToast('已与电脑 Agent 状态同步', '🔄');
  });

  evtSource.addEventListener('todo_added', (e) => {
    const data = JSON.parse(e.data);
    state.todos = data.todos;
    renderTodoList();
    renderCalendarStrip();
    if (data.todo.source === 'agent') {
      showToast(`🤖 Agent 添加了新任务: ${data.todo.title}`, '📌');
    }
  });

  evtSource.addEventListener('todo_updated', (e) => {
    const data = JSON.parse(e.data);
    state.todos = data.todos;
    renderTodoList();
    renderCalendarStrip();
  });

  evtSource.addEventListener('todo_deleted', (e) => {
    const data = JSON.parse(e.data);
    state.todos = data.todos;
    renderTodoList();
    renderCalendarStrip();
  });

  evtSource.onerror = () => {
    syncStatusEl.querySelector('.status-dot').className = 'status-dot offline';
    syncStatusEl.querySelector('.status-label').textContent = '正在重新连接...';
  };
}

// Initial fetch
async function fetchTodos() {
  try {
    const res = await fetch('/api/todos');
    const data = await res.json();
    if (data.success) {
      state.todos = data.todos;
      renderTodoList();
      renderCalendarStrip();
      updateHeaderDateDisplay();
    }
  } catch (err) {
    console.error('获取待办列表失败:', err);
  }
}

// App Initialization
fetchTodos();
setupSSE();
renderCalendarStrip();
updateHeaderDateDisplay();

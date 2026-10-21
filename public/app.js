// ==========================================================================
// Modern Mobile Todo & Calendar App - with Rich Details, Links & Images
// ==========================================================================

const state = {
  todos: [],
  selectedDate: getFormattedDate(new Date()),
  weekOffset: 0,
  activeFilter: 'current-date', // 'current-date' | 'all-pending' | 'upcoming' | 'completed'
  theme: localStorage.getItem('todo_theme') || 'auto',
  activeDetailTodo: null,
  pendingFormImages: [],
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

function formatDisplayDateTime(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
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
      osc.frequency.setValueAtTime(587.33, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.12);
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

// Detail Dialog Elements
const detailDialog = document.getElementById('detailDialog');
const closeDetailBtn = document.getElementById('closeDetailBtn');
const detailCategoryTag = document.getElementById('detailCategoryTag');
const detailPriorityTag = document.getElementById('detailPriorityTag');
const detailSourceTag = document.getElementById('detailSourceTag');
const detailTitleEl = document.getElementById('detailTitle');
const detailStatusCard = document.getElementById('detailStatusCard');
const detailStatusDot = document.getElementById('detailStatusDot');
const detailStatusName = document.getElementById('detailStatusName');
const detailStatusSub = document.getElementById('detailStatusSub');
const detailToggleBtn = document.getElementById('detailToggleBtn');
const detailToggleIcon = document.getElementById('detailToggleIcon');
const detailToggleText = document.getElementById('detailToggleText');
const detailDueTime = document.getElementById('detailDueTime');
const detailCreateTime = document.getElementById('detailCreateTime');
const completedTimeItem = document.getElementById('completedTimeItem');
const detailCompletedTime = document.getElementById('detailCompletedTime');
const detailContentText = document.getElementById('detailContentText');
const detailLinksSection = document.getElementById('detailLinksSection');
const detailLinksCount = document.getElementById('detailLinksCount');
const detailLinksList = document.getElementById('detailLinksList');
const detailImagesSection = document.getElementById('detailImagesSection');
const detailImagesCount = document.getElementById('detailImagesCount');
const detailImagesGrid = document.getElementById('detailImagesGrid');
const detailEditBtn = document.getElementById('detailEditBtn');
const detailDeleteBtn = document.getElementById('detailDeleteBtn');

// Add / Edit Dialog Elements
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
const todoContentInput = document.getElementById('todoContentInput');
const todoLinksInput = document.getElementById('todoLinksInput');
const todoPhotoUpload = document.getElementById('todoPhotoUpload');
const todoImageUrlsInput = document.getElementById('todoImageUrlsInput');
const imageThumbnailsPreview = document.getElementById('imageThumbnailsPreview');
const categoryChips = document.getElementById('categoryChips');

// Lightbox & QR Dialog
const imagePreviewDialog = document.getElementById('imagePreviewDialog');
const closeLightboxBtn = document.getElementById('closeLightboxBtn');
const lightboxImg = document.getElementById('lightboxImg');

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
setupDialogFallback(detailDialog);
setupDialogFallback(todoDialog);
setupDialogFallback(qrDialog);
setupDialogFallback(imagePreviewDialog);

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
  const currentDay = today.getDay();
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

  const midDay = week[3];
  calendarMonthLabelEl.textContent = `${midDay.getFullYear()}年 ${midDay.getMonth() + 1}月`;

  calendarDaysRowEl.innerHTML = '';
  const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];

  week.forEach((date, index) => {
    const dateStr = getFormattedDate(date);
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === state.selectedDate && state.activeFilter === 'current-date';
    
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
    headerWeekdayTextEl.textContent = '按优先级与时间排列';
  } else if (state.activeFilter === 'upcoming') {
    headerDateTextEl.textContent = '未来日程规划';
    headerWeekdayTextEl.textContent = '明天及以后的事项';
  } else if (state.activeFilter === 'completed') {
    headerDateTextEl.textContent = '已核销归档';
    headerWeekdayTextEl.textContent = '已完成的事项记录';
  }
}

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

// Category Chips in Modal
categoryChips.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    categoryChips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    todoCategoryInput.value = chip.dataset.cat;
  });
});

// ==========================================================================
// Render Todos List
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
  
  // Attachments indicator
  const linkCount = Array.isArray(todo.links) ? todo.links.length : 0;
  const imgCount = Array.isArray(todo.images) ? todo.images.length : 0;
  let attachHtml = '';
  if (linkCount > 0 || imgCount > 0) {
    const items = [];
    if (linkCount > 0) items.push(`🔗${linkCount}`);
    if (imgCount > 0) items.push(`🖼️${imgCount}`);
    attachHtml = `<span class="meta-chip chip-attachment-indicator">${items.join(' ')}</span>`;
  }

  const sourceLabel = todo.source === 'agent' ? '<span class="meta-chip chip-source">🤖 Agent</span>' : '';
  
  const snippet = todo.content || todo.notes || '';
  const snippetHtml = snippet ? `<div class="todo-notes">${escapeHtml(snippet)}</div>` : '';

  card.innerHTML = `
    <button class="check-btn" type="button" aria-label="${todo.completed ? '取消核销' : '完成核销'}" data-action="toggle">
      <div class="check-ring">
        <svg class="check-svg" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
    </button>
    <div class="todo-body" data-action="open-detail">
      <div class="todo-title">${escapeHtml(todo.title)}</div>
      <div class="todo-meta">
        ${dateHtml}
        ${timeHtml}
        <span class="meta-chip chip-cat" data-cat="${escapeHtml(todo.category)}">${escapeHtml(todo.category)}</span>
        <span class="meta-chip chip-priority ${todo.priority}">${priorityText}</span>
        ${attachHtml}
        ${sourceLabel}
      </div>
      ${snippetHtml}
    </div>
    <div class="card-chevron" data-action="open-detail">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </div>
  `;

  // Checkbox: toggle completion
  card.querySelector('[data-action="toggle"]').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTodoVerification(todo);
  });

  // Tap anywhere else on the card: open full details
  card.addEventListener('click', () => {
    openTaskDetail(todo);
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

// Convert URLs in plain text to clickable anchor tags
function linkifyText(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
  return escaped.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline;">${url}</a>`;
  });
}

// ==========================================================================
// Task Detail Modal Logic (点进任务查看详细信息)
// ==========================================================================
function openTaskDetail(todo) {
  state.activeDetailTodo = todo;

  // Title
  detailTitleEl.textContent = todo.title;

  // Category & Priority
  detailCategoryTag.textContent = todo.category || '工作';
  detailCategoryTag.dataset.cat = todo.category || '工作';

  const priorityLabels = { high: '🔴 紧急重要', medium: '🟡 普通正常', low: '🟢 低优先' };
  detailPriorityTag.textContent = priorityLabels[todo.priority] || '普通';
  detailPriorityTag.className = `meta-chip chip-priority ${todo.priority}`;

  detailSourceTag.textContent = todo.source === 'agent' ? '🤖 电脑端 Agent' : '📱 手机添加';

  // Status & Action button
  updateDetailStatusUI(todo);

  // Time & Timeline Matrix
  const timeStr = todo.time ? ` ${todo.time}` : ' 全天';
  detailDueTime.textContent = `${todo.date}${timeStr}`;
  detailCreateTime.textContent = formatDisplayDateTime(todo.createdAt);

  if (todo.completed && todo.completedAt) {
    completedTimeItem.style.display = 'flex';
    detailCompletedTime.textContent = formatDisplayDateTime(todo.completedAt);
  } else {
    completedTimeItem.style.display = 'none';
  }

  // Content text
  const mainContent = todo.content || todo.notes || '（暂无具体描述内容）';
  detailContentText.innerHTML = linkifyText(mainContent);

  // Related Links
  const links = Array.isArray(todo.links) ? todo.links : [];
  if (links.length > 0) {
    detailLinksSection.style.display = 'block';
    detailLinksCount.textContent = links.length;
    detailLinksList.innerHTML = '';
    links.forEach((l) => {
      const card = document.createElement('a');
      card.className = 'link-card';
      card.href = l.url;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.innerHTML = `
        <span class="link-icon">🔗</span>
        <div class="link-info">
          <div class="link-title">${escapeHtml(l.title || l.url)}</div>
          <div class="link-url">${escapeHtml(l.url)}</div>
        </div>
        <span style="color: var(--text-dim); font-size: 14px;">↗</span>
      `;
      detailLinksList.appendChild(card);
    });
  } else {
    detailLinksSection.style.display = 'none';
  }

  // Related Images
  const images = Array.isArray(todo.images) ? todo.images : [];
  if (images.length > 0) {
    detailImagesSection.style.display = 'block';
    detailImagesCount.textContent = images.length;
    detailImagesGrid.innerHTML = '';
    images.forEach((imgUrl) => {
      const img = document.createElement('img');
      img.className = 'detail-img-thumb';
      img.src = imgUrl;
      img.alt = '任务附件图片';
      img.loading = 'lazy';
      img.addEventListener('click', () => {
        openImageLightbox(imgUrl);
      });
      detailImagesGrid.appendChild(img);
    });
  } else {
    detailImagesSection.style.display = 'none';
  }

  detailDialog.showModal();
}

function updateDetailStatusUI(todo) {
  if (todo.completed) {
    detailStatusDot.className = 'status-indicator-dot completed';
    detailStatusName.textContent = '已核销完成';
    detailStatusSub.textContent = `核销时间: ${formatDisplayDateTime(todo.completedAt)}`;
    detailToggleBtn.className = 'action-toggle-btn is-completed';
    detailToggleIcon.textContent = '↩️';
    detailToggleText.textContent = '恢复为待办';
  } else {
    detailStatusDot.className = 'status-indicator-dot';
    detailStatusName.textContent = '待完成';
    detailStatusSub.textContent = '点击右侧按钮核销此任务';
    detailToggleBtn.className = 'action-toggle-btn';
    detailToggleIcon.textContent = '✓';
    detailToggleText.textContent = '完成核销';
  }
}

// Toggle Complete from inside detail dialog
detailToggleBtn.addEventListener('click', async () => {
  if (!state.activeDetailTodo) return;
  await toggleTodoVerification(state.activeDetailTodo);
  updateDetailStatusUI(state.activeDetailTodo);
  if (state.activeDetailTodo.completed && state.activeDetailTodo.completedAt) {
    completedTimeItem.style.display = 'flex';
    detailCompletedTime.textContent = formatDisplayDateTime(state.activeDetailTodo.completedAt);
  } else {
    completedTimeItem.style.display = 'none';
  }
});

// Edit from inside detail dialog
detailEditBtn.addEventListener('click', () => {
  if (!state.activeDetailTodo) return;
  const target = state.activeDetailTodo;
  detailDialog.close();
  openEditTodoDialog(target);
});

// Delete from inside detail dialog
detailDeleteBtn.addEventListener('click', async () => {
  if (!state.activeDetailTodo) return;
  const target = state.activeDetailTodo;
  detailDialog.close();
  await deleteTodoItem(target);
});

closeDetailBtn.addEventListener('click', () => detailDialog.close());

// ==========================================================================
// Lightbox (图片全屏预览)
// ==========================================================================
function openImageLightbox(src) {
  lightboxImg.src = src;
  imagePreviewDialog.showModal();
}
closeLightboxBtn.addEventListener('click', () => imagePreviewDialog.close());

// ==========================================================================
// Verification (核销) Action
// ==========================================================================
async function toggleTodoVerification(todo) {
  const newStatus = !todo.completed;
  
  if (navigator.vibrate) {
    navigator.vibrate(35);
  }

  if (newStatus) {
    sfx.playSuccess();
    showToast(`已核销: ${todo.title}`, '✅');
  } else {
    showToast(`已恢复为待办: ${todo.title}`, '↩️');
  }

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
// Modal Operations (Add / Edit) with Photos & Links
// ==========================================================================
function openAddTodoDialog() {
  dialogTitleEl.textContent = '新建待办事项';
  editTodoIdEl.value = '';
  todoTitleInput.value = '';
  todoDateInput.value = state.selectedDate;
  todoTimeInput.value = '';
  todoCategoryInput.value = '工作';
  todoContentInput.value = '';
  todoLinksInput.value = '';
  todoImageUrlsInput.value = '';
  state.pendingFormImages = [];
  renderFormImageThumbnails();

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
  todoContentInput.value = todo.content || todo.notes || '';
  
  // Format links for textarea
  const links = Array.isArray(todo.links) ? todo.links : [];
  todoLinksInput.value = links.map((l) => (l.title ? `${l.title} | ${l.url}` : l.url)).join('\n');
  
  // Images
  state.pendingFormImages = Array.isArray(todo.images) ? [...todo.images] : [];
  todoImageUrlsInput.value = '';
  renderFormImageThumbnails();

  categoryChips.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.cat === (todo.category || '工作'));
  });

  const pRadio = document.querySelector(`input[name="priority"][value="${todo.priority}"]`);
  if (pRadio) pRadio.checked = true;

  todoDialog.showModal();
}

function renderFormImageThumbnails() {
  imageThumbnailsPreview.innerHTML = '';
  state.pendingFormImages.forEach((src, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'thumb-preview-wrap';
    wrap.innerHTML = `
      <img src="${src}" alt="预览">
      <button type="button" class="remove-thumb-btn" title="移除">&times;</button>
    `;
    wrap.querySelector('.remove-thumb-btn').addEventListener('click', () => {
      state.pendingFormImages.splice(idx, 1);
      renderFormImageThumbnails();
    });
    imageThumbnailsPreview.appendChild(wrap);
  });
}

// Handle Photo File Upload (compressed into base64 Data URL)
todoPhotoUpload.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  files.forEach((file) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Resize image if larger than 1200px to keep storage lightweight
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDimension = 1200;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        state.pendingFormImages.push(compressedDataUrl);
        renderFormImageThumbnails();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
  todoPhotoUpload.value = '';
});

addTodoBtn.addEventListener('click', openAddTodoDialog);
closeDialogBtn.addEventListener('click', () => todoDialog.close());
cancelDialogBtn.addEventListener('click', () => todoDialog.close());

// Form submit
todoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = editTodoIdEl.value;
  const title = todoTitleInput.value.trim();
  const date = todoDateInput.value;
  const time = todoTimeInput.value;
  const category = todoCategoryInput.value;
  const priority = document.querySelector('input[name="priority"]:checked')?.value || 'medium';
  const content = todoContentInput.value.trim();

  // Parse links
  const linksRaw = todoLinksInput.value.trim().split('\n');
  const links = [];
  linksRaw.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.includes('|')) {
      const [t, u] = trimmed.split('|');
      links.push({ title: t.trim(), url: u.trim() });
    } else {
      links.push({ title: trimmed, url: trimmed });
    }
  });

  // Parse Image URLs input and combine with uploaded photos
  const pastedImages = todoImageUrlsInput.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const images = [...state.pendingFormImages, ...pastedImages];

  if (!title) return;

  todoDialog.close();

  try {
    if (id) {
      // Edit
      const res = await fetch(`/api/todos/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, date, time, category, priority, content, notes: content, links, images })
      });
      if (res.ok) {
        showToast('已更新待办事项与详细内容', '✏️');
      }
    } else {
      // Create
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, date, time, category, priority, content, notes: content, links, images, source: 'phone' })
      });
      if (res.ok) {
        showToast('新建待办成功', '🎉');
      }
    }
  } catch (err) {
    console.error('提交失败:', err);
    showToast('保存失败，请检查网络连接', '⚠️');
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
    syncStatusEl.querySelector('.status-label').textContent = '实时在线';
  });

  evtSource.addEventListener('sync', (e) => {
    const data = JSON.parse(e.data);
    state.todos = data.todos;
    renderTodoList();
    renderCalendarStrip();
    showToast('已与云端状态同步', '🔄');
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
    syncStatusEl.querySelector('.status-label').textContent = '连接中断，重试中...';
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

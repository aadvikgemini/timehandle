/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Smart Student Productivity Dashboard
 * Pure Vanilla JavaScript Application Logic
 */

// ============================================================================
// 1. APPLICATION STATE & STORAGE ENGINE
// ============================================================================

const STORAGE_KEYS = {
  TASKS: 'student_tasks',
  NOTES: 'student_notes',
  SESSIONS: 'student_study_sessions',
  GOALS: 'student_daily_goals',
  PREFERENCES: 'student_user_preferences',
  TIMER_STATE: 'student_timer_state',
  STREAKS: 'student_streak_cache'
};

const DEFAULT_GOALS = {
  studyGoalMinutes: 120,
  taskGoalCount: 5
};

const DEFAULT_PREFERENCES = {
  theme: 'dark',
  soundEnabled: true
};

const AppState = {
  tasks: [],
  notes: [],
  sessions: [],
  goals: { ...DEFAULT_GOALS },
  preferences: { ...DEFAULT_PREFERENCES },
  activeView: 'dashboard',
  searchQuery: '',
  taskFilter: {
    status: 'all',
    priority: 'all',
    deadline: 'all',
    category: 'all',
    sort: 'default'
  },
  noteSearchQuery: '',
  noteCategoryFilter: 'all',
  analyticsMetric: 'study',
  timer: {
    mode: 'focus', // focus | shortBreak | longBreak | custom
    durationSeconds: 25 * 60,
    remainingSeconds: 25 * 60,
    isRunning: false,
    intervalId: null,
    targetTimestamp: null,
    totalSecondsToday: 0
  }
};

/**
 * Storage Helpers
 */
const Storage = {
  save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error(`Error saving to localStorage key "${key}":`, e);
      Toast.show('Error saving data to browser storage', 'error');
    }
  },

  load(key, fallback = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : fallback;
    } catch (e) {
      console.error(`Error parsing localStorage key "${key}":`, e);
      return fallback;
    }
  },

  loadAll() {
    AppState.tasks = this.load(STORAGE_KEYS.TASKS, []);
    AppState.notes = this.load(STORAGE_KEYS.NOTES, []);
    AppState.sessions = this.load(STORAGE_KEYS.SESSIONS, []);
    AppState.goals = this.load(STORAGE_KEYS.GOALS, { ...DEFAULT_GOALS });
    AppState.preferences = this.load(STORAGE_KEYS.PREFERENCES, { ...DEFAULT_PREFERENCES });

    // Restore timer if persisted
    const savedTimer = this.load(STORAGE_KEYS.TIMER_STATE, null);
    if (savedTimer && typeof savedTimer.remainingSeconds === 'number') {
      AppState.timer.mode = savedTimer.mode || 'focus';
      AppState.timer.durationSeconds = savedTimer.durationSeconds || 25 * 60;
      AppState.timer.remainingSeconds = savedTimer.remainingSeconds;
      // If was running, adjust for elapsed wall-clock time
      if (savedTimer.isRunning && savedTimer.targetTimestamp) {
        const remaining = Math.max(0, Math.round((savedTimer.targetTimestamp - Date.now()) / 1000));
        AppState.timer.remainingSeconds = remaining;
      }
    }
  },

  saveAll() {
    this.save(STORAGE_KEYS.TASKS, AppState.tasks);
    this.save(STORAGE_KEYS.NOTES, AppState.notes);
    this.save(STORAGE_KEYS.SESSIONS, AppState.sessions);
    this.save(STORAGE_KEYS.GOALS, AppState.goals);
    this.save(STORAGE_KEYS.PREFERENCES, AppState.preferences);
  },

  saveTimerState() {
    this.save(STORAGE_KEYS.TIMER_STATE, {
      mode: AppState.timer.mode,
      durationSeconds: AppState.timer.durationSeconds,
      remainingSeconds: AppState.timer.remainingSeconds,
      isRunning: AppState.timer.isRunning,
      targetTimestamp: AppState.timer.targetTimestamp
    });
  },

  exportJSON() {
    const dataToExport = {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      tasks: AppState.tasks,
      notes: AppState.notes,
      studySessions: AppState.sessions,
      dailyGoals: AppState.goals,
      preferences: AppState.preferences
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToExport, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `student-productivity-backup-${getFormattedDateSlug(new Date())}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    Toast.show("Productivity backup exported successfully!", "success");
  },

  importJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON format');
      }

      // Validate arrays/objects
      if (Array.isArray(parsed.tasks)) AppState.tasks = parsed.tasks;
      if (Array.isArray(parsed.notes)) AppState.notes = parsed.notes;
      if (Array.isArray(parsed.studySessions)) AppState.sessions = parsed.studySessions;
      if (parsed.dailyGoals && typeof parsed.dailyGoals === 'object') {
        AppState.goals = { ...DEFAULT_GOALS, ...parsed.dailyGoals };
      }
      if (parsed.preferences && typeof parsed.preferences === 'object') {
        AppState.preferences = { ...DEFAULT_PREFERENCES, ...parsed.preferences };
      }

      this.saveAll();
      ThemeManager.applyTheme(AppState.preferences.theme || 'light');
      renderAllViews();
      Toast.show("Data imported and restored successfully!", "success");
    } catch (err) {
      console.error("Failed to import JSON:", err);
      Toast.show("Invalid backup file. Could not import.", "error");
    }
  },

  clearAllData() {
    AppState.tasks = [];
    AppState.notes = [];
    AppState.sessions = [];
    AppState.goals = { ...DEFAULT_GOALS };
    localStorage.removeItem(STORAGE_KEYS.TASKS);
    localStorage.removeItem(STORAGE_KEYS.NOTES);
    localStorage.removeItem(STORAGE_KEYS.SESSIONS);
    localStorage.removeItem(STORAGE_KEYS.GOALS);
    localStorage.removeItem(STORAGE_KEYS.TIMER_STATE);
    localStorage.removeItem(STORAGE_KEYS.STREAKS);
    renderAllViews();
    Toast.show("All workspace data has been cleared.", "info");
  }
};

// ============================================================================
// 2. MOTIVATIONAL QUOTES REPOSITORY
// ============================================================================

const MOTIVATIONAL_QUOTES = [
  { text: "Continuous learning is the minimum requirement for success in any field.", author: "Brian Tracy" },
  { text: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma" },
  { text: "Focus is a muscle. The more you practice single-tasking, the stronger you get.", author: "Cal Newport" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  { text: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
  { text: "Deep work is the ability to focus without distraction on a cognitively demanding task.", author: "Cal Newport" },
  { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { text: "Your future is created by what you do today, not tomorrow.", author: "Robert Kiyosaki" },
  { text: "Consistency is more important than perfection.", author: "James Clear" }
];

function updateDailyQuote() {
  const quoteTextElem = document.getElementById('daily-quote-text');
  const quoteAuthorElem = document.getElementById('daily-quote-author');
  if (!quoteTextElem || !quoteAuthorElem) return;

  const randomIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
  const q = MOTIVATIONAL_QUOTES[randomIndex];
  quoteTextElem.textContent = q.text;
  quoteAuthorElem.textContent = `— ${q.author}`;
}

// ============================================================================
// 3. TOAST NOTIFICATIONS & AUDIO CHIME
// ============================================================================

const Toast = {
  show(message, type = 'info', duration = 3200) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }
};

/**
 * Web Audio API gentle bell sound generator
 */
function playCompletionChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const now = ctx.currentTime;
    // Harmonic pleasant bell chime: 523.25Hz (C5), 659.25Hz (E5), 783.99Hz (G5)
    [523.25, 659.25, 783.99].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.12);

      gain.gain.setValueAtTime(0.2, now + index * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * 0.12);
      osc.stop(now + index * 0.12 + 1.3);
    });
  } catch (e) {
    console.warn("Audio chime playback blocked or not supported:", e);
  }
}

// ============================================================================
// 4. THEME & LIVE CLOCK MANAGERS
// ============================================================================

const ThemeManager = {
  init() {
    const savedTheme = AppState.preferences.theme || 'dark';
    this.applyTheme(savedTheme);

    const toggleBtn = document.getElementById('btn-theme-toggle');
    const sidebarToggleBtn = document.getElementById('btn-theme-toggle-sidebar');
    const settingsToggleBtn = document.getElementById('btn-settings-toggle-theme');

    const handleToggle = () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      this.applyTheme(newTheme);
      AppState.preferences.theme = newTheme;
      Storage.save(STORAGE_KEYS.PREFERENCES, AppState.preferences);
      Toast.show(`Switched to ${newTheme} mode`, 'info');
    };

    if (toggleBtn) toggleBtn.addEventListener('click', handleToggle);
    if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', handleToggle);
    if (settingsToggleBtn) settingsToggleBtn.addEventListener('click', handleToggle);
  },

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const themeIcons = document.querySelectorAll('.theme-icon');
    themeIcons.forEach(icon => {
      if (theme === 'dark') {
        icon.innerHTML = `<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>`;
      } else {
        icon.innerHTML = `<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>`;
      }
    });
  }
};

function initLiveClock() {
  const greetingEl = document.getElementById('live-greeting');
  const subgreetingEl = document.getElementById('live-subgreeting');
  const datetimeEl = document.getElementById('live-datetime');

  function update() {
    const now = new Date();
    const hours = now.getHours();

    let greeting = 'Good evening 👋';
    let sub = 'Reflect on today and finish your evening study strong.';
    if (hours >= 5 && hours < 12) {
      greeting = 'Good morning 👋';
      sub = 'Ready to tackle your academic goals today?';
    } else if (hours >= 12 && hours < 17) {
      greeting = 'Good afternoon 👋';
      sub = 'Keep up the momentum with focused study sessions.';
    }

    if (greetingEl) greetingEl.textContent = greeting;
    if (subgreetingEl) subgreetingEl.textContent = sub;

    if (datetimeEl) {
      const options = { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' };
      datetimeEl.textContent = now.toLocaleDateString('en-US', options);
    }
  }

  update();
  setInterval(update, 1000);
}

// ============================================================================
// 5. NAVIGATION & VIEW ROUTING
// ============================================================================

function switchView(viewName) {
  const sections = document.querySelectorAll('.view-section');
  const navLinks = document.querySelectorAll('[data-nav]');

  let targetFound = false;
  sections.forEach(sec => {
    if (sec.id === `view-${viewName}`) {
      sec.classList.add('active');
      targetFound = true;
    } else {
      sec.classList.remove('active');
    }
  });

  if (!targetFound) return;

  AppState.activeView = viewName;
  window.location.hash = viewName;

  navLinks.forEach(link => {
    if (link.getAttribute('data-nav') === viewName) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Re-render relevant view components
  if (viewName === 'dashboard') renderDashboard();
  if (viewName === 'tasks') renderTasks();
  if (viewName === 'timer') updateTimerUI();
  if (viewName === 'notes') renderNotes();
  if (viewName === 'analytics') renderAnalytics();
  if (viewName === 'settings') renderSettings();

  // Close mobile sidebar if open
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
}

function initNavigation() {
  document.querySelectorAll('[data-nav]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-nav');
      if (view) switchView(view);
    });
  });

  // Mobile menu toggle
  const mobileMenuBtn = document.getElementById('btn-mobile-menu');
  const sidebar = document.getElementById('sidebar');
  if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  // Handle URL hash on load
  const hash = window.location.hash.replace('#', '');
  if (hash && ['dashboard', 'tasks', 'timer', 'notes', 'analytics', 'settings'].includes(hash)) {
    switchView(hash);
  } else {
    switchView('dashboard');
  }
}

// ============================================================================
// 6. TASK MANAGER MODULE
// ============================================================================

function getUniqueCategories() {
  const cats = new Set();
  AppState.tasks.forEach(t => {
    if (t.category && t.category.trim()) cats.add(t.category.trim());
  });
  return Array.from(cats);
}

function updateCategoryDropdowns() {
  const categories = getUniqueCategories();
  const taskCatSelect = document.getElementById('filter-task-category');
  const noteCatSelect = document.getElementById('filter-note-category');

  if (taskCatSelect) {
    const currentVal = taskCatSelect.value;
    taskCatSelect.innerHTML = '<option value="all">Category: All</option>';
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      taskCatSelect.appendChild(opt);
    });
    taskCatSelect.value = currentVal;
  }

  if (noteCatSelect) {
    const currentVal = noteCatSelect.value;
    const noteCats = new Set();
    AppState.notes.forEach(n => {
      if (n.category && n.category.trim()) noteCats.add(n.category.trim());
    });
    noteCatSelect.innerHTML = '<option value="all">Category: All</option>';
    noteCats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      noteCatSelect.appendChild(opt);
    });
    noteCatSelect.value = currentVal;
  }
}

function filterAndSortTasks(tasksList) {
  let filtered = [...tasksList];

  // 1. Search Query
  if (AppState.searchQuery && AppState.searchQuery.trim()) {
    const q = AppState.searchQuery.toLowerCase().trim();
    filtered = filtered.filter(t => 
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.description && t.description.toLowerCase().includes(q)) ||
      (t.category && t.category.toLowerCase().includes(q))
    );
  }

  // 2. Status Filter
  if (AppState.taskFilter.status !== 'all') {
    const isCompleted = AppState.taskFilter.status === 'completed';
    filtered = filtered.filter(t => Boolean(t.completed) === isCompleted);
  }

  // 3. Priority Filter
  if (AppState.taskFilter.priority !== 'all') {
    filtered = filtered.filter(t => t.priority === AppState.taskFilter.priority);
  }

  // 4. Category Filter
  if (AppState.taskFilter.category !== 'all') {
    filtered = filtered.filter(t => t.category === AppState.taskFilter.category);
  }

  // 5. Deadline Filter
  if (AppState.taskFilter.deadline !== 'all') {
    const todayStr = getFormattedDateSlug(new Date());
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getFormattedDateSlug(tomorrow);

    filtered = filtered.filter(t => {
      if (!t.deadline) return false;
      const dStr = t.deadline;
      if (AppState.taskFilter.deadline === 'today') return dStr === todayStr;
      if (AppState.taskFilter.deadline === 'tomorrow') return dStr === tomorrowStr;
      if (AppState.taskFilter.deadline === 'overdue') return dStr < todayStr && !t.completed;
      if (AppState.taskFilter.deadline === 'upcoming') return dStr >= todayStr;
      return true;
    });
  }

  // 6. Sort
  const sort = AppState.taskFilter.sort;
  if (sort === 'deadline') {
    filtered.sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.localeCompare(b.deadline);
    });
  } else if (sort === 'priority') {
    const weight = { high: 3, medium: 2, low: 1 };
    filtered.sort((a, b) => (weight[b.priority] || 0) - (weight[a.priority] || 0));
  } else if (sort === 'title') {
    filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (sort === 'newest') {
    filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  return filtered;
}

function renderTasks() {
  const container = document.getElementById('tasks-list-container');
  const navTaskCount = document.getElementById('nav-task-count');
  if (!container) return;

  const pendingCount = AppState.tasks.filter(t => !t.completed).length;
  if (navTaskCount) navTaskCount.textContent = pendingCount;

  const filteredTasks = filterAndSortTasks(AppState.tasks);

  if (filteredTasks.length === 0) {
    if (AppState.tasks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <h4 class="empty-state-title">No tasks yet 🎯</h4>
          <p class="empty-state-text">Add your first academic assignment or study task to organize your schedule.</p>
          <button class="btn btn-primary btn-sm" id="btn-empty-add-task">Create First Task</button>
        </div>
      `;
      const btn = document.getElementById('btn-empty-add-task');
      if (btn) btn.addEventListener('click', openAddTaskModal);
    } else {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" x2="16.65" y1="21" y2="16.65"></line>
            </svg>
          </div>
          <h4 class="empty-state-title">No matching tasks found</h4>
          <p class="empty-state-text">Try adjusting your search terms or clearing active filters.</p>
          <button class="btn btn-secondary btn-sm" id="btn-clear-filters">Reset Filters</button>
        </div>
      `;
      const resetBtn = document.getElementById('btn-clear-filters');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          AppState.searchQuery = '';
          AppState.taskFilter = { status: 'all', priority: 'all', deadline: 'all', category: 'all', sort: 'default' };
          const searchInput = document.getElementById('tasks-search-input');
          if (searchInput) searchInput.value = '';
          const filterStatus = document.getElementById('filter-task-status');
          if (filterStatus) filterStatus.value = 'all';
          const filterPriority = document.getElementById('filter-task-priority');
          if (filterPriority) filterPriority.value = 'all';
          const filterDeadline = document.getElementById('filter-task-deadline');
          if (filterDeadline) filterDeadline.value = 'all';
          const filterCategory = document.getElementById('filter-task-category');
          if (filterCategory) filterCategory.value = 'all';
          const filterSort = document.getElementById('filter-task-sort');
          if (filterSort) filterSort.value = 'default';
          renderTasks();
        });
      }
    }
    return;
  }

  container.innerHTML = '';

  filteredTasks.forEach((task, index) => {
    const taskEl = document.createElement('div');
    taskEl.className = `task-card ${task.completed ? 'completed' : ''}`;
    taskEl.setAttribute('draggable', 'true');
    taskEl.setAttribute('data-task-id', task.id);
    taskEl.setAttribute('data-index', index);

    // Deadline formatting
    let deadlineBadge = '';
    if (task.deadline) {
      const todayStr = getFormattedDateSlug(new Date());
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = getFormattedDateSlug(tomorrow);

      let deadlineClass = 'badge-deadline';
      let deadlineText = task.deadline;

      if (task.deadline < todayStr && !task.completed) {
        deadlineClass += ' overdue';
        deadlineText = `⚠️ Overdue (${task.deadline})`;
      } else if (task.deadline === todayStr) {
        deadlineClass += ' today';
        deadlineText = `📅 Due Today`;
      } else if (task.deadline === tomorrowStr) {
        deadlineText = `📅 Due Tomorrow`;
      } else {
        deadlineText = `📅 Due ${task.deadline}`;
      }

      deadlineBadge = `<span class="badge ${deadlineClass}">${deadlineText}</span>`;
    }

    const priorityBadge = `<span class="badge badge-priority-${task.priority || 'medium'}">${capitalize(task.priority || 'medium')} Priority</span>`;
    const categoryBadge = task.category ? `<span class="badge badge-category">🏷️ ${escapeHtml(task.category)}</span>` : '';
    const estimateBadge = task.estimatedMinutes ? `<span class="badge badge-estimate">⏱️ ${task.estimatedMinutes}m</span>` : '';

    taskEl.innerHTML = `
      <div class="task-left">
        <div class="drag-handle" title="Drag to reorder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="12" r="1"></circle>
            <circle cx="9" cy="5" r="1"></circle>
            <circle cx="9" cy="19" r="1"></circle>
            <circle cx="15" cy="12" r="1"></circle>
            <circle cx="15" cy="5" r="1"></circle>
            <circle cx="15" cy="19" r="1"></circle>
          </svg>
        </div>
        <div class="task-checkbox-wrap">
          <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} aria-label="Mark task complete" />
        </div>
        <div class="task-info">
          <div class="task-title">${escapeHtml(task.title)}</div>
          ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
          <div class="task-meta-tags">
            ${priorityBadge}
            ${categoryBadge}
            ${deadlineBadge}
            ${estimateBadge}
          </div>
        </div>
      </div>
      <div class="task-actions">
        <button class="task-action-btn edit-task" title="Edit Task" aria-label="Edit Task">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="task-action-btn delete delete-task" title="Delete Task" aria-label="Delete Task">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    // Bind event listeners on card
    const checkbox = taskEl.querySelector('.task-checkbox');
    checkbox.addEventListener('change', () => toggleTaskCompleted(task.id));

    const editBtn = taskEl.querySelector('.edit-task');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditTaskModal(task.id);
    });

    const deleteBtn = taskEl.querySelector('.delete-task');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteTask(task.id);
    });

    // Native HTML5 Drag and Drop Handlers
    taskEl.addEventListener('dragstart', handleDragStart);
    taskEl.addEventListener('dragover', handleDragOver);
    taskEl.addEventListener('drop', handleDrop);
    taskEl.addEventListener('dragend', handleDragEnd);

    container.appendChild(taskEl);
  });
}

// Drag & Drop reordering
let draggedTaskId = null;

function handleDragStart(e) {
  draggedTaskId = this.getAttribute('data-task-id');
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedTaskId);
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  this.classList.add('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');
  const targetTaskId = this.getAttribute('data-task-id');
  if (!draggedTaskId || draggedTaskId === targetTaskId) return;

  const srcIndex = AppState.tasks.findIndex(t => t.id === draggedTaskId);
  const targetIndex = AppState.tasks.findIndex(t => t.id === targetTaskId);

  if (srcIndex !== -1 && targetIndex !== -1) {
    const [moved] = AppState.tasks.splice(srcIndex, 1);
    AppState.tasks.splice(targetIndex, 0, moved);
    Storage.save(STORAGE_KEYS.TASKS, AppState.tasks);
    renderTasks();
    renderDashboard();
    Toast.show("Task order updated", "info");
  }
}

function handleDragEnd() {
  this.classList.remove('dragging');
  document.querySelectorAll('.task-card').forEach(card => card.classList.remove('drag-over'));
  draggedTaskId = null;
}

function toggleTaskCompleted(taskId) {
  const task = AppState.tasks.find(t => t.id === taskId);
  if (!task) return;

  task.completed = !task.completed;
  task.completedAt = task.completed ? new Date().toISOString() : null;

  Storage.save(STORAGE_KEYS.TASKS, AppState.tasks);
  renderAllViews();

  if (task.completed) {
    Toast.show(`✓ Task "${task.title}" completed!`, "success");
    checkGoalAchievements();
  }
}

function openAddTaskModal() {
  document.getElementById('task-modal-title').textContent = 'Add New Task';
  document.getElementById('task-id-input').value = '';
  document.getElementById('task-title-input').value = '';
  document.getElementById('task-desc-input').value = '';
  document.getElementById('task-priority-input').value = 'medium';
  document.getElementById('task-deadline-input').value = getFormattedDateSlug(new Date());
  document.getElementById('task-category-input').value = '';
  document.getElementById('task-estimate-input').value = '30';

  Modal.open('task-modal');
  setTimeout(() => document.getElementById('task-title-input').focus(), 100);
}

function openEditTaskModal(taskId) {
  const task = AppState.tasks.find(t => t.id === taskId);
  if (!task) return;

  document.getElementById('task-modal-title').textContent = 'Edit Task';
  document.getElementById('task-id-input').value = task.id;
  document.getElementById('task-title-input').value = task.title || '';
  document.getElementById('task-desc-input').value = task.description || '';
  document.getElementById('task-priority-input').value = task.priority || 'medium';
  document.getElementById('task-deadline-input').value = task.deadline || '';
  document.getElementById('task-category-input').value = task.category || '';
  document.getElementById('task-estimate-input').value = task.estimatedMinutes || '';

  Modal.open('task-modal');
  setTimeout(() => document.getElementById('task-title-input').focus(), 100);
}

function saveTaskFromModal(e) {
  e.preventDefault();
  const id = document.getElementById('task-id-input').value;
  const title = document.getElementById('task-title-input').value.trim();
  const desc = document.getElementById('task-desc-input').value.trim();
  const priority = document.getElementById('task-priority-input').value;
  const deadline = document.getElementById('task-deadline-input').value;
  const category = document.getElementById('task-category-input').value.trim();
  const estimate = parseInt(document.getElementById('task-estimate-input').value, 10) || 0;

  if (!title) {
    Toast.show('Task title cannot be empty', 'error');
    return;
  }

  if (id) {
    // Edit existing
    const task = AppState.tasks.find(t => t.id === id);
    if (task) {
      task.title = title;
      task.description = desc;
      task.priority = priority;
      task.deadline = deadline;
      task.category = category;
      task.estimatedMinutes = estimate;
      task.updatedAt = new Date().toISOString();
      Toast.show('Task updated successfully!', 'success');
    }
  } else {
    // Create new
    const newTask = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title,
      description: desc,
      priority,
      deadline,
      category,
      estimatedMinutes: estimate,
      completed: false,
      createdAt: new Date().toISOString()
    };
    AppState.tasks.unshift(newTask);
    Toast.show('New task created!', 'success');
  }

  Storage.save(STORAGE_KEYS.TASKS, AppState.tasks);
  updateCategoryDropdowns();
  renderAllViews();
  Modal.close('task-modal');
}

function confirmDeleteTask(taskId) {
  const task = AppState.tasks.find(t => t.id === taskId);
  if (!task) return;

  Modal.confirm(
    `Delete task "${escapeHtml(task.title)}"? This action cannot be undone.`,
    () => {
      AppState.tasks = AppState.tasks.filter(t => t.id !== taskId);
      Storage.save(STORAGE_KEYS.TASKS, AppState.tasks);
      updateCategoryDropdowns();
      renderAllViews();
      Toast.show('Task deleted', 'info');
    }
  );
}

// ============================================================================
// 7. STUDY TIMER MODULE
// ============================================================================

const TIMER_PRESETS = {
  focus: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60
};

function initStudyTimer() {
  const playBtn = document.getElementById('btn-timer-toggle');
  const resetBtn = document.getElementById('btn-timer-reset');
  const skipBtn = document.getElementById('btn-timer-skip');
  const add5Btn = document.getElementById('btn-timer-add5');
  const tabFocus = document.getElementById('tab-mode-focus');
  const tabShort = document.getElementById('tab-mode-short');
  const tabLong = document.getElementById('tab-mode-long');
  const customBtn = document.getElementById('btn-open-custom-timer');

  if (playBtn) playBtn.addEventListener('click', toggleTimer);
  if (resetBtn) resetBtn.addEventListener('click', resetTimer);
  if (skipBtn) skipBtn.addEventListener('click', skipTimer);
  if (add5Btn) add5Btn.addEventListener('click', add5MinutesToTimer);

  if (tabFocus) tabFocus.addEventListener('click', () => setTimerMode('focus'));
  if (tabShort) tabShort.addEventListener('click', () => setTimerMode('shortBreak'));
  if (tabLong) tabLong.addEventListener('click', () => setTimerMode('longBreak'));
  if (customBtn) customBtn.addEventListener('click', () => Modal.open('custom-timer-modal'));

  const customForm = document.getElementById('custom-timer-form');
  if (customForm) {
    customForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const hrs = parseInt(document.getElementById('custom-timer-hours').value, 10) || 0;
      const mins = parseInt(document.getElementById('custom-timer-minutes').value, 10) || 0;
      const totalSec = (hrs * 3600) + (mins * 60);

      if (totalSec <= 0) {
        Toast.show('Please enter at least 1 minute', 'error');
        return;
      }

      setCustomTimer(totalSec);
      Modal.close('custom-timer-modal');
    });
  }

  updateTimerUI();
}

function setTimerMode(mode) {
  if (AppState.timer.isRunning) {
    pauseTimer();
  }

  AppState.timer.mode = mode;
  AppState.timer.durationSeconds = TIMER_PRESETS[mode] || 25 * 60;
  AppState.timer.remainingSeconds = AppState.timer.durationSeconds;

  document.querySelectorAll('.timer-tab').forEach(tab => {
    if (tab.getAttribute('data-mode') === mode) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  Storage.saveTimerState();
  updateTimerUI();
}

function setCustomTimer(totalSeconds) {
  if (AppState.timer.isRunning) {
    pauseTimer();
  }

  AppState.timer.mode = 'custom';
  AppState.timer.durationSeconds = totalSeconds;
  AppState.timer.remainingSeconds = totalSeconds;

  document.querySelectorAll('.timer-tab').forEach(tab => tab.classList.remove('active'));

  Storage.saveTimerState();
  updateTimerUI();
  Toast.show(`Custom timer set for ${Math.round(totalSeconds / 60)} minutes`, 'info');
}

function toggleTimer() {
  if (AppState.timer.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  if (AppState.timer.remainingSeconds <= 0) {
    AppState.timer.remainingSeconds = AppState.timer.durationSeconds;
  }

  AppState.timer.isRunning = true;
  AppState.timer.targetTimestamp = Date.now() + (AppState.timer.remainingSeconds * 1000);

  if (AppState.timer.intervalId) clearInterval(AppState.timer.intervalId);

  AppState.timer.intervalId = setInterval(() => {
    AppState.timer.remainingSeconds--;

    if (AppState.timer.remainingSeconds <= 0) {
      AppState.timer.remainingSeconds = 0;
      completeTimerSession();
    }

    updateTimerUI();
    Storage.saveTimerState();
  }, 1000);

  updateTimerUI();
  Storage.saveTimerState();
  Toast.show('Timer started. Stay focused!', 'info');
}

function pauseTimer() {
  AppState.timer.isRunning = false;
  if (AppState.timer.intervalId) {
    clearInterval(AppState.timer.intervalId);
    AppState.timer.intervalId = null;
  }
  AppState.timer.targetTimestamp = null;
  updateTimerUI();
  Storage.saveTimerState();
  Toast.show('Timer paused', 'info');
}

function resetTimer() {
  pauseTimer();
  AppState.timer.remainingSeconds = AppState.timer.durationSeconds;
  updateTimerUI();
  Storage.saveTimerState();
  Toast.show('Timer reset', 'info');
}

function skipTimer() {
  pauseTimer();
  if (AppState.timer.mode === 'focus' || AppState.timer.mode === 'custom') {
    setTimerMode('shortBreak');
  } else {
    setTimerMode('focus');
  }
  Toast.show('Switched to next session mode', 'info');
}

function add5MinutesToTimer() {
  AppState.timer.remainingSeconds += 5 * 60;
  AppState.timer.durationSeconds += 5 * 60;
  if (AppState.timer.isRunning) {
    AppState.timer.targetTimestamp += 5 * 60 * 1000;
  }
  updateTimerUI();
  Storage.saveTimerState();
  Toast.show('+5 minutes added to session', 'info');
}

function completeTimerSession() {
  pauseTimer();
  playCompletionChime();

  const isFocus = AppState.timer.mode === 'focus' || AppState.timer.mode === 'custom';
  const durationSec = AppState.timer.durationSeconds;
  const durationMin = Math.max(1, Math.round(durationSec / 60));

  if (isFocus) {
    // Record study session log
    const sessionLog = {
      id: 'sess_' + Date.now(),
      durationMinutes: durationMin,
      type: AppState.timer.mode,
      date: getFormattedDateSlug(new Date()),
      timestamp: new Date().toISOString(),
      completed: true
    };
    AppState.sessions.push(sessionLog);
    Storage.save(STORAGE_KEYS.SESSIONS, AppState.sessions);

    Toast.show(`🎉 Great job! You completed a ${durationMin}m focus session!`, 'success', 5000);
    updateDailyQuote();
    checkGoalAchievements();
    renderAllViews();

    // Suggest break
    setTimeout(() => {
      Modal.confirm(
        `Focus block finished! Would you like to start a 5-minute break now?`,
        () => {
          setTimerMode('shortBreak');
          startTimer();
        }
      );
    }, 600);
  } else {
    Toast.show('☕ Break finished! Ready for another focus session?', 'info', 4500);
    setTimerMode('focus');
  }
}

function updateTimerUI() {
  const digitsEl = document.getElementById('timer-digits-display');
  const modeLabelEl = document.getElementById('timer-mode-display');
  const statusSubtextEl = document.getElementById('timer-status-subtext');
  const ringEl = document.getElementById('timer-progress-ring');
  const playIcon = document.getElementById('timer-icon-play');
  const pauseIcon = document.getElementById('timer-icon-pause');
  const completedTodayEl = document.getElementById('timer-sessions-completed');
  const studyTodayEl = document.getElementById('timer-today-time');
  const focusTargetEl = document.getElementById('timer-focus-target');

  const sec = AppState.timer.remainingSeconds;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

  if (digitsEl) digitsEl.textContent = timeStr;

  // Title in tab
  if (AppState.timer.isRunning) {
    document.title = `(${timeStr}) StudyPulse Focus`;
  } else {
    document.title = `Smart Student Productivity Dashboard`;
  }

  // Ring circumference = 2 * PI * 130 ~= 816.8
  const circumference = 816.8;
  if (ringEl && AppState.timer.durationSeconds > 0) {
    const progress = Math.max(0, Math.min(1, sec / AppState.timer.durationSeconds));
    const offset = circumference * (1 - progress);
    ringEl.style.strokeDashoffset = offset.toString();

    if (AppState.timer.mode === 'shortBreak' || AppState.timer.mode === 'longBreak') {
      ringEl.style.stroke = 'var(--success)';
    } else {
      ringEl.style.stroke = 'var(--primary)';
    }
  }

  if (modeLabelEl) {
    if (AppState.timer.mode === 'focus') modeLabelEl.textContent = 'Focus Session';
    else if (AppState.timer.mode === 'shortBreak') modeLabelEl.textContent = 'Short Break';
    else if (AppState.timer.mode === 'longBreak') modeLabelEl.textContent = 'Long Break';
    else modeLabelEl.textContent = 'Custom Session';
  }

  if (statusSubtextEl) {
    if (AppState.timer.isRunning) {
      statusSubtextEl.textContent = 'Session in progress... Stay focused!';
    } else if (sec === AppState.timer.durationSeconds) {
      statusSubtextEl.textContent = 'Ready to focus';
    } else {
      statusSubtextEl.textContent = 'Session paused';
    }
  }

  if (playIcon && pauseIcon) {
    if (AppState.timer.isRunning) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
    } else {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
    }
  }

  // Session stats for today
  const todayStr = getFormattedDateSlug(new Date());
  const todaySessions = AppState.sessions.filter(s => s.date === todayStr);
  const totalMinsToday = todaySessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);

  if (completedTodayEl) completedTodayEl.textContent = todaySessions.length;
  if (studyTodayEl) studyTodayEl.textContent = `${totalMinsToday}m`;
  if (focusTargetEl) focusTargetEl.textContent = `${AppState.goals.studyGoalMinutes || 120}m`;
}

// ============================================================================
// 8. NOTES SYSTEM MODULE
// ============================================================================

function filterNotes(notesList) {
  let filtered = [...notesList];

  if (AppState.noteSearchQuery && AppState.noteSearchQuery.trim()) {
    const q = AppState.noteSearchQuery.toLowerCase().trim();
    filtered = filtered.filter(n =>
      (n.title && n.title.toLowerCase().includes(q)) ||
      (n.content && n.content.toLowerCase().includes(q)) ||
      (n.category && n.category.toLowerCase().includes(q))
    );
  }

  if (AppState.noteCategoryFilter !== 'all') {
    filtered = filtered.filter(n => n.category === AppState.noteCategoryFilter);
  }

  // Sort by latest updated
  filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

  return filtered;
}

function renderNotes() {
  const container = document.getElementById('notes-grid-container');
  if (!container) return;

  const filteredNotes = filterNotes(AppState.notes);

  if (filteredNotes.length === 0) {
    if (AppState.notes.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
          </div>
          <h4 class="empty-state-title">No notes yet 📝</h4>
          <p class="empty-state-text">Create notes to store study formulas, summaries, and revision reminders.</p>
          <button class="btn btn-primary btn-sm" id="btn-empty-add-note">Create First Note</button>
        </div>
      `;
      const btn = document.getElementById('btn-empty-add-note');
      if (btn) btn.addEventListener('click', openAddNoteModal);
    } else {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" x2="16.65" y1="21" y2="16.65"></line>
            </svg>
          </div>
          <h4 class="empty-state-title">No matching notes found</h4>
          <p class="empty-state-text">Try searching for other keywords.</p>
        </div>
      `;
    }
    return;
  }

  container.innerHTML = '';

  filteredNotes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'note-card';

    const lastEditedDate = note.updatedAt ? new Date(note.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently';

    card.innerHTML = `
      <div>
        <div class="note-header">
          <div class="note-title">${escapeHtml(note.title)}</div>
          <div class="note-actions">
            <button class="task-action-btn edit-note" title="Edit Note" aria-label="Edit Note">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="task-action-btn delete delete-note" title="Delete Note" aria-label="Delete Note">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="note-body">${escapeHtml(note.content)}</div>
      </div>
      <div class="note-footer">
        <span class="note-tag">${note.category ? escapeHtml(note.category) : 'General'}</span>
        <span>Edited: ${lastEditedDate}</span>
      </div>
    `;

    card.addEventListener('click', () => openEditNoteModal(note.id));

    const editBtn = card.querySelector('.edit-note');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditNoteModal(note.id);
    });

    const deleteBtn = card.querySelector('.delete-note');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteNote(note.id);
    });

    container.appendChild(card);
  });
}

function openAddNoteModal() {
  document.getElementById('note-modal-title').textContent = 'Create New Note';
  document.getElementById('note-id-input').value = '';
  document.getElementById('note-title-input').value = '';
  document.getElementById('note-category-input').value = '';
  document.getElementById('note-content-input').value = '';

  Modal.open('note-modal');
  setTimeout(() => document.getElementById('note-title-input').focus(), 100);
}

function openEditNoteModal(noteId) {
  const note = AppState.notes.find(n => n.id === noteId);
  if (!note) return;

  document.getElementById('note-modal-title').textContent = 'Edit Note';
  document.getElementById('note-id-input').value = note.id;
  document.getElementById('note-title-input').value = note.title || '';
  document.getElementById('note-category-input').value = note.category || '';
  document.getElementById('note-content-input').value = note.content || '';

  Modal.open('note-modal');
  setTimeout(() => document.getElementById('note-title-input').focus(), 100);
}

function saveNoteFromModal(e) {
  e.preventDefault();
  const id = document.getElementById('note-id-input').value;
  const title = document.getElementById('note-title-input').value.trim();
  const category = document.getElementById('note-category-input').value.trim();
  const content = document.getElementById('note-content-input').value.trim();

  if (!title || !content) {
    Toast.show('Title and content are required', 'error');
    return;
  }

  if (id) {
    const note = AppState.notes.find(n => n.id === id);
    if (note) {
      note.title = title;
      note.category = category;
      note.content = content;
      note.updatedAt = new Date().toISOString();
      Toast.show('Note updated!', 'success');
    }
  } else {
    const newNote = {
      id: 'note_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title,
      category,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    AppState.notes.unshift(newNote);
    Toast.show('New note created!', 'success');
  }

  Storage.save(STORAGE_KEYS.NOTES, AppState.notes);
  updateCategoryDropdowns();
  renderNotes();
  Modal.close('note-modal');
}

function confirmDeleteNote(noteId) {
  const note = AppState.notes.find(n => n.id === noteId);
  if (!note) return;

  Modal.confirm(`Delete note "${escapeHtml(note.title)}"?`, () => {
    AppState.notes = AppState.notes.filter(n => n.id !== noteId);
    Storage.save(STORAGE_KEYS.NOTES, AppState.notes);
    updateCategoryDropdowns();
    renderNotes();
    Toast.show('Note deleted', 'info');
  });
}

// ============================================================================
// 9. PRODUCTIVITY, STREAKS & GOALS ENGINE
// ============================================================================

/**
 * Calculates current streak and longest streak
 * A day is productive if >= 1 task completed OR >= 1 study session logged
 */
function calculateStreak() {
  const activeDates = new Set();

  // Task completion dates
  AppState.tasks.forEach(t => {
    if (t.completed && t.completedAt) {
      activeDates.add(t.completedAt.split('T')[0]);
    }
  });

  // Study session dates
  AppState.sessions.forEach(s => {
    if (s.completed && s.date) {
      activeDates.add(s.date);
    }
  });

  if (activeDates.size === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  const sortedDates = Array.from(activeDates).sort();
  const todayStr = getFormattedDateSlug(new Date());

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getFormattedDateSlug(yesterday);

  // Compute current streak backward
  let currentStreak = 0;
  let checkDate = new Date();

  // Check if today or yesterday was active
  if (activeDates.has(todayStr)) {
    currentStreak = 1;
    checkDate.setDate(checkDate.getDate() - 1);
  } else if (activeDates.has(yesterdayStr)) {
    currentStreak = 1;
    checkDate.setDate(checkDate.getDate() - 2);
  } else {
    currentStreak = 0;
  }

  if (currentStreak > 0) {
    while (true) {
      const dStr = getFormattedDateSlug(checkDate);
      if (activeDates.has(dStr)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  // Compute longest streak across all history
  let longestStreak = 0;
  let tempStreak = 0;
  let prevTimestamp = null;

  sortedDates.forEach(dStr => {
    const d = new Date(dStr + 'T00:00:00');
    const ts = d.getTime();

    if (prevTimestamp === null) {
      tempStreak = 1;
    } else {
      const diffDays = Math.round((ts - prevTimestamp) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }
    if (tempStreak > longestStreak) longestStreak = tempStreak;
    prevTimestamp = ts;
  });

  if (currentStreak > longestStreak) longestStreak = currentStreak;

  return { currentStreak, longestStreak };
}

/**
 * Calculates daily productivity score between 0% and 100%
 */
function calculateProductivityScore() {
  const todayStr = getFormattedDateSlug(new Date());

  // 1. Task Score (target vs completed)
  const taskGoal = AppState.goals.taskGoalCount || 5;
  const completedTodayTasks = AppState.tasks.filter(t => t.completed && t.completedAt && t.completedAt.startsWith(todayStr)).length;
  const taskScore = Math.min(100, Math.round((completedTodayTasks / taskGoal) * 100));

  // 2. Study Score (target vs actual)
  const studyGoal = AppState.goals.studyGoalMinutes || 120;
  const studyTodaySessions = AppState.sessions.filter(s => s.date === todayStr);
  const studyMinutesToday = studyTodaySessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const studyScore = Math.min(100, Math.round((studyMinutesToday / studyGoal) * 100));

  // Average combined score
  const combined = Math.round((taskScore + studyScore) / 2);

  return {
    score: Math.min(100, Math.max(0, combined)),
    completedTodayTasks,
    studyMinutesToday,
    taskGoal,
    studyGoal,
    taskScore,
    studyScore
  };
}

function checkGoalAchievements() {
  const prod = calculateProductivityScore();
  if (prod.score >= 100) {
    Toast.show('🎯 Outstanding! 100% of your daily productivity goal achieved!', 'success', 4000);
  }
}

// ============================================================================
// 10. DASHBOARD RENDERER
// ============================================================================

function renderDashboard() {
  const prod = calculateProductivityScore();
  const { currentStreak, longestStreak } = calculateStreak();

  // 1. Update Statistics Cards
  const totalTasks = AppState.tasks.length;
  const completedTasks = AppState.tasks.filter(t => t.completed).length;
  const pendingTasks = totalTasks - completedTasks;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const totalStudyMinutes = AppState.sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const totalHours = Math.floor(totalStudyMinutes / 60);
  const remMinutes = totalStudyMinutes % 60;
  const formattedStudyTime = `${totalHours}h ${remMinutes.toString().padStart(2, '0')}m`;

  const statTotal = document.getElementById('stat-total-tasks');
  const statPendingSub = document.getElementById('stat-pending-tasks-subtext');
  const statCompleted = document.getElementById('stat-completed-tasks');
  const statCompSub = document.getElementById('stat-completion-rate-subtext');
  const statStudy = document.getElementById('stat-study-time');
  const statTodayStudySub = document.getElementById('stat-today-study-subtext');
  const statStreak = document.getElementById('stat-streak-value');
  const statLongestStreakSub = document.getElementById('stat-longest-streak-subtext');
  const statDailyScore = document.getElementById('stat-daily-productivity');
  const sidebarStreakText = document.getElementById('sidebar-streak-text');

  if (statTotal) statTotal.textContent = totalTasks;
  if (statPendingSub) statPendingSub.textContent = `${pendingTasks} pending tasks`;
  if (statCompleted) statCompleted.textContent = completedTasks;
  if (statCompSub) statCompSub.textContent = `${completionRate}% completion rate`;
  if (statStudy) statStudy.textContent = formattedStudyTime;
  if (statTodayStudySub) statTodayStudySub.textContent = `${prod.studyMinutesToday}m logged today`;
  if (statStreak) statStreak.textContent = `🔥 ${currentStreak} days`;
  if (statLongestStreakSub) statLongestStreakSub.textContent = `Best: ${longestStreak} days`;
  if (statDailyScore) statDailyScore.textContent = `${prod.score}%`;
  if (sidebarStreakText) sidebarStreakText.textContent = `${currentStreak} day streak`;

  // 2. Goal Progress Bars
  const goalStudyFraction = document.getElementById('goal-study-fraction');
  const goalStudyBar = document.getElementById('goal-study-progress-bar');
  const goalTaskFraction = document.getElementById('goal-task-fraction');
  const goalTaskBar = document.getElementById('goal-task-progress-bar');

  if (goalStudyFraction) {
    goalStudyFraction.textContent = `${prod.studyMinutesToday} / ${prod.studyGoal} mins (${prod.studyScore}%)`;
  }
  if (goalStudyBar) {
    goalStudyBar.style.width = `${Math.min(100, prod.studyScore)}%`;
  }

  if (goalTaskFraction) {
    goalTaskFraction.textContent = `${prod.completedTodayTasks} / ${prod.taskGoal} tasks (${prod.taskScore}%)`;
  }
  if (goalTaskBar) {
    goalTaskBar.style.width = `${Math.min(100, prod.taskScore)}%`;
  }

  // 3. Priority Focus Tasks Container
  const priorityContainer = document.getElementById('dashboard-priority-tasks-container');
  if (priorityContainer) {
    const priorityTasks = AppState.tasks.filter(t => !t.completed).slice(0, 4);

    if (priorityTasks.length === 0) {
      priorityContainer.innerHTML = `
        <div class="empty-state" style="padding: 1.5rem 0;">
          <h4 class="empty-state-title" style="font-size: 0.95rem;">All caught up! 🎉</h4>
          <p class="empty-state-text" style="font-size: 0.8rem; margin-bottom: 0.75rem;">No pending tasks for today. Add a new task to plan ahead.</p>
          <button class="btn btn-primary btn-sm" id="btn-dash-create-task">+ Add Task</button>
        </div>
      `;
      const btn = document.getElementById('btn-dash-create-task');
      if (btn) btn.addEventListener('click', openAddTaskModal);
    } else {
      priorityContainer.innerHTML = '';
      priorityTasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'task-card';
        item.style.padding = '0.75rem 1rem';

        const priorityBadge = `<span class="badge badge-priority-${task.priority || 'medium'}">${capitalize(task.priority || 'medium')}</span>`;
        const deadlineText = task.deadline ? `<span class="badge badge-deadline">📅 ${task.deadline}</span>` : '';

        item.innerHTML = `
          <div class="task-left">
            <div class="task-checkbox-wrap">
              <input type="checkbox" class="task-checkbox" aria-label="Complete task" />
            </div>
            <div class="task-info">
              <div class="task-title" style="font-size: 0.9rem;">${escapeHtml(task.title)}</div>
              <div class="task-meta-tags">${priorityBadge} ${deadlineText}</div>
            </div>
          </div>
        `;

        const check = item.querySelector('.task-checkbox');
        check.addEventListener('change', () => toggleTaskCompleted(task.id));
        priorityContainer.appendChild(item);
      });
    }
  }

  // 4. Recent Study Sessions Feed
  const recentFeed = document.getElementById('dashboard-recent-sessions');
  if (recentFeed) {
    const recent = [...AppState.sessions].reverse().slice(0, 3);
    if (recent.length === 0) {
      recentFeed.innerHTML = `
        <p style="font-size: 0.825rem; color: var(--text-muted); text-align: center; padding: 1rem 0;">
          No study sessions recorded yet.<br>Start a 25m Pomodoro block to log your study time!
        </p>
      `;
    } else {
      recentFeed.innerHTML = '';
      recent.forEach(s => {
        const el = document.createElement('div');
        el.style.display = 'flex';
        el.style.justifyContent = 'space-between';
        el.style.alignItems = 'center';
        el.style.padding = '0.5rem 0.75rem';
        el.style.borderRadius = 'var(--radius-sm)';
        el.style.backgroundColor = 'var(--bg-surface-hover)';
        el.style.fontSize = '0.825rem';

        el.innerHTML = `
          <div>
            <strong>${s.type === 'focus' ? '🎯 Focus Session' : '⏱️ Study Block'}</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${s.date}</div>
          </div>
          <span class="badge badge-priority-low">+${s.durationMinutes}m</span>
        `;
        recentFeed.appendChild(el);
      });
    }
  }
}

// ============================================================================
// 11. ANALYTICS & WEEKLY CHART MODULE
// ============================================================================

function renderAnalytics() {
  const prod = calculateProductivityScore();
  const { currentStreak, longestStreak } = calculateStreak();

  const totalTasks = AppState.tasks.length;
  const completedTasks = AppState.tasks.filter(t => t.completed).length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const totalStudyMinutes = AppState.sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const totalHours = Math.floor(totalStudyMinutes / 60);
  const remMinutes = totalStudyMinutes % 60;

  // Active days count for average
  const sessionDates = new Set(AppState.sessions.map(s => s.date));
  const activeDaysCount = Math.max(1, sessionDates.size);
  const avgMinutesPerDay = Math.round(totalStudyMinutes / activeDaysCount);

  const scoreVal = document.getElementById('analytics-score-val');
  const studyTotal = document.getElementById('analytics-study-total');
  const avgDaily = document.getElementById('analytics-avg-daily');
  const currentStreakEl = document.getElementById('analytics-current-streak');
  const longestStreakEl = document.getElementById('analytics-longest-streak');
  const taskRateEl = document.getElementById('analytics-task-rate');
  const taskRatioEl = document.getElementById('analytics-tasks-ratio');

  if (scoreVal) scoreVal.textContent = `${prod.score}%`;
  if (studyTotal) studyTotal.textContent = `${totalHours}h ${remMinutes}m`;
  if (avgDaily) avgDaily.textContent = `Avg ${avgMinutesPerDay}m / active day`;
  if (currentStreakEl) currentStreakEl.textContent = `${currentStreak} days`;
  if (longestStreakEl) longestStreakEl.textContent = `Record: ${longestStreak} days`;
  if (taskRateEl) taskRateEl.textContent = `${completionRate}%`;
  if (taskRatioEl) taskRatioEl.textContent = `${completedTasks} of ${totalTasks} tasks completed`;

  renderWeeklyChart();
  renderCategoryBreakdown();
}

/**
 * Pure Vanilla JS interactive Bar Chart for Mon-Sun of current week
 */
function renderWeeklyChart() {
  const chartContainer = document.getElementById('weekly-chart-container');
  if (!chartContainer) return;

  const metric = AppState.analyticsMetric || 'study';

  // Compute dates for Monday through Sunday of current week
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon...
  const distanceToMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - distanceToMonday);

  const daysData = [];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dStr = getFormattedDateSlug(d);
    const isToday = dStr === getFormattedDateSlug(now);

    // Study minutes for that date
    const daySessions = AppState.sessions.filter(s => s.date === dStr);
    const studyMins = daySessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);

    // Tasks completed on that date
    const tasksDone = AppState.tasks.filter(t => t.completed && t.completedAt && t.completedAt.startsWith(dStr)).length;

    // Daily score
    const targetTask = AppState.goals.taskGoalCount || 5;
    const targetStudy = AppState.goals.studyGoalMinutes || 120;
    const tScore = Math.min(100, Math.round((tasksDone / targetTask) * 100));
    const sScore = Math.min(100, Math.round((studyMins / targetStudy) * 100));
    const dayScore = Math.round((tScore + sScore) / 2);

    let displayValue = 0;
    let tooltipText = '';

    if (metric === 'study') {
      displayValue = studyMins;
      tooltipText = `${studyMins} minutes study`;
    } else if (metric === 'tasks') {
      displayValue = tasksDone;
      tooltipText = `${tasksDone} tasks done`;
    } else {
      displayValue = dayScore;
      tooltipText = `${dayScore}% productivity`;
    }

    daysData.push({
      dayName: dayNames[i],
      dateStr: dStr,
      isToday,
      value: displayValue,
      tooltip: tooltipText
    });
  }

  // Calculate highest for relative heights
  const maxValue = Math.max(...daysData.map(d => d.value), metric === 'score' ? 100 : 10);

  chartContainer.innerHTML = '';

  daysData.forEach(d => {
    const col = document.createElement('div');
    col.className = `chart-bar-column ${d.isToday ? 'today' : ''}`;

    const percentHeight = maxValue > 0 ? Math.max(4, Math.round((d.value / maxValue) * 100)) : 4;

    col.innerHTML = `
      <div class="chart-tooltip">${escapeHtml(d.tooltip)} (${d.dayName})</div>
      <div class="chart-bar-track">
        <div class="chart-bar-fill" style="height: ${percentHeight}%;"></div>
      </div>
      <span class="chart-bar-label">${d.dayName}</span>
    `;

    chartContainer.appendChild(col);
  });
}

function renderCategoryBreakdown() {
  const container = document.getElementById('analytics-category-list');
  if (!container) return;

  const categoryMap = {};
  AppState.tasks.forEach(t => {
    const cat = t.category && t.category.trim() ? t.category.trim() : 'General';
    categoryMap[cat] = (categoryMap[cat] || 0) + 1;
  });

  const categories = Object.keys(categoryMap);
  const totalTasks = AppState.tasks.length;

  if (categories.length === 0) {
    container.innerHTML = `
      <p style="font-size: 0.825rem; color: var(--text-muted); text-align: center; padding: 1.5rem 0;">
        No categorized tasks yet.
      </p>
    `;
    return;
  }

  container.innerHTML = '';

  categories.forEach(cat => {
    const count = categoryMap[cat];
    const percentage = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;

    const item = document.createElement('div');
    item.className = 'category-stat-item';
    item.innerHTML = `
      <div class="category-stat-meta">
        <span>🏷️ ${escapeHtml(cat)}</span>
        <span>${count} tasks (${percentage}%)</span>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill fill-primary" style="width: ${percentage}%;"></div>
      </div>
    `;
    container.appendChild(item);
  });
}

// ============================================================================
// 12. SETTINGS MODULE & PREFERENCES
// ============================================================================

function renderSettings() {
  const studyInput = document.getElementById('setting-study-goal');
  const taskInput = document.getElementById('setting-task-goal');

  if (studyInput) studyInput.value = AppState.goals.studyGoalMinutes || 120;
  if (taskInput) taskInput.value = AppState.goals.taskGoalCount || 5;
}

function initSettings() {
  const saveGoalsBtn = document.getElementById('btn-save-goals-settings');
  const exportBtn = document.getElementById('btn-export-data');
  const triggerImportBtn = document.getElementById('btn-trigger-import');
  const importFileInput = document.getElementById('import-file-input');
  const loadDemoSettingsBtn = document.getElementById('btn-load-demo-settings');
  const clearDataBtn = document.getElementById('btn-clear-all-data');

  if (saveGoalsBtn) {
    saveGoalsBtn.addEventListener('click', () => {
      const studyMins = parseInt(document.getElementById('setting-study-goal').value, 10) || 120;
      const taskCount = parseInt(document.getElementById('setting-task-goal').value, 10) || 5;

      AppState.goals.studyGoalMinutes = Math.max(15, studyMins);
      AppState.goals.taskGoalCount = Math.max(1, taskCount);

      Storage.save(STORAGE_KEYS.GOALS, AppState.goals);
      renderAllViews();
      Toast.show('Daily productivity goals updated!', 'success');
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => Storage.exportJSON());
  }

  if (triggerImportBtn && importFileInput) {
    triggerImportBtn.addEventListener('click', () => importFileInput.click());

    importFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      Modal.confirm(
        'Importing this backup may replace or merge your existing workspace data. Continue?',
        () => {
          const reader = new FileReader();
          reader.onload = (event) => {
            Storage.importJSON(event.target.result);
            importFileInput.value = '';
          };
          reader.readAsText(file);
        }
      );
    });
  }

  if (loadDemoSettingsBtn) {
    loadDemoSettingsBtn.addEventListener('click', () => {
      Modal.confirm('Load demo academic coursework data to test dashboard features?', () => {
        loadDemoDataset();
      });
    });
  }

  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', () => {
      Modal.confirm(
        'Are you sure you want to delete ALL tasks, notes, sessions, and streaks? This action cannot be undone.',
        () => Storage.clearAllData()
      );
    });
  }
}

// ============================================================================
// 13. DEMO DATA LOADER (COURSEWORK DATASET)
// ============================================================================

function loadDemoDataset() {
  const todayStr = getFormattedDateSlug(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = getFormattedDateSlug(tomorrow);

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 4);
  const nextWeekStr = getFormattedDateSlug(nextWeek);

  AppState.tasks = [
    {
      id: 'task_demo_1',
      title: 'Complete CS 201 Data Structures Lab 4',
      description: 'Implement AVL Tree balancing and unit tests in Python/C++',
      priority: 'high',
      deadline: todayStr,
      category: 'Computer Science',
      estimatedMinutes: 60,
      completed: true,
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    },
    {
      id: 'task_demo_2',
      title: 'Read Calculus Chapter 5 on Integration by Parts',
      description: 'Solve practice problems 1-15 on textbook page 240',
      priority: 'high',
      deadline: tomorrowStr,
      category: 'Calculus',
      estimatedMinutes: 45,
      completed: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'task_demo_3',
      title: 'Write Psychology 101 Essay Outline',
      description: 'Compare Cognitive Behavioral Therapy and Behavioral Activation frameworks',
      priority: 'medium',
      deadline: nextWeekStr,
      category: 'Psychology',
      estimatedMinutes: 40,
      completed: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'task_demo_4',
      title: 'Physics Lab Report: Rotational Dynamics',
      description: 'Plot moment of inertia graphs and format LaTeX tables',
      priority: 'medium',
      deadline: tomorrowStr,
      category: 'Physics',
      estimatedMinutes: 50,
      completed: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'task_demo_5',
      title: 'Review World History Flashcards for Midterm',
      description: 'Industrial Revolution cause-effect timelines and key treaty terms',
      priority: 'low',
      deadline: nextWeekStr,
      category: 'History',
      estimatedMinutes: 30,
      completed: true,
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }
  ];

  AppState.notes = [
    {
      id: 'note_demo_1',
      title: 'Big-O Cheat Sheet (CS 201)',
      category: 'Computer Science',
      content: `Hash Table: O(1) avg insert/search
Binary Search Tree: O(log n) avg, O(n) worst
QuickSort: O(n log n) avg, O(n²) worst
MergeSort: O(n log n) guaranteed, O(n) space`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'note_demo_2',
      title: 'Calculus Derivative Rules',
      category: 'Calculus',
      content: `Product Rule: (f·g)' = f'g + fg'
Quotient Rule: (f/g)' = (f'g - fg') / g²
Chain Rule: [f(g(x))]' = f'(g(x)) · g'(x)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'note_demo_3',
      title: 'Active Recall & Spaced Repetition Protocol',
      category: 'General Study',
      content: `1. Blurting method after reading 10 pages
2. Flashcard review intervals: Day 1, Day 3, Day 7, Day 14
3. Teach difficult concepts out loud in simple terms (Feynman Technique)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  AppState.sessions = [
    {
      id: 'sess_demo_1',
      durationMinutes: 25,
      type: 'focus',
      date: todayStr,
      timestamp: new Date().toISOString(),
      completed: true
    },
    {
      id: 'sess_demo_2',
      durationMinutes: 45,
      type: 'custom',
      date: todayStr,
      timestamp: new Date().toISOString(),
      completed: true
    }
  ];

  // Seed yesterday & 2 days ago sessions to create an active study streak
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dayBefore = new Date();
  dayBefore.setDate(dayBefore.getDate() - 2);

  AppState.sessions.push({
    id: 'sess_demo_prev1',
    durationMinutes: 50,
    type: 'focus',
    date: getFormattedDateSlug(yesterday),
    timestamp: yesterday.toISOString(),
    completed: true
  });

  AppState.sessions.push({
    id: 'sess_demo_prev2',
    durationMinutes: 60,
    type: 'focus',
    date: getFormattedDateSlug(dayBefore),
    timestamp: dayBefore.toISOString(),
    completed: true
  });

  Storage.saveAll();
  updateCategoryDropdowns();
  renderAllViews();
  Toast.show('Sample academic dataset loaded successfully!', 'success');
}

// ============================================================================
// 14. MODAL DIALOG CONTROLLER
// ============================================================================

const Modal = {
  open(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  close(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
  },

  confirm(message, onConfirmCallback) {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-modal-message');
    const confirmBtn = document.getElementById('btn-confirm-accept');

    if (!modal || !msgEl || !confirmBtn) return;

    msgEl.textContent = message;

    // Clone button to strip existing event listeners
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', () => {
      Modal.close('confirm-modal');
      if (typeof onConfirmCallback === 'function') onConfirmCallback();
    });

    Modal.open('confirm-modal');
  }
};

function initModals() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      if (modalId) Modal.close(modalId);
    });
  });

  // Close when clicking overlay backdrop
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        Modal.close(overlay.id);
      }
    });
  });

  // Forms
  const taskForm = document.getElementById('task-form');
  if (taskForm) taskForm.addEventListener('submit', saveTaskFromModal);

  const noteForm = document.getElementById('note-form');
  if (noteForm) noteForm.addEventListener('submit', saveNoteFromModal);

  const openTaskBtn = document.getElementById('btn-open-task-modal');
  const quickNewTaskBtn = document.getElementById('btn-quick-new-task');
  const dashAddTaskBtn = document.getElementById('btn-quick-add-task');
  if (openTaskBtn) openTaskBtn.addEventListener('click', openAddTaskModal);
  if (quickNewTaskBtn) quickNewTaskBtn.addEventListener('click', openAddTaskModal);
  if (dashAddTaskBtn) dashAddTaskBtn.addEventListener('click', openAddTaskModal);

  const openNoteBtn = document.getElementById('btn-open-note-modal');
  const dashAddNoteBtn = document.getElementById('btn-quick-add-note');
  if (openNoteBtn) openNoteBtn.addEventListener('click', openAddNoteModal);
  if (dashAddNoteBtn) dashAddNoteBtn.addEventListener('click', openAddNoteModal);

  const quickFocusBtn = document.getElementById('btn-quick-focus-session');
  if (quickFocusBtn) {
    quickFocusBtn.addEventListener('click', () => {
      switchView('timer');
      setTimerMode('focus');
      startTimer();
    });
  }

  const loadDemoDashBtn = document.getElementById('btn-load-demo-data-dash');
  if (loadDemoDashBtn) {
    loadDemoDashBtn.addEventListener('click', () => {
      Modal.confirm('Load sample academic coursework into your workspace?', () => {
        loadDemoDataset();
      });
    });
  }

  const refreshQuoteBtn = document.getElementById('btn-refresh-quote');
  if (refreshQuoteBtn) refreshQuoteBtn.addEventListener('click', updateDailyQuote);
}

// ============================================================================
// 15. KEYBOARD SHORTCUTS CONTROLLER
// ============================================================================

function initKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Disable shortcuts when actively typing in inputs
    const activeEl = document.activeElement;
    const isEditing = activeEl && (
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.tagName === 'SELECT' ||
      activeEl.isContentEditable
    );

    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => Modal.close(m.id));
      return;
    }

    if (isEditing) return;

    const key = e.key.toUpperCase();

    if (key === 'N') {
      e.preventDefault();
      openAddTaskModal();
    } else if (key === 'T') {
      e.preventDefault();
      switchView('timer');
    } else if (key === 'M') {
      e.preventDefault();
      openAddNoteModal();
    } else if (key === 'D') {
      e.preventDefault();
      switchView('dashboard');
    } else if (key === 'A') {
      e.preventDefault();
      switchView('analytics');
    } else if (e.key === '/') {
      e.preventDefault();
      switchView('tasks');
      setTimeout(() => {
        const searchInput = document.getElementById('tasks-search-input');
        if (searchInput) searchInput.focus();
      }, 50);
    }
  });
}

// ============================================================================
// 16. FILTER & SEARCH EVENT LISTENERS
// ============================================================================

function initFiltersAndSearch() {
  // Tasks search & filters
  const taskSearchInput = document.getElementById('tasks-search-input');
  if (taskSearchInput) {
    taskSearchInput.addEventListener('input', (e) => {
      AppState.searchQuery = e.target.value;
      renderTasks();
    });
  }

  const filterStatus = document.getElementById('filter-task-status');
  if (filterStatus) {
    filterStatus.addEventListener('change', (e) => {
      AppState.taskFilter.status = e.target.value;
      renderTasks();
    });
  }

  const filterPriority = document.getElementById('filter-task-priority');
  if (filterPriority) {
    filterPriority.addEventListener('change', (e) => {
      AppState.taskFilter.priority = e.target.value;
      renderTasks();
    });
  }

  const filterDeadline = document.getElementById('filter-task-deadline');
  if (filterDeadline) {
    filterDeadline.addEventListener('change', (e) => {
      AppState.taskFilter.deadline = e.target.value;
      renderTasks();
    });
  }

  const filterCategory = document.getElementById('filter-task-category');
  if (filterCategory) {
    filterCategory.addEventListener('change', (e) => {
      AppState.taskFilter.category = e.target.value;
      renderTasks();
    });
  }

  const filterSort = document.getElementById('filter-task-sort');
  if (filterSort) {
    filterSort.addEventListener('change', (e) => {
      AppState.taskFilter.sort = e.target.value;
      renderTasks();
    });
  }

  // Notes search & category filter
  const noteSearchInput = document.getElementById('notes-search-input');
  if (noteSearchInput) {
    noteSearchInput.addEventListener('input', (e) => {
      AppState.noteSearchQuery = e.target.value;
      renderNotes();
    });
  }

  const filterNoteCat = document.getElementById('filter-note-category');
  if (filterNoteCat) {
    filterNoteCat.addEventListener('change', (e) => {
      AppState.noteCategoryFilter = e.target.value;
      renderNotes();
    });
  }

  // Analytics metric toggles
  document.querySelectorAll('[data-chart-metric]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-chart-metric]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.analyticsMetric = btn.getAttribute('data-chart-metric') || 'study';
      renderWeeklyChart();
    });
  });
}

// ============================================================================
// 17. UTILITY HELPERS
// ============================================================================

function getFormattedDateSlug(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderAllViews() {
  renderDashboard();
  renderTasks();
  updateTimerUI();
  renderNotes();
  renderAnalytics();
  renderSettings();
}

// ============================================================================
// 18. INITIALIZATION RUNNER
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  Storage.loadAll();
  ThemeManager.init();
  initLiveClock();
  initNavigation();
  initStudyTimer();
  initModals();
  initSettings();
  initKeyboardShortcuts();
  initFiltersAndSearch();
  updateCategoryDropdowns();
  updateDailyQuote();
  renderAllViews();
});

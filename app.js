/* ============================================================
   Quit Addiction — Application Logic
   All dates use the Africa/Lagos timezone (WAT, UTC+1).
   Data is persisted in localStorage.
   ============================================================ */

var QuitApp = (function () {
  'use strict';

  // ---- Constants ----

  const TIMEZONE = 'Africa/Lagos';

  const ENCOURAGEMENT_MESSAGES = [
    "You're stronger than yesterday.",
    "Progress, not perfection.",
    "One day at a time.",
    "Every single day counts.",
    "You're rewriting your story.",
    "Be proud of how far you've come.",
    "Your children are proud of you.",
    "Discipline is freedom.",
    "The hard days prove your strength.",
    "You're becoming who you were meant to be.",
    "Keep going — tomorrow's you will thank today's you.",
    "Small steps still move you forward.",
  ];

  const RELAPSE_MESSAGES = [
    "Falling doesn't define you — getting back up does.",
    "One setback doesn't erase your progress.",
    "Be gentle with yourself. You're still here, and that matters.",
    "Every champion has stumbled. What matters is the next step.",
    "You are not starting over — you are starting stronger.",
    "This moment doesn't own you. Tomorrow is a new day.",
  ];

  const STORAGE_KEY = 'quitAddictionData';


  // ---- DOM References ----

  const dom = {
    currentStreak: document.getElementById('currentStreak'),
    longestStreak: document.getElementById('longestStreak'),
    lastCheckIn: document.getElementById('lastCheckIn'),
    streakSection: document.getElementById('streakSection'),
    checkInBtn: document.getElementById('checkInBtn'),
    relapseBtn: document.getElementById('relapseBtn'),
    encouragementText: document.getElementById('encouragementText'),
    progressFill: document.getElementById('progressFill'),
    focusModeBtn: document.getElementById('focusModeBtn'),
    focusModeLabel: document.getElementById('focusModeLabel'),
    focusIcon: document.getElementById('focusIcon'),
    relapseModal: document.getElementById('relapseModal'),
    modalCancel: document.getElementById('modalCancel'),
    modalConfirm: document.getElementById('modalConfirm'),
    themeToggle: document.getElementById('themeToggle'),
  };


  // ---- State ----

  /** @type {{ currentStreak: number, longestStreak: number, lastCheckIn: string|null, focusMode: boolean }} */
  let state = loadState();


  // ---- Utility: Date in Africa/Lagos ----

  /**
   * Get today's date string (YYYY-MM-DD) in Africa/Lagos timezone.
   */
  function getTodayLagos() {
    return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
    // 'en-CA' locale outputs YYYY-MM-DD format
  }

  /**
   * Format a YYYY-MM-DD date string to a readable format (e.g. "27 Feb 2026").
   */
  function formatDateReadable(dateStr) {
    if (!dateStr) return '—';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  /**
   * Check if the given date string is yesterday relative to today (Africa/Lagos).
   */
  function isYesterday(dateStr) {
    if (!dateStr) return false;
    const today = new Date(getTodayLagos() + 'T00:00:00');
    const check = new Date(dateStr + 'T00:00:00');
    const diff = (today - check) / (1000 * 60 * 60 * 24);
    return diff === 1;
  }

  /**
   * Check if the given date string is today (Africa/Lagos).
   */
  function isToday(dateStr) {
    return dateStr === getTodayLagos();
  }


  // ---- Persistence ----

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          currentStreak: parsed.currentStreak || 0,
          longestStreak: parsed.longestStreak || 0,
          lastCheckIn: parsed.lastCheckIn || null,
          focusMode: !!parsed.focusMode,
        };
      }
    } catch (e) {
      console.warn('Could not load saved data:', e);
    }
    return { currentStreak: 0, longestStreak: 0, lastCheckIn: null, focusMode: false };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Could not save data:', e);
    }
  }


  // ---- Streak Logic ----

  /**
   * Detect if the streak was broken (missed a day) and reset if needed.
   * Called on app load.
   */
  function detectStreakBreak() {
    if (!state.lastCheckIn) return;

    // If the last check-in was today or yesterday the streak is alive
    if (isToday(state.lastCheckIn) || isYesterday(state.lastCheckIn)) return;

    // Streak is broken — missed more than one day
    state.currentStreak = 0;
    saveState();
  }

  /**
   * Check in for today. Only increments once per day.
   */
  function checkIn() {
    if (isToday(state.lastCheckIn)) return; // Already checked in today

    state.currentStreak += 1;
    state.lastCheckIn = getTodayLagos();

    // Update longest streak
    if (state.currentStreak > state.longestStreak) {
      state.longestStreak = state.currentStreak;
    }

    saveState();
    syncToCloud();
    renderAll();
    showEncouragement();
    pulseStreak();
    glowStreak();
  }

  /**
   * Handle a relapse — reset current streak, keep longest.
   */
  function relapse() {
    state.currentStreak = 0;
    state.lastCheckIn = null;
    saveState();
    syncToCloud();
    renderAll();
    showRelapseMessage();
  }


  // ---- UI Rendering ----

  function renderAll() {
    // Streak numbers
    dom.currentStreak.textContent = state.currentStreak;
    dom.longestStreak.textContent = state.longestStreak;
    dom.lastCheckIn.textContent = formatDateReadable(state.lastCheckIn);

    // Check-in button state
    const checkedToday = isToday(state.lastCheckIn);
    if (checkedToday) {
      dom.checkInBtn.classList.add('checked');
      dom.checkInBtn.innerHTML = '<span class="btn__icon">✓</span> Checked In Today';
    } else {
      dom.checkInBtn.classList.remove('checked');
      dom.checkInBtn.innerHTML = '<span class="btn__icon">✦</span> I Stayed Strong Today';
    }

    // Progress bar
    if (checkedToday) {
      dom.progressFill.classList.add('done');
    } else {
      dom.progressFill.classList.remove('done');
    }

    // Focus mode
    renderFocusMode();
  }


  // ---- Encouragement ----

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function showEncouragement() {
    const msg = pickRandom(ENCOURAGEMENT_MESSAGES);
    dom.encouragementText.textContent = msg;
    dom.encouragementText.classList.remove('visible', 'supportive');

    // Force reflow to restart animation
    void dom.encouragementText.offsetWidth;

    dom.encouragementText.classList.add('visible');
  }

  function showRelapseMessage() {
    const msg = pickRandom(RELAPSE_MESSAGES);
    dom.encouragementText.textContent = msg;
    dom.encouragementText.classList.remove('visible', 'supportive');

    void dom.encouragementText.offsetWidth;

    dom.encouragementText.classList.add('visible', 'supportive');
  }


  // ---- Streak Pulse Animation ----

  function pulseStreak() {
    dom.currentStreak.classList.remove('pulse');
    void dom.currentStreak.offsetWidth; // force reflow
    dom.currentStreak.classList.add('pulse');
  }

  /**
   * Trigger a glow animation on the streak card for visual feedback.
   */
  function glowStreak() {
    dom.streakSection.classList.remove('glow');
    void dom.streakSection.offsetWidth;
    dom.streakSection.classList.add('glow');
  }


  // ---- Focus Mode ----

  function toggleFocusMode() {
    state.focusMode = !state.focusMode;
    saveState();
    syncToCloud();
    renderFocusMode();
  }

  function renderFocusMode() {
    if (state.focusMode) {
      document.body.classList.add('focus-mode');
      dom.focusIcon.textContent = '🧘';
      dom.focusModeLabel.textContent = 'Exit Focus Mode';
    } else {
      document.body.classList.remove('focus-mode');
      dom.focusIcon.textContent = '🧘';
      dom.focusModeLabel.textContent = 'Focus Mode';
    }
  }


  // ---- Dark / Light Theme ----

  function initTheme() {
    var saved = localStorage.getItem('quitAddictionTheme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    updateThemeIcon();
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('quitAddictionTheme', next);
    updateThemeIcon();
  }

  function updateThemeIcon() {
    var theme = document.documentElement.getAttribute('data-theme') || 'light';
    if (dom.themeToggle) {
      dom.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }


  // ---- Relapse Modal ----

  function openRelapseModal() {
    dom.relapseModal.classList.add('open');
  }

  function closeRelapseModal() {
    dom.relapseModal.classList.remove('open');
  }


  // ---- Event Listeners ----

  dom.checkInBtn.addEventListener('click', checkIn);
  dom.relapseBtn.addEventListener('click', openRelapseModal);
  dom.focusModeBtn.addEventListener('click', toggleFocusMode);
  if (dom.themeToggle) dom.themeToggle.addEventListener('click', toggleTheme);
  dom.modalCancel.addEventListener('click', closeRelapseModal);

  dom.modalConfirm.addEventListener('click', function () {
    closeRelapseModal();
    relapse();
  });

  // Close modal on overlay click
  dom.relapseModal.addEventListener('click', function (e) {
    if (e.target === dom.relapseModal) {
      closeRelapseModal();
    }
  });

  // Close modal on Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dom.relapseModal.classList.contains('open')) {
      closeRelapseModal();
    }
  });


  // ---- Cloud Sync Helper ----

  /**
   * Push state to cloud if Firebase is loaded and user is signed in.
   */
  function syncToCloud() {
    if (window.FirebaseSync && typeof window.FirebaseSync.syncToCloud === 'function') {
      window.FirebaseSync.syncToCloud();
    }
  }


  // ---- Initialise ----

  initTheme();
  detectStreakBreak();
  renderAll();

  // If already checked in today, show a persistent encouragement
  if (isToday(state.lastCheckIn)) {
    showEncouragement();
  }


  // ---- Public API (used by firebase-sync.js) ----

  return {
    getState: function () {
      return {
        currentStreak: state.currentStreak,
        longestStreak: state.longestStreak,
        lastCheckIn: state.lastCheckIn,
        focusMode: state.focusMode
      };
    },
    setState: function (newState) {
      state.currentStreak = newState.currentStreak !== undefined ? newState.currentStreak : state.currentStreak;
      state.longestStreak = newState.longestStreak !== undefined ? newState.longestStreak : state.longestStreak;
      state.lastCheckIn = newState.lastCheckIn !== undefined ? newState.lastCheckIn : state.lastCheckIn;
      state.focusMode = newState.focusMode !== undefined ? newState.focusMode : state.focusMode;
      saveState();
      renderAll();
    },
    renderAll: renderAll
  };

})();

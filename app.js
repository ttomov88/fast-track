(() => {
  'use strict';

  const STORAGE_KEY = 'fasttrack_state_v1';
  const RING_CIRC = 2 * Math.PI * 115; // 722.566
  const PRESET_HOURS = [16, 18, 20, 24];

  // ---------- State ----------
  // state.current: { startISO, targetHours, goalNotified, preReminderNotified } | null
  // state.history: [{ startISO, endISO, targetHours }]
  let state = load();

  function defaultState() {
    return {
      current: null,
      history: [],
      lastTargetHours: 16,
      notifyDismissed: false,
      notificationsEnabled: true,
      remindAtGoal: true,
      preReminderEnabled: false,
      preReminderMinutes: 30,
      startReminderEnabled: false,
      startReminderTime: '20:00',
      startReminderLastFiredDate: null,
      theme: 'light',
      autoBackupEnabled: false,
      lastAutoBackupAt: null,
      lastAutoBackupFingerprint: null,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const merged = Object.assign(defaultState(), parsed);
        // migrate old data where 0 meant "off" via the select alone
        if (![15, 30, 60].includes(merged.preReminderMinutes)) merged.preReminderMinutes = 30;
        if (!['light', 'dark', 'system'].includes(merged.theme)) merged.theme = 'light';
        if (!/^\d{2}:\d{2}$/.test(merged.startReminderTime)) merged.startReminderTime = '20:00';
        return merged;
      }
    } catch (e) {}
    return defaultState();
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- DOM ----------
  const el = {
    timerView: document.getElementById('timerView'),
    historyView: document.getElementById('historyView'),
    settingsView: document.getElementById('settingsView'),
    historyBtn: document.getElementById('historyBtn'),
    appTitle: document.getElementById('appTitle'),
    backBtn: document.getElementById('backBtn'),
    settingsBtn: document.getElementById('settingsBtnTop'),
    settingsBackBtn: document.getElementById('settingsBackBtn'),
    ringProgress: document.getElementById('ringProgress'),
    statusLabel: document.getElementById('statusLabel'),
    elapsedTime: document.getElementById('elapsedTime'),
    subLabel: document.getElementById('subLabel'),
    finishTime: document.getElementById('finishTime'),
    targetPicker: document.getElementById('targetPicker'),
    customTargetWrap: document.getElementById('customTargetWrap'),
    customTargetInput: document.getElementById('customTargetInput'),
    mainActionBtn: document.getElementById('mainActionBtn'),
    editStartBtn: document.getElementById('editStartBtn'),
    editModal: document.getElementById('editModal'),
    editStartInput: document.getElementById('editStartInput'),
    editCancelBtn: document.getElementById('editCancelBtn'),
    editSaveBtn: document.getElementById('editSaveBtn'),
    historyList: document.getElementById('historyList'),
    historyEmpty: document.getElementById('historyEmpty'),
    statStreak: document.getElementById('statStreak'),
    statAvg: document.getElementById('statAvg'),
    statCount: document.getElementById('statCount'),
    statLongest: document.getElementById('statLongest'),
    statTotalTime: document.getElementById('statTotalTime'),
    statDays: document.getElementById('statDays'),
    statHitRate: document.getElementById('statHitRate'),
    notifyBanner: document.getElementById('notifyBanner'),
    notifyEnableBtn: document.getElementById('notifyEnableBtn'),
    notifyDismissBtn: document.getElementById('notifyDismissBtn'),
    importFile: document.getElementById('importFile'),
    chartBars: document.getElementById('chartBars'),
    chartLabels: document.getElementById('chartLabels'),
    addFastBtn: document.getElementById('addFastBtn'),
    // settings
    themeToggle: document.getElementById('themeToggle'),
    settingsNotifToggle: document.getElementById('settingsNotifToggle'),
    notifStatusText: document.getElementById('notifStatusText'),
    goalReminderToggle: document.getElementById('goalReminderToggle'),
    preReminderToggle: document.getElementById('preReminderToggle'),
    preReminderMinutesWrap: document.getElementById('preReminderMinutesWrap'),
    preReminderSelect: document.getElementById('preReminderSelect'),
    startReminderToggle: document.getElementById('startReminderToggle'),
    startReminderTimeWrap: document.getElementById('startReminderTimeWrap'),
    startReminderHourSelect: document.getElementById('startReminderHourSelect'),
    startReminderMinuteSelect: document.getElementById('startReminderMinuteSelect'),
    settingsExportBtn: document.getElementById('settingsExportBtn'),
    settingsImportBtn: document.getElementById('settingsImportBtn'),
    resetDataBtn: document.getElementById('resetDataBtn'),
    autoBackupToggle: document.getElementById('autoBackupToggle'),
    autoBackupStatusText: document.getElementById('autoBackupStatusText'),
    backupNowBtn: document.getElementById('backupNowBtn'),
    // fast add/edit modal
    fastEditModal: document.getElementById('fastEditModal'),
    fastEditTitle: document.getElementById('fastEditTitle'),
    fastEditStartInput: document.getElementById('fastEditStartInput'),
    fastEditEndInput: document.getElementById('fastEditEndInput'),
    fastEditTargetInput: document.getElementById('fastEditTargetInput'),
    fastEditCancelBtn: document.getElementById('fastEditCancelBtn'),
    fastEditSaveBtn: document.getElementById('fastEditSaveBtn'),
    // generic dialog
    dialogModal: document.getElementById('dialogModal'),
    dialogTitle: document.getElementById('dialogTitle'),
    dialogMessage: document.getElementById('dialogMessage'),
    dialogOkBtn: document.getElementById('dialogOkBtn'),
    dialogCancelBtn: document.getElementById('dialogCancelBtn'),
  };

  el.ringProgress.style.strokeDasharray = RING_CIRC;

  let tickInterval = null;
  let selectedTargetHours = state.lastTargetHours || 16;
  let currentChartPeriod = 'week';
  let editingFastIndex = null; // null = adding a new fast; number = editing state.history[idx]

  // ---------- Generic styled dialog (replaces confirm()/alert()) ----------
  let dialogResolve = null;

  function showDialog({ title, message, okText = 'OK', cancelText = 'Cancel', showCancel = true, danger = false }) {
    return new Promise((resolve) => {
      el.dialogTitle.textContent = title;
      el.dialogMessage.textContent = message;
      el.dialogOkBtn.textContent = okText;
      el.dialogCancelBtn.textContent = cancelText;
      el.dialogCancelBtn.style.display = showCancel ? '' : 'none';
      el.dialogOkBtn.classList.toggle('stop', !!danger);
      dialogResolve = resolve;
      el.dialogModal.classList.remove('hidden');
    });
  }

  function closeDialog(result) {
    el.dialogModal.classList.add('hidden');
    if (dialogResolve) {
      const r = dialogResolve;
      dialogResolve = null;
      r(result);
    }
  }

  el.dialogOkBtn.addEventListener('click', () => closeDialog(true));
  el.dialogCancelBtn.addEventListener('click', () => closeDialog(false));

  function showAlert(title, message) {
    return showDialog({ title, message, showCancel: false, okText: 'OK' });
  }

  // ---------- Theme ----------
  function resolveTheme() {
    if (state.theme === 'system') {
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    return state.theme;
  }

  function applyTheme() {
    const resolved = resolveTheme();
    document.documentElement.setAttribute('data-theme', resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0f1115' : '#f4f5f7');
    if (el.themeToggle) {
      el.themeToggle.querySelectorAll('.theme-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === state.theme);
      });
    }
  }

  if (el.themeToggle) {
    el.themeToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.theme-btn');
      if (!btn) return;
      state.theme = btn.dataset.theme;
      save();
      applyTheme();
    });
  }

  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (state.theme === 'system') applyTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  // ---------- View navigation ----------
  function showView(id) {
    [el.timerView, el.historyView, el.settingsView].forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  el.historyBtn.addEventListener('click', () => {
    showView('historyView');
    renderHistory();
    renderChart();
  });
  el.backBtn.addEventListener('click', () => showView('timerView'));
  el.appTitle.addEventListener('click', () => showView('timerView'));
  el.settingsBtn.addEventListener('click', () => {
    showView('settingsView');
    syncSettingsUI();
  });
  el.settingsBackBtn.addEventListener('click', () => showView('timerView'));

  // ---------- Preset picker (main timer view) ----------
  function setPresetUI(hours) {
    const isCustom = !PRESET_HOURS.includes(hours);
    document.querySelectorAll('.preset').forEach(btn => {
      const val = btn.dataset.hours;
      if (val === 'custom') {
        btn.classList.toggle('active', isCustom);
      } else {
        btn.classList.toggle('active', Number(val) === hours && !isCustom);
      }
    });
    el.customTargetWrap.classList.toggle('hidden', !isCustom);
    if (isCustom) {
      el.customTargetInput.value = hours;
    }
  }

  function chooseTarget(hours) {
    selectedTargetHours = hours;
    state.lastTargetHours = hours;
    save();
    setPresetUI(hours);
  }

  el.targetPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset');
    if (!btn || state.current) return; // locked while fasting
    if (btn.dataset.hours === 'custom') {
      chooseTarget(Number(el.customTargetInput.value) || 16);
      el.customTargetWrap.classList.remove('hidden');
    } else {
      chooseTarget(Number(btn.dataset.hours));
    }
  });

  function syncCustomValue(v) {
    v = Number(v);
    if (v > 0) chooseTarget(v);
  }
  el.customTargetInput.addEventListener('input', () => syncCustomValue(el.customTargetInput.value));

  // ---------- Main action ----------
  el.mainActionBtn.addEventListener('click', () => {
    if (state.current) {
      endFast();
    } else {
      startFast();
    }
  });

  function startFast() {
    state.current = {
      startISO: new Date().toISOString(),
      targetHours: selectedTargetHours,
      goalNotified: false,
      preReminderNotified: false,
    };
    save();
    render();
    notify('Fast started', `Goal: ${selectedTargetHours}h. You'll be notified when it's reached.`);
    maybeAutoBackup();
  }

  function endFast() {
    if (!state.current) return;
    const entry = {
      startISO: state.current.startISO,
      endISO: new Date().toISOString(),
      targetHours: state.current.targetHours,
    };
    state.history.unshift(entry);
    const durationH = (new Date(entry.endISO) - new Date(entry.startISO)) / 3600000;
    state.current = null;
    save();
    render();
    notify('Fast ended', `You fasted for ${formatHoursShort(durationH)}.`);
    maybeAutoBackup();
  }

  // ---------- Notifications ----------
  const notifSupported = 'Notification' in window;

  function notifPermission() {
    return notifSupported ? Notification.permission : 'unsupported';
  }

  function notificationsActive() {
    return notifSupported && Notification.permission === 'granted' && state.notificationsEnabled !== false;
  }

  function updateNotifUI() {
    if (!notifSupported) return;
    const perm = notifPermission();
    const shouldShowBanner = perm === 'default' && !state.notifyDismissed;
    el.notifyBanner.classList.toggle('hidden', !shouldShowBanner);
    if (shouldShowBanner) {
      // Showing it once counts as having asked — never nag on every subsequent open,
      // even if the person ignores it or backs out of the system permission prompt
      // without an explicit Allow/Deny. They can still enable later from Settings.
      state.notifyDismissed = true;
      save();
    }
  }

  function syncSettingsUI() {
    const perm = notifPermission();
    const active = notificationsActive();
    el.settingsNotifToggle.classList.toggle('on', active);
    el.settingsNotifToggle.setAttribute('aria-checked', String(active));
    if (!notifSupported) {
      el.notifStatusText.textContent = 'Not supported on this browser';
    } else if (perm === 'denied') {
      el.notifStatusText.textContent = 'Blocked in browser settings';
    } else if (active) {
      el.notifStatusText.textContent = 'Enabled';
    } else {
      el.notifStatusText.textContent = 'Not enabled';
    }

    el.goalReminderToggle.classList.toggle('on', !!state.remindAtGoal);
    el.goalReminderToggle.setAttribute('aria-checked', String(!!state.remindAtGoal));

    el.preReminderToggle.classList.toggle('on', !!state.preReminderEnabled);
    el.preReminderToggle.setAttribute('aria-checked', String(!!state.preReminderEnabled));
    el.preReminderMinutesWrap.classList.toggle('hidden', !state.preReminderEnabled);
    el.preReminderSelect.value = String(state.preReminderMinutes || 30);

    el.startReminderToggle.classList.toggle('on', !!state.startReminderEnabled);
    el.startReminderToggle.setAttribute('aria-checked', String(!!state.startReminderEnabled));
    el.startReminderTimeWrap.classList.toggle('hidden', !state.startReminderEnabled);
    const [rh, rm] = (state.startReminderTime || '20:00').split(':');
    el.startReminderHourSelect.value = rh;
    el.startReminderMinuteSelect.value = rm;

    applyTheme();
  }

  function requestNotifPermission(cb) {
    if (!notifSupported) return;
    Notification.requestPermission().then((perm) => {
      updateNotifUI();
      syncSettingsUI();
      if (cb) cb(perm);
    });
  }

  el.notifyEnableBtn.addEventListener('click', () => {
    requestNotifPermission((perm) => {
      if (perm === 'granted') {
        state.notificationsEnabled = true;
        save();
        updateNotifUI();
      }
    });
  });

  el.notifyDismissBtn.addEventListener('click', () => {
    state.notifyDismissed = true;
    save();
    updateNotifUI();
  });

  el.settingsNotifToggle.addEventListener('click', async () => {
    const perm = notifPermission();
    if (perm === 'denied') {
      await showAlert('Notifications blocked', 'Notifications are blocked for this app in your browser settings. Enable them from your browser/site settings first.');
      return;
    }
    if (perm === 'default') {
      requestNotifPermission((perm2) => {
        state.notificationsEnabled = (perm2 === 'granted');
        save();
        updateNotifUI();
        syncSettingsUI();
      });
      return;
    }
    // already granted — just toggle app-level preference
    state.notificationsEnabled = !notificationsActive();
    save();
    updateNotifUI();
    syncSettingsUI();
  });

  el.goalReminderToggle.addEventListener('click', () => {
    state.remindAtGoal = !state.remindAtGoal;
    save();
    syncSettingsUI();
  });

  el.preReminderToggle.addEventListener('click', () => {
    state.preReminderEnabled = !state.preReminderEnabled;
    save();
    syncSettingsUI();
  });

  el.preReminderSelect.addEventListener('change', () => {
    state.preReminderMinutes = Number(el.preReminderSelect.value) || 30;
    save();
  });

  el.startReminderToggle.addEventListener('click', () => {
    state.startReminderEnabled = !state.startReminderEnabled;
    if (state.startReminderEnabled) state.startReminderLastFiredDate = null; // allow it to fire today if past the time
    save();
    syncSettingsUI();
    checkStartReminder();
  });

  function saveStartReminderTime() {
    state.startReminderTime = `${el.startReminderHourSelect.value}:${el.startReminderMinuteSelect.value}`;
    state.startReminderLastFiredDate = null; // re-arm for today with the new time
    save();
  }
  el.startReminderHourSelect.addEventListener('change', saveStartReminderTime);
  el.startReminderMinuteSelect.addEventListener('change', saveStartReminderTime);

  function notify(title, body) {
    if (!notificationsActive()) return;
    const opts = {
      body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'fasttrack-' + title.replace(/\s+/g, '-').toLowerCase(),
    };
    if ('serviceWorker' in navigator) {
      const swReady = navigator.serviceWorker.ready;
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 1500));
      Promise.race([swReady, timeout]).then((reg) => {
        if (reg && reg.showNotification) {
          reg.showNotification(title, opts);
        } else {
          try { new Notification(title, opts); } catch (e) {}
        }
      }).catch(() => {
        try { new Notification(title, opts); } catch (e) {}
      });
    } else {
      try { new Notification(title, opts); } catch (e) {}
    }
  }

  // Catch up on notifications that should have fired while the app was closed/backgrounded.
  function checkNotificationCatchUp() {
    if (!state.current) return;
    const start = new Date(state.current.startISO).getTime();
    const targetMs = state.current.targetHours * 3600 * 1000;
    const elapsedMs = Date.now() - start;

    if (!state.current.goalNotified && elapsedMs >= targetMs) {
      state.current.goalNotified = true;
      save();
      if (state.remindAtGoal) notify('Fasting goal reached', `You hit your ${state.current.targetHours}h target. Keep going or tap End Fast.`);
      return;
    }
    const reminderMs = (state.preReminderMinutes || 0) * 60000;
    if (state.preReminderEnabled && reminderMs > 0 && !state.current.preReminderNotified && elapsedMs >= (targetMs - reminderMs) && elapsedMs < targetMs) {
      state.current.preReminderNotified = true;
      save();
      notify('Almost there', `${state.preReminderMinutes} min left on your ${state.current.targetHours}h fast.`);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkNotificationCatchUp();
      checkStartReminder();
      maybeAutoBackup();
    }
  });

  // Daily reminder to start a fast, independent of any active fast.
  function checkStartReminder() {
    if (!state.startReminderEnabled || state.current) return;
    const now = new Date();
    const todayKey = dateKey(now);
    if (state.startReminderLastFiredDate === todayKey) return;
    const [h, m] = (state.startReminderTime || '20:00').split(':').map(Number);
    const targetMinutes = h * 60 + m;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (nowMinutes >= targetMinutes) {
      state.startReminderLastFiredDate = todayKey;
      save();
      notify('Time to start your fast', `You set a daily reminder for ${state.startReminderTime}.`);
    }
  }

  setInterval(checkStartReminder, 60000);

  // ---------- Edit start time (active fast) ----------
  el.editStartBtn.addEventListener('click', () => {
    if (!state.current) return;
    const d = new Date(state.current.startISO);
    el.editStartInput.value = toLocalInputValue(d);
    el.editModal.classList.remove('hidden');
  });

  el.editCancelBtn.addEventListener('click', () => {
    el.editModal.classList.add('hidden');
  });

  el.editSaveBtn.addEventListener('click', async () => {
    const val = el.editStartInput.value;
    if (val && state.current) {
      const newDate = new Date(val);
      const now = Date.now();
      if (isNaN(newDate.getTime()) || newDate.getTime() >= now) {
        el.editModal.classList.add('hidden');
        await showAlert('Invalid time', "Start time must be in the past.");
        return;
      }
      if ((now - newDate.getTime()) / 3600000 > 720) {
        el.editModal.classList.add('hidden');
        await showAlert('Invalid time', "That's more than 30 days ago — double check the date.");
        return;
      }
      state.current.startISO = newDate.toISOString();
      state.current.goalNotified = false;
      state.current.preReminderNotified = false;
      save();
      render();
    }
    el.editModal.classList.add('hidden');
  });

  function toLocalInputValue(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // ---------- Add / edit a past fast ----------
  function openFastEditModal(idx) {
    editingFastIndex = idx;
    let entry;
    if (idx === null) {
      const now = new Date();
      const defaultStart = new Date(now.getTime() - (state.lastTargetHours || 16) * 3600000);
      entry = { startISO: defaultStart.toISOString(), endISO: now.toISOString(), targetHours: state.lastTargetHours || 16 };
      el.fastEditTitle.textContent = 'Add fast';
    } else {
      entry = state.history[idx];
      el.fastEditTitle.textContent = 'Edit fast';
    }
    el.fastEditStartInput.value = toLocalInputValue(new Date(entry.startISO));
    el.fastEditEndInput.value = toLocalInputValue(new Date(entry.endISO));
    el.fastEditTargetInput.value = entry.targetHours;
    el.fastEditModal.classList.remove('hidden');
  }

  el.addFastBtn.addEventListener('click', () => openFastEditModal(null));

  el.fastEditCancelBtn.addEventListener('click', () => {
    el.fastEditModal.classList.add('hidden');
  });

  el.fastEditSaveBtn.addEventListener('click', async () => {
    const startVal = el.fastEditStartInput.value;
    const endVal = el.fastEditEndInput.value;
    const targetVal = Number(el.fastEditTargetInput.value);

    if (!startVal || !endVal || !targetVal || targetVal <= 0) {
      await showAlert('Missing info', 'Please fill in start, end, and a goal greater than 0.');
      return;
    }
    const startDate = new Date(startVal);
    const endDate = new Date(endVal);
    if (endDate <= startDate) {
      await showAlert('Invalid times', 'End time must be after start time.');
      return;
    }
    if (endDate.getTime() > Date.now()) {
      await showAlert('Invalid times', "End time can't be in the future.");
      return;
    }
    const durationCheckH = (endDate - startDate) / 3600000;
    if (durationCheckH > 720) {
      await showAlert('Invalid times', "That fast is longer than 30 days — double check the start and end dates.");
      return;
    }

    const newEntry = { startISO: startDate.toISOString(), endISO: endDate.toISOString(), targetHours: targetVal };
    if (editingFastIndex === null) {
      state.history.push(newEntry);
    } else {
      state.history[editingFastIndex] = newEntry;
    }
    state.history.sort((a, b) => new Date(b.startISO) - new Date(a.startISO));
    save();
    el.fastEditModal.classList.add('hidden');
    renderHistory();
    renderChart();
    maybeAutoBackup();
  });

  // ---------- Rendering: timer ----------
  function formatElapsed(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function render() {
    if (state.current) {
      el.mainActionBtn.textContent = 'End Fast';
      el.mainActionBtn.classList.add('stop');
      el.editStartBtn.classList.remove('hidden');
      el.statusLabel.textContent = 'FASTING';
      document.querySelectorAll('#targetPicker .preset').forEach(b => b.style.opacity = '0.4');
      el.customTargetInput.disabled = true;

      const finishDate = new Date(new Date(state.current.startISO).getTime() + state.current.targetHours * 3600000);
      const finishStr = finishDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
      const finishWeekday = finishDate.toLocaleDateString(undefined, { weekday: 'short' });
      el.finishTime.textContent = `${finishStr} ${finishWeekday}`;
      el.finishTime.classList.remove('hidden');

      startTick();
    } else {
      el.mainActionBtn.textContent = 'Start Fast';
      el.mainActionBtn.classList.remove('stop');
      el.editStartBtn.classList.add('hidden');
      el.statusLabel.textContent = 'NOT FASTING';
      el.subLabel.textContent = 'Tap start to begin';
      el.subLabel.style.color = '';
      el.elapsedTime.textContent = '00:00:00';
      el.finishTime.classList.add('hidden');
      el.finishTime.textContent = '';
      el.ringProgress.style.stroke = 'var(--accent)';
      el.ringProgress.style.strokeDashoffset = RING_CIRC;
      document.querySelectorAll('#targetPicker .preset').forEach(b => b.style.opacity = '1');
      el.customTargetInput.disabled = false;
      setPresetUI(selectedTargetHours);
      stopTick();
    }
  }

  function startTick() {
    stopTick();
    tick();
    tickInterval = setInterval(tick, 1000);
  }
  function stopTick() {
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = null;
  }

  function tick() {
    if (!state.current) return;
    const start = new Date(state.current.startISO).getTime();
    const now = Date.now();
    const elapsedMs = now - start;
    const targetMs = state.current.targetHours * 3600 * 1000;
    el.elapsedTime.textContent = formatElapsed(elapsedMs);

    const frac = Math.min(1, elapsedMs / targetMs);
    el.ringProgress.style.strokeDashoffset = RING_CIRC * (1 - frac);

    if (elapsedMs >= targetMs) {
      el.ringProgress.style.stroke = 'var(--accent2)';
      const overMs = elapsedMs - targetMs;
      el.subLabel.textContent = `Goal reached · +${formatElapsed(overMs)} over`;
      el.subLabel.style.color = '';
      if (!state.current.goalNotified) {
        state.current.goalNotified = true;
        save();
        if (state.remindAtGoal) notify('Fasting goal reached', `You hit your ${state.current.targetHours}h target. Keep going or tap End Fast.`);
      }
    } else {
      el.ringProgress.style.stroke = 'var(--accent)';
      const remainMs = targetMs - elapsedMs;
      el.subLabel.textContent = formatElapsed(remainMs);
      el.subLabel.style.color = 'var(--accent)';

      const reminderMs = (state.preReminderMinutes || 0) * 60000;
      if (state.preReminderEnabled && reminderMs > 0 && !state.current.preReminderNotified && remainMs <= reminderMs) {
        state.current.preReminderNotified = true;
        save();
        notify('Almost there', `${state.preReminderMinutes} min left on your ${state.current.targetHours}h fast.`);
      }
    }
  }

  // ---------- History list ----------
  function renderHistory() {
    const items = state.history;
    el.historyList.innerHTML = '';
    el.historyEmpty.classList.toggle('hidden', items.length > 0);

    items.forEach((entry, idx) => {
      const start = new Date(entry.startISO);
      const end = new Date(entry.endISO);
      const durationMs = end - start;
      const durationH = durationMs / 3600000;
      const hit = durationH >= entry.targetHours;

      const li = document.createElement('li');
      li.className = 'history-item';

      const dateStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const timeStr = `${start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;

      li.innerHTML = `
        <div class="hi-left">
          <span class="hi-date">${dateStr}</span>
          <span class="hi-range">${timeStr}</span>
        </div>
        <div class="hi-right">
          <span class="hi-badge ${hit ? 'hit' : 'miss'}">${entry.targetHours}h goal</span>
          <span class="hi-duration">${formatHoursShort(durationH)}</span>
          <button class="hi-edit" data-idx="${idx}" aria-label="Edit">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="hi-del" data-idx="${idx}" aria-label="Delete">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      `;
      el.historyList.appendChild(li);
    });

    document.querySelectorAll('.hi-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        openFastEditModal(Number(btn.dataset.idx));
      });
    });

    document.querySelectorAll('.hi-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await showDialog({
          title: 'Delete this fast?',
          message: "This removes it from your history. This can't be undone.",
          okText: 'Delete',
          danger: true,
        });
        if (!ok) return;
        const idx = Number(btn.dataset.idx);
        state.history.splice(idx, 1);
        save();
        renderHistory();
        renderChart();
        maybeAutoBackup();
      });
    });

    renderStats();
  }

  function formatHoursShort(h) {
    const whole = Math.floor(h);
    const min = Math.round((h - whole) * 60);
    return min > 0 ? `${whole}h ${min}m` : `${whole}h`;
  }

  // "1d 14h" style formatting for larger cumulative totals
  function formatDaysHours(totalHours) {
    const totalWholeHours = Math.round(totalHours);
    const days = Math.floor(totalWholeHours / 24);
    const hours = totalWholeHours % 24;
    return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  }

  function dateKey(d) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function renderStats() {
    const items = state.history;
    el.statCount.textContent = items.length;

    if (items.length === 0) {
      el.statStreak.textContent = '0';
      el.statAvg.textContent = '0h';
      el.statLongest.textContent = '0h';
      el.statTotalTime.textContent = '0h';
      el.statDays.textContent = '0';
      el.statHitRate.textContent = '0%';
      return;
    }

    let totalH = 0;
    let longestH = 0;
    let hitCount = 0;
    const daysWithHit = new Set();
    const daysCovered = new Set();

    items.forEach(e => {
      const start = new Date(e.startISO);
      const end = new Date(e.endISO);
      const durationH = (end - start) / 3600000;
      totalH += durationH;
      if (durationH > longestH) longestH = durationH;
      if (durationH >= e.targetHours) {
        daysWithHit.add(dateKey(end));
        hitCount++;
      }

      // Days with fast: every calendar day the fast overlaps (handles overnight fasts).
      // Capped defensively in case a corrupted/imported entry has an absurd duration.
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      let guard = 0;
      while (cursor <= endDay && guard < 400) {
        daysCovered.add(dateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
        guard++;
      }
    });

    el.statAvg.textContent = formatHoursShort(totalH / items.length);
    el.statLongest.textContent = formatDaysHours(longestH);
    el.statTotalTime.textContent = formatDaysHours(totalH);
    el.statDays.textContent = daysCovered.size;
    el.statHitRate.textContent = `${Math.round((hitCount / items.length) * 100)}%`;

    let streak = 0;
    let cursor = new Date();
    while (true) {
      const key = dateKey(cursor);
      if (daysWithHit.has(key)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    el.statStreak.textContent = streak;
  }

  // ---------- Chart ----------
  const periodToggle = document.querySelector('.chart-card .period-toggle');
  if (periodToggle) {
    periodToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.period-btn');
      if (!btn) return;
      currentChartPeriod = btn.dataset.period;
      periodToggle.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderChart();
    });
  }

  function durationHoursOf(entry) {
    return (new Date(entry.endISO) - new Date(entry.startISO)) / 3600000;
  }

  function buildWeekOrMonthBuckets(days) {
    const buckets = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      buckets.push({ key: dateKey(d), date: d, value: 0 });
    }
    const map = new Map(buckets.map(b => [b.key, b]));
    state.history.forEach(entry => {
      const end = new Date(entry.endISO);
      const k = dateKey(end);
      if (map.has(k)) map.get(k).value += durationHoursOf(entry);
    });
    return buckets;
  }

  function buildYearBuckets() {
    const buckets = [];
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, date: d, total: 0, count: 0, value: 0 });
    }
    const map = new Map(buckets.map(b => [b.key, b]));
    state.history.forEach(entry => {
      const end = new Date(entry.endISO);
      const k = `${end.getFullYear()}-${end.getMonth()}`;
      if (map.has(k)) {
        const b = map.get(k);
        b.total += durationHoursOf(entry);
        b.count += 1;
      }
    });
    buckets.forEach(b => { b.value = b.count > 0 ? b.total / b.count : 0; });
    return buckets;
  }

  function renderChart() {
    if (!el.chartBars) return;
    let buckets, labelFn, sparseLabels = false;

    if (currentChartPeriod === 'week') {
      buckets = buildWeekOrMonthBuckets(7);
      labelFn = (b) => b.date.toLocaleDateString(undefined, { weekday: 'short' })[0];
    } else if (currentChartPeriod === 'month') {
      buckets = buildWeekOrMonthBuckets(30);
      labelFn = (b) => String(b.date.getDate());
      sparseLabels = true;
    } else {
      buckets = buildYearBuckets();
      labelFn = (b) => b.date.toLocaleDateString(undefined, { month: 'short' });
    }

    const goalHours = Math.min(24, state.lastTargetHours || 16);

    el.chartBars.innerHTML = '';
    el.chartLabels.innerHTML = '';

    // goal reference line
    const goalLine = document.createElement('div');
    goalLine.className = 'chart-goal-line';
    goalLine.style.top = `${(1 - goalHours / 24) * 100}%`;
    el.chartBars.appendChild(goalLine);

    buckets.forEach((b, idx) => {
      const col = document.createElement('div');
      col.className = 'chart-bar-col';
      const bar = document.createElement('div');
      const pct = Math.max(0, Math.min(100, (b.value / 24) * 100));
      bar.className = 'chart-bar' + (b.value > 0 ? (b.value >= goalHours ? ' hit-goal' : ' has-value') : '');
      bar.style.height = `${pct}%`;
      col.appendChild(bar);
      el.chartBars.appendChild(col);

      const label = document.createElement('span');
      if (sparseLabels) {
        const showEvery = 5;
        const fromEnd = buckets.length - 1 - idx;
        label.textContent = (idx === 0 || idx === buckets.length - 1 || fromEnd % showEvery === 0) ? labelFn(b) : '';
      } else {
        label.textContent = labelFn(b);
      }
      el.chartLabels.appendChild(label);
    });
  }

  // ---------- Export / Import ----------
  function doExport() {
    const payload = {
      app: 'fast-track',
      version: 1,
      exportedAt: new Date().toISOString(),
      history: state.history,
      current: state.current,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `fast-track-export-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function triggerImport() {
    el.importFile.value = '';
    el.importFile.click();
  }

  el.settingsExportBtn.addEventListener('click', doExport);
  el.settingsImportBtn.addEventListener('click', triggerImport);

  el.importFile.addEventListener('change', () => {
    const file = el.importFile.files && el.importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        importData(data);
      } catch (e) {
        showAlert('Import failed', "Could not read that file — make sure it's a Fast Track export.");
      }
    };
    reader.readAsText(file);
  });

  async function importData(data) {
    if (!data || !Array.isArray(data.history)) {
      await showAlert('Import failed', "That file doesn't look like a valid Fast Track export.");
      return;
    }

    const existingKeys = new Set(state.history.map(e => `${e.startISO}|${e.endISO}`));
    let added = 0;
    let skipped = 0;
    data.history.forEach((entry) => {
      if (!entry || !entry.startISO || !entry.endISO || !entry.targetHours) { skipped++; return; }
      const start = new Date(entry.startISO);
      const end = new Date(entry.endISO);
      const durH = (end - start) / 3600000;
      if (!(durH > 0) || durH > 720 || isNaN(start.getTime()) || isNaN(end.getTime())) { skipped++; return; }
      const key = `${entry.startISO}|${entry.endISO}`;
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        state.history.push({
          startISO: entry.startISO,
          endISO: entry.endISO,
          targetHours: Number(entry.targetHours),
        });
        added++;
      }
    });
    state.history.sort((a, b) => new Date(b.startISO) - new Date(a.startISO));

    let importedCurrent = false;
    if (!state.current && data.current && data.current.startISO && data.current.targetHours) {
      const proceed = await showDialog({
        title: 'Resume active fast?',
        message: 'This file also has an in-progress fast. Import it as your active fast?',
        okText: 'Resume',
      });
      if (proceed) {
        state.current = {
          startISO: data.current.startISO,
          targetHours: Number(data.current.targetHours),
          goalNotified: !!data.current.goalNotified,
          preReminderNotified: !!data.current.preReminderNotified,
        };
        importedCurrent = true;
      }
    }

    save();
    render();
    renderHistory();
    renderChart();
    maybeAutoBackup();
    const skippedMsg = skipped > 0 ? ` (${skipped} skipped — missing or implausible data)` : '';
    await showAlert('Import complete', `Imported ${added} fast${added === 1 ? '' : 's'}${importedCurrent ? ' and resumed your active fast' : ''}.${skippedMsg}`);
  }

  el.resetDataBtn.addEventListener('click', async () => {
    const ok = await showDialog({
      title: 'Clear all data?',
      message: "This clears all logged fasts and any active fast. This can't be undone.",
      okText: 'Clear',
      danger: true,
    });
    if (!ok) return;
    state.history = [];
    state.current = null;
    save();
    render();
    renderHistory();
    renderChart();
    maybeAutoBackup();
  });

  // ---------- Auto-backup to Downloads ----------
  // Design notes:
  // - A downloaded file lives in the OS-level Downloads folder, which "Clear browsing data" in
  //   Chrome does NOT touch — unlike localStorage, which is exactly what gets wiped by that action.
  //   This is a genuinely separate safety net from local storage, not just a convenience.
  // - Only triggers when the data actually changed since the last backup, AND at most once every
  //   few hours even if you make several changes in one sitting — avoids piling up near-duplicate
  //   files and avoids Chrome's anti-abuse throttling of repeated automatic downloads.
  // - There's no way for a web app to remember a specific folder on Android and silently overwrite
  //   a file in it (that part of the File System Access API isn't supported on Android Chrome) —
  //   so every backup is a new file in the default Downloads folder, named with the date.

  const AUTO_BACKUP_MIN_INTERVAL_MS = 4 * 3600 * 1000; // 4 hours

  function computeBackupFingerprint() {
    const last = state.history[0];
    return [
      state.history.length,
      last ? `${last.startISO}|${last.endISO}` : '',
      state.current ? state.current.startISO : '',
    ].join('::');
  }

  function triggerBackupDownload() {
    const payload = {
      app: 'fast-track',
      version: 1,
      exportedAt: new Date().toISOString(),
      history: state.history,
      current: state.current,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `fast-track-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function updateAutoBackupUI() {
    el.autoBackupToggle.classList.toggle('on', !!state.autoBackupEnabled);
    el.autoBackupToggle.setAttribute('aria-checked', String(!!state.autoBackupEnabled));
    el.autoBackupStatusText.textContent = state.lastAutoBackupAt
      ? `Last backup ${new Date(state.lastAutoBackupAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`
      : 'No backup yet';
  }

  function maybeAutoBackup() {
    if (!state.autoBackupEnabled) return;
    const fingerprint = computeBackupFingerprint();
    if (fingerprint === state.lastAutoBackupFingerprint) return; // nothing new since last backup
    if (state.lastAutoBackupAt && (Date.now() - new Date(state.lastAutoBackupAt).getTime()) < AUTO_BACKUP_MIN_INTERVAL_MS) return;
    triggerBackupDownload();
    state.lastAutoBackupAt = new Date().toISOString();
    state.lastAutoBackupFingerprint = fingerprint;
    save();
    updateAutoBackupUI();
  }

  el.autoBackupToggle.addEventListener('click', () => {
    state.autoBackupEnabled = !state.autoBackupEnabled;
    save();
    updateAutoBackupUI();
    if (state.autoBackupEnabled) maybeAutoBackup();
  });

  el.backupNowBtn.addEventListener('click', () => {
    triggerBackupDownload();
    state.lastAutoBackupAt = new Date().toISOString();
    state.lastAutoBackupFingerprint = computeBackupFingerprint();
    save();
    updateAutoBackupUI();
  });

  // ---------- Init ----------
  setPresetUI(selectedTargetHours);
  applyTheme();
  updateNotifUI();
  syncSettingsUI();
  updateAutoBackupUI();
  checkNotificationCatchUp();
  checkStartReminder();
  maybeAutoBackup();
  render();

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }
})();

(() => {
  'use strict';

  const STORAGE_KEY = 'fasttrack_state_v1';
  const RING_CIRC = 2 * Math.PI * 115; // 722.566
  const PRESET_HOURS = [16, 18, 20, 24];

  // ---------- State ----------
  // state.current: { startISO, targetHours, goalNotified, preReminderNotified } | null
  // state.history: [{ startISO, endISO, targetHours }]
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Object.assign({
          current: null,
          history: [],
          lastTargetHours: 16,
          notifyDismissed: false,
          notificationsEnabled: true,
          preReminderMinutes: 0,
        }, parsed);
      }
    } catch (e) {}
    return {
      current: null,
      history: [],
      lastTargetHours: 16,
      notifyDismissed: false,
      notificationsEnabled: true,
      preReminderMinutes: 0,
    };
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
    backBtn: document.getElementById('backBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsBackBtn: document.getElementById('settingsBackBtn'),
    ringProgress: document.getElementById('ringProgress'),
    statusLabel: document.getElementById('statusLabel'),
    elapsedTime: document.getElementById('elapsedTime'),
    subLabel: document.getElementById('subLabel'),
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
    notifyBtn: document.getElementById('notifyBtn'),
    notifyBanner: document.getElementById('notifyBanner'),
    notifyEnableBtn: document.getElementById('notifyEnableBtn'),
    notifyDismissBtn: document.getElementById('notifyDismissBtn'),
    importFile: document.getElementById('importFile'),
    chartBars: document.getElementById('chartBars'),
    chartLabels: document.getElementById('chartLabels'),
    chartWrap: document.getElementById('chartWrap'),
    // settings
    defaultTargetPicker: document.getElementById('defaultTargetPicker'),
    defaultCustomTargetWrap: document.getElementById('defaultCustomTargetWrap'),
    defaultCustomTargetInput: document.getElementById('defaultCustomTargetInput'),
    settingsNotifToggle: document.getElementById('settingsNotifToggle'),
    notifStatusText: document.getElementById('notifStatusText'),
    preReminderSelect: document.getElementById('preReminderSelect'),
    settingsExportBtn: document.getElementById('settingsExportBtn'),
    settingsImportBtn: document.getElementById('settingsImportBtn'),
    resetDataBtn: document.getElementById('resetDataBtn'),
  };

  el.ringProgress.style.strokeDasharray = RING_CIRC;

  let tickInterval = null;
  let selectedTargetHours = state.lastTargetHours || 16;
  let currentChartPeriod = 'week';

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
  el.settingsBtn.addEventListener('click', () => {
    showView('settingsView');
    syncSettingsUI();
  });
  el.settingsBackBtn.addEventListener('click', () => showView('historyView'));

  // ---------- Preset picker (shared between timer view & settings) ----------
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
    [el.customTargetWrap, el.defaultCustomTargetWrap].forEach(wrap => wrap.classList.toggle('hidden', !isCustom));
    if (isCustom) {
      el.customTargetInput.value = hours;
      el.defaultCustomTargetInput.value = hours;
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

  el.defaultTargetPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset');
    if (!btn) return;
    if (btn.dataset.hours === 'custom') {
      chooseTarget(Number(el.defaultCustomTargetInput.value) || 16);
      el.defaultCustomTargetWrap.classList.remove('hidden');
    } else {
      chooseTarget(Number(btn.dataset.hours));
    }
  });

  function syncCustomValue(v) {
    v = Number(v);
    if (v > 0) chooseTarget(v);
  }
  el.customTargetInput.addEventListener('input', () => syncCustomValue(el.customTargetInput.value));
  el.defaultCustomTargetInput.addEventListener('input', () => syncCustomValue(el.defaultCustomTargetInput.value));

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
    if (!notifSupported) {
      el.notifyBtn.style.display = 'none';
      return;
    }
    const perm = notifPermission();
    el.notifyBtn.classList.toggle('active-state', notificationsActive());
    const shouldShowBanner = perm === 'default' && !state.notifyDismissed;
    el.notifyBanner.classList.toggle('hidden', !shouldShowBanner);
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
    el.preReminderSelect.value = String(state.preReminderMinutes || 0);
  }

  function requestNotifPermission(cb) {
    if (!notifSupported) return;
    Notification.requestPermission().then((perm) => {
      updateNotifUI();
      syncSettingsUI();
      if (cb) cb(perm);
    });
  }

  el.notifyBtn.addEventListener('click', () => {
    const perm = notifPermission();
    if (perm === 'default') {
      requestNotifPermission((perm2) => {
        if (perm2 === 'granted') {
          state.notificationsEnabled = true;
          save();
          updateNotifUI();
        }
      });
    } else if (perm === 'denied') {
      alert('Notifications are blocked for this app in your browser settings. Enable them from your browser/site settings to get alerts.');
    } else {
      alert(notificationsActive() ? 'Notifications are enabled.' : 'Notifications are turned off. Enable them in Settings.');
    }
  });

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

  el.settingsNotifToggle.addEventListener('click', () => {
    const perm = notifPermission();
    if (perm === 'denied') {
      alert('Notifications are blocked for this app in your browser settings. Enable them from your browser/site settings first.');
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

  el.preReminderSelect.addEventListener('change', () => {
    state.preReminderMinutes = Number(el.preReminderSelect.value) || 0;
    save();
  });

  function notify(title, body) {
    if (!notificationsActive()) return;
    const opts = {
      body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'fasttrack-' + title.replace(/\s+/g, '-').toLowerCase(),
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        if (reg && reg.showNotification) {
          reg.showNotification(title, opts);
        } else {
          new Notification(title, opts);
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
      notify('Fasting goal reached', `You hit your ${state.current.targetHours}h target. Keep going or tap End Fast.`);
      return;
    }
    const reminderMs = (state.preReminderMinutes || 0) * 60000;
    if (reminderMs > 0 && !state.current.preReminderNotified && elapsedMs >= (targetMs - reminderMs) && elapsedMs < targetMs) {
      state.current.preReminderNotified = true;
      save();
      notify('Almost there', `${state.preReminderMinutes} min left on your ${state.current.targetHours}h fast.`);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkNotificationCatchUp();
  });

  // ---------- Edit start time ----------
  el.editStartBtn.addEventListener('click', () => {
    if (!state.current) return;
    const d = new Date(state.current.startISO);
    el.editStartInput.value = toLocalInputValue(d);
    el.editModal.classList.remove('hidden');
  });

  el.editCancelBtn.addEventListener('click', () => {
    el.editModal.classList.add('hidden');
  });

  el.editSaveBtn.addEventListener('click', () => {
    const val = el.editStartInput.value;
    if (val && state.current) {
      const newDate = new Date(val);
      if (newDate.getTime() < Date.now()) {
        state.current.startISO = newDate.toISOString();
        state.current.goalNotified = false;
        state.current.preReminderNotified = false;
        save();
        render();
      }
    }
    el.editModal.classList.add('hidden');
  });

  function toLocalInputValue(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

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
      startTick();
    } else {
      el.mainActionBtn.textContent = 'Start Fast';
      el.mainActionBtn.classList.remove('stop');
      el.editStartBtn.classList.add('hidden');
      el.statusLabel.textContent = 'NOT FASTING';
      el.subLabel.textContent = 'Tap start to begin';
      el.elapsedTime.textContent = '00:00:00';
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
      if (!state.current.goalNotified) {
        state.current.goalNotified = true;
        save();
        notify('Fasting goal reached', `You hit your ${state.current.targetHours}h target. Keep going or tap End Fast.`);
      }
    } else {
      el.ringProgress.style.stroke = 'var(--accent)';
      const remainMs = targetMs - elapsedMs;
      el.subLabel.textContent = `${formatElapsed(remainMs)} to go · goal ${state.current.targetHours}h`;

      const reminderMs = (state.preReminderMinutes || 0) * 60000;
      if (reminderMs > 0 && !state.current.preReminderNotified && remainMs <= reminderMs) {
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
          <button class="hi-del" data-idx="${idx}" aria-label="Delete">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      `;
      el.historyList.appendChild(li);
    });

    document.querySelectorAll('.hi-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        state.history.splice(idx, 1);
        save();
        renderHistory();
        renderChart();
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
      return;
    }

    let totalH = 0;
    let longestH = 0;
    const daysWithHit = new Set();
    const daysCovered = new Set();

    items.forEach(e => {
      const start = new Date(e.startISO);
      const end = new Date(e.endISO);
      const durationH = (end - start) / 3600000;
      totalH += durationH;
      if (durationH > longestH) longestH = durationH;
      if (durationH >= e.targetHours) daysWithHit.add(dateKey(end));

      // Days with fast: every calendar day the fast overlaps (handles overnight fasts)
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cursor <= endDay) {
        daysCovered.add(dateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    el.statAvg.textContent = formatHoursShort(totalH / items.length);
    el.statLongest.textContent = formatDaysHours(longestH);
    el.statTotalTime.textContent = formatDaysHours(totalH);
    el.statDays.textContent = daysCovered.size;

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
  const periodToggle = document.querySelector('.period-toggle');
  if (periodToggle) {
    periodToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.period-btn');
      if (!btn) return;
      currentChartPeriod = btn.dataset.period;
      document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b === btn));
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
        alert('Could not read that file — make sure it\'s a Fast Track export.');
      }
    };
    reader.readAsText(file);
  });

  function importData(data) {
    if (!data || !Array.isArray(data.history)) {
      alert('That file doesn\'t look like a valid Fast Track export.');
      return;
    }

    const existingKeys = new Set(state.history.map(e => `${e.startISO}|${e.endISO}`));
    let added = 0;
    data.history.forEach((entry) => {
      if (!entry || !entry.startISO || !entry.endISO || !entry.targetHours) return;
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
      const proceed = confirm('This file also has an in-progress fast. Import it as your active fast?');
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
    alert(`Imported ${added} fast${added === 1 ? '' : 's'}${importedCurrent ? ' and resumed your active fast' : ''}.`);
  }

  el.resetDataBtn.addEventListener('click', () => {
    if (!confirm('This clears all logged fasts and any active fast. This can\'t be undone. Continue?')) return;
    state.history = [];
    state.current = null;
    save();
    render();
    renderHistory();
    renderChart();
  });

  // ---------- Init ----------
  setPresetUI(selectedTargetHours);
  updateNotifUI();
  syncSettingsUI();
  checkNotificationCatchUp();
  render();

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }
})();

# Fast Track

A minimal intermittent fasting timer. Pick a fasting window (16:8, 18:6, 20:4, OMAD, or a custom target), tap Start, and it tracks elapsed time against your goal. Ends up in your history with a hit/miss badge. No water, weight, or food logging — just fasting windows.

Everything is stored locally on your phone (localStorage) — nothing is sent anywhere.

## Host it on GitHub Pages

1. Create a new GitHub repo (e.g. `fast-track`).
2. Upload all files in this folder (`index.html`, `style.css`, `app.js`, `manifest.json`, `service-worker.js`, and the `icons/` folder) to the repo root — keep the folder structure as-is.
3. In the repo: **Settings → Pages → Source → Deploy from a branch → `main` / root**.
4. Save. GitHub gives you a URL like `https://yourusername.github.io/fast-track/`.

## Install on Android

1. Open the GitHub Pages URL in Chrome on your phone.
2. Tap the **⋮** menu → **Add to Home screen** (or Chrome may prompt automatically after a moment).
3. Confirm. It installs as a standalone app with its own icon — no browser bar, works offline.

## Notes

- Only one fast can run at a time; starting a new one requires ending the current one.
- You can edit the start time of an active fast (useful if you started the timer a bit late).
- The ring fills up to your target hours, then turns orange to show overtime.
- Streak = consecutive days ending in a fast that hit its target.

## Notifications

Tap the bell icon (or the banner on first load) to allow notifications. You'll get an alert when a fast starts and when your target is reached.

**Limitation to know about:** this is a plain installed web app, not a native app, so it can only fire a notification while its page or service worker is still alive in the browser. It reliably notifies you:
- the moment your goal is reached, if the app is open or was recently backgrounded, and
- the moment you reopen the app, if the goal was reached while it was closed (it checks and notifies you immediately on reopen).

It can't guarantee waking your phone up hours later with Chrome fully closed and the screen off — that would require a push notification server, which is out of scope for a static GitHub Pages site. If you want a hard guarantee of an alert at an exact time regardless of app state, that needs a native app or a backend push service.

## Import / Export

In **Settings** (gear icon, top of the History screen):
- **Export** downloads a JSON file with all your logged fasts (and your in-progress fast, if any).
- **Import** reads a JSON file and merges its fasts into your history (duplicates, matched by identical start/end time, are skipped automatically). If the file also contains an in-progress fast and you don't currently have one running, you'll be asked whether to resume it.
- **Clear all data** wipes logged fasts and any active fast (not your settings). Confirms before doing it.

Useful for moving data between devices, or backing up before clearing browser data (installed PWAs store everything in local storage, which browsers can clear).

## History & stats

The History screen (clock icon) shows:
- Streak, average length, total fasts
- Longest fast, total cumulative fasting time, and days with a fast (an overnight fast counts toward both calendar days it touches, so this can exceed your fast count — matches how most fasting apps report it)
- A bar chart of hours fasted per day, with **Week / Month / Year** toggles and a dashed reference line at your current default goal
- The list of individual past fasts, each editable/deletable

## Settings

- **Default fasting goal** — the target used whenever you start a new fast (kept in sync with the picker on the main screen).
- **Notifications** — a toggle mirroring your browser permission, plus an optional **remind me before goal** heads-up (15/30/60 min early).
- **Data** — export, import, and clear-all-data.

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
- **Notifications** — a toggle mirroring your browser permission, plus an optional **remind me before goal** heads-up, a **remind me exactly at goal**, and a daily **remind me to start a fast** at a time you set.
- **Data** — export, import, and clear-all-data.

## Auto-backup to Downloads

This is the fix for the local-storage-can-get-wiped problem: Chrome's "Clear browsing data" erases everything an installed PWA stores locally (localStorage), with no special protection for installed apps. A file that's already been downloaded to your phone's Downloads folder, though, lives in separate OS-level storage — "Clear browsing data" doesn't touch it. That's the safety net this feature builds.

**How it works:** in Settings, flip on **Auto-backup to Downloads**. From then on, the app downloads a dated JSON snapshot (`fast-track-backup-2026-09-04.json`, etc.) to your phone's normal Downloads folder whenever your fasting data has actually changed — checked when you open the app, when you return to it, and right after any edit — but never more than once every 4 hours, even if you make several changes in one sitting. There's also a **Back up now** button for an on-demand copy anytime.

### Why it's not literally "every time the app opens"

A web app on Android can't remember a specific folder you pick and silently overwrite a file in it — that part of the File System Access API (which desktop Chrome supports) isn't available on Android Chrome. The only thing available is triggering a normal one-off download each time, which always lands in the general Downloads folder as a brand new file, never an overwrite. Downloading on every single app launch would:
- Pile up near-identical files fast (dozens or hundreds over time), and
- Likely get silently throttled by Chrome's anti-abuse protection against repeated automatic downloads.

Gating on "did the data actually change" plus a minimum spacing between backups avoids both problems while still keeping a fresh copy in Downloads.

### Making it actually redundant

A file in Downloads survives "Clear browsing data," but not a full factory reset or losing the phone. If you want real off-device redundancy, point your phone's Google Drive app (or Synology Drive, or any file-sync app) at your Downloads folder to auto-upload from there — that's a phone-level setting, not something this web app can configure for you, but it's the natural next step once files are landing in Downloads reliably.

### Known limitations

- Files aren't cleaned up automatically — they'll accumulate in Downloads over months. Delete old ones periodically, or point a sync app at the folder as above.
- If Chrome is set to "Ask where to save each file" (a setting some people enable), each auto-backup will show a save dialog rather than silently downloading — worth checking that setting is off for a smooth experience.

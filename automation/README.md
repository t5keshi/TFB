# The Financial Bird – Automation Pack

This pack adds **server-side archives** (so your readers see the same history) and updates them **every 12 hours** via GitHub Actions.

## What it does
- Saves daily news/economic items into `data/calendar/YYYY-MM-DD.json` and keeps ~90 days.
- Saves a simple daily research note into `data/research/YYYY-MM-DD.html` and keeps ~120 days.
- Commits changes automatically every 12 hours.

## How to install
1. Copy the `scripts/` folder, `data/` folder (keep empty if you want), and `.github/workflows/tfb-auto-archive.yml` into the root of your repo (same level as `index.html`).
2. Commit & push to GitHub.
3. Make sure **Actions** are enabled for your repo.
4. After the first run, you will see files appear under `data/calendar` and `data/research`.

## How to show archives on the site
Your current pages can fetch from localStorage (client-side) *or* you can change them to read the server files:
- Calendar archive JSON: `/data/calendar/2025-08-25.json`
- Research archive HTML: `/data/research/2025-08-30.html`

If you want, I can wire the pages to read these files instead of localStorage.

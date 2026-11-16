# Pocket Ledger

A simple, offline-first money manager that runs in the browser and installs as an app on PC and Android (PWA).
No build step: plain HTML, CSS and JavaScript modules.

## Features
- Income and expense transactions with categories, notes and dates
- Monthly overview: income, expenses, balance, spending by category
- Monthly budgets per expense category (turns amber near the limit, red when over)
- Search, edit and delete transactions
- CSV export/import and JSON backup/restore
- Works offline, installable, light and dark mode

## Run locally
```
npm start        # serves the folder (needs Node.js); open the URL it prints
npm test         # unit tests for the data logic
```
(Any static file server works, e.g. `python3 -m http.server`.) A service worker needs `localhost` or HTTPS.

## Deploy to Vercel
1. Push this folder to a GitHub repository.
2. On vercel.com: **Add New → Project**, import the repo. Framework preset: **Other**. Leave build command and output directory empty.
3. Deploy. Open the URL on your phone (Chrome → menu → **Install app** / **Add to Home screen**) and on your PC (Chrome/Edge → install icon in the address bar).

After changing code, bump `CACHE` in `sw.js` (e.g. `pocket-ledger-v2`) so installed copies pick up the update.

## Project layout
| File | Purpose |
|---|---|
| `index.html`, `styles.css` | Page shell and styling |
| `js/app.js` | UI: views, dialogs, events, local persistence |
| `js/store.js` | Pure data logic: money, merging, summaries, CSV (tested) |
| `js/sync.js` | Placeholder for cloud sync (next step) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA offline support and install info |
| `test/store.test.js` | Unit tests |

## Data model
Every record has a UUID `id`, an `updatedAt` timestamp and an optional `deleted` flag (soft delete).
Money is stored as integer minor units (cents/piasters). This makes cloud sync safe: `mergeState()` in
`store.js` already merges two devices' data with last-write-wins per record.

## Known limits (current version)
- Data lives in this browser's storage, so PC and phone are **not synced yet**. Use Backup (JSON) → Import to move data until sync is added.
- Clearing site data in the browser deletes the data. Export backups regularly.
- Currency is a single global setting; there are no multi-account or multi-currency features yet.

## Next step: sync (Supabase)
See the comments in `js/sync.js`. Plan: Supabase Auth + two tables (`categories`, `transactions`) with row-level
security, then implement `syncNow()` using `mergeState()`.

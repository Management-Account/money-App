# Pocket Ledger

A simple money manager web app with username + password accounts (sign up / sign in) and a cloud database, so you see the same data
on any device that opens the site. No build step: plain HTML, CSS and JavaScript modules. Works offline and syncs when back online.

## Features
- Income and expense transactions with categories, notes and dates
- Monthly overview: income, expenses, balance, spending by category
- Monthly budgets per expense category (turns amber near the limit, red when over)
- Search, edit and delete transactions
- CSV export/import and JSON backup/restore
- Accounts with just a username and password (no email): sign up, sign in, sign out, change password
- Same data on every device (Supabase database, each user sees only their own rows)
- Works offline, light and dark mode

## Run locally
```
npm start        # serves the folder (needs Node.js); open the URL it prints
npm test         # unit tests for the data logic
```
(Any static file server works, e.g. `python3 -m http.server`.) A service worker needs `localhost` or HTTPS.

## Set up the database and accounts (Supabase, free tier)
1. Create a project at supabase.com.
2. **SQL Editor → New query**: paste the contents of `supabase/schema.sql` and **Run**. This creates the tables and the
   row-level security rules (each user can only read/write their own rows).
3. **Project Settings → API**: copy the **Project URL** and the **anon / publishable** key into `js/config.js`.
   (The anon key is meant to be public. Never use the `service_role` / secret key in this app.)
4. **Authentication → Providers → Email**: turn **Confirm email OFF** (and leave the Email provider enabled).
   Supabase only supports email logins, so the app converts a username such as `alice` into a hidden internal address
   (`alice@pocketledger.app`) that nobody ever sees and that never receives mail. Because no email is sent, confirmation
   must be off, otherwise new accounts cannot sign in. The domain is set by `USERNAME_EMAIL_DOMAIN` in `js/config.js`;
   change it only if Supabase rejects it.

## Deploy to Vercel
1. Push this folder to a GitHub repository.
2. On vercel.com: **Add New → Project**, import the repo. Framework preset: **Other**. Leave build command and output directory empty.
3. Deploy and open the URL.

After every deploy that changes files, bump `CACHE` in `sw.js` (e.g. `pocket-ledger-v3`) so browsers pick up the update.

## How sync works
- The app always reads and writes local data first, so it is fast and works offline.
- When signed in, it syncs on start, shortly after every change, when the tab regains focus, when the connection returns, and every minute.
- Each record has an `updatedAt` time; if two devices edit the same record, the newest edit wins. Deletes are soft deletes so they reach other devices.
- Changes show up on another device the next time it syncs (not instantly): switch back to the tab or wait up to a minute.
- Signing out clears this device's copy of the data (after a final sync), so a shared computer never shows the previous person's data.

## Project layout
| File | Purpose |
|---|---|
| `index.html`, `styles.css` | Page shell and styling |
| `js/app.js` | UI: views, dialogs, events, local persistence |
| `js/store.js` | Pure data logic: money, merging, summaries, CSV (tested) |
| `js/sync.js` | Accounts (Supabase Auth) and database sync (REST), no extra libraries |
| `js/config.js` | Your Supabase URL and anon key |
| `supabase/schema.sql` | Tables and row-level security rules |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA offline support and install info |
| `test/store.test.js` | Unit tests |

## Data model
Every record has a UUID `id`, an `updatedAt` timestamp and an optional `deleted` flag (soft delete).
Money is stored as integer minor units (cents/piasters). This makes cloud sync safe: `mergeState()` in
`store.js` already merges two devices' data with last-write-wins per record.

## Known limits
- **There is no password recovery**: with no email on file, a forgotten password cannot be reset by the user. (As the project owner you can set a new password for a user in the Supabase dashboard under Authentication → Users.) Signed-in users can change their password in Settings.
- Usernames are 3 to 30 characters: letters, numbers, `-` and `_`; they are not case sensitive.
- Local-only mode: if `js/config.js` is left empty the app works without accounts, storing data in this browser only.
- Clearing site data in a browser removes the local copy; signed-in users get it back from the database on next sign in.
- Deleting an account is not built in (do it from the Supabase dashboard, Authentication → Users; their rows are removed automatically; users appear there as `name@pocketledger.app`).
- One currency per account; no multi-account or multi-currency features yet.

# Pocket Ledger

A simple money manager web app with username + password accounts (sign up / sign in) and a cloud database, so you see the same data
on any device that opens the site. No build step: plain HTML, CSS and JavaScript modules. Works offline and syncs when back online.

## Features
- Income and expense transactions with categories, notes, dates and an account
- **Accounts**: any number of accounts (Cash, a bank account, a wallet, a card...), each with its own balance (starting balance + income - expenses)
- **Bank / wallet / card picker**: a searchable dropdown (English or Arabic) with the Egyptian banks, mobile wallets and payment apps, and cards, each with a badge; type a name to add your own custom bank
- **Overview**: total across all accounts, then each account, this month's numbers, and only the 10 latest transactions
- **Transactions tab**: every transaction of all time, grouped by day, with search and account / income / expense filters
- Monthly overview: income, expenses, balance, spending by category
- Monthly budgets per expense category (turns amber near the limit, red when over)
- Search, edit and delete transactions
- CSV export/import and JSON backup/restore
- Accounts with just a username and password (no email): sign up, sign in, sign out, change password
- Same data on every device (Supabase database, each user sees only their own rows)
- **Insights tab**: income vs expenses by month, running balance, and spending by category, over the last 3, 6 or 12 months (hover or tap a chart for exact values; every chart has a "View as table" twin)
- **All world currencies**: pick any of 160+ ISO currencies in Settings (one currency per account)
- Modern dark "neon glass" theme, works offline

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
   **Updating from an earlier version? Run the new `schema.sql` again before using the new app.** It is safe to re-run: it adds
   the accounts table, the account column and the new bank column, and keeps all your data. Until you do, sync shows a "Sync problem" message (your data stays safe on the device).
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

After every deploy that changes files, bump `CACHE` in `sw.js` (e.g. `pocket-ledger-v6`) so browsers pick up the update.

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
| `js/store.js` | Pure data logic: money, merging, summaries, analytics, CSV (tested) |
| `js/charts.js` | Dependency-free SVG charts (columns, line, ranked bars) and tooltips |
| `js/currencies.js` | List of all ISO 4217 currencies |
| `js/institutions.js` | Catalog of Egyptian banks, wallets and cards, search, badges |
| `js/picker.js` | The searchable bank dropdown |
| `js/logos.js`, `logos/` | Optional real logo files (see below) |
| `js/sync.js` | Accounts (Supabase Auth) and database sync (REST), no extra libraries |
| `js/config.js` | Your Supabase URL and anon key |
| `supabase/schema.sql` | Tables and row-level security rules |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA offline support and install info |
| `test/store.test.js` | Unit tests |

## Data model
Accounts (table `accounts`, with an optional `institution`), categories and transactions all follow the same rule. Every record has a UUID `id`, an `updatedAt` timestamp and an optional `deleted` flag (soft delete).
Money is stored as integer minor units (cents/piasters). This makes cloud sync safe: `mergeState()` in
`store.js` already merges two devices' data with last-write-wins per record.

## Known limits
- **There is no password recovery**: with no email on file, a forgotten password cannot be reset by the user. (As the project owner you can set a new password for a user in the Supabase dashboard under Authentication → Users.) Signed-in users can change their password in Settings.
- Usernames are 3 to 30 characters: letters, numbers, `-` and `_`; they are not case sensitive.
- Local-only mode: if `js/config.js` is left empty the app works without accounts, storing data in this browser only.
- Clearing site data in a browser removes the local copy; signed-in users get it back from the database on next sign in.
- Deleting an account is not built in (do it from the Supabase dashboard, Authentication → Users; their rows are removed automatically; users appear there as `name@pocketledger.app`).
- One currency per account (switching it relabels existing amounts, it does not convert them). Amounts are always shown with two decimals, even for currencies such as JPY that normally have none.
- Charts cover the most recent 3, 6 or 12 months up to the current month and are not split by account.
- There are no transfers between accounts yet (record the move as an expense in one account and income in the other).
- Deleting an account also deletes the transactions recorded in it (the app asks first). You always keep at least one account.
- Transactions saved before accounts existed count toward the default "Cash" account.

## Bank list and logos
- The list lives in `js/institutions.js` (about 75 entries: banks, mobile wallets and payment apps, cards). It was compiled on 2026-11-18 from
  public lists (Wikipedia and 2026 bank directories); the Central Bank of Egypt's own list could not be fetched. Banks merge, rename and close,
  so check it occasionally. To add or fix one, edit that file. Keep each `id` unchanged once people may have picked it.
- Entries like Onebank (formerly Bank Audi / Blom) and some wallet names are the least certain; verify them if they matter to you.
- **Logos**: official logos are trademarks and are not bundled. Each institution gets a generated badge with its initials. To show a real logo, put the
  file in `logos/` (for example `logos/nbe.svg`) and list it in `js/logos.js` (`export const LOGOS = { nbe: 'logos/nbe.svg' }`), then add the file to `sw.js` if you want it cached offline.
  Only add logos you have the right to use.
- Custom banks a user types are saved with the account (stored as `~Name`) and are not added to the shared list.

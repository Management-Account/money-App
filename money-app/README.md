# Pocket Ledger

A simple money manager web app with username + password accounts (sign up / sign in) and a cloud database, so you see the same data
on any device that opens the site. No build step: plain HTML, CSS and JavaScript modules. Works offline and syncs when back online.

## Features
- Income and expense transactions with categories, notes, dates and an account
- **Accounts**: any number of accounts (Cash, a bank account, a wallet, a card...), each with its own balance (starting balance + income - expenses)
- **Bank / wallet / card picker**: a searchable dropdown (search in English or Arabic) with the Egyptian banks, mobile wallets and payment apps, and cards, each with a badge; type a name to add your own custom bank
- **Overview**: total across all accounts, then each account, this month's numbers, and only the 10 latest transactions
- **Transactions tab**: every transaction of all time, grouped by day, with search and account / income / expense filters
- Monthly overview: income, expenses, balance, spending by category
- Monthly budgets per expense category (turns amber near the limit, red when over)
- Search, edit and delete transactions
- CSV export/import and JSON backup/restore
- Accounts with just a username and password (no email): sign up, sign in, sign out, change password
- Same data on every device (Supabase database, each user sees only their own rows)
- **Insights tab**: income vs expenses, running balance, and spending by category for Day (today), Week (7 days), 1 month (30 days), 3 / 6 / 12 months, or a custom date range (hover or tap a chart for exact values; every chart has a "View as table" twin)
- **All world currencies**: pick any of 160+ ISO currencies in Settings (one currency per account)
- **Themes tab**: Neon Night (default), Soft Light, Aurora Glass, Crystal Glass, Ocean and Sunset. The choice is saved to your account and used on every device
- **Graph styles** (Themes tab): Classic, Smooth, Neon glow (glowing gradient columns, ring gauge) and Waves (overlapping glowing waves). Colours follow the active theme and are saved to your account
- **Category colours**: every category has a colour (pick from a checked palette or any colour); its bars in the Home and Insights charts use it
- **Logo editor**: uploading a picture for an account opens a crop editor (drag to choose the part, zoom with the slider, wheel or pinch); the saved logo always fills the badge with no empty space
- **Category emojis**: every category has an emoji (built-in ones come pre-set, new ones are suggested from the name); pick one from the grid or type/paste your own
- Works offline

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
   the accounts table, the account column and the new bank, logo, category emoji, category colour, theme and graph-style columns, and keeps all your data. Until you do, sync shows a "Sync problem" message (your data stays safe on the device).
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

After every deploy that changes files, bump `CACHE` in `sw.js` (e.g. `pocket-ledger-v15`) so browsers pick up the update.

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
| `js/colors.js` | Category colour palette, defaults and helpers |
| `js/emoji.js` | Category emojis: picker choices, defaults, suggestions |
| `js/themes.js` | Theme list; the colours are in `styles.css` (`:root[data-theme=...]`) |
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

- Built-in categories and the default account have the same ids for every user, so the tables are keyed by `(user_id, id)`. If sync ever says "violates row-level security policy", run the latest `schema.sql` (it migrates the keys) and update the app files.

## Known limits
- **There is no password recovery**: with no email on file, a forgotten password cannot be reset by the user. (As the project owner you can set a new password for a user in the Supabase dashboard under Authentication → Users.) Signed-in users can change their password in Settings.
- Usernames are 3 to 30 characters: letters, numbers, `-` and `_`; they are not case sensitive.
- Local-only mode: if `js/config.js` is left empty the app works without accounts, storing data in this browser only.
- Clearing site data in a browser removes the local copy; signed-in users get it back from the database on next sign in.
- Deleting an account is not built in (do it from the Supabase dashboard, Authentication → Users; their rows are removed automatically; users appear there as `name@pocketledger.app`).
- One currency per account (switching it relabels existing amounts, it does not convert them). Amounts are always shown with two decimals, even for currencies such as JPY that normally have none.
- Charts are not split by account. Ranges up to 62 days show one bar per day, longer ones one per month. "Day" is today only (the app does not record times).
- There are no transfers between accounts yet (record the move as an expense in one account and income in the other).
- Deleting an account also deletes the transactions recorded in it (the app asks first). You always keep at least one account.
- Transactions saved before accounts existed count toward the default "Cash" account.

## Bank list and logos
- The list lives in `js/institutions.js` (about 75 entries: banks, mobile wallets and payment apps, cards). It was compiled on 2026-11-18 from
  public lists (Wikipedia and 2026 bank directories); the Central Bank of Egypt's own list could not be fetched. Banks merge, rename and close,
  so check it occasionally. To add or fix one, edit that file. Keep each `id` unchanged once people may have picked it.
- Entries like Onebank (formerly Bank Audi / Blom) and some wallet names are the least certain; verify them if they matter to you.
- **Logos**: official logos are trademarks, so no official logos are bundled. Every institution gets a generated badge with its initials, unless a logo is set.
  **In the app**, anyone can upload a picture for an account (New account or Edit account, "Upload image"). It is shrunk to a 96px square and saved with that account, so it syncs to every device. It applies to that account only.
  **For everyone**, a logo can be added to the list itself:
  To add a logo, save the image in `logos/` named after the institution id (`nbe.png`, `cib.svg`, `vfcash.png`; ids are in `js/institutions.js`),
  run `node scripts/build-logos.mjs` (or `npm run logos`), and add the file to the list in `sw.js` if you want it available offline. Every badge has the same size, so use square logos or just the emblem (wide logos with text become unreadably small). Use only logos you have the right to use.
- Custom banks a user types are saved with the account (stored as `~Name`) and are not added to the shared list.

## Themes
Every colour in `styles.css` comes from variables on `:root`. A theme is one block, `:root[data-theme="name"] { ... }`, that overrides them, plus an entry in `js/themes.js`
(and the allowed names in the small script at the top of `index.html` and in `themeMeta`). Check chart colours on a new surface with the contrast rules: series colours need 3:1 against the card colour.

## Dashboard, profile and Liquid Glass (v17)
- **Home is now a dashboard**: greeting, search (Enter opens Activity), notification bell (budget alerts), Total balance, weekly Statistics wave chart, savings-rate ring, monthly overview, and a profile card on wide screens.
- **Profile**: tap your avatar (or the profile card at the bottom of the sidebar). Set a display name and upload a photo with the crop/zoom editor. It syncs across devices.
- **Sign Out** now sits under the navigation in the sidebar (and in the Profile page on phones), not in Settings.
- **Liquid Glass** theme added in the Themes tab.
- Run `supabase/schema.sql` once more so the `display_name` and `avatar` columns exist (safe, keeps your data).
- Three more themes: **Neumorphic Mint**, **Neumorphic Indigo** and **Neon Knobs** (v18).
- v19: dashboard cards aligned in an equal 2x2 grid; changes now sync within a fraction of a second (and on tab hide / page close).
- v20: **Transfers** between accounts with optional fee and a choice of which account pays the fee. Re-run supabase/schema.sql once.
- v21: transfers are saved as an expense in the source account, an income in the destination account and a fee expense; Home balance cards: Total first, then one stacked card per account, swipe left for the next. Re-run supabase/schema.sql once.

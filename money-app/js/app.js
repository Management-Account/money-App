import {
  SCHEMA_VERSION, uid, todayStr, monthKey, shiftMonth, toMinor, fromMinor, formatMoney, createState, live, upsert, remove,
  mergeState, sanitizeState, summarize, toCSV, importCSV, isValidDate, monthsEnding, monthlySeries, balanceBefore, categoryTotals,
  toMinorSigned, liveAccounts, fallbackAccountId, accountIdOf, accountSummaries, removeAccount,
} from './store.js';
import { getCurrencies } from './currencies.js';
import { columnChart, lineChart, rankedBars, attachTips, hideTip } from './charts.js';
import {
  cloudEnabled, AuthError, NetworkError, getSession, getOwner, setOwner, signUp, signIn, signOut, setPassword, syncNow,
  USERNAME_RE, normalizeUsername, displayName,
} from './sync.js';

const KEY = 'pocketledger.v1';
const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const byName = (a, b) => a.name.localeCompare(b.name);

// ---------- state & persistence ----------

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === SCHEMA_VERSION) {
        s.settings = { currency: 'EGP', updatedAt: 0, ...s.settings };
        if (!Array.isArray(s.accounts)) s.accounts = createState().accounts; // saved before wallets existed
        return s;
      }
    }
  } catch {
    /* fall through to a fresh state */
  }
  return createState();
}

let state = load();
// auth: 'signin' | 'signup'
const ui = { tab: 'home', month: monthKey(todayStr()), q: '', acct: '', ttype: '', txLimit: 50, lastAccount: '', range: 6, auth: 'signin', notice: '', busy: false };
let deferredInstall = null;
const syncInfo = { lastAt: 0, error: '' };

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    toast('Could not save: browser storage is full or blocked');
  }
}

function setState(next) {
  state = next;
  save();
  render();
  scheduleSync();
}

// ---------- cloud sync ----------

let inflight = null;
let again = false;
let syncTimer;

function scheduleSync(delay = 1500) {
  if (!cloudEnabled || !getSession()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay);
}

// Resolves true when the sync succeeded.
function runSync() {
  if (!cloudEnabled || !getSession()) return Promise.resolve(false);
  if (inflight) {
    again = true;
    return inflight;
  }
  inflight = (async () => {
    let ok = false;
    updateSyncLine();
    try {
      const merged = await syncNow(state);
      // keep any edits the person made while the sync was running (newest edit per record wins)
      state = mergeState(state, merged);
      save();
      syncInfo.lastAt = Date.now();
      syncInfo.error = '';
      ok = true;
    } catch (e) {
      if (e instanceof AuthError) syncInfo.error = e.message;
      else if (e instanceof NetworkError) syncInfo.error = 'offline';
      else syncInfo.error = e.message || 'Sync failed';
    } finally {
      inflight = null;
    }
    refreshView();
    if (again) {
      again = false;
      return runSync();
    }
    return ok;
  })();
  return inflight;
}

function syncText() {
  if (!cloudEnabled || !getSession()) return '';
  if (inflight) return 'Syncing…';
  if (syncInfo.error === 'offline') return 'Offline. Your changes will sync when you reconnect.';
  if (syncInfo.error) return `Sync problem: ${syncInfo.error}`;
  if (syncInfo.lastAt) return `Synced at ${new Date(syncInfo.lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return '';
}

function updateSyncLine() {
  document.querySelectorAll('.syncline').forEach((el) => (el.textContent = syncText()));
}

// Re-draw after a background sync without stealing focus from the search box.
function refreshView() {
  if (!getSession() && cloudEnabled) return render(); // session ended: show the sign-in screen
  if (document.activeElement?.id === 'q') {
    $('#txlist').innerHTML = txListBlock();
    updateSyncLine();
  } else render();
}

// ---------- helpers ----------

const money = (n) => formatMoney(n, state.settings.currency);
const catName = (id) => state.categories.find((c) => c.id === id)?.name || 'Uncategorized';
const acctName = (id) => (state.accounts || []).find((a) => a.id === id)?.name || '';

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function dayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (y !== new Date().getFullYear()) opts.year = 'numeric';
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- views ----------

const svg = (inner) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS = {
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  transactions: svg('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>'),
  insights: svg('<path d="M5 20v-7M11 20V5M17 20v-10M3 20h18"/>'),
  wallets: svg('<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6.5 15h4"/>'),
  categories: svg('<path d="M12 3v9h9"/><path d="M20.5 15A9 9 0 1 1 9 3.5"/>'),
  settings: svg('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
};

const LOGO = svg('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.3"/>');

// [id, full label (desktop sidebar), short label (phone bottom bar)]
const TABS = [
  ['home', 'Home', 'Home'],
  ['transactions', 'Transactions', 'Activity'],
  ['wallets', 'Wallets', 'Wallets'],
  ['insights', 'Insights', 'Insights'],
  ['categories', 'Budgets', 'Budgets'],
  ['settings', 'Settings', 'Settings'],
];

function renderNav() {
  $('#nav').innerHTML =
    `<div class="brand"><span class="logo">${LOGO}</span><span>Pocket Ledger</span></div>` +
    TABS.map(
      ([id, label, short]) =>
        `<button data-action="tab" data-tab="${id}" aria-label="${label}" ${ui.tab === id ? 'aria-current="page"' : ''}>` +
        `<span class="ico">${ICONS[id]}</span><span class="lbl">${label}</span><span class="lbl-s">${short}</span></button>`,
    ).join('');
}

function monthSwitcher() {
  return `<div class="month">
    <button class="icon-btn" data-action="prev-month" aria-label="Previous month">‹</button>
    <span class="name">${esc(monthLabel(ui.month))}</span>
    <button class="icon-btn" data-action="next-month" aria-label="Next month">›</button>
  </div>`;
}

function sortedTx() {
  return live(state.transactions)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
}

function filteredTx() {
  const q = ui.q.trim().toLowerCase();
  return sortedTx().filter((t) => {
    if (ui.ttype && t.type !== ui.ttype) return false;
    const aid = accountIdOf(state, t);
    if (ui.acct && aid !== ui.acct) return false;
    if (!q) return true;
    return t.note.toLowerCase().includes(q) || catName(t.categoryId).toLowerCase().includes(q) || acctName(aid).toLowerCase().includes(q);
  });
}

function txRow(t, multi, withDate = false) {
  const sign = t.type === 'income' ? '+' : '−';
  const sub = [withDate ? dayLabel(t.date) : '', t.note, multi ? acctName(accountIdOf(state, t)) : ''].filter(Boolean).join(' · ');
  return `<button class="row" data-action="edit-tx" data-id="${esc(t.id)}">
    <span><span class="t">${esc(catName(t.categoryId))}</span>
      ${sub ? `<br><span class="sub">${esc(sub)}</span>` : ''}</span>
    <span class="amt ${t.type}">${sign}${esc(money(t.amount))}</span>
  </button>`;
}

// The full, all-time list: grouped by day, filtered, 50 at a time.
function txListBlock() {
  const total = live(state.transactions).length;
  if (!total) return '<div class="empty">No transactions yet. Tap + to add your first one.</div>';
  const all = filteredTx();
  if (!all.length) return '<div class="empty">No transactions match your filters.</div>';
  const multi = liveAccounts(state).length > 1;
  const shown = all.slice(0, ui.txLimit);
  let html = `<p class="hint txcount">${all.length === total ? `${total} transaction${total === 1 ? '' : 's'}` : `${all.length} of ${total} transactions`}</p><div class="list">`;
  let last = '';
  for (const t of shown) {
    if (t.date !== last) {
      html += `<div class="day">${esc(dayLabel(t.date))}</div>`;
      last = t.date;
    }
    html += txRow(t, multi);
  }
  html += '</div>';
  if (all.length > shown.length) html += `<div class="btns more"><button class="btn" data-action="more">Show more (${all.length - shown.length} left)</button></div>`;
  return html;
}

// Overview: only the 10 most recent transactions, whatever month they are in.
function latestHTML() {
  const rows = sortedTx().slice(0, 10);
  if (!rows.length) return '<div class="empty">No transactions yet. Tap + to add your first one.</div>';
  const multi = liveAccounts(state).length > 1;
  return `<div class="list">${rows.map((t) => txRow(t, multi, true)).join('')}</div>`;
}

function barsHTML(s) {
  if (!s.byCategory.length) return '<div class="empty">No spending this month.</div>';
  return s.byCategory
    .map((r) => {
      let pct;
      let note;
      let cls = '';
      if (r.budget > 0) {
        pct = r.spent / r.budget;
        note = `${money(r.spent)} of ${money(r.budget)}`;
        if (pct > 1) cls = 'over';
        else if (pct >= 0.85) cls = 'near';
      } else {
        pct = s.expense ? r.spent / s.expense : 0;
        note = `${money(r.spent)} · ${Math.round(pct * 100)}%`;
      }
      const width = Math.min(100, Math.round(pct * 100));
      return `<div class="bar-row">
        <div class="bar-head"><span>${esc(r.name)}</span><span class="muted">${esc(note)}</span></div>
        <div class="bar ${cls}" role="img" aria-label="${esc(r.name)} ${width}%"><span style="width:${width}%"></span></div>
      </div>`;
    })
    .join('');
}

function heroHTML(w) {
  const n = w.accounts.length;
  return `<section class="card hero">
    <div class="label">Total balance</div>
    <div class="hero-value ${w.total < 0 ? 'expense' : ''}">${esc(money(w.total))}</div>
    <div class="sub">Across ${n} wallet${n === 1 ? '' : 's'}</div>
  </section>`;
}

const walletIcon = `<span class="acct-ico">${ICONS.wallets}</span>`;

function acctCard(a) {
  return `<div class="acct">${walletIcon}<div class="acct-body">
    <div class="acct-name">${esc(a.name)}</div>
    <div class="acct-bal ${a.balance < 0 ? 'expense' : ''}">${esc(money(a.balance))}</div>
  </div></div>`;
}

function walletCard(a) {
  return `<button class="acct big" data-action="edit-wallet" data-id="${esc(a.id)}">${walletIcon}<span class="acct-body">
    <span class="acct-name">${esc(a.name)}</span>
    <span class="acct-bal ${a.balance < 0 ? 'expense' : ''}">${esc(money(a.balance))}</span>
    <span class="acct-meta">Started with ${esc(money(a.opening))}</span>
    <span class="acct-meta"><span class="${a.income > 0 ? 'income' : ''}">+${esc(money(a.income))}</span> in · <span class="${a.expense > 0 ? 'expense' : ''}">−${esc(money(a.expense))}</span> out</span>
    <span class="acct-meta">${a.count} transaction${a.count === 1 ? '' : 's'}</span>
  </span></button>`;
}

function viewHome() {
  const s = summarize(state, ui.month);
  const w = accountSummaries(state);
  return `<h1>Overview</h1><div class="syncline hint" aria-live="polite">${esc(syncText())}</div>
    ${heroHTML(w)}
    <div class="h2row"><h2>Wallets</h2><button class="link" data-action="tab" data-tab="wallets">Manage</button></div>
    <div class="accts">${w.accounts.map(acctCard).join('')}</div>
    <h2>This month</h2>${monthSwitcher()}
    <div class="cards">
      <div class="card stat"><div class="label">Income</div><div class="value income">${esc(money(s.income))}</div></div>
      <div class="card stat"><div class="label">Expenses</div><div class="value expense">${esc(money(s.expense))}</div></div>
      <div class="card stat"><div class="label">Net</div><div class="value ${s.net < 0 ? 'expense' : ''}">${esc(money(s.net))}</div></div>
    </div>
    <h2>Spending by category</h2>
    <div class="card">${barsHTML(s)}</div>
    <div class="h2row"><h2>Latest transactions</h2><button class="link" data-action="tab" data-tab="transactions">View all</button></div>
    ${latestHTML()}`;
}

function viewWallets() {
  const w = accountSummaries(state);
  return `<h1>Wallets</h1>${heroHTML(w)}
    <div class="btns" style="margin:14px 0"><button class="btn primary" data-action="add-wallet">New wallet</button></div>
    <div class="accts wide">${w.accounts.map(walletCard).join('')}</div>
    <p class="hint">A wallet's balance is its starting balance, plus everything recorded in it as income, minus everything recorded as an expense. Choose the wallet whenever you add a transaction.</p>`;
}

function viewTransactions() {
  const accs = liveAccounts(state);
  if (ui.acct && !accs.some((a) => a.id === ui.acct)) ui.acct = '';
  const typeBtn = (v, label) =>
    `<button class="${ui.ttype === v ? 'on' : ''}" data-action="ttype" data-v="${v}" aria-pressed="${ui.ttype === v}">${label}</button>`;
  return `<h1>Transactions</h1>
    <div class="filterbar">
      <input type="search" id="q" placeholder="Search notes, categories, wallets" value="${esc(ui.q)}" aria-label="Search">
      ${accs.length > 1 ? `<select id="f-acct" aria-label="Wallet"><option value="">All wallets</option>${accs
        .map((a) => `<option value="${esc(a.id)}" ${ui.acct === a.id ? 'selected' : ''}>${esc(a.name)}</option>`)
        .join('')}</select>` : ''}
      <div class="filters" role="group" aria-label="Type">${typeBtn('', 'All')}${typeBtn('expense', 'Expenses')}${typeBtn('income', 'Income')}</div>
    </div>
    <div id="txlist">${txListBlock()}</div>`;
}

function viewCategories() {
  const section = (type, title) => {
    const cats = live(state.categories).filter((c) => c.type === type).sort(byName);
    return `<h2>${title}</h2><div class="list">${
      cats
        .map(
          (c) => `<button class="row" data-action="edit-cat" data-id="${esc(c.id)}">
            <span class="t">${esc(c.name)}</span>
            <span class="sub">${type === 'expense' ? (c.budget > 0 ? 'Budget ' + esc(money(c.budget)) : 'No budget') : ''}</span>
          </button>`,
        )
        .join('') || '<div class="empty">None yet.</div>'
    }</div>`;
  };
  return `<h1>Budgets &amp; categories</h1>
    <p class="hint">Set a monthly budget on an expense category to track it on the Home screen.</p>
    <div class="btns"><button class="btn primary" data-action="add-cat">New category</button></div>
    ${section('expense', 'Expense categories')}${section('income', 'Income categories')}`;
}

function accountCard() {
  const s = getSession();
  if (!cloudEnabled) {
    return `<div class="card"><p class="hint" style="margin:0">Accounts and cloud sync are not set up yet, so your data stays on this device only.
      To turn them on, add your Supabase URL and key to <code>js/config.js</code> (see the README).</p></div>`;
  }
  return `<div class="card">
    <div>Signed in as <strong>${esc(displayName(s?.user.email))}</strong></div>
    <div class="syncline hint" aria-live="polite" style="margin:4px 0 12px">${esc(syncText())}</div>
    <div class="btns">
      <button class="btn" data-action="sync">Sync now</button>
      <button class="btn" data-action="change-password">Change password</button>
      <button class="btn" data-action="signout">Sign out</button>
    </div>
  </div>`;
}

function currencyOptions() {
  const cur = state.settings.currency;
  const list = getCurrencies();
  if (!list.some((c) => c.code === cur)) list.unshift({ code: cur, name: cur });
  return list
    .map((c) => `<option value="${esc(c.code)}" ${c.code === cur ? 'selected' : ''}>${esc(c.code)} · ${esc(c.name)}</option>`)
    .join('');
}

// ---------- insights (charts) ----------

const shortMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
};

function insightsData() {
  const months = monthsEnding(monthKey(todayStr()), ui.range);
  const rows = monthlySeries(state, months);
  const income = rows.reduce((t, r) => t + r.income, 0);
  const expense = rows.reduce((t, r) => t + r.expense, 0);
  let run = balanceBefore(state, months[0]);
  const balance = rows.map((r) => (run += r.net));
  const all = categoryTotals(state, months, 'expense');
  let top = all.slice(0, 8);
  if (all.length > 8) {
    top = [...all.slice(0, 7), { id: 'other', name: 'Other categories', total: all.slice(7).reduce((t, c) => t + c.total, 0), other: true }];
  }
  return {
    months, rows, income, expense, net: income - expense, balance,
    rate: income > 0 ? (income - expense) / income : null,
    cats: top.map((c) => ({ ...c, share: expense ? c.total / expense : 0 })),
    hasData: income > 0 || expense > 0,
  };
}

// Stat tiles are narrow: abbreviate very large amounts (EGP 1.2M) so they never wrap mid-number.
function moneyTile(n) {
  if (Math.abs(n) < 100_000_000) return money(n);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: state.settings.currency, notation: 'compact', maximumFractionDigits: 2 }).format(n / 100);
  } catch {
    return money(n);
  }
}

function tableView(head, rows) {
  return `<details class="tableview"><summary>View as table</summary><div class="tv-scroll"><table>
    <thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td class="num">${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join('')}</tr>`).join('')}</tbody>
  </table></div></details>`;
}

function viewInsights() {
  const d = insightsData();
  const filter = `<div class="filters" role="group" aria-label="Period">${[3, 6, 12]
    .map((n) => `<button class="${ui.range === n ? 'on' : ''}" data-action="range" data-n="${n}" aria-pressed="${ui.range === n}">${n} months</button>`)
    .join('')}</div>`;
  if (!d.hasData) {
    return `<h1>Insights</h1>${filter}<div class="card empty">No income or expenses in the last ${ui.range} months yet. Add a few transactions and your charts will appear here.</div>`;
  }
  const pct = d.rate === null ? '–' : `${Math.round(d.rate * 100)}%`;
  const tile = (label, value, sub, cls = '') =>
    `<div class="card tile"><div class="label">${label}</div><div class="value ${cls}">${esc(value)}</div><div class="sub">${esc(sub)}</div></div>`;
  const per = `Last ${ui.range} months`;
  return `<h1>Insights</h1>${filter}
    <div class="tiles">
      ${tile('Income', moneyTile(d.income), per, 'income')}
      ${tile('Expenses', moneyTile(d.expense), `About ${money(Math.round(d.expense / ui.range))} a month`, 'expense')}
      ${tile('Net', moneyTile(d.net), d.net >= 0 ? 'You saved this much' : 'You spent more than you earned', d.net < 0 ? 'expense' : '')}
      ${tile('Savings rate', pct, d.rate === null ? 'No income yet' : 'Share of income kept')}
    </div>
    <section class="card chart-card">
      <h2>Income vs expenses</h2>
      <div class="legend"><span class="lg"><i class="s1"></i>Income</span><span class="lg"><i class="s2"></i>Expenses</span></div>
      <div class="chart" id="ch-monthly"></div>
      ${tableView(['Month', 'Income', 'Expenses', 'Net'], d.months.map((k, i) => [monthLabel(k), money(d.rows[i].income), money(d.rows[i].expense), money(d.rows[i].net)]))}
    </section>
    <section class="card chart-card">
      <h2>Running balance</h2>
      <p class="hint" style="margin:-4px 0 6px">Everything you have earned minus everything you have spent, at the end of each month.</p>
      <div class="chart" id="ch-balance"></div>
      ${tableView(['Month', 'Balance'], d.months.map((k, i) => [monthLabel(k), money(d.balance[i])]))}
    </section>
    <section class="card chart-card">
      <h2>Where the money goes</h2>
      ${d.cats.length ? '<div class="chart" id="ch-cats"></div>' : '<div class="empty">No spending in this period.</div>'}
      ${d.cats.length ? tableView(['Category', 'Spent', 'Share'], d.cats.map((c) => [c.name, money(c.total), `${Math.round(c.share * 100)}%`])) : ''}
    </section>`;
}

function drawInsights() {
  if (ui.tab !== 'insights') return;
  const d = insightsData();
  if (!d.hasData) return;
  const tipEl = $('#tip');
  hideTip();
  const labels = d.months.map((key) => ({ label: shortMonth(key), title: monthLabel(key) }));
  const mount = (id, make) => {
    const el = $(id);
    if (!el || !el.clientWidth) return;
    const { html, tips } = make(el.clientWidth);
    el.innerHTML = html;
    attachTips(el, tips, tipEl);
  };
  mount('#ch-monthly', (width) =>
    columnChart({
      width,
      months: labels.map((l, i) => ({ ...l, values: [d.rows[i].income, d.rows[i].expense] })),
      series: [{ name: 'Income', cls: 's1' }, { name: 'Expenses', cls: 's2' }],
      fmtMoney: money,
      ariaLabel: 'Income and expenses by month',
    }),
  );
  mount('#ch-balance', (width) =>
    lineChart({
      width,
      months: labels.map((l, i) => ({ ...l, value: d.balance[i] })),
      name: 'Balance',
      fmtMoney: money,
      ariaLabel: 'Running balance by month',
    }),
  );
  mount('#ch-cats', () => rankedBars({ rows: d.cats, fmtMoney: money }));
}

function viewSettings() {
  return `<h1>Settings</h1>
    <h2>Account</h2>${accountCard()}
    <h2>Preferences</h2>
    <div class="card">
      <div class="field"><label for="cur">Currency</label>
        <select id="cur">${currencyOptions()}</select>
        <span class="hint">Used for every amount. Pick any world currency; amounts are always shown with two decimals.</span>
      </div>
    </div>
    <h2>Your data</h2>
    <div class="card">
      <p class="hint" style="margin-top:0">${cloudEnabled ? 'Your data is saved to your account and works offline.' : 'Your data is stored on this device only.'}
        You can also keep your own copy as a file.</p>
      <div class="btns">
        <button class="btn" data-action="export-csv">Export CSV</button>
        <button class="btn" data-action="export-json">Backup (JSON)</button>
        <button class="btn" data-action="import">Import CSV / backup</button>
        ${deferredInstall ? '<button class="btn" data-action="install">Add to home screen</button>' : ''}
      </div>
    </div>
    <h2>Danger zone</h2>
    <div class="card"><button class="btn danger" data-action="reset">Delete all transactions</button></div>`;
}

// ---------- sign in / sign up screen ----------

function viewAuth() {
  const up = ui.auth === 'signup';
  return `<div class="auth">
    <div class="auth-brand"><span class="logo">${LOGO}</span><span>Pocket Ledger</span></div>
    <p class="hint">${up ? 'Pick a username and password. Your data is saved to your account, so it is the same on every device.' : 'Sign in to see your money on any device.'}</p>
    <form class="card" id="authform" novalidate>
      <h1 style="font-size:1.25rem">${up ? 'Create your account' : 'Sign in'}</h1>
      ${ui.notice ? `<div class="notice" role="status">${esc(ui.notice)}</div>` : ''}
      <div class="field"><label for="a-user">Username${up ? ' (3 to 30 letters, numbers, - or _)' : ''}</label>
        <input type="text" id="a-user" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></div>
      <div class="field"><label for="a-pw">Password${up ? ' (at least 8 characters)' : ''}</label>
        <input type="password" id="a-pw" name="password" autocomplete="${up ? 'new-password' : 'current-password'}" required></div>
      ${up ? `<div class="field"><label for="a-pw2">Confirm password</label>
        <input type="password" id="a-pw2" name="password2" autocomplete="new-password" required></div>
        <p class="hint">There is no email on file, so a forgotten password cannot be recovered. Keep it somewhere safe.</p>` : ''}
      <div class="error" role="alert"></div>
      <button class="btn primary wide" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Please wait…' : up ? 'Create account' : 'Sign in'}</button>
      <div class="auth-links">
        <button type="button" class="link" data-action="auth-mode" data-mode="${up ? 'signin' : 'signup'}">${up ? 'I already have an account' : 'Create an account'}</button>
      </div>
    </form>
  </div>`;
}

function render() {
  const authScreen = cloudEnabled && !getSession();
  document.body.classList.toggle('auth-mode', authScreen);
  if (authScreen) {
    $('#nav').innerHTML = '';
    $('#main').innerHTML = viewAuth();
    return;
  }
  renderNav();
  const views = { home: viewHome, transactions: viewTransactions, wallets: viewWallets, insights: viewInsights, categories: viewCategories, settings: viewSettings };
  $('#main').innerHTML = views[ui.tab]();
  drawInsights();
}

// ---------- dialogs ----------

const dlg = $('#dlg');

function openDialog(html, { onSubmit, onDelete, onOpen, confirmText } = {}) {
  dlg.innerHTML = html;
  const form = dlg.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = await onSubmit(new FormData(form));
    if (err) form.querySelector('.error').textContent = err;
    else dlg.close();
  });
  form.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  const del = form.querySelector('[data-delete]');
  if (del && onDelete) {
    del.addEventListener('click', () => {
      if (confirm(confirmText || 'Delete this item?')) {
        onDelete();
        dlg.close();
      }
    });
  }
  dlg.showModal();
  if (onOpen) onOpen(form);
}

function categoryOptions(type, selected) {
  return (
    '<option value="">Uncategorized</option>' +
    live(state.categories)
      .filter((c) => c.type === type)
      .sort(byName)
      .map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`)
      .join('')
  );
}

function walletOptions(selected) {
  return liveAccounts(state)
    .map((a) => `<option value="${esc(a.id)}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)}</option>`)
    .join('');
}

function openTxDialog(id) {
  const existing = id ? live(state.transactions).find((t) => t.id === id) : null;
  const lastOk = liveAccounts(state).some((a) => a.id === ui.lastAccount);
  const tx = existing
    ? { ...existing, accountId: accountIdOf(state, existing) }
    : { id: uid(), type: 'expense', amount: 0, categoryId: '', accountId: lastOk ? ui.lastAccount : fallbackAccountId(state), date: todayStr(), note: '' };
  openDialog(
    `<form>
      <h3>${existing ? 'Edit transaction' : 'New transaction'}</h3>
      <div class="field"><span class="lbl">Type</span>
        <div class="seg">
          <label><input type="radio" name="type" value="expense" ${tx.type === 'expense' ? 'checked' : ''}>Expense</label>
          <label><input type="radio" name="type" value="income" ${tx.type === 'income' ? 'checked' : ''}>Income</label>
        </div>
      </div>
      <div class="field"><label for="f-amt">Amount</label>
        <input type="text" id="f-amt" name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${existing ? esc(fromMinor(tx.amount)) : ''}"></div>
      <div class="field"><label for="f-acc">Wallet</label>
        <select id="f-acc" name="accountId">${walletOptions(tx.accountId)}</select></div>
      <div class="field"><label for="f-cat">Category</label>
        <select id="f-cat" name="categoryId">${categoryOptions(tx.type, tx.categoryId)}</select></div>
      <div class="field"><label for="f-date">Date</label>
        <input type="date" id="f-date" name="date" value="${esc(tx.date)}"></div>
      <div class="field"><label for="f-note">Note (optional)</label>
        <input type="text" id="f-note" name="note" maxlength="200" value="${esc(tx.note)}"></div>
      <div class="error" role="alert"></div>
      <div class="actions">
        ${existing ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>Cancel</button>
        <button class="btn primary">Save</button>
      </div>
    </form>`,
    {
      onOpen(form) {
        form.addEventListener('change', (e) => {
          if (e.target.name === 'type') form.querySelector('#f-cat').innerHTML = categoryOptions(e.target.value, '');
        });
        if (!existing) form.querySelector('#f-amt').focus();
      },
      onSubmit(fd) {
        const amount = toMinor(fd.get('amount') || '');
        if (!Number.isFinite(amount) || amount <= 0) return 'Enter an amount greater than zero, like 25 or 12.50.';
        const date = fd.get('date');
        if (!isValidDate(date)) return 'Pick a valid date.';
        const accountId = fd.get('accountId');
        if (!liveAccounts(state).some((a) => a.id === accountId)) return 'Pick a wallet.';
        const rec = { id: tx.id, type: fd.get('type'), amount, categoryId: fd.get('categoryId') || '', accountId, date, note: (fd.get('note') || '').trim() };
        ui.lastAccount = accountId;
        ui.month = monthKey(date);
        setState({ ...state, transactions: upsert(state.transactions, rec) });
      },
      onDelete() {
        setState({ ...state, transactions: remove(state.transactions, tx.id) });
        toast('Transaction deleted');
      },
    },
  );
}

function openWalletDialog(id) {
  const existing = id ? live(state.accounts).find((a) => a.id === id) : null;
  const acc = existing || { id: uid(), name: '', opening: 0 };
  const count = existing ? accountSummaries(state).accounts.find((a) => a.id === id)?.count || 0 : 0;
  const canDelete = existing && liveAccounts(state).length > 1;
  openDialog(
    `<form>
      <h3>${existing ? 'Edit wallet' : 'New wallet'}</h3>
      <div class="field"><label for="w-name">Name (for example Cash, Bank, Savings)</label>
        <input type="text" id="w-name" name="name" maxlength="60" autocomplete="off" value="${esc(acc.name)}"></div>
      <div class="field"><label for="w-open">Starting balance</label>
        <input type="text" id="w-open" name="opening" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${existing ? esc(fromMinor(acc.opening)) : ''}">
        <span class="hint">What was in this wallet before the transactions you record here. Balance = starting balance + income - expenses. Use a minus sign for debt, like -200.</span></div>
      ${existing && !canDelete ? '<p class="hint">This is your only wallet, so it cannot be deleted.</p>' : ''}
      <div class="error" role="alert"></div>
      <div class="actions">
        ${canDelete ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>Cancel</button>
        <button class="btn primary">Save</button>
      </div>
    </form>`,
    {
      confirmText: count
        ? `Delete the wallet "${acc.name}" and its ${count} transaction${count === 1 ? '' : 's'}? This cannot be undone.`
        : `Delete the wallet "${acc.name}"?`,
      onOpen(form) {
        if (!existing) form.querySelector('#w-name').focus();
      },
      onSubmit(fd) {
        const name = (fd.get('name') || '').trim();
        if (!name) return 'Give the wallet a name.';
        if (liveAccounts(state).some((a) => a.id !== acc.id && a.name.toLowerCase() === name.toLowerCase())) return 'You already have a wallet with that name.';
        const raw = (fd.get('opening') || '').trim();
        const opening = raw ? toMinorSigned(raw) : 0;
        if (!Number.isFinite(opening)) return 'Starting balance must be a number like 500 or -120.50.';
        setState({ ...state, accounts: upsert(state.accounts, { id: acc.id, name, opening }) });
      },
      onDelete() {
        if (ui.acct === acc.id) ui.acct = '';
        if (ui.lastAccount === acc.id) ui.lastAccount = '';
        setState(removeAccount(state, acc.id));
        toast('Wallet deleted');
      },
    },
  );
}

function openCatDialog(id) {
  const existing = id ? live(state.categories).find((c) => c.id === id) : null;
  const cat = existing || { id: uid(), name: '', type: 'expense', budget: 0 };
  openDialog(
    `<form>
      <h3>${existing ? 'Edit category' : 'New category'}</h3>
      <div class="field"><label for="c-name">Name</label>
        <input type="text" id="c-name" name="name" maxlength="60" autocomplete="off" value="${esc(cat.name)}"></div>
      <div class="field"><label for="c-type">Type</label>
        <select id="c-type" name="type" ${existing ? 'disabled' : ''}>
          <option value="expense" ${cat.type === 'expense' ? 'selected' : ''}>Expense</option>
          <option value="income" ${cat.type === 'income' ? 'selected' : ''}>Income</option>
        </select></div>
      <div class="field" id="c-budget-wrap"><label for="c-budget">Monthly budget (leave empty for none)</label>
        <input type="text" id="c-budget" name="budget" inputmode="decimal" autocomplete="off" value="${cat.budget ? esc(fromMinor(cat.budget)) : ''}"></div>
      <div class="error" role="alert"></div>
      <div class="actions">
        ${existing ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>Cancel</button>
        <button class="btn primary">Save</button>
      </div>
    </form>`,
    {
      onOpen(form) {
        const wrap = form.querySelector('#c-budget-wrap');
        const sel = form.querySelector('#c-type');
        const sync = () => (wrap.hidden = sel.value !== 'expense');
        sel.addEventListener('change', sync);
        sync();
      },
      onSubmit(fd) {
        const name = (fd.get('name') || '').trim();
        if (!name) return 'Give the category a name.';
        const type = existing ? existing.type : fd.get('type');
        let budget = 0;
        const rawBudget = (fd.get('budget') || '').trim();
        if (type === 'expense' && rawBudget) {
          budget = toMinor(rawBudget);
          if (!Number.isFinite(budget)) return 'Budget must be a number like 500 or 1200.50.';
        }
        const clash = live(state.categories).some((c) => c.id !== cat.id && c.type === type && c.name.toLowerCase() === name.toLowerCase());
        if (clash) return 'A category with that name already exists.';
        setState({ ...state, categories: upsert(state.categories, { id: cat.id, name, type, budget }) });
      },
      onDelete() {
        setState({ ...state, categories: remove(state.categories, cat.id) });
        toast('Category deleted');
      },
    },
  );
}

// ---------- events ----------

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id, tab } = el.dataset;
  switch (action) {
    case 'tab':
      ui.tab = tab;
      render();
      window.scrollTo(0, 0);
      break;
    case 'prev-month':
    case 'next-month':
      ui.month = shiftMonth(ui.month, action === 'prev-month' ? -1 : 1);
      render();
      break;
    case 'edit-tx':
      openTxDialog(id);
      break;
    case 'add-cat':
      openCatDialog();
      break;
    case 'edit-cat':
      openCatDialog(id);
      break;
    case 'export-csv':
      download(`pocket-ledger-${todayStr()}.csv`, '﻿' + toCSV(state), 'text/csv;charset=utf-8');
      break;
    case 'export-json':
      download(`pocket-ledger-backup-${todayStr()}.json`, JSON.stringify(state, null, 2), 'application/json');
      break;
    case 'import':
      $('#file').click();
      break;
    case 'install':
      if (deferredInstall) {
        deferredInstall.prompt();
        deferredInstall = null;
        render();
      }
      break;
    case 'sync': {
      const ok = await runSync();
      toast(ok ? 'Synced' : syncInfo.error === 'offline' ? 'You are offline' : syncInfo.error || 'Sync failed');
      break;
    }
    case 'reset':
      if (confirm(`Delete ALL transactions${getSession() ? ' on every device' : ''}? Your categories are kept. Export a backup first if you might need it.`)) {
        setState({ ...state, transactions: state.transactions.map((t) => (t.deleted ? t : { ...t, deleted: true, updatedAt: Date.now() })) });
        toast('All transactions deleted');
      }
      break;
    case 'signout': {
      // push the latest changes first, because signing out clears this device's copy
      const ok = await runSync();
      if (!ok && !confirm('Your latest changes could not be saved to your account (you may be offline). Sign out anyway and lose them?')) break;
      await signOut();
      setOwner(null);
      state = createState();
      save();
      Object.assign(ui, { tab: 'home', auth: 'signin', notice: '', q: '' });
      syncInfo.lastAt = 0;
      syncInfo.error = '';
      render();
      break;
    }
    case 'ttype':
      ui.ttype = el.dataset.v || '';
      ui.txLimit = 50;
      render();
      break;
    case 'more':
      ui.txLimit += 50;
      $('#txlist').innerHTML = txListBlock();
      break;
    case 'add-wallet':
      openWalletDialog();
      break;
    case 'edit-wallet':
      openWalletDialog(id);
      break;
    case 'range':
      ui.range = Number(el.dataset.n) || 6;
      render();
      break;
    case 'change-password':
      openPasswordDialog();
      break;
    case 'auth-mode':
      ui.auth = el.dataset.mode;
      ui.notice = '';
      render();
      break;
  }
});

// Called after any successful sign in / sign up with a session.
async function afterSignIn(session) {
  const owner = getOwner();
  if (owner && owner !== session.user.id) state = createState(); // never mix another account's data in
  setOwner(session.user.id);
  save();
  Object.assign(ui, { auth: 'signin', notice: '', tab: 'home' });
  render();
  await runSync();
}

const authErrorText = (e) =>
  e instanceof NetworkError ? 'Cannot reach the server. Check your internet connection and try again.' : e.message || 'Something went wrong.';

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'authform') return;
  e.preventDefault();
  if (ui.busy) return;
  const form = e.target;
  const fd = new FormData(form);
  const username = normalizeUsername(fd.get('username'));
  const pw = String(fd.get('password') || '');
  const pw2 = String(fd.get('password2') || '');
  const signingUp = ui.auth === 'signup';
  const fail = (msg) => {
    form.querySelector('.error').textContent = msg;
  };

  if (!username) return fail('Enter your username.');
  if (signingUp && !USERNAME_RE.test(username)) return fail('Username must be 3 to 30 characters: letters, numbers, - or _ (no spaces).');
  if (!pw) return fail('Enter your password.');
  if (signingUp && pw.length < 8) return fail('Use a password with at least 8 characters.');
  if (signingUp && pw !== pw2) return fail('The two passwords do not match.');

  ui.busy = true;
  const btn = form.querySelector('button.primary');
  btn.disabled = true;
  btn.textContent = 'Please wait…';
  try {
    const session = signingUp ? await signUp(username, pw) : await signIn(username, pw);
    ui.busy = false;
    await afterSignIn(session);
  } catch (err) {
    ui.busy = false;
    render();
    const f = $('#authform');
    if (f) {
      f.querySelector('.error').textContent = authErrorText(err);
      f.elements.username.value = username;
    }
  }
});

function openPasswordDialog() {
  openDialog(
    `<form>
      <h3>Change password</h3>
      <div class="field"><label for="p-new">New password (at least 8 characters)</label>
        <input type="password" id="p-new" name="pw" autocomplete="new-password"></div>
      <div class="field"><label for="p-new2">Confirm new password</label>
        <input type="password" id="p-new2" name="pw2" autocomplete="new-password"></div>
      <div class="error" role="alert"></div>
      <div class="actions"><span class="spacer"></span>
        <button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>
    </form>`,
    {
      async onSubmit(fd) {
        const pw = String(fd.get('pw') || '');
        if (pw.length < 8) return 'Use a password with at least 8 characters.';
        if (pw !== fd.get('pw2')) return 'The two passwords do not match.';
        try {
          await setPassword(pw);
        } catch (err) {
          return authErrorText(err);
        }
        toast('Password updated');
      },
    },
  );
}

document.addEventListener('input', (e) => {
  if (e.target.id === 'q') {
    ui.q = e.target.value;
    ui.txLimit = 50;
    $('#txlist').innerHTML = txListBlock();
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'f-acct') {
    ui.acct = e.target.value;
    ui.txLimit = 50;
    render();
    return;
  }
  if (e.target.id === 'cur') {
    const v = e.target.value.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(v)) {
      setState({ ...state, settings: { ...state.settings, currency: v, updatedAt: Date.now() } });
      toast('Currency updated');
    } else {
      toast('Use a 3-letter currency code, like EGP or USD');
      e.target.value = state.settings.currency;
    }
  }
});

$('#fab').addEventListener('click', () => openTxDialog());

let resizeFrame;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(drawInsights);
});
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('[data-i]')) hideTip();
});
window.addEventListener('scroll', hideTip, { passive: true });

$('#file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    if (file.name.toLowerCase().endsWith('.json')) {
      setState(mergeState(state, sanitizeState(JSON.parse(text))));
      toast('Backup merged into your data');
    } else {
      const res = importCSV(state, text);
      setState(res.state);
      toast(`Imported ${res.added} transaction${res.added === 1 ? '' : 's'}${res.skipped ? `, skipped ${res.skipped}` : ''}`);
    }
  } catch (err) {
    toast(err.message || 'Could not read that file');
  }
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (ui.tab === 'settings') render();
});

// ---------- start ----------

render();
if (cloudEnabled) {
  if (getSession()) {
    if (!getOwner()) setOwner(getSession().user.id);
    runSync();
  }
  window.addEventListener('online', () => runSync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') runSync();
  });
  setInterval(() => document.visibilityState === 'visible' && runSync(), 60_000);
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

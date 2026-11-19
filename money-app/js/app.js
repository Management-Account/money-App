import { pickerHTML, mountPicker } from './picker.js';
import { EMOJI_GROUPS, categoryEmoji, suggestEmoji, validEmoji } from './emoji.js';
import { THEMES, DEFAULT_THEME, isTheme, themeMeta } from './themes.js';
import { institutionOf, badgeHTML } from './institutions.js';
import {
  SCHEMA_VERSION, uid, todayStr, monthKey, shiftMonth, toMinor, fromMinor, formatMoney, createState, live, upsert, remove,
  mergeState, sanitizeState, summarize, toCSV, importCSV, isValidDate, monthsEnding, addDays, daysBetween, unitFor, rangeSeries, balanceBeforeDate, categoryTotalsRange, validLogo,
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
        if (!Array.isArray(s.accounts)) s.accounts = createState().accounts; // saved before accounts existed
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
const ui = { tab: 'home', month: monthKey(todayStr()), q: '', acct: '', ttype: '', txLimit: 50, lastAccount: '', period: '6m', from: '', to: '', auth: 'signin', notice: '', busy: false };
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
const catById = (id) => state.categories.find((c) => c.id === id);
const catLabel = (id) => (id && catById(id) ? `${categoryEmoji(catById(id))} ${catById(id).name}` : '🏷️ Uncategorized');
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
  themes: svg('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.7 1.7-1.7H17a4 4 0 0 0 4-4c0-4.4-4-7.2-9-7.2z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>'),
  wallets: svg('<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6.5 15h4"/>'),
  categories: svg('<path d="M12 3v9h9"/><path d="M20.5 15A9 9 0 1 1 9 3.5"/>'),
  settings: svg('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
};

const LOGO = svg('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.3"/>');

// [id, full label (desktop sidebar), short label (phone bottom bar)]
const TABS = [
  ['home', 'Home', 'Home'],
  ['transactions', 'Transactions', 'Activity'],
  ['wallets', 'Accounts', 'Accounts'],
  ['insights', 'Insights', 'Insights'],
  ['categories', 'Budgets', 'Budgets'],
  ['themes', 'Themes', 'Themes'],
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
    <span><span class="t">${esc(catLabel(t.categoryId))}</span>
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
    <div class="sub">Across ${n} account${n === 1 ? '' : 's'}</div>
  </section>`;
}

const walletIcon = `<span class="acct-ico">${ICONS.wallets}</span>`;
function acctIcon(a) {
  if (a.logo) return `<span class="ibadge img" aria-hidden="true"><img src="${esc(a.logo)}" alt=""></span>`;
  const inst = institutionOf(a.institution);
  return inst ? badgeHTML(inst) : walletIcon;
}
const instLine = (a) => { const i = institutionOf(a.institution); return i && i.name !== a.name ? `<span class="acct-inst">${esc(i.name)}</span>` : ''; };

function acctCard(a) {
  return `<div class="acct">${acctIcon(a)}<div class="acct-body">
    <div class="acct-name">${esc(a.name)}</div>${instLine(a)}
    <div class="acct-bal ${a.balance < 0 ? 'expense' : ''}">${esc(money(a.balance))}</div>
  </div></div>`;
}

function walletCard(a) {
  return `<button class="acct big" data-action="edit-wallet" data-id="${esc(a.id)}">${acctIcon(a)}<span class="acct-body">
    <span class="acct-name">${esc(a.name)}</span>${instLine(a)}
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
    <div class="h2row"><h2>Accounts</h2><button class="link" data-action="tab" data-tab="wallets">Manage</button></div>
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
  return `<h1>Accounts</h1>${heroHTML(w)}
    <div class="btns" style="margin:14px 0"><button class="btn primary" data-action="add-wallet">New account</button></div>
    <div class="accts wide">${w.accounts.map(walletCard).join('')}</div>
    <p class="hint">An account's balance is its starting balance, plus everything recorded in it as income, minus everything recorded as an expense. Choose the account whenever you add a transaction.</p>`;
}

function viewTransactions() {
  const accs = liveAccounts(state);
  if (ui.acct && !accs.some((a) => a.id === ui.acct)) ui.acct = '';
  const typeBtn = (v, label) =>
    `<button class="${ui.ttype === v ? 'on' : ''}" data-action="ttype" data-v="${v}" aria-pressed="${ui.ttype === v}">${label}</button>`;
  return `<h1>Transactions</h1>
    <div class="filterbar">
      <input type="search" id="q" placeholder="Search notes, categories, accounts" value="${esc(ui.q)}" aria-label="Search">
      ${accs.length > 1 ? `<select id="f-acct" aria-label="Account"><option value="">All accounts</option>${accs
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
            <span class="t">${esc(categoryEmoji(c))} ${esc(c.name)}</span>
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

const PERIODS = [['day', 'Day'], ['week', 'Week'], ['1m', '1 month'], ['3m', '3 months'], ['6m', '6 months'], ['12m', '12 months'], ['custom', 'Custom']];

const fmtDay = (d, opts) => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString(undefined, opts);
};

// The dates, bucket size and wording for the selected Insights period.
function insightsPeriod() {
  const today = todayStr();
  const cur = monthKey(today);
  switch (ui.period) {
    case 'day': return { from: today, to: today, name: 'Today' };
    case 'week': return { from: addDays(today, -6), to: today, name: 'Last 7 days' };
    case '1m': return { from: addDays(today, -29), to: today, name: 'Last 30 days' };
    case 'custom': {
      const from = isValidDate(ui.from) ? ui.from : addDays(today, -29);
      const to = isValidDate(ui.to) ? ui.to : today;
      if (from > to) return { from, to, bad: 'The start date must be on or before the end date.', name: 'Custom' };
      if (daysBetween(from, to) > 3660) return { from, to, bad: 'Pick a range of 10 years or less.', name: 'Custom' };
      return { from, to, name: `${fmtDay(from, { day: 'numeric', month: 'short', year: 'numeric' })} to ${fmtDay(to, { day: 'numeric', month: 'short', year: 'numeric' })}` };
    }
    default: {
      const n = Number(ui.period.replace('m', '')) || 6;
      return { from: `${shiftMonth(cur, -(n - 1))}-01`, to: addDays(`${shiftMonth(cur, 1)}-01`, -1), name: `Last ${n} months` };
    }
  }
}

function insightsData() {
  const per = insightsPeriod();
  if (per.bad) return { per, bad: per.bad, hasData: false };
  const unit = unitFor(per.from, per.to);
  const rows = rangeSeries(state, per.from, per.to, unit);
  const income = rows.reduce((t, r) => t + r.income, 0);
  const expense = rows.reduce((t, r) => t + r.expense, 0);
  let run = balanceBeforeDate(state, per.from);
  const balance = rows.map((r) => (run += r.net));
  const all = categoryTotalsRange(state, per.from, per.to, 'expense');
  let top = all.slice(0, 8);
  if (all.length > 8) {
    top = [...all.slice(0, 7), { id: 'other', name: 'Other categories', total: all.slice(7).reduce((t, c) => t + c.total, 0), other: true }];
  }
  const many = rows.length;
  const labels = rows.map((r) => {
    if (unit === 'day') {
      return { label: many <= 7 ? fmtDay(r.key, { weekday: 'short' }) : String(Number(r.key.slice(8))), title: fmtDay(r.key, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) };
    }
    const [y, m] = r.key.split('-').map(Number);
    const base = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
    return { label: many > 12 ? `${base} ${String(y).slice(2)}` : base, title: monthLabel(r.key) };
  });
  const units = unit === 'day' ? rows.length : rows.length;
  return {
    per, unit, rows, labels, income, expense, net: income - expense, balance, units,
    rate: income > 0 ? (income - expense) / income : null,
    cats: top.map((c) => ({ ...c, name: c.other ? `📦 ${c.name}` : catLabel(c.id), share: expense ? c.total / expense : 0 })),
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

function insightsFilter() {
  const buttons = PERIODS.map(([id, label]) => `<button class="${ui.period === id ? 'on' : ''}" data-action="range" data-p="${id}" aria-pressed="${ui.period === id}">${label}</button>`).join('');
  let custom = '';
  if (ui.period === 'custom') {
    const per = insightsPeriod();
    custom = `<div class="daterange card">
      <div class="field"><label for="c-from">From</label><input type="date" id="c-from" value="${esc(per.from)}"></div>
      <div class="field"><label for="c-to">To</label><input type="date" id="c-to" value="${esc(per.to)}"></div>
    </div>${per.bad ? `<p class="error" role="alert">${esc(per.bad)}</p>` : ''}`;
  }
  return `<div class="filters scroll" role="group" aria-label="Period">${buttons}</div>${custom}`;
}

function viewInsights() {
  const d = insightsData();
  const filter = insightsFilter();
  if (!d.hasData) {
    return `<h1>Insights</h1>${filter}${d.bad ? '' : `<div class="card empty">No income or expenses for ${esc(d.per.name.toLowerCase())} yet. Add a few transactions and your charts will appear here.</div>`}`;
  }
  const pct = d.rate === null ? '–' : `${Math.round(d.rate * 100)}%`;
  const tile = (label, value, sub, cls = '') =>
    `<div class="card tile"><div class="label">${label}</div><div class="value ${cls}">${esc(value)}</div><div class="sub">${esc(sub)}</div></div>`;
  const avg = d.units > 1 ? `About ${money(Math.round(d.expense / d.units))} a ${d.unit}` : d.per.name;
  const colHead = d.unit === 'day' ? 'Day' : 'Month';
  const balHint = d.unit === 'day' ? 'at the end of each day' : 'at the end of each month';
  return `<h1>Insights</h1>${filter}
    <div class="tiles">
      ${tile('Income', moneyTile(d.income), d.per.name, 'income')}
      ${tile('Expenses', moneyTile(d.expense), avg, 'expense')}
      ${tile('Net', moneyTile(d.net), d.net >= 0 ? 'You saved this much' : 'You spent more than you earned', d.net < 0 ? 'expense' : '')}
      ${tile('Savings rate', pct, d.rate === null ? 'No income yet' : 'Share of income kept')}
    </div>
    <section class="card chart-card">
      <h2>Income vs expenses</h2>
      <div class="legend"><span class="lg"><i class="s1"></i>Income</span><span class="lg"><i class="s2"></i>Expenses</span></div>
      <div class="chart" id="ch-monthly"></div>
      ${tableView([colHead, 'Income', 'Expenses', 'Net'], d.rows.map((r, i) => [d.labels[i].title, money(r.income), money(r.expense), money(r.net)]))}
    </section>
    ${d.rows.length > 1 ? `<section class="card chart-card">
      <h2>Running balance</h2>
      <p class="hint" style="margin:-4px 0 6px">Everything you have earned minus everything you have spent, ${balHint}.</p>
      <div class="chart" id="ch-balance"></div>
      ${tableView([colHead, 'Balance'], d.rows.map((r, i) => [d.labels[i].title, money(d.balance[i])]))}
    </section>` : ''}
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
  const labels = d.labels;
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
      ariaLabel: 'Income and expenses over time',
    }),
  );
  mount('#ch-balance', (width) =>
    lineChart({
      width,
      months: labels.map((l, i) => ({ ...l, value: d.balance[i] })),
      name: 'Balance',
      fmtMoney: money,
      ariaLabel: 'Running balance over time',
    }),
  );
  mount('#ch-cats', () => rankedBars({ rows: d.cats, fmtMoney: money }));
}

function viewSettings() {
  return `<h1>Settings</h1>
    <h2>Login</h2>${accountCard()}
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

function applyTheme() {
  const id = isTheme(state.settings.theme) ? state.settings.theme : DEFAULT_THEME;
  document.documentElement.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeMeta(id));
}

function viewThemes() {
  const cur = isTheme(state.settings.theme) ? state.settings.theme : DEFAULT_THEME;
  return `<h1>Themes</h1>
    <p class="hint">Pick how the app looks. It applies right away and is saved to your account, so every device uses it.</p>
    <div class="themes">${THEMES.map((t) => `<button class="theme ${t.id === cur ? 'on' : ''}" data-action="theme" data-id="${t.id}" aria-pressed="${t.id === cur}">
      <span class="swatch" style="background:${t.bg}" aria-hidden="true">
        <span class="sw-card" style="background:${t.card}"><i style="background:${t.text}"></i><i style="background:${t.text};width:46%"></i></span>
        <span class="sw-btn" style="background:linear-gradient(135deg,${t.accent2},${t.accent})"></span>
      </span>
      <span class="th-name">${esc(t.name)}${t.id === cur ? ' <span class="th-on">✓ In use</span>' : ''}</span>
      <span class="th-blurb">${esc(t.blurb)}</span>
    </button>`).join('')}</div>`;
}

function render() {
  applyTheme();
  const authScreen = cloudEnabled && !getSession();
  document.body.classList.toggle('auth-mode', authScreen);
  if (authScreen) {
    $('#nav').innerHTML = '';
    $('#main').innerHTML = viewAuth();
    return;
  }
  renderNav();
  const views = { home: viewHome, transactions: viewTransactions, wallets: viewWallets, insights: viewInsights, categories: viewCategories, themes: viewThemes, settings: viewSettings };
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
      .map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(categoryEmoji(c))} ${esc(c.name)}</option>`)
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
      <div class="field"><label for="f-acc">Account</label>
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
        if (!liveAccounts(state).some((a) => a.id === accountId)) return 'Pick an account.';
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

// Shrinks a picked image to a 96px square (centre-cropped) and returns a small data URL.
async function imageToLogo(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error('empty');
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 96, 96);
    let out = c.toDataURL('image/png');
    if (!validLogo(out)) out = c.toDataURL('image/jpeg', 0.85);
    if (!validLogo(out)) throw new Error('too big');
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function openWalletDialog(id) {
  const existing = id ? live(state.accounts).find((a) => a.id === id) : null;
  const acc = existing || { id: uid(), name: '', opening: 0, institution: '', logo: '' };
  const count = existing ? accountSummaries(state).accounts.find((a) => a.id === id)?.count || 0 : 0;
  const canDelete = existing && liveAccounts(state).length > 1;
  openDialog(
    `<form>
      <h3>${existing ? 'Edit account' : 'New account'}</h3>
      ${pickerHTML('inst', acc.institution)}
      <div class="field logo-field"><span class="lbl">Logo</span>
        <div class="logo-row"><span id="logo-prev"></span>
          <button type="button" class="btn" id="logo-pick">Upload image</button>
          <button type="button" class="btn" id="logo-clear" hidden>Remove</button>
        </div>
        <input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
        <input type="hidden" name="logo" value="${esc(acc.logo || '')}">
        <span class="hint">Optional. Pick any picture for this bank or account (it is shrunk to a small square).</span></div>
      <div class="field"><label for="w-name">Account name (for example CIB Savings, Salary, Daily)</label>
        <input type="text" id="w-name" name="name" maxlength="60" autocomplete="off" value="${esc(acc.name)}"></div>
      <div class="field"><label for="w-open">Starting balance</label>
        <input type="text" id="w-open" name="opening" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${existing ? esc(fromMinor(acc.opening)) : ''}">
        <span class="hint">What was in this account before the transactions you record here. Balance = starting balance + income - expenses. Use a minus sign for debt, like -200.</span></div>
      ${existing && !canDelete ? '<p class="hint">This is your only account, so it cannot be deleted.</p>' : ''}
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
        ? `Delete the account "${acc.name}" and its ${count} transaction${count === 1 ? '' : 's'}? This cannot be undone.`
        : `Delete the account "${acc.name}"?`,
      onOpen(form) {
        const nameEl = form.querySelector('#w-name');
        // Fill the name from the chosen institution unless the user typed their own name.
        let auto = !existing || !acc.name || acc.name === institutionOf(acc.institution)?.name;
        nameEl.addEventListener('input', () => { auto = false; });
        const logoEl = form.querySelector('input[name="logo"]');
        const prev = form.querySelector('#logo-prev');
        const clearBtn = form.querySelector('#logo-clear');
        let instValue = acc.institution || '';
        const showLogo = () => {
          prev.innerHTML = acctIcon({ logo: logoEl.value, institution: instValue });
          clearBtn.hidden = !logoEl.value;
        };
        const picker = mountPicker(form.querySelector('#inst'), (value, label) => {
          instValue = value;
          if (auto && label) nameEl.value = label;
          else if (auto && !value) nameEl.value = '';
          showLogo();
        });
        showLogo();
        const fileEl = form.querySelector('#logo-file');
        form.querySelector('#logo-pick').addEventListener('click', () => fileEl.click());
        clearBtn.addEventListener('click', () => { logoEl.value = ''; showLogo(); });
        fileEl.addEventListener('change', async () => {
          const f = fileEl.files[0];
          fileEl.value = '';
          if (!f) return;
          const err = form.querySelector('.error');
          try {
            logoEl.value = await imageToLogo(f);
            err.textContent = '';
          } catch {
            err.textContent = 'That file could not be read as a picture. Try a PNG or JPEG.';
          }
          showLogo();
        });
        // New account: open the list right away. Editing: keep it closed so the form is usable.
        if (!existing) { form.querySelector('#inst-input').focus(); picker.show(); } else document.activeElement?.blur?.();
      },
      onSubmit(fd) {
        const name = (fd.get('name') || '').trim();
        if (!name) return 'Give the account a name.';
        if (liveAccounts(state).some((a) => a.id !== acc.id && a.name.toLowerCase() === name.toLowerCase())) return 'You already have an account with that name. Add something to tell them apart, like "CIB Savings".';
        const raw = (fd.get('opening') || '').trim();
        const opening = raw ? toMinorSigned(raw) : 0;
        if (!Number.isFinite(opening)) return 'Starting balance must be a number like 500 or -120.50.';
        const institution = (fd.get('institution') || '').trim();
        const logo = validLogo(fd.get('logo') || '');
        setState({ ...state, accounts: upsert(state.accounts, { id: acc.id, name, opening, institution, logo }) });
      },
      onDelete() {
        if (ui.acct === acc.id) ui.acct = '';
        if (ui.lastAccount === acc.id) ui.lastAccount = '';
        setState(removeAccount(state, acc.id));
        toast('Account deleted');
      },
    },
  );
}

function openCatDialog(id) {
  const existing = id ? live(state.categories).find((c) => c.id === id) : null;
  const cat = existing || { id: uid(), name: '', type: 'expense', budget: 0, emoji: '' };
  const picked = existing ? categoryEmoji(existing) : '';
  openDialog(
    `<form>
      <h3>${existing ? 'Edit category' : 'New category'}</h3>
      <div class="field"><label for="c-name">Name</label>
        <input type="text" id="c-name" name="name" maxlength="60" autocomplete="off" value="${esc(cat.name)}"></div>
      <div class="field emoji-field"><span class="lbl">Icon (emoji)</span>
        <div class="emoji-row"><span class="emoji-prev" id="e-prev" aria-live="polite">${esc(picked || '🏷️')}</span>
          <input type="text" id="e-own" maxlength="8" autocomplete="off" placeholder="Type or paste your own" aria-label="Type your own emoji">
          <button type="button" class="btn" id="e-clear">Auto</button></div>
        <input type="hidden" name="emoji" value="${esc(existing ? cat.emoji || '' : '')}">
        <div class="emoji-grid" role="group" aria-label="Pick an emoji">${EMOJI_GROUPS.map(([g, list]) => `<span class="eg-name">${esc(g)}</span>${list.map((e) => `<button type="button" class="em" data-e="${e}" aria-label="${e}">${e}</button>`).join('')}`).join('')}</div>
        <span class="hint">Shown next to the category everywhere. "Auto" picks one from the name.</span></div>
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
        const hid = form.querySelector('input[name="emoji"]');
        const prev = form.querySelector('#e-prev');
        const own = form.querySelector('#e-own');
        const nameEl = form.querySelector('#c-name');
        const show = () => { prev.textContent = validEmoji(hid.value) || suggestEmoji(nameEl.value) || categoryEmoji({ ...cat, name: nameEl.value, emoji: '', type: sel.value }); };
        form.querySelector('.emoji-grid').addEventListener('click', (e) => {
          const b = e.target.closest('.em');
          if (!b) return;
          hid.value = b.dataset.e;
          own.value = '';
          show();
        });
        own.addEventListener('input', () => {
          const first = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(own.value.trim())][0]?.segment || '';
          hid.value = validEmoji(first);
          show();
        });
        form.querySelector('#e-clear').addEventListener('click', () => { hid.value = ''; own.value = ''; show(); });
        nameEl.addEventListener('input', () => { if (!hid.value) show(); });
        sel.addEventListener('change', () => { if (!hid.value) show(); });
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
        setState({ ...state, categories: upsert(state.categories, { id: cat.id, name, type, budget, emoji: validEmoji(fd.get('emoji') || '') }) });
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
    case 'theme':
      if (isTheme(id) && id !== state.settings.theme) {
        setState({ ...state, settings: { ...state.settings, theme: id, updatedAt: Date.now() } });
        toast(`${THEMES.find((t) => t.id === id).name} theme on`);
      }
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
      ui.period = PERIODS.some((p) => p[0] === el.dataset.p) ? el.dataset.p : '6m';
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
  if (e.target.id === 'c-from' || e.target.id === 'c-to') {
    ui[e.target.id === 'c-from' ? 'from' : 'to'] = e.target.value;
    if (!isValidDate(ui.from)) ui.from = insightsPeriod().from;
    if (!isValidDate(ui.to)) ui.to = insightsPeriod().to;
    render();
    return;
  }
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

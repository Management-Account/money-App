import { pickerHTML, mountPicker } from './picker.js';
import { EMOJI_GROUPS, categoryEmoji, suggestEmoji, validEmoji } from './emoji.js';
import { categoryColor, nextColor, validColor, PALETTE } from './colors.js';
import { THEMES, DEFAULT_THEME, isTheme, themeMeta, GRAPH_STYLES, DEFAULT_GRAPH, isGraph, BALANCE_STYLES, DEFAULT_BALANCE, isBalance, ACCOUNT_LIST_OPTIONS, DEFAULT_ACCOUNT_LIST, isAccountList, NAV_STYLES, DEFAULT_NAV, isNavStyle, INTRO_STYLES, DEFAULT_INTRO, isIntroStyle } from './themes.js';
import { institutionOf, badgeHTML } from './institutions.js';
import {
  SCHEMA_VERSION, uid, todayStr, monthKey, shiftMonth, toMinor, fromMinor, formatMoney, createState, live, upsert, remove,
  mergeState, sanitizeState, summarize, toCSV, importCSV, isValidDate, monthsEnding, addDays, daysBetween, unitFor, rangeSeries, balanceBeforeDate, categoryTotalsRange, validLogo,
  toMinorSigned, liveAccounts, fallbackAccountId, accountIdOf, accountSummaries, removeAccount, FEE_CAT, FEE_NAME, isTransferTx, transferLegs, netWorthSeries,
  debtPaid, debtRemaining, debtSettled, debtTotals,
} from './store.js';
import { getCurrencies } from './currencies.js';
import { columnChart, lineChart, rankedBars, ringGauge, donutChart, attachTips, hideTip } from './charts.js';
import {
  cloudEnabled, AuthError, NetworkError, getSession, getOwner, setOwner, signUp, signIn, signOut, setPassword, syncNow, debtsTableMissing,
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
        if (!Array.isArray(s.debts)) s.debts = []; // saved before debts existed
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
const ui = { tab: 'home', month: monthKey(todayStr()), q: '', acct: '', ttype: '', txLimit: 50, lastAccount: '', deck: 0, donutSig: '', period: '6m', from: '', to: '', auth: 'signin', notice: '', busy: false };
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

function scheduleSync(delay = 150) {
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
  if (debtsTableMissing.value) return 'Synced, but debts are not syncing yet: run the updated supabase/schema.sql once (see README).';
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
const catLabel = (id) => (id === FEE_CAT ? `🔁 ${FEE_NAME}` : id && catById(id) ? `${categoryEmoji(catById(id))} ${catById(id).name}` : '🏷️ Uncategorized');
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

// Arrow and plus symbols are drawn, not typed, so they sit exactly in the middle of their buttons.
const CHEV_L = svg('<path d="M15 5l-6 7 6 7"/>');
const CHEV_R = svg('<path d="M9 5l6 7-6 7"/>');

const ICONS = {
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  transactions: svg('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>'),
  insights: svg('<path d="M5 20v-7M11 20V5M17 20v-10M3 20h18"/>'),
  themes: svg('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.7 1.7-1.7H17a4 4 0 0 0 4-4c0-4.4-4-7.2-9-7.2z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>'),
  wallets: svg('<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6.5 15h4"/>'),
  categories: svg('<path d="M12 3v9h9"/><path d="M20.5 15A9 9 0 1 1 9 3.5"/>'),
  profile: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  signout: svg('<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M16 8l4 4-4 4M20 12H9"/>'),
  debts: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  settings: svg('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
};

const LOGO = svg('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.3"/>');

// [id, full label (desktop sidebar), short label (phone bottom bar)]
const TABS = [
  ['home', 'Home', 'Home'],
  ['transactions', 'Transactions', 'Activity'],
  ['wallets', 'Accounts', 'Accounts'],
  ['debts', 'Debts', 'Debts'],
  ['insights', 'Insights', 'Insights'],
  ['categories', 'Budgets', 'Budgets'],
  ['settings', 'Settings', 'Settings'],
];

function profName() {
  const s = getSession();
  return (state.settings.name || '').trim() || (s ? displayName(s.user.email) : '') || 'there';
}
function avatarHTML(cls = '') {
  const a = state.settings.avatar;
  return `<span class="avatar ${cls}" aria-hidden="true">${a ? `<img src="${esc(a)}" alt="">` : esc((profName()[0] || '?').toUpperCase())}</span>`;
}
const userHandle = () => { const s = getSession(); return s ? `@${displayName(s.user.email)}` : 'This device'; };

function renderNav() {
  $('#nav').innerHTML =
    `<div class="brand"><span class="logo">${LOGO}</span><span>Pocket Ledger</span></div>` +
    TABS.map(
      ([id, label, short]) =>
        `<button data-action="tab" data-tab="${id}" aria-label="${label}" ${ui.tab === id ? 'aria-current="page"' : ''}>` +
        `<span class="ico">${ICONS[id]}</span><span class="lbl">${label}</span><span class="lbl-s">${short}</span></button>`,
    ).join('') +
    `<div class="nav-foot"><button class="mini-profile" data-action="pmenu" aria-label="Your profile menu" aria-haspopup="menu" ${ui.tab === 'profile' || ui.tab === 'themes' ? 'aria-current="page"' : ''}>` +
    `${avatarHTML('sm')}<span class="mp-text"><b>${esc(profName())}</b><small>${esc(userHandle())}</small></span></button></div>`;
}

// ---------- profile window (opened from the sidebar profile panel or the avatar button) ----------

function closePMenu() {
  const m = document.getElementById('pmenu');
  if (!m) return;
  m.remove();
  document.querySelectorAll('[data-action="pmenu"][aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}
function openPMenu(trigger) {
  closePMenu();
  const signedIn = cloudEnabled && !!getSession();
  const item = (a, ico, label, extra = '') => `<button role="menuitem" class="pm-item ${extra}" data-action="${a}"${a === 'tab' ? ` data-tab="${label.toLowerCase()}"` : ''}><span class="ico">${ICONS[ico]}</span><span>${label}</span></button>`;
  const m = document.createElement('div');
  m.id = 'pmenu';
  m.className = 'pmenu';
  m.setAttribute('role', 'menu');
  m.setAttribute('aria-label', 'Profile');
  m.innerHTML = `<div class="pm-head">${avatarHTML('lg')}<div class="pm-id"><b>${esc(profName())}</b><small>${esc(userHandle())}</small></div></div>
    <div class="pm-stats"><div><b>${liveAccounts(state).length}</b><span>Accounts</span></div><div><b>${live(state.transactions).length}</b><span>Transactions</span></div></div>
    <div class="pm-sync" aria-live="polite">${esc(syncText())}</div>
    <div class="pm-list">${item('edit-profile', 'profile', 'Edit profile')}${item('tab', 'themes', 'Themes')}${item('tab', 'settings', 'Settings')}${signedIn ? item('signout', 'signout', 'Sign out', 'danger') : ''}</div>`;
  document.body.appendChild(m);
  trigger.setAttribute('aria-expanded', 'true');
  const r = trigger.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight, vw = innerWidth, vh = innerHeight;
  let left = Math.min(Math.max(8, r.left), vw - w - 8);
  let top = r.top > vh / 2 ? r.top - h - 10 : r.bottom + 10;
  if (r.left > vw / 2) left = Math.min(vw - w - 8, Math.max(8, r.right - w));
  m.style.left = `${left}px`;
  m.style.top = `${Math.min(Math.max(8, top), Math.max(8, vh - h - 8))}px`;
  m.querySelector('.pm-item')?.focus();
}
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#pmenu, [data-action="pmenu"]')) closePMenu();
});
document.addEventListener('keydown', (e) => {
  const m = document.getElementById('pmenu');
  if (!m) return;
  if (e.key === 'Escape') { closePMenu(); document.querySelector('[data-action="pmenu"]')?.focus(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const it = [...m.querySelectorAll('.pm-item')], i = it.indexOf(document.activeElement);
    it[(i + (e.key === 'ArrowDown' ? 1 : -1) + it.length) % it.length].focus();
  }
});
window.addEventListener('resize', closePMenu);

// ---------- navigation and opening animations ----------

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const navStyle = () => (isNavStyle(state.settings.nav) ? state.settings.nav : DEFAULT_NAV);
const introStyle = () => (isIntroStyle(state.settings.intro) ? state.settings.intro : DEFAULT_INTRO);
let introPending = true;
const IND_STYLES = new Set(['pill', 'expand', 'tabs', 'spot']);
const PAGE_FX = { pill: 'fade', bubble: 'fade', expand: 'fade', tabs: 'slide', press: 'fade', dock: 'stagger', spot: 'flip' };

function ensureGooFilter() {
  if (document.getElementById('nfx-svg')) return;
  document.body.insertAdjacentHTML('beforeend', '<svg id="nfx-svg" width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="nfx-goo"><feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b"/><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"/></filter></svg>');
}

// Called after every nav render. The nav is rebuilt each time, so the last position is remembered to animate from.
function mountNavFx() {
  const nav = $('#nav'), style = navStyle();
  document.body.dataset.nav = style;
  const prev = ui.navFx || {};
  const btn = nav.querySelector(':scope > button[aria-current="page"][data-tab]');
  const moved = !!btn && !!prev.tab && prev.tab !== ui.tab && !reduceMotion();
  ui.navFx = { tab: ui.tab, rect: prev.rect, blob: prev.blob };
  if (style === 'default' || !btn) return;
  if (moved) btn.classList.add('nfx-go');
  if (IND_STYLES.has(style)) {
    const ind = document.createElement('span');
    ind.className = 'nfx nfx-ind';
    nav.prepend(ind);
    const to = { x: btn.offsetLeft, y: btn.offsetTop, w: btn.offsetWidth, h: btn.offsetHeight };
    const from = moved && prev.rect ? prev.rect : to;
    const set = (r) => { ind.style.width = `${r.w}px`; ind.style.height = `${r.h}px`; ind.style.transform = `translate(${r.x}px,${r.y}px)`; };
    ind.style.transition = 'none';
    set(from);
    void ind.offsetWidth;
    ind.style.transition = '';
    set(to);
    ui.navFx.rect = to;
  }
  if (style === 'bubble') {
    ensureGooFilter();
    const ico = btn.querySelector('.ico');
    const to = { x: btn.offsetLeft + ico.offsetLeft + ico.offsetWidth / 2 - 22, y: btn.offsetTop + ico.offsetTop + ico.offsetHeight / 2 - 22 };
    const from = moved && prev.blob ? prev.blob : to;
    const goo = document.createElement('div');
    goo.className = 'nfx nfx-goo';
    goo.innerHTML = '<span class="nfx-blob nfx-b2"></span><span class="nfx-blob nfx-b1"></span>';
    nav.prepend(goo);
    const bs = [...goo.children];
    bs.forEach((b) => { b.style.transition = 'none'; b.style.transform = `translate(${from.x}px,${from.y}px)`; });
    void goo.offsetWidth;
    bs.forEach((b) => { b.style.transition = ''; b.style.transform = `translate(${to.x}px,${to.y}px)`; });
    ui.navFx.blob = to;
  }
  if (style === 'press' && moved) {
    const ring = document.createElement('span');
    ring.className = 'nfx nfx-ring';
    btn.appendChild(ring);
    setTimeout(() => ring.remove(), 700);
  }
}

function initNavFx() {
  const nav = $('#nav');
  nav.addEventListener('pointermove', (e) => {
    if (navStyle() !== 'dock' || e.pointerType === 'touch') return;
    nav.querySelectorAll(':scope > button .ico').forEach((ic) => {
      const r = ic.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      ic.style.transform = `scale(${(1 + 0.5 * Math.max(0, 1 - d / 80)).toFixed(3)})`;
    });
  });
  nav.addEventListener('pointerleave', () => nav.querySelectorAll('.ico').forEach((ic) => { ic.style.transform = ''; }));
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (navStyle() === 'default' || document.body.classList.contains('auth-mode')) return; ui.navFx = { tab: ui.tab }; renderNav(); mountNavFx(); }, 160);
  });
}

// Page change animation for the chosen navigation style.
function pageFx() {
  const prevTab = ui.lastTab;
  ui.lastTab = ui.tab;
  const kind = PAGE_FX[navStyle()];
  if (!kind || !prevTab || prevTab === ui.tab || reduceMotion()) return;
  const order = [...TABS.map((t) => t[0]), 'themes', 'profile'];
  const main = $('#main');
  main.style.setProperty('--pd', order.indexOf(ui.tab) >= order.indexOf(prevTab) ? 1 : -1);
  if (kind === 'stagger') [...main.children].forEach((c, i) => c.style.setProperty('--pi', Math.min(i, 7)));
  main.classList.remove('pgx-fade', 'pgx-slide', 'pgx-flip', 'pgx-stagger');
  void main.offsetWidth;
  main.classList.add(`pgx-${kind}`);
  clearTimeout(ui.pgT);
  ui.pgT = setTimeout(() => main.classList.remove(`pgx-${kind}`), 900);
}

// Opening animation. Content styles animate the real page; the others cover it with a themed layer first.
function playIntro(id) {
  if (!isIntroStyle(id) || id === 'off' || reduceMotion() || document.body.classList.contains('auth-mode')) return;
  document.getElementById('intro')?.remove();
  clearTimeout(ui.inT);
  const body = document.body, main = $('#main');
  const base = { cascade: 0.1, draw: 0.1, splash: 1.6, liquid: 1.4, circle: 1.1, skeleton: 1.3 }[id];
  body.style.setProperty('--ibase', `${base}s`);
  body.classList.remove('ixm-cascade', 'ixm-draw');
  body.classList.add(id === 'draw' ? 'ixm-draw' : 'ixm-cascade');
  [...main.children].flatMap((c) => (c.classList.contains('dash') ? [...c.children] : [c])).forEach((c, i) => { c.classList.add('ix'); c.style.setProperty('--ii', Math.min(i, 9)); });
  main.querySelectorAll('.chart-svg .line, .chart-svg .wave-line').forEach((p) => p.setAttribute('pathLength', '1'));
  const hv = main.querySelector('.hero-value, .dcard[data-rel="0"] .dc-value');
  if (hv) {
    const total = accountSummaries(state).total, token = (ui.cnt = (ui.cnt || 0) + 1);
    hv.textContent = money(0);
    setTimeout(() => {
      const t0 = performance.now();
      const step = (t) => { if (token !== ui.cnt) return; const p = Math.min(1, (t - t0) / 1200); hv.textContent = money(Math.round(total * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }, (base + 0.3) * 1000);
  }
  const lg = `<div class="in-box"><div class="in-lg">${LOGO}</div><div class="in-wm">Pocket Ledger</div></div>`;
  const layers = {
    splash: lg,
    liquid: `<svg class="in-wave" viewBox="0 0 400 24" preserveAspectRatio="none" aria-hidden="true"><path fill="currentColor" d="M0 14 Q50 0 100 14 T200 14 T300 14 T400 14 V24 H0Z"/></svg>${lg}`,
    circle: `<span class="in-ring"></span><span class="in-ring"></span><div class="in-box"><div class="in-lg">${LOGO}</div></div>`,
    skeleton: '<div class="sk sk-nav"></div><div class="in-sk"><div class="sk" style="height:44px;width:55%"></div><div class="sk" style="height:150px"></div><div class="sk-two"><div class="sk" style="height:130px"></div><div class="sk" style="height:130px"></div></div><div class="sk" style="height:52px"></div><div class="sk" style="height:52px"></div></div>',
  }[id];
  if (layers) {
    const el = document.createElement('div');
    el.id = 'intro';
    el.className = `intro intro-${id}${id === 'circle' && !('registerProperty' in CSS) ? ' np' : ''}`;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = layers;
    body.appendChild(el);
  }
  ui.inT = setTimeout(() => {
    document.getElementById('intro')?.remove();
    body.classList.remove('ixm-cascade', 'ixm-draw');
    document.querySelectorAll('.ix').forEach((c) => { c.classList.remove('ix'); c.style.removeProperty('--ii'); });
  }, 4300);
}

function monthSwitcher() {
  return `<div class="month">
    <button class="icon-btn" data-action="prev-month" aria-label="Previous month">${CHEV_L}</button>
    <span class="name">${esc(monthLabel(ui.month))}</span>
    <button class="icon-btn" data-action="next-month" aria-label="Next month">${CHEV_R}</button>
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
    if (ui.ttype === 'transfer' ? !isTransferTx(t) : ui.ttype && t.type !== ui.ttype) return false;
    const aid = accountIdOf(state, t);
    const ids = t.type === 'transfer' ? [aid, trTo(t), trFeeAcc(t)] : [aid];
    if (ui.acct && !ids.includes(ui.acct)) return false;
    if (!q) return true;
    return t.note.toLowerCase().includes(q) || (isTransferTx(t) ? 'transfer' : catName(t.categoryId).toLowerCase()).includes(q) || ids.some((i) => acctName(i).toLowerCase().includes(q));
  });
}

const trTo = (t) => { const a = liveAccounts(state).find((x) => x.id === t.toAccountId); return a ? a.id : fallbackAccountId(state); };
const trFeeAcc = (t) => { const a = t.feeAccountId && liveAccounts(state).find((x) => x.id === t.feeAccountId); return a ? a.id : accountIdOf(state, t); };

function txRow(t, multi, withDate = false) {
  const tr = t.type === 'transfer';
  const sign = t.type === 'income' ? '+' : tr ? '' : '−';
  const feeText = tr && t.fee > 0 ? `Fee ${money(t.fee)} from ${acctName(trFeeAcc(t))}` : '';
  const sub = [withDate ? dayLabel(t.date) : '', t.note, tr ? feeText : multi ? acctName(accountIdOf(state, t)) : ''].filter(Boolean).join(' · ');
  let title = catLabel(t.categoryId);
  if (tr) title = `🔁 ${acctName(accountIdOf(state, t))} → ${acctName(trTo(t))}`;
  else if (t.transferId) {
    const legs = transferLegs(state, t.transferId);
    const other = (k) => { const l = legs.find((x) => x.leg === k); return l ? acctName(accountIdOf(state, l)) : ''; };
    title = t.leg === 'out' ? `🔁 Transfer to ${other('in')}` : t.leg === 'in' ? `🔁 Transfer from ${other('out')}` : '🔁 Transfer fee';
  }
  return `<button class="row" data-action="edit-tx" data-id="${esc(t.id)}">
    <span><span class="t">${esc(title)}</span>
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
        <div class="bar ${cls}" style="--c:${categoryColor(catById(r.id))}" role="img" aria-label="${esc(r.name)} ${width}%"><span style="width:${width}%"></span></div>
      </div>`;
    })
    .join('');
}

function heroHTML(w) {
  const n = w.accounts.length;
  return `<section class="card hero"><span class="blob" aria-hidden="true"></span>
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

function budgetAlerts(s) {
  return s.byCategory
    .filter((r) => r.budget > 0 && r.spent / r.budget >= 0.85)
    .map((r) => ({ name: catLabel(r.id), over: r.spent > r.budget, text: `${money(r.spent)} of ${money(r.budget)}` }));
}

function topbarHTML(s) {
  const n = budgetAlerts(s).length;
  return `<header class="topbar">
    <div class="greet"><h1>Dashboard</h1><p>Welcome back, ${esc(profName())} \u{1F44B}</p></div>
    <label class="search">${ICONS.search}<input id="topsearch" type="search" placeholder="Search transactions" aria-label="Search transactions" value="${esc(ui.q)}"></label>
    <button class="icon-pill" data-action="bell" aria-label="Notifications${n ? `, ${n} budget alert${n === 1 ? '' : 's'}` : ''}">${ICONS.bell}${n ? `<span class="badge">${n}</span>` : ''}</button>
    <button class="avatar-btn" data-action="pmenu" aria-label="Your profile menu" aria-haspopup="menu">${avatarHTML()}</button>
  </header>`;
}

function profileStats() {
  return `<div class="pstats">
    <div><b>${live(state.transactions).length}</b><span>Transactions</span></div>
    <div><b>${liveAccounts(state).length}</b><span>Accounts</span></div>
    <div><b>${live(state.categories).length}</b><span>Categories</span></div>
  </div>`;
}

// ---------- balance deck: the total first, then one card per account, swipe left for the next ----------

const hueOf = (str) => { let h = 7; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };

function deckItems(w, s) {
  const n = w.accounts.length;
  const items = [{
    key: 'total', title: 'Total balance', sub: `Across ${n} account${n === 1 ? '' : 's'}`, value: w.total, pill: `${n} account${n === 1 ? '' : 's'}`,
    icon: `<span class="dc-ico">${ICONS.wallets}</span>`, x1: 12, x2: 62,
    chips: [`Income +${money(s.income)}`, `Spent −${money(s.expense)}`],
  }];
  for (const a of w.accounts) {
    const h = hueOf(a.id);
    items.push({
      key: a.id, title: a.name, sub: (institutionOf(a.institution) || {}).name && institutionOf(a.institution).name !== a.name ? institutionOf(a.institution).name : 'Account', value: a.balance,
      pill: `${a.count} transaction${a.count === 1 ? '' : 's'}`, icon: acctIcon(a), x1: 4 + (h % 34), x2: 38 + ((h >> 3) % 52),
      chips: [`In +${money(a.income)}`, `Out −${money(a.expense)}`],
    });
  }
  return items;
}

function dcardHTML(it, attrs) {
  return `<article class="dcard" ${attrs} data-key="${esc(it.key)}" style="--x1:${it.x1}%;--x2:${it.x2}%">
    <span class="dc-badge">${it.icon}</span><span class="dc-pill">${esc(it.pill)}</span>
    <div class="dc-title">${esc(it.title)}</div><div class="dc-sub">${esc(it.sub)}</div>
    <div class="dc-value ${it.value < 0 ? 'neg' : ''}">${esc(money(it.value))}</div>
    <div class="dc-chips">${it.chips.map((c) => `<span>${esc(c)}</span>`).join('')}</div>
  </article>`;
}

// Classic layout: the same cards, laid out flat. The total on top, every account in an even grid below.
const flatAttrs = (label) => `data-action="open-acct" role="button" tabindex="0" aria-label="${esc(label)}. Show its transactions"`;
function classicTotalHTML(w, s) {
  const it = deckItems(w, s)[0];
  return dcardHTML(it, `data-flat="1" ${flatAttrs(it.title)}`);
}
function classicAccountsHTML(w, s) {
  const items = deckItems(w, s).slice(1);
  return `<div class="h2row"><h2>Accounts</h2><button class="link" data-action="tab" data-tab="wallets">Manage</button></div>
    <div class="dgrid">${items.map((it) => dcardHTML(it, `data-flat="1" data-small="1" ${flatAttrs(it.title)}`)).join('')}</div>`;
}

function deckHTML(w, s) {
  const items = deckItems(w, s);
  const n = items.length;
  if (ui.deck >= n || ui.deck < 0) ui.deck = 0;
  const cards = items.map((it, i) => {
    const rel = (i - ui.deck + n) % n;
    return dcardHTML(it, `data-i="${i}" data-rel="${Math.min(rel, 3)}" ${rel ? 'aria-hidden="true"' : ''}`);
  }).join('');
  return `<section class="deck" role="group" aria-roledescription="carousel" aria-label="Balances. Swipe left for the next card, press Enter to see its transactions" tabindex="0" data-n="${n}">
    <div class="deck-stage">${cards}</div>
    ${n > 1 ? `<div class="deck-nav"><button class="icon-pill sm" data-deck="prev" aria-label="Previous card">${CHEV_L}</button>
      <div class="dots">${items.map((it, i) => `<button class="dot ${i === ui.deck ? 'on' : ''}" data-deck="${i}" aria-label="${esc(it.title)}"></button>`).join('')}</div>
      <button class="icon-pill sm" data-deck="next" aria-label="Next card">${CHEV_R}</button></div>` : ''}
    <div class="deck-foot"><span class="hint" aria-live="polite" id="deck-count" title="Tap the card to see its transactions">${esc(items[ui.deck].title)}${n > 1 ? ` · ${ui.deck + 1} of ${n}` : ''}</span><button class="link" data-action="tab" data-tab="wallets">Manage accounts</button></div>
  </section>`;
}

// Classic style: the original total-balance card, with arrows to step through the accounts.
function heroBody(it) {
  return `<div class="label hn-label">${it.key === 'total' ? '' : `<span class="hn-ico">${it.icon}</span>`}${esc(it.title)}</div>
    <div class="hero-value ${it.value < 0 ? 'expense' : ''}">${esc(money(it.value))}</div>
    <div class="sub">${esc(it.sub)}</div>`;
}

function heroNavHTML(w, s) {
  const items = deckItems(w, s);
  const n = items.length;
  if (ui.deck >= n || ui.deck < 0) ui.deck = 0;
  const it = items[ui.deck];
  return `<section class="card hero hero-nav" role="group" aria-roledescription="carousel" aria-label="Balances" data-n="${n}"><span class="blob" aria-hidden="true"></span>
    <div class="hn-body" data-action="open-acct" data-key="${esc(it.key)}" role="button" tabindex="0" aria-live="polite">${heroBody(it)}</div>
    ${n > 1 ? `<div class="hn-nav"><button class="icon-pill sm" data-hn="prev" aria-label="Previous account">${CHEV_L}</button>
      <div class="dots">${items.map((x, i) => `<button class="dot ${i === ui.deck ? 'on' : ''}" data-hn="${i}" aria-label="${esc(x.title)}"></button>`).join('')}</div>
      <button class="icon-pill sm" data-hn="next" aria-label="Next account">${CHEV_R}</button></div>` : ''}
  </section>`;
}

function mountHeroNav(w, s) {
  const root = $('.hero-nav');
  if (!root) return;
  const items = deckItems(w, s);
  const n = items.length;
  const body = root.querySelector('.hn-body');
  const dots = [...root.querySelectorAll('.dot')];
  let busy = false;
  const show = (to, dir) => {
    if (busy || to === ui.deck) return;
    busy = true;
    body.classList.add(dir > 0 ? 'out-l' : 'out-r');
    setTimeout(() => {
      ui.deck = to;
      body.innerHTML = heroBody(items[to]);
      body.dataset.key = items[to].key;
      dots.forEach((d, i) => d.classList.toggle('on', i === to));
      body.classList.remove('out-l', 'out-r');
      body.classList.add('snap', dir > 0 ? 'in-r' : 'in-l');
      void body.offsetWidth;
      body.classList.remove('snap', 'in-r', 'in-l');
      setTimeout(() => { busy = false; }, 220);
    }, 150);
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hn]');
    if (!b) return;
    const v = b.dataset.hn;
    if (v === 'next') show((ui.deck + 1) % n, 1);
    else if (v === 'prev') show((ui.deck - 1 + n) % n, -1);
    else show(Number(v), Number(v) > ui.deck ? 1 : -1);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { show((ui.deck + 1) % n, 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { show((ui.deck - 1 + n) % n, -1); e.preventDefault(); }
  });
}

function mountDeck() {
  const deck = $('.deck');
  if (!deck) return;
  const cards = [...deck.querySelectorAll('.dcard')];
  const n = cards.length;
  const counter = $('#deck-count');
  const dots = [...deck.querySelectorAll('.dot')];
  const titles = cards.map((c) => c.querySelector('.dc-title').textContent);
  const layout = () => {
    cards.forEach((c, i) => {
      const rel = (i - ui.deck + n) % n;
      c.dataset.rel = Math.min(rel, 3);
      if (rel) c.setAttribute('aria-hidden', 'true'); else c.removeAttribute('aria-hidden');
    });
    dots.forEach((d, i) => d.classList.toggle('on', i === ui.deck));
    if (counter) counter.textContent = `${titles[ui.deck]} · ${ui.deck + 1} of ${n}`;
  };
  let busy = false;
  const next = () => {
    if (n < 2 || busy) return;
    busy = true;
    const front = cards[ui.deck];
    front.classList.add('leaving');
    ui.deck = (ui.deck + 1) % n;
    layout();
    const done = () => { front.classList.add('snap'); front.classList.remove('leaving'); void front.offsetWidth; front.classList.remove('snap'); busy = false; };
    setTimeout(done, 420);
  };
  const prev = () => {
    if (n < 2 || busy) return;
    busy = true;
    ui.deck = (ui.deck - 1 + n) % n;
    const back = cards[ui.deck];
    back.classList.add('snap', 'enter');
    void back.offsetWidth;
    back.classList.remove('snap', 'enter');
    layout();
    setTimeout(() => { busy = false; }, 420);
  };
  const open = () => {
    const key = cards[ui.deck].dataset.key;
    ui.acct = key === 'total' ? '' : key;
    ui.q = '';
    ui.ttype = '';
    ui.txLimit = 50;
    ui.tab = 'transactions';
    render();
    window.scrollTo(0, 0);
  };
  let moved = false;
  deck.addEventListener('click', (e) => {
    const b = e.target.closest('[data-deck]');
    if (!b) {
      if (!moved && e.target.closest('.dcard[data-rel="0"]')) open();
      return;
    }
    const v = b.dataset.deck;
    if (v === 'next') next();
    else if (v === 'prev') prev();
    else { ui.deck = Number(v); layout(); }
  });
  deck.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { prev(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { next(); e.preventDefault(); }
    if (e.key === 'Enter' && e.target === deck) { open(); e.preventDefault(); }
  });
  // swipe / drag the front card
  const stage = deck.querySelector('.deck-stage');
  let sx = null;
  let dx = 0;
  stage.addEventListener('pointerdown', (e) => {
    if (n < 2 || busy) return;
    sx = e.clientX; dx = 0; moved = false;
  });
  stage.addEventListener('pointermove', (e) => {
    if (sx === null) return;
    dx = e.clientX - sx;
    if (Math.abs(dx) > 6 && !moved) { moved = true; stage.setPointerCapture(e.pointerId); }
    const front = cards[ui.deck];
    front.style.transition = 'none';
    front.style.transform = `translateX(${dx}px) rotate(${dx / 28}deg)`;
  });
  const end = () => {
    if (sx === null) return;
    const front = cards[ui.deck];
    sx = null;
    front.style.transition = '';
    front.style.transform = '';
    if (dx < -60) next();
    else if (dx > 60) prev();
    dx = 0;
    setTimeout(() => { moved = false; }, 0);
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
}

function viewHome() {
  const s = summarize(state, ui.month);
  const w = accountSummaries(state);
  const classic = balanceStyle() === 'classic';
  return `${topbarHTML(s)}<div class="syncline hint" aria-live="polite">${esc(syncText())}</div>
    <div class="dash">
      <div class="d-hero">${classic ? heroNavHTML(w, s) : deckHTML(w, s)}</div>
      <section class="card chart-card d-stats"><h2>Statistics <span class="muted" style="font-weight:400">· This week</span></h2><div class="ch" id="ch-week"></div></section>
      <section class="card d-ring"><h2>Spending by category <span class="muted" style="font-weight:400">· ${esc(monthLabel(ui.month))}</span></h2><div id="donut" class="donut-wrap"></div></section>
      <section class="card chart-card d-month"><h2>Monthly overview</h2><div class="ch" id="ch-six"></div></section>
      <div class="d-rest">
        ${accountListMode() === 'show' ? `${classicAccountsHTML(w, s)}<div style="height:20px"></div>` : ''}
        <div class="h2row mrow"><h2>This month</h2>${monthSwitcher()}</div>
        <div class="cards">
          <div class="card stat"><div class="label">Income</div><div class="value income">${esc(money(s.income))}</div></div>
          <div class="card stat"><div class="label">Expenses</div><div class="value expense">${esc(money(s.expense))}</div></div>
          <div class="card stat"><div class="label">Net</div><div class="value ${s.net < 0 ? 'expense' : ''}">${esc(money(s.net))}</div></div>
        </div>
        <div class="h2row" style="margin-top:20px"><h2>Recent activity</h2><button class="link" data-action="tab" data-tab="transactions">View all</button></div>
        ${latestHTML()}
      </div>
    </div>`;
}

function drawHome() {
  if (ui.tab !== 'home') return;
  hideTip();
  const tipEl = $('#tip');
  const today = todayStr();
  const mount = (id, make) => {
    const el = $(id);
    if (!el || !el.clientWidth) return;
    const { html, tips } = make(el.clientWidth);
    el.innerHTML = html;
    attachTips(el, tips, tipEl);
  };
  const week = rangeSeries(state, addDays(today, -6), today, 'day');
  mount('#ch-week', (width) =>
    lineChart({
      width, height: 200, name: 'Spending', fmtMoney: money, ariaLabel: 'Spending per day this week', variant: graphStyle() === 'classic' ? 'wave' : graphStyle(),
      months: week.map((r) => ({ label: fmtDay(r.key, { weekday: 'short' }), title: fmtDay(r.key, { weekday: 'long', day: 'numeric', month: 'short' }), value: r.expense })),
    }),
  );
  const six = rangeSeries(state, `${shiftMonth(monthKey(today), -5)}-01`, today, 'month');
  mount('#ch-six', (width) =>
    columnChart({
      width, height: 200, fmtMoney: money, ariaLabel: 'Income and expenses, last 6 months', variant: graphStyle(),
      series: [{ name: 'Income', cls: 's1' }, { name: 'Expenses', cls: 's2' }],
      months: six.map((r) => ({ label: new Date(Number(r.key.slice(0, 4)), Number(r.key.slice(5, 7)) - 1, 1).toLocaleDateString(undefined, { month: 'short' }), title: monthLabel(r.key), values: [r.income, r.expense] })),
    }),
  );
  const s = summarize(state, ui.month);
  const spendRows = s.byCategory.filter((r) => r.spent > 0).sort((x, y) => y.spent - x.spent);
  let top = spendRows.slice(0, 5);
  if (spendRows.length > 5) top = [...top, { id: 'other', other: true, spent: spendRows.slice(5).reduce((t, r) => t + r.spent, 0) }];
  const rows = top.map((r) => ({ name: r.other ? '➕ More categories' : catLabel(r.id), value: r.spent, share: s.expense ? r.spent / s.expense : 0, color: r.other || r.id === FEE_CAT ? '' : categoryColor(catById(r.id)), other: !!r.other }));
  const dn = $('#donut');
  const sig = JSON.stringify([ui.month, rows.map((r) => [r.name, r.value])]);
  if (dn) {
    const ch = donutChart({ rows, centerTop: 'Spent', centerText: moneyTile(s.expense), ariaLabel: `Spending by category, ${monthLabel(ui.month)}`, fmtMoney: money, animate: sig !== ui.donutSig });
    ui.donutSig = sig;
    dn.innerHTML = `${ch.html}${rows.length ? `<ul class="dn-leg">${rows.map((r) => `<li><i style="background:${r.color ? esc(r.color) : r.other ? 'var(--muted)' : 'var(--s1)'}"></i><span class="dn-n">${esc(r.name)}</span><span class="dn-p">${Math.round(r.share * 100)}%</span></li>`).join('')}</ul>` : '<p class="hint dn-empty">No spending this month yet.</p>'}`;
    attachTips(dn, ch.tips, tipEl);
  }
}

function viewProfile() {
  const signedIn = cloudEnabled && !!getSession();
  return `<h1>Profile</h1><div class="profile-view">
    <section class="card prof-card" style="display:block">
      <span class="ring-avatar">${avatarHTML('xl')}</span>
      <div class="prof-name">${esc(profName())}</div><div class="prof-sub">${esc(userHandle())}</div>
      ${profileStats()}
      <div class="btns">
        <button class="btn primary" data-action="edit-profile">Edit profile</button>
        ${signedIn ? '<button class="btn" data-action="sync">Sync now</button><button class="btn" data-action="change-password">Change password</button>' : ''}
        ${signedIn ? '<button class="btn danger" data-action="signout">Sign Out</button>' : ''}
      </div>
      <div class="syncline hint" aria-live="polite" style="margin-top:10px">${esc(syncText())}</div>
    </section></div>`;
}

function openBellDialog() {
  const list = budgetAlerts(summarize(state, monthKey(todayStr())));
  openDialog(`<form><h3>Notifications</h3>
    ${list.length ? `<ul class="alert-list">${list.map((a) => `<li class="${a.over ? 'over' : 'near'}"><strong>${esc(a.name)}</strong><br>${a.over ? 'Over budget' : 'Close to budget'}: ${esc(a.text)}</li>`).join('')}</ul>` : '<p class="hint">You are within every budget this month. Nothing needs your attention.</p>'}
    <div class="error" role="alert"></div>
    <div class="actions"><span class="spacer"></span><button type="button" class="btn primary" data-close>Close</button></div></form>`, { onSubmit() {} });
}

function openProfileDialog() {
  openDialog(
    `<form><h3>Edit profile</h3>
      <div class="field"><span class="lbl">Photo</span>
        <div class="avatar-row"><span class="ring-avatar" id="av-prev"></span>
          <button type="button" class="btn" id="av-pick">Upload photo</button>
          <button type="button" class="btn" id="av-clear" hidden>Remove</button></div>
        <input type="file" id="av-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
        <div class="cropper" id="cropper" hidden></div>
        <input type="hidden" name="avatar" value="${esc(state.settings.avatar || '')}">
        <span class="hint">Pick a picture, then drag and zoom to choose the part you want to show.</span></div>
      <div class="field"><label for="p-name">Display name</label>
        <input type="text" id="p-name" name="name" maxlength="40" autocomplete="off" value="${esc(state.settings.name || '')}" placeholder="${esc(profName())}"></div>
      <div class="error" role="alert"></div>
      <div class="actions"><span class="spacer"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>
    </form>`,
    {
      onOpen(form) {
        const av = form.querySelector('input[name="avatar"]');
        const prev = form.querySelector('#av-prev');
        const clear = form.querySelector('#av-clear');
        const nameEl = form.querySelector('#p-name');
        const show = () => {
          const letter = (nameEl.value.trim()[0] || profName()[0] || '?').toUpperCase();
          prev.innerHTML = `<span class="avatar xl">${av.value ? `<img src="${esc(av.value)}" alt="">` : esc(letter)}</span>`;
          clear.hidden = !av.value;
        };
        nameEl.addEventListener('input', show);
        show();
        const fileEl = form.querySelector('#av-file');
        form.querySelector('#av-pick').addEventListener('click', () => fileEl.click());
        clear.addEventListener('click', () => { av.value = ''; show(); });
        fileEl.addEventListener('change', async () => {
          const f = fileEl.files[0];
          fileEl.value = '';
          if (!f) return;
          const err = form.querySelector('.error');
          try {
            err.textContent = '';
            const out = await cropLogo(f, form.querySelector('#cropper'));
            if (out) av.value = out;
          } catch {
            err.textContent = 'That file could not be read as a picture. Try a PNG or JPEG.';
          }
          show();
        });
        document.activeElement?.blur?.();
      },
      onSubmit(fd) {
        const name = (fd.get('name') || '').trim().slice(0, 40);
        const avatar = validLogo(fd.get('avatar') || '');
        setState({ ...state, settings: { ...state.settings, name, avatar, updatedAt: Date.now() } });
        toast('Profile saved');
      },
    },
  );
}

function viewWallets() {
  const w = accountSummaries(state);
  return `<h1>Accounts</h1>${heroHTML(w)}
    <div class="btns" style="margin:14px 0"><button class="btn primary" data-action="add-wallet">New account</button></div>
    <div class="accts wide">${w.accounts.map(walletCard).join('')}</div>
    <p class="hint">An account's balance is its starting balance, plus everything recorded in it as income, minus everything recorded as an expense. Choose the account whenever you add a transaction. A transfer moves money between two accounts (its fee, if any, comes out of the account you choose).</p>`;
}

// ---------- debts: money I owe and money owed to me ----------

const debtPct = (d) => Math.min(100, Math.floor((debtPaid(d) / d.total) * 100));
const debtDue = (d) => {
  if (!d.due || debtSettled(d)) return '';
  const over = d.due < todayStr();
  return `<span class="debt-due ${over ? 'over' : ''}">${over ? 'Overdue \u00b7 ' : 'Due '}${esc(fmtDay(d.due, { day: 'numeric', month: 'short', year: 'numeric' }))}</span>`;
};

function debtCard(d) {
  const owe = d.kind === 'owe';
  const done = debtSettled(d);
  const pct = debtPct(d);
  const pays = (d.payments || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const accName = (id) => live(state.accounts).find((a) => a.id === id)?.name || '';
  return `<article class="card debt ${done ? 'done' : ''}" aria-label="${esc(d.person)}">
    <div class="debt-top">
      <span class="debt-av" aria-hidden="true">${esc((d.person[0] || '?').toUpperCase())}</span>
      <div class="debt-who"><b>${esc(d.person)}</b>${d.note ? `<small>${esc(d.note)}</small>` : ''}${debtDue(d)}</div>
      <div class="debt-left ${done ? '' : owe ? 'expense' : 'income'}">${done ? '<span class="debt-paid">Paid in full</span>' : `${esc(money(debtRemaining(d)))}<small>${owe ? 'left to pay' : 'left to collect'}</small>`}</div>
    </div>
    <div class="bar debt-bar" style="--c:${owe ? 'var(--expense)' : 'var(--income)'}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(d.person)}: ${pct}% ${owe ? 'paid' : 'received'}"><span style="width:${pct}%"></span></div>
    <div class="debt-nums"><span>${owe ? 'Paid' : 'Received'} ${esc(money(debtPaid(d)))} of ${esc(money(d.total))}</span><span>${pct}%</span></div>
    ${d.inNetWorth ? '' : '<div class="hint debt-nw">Not counted in net worth</div>'}
    <div class="btns debt-btns">
      ${done ? '' : `<button class="btn primary" data-action="pay-debt" data-id="${esc(d.id)}">${owe ? 'Add payment' : 'Add repayment'}</button><button class="btn" data-action="pay-debt" data-id="${esc(d.id)}" data-full="1">${owe ? 'Pay in full' : 'Received in full'}</button>`}
      <button class="btn" data-action="edit-debt" data-id="${esc(d.id)}">Edit</button>
    </div>
    ${pays.length ? `<details class="debt-hist"><summary>${pays.length} payment${pays.length === 1 ? '' : 's'}</summary><ul>${pays
      .map((p) => `<li><span>${esc(fmtDay(p.date, { day: 'numeric', month: 'short', year: 'numeric' }))}${p.accountId && accName(p.accountId) ? ` \u00b7 ${esc(accName(p.accountId))}` : ''}${p.note ? ` \u00b7 ${esc(p.note)}` : ''}</span><b>${esc(money(p.amount))}</b><button class="mini-x" data-action="del-payment" data-id="${esc(d.id)}" data-pid="${esc(p.id)}" aria-label="Delete this payment">\u00d7</button></li>`)
      .join('')}</ul></details>` : ''}
  </article>`;
}

function viewDebts() {
  const all = live(state.debts || []).sort((a, b) => Number(debtSettled(a)) - Number(debtSettled(b)) || (a.due || '9999').localeCompare(b.due || '9999') || a.person.localeCompare(b.person));
  const t = debtTotals(state);
  const tile = (label, value, sub, cls) => `<div class="card tile"><div class="label">${label}</div><div class="value ${cls}">${esc(value)}</div><div class="sub">${esc(sub)}</div></div>`;
  const section = (kind, title, empty) => {
    const list = all.filter((d) => d.kind === kind);
    return `<h2 class="sect">${title}</h2>${list.length ? `<div class="debts">${list.map(debtCard).join('')}</div>` : `<div class="card empty">${empty}</div>`}`;
  };
  return `<h1>Debts</h1>
    <div class="tiles two">
      ${tile('You owe', money(t.owe), `${t.oweCount} open debt${t.oweCount === 1 ? '' : 's'}`, t.owe ? 'expense' : '')}
      ${tile('Owed to you', money(t.owed), `${t.owedCount} open debt${t.owedCount === 1 ? '' : 's'}`, t.owed ? 'income' : '')}
    </div>
    <div class="btns" style="margin:14px 0">
      <button class="btn primary" data-action="add-debt" data-kind="owe">I owe someone</button>
      <button class="btn" data-action="add-debt" data-kind="owed">Someone owes me</button>
    </div>
    ${section('owe', 'Money I owe', 'You do not owe anyone. Tap "I owe someone" to track a debt.')}
    ${section('owed', 'Money owed to me', 'Nobody owes you. Tap "Someone owes me" to track money you lent.')}
    <p class="hint">Each debt has a progress bar. Add part of the amount whenever you pay or get paid, or pay it in full. Pick an account on a payment and that account's balance moves too. In each debt's settings you choose whether it counts towards your net worth.</p>`;
}

function openDebtDialog(id, kind0 = 'owe') {
  const ex = id ? live(state.debts || []).find((d) => d.id === id) : null;
  const d = ex || { id: uid(), kind: kind0, person: '', total: 0, date: todayStr(), due: '', note: '', inNetWorth: true, payments: [] };
  const paid = debtPaid(d);
  openDialog(
    `<form>
      <h3>${ex ? 'Edit debt' : 'New debt'}</h3>
      <div class="field"><div class="seg" role="radiogroup" aria-label="Kind">
        <label><input type="radio" name="kind" value="owe" ${d.kind === 'owe' ? 'checked' : ''}>I owe</label>
        <label><input type="radio" name="kind" value="owed" ${d.kind === 'owed' ? 'checked' : ''}>Owed to me</label></div></div>
      <div class="field"><label for="d-person">Who (person or company)</label>
        <input type="text" id="d-person" name="person" maxlength="60" autocomplete="off" value="${esc(d.person)}"></div>
      <div class="field"><label for="d-total">Total amount</label>
        <input type="text" id="d-total" name="total" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${ex ? esc(fromMinor(d.total)) : ''}">
        ${paid ? `<span class="hint">Already ${esc(money(paid))} paid. The total cannot go below that.</span>` : ''}</div>
      <div class="field"><label for="d-date">Date</label><input type="date" id="d-date" name="date" value="${esc(d.date)}"></div>
      <div class="field"><label for="d-due">Due date (optional)</label><input type="date" id="d-due" name="due" value="${esc(d.due)}"></div>
      <div class="field"><label for="d-note">Note (optional)</label><input type="text" id="d-note" name="note" maxlength="200" autocomplete="off" value="${esc(d.note)}"></div>
      <label class="check"><input type="checkbox" name="nw" ${d.inNetWorth ? 'checked' : ''}><span>Count this debt towards my net worth<small>When on, money owed to you adds to net worth and money you owe subtracts from it.</small></span></label>
      <div class="error" role="alert"></div>
      <div class="actions">
        ${ex ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>Cancel</button>
        <button class="btn primary">Save</button>
      </div>
    </form>`,
    {
      confirmText: `Delete the debt with "${d.person}" and its payment history? Money already moved in accounts by its payments will move back.`,
      onSubmit(fd) {
        const person = (fd.get('person') || '').trim();
        if (!person) return 'Enter who this debt is with.';
        const total = toMinor(fd.get('total') || '');
        if (!Number.isFinite(total) || total <= 0) return 'Enter the total amount, like 1500 or 249.50.';
        if (total < paid) return `The total cannot be less than the ${money(paid)} already paid.`;
        const date = fd.get('date');
        if (!isValidDate(date)) return 'Pick a valid date.';
        const due = fd.get('due') || '';
        if (due && !isValidDate(due)) return 'Pick a valid due date.';
        setState({ ...state, debts: upsert(state.debts || [], { ...d, kind: fd.get('kind') === 'owed' ? 'owed' : 'owe', person, total, date, due, note: (fd.get('note') || '').trim(), inNetWorth: fd.get('nw') === 'on' }) });
        toast('Debt saved');
      },
      onDelete() {
        setState({ ...state, debts: remove(state.debts || [], d.id) });
        toast('Debt deleted');
      },
    },
  );
}

function openPaymentDialog(id, full) {
  const d = live(state.debts || []).find((x) => x.id === id);
  if (!d) return;
  const left = debtRemaining(d);
  const owe = d.kind === 'owe';
  openDialog(
    `<form>
      <h3>${owe ? 'Pay' : 'Receive from'} ${esc(d.person)}</h3>
      <p class="hint" style="margin-top:0">${esc(money(left))} ${owe ? 'left to pay' : 'left to collect'} of ${esc(money(d.total))}.</p>
      <div class="field"><label for="p-amt">${owe ? 'Amount you are paying' : 'Amount you received'}</label>
        <input type="text" id="p-amt" name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${full ? esc(fromMinor(left)) : ''}">
        <div class="btns" style="margin-top:8px"><button type="button" class="btn" id="p-full">${owe ? 'Pay the full' : 'Receive the full'} ${esc(money(left))}</button></div></div>
      <div class="field"><label for="p-date">Date</label><input type="date" id="p-date" name="date" value="${esc(todayStr())}"></div>
      <div class="field"><label for="p-acc">Account</label>
        <select id="p-acc" name="account"><option value="">Do not change any account</option>${walletOptions('')}</select>
        <span class="hint">${owe ? 'Choose where the money comes from and that account goes down.' : 'Choose where the money was paid into and that account goes up.'} This is not counted as income or spending.</span></div>
      <div class="field"><label for="p-note">Note (optional)</label><input type="text" id="p-note" name="note" maxlength="120" autocomplete="off"></div>
      <div class="error" role="alert"></div>
      <div class="actions"><span class="spacer"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save payment</button></div>
    </form>`,
    {
      onOpen(form) {
        form.querySelector('#p-full').addEventListener('click', () => { form.querySelector('#p-amt').value = fromMinor(left); });
        if (!full) form.querySelector('#p-amt').focus();
      },
      onSubmit(fd) {
        const amount = toMinor(fd.get('amount') || '');
        if (!Number.isFinite(amount) || amount <= 0) return 'Enter an amount, like 200 or 49.50.';
        if (amount > left) return `That is more than the ${money(left)} still ${owe ? 'to pay' : 'to collect'}.`;
        const date = fd.get('date');
        if (!isValidDate(date)) return 'Pick a valid date.';
        const payment = { id: uid(), date, amount, accountId: fd.get('account') || '', note: (fd.get('note') || '').trim() };
        setState({ ...state, debts: upsert(state.debts || [], { ...d, payments: [...(d.payments || []), payment] }) });
        toast(amount === left ? 'Paid in full' : 'Payment saved');
      },
    },
  );
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
      <div class="filters" role="group" aria-label="Type">${typeBtn('', 'All')}${typeBtn('expense', 'Expenses')}${typeBtn('income', 'Income')}${typeBtn('transfer', 'Transfers')}</div>
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
            <span class="t"><i class="cdot" style="background:${categoryColor(c)}"></i>${esc(categoryEmoji(c))} ${esc(c.name)}</span>
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
      <button class="btn" data-action="tab" data-tab="profile">Profile</button>
      <button class="btn" data-action="tab" data-tab="themes">Themes</button>
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
    cats: top.map((c) => ({ ...c, color: c.other ? '' : categoryColor(catById(c.id)), name: c.other ? `📦 ${c.name}` : catLabel(c.id), share: expense ? c.total / expense : 0 })),
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

function netWorthData(d) {
  if (d.bad || !liveAccounts(state).length) return null;
  const { start, values } = netWorthSeries(state, d.per.from, d.per.to, d.unit);
  const w = accountSummaries(state);
  const assets = w.accounts.reduce((t, a) => t + Math.max(0, a.balance), 0);
  const owed = w.accounts.reduce((t, a) => t + Math.max(0, -a.balance), 0);
  const dt = debtTotals(state);
  return { start, values, now: w.total + dt.netWorth, counted: dt.counted, change: (values.length ? values[values.length - 1] : start) - start, assets, owed, accounts: w.accounts.slice().sort((a, b) => b.balance - a.balance) };
}

function netWorthHTML(d) {
  const nw = netWorthData(d);
  if (!nw) return '';
  const g = graphStyle();
  const tile = (label, value, sub, cls = '') =>
    `<div class="card tile"><div class="label">${label}</div><div class="value ${cls}">${esc(value)}</div><div class="sub">${esc(sub)}</div></div>`;
  const sign = nw.change > 0 ? '+' : nw.change < 0 ? '−' : '';
  const colHead = d.unit === 'day' ? 'Day' : 'Month';
  const list = nw.accounts
    .map((a) => {
      const share = nw.assets > 0 ? Math.round((Math.max(0, a.balance) / nw.assets) * 100) : 0;
      return `<li class="nw-row"><span class="nw-ico">${acctIcon(a)}</span>
        <span class="nw-main"><span class="nw-name">${esc(a.name)}</span>
          <span class="bar ${a.balance < 0 ? 'over' : ''}" role="img" aria-label="${esc(a.name)} ${share}% of assets"><span style="width:${share}%"></span></span></span>
        <span class="nw-val ${a.balance < 0 ? 'expense' : ''}">${esc(money(a.balance))}<small>${a.balance < 0 ? 'Below zero' : `${share}%`}</small></span></li>`;
    })
    .join('');
  return `<h2 class="sect" style="margin-top:18px">Net worth</h2>
    <div class="tiles two">
      ${tile('Net worth', moneyTile(nw.now), `Across ${nw.accounts.length} account${nw.accounts.length === 1 ? '' : 's'}${nw.counted ? ` and ${nw.counted} debt${nw.counted === 1 ? '' : 's'}` : ''}`, nw.now < 0 ? 'expense' : '')}
      ${tile('Change', `${sign}${moneyTile(Math.abs(nw.change))}`, d.per.name, nw.change < 0 ? 'expense' : nw.change > 0 ? 'income' : '')}
    </div>
    ${d.rows.length > 1 ? `<section class="card chart-card gs-${g}">
      <h2>Net worth over time</h2>
      <p class="hint" style="margin:-4px 0 6px">The total of all your accounts, plus money owed to you and minus money you owe (for debts set to count), at the end of each ${d.unit}.</p>
      <div class="chart" id="ch-networth"></div>
      ${tableView([colHead, 'Net worth'], d.rows.map((r, i) => [d.labels[i].title, money(nw.values[i])]))}
    </section>` : ''}
    <section class="card">
      <h2>By account</h2>
      <ul class="nw-list">${list}</ul>
    </section>`;
}

function viewInsights() {
  const d = insightsData();
  const filter = insightsFilter() + netWorthHTML(d);
  if (!d.hasData) {
    return `<h1>Insights</h1>${filter}${d.bad ? '' : `<div class="card empty">No income or expenses for ${esc(d.per.name.toLowerCase())} yet. Add a few transactions and your charts will appear here.</div>`}`;
  }
  const pct = d.rate === null ? '–' : `${Math.round(d.rate * 100)}%`;
  const tile = (label, value, sub, cls = '') =>
    `<div class="card tile"><div class="label">${label}</div><div class="value ${cls}">${esc(value)}</div><div class="sub">${esc(sub)}</div></div>`;
  const g = graphStyle();
  const ringTile = g !== 'classic' && d.rate !== null
    ? `<div class="card tile ringtile gs-${g}"><div><div class="label">Savings rate</div><div class="sub">Share of income kept</div></div>${ringGauge({ value: d.rate, text: pct, size: 66, variant: g })}</div>`
    : tile('Savings rate', pct, d.rate === null ? 'No income yet' : 'Share of income kept');
  const avg = d.units > 1 ? `About ${money(Math.round(d.expense / d.units))} a ${d.unit}` : d.per.name;
  const colHead = d.unit === 'day' ? 'Day' : 'Month';
  const balHint = d.unit === 'day' ? 'at the end of each day' : 'at the end of each month';
  return `<h1>Insights</h1>${filter}
    <h2 class="sect">Income and spending</h2>
    <div class="tiles">
      ${tile('Income', moneyTile(d.income), d.per.name, 'income')}
      ${tile('Expenses', moneyTile(d.expense), avg, 'expense')}
      ${tile('Net', moneyTile(d.net), d.net >= 0 ? 'You saved this much' : 'You spent more than you earned', d.net < 0 ? 'expense' : '')}
      ${ringTile}
    </div>
    <section class="card chart-card gs-${g}">
      <h2>Income vs expenses</h2>
      <div class="legend"><span class="lg"><i class="s1"></i>Income</span><span class="lg"><i class="s2"></i>Expenses</span></div>
      <div class="chart" id="ch-monthly"></div>
      ${tableView([colHead, 'Income', 'Expenses', 'Net'], d.rows.map((r, i) => [d.labels[i].title, money(r.income), money(r.expense), money(r.net)]))}
    </section>
    ${d.rows.length > 1 ? `<section class="card chart-card gs-${g}">
      <h2>Running balance</h2>
      <p class="hint" style="margin:-4px 0 6px">Everything you have earned minus everything you have spent, ${balHint}.</p>
      <div class="chart" id="ch-balance"></div>
      ${tableView([colHead, 'Balance'], d.rows.map((r, i) => [d.labels[i].title, money(d.balance[i])]))}
    </section>` : ''}
    <section class="card chart-card gs-${g}">
      <h2>Where the money goes</h2>
      ${d.cats.length ? '<div class="chart" id="ch-cats"></div>' : '<div class="empty">No spending in this period.</div>'}
      ${d.cats.length ? tableView(['Category', 'Spent', 'Share'], d.cats.map((c) => [c.name, money(c.total), `${Math.round(c.share * 100)}%`])) : ''}
    </section>`;
}

function drawInsights() {
  if (ui.tab !== 'insights') return;
  const d = insightsData();
  if (d.bad) return;
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
  const nw = netWorthData(d);
  if (nw) {
    mount('#ch-networth', (width) =>
      lineChart({ width, months: d.labels.map((l, i) => ({ ...l, value: nw.values[i] })), name: 'Net worth', fmtMoney: money, ariaLabel: 'Net worth over time', variant: graphStyle() }),
    );
  }
  if (!d.hasData) return;
  mount('#ch-monthly', (width) =>
    columnChart({
      width,
      months: labels.map((l, i) => ({ ...l, values: [d.rows[i].income, d.rows[i].expense] })),
      series: [{ name: 'Income', cls: 's1' }, { name: 'Expenses', cls: 's2' }],
      fmtMoney: money,
      ariaLabel: 'Income and expenses over time',
      variant: graphStyle(),
    }),
  );
  mount('#ch-balance', (width) =>
    lineChart({
      width,
      months: labels.map((l, i) => ({ ...l, value: d.balance[i] })),
      name: 'Balance',
      fmtMoney: money,
      ariaLabel: 'Running balance over time',
      variant: graphStyle(),
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

const accountListMode = () => (isAccountList(state.settings.accountList) ? state.settings.accountList : DEFAULT_ACCOUNT_LIST);
const balanceStyle = () => (isBalance(state.settings.balance) ? state.settings.balance : DEFAULT_BALANCE);
const graphStyle = () => (isGraph(state.settings.graph) ? state.settings.graph : DEFAULT_GRAPH);

function applyTheme() {
  const id = isTheme(state.settings.theme) ? state.settings.theme : DEFAULT_THEME;
  document.documentElement.dataset.theme = id;
  const tip = document.querySelector('#tip');
  if (tip) tip.className = `tip gs-${graphStyle()}`;
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
    </button>`).join('')}</div>
    <h2>Total balance card</h2>
    <p class="hint">How the balance looks at the top of Home.</p>
    <div class="graphs">${BALANCE_STYLES.map((b) => `<button class="graphopt balopt ${b.id === balanceStyle() ? 'on' : ''}" data-action="balance" data-id="${b.id}" aria-pressed="${b.id === balanceStyle()}">
      <span class="bprev bp-${b.id}" aria-hidden="true">${b.id === 'cards' ? '<i></i><i></i><i></i>' : '<i></i><u></u><u></u>'}</span>
      <span class="th-name">${esc(b.name)}${b.id === balanceStyle() ? ' <span class="th-on">✓ In use</span>' : ''}</span>
      <span class="th-blurb">${esc(b.blurb)}</span>
    </button>`).join('')}</div>
    <h2>Accounts list on Home</h2>
    <p class="hint">Show or hide a list of account cards at the bottom of Home. It works with either balance card style.</p>
    <div class="graphs">${ACCOUNT_LIST_OPTIONS.map((o) => `<button class="graphopt balopt ${o.id === accountListMode() ? 'on' : ''}" data-action="acclist" data-id="${o.id}" aria-pressed="${o.id === accountListMode()}">
      <span class="bprev bp-list-${o.id}" aria-hidden="true">${o.id === 'show' ? '<i></i><u></u><u></u><u></u>' : '<i></i>'}</span>
      <span class="th-name">${esc(o.name)}${o.id === accountListMode() ? ' <span class="th-on">✓ In use</span>' : ''}</span>
      <span class="th-blurb">${esc(o.blurb)}</span>
    </button>`).join('')}</div>
    <h2>Graph style</h2>
    <p class="hint">How the charts on the Insights tab look. Colours follow the theme you picked.</p>
    <div class="graphs">${GRAPH_STYLES.map((g) => `<button class="graphopt gs-${g.id} ${g.id === graphStyle() ? 'on' : ''}" data-action="graph" data-id="${g.id}" aria-pressed="${g.id === graphStyle()}">
      <span class="gprev" data-prev="${g.id}" aria-hidden="true"></span>
      <span class="th-name">${esc(g.name)}${g.id === graphStyle() ? ' <span class="th-on">✓ In use</span>' : ''}</span>
      <span class="th-blurb">${esc(g.blurb)}</span>
    </button>`).join('')}</div>
    <h2>Navigation style</h2>
    <p class="hint">How the menu and page changes move. Pick one, then switch between tabs to see it.</p>
    <div class="graphs">${NAV_STYLES.map((n) => `<button class="graphopt balopt ${n.id === navStyle() ? 'on' : ''}" data-action="navstyle" data-id="${n.id}" aria-pressed="${n.id === navStyle()}">
      <span class="nprev np-${n.id}" aria-hidden="true"><b></b><b></b><b></b><b></b></span>
      <span class="th-name">${esc(n.name)}${n.id === navStyle() ? ' <span class="th-on">✓ In use</span>' : ''}</span>
      <span class="th-blurb">${esc(n.blurb)}</span>
    </button>`).join('')}</div>
    <h2>Opening animation</h2>
    <p class="hint">What plays when the app opens. Choosing one plays it right now so you can see it.</p>
    <div class="graphs">${INTRO_STYLES.map((n) => `<button class="graphopt balopt ${n.id === introStyle() ? 'on' : ''}" data-action="introstyle" data-id="${n.id}" aria-pressed="${n.id === introStyle()}">
      <span class="iprev ip-${n.id}" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="th-name">${esc(n.name)}${n.id === introStyle() ? ' <span class="th-on">✓ In use</span>' : ''}</span>
      <span class="th-blurb">${esc(n.blurb)}</span>
    </button>`).join('')}</div>`;
}

// Small live samples of each graph style, drawn with the real chart code.
function drawGraphPreviews() {
  if (ui.tab !== 'themes') return;
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => ({ label: l, title: String(i) }));
  const inc = [40, 55, 30, 80, 62, 90, 70];
  const exp = [25, 35, 50, 30, 45, 40, 55];
  document.querySelectorAll('[data-prev]').forEach((el) => {
    const variant = el.dataset.prev;
    const w = el.clientWidth;
    if (!w) return;
    const col = columnChart({ width: w, height: 110, months: labels.map((l, i) => ({ ...l, values: [inc[i] * 100, exp[i] * 100] })), series: [{ name: 'Income', cls: 's1' }, { name: 'Expenses', cls: 's2' }], fmtMoney: () => '', ariaLabel: 'Sample', variant });
    const line = lineChart({ width: w, height: 90, months: labels.map((l, i) => ({ ...l, value: (inc[i] - exp[i] + 30) * 100 })), name: 'Sample', fmtMoney: () => '', ariaLabel: 'Sample', variant });
    el.innerHTML = (col.html + line.html).replace(/<rect class="hit"[^>]*\/>/g, '').replace(/<text class="endlabel"[^<]*<\/text>/g, '');
  });
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
  mountNavFx();
  const views = { home: viewHome, transactions: viewTransactions, wallets: viewWallets, debts: viewDebts, insights: viewInsights, categories: viewCategories, themes: viewThemes, settings: viewSettings, profile: viewProfile };
  $('#main').innerHTML = views[ui.tab]();
  $('#main').classList.toggle('wide', ui.tab === 'home');
  drawHome();
  mountDeck();
  if ($('.hero-nav')) { const ww = accountSummaries(state); mountHeroNav(ww, summarize(state, ui.month)); }
  drawInsights();
  drawGraphPreviews();
  pageFx();
  if (introPending) {
    introPending = false;
    playIntro(introStyle());
  }
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

const liveAccountsCount = () => liveAccounts(state).length;

// The pieces of a transfer: out (source expense), in (destination income) and fee, or a legacy single-record transfer.
function transferGroup(t) {
  if (t.type === 'transfer') {
    return { transferId: uid(), legacy: t, all: [t], from: accountIdOf(state, t), to: trTo(t), amount: t.amount, fee: t.fee || 0, feeAcc: trFeeAcc(t) };
  }
  if (!t.transferId) return null;
  const all = transferLegs(state, t.transferId);
  const byLeg = Object.fromEntries(all.map((l) => [l.leg, l]));
  const base = byLeg.out || byLeg.in || t;
  const from = accountIdOf(state, base === byLeg.in ? { ...base, accountId: '' } : base);
  const g = {
    transferId: t.transferId, all, byLeg,
    from: byLeg.out ? accountIdOf(state, byLeg.out) : from,
    to: byLeg.in ? accountIdOf(state, byLeg.in) : '',
    amount: base.amount,
    fee: byLeg.fee ? byLeg.fee.amount : 0,
  };
  g.feeAcc = byLeg.fee ? accountIdOf(state, byLeg.fee) : g.from;
  return g;
}

function openTxDialog(id) {
  const existing = id ? live(state.transactions).find((t) => t.id === id) : null;
  const lastOk = liveAccounts(state).some((a) => a.id === ui.lastAccount);
  const group = existing ? transferGroup(existing) : null;
  const tx = group
    ? { id: existing.id, type: 'transfer', amount: group.amount, categoryId: '', accountId: group.from, toAccountId: group.to, fee: group.fee, feeAccountId: group.feeAcc, date: existing.date, note: existing.note || '' }
    : existing
      ? { ...existing, accountId: accountIdOf(state, existing) }
      : { id: uid(), type: 'expense', amount: 0, categoryId: '', accountId: lastOk ? ui.lastAccount : fallbackAccountId(state), date: todayStr(), note: '' };
  openDialog(
    `<form>
      <h3>${existing ? 'Edit transaction' : 'New transaction'}</h3>
      <div class="field"><span class="lbl">Type</span>
        <div class="seg">
          <label><input type="radio" name="type" value="expense" ${tx.type === 'expense' ? 'checked' : ''}>Expense</label>
          <label><input type="radio" name="type" value="income" ${tx.type === 'income' ? 'checked' : ''}>Income</label>
          <label><input type="radio" name="type" value="transfer" ${tx.type === 'transfer' ? 'checked' : ''}>Transfer</label>
        </div>
      </div>
      <div class="field"><label for="f-amt">Amount</label>
        <input type="text" id="f-amt" name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${existing ? esc(fromMinor(tx.amount)) : ''}"></div>
      <div class="field"><label for="f-acc" id="f-acc-l">${tx.type === 'transfer' ? 'From account' : 'Account'}</label>
        <select id="f-acc" name="accountId">${walletOptions(tx.accountId)}</select></div>
      <div class="field tr-only" ${tx.type === 'transfer' ? '' : 'hidden'}><label for="f-to">To account</label>
        <select id="f-to" name="toAccountId">${walletOptions(tx.toAccountId || (liveAccounts(state).find((a) => a.id !== tx.accountId) || {}).id)}</select></div>
      <div class="field tr-only" ${tx.type === 'transfer' ? '' : 'hidden'}><label for="f-fee">Transfer fee (optional)</label>
        <input type="text" id="f-fee" name="fee" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${tx.fee ? esc(fromMinor(tx.fee)) : ''}"></div>
      <div class="field tr-only" ${tx.type === 'transfer' ? '' : 'hidden'}><label for="f-feeacc">Fee is taken from</label>
        <select id="f-feeacc" name="feeAccountId">${walletOptions(tx.feeAccountId || tx.accountId)}</select>
        <span class="hint">The fee is an expense charged to this account. The transferred amount itself is not counted as income or spending.</span></div>
      <div class="field cat-only" ${tx.type === 'transfer' ? 'hidden' : ''}><label for="f-cat">Category</label>
        <select id="f-cat" name="categoryId">${categoryOptions(tx.type === 'transfer' ? 'expense' : tx.type, tx.categoryId)}</select></div>
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
          if (e.target.name === 'type') {
            const tr = e.target.value === 'transfer';
            if (!tr) form.querySelector('#f-cat').innerHTML = categoryOptions(e.target.value, '');
            form.querySelectorAll('.tr-only').forEach((el) => (el.hidden = !tr));
            form.querySelectorAll('.cat-only').forEach((el) => (el.hidden = tr));
            form.querySelector('#f-acc-l').textContent = tr ? 'From account' : 'Account';
          }
          if (e.target.id === 'f-acc' && form.querySelector('input[name=type]:checked').value === 'transfer') {
            const feeSel = form.querySelector('#f-feeacc');
            if (!feeSel.dataset.touched) feeSel.value = e.target.value;
            const to = form.querySelector('#f-to');
            if (to.value === e.target.value) to.value = (liveAccounts(state).find((a) => a.id !== e.target.value) || {}).id || to.value;
          }
          if (e.target.id === 'f-feeacc') e.target.dataset.touched = '1';
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
        const type = fd.get('type');
        const note = (fd.get('note') || '').trim();
        let txs = state.transactions;
        if (type === 'transfer') {
          const toAccountId = fd.get('toAccountId');
          if (liveAccountsCount() < 2) return 'You need at least two accounts to make a transfer. Add another account first.';
          if (!liveAccounts(state).some((a) => a.id === toAccountId)) return 'Pick the account to send to.';
          if (toAccountId === accountId) return 'Choose two different accounts.';
          const feeRaw = (fd.get('fee') || '').trim();
          const fee = feeRaw ? toMinor(feeRaw) : 0;
          if (!Number.isFinite(fee) || fee < 0) return 'Enter the fee like 5 or 2.50, or leave it empty.';
          const feeAccountId = fd.get('feeAccountId');
          if (fee > 0 && !liveAccounts(state).some((a) => a.id === feeAccountId)) return 'Pick the account the fee is taken from.';
          // Saved as an expense in the source account, an income in the destination account and (if any) a fee expense.
          const tid = group ? group.transferId : uid();
          if (existing && !group) txs = remove(txs, existing.id);
          if (group?.legacy) txs = remove(txs, group.legacy.id);
          const leg = (kind, ty, amt, acc) => ({ id: group?.byLeg?.[kind]?.id || uid(), type: ty, amount: amt, categoryId: '', accountId: acc, date, note, transferId: tid, leg: kind });
          txs = upsert(txs, leg('out', 'expense', amount, accountId));
          txs = upsert(txs, leg('in', 'income', amount, toAccountId));
          if (fee > 0) txs = upsert(txs, leg('fee', 'expense', fee, feeAccountId));
          else if (group?.byLeg?.fee) txs = remove(txs, group.byLeg.fee.id);
        } else {
          if (group) for (const l of group.all) txs = remove(txs, l.id);
          txs = upsert(txs, { id: group ? uid() : tx.id, type, amount, categoryId: fd.get('categoryId') || '', accountId, date, note });
        }
        ui.lastAccount = accountId;
        ui.month = monthKey(date);
        setState({ ...state, transactions: txs });
      },
      onDelete() {
        let txs = state.transactions;
        for (const l of group ? group.all : [tx]) txs = remove(txs, l.id);
        setState({ ...state, transactions: txs });
        toast('Transaction deleted');
      },
    },
  );
}

// Crop editor for logos: drag to move, slider / wheel / pinch to zoom. The image always covers the square,
// so the saved logo never has empty space. Resolves to a small data URL, or null if cancelled.
function cropLogo(file, host) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.onload = () => {
      const V = 240;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) { URL.revokeObjectURL(url); return reject(new Error('empty')); }
      host.hidden = false;
      host.innerHTML = `<canvas width="${V}" height="${V}" aria-label="Logo preview. Drag to move the picture."></canvas>
        <div class="zoom"><button type="button" class="btn" data-z="-1" aria-label="Zoom out">−</button>
          <input type="range" min="1" max="5" step="0.01" value="1" aria-label="Zoom"><button type="button" class="btn" data-z="1" aria-label="Zoom in">+</button></div>
        <span class="hint">Drag to choose the part you want, zoom with the slider or mouse wheel.</span>
        <div class="btns"><button type="button" class="btn" data-x="cancel">Cancel</button><button type="button" class="btn primary" data-x="ok">Use this picture</button></div>`;
      const cv = host.querySelector('canvas');
      const ctx = cv.getContext('2d');
      const range = host.querySelector('input[type=range]');
      const base = V / Math.min(w, h); // scale at which the image just covers the square
      let zoom = 1;
      let cx = w / 2;
      let cy = h / 2;
      const clamp = () => {
        const half = V / (2 * base * zoom);
        cx = Math.min(w - half, Math.max(half, cx));
        cy = Math.min(h - half, Math.max(half, cy));
      };
      const draw = () => {
        clamp();
        const side = V / (base * zoom);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, V, V);
        ctx.drawImage(img, cx - side / 2, cy - side / 2, side, side, 0, 0, V, V);
      };
      const setZoom = (z) => { zoom = Math.min(5, Math.max(1, z)); range.value = zoom; draw(); };
      draw();
      range.addEventListener('input', () => setZoom(Number(range.value)));
      host.querySelectorAll('[data-z]').forEach((b2) => b2.addEventListener('click', () => setZoom(zoom + Number(b2.dataset.z) * 0.4)));
      cv.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
      const pts = new Map();
      let pinch = 0;
      cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
      cv.addEventListener('pointermove', (e) => {
        const prev = pts.get(e.pointerId);
        if (!prev) return;
        const now = [e.clientX, e.clientY];
        pts.set(e.pointerId, now);
        if (pts.size === 2) {
          const [p1, p2] = [...pts.values()];
          const d = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
          if (pinch) setZoom(zoom * (d / pinch));
          pinch = d;
        } else if (pts.size === 1) {
          const k = cv.getBoundingClientRect().width / V; // CSS pixels per canvas pixel
          cx -= (now[0] - prev[0]) / (k * base * zoom);
          cy -= (now[1] - prev[1]) / (k * base * zoom);
          draw();
        }
      });
      const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
      const finish = (value) => { URL.revokeObjectURL(url); host.hidden = true; host.innerHTML = ''; resolve(value); };
      host.querySelector('[data-x="cancel"]').addEventListener('click', () => finish(null));
      host.querySelector('[data-x="ok"]').addEventListener('click', () => {
        const side = V / (base * zoom);
        let out = '';
        for (const [size, type, q] of [[128, 'image/png'], [128, 'image/jpeg', 0.85], [96, 'image/jpeg', 0.8], [64, 'image/jpeg', 0.7]]) {
          const c = document.createElement('canvas');
          c.width = c.height = size;
          const x = c.getContext('2d');
          x.fillStyle = '#fff';
          x.fillRect(0, 0, size, size);
          x.drawImage(img, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
          out = validLogo(c.toDataURL(type, q));
          if (out) break;
        }
        finish(out || null);
      });
    };
    img.src = url;
  });
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
        <div class="cropper" id="cropper" hidden></div>
        <input type="hidden" name="logo" value="${esc(acc.logo || '')}">
        <span class="hint">Optional. Pick a picture, then drag and zoom to choose the part you want to show.</span></div>
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
            err.textContent = '';
            const out = await cropLogo(f, form.querySelector('#cropper'));
            if (out) logoEl.value = out;
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
  const cat = existing || { id: uid(), name: '', type: 'expense', budget: 0, emoji: '', color: '' };
  const startColor = existing ? categoryColor(existing) : nextColor(state.categories);
  const picked = existing ? categoryEmoji(existing) : '';
  openDialog(
    `<form>
      <h3>${existing ? 'Edit category' : 'New category'}</h3>
      <div class="field"><label for="c-name">Name</label>
        <input type="text" id="c-name" name="name" maxlength="60" autocomplete="off" value="${esc(cat.name)}"></div>
      <div class="field color-field"><span class="lbl">Colour in graphs</span>
        <div class="color-row" role="group" aria-label="Pick a colour">${PALETTE.map((c) => `<button type="button" class="sw" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
          <label class="sw own" title="Pick any colour"><input type="color" id="c-own" value="${startColor}" aria-label="Pick any colour"><span>+</span></label></div>
        <input type="hidden" name="color" value="${esc(startColor)}">
        <span class="hint">This category's bar in the charts uses this colour.</span></div>
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
        const colHid = form.querySelector('input[name="color"]');
        const colOwn = form.querySelector('#c-own');
        const markColor = () => form.querySelectorAll('.sw[data-c]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === colHid.value)));
        markColor();
        form.querySelector('.color-row').addEventListener('click', (e) => {
          const b = e.target.closest('.sw[data-c]');
          if (!b) return;
          colHid.value = b.dataset.c;
          colOwn.value = b.dataset.c;
          markColor();
        });
        colOwn.addEventListener('input', () => { colHid.value = colOwn.value; markColor(); });
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
        setState({ ...state, categories: upsert(state.categories, { id: cat.id, name, type, budget, emoji: validEmoji(fd.get('emoji') || ''), color: validColor(fd.get('color') || '') }) });
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
  if (action === 'pmenu') {
    if (document.getElementById('pmenu')) closePMenu(); else openPMenu(el);
    return;
  }
  if (el.closest('#pmenu')) closePMenu();
  switch (action) {
    case 'open-acct': {
      const key = el.dataset.key;
      ui.acct = key === 'total' ? '' : key;
      ui.q = '';
      ui.ttype = '';
      ui.txLimit = 50;
      ui.tab = 'transactions';
      render();
      window.scrollTo(0, 0);
      break;
    }
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
    case 'acclist':
      if (isAccountList(id) && id !== state.settings.accountList) {
        setState({ ...state, settings: { ...state.settings, accountList: id, updatedAt: Date.now() } });
        toast(id === 'show' ? 'Accounts list shown on Home' : 'Accounts list hidden');
      }
      break;
    case 'balance':
      if (isBalance(id) && id !== state.settings.balance) {
        setState({ ...state, settings: { ...state.settings, balance: id, updatedAt: Date.now() } });
        toast(`${BALANCE_STYLES.find((b) => b.id === id).name} balance on`);
      }
      break;
    case 'navstyle':
      if (isNavStyle(id) && id !== state.settings.nav) {
        setState({ ...state, settings: { ...state.settings, nav: id, updatedAt: Date.now() } });
        toast(`${NAV_STYLES.find((n) => n.id === id).name} navigation on. Switch tabs to see it.`);
      }
      break;
    case 'introstyle':
      if (isIntroStyle(id)) {
        if (id !== state.settings.intro) setState({ ...state, settings: { ...state.settings, intro: id, updatedAt: Date.now() } });
        playIntro(id);
        toast(id === 'off' ? 'No opening animation' : `${INTRO_STYLES.find((n) => n.id === id).name} opening saved`);
      }
      break;
    case 'graph':
      if (isGraph(id) && id !== state.settings.graph) {
        setState({ ...state, settings: { ...state.settings, graph: id, updatedAt: Date.now() } });
        toast(`${GRAPH_STYLES.find((g) => g.id === id).name} graphs on`);
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
    case 'bell':
      openBellDialog();
      break;
    case 'edit-profile':
      openProfileDialog();
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
    case 'add-debt':
      openDebtDialog('', el.dataset.kind === 'owed' ? 'owed' : 'owe');
      break;
    case 'edit-debt':
      openDebtDialog(id);
      break;
    case 'pay-debt':
      openPaymentDialog(id, !!el.dataset.full);
      break;
    case 'del-payment': {
      const d = live(state.debts || []).find((x) => x.id === id);
      if (d && confirm('Delete this payment? Any account it changed will change back.')) {
        setState({ ...state, debts: upsert(state.debts, { ...d, payments: d.payments.filter((p) => p.id !== el.dataset.pid) }) });
        toast('Payment deleted');
      }
      break;
    }
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
  resizeFrame = requestAnimationFrame(() => { drawInsights(); drawHome(); });
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

document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target?.matches?.('.dcard[data-flat], .hn-body')) {
    e.preventDefault();
    e.target.click();
    return;
  }
  if (e.key === 'Enter' && e.target?.id === 'topsearch') {
    ui.q = e.target.value.trim();
    ui.tab = 'transactions';
    render();
    window.scrollTo(0, 0);
  }
});

// ---------- start ----------

initNavFx();
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
  setInterval(() => document.visibilityState === 'visible' && runSync(), 20_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') runSync(); });
  window.addEventListener('pagehide', () => runSync());
}
if ('serviceWorker' in navigator) {
  // Reload once when a new version takes over, so old and new files are never mixed.
  let hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
    hadController = true;
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

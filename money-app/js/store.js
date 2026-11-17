// Pure data logic for the money app: no DOM, no storage, so it can be unit-tested
// in Node and reused later by a sync backend.
//
// Data rules (these make cloud sync safe later):
//  - every record has a UUID `id` and an `updatedAt` timestamp (ms)
//  - deletes are soft (`deleted: true`) so they can sync to other devices
//  - money is stored as integer minor units (cents/piasters), never floats

export const SCHEMA_VERSION = 1;

// ---------- ids, time, dates ----------

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // fallback: RFC 4122 v4-shaped id (the database column type is uuid)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const now = () => Date.now();

export function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const monthKey = (dateStr) => String(dateStr).slice(0, 7);

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// ---------- money ----------

export function normalizeDigits(input) {
  return String(input)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // Arabic-Indic
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // Persian
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
}

// "1,234.5" -> 123450. Commas are treated as thousands separators. Returns NaN if invalid.
export function toMinor(input) {
  const s = normalizeDigits(input).replace(/[\s,]/g, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return NaN;
  const whole = parseInt(m[1], 10);
  const frac = parseInt((m[2] || '').padEnd(2, '0'), 10);
  const total = whole * 100 + frac;
  return Number.isSafeInteger(total) ? total : NaN;
}

// Like toMinor, but allows a leading minus (a wallet can start in debt): "-50" -> -5000.
export function toMinorSigned(input) {
  const s = normalizeDigits(input).trim().replace(/^[\u2212\u2013]/, '-');
  if (!s.startsWith('-')) return toMinor(s);
  const v = toMinor(s.slice(1));
  return Number.isNaN(v) ? NaN : v === 0 ? 0 : -v;
}

// 123450 -> "1234.50" (for editing fields / CSV)
export function fromMinor(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// Always two decimals, whatever the currency, because amounts are stored in hundredths.
export function formatMoney(minor, currency = 'EGP', locale) {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${currency} ${fromMinor(minor)}`;
  }
}

// ---------- state ----------

// Default categories use FIXED ids and updatedAt 0, so every device creates the same
// records. Syncing never duplicates them, and any real edit or delete (updatedAt > 0) wins.
const DEFAULT_CATEGORIES = [
  ['ff9bb12e-5104-4218-916e-0345c70262e9', 'Food', 'expense'],
  ['60436924-d91d-49e2-8b3b-2a3b99f552ae', 'Transport', 'expense'],
  ['52d00da5-182a-4ea5-9f4a-f0e8f7c51741', 'Bills', 'expense'],
  ['b3ae29d7-ac1d-4bdb-9f3e-d826e98851ed', 'Shopping', 'expense'],
  ['5338196f-beed-4ba0-999f-8cf8bb4085fb', 'Health', 'expense'],
  ['3c4ab7f5-6a41-449d-b48b-8e129364eb1d', 'Entertainment', 'expense'],
  ['8aed19f5-9703-4543-91f3-ddb415f10e11', 'Other', 'expense'],
  ['0e43b028-f87b-40b2-837b-9b3f96ab8b72', 'Salary', 'income'],
  ['b4a14e6c-d9b9-45b1-93be-5e5d717f7360', 'Other income', 'income'],
];

// The default wallet has a FIXED id and updatedAt 0, like the default categories, so every device
// creates the same record and syncing never duplicates it. Older transactions without a wallet count toward it.
export const DEFAULT_ACCOUNT_ID = 'c0a7f3e2-5b1d-4f6a-9c84-2d3e7a1b6f90';

export function createState() {
  return {
    version: SCHEMA_VERSION,
    settings: { currency: 'EGP', updatedAt: 0 },
    accounts: [{ id: DEFAULT_ACCOUNT_ID, name: 'Cash', opening: 0, updatedAt: 0 }],
    categories: DEFAULT_CATEGORIES.map(([id, name, type]) => ({ id, name, type, budget: 0, updatedAt: 0 })),
    transactions: [],
  };
}

export const live = (list) => list.filter((x) => !x.deleted);

export function upsert(list, rec) {
  const next = { ...rec, updatedAt: now() };
  const i = list.findIndex((x) => x.id === rec.id);
  if (i < 0) return [...list, next];
  const copy = list.slice();
  copy[i] = { ...list[i], ...next };
  return copy;
}

export function remove(list, id) {
  const t = now();
  return list.map((x) => (x.id === id ? { ...x, deleted: true, updatedAt: t } : x));
}

// ---------- merging (last write wins per record) ----------

export function mergeCollections(local, remote) {
  const map = new Map();
  for (const r of local) map.set(r.id, r);
  for (const r of remote) {
    const cur = map.get(r.id);
    if (!cur || (r.updatedAt ?? 0) > (cur.updatedAt ?? 0)) map.set(r.id, r);
  }
  return [...map.values()];
}

export function mergeState(local, remote) {
  const ls = local.settings;
  const rs = remote.settings;
  const settings = rs && (rs.updatedAt ?? 0) > (ls.updatedAt ?? 0) ? { ...ls, ...rs } : ls;
  return {
    ...local,
    settings,
    categories: mergeCollections(local.categories, remote.categories),
    accounts: mergeCollections(local.accounts || [], remote.accounts || []),
    transactions: mergeCollections(local.transactions, remote.transactions),
  };
}

// Validate/clean an untrusted object (e.g. an imported JSON backup).
export function sanitizeState(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Not a valid backup file');
  const cats = Array.isArray(obj.categories) ? obj.categories : [];
  const txs = Array.isArray(obj.transactions) ? obj.transactions : [];
  const accs = Array.isArray(obj.accounts) ? obj.accounts : [];
  const categories = cats
    .filter(
      (c) =>
        c &&
        typeof c.id === 'string' &&
        UUID_RE.test(c.id) &&
        typeof c.name === 'string' &&
        c.name.trim().length > 0 &&
        (c.type === 'expense' || c.type === 'income'),
    )
    .map((c) => ({
      id: c.id,
      name: c.name.slice(0, 60),
      type: c.type,
      budget: Number.isSafeInteger(c.budget) && c.budget > 0 ? c.budget : 0,
      updatedAt: Number.isFinite(c.updatedAt) ? c.updatedAt : 0,
      ...(c.deleted ? { deleted: true } : {}),
    }));
  const transactions = txs
    .filter(
      (t) =>
        t &&
        typeof t.id === 'string' &&
        UUID_RE.test(t.id) &&
        (t.type === 'expense' || t.type === 'income') &&
        Number.isSafeInteger(t.amount) &&
        t.amount > 0 &&
        isValidDate(t.date),
    )
    .map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      categoryId: typeof t.categoryId === 'string' ? t.categoryId : '',
      accountId: typeof t.accountId === 'string' && UUID_RE.test(t.accountId) ? t.accountId : '',
      date: t.date,
      note: typeof t.note === 'string' ? t.note.slice(0, 200) : '',
      updatedAt: Number.isFinite(t.updatedAt) ? t.updatedAt : 0,
      ...(t.deleted ? { deleted: true } : {}),
    }));
  const accounts = accs
    .filter((a) => a && typeof a.id === 'string' && UUID_RE.test(a.id) && typeof a.name === 'string' && a.name.trim().length > 0)
    .map((a) => ({
      id: a.id,
      name: a.name.trim().slice(0, 60),
      opening: Number.isSafeInteger(a.opening) ? a.opening : 0,
      updatedAt: Number.isFinite(a.updatedAt) ? a.updatedAt : 0,
      ...(a.deleted ? { deleted: true } : {}),
    }));
  const cur = typeof obj.settings?.currency === 'string' ? obj.settings.currency.toUpperCase() : '';
  const currency = /^[A-Z]{3}$/.test(cur) ? cur : 'EGP';
  const updatedAt = Number.isFinite(obj.settings?.updatedAt) ? obj.settings.updatedAt : 0;
  return { version: SCHEMA_VERSION, settings: { currency, updatedAt }, categories, accounts, transactions };
}

// ---------- summaries ----------

export function summarize(state, month) {
  const cats = new Map(state.categories.map((c) => [c.id, c]));
  const txs = live(state.transactions).filter((t) => monthKey(t.date) === month);
  let income = 0;
  let expense = 0;
  const spent = new Map();
  for (const t of txs) {
    if (t.type === 'income') income += t.amount;
    else {
      expense += t.amount;
      spent.set(t.categoryId, (spent.get(t.categoryId) || 0) + t.amount);
    }
  }
  const rows = new Map();
  for (const [id, amount] of spent) {
    const c = cats.get(id);
    rows.set(id, { id, name: c ? c.name : 'Uncategorized', spent: amount, budget: c && !c.deleted ? c.budget || 0 : 0 });
  }
  for (const c of live(state.categories)) {
    if (c.type === 'expense' && c.budget > 0 && !rows.has(c.id)) {
      rows.set(c.id, { id: c.id, name: c.name, spent: 0, budget: c.budget });
    }
  }
  const byCategory = [...rows.values()].sort((a, b) => b.spent - a.spent);
  return { income, expense, net: income - expense, count: txs.length, byCategory };
}

// ---------- wallets (accounts) ----------

export function liveAccounts(state) {
  return live(state.accounts || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

// Where a transaction with no (or a deleted) wallet is counted: the default wallet, else the first one.
export function fallbackAccountId(state) {
  const accs = liveAccounts(state);
  return accs.find((a) => a.id === DEFAULT_ACCOUNT_ID)?.id || accs[0]?.id || '';
}

export function accountIdOf(state, t) {
  const a = (state.accounts || []).find((x) => x.id === t.accountId && !x.deleted);
  return a ? a.id : fallbackAccountId(state);
}

// Balance of a wallet = starting balance + all its income - all its expenses (all time).
export function accountSummaries(state) {
  const accs = liveAccounts(state);
  const rows = new Map(accs.map((a) => [a.id, { id: a.id, name: a.name, opening: a.opening || 0, income: 0, expense: 0, count: 0, balance: 0 }]));
  for (const t of live(state.transactions)) {
    const r = rows.get(accountIdOf(state, t));
    if (!r) continue;
    r.count++;
    if (t.type === 'income') r.income += t.amount;
    else r.expense += t.amount;
  }
  const accounts = [...rows.values()];
  for (const r of accounts) r.balance = r.opening + r.income - r.expense;
  return { accounts, total: accounts.reduce((sum, r) => sum + r.balance, 0) };
}

// Deleting a wallet also deletes the transactions counted in it, so totals stay truthful.
export function removeAccount(state, id) {
  const t = now();
  const doomed = new Set(live(state.transactions).filter((x) => accountIdOf(state, x) === id).map((x) => x.id));
  return {
    ...state,
    accounts: remove(state.accounts, id),
    transactions: state.transactions.map((x) => (doomed.has(x.id) ? { ...x, deleted: true, updatedAt: t } : x)),
  };
}

// ---------- analytics ----------

// ['2026-06', ..., '2026-11'] : `count` months ending at endKey, oldest first.
export function monthsEnding(endKey, count) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) out.push(shiftMonth(endKey, -i));
  return out;
}

export function monthlySeries(state, months) {
  const idx = new Map(months.map((m, i) => [m, i]));
  const rows = months.map((month) => ({ month, income: 0, expense: 0, net: 0 }));
  for (const t of live(state.transactions)) {
    const i = idx.get(monthKey(t.date));
    if (i === undefined) continue;
    if (t.type === 'income') rows[i].income += t.amount;
    else rows[i].expense += t.amount;
  }
  for (const r of rows) r.net = r.income - r.expense;
  return rows;
}

// Net of everything dated before `firstMonth` (the starting point of a running balance).
export function balanceBefore(state, firstMonth) {
  let sum = 0;
  for (const t of live(state.transactions)) {
    if (monthKey(t.date) < firstMonth) sum += t.type === 'income' ? t.amount : -t.amount;
  }
  return sum;
}

export function categoryTotals(state, months, type = 'expense') {
  const inRange = new Set(months);
  const names = new Map(state.categories.map((c) => [c.id, c.name]));
  const totals = new Map();
  for (const t of live(state.transactions)) {
    if (t.type !== type || !inRange.has(monthKey(t.date))) continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) || 0) + t.amount);
  }
  return [...totals]
    .map(([id, total]) => ({ id, name: names.get(id) || 'Uncategorized', total }))
    .sort((a, b) => b.total - a.total);
}

// ---------- CSV ----------

const csvEscape = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(state) {
  const cats = new Map(state.categories.map((c) => [c.id, c.name]));
  const accs = new Map((state.accounts || []).map((a) => [a.id, a.name]));
  const rows = live(state.transactions)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) =>
      [t.date, t.type, cats.get(t.categoryId) || '', fromMinor(t.amount), t.note, accs.get(accountIdOf(state, t)) || '']
        .map(csvEscape)
        .join(','),
    );
  return ['date,type,category,amount,note,account', ...rows].join('\n') + '\n';
}

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

// Returns { state, added, skipped }. Rows already present (same date/type/category/amount/note/wallet) are skipped.
// An optional "account" column puts each row in a wallet (created if it does not exist yet).
export function importCSV(state, text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('The CSV file has no data rows');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const iDate = col('date');
  const iType = col('type');
  const iAmt = col('amount');
  if (iDate < 0 || iType < 0 || iAmt < 0) throw new Error('CSV needs the columns: date, type, amount (optional: category, note, account)');
  const iCat = col('category');
  const iNote = col('note');
  const iAcc = col('account');

  let categories = state.categories.slice();
  let accounts = (state.accounts || []).slice();
  const catByKey = new Map(live(categories).map((c) => [`${c.type}:${c.name.toLowerCase()}`, c]));
  const accByName = new Map(live(accounts).map((a) => [a.name.toLowerCase(), a]));
  const accNameOf = (id) => (accounts.find((a) => a.id === id)?.name || '').toLowerCase();
  const defaultAcc = fallbackAccountId(state);
  const seen = new Set(
    live(state.transactions).map((t) => {
      const c = categories.find((x) => x.id === t.categoryId);
      return [t.date, t.type, (c?.name || '').toLowerCase(), t.amount, t.note, accNameOf(accountIdOf(state, t))].join('|');
    }),
  );
  const added = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const date = (r[iDate] || '').trim();
    const type = (r[iType] || '').trim().toLowerCase();
    const amount = toMinor(r[iAmt] || '');
    const catName = iCat >= 0 ? (r[iCat] || '').trim() : '';
    const note = iNote >= 0 ? (r[iNote] || '').trim() : '';
    const accName = iAcc >= 0 ? (r[iAcc] || '').trim() : '';
    if (!isValidDate(date) || (type !== 'income' && type !== 'expense') || !Number.isFinite(amount) || amount <= 0) {
      skipped++;
      continue;
    }
    let accountId = defaultAcc;
    if (accName) {
      let a = accByName.get(accName.toLowerCase());
      if (!a) {
        a = { id: uid(), name: accName.slice(0, 60), opening: 0, updatedAt: now() };
        accounts = [...accounts, a];
        accByName.set(accName.toLowerCase(), a);
      }
      accountId = a.id;
    }
    const key = [date, type, catName.toLowerCase(), amount, note, accNameOf(accountId)].join('|');
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    let categoryId = '';
    if (catName) {
      const ck = `${type}:${catName.toLowerCase()}`;
      let c = catByKey.get(ck);
      if (!c) {
        c = { id: uid(), name: catName.slice(0, 60), type, budget: 0, updatedAt: now() };
        categories = [...categories, c];
        catByKey.set(ck, c);
      }
      categoryId = c.id;
    }
    added.push({ id: uid(), type, amount, categoryId, accountId, date, note: note.slice(0, 200), updatedAt: now() });
  }
  return { state: { ...state, categories, accounts, transactions: [...state.transactions, ...added] }, added: added.length, skipped };
}

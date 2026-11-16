// Pure data logic for the money app: no DOM, no storage, so it can be unit-tested
// in Node and reused later by a sync backend.
//
// Data rules (these make cloud sync safe later):
//  - every record has a UUID `id` and an `updatedAt` timestamp (ms)
//  - deletes are soft (`deleted: true`) so they can sync to other devices
//  - money is stored as integer minor units (cents/piasters), never floats

export const SCHEMA_VERSION = 1;

// ---------- ids, time, dates ----------

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
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

// 123450 -> "1234.50" (for editing fields / CSV)
export function fromMinor(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function formatMoney(minor, currency = 'EGP', locale) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${currency} ${fromMinor(minor)}`;
  }
}

// ---------- state ----------

const DEFAULT_EXPENSE = ['Food', 'Transport', 'Bills', 'Shopping', 'Health', 'Entertainment', 'Other'];
const DEFAULT_INCOME = ['Salary', 'Other income'];

export function createState() {
  const t = now();
  const mk = (name, type) => ({ id: uid(), name, type, budget: 0, updatedAt: t });
  return {
    version: SCHEMA_VERSION,
    settings: { currency: 'EGP' },
    categories: [
      ...DEFAULT_EXPENSE.map((n) => mk(n, 'expense')),
      ...DEFAULT_INCOME.map((n) => mk(n, 'income')),
    ],
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
  return {
    ...local,
    categories: mergeCollections(local.categories, remote.categories),
    transactions: mergeCollections(local.transactions, remote.transactions),
  };
}

// Validate/clean an untrusted object (e.g. an imported JSON backup).
export function sanitizeState(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Not a valid backup file');
  const cats = Array.isArray(obj.categories) ? obj.categories : [];
  const txs = Array.isArray(obj.transactions) ? obj.transactions : [];
  const categories = cats
    .filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string' && (c.type === 'expense' || c.type === 'income'))
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
      date: t.date,
      note: typeof t.note === 'string' ? t.note.slice(0, 200) : '',
      updatedAt: Number.isFinite(t.updatedAt) ? t.updatedAt : 0,
      ...(t.deleted ? { deleted: true } : {}),
    }));
  const currency = typeof obj.settings?.currency === 'string' ? obj.settings.currency.toUpperCase().slice(0, 3) : 'EGP';
  return { version: SCHEMA_VERSION, settings: { currency }, categories, transactions };
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

// ---------- CSV ----------

const csvEscape = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(state) {
  const cats = new Map(state.categories.map((c) => [c.id, c.name]));
  const rows = live(state.transactions)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [t.date, t.type, cats.get(t.categoryId) || '', fromMinor(t.amount), t.note].map(csvEscape).join(','));
  return ['date,type,category,amount,note', ...rows].join('\n') + '\n';
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

// Returns { state, added, skipped }. Rows already present (same date/type/category/amount/note) are skipped.
export function importCSV(state, text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('The CSV file has no data rows');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const iDate = col('date');
  const iType = col('type');
  const iAmt = col('amount');
  if (iDate < 0 || iType < 0 || iAmt < 0) throw new Error('CSV needs the columns: date, type, amount (optional: category, note)');
  const iCat = col('category');
  const iNote = col('note');

  let categories = state.categories.slice();
  const catByKey = new Map(live(categories).map((c) => [`${c.type}:${c.name.toLowerCase()}`, c]));
  const seen = new Set(
    live(state.transactions).map((t) => {
      const c = categories.find((x) => x.id === t.categoryId);
      return [t.date, t.type, (c?.name || '').toLowerCase(), t.amount, t.note].join('|');
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
    if (!isValidDate(date) || (type !== 'income' && type !== 'expense') || !Number.isFinite(amount) || amount <= 0) {
      skipped++;
      continue;
    }
    const key = [date, type, catName.toLowerCase(), amount, note].join('|');
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
    added.push({ id: uid(), type, amount, categoryId, date, note: note.slice(0, 200), updatedAt: now() });
  }
  return { state: { ...state, categories, transactions: [...state.transactions, ...added] }, added: added.length, skipped };
}

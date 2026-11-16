import test from 'node:test';
const C1 = '11111111-1111-4111-8111-111111111111';
const T1 = '22222222-2222-4222-8222-222222222222';
import assert from 'node:assert/strict';
import {
  toMinor, fromMinor, createState, upsert, remove, mergeCollections, mergeState, summarize, toCSV, parseCSV, importCSV,
  sanitizeState, shiftMonth, isValidDate, live,
} from '../js/store.js';

test('toMinor parses amounts into integer minor units', () => {
  assert.equal(toMinor('12'), 1200);
  assert.equal(toMinor('12.5'), 1250);
  assert.equal(toMinor('1,234.56'), 123456);
  assert.equal(toMinor('0.07'), 7);
  assert.equal(toMinor('٣٠٫٥'), 3050); // Arabic-Indic digits and decimal mark
  assert.ok(Number.isNaN(toMinor('abc')));
  assert.ok(Number.isNaN(toMinor('1.234')));
  assert.ok(Number.isNaN(toMinor('-5')));
  assert.ok(Number.isNaN(toMinor('')));
});

test('fromMinor round-trips', () => {
  for (const v of ['0.00', '0.05', '12.50', '1234.56']) assert.equal(fromMinor(toMinor(v)), v);
});

test('dates and months', () => {
  assert.ok(isValidDate('2026-02-28'));
  assert.ok(!isValidDate('2026-02-30'));
  assert.ok(!isValidDate('26-1-1'));
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('merge: last write wins per record, deletes propagate', () => {
  const a = [{ id: '1', v: 'old', updatedAt: 1 }, { id: '2', v: 'local-only', updatedAt: 5 }];
  const b = [{ id: '1', v: 'new', updatedAt: 2 }, { id: '3', v: 'remote-only', updatedAt: 1 }];
  const m = mergeCollections(a, b);
  assert.equal(m.find((x) => x.id === '1').v, 'new');
  assert.equal(m.length, 3);
  const del = mergeCollections([{ id: '1', updatedAt: 1 }], [{ id: '1', deleted: true, updatedAt: 9 }]);
  assert.equal(del[0].deleted, true);
  // older remote must not overwrite newer local
  const keep = mergeCollections([{ id: '1', v: 'mine', updatedAt: 10 }], [{ id: '1', v: 'stale', updatedAt: 3 }]);
  assert.equal(keep[0].v, 'mine');
});

function sampleState() {
  const s = createState();
  const food = s.categories.find((c) => c.name === 'Food');
  const salary = s.categories.find((c) => c.name === 'Salary');
  food.budget = 50000;
  let tx = [];
  tx = upsert(tx, { id: 't1', type: 'income', amount: 1000000, categoryId: salary.id, date: '2026-11-01', note: '' });
  tx = upsert(tx, { id: 't2', type: 'expense', amount: 30000, categoryId: food.id, date: '2026-11-03', note: 'Groceries, "bulk"' });
  tx = upsert(tx, { id: 't3', type: 'expense', amount: 25000, categoryId: food.id, date: '2026-11-10', note: '' });
  tx = upsert(tx, { id: 't4', type: 'expense', amount: 9900, categoryId: food.id, date: '2026-10-30', note: 'other month' });
  return { ...s, transactions: tx };
}

test('summarize totals one month and flags budgets', () => {
  const s = sampleState();
  const sum = summarize(s, '2026-11');
  assert.equal(sum.income, 1000000);
  assert.equal(sum.expense, 55000);
  assert.equal(sum.net, 945000);
  const food = sum.byCategory.find((r) => r.name === 'Food');
  assert.equal(food.spent, 55000);
  assert.equal(food.budget, 50000);
});

test('soft delete hides a transaction from summaries', () => {
  const s = sampleState();
  const s2 = { ...s, transactions: remove(s.transactions, 't2') };
  assert.equal(summarize(s2, '2026-11').expense, 25000);
  assert.equal(live(s2.transactions).length, 3);
});

test('CSV export then import into a fresh state restores data and skips duplicates', () => {
  const s = sampleState();
  const csv = toCSV(s);
  assert.deepEqual(parseCSV(csv)[0], ['date', 'type', 'category', 'amount', 'note']);
  const fresh = createState();
  const r = importCSV(fresh, csv);
  assert.equal(r.added, 4);
  assert.equal(summarize(r.state, '2026-11').expense, 55000);
  assert.ok(r.state.transactions.some((t) => t.note === 'Groceries, "bulk"'));
  const again = importCSV(r.state, csv);
  assert.equal(again.added, 0);
  assert.equal(again.skipped, 4);
});

test('importCSV rejects bad files and skips bad rows', () => {
  assert.throws(() => importCSV(createState(), 'a,b\n1,2'), /columns/);
  const r = importCSV(createState(), 'date,type,amount\n2026-11-01,expense,5\nnot-a-date,expense,5\n2026-11-02,expense,-3\n');
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 2);
});

test('sanitizeState drops malformed records and keeps valid ones', () => {
  const clean = sanitizeState({
    settings: { currency: 'usd' },
    categories: [
      { id: C1, name: 'Food', type: 'expense', budget: 100, updatedAt: 1 },
      { id: 5 },
      { id: 'not-a-uuid', name: 'Bad id', type: 'expense' },
      { id: '11111111-1111-4111-8111-111111111112', name: '  ', type: 'expense' },
    ],
    transactions: [
      { id: T1, type: 'expense', amount: 500, date: '2026-11-01', categoryId: C1, note: 'x', updatedAt: 1 },
      { id: '22222222-2222-4222-8222-222222222223', type: 'expense', amount: 1.5, date: '2026-11-01' },
      { id: '22222222-2222-4222-8222-222222222224', type: 'weird', amount: 5, date: '2026-11-01' },
      { id: 'tx-1', type: 'expense', amount: 5, date: '2026-11-01' },
    ],
  });
  assert.equal(clean.categories.length, 1);
  assert.equal(clean.transactions.length, 1);
  assert.equal(clean.settings.currency, 'USD');
  assert.throws(() => sanitizeState(null));
});

test('mergeState combines two devices', () => {
  const base = createState();
  const a = { ...base, transactions: upsert([], { id: 'x', type: 'expense', amount: 100, categoryId: '', date: '2026-11-01', note: 'A' }) };
  const b = { ...base, transactions: upsert([], { id: 'y', type: 'expense', amount: 200, categoryId: '', date: '2026-11-02', note: 'B' }) };
  assert.equal(mergeState(a, b).transactions.length, 2);
});

test('default categories are identical on every device and never duplicate when merged', () => {
  const a = createState();
  const b = createState();
  assert.deepEqual(a.categories, b.categories);
  assert.equal(mergeState(a, b).categories.length, 9);
});

test('a real edit or delete of a default category beats the untouched default on another device', () => {
  const a = createState();
  const b = createState();
  b.categories = remove(b.categories, b.categories[0].id); // device B deleted "Food"
  const merged = mergeState(a, b); // device A still has the untouched default
  assert.equal(live(merged.categories).length, 8);
  const renamed = createState();
  renamed.categories = upsert(renamed.categories, { ...renamed.categories[1], name: 'Taxi' });
  assert.equal(mergeState(a, renamed).categories[1].name, 'Taxi');
});

test('settings merge: newest change wins, missing remote settings keep local', () => {
  const local = { ...createState(), settings: { currency: 'EGP', updatedAt: 5 } };
  assert.equal(mergeState(local, { categories: [], transactions: [], settings: { currency: 'USD', updatedAt: 9 } }).settings.currency, 'USD');
  assert.equal(mergeState(local, { categories: [], transactions: [], settings: { currency: 'USD', updatedAt: 2 } }).settings.currency, 'EGP');
  assert.equal(mergeState(local, { categories: [], transactions: [] }).settings.currency, 'EGP');
});

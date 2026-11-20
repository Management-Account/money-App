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
  assert.deepEqual(parseCSV(csv)[0], ['date', 'type', 'category', 'amount', 'note', 'account', 'to_account', 'fee', 'fee_account', 'transfer_id', 'leg']);
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

import { monthsEnding, monthlySeries, balanceBefore, categoryTotals, formatMoney } from '../js/store.js';
import { getCurrencies, CURRENCY_CODES } from '../js/currencies.js';
import { niceTicks, axisFormatter } from '../js/charts.js';

function analyticsState() {
  const s = createState();
  const food = s.categories.find((c) => c.name === 'Food').id;
  const bills = s.categories.find((c) => c.name === 'Bills').id;
  const salary = s.categories.find((c) => c.name === 'Salary').id;
  let tx = [];
  const add = (id, type, amount, categoryId, date) => (tx = upsert(tx, { id, type, amount, categoryId, date, note: '' }));
  add('a1', 'income', 100000, salary, '2026-09-01');
  add('a2', 'expense', 30000, food, '2026-09-10');
  add('a3', 'income', 100000, salary, '2026-10-01');
  add('a4', 'expense', 50000, bills, '2026-10-05');
  add('a5', 'expense', 20000, food, '2026-10-20');
  add('a6', 'expense', 10000, food, '2026-11-02');
  add('a7', 'expense', 99999, food, '2026-07-02'); // before the range
  return { ...s, transactions: tx };
}

test('monthsEnding lists months oldest first across a year boundary', () => {
  assert.deepEqual(monthsEnding('2026-02', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('monthlySeries totals per month and ignores months outside the range', () => {
  const rows = monthlySeries(analyticsState(), monthsEnding('2026-11', 3));
  assert.deepEqual(rows.map((r) => [r.month, r.income, r.expense, r.net]), [
    ['2026-09', 100000, 30000, 70000],
    ['2026-10', 100000, 70000, 30000],
    ['2026-11', 0, 10000, -10000],
  ]);
});

test('running balance starts from everything before the range', () => {
  const s = analyticsState();
  assert.equal(balanceBefore(s, '2026-09'), -99999);
  assert.equal(balanceBefore(s, '2026-10'), -99999 + 70000);
});

test('categoryTotals ranks expense categories and skips deleted transactions', () => {
  const s = analyticsState();
  const months = monthsEnding('2026-11', 3);
  const totals = categoryTotals(s, months, 'expense');
  assert.deepEqual(totals.map((t) => [t.name, t.total]), [['Food', 60000], ['Bills', 50000]]);
  const s2 = { ...s, transactions: remove(s.transactions, 'a4') };
  assert.equal(categoryTotals(s2, months, 'expense').find((t) => t.name === 'Bills'), undefined);
});

test('currency list covers the world and every code is valid for Intl', () => {
  assert.ok(CURRENCY_CODES.length >= 150);
  assert.equal(new Set(CURRENCY_CODES).size, CURRENCY_CODES.length);
  for (const code of ['USD', 'EUR', 'EGP', 'SAR', 'AED', 'KWD', 'JPY', 'GBP', 'INR', 'CNY', 'TRY', 'ZAR', 'BRL', 'RUB']) assert.ok(CURRENCY_CODES.includes(code), code);
  for (const code of CURRENCY_CODES) {
    assert.doesNotThrow(() => new Intl.NumberFormat('en', { style: 'currency', currency: code }), code);
  }
  assert.equal(getCurrencies('en').find((c) => c.code === 'EGP').name, 'Egyptian Pound');
});

test('formatMoney always shows two decimals, even for zero-decimal currencies', () => {
  assert.equal(formatMoney(1250, 'USD', 'en'), '$12.50');
  assert.match(formatMoney(1250, 'JPY', 'en'), /12\.50/);
  assert.match(formatMoney(123456, 'EGP', 'en'), /1,234\.56/);
});

test('niceTicks gives round numbers that cover the data', () => {
  const t = niceTicks(0, 17.2, 4);
  assert.deepEqual(t.ticks, [0, 5, 10, 15, 20]);
  const n = niceTicks(-3200, 45180, 4);
  assert.ok(n.lo <= -3200 && n.hi >= 45180 && n.ticks.includes(0));
  assert.deepEqual(niceTicks(0, 0, 4).ticks.length > 1, true);
});

test('axisFormatter: full numbers under 10,000, compact above', () => {
  assert.equal(axisFormatter(5000)(2500), '2,500');
  assert.equal(axisFormatter(20000)(15000), '15K');
});

import { DEFAULT_ACCOUNT_ID, toMinorSigned, accountSummaries, accountIdOf, removeAccount, liveAccounts } from '../js/store.js';

const W2 = '33333333-3333-4333-8333-333333333333';

function walletState() {
  let s = createState();
  s = { ...s, accounts: upsert(s.accounts, { id: W2, name: 'Bank', opening: 100000 }) };
  const salary = s.categories.find((c) => c.name === 'Salary').id;
  const food = s.categories.find((c) => c.name === 'Food').id;
  let tx = [];
  tx = upsert(tx, { id: 'w1', type: 'income', amount: 50000, categoryId: salary, accountId: W2, date: '2026-11-01', note: '' });
  tx = upsert(tx, { id: 'w2', type: 'expense', amount: 12000, categoryId: food, accountId: W2, date: '2026-11-02', note: '' });
  tx = upsert(tx, { id: 'w3', type: 'expense', amount: 3000, categoryId: food, accountId: DEFAULT_ACCOUNT_ID, date: '2026-11-03', note: '' });
  tx = upsert(tx, { id: 'w4', type: 'income', amount: 7000, categoryId: salary, date: '2026-11-04', note: 'old, no wallet' });
  return { ...s, transactions: tx };
}

test('new state has the same default wallet on every device and it never duplicates', () => {
  const a = createState();
  const b = createState();
  assert.equal(a.accounts.length, 1);
  assert.equal(a.accounts[0].id, DEFAULT_ACCOUNT_ID);
  assert.equal(mergeState(a, b).accounts.length, 1);
});

test('each wallet has its own balance and the total is their sum', () => {
  const { accounts, total } = accountSummaries(walletState());
  const bank = accounts.find((a) => a.id === W2);
  const cash = accounts.find((a) => a.id === DEFAULT_ACCOUNT_ID);
  assert.equal(bank.balance, 100000 + 50000 - 12000);
  assert.deepEqual([bank.income, bank.expense, bank.count], [50000, 12000, 2]);
  assert.equal(cash.balance, 0 - 3000 + 7000); // includes the old transaction that has no wallet
  assert.equal(cash.count, 2);
  assert.equal(total, bank.balance + cash.balance);
});

test('a transaction pointing at a deleted or unknown wallet counts toward the default wallet', () => {
  const s = walletState();
  const gone = { ...s, accounts: remove(s.accounts, W2) };
  assert.equal(accountIdOf(gone, gone.transactions.find((t) => t.id === 'w1')), DEFAULT_ACCOUNT_ID);
  assert.equal(accountIdOf(s, { accountId: 'unknown' }), DEFAULT_ACCOUNT_ID);
});

test('removeAccount deletes the wallet and its transactions only', () => {
  const s = walletState();
  const next = removeAccount(s, W2);
  assert.deepEqual(liveAccounts(next).map((a) => a.name), ['Cash']);
  assert.deepEqual(live(next.transactions).map((t) => t.id).sort(), ['w3', 'w4']);
  const { accounts, total } = accountSummaries(next);
  assert.equal(accounts.length, 1);
  assert.equal(total, 4000);
});

test('merging wallets across devices: newest edit wins, deletes propagate', () => {
  const base = createState();
  const a = { ...base, accounts: upsert(base.accounts, { id: W2, name: 'Bank', opening: 0 }) };
  const b = { ...a, accounts: upsert(a.accounts, { id: W2, name: 'Savings', opening: 5000 }) };
  b.accounts = b.accounts.map((x) => (x.id === W2 ? { ...x, updatedAt: x.updatedAt + 10 } : x));
  assert.equal(mergeState(a, b).accounts.find((x) => x.id === W2).name, 'Savings');
  const gone = { ...a, accounts: remove(a.accounts, DEFAULT_ACCOUNT_ID) };
  assert.equal(liveAccounts(mergeState(createState(), gone)).some((x) => x.id === DEFAULT_ACCOUNT_ID), false);
});

test('toMinorSigned accepts a leading minus', () => {
  assert.equal(toMinorSigned('-200'), -20000);
  assert.equal(toMinorSigned('\u2212 12.5'.replace(' ', '')), -1250);
  assert.equal(toMinorSigned('45'), 4500);
  assert.equal(toMinorSigned('-0'), 0);
  assert.ok(Number.isNaN(toMinorSigned('--5')));
  assert.ok(Number.isNaN(toMinorSigned('abc')));
});

test('sanitizeState keeps wallets and each transaction wallet, and drops bad ones', () => {
  const clean = sanitizeState({
    accounts: [{ id: W2, name: ' Bank ', opening: 500, updatedAt: 4 }, { id: 'nope', name: 'x' }, { id: W2.replace('3', '4'), name: '  ' }],
    transactions: [{ id: T1, type: 'expense', amount: 500, date: '2026-11-01', accountId: W2 }, { id: '22222222-2222-4222-8222-222222222299', type: 'expense', amount: 5, date: '2026-11-01', accountId: 'junk' }],
  });
  assert.deepEqual(clean.accounts.map((a) => [a.id, a.name, a.opening]), [[W2, 'Bank', 500]]);
  assert.deepEqual(clean.transactions.map((t) => t.accountId), [W2, '']);
  assert.deepEqual(sanitizeState({}).accounts, []);
});

test('CSV: wallets round-trip through export and import, new wallets are created, duplicates skipped', () => {
  const s = walletState();
  const csv = toCSV(s);
  assert.ok(csv.split('\n')[0].includes(',account,'));
  assert.match(csv, /,Bank,,,,,\n/);
  const r = importCSV(createState(), csv);
  assert.equal(r.added, 4);
  assert.deepEqual(liveAccounts(r.state).map((a) => a.name), ['Bank', 'Cash']);
  const sums = accountSummaries(r.state).accounts;
  assert.equal(sums.find((a) => a.name === 'Bank').count, 2);
  assert.equal(importCSV(r.state, csv).added, 0);
  const plain = importCSV(createState(), 'date,type,amount\n2026-11-01,expense,5\n');
  assert.equal(plain.state.transactions[0].accountId, DEFAULT_ACCOUNT_ID);
});

// ---- institutions ----
import { INSTITUTIONS, searchInstitutions, institutionOf, customValue, initials } from '../js/institutions.js';

test('institution catalog: unique ids, names and Arabic names present, all groups filled', () => {
  const ids = INSTITUTIONS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(INSTITUTIONS.every((i) => i.name && i.ar && i.short));
  for (const k of ['bank', 'wallet', 'card', 'other']) assert.ok(INSTITUTIONS.some((i) => i.kind === k));
  assert.ok(INSTITUTIONS.filter((i) => i.kind === 'bank').length >= 35);
});

test('institution search: English, Arabic (hamza-insensitive), abbreviations, multi-word', () => {
  assert.deepEqual(searchInstitutions('voda').map((i) => i.id), ['vfcash']);
  assert.ok(searchInstitutions('الاهلي').some((i) => i.id === 'nbe'));
  assert.ok(searchInstitutions('الأهلي').some((i) => i.id === 'nbe'));
  assert.equal(searchInstitutions('cib')[0].id, 'cib');
  assert.ok(searchInstitutions('national bank').some((i) => i.id === 'nbe'));
  assert.equal(searchInstitutions('zzzz').length, 0);
  assert.equal(searchInstitutions('').length, INSTITUTIONS.length);
});

test('institutionOf: catalog id, custom value, empty and unknown', () => {
  assert.equal(institutionOf('nbe').name, 'National Bank of Egypt');
  const c = institutionOf(customValue('  My Bank '));
  assert.equal(c.name, 'My Bank');
  assert.equal(c.custom, true);
  assert.equal(institutionOf(''), null);
  assert.equal(institutionOf('nope'), null);
  assert.equal(initials('My Bank'), 'MB');
});

test('accounts keep their institution through sanitize and summaries; old accounts get an empty one', () => {
  const s = createState();
  const acc = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'CIB Savings', opening: 100, institution: 'cib', updatedAt: 5 };
  const old = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Old', opening: 0, updatedAt: 5 };
  const clean = sanitizeState({ ...s, accounts: [...s.accounts, acc, old] });
  assert.equal(clean.accounts.find((a) => a.id === acc.id).institution, 'cib');
  assert.equal(clean.accounts.find((a) => a.id === old.id).institution, '');
  assert.equal(accountSummaries(clean).accounts.find((a) => a.id === acc.id).institution, 'cib');
});

// ---- date-range analytics ----
import { addDays, daysBetween, unitFor, bucketKeys, rangeSeries, balanceBeforeDate, categoryTotalsRange } from '../js/store.js';

test('addDays / daysBetween handle month and year edges', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-11-12', '2026-11-18'), 6);
});

test('ranges up to 62 days are daily, longer ones monthly', () => {
  assert.equal(unitFor('2026-11-19', '2026-11-19'), 'day');
  assert.equal(bucketKeys('2026-11-13', '2026-11-19').length, 7);
  assert.equal(unitFor('2026-01-01', '2026-03-03'), 'day');
  assert.equal(unitFor('2026-01-01', '2026-03-04'), 'month');
  assert.deepEqual(bucketKeys('2026-01-15', '2026-03-04', 'month'), ['2026-01', '2026-02', '2026-03']);
});

test('rangeSeries, balanceBeforeDate and categoryTotalsRange only count the chosen dates', () => {
  const s = createState();
  const cat = s.categories.find((c) => c.type === 'expense').id;
  const mk = (date, type, amount) => ({ id: crypto.randomUUID(), type, amount, categoryId: cat, accountId: s.accounts[0].id, date, note: '', updatedAt: 1 });
  s.transactions = [mk('2026-11-10', 'income', 1000), mk('2026-11-12', 'expense', 300), mk('2026-11-13', 'expense', 200), mk('2026-11-20', 'expense', 999)];
  const rows = rangeSeries(s, '2026-11-12', '2026-11-14');
  assert.deepEqual(rows.map((r) => [r.key, r.expense]), [['2026-11-12', 300], ['2026-11-13', 200], ['2026-11-14', 0]]);
  assert.equal(balanceBeforeDate(s, '2026-11-12'), 1000);
  assert.equal(categoryTotalsRange(s, '2026-11-12', '2026-11-14')[0].total, 500);
  assert.equal(rangeSeries(s, '2026-01-01', '2026-12-31', 'month').find((r) => r.key === '2026-11').expense, 1499);
});

import { validLogo } from '../js/store.js';
test('uploaded logos: only small image data URLs are kept, and they survive sanitize', () => {
  const ok = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(validLogo(ok), ok);
  assert.equal(validLogo('http://evil.example/x.png'), '');
  assert.equal(validLogo('data:text/html;base64,PHNjcmlwdD4='), '');
  assert.equal(validLogo('data:image/png;base64,' + 'A'.repeat(70000)), '');
  const s = createState();
  const acc = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'X', opening: 0, logo: ok, updatedAt: 1 };
  assert.equal(sanitizeState({ ...s, accounts: [...s.accounts, acc] }).accounts.find((a) => a.id === acc.id).logo, ok);
});

import { categoryColor, validColor, nextColor, PALETTE } from '../js/colors.js';
test('category colours: valid hex only, built-in defaults, stable fallback, next unused', () => {
  assert.equal(validColor('#AABBCC'), '#aabbcc');
  assert.equal(validColor('red'), '');
  assert.equal(validColor('#abc'), '');
  assert.equal(categoryColor({ id: 'x', color: '#112233' }), '#112233');
  const food = createState().categories.find((c) => c.name === 'Food');
  assert.match(categoryColor(food), /^#[0-9a-f]{6}$/);
  const odd = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Odd' };
  assert.equal(categoryColor(odd), categoryColor({ ...odd }));
  assert.ok(PALETTE.includes(categoryColor(odd)));
  const s = createState();
  assert.ok(PALETTE.includes(nextColor(s.categories)) || /^#/.test(nextColor(s.categories)));
  const clean = sanitizeState({ ...s, categories: [...s.categories, { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'C', type: 'expense', color: '#123456', updatedAt: 1 }, { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', name: 'D', type: 'expense', color: 'javascript:1', updatedAt: 1 }] });
  assert.equal(clean.categories.find((c) => c.name === 'C').color, '#123456');
  assert.equal(clean.categories.find((c) => c.name === 'D').color, '');
});

// ---------- transfers ----------
import { accountSummaries as _accSum, flow as _flow } from '../js/store.js';
test('transfers move money between accounts and only the fee is an expense', () => {
  const s = createState();
  const a = { id: '11111111-1111-4111-8111-111111111111', name: 'A', opening: 100000, updatedAt: 1 };
  const b = { id: '22222222-2222-4222-8222-222222222222', name: 'B', opening: 0, updatedAt: 1 };
  s.accounts = [a, b];
  const day = '2026-11-10';
  const tr = (extra) => ({ id: crypto.randomUUID(), type: 'transfer', amount: 30000, categoryId: '', accountId: a.id, toAccountId: b.id, fee: 500, feeAccountId: a.id, date: day, note: '', updatedAt: 2, ...extra });
  s.transactions = [tr({})];
  let w = _accSum(s);
  const bal = (id) => w.accounts.find((x) => x.id === id).balance;
  assert.equal(bal(a.id), 100000 - 30000 - 500);
  assert.equal(bal(b.id), 30000);
  assert.equal(w.total, 100000 - 500);
  const m = summarize(s, '2026-11');
  assert.equal(m.income, 0);
  assert.equal(m.expense, 500);
  assert.equal(m.byCategory[0].name, 'Transfer fees');
  // fee charged to the receiving account
  s.transactions = [tr({ feeAccountId: b.id })];
  w = _accSum(s);
  assert.equal(bal(a.id), 70000);
  assert.equal(bal(b.id), 30000 - 500);
  // no fee
  s.transactions = [tr({ fee: 0, feeAccountId: '' })];
  assert.equal(summarize(s, '2026-11').expense, 0);
  assert.equal(_flow(s.transactions[0]).feeOnly, true);
});

test('transfers survive sanitize, CSV round trip and account removal', () => {
  const s = createState();
  const a = { id: '11111111-1111-4111-8111-111111111111', name: 'A', opening: 0, updatedAt: 1 };
  const b = { id: '22222222-2222-4222-8222-222222222222', name: 'B', opening: 0, updatedAt: 1 };
  s.accounts = [a, b];
  s.transactions = [{ id: crypto.randomUUID(), type: 'transfer', amount: 5000, categoryId: '', accountId: a.id, toAccountId: b.id, fee: 250, feeAccountId: b.id, date: '2026-11-10', note: 'x', updatedAt: 2 }];
  const clean = sanitizeState(JSON.parse(JSON.stringify(s)));
  assert.equal(clean.transactions[0].type, 'transfer');
  assert.equal(clean.transactions[0].fee, 250);
  assert.equal(clean.transactions[0].feeAccountId, b.id);
  const csv = toCSV(s);
  const fresh = createState();
  fresh.accounts = [a, b];
  const r = importCSV(fresh, csv);
  assert.equal(r.added, 1);
  const t = r.state.transactions.find((x) => x.type === 'transfer');
  assert.equal(t.toAccountId, b.id); assert.equal(t.fee, 250); assert.equal(t.feeAccountId, b.id);
  assert.equal(importCSV(r.state, csv).added, 0);
  const gone = removeAccount(s, b.id);
  assert.ok(gone.transactions.every((x) => x.deleted));
});

test('a transfer saved as legs: expense out, income in, fee expense; only the fee is spending', () => {
  const s = createState();
  const a = { id: '11111111-1111-4111-8111-111111111111', name: 'A', opening: 100000, updatedAt: 1 };
  const b = { id: '22222222-2222-4222-8222-222222222222', name: 'B', opening: 0, updatedAt: 1 };
  s.accounts = [a, b];
  const tid = '33333333-3333-4333-8333-333333333333';
  const mk = (type, leg, amount, accountId) => ({ id: crypto.randomUUID(), type, leg, transferId: tid, amount, categoryId: '', accountId, date: '2026-11-10', note: '', updatedAt: 2 });
  s.transactions = [mk('expense', 'out', 30000, a.id), mk('income', 'in', 30000, b.id), mk('expense', 'fee', 500, b.id)];
  const clean = sanitizeState(JSON.parse(JSON.stringify(s)));
  assert.equal(clean.transactions.length, 3);
  assert.ok(clean.transactions.every((t) => t.transferId === tid));
  const w = accountSummaries(s);
  const bal = (id) => w.accounts.find((x) => x.id === id).balance;
  assert.equal(bal(a.id), 70000);
  assert.equal(bal(b.id), 29500);
  assert.equal(w.total, 99500);
  const m = summarize(s, '2026-11');
  assert.equal(m.income, 0);
  assert.equal(m.expense, 500);
  assert.equal(m.byCategory[0].name, 'Transfer fees');
  const csv = toCSV(s);
  const fresh = createState(); fresh.accounts = [a, b];
  const r = importCSV(fresh, csv);
  assert.equal(r.added, 3);
  assert.ok(r.state.transactions.every((t) => t.transferId === tid));
  assert.equal(removeAccount(s, a.id).transactions.every((t) => t.deleted), true);
});

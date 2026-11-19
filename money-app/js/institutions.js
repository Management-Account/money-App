// Catalog of banks, wallets and cards used in Egypt, for the "New account" picker.
// Verified against public bank lists (Wikipedia and 2026 secondary lists) on 2026-11-18; the Central Bank of Egypt's
// own list could not be fetched, so check it if you need it to be exact. Banks merge, rename and close: to add or fix an
// entry just edit this file (id must stay unique and never change once users have picked it).
// Custom institutions typed by a user are stored as "~Name" and are never in this list.

export const GROUPS = [
  ['bank', '🏦 Banks'],
  ['wallet', '📱 Mobile wallets & payment apps'],
  ['card', '💳 Cards'],
  ['other', '💰 Other'],
];

// [id, English name, Arabic name, short badge text, extra search words]
const B = [
  ['nbe', 'National Bank of Egypt', 'البنك الأهلي المصري', 'NBE', 'ahly ahli الاهلي'],
  ['misr', 'Banque Misr', 'بنك مصر', 'BM', 'bank misr'],
  ['cairo', 'Banque du Caire', 'بنك القاهرة', 'BC', 'bank of cairo'],
  ['cib', 'Commercial International Bank (CIB)', 'البنك التجاري الدولي', 'CIB', 'commercial'],
  ['aaib', 'Arab African International Bank (AAIB)', 'البنك العربي الأفريقي الدولي', 'AAIB', ''],
  ['saib', 'Societe Arabe Internationale de Banque (SAIB)', 'بنك الشركة المصرفية العربية الدولية', 'SAIB', ''],
  ['scb', 'Suez Canal Bank', 'بنك قناة السويس', 'SCB', ''],
  ['egb', 'Egyptian Gulf Bank', 'البنك المصري الخليجي', 'EGB', ''],
  ['hdb', 'Housing & Development Bank (HDB)', 'بنك التعمير والإسكان', 'HDB', 'housing and development'],
  ['edbe', 'Export Development Bank of Egypt (EDBE)', 'البنك المصري لتنمية الصادرات', 'EDB', ''],
  ['idb', 'Industrial Development Bank', 'بنك التنمية الصناعية', 'IDB', ''],
  ['abe', 'Agricultural Bank of Egypt', 'البنك الزراعي المصري', 'ABE', ''],
  ['eall', 'Egyptian Arab Land Bank', 'المصرف العربي العقاري', 'EAL', 'real estate'],
  ['nsb', 'Nasser Social Bank', 'بنك ناصر الاجتماعي', 'NSB', ''],
  ['nib', 'National Investment Bank', 'بنك الاستثمار القومي', 'NIB', ''],
  ['aib', 'Arab International Bank', 'المصرف العربي الدولي', 'AIB', ''],
  ['arabinvest', 'Arab Investment Bank', 'بنك الاستثمار العربي', 'AIB', ''],
  ['ub', 'United Bank', 'المصرف المتحد', 'UB', ''],
  ['alex', 'Alexbank', 'بنك الإسكندرية', 'ALX', 'bank of alexandria intesa sanpaolo'],
  ['ca', 'Crédit Agricole Egypt', 'كريدي أجريكول مصر', 'CA', 'credit agricole'],
  ['hsbc', 'HSBC Egypt', 'إتش إس بي سي مصر', 'HSBC', ''],
  ['qnb', 'QNB Egypt', 'بنك قطر الوطني مصر', 'QNB', 'qnb alahli الاهلي'],
  ['enbd', 'Emirates NBD Egypt', 'بنك الإمارات دبي الوطني مصر', 'ENBD', 'nbd'],
  ['adcb', 'ADCB Egypt', 'بنك أبوظبي التجاري مصر', 'ADCB', 'abu dhabi commercial'],
  ['adib', 'ADIB Egypt', 'مصرف أبوظبي الإسلامي مصر', 'ADIB', 'abu dhabi islamic'],
  ['fab', 'FAB Misr', 'بنك أبوظبي الأول مصر', 'FAB', 'first abu dhabi bank'],
  ['mashreq', 'Mashreq Bank Egypt', 'بنك المشرق مصر', 'MSQ', ''],
  ['abk', 'ABK-Egypt (Al Ahli Bank of Kuwait)', 'البنك الأهلي الكويتي مصر', 'ABK', 'ahli united bank aub'],
  ['nbk', 'NBK-Egypt (National Bank of Kuwait)', 'بنك الكويت الوطني مصر', 'NBK', ''],
  ['baraka', 'Al Baraka Bank Egypt', 'بنك البركة مصر', 'ABB', ''],
  ['faisal', 'Faisal Islamic Bank of Egypt', 'بنك فيصل الإسلامي المصري', 'FIB', ''],
  ['kfh', 'Kuwait Finance House Egypt (KFH)', 'بيت التمويل الكويتي مصر', 'KFH', ''],
  ['attijari', 'Attijariwafa Bank Egypt', 'التجاري وفا بنك مصر', 'AWB', 'attijari'],
  ['abc', 'Bank ABC Egypt', 'بنك المؤسسة العربية المصرفية', 'ABC', 'arab banking corporation'],
  ['arabbank', 'Arab Bank Egypt', 'البنك العربي مصر', 'AB', ''],
  ['midb', 'Misr Iran Development Bank', 'بنك مصر إيران للتنمية', 'MID', ''],
  ['citi', 'Citibank Egypt', 'سيتي بنك مصر', 'CITI', ''],
  ['amexbank', 'American Express Egypt', 'أمريكان إكسبريس مصر', 'AMEX', ''],
  ['onebank', 'Onebank', 'ون بنك', 'ONE', 'bank audi blom'],
  ['egyptpost', 'Egypt Post (savings and accounts)', 'البريد المصري', 'EP', 'post office بريد'],
];

const W = [
  ['vfcash', 'Vodafone Cash', 'فودافون كاش', 'VC', 'vodafone'],
  ['etcash', 'e& money (Etisalat Cash)', 'اتصالات كاش', 'e&', 'etisalat cash e and'],
  ['orcash', 'Orange Cash', 'أورنج كاش', 'OC', 'orange'],
  ['wepay', 'WE Pay', 'وي باي', 'WE', 'telecom egypt'],
  ['instapay', 'InstaPay', 'إنستاباي', 'IP', 'insta pay'],
  ['fawry', 'Fawry', 'فوري', 'FW', 'myfawry my fawry'],
  ['aman', 'Aman', 'أمان', 'AM', 'aman holding'],
  ['easycash', 'Easycash', 'إيزي كاش', 'EC', 'easy cash'],
  ['opay', 'OPay', 'أو باي', 'OP', ''],
  ['telda', 'Telda', 'تيلدا', 'TD', ''],
  ['sympl', 'Sympl', 'سيمبل', 'SY', ''],
  ['valu', 'valU', 'فاليو', 'VU', 'value'],
  ['khazna', 'Khazna', 'خزنة', 'KZ', ''],
  ['mnt', 'MNT-Halan', 'إم إن تي حالا', 'MH', 'halan'],
  ['shahry', 'Shahry', 'شهري', 'SH', ''],
  ['souhoola', 'Souhoola', 'سهولة', 'SO', ''],
  ['paymob', 'Paymob', 'باي موب', 'PM', ''],
  ['tamara', 'Tamara', 'تمارا', 'TM', ''],
  ['tabby', 'Tabby', 'تابي', 'TB', ''],
  ['cibwallet', 'CIB Smart Wallet', 'محفظة CIB الذكية', 'CIB', 'cib wallet'],
  ['nbewallet', 'NBE E-Wallet (Ahly Phone Cash)', 'محفظة البنك الأهلي', 'NBE', 'ahli ahly mobile wallet'],
  ['bmwallet', 'Banque Misr Wallet (BM Wallet)', 'محفظة بنك مصر', 'BM', 'misr digital'],
  ['qahera', 'Qahera Cash', 'قاهرة كاش', 'QC', 'banque du caire wallet'],
  ['applepay', 'Apple Pay', 'أبل باي', 'AP', ''],
  ['googlepay', 'Google Pay', 'جوجل باي', 'GP', ''],
  ['samsungpay', 'Samsung Pay', 'سامسونج باي', 'SP', ''],
  ['paypal', 'PayPal', 'باي بال', 'PP', ''],
];

const C = [
  ['meeza', 'Meeza card', 'ميزة', 'MZ', 'national card'],
  ['meezadigital', 'Meeza Digital (virtual card)', 'ميزة ديجيتال', 'MD', ''],
  ['visa', 'Visa card', 'فيزا', 'VISA', 'debit credit'],
  ['mastercard', 'Mastercard', 'ماستركارد', 'MC', 'debit credit master'],
  ['amexcard', 'American Express card', 'أمريكان إكسبريس', 'AMEX', ''],
  ['unionpay', 'UnionPay card', 'يونيون باي', 'UP', ''],
  ['prepaid', 'Prepaid card', 'بطاقة مسبقة الدفع', 'PRE', ''],
];

const O = [
  ['cash', 'Cash', 'نقدي', 'CA', 'wallet pocket'],
  ['savings', 'Savings jar', 'مدخرات', 'SV', 'piggy'],
  ['gold', 'Gold & investments', 'ذهب واستثمارات', 'GD', 'gold'],
];

export const INSTITUTIONS = [
  ...B.map((r) => ({ id: r[0], name: r[1], ar: r[2], short: r[3], words: r[4], kind: 'bank' })),
  ...W.map((r) => ({ id: r[0], name: r[1], ar: r[2], short: r[3], words: r[4], kind: 'wallet' })),
  ...C.map((r) => ({ id: r[0], name: r[1], ar: r[2], short: r[3], words: r[4], kind: 'card' })),
  ...O.map((r) => ({ id: r[0], name: r[1], ar: r[2], short: r[3], words: r[4], kind: 'other' })),
];

const BY_ID = new Map(INSTITUTIONS.map((i) => [i.id, i]));

export const CUSTOM_PREFIX = '~';

// value -> { id, name, ar, short, kind, custom } or null
export function institutionOf(value) {
  if (typeof value !== 'string' || !value) return null;
  if (value.startsWith(CUSTOM_PREFIX)) {
    const name = value.slice(1).trim();
    return name ? { id: value, name, ar: '', short: initials(name), kind: 'custom', custom: true } : null;
  }
  return BY_ID.get(value) || null;
}

export const customValue = (name) => CUSTOM_PREFIX + String(name).trim().slice(0, 60);

export function initials(name) {
  const words = String(name).replace(/[()&.,\-_/]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join('').toUpperCase();
  return words.slice(0, 2).map((w) => Array.from(w)[0]).join('').toUpperCase();
}

// Lowercase, strip Arabic diacritics and unify letter variants so "الاهلي" finds "الأهلي".
export function norm(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ًͯ-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^a-z0-9؀-ۿ& ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HAY = new Map(INSTITUTIONS.map((i) => [i.id, norm(`${i.name} ${i.ar} ${i.short} ${i.words}`)]));

// All institutions matching every word typed, best matches (name starts with the query) first.
export function searchInstitutions(query) {
  const q = norm(query);
  if (!q) return INSTITUTIONS.slice();
  const words = q.split(' ');
  const hits = INSTITUTIONS.filter((i) => {
    const h = HAY.get(i.id);
    return words.every((w) => h.includes(w));
  });
  const score = (i) => (norm(i.name).startsWith(q) || norm(i.short) === q || norm(i.ar).startsWith(q) ? 0 : 1);
  return hits.map((i, n) => [i, n]).sort((a, b) => score(a[0]) - score(b[0]) || a[1] - b[1]).map((x) => x[0]);
}

// ---- badge (logo) markup ----
import { LOGOS } from './logos.js';

const escAttr = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function hue(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}

// Returns HTML for a small round/square badge. `inst` comes from institutionOf(); null gives a neutral wallet-style badge.
export function badgeHTML(inst, size = '') {
  const cls = `ibadge ${size}`.trim();
  if (!inst) return `<span class="${cls} none" aria-hidden="true">•</span>`;
  const src = LOGOS[inst.id];
  if (src) return `<span class="${cls} img k-${inst.kind}" aria-hidden="true"><img src="${escAttr(src)}" alt="" loading="lazy"></span>`;
  const h = hue(inst.id);
  return `<span class="${cls} k-${inst.kind}" style="--h:${h}" aria-hidden="true">${escAttr(inst.short)}</span>`;
}

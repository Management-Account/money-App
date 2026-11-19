// Emojis for categories: the picker's choices, defaults for the built-in categories, and name-based suggestions.

export const EMOJI_GROUPS = [
  ['Food & drink', '🍔 🍕 🍜 🍣 🥗 🛒 ☕ 🍰 🍺 🥖 🍎 🥩'],
  ['Transport', '🚗 🚌 🚕 🚆 ✈️ ⛽ 🚲 🛵 🅿️ 🚢'],
  ['Home & bills', '🏠 🧾 💡 💧 📶 📱 🔌 🛋️ 🔧 🧹'],
  ['Shopping', '🛍️ 👕 👟 🎁 💄 💍 📦 🛒 ⌚ 👜'],
  ['Health & care', '💊 🩺 🏥 🦷 🧴 💇 🏋️ 🧘'],
  ['Fun & travel', '🎬 🎮 🎵 📚 🏖️ 🎟️ ⚽ 🎨 🧳 🎉'],
  ['Family & school', '👶 🎓 🐶 🐱 🧸 🏫 ✏️ 👨‍👩‍👧'],
  ['Money & work', '💼 💰 💵 🏦 📈 💳 🪙 🤝 🏷️ 🧮'],
  ['Other', '⭐ ❤️ 🔥 ✨ 🌍 🕌 🤲 🙏 📌 ❓'],
].map(([name, list]) => [name, list.split(' ')]);

const DEFAULTS = {
  'ff9bb12e-5104-4218-916e-0345c70262e9': '🍔', // Food
  '60436924-d91d-49e2-8b3b-2a3b99f552ae': '🚗', // Transport
  '52d00da5-182a-4ea5-9f4a-f0e8f7c51741': '🧾', // Bills
  'b3ae29d7-ac1d-4bdb-9f3e-d826e98851ed': '🛍️', // Shopping
  '5338196f-beed-4ba0-999f-8cf8bb4085fb': '💊', // Health
  '3c4ab7f5-6a41-449d-b48b-8e129364eb1d': '🎬', // Entertainment
  '8aed19f5-9703-4543-91f3-ddb415f10e11': '📦', // Other
  '0e43b028-f87b-40b2-837b-9b3f96ab8b72': '💼', // Salary
  'b4a14e6c-d9b9-45b1-93be-5e5d717f7360': '💰', // Other income
};

const KEYWORDS = [
  [/food|eat|restaurant|grocer|supermarket|meal|lunch|dinner|breakfast|أكل|طعام|مطعم/i, '🍔'],
  [/coffee|cafe|tea|قهوة/i, '☕'],
  [/transport|taxi|uber|bus|metro|fuel|petrol|gas|car|بنزين|مواصلات/i, '🚗'],
  [/bill|utilit|electric|water|internet|phone|rent|فواتير|كهرباء|ايجار|إيجار/i, '🧾'],
  [/shop|cloth|fashion|mall|تسوق|ملابس/i, '🛍️'],
  [/health|doctor|medic|pharma|hospital|dent|صحة|دواء|علاج/i, '💊'],
  [/entertain|movie|cinema|game|music|fun|netflix|ترفيه/i, '🎬'],
  [/travel|trip|holiday|hotel|flight|vacation|سفر/i, '✈️'],
  [/school|educat|course|tuition|book|تعليم|مدرسة|كتب/i, '🎓'],
  [/kid|child|baby|family|اطفال|أطفال/i, '👶'],
  [/pet|dog|cat/i, '🐶'],
  [/gift|donat|charity|zakat|sadaqa|تبرع|زكاة|صدقة/i, '🎁'],
  [/salary|wage|payroll|job|work|مرتب|راتب/i, '💼'],
  [/invest|stock|saving|interest|dividend|استثمار/i, '📈'],
  [/bonus|freelance|income|refund|cash/i, '💰'],
];

// An emoji is one or more pictographic characters, nothing else, and short.
export function validEmoji(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 16 && /\p{Extended_Pictographic}/u.test(v) && !/[A-Za-z0-9\s]/.test(v) ? v : '';
}

export function suggestEmoji(name) {
  for (const [re, e] of KEYWORDS) if (re.test(name || '')) return e;
  return '';
}

// What to show for a category: its own emoji, else the built-in default, else a guess from the name, else a tag.
export function categoryEmoji(cat) {
  if (!cat) return '🏷️';
  return validEmoji(cat.emoji) || DEFAULTS[cat.id] || suggestEmoji(cat.name) || (cat.type === 'income' ? '💰' : '🏷️');
}

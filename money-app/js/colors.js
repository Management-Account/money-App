// Category colours. Every category has one colour, used for its bar in the graphs.
// The palette is checked for contrast on all four themes' surfaces; users can also pick any colour.
export const PALETTE = ['#3b82f6', '#e8590c', '#c026d3', '#16a34a', '#6366f1', '#b87d00', '#0d9488', '#ec4899', '#0284c7', '#e5484d'];

// Built-in categories get fixed colours so they look the same on every device.
const DEFAULTS = {
  'ff9bb12e-5104-4218-916e-0345c70262e9': '#e8590c', // Food
  '60436924-d91d-49e2-8b3b-2a3b99f552ae': '#3b82f6', // Transport
  '52d00da5-182a-4ea5-9f4a-f0e8f7c51741': '#6366f1', // Bills
  'b3ae29d7-ac1d-4bdb-9f3e-d826e98851ed': '#c026d3', // Shopping
  '5338196f-beed-4ba0-999f-8cf8bb4085fb': '#e5484d', // Health
  '3c4ab7f5-6a41-449d-b48b-8e129364eb1d': '#ec4899', // Entertainment
  '8aed19f5-9703-4543-91f3-ddb415f10e11': '#0d9488', // Other
  '0e43b028-f87b-40b2-837b-9b3f96ab8b72': '#16a34a', // Salary
  'b4a14e6c-d9b9-45b1-93be-5e5d717f7360': '#0284c7', // Other income
};

export const validColor = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : '');

// The colour to draw for a category: its own, else the built-in one, else a stable pick from the palette.
export function categoryColor(cat) {
  if (!cat) return '#6b7299';
  const own = validColor(cat.color);
  if (own) return own;
  if (DEFAULTS[cat.id]) return DEFAULTS[cat.id];
  let h = 0;
  for (const ch of String(cat.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// First palette colour not used by a live category, for pre-selecting on "New category".
export function nextColor(categories) {
  const used = new Set(categories.filter((c) => !c.deleted).map((c) => categoryColor(c)));
  return PALETTE.find((c) => !used.has(c)) || PALETTE[categories.length % PALETTE.length];
}

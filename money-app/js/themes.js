// Colour themes. The actual colours live in styles.css (:root[data-theme="..."]); this list names them and
// gives the preview swatches on the Themes tab.
export const THEMES = [
  { id: 'neon', name: 'Neon Night', blurb: 'Deep navy with violet glow. The original.', dark: true, bg: '#0a0f2c', card: '#1a2256', accent: '#7c5cf0', accent2: '#3b6ef0', text: '#e9ecff' },
  { id: 'soft', name: 'Soft Light', blurb: 'Clean light look with soft shadows and blue accents.', dark: false, bg: '#e9eef4', card: '#fdfeff', accent: '#2f3df0', accent2: '#3f86ff', text: '#28304a' },
  { id: 'ocean', name: 'Ocean', blurb: 'Dark teal and sea blue.', dark: true, bg: '#04141c', card: '#0e3040', accent: '#2563eb', accent2: '#0ea5c4', text: '#e3f6fb' },
  { id: 'aurora', name: 'Aurora Glass', blurb: 'Frosted glass over a soft pastel glow. Light and airy.', dark: false, bg: 'linear-gradient(135deg,#ff9bd2,#9a8cff 55%,#7fd8ff)', card: 'rgba(255,255,255,.75)', accent: '#4f5bd9', accent2: '#7a6cf5', text: '#1e1b4b' },
  { id: 'crystal', name: 'Crystal Glass', blurb: 'Dark glass panels with crisp blue highlights.', dark: true, bg: 'linear-gradient(135deg,#17306e,#060b1f 70%)', card: 'rgba(120,160,255,.22)', accent: '#4f46e5', accent2: '#2f7bff', text: '#eaf1ff' },
  { id: 'liquid', name: 'Liquid Glass', blurb: 'Dark violet glass with glossy liquid highlights.', dark: true, bg: 'radial-gradient(circle at 70% 20%,#5b3df0,#0a0a24 60%)', card: 'rgba(130,120,255,.25)', accent: '#8b5cf6', accent2: '#5b6cf5', text: '#eef0ff' },
  { id: 'mintnm', name: 'Neumorphic Mint', blurb: 'Soft charcoal with embossed panels and a mint-green glow.', dark: true, bg: '#232323', card: '#2b2b2b', accent: '#00e676', accent2: '#00c46a', text: '#f2f2f2' },
  { id: 'indigonm', name: 'Neumorphic Indigo', blurb: 'Soft indigo with pressed buttons and periwinkle accents.', dark: true, bg: '#2f2f55', card: '#34345f', accent: '#5352b8', accent2: '#7a86ff', text: '#eceaff' },
  { id: 'knobs', name: 'Neon Knobs', blurb: 'Black and magenta studio-gear look with glowing rims.', dark: true, bg: '#1c1320', card: '#241829', accent: '#e255f5', accent2: '#b026d0', text: '#fbe9ff' },
  { id: 'sunset', name: 'Sunset', blurb: 'Warm plum with orange and pink.', dark: true, bg: '#1a0d17', card: '#461c34', accent: '#db2777', accent2: '#f97316', text: '#ffeee6' },
];
export const DEFAULT_THEME = 'neon';
export const isTheme = (id) => THEMES.some((t) => t.id === id);
export const themeMeta = (id) => ({ neon: '#0a0f2c', soft: '#e9eef4', ocean: '#04141c', sunset: '#1a0d17', aurora: '#bdb4f1', crystal: '#060b1f', liquid: '#04050f', mintnm: '#232323', indigonm: '#2f2f55', knobs: '#1c1320' })[id] || '#0a0f2c';

// Graph styles. Colours follow the active theme (see .gs-* rules in styles.css).
export const GRAPH_STYLES = [
  { id: 'classic', name: 'Classic', blurb: 'Flat columns and straight lines.' },
  { id: 'smooth', name: 'Smooth', blurb: 'Rounded columns and flowing curves.' },
  { id: 'wave', name: 'Waves', blurb: 'Overlapping glowing waves, like a signal trace.' },
  { id: 'glow', name: 'Neon glow', blurb: 'Glowing gradient columns, wave lines and ring gauges.' },
];
export const BALANCE_STYLES = [
  { id: 'cards', name: 'Stacked cards', blurb: 'Total balance first, then one swipeable card for each account.' },
  { id: 'classic', name: 'Classic', blurb: 'One total balance card with your accounts listed underneath.' },
];
export const DEFAULT_BALANCE = 'cards';
export const isBalance = (id) => BALANCE_STYLES.some((b) => b.id === id);
export const ACCOUNT_LIST_OPTIONS = [
  { id: 'hide', name: 'Hidden', blurb: 'Home stays short. Open accounts from the balance card or the Accounts tab.' },
  { id: 'show', name: 'Show at the bottom', blurb: 'A grid of account cards under the dashboard, one for each account.' },
];
export const DEFAULT_ACCOUNT_LIST = 'hide';
export const isAccountList = (id) => ACCOUNT_LIST_OPTIONS.some((o) => o.id === id);
export const DEFAULT_GRAPH = 'classic';
export const isGraph = (id) => GRAPH_STYLES.some((g) => g.id === id);

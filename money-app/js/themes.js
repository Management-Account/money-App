// Colour themes. The actual colours live in styles.css (:root[data-theme="..."]); this list names them and
// gives the preview swatches on the Themes tab.
export const THEMES = [
  { id: 'neon', name: 'Neon Night', blurb: 'Deep navy with violet glow. The original.', dark: true, bg: '#0a0f2c', card: '#1a2256', accent: '#7c5cf0', accent2: '#3b6ef0', text: '#e9ecff' },
  { id: 'soft', name: 'Soft Light', blurb: 'Clean light look with soft shadows and blue accents.', dark: false, bg: '#e9eef4', card: '#fdfeff', accent: '#2f3df0', accent2: '#3f86ff', text: '#28304a' },
  { id: 'ocean', name: 'Ocean', blurb: 'Dark teal and sea blue.', dark: true, bg: '#04141c', card: '#0e3040', accent: '#2563eb', accent2: '#0ea5c4', text: '#e3f6fb' },
  { id: 'sunset', name: 'Sunset', blurb: 'Warm plum with orange and pink.', dark: true, bg: '#1a0d17', card: '#461c34', accent: '#db2777', accent2: '#f97316', text: '#ffeee6' },
];
export const DEFAULT_THEME = 'neon';
export const isTheme = (id) => THEMES.some((t) => t.id === id);
export const themeMeta = (id) => ({ neon: '#0a0f2c', soft: '#e9eef4', ocean: '#04141c', sunset: '#1a0d17' })[id] || '#0a0f2c';

// Graph styles. Colours follow the active theme (see .gs-* rules in styles.css).
export const GRAPH_STYLES = [
  { id: 'classic', name: 'Classic', blurb: 'Flat columns and straight lines.' },
  { id: 'smooth', name: 'Smooth', blurb: 'Rounded columns and flowing curves.' },
  { id: 'wave', name: 'Waves', blurb: 'Overlapping glowing waves, like a signal trace.' },
  { id: 'glow', name: 'Neon glow', blurb: 'Glowing gradient columns, wave lines and ring gauges.' },
];
export const DEFAULT_GRAPH = 'classic';
export const isGraph = (id) => GRAPH_STYLES.some((g) => g.id === id);

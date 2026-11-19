// Small dependency-free chart renderers. Each returns { html, tips }:
//  - html: markup to drop into a container (SVG or HTML)
//  - tips: tooltip content per interactive element (matched by data-i), inserted with textContent only
// Colors come from CSS classes (.s1 / .s2) so they follow the theme.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Round axis ticks (values in major units, e.g. 1250.5 not 125050).
export function niceTicks(min, max, target = 4) {
  if (!(max > min)) max = min + 1;
  const raw = (max - min) / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let k = Math.round(lo / step); k <= Math.round(hi / step); k++) ticks.push(+(k * step).toPrecision(12));
  return { ticks, lo: ticks[0], hi: ticks[ticks.length - 1], step };
}

// Full numbers under 10,000; compact (12K, 1.5M) once the axis reaches it. One style per axis.
export function axisFormatter(maxAbs) {
  const f = new Intl.NumberFormat(
    undefined,
    maxAbs >= 10000 ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: 2 },
  );
  return (v) => f.format(v);
}

function topRounded(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function frame(width, height, ticks, hi, lo, left, top, pw, ph, fmt) {
  const y = (v) => top + ((hi - v) / (hi - lo)) * ph;
  let g = '';
  for (const t of ticks) {
    const yy = y(t).toFixed(1);
    g += `<line class="${t === 0 ? 'axis' : 'grid'}" x1="${left}" x2="${left + pw}" y1="${yy}" y2="${yy}"/>`;
    g += `<text class="tick" x="${left - 8}" y="${(+yy + 4).toFixed(1)}" text-anchor="end">${esc(fmt(t))}</text>`;
  }
  return { y, grid: g };
}

function xLabels(labels, left, slot, height) {
  const every = Math.max(1, Math.ceil(36 / slot));
  const n = labels.length;
  return labels
    .map((l, i) =>
      (n - 1 - i) % every === 0
        ? `<text class="tick" x="${(left + (i + 0.5) * slot).toFixed(1)}" y="${height - 8}" text-anchor="middle">${esc(l)}</text>`
        : '',
    )
    .join('');
}

let uidN = 0;
const nextId = () => `c${++uidN}`;

// Smooth line through the points that never overshoots (monotone cubic), for the "smooth" and "glow" styles.
function smoothPath(pts) {
  const n = pts.length;
  const lin = () => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  if (n < 3) return lin();
  const s = [];
  for (let i = 0; i < n - 1; i++) s.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0] || 1));
  const t = [s[0]];
  for (let i = 1; i < n - 1; i++) t.push(s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2);
  t.push(s[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (s[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / s[i];
    const b = t[i + 1] / s[i];
    const h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * s[i]; t[i + 1] = k * b * s[i]; }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const dx = (x1 - x0) / 3;
    d += `C${(x0 + dx).toFixed(1)},${(y0 + t[i] * dx).toFixed(1)} ${(x1 - dx).toFixed(1)},${(y1 - t[i + 1] * dx).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

const stop = (o, v, op = 1) => `<stop offset="${o}" style="stop-color:var(${v});stop-opacity:${op}"/>`;

// Ring gauge (a donut showing a share, 0 to 1). `text` is shown in the middle.
export function ringGauge({ value, text, size = 84, variant = 'glow' }) {
  const id = nextId();
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const defs = `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${size}" x2="${size}" y2="0">${stop(0, '--s1')}${stop(1, '--s1b')}</linearGradient></defs>`;
  return `<svg class="ring v-${variant}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(text)}">${defs}
    <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}"/>
    <circle class="ring-val" cx="${size / 2}" cy="${size / 2}" r="${r}" style="stroke:url(#${id})" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text class="ring-text" x="50%" y="50%" text-anchor="middle" dominant-baseline="central">${esc(text)}</text></svg>`;
}

// Grouped columns. months: [{ label, title, values: [..one per series] }] (values in minor units)
export function columnChart({ width, height = 240, months, series, fmtMoney, ariaLabel, variant = 'classic' }) {
  const id = nextId();
  const max = Math.max(0, ...months.flatMap((m) => m.values)) / 100;
  const { ticks, hi } = niceTicks(0, max || 1, 4);
  const fmt = axisFormatter(hi);
  const left = Math.max(...ticks.map((t) => fmt(t).length)) * 6.6 + 14;
  const top = 10;
  const bottom = 26;
  const pw = Math.max(40, width - left - 8);
  const ph = height - top - bottom;
  const n = months.length;
  const slot = pw / n;
  const { y, grid } = frame(width, height, ticks, hi, 0, left, top, pw, ph, fmt);
  const k = series.length;
  const gap = 2;
  const maxBar = variant === 'glow' ? 12 : variant === 'smooth' ? 18 : 24;
  const barW = Math.min(maxBar, Math.max(4, (slot * 0.72 - gap * (k - 1)) / k));
  const groupW = barW * k + gap * (k - 1);

  if (variant === 'wave') return waveChart({ id, width, height, months, series, fmtMoney, ariaLabel, left, top, pw, ph, slot, hi, grid, y, xl: xLabels(months.map((m) => m.label), left, slot, height) });

  const tips = [];
  let bars = '';
  months.forEach((m, i) => {
    const gx = left + i * slot + (slot - groupW) / 2;
    let g = '';
    m.values.forEach((v, j) => {
      if (v <= 0) return;
      const h = Math.max(2, (v / 100 / hi) * ph);
      const fill = variant === 'glow' ? ` style="fill:url(#${id}${j})"` : '';
      g += `<path class="bar ${series[j].cls}"${fill} d="${topRounded(gx + j * (barW + gap), top + ph - h, barW, h, variant === 'classic' ? 4 : barW / 2)}"/>`;
    });
    const label = `${m.title}: ${series.map((s, j) => `${s.name} ${fmtMoney(m.values[j])}`).join(', ')}`;
    tips.push({ title: m.title, rows: series.map((s, j) => ({ cls: s.cls, name: s.name, value: fmtMoney(m.values[j]) })) });
    bars += `<g class="grp">${g}<rect class="hit" data-i="${i}" tabindex="0" role="img" aria-label="${esc(label)}" x="${(left + i * slot).toFixed(1)}" y="${top}" width="${slot.toFixed(1)}" height="${ph}"/></g>`;
  });

  const defs = variant === 'glow'
    ? `<defs>${series.map((s, j) => `<linearGradient id="${id}${j}" gradientUnits="userSpaceOnUse" x1="0" y1="${top + ph}" x2="0" y2="${top}">${stop(0, `--${s.cls}`)}${stop(1, `--${s.cls}b`)}</linearGradient>`).join('')}</defs>`
    : '';
  const html = `<svg class="chart-svg v-${variant}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(ariaLabel)}">${defs}${grid}${bars}${xLabels(months.map((m) => m.label), left, slot, height)}</svg>`;
  return { html, tips };
}

// Layered smooth waves, one per series, overlapping like the reference dashboard.
function waveChart({ id, width, height, months, series, fmtMoney, ariaLabel, left, top, pw, ph, slot, hi, grid, y, xl }) {
  const px = (i) => left + (i + 0.5) * slot;
  const base = top + ph;
  let defs = '';
  let paths = '';
  // Draw the larger series first so the smaller one stays visible on top.
  const order = series.map((s, j) => j).sort((a, b) => months.reduce((t, m) => t + m.values[b], 0) - months.reduce((t, m) => t + m.values[a], 0));
  for (const j of order) {
    const pts = months.map((m, i) => [px(i), y(m.values[j] / 100)]);
    const line = months.length === 1 ? `M${(pts[0][0] - slot / 2).toFixed(1)},${pts[0][1].toFixed(1)}H${(pts[0][0] + slot / 2).toFixed(1)}` : smoothPath(pts);
    const x0 = months.length === 1 ? pts[0][0] - slot / 2 : pts[0][0];
    const x1 = months.length === 1 ? pts[0][0] + slot / 2 : pts[pts.length - 1][0];
    const cls = series[j].cls;
    defs += `<linearGradient id="${id}w${j}" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${base}">${stop(0, `--${cls}`, 0.6)}${stop(1, `--${cls}`, 0)}</linearGradient><linearGradient id="${id}s${j}" gradientUnits="userSpaceOnUse" x1="${left}" y1="0" x2="${left + pw}" y2="0">${stop(0, `--${cls}`)}${stop(1, `--${cls}b`)}</linearGradient>`;
    paths += `<path class="wave-area ${cls}" style="fill:url(#${id}w${j})" d="${line}L${x1.toFixed(1)},${base}L${x0.toFixed(1)},${base}Z"/><path class="wave-line ${cls}" style="stroke:url(#${id}s${j})" d="${line}"/>`;
  }
  const tips = [];
  let hits = '';
  months.forEach((m, i) => {
    const label = `${m.title}: ${series.map((s, j) => `${s.name} ${fmtMoney(m.values[j])}`).join(', ')}`;
    tips.push({ title: m.title, rows: series.map((s, j) => ({ cls: s.cls, name: s.name, value: fmtMoney(m.values[j]) })) });
    const dots = series.map((s, j) => `<circle class="dot ${s.cls}" cx="${px(i).toFixed(1)}" cy="${y(m.values[j] / 100).toFixed(1)}" r="3.5"/>`).join('');
    hits += `<g class="grp"><line class="xh" x1="${px(i).toFixed(1)}" x2="${px(i).toFixed(1)}" y1="${top}" y2="${base}"/><g class="wdots">${dots}</g><rect class="hit" data-i="${i}" tabindex="0" role="img" aria-label="${esc(label)}" x="${(left + i * slot).toFixed(1)}" y="${top}" width="${slot.toFixed(1)}" height="${ph}"/></g>`;
  });
  const html = `<svg class="chart-svg v-wave" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(ariaLabel)}"><defs>${defs}</defs>${grid}${paths}${hits}${xl}</svg>`;
  return { html, tips };
}

// One line (running balance). months: [{ label, title, value }] (minor units). May go negative.
export function lineChart({ width, height = 240, months, name, fmtMoney, ariaLabel, variant = 'classic' }) {
  const id = nextId();
  const vals = months.map((m) => m.value / 100);
  const { ticks, hi, lo } = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 4);
  const fmt = axisFormatter(Math.max(Math.abs(hi), Math.abs(lo)));
  const left = Math.max(...ticks.map((t) => fmt(t).length)) * 6.6 + 14;
  const top = 18;
  const bottom = 26;
  const pw = Math.max(40, width - left - 12);
  const ph = height - top - bottom;
  const n = months.length;
  const slot = pw / n;
  const { y, grid } = frame(width, height, ticks, hi, lo, left, top, pw, ph, fmt);
  const px = (i) => left + (i + 0.5) * slot;
  const pts = months.map((m, i) => [px(i), y(m.value / 100)]);
  const y0 = y(0);
  const line = variant === 'classic' ? pts.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${yy.toFixed(1)}`).join('') : smoothPath(pts);
  const area = `${line}L${pts[n - 1][0].toFixed(1)},${y0.toFixed(1)}L${pts[0][0].toFixed(1)},${y0.toFixed(1)}Z`;

  const glow = variant === 'glow' || variant === 'wave';
  const defs = glow
    ? `<defs><linearGradient id="${id}a" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${top + ph}">${stop(0, '--s1', 0.5)}${stop(1, '--s1', 0)}</linearGradient><linearGradient id="${id}l" gradientUnits="userSpaceOnUse" x1="${left}" y1="0" x2="${left + pw}" y2="0">${stop(0, '--s1')}${stop(1, '--s1b')}</linearGradient></defs>`
    : '';
  const areaFill = glow ? ` style="fill:url(#${id}a);fill-opacity:1"` : '';
  const lineStroke = glow ? ` style="stroke:url(#${id}l)"` : '';
  const tips = [];
  let hits = '';
  months.forEach((m, i) => {
    const label = `${m.title}: ${name} ${fmtMoney(m.value)}`;
    tips.push({ title: m.title, rows: [{ cls: 's1', name, value: fmtMoney(m.value), line: true }] });
    hits += `<g class="grp"><line class="xh" x1="${px(i).toFixed(1)}" x2="${px(i).toFixed(1)}" y1="${top}" y2="${top + ph}"/><rect class="hit" data-i="${i}" tabindex="0" role="img" aria-label="${esc(label)}" x="${(left + i * slot).toFixed(1)}" y="${top}" width="${slot.toFixed(1)}" height="${ph}"/></g>`;
  });
  const dots = pts.map(([x, yy]) => `<circle class="dot s1" cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="4"/>`).join('');
  const [lx, ly] = pts[n - 1];
  const below = ly < top + 8;
  const endLabel = `<text class="endlabel" x="${lx.toFixed(1)}" y="${(below ? ly + 20 : ly - 10).toFixed(1)}" text-anchor="end">${esc(fmtMoney(months[n - 1].value))}</text>`;

  const html = `<svg class="chart-svg v-${variant}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(ariaLabel)}">${defs}${grid}<path class="area s1"${areaFill} d="${area}"/><path class="line s1"${lineStroke} d="${line}"/>${dots}${endLabel}${xLabels(months.map((m) => m.label), left, slot, height)}${hits}</svg>`;
  return { html, tips };
}

// Ranked horizontal bars (HTML). rows: [{ name, total, share, other? }]
export function rankedBars({ rows, fmtMoney }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  const tips = [];
  const html = rows
    .map((r, i) => {
      const value = fmtMoney(r.total);
      const pct = `${Math.round(r.share * 100)}%`;
      tips.push({ title: r.name, rows: [{ cls: r.other ? 'other' : 's1', color: r.color, name: `${pct} of spending`, value }] });
      return `<div class="rb" data-i="${i}" tabindex="0" role="img" aria-label="${esc(`${r.name}: ${value}, ${pct}`)}">
        <span class="rb-name">${esc(r.name)}</span>
        <span class="rb-track"><span class="rb-bar ${r.other ? 'other' : r.color ? 'cc' : 's1'}" style="--p:${(r.total / max).toFixed(4)}${r.color ? `;--c:${esc(r.color)}` : ''}"></span><span class="rb-val">${esc(value)}</span></span>
      </div>`;
    })
    .join('');
  return { html, tips };
}

// ---------- tooltip ----------

let tipEl = null;

export function hideTip() {
  if (tipEl) tipEl.hidden = true;
}

function place(x, y) {
  const w = tipEl.offsetWidth;
  const h = tipEl.offsetHeight;
  let left = x + 14;
  if (left + w > window.innerWidth - 8) left = x - w - 14;
  left = Math.max(8, left);
  let top = y - h - 12;
  if (top < 8) top = y + 18;
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${top}px`;
}

function show(tip, x, y) {
  tipEl.replaceChildren();
  const title = document.createElement('div');
  title.className = 'tip-title';
  title.textContent = tip.title;
  tipEl.append(title);
  for (const r of tip.rows) {
    const row = document.createElement('div');
    row.className = 'tip-row';
    const key = document.createElement('span');
    key.className = `tip-key ${r.cls || ''}`;
    if (r.color) key.style.background = r.color;
    const val = document.createElement('strong');
    val.textContent = r.value;
    const nm = document.createElement('span');
    nm.className = 'tip-name';
    nm.textContent = r.name;
    row.append(key, val, nm);
    tipEl.append(row);
  }
  tipEl.hidden = false;
  place(x, y);
}

// Wire hover, touch and keyboard focus for every [data-i] element inside root.
export function attachTips(root, tips, el) {
  tipEl = el;
  root.querySelectorAll('[data-i]').forEach((node) => {
    const tip = tips[Number(node.dataset.i)];
    if (!tip) return;
    node.addEventListener('pointerenter', (e) => show(tip, e.clientX, e.clientY));
    node.addEventListener('pointermove', (e) => show(tip, e.clientX, e.clientY));
    node.addEventListener('pointerdown', (e) => show(tip, e.clientX, e.clientY));
    node.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'touch') hideTip();
    });
    node.addEventListener('focus', () => {
      const r = node.getBoundingClientRect();
      show(tip, r.left + r.width / 2, r.top + Math.min(40, r.height / 2));
    });
    node.addEventListener('blur', hideTip);
  });
}

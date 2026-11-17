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
  const every = slot < 38 ? 2 : 1;
  const n = labels.length;
  return labels
    .map((l, i) =>
      (n - 1 - i) % every === 0
        ? `<text class="tick" x="${(left + (i + 0.5) * slot).toFixed(1)}" y="${height - 8}" text-anchor="middle">${esc(l)}</text>`
        : '',
    )
    .join('');
}

// Grouped columns. months: [{ label, title, values: [..one per series] }] (values in minor units)
export function columnChart({ width, height = 240, months, series, fmtMoney, ariaLabel }) {
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
  const barW = Math.min(24, Math.max(4, (slot * 0.72 - gap * (k - 1)) / k));
  const groupW = barW * k + gap * (k - 1);

  const tips = [];
  let bars = '';
  months.forEach((m, i) => {
    const gx = left + i * slot + (slot - groupW) / 2;
    let g = '';
    m.values.forEach((v, j) => {
      if (v <= 0) return;
      const h = Math.max(2, (v / 100 / hi) * ph);
      g += `<path class="bar ${series[j].cls}" d="${topRounded(gx + j * (barW + gap), top + ph - h, barW, h, 4)}"/>`;
    });
    const label = `${m.title}: ${series.map((s, j) => `${s.name} ${fmtMoney(m.values[j])}`).join(', ')}`;
    tips.push({ title: m.title, rows: series.map((s, j) => ({ cls: s.cls, name: s.name, value: fmtMoney(m.values[j]) })) });
    bars += `<g class="grp">${g}<rect class="hit" data-i="${i}" tabindex="0" role="img" aria-label="${esc(label)}" x="${(left + i * slot).toFixed(1)}" y="${top}" width="${slot.toFixed(1)}" height="${ph}"/></g>`;
  });

  const html = `<svg class="chart-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(ariaLabel)}">${grid}${bars}${xLabels(months.map((m) => m.label), left, slot, height)}</svg>`;
  return { html, tips };
}

// One line (running balance). months: [{ label, title, value }] (minor units). May go negative.
export function lineChart({ width, height = 240, months, name, fmtMoney, ariaLabel }) {
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
  const line = pts.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${yy.toFixed(1)}`).join('');
  const area = `${line}L${pts[n - 1][0].toFixed(1)},${y0.toFixed(1)}L${pts[0][0].toFixed(1)},${y0.toFixed(1)}Z`;

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

  const html = `<svg class="chart-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(ariaLabel)}">${grid}<path class="area s1" d="${area}"/><path class="line s1" d="${line}"/>${dots}${endLabel}${xLabels(months.map((m) => m.label), left, slot, height)}${hits}</svg>`;
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
      tips.push({ title: r.name, rows: [{ cls: r.other ? 'other' : 's1', name: `${pct} of spending`, value }] });
      return `<div class="rb" data-i="${i}" tabindex="0" role="img" aria-label="${esc(`${r.name}: ${value}, ${pct}`)}">
        <span class="rb-name">${esc(r.name)}</span>
        <span class="rb-track"><span class="rb-bar ${r.other ? 'other' : 's1'}" style="--p:${(r.total / max).toFixed(4)}"></span><span class="rb-val">${esc(value)}</span></span>
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

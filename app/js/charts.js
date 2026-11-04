// Small dependency-free SVG charts: a daily line chart with optional
// uncertainty band and crosshair tooltip, and a vertical bar chart.
import { dayToDate } from './stats.js';

const NS = 'http://www.w3.org/2000/svg';
const DAY = 86400000;

function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

export function niceTicks(min, max, count = 5) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { lo, hi, ticks };
}

const fmtDay = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function observe(el, draw) {
  if (el._ro) el._ro.disconnect();
  let w = 0;
  el._ro = new ResizeObserver(() => {
    if (el.clientWidth !== w) { w = el.clientWidth; draw(); }
  });
  el._ro.observe(el);
  draw();
}

function tooltipEl(el) {
  let tip = el.querySelector('.chart-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.setAttribute('role', 'status');
    el.appendChild(tip);
  }
  tip.hidden = true;
  return tip;
}

function placeTip(el, tip, x, y) {
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight, W = el.clientWidth;
  let left = x + 14;
  if (left + w > W - 4) left = x - w - 14;
  tip.style.left = `${Math.max(4, left)}px`;
  tip.style.top = `${Math.max(0, y - h / 2)}px`;
}

/**
 * series: [{ name, color, points: [{ day, y, lo?, hi? }] }]
 * opts: { height, yFormat, tooltip(day) -> html, directLabels }
 */
export function lineChart(el, series, opts = {}) {
  const height = opts.height || 260;
  const yFormat = opts.yFormat || ((v) => String(v));
  el.classList.add('chart');
  const draw = () => {
    el.querySelector('svg')?.remove();
    const tip = tooltipEl(el);
    const W = el.clientWidth || 600;
    const label = opts.directLabels !== false && series.length <= 4;
    const m = { l: 44, r: label ? 76 : 16, t: 14, b: 30 };
    const iw = W - m.l - m.r, ih = height - m.t - m.b;
    const svg = svgEl('svg', { width: W, height, viewBox: `0 0 ${W} ${height}`, role: 'img', 'aria-label': opts.ariaLabel || 'Line chart' });
    el.insertBefore(svg, el.firstChild);

    const days = [...new Set(series.flatMap((s) => s.points.map((p) => p.day)))].sort();
    if (!days.length) return;
    let x0 = dayToDate(days[0]).getTime(), x1 = dayToDate(days[days.length - 1]).getTime();
    if (x0 === x1) { x0 -= DAY; x1 += DAY; }
    const pad = (x1 - x0) * 0.03;
    x0 -= pad; x1 += pad;
    const xs = (t) => m.l + ((t - x0) / (x1 - x0)) * iw;
    const vals = series.flatMap((s) => s.points.flatMap((p) => [p.y, p.lo, p.hi])).filter((v) => v != null && isFinite(v));
    let ymin = Math.min(...vals), ymax = Math.max(...vals);
    if (opts.yZero) ymin = Math.min(0, ymin);
    const { lo, hi, ticks } = niceTicks(ymin, ymax, 5);
    const ys = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;

    // grid + y axis
    const g = svgEl('g', { class: 'axis' }, svg);
    for (const t of ticks) {
      svgEl('line', { x1: m.l, x2: m.l + iw, y1: ys(t), y2: ys(t), class: t === lo ? 'baseline' : 'grid' }, g);
      svgEl('text', { x: m.l - 8, y: ys(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, g).textContent = yFormat(t);
    }
    // x ticks
    const spanDays = (x1 - x0) / DAY;
    const stepDays = [1, 2, 7, 14, 30, 61, 91, 182, 365].find((s) => spanDays / s <= Math.max(2, Math.floor(iw / 90))) || 365;
    const first = dayToDate(days[0]);
    for (let t = first.getTime(); t <= x1; t += stepDays * DAY) {
      if (t < x0) continue;
      const x = xs(t);
      svgEl('line', { x1: x, x2: x, y1: m.t + ih, y2: m.t + ih + 4, class: 'tick' }, g);
      svgEl('text', { x, y: m.t + ih + 18, 'text-anchor': 'middle' }, g).textContent = fmtDay(new Date(t));
    }

    // bands, lines, markers
    const markerSets = [];
    series.forEach((s) => {
      const pts = s.points.filter((p) => p.y != null).map((p) => ({ ...p, x: xs(dayToDate(p.day).getTime()) }));
      // ±1 SE as error bars per day (a filled band would imply values between days)
      const band = pts.filter((p) => p.lo != null && p.hi != null);
      for (const p of band) {
        svgEl('line', { x1: p.x, x2: p.x, y1: ys(p.lo), y2: ys(p.hi), class: 'whisker', style: `stroke:${s.color}` }, svg);
        for (const yv of [p.lo, p.hi]) svgEl('line', { x1: p.x - 3, x2: p.x + 3, y1: ys(yv), y2: ys(yv), class: 'whisker', style: `stroke:${s.color}` }, svg);
      }
      if (pts.length > 1) {
        svgEl('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${ys(p.y)}`).join(''), class: 'line', style: `stroke:${s.color}` }, svg);
      }
      const mg = svgEl('g', {}, svg);
      const map = new Map();
      if (pts.length <= 90) {
        for (const p of pts) map.set(p.day, svgEl('circle', { cx: p.x, cy: ys(p.y), r: 4, class: 'dot', style: `fill:${s.color}` }, mg));
      }
      markerSets.push(map);
      if (label && pts.length) {
        const last = pts[pts.length - 1];
        svgEl('text', { x: last.x + 10, y: ys(last.y), class: 'direct-label', 'dominant-baseline': 'middle' }, svg).textContent = s.name;
      }
    });
    // de-collide direct labels
    const labels = [...svg.querySelectorAll('.direct-label')];
    labels.sort((a, b) => +a.getAttribute('y') - +b.getAttribute('y'));
    for (let i = 1; i < labels.length; i++) {
      const prev = +labels[i - 1].getAttribute('y'), cur = +labels[i].getAttribute('y');
      if (cur - prev < 14) labels[i].setAttribute('y', prev + 14);
    }

    // hover layer
    const cross = svgEl('line', { y1: m.t, y2: m.t + ih, class: 'crosshair', visibility: 'hidden' }, svg);
    const hit = svgEl('rect', { x: m.l, y: m.t, width: iw, height: ih, class: 'hit' }, svg);
    const dayX = days.map((d) => [d, xs(dayToDate(d).getTime())]);
    const clear = () => {
      cross.setAttribute('visibility', 'hidden');
      tip.hidden = true;
      markerSets.forEach((mp) => mp.forEach((c) => c.classList.remove('active')));
    };
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const px = e.clientX - r.left;
      let best = dayX[0];
      for (const dx of dayX) if (Math.abs(dx[1] - px) < Math.abs(best[1] - px)) best = dx;
      cross.setAttribute('x1', best[1]);
      cross.setAttribute('x2', best[1]);
      cross.setAttribute('visibility', 'visible');
      markerSets.forEach((mp) => mp.forEach((c, d) => c.classList.toggle('active', d === best[0])));
      tip.innerHTML = opts.tooltip ? opts.tooltip(best[0]) : best[0];
      placeTip(el, tip, best[1], e.clientY - r.top);
    });
    hit.addEventListener('pointerleave', clear);
  };
  observe(el, draw);
}

/** bars: [{ label, value, faded, tip }] with value in [0, 1] */
export function barChart(el, bars, opts = {}) {
  const height = opts.height || 220;
  el.classList.add('chart');
  const draw = () => {
    el.querySelector('svg')?.remove();
    const tip = tooltipEl(el);
    const W = el.clientWidth || 600;
    const m = { l: 44, r: 12, t: 12, b: 30 };
    const iw = W - m.l - m.r, ih = height - m.t - m.b;
    const svg = svgEl('svg', { width: W, height, viewBox: `0 0 ${W} ${height}`, role: 'img', 'aria-label': opts.ariaLabel || 'Bar chart' });
    el.insertBefore(svg, el.firstChild);
    const ys = (v) => m.t + ih - v * ih;
    const g = svgEl('g', { class: 'axis' }, svg);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      svgEl('line', { x1: m.l, x2: m.l + iw, y1: ys(t), y2: ys(t), class: t === 0 ? 'baseline' : 'grid' }, g);
      svgEl('text', { x: m.l - 8, y: ys(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, g).textContent = `${t * 100}%`;
    }
    if (!bars.length) return;
    const slot = iw / bars.length;
    const bw = Math.max(3, Math.min(36, slot - 2));
    const every = Math.ceil(bars.length / Math.max(1, Math.floor(iw / 44)));
    bars.forEach((b, i) => {
      const x = m.l + i * slot + (slot - bw) / 2;
      const h = Math.max(0, ih - (ys(b.value) - m.t));
      const r = Math.min(4, bw / 2, h);
      const top = ys(b.value);
      // rounded data-end at the top, square at the baseline
      const d = `M${x},${m.t + ih}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${m.t + ih}Z`;
      svgEl('path', { d, class: `bar${b.faded ? ' faded' : ''}` }, svg);
      if (i % every === 0) svgEl('text', { x: x + bw / 2, y: m.t + ih + 18, 'text-anchor': 'middle', class: 'axis-label' }, g).textContent = b.label;
      const hit = svgEl('rect', { x: m.l + i * slot, y: m.t, width: slot, height: ih, class: 'hit' }, svg);
      hit.addEventListener('pointermove', (e) => {
        const rr = svg.getBoundingClientRect();
        tip.innerHTML = b.tip;
        placeTip(el, tip, x + bw / 2, e.clientY - rr.top);
      });
      hit.addEventListener('pointerleave', () => { tip.hidden = true; });
    });
  };
  observe(el, draw);
}

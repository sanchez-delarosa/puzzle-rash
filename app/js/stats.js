// Progress statistics computed from saved runs.

const pad = (n) => String(n).padStart(2, '0');

// Calendar day in the browser's local time zone, e.g. "2026-10-30".
export function dayKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function filterRuns(runs, { mode = 'all', fromDay = null } = {}) {
  return runs.filter((r) => (mode === 'all' || r.mode === mode) && (!fromDay || r.day >= fromDay));
}

function groupByDay(runs) {
  const map = new Map();
  for (const r of runs) {
    if (!map.has(r.day)) map.set(r.day, []);
    map.get(r.day).push(r);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// Daily max and mean score with the standard error of the mean.
export function dailyScores(runs) {
  return groupByDay(runs).map(([day, rs]) => {
    const s = rs.map((r) => r.score);
    const n = s.length;
    const mean = s.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
    return { day, n, max: Math.max(...s), mean, se: sd == null ? null : sd / Math.sqrt(n) };
  });
}

const K = Math.LN10 / 400;

// Performance rating from solved/missed puzzles of known rating.
// Model: P(solve) = 1 / (1 + 10^((r - R)/400)), i.e. Elo's logistic curve.
// MAP estimate with a weak normal prior N(mu0, priorSd^2) so that all-solved or
// all-missed days still give a finite number; se is the Laplace (curvature) approximation.
export function performanceRating(attempts, { priorSd = 400 } = {}) {
  const xs = attempts.filter((a) => a.ok === true || a.ok === false);
  if (!xs.length) return null;
  const mu0 = xs.reduce((s, a) => s + a.r, 0) / xs.length;
  const tau = 1 / priorSd ** 2;
  let R = mu0;
  let H = -tau;
  for (let it = 0; it < 50; it++) {
    let g = -(R - mu0) * tau;
    H = -tau;
    for (const a of xs) {
      const p = 1 / (1 + Math.exp(-K * (R - a.r)));
      g += K * ((a.ok ? 1 : 0) - p);
      H -= K * K * p * (1 - p);
    }
    const step = -g / H;
    R += Math.max(-400, Math.min(400, step));
    if (Math.abs(step) < 0.01) break;
  }
  return { R, se: 1 / Math.sqrt(-H), n: xs.length, solved: xs.filter((a) => a.ok).length };
}

export function dailyPerformance(runs) {
  return groupByDay(runs)
    .map(([day, rs]) => ({ day, ...performanceRating(rs.flatMap((r) => r.attempts || [])) }))
    .filter((d) => d.R != null);
}

export function accuracyByBand(runs, size = 100) {
  const map = new Map();
  for (const a of runs.flatMap((r) => r.attempts || [])) {
    const lo = Math.floor(a.r / size) * size;
    const e = map.get(lo) || { lo, n: 0, ok: 0 };
    e.n++;
    if (a.ok) e.ok++;
    map.set(lo, e);
  }
  return [...map.values()].sort((a, b) => a.lo - b.lo).map((e) => ({ ...e, acc: e.ok / e.n }));
}

// Themes that describe length or source rather than a tactic.
const META_THEMES = new Set(['short', 'long', 'veryLong', 'oneMove', 'master', 'masterVsMaster', 'superGM', 'crushing', 'advantage', 'equality']);

export function themeStats(runs, minN = 5) {
  const map = new Map();
  for (const a of runs.flatMap((r) => r.attempts || [])) {
    for (const t of a.th || []) {
      if (META_THEMES.has(t)) continue;
      const e = map.get(t) || { theme: t, n: 0, ok: 0, rSum: 0 };
      e.n++;
      e.rSum += a.r;
      if (a.ok) e.ok++;
      map.set(t, e);
    }
  }
  return [...map.values()]
    .filter((e) => e.n >= minN)
    .map((e) => ({ theme: e.theme, n: e.n, acc: e.ok / e.n, avgR: e.rSum / e.n }))
    .sort((a, b) => a.acc - b.acc || b.n - a.n);
}

export function themeLabel(t) {
  const m = t.match(/^mateIn(\d)$/);
  if (m) return `Mate in ${m[1]}`;
  const s = t.replace(/([A-Z])/g, ' $1').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function bestScore(runs, mode, day = null) {
  const s = runs.filter((r) => r.mode === mode && (!day || r.day === day)).map((r) => r.score);
  return s.length ? Math.max(...s) : null;
}

// ---- CSV export ---------------------------------------------------------
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

export function runsCsv(runs) {
  const rows = [['run_id', 'day', 'started_at', 'mode', 'score', 'strikes', 'end_reason', 'duration_s', 'time_left_s', 'puzzles_attempted', 'start_rating', 'step']];
  for (const r of runs) {
    rows.push([r.id, r.day, r.startedAt, r.mode, r.score, r.strikes, r.endReason, (r.durationMs / 1000).toFixed(1), r.timeLeftMs == null ? '' : (r.timeLeftMs / 1000).toFixed(1), (r.attempts || []).length, r.startRating, r.step]);
  }
  return toCsv(rows);
}

export function attemptsCsv(runs) {
  const rows = [['run_id', 'day', 'mode', 'index', 'puzzle_id', 'puzzle_rating', 'solved', 'time_s', 'themes']];
  for (const r of runs) {
    (r.attempts || []).forEach((a, i) => rows.push([r.id, r.day, r.mode, i + 1, a.id, a.r, a.ok ? 1 : 0, (a.ms / 1000).toFixed(2), (a.th || []).join(' ')]));
  }
  return toCsv(rows);
}

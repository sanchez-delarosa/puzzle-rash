import { Board } from './board.js';
import { Position } from './chess.js';
import { PuzzlePool, Rush, MODES } from './rush.js';
import { Store } from './store.js';
import {
  dayKey, dayToDate, filterRuns, dailyScores, dailyPerformance, performanceRating,
  accuracyByBand, themeStats, themeLabel, bestScore, runsCsv, attemptsCsv,
} from './stats.js';
import { lineChart, barChart } from './charts.js';
import { pieceSvg } from './pieces.js';
import { play, configure as configureSound } from './sounds.js';

const A = window.PR_APPEARANCE;

const $ = (s) => document.querySelector(s);
const DEFAULTS = { startRating: 600, step: 40, showSolution: true, avoidRecent: true, countdown: true };
const REASONS = { time: "Time's up", strikes: 'Three misses', stopped: 'You ended the run', 'out-of-puzzles': 'No puzzles left at this level' };
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const store = new Store();
let settings = { ...DEFAULTS };
let pool = null;
let puzzleMeta = null;
let rush = null;
let timer = null;

const board = new Board($('#board'));
board.setPosition(new Position(START_FEN));

// ---- helpers --------------------------------------------------------------
const fmtClock = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const fmtElapsed = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const fmtDayLong = (key) => dayToDate(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const round = (v) => Math.round(v);
// Time actually spent in runs, e.g. "42 min" or "3 h 05 min".
const fmtDuration = (ms) => {
  const totalMin = Math.round((ms || 0) / 60000);
  if (ms > 0 && ms < 60000) return `${Math.round(ms / 1000)} s`;
  if (totalMin < 60) return `${totalMin} min`;
  return `${Math.floor(totalMin / 60)} h ${String(totalMin % 60).padStart(2, '0')} min`;
};
const playedMs = (runs) => runs.reduce((t, r) => t + (r.durationMs || 0), 0);

function setSaveState(text) {
  $('#saveState').textContent = text;
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- views ----------------------------------------------------------------
function showView(name) {
  if (rush && !rush.ended && name !== 'train') return;
  document.querySelectorAll('.tab').forEach((t) => {
    if (t.dataset.view === name) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  for (const v of ['train', 'progress', 'settings']) $(`#view-${v}`).hidden = v !== name;
  if (name === 'progress') renderProgress();
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

function showPanel(name) {
  for (const p of ['setup', 'live', 'result']) $(`#panel-${p}`).hidden = p !== name;
}

// ---- setup panel ----------------------------------------------------------
const selectedMode = () => document.querySelector('input[name="mode"]:checked').value;

function renderSetup() {
  const today = dayKey(new Date());
  document.querySelectorAll('[data-best]').forEach((el) => {
    const m = el.dataset.best;
    const ever = bestScore(store.runs, m);
    const t = bestScore(store.runs, m, today);
    el.textContent = ever == null ? 'No runs yet' : `Best ${ever}${t != null ? `, today ${t}` : ''}`;
  });
  $('#startBtn').textContent = `Start ${MODES[selectedMode()].label} run`;
  $('#ladderNote').textContent = `Puzzles start at ${settings.startRating} and get ${settings.step} points harder each time. Three misses end any run.`;
}
document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', renderSetup));

// ---- live run -------------------------------------------------------------
function recentIds() {
  if (!settings.avoidRecent) return new Set();
  const ids = [];
  for (let i = store.runs.length - 1; i >= 0 && ids.length < 500; i--) {
    const at = store.runs[i].attempts || [];
    for (let j = at.length - 1; j >= 0 && ids.length < 500; j--) ids.push(at[j].id);
  }
  return new Set(ids);
}

// ---- 3, 2, 1, Go ------------------------------------------------------------
// Shown over the board before a run. The clock doesn't run until "Go".
const COUNT_STEP_MS = 800;
const GO_MS = 600;
let countdown = null; // { cancel } while 3, 2, 1 is showing
let goFadeTimer = null; // only fades the "Go!" label; the run is already live

function runCountdown() {
  return new Promise((resolve) => {
    const el = $('#countdown');
    const num = el.querySelector('.count-num');
    const steps = ['3', '2', '1', 'Go!'];
    let i = 0;
    let timerId = null;
    clearTimeout(goFadeTimer);
    el.classList.remove('go');
    countdown = {
      cancel: () => {
        clearTimeout(timerId);
        el.hidden = true;
        countdown = null;
        resolve(false);
      },
    };
    const step = () => {
      const label = steps[i];
      num.textContent = label;
      num.classList.remove('pop');
      void num.offsetWidth; // restart the animation
      num.classList.add('pop');
      if (label === 'Go!') {
        // the countdown is over now; the label just fades over the first puzzle
        countdown = null;
        el.classList.add('go');
        goFadeTimer = setTimeout(() => { el.hidden = true; el.classList.remove('go'); }, GO_MS);
        resolve(true);
        return;
      }
      play('count');
      i++;
      timerId = setTimeout(step, COUNT_STEP_MS);
    };
    el.hidden = false;
    step();
  });
}

async function startRun(mode = selectedMode()) {
  if (!pool || countdown) return;
  rush = new Rush({
    board, pool, mode, settings, recent: recentIds(),
    onUpdate: renderLive,
    onEnd: finishRun,
  });
  showPanel('live');
  $('#tiles').innerHTML = '';
  $('#toMove').textContent = 'Get ready';
  board.resetInput();
  board.clearHint();
  const limit = MODES[mode].timeMs;
  $('#clock').textContent = limit == null ? '0:00' : fmtClock(limit);
  $('#clock').classList.remove('low');
  renderLive();
  document.body.classList.add('running');
  if (settings.countdown !== false) {
    const go = await runCountdown();
    if (!go) { // cancelled with End run or Esc: back to the mode picker, nothing saved
      rush = null;
      document.body.classList.remove('running');
      renderSetup();
      showPanel('setup');
      return;
    }
  }
  rush.start();
  renderLive();
  clearInterval(timer);
  timer = setInterval(() => {
    rush.tick();
    renderClock();
  }, 100);
}

function renderClock() {
  if (!rush || rush.t0 == null) return; // not started yet (countdown)
  const rem = rush.remainingMs();
  const clock = $('#clock');
  if (rem == null) {
    clock.textContent = fmtElapsed(rush.elapsedMs());
    clock.classList.remove('low');
  } else {
    clock.textContent = fmtClock(rem);
    clock.classList.toggle('low', rem <= 20000);
    if (rem <= 10000 && rem > 0 && !rush.ended && !rush.lowTimeWarned) {
      rush.lowTimeWarned = true;
      play('lowtime');
    }
  }
}

function renderLive() {
  if (!rush) return;
  $('#score').textContent = rush.score;
  document.querySelectorAll('#strikes .strike').forEach((s, i) => s.classList.toggle('on', i < rush.strikes));
  const color = rush.playerColor;
  if (color && rush.puzzle) {
    $('#toMove').innerHTML = `<span class="chip ${color}"></span>${color === 'w' ? 'White' : 'Black'} to move. Puzzle ${rush.attempts.length + (rush.ended ? 0 : 1)}, rated ${rush.puzzle.rating}`;
  }
  const tiles = $('#tiles');
  tiles.innerHTML = rush.attempts.map((a) => `<li class="${a.ok ? 'ok' : 'miss'}" title="Puzzle rated ${a.r}">${a.r}</li>`).join('') +
    (!rush.ended && rush.puzzle ? `<li class="current" title="Current puzzle">${rush.puzzle.rating}</li>` : '');
  tiles.scrollTop = tiles.scrollHeight;
  renderClock();
}

async function finishRun(run) {
  clearInterval(timer);
  document.body.classList.remove('running');
  renderLive();
  const prevBest = bestScore(store.runs, run.mode);
  const status = await store.addRun(run);
  setSaveState({
    saved: 'Saved to data/history.json',
    queued: "Couldn't reach the server; run kept in this browser and sent next time",
    local: 'Saved in this browser only',
  }[status]);
  renderResult(run, prevBest);
  showPanel('result');
}

function renderResult(run, prevBest) {
  $('#resultReason').textContent = `${MODES[run.mode].label}: ${REASONS[run.endReason] || 'Run over'}`;
  $('#resultScore').textContent = run.score;
  const best = $('#resultBest');
  const isNew = run.endReason !== 'stopped' && run.score > 0 && (prevBest == null || run.score > prevBest);
  best.classList.toggle('new', isNew);
  best.textContent = isNew ? `New best for ${MODES[run.mode].label}` : prevBest != null ? `Your best: ${prevBest}` : '';
  const att = run.attempts;
  const solved = att.filter((a) => a.ok);
  const perf = performanceRating(att);
  // time left on the clock (3/5 min), or how long the run lasted (Survival)
  const limit = MODES[run.mode].timeMs;
  const left = run.timeLeftMs ?? (limit == null ? null : Math.max(0, limit - (run.durationMs || 0)));
  const clockStat = limit == null
    ? ['Run time', fmtElapsed(run.durationMs || 0)]
    : ['Time left', run.endReason === 'time' ? '0:00' : fmtClock(left)];
  const avgMs = att.length ? att.reduce((t, a) => t + (a.ms || 0), 0) / att.length : null;
  const stats = [
    clockStat,
    ['Avg per puzzle', avgMs == null ? '–' : `${(avgMs / 1000).toFixed(1)} s`],
    ['Puzzles tried', att.length],
    ['Accuracy', att.length ? `${round((solved.length / att.length) * 100)}%` : '–'],
    ['Hardest solved', solved.length ? Math.max(...solved.map((a) => a.r)) : '–'],
    ['Performance', perf ? round(perf.R) : '–'],
  ];
  $('#resultStats').innerHTML = stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('#review').innerHTML = att.map((a, i) => `
    <li class="${a.ok ? 'ok' : 'miss'}">
      <span class="mark" aria-label="${a.ok ? 'Solved' : 'Missed'}">${a.ok ? '✓' : '✕'}</span>
      <span class="r">${a.r}</span>
      <span class="sol">${(a.ms / 1000).toFixed(1)} s${a.sol ? `, answer ${esc(a.sol)}` : ''}</span>
      <a href="https://lichess.org/training/${encodeURIComponent(a.id)}" target="_blank" rel="noopener">Open #${i + 1}</a>
    </li>`).join('') || '<li class="none">No puzzles finished.</li>';
}

$('#startBtn').addEventListener('click', () => startRun());
$('#againBtn').addEventListener('click', () => startRun(rush ? rush.mode : selectedMode()));
$('#changeModeBtn').addEventListener('click', () => { renderSetup(); showPanel('setup'); });
$('#endBtn').addEventListener('click', () => {
  if (countdown) countdown.cancel();
  else if (rush) rush.end('stopped');
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && countdown) countdown.cancel(); });
$('#toProgressBtn').addEventListener('click', () => {
  document.querySelector(`#pMode [data-v="${rush ? rush.mode : '5min'}"]`)?.click();
  showView('progress');
});
window.addEventListener('beforeunload', (e) => {
  if (rush && !rush.ended) { e.preventDefault(); e.returnValue = ''; }
});

// ---- progress -------------------------------------------------------------
const progress = { mode: '5min', range: '30' };

function setupSeg(id, key) {
  const seg = $(id);
  seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    progress[key] = b.dataset.v;
    renderProgress();
  }));
}
setupSeg('#pMode', 'mode');
setupSeg('#pRange', 'range');

function fromDayFor(range) {
  if (range === 'all') return null;
  const d = new Date();
  d.setDate(d.getDate() - (Number(range) - 1));
  return dayKey(d);
}

function renderProgress() {
  if ($('#view-progress').hidden) return;
  const fromDay = fromDayFor(progress.range);
  const runs = filterRuns(store.runs, { mode: progress.mode, fromDay });
  const scored = runs.filter((r) => r.endReason !== 'stopped');
  const empty = $('#progressEmpty');
  if (!runs.length) {
    empty.hidden = false;
    empty.textContent = store.runs.some((r) => r.mode === progress.mode)
      ? `No ${MODES[progress.mode].label} runs in this range. Pick a longer range or play a run.`
      : `No ${MODES[progress.mode].label} runs yet. Finish one and your progress shows up here.`;
    $('#progressBody').hidden = true;
    return;
  }
  empty.hidden = true;
  $('#progressBody').hidden = false;

  const scores = dailyScores(scored);
  const perfDays = dailyPerformance(runs);
  const attempts = runs.flatMap((r) => r.attempts || []);
  const perfAll = performanceRating(attempts);
  const best = scored.length ? Math.max(...scored.map((r) => r.score)) : null;
  const avg = scored.length ? scored.reduce((s, r) => s + r.score, 0) / scored.length : null;
  const solved = attempts.filter((a) => a.ok).length;
  const days = new Set(runs.map((r) => r.day)).size;
  const timeHere = playedMs(runs);
  const timeAll = playedMs(store.runs);
  const timeByDay = new Map();
  for (const r of runs) timeByDay.set(r.day, (timeByDay.get(r.day) || 0) + (r.durationMs || 0));

  $('#statTiles').innerHTML = [
    ['Best score', best ?? '–', best != null ? fmtDayLong(scored.find((r) => r.score === best).day) : ''],
    ['Average score', avg != null ? avg.toFixed(1) : '–', `${scored.length} run${scored.length === 1 ? '' : 's'} on ${days} day${days === 1 ? '' : 's'}`],
    ['Performance rating', perfAll ? round(perfAll.R) : '–', perfAll ? `±${round(perfAll.se)} over this range` : ''],
    ['Puzzles solved', solved, attempts.length ? `${round((solved / attempts.length) * 100)}% of ${attempts.length}` : ''],
    ['Time played', fmtDuration(timeHere), `All modes, all time: ${fmtDuration(timeAll)}`],
  ].map(([k, v, d]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('');

  // daily score chart
  const scoreByDay = new Map(scores.map((s) => [s.day, s]));
  const scoresEl = $('#chartScores');
  if (scores.length) {
    scoresEl.querySelector('.chart-empty')?.remove();
    lineChart(scoresEl, [
      { name: 'Best', color: 'var(--series-1)', points: scores.map((s) => ({ day: s.day, y: s.max })) },
      { name: 'Average', color: 'var(--series-2)', points: scores.map((s) => ({ day: s.day, y: s.mean, lo: s.se != null ? s.mean - s.se : null, hi: s.se != null ? s.mean + s.se : null })) },
    ], {
      yZero: true,
      ariaLabel: 'Best and average score per day',
      yFormat: (v) => String(v),
      tooltip: (day) => {
        const s = scoreByDay.get(day);
        if (!s) return fmtDayLong(day);
        return `<b>${fmtDayLong(day)}</b><br>${s.n} run${s.n === 1 ? '' : 's'}, ${fmtDuration(timeByDay.get(day))} played<br>` +
          `<span class="sw" style="background:var(--series-1)"></span>Best ${s.max}<br>` +
          `<span class="sw" style="background:var(--series-2)"></span>Average ${s.mean.toFixed(1)}${s.se != null ? ` ± ${s.se.toFixed(1)}` : ''}`;
      },
    });
  } else {
    scoresEl.innerHTML = '<p class="chart-empty">Only ended-early runs in this range; they don\'t count toward scores.</p>';
  }

  // performance chart
  const perfByDay = new Map(perfDays.map((p) => [p.day, p]));
  lineChart($('#chartPerf'), [
    { name: 'Rating', color: 'var(--series-1)', points: perfDays.map((p) => ({ day: p.day, y: p.R, lo: p.R - p.se, hi: p.R + p.se })) },
  ], {
    directLabels: false,
    ariaLabel: 'Performance rating per day',
    yFormat: (v) => String(round(v)),
    tooltip: (day) => {
      const p = perfByDay.get(day);
      return p ? `<b>${fmtDayLong(day)}</b><br>Rating ${round(p.R)} ± ${round(p.se)}<br>${p.solved} of ${p.n} solved` : fmtDayLong(day);
    },
  });

  // accuracy by band
  const bands = accuracyByBand(runs, 100);
  barChart($('#chartBands'), bands.map((b) => ({
    label: String(b.lo), value: b.acc, faded: b.n < 10,
    tip: `<b>${b.lo}–${b.lo + 99}</b><br>${b.ok} of ${b.n} solved (${round(b.acc * 100)}%)`,
  })), { ariaLabel: 'Share of puzzles solved by puzzle rating' });

  // themes
  const themes = themeStats(runs, 5).slice(0, 12);
  $('#themes tbody').innerHTML = themes.length ? themes.map((t) => `
    <tr><td>${esc(themeLabel(t.theme))}</td>
    <td><div class="acc-cell"><span>${round(t.acc * 100)}%</span><div class="acc-bar"><span style="width:${t.acc * 100}%"></span></div></div></td>
    <td class="num">${t.n}</td><td class="num">${round(t.avgR)}</td></tr>`).join('')
    : '<tr><td colspan="4">Not enough attempts yet.</td></tr>';

  // table view
  const allDays = [...timeByDay.keys()].sort().reverse();
  $('#dailyTable tbody').innerHTML = allDays.map((d) => {
    const s = scoreByDay.get(d), p = perfByDay.get(d);
    return `<tr><td>${fmtDayLong(d)}</td><td class="num">${fmtDuration(timeByDay.get(d))}</td><td class="num">${s ? s.n : '–'}</td><td class="num">${s ? s.max : '–'}</td>
      <td class="num">${s ? s.mean.toFixed(1) : '–'}</td><td class="num">${s && s.se != null ? s.se.toFixed(1) : '–'}</td>
      <td class="num">${p ? round(p.R) : '–'}</td><td class="num">${p ? round(p.se) : '–'}</td></tr>`;
  }).join('');
}

$('#exportRuns').addEventListener('click', () => download(`puzzle-rush-runs-${dayKey(new Date())}.csv`, runsCsv(store.runs), 'text/csv'));
$('#exportAttempts').addEventListener('click', () => download(`puzzle-rush-puzzles-${dayKey(new Date())}.csv`, attemptsCsv(store.runs), 'text/csv'));
$('#exportJson').addEventListener('click', () => download(`puzzle-rush-backup-${dayKey(new Date())}.json`, JSON.stringify(store.data, null, 1), 'application/json'));

// ---- settings -------------------------------------------------------------
const form = $('#settingsForm');
function fillSettings() {
  form.startRating.value = settings.startRating;
  form.step.value = settings.step;
  form.showSolution.checked = settings.showSolution;
  form.avoidRecent.checked = settings.avoidRecent;
  form.countdown.checked = settings.countdown !== false;
  $('#storageNote').textContent = store.mode === 'server'
    ? 'Your history is saved to data/history.json in the project folder, with a dated copy in data/backups/ each day you play.'
    : 'The local server isn\'t running, so history is saved in this browser only. Start the app with start.bat or python serve.py to save it to a file.';
  if (puzzleMeta) {
    $('#puzzleNote').textContent = `${pool.size.toLocaleString()} puzzles from the Lichess database, built ${puzzleMeta.built}. Kept only puzzles with rating deviation ≤ ${puzzleMeta.filters.maxRatingDeviation} and at least ${puzzleMeta.filters.minPlays} plays.`;
  }
}
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  settings = {
    startRating: Math.max(400, Math.min(2800, Number(form.startRating.value) || DEFAULTS.startRating)),
    step: Math.max(0, Math.min(200, Number(form.step.value) || 0)),
    showSolution: form.showSolution.checked,
    avoidRecent: form.avoidRecent.checked,
    countdown: form.countdown.checked,
  };
  await saveAllSettings();
  $('#settingsSaved').textContent = 'Saved';
  setTimeout(() => { $('#settingsSaved').textContent = ''; }, 1600);
  renderSetup();
});

function saveAllSettings() {
  return store.saveSettings({ ...settings, appearance: A.get() });
}

// ---- appearance -----------------------------------------------------------
const PREVIEW = [ // a 4x4 corner of a position, rank 8 at the top
  ['k', null, null, 'r'],
  ['p', 'p', null, 'p'],
  [null, 'N', null, null],
  ['Q', null, 'B', null],
];
const PREVIEW_LAST = new Set(['2,1', '3,0']);

const miniPiece = (p, style) => `<span class="piece ${p === p.toUpperCase() ? 'white' : 'black'}">${pieceSvg(p, style)}</span>`;

function renderAppearance() {
  const cur = A.get();
  const uiVars = A.UI[A.resolveUi(cur.ui)].vars;

  // live preview
  $('#appearancePreview').innerHTML = PREVIEW.map((row, r) => row.map((p, c) => {
    const dark = (r + c) % 2 === 1;
    return `<div class="psq${dark ? ' dark' : ''}${PREVIEW_LAST.has(`${r},${c}`) ? ' last' : ''}">${p ? miniPiece(p, cur.pieces) : ''}</div>`;
  }).join('')).join('');

  // app themes
  const sw = (v) => `<span class="tp" style="--p-bg:${v.bg};--p-panel:${v.panel};--p-ink:${v.ink};--p-accent:${v.accent};--p-l:${v['sq-light']};--p-d:${v['sq-dark']};--p-line:${v.line}"><i class="tp-board"></i><i class="tp-panel"><b></b><b></b></i></span>`;
  const uiOpts = [['auto', 'Match system']].concat(Object.entries(A.UI).map(([k, t]) => [k, t.name]));
  $('#uiChoices').innerHTML = uiOpts.map(([k, name]) => {
    const preview = k === 'auto'
      ? `<span class="tp-split">${sw(A.UI.sage.vars)}${sw(A.UI.forest.vars)}</span>`
      : sw(A.UI[k].vars);
    const kind = k === 'auto' ? 'Light or dark, like your computer' : A.UI[k].dark ? 'Dark' : 'Light';
    return `<label class="choice"><input type="radio" name="ui" value="${k}"${cur.ui === k ? ' checked' : ''}>${preview}<span class="choice-name">${name}</span><span class="choice-sub">${kind}</span></label>`;
  }).join('');

  // looks: board + pieces in one click
  const LOOK_PREVIEW = ['k', null, 'R', 'n', null, 'Q', 'b', 'P'];
  $('#lookChoices').innerHTML = A.LOOKS.map((lk) => {
    const b = A.BOARDS[lk.board];
    const fx = (b.fx || '').split(' ').filter(Boolean).map((f) => `fx-${f}`).join(' ');
    const sqs = LOOK_PREVIEW.map((p, i) => `<span class="msq${(i + (i >> 2)) % 2 ? ' dark' : ''}">${p ? miniPiece(p, lk.pieces) : ''}</span>`).join('');
    const on = cur.board === lk.board && cur.pieces === lk.pieces;
    return `<label class="choice look"><input type="radio" name="look" value="${lk.id}"${on ? ' checked' : ''}><span class="lookb ${fx}" style="--sq-light:${b.light};--sq-dark:${b.dark}">${sqs}</span><span class="choice-name">${lk.name}</span><span class="choice-sub">${lk.note}</span></label>`;
  }).join('');

  // boards, grouped
  const bgroups = [...new Set(Object.values(A.BOARDS).map((b) => b.group || 'Colours'))];
  $('#boardChoices').innerHTML = bgroups.map((g) => (bgroups.length > 1 ? `<p class="choice-subhead">${g}</p>` : '') +
    Object.entries(A.BOARDS).filter(([, b]) => (b.group || 'Colours') === g).map(([k, b]) => {
      const l = b.light || uiVars['sq-light'], d = b.dark || uiVars['sq-dark'];
      const fx = (b.fx || '').split(' ').filter(Boolean).map((f) => `fx-${f}`).join(' ');
      return `<label class="choice"><input type="radio" name="board" value="${k}"${cur.board === k ? ' checked' : ''}><span class="bsw ${fx}" style="--l:${l};--d:${d}"></span><span class="choice-name">${b.name}</span></label>`;
    }).join('')).join('');

  // pieces
  const groups = [...new Set(Object.values(A.PIECES).map((ps) => ps.group))];
  $('#pieceChoices').innerHTML = groups.map((g) => `<p class="choice-subhead">${g}</p>` +
    Object.entries(A.PIECES).filter(([, ps]) => ps.group === g).map(([k, ps]) => {
      const minis = ['K', 'N', 'q', 'p'].map((p, i) => `<span class="msq${i % 2 ? ' dark' : ''}">${miniPiece(p, k)}</span>`).join('');
      return `<label class="choice"><input type="radio" name="pieces" value="${k}"${cur.pieces === k ? ' checked' : ''}><span class="pset">${minis}</span><span class="choice-name">${ps.name}</span></label>`;
    }).join('')).join('');
}

// ---- sound settings -------------------------------------------------------
function applySound() {
  const cur = A.get();
  const on = cur.sound !== false;
  const vol = cur.volume ?? 70;
  configureSound({ enabled: on, volume: vol / 100 });
  $('#soundOn').checked = on;
  $('#soundVolume').value = vol;
  $('#soundVolume').disabled = !on;
  $('#soundVolumeOut').textContent = `${vol}%`;
  const btn = $('#soundToggle');
  btn.setAttribute('aria-pressed', String(on));
  btn.title = on ? 'Sound on. Click to mute.' : 'Sound off. Click to turn on.';
  btn.querySelector('.sound-wave').style.display = on ? '' : 'none';
  btn.querySelector('.sound-x').style.display = on ? 'none' : '';
}
function setSound(patch, save = true) {
  A.set(patch);
  applySound();
  if (save) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveAllSettings, 400);
  }
}
$('#soundOn').addEventListener('change', (e) => setSound({ sound: e.target.checked }));
$('#soundVolume').addEventListener('input', (e) => setSound({ volume: Number(e.target.value) }, false));
$('#soundVolume').addEventListener('change', (e) => { setSound({ volume: Number(e.target.value) }); play('move'); });
$('#soundToggle').addEventListener('click', () => setSound({ sound: A.get().sound === false }));
$('#soundTest').addEventListener('click', () => {
  ['move', 'capture', 'check', 'castle', 'promote', 'correct', 'wrong'].forEach((n, i) => play(n, i * 0.45));
});

let saveTimer = null;
$('#appearance').addEventListener('change', (e) => {
  const t = e.target;
  if (!['ui', 'board', 'pieces', 'look'].includes(t.name)) return;
  if (t.name === 'look') {
    const lk = A.LOOKS.find((x) => x.id === t.value);
    if (lk) A.set({ board: lk.board, pieces: lk.pieces });
  } else {
    A.set({ [t.name]: t.value });
  }
  board.refreshPieces();
  renderAppearance();
  document.querySelector(`#appearance input[name="${t.name}"][value="${t.value}"]`)?.focus();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveAllSettings, 400);
});
A.onChange(() => { if (!$('#view-settings').hidden) renderAppearance(); });

// ---- server heartbeat -----------------------------------------------------
// serve.py stops itself once no tab is open. This tab checks in regularly and
// says goodbye when it closes; if the server can't be reached, a notice explains
// that new runs are being kept in the browser until it's started again.
const TAB_ID = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const HEARTBEAT_MS = 5000;

async function heartbeat() {
  try {
    const res = await fetch('/api/heartbeat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab: TAB_ID }), cache: 'no-store',
    });
    if (!res.ok) throw new Error(String(res.status));
    $('#serverBanner').hidden = true;
  } catch {
    $('#serverBanner').hidden = false;
  }
}

function startHeartbeat() {
  heartbeat();
  setInterval(heartbeat, HEARTBEAT_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) heartbeat(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) heartbeat(); });
  window.addEventListener('pagehide', () => {
    navigator.sendBeacon('/api/bye', new Blob([JSON.stringify({ tab: TAB_ID })], { type: 'application/json' }));
  });
}

// ---- boot -----------------------------------------------------------------
async function boot() {
  await store.load();
  if (store.mode === 'server') startHeartbeat();
  const { appearance, ...training } = store.settings;
  settings = { ...DEFAULTS, ...training };
  if (appearance) {
    A.set(appearance);
    board.refreshPieces();
  }
  applySound();
  setSaveState(store.mode === 'server' ? '' : 'Saving in this browser only');
  try {
    const res = await fetch('puzzles.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('missing');
    puzzleMeta = await res.json();
    pool = new PuzzlePool(puzzleMeta.puzzles);
  } catch {
    $('#noPuzzles').hidden = false;
    $('#startBtn').disabled = true;
  }
  renderSetup();
  fillSettings();
  renderAppearance();
}
boot();

// Read-only handle for debugging from the browser console.
window.puzzleRush = { get rush() { return rush; }, store, get pool() { return pool; } };

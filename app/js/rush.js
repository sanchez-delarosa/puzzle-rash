// One Puzzle Rush run: picks puzzles on a rising difficulty ladder, checks the
// player's moves against the Lichess solution, counts strikes and keeps time.
import { Position, uciOf } from './chess.js';
import { dayKey } from './stats.js';
import { play } from './sounds.js';

export const MODES = {
  '3min': { label: '3 min', timeMs: 3 * 60 * 1000 },
  '5min': { label: '5 min', timeMs: 5 * 60 * 1000 },
  survival: { label: 'Survival', timeMs: null },
};
export const MAX_STRIKES = 3;
const BIN = 50;

export class PuzzlePool {
  constructor(rows) {
    this.bins = new Map();
    for (const [id, fen, moves, rating, themes] of rows) {
      const b = Math.floor(rating / BIN);
      if (!this.bins.has(b)) this.bins.set(b, []);
      this.bins.get(b).push({ id, fen, moves: moves.split(' '), rating, themes: themes ? themes.split(' ') : [] });
    }
    this.size = rows.length;
    const keys = [...this.bins.keys()];
    this.minBin = Math.min(...keys);
    this.maxBin = Math.max(...keys);
  }

  // Nearest rating band to the target with an unused puzzle; prefer ones not seen recently.
  pick(target, used, recent) {
    const center = Math.min(this.maxBin, Math.max(this.minBin, Math.floor(target / BIN)));
    for (const avoidRecent of [true, false]) {
      for (let d = 0; d <= this.maxBin - this.minBin; d++) {
        for (const b of d === 0 ? [center] : [center + d, center - d]) {
          const list = this.bins.get(b);
          if (!list) continue;
          const ok = list.filter((p) => !used.has(p.id) && !(avoidRecent && recent.has(p.id)));
          if (ok.length) return ok[Math.floor(Math.random() * ok.length)];
        }
        if (avoidRecent && d >= 4) break; // don't drift far just to avoid repeats
      }
    }
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pacing (ms). The board stays live during these waits, so moves made in the
// meantime are queued as premoves and played the moment your turn starts.
const SETUP_DELAY = 300; // new puzzle shown, before the opponent's setup move
const REPLY_DELAY = 90; // after your correct move, before the opponent replies
const NEXT_DELAY = 220; // after a solved puzzle, before the next one

export class Rush {
  constructor({ board, pool, mode, settings, recent, onUpdate, onEnd }) {
    this.board = board;
    this.pool = pool;
    this.mode = mode;
    this.timeMs = MODES[mode].timeMs;
    this.settings = settings;
    this.recent = recent;
    this.onUpdate = onUpdate;
    this.onEnd = onEnd;
    this.used = new Set();
    this.attempts = [];
    this.score = 0;
    this.strikes = 0;
    this.ended = false;
    this.busy = false;
    board.onMove = (uci) => this._playerMove(uci);
  }

  start() {
    this.startedAt = new Date();
    this.t0 = performance.now();
    play('start');
    this._next();
  }

  elapsedMs() {
    return (this.ended ? this.tEnd : performance.now()) - this.t0;
  }

  remainingMs() {
    return this.timeMs == null ? null : Math.max(0, this.timeMs - this.elapsedMs());
  }

  tick() {
    if (!this.ended && this.timeMs != null && this.remainingMs() <= 0) this.end('time');
  }

  currentTarget() {
    return this.settings.startRating + this.attempts.length * this.settings.step;
  }

  async _next() {
    if (this.ended) return;
    const puzzle = this.pool.pick(this.currentTarget(), this.used, this.recent);
    if (!puzzle) return this.end('out-of-puzzles');
    this.used.add(puzzle.id);
    this.puzzle = puzzle;
    this.pos = new Position(puzzle.fen);
    this.playerColor = this.pos.turn === 'w' ? 'b' : 'w';
    this.ply = 0;
    this.busy = true;
    this.board.resetInput();
    this.board.clearHint();
    this.board.setOrientation(this.playerColor);
    this.board.setPosition(this.pos);
    this.board.setInteractive(this.playerColor); // premoves allowed during the setup move
    this.onUpdate?.();
    const token = this.puzzle;
    await sleep(SETUP_DELAY);
    if (this.ended || this.puzzle !== token) return;
    this._autoMove(); // the opponent's move that sets up the puzzle
    this.puzzleStart = performance.now();
    this.busy = false;
    this.onUpdate?.();
    this.board.playPremove();
  }

  _autoMove() {
    const m = this.pos.findUci(this.puzzle.moves[this.ply]);
    if (!m) throw new Error(`Puzzle ${this.puzzle.id}: illegal move ${this.puzzle.moves[this.ply]}`);
    const after = this.pos.clone();
    after.apply(m);
    this.board.playMove(m, after);
    this.pos = after;
    this.ply++;
  }

  async _playerMove(uci) {
    if (this.ended || this.busy || this.pos.turn !== this.playerColor) return;
    const m = this.pos.findUci(uci);
    if (!m) return;
    const expected = this.puzzle.moves[this.ply];
    const after = this.pos.clone();
    after.apply(m);
    const mate = after.isCheckmate();
    const correct = uciOf(m) === expected || mate; // any checkmate is accepted, as on Lichess
    const before = this.pos;
    this.busy = true;
    this.board.playMove(m, after);
    this.pos = after;
    this.ply++;
    const token = this.puzzle;

    if (correct) {
      if (mate || this.ply >= this.puzzle.moves.length) {
        this.board.setInteractive(null);
        this.board.flash(m.to, 'good');
        play('correct', 0.06);
        this._record(true);
        this.busy = false;
        await sleep(NEXT_DELAY);
        if (!this.ended && this.puzzle === token) this._next();
        return;
      }
      // the board stays live: anything you do now is queued as a premove
      await sleep(REPLY_DELAY);
      if (this.ended || this.puzzle !== token) return;
      this._autoMove();
      this.busy = false;
      this.board.playPremove();
      return;
    }

    // wrong move
    this.board.setInteractive(null);
    this.board.flash(m.to, 'bad');
    play('wrong', 0.04);
    this.strikes++;
    this._record(false, expected, before);
    this.busy = false;
    if (this.strikes >= MAX_STRIKES) {
      // the run is over: put the position back and leave the answer on the board
      await sleep(450);
      this._revealSolution(before, expected);
      return this.end('strikes');
    }
    if (this.settings.showSolution) {
      await sleep(350);
      if (this.ended || this.puzzle !== token) return;
      const em = before.findUci(expected);
      this.board.setPosition(before, { lastMove: null, instant: false });
      if (em) this.board.showHint(em.from, em.to);
      await sleep(750);
    } else {
      await sleep(350);
    }
    if (!this.ended && this.puzzle === token) this._next();
  }

  // Show the correct move from `pos`: squares highlighted plus a green arrow.
  // It stays on the board until the next puzzle starts.
  _revealSolution(pos, uci) {
    const em = uci && pos.findUci(uci);
    this.board.setPosition(pos, { lastMove: null, instant: false });
    if (!em) return;
    this.board.showHint(em.from, em.to);
    this.board.addArrow(em.from, em.to, 'green');
  }

  _record(ok, expected, before) {
    const p = this.puzzle;
    const a = {
      id: p.id,
      r: p.rating,
      ok,
      ms: Math.round(performance.now() - (this.puzzleStart ?? performance.now())),
      th: p.themes,
    };
    if (!ok && expected && before) {
      const em = before.findUci(expected);
      if (em) a.sol = before.san(em);
    }
    this.attempts.push(a);
    if (ok) this.score++;
    this.onUpdate?.(a);
  }

  end(reason) {
    if (this.ended) return;
    this.ended = true;
    this.tEnd = performance.now();
    if (reason !== 'stopped') play('end', 0.25);
    this.board.setInteractive(null);
    // out of time mid-puzzle: show what the answer was
    if (reason === 'time' && this.puzzle && !this.busy && this.pos.turn === this.playerColor) {
      this._revealSolution(this.pos, this.puzzle.moves[this.ply]);
    }
    const endedAt = new Date();
    const run = {
      id: `${this.startedAt.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      mode: this.mode,
      day: dayKey(this.startedAt),
      startedAt: this.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      durationMs: Math.round(this.tEnd - this.t0),
      timeLeftMs: this.timeMs == null ? null : Math.max(0, Math.round(this.timeMs - (this.tEnd - this.t0))),
      score: this.score,
      strikes: this.strikes,
      endReason: reason,
      startRating: this.settings.startRating,
      step: this.settings.step,
      attempts: this.attempts,
    };
    this.onEnd?.(run);
  }
}

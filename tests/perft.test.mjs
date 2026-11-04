import { Position, perft } from '../app/js/chess.js';
const cases = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]],
];
let ok = true;
for (const [fen, exp] of cases) {
  const p = new Position(fen);
  exp.forEach((n, i) => { const got = perft(p, i + 1); if (got !== n) { ok = false; console.log('FAIL', fen, 'd' + (i + 1), got, '!=', n); } });
}
const p = new Position('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
const m = p.findUci('a1a8'); console.log('SAN', p.san(m));
const q = new Position('8/P6k/8/8/8/8/8/K7 w - - 0 1'); console.log('promo SAN', q.san(q.findUci('a7a8q')));
console.log(ok ? 'perft OK' : 'perft FAILED');

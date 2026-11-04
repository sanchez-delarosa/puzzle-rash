// Minimal, dependency-free chess rules: FEN parsing, legal move generation
// (castling, en passant, promotion), check / mate detection, UCI and SAN.
// Squares are indexed 0..63 with a1 = 0, b1 = 1, ... h8 = 63.

const FILES = 'abcdefgh';

export const sqName = (i) => FILES[i & 7] + ((i >> 3) + 1);
export const sqIndex = (s) => FILES.indexOf(s[0]) + (parseInt(s[1], 10) - 1) * 8;
export const fileOf = (i) => i & 7;
export const rankOf = (i) => i >> 3;
export const colorOf = (p) => (p === p.toUpperCase() ? 'w' : 'b');

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

export class Position {
  constructor(fen) {
    this.load(fen);
  }

  load(fen) {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) throw new Error('Invalid FEN: ' + fen);
    this.board = new Array(64).fill(null);
    const rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error('Invalid FEN board: ' + fen);
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) f += parseInt(ch, 10);
        else {
          if (!/[pnbrqkPNBRQK]/.test(ch)) throw new Error('Invalid FEN piece: ' + ch);
          this.board[(7 - r) * 8 + f] = ch;
          f++;
        }
      }
    }
    this.turn = parts[1] === 'b' ? 'b' : 'w';
    this.castling = parts[2] === '-' ? '' : parts[2];
    this.ep = parts[3] === '-' ? -1 : sqIndex(parts[3]);
    this.halfmove = parseInt(parts[4] || '0', 10);
    this.fullmove = parseInt(parts[5] || '1', 10);
  }

  clone() {
    const p = Object.create(Position.prototype);
    p.board = this.board.slice();
    p.turn = this.turn;
    p.castling = this.castling;
    p.ep = this.ep;
    p.halfmove = this.halfmove;
    p.fullmove = this.fullmove;
    return p;
  }

  fen() {
    let s = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.board[r * 8 + f];
        if (!p) empty++;
        else {
          if (empty) s += empty;
          empty = 0;
          s += p;
        }
      }
      if (empty) s += empty;
      if (r) s += '/';
    }
    return `${s} ${this.turn} ${this.castling || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.halfmove} ${this.fullmove}`;
  }

  kingSq(color) {
    const k = color === 'w' ? 'K' : 'k';
    return this.board.indexOf(k);
  }

  // Is square `sq` attacked by any piece of color `by`?
  attacked(sq, by) {
    const b = this.board;
    const f0 = fileOf(sq), r0 = rankOf(sq);
    const isBy = (p) => p && colorOf(p) === by;
    // pawns
    const pr = by === 'w' ? r0 - 1 : r0 + 1;
    const pawn = by === 'w' ? 'P' : 'p';
    for (const df of [-1, 1]) {
      const f = f0 + df;
      if (onBoard(f, pr) && b[pr * 8 + f] === pawn) return true;
    }
    // knights
    const knight = by === 'w' ? 'N' : 'n';
    for (const [df, dr] of KNIGHT) {
      const f = f0 + df, r = r0 + dr;
      if (onBoard(f, r) && b[r * 8 + f] === knight) return true;
    }
    // king
    const king = by === 'w' ? 'K' : 'k';
    for (const [df, dr] of KING) {
      const f = f0 + df, r = r0 + dr;
      if (onBoard(f, r) && b[r * 8 + f] === king) return true;
    }
    // sliders
    const rq = by === 'w' ? 'RQ' : 'rq';
    const bq = by === 'w' ? 'BQ' : 'bq';
    for (const [dirs, set] of [[ROOK_DIRS, rq], [BISHOP_DIRS, bq]]) {
      for (const [df, dr] of dirs) {
        let f = f0 + df, r = r0 + dr;
        while (onBoard(f, r)) {
          const p = b[r * 8 + f];
          if (p) {
            if (isBy(p) && set.includes(p)) return true;
            break;
          }
          f += df;
          r += dr;
        }
      }
    }
    return false;
  }

  inCheck(color = this.turn) {
    const k = this.kingSq(color);
    return k >= 0 && this.attacked(k, color === 'w' ? 'b' : 'w');
  }

  pseudoMoves() {
    const moves = [];
    const b = this.board;
    const us = this.turn, them = us === 'w' ? 'b' : 'w';
    const add = (from, to, promo = null, flag = '') => {
      moves.push({ from, to, promo, flag, piece: b[from], captured: flag === 'ep' ? (us === 'w' ? 'p' : 'P') : b[to] });
    };
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (!p || colorOf(p) !== us) continue;
      const f0 = fileOf(sq), r0 = rankOf(sq);
      const type = p.toLowerCase();
      if (type === 'p') {
        const dir = us === 'w' ? 1 : -1;
        const startRank = us === 'w' ? 1 : 6;
        const promoRank = us === 'w' ? 7 : 0;
        const pushPawn = (from, to, flag = '') => {
          if (rankOf(to) === promoRank) for (const pr of 'qrbn') add(from, to, pr, flag);
          else add(from, to, null, flag);
        };
        const r1 = r0 + dir;
        if (onBoard(f0, r1) && !b[r1 * 8 + f0]) {
          pushPawn(sq, r1 * 8 + f0);
          const r2 = r0 + 2 * dir;
          if (r0 === startRank && !b[r2 * 8 + f0]) add(sq, r2 * 8 + f0, null, 'double');
        }
        for (const df of [-1, 1]) {
          const f = f0 + df;
          if (!onBoard(f, r1)) continue;
          const to = r1 * 8 + f;
          if (b[to] && colorOf(b[to]) === them) pushPawn(sq, to);
          else if (to === this.ep) add(sq, to, null, 'ep');
        }
      } else if (type === 'n' || type === 'k') {
        for (const [df, dr] of type === 'n' ? KNIGHT : KING) {
          const f = f0 + df, r = r0 + dr;
          if (!onBoard(f, r)) continue;
          const to = r * 8 + f;
          if (!b[to] || colorOf(b[to]) === them) add(sq, to);
        }
        if (type === 'k') this._castles(sq, add);
      } else {
        const dirs = type === 'r' ? ROOK_DIRS : type === 'b' ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS);
        for (const [df, dr] of dirs) {
          let f = f0 + df, r = r0 + dr;
          while (onBoard(f, r)) {
            const to = r * 8 + f;
            if (b[to]) {
              if (colorOf(b[to]) === them) add(sq, to);
              break;
            }
            add(sq, to);
            f += df;
            r += dr;
          }
        }
      }
    }
    return moves;
  }

  _castles(kingSq, add) {
    const b = this.board, us = this.turn, them = us === 'w' ? 'b' : 'w';
    const home = us === 'w' ? 4 : 60;
    if (kingSq !== home) return;
    const rights = us === 'w' ? ['K', 'Q'] : ['k', 'q'];
    const rook = us === 'w' ? 'R' : 'r';
    if (this.attacked(home, them)) return;
    if (this.castling.includes(rights[0]) && b[home + 3] === rook && !b[home + 1] && !b[home + 2] &&
        !this.attacked(home + 1, them) && !this.attacked(home + 2, them)) {
      add(home, home + 2, null, 'castleK');
    }
    if (this.castling.includes(rights[1]) && b[home - 4] === rook && !b[home - 1] && !b[home - 2] && !b[home - 3] &&
        !this.attacked(home - 1, them) && !this.attacked(home - 2, them)) {
      add(home, home - 2, null, 'castleQ');
    }
  }

  // Apply a move object (from pseudoMoves/legalMoves) in place.
  apply(m) {
    const b = this.board, us = this.turn;
    const piece = b[m.from];
    b[m.to] = m.promo ? (us === 'w' ? m.promo.toUpperCase() : m.promo) : piece;
    b[m.from] = null;
    if (m.flag === 'ep') b[m.to + (us === 'w' ? -8 : 8)] = null;
    if (m.flag === 'castleK') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
    if (m.flag === 'castleQ') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }
    // castling rights
    let c = this.castling;
    if (piece === 'K') c = c.replace(/[KQ]/g, '');
    if (piece === 'k') c = c.replace(/[kq]/g, '');
    const strip = (sq) => {
      if (sq === 0) c = c.replace('Q', '');
      if (sq === 7) c = c.replace('K', '');
      if (sq === 56) c = c.replace('q', '');
      if (sq === 63) c = c.replace('k', '');
    };
    strip(m.from);
    strip(m.to);
    this.castling = c;
    this.ep = m.flag === 'double' ? (m.from + m.to) / 2 : -1;
    this.halfmove = piece.toLowerCase() === 'p' || m.captured ? 0 : this.halfmove + 1;
    if (us === 'b') this.fullmove++;
    this.turn = us === 'w' ? 'b' : 'w';
  }

  legalMoves() {
    const us = this.turn;
    return this.pseudoMoves().filter((m) => {
      const p = this.clone();
      p.apply(m);
      return !p.inCheck(us);
    });
  }

  isCheckmate() {
    return this.inCheck() && this.legalMoves().length === 0;
  }

  isStalemate() {
    return !this.inCheck() && this.legalMoves().length === 0;
  }

  // Find the legal move matching a UCI string (e.g. "e7e8q"), or null.
  findUci(uci) {
    const from = sqIndex(uci.slice(0, 2)), to = sqIndex(uci.slice(2, 4));
    const promo = uci.length > 4 ? uci[4].toLowerCase() : null;
    return this.legalMoves().find((m) => m.from === from && m.to === to && (m.promo || null) === promo) || null;
  }

  san(m) {
    let s;
    const type = m.piece.toLowerCase();
    if (m.flag === 'castleK') s = 'O-O';
    else if (m.flag === 'castleQ') s = 'O-O-O';
    else if (type === 'p') {
      s = m.captured ? FILES[fileOf(m.from)] + 'x' : '';
      s += sqName(m.to);
      if (m.promo) s += '=' + m.promo.toUpperCase();
    } else {
      s = type.toUpperCase();
      const rivals = this.legalMoves().filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
      if (rivals.length) {
        const sameFile = rivals.some((o) => fileOf(o.from) === fileOf(m.from));
        const sameRank = rivals.some((o) => rankOf(o.from) === rankOf(m.from));
        if (!sameFile) s += FILES[fileOf(m.from)];
        else if (!sameRank) s += rankOf(m.from) + 1;
        else s += sqName(m.from);
      }
      if (m.captured) s += 'x';
      s += sqName(m.to);
    }
    const p = this.clone();
    p.apply(m);
    if (p.inCheck()) s += p.legalMoves().length === 0 ? '#' : '+';
    return s;
  }
}

export const uciOf = (m) => sqName(m.from) + sqName(m.to) + (m.promo || '');

export function perft(pos, depth) {
  if (depth === 0) return 1;
  const moves = pos.legalMoves();
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) {
    const p = pos.clone();
    p.apply(m);
    n += perft(p, depth - 1);
  }
  return n;
}

// Interactive chessboard: renders a Position, animates moves, and lets the
// player move by dragging or by clicking a piece and then a square.
import { sqName, fileOf, rankOf, colorOf } from './chess.js';
import { pieceSvg } from './pieces.js';
import { play, moveSound } from './sounds.js';

const currentStyle = () => document.documentElement.dataset.pieces || 'classic';

export class Board {
  constructor(root, { onMove } = {}) {
    this.root = root;
    this.onMove = onMove;
    this.orientation = 'w';
    this.pos = null;
    this.interactiveColor = null;
    this.selected = -1;
    this.drag = null;
    this.premove = null; // { from, to } queued while the opponent is to move
    this.pieces = new Map(); // square -> { el, piece }
    this.marks = new Map();

    root.classList.add('board');
    root.innerHTML = '';
    this.squaresEl = document.createElement('div');
    this.squaresEl.className = 'board-squares';
    this.squares = [];
    for (let i = 0; i < 64; i++) {
      const s = document.createElement('div');
      s.className = 'sq';
      this.squaresEl.appendChild(s);
      this.squares.push(s);
    }
    this.piecesEl = document.createElement('div');
    this.piecesEl.className = 'board-pieces';
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'board-overlay';
    // Right-click annotations: arrows and circled squares, drawn in square units.
    this.shapes = new Map(); // "from-to" -> { from, to, color }
    this.drawing = null;
    this.arrowsEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.arrowsEl.setAttribute('class', 'board-arrows');
    this.arrowsEl.setAttribute('viewBox', '0 0 8 8');
    this.arrowsEl.setAttribute('aria-hidden', 'true');
    root.append(this.squaresEl, this.piecesEl, this.arrowsEl, this.overlayEl);
    this._layoutSquares();

    root.addEventListener('pointerdown', (e) => this._down(e));
    window.addEventListener('pointermove', (e) => { this._moveDrag(e); this._moveDraw(e); });
    window.addEventListener('pointerup', (e) => { this._up(e); this._endDraw(e); });
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    // Right-click (or Esc) lets go of a grabbed or selected piece without moving it.
    // While the left button is held, Chrome reports the right button only as a
    // chorded pointermove (buttons includes 2) and/or a contextmenu event, so all
    // three are handled.
    const rightCancel = (e) => {
      if (this.drag || this.selected >= 0 || this.premove) {
        e.preventDefault();
        this.cancelGrab();
        return true;
      }
      return false;
    };
    window.addEventListener('mousedown', (e) => { if (e.button === 2) rightCancel(e); }, true);
    window.addEventListener('pointermove', (e) => { if (this.drag && (e.buttons & 2)) rightCancel(e); }, true);
    window.addEventListener('contextmenu', (e) => {
      if (this._suppressMenu || rightCancel(e)) {
        e.preventDefault();
        this._suppressMenu = false;
      }
    }, true);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (this.drag || this.selected >= 0 || this.premove)) this.cancelGrab();
    });
  }

  // ---- geometry -------------------------------------------------------
  _xy(sq) {
    const f = fileOf(sq), r = rankOf(sq);
    return this.orientation === 'w' ? [f, 7 - r] : [7 - f, r];
  }

  _sqFromPoint(clientX, clientY) {
    const rect = this.root.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const y = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return -1;
    return this.orientation === 'w' ? (7 - y) * 8 + x : y * 8 + (7 - x);
  }

  _layoutSquares() {
    for (let sq = 0; sq < 64; sq++) {
      const [x, y] = this._xy(sq);
      const s = this.squares[sq];
      s.style.gridColumn = x + 1;
      s.style.gridRow = y + 1;
      s.classList.toggle('dark', (fileOf(sq) + rankOf(sq)) % 2 === 0);
      s.dataset.sq = sqName(sq);
      // coordinates on the edge squares
      s.querySelectorAll('.coord').forEach((c) => c.remove());
      if (y === 7) {
        const c = document.createElement('span');
        c.className = 'coord file';
        c.textContent = sqName(sq)[0];
        s.appendChild(c);
      }
      if (x === 0) {
        const c = document.createElement('span');
        c.className = 'coord rank';
        c.textContent = sqName(sq)[1];
        s.appendChild(c);
      }
    }
  }

  _place(el, sq) {
    const [x, y] = this._xy(sq);
    el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
  }

  _makePiece(piece) {
    const el = document.createElement('div');
    el.className = `piece ${colorOf(piece) === 'w' ? 'white' : 'black'}`;
    el.dataset.piece = piece;
    el.innerHTML = pieceSvg(piece, currentStyle());
    return el;
  }

  // Redraw every piece in the current piece style (after a style change).
  refreshPieces() {
    const style = currentStyle();
    for (const { el, piece } of this.pieces.values()) el.innerHTML = pieceSvg(piece, style);
  }

  // ---- public API -----------------------------------------------------
  setOrientation(color) {
    if (color === this.orientation) return;
    this.orientation = color;
    this._layoutSquares();
    this._renderShapes();
    for (const [sq, { el }] of this.pieces) {
      el.classList.add('no-anim');
      this._place(el, sq);
    }
    requestAnimationFrame(() => this.pieces.forEach(({ el }) => el.classList.remove('no-anim')));
  }

  // Sync rendered pieces with a position without animation.
  setPosition(pos, { lastMove = null, instant = true } = {}) {
    this.pos = pos;
    const keepSel = this.selected;
    this._clearSelection();
    if (this.drag && this.pieces.get(this.drag.from)?.piece !== pos.board[this.drag.from]) this.drag = null;
    for (const [sq, entry] of this.pieces) {
      if (pos.board[sq] !== entry.piece) {
        entry.el.remove();
        this.pieces.delete(sq);
      }
    }
    for (let sq = 0; sq < 64; sq++) {
      const p = pos.board[sq];
      if (p && !this.pieces.has(sq)) {
        const el = this._makePiece(p);
        if (instant) el.classList.add('no-anim');
        this._place(el, sq);
        this.piecesEl.appendChild(el);
        this.pieces.set(sq, { el, piece: p });
        if (instant) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('no-anim')));
      }
    }
    this.setLastMove(lastMove);
    this._markCheck();
    if (keepSel >= 0 && this._ownPiece(keepSel)) this._select(keepSel);
    this._paintPremove();
  }

  // Animate a move object (from Position.legalMoves) and then sync to posAfter.
  playMove(m, posAfter) {
    const moveEl = (from, to) => {
      const entry = this.pieces.get(from);
      if (!entry) return;
      this.pieces.delete(from);
      const victim = this.pieces.get(to);
      if (victim) victim.el.remove();
      this.pieces.set(to, entry);
      this._place(entry.el, to);
    };
    play(moveSound(m, posAfter));
    moveEl(m.from, m.to);
    if (m.flag === 'castleK') moveEl(m.to + 1, m.to - 1);
    if (m.flag === 'castleQ') moveEl(m.to - 2, m.to + 1);
    this.setPosition(posAfter, { lastMove: [m.from, m.to], instant: false });
  }

  setInteractive(color) {
    this.interactiveColor = color;
    this.root.classList.toggle('interactive', !!color);
    if (!color) this.cancelGrab(false);
  }

  setLastMove(mv) {
    this.squares.forEach((s) => s.classList.remove('last'));
    if (mv) mv.forEach((sq) => this.squares[sq].classList.add('last'));
  }

  flash(sq, kind) {
    const s = this.squares[sq];
    s.classList.remove('good', 'bad');
    void s.offsetWidth; // restart animation
    s.classList.add(kind);
    setTimeout(() => s.classList.remove(kind), 900);
  }

  showHint(from, to) {
    this.clearHint();
    this.squares[from].classList.add('hint-from');
    this.squares[to].classList.add('hint-to');
  }

  clearHint() {
    this.squares.forEach((s) => s.classList.remove('hint-from', 'hint-to'));
  }

  askPromotion(color, toSq) {
    return new Promise((resolve) => {
      const [x] = this._xy(toSq);
      const box = document.createElement('div');
      box.className = 'promo';
      box.style.left = `${x * 12.5}%`;
      const top = this._xy(toSq)[1] === 0;
      box.style[top ? 'top' : 'bottom'] = '0';
      const finish = (v) => { box.remove(); this.overlayEl.classList.remove('active'); resolve(v); };
      for (const t of 'qnrb') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'promo-btn';
        btn.setAttribute('aria-label', { q: 'Queen', n: 'Knight', r: 'Rook', b: 'Bishop' }[t]);
        btn.appendChild(this._makePiece(color === 'w' ? t.toUpperCase() : t));
        btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
        btn.addEventListener('click', (e) => { e.stopPropagation(); finish(t); });
        box.appendChild(btn);
      }
      this.overlayEl.classList.add('active');
      this.overlayEl.onclick = () => finish(null);
      this.overlayEl.appendChild(box);
    });
  }

  // ---- premoves --------------------------------------------------------
  // While the opponent is to move you can still pick up a piece and drop it:
  // the move is queued and played the instant your turn starts, if it is legal then.

  _premoveMode() {
    return !!(this.pos && this.interactiveColor && this.pos.turn !== this.interactiveColor);
  }

  // Squares a piece could reach by its movement pattern, ignoring blockers,
  // since the opponent's reply may change what is legal.
  _premoveDests(from) {
    const p = this.pos.board[from];
    if (!p) return [];
    const t = p.toLowerCase();
    const white = colorOf(p) === 'w';
    const f0 = fileOf(from), r0 = rankOf(from);
    const out = new Set();
    const add = (f, r) => { if (f >= 0 && f < 8 && r >= 0 && r < 8) out.add(r * 8 + f); };
    const ray = (df, dr) => { for (let f = f0 + df, r = r0 + dr; f >= 0 && f < 8 && r >= 0 && r < 8; f += df, r += dr) out.add(r * 8 + f); };
    if (t === 'p') {
      const dir = white ? 1 : -1;
      add(f0, r0 + dir);
      if (r0 === (white ? 1 : 6)) add(f0, r0 + 2 * dir);
      add(f0 - 1, r0 + dir);
      add(f0 + 1, r0 + dir);
    } else if (t === 'n') {
      for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) add(f0 + df, r0 + dr);
    } else if (t === 'k') {
      for (const [df, dr] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) add(f0 + df, r0 + dr);
      const home = white ? 4 : 60;
      const rights = this.pos.castling || '';
      if (from === home && rights.includes(white ? 'K' : 'k')) out.add(home + 2);
      if (from === home && rights.includes(white ? 'Q' : 'q')) out.add(home - 2);
    } else {
      const dirs = { r: [[1, 0], [-1, 0], [0, 1], [0, -1]], b: [[1, 1], [1, -1], [-1, 1], [-1, -1]] };
      for (const [df, dr] of t === 'q' ? dirs.r.concat(dirs.b) : dirs[t]) ray(df, dr);
    }
    out.delete(from);
    return [...out];
  }

  setPremove(from, to) {
    this.premove = { from, to };
    this._paintPremove();
  }

  clearPremove() {
    this.premove = null;
    this._paintPremove();
  }

  _paintPremove() {
    this.squares.forEach((s) => s.classList.remove('premove'));
    if (this.premove) {
      this.squares[this.premove.from].classList.add('premove');
      this.squares[this.premove.to].classList.add('premove');
    }
  }

  // Called when it becomes the player's turn: plays the queued move if it is legal now.
  playPremove() {
    const pm = this.premove;
    this.clearPremove();
    if (!pm || !this.interactiveColor || !this.pos || this.pos.turn !== this.interactiveColor) return false;
    const candidates = this.pos.legalMoves().filter((m) => m.from === pm.from && m.to === pm.to);
    if (!candidates.length) return false;
    const promo = candidates.length > 1 ? 'q' : ''; // premoved promotions become a queen
    if (this.onMove) this.onMove(sqName(pm.from) + sqName(pm.to) + promo);
    return true;
  }

  // Forget any grab, selection and queued premove (new puzzle, run over).
  resetInput() {
    this.cancelGrab(false);
    this.clearShapes();
  }

  // ---- arrows and circles (right mouse button) ---------------------------
  // Right-drag draws an arrow, right-click on one square circles it, drawing the
  // same shape again removes it, and any left click on the board clears them.
  // Modifier keys pick the colour: none orange, Shift green, Ctrl red, Alt blue.

  static SHAPE_COLORS = { orange: '#f59f0b', green: '#2a9d4a', red: '#d63b3b', blue: '#2f74d0' };

  _shapeColor(e) {
    if (e.shiftKey) return 'green';
    if (e.ctrlKey || e.metaKey) return 'red';
    if (e.altKey) return 'blue';
    return 'orange';
  }

  _startDraw(e) {
    // a right-click while holding or selecting a piece cancels that instead
    if (this.drag || this.selected >= 0 || this.premove) return;
    const sq = this._sqFromPoint(e.clientX, e.clientY);
    if (sq < 0) return;
    e.preventDefault();
    this.drawing = { from: sq, to: sq, color: this._shapeColor(e) };
    this._suppressMenu = true; // the menu may fire wherever the button is released
    this._renderShapes();
  }

  _moveDraw(e) {
    if (!this.drawing) return;
    const sq = this._sqFromPoint(e.clientX, e.clientY);
    if (sq >= 0 && sq !== this.drawing.to) {
      this.drawing.to = sq;
      this._renderShapes();
    }
  }

  _endDraw(e) {
    if (!this.drawing || e.button !== 2) return;
    const d = this.drawing;
    this.drawing = null;
    setTimeout(() => { this._suppressMenu = false; }, 600);
    const to = this._sqFromPoint(e.clientX, e.clientY);
    if (to >= 0) {
      const key = `${d.from}-${to}`;
      const existing = this.shapes.get(key);
      if (existing && existing.color === d.color) this.shapes.delete(key);
      else this.shapes.set(key, { from: d.from, to, color: d.color });
    }
    this._renderShapes();
  }

  // Draw an arrow programmatically (e.g. to show a solution); it stays until cleared.
  addArrow(from, to, color = 'green') {
    this.shapes.set(`${from}-${to}`, { from, to, color });
    this._renderShapes();
  }

  clearShapes() {
    if (!this.shapes.size && !this.drawing) return;
    this.shapes.clear();
    this.drawing = null;
    this._renderShapes();
  }

  _center(sq) {
    const [x, y] = this._xy(sq);
    return [x + 0.5, y + 0.5];
  }

  _shapeSvg({ from, to, color }, preview) {
    const c = Board.SHAPE_COLORS[color] || color;
    const op = preview ? 0.55 : 0.82;
    const [x1, y1] = this._center(from);
    if (from === to) {
      return `<circle cx="${x1}" cy="${y1}" r="0.45" fill="none" stroke="${c}" stroke-width="0.075" opacity="${op}"/>`;
    }
    const [x2, y2] = this._center(to);
    const adx = Math.abs(x2 - x1), ady = Math.abs(y2 - y1);
    const knight = (adx === 1 && ady === 2) || (adx === 2 && ady === 1);
    // knight arrows bend: along the long leg first, then the short one
    const pts = knight ? [[x1, y1], ady > adx ? [x1, y2] : [x2, y1], [x2, y2]] : [[x1, y1], [x2, y2]];
    const [px, py] = pts[pts.length - 2];
    const len = Math.hypot(x2 - px, y2 - py);
    const ux = (x2 - px) / len, uy = (y2 - py) / len;
    const head = 0.42, half = 0.26, tipBack = 0.08;
    const tx = x2 - ux * tipBack, ty = y2 - uy * tipBack; // arrow tip
    const bx = tx - ux * head, by = ty - uy * head; // base of the head
    const shaft = pts.slice(0, -1).concat([[bx + ux * 0.02, by + uy * 0.02]]);
    const d = shaft.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(3)} ${y.toFixed(3)}`).join(' ');
    const headPts = [[tx, ty], [bx - uy * half, by + ux * half], [bx + uy * half, by - ux * half]]
      .map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');
    return `<g opacity="${op}"><path d="${d}" fill="none" stroke="${c}" stroke-width="0.17" stroke-linejoin="round"/><polygon points="${headPts}" fill="${c}"/></g>`;
  }

  _renderShapes() {
    let html = '';
    for (const sh of this.shapes.values()) html += this._shapeSvg(sh, false);
    if (this.drawing) html += this._shapeSvg(this.drawing, true);
    this.arrowsEl.innerHTML = html;
  }

  // ---- interaction ----------------------------------------------------
  _targets(from) {
    if (!this.pos) return [];
    if (this._premoveMode()) return this._premoveDests(from).map((to) => ({ from, to, premove: true }));
    return this.pos.legalMoves().filter((m) => m.from === from);
  }

  _select(sq) {
    this._clearSelection();
    this.selected = sq;
    this.squares[sq].classList.add('selected');
    for (const m of this._targets(sq)) {
      this.squares[m.to].classList.add(this.pos.board[m.to] || m.flag === 'ep' ? 'target-capture' : 'target');
    }
  }

  // Drop a dragged piece back on its own square (it glides back) and clear the selection.
  // fromUser (right-click or Esc): a piece being dragged glides back and stays
  // selected with its moves shown; a second right-click/Esc then deselects it.
  // From code (fromUser = false): drop everything.
  cancelGrab(fromUser = true) {
    const d = this.drag;
    if (d) {
      this.drag = null;
      d.el.classList.remove('dragging');
      this._place(d.el, d.from);
    }
    if ((d || this.premove) && fromUser) {
      // the menu for this right-click may fire outside the board, where the cursor was
      this._suppressMenu = true;
      setTimeout(() => { this._suppressMenu = false; }, 1500);
    }
    if (d && fromUser && this._ownPiece(d.from)) {
      this._select(d.from);
      return;
    }
    this.clearPremove();
    this._clearSelection();
  }

  _clearSelection() {
    this.selected = -1;
    this.squares.forEach((s) => s.classList.remove('selected', 'target', 'target-capture'));
  }

  _ownPiece(sq) {
    const p = this.pos && this.pos.board[sq];
    return !!p && colorOf(p) === this.interactiveColor;
  }

  _down(e) {
    if (e.button === 2) return this._startDraw(e);
    if (e.button === 0 && !e.target.closest('.promo')) this.clearShapes();
    if (!this.interactiveColor || e.button > 0) return;
    if (e.target.closest('.promo')) return;
    const sq = this._sqFromPoint(e.clientX, e.clientY);
    if (sq < 0) return;
    e.preventDefault();
    if (this.selected >= 0 && sq !== this.selected && !this._ownPiece(sq)) {
      this._tryMove(this.selected, sq);
      return;
    }
    if (this._ownPiece(sq)) {
      if (this.premove) this.clearPremove();
      const reclick = this.selected === sq;
      this._select(sq);
      const entry = this.pieces.get(sq);
      const rect = this.root.getBoundingClientRect();
      this.drag = { from: sq, el: entry.el, rect, reclick, moved: false, startX: e.clientX, startY: e.clientY };
      entry.el.classList.add('dragging');
      this._dragTo(e.clientX, e.clientY);
    } else {
      this._clearSelection();
    }
  }

  _dragTo(x, y) {
    const d = this.drag;
    const size = d.rect.width / 8;
    d.el.style.transform = `translate(${x - d.rect.left - size / 2}px, ${y - d.rect.top - size / 2}px)`;
  }

  _moveDrag(e) {
    if (!this.drag) return;
    if (Math.abs(e.clientX - this.drag.startX) + Math.abs(e.clientY - this.drag.startY) > 4) this.drag.moved = true;
    this._dragTo(e.clientX, e.clientY);
  }

  // Where a dragged piece should land: the square under the cursor if it's a
  // legal destination, otherwise the nearest legal destination whose centre is
  // within DROP_REACH squares of the cursor (so a slightly-off release still counts).
  _dropTarget(from, clientX, clientY) {
    const rect = this.root.getBoundingClientRect();
    const size = rect.width / 8;
    const px = (clientX - rect.left) / size; // cursor in square units, screen orientation
    const py = (clientY - rect.top) / size;
    let best = -1;
    let bestDist = Infinity;
    for (const m of this._targets(from)) {
      const [x, y] = this._xy(m.to);
      const dist = Math.hypot(px - (x + 0.5), py - (y + 0.5));
      if (dist < bestDist) { bestDist = dist; best = m.to; }
    }
    return bestDist <= Board.DROP_REACH ? best : -1;
  }

  static DROP_REACH = 0.85; // squares; the edge of a square is 0.5 from its centre

  _up(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.el.classList.remove('dragging');
    const over = this._sqFromPoint(e.clientX, e.clientY);
    // a plain click on the piece (or putting it back on its own square)
    if (!d.moved || over === d.from) {
      d.el.classList.add('no-anim');
      this._place(d.el, d.from);
      requestAnimationFrame(() => d.el.classList.remove('no-anim'));
      if (d.reclick && !d.moved) this._clearSelection();
      return;
    }
    const to = this._dropTarget(d.from, e.clientX, e.clientY);
    if (to < 0) {
      // nowhere legal nearby (or off the board): glide back, stay selected with moves shown
      this._place(d.el, d.from);
      this._select(d.from);
      return;
    }
    // a real move lands instantly on its square; a premove only gets queued, so the piece goes home
    d.el.classList.add('no-anim');
    this._place(d.el, this._premoveMode() ? d.from : to);
    requestAnimationFrame(() => d.el.classList.remove('no-anim'));
    this._tryMove(d.from, to);
  }

  async _tryMove(from, to) {
    const candidates = this._targets(from).filter((m) => m.to === to);
    if (!candidates.length) {
      if (this._ownPiece(to)) this._select(to);
      else this._clearSelection();
      return;
    }
    this._clearSelection();
    if (candidates[0].premove) {
      this.setPremove(from, to);
      return;
    }
    let promo = '';
    if (candidates.length > 1) {
      const color = this.interactiveColor;
      const choice = await this.askPromotion(color, to);
      if (!choice) {
        const entry = this.pieces.get(from);
        if (entry) this._place(entry.el, from);
        return;
      }
      promo = choice;
    }
    if (this.onMove) this.onMove(sqName(from) + sqName(to) + promo);
  }

  _markCheck() {
    this.squares.forEach((s) => s.classList.remove('check'));
    if (this.pos && this.pos.inCheck()) {
      const k = this.pos.kingSq(this.pos.turn);
      if (k >= 0) this.squares[k].classList.add('check');
    }
  }
}

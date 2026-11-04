// Piece artwork for each style, returned as SVG markup (viewBox 0 0 100 100).
// Colours come from CSS (.piece.white / .piece.black and the style's classes).

const SOLID = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const OUTLINE = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' };
const VS = '︎'; // text presentation, never emoji

const glyph = (ch, cls) =>
  `<svg viewBox="0 0 100 100" aria-hidden="true"><text class="${cls}" x="50" y="52" text-anchor="middle" dominant-baseline="central">${ch}${VS}</text></svg>`;

// Geometric set: flat shapes drawn for this app.
const BASE = '<rect class="body" x="26" y="78" width="48" height="10" rx="3"/>';
const GEO = {
  p: `<circle class="body" cx="50" cy="33" r="11"/><path class="body" d="M40 78 L44 52 H56 L60 78 Z"/><rect class="body" x="37" y="45" width="26" height="7" rx="3.5"/>`,
  r: `<path class="body" d="M31 22 H40 V30 H46 V22 H54 V30 H60 V22 H69 V41 H31 Z"/><path class="body" d="M36 41 H64 L62 78 H38 Z"/><path class="detail" d="M37 50 H63"/>`,
  b: `<circle class="body" cx="50" cy="16" r="5"/><path class="body" d="M50 21 C63 29 65 44 58 55 H42 C35 44 37 29 50 21 Z"/><path class="body" d="M42 55 H58 L62 78 H38 Z"/><path class="detail" d="M46 45 L56 33"/>`,
  n: `<path class="body" d="M37 78 L38 61 C38 55 41 51 45 47 L34 51 C29 53 25 48 28 44 L43 28 L45 18 L52 25 C65 27 71 41 67 78 Z"/><circle class="eye" cx="46" cy="34" r="2.8"/>`,
  q: `<circle class="body" cx="29" cy="30" r="4.5"/><circle class="body" cx="42" cy="22" r="4.5"/><circle class="body" cx="58" cy="22" r="4.5"/><circle class="body" cx="71" cy="30" r="4.5"/><path class="body" d="M29 31 L37 58 H63 L71 31 L60 45 L58 23 L50 42 L42 23 L40 45 Z"/><path class="body" d="M37 58 H63 L65 78 H35 Z"/><path class="detail" d="M37 64 H63"/>`,
  k: `<rect class="body" x="46.5" y="9" width="7" height="22" rx="2"/><rect class="body" x="40" y="14.5" width="20" height="7" rx="2"/><path class="body" d="M33 40 C33 30 67 30 67 40 L60 58 H40 Z"/><path class="body" d="M40 58 H60 L64 78 H36 Z"/><path class="detail" d="M39 64 H61"/>`,
};


// Shared SVG definitions (gradients, patterns, filters) used by the wood,
// sketch and shaded styles. Injected once into the page.
let defsReady = false;
function ensureDefs() {
  if (defsReady || typeof document === 'undefined' || !document.body) return;
  defsReady = true;
  const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  host.setAttribute('width', '0');
  host.setAttribute('height', '0');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'absolute';
  host.innerHTML = `<defs>
    <linearGradient id="pr-maple" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e4c0"/><stop offset="1" stop-color="#d6a96d"/></linearGradient>
    <linearGradient id="pr-walnut" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#83552f"/><stop offset="1" stop-color="#3a2112"/></linearGradient>
    <pattern id="pr-wood-light" patternUnits="userSpaceOnUse" width="100" height="100">
      <rect width="100" height="100" fill="url(#pr-maple)"/>
      <g fill="none" stroke="#a8743d" stroke-width="1.2" opacity="0.35">
        <path d="M20 0 C26 30 14 60 22 100"/><path d="M42 0 C36 35 48 62 40 100"/><path d="M60 0 C66 28 54 70 62 100"/><path d="M80 0 C74 40 86 64 78 100"/>
      </g>
    </pattern>
    <pattern id="pr-wood-dark" patternUnits="userSpaceOnUse" width="100" height="100">
      <rect width="100" height="100" fill="url(#pr-walnut)"/>
      <g fill="none" stroke="#1f1008" stroke-width="1.2" opacity="0.45">
        <path d="M20 0 C26 30 14 60 22 100"/><path d="M42 0 C36 35 48 62 40 100"/><path d="M60 0 C66 28 54 70 62 100"/><path d="M80 0 C74 40 86 64 78 100"/>
      </g>
    </pattern>
    <pattern id="pr-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
      <rect width="5" height="5" fill="#575757"/><line x1="0" y1="0" x2="0" y2="5" stroke="#161616" stroke-width="3"/>
    </pattern>
    <filter id="pr-rough" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
 <linearGradient id="pr-silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#c3c9d1"/><stop offset="0.6" stop-color="#eef1f5"/><stop offset="1" stop-color="#9aa2ad"/></linearGradient>
    <linearGradient id="pr-gunmetal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d747e"/><stop offset="0.45" stop-color="#2a2e34"/><stop offset="0.6" stop-color="#4a5059"/><stop offset="1" stop-color="#121417"/></linearGradient>
    <linearGradient id="pr-shade-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d4d4cc"/></linearGradient>
    <linearGradient id="pr-shade-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#626a73"/><stop offset="1" stop-color="#141719"/></linearGradient>
  </defs>`;
  document.body.prepend(host);
}

// Pixel set: 16x16 sprites. # outline, o fill, s shade, - detail.
const PIXEL = {
  p: [
    '................',
    '................',
    '......####......',
    '.....#oooo#.....',
    '.....#ooos#.....',
    '.....#ooos#.....',
    '......#os#......',
    '....##ooos##....',
    '.....#ooos#.....',
    '.....#ooos#.....',
    '....#ooooos#....',
    '...#ooooooos#...',
    '...#ooooooos#...',
    '..############..',
    '................',
    '................',
  ],
  r: [
    '................',
    '................',
    '...##..##..##...',
    '...#o##oo##o#...',
    '...#ooooooos#...',
    '...##########...',
    '....#ooooos#....',
    '....#ooooos#....',
    '....#ooooos#....',
    '....#ooooos#....',
    '....#ooooos#....',
    '...##########...',
    '...#ooooooos#...',
    '..############..',
    '................',
    '................',
  ],
  b: [
    '................',
    '.......##.......',
    '......#oo#......',
    '.......##.......',
    '......#oo#......',
    '.....#ooo-#.....',
    '....#ooo-os#....',
    '....#oo-oos#....',
    '....#ooooos#....',
    '.....#ooos#.....',
    '......#os#......',
    '.....#ooos#.....',
    '...#ooooooos#...',
    '...##########...',
    '................',
    '................',
  ],
  n: [
    '................',
    '................',
    '.......#.#......',
    '......#o#o#.....',
    '.....#ooooo#....',
    '....#o-ooooo#...',
    '...#oooooooos#..',
    '..#ooooooooos#..',
    '..#oo##ooooos#..',
    '...##.#oooos#...',
    '.....#oooooos#..',
    '....#ooooooos#..',
    '...#oooooooos#..',
    '...###########..',
    '................',
    '................',
  ],
  q: [
    '................',
    '..#....##....#..',
    '..#o..#oo#..o#..',
    '..#o#.#oo#.#o#..',
    '..#oo#oooo#oo#..',
    '..#ooooooooos#..',
    '...#ooooooos#...',
    '...##########...',
    '....#ooooos#....',
    '....#ooooos#....',
    '....#ooooos#....',
    '...##########...',
    '...#ooooooos#...',
    '..############..',
    '................',
    '................',
  ],
  k: [
    '.......##.......',
    '......####......',
    '.......##.......',
    '.....######.....',
    '....#oooooo#....',
    '...#ooooooos#...',
    '...#ooooooos#...',
    '....#ooooos#....',
    '...##########...',
    '....#ooooos#....',
    '....#ooooos#....',
    '...##########...',
    '...#ooooooos#...',
    '..############..',
    '................',
    '................',
  ],
};

function pixelSvg(t) {
  let rects = '';
  PIXEL[t].forEach((row, y) => {
    let x = 0;
    while (x < 16) {
      const ch = row[x];
      let w = 1;
      while (x + w < 16 && row[x + w] === ch) w++;
      if (ch !== '.') rects += `<rect class="px-${{ '#': 'o', o: 'f', s: 's', '-': 'd' }[ch]}" x="${x}" y="${y}" width="${w}" height="1"/>`;
      x += w;
    }
  });
  return `<svg viewBox="0 0 16 16" aria-hidden="true" class="pix" shape-rendering="crispEdges">${rects}</svg>`;
}

// Shapes set: an abstract token per piece type (the knight is an L, like its move).
const star = (() => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 13 : 31;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(53 + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
})();
const SHAPES = {
  p: '<circle class="body" cx="50" cy="52" r="13"/>',
  n: '<path class="body" d="M34 24 H50 V58 H68 V74 H34 Z"/>',
  b: '<path class="body" d="M50 20 L76 50 L50 80 L24 50 Z"/>',
  r: '<rect class="body" x="27" y="27" width="46" height="46" rx="4"/>',
  q: `<polygon class="body" points="${star}"/>`,
  k: '<path class="body" d="M41 20 H59 V41 H80 V59 H59 V80 H41 V59 H20 V41 H41 Z"/>',
};

// Diagram set: classic printed-diagram pieces (thick outlines; white pieces with black
// detail lines, black pieces with white ones). body = filled shape, line = detail stroke.
const DIAGRAM = {
  p: `<circle class="body" cx="50" cy="29" r="10.5"/>
      <path class="body" d="M37 45 H63 Q66 45 66 48.5 Q66 52 63 52 H58 C59 60 66 67 69 79 H31 C34 67 41 60 42 52 H37 Q34 52 34 48.5 Q34 45 37 45 Z"/>
      <rect class="body" x="25" y="79" width="50" height="9" rx="2.5"/>`,
  r: `<path class="body" d="M27 17 H38 V24 H45 V17 H55 V24 H62 V17 H73 V35 H27 Z"/>
      <path class="body" d="M31 35 H69 L66 42 H34 Z"/>
      <path class="body" d="M35 42 H65 L67 70 H33 Z"/>
      <path class="body" d="M30 70 H70 L73 79 H27 Z"/>
      <rect class="body" x="23" y="79" width="54" height="9" rx="2.5"/>
      <path class="line" d="M33 35 H67 M36 42 H64 M34 70 H66"/>`,
  b: `<circle class="body" cx="50" cy="13" r="5"/>
      <path class="body" d="M50 19 C62 27 66 40 60 51 H40 C34 40 38 27 50 19 Z"/>
      <path class="body" d="M37 51 H63 Q66 51 66 54.5 Q66 58 63 58 H37 Q34 58 34 54.5 Q34 51 37 51 Z"/>
      <path class="body" d="M41 58 H59 C60 66 64 71 68 76 H32 C36 71 40 66 41 58 Z"/>
      <rect class="body" x="25" y="76" width="50" height="10" rx="2.5"/>
      <path class="line" d="M50 29 V45 M43.5 37 H56.5"/>`,
  n: `<path class="body" d="M31 80 C30 68 36 61 45 54 C41 54 36 56 32 60 C28 63 22 61 22 56 C22 52 25 49 29 46 C35 41 40 35 42 28 L41 18 L48 23 L53 17 L56 25 C67 30 74 42 74 58 C74 66 72 73 72 80 Z"/>
      <rect class="body" x="25" y="80" width="52" height="9" rx="2.5"/>
      <circle class="eye" cx="46" cy="33" r="3.2"/>
      <path class="line" d="M59 29 C66 38 69 52 67 70"/>`,
  q: `<circle class="body" cx="22" cy="31" r="4.6"/><circle class="body" cx="35" cy="21" r="4.6"/><circle class="body" cx="50" cy="17" r="4.6"/><circle class="body" cx="65" cy="21" r="4.6"/><circle class="body" cx="78" cy="31" r="4.6"/>
      <path class="body" d="M23 33 L33 60 H67 L77 33 L64 47 L65 24 L56 45 L50 21 L44 45 L35 24 L36 47 Z"/>
      <path class="body" d="M33 60 H67 L66 67 H34 Z"/>
      <path class="body" d="M34 67 H66 L70 78 H30 Z"/>
      <rect class="body" x="25" y="78" width="50" height="9" rx="2.5"/>
      <path class="line" d="M35 60 H65 M36 67 H64"/>`,
  k: `<rect class="body" x="46.5" y="5" width="7" height="19" rx="1.5"/><rect class="body" x="41" y="10.5" width="18" height="7" rx="1.5"/>
      <path class="body" d="M50 27 C40 25 25 28 25 40 C25 49 33 54 36 60 H64 C67 54 75 49 75 40 C75 28 60 25 50 27 Z"/>
      <path class="body" d="M36 60 H64 L63 67 H37 Z"/>
      <path class="body" d="M37 67 H63 L68 78 H32 Z"/>
      <rect class="body" x="25" y="78" width="50" height="9" rx="2.5"/>
      <path class="line" d="M50 29 V58 M38 60 H62 M38 67 H62"/>`,
};

const LETTER = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N' };

// High-contrast helpers: draw the shape twice, a thick outer halo in the
// opposite colour behind a solid core, so pieces stand out on any square.
const geoHalo = (t, cls) =>
  `<svg viewBox="0 0 100 100" aria-hidden="true" class="geo ${cls}"><g class="halo">${GEO[t]}${BASE}</g><g class="core">${GEO[t]}${BASE}</g></svg>`;
const glyphHalo = (ch, cls) => {
  const txt = (c) => `<text class="${c}" x="50" y="52" text-anchor="middle" dominant-baseline="central">${ch}${VS}</text>`;
  return `<svg viewBox="0 0 100 100" aria-hidden="true" class="gh ${cls}">${txt('h-out')}${txt('h-in')}${txt('core')}</svg>`;
};

export function pieceSvg(piece, style) {
  const t = piece.toLowerCase();
  const white = piece !== t;
  ensureDefs();
  switch (style) {
    case 'diagram':
      return `<svg viewBox="5 2 90 90" aria-hidden="true" class="dia">${DIAGRAM[t]}</svg>`; // slightly zoomed: fills the square like print diagrams
    case 'max':
      return geoHalo(t, 'max');
    case 'signal':
      return geoHalo(t, 'signal');
    case 'halo':
      return glyphHalo(SOLID[t], 'halo');
    case 'badge':
      return `<svg viewBox="0 0 100 100" aria-hidden="true" class="badge"><rect class="tile" x="7" y="7" width="86" height="86" rx="14"/><text class="core" x="50" y="53" text-anchor="middle" dominant-baseline="central">${SOLID[t]}${VS}</text></svg>`;
    case 'metal':
      return `<svg viewBox="0 0 100 100" aria-hidden="true" class="geo metal">${GEO[t]}${BASE}</svg>`;
    case 'neon':
      return `<svg viewBox="0 0 100 100" aria-hidden="true" class="geo neon">${GEO[t]}${BASE}</svg>`;
    case 'shaded':
      return glyph(SOLID[t], 'shaded');
    case 'wood':
      return `<svg viewBox="0 0 100 100" aria-hidden="true" class="geo wood">${GEO[t]}${BASE}</svg>`;
    case 'sketch':
      return `<svg viewBox="0 0 100 100" aria-hidden="true" class="geo sketch"><g filter="url(#pr-rough)">${GEO[t]}${BASE}</g></svg>`;
    case 'pixel':
      return pixelSvg(t);
    case 'shapes':
      return `<svg viewBox="0 0 100 100" aria-hidden="true" class="shp">${SHAPES[t]}</svg>`;
    case 'print':
      // White pieces as outline glyphs, black as solid glyphs, like a printed diagram.
      return glyph(white ? OUTLINE[t] : SOLID[t], 'print');
    case 'geometric':
      return `<svg viewBox="0 0 100 100" aria-hidden="true" class="geo">${GEO[t]}${BASE}</svg>`;
    case 'letters':
      return t === 'p'
        ? '<svg viewBox="0 0 100 100" aria-hidden="true" class="tok"><circle class="body" cx="50" cy="50" r="21"/></svg>'
        : `<svg viewBox="0 0 100 100" aria-hidden="true" class="tok"><circle class="body" cx="50" cy="50" r="37"/><text class="letter" x="50" y="53" text-anchor="middle" dominant-baseline="central">${LETTER[t]}</text></svg>`;
    default:
      return glyph(SOLID[t], 'classic');
  }
}

// Appearance: app colour themes, board colours and piece styles.
// Loaded as a plain (non-module) script in <head> so the saved look is applied
// before the page paints. Exposes window.PR_APPEARANCE.
(function () {
  const LIGHT_SERIES = { 'series-1': '#2a78d6', 'series-2': '#eb6834' };
  const DARK_SERIES = { 'series-1': '#3987e5', 'series-2': '#d95926' };

  const UI = {
    sage: {
      name: 'Sage', dark: false,
      vars: { bg: '#e9eee8', panel: '#ffffff', 'panel-2': '#f4f7f3', ink: '#18211c', 'ink-2': '#47554c', muted: '#6c7a71', line: '#d2dbd3', accent: '#1f5c3f', 'accent-ink': '#ffffff', 'sq-light': '#e4e9d6', 'sq-dark': '#789b80', 'tip-bg': '#18211c', 'tip-ink': '#f3f6f2', ...LIGHT_SERIES },
    },
    linen: {
      name: 'Linen', dark: false,
      vars: { bg: '#f1ede6', panel: '#fffdf9', 'panel-2': '#f7f2ea', ink: '#2a2420', 'ink-2': '#5b5048', muted: '#857a70', line: '#e2d9cc', accent: '#2d4f7c', 'accent-ink': '#ffffff', 'sq-light': '#efdfc5', 'sq-dark': '#b58a62', 'tip-bg': '#2a2420', 'tip-ink': '#fbf7f1', ...LIGHT_SERIES },
    },
    sky: {
      name: 'Sky', dark: false,
      vars: { bg: '#e6edf5', panel: '#ffffff', 'panel-2': '#f1f5fa', ink: '#142030', 'ink-2': '#43536a', muted: '#6b7a8f', line: '#d3dde9', accent: '#1f5fae', 'accent-ink': '#ffffff', 'sq-light': '#dfe8f0', 'sq-dark': '#7f9fbc', 'tip-bg': '#142030', 'tip-ink': '#f1f5fa', ...LIGHT_SERIES },
    },
    lilac: {
      name: 'Lilac', dark: false,
      vars: { bg: '#eeeaf6', panel: '#ffffff', 'panel-2': '#f6f3fb', ink: '#211b2e', 'ink-2': '#554b66', muted: '#7d7390', line: '#ddd5ea', accent: '#5b3fa6', 'accent-ink': '#ffffff', 'sq-light': '#ece4f6', 'sq-dark': '#9c86c4', 'tip-bg': '#211b2e', 'tip-ink': '#f6f3fb', ...LIGHT_SERIES },
    },
    paper: {
      name: 'Paper', dark: false,
      vars: { bg: '#f4f4f2', panel: '#ffffff', 'panel-2': '#f2f2f0', ink: '#1c1c1c', 'ink-2': '#4f4f4f', muted: '#767676', line: '#dddddb', accent: '#262626', 'accent-ink': '#ffffff', 'sq-light': '#ebebe7', 'sq-dark': '#a3a39d', 'tip-bg': '#1c1c1c', 'tip-ink': '#f4f4f2', ...LIGHT_SERIES },
    },
    forest: {
      name: 'Forest', dark: true,
      vars: { bg: '#131815', panel: '#1c231f', 'panel-2': '#222a25', ink: '#e7ece8', 'ink-2': '#b8c4bc', muted: '#8f9c94', line: '#313b35', accent: '#5fb98a', 'accent-ink': '#0f1a14', 'sq-light': '#c2cdb4', 'sq-dark': '#5f8268', 'tip-bg': '#e7ece8', 'tip-ink': '#131815', ...DARK_SERIES },
    },
    midnight: {
      name: 'Midnight', dark: true,
      vars: { bg: '#0f1520', panel: '#172030', 'panel-2': '#1d283b', ink: '#e6ecf5', 'ink-2': '#b3c0d3', muted: '#8593a8', line: '#2a3548', accent: '#6ea8ff', 'accent-ink': '#0b1220', 'sq-light': '#c9d4e0', 'sq-dark': '#5d7899', 'tip-bg': '#e6ecf5', 'tip-ink': '#0f1520', ...DARK_SERIES },
    },
    espresso: {
      name: 'Espresso', dark: true,
      vars: { bg: '#1b1714', panel: '#241f1b', 'panel-2': '#2c2621', ink: '#efe8e0', 'ink-2': '#c8bcae', muted: '#9a8d7f', line: '#3a322b', accent: '#e0a43a', 'accent-ink': '#1b1714', 'sq-light': '#dcc3a1', 'sq-dark': '#9a6f4a', 'tip-bg': '#efe8e0', 'tip-ink': '#1b1714', ...DARK_SERIES },
    },
  };

  const BOARDS = {
    match: { name: 'Match app theme' },
    tournament: { name: 'Tournament', light: '#eeeed2', dark: '#769656' },
    walnut: { name: 'Walnut', light: '#f0d9b5', dark: '#b58863' },
    ocean: { name: 'Ocean', light: '#dee3e6', dark: '#8ca2ad' },
    slate: { name: 'Slate', light: '#d9dde2', dark: '#7a8594' },
    coral: { name: 'Coral', light: '#f6e4d9', dark: '#d1876b' },
    lilac: { name: 'Lilac', light: '#ebe4f5', dark: '#9b85c2' },
    ice: { name: 'Ice', light: '#eef4f8', dark: '#a7c0d3' },
    contrast: { name: 'High contrast', light: '#f7f7f7', dark: '#5c5c5c' },
    // Broadcast boards: modelled on old TV and print chess diagrams; fx adds a frame,
    // a soft CRT look or hatched dark squares.
    broadcast: { name: 'Broadcast', light: '#f7f9fa', dark: '#a7d0e5', fx: 'frame', group: 'Broadcast' },
    vhs: { name: 'VHS', light: '#eef5f6', dark: '#98c4db', fx: 'frame crt', group: 'Broadcast' },
    newspaper: { name: 'Newspaper', light: '#ffffff', dark: '#2b2b2b', fx: 'frame hatch', group: 'Broadcast' },
    studio: { name: 'Studio teal', light: '#f5fbfa', dark: '#8cc5be', fx: 'frame', group: 'Broadcast' },
    nightcast: { name: 'Night broadcast', light: '#cfdeea', dark: '#557e9d', fx: 'frame', group: 'Broadcast' },
  };

  const PIECES = {
    classic: { name: 'Classic', group: 'Standard' },
    diagram: { name: 'Diagram', group: 'Standard' },
    print: { name: 'Book diagram', group: 'Standard' },
    shaded: { name: 'Shaded', group: 'Standard' },
    geometric: { name: 'Geometric', group: 'Standard' },
    wood: { name: 'Wood', group: 'Standard' },
    metal: { name: 'Metal', group: 'Standard' },
    max: { name: 'Max contrast', group: 'High contrast' },
    halo: { name: 'Halo', group: 'High contrast' },
    badge: { name: 'Badge', group: 'High contrast' },
    signal: { name: 'Signal', group: 'High contrast' },
    sketch: { name: 'Sketch', group: 'Playful' },
    pixel: { name: 'Pixel', group: 'Playful' },
    neon: { name: 'Neon', group: 'Playful' },
    letters: { name: 'Letters', group: 'Playful' },
    shapes: { name: 'Shapes', group: 'Playful' },
  };

  // One-click looks: a board and a piece style that belong together.
  const LOOKS = [
    { id: 'broadcast', name: 'Broadcast', note: 'White and sky blue, as in old TV analysis', board: 'broadcast', pieces: 'diagram' },
    { id: 'vhs', name: 'VHS', note: 'The same, with a soft tape-and-tube look', board: 'vhs', pieces: 'diagram' },
    { id: 'newspaper', name: 'Newspaper', note: 'Hatched dark squares, like a printed column', board: 'newspaper', pieces: 'diagram' },
    { id: 'studio', name: 'Studio teal', note: 'Cooler, greener studio blue', board: 'studio', pieces: 'diagram' },
    { id: 'nightcast', name: 'Night broadcast', note: 'Deeper blue, for dark app themes', board: 'nightcast', pieces: 'diagram' },
  ];

  const KEY = 'puzzle-rush.appearance';
  const DEFAULT = { ui: 'auto', board: 'match', pieces: 'classic', sound: true, volume: 70 };
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function resolveUi(id) {
    if (!id || id === 'auto' || !UI[id]) return media && media.matches ? 'forest' : 'sage';
    return id;
  }

  function apply(a) {
    const root = document.documentElement;
    const ui = UI[resolveUi(a.ui)];
    for (const [k, v] of Object.entries(ui.vars)) root.style.setProperty('--' + k, v);
    const b = BOARDS[a.board];
    if (b && b.light) {
      root.style.setProperty('--sq-light', b.light);
      root.style.setProperty('--sq-dark', b.dark);
    }
    root.dataset.boardfx = (b && b.fx) || '';
    root.style.colorScheme = ui.dark ? 'dark' : 'light';
    root.dataset.pieces = PIECES[a.pieces] ? a.pieces : 'classic';
    root.dataset.scheme = ui.dark ? 'dark' : 'light';
  }

  let current = { ...DEFAULT };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) current = { ...DEFAULT, ...saved };
  } catch (e) { /* storage unavailable */ }
  apply(current);

  const listeners = new Set();
  if (media && media.addEventListener) {
    media.addEventListener('change', () => {
      if (current.ui === 'auto') {
        apply(current);
        listeners.forEach((fn) => fn(current));
      }
    });
  }

  window.PR_APPEARANCE = {
    UI, BOARDS, PIECES, LOOKS, DEFAULT,
    resolveUi,
    get: () => ({ ...current }),
    set(patch) {
      current = { ...current, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(current)); } catch (e) { /* ignore */ }
      apply(current);
      listeners.forEach((fn) => fn(current));
      return { ...current };
    },
    onChange(fn) { listeners.add(fn); },
  };
})();

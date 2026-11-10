// Chess sounds, synthesised with the Web Audio API (no sound files needed).
// A "knock" is a short band-passed noise click (the wood contact) plus a quick
// low sine thump (the body of the piece); tones are used for alerts and chimes.

let ctx = null;
let master = null;
let noiseBuf = null;
let enabled = true;
let volume = 0.7;

export function configure(opts = {}) {
  if (opts.enabled != null) enabled = !!opts.enabled;
  if (opts.volume != null) volume = Math.max(0, Math.min(1, opts.volume));
  if (master) master.gain.value = volume;
}

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Browsers only allow audio after a user gesture, so wake the context on the first one.
for (const type of ['pointerdown', 'keydown']) {
  window.addEventListener(type, () => { if (enabled) ensure(); }, { capture: true });
}

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function knock(t, { click = 1900, q = 1.2, clickDecay = 0.035, tone = 190, toneEnd = 95, toneDecay = 0.09, gain = 0.9 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = click;
  bp.Q.value = q;
  const g = ctx.createGain();
  env(g, t, gain, 0.002, clickDecay);
  src.connect(bp).connect(g).connect(master);
  src.start(t, Math.random() * 0.3);
  src.stop(t + clickDecay + 0.03);

  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(tone, t);
  o.frequency.exponentialRampToValueAtTime(toneEnd, t + toneDecay);
  const og = ctx.createGain();
  env(og, t, gain * 0.7, 0.003, toneDecay);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + toneDecay + 0.03);
}

function tone(t, freq, dur, { type = 'sine', gain = 0.2, attack = 0.006, lowpass = 0 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  const g = ctx.createGain();
  env(g, t, gain, attack, dur);
  let node = o;
  if (lowpass) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lowpass;
    node = o.connect(lp);
  }
  node.connect(g).connect(master);
  o.start(t);
  o.stop(t + attack + dur + 0.03);
}

const SOUNDS = {
  move: (t) => knock(t),
  capture: (t) => {
    knock(t, { click: 2700, q: 0.9, clickDecay: 0.05, tone: 240, gain: 1 });
    knock(t + 0.028, { click: 1500, tone: 160, gain: 0.5 });
  },
  castle: (t) => {
    knock(t);
    knock(t + 0.09, { tone: 165, click: 1700 });
  },
  check: (t) => {
    knock(t);
    tone(t + 0.01, 988, 0.17, { type: 'triangle', gain: 0.17 });
    tone(t + 0.01, 1976, 0.1, { gain: 0.05 });
  },
  promote: (t) => {
    knock(t);
    [784, 988, 1175].forEach((f, i) => tone(t + 0.05 + i * 0.06, f, 0.13, { type: 'triangle', gain: 0.13 }));
  },
  correct: (t) => {
    tone(t, 880, 0.18, { gain: 0.24 });
    tone(t + 0.09, 1318.5, 0.3, { gain: 0.21 });
  },
  wrong: (t) => {
    tone(t, 196, 0.22, { type: 'square', gain: 0.07, lowpass: 900 });
    tone(t, 185, 0.22, { type: 'square', gain: 0.05, lowpass: 700 });
  },
  lowtime: (t) => {
    tone(t, 1046.5, 0.07, { type: 'square', gain: 0.09, lowpass: 3000 });
    tone(t + 0.15, 1046.5, 0.07, { type: 'square', gain: 0.09, lowpass: 3000 });
  },
  count: (t) => {
    tone(t, 659.3, 0.12, { type: 'triangle', gain: 0.2 });
  },
  start: (t) => {
    tone(t, 523.3, 0.1, { type: 'triangle', gain: 0.14 });
    tone(t + 0.08, 784, 0.16, { type: 'triangle', gain: 0.14 });
  },
  end: (t) => {
    tone(t, 659.3, 0.16, { type: 'triangle', gain: 0.14 });
    tone(t + 0.15, 523.3, 0.16, { type: 'triangle', gain: 0.14 });
    tone(t + 0.3, 392, 0.4, { type: 'triangle', gain: 0.14 });
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

// Play a named sound, optionally `delay` seconds from now.
export function play(name, delay = 0) {
  if (!enabled || volume <= 0 || !SOUNDS[name]) return;
  const c = ensure();
  if (!c) return;
  SOUNDS[name](c.currentTime + 0.005 + delay);
  window.dispatchEvent(new CustomEvent('chess-sound', { detail: name }));
}

// Render one sound into an OfflineAudioContext (used to check levels in tests).
export async function renderOffline(name, seconds = 1.2) {
  const saved = [ctx, master, noiseBuf];
  const off = new OfflineAudioContext(1, Math.floor(44100 * seconds), 44100);
  ctx = off;
  master = off.createGain();
  master.gain.value = 1;
  master.connect(off.destination);
  noiseBuf = off.createBuffer(1, Math.floor(off.sampleRate * 0.4), off.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  SOUNDS[name](0.01);
  [ctx, master, noiseBuf] = saved;
  return (await off.startRendering()).getChannelData(0);
}

// The right sound for a move, judged from the position after it.
export function moveSound(m, posAfter) {
  if (posAfter.inCheck()) return 'check';
  if (m.promo) return 'promote';
  if (m.flag === 'castleK' || m.flag === 'castleQ') return 'castle';
  if (m.captured) return 'capture';
  return 'move';
}

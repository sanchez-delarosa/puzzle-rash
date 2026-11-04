// Persistence. With serve.py running, everything is saved to data/history.json.
// If the API is unreachable (e.g. another static server), it falls back to the
// browser's localStorage, and any run that failed to reach the server is queued
// and retried on the next load.

const LOCAL_KEY = 'puzzle-rush.v1';
const PENDING_KEY = 'puzzle-rush.pending.v1';

const readLocal = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const writeLocal = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export class Store {
  constructor() {
    this.mode = 'local';
    this.data = { version: 1, runs: [], settings: {} };
  }

  async load() {
    try {
      const res = await fetch('/api/data', { cache: 'no-store' });
      if (!res.ok) throw new Error('no api');
      this.data = await res.json();
      this.mode = 'server';
      const pending = readLocal(PENDING_KEY, []);
      if (pending.length) {
        try {
          await postJson('/api/runs', pending);
          const known = new Set(this.data.runs.map((r) => r.id));
          pending.forEach((r) => known.has(r.id) || this.data.runs.push(r));
          writeLocal(PENDING_KEY, []);
        } catch { /* keep them queued */ }
      }
    } catch {
      this.mode = 'local';
      this.data = readLocal(LOCAL_KEY, { version: 1, runs: [], settings: {} });
    }
    this.data.runs ||= [];
    this.data.settings ||= {};
    return this.data;
  }

  get runs() {
    return this.data.runs;
  }

  get settings() {
    return this.data.settings;
  }

  // Returns 'saved' | 'queued' | 'local'
  async addRun(run) {
    this.data.runs.push(run);
    if (this.mode === 'server') {
      try {
        await postJson('/api/runs', run);
        return 'saved';
      } catch {
        const pending = readLocal(PENDING_KEY, []);
        pending.push(run);
        writeLocal(PENDING_KEY, pending);
        return 'queued';
      }
    }
    writeLocal(LOCAL_KEY, this.data);
    return 'local';
  }

  async saveSettings(settings) {
    this.data.settings = settings;
    if (this.mode === 'server') {
      try {
        await postJson('/api/settings', settings);
        return;
      } catch { /* fall through to local copy */ }
    }
    writeLocal(LOCAL_KEY, this.data);
  }
}

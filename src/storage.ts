import type { StoredPgn, PgnGame, GameAttempt, TrainSettings } from './types';

const KEY = {
  pgns:     'mcg_pgns',
  attempts: 'mcg_attempts',
  settings: 'mcg_settings',
} as const;

const DEFAULT_SETTINGS: TrainSettings = {
  startMove:       15,
  playerColor:     'auto',
  engineDepth:     16,
  engineMultiPv:   3,
  showEval:        false,
  showEngineArrow: true,
};

// ── PGNs ─────────────────────────────────────────────────────────────────────

export function savePgn(id: string, name: string, games: PgnGame[]): void {
  const all = loadAllPgns();
  const idx = all.findIndex((p) => p.id === id);
  const entry: StoredPgn = { id, name, games, savedAt: new Date().toISOString() };
  if (idx >= 0) all[idx] = entry;
  else all.unshift(entry);
  localStorage.setItem(KEY.pgns, JSON.stringify(all));
}

export function loadAllPgns(): StoredPgn[] {
  try { return JSON.parse(localStorage.getItem(KEY.pgns) ?? '[]') as StoredPgn[]; }
  catch { return []; }
}

export function deletePgn(id: string): void {
  localStorage.setItem(KEY.pgns, JSON.stringify(loadAllPgns().filter((p) => p.id !== id)));
}

// ── Attempts ──────────────────────────────────────────────────────────────────

export function saveAttempt(attempt: GameAttempt): void {
  const all = loadAllAttempts();
  all.push(attempt);
  localStorage.setItem(KEY.attempts, JSON.stringify(all));
}

export function loadAttempts(gameId: string): GameAttempt[] {
  return loadAllAttempts().filter((a) => a.gameId === gameId);
}

export function loadAllAttempts(): GameAttempt[] {
  try { return JSON.parse(localStorage.getItem(KEY.attempts) ?? '[]') as GameAttempt[]; }
  catch { return []; }
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function loadSettings(): TrainSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(KEY.settings) ?? '{}') as Partial<TrainSettings>) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s: Partial<TrainSettings>): void {
  localStorage.setItem(KEY.settings, JSON.stringify({ ...loadSettings(), ...s }));
}

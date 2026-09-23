// Versioned save format. Bump SAVE_VERSION and add a migration whenever the
// shape of GameState changes, so old saves keep loading.

import type { GameState } from './types';

export const SAVE_VERSION = 1;

interface SaveFile {
  format: 'homestead-save';
  version: number;
  savedAt: number;
  state: Omit<GameState, 'events'>;
}

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** migrations[n] upgrades a version-n save to version n+1. */
const migrations: Record<number, Migration> = {};

export function serialize(state: GameState, now = Date.now()): string {
  const { events: _events, ...rest } = state;
  const file: SaveFile = { format: 'homestead-save', version: SAVE_VERSION, savedAt: now, state: rest };
  return JSON.stringify(file);
}

export function deserialize(json: string): GameState {
  const file = JSON.parse(json) as Partial<SaveFile>;
  if (file.format !== 'homestead-save' || typeof file.version !== 'number' || !file.state) {
    throw new Error('not a Homestead save file');
  }
  if (file.version > SAVE_VERSION) throw new Error('save is from a newer version of the game');
  let raw = file.state as unknown as Record<string, unknown>;
  for (let v = file.version; v < SAVE_VERSION; v++) {
    const m = migrations[v];
    if (!m) throw new Error(`no migration from save version ${v}`);
    raw = m(raw);
  }
  const state = raw as unknown as GameState;
  for (const key of ['rooms', 'residents', 'incidents', 'rng'] as const) {
    if (!Array.isArray(state[key])) throw new Error(`corrupt save: missing ${key}`);
  }
  return { ...state, events: [] };
}

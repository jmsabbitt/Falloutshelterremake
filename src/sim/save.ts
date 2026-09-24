// Versioned save format. Bump SAVE_VERSION and add a migration whenever the
// shape of GameState changes, so old saves keep loading.

import { newLegacy } from './legacy';
import type { GameState } from './types';

export const SAVE_VERSION = 6;

interface SaveFile {
  format: 'homestead-save';
  version: number;
  savedAt: number;
  state: Omit<GameState, 'events'>;
}

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** migrations[n] upgrades a version-n save to version n+1. */
const migrations: Record<number, Migration> = {
  // v1 (M1) -> v2 (M2): families, gear, items, crates, incident timers, radio.
  1: (s) => {
    const residents = (s['residents'] as Record<string, unknown>[]).map((r) => {
      const id = r['id'] as number;
      return {
        ...r,
        appearance: { skin: id % 6, hair: (id * 7) % 7 },
        motherId: null,
        fatherId: null,
        adultAt: null,
        pregnancy: null,
        courtship: null,
        weapon: null,
        outfit: null,
      };
    });
    const rooms = (s['rooms'] as Record<string, unknown>[]).map((r) => ({ ...r, timer: 0 }));
    const incidents = (s['incidents'] as Record<string, unknown>[]).map((i) => ({
      ...i,
      visited: [i['roomId']],
      emptyFor: 0,
      roomTime: 0,
      doorHp: 0,
      stolen: 0,
    }));
    const time = (s['time'] as number) ?? 0;
    return {
      ...s,
      residents,
      rooms,
      incidents,
      items: [],
      crates: { standard: 3, rare: 0, legendary: 0 },
      crateTokens: 0,
      pity: 0,
      daily: { lastDay: -1, streak: 0 },
      milestones: [],
      incidentTimer: 0,
      nextIncidentAt: 1800,
      nextWandererAt: time + 600,
    };
  },
  // v2 (M2) -> v3 (M3): exploration, salvage, recipes, crafting jobs.
  2: (s) => ({
    ...s,
    residents: (s['residents'] as Record<string, unknown>[]).map((r) => ({ ...r, expedition: null })),
    rooms: (s['rooms'] as Record<string, unknown>[]).map((r) => ({ ...r, job: null })),
    salvage: {},
    recipes: [],
    fragments: {},
    reforgePity: 0,
    expeditions: [],
    regionsUnlocked: ['dustbowl'],
  }),
  // v3 (M3) -> v4 (M4): quests and contracts.
  3: (s) => ({
    ...s,
    residents: (s['residents'] as Record<string, unknown>[]).map((r) => ({ ...r, quest: null })),
    quests: [],
    questsDone: [],
    contracts: { offers: [], refreshAt: 0 },
  }),
  // v4 (M4) -> v5 (M5): prestige. Existing homesteads are the first in their chain.
  4: (s) => ({ ...s, legacy: newLegacy() }),
  // v5 (M5) -> v6 (M6): research, the Deep, traits and mastery, banked batches.
  5: (s) => ({
    ...s,
    residents: (s['residents'] as Record<string, unknown>[]).map((r) => ({ ...r, traits: [], mastery: {} })),
    rooms: (s['rooms'] as Record<string, unknown>[]).map((r) => ({ ...r, banked: 0 })),
    research: { points: 0, done: [] },
    deep: { strata: 0, dig: null, discoveries: [] },
  }),
};

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

// Versioned save format. Bump SAVE_VERSION and add a migration whenever the
// shape of GameState changes, so old saves keep loading.

import { newLegacy } from './legacy';
import type { GameState } from './types';

export const SAVE_VERSION = 11;

/**
 * v11 widened the grid from 26 to 44 cells and moved the starter shaft from
 * x = 6 to x = 24 (balance.json grid.starterShaftX), so older homesteads shift
 * right by this many cells (six segments) and gain the space on their left.
 */
export const V11_GRID_SHIFT = 18;

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
  // v6 (M6) -> v7 (M7): topside weather, factions, Influence, trade, caravans.
  6: (s) => ({
    ...s,
    residents: (s['residents'] as Record<string, unknown>[]).map((r) => ({ ...r, caravan: null })),
    weather: { kind: 'clear', remaining: 3600 },
    factions: {},
    influence: 0,
    trade: { offers: [], refreshAt: 0 },
    caravans: [],
  }),
  // v7 (M7) -> v8 (M9): modes, rulesets, Collection Log, legends, loot, Mauler meter.
  7: (s) => ({
    ...s,
    mode: 'normal',
    rules: { ids: [], survival: false },
    collection: {},
    legends: { recruited: [] },
    loot: { bossKills: [], maps: [] },
    maulerMeter: 0,
  }),
  // v8 (M9) -> v9 (Act 4): the story so far. A homestead that already won an
  // ending's finale (none existed before v9) has nothing to carry.
  8: (s) => ({
    ...s,
    story: { endings: {}, current: null, open: false, title: null },
  }),
  // v9 (Act 4) -> v10 (playtest 1): the first-homestead tutorial. Homesteads
  // saved before it existed started with the classic layout: nothing to teach.
  9: (s) => ({ ...s, tutorial: { step: 'done', done: true } }),
  // v10 -> v11 (playtest 1, round 2): the wider grid. Every room (underground,
  // the Deep and topside) shifts right together, so the layout is unchanged.
  // Rooms are the only thing that stores a grid x; everything else points at a room id.
  10: (s) => ({
    ...s,
    rooms: (s['rooms'] as Record<string, unknown>[]).map((r) => ({ ...r, x: (r['x'] as number) + V11_GRID_SHIFT })),
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

import type { Content } from './content';
import { refreshUnlocks } from './economy';
import { newLegacy } from './legacy';
import { createResident } from './residents';
import { nextInt, seedRng } from './rng';
import { scheduleWanderer } from './systems/arrivals';
import { scheduleIncident } from './systems/incidents';
import type { GameState, Room, StatKey } from './types';

export interface NewGameOptions {
  seed?: number;
  now?: number;
  homesteadNumber?: number;
  /** M9: rulesets (rulesets.json ids) and Survival. */
  rules?: string[];
  survival?: boolean;
  /** M9: start a Custom Game sandbox. */
  mode?: 'normal' | 'custom';
}

export function newGame(content: Content, opts: NewGameOptions = {}): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
  const start = content.balance.start;
  const state: GameState = {
    time: 0,
    lastRealTime: opts.now ?? Date.now(),
    homesteadNumber: 0,
    rng: seedRng(seed),
    nextId: 1,
    scrip: start.scrip,
    resources: { ...start.resources },
    rooms: [],
    residents: [],
    incidents: [],
    items: [],
    salvage: {},
    recipes: [],
    fragments: {},
    reforgePity: 0,
    expeditions: [],
    regionsUnlocked: ['dustbowl'],
    quests: [],
    questsDone: [],
    contracts: { offers: [], refreshAt: 0 },
    legacy: newLegacy(),
    research: { points: 0, done: [] },
    deep: { strata: 0, dig: null, discoveries: [] },
    weather: { kind: 'clear', remaining: 3600 },
    factions: {},
    influence: 0,
    trade: { offers: [], refreshAt: 0 },
    caravans: [],
    mode: opts.mode ?? 'normal',
    rules: { ids: [...(opts.rules ?? [])], survival: opts.survival ?? false },
    collection: {},
    legends: { recruited: [] },
    loot: { bossKills: [], maps: [] },
    maulerMeter: 0,
    crates: { ...start.crates },
    crateTokens: 0,
    pity: 0,
    daily: { lastDay: -1, streak: 0 },
    milestones: [],
    incidentTimer: 0,
    nextIncidentAt: 0,
    nextWandererAt: 0,
    rushStrain: 0,
    peakPopulation: 0,
    unlockedRooms: [],
    achievements: {},
    stats: {},
    offlineConsumed: 0,
    events: [],
  };
  state.homesteadNumber = opts.homesteadNumber ?? nextInt(state.rng, 100, 999);

  const place = (type: string, floor: number, x: number): Room => {
    const room: Room = { id: state.nextId++, type, floor, x, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 };
    state.rooms.push(room);
    return room;
  };

  // Starter layout: door, an elevator shaft three floors deep, and the basics.
  place('door', 0, 0);
  place('elevator', 0, 6);
  place('quarters', 0, 7);
  place('elevator', 1, 6);
  place('generator', 1, 7);
  place('canteen', 1, 10);
  place('elevator', 2, 6);
  place('waterworks', 2, 7);

  // The founding crew each have a clear specialty matching a starter room, so
  // the first hour teaches "put people where they are good".
  for (let i = 0; i < start.waitingResidents; i++) {
    const res = createResident(state, content, { sex: i % 2 === 0 ? 'f' : 'm' });
    const specialty = start.specialties[i % start.specialties.length] as StatKey | undefined;
    if (specialty) {
      res.stats[specialty] = Math.max(res.stats[specialty], nextInt(state.rng, start.specialtyMin, start.specialtyMax));
    }
    state.residents.push(res);
  }

  scheduleIncident(state, content);
  scheduleWanderer(state, content);
  refreshUnlocks(state, content);
  state.events = [];
  return state;
}

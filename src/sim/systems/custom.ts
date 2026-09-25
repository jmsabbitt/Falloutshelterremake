// M9: the Custom Game sandbox (GDD §11). `newCustomGame` builds a homestead
// from a preset (rulesets.json) or from options: resources, residents, a room
// layout, research, regions and rules. Custom games run in `mode: 'custom'`,
// earn no achievements and may use the sandbox console (`custom` commands),
// which refuses in normal games. Time scale is client-side and not in the sim.
// See docs/design/M9-spec.md.

import { maxLevel, type Content } from '../content';
import { refreshUnlocks, resourceCapacity, storageCapacity, population } from '../economy';
import { canPlace, connectedRoomIds, mergeFloor, roomDef, TOPSIDE_FLOOR } from '../grid';
import { createResident, hpPerLevel } from '../residents';
import { nextFloat, nextInt, pick } from '../rng';
import { newGame } from '../state';
import type { CrateTier, GameState, IncidentType, Rarity, Resident, ResourceKey, Room, Sex, StatKey, Stats, WeatherKind } from '../types';
import { STAT_KEYS } from '../types';
import { autoAssign } from './assign';
import { deepContent, isDeepFloor } from './deep';
import { incidentDef, scheduleIncident, startIncident, startRaid, touchesDirt } from './incidents';
import { grantItem, itemDef } from './items';
import { checkRules, rulesetsContent } from './rulesets';
import { weatherKindDef } from './weather';

// ------------------------------------------------------------------ options and presets

/** One room of a preset layout. `x` is optional: rooms are packed beside the shaft at x = 6. */
export interface CustomRoom {
  type: string;
  floor: number;
  /** 1..the type's max width (default 1). */
  segments?: number;
  /** 1..3 (default 1). */
  level?: number;
  x?: number;
}

export interface CustomGameOptions {
  seed?: number;
  now?: number;
  scrip?: number;
  /** Starting stores; clamped to storage. `fillStorage` fills every store instead. */
  resources?: Partial<Record<ResourceKey, number>>;
  fillStorage?: boolean;
  /** Admitted residents to start with (replaces the usual waiting party). */
  population?: number;
  /** Of those, how many lie fallen where they worked (A Ruined Homestead). */
  fallen?: number;
  /** Residents start hurt and a little Glare-sick. */
  injured?: boolean;
  /** Residents' levels are rolled in this range. */
  levelRange?: [number, number];
  rarity?: Rarity;
  /** Counts as the highest population reached: unlocks rooms like the real thing. */
  peakPopulation?: number;
  /** Rooms besides the door; replaces the starter layout. Elevators are added at x = 6 down to the deepest floor used. */
  layout?: CustomRoom[];
  /** Strata of the Deep already dug. */
  strata?: number;
  research?: string[] | 'all';
  regions?: string[] | 'all';
  /** Any rulesets (no unlocks needed in a sandbox), and Survival. */
  rules?: string[];
  survival?: boolean;
  crates?: Partial<Record<CrateTier, number>>;
  /** Item definition ids placed in storage. */
  items?: string[];
}

export interface CustomPreset {
  id: string;
  name: string;
  blurb: string;
  options: CustomGameOptions;
}

export function customPresets(content: Content): CustomPreset[] {
  return rulesetsContent(content).presets as unknown as CustomPreset[];
}

export function customPreset(content: Content, id: string): CustomPreset | undefined {
  return customPresets(content).find((p) => p.id === id);
}

const SHAFT_X = 6;

function allResearch(content: Content): string[] {
  return (content.research as unknown as { nodes: { id: string }[] }).nodes.map((n) => n.id);
}

function allRegions(content: Content): string[] {
  return (content.exploration as unknown as { regions: { id: string }[] }).regions.map((r) => r.id);
}

function newRoom(state: GameState, type: string, floor: number, x: number): Room {
  return { id: state.nextId++, type, floor, x, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 };
}

/** First x where `cells` free cells in a row fit on a floor, right of the shaft first, then left of it. */
function freeRun(state: GameState, content: Content, floor: number, cells: number): number | null {
  const width = content.balance.grid.cellsPerFloor;
  const occ: boolean[] = new Array(width).fill(false);
  for (const r of state.rooms) {
    if (r.floor !== floor) continue;
    const w = roomDef(content, r).cells * r.segments;
    for (let i = 0; i < w; i++) occ[r.x + i] = true;
  }
  const fits = (x: number) => x >= 0 && x + cells <= width && occ.slice(x, x + cells).every((c) => !c);
  if (floor === TOPSIDE_FLOOR) {
    for (let x = 0; x + cells <= width; x++) if (fits(x)) return x;
    return null;
  }
  // Right of the shaft: pack from the shaft outwards.
  for (let x = SHAFT_X + 1; x + cells <= width; x++) {
    if (fits(x) && (x === SHAFT_X + 1 || occ[x - 1])) return x;
  }
  // Left of the shaft: pack from the shaft outwards.
  for (let x = SHAFT_X - cells; x >= 0; x--) {
    if (fits(x) && (x + cells === SHAFT_X || occ[x + cells])) return x;
  }
  return null;
}

/** Replace the starter rooms with a layout. Returns an error, or null. */
function buildLayout(state: GameState, content: Content, layout: CustomRoom[]): string | null {
  const door = state.rooms.find((r) => r.type === 'door');
  state.rooms = door ? [door] : [];
  for (const r of state.residents) r.roomId = null;
  const floors = layout.map((r) => r.floor);
  const deepest = Math.max(0, ...floors);
  for (let f = 0; f <= deepest; f++) {
    const ok = canPlace(state, content, 'elevator', f, SHAFT_X);
    if (!ok.ok) return `layout: elevator on floor ${f}: ${ok.reason}`;
    state.rooms.push(newRoom(state, 'elevator', f, SHAFT_X));
  }
  // Surface first-to-last along the row; everything else floor by floor.
  const order = [...layout].sort((a, b) => a.floor - b.floor);
  for (const spec of order) {
    const def = content.rooms[spec.type];
    if (!def || !def.buildable || def.category === 'elevator') return `layout: cannot place ${spec.type}`;
    const segments = Math.max(1, Math.floor(spec.segments ?? 1));
    const level = Math.max(1, Math.floor(spec.level ?? 1));
    if (segments > def.maxSegments) return `layout: ${spec.type} is at most ${def.maxSegments} wide`;
    if (level > maxLevel(def)) return `layout: ${spec.type} goes up to level ${maxLevel(def)}`;
    const cells = def.cells * segments;
    const x = spec.x ?? freeRun(state, content, spec.floor, cells);
    if (x === null) return `layout: no room for ${spec.type} on floor ${spec.floor}`;
    // Place segment by segment next to the connected network, then merge.
    const placed: Room[] = [];
    const xs = Array.from({ length: segments }, (_, i) => x + i * def.cells);
    // Grow from the side that touches the network (the shaft is to the right of left-side rooms).
    if (spec.floor !== TOPSIDE_FLOOR && x < SHAFT_X) xs.reverse();
    for (const sx of xs) {
      const ok = canPlace(state, content, def.id, spec.floor, sx);
      if (!ok.ok) return `layout: ${spec.type} on floor ${spec.floor}: ${ok.reason}`;
      const room = newRoom(state, def.id, spec.floor, sx);
      state.rooms.push(room);
      placed.push(room);
    }
    // Merge just these segments (not into a neighbour of the same type).
    const others = state.rooms.filter((r) => !placed.includes(r));
    state.rooms = placed;
    mergeFloor(state, content, spec.floor);
    const merged = state.rooms;
    state.rooms = [...others, ...merged];
    for (const r of merged) r.level = level;
  }
  return null;
}

function setLevel(content: Content, r: Resident, level: number): void {
  const target = Math.max(1, Math.min(content.balance.resident.maxLevel, Math.floor(level)));
  while (r.level < target) {
    r.level++;
    r.maxHp += hpPerLevel(content, r);
  }
  r.hp = r.maxHp - r.taint;
}

/**
 * Start a Custom Game from a preset id or options. The result is a normal
 * game state with `mode: 'custom'`.
 */
export function newCustomGame(content: Content, preset: string | CustomGameOptions, extra: { seed?: number; now?: number } = {}): { ok: true; state: GameState } | { ok: false; reason: string } {
  let opts: CustomGameOptions;
  if (typeof preset === 'string') {
    const p = customPreset(content, preset);
    if (!p) return { ok: false, reason: 'no such preset' };
    opts = { ...p.options };
  } else opts = { ...preset };
  if (extra.seed !== undefined) opts.seed = extra.seed;
  if (extra.now !== undefined) opts.now = extra.now;

  const rules = [...new Set(opts.rules ?? [])];
  const state = newGame(content, { seed: opts.seed, now: opts.now, mode: 'custom', rules, survival: opts.survival ?? false });
  const badRules = checkRules(state, content, rules, opts.survival);
  if (badRules) return { ok: false, reason: badRules };

  if (opts.strata !== undefined) {
    const max = deepContent(content).strata.length;
    state.deep.strata = Math.max(0, Math.min(max, Math.floor(opts.strata)));
  }
  if (opts.research) {
    const all = allResearch(content);
    const list = opts.research === 'all' ? all : opts.research;
    for (const id of list) if (!all.includes(id)) return { ok: false, reason: `no such research: ${id}` };
    state.research.done = [...new Set(list)];
  }
  if (opts.regions) {
    const all = allRegions(content);
    const list = opts.regions === 'all' ? all : opts.regions;
    for (const id of list) if (!all.includes(id)) return { ok: false, reason: `no such region: ${id}` };
    state.regionsUnlocked = [...new Set(['dustbowl', ...list])];
  }
  if (opts.layout) {
    const err = buildLayout(state, content, opts.layout);
    if (err) return { ok: false, reason: err };
  }

  if (opts.population !== undefined) {
    const n = Math.max(0, Math.floor(opts.population));
    if (n > storageCapacity(state, content, 'population')) return { ok: false, reason: `the quarters sleep ${storageCapacity(state, content, 'population')}, not ${n}` };
    const [lo, hi] = opts.levelRange ?? [1, 1];
    state.residents = [];
    for (let i = 0; i < n; i++) {
      const r = createResident(state, content, { sex: i % 2 === 0 ? 'f' : 'm', rarity: opts.rarity });
      r.waiting = false;
      setLevel(content, r, nextInt(state.rng, Math.max(1, lo), Math.max(lo, hi)));
      state.residents.push(r);
    }
    autoAssign(state, content);
    const fallen = Math.min(n, Math.max(0, Math.floor(opts.fallen ?? 0)));
    for (const r of state.residents.slice(0, fallen)) {
      r.dead = true;
      r.hp = 0;
    }
    if (opts.injured) {
      for (const r of state.residents) {
        if (r.dead) continue;
        r.taint = Math.floor(r.maxHp * 0.2 * nextFloat(state.rng));
        r.hp = Math.max(1, Math.floor((r.maxHp - r.taint) * (0.3 + 0.4 * nextFloat(state.rng))));
      }
    }
  } else if (opts.levelRange) {
    for (const r of state.residents) setLevel(content, r, nextInt(state.rng, opts.levelRange[0], opts.levelRange[1]));
  }

  if (opts.peakPopulation !== undefined) state.peakPopulation = Math.max(state.peakPopulation, Math.min(content.balance.maxPopulation, opts.peakPopulation));
  if (opts.scrip !== undefined) state.scrip = Math.max(0, Math.min(content.balance.maxScrip, opts.scrip));
  for (const key of Object.keys(state.resources) as ResourceKey[]) {
    const cap = resourceCapacity(state, content, key);
    const want = opts.fillStorage ? cap : (opts.resources?.[key] ?? state.resources[key]);
    state.resources[key] = Math.max(0, Math.min(cap, want));
  }
  if (opts.crates) for (const [tier, n] of Object.entries(opts.crates)) state.crates[tier as CrateTier] = Math.max(0, Math.floor(n ?? 0));
  for (const defId of opts.items ?? []) {
    if (!itemDef(content, defId)) return { ok: false, reason: `no such item: ${defId}` };
    grantItem(state, content, defId);
  }

  state.stats = {};
  scheduleIncident(state, content);
  refreshUnlocks(state, content);
  state.events = [];
  return { ok: true, state };
}

// ------------------------------------------------------------------ the sandbox console

export type CustomCommand =
  | { action: 'setResource'; resource: ResourceKey | 'scrip' | 'influence'; amount: number }
  | { action: 'spawnResident'; level?: number; stats?: Partial<Stats>; rarity?: Rarity; sex?: Sex; firstName?: string; lastName?: string }
  | { action: 'spawnItem'; defId: string; count?: number }
  | { action: 'triggerIncident'; incident: IncidentType; roomId?: number }
  | { action: 'setWeather'; kind: WeatherKind; minutes?: number }
  | { action: 'grantResearch'; points: number }
  | { action: 'unlockAll' };

export const CUSTOM_ACTIONS: CustomCommand['action'][] = ['setResource', 'spawnResident', 'spawnItem', 'triggerIncident', 'setWeather', 'grantResearch', 'unlockAll'];

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Run a sandbox command. Refuses outside a Custom Game. */
export function applyCustom(state: GameState, content: Content, cmd: CustomCommand): string | null {
  if (state.mode !== 'custom') return 'the sandbox console only works in a Custom Game';
  switch (cmd.action) {
    case 'setResource': {
      if (!num(cmd.amount) || cmd.amount < 0) return 'bad amount';
      if (cmd.resource === 'scrip') state.scrip = Math.min(content.balance.maxScrip, Math.floor(cmd.amount));
      else if (cmd.resource === 'influence') state.influence = Math.floor(cmd.amount);
      else if (cmd.resource in state.resources) state.resources[cmd.resource] = Math.min(resourceCapacity(state, content, cmd.resource), cmd.amount);
      else return 'no such resource';
      return null;
    }
    case 'spawnResident': {
      const level = cmd.level ?? 1;
      if (!num(level) || level < 1 || level > content.balance.resident.maxLevel) return 'bad level';
      if (cmd.rarity !== undefined && !['common', 'rare', 'legendary'].includes(cmd.rarity)) return 'bad rarity';
      if (cmd.sex !== undefined && cmd.sex !== 'f' && cmd.sex !== 'm') return 'bad sex';
      let stats: Stats | undefined;
      if (cmd.stats !== undefined) {
        if (typeof cmd.stats !== 'object' || cmd.stats === null) return 'bad stats';
        for (const [k, v] of Object.entries(cmd.stats)) {
          if (!(STAT_KEYS as readonly string[]).includes(k)) return `no such stat: ${k}`;
          if (!num(v) || v < 1 || v > 10) return `bad ${k}`;
        }
      }
      const r = createResident(state, content, { rarity: cmd.rarity, sex: cmd.sex, firstName: cmd.firstName, lastName: cmd.lastName });
      if (cmd.stats) {
        stats = { ...r.stats };
        for (const [k, v] of Object.entries(cmd.stats)) stats[k as StatKey] = Math.floor(v as number);
        r.stats = stats;
      }
      setLevel(content, r, level);
      // In they come if there is a bed; otherwise they wait at the door.
      r.waiting = population(state) >= storageCapacity(state, content, 'population');
      state.residents.push(r);
      state.events.push({ type: 'residentArrived', residentId: r.id, source: 'recruit' });
      return null;
    }
    case 'spawnItem': {
      if (!itemDef(content, cmd.defId)) return 'no such item';
      const count = cmd.count ?? 1;
      if (!num(count) || count < 1 || count > 100 || count !== Math.floor(count)) return 'bad count';
      for (let i = 0; i < count; i++) grantItem(state, content, cmd.defId);
      return null;
    }
    case 'triggerIncident': {
      const types = Object.keys(content.balance.incidents.types);
      if (!types.includes(cmd.incident)) return 'no such incident';
      const def = incidentDef(content, cmd.incident);
      if (def.external) {
        if (state.incidents.some((i) => incidentDef(content, i.type).external)) return 'raiders are already here';
        return startRaid(state, content) ? null : 'there is no door to knock on';
      }
      const busy = new Set(state.incidents.map((i) => i.roomId));
      const connected = connectedRoomIds(state, content);
      const fits = (room: Room) => {
        const cat = roomDef(content, room).category;
        if (cat === 'door' || cat === 'elevator' || room.floor === TOPSIDE_FLOOR) return false;
        if (busy.has(room.id) || !connected.has(room.id)) return false;
        if (def.deepOnly && !isDeepFloor(content, room.floor)) return false;
        if (def.needsDirt && !touchesDirt(state, content, room)) return false;
        return true;
      };
      let room: Room | undefined;
      if (cmd.roomId !== undefined) {
        room = state.rooms.find((r) => r.id === cmd.roomId);
        if (!room) return 'no such room';
        if (!fits(room)) return 'that incident cannot start in that room';
      } else {
        const options = state.rooms.filter(fits);
        if (!options.length) return 'no room it could start in';
        room = pick(state.rng, options);
      }
      startIncident(state, content, cmd.incident, room);
      return null;
    }
    case 'setWeather': {
      if (!weatherKindDef(content, cmd.kind)) return 'no such weather';
      const minutes = cmd.minutes ?? 30;
      if (!num(minutes) || minutes <= 0 || minutes > 24 * 60) return 'bad minutes';
      if (state.weather.kind !== cmd.kind) state.events.push({ type: 'weatherChanged', kind: cmd.kind });
      state.weather = { kind: cmd.kind, remaining: minutes * 60 };
      return null;
    }
    case 'grantResearch': {
      if (!num(cmd.points) || cmd.points <= 0) return 'bad points';
      state.research.points += cmd.points;
      return null;
    }
    case 'unlockAll': {
      state.research.done = [...new Set([...state.research.done, ...allResearch(content)])];
      state.regionsUnlocked = [...new Set([...state.regionsUnlocked, ...allRegions(content)])];
      state.deep.strata = Math.max(state.deep.strata, deepContent(content).strata.length);
      state.peakPopulation = Math.max(state.peakPopulation, content.balance.maxPopulation);
      for (const def of content.roomList) if (def.buildable && !state.unlockedRooms.includes(def.id)) state.unlockedRooms.push(def.id);
      for (const id of Object.keys(content.items)) if (content.items[id]?.rarity !== 'common' && !state.recipes.includes(id)) state.recipes.push(id);
      for (const f of (content.factions as unknown as { factions: { id: string }[] }).factions) {
        state.factions[f.id] = { rep: state.factions[f.id]?.rep ?? 0, met: true };
      }
      return null;
    }
  }
  return 'no such sandbox command';
}

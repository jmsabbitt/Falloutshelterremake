// Surface weather (GDD §6.4): topside buildings are exposed to dust storms,
// taint storms and heatwaves. Weather shifts production up top and can hurt
// residents working there.
//
// CONTRACT (M7, stream A). Keep these signatures; see docs/design/M7-spec.md.
//
// - Weather rotates through weighted kinds, each lasting a rolled number of
//   minutes, online and offline. The countdown carries its remainder, so one
//   60 s step lands exactly where sixty 1 s steps do. Rolls come from a hash
//   of the homestead number and the change count rather than state.rng, so
//   the sky never shifts the dice of any other system.
// - weatherMult: the kind's production multiplier (or a building's own, from
//   topside.json -> buildings) for rooms on floor < 0; 1 underground.
//   Weatherproofing shrinks penalties; topsideOutput adds on top.
// - Taint storms (online only) give Glare to everyone in a topside room.
//   Glare Awnings / Storm Drills (stormShielding) and a staffed Watchtower's
//   shelter share cut it. It never kills: it stops at storm.taintCap x max HP.
// - raidDefense: staffed Watchtowers soften raids (door damage, raider
//   damage) and spot them earlier. Incidents call it; see the M7 report.

import type { Content } from '../content';
import { bonus, type BonusEffect } from '../bonuses';
import { roomDef } from '../grid';
import { bump, bumpMax, effectiveMaxHp, effectiveStat, isAway, workersInRoom } from '../residents';
import type { GameState, Room, WeatherKind, WeatherState } from '../types';

export interface WeatherKindDef {
  name: string;
  description?: string;
  weight: number;
  minutes: [number, number];
  /** Output multiplier for topside production rooms. */
  production: number;
  /** Taint per minute for residents working topside. */
  taintPerMin?: number;
}

export interface WatchtowerTuning {
  /** Crew Sight at which a tower gives its full share. */
  sightForFull: number;
  /** Per tower level: share of door damage raiders don't do. */
  doorShare: number[];
  /** Per tower level: share of raider damage defenders don't take. */
  damageShare: number[];
  /** Per tower level: seconds of warning before raiders reach the door. */
  warnSeconds: number[];
  /** Per tower level: share of storm taint it spares topside workers (best tower counts). */
  stormShelter: number[];
  maxDoorShare: number;
  maxDamageShare: number;
  maxWarnSeconds: number;
}

export interface TopsideContent {
  weather: { kinds: Record<WeatherKind, WeatherKindDef> };
  /** Per-building multipliers by weather kind (override the kind's production). */
  buildings?: Record<string, Partial<Record<WeatherKind, number>>>;
  storm?: { taintCap: number; maxShielding: number };
  watchtower?: WatchtowerTuning;
}

/** Research effect keys this system reads (see the M7 report for bonuses.ts). */
export const TOPSIDE_EFFECTS = {
  /** Fraction by which weather penalties shrink (0.5 turns x0.6 into x0.8). */
  weatherproofing: 'weatherproofing',
  /** Fraction of storm taint topside workers are spared. */
  stormShielding: 'stormShielding',
  /** Extra effective Signal Mast levels (read by factions). */
  signalRange: 'signalRange',
  /** Extra output for topside production rooms, as a fraction. */
  topsideOutput: 'topsideOutput',
} as const;

function topsideBonus(state: GameState, content: Content, key: keyof typeof TOPSIDE_EFFECTS): number {
  return bonus(state, content, TOPSIDE_EFFECTS[key] as BonusEffect);
}

const DEFAULT_WEATHER: WeatherState = { kind: 'clear', remaining: 3600 };

export function topsideContent(content: Content): TopsideContent {
  return content.topside as unknown as TopsideContent;
}

export function isTopside(room: Room): boolean {
  return room.floor < 0;
}

export function weatherKindDef(content: Content, kind: WeatherKind): WeatherKindDef | undefined {
  return topsideContent(content).weather.kinds[kind];
}

/** The current weather (tolerates saves or tests without it). */
export function currentWeather(state: GameState): WeatherState {
  if (!state.weather) state.weather = { ...DEFAULT_WEATHER };
  return state.weather;
}

/** Production multiplier for a room from the weather (1 below ground). */
export function weatherMult(state: GameState, content: Content, room: Room): number {
  if (!isTopside(room)) return 1;
  const kind = currentWeather(state).kind;
  const tc = topsideContent(content);
  let m = tc.buildings?.[room.type]?.[kind] ?? tc.weather.kinds[kind]?.production ?? 1;
  if (m < 1) m = 1 - (1 - m) * (1 - Math.min(1, Math.max(0, topsideBonus(state, content, 'weatherproofing'))));
  return m * (1 + topsideBonus(state, content, 'topsideOutput'));
}

/** Extra effective Signal Mast levels from research (Signal Booster). */
export function signalRange(state: GameState, content: Content): number {
  return Math.floor(topsideBonus(state, content, 'signalRange'));
}

// ------------------------------------------------------------------ rolls

/** Deterministic float in [0, 1) from the homestead and the change count. */
function roll(state: GameState, n: number, salt: number): number {
  let z = (Math.imul((state.homesteadNumber | 0) + 0x632be5ab, 0x9e3779b1) ^ Math.imul(n + 1, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x7feb352d);
  z = Math.imul(z ^ (z >>> 15), 0x846ca68b);
  z = (z ^ (z >>> 16)) >>> 0;
  return z / 4294967296;
}

/** The weather after `current`: a weighted pick among the other kinds, and its length in seconds. */
export function nextWeather(state: GameState, content: Content, current: WeatherKind, n: number): WeatherState {
  const kinds = topsideContent(content).weather.kinds;
  const options = (Object.keys(kinds) as WeatherKind[]).filter((k) => k !== current && (kinds[k]?.weight ?? 0) > 0);
  const pool = options.length ? options : [current];
  const total = pool.reduce((s, k) => s + (kinds[k]?.weight ?? 1), 0);
  let r = roll(state, n, 0) * total;
  let kind = pool[pool.length - 1] as WeatherKind;
  for (const k of pool) {
    r -= kinds[k]?.weight ?? 1;
    if (r < 0) {
      kind = k;
      break;
    }
  }
  const [lo, hi] = kinds[kind]?.minutes ?? [30, 60];
  return { kind, remaining: (lo + roll(state, n, 1) * (hi - lo)) * 60 };
}

// ------------------------------------------------------------------ watchtowers

interface TowerReading {
  room: Room;
  /** 0..1: how well staffed (crew Sight / sightForFull). */
  strength: number;
}

function staffedTowers(state: GameState, content: Content): TowerReading[] {
  const t = topsideContent(content).watchtower;
  if (!t) return [];
  const out: TowerReading[] = [];
  for (const room of state.rooms) {
    if (room.type !== 'watchtower') continue;
    const crew = workersInRoom(state, room.id).filter((r) => !isAway(r) && !r.waiting);
    if (!crew.length) continue;
    const sight = crew.reduce((s, r) => s + effectiveStat(content, r, 'sight'), 0);
    out.push({ room, strength: Math.min(1, sight / Math.max(1, t.sightForFull)) });
  }
  return out;
}

function levelValue(table: number[], level: number): number {
  return table[Math.min(table.length, Math.max(1, level)) - 1] ?? 0;
}

export interface RaidDefense {
  /** Multiply raiders' damage to the door by this. */
  doorDamageMult: number;
  /** Multiply raiders' damage to defenders by this. */
  damageMult: number;
  /** Seconds of warning before raiders start on the door. */
  warnSeconds: number;
  /** Staffed Watchtowers counted. */
  towers: number;
}

/** How much staffed Watchtowers soften a raid. All 1 / 0 without one. */
export function raidDefense(state: GameState, content: Content): RaidDefense {
  const t = topsideContent(content).watchtower;
  const towers = staffedTowers(state, content);
  if (!t || !towers.length) return { doorDamageMult: 1, damageMult: 1, warnSeconds: 0, towers: 0 };
  let door = 0;
  let dmg = 0;
  let warn = 0;
  for (const { room, strength } of towers) {
    door += levelValue(t.doorShare, room.level) * strength;
    dmg += levelValue(t.damageShare, room.level) * strength;
    warn += levelValue(t.warnSeconds, room.level) * strength;
  }
  return {
    doorDamageMult: 1 - Math.min(t.maxDoorShare, door),
    damageMult: 1 - Math.min(t.maxDamageShare, dmg),
    warnSeconds: Math.min(t.maxWarnSeconds, warn),
    towers: towers.length,
  };
}

/** Share of storm taint topside workers are spared (research plus the best staffed tower). */
export function stormShielding(state: GameState, content: Content): number {
  const tc = topsideContent(content);
  const shelter = Math.max(0, ...staffedTowers(state, content).map(({ room, strength }) => levelValue(tc.watchtower?.stormShelter ?? [], room.level) * strength));
  return Math.min(tc.storm?.maxShielding ?? 0.9, Math.max(0, topsideBonus(state, content, 'stormShielding')) + shelter);
}

// ------------------------------------------------------------------ tick

function stormTaint(state: GameState, content: Content, perMin: number, dt: number): void {
  const topside = new Set(state.rooms.filter(isTopside).map((r) => r.id));
  if (!topside.size) return;
  const exposed = state.residents.filter((r) => r.roomId !== null && topside.has(r.roomId) && !r.dead && !r.waiting && !isAway(r));
  if (!exposed.length) return;
  const amount = perMin * (dt / 60) * (1 - stormShielding(state, content));
  if (amount <= 0) return;
  const capFrac = topsideContent(content).storm?.taintCap ?? 0.5;
  let total = 0;
  for (const r of exposed) {
    const cap = Math.min(r.maxHp - 1, r.maxHp * capFrac);
    if (r.taint >= cap) continue;
    const add = Math.min(amount, cap - r.taint);
    r.taint += add;
    r.hp = Math.min(r.hp, effectiveMaxHp(r));
    total += add;
  }
  if (total > 0) bump(state, 'stormTaint', total);
}

/** Weather changes over time (online and offline); storms hurt topside workers (online only). */
export function tickWeather(state: GameState, content: Content, dt: number, offline: boolean): void {
  if (dt <= 0) return;
  const w = currentWeather(state);
  const topsideRooms = state.rooms.filter(isTopside);

  // Counters for achievements (cheap: a handful of rooms).
  if (topsideRooms.length) {
    bumpMax(state, 'topsideBuildings', topsideRooms.filter((r) => roomDef(content, r).topside).length);
    for (const tower of staffedTowers(state, content)) bumpMax(state, 'watchtowerLevel', tower.room.level);
  }

  // Storm Glare applies to the weather this step started in (1 s steps online).
  const perMin = weatherKindDef(content, w.kind)?.taintPerMin ?? 0;
  if (!offline && perMin > 0) stormTaint(state, content, perMin, Math.min(dt, Math.max(0, w.remaining)));

  w.remaining -= dt;
  let guard = 0;
  while (w.remaining <= 1e-9 && guard++ < 1000) {
    const was = w.kind;
    if (was === 'taintstorm' && topsideRooms.length) bump(state, 'stormsWeathered');
    const n = state.stats['weatherChanges'] ?? 0;
    const next = nextWeather(state, content, was, n);
    bump(state, 'weatherChanges');
    bump(state, `weather.${next.kind}`);
    w.kind = next.kind;
    w.remaining += next.remaining;
    state.events.push({ type: 'weatherChanged', kind: next.kind });
  }
}

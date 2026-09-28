// The Deep: excavating strata below the base grid (GDD §6.3). Each stratum
// opens more floors, deep-only rooms, deep threats and story discoveries.
//
// - Excavation digs the next stratum from the bottom of an elevator shaft. It
//   costs scrip, needs its survey research, and runs online and offline.
// - Discoveries (Halcyon logs and relics) turn up when a dig breaks through,
//   and while residents work jobs on deep floors (online only). Some carry a
//   small reward.
// - The Ore Refinery turns its workers' Knack into salvage, online and offline.
// - Deep threats (cave-ins, floods, Deepcrawlers) live in incidents.ts.
//
// CONTRACT (M6, stream B). Keep these signatures; see docs/design/M6-spec.md.

import type { Content, SalvageMaterial } from '../content';
import { addScrip } from '../economy';
import { connectedRoomIds, roomDef } from '../grid';
import { bonus, productionMult } from '../bonuses';
import { bump, bumpMax, workersInRoom } from '../residents';
import { nextFloat, nextInt, pick } from '../rng';
import type { CrateTier, GameState, Rarity, Room } from '../types';
import { earnCrate } from './crates';
import { addFragment, addSalvage, fragmentsNeeded, knowsRecipe, unlockRecipe } from './inventory';
import { happinessBonus, roomStatTotal } from './production';

export interface StratumDef {
  index: number;
  name: string;
  description: string;
  requiresResearch?: string;
}

/** A small reward some discoveries carry, paid through the usual helpers. */
export interface DiscoveryReward {
  scrip?: number;
  crate?: CrateTier;
  /** A blueprint fragment toward a random recipe of this rarity not yet known. */
  fragment?: 'rare' | 'legendary';
  /** A whole recipe (item definition id). */
  recipe?: string;
  salvage?: { rarity: Rarity; count: [number, number]; materials?: SalvageMaterial[] };
}

export interface DiscoveryDef {
  id: string;
  title: string;
  text: string;
  /** Stratum it is found in (1..4). */
  stratum: number;
  /** For the client: a log (read) or a relic (an object). */
  kind?: 'log' | 'relic';
  /** Found when the dig into its stratum breaks through. */
  onDig?: boolean;
  reward?: DiscoveryReward;
}

export interface RefineryTuning {
  pointsPerSegment: number;
  levelMult: number[];
  /** Material weights for the salvage rolled. */
  materials: Record<string, number>;
  rareChance: number[];
  legendaryChance: number[];
}

export interface DeepIncidentTuning {
  /** Chance scale that a random incident lands in the Deep, times the deep share of rooms. */
  share: number;
  /** Extra deep incident HP and damage per stratum below the first. */
  perStratum: number;
  bracing: { research: string; shareMult: number; hpMult: number; dpsMult: number };
}

export interface DeepContent {
  tuning: {
    floorsPerStratum: number;
    requiresResearch: string;
    digHours: number[];
    digScrip: number[];
    discovery: { workerSeconds: number; growth: number };
    refinery: RefineryTuning;
    incidents: DeepIncidentTuning;
  };
  strata: StratumDef[];
  discoveries: Record<string, DiscoveryDef>;
}

export function deepContent(content: Content): DeepContent {
  return content.deep as unknown as DeepContent;
}

/** Floors available in total: the base grid plus every excavated stratum. */
export function totalFloors(state: GameState, content: Content): number {
  return content.balance.grid.floors + state.deep.strata * deepContent(content).tuning.floorsPerStratum;
}

/** True for floors below the base grid. */
export function isDeepFloor(content: Content, floor: number): boolean {
  return floor >= content.balance.grid.floors;
}

/** Stratum a floor belongs to (0 for the base grid). */
export function stratumOf(content: Content, floor: number): number {
  if (!isDeepFloor(content, floor)) return 0;
  return 1 + Math.floor((floor - content.balance.grid.floors) / deepContent(content).tuning.floorsPerStratum);
}

export function stratumDef(content: Content, index: number): StratumDef | undefined {
  return deepContent(content).strata.find((s) => s.index === index);
}

export function discoveryDef(content: Content, id: string): DiscoveryDef | undefined {
  return deepContent(content).discoveries[id];
}

/** The next stratum to dig, or null when the Deep goes no further. */
export function nextStratum(state: GameState, content: Content): StratumDef | null {
  return stratumDef(content, state.deep.strata + 1) ?? null;
}

export function digCost(content: Content, stratum: number): number {
  return deepContent(content).tuning.digScrip[stratum - 1] ?? Infinity;
}

/** Dig length in seconds at normal speed. */
export function digSeconds(content: Content, stratum: number): number {
  return (deepContent(content).tuning.digHours[stratum - 1] ?? Infinity) * 3600;
}

/** Excavation speed multiplier (research). */
export function digRate(state: GameState, content: Content): number {
  return 1 + Math.max(0, bonus(state, content, 'digSpeed'));
}

/** Real seconds until the running dig breaks through at the current speed. */
export function digTimeLeft(state: GameState, content: Content): number {
  const dig = state.deep.dig;
  return dig ? dig.remaining / digRate(state, content) : 0;
}

/** The connected elevator on the current bottom floor, where a dig starts. */
export function digShaft(state: GameState, content: Content): Room | null {
  const bottom = totalFloors(state, content) - 1;
  const connected = connectedRoomIds(state, content);
  return state.rooms.find((r) => r.type === 'elevator' && r.floor === bottom && connected.has(r.id)) ?? null;
}

/** Why the next stratum can't be dug now, or null. */
export function canExcavate(state: GameState, content: Content): string | null {
  if (state.deep.dig) return 'already digging';
  const next = nextStratum(state, content);
  if (!next) return 'the Deep goes no further';
  const research = next.requiresResearch ?? deepContent(content).tuning.requiresResearch;
  if (!state.research.done.includes(research)) return 'needs research first';
  if (!digShaft(state, content)) return 'run an elevator down to the bottom floor first';
  if (state.scrip < digCost(content, next.index)) return 'not enough scrip';
  return null;
}

export function startExcavation(state: GameState, content: Content): string | null {
  const err = canExcavate(state, content);
  if (err) return err;
  const stratum = state.deep.strata + 1;
  addScrip(state, content, -digCost(content, stratum));
  const total = digSeconds(content, stratum);
  state.deep.dig = { stratum, remaining: total, total };
  bump(state, 'digsStarted');
  state.events.push({ type: 'digStarted', stratum });
  return null;
}

// ------------------------------------------------------------------ discoveries

function unfound(state: GameState, content: Content, stratum: number): DiscoveryDef[] {
  return Object.values(deepContent(content).discoveries).filter((d) => d.stratum === stratum && !state.deep.discoveries.includes(d.id));
}

function grantReward(state: GameState, content: Content, reward: DiscoveryReward): void {
  if (reward.scrip) addScrip(state, content, reward.scrip);
  if (reward.crate) earnCrate(state, reward.crate, 'discovery');
  if (reward.recipe) {
    if (!unlockRecipe(state, content, reward.recipe, 'found')) {
      // Already known: a rare-tier fragment instead, so the find still pays.
      reward = { ...reward, fragment: reward.fragment ?? 'rare' };
    }
  }
  if (reward.fragment) {
    const pool = Object.values(content.items)
      .filter((d) => d.rarity === reward.fragment && !d.lootOnly && !knowsRecipe(state, content, d.id) && fragmentsNeeded(content, d.id) > 0)
      .map((d) => d.id);
    if (pool.length) addFragment(state, content, pick(state.rng, pool), 1);
  }
  if (reward.salvage) {
    const s = reward.salvage;
    const pool = content.salvageList.filter((x) => x.rarity === s.rarity && (!s.materials || s.materials.includes(x.material)));
    const n = nextInt(state.rng, s.count[0], s.count[1]);
    for (let i = 0; i < n && pool.length; i++) addSalvage(state, content, pick(state.rng, pool).id, 1);
  }
}

/** Record a discovery and pay its reward. Returns false if it was already found. */
export function discover(state: GameState, content: Content, id: string): boolean {
  const def = discoveryDef(content, id);
  if (!def || state.deep.discoveries.includes(id)) return false;
  state.deep.discoveries.push(id);
  bump(state, 'discoveries');
  state.events.push({ type: 'discovery', discoveryId: id });
  if (def.reward) grantReward(state, content, def.reward);
  return true;
}

/** Breaking through: the stratum's headline find (or its next unfound one). */
function digDiscovery(state: GameState, content: Content, stratum: number): void {
  const left = unfound(state, content, stratum);
  const first = left.find((d) => d.onDig) ?? left[0];
  if (first) discover(state, content, first.id);
}

/** This homestead's share of a lifetime counter. */
function homesteadStat(state: GameState, key: string): number {
  return (state.stats[key] ?? 0) - (state.legacy?.statsAtFounding?.[key] ?? 0);
}

/** Worker-seconds on deep floors needed in total for the k-th work discovery (k from 1). */
export function workDiscoveryThreshold(content: Content, k: number): number {
  const t = deepContent(content).tuning.discovery;
  return t.workerSeconds * (k + (t.growth * k * (k - 1)) / 2);
}

/** Adults working a job (a room with a stat) on a deep floor, with their stratum. */
function deepWorkers(state: GameState, content: Content): number[] {
  const out: number[] = [];
  for (const room of state.rooms) {
    if (!isDeepFloor(content, room.floor)) continue;
    const def = roomDef(content, room);
    if (!def.stat || def.category === 'living' || def.category === 'training') continue;
    const s = stratumOf(content, room.floor);
    for (let i = workersInRoom(state, room.id).length; i > 0; i--) out.push(s);
  }
  return out;
}

function tickWorkDiscoveries(state: GameState, content: Content, dt: number): void {
  const workers = deepWorkers(state, content);
  if (!workers.length) return;
  // Only count time while something reachable is still waiting to be found,
  // so a freshly dug stratum doesn't pay out a backlog all at once.
  let anyLeft = false;
  for (let s = 1; s <= state.deep.strata && !anyLeft; s++) anyLeft = unfound(state, content, s).length > 0;
  if (!anyLeft) return;
  bump(state, 'deepWorkSeconds', workers.length * dt);
  const found = homesteadStat(state, 'discoveries.work');
  if (homesteadStat(state, 'deepWorkSeconds') < workDiscoveryThreshold(content, found + 1)) return;
  // Something turns up where somebody is working: weighted by crew per stratum.
  const where = pick(state.rng, workers);
  let left = unfound(state, content, where);
  for (let s = 1; !left.length && s <= state.deep.strata; s++) left = unfound(state, content, s);
  const next = left.find((d) => !d.onDig) ?? left[0];
  if (!next) return;
  bump(state, 'discoveries.work');
  discover(state, content, next.id);
}

// ------------------------------------------------------------------ refinery

function refineryTuning(content: Content): RefineryTuning {
  return deepContent(content).tuning.refinery;
}

/** Refinery points needed per piece of salvage. */
export function refineryBatch(content: Content, room: Room): number {
  return refineryTuning(content).pointsPerSegment * room.segments;
}

/** Refinery points per second with the current crew. */
export function refineryRate(state: GameState, content: Content, room: Room): number {
  const t = refineryTuning(content);
  return (
    roomStatTotal(state, content, room) *
    (1 + happinessBonus(state, content)) *
    productionMult(state, content, undefined) *
    (t.levelMult[room.level - 1] ?? 1)
  );
}

/** Salvage per hour a refinery makes right now (for the client). */
export function refineryPerHour(state: GameState, content: Content, room: Room): number {
  return (refineryRate(state, content, room) * 3600) / refineryBatch(content, room);
}

function refineOne(state: GameState, content: Content, room: Room): void {
  const t = refineryTuning(content);
  const i = room.level - 1;
  const x = nextFloat(state.rng);
  const legendary = t.legendaryChance[i] ?? 0;
  const rarity: Rarity = x < legendary ? 'legendary' : x < legendary + (t.rareChance[i] ?? 0) ? 'rare' : 'common';
  const weights = Object.entries(t.materials);
  let w = nextFloat(state.rng) * weights.reduce((s, [, v]) => s + v, 0);
  let material = weights[0]?.[0] ?? 'steel';
  for (const [m, v] of weights) {
    w -= v;
    if (w < 0) {
      material = m;
      break;
    }
  }
  const pool = content.salvageList.filter((s) => s.material === material && s.rarity === rarity);
  if (!pool.length) return;
  const id = pick(state.rng, pool).id;
  addSalvage(state, content, id, 1);
  bump(state, 'refinedSalvage');
  if (rarity !== 'common') bump(state, `refinedSalvage.${rarity}`);
}

function tickRefineries(state: GameState, content: Content, dt: number): void {
  for (const room of state.rooms) {
    if (room.type !== 'refinery' || !room.powered || state.incidents.some((i) => i.roomId === room.id)) continue;
    const rate = refineryRate(state, content, room);
    if (rate <= 0) continue;
    room.pool += rate * dt;
    // A long offline step can finish several pieces at once.
    const size = refineryBatch(content, room);
    while (room.pool >= size) {
      room.pool -= size;
      refineOne(state, content, room);
    }
  }
}

// ------------------------------------------------------------------ tick

function tickDig(state: GameState, content: Content, dt: number): void {
  const dig = state.deep.dig;
  if (!dig) return;
  dig.remaining -= dt * digRate(state, content);
  if (dig.remaining > 1e-9) return;
  state.deep.dig = null;
  state.deep.strata = Math.max(state.deep.strata, dig.stratum);
  bump(state, 'strataExcavated');
  bumpMax(state, 'deepestStratum', state.deep.strata);
  state.events.push({ type: 'digFinished', stratum: dig.stratum });
  digDiscovery(state, content, dig.stratum);
}

/** Digging and refining run online and offline; discoveries from work run online. */
export function tickDeep(state: GameState, content: Content, dt: number, offline: boolean): void {
  tickDig(state, content, dt);
  // Nothing else happens until the first stratum is open.
  if (state.deep.strata <= 0) return;
  tickRefineries(state, content, dt);
  if (!offline) tickWorkDiscoveries(state, content, dt);
}

// ------------------------------------------------------------------ deep threats (used by incidents.ts)

/** Deep Bracing (research) is done. */
export function braced(state: GameState, content: Content): boolean {
  return state.research.done.includes(deepContent(content).tuning.incidents.bracing.research);
}

/**
 * Chance that a random incident lands in the Deep instead of the usual roster:
 * the deep share of incident rooms, scaled by tuning and cut by Deep Bracing.
 */
export function deepIncidentChance(state: GameState, content: Content, deepRooms: number, allRooms: number): number {
  if (deepRooms <= 0 || allRooms <= 0) return 0;
  const t = deepContent(content).tuning.incidents;
  return Math.min(1, t.share * (deepRooms / allRooms) * (braced(state, content) ? t.bracing.shareMult : 1));
}

/** HP and damage multipliers for a deep incident starting on this floor. */
export function deepIncidentScale(state: GameState, content: Content, floor: number): { hp: number; dps: number } {
  const t = deepContent(content).tuning.incidents;
  // Split the depth factor between HP and damage, so danger (HP × damage)
  // grows linearly with depth rather than with its square.
  const depth = Math.sqrt(1 + t.perStratum * Math.max(0, stratumOf(content, floor) - 1));
  const b = braced(state, content);
  return { hp: depth * (b ? t.bracing.hpMult : 1), dps: depth * (b ? t.bracing.dpsMult : 1) };
}

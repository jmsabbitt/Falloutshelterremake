// Traits and job mastery (GDD §4.2). Traits make residents individuals;
// mastery rewards keeping people in their roles.
//
// CONTRACT (M6, stream C). These hooks are already called from production,
// needs, residents, incidents and tick; keep their signatures. See
// docs/design/M6-spec.md.
//
// Traits are data (src/content/traits.json): each carries a list of effects
// with a kind, a value and optional filters (resources, room categories, a
// condition such as "deep" or "crowd"). The hooks below sum the effects that
// apply. Mastery is seconds worked per room type; tiers come from
// `masteryTierSeconds` and add a small bonus to the worker's contribution.

import type { Content, RoomCategory, RoomDef } from '../content';
import { roomDef } from '../grid';
import { bump, bumpMax } from '../residents';
import { chance, nextFloat } from '../rng';
import type { GameState, ResourceKey, Resident, Room } from '../types';
import { isDeepFloor } from './deep';

// ------------------------------------------------------------------ content types

export type TraitEffectKind =
  /** Fraction added to the worker's contribution (production, research, crafting). */
  | 'production'
  /** Points added to the resident's own happiness target. */
  | 'happiness'
  /** Points added to the happiness target of everyone else in the same room. */
  | 'roomHappiness'
  /** Fraction added to damage dealt (incidents and quests). */
  | 'combat'
  /** Fraction added to damage taken on quests (negative = tougher). */
  | 'damageTaken'
  /** Fraction added to the crit ring's sweep speed (negative = slower, easier). */
  | 'critRing'
  /** Fraction added to scrip found while exploring. */
  | 'explorerScrip'
  /** Fraction of exploration taint shrugged off. */
  | 'explorerTaint'
  /** Flat points added to exploration checks. */
  | 'explorerCheck'
  /** Flat points added to quest event checks. */
  | 'questCheck'
  /** Fraction added to XP earned. */
  | 'xp'
  /** Fraction added to the mastery accrual rate. */
  | 'mastery'
  /** Fraction added to courtship speed. */
  | 'courtship';

export type TraitCondition =
  | 'deep'
  | 'topside'
  /** Two or more others in the room. */
  | 'crowd'
  /** In a room with at most one other. */
  | 'fewOthers'
  /** In a room with nobody else. */
  | 'alone'
  | 'night'
  | 'morning'
  /** Journeyman or better in the current room type. */
  | 'experienced'
  /** Apprentice in a room whose job uses a stat. */
  | 'novice';

export interface TraitEffect {
  kind: TraitEffectKind;
  value: number;
  /** Only in rooms producing one of these. */
  resources?: ResourceKey[];
  /** Only in rooms of these categories. */
  categories?: RoomCategory[];
  when?: TraitCondition;
}

export interface TraitDef {
  id: string;
  name: string;
  /** Flavour text. */
  description: string;
  /** What it does, for the UI. */
  summary: string;
  weight: number;
  /** Traits that can't be rolled together with this one (checked both ways). */
  excludes?: string[];
  effects: TraitEffect[];
}

export type Shift = 'morning' | 'day' | 'night';

interface TraitTuning {
  traitsPerResident: [number, number];
  /** Relative odds of 1, 2, 3... traits (index 0 = the minimum). */
  countWeights: number[];
  inheritChance: number;
  masteryTierSeconds: number[];
  masteryTierNames: string[];
  masteryTierBonus: number[];
  /** Happiness for working in a room type one has mastered. */
  masterHappiness: number;
  /** Floors 0..topsideFloors-1 count as near the surface. */
  topsideFloors: number;
  /** Hour on the homestead clock when the homestead was founded. */
  clockStartHour: number;
  shifts: Record<Shift, [number, number]>;
  /** Limit on happiness from roommates' traits, either way. */
  roomHappinessCap: number;
  /** Room type -> profession, for titles ("Master Mechanic"). */
  professions: Record<string, string>;
}

export interface TraitsContent {
  tuning: TraitTuning;
  traits: TraitDef[];
}

export function traitsContent(content: Content): TraitsContent {
  return content.traits as unknown as TraitsContent;
}

interface Index {
  byId: Map<string, TraitDef>;
  /** Traits that change their roommates' happiness. */
  aura: Set<string>;
}

// Lookups run every tick for every worker, so index the content once.
const indexes = new WeakMap<object, Index>();

let lastKey: object | null = null;
let lastIndex: Index | null = null;

function index(content: Content): Index {
  const key = content.traits as object;
  if (key === lastKey && lastIndex) return lastIndex;
  let ix = indexes.get(key);
  if (!ix) {
    const defs = traitsContent(content).traits;
    ix = {
      byId: new Map(defs.map((d) => [d.id, d])),
      aura: new Set(defs.filter((d) => d.effects.some((e) => e.kind === 'roomHappiness')).map((d) => d.id)),
    };
    indexes.set(key, ix);
  }
  lastKey = key;
  lastIndex = ix;
  return ix;
}

export function traitDef(content: Content, id: string): TraitDef | undefined {
  return index(content).byId.get(id);
}

/** A resident's trait definitions (unknown ids are skipped). */
export function traitDefs(content: Content, r: Resident): TraitDef[] {
  const out: TraitDef[] = [];
  const byId = index(content).byId;
  for (const id of r.traits ?? []) {
    const def = byId.get(id);
    if (def) out.push(def);
  }
  return out;
}

export function hasTrait(r: Resident, id: string): boolean {
  return (r.traits ?? []).includes(id);
}

// ------------------------------------------------------------------ the homestead clock

/** Hour of day (0..24) on the homestead clock, which starts at founding. */
export function homesteadHour(state: GameState, content: Content): number {
  const start = traitsContent(content).tuning.clockStartHour;
  return (((state.time / 3600 + start) % 24) + 24) % 24;
}

function inSpan(hour: number, [from, to]: [number, number]): boolean {
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

/** The current work shift (Night Owls and Early Birds care). */
export function currentShift(state: GameState, content: Content): Shift {
  const h = homesteadHour(state, content);
  const shifts = traitsContent(content).tuning.shifts;
  if (inSpan(h, shifts.night)) return 'night';
  if (inSpan(h, shifts.morning)) return 'morning';
  return 'day';
}

// ------------------------------------------------------------------ rolling

function compatible(content: Content, have: string[], id: string): boolean {
  if (have.includes(id)) return false;
  const def = traitDef(content, id);
  if (!def) return false;
  for (const other of have) {
    if (def.excludes?.includes(other)) return false;
    if (traitDef(content, other)?.excludes?.includes(id)) return false;
  }
  return true;
}

/** True if no two of these traits contradict each other. */
export function traitsCompatible(content: Content, ids: string[]): boolean {
  return ids.every((id, i) => compatible(content, ids.slice(0, i), id));
}

function rollCount(state: GameState, content: Content): number {
  const t = traitsContent(content).tuning;
  const [lo, hi] = t.traitsPerResident;
  const weights = Array.from({ length: hi - lo + 1 }, (_, i) => Math.max(0, t.countWeights[i] ?? 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = nextFloat(state.rng) * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll < 0) return lo + i;
  }
  return hi;
}

/** Add weighted random compatible traits until there are `count`. */
function fillTraits(state: GameState, content: Content, have: string[], count: number): string[] {
  const out = [...have];
  while (out.length < count) {
    const pool = traitsContent(content).traits.filter((d) => d.weight > 0 && compatible(content, out, d.id));
    const total = pool.reduce((s, d) => s + d.weight, 0);
    if (!pool.length || total <= 0) break;
    let roll = nextFloat(state.rng) * total;
    let chosen = pool[pool.length - 1] as TraitDef;
    for (const d of pool) {
      roll -= d.weight;
      if (roll < 0) {
        chosen = d;
        break;
      }
    }
    out.push(chosen.id);
  }
  return out;
}

/** Traits for a new resident (called from createResident). */
export function rollTraits(state: GameState, content: Content): string[] {
  if (!traitsContent(content).traits.length) return [];
  return fillTraits(state, content, [], rollCount(state, content));
}

/** Traits for a newborn: some inherited from the parents (called from createChild). */
export function inheritTraits(state: GameState, content: Content, mother: Resident, father: Resident): string[] {
  const t = traitsContent(content).tuning;
  const max = t.traitsPerResident[1];
  const inherited: string[] = [];
  const parental = [...new Set([...(mother.traits ?? []), ...(father.traits ?? [])])];
  for (const id of parental) {
    if (!chance(state.rng, t.inheritChance)) continue;
    if (inherited.length < max && compatible(content, inherited, id)) inherited.push(id);
  }
  if (inherited.length) bump(state, 'traitsInherited', inherited.length);
  return fillTraits(state, content, inherited, Math.max(inherited.length, rollCount(state, content)));
}

// ------------------------------------------------------------------ evaluating effects

interface Place {
  state: GameState;
  room: Room | null;
  def: RoomDef | null;
  self: Resident;
  /** Others (living) in the same room; -1 until counted. Roommates share the count. */
  count: number;
}

function placeOf(state: GameState, content: Content, r: Resident, room?: Room): Place {
  const where = room ?? (r.roomId !== null ? state.rooms.find((x) => x.id === r.roomId) : undefined);
  return { state, room: where ?? null, def: where ? (content.rooms[where.type] ?? null) : null, self: r, count: -1 };
}

function othersIn(p: Place): number {
  if (!p.room) return 0;
  if (p.count < 0) {
    let n = 0;
    for (const o of p.state.residents) if (o !== p.self && o.roomId === p.room.id && !o.dead) n++;
    p.count = n;
  }
  return p.count;
}

function holds(state: GameState, content: Content, r: Resident, p: Place, when: TraitCondition | undefined): boolean {
  if (!when) return true;
  const t = traitsContent(content).tuning;
  switch (when) {
    case 'deep': return p.room !== null && isDeepFloor(content, p.room.floor);
    case 'topside': return p.room !== null && p.room.floor < t.topsideFloors;
    case 'crowd': return p.room !== null && othersIn(p) >= 2;
    case 'fewOthers': return p.room !== null && othersIn(p) <= 1;
    case 'alone': return p.room !== null && othersIn(p) === 0;
    case 'night': return currentShift(state, content) === 'night';
    case 'morning': return currentShift(state, content) === 'morning';
    case 'experienced': return p.room !== null && !!p.def?.stat && masteryTier(content, r, p.room.type) >= 1;
    case 'novice': return p.room !== null && !!p.def?.stat && masteryTier(content, r, p.room.type) === 0;
  }
}

function applies(state: GameState, content: Content, r: Resident, p: Place, e: TraitEffect): boolean {
  if (e.resources) {
    const res = p.def?.produces?.resource;
    if (!res || !e.resources.includes(res)) return false;
  }
  if (e.categories && (!p.def || !e.categories.includes(p.def.category))) return false;
  return holds(state, content, r, p, e.when);
}

/** Sum of a resident's effects of this kind that don't depend on where they are. */
export function traitValue(content: Content, r: Resident, kind: TraitEffectKind): number {
  let total = 0;
  const byId = index(content).byId;
  for (const id of r.traits ?? []) {
    const def = byId.get(id);
    if (!def) continue;
    for (const e of def.effects) {
      if (e.kind === kind && !e.when && !e.resources && !e.categories) total += e.value;
    }
  }
  return total;
}

function placedValue(state: GameState, content: Content, r: Resident, p: Place, kind: TraitEffectKind): number {
  let total = 0;
  const byId = index(content).byId;
  for (const id of r.traits ?? []) {
    const def = byId.get(id);
    if (!def) continue;
    for (const e of def.effects) if (e.kind === kind && applies(state, content, r, p, e)) total += e.value;
  }
  return total;
}

// ------------------------------------------------------------------ hooks

/** Multiplier on a worker's stat contribution to a room (traits and mastery). */
export function workerMult(state: GameState, content: Content, r: Resident, room: Room): number {
  const p = placeOf(state, content, r, room);
  const traits = placedValue(state, content, r, p, 'production');
  const mastery = traitsContent(content).tuning.masteryTierBonus[masteryTier(content, r, room.type)] ?? 0;
  return Math.max(0.1, 1 + traits + mastery);
}

/** Change to a resident's happiness target from traits (can be negative). */
export function traitHappiness(state: GameState, content: Content, r: Resident): number {
  const t = traitsContent(content).tuning;
  const p = placeOf(state, content, r);
  let total = 0;
  if (p.room) {
    // One pass over the residents: count the others here and find roommates
    // whose traits change the mood of the room.
    const aura = index(content).aura;
    const roomId = p.room.id;
    let n = 0;
    let holders: Resident[] | null = null;
    for (const o of state.residents) {
      if (o === r || o.roomId !== roomId || o.dead) continue;
      n++;
      for (const id of o.traits ?? []) {
        if (aura.has(id)) {
          (holders ??= []).push(o);
          break;
        }
      }
    }
    p.count = n;
    if (holders) {
      let from = 0;
      // Roommates share the room, and the same number of others in it.
      for (const o of holders) from += placedValue(state, content, o, p, 'roomHappiness');
      total += Math.max(-t.roomHappinessCap, Math.min(t.roomHappinessCap, from));
    }
  }
  total += placedValue(state, content, r, p, 'happiness');
  // Masters take pride in their trade.
  if (p.room && p.def?.stat && masteryTier(content, r, p.room.type) >= t.masteryTierSeconds.length - 1) total += t.masterHappiness;
  return total;
}

/** Multiplier on a resident's damage against incidents. */
export function traitCombatMult(content: Content, r: Resident): number {
  return Math.max(0.5, 1 + traitValue(content, r, 'combat'));
}

/** Multiplier on damage a resident takes in quest fights. */
export function traitDamageTakenMult(content: Content, r: Resident): number {
  return Math.max(0.5, 1 + traitValue(content, r, 'damageTaken'));
}

/** Multiplier on the crit ring's sweep speed (below 1 = slower, easier). */
export function traitCritRingMult(content: Content, r: Resident): number {
  return Math.max(0.5, 1 + traitValue(content, r, 'critRing'));
}

/** Multiplier on scrip an explorer finds. */
export function traitExplorerScripMult(content: Content, r: Resident): number {
  return Math.max(0, 1 + traitValue(content, r, 'explorerScrip'));
}

/** Multiplier on taint an explorer takes. */
export function traitExplorerTaintMult(content: Content, r: Resident): number {
  return Math.max(0, 1 - traitValue(content, r, 'explorerTaint'));
}

/** Flat bonus on exploration checks or quest event checks. */
export function traitCheckBonus(content: Content, r: Resident, kind: 'explorerCheck' | 'questCheck'): number {
  return traitValue(content, r, kind);
}

/** Multiplier on XP earned (for grantXp). */
export function traitXpMult(content: Content, r: Resident): number {
  return Math.max(0, 1 + traitValue(content, r, 'xp'));
}

/** Courtship speed multiplier for a couple (for family.ts: divide the courtship time by it). */
export function traitCourtshipMult(content: Content, a: Resident, b: Resident): number {
  return Math.max(0.1, 1 + traitValue(content, a, 'courtship') + traitValue(content, b, 'courtship'));
}

// ------------------------------------------------------------------ mastery

/** Mastery tier (0 Apprentice, 1 Journeyman, 2 Master) for a room type. */
export function masteryTier(content: Content, r: Resident, roomType: string): number {
  const seconds = r.mastery?.[roomType] ?? 0;
  const tiers = traitsContent(content).tuning.masteryTierSeconds;
  let tier = 0;
  for (let i = 1; i < tiers.length; i++) if (seconds >= (tiers[i] ?? Infinity)) tier = i;
  return tier;
}

export function masteryTierName(content: Content, tier: number): string {
  const names = traitsContent(content).tuning.masteryTierNames;
  return names[Math.max(0, Math.min(names.length - 1, tier))] ?? '';
}

/** Fraction of the way from the current tier to the next (1 at the top tier). */
export function masteryProgress(content: Content, r: Resident, roomType: string): number {
  const tiers = traitsContent(content).tuning.masteryTierSeconds;
  const tier = masteryTier(content, r, roomType);
  if (tier >= tiers.length - 1) return 1;
  const lo = tiers[tier] ?? 0;
  const hi = tiers[tier + 1] ?? lo;
  return hi > lo ? Math.min(1, ((r.mastery?.[roomType] ?? 0) - lo) / (hi - lo)) : 1;
}

/** How fast this resident builds mastery (Quick Study, Restless). */
export function masteryRate(content: Content, r: Resident): number {
  return Math.max(0.1, 1 + traitValue(content, r, 'mastery'));
}

export function professionName(content: Content, roomType: string): string {
  return traitsContent(content).tuning.professions[roomType] ?? content.rooms[roomType]?.name ?? roomType;
}

/**
 * The resident's title from their best job: "Master Mechanic", "Journeyman
 * Cook". Ties go to the job with more time in it. Null before any work.
 */
export function professionTitle(content: Content, r: Resident): string | null {
  let best: { type: string; tier: number; seconds: number } | null = null;
  for (const [type, seconds] of Object.entries(r.mastery ?? {})) {
    if (seconds <= 0 || !content.rooms[type]) continue;
    const tier = masteryTier(content, r, type);
    if (!best || tier > best.tier || (tier === best.tier && seconds > best.seconds)) best = { type, tier, seconds };
  }
  if (!best) return null;
  return `${masteryTierName(content, best.tier)} ${professionName(content, best.type)}`;
}

function isWorking(state: GameState, r: Resident): boolean {
  return (
    !r.dead &&
    !r.waiting &&
    r.roomId !== null &&
    r.expedition === null &&
    r.quest === null &&
    (r.adultAt === null || state.time >= r.adultAt)
  );
}

/** Workers accrue mastery in their room type (online and offline). */
export function tickMastery(state: GameState, content: Content, dt: number): void {
  const tiers = traitsContent(content).tuning.masteryTierSeconds;
  const top = tiers.length - 1;
  // Count the variety of traits about once a minute (same online and offline).
  const seen = dt <= 0 || Math.floor(state.time / 60) !== Math.floor((state.time - dt) / 60) ? new Set<string>() : null;
  for (const r of state.residents) {
    // Residents from saves before M6 get their traits the first time we see them.
    if (!r.traits?.length) r.traits = rollTraits(state, content);
    if (!r.mastery) r.mastery = {};
    if (seen && !r.dead) for (const id of r.traits) seen.add(id);
    if (dt <= 0 || !isWorking(state, r)) continue;
    const room = state.rooms.find((x) => x.id === r.roomId);
    if (!room || !roomDef(content, room).stat) continue;
    const before = r.mastery[room.type] ?? 0;
    const after = before + dt * masteryRate(content, r);
    r.mastery[room.type] = after;
    for (let tier = 1; tier <= top; tier++) {
      const at = tiers[tier] ?? Infinity;
      if (before >= at || after < at) continue;
      bump(state, 'masteryUps');
      if (tier === top) {
        bump(state, 'masteryMasters');
        const masteries = Object.keys(r.mastery).filter((type) => masteryTier(content, r, type) >= top).length;
        bumpMax(state, 'mostMasteries', masteries);
      }
      state.events.push({ type: 'masteryUp', residentId: r.id, roomType: room.type, tier });
    }
  }
  if (seen) bumpMax(state, 'distinctTraits', seen.size);
}

// M9: legendary residents (GDD §4.2, §11): named characters with fixed looks,
// high fixed stats, a signature trait and two personal quests each. See
// docs/design/M9-spec.md (stream L).
//
// Rules:
// - A legend joins once per lifetime (state.legends.recruited, carried across
//   foundings). They arrive at the door like anyone else and must be let in.
// - Sources: faction standing, a rare radio signal (Doc Ferris), a Deep
//   discovery (Pip) and the Legendary Supply Crate (Lucky Lou) are handled
//   here and in crates.ts; boss kills, treasure caches and Act 3 rewards call
//   recruitLegend() from their own systems.
// - A population cap (Skeleton Crew) never loses a legend: they queue at the
//   gate and arrive as soon as there is room.
// - After founding, a legend in the founding party comes along like anyone
//   else. One who stayed behind stays at that outpost, and can be sent for
//   later with recallLegend() (a scrip fee; they come back as their records
//   describe them, with their questline progress intact).
// - In Survival, a legend who falls is gone for good (state.legends.lost).
//   Otherwise they can be revived as usual.
// - Their second personal quest pays `rewards.legendUpgrade`: the signature
//   trait awakens and every stat rises (upgradeLegend). tickLegends applies it
//   from questsDone, so it also holds for a legend recalled later.
//
// Offline: every source is a timer or a threshold, and arriving at the door is
// harmless, so everything runs online and offline. The radio roll uses its own
// rng, advanced once per checkEverySeconds of counted radio time, so 1 s and
// 60 s steps give the same result.

import type { Content } from '../content';
import { addScrip, population } from '../economy';
import { roomDef } from '../grid';
import { bonus } from '../bonuses';
import { bump, createResident, hpPerLevel, workersInRoom } from '../residents';
import { chance, seedRng } from '../rng';
import { STAT_KEYS, type GameEvent, type GameState, type Resident, type Sex, type StatKey, type Stats } from '../types';
import { arrivalsBlocked } from './arrivals';
import { tickCollection, recordCollection } from './collection';
import { factionTier, isMet } from './factions';
import { rulesetMods } from './rulesets';

// ------------------------------------------------------------------ content

export type LegendSource = 'quest' | 'radio' | 'faction' | 'crate' | 'cache' | 'deep' | 'boss' | 'dev' | 'recall';

export interface LegendSourceDef {
  kind: 'faction' | 'radio' | 'deep' | 'crate' | 'boss' | 'cache' | 'quest';
  /** faction: the faction and the tier index needed (3 Friendly, 4 Allied). */
  faction?: string;
  tier?: number;
  /** radio: living population needed. */
  population?: number;
  /** deep: the discovery that brings them. */
  discovery?: string;
  /** boss: the enemy whose first defeat brings them (stream C). */
  enemy?: string;
}

export interface LegendDef {
  id: string;
  /** Full display name. */
  name: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  sex: Sex;
  /** Who they are, in a few words ("Caravan scout"). */
  title: string;
  /** Their best stat. */
  speciality: StatKey;
  appearance: { skin: number; hair: number };
  stats: Stats;
  /** The level they arrive at. */
  level: number;
  weapon: string | null;
  outfit: string | null;
  /** Signature trait (traits.json legendaryTraits) and its awakened version. */
  trait: string;
  awakened: string;
  source: LegendSourceDef;
  bio: string;
  /** Three "HALCY notes" for the resident card. */
  notes: string[];
}

export interface LegendsTuning {
  radio: { checkEverySeconds: number; chance: number };
  /** Chance a Legendary Supply Crate brings an unrecruited crate legend. */
  crateChance: number;
  /** Scrip to send for a legend who stayed at an outpost. */
  recallScrip: number;
  /** Stat points added to every stat when a legend's questline is done. */
  upgradeStats: number;
}

export interface LegendQuestlineDef {
  id: string;
  name: string;
  legend: string;
  quests: string[];
}

export interface LegendsContent {
  tuning: LegendsTuning;
  legends: LegendDef[];
  collection: { milestones: { percent: number; crate: string }[]; categoryCrate: string };
  questlines: LegendQuestlineDef[];
}

export function legendsContent(content: Content): LegendsContent {
  return content.legends as unknown as LegendsContent;
}

export function legendDef(content: Content, id: string): LegendDef | undefined {
  return legendsContent(content).legends.find((l) => l.id === id);
}

/** Their full name for the UI: Marla "Switchback" Voss, Lucky Lou Bettancourt. */
export function legendName(def: LegendDef): string {
  return def.name || `${def.firstName} ${def.lastName}`.trim();
}

export function legendQuestline(content: Content, id: string): LegendQuestlineDef | undefined {
  return legendsContent(content).questlines.find((l) => l.legend === id);
}

/** Every signature and awakened trait id, and whose it is. */
function signatureOwners(content: Content): Map<string, string> {
  const key = content.legends as object;
  let map = owners.get(key);
  if (!map) {
    map = new Map();
    for (const l of legendsContent(content).legends) {
      map.set(l.trait, l.id);
      map.set(l.awakened, l.id);
    }
    owners.set(key, map);
  }
  return map;
}
const owners = new WeakMap<object, Map<string, string>>();

// ------------------------------------------------------------------ queries

/** The legend's resident in this homestead (alive or not), if any. */
export function legendResident(state: GameState, id: string): Resident | undefined {
  return state.residents.find((r) => r.legendary === id);
}

export type LegendStatus = 'unknown' | 'queued' | 'here' | 'outpost' | 'lost';

/**
 * Where a legend is: not met yet, waiting for room at the gate, in this
 * homestead (including at the door, away, or fallen but revivable), left at an
 * outpost, or lost for good.
 */
export function legendStatus(state: GameState, id: string): LegendStatus {
  const l = state.legends;
  if (l.lost?.includes(id)) return 'lost';
  if (l.queued?.some((q) => q.id === id)) return 'queued';
  if (!l.recruited.includes(id)) return 'unknown';
  return legendResident(state, id) ? 'here' : 'outpost';
}

function capFull(state: GameState, content: Content): boolean {
  const cap = rulesetMods(state, content).populationCap;
  return cap !== Infinity && population(state) + state.residents.filter((r) => r.waiting).length >= cap;
}

// ------------------------------------------------------------------ arriving

function statsFor(def: LegendDef): Stats {
  const out = {} as Stats;
  for (const k of STAT_KEYS) out[k] = Math.max(1, Math.min(10, def.stats[k] ?? 1));
  return out;
}

/** Build the legend's resident, waiting at the door. */
function buildLegend(state: GameState, content: Content, def: LegendDef): Resident {
  const r = createResident(state, content, { sex: def.sex, rarity: 'legendary', stats: statsFor(def), firstName: def.firstName, lastName: def.lastName });
  r.appearance = { skin: def.appearance.skin, hair: def.appearance.hair };
  r.traits = [def.trait];
  r.weapon = def.weapon && content.weapons[def.weapon] ? def.weapon : null;
  r.outfit = def.outfit && content.outfits[def.outfit] ? def.outfit : null;
  r.legendary = def.id;
  const maxLvl = content.balance.resident.maxLevel;
  r.level = Math.max(1, Math.min(maxLvl, def.level));
  r.maxHp = content.balance.resident.baseHp + bonus(state, content, 'baseHp') + (r.level - 1) * hpPerLevel(content, r);
  r.hp = r.maxHp;
  r.waiting = true;
  return r;
}

function arrive(state: GameState, content: Content, def: LegendDef, source: LegendSource): Resident {
  const r = buildLegend(state, content, def);
  state.residents.push(r);
  if (!state.legends.recruited.includes(def.id)) state.legends.recruited.push(def.id);
  recordCollection(state, content, 'residents', def.id);
  if (source !== 'recall') {
    bump(state, 'legendsRecruited');
    bump(state, 'legendaryResidents');
    bump(state, `legendsFrom.${source}`);
  }
  // Until GameEvent has this variant (see the M9 stream L report), push it through a cast.
  state.events.push({ type: 'legendArrived', residentId: r.id, legendId: def.id, source } as unknown as GameEvent);
  return r;
}

/**
 * A legendary resident arrives at the door (once per lifetime). If a
 * population cap has the door full, they queue and arrive once there is room
 * (returns null: they are on their way). Returns why not otherwise.
 */
export function recruitLegend(state: GameState, content: Content, id: string, source: LegendSource): string | null {
  const def = legendDef(content, id);
  if (!def) return 'no such legend';
  if (state.legends.recruited.includes(id)) return 'already joined';
  if (state.legends.queued?.some((q) => q.id === id)) return 'already on the way';
  if (capFull(state, content)) {
    (state.legends.queued ??= []).push({ id, source });
    bump(state, 'legendsQueued');
    return null;
  }
  arrive(state, content, def, source);
  return null;
}

/** Why a legend who stayed at an outpost can't be sent for, or null. */
export function canRecallLegend(state: GameState, content: Content, id: string): string | null {
  const def = legendDef(content, id);
  if (!def) return 'no such legend';
  const status = legendStatus(state, id);
  if (status === 'lost') return 'gone for good';
  if (status !== 'outpost') return status === 'here' ? 'already here' : 'not met yet';
  if (capFull(state, content)) return 'the homestead is full';
  const cost = legendsContent(content).tuning.recallScrip;
  if (state.scrip < cost) return `needs ${cost} scrip`;
  return null;
}

/** Send for a legend who stayed behind at an outpost. They arrive at the door. */
export function recallLegend(state: GameState, content: Content, id: string): string | null {
  const why = canRecallLegend(state, content, id);
  if (why) return why;
  addScrip(state, content, -legendsContent(content).tuning.recallScrip);
  const r = arrive(state, content, legendDef(content, id) as LegendDef, 'recall');
  applyUpgradeIfEarned(state, content, r);
  bump(state, 'legendsRecalled');
  return null;
}

// ------------------------------------------------------------------ upgrades

function finalQuest(content: Content, id: string): string | undefined {
  const line = legendQuestline(content, id);
  return line?.quests[line.quests.length - 1];
}

function isAwakened(r: Resident, def: LegendDef): boolean {
  return r.traits.includes(def.awakened);
}

/**
 * The legend's questline is done: their signature trait awakens and every
 * stat rises by `upgradeStats` (to at most 10). Once per resident.
 */
export function upgradeLegend(state: GameState, content: Content, id: string): string | null {
  const def = legendDef(content, id);
  if (!def) return 'no such legend';
  const r = legendResident(state, id);
  if (!r) return 'not here';
  if (isAwakened(r, def)) return 'already awakened';
  r.traits = [...r.traits.filter((t) => t !== def.trait), def.awakened];
  const n = legendsContent(content).tuning.upgradeStats;
  for (const k of STAT_KEYS) r.stats[k] = Math.min(10, r.stats[k] + n);
  bump(state, 'legendsAwakened');
  state.events.push({ type: 'legendAwakened', residentId: r.id, legendId: id } as unknown as GameEvent);
  return null;
}

function applyUpgradeIfEarned(state: GameState, content: Content, r: Resident): void {
  const id = r.legendary;
  if (!id) return;
  const q = finalQuest(content, id);
  const def = legendDef(content, id);
  if (q && def && state.questsDone.includes(q) && !isAwakened(r, def)) upgradeLegend(state, content, id);
}

// ------------------------------------------------------------------ sources

function hasStaffedRadio(state: GameState, content: Content): boolean {
  for (const room of state.rooms) {
    if (!room.powered || roomDef(content, room).category !== 'radio') continue;
    if (workersInRoom(state, room.id).length > 0) return true;
  }
  return false;
}

function available(state: GameState, id: string): boolean {
  return !state.legends.recruited.includes(id) && !state.legends.queued?.some((q) => q.id === id);
}

/** Legends a Legendary Supply Crate could bring right now (crates.ts). */
export function crateLegends(state: GameState, content: Content): LegendDef[] {
  if (capFull(state, content)) return [];
  return legendsContent(content).legends.filter((l) => l.source.kind === 'crate' && available(state, l.id));
}

/** Seconds of staffed radio time counted toward the radio legend, and the roll interval. */
export function radioLegendProgress(state: GameState, content: Content): { seconds: number; every: number } {
  return { seconds: state.legends.radio?.seconds ?? 0, every: legendsContent(content).tuning.radio.checkEverySeconds };
}

function tickRadio(state: GameState, content: Content, def: LegendDef, dt: number): void {
  if (population(state) < (def.source.population ?? 0)) return;
  // No Radio (and a full door under Skeleton Crew) keeps the signal quiet.
  if (arrivalsBlocked(state, content) || !hasStaffedRadio(state, content)) return;
  const t = legendsContent(content).tuning.radio;
  const radio = (state.legends.radio ??= { seconds: 0, rng: seedRng((state.homesteadNumber * 7919 + state.legacy.cycle * 104729) >>> 0) });
  radio.seconds += dt;
  while (radio.seconds >= t.checkEverySeconds) {
    radio.seconds -= t.checkEverySeconds;
    if (chance(radio.rng, t.chance)) {
      recruitLegend(state, content, def.id, 'radio');
      radio.seconds = 0;
      return;
    }
  }
}

function tickSources(state: GameState, content: Content, dt: number): void {
  for (const def of legendsContent(content).legends) {
    if (!available(state, def.id)) continue;
    const s = def.source;
    switch (s.kind) {
      case 'faction':
        if (s.faction && isMet(state, s.faction) && factionTier(state, content, s.faction) >= (s.tier ?? 4)) recruitLegend(state, content, def.id, 'faction');
        break;
      case 'deep':
        if (s.discovery && state.deep.discoveries.includes(s.discovery)) recruitLegend(state, content, def.id, 'deep');
        break;
      case 'radio':
        tickRadio(state, content, def, dt);
        break;
      default:
        break; // crate (crates.ts), boss and cache (loot.ts), quest (quests.ts)
    }
  }
}

function tickQueue(state: GameState, content: Content): void {
  const queue = state.legends.queued;
  if (!queue?.length) return;
  while (queue.length && !capFull(state, content)) {
    const next = queue.shift() as { id: string; source: string };
    const def = legendDef(content, next.id);
    if (def && !state.legends.recruited.includes(def.id)) arrive(state, content, def, next.source as LegendSource);
  }
}

// ------------------------------------------------------------------ upkeep

/** Survival: a fallen legend is gone for good. */
function tickLosses(state: GameState): void {
  if (!state.rules?.survival) return;
  for (const r of state.residents) {
    if (!r.legendary || !r.dead) continue;
    const lost = (state.legends.lost ??= []);
    if (lost.includes(r.legendary)) continue;
    lost.push(r.legendary);
    bump(state, 'legendsLost');
  }
}

/**
 * Signature traits belong to their legend. Children can inherit a parent's
 * traits, so take any that turn up on someone else (traits.ts should skip
 * them; see the stream L report).
 */
function tickSignatures(state: GameState, content: Content): void {
  const sig = signatureOwners(content);
  for (const r of state.residents) {
    let bad = false;
    for (const t of r.traits) if (sig.has(t) && sig.get(t) !== r.legendary) bad = true;
    if (bad) r.traits = r.traits.filter((t) => !sig.has(t) || sig.get(t) === r.legendary);
  }
}

/**
 * Personal quest counters for achievements. A legend lost in Survival can't
 * finish their story, so `legendStoriesEnded` counts that as an ending too:
 * the all-stories achievement (and so the Warden's Seal) never becomes
 * impossible.
 */
function tickQuestlines(state: GameState, content: Content): void {
  let quests = 0;
  let lines = 0;
  let ended = 0;
  const lost = state.legends.lost ?? [];
  for (const line of legendsContent(content).questlines) {
    let done = 0;
    for (const q of line.quests) if (state.questsDone.includes(q)) done++;
    quests += done;
    const complete = done === line.quests.length && done > 0;
    if (complete) lines++;
    if (complete || lost.includes(line.legend)) ended++;
  }
  const max = (key: string, v: number) => {
    if ((state.stats[key] ?? 0) < v) state.stats[key] = v;
  };
  max('legendQuestsDone', quests);
  max('legendQuestlinesDone', lines);
  max('legendStoriesEnded', ended);
}

/** Runs every step, online and offline. */
export function tickLegends(state: GameState, content: Content, dt: number, _offline: boolean): void {
  if (!state.legends) return;
  tickLosses(state);
  tickQueue(state, content);
  tickSources(state, content, dt);
  for (const r of state.residents) if (r.legendary && !r.dead) applyUpgradeIfEarned(state, content, r);
  tickSignatures(state, content);
  tickQuestlines(state, content);
  tickCollection(state, content);
}

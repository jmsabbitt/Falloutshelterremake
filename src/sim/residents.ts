import type { Content } from './content';
import { bonus } from './bonuses';
import { chance, nextFloat, nextInt, pick } from './rng';
import { inheritTraits, rollTraits, traitCombatMult, traitXpMult } from './systems/traits';
import { STAT_KEYS, type GameState, type Rarity, type Resident, type Sex, type StatKey, type Stats } from './types';

export const SKIN_TONES = 6;
export const HAIR_COLORS = 7;
const MAX_STAT = 10;

export function emptyStats(value = 1): Stats {
  return { brawn: value, sight: value, grit: value, charm: value, wits: value, knack: value, fortune: value };
}

/** Distribute `total` points across the 7 stats (each 1..10). */
export function rollStats(state: GameState, total: number, primary?: StatKey, primaryValue = 1): Stats {
  const stats = emptyStats(1);
  if (primary) stats[primary] = Math.min(MAX_STAT, primaryValue);
  let remaining = Math.max(0, total - statTotal(stats));
  let guard = 2000;
  while (remaining > 0 && guard-- > 0) {
    const key = pick(state.rng, STAT_KEYS);
    // Keep the primary stat the highest when one was given.
    const cap = primary && key !== primary ? Math.max(1, stats[primary] - 1) : MAX_STAT;
    if (stats[key] < Math.min(MAX_STAT, cap)) {
      stats[key]++;
      remaining--;
    }
  }
  return stats;
}

export function statTotal(stats: Stats): number {
  return STAT_KEYS.reduce((sum, k) => sum + stats[k], 0);
}

/** Base stat plus outfit bonus. */
export function effectiveStat(content: Content, r: Resident, key: StatKey): number {
  const bonus = r.outfit ? (content.outfits[r.outfit]?.bonus[key] ?? 0) : 0;
  return r.stats[key] + bonus;
}

export function effectiveStats(content: Content, r: Resident): Stats {
  const out = { ...r.stats };
  for (const k of STAT_KEYS) out[k] = effectiveStat(content, r, k);
  return out;
}

/** Highest stat(s) including outfit; ties all count as "right room". */
export function topStats(stats: Stats): StatKey[] {
  const max = Math.max(...STAT_KEYS.map((k) => stats[k]));
  return STAT_KEYS.filter((k) => stats[k] === max);
}

/** Average damage per second in vault fights: weapon average, fists = 1. */
/**
 * Damage per second against incidents: the weapon's average (fists 1), plus a
 * little per level, so seasoned residents keep up with incidents that scale
 * with the homestead's average level.
 */
export function combatDamage(content: Content, r: Resident): number {
  const w = r.weapon ? content.weapons[r.weapon] : undefined;
  const base = w ? (w.min + w.max) / 2 : 1;
  return (base + content.balance.incidents.damagePerLevel * (r.level - 1)) * traitCombatMult(content, r);
}

export function isChild(state: GameState, r: Resident): boolean {
  return r.adultAt !== null && state.time < r.adultAt;
}

/** Pregnant residents and children don't fight; they take cover. */
export function fleesIncidents(state: GameState, r: Resident): boolean {
  return r.pregnancy !== null || isChild(state, r);
}

export function canWork(state: GameState, r: Resident): boolean {
  return !r.dead && !r.waiting && !isAway(r) && !isChild(state, r);
}

function ancestors(state: GameState, r: Resident, depth: number): Set<number> {
  const out = new Set<number>();
  let frontier = [r];
  for (let d = 0; d < depth; d++) {
    const next: Resident[] = [];
    for (const x of frontier) {
      for (const pid of [x.motherId, x.fatherId]) {
        if (pid === null) continue;
        out.add(pid);
        const p = state.residents.find((y) => y.id === pid);
        if (p) next.push(p);
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * Too closely related to have children: parent/child, grandparent/grandchild,
 * siblings and half-siblings. Cousins are allowed, as in the original.
 */
export function closelyRelated(state: GameState, a: Resident, b: Resident): boolean {
  const aUp = ancestors(state, a, 2);
  const bUp = ancestors(state, b, 2);
  if (aUp.has(b.id) || bUp.has(a.id)) return true;
  const aParents = [a.motherId, a.fatherId].filter((x): x is number => x !== null);
  const bParents = [b.motherId, b.fatherId].filter((x): x is number => x !== null);
  return aParents.some((p) => bParents.includes(p));
}

interface CreateOpts {
  sex?: Sex;
  rarity?: Rarity;
  stats?: Stats;
  firstName?: string;
  lastName?: string;
}

export function createResident(state: GameState, content: Content, opts: CreateOpts = {}): Resident {
  const sex: Sex = opts.sex ?? (nextFloat(state.rng) < 0.5 ? 'f' : 'm');
  const names = content.names;
  const r = content.balance.resident;
  const statTotalFor: Record<Rarity, number> = { common: r.commonStatTotal, rare: 28, legendary: 40 };
  const rarity = opts.rarity ?? 'common';
  return {
    id: state.nextId++,
    firstName: opts.firstName ?? pick(state.rng, sex === 'f' ? names.female : names.male),
    lastName: opts.lastName ?? pick(state.rng, names.last),
    sex,
    rarity,
    stats: opts.stats ?? rollStats(state, statTotalFor[rarity] + (rarity === 'common' ? nextInt(state.rng, 0, 1) : 0)),
    level: 1,
    xp: 0,
    hp: r.baseHp + bonus(state, content, 'baseHp'),
    maxHp: r.baseHp + bonus(state, content, 'baseHp'),
    taint: 0,
    happiness: content.balance.happiness.base,
    roomId: null,
    waiting: true,
    dead: false,
    appearance: { skin: nextInt(state.rng, 0, SKIN_TONES - 1), hair: nextInt(state.rng, 0, HAIR_COLORS - 1) },
    motherId: null,
    fatherId: null,
    adultAt: null,
    pregnancy: null,
    courtship: null,
    weapon: null,
    outfit: null,
    expedition: null,
    quest: null,
    traits: rollTraits(state, content),
    mastery: {},
  };
}

/**
 * A baby. Stats follow the original's inheritance (research 02 §5):
 * the primary stat is one parent's highest base stat; combined parent totals
 * give a chance of rare-stat (28) or legendary-stat (40) children.
 */
export function createChild(state: GameState, content: Content, mother: Resident, father: Resident): Resident {
  const fam = content.balance.family;
  const parent = chance(state.rng, 0.5) ? mother : father;
  const primary = topStats(parent.stats)[0] ?? 'brawn';
  const max = (statTotal(mother.stats) + statTotal(father.stats) - 14) / 126;
  const roll = max / 4 + nextFloat(state.rng) * (max - max / 4);
  // Good Stock adds points on top of whatever tier the child rolls.
  const total = (roll >= 0.95 ? 40 : roll >= 0.85 ? 28 : fam.childCommonStatTotal) + bonus(state, content, 'childStats');
  const stats = rollStats(state, total, primary, total === fam.childCommonStatTotal ? fam.childPrimaryStat : Math.round(total / 5));

  const child = createResident(state, content, { stats });
  child.traits = inheritTraits(state, content, mother, father);
  child.waiting = false;
  child.motherId = mother.id;
  child.fatherId = father.id;
  child.lastName = chance(state.rng, 0.5) ? mother.lastName : father.lastName;
  child.appearance = {
    skin: chance(state.rng, 0.5) ? mother.appearance.skin : father.appearance.skin,
    hair: chance(state.rng, 0.5) ? mother.appearance.hair : father.appearance.hair,
  };
  child.adultAt = state.time + fam.childhoodSeconds;
  child.roomId = null; // children don't hold jobs; they play around the homestead
  return child;
}

export function xpToNext(content: Content, level: number): number {
  const r = content.balance.resident;
  return Math.round(r.xpCurveBase * Math.pow(level, r.xpCurveExponent));
}

/** HP gained on a level-up: 2.5 + 0.5 × Grit (outfit included) at the moment of levelling. */
export function hpPerLevel(content: Content, resident: Resident): number {
  const r = content.balance.resident;
  return r.hpPerLevelBase + r.hpPerLevelPerGrit * effectiveStat(content, resident, 'grit');
}

export function effectiveMaxHp(resident: Resident): number {
  return Math.max(0, resident.maxHp - resident.taint);
}

export function reviveCost(content: Content, resident: Resident): number {
  const rv = content.balance.revive;
  return Math.min(rv.max, rv.base + rv.perLevel * (resident.level - 1));
}

/** Adds XP and processes level-ups. Returns number of levels gained. */
export function grantXp(state: GameState, content: Content, resident: Resident, amount: number): number {
  if (resident.dead) return 0;
  const maxLvl = content.balance.resident.maxLevel;
  if (resident.level >= maxLvl) return 0;
  resident.xp += amount * (1 + bonus(state, content, 'xpBonus')) * traitXpMult(content, resident);
  let gained = 0;
  while (resident.level < maxLvl && resident.xp >= xpToNext(content, resident.level)) {
    resident.xp -= xpToNext(content, resident.level);
    resident.level++;
    resident.maxHp += hpPerLevel(content, resident);
    resident.hp = effectiveMaxHp(resident); // levelling fully heals
    state.scrip = Math.min(content.balance.maxScrip, state.scrip + resident.level);
    gained++;
    state.events.push({ type: 'residentLeveled', residentId: resident.id, level: resident.level });
    bumpMax(state, 'highestLevel', resident.level);
    bump(state, 'levelUps');
  }
  if (resident.level >= maxLvl) resident.xp = 0;
  return gained;
}

export function bump(state: GameState, key: string, by = 1): void {
  state.stats[key] = (state.stats[key] ?? 0) + by;
}

export function bumpMax(state: GameState, key: string, value: number): void {
  if ((state.stats[key] ?? 0) < value) state.stats[key] = value;
}

/** Living residents inside the homestead (not waiting outside, not away exploring). */
export function livingResidents(state: GameState): Resident[] {
  return state.residents.filter((r) => !r.dead && !r.waiting && !isAway(r));
}

/** Out exploring or on a quest: not in the homestead. */
export function isAway(r: Resident): boolean {
  return r.expedition !== null || r.quest !== null;
}

export function residentsInRoom(state: GameState, roomId: number): Resident[] {
  return state.residents.filter((r) => r.roomId === roomId && !r.dead);
}

/** Residents actually doing the room's job (adults only). */
export function workersInRoom(state: GameState, roomId: number): Resident[] {
  return state.residents.filter((r) => r.roomId === roomId && !r.dead && !isChild(state, r));
}

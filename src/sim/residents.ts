import type { Content } from './content';
import { nextFloat, nextInt, pick } from './rng';
import { STAT_KEYS, type GameState, type Rarity, type Resident, type Sex, type StatKey, type Stats } from './types';

export function emptyStats(value = 1): Stats {
  return { brawn: value, sight: value, grit: value, charm: value, wits: value, knack: value, fortune: value };
}

/** Distribute `total` points across the 7 stats (each 1..10). */
export function rollStats(state: GameState, total: number): Stats {
  const stats = emptyStats(1);
  let remaining = Math.max(0, total - STAT_KEYS.length);
  let guard = 1000;
  while (remaining > 0 && guard-- > 0) {
    const key = pick(state.rng, STAT_KEYS);
    if (stats[key] < 10) {
      stats[key]++;
      remaining--;
    }
  }
  return stats;
}

export function statTotal(stats: Stats): number {
  return STAT_KEYS.reduce((sum, k) => sum + stats[k], 0);
}

/** Highest stat(s); ties all count as "right room". */
export function topStats(stats: Stats): StatKey[] {
  const max = Math.max(...STAT_KEYS.map((k) => stats[k]));
  return STAT_KEYS.filter((k) => stats[k] === max);
}

export function createResident(
  state: GameState,
  content: Content,
  opts: { sex?: Sex; rarity?: Rarity; stats?: Stats; firstName?: string; lastName?: string } = {},
): Resident {
  const sex: Sex = opts.sex ?? (nextFloat(state.rng) < 0.5 ? 'f' : 'm');
  const names = content.names;
  const r = content.balance.resident;
  const statTotalFor: Record<Rarity, number> = { common: r.commonStatTotal, rare: 28, legendary: 40 };
  const rarity = opts.rarity ?? 'common';
  const resident: Resident = {
    id: state.nextId++,
    firstName: opts.firstName ?? pick(state.rng, sex === 'f' ? names.female : names.male),
    lastName: opts.lastName ?? pick(state.rng, names.last),
    sex,
    rarity,
    stats: opts.stats ?? rollStats(state, statTotalFor[rarity] + nextInt(state.rng, 0, 1)),
    level: 1,
    xp: 0,
    hp: r.baseHp,
    maxHp: r.baseHp,
    taint: 0,
    happiness: content.balance.happiness.base,
    roomId: null,
    waiting: true,
    dead: false,
  };
  return resident;
}

export function xpToNext(content: Content, level: number): number {
  const r = content.balance.resident;
  return Math.round(r.xpCurveBase * Math.pow(level, r.xpCurveExponent));
}

/** HP gained on a level-up: 2.5 + 0.5 × Grit at the moment of levelling. */
export function hpPerLevel(content: Content, resident: Resident): number {
  const r = content.balance.resident;
  return r.hpPerLevelBase + r.hpPerLevelPerGrit * resident.stats.grit;
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
  resident.xp += amount;
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

export function livingResidents(state: GameState): Resident[] {
  return state.residents.filter((r) => !r.dead && !r.waiting);
}

export function residentsInRoom(state: GameState, roomId: number): Resident[] {
  return state.residents.filter((r) => r.roomId === roomId && !r.dead);
}

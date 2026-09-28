// Supply Crates (our lunchbox) and the reward plumbing that hands them out.
// Design goal from the wishlist: several crates a day of normal play, about one
// per hour of active play, and a pity guarantee so legendaries always arrive.

import type { Content } from '../content';
import { addScrip, resourceCapacity } from '../economy';
import { bonus } from '../bonuses';
import { bump, bumpMax, createResident } from '../residents';
import { chance, nextFloat } from '../rng';
import type { CrateCard, CrateTier, GameEvent, GameState, Rarity, ResourceKey } from '../types';
import { checkAchievements } from './achievements';
import { grantItem, randomItemOf } from './items';
import { crateLegends, legendsContent, recruitLegend } from './legends';

interface Weighted {
  w: number;
}

function roll<T extends Weighted>(state: GameState, table: T[]): T {
  const total = table.reduce((s, e) => s + e.w, 0);
  let x = nextFloat(state.rng) * total;
  for (const e of table) {
    x -= e.w;
    if (x < 0) return e;
  }
  return table[table.length - 1] as T;
}

export function earnCrate(state: GameState, tier: CrateTier, source: string): void {
  state.crates[tier]++;
  bump(state, 'cratesEarned');
  bump(state, `cratesFrom.${source.split(' ')[0]}`);
  state.events.push({ type: 'crateEarned', tier, source });
}

export function addTokens(state: GameState, content: Content, n: number): void {
  state.crateTokens += n;
  const per = content.balance.crates.tokensPerCrate;
  while (state.crateTokens >= per) {
    state.crateTokens -= per;
    earnCrate(state, 'standard', 'tokens');
  }
}

type CardEntry = Weighted & {
  amount?: number;
  scrip?: number;
  tokens?: number;
  resource?: string;
  kind?: string;
  rarity?: string;
};

function cardFrom(state: GameState, content: Content, entry: CardEntry): CrateCard {
  if (entry.scrip !== undefined) {
    addScrip(state, content, entry.scrip);
    return { kind: 'scrip', amount: entry.scrip };
  }
  if (entry.tokens !== undefined) {
    addTokens(state, content, entry.tokens);
    return { kind: 'tokens', amount: entry.tokens };
  }
  if (entry.resource) {
    const key = entry.resource as ResourceKey;
    const amount = entry.amount ?? 0;
    // What doesn't fit in storage is sold on for scrip instead of vanishing.
    const space = Math.max(0, resourceCapacity(state, content, key) - state.resources[key]);
    const kept = Math.min(space, amount);
    state.resources[key] += kept;
    const refund = Math.round((amount - kept) * content.balance.crates.overflowScripPerUnit);
    if (refund > 0) addScrip(state, content, refund);
    return { kind: 'resource', resource: key, amount, ...(refund > 0 ? { refund } : {}) };
  }
  const rarity = (entry.rarity ?? 'common') as Rarity;
  if (entry.kind === 'resident') {
    const res = createResident(state, content, { rarity });
    // Notable arrivals come with a weapon of their tier.
    res.weapon = randomItemOf(state, content, 'weapon', rarity === 'legendary' ? 'legendary' : 'rare');
    if (rarity === 'legendary') {
      res.outfit = randomItemOf(state, content, 'outfit', 'legendary');
      bump(state, 'legendaryResidents');
    }
    state.residents.push(res);
    bump(state, 'arrivals.crate');
    state.events.push({ type: 'residentArrived', residentId: res.id, source: 'crate' });
    return { kind: 'resident', residentId: res.id, rarity };
  }
  const kind = entry.kind === 'outfit' ? 'outfit' : 'weapon';
  const defId = randomItemOf(state, content, kind, rarity);
  const sold = grantItem(state, content, defId);
  return { kind: 'item', defId, rarity, sold };
}

/**
 * M9: a Legendary Supply Crate may bring an unrecruited crate legend (Lucky
 * Lou) as its final card. Rolls only while one is available.
 */
function crateLegendCard(state: GameState, content: Content): CrateCard | null {
  const pool = crateLegends(state, content);
  if (!pool.length || !chance(state.rng, legendsContent(content).tuning.crateChance)) return null;
  const def = pool[0] as (typeof pool)[number];
  if (recruitLegend(state, content, def.id, 'crate')) return null;
  const res = state.residents.find((r) => r.legendary === def.id);
  return res ? { kind: 'resident', residentId: res.id, rarity: 'legendary' } : null;
}

function isLegendary(card: CrateCard): boolean {
  return (card.kind === 'item' || card.kind === 'resident') && card.rarity === 'legendary';
}

/** Open one crate of the given tier. Returns the five cards. */
export function openCrate(state: GameState, content: Content, tier: CrateTier): CrateCard[] {
  const c = content.balance.crates;
  state.crates[tier]--;
  const pityHit = state.pity >= c.pityThreshold - 1;
  const cards: CrateCard[] = [];
  cards.push(cardFrom(state, content, roll(state, c.scripCard.map((e) => ({ w: e.w, scrip: e.amount })))));
  cards.push(cardFrom(state, content, roll(state, (tier === 'standard' ? c.itemCard : c.rareCard) as CardEntry[])));
  cards.push(cardFrom(state, content, roll(state, c.resourceCard as CardEntry[])));
  cards.push(cardFrom(state, content, roll(state, c.suppliesCard as CardEntry[])));
  const finalTable = tier === 'legendary' || pityHit ? c.legendaryCard : c.rareCard;
  const legend = tier === 'legendary' ? crateLegendCard(state, content) : null;
  cards.push(legend ?? cardFrom(state, content, roll(state, finalTable as CardEntry[])));

  state.pity = cards.some(isLegendary) ? 0 : state.pity + 1;
  bump(state, 'cratesOpened');
  state.events.push({ type: 'crateOpened', tier, cards });
  return cards;
}

/** Daily login crate. `day` is a local calendar day number supplied by the client. */
export function claimDaily(state: GameState, content: Content, day: number): CrateTier | null {
  if (!Number.isInteger(day) || day <= state.daily.lastDay) return null;
  state.daily.streak = day === state.daily.lastDay + 1 ? state.daily.streak + 1 : 1;
  state.daily.lastDay = day;
  const tier = (state.daily.streak % 7 === 0 ? content.balance.crates.daily.seventh : content.balance.crates.daily.normal) as CrateTier;
  earnCrate(state, tier, 'daily');
  bumpMax(state, 'bestDailyStreak', state.daily.streak);
  return tier;
}

function checkMilestones(state: GameState, content: Content): void {
  for (const [popStr, tier] of Object.entries(content.balance.crates.milestones)) {
    const pop = Number(popStr);
    if (state.peakPopulation >= pop && !state.milestones.includes(pop)) {
      state.milestones.push(pop);
      earnCrate(state, tier as CrateTier, `population ${pop}`);
    }
  }
}

/** Producing rooms up to which each collection has the full token chance. */
const COLLECT_TOKEN_ROOMS = 12;

/** Award tokens and crates for the events in [from, to). */
function processRewards(state: GameState, content: Content, events: GameEvent[]): void {
  const c = content.balance.crates;
  // A big homestead collects far more often than a small one, so the token chance per
  // collection shrinks past a dozen producing rooms: collecting pays tokens at about
  // a 12-room homestead's pace however large the homestead grows.
  const producing = state.rooms.filter((r) => content.rooms[r.type]?.produces).length;
  const collectChance = c.tokenChance.collect * Math.min(1, COLLECT_TOKEN_ROOMS / Math.max(1, producing)) * (1 + bonus(state, content, 'crateLuck'));
  for (const ev of events) {
    switch (ev.type) {
      case 'collected':
        if (chance(state.rng, collectChance)) addTokens(state, content, 1);
        break;
      case 'rushSucceeded':
        addTokens(state, content, c.tokens.rushSuccess);
        break;
      case 'incidentResolved':
        addTokens(state, content, c.tokens.incidentResolved);
        break;
      case 'birth':
        addTokens(state, content, c.tokens.birth);
        break;
      case 'residentArrived':
        if (ev.source !== 'crate') addTokens(state, content, c.tokens.arrival);
        break;
      case 'residentLeveled':
        addTokens(state, content, c.tokens.levelUp);
        if (ev.level % c.levelCrateEvery === 0) earnCrate(state, 'standard', `level ${ev.level}`);
        break;
      case 'achievementUnlocked': {
        const def = content.achievements.find((a) => a.id === ev.achievementId);
        const tier = def ? (c.achievementReward as Record<string, string | null>)[def.tier] : null;
        if (tier) earnCrate(state, tier as CrateTier, 'achievement');
        break;
      }
    }
  }
}

/**
 * Run after any change: unlocks, milestones, achievements and rewards, until
 * nothing new happens. `from` is the index of the first new event.
 */
export function settle(state: GameState, content: Content, from: number): void {
  let start = from;
  for (let guard = 0; guard < 10; guard++) {
    checkMilestones(state, content);
    checkAchievements(state, content);
    const end = state.events.length;
    if (end <= start) break;
    processRewards(state, content, state.events.slice(start, end));
    start = end;
  }
}

// Prestige: "Found a New Homestead" (GDD §10). A homestead that reaches its
// Charter milestone can sponsor a new one. The player takes a founding party
// and a few heirlooms to a new site, earns Legacy for what the old homestead
// achieved, and the old homestead carries on as an idle outpost.
// See docs/design/M5-spec.md.

import type { Content } from '../content';
import { addScrip, refreshUnlocks } from '../economy';
import { canPlace } from '../grid';
import { legacyContent, perkDef, perkRank, perkValue, siteDef, type CharterDef } from '../legacy';
import { bump, isAway, isChild } from '../residents';
import { chance, nextFloat, nextInt, pick } from '../rng';
import { newGame } from '../state';
import type { GameState, Item, Outpost, Resident, Room } from '../types';
import { earnCrate } from './crates';
import { scheduleIncident } from './incidents';
import { addSalvage } from './inventory';

// ------------------------------------------------------------------ charter

/** The Charter milestone for this homestead (later cycles reuse the last one). */
export function charterFor(state: GameState, content: Content): CharterDef {
  const list = legacyContent(content).charters;
  return list.find((c) => c.cycle === state.legacy.cycle) ?? (list[list.length - 1] as CharterDef);
}

/** Lifetime counter gained since this homestead was founded. */
export function sinceFounding(state: GameState, key: string): number {
  return (state.stats[key] ?? 0) - (state.legacy.statsAtFounding[key] ?? 0);
}

export interface CharterRequirement {
  label: string;
  have: number;
  need: number;
  done: boolean;
}

export function charterStatus(state: GameState, content: Content): { requirements: CharterRequirement[]; ready: boolean; text: string } {
  const c = charterFor(state, content);
  const reqs: CharterRequirement[] = [];
  const pop = state.residents.filter((r) => !r.dead && !r.waiting).length;
  reqs.push({ label: `Population ${c.population}`, have: pop, need: c.population, done: pop >= c.population });
  for (const id of c.quests ?? []) {
    const def = (content.quests as unknown as { quests: { id: string; title: string }[] }).quests.find((q) => q.id === id);
    const done = state.questsDone.includes(id);
    reqs.push({ label: `Complete "${def?.title ?? id}"`, have: done ? 1 : 0, need: 1, done });
  }
  if (c.contracts) {
    const have = sinceFounding(state, 'contractsCompleted');
    reqs.push({ label: `Complete ${c.contracts} contracts here`, have, need: c.contracts, done: have >= c.contracts });
  }
  return { requirements: reqs, ready: reqs.every((r) => r.done), text: c.text };
}

// ------------------------------------------------------------------ legacy score

export interface LegacyLine {
  label: string;
  points: number;
}

/** What founding now would earn, line by line, before and after the site multiplier. */
export function legacyBreakdown(state: GameState, content: Content): { lines: LegacyLine[]; subtotal: number; siteMult: number; total: number } {
  const sc = legacyContent(content).scoring;
  const living = state.residents.filter((r) => !r.dead && !r.waiting);
  const days = Math.min(sc.maxDays, Math.floor(state.time / 86400));
  const achievements = Object.keys(state.achievements).length - state.legacy.achievementsAtFounding;
  const topLevel = Math.max(1, ...living.map((r) => r.level));
  const lines: LegacyLine[] = [
    { label: `Peak population ${state.peakPopulation}`, points: Math.floor(state.peakPopulation / 10) * sc.perTenPopulation },
    { label: `Story quests (${sinceFounding(state, 'storyQuestsCompleted')})`, points: sinceFounding(state, 'storyQuestsCompleted') * sc.perStoryQuest },
    { label: `Contracts (${sinceFounding(state, 'contractsCompleted')})`, points: sinceFounding(state, 'contractsCompleted') * sc.perContract },
    { label: `Bosses beaten (${sinceFounding(state, 'bossesDefeated')})`, points: sinceFounding(state, 'bossesDefeated') * sc.perBossDefeated },
    { label: `Achievements earned here (${achievements})`, points: achievements * sc.perAchievement },
    { label: `Highest level ${topLevel}`, points: Math.floor(topLevel / 5) * sc.perFiveLevels },
    { label: `Rooms at level 3 (${state.rooms.filter((r) => r.level >= 3).length})`, points: state.rooms.filter((r) => r.level >= 3).length * sc.perLevelThreeRoom },
    { label: `Legendary residents (${living.filter((r) => r.rarity === 'legendary').length})`, points: living.filter((r) => r.rarity === 'legendary').length * sc.perLegendaryResident },
    { label: `Days survived (${days}, up to ${sc.maxDays})`, points: days * sc.perDay },
  ].map((l) => ({ ...l, points: Math.floor(l.points) }));
  const subtotal = lines.reduce((a, l) => a + l.points, 0);
  const siteMult = siteDef(content, state.legacy.siteId)?.legacyMult ?? 1;
  return { lines, subtotal, siteMult, total: Math.floor(subtotal * siteMult) };
}

// ------------------------------------------------------------------ perks

/** Why a perk rank can't be bought, or null if it can. */
export function canBuyPerk(state: GameState, content: Content, perkId: string): string | null {
  const def = perkDef(content, perkId);
  if (!def) return 'no such perk';
  const rank = perkRank(state, perkId);
  if (rank >= def.costs.length) return 'fully upgraded';
  for (const [id, need] of Object.entries(def.requires ?? {})) {
    if (perkRank(state, id) < need) return `needs ${perkDef(content, id)?.name ?? id} rank ${need}`;
  }
  const cost = def.costs[rank] as number;
  if (state.legacy.points < cost) return `needs ${cost} Legacy`;
  return null;
}

export function buyPerk(state: GameState, content: Content, perkId: string): string | null {
  const why = canBuyPerk(state, content, perkId);
  if (why) return why;
  const def = perkDef(content, perkId)!;
  const rank = perkRank(state, perkId);
  state.legacy.points -= def.costs[rank] as number;
  state.legacy.perks[perkId] = rank + 1;
  bump(state, 'perksBought');
  state.events.push({ type: 'perkBought', perkId, rank: rank + 1 });
  return null;
}

// ------------------------------------------------------------------ founding

export function foundingLimits(state: GameState, content: Content): { party: number; heirlooms: number } {
  const f = legacyContent(content).founding;
  return {
    party: f.partyBase + perkValue(state, content, 'foundingParty'),
    heirlooms: f.heirloomBase + perkValue(state, content, 'heirlooms'),
  };
}

/** Why a resident can't join the founding party, or null. */
export function canFound(state: GameState, r: Resident): string | null {
  if (r.dead) return 'fallen';
  if (r.waiting) return 'not admitted yet';
  if (isAway(r)) return 'away';
  if (isChild(state, r)) return 'too young to travel';
  if (r.pregnancy) return 'expecting';
  return null;
}

/** Why the homestead can't found a new one yet, or null. */
export function canFoundHomestead(state: GameState, content: Content): string | null {
  if (!charterStatus(state, content).ready) return 'the Charter milestone is not reached yet';
  if (state.quests.length) return 'bring every quest party home first';
  if (state.expeditions.length) return 'bring every explorer home first';
  return null;
}

export interface FoundOptions {
  siteId: string;
  /** Residents who come along (up to foundingLimits().party). */
  partyIds: number[];
  /** Stored items to bring (up to foundingLimits().heirlooms). Gear the party wears always comes too. */
  heirloomIds: number[];
  /** Wall-clock ms for the new homestead's clock. */
  now: number;
}

/** The outpost a homestead becomes once its founders leave. */
function outpostFrom(state: GameState, content: Content, stayers: number): Outpost {
  const o = legacyContent(content).outposts;
  return {
    id: state.legacy.cycle,
    homesteadNumber: state.homesteadNumber,
    cycle: state.legacy.cycle,
    siteId: state.legacy.siteId,
    population: stayers,
    rates: {
      scrip: stayers * o.scripPerResidentHour,
      salvage: stayers * o.salvagePerResidentHour,
      cratesPerHour: stayers / 10 / o.crateHoursPer10Residents,
    },
    stored: { scrip: 0, salvage: 0, crates: 0 },
  };
}

/** A resident carried to the new homestead: same person, new id, fresh start. */
function carryResident(r: Resident, id: number, ids: Map<number, number>): Resident {
  return {
    ...structuredClone(r),
    id,
    motherId: r.motherId !== null ? (ids.get(r.motherId) ?? null) : null,
    fatherId: r.fatherId !== null ? (ids.get(r.fatherId) ?? null) : null,
    hp: r.maxHp,
    taint: 0,
    roomId: null,
    waiting: true,
    courtship: null,
    pregnancy: null,
    adultAt: null,
    expedition: null,
    quest: null,
  };
}

const PREFAB: { type: string; floor: number; x: number }[] = [
  { type: 'storeroom', floor: 0, x: 10 },
  { type: 'clinic', floor: 2, x: 10 },
];

/**
 * Found a new homestead. Returns the new game state (the caller replaces the
 * old one), or an error. The old state is not modified.
 */
export function foundHomestead(old: GameState, content: Content, opts: FoundOptions): { ok: true; state: GameState; legacy: number } | { ok: false; reason: string } {
  const why = canFoundHomestead(old, content);
  if (why) return { ok: false, reason: why };
  const site = siteDef(content, opts.siteId);
  if (!site) return { ok: false, reason: 'no such site' };
  const limits = foundingLimits(old, content);
  const partyIds = [...new Set(opts.partyIds)];
  if (partyIds.length === 0) return { ok: false, reason: 'pick at least one founder' };
  if (partyIds.length > limits.party) return { ok: false, reason: `at most ${limits.party} founders` };
  const party: Resident[] = [];
  for (const id of partyIds) {
    const r = old.residents.find((x) => x.id === id);
    if (!r) return { ok: false, reason: 'no such resident' };
    const no = canFound(old, r);
    if (no) return { ok: false, reason: `${r.firstName}: ${no}` };
    party.push(r);
  }
  const heirloomIds = [...new Set(opts.heirloomIds)];
  if (heirloomIds.length > limits.heirlooms) return { ok: false, reason: `at most ${limits.heirlooms} heirlooms` };
  const heirlooms: Item[] = [];
  for (const id of heirloomIds) {
    const item = old.items.find((i) => i.id === id);
    if (!item) return { ok: false, reason: 'no such item in storage' };
    heirlooms.push(item);
  }

  // Everything below works on copies: the old homestead stays as it was.
  const src = structuredClone(old);
  const earned = legacyBreakdown(src, content).total;
  const seed = Math.floor(nextFloat(src.rng) * 2 ** 32);
  const state = newGame(content, { seed, now: opts.now, homesteadNumber: nextInt(src.rng, 100, 999) });

  // The founding party arrives at the new door; fresh strangers make up the numbers.
  const starters = state.residents;
  const ids = new Map<number, number>();
  for (const r of party) ids.set(r.id, state.nextId++);
  state.residents = party.map((r) => carryResident(r, ids.get(r.id) as number, ids));
  state.residents.push(...starters.slice(0, Math.max(0, starters.length - party.length)));
  for (const item of heirlooms) state.items.push({ id: state.nextId++, defId: item.defId });

  // Carried knowledge and progress.
  state.recipes = [...src.recipes];
  state.fragments = { ...src.fragments };
  state.reforgePity = src.reforgePity;
  state.questsDone = [...src.questsDone];
  state.regionsUnlocked = [...src.regionsUnlocked];
  state.achievements = { ...src.achievements };
  state.stats = { ...src.stats };
  state.crates = { ...src.crates };
  state.crateTokens = src.crateTokens;
  state.pity = src.pity;
  state.daily = { ...src.daily };

  const stayers = src.residents.filter((r) => !r.dead && !r.waiting && !partyIds.includes(r.id)).length;
  const legacy = src.legacy;
  state.legacy = {
    cycle: legacy.cycle + 1,
    points: legacy.points + earned,
    earned: legacy.earned + earned,
    perks: { ...legacy.perks },
    siteId: site.id,
    statsAtFounding: {},
    achievementsAtFounding: 0,
    history: [
      ...legacy.history,
      {
        cycle: legacy.cycle,
        homesteadNumber: src.homesteadNumber,
        siteId: legacy.siteId,
        peakPopulation: src.peakPopulation,
        days: Math.floor(src.time / 86400),
        legacyEarned: earned,
      },
    ],
    outposts: [...legacy.outposts, ...(stayers > 0 ? [outpostFrom(src, content, stayers)] : [])],
  };
  bump(state, 'homesteadsFounded');
  bump(state, 'legacyEarned', earned);
  bump(state, `sites.${site.id}`);
  state.legacy.statsAtFounding = { ...state.stats };
  state.legacy.achievementsAtFounding = Object.keys(state.achievements).length;

  // Legacy and site bonuses at the start. The fresh strangers were made
  // before the perks carried over, so give them Hardy Folk now.
  const hardy = perkValue(state, content, 'baseHp');
  const founders = new Set(ids.values());
  for (const r of state.residents) {
    if (founders.has(r.id)) continue;
    r.maxHp += hardy;
    r.hp = r.maxHp;
  }
  state.scrip = 0;
  addScrip(state, content, content.balance.start.scrip + perkValue(state, content, 'startScrip') + (site.modifiers.startScrip ?? 0));
  if (perkValue(state, content, 'prefabRooms') > 0) {
    for (const p of PREFAB) {
      if (!canPlace(state, content, p.type, p.floor, p.x).ok) continue;
      const room: Room = { id: state.nextId++, type: p.type, floor: p.floor, x: p.x, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null };
      state.rooms.push(room);
    }
  }
  scheduleIncident(state, content); // the site may change how often incidents come
  refreshUnlocks(state, content);
  state.events = [];
  return { ok: true, state, legacy: earned };
}

// ------------------------------------------------------------------ outposts

/** Outposts keep working at their own pace, online and offline, up to a day's worth. */
export function tickOutposts(state: GameState, content: Content, dt: number): void {
  checkCharter(state, content);
  const outposts = state.legacy?.outposts;
  if (!outposts?.length) return;
  const cap = legacyContent(content).outposts.storageHours;
  const mult = 1 + perkValue(state, content, 'outpostOutput');
  const hours = dt / 3600;
  for (const o of outposts) {
    const add = (have: number, rate: number) => Math.min(rate * mult * cap, have + rate * mult * hours);
    o.stored.scrip = add(o.stored.scrip, o.rates.scrip);
    o.stored.salvage = add(o.stored.salvage, o.rates.salvage);
    o.stored.crates = add(o.stored.crates, o.rates.cratesPerHour);
  }
}

/** Announce the Charter milestone once per homestead. */
function checkCharter(state: GameState, content: Content): void {
  if (!state.legacy) return;
  const key = `charter.${state.legacy.cycle}`;
  if (state.stats[key]) return;
  if (!charterStatus(state, content).ready) return;
  state.stats[key] = 1;
  bump(state, 'chartersReached');
  state.events.push({ type: 'charterReached', cycle: state.legacy.cycle });
}

/** What every outpost has waiting. */
export function outpostTotals(state: GameState): { scrip: number; salvage: number; crates: number } {
  const t = { scrip: 0, salvage: 0, crates: 0 };
  for (const o of state.legacy.outposts) {
    t.scrip += Math.floor(o.stored.scrip);
    t.salvage += Math.floor(o.stored.salvage);
    t.crates += Math.floor(o.stored.crates);
  }
  return t;
}

/** Take everything the outposts have stored (whole units; fractions keep accruing). */
export function collectOutposts(state: GameState, content: Content): string | null {
  const totals = outpostTotals(state);
  if (totals.scrip + totals.salvage + totals.crates === 0) return 'nothing waiting yet';
  for (const o of state.legacy.outposts) {
    o.stored.scrip -= Math.floor(o.stored.scrip);
    o.stored.salvage -= Math.floor(o.stored.salvage);
    o.stored.crates -= Math.floor(o.stored.crates);
  }
  addScrip(state, content, totals.scrip);
  for (let i = 0; i < totals.salvage; i++) {
    const roll = nextFloat(state.rng);
    const rarity = roll < 0.02 ? 'legendary' : roll < 0.2 ? 'rare' : 'common';
    const pool = content.salvageList.filter((x) => x.rarity === rarity);
    if (pool.length) addSalvage(state, content, pick(state.rng, pool).id, 1);
  }
  for (let i = 0; i < totals.crates; i++) earnCrate(state, chance(state.rng, 0.1) ? 'rare' : 'standard', 'outpost');
  bump(state, 'outpostCollections');
  bump(state, 'outpostScrip', totals.scrip);
  state.events.push({ type: 'outpostsCollected', ...totals });
  return null;
}

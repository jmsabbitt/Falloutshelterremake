// Factions, reputation, trade and caravans (GDD §6.5).
//
// CONTRACT (M7, stream B). Keep these signatures; see docs/design/M7-spec.md.
//
// - Contact: a Signal Mast reaches further with each level (factionDef.mastLevel);
//   the Long Road Co. also finds any Trading Post on its own. Quests and
//   caravans make contact through changeRep.
// - Reputation sits in tiers (Hostile .. Allied). Tiers gate trade offers,
//   set prices and caravan payouts, and (for the Rustmen) raid frequency.
// - Trade board: a staffed Trading Post posts offers from each met faction,
//   refreshed every tradeRefreshHours. Prices are locked in when posted.
// - Caravans: 1-3 residents carry goods to a met faction and back. The trip
//   runs online and offline; the outcome is rolled once, on arrival, with
//   state.rng. Charm and Fortune raise the payout; Brawn and Grit fend off
//   ambushes. Everything is paid out by collectCaravan.
// - Influence is a currency: offers pay and cost it, and it buys goodwill
//   (rep) and faction recruits who turn up at the door.

import type { Content } from '../content';
import { addScrip, resourceCapacity } from '../economy';
import { bump, bumpMax, createResident, effectiveStat, grantXp, isAway, isChild, rollStats, workersInRoom } from '../residents';
import { chance, nextFloat, nextInt, pick } from '../rng';
import type { Caravan, CrateTier, GameEvent, GameState, QuestReward, Rarity, ResourceKey, Resident, StatKey, TradeOffer } from '../types';
import { leaveJob, returnToJob } from './assign';
import { earnCrate } from './crates';
import { addFragment, addSalvage, fragmentsNeeded, knowsRecipe, salvageCount, unlockRecipe } from './inventory';
import { grantItem, randomItemOf } from './items';
import { signalRange } from './weather';

// ------------------------------------------------------------------ content

type ItemKind = 'weapon' | 'outfit';

/** One side of an offer template, as written in factions.json. */
export interface OfferTemplateSide {
  scrip?: number;
  influence?: number;
  food?: number;
  water?: number;
  medpatch?: number;
  purge?: number;
  /** Exact salvage by id. */
  salvageById?: Record<string, number>;
  /** get: random salvage, rolled when taken. */
  salvage?: { rarity: Rarity; count: [number, number]; materials?: string[] };
  /** give: any one stored item of this rarity (and kind); get: an item picked when the offer is posted. */
  itemOf?: { rarity: Rarity; kind?: ItemKind };
  items?: string[];
  /** get: a recipe not yet known, picked when posted (the offer is skipped if none is left). */
  recipeOf?: { rarity: Rarity; kind?: ItemKind };
  /** get: fragments toward a recipe not yet known, picked when posted. */
  fragmentOf?: { rarity: Rarity; count?: number };
  fragments?: Record<string, number>;
  crates?: Partial<Record<CrateTier, number>>;
  /** Research points. */
  research?: number;
  /** get: reputation with the posting faction. */
  rep?: number;
}

export interface OfferTemplate {
  id: string;
  label: string;
  /** Lowest reputation tier that can take it (0 Hostile .. 4 Allied). */
  tier: number;
  stock?: number;
  give: OfferTemplateSide;
  get: OfferTemplateSide;
}

export interface RouteDef {
  name: string;
  /** Round trip, in minutes. */
  minutes: number;
  baseScrip: number;
  /** Scrip paid per scrip of goods value. */
  markup: number;
  /** Salvage materials (or food, water, medpatch) this faction pays extra for. */
  wants: string[];
  wantMult: number;
  influence: [number, number];
  rep: number;
  /** Base ambush chance per trip. */
  ambush: number;
  itemChance: number;
  itemRarity: Rarity;
  itemKind?: ItemKind;
  legendaryChance: number;
  /** XP per resident. */
  xp: number;
  /** Lowest reputation tier the route is open at. */
  minTier: number;
  /** Chance the trip introduces the homestead to a faction it hasn't met. */
  introChance?: number;
  lines: { arrive: string[]; intro?: string[] };
}

export interface RecruitDef {
  title: string;
  primary: StatKey;
  rarity: Rarity;
  tier: number;
  influence: number;
  /** At most this many per homestead. */
  cap: number;
}

export interface FactionDef {
  id: string;
  name: string;
  shortName?: string;
  description: string;
  personality?: string;
  motto?: string;
  startRep: number;
  /** Signal Mast level needed to make contact. */
  mastLevel: number;
  /** Contact is also made as soon as a Trading Post exists. */
  contactByTradingPost?: boolean;
  route: RouteDef;
  recruit?: RecruitDef;
  offers: OfferTemplate[];
}

export interface CaravanTuning {
  maxParty: number;
  carryPerResident: number;
  /** Food and water are carried in units of this many. */
  resourceUnit: number;
  goodsValue: { food: number; water: number; medpatch: number };
  charmPerPoint: number;
  fortunePerPoint: number;
  jitter: [number, number];
  influencePerCharm: number;
  guardPerPoint: number;
  guardMax: number;
  ambushTierMult: number[];
  robbedLoss: number;
  /** HP lost when an ambush is fought off / succeeds. */
  ambushDamage: [number, number];
  itemFortunePerPoint: number;
  bigGoodsValue: number;
  bigGoodsRep: number;
  lines: { repelled: string[]; robbed: string[]; item: string[] };
}

export interface FactionsContent {
  tuning: {
    tradeRefreshHours: number;
    /** Lowest rep of each tier. */
    repTiers: number[];
    repTierNames: string[];
    offersPerFaction: number;
    /** Price multipliers per tier for what the homestead pays / receives. */
    buyMult: number[];
    sellMult: number[];
    /** Rep per trade, which stops adding up at tradeRepCap. */
    tradeRep: number;
    tradeRepCap: number;
    /** Raid frequency per Rustman tier. */
    raidMult: number[];
    caravan: CaravanTuning;
  };
  factions: FactionDef[];
}

export function factionsContent(content: Content): FactionsContent {
  return content.factions as unknown as FactionsContent;
}

export function factionDef(content: Content, id: string): FactionDef | undefined {
  return factionsContent(content).factions.find((f) => f.id === id);
}

function tuning(content: Content) {
  return factionsContent(content).tuning;
}

// ------------------------------------------------------------------ reputation

/** Change a faction's reputation (clamped to -100..100) and fire repChanged. Marks the faction met. */
export function changeRep(state: GameState, content: Content, factionId: string, delta: number): void {
  const def = factionDef(content, factionId);
  if (!def) return;
  const f = (state.factions[factionId] ??= { rep: def.startRep, met: false });
  const before = f.rep;
  f.rep = Math.max(-100, Math.min(100, f.rep + delta));
  if (!f.met) {
    f.met = true;
    state.events.push({ type: 'factionMet', factionId });
  }
  if (f.rep !== before) state.events.push({ type: 'repChanged', factionId, rep: f.rep, delta: f.rep - before });
}

export function repOf(state: GameState, content: Content, factionId: string): number {
  return state.factions[factionId]?.rep ?? factionDef(content, factionId)?.startRep ?? 0;
}

export function isMet(state: GameState, factionId: string): boolean {
  return state.factions[factionId]?.met === true;
}

export interface RepTier {
  /** 0 Hostile, 1 Wary, 2 Neutral, 3 Friendly, 4 Allied. */
  index: number;
  name: string;
  /** Lowest rep of this tier, and of the next one (null at the top). */
  min: number;
  next: number | null;
}

/** The tier a reputation value falls in. */
export function repTier(content: Content, rep: number): RepTier {
  const t = tuning(content);
  let index = 0;
  for (let i = 0; i < t.repTiers.length; i++) if (rep >= (t.repTiers[i] as number)) index = i;
  return {
    index,
    name: t.repTierNames[index] ?? `Tier ${index}`,
    min: t.repTiers[index] as number,
    next: t.repTiers[index + 1] ?? null,
  };
}

/** A faction's current tier index. */
export function factionTier(state: GameState, content: Content, factionId: string): number {
  return repTier(content, repOf(state, content, factionId)).index;
}

function tierValue(table: number[], tier: number): number {
  return table[Math.max(0, Math.min(table.length - 1, tier))] ?? 1;
}

/**
 * How much more often Rustman raids come (incidents hook). Unmet clans leave
 * the usual rate; hostile clans raid more, friendly ones less.
 */
export function raidRateMult(state: GameState, content: Content): number {
  if (!factionDef(content, 'rustmen') || !isMet(state, 'rustmen')) return 1;
  return tierValue(tuning(content).raidMult, factionTier(state, content, 'rustmen'));
}

// ------------------------------------------------------------------ buildings and contact

export function hasTradingPost(state: GameState): boolean {
  return state.rooms.some((r) => r.type === 'trading_post');
}

/** A Trading Post with at least one worker. */
export function tradingPostStaffed(state: GameState): boolean {
  return state.rooms.some((r) => r.type === 'trading_post' && workersInRoom(state, r.id).length > 0);
}

/** Highest Signal Mast level (0 without one), plus any signal-range research. */
export function signalLevel(state: GameState, content: Content): number {
  const mast = state.rooms.filter((r) => r.type === 'signal_mast').reduce((m, r) => Math.max(m, r.level), 0);
  if (mast === 0) return 0;
  return mast + signalRange(state, content);
}

/** Why a faction can't be contacted yet, or null once it can (or has been). */
export function contactLocked(state: GameState, content: Content, factionId: string): string | null {
  const def = factionDef(content, factionId);
  if (!def) return 'no such faction';
  if (isMet(state, factionId)) return null;
  if (def.contactByTradingPost && hasTradingPost(state)) return null;
  if (signalLevel(state, content) >= def.mastLevel) return null;
  return `needs a level ${def.mastLevel} Signal Mast`;
}

function tickContact(state: GameState, content: Content): void {
  for (const def of factionsContent(content).factions) {
    if (!isMet(state, def.id) && contactLocked(state, content, def.id) === null) changeRep(state, content, def.id, 0);
  }
  const met = factionsContent(content).factions.filter((d) => isMet(state, d.id));
  bumpMax(state, 'factionsMet', met.length);
  bumpMax(state, 'alliedFactions', met.filter((d) => factionTier(state, content, d.id) >= 4).length);
  if (isMet(state, 'rustmen') && factionTier(state, content, 'rustmen') >= 3) bumpMax(state, 'rustmenFriendly', 1);
}

// ------------------------------------------------------------------ trade board

/** One side of a posted offer. Extends QuestReward so it fits TradeOffer. */
export type OfferSide = QuestReward & {
  scrip?: number;
  influence?: number;
  food?: number;
  water?: number;
  salvageById?: Record<string, number>;
  /** give only: one stored item of this rarity (and kind). */
  itemOf?: { rarity: Rarity; kind?: ItemKind };
  research?: number;
  /** get only: a recruit from this faction arrives at the door. */
  recruit?: string;
};

/** A posted offer, as stored in state.trade.offers. */
export interface FactionOffer extends TradeOffer {
  templateId: string;
  label: string;
  /** Tier the offer unlocks at. */
  tier: number;
  give: OfferSide;
  get: OfferSide;
}

export function tradeOffers(state: GameState): FactionOffer[] {
  return state.trade.offers as FactionOffer[];
}

function scaled(n: number | undefined, mult: number): number | undefined {
  return n === undefined ? undefined : Math.max(1, Math.round(n * mult));
}

function unknownRecipesOf(state: GameState, content: Content, rarity: Rarity, kind?: ItemKind): string[] {
  return Object.values(content.items)
    .filter((d) => d.rarity === rarity && (!kind || d.kind === kind))
    .map((d) => d.id)
    .filter((id) => !knowsRecipe(state, content, id));
}

function copySide(t: OfferTemplateSide, factionId: string): OfferSide {
  const side: OfferSide = {};
  if (t.scrip !== undefined) side.scrip = t.scrip;
  if (t.influence !== undefined) side.influence = t.influence;
  for (const key of ['food', 'water', 'medpatch', 'purge', 'research'] as const) if (t[key] !== undefined) side[key] = t[key];
  if (t.salvageById) side.salvageById = { ...t.salvageById };
  if (t.salvage) side.salvage = { rarity: t.salvage.rarity, count: [...t.salvage.count], ...(t.salvage.materials ? { materials: [...t.salvage.materials] } : {}) };
  if (t.items) side.items = [...t.items];
  if (t.fragments) side.fragments = { ...t.fragments };
  if (t.crates) side.crates = { ...t.crates };
  if (t.rep) side.rep = { [factionId]: t.rep };
  return side;
}

/** Turn a template into a concrete offer, or null if it can't be posted (nothing left to sell). */
function buildOffer(state: GameState, content: Content, def: FactionDef, t: OfferTemplate): FactionOffer | null {
  const tier = Math.max(factionTier(state, content, def.id), t.tier);
  const tu = tuning(content);
  const give = copySide(t.give, def.id);
  const get = copySide(t.get, def.id);
  if (t.give.itemOf) give.itemOf = { ...t.give.itemOf };
  give.scrip = scaled(give.scrip, tierValue(tu.buyMult, tier));
  give.influence = scaled(give.influence, tierValue(tu.buyMult, tier));
  get.scrip = scaled(get.scrip, tierValue(tu.sellMult, tier));
  get.influence = scaled(get.influence, tierValue(tu.sellMult, tier));
  for (const side of [give, get]) for (const k of ['scrip', 'influence'] as const) if (side[k] === undefined) delete side[k];
  if (t.get.itemOf) {
    const kind = t.get.itemOf.kind ?? (chance(state.rng, 0.5) ? 'weapon' : 'outfit');
    get.items = [...(get.items ?? []), randomItemOf(state, content, kind, t.get.itemOf.rarity)];
  }
  if (t.get.recipeOf) {
    const pool = unknownRecipesOf(state, content, t.get.recipeOf.rarity, t.get.recipeOf.kind);
    if (!pool.length) return null;
    get.recipes = [pick(state.rng, pool)];
  }
  if (t.get.fragmentOf) {
    const n = t.get.fragmentOf.count ?? 1;
    const pool = unknownRecipesOf(state, content, t.get.fragmentOf.rarity).filter((id) => fragmentsNeeded(content, id) > 0);
    if (!pool.length) return null;
    get.fragments = { ...(get.fragments ?? {}), [pick(state.rng, pool)]: n };
  }
  for (const id of Object.keys(get.fragments ?? {})) if (knowsRecipe(state, content, id)) return null;
  return {
    id: state.nextId++,
    factionId: def.id,
    templateId: t.id,
    label: t.label,
    tier: t.tier,
    give,
    get,
    minRep: tu.repTiers[Math.max(0, t.tier)] ?? -100,
    stock: t.stock ?? 1,
  };
}

export function recruitsHired(state: GameState, factionId: string): number {
  return state.stats[`recruits.${factionId}`] ?? 0;
}

function recruitOffer(state: GameState, content: Content, def: FactionDef): FactionOffer | null {
  const rec = def.recruit;
  if (!rec || recruitsHired(state, def.id) >= rec.cap) return null;
  if (factionTier(state, content, def.id) < rec.tier) return null;
  return {
    id: state.nextId++,
    factionId: def.id,
    templateId: `${def.id}:recruit`,
    label: `Hire a ${rec.title}`,
    tier: rec.tier,
    give: { influence: scaled(rec.influence, tierValue(tuning(content).buyMult, factionTier(state, content, def.id))) },
    get: { recruit: def.id },
    minRep: tuning(content).repTiers[rec.tier] ?? -100,
    stock: 1,
  };
}

/** Offers one faction posts now: some it will honour at this tier, a teaser from the next, and a recruit. */
function postFactionOffers(state: GameState, content: Content, def: FactionDef): FactionOffer[] {
  const tier = factionTier(state, content, def.id);
  const out: FactionOffer[] = [];
  const open = def.offers.filter((t) => t.tier <= tier);
  const count = Math.min(tuning(content).offersPerFaction, open.length);
  const pool = [...open];
  while (out.length < count && pool.length) {
    const t = pool.splice(Math.floor(nextFloat(state.rng) * pool.length), 1)[0] as OfferTemplate;
    const offer = buildOffer(state, content, def, t);
    if (offer) out.push(offer);
  }
  const teasers = def.offers.filter((t) => t.tier === tier + 1);
  if (teasers.length) {
    const offer = buildOffer(state, content, def, pick(state.rng, teasers));
    if (offer) out.push(offer);
  }
  const rec = recruitOffer(state, content, def);
  if (rec) out.push(rec);
  return out;
}

/** Replace the board with fresh offers from every met faction. */
export function refreshTrade(state: GameState, content: Content): void {
  const offers: FactionOffer[] = [];
  for (const def of factionsContent(content).factions) {
    if (isMet(state, def.id)) offers.push(...postFactionOffers(state, content, def));
  }
  state.trade.offers = offers;
}

function tickTrade(state: GameState, content: Content): void {
  if (!tradingPostStaffed(state)) return;
  const period = tuning(content).tradeRefreshHours * 3600;
  if (state.time >= state.trade.refreshAt) {
    refreshTrade(state, content);
    // Keep the schedule on its grid, so long offline steps don't drift it.
    const next = state.trade.refreshAt + period;
    state.trade.refreshAt = state.trade.refreshAt > 0 && next > state.time ? next : state.time + period;
    return;
  }
  // A faction met since the last refresh posts its offers straight away.
  for (const def of factionsContent(content).factions) {
    if (!isMet(state, def.id) || state.trade.offers.some((o) => o.factionId === def.id)) continue;
    if (factionTier(state, content, def.id) < Math.min(...def.offers.map((t) => t.tier))) continue;
    state.trade.offers.push(...postFactionOffers(state, content, def));
  }
}

const RESOURCE_KEYS = ['food', 'water', 'medpatch', 'purge'] as const;

/** The stored item a give.itemOf offer would take (equipped gear is never touched). */
export function offerItemFor(state: GameState, content: Content, offer: FactionOffer): number | null {
  const want = offer.give.itemOf;
  if (!want) return null;
  const item = state.items.find((i) => {
    const d = content.items[i.defId];
    return d !== undefined && d.rarity === want.rarity && (!want.kind || d.kind === want.kind);
  });
  return item ? item.id : null;
}

function resourceName(key: ResourceKey): string {
  return key === 'medpatch' ? 'Med-Patches' : key === 'purge' ? 'Purge' : key;
}

/** Why the homestead can't pay one side of an offer, or null. */
function cantPay(state: GameState, content: Content, offer: FactionOffer): string | null {
  const g = offer.give;
  if ((g.scrip ?? 0) > state.scrip) return 'not enough scrip';
  if ((g.influence ?? 0) > state.influence) return 'not enough Influence';
  if ((g.research ?? 0) > state.research.points) return 'not enough research points';
  for (const key of RESOURCE_KEYS) if ((g[key] ?? 0) > state.resources[key]) return `not enough ${resourceName(key)}`;
  for (const [id, n] of Object.entries(g.salvageById ?? {})) {
    if (salvageCount(state, id) < n) return `needs ${n} ${content.salvage[id]?.name ?? id}`;
  }
  if (g.itemOf && offerItemFor(state, content, offer) === null) {
    return `needs a stored ${g.itemOf.rarity} ${g.itemOf.kind ?? 'item'}`;
  }
  return null;
}

function cantReceive(state: GameState, content: Content, offer: FactionOffer): string | null {
  const g = offer.get;
  for (const key of RESOURCE_KEYS) {
    if ((g[key] ?? 0) > 0 && state.resources[key] >= resourceCapacity(state, content, key)) return `no room for more ${resourceName(key)}`;
  }
  for (const id of g.recipes ?? []) if (knowsRecipe(state, content, id)) return 'you already know that recipe';
  for (const id of Object.keys(g.fragments ?? {})) if (knowsRecipe(state, content, id)) return 'you already know that recipe';
  if (g.recruit) {
    const rec = factionDef(content, g.recruit)?.recruit;
    if (!rec) return 'no such recruit';
    if (recruitsHired(state, g.recruit) >= rec.cap) return `no more ${rec.title}s will come`;
    if (state.residents.filter((r) => r.waiting).length >= content.balance.arrivals.maxWaiting) return 'too many people waiting at the door';
  }
  return null;
}

function addResource(state: GameState, content: Content, key: ResourceKey, n: number): void {
  const cap = resourceCapacity(state, content, key);
  state.resources[key] = Math.max(state.resources[key], Math.min(cap, state.resources[key] + n));
}

function earnInfluence(state: GameState, n: number): void {
  if (n <= 0) return;
  state.influence += n;
  bump(state, 'influenceEarned', n);
}

/** A faction recruit arrives at the door. */
export function hireRecruit(state: GameState, content: Content, factionId: string): Resident | null {
  const rec = factionDef(content, factionId)?.recruit;
  if (!rec) return null;
  const total = rec.rarity === 'legendary' ? 40 : rec.rarity === 'rare' ? 28 : content.balance.resident.commonStatTotal;
  const primaryValue = rec.rarity === 'legendary' ? 10 : rec.rarity === 'rare' ? 8 : 5;
  const res = createResident(state, content, { rarity: rec.rarity, stats: rollStats(state, total, rec.primary, primaryValue) });
  state.residents.push(res);
  bump(state, `recruits.${factionId}`);
  bump(state, 'recruitsHired');
  // 'recruit' is a new arrival source (see the M7 report for the GameEvent union).
  state.events.push({ type: 'residentArrived', residentId: res.id, source: 'recruit' } as unknown as GameEvent);
  return res;
}

/** Take a trade offer. */
/** Why an offer can't be taken right now, or null if it can. The same checks `trade()` runs. */
export function tradeBlocked(state: GameState, content: Content, offerId: number): string | null {
  const offer = tradeOffers(state).find((o) => o.id === offerId);
  if (!offer) return 'that offer is gone';
  const def = factionDef(content, offer.factionId);
  if (!def) return 'no such faction';
  if (!hasTradingPost(state)) return 'build a Trading Post first';
  if (!isMet(state, def.id)) return `you haven't made contact with ${def.name}`;
  if (repOf(state, content, def.id) < offer.minRep) return `needs ${repTier(content, offer.minRep).name} standing with ${def.shortName ?? def.name}`;
  if (offer.stock <= 0) return 'sold out';
  return cantPay(state, content, offer) ?? cantReceive(state, content, offer);
}

export function trade(state: GameState, content: Content, offerId: number): string | null {
  const why = tradeBlocked(state, content, offerId);
  if (why) return why;
  const offer = tradeOffers(state).find((o) => o.id === offerId)!;
  const def = factionDef(content, offer.factionId)!;

  // Pay.
  const g = offer.give;
  const itemId = offerItemFor(state, content, offer);
  state.scrip -= g.scrip ?? 0;
  state.influence -= g.influence ?? 0;
  state.research.points -= g.research ?? 0;
  for (const key of RESOURCE_KEYS) state.resources[key] -= g[key] ?? 0;
  for (const [id, n] of Object.entries(g.salvageById ?? {})) state.salvage[id] = salvageCount(state, id) - n;
  if (itemId !== null) state.items = state.items.filter((i) => i.id !== itemId);

  // Receive.
  const r = offer.get;
  if (r.scrip) addScrip(state, content, r.scrip);
  earnInfluence(state, r.influence ?? 0);
  if (r.research) state.research.points += r.research;
  for (const key of RESOURCE_KEYS) if (r[key]) addResource(state, content, key, r[key] as number);
  for (const [id, n] of Object.entries(r.salvageById ?? {})) addSalvage(state, content, id, n);
  if (r.salvage) {
    const s = r.salvage;
    const pool = content.salvageList.filter((x) => x.rarity === s.rarity && (!s.materials || s.materials.includes(x.material)));
    const n = typeof s.count === 'number' ? s.count : nextInt(state.rng, s.count[0], s.count[1]);
    for (let i = 0; i < n && pool.length; i++) addSalvage(state, content, pick(state.rng, pool).id, 1);
  }
  for (const id of r.items ?? []) grantItem(state, content, id);
  for (const id of r.recipes ?? []) unlockRecipe(state, content, id, 'found');
  for (const [id, n] of Object.entries(r.fragments ?? {})) addFragment(state, content, id, n);
  for (const [tier, n] of Object.entries(r.crates ?? {}) as [CrateTier, number][]) {
    for (let i = 0; i < n; i++) earnCrate(state, tier, 'trade');
  }
  if (r.recruit) hireRecruit(state, content, r.recruit);
  for (const [faction, n] of Object.entries(r.rep ?? {})) changeRep(state, content, faction, n);

  // Doing business is worth a little goodwill, up to a point.
  const t = tuning(content);
  const rep = repOf(state, content, def.id);
  if (rep < t.tradeRepCap) changeRep(state, content, def.id, Math.min(t.tradeRep, t.tradeRepCap - rep));

  offer.stock--;
  bump(state, 'trades');
  bump(state, `trades.${def.id}`);
  state.events.push({ type: 'traded', factionId: def.id, offerId: offer.id });
  return null;
}

// ------------------------------------------------------------------ caravans

export type CaravanGoods = { salvage?: Record<string, number>; food?: number; water?: number; medpatch?: number };

/** What a caravan brings back, as stored in caravan.result. */
export interface CaravanResult {
  scrip: number;
  influence: number;
  rep: number;
  items: string[];
  log: string[];
  /** 'repelled' or 'robbed' if ambushed on the road. */
  ambush?: 'repelled' | 'robbed';
  /** HP each resident lost. */
  hurt?: number;
  /** XP each resident earns. */
  xp?: number;
  /** A faction the Long Road Co. introduced the homestead to. */
  intro?: string;
}

function caravanTuning(content: Content): CaravanTuning {
  return tuning(content).caravan;
}

/** Why a resident can't join a caravan, or null. */
export function canCaravan(state: GameState, r: Resident): string | null {
  if (r.dead) return 'fallen residents cannot go';
  if (r.waiting) return 'let them in first';
  if ((r.caravan ?? null) !== null) return 'already with a caravan';
  if (isAway(r)) return r.quest !== null ? 'away on a quest' : 'out exploring';
  if (isChild(state, r)) return 'children are too young';
  if (r.pregnancy !== null) return 'too risky while expecting';
  return null;
}

/** Caravans that can be on the road at once: the best Trading Post's level (0 without one). */
export function caravanSlots(state: GameState): number {
  return state.rooms.filter((r) => r.type === 'trading_post').reduce((m, r) => Math.max(m, r.level), 0);
}

/** Carry units: salvage and Med-Patches count one each, food and water one per resourceUnit. */
export function goodsUnits(content: Content, goods: CaravanGoods): number {
  const unit = caravanTuning(content).resourceUnit;
  const salvage = Object.values(goods.salvage ?? {}).reduce((a, b) => a + b, 0);
  return salvage + (goods.medpatch ?? 0) + Math.ceil((goods.food ?? 0) / unit) + Math.ceil((goods.water ?? 0) / unit);
}

export function carryLimit(content: Content, partySize: number): number {
  return caravanTuning(content).carryPerResident * partySize;
}

/** Scrip value of the goods to this faction, with its wants applied. */
export function goodsValue(content: Content, factionId: string, goods: CaravanGoods): number {
  const def = factionDef(content, factionId);
  if (!def) return 0;
  const gv = caravanTuning(content).goodsValue;
  const want = (key: string) => (def.route.wants.includes(key) ? def.route.wantMult : 1);
  let value = 0;
  for (const [id, n] of Object.entries(goods.salvage ?? {})) {
    const s = content.salvage[id];
    if (s) value += s.value * n * want(s.material);
  }
  value += (goods.food ?? 0) * gv.food * want('food');
  value += (goods.water ?? 0) * gv.water * want('water');
  value += (goods.medpatch ?? 0) * gv.medpatch * want('medpatch');
  return value;
}

function partyStat(content: Content, party: Resident[], keys: StatKey[]): number {
  return party.reduce((sum, r) => sum + keys.reduce((s, k) => s + effectiveStat(content, r, k), 0), 0);
}

export interface CaravanEstimate {
  /** Round trip, in seconds. */
  seconds: number;
  /** Expected scrip before the jitter roll and any ambush. */
  scrip: number;
  influence: [number, number];
  rep: number;
  ambushChance: number;
  /** Chance an ambush is fought off. */
  defense: number;
  itemChance: number;
}

function estimate(state: GameState, content: Content, def: FactionDef, party: Resident[], goods: CaravanGoods): CaravanEstimate {
  const t = caravanTuning(content);
  const tier = factionTier(state, content, def.id);
  const route = def.route;
  const charm = partyStat(content, party, ['charm']);
  const fortune = partyStat(content, party, ['fortune']);
  const guard = partyStat(content, party, ['brawn', 'grit']);
  const value = goodsValue(content, def.id, goods);
  const statMult = 1 + t.charmPerPoint * charm + t.fortunePerPoint * fortune;
  const scrip = (route.baseScrip + value * route.markup) * tierValue(tuning(content).sellMult, tier) * statMult;
  const bonusInf = Math.floor(charm * t.influencePerCharm);
  return {
    seconds: route.minutes * 60,
    scrip: Math.round(scrip),
    influence: [route.influence[0] + bonusInf, route.influence[1] + bonusInf],
    rep: route.rep + (value >= t.bigGoodsValue ? t.bigGoodsRep : 0),
    ambushChance: Math.min(1, route.ambush * tierValue(t.ambushTierMult, tier)),
    defense: Math.min(t.guardMax, t.guardPerPoint * guard),
    itemChance: Math.min(1, route.itemChance + t.itemFortunePerPoint * fortune),
  };
}

/** Why a caravan can't leave, or null. */
function cantSend(state: GameState, content: Content, factionId: string, residentIds: number[], goods: CaravanGoods): string | null {
  const def = factionDef(content, factionId);
  if (!def) return 'no such faction';
  if (!hasTradingPost(state)) return 'build a Trading Post first';
  if (!isMet(state, factionId)) return `you haven't made contact with ${def.name}`;
  const tier = factionTier(state, content, factionId);
  if (tier < def.route.minTier) return `${def.shortName ?? def.name} won't trade with you until you're ${tuning(content).repTierNames[def.route.minTier] ?? 'better liked'}`;
  const ids = [...new Set(residentIds)];
  const t = caravanTuning(content);
  if (ids.length < 1) return 'send at least one resident';
  if (ids.length > t.maxParty) return `at most ${t.maxParty} residents`;
  for (const id of ids) {
    const r = state.residents.find((x) => x.id === id);
    if (!r) return 'no such resident';
    const why = canCaravan(state, r);
    if (why) return `${r.firstName}: ${why}`;
  }
  if (state.caravans.some((c) => c.factionId === factionId)) return `a caravan is already on ${def.route.name}`;
  if (state.caravans.length >= caravanSlots(state)) return 'no free caravan slots: upgrade the Trading Post';
  const amounts = [...Object.values(goods.salvage ?? {}), goods.food ?? 0, goods.water ?? 0, goods.medpatch ?? 0];
  if (amounts.some((n) => !Number.isInteger(n) || n < 0)) return 'goods must be whole, non-negative amounts';
  for (const [id, n] of Object.entries(goods.salvage ?? {})) {
    if (!content.salvage[id]) return 'unknown salvage';
    if (salvageCount(state, id) < n) return `not enough ${content.salvage[id]?.name ?? id}`;
  }
  for (const key of ['food', 'water', 'medpatch'] as const) {
    if ((goods[key] ?? 0) > state.resources[key]) return `not enough ${resourceName(key)}`;
  }
  const units = goodsUnits(content, goods);
  if (units < 1) return 'a caravan needs goods to trade';
  if (units > carryLimit(content, ids.length)) return `too much to carry: ${carryLimit(content, ids.length)} loads for ${ids.length}`;
  return null;
}

/** What a caravan would likely bring back (for the UI), or a reason it can't go. */
export function caravanEstimate(
  state: GameState,
  content: Content,
  factionId: string,
  residentIds: number[],
  goods: CaravanGoods,
): CaravanEstimate | string {
  const why = cantSend(state, content, factionId, residentIds, goods);
  if (why) return why;
  const party = [...new Set(residentIds)].map((id) => state.residents.find((r) => r.id === id) as Resident);
  return estimate(state, content, factionDef(content, factionId) as FactionDef, party, goods);
}

/** Send residents with goods to a faction. */
export function sendCaravan(
  state: GameState,
  content: Content,
  factionId: string,
  residentIds: number[],
  goods: { salvage?: Record<string, number>; food?: number; water?: number; medpatch?: number },
): string | null {
  const why = cantSend(state, content, factionId, residentIds, goods);
  if (why) return why;
  const def = factionDef(content, factionId) as FactionDef;
  const party = [...new Set(residentIds)].map((id) => state.residents.find((r) => r.id === id) as Resident);
  const salvage: Record<string, number> = {};
  for (const [id, n] of Object.entries(goods.salvage ?? {})) {
    if (n <= 0) continue;
    state.salvage[id] = salvageCount(state, id) - n;
    salvage[id] = n;
  }
  const carried = { salvage, food: goods.food ?? 0, water: goods.water ?? 0, medpatch: goods.medpatch ?? 0 };
  state.resources.food -= carried.food;
  state.resources.water -= carried.water;
  state.resources.medpatch -= carried.medpatch;
  const leg = (def.route.minutes * 60) / 2;
  const caravan: Caravan = {
    id: state.nextId++,
    factionId,
    residentIds: party.map((r) => r.id),
    goods: carried,
    status: 'travelling',
    remaining: leg,
    total: leg,
    result: null,
  };
  for (const r of party) {
    r.caravan = caravan.id;
    leaveJob(r);
    r.courtship = null;
  }
  state.caravans.push(caravan);
  bump(state, 'caravansSent');
  return null;
}

/** Turn a caravan back on the road: it comes home with its goods, taking as long as it has walked. */
export function recallCaravan(state: GameState, content: Content, caravanId: number): string | null {
  void content;
  const c = state.caravans.find((x) => x.id === caravanId);
  if (!c) return 'no such caravan';
  if (c.status !== 'travelling') return 'already heading home';
  c.status = 'returning';
  c.remaining = c.total - c.remaining;
  return null;
}

function party(state: GameState, c: Caravan): Resident[] {
  return c.residentIds.map((id) => state.residents.find((r) => r.id === id)).filter((r): r is Resident => r !== undefined);
}

/** The caravan reaches its destination: roll the outcome once. */
function resolveCaravan(state: GameState, content: Content, c: Caravan): void {
  const def = factionDef(content, c.factionId);
  if (!def) {
    c.result = { scrip: 0, influence: 0, rep: 0, items: [], log: [] };
    return;
  }
  const t = caravanTuning(content);
  const route = def.route;
  const est = estimate(state, content, def, party(state, c), c.goods);
  const [lo, hi] = t.jitter;
  let scrip = est.scrip * (lo + nextFloat(state.rng) * (hi - lo));
  let influence = nextInt(state.rng, est.influence[0], est.influence[1]);
  let rep = est.rep;
  const log: string[] = [pick(state.rng, route.lines.arrive)];
  const result: CaravanResult = { scrip: 0, influence: 0, rep: 0, items: [], log, xp: route.xp, hurt: 0 };
  if (chance(state.rng, est.ambushChance)) {
    if (chance(state.rng, est.defense)) {
      result.ambush = 'repelled';
      result.hurt = t.ambushDamage[0];
      log.push(pick(state.rng, t.lines.repelled));
    } else {
      result.ambush = 'robbed';
      result.hurt = t.ambushDamage[1];
      scrip *= 1 - t.robbedLoss;
      influence = Math.floor(influence * (1 - t.robbedLoss));
      rep = Math.max(0, rep - 1);
      log.push(pick(state.rng, t.lines.robbed));
    }
  }
  if (chance(state.rng, est.itemChance)) {
    const rarity: Rarity = chance(state.rng, route.legendaryChance) ? 'legendary' : route.itemRarity;
    const kind = route.itemKind ?? (chance(state.rng, 0.5) ? 'weapon' : 'outfit');
    result.items.push(randomItemOf(state, content, kind, rarity));
    log.push(pick(state.rng, t.lines.item));
  }
  if (route.introChance) {
    const unmet = factionsContent(content).factions.filter((f) => !isMet(state, f.id) && f.id !== c.factionId && f.mastLevel <= 2);
    if (unmet.length && chance(state.rng, route.introChance)) {
      const f = pick(state.rng, unmet);
      result.intro = f.id;
      log.push(route.lines.intro?.length ? pick(state.rng, route.lines.intro) : `Word came back from ${f.name}.`);
    }
  }
  result.scrip = Math.round(scrip);
  result.influence = influence;
  result.rep = rep;
  c.result = result;
}

function tickCaravans(state: GameState, content: Content, dt: number): void {
  for (const c of state.caravans) {
    let left = dt;
    if (c.status === 'travelling') {
      c.remaining -= left;
      if (c.remaining > 0) continue;
      // Carry the overshoot into the trip home, so a 60 s step lands like sixty 1 s steps.
      left = -c.remaining;
      resolveCaravan(state, content, c);
      c.status = 'returning';
      c.remaining = c.total;
    }
    if (c.status === 'returning') {
      c.remaining -= left;
      if (c.remaining > 0) continue;
      c.remaining = 0;
      c.status = 'returned';
      state.events.push({ type: 'caravanReturned', caravanId: c.id });
    }
  }
}

/** A caravan back home: pay out (or unpack the goods of a recalled one) and bring everyone inside. */
export function collectCaravan(state: GameState, content: Content, caravanId: number): string | null {
  const c = state.caravans.find((x) => x.id === caravanId);
  if (!c) return 'no such caravan';
  if (c.status !== 'returned') return 'the caravan is not home yet';
  const res = c.result as CaravanResult | null;
  const members = party(state, c);
  if (res) {
    addScrip(state, content, res.scrip);
    earnInfluence(state, res.influence);
    for (const id of res.items) grantItem(state, content, id);
    if (res.rep) {
      // Goodwill from trips tapers once a faction is friendly: Allied should take more than a road habit.
      const now = repOf(state, content, c.factionId);
      const taper = res.rep > 0 ? (now >= 60 ? 0.25 : now >= 25 ? 0.5 : 1) : 1;
      changeRep(state, content, c.factionId, Math.round(res.rep * taper * 10) / 10);
    }
    if (res.intro) changeRep(state, content, res.intro, 0);
    for (const r of members) {
      if (r.dead) continue;
      r.hp = Math.max(1, r.hp - (res.hurt ?? 0));
      if (res.xp) grantXp(state, content, r, res.xp);
    }
    bump(state, 'caravansReturned');
    bump(state, 'caravanScrip', res.scrip);
    bump(state, `caravans.${c.factionId}`);
    if (res.ambush === 'repelled') bump(state, 'caravanAmbushesRepelled');
    if (res.ambush === 'robbed') bump(state, 'caravansRobbed');
  } else {
    for (const [id, n] of Object.entries(c.goods.salvage)) addSalvage(state, content, id, n);
    for (const key of ['food', 'water', 'medpatch'] as const) if (c.goods[key]) addResource(state, content, key, c.goods[key]);
  }
  for (const r of members) {
    r.caravan = null;
    returnToJob(state, content, r);
  }
  state.caravans = state.caravans.filter((x) => x !== c);
  state.events.push({ type: 'caravanCollected', caravanId: c.id });
  return null;
}

// ------------------------------------------------------------------ tick

/** Trade board refresh (online and offline) and caravan travel (online and offline). */
export function tickFactions(state: GameState, content: Content, dt: number): void {
  tickContact(state, content);
  tickTrade(state, content);
  tickCaravans(state, content, dt);
}

// The Glarelands: sending residents out to explore (research 03 §4, GDD §8).
//
// CONTRACT (M3). The signatures below are used by commands.ts, tick.ts and the
// client; keep them stable. See docs/design/M3-spec.md.
//
// How a trip works: every expedition keeps a handful of timers (next item,
// next salvage event, next encounter, next musing, next scrip find) in
// expedition seconds. Each tick advances `elapsed` and fires every timer that
// falls inside the step, in time order, so a 60 s offline step and sixty 1 s
// online steps produce the same kind of trip. Taint accrues continuously
// between events (as an exact integral, so step size doesn't matter).

import type { Content, SalvageMaterial } from '../content';
import { addScrip, resourceCapacity } from '../economy';
import { bump, bumpMax, effectiveMaxHp, effectiveStat, grantXp, isChild } from '../residents';
import { bonus } from '../bonuses';
import { chance, nextFloat, nextInt, pick } from '../rng';
import type { Expedition, ExpeditionLoot, GameState, JournalEntry, JournalKind, Rarity, Resident, StatKey } from '../types';
import { addFragment, addSalvage, fragmentsNeeded, knowsRecipe, unlockRecipe } from './inventory';
import { leaveJob, returnToJob } from './assign';
import { grantItem } from './items';
import { deliverCarried, dropCarried, isLootOnly, rollCacheDig, rollRegionExclusive, rollTreasureMap, tickLoot } from './loot';
import { rulesetMods } from './rulesets';
import { traitCheckBonus, traitExplorerScripMult, traitExplorerTaintMult } from './traits';

export const MAX_SUPPLIES = 25;
export const MAX_EXPLORERS = 25;
export const CARRY_LIMIT = 100;

// ------------------------------------------------------------------ content types

interface Window {
  /** Earliest and latest minute out the event can happen (null = no limit). */
  minMinute: number;
  maxMinute: number | null;
}

interface Check {
  stat: StatKey;
  difficulty: number;
}

interface SalvageReward {
  rarity: Rarity;
  count: [number, number];
  materials: SalvageMaterial[];
}

interface Reward {
  scrip?: [number, number];
  item?: { chance: number; rarity: 'common' | 'rare'; kind?: 'weapon' | 'outfit' };
  salvage?: SalvageReward;
  fragment?: { chance: number; rarity: 'rare' | 'legendary' };
  medpatch?: number;
  purge?: number;
  /** Fraction of max HP healed. */
  heal?: number;
}

interface EnemyDef extends Window, Check {
  id: string;
  name: string;
  damage: number;
  xp: number;
  drop: (SalvageReward & { chance: number }) | null;
  encounter: string[];
  win: string[];
  retreat: string[];
}

/** Locations, NPCs and salvage events share one shape. */
interface EventDef extends Window, Check {
  id: string;
  name: string;
  xp: number;
  damage: number;
  taint: number;
  reward: Reward;
  text: string;
  win: string;
  fail: string;
}

export interface RegionDef {
  id: string;
  name: string;
  description: string;
  danger: number;
  enemies: EnemyDef[];
  locations: EventDef[];
  /** Region-specific musings, mixed in with the general ones. */
  musings?: string[];
  npcs: EventDef[];
  salvage: EventDef[];
}

type Range = [number, number];

interface Tuning {
  itemMinutes: Range;
  salvageMinutes: Range;
  encounterMinutes: Range;
  musingMinutes: Range;
  scripMinutes: Range;
  scripPerFortune: Range;
  scripGrowthPerHour: number;
  encounterWeights: { enemy: number; location: number; npc: number };
  rareItem: { base: number; perHour: number; max: number };
  legendaryFragment: { base: number; perHour: number; max: number };
  commonToRareFragment: number;
  rareToLegendaryFragment: number;
  rareRecipe: number;
  salvageUpgrade: { rarePerHour: number; rareMax: number; legendaryPerHour: number; legendaryMax: number };
  salvageFailCount: Range;
  failXpFraction: number;
  damageGrowthPerHour: number;
  damageJitter: Range;
  taintPerHour: number;
  taintGrowthPerHour: number;
  taintImmuneGrit: number;
  medpatchAt: number;
  purgeAt: number;
  reviveTaintCap: number;
  bodyLootFraction: number;
  minReturnSeconds: number;
  journalCap: number;
  autoEquip: boolean;
}

type JournalLines = Record<
  | 'departure' | 'item' | 'rareItem' | 'equip' | 'fragment' | 'recipe' | 'salvage' | 'rareSalvage' | 'scrip'
  | 'levelup' | 'medpatch' | 'purge' | 'lowHp' | 'highTaint' | 'death' | 'revived' | 'recalled' | 'full' | 'body' | 'arrived',
  string[]
>;

interface ExplorationContent {
  regions: RegionDef[];
  tuning: Tuning;
  musings: string[];
  journal: JournalLines;
}

function data(content: Content): ExplorationContent {
  return content.exploration as unknown as ExplorationContent;
}

export function regionDef(content: Content, id: string): RegionDef | undefined {
  return data(content).regions.find((r) => r.id === id);
}

// ------------------------------------------------------------------ timers

/** Timer keys that schedule events; anything else in `timers` is a flag. */
const EVENT_TIMERS = ['item', 'salvage', 'encounter', 'scrip', 'musing'] as const;
type EventTimer = (typeof EVENT_TIMERS)[number];

function timerRange(t: Tuning, key: EventTimer): Range {
  switch (key) {
    case 'item': return t.itemMinutes;
    case 'salvage': return t.salvageMinutes;
    case 'encounter': return t.encounterMinutes;
    case 'scrip': return t.scripMinutes;
    case 'musing': return t.musingMinutes;
  }
}

function schedule(state: GameState, t: Tuning, e: Expedition, key: EventTimer, from: number): void {
  const [lo, hi] = timerRange(t, key);
  e.timers[key] = from + (lo + nextFloat(state.rng) * (hi - lo)) * 60;
}

function nextTimer(e: Expedition): [EventTimer, number] {
  let best: EventTimer = 'item';
  let at = Infinity;
  for (const k of EVENT_TIMERS) {
    const v = e.timers[k] ?? Infinity;
    if (v < at) {
      at = v;
      best = k;
    }
  }
  return [best, at];
}

// ------------------------------------------------------------------ small helpers

function findResident(state: GameState, id: number): Resident | undefined {
  return state.residents.find((r) => r.id === id);
}

function findExpedition(state: GameState, id: number): Expedition | undefined {
  return state.expeditions.find((e) => e.id === id);
}

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

function hours(e: Expedition): number {
  return e.elapsed / 3600;
}

function minutes(e: Expedition): number {
  return e.elapsed / 60;
}

function inWindow(w: Window, minute: number): boolean {
  return minute >= w.minMinute && (w.maxMinute === null || minute <= w.maxMinute);
}

function emptyLoot(): ExpeditionLoot {
  return { scrip: 0, items: [], salvage: {}, fragments: {}, recipes: [] };
}

function itemName(content: Content, defId: string): string {
  return content.items[defId]?.name ?? defId;
}

/** Weighted pick; weights of 0 are skipped. */
function weighted<T extends string>(state: GameState, weights: Partial<Record<T, number>>): T | null {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (total <= 0) return null;
  let roll = nextFloat(state.rng) * total;
  for (const [k, w] of entries) {
    if (w <= 0) continue;
    roll -= w;
    if (roll < 0) return k;
  }
  return entries.filter(([, w]) => w > 0).pop()?.[0] ?? null;
}

// ------------------------------------------------------------------ journal

/** Kinds that always interest the player; musings and routine finds never push events. */
function writeJournal(
  state: GameState,
  content: Content,
  e: Expedition,
  kind: JournalKind,
  text: string,
  notable: boolean,
  t = e.elapsed,
): void {
  const entry: JournalEntry = { t: Math.round(t), kind, text };
  e.journal.push(entry);
  const cap = data(content).tuning.journalCap;
  while (e.journal.length > cap) {
    // Oldest musing goes first, then the oldest entry of any kind.
    const i = e.journal.findIndex((j) => j.kind === 'musing');
    e.journal.splice(i >= 0 ? i : 0, 1);
  }
  if (notable) state.events.push({ type: 'expeditionJournal', expeditionId: e.id, entry });
}

function line(state: GameState, lines: readonly string[], vars: Record<string, string | number> = {}): string {
  return fill(lines.length ? pick(state.rng, lines) : '', vars);
}

// ------------------------------------------------------------------ checks and health

function weaponRange(content: Content, r: Resident): [number, number] {
  const w = r.weapon ? content.weapons[r.weapon] : undefined;
  return w ? [w.min, w.max] : [1, 1];
}

/**
 * The original's success check (research 03 §4.3):
 * ceil(level/2) + randInt(minDmg, maxDmg) + randInt(0, S-1) + randInt(0, S-1) >= difficulty.
 */
export function checkRoll(state: GameState, content: Content, r: Resident, stat: StatKey): number {
  const s = Math.max(1, Math.floor(effectiveStat(content, r, stat)));
  const [lo, hi] = weaponRange(content, r);
  return Math.ceil(r.level / 2) + nextInt(state.rng, lo, hi) + nextInt(state.rng, 0, s - 1) + nextInt(state.rng, 0, s - 1);
}

function passes(state: GameState, content: Content, r: Resident, check: Check): boolean {
  // M6 trait hook (Lucky Break): flat bonus on checks.
  return checkRoll(state, content, r, check.stat) + traitCheckBonus(content, r, 'explorerCheck') >= check.difficulty;
}

function giveXp(state: GameState, content: Content, e: Expedition, r: Resident, amount: number): void {
  const gained = grantXp(state, content, r, Math.max(0, Math.round(amount)));
  if (gained > 0) {
    writeJournal(state, content, e, 'levelup', line(state, data(content).journal.levelup, { level: r.level }), true);
    delete e.timers['warnHp'];
  }
}

/** Scales hazard damage with region danger and time out: long trips get dangerous. */
function scaledDamage(state: GameState, content: Content, e: Expedition, base: number): number {
  const t = data(content).tuning;
  const region = regionDef(content, e.regionId);
  const [jl, jh] = t.damageJitter;
  const jitter = jl + nextFloat(state.rng) * (jh - jl);
  return base * (region?.danger ?? 1) * (1 + t.damageGrowthPerHour * hours(e)) * jitter;
}

/** Use supplies as needed, then check for death. Returns false if the explorer died. */
function checkHealth(state: GameState, content: Content, e: Expedition, r: Resident): boolean {
  const t = data(content).tuning;
  const J = data(content).journal;
  const med = content.balance.medical;
  while (r.taint >= t.purgeAt * r.maxHp && e.supplies.purge > 0) {
    e.supplies.purge--;
    r.taint = Math.max(0, r.taint - r.maxHp * med.purgeRemove);
    bump(state, 'explorerPurges');
    writeJournal(state, content, e, 'danger', line(state, J.purge, { left: e.supplies.purge }), true);
    delete e.timers['warnTaint'];
  }
  if (r.taint >= t.purgeAt * r.maxHp && e.supplies.purge === 0 && !e.timers['warnTaint']) {
    e.timers['warnTaint'] = 1;
    writeJournal(state, content, e, 'danger', line(state, J.highTaint), true);
  }
  let eff = effectiveMaxHp(r);
  r.hp = Math.min(r.hp, eff);
  while (eff > 0 && r.hp <= t.medpatchAt * eff && e.supplies.medpatch > 0) {
    e.supplies.medpatch--;
    r.hp = Math.min(eff, Math.max(0, r.hp) + r.maxHp * med.medpatchHeal);
    bump(state, 'explorerMedpatches');
    writeJournal(state, content, e, 'danger', line(state, J.medpatch, { left: e.supplies.medpatch }), true);
    delete e.timers['warnHp'];
    eff = effectiveMaxHp(r);
  }
  if (r.hp <= 0 || eff <= 0) {
    die(state, content, e, r);
    return false;
  }
  if (r.hp <= t.medpatchAt * eff && e.supplies.medpatch === 0 && !e.timers['warnHp']) {
    e.timers['warnHp'] = 1;
    writeJournal(state, content, e, 'danger', line(state, J.lowHp), true);
  }
  return true;
}

function hurt(state: GameState, content: Content, e: Expedition, r: Resident, damage: number, taint = 0): boolean {
  r.hp -= damage;
  // M6 trait hook (Glare-Hardened): less taint from hazards.
  if (taint > 0 && !taintImmune(content, r)) r.taint = Math.min(r.maxHp, r.taint + scaledDamage(state, content, e, taint) * traitExplorerTaintMult(content, r) * Math.max(0, 1 - bonus(state, content, 'explorerTaint')) * rulesetMods(state, content).explorerTaint);
  return checkHealth(state, content, e, r);
}

function die(state: GameState, content: Content, e: Expedition, r: Resident): void {
  r.hp = 0;
  r.dead = true;
  e.status = 'dead';
  bump(state, 'explorerDeaths');
  writeJournal(state, content, e, 'status', line(state, data(content).journal.death), true);
  state.events.push({ type: 'explorerDied', expeditionId: e.id, residentId: r.id });
}

function taintImmune(content: Content, r: Resident): boolean {
  return effectiveStat(content, r, 'grit') >= data(content).tuning.taintImmuneGrit;
}

/** Glare exposure between two moments of the trip (exact integral of a linearly rising rate). */
function accrueTaint(state: GameState, content: Content, e: Expedition, r: Resident, until: number): void {
  if (until <= e.elapsed || taintImmune(content, r)) return;
  const t = data(content).tuning;
  const danger = regionDef(content, e.regionId)?.danger ?? 1;
  const h0 = e.elapsed / 3600;
  const h1 = until / 3600;
  const amount = t.taintPerHour * danger * (h1 - h0 + (t.taintGrowthPerHour * (h1 * h1 - h0 * h0)) / 2);
  // M6 trait hook (Glare-Hardened): traitExplorerTaintMult.
  // M9: rulesets (Glass Sky) scale explorer taint.
  r.taint = Math.min(r.maxHp, r.taint + amount * Math.max(0, 1 - bonus(state, content, 'explorerTaint')) * traitExplorerTaintMult(content, r) * rulesetMods(state, content).explorerTaint);
}

// ------------------------------------------------------------------ loot

/** How much an explorer can carry before heading home (Pack Mules raises it). */
export function carryLimit(state: GameState, content: Content): number {
  return CARRY_LIMIT + bonus(state, content, 'carryLimit');
}

function remainingCarry(state: GameState, content: Content, e: Expedition): number {
  return Math.max(0, carryLimit(state, content) - carriedCount(e));
}

function unknownRecipes(state: GameState, content: Content, e: Expedition, rarity: Rarity, kind?: 'weapon' | 'outfit'): string[] {
  return Object.values(content.items)
    .filter((d) => d.rarity === rarity && (!kind || d.kind === kind) && !isLootOnly(content, d.id))
    .map((d) => d.id)
    .filter((id) => !knowsRecipe(state, content, id) && !e.loot.recipes.includes(id))
    .filter((id) => (state.fragments[id] ?? 0) + (e.loot.fragments[id] ?? 0) < fragmentsNeeded(content, id));
}

function giveFragment(state: GameState, content: Content, e: Expedition, rarity: 'rare' | 'legendary'): boolean {
  const pool = unknownRecipes(state, content, e, rarity);
  if (!pool.length) return false;
  const id = pick(state.rng, pool);
  e.loot.fragments[id] = (e.loot.fragments[id] ?? 0) + 1;
  writeJournal(state, content, e, 'find', line(state, data(content).journal.fragment, { item: itemName(content, id) }), true);
  return true;
}

function giveRecipe(state: GameState, content: Content, e: Expedition, rarity: Rarity): boolean {
  const pool = unknownRecipes(state, content, e, rarity);
  if (!pool.length) return false;
  const id = pick(state.rng, pool);
  e.loot.recipes.push(id);
  writeJournal(state, content, e, 'find', line(state, data(content).journal.recipe, { item: itemName(content, id) }), true);
  return true;
}

function weaponScore(content: Content, id: string | null): number {
  const w = id ? content.weapons[id] : undefined;
  return w ? w.max * 100 + w.min : 101;
}

function outfitScore(content: Content, id: string | null): number {
  const o = id ? content.outfits[id] : undefined;
  return o ? Object.values(o.bonus).reduce((a, b) => a + (b ?? 0), 0) : 0;
}

/** Add a weapon or outfit; the explorer puts on anything better than what they have (as in the original). */
function giveItem(state: GameState, content: Content, e: Expedition, r: Resident, defId: string): void {
  if (remainingCarry(state, content, e) <= 0) return;
  const def = content.items[defId];
  if (!def) return;
  const J = data(content).journal;
  const notable = def.rarity !== 'common';
  writeJournal(state, content, e, 'find', line(state, notable ? J.rareItem : J.item, { item: def.name }), notable);
  let stored = defId;
  if (data(content).tuning.autoEquip) {
    const slot = def.kind === 'weapon' ? 'weapon' : 'outfit';
    const score = def.kind === 'weapon' ? weaponScore : outfitScore;
    if (score(content, defId) > score(content, r[slot])) {
      const old = r[slot];
      r[slot] = defId;
      r.hp = Math.min(r.hp, effectiveMaxHp(r));
      writeJournal(state, content, e, 'find', line(state, J.equip, { item: def.name }), notable);
      if (!old) return;
      stored = old;
    }
  }
  e.loot.items.push(stored);
}

/** The guaranteed item find (about hourly), with the blueprint substitutions. */
function findItem(state: GameState, content: Content, e: Expedition, r: Resident, forced?: { rarity: 'common' | 'rare'; kind?: 'weapon' | 'outfit' }): void {
  const t = data(content).tuning;
  const h = hours(e);
  if (!forced) {
    const legP = Math.min(t.legendaryFragment.max, t.legendaryFragment.base + t.legendaryFragment.perHour * h);
    if (chance(state.rng, legP) && giveFragment(state, content, e, 'legendary')) return;
  }
  const rareP = Math.min(t.rareItem.max, t.rareItem.base + t.rareItem.perHour * h);
  const rarity: 'common' | 'rare' = forced?.rarity ?? (chance(state.rng, rareP) ? 'rare' : 'common');
  if (rarity === 'common' && chance(state.rng, t.commonToRareFragment) && giveFragment(state, content, e, 'rare')) return;
  if (rarity === 'rare') {
    if (chance(state.rng, t.rareToLegendaryFragment) && giveFragment(state, content, e, 'legendary')) return;
    if (chance(state.rng, t.rareRecipe) && giveRecipe(state, content, e, 'rare')) return;
  }
  const kind = forced?.kind ?? (chance(state.rng, 0.5) ? 'weapon' : 'outfit');
  giveItem(state, content, e, r, randomFindable(state, content, kind, rarity));
}

/** A random weapon or outfit of this rarity, never a lootOnly one (M9: those come from loot.ts paths). */
function randomFindable(state: GameState, content: Content, kind: 'weapon' | 'outfit', rarity: Rarity): string {
  const pool = Object.values(kind === 'weapon' ? content.weapons : content.outfits).filter((d) => d.rarity === rarity && !isLootOnly(content, d.id));
  return pick(state.rng, pool).id;
}

/**
 * M9 item find: sometimes a region exclusive instead of the usual find, and
 * separately a rare chance of a treasure map (revealed when they get home).
 */
function itemFind(state: GameState, content: Content, e: Expedition, r: Resident, region: RegionDef): void {
  const exclusive = rollRegionExclusive(state, content, e);
  if (exclusive) giveItem(state, content, e, r, exclusive);
  else findItem(state, content, e, r);
  const map = rollTreasureMap(state, content, e, (id) => !!regionDef(content, id));
  if (map !== null) writeJournal(state, content, e, 'find', map, true);
}

function salvageRarity(state: GameState, content: Content, e: Expedition, base: Rarity): Rarity {
  if (base === 'legendary') return base;
  const u = data(content).tuning.salvageUpgrade;
  const h = hours(e);
  if (chance(state.rng, Math.min(u.legendaryMax, u.legendaryPerHour * h))) return 'legendary';
  if (base === 'common' && chance(state.rng, Math.min(u.rareMax, u.rarePerHour * h))) return 'rare';
  return base;
}

/** Add salvage units (limited by the carry limit); rarity may upgrade the longer the trip. */
function giveSalvage(state: GameState, content: Content, e: Expedition, reward: SalvageReward, count: number, upgrade: boolean): void {
  const J = data(content).journal;
  const got: Record<string, number> = {};
  for (let i = 0; i < count && remainingCarry(state, content, e) > 0; i++) {
    const rarity = upgrade ? salvageRarity(state, content, e, reward.rarity) : reward.rarity;
    const material = pick(state.rng, reward.materials);
    const pool = content.salvageList.filter((s) => s.material === material && s.rarity === rarity);
    if (!pool.length) continue;
    const id = pick(state.rng, pool).id;
    e.loot.salvage[id] = (e.loot.salvage[id] ?? 0) + 1;
    got[id] = (got[id] ?? 0) + 1;
  }
  for (const [id, n] of Object.entries(got)) {
    const def = content.salvage[id];
    if (!def) continue;
    const notable = def.rarity !== 'common';
    writeJournal(state, content, e, 'find', line(state, notable ? J.rareSalvage : J.salvage, { n, salvage: def.name }), notable);
  }
}

function giveScrip(state: GameState, content: Content, e: Expedition, amount: number, journal: boolean): void {
  const n = Math.max(0, Math.round(amount));
  if (n <= 0) return;
  e.loot.scrip += n;
  if (journal) writeJournal(state, content, e, 'find', line(state, data(content).journal.scrip, { n }), false);
}

function applyReward(state: GameState, content: Content, e: Expedition, r: Resident, reward: Reward): void {
  if (reward.scrip) giveScrip(state, content, e, nextInt(state.rng, reward.scrip[0], reward.scrip[1]), false);
  if (reward.medpatch) e.supplies.medpatch = Math.min(MAX_SUPPLIES, e.supplies.medpatch + reward.medpatch);
  if (reward.purge) e.supplies.purge = Math.min(MAX_SUPPLIES, e.supplies.purge + reward.purge);
  if (reward.heal) r.hp = Math.min(effectiveMaxHp(r), r.hp + r.maxHp * reward.heal);
  if (reward.salvage) giveSalvage(state, content, e, reward.salvage, nextInt(state.rng, reward.salvage.count[0], reward.salvage.count[1]), true);
  if (reward.item && chance(state.rng, reward.item.chance)) findItem(state, content, e, r, { rarity: reward.item.rarity, kind: reward.item.kind });
  if (reward.fragment && chance(state.rng, reward.fragment.chance)) giveFragment(state, content, e, reward.fragment.rarity);
}

// ------------------------------------------------------------------ events

function doEnemy(state: GameState, content: Content, e: Expedition, r: Resident, foe: EnemyDef): void {
  const t = data(content).tuning;
  writeJournal(state, content, e, 'fight', line(state, foe.encounter), false);
  if (passes(state, content, r, foe)) {
    bump(state, 'encountersWon');
    bump(state, `slain.${foe.id}`);
    writeJournal(state, content, e, 'fight', line(state, foe.win), true);
    if (foe.drop && chance(state.rng, foe.drop.chance)) {
      giveSalvage(state, content, e, foe.drop, nextInt(state.rng, foe.drop.count[0], foe.drop.count[1]), false);
    }
    giveXp(state, content, e, r, foe.xp);
  } else {
    bump(state, 'encountersFled');
    writeJournal(state, content, e, 'fight', line(state, foe.retreat), true);
    giveXp(state, content, e, r, foe.xp * t.failXpFraction);
    if (!r.dead) hurt(state, content, e, r, scaledDamage(state, content, e, foe.damage));
  }
}

function doEvent(state: GameState, content: Content, e: Expedition, r: Resident, ev: EventDef, kind: 'location' | 'npc'): void {
  const t = data(content).tuning;
  e.done.push(ev.id);
  bump(state, kind === 'npc' ? 'npcsMet' : 'locationsExplored');
  writeJournal(state, content, e, 'event', ev.text, false);
  if (passes(state, content, r, ev)) {
    writeJournal(state, content, e, 'event', ev.win, false);
    applyReward(state, content, e, r, ev.reward);
    giveXp(state, content, e, r, ev.xp);
  } else {
    writeJournal(state, content, e, 'event', ev.fail, false);
    giveXp(state, content, e, r, ev.xp * t.failXpFraction);
    if (!r.dead && (ev.damage > 0 || ev.taint > 0)) hurt(state, content, e, r, ev.damage > 0 ? scaledDamage(state, content, e, ev.damage) : 0, ev.taint);
  }
}

function doSalvageEvent(state: GameState, content: Content, e: Expedition, r: Resident, region: RegionDef): void {
  const t = data(content).tuning;
  const m = minutes(e);
  const pool = region.salvage.filter((s) => inWindow(s, m));
  if (!pool.length) return;
  const ev = pick(state.rng, pool);
  bump(state, 'salvageEvents');
  writeJournal(state, content, e, 'find', ev.text, false);
  const reward = ev.reward.salvage;
  if (!reward) return;
  if (passes(state, content, r, ev)) {
    bump(state, 'salvageEventsWon');
    writeJournal(state, content, e, 'find', ev.win, false);
    giveSalvage(state, content, e, reward, nextInt(state.rng, reward.count[0], reward.count[1]), true);
    giveXp(state, content, e, r, ev.xp);
  } else {
    // A consolation handful of the common grade, so salvage keeps trickling in.
    writeJournal(state, content, e, 'find', ev.fail, false);
    const n = nextInt(state.rng, t.salvageFailCount[0], t.salvageFailCount[1]);
    giveSalvage(state, content, e, { ...reward, rarity: 'common' }, n, false);
    giveXp(state, content, e, r, ev.xp * t.failXpFraction);
  }
}

function doEncounter(state: GameState, content: Content, e: Expedition, r: Resident, region: RegionDef): void {
  const t = data(content).tuning;
  const m = minutes(e);
  const enemies = region.enemies.filter((x) => inWindow(x, m));
  const locations = region.locations.filter((x) => inWindow(x, m) && !e.done.includes(x.id));
  const npcs = region.npcs.filter((x) => inWindow(x, m) && !e.done.includes(x.id));
  const kind = weighted(state, {
    enemy: enemies.length ? t.encounterWeights.enemy : 0,
    location: locations.length ? t.encounterWeights.location : 0,
    npc: npcs.length ? t.encounterWeights.npc : 0,
  });
  if (kind === 'enemy') doEnemy(state, content, e, r, pick(state.rng, enemies));
  else if (kind === 'location') doEvent(state, content, e, r, pick(state.rng, locations), 'location');
  else if (kind === 'npc') doEvent(state, content, e, r, pick(state.rng, npcs), 'npc');
  else doMusing(state, content, e);
}

function doMusing(state: GameState, content: Content, e: Expedition): void {
  const local = regionDef(content, e.regionId)?.musings ?? [];
  // Half the time, something only this region would make you think.
  const musings = local.length && chance(state.rng, 0.5) ? local : data(content).musings;
  if (!musings.length) return;
  // Avoid repeating something from the last stretch of the journal.
  let text = pick(state.rng, musings);
  const recent = e.journal.slice(-40);
  for (let tries = 0; tries < 4 && recent.some((j) => j.text === text); tries++) text = pick(state.rng, musings);
  writeJournal(state, content, e, 'musing', text, false);
}

function doScripFind(state: GameState, content: Content, e: Expedition, r: Resident): void {
  const t = data(content).tuning;
  // Scales linearly with Fortune (research 03 §4.2), and a little with time out.
  const fortune = Math.max(1, effectiveStat(content, r, 'fortune'));
  const base = nextInt(state.rng, t.scripPerFortune[0], t.scripPerFortune[1]);
  // M6 trait hook (Loose Change): traitExplorerScripMult.
  giveScrip(state, content, e, base * fortune * (1 + t.scripGrowthPerHour * hours(e)) * (1 + bonus(state, content, 'explorerScrip')) * traitExplorerScripMult(content, r), true);
}

function fire(state: GameState, content: Content, e: Expedition, r: Resident, region: RegionDef, key: EventTimer): void {
  switch (key) {
    case 'item': return itemFind(state, content, e, r, region);
    case 'salvage': return doSalvageEvent(state, content, e, r, region);
    case 'encounter': {
      // M9: with a map to this region, an encounter may be the dig instead.
      const dug = rollCacheDig(state, content, e);
      if (dug !== null) return writeJournal(state, content, e, 'find', dug, true);
      return doEncounter(state, content, e, r, region);
    }
    case 'scrip': return doScripFind(state, content, e, r);
    case 'musing': return doMusing(state, content, e);
  }
}

// ------------------------------------------------------------------ travel

function startReturn(state: GameState, content: Content, e: Expedition, reason: 'recalled' | 'full'): void {
  const t = data(content).tuning;
  const J = data(content).journal;
  e.status = 'returning';
  e.returnRemaining = Math.max(t.minReturnSeconds, e.elapsed / 2);
  e.timers['returnTotal'] = e.returnRemaining;
  writeJournal(state, content, e, 'status', line(state, reason === 'full' ? J.full : J.recalled), true);
  state.events.push({ type: 'expeditionReturning', expeditionId: e.id, reason });
}

/** Keep a random `fraction` of the loot (a body brought home loses the rest in transit). */
function halveLoot(state: GameState, loot: ExpeditionLoot, fraction: number): void {
  const keep = <T>(arr: T[]): T[] => {
    const copy = [...arr];
    const n = Math.floor(copy.length * fraction);
    const out: T[] = [];
    while (out.length < n && copy.length) out.push(copy.splice(Math.floor(nextFloat(state.rng) * copy.length), 1)[0] as T);
    return out;
  };
  loot.scrip = Math.floor(loot.scrip * fraction);
  loot.items = keep(loot.items);
  loot.recipes = keep(loot.recipes);
  for (const bag of [loot.salvage, loot.fragments]) {
    for (const [id, n] of Object.entries(bag)) {
      const left = Math.floor(n * fraction);
      if (left > 0) bag[id] = left;
      else delete bag[id];
    }
  }
}

// ------------------------------------------------------------------ contract

/** Why this resident can't leave right now, or null if they can. */
export function canExplore(state: GameState, content: Content, r: Resident): string | null {
  void content;
  if (r.dead) return 'fallen residents cannot explore';
  if (r.waiting) return 'let them in first';
  if (r.expedition !== null) return 'already out exploring';
  if (r.quest !== null) return 'away on a quest';
  if ((r.caravan ?? null) !== null) return 'away with a caravan';
  if (isChild(state, r)) return 'children are too young to explore';
  if (r.pregnancy !== null) return 'too risky while expecting';
  if (state.expeditions.length >= MAX_EXPLORERS) return `no more than ${MAX_EXPLORERS} explorers at once`;
  return null;
}

/** Send a resident out. Supplies come out of homestead stock. Returns an error or null. */
export function startExpedition(
  state: GameState,
  content: Content,
  residentId: number,
  regionId: string,
  supplies: { medpatch: number; purge: number },
): string | null {
  const r = findResident(state, residentId);
  if (!r) return 'no such resident';
  const why = canExplore(state, content, r);
  if (why) return why;
  const region = regionDef(content, regionId);
  if (!region || !state.regionsUnlocked.includes(regionId)) return 'that region is not available';
  for (const key of ['medpatch', 'purge'] as const) {
    const n = supplies[key];
    if (!Number.isInteger(n) || n < 0 || n > MAX_SUPPLIES) return `supplies must be 0 to ${MAX_SUPPLIES}`;
    if (n > Math.floor(state.resources[key])) return key === 'medpatch' ? 'not enough Med-Patches' : 'not enough Purge';
  }
  state.resources.medpatch -= supplies.medpatch;
  state.resources.purge -= supplies.purge;

  const t = data(content).tuning;
  const e: Expedition = {
    id: state.nextId++,
    residentId: r.id,
    regionId,
    status: 'exploring',
    elapsed: 0,
    returnRemaining: 0,
    supplies: { medpatch: supplies.medpatch, purge: supplies.purge },
    loot: emptyLoot(),
    journal: [],
    timers: {},
    done: [],
  };
  for (const key of EVENT_TIMERS) schedule(state, t, e, key, 0);
  state.expeditions.push(e);

  r.expedition = e.id;
  leaveJob(r);
  r.courtship = null;
  for (const other of state.residents) if (other.courtship?.partnerId === r.id) other.courtship = null;

  bump(state, 'expeditionsStarted');
  writeJournal(state, content, e, 'status', line(state, data(content).journal.departure, { region: region.name }), true);
  state.events.push({ type: 'expeditionStarted', expeditionId: e.id, residentId: r.id });
  return null;
}

/** Start the trip home (takes half the time spent out). */
export function recallExpedition(state: GameState, content: Content, expeditionId: number): string | null {
  const e = findExpedition(state, expeditionId);
  if (!e) return 'no such expedition';
  if (e.status === 'returning') return 'already on the way home';
  if (e.status === 'returned') return 'already home';
  if (e.status === 'dead') {
    // The body comes home with part of the loot.
    halveLoot(state, e.loot, data(content).tuning.bodyLootFraction);
    e.status = 'returning';
    e.returnRemaining = Math.max(data(content).tuning.minReturnSeconds, e.elapsed / 2);
    e.timers['returnTotal'] = e.returnRemaining;
    writeJournal(state, content, e, 'status', line(state, data(content).journal.body), true);
    state.events.push({ type: 'expeditionReturning', expeditionId: e.id, reason: 'recalled' });
    return null;
  }
  startReturn(state, content, e, 'recalled');
  return null;
}

/** A returned explorer: move loot into the homestead and the resident back inside. */
export function collectExpedition(state: GameState, content: Content, expeditionId: number): string | null {
  const e = findExpedition(state, expeditionId);
  if (!e) return 'no such expedition';
  if (e.status !== 'returned') return 'they are not home yet';
  // M9: maps are revealed and dug-up caches unpacked on the way in.
  deliverCarried(state, content, e);
  const loot = e.loot;
  for (const defId of loot.items) grantItem(state, content, defId);
  for (const [id, n] of Object.entries(loot.salvage)) addSalvage(state, content, id, n);
  for (const [id, n] of Object.entries(loot.fragments)) addFragment(state, content, id, n);
  for (const id of loot.recipes) unlockRecipe(state, content, id, 'found');
  addScrip(state, content, loot.scrip);
  for (const key of ['medpatch', 'purge'] as const) {
    const cap = resourceCapacity(state, content, key);
    state.resources[key] = Math.max(state.resources[key], Math.min(cap, state.resources[key] + e.supplies[key]));
  }

  const r = findResident(state, e.residentId);
  if (r) {
    r.expedition = null;
    returnToJob(state, content, r);
  }
  state.expeditions = state.expeditions.filter((x) => x !== e);

  if (r && !r.dead) bump(state, 'expeditionsCompleted');
  bump(state, 'glarelandsScrip', loot.scrip);
  bump(state, 'glarelandsItems', loot.items.length);
  state.events.push({ type: 'expeditionCollected', expeditionId: e.id, loot });
  return null;
}

/** Advance every expedition by dt seconds. Runs online and offline. */
export function tickExpeditions(state: GameState, content: Content, dt: number): void {
  tickLoot(state);
  if (dt <= 0 || state.expeditions.length === 0) return;
  for (const e of [...state.expeditions]) {
    const r = findResident(state, e.residentId);
    if (!r) {
      // The resident is gone for good (laid to rest while away): so is the trip.
      state.expeditions = state.expeditions.filter((x) => x !== e);
      dropCarried(state, e.id);
      continue;
    }
    if (e.status === 'returning') {
      e.returnRemaining = Math.max(0, e.returnRemaining - dt);
      if (e.returnRemaining <= 0) {
        e.status = 'returned';
        const total = e.timers['returnTotal'] ?? 0;
        if (!r.dead) writeJournal(state, content, e, 'status', line(state, data(content).journal.arrived), true, e.elapsed + total);
        state.events.push({ type: 'expeditionReturned', expeditionId: e.id });
      }
      continue;
    }
    if (e.status === 'exploring') explore(state, content, e, r, dt);
  }
}

function explore(state: GameState, content: Content, e: Expedition, r: Resident, dt: number): void {
  const region = regionDef(content, e.regionId);
  if (!region) return;
  const t = data(content).tuning;
  const start = e.elapsed;
  const end = e.elapsed + dt;
  for (;;) {
    const [key, at] = nextTimer(e);
    if (at > end) break;
    accrueTaint(state, content, e, r, at);
    e.elapsed = Math.max(e.elapsed, at);
    if (!checkHealth(state, content, e, r)) break;
    schedule(state, t, e, key, at);
    fire(state, content, e, r, region, key);
    if (e.status !== 'exploring') break;
    if (carriedCount(e) >= carryLimit(state, content)) {
      startReturn(state, content, e, 'full');
      break;
    }
  }
  if (e.status === 'exploring') {
    accrueTaint(state, content, e, r, end);
    e.elapsed = end;
    checkHealth(state, content, e, r);
  }
  bump(state, 'explorerSeconds', e.elapsed - start);
  bumpMax(state, 'longestExpedition', Math.floor(e.elapsed));
}

/** Called after a fallen explorer is revived: the expedition carries on. */
export function onResidentRevived(state: GameState, content: Content, residentId: number): void {
  const r = findResident(state, residentId);
  if (!r || r.expedition === null) return;
  const e = findExpedition(state, r.expedition);
  if (!e || e.status !== 'dead') return;
  // Revival clears the worst of the Glare-sickness so they don't drop again at once.
  const cap = data(content).tuning.reviveTaintCap * r.maxHp;
  if (r.taint > cap) r.taint = cap;
  r.hp = effectiveMaxHp(r);
  e.status = 'exploring';
  delete e.timers['warnHp'];
  delete e.timers['warnTaint'];
  writeJournal(state, content, e, 'status', line(state, data(content).journal.revived), true);
}

/** Seconds until a returning explorer is home (0 when not returning). */
export function secondsUntilHome(e: Expedition): number {
  return e.status === 'returning' ? e.returnRemaining : 0;
}

/** Items carried toward the carry limit (weapons, outfits and salvage units). */
export function carriedCount(e: Expedition): number {
  return e.loot.items.length + Object.values(e.loot.salvage).reduce((a, b) => a + b, 0);
}

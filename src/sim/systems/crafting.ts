// Workshops, recipes, scrapping and reforging (GDD §15.1, research 02 §14).
//
// CONTRACT (M3). The signatures below are used by commands.ts, tick.ts and the
// client; keep them stable. See docs/design/M3-spec.md.
//
// - Recipes are data (crafting.json). Commons are always known; rares and
//   legendaries are learned from blueprints (fragments or whole recipes).
// - A job counts down in base-seconds. The crew's summed craft stat decides how
//   many base-seconds pass per real second, so swapping workers mid-job changes
//   the speed from that moment on. Offline ticks of 60 s are exact (linear).
// - Scrapping gives back most of the recipe's salvage and, for unknown recipes,
//   a blueprint fragment, so duplicate rares slowly turn into a recipe.
// - Reforging turns three of a kind into one of the next rarity, with a pity
//   guarantee so bad luck always ends.

import type { Content, ItemDef } from '../content';
import { addScrip } from '../economy';
import { roomDef } from '../grid';
import { bump, effectiveStat, grantXp, workersInRoom } from '../residents';
import { chance, nextFloat, pick } from '../rng';
import type { GameState, Item, Rarity, Room } from '../types';
import { addFragment, addSalvage, knowsRecipe, salvageCount, spendSalvage, SALVAGE_CAP } from './inventory';
import { grantItem, itemCapacity } from './items';
import { workerMult } from './traits';

export interface Recipe {
  defId: string;
  /** Salvage id -> count consumed. */
  salvage: Record<string, number>;
  scrip: number;
  /** Base seconds before stat reductions. */
  seconds: number;
  /** Room type that crafts it: 'weaponshop' or 'outfitshop'. */
  workshop: string;
  /** Workshop level needed: 1 common, 2 rare, 3 legendary. */
  minLevel: number;
}

interface LossTable {
  /** Units lost (a large number means "all of them"). */
  loss: number[];
  w: number[];
  /** Never return fewer than this many units of the group (if the recipe has them). */
  minKeep: number;
}

interface CraftTuning {
  maxCrewStat: number;
  maxTimeReduction: number;
  xpPerCraft: Record<Rarity, number>;
  reforge: {
    cost: Record<Rarity, number>;
    upgradeChance: Partial<Record<Rarity, number>>;
    pityAfter: number;
  };
  scrap: {
    /** Item rarity -> salvage rarity -> loss table. */
    loss: Partial<Record<Rarity, Partial<Record<Rarity, LossTable>>>>;
    legendaryFragmentChance: Record<Rarity, number>;
  };
}

const NEXT_RARITY: Partial<Record<Rarity, Rarity>> = { common: 'rare', rare: 'legendary' };

function tuning(content: Content): CraftTuning {
  return content.crafting.tuning as unknown as CraftTuning;
}

function allRecipes(content: Content): Recipe[] {
  return content.crafting.recipes as unknown as Recipe[];
}

export function recipeFor(content: Content, defId: string): Recipe | undefined {
  return allRecipes(content).find((r) => r.defId === defId);
}

/** Every recipe a workshop room could make (known or not), for the UI list. */
export function workshopRecipes(content: Content, room: Room): Recipe[] {
  return allRecipes(content).filter((r) => r.workshop === room.type);
}

function findRoom(state: GameState, roomId: number): Room | undefined {
  return state.rooms.find((r) => r.id === roomId);
}

function hasIncident(state: GameState, room: Room): boolean {
  return state.incidents.some((i) => i.roomId === room.id);
}

/** Summed effective craft stat of the adults working in the room. */
export function crewCraftStat(state: GameState, content: Content, room: Room, defId: string): number {
  const def = content.items[defId];
  if (!def) return 0;
  // Traits (Tinkerer) scale each crafter's contribution.
  return workersInRoom(state, room.id).reduce((s, r) => s + effectiveStat(content, r, def.craftStat) * workerMult(state, content, r, room), 0);
}

/** Real seconds for `base` base-seconds with this crew; Infinity with nobody working. */
function secondsFor(state: GameState, content: Content, room: Room, defId: string, base: number): number {
  if (workersInRoom(state, room.id).length === 0) return Infinity;
  const t = tuning(content);
  const share = Math.min(1, crewCraftStat(state, content, room, defId) / t.maxCrewStat);
  return base * (1 - t.maxTimeReduction * share);
}

function stalled(state: GameState, room: Room): boolean {
  return !room.powered || hasIncident(state, room) || workersInRoom(state, room.id).length === 0;
}

/** Why this room can't craft this item now, or null if it can. */
export function canCraft(state: GameState, content: Content, room: Room, defId: string): string | null {
  if (roomDef(content, room).category !== 'workshop') return 'not a workshop';
  const recipe = recipeFor(content, defId);
  const def = content.items[defId];
  if (!recipe || !def) return 'no such recipe';
  if (recipe.workshop !== room.type) return `made in the ${content.rooms[recipe.workshop]?.name ?? recipe.workshop}`;
  if (room.level < recipe.minLevel) return `needs a level ${recipe.minLevel} workshop`;
  if (room.job) return room.job.remaining <= 0 ? 'collect the finished item first' : 'already crafting';
  if (hasIncident(state, room)) return 'deal with the incident first';
  if (!knowsRecipe(state, content, defId)) return 'recipe not known yet';
  if (!room.powered) return 'no power';
  if (workersInRoom(state, room.id).length === 0) return 'needs at least one worker';
  for (const [id, n] of Object.entries(recipe.salvage)) {
    const have = salvageCount(state, id);
    if (have < n) return `needs ${n - have} more ${content.salvage[id]?.name ?? id}`;
  }
  if (state.scrip < recipe.scrip) return 'not enough scrip';
  return null;
}

/** Seconds this room would take with its current crew (Infinity with no crew). */
export function craftSeconds(state: GameState, content: Content, room: Room, defId: string): number {
  const recipe = recipeFor(content, defId);
  if (!recipe) return Infinity;
  return secondsFor(state, content, room, defId, recipe.seconds);
}

/** Real seconds left on this room's job at the current crew's speed (Infinity if stalled, 0 if done). */
export function craftTimeLeft(state: GameState, content: Content, room: Room): number {
  const job = room.job;
  if (!job) return Infinity;
  if (job.remaining <= 0) return 0;
  if (stalled(state, room)) return Infinity;
  const full = secondsFor(state, content, room, job.defId, job.total);
  return (job.remaining * full) / job.total;
}

export function startCraft(state: GameState, content: Content, roomId: number, defId: string): string | null {
  const room = findRoom(state, roomId);
  if (!room) return 'no such room';
  const err = canCraft(state, content, room, defId);
  if (err) return err;
  const recipe = recipeFor(content, defId) as Recipe;
  if (!spendSalvage(state, recipe.salvage)) return 'not enough salvage';
  addScrip(state, content, -recipe.scrip);
  room.job = { defId, remaining: recipe.seconds, total: recipe.seconds };
  bump(state, 'craftsStarted');
  bump(state, 'craftScripSpent', recipe.scrip);
  state.events.push({ type: 'craftStarted', roomId, defId });
  return null;
}

/** Collect a finished job into storage. */
export function collectCraft(state: GameState, content: Content, roomId: number): string | null {
  const room = findRoom(state, roomId);
  if (!room) return 'no such room';
  const job = room.job;
  if (!job) return 'nothing to collect';
  if (job.remaining > 0) return 'still crafting';
  const def = content.items[job.defId];
  if (!def) {
    room.job = null;
    return 'unknown item';
  }
  // Never auto-sell something the player waited hours for.
  if (state.items.length >= itemCapacity(state, content)) return 'storage is full';
  grantItem(state, content, def.id);
  room.job = null;
  const xp = tuning(content).xpPerCraft[def.rarity] ?? 0;
  for (const r of workersInRoom(state, room.id)) grantXp(state, content, r, xp);
  bump(state, 'itemsCrafted');
  bump(state, `crafted.${def.rarity}`);
  bump(state, `crafted.${def.kind}`);
  state.events.push({ type: 'craftCollected', roomId, defId: def.id });
  return null;
}

/** Cancel a job in progress; refunds its salvage and scrip. */
export function cancelCraft(state: GameState, content: Content, roomId: number): string | null {
  const room = findRoom(state, roomId);
  if (!room) return 'no such room';
  const job = room.job;
  if (!job) return 'nothing to cancel';
  if (job.remaining <= 0) return 'already finished: collect it';
  const recipe = recipeFor(content, job.defId);
  if (recipe) {
    // A refund is not a find, so it bypasses addSalvage (and its salvageFound counter).
    for (const [id, n] of Object.entries(recipe.salvage)) {
      state.salvage[id] = Math.min(SALVAGE_CAP, salvageCount(state, id) + n);
    }
    addScrip(state, content, recipe.scrip);
    bump(state, 'craftScripSpent', -recipe.scrip);
  }
  room.job = null;
  bump(state, 'craftsCancelled');
  return null;
}

/** Advance crafting jobs. Runs online and offline. */
export function tickCrafting(state: GameState, content: Content, dt: number): void {
  if (dt <= 0) return;
  for (const room of state.rooms) {
    const job = room.job;
    if (!job || job.remaining <= 0 || stalled(state, room)) continue;
    const full = secondsFor(state, content, room, job.defId, job.total);
    if (!Number.isFinite(full) || full <= 0) continue;
    job.remaining -= (dt * job.total) / full;
    if (job.remaining <= 1e-9) {
      job.remaining = 0;
      state.events.push({ type: 'craftFinished', roomId: room.id, defId: job.defId });
    }
  }
}

// ------------------------------------------------------------------ scrapping

/** Recipe salvage split by salvage rarity, in recipe order. */
function salvageGroups(content: Content, recipe: Recipe): Map<Rarity, [string, number][]> {
  const groups = new Map<Rarity, [string, number][]>();
  for (const [id, n] of Object.entries(recipe.salvage)) {
    const rarity = content.salvage[id]?.rarity;
    if (!rarity || n <= 0) continue;
    const g = groups.get(rarity) ?? [];
    g.push([id, n]);
    groups.set(rarity, g);
  }
  return groups;
}

function lossTable(content: Content, itemRarity: Rarity, salvageRarity: Rarity): LossTable | undefined {
  return tuning(content).scrap.loss[itemRarity]?.[salvageRarity];
}

/** Units kept from a group of `total` after losing `loss`. */
function kept(total: number, loss: number, table: LossTable): number {
  return Math.max(Math.min(table.minKeep, total), total - loss);
}

function rollLoss(state: GameState, table: LossTable): number {
  const sum = table.w.reduce((a, b) => a + b, 0);
  let x = nextFloat(state.rng) * sum;
  for (let i = 0; i < table.w.length; i++) {
    x -= table.w[i] ?? 0;
    if (x < 0) return table.loss[i] ?? 0;
  }
  return table.loss[table.loss.length - 1] ?? 0;
}

/** What scrapping would return on average (for the UI). */
export function scrapPreview(content: Content, defId: string): Record<string, number> {
  const def = content.items[defId];
  const recipe = recipeFor(content, defId);
  if (!def || !recipe) return {};
  const out: Record<string, number> = {};
  for (const [rarity, entries] of salvageGroups(content, recipe)) {
    const total = entries.reduce((s, [, n]) => s + n, 0);
    const table = lossTable(content, def.rarity, rarity);
    let expected = total;
    if (table) {
      const wsum = table.w.reduce((a, b) => a + b, 0);
      expected = table.loss.reduce((s, loss, i) => s + ((table.w[i] ?? 0) / wsum) * kept(total, loss, table), 0);
    }
    for (const [id, n] of entries) out[id] = Math.round(((expected * n) / total) * 100) / 100;
  }
  return out;
}

/** Break a stored item into salvage (and maybe a blueprint fragment). */
export function scrapItem(state: GameState, content: Content, itemId: number): string | null {
  const idx = state.items.findIndex((i) => i.id === itemId);
  const item = state.items[idx];
  if (!item) return 'no such item in storage';
  const def = content.items[item.defId];
  const recipe = recipeFor(content, item.defId);
  if (!def || !recipe) return 'that cannot be scrapped';
  state.items.splice(idx, 1);

  const returned: Record<string, number> = {};
  for (const [rarity, entries] of salvageGroups(content, recipe)) {
    const counts = entries.map(([, n]) => n);
    const total = counts.reduce((a, b) => a + b, 0);
    const table = lossTable(content, def.rarity, rarity);
    let lose = table ? total - kept(total, rollLoss(state, table), table) : 0;
    // Take lost units one at a time from random entries, weighted by what is left.
    while (lose-- > 0) {
      let x = nextFloat(state.rng) * counts.reduce((a, b) => a + b, 0);
      for (let i = 0; i < counts.length; i++) {
        x -= counts[i] ?? 0;
        if (x < 0) {
          counts[i] = (counts[i] ?? 0) - 1;
          break;
        }
      }
    }
    entries.forEach(([id], i) => {
      const n = counts[i] ?? 0;
      if (n > 0) returned[id] = addSalvage(state, content, id, n);
    });
  }

  // Duplicates teach you the recipe: each scrap is a fragment toward it.
  if (def.rarity !== 'common') addFragment(state, content, def.id, 1);
  // And occasionally a glimpse of something better.
  if (chance(state.rng, tuning(content).scrap.legendaryFragmentChance[def.rarity] ?? 0)) {
    const pool = itemsOf(content, def.kind, 'legendary').filter((d) => !knowsRecipe(state, content, d.id));
    if (pool.length) addFragment(state, content, pick(state.rng, pool).id, 1);
  }

  bump(state, 'itemsScrapped');
  bump(state, `scrapped.${def.rarity}`);
  state.events.push({ type: 'itemScrapped', defId: def.id, salvage: returned });
  return null;
}

// ------------------------------------------------------------------ reforging

function itemsOf(content: Content, kind: ItemDef['kind'], rarity: Rarity): ItemDef[] {
  return Object.values(content.items).filter((d) => d.kind === kind && d.rarity === rarity);
}

/** A random item of this kind and rarity, avoiding `exclude` when anything else exists. */
function randomAvoiding(state: GameState, content: Content, kind: ItemDef['kind'], rarity: Rarity, exclude: string[]): string {
  const pool = itemsOf(content, kind, rarity);
  const fresh = pool.filter((d) => !exclude.includes(d.id));
  return pick(state.rng, fresh.length ? fresh : pool).id;
}

export function reforgeCost(content: Content, rarity: string): number {
  return tuning(content).reforge.cost[rarity as Rarity] ?? 0;
}

/** Chance that a reforge of this rarity upgrades (0 for legendary rerolls). */
export function reforgeChance(state: GameState, content: Content, rarity: string): number {
  const t = tuning(content).reforge;
  const p = t.upgradeChance[rarity as Rarity];
  if (p === undefined) return 0;
  return state.reforgePity >= t.pityAfter ? 1 : p;
}

/** Why these items can't be reforged, or null if they can. */
export function canReforge(state: GameState, content: Content, itemIds: number[]): string | null {
  if (itemIds.length !== 3 || new Set(itemIds).size !== 3) return 'choose three different items';
  const items = itemIds.map((id) => state.items.find((i) => i.id === id));
  if (items.some((i) => !i)) return 'items must be in storage';
  const defs = (items as Item[]).map((i) => content.items[i.defId]);
  if (defs.some((d) => !d)) return 'unknown item';
  const [first] = defs as ItemDef[];
  if (!first) return 'unknown item';
  if ((defs as ItemDef[]).some((d) => d.kind !== first.kind)) return 'items must all be weapons or all outfits';
  if ((defs as ItemDef[]).some((d) => d.rarity !== first.rarity)) return 'items must share a rarity';
  if (state.scrip < reforgeCost(content, first.rarity)) return 'not enough scrip';
  return null;
}

/**
 * Combine three stored items of the same kind and rarity for a chance at the
 * next rarity (guaranteed after a few failures). Returns an error or null.
 */
export function reforge(state: GameState, content: Content, itemIds: number[]): string | null {
  const err = canReforge(state, content, itemIds);
  if (err) return err;
  const inputs = itemIds.map((id) => state.items.find((i) => i.id === id)?.defId as string);
  const first = content.items[inputs[0] as string] as ItemDef;
  const rarity = first.rarity;
  const cost = reforgeCost(content, rarity);
  // Inputs leave storage first, so the result always has a slot.
  state.items = state.items.filter((i) => !itemIds.includes(i.id));
  addScrip(state, content, -cost);
  bump(state, 'reforges');
  bump(state, 'reforgeScripSpent', cost);

  const t = tuning(content).reforge;
  const next = NEXT_RARITY[rarity];
  let result: string;
  let upgraded = false;
  if (!next) {
    // Legendary in, a different legendary out.
    result = randomAvoiding(state, content, first.kind, rarity, inputs);
    bump(state, 'reforgeRerolls');
  } else {
    const guaranteed = state.reforgePity >= t.pityAfter;
    upgraded = guaranteed || chance(state.rng, t.upgradeChance[rarity] ?? 0);
    if (upgraded) {
      result = randomAvoiding(state, content, first.kind, next, []);
      state.reforgePity = 0;
      bump(state, 'reforgeUpgrades');
      bump(state, `reforgeUpgrades.${next}`);
      if (guaranteed) bump(state, 'reforgePityUpgrades');
    } else {
      result = randomAvoiding(state, content, first.kind, rarity, inputs);
      state.reforgePity++;
      bump(state, 'reforgeFailures');
    }
  }
  grantItem(state, content, result);
  state.events.push({ type: 'reforged', inputs, result, upgraded });
  return null;
}

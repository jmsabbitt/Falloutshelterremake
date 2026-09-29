// M9: rare-item paths (GDD §15.1): boss first-kill drops, treasure maps and
// caches, and region exclusives. See docs/design/M9-spec.md, stream C.
//
// - Boss first kills: loot.json `bossFirstKill` maps each quest boss to a
//   guaranteed item. The first time a boss goes down it goes into quest loot
//   (paid only on success). The kill is held in `loot.pendingKills` and only
//   committed to `loot.bossKills` once that quest succeeds, so a wipe doesn't
//   burn the guarantee. After that, a small `repeatChance`. The first Big Tin
//   kill also brings Rook to the door (recruitLegend, source 'boss').
// - Treasure maps: exploration.ts rolls for one on each item find. The map
//   travels home with the explorer (`loot.carried`) and is revealed on
//   collection. An explorer later sent to that region may dig the cache up;
//   its contents also travel home and are paid on collection.
// - Region exclusives: lootOnly items that only a region's item finds give.
//   Items marked `lootOnly` in items.json must be kept out of every random
//   pool (crates, crafting, reforging, quest and faction rewards).

import type { Content, SalvageMaterial } from '../content';
import { bump } from '../residents';
import { chance, nextFloat, nextInt } from '../rng';
import type { Expedition, GameState, LootState, Quest, Rarity, TreasureMap } from '../types';
import { legendsContent, recruitLegend } from './legends';

// ------------------------------------------------------------------ content

export interface CacheReward {
  items?: string[];
  scrip?: [number, number];
  salvage?: { rarity: Rarity; count: [number, number]; materials?: SalvageMaterial[] };
  /** A legendary resident who comes home with the explorer. */
  legend?: string;
}

export interface CacheDef {
  id: string;
  name: string;
  regionId: string;
  /** Journal line when it is dug up. */
  text: string;
  reward: CacheReward;
}

export interface LootContent {
  bossFirstKill: Record<string, string>;
  repeatChance: number;
  firstKillLog: string;
  repeatLog: string;
  maps: { base: number; perHour: number; max: number; digChance: number; digMinMinute: number; foundLog: string[] };
  caches: CacheDef[];
  regionExclusives: Record<string, { chance: number; items: string[] } | string>;
}

export function lootContent(content: Content): LootContent {
  return content.loot as unknown as LootContent;
}

export function cacheDef(content: Content, id: string): CacheDef | undefined {
  return lootContent(content).caches.find((c) => c.id === id);
}

/** True for items that only come from these paths (never from random pools). */
export function isLootOnly(content: Content, defId: string): boolean {
  return !!(content.items[defId] as { lootOnly?: boolean } | undefined)?.lootOnly;
}

/** The exclusives table for a region (null if it has none). */
export function regionExclusives(content: Content, regionId: string): { chance: number; items: string[] } | null {
  const e = lootContent(content).regionExclusives[regionId];
  return e && typeof e === 'object' ? e : null;
}

/** Which region an item is exclusive to, if any. */
export function exclusiveRegionOf(content: Content, defId: string): string | null {
  for (const [id, e] of Object.entries(lootContent(content).regionExclusives)) {
    if (typeof e === 'object' && e.items.includes(defId)) return id;
  }
  return null;
}

// ------------------------------------------------------------------ events

export type LootEvent =
  | { type: 'bossFirstKill'; questId: number; enemyId: string; defId: string }
  | { type: 'treasureMapFound'; mapId: number; cacheId: string; regionId: string }
  | { type: 'cacheDug'; cacheId: string; regionId: string; expeditionId: number };

function emit(state: GameState, ev: LootEvent): void {
  state.events.push(ev);
}

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

function loot(state: GameState): LootState {
  state.loot ??= { bossKills: [], maps: [] };
  state.loot.bossKills ??= [];
  state.loot.maps ??= [];
  return state.loot;
}

/**
 * Glarelands rolls (maps, digs, exclusives) come from a hash of the trip and
 * the moment of the event, not from state.rng: they depend only on the
 * expedition's own timers (so 1 s and 60 s steps agree) and they leave the
 * shared rng sequence of every existing trip untouched.
 */
export function tripRoll(e: Expedition, salt: number): number {
  let h = (Math.imul(e.id | 0, 0x9e3779b1) ^ Math.imul(Math.round(e.elapsed * 16) | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function tripPick<T>(e: Expedition, salt: number, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(tripRoll(e, salt) * items.length))] as T;
}

const SALT = { map: 1, mapCache: 2, mapLine: 3, dig: 4, exclusive: 5, exclusiveItem: 6 } as const;

// ------------------------------------------------------------------ boss first kills

function questLog(q: Quest, text: string): void {
  q.log.push(text);
  if (q.log.length > 40) q.log.shift();
}

/**
 * Called when a quest boss goes down (quests.ts damageEnemy). Adds its drop to
 * `quest.loot`, which is only paid if the quest succeeds.
 */
export function onBossDefeated(state: GameState, content: Content, quest: Quest, enemyId: string): void {
  const L = loot(state);
  reconcileBossKills(state);
  const table = lootContent(content);
  const itemId = table.bossFirstKill[enemyId];
  const first = !L.bossKills.includes(enemyId) && !(L.pendingKills ?? []).some((p) => p.enemyId === enemyId);
  const bossName = (content.quests as unknown as { enemies: Record<string, { name?: string }> }).enemies?.[enemyId]?.name ?? enemyId;
  if (first) {
    (L.pendingKills ??= []).push({ questId: quest.id, defId: quest.defId, enemyId });
    if (itemId && content.items[itemId]) {
      quest.loot.items.push(itemId);
      questLog(quest, fill(table.firstKillLog, { boss: bossName, item: content.items[itemId]!.name }));
    }
    // A legend who switches sides the first time their boss is beaten (Rook, after Big Tin).
    for (const l of legendsContent(content).legends) if (l.source.kind === 'boss' && l.source.enemy === enemyId) recruitLegend(state, content, l.id, 'boss');
    return;
  }
  if (itemId && content.items[itemId] && chance(state.rng, table.repeatChance)) {
    quest.loot.items.push(itemId);
    questLog(quest, fill(table.repeatLog, { boss: bossName, item: content.items[itemId]!.name }));
  }
}

/**
 * Settle pending boss kills: a quest that succeeded commits its kills to
 * `bossKills` (and counts `bossFirstKills`); one that failed, was abandoned
 * or vanished drops them, so the next kill pays the guarantee again.
 */
export function reconcileBossKills(state: GameState): void {
  const L = state.loot;
  if (!L?.pendingKills?.length) return;
  L.pendingKills = L.pendingKills.filter((p) => {
    const q = state.quests.find((x) => x.id === p.questId && x.defId === p.defId);
    if (!q) return false;
    if (q.outcome === null) return true;
    if (q.outcome === 'success' && !L.bossKills.includes(p.enemyId)) {
      L.bossKills.push(p.enemyId);
      bump(state, 'bossFirstKills');
      emit(state, { type: 'bossFirstKill', questId: q.id, enemyId: p.enemyId, defId: p.enemyId });
    }
    return false;
  });
}

// ------------------------------------------------------------------ maps and caches

function carried(state: GameState): NonNullable<LootState['carried']> {
  return (loot(state).carried ??= []);
}

/** Caches a new map could point at: known region, not mapped in this homestead, not on its way home. */
export function mappableCaches(state: GameState, content: Content, hasRegion: (id: string) => boolean): CacheDef[] {
  const L = loot(state);
  const taken = new Set([...L.maps.map((m) => m.cacheId), ...carried(state).map((c) => c.cacheId)]);
  return lootContent(content).caches.filter((c) => hasRegion(c.regionId) && !taken.has(c.id));
}

/** Chance of a map on an item find `hours` into a trip. */
export function mapChance(content: Content, hours: number): number {
  const m = lootContent(content).maps;
  return Math.min(m.max, m.base + m.perHour * hours);
}

/** Roll for a treasure map on an item find. Returns the journal line, or null. */
export function rollTreasureMap(state: GameState, content: Content, e: Expedition, hasRegion: (id: string) => boolean): string | null {
  const pool = mappableCaches(state, content, hasRegion);
  if (!pool.length) return null;
  if (tripRoll(e, SALT.map) >= mapChance(content, e.elapsed / 3600)) return null;
  const cache = tripPick(e, SALT.mapCache, pool);
  carried(state).push({ expeditionId: e.id, kind: 'map', cacheId: cache.id, regionId: cache.regionId });
  const lines = lootContent(content).maps.foundLog;
  return lines.length ? tripPick(e, SALT.mapLine, lines) : '';
}

/** An undug map for this region that nobody is already bringing home. */
export function diggableMap(state: GameState, regionId: string): TreasureMap | undefined {
  const L = loot(state);
  const busy = new Set(carried(state).filter((c) => c.kind === 'cache').map((c) => c.cacheId));
  return L.maps.find((m) => m.regionId === regionId && !m.found && !busy.has(m.cacheId));
}

/**
 * On an encounter: maybe dig up this region's mapped cache. Returns the
 * journal line, or null. The contents travel home with the explorer.
 */
export function rollCacheDig(state: GameState, content: Content, e: Expedition): string | null {
  const t = lootContent(content).maps;
  if (e.elapsed / 60 < t.digMinMinute) return null;
  const map = diggableMap(state, e.regionId);
  if (!map) return null;
  const cache = cacheDef(content, map.cacheId);
  if (!cache) return null;
  if (tripRoll(e, SALT.dig) >= t.digChance) return null;
  map.found = true;
  carried(state).push({ expeditionId: e.id, kind: 'cache', cacheId: cache.id, regionId: cache.regionId });
  return cache.text;
}

/**
 * collectExpedition: reveal the maps this explorer brought home and add the
 * contents of any cache they dug up to the expedition's loot (items, salvage,
 * scrip), before it is paid out. A cache's legend comes to the door.
 */
export function deliverCarried(state: GameState, content: Content, e: Expedition): void {
  const L = loot(state);
  const mine = (L.carried ?? []).filter((c) => c.expeditionId === e.id);
  if (!mine.length) return;
  L.carried = (L.carried ?? []).filter((c) => c.expeditionId !== e.id);
  for (const c of mine) {
    if (c.kind === 'map') {
      const map: TreasureMap = { id: state.nextId++, cacheId: c.cacheId, regionId: c.regionId, found: false };
      L.maps.push(map);
      bump(state, 'treasureMaps');
      emit(state, { type: 'treasureMapFound', mapId: map.id, cacheId: c.cacheId, regionId: c.regionId });
      continue;
    }
    const cache = cacheDef(content, c.cacheId);
    if (!cache) continue;
    const r = cache.reward;
    for (const id of r.items ?? []) if (content.items[id]) e.loot.items.push(id);
    if (r.scrip) e.loot.scrip += nextInt(state.rng, r.scrip[0], r.scrip[1]);
    if (r.salvage) {
      const s = r.salvage;
      const pool = content.salvageList.filter((x) => x.rarity === s.rarity && (!s.materials || s.materials.includes(x.material)));
      const n = nextInt(state.rng, s.count[0], s.count[1]);
      for (let i = 0; i < n && pool.length; i++) {
        const id = pool[Math.floor(nextFloat(state.rng) * pool.length)]!.id;
        e.loot.salvage[id] = (e.loot.salvage[id] ?? 0) + 1;
      }
    }
    if (r.legend) recruitLegend(state, content, r.legend, 'cache');
    bump(state, 'cachesDug');
    bump(state, `cachesDug.${cache.id}`);
    emit(state, { type: 'cacheDug', cacheId: cache.id, regionId: cache.regionId, expeditionId: e.id });
  }
}

/**
 * An expedition vanished without being collected (its resident was laid to
 * rest while away): its maps are lost, and any cache it dug up is back in the
 * ground for the next explorer.
 */
export function dropCarried(state: GameState, expeditionId: number): void {
  const L = state.loot;
  if (!L?.carried?.length) return;
  for (const c of L.carried) {
    if (c.expeditionId !== expeditionId || c.kind !== 'cache') continue;
    const map = L.maps.find((m) => m.cacheId === c.cacheId);
    if (map) map.found = false;
  }
  L.carried = L.carried.filter((c) => c.expeditionId !== expeditionId);
}

/** Every step (from tickExpeditions): settle boss kills and drop stale carried loot. */
export function tickLoot(state: GameState): void {
  reconcileBossKills(state);
  const L = state.loot;
  if (!L?.carried?.length) return;
  for (const c of [...L.carried]) if (!state.expeditions.some((e) => e.id === c.expeditionId)) dropCarried(state, c.expeditionId);
}

// ------------------------------------------------------------------ region exclusives

/** Roll for a region exclusive on an item find. Returns the item id, or null. */
export function rollRegionExclusive(state: GameState, content: Content, e: Expedition): string | null {
  const regionId = e.regionId;
  const ex = regionExclusives(content, regionId);
  if (!ex || !ex.items.length) return null;
  if (tripRoll(e, SALT.exclusive) >= ex.chance) return null;
  const pool = ex.items.filter((id) => content.items[id]);
  if (!pool.length) return null;
  bump(state, 'regionExclusives');
  bump(state, `regionExclusives.${regionId}`);
  return tripPick(e, SALT.exclusiveItem, pool);
}

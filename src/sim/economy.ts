// Derived numbers: storage capacities, build and upgrade costs, unlocks.

import { maxLevel, tableValue, type Content, type RoomDef, type StorageKind } from './content';
import { roomDef } from './grid';
import { costMult } from './legacy';
import { livingResidents } from './residents';
import type { GameState, ResourceKey, Room } from './types';

export function storageCapacity(state: GameState, content: Content, kind: StorageKind): number {
  const base = (content.balance.baseStorage as Record<string, number>)[kind] ?? 0;
  let total = base;
  for (const room of state.rooms) {
    const def = roomDef(content, room);
    if (def.storage?.resource === kind) total += tableValue(def.storage.amount, room.level, room.segments);
  }
  if (kind === 'population') total = Math.min(total, content.balance.maxPopulation);
  return total;
}

export function resourceCapacity(state: GameState, content: Content, key: ResourceKey): number {
  return storageCapacity(state, content, key);
}

/**
 * Residents inside the homestead, including fallen ones not yet revived or
 * laid to rest (their bodies still take a bed, as in the original).
 */
export function population(state: GameState): number {
  return state.residents.filter((r) => !r.waiting).length;
}

export function livingPopulation(state: GameState): number {
  return livingResidents(state).length;
}

/** Segments of this type already built (merged rooms count per segment). */
export function builtCount(state: GameState, type: string): number {
  return state.rooms.filter((r) => r.type === type).reduce((n, r) => n + r.segments, 0);
}

export function buildCost(state: GameState, content: Content, type: string): number {
  const def = content.rooms[type];
  if (!def) return Infinity;
  const already = type === 'elevator' ? Math.max(0, builtCount(state, type) - 3) : builtCount(state, type);
  return Math.round((def.cost.base + def.cost.perBuilt * already) * costMult(state, content));
}

/** Upgrade price; pass the state to apply Legacy discounts. */
export function upgradeCost(content: Content, room: Room, state?: GameState): number | null {
  const def = roomDef(content, room);
  if (!def.upgrade || room.level >= maxLevel(def)) return null;
  const single = def.upgrade[room.level - 1];
  if (single === undefined) return null;
  const mult = content.balance.upgradeWidthMultiplier[room.segments - 1] ?? 1;
  return Math.round(single * mult * costMult(state, content));
}

export function isUnlocked(state: GameState, def: RoomDef): boolean {
  return state.peakPopulation >= def.unlockPop;
}

/** Record newly unlocked room types; call after population changes. */
export function refreshUnlocks(state: GameState, content: Content): void {
  const pop = livingPopulation(state);
  if (pop > state.peakPopulation) state.peakPopulation = pop;
  if ((state.stats['peakPopulation'] ?? 0) < state.peakPopulation) state.stats['peakPopulation'] = state.peakPopulation;
  for (const def of content.roomList) {
    if (!def.buildable) continue;
    if (!state.unlockedRooms.includes(def.id) && isUnlocked(state, def)) {
      state.unlockedRooms.push(def.id);
      if (def.unlockPop > 0) state.events.push({ type: 'roomUnlocked', roomType: def.id });
    }
  }
}

export function addScrip(state: GameState, content: Content, amount: number): void {
  state.scrip = Math.max(0, Math.min(content.balance.maxScrip, state.scrip + amount));
}

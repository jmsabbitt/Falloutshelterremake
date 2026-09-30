// Weapons and outfits: storage, equipping and selling. Equipped items live on
// the resident; everything else sits in storage (limited by storerooms).

import type { Content, ItemDef } from '../content';
import { addScrip, storageCapacity } from '../economy';
import { bump, effectiveMaxHp, isAway } from '../residents';
import { pick } from '../rng';
import type { GameState, Rarity, Resident } from '../types';

export function itemDef(content: Content, defId: string): ItemDef | undefined {
  return content.items[defId];
}

export function itemCapacity(state: GameState, content: Content): number {
  return storageCapacity(state, content, 'items');
}

export function sellValue(content: Content, defId: string): number {
  const def = itemDef(content, defId);
  return def ? content.sellValue[def.rarity] : 0;
}

/**
 * Put an item into storage. When storage is full it is sold on the spot so
 * rewards are never silently lost. Returns the scrip received if sold (0 if stored).
 */
export function grantItem(state: GameState, content: Content, defId: string): number {
  const def = itemDef(content, defId);
  if (!def) return 0;
  if (def.rarity === 'legendary') bump(state, 'legendaryItems');
  bump(state, 'itemsFound');
  if (state.items.length >= itemCapacity(state, content)) {
    const value = content.sellValue[def.rarity];
    addScrip(state, content, value, { income: false });
    state.events.push({ type: 'storageFull', defId, sold: value });
    return value;
  }
  state.items.push({ id: state.nextId++, defId });
  return 0;
}

export function randomItemOf(state: GameState, content: Content, kind: 'weapon' | 'outfit', rarity: Rarity): string {
  const pool = Object.values(kind === 'weapon' ? content.weapons : content.outfits).filter((d) => d.rarity === rarity && !d.lootOnly);
  return pick(state.rng, pool).id;
}

/** Equip a stored item; whatever was in that slot goes back to storage. */
export function equip(state: GameState, content: Content, resident: Resident, itemId: number): string | null {
  const idx = state.items.findIndex((i) => i.id === itemId);
  const item = state.items[idx];
  if (!item) return 'no such item';
  const def = itemDef(content, item.defId);
  if (!def) return 'unknown item';
  state.items.splice(idx, 1);
  const slot = def.kind === 'weapon' ? 'weapon' : 'outfit';
  const previous = resident[slot];
  resident[slot] = def.id;
  if (previous) state.items.push({ id: state.nextId++, defId: previous });
  // Swapping outfits can change max HP only through future level-ups, but keep hp in range.
  resident.hp = Math.min(resident.hp, effectiveMaxHp(resident));
  bump(state, 'equips');
  return null;
}

/**
 * Take gear off everyone at home (or just `residentIds`) into storage, for a
 * respec. Residents away keep theirs; once storage is full the rest stay on.
 */
export function unequipAll(state: GameState, content: Content, slot: 'weapon' | 'outfit' | 'all', residentIds?: number[]): { removed: number; kept: number } {
  const only = residentIds ? new Set(residentIds) : null;
  const slots: ('weapon' | 'outfit')[] = slot === 'all' ? ['weapon', 'outfit'] : [slot];
  let removed = 0;
  let kept = 0;
  for (const r of state.residents) {
    if (r.dead || r.waiting || isAway(r)) continue;
    if (only && !only.has(r.id)) continue;
    for (const s of slots) {
      if (!r[s]) continue;
      if (unequip(state, content, r, s)) kept++;
      else removed++;
    }
  }
  if (removed) bump(state, 'unequips', removed);
  return { removed, kept };
}

export function unequip(state: GameState, content: Content, resident: Resident, slot: 'weapon' | 'outfit'): string | null {
  const current = resident[slot];
  if (!current) return 'nothing equipped';
  if (state.items.length >= itemCapacity(state, content)) return 'storage is full';
  resident[slot] = null;
  state.items.push({ id: state.nextId++, defId: current });
  return null;
}

export function sell(state: GameState, content: Content, itemId: number): number | null {
  const idx = state.items.findIndex((i) => i.id === itemId);
  const item = state.items[idx];
  if (!item) return null;
  const value = sellValue(content, item.defId);
  state.items.splice(idx, 1);
  addScrip(state, content, value, { income: false });
  bump(state, 'itemsSold');
  return value;
}

// Shared inventory helpers used by exploration, crafting and crates:
// the salvage bin, recipes and blueprint fragments.

import type { Content } from '../content';
import { bump } from '../residents';
import type { GameState } from '../types';

/** Per-type salvage cap. The bin is separate from item storage. */
export const SALVAGE_CAP = 999;

export function salvageCount(state: GameState, id: string): number {
  return state.salvage[id] ?? 0;
}

export function addSalvage(state: GameState, content: Content, id: string, n: number): number {
  if (!content.salvage[id] || n === 0) return 0;
  const before = salvageCount(state, id);
  const after = Math.max(0, Math.min(SALVAGE_CAP, before + n));
  state.salvage[id] = after;
  if (n > 0) bump(state, 'salvageFound', after - before);
  return after - before;
}

/** Remove salvage if every entry is available. Returns false (and changes nothing) otherwise. */
export function spendSalvage(state: GameState, cost: Record<string, number>): boolean {
  for (const [id, n] of Object.entries(cost)) if (salvageCount(state, id) < n) return false;
  for (const [id, n] of Object.entries(cost)) state.salvage[id] = salvageCount(state, id) - n;
  return true;
}

/** Common items never need a recipe. */
export function knowsRecipe(state: GameState, content: Content, defId: string): boolean {
  const def = content.items[defId];
  if (!def) return false;
  return def.rarity === 'common' || state.recipes.includes(defId);
}

export function fragmentsNeeded(content: Content, defId: string): number {
  const def = content.items[defId];
  if (!def || def.rarity === 'common') return 0;
  return (content.crafting.fragmentsNeeded as Record<string, number>)[def.rarity] ?? 5;
}

export function unlockRecipe(state: GameState, content: Content, defId: string, source: 'fragments' | 'found'): boolean {
  if (knowsRecipe(state, content, defId) || !content.items[defId]) return false;
  state.recipes.push(defId);
  delete state.fragments[defId];
  bump(state, 'recipesLearned');
  state.events.push({ type: 'recipeUnlocked', defId, source });
  return true;
}

/**
 * Add blueprint fragments toward an item's recipe. Collecting all of them
 * guarantees the recipe (the wishlist's "luck turned into progress").
 * Fragments for known recipes are ignored and return 0.
 */
export function addFragment(state: GameState, content: Content, defId: string, n = 1): number {
  if (knowsRecipe(state, content, defId)) return 0;
  const need = fragmentsNeeded(content, defId);
  if (need <= 0) return 0;
  const have = (state.fragments[defId] ?? 0) + n;
  bump(state, 'fragmentsFound', n);
  if (have >= need) {
    unlockRecipe(state, content, defId, 'fragments');
  } else {
    state.fragments[defId] = have;
    state.events.push({ type: 'fragmentFound', defId, have, need });
  }
  return n;
}

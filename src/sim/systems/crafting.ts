// Workshops, recipes, scrapping and reforging (GDD §15.1, research 02 §14).
//
// CONTRACT (M3). The signatures below are used by commands.ts, tick.ts and the
// client; keep them stable. Implementation is owned by the crafting work
// stream. See docs/design/M3-spec.md.

import type { Content } from '../content';
import type { GameState, Room } from '../types';

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

export function recipeFor(content: Content, defId: string): Recipe | undefined {
  void content;
  void defId;
  return undefined;
}

/** Every recipe a workshop room could make (known or not), for the UI list. */
export function workshopRecipes(content: Content, room: Room): Recipe[] {
  void content;
  void room;
  return [];
}

/** Why this room can't craft this item now, or null if it can. */
export function canCraft(state: GameState, content: Content, room: Room, defId: string): string | null {
  void state;
  void content;
  void room;
  void defId;
  return 'crafting is not implemented yet';
}

/** Seconds this room would take with its current crew. */
export function craftSeconds(state: GameState, content: Content, room: Room, defId: string): number {
  void state;
  void content;
  void room;
  void defId;
  return Infinity;
}

/** Real seconds left on this room's job at the current crew's speed (Infinity if stalled, 0 if done). */
export function craftTimeLeft(state: GameState, content: Content, room: Room): number {
  void state;
  void content;
  void room;
  return Infinity;
}

export function startCraft(state: GameState, content: Content, roomId: number, defId: string): string | null {
  void state;
  void content;
  void roomId;
  void defId;
  return 'crafting is not implemented yet';
}

/** Collect a finished job into storage. */
export function collectCraft(state: GameState, content: Content, roomId: number): string | null {
  void state;
  void content;
  void roomId;
  return 'crafting is not implemented yet';
}

/** Cancel a job in progress; refunds its salvage and scrip. */
export function cancelCraft(state: GameState, content: Content, roomId: number): string | null {
  void state;
  void content;
  void roomId;
  return 'crafting is not implemented yet';
}

/** Advance crafting jobs. Runs online and offline. */
export function tickCrafting(state: GameState, content: Content, dt: number): void {
  void state;
  void content;
  void dt;
}

/** What scrapping would return on average (for the UI). */
export function scrapPreview(content: Content, defId: string): Record<string, number> {
  void content;
  void defId;
  return {};
}

/** Break a stored item into salvage (and maybe a blueprint fragment). */
export function scrapItem(state: GameState, content: Content, itemId: number): string | null {
  void state;
  void content;
  void itemId;
  return 'crafting is not implemented yet';
}

export function reforgeCost(content: Content, rarity: string): number {
  void content;
  void rarity;
  return 0;
}

/**
 * Combine three stored items of the same kind and rarity for a chance at the
 * next rarity (guaranteed after a few failures). Returns an error or null.
 */
export function reforge(state: GameState, content: Content, itemIds: number[]): string | null {
  void state;
  void content;
  void itemIds;
  return 'crafting is not implemented yet';
}

// The Glarelands: sending residents out to explore (research 03 §4, GDD §8).
//
// CONTRACT (M3). The signatures below are used by commands.ts, tick.ts and the
// client; keep them stable. Implementation is owned by the exploration work
// stream. See docs/design/M3-spec.md.

import type { Content } from '../content';
import type { Expedition, GameState, Resident } from '../types';

export const MAX_SUPPLIES = 25;
export const MAX_EXPLORERS = 25;
export const CARRY_LIMIT = 100;

/** Why this resident can't leave right now, or null if they can. */
export function canExplore(state: GameState, content: Content, r: Resident): string | null {
  void state;
  void content;
  if (r.dead) return 'fallen residents cannot explore';
  if (r.waiting) return 'let them in first';
  if (r.expedition !== null) return 'already out exploring';
  return 'exploration is not implemented yet';
}

/** Send a resident out. Supplies come out of homestead stock. Returns an error or null. */
export function startExpedition(
  state: GameState,
  content: Content,
  residentId: number,
  regionId: string,
  supplies: { medpatch: number; purge: number },
): string | null {
  void state;
  void content;
  void residentId;
  void regionId;
  void supplies;
  return 'exploration is not implemented yet';
}

/** Start the trip home (takes half the time spent out). */
export function recallExpedition(state: GameState, content: Content, expeditionId: number): string | null {
  void state;
  void content;
  void expeditionId;
  return 'exploration is not implemented yet';
}

/** A returned explorer: move loot into the homestead and the resident back inside. */
export function collectExpedition(state: GameState, content: Content, expeditionId: number): string | null {
  void state;
  void content;
  void expeditionId;
  return 'exploration is not implemented yet';
}

/** Advance every expedition by dt seconds. Runs online and offline. */
export function tickExpeditions(state: GameState, content: Content, dt: number): void {
  void state;
  void content;
  void dt;
}

/** Called after a fallen explorer is revived: the expedition carries on. */
export function onResidentRevived(state: GameState, content: Content, residentId: number): void {
  void state;
  void content;
  void residentId;
}

/** Seconds until a returning explorer is home (0 when not returning). */
export function secondsUntilHome(e: Expedition): number {
  return e.status === 'returning' ? e.returnRemaining : 0;
}

/** Items carried toward the carry limit (weapons, outfits and salvage units). */
export function carriedCount(e: Expedition): number {
  return e.loot.items.length + Object.values(e.loot.salvage).reduce((a, b) => a + b, 0);
}

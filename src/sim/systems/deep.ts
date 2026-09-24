// The Deep: excavating strata below the base grid (GDD §6.3). Each stratum
// opens more floors, deep-only rooms, deep threats and story discoveries.
//
// CONTRACT (M6, stream B). Keep these signatures; see docs/design/M6-spec.md.

import type { Content } from '../content';
import type { GameState } from '../types';

export interface StratumDef {
  index: number;
  name: string;
  description: string;
  requiresResearch?: string;
}

export interface DeepContent {
  tuning: { floorsPerStratum: number; requiresResearch: string; digHours: number[]; digScrip: number[] };
  strata: StratumDef[];
  discoveries: Record<string, { id: string; title: string; text: string }>;
}

export function deepContent(content: Content): DeepContent {
  return content.deep as unknown as DeepContent;
}

/** Floors available in total: the base grid plus every excavated stratum. */
export function totalFloors(state: GameState, content: Content): number {
  return content.balance.grid.floors + state.deep.strata * deepContent(content).tuning.floorsPerStratum;
}

/** True for floors below the base grid. */
export function isDeepFloor(content: Content, floor: number): boolean {
  return floor >= content.balance.grid.floors;
}

/** Stratum a floor belongs to (0 for the base grid). */
export function stratumOf(content: Content, floor: number): number {
  if (!isDeepFloor(content, floor)) return 0;
  return 1 + Math.floor((floor - content.balance.grid.floors) / deepContent(content).tuning.floorsPerStratum);
}

/** Why the next stratum can't be dug now, or null. */
export function canExcavate(state: GameState, content: Content): string | null {
  void state;
  void content;
  return 'excavation is not built yet'; // stream B
}

export function startExcavation(state: GameState, content: Content): string | null {
  return canExcavate(state, content);
}

/** Digging runs online and offline; deep events run online. */
export function tickDeep(state: GameState, content: Content, dt: number, offline: boolean): void {
  void state;
  void content;
  void dt;
  void offline;
}

// Research: Labs turn Wits into research points, which buy nodes in the
// tech tree (GDD §6.2). Node effects feed bonus() in bonuses.ts; automation
// effects that need a tick (supply bots, auto-assign) run here.
//
// CONTRACT (M6, stream A). Keep these signatures; see docs/design/M6-spec.md.

import type { Content } from '../content';
import type { GameState } from '../types';

export interface ResearchNodeDef {
  id: string;
  branch: string;
  tier: number;
  name: string;
  description: string;
  /** Research points. */
  cost: number;
  /** Node ids needed first. */
  requires: string[];
  effects?: { effect: string; value: number }[];
  /** Room types and exploration regions this node unlocks. */
  unlocks?: { rooms?: string[]; regions?: string[] };
}

export interface ResearchContent {
  tuning: { pointsPerWitsHour: number; levelMult: number[] };
  branches: { id: string; name: string; description: string }[];
  nodes: ResearchNodeDef[];
}

export function researchContent(content: Content): ResearchContent {
  return content.research as unknown as ResearchContent;
}

export function researchNode(content: Content, id: string): ResearchNodeDef | undefined {
  return researchContent(content).nodes.find((n) => n.id === id);
}

export function hasResearch(state: GameState, id: string): boolean {
  return state.research.done.includes(id);
}

/** Research points per hour from every staffed Lab. */
export function researchRate(state: GameState, content: Content): number {
  void state;
  void content;
  return 0; // stream A
}

/** Why a node can't be researched now, or null. */
export function canResearch(state: GameState, content: Content, nodeId: string): string | null {
  void state;
  void content;
  void nodeId;
  return 'research is not built yet'; // stream A
}

/** Spend points on a node. */
export function doResearch(state: GameState, content: Content, nodeId: string): string | null {
  return canResearch(state, content, nodeId);
}

/** Labs produce points (online and offline); automation effects act (online only). */
export function tickResearch(state: GameState, content: Content, dt: number, offline: boolean): void {
  void state;
  void content;
  void dt;
  void offline;
}

/** What research survives founding a new homestead (called by prestige.ts). */
export function carryResearch(old: GameState, next: GameState, content: Content): void {
  void old;
  void next;
  void content;
}

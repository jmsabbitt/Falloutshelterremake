// Factions, reputation, trade and caravans (GDD §6.5).
//
// CONTRACT (M7, stream B). Keep these signatures; see docs/design/M7-spec.md.

import type { Content } from '../content';
import type { GameState } from '../types';

export interface FactionDef {
  id: string;
  name: string;
  description: string;
  startRep: number;
}

export interface FactionsContent {
  tuning: { tradeRefreshHours: number; repTiers: number[] };
  factions: FactionDef[];
}

export function factionsContent(content: Content): FactionsContent {
  return content.factions as unknown as FactionsContent;
}

export function factionDef(content: Content, id: string): FactionDef | undefined {
  return factionsContent(content).factions.find((f) => f.id === id);
}

/** Change a faction's reputation (clamped to -100..100) and fire repChanged. Marks the faction met. */
export function changeRep(state: GameState, content: Content, factionId: string, delta: number): void {
  const def = factionDef(content, factionId);
  if (!def) return;
  const f = (state.factions[factionId] ??= { rep: def.startRep, met: false });
  const before = f.rep;
  f.rep = Math.max(-100, Math.min(100, f.rep + delta));
  if (!f.met) {
    f.met = true;
    state.events.push({ type: 'factionMet', factionId });
  }
  if (f.rep !== before) state.events.push({ type: 'repChanged', factionId, rep: f.rep, delta: f.rep - before });
}

export function repOf(state: GameState, content: Content, factionId: string): number {
  return state.factions[factionId]?.rep ?? factionDef(content, factionId)?.startRep ?? 0;
}

/** Take a trade offer. */
export function trade(state: GameState, content: Content, offerId: number): string | null {
  void state;
  void content;
  void offerId;
  return 'trading is not built yet'; // stream B
}

/** Send residents with goods to a faction. */
export function sendCaravan(
  state: GameState,
  content: Content,
  factionId: string,
  residentIds: number[],
  goods: { salvage?: Record<string, number>; food?: number; water?: number; medpatch?: number },
): string | null {
  void state;
  void content;
  void factionId;
  void residentIds;
  void goods;
  return 'caravans are not built yet'; // stream B
}

export function recallCaravan(state: GameState, content: Content, caravanId: number): string | null {
  void state;
  void content;
  void caravanId;
  return 'caravans are not built yet';
}

export function collectCaravan(state: GameState, content: Content, caravanId: number): string | null {
  void state;
  void content;
  void caravanId;
  return 'caravans are not built yet';
}

/** Trade board refresh (online and offline) and caravan travel (online and offline). */
export function tickFactions(state: GameState, content: Content, dt: number): void {
  void state;
  void content;
  void dt;
}

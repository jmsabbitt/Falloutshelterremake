// M9: legendary residents: named characters with their own questlines. Stream L
// implements this; see docs/design/M9-spec.md.

import type { Content } from '../content';
import type { GameState } from '../types';

/** Runs every step, online and offline. Stub: nothing yet. */
export function tickLegends(_state: GameState, _content: Content, _dt: number, _offline: boolean): void {}

export type LegendSource = 'quest' | 'radio' | 'faction' | 'crate' | 'cache' | 'deep' | 'boss' | 'dev';

/**
 * A legendary resident arrives at the door (once per lifetime; see state.legends.recruited).
 * Returns why not, or null. Other systems call this; stream L implements it. Stub: refuses.
 */
export function recruitLegend(_state: GameState, _content: Content, _id: string, _source: LegendSource): string | null {
  return 'legends are not in yet';
}

// M9: rulesets (Famine, Endless Night, No Radio...) and Survival, chosen when
// founding a homestead, plus Custom Game presets. Stream R implements this;
// see docs/design/M9-spec.md.

import type { Content } from '../content';
import type { GameState, ResourceKey } from '../types';

export interface RulesetMods {
  /** Production multiplier for a resource (1 = unchanged). */
  production: (resource: ResourceKey | undefined) => number;
  /** Random-incident frequency multiplier. */
  incidentRate: number;
}

const NEUTRAL: RulesetMods = { production: () => 1, incidentRate: 1 };

/** The combined modifiers of the homestead's active rulesets. Stub: neutral. */
export function rulesetMods(_state: GameState, _content: Content): RulesetMods {
  return NEUTRAL;
}

/** True if an active ruleset sets this flag (e.g. 'noRadio'). Stub: false. */
export function ruleFlag(_state: GameState, _content: Content, _flag: string): boolean {
  return false;
}

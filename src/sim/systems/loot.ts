// M9: rare-item paths: boss first-kill drops, treasure maps and caches, region
// exclusives. Stream C implements this; see docs/design/M9-spec.md.

import type { Content } from '../content';
import type { GameState, Quest } from '../types';

/**
 * Called when a quest boss goes down (quests.ts damageEnemy). Add drops to `quest.loot`,
 * which is only paid if the quest succeeds. Stub: nothing yet.
 */
export function onBossDefeated(_state: GameState, _content: Content, _quest: Quest, _enemyId: string): void {}

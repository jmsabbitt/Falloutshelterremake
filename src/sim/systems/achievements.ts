// Achievements are data-driven: each watches a lifetime counter in state.stats.

import type { AchievementDef, Content } from '../content';
import type { GameState } from '../types';

export function achievementProgress(state: GameState, def: AchievementDef): number {
  return Math.min(1, (state.stats[def.stat] ?? 0) / def.target);
}

export function checkAchievements(state: GameState, content: Content): void {
  for (const def of content.achievements) {
    if (state.achievements[def.id] !== undefined) continue;
    if ((state.stats[def.stat] ?? 0) >= def.target) {
      state.achievements[def.id] = state.time;
      state.events.push({ type: 'achievementUnlocked', achievementId: def.id });
    }
  }
}

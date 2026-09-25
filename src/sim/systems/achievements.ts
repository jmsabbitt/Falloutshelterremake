// Achievements are data-driven: each watches a lifetime counter in state.stats.
//
// M9: the Warden's Seal (GDD §15.2) is earned when every other achievement is,
// hidden ones included. Achievements flagged `optional` in content don't count
// toward it. Earning it sets the monument flag state.stats['wardensSeal'] and
// the title in its content (see wardenTitle).

import type { AchievementDef, Content } from '../content';
import type { GameState } from '../types';

export const SEAL_ID = 'wardens_seal';

export function achievementProgress(state: GameState, def: AchievementDef): number {
  return Math.min(1, (state.stats[def.stat] ?? 0) / def.target);
}

function isOptional(def: AchievementDef): boolean {
  return (def as AchievementDef & { optional?: boolean }).optional === true;
}

/** The achievements the Warden's Seal needs: everything but itself and the optional ones. */
export function sealRequirements(content: Content): AchievementDef[] {
  return content.achievements.filter((d) => d.id !== SEAL_ID && !isOptional(d));
}

/** How close the Seal is: earned of needed, and what's still missing. */
export function sealProgress(state: GameState, content: Content): { have: number; of: number; missing: string[] } {
  const need = sealRequirements(content);
  const missing = need.filter((d) => state.achievements[d.id] === undefined).map((d) => d.id);
  return { have: need.length - missing.length, of: need.length, missing };
}

function sealEarnable(state: GameState, content: Content): boolean {
  for (const d of content.achievements) {
    if (d.id === SEAL_ID || isOptional(d)) continue;
    if (state.achievements[d.id] === undefined) return false;
  }
  return true;
}

/** The title the Warden's Seal grants, once earned; null before. */
export function wardenTitle(state: GameState, content: Content): string | null {
  if (state.achievements[SEAL_ID] === undefined) return null;
  const def = content.achievements.find((a) => a.id === SEAL_ID) as (AchievementDef & { title?: string }) | undefined;
  return def?.title ?? "Warden's Seal";
}

function unlock(state: GameState, id: string): void {
  state.achievements[id] = state.time;
  state.events.push({ type: 'achievementUnlocked', achievementId: id });
}

export function checkAchievements(state: GameState, content: Content): void {
  // Custom Game is a sandbox: nothing earned there counts.
  if (state.mode === 'custom') return;
  let seal: AchievementDef | undefined;
  for (const def of content.achievements) {
    if (def.id === SEAL_ID) {
      seal = def;
      continue;
    }
    if (state.achievements[def.id] !== undefined) continue;
    if ((state.stats[def.stat] ?? 0) >= def.target) unlock(state, def.id);
  }
  if (seal && state.achievements[SEAL_ID] === undefined && sealEarnable(state, content)) {
    state.stats['wardensSeal'] = 1; // the monument flag the client shows
    unlock(state, SEAL_ID);
  }
}

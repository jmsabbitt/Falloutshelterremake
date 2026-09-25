// M8: what will happen while the player is away, for phone notifications.
// A pure prediction from the current state: it never changes the state and
// never draws from state.rng. See docs/design/M8-spec.md.

import type { Content } from '../content';
import type { GameState } from '../types';

export type ReminderKind =
  | 'explorer'
  | 'caravan'
  | 'research'
  | 'craft'
  | 'storage'
  | 'birth'
  | 'grownUp'
  | 'contracts'
  | 'trade'
  | 'crate'
  | 'deep';

export interface Reminder {
  /** Stable for the same underlying event (e.g. `caravan.12`), so a re-schedule replaces rather than duplicates. */
  key: string;
  kind: ReminderKind;
  /** Seconds from state.lastRealTime until it happens, assuming the game is closed (offline rules). */
  inSeconds: number;
  title: string;
  body: string;
}

/** Upcoming events, soonest first. Stub until stream N lands. */
export function upcomingReminders(_state: GameState, _content: Content, _opts: { horizonSeconds?: number; max?: number } = {}): Reminder[] {
  return [];
}

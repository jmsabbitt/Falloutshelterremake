// Traits and job mastery (GDD §4.2). Traits make residents individuals;
// mastery rewards keeping people in their roles.
//
// CONTRACT (M6, stream C). These hooks are already called from production,
// needs, residents, incidents and tick; keep their signatures. See
// docs/design/M6-spec.md.

import type { Content } from '../content';
import type { GameState, Resident, Room } from '../types';

/** Traits for a new resident (called from createResident). */
export function rollTraits(state: GameState, content: Content): string[] {
  void state;
  void content;
  return [];
}

/** Traits for a newborn: some inherited from the parents (called from createChild). */
export function inheritTraits(state: GameState, content: Content, mother: Resident, father: Resident): string[] {
  void mother;
  void father;
  return rollTraits(state, content);
}

/** Multiplier on a worker's stat contribution to a room (traits and mastery). */
export function workerMult(state: GameState, content: Content, r: Resident, room: Room): number {
  void state;
  void content;
  void r;
  void room;
  return 1;
}

/** Change to a resident's happiness target from traits (can be negative). */
export function traitHappiness(state: GameState, content: Content, r: Resident): number {
  void state;
  void content;
  void r;
  return 0;
}

/** Multiplier on a resident's damage against incidents. */
export function traitCombatMult(content: Content, r: Resident): number {
  void content;
  void r;
  return 1;
}

/** Mastery tier (0 Apprentice, 1 Journeyman, 2 Master) for a room type. */
export function masteryTier(content: Content, r: Resident, roomType: string): number {
  void content;
  void r;
  void roomType;
  return 0;
}

/** Workers accrue mastery in their room type (online and offline). */
export function tickMastery(state: GameState, content: Content, dt: number): void {
  void state;
  void content;
  void dt;
}

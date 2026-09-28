// Training rooms (playtest 1, item 14): one room per stat. An adult in a
// training room builds up training time for that room's stat; once it reaches
// the requirement their base stat goes up by 1 (capped at 10) and the count
// starts again. Higher stats take longer:
//
//   requirement = secondsPerPoint × current base stat   (20 min for 1→2, 3 h for 9→10)
//   speed       = (1 + levelBonus × (level − 1)) × (1 + min(crowdBonusMax, crowdBonus × other trainees))
//
// Training runs online and offline (catch-up calls it through tick.step), needs
// power and stops during an incident in the room. It is not "work": no
// production, no job mastery, no XP, and auto-assign leaves training rooms alone.
// Progress is kept per resident (Resident.training) for the stat they last
// trained, so stepping out and coming back to the same stat loses nothing.

import type { Content, RoomDef } from '../content';
import { roomDef } from '../grid';
import { isAway, isChild, maxStat, raiseStat } from '../residents';
import type { GameState, Resident, Room, StatKey } from '../types';

export interface TrainingTuning {
  secondsPerPoint: number;
  levelBonus: number;
  crowdBonus: number;
  crowdBonusMax: number;
  maxStat: number;
  levelMilestone: number;
}

const DEFAULTS: TrainingTuning = { secondsPerPoint: 1200, levelBonus: 0.15, crowdBonus: 0.05, crowdBonusMax: 0.25, maxStat: 10, levelMilestone: 10 };

export function trainingTuning(content: Content): TrainingTuning {
  return { ...DEFAULTS, ...((content.balance as { training?: Partial<TrainingTuning> }).training ?? {}) };
}

export function isTrainingDef(def: RoomDef | undefined): boolean {
  return def?.category === 'training' && !!def.stat;
}

export function isTrainingRoom(content: Content, room: Room): boolean {
  return isTrainingDef(content.rooms[room.type]);
}

/** Training seconds needed to go from `value` to `value + 1` (at speed 1). */
export function trainingRequirement(content: Content, value: number): number {
  return trainingTuning(content).secondsPerPoint * Math.max(1, value);
}

/** Adults in the room who can train: children, the waiting and the away never do. */
export function trainees(state: GameState, room: Room): Resident[] {
  return state.residents.filter((r) => r.roomId === room.id && !r.dead && !r.waiting && !isAway(r) && !isChild(state, r));
}

/** Training speed multiplier for everyone in this room (level and company). */
export function trainingSpeed(state: GameState, content: Content, room: Room, crew = trainees(state, room).length): number {
  const t = trainingTuning(content);
  const level = 1 + t.levelBonus * (room.level - 1);
  const crowd = 1 + Math.min(t.crowdBonusMax, t.crowdBonus * Math.max(0, crew - 1));
  return level * crowd;
}

/** Why training is paused in this room right now (null: it runs). */
export function trainingPaused(state: GameState, room: Room): 'power' | 'incident' | null {
  if (!room.powered) return 'power';
  if (state.incidents.some((i) => i.roomId === room.id)) return 'incident';
  return null;
}

export interface TrainingStatus {
  room: Room;
  stat: StatKey;
  /** Current base stat. */
  value: number;
  progress: number;
  need: number;
  /** 0..1 */
  fraction: number;
  /** At the current speed; Infinity while paused, 0 when maxed. */
  secondsLeft: number;
  maxed: boolean;
  paused: 'power' | 'incident' | null;
}

/** A resident's training in their current room, or null if they are not in a training room. */
export function trainingStatus(state: GameState, content: Content, r: Resident): TrainingStatus | null {
  if (r.roomId === null || r.dead) return null;
  const room = state.rooms.find((x) => x.id === r.roomId);
  if (!room) return null;
  const def = roomDef(content, room);
  if (!isTrainingDef(def) || !def.stat) return null;
  const stat = def.stat;
  const value = r.stats[stat];
  const maxed = value >= maxStat(content);
  const need = trainingRequirement(content, value);
  const progress = r.training?.stat === stat ? Math.min(need, r.training.progress) : 0;
  const paused = trainingPaused(state, room);
  const speed = trainingSpeed(state, content, room);
  const secondsLeft = maxed ? 0 : paused || isChild(state, r) ? Infinity : Math.max(0, (need - progress) / speed);
  return { room, stat, value, progress, need, fraction: maxed ? 1 : need > 0 ? progress / need : 0, secondsLeft, maxed, paused };
}

/** Advance every trainee by `dt` seconds (online and offline). */
export function tickTraining(state: GameState, content: Content, dt: number): void {
  if (dt <= 0) return;
  const cap = maxStat(content);
  for (const room of state.rooms) {
    const def = content.rooms[room.type];
    if (!isTrainingDef(def) || !def?.stat) continue;
    if (trainingPaused(state, room)) continue;
    const crew = trainees(state, room);
    if (!crew.length) continue;
    const stat = def.stat;
    const gain = dt * trainingSpeed(state, content, room, crew.length);
    for (const r of crew) {
      if (r.stats[stat] >= cap) continue;
      if (r.training?.stat !== stat) r.training = { stat, progress: 0 };
      r.training.progress += gain;
      // A long offline step can be worth more than one point.
      let need = trainingRequirement(content, r.stats[stat]);
      while (r.training.progress >= need && r.stats[stat] < cap) {
        r.training.progress -= need;
        raiseStat(state, content, r, stat, 'training');
        need = trainingRequirement(content, r.stats[stat]);
      }
      if (r.stats[stat] >= cap) r.training.progress = 0;
    }
  }
}

// New residents arriving at the door: early wanderers, and the Radio Room.

import { tableValue, type Content } from '../content';
import { population } from '../economy';
import { roomDef } from '../grid';
import { bump, createResident, effectiveStat, workersInRoom } from '../residents';
import { chance, nextInt } from '../rng';
import type { GameState, Room } from '../types';
import { ruleFlag, rulesetMods } from './rulesets';

function waitingCount(state: GameState): number {
  return state.residents.filter((r) => r.waiting).length;
}

function arrive(state: GameState, content: Content, source: 'radio' | 'wanderer'): void {
  const res = createResident(state, content);
  state.residents.push(res);
  bump(state, `arrivals.${source}`);
  state.events.push({ type: 'residentArrived', residentId: res.id, source });
}

export function scheduleWanderer(state: GameState, content: Content): void {
  const a = content.balance.arrivals;
  state.nextWandererAt = state.time + nextInt(state.rng, a.wandererMinSeconds, a.wandererMaxSeconds);
}

/** Seconds per radio signal roll for a room with its current crew. */
export function radioInterval(state: GameState, content: Content, room: Room): number {
  const a = content.balance.arrivals;
  const charm = workersInRoom(state, room.id).reduce((s, r) => s + effectiveStat(content, r, 'charm'), 0);
  const maxCharm = a.radioCharmForMax * room.segments;
  const reduction = a.radioMaxReduction * Math.min(1, charm / maxCharm);
  return a.radioBaseSeconds * (1 - reduction);
}

export function radioChance(content: Content, room: Room): number {
  return tableValue(content.balance.arrivals.radioChance, room.level, room.segments);
}

/**
 * Rulesets can shut the door on newcomers: No Radio stops every radio and
 * wanderer arrival, Skeleton Crew stops them once the cap is reached (counting
 * those already waiting outside).
 */
export function arrivalsBlocked(state: GameState, content: Content): boolean {
  if (ruleFlag(state, content, 'noRadio')) return true;
  const cap = rulesetMods(state, content).populationCap;
  return cap !== Infinity && population(state) + waitingCount(state) >= cap;
}

export function tickArrivals(state: GameState, content: Content, dt: number): void {
  const a = content.balance.arrivals;
  const blocked = arrivalsBlocked(state, content);
  // Wanderers keep a young homestead growing until it can recruit for itself.
  if (state.time >= state.nextWandererAt) {
    if (!blocked && population(state) + waitingCount(state) < a.wandererUntilPopulation && waitingCount(state) < a.maxWaiting) {
      arrive(state, content, 'wanderer');
    }
    scheduleWanderer(state, content);
  }

  for (const room of state.rooms) {
    if (roomDef(content, room).category !== 'radio' || !room.powered) continue;
    if (workersInRoom(state, room.id).length === 0) continue;
    room.timer += dt;
    const interval = radioInterval(state, content, room);
    if (room.timer >= interval) {
      room.timer -= interval; // keep the overshoot so long offline steps don't lose time
      if (!blocked && waitingCount(state) < a.maxWaiting && chance(state.rng, radioChance(content, room))) arrive(state, content, 'radio');
    }
  }
}

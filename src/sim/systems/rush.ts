// Rushing (research 01 §6):
//   fail% = max(10, 40 − 1.5 × (avg room stat + avg Fortune)) + 10 × recent rushes (≤ 6)

import type { Content } from '../content';
import { roomDef } from '../grid';
import { bump, effectiveStat, workersInRoom } from '../residents';
import { chance } from '../rng';
import type { GameState, Room } from '../types';
import { startRushIncident } from './incidents';

export function rushFailChance(state: GameState, content: Content, room: Room): number {
  const def = roomDef(content, room);
  const crew = workersInRoom(state, room.id);
  if (!def.stat || crew.length === 0) return 1;
  const stat = def.stat;
  const rb = content.balance.rush;
  const avgStat = crew.reduce((s, r) => s + effectiveStat(content, r, stat), 0) / crew.length;
  const avgFortune = crew.reduce((s, r) => s + effectiveStat(content, r, 'fortune'), 0) / crew.length;
  const base = Math.max(rb.minFail, rb.baseFail - rb.statFactor * (avgStat + avgFortune));
  const recent = Math.min(rb.maxRecent, Math.floor(state.rushStrain));
  return Math.min(100, base + rb.perRecentRush * recent) / 100;
}

export type RushResult = 'success' | 'failure';

export function performRush(state: GameState, content: Content, room: Room): RushResult {
  const rb = content.balance.rush;
  const failed = chance(state.rng, rushFailChance(state, content, room));
  state.rushStrain = Math.min(rb.maxRecent, state.rushStrain + 1);
  room.pool = 0; // both outcomes reset the production timer
  const crew = workersInRoom(state, room.id);
  if (failed) {
    const inc = startRushIncident(state, content, room);
    for (const r of crew) r.happiness = Math.max(0, r.happiness + rb.failHappiness);
    bump(state, 'rushFailures');
    state.events.push({ type: 'rushFailed', roomId: room.id, incidentId: inc.id });
    return 'failure';
  }
  room.ready = true;
  for (const r of crew) r.happiness = Math.min(100, r.happiness + rb.successHappiness);
  bump(state, 'rushSuccesses');
  state.events.push({ type: 'rushSucceeded', roomId: room.id });
  return 'success';
}

export function tickRushStrain(state: GameState, content: Content, dt: number): void {
  state.rushStrain = Math.max(0, state.rushStrain - (content.balance.rush.strainDecayPerMin * dt) / 60);
}

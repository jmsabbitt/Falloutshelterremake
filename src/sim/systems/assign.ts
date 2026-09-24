// "Auto-assign best fit" (GDD §6.6): put idle adults into the free job slots
// that suit them best. Used by the autoAssign command and, once researched,
// by the Personnel Office automation.

import type { Content } from '../content';
import { roomDef } from '../grid';
import { effectiveStat, isAway, isChild, residentsInRoom } from '../residents';
import type { GameState, Resident, Room } from '../types';

/** Adults inside with no job, who can be given one. */
export function idleAdults(state: GameState): Resident[] {
  return state.residents.filter((r) => !r.dead && !r.waiting && !isAway(r) && !isChild(state, r) && r.roomId === null);
}

function freeSlots(state: GameState, content: Content, room: Room): number {
  const def = roomDef(content, room);
  return def.capacityPerSegment * room.segments - residentsInRoom(state, room.id).length;
}

/** Rooms whose job uses a stat (production, radio, research); workshops and the door are left to the player. */
function jobRooms(state: GameState, content: Content): Room[] {
  return state.rooms.filter((r) => roomDef(content, r).stat !== null && freeSlots(state, content, r) > 0);
}

/**
 * Greedily pair the idle resident and free slot with the highest matching
 * stat, until either runs out. Returns how many were assigned.
 */
export function autoAssign(state: GameState, content: Content): number {
  const idle = idleAdults(state);
  let count = 0;
  while (idle.length) {
    const rooms = jobRooms(state, content);
    if (!rooms.length) break;
    let best: { r: Resident; room: Room; score: number } | null = null;
    for (const r of idle) {
      for (const room of rooms) {
        const stat = roomDef(content, room).stat;
        if (!stat) continue;
        const score = effectiveStat(content, r, stat);
        if (!best || score > best.score || (score === best.score && room.id < best.room.id)) best = { r, room, score };
      }
    }
    if (!best) break;
    best.r.roomId = best.room.id;
    best.r.courtship = null;
    idle.splice(idle.indexOf(best.r), 1);
    count++;
  }
  if (count) state.events.push({ type: 'autoAssigned', count });
  return count;
}

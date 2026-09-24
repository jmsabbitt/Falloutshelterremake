// "Auto-assign best fit" (GDD §6.6): put idle adults into the free job slots
// that suit them best. Used by the autoAssign command and, once researched,
// by the Personnel Office automation.

import type { Content } from '../content';
import { roomDef } from '../grid';
import { roomCapacity } from '../commands';
import { effectiveStat, isAway, isChild, residentsInRoom } from '../residents';
import type { GameState, Resident, Room } from '../types';

/** Remember a resident's job as they leave the homestead for a trip. */
export function leaveJob(r: Resident): void {
  r.homeRoomId = r.roomId;
  r.roomId = null;
}

/** Back from a trip: return to the old job if it still exists and has room. */
export function returnToJob(state: GameState, content: Content, r: Resident): void {
  const home = r.homeRoomId;
  r.homeRoomId = null;
  r.roomId = null;
  if (home === null || home === undefined || r.dead || isChild(state, r)) return;
  const room = state.rooms.find((x) => x.id === home);
  if (room && residentsInRoom(state, room.id).length < roomCapacity(content, room)) r.roomId = room.id;
}

/** Adults inside with no job, who can be given one. */
export function idleAdults(state: GameState): Resident[] {
  return state.residents.filter((r) => !r.dead && !r.waiting && !isAway(r) && !isChild(state, r) && r.roomId === null);
}

/**
 * Jobs auto-assign may fill, with their free slots: production, radio and
 * research. Quarters (courtship), storerooms, workshops and the door are
 * left to the player.
 */
function jobSlots(state: GameState, content: Content): Map<Room, number> {
  const slots = new Map<Room, number>();
  for (const room of state.rooms) {
    const def = roomDef(content, room);
    if (!def.stat || !(def.category === 'production' || def.category === 'radio' || def.category === 'research')) continue;
    const free = roomCapacity(content, room) - residentsInRoom(state, room.id).length;
    if (free > 0) slots.set(room, free);
  }
  return slots;
}

/**
 * Greedily pair the idle resident and free slot with the highest matching
 * stat, until either runs out. Returns how many were assigned.
 */
export function autoAssign(state: GameState, content: Content): number {
  const idle = idleAdults(state);
  const slots = jobSlots(state, content);
  let count = 0;
  while (idle.length && slots.size) {
    let best: { r: Resident; room: Room; score: number } | null = null;
    for (const r of idle) {
      for (const room of slots.keys()) {
        const stat = roomDef(content, room).stat;
        if (!stat) continue;
        const score = effectiveStat(content, r, stat);
        if (!best || score > best.score || (score === best.score && room.id < best.room.id)) best = { r, room, score };
      }
    }
    if (!best) break;
    best.r.roomId = best.room.id;
    const left = (slots.get(best.room) as number) - 1;
    if (left > 0) slots.set(best.room, left);
    else slots.delete(best.room);
    best.r.courtship = null;
    idle.splice(idle.indexOf(best.r), 1);
    count++;
  }
  if (count) state.events.push({ type: 'autoAssigned', count });
  return count;
}

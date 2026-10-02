// "Auto-assign best fit" (GDD §6.6): every room that takes a crew is in the
// order somewhere, at every level:
//   1. jobs (production, radio, research) by the stat each room works with;
//   2. workshops, by the stat of the job on the bench (or their recipes');
//   3. the door, best armed first;
//   4. couples into Quarters, while there's a bed for each baby on the way;
//   5. training rooms, each resident to their best stat not yet maxed;
//   6. storerooms, by the stat they use;
//   7. anyone still idle into Quarters, by Charm (without starting a family
//      the homestead has no bed for).
// Used by the autoAssign command and, once researched, by the Personnel
// Office automation.

import type { Content } from '../content';
import { roomDef } from '../grid';
import { roomCapacity } from '../commands';
import { population, storageCapacity } from '../economy';
import { closelyRelated, effectiveStat, isAway, isChild, maxStat, residentsInRoom } from '../residents';
import type { GameState, Resident, Room, StatKey } from '../types';
import { workshopRecipes } from './crafting';
import { avgDamage } from './gearFit';

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
 * Jobs auto-assign fills first, with their free slots: production, radio
 * and research. Storerooms and the door are left to the player.
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

/** The stats a workshop's crew would work with right now. */
function workshopStats(content: Content, room: Room): StatKey[] {
  const onBench = room.job && room.job.remaining > 0 ? content.items[room.job.defId]?.craftStat : undefined;
  if (onBench) return [onBench as StatKey];
  return [...new Set(workshopRecipes(content, room).map((x) => content.items[x.defId]?.craftStat as StatKey | undefined).filter((k): k is StatKey => !!k))];
}

/** Free slots in rooms of one category (any stat), in room order. */
function freeSlots(state: GameState, content: Content, category: string): Map<Room, number> {
  const slots = new Map<Room, number>();
  for (const room of state.rooms) {
    if (roomDef(content, room).category !== category) continue;
    const free = roomCapacity(content, room) - residentsInRoom(state, room.id).length;
    if (free > 0) slots.set(room, free);
  }
  return slots;
}

/**
 * Greedily pair the idle resident and free slot with the highest score, until
 * either runs out. Returns who went where.
 */
function fill(idle: Resident[], slots: Map<Room, number>, score: (r: Resident, room: Room) => number | null): number {
  let count = 0;
  while (idle.length && slots.size) {
    let best: { r: Resident; room: Room; score: number } | null = null;
    for (const r of idle) {
      for (const room of slots.keys()) {
        const sc = score(r, room);
        if (sc === null) continue;
        if (!best || sc > best.score || (sc === best.score && room.id < best.room.id)) best = { r, room, score: sc };
      }
    }
    if (!best) break;
    place(best.r, best.room, slots, idle);
    count++;
  }
  return count;
}

function place(r: Resident, room: Room, slots: Map<Room, number>, idle: Resident[]): void {
  r.roomId = room.id;
  r.courtship = null;
  const left = (slots.get(room) as number) - 1;
  if (left > 0) slots.set(room, left);
  else slots.delete(room);
  idle.splice(idle.indexOf(r), 1);
}

/** Beds free once every baby on the way (or courtship under way) has one. */
function freeBeds(state: GameState, content: Content): number {
  const expecting = state.residents.filter((r) => !r.dead && (r.pregnancy || r.courtship)).length;
  return storageCapacity(state, content, 'population') - population(state) - expecting;
}

/**
 * Couples for Quarters: an idle woman who isn't expecting and an idle man
 * who isn't close family, into Quarters with two free beds, while the
 * homestead has a bed for each baby on the way.
 */
function fillQuarters(state: GameState, content: Content, idle: Resident[]): number {
  const slots = freeSlots(state, content, 'living');
  let beds = freeBeds(state, content);
  let count = 0;
  for (const woman of idle.filter((r) => r.sex === 'f' && r.pregnancy === null)) {
    if (beds <= 0) break;
    const man = idle.find((m) => m.sex === 'm' && !closelyRelated(state, woman, m));
    const room = [...slots].find(([, free]) => free >= 2)?.[0];
    if (!man || !room) continue;
    place(woman, room, slots, idle);
    place(man, room, slots, idle);
    beds--;
    count += 2;
  }
  return count;
}

export function autoAssign(state: GameState, content: Content): number {
  const idle = idleAdults(state);
  // Jobs first: the stat the room works with.
  let count = fill(idle, jobSlots(state, content), (r, room) => {
    const stat = roomDef(content, room).stat;
    return stat ? effectiveStat(content, r, stat) : null;
  });
  // Then the workshops: the stat the job on the bench needs, or with the
  // bench empty, the best of the stats its recipes use.
  count += fill(idle, freeSlots(state, content, 'workshop'), (r, room) => {
    const stats = workshopStats(content, room);
    return stats.length ? Math.max(...stats.map((k) => effectiveStat(content, r, k))) : null;
  });
  // The door: whoever hits hardest stands guard.
  count += fill(idle, freeSlots(state, content, 'door'), (r) => avgDamage(r.weapon ? content.items[r.weapon] : undefined) * 100 + r.level);
  count += fillQuarters(state, content, idle);
  // Training: each resident works on the stat nearest the top they can still
  // raise, so they grow into the jobs they're best at.
  const cap = maxStat(content);
  count += fill(idle, freeSlots(state, content, 'training'), (r, room) => {
    const stat = roomDef(content, room).stat;
    return stat && r.stats[stat] < cap ? r.stats[stat] : null;
  });
  // Storerooms, by the stat they use.
  count += fill(idle, freeSlots(state, content, 'storage'), (r, room) => {
    const stat = roomDef(content, room).stat;
    return stat ? effectiveStat(content, r, stat) : 0;
  });
  // Anyone left goes home to Quarters. With no bed for a baby, nobody joins
  // a room where they'd start a courtship.
  count += fill(idle, freeSlots(state, content, 'living'), (r, room) => {
    if (freeBeds(state, content) <= 0 && residentsInRoom(state, room.id).some((x) => x.sex !== r.sex && !isChild(state, x) && !closelyRelated(state, r, x))) return null;
    return effectiveStat(content, r, 'charm');
  });
  if (count) state.events.push({ type: 'autoAssigned', count });
  return count;
}

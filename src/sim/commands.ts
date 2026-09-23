// Every player action is a Command. The client (and later the Custom Game
// console, replays and tests) only changes the game through applyCommand.

import type { Content } from './content';
import { addScrip, buildCost, population, refreshUnlocks, storageCapacity, upgradeCost } from './economy';
import { canPlace, connectedRoomIds, mergeFloor, roomDef } from './grid';
import { bump, effectiveMaxHp, residentsInRoom, reviveCost } from './residents';
import { checkAchievements } from './systems/achievements';
import { collectRoom } from './systems/production';
import { performRush } from './systems/rush';
import type { GameState, Room } from './types';

export type Command =
  | { type: 'build'; roomType: string; floor: number; x: number }
  | { type: 'upgrade'; roomId: number }
  | { type: 'demolish'; roomId: number }
  | { type: 'assign'; residentId: number; roomId: number | null }
  | { type: 'admit'; residentId: number }
  | { type: 'admitAll' }
  | { type: 'collect'; roomId: number }
  | { type: 'collectAll' }
  | { type: 'rush'; roomId: number }
  | { type: 'revive'; residentId: number };

export type CommandResult = { ok: true; detail?: string } | { ok: false; reason: string };

const fail = (reason: string): CommandResult => ({ ok: false, reason });

function findRoom(state: GameState, id: number): Room | undefined {
  return state.rooms.find((r) => r.id === id);
}

export function roomCapacity(content: Content, room: Room): number {
  return roomDef(content, room).capacityPerSegment * room.segments;
}

export function applyCommand(state: GameState, content: Content, cmd: Command): CommandResult {
  const result = dispatch(state, content, cmd);
  if (result.ok) {
    refreshUnlocks(state, content);
    checkAchievements(state, content);
  }
  return result;
}

function dispatch(state: GameState, content: Content, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'build': {
      const def = content.rooms[cmd.roomType];
      if (!def || !def.buildable) return fail('cannot build that');
      if (!state.unlockedRooms.includes(def.id)) return fail(`unlocks at population ${def.unlockPop}`);
      const place = canPlace(state, content, def.id, cmd.floor, cmd.x);
      if (!place.ok) return place;
      const cost = buildCost(state, content, def.id);
      if (state.scrip < cost) return fail('not enough scrip');
      addScrip(state, content, -cost);
      const room: Room = {
        id: state.nextId++,
        type: def.id,
        floor: cmd.floor,
        x: cmd.x,
        segments: 1,
        level: 1,
        pool: 0,
        ready: false,
        powered: true,
      };
      state.rooms.push(room);
      bump(state, 'roomsBuilt');
      state.events.push({ type: 'roomBuilt', roomId: room.id, roomType: def.id });
      afterLayoutChange(state, content, cmd.floor);
      return { ok: true };
    }

    case 'upgrade': {
      const room = findRoom(state, cmd.roomId);
      if (!room) return fail('no such room');
      const cost = upgradeCost(content, room);
      if (cost === null) return fail('already at max level');
      if (state.incidents.some((i) => i.roomId === room.id)) return fail('deal with the incident first');
      if (state.scrip < cost) return fail('not enough scrip');
      addScrip(state, content, -cost);
      room.level++;
      bump(state, 'upgrades');
      state.events.push({ type: 'roomUpgraded', roomId: room.id, level: room.level });
      afterLayoutChange(state, content, room.floor);
      return { ok: true };
    }

    case 'demolish': {
      const room = findRoom(state, cmd.roomId);
      if (!room) return fail('no such room');
      if (room.type === 'door') return fail('the door stays');
      if (state.incidents.some((i) => i.roomId === room.id)) return fail('deal with the incident first');
      const without: GameState = { ...state, rooms: state.rooms.filter((r) => r.id !== room.id) };
      if (connectedRoomIds(without, content).size !== without.rooms.length) {
        return fail('would cut off other rooms');
      }
      if (storageCapacity(without, content, 'population') < population(state)) {
        return fail('residents would have nowhere to live');
      }
      for (const r of state.residents) if (r.roomId === room.id) r.roomId = null;
      state.rooms = without.rooms;
      return { ok: true };
    }

    case 'assign': {
      const res = state.residents.find((r) => r.id === cmd.residentId);
      if (!res || res.dead) return fail('no such resident');
      if (res.waiting) return fail('let them in first');
      if (cmd.roomId === null) {
        res.roomId = null;
        return { ok: true };
      }
      const room = findRoom(state, cmd.roomId);
      if (!room) return fail('no such room');
      if (res.roomId === room.id) return { ok: true };
      const cap = roomCapacity(content, room);
      if (cap === 0) return fail('nobody can work there');
      const crew = residentsInRoom(state, room.id);
      let detail: string | undefined;
      if (crew.length >= cap) {
        // Full room: swap out whoever is worst at this job (like the original).
        const stat = roomDef(content, room).stat;
        const worst = [...crew].sort((a, b) => (stat ? a.stats[stat] - b.stats[stat] : 0) || a.id - b.id)[0];
        if (!worst) return fail('room is full');
        worst.roomId = res.roomId;
        detail = `swapped with ${worst.firstName}`;
      }
      res.roomId = room.id;
      return { ok: true, detail };
    }

    case 'admit': {
      const res = state.residents.find((r) => r.id === cmd.residentId);
      if (!res || !res.waiting) return fail('nobody to admit');
      if (population(state) >= storageCapacity(state, content, 'population')) return fail('no room: build more quarters');
      res.waiting = false;
      state.events.push({ type: 'residentAdmitted', residentId: res.id });
      return { ok: true };
    }

    case 'admitAll': {
      let n = 0;
      for (const res of state.residents.filter((r) => r.waiting)) {
        if (population(state) >= storageCapacity(state, content, 'population')) break;
        res.waiting = false;
        state.events.push({ type: 'residentAdmitted', residentId: res.id });
        n++;
      }
      return n > 0 ? { ok: true, detail: `${n} admitted` } : fail('no room: build more quarters');
    }

    case 'collect': {
      const room = findRoom(state, cmd.roomId);
      if (!room) return fail('no such room');
      if (!room.ready) return fail('nothing to collect');
      collectRoom(state, content, room);
      return { ok: true };
    }

    case 'collectAll': {
      let n = 0;
      for (const room of state.rooms) {
        if (!room.ready) continue;
        collectRoom(state, content, room);
        n++;
      }
      return { ok: true, detail: `${n} collected` };
    }

    case 'rush': {
      const room = findRoom(state, cmd.roomId);
      if (!room) return fail('no such room');
      const def = roomDef(content, room);
      if (!def.produces) return fail('only production rooms can be rushed');
      if (room.ready) return fail('collect first');
      if (!room.powered) return fail('no power');
      if (state.incidents.some((i) => i.roomId === room.id)) return fail('incident in progress');
      if (residentsInRoom(state, room.id).length === 0) return fail('nobody is working there');
      return { ok: true, detail: performRush(state, content, room) };
    }

    case 'revive': {
      const res = state.residents.find((r) => r.id === cmd.residentId);
      if (!res || !res.dead) return fail('nobody to revive');
      const cost = reviveCost(content, res);
      if (state.scrip < cost) return fail('not enough scrip');
      addScrip(state, content, -cost);
      res.dead = false;
      res.hp = effectiveMaxHp(res);
      bump(state, 'revives');
      state.events.push({ type: 'residentRevived', residentId: res.id });
      return { ok: true };
    }
  }
}

function afterLayoutChange(state: GameState, content: Content, floor: number): void {
  for (const id of mergeFloor(state, content, floor)) {
    const room = findRoom(state, id);
    if (!room) continue;
    bump(state, 'merges');
    if (room.segments >= 3) bump(state, 'tripleRooms');
    state.events.push({ type: 'roomsMerged', roomId: id, segments: room.segments });
  }
}

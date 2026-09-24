// Every player action is a Command. The client (and later the Custom Game
// console, replays and tests) only changes the game through applyCommand.

import type { Content } from './content';
import { bonus } from './bonuses';
import { addScrip, buildCost, population, refreshUnlocks, storageCapacity, upgradeCost } from './economy';
import { canPlace, connectedRoomIds, mergeFloor, roomDef } from './grid';
import { bump, effectiveMaxHp, effectiveStat, isAway, isChild, residentsInRoom, reviveCost } from './residents';
import { claimDaily, openCrate, settle } from './systems/crates';
import { equip, grantItem, sell, unequip } from './systems/items';
import { collectExpedition, onResidentRevived, recallExpedition, startExpedition } from './systems/exploration';
import { cancelCraft, collectCraft, reforge, scrapItem, startCraft } from './systems/crafting';
import { collectRoom } from './systems/production';
import { buyPerk, collectOutposts } from './systems/prestige';
import { doResearch } from './systems/research';
import { startExcavation } from './systems/deep';
import { autoAssign } from './systems/assign';
import { abandonQuest, collectQuest, questAbility, questChoose, questCrit, questHeal, questMove, questTarget, startQuest } from './systems/quests';
import { performRush } from './systems/rush';
import type { CrateTier, GameState, Resident, Room } from './types';

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
  | { type: 'revive'; residentId: number }
  | { type: 'layToRest'; residentId: number }
  | { type: 'heal'; residentId: number }
  | { type: 'purge'; residentId: number }
  | { type: 'equip'; residentId: number; itemId: number }
  | { type: 'unequip'; residentId: number; slot: 'weapon' | 'outfit' }
  | { type: 'sell'; itemId: number }
  | { type: 'openCrate'; tier: CrateTier }
  | { type: 'claimDaily'; day: number }
  // M3
  | { type: 'explore'; residentId: number; regionId: string; medpatch: number; purge: number }
  | { type: 'recall'; expeditionId: number }
  | { type: 'collectExpedition'; expeditionId: number }
  | { type: 'craft'; roomId: number; defId: string }
  | { type: 'collectCraft'; roomId: number }
  | { type: 'cancelCraft'; roomId: number }
  | { type: 'scrap'; itemId: number }
  | { type: 'reforge'; itemIds: number[] }
  // M4
  | { type: 'startQuest'; questId: string; residentIds: number[]; medpatch: number }
  | { type: 'startContract'; contractId: number; residentIds: number[]; medpatch: number }
  | { type: 'questMove'; questId: number; roomId: string }
  | { type: 'questTarget'; questId: number; enemyUid: number; residentId?: number }
  | { type: 'questCrit'; questId: number; residentId: number; quality: number }
  | { type: 'questAbility'; questId: number; residentId: number }
  | { type: 'questHeal'; questId: number; residentId: number }
  | { type: 'questChoose'; questId: number; option: number }
  | { type: 'abandonQuest'; questId: number }
  | { type: 'collectQuest'; questId: number }
  // M5
  | { type: 'buyPerk'; perkId: string }
  | { type: 'collectOutposts' }
  // M6
  | { type: 'research'; nodeId: string }
  | { type: 'excavate' }
  | { type: 'autoAssign' };

export type CommandResult = { ok: true; detail?: string } | { ok: false; reason: string };

const fail = (reason: string): CommandResult => ({ ok: false, reason });
/** Systems return an error string or null. */
const result = (err: string | null): CommandResult => (err ? fail(err) : { ok: true });

function findRoom(state: GameState, id: number): Room | undefined {
  return state.rooms.find((r) => r.id === id);
}

function findResident(state: GameState, id: number): Resident | undefined {
  return state.residents.find((r) => r.id === id);
}

export function roomCapacity(content: Content, room: Room): number {
  return roomDef(content, room).capacityPerSegment * room.segments;
}

export function applyCommand(state: GameState, content: Content, cmd: Command): CommandResult {
  const from = state.events.length;
  const outcome = dispatch(state, content, cmd);
  if (outcome.ok) {
    refreshUnlocks(state, content);
    settle(state, content, from);
  }
  return outcome;
}

function dispatch(state: GameState, content: Content, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'build': {
      const def = content.rooms[cmd.roomType];
      if (!def || !def.buildable) return fail('cannot build that');
      if (def.requiresResearch && !state.research.done.includes(def.requiresResearch)) return fail('needs research first');
      if (!state.unlockedRooms.includes(def.id)) return fail(`unlocks at population ${def.unlockPop}`);
      if (def.maxBuilt !== undefined && state.rooms.filter((r) => r.type === def.id).length >= def.maxBuilt) {
        return fail(`only ${def.maxBuilt} allowed`);
      }
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
        timer: 0,
        job: null, banked: 0,
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
      const cost = upgradeCost(content, room, state);
      if (cost === null) return fail('already at max level');
      const needPop = roomDef(content, room).upgradePop?.[room.level - 1];
      if (needPop !== undefined && population(state) < needPop) return fail(`needs population ${needPop} to upgrade`);
      if (state.incidents.length) return fail('deal with the incident first');
      if (state.scrip < cost) return fail('not enough scrip');
      addScrip(state, content, -cost);
      // Batches made at the old level are paid at the old level.
      if (room.ready) collectRoom(state, content, room);
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
      if (room.job) return fail('finish or cancel the crafting job first');
      if (state.incidents.some((i) => i.roomId === room.id)) return fail('deal with the incident first');
      const without: GameState = { ...state, rooms: state.rooms.filter((r) => r.id !== room.id) };
      if (connectedRoomIds(without, content).size !== without.rooms.length) {
        return fail('would cut off other rooms');
      }
      if (storageCapacity(without, content, 'population') < population(state)) {
        return fail('residents would have nowhere to live');
      }
      if (storageCapacity(without, content, 'items') < state.items.length) {
        return fail('storage would overflow: sell some items first');
      }
      for (const r of state.residents) if (r.roomId === room.id) r.roomId = null;
      state.rooms = without.rooms;
      return { ok: true };
    }

    case 'assign': {
      const res = findResident(state, cmd.residentId);
      if (!res || res.dead) return fail('no such resident');
      if (res.waiting) return fail('let them in first');
      if (isChild(state, res)) return fail('children are too young to work');
      if (isAway(res)) return fail(res.quest !== null ? 'they are away on a quest' : 'they are out exploring');
      if (cmd.roomId === null) {
        res.roomId = null;
        res.courtship = null;
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
        const worst = [...crew].sort((a, b) => (stat ? effectiveStat(content, a, stat) - effectiveStat(content, b, stat) : 0) || a.id - b.id)[0];
        if (!worst) return fail('room is full');
        worst.roomId = res.roomId;
        worst.courtship = null;
        detail = `swapped with ${worst.firstName}`;
      }
      res.roomId = room.id;
      res.courtship = null;
      return { ok: true, detail };
    }

    case 'admit': {
      const res = findResident(state, cmd.residentId);
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
      if (state.incidents.length) return fail('incident in progress');
      if (residentsInRoom(state, room.id).filter((r) => !isChild(state, r)).length === 0) return fail('nobody is working there');
      return { ok: true, detail: performRush(state, content, room) };
    }

    case 'revive': {
      const res = findResident(state, cmd.residentId);
      if (!res || !res.dead) return fail('nobody to revive');
      const cost = reviveCost(content, res);
      if (state.scrip < cost) return fail('not enough scrip');
      addScrip(state, content, -cost);
      res.dead = false;
      res.hp = effectiveMaxHp(res);
      bump(state, 'revives');
      state.events.push({ type: 'residentRevived', residentId: res.id });
      // Explorers revived in the field: the exploration system resumes the trip
      // (and caps their taint) after the generic revive above.
      onResidentRevived(state, content, res.id);
      return { ok: true };
    }

    case 'layToRest': {
      // Remove a fallen resident for good. Their gear goes to storage (or is sold if full).
      const res = findResident(state, cmd.residentId);
      if (!res || !res.dead) return fail('only the fallen can be laid to rest');
      if (res.expedition !== null) return fail('recall their body from the Glarelands first');
      if (res.quest !== null) return fail('they are still away on a quest');
      for (const slot of ['weapon', 'outfit'] as const) {
        const item = res[slot];
        if (item) grantItem(state, content, item);
      }
      state.residents = state.residents.filter((r) => r !== res);
      for (const r of state.residents) if (r.courtship?.partnerId === res.id) r.courtship = null;
      bump(state, 'laidToRest');
      return { ok: true };
    }

    case 'heal': {
      const res = findResident(state, cmd.residentId);
      if (!res || res.dead) return fail('no such resident');
      if (isAway(res)) return fail('they are away from the homestead');
      if (res.hp >= effectiveMaxHp(res) - 0.5) return fail('already at full health');
      if (state.resources.medpatch < 1) return fail('no Med-Patches: build a Clinic');
      state.resources.medpatch -= 1;
      res.hp = Math.min(effectiveMaxHp(res), res.hp + res.maxHp * content.balance.medical.medpatchHeal * (1 + bonus(state, content, 'medicine')));
      bump(state, 'medpatchesUsed');
      return { ok: true };
    }

    case 'purge': {
      const res = findResident(state, cmd.residentId);
      if (!res || res.dead) return fail('no such resident');
      if (isAway(res)) return fail('they are away from the homestead');
      if (res.taint <= 0) return fail('no Glare-sickness to purge');
      if (state.resources.purge < 1) return fail('no Purge: build a Purge Lab');
      state.resources.purge -= 1;
      res.taint = Math.max(0, res.taint - res.maxHp * content.balance.medical.purgeRemove * (1 + bonus(state, content, 'medicine')));
      bump(state, 'purgesUsed');
      return { ok: true };
    }

    case 'equip': {
      const res = findResident(state, cmd.residentId);
      if (!res || res.dead) return fail('no such resident');
      if (isAway(res)) return fail('they are away from the homestead');
      const err = equip(state, content, res, cmd.itemId);
      return err ? fail(err) : { ok: true };
    }

    case 'unequip': {
      const res = findResident(state, cmd.residentId);
      if (!res) return fail('no such resident');
      if (isAway(res)) return fail('they are away from the homestead');
      const err = unequip(state, content, res, cmd.slot);
      return err ? fail(err) : { ok: true };
    }

    case 'sell': {
      const value = sell(state, content, cmd.itemId);
      return value === null ? fail('no such item') : { ok: true, detail: `sold for ${value} scrip` };
    }

    case 'openCrate': {
      if (state.crates[cmd.tier] < 1) return fail('no crates of that kind');
      openCrate(state, content, cmd.tier);
      return { ok: true };
    }

    case 'claimDaily': {
      const tier = claimDaily(state, content, cmd.day);
      return tier ? { ok: true, detail: tier } : fail('already claimed today');
    }

    case 'explore':
      return result(startExpedition(state, content, cmd.residentId, cmd.regionId, { medpatch: cmd.medpatch, purge: cmd.purge }));
    case 'recall':
      return result(recallExpedition(state, content, cmd.expeditionId));
    case 'collectExpedition':
      return result(collectExpedition(state, content, cmd.expeditionId));
    case 'craft':
      return result(startCraft(state, content, cmd.roomId, cmd.defId));
    case 'collectCraft':
      return result(collectCraft(state, content, cmd.roomId));
    case 'cancelCraft':
      return result(cancelCraft(state, content, cmd.roomId));
    case 'scrap':
      return result(scrapItem(state, content, cmd.itemId));
    case 'reforge':
      return result(reforge(state, content, cmd.itemIds));
    case 'startQuest':
      return result(startQuest(state, content, { questId: cmd.questId }, cmd));
    case 'startContract':
      return result(startQuest(state, content, { contractId: cmd.contractId }, cmd));
    case 'questMove':
      return result(questMove(state, content, cmd.questId, cmd.roomId));
    case 'questTarget':
      return result(questTarget(state, content, cmd.questId, cmd.enemyUid, cmd.residentId));
    case 'questCrit':
      return result(questCrit(state, content, cmd.questId, cmd.residentId, cmd.quality));
    case 'questAbility':
      return result(questAbility(state, content, cmd.questId, cmd.residentId));
    case 'questHeal':
      return result(questHeal(state, content, cmd.questId, cmd.residentId));
    case 'questChoose':
      return result(questChoose(state, content, cmd.questId, cmd.option));
    case 'abandonQuest':
      return result(abandonQuest(state, content, cmd.questId));
    case 'collectQuest':
      return result(collectQuest(state, content, cmd.questId));
    case 'buyPerk':
      return result(buyPerk(state, content, cmd.perkId));
    case 'collectOutposts':
      return result(collectOutposts(state, content));
    case 'research':
      return result(doResearch(state, content, cmd.nodeId));
    case 'excavate':
      return result(startExcavation(state, content));
    case 'autoAssign': {
      const n = autoAssign(state, content);
      return n > 0 ? { ok: true, detail: `${n} assigned` } : fail('nobody idle, or no free jobs');
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

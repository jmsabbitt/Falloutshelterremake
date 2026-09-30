// Every player action is a Command. The client (and later the Custom Game
// console, replays and tests) only changes the game through applyCommand.

import type { Content } from './content';
import { bonus } from './bonuses';
import { addScrip, buildCost, moveCost, population, refreshUnlocks, resourceCapacity, storageCapacity, upgradeCost } from './economy';
import { canMove, canPlace, connectedRoomIds, mergeFloor, roomDef } from './grid';
import { bump, effectiveMaxHp, effectiveStat, isAway, isChild, residentsInRoom, reviveCost } from './residents';
import { claimDaily, openCrate, settle } from './systems/crates';
import { equip, grantItem, sell, unequip, unequipAll } from './systems/items';
import { autoEquip } from './systems/gearFit';
import { collectExpedition, onResidentRevived, recallExpedition, startExpedition } from './systems/exploration';
import { useFizz } from './systems/fizz';
import { cancelCraft, collectCraft, reforge, scrapItem, startCraft } from './systems/crafting';
import { batchOutput, collectRoom } from './systems/production';
import { buyPerk, collectOutposts } from './systems/prestige';
import { doResearch } from './systems/research';
import { startExcavation, totalFloors } from './systems/deep';
import { autoAssign, idleAdults } from './systems/assign';
import { collectCaravan, recallCaravan, sendCaravan, trade } from './systems/factions';
import { abandonQuest, collectQuest, questAbility, questChoose, questCrit, questHeal, questMove, questTarget, startQuest } from './systems/quests';
import { performRush } from './systems/rush';
import { applyCustom, type CustomCommand } from './systems/custom';
import { isSurvival, rulesetMods } from './systems/rulesets';
import { legendDef, recallLegend } from './systems/legends';
import { chooseEnding, setEndingTitle } from './systems/endings';
import { onTutorialBuild, skipTutorial, tickTutorial } from './systems/tutorial';
import type { CrateTier, GameState, Resident, Room } from './types';

export type Command =
  | { type: 'build'; roomType: string; floor: number; x: number }
  | { type: 'upgrade'; roomId: number }
  | { type: 'demolish'; roomId: number }
  /** Move a room whole to a new slot for scrip (economy.moveCost). */
  | { type: 'moveRoom'; roomId: number; floor: number; x: number }
  | { type: 'assign'; residentId: number; roomId: number | null }
  | { type: 'admit'; residentId: number }
  | { type: 'admitAll' }
  | { type: 'collect'; roomId: number }
  | { type: 'collectAll' }
  | { type: 'rush'; roomId: number }
  | { type: 'revive'; residentId: number }
  | { type: 'recallLegend'; legendId: string }
  | { type: 'layToRest'; residentId: number }
  | { type: 'heal'; residentId: number }
  | { type: 'purge'; residentId: number }
  | { type: 'equip'; residentId: number; itemId: number }
  | { type: 'unequip'; residentId: number; slot: 'weapon' | 'outfit' }
  /** Respec: take weapons, outfits or both off everyone at home (or the listed residents) into storage. */
  | { type: 'unequipAll'; slot: 'weapon' | 'outfit' | 'all'; residentIds?: number[] }
  /** Hand out everyone's gear plus storage by best fit (gearFit.ts), for everyone at home or the listed residents. */
  | { type: 'autoEquip'; slot: 'weapon' | 'outfit' | 'all'; residentIds?: number[] }
  | { type: 'sell'; itemId: number }
  | { type: 'openCrate'; tier: CrateTier }
  | { type: 'claimDaily'; day: number }
  // M3
  | { type: 'explore'; residentId: number; regionId: string; medpatch: number; purge: number }
  | { type: 'recall'; expeditionId: number }
  /** Halcyon Fizz for any trip: an explorer, a caravan or a quest party reaches the end of the road now. */
  | { type: 'fizz'; target: 'explorer' | 'caravan' | 'quest'; id: number; pay: 'fizz' | 'scrip' }
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
  | { type: 'autoAssign' }
  /** Build elevators straight down from the deepest shaft, as far as scrip allows (or to `floor`). */
  | { type: 'extendShaft'; floor?: number }
  // M7
  | { type: 'trade'; offerId: number }
  | { type: 'sendCaravan'; factionId: string; residentIds: number[]; goods: { salvage?: Record<string, number>; food?: number; water?: number; medpatch?: number } }
  | { type: 'recallCaravan'; caravanId: number }
  | { type: 'collectCaravan'; caravanId: number }
  // Act 4: the ending choice, and which ending's title to wear
  | { type: 'chooseEnding'; endingId: string }
  | { type: 'setEndingTitle'; endingId: string | null }
  // The first-homestead tutorial: skip it (builds any core room still missing)
  | { type: 'skipTutorial' }
  // M9: the Custom Game sandbox console (refused outside mode: 'custom')
  | ({ type: 'custom' } & CustomCommand);

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

/** Why nobody else can be let in: the quarters are full, or Skeleton Crew's cap is reached. */
function admitBlocked(state: GameState, content: Content): string | null {
  const cap = rulesetMods(state, content).populationCap;
  if (population(state) >= cap) return `Skeleton Crew: the charter allows ${cap} residents`;
  if (population(state) >= storageCapacity(state, content, 'population')) return 'no room: build more quarters';
  return null;
}

export function roomCapacity(content: Content, room: Room): number {
  return roomDef(content, room).capacityPerSegment * room.segments;
}

/** Commands can come from the console or saved presets: refuse malformed numbers and tiers. */
function malformed(state: GameState, cmd: Command): string | null {
  for (const [k, v] of Object.entries(cmd)) {
    if (typeof v === 'number' && !Number.isFinite(v)) return `bad ${k}`;
    if (Array.isArray(v) && v.some((x) => typeof x === 'number' && !Number.isFinite(x))) return `bad ${k}`;
  }
  if ((cmd.type === 'openCrate') && !(cmd.tier in state.crates)) return 'no such crate tier';
  if ('medpatch' in cmd && (cmd.medpatch < 0 || cmd.medpatch !== Math.floor(cmd.medpatch))) return 'bad supply count';
  return null;
}

export function applyCommand(state: GameState, content: Content, cmd: Command): CommandResult {
  const bad = malformed(state, cmd);
  if (bad) return fail(bad);
  const from = state.events.length;
  const outcome = dispatch(state, content, cmd);
  if (outcome.ok) {
    tickTutorial(state);
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
      onTutorialBuild(state, content, room);
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
      // Batches made at the old level are paid at the old level: collect them
      // first, and refuse (before collecting anything) if they wouldn't all fit.
      if (room.ready) {
        const def = roomDef(content, room);
        const key = def.produces?.resource;
        const need = batchOutput(content, room) * (1 + (room.banked ?? 0));
        if (key && resourceCapacity(state, content, key) - state.resources[key] < need) {
          return fail('storage is full: make room for its finished batches first');
        }
        collectRoom(state, content, room);
      }
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
      if (room.job) return fail('finish or cancel the crafting job first');
      // The last office or trading post can't go while a party or caravan is out:
      // their panels are the only way to bring them home.
      const last = !state.rooms.some((r) => r.id !== room.id && r.type === room.type);
      if (last && room.type === 'office' && state.quests.length > 0) return fail('a quest party is out: bring them home first');
      if (last && room.type === 'trading_post' && state.caravans.length > 0) return fail('a caravan is out: bring it home first');
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
      for (const r of state.residents) {
        if (r.roomId === room.id) {
          r.roomId = null;
          r.courtship = null;
        }
      }
      state.rooms = without.rooms;
      return { ok: true };
    }

    case 'moveRoom': {
      // The room moves whole (every segment) and keeps its id, level, crew,
      // crafting job, pool, finished batches and power. If it lands beside a
      // room of the same type and level it merges under the usual build rules
      // (the left-hand room's id survives, as with any merge).
      const room = findRoom(state, cmd.roomId);
      if (!room) return fail('no such room');
      const place = canMove(state, content, room, cmd.floor, cmd.x);
      if (!place.ok) return place;
      const cost = moveCost(state, content, room);
      if (state.scrip < cost) return fail('not enough scrip');
      addScrip(state, content, -cost);
      const fromFloor = room.floor;
      const fromX = room.x;
      room.floor = cmd.floor;
      room.x = cmd.x;
      bump(state, 'roomsMoved');
      const into = mergeFloor(state, content, cmd.floor, (r) => collectRoom(state, content, r));
      for (const id of into) {
        const grown = findRoom(state, id);
        if (!grown) continue;
        bump(state, 'merges');
        if (grown.segments >= 3) bump(state, 'tripleRooms');
        state.events.push({ type: 'roomsMerged', roomId: id, segments: grown.segments });
      }
      const now = findRoom(state, room.id) ? room.id : (into[0] ?? room.id);
      state.events.push({ type: 'roomMoved', roomId: now, roomType: room.type, fromFloor, fromX, floor: cmd.floor, x: cmd.x, cost });
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
        const def = roomDef(content, room);
        const stat = def.stat;
        // Training rooms swap out whoever needs the training least (the highest base stat).
        const dir = def.category === 'training' ? -1 : 1;
        const score = (r: Resident) => (stat ? (def.category === 'training' ? r.stats[stat] : effectiveStat(content, r, stat)) : 0);
        const worst = [...crew].sort((a, b) => dir * (score(a) - score(b)) || a.id - b.id)[0];
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
      const full = admitBlocked(state, content);
      if (full) return fail(full);
      res.waiting = false;
      state.events.push({ type: 'residentAdmitted', residentId: res.id });
      return { ok: true };
    }

    case 'admitAll': {
      let n = 0;
      for (const res of state.residents.filter((r) => r.waiting)) {
        if (admitBlocked(state, content)) break;
        res.waiting = false;
        state.events.push({ type: 'residentAdmitted', residentId: res.id });
        n++;
      }
      return n > 0 ? { ok: true, detail: `${n} admitted` } : fail(admitBlocked(state, content) ?? 'nobody to admit');
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

    case 'recallLegend':
      if (typeof cmd.legendId !== 'string') return result('bad legend');
      return result(recallLegend(state, content, cmd.legendId));
    case 'revive': {
      const res = findResident(state, cmd.residentId);
      if (!res || !res.dead) return fail('nobody to revive');
      if (isSurvival(state)) return fail('Survival rules: the fallen stay fallen');
      const cost = reviveCost(content, res);
      if (state.scrip < cost) return fail('not enough scrip');
      addScrip(state, content, -cost);
      res.dead = false;
      res.hp = effectiveMaxHp(res);
      // Their job may have been filled while they were down.
      const post = res.roomId !== null ? findRoom(state, res.roomId) : undefined;
      if (post && residentsInRoom(state, post.id).length > roomCapacity(content, post)) res.roomId = null;
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
      // A legend can be sent for again later (recallLegend) and comes back with
      // their signature gear, so that stays with them rather than being duplicated.
      const def = res.legendary ? legendDef(content, res.legendary) : undefined;
      for (const slot of ['weapon', 'outfit'] as const) {
        const item = res[slot];
        if (item && item !== def?.[slot]) grantItem(state, content, item);
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

    case 'unequipAll': {
      if (cmd.slot !== 'weapon' && cmd.slot !== 'outfit' && cmd.slot !== 'all') return fail('bad slot');
      const { removed, kept } = unequipAll(state, content, cmd.slot, Array.isArray(cmd.residentIds) ? cmd.residentIds : undefined);
      if (!removed) return fail(kept ? 'storage is full' : 'nobody at home has any to take off');
      return { ok: true, detail: `${removed} to storage${kept ? `; storage filled up, ${kept} still worn` : ''}` };
    }

    case 'autoEquip': {
      if (cmd.slot !== 'weapon' && cmd.slot !== 'outfit' && cmd.slot !== 'all') return fail('bad slot');
      const { changed, equipped } = autoEquip(state, content, cmd.slot, Array.isArray(cmd.residentIds) ? cmd.residentIds : undefined);
      if (!equipped) return fail('no gear to hand out');
      return { ok: true, detail: changed ? `${changed} change${changed === 1 ? '' : 's'}, ${equipped} kitted out` : 'everyone already has their best fit' };
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
    case 'fizz':
      if (cmd.pay !== 'fizz' && cmd.pay !== 'scrip') return fail('bad payment');
      if (cmd.target !== 'explorer' && cmd.target !== 'caravan' && cmd.target !== 'quest') return fail('bad target');
      return result(useFizz(state, content, cmd.target, cmd.id, cmd.pay));
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
    case 'trade':
      return result(trade(state, content, cmd.offerId));
    case 'sendCaravan':
      return result(sendCaravan(state, content, cmd.factionId, cmd.residentIds, cmd.goods));
    case 'recallCaravan':
      return result(recallCaravan(state, content, cmd.caravanId));
    case 'collectCaravan':
      return result(collectCaravan(state, content, cmd.caravanId));
    case 'chooseEnding':
      return result(chooseEnding(state, content, cmd.endingId));
    case 'setEndingTitle':
      return result(setEndingTitle(state, content, cmd.endingId));
    case 'skipTutorial':
      return result(skipTutorial(state, content));
    case 'custom': {
      const { type: _type, ...rest } = cmd;
      return result(applyCustom(state, content, rest as CustomCommand));
    }

    case 'extendShaft': {
      const target = Math.min(cmd.floor ?? totalFloors(state, content) - 1, totalFloors(state, content) - 1);
      let built = 0;
      for (;;) {
        const deepest = state.rooms.filter((r) => r.type === 'elevator').sort((a, b) => b.floor - a.floor || a.x - b.x)[0];
        if (!deepest || deepest.floor >= target) break;
        const res = dispatch(state, content, { type: 'build', roomType: 'elevator', floor: deepest.floor + 1, x: deepest.x });
        if (!res.ok) {
          if (!built) return res;
          break;
        }
        built++;
      }
      return built ? { ok: true, detail: `${built} elevator${built > 1 ? 's' : ''} built` } : fail('the shaft already reaches that floor');
    }

    case 'autoAssign': {
      if (!idleAdults(state).length) return fail('nobody is idle');
      const n = autoAssign(state, content);
      return n > 0 ? { ok: true, detail: `${n} assigned` } : fail('no free slots in jobs, workshops, Quarters or training rooms');
    }
  }
}

function afterLayoutChange(state: GameState, content: Content, floor: number): void {
  for (const id of mergeFloor(state, content, floor, (r) => collectRoom(state, content, r))) {
    const room = findRoom(state, id);
    if (!room) continue;
    bump(state, 'merges');
    if (room.segments >= 3) bump(state, 'tripleRooms');
    state.events.push({ type: 'roomsMerged', roomId: id, segments: room.segments });
  }
}

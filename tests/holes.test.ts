// Regression tests for the holes found in the post-art gameplay review.
import { describe, expect, it } from 'vitest';
import { advance, applyCommand, livingResidents, loadContent, newGame, resourceCapacity, type GameState } from '../src/sim';
import { mergeFloor, roomCells } from '../src/sim/grid';
import { tickTutorial } from '../src/sim/systems/tutorial';
import { grantItem } from '../src/sim/systems/items';

const content = loadContent();
const T0 = 1_700_000_000_000;

function game(seed = 5): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.scrip = 50_000;
  return s;
}

describe('gameplay review fixes', () => {
  it('the only Command Office stays while a quest party is out', () => {
    const s = game();
    s.rooms.push({ id: s.nextId++, type: 'office', floor: 0, x: 13, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 });
    const office = s.rooms[s.rooms.length - 1]!;
    const ids = livingResidents(s).slice(0, 2).map((r) => r.id);
    expect(applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: ids, medpatch: 0 }).ok).toBe(true);
    expect(applyCommand(s, content, { type: 'demolish', roomId: office.id }).ok).toBe(false);
    s.quests = [];
    expect(applyCommand(s, content, { type: 'demolish', roomId: office.id }).ok).toBe(true);
  });

  it('the only Trading Post stays while a caravan is out', () => {
    const s = game();
    s.rooms.push({ id: s.nextId++, type: 'trading_post', floor: 0, x: 13, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 });
    const post = s.rooms[s.rooms.length - 1]!;
    s.caravans.push({} as GameState['caravans'][number]);
    const res = applyCommand(s, content, { type: 'demolish', roomId: post.id });
    expect(res.ok).toBe(false);
  });

  it('a refused demolish leaves couples courting', () => {
    const s = game();
    const quarters = s.rooms.filter((r) => r.type === 'quarters');
    const f = livingResidents(s).find((r) => r.sex === 'f')!;
    const m = livingResidents(s).find((r) => r.sex === 'm')!;
    f.roomId = quarters[0]!.id;
    m.roomId = quarters[0]!.id;
    advance(s, content, 1);
    expect(f.courtship).not.toBeNull();
    // Break the demolish on purpose: an incident in the room.
    s.incidents.push({ roomId: quarters[0]!.id } as GameState['incidents'][number]);
    expect(applyCommand(s, content, { type: 'demolish', roomId: quarters[0]!.id }).ok).toBe(false);
    expect(f.courtship).not.toBeNull();
  });

  it('a merge keeps an explorer\'s job to come back to', () => {
    const s = game();
    const gen = s.rooms.find((r) => r.type === 'generator')!;
    const r = livingResidents(s)[0]!;
    r.homeRoomId = gen.id;
    // A second generator right beside it, on its left, absorbs it.
    const left = { ...gen, id: s.nextId++, x: gen.x - roomCells(content, gen), segments: 1, pool: 0, ready: false, banked: 0 };
    s.rooms.push(left);
    mergeFloor(s, content, gen.floor);
    const survivor = s.rooms.find((x) => x.id === left.id || x.id === gen.id)!;
    expect(r.homeRoomId).toBe(survivor.id);
  });

  it('auto-equip counts for the tutorial\'s equip step', () => {
    const s = newGame(content, { seed: 9, now: T0 });
    if (!s.tutorial) return;
    s.tutorial.step = 'equip';
    grantItem(s, content, 'wrench');
    s.stats['autoEquips'] = 1;
    tickTutorial(s);
    expect(s.tutorial.step).not.toBe('equip');
  });

  it('supplies that do not fit are reported, not silently lost', () => {
    const s = game();
    const r = livingResidents(s)[0]!;
    s.resources.medpatch = 100;
    expect(applyCommand(s, content, { type: 'explore', residentId: r.id, regionId: 'dustbowl', medpatch: 3, purge: 0 }).ok).toBe(true);
    s.resources.medpatch = resourceCapacity(s, content, 'medpatch');
    const e = s.expeditions[0]!;
    applyCommand(s, content, { type: 'recall', expeditionId: e.id });
    applyCommand(s, content, { type: 'fizz', target: 'explorer', id: e.id, pay: 'fizz' });
    s.events = [];
    expect(applyCommand(s, content, { type: 'collectExpedition', expeditionId: e.id }).ok).toBe(true);
    const lost = s.events.find((ev) => ev.type === 'suppliesLost');
    expect(lost).toMatchObject({ key: 'medpatch' });
  });
});

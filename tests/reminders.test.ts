import { describe, expect, it } from 'vitest';
import { applyCommand, catchUp, loadContent, newGame, resourceCapacity, type GameState, type Resident, type Room } from '../src/sim';
import { population, storageCapacity } from '../src/sim/economy';
import { createResident, emptyStats } from '../src/sim/residents';
import { recipeFor } from '../src/sim/systems/crafting';
import { startExpedition } from '../src/sim/systems/exploration';
import { researchContent } from '../src/sim/systems/research';
import { upcomingReminders, type Reminder, type ReminderKind } from '../src/sim/systems/reminders';
import type { Caravan, Quest } from '../src/sim/types';

const content = loadContent();
const T0 = 1_700_000_000_000;

function calm(seed = 11): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.scrip = 50_000;
  for (const r of s.residents) r.roomId = null; // idle: no production unless a test asks
  return s;
}

function addRoom(s: GameState, type: string, level = 1, floor = 5): Room {
  const room: Room = { id: s.nextId++, type, floor, x: s.rooms.length * 3, segments: 1, level, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 };
  s.rooms.push(room);
  return room;
}

function worker(s: GameState, room: Room | null, value = 5): Resident {
  const r = createResident(s, content, { stats: emptyStats(value) });
  r.waiting = false;
  r.roomId = room ? room.id : null;
  s.residents.push(r);
  return r;
}

function find(list: Reminder[], kind: ReminderKind, key?: string): Reminder | undefined {
  return list.find((r) => r.kind === kind && (key === undefined || r.key === key));
}

/** Fast-forward the closed game by `seconds` of wall clock. */
function away(s: GameState, seconds: number): void {
  catchUp(s, content, s.lastRealTime + seconds * 1000);
}

function snapshot(s: GameState): string {
  return JSON.stringify(s);
}

describe('reminders: explorers', () => {
  it('predicts a returning explorer, and they are home after that long', () => {
    const s = calm();
    const r = s.residents[0] as Resident;
    expect(startExpedition(s, content, r.id, 'dustbowl', { medpatch: 0, purge: 0 })).toBeNull();
    const e = s.expeditions[0];
    if (!e) throw new Error('no expedition');
    e.status = 'returning';
    e.returnRemaining = 900;
    const list = upcomingReminders(s, content);
    const rem = find(list, 'explorer', `explorer.${e.id}`);
    expect(rem?.inSeconds).toBe(900);
    expect(rem?.body).toContain(r.firstName);
    away(s, 850);
    expect(e.status).toBe('returning');
    away(s, 55);
    expect(e.status).toBe('returned');
  });

  it('warns before an explorer without Purge crosses the Purge line', () => {
    const s = calm();
    const r = s.residents[0] as Resident;
    r.stats.grit = 1;
    r.outfit = null;
    expect(startExpedition(s, content, r.id, 'dustbowl', { medpatch: 0, purge: 0 })).toBeNull();
    const e = s.expeditions[0];
    if (!e) throw new Error('no expedition');
    e.supplies.medpatch = 25; // keep them standing long enough to see it
    r.taint = r.maxHp * 0.45;
    const rem = find(upcomingReminders(s, content), 'explorer', `explorer.${e.id}.purge`);
    expect(rem).toBeDefined();
    expect(rem?.title).toBe('Out of Purge');
    const line = r.maxHp * 0.5;
    away(s, (rem?.inSeconds ?? 0) + 5);
    // Hazards only add Glare, so by then it is over the line as it stood (a level-up
    // on the road can raise the line itself; the reminder is a nudge, not a verdict).
    expect(r.taint).toBeGreaterThanOrEqual(line - 1e-6);
    // With Purge packed there is nothing to warn about.
    const s2 = calm();
    const r2 = s2.residents[0] as Resident;
    startExpedition(s2, content, r2.id, 'dustbowl', { medpatch: 0, purge: 1 });
    expect(upcomingReminders(s2, content).some((x) => x.key.endsWith('.purge'))).toBe(false);
  });
});

describe('reminders: caravans and quests', () => {
  function caravan(s: GameState, status: Caravan['status'], remaining: number, total: number): Caravan {
    const r = s.residents[1] as Resident;
    r.caravan = s.nextId;
    r.roomId = null;
    const c: Caravan = { id: s.nextId++, factionId: 'caravaners', residentIds: [r.id], goods: { salvage: {}, food: 10, water: 0, medpatch: 0 }, status, remaining, total, result: null };
    s.caravans.push(c);
    return c;
  }

  it('a travelling caravan is back after the rest of the trip plus the road home', () => {
    const s = calm();
    const c = caravan(s, 'travelling', 300, 1200);
    const rem = find(upcomingReminders(s, content), 'caravan', `caravan.${c.id}`);
    expect(rem?.inSeconds).toBe(1500);
    away(s, 1440);
    expect(c.status).toBe('returning');
    away(s, 65);
    expect(c.status).toBe('returned');
  });

  it('skips a caravan under a minute out, and one already home', () => {
    const s = calm();
    caravan(s, 'returning', 30, 600);
    caravan(s, 'returned', 0, 600);
    expect(find(upcomingReminders(s, content), 'caravan')).toBeUndefined();
  });

  it('quest parties on the road: arrival on site and the trip home', () => {
    const s = calm();
    const q = { id: s.nextId++, title: 'Pest Control: Old Mill', status: 'returning', travelRemaining: 700, travelTotal: 900 } as unknown as Quest;
    const q2 = { id: s.nextId++, title: 'Something', status: 'onsite', travelRemaining: 0, travelTotal: 900 } as unknown as Quest;
    s.quests.push(q, q2);
    const list = upcomingReminders(s, content);
    expect(find(list, 'quest', `quest.${q.id}.home`)?.inSeconds).toBe(700);
    expect(list.filter((x) => x.kind === 'quest')).toHaveLength(1);
    away(s, 705);
    expect(q.status).toBe('returned');
  });
});

describe('reminders: crafting', () => {
  it('matches the moment the job finishes under offline stepping', () => {
    const s = calm();
    s.resources.power = resourceCapacity(s, content, 'power');
    const shop = addRoom(s, 'weaponshop');
    worker(s, shop, 6);
    const recipe = recipeFor(content, Object.keys(content.items).find((id) => recipeFor(content, id)?.workshop === 'weaponshop') ?? '');
    if (!recipe) throw new Error('no weaponshop recipe');
    shop.job = { defId: recipe.defId, remaining: recipe.seconds, total: recipe.seconds };
    const rem = find(upcomingReminders(s, content), 'craft');
    expect(rem).toBeDefined();
    const at = rem?.inSeconds ?? 0;
    const before = structuredClone(s);
    away(before, at - 61);
    expect(before.rooms.find((r) => r.id === shop.id)?.job?.remaining).toBeGreaterThan(0);
    away(s, at + 3);
    expect(shop.job?.remaining).toBe(0);
  });

  it('a stalled job (nobody working) gets no reminder', () => {
    const s = calm();
    const shop = addRoom(s, 'weaponshop');
    const defId = Object.keys(content.items).find((id) => recipeFor(content, id)?.workshop === 'weaponshop') as string;
    shop.job = { defId, remaining: 600, total: 600 };
    expect(find(upcomingReminders(s, content), 'craft')).toBeUndefined();
  });
});

describe('reminders: storage', () => {
  function staffed(seed = 5): GameState {
    const s = calm(seed);
    const types = ['generator', 'canteen', 'waterworks'];
    s.residents.forEach((r, i) => {
      const room = s.rooms.find((x) => x.type === types[i % types.length]);
      r.roomId = room ? room.id : null;
    });
    return s;
  }

  it('one grouped reminder for when every working room is sitting on a batch', () => {
    const s = staffed();
    s.resources.power = resourceCapacity(s, content, 'power');
    const list = upcomingReminders(s, content);
    const storage = list.filter((r) => r.kind === 'storage');
    expect(storage).toHaveLength(1);
    const rem = storage[0] as Reminder;
    expect(rem.body).toMatch(/full of/);
    const producers = () => s.rooms.filter((r) => ['generator', 'canteen', 'waterworks'].includes(r.type));
    const before = structuredClone(s);
    away(before, rem.inSeconds - 61);
    expect(before.rooms.filter((r) => ['generator', 'canteen', 'waterworks'].includes(r.type)).every((r) => r.ready)).toBe(false);
    away(s, rem.inSeconds + 5);
    expect(producers().every((r) => r.ready)).toBe(true);
  });

  it('still lines up when the power runs low in the first minutes', () => {
    const s = staffed(9);
    s.resources.power = 3; // below the shortage line: some rooms go dark
    const rem = find(upcomingReminders(s, content), 'storage');
    if (!rem) return; // nothing can finish in the dark: nothing to predict
    const copy = structuredClone(s);
    away(copy, rem.inSeconds + 5);
    const working = copy.rooms.filter((r) => ['generator', 'canteen', 'waterworks'].includes(r.type) && r.ready);
    expect(working.length).toBeGreaterThan(0);
  });

  it('no reminder when nobody works', () => {
    expect(find(upcomingReminders(calm(), content), 'storage')).toBeUndefined();
  });
});

describe('reminders: research, the Deep and outposts', () => {
  it('research: enough points for the cheapest open node', () => {
    const s = calm();
    s.resources.power = resourceCapacity(s, content, 'power');
    const lab = addRoom(s, 'lab');
    worker(s, lab, 8);
    worker(s, lab, 8);
    const rem = find(upcomingReminders(s, content), 'research');
    expect(rem).toBeDefined();
    const node = researchContent(content).nodes.find((n) => rem?.key === `research.${n.id}`);
    if (!node) throw new Error('no node');
    expect(node.requires).toHaveLength(0);
    away(s, (rem?.inSeconds ?? 0) + 5);
    expect(s.research.points).toBeGreaterThanOrEqual(node.cost);
  });

  it('the dig breaks through', () => {
    const s = calm();
    s.deep.dig = { stratum: 1, remaining: 4000, total: 4000 };
    const rem = find(upcomingReminders(s, content), 'deep', 'deep.1');
    expect(rem?.inSeconds).toBe(4000);
    away(s, 4003);
    expect(s.deep.strata).toBe(1);
    expect(s.deep.dig).toBeNull();
  });

  it('outposts fill up to their cap', () => {
    const s = calm();
    s.legacy.outposts.push({ id: 1, homesteadNumber: 1, cycle: 1, siteId: 'plot7', population: 5, rates: { scrip: 100, salvage: 2, cratesPerHour: 0.1 }, stored: { scrip: 0, salvage: 0, crates: 0 } });
    const rem = find(upcomingReminders(s, content), 'outpost');
    expect(rem?.inSeconds).toBe(24 * 3600);
  });
});

describe('reminders: family', () => {
  it('a birth when a bed is free, then the child grows up', () => {
    const s = calm();
    addRoom(s, 'quarters', 3);
    const mother = s.residents.find((r) => r.sex === 'f') as Resident;
    const father = s.residents.find((r) => r.sex === 'm') as Resident;
    mother.pregnancy = { fatherId: father.id, dueAt: s.time + 1800 };
    const list = upcomingReminders(s, content);
    const birth = find(list, 'birth');
    expect(birth?.inSeconds).toBe(1800);
    expect(birth?.body).toContain(mother.firstName);
    expect(find(list, 'grownUp')?.inSeconds).toBe(1800 + content.balance.family.childhoodSeconds);
    const births = s.stats['births'] ?? 0;
    away(s, 1805);
    expect((s.stats['births'] ?? 0) - births).toBe(1);
    const child = s.residents.find((r) => r.motherId === mother.id) as Resident;
    const grown = find(upcomingReminders(s, content), 'grownUp', `grownUp.${child.id}`);
    expect(grown).toBeDefined();
    away(s, (grown?.inSeconds ?? 0) + 5);
    expect(child.adultAt).toBeNull();
  });

  it('no birth reminder without a free bed', () => {
    const s = calm();
    const mother = s.residents.find((r) => r.sex === 'f') as Resident;
    mother.pregnancy = { fatherId: mother.id, dueAt: s.time + 1800 };
    expect(find(upcomingReminders(s, content), 'birth')).toBeDefined();
    // Fill every bed.
    while (population(s) < storageCapacity(s, content, 'population')) worker(s, null);
    expect(find(upcomingReminders(s, content), 'birth')).toBeUndefined();
    const births = s.stats['births'] ?? 0;
    away(s, 1900);
    expect((s.stats['births'] ?? 0) - births).toBe(0);
  });
});

describe('reminders: boards and crates', () => {
  it('contracts refresh, only with a Command Office once contracts are open', () => {
    const s = calm();
    s.questsDone.push('act1_1');
    s.contracts.refreshAt = s.time + 3600;
    expect(find(upcomingReminders(s, content), 'contracts')).toBeUndefined();
    addRoom(s, 'office');
    expect(find(upcomingReminders(s, content), 'contracts')?.inSeconds).toBe(3600);
  });

  it('the trade board turns over only with a staffed Trading Post and a faction met', () => {
    const s = calm();
    s.factions['caravaners'] = { rep: 0, met: true };
    s.trade.refreshAt = s.time + 7200;
    const post = addRoom(s, 'trading_post', 1, -1);
    expect(find(upcomingReminders(s, content), 'trade')).toBeUndefined();
    worker(s, post);
    const rem = find(upcomingReminders(s, content), 'trade');
    expect(rem?.inSeconds).toBe(7200);
    away(s, 7205);
    expect(s.trade.refreshAt).toBeGreaterThan(s.time);
  });

  it('the daily crate arrives at local midnight, and a long streak gets a nudge', () => {
    const s = calm();
    const offset = 120; // UTC+2
    const today = Math.floor((s.lastRealTime + offset * 60_000) / 86_400_000);
    s.daily = { lastDay: today, streak: 3 };
    const list = upcomingReminders(s, content, { utcOffsetMinutes: offset });
    const crate = find(list, 'crate', `crate.${today + 1}`);
    const midnight = (today + 1) * 86_400_000 - offset * 60_000;
    expect(crate?.inSeconds).toBe(Math.ceil((midnight - s.lastRealTime) / 1000));
    expect(crate?.body).toContain('Day 4');
    const nudge = find(list, 'crate', `crate.streak.${today + 1}`);
    expect(nudge?.inSeconds).toBe((crate?.inSeconds ?? 0) + 18 * 3600);
    // Unclaimed (a day behind): the game claims it on opening, nothing to schedule.
    s.daily.lastDay = today - 1;
    expect(find(upcomingReminders(s, content, { utcOffsetMinutes: offset }), 'crate')).toBeUndefined();
  });
});

describe('reminders: contract', () => {
  function busy(): GameState {
    const s = calm();
    s.resources.power = resourceCapacity(s, content, 'power');
    for (const [i, r] of s.residents.entries()) r.roomId = s.rooms.find((x) => x.type === ['generator', 'canteen', 'waterworks'][i % 3])?.id ?? null;
    const lab = addRoom(s, 'lab');
    worker(s, lab, 6);
    s.deep.dig = { stratum: 1, remaining: 9000, total: 9000 };
    for (let i = 0; i < 30; i++) {
      const r = createResident(s, content);
      r.waiting = false;
      r.caravan = s.nextId;
      s.residents.push(r);
      s.caravans.push({ id: s.nextId++, factionId: 'caravaners', residentIds: [r.id], goods: { salvage: {}, food: 1, water: 0, medpatch: 0 }, status: 'returning', remaining: 120 + i * 3000, total: 90_000, result: null });
    }
    return s;
  }

  it('is pure: the state and its rng are untouched', () => {
    const s = busy();
    const before = snapshot(s);
    const rng = [...s.rng];
    upcomingReminders(s, content);
    upcomingReminders(s, content, { horizonSeconds: 10 * 24 * 3600, max: 100 });
    expect(snapshot(s)).toBe(before);
    expect(s.rng).toEqual(rng);
  });

  it('soonest first, stable keys, and limits respected', () => {
    const s = busy();
    const all = upcomingReminders(s, content, { max: 1000 });
    expect(all.length).toBeGreaterThan(20);
    for (let i = 1; i < all.length; i++) expect(all[i]!.inSeconds).toBeGreaterThanOrEqual(all[i - 1]!.inSeconds);
    expect(new Set(all.map((r) => r.key)).size).toBe(all.length);
    expect(upcomingReminders(s, content).length).toBe(20);
    expect(upcomingReminders(s, content, { max: 5 })).toEqual(all.slice(0, 5));
    expect(upcomingReminders(s, content)).toEqual(upcomingReminders(s, content));
    for (const r of all) {
      expect(r.inSeconds).toBeGreaterThanOrEqual(60);
      expect(r.inSeconds).toBeLessThanOrEqual(3 * 24 * 3600);
      expect(r.title.length).toBeLessThanOrEqual(40);
      expect(r.body.length).toBeLessThanOrEqual(110);
    }
    const hour = upcomingReminders(s, content, { horizonSeconds: 3600, max: 1000 });
    expect(hour.every((r) => r.inSeconds <= 3600)).toBe(true);
    expect(hour.length).toBeLessThan(all.length);
  });

  it('nothing past the offline catch-up cap: the sim would not get there', () => {
    const s = calm();
    s.deep.dig = { stratum: 1, remaining: 80 * 3600, total: 80 * 3600 };
    expect(find(upcomingReminders(s, content, { horizonSeconds: 100 * 3600 }), 'deep')).toBeUndefined();
    s.deep.dig.remaining = 70 * 3600;
    expect(find(upcomingReminders(s, content, { horizonSeconds: 100 * 3600 }), 'deep')).toBeDefined();
  });
});

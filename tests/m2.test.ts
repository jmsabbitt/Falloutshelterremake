import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  deserialize,
  effectiveStat,
  isChild,
  loadContent,
  newGame,
  population,
  serialize,
  storageCapacity,
  touchesDirt,
  type GameState,
  type Resident,
  type Room,
} from '../src/sim';
import { createResident } from '../src/sim/residents';
import { startIncident, startRaid } from '../src/sim/systems/incidents';

const content = loadContent();
/** The starter elevator shaft (the door is the six cells left of it). */
const S = content.balance.grid.starterShaftX;
const T0 = 1_700_000_000_000;

/** A game with incidents and wanderers pushed far away so tests are controlled. */
function calm(seed = 11): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.scrip = 50_000;
  return s;
}

function room(s: GameState, type: string): Room {
  const r = s.rooms.find((x) => x.type === type);
  if (!r) throw new Error(`no ${type}`);
  return r;
}

function adult(s: GameState, sex: 'f' | 'm'): Resident {
  const r = createResident(s, content, { sex });
  r.waiting = false;
  s.residents.push(r);
  return r;
}

function unlockAll(s: GameState) {
  s.peakPopulation = 200;
  for (const d of content.roomList) if (d.buildable && !s.unlockedRooms.includes(d.id)) s.unlockedRooms.push(d.id);
}

describe('family', () => {
  it('courtship leads to pregnancy, birth after 3h, and a child who grows up after 3h more', () => {
    const s = calm();
    for (const r of s.residents) r.roomId = null;
    const q = room(s, 'quarters');
    const mom = s.residents.find((r) => r.sex === 'f') as Resident;
    const dad = s.residents.find((r) => r.sex === 'm') as Resident;
    applyCommand(s, content, { type: 'assign', residentId: mom.id, roomId: q.id });
    applyCommand(s, content, { type: 'assign', residentId: dad.id, roomId: q.id });
    advance(s, content, 5);
    expect(mom.courtship?.partnerId).toBe(dad.id);
    advance(s, content, 200);
    expect(mom.pregnancy).not.toBeNull();
    expect(mom.happiness).toBeGreaterThan(90);

    const before = s.residents.length;
    advance(s, content, 3 * 3600);
    expect(s.residents.length).toBe(before + 1);
    const child = s.residents[s.residents.length - 1] as Resident;
    expect(child.motherId).toBe(mom.id);
    expect(isChild(s, child)).toBe(true);
    expect(applyCommand(s, content, { type: 'assign', residentId: child.id, roomId: room(s, 'generator').id }).ok).toBe(false);
    expect(s.achievements['first_baby']).toBeDefined();

    advance(s, content, 3 * 3600 + 1);
    expect(isChild(s, child)).toBe(false);
    expect(applyCommand(s, content, { type: 'assign', residentId: child.id, roomId: room(s, 'generator').id }).ok).toBe(true);
    expect(s.stats['grewUp']).toBe(1);
  });

  it('close relatives never court', () => {
    const s = calm();
    for (const r of s.residents) r.roomId = null;
    const q = room(s, 'quarters');
    const mom = adult(s, 'f');
    const son = adult(s, 'm');
    son.motherId = mom.id;
    const sis = adult(s, 'f');
    sis.motherId = mom.id;
    s.residents = s.residents.filter((r) => [mom.id, son.id, sis.id].includes(r.id));
    for (const r of [mom, son, sis]) applyCommand(s, content, { type: 'assign', residentId: r.id, roomId: q.id });
    advance(s, content, 600);
    expect(mom.pregnancy).toBeNull();
    expect(sis.pregnancy).toBeNull();
  });

  it('holds a birth until there is a free bed', () => {
    const s = calm();
    const mom = s.residents.find((r) => r.sex === 'f') as Resident;
    mom.pregnancy = { fatherId: -1, dueAt: 10 };
    while (population(s) < storageCapacity(s, content, 'population')) adult(s, 'm');
    const n = s.residents.length;
    advance(s, content, 60);
    expect(s.residents.length).toBe(n);
    expect(mom.pregnancy).not.toBeNull();
    s.residents.pop(); // free a bed
    advance(s, content, 2);
    expect(mom.pregnancy).toBeNull();
  });

  it('children inherit, and high-stat parents can have super children', () => {
    const s = calm(99);
    s.residents = s.residents.slice(0, 2); // leave free beds
    const mom = adult(s, 'f');
    const dad = adult(s, 'm');
    for (const k of Object.keys(mom.stats) as (keyof Resident['stats'])[]) {
      mom.stats[k] = 10;
      dad.stats[k] = 10;
    }
    const totals = new Set<number>();
    for (let i = 0; i < 200; i++) {
      mom.pregnancy = { fatherId: dad.id, dueAt: s.time };
      s.residents = s.residents.filter((r) => r.motherId === null);
      advance(s, content, 1);
      const kid = s.residents.find((r) => r.motherId === mom.id);
      if (kid) totals.add(Object.values(kid.stats).reduce((a, b) => a + b, 0));
    }
    expect([...totals].some((t) => t >= 28)).toBe(true);
    expect([...totals].some((t) => t <= 13)).toBe(true);
  });
});

describe('arrivals', () => {
  it('wanderers keep a young homestead growing', () => {
    const s = newGame(content, { seed: 4, now: T0 });
    s.nextIncidentAt = 1e12;
    const before = s.residents.length;
    advance(s, content, 2 * 3600);
    expect(s.residents.length).toBeGreaterThan(before);
    expect(s.residents.filter((r) => r.waiting).length).toBeLessThanOrEqual(content.balance.arrivals.maxWaiting);
  });

  it('a staffed radio room recruits', () => {
    const s = calm(5);
    unlockAll(s);
    expect(applyCommand(s, content, { type: 'build', roomType: 'radio', floor: 2, x: S + 4 }).ok).toBe(true);
    const radio = room(s, 'radio');
    const crew = s.residents.slice(0, 2);
    for (const r of crew) {
      r.stats.charm = 10;
      applyCommand(s, content, { type: 'assign', residentId: r.id, roomId: radio.id });
    }
    s.resources.power = 100;
    for (let h = 0; h < 30 && !s.stats['arrivals.radio']; h++) {
      s.resources.power = 100;
      s.resources.food = 100;
      s.resources.water = 100;
      advance(s, content, 3600);
    }
    expect(s.stats['arrivals.radio']).toBeGreaterThan(0);
  });
});

describe('incidents', () => {
  it('spreads from an empty room to neighbours and eventually burns out', () => {
    const s = calm();
    for (const r of s.residents) r.roomId = null;
    const canteen = room(s, 'canteen');
    startIncident(s, content, 'skitters', canteen);
    advance(s, content, 15);
    expect(s.incidents.some((i) => i.roomId === canteen.id)).toBe(false);
    expect(s.incidents.length).toBeGreaterThan(0);
    advance(s, content, 600);
    expect(s.incidents).toHaveLength(0);
  });

  it('defenders beat skitters and gain xp', () => {
    const s = calm();
    const gen = room(s, 'generator');
    const crew = s.residents.slice(0, 2);
    for (const r of crew) applyCommand(s, content, { type: 'assign', residentId: r.id, roomId: gen.id });
    startIncident(s, content, 'skitters', gen);
    advance(s, content, 60);
    expect(s.incidents).toHaveLength(0);
    expect(s.stats['incidentsResolved.skitters']).toBe(1);
    expect(crew.every((r) => !r.dead)).toBe(true);
  });

  it('pregnant residents and children do not fight', () => {
    const s = calm();
    const gen = room(s, 'generator');
    const [a] = s.residents.filter((r) => r.sex === 'f');
    if (!a) throw new Error();
    for (const r of s.residents) r.roomId = null;
    a.roomId = gen.id;
    a.pregnancy = { fatherId: -1, dueAt: 1e9 };
    const inc = startIncident(s, content, 'fire', gen);
    const hp = inc.hp;
    advance(s, content, 5);
    expect(a.hp).toBe(a.maxHp);
    expect(s.incidents.find((i) => i.id === inc.id)?.hp ?? hp).toBe(hp);
  });

  it('raiders break the door, fight the guards, and drop loot when beaten', () => {
    const s = calm();
    const door = room(s, 'door');
    const guards = s.residents.slice(0, 2);
    for (const g of guards) {
      g.weapon = 'rivet_rifle';
      applyCommand(s, content, { type: 'assign', residentId: g.id, roomId: door.id });
    }
    const inc = startRaid(s, content);
    expect(inc?.doorHp).toBeGreaterThan(0);
    const scrip = s.scrip;
    advance(s, content, 120);
    expect(s.incidents).toHaveLength(0);
    expect(s.stats['incidentsResolved.rustmen']).toBe(1);
    expect(s.scrip).toBeGreaterThan(scrip);
  });

  it('an unguarded raid steals scrip', () => {
    const s = calm();
    for (const r of s.residents) r.roomId = null;
    s.scrip = 5000;
    startRaid(s, content);
    advance(s, content, 400);
    expect(s.scrip).toBeLessThan(5000);
  });

  it('only rooms touching dirt can get burrowers', () => {
    const s = calm();
    const gen = room(s, 'generator'); // canteen on its right, elevator on its left
    const canteen = room(s, 'canteen'); // open dirt on its right
    expect(touchesDirt(s, content, gen)).toBe(false);
    expect(touchesDirt(s, content, canteen)).toBe(true);
  });

  it('random incidents arrive on the background timer, only while playing', () => {
    const s = newGame(content, { seed: 8, now: T0 });
    applyCommand(s, content, { type: 'admitAll' });
    s.nextWandererAt = 1e12;
    const started = () => s.stats['incidentsResolved'] ?? 0;
    for (let i = 0; i < 3 * 60 && !s.incidents.length && started() === 0; i++) advance(s, content, 60);
    expect(s.incidents.length > 0 || started() > 0).toBe(true);
  });
});

describe('items', () => {
  it('outfits raise effective stats and production; items can be equipped and sold', () => {
    const s = calm();
    const r = s.residents[0] as Resident;
    s.items.push({ id: 9001, defId: 'titan_harness' });
    const base = effectiveStat(content, r, 'brawn');
    expect(applyCommand(s, content, { type: 'equip', residentId: r.id, itemId: 9001 }).ok).toBe(true);
    expect(effectiveStat(content, r, 'brawn')).toBe(base + 7);
    expect(s.items).toHaveLength(0);
    expect(applyCommand(s, content, { type: 'unequip', residentId: r.id, slot: 'outfit' }).ok).toBe(true);
    const item = s.items[0];
    if (!item) throw new Error();
    const scrip = s.scrip;
    expect(applyCommand(s, content, { type: 'sell', itemId: item.id }).ok).toBe(true);
    expect(s.scrip).toBe(scrip + 500);
  });
});

describe('supply crates', () => {
  it('new games start with crates; opening gives 5 cards', () => {
    const s = calm();
    expect(s.crates.standard).toBe(3);
    applyCommand(s, content, { type: 'openCrate', tier: 'standard' });
    expect(s.crates.standard).toBe(2);
    expect(s.stats['cratesOpened']).toBe(1);
  });

  it('guarantees a legendary within the pity window', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = calm(seed);
      s.crates.standard = 10;
      let legendary = false;
      for (let i = 0; i < 10; i++) {
        const before = (s.stats['legendaryItems'] ?? 0) + (s.stats['legendaryResidents'] ?? 0);
        applyCommand(s, content, { type: 'openCrate', tier: 'standard' });
        if ((s.stats['legendaryItems'] ?? 0) + (s.stats['legendaryResidents'] ?? 0) > before) legendary = true;
      }
      expect(legendary).toBe(true);
    }
  });

  it('tokens turn into crates, and play earns them', () => {
    const s = calm(3);
    const pool = s.residents.filter((r) => !r.waiting);
    const types = ['generator', 'canteen', 'waterworks'];
    pool.forEach((r, i) => applyCommand(s, content, { type: 'assign', residentId: r.id, roomId: room(s, types[i % 3] as string).id }));
    // Ten tokens make a crate.
    s.crateTokens = 9;
    const start = s.crates.standard;
    s.nextIncidentAt = 60; // an incident resolved gives a token
    const gen = room(s, 'generator');
    startIncident(s, content, 'skitters', gen);
    advance(s, content, 120);
    expect(s.crates.standard).toBeGreaterThan(start);
    // And ordinary play earns crates within a few hours.
    const earned = s.stats['cratesEarned'] ?? 0;
    for (let i = 0; i < 6 * 60; i++) {
      advance(s, content, 60);
      applyCommand(s, content, { type: 'collectAll' });
    }
    expect(s.stats['cratesEarned'] ?? 0).toBeGreaterThan(earned);
  });

  it('daily crates every day, a rare one on day 7', () => {
    const s = calm();
    for (let d = 100; d < 107; d++) expect(applyCommand(s, content, { type: 'claimDaily', day: d }).ok).toBe(true);
    expect(applyCommand(s, content, { type: 'claimDaily', day: 106 }).ok).toBe(false);
    expect(s.crates.rare).toBeGreaterThanOrEqual(1);
    expect(s.daily.streak).toBe(7);
    applyCommand(s, content, { type: 'claimDaily', day: 110 });
    expect(s.daily.streak).toBe(1);
  });

  it('population milestones award crates once', () => {
    const s = calm();
    while (s.residents.length < 10) adult(s, 'm');
    unlockAll(s);
    s.peakPopulation = 0;
    applyCommand(s, content, { type: 'build', roomType: 'quarters', floor: 0, x: S + 4 });
    expect(s.milestones).toContain(10);
    const crates = s.crates.standard;
    applyCommand(s, content, { type: 'collectAll' });
    expect(s.crates.standard).toBe(crates);
  });

  it('sells items automatically when storage is full', () => {
    const s = calm();
    for (let i = 0; i < 10; i++) s.items.push({ id: 5000 + i, defId: 'wrench' });
    s.crates.standard = 1;
    const scrip = s.scrip;
    applyCommand(s, content, { type: 'openCrate', tier: 'standard' });
    expect(s.items.length).toBe(10);
    expect(s.scrip).toBeGreaterThan(scrip);
  });
});

describe('medical', () => {
  it('med-patches heal and purge removes taint', () => {
    const s = calm();
    const r = s.residents[0] as Resident;
    r.hp = 20;
    r.taint = 40;
    s.resources.medpatch = 1;
    s.resources.purge = 1;
    expect(applyCommand(s, content, { type: 'heal', residentId: r.id }).ok).toBe(true);
    expect(r.hp).toBeGreaterThan(20);
    expect(applyCommand(s, content, { type: 'purge', residentId: r.id }).ok).toBe(true);
    expect(r.taint).toBeLessThan(40);
    expect(applyCommand(s, content, { type: 'heal', residentId: r.id }).ok).toBe(false);
  });
});

describe('save migration', () => {
  it('loads an M1 (v1) save', () => {
    const s = calm();
    const v1 = JSON.parse(serialize(s, 0));
    v1.version = 1;
    for (const k of ['items', 'crates', 'crateTokens', 'pity', 'daily', 'milestones', 'incidentTimer', 'nextIncidentAt', 'nextWandererAt']) delete v1.state[k];
    for (const r of v1.state.residents) for (const k of ['appearance', 'motherId', 'fatherId', 'adultAt', 'pregnancy', 'courtship', 'weapon', 'outfit']) delete r[k];
    for (const r of v1.state.rooms) delete r.timer;
    const loaded = deserialize(JSON.stringify(v1));
    expect(loaded.crates.standard).toBe(3);
    expect(loaded.residents[0]?.appearance).toBeDefined();
    advance(loaded, content, 600); // and it simulates
    expect(loaded.time).toBeGreaterThan(s.time);
  });
});

describe('determinism', () => {
  it('the same seed and inputs give the same homestead', () => {
    const run = () => {
      const s = newGame(content, { seed: 77, now: T0 });
      applyCommand(s, content, { type: 'admitAll' });
      for (let i = 0; i < 6 * 60; i++) {
        advance(s, content, 60);
        applyCommand(s, content, { type: 'collectAll' });
      }
      return serialize(s, 0);
    };
    expect(run()).toBe(run());
  });
});

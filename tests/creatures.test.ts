// M9 stream C: new vault creatures (surges, the Hollowed, Glassbacks, Maulers)
// and the Mauler meter.

import { describe, expect, it } from 'vitest';
import { advance, applyCommand, catchUp, loadContent, newGame, population, roomDef, threatRating, type GameState, type Resident, type Room } from '../src/sim';
import { createResident } from '../src/sim/residents';
import {
  GLASSBACKS,
  HOLLOWED,
  MAULERS,
  SURGE,
  incidentDef,
  maulerRateMult,
  maulerStatus,
  maulerTuning,
  settleIncidentsOffline,
  startIncident,
  startMauler,
  tickIncidentTimer,
  tickIncidents,
  tickMaulerMeter,
} from '../src/sim/systems/incidents';
import { TOPSIDE_FLOOR } from '../src/sim/grid';

const content = loadContent();
const T0 = 1_700_000_000_000;

function calm(seed = 11, pop = 0): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.scrip = 5_000;
  s.resources.food = 500;
  s.resources.water = 500;
  s.resources.power = 500;
  while (population(s) < pop) {
    const r = createResident(s, content);
    r.waiting = false;
    s.residents.push(r);
  }
  return s;
}

function room(s: GameState, type: string): Room {
  const r = s.rooms.find((x) => x.type === type);
  if (!r) throw new Error(`no ${type}`);
  return r;
}

/** Tough residents with good guns standing in a room (not working there). */
function guards(s: GameState, target: Room, n: number, weapon = 'coilgun'): Resident[] {
  const crew = s.residents.filter((r) => !r.dead && !r.waiting).slice(0, n);
  for (const r of crew) {
    r.roomId = target.id;
    r.weapon = weapon;
    r.level = 20;
    r.maxHp = 400;
    r.hp = 400;
    r.pregnancy = null;
  }
  return crew;
}

function nobodyHome(s: GameState): void {
  for (const r of s.residents) r.roomId = null;
}

function hpOf(s: GameState): number[] {
  return s.residents.map((r) => r.hp);
}

describe('content', () => {
  it('defines the four creatures with thresholds and our names', () => {
    for (const t of [SURGE, HOLLOWED, GLASSBACKS, MAULERS]) {
      const d = incidentDef(content, t);
      expect(d.name.length).toBeGreaterThan(3);
      expect(d.natural).toBeGreaterThanOrEqual(20);
      expect(d.rush).toBeNull();
      expect(d.offlineSettleSeconds).toBeGreaterThan(0);
    }
    expect(incidentDef(content, MAULERS).meterOnly).toBe(true);
  });

  it('ships about ten new, unique achievements for creatures and loot', () => {
    const ids = content.achievements.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const mine = (content.loot as unknown as { achievements: { stat: string }[] }).achievements;
    expect(mine.length).toBeGreaterThanOrEqual(10);
    for (const t of ['surge', 'hollowed', 'glassbacks', 'maulers']) expect(mine.some((a) => a.stat === `incidentsResolved.${t}`)).toBe(true);
  });
});

describe('the incident timer', () => {
  it('rolls the new creatures once the homestead is big enough, surges in power rooms, never a Mauler', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 400 && seen.size < 3; seed++) {
      const s = calm(seed, 45);
      s.nextIncidentAt = 0;
      tickIncidentTimer(s, content, 1);
      const inc = s.incidents[0];
      if (!inc) continue;
      expect(inc.type).not.toBe(MAULERS);
      if (inc.type === SURGE) expect(roomDef(content, s.rooms.find((r) => r.id === inc.roomId)!).produces?.resource).toBe('power');
      if ([SURGE, HOLLOWED, GLASSBACKS].includes(inc.type)) seen.add(inc.type);
    }
    expect(seen.size).toBe(3);
  });

  it('keeps them out of small homesteads', () => {
    for (let seed = 1; seed < 60; seed++) {
      const s = calm(seed, 15);
      s.nextIncidentAt = 0;
      tickIncidentTimer(s, content, 1);
      for (const i of s.incidents) expect([SURGE, HOLLOWED, GLASSBACKS, MAULERS]).not.toContain(i.type);
    }
  });
});

describe('electrical surges', () => {
  it('drain power, spread along powered neighbours and burn out', () => {
    const s = calm(11, 20);
    nobodyHome(s);
    const gen = room(s, 'generator');
    const power = s.resources.power;
    startIncident(s, content, SURGE, gen);
    advance(s, content, 11);
    expect(s.resources.power).toBeLessThan(power);
    expect(s.incidents.some((i) => i.roomId === gen.id)).toBe(false);
    expect(s.incidents.length).toBeGreaterThan(0);
    for (const i of s.incidents) {
      const r = s.rooms.find((x) => x.id === i.roomId)!;
      expect(r.powered).toBe(true);
      expect(['door', 'elevator']).not.toContain(roomDef(content, r).category);
    }
    advance(s, content, 300);
    expect(s.incidents).toHaveLength(0);
  });

  it('never spread into an unpowered room', () => {
    const s = calm(11, 20);
    nobodyHome(s);
    const gen = room(s, 'generator');
    const inc = startIncident(s, content, SURGE, gen);
    for (const r of s.rooms) if (r !== gen) r.powered = false;
    // Spread directly (tick without the power update that would re-power them).
    inc.emptyFor = 100;
    s.incidents = [inc];
    tickIncidents(s, content, 1);
    expect(s.incidents).toHaveLength(0);
  });

  it('staffing the room grounds it', () => {
    const s = calm(11, 20);
    nobodyHome(s);
    const gen = room(s, 'generator');
    const crew = guards(s, gen, 3);
    startIncident(s, content, SURGE, gen);
    advance(s, content, 120);
    expect(s.incidents).toHaveLength(0);
    expect(s.stats['incidentsResolved.surge']).toBe(1);
    expect(crew.every((r) => !r.dead)).toBe(true);
    expect(s.achievements['surge_first']).toBeDefined();
  });
});

describe('the Hollowed', () => {
  it('deal taint as well as damage and leave taint behind', () => {
    const s = calm(11, 25);
    nobodyHome(s);
    const canteen = room(s, 'canteen');
    const crew = guards(s, canteen, 3);
    const inc = startIncident(s, content, HOLLOWED, canteen);
    inc.hp = inc.maxHp = 1500;
    advance(s, content, 3);
    expect(s.incidents).toContain(inc);
    expect(crew.every((r) => r.taint > 0)).toBe(true);
    const before = crew.map((r) => r.taint);
    advance(s, content, 200);
    expect(s.incidents).toHaveLength(0);
    expect(s.stats['incidentsResolved.hollowed']).toBe(1);
    const residue = incidentDef(content, HOLLOWED).residueTaint!;
    crew.forEach((r, i) => {
      expect(r.dead).toBe(false);
      expect(r.taint).toBeGreaterThanOrEqual(before[i]! + residue - 1e-6);
      expect(r.taint).toBeLessThan(r.maxHp);
    });
  });

  it('spread when left alone', () => {
    const s = calm(11, 25);
    nobodyHome(s);
    const canteen = room(s, 'canteen');
    startIncident(s, content, HOLLOWED, canteen);
    advance(s, content, 16);
    expect(s.incidents.some((i) => i.roomId === canteen.id)).toBe(false);
    expect(s.incidents.length).toBeGreaterThan(0);
  });
});

describe('Glassbacks', () => {
  it('drain power and jump rooms keeping their HP, then leave', () => {
    const s = calm(11, 40);
    nobodyHome(s);
    const gen = room(s, 'generator');
    const inc = startIncident(s, content, GLASSBACKS, gen);
    const power = s.resources.power;
    advance(s, content, incidentDef(content, GLASSBACKS).jumpSeconds! + 1);
    expect(s.resources.power).toBeLessThan(power);
    expect(inc.roomId).not.toBe(gen.id);
    expect(inc.visited).toHaveLength(2);
    expect(inc.hp).toBe(inc.maxHp);
    advance(s, content, 200);
    expect(s.incidents).toHaveLength(0);
    expect(s.stats['escaped.glassbacks']).toBe(1);
    expect(s.stats['incidentsResolved.glassbacks'] ?? 0).toBe(0);
  });

  it('can be squashed before they jump', () => {
    const s = calm(11, 40);
    nobodyHome(s);
    const gen = room(s, 'generator');
    const crew = guards(s, gen, 4, 'glare_lance');
    const inc = startIncident(s, content, GLASSBACKS, gen);
    inc.hp = inc.maxHp = 100;
    advance(s, content, 10);
    expect(s.incidents).toHaveLength(0);
    expect(s.stats['incidentsResolved.glassbacks']).toBe(1);
    expect(crew.every((r) => !r.dead)).toBe(true);
  });
});

describe('offline', () => {
  it('each creature goes away while you are gone, and nobody is hurt', () => {
    for (const type of [SURGE, HOLLOWED, GLASSBACKS, MAULERS]) {
      const s = calm(11, 45);
      nobodyHome(s);
      const gen = room(s, 'generator');
      if (type === MAULERS) startMauler(s, content);
      else startIncident(s, content, type, gen);
      const hp = hpOf(s);
      catchUp(s, content, s.lastRealTime + 2 * 3600 * 1000);
      expect(s.incidents, type).toHaveLength(0);
      expect(hpOf(s)).toEqual(hp);
      expect(s.residents.every((r) => !r.dead)).toBe(true);
      expect(s.stats['incidentsSettled']).toBe(1);
      expect(s.stats['deaths'] ?? 0).toBe(0);
    }
  });

  it('a Mauler that leaves offline keeps some of the meter', () => {
    const s = calm(11, 45);
    startMauler(s, content);
    catchUp(s, content, s.lastRealTime + 3600 * 1000);
    expect(s.stats['maulersEscaped']).toBe(1);
    // Reset to escapedResetTo when it left, then an hour's slow decay at most.
    expect(s.maulerMeter).toBeGreaterThan(maulerTuning(content).escapedResetTo - 0.05);
  });
});

describe('the Mauler meter', () => {
  it('stays empty and decays in a small homestead', () => {
    const s = calm(11, 10);
    s.maulerMeter = 0.5;
    advance(s, content, 600);
    expect(s.maulerMeter).toBeLessThan(0.5);
    expect(maulerStatus(s, content).dormant).toBe(true);
  });

  it('rises with population, scrip and door openings, and shows in the Threat Rating', () => {
    const s = calm(11, 60);
    tickMaulerMeter(s, content, 1, false); // first look at the door counters
    const small = calm(11, 45);
    tickMaulerMeter(small, content, 1, false);
    tickMaulerMeter(s, content, 3600, false);
    tickMaulerMeter(small, content, 3600, false);
    expect(s.maulerMeter).toBeGreaterThan(small.maulerMeter);
    const rich = calm(11, 60);
    rich.scrip = 40_000;
    tickMaulerMeter(rich, content, 1, false);
    tickMaulerMeter(rich, content, 3600, false);
    expect(rich.maulerMeter).toBeGreaterThan(s.maulerMeter);
    const m = s.maulerMeter;
    s.stats['expeditionsStarted'] = (s.stats['expeditionsStarted'] ?? 0) + 10;
    tickMaulerMeter(s, content, 1, false);
    expect(s.maulerMeter - m).toBeGreaterThan(9 * maulerTuning(content).perDoorOpening * maulerRateMult(s, content));
    const t = threatRating(s, content);
    expect(t.mauler.meter).toBeCloseTo(s.maulerMeter);
    expect(t.factors.some((f) => f.label.startsWith('Mauler meter'))).toBe(true);
  });

  it('rises slower with defense research and a staffed Watchtower', () => {
    const s = calm(11, 60);
    const base = maulerRateMult(s, content);
    s.research.done.push('fire_drills', 'door_gaskets');
    const researched = maulerRateMult(s, content);
    expect(researched).toBeLessThan(base);
    const tower: Room = { id: s.nextId++, type: 'watchtower', floor: TOPSIDE_FLOOR, x: content.balance.grid.starterShaftX - 3, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 };
    s.rooms.push(tower);
    for (const r of s.residents.slice(0, 2)) {
      r.roomId = tower.id;
      r.stats.sight = 10;
    }
    expect(maulerRateMult(s, content)).toBeLessThan(researched);
  });

  it('stirs, fills, and a telegraphed Mauler hits the door', () => {
    const s = calm(11, 60);
    tickMaulerMeter(s, content, 1, false);
    s.maulerMeter = maulerTuning(content).stirringAt - 1e-4;
    s.stats['expeditionsStarted'] = (s.stats['expeditionsStarted'] ?? 0) + 1;
    tickMaulerMeter(s, content, 1, false);
    expect(s.events.some((e) => (e as { type: string }).type === 'maulerStirring')).toBe(true);
    s.maulerMeter = 0.99999;
    s.stats['expeditionsStarted'] = (s.stats['expeditionsStarted'] ?? 0) + 5;
    advance(s, content, 1);
    const inc = s.incidents.find((i) => i.type === MAULERS);
    expect(inc).toBeDefined();
    expect(inc!.warning).toBeGreaterThanOrEqual(incidentDef(content, MAULERS).warnSeconds! - 1);
    expect(inc!.doorHp).toBeGreaterThan(0);
    expect(inc!.maxHp).toBeGreaterThan(5 * incidentDef(content, 'rustmen').hp!);
    expect(s.maulerMeter).toBe(0);
    expect(s.stats['maulers']).toBe(1);
    expect(maulerStatus(s, content).active).toBe(true);
    // The meter holds while it is inside.
    s.stats['expeditionsStarted'] = (s.stats['expeditionsStarted'] ?? 0) + 5;
    advance(s, content, 5);
    expect(s.maulerMeter).toBe(0);
  });

  it('a Mauler moves room to room and eats food where nobody fights', () => {
    const s = calm(11, 60);
    nobodyHome(s);
    const inc = startMauler(s, content)!;
    inc.warning = 0;
    inc.doorHp = 0;
    const food = s.resources.food;
    advance(s, content, 120);
    expect(inc.visited.length).toBeGreaterThan(2);
    expect(s.resources.food).toBeLessThan(food);
  });

  it('guards can bring a Mauler down for a big payout', () => {
    const s = calm(11, 60);
    nobodyHome(s);
    const door = room(s, 'door');
    const crew = guards(s, door, 6, 'glare_lance');
    const inc = startMauler(s, content)!;
    inc.warning = 0;
    inc.doorHp = 0;
    inc.hp = 300;
    const scrip = s.scrip;
    advance(s, content, 60);
    expect(s.incidents).toHaveLength(0);
    expect(s.stats['incidentsResolved.maulers']).toBe(1);
    expect(s.scrip).toBeGreaterThan(scrip + incidentDef(content, MAULERS).lootBase!);
    expect(crew.every((r) => !r.dead)).toBe(true);
  });

  it('never fills offline, and 1 s and 60 s steps agree', () => {
    const a = calm(11, 60);
    a.scrip = 30_000;
    tickMaulerMeter(a, content, 1, true);
    const b = structuredClone(a);
    a.maulerMeter = b.maulerMeter = 0.2;
    for (let i = 0; i < 3600; i++) settleIncidentsOffline(a, content, 1);
    for (let i = 0; i < 60; i++) settleIncidentsOffline(b, content, 60);
    expect(a.maulerMeter).toBeGreaterThan(0.2);
    expect(a.maulerMeter).toBeCloseTo(b.maulerMeter, 9);
    const c = calm(11, 60);
    tickMaulerMeter(c, content, 1, false);
    c.maulerMeter = 0.9;
    c.stats['questsStarted'] = 1000; // a very noisy absence
    catchUp(c, content, c.lastRealTime + 20 * 3600 * 1000);
    expect(c.maulerMeter).toBeLessThanOrEqual(maulerTuning(content).offlineCap);
    expect(c.incidents).toHaveLength(0);
  });
});

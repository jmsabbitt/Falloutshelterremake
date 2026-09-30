import { describe, expect, it } from 'vitest';
import { applyCommand, canPlace, catchUp, loadContent, newGame, population, storageCapacity, STAT_KEYS, upcomingReminders, type GameState, type Resident, type Room } from '../src/sim';
import { createResident, grantXp, maxStat, xpToNext } from '../src/sim/residents';
import { roomCapacity } from '../src/sim/commands';
import { autoAssign } from '../src/sim/systems/assign';
import { tickMastery } from '../src/sim/systems/traits';
import { tickTraining, trainingRequirement, trainingSpeed, trainingStatus, trainingTuning } from '../src/sim/systems/training';

const content = loadContent();
const T0 = 1_700_000_000_000;
const t = trainingTuning(content);

function game(seed = 11): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  return s;
}

/** Build a room of this type at the first free slot (unlocking it and paying for it). */
function build(s: GameState, type: string): Room {
  s.unlockedRooms.push(type);
  s.scrip = 100_000;
  for (let floor = 0; floor < content.balance.grid.floors; floor++) {
    for (let x = 0; x < content.balance.grid.cellsPerFloor; x++) {
      if (!canPlace(s, content, type, floor, x).ok) continue;
      const res = applyCommand(s, content, { type: 'build', roomType: type, floor, x });
      if (res.ok) return s.rooms[s.rooms.length - 1] as Room;
    }
  }
  throw new Error(`no slot for ${type}`);
}

function adults(s: GameState): Resident[] {
  return s.residents.filter((r) => !r.dead && !r.waiting && r.adultAt === null);
}

/** Put exactly these residents in a room. */
function staff(s: GameState, room: Room, crew: Resident[]): void {
  for (const r of s.residents) if (r.roomId === room.id) r.roomId = null;
  for (const r of crew) r.roomId = room.id;
}

describe('training content', () => {
  const training = content.roomList.filter((d) => d.category === 'training');

  it('has one 3-cell, mergeable training room per stat, with no production', () => {
    expect(training).toHaveLength(STAT_KEYS.length);
    expect(new Set(training.map((d) => d.stat))).toEqual(new Set(STAT_KEYS));
    for (const d of training) {
      expect(d.cells).toBe(3);
      expect(d.maxSegments).toBe(3);
      expect(d.capacityPerSegment).toBeGreaterThan(0);
      expect(d.produces).toBeUndefined();
      expect(d.buildable).toBe(true);
      expect(d.unlockPop).toBeGreaterThanOrEqual(15);
    }
    // Staggered: no two unlock at the same population, and the first by 25.
    expect(new Set(training.map((d) => d.unlockPop)).size).toBe(training.length);
    expect(Math.min(...training.map((d) => d.unlockPop))).toBeLessThanOrEqual(25);
  });

  it('ships its achievements', () => {
    const ids = content.achievements.map((a) => a.id);
    for (const id of ['train_first', 'train_25', 'stat_maxed', 'all_tens']) expect(ids).toContain(id);
  });
});

describe('training rooms', () => {
  it('raise a stat by 1 once the requirement is met, then start again', () => {
    const s = game();
    const room = build(s, 'weight_room');
    const r = adults(s)[0] as Resident;
    r.stats.brawn = 1;
    staff(s, room, [r]);
    const need = trainingRequirement(content, 1);
    expect(need).toBe(t.secondsPerPoint);
    tickTraining(s, content, need - 1);
    expect(r.stats.brawn).toBe(1);
    expect(trainingStatus(s, content, r)?.secondsLeft).toBeCloseTo(1, 5);
    s.events = [];
    tickTraining(s, content, 1);
    expect(r.stats.brawn).toBe(2);
    expect(r.training).toEqual({ stat: 'brawn', progress: 0 });
    expect(s.events).toContainEqual({ type: 'statTrained', residentId: r.id, stat: 'brawn', value: 2, source: 'training' });
    expect(s.stats['statsTrained']).toBe(1);
  });

  it('take longer the higher the stat is (20 min for 1→2, 3 h for 9→10)', () => {
    expect(trainingRequirement(content, 1)).toBe(20 * 60);
    expect(trainingRequirement(content, 5)).toBe(5 * 20 * 60);
    expect(trainingRequirement(content, 9)).toBe(3 * 3600);
    const s = game();
    const room = build(s, 'reading_room');
    const r = adults(s)[0] as Resident;
    r.stats.wits = 5;
    staff(s, room, [r]);
    tickTraining(s, content, trainingRequirement(content, 4));
    expect(r.stats.wits).toBe(5);
    tickTraining(s, content, trainingRequirement(content, 5) - trainingRequirement(content, 4));
    expect(r.stats.wits).toBe(6);
  });

  it('are faster with room level and company', () => {
    const s = game();
    const room = build(s, 'lounge');
    const [a, b, c] = adults(s) as [Resident, Resident, Resident];
    staff(s, room, [a]);
    expect(trainingSpeed(s, content, room)).toBeCloseTo(1);
    room.level = 2;
    expect(trainingSpeed(s, content, room)).toBeCloseTo(1 + t.levelBonus);
    room.level = 1;
    room.segments = 2;
    staff(s, room, [a, b, c]);
    expect(trainingSpeed(s, content, room)).toBeCloseTo(1 + 2 * t.crowdBonus);
  });

  it('cap at 10 and mark the resident maxed', () => {
    const s = game();
    const room = build(s, 'weight_room');
    const r = adults(s)[0] as Resident;
    r.stats.brawn = 9;
    staff(s, room, [r]);
    tickTraining(s, content, 100 * 3600);
    expect(r.stats.brawn).toBe(10);
    expect(s.stats['statsMaxed']).toBe(1);
    const status = trainingStatus(s, content, r);
    expect(status?.maxed).toBe(true);
    tickTraining(s, content, 100 * 3600);
    expect(r.stats.brawn).toBe(10);
  });

  it('keep training while the game is closed', () => {
    const s = game();
    const room = build(s, 'weight_room');
    const r = adults(s)[0] as Resident;
    r.stats.brawn = 1;
    staff(s, room, [r]);
    s.resources.power = 1e6;
    s.lastRealTime = T0;
    // 1→2 (20 min) + 2→3 (40 min) + 3→4 (60 min) = 2 hours.
    catchUp(s, content, T0 + 2 * 3600 * 1000 + 5000);
    expect(r.stats.brawn).toBe(4);
  });

  it('never train children, and a room without power pauses', () => {
    const s = game();
    const room = build(s, 'weight_room');
    const [kid, adult] = adults(s) as [Resident, Resident];
    kid.adultAt = s.time + 10_000;
    kid.stats.brawn = 1;
    adult.stats.brawn = 1;
    staff(s, room, [kid]);
    tickTraining(s, content, 3600);
    expect(kid.stats.brawn).toBe(1);
    expect(kid.training).toBeUndefined();
    staff(s, room, [adult]);
    room.powered = false;
    tickTraining(s, content, 3600);
    expect(adult.stats.brawn).toBe(1);
    expect(trainingStatus(s, content, adult)?.paused).toBe('power');
  });

  it('keep progress for the same stat after a break, and start over for another', () => {
    const s = game();
    const gym = build(s, 'weight_room');
    const books = build(s, 'reading_room');
    const r = adults(s)[0] as Resident;
    r.stats.brawn = 3;
    staff(s, gym, [r]);
    tickTraining(s, content, 600);
    r.roomId = null;
    tickTraining(s, content, 600);
    r.roomId = gym.id;
    expect(trainingStatus(s, content, r)?.progress).toBeCloseTo(600);
    r.roomId = books.id;
    tickTraining(s, content, 1);
    expect(r.training?.stat).toBe('wits');
  });

  it('are not jobs: no mastery, and auto-assign keeps whoever trains there', () => {
    const s = game();
    const room = build(s, 'weight_room');
    const r = adults(s)[0] as Resident;
    staff(s, room, [r]);
    tickMastery(s, content, 3600);
    expect(r.mastery['weight_room'] ?? 0).toBe(0);
    for (const x of s.residents) if (x.roomId !== room.id) x.roomId = null;
    autoAssign(s, content);
    expect(s.residents.filter((x) => x.roomId === room.id)).toHaveLength(1);
  });
});

describe('auto-assign', () => {
  it('fills jobs first, then couples into quarters while there are beds, then training', () => {
    const s = game();
    const gym = build(s, 'weight_room');
    for (const r of s.residents) r.roomId = null;
    // Plenty of idle adults: more than the job slots.
    for (let i = 0; i < 12; i++) {
      const r = createResident(s, content, { sex: i % 2 ? 'm' : 'f' });
      r.waiting = false;
      s.residents.push(r);
    }
    const jobs = s.rooms.filter((x) => ['generator', 'canteen', 'waterworks'].includes(x.type));
    autoAssign(s, content);
    for (const room of jobs) expect(s.residents.filter((r) => r.roomId === room.id).length).toBe(roomCapacity(content, room));
    const trainees = s.residents.filter((r) => r.roomId === gym.id);
    expect(trainees.length).toBeGreaterThan(0);
    for (const t of trainees) expect(t.stats.brawn).toBeLessThan(maxStat(content));
    const quarters = s.rooms.filter((x) => x.type === 'quarters');
    for (const q of quarters) {
      const here = s.residents.filter((r) => r.roomId === q.id);
      expect(here.filter((r) => r.sex === 'f').length).toBe(here.filter((r) => r.sex === 'm').length);
      for (const w of here.filter((r) => r.sex === 'f')) expect(w.pregnancy).toBeNull();
    }
  });

  it('pairs an unrelated couple into quarters when there are beds', () => {
    const s = game();
    // Enough men to fill every job (and no women among them to pair with).
    for (let i = 0; i < 6; i++) {
      const r = createResident(s, content, { sex: 'm' });
      r.waiting = false;
      s.residents.push(r);
    }
    while (storageCapacity(s, content, 'population') < population(s) + 4) build(s, 'quarters');
    for (const r of s.residents) r.roomId = null;
    const f = adults(s).find((r) => r.sex === 'f')!;
    const m = adults(s).find((r) => r.sex === 'm')!;
    // Everyone else is placed first, so the jobs are full when these two come in.
    f.waiting = m.waiting = true;
    autoAssign(s, content);
    f.waiting = m.waiting = false;
    autoAssign(s, content);
    expect(f.roomId).not.toBeNull();
    expect(f.roomId).toBe(m.roomId);
    expect(s.rooms.find((x) => x.id === f.roomId)!.type).toBe('quarters');
  });

  it('fills workshops after production jobs, by the stats their recipes use', () => {
    const s = game();
    const shop = build(s, 'weaponshop');
    const outfits = build(s, 'outfitshop');
    for (let i = 0; i < 10; i++) {
      const r = createResident(s, content, { sex: 'm' });
      r.waiting = false;
      s.residents.push(r);
    }
    for (const r of s.residents) r.roomId = null;
    autoAssign(s, content);
    expect(s.residents.filter((r) => r.roomId === shop.id).length).toBeGreaterThan(0);
    expect(s.residents.filter((r) => r.roomId === outfits.id).length).toBeGreaterThan(0);
    for (const room of s.rooms.filter((x) => ['generator', 'canteen', 'waterworks'].includes(x.type))) {
      expect(s.residents.filter((r) => r.roomId === room.id).length).toBe(roomCapacity(content, room));
    }
  });

  it('sends nobody to quarters when there is no bed for a baby', () => {
    const s = game();
    for (const r of s.residents) r.roomId = null;
    while (population(s) < storageCapacity(s, content, 'population')) {
      const r = createResident(s, content, {});
      r.waiting = false;
      s.residents.push(r);
    }
    autoAssign(s, content);
    const quarters = s.rooms.filter((x) => x.type === 'quarters').map((q) => q.id);
    expect(s.residents.some((r) => r.roomId !== null && quarters.includes(r.roomId))).toBe(false);
  });
});

describe('level milestones', () => {
  it('give +1 in the stat of the room worked in at every 10th level', () => {
    const s = game();
    const gen = s.rooms.find((x) => x.type === 'generator') as Room;
    const r = adults(s)[0] as Resident;
    r.roomId = gen.id;
    r.stats.brawn = 3;
    r.level = 9;
    r.xp = 0;
    s.events = [];
    grantXp(s, content, r, xpToNext(content, 9) + 1);
    expect(r.level).toBe(10);
    expect(r.stats.brawn).toBe(4);
    expect(s.events).toContainEqual({ type: 'statTrained', residentId: r.id, stat: 'brawn', value: 4, source: 'level' });
  });

  it('use the best stat when idle, and skip levels that are not milestones', () => {
    const s = game();
    const r = adults(s)[0] as Resident;
    r.roomId = null;
    for (const k of STAT_KEYS) r.stats[k] = 2;
    r.stats.fortune = 6;
    r.level = 4;
    r.xp = 0;
    grantXp(s, content, r, xpToNext(content, 4) + 1);
    expect(r.stats.fortune).toBe(6);
    r.level = 19;
    r.xp = 0;
    grantXp(s, content, r, xpToNext(content, 19) + 1);
    expect(r.level).toBe(20);
    expect(r.stats.fortune).toBe(7);
  });
});

describe('training reminders', () => {
  it('predict when the next trainee in a room gains a point', () => {
    const s = game();
    const room = build(s, 'weight_room');
    const r = adults(s)[0] as Resident;
    r.stats.brawn = 4;
    staff(s, room, [r]);
    const rem = upcomingReminders(s, content).find((x) => x.kind === 'training');
    expect(rem?.key).toBe(`training.${r.id}.brawn.5`);
    expect(rem?.inSeconds).toBe(trainingRequirement(content, 4));
  });
});

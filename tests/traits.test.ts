import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  catchUp,
  combatDamage,
  critRingSpeed,
  cycleSeconds,
  drainEvents,
  livingResidents,
  loadContent,
  newGame,
  roomStatTotal,
  type Content,
  type GameState,
  type Resident,
  type Room,
} from '../src/sim';
import { createChild, createResident } from '../src/sim/residents';
import { happinessTarget } from '../src/sim/systems/needs';
import { tickExpeditions } from '../src/sim/systems/exploration';
import {
  currentShift,
  homesteadHour,
  inheritTraits,
  masteryProgress,
  masteryTier,
  professionTitle,
  rollTraits,
  tickMastery,
  traitCourtshipMult,
  traitExplorerScripMult,
  traitHappiness,
  traitsCompatible,
  traitsContent,
  traitXpMult,
  workerMult,
  type TraitEffectKind,
} from '../src/sim/systems/traits';

const content = loadContent();
const T0 = 1_700_000_000_000;
const HOUR = 3600;
const tuning = traitsContent(content).tuning;
const [, JOURNEYMAN, MASTER] = tuning.masteryTierSeconds as [number, number, number];

function game(seed = 7): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  return s;
}

function room(s: GameState, type: string): Room {
  return s.rooms.find((r) => r.type === type)!;
}

/** Put exactly these residents in a room, everyone else out of it. */
function staff(s: GameState, target: Room, crew: Resident[]): void {
  for (const r of s.residents) if (r.roomId === target.id) r.roomId = null;
  for (const r of crew) r.roomId = target.id;
}

/** A room on the first deep floor (placed directly; excavation is stream B's). */
function deepRoom(s: GameState, type: string): Room {
  const r: Room = { id: s.nextId++, type, floor: content.balance.grid.floors, x: 7, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 };
  s.rooms.push(r);
  return r;
}

function withTuning(patch: Partial<typeof tuning>): Content {
  return { ...content, traits: { ...content.traits, tuning: { ...content.traits.tuning, ...patch } } } as Content;
}

describe('trait content', () => {
  const defs = traitsContent(content).traits;
  const kinds: TraitEffectKind[] = [
    'production', 'happiness', 'roomHappiness', 'combat', 'damageTaken', 'critRing', 'explorerScrip',
    'explorerTaint', 'explorerCheck', 'questCheck', 'xp', 'mastery', 'courtship',
  ];

  it('has at least 20 distinct, well-formed traits', () => {
    expect(defs.length).toBeGreaterThanOrEqual(20);
    expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length);
    expect(new Set(defs.map((d) => d.name)).size).toBe(defs.length);
    for (const d of defs) {
      expect(d.description.length).toBeGreaterThan(10);
      expect(d.summary.length).toBeGreaterThan(5);
      expect(d.weight).toBeGreaterThan(0);
      expect(d.effects.length).toBeGreaterThan(0);
      for (const e of d.effects) expect(kinds).toContain(e.kind);
      for (const x of d.excludes ?? []) {
        expect(defs.some((o) => o.id === x)).toBe(true);
        expect(traitsCompatible(content, [d.id, x])).toBe(false);
      }
    }
  });

  it('keeps production effects within about ±15%', () => {
    for (const d of defs) for (const e of d.effects) if (e.kind === 'production' || e.kind === 'combat') expect(Math.abs(e.value)).toBeLessThanOrEqual(0.15);
  });

  it('ships its achievements', () => {
    const ids = content.achievements.map((a) => a.id);
    expect(ids.filter((id) => id.startsWith('trait_')).length).toBeGreaterThanOrEqual(6);
  });
});

describe('rolling and inheriting traits', () => {
  it('rolls 1–3 compatible traits, deterministically', () => {
    const s = game(3);
    const seen = new Set<string>();
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 600; i++) {
      const t = rollTraits(s, content);
      expect(t.length).toBeGreaterThanOrEqual(1);
      expect(t.length).toBeLessThanOrEqual(3);
      expect(new Set(t).size).toBe(t.length);
      expect(traitsCompatible(content, t)).toBe(true);
      counts[t.length]!++;
      for (const id of t) seen.add(id);
    }
    expect(seen.size).toBe(traitsContent(content).traits.length);
    for (const n of [1, 2, 3]) expect(counts[n]).toBeGreaterThan(50);
    expect(rollTraits(game(9), content)).toEqual(rollTraits(game(9), content));
  });

  it('new residents arrive with traits', () => {
    const s = game();
    for (const r of s.residents) expect(r.traits.length).toBeGreaterThan(0);
    expect(createResident(s, content).traits.length).toBeGreaterThan(0);
  });

  it('children inherit parental traits', () => {
    const s = game();
    const [mother, father] = s.residents.filter((r) => r.sex === 'f').slice(0, 1).concat(s.residents.filter((r) => r.sex === 'm').slice(0, 1));
    mother!.traits = ['root_talker', 'dowser'];
    father!.traits = ['hothead'];
    const always = withTuning({ inheritChance: 1 });
    const child = createChild(s, always, mother!, father!);
    expect(child.traits.sort()).toEqual(['dowser', 'hothead', 'root_talker']);
    expect(s.stats['traitsInherited']).toBe(3);

    const never = withTuning({ inheritChance: 0 });
    for (let i = 0; i < 20; i++) {
      const t = inheritTraits(s, never, mother!, father!);
      expect(t.length).toBeGreaterThanOrEqual(1);
      expect(traitsCompatible(content, t)).toBe(true);
    }
    expect(s.stats['traitsInherited']).toBe(3);
  });

  it('never inherits a contradiction', () => {
    const s = game();
    const [a, b] = s.residents;
    a!.traits = ['night_owl', 'social'];
    b!.traits = ['early_bird', 'loner'];
    const always = withTuning({ inheritChance: 1 });
    for (let i = 0; i < 20; i++) {
      const t = inheritTraits(s, always, a!, b!);
      expect(traitsCompatible(content, t)).toBe(true);
      expect(t).toContain('night_owl');
      expect(t).toContain('social');
    }
  });

  it('about half of the parental traits pass on by default', () => {
    const s = game();
    const [a, b] = s.residents;
    a!.traits = ['root_talker', 'dowser', 'hothead'];
    b!.traits = ['quick_study', 'hard_case', 'steady_hands'];
    let passed = 0;
    const n = 400;
    for (let i = 0; i < n; i++) passed += inheritTraits(s, content, a!, b!).filter((t) => a!.traits.includes(t) || b!.traits.includes(t)).length;
    // Six parental traits at 50% each, capped at three per child.
    expect(passed / n).toBeGreaterThan(2);
    expect(passed / n).toBeLessThan(3);
  });

  it('gives legacy residents traits the first time mastery ticks', () => {
    const s = game();
    for (const r of s.residents) r.traits = [];
    tickMastery(s, content, 0);
    for (const r of s.residents) expect(r.traits.length).toBeGreaterThan(0);
    const before = s.residents.map((r) => [...r.traits]);
    advance(s, content, 5);
    expect(s.residents.slice(0, before.length).map((r) => r.traits)).toEqual(before);
  });
});

describe('trait effects through the real systems', () => {
  it('a Root Talker makes the canteen faster, and only the canteen', () => {
    const s = game();
    const canteen = room(s, 'canteen');
    const gen = room(s, 'generator');
    const cook = livingResidents(s)[0]!;
    cook.traits = ['hard_case'];
    staff(s, canteen, [cook]);
    staff(s, gen, []);
    const plain = roomStatTotal(s, content, canteen);
    const plainCycle = cycleSeconds(s, content, canteen);
    cook.traits = ['root_talker'];
    expect(roomStatTotal(s, content, canteen) / plain).toBeCloseTo(1.12, 6);
    expect(cycleSeconds(s, content, canteen)).toBeLessThan(plainCycle);
    staff(s, canteen, []);
    staff(s, gen, [cook]);
    expect(workerMult(s, content, cook, gen)).toBe(1);
  });

  it('real production is faster with the trait', () => {
    const run = (traits: string[]) => {
      const s = game(11);
      const canteen = room(s, 'canteen');
      const cook = livingResidents(s)[0]!;
      staff(s, canteen, [cook]);
      cook.traits = traits;
      s.resources.food = 0;
      advance(s, content, 60);
      return canteen.pool + (canteen.ready ? 1e9 : 0);
    };
    expect(run(['root_talker']) / run(['hard_case'])).toBeCloseTo(1.12, 2);
  });

  it('shift traits follow the homestead clock', () => {
    const s = game();
    const gen = room(s, 'generator');
    const r = livingResidents(s)[0]!;
    staff(s, gen, [r]);
    r.traits = ['night_owl'];
    s.time = 0; // founding is 08:00
    expect(homesteadHour(s, content)).toBeCloseTo(8);
    expect(currentShift(s, content)).toBe('morning');
    expect(workerMult(s, content, r, gen)).toBe(1);
    r.traits = ['early_bird'];
    expect(workerMult(s, content, r, gen)).toBeCloseTo(1.15);
    s.time = 13 * HOUR; // 21:00
    expect(currentShift(s, content)).toBe('night');
    expect(workerMult(s, content, r, gen)).toBe(1);
    r.traits = ['night_owl'];
    expect(workerMult(s, content, r, gen)).toBeCloseTo(1.15);
    s.time = 6 * HOUR; // 14:00
    expect(currentShift(s, content)).toBe('day');
    expect(workerMult(s, content, r, gen)).toBe(1);
  });

  it('Claustrophobic residents hate the deep; Deep Delvers love it', () => {
    const s = game();
    const deep = deepRoom(s, 'generator');
    const top = room(s, 'quarters');
    const r = livingResidents(s)[0]!;
    staff(s, deep, [r]);
    r.traits = ['hard_case'];
    const base = happinessTarget(s, content, r, false);
    r.traits = ['claustrophobic'];
    expect(happinessTarget(s, content, r, false)).toBe(base - 20);
    r.traits = ['deep_delver'];
    expect(happinessTarget(s, content, r, false)).toBe(Math.min(100, base + 10));
    expect(workerMult(s, content, r, deep)).toBeCloseTo(1.12);
    r.traits = ['claustrophobic'];
    staff(s, top, [r]);
    expect(traitHappiness(s, content, r)).toBe(5);
  });

  it('Social and Loner residents react to company', () => {
    const s = game();
    const gen = room(s, 'generator');
    gen.segments = 3; // room for a crowd
    const [a, b, c] = livingResidents(s);
    for (const x of [a, b, c]) x!.traits = ['hard_case'];
    staff(s, gen, [a!]);
    a!.traits = ['social'];
    expect(traitHappiness(s, content, a!)).toBe(-10);
    a!.traits = ['loner'];
    expect(traitHappiness(s, content, a!)).toBe(10);
    expect(workerMult(s, content, a!, gen)).toBeCloseTo(1.08);
    staff(s, gen, [a!, b!, c!]);
    expect(traitHappiness(s, content, a!)).toBe(-10);
    expect(workerMult(s, content, a!, gen)).toBe(1);
    a!.traits = ['social'];
    expect(traitHappiness(s, content, a!)).toBe(10);
  });

  it('a Sunny Disposition cheers up the room, a Grump sours it', () => {
    const s = game();
    const gen = room(s, 'generator');
    const [a, b] = livingResidents(s);
    a!.traits = ['hard_case'];
    b!.traits = ['sunny'];
    staff(s, gen, [a!, b!]);
    expect(traitHappiness(s, content, a!)).toBe(5);
    expect(traitHappiness(s, content, b!)).toBe(10);
    b!.traits = ['grump'];
    expect(traitHappiness(s, content, a!)).toBe(-3);
    expect(workerMult(s, content, b!, gen)).toBeCloseTo(1.1);
  });

  it('happiness drifts to the trait-adjusted target over time', () => {
    const s = game();
    const gen = room(s, 'generator');
    const [a, b] = livingResidents(s);
    a!.traits = ['lazybones'];
    b!.traits = ['hard_case'];
    staff(s, gen, [a!, b!]);
    a!.stats = { ...b!.stats };
    s.resources.food = s.resources.water = s.resources.power = 500;
    advance(s, content, 40 * 60);
    expect(a!.happiness - b!.happiness).toBeCloseTo(10, 0);
  });

  it('a Hothead hits incidents harder', () => {
    const s = game();
    const r = livingResidents(s)[0]!;
    r.traits = ['hard_case'];
    const base = combatDamage(content, r);
    r.traits = ['hothead'];
    expect(combatDamage(content, r) / base).toBeCloseTo(1.15);
    r.traits = ['egghead'];
    expect(combatDamage(content, r) / base).toBeCloseTo(0.9);
  });

  it('Steady Hands slow the crit ring', () => {
    const s = game();
    const r = livingResidents(s)[0]!;
    r.traits = ['hard_case'];
    const base = critRingSpeed(content, r);
    r.traits = ['steady_hands'];
    expect(critRingSpeed(content, r) / base).toBeCloseTo(0.85);
  });

  it('Glare-Hardened explorers take less taint', () => {
    const run = (traits: string[]) => {
      const s = game(5);
      const r = livingResidents(s)[0]!;
      r.stats.grit = 3;
      r.outfit = null;
      r.traits = traits;
      s.resources.medpatch = 0;
      s.resources.purge = 0;
      expect(applyCommand(s, content, { type: 'explore', residentId: r.id, regionId: 'dustbowl', medpatch: 0, purge: 0 }).ok).toBe(true);
      for (let i = 0; i < 60; i++) tickExpeditions(s, content, 60);
      return r.taint;
    };
    const plain = run(['hard_case']);
    expect(plain).toBeGreaterThan(0);
    expect(run(['glare_hardened'])).toBeLessThan(plain * 0.8);
  });

  it('exposes multipliers for the other hooks', () => {
    const s = game();
    const [a, b] = livingResidents(s);
    a!.traits = ['loose_change', 'quick_study'];
    b!.traits = ['romantic'];
    expect(traitExplorerScripMult(content, a!)).toBeCloseTo(1.2);
    expect(traitXpMult(content, a!)).toBeCloseTo(1.15);
    expect(traitCourtshipMult(content, a!, b!)).toBeCloseTo(1.3);
  });
});

describe('mastery', () => {
  it('tiers come from the tuning', () => {
    const s = game();
    const r = livingResidents(s)[0]!;
    expect(masteryTier(content, r, 'generator')).toBe(0);
    r.mastery.generator = JOURNEYMAN;
    expect(masteryTier(content, r, 'generator')).toBe(1);
    r.mastery.generator = MASTER - 1;
    expect(masteryTier(content, r, 'generator')).toBe(1);
    r.mastery.generator = MASTER;
    expect(masteryTier(content, r, 'generator')).toBe(2);
    expect(masteryProgress(content, r, 'generator')).toBe(1);
    r.mastery.generator = JOURNEYMAN / 2;
    expect(masteryProgress(content, r, 'generator')).toBeCloseTo(0.5);
  });

  it('adds the tier bonus to the worker', () => {
    const s = game();
    const gen = room(s, 'generator');
    const r = livingResidents(s)[0]!;
    r.traits = ['hard_case'];
    staff(s, gen, [r]);
    expect(workerMult(s, content, r, gen)).toBe(1);
    r.mastery.generator = JOURNEYMAN;
    expect(workerMult(s, content, r, gen)).toBeCloseTo(1 + tuning.masteryTierBonus[1]!);
    r.mastery.generator = MASTER;
    expect(workerMult(s, content, r, gen)).toBeCloseTo(1 + tuning.masteryTierBonus[2]!);
    // Masters take pride in their work.
    expect(traitHappiness(s, content, r)).toBe(tuning.masterHappiness);
    // Mastery belongs to the room type.
    expect(workerMult(s, content, r, room(s, 'canteen'))).toBe(1);
  });

  it('workers accrue seconds in their room type; the idle do not', () => {
    const s = game();
    const gen = room(s, 'generator');
    const [a, b, c] = livingResidents(s);
    a!.traits = ['hard_case'];
    b!.traits = ['quick_study'];
    c!.traits = ['restless'];
    staff(s, gen, [a!, b!]);
    staff(s, room(s, 'canteen'), [c!]);
    const idle = livingResidents(s).find((r) => r.roomId === null)!;
    advance(s, content, 100);
    expect(a!.mastery.generator).toBeCloseTo(100);
    expect(b!.mastery.generator).toBeCloseTo(125);
    expect(c!.mastery.canteen).toBeCloseTo(70);
    expect(Object.keys(idle.mastery)).toEqual([]);
  });

  it('crossing a tier fires masteryUp and bumps counters', () => {
    const s = game();
    const gen = room(s, 'generator');
    const r = livingResidents(s)[0]!;
    r.traits = ['hard_case'];
    staff(s, gen, [r]);
    r.mastery.generator = JOURNEYMAN - 5;
    drainEvents(s);
    advance(s, content, 10);
    const ups = drainEvents(s).filter((e) => e.type === 'masteryUp');
    expect(ups).toEqual([{ type: 'masteryUp', residentId: r.id, roomType: 'generator', tier: 1 }]);
    expect(s.stats['masteryUps']).toBe(1);
    expect(s.achievements['trait_mastery1']).toBeDefined();
    r.mastery.generator = MASTER - 5;
    advance(s, content, 10);
    expect(s.stats['masteryUps']).toBe(2);
    expect(s.stats['masteryMasters']).toBe(1);
    expect(s.stats['mostMasteries']).toBe(1);
  });

  it('accrues offline, and a 60 s step matches sixty 1 s steps', () => {
    const s = game();
    const gen = room(s, 'generator');
    const r = livingResidents(s)[0]!;
    r.traits = ['hard_case'];
    staff(s, gen, [r]);
    drainEvents(s);
    catchUp(s, content, T0 + 7 * HOUR * 1000);
    expect(r.mastery.generator).toBeCloseTo(7 * HOUR, 0);
    expect(masteryTier(content, r, 'generator')).toBe(1);
    expect(drainEvents(s).some((e) => e.type === 'masteryUp' && e.residentId === r.id)).toBe(true);

    const x = game();
    const y = game();
    for (const g of [x, y]) {
      const w = livingResidents(g)[0]!;
      staff(g, room(g, 'generator'), [w]);
    }
    tickMastery(x, content, 60);
    for (let i = 0; i < 60; i++) tickMastery(y, content, 1);
    expect(livingResidents(x)[0]!.mastery).toEqual(livingResidents(y)[0]!.mastery);
  });

  it('turns the best job into a title', () => {
    const s = game();
    const r = livingResidents(s)[0]!;
    r.mastery = {};
    expect(professionTitle(content, r)).toBeNull();
    r.mastery = { canteen: JOURNEYMAN + 1 };
    expect(professionTitle(content, r)).toBe('Journeyman Cook');
    r.mastery = { canteen: JOURNEYMAN + 1, generator: MASTER };
    expect(professionTitle(content, r)).toBe('Master Mechanic');
    r.mastery = { waterworks: 60 };
    expect(professionTitle(content, r)).toBe('Apprentice Plumber');
  });
});

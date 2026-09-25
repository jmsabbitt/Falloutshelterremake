import { describe, expect, it } from 'vitest';
import { advance, applyCommand, foundHomestead, legacyBreakdown, loadContent, newGame, type GameState } from '../src/sim';
import { incidentRate, productionMult } from '../src/sim/bonuses';
import { createResident } from '../src/sim/residents';
import { canFoundHomestead, charterStatus, rulesetsAvailable } from '../src/sim/systems/prestige';
import { foodDemandPerMin, happinessTarget, powerDemandPerMin, waterDemandPerMin } from '../src/sim/systems/needs';
import { ruleFlag, rulesetDef, rulesetMods, rulesetsContent, rulesLegacyMult } from '../src/sim/systems/rulesets';
import { scheduleIncident } from '../src/sim/systems/incidents';

const content = loadContent();
const T0 = 1_700_000_000_000;

function game(rules: string[] = [], survival = false, seed = 3): GameState {
  const s = newGame(content, { seed, now: T0, rules, survival });
  applyCommand(s, content, { type: 'admitAll' });
  return s;
}

/** A homestead that has met its Charter (cycle 1: Act 1 and 100 residents). */
function chartered(seed = 4, rules: string[] = [], survival = false): GameState {
  const s = game(rules, survival, seed);
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  while (s.residents.length < 100) {
    const r = createResident(s, content);
    r.waiting = false;
    s.residents.push(r);
  }
  s.peakPopulation = 100;
  s.questsDone = ['act1_1', 'act1_2', 'act1_3', 'act1_4', 'act1_5', 'act1_6'];
  s.stats['storyQuestsCompleted'] = 6;
  s.time = 5 * 86400;
  return s;
}

function adults(s: GameState, n: number): number[] {
  return s.residents.filter((r) => !r.dead && !r.waiting).slice(0, n).map((r) => r.id);
}

describe('ruleset content', () => {
  const defs = rulesetsContent(content).rulesets;
  it('has at least 8 rulesets, each harder-pays-more with an unlock and an effect', () => {
    expect(defs.length).toBeGreaterThanOrEqual(8);
    expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length);
    for (const d of defs) {
      expect(d.name && d.blurb).toBeTruthy();
      expect(d.legacyMult).toBeGreaterThan(1);
      expect(Object.keys(d.mods ?? {}).length + (d.flags?.length ?? 0)).toBeGreaterThan(0);
      const u = d.unlock as Record<string, unknown>;
      if ('achievement' in u) expect(content.achievements.some((a) => a.id === u['achievement'])).toBe(true);
      if ('quest' in u) expect((content.quests as unknown as { quests: { id: string }[] }).quests.some((q) => q.id === u['quest'])).toBe(true);
    }
    expect(rulesetsContent(content).survival.legacyMult).toBeGreaterThan(1.5);
  });

  it('is neutral with no rules', () => {
    const s = game();
    const m = rulesetMods(s, content);
    expect(m.production('food')).toBe(1);
    expect(m.incidentRate).toBe(1);
    expect(m.populationCap).toBe(Infinity);
    expect(ruleFlag(s, content, 'noRadio')).toBe(false);
    expect(rulesLegacyMult(s, content)).toBe(1);
  });
});

describe('ruleset effects', () => {
  it('Famine: less food made, more eaten, smaller pantry', () => {
    const base = game();
    const s = game(['famine']);
    expect(productionMult(s, content, 'food')).toBeCloseTo(productionMult(base, content, 'food') * 0.7);
    expect(productionMult(s, content, 'water')).toBeCloseTo(productionMult(base, content, 'water'));
    expect(foodDemandPerMin(s, content)).toBeCloseTo(foodDemandPerMin(base, content) * 1.3);
    expect(waterDemandPerMin(s, content)).toBeCloseTo(waterDemandPerMin(base, content));
    expect(rulesetMods(s, content).storage('food')).toBeCloseTo(0.6);
  });

  it('Lean Times halves scrip income', () => {
    expect(rulesetMods(game(['lean_times']), content).scripIncome).toBe(0.5);
  });

  it('Brownout: generators make less and rooms draw more', () => {
    const base = game();
    const s = game(['brownout']);
    expect(productionMult(s, content, 'power')).toBeCloseTo(productionMult(base, content, 'power') * 0.75);
    expect(powerDemandPerMin(s, content)).toBeCloseTo(powerDemandPerMin(base, content) * 1.2);
  });

  it('Short Fuse and Iron Door bring incidents around sooner', () => {
    expect(incidentRate(game(['short_fuse']), content)).toBeCloseTo(1.75);
    const iron = game(['iron_door']);
    expect(incidentRate(iron, content)).toBeCloseTo(1.25);
    const m = rulesetMods(iron, content);
    expect(m.doorHp).toBe(1.5);
    expect(m.raidWeight).toBe(3);
    // The same roll comes due sooner.
    const a = game([], false, 9);
    const b = game(['short_fuse'], false, 9);
    a.rng = [1, 2, 3, 4];
    b.rng = [1, 2, 3, 4];
    scheduleIncident(a, content);
    scheduleIncident(b, content);
    expect(b.nextIncidentAt).toBeCloseTo(a.nextIncidentAt / 1.75);
  });

  it('No Radio: no wanderers and no radio arrivals', () => {
    const run = (rules: string[]) => {
      const s = game(rules);
      s.nextIncidentAt = 1e12;
      s.nextWandererAt = 0;
      const radio = { id: s.nextId++, type: 'radio', floor: 2, x: 10, segments: 3, level: 3, pool: 0, ready: false, powered: true, timer: 1e9, job: null, banked: 0 };
      s.rooms.push(radio);
      for (const r of s.residents.slice(0, 3)) r.roomId = radio.id;
      s.rng = [5, 6, 7, 8];
      const before = s.residents.length;
      advance(s, content, 5);
      return s.residents.length - before;
    };
    expect(run([])).toBeGreaterThan(0);
    expect(run(['no_radio'])).toBe(0);
    expect(ruleFlag(game(['no_radio']), content, 'noRadio')).toBe(true);
  });

  it('Endless Night: everyone but Night Owls is glummer', () => {
    const base = game();
    const s = game(['endless_night']);
    expect(ruleFlag(s, content, 'endlessNight')).toBe(true);
    const r = s.residents[0]!;
    r.traits = [];
    const owl = s.residents[1]!;
    owl.traits = ['night_owl'];
    const b = base.residents[0]!;
    b.traits = [];
    b.roomId = null;
    r.roomId = null;
    owl.roomId = null;
    expect(happinessTarget(s, content, r, false)).toBe(happinessTarget(base, content, b, false) - 12);
    expect(happinessTarget(s, content, owl, false)).toBeGreaterThan(happinessTarget(s, content, r, false));
  });

  it('Glass Sky: dirtier water and harsher exploring', () => {
    const s = game(['glass_sky']);
    expect(ruleFlag(s, content, 'glassSky')).toBe(true);
    expect(productionMult(s, content, 'water')).toBeCloseTo(productionMult(game(), content, 'water') * 0.9);
    expect(rulesetMods(s, content).explorerTaint).toBe(1.5);
  });

  it('Skeleton Crew: capped at 60 (the Charter too), and everyone works harder', () => {
    const s = chartered(4, ['skeleton_crew']);
    expect(productionMult(s, content, 'food')).toBeCloseTo(productionMult(game(), content, 'food') * 1.2);
    // 100 living residents already (set up by hand); the charter asks for 60.
    expect(charterStatus(s, content).requirements[0]!.need).toBe(60);
    const extra = createResident(s, content);
    s.residents.push(extra);
    expect(applyCommand(s, content, { type: 'admit', residentId: extra.id })).toEqual({ ok: false, reason: 'Skeleton Crew: the charter allows 60 residents' });
    // No arrivals at the cap either.
    s.nextWandererAt = 0;
    const n = s.residents.length;
    advance(s, content, 2);
    expect(s.residents.length).toBe(n);
  });

  it('stacks rulesets multiplicatively', () => {
    const s = game(['famine', 'glass_sky', 'skeleton_crew']);
    expect(rulesetMods(s, content).production('food')).toBeCloseTo(0.7 * 1.2);
    expect(rulesetMods(s, content).production('water')).toBeCloseTo(0.9 * 1.2);
  });
});

describe('unlocks and founding', () => {
  it('only offers unlocked rulesets', () => {
    const s = chartered();
    const ids = rulesetsAvailable(s, content).map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(['famine', 'lean_times', 'brownout']));
    expect(ids).not.toContain('no_radio');
    expect(ids).not.toContain('short_fuse');
    expect(ids).not.toContain('endless_night');
    s.achievements['incidents_50'] = 1;
    s.questsDone.push('act2_finale');
    expect(rulesetsAvailable(s, content).map((d) => d.id)).toEqual(expect.arrayContaining(['short_fuse', 'endless_night']));
    s.legacy.cycle = 3;
    expect(rulesetsAvailable(s, content).length).toBe(rulesetsContent(content).rulesets.length);
  });

  it('refuses locked rules and Survival, accepts unlocked ones', () => {
    const s = chartered();
    const party = adults(s, 3);
    const locked = foundHomestead(s, content, { siteId: 'plot7', partyIds: party, heirloomIds: [], now: T0, rules: ['no_radio'] });
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.reason).toMatch(/No Radio is locked/);
    expect(canFoundHomestead(s, content, { survival: true })).toMatch(/Survival is locked/);
    expect(canFoundHomestead(s, content, { rules: ['nope'] })).toMatch(/no such ruleset/);
    const ok = foundHomestead(s, content, { siteId: 'plot7', partyIds: party, heirloomIds: [], now: T0, rules: ['famine', 'famine', 'lean_times'] });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.state.rules).toEqual({ ids: ['famine', 'lean_times'], survival: false });
    expect(ok.state.stats['foundedUnder.famine']).toBe(1);
    expect(ok.state.stats['rulesetsStacked']).toBe(2);
    expect(ok.state.mode).toBe('normal');
    // Starting scrip is a grant, not income.
    expect(ok.state.scrip).toBe(content.balance.start.scrip);
    // The rules shape the new homestead right away.
    expect(productionMult(ok.state, content, 'food')).toBeLessThan(1);
  });

  it('Survival unlocks from the second homestead', () => {
    const s = chartered();
    s.legacy.cycle = 2;
    s.questsDone.push('act2_finale');
    const res = foundHomestead(s, content, { siteId: 'plot7', partyIds: adults(s, 2), heirloomIds: [], now: T0, survival: true, rules: ['no_radio'] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.rules).toEqual({ ids: ['no_radio'], survival: true });
  });
});

describe('Legacy multipliers', () => {
  it('pay more for the rules of the homestead being left, stacking with the site', () => {
    const plain = chartered(4);
    const hard = chartered(4, ['famine', 'lean_times'], true);
    hard.legacy.siteId = 'dry_wells';
    plain.legacy.siteId = 'dry_wells';
    const a = legacyBreakdown(plain, content);
    const b = legacyBreakdown(hard, content);
    expect(a.rulesMult).toBe(1);
    expect(b.rulesMult).toBeCloseTo(1 + 0.3 + 0.2 + 0.75);
    expect(b.subtotal).toBe(a.subtotal);
    expect(b.total).toBe(Math.floor(b.subtotal * 1.25 * b.rulesMult));
    const res = foundHomestead(hard, content, { siteId: 'plot7', partyIds: adults(hard, 2), heirloomIds: [], now: T0 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.legacy).toBe(b.total);
      // The new homestead was founded without rules: its own score is unmultiplied.
      expect(rulesLegacyMult(res.state, content)).toBe(1);
    }
  });
});

describe('Survival', () => {
  it('blocks revives', () => {
    for (const survival of [false, true]) {
      const s = game([], survival);
      s.scrip = 10000;
      const r = s.residents[0]!;
      r.dead = true;
      r.hp = 0;
      const res = applyCommand(s, content, { type: 'revive', residentId: r.id });
      expect(res.ok).toBe(!survival);
      if (survival) expect(r.dead).toBe(true);
    }
  });

  it('tracks the Survival population and Charter counters for achievements', () => {
    const s = chartered(4, ['famine'], true);
    advance(s, content, 1);
    expect(s.stats['survivalPeakPopulation']).toBe(100);
    expect(s.stats['charterUnder.famine']).toBe(1);
    expect(s.stats['charterUnder.survival']).toBe(1);
    expect(s.stats['chartersUnderRules']).toBe(1);
    expect(s.achievements['survival_100']).toBeDefined();
    expect(s.achievements['rules_famine']).toBeDefined();
    expect(rulesetDef(content, 'famine')?.name).toBe('Famine');
  });
});

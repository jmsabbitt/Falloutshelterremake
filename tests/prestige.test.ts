import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  buildCost,
  canBuyPerk,
  catchUp,
  charterStatus,
  deserialize,
  foundHomestead,
  foundingLimits,
  legacyBreakdown,
  legacyContent,
  loadContent,
  newGame,
  outpostTotals,
  perkValue,
  serialize,
  upgradeCost,
  type GameState,
} from '../src/sim';
import { createResident } from '../src/sim/residents';
import { cycleSeconds } from '../src/sim/systems/production';

const content = loadContent();
const T0 = 1_700_000_000_000;

/** A homestead that has met its first Charter: 100 residents and Act 1 done. */
function chartered(seed = 4): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
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
  s.stats['bossesDefeated'] = 6;
  s.stats['contractsCompleted'] = 10;
  s.recipes = ['rivet_rifle'];
  s.fragments = { peacemaker: 2 };
  s.achievements = { first_steps: 10 };
  s.time = 5 * 86400;
  s.residents[0]!.level = 25;
  s.residents[0]!.weapon = 'coilgun';
  s.items.push({ id: s.nextId++, defId: 'scattergun' });
  return s;
}

function adults(s: GameState, n: number): number[] {
  return s.residents.filter((r) => !r.dead && !r.waiting).slice(0, n).map((r) => r.id);
}

describe('charter', () => {
  it('is not ready for a new homestead', () => {
    const s = newGame(content, { seed: 1, now: T0 });
    expect(charterStatus(s, content).ready).toBe(false);
    expect(foundHomestead(s, content, { siteId: 'plot7', partyIds: [1], heirloomIds: [], now: T0 }).ok).toBe(false);
  });

  it('needs population and the Act 1 finale', () => {
    const s = chartered();
    expect(charterStatus(s, content).ready).toBe(true);
    s.questsDone = s.questsDone.filter((q) => q !== 'act1_6');
    expect(charterStatus(s, content).ready).toBe(false);
  });

  it('announces itself once', () => {
    const s = chartered();
    advance(s, content, 1);
    expect(s.stats['chartersReached']).toBe(1);
    advance(s, content, 1);
    expect(s.stats['chartersReached']).toBe(1);
  });
});

describe('founding', () => {
  it('scores Legacy from this homestead', () => {
    const s = chartered();
    const b = legacyBreakdown(s, content);
    expect(b.total).toBeGreaterThan(50);
    expect(b.lines.find((l) => l.label.startsWith('Story'))?.points).toBe(30);
  });

  it('starts a new homestead with the party, heirlooms and carried progress', () => {
    const old = chartered();
    const before = JSON.stringify(old);
    const party = adults(old, 3);
    const heirloom = old.items[0]!.id;
    const res = foundHomestead(old, content, { siteId: 'dry_wells', partyIds: party, heirloomIds: [heirloom], now: T0 + 1000 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // The old state is untouched.
    expect(JSON.stringify(old)).toBe(before);
    const s = res.state;
    expect(s.legacy.cycle).toBe(2);
    expect(s.legacy.siteId).toBe('dry_wells');
    expect(s.legacy.points).toBe(res.legacy);
    expect(s.time).toBe(0);
    expect(s.lastRealTime).toBe(T0 + 1000);
    // Founders keep who they are; strangers make up the starting crew.
    const names = party.map((id) => old.residents.find((r) => r.id === id)!.firstName);
    expect(s.residents.slice(0, 3).map((r) => r.firstName)).toEqual(names);
    expect(s.residents[0]!.level).toBe(25);
    expect(s.residents[0]!.weapon).toBe('coilgun');
    expect(s.residents.length).toBe(content.balance.start.waitingResidents);
    expect(s.residents.every((r) => r.waiting)).toBe(true);
    expect(new Set(s.residents.map((r) => r.id)).size).toBe(s.residents.length);
    expect(s.items.map((i) => i.defId)).toEqual(['scattergun']);
    // Knowledge and profile carry over; the build does not.
    expect(s.recipes).toContain('rivet_rifle');
    expect(s.fragments['peacemaker']).toBe(2);
    expect(s.questsDone).toContain('act1_6');
    expect(s.achievements['first_steps']).toBeDefined();
    expect(s.rooms.length).toBe(newGame(content, { seed: 9, now: T0 }).rooms.length);
    // The old homestead is an outpost now.
    expect(s.legacy.outposts.length).toBe(1);
    expect(s.legacy.outposts[0]!.population).toBe(97);
    expect(s.legacy.history[0]!.peakPopulation).toBe(100);
    expect(s.stats['homesteadsFounded']).toBe(1);
  });

  it('enforces party and heirloom limits', () => {
    const old = chartered();
    const lim = foundingLimits(old, content);
    expect(foundHomestead(old, content, { siteId: 'plot7', partyIds: adults(old, lim.party + 1), heirloomIds: [], now: T0 }).ok).toBe(false);
    expect(foundHomestead(old, content, { siteId: 'plot7', partyIds: adults(old, lim.party), heirloomIds: [], now: T0 }).ok).toBe(true);
    expect(foundHomestead(old, content, { siteId: 'nowhere', partyIds: adults(old, 1), heirloomIds: [], now: T0 }).ok).toBe(false);
  });

  it('refuses while parties are away', () => {
    const old = chartered();
    old.expeditions.push({} as never);
    expect(foundHomestead(old, content, { siteId: 'plot7', partyIds: adults(old, 1), heirloomIds: [], now: T0 }).ok).toBe(false);
  });

  it('harder sites pay more Legacy', () => {
    const a = chartered();
    a.legacy.siteId = 'the_scorch';
    const b = chartered();
    expect(legacyBreakdown(a, content).total).toBeGreaterThan(legacyBreakdown(b, content).total);
  });

  it('the next charter scores only the new homestead', () => {
    const res = foundHomestead(chartered(), content, { siteId: 'plot7', partyIds: adults(chartered(), 2), heirloomIds: [], now: T0 });
    if (!res.ok) throw new Error(res.reason);
    const b = legacyBreakdown(res.state, content);
    expect(b.lines.find((l) => l.label.startsWith('Story'))?.points).toBe(0);
    expect(charterStatus(res.state, content).ready).toBe(false);
  });

  it('survives a save round trip', () => {
    const res = foundHomestead(chartered(), content, { siteId: 'plot7', partyIds: adults(chartered(), 2), heirloomIds: [], now: T0 });
    if (!res.ok) throw new Error(res.reason);
    expect(deserialize(serialize(res.state)).legacy).toEqual(res.state.legacy);
  });
});

describe('perks', () => {
  function withPoints(points: number): GameState {
    const s = newGame(content, { seed: 3, now: T0 });
    s.legacy.points = points;
    return s;
  }

  it('costs Legacy and respects ranks and requirements', () => {
    const s = withPoints(100);
    expect(applyCommand(s, content, { type: 'buyPerk', perkId: 'endowment' }).ok).toBe(true);
    expect(s.legacy.points).toBe(95);
    expect(s.legacy.perks['endowment']).toBe(1);
    expect(canBuyPerk(s, content, 'auto_collect')).toMatch(/needs/);
    const poor = withPoints(1);
    expect(applyCommand(poor, content, { type: 'buyPerk', perkId: 'endowment' }).ok).toBe(false);
  });

  it('every perk has a known effect and a description', () => {
    for (const p of legacyContent(content).perks) {
      expect(p.costs.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(10);
      expect(legacyContent(content).branches.some((b) => b.id === p.branch)).toBe(true);
    }
    expect(legacyContent(content).perks.length).toBeGreaterThanOrEqual(15);
  });

  it('Union Rates lowers build and upgrade costs', () => {
    const s = withPoints(0);
    const gen = s.rooms.find((r) => r.type === 'generator')!;
    const build = buildCost(s, content, 'quarters');
    const up = upgradeCost(content, gen, s)!;
    s.legacy.perks['union_rates'] = 2;
    expect(buildCost(s, content, 'quarters')).toBeLessThan(build);
    expect(upgradeCost(content, gen, s)!).toBeLessThan(up);
  });

  it('Overtime and site modifiers change production speed', () => {
    const s = withPoints(0);
    applyCommand(s, content, { type: 'admitAll' });
    const gen = s.rooms.find((r) => r.type === 'generator')!;
    const w = s.rooms.find((r) => r.type === 'waterworks')!;
    const r = s.residents[0]!;
    applyCommand(s, content, { type: 'assign', residentId: r.id, roomId: gen.id });
    applyCommand(s, content, { type: 'assign', residentId: s.residents[1]!.id, roomId: w.id });
    const t = cycleSeconds(s, content, gen);
    s.legacy.perks['overtime'] = 5;
    expect(cycleSeconds(s, content, gen)).toBeLessThan(t);
    const tw = cycleSeconds(s, content, w);
    s.legacy.siteId = 'dry_wells';
    expect(cycleSeconds(s, content, w)).toBeGreaterThan(tw);
  });

  it('Conveyor Belts collect finished batches while playing', () => {
    const s = withPoints(0);
    applyCommand(s, content, { type: 'admitAll' });
    const gen = s.rooms.find((r) => r.type === 'generator')!;
    gen.ready = true;
    s.legacy.perks['auto_collect'] = 1;
    advance(s, content, 1);
    expect(gen.ready).toBe(false);
  });

  it('perks carry into the next homestead and apply at founding', () => {
    const old = chartered();
    old.legacy.perks = { endowment: 2, prefab_kit: 1, hardy_folk: 1 };
    const res = foundHomestead(old, content, { siteId: 'plot7', partyIds: adults(old, 1), heirloomIds: [], now: T0 });
    if (!res.ok) throw new Error(res.reason);
    const s = res.state;
    expect(s.scrip).toBe(content.balance.start.scrip + 3000);
    expect(s.rooms.some((r) => r.type === 'storeroom')).toBe(true);
    expect(s.rooms.some((r) => r.type === 'clinic')).toBe(true);
    const stranger = s.residents[1]!;
    expect(stranger.maxHp).toBe(content.balance.resident.baseHp + perkValue(s, content, 'baseHp'));
    expect(foundingLimits(s, content).party).toBe(legacyContent(content).founding.partyBase);
  });
});

describe('outposts', () => {
  it('trickle scrip, salvage and crates, offline too, up to a day', () => {
    const res = foundHomestead(chartered(), content, { siteId: 'plot7', partyIds: adults(chartered(), 3), heirloomIds: [], now: T0 });
    if (!res.ok) throw new Error(res.reason);
    const s = res.state;
    expect(applyCommand(s, content, { type: 'collectOutposts' }).ok).toBe(false);
    catchUp(s, content, T0 + 3 * 3600_000);
    const t = outpostTotals(s);
    expect(t.scrip).toBeGreaterThan(0);
    const scrip = s.scrip;
    expect(applyCommand(s, content, { type: 'collectOutposts' }).ok).toBe(true);
    expect(s.scrip).toBeGreaterThan(scrip);
    // Capped at a day's worth however long you stay away.
    catchUp(s, content, T0 + 60 * 3600_000);
    const o = s.legacy.outposts[0]!;
    expect(o.stored.scrip).toBeLessThanOrEqual(o.rates.scrip * legacyContent(content).outposts.storageHours + 1e-6);
  });
});

describe('saves', () => {
  it('migrates a v4 save to the first homestead of a chain', () => {
    const s = newGame(content, { seed: 2, now: T0 });
    const file = JSON.parse(serialize(s));
    file.version = 4;
    delete file.state.legacy;
    const back = deserialize(JSON.stringify(file));
    expect(back.legacy.cycle).toBe(1);
    expect(back.legacy.points).toBe(0);
  });
});

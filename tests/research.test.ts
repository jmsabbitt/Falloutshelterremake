import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  bonus,
  catchUp,
  foundHomestead,
  idleAdults,
  loadContent,
  newGame,
  type Content,
  type GameState,
  type Resident,
  type Room,
} from '../src/sim';
import { refreshUnlocks } from '../src/sim/economy';
import { createResident } from '../src/sim/residents';
import {
  AUTO_MEDIC_SECONDS,
  canResearch,
  carryResearch,
  doResearch,
  keptResearch,
  labRate,
  nodeStatus,
  researchContent,
  researchRate,
  supplyBotRound,
  tickResearch,
} from '../src/sim/systems/research';

const content = loadContent();
const T0 = 1_700_000_000_000;
const tree = researchContent(content);
const P = tree.tuning.pointsPerWitsHour;

function game(seed = 7): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  return s;
}

/** A Lab placed directly (placement is not what these tests are about). */
function addLab(s: GameState, level = 1, segments = 1): Room {
  const room: Room = { id: s.nextId++, type: 'lab', floor: 20, x: 0, segments, level, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 };
  s.rooms.push(room);
  return room;
}

/** Put residents with these Wits (no traits, no mastery, no outfit) in a room. */
function staff(s: GameState, room: Room, wits: number[]): Resident[] {
  return wits.map((w) => {
    const r = createResident(s, content);
    r.waiting = false;
    r.stats.wits = w;
    r.traits = [];
    r.mastery = {};
    r.outfit = null;
    r.roomId = room.id;
    s.residents.push(r);
    return r;
  });
}

/** A copy of the content with the research tree swapped for an edited one. */
function withTree(edit: (t: ReturnType<typeof researchContent>) => void): Content {
  const research = JSON.parse(JSON.stringify(content.research));
  edit(research);
  return { ...content, research };
}

// Every effect key the sim understands (PerkEffect | ResearchEffect).
const EFFECTS = new Set([
  'buildDiscount', 'childStats', 'baseHp', 'xpBonus', 'productionSpeed', 'autoCollect', 'offlineHours', 'carryLimit',
  'explorerScrip', 'questSlots', 'contractOffers', 'questHeal', 'outpostOutput', 'crateLuck',
  'batchBank', 'productionPower', 'productionFood', 'productionWater', 'productionMedpatch', 'productionPurge',
  'incidentDefense', 'doorHp', 'medicine', 'autoAssign', 'autoMedic', 'researchSpeed', 'digSpeed', 'explorerTaint',
]);

describe('research content', () => {
  it('has at least 30 nodes over 6 branches and tiers 1-4', () => {
    expect(tree.nodes.length).toBeGreaterThanOrEqual(30);
    expect(tree.branches.map((b) => b.id).sort()).toEqual(['automation', 'deep', 'defense', 'expeditions', 'industry', 'medicine']);
    for (const b of tree.branches) {
      const tiers = new Set(tree.nodes.filter((n) => n.branch === b.id).map((n) => n.tier));
      expect([...tiers].sort(), b.id).toEqual([1, 2, 3, 4]);
    }
  });

  it('keeps the shared ids', () => {
    const ids = tree.nodes.map((n) => n.id);
    for (const id of ['deep_survey', 'deep_survey_2', 'deep_survey_3', 'deep_survey_4', 'geothermal_taps', 'fungal_farming', 'ore_refining', 'deep_bracing', 'batch_bank_1', 'batch_bank_2', 'batch_bank_3', 'personnel_office', 'supply_bots', 'conveyors']) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
    const effect = (id: string) => tree.nodes.find((n) => n.id === id)?.effects?.map((e) => e.effect) ?? [];
    expect(effect('deep_bracing')).toContain('incidentDefense');
    expect(effect('personnel_office')).toContain('autoAssign');
    expect(effect('supply_bots')).toContain('autoMedic');
    expect(effect('conveyors')).toContain('autoCollect');
    expect(tree.nodes.find((n) => n.id === 'geothermal_taps')?.unlocks?.rooms).toEqual(['geothermal']);
    expect(tree.nodes.find((n) => n.id === 'fungal_farming')?.unlocks?.rooms).toEqual(['fungalfarm']);
    expect(tree.nodes.find((n) => n.id === 'ore_refining')?.unlocks?.rooms).toEqual(['refinery']);
  });

  it('is a well-formed tree: known effects, earlier-tier requirements, rising costs', () => {
    const byId = new Map(tree.nodes.map((n) => [n.id, n]));
    for (const n of tree.nodes) {
      expect(n.name.length, n.id).toBeGreaterThan(0);
      expect(n.description.length, n.id).toBeGreaterThan(20);
      for (const e of n.effects ?? []) expect(EFFECTS.has(e.effect), `${n.id}: ${e.effect}`).toBe(true);
      for (const req of n.requires) {
        const r = byId.get(req);
        expect(r, `${n.id} needs ${req}`).toBeDefined();
        expect(r!.tier, `${n.id} needs ${req}`).toBeLessThan(n.tier);
      }
    }
    const maxCost = (t: number) => Math.max(...tree.nodes.filter((n) => n.tier === t).map((n) => n.cost));
    const minCost = (t: number) => Math.min(...tree.nodes.filter((n) => n.tier === t).map((n) => n.cost));
    for (const t of [2, 3, 4]) expect(minCost(t)).toBeGreaterThan(maxCost(t - 1));
  });

  it('rooms gated by research point at the node that unlocks them', () => {
    for (const n of tree.nodes) {
      for (const id of n.unlocks?.rooms ?? []) {
        const def = content.rooms[id];
        if (def) expect(def.requiresResearch, id).toBe(n.id); // deep rooms arrive with stream B
      }
    }
    for (const def of content.roomList) {
      if (def.requiresResearch) expect(tree.nodes.some((n) => n.id === def.requiresResearch), def.id).toBe(true);
    }
  });

  it('the "complete everything" achievement matches the tree', () => {
    const all = content.achievements.find((a) => a.id === 'research_all');
    expect(all?.target).toBe(tree.nodes.length);
    const deep = content.achievements.find((a) => a.id === 'research_deep');
    expect(deep?.target).toBe(tree.nodes.filter((n) => n.branch === 'deep').length);
  });

  it('meets the pacing targets for reference Labs', () => {
    // One Lab at population 25: one segment, two workers with Wits 4 and 3.
    const firstLab = 7 * P * tree.tuning.levelMult[0]!;
    const tier1 = tree.nodes.filter((n) => n.tier === 1).map((n) => n.cost / firstLab);
    expect(Math.min(...tier1)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...tier1)).toBeLessThanOrEqual(2);
    // Two upgraded Labs: level 2, three segments, six workers with Wits 5 each.
    const twoLabs = 2 * 30 * P * tree.tuning.levelMult[1]!;
    for (const n of tree.nodes.filter((x) => x.tier === 4)) {
      expect(n.cost / twoLabs, n.id).toBeGreaterThanOrEqual(20);
      expect(n.cost / twoLabs, n.id).toBeLessThanOrEqual(48);
    }
  });
});

describe('research rate', () => {
  it('is zero without a staffed Lab', () => {
    const s = game();
    expect(researchRate(s, content)).toBe(0);
    addLab(s);
    expect(researchRate(s, content)).toBe(0);
  });

  it('is Wits × points per Wits-hour × the level multiplier', () => {
    const s = game();
    const lab = addLab(s);
    staff(s, lab, [5, 3]);
    expect(researchRate(s, content)).toBeCloseTo(8 * P);
    lab.level = 2;
    expect(researchRate(s, content)).toBeCloseTo(8 * P * tree.tuning.levelMult[1]!);
    lab.level = 3;
    expect(labRate(s, content, lab)).toBeCloseTo(8 * P * tree.tuning.levelMult[2]!);
  });

  it('adds up over Labs and grows with researchSpeed', () => {
    const s = game();
    staff(s, addLab(s), [4, 4]);
    staff(s, addLab(s), [2]);
    expect(researchRate(s, content)).toBeCloseTo(10 * P);
    s.research.done.push('punch_cards');
    expect(researchRate(s, content)).toBeCloseTo(10 * P * (1 + bonus(s, content, 'researchSpeed')));
    expect(bonus(s, content, 'researchSpeed')).toBeGreaterThan(0);
  });

  it('stops when the Lab is unpowered or on fire', () => {
    const s = game();
    const lab = addLab(s);
    staff(s, lab, [6]);
    lab.powered = false;
    expect(researchRate(s, content)).toBe(0);
    lab.powered = true;
    s.incidents.push({ id: 999, type: 'fire', roomId: lab.id } as GameState['incidents'][number]);
    expect(researchRate(s, content)).toBe(0);
  });

  it('children in the Lab do not research', () => {
    const s = game();
    const lab = addLab(s);
    const [kid] = staff(s, lab, [9]);
    kid!.adultAt = s.time + 3600;
    expect(researchRate(s, content)).toBe(0);
  });
});

describe('researching', () => {
  it('needs points and requirements', () => {
    const s = game();
    expect(canResearch(s, content, 'nope')).toMatch(/no such/);
    expect(canResearch(s, content, 'batch_bank_1')).toMatch(/more research points/);
    expect(nodeStatus(s, content, 'batch_bank_1')).toBe('open');
    expect(nodeStatus(s, content, 'personnel_office')).toBe('locked');
    s.research.points = 1e6;
    expect(nodeStatus(s, content, 'batch_bank_1')).toBe('ready');
    expect(canResearch(s, content, 'personnel_office')).toMatch(/needs Holding Tanks first/);
    expect(applyCommand(s, content, { type: 'research', nodeId: 'personnel_office' }).ok).toBe(false);
  });

  it('spends the cost, records the node, fires the event and bumps stats', () => {
    const s = game();
    const node = tree.nodes.find((n) => n.id === 'batch_bank_1')!;
    s.research.points = node.cost + 5;
    expect(applyCommand(s, content, { type: 'research', nodeId: 'batch_bank_1' }).ok).toBe(true);
    expect(s.research.points).toBeCloseTo(5);
    expect(s.research.done).toEqual(['batch_bank_1']);
    expect(s.events.some((e) => e.type === 'researchDone' && e.nodeId === 'batch_bank_1')).toBe(true);
    expect(s.stats['researchDone']).toBe(1);
    expect(s.stats['researchDone.automation']).toBe(1);
    expect(nodeStatus(s, content, 'batch_bank_1')).toBe('done');
    expect(canResearch(s, content, 'batch_bank_1')).toMatch(/already/);
    expect(bonus(s, content, 'batchBank')).toBe(1);
    advance(s, content, 1);
    expect(s.achievements['research_first']).toBeDefined();
  });

  it('a whole branch can be researched in order and its effects stack', () => {
    const s = game();
    s.research.points = 1e7;
    for (const n of [...tree.nodes].sort((a, b) => a.tier - b.tier)) expect(doResearch(s, content, n.id), n.id).toBeNull();
    expect(s.research.done.length).toBe(tree.nodes.length);
    expect(bonus(s, content, 'batchBank')).toBe(3);
    expect(bonus(s, content, 'incidentDefense')).toBeLessThanOrEqual(0.8);
    expect(s.stats['researchTier4']).toBe(tree.nodes.filter((n) => n.tier === 4).length);
  });

  it('unlocks gated rooms right away', () => {
    const c = { ...content, roomList: content.roomList.map((d) => (d.id === 'radio' ? { ...d, requiresResearch: 'deep_survey' } : d)) };
    c.rooms = Object.fromEntries(c.roomList.map((d) => [d.id, d]));
    const s = game();
    s.unlockedRooms = s.unlockedRooms.filter((id) => id !== 'radio');
    s.peakPopulation = 30;
    refreshUnlocks(s, c);
    expect(s.unlockedRooms).not.toContain('radio');
    s.research.points = 1000;
    expect(doResearch(s, c, 'deep_survey')).toBeNull();
    expect(s.unlockedRooms).toContain('radio');
  });

  it('unlocks exploration regions', () => {
    const c = withTree((t) => {
      t.nodes.find((n) => n.id === 'pack_frames')!.unlocks = { regions: ['far_reach'] };
    });
    const s = game();
    s.research.points = 1000;
    expect(doResearch(s, c, 'pack_frames')).toBeNull();
    expect(s.regionsUnlocked).toContain('far_reach');
    expect(s.regionsUnlocked).toContain('dustbowl');
  });
});

describe('accrual', () => {
  it('Labs earn points continuously while playing', () => {
    const s = game();
    const lab = addLab(s);
    staff(s, lab, [5, 5]);
    tickResearch(s, content, 1800, false);
    expect(s.research.points).toBeCloseTo(5 * P);
    expect(s.stats['researchPoints']).toBeCloseTo(5 * P);
  });

  it('one 60 s offline step equals sixty 1 s steps', () => {
    const a = game();
    const b = game();
    staff(a, addLab(a), [7, 3]);
    staff(b, addLab(b), [7, 3]);
    tickResearch(a, content, 60, true);
    for (let i = 0; i < 60; i++) tickResearch(b, content, 1, true);
    expect(a.research.points).toBeCloseTo(b.research.points, 9);
    expect(a.research.points).toBeGreaterThan(0);
  });

  it('keeps accruing through offline catch-up', () => {
    const s = game();
    const lab = addLab(s);
    staff(s, lab, [6, 6]);
    s.resources.power = 1e6; // keep the Lab lit
    advance(s, content, 1);
    const rate = researchRate(s, content);
    expect(rate).toBeGreaterThan(0);
    const before = s.research.points;
    catchUp(s, content, s.lastRealTime + 3 * 3600 * 1000);
    expect(s.research.points - before).toBeGreaterThan(rate * 3 * 0.9);
    expect(s.research.points - before).toBeLessThan(rate * 3 * 1.1);
  });
});

describe('automation', () => {
  it('Personnel Office assigns idle residents every minute, online only', () => {
    const s = game();
    const idle = idleAdults(s).length;
    expect(idle).toBeGreaterThan(0);
    s.time = 59;
    advance(s, content, 2);
    expect(idleAdults(s).length).toBe(idle); // not researched yet

    s.research.done.push('batch_bank_1', 'personnel_office');
    s.time = 120;
    tickResearch(s, content, 1, true); // offline: nothing
    expect(idleAdults(s).length).toBe(idle);
    tickResearch(s, content, 1, false);
    expect(idleAdults(s).length).toBeLessThan(idle);
    expect(s.stats['officeAssignments']).toBe(idle - idleAdults(s).length);
    expect(s.events.some((e) => e.type === 'autoAssigned')).toBe(true);
  });

  it('Personnel Office does not fire between minutes', () => {
    const s = game();
    s.research.done.push('batch_bank_1', 'personnel_office');
    const idle = idleAdults(s).length;
    s.time = 30;
    tickResearch(s, content, 1, false);
    expect(idleAdults(s).length).toBe(idle);
  });

  function hurt(s: GameState): Resident[] {
    const home = s.residents.filter((r) => !r.dead && !r.waiting);
    home[0]!.hp = home[0]!.maxHp * 0.2;
    home[1]!.hp = home[1]!.maxHp * 0.4;
    return [home[0]!, home[1]!];
  }

  it('supply bots heal the worst-hurt resident with a Med-Patch, one per round', () => {
    const s = game();
    s.research.done.push('supply_bots');
    s.resources.medpatch = 5;
    const [worst, next] = hurt(s);
    const hp0 = worst!.hp;
    const hp1 = next!.hp;
    s.time = AUTO_MEDIC_SECONDS * 3;
    tickResearch(s, content, 1, false);
    expect(worst!.hp).toBeCloseTo(Math.min(worst!.maxHp, hp0 + worst!.maxHp * content.balance.medical.medpatchHeal));
    expect(next!.hp).toBe(hp1);
    expect(s.resources.medpatch).toBe(4);
    expect(s.stats['supplyBotTreatments']).toBe(1);
    expect(s.stats['medpatchesUsed']).toBe(1);
  });

  it('supply bots apply the medicine bonus, like the heal command', () => {
    const a = game();
    const b = game();
    for (const s of [a, b]) {
      s.research.done.push('supply_bots', 'triage_cards');
      s.resources.medpatch = 1;
    }
    const [ra] = hurt(a);
    const [rb] = hurt(b);
    supplyBotRound(a, content);
    applyCommand(b, content, { type: 'heal', residentId: rb!.id });
    expect(ra!.hp).toBeCloseTo(rb!.hp);
    expect(bonus(a, content, 'medicine')).toBeGreaterThan(0);
  });

  it('supply bots purge Glare-sickness above a quarter of max HP', () => {
    const s = game();
    s.research.done.push('supply_bots');
    s.resources.purge = 2;
    const r = s.residents.find((x) => !x.dead && !x.waiting)!;
    r.taint = r.maxHp * 0.2;
    expect(supplyBotRound(s, content)).toBe(false); // below the line
    r.taint = r.maxHp * 0.4;
    r.hp = Math.min(r.hp, r.maxHp - r.taint);
    const b = game();
    const rb = b.residents.find((x) => x.id === r.id)!;
    rb.taint = r.taint;
    rb.hp = r.hp;
    b.resources.purge = 1;
    expect(supplyBotRound(s, content)).toBe(true);
    applyCommand(b, content, { type: 'purge', residentId: rb.id });
    expect(r.taint).toBeCloseTo(rb.taint);
    expect(s.resources.purge).toBe(1);
  });

  it('supply bots need stock, the research, and stay home while offline', () => {
    const s = game();
    const [worst] = hurt(s);
    const hp = worst!.hp;
    s.resources.medpatch = 3;
    s.time = AUTO_MEDIC_SECONDS;
    tickResearch(s, content, 1, false);
    expect(worst!.hp).toBe(hp); // not researched
    s.research.done.push('supply_bots');
    tickResearch(s, content, 1, true);
    expect(worst!.hp).toBe(hp); // offline
    s.resources.medpatch = 0;
    tickResearch(s, content, 1, false);
    expect(worst!.hp).toBe(hp); // no stock
    s.resources.medpatch = 1;
    tickResearch(s, content, 1, false);
    expect(worst!.hp).toBeGreaterThan(hp);
  });

  it('supply bots ignore residents who are away', () => {
    const s = game();
    s.research.done.push('supply_bots');
    s.resources.medpatch = 3;
    const [worst, next] = hurt(s);
    worst!.expedition = 12345;
    const hp = next!.hp;
    supplyBotRound(s, content);
    expect(next!.hp).toBeGreaterThan(hp);
  });
});

describe('carryover', () => {
  function veteran(): GameState {
    const s = game(4);
    while (s.residents.length < 100) {
      const r = createResident(s, content);
      r.waiting = false;
      s.residents.push(r);
    }
    s.peakPopulation = 100;
    s.questsDone = ['act1_1', 'act1_2', 'act1_3', 'act1_4', 'act1_5', 'act1_6'];
    s.time = 5 * 86400;
    s.research.done = ['dynamo_tuning', 'ring_main', 'batch_bank_1', 'personnel_office', 'deep_survey', 'deep_survey_2', 'triage_cards', 'modular_construction', 'fire_drills', 'patch_press'];
    s.research.points = 1000;
    return s;
  }

  function found(s: GameState): GameState {
    const party = s.residents.filter((r) => !r.dead && !r.waiting).slice(0, 2).map((r) => r.id);
    const res = foundHomestead(s, content, { siteId: 'plot7', partyIds: party, heirloomIds: [], now: T0 });
    if (!res.ok) throw new Error(res.reason);
    return res.state;
  }

  it('research is lost by default', () => {
    const next = found(veteran());
    expect(next.research).toEqual({ points: 0, done: [] });
  });

  it('Institutional Memory keeps the cheapest share, and the same share of points', () => {
    const old = veteran();
    old.legacy.perks['institutional_memory'] = 2; // 40%
    const next = found(old);
    // 10 done → 4 kept: the four cheapest (45, 50, 50, 50).
    expect([...next.research.done].sort()).toEqual(['dynamo_tuning', 'fire_drills', 'patch_press', 'triage_cards']);
    expect(next.research.points).toBe(400);
  });

  it('only keeps a node if its requirements are kept too', () => {
    const old = game();
    old.research.done = ['ring_main', 'door_gaskets'];
    // ring_main without dynamo_tuning can't be kept, even at 100%.
    expect(keptResearch(old, content, 1)).toEqual(['door_gaskets']);
    old.research.done = ['dynamo_tuning', 'ring_main', 'modular_construction', 'door_gaskets'];
    expect(keptResearch(old, content, 0.5)).toEqual(['door_gaskets', 'dynamo_tuning']);
    expect(keptResearch(old, content, 0.75)).toEqual(['door_gaskets', 'dynamo_tuning', 'ring_main']);
    expect(keptResearch(old, content, 0)).toEqual([]);
  });

  it('kept research applies in the new homestead', () => {
    const old = veteran();
    const next = newGame(content, { seed: 3, now: T0 });
    next.legacy.perks['institutional_memory'] = 3;
    carryResearch(old, next, content);
    expect(next.research.done.length).toBe(6);
    expect(bonus(next, content, 'batchBank')).toBe(1);
    expect(bonus(next, content, 'researchKeep')).toBeCloseTo(0.6);
  });
});

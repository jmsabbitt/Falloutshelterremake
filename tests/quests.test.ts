import { describe, expect, it } from 'vitest';
import {
  abilityFor,
  advance,
  applyCommand,
  availableQuests,
  catchUp,
  critMultiplier,
  critRingSpeed,
  deserialize,
  effectiveMaxHp,
  livingResidents,
  loadContent,
  newGame,
  officeSlots,
  serialize,
  type GameState,
  type Quest,
} from '../src/sim';
import { playQuest } from '../src/sim/systems/questBot';
import { refreshContracts } from '../src/sim/systems/quests';

const content = loadContent();
const T0 = 1_700_000_000_000;

/** A calm game with a Command Office and a sturdy, armed crew. */
function withOffice(seed = 5): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.scrip = 50_000;
  s.resources.medpatch = 20;
  s.rooms.push({ id: s.nextId++, type: 'office', floor: 0, x: content.balance.grid.starterShaftX + 7, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 });
  for (const r of s.residents) {
    r.level = 6;
    r.maxHp = 140;
    r.hp = 140;
    r.weapon = 'scrap_carbine';
  }
  return s;
}

function party(s: GameState, n = 3): number[] {
  return livingResidents(s).slice(0, n).map((r) => r.id);
}

function quest(s: GameState): Quest {
  return s.quests[0] as Quest;
}

function arrive(s: GameState): void {
  advance(s, content, quest(s).travelTotal + 1);
}

describe('starting quests', () => {
  it('needs a Command Office', () => {
    const s = newGame(content, { seed: 1, now: T0 });
    applyCommand(s, content, { type: 'admitAll' });
    expect(officeSlots(s, content)).toBe(0);
    const r = applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: party(s, 1), medpatch: 0 });
    expect(r.ok).toBe(false);
  });

  it('sends the party away and takes supplies', () => {
    const s = withOffice();
    expect(availableQuests(s, content).map((q) => q.id)).toContain('act1_1');
    const ids = party(s);
    const before = s.resources.medpatch;
    const r = applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: ids, medpatch: 3 });
    expect(r).toEqual({ ok: true });
    expect(s.resources.medpatch).toBe(before - 3);
    for (const id of ids) {
      const res = s.residents.find((x) => x.id === id)!;
      expect(res.quest).toBe(quest(s).id);
      expect(res.roomId).toBeNull();
    }
    // Away residents are not in the homestead.
    expect(livingResidents(s).some((r) => ids.includes(r.id))).toBe(false);
    expect(applyCommand(s, content, { type: 'assign', residentId: ids[0]!, roomId: s.rooms[2]!.id }).ok).toBe(false);
    expect(applyCommand(s, content, { type: 'explore', residentId: ids[0]!, regionId: 'dustbowl', medpatch: 0, purge: 0 }).ok).toBe(false);
  });

  it('respects office slots and party size', () => {
    const s = withOffice();
    const ids = livingResidents(s).map((r) => r.id);
    expect(applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: ids.slice(0, 4), medpatch: 0 }).ok).toBe(false);
    expect(applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: ids.slice(0, 1), medpatch: 0 }).ok).toBe(true);
    // One slot at level 1, and a story quest can't run twice.
    expect(applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: ids.slice(1, 2), medpatch: 0 }).ok).toBe(false);
  });
});

describe('on site', () => {
  it('arrives after travel and enters the start room', () => {
    const s = withOffice();
    applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: party(s), medpatch: 2 });
    expect(quest(s).status).toBe('travelling');
    arrive(s);
    expect(quest(s).status).toBe('onsite');
    expect(quest(s).rooms.find((r) => r.kind === 'start')?.visited).toBe(true);
  });

  it('moves only along links and fights on entry', () => {
    const s = withOffice();
    applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: party(s), medpatch: 2 });
    arrive(s);
    expect(applyCommand(s, content, { type: 'questMove', questId: quest(s).id, roomId: 'e' }).ok).toBe(false);
    expect(applyCommand(s, content, { type: 'questMove', questId: quest(s).id, roomId: 'b' }).ok).toBe(true);
    advance(s, content, 3.5);
    const q = quest(s);
    expect(q.roomId).toBe('b');
    expect(q.enemies.length).toBeGreaterThan(0);
    // Can't leave mid-fight.
    expect(applyCommand(s, content, { type: 'questMove', questId: q.id, roomId: 'a' }).ok).toBe(false);
    for (let i = 0; i < 120 && q.enemies.length; i++) advance(s, content, 0.5);
    expect(q.enemies.length).toBe(0);
    expect(q.rooms.find((r) => r.id === 'b')?.cleared).toBe(true);
  });

  it('crits multiply damage and empty the meter', () => {
    expect(critMultiplier(content, 1)).toBeGreaterThan(critMultiplier(content, 0));
    const s = withOffice();
    applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: party(s, 1), medpatch: 0 });
    arrive(s);
    applyCommand(s, content, { type: 'questMove', questId: quest(s).id, roomId: 'b' });
    advance(s, content, 3.1);
    const q = quest(s);
    const m = q.party[0]!;
    expect(applyCommand(s, content, { type: 'questCrit', questId: q.id, residentId: m.residentId, quality: 1 }).ok).toBe(false);
    m.crit = 1;
    const hp = q.enemies.reduce((a, e) => a + e.hp, 0);
    expect(applyCommand(s, content, { type: 'questCrit', questId: q.id, residentId: m.residentId, quality: 1 }).ok).toBe(true);
    expect(m.crit).toBe(0);
    expect(q.enemies.reduce((a, e) => a + e.hp, 0)).toBeLessThan(hp);
  });

  it('Sight slows the crit ring', () => {
    const s = withOffice();
    const [a, b] = livingResidents(s);
    a!.stats.sight = 1;
    b!.stats.sight = 10;
    expect(critRingSpeed(content, b!)).toBeLessThan(critRingSpeed(content, a!));
  });

  it('abilities follow the best stat and go on cooldown', () => {
    const s = withOffice();
    const r = livingResidents(s)[0]!;
    for (const k of Object.keys(r.stats) as (keyof typeof r.stats)[]) r.stats[k] = 1;
    r.stats.grit = 9;
    expect(abilityFor(content, r).id).toBe('hold_the_line');
    applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: [r.id], medpatch: 0 });
    arrive(s);
    const q = quest(s);
    q.party[0]!.abilityCooldown = 0;
    expect(applyCommand(s, content, { type: 'questAbility', questId: q.id, residentId: r.id }).ok).toBe(false); // no fight yet
    applyCommand(s, content, { type: 'questMove', questId: q.id, roomId: 'b' });
    advance(s, content, 3.1);
    expect(applyCommand(s, content, { type: 'questAbility', questId: q.id, residentId: r.id }).ok).toBe(true);
    expect(q.party[0]!.taunt).toBeGreaterThan(0);
    expect(q.party[0]!.abilityCooldown).toBeGreaterThan(0);
  });

  it('a stun interrupts a telegraphed attack', () => {
    const s = withOffice();
    const r = livingResidents(s)[0]!;
    for (const k of Object.keys(r.stats) as (keyof typeof r.stats)[]) r.stats[k] = 1;
    r.stats.brawn = 10;
    applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: [r.id], medpatch: 0 });
    arrive(s);
    const q = quest(s);
    q.enemies = [];
    const room = q.rooms.find((x) => x.id === 'b')!;
    room.enemies = ['rust_brute'];
    applyCommand(s, content, { type: 'questMove', questId: q.id, roomId: 'b' });
    advance(s, content, 3.1);
    const brute = q.enemies[0]!;
    brute.hp = brute.maxHp = 10_000;
    brute.abilityTimers[0] = 0.01;
    advance(s, content, 0.1);
    expect(brute.windup).not.toBeNull();
    q.party[0]!.abilityCooldown = 0;
    expect(applyCommand(s, content, { type: 'questAbility', questId: q.id, residentId: r.id }).ok).toBe(true);
    expect(brute.windup).toBeNull();
    expect(brute.stunned).toBeGreaterThan(0);
  });

  it('events check the party’s best stat', () => {
    const s = withOffice();
    applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: party(s), medpatch: 0 });
    arrive(s);
    const q = quest(s);
    q.pendingEvent = 'relay_panel';
    expect(applyCommand(s, content, { type: 'questMove', questId: q.id, roomId: 'b' }).ok).toBe(false);
    expect(applyCommand(s, content, { type: 'questChoose', questId: q.id, option: 1 }).ok).toBe(true);
    expect(q.pendingEvent).toBeNull();
  });

  it('nothing happens on site while offline, but travel continues', () => {
    const s = withOffice();
    applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: party(s), medpatch: 0 });
    catchUp(s, content, T0 + 10 * 60_000);
    const q = quest(s);
    expect(q.status).toBe('onsite');
    applyCommand(s, content, { type: 'questMove', questId: q.id, roomId: 'b' });
    const t = q.onsiteTime;
    catchUp(s, content, T0 + 3 * 3600_000);
    expect(q.onsiteTime).toBe(t);
    expect(q.moving).not.toBeNull();
  });
});

describe('finishing', () => {
  it('a full run completes the quest, pays out and unlocks contracts', () => {
    const s = withOffice(9);
    const ids = party(s);
    applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: ids, medpatch: 5 });
    const q = quest(s);
    arrive(s);
    playQuest(s, content, q.id);
    expect(q.outcome).toBe('success');
    expect(q.status).toBe('returning');
    advance(s, content, q.travelTotal + 1);
    expect(q.status).toBe('returned');
    const scrip = s.scrip;
    const crates = s.crates.standard;
    expect(applyCommand(s, content, { type: 'collectQuest', questId: q.id }).ok).toBe(true);
    expect(s.quests.length).toBe(0);
    expect(s.questsDone).toContain('act1_1');
    expect(s.scrip).toBeGreaterThan(scrip);
    expect(s.crates.standard).toBeGreaterThan(crates);
    for (const id of ids) expect(s.residents.find((r) => r.id === id)!.quest).toBeNull();
    expect(availableQuests(s, content).map((x) => x.id)).not.toContain('act1_1');
    advance(s, content, 1);
    expect(s.contracts.offers.length).toBe(3);
  });

  it('a wiped party comes home as bodies', () => {
    const s = withOffice();
    const ids = party(s, 1);
    applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: ids, medpatch: 0 });
    arrive(s);
    const q = quest(s);
    const r = s.residents.find((x) => x.id === ids[0])!;
    r.hp = 1;
    applyCommand(s, content, { type: 'questMove', questId: q.id, roomId: 'b' });
    for (let i = 0; i < 200 && !q.outcome; i++) advance(s, content, 0.5);
    expect(q.outcome).toBe('failed');
    expect(r.dead).toBe(true);
    advance(s, content, q.travelTotal + 1);
    applyCommand(s, content, { type: 'collectQuest', questId: q.id });
    expect(r.quest).toBeNull();
    expect(r.dead).toBe(true);
    expect(s.questsDone).not.toContain('act1_1');
  });

  it('abandoning keeps finds but not the reward', () => {
    const s = withOffice();
    applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: party(s), medpatch: 0 });
    arrive(s);
    const q = quest(s);
    expect(applyCommand(s, content, { type: 'abandonQuest', questId: q.id }).ok).toBe(true);
    expect(q.outcome).toBe('abandoned');
    advance(s, content, q.travelTotal + 1);
    applyCommand(s, content, { type: 'collectQuest', questId: q.id });
    expect(s.questsDone).not.toContain('act1_1');
  });

  it('downed members get back up after the fight', () => {
    const s = withOffice();
    applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: party(s), medpatch: 0 });
    arrive(s);
    const q = quest(s);
    applyCommand(s, content, { type: 'questMove', questId: q.id, roomId: 'b' });
    advance(s, content, 3.1);
    const m = q.party[0]!;
    const r = s.residents.find((x) => x.id === m.residentId)!;
    m.downed = true;
    r.hp = 0;
    for (let i = 0; i < 200 && q.enemies.length; i++) advance(s, content, 0.5);
    expect(m.downed).toBe(false);
    expect(r.hp).toBeGreaterThan(0);
    expect(r.hp).toBeLessThan(effectiveMaxHp(r));
  });
});

describe('contracts', () => {
  it('name their bounty and can be run', () => {
    const s = withOffice(3);
    refreshContracts(s, content);
    expect(s.contracts.offers.length).toBe(3);
    const offer = s.contracts.offers[0]!;
    expect(offer.bounty.items?.length ?? Object.keys(offer.bounty.fragments ?? {}).length).toBeGreaterThan(0);
    expect(applyCommand(s, content, { type: 'startContract', contractId: offer.id, residentIds: party(s), medpatch: 5 }).ok).toBe(true);
    expect(s.contracts.offers.length).toBe(2);
    const q = quest(s);
    arrive(s);
    playQuest(s, content, q.id);
    expect(q.outcome).toBe('success');
    advance(s, content, q.travelTotal + 1);
    const items = s.items.length;
    applyCommand(s, content, { type: 'collectQuest', questId: q.id });
    if (offer.bounty.items) expect(s.items.length).toBeGreaterThan(items);
  });
});

describe('saves', () => {
  it('round-trips a quest in progress', () => {
    const s = withOffice();
    applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: party(s), medpatch: 2 });
    arrive(s);
    applyCommand(s, content, { type: 'questMove', questId: quest(s).id, roomId: 'b' });
    advance(s, content, 4);
    const back = deserialize(serialize(s));
    expect(back.quests).toEqual(s.quests);
    expect(back.residents.map((r) => r.quest)).toEqual(s.residents.map((r) => r.quest));
  });

  it('migrates a v3 save', () => {
    const s = newGame(content, { seed: 2, now: T0 });
    const file = JSON.parse(serialize(s));
    file.version = 3;
    delete file.state.quests;
    delete file.state.questsDone;
    delete file.state.contracts;
    for (const r of file.state.residents) delete r.quest;
    const back = deserialize(JSON.stringify(file));
    expect(back.quests).toEqual([]);
    expect(back.contracts.offers).toEqual([]);
    expect(back.residents.every((r) => r.quest === null)).toBe(true);
  });
});

describe('Halcyon Fizz on quests', () => {
  it('gets a party to the site now, and home now', () => {
    const s = withOffice();
    s.fizz = 2;
    applyCommand(s, content, { type: 'startQuest', questId: 'act1_1', residentIds: party(s), medpatch: 2 });
    const q = quest(s);
    expect(q.status).toBe('travelling');
    expect(applyCommand(s, content, { type: 'fizz', target: 'quest', id: q.id, pay: 'fizz' }).ok).toBe(true);
    expect(q.status).toBe('onsite');
    expect(q.enemies.length + q.rooms.length).toBeGreaterThan(0);
    applyCommand(s, content, { type: 'abandonQuest', questId: q.id });
    expect(q.status).toBe('returning');
    const scrip = s.scrip;
    s.fizz = 0;
    expect(applyCommand(s, content, { type: 'fizz', target: 'quest', id: q.id, pay: 'scrip' }).ok).toBe(true);
    expect(q.status).toBe('returned');
    expect(s.scrip).toBeLessThan(scrip);
    expect(applyCommand(s, content, { type: 'fizz', target: 'quest', id: q.id, pay: 'scrip' }).ok).toBe(false);
  });
});

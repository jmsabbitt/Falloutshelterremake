// Act 4 "Rent Day", the homestead network in the field (systems/network.ts),
// and the endings (systems/endings.ts, endings.json): content, reachability,
// the true ending's conditions, the epilogue slides, the lifetime story across
// foundings, the save migration and the achievements.
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  charterFor,
  charterStatus,
  deserialize,
  endingOptions,
  epilogue,
  epilogueSlideIds,
  foundHomestead,
  loadContent,
  newCustomGame,
  newGame,
  questContent,
  replayEpilogue,
  serialize,
  bonus,
  type GameState,
} from '../src/sim';
import { createResident } from '../src/sim/residents';
import { playQuest } from '../src/sim/systems/questBot';
import { questLocked, type QuestMapDef } from '../src/sim/systems/quests';
import { chooseEnding, endingsContent, openFinale, endingChoiceOpen } from '../src/sim/systems/endings';
import { networkPreview } from '../src/sim/systems/network';
import { checkAchievements } from '../src/sim/systems/achievements';
import { recruitLegend } from '../src/sim/systems/legends';

const content = loadContent();
const qc = questContent(content);
const ec = endingsContent(content);
const act4 = qc.quests.filter((q) => q.line === 'act4').sort((a, b) => a.order - b.order);
const act4Line = qc.questlines.find((l) => l.id === 'act4')!;
const LOOKS = ['skitter', 'skitter_queen', 'burrower', 'rustman', 'rustman_brute', 'rustman_chief', 'hollowed', 'hollowed_hulk', 'mauler', 'sentry'];
const T0 = 1_700_000_000_000;

function reachable(map: QuestMapDef, throughObjectives: boolean): Set<string> {
  const byId = new Map(map.rooms.map((r) => [r.id, r]));
  const adj = new Map<string, Set<string>>(map.rooms.map((r) => [r.id, new Set<string>()]));
  for (const r of map.rooms) for (const l of r.links) {
    adj.get(r.id)?.add(l);
    adj.get(l)?.add(r.id);
  }
  const seen = new Set<string>();
  const queue = [map.rooms.find((r) => r.kind === 'start')!.id];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (!throughObjectives && byId.get(id)?.objective) continue;
    for (const l of adj.get(id) ?? []) queue.push(l);
  }
  return seen;
}

/** Act 4 enemies: everything the act4 and review maps, pools and events reach. */
function act4Enemies(): Set<string> {
  const out = new Set<string>();
  const quests = qc.quests.filter((q) => q.id.startsWith('act4'));
  for (const q of quests) for (const room of q.map.rooms) {
    for (const id of room.enemies ?? []) out.add(id);
    for (const g of room.pool ? (qc.pools[room.pool] ?? []) : []) for (const id of g) out.add(id);
    for (const o of room.event ? (qc.events[room.event]?.options ?? []) : []) for (const e of [...(o.success.fight ?? []), ...(o.failure?.fight ?? [])]) out.add(e);
  }
  for (const id of [...out]) for (const a of qc.enemies[id]?.abilities ?? []) for (const add of a.adds ?? []) out.add(add);
  return out;
}

/** A homestead at the start of Act 4: an office, a strong party, Act 3 done, gates open. */
function act4Game(seed = 7, cycle = 4): { s: GameState; party: number[] } {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.resources.medpatch = 10;
  s.peakPopulation = 200;
  s.legacy.cycle = cycle;
  s.rooms.push({ id: s.nextId++, type: 'office', floor: 0, x: 13, segments: 1, level: 3, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 });
  for (const line of ['act1', 'act2', 'act3']) s.questsDone.push(...qc.questlines.find((l) => l.id === line)!.quests);
  const party = s.residents.slice(0, 3);
  for (const r of party) {
    r.level = 50;
    r.maxHp = r.hp = 600;
    r.weapon = 'coilgun';
  }
  return { s, party: party.map((r) => r.id) };
}

/** Run a story quest from the office to collection with the bot. */
function win(s: GameState, questId: string, party: number[]): void {
  for (const id of party) {
    const r = s.residents.find((x) => x.id === id)!;
    r.hp = r.maxHp;
    r.dead = false;
  }
  s.resources.medpatch = 10;
  const res = applyCommand(s, content, { type: 'startQuest', questId, residentIds: party, medpatch: 5 });
  expect(res, questId).toEqual({ ok: true });
  const q = s.quests.find((x) => x.defId === questId)!;
  advance(s, content, q.travelTotal + 1);
  playQuest(s, content, q.id);
  expect(q.outcome, questId).toBe('success');
  advance(s, content, q.travelTotal + 1);
  expect(applyCommand(s, content, { type: 'collectQuest', questId: q.id })).toEqual({ ok: true });
}

/** Meet the true ending's conditions in this homestead. */
function meetConditions(s: GameState): void {
  for (const f of ['caravaners', 'tinkers', 'lamplighters']) s.factions[f] = { rep: 40, met: true };
  for (const id of ['marla_voss', 'ada_quill', 'seven', 'pip', 'rook']) recruitLegend(s, content, id, 'dev');
  for (const id of ['legend_marla_voss', 'legend_ada_quill']) s.questsDone.push(...qc.questlines.find((l) => l.id === id)!.quests);
  for (let i = 1; i <= 3; i++) s.legacy.outposts.push({ id: i, homesteadNumber: 100 + i, cycle: i, siteId: 'plot7', population: 20, rates: { scrip: 40, salvage: 1, cratesPerHour: 0.01 }, stored: { scrip: 0, salvage: 0, crates: 0 } });
  s.deep.strata = 4;
}

function populate(s: GameState, n: number): void {
  while (s.residents.filter((r) => !r.dead && !r.waiting).length < n) {
    const r = createResident(s, content);
    r.waiting = false;
    s.residents.push(r);
  }
  s.peakPopulation = Math.max(s.peakPopulation, n);
}

describe('Act 4 content', () => {
  it('is an 8-quest questline in order, cycle 4, opening after act3_finale and ending in the finale', () => {
    expect(act4Line.quests).toEqual(act4.map((q) => q.id));
    expect(act4.length).toBeGreaterThanOrEqual(7);
    expect(act4.length).toBeLessThanOrEqual(8);
    expect(act4[0]!.requires.quests).toEqual(['act3_finale']);
    const finale = act4[act4.length - 1]!;
    expect(finale.id).toBe('act4_finale');
    expect(finale.finale).toBe(true);
    for (let i = 0; i < act4.length; i++) {
      const q = act4[i]!;
      expect(q.requires.cycle, q.id).toBe(4);
      if (i > 0) {
        expect(q.requires.quests).toEqual([act4[i - 1]!.id]);
        expect(q.level).toBeGreaterThan(act4[i - 1]!.level);
        expect(q.requires.population!).toBeGreaterThan(act4[i - 1]!.requires.population!);
      }
      expect(q.requires.population!).toBeGreaterThanOrEqual(60);
      expect(q.requires.population!).toBeLessThanOrEqual(150);
    }
    expect(act4[0]!.level).toBeGreaterThanOrEqual(35);
    expect(finale.level).toBe(50);
  });

  it('has connected maps with one start and a reachable boss objective', () => {
    for (const q of qc.quests.filter((x) => x.id.startsWith('act4'))) {
      const starts = q.map.rooms.filter((r) => r.kind === 'start');
      expect(starts.length, q.id).toBe(1);
      expect(reachable(q.map, true).size, q.id).toBe(q.map.rooms.length);
      const objective = q.map.rooms.find((r) => r.objective)!;
      expect(objective.kind, q.id).toBe('boss');
      expect(q.map.shuffle?.length, q.id).toBeGreaterThan(1);
      for (const id of q.map.shuffle ?? []) expect(q.map.rooms.some((r) => r.id === id)).toBe(true);
    }
  });

  it('adds at least 12 new enemies, with allowed looks and telegraphed bosses, and at least 10 events', () => {
    const enemies = act4Enemies();
    const fresh = [...enemies].filter((id) => !['board_proxy'].includes(id));
    expect(fresh.length).toBeGreaterThanOrEqual(12);
    for (const id of enemies) {
      const e = qc.enemies[id];
      expect(e, id).toBeDefined();
      expect(LOOKS).toContain(e!.look);
      if (e!.boss) {
        expect(e!.abilities!.length, id).toBeGreaterThanOrEqual(3);
        for (const a of e!.abilities!) expect(a.windup, `${id}.${a.id}`).toBeGreaterThan(0);
      }
    }
    const events = new Set(qc.quests.filter((q) => q.id.startsWith('act4')).flatMap((q) => q.map.rooms.map((r) => r.event).filter(Boolean)));
    expect(events.size).toBeGreaterThanOrEqual(10);
    // The finale has two boss phases in a row.
    const finale = act4[act4.length - 1]!;
    expect(finale.map.rooms.filter((r) => r.kind === 'boss').length).toBe(2);
  });

  it('names real legends on event options, and every network quest after the first', () => {
    const legends = new Set((content.legends as unknown as { legends: { id: string }[] }).legends.map((l) => l.id));
    let legendOptions = 0;
    for (const ev of Object.values(qc.events)) for (const o of ev.options) if (o.legend) {
      legendOptions++;
      expect(legends.has(o.legend), o.legend).toBe(true);
    }
    expect(legendOptions).toBeGreaterThanOrEqual(4);
    for (const q of act4.slice(1)) expect(q.network, q.id).toBe(true);
  });

  it('adds cycle 4 and cycle 5+ charters', () => {
    const s = newGame(content, { seed: 1, now: T0 });
    s.legacy.cycle = 4;
    expect(charterFor(s, content).quests).toContain('act4_finale');
    s.legacy.cycle = 5;
    expect(charterFor(s, content).cycle).toBe(5);
    s.legacy.cycle = 9;
    expect(charterFor(s, content).cycle).toBe(5);
  });

  it('keeps Act 4 locked before the fourth homestead', () => {
    const { s } = act4Game(3, 3);
    expect(questLocked(s, content, act4[0]!)).toMatch(/newly founded/);
    s.legacy.cycle = 4;
    expect(questLocked(s, content, act4[0]!)).toBeNull();
  });

  it('a strong party can play Act 4 through to the choice', () => {
    const { s, party } = act4Game();
    for (const q of act4) win(s, q.id, party);
    expect(s.questsDone).toContain('act4_finale');
    expect(endingChoiceOpen(s)).toBe(true);
  });
});

describe('the network in the field', () => {
  it('gives nothing without outposts or friends', () => {
    const { s, party } = act4Game();
    s.questsDone.push('act4_1');
    expect(applyCommand(s, content, { type: 'startQuest', questId: 'act4_2', residentIds: party, medpatch: 2 }).ok).toBe(true);
    const q = s.quests[0]!;
    expect(q.support).toEqual({ relay: 0, allies: [], shield: 0 });
    expect(q.supplies.medpatch).toBe(2);
  });

  it('relays Med-Patches from outposts and sends allies who act in fights', () => {
    const { s, party } = act4Game(11);
    meetConditions(s);
    s.questsDone.push('act4_1');
    const p = networkPreview(s, content);
    expect(p.relay).toBe(3);
    expect(p.allies).toEqual(['caravaners', 'tinkers', 'lamplighters']);
    expect(applyCommand(s, content, { type: 'startQuest', questId: 'act4_2', residentIds: party, medpatch: 2 }).ok).toBe(true);
    const q = s.quests[0]!;
    expect(q.supplies.medpatch).toBe(2 + 3);
    advance(s, content, q.travelTotal + 1);
    playQuest(s, content, q.id);
    expect(q.outcome).toBe('success');
    expect(s.stats['networkSupport'] ?? 0).toBeGreaterThan(0);
    expect(s.stats['networkAlliesMax']).toBe(3);
    // Not a network quest: no help.
    const { s: s2, party: p2 } = act4Game(12);
    meetConditions(s2);
    expect(applyCommand(s2, content, { type: 'startQuest', questId: 'act4_1', residentIds: p2, medpatch: 0 }).ok).toBe(true);
    expect(s2.quests[0]!.support).toBeUndefined();
  });

  it('a legend in the party carries their event without a roll', () => {
    const { s, party } = act4Game(5);
    recruitLegend(s, content, 'brother_wick', 'dev');
    const wick = s.residents.find((r) => r.legendary === 'brother_wick')!;
    wick.waiting = false;
    wick.stats.charm = 1;
    s.questsDone.push('act4_1', 'act4_2');
    expect(applyCommand(s, content, { type: 'startQuest', questId: 'act4_3', residentIds: [wick.id, ...party.slice(0, 2)], medpatch: 0 }).ok).toBe(true);
    const q = s.quests[0]!;
    q.status = 'onsite';
    q.pendingEvent = 'parish_bell';
    q.roomId = q.rooms.find((r) => r.event === 'parish_bell')!.id;
    const before = s.stats['legendAssists'] ?? 0;
    expect(applyCommand(s, content, { type: 'questChoose', questId: q.id, option: 0 }).ok).toBe(true);
    expect(s.stats['legendAssists']).toBe(before + 1);
    expect(s.stats['questChecksPassed']).toBeGreaterThan(0);
  });

  it('never asks for more population than Skeleton Crew allows', () => {
    const { s } = act4Game();
    s.peakPopulation = 60;
    s.questsDone.push(...act4.slice(0, 6).map((q) => q.id));
    expect(questLocked(s, content, act4[6]!)).toMatch(/population 135/);
    s.rules.ids = ['skeleton_crew'];
    expect(questLocked(s, content, act4[6]!)).toBeNull();
  });
});

describe('endings', () => {
  const plain = ec.endings.filter((e) => !e.true);
  const trueEnding = ec.endings.find((e) => e.true)!;

  it('has at least three endings and one true ending with conditions, rewards and titles', () => {
    expect(plain.length).toBeGreaterThanOrEqual(3);
    expect(trueEnding).toBeDefined();
    expect(trueEnding.requires!.length).toBeGreaterThanOrEqual(3);
    for (const e of ec.endings) {
      expect(e.reward.title.length).toBeGreaterThan(0);
      expect(e.reward.bonuses.length).toBeGreaterThan(0);
      expect(epilogueSlideIds(newGame(content, { seed: 1 }), content, e.id).length).toBeGreaterThanOrEqual(6);
    }
    const ids = new Set(ec.slides.map((s) => s.id));
    expect(ids.size).toBe(ec.slides.length);
    for (const s of ec.slides) for (const e of s.endings ?? []) expect(ec.endings.some((x) => x.id === e), s.id).toBe(true);
  });

  it('only opens once the finale is won', () => {
    const { s } = act4Game();
    expect(applyCommand(s, content, { type: 'chooseEnding', endingId: plain[0]!.id })).toEqual({ ok: false, reason: 'win the finale first' });
    openFinale(s, content);
    expect(endingChoiceOpen(s)).toBe(true);
    expect(applyCommand(s, content, { type: 'chooseEnding', endingId: 'nope' }).ok).toBe(false);
  });

  it('every ordinary ending is reachable, and pays its reward once', () => {
    for (const e of plain) {
      const { s } = act4Game(21);
      openFinale(s, content);
      const legacy = s.legacy.points;
      expect(applyCommand(s, content, { type: 'chooseEnding', endingId: e.id })).toEqual({ ok: true });
      expect(s.story.current).toBe(e.id);
      expect(s.story.title).toBe(e.reward.title);
      expect(s.story.endings[e.id]!.count).toBe(1);
      expect(s.legacy.points).toBe(legacy + e.reward.legacy);
      expect(s.events.some((x) => x.type === 'endingReached' && x.endingId === e.id && x.first)).toBe(true);
      // One choice per homestead.
      expect(applyCommand(s, content, { type: 'chooseEnding', endingId: e.id }).ok).toBe(false);
      const b = e.reward.bonuses[0]!;
      expect(bonus(s, content, b.effect as never)).toBeGreaterThanOrEqual(b.value);
    }
  });

  it('keeps the true ending locked until its conditions are met, showing what is missing', () => {
    const { s } = act4Game(22);
    openFinale(s, content);
    const opt = endingOptions(s, content).find((o) => o.def.true)!;
    expect(opt.locked).not.toBeNull();
    expect(opt.conditions.every((c) => !c.done)).toBe(true);
    expect(applyCommand(s, content, { type: 'chooseEnding', endingId: trueEnding.id }).ok).toBe(false);
    meetConditions(s);
    // One short: two factions only.
    s.factions['lamplighters']!.rep = 0;
    const partly = endingOptions(s, content).find((o) => o.def.true)!;
    expect(partly.conditions.filter((c) => !c.done).map((c) => c.kind)).toEqual(['factions']);
    expect(applyCommand(s, content, { type: 'chooseEnding', endingId: trueEnding.id }).ok).toBe(false);
    s.factions['lamplighters']!.rep = 30;
    expect(endingOptions(s, content).find((o) => o.def.true)!.locked).toBeNull();
    expect(applyCommand(s, content, { type: 'chooseEnding', endingId: trueEnding.id })).toEqual({ ok: true });
    expect(s.story.endings[trueEnding.id]).toBeDefined();
  });
});

describe('epilogue slides', () => {
  it('shows only the chosen ending, one slide per group, with numbers filled in', () => {
    const { s } = act4Game(31);
    s.factions['caravaners'] = { rep: 50, met: true };
    s.factions['rustmen'] = { rep: -60, met: true };
    const ids = epilogueSlideIds(s, content, 'renewal');
    expect(ids).toContain('open_renewal');
    expect(ids).not.toContain('open_eviction');
    expect(ids).toContain('caravaners_friend');
    expect(ids).not.toContain('caravaners_neutral');
    expect(ids).toContain('rustmen_foe');
    expect(ids).toContain('tinkers_neutral');
    expect(ids).toContain('net_none');
    const slides = epilogue(s, content, 'renewal');
    for (const sl of slides) expect(sl.text, sl.id).not.toMatch(/\{\w+\}/);
    expect(slides.find((x) => x.id.startsWith('home_'))!.title).toBe(`Homestead ${s.homesteadNumber}`);
  });

  it('picks legend slides by status, awakened first, capped', () => {
    const { s } = act4Game(32);
    for (const id of ['marla_voss', 'ada_quill', 'seven', 'pip', 'rook', 'granny_ash', 'june_halloran']) recruitLegend(s, content, id, 'dev');
    s.questsDone.push(...qc.questlines.find((l) => l.id === 'legend_june_halloran')!.quests);
    s.legends.lost = ['rook'];
    const ids = epilogueSlideIds(s, content, 'holdover');
    const legendIds = ids.filter((id) => /_(awakened|met|lost)$/.test(id));
    expect(legendIds.length).toBe(ec.tuning.caps['legend']);
    expect(legendIds).toContain('june_halloran_awakened');
    expect(legendIds).toContain('rook_lost');
    expect(legendIds).not.toContain('june_halloran_met');
  });

  it('adds rules, Survival, outposts and fallen slides when they apply', () => {
    const { s } = act4Game(33);
    s.rules.survival = true;
    s.residents[5]!.dead = true;
    for (let i = 1; i <= 4; i++) s.legacy.outposts.push({ id: i, homesteadNumber: 200 + i, cycle: i, siteId: 'plot7', population: 10, rates: { scrip: 1, salvage: 0, cratesPerHour: 0 }, stored: { scrip: 0, salvage: 0, crates: 0 } });
    const ids = epilogueSlideIds(s, content, 'eviction');
    expect(ids).toContain('rules_survival');
    expect(ids).toContain('net_many');
    expect(ids).toContain('home_fallen');
    const text = epilogue(s, content, 'eviction').find((x) => x.id === 'net_many')!.text;
    expect(text).toContain('4 outposts');
  });

  it("counts this homestead's fallen for the plaque, not earlier ones", () => {
    const { s } = act4Game(35);
    s.stats['laidToRest'] = 7; // four of them before this homestead was founded
    s.legacy.statsAtFounding = { ...s.legacy.statsAtFounding, laidToRest: 4 };
    s.residents[5]!.dead = true;
    const text = epilogue(s, content, 'eviction').find((x) => x.id === 'home_fallen')!.text;
    expect(text).toContain('with 4 names');
  });

  it('replays an ending as it played', () => {
    const { s } = act4Game(34);
    openFinale(s, content);
    applyCommand(s, content, { type: 'chooseEnding', endingId: 'eviction' });
    const replay = replayEpilogue(s, content, 'eviction')!;
    expect(replay.map((x) => x.id)).toEqual(s.story.endings['eviction']!.slides);
    // Things change afterwards; the replay doesn't.
    s.factions['caravaners'] = { rep: 90, met: true };
    expect(replayEpilogue(s, content, 'eviction')!.map((x) => x.id)).toEqual(replay.map((x) => x.id));
    expect(replayEpilogue(s, content, 'renewal')).toBeNull();
  });
});

describe('the story across homesteads', () => {
  it('carries endings and the title, resets the choice, and keeps prestige working after the ending', () => {
    const { s, party } = act4Game(41);
    for (const q of act4) win(s, q.id, party);
    applyCommand(s, content, { type: 'chooseEnding', endingId: 'renewal' });
    populate(s, 150);
    expect(charterStatus(s, content).ready).toBe(true);
    const founded = foundHomestead(s, content, { siteId: 'plot7', partyIds: party, heirloomIds: [], now: T0 });
    expect(founded.ok).toBe(true);
    if (!founded.ok) return;
    const next = founded.state;
    expect(next.legacy.cycle).toBe(5);
    expect(next.story.endings['renewal']!.count).toBe(1);
    expect(next.story.current).toBeNull();
    expect(next.story.open).toBe(false);
    expect(next.story.title).toBe('Chair of the Board');
    expect(next.legacy.history[next.legacy.history.length - 1]!.ending).toBe('renewal');
    // Golden Parachute: the renewal's bonus lands on the next start.
    expect(next.scrip).toBeGreaterThanOrEqual(content.balance.start.scrip + 3000);
    // The Act 4 quests stay done; the Rent Review opens here and reopens the choice.
    expect(next.questsDone).toContain('act4_finale');
    next.rooms.push({ id: next.nextId++, type: 'office', floor: 0, x: 13, segments: 1, level: 3, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 });
    applyCommand(next, content, { type: 'admitAll' });
    next.peakPopulation = 200;
    next.nextIncidentAt = 1e12;
    next.nextWandererAt = 1e12;
    const crew = next.residents.filter((r) => !r.waiting).slice(0, 3).map((r) => r.id);
    win(next, 'act4_review', crew);
    expect(endingChoiceOpen(next)).toBe(true);
    expect(applyCommand(next, content, { type: 'chooseEnding', endingId: 'holdover' }).ok).toBe(true);
    expect(Object.keys(next.story.endings).sort()).toEqual(['holdover', 'renewal']);
    // Cycle 5's charter, then founding again: the review can be held again.
    expect(charterFor(next, content).cycle).toBe(5);
    populate(next, 150);
    next.stats['contractsCompleted'] = (next.stats['contractsCompleted'] ?? 0) + 20;
    expect(charterStatus(next, content).ready).toBe(true);
    const again = foundHomestead(next, content, { siteId: 'plot7', partyIds: crew, heirloomIds: [], now: T0 });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.state.legacy.cycle).toBe(6);
    expect(again.state.questsDone).not.toContain('act4_review');
    expect(again.state.questsDone).toContain('act4_finale');
    expect(Object.keys(again.state.story.endings).length).toBe(2);
  });
});

describe('achievements', () => {
  it('pays per ending and for all of them, lifetime', () => {
    const { s } = act4Game(51);
    meetConditions(s);
    for (const e of ec.endings) {
      s.story.current = null;
      openFinale(s, content);
      expect(chooseEnding(s, content, e.id)).toBeNull();
      checkAchievements(s, content);
      expect(s.achievements[`ending_${e.id}`], e.id).toBeDefined();
    }
    expect(s.achievements['ending_any']).toBeDefined();
    expect(s.achievements['ending_all']).toBeDefined();
    expect(s.stats['endingsDistinct']).toBe(ec.endings.length);
  });

  it('the Seal never needs more than one plain ending', () => {
    const required = content.achievements.filter((a) => a.id.startsWith('ending_') && !a.optional).map((a) => a.id);
    expect(required.sort()).toEqual(['ending_any', 'ending_neighbours']);
  });
});

describe('saves', () => {
  it('migrates a v8 save to v9 with an empty story', () => {
    const s = newGame(content, { seed: 2, now: T0 });
    const file = JSON.parse(serialize(s));
    file.version = 8;
    delete file.state.story;
    const back = deserialize(JSON.stringify(file));
    expect(back.story).toEqual({ endings: {}, current: null, open: false, title: null });
  });

  it('round-trips the story', () => {
    const { s } = act4Game(61);
    openFinale(s, content);
    chooseEnding(s, content, 'eviction');
    const back = deserialize(serialize(s));
    expect(back.story).toEqual(s.story);
  });
});

describe('Custom Game: Last Rent', () => {
  it('starts a sandbox at Act 4 with the network on the line', () => {
    const res = newCustomGame(content, 'last_rent', { seed: 3, now: T0 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const s = res.state;
    expect(s.mode).toBe('custom');
    expect(s.legacy.cycle).toBe(4);
    expect(s.questsDone).toContain('act3_finale');
    expect(questLocked(s, content, act4[0]!)).toBeNull();
    expect(s.legacy.outposts.length).toBe(3);
    expect(s.residents.filter((r) => r.legendary && !r.waiting).length).toBe(5);
    const opt = endingOptions(s, content).find((o) => o.def.true)!;
    // Most conditions met, a couple left to do.
    expect(opt.conditions.some((c) => c.done)).toBe(true);
    expect(opt.locked).not.toBeNull();
  });
});

// Content checks for src/content/quests.json: every reference resolves, every
// map is walkable, and the Act 1 questline can actually be finished.
import { describe, expect, it } from 'vitest';
import { advance, applyCommand, loadContent, newGame, questContent, STAT_KEYS, type QuestReward } from '../src/sim';
import { playQuest } from '../src/sim/systems/questBot';
import { refreshContracts, type QuestMapDef } from '../src/sim/systems/quests';
import questsJson from '../src/content/quests.json';

const content = loadContent();
const qc = questContent(content);

const LOOKS = ['skitter', 'skitter_queen', 'burrower', 'rustman', 'rustman_brute', 'rustman_chief', 'hollowed', 'hollowed_hulk', 'mauler', 'sentry'];
const MATERIALS = ['circuitry', 'hide', 'adhesive', 'cloth', 'chemicals', 'steel', 'valuables'];
const CRATES = ['standard', 'rare', 'legendary'];
/** Counters the engine bumps that quest achievements may use. */
const COUNTERS = [
  'questsStarted', 'questsCompleted', 'storyQuestsCompleted', 'contractsCompleted', 'questline.act1',
  'questEnemiesDefeated', 'bossesDefeated', 'questCrits', 'perfectCrits', 'abilitiesUsed', 'questInterrupts',
  'questChecksPassed', 'questChecksFailed', 'questWipes', 'questScrip', 'questPartyLevel', 'medpatchesUsed',
];

interface NamedMap {
  name: string;
  map: QuestMapDef;
}
const maps: NamedMap[] = [
  ...qc.quests.map((q) => ({ name: q.id, map: q.map })),
  ...qc.contracts.map((c) => ({ name: c.id, map: c.map })),
];

/** Every reward in the content, with where it came from. */
function rewards(): { where: string; r: QuestReward }[] {
  const out: { where: string; r: QuestReward }[] = [];
  for (const q of qc.quests) out.push({ where: `${q.id} rewards`, r: q.rewards });
  for (const { name, map } of maps) for (const room of map.rooms) if (room.loot) out.push({ where: `${name}/${room.id}`, r: room.loot });
  for (const e of Object.values(qc.enemies)) if (e.drop) out.push({ where: `${e.id} drop`, r: e.drop });
  for (const ev of Object.values(qc.events)) {
    for (const o of ev.options) {
      if (o.success.reward) out.push({ where: `${ev.id} success`, r: o.success.reward });
      if (o.failure?.reward) out.push({ where: `${ev.id} failure`, r: o.failure.reward });
    }
  }
  return out;
}

/** Enemy ids referenced anywhere, with where. */
function enemyRefs(): { where: string; id: string }[] {
  const out: { where: string; id: string }[] = [];
  for (const { name, map } of maps) for (const room of map.rooms) for (const id of room.enemies ?? []) out.push({ where: `${name}/${room.id}`, id });
  for (const [pool, groups] of Object.entries(qc.pools)) for (const g of groups) for (const id of g) out.push({ where: `pool ${pool}`, id });
  for (const ev of Object.values(qc.events)) {
    for (const o of ev.options) for (const id of [...(o.success.fight ?? []), ...(o.failure?.fight ?? [])]) out.push({ where: `event ${ev.id}`, id });
  }
  for (const e of Object.values(qc.enemies)) for (const a of e.abilities ?? []) for (const id of a.adds ?? []) out.push({ where: `${e.id}.${a.id}`, id });
  return out;
}

/** Rooms reachable from start without walking through an objective room (the objective ends the quest). */
function reachable(map: QuestMapDef, throughObjectives: boolean): Set<string> {
  const byId = new Map(map.rooms.map((r) => [r.id, r]));
  const adj = new Map<string, Set<string>>(map.rooms.map((r) => [r.id, new Set<string>()]));
  for (const r of map.rooms) for (const l of r.links) {
    adj.get(r.id)?.add(l);
    adj.get(l)?.add(r.id);
  }
  const start = map.rooms.find((r) => r.kind === 'start');
  const seen = new Set<string>();
  const queue = start ? [start.id] : [];
  while (queue.length) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    if (!throughObjectives && byId.get(id)?.objective) continue;
    for (const l of adj.get(id) ?? []) queue.push(l);
  }
  return seen;
}

describe('references', () => {
  it('every enemy referenced exists, with a matching id and an allowed look', () => {
    for (const { where, id } of enemyRefs()) expect(qc.enemies[id], `${where} -> ${id}`).toBeDefined();
    for (const [key, e] of Object.entries(qc.enemies)) {
      expect(e.id).toBe(key);
      expect(LOOKS, `${e.id} look`).toContain(e.look);
      expect(e.hp).toBeGreaterThan(0);
      expect(e.damage[0]).toBeLessThanOrEqual(e.damage[1]);
      for (const a of e.abilities ?? []) {
        expect(a.windup, `${e.id}.${a.id}`).toBeGreaterThan(0);
        expect(a.windup).toBeLessThan(a.every);
        if (a.effect === 'summon') expect(a.adds?.length, `${e.id}.${a.id} adds`).toBeGreaterThan(0);
      }
    }
  });

  it('every pool and event referenced by a room exists', () => {
    for (const { name, map } of maps) {
      for (const room of map.rooms) {
        if (room.pool) expect(qc.pools[room.pool], `${name}/${room.id} pool`).toBeDefined();
        if (room.event) expect(qc.events[room.event], `${name}/${room.id} event`).toBeDefined();
        if (room.kind === 'event') expect(room.event, `${name}/${room.id}`).toBeTruthy();
        if (room.kind === 'fight' || room.kind === 'boss') expect((room.enemies?.length ?? 0) > 0 || !!room.pool, `${name}/${room.id}`).toBe(true);
        if (room.kind === 'loot') expect(room.loot, `${name}/${room.id}`).toBeTruthy();
      }
    }
    for (const [key, ev] of Object.entries(qc.events)) {
      expect(ev.id).toBe(key);
      expect(ev.options.length).toBeGreaterThanOrEqual(2);
      for (const o of ev.options) if (o.stat) expect(STAT_KEYS).toContain(o.stat);
    }
  });

  it('every item, fragment, recipe, material and crate in a reward exists', () => {
    for (const { where, r } of rewards()) {
      for (const id of r.items ?? []) expect(content.items[id], `${where} item ${id}`).toBeDefined();
      for (const id of r.recipes ?? []) expect(content.items[id], `${where} recipe ${id}`).toBeDefined();
      for (const id of Object.keys(r.fragments ?? {})) {
        expect(content.items[id], `${where} fragment ${id}`).toBeDefined();
        expect(content.items[id]?.rarity, `${where} fragment ${id}`).not.toBe('common');
      }
      for (const m of r.salvage?.materials ?? []) expect(MATERIALS, `${where} material`).toContain(m);
      for (const tier of Object.keys(r.crates ?? {})) expect(CRATES, `${where} crate`).toContain(tier);
      for (const region of r.regions ?? []) expect(content.exploration.regions.map((x) => x.id), `${where} region`).toContain(region);
    }
  });

  it('every rare-item path shows up: named items, fragments, recipes and crates', () => {
    const all = rewards().map((x) => x.r);
    expect(all.some((r) => r.items?.some((id) => content.items[id]?.rarity === 'rare'))).toBe(true);
    expect(all.some((r) => Object.keys(r.fragments ?? {}).some((id) => content.items[id]?.rarity === 'legendary'))).toBe(true);
    expect(all.some((r) => r.fragment)).toBe(true);
    expect(all.some((r) => r.recipes?.length)).toBe(true);
    expect(all.some((r) => r.crates?.rare || r.crates?.legendary)).toBe(true);
  });
});

describe('maps', () => {
  it('have 5-10 unique rooms on distinct cells with links to neighbours', () => {
    for (const { name, map } of maps) {
      const ids = map.rooms.map((r) => r.id);
      expect(new Set(ids).size, name).toBe(ids.length);
      expect(ids.length, name).toBeGreaterThanOrEqual(5);
      expect(ids.length, name).toBeLessThanOrEqual(10);
      expect(new Set(map.rooms.map((r) => `${r.floor},${r.col}`)).size, `${name} cells`).toBe(ids.length);
      const floors = new Set(map.rooms.map((r) => r.floor));
      expect(floors.size, `${name} floors`).toBeGreaterThanOrEqual(2);
      for (const r of map.rooms) {
        for (const l of r.links) {
          const o = map.rooms.find((x) => x.id === l);
          expect(o, `${name}/${r.id} -> ${l}`).toBeDefined();
          // The client draws links as doorways (same floor) or stairs (same column).
          const dist = Math.abs(o!.floor - r.floor) + Math.abs(o!.col - r.col);
          expect(dist, `${name}/${r.id} -> ${l} must be adjacent`).toBe(1);
        }
      }
    }
  });

  it('are connected, with exactly one start and a reachable objective', () => {
    for (const { name, map } of maps) {
      expect(map.rooms.filter((r) => r.kind === 'start').length, name).toBe(1);
      const seen = reachable(map, true);
      expect(seen.size, `${name} connected`).toBe(map.rooms.length);
      expect(map.rooms.some((r) => r.objective && seen.has(r.id)), `${name} objective`).toBe(true);
    }
  });

  it('can be fully explored without walking through the objective', () => {
    // Clearing the objective ends the quest, so it must never be the only way on.
    for (const { name, map } of maps) expect(reachable(map, false).size, name).toBe(map.rooms.length);
  });

  it('shuffle real rooms, never the start or the objective', () => {
    for (const { name, map } of maps) {
      if (qc.quests.some((q) => q.id === name)) expect(map.shuffle?.length ?? 0, `${name} shuffle`).toBeGreaterThanOrEqual(2);
      for (const id of map.shuffle ?? []) {
        const room = map.rooms.find((r) => r.id === id);
        expect(room, `${name} shuffle ${id}`).toBeDefined();
        expect(room!.kind, `${name} shuffle ${id}`).not.toBe('start');
        expect(room!.objective ?? false, `${name} shuffle ${id}`).toBe(false);
      }
    }
  });
});

describe('Act 1', () => {
  const line = qc.questlines.find((l) => l.id === 'act1')!;

  it('the questline lists every act1 quest in order, each requiring the one before', () => {
    const act1 = qc.quests.filter((q) => q.line === 'act1').sort((a, b) => a.order - b.order);
    expect(line.quests).toEqual(act1.map((q) => q.id));
    expect(line.quests).toEqual(['act1_1', 'act1_2', 'act1_3', 'act1_4', 'act1_5', 'act1_6']);
    act1.forEach((q, i) => expect(q.requires.quests).toEqual(i ? [act1[i - 1]!.id] : []));
    for (let i = 1; i < act1.length; i++) expect(act1[i]!.level, act1[i]!.id).toBeGreaterThan(act1[i - 1]!.level);
    expect(act1[0]!.requires.population ?? 0).toBe(0);
    for (const q of act1.slice(1)) {
      expect(q.requires.population, q.id).toBeGreaterThanOrEqual(20);
      expect(q.requires.population, q.id).toBeLessThanOrEqual(40);
    }
  });

  it('every quest requirement names a real quest', () => {
    for (const q of qc.quests) for (const id of q.requires.quests) expect(qc.quests.some((x) => x.id === id), `${q.id} requires ${id}`).toBe(true);
  });

  it('ends with a boss that has at least two telegraphed mechanics', () => {
    const finale = qc.quests.find((q) => q.id === line.quests[line.quests.length - 1])!;
    const room = finale.map.rooms.find((r) => r.objective)!;
    expect(room.kind).toBe('boss');
    const boss = (room.enemies ?? []).map((id) => qc.enemies[id]!).find((e) => e.boss);
    expect(boss).toBeDefined();
    expect(new Set(boss!.abilities?.map((a) => a.effect)).size).toBeGreaterThanOrEqual(2);
    expect(boss!.drop?.fragments ?? boss!.drop?.recipes).toBeTruthy();
  });

  it('a strong party (level 20, rare weapons) finishes every Act 1 quest', () => {
    for (const id of line.quests) {
      const s = newGame(content, { seed: 77, now: 0 });
      applyCommand(s, content, { type: 'admitAll' });
      s.nextIncidentAt = 1e12;
      s.nextWandererAt = 1e12;
      s.resources.medpatch = 10;
      s.peakPopulation = 100;
      s.rooms.push({ id: s.nextId++, type: 'office', floor: 0, x: 13, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 });
      const party = s.residents.slice(0, 3);
      for (const r of party) {
        r.level = 20;
        r.maxHp = r.hp = 190;
        r.weapon = 'coilgun';
      }
      s.questsDone = [...qc.quests.find((q) => q.id === id)!.requires.quests];
      const res = applyCommand(s, content, { type: 'startQuest', questId: id, residentIds: party.map((r) => r.id), medpatch: 5 });
      expect(res, id).toEqual({ ok: true });
      const q = s.quests[0]!;
      advance(s, content, q.travelTotal + 1);
      playQuest(s, content, q.id);
      expect(q.outcome, id).toBe('success');
      expect(q.rooms.every((r) => r.visited), `${id} fully explored`).toBe(true);
      advance(s, content, q.travelTotal + 1);
      expect(applyCommand(s, content, { type: 'collectQuest', questId: q.id }).ok).toBe(true);
      expect(s.questsDone).toContain(id);
    }
  });
});

describe('contracts and events', () => {
  it('has enough variety', () => {
    expect(Object.keys(qc.enemies).length).toBeGreaterThanOrEqual(12);
    expect(Object.keys(qc.events).length).toBeGreaterThanOrEqual(15);
    expect(qc.contracts.length).toBeGreaterThanOrEqual(6);
    const stats = new Set(Object.values(qc.events).flatMap((e) => e.options.map((o) => o.stat).filter(Boolean)));
    for (const k of STAT_KEYS) expect(stats, `an event checks ${k}`).toContain(k);
    const looks = new Set(Object.values(qc.enemies).map((e) => e.look));
    for (const k of ['skitter', 'burrower', 'rustman', 'hollowed', 'mauler']) expect(looks).toContain(k);
  });

  it('contract templates have places, a {place} title and both bounty rarities between them', () => {
    for (const c of qc.contracts) {
      expect(c.places.length, c.id).toBeGreaterThanOrEqual(3);
      expect(c.title, c.id).toContain('{place}');
      expect(c.travelMinutes[0]).toBeLessThanOrEqual(c.travelMinutes[1]);
      expect(c.map.rooms.some((r) => r.objective), c.id).toBe(true);
    }
    expect(qc.contracts.some((c) => c.bounty.rarity === 'rare')).toBe(true);
    const legendary = qc.contracts.filter((c) => c.bounty.rarity === 'legendary');
    expect(legendary.length).toBeGreaterThan(0);
    const longest = Math.max(...qc.contracts.map((c) => c.travelMinutes[1]));
    expect(legendary.some((c) => c.travelMinutes[1] === longest)).toBe(true);
  });

  it('a strong party finishes every contract template', () => {
    for (const tpl of qc.contracts) {
      const s = newGame(content, { seed: 31, now: 0 });
      applyCommand(s, content, { type: 'admitAll' });
      s.nextIncidentAt = 1e12;
      s.nextWandererAt = 1e12;
      s.resources.medpatch = 10;
      s.rooms.push({ id: s.nextId++, type: 'office', floor: 0, x: 13, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 });
      const party = s.residents.slice(0, 3);
      for (const r of party) {
        r.level = 12;
        r.maxHp = r.hp = 150;
        r.weapon = 'rivet_rifle';
      }
      refreshContracts(s, content);
      const offer = s.contracts.offers[0]!;
      offer.templateId = tpl.id;
      offer.level = 12;
      expect(applyCommand(s, content, { type: 'startContract', contractId: offer.id, residentIds: party.map((r) => r.id), medpatch: 5 }).ok).toBe(true);
      const q = s.quests[0]!;
      advance(s, content, q.travelTotal + 1);
      playQuest(s, content, q.id);
      expect(q.outcome, tpl.id).toBe('success');
    }
  });
});

describe('achievements and writing', () => {
  it('quest achievements use real counters, and every achievement id is unique', () => {
    const own = (questsJson as { achievements: { id: string; stat: string; tier: string; target: number }[] }).achievements;
    expect(own.length).toBeGreaterThanOrEqual(12);
    for (const a of own) {
      expect(COUNTERS, a.id).toContain(a.stat);
      expect(['bronze', 'silver', 'gold']).toContain(a.tier);
      expect(a.target).toBeGreaterThan(0);
    }
    const ids = content.achievements.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('briefs and debriefs are 2-4 sentences, credited to a giver', () => {
    const sentences = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z'])/).filter((x) => x.trim()).length;
    for (const q of qc.quests) {
      expect(q.giver, q.id).toBeTruthy();
      for (const text of [q.brief, q.debrief]) {
        expect(sentences(text), `${q.id}: ${text}`).toBeGreaterThanOrEqual(2);
        expect(sentences(text), `${q.id}: ${text}`).toBeLessThanOrEqual(4);
      }
    }
  });

  it('uses only our own names', () => {
    const text = JSON.stringify(questsJson);
    const banned = /fallout|vault|nuka|pip-?boy|deathclaw|radroach|mole ?rat|overseer|mr\.? handy|brotherhood of|super mutant|ghoul|bottle ?caps?\b|stimpak|rad-?away|rad-?x/i;
    expect(text.match(banned)?.[0] ?? null).toBeNull();
  });
});

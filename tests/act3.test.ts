// Act 3 "The Seal" (M9 stream A): the act3 questline, its enemies, events and
// contracts in quests.json, and the Stillwater region in exploration.json.
// General map/reference checks for every quest live in questContent.test.ts;
// this file checks what is specific to Act 3.
import { describe, expect, it } from 'vitest';
import { advance, applyCommand, loadContent, newGame, questContent, STAT_KEYS } from '../src/sim';
import { playQuest } from '../src/sim/systems/questBot';
import { questLocked, type QuestDef, type QuestMapDef } from '../src/sim/systems/quests';
import { regionDef } from '../src/sim/systems/exploration';
import questsJson from '../src/content/quests.json';

const content = loadContent();
const qc = questContent(content);
const line = qc.questlines.find((l) => l.id === 'act3')!;
const act3 = qc.quests.filter((q) => q.line === 'act3').sort((a, b) => a.order - b.order);

const FACTIONS = ['caravaners', 'lamplighters', 'tinkers', 'rustmen', 'homestead9'];
/** Legend ids fixed by docs/design/M9-spec.md (stream L defines them in legends.json). */
const LEGENDS = ['marla_voss', 'ada_quill', 'seven', 'doc_ferris', 'lucky_lou', 'pip', 'rook', 'granny_ash', 'brother_wick', 'june_halloran', 'captain_orla'];
const LOOKS = ['skitter', 'skitter_queen', 'burrower', 'rustman', 'rustman_brute', 'rustman_chief', 'hollowed', 'hollowed_hulk', 'mauler', 'sentry'];
const MATERIALS = ['circuitry', 'hide', 'adhesive', 'cloth', 'chemicals', 'steel', 'valuables'];
const BANNED = /fallout|vault|nuka|pip-?boy|deathclaw|radroach|mole ?rat|overseer|mr\.? handy|brotherhood|super mutant|ghoul|bottle ?caps?\b|stimpak|rad-?away|rad-?x|enclave|mirelurk|yao guai|red rocket/i;

/** Enemy, pool and event ids that Act 3 added (everything its maps, pools and events reach). */
function act3Refs() {
  const enemies = new Set<string>();
  const pools = new Set<string>();
  const events = new Set<string>();
  const maps: QuestMapDef[] = act3.map((q) => q.map);
  for (const map of maps) {
    for (const room of map.rooms) {
      for (const id of room.enemies ?? []) enemies.add(id);
      if (room.pool) pools.add(room.pool);
      if (room.event) events.add(room.event);
    }
  }
  for (const p of pools) for (const g of qc.pools[p] ?? []) for (const id of g) enemies.add(id);
  for (const id of events) for (const o of qc.events[id]?.options ?? []) for (const e of [...(o.success.fight ?? []), ...(o.failure?.fight ?? [])]) enemies.add(e);
  for (const id of [...enemies]) for (const a of qc.enemies[id]?.abilities ?? []) for (const add of a.adds ?? []) enemies.add(add);
  return { enemies, pools, events };
}

/** Rooms reachable from start, optionally without passing through the objective. */
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

function questGame(def: QuestDef, level: number, weapon: string, cycle: number) {
  const s = newGame(content, { seed: 91, now: 0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.resources.medpatch = 10;
  s.peakPopulation = 200;
  s.legacy.cycle = cycle;
  s.rooms.push({ id: s.nextId++, type: 'office', floor: 0, x: 13, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 });
  const party = s.residents.slice(0, 3);
  for (const r of party) {
    r.level = level;
    r.maxHp = r.hp = 105 + 8 * level;
    r.weapon = weapon;
  }
  s.questsDone = [...def.requires.quests];
  return { s, party };
}

describe('the Act 3 questline', () => {
  it('lists 8 quests in order, each requiring the one before, ending in act3_finale', () => {
    expect(line).toBeDefined();
    expect(line.quests).toEqual(act3.map((q) => q.id));
    expect(act3).toHaveLength(8);
    expect(line.quests[7]).toBe('act3_finale');
    act3.forEach((q, i) => expect(q.requires.quests, q.id).toEqual([i ? act3[i - 1]!.id : 'act2_finale']));
  });

  it('runs from about level 20 to 35 with population gates of 40-110, all in the third homestead', () => {
    for (let i = 1; i < act3.length; i++) expect(act3[i]!.level, act3[i]!.id).toBeGreaterThan(act3[i - 1]!.level);
    expect(act3[0]!.level).toBeGreaterThanOrEqual(20);
    expect(act3[7]!.level).toBeLessThanOrEqual(35);
    for (const q of act3) {
      expect(q.requires.cycle, q.id).toBe(3);
      expect(q.requires.population, q.id).toBeGreaterThanOrEqual(40);
      expect(q.requires.population, q.id).toBeLessThanOrEqual(110);
    }
    // Charter 3 needs population 120 and act3_finale, so the finale must open below that.
    expect(act3[7]!.requires.population).toBeLessThan(120);
  });

  it('only opens in a third homestead', () => {
    const def = act3[0]!;
    expect(questLocked(questGame(def, 22, 'coilgun', 2).s, content, def)).toMatch(/newly founded/);
    expect(questLocked(questGame(def, 22, 'coilgun', 3).s, content, def)).toBeNull();
  });

  it('has an event and a shuffle in every quest', () => {
    for (const q of act3) {
      expect(q.map.rooms.some((r) => r.kind === 'event'), q.id).toBe(true);
      expect(q.map.shuffle?.length ?? 0, q.id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('Act 3 rewards', () => {
  it('act3_finale exists, needs cycle 3 and brings captain_orla', () => {
    const finale = qc.quests.find((q) => q.id === 'act3_finale')!;
    expect(finale).toBeDefined();
    expect(finale.requires.cycle).toBe(3);
    expect(finale.rewards.legend).toBe('captain_orla');
  });

  it('brother_wick and june_halloran each join from a mid-act quest', () => {
    for (const id of ['brother_wick', 'june_halloran']) {
      const q = act3.find((x) => x.rewards.legend === id);
      expect(q, id).toBeDefined();
      expect(q!.order, id).toBeGreaterThan(1);
      expect(q!.order, id).toBeLessThan(8);
    }
  });

  it('every legend id used anywhere in quest content is a real legend', () => {
    for (const q of qc.quests) {
      if (q.rewards.legend) expect(LEGENDS, `${q.id} reward`).toContain(q.rewards.legend);
      if (q.requires.legend) expect(LEGENDS, `${q.id} requires`).toContain(q.requires.legend);
    }
  });

  it('the Stillwater is unlocked by an Act 3 quest, and exists', () => {
    expect(regionDef(content, 'stillwater')).toBeDefined();
    expect(act3.some((q) => q.rewards.regions?.includes('stillwater'))).toBe(true);
    // Nothing else hands it out early.
    for (const q of qc.quests.filter((x) => x.line !== 'act3')) expect(q.rewards.regions ?? [], q.id).not.toContain('stillwater');
  });

  it('moves faction reputation both ways, with real faction ids', () => {
    const deltas = act3.flatMap((q) => Object.entries(q.rewards.rep ?? {}));
    expect(deltas.some(([, n]) => n > 0)).toBe(true);
    expect(deltas.some(([, n]) => n < 0)).toBe(true);
    for (const [f] of deltas) expect(FACTIONS).toContain(f);
    const { events } = act3Refs();
    for (const id of events) {
      for (const o of qc.events[id]!.options) {
        for (const f of Object.keys({ ...o.success.reward?.rep, ...o.failure?.reward?.rep })) expect(FACTIONS, `${id} rep`).toContain(f);
      }
    }
  });

  it('every region unlocked by a quest exists', () => {
    const regions = content.exploration.regions.map((r) => r.id);
    for (const q of qc.quests) for (const r of q.rewards.regions ?? []) expect(regions, q.id).toContain(r);
  });
});

describe('the finale', () => {
  const finale = act3[7]!;
  const bossRooms = finale.map.rooms.filter((r) => r.kind === 'boss');

  it('is a two-phase boss: a boss room that leads only on to the objective boss', () => {
    expect(bossRooms).toHaveLength(2);
    const last = bossRooms.find((r) => r.objective)!;
    const first = bossRooms.find((r) => !r.objective)!;
    expect(first.links).toEqual([last.id]);
    // The objective can only be reached through phase one.
    const others = finale.map.rooms.filter((r) => r.id !== first.id);
    expect(others.some((r) => r.links.includes(last.id))).toBe(false);
  });

  it('each phase has at least two telegraphed mechanics, and the last drops a legendary', () => {
    for (const room of bossRooms) {
      const boss = (room.enemies ?? []).map((id) => qc.enemies[id]!).find((e) => e.boss)!;
      expect(boss, room.id).toBeDefined();
      expect(new Set(boss.abilities?.map((a) => a.effect)).size, boss.id).toBeGreaterThanOrEqual(2);
    }
    const last = qc.enemies[bossRooms.find((r) => r.objective)!.enemies![0]!]!;
    expect(Object.keys(last.drop?.fragments ?? {}).some((id) => content.items[id]?.rarity === 'legendary')).toBe(true);
  });
});

describe('Act 3 content', () => {
  const own = questsJson as unknown as { enemies: Record<string, unknown>; events: Record<string, unknown>; contracts: { id: string }[] };
  const { enemies, events } = act3Refs();

  it('adds at least 12 enemies and 12 events, all resolving, with allowed looks', () => {
    const fresh = [...enemies].filter((id) => !/^(clan_|lamp_)/.test(id));
    expect(fresh.length).toBeGreaterThanOrEqual(12);
    expect(events.size).toBeGreaterThanOrEqual(12);
    for (const id of enemies) {
      const e = qc.enemies[id];
      expect(e, id).toBeDefined();
      expect(own.enemies[id], `${id} lives in quests.json`).toBeDefined();
      expect(LOOKS).toContain(e!.look);
    }
    for (const id of events) {
      expect(qc.events[id], id).toBeDefined();
      for (const o of qc.events[id]!.options) if (o.stat) expect(STAT_KEYS).toContain(o.stat);
    }
  });

  it('has at least 4 new contract templates, with faction ones among them', () => {
    const ids = ['c_deep_dive', 'c_night_train', 'c_welfare_check', 'c_lamp_recovery', 'c_seal_inspection'];
    const tpls = ids.map((id) => qc.contracts.find((c) => c.id === id)!);
    for (const [i, t] of tpls.entries()) expect(t, ids[i]).toBeDefined();
    expect(tpls.filter((t) => t.faction).length).toBeGreaterThanOrEqual(4);
    for (const t of tpls) if (t.faction) expect(FACTIONS).toContain(t.faction);
    expect(tpls.some((t) => t.bounty.rarity === 'legendary')).toBe(true);
  });

  it('every map is connected, with one start and an objective reachable last', () => {
    for (const q of act3) {
      expect(q.map.rooms.filter((r) => r.kind === 'start'), q.id).toHaveLength(1);
      expect(reachable(q.map, true).size, q.id).toBe(q.map.rooms.length);
      expect(reachable(q.map, false).size, q.id).toBe(q.map.rooms.length);
      expect(q.map.rooms.some((r) => r.objective), q.id).toBe(true);
    }
  });

  it('has about 8 achievements on Act 3 counters and Stillwater foes', () => {
    const ids = ['act3_first', 'act3_halfway', 'act3_complete', 'quest_party_30', 'quest_party_40', 'bosses_100', 'quest_scrip_250k', 'stillwater_eels', 'stillwater_leviathan'];
    const defs = ids.map((id) => content.achievements.find((a) => a.id === id)!);
    for (const [i, a] of defs.entries()) expect(a, ids[i]).toBeDefined();
    expect(defs.find((a) => a.id === 'act3_complete')!.target).toBe(act3.length);
    const foes = (regionDef(content, 'stillwater')?.enemies ?? []).map((e) => `slain.${e.id}`);
    for (const a of defs.filter((x) => x.stat.startsWith('slain.'))) expect(foes, a.id).toContain(a.stat);
  });

  it('uses only our own names', () => {
    const text = JSON.stringify({ act3, enemies: [...enemies].map((id) => qc.enemies[id]), events: [...events].map((id) => qc.events[id]) });
    expect(text.match(BANNED)?.[0] ?? null).toBeNull();
  });

  it('a strong party (level 38, rare weapons) finishes every Act 3 quest', () => {
    for (const def of act3) {
      const { s, party } = questGame(def, 38, 'coilgun', 3);
      const res = applyCommand(s, content, { type: 'startQuest', questId: def.id, residentIds: party.map((r) => r.id), medpatch: 5 });
      expect(res, def.id).toEqual({ ok: true });
      const q = s.quests[0]!;
      advance(s, content, q.travelTotal + 1);
      playQuest(s, content, q.id);
      expect(q.outcome, def.id).toBe('success');
      expect(q.rooms.every((r) => r.visited), `${def.id} fully explored`).toBe(true);
      advance(s, content, q.travelTotal + 1);
      expect(applyCommand(s, content, { type: 'collectQuest', questId: q.id }).ok).toBe(true);
      expect(s.questsDone).toContain(def.id);
      for (const region of def.rewards.regions ?? []) expect(s.regionsUnlocked).toContain(region);
    }
  });
});

describe('the Stillwater', () => {
  const region = regionDef(content, 'stillwater')!;
  const glass = regionDef(content, 'glassflats')!;

  it('is the hardest region, with enough to find', () => {
    for (const r of content.exploration.regions) if (r.id !== 'stillwater') expect(region.danger, r.id).toBeGreaterThan(r.danger);
    expect(region.enemies.length).toBeGreaterThanOrEqual(14);
    expect(region.locations.length).toBeGreaterThanOrEqual(10);
    expect(region.npcs.length).toBeGreaterThanOrEqual(8);
    const musings = region.musings ?? [];
    expect(musings.length).toBeGreaterThanOrEqual(40);
    expect(new Set(musings).size).toBe(musings.length);
    const top = (xs: { difficulty: number }[]) => Math.max(...xs.map((x) => x.difficulty));
    expect(top(region.enemies)).toBeGreaterThan(top(glass.enemies));
  });

  it('leans its salvage to rare', () => {
    const rarities = region.salvage.map((s) => s.reward.salvage!.rarity);
    expect(region.salvage.length).toBeGreaterThanOrEqual(8);
    expect(rarities.filter((r) => r !== 'common').length).toBeGreaterThan(rarities.length / 2);
    expect(rarities).toContain('legendary');
  });

  it('has lines for everything, real materials and unique ids', () => {
    for (const foe of region.enemies) {
      expect(foe.encounter.length && foe.win.length && foe.retreat.length, foe.id).toBeTruthy();
      expect(foe.maxMinute === null || foe.maxMinute > foe.minMinute, foe.id).toBe(true);
      expect(STAT_KEYS).toContain(foe.stat);
      for (const m of foe.drop?.materials ?? []) expect(MATERIALS, `${foe.id} drop`).toContain(m);
    }
    for (const ev of [...region.locations, ...region.npcs, ...region.salvage]) {
      expect(ev.text && ev.win && ev.fail, ev.id).toBeTruthy();
      expect(STAT_KEYS).toContain(ev.stat);
      for (const m of ev.reward.salvage?.materials ?? []) expect(MATERIALS, `${ev.id} reward`).toContain(m);
    }
    for (const ev of region.salvage) expect(ev.reward.salvage, ev.id).toBeDefined();
    const ids = [...region.enemies, ...region.locations, ...region.npcs, ...region.salvage].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Something to do from the first minute out.
    expect(region.enemies.some((e) => e.minMinute <= 1)).toBe(true);
    expect(region.locations.some((e) => e.minMinute <= 1)).toBe(true);
    expect(region.npcs.some((e) => e.minMinute <= 1)).toBe(true);
    expect(region.salvage.some((e) => e.minMinute <= 1)).toBe(true);
  });

  it('carries faction flavour and uses only our own names', () => {
    const text = JSON.stringify(region);
    for (const word of ['Long Road', 'Lamplighter', 'Scrapwright', 'clan', 'Homestead 9', 'Tier Zero']) expect(text, word).toContain(word);
    expect(text.match(BANNED)?.[0] ?? null).toBeNull();
  });
});

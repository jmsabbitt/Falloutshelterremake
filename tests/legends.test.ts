// M9 stream L: legendary residents, their sources, personal questlines, founding and saves.
import { describe, expect, it } from 'vitest';
import { advance, applyCommand, deserialize, foundHomestead, loadContent, newGame, serialize, STAT_KEYS, type GameState } from '../src/sim';
import { createResident } from '../src/sim/residents';
import { openCrate } from '../src/sim/systems/crates';
import { playQuest } from '../src/sim/systems/questBot';
import { questDef, questLocked } from '../src/sim/systems/quests';
import { traitCombatMult, traitDef, traitsContent, type TraitDef } from '../src/sim/systems/traits';
import {
  canRecallLegend,
  legendDef,
  legendName,
  legendsContent,
  legendStatus,
  recallLegend,
  recruitLegend,
  tickLegends,
  upgradeLegend,
} from '../src/sim/systems/legends';

const content = loadContent();
const lc = legendsContent(content);
const T0 = 1_700_000_000_000;
const IDS = ['marla_voss', 'ada_quill', 'seven', 'doc_ferris', 'lucky_lou', 'pip', 'rook', 'granny_ash', 'brother_wick', 'june_halloran', 'captain_orla'];
const sigTraits = (traitsContent(content) as unknown as { legendaryTraits: TraitDef[] }).legendaryTraits;

function game(seed = 7): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  return s;
}

function addResidents(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) {
    const r = createResident(s, content);
    r.waiting = false;
    s.residents.push(r);
  }
}

const withLegend = (s: GameState, id: string) => s.residents.filter((r) => r.legendary === id);

function admit(s: GameState, id: string): void {
  for (const r of withLegend(s, id)) r.waiting = false;
}

describe('content', () => {
  it('has the eleven legends from the spec, well formed', () => {
    expect(lc.legends.map((l) => l.id).sort()).toEqual([...IDS].sort());
    const names = new Set<string>();
    for (const l of lc.legends) {
      names.add(legendName(l));
      for (const k of STAT_KEYS) {
        expect(l.stats[k], `${l.id}.${k}`).toBeGreaterThanOrEqual(1);
        expect(l.stats[k], `${l.id}.${k}`).toBeLessThanOrEqual(10);
      }
      expect(l.stats[l.speciality], l.id).toBe(10);
      expect(STAT_KEYS.reduce((a, k) => a + l.stats[k], 0), l.id).toBeGreaterThanOrEqual(42);
      expect(l.appearance.skin).toBeLessThan(6);
      expect(l.appearance.hair).toBeLessThan(7);
      if (l.weapon) expect(content.weapons[l.weapon], l.id).toBeDefined();
      if (l.outfit) expect(content.outfits[l.outfit], l.id).toBeDefined();
      expect(l.bio.length).toBeGreaterThan(20);
      expect(l.notes).toHaveLength(3);
      for (const t of [l.trait, l.awakened]) {
        const def = sigTraits.find((d) => d.id === t);
        expect(def, `${l.id} ${t}`).toBeDefined();
        expect(def!.weight).toBe(0);
        expect(def!.effects.length).toBeGreaterThan(0);
      }
    }
    expect(names.size).toBe(11);
    expect(new Set(sigTraits.map((t) => t.id)).size).toBe(22);
    // Signature traits never join the random pool.
    for (const t of sigTraits) expect(traitsContent(content).traits.some((d) => d.id === t.id)).toBe(false);
  });

  it('gives every legend a two-quest personal questline gated on them, ending in an upgrade', () => {
    for (const id of IDS) {
      const line = lc.questlines.find((q) => q.legend === id)!;
      expect(line, id).toBeDefined();
      expect(line.quests).toHaveLength(2);
      const [a, b] = line.quests.map((q) => questDef(content, q)!);
      expect(a!.requires).toEqual({ quests: [], legend: id });
      expect(b!.requires).toEqual({ quests: [a!.id], legend: id });
      expect(b!.level).toBeGreaterThan(a!.level);
      expect((b!.rewards as { legendUpgrade?: string }).legendUpgrade).toBe(id);
      expect(content.quests.questlines.some((q) => q.id === line.id)).toBe(true);
    }
  });
});

describe('recruitLegend', () => {
  it('puts the legend at the door with their fixed looks, stats, gear and trait, once per lifetime', () => {
    const s = game();
    const n = s.residents.length;
    expect(recruitLegend(s, content, 'marla_voss', 'dev')).toBeNull();
    expect(s.residents).toHaveLength(n + 1);
    const r = withLegend(s, 'marla_voss')[0]!;
    const def = legendDef(content, 'marla_voss')!;
    expect(r.waiting).toBe(true);
    expect(r.rarity).toBe('legendary');
    expect(r.firstName).toBe('Marla');
    expect(r.lastName).toBe('Voss');
    expect(r.stats).toEqual(def.stats);
    expect(r.appearance).toEqual(def.appearance);
    expect(r.traits).toEqual([def.trait]);
    expect(r.weapon).toBe(def.weapon);
    expect(r.outfit).toBe(def.outfit);
    expect(r.level).toBe(def.level);
    expect(r.hp).toBe(r.maxHp);
    expect(r.maxHp).toBeGreaterThan(105);
    expect(s.legends.recruited).toEqual(['marla_voss']);
    expect(s.events.some((e) => (e as { type: string }).type === 'legendArrived')).toBe(true);
    expect(s.stats['legendsRecruited']).toBe(1);
    expect(recruitLegend(s, content, 'marla_voss', 'dev')).toBe('already joined');
    expect(recruitLegend(s, content, 'nobody', 'dev')).toBe('no such legend');
    expect(s.residents).toHaveLength(n + 1);
    advance(s, content, 2);
    expect(s.achievements['legend_first']).toBeDefined();
    expect(s.achievements['legendary_resident']).toBeDefined();
  });

  it('queues a legend at a full door (Skeleton Crew) and lets them in once there is room', () => {
    const s = game();
    s.rules.ids = ['skeleton_crew'];
    addResidents(s, 60 - s.residents.length);
    expect(recruitLegend(s, content, 'rook', 'boss')).toBeNull();
    expect(withLegend(s, 'rook')).toHaveLength(0);
    expect(legendStatus(s, 'rook')).toBe('queued');
    expect(recruitLegend(s, content, 'rook', 'boss')).toBe('already on the way');
    advance(s, content, 5);
    expect(withLegend(s, 'rook')).toHaveLength(0);
    s.residents.splice(0, 1);
    advance(s, content, 1);
    expect(withLegend(s, 'rook')).toHaveLength(1);
    expect(legendStatus(s, 'rook')).toBe('here');
    expect(s.stats['legendsFrom.boss']).toBe(1);
  });
});

describe('sources recruit exactly once', () => {
  it('faction standing: Allied caravaners and tinkers, Friendly Homestead 9', () => {
    const s = game();
    s.factions['caravaners'] = { rep: 59, met: true };
    s.factions['tinkers'] = { rep: 70, met: false };
    s.factions['homestead9'] = { rep: 30, met: true };
    advance(s, content, 3);
    expect(withLegend(s, 'marla_voss')).toHaveLength(0); // Friendly is not enough
    expect(withLegend(s, 'ada_quill')).toHaveLength(0); // not met yet
    expect(withLegend(s, 'seven')).toHaveLength(1);
    s.factions['caravaners']!.rep = 60;
    s.factions['tinkers']!.met = true;
    advance(s, content, 3);
    advance(s, content, 10);
    for (const id of ['marla_voss', 'ada_quill', 'seven']) expect(withLegend(s, id), id).toHaveLength(1);
    expect(s.stats['legendsFrom.faction']).toBe(3);
  });

  it('a Deep discovery brings Pip', () => {
    const s = game();
    s.deep.discoveries.push('s2_gauge');
    advance(s, content, 2);
    expect(withLegend(s, 'pip')).toHaveLength(0);
    s.deep.discoveries.push('s2_skiff');
    advance(s, content, 5);
    expect(withLegend(s, 'pip')).toHaveLength(1);
  });

  it('the Legendary Supply Crate sometimes brings Lucky Lou, only ever once', () => {
    const s = game(3);
    s.crates.legendary = 200;
    let lou = 0;
    for (let i = 0; i < 200; i++) {
      const cards = openCrate(s, content, 'legendary');
      expect(cards).toHaveLength(5);
      const last = cards[4]!;
      if (last.kind === 'resident' && s.residents.find((r) => r.id === last.residentId)?.legendary === 'lucky_lou') lou++;
    }
    expect(lou).toBe(1);
    expect(withLegend(s, 'lucky_lou')).toHaveLength(1);
    // Standard crates never bring him.
    const t = game(3);
    t.crates.standard = 100;
    for (let i = 0; i < 100; i++) openCrate(t, content, 'standard');
    expect(withLegend(t, 'lucky_lou')).toHaveLength(0);
  });

  /** A homestead of 50+ with a staffed, powered radio room (legend ticks driven directly). */
  function radioGame(seed: number): GameState {
    const s = game(seed);
    addResidents(s, 50 - s.residents.length);
    const room = { id: s.nextId++, type: 'radio', floor: 0, x: 10, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 };
    s.rooms.push(room);
    s.residents[0]!.roomId = room.id;
    return s;
  }

  function ticks(s: GameState, dt: number, seconds: number): number | null {
    for (let t = 0; t < seconds; t += dt) {
      tickLegends(s, content, dt, dt > 1);
      if (withLegend(s, 'doc_ferris').length) return t + dt;
    }
    return null;
  }

  it('the radio brings Doc Ferris at 50+, the same with 1 s and 60 s steps', () => {
    const a = radioGame(11);
    const b = structuredClone(a);
    const ta = ticks(a, 1, 400 * 3600);
    const tb = ticks(b, 60, 400 * 3600);
    expect(ta).not.toBeNull();
    expect(Math.ceil(ta! / 3600)).toBe(Math.ceil(tb! / 3600));
    expect(a.legends).toEqual(b.legends);
    expect(withLegend(a, 'doc_ferris')).toHaveLength(1);
    ticks(a, 60, 100 * 3600);
    expect(withLegend(a, 'doc_ferris')).toHaveLength(1);
  });

  it('the radio legend needs population 50 and stays silent under No Radio', () => {
    const small = radioGame(11);
    small.residents.splice(10);
    small.residents[0]!.roomId = small.rooms[small.rooms.length - 1]!.id;
    expect(ticks(small, 60, 300 * 3600)).toBeNull();
    const quiet = radioGame(11);
    quiet.rules.ids = ['no_radio'];
    expect(ticks(quiet, 60, 300 * 3600)).toBeNull();
    expect(quiet.legends.radio).toBeUndefined();
  });

  it('a quest reward recruits through recruitLegend once', () => {
    const s = game();
    expect(recruitLegend(s, content, 'captain_orla', 'quest')).toBeNull();
    expect(recruitLegend(s, content, 'captain_orla', 'quest')).toBe('already joined');
    expect(withLegend(s, 'captain_orla')).toHaveLength(1);
  });
});

describe('personal questlines', () => {
  it('open only while the legend lives here, admitted, and in order', () => {
    const s = game();
    const q1 = questDef(content, 'lg_marla_1')!;
    const q2 = questDef(content, 'lg_marla_2')!;
    expect(questLocked(s, content, q1)).toMatch(/particular resident/);
    recruitLegend(s, content, 'marla_voss', 'dev');
    expect(questLocked(s, content, q1)).toMatch(/particular resident/); // still at the door
    admit(s, 'marla_voss');
    expect(questLocked(s, content, q1)).toBeNull();
    expect(questLocked(s, content, q2)).toMatch(/Toll Road|first/i);
    withLegend(s, 'marla_voss')[0]!.dead = true;
    expect(questLocked(s, content, q1)).toMatch(/particular resident/);
  });

  it('a strong party finishes every legend quest, and the second one awakens the legend', () => {
    for (const line of lc.questlines) {
      const s = game(21);
      s.resources.medpatch = 20;
      s.peakPopulation = 120;
      s.rooms.push({ id: s.nextId++, type: 'office', floor: 0, x: 13, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 });
      recruitLegend(s, content, line.legend, 'dev');
      admit(s, line.legend);
      for (const qid of line.quests) {
        const def = questDef(content, qid)!;
        const party = s.residents.filter((r) => !r.legendary).slice(0, 3);
        for (const r of party) {
          r.level = def.level + 3;
          r.maxHp = r.hp = 105 + 8 * r.level;
          r.weapon = def.level >= 20 ? 'glare_lance' : 'coilgun';
        }
        const res = applyCommand(s, content, { type: 'startQuest', questId: qid, residentIds: party.map((r) => r.id), medpatch: 5 });
        expect(res, qid).toEqual({ ok: true });
        const q = s.quests[0]!;
        advance(s, content, q.travelTotal + 1);
        playQuest(s, content, q.id, { step: 0.5 });
        expect(q.outcome, qid).toBe('success');
        advance(s, content, q.travelTotal + 1);
        expect(applyCommand(s, content, { type: 'collectQuest', questId: q.id }).ok, qid).toBe(true);
        s.resources.medpatch = 20;
      }
      advance(s, content, 1);
      const def = legendDef(content, line.legend)!;
      const r = withLegend(s, line.legend)[0]!;
      expect(r.traits, line.legend).toContain(def.awakened);
      expect(r.traits).not.toContain(def.trait);
      for (const k of STAT_KEYS) expect(r.stats[k]).toBe(Math.min(10, def.stats[k] + 1));
      expect(s.stats['legendQuestlinesDone']).toBe(1);
      expect(s.achievements['legend_line_first']).toBeDefined();
      expect(upgradeLegend(s, content, line.legend)).toBe('already awakened');
    }
  }, 60_000);
});

describe('founding, outposts and Survival', () => {
  function chartered(seed = 4): GameState {
    const s = game(seed);
    addResidents(s, 100 - s.residents.length);
    s.peakPopulation = 100;
    s.questsDone = ['act1_1', 'act1_2', 'act1_3', 'act1_4', 'act1_5', 'act1_6'];
    s.time = 5 * 86400;
    return s;
  }

  it('a legend in the founding party comes along; one left behind can be sent for', () => {
    const old = chartered();
    recruitLegend(old, content, 'rook', 'dev');
    recruitLegend(old, content, 'pip', 'dev');
    admit(old, 'rook');
    admit(old, 'pip');
    const rook = withLegend(old, 'rook')[0]!;
    const others = old.residents.filter((r) => !r.legendary && !r.waiting).slice(0, 2).map((r) => r.id);
    const res = foundHomestead(old, content, { siteId: 'plot7', partyIds: [rook.id, ...others], heirloomIds: [], now: T0 + 1000 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const s = res.state;
    const carried = withLegend(s, 'rook');
    expect(carried).toHaveLength(1);
    expect(carried[0]!.stats).toEqual(rook.stats);
    expect(carried[0]!.traits).toEqual(rook.traits);
    expect(s.legends.recruited.sort()).toEqual(['pip', 'rook']);
    expect(legendStatus(s, 'pip')).toBe('outpost');
    // Pip's source firing again does not bring a second Pip.
    s.deep.discoveries.push('s2_skiff');
    s.nextIncidentAt = 1e12;
    s.nextWandererAt = 1e12;
    advance(s, content, 3);
    expect(withLegend(s, 'pip')).toHaveLength(0);
    expect(withLegend(s, 'rook')).toHaveLength(1);
    s.scrip = 0;
    expect(canRecallLegend(s, content, 'pip')).toMatch(/scrip/);
    s.scrip = 10_000;
    expect(recallLegend(s, content, 'pip')).toBeNull();
    expect(withLegend(s, 'pip')).toHaveLength(1);
    expect(recallLegend(s, content, 'pip')).toBe('already here');
    expect(s.stats['legendsRecruited']).toBe(2);
  });

  it('in Survival a fallen legend is gone for good', () => {
    const s = game();
    s.rules.survival = true;
    recruitLegend(s, content, 'granny_ash', 'cache');
    admit(s, 'granny_ash');
    withLegend(s, 'granny_ash')[0]!.dead = true;
    advance(s, content, 1);
    expect(legendStatus(s, 'granny_ash')).toBe('lost');
    expect(s.legends.lost).toEqual(['granny_ash']);
    // Her story has ended, so the all-stories achievement stays reachable.
    expect(s.stats['legendStoriesEnded']).toBe(1);
    expect(s.stats['legendQuestlinesDone'] ?? 0).toBe(0);
    s.residents = s.residents.filter((r) => !r.legendary);
    expect(canRecallLegend(s, content, 'granny_ash')).toBe('gone for good');
    // Without Survival the fallen stay revivable.
    const t = game();
    recruitLegend(t, content, 'granny_ash', 'cache');
    withLegend(t, 'granny_ash')[0]!.dead = true;
    advance(t, content, 1);
    expect(legendStatus(t, 'granny_ash')).toBe('here');
  });
});

describe('signature traits', () => {
  it('are not passed on to children', () => {
    const s = game();
    const kid = createResident(s, content);
    kid.waiting = false;
    kid.traits = ['ring_champion', 'loner'];
    s.residents.push(kid);
    advance(s, content, 1);
    expect(kid.traits).toEqual(['loner']);
  });

  it.skipIf(!traitDef(content, 'ring_champion'))('work through the trait-effect system (needs the traits.ts patch)', () => {
    const s = game();
    recruitLegend(s, content, 'rook', 'dev');
    const rook = withLegend(s, 'rook')[0]!;
    expect(traitCombatMult(content, rook)).toBeCloseTo(1.3);
    upgradeLegend(s, content, 'rook');
    expect(traitCombatMult(content, rook)).toBeCloseTo(1.45);
  });
});

describe('saves', () => {
  it('round-trip legends, the queue, radio progress and the collection', () => {
    const s = game();
    recruitLegend(s, content, 'seven', 'faction');
    s.legends.queued = [{ id: 'rook', source: 'boss' }];
    s.legends.lost = ['pip'];
    s.legends.radio = { seconds: 1234, rng: [1, 2, 3, 4] };
    advance(s, content, 2);
    const back = deserialize(serialize(s, T0));
    expect(back.legends).toEqual(s.legends);
    expect(back.collection).toEqual(s.collection);
    expect(withLegend(back, 'seven')[0]!.legendary).toBe('seven');
  });
});

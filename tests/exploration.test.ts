import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  canExplore,
  carriedCount,
  catchUp,
  CARRY_LIMIT,
  deserialize,
  effectiveMaxHp,
  livingResidents,
  loadContent,
  MAX_EXPLORERS,
  MAX_SUPPLIES,
  newGame,
  population,
  secondsUntilHome,
  serialize,
  type Expedition,
  type GameState,
  type Resident,
} from '../src/sim';
import { createResident } from '../src/sim/residents';
import { regionDef, tickExpeditions } from '../src/sim/systems/exploration';

const content = loadContent();
const T0 = 1_700_000_000_000;
const HOUR = 3600;

/** A game with incidents and wanderers pushed far away and plenty of supplies. */
function calm(seed = 21): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.scrip = 50_000;
  s.resources.medpatch = 100;
  s.resources.purge = 100;
  return s;
}

function first(s: GameState): Resident {
  const r = s.residents.find((x) => !x.waiting && !x.dead);
  if (!r) throw new Error('no resident');
  return r;
}

/** A sturdy explorer so long trips aren't cut short by death. */
function toughen(r: Resident, level = 20): Resident {
  for (const k of Object.keys(r.stats) as (keyof Resident['stats'])[]) r.stats[k] = Math.max(r.stats[k], 7);
  r.level = level;
  r.maxHp = 250;
  r.hp = 250;
  r.weapon = 'coilgun';
  r.outfit = 'tunneler_gear';
  return r;
}

function send(s: GameState, r: Resident, medpatch = 10, purge = 10): Expedition {
  const res = applyCommand(s, content, { type: 'explore', residentId: r.id, regionId: 'dustbowl', medpatch, purge });
  if (!res.ok) throw new Error(res.reason);
  const e = s.expeditions.find((x) => x.residentId === r.id);
  if (!e) throw new Error('no expedition');
  return e;
}

function offline(s: GameState, seconds: number) {
  return catchUp(s, content, s.lastRealTime + seconds * 1000);
}

function lootUnits(e: Expedition): number {
  return carriedCount(e) + Object.values(e.loot.fragments).reduce((a, b) => a + b, 0) + e.loot.recipes.length;
}

describe('exploration content', () => {
  const region = regionDef(content, 'dustbowl');

  it('has the Dustbowl Flats tables with lines for everything', () => {
    expect(region).toBeDefined();
    if (!region) return;
    expect(region.enemies.length).toBeGreaterThanOrEqual(25);
    expect(region.locations.length).toBeGreaterThanOrEqual(15);
    expect(region.npcs.length).toBeGreaterThanOrEqual(10);
    expect(region.salvage.length).toBeGreaterThanOrEqual(10);
    for (const foe of region.enemies) {
      expect(foe.encounter.length, foe.id).toBeGreaterThan(0);
      expect(foe.win.length, foe.id).toBeGreaterThan(0);
      expect(foe.retreat.length, foe.id).toBeGreaterThan(0);
      expect(foe.maxMinute === null || foe.maxMinute > foe.minMinute).toBe(true);
    }
    for (const ev of [...region.locations, ...region.npcs, ...region.salvage]) {
      expect(ev.text && ev.win && ev.fail, ev.id).toBeTruthy();
    }
    for (const ev of region.salvage) {
      const s = ev.reward.salvage;
      expect(s, ev.id).toBeDefined();
      for (const m of s?.materials ?? []) {
        expect(content.salvageList.some((x) => x.material === m && x.rarity === s?.rarity), `${ev.id} ${m}`).toBe(true);
      }
    }
    const ids = [...region.enemies, ...region.locations, ...region.npcs, ...region.salvage].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect((content.exploration as unknown as { musings: string[] }).musings.length).toBeGreaterThanOrEqual(60);
  });

  it('keeps to original names', () => {
    const text = JSON.stringify(content.exploration).toLowerCase();
    for (const banned of ['fallout', 'vault-tec', 'nuka', 'deathclaw', 'stimpak', 'radaway', 'brahmin', 'pip-boy', 'mr. handy', 'super mutant', 'ghoul', 'radroach', 'mirelurk', 'yao guai', 'enclave', 'brotherhood', 'red rocket']) {
      expect(text.includes(banned), banned).toBe(false);
    }
  });

  it('has achievements that watch counters the system bumps', () => {
    const achievements = (content.exploration as unknown as { achievements: { id: string; stat: string }[] }).achievements;
    expect(achievements.length).toBeGreaterThanOrEqual(10);
    const known = ['expeditionsCompleted', 'explorerSeconds', 'longestExpedition', 'encountersWon', 'glarelandsScrip', 'npcsMet', 'locationsExplored', 'slain.mauler', 'explorerDeaths'];
    for (const a of achievements) expect(known, a.id).toContain(a.stat);
    for (const a of achievements) expect(content.achievements.some((x) => x.id === a.id)).toBe(true);
  });
});

describe('sending explorers out', () => {
  it('validates who can go, where and with what', () => {
    const s = calm();
    const r = first(s);
    expect(canExplore(s, content, r)).toBeNull();

    const waiting = createResident(s, content);
    s.residents.push(waiting);
    expect(canExplore(s, content, waiting)).toMatch(/let them in/);

    const child = createResident(s, content);
    child.waiting = false;
    child.adultAt = s.time + 1000;
    s.residents.push(child);
    expect(canExplore(s, content, child)).toMatch(/too young/);

    const mom = s.residents.find((x) => x.sex === 'f' && !x.waiting && x !== child) as Resident;
    mom.pregnancy = { fatherId: r.id, dueAt: s.time + 5000 };
    expect(canExplore(s, content, mom)).toMatch(/expecting/);
    mom.pregnancy = null;

    const cmd = (medpatch: number, purge: number, regionId = 'dustbowl') =>
      applyCommand(s, content, { type: 'explore', residentId: r.id, regionId, medpatch, purge });
    expect(cmd(1, 1, 'moon').ok).toBe(false);
    s.regionsUnlocked = [];
    expect(cmd(1, 1).ok).toBe(false);
    s.regionsUnlocked = ['dustbowl'];
    expect(cmd(MAX_SUPPLIES + 1, 0).ok).toBe(false);
    expect(cmd(-1, 0).ok).toBe(false);
    expect(cmd(1.5, 0).ok).toBe(false);
    s.resources.medpatch = 3;
    expect(cmd(4, 0).ok).toBe(false);
    s.resources.medpatch = 100;

    const res = cmd(5, 2);
    expect(res.ok).toBe(true);
    expect(s.resources.medpatch).toBe(95);
    expect(s.resources.purge).toBe(98);
    expect(r.roomId).toBeNull();
    const e = s.expeditions[0] as Expedition;
    expect(r.expedition).toBe(e.id);
    expect(e.status).toBe('exploring');
    expect(e.supplies).toEqual({ medpatch: 5, purge: 2 });
    expect(e.journal.length).toBe(1);
    expect(s.events.some((x) => x.type === 'expeditionStarted' && x.expeditionId === e.id)).toBe(true);
    expect(canExplore(s, content, r)).toMatch(/already/);
    expect(cmd(0, 0).ok).toBe(false);

    // Away residents are out of the homestead but keep their bed.
    expect(livingResidents(s)).not.toContain(r);
    expect(applyCommand(s, content, { type: 'assign', residentId: r.id, roomId: s.rooms[2]!.id }).ok).toBe(false);

    r.dead = true;
    expect(canExplore(s, content, r)).toMatch(/fallen/);
  });

  it('allows at most MAX_EXPLORERS at once', () => {
    const s = calm();
    s.resources.medpatch = 0;
    s.resources.purge = 0;
    for (let i = 0; i < MAX_EXPLORERS + 1; i++) {
      const r = createResident(s, content);
      r.waiting = false;
      s.residents.push(r);
    }
    const idle = s.residents.filter((r) => r.expedition === null && !r.waiting);
    let sent = 0;
    for (const r of idle) if (applyCommand(s, content, { type: 'explore', residentId: r.id, regionId: 'dustbowl', medpatch: 0, purge: 0 }).ok) sent++;
    expect(sent).toBe(MAX_EXPLORERS);
    const left = s.residents.find((r) => r.expedition === null && !r.waiting) as Resident;
    expect(canExplore(s, content, left)).toMatch(/no more than/);
  });
});

describe('while exploring', () => {
  it('accrues finds, scrip, XP and journal entries over time', () => {
    const s = calm();
    const r = toughen(first(s), 10);
    const xp0 = r.xp + r.level * 1e6;
    const e = send(s, r);
    offline(s, 6 * HOUR);
    expect(e.status).toBe('exploring');
    expect(e.elapsed).toBeCloseTo(6 * HOUR, 0);
    expect(e.loot.scrip).toBeGreaterThan(0);
    expect(e.loot.items.length).toBeGreaterThanOrEqual(3);
    expect(lootUnits(e)).toBeGreaterThan(5);
    expect(r.xp + r.level * 1e6).toBeGreaterThan(xp0);
    expect(e.journal.some((j) => j.kind === 'musing')).toBe(true);
    expect(e.journal.some((j) => j.kind === 'fight')).toBe(true);
    // Journal entries are in time order.
    for (let i = 1; i < e.journal.length; i++) expect(e.journal[i]!.t).toBeGreaterThanOrEqual(e.journal[i - 1]!.t);
    expect(s.stats['explorerSeconds']).toBeCloseTo(6 * HOUR, 0);
  });

  it('works the same online (1 s steps) and offline (60 s steps)', () => {
    const online = calm(5);
    const off = calm(5);
    const eOn = send(online, toughen(first(online)));
    const eOff = send(off, toughen(first(off)));
    advance(online, content, 2 * HOUR);
    offline(off, 2 * HOUR);
    // Different RNG interleaving with other systems, but the same kind of trip.
    for (const e of [eOn, eOff]) {
      expect(e.elapsed).toBeCloseTo(2 * HOUR, 0);
      expect(e.loot.items.length + Object.keys(e.loot.fragments).length + e.loot.recipes.length).toBeGreaterThanOrEqual(1);
      expect(e.journal.length).toBeGreaterThan(5);
    }
  });

  it('gives the same results for the same seed', () => {
    const run = () => {
      const s = calm(99);
      send(s, toughen(first(s)));
      offline(s, 8 * HOUR);
      return JSON.stringify({ e: s.expeditions, r: s.residents, stats: s.stats, rng: s.rng });
    };
    expect(run()).toBe(run());
  });

  it('a 10-hour catch-up produces loot and journal entries', () => {
    const s = calm(7);
    const r = toughen(first(s));
    const e = send(s, r, 25, 25);
    const summary = offline(s, 10 * HOUR);
    expect(summary.seconds).toBe(10 * HOUR);
    expect(e.status).toBe('exploring');
    expect(e.loot.scrip).toBeGreaterThan(100);
    expect(lootUnits(e)).toBeGreaterThan(10);
    expect(e.journal.length).toBeGreaterThan(30);
    expect(e.journal.length).toBeLessThanOrEqual(150);
    expect(s.stats['encountersWon'] ?? 0).toBeGreaterThan(0);
  });

  it('never finds legendary weapons or outfits whole', () => {
    const s = calm(3);
    const r = toughen(first(s), 40);
    const e = send(s, r, 25, 25);
    for (let i = 0; i < 60 && e.status === 'exploring'; i++) {
      tickExpeditions(s, content, HOUR);
      e.loot.items = [];
      e.loot.salvage = {};
      expect(r.weapon === null || content.items[r.weapon]?.rarity !== 'legendary').toBe(true);
    }
    const all = s.events.filter((x) => x.type === 'expeditionJournal');
    expect(all.length).toBeGreaterThan(0);
    expect(e.loot.items.every((id) => content.items[id]?.rarity !== 'legendary')).toBe(true);
  });

  it('keeps the journal capped, dropping musings first', () => {
    const s = calm(8);
    const r = toughen(first(s), 45);
    const e = send(s, r, 25, 25);
    for (let i = 0; i < 40 && e.status === 'exploring'; i++) {
      tickExpeditions(s, content, HOUR);
      e.loot.items = [];
      e.loot.salvage = {};
    }
    expect(e.journal.length).toBeLessThanOrEqual(150);
    expect(e.journal[0]!.kind).not.toBe('musing');
  });

  it('uses Med-Patches and Purge automatically', () => {
    const s = calm();
    const r = toughen(first(s));
    const e = send(s, r, 3, 3);
    r.hp = effectiveMaxHp(r) * 0.4;
    tickExpeditions(s, content, 1);
    expect(e.supplies.medpatch).toBe(2);
    expect(r.hp).toBeGreaterThan(effectiveMaxHp(r) * 0.5);

    r.taint = r.maxHp * 0.6;
    tickExpeditions(s, content, 1);
    expect(e.supplies.purge).toBe(2);
    expect(r.taint).toBeLessThan(r.maxHp * 0.5);
    expect(s.stats['explorerMedpatches']).toBe(1);
    expect(s.stats['explorerPurges']).toBe(1);
  });

  it('builds up taint over time unless Grit is 11 or more', () => {
    const s = calm();
    const a = toughen(first(s));
    a.outfit = null;
    a.stats.grit = 5;
    const b = toughen(s.residents.find((x) => x !== a && !x.waiting) as Resident);
    b.stats.grit = 6; // + Tunneler Gear's 5 = 11
    send(s, a, 25, 0);
    send(s, b, 25, 0);
    tickExpeditions(s, content, 4 * HOUR);
    expect(a.taint).toBeGreaterThan(0);
    expect(b.taint).toBe(0);
  });

  it('starts home automatically at the carry limit', () => {
    const s = calm();
    const r = toughen(first(s));
    const e = send(s, r);
    e.loot.salvage['tin_cans'] = CARRY_LIMIT - 1;
    for (let i = 0; i < 12 && e.status === 'exploring'; i++) tickExpeditions(s, content, 600);
    expect(e.status).toBe('returning');
    expect(carriedCount(e)).toBe(CARRY_LIMIT);
    expect(s.events.some((x) => x.type === 'expeditionReturning' && x.reason === 'full')).toBe(true);
  });
});

describe('coming home', () => {
  it('the trip back takes half the time spent out (at least a minute)', () => {
    const s = calm();
    const r = toughen(first(s));
    const e = send(s, r);
    tickExpeditions(s, content, 2 * HOUR);
    expect(applyCommand(s, content, { type: 'recall', expeditionId: e.id }).ok).toBe(true);
    expect(e.status).toBe('returning');
    expect(secondsUntilHome(e)).toBe(HOUR);
    expect(applyCommand(s, content, { type: 'recall', expeditionId: e.id }).ok).toBe(false);
    const loot = JSON.stringify(e.loot);
    tickExpeditions(s, content, HOUR - 1);
    expect(e.status).toBe('returning');
    expect(e.elapsed).toBe(2 * HOUR);
    expect(JSON.stringify(e.loot)).toBe(loot); // nothing happens on the road home
    tickExpeditions(s, content, 1);
    expect(e.status).toBe('returned');
    expect(s.events.some((x) => x.type === 'expeditionReturned' && x.expeditionId === e.id)).toBe(true);

    const r2 = toughen(s.residents.find((x) => x.expedition === null && !x.waiting) as Resident);
    const quick = send(s, r2);
    tickExpeditions(s, content, 10);
    applyCommand(s, content, { type: 'recall', expeditionId: quick.id });
    expect(secondsUntilHome(quick)).toBe(60);
  });

  it('collect moves the loot into the homestead and puts the resident back', () => {
    const s = calm();
    const r = toughen(first(s));
    s.resources.medpatch = 5;
    s.resources.purge = 5;
    const e = send(s, r, 4, 3);
    expect(applyCommand(s, content, { type: 'collectExpedition', expeditionId: e.id }).ok).toBe(false);
    tickExpeditions(s, content, 1);
    e.loot = {
      scrip: 321,
      items: ['wrench', 'lab_smock'],
      salvage: { tin_cans: 4, relay_board: 1 },
      fragments: { scattergun: 1 },
      recipes: ['arc_pistol'],
    };
    e.supplies = { medpatch: 2, purge: 1 };
    applyCommand(s, content, { type: 'recall', expeditionId: e.id });
    tickExpeditions(s, content, 60);
    expect(e.status).toBe('returned');

    const scrip0 = s.scrip;
    const items0 = s.items.length;
    expect(applyCommand(s, content, { type: 'collectExpedition', expeditionId: e.id }).ok).toBe(true);
    expect(s.scrip).toBeGreaterThanOrEqual(scrip0 + 321);
    expect(s.items.length).toBe(items0 + 2);
    expect(s.salvage['tin_cans']).toBe(4);
    expect(s.salvage['relay_board']).toBe(1);
    expect(s.fragments['scattergun']).toBe(1);
    expect(s.recipes).toContain('arc_pistol');
    expect(s.resources.medpatch).toBe(3);
    expect(s.resources.purge).toBe(3);
    expect(r.expedition).toBeNull();
    expect(r.roomId).toBeNull();
    expect(s.expeditions).toHaveLength(0);
    expect(livingResidents(s)).toContain(r);
    expect(s.events.some((x) => x.type === 'expeditionCollected' && x.loot.scrip === 321)).toBe(true);
    expect(s.stats['expeditionsCompleted']).toBe(1);
    expect(s.stats['glarelandsScrip']).toBe(321);
    expect(s.achievements['explore_first']).toBeDefined();
    expect(applyCommand(s, content, { type: 'collectExpedition', expeditionId: e.id }).ok).toBe(false);
    expect(canExplore(s, content, r)).toBeNull();
  });
});

describe('death in the Glarelands', () => {
  function killed(): { s: GameState; r: Resident; e: Expedition } {
    const s = calm();
    const r = toughen(first(s));
    const e = send(s, r, 0, 0);
    tickExpeditions(s, content, 3 * HOUR);
    r.taint = r.maxHp; // the Glare finishes them off
    tickExpeditions(s, content, 1);
    return { s, r, e };
  }

  it('dies with no supplies left, and revive resumes the trip', () => {
    const { s, r, e } = killed();
    expect(e.status).toBe('dead');
    expect(r.dead).toBe(true);
    expect(s.events.some((x) => x.type === 'explorerDied' && x.residentId === r.id)).toBe(true);
    const at = e.elapsed;
    tickExpeditions(s, content, HOUR);
    expect(e.elapsed).toBe(at); // time stops for the fallen

    expect(applyCommand(s, content, { type: 'revive', residentId: r.id }).ok).toBe(true);
    expect(r.dead).toBe(false);
    expect(e.status).toBe('exploring');
    expect(r.hp).toBeGreaterThan(0);
    expect(r.taint).toBeLessThanOrEqual(r.maxHp * 0.5);
    tickExpeditions(s, content, 600);
    expect(e.elapsed).toBe(at + 600);
    expect(e.journal.some((j) => /Revived|Back from the dead|Woke up/.test(j.text))).toBe(true);
  });

  it('recalling the fallen brings the body home with half the loot', () => {
    const { s, r, e } = killed();
    e.loot = { scrip: 100, items: ['wrench', 'wrench', 'lab_smock', 'flare_gun'], salvage: { tin_cans: 6, vacuum_tube: 1 }, fragments: {}, recipes: [] };
    const pop = population(s);
    expect(applyCommand(s, content, { type: 'recall', expeditionId: e.id }).ok).toBe(true);
    expect(e.status).toBe('returning');
    expect(e.loot.scrip).toBe(50);
    expect(e.loot.items).toHaveLength(2);
    expect(e.loot.salvage).toEqual({ tin_cans: 3 });
    tickExpeditions(s, content, e.returnRemaining);
    expect(e.status).toBe('returned');
    expect(applyCommand(s, content, { type: 'collectExpedition', expeditionId: e.id }).ok).toBe(true);
    expect(r.dead).toBe(true);
    expect(r.expedition).toBeNull();
    expect(population(s)).toBe(pop);
    expect(s.salvage['tin_cans']).toBe(3);
    // Back inside as a fallen resident: revive or lay to rest as usual.
    expect(applyCommand(s, content, { type: 'revive', residentId: r.id }).ok).toBe(true);
    expect(r.dead).toBe(false);
    expect(s.expeditions).toHaveLength(0);
  });

  it('a weak explorer eventually falls on a long trip', () => {
    const s = calm(4);
    const r = first(s);
    r.weapon = null;
    r.outfit = null;
    const e = send(s, r, 5, 0);
    offline(s, 72 * HOUR);
    expect(['dead', 'returning', 'returned']).toContain(e.status);
    if (e.status === 'dead') expect(e.elapsed).toBeGreaterThan(2 * HOUR);
  });
});

describe('saves and speed', () => {
  it('a save round-trips mid-expedition', () => {
    const s = calm(12);
    send(s, toughen(first(s)));
    offline(s, 3 * HOUR);
    const copy = deserialize(serialize(s, T0));
    expect(copy.expeditions).toEqual(s.expeditions);
    tickExpeditions(s, content, 2 * HOUR);
    tickExpeditions(copy, content, 2 * HOUR);
    expect(JSON.stringify(copy.expeditions)).toBe(JSON.stringify(s.expeditions));
    expect(JSON.stringify(copy.residents)).toBe(JSON.stringify(s.residents));
  });

  it('25 explorers over 72 h offline in under 2 s', () => {
    const s = calm(13);
    s.resources.medpatch = 1000;
    s.resources.purge = 1000;
    while (s.residents.filter((r) => !r.waiting).length < 25) {
      const r = createResident(s, content);
      r.waiting = false;
      s.residents.push(r);
    }
    for (const r of s.residents.filter((x) => !x.waiting).slice(0, 25)) send(s, toughen(r, 30), 25, 25);
    expect(s.expeditions).toHaveLength(25);
    const t0 = performance.now();
    offline(s, 72 * HOUR);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(2000);
    expect(s.expeditions.every((e) => e.status !== 'exploring' || e.elapsed > 70 * HOUR)).toBe(true);
  });
});

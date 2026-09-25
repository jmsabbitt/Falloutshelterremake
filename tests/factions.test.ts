import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  catchUp,
  deserialize,
  livingResidents,
  loadContent,
  newGame,
  serialize,
  type GameState,
  type Resident,
  type Room,
} from '../src/sim';
import type { Content, RoomDef } from '../src/sim/content';
import {
  caravanEstimate,
  changeRep,
  collectCaravan,
  factionDef,
  factionsContent,
  factionTier,
  raidRateMult,
  recallCaravan,
  refreshTrade,
  repOf,
  repTier,
  sendCaravan,
  signalLevel,
  tickFactions,
  trade,
  tradeOffers,
  type CaravanResult,
  type FactionOffer,
} from '../src/sim/systems/factions';

// Stream A adds the topside rooms; until then, inject minimal defs.
const base = loadContent();
function stubDef(id: string): RoomDef {
  return {
    id,
    name: id,
    category: 'office',
    stat: 'charm',
    unlockPop: 0,
    buildable: false,
    cost: { base: 100, perBuilt: 0 },
    upgrade: [100, 200],
    cells: 3,
    maxSegments: 1,
    capacityPerSegment: 2,
    usesPower: false,
    topside: true,
  };
}
const stubs = ['trading_post', 'signal_mast', 'watchtower'].filter((id) => !base.rooms[id]).map(stubDef);
const content: Content = {
  ...base,
  rooms: { ...base.rooms, ...Object.fromEntries(stubs.map((d) => [d.id, d])) },
  roomList: [...base.roomList, ...stubs],
};

const T0 = 1_700_000_000_000;
const IDS = ['caravaners', 'lamplighters', 'tinkers', 'rustmen', 'homestead9'];

function calm(seed = 7): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  s.scrip = 50_000;
  return s;
}

function addRoom(s: GameState, type: string, level = 1): Room {
  const room: Room = { id: s.nextId++, type, floor: -1, x: 20 + s.rooms.length * 3, segments: 1, level, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 };
  s.rooms.push(room);
  return room;
}

function staff(s: GameState, room: Room): Resident {
  const r = livingResidents(s).find((x) => x.roomId !== room.id) as Resident;
  r.roomId = room.id;
  return r;
}

/** A homestead with a staffed Trading Post and a level-3 mast (everyone met). */
function trader(seed = 7): GameState {
  const s = calm(seed);
  const post = addRoom(s, 'trading_post');
  staff(s, post);
  addRoom(s, 'signal_mast', 3);
  tickFactions(s, content, 0);
  return s;
}

function offer(s: GameState, o: Partial<FactionOffer> & Pick<FactionOffer, 'factionId' | 'give' | 'get'>): FactionOffer {
  const full: FactionOffer = { id: s.nextId++, templateId: 'test', label: 'test', tier: 1, minRep: -100, stock: 1, ...o };
  s.trade.offers.push(full);
  return full;
}

describe('faction content', () => {
  it('has the five shared factions with routes, tiers and voice', () => {
    const fc = factionsContent(content);
    expect(fc.factions.map((f) => f.id).sort()).toEqual([...IDS].sort());
    for (const f of fc.factions) {
      expect(f.name.length).toBeGreaterThan(3);
      expect(f.personality?.length ?? 0).toBeGreaterThan(40);
      expect(f.route.minutes).toBeGreaterThanOrEqual(30);
      expect(f.route.minutes).toBeLessThanOrEqual(240);
      expect(f.offers.length).toBeGreaterThanOrEqual(5);
      for (const t of f.offers) {
        for (const id of Object.keys({ ...t.give.salvageById, ...t.get.salvageById })) expect(content.salvage[id], id).toBeDefined();
        for (const id of [...(t.get.items ?? []), ...Object.keys(t.get.fragments ?? {})]) expect(content.items[id], id).toBeDefined();
      }
    }
    expect(new Set(fc.factions.flatMap((f) => f.offers.map((o) => o.id))).size).toBe(fc.factions.reduce((n, f) => n + f.offers.length, 0));
    expect(fc.tuning.repTiers.length).toBe(fc.tuning.repTierNames.length);
    expect(content.achievements.filter((a) => a.id.startsWith('faction_') || a.id.startsWith('trade_') || a.id.startsWith('caravan_') || a.id.startsWith('rustmen_')).length).toBeGreaterThanOrEqual(8);
  });
});

describe('reputation', () => {
  it('names tiers at their boundaries', () => {
    expect(repTier(content, -100).name).toBe('Hostile');
    expect(repTier(content, -51).name).toBe('Hostile');
    expect(repTier(content, -50).name).toBe('Wary');
    expect(repTier(content, -11).name).toBe('Wary');
    expect(repTier(content, -10).name).toBe('Neutral');
    expect(repTier(content, 25).name).toBe('Friendly');
    expect(repTier(content, 60)).toEqual({ index: 4, name: 'Allied', min: 60, next: null });
    expect(repTier(content, 0).next).toBe(25);
  });

  it('clamps to -100..100, marks the faction met and fires events', () => {
    const s = calm();
    expect(repOf(s, content, 'rustmen')).toBe(factionDef(content, 'rustmen')?.startRep);
    changeRep(s, content, 'rustmen', -500);
    expect(repOf(s, content, 'rustmen')).toBe(-100);
    expect(s.factions['rustmen']?.met).toBe(true);
    expect(s.events.some((e) => e.type === 'factionMet' && e.factionId === 'rustmen')).toBe(true);
    changeRep(s, content, 'rustmen', 1000);
    expect(repOf(s, content, 'rustmen')).toBe(100);
    s.events = [];
    changeRep(s, content, 'rustmen', 5);
    expect(s.events).toEqual([]);
    changeRep(s, content, 'nobody', 5);
    expect(s.factions['nobody']).toBeUndefined();
  });

  it('makes hostile Rustmen raid more and friendly ones less', () => {
    const s = calm();
    expect(raidRateMult(s, content)).toBe(1);
    changeRep(s, content, 'rustmen', -60 - repOf(s, content, 'rustmen'));
    expect(raidRateMult(s, content)).toBeGreaterThan(1);
    changeRep(s, content, 'rustmen', 90);
    expect(factionTier(s, content, 'rustmen')).toBe(3);
    expect(raidRateMult(s, content)).toBeLessThan(1);
  });
});

describe('contact', () => {
  it('reaches further with each Signal Mast level', () => {
    const s = calm();
    advance(s, content, 1);
    expect(Object.keys(s.factions)).toEqual([]);
    const mast = addRoom(s, 'signal_mast', 1);
    advance(s, content, 1);
    expect(IDS.filter((id) => s.factions[id]?.met).sort()).toEqual(['caravaners', 'tinkers']);
    mast.level = 2;
    advance(s, content, 1);
    expect(IDS.filter((id) => s.factions[id]?.met).sort()).toEqual(['caravaners', 'lamplighters', 'rustmen', 'tinkers']);
    mast.level = 3;
    advance(s, content, 1);
    expect(IDS.every((id) => s.factions[id]?.met)).toBe(true);
    expect(signalLevel(s, content)).toBe(3);
    expect(s.stats['factionsMet']).toBe(5);
    expect(s.achievements['faction_all_contact']).toBeDefined();
    // Contact starts at the faction's starting reputation.
    expect(repOf(s, content, 'rustmen')).toBe(factionDef(content, 'rustmen')?.startRep);
  });

  it('lets the Long Road Co. find a Trading Post on its own', () => {
    const s = calm();
    addRoom(s, 'trading_post');
    advance(s, content, 1);
    expect(Object.keys(s.factions)).toEqual(['caravaners']);
  });
});

describe('trade board', () => {
  it('needs a staffed Trading Post and posts offers only from met factions', () => {
    const s = calm();
    const post = addRoom(s, 'trading_post');
    addRoom(s, 'signal_mast', 1);
    advance(s, content, 1);
    expect(s.trade.offers).toEqual([]);
    staff(s, post);
    advance(s, content, 1);
    const factions = new Set(tradeOffers(s).map((o) => o.factionId));
    expect([...factions].sort()).toEqual(['caravaners', 'tinkers']);
    expect(s.trade.refreshAt).toBeGreaterThan(s.time);
  });

  it('refreshes on its timer, online and offline', () => {
    const s = trader();
    advance(s, content, 1);
    const first = tradeOffers(s).map((o) => o.id);
    const due = s.trade.refreshAt;
    advance(s, content, due - s.time - 5);
    expect(tradeOffers(s).map((o) => o.id)).toEqual(first);
    advance(s, content, 10);
    expect(tradeOffers(s).map((o) => o.id)).not.toEqual(first);
    const period = factionsContent(content).tuning.tradeRefreshHours * 3600;
    expect(s.trade.refreshAt).toBe(due + period);
    const before = tradeOffers(s).map((o) => o.id);
    catchUp(s, content, s.lastRealTime + (period + 60) * 1000);
    expect(tradeOffers(s).map((o) => o.id)).not.toEqual(before);
  });

  it('posts a newly met faction without waiting for the refresh', () => {
    const s = calm();
    staff(s, addRoom(s, 'trading_post'));
    advance(s, content, 1);
    expect(tradeOffers(s).every((o) => o.factionId === 'caravaners')).toBe(true);
    changeRep(s, content, 'tinkers', 0);
    advance(s, content, 1);
    expect(tradeOffers(s).some((o) => o.factionId === 'tinkers')).toBe(true);
  });

  it('prices by tier: better standing, better prices, and Rustmen trade even when hostile', () => {
    const s = trader();
    const t = factionsContent(content).tuning;
    for (const id of IDS) changeRep(s, content, id, 200);
    for (let i = 0; i < 6; i++) {
      refreshTrade(s, content);
      for (const o of tradeOffers(s)) {
        const tpl = factionDef(content, o.factionId)?.offers.find((x) => x.id === o.templateId);
        if (!tpl) continue;
        if (tpl.give.scrip) expect(o.give.scrip).toBe(Math.round(tpl.give.scrip * (t.buyMult[4] as number)));
        if (tpl.get.scrip) expect(o.get.scrip).toBe(Math.round(tpl.get.scrip * (t.sellMult[4] as number)));
      }
    }
    // Hostile: only the Rustmen still post offers anyone can take, at hostile prices.
    for (const id of IDS) changeRep(s, content, id, -200);
    refreshTrade(s, content);
    const open = tradeOffers(s).filter((o) => o.minRep <= -100);
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((o) => o.factionId === 'rustmen')).toBe(true);
    const gun = open.find((o) => o.templateId === 'rm_weapon');
    if (gun) expect(gun.give.scrip).toBe(Math.round(900 * (t.buyMult[0] as number)));
  });

  it('validates contact, rep, stock and costs, then pays out', () => {
    const s = trader();
    s.trade.offers = [];
    s.salvage['vacuum_tube'] = 5;
    const o = offer(s, { factionId: 'tinkers', give: { salvageById: { vacuum_tube: 8 } }, get: { scrip: 30, influence: 1 } });
    expect(trade(s, content, 424242)).toBe('that offer is gone');
    expect(trade(s, content, o.id)).toMatch(/Vacuum Tube/);
    s.salvage['vacuum_tube'] = 10;
    const scrip = s.scrip;
    const rep = repOf(s, content, 'tinkers');
    expect(applyCommand(s, content, { type: 'trade', offerId: o.id })).toEqual({ ok: true });
    expect(s.salvage['vacuum_tube']).toBe(2);
    expect(s.scrip).toBe(scrip + 30);
    expect(s.influence).toBe(1);
    expect(repOf(s, content, 'tinkers')).toBe(rep + 1);
    expect(o.stock).toBe(0);
    expect(s.stats['trades']).toBe(1);
    expect(trade(s, content, o.id)).toBe('sold out');

    const locked = offer(s, { factionId: 'tinkers', minRep: 60, give: { scrip: 1 }, get: { scrip: 2 } });
    expect(trade(s, content, locked.id)).toMatch(/Allied/);
    const pricey = offer(s, { factionId: 'tinkers', give: { influence: 50 }, get: { rep: { tinkers: 5 } } });
    expect(trade(s, content, pricey.id)).toBe('not enough Influence');

    const unmet = calm();
    staff(unmet, addRoom(unmet, 'trading_post'));
    const o2 = offer(unmet, { factionId: 'homestead9', give: { scrip: 1 }, get: { scrip: 2 } });
    expect(trade(unmet, content, o2.id)).toMatch(/contact/);

    const nopost = calm();
    changeRep(nopost, content, 'tinkers', 0);
    const o3 = offer(nopost, { factionId: 'tinkers', give: { scrip: 1 }, get: { scrip: 2 } });
    expect(trade(nopost, content, o3.id)).toBe('build a Trading Post first');
  });

  it('stops trading rep at the cap, but bought goodwill still counts', () => {
    const s = trader();
    changeRep(s, content, 'caravaners', 50 - repOf(s, content, 'caravaners'));
    const o = offer(s, { factionId: 'caravaners', stock: 5, give: { scrip: 1 }, get: { scrip: 1 } });
    trade(s, content, o.id);
    expect(repOf(s, content, 'caravaners')).toBe(50);
    s.influence = 15;
    const g = offer(s, { factionId: 'caravaners', give: { influence: 15 }, get: { rep: { caravaners: 5 } } });
    expect(trade(s, content, g.id)).toBeNull();
    expect(repOf(s, content, 'caravaners')).toBe(55);
    expect(s.influence).toBe(0);
  });

  it('trades Purge for Influence, research points, items and recipes', () => {
    const s = trader();
    s.resources.purge = 5;
    const p = offer(s, { factionId: 'lamplighters', give: { purge: 3 }, get: { influence: 4 } });
    expect(trade(s, content, p.id)).toBeNull();
    expect(s.resources.purge).toBe(2);
    expect(s.influence).toBe(4);

    for (const id of IDS) changeRep(s, content, id, 40);
    const r = offer(s, { factionId: 'homestead9', give: { scrip: 800 }, get: { research: 150 } });
    const pts = s.research.points;
    expect(trade(s, content, r.id)).toBeNull();
    expect(s.research.points).toBe(pts + 150);
    const back = offer(s, { factionId: 'homestead9', give: { research: 10_000 }, get: { scrip: 1 } });
    expect(trade(s, content, back.id)).toBe('not enough research points');

    s.items = [];
    const junk = offer(s, { factionId: 'rustmen', give: { itemOf: { rarity: 'common', kind: 'weapon' } }, get: { scrip: 25 } });
    expect(trade(s, content, junk.id)).toMatch(/needs a stored common weapon/);
    s.items.push({ id: s.nextId++, defId: 'work_overalls' }, { id: s.nextId++, defId: 'rusty_revolver' });
    expect(trade(s, content, junk.id)).toBeNull();
    expect(s.items.map((i) => i.defId)).toEqual(['work_overalls']);

    const recipe = offer(s, { factionId: 'tinkers', give: { scrip: 700 }, get: { recipes: ['coilgun'] } });
    expect(trade(s, content, recipe.id)).toBeNull();
    expect(s.recipes).toContain('coilgun');
    const again = offer(s, { factionId: 'tinkers', give: { scrip: 700 }, get: { recipes: ['coilgun'] } });
    expect(trade(s, content, again.id)).toBe('you already know that recipe');

    s.crates.standard = 0;
    const crate = offer(s, { factionId: 'caravaners', give: { scrip: 350 }, get: { crates: { standard: 1 } } });
    expect(trade(s, content, crate.id)).toBeNull();
    expect(s.crates.standard).toBe(1);
  });

  it('only posts recipe offers for recipes not yet known', () => {
    const s = trader();
    for (const id of IDS) changeRep(s, content, id, 100);
    for (let i = 0; i < 10; i++) {
      refreshTrade(s, content);
      for (const o of tradeOffers(s)) for (const id of o.get.recipes ?? []) expect(s.recipes).not.toContain(id);
    }
  });
});

describe('recruits', () => {
  it('hires a faction specialist for Influence, up to the cap', () => {
    const s = trader();
    changeRep(s, content, 'tinkers', 30);
    s.influence = 500;
    refreshTrade(s, content);
    const rec = tradeOffers(s).find((o) => o.factionId === 'tinkers' && o.get.recruit);
    expect(rec).toBeDefined();
    const before = s.residents.length;
    expect(trade(s, content, rec!.id)).toBeNull();
    expect(s.residents.length).toBe(before + 1);
    const hire = s.residents[s.residents.length - 1] as Resident;
    expect(hire.waiting).toBe(true);
    expect(hire.rarity).toBe('rare');
    expect(Math.max(...Object.values(hire.stats))).toBe(hire.stats.wits);
    expect(s.influence).toBe(500 - Math.round(50 * (factionsContent(content).tuning.buyMult[3] as number)));

    refreshTrade(s, content);
    const second = tradeOffers(s).find((o) => o.factionId === 'tinkers' && o.get.recruit)!;
    expect(trade(s, content, second.id)).toBeNull();
    expect(s.stats['recruitsHired']).toBe(2);
    refreshTrade(s, content);
    expect(tradeOffers(s).some((o) => o.factionId === 'tinkers' && o.get.recruit)).toBe(false);
    const forced = offer(s, { factionId: 'tinkers', give: { influence: 1 }, get: { recruit: 'tinkers' } });
    expect(trade(s, content, forced.id)).toMatch(/no more/);
  });

  it('keeps recruits away from factions that are not friendly yet', () => {
    const s = trader();
    refreshTrade(s, content);
    expect(tradeOffers(s).some((o) => o.get.recruit)).toBe(false);
  });
});

describe('caravans', () => {
  function ready(seed = 7): { s: GameState; ids: number[] } {
    const s = trader(seed);
    s.resources.food = 200;
    s.resources.water = 200;
    s.salvage['costume_jewelry'] = 10;
    // Two more hands at the Trading Post, so they have a job to come back to.
    const post = s.rooms.find((r) => r.type === 'trading_post')!;
    const ids = livingResidents(s)
      .filter((r) => r.roomId !== post.id)
      .slice(0, 2)
      .map((r) => r.id);
    for (const id of ids) s.residents.find((r) => r.id === id)!.roomId = post.id;
    return { s, ids };
  }

  it('validates the party, the goods and the route', () => {
    const { s, ids } = ready();
    expect(sendCaravan(s, content, 'nobody', ids, { food: 10 })).toBe('no such faction');
    expect(sendCaravan(s, content, 'caravaners', [], { food: 10 })).toMatch(/at least one/);
    const four = livingResidents(s).slice(0, 4).map((r) => r.id);
    expect(sendCaravan(s, content, 'caravaners', four, { food: 10 })).toMatch(/at most 3/);
    expect(sendCaravan(s, content, 'caravaners', ids, {})).toMatch(/needs goods/);
    expect(sendCaravan(s, content, 'caravaners', ids, { food: 1000 })).toMatch(/not enough food/);
    expect(sendCaravan(s, content, 'caravaners', ids, { salvage: { costume_jewelry: 10 }, food: 100 })).toMatch(/too much to carry/);
    expect(sendCaravan(s, content, 'caravaners', ids, { food: -5 })).toMatch(/whole/);
    expect(sendCaravan(s, content, 'caravaners', ids, { salvage: { gold_pocket_watch: 1 } })).toMatch(/not enough/);
    // Homestead 9 wants Neutral standing before it opens its tunnel.
    changeRep(s, content, 'homestead9', -30);
    expect(sendCaravan(s, content, 'homestead9', ids, { food: 10 })).toMatch(/won't trade/);

    const nopost = calm();
    changeRep(nopost, content, 'caravaners', 0);
    expect(sendCaravan(nopost, content, 'caravaners', ids, { food: 10 })).toBe('build a Trading Post first');
    const unmet = calm();
    addRoom(unmet, 'trading_post');
    expect(sendCaravan(unmet, content, 'tinkers', ids, { food: 10 })).toMatch(/contact/);
  });

  it('takes residents and goods, travels, resolves and pays out on collection', () => {
    const { s, ids } = ready();
    const jobs = ids.map((id) => s.residents.find((r) => r.id === id)!.roomId);
    const est = caravanEstimate(s, content, 'caravaners', ids, { food: 60, salvage: { costume_jewelry: 5 } });
    expect(typeof est).toBe('object');
    const r = applyCommand(s, content, { type: 'sendCaravan', factionId: 'caravaners', residentIds: ids, goods: { food: 60, salvage: { costume_jewelry: 5 } } });
    expect(r).toEqual({ ok: true });
    expect(s.resources.food).toBeLessThanOrEqual(140);
    expect(s.salvage['costume_jewelry']).toBe(5);
    const c = s.caravans[0]!;
    expect(c.status).toBe('travelling');
    expect(c.total).toBe(15 * 60);
    for (const id of ids) {
      const res = s.residents.find((x) => x.id === id)!;
      expect(res.caravan).toBe(c.id);
      expect(res.roomId).toBeNull();
      expect(livingResidents(s)).not.toContain(res);
    }
    // Away residents can't go twice or be sent questing.
    expect(sendCaravan(s, content, 'tinkers', [ids[0]!], { food: 10 })).toMatch(/already with a caravan/);
    expect(collectCaravan(s, content, c.id)).toBe('the caravan is not home yet');

    advance(s, content, 15 * 60);
    expect(c.status).toBe('returning');
    expect(c.result).not.toBeNull();
    expect(recallCaravan(s, content, c.id)).toBe('already heading home');
    advance(s, content, 15 * 60);
    expect(c.status).toBe('returned');
    expect(s.events.some((e) => e.type === 'caravanReturned' && e.caravanId === c.id)).toBe(true);

    const res = c.result as CaravanResult;
    expect(res.scrip).toBeGreaterThan(0);
    expect(res.log.length).toBeGreaterThan(0);
    const scrip = s.scrip;
    const rep = repOf(s, content, 'caravaners');
    const infl = s.influence;
    // (No level-ups, which pay a little scrip of their own.)
    for (const id of ids) s.residents.find((x) => x.id === id)!.level = 30;
    expect(collectCaravan(s, content, c.id)).toBeNull();
    expect(s.scrip).toBe(scrip + res.scrip);
    expect(s.influence).toBe(infl + res.influence);
    expect(repOf(s, content, 'caravaners')).toBe(rep + res.rep);
    expect(s.caravans).toEqual([]);
    ids.forEach((id, i) => {
      const x = s.residents.find((y) => y.id === id)!;
      expect(x.caravan).toBeNull();
      expect(x.roomId).toBe(jobs[i]);
    });
    expect(s.stats['caravansReturned']).toBe(1);
    advance(s, content, 1);
    expect(s.achievements['caravan_first']).toBeDefined();
  });

  it('keeps travelling offline', () => {
    const { s, ids } = ready();
    expect(sendCaravan(s, content, 'rustmen', ids, { food: 60 })).toBeNull();
    catchUp(s, content, s.lastRealTime + 2 * 3600 * 1000);
    expect(s.caravans[0]?.status).toBe('returned');
    expect(collectCaravan(s, content, s.caravans[0]!.id)).toBeNull();
  });

  it('gives the same caravan for 1 s steps and 60 s steps', () => {
    const run = (step: number) => {
      const { s, ids } = ready(11);
      s.trade.refreshAt = 1e12;
      expect(sendCaravan(s, content, 'tinkers', ids, { food: 40, salvage: { costume_jewelry: 4 } })).toBeNull();
      const out: string[] = [];
      for (let t = 0; t < 3600; t += step) {
        tickFactions(s, content, step);
        out.push(s.caravans[0]!.status);
      }
      return { caravan: s.caravans[0], rng: [...s.rng], statusAtMinutes: out.filter((_, i) => ((i + 1) * step) % 60 === 0) };
    };
    const a = run(1);
    const b = run(60);
    expect(b.caravan).toEqual(a.caravan);
    expect(b.rng).toEqual(a.rng);
    expect(b.statusAtMinutes).toEqual(a.statusAtMinutes);
    expect(a.caravan?.status).toBe('returned');
  });

  it('turns back when recalled and brings the goods home', () => {
    const { s, ids } = ready();
    expect(sendCaravan(s, content, 'tinkers', ids, { food: 60, salvage: { costume_jewelry: 5 } })).toBeNull();
    const c = s.caravans[0]!;
    advance(s, content, 600);
    expect(applyCommand(s, content, { type: 'recallCaravan', caravanId: c.id })).toEqual({ ok: true });
    expect(c.status).toBe('returning');
    expect(c.remaining).toBe(600);
    advance(s, content, 600);
    expect(c.status).toBe('returned');
    expect(c.result).toBeNull();
    const food = s.resources.food;
    const rep = repOf(s, content, 'tinkers');
    expect(collectCaravan(s, content, c.id)).toBeNull();
    expect(s.salvage['costume_jewelry']).toBe(10);
    expect(s.resources.food).toBeGreaterThan(food);
    expect(repOf(s, content, 'tinkers')).toBe(rep);
    expect(s.stats['caravansReturned'] ?? 0).toBe(0);
  });

  it('pays more for Charm and Fortune, guards better with Brawn and Grit', () => {
    const { s, ids } = ready();
    const goods = { food: 60 };
    const low = caravanEstimate(s, content, 'rustmen', ids, goods);
    for (const id of ids) {
      const r = s.residents.find((x) => x.id === id)!;
      r.stats.charm = 10;
      r.stats.fortune = 10;
      r.stats.brawn = 10;
      r.stats.grit = 10;
    }
    const high = caravanEstimate(s, content, 'rustmen', ids, goods);
    if (typeof low === 'string' || typeof high === 'string') throw new Error('estimate failed');
    expect(high.scrip).toBeGreaterThan(low.scrip);
    expect(high.defense).toBeGreaterThan(low.defense);
    expect(high.itemChance).toBeGreaterThan(low.itemChance);
    // Friendlier clans ambush less.
    changeRep(s, content, 'rustmen', 100);
    const friendly = caravanEstimate(s, content, 'rustmen', ids, goods);
    if (typeof friendly === 'string') throw new Error('estimate failed');
    expect(friendly.ambushChance).toBeLessThan(high.ambushChance);
  });

  it('limits caravans to the Trading Post level, one per route', () => {
    const { s, ids } = ready();
    expect(sendCaravan(s, content, 'caravaners', [ids[0]!], { food: 10 })).toBeNull();
    expect(sendCaravan(s, content, 'caravaners', [ids[1]!], { food: 10 })).toMatch(/already on/);
    expect(sendCaravan(s, content, 'tinkers', [ids[1]!], { food: 10 })).toMatch(/slots/);
    s.rooms.find((r) => r.type === 'trading_post')!.level = 2;
    expect(sendCaravan(s, content, 'tinkers', [ids[1]!], { food: 10 })).toBeNull();
  });

  it('survives a save round trip mid-trip', () => {
    const { s, ids } = ready();
    expect(sendCaravan(s, content, 'caravaners', ids, { food: 30 })).toBeNull();
    advance(s, content, 60);
    const loaded = deserialize(serialize(s, T0));
    expect(loaded.caravans).toEqual(s.caravans);
    expect(loaded.trade).toEqual(s.trade);
    expect(loaded.factions).toEqual(s.factions);
  });

  it('pays out across many trips, with ambushes on the Toll Road', () => {
    const { s, ids } = ready(3);
    let ambushes = 0;
    for (let i = 0; i < 40; i++) {
      s.resources.food = 200;
      expect(sendCaravan(s, content, 'rustmen', ids, { food: 80 })).toBeNull();
      advance(s, content, 90 * 60);
      const c = s.caravans[0]!;
      if ((c.result as CaravanResult).ambush) ambushes++;
      expect(collectCaravan(s, content, c.id)).toBeNull();
    }
    expect(ambushes).toBeGreaterThan(0);
    expect(ambushes).toBeLessThan(40);
    expect(s.stats['caravansReturned']).toBe(40);
    expect(repOf(s, content, 'rustmen')).toBeGreaterThan(factionDef(content, 'rustmen')!.startRep);
  }, 30_000);
});

import { describe, expect, it } from 'vitest';
import { advance, applyCommand, connectedRoomIds, deserialize, loadContent, newGame, population, serialize, storageCapacity, type Command, type GameState } from '../src/sim';
import { CUSTOM_ACTIONS, customPresets, newCustomGame, type CustomCommand } from '../src/sim/systems/custom';
import { productionMult } from '../src/sim/bonuses';

const content = loadContent();
const T0 = 1_700_000_000_000;

function custom(preset: string, seed = 1): GameState {
  const res = newCustomGame(content, preset, { seed, now: T0 });
  if (!res.ok) throw new Error(res.reason);
  return res.state;
}

const SAMPLES: Record<CustomCommand['action'], CustomCommand> = {
  setResource: { action: 'setResource', resource: 'scrip', amount: 12345 },
  spawnResident: { action: 'spawnResident', level: 20, stats: { brawn: 10, wits: 9 }, rarity: 'rare' },
  spawnItem: { action: 'spawnItem', defId: 'coilgun', count: 2 },
  triggerIncident: { action: 'triggerIncident', incident: 'fire' },
  setWeather: { action: 'setWeather', kind: 'taintstorm', minutes: 45 },
  grantResearch: { action: 'grantResearch', points: 500 },
  unlockAll: { action: 'unlockAll' },
};

const cmd = (c: CustomCommand): Command => ({ type: 'custom', ...c }) as Command;

describe('Custom Game presets', () => {
  const presets = customPresets(content);
  it('has at least 6', () => {
    expect(presets.length).toBeGreaterThanOrEqual(6);
  });

  for (const p of presets) {
    it(`${p.id} builds a valid, connected sandbox`, () => {
      const s = custom(p.id);
      expect(s.mode).toBe('custom');
      expect(connectedRoomIds(s, content).size).toBe(s.rooms.length);
      expect(s.rooms.filter((r) => r.type === 'door').length).toBe(1);
      for (const t of p.options.layout ?? []) expect(s.rooms.some((r) => r.type === t.type && r.floor === t.floor)).toBe(true);
      if (p.options.population !== undefined) expect(s.residents.filter((r) => !r.waiting).length).toBe(p.options.population);
      expect(population(s)).toBeLessThanOrEqual(storageCapacity(s, content, 'population'));
      expect(Object.keys(s.stats).filter((k) => k !== 'peakPopulation')).toEqual([]);
      // It survives a save round trip and a minute of play.
      const back = deserialize(serialize(s));
      advance(back, content, 60);
      expect(back.mode).toBe('custom');
    });
  }

  it('lays out rooms as asked: widths, levels, the Deep and topside', () => {
    const s = custom('boomtown');
    const gens = s.rooms.filter((r) => r.type === 'generator');
    expect(gens.map((r) => [r.segments, r.level])).toEqual([[3, 2]]);
    expect(s.peakPopulation).toBe(80);
    expect(s.unlockedRooms).toContain('lab');
    expect(s.resources.food).toBe(storageCapacity(s, content, 'food'));
    const all = custom('all_rooms');
    const buildable = content.roomList.filter((d) => d.buildable && d.category !== 'elevator').map((d) => d.id);
    for (const id of buildable) expect(all.rooms.some((r) => r.type === id)).toBe(true);
    expect(all.residents.length).toBe(0);
    expect(all.research.done.length).toBeGreaterThan(40);
    const deep = custom('deep_day_one');
    expect(deep.deep.strata).toBe(2);
    expect(deep.rooms.some((r) => r.type === 'geothermal' && r.floor === 25)).toBe(true);
  });

  it('A Ruined Homestead has fallen and hurt residents and bare stores', () => {
    const s = custom('ruined');
    expect(s.residents.filter((r) => r.dead).length).toBe(6);
    expect(s.residents.some((r) => !r.dead && r.hp < r.maxHp)).toBe(true);
    expect(s.resources.food).toBe(8);
    expect(s.scrip).toBe(300);
  });

  it('levels residents in range and can start under any rules', () => {
    const s = custom('old_hands');
    for (const r of s.residents) {
      expect(r.level).toBeGreaterThanOrEqual(30);
      expect(r.level).toBeLessThanOrEqual(50);
      expect(r.hp).toBe(r.maxHp);
    }
    const hard = custom('hard_road');
    expect(hard.rules).toEqual({ ids: ['famine', 'iron_door'], survival: true });
    expect(productionMult(hard, content, 'food')).toBeLessThan(1);
  });

  it('refuses bad presets and options', () => {
    expect(newCustomGame(content, 'nope').ok).toBe(false);
    expect(newCustomGame(content, { research: ['nope'] }).ok).toBe(false);
    expect(newCustomGame(content, { rules: ['nope'] }).ok).toBe(false);
    expect(newCustomGame(content, { population: 150 }).ok).toBe(false);
    expect(newCustomGame(content, { layout: [{ type: 'geothermal', floor: 25 }] }).ok).toBe(false);
    expect(newCustomGame(content, { layout: [{ type: 'quarters', floor: 0, segments: 4 }] }).ok).toBe(false);
  });
});

describe('sandbox commands', () => {
  it('lists every action', () => {
    expect([...CUSTOM_ACTIONS].sort()).toEqual(Object.keys(SAMPLES).sort());
  });

  for (const action of CUSTOM_ACTIONS) {
    it(`${action} refuses in a normal game and works in a Custom Game`, () => {
      const normal = newGame(content, { seed: 2, now: T0 });
      applyCommand(normal, content, { type: 'admitAll' });
      const before = JSON.stringify(normal);
      const no = applyCommand(normal, content, cmd(SAMPLES[action]));
      expect(no.ok).toBe(false);
      expect(JSON.stringify(normal)).toBe(before);

      const s = custom('boomtown');
      const res = applyCommand(s, content, cmd(SAMPLES[action]));
      expect(res).toEqual({ ok: true });
    });
  }

  it('each command does what it says', () => {
    const s = custom('boomtown');
    applyCommand(s, content, cmd(SAMPLES.setResource));
    expect(s.scrip).toBe(12345);
    applyCommand(s, content, cmd({ action: 'setResource', resource: 'food', amount: 1e9 }));
    expect(s.resources.food).toBe(storageCapacity(s, content, 'food'));
    const n = s.residents.length;
    applyCommand(s, content, cmd(SAMPLES.spawnResident));
    const r = s.residents[n]!;
    expect(r.level).toBe(20);
    expect(r.stats.brawn).toBe(10);
    expect(r.rarity).toBe('rare');
    expect(r.waiting).toBe(false);
    const items = s.items.length;
    applyCommand(s, content, cmd(SAMPLES.spawnItem));
    expect(s.items.length).toBe(items + 2);
    applyCommand(s, content, cmd(SAMPLES.triggerIncident));
    expect(s.incidents.some((i) => i.type === 'fire')).toBe(true);
    expect(applyCommand(s, content, cmd({ action: 'triggerIncident', incident: 'rustmen' })).ok).toBe(true);
    expect(s.incidents.some((i) => i.type === 'rustmen')).toBe(true);
    applyCommand(s, content, cmd(SAMPLES.setWeather));
    expect(s.weather).toEqual({ kind: 'taintstorm', remaining: 45 * 60 });
    const pts = s.research.points;
    applyCommand(s, content, cmd(SAMPLES.grantResearch));
    expect(s.research.points).toBe(pts + 500);
    applyCommand(s, content, cmd(SAMPLES.unlockAll));
    expect(s.research.done.length).toBe((content.research as unknown as { nodes: unknown[] }).nodes.length);
    expect(s.unlockedRooms).toContain('refinery');
    expect(s.deep.strata).toBeGreaterThan(0);
  });

  it('validates arguments', () => {
    const s = custom('boomtown');
    const bad: CustomCommand[] = [
      { action: 'setResource', resource: 'food', amount: -1 },
      { action: 'setResource', resource: 'gold' as 'food', amount: 1 },
      { action: 'spawnResident', level: 99 },
      { action: 'spawnResident', stats: { brawn: 11 } },
      { action: 'spawnResident', stats: { luck: 3 } as never },
      { action: 'spawnItem', defId: 'nope' },
      { action: 'triggerIncident', incident: 'nope' as 'fire' },
      { action: 'triggerIncident', incident: 'fire', roomId: s.rooms.find((r) => r.type === 'door')!.id },
      { action: 'setWeather', kind: 'sunny' as 'clear' },
      { action: 'grantResearch', points: 0 },
      { action: 'nope' } as unknown as CustomCommand,
    ];
    for (const c of bad) expect(applyCommand(s, content, cmd(c)).ok, JSON.stringify(c)).toBe(false);
  });
});

describe('custom games earn nothing', () => {
  it('unlocks no achievements', () => {
    const s = custom('old_hands');
    const normal = newGame(content, { seed: 5, now: T0 });
    for (const g of [s, normal]) {
      g.stats['incidentsResolved'] = 1000;
      g.stats['collections'] = 1e6;
      g.nextIncidentAt = 1e12;
      advance(g, content, 1);
    }
    expect(Object.keys(s.achievements)).toEqual([]);
    expect(Object.keys(normal.achievements).length).toBeGreaterThan(0);
  });
});

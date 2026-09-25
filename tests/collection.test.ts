// M9 stream L: the Collection Log, its milestones, and the Warden's Seal.
import { describe, expect, it } from 'vitest';
import { advance, applyCommand, loadContent, newGame, type GameState } from '../src/sim';
import type { Content } from '../src/sim/content';
import { checkAchievements, SEAL_ID, sealProgress, sealRequirements, wardenTitle } from '../src/sim/systems/achievements';
import {
  COLLECTION_CATEGORIES,
  collectionCatalogue,
  collectionEntries,
  collectionProgress,
  recordCollection,
  tickCollection,
} from '../src/sim/systems/collection';
import { grantItem } from '../src/sim/systems/items';
import { legendsContent, recruitLegend } from '../src/sim/systems/legends';

const content = loadContent();
const T0 = 1_700_000_000_000;

function game(seed = 7): GameState {
  const s = newGame(content, { seed, now: T0 });
  applyCommand(s, content, { type: 'admitAll' });
  s.nextIncidentAt = 1e12;
  s.nextWandererAt = 1e12;
  return s;
}

describe('the Collection Log', () => {
  it('catalogues five categories from content', () => {
    expect([...COLLECTION_CATEGORIES]).toEqual(['items', 'residents', 'creatures', 'rooms', 'regions']);
    expect(collectionCatalogue(content, 'items')).toHaveLength(Object.keys(content.items).length);
    expect(collectionCatalogue(content, 'residents')).toHaveLength(11);
    const creatures = collectionCatalogue(content, 'creatures').map((e) => e.id);
    expect(creatures).toContain('incident:fire');
    expect(creatures).toContain('enemy:big_tin');
    expect(creatures).toContain('enemy:the_long_road');
    expect(collectionCatalogue(content, 'rooms').every((e) => content.rooms[e.id]?.buildable)).toBe(true);
    expect(collectionCatalogue(content, 'regions').map((e) => e.id)).toContain('dustbowl');
  });

  it('fills itself from state: starter rooms, the first region, items, legends, creatures', () => {
    const s = game();
    advance(s, content, 1);
    let p = collectionProgress(s, content);
    expect(p.categories.regions.have).toBe(1);
    expect(p.categories.rooms.have).toBeGreaterThanOrEqual(4);
    expect(p.categories.items.have).toBe(0);
    grantItem(s, content, 'coilgun');
    s.residents[0]!.outfit = 'titan_harness';
    recruitLegend(s, content, 'lucky_lou', 'dev');
    s.incidents.push({ id: 999, type: 'skitters', roomId: s.rooms[2]!.id, hp: 10, maxHp: 10, dps: 0, visited: [], emptyFor: 0, roomTime: 0, doorHp: 0, stolen: 0 });
    tickCollection(s, content);
    p = collectionProgress(s, content);
    expect(s.collection['items']!.sort()).toEqual(['coilgun', 'gamblers_vest', 'rusty_revolver', 'titan_harness'].sort());
    expect(p.categories.residents).toEqual({ have: 1, of: 11 });
    expect(s.collection['creatures']).toContain('incident:skitters');
    expect(p.total.have).toBe(COLLECTION_CATEGORIES.reduce((a, k) => a + p.categories[k].have, 0));
    expect(p.total.of).toBe(COLLECTION_CATEGORIES.reduce((a, k) => a + p.categories[k].of, 0));
    const entries = collectionEntries(s, content, 'residents');
    expect(entries).toHaveLength(11);
    expect(entries.find((e) => e.id === 'lucky_lou')).toMatchObject({ have: true, name: 'Lucky Lou Bettancourt' });
    expect(entries.filter((e) => e.have)).toHaveLength(1);
  });

  it('only records known ids, once', () => {
    const s = game();
    expect(recordCollection(s, content, 'items', 'not_an_item')).toBe(false);
    expect(recordCollection(s, content, 'creatures', 'enemy:skitter')).toBe(true);
    expect(recordCollection(s, content, 'creatures', 'enemy:skitter')).toBe(false);
    expect(s.collection['creatures']).toEqual(['enemy:skitter']);
  });

  it('logs quest enemies as the party meets them', () => {
    const s = game();
    s.quests.push({ enemies: [{ defId: 'rust_brute' }] } as unknown as GameState['quests'][number]);
    tickCollection(s, content);
    expect(s.collection['creatures']).toContain('enemy:rust_brute');
  });

  it('pays each milestone crate once, and a crate per completed category', () => {
    const s = game();
    tickCollection(s, content);
    const before = { ...s.crates };
    for (const e of collectionCatalogue(content, 'residents')) recordCollection(s, content, 'residents', e.id);
    for (const e of collectionCatalogue(content, 'regions')) recordCollection(s, content, 'regions', e.id);
    tickCollection(s, content);
    expect(s.stats['collectionCategoriesComplete']).toBe(2);
    const cfg = legendsContent(content).collection;
    const percent = collectionProgress(s, content).percent;
    const milestones = cfg.milestones.filter((m) => m.percent <= percent);
    const gained = s.crates.standard + s.crates.rare + s.crates.legendary - (before.standard + before.rare + before.legendary);
    expect(gained).toBe(milestones.length + 2);
    tickCollection(s, content);
    advance(s, content, 1);
    const after = s.crates.standard + s.crates.rare + s.crates.legendary;
    // Achievement crates may follow, but no more collection crates.
    expect(s.stats['cratesFrom.collection']).toBe(milestones.length + 2);
    expect(after).toBeGreaterThanOrEqual(gained);
    expect(s.achievements['collection_category']).toBeDefined();
  });

  it('fills to 100% for everything in content', () => {
    const s = game();
    for (const k of COLLECTION_CATEGORIES) for (const e of collectionCatalogue(content, k)) recordCollection(s, content, k, e.id);
    tickCollection(s, content);
    const p = collectionProgress(s, content);
    expect(p.percent).toBe(100);
    expect(s.stats['collectionPercent']).toBe(100);
    expect(s.stats['collectionCategoriesComplete']).toBe(5);
  });
});

describe("the Warden's Seal", () => {
  function earnAllBut(s: GameState, c: Content, skip: string[]): void {
    for (const d of c.achievements) if (d.id !== SEAL_ID && !skip.includes(d.id)) s.achievements[d.id] = 1;
  }

  it('is in content, hidden, and needs every other achievement (hidden ones too)', () => {
    const seal = content.achievements.find((a) => a.id === SEAL_ID)!;
    expect(seal).toBeDefined();
    const need = sealRequirements(content);
    expect(need.some((d) => d.id === SEAL_ID)).toBe(false);
    expect(need.some((d) => d.hidden)).toBe(true);
    expect(need.length).toBe(content.achievements.filter((d) => d.id !== SEAL_ID && !(d as { optional?: boolean }).optional).length);
  });

  it('fires only when everything else is earned, and pays the title and monument flag', () => {
    const s = game();
    const hidden = content.achievements.find((d) => d.hidden)!;
    earnAllBut(s, content, [hidden.id]);
    checkAchievements(s, content);
    expect(s.achievements[SEAL_ID]).toBeUndefined();
    expect(s.stats['wardensSeal']).toBeUndefined();
    expect(wardenTitle(s, content)).toBeNull();
    expect(sealProgress(s, content).missing).toEqual([hidden.id]);
    s.achievements[hidden.id] = 1;
    checkAchievements(s, content);
    expect(s.achievements[SEAL_ID]).toBeDefined();
    expect(s.stats['wardensSeal']).toBe(1);
    expect(wardenTitle(s, content)).toBe('Warden of Wardens');
    expect(s.events.filter((e) => e.type === 'achievementUnlocked' && e.achievementId === SEAL_ID)).toHaveLength(1);
    checkAchievements(s, content);
    expect(s.events.filter((e) => e.type === 'achievementUnlocked' && e.achievementId === SEAL_ID)).toHaveLength(1);
  });

  it('ignores achievements flagged optional', () => {
    const optional = content.achievements[0]!;
    const c: Content = { ...content, achievements: content.achievements.map((d) => (d === optional ? { ...d, optional: true } : d)) };
    const s = game();
    earnAllBut(s, c, [optional.id]);
    checkAchievements(s, c);
    expect(s.achievements[SEAL_ID]).toBeDefined();
  });

  it('is never earned in a Custom Game', () => {
    const s = game();
    s.mode = 'custom';
    earnAllBut(s, content, []);
    checkAchievements(s, content);
    expect(s.achievements[SEAL_ID]).toBeUndefined();
  });

  it('comes with about ten stream L achievements on real counters', () => {
    const own = (legendsContent(content) as unknown as { achievements?: { id: string; stat: string }[] }).achievements ?? [];
    const lj = content.achievements.filter((a) => a.id.startsWith('legend_') || a.id.startsWith('collection_'));
    expect(lj.length).toBeGreaterThanOrEqual(10);
    const counters = ['legendsRecruited', 'legendQuestsDone', 'legendQuestlinesDone', 'legendStoriesEnded', 'collectionPercent', 'collectionCategoriesComplete'];
    for (const a of lj) expect(counters, a.id).toContain(a.stat);
    expect(own.length).toBeGreaterThanOrEqual(0);
  });
});

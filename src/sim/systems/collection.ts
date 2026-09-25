// M9: the Collection Log (GDD §15): everything the homestead has ever had, by
// category. It lives in state.collection (category -> ids) and carries across
// foundings. See docs/design/M9-spec.md (stream L).
//
// Categories and ids:
//   items      item definition ids (weapons and outfits ever owned)
//   residents  legendary resident ids (legends.json)
//   creatures  "enemy:<id>" for quest enemies met, "incident:<type>" for incidents seen
//   rooms      room type ids ever built
//   regions    exploration region ids unlocked
//
// Recording is by scanning state every step (tickCollection, from tickLegends)
// plus recordCollection() for other systems that want to log something the
// scan can't see. Only ids that exist in content count. Completion milestones
// (legends.json collection.milestones) and each completed category pay crates.

import type { Content } from '../content';
import { bump } from '../residents';
import type { CrateTier, GameState } from '../types';
import { earnCrate } from './crates';
import { legendName, legendsContent } from './legends';

export const COLLECTION_CATEGORIES = ['items', 'residents', 'creatures', 'rooms', 'regions'] as const;
export type CollectionCategory = (typeof COLLECTION_CATEGORIES)[number];

export interface CatalogueEntry {
  id: string;
  name: string;
  /** A short line for the log: rarity and kind, a title, "boss"... */
  detail: string;
}

export interface CollectionEntry extends CatalogueEntry {
  have: boolean;
}

export interface Tally {
  have: number;
  of: number;
}

export interface CollectionProgress {
  categories: Record<CollectionCategory, Tally>;
  total: Tally;
  /** Whole percent of the total. */
  percent: number;
}

// ------------------------------------------------------------------ catalogue

type Catalogue = Record<CollectionCategory, { list: CatalogueEntry[]; ids: Set<string> }>;
const catalogues = new WeakMap<Content, Catalogue>();

function build(content: Content): Catalogue {
  const items: CatalogueEntry[] = Object.values(content.items).map((d) => ({ id: d.id, name: d.name, detail: `${d.rarity} ${d.kind}` }));
  const residents: CatalogueEntry[] = legendsContent(content).legends.map((l) => ({ id: l.id, name: legendName(l), detail: l.title }));
  const enemies = (content.quests as unknown as { enemies: Record<string, { id: string; name: string; boss?: boolean }> }).enemies;
  const incidents = content.balance.incidents.types as Record<string, { name: string }>;
  const creatures: CatalogueEntry[] = [
    ...Object.entries(incidents).map(([id, d]) => ({ id: `incident:${id}`, name: d.name, detail: 'homestead incident' })),
    ...Object.values(enemies).map((e) => ({ id: `enemy:${e.id}`, name: e.name, detail: e.boss ? 'boss' : 'quest enemy' })),
  ];
  const rooms: CatalogueEntry[] = content.roomList.filter((r) => r.buildable).map((r) => ({ id: r.id, name: r.name, detail: r.topside ? 'surface building' : r.category }));
  const regions: CatalogueEntry[] = (content.exploration.regions as { id: string; name: string }[]).map((r) => ({ id: r.id, name: r.name, detail: 'region' }));
  const wrap = (list: CatalogueEntry[]) => ({ list, ids: new Set(list.map((e) => e.id)) });
  return { items: wrap(items), residents: wrap(residents), creatures: wrap(creatures), rooms: wrap(rooms), regions: wrap(regions) };
}

function catalogue(content: Content): Catalogue {
  let c = catalogues.get(content);
  if (!c) {
    c = build(content);
    catalogues.set(content, c);
  }
  return c;
}

/** Everything that can be collected in a category. */
export function collectionCatalogue(content: Content, category: CollectionCategory): CatalogueEntry[] {
  return catalogue(content)[category]?.list ?? [];
}

// ------------------------------------------------------------------ recording

/** Log one id. Returns true if it is new (and counts: unknown ids are ignored). */
export function recordCollection(state: GameState, content: Content, category: CollectionCategory, id: string): boolean {
  const cat = catalogue(content)[category];
  if (!cat || !cat.ids.has(id)) return false;
  const have = (state.collection[category] ??= []);
  if (have.includes(id)) return false;
  have.push(id);
  bump(state, `collection.${category}`);
  state.events.push({ type: 'collectionLogged', category, id } as unknown as GameState['events'][number]);
  return true;
}

// Item and room scans only need rerunning when something new was created (every
// new item, room and resident takes a fresh id).
const lastScan = new WeakMap<GameState, number>();

function scan(state: GameState, content: Content): void {
  if (lastScan.get(state) !== state.nextId) {
    lastScan.set(state, state.nextId);
    for (const item of state.items) recordCollection(state, content, 'items', item.defId);
    for (const r of state.residents) {
      if (r.weapon) recordCollection(state, content, 'items', r.weapon);
      if (r.outfit) recordCollection(state, content, 'items', r.outfit);
    }
    for (const room of state.rooms) recordCollection(state, content, 'rooms', room.type);
  }
  for (const id of state.legends.recruited) recordCollection(state, content, 'residents', id);
  for (const id of state.regionsUnlocked) recordCollection(state, content, 'regions', id);
  for (const q of state.quests) for (const e of q.enemies ?? []) recordCollection(state, content, 'creatures', `enemy:${e.defId}`);
  for (const inc of state.incidents) recordCollection(state, content, 'creatures', `incident:${inc.type}`);
}

// ------------------------------------------------------------------ progress

export function collectionProgress(state: GameState, content: Content): CollectionProgress {
  const cat = catalogue(content);
  const categories = {} as Record<CollectionCategory, Tally>;
  const total: Tally = { have: 0, of: 0 };
  for (const key of COLLECTION_CATEGORIES) {
    const ids = cat[key].ids;
    let have = 0;
    for (const id of state.collection[key] ?? []) if (ids.has(id)) have++;
    categories[key] = { have, of: ids.size };
    total.have += have;
    total.of += ids.size;
  }
  return { categories, total, percent: total.of ? Math.floor((100 * total.have) / total.of) : 0 };
}

/** Every entry in a category, in content order, with whether it has been collected. */
export function collectionEntries(state: GameState, content: Content, category: CollectionCategory): CollectionEntry[] {
  const have = new Set(state.collection[category] ?? []);
  return collectionCatalogue(content, category).map((e) => ({ ...e, have: have.has(e.id) }));
}

/** Milestone crates and counters for achievements. Paid once per lifetime (stats carry over). */
function checkMilestones(state: GameState, content: Content): void {
  const p = collectionProgress(state, content);
  if ((state.stats['collectionPercent'] ?? 0) < p.percent) state.stats['collectionPercent'] = p.percent;
  const cfg = legendsContent(content).collection;
  const paid = state.stats['collection.milestone'] ?? 0;
  for (const m of cfg.milestones) {
    if (m.percent <= paid || p.percent < m.percent) continue;
    state.stats['collection.milestone'] = m.percent;
    earnCrate(state, m.crate as CrateTier, 'collection');
  }
  let complete = 0;
  for (const key of COLLECTION_CATEGORIES) {
    const t = p.categories[key];
    if (t.of === 0 || t.have < t.of) continue;
    complete++;
    const flag = `collection.complete.${key}`;
    if (!state.stats[flag]) {
      state.stats[flag] = 1;
      earnCrate(state, cfg.categoryCrate as CrateTier, 'collection');
    }
  }
  if ((state.stats['collectionCategoriesComplete'] ?? 0) < complete) state.stats['collectionCategoriesComplete'] = complete;
}

/** Scan state into the log and pay milestones (called from tickLegends every step). */
export function tickCollection(state: GameState, content: Content): void {
  if (!state.collection) return;
  scan(state, content);
  const n = countAll(state);
  if (checked.get(state) !== n) {
    checked.set(state, n);
    checkMilestones(state, content);
  }
}
const checked = new WeakMap<GameState, number>();

function countAll(state: GameState): number {
  let n = 0;
  for (const key of COLLECTION_CATEGORIES) n += state.collection[key]?.length ?? 0;
  return n;
}

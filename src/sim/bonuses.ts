// One place to ask "how much bonus applies here?". Legacy perks (prestige)
// and completed research both grant effects by key; systems call bonus()
// instead of reading either directly, so a new source of bonuses (monuments,
// factions...) only has to be added here. See docs/design/M6-spec.md.

import type { Content } from './content';
import { perkValue, siteDef, type PerkEffect } from './legacy';
import type { GameState, ResourceKey } from './types';
import { rulesetMods } from './systems/rulesets';

/** Effects research can grant on top of the perk effects. */
export type ResearchEffect =
  /** Extra ready batches a production room can hold (so offline time isn't wasted). */
  | 'batchBank'
  /** Production multiplier for one resource: use `productionPower` etc. via effectFor(). */
  | 'productionPower'
  | 'productionFood'
  | 'productionWater'
  | 'productionMedpatch'
  | 'productionPurge'
  /** Fraction of incident damage residents shrug off. */
  | 'incidentDefense'
  /** Extra door HP, as a fraction. */
  | 'doorHp'
  /** Med-Patch and Purge strength inside the homestead, as a fraction. */
  | 'medicine'
  /** Residents idle for a while get assigned to their best free job (flag). */
  | 'autoAssign'
  /** Supply bots use Med-Patches and Purge on residents who need them (flag). */
  | 'autoMedic'
  /** Research point production, as a fraction. */
  | 'researchSpeed'
  /** Excavation speed, as a fraction. */
  | 'digSpeed'
  /** Exploration: taint taken, as a fraction reduction. */
  | 'explorerTaint'
  /** M7 topside: fraction by which weather penalties on surface buildings shrink. */
  | 'weatherproofing'
  /** M7 topside: fraction of taint-storm Glare topside workers are spared. */
  | 'stormShielding'
  /** M7 topside: extra effective Signal Mast levels (faction contact range). */
  | 'signalRange'
  /** M7 topside: extra output for surface production buildings, as a fraction. */
  | 'topsideOutput';

export type BonusEffect = PerkEffect | ResearchEffect;

interface ResearchNodeLike {
  id: string;
  effects?: { effect: string; value: number }[];
}

/** Total from completed research for an effect. */
export function researchValue(state: GameState, content: Content, effect: BonusEffect): number {
  const done = state.research?.done;
  if (!done?.length) return 0;
  // Research only ever grows (or is replaced wholesale on founding), so the
  // totals are cached per done-list and recomputed when its length changes.
  let cache = researchCache.get(done);
  if (!cache || cache.size !== done.length || cache.content !== content) {
    const totals = new Map<string, number>();
    const nodes = (content.research as unknown as { nodes: ResearchNodeLike[] }).nodes;
    for (const n of nodes) {
      if (!done.includes(n.id)) continue;
      for (const e of n.effects ?? []) totals.set(e.effect, (totals.get(e.effect) ?? 0) + e.value);
    }
    cache = { size: done.length, content, totals };
    researchCache.set(done, cache);
  }
  return cache.totals.get(effect) ?? 0;
}

const researchCache = new WeakMap<string[], { size: number; content: Content; totals: Map<string, number> }>();

/** Everything that grants this effect: Legacy perks plus research. */
export function bonus(state: GameState, content: Content, effect: BonusEffect): number {
  return perkValue(state, content, effect as PerkEffect) + researchValue(state, content, effect);
}

const RESOURCE_EFFECT: Partial<Record<ResourceKey, ResearchEffect>> = {
  power: 'productionPower',
  food: 'productionFood',
  water: 'productionWater',
  medpatch: 'productionMedpatch',
  purge: 'productionPurge',
};

/** Production multiplier for a resource: site modifier × (1 + Overtime and research). */
export function productionMult(state: GameState, content: Content, resource: ResourceKey | undefined): number {
  const site = siteDef(content, state.legacy?.siteId ?? 'plot7');
  const siteMult = resource ? (site?.modifiers.production?.[resource] ?? 1) : 1;
  const specific = resource && RESOURCE_EFFECT[resource] ? bonus(state, content, RESOURCE_EFFECT[resource] as ResearchEffect) : 0;
  return siteMult * rulesetMods(state, content).production(resource) * (1 + bonus(state, content, 'productionSpeed') + specific);
}

/** How much more often random incidents happen at this site. */
export function incidentRate(state: GameState, content: Content): number {
  return (siteDef(content, state.legacy?.siteId ?? 'plot7')?.modifiers.incidentRate ?? 1) * rulesetMods(state, content).incidentRate;
}

/** Build and upgrade cost multiplier (Union Rates and research). */
export function costMult(state: GameState | undefined, content: Content): number {
  if (!state) return 1;
  return Math.max(0.2, 1 - bonus(state, content, 'buildDiscount'));
}

// M9: rulesets (Famine, Endless Night, No Radio...) and Survival, chosen when
// founding a homestead and kept for that homestead's whole life. Harder rules
// pay more Legacy when the homestead founds the next one. Custom Game presets
// live in the same content file (see custom.ts). See docs/design/M9-spec.md.
//
// This module is imported by bonuses.ts, so it only depends on types.

import type { Content } from '../content';
import type { GameState, ResourceKey } from '../types';

export type RulesetUnlock = { cycle: number } | { achievement: string } | { quest: string };

export type RuleFlag = 'noRadio' | 'endlessNight' | 'glassSky';

export interface RulesetModsDef {
  production?: Partial<Record<ResourceKey, number>>;
  consumption?: Partial<Record<'power' | 'food' | 'water', number>>;
  storage?: Partial<Record<ResourceKey, number>>;
  incidentRate?: number;
  scripIncome?: number;
  doorHp?: number;
  raidWeight?: number;
  explorerTaint?: number;
  happiness?: { value: number; exceptTraits?: string[] };
  populationCap?: number;
}

export interface RulesetDef {
  id: string;
  name: string;
  blurb: string;
  legacyMult: number;
  unlock: RulesetUnlock;
  mods?: RulesetModsDef;
  flags?: RuleFlag[];
}

export interface SurvivalDef {
  name: string;
  blurb: string;
  legacyMult: number;
  unlock: RulesetUnlock;
}

export interface RulesetsContent {
  rulesets: RulesetDef[];
  survival: SurvivalDef;
  /** Custom Game presets; typed in custom.ts. */
  presets: { id: string; name: string; blurb: string; options: Record<string, unknown> }[];
}

export function rulesetsContent(content: Content): RulesetsContent {
  return content.rulesets as unknown as RulesetsContent;
}

export function rulesetDef(content: Content, id: string): RulesetDef | undefined {
  return rulesetsContent(content).rulesets.find((r) => r.id === id);
}

export interface RulesetMods {
  /** Production multiplier for a resource (1 = unchanged). Live via bonuses.productionMult. */
  production: (resource: ResourceKey | undefined) => number;
  /** Random-incident frequency multiplier. Live via bonuses.incidentRate. */
  incidentRate: number;
  /** Consumption multipliers (live in needs.ts). */
  consumption: Record<'power' | 'food' | 'water', number>;
  /** Storage capacity multiplier for a resource (needs the economy.resourceCapacity patch). */
  storage: (resource: ResourceKey) => number;
  /** Multiplier on scrip earned (needs the economy.addScrip patch). */
  scripIncome: number;
  /** Door HP multiplier against raiders (needs the incidents.startRaid patch). */
  doorHp: number;
  /** Weight multiplier for raids when the incident timer picks a type (needs the incidents patch). */
  raidWeight: number;
  /** Multiplier on taint taken while exploring (needs the exploration patch). */
  explorerTaint: number;
  /** Flat happiness-target change, and the traits that are spared it (live in needs.ts). */
  happiness: number;
  happinessExcept: string[];
  /** Living residents allowed (Infinity = no cap). Live in admit, arrivals and the Charter. */
  populationCap: number;
}

const NEUTRAL: RulesetMods = {
  production: () => 1,
  incidentRate: 1,
  consumption: { power: 1, food: 1, water: 1 },
  storage: () => 1,
  scripIncome: 1,
  doorHp: 1,
  raidWeight: 1,
  explorerTaint: 1,
  happiness: 0,
  happinessExcept: [],
  populationCap: Infinity,
};

const cache = new WeakMap<Content, Map<string, RulesetMods>>();

function combine(defs: RulesetDef[]): RulesetMods {
  const prod: Partial<Record<ResourceKey, number>> = {};
  const store: Partial<Record<ResourceKey, number>> = {};
  const m: RulesetMods = { ...NEUTRAL, consumption: { ...NEUTRAL.consumption }, happinessExcept: [] };
  for (const def of defs) {
    const d = def.mods;
    if (!d) continue;
    for (const [k, v] of Object.entries(d.production ?? {})) prod[k as ResourceKey] = (prod[k as ResourceKey] ?? 1) * (v as number);
    for (const [k, v] of Object.entries(d.storage ?? {})) store[k as ResourceKey] = (store[k as ResourceKey] ?? 1) * (v as number);
    for (const [k, v] of Object.entries(d.consumption ?? {})) m.consumption[k as 'food'] *= v as number;
    m.incidentRate *= d.incidentRate ?? 1;
    m.scripIncome *= d.scripIncome ?? 1;
    m.doorHp *= d.doorHp ?? 1;
    m.raidWeight *= d.raidWeight ?? 1;
    m.explorerTaint *= d.explorerTaint ?? 1;
    if (d.happiness) {
      m.happiness += d.happiness.value;
      m.happinessExcept.push(...(d.happiness.exceptTraits ?? []));
    }
    if (d.populationCap !== undefined) m.populationCap = Math.min(m.populationCap, d.populationCap);
  }
  m.production = (r) => (r ? (prod[r] ?? 1) : 1);
  m.storage = (r) => store[r] ?? 1;
  return m;
}

/** The combined modifiers of the homestead's active rulesets. */
export function rulesetMods(state: GameState, content: Content): RulesetMods {
  const ids = state.rules?.ids;
  if (!ids?.length) return NEUTRAL;
  let byKey = cache.get(content);
  if (!byKey) cache.set(content, (byKey = new Map()));
  const key = ids.join(',');
  let mods = byKey.get(key);
  if (!mods) {
    mods = combine(ids.map((id) => rulesetDef(content, id)).filter((d): d is RulesetDef => !!d));
    byKey.set(key, mods);
  }
  return mods;
}

/** True if an active ruleset sets this flag (e.g. 'noRadio'). */
export function ruleFlag(state: GameState, content: Content, flag: string): boolean {
  const ids = state.rules?.ids;
  if (!ids?.length) return false;
  return ids.some((id) => rulesetDef(content, id)?.flags?.includes(flag as RuleFlag) ?? false);
}

/** Survival: the fallen can't be revived. */
export function isSurvival(state: GameState): boolean {
  return state.rules?.survival === true;
}

// ------------------------------------------------------------------ unlocks and Legacy

/** Why an unlock isn't met yet by this homestead, or null. */
export function unlockMissing(state: GameState, content: Content, unlock: RulesetUnlock): string | null {
  if ('cycle' in unlock) {
    return (state.legacy?.cycle ?? 1) >= unlock.cycle ? null : `found ${unlock.cycle - 1} homestead${unlock.cycle > 2 ? 's' : ''} first`;
  }
  if ('achievement' in unlock) {
    if (state.achievements[unlock.achievement] !== undefined) return null;
    const def = content.achievements.find((a) => a.id === unlock.achievement);
    return `earn "${def?.name ?? unlock.achievement}" first`;
  }
  if (state.questsDone.includes(unlock.quest)) return null;
  const q = (content.quests as unknown as { quests: { id: string; title: string }[] }).quests.find((x) => x.id === unlock.quest);
  return `complete "${q?.title ?? unlock.quest}" first`;
}

/** Why a ruleset can't be chosen for the next homestead, or null. */
export function rulesetLocked(state: GameState, content: Content, id: string): string | null {
  const def = rulesetDef(content, id);
  if (!def) return 'no such ruleset';
  return unlockMissing(state, content, def.unlock);
}

export function survivalLocked(state: GameState, content: Content): string | null {
  return unlockMissing(state, content, rulesetsContent(content).survival.unlock);
}

/** Rulesets this homestead may choose for the next one. */
export function rulesetsAvailable(state: GameState, content: Content): RulesetDef[] {
  return rulesetsContent(content).rulesets.filter((r) => unlockMissing(state, content, r.unlock) === null);
}

/** Validate a choice of rules for founding (null = fine). Custom games may pick anything. */
export function checkRules(state: GameState, content: Content, rules: string[] | undefined, survival: boolean | undefined): string | null {
  for (const id of rules ?? []) {
    const def = rulesetDef(content, id);
    if (!def) return `no such ruleset: ${id}`;
    if (state.mode === 'custom') continue;
    const why = unlockMissing(state, content, def.unlock);
    if (why) return `${def.name} is locked: ${why}`;
  }
  if (survival && state.mode !== 'custom') {
    const why = survivalLocked(state, content);
    if (why) return `Survival is locked: ${why}`;
  }
  return null;
}

/**
 * Legacy multiplier for the rules this homestead was founded under: each
 * ruleset (and Survival) adds its bonus, e.g. 1.3 and 1.2 make 1.5.
 */
export function rulesLegacyMult(state: GameState, content: Content): number {
  let mult = 1;
  for (const id of state.rules?.ids ?? []) mult += (rulesetDef(content, id)?.legacyMult ?? 1) - 1;
  if (isSurvival(state)) mult += rulesetsContent(content).survival.legacyMult - 1;
  return mult;
}

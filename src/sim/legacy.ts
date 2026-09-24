// Legacy perks and founding sites: the small lookups that other systems use
// to apply prestige bonuses. Founding itself, scoring and outposts live in
// systems/prestige.ts. See docs/design/M5-spec.md.

import type { Content } from './content';
import type { GameState, LegacyState, ResourceKey } from './types';

export type PerkEffect =
  | 'startScrip'
  | 'buildDiscount'
  | 'prefabRooms'
  | 'childStats'
  | 'baseHp'
  | 'xpBonus'
  | 'productionSpeed'
  | 'autoCollect'
  | 'offlineHours'
  | 'carryLimit'
  | 'explorerScrip'
  | 'questSlots'
  | 'contractOffers'
  | 'questHeal'
  | 'outpostOutput'
  | 'foundingParty'
  | 'heirlooms'
  | 'crateLuck';

export interface PerkDef {
  id: string;
  branch: string;
  name: string;
  /** "{v}" is replaced with the value at a rank (percentages for fractional effects). */
  description: string;
  effect: PerkEffect;
  perRank: number;
  /** Cost of each rank; the length is the max rank. */
  costs: number[];
  /** Perk id -> ranks needed first. */
  requires?: Record<string, number>;
}

export interface SiteDef {
  id: string;
  name: string;
  description: string;
  legacyMult: number;
  modifiers: {
    production?: Partial<Record<ResourceKey, number>>;
    /** Multiplies how often random incidents happen. */
    incidentRate?: number;
    startScrip?: number;
  };
}

export interface CharterDef {
  cycle: number;
  population: number;
  quests?: string[];
  contracts?: number;
  text: string;
}

export interface LegacyContent {
  charters: CharterDef[];
  scoring: {
    perTenPopulation: number;
    perStoryQuest: number;
    perContract: number;
    perAchievement: number;
    perFiveLevels: number;
    perLevelThreeRoom: number;
    perDay: number;
    maxDays: number;
    perLegendaryResident: number;
    perBossDefeated: number;
  };
  founding: { partyBase: number; heirloomBase: number };
  sites: SiteDef[];
  outposts: { scripPerResidentHour: number; salvagePerResidentHour: number; crateHoursPer10Residents: number; storageHours: number };
  branches: { id: string; name: string; description: string }[];
  perks: PerkDef[];
}

export function legacyContent(content: Content): LegacyContent {
  return content.legacy as unknown as LegacyContent;
}

export function newLegacy(): LegacyState {
  return {
    cycle: 1,
    points: 0,
    earned: 0,
    perks: {},
    siteId: 'plot7',
    statsAtFounding: {},
    achievementsAtFounding: 0,
    history: [],
    outposts: [],
  };
}

export function perkDef(content: Content, id: string): PerkDef | undefined {
  return legacyContent(content).perks.find((p) => p.id === id);
}

export function perkRank(state: GameState, id: string): number {
  return state.legacy?.perks[id] ?? 0;
}

/** Total bonus from every perk with this effect (perRank × ranks). */
export function perkValue(state: GameState, content: Content, effect: PerkEffect): number {
  const perks = state.legacy?.perks;
  if (!perks) return 0;
  let total = 0;
  for (const p of legacyContent(content).perks) {
    if (p.effect === effect) total += p.perRank * (perks[p.id] ?? 0);
  }
  return total;
}

export function siteDef(content: Content, id: string): SiteDef | undefined {
  return legacyContent(content).sites.find((s) => s.id === id);
}

/** Production multiplier for a resource: the site's modifier times Overtime. */
export function productionMult(state: GameState, content: Content, resource: ResourceKey | undefined): number {
  const site = siteDef(content, state.legacy?.siteId ?? 'plot7');
  const siteMult = resource ? (site?.modifiers.production?.[resource] ?? 1) : 1;
  return siteMult * (1 + perkValue(state, content, 'productionSpeed'));
}

/** How much more often random incidents happen at this site. */
export function incidentRate(state: GameState, content: Content): number {
  return siteDef(content, state.legacy?.siteId ?? 'plot7')?.modifiers.incidentRate ?? 1;
}

/** Build and upgrade cost multiplier (Union Rates). */
export function costMult(state: GameState | undefined, content: Content): number {
  if (!state) return 1;
  return Math.max(0.2, 1 - perkValue(state, content, 'buildDiscount'));
}

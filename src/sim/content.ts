// Typed access to the JSON content files. Content is data, so designers (and
// later, modders or the Custom Game editor) can change it without touching code.

import roomsJson from '../content/rooms.json';
import balanceJson from '../content/balance.json';
import namesJson from '../content/names.json';
import achievementsJson from '../content/achievements.json';
import itemsJson from '../content/items.json';
import salvageJson from '../content/salvage.json';
import explorationJson from '../content/exploration.json';
import craftingJson from '../content/crafting.json';
import questsJson from '../content/quests.json';
import legacyJson from '../content/legacy.json';
import researchJson from '../content/research.json';
import deepJson from '../content/deep.json';
import traitsJson from '../content/traits.json';
import topsideJson from '../content/topside.json';
import factionsJson from '../content/factions.json';
import type { Rarity, ResourceKey, StatKey, Stats } from './types';

export type RoomCategory = 'door' | 'elevator' | 'living' | 'production' | 'storage' | 'radio' | 'workshop' | 'office' | 'research';
export type StorageKind = ResourceKey | 'population' | 'items';

/** Tables indexed [level - 1][segments - 1]. */
export type LevelWidthTable = number[][];

export interface RoomDef {
  id: string;
  name: string;
  levelNames?: string[];
  category: RoomCategory;
  stat: StatKey | null;
  unlockPop: number;
  buildable: boolean;
  cost: { base: number; perBuilt: number };
  /** Single-segment upgrade costs to level 2 and 3; null = not upgradable. */
  upgrade: number[] | null;
  /** Grid cells per segment. */
  cells: number;
  maxSegments: number;
  capacityPerSegment: number;
  usesPower: boolean;
  produces?: { resource: ResourceKey; poolBase: number; output: LevelWidthTable };
  storage?: { resource: StorageKind; amount: LevelWidthTable };
  /** Door only: HP that raiders must break through, per door level. */
  doorHp?: number[];
  /** Population needed for each upgrade (to level 2, level 3). */
  upgradePop?: number[];
  /** At most this many can be built (the Command Office is unique). */
  maxBuilt?: number;
  /** M6: research node needed before it can be built. */
  requiresResearch?: string;
  /** M6: lowest floor it can go on (deep-only rooms). */
  minFloor?: number;
  /** M7: a surface building, built on floor -1 above the homestead. */
  topside?: boolean;
}

export interface WeaponDef {
  id: string;
  name: string;
  rarity: Rarity;
  min: number;
  max: number;
  /** Stat that speeds up crafting this item. */
  craftStat: StatKey;
}

export interface OutfitDef {
  id: string;
  name: string;
  rarity: Rarity;
  bonus: Partial<Stats>;
  craftStat: StatKey;
}

export type SalvageMaterial = 'circuitry' | 'hide' | 'adhesive' | 'cloth' | 'chemicals' | 'steel' | 'valuables';

export interface SalvageDef {
  id: string;
  name: string;
  material: SalvageMaterial;
  rarity: Rarity;
  value: number;
}

export type ItemDef = ({ kind: 'weapon' } & WeaponDef) | ({ kind: 'outfit' } & OutfitDef);

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  tier: 'bronze' | 'silver' | 'gold';
  /** Key into GameState.stats. */
  stat: string;
  target: number;
  hidden?: boolean;
}

export type Balance = typeof balanceJson;

export interface Content {
  rooms: Record<string, RoomDef>;
  roomList: RoomDef[];
  balance: Balance;
  names: typeof namesJson;
  achievements: AchievementDef[];
  weapons: Record<string, WeaponDef>;
  outfits: Record<string, OutfitDef>;
  /** Every item by id, with its kind. */
  items: Record<string, ItemDef>;
  sellValue: Record<Rarity, number>;
  salvage: Record<string, SalvageDef>;
  salvageList: SalvageDef[];
  /** Exploration content and tuning (owned by systems/exploration.ts). */
  exploration: typeof explorationJson;
  /** Crafting content and tuning (owned by systems/crafting.ts). */
  crafting: typeof craftingJson;
  /** Quest content and combat tuning (typed in systems/quests.ts). */
  quests: typeof questsJson;
  /** Prestige content (typed in legacy.ts). */
  legacy: typeof legacyJson;
  /** M6 (typed in systems/research.ts, deep.ts, traits.ts). */
  research: typeof researchJson;
  deep: typeof deepJson;
  traits: typeof traitsJson;
  /** M7 (typed in systems/weather.ts and systems/factions.ts). */
  topside: typeof topsideJson;
  factions: typeof factionsJson;
}

function validate(content: Content): Content {
  for (const def of content.roomList) {
    const tables = [def.produces?.output, def.storage?.amount].filter(Boolean) as LevelWidthTable[];
    const levels = def.upgrade ? def.upgrade.length + 1 : 1;
    for (const t of tables) {
      if (t.length < levels) throw new Error(`room ${def.id}: table has ${t.length} levels, needs ${levels}`);
      for (const row of t) {
        if (row.length < def.maxSegments) throw new Error(`room ${def.id}: table row too short`);
      }
    }
  }
  return content;
}

export function loadContent(): Content {
  const roomList = roomsJson as RoomDef[];
  const weapons = itemsJson.weapons as WeaponDef[];
  const outfits = itemsJson.outfits as OutfitDef[];
  const items: Record<string, ItemDef> = {};
  for (const w of weapons) items[w.id] = { kind: 'weapon', ...w };
  for (const o of outfits) items[o.id] = { kind: 'outfit', ...o };
  return validate({
    rooms: Object.fromEntries(roomList.map((r) => [r.id, r])),
    roomList,
    balance: balanceJson,
    names: namesJson,
    // Systems can ship their own achievements alongside their content.
    achievements: [
      ...(achievementsJson as AchievementDef[]),
      ...((explorationJson as { achievements?: AchievementDef[] }).achievements ?? []),
      ...((craftingJson as { achievements?: AchievementDef[] }).achievements ?? []),
      ...((questsJson as { achievements?: AchievementDef[] }).achievements ?? []),
      ...((legacyJson as { achievements?: AchievementDef[] }).achievements ?? []),
      ...((researchJson as { achievements?: AchievementDef[] }).achievements ?? []),
      ...((deepJson as { achievements?: AchievementDef[] }).achievements ?? []),
      ...((traitsJson as { achievements?: AchievementDef[] }).achievements ?? []),
      ...((topsideJson as { achievements?: AchievementDef[] }).achievements ?? []),
      ...((factionsJson as { achievements?: AchievementDef[] }).achievements ?? []),
    ],
    weapons: Object.fromEntries(weapons.map((w) => [w.id, w])),
    outfits: Object.fromEntries(outfits.map((o) => [o.id, o])),
    items,
    sellValue: itemsJson.sellValue as Record<Rarity, number>,
    salvage: Object.fromEntries((salvageJson as SalvageDef[]).map((x) => [x.id, x])),
    salvageList: salvageJson as SalvageDef[],
    exploration: explorationJson,
    crafting: craftingJson,
    quests: questsJson,
    legacy: legacyJson,
    research: researchJson,
    deep: deepJson,
    traits: traitsJson,
    topside: topsideJson,
    factions: factionsJson,
  });
}

/** Look up a [level][segments] table safely. */
export function tableValue(table: LevelWidthTable, level: number, segments: number): number {
  return table[level - 1]?.[segments - 1] ?? 0;
}

export function maxLevel(def: RoomDef): number {
  return def.upgrade ? def.upgrade.length + 1 : 1;
}

// Typed access to the JSON content files. Content is data, so designers (and
// later, modders or the Custom Game editor) can change it without touching code.

import roomsJson from '../content/rooms.json';
import balanceJson from '../content/balance.json';
import namesJson from '../content/names.json';
import achievementsJson from '../content/achievements.json';
import type { ResourceKey, StatKey } from './types';

export type RoomCategory = 'door' | 'elevator' | 'living' | 'production' | 'storage';
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
}

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
  return validate({
    rooms: Object.fromEntries(roomList.map((r) => [r.id, r])),
    roomList,
    balance: balanceJson,
    names: namesJson,
    achievements: achievementsJson as AchievementDef[],
  });
}

/** Look up a [level][segments] table safely. */
export function tableValue(table: LevelWidthTable, level: number, segments: number): number {
  return table[level - 1]?.[segments - 1] ?? 0;
}

export function maxLevel(def: RoomDef): number {
  return def.upgrade ? def.upgrade.length + 1 : 1;
}

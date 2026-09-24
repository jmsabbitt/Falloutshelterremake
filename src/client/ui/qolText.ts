// Small shared labels for the M6 quality-of-life modules.

import { roomDef, type Content, type Room, type StatKey } from '../../sim';

export const STAT_SHORT: Record<StatKey, string> = {
  brawn: 'BRN',
  sight: 'SGT',
  grit: 'GRT',
  charm: 'CHR',
  wits: 'WIT',
  knack: 'KNK',
  fortune: 'FOR',
};

export const STAT_FULL: Record<StatKey, string> = {
  brawn: 'Brawn',
  sight: 'Sight',
  grit: 'Grit',
  charm: 'Charm',
  wits: 'Wits',
  knack: 'Knack',
  fortune: 'Fortune',
};

/** A room's name at its level ("Barracks" for a level 3 Quarters). */
export function roomName(content: Content, room: Room): string {
  const def = roomDef(content, room);
  return def.levelNames?.[room.level - 1] ?? def.name;
}

/** "Ada, Ben and Cy" or "Ada, Ben and 4 others". */
export function nameList(names: string[], max = 3): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length > max) return `${names.slice(0, max).join(', ')} and ${names.length - max} other${names.length - max === 1 ? '' : 's'}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

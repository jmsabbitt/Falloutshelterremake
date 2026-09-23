// Public surface of the simulation. The client imports only from here.

export * from './types';
export {
  loadContent,
  tableValue,
  maxLevel,
  type Content,
  type RoomDef,
  type AchievementDef,
  type ItemDef,
  type WeaponDef,
  type OutfitDef,
} from './content';
export { newGame, type NewGameOptions } from './state';
export { applyCommand, roomCapacity, type Command, type CommandResult } from './commands';
export { advance, catchUp, drainEvents, type CatchUpSummary } from './tick';
export { serialize, deserialize, SAVE_VERSION } from './save';
export { canPlace, connectedRoomIds, floorOccupancy, roomCells, roomDef } from './grid';
export { buildCost, upgradeCost, storageCapacity, resourceCapacity, population } from './economy';
export { cycleSeconds, poolSize, batchOutput, vaultHappiness, roomStatTotal } from './systems/production';
export { rushFailChance } from './systems/rush';
export { powerDemandPerMin, foodDemandPerMin, waterDemandPerMin, shortageThreshold, isRightRoom } from './systems/needs';
export { achievementProgress } from './systems/achievements';
export { incidentDef, defenders, touchesDirt } from './systems/incidents';
export { itemCapacity, sellValue, itemDef } from './systems/items';
export { radioInterval, radioChance } from './systems/arrivals';
export { courtshipSeconds } from './systems/family';
export {
  residentsInRoom,
  workersInRoom,
  livingResidents,
  effectiveMaxHp,
  effectiveStat,
  effectiveStats,
  combatDamage,
  reviveCost,
  xpToNext,
  topStats,
  statTotal,
  isChild,
  fleesIncidents,
} from './residents';

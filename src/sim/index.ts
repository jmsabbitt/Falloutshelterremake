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
  type WeaponGrip,
  WEAPON_GRIPS,
  type OutfitDef,
  type SalvageDef,
} from './content';
export { newGame, type NewGameOptions } from './state';
export { TUTORIAL_ROOMS, TUTORIAL_STEPS, tutorialActive, tutorialFreeBuild, tutorialRoom, tutorialStep } from './systems/tutorial';
export { applyCommand, roomCapacity, type Command, type CommandResult } from './commands';
export { advance, catchUp, drainEvents, type CatchUpSummary } from './tick';
export { serialize, deserialize, SAVE_VERSION } from './save';
export { canPlace, connectedRoomIds, floorOccupancy, roomCells, roomDef } from './grid';
export { buildCost, upgradeCost, storageCapacity, resourceCapacity, population } from './economy';
export { cycleSeconds, poolSize, batchOutput, vaultHappiness, roomStatTotal } from './systems/production';
export { rushFailChance } from './systems/rush';
export { powerDemandPerMin, foodDemandPerMin, waterDemandPerMin, shortageThreshold, shortageLine, isRightRoom } from './systems/needs';
export { achievementProgress } from './systems/achievements';
export { incidentDef, defenders, touchesDirt, deepIncidentTypes } from './systems/incidents';
export { itemCapacity, sellValue, itemDef } from './systems/items';
export { radioInterval, radioChance } from './systems/arrivals';
export { courtshipSeconds } from './systems/family';
export {
  canExplore,
  carriedCount,
  secondsUntilHome,
  MAX_SUPPLIES,
  MAX_EXPLORERS,
  CARRY_LIMIT,
  carryLimit,
} from './systems/exploration';
export {
  recipeFor,
  workshopRecipes,
  canCraft,
  craftSeconds,
  craftTimeLeft,
  scrapPreview,
  reforgeCost,
  reforgeChance,
  canReforge,
  crewCraftStat,
  type Recipe,
} from './systems/crafting';
export {
  abilityFor,
  availableQuests,
  canQuest,
  critMultiplier,
  critRingSpeed,
  currentRoom,
  damageReduction,
  enemyDef,
  inCombat,
  officeSlots,
  questContent,
  questDef,
  questLocked,
  type AbilityDef,
  type EnemyDef,
  type QuestDef,
  type QuestEventDef,
} from './systems/quests';
export {
  buyPerk,
  canBuyPerk,
  canFound,
  canFoundHomestead,
  charterFor,
  charterStatus,
  foundHomestead,
  foundingLimits,
  legacyBreakdown,
  outpostTotals,
  sinceFounding,
  type CharterRequirement,
  type FoundOptions,
  type LegacyLine,
} from './systems/prestige';
export {
  legacyContent,
  perkDef,
  perkRank,
  perkValue,
  siteDef,
  type CharterDef,
  type PerkDef,
  type PerkEffect,
  type SiteDef,
} from './legacy';
export { bonus, researchValue, productionMult, costMult, type BonusEffect, type ResearchEffect } from './bonuses';
export {
  canResearch,
  hasResearch,
  researchContent,
  researchNode,
  researchRate,
  labRate,
  nodeStatus,
  keptResearch,
  doResearch,
  AUTO_ASSIGN_SECONDS,
  AUTO_MEDIC_SECONDS,
  type ResearchNodeDef,
} from './systems/research';
export {
  braced,
  canExcavate,
  deepContent,
  digCost,
  digRate,
  digSeconds,
  digShaft,
  digTimeLeft,
  discoveryDef,
  isDeepFloor,
  nextStratum,
  refineryBatch,
  refineryPerHour,
  stratumDef,
  stratumOf,
  totalFloors,
  type DeepContent,
  type DiscoveryDef,
  type StratumDef,
} from './systems/deep';
export {
  currentShift,
  homesteadHour,
  masteryProgress,
  masteryTier,
  masteryTierName,
  professionTitle,
  traitDef,
  traitDefs,
  traitHappiness,
  traitsContent,
  workerMult,
  type TraitDef,
} from './systems/traits';
export { autoAssign, idleAdults } from './systems/assign';
export { isTopside, weatherMult, raidDefense, stormShielding, signalRange, topsideContent } from './systems/weather';
export {
  changeRep,
  repOf,
  factionDef,
  factionsContent,
  repTier,
  factionTier,
  isMet,
  raidRateMult,
  hasTradingPost,
  tradingPostStaffed,
  signalLevel,
  contactLocked,
  tradeOffers,
  refreshTrade,
  offerItemFor,
  tradeBlocked,
  recruitsHired,
  hireRecruit,
  canCaravan,
  caravanSlots,
  goodsUnits,
  carryLimit as caravanCarryLimit,
  goodsValue,
  caravanEstimate,
  type FactionOffer,
  type OfferSide,
  type CaravanResult,
  type CaravanEstimate,
  type RepTier,
  type FactionDef,
} from './systems/factions';
export { TOPSIDE_FLOOR } from './grid';
export { threatRating, type ThreatRating, type ThreatFactor } from './systems/threat';
export { knowsRecipe, fragmentsNeeded, salvageCount, SALVAGE_CAP } from './systems/inventory';
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
  isAway,
  fleesIncidents,
} from './residents';
export {
  upcomingReminders,
  DEFAULT_HORIZON_SECONDS,
  DEFAULT_MAX_REMINDERS,
  type Reminder,
  type ReminderKind,
  type ReminderOptions,
} from './systems/reminders';
export { rulesetMods, ruleFlag, type RulesetMods } from './systems/rulesets';
export { recruitLegend, type LegendSource } from './systems/legends';
export { newCustomGame, customPresets, customPreset, CUSTOM_ACTIONS, type CustomGameOptions } from './systems/custom';
export { rulesetsAvailable, rulesetLocked, survivalLocked, rulesLegacyMult } from './systems/prestige';
export {
  legendsContent,
  legendDef,
  legendName,
  legendStatus,
  legendResident,
  legendQuestline,
  recallLegend,
  canRecallLegend,
  upgradeLegend,
  radioLegendProgress,
  type LegendDef,
  type LegendStatus,
} from './systems/legends';
export * from './systems/collection';
export { SEAL_ID, sealProgress, sealRequirements, wardenTitle } from './systems/achievements';
export { maulerStatus, type MaulerStatus } from './systems/incidents';
export { lootContent, cacheDef, isLootOnly, exclusiveRegionOf } from './systems/loot';
export {
  endingsContent,
  endingDef,
  endingOptions,
  endingLocked,
  endingChoiceOpen,
  endingTitle,
  endingBonus,
  epilogue,
  epilogueSlideIds,
  replayEpilogue,
  conditionStatus,
  storiesFinished,
  legendsMet,
  factionsAtTier,
  type EndingDef,
  type EndingOption,
  type ConditionStatus,
  type Slide,
  type SlideDef,
} from './systems/endings';
export { networkPreview, networkAllies, networkTuning, ALLY_ORDER } from './systems/network';

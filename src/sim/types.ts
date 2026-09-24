// Core data model for the simulation. Everything in GameState must be plain,
// JSON-serialisable data: no classes, no functions, no Maps.

export const STAT_KEYS = ['brawn', 'sight', 'grit', 'charm', 'wits', 'knack', 'fortune'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export type ResourceKey = 'power' | 'food' | 'water' | 'medpatch' | 'purge';
export type Resources = Record<ResourceKey, number>;

export type Sex = 'f' | 'm';
export type Rarity = 'common' | 'rare' | 'legendary';

export interface Appearance {
  skin: number;
  hair: number;
}

export interface Pregnancy {
  fatherId: number;
  /** Sim time when the baby is due. */
  dueAt: number;
}

export interface Courtship {
  partnerId: number;
  /** Seconds of courtship accumulated. */
  progress: number;
}

export interface Resident {
  id: number;
  firstName: string;
  lastName: string;
  sex: Sex;
  rarity: Rarity;
  /** Base stats (1..10). Outfits add on top; see effectiveStat(). */
  stats: Stats;
  level: number;
  xp: number;
  /** Current health. Effective max is maxHp - taint. */
  hp: number;
  maxHp: number;
  /** Glare-sickness; eats into max HP from the right, like radiation in the original. */
  taint: number;
  /** 0..100 */
  happiness: number;
  /** Where they are. `null` + !waiting means idle inside the homestead. */
  roomId: number | null;
  /** Standing outside the door, not yet admitted. */
  waiting: boolean;
  dead: boolean;
  appearance: Appearance;
  motherId: number | null;
  fatherId: number | null;
  /** Sim time at which a child grows up; null for adults. */
  adultAt: number | null;
  pregnancy: Pregnancy | null;
  courtship: Courtship | null;
  /** Equipped item definition ids. */
  weapon: string | null;
  outfit: string | null;
  /** Expedition id while out in the Glarelands; away residents are not in the homestead. */
  expedition: number | null;
  /** M4: quest instance id while away on a quest. */
  quest: number | null;
}

// ------------------------------------------------------------------ M3: Glarelands

export type ExpeditionStatus = 'exploring' | 'returning' | 'returned' | 'dead';

export type JournalKind = 'find' | 'fight' | 'event' | 'musing' | 'danger' | 'levelup' | 'status';

export interface JournalEntry {
  /** Seconds since the expedition left. */
  t: number;
  kind: JournalKind;
  text: string;
}

export interface ExpeditionLoot {
  scrip: number;
  /** Weapon/outfit definition ids. */
  items: string[];
  /** Salvage id -> count. */
  salvage: Record<string, number>;
  /** Item definition id -> blueprint fragments found. */
  fragments: Record<string, number>;
  /** Item definition ids of whole recipes found. */
  recipes: string[];
}

export interface Expedition {
  id: number;
  residentId: number;
  regionId: string;
  status: ExpeditionStatus;
  /** Seconds spent exploring (stops growing once returning). */
  elapsed: number;
  /** Seconds left on the way home (only while returning). */
  returnRemaining: number;
  supplies: { medpatch: number; purge: number };
  loot: ExpeditionLoot;
  journal: JournalEntry[];
  /** Next-event timers in expedition seconds, keyed by event kind (owned by exploration.ts). */
  timers: Record<string, number>;
  /** One-time event ids already seen on this trip. */
  done: string[];
}

/** A crafting job in a workshop room. */
export interface CraftJob {
  defId: string;
  /** Seconds left. 0 = finished, waiting to be collected. */
  remaining: number;
  total: number;
}

export interface Room {
  id: number;
  type: string;
  floor: number;
  /** Left-most grid cell. */
  x: number;
  /** Width in segments (1..3). Elevators and the door use their own cell widths. */
  segments: number;
  level: number;
  /** Accumulated production points toward the next batch. */
  pool: number;
  /** True when a batch is waiting to be collected. */
  ready: boolean;
  powered: boolean;
  /** General-purpose room timer (radio signal progress). */
  timer: number;
  /** Workshops only: the current crafting job. */
  job: CraftJob | null;
}

export type IncidentType = 'fire' | 'skitters' | 'burrowers' | 'rustmen';

export interface Incident {
  id: number;
  type: IncidentType;
  roomId: number;
  hp: number;
  maxHp: number;
  /** Total damage per second dealt to residents in the room. */
  dps: number;
  /** Rooms this incident (or its chain) has already been in. */
  visited: number[];
  /** Seconds the current room has been left undefended. */
  emptyFor: number;
  /** Seconds spent in the current room. */
  roomTime: number;
  /** Raiders only: remaining door HP before they get in. */
  doorHp: number;
  /** Raiders only: scrip stolen so far (dropped back if they are beaten). */
  stolen: number;
}

export interface Item {
  id: number;
  defId: string;
}

export type CrateTier = 'standard' | 'rare' | 'legendary';

export type CrateCard =
  | { kind: 'scrip'; amount: number }
  | { kind: 'resource'; resource: ResourceKey; amount: number }
  | { kind: 'tokens'; amount: number }
  | { kind: 'item'; defId: string; rarity: Rarity; sold: number }
  | { kind: 'resident'; residentId: number; rarity: Rarity };

// ------------------------------------------------------------------ M4: quests

/** A reward bundle (quest room loot, event outcomes, completion rewards, contract bounties). */
export interface QuestReward {
  scrip?: number | [number, number];
  xp?: number;
  /** Whole items by definition id. */
  items?: string[];
  /** A random item roll. */
  item?: { chance: number; rarity: 'common' | 'rare'; kind?: 'weapon' | 'outfit' };
  salvage?: { rarity: Rarity; count: [number, number]; materials?: string[] };
  /** Named fragments, item definition id -> count. */
  fragments?: Record<string, number>;
  /** A random fragment roll toward a recipe not yet known. */
  fragment?: { chance: number; rarity: 'rare' | 'legendary' };
  recipes?: string[];
  crates?: Partial<Record<CrateTier, number>>;
  medpatch?: number;
  purge?: number;
  /** Exploration regions unlocked. */
  regions?: string[];
}

export type QuestRoomKind = 'start' | 'empty' | 'fight' | 'loot' | 'event' | 'boss';

export interface QuestRoom {
  id: string;
  floor: number;
  col: number;
  links: string[];
  kind: QuestRoomKind;
  /** Enemy definition ids that spawn on entry (resolved from pools when the quest starts). */
  enemies: string[];
  loot: QuestReward | null;
  event: string | null;
  /** Clearing this room completes the quest. */
  objective: boolean;
  visited: boolean;
  cleared: boolean;
}

export interface QuestMember {
  residentId: number;
  /** Knocked out in this fight; stands back up when the room is cleared. */
  downed: boolean;
  /** Enemy uid this member attacks; null = automatic. */
  target: number | null;
  /** Seconds to the next attack. */
  attackTimer: number;
  /** Crit meter, 0..1. At 1 the player can land a critical hit. */
  crit: number;
  /** Seconds until the resident's ability is ready again. */
  abilityCooldown: number;
  /** Seconds left drawing every enemy's attacks (Hold the Line). */
  taunt: number;
}

export interface QuestEnemy {
  uid: number;
  defId: string;
  hp: number;
  maxHp: number;
  attackTimer: number;
  /** Resident id being attacked; null = pick one. */
  target: number | null;
  /** Seconds until each of the enemy's abilities (by index) starts winding up. */
  abilityTimers: number[];
  /** A telegraphed attack being wound up; a stun cancels it. */
  windup: { index: number; remaining: number } | null;
  stunned: number;
  /** Seconds left on an enrage (damage multiplier from the ability). */
  enraged: number;
  enrageMult: number;
}

export interface ContractOffer {
  id: number;
  templateId: string;
  title: string;
  brief: string;
  level: number;
  travelSeconds: number;
  /** The named reward, shown up front (GDD §15: bounty contracts). */
  bounty: QuestReward;
  /** Sim time the offer disappears. */
  expiresAt: number;
}

export type QuestStatus = 'travelling' | 'onsite' | 'returning' | 'returned';
export type QuestOutcome = 'success' | 'failed' | 'abandoned';

export interface Quest {
  id: number;
  /** Story quest definition id, or contract template id. */
  defId: string;
  /** Set for contracts: the offer taken (its bounty is paid on success). */
  contract: ContractOffer | null;
  title: string;
  level: number;
  status: QuestStatus;
  outcome: QuestOutcome | null;
  travelTotal: number;
  travelRemaining: number;
  party: QuestMember[];
  rooms: QuestRoom[];
  /** Room the party is in (or walking from). */
  roomId: string;
  moving: { to: string; remaining: number } | null;
  /** Enemies in the current room. */
  enemies: QuestEnemy[];
  /** Event waiting for the player's choice. */
  pendingEvent: string | null;
  /** Short narrative lines (event outcomes, finds), newest last. */
  log: string[];
  loot: ExpeditionLoot & { crates: Partial<Record<CrateTier, number>>; medpatch: number; purge: number; xp: number };
  supplies: { medpatch: number };
  /** Seconds left on the party-wide damage buff (Rally). */
  rally: number;
  onsiteTime: number;
}

export type GameEvent =
  | { type: 'collected'; roomId: number; resource: ResourceKey; amount: number; bonusScrip: number }
  | { type: 'rushSucceeded'; roomId: number }
  | { type: 'rushFailed'; roomId: number; incidentId: number }
  | { type: 'incidentStarted'; incidentId: number; roomId: number; incident: IncidentType }
  | { type: 'incidentSpread'; incidentId: number; roomId: number; incident: IncidentType }
  | { type: 'incidentResolved'; incidentId: number; roomId: number; incident: IncidentType; loot: number }
  | { type: 'doorBreached'; incidentId: number }
  | { type: 'residentLeveled'; residentId: number; level: number }
  | { type: 'residentDied'; residentId: number }
  | { type: 'residentRevived'; residentId: number }
  | { type: 'residentAdmitted'; residentId: number }
  | { type: 'residentArrived'; residentId: number; source: 'radio' | 'wanderer' | 'crate' }
  | { type: 'courtshipStarted'; motherId: number; fatherId: number }
  | { type: 'pregnancy'; motherId: number; fatherId: number }
  | { type: 'birth'; childId: number; motherId: number }
  | { type: 'grewUp'; residentId: number }
  | { type: 'roomBuilt'; roomId: number; roomType: string }
  | { type: 'roomUpgraded'; roomId: number; level: number }
  | { type: 'roomsMerged'; roomId: number; segments: number }
  | { type: 'roomUnlocked'; roomType: string }
  | { type: 'crateEarned'; tier: CrateTier; source: string }
  | { type: 'crateOpened'; tier: CrateTier; cards: CrateCard[] }
  | { type: 'storageFull'; defId: string; sold: number }
  | { type: 'achievementUnlocked'; achievementId: string }
  // M3
  | { type: 'expeditionStarted'; expeditionId: number; residentId: number }
  | { type: 'expeditionJournal'; expeditionId: number; entry: JournalEntry }
  | { type: 'expeditionReturning'; expeditionId: number; reason: 'recalled' | 'full' }
  | { type: 'expeditionReturned'; expeditionId: number }
  | { type: 'expeditionCollected'; expeditionId: number; loot: ExpeditionLoot }
  | { type: 'explorerDied'; expeditionId: number; residentId: number }
  | { type: 'recipeUnlocked'; defId: string; source: 'fragments' | 'found' }
  | { type: 'fragmentFound'; defId: string; have: number; need: number }
  | { type: 'craftStarted'; roomId: number; defId: string }
  | { type: 'craftFinished'; roomId: number; defId: string }
  | { type: 'craftCollected'; roomId: number; defId: string }
  | { type: 'itemScrapped'; defId: string; salvage: Record<string, number> }
  | { type: 'reforged'; inputs: string[]; result: string; upgraded: boolean }
  // M4
  | { type: 'questStarted'; questId: number }
  | { type: 'questArrived'; questId: number }
  | { type: 'questRoomEntered'; questId: number; roomId: string }
  | { type: 'questCombat'; questId: number; roomId: string }
  | { type: 'questHit'; questId: number; from: 'party' | 'enemy'; source: number; target: number; amount: number; crit: boolean }
  | { type: 'questAbility'; questId: number; residentId: number; ability: string }
  | { type: 'questWindup'; questId: number; enemyUid: number; ability: string; seconds: number }
  | { type: 'questInterrupted'; questId: number; enemyUid: number }
  | { type: 'questEnemyDown'; questId: number; enemyUid: number }
  | { type: 'questMemberDown'; questId: number; residentId: number }
  | { type: 'questRoomCleared'; questId: number; roomId: string }
  | { type: 'questLoot'; questId: number; text: string }
  | { type: 'questEventPrompt'; questId: number; eventId: string }
  | { type: 'questEventResolved'; questId: number; eventId: string; success: boolean; text: string }
  | { type: 'questFinished'; questId: number; outcome: QuestOutcome }
  | { type: 'questReturned'; questId: number }
  | { type: 'questCollected'; questId: number; outcome: QuestOutcome; defId: string }
  | { type: 'contractsRefreshed' };

/** Lifetime counters. Feed achievements, the stats screen and balancing. */
export type LifetimeStats = Record<string, number>;

export interface GameState {
  /** Simulation clock in seconds since this homestead was founded. */
  time: number;
  /** Wall-clock ms at the last simulated moment; used for offline catch-up. */
  lastRealTime: number;
  homesteadNumber: number;
  rng: [number, number, number, number];
  nextId: number;
  scrip: number;
  resources: Resources;
  rooms: Room[];
  residents: Resident[];
  incidents: Incident[];
  /** Unequipped items in storage. */
  items: Item[];
  /** M3: salvage bin (salvage id -> count). Separate from item storage. */
  salvage: Record<string, number>;
  /** M3: item definition ids whose recipes are known (commons are always known). */
  recipes: string[];
  /** M3: blueprint fragments collected toward recipes not yet known. */
  fragments: Record<string, number>;
  /** M3: failed reforges in a row (guarantees an upgrade after a few). */
  reforgePity: number;
  /** M3: expeditions out in (or back from) the Glarelands. */
  expeditions: Expedition[];
  /** M3: region ids the player can send explorers to. */
  regionsUnlocked: string[];
  /** M4: quests in progress (and back home awaiting collection). */
  quests: Quest[];
  /** M4: story quest ids completed. */
  questsDone: string[];
  /** M4: repeatable contracts on offer, refreshed daily (sim time). */
  contracts: { offers: ContractOffer[]; refreshAt: number };
  crates: Record<CrateTier, number>;
  crateTokens: number;
  /** Crates opened since the last legendary card (drives the pity guarantee). */
  pity: number;
  daily: { lastDay: number; streak: number };
  /** Population milestones already rewarded. */
  milestones: number[];
  /** Seconds since the last incident, and when the next random one fires. */
  incidentTimer: number;
  nextIncidentAt: number;
  /** Sim time when the next wandering stranger shows up at the door. */
  nextWandererAt: number;
  /** Recent-rush strain; each rush adds 1, decays over time. */
  rushStrain: number;
  /** Highest living population ever reached; drives room unlocks. */
  peakPopulation: number;
  unlockedRooms: string[];
  achievements: Record<string, number>; // id -> sim time unlocked
  stats: LifetimeStats;
  /** Seconds of offline consumption already applied in the current absence. */
  offlineConsumed: number;
  /** Events produced since the client last drained them. Not meaningful across saves. */
  events: GameEvent[];
}

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
  | { type: 'achievementUnlocked'; achievementId: string };

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

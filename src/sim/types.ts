// Core data model for the simulation. Everything in GameState must be plain,
// JSON-serialisable data: no classes, no functions, no Maps.

export const STAT_KEYS = ['brawn', 'sight', 'grit', 'charm', 'wits', 'knack', 'fortune'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export type ResourceKey = 'power' | 'food' | 'water' | 'medpatch' | 'purge';
export type Resources = Record<ResourceKey, number>;

export type Sex = 'f' | 'm';
export type Rarity = 'common' | 'rare' | 'legendary';

export interface Resident {
  id: number;
  firstName: string;
  lastName: string;
  sex: Sex;
  rarity: Rarity;
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
}

export type IncidentType = 'fire';

export interface Incident {
  id: number;
  type: IncidentType;
  roomId: number;
  hp: number;
  maxHp: number;
  /** Total damage per second dealt to residents in the room. */
  dps: number;
}

export type GameEvent =
  | { type: 'collected'; roomId: number; resource: ResourceKey; amount: number; bonusScrip: number }
  | { type: 'rushSucceeded'; roomId: number }
  | { type: 'rushFailed'; roomId: number; incidentId: number }
  | { type: 'incidentStarted'; incidentId: number; roomId: number; incident: IncidentType }
  | { type: 'incidentResolved'; incidentId: number; roomId: number; incident: IncidentType }
  | { type: 'residentLeveled'; residentId: number; level: number }
  | { type: 'residentDied'; residentId: number }
  | { type: 'residentRevived'; residentId: number }
  | { type: 'residentAdmitted'; residentId: number }
  | { type: 'roomBuilt'; roomId: number; roomType: string }
  | { type: 'roomUpgraded'; roomId: number; level: number }
  | { type: 'roomsMerged'; roomId: number; segments: number }
  | { type: 'roomUnlocked'; roomType: string }
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

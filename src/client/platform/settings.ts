// M8: the player's device settings, stored as JSON under `homestead.settings`
// (mirrored to native Preferences like the saves; see storage.ts). Stream T
// reads `batterySaver` and `reducedMotion` from the same key with its own
// reader, so those two names and their meaning are fixed.

import type { ReminderKind } from '../../sim';
import { readJson, writeJson } from '../storage';

export const SETTINGS_KEY = 'homestead.settings';

/** Notification groups the player can switch off one by one. */
export type NotifyGroup = 'expeditions' | 'production' | 'family' | 'offers';

export const NOTIFY_GROUPS: { id: NotifyGroup; label: string; note: string }[] = [
  { id: 'expeditions', label: 'Expeditions and caravans', note: 'Explorers, caravans and quest parties home' },
  { id: 'production', label: 'Production and storage', note: 'Research, workshops, training, the Deep, outposts, full storage' },
  { id: 'family', label: 'Family', note: 'Births and children growing up' },
  { id: 'offers', label: 'Offers', note: 'Fresh contracts, trade and supply crates' },
];

/** Which group each reminder kind belongs to. */
export const KIND_GROUP: Record<ReminderKind, NotifyGroup> = {
  explorer: 'expeditions',
  caravan: 'expeditions',
  quest: 'expeditions',
  research: 'production',
  craft: 'production',
  storage: 'production',
  deep: 'production',
  outpost: 'production',
  training: 'production',
  birth: 'family',
  grownUp: 'family',
  contracts: 'offers',
  trade: 'offers',
  crate: 'offers',
};

export interface Settings {
  /** Master switch for phone notifications. */
  notifications: boolean;
  notify: Record<NotifyGroup, boolean>;
  /** Quiet hours in local time, as hours 0–23. start > end wraps midnight (22 → 8). */
  quietHours: { enabled: boolean; start: number; end: number };
  haptics: boolean;
  /** Read by stream T: fewer camera and UI animations. */
  reducedMotion: boolean;
  /** Read by stream T: cap the frame rate at 30 and idle lower. */
  batterySaver: boolean;
  /** The notification permission question has been asked (once, after the first expedition or caravan). */
  notifyAsked: boolean;
}

export function defaultSettings(): Settings {
  return {
    notifications: true,
    notify: { expeditions: true, production: true, family: true, offers: true },
    quietHours: { enabled: true, start: 22, end: 8 },
    haptics: true,
    reducedMotion: false,
    batterySaver: false,
    notifyAsked: false,
  };
}

const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const hour = (v: unknown, d: number): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23 ? v : d);

/** Any stored value (missing, old, hand-edited or junk) to a complete Settings. Unknown fields are dropped. */
export function parseSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const n = (r.notify && typeof r.notify === 'object' ? r.notify : {}) as Record<string, unknown>;
  const q = (r.quietHours && typeof r.quietHours === 'object' ? r.quietHours : {}) as Record<string, unknown>;
  return {
    notifications: bool(r.notifications, d.notifications),
    notify: {
      expeditions: bool(n.expeditions, d.notify.expeditions),
      production: bool(n.production, d.notify.production),
      family: bool(n.family, d.notify.family),
      offers: bool(n.offers, d.notify.offers),
    },
    quietHours: { enabled: bool(q.enabled, d.quietHours.enabled), start: hour(q.start, d.quietHours.start), end: hour(q.end, d.quietHours.end) },
    haptics: bool(r.haptics, d.haptics),
    reducedMotion: bool(r.reducedMotion, d.reducedMotion),
    batterySaver: bool(r.batterySaver, d.batterySaver),
    notifyAsked: bool(r.notifyAsked, d.notifyAsked),
  };
}

let current: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

/** The current settings (read once from storage, then kept in memory). */
export function getSettings(): Settings {
  if (!current) current = parseSettings(readJson<unknown>(SETTINGS_KEY));
  return current;
}

/** Change some settings, store them and tell listeners. */
export function updateSettings(patch: Partial<Settings>): Settings {
  current = { ...getSettings(), ...patch };
  writeJson(SETTINGS_KEY, current);
  for (const fn of listeners) fn(current);
  return current;
}

/** Called with the new settings after every change. Returns an unsubscribe function. */
export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Drop the in-memory copy (tests, or after initStorage restored a different value). */
export function reloadSettings(): Settings {
  current = null;
  return getSettings();
}

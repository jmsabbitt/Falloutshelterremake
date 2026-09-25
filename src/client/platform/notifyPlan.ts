// M8: turning the sim's reminders into phone notifications. Pure: no plugins,
// no DOM, so it is unit-tested directly (tests/platform.test.ts).

import type { Reminder, ReminderKind } from '../../sim';
import { KIND_GROUP, type NotifyGroup, type Settings } from './settings';

export interface PlannedNotification {
  /** Positive 31-bit id, stable for the reminder key (Android needs an int). */
  id: number;
  key: string;
  kind: ReminderKind | 'morning';
  /** Wall-clock ms when it should show. */
  at: number;
  title: string;
  body: string;
}

/** At most this many notifications are scheduled at once (iOS allows 64; we stay well under). */
export const MAX_NOTIFICATIONS = 20;

/** FNV-1a over the key, folded into 1..2^31-1 so it is a valid, non-zero Android/iOS id. */
export function notificationId(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 0x7ffffffe) + 1;
}

/** True if local hour-of-day `h` (fractional) falls inside the quiet window. */
export function inQuietHours(h: number, q: Settings['quietHours']): boolean {
  if (!q.enabled || q.start === q.end) return false;
  return q.start < q.end ? h >= q.start && h < q.end : h >= q.start || h < q.end;
}

/**
 * If `atMs` lands in quiet hours, the first moment after it when they end
 * (local time, DST-safe); otherwise null.
 */
export function quietShift(atMs: number, q: Settings['quietHours']): number | null {
  const d = new Date(atMs);
  const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  if (!inQuietHours(h, q)) return null;
  const wake = new Date(atMs);
  wake.setHours(q.end, 0, 0, 0);
  if (wake.getTime() <= atMs) wake.setDate(wake.getDate() + 1);
  return wake.getTime();
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/**
 * Which notifications to schedule for these reminders: drop the switched-off
 * groups, move anything in quiet hours to when they end, fold several that
 * would all wake the player at the same moment into one "morning report",
 * then keep the soonest `max`.
 */
export function planNotifications(reminders: readonly Reminder[], settings: Settings, nowMs: number, max = MAX_NOTIFICATIONS): PlannedNotification[] {
  if (!settings.notifications) return [];
  const out: PlannedNotification[] = [];
  const morning = new Map<number, Reminder[]>();
  for (const r of reminders) {
    const group = KIND_GROUP[r.kind] as NotifyGroup | undefined;
    if (group && !settings.notify[group]) continue;
    if (!(r.inSeconds >= 60) || !Number.isFinite(r.inSeconds)) continue;
    const at = nowMs + Math.round(r.inSeconds * 1000);
    const wake = quietShift(at, settings.quietHours);
    if (wake === null) out.push({ id: notificationId(r.key), key: r.key, kind: r.kind, at, title: r.title, body: r.body });
    else morning.set(wake, [...(morning.get(wake) ?? []), r]);
  }
  for (const [at, list] of morning) {
    const first = list[0];
    if (!first) continue;
    if (list.length === 1) {
      out.push({ id: notificationId(first.key), key: first.key, kind: first.kind, at, title: first.title, body: first.body });
      continue;
    }
    const key = `morning.${new Date(at).toDateString()}`;
    const names = list.slice(0, 2).map((r) => r.title.replace(/[.!]+$/, ''));
    const more = list.length - names.length;
    const what = more > 0 ? `${names.join(', ')} and ${more} more` : names.join(' and ');
    const body = `${what}. HALCY held them till morning.`;
    out.push({ id: notificationId(key), key, kind: 'morning', at, title: `Morning report: ${list.length} things`, body: clip(body, 110) });
  }
  out.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
  // Ids must be unique; a collision (vanishingly rare) keeps the sooner one.
  const seen = new Set<number>();
  return out.filter((n) => !seen.has(n.id) && (seen.add(n.id), true)).slice(0, Math.max(0, max));
}

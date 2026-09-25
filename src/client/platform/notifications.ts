// M8: local notifications for what happens while the game is closed.
//
// On suspend (app pause, tab hidden, pagehide) we ask the sim what is coming
// (upcomingReminders), cancel what we scheduled last time and schedule the
// new plan. On resume everything is cancelled: the player is looking.
// Natively this is @capacitor/local-notifications. On the web it is the
// Notification API with timers, only while the page is open but hidden.

import { LocalNotifications } from '@capacitor/local-notifications';
import { upcomingReminders } from '../../sim';
import type { Game } from '../game';
import { confirmModal } from '../ui/confirm';
import { MAX_NOTIFICATIONS, planNotifications, type PlannedNotification } from './notifyPlan';
import { getSettings, updateSettings } from './settings';

const CHANNEL = 'homestead';

export type NotifyPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

let native = false;
/** Serialises schedule/cancel so a pause racing a resume can't leave stale pings behind. */
let chain: Promise<unknown> = Promise.resolve();
const webTimers: number[] = [];
const webShown: Notification[] = [];

function enqueue(op: () => Promise<unknown>): Promise<unknown> {
  chain = chain.then(op).catch((err) => console.warn('Notifications:', err));
  return chain;
}

function webSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function notifyPermission(): Promise<NotifyPermission> {
  if (native) {
    try {
      const p = await LocalNotifications.checkPermissions();
      return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
    } catch {
      return 'unsupported';
    }
  }
  if (!webSupported()) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

async function requestPermission(): Promise<NotifyPermission> {
  try {
    if (native) {
      const p = await LocalNotifications.requestPermissions();
      return p.display === 'granted' ? 'granted' : 'denied';
    }
    if (!webSupported()) return 'unsupported';
    const p = await Notification.requestPermission();
    return p === 'default' ? 'prompt' : p;
  } catch {
    return 'denied';
  }
}

/** What the sim expects to happen, as notifications to schedule now. */
export function currentPlan(game: Game, nowMs = Date.now()): PlannedNotification[] {
  // Reminders count from state.lastRealTime, which save() has just stamped to now.
  const base = Math.max(game.state.lastRealTime, 0) || nowMs;
  // Ask for more than we keep: switched-off groups and quiet hours thin the list.
  const reminders = upcomingReminders(game.state, game.content, { utcOffsetMinutes: -new Date(nowMs).getTimezoneOffset(), max: MAX_NOTIFICATIONS * 3 });
  return planNotifications(reminders, getSettings(), base);
}

/** Cancel everything we scheduled (and clear delivered ones: the player is back). */
export function clearNotifications(): Promise<unknown> {
  for (const t of webTimers.splice(0)) clearTimeout(t);
  for (const n of webShown.splice(0)) n.close();
  if (!native) return Promise.resolve();
  return enqueue(async () => {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    await LocalNotifications.removeAllDeliveredNotifications();
  });
}

/** Replace the scheduled notifications with the current plan. Does nothing without permission. */
export function scheduleNotifications(game: Game): Promise<unknown> {
  const plan = currentPlan(game);
  if (!native) {
    scheduleWeb(plan);
    return Promise.resolve();
  }
  return enqueue(async () => {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if (!plan.length || (await notifyPermission()) !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: plan.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        channelId: CHANNEL,
        // An exact alarm would open the system "Alarms & reminders" screen on Android 12+; a few minutes late is fine.
        isExactNotification: false,
        schedule: { at: new Date(n.at), allowWhileIdle: true },
        extra: { key: n.key },
      })),
    });
  });
}

function scheduleWeb(plan: PlannedNotification[]): void {
  for (const t of webTimers.splice(0)) clearTimeout(t);
  if (!webSupported() || Notification.permission !== 'granted' || !document.hidden) return;
  const now = Date.now();
  // Browsers throttle hidden tabs; timers much further out than a day are not worth holding.
  for (const n of plan.filter((p) => p.at - now < 86_400_000)) {
    webTimers.push(
      window.setTimeout(() => {
        if (!document.hidden) return;
        try {
          webShown.push(new Notification(n.title, { body: n.body, tag: n.key, icon: './icons/icon-192.png' }));
        } catch {
          /* some browsers only allow notifications from a service worker */
        }
      }, Math.max(0, n.at - now)),
    );
  }
}

/**
 * The first time notifications would matter (the first explorer or caravan
 * sent), HALCY asks. Asked once; a "no" is remembered and never nags.
 */
export async function maybeAskPermission(): Promise<void> {
  const s = getSettings();
  if (s.notifyAsked) return;
  const now = await notifyPermission();
  if (now === 'unsupported') return;
  if (now !== 'prompt') {
    updateSettings({ notifyAsked: true, notifications: s.notifications && now === 'granted' });
    return;
  }
  updateSettings({ notifyAsked: true });
  const yes = await confirmModal({
    title: 'HALCY, on pings',
    text: "Your people will get back while you're away. Want me to tap your shoulder when they do? I keep quiet at night. Mostly.",
    ok: 'Ping me',
    cancel: 'Not now',
  });
  if (!yes) {
    updateSettings({ notifications: false });
    return;
  }
  const res = await requestPermission();
  if (res !== 'granted') updateSettings({ notifications: false });
}

/** Turn notifications on from the settings panel: asks for permission if it hasn't been given. */
export async function enableNotifications(): Promise<NotifyPermission> {
  let p = await notifyPermission();
  if (p === 'prompt') p = await requestPermission();
  updateSettings({ notifications: p === 'granted', notifyAsked: true });
  return p;
}

export async function initNotifications(game: Game, isNative: boolean): Promise<void> {
  native = isNative;
  if (native) {
    await LocalNotifications.createChannel({ id: CHANNEL, name: 'Homestead', description: 'Explorers home, caravans back, rooms full', importance: 3, visibility: 1 }).catch(() => {});
  }
  game.onLifecycle((phase) => void (phase === 'suspend' ? scheduleNotifications(game) : clearNotifications()));
  game.onCommand((cmd, res) => {
    if (res.ok && (cmd.type === 'explore' || cmd.type === 'sendCaravan')) void maybeAskPermission();
  });
  // Launching is a resume too: whatever was scheduled has either fired or is now stale.
  void clearNotifications();
}

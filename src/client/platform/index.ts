// M8: the thin layer between the game and the device. On the web these are
// safe no-ops or browser fallbacks; inside the Capacitor shell they call the
// native plugins. Everything else imports device features only from here.

import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { Game } from '../game';
import { initNotifications } from './notifications';
import { getSettings } from './settings';

export { getSettings, updateSettings, onSettingsChange, type Settings } from './settings';

export type HapticKind = 'tap' | 'select' | 'success' | 'warning' | 'error' | 'heavy';

/** True inside the Android/iOS app. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** 'android', 'ios' or 'web'. */
export function platformName(): string {
  return Capacitor.getPlatform();
}

const VIBRATE: Record<HapticKind, number | number[]> = {
  tap: 8,
  select: 5,
  success: [10, 40, 18],
  warning: [18, 60, 18],
  error: [30, 50, 30, 50, 30],
  heavy: 24,
};

/** A short vibration for feedback. Respects the player's haptics setting. No-op where unsupported. */
export function haptic(kind: HapticKind = 'tap'): void {
  if (!getSettings().haptics) return;
  if (isNative()) {
    const p =
      kind === 'select'
        ? Haptics.selectionChanged()
        : kind === 'success'
          ? Haptics.notification({ type: NotificationType.Success })
          : kind === 'warning'
            ? Haptics.notification({ type: NotificationType.Warning })
            : kind === 'error'
              ? Haptics.notification({ type: NotificationType.Error })
              : Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : ImpactStyle.Light });
    void p.catch(() => {});
    return;
  }
  try {
    navigator.vibrate?.(VIBRATE[kind]);
  } catch {
    /* not allowed before a user gesture, or unsupported */
  }
}

type BackHandler = () => boolean;
const backHandlers: BackHandler[] = [];

/**
 * Register a handler for the Android back button (and Escape on desktop). The newest
 * handler runs first; return true if it handled the press (closed a modal, a panel...).
 * Returns an unregister function.
 */
export function onBack(handler: BackHandler): () => void {
  backHandlers.push(handler);
  return () => {
    const i = backHandlers.lastIndexOf(handler);
    if (i >= 0) backHandlers.splice(i, 1);
  };
}

/** Run the back handlers, newest first. True if one handled it. */
export function runBack(): boolean {
  for (const h of [...backHandlers].reverse()) if (h()) return true;
  return false;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The safe-area insets in CSS px. Natively on Android, Capacitor's SystemBars
 * injects --safe-area-inset-*; elsewhere env(safe-area-inset-*) is used.
 * The same values are exposed to CSS as --safe-top/right/bottom/left on :root.
 */
export function safeAreaInsets(): Insets {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left)';
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const out = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return out;
}

function exposeInsets(): void {
  const root = document.documentElement.style;
  for (const side of ['top', 'right', 'bottom', 'left']) root.setProperty(`--safe-${side}`, `var(--safe-area-inset-${side}, env(safe-area-inset-${side}, 0px))`);
}

/**
 * Wire the device to the game: back button and Escape, app pause/resume,
 * the status bar, the splash screen and notifications. Call once, after the
 * game and UI exist.
 */
export async function initPlatform(game: Game): Promise<void> {
  const native = isNative();
  const root = document.documentElement;
  root.dataset.platform = platformName();
  exposeInsets();

  window.addEventListener('keydown', (e) => {
    // Modals that handle Escape themselves stop it in the capture phase or mark it handled.
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (runBack()) e.preventDefault();
  });

  await initNotifications(game, native);
  if (!native) return;

  await App.addListener('backButton', () => {
    if (runBack()) return;
    // Nothing left to close: go to the background rather than exit, so a save is never cut off.
    game.suspend();
    void App.minimizeApp();
  });
  await App.addListener('pause', () => game.suspend());
  await App.addListener('resume', () => game.wake());

  await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  await SplashScreen.hide().catch(() => {});
}

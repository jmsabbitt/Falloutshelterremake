// M8: the thin layer between the game and the device. On the web these are
// safe no-ops or browser fallbacks; inside the Capacitor shell they call the
// native plugins. Stream P fills this in; everything else imports only from here.

export type HapticKind = 'tap' | 'select' | 'success' | 'warning' | 'error' | 'heavy';

/** True inside the Android/iOS app. */
export function isNative(): boolean {
  return false;
}

/** A short vibration for feedback. Respects the player's haptics setting. No-op where unsupported. */
export function haptic(_kind: HapticKind = 'tap'): void {}

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

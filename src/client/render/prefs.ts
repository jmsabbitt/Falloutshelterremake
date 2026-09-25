// M8: the two player settings the renderer cares about, read from the JSON
// that the settings panel (ui/settings.ts, stream P) keeps under
// `homestead.settings`. Read-only here: a tiny cached reader, so a change made
// in the settings panel shows up within a second without any wiring.

export interface RenderPrefs {
  /** Cap the frame rate and drop it further when nothing is happening. */
  batterySaver: boolean;
  /** Skip camera glides, inertia and decorative motion. */
  reducedMotion: boolean;
}

export const PREFS_KEY = 'homestead.settings';
const REREAD_MS = 1000;

let cached: RenderPrefs = { batterySaver: false, reducedMotion: false };
let readAt = -Infinity;
let raw: string | null | undefined;

/** Parse the settings JSON; anything missing or malformed reads as off. */
export function parsePrefs(json: string | null): RenderPrefs {
  let o: Record<string, unknown> = {};
  try {
    const v: unknown = json ? JSON.parse(json) : null;
    if (v && typeof v === 'object') o = v as Record<string, unknown>;
  } catch {
    /* treat as defaults */
  }
  return { batterySaver: o.batterySaver === true, reducedMotion: o.reducedMotion === true };
}

/** The current settings, re-read from storage at most once a second. */
export function prefs(now = performance.now()): RenderPrefs {
  if (now - readAt < REREAD_MS) return cached;
  readAt = now;
  let next: string | null = null;
  try {
    next = localStorage.getItem(PREFS_KEY);
  } catch {
    /* storage blocked: keep defaults */
  }
  if (next !== raw) {
    raw = next;
    cached = parsePrefs(next);
    // CSS keys off this class for its own animations.
    document.documentElement.classList.toggle('reduced-motion', cached.reducedMotion);
  }
  return cached;
}

let osReduced: MediaQueryList | null | undefined;

/** Reduced motion from the setting or the OS preference. */
export function reducedMotion(): boolean {
  if (osReduced === undefined) osReduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  return prefs().reducedMotion || !!osReduced?.matches;
}

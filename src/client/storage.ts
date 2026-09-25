// Local save slots and small client blobs. Every access is guarded: storage
// can be missing or blocked (private mode).
//
// M8: inside the phone app the OS may wipe the WebView's localStorage, so every
// `homestead.*` key is mirrored to native Preferences as well. initStorage()
// (awaited in main.ts before the game starts) loads the mirror into memory;
// after that reads stay synchronous and writes go through to both stores.
// Big saves are compressed (LZ, versioned prefix); plain JSON saves still load.

import { compressToUTF16, decompressFromUTF16 } from 'lz-string';

const PREFIX = 'homestead.';
/**
 * M9: slot 0 is the normal game's live autosave, 1–3 are the player's slots,
 * and 'custom' is the Custom Game's own live autosave (homestead.save.custom),
 * so a sandbox can never overwrite the real homestead.
 */
export type SlotId = number | 'custom';
const KEY = (slot: SlotId) => `${PREFIX}save.${slot}`;

// ---------------------------------------------------------------- save encoding

/** Stored saves that start with this are LZ-compressed (lz-string, UTF-16 packing). Bump the digit for a new format. */
export const LZ_PREFIX = 'LZ1:';
/** Stored copies (slots, backups, undo) at least this many characters long are compressed. Small ones stay readable JSON. */
export const COMPRESS_OVER = 24_000;
/**
 * The live autosave (slot 0) is written every 20 s while playing, and LZ costs
 * about 25 ms per 100k characters on a desktop (several times that on a phone),
 * so it stays plain JSON until it is genuinely big. A pop-200 homestead is ~110k.
 */
export const LIVE_COMPRESS_OVER = 250_000;

/** A save's JSON as it goes into storage. */
export function encodeSave(json: string, threshold = COMPRESS_OVER): string {
  return json.length >= threshold ? LZ_PREFIX + compressToUTF16(json) : json;
}

/** A stored save back to JSON: compressed or an old plain one. Null if it can't be unpacked. */
export function decodeSave(stored: string): string | null {
  if (!stored.startsWith(LZ_PREFIX)) return stored;
  const json = decompressFromUTF16(stored.slice(LZ_PREFIX.length));
  return json || null;
}

// ---------------------------------------------------------------- backends

/** The slice of @capacitor/preferences storage needs; injectable for tests. */
export interface PrefsLike {
  get(o: { key: string }): Promise<{ value: string | null }>;
  set(o: { key: string; value: string }): Promise<void>;
  remove(o: { key: string }): Promise<void>;
  keys(): Promise<{ keys: string[] }>;
}

function ls(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Native mode: the in-memory copy of every homestead.* key, and the Preferences write queue. */
let mem: Map<string, string> | null = null;
let prefs: PrefsLike | null = null;
let queue: Promise<void> = Promise.resolve();
/** Preferences writes that failed since boot (surfaced in the settings panel). */
let mirrorErrors = 0;

function mirror(op: (p: PrefsLike) => Promise<void>): void {
  const p = prefs;
  if (!p) return;
  queue = queue.then(() => op(p)).catch((err) => {
    mirrorErrors++;
    console.warn('Preferences write failed:', err);
  });
}

function getItem(key: string): string | null {
  if (mem) return mem.get(key) ?? null;
  try {
    return ls()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** True if the value is safely stored somewhere durable. */
function setItem(key: string, value: string): boolean {
  let local = false;
  try {
    const s = ls();
    if (s) {
      s.setItem(key, value);
      local = true;
    }
  } catch {
    local = false;
  }
  if (!mem) return local;
  mem.set(key, value);
  mirror((p) => p.set({ key, value }));
  // Natively Preferences is the durable copy; a full WebView quota doesn't lose the write.
  return true;
}

function removeItem(key: string): void {
  try {
    ls()?.removeItem(key);
  } catch {
    /* ignore */
  }
  if (mem) {
    mem.delete(key);
    mirror((p) => p.remove({ key }));
  }
}

function keys(): string[] {
  if (mem) return [...mem.keys()];
  const out: string[] = [];
  try {
    const s = ls();
    if (!s) return out;
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k !== null) out.push(k);
    }
  } catch {
    /* ignore */
  }
  return out;
}

export interface StorageInit {
  /** Where the durable copy lives: 'preferences' natively, 'local' on the web. */
  mode: 'preferences' | 'local';
  /** Keys copied from localStorage into Preferences (first launch of a new build, or a lost mirror). */
  toPrefs: number;
  /** Keys restored from Preferences into localStorage (the OS wiped the WebView's storage). */
  toLocal: number;
}

/**
 * Load storage before the game reads its save. On the web this does nothing.
 * Natively (or with injected `opts.prefs`) it reads every homestead.* key from
 * Preferences first, falls back to localStorage for keys Preferences doesn't
 * have, and copies each side's missing keys to the other.
 */
export async function initStorage(opts: { prefs?: PrefsLike } = {}): Promise<StorageInit> {
  let p = opts.prefs ?? null;
  if (!p && isNativeShell()) {
    try {
      p = (await import('@capacitor/preferences')).Preferences;
    } catch (err) {
      console.warn('Preferences unavailable, using localStorage only:', err);
    }
  }
  if (!p) {
    mem = null;
    prefs = null;
    return { mode: 'local', toPrefs: 0, toLocal: 0 };
  }
  const next = new Map<string, string>();
  let toPrefs = 0;
  let toLocal = 0;
  try {
    const { keys: all } = await p.keys();
    const got = await Promise.all(all.filter((k) => k.startsWith(PREFIX)).map(async (k) => [k, (await p.get({ key: k })).value] as const));
    for (const [k, v] of got) if (v !== null) next.set(k, v);
  } catch (err) {
    console.warn('Could not read Preferences, falling back to localStorage:', err);
  }
  const s = ls();
  const localKeys: string[] = [];
  try {
    if (s) for (let i = 0; i < s.length; i++) localKeys.push(s.key(i) ?? '');
  } catch {
    /* ignore */
  }
  const writes: Promise<void>[] = [];
  for (const k of localKeys) {
    if (!k.startsWith(PREFIX) || next.has(k)) continue;
    const v = s?.getItem(k);
    if (v === null || v === undefined) continue;
    next.set(k, v);
    writes.push(p.set({ key: k, value: v }));
    toPrefs++;
  }
  for (const [k, v] of next) {
    try {
      if (s && s.getItem(k) !== v) {
        s.setItem(k, v);
        toLocal++;
      }
    } catch {
      /* the WebView quota is full: Preferences still has it */
    }
  }
  await Promise.all(writes).catch((err) => console.warn('Could not migrate to Preferences:', err));
  mem = next;
  prefs = p;
  decoded.clear();
  return { mode: 'preferences', toPrefs, toLocal };
}

/** Resolves once every queued Preferences write has landed (call before the app is suspended). */
export function flushStorage(): Promise<void> {
  return queue;
}

/** Failed Preferences writes since boot. */
export function storageErrors(): number {
  return mirrorErrors;
}

/** Test hook: back to plain localStorage. */
export function resetStorageForTests(): void {
  mem = null;
  prefs = null;
  queue = Promise.resolve();
  mirrorErrors = 0;
  decoded.clear();
}

function isNativeShell(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform();
}

// ---------------------------------------------------------------- saves

/** The last decode per key, so the menu re-rendering slot cards doesn't unpack them every time. */
const decoded = new Map<string, { raw: string; json: string | null }>();

function readEncoded(key: string): string | null {
  const raw = getItem(key);
  if (raw === null) return null;
  const hit = decoded.get(key);
  if (hit && hit.raw === raw) return hit.json;
  const json = decodeSave(raw);
  decoded.set(key, { raw, json });
  return json;
}

function writeEncoded(key: string, json: string, threshold = COMPRESS_OVER): boolean {
  const raw = encodeSave(json, threshold);
  decoded.set(key, { raw, json });
  return setItem(key, raw);
}

export function readSave(slot: SlotId = 0): string | null {
  return readEncoded(KEY(slot));
}

export function writeSave(json: string, slot: SlotId = 0): boolean {
  return writeEncoded(KEY(slot), json, isLiveSlot(slot) ? LIVE_COMPRESS_OVER : COMPRESS_OVER);
}

export function clearSave(slot: SlotId = 0): void {
  removeItem(KEY(slot));
}

// ---------------------------------------------------------------- M9: normal and custom live saves

/** The two games that autosave: the real homestead and the Custom Game sandbox. */
export type PlayMode = 'normal' | 'custom';
/** Which of the two was playing last, so a reload comes back to it. */
const ACTIVE_KEY = `${PREFIX}activeMode`;
export const CUSTOM_SLOT = 'custom' as const;

/** The live autosave slot for a game mode. A custom state is never written to slot 0. */
export function liveSlot(mode: PlayMode | undefined): SlotId {
  return mode === 'custom' ? CUSTOM_SLOT : 0;
}

/** Slots written every 20 s while playing (kept as plain JSON until they are big). */
export function isLiveSlot(slot: SlotId): boolean {
  return slot === 0 || slot === CUSTOM_SLOT;
}

/**
 * Which game to load at boot: the one that was playing last, as long as its
 * save exists. Anything unexpected falls back to the normal game.
 */
export function bootMode(active: string | null, hasCustom: boolean): PlayMode {
  return active === 'custom' && hasCustom ? 'custom' : 'normal';
}

export function readActiveMode(): PlayMode {
  return bootMode(getItem(ACTIVE_KEY), getItem(KEY(CUSTOM_SLOT)) !== null);
}

export function writeActiveMode(mode: PlayMode): void {
  if (getItem(ACTIVE_KEY) !== mode) setItem(ACTIVE_KEY, mode);
}

/** The Found flow's backups, kept apart for a custom game so the real ones are never pushed out. */
function backupPrefix(mode: PlayMode | undefined): string {
  return mode === 'custom' ? CUSTOM_BACKUP_PREFIX : BACKUP_PREFIX;
}

/** How the live save is stored: its JSON length, stored length (both in characters) and whether it is compressed. */
export function saveStats(slot: SlotId = 0): { json: number; stored: number; compressed: boolean } | null {
  const raw = getItem(KEY(slot));
  if (raw === null) return null;
  const json = readSave(slot);
  return { json: json?.length ?? 0, stored: raw.length, compressed: raw.startsWith(LZ_PREFIX) };
}

export function downloadFile(name: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// M5: a copy of the old save is kept before each founding, since founding
// can't be undone. One key per cycle; only the newest few are kept.
const BACKUP_PREFIX = `${PREFIX}save.backup.`;
const CUSTOM_BACKUP_PREFIX = `${PREFIX}save.custombackup.`;
const BACKUPS_KEPT = 3;

export function writeBackup(cycle: number, json: string, mode: PlayMode = 'normal'): boolean {
  const prefix = backupPrefix(mode);
  const key = `${prefix}${cycle}`;
  if (!writeEncoded(key, json)) return false;
  const cycles = listBackups(mode);
  for (const c of cycles.slice(0, Math.max(0, cycles.length - BACKUPS_KEPT))) removeItem(`${prefix}${c}`);
  // Read it back from storage (not the decode cache) to be sure it landed.
  const raw = getItem(key);
  return raw !== null && decodeSave(raw) === json;
}

export function readBackup(cycle: number): string | null {
  return readEncoded(`${BACKUP_PREFIX}${cycle}`);
}

/** Cycles with a stored backup, oldest first (the normal game's unless asked for the custom game's). */
export function listBackups(mode: PlayMode = 'normal'): number[] {
  const prefix = backupPrefix(mode);
  return keys()
    .filter((k) => k.startsWith(prefix))
    .map((k) => Number(k.slice(prefix.length)))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

export function deleteBackup(cycle: number): void {
  removeItem(`${BACKUP_PREFIX}${cycle}`);
}

// M6: save slots. Slot 0 is the live autosave; slots 1–3 are the player's own.
// Names live in one small key so listing slots never has to parse a save.
export const SAVE_SLOTS = [1, 2, 3] as const;
const NAMES_KEY = `${PREFIX}slotNames`;
// The save that was live before the last load, import or reset: one step of undo.
const UNDO_KEY = `${PREFIX}save.undo`;

export function slotNames(): Record<string, string> {
  try {
    const raw = getItem(NAMES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function setSlotName(slot: number, name: string | null): void {
  const names = slotNames();
  if (name) names[slot] = name;
  else delete names[slot];
  setItem(NAMES_KEY, JSON.stringify(names));
}

export function readUndo(): string | null {
  return readEncoded(UNDO_KEY);
}

export function writeUndo(json: string): boolean {
  return writeEncoded(UNDO_KEY, json);
}

export function clearUndo(): void {
  removeItem(UNDO_KEY);
}

/** Small JSON blobs for client-only features (notification log, loadouts, settings). */
export function readJson<T>(key: string): T | null {
  try {
    const raw = getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    return setItem(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

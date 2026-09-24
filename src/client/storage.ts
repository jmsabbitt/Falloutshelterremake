// Local save slots. localStorage for now; IndexedDB/cloud sync come later.
// Every access is guarded: storage can be missing or blocked (private mode).

const KEY = (slot: number) => `homestead.save.${slot}`;

export function readSave(slot = 0): string | null {
  try {
    return localStorage.getItem(KEY(slot));
  } catch {
    return null;
  }
}

export function writeSave(json: string, slot = 0): boolean {
  try {
    localStorage.setItem(KEY(slot), json);
    return true;
  } catch {
    return false;
  }
}

export function clearSave(slot = 0): void {
  try {
    localStorage.removeItem(KEY(slot));
  } catch {
    /* ignore */
  }
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
const BACKUP_PREFIX = 'homestead.save.backup.';
const BACKUPS_KEPT = 3;

export function writeBackup(cycle: number, json: string): boolean {
  try {
    localStorage.setItem(`${BACKUP_PREFIX}${cycle}`, json);
    const cycles = listBackups();
    for (const c of cycles.slice(0, Math.max(0, cycles.length - BACKUPS_KEPT))) localStorage.removeItem(`${BACKUP_PREFIX}${c}`);
    return localStorage.getItem(`${BACKUP_PREFIX}${cycle}`) === json;
  } catch {
    return false;
  }
}

export function readBackup(cycle: number): string | null {
  try {
    return localStorage.getItem(`${BACKUP_PREFIX}${cycle}`);
  } catch {
    return null;
  }
}

/** Cycles with a stored backup, oldest first. */
export function listBackups(): number[] {
  try {
    const out: number[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(BACKUP_PREFIX)) out.push(Number(k.slice(BACKUP_PREFIX.length)));
    }
    return out.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export function deleteBackup(cycle: number): void {
  try {
    localStorage.removeItem(`${BACKUP_PREFIX}${cycle}`);
  } catch {
    /* ignore */
  }
}

// M6: save slots. Slot 0 is the live autosave; slots 1–3 are the player's own.
// Names live in one small key so listing slots never has to parse a save.
export const SAVE_SLOTS = [1, 2, 3] as const;
const NAMES_KEY = 'homestead.slotNames';
// The save that was live before the last load, import or reset: one step of undo.
const UNDO_KEY = 'homestead.save.undo';

export function slotNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(NAMES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function setSlotName(slot: number, name: string | null): void {
  try {
    const names = slotNames();
    if (name) names[slot] = name;
    else delete names[slot];
    localStorage.setItem(NAMES_KEY, JSON.stringify(names));
  } catch {
    /* ignore */
  }
}

export function readUndo(): string | null {
  try {
    return localStorage.getItem(UNDO_KEY);
  } catch {
    return null;
  }
}

export function writeUndo(json: string): boolean {
  try {
    localStorage.setItem(UNDO_KEY, json);
    return true;
  } catch {
    return false;
  }
}

export function clearUndo(): void {
  try {
    localStorage.removeItem(UNDO_KEY);
  } catch {
    /* ignore */
  }
}

/** Small JSON blobs for client-only features (notification log, loadouts). */
export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

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

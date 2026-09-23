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

// M6 save slots (GDD §6.6): three named slots, the prestige backups
// (homestead.save.backup.*) and one step of undo, each with its save date and
// a homestead summary. Load, save to a slot, rename, export, import and
// delete (with confirmation). Shown in the Menu panel.

import { deserialize, type GameState } from '../../sim';
import type { Game } from '../game';
import {
  clearSave,
  clearUndo,
  deleteBackup,
  downloadFile,
  listBackups,
  readBackup,
  readSave,
  readUndo,
  SAVE_SLOTS,
  setSlotName,
  slotNames,
  writeSave,
} from '../storage';
import { ask, promptModal } from './confirm';
import { fmt, h } from './dom';
import { plural } from './qolText';

export interface SavesHost {
  game: Game;
  toast(text: string, kind?: 'good' | 'bad' | 'gold'): void;
  /** Re-render the menu. */
  refresh(): void;
  /** A different homestead was loaded: close the menu. */
  loaded(): void;
}

interface Summary {
  homestead: number;
  cycle: number;
  residents: number;
  scrip: number;
  day: number;
  savedAt: number;
  kb: number;
}

export class SaveSlots {
  /** Parsed summaries by storage key; reused while the stored text is unchanged. */
  private cache = new Map<string, { json: string; sum: Summary | null }>();

  constructor(private host: SavesHost) {}

  private get game() {
    return this.host.game;
  }

  private summarize(key: string, json: string): Summary | null {
    const hit = this.cache.get(key);
    if (hit && hit.json === json) return hit.sum;
    let sum: Summary | null = null;
    try {
      sum = summaryOf(deserialize(json), json.length);
    } catch {
      sum = null;
    }
    this.cache.set(key, { json, sum });
    return sum;
  }

  section(): HTMLElement {
    const { state } = this.game;
    const names = slotNames();
    const current = summaryOf(state, 0);
    const slots = SAVE_SLOTS.map((slot) => this.slotCard(slot, names[slot]));
    const backups = [...listBackups()].reverse().map((cycle) => this.backupCard(cycle));
    const undo = readUndo();
    return h(
      'div',
      { class: 'sv' },
      h('h3', { class: 'group', style: 'margin-top:0' }, 'This homestead'),
      h(
        'div',
        { class: 'list-item sv-card current' },
        h('div', { class: 'row', style: 'margin:0' }, h('b', {}, `Homestead ${current.homestead}`), h('span', { class: 'muted small' }, 'autosaves')),
        h('div', { class: 'muted small' }, describe(current)),
        h(
          'div',
          { class: 'sv-actions' },
          h('button', { onclick: () => (this.game.save(), this.host.toast('Saved', 'good')) }, 'Save now'),
          h('button', { onclick: () => downloadFile(`homestead-${state.homesteadNumber}.json`, this.game.exportSave()) }, '⤓ Export'),
          this.importButton('⤒ Import & play', (json) => this.load(json, 'the imported save', false)),
        ),
      ),
      h('h3', { class: 'group' }, 'Save slots'),
      ...slots,
      backups.length || undo ? h('h3', { class: 'group' }, 'Backups') : null,
      undo ? this.undoCard(undo) : null,
      ...backups,
      backups.length ? h('p', { class: 'muted small' }, 'A backup is kept each time you found a new homestead (the newest three).') : null,
    );
  }

  private slotCard(slot: number, name: string | undefined): HTMLElement {
    const json = readSave(slot);
    const sum = json ? this.summarize(`slot${slot}`, json) : null;
    const title = name || (sum ? `Homestead ${sum.homestead}` : `Slot ${slot}`);
    if (!json) {
      return h(
        'div',
        { class: 'list-item sv-card empty', 'data-slot': slot },
        h('div', { class: 'row', style: 'margin:0' }, h('b', {}, `Slot ${slot}`), h('span', { class: 'muted small' }, 'empty')),
        h(
          'div',
          { class: 'sv-actions' },
          h('button', { class: 'primary', onclick: () => this.saveTo(slot, null) }, 'Save here'),
          this.importButton('⤒ Import', (text) => this.importTo(slot, text)),
        ),
      );
    }
    return h(
      'div',
      { class: 'list-item sv-card', 'data-slot': slot },
      h('div', { class: 'row', style: 'margin:0' }, h('b', { class: 'sv-name' }, title), h('span', { class: 'muted small' }, `Slot ${slot}`)),
      h('div', { class: 'muted small' }, sum ? describe(sum) : '⚠ This save could not be read.'),
      h(
        'div',
        { class: 'sv-actions' },
        h('button', { class: 'primary', disabled: !sum, onclick: () => this.load(json, `"${title}"`, true) }, 'Load'),
        h('button', { onclick: () => this.saveTo(slot, title) }, 'Save here'),
        h('button', { onclick: () => this.rename(slot, title) }, 'Rename'),
        h('button', { onclick: () => downloadFile(`${fileName(title)}.json`, json), 'aria-label': `Export ${title}` }, '⤓ Export'),
        this.importButton('⤒ Import', (text) => this.importTo(slot, text), `Replace "${title}" with a save file?`),
        h(
          'button',
          {
            class: 'danger',
            'aria-label': `Delete ${title}`,
            onclick: () =>
              ask({ title: `Delete "${title}"?`, text: `Slot ${slot} is emptied. This can't be undone.`, ok: 'Delete', danger: true }, () => {
                clearSave(slot);
                setSlotName(slot, null);
                this.host.toast(`Slot ${slot} cleared`);
                this.host.refresh();
              }),
          },
          'Delete',
        ),
      ),
    );
  }

  private backupCard(cycle: number): HTMLElement {
    const json = readBackup(cycle);
    const sum = json ? this.summarize(`backup${cycle}`, json) : null;
    const title = sum ? `Homestead ${sum.homestead}, before founding` : `Backup ${cycle}`;
    return h(
      'div',
      { class: 'list-item sv-card backup', 'data-backup': cycle },
      h('div', { class: 'row', style: 'margin:0' }, h('b', {}, title), h('span', { class: 'muted small' }, `cycle ${cycle}`)),
      h('div', { class: 'muted small' }, sum ? describe(sum) : '⚠ This backup could not be read.'),
      h(
        'div',
        { class: 'sv-actions' },
        h('button', { disabled: !json || !sum, onclick: () => json && this.load(json, `the backup of ${title.toLowerCase()}`, true) }, 'Load'),
        h('button', { disabled: !json, onclick: () => json && downloadFile(`homestead-backup-${cycle}.json`, json) }, '⤓ Export'),
        h(
          'button',
          {
            class: 'danger',
            onclick: () =>
              ask({ title: 'Delete this backup?', text: `The backup from cycle ${cycle} is gone for good. This can't be undone.`, ok: 'Delete', danger: true }, () => {
                deleteBackup(cycle);
                this.host.refresh();
              }),
          },
          'Delete',
        ),
      ),
    );
  }

  private undoCard(json: string): HTMLElement {
    const sum = this.summarize('undo', json);
    return h(
      'div',
      { class: 'list-item sv-card backup', 'data-undo': '1' },
      h('div', { class: 'row', style: 'margin:0' }, h('b', {}, 'Before the last load'), h('span', { class: 'muted small' }, 'undo')),
      h('div', { class: 'muted small' }, sum ? describe(sum) : '⚠ This save could not be read.'),
      h(
        'div',
        { class: 'sv-actions' },
        h('button', { disabled: !sum, onclick: () => this.load(json, 'the homestead from before the last load', true) }, 'Load'),
        h('button', { onclick: () => downloadFile('homestead-before-load.json', json) }, '⤓ Export'),
        h(
          'button',
          {
            class: 'danger',
            onclick: () =>
              ask({ title: 'Delete the undo copy?', text: 'You will no longer be able to go back to the homestead from before the last load.', ok: 'Delete', danger: true }, () => {
                clearUndo();
                this.host.refresh();
              }),
          },
          'Delete',
        ),
      ),
    );
  }

  /** A button that picks a .json file and hands over its text. */
  private importButton(label: string, use: (json: string) => void, question?: string): HTMLElement {
    const input = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' }) as HTMLInputElement;
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      input.value = '';
      if (!f) return;
      use(await f.text());
    });
    return h(
      'span',
      { class: 'sv-import' },
      h(
        'button',
        {
          onclick: () => {
            if (question) ask({ title: 'Import a save file?', text: question, ok: 'Choose file' }, () => input.click());
            else input.click();
          },
        },
        label,
      ),
      input,
    );
  }

  private saveTo(slot: number, existing: string | null): void {
    const { state } = this.game;
    if (existing) {
      ask({ title: `Overwrite "${existing}"?`, text: `Slot ${slot} gets Homestead ${state.homesteadNumber} as it is now. The old save in it is lost.`, ok: 'Overwrite', danger: true }, () => this.writeSlot(slot));
      return;
    }
    this.writeSlot(slot);
  }

  private writeSlot(slot: number): void {
    const { state } = this.game;
    if (!this.game.saveToSlot(slot)) {
      this.host.toast("Couldn't save: this browser's storage is full. Delete a slot or backup first.", 'bad');
      return;
    }
    if (!slotNames()[slot]) setSlotName(slot, `Homestead ${state.homesteadNumber}`);
    this.host.toast(`Saved to slot ${slot}`, 'good');
    this.host.refresh();
  }

  private rename(slot: number, current: string): void {
    void promptModal({ title: 'Rename save slot', label: `A name for slot ${slot}.`, value: current, maxLength: 40, ok: 'Rename' }).then((next) => {
      if (next === null) return;
      const name = next.trim().slice(0, 40);
      setSlotName(slot, name || null);
      this.host.refresh();
    });
  }

  private importTo(slot: number, json: string): void {
    let sum: Summary;
    try {
      sum = summaryOf(deserialize(json), json.length);
    } catch (err) {
      this.host.toast(`Import failed: ${(err as Error).message}`, 'bad');
      return;
    }
    if (!writeSave(json, slot)) {
      this.host.toast("Couldn't store it: this browser's storage is full.", 'bad');
      return;
    }
    setSlotName(slot, `Homestead ${sum.homestead} (imported)`);
    this.host.toast(`Imported into slot ${slot}`, 'good');
    this.host.refresh();
  }

  private load(json: string, what: string, askFirst: boolean): void {
    if (askFirst) {
      ask({ title: `Load ${what}?`, text: 'Your current homestead is replaced. A copy of it is kept under Backups as "Before the last load".', ok: 'Load' }, () => this.load(json, what, false));
      return;
    }
    try {
      this.game.importSave(json);
    } catch (err) {
      this.host.toast(`Load failed: ${(err as Error).message}`, 'bad');
      return;
    }
    this.host.toast(`Loaded Homestead ${this.game.state.homesteadNumber}`, 'good');
    this.host.loaded();
  }
}

function summaryOf(s: GameState, bytes: number): Summary {
  return {
    homestead: s.homesteadNumber,
    cycle: s.legacy?.cycle ?? 1,
    residents: s.residents.filter((r) => !r.dead && !r.waiting).length,
    scrip: s.scrip,
    day: Math.floor(s.time / 86_400) + 1,
    savedAt: s.lastRealTime,
    kb: Math.ceil(bytes / 1024),
  };
}

function describe(s: Summary): string {
  const when = s.savedAt ? new Date(s.savedAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'unknown date';
  return `${when} · ${plural(s.residents, 'resident')} · ${fmt(s.scrip)} scrip · day ${s.day}${s.cycle > 1 ? ` · cycle ${s.cycle}` : ''}${s.kb ? ` · ${s.kb} KB` : ''}`;
}

function fileName(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'homestead-save'
  );
}

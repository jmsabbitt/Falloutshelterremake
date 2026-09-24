// M6 loadout presets (GDD §6.6): named parties for exploring and quests,
// saved client-side (localStorage) as resident ids plus supply counts, per
// homestead. Offered in the explore modal and the party picker.

import { canExplore, MAX_SUPPLIES } from '../../sim';
import type { Game } from '../game';
import { readJson, writeJson } from '../storage';
import { ask, promptModal } from './confirm';
import { h } from './dom';
import { nameList } from './qolText';

export type LoadoutKind = 'explore' | 'party';

export interface Loadout {
  id: number;
  name: string;
  kind: LoadoutKind;
  ids: number[];
  medpatch: number;
  purge: number;
  regionId?: string;
}

export type LoadoutDraft = Pick<Loadout, 'ids' | 'medpatch' | 'purge' | 'regionId'>;

export interface LoadoutBarOptions {
  kind: LoadoutKind;
  /** What the modal has picked right now. */
  current(): LoadoutDraft;
  /** Put a preset into the modal (the caller checks who can go and clamps supplies). */
  apply(l: Loadout): void;
  /** Draw the modal again after a change. */
  rerender(): void;
}

const KEY = 'homestead.loadouts';
const PER_KIND = 8;

type Store = Record<string, Loadout[]>;

export class Loadouts {
  constructor(private game: Game) {}

  private home(): string {
    const s = this.game.state;
    return `${s.legacy.cycle}:${s.homesteadNumber}`;
  }

  private all(): Store {
    const s = readJson<Store>(KEY);
    return s && typeof s === 'object' ? s : {};
  }

  list(kind: LoadoutKind): Loadout[] {
    return (this.all()[this.home()] ?? []).filter((l) => l.kind === kind);
  }

  private write(list: Loadout[]): void {
    // Only this homestead's presets are kept: ids mean nothing in another one.
    writeJson(KEY, { [this.home()]: list });
  }

  save(kind: LoadoutKind, name: string, d: LoadoutDraft): Loadout {
    const list = this.all()[this.home()] ?? [];
    const same = list.find((l) => l.kind === kind && l.name.toLowerCase() === name.toLowerCase());
    const id = same?.id ?? Math.max(0, ...list.map((l) => l.id)) + 1;
    const next: Loadout = { id, name, kind, ids: [...d.ids], medpatch: d.medpatch, purge: d.purge, regionId: d.regionId };
    const rest = list.filter((l) => l.id !== id);
    const mine = rest.filter((l) => l.kind === kind);
    // Oldest of this kind drop off past the limit.
    const drop = new Set(mine.slice(0, Math.max(0, mine.length - (PER_KIND - 1))).map((l) => l.id));
    this.write([...rest.filter((l) => !drop.has(l.id)), next]);
    return next;
  }

  remove(id: number): void {
    this.write((this.all()[this.home()] ?? []).filter((l) => l.id !== id));
  }

  /**
   * Put an explore preset into the explore modal's draft: the explorer (when
   * the modal lets you pick one and they can go), the region if it is open,
   * and supplies up to what is in stock. Returns a note for anything left out.
   */
  applyExplore(l: Loadout, d: { residentId: number | null; regionId: string; medpatch: number; purge: number }, pickResident: boolean): string | null {
    const { state, content } = this.game;
    const notes: string[] = [];
    const id = l.ids[0];
    const r = state.residents.find((x) => x.id === id);
    if (pickResident && id !== undefined) {
      const why = r ? canExplore(state, content, r) : 'gone';
      if (r && why === null) d.residentId = r.id;
      else notes.push(`${r?.firstName ?? 'That explorer'} can't go: ${why}`);
    }
    if (l.regionId && state.regionsUnlocked.includes(l.regionId)) d.regionId = l.regionId;
    const stock = (k: 'medpatch' | 'purge') => Math.max(0, Math.min(MAX_SUPPLIES, Math.floor(state.resources[k])));
    d.medpatch = Math.min(l.medpatch, stock('medpatch'));
    d.purge = Math.min(l.purge, stock('purge'));
    if (d.medpatch < l.medpatch || d.purge < l.purge) notes.push('not enough supplies in stock');
    return notes.length ? notes.join('; ') : null;
  }

  private names(ids: number[]): string[] {
    const { residents } = this.game.state;
    return ids.map((id) => residents.find((r) => r.id === id)?.firstName ?? '?');
  }

  /** The presets row: tap one to use it, ✕ to forget it, or save what is picked now. */
  bar(o: LoadoutBarOptions): HTMLElement {
    const list = this.list(o.kind);
    const cur = o.current();
    const same = (l: Loadout) => l.ids.length === cur.ids.length && l.ids.every((id, i) => cur.ids[i] === id) && l.medpatch === cur.medpatch && l.purge === cur.purge && (o.kind === 'party' || l.regionId === cur.regionId);
    const chips = list.map((l) => {
      const gone = l.ids.filter((id) => !this.game.state.residents.some((r) => r.id === id && !r.dead));
      const sub = `${nameList(this.names(l.ids), 3)} · ✚${l.medpatch}${o.kind === 'explore' ? ` ☢${l.purge}` : ''}`;
      return h(
        'span',
        { class: `lo-chip${same(l) ? ' on' : ''}` },
        h(
          'button',
          { class: 'lo-use', title: `Use ${l.name}: ${sub}`, onclick: () => o.apply(l) },
          h('b', {}, l.name),
          h('span', { class: `muted small${gone.length ? ' short' : ''}` }, gone.length === l.ids.length ? 'nobody left' : sub),
        ),
        h(
          'button',
          {
            class: 'lo-del',
            'aria-label': `Forget ${l.name}`,
            title: 'Forget this loadout',
            onclick: () =>
              ask({ title: `Forget "${l.name}"?`, text: 'The saved pick is removed. Nobody is sent anywhere.', ok: 'Forget', danger: true }, () => {
                this.remove(l.id);
                o.rerender();
              }),
          },
          '✕',
        ),
      );
    });
    return h(
      'div',
      { class: 'lo-bar' },
      h('div', { class: 'row', style: 'margin:4px 0' }, h('span', { class: 'muted small' }, list.length ? 'Loadouts' : 'Loadouts: save this pick to reuse it'), this.saveButton(o, cur)),
      list.length ? h('div', { class: 'lo-chips' }, ...chips) : null,
    );
  }

  private saveButton(o: LoadoutBarOptions, cur: LoadoutDraft): HTMLElement {
    return h(
      'button',
      {
        class: 'close lo-save',
        disabled: !cur.ids.length,
        onclick: () => {
          const names = this.names(cur.ids);
          const suggestion = o.kind === 'explore' ? `${names[0] ?? 'Explorer'}'s run` : nameList(names, 3);
          void promptModal({ title: 'Save loadout', label: 'Name this pick to reuse it later.', value: suggestion, maxLength: 30 }).then((raw) => {
            const name = raw?.trim().slice(0, 30);
            if (!name) return;
            this.save(o.kind, name, cur);
            o.rerender();
          });
        },
      },
      '＋ Save loadout',
    );
  }
}

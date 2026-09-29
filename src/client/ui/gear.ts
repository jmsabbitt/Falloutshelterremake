// Gear pickers: choose a weapon or outfit for a resident (from their card), or a resident for an
// item (from Storage). Both are modals over the panel, show what each choice changes against what
// is worn now, and leave the player where they started once the item is on.

import { avgDamage, effectiveStat, gearScore, isAway, isChild, STAT_KEYS, type ItemDef, type Resident, type StatKey } from '../../sim';
import type { Game } from '../game';
import { h } from './dom';
import { itemIcon } from './icons';
import { roomName, STAT_FULL, STAT_SHORT } from './qolText';
import type { ToastFn } from './toasts';

export type GearSlot = 'weapon' | 'outfit';

export interface GearHost {
  game: Game;
  modalHost: HTMLElement;
  toast: ToastFn;
  /** Re-render the open panel (the card or storage behind the modal). */
  refresh(): void;
}

const RARITY_RANK: Record<string, number> = { legendary: 0, rare: 1, common: 2 };
const RARITY_MARK: Record<string, string> = { legendary: '★', rare: '◆', common: '' };

function signed(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r)}`;
}

/** "8–11 dmg" or "+5 Brawn, +2 Grit". */
export function itemStats(def: ItemDef): string {
  if (def.kind === 'weapon') return `${def.min}–${def.max} dmg`;
  return Object.entries(def.bonus)
    .map(([k, v]) => `+${v} ${STAT_FULL[k as StatKey]}`)
    .join(', ');
}

/** What swapping `current` for `next` changes: a score for sorting and chips for the row. */
export function gearDelta(current: ItemDef | undefined, next: ItemDef): { gain: number; chips: HTMLElement[] } {
  const chip = (d: number, text: string) => h('span', { class: `delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'same'}` }, text);
  if (next.kind === 'weapon') {
    const d = avgDamage(next) - avgDamage(current);
    return { gain: d, chips: [chip(d, Math.abs(d) < 0.05 ? 'same dmg' : `${signed(d)} dmg`)] };
  }
  const cur = current && current.kind === 'outfit' ? current.bonus : {};
  const chips: HTMLElement[] = [];
  let gain = 0;
  for (const k of STAT_KEYS) {
    const d = (next.bonus[k] ?? 0) - (cur[k] ?? 0);
    if (!d) continue;
    gain += d;
    chips.push(chip(d, `${signed(d)} ${STAT_SHORT[k]}`));
  }
  if (!chips.length) chips.push(chip(0, 'no change'));
  return { gain, chips };
}

/**
 * How much a piece of gear helps this resident in what they are doing now, like the
 * green room highlight when dragging someone: an outfit counts for the stat their
 * room works with (not in a training room, which raises their own stat), a weapon
 * for how likely they are to fight (on the door, in a room under attack, or not at
 * all while expecting). `reason` says why, for the picker row.
 */
export function gearFit(game: Game, r: Resident, next: ItemDef, current: ItemDef | undefined): { score: number; reason: string; focus?: StatKey } {
  const { state, content } = game;
  const g = gearScore(state, content, r, next, current);
  const name = g.room ? roomName(content, g.room) : '';
  const cover = g.armed === undefined ? '' : g.armed ? ` (${g.armed} other${g.armed === 1 ? '' : 's'} armed there)` : ' (nobody else armed there)';
  const job = g.job ?? 0;
  const stat = g.focus;
  const reason =
    g.why === 'fleeing'
      ? 'Expecting: takes cover instead of fighting'
      : g.why === 'fighting'
        ? `Fighting right now in the ${name}${cover}`
        : g.why === 'door'
          ? `On the door: first to meet raiders${cover}`
          : g.why === 'defends'
            ? `Defends the ${name}${cover}`
            : g.why === 'training'
              ? `Training in the ${name}: gear doesn't speed it up`
              : g.why === 'job' && stat
                ? job > 0
                  ? `${STAT_FULL[stat]} for the ${name}: ${signed(job)}`
                  : job < 0
                    ? `Loses ${STAT_FULL[stat]} for the ${name}`
                    : `The ${name} runs on ${STAT_FULL[stat]}: no gain`
                : g.why === 'nostat'
                  ? `In the ${name}: no stat to boost`
                  : next.kind === 'weapon'
                    ? 'Idle: fights wherever you put them'
                    : 'Idle: helps wherever they work next';
  return { score: g.score, reason, focus: stat };
}

/** Storage grouped by item type: one entry per kind of item, with the ids of every copy. */
export function groupItems(game: Game, kind: GearSlot | 'all'): { def: ItemDef; ids: number[] }[] {
  const { state, content } = game;
  const groups = new Map<string, { def: ItemDef; ids: number[] }>();
  for (const it of state.items) {
    const def = content.items[it.defId];
    if (!def || (kind !== 'all' && def.kind !== kind)) continue;
    const g = groups.get(def.id);
    if (g) g.ids.push(it.id);
    else groups.set(def.id, { def, ids: [it.id] });
  }
  return [...groups.values()].sort((a, b) => (RARITY_RANK[a.def.rarity] ?? 3) - (RARITY_RANK[b.def.rarity] ?? 3) || a.def.name.localeCompare(b.def.name));
}

/** An item's name coloured by rarity, with its mark. */
export function itemLabel(def: ItemDef, count = 1): HTMLElement {
  return h(
    'span',
    { class: `item-title r-${def.rarity}` },
    RARITY_MARK[def.rarity] ? h('span', { class: 'mark', 'aria-hidden': 'true' }, `${RARITY_MARK[def.rarity]} `) : null,
    h('span', { class: 'nm' }, def.name),
    count > 1 ? h('span', { class: 'count' }, ` ×${count}`) : null,
  );
}

/** Green-highlighted rows: a real gain, close to the best on offer, and at most the first three. */
function bestFit(score: number, top: number, index = 0): boolean {
  return index < 3 && top > 0 && score > 0 && score >= top * 0.8;
}

export class GearUI {
  constructor(private host: GearHost) {}

  private close = (): void => {
    this.host.modalHost.replaceChildren();
  };

  private worn(r: Resident, slot: GearSlot): ItemDef | undefined {
    const id = slot === 'weapon' ? r.weapon : r.outfit;
    return id ? this.host.game.content.items[id] : undefined;
  }

  private wornText(r: Resident, slot: GearSlot): string {
    const def = this.worn(r, slot);
    return def ? `${def.name} · ${itemStats(def)}` : slot === 'weapon' ? 'Fists · 1 dmg' : 'Halcyon jumpsuit · no bonus';
  }

  private equip(r: Resident, def: ItemDef, itemId: number): boolean {
    const res = this.host.game.run({ type: 'equip', residentId: r.id, itemId });
    if (!res.ok) this.host.toast(res.reason, 'bad');
    else this.host.toast(`${r.firstName} equipped ${def.name}.`, 'good');
    return res.ok;
  }

  private modal(cls: string, ...content: (HTMLElement | string | null)[]): void {
    this.host.modalHost.replaceChildren(
      h(
        'div',
        { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && this.close() },
        h('div', { class: `modal gear-modal ${cls}`, role: 'dialog', 'aria-modal': 'true' }, ...content),
      ),
    );
  }

  /** From a resident's card: pick a weapon or outfit from storage for them. */
  pickItem(residentId: number, slot: GearSlot): void {
    const { state } = this.host.game;
    const r = state.residents.find((x) => x.id === residentId);
    if (!r) return;
    const current = this.worn(r, slot);
    const options = groupItems(this.host.game, slot)
      .map((g) => ({ ...g, delta: gearDelta(current, g.def), fit: gearFit(this.host.game, r, g.def, current) }))
      .sort((a, b) => b.fit.score - a.fit.score || b.delta.gain - a.delta.gain || (RARITY_RANK[a.def.rarity] ?? 3) - (RARITY_RANK[b.def.rarity] ?? 3) || a.def.name.localeCompare(b.def.name));
    const top = options[0]?.fit.score ?? 0;
    const rows = options.map((o, i) =>
      h(
        'button',
        {
          class: `gear-option${bestFit(o.fit.score, top, i) ? ' best' : o.fit.score <= 0 ? ' worse' : ''}`,
          onclick: () => {
            const id = o.ids[0];
            if (id === undefined) return;
            if (this.equip(r, o.def, id)) this.close();
            this.host.refresh();
          },
        },
        itemIcon(o.def.id, o.def.kind),
        h('span', { class: 'gear-main' }, itemLabel(o.def, o.ids.length), h('span', { class: 'gear-sub' }, itemStats(o.def)), h('span', { class: 'gear-why' }, bestFit(o.fit.score, top, i) ? `Best fit · ${o.fit.reason}` : o.fit.reason)),
        h('span', { class: 'gear-deltas' }, ...o.delta.chips),
      ),
    );
    const what = slot === 'weapon' ? 'weapon' : 'outfit';
    this.modal(
      'gear-pick-item',
      h('h2', {}, `${slot === 'weapon' ? 'Weapon' : 'Outfit'} for ${r.firstName}`),
      h('div', { class: 'gear-current' }, h('span', { class: 'muted small' }, 'Now: '), h('b', {}, this.wornText(r, slot))),
      rows.length
        ? h('div', { class: 'gear-list' }, ...rows)
        : h('p', { class: 'muted' }, `No spare ${what}s in storage. Open Supply Crates, explore the Glarelands or craft one in a workshop.`),
      rows.length ? h('p', { class: 'muted small', style: 'margin:8px 0 0' }, `Best for what ${r.firstName} is doing now comes first (green). Whatever they have on now goes back to storage.`) : null,
      h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:10px' }, h('button', { onclick: this.close }, 'Cancel')),
    );
  }

  /** From storage: pick who gets one of these items. Who'd gain most comes first. */
  pickResident(defId: string): void {
    const { state, content } = this.host.game;
    const def = content.items[defId];
    if (!def) return;
    const slot: GearSlot = def.kind;
    const rooms = new Map(state.rooms.map((room) => [room.id, room]));
    // Ranked by what it does for each person in what they are doing now (gearFit),
    // then by the stat it helps most (outfits) or level (weapons).
    const mainStat = def.kind === 'outfit' ? (Object.entries(def.bonus).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] as StatKey | undefined) : undefined;
    const people = state.residents
      .filter((r) => !r.dead && !r.waiting && !isAway(r) && !isChild(state, r))
      .map((r) => {
        const worn = this.worn(r, slot);
        const fit = gearFit(this.host.game, r, def, worn);
        const statKey = fit.focus ?? mainStat;
        return { r, fit, delta: gearDelta(worn, def), statKey, stat: statKey ? effectiveStat(content, r, statKey) : r.level };
      })
      .sort((a, b) => b.fit.score - a.fit.score || b.delta.gain - a.delta.gain || b.stat - a.stat || a.r.id - b.r.id);
    const top = people[0]?.fit.score ?? 0;
    const rows = people.map(({ r, delta, fit, statKey, stat }, i) => {
      const room = r.roomId !== null ? rooms.get(r.roomId) : undefined;
      const where = room ? roomName(content, room) : 'Idle';
      const best = bestFit(fit.score, top, i);
      return h(
        'button',
        {
          class: `gear-option${best ? ' best' : fit.score > 0 ? '' : ' worse'}`,
          onclick: () => {
            const ids = state.items.filter((i) => i.defId === defId).map((i) => i.id);
            const id = ids[0];
            if (id === undefined) {
              this.host.toast(`No ${def.name} left in storage.`, 'bad');
              this.close();
              return;
            }
            if (this.equip(r, def, id)) this.close();
            this.host.refresh();
          },
        },
        h(
          'span',
          { class: 'gear-main' },
          h('b', { class: 'gear-name' }, `${r.firstName} ${r.lastName}`),
          h('span', { class: 'gear-sub' }, `L${r.level} · ${where}${statKey ? ` · ${STAT_SHORT[statKey]} ${stat}` : ''} · has ${this.worn(r, slot)?.name ?? (slot === 'weapon' ? 'fists' : 'jumpsuit')}`),
          h('span', { class: 'gear-why' }, best ? `Best fit · ${fit.reason}` : fit.reason),
        ),
        h('span', { class: 'gear-deltas' }, ...delta.chips),
      );
    });
    this.modal(
      'gear-pick-resident',
      h('h2', {}, 'Who gets it?'),
      h('div', { class: 'gear-current' }, itemIcon(def.id, def.kind), itemLabel(def), h('span', { class: 'muted small' }, ` · ${itemStats(def)}`)),
      h(
        'p',
        { class: 'muted small', style: 'margin:4px 0 8px' },
        def.kind === 'outfit'
          ? 'Best fit first (green): who it helps most in the job they are doing now, by the stat their room works with. What they wear now goes back to storage.'
          : 'Best fit first (green): who gains most damage and is likeliest to fight (on the door, or in a room under attack). What they carry now goes back to storage.',
      ),
      rows.length ? h('div', { class: 'gear-list' }, ...rows) : h('p', { class: 'muted' }, 'Nobody here can take gear right now.'),
      h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:10px' }, h('button', { onclick: this.close }, 'Cancel')),
    );
  }
}

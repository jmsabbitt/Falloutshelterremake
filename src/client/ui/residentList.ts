// M6 resident list (GDD §6.6): sort, filter and search, bulk select with
// assign / unassign / heal, and "Auto-assign idle". Rows are windowed: only
// the ones in view (plus a margin) are built, so the panel stays quick at 200+
// residents even though it re-renders twice a second.

import {
  effectiveMaxHp,
  effectiveStat,
  idleAdults,
  isAway,
  isChild,
  residentsInRoom,
  roomCapacity,
  roomDef,
  STAT_KEYS,
  type Resident,
  type Room,
  type StatKey,
} from '../../sim';
import type { Game } from '../game';
import { h } from './dom';
import { plural, roomName, STAT_FULL, STAT_SHORT } from './qolText';
import type { ToastFn } from './toasts';

export type SortKey = 'level' | 'name' | 'mood' | 'hp' | 'room' | StatKey;
export type FilterKey = 'all' | 'idle' | 'working' | 'away' | 'injured' | 'children' | 'rare' | 'fallen';

export interface ResidentListHost {
  game: Game;
  modalHost: HTMLElement;
  toast: ToastFn;
  /** Re-render the open panel now. */
  refresh(): void;
  /** The resident picked for tap-a-room assignment (single select). */
  selectedId(): number | null;
  select(id: number | null): void;
  /** The expanded card (gear, heal, explore) for the picked resident. */
  detailCard(r: Resident): HTMLElement;
  /** M6: a resident's most relevant trait, as a small tag for the row. */
  traitTag?(r: Resident): HTMLElement | null;
  /** M6: how a group's traits suit a room (for the room picker). */
  groupFit?(rs: Resident[], room: Room): HTMLElement | null;
}

/** Row pitch in px: the row's height plus its gap. Keep in step with .rl-row in style.css. */
const PITCH = 60;
/** Extra rows built above and below the visible window. */
const OVERSCAN = 6;
/** Space kept under the open card before the next row. */
const CARD_GAP = 4;

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'level', label: 'Level' },
  { key: 'name', label: 'Name' },
  { key: 'mood', label: 'Mood' },
  { key: 'hp', label: 'Health' },
  { key: 'room', label: 'Room' },
  ...STAT_KEYS.map((k) => ({ key: k as SortKey, label: STAT_FULL[k] })),
];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'idle', label: 'Idle' },
  { key: 'working', label: 'Working' },
  { key: 'away', label: 'Away' },
  { key: 'injured', label: 'Injured' },
  { key: 'children', label: 'Children' },
  { key: 'rare', label: 'Rare+' },
  { key: 'fallen', label: 'Fallen' },
];

/** Everything a row and the sort need, computed once per render. */
interface RowInfo {
  r: Resident;
  where: string;
  /** Sort key for "room": room name, then floor; idle and away sort last. */
  roomKey: string;
  child: boolean;
  away: boolean;
  maxHp: number;
}

export class ResidentList {
  sort: SortKey = 'level';
  /** Descending for numbers, A→Z for names; flipped by the ↕ button. */
  reverse = false;
  filter: FilterKey = 'all';
  query = '';
  /** Bulk selection mode and the picked ids. */
  bulk = false;
  picked = new Set<number>();
  private scrollQueued = false;
  private measureQueued = false;
  /** A reveal (scroll to the card) is waiting on the card's measured height. */
  private revealQueued = false;
  /** Height of the open card plus its gap, measured after each render. */
  private cardH = 340;
  /** M9: a section shown above the controls (the Legends strip, from ui/legends.ts). */
  extra: (() => HTMLElement | null) | null = null;

  constructor(private host: ResidentListHost) {}

  private get game() {
    return this.host.game;
  }

  /** The panel was opened afresh: start from the whole list, not a filter or search left from last time. */
  opened(): void {
    this.filter = 'all';
    this.query = '';
  }

  /** The homestead was replaced: nothing picked points anywhere now. */
  reset(): void {
    this.picked.clear();
    this.bulk = false;
  }

  /** In bulk mode a resident tapped in the homestead joins (or leaves) the selection. */
  togglePick(id: number): void {
    if (this.picked.has(id)) this.picked.delete(id);
    else this.picked.add(id);
    this.host.refresh();
  }

  /** Bulk mode with someone picked: a tapped room takes them all. */
  bulkCount(): number {
    return this.bulk ? this.picked.size : 0;
  }

  // ---------------------------------------------------------------- data

  private info(): RowInfo[] {
    const { state, content } = this.game;
    const rooms = new Map(state.rooms.map((room) => [room.id, room]));
    const out: RowInfo[] = [];
    for (const r of state.residents) {
      if (r.waiting) continue;
      const child = isChild(state, r);
      const away = isAway(r);
      const room = r.roomId !== null ? rooms.get(r.roomId) : undefined;
      const name = room ? roomName(content, room) : '';
      const where = away ? (r.quest !== null ? '⚔ Quest' : r.dead ? '☠ Fallen outside' : '🧭 Glarelands') : r.dead ? '☠ Fallen' : child ? (name ? `Child · ${name}` : 'Child') : name || 'Idle';
      const roomKey = room && !away ? `0${name}|${String(room.floor).padStart(3, '0')}|${String(room.x).padStart(3, '0')}` : away ? '2' : r.dead ? '3' : '1';
      out.push({ r, where, roomKey, child, away, maxHp: effectiveMaxHp(r) });
    }
    return out;
  }

  private matches(x: RowInfo, f: FilterKey): boolean {
    const r = x.r;
    switch (f) {
      case 'all':
        return true;
      case 'idle':
        return !r.dead && !x.away && !x.child && r.roomId === null;
      case 'working':
        return !r.dead && !x.away && !x.child && r.roomId !== null;
      case 'away':
        return x.away;
      case 'injured':
        return !r.dead && (r.hp < x.maxHp - 0.5 || tainted(r));
      case 'children':
        return x.child && !r.dead;
      case 'rare':
        return r.rarity !== 'common';
      case 'fallen':
        return r.dead;
    }
  }

  private sorted(list: RowInfo[]): RowInfo[] {
    const { content } = this.game;
    const k = this.sort;
    let keyed: { x: RowInfo; n: number; s: string }[];
    if (k === 'name') keyed = list.map((x) => ({ x, n: 0, s: `${x.r.firstName} ${x.r.lastName}` }));
    else if (k === 'room') keyed = list.map((x) => ({ x, n: 0, s: x.roomKey }));
    else {
      const num = (x: RowInfo): number =>
        k === 'level' ? x.r.level : k === 'mood' ? x.r.happiness : k === 'hp' ? (x.maxHp > 0 ? x.r.hp / x.r.maxHp : 0) - (x.r.dead ? 2 : 0) : effectiveStat(content, x.r, k);
      keyed = list.map((x) => ({ x, n: num(x), s: '' }));
    }
    const text = k === 'name' || k === 'room';
    // Numbers high first, text A→Z first; health low first (who needs a patch).
    const dir = (k === 'hp' ? -1 : 1) * (this.reverse ? -1 : 1);
    keyed.sort((a, b) => {
      const c = text ? a.s.localeCompare(b.s) : b.n - a.n;
      return c * dir || a.x.r.id - b.x.r.id;
    });
    return keyed.map((e) => e.x);
  }

  /** What the list shows now: filtered, searched and sorted. */
  visible(info = this.info()): RowInfo[] {
    const q = this.query.trim().toLowerCase();
    const all = info.filter((x) => this.matches(x, this.filter));
    const hits = q ? all.filter((x) => `${x.r.firstName} ${x.r.lastName}`.toLowerCase().includes(q)) : all;
    return this.sorted(hits);
  }

  // ---------------------------------------------------------------- render

  panel(): HTMLElement {
    const { state } = this.game;
    const info = this.info();
    const counts = new Map(FILTERS.map((f) => [f.key, info.filter((x) => this.matches(x, f.key)).length]));
    const rows = this.visible(info);
    // Drop picks for residents who are gone (laid to rest, founded away).
    const ids = new Set(state.residents.map((r) => r.id));
    for (const id of this.picked) if (!ids.has(id)) this.picked.delete(id);

    const idle = counts.get('idle') ?? 0;
    const top = h(
      'div',
      { class: 'rl-top' },
      h('span', { class: 'muted' }, `${plural(info.length, 'resident')} · ${idle} idle`),
      h(
        'span',
        { class: 'rl-top-actions' },
        h(
          'button',
          {
            class: 'primary',
            disabled: idle === 0,
            title: 'Put idle adults into the free jobs that suit their stats best',
            onclick: () => this.autoAssign(),
          },
          `⚙ Auto-assign${idle ? ` (${idle})` : ''}`,
        ),
        h(
          'button',
          {
            class: this.bulk ? 'active' : '',
            'aria-pressed': this.bulk ? 'true' : 'false',
            onclick: () => {
              this.bulk = !this.bulk;
              this.picked.clear();
              if (this.bulk) this.host.select(null);
              this.host.refresh();
            },
          },
          this.bulk ? 'Done' : '☑ Select',
        ),
      ),
    );

    const search = h('input', {
      type: 'search',
      class: 'rl-search',
      placeholder: 'Search by name',
      'aria-label': 'Search residents by name',
      value: this.query,
      oninput: (e: Event) => {
        this.query = (e.target as HTMLInputElement).value;
        this.host.refresh();
        this.toTop();
      },
    });
    const sortSel = h(
      'select',
      {
        class: 'picker rl-sort',
        'aria-label': 'Sort residents by',
        onchange: (e: Event) => {
          this.sort = (e.target as HTMLSelectElement).value as SortKey;
          this.reverse = false;
          this.host.refresh();
          this.toTop();
        },
      },
      ...SORTS.map((s) => h('option', { value: s.key, selected: s.key === this.sort }, `Sort: ${s.label}`)),
    );
    const dirBtn = h(
      'button',
      {
        class: 'rl-dir',
        title: 'Reverse the order',
        'aria-label': 'Reverse the order',
        onclick: () => {
          this.reverse = !this.reverse;
          this.host.refresh();
          this.toTop();
        },
      },
      this.reverse ? '↑' : '↓',
    );
    const controls = h('div', { class: 'rl-controls' }, search, sortSel, dirBtn);
    const chips = h(
      'div',
      { class: 'rl-filters', role: 'tablist', 'aria-label': 'Filter residents' },
      // Empty filters are hidden (All always shows, and so does the one in use).
      ...FILTERS.filter((f) => f.key === 'all' || f.key === this.filter || (counts.get(f.key) ?? 0) > 0).map((f) => {
        const n = counts.get(f.key) ?? 0;
        return h(
          'button',
          {
            class: `rl-chip${this.filter === f.key ? ' active' : ''}${n === 0 && f.key !== 'all' ? ' empty' : ''}`,
            role: 'tab',
            'aria-selected': this.filter === f.key ? 'true' : 'false',
            onclick: () => {
              this.filter = f.key;
              this.host.refresh();
              this.toTop();
            },
          },
          f.label,
          h('span', { class: 'n' }, `${n}`),
        );
      }),
    );

    const selected = !this.bulk ? state.residents.find((r) => r.id === this.host.selectedId() && !r.waiting) : undefined;
    // The picked resident's card opens in place of their row, so the rest of the list follows it.
    // Someone the filter or search hides gets their card above the list instead.
    const selIdx = selected ? rows.findIndex((x) => x.r.id === selected.id) : -1;
    const card = selected ? h('div', { class: `rl-detail${selIdx >= 0 ? ' inline' : ''}` }, this.host.detailCard(selected)) : null;
    const body = h(
      'div',
      { class: 'body rl-body', onscroll: () => this.onScroll() },
      top,
      this.bulk ? null : (this.extra?.() ?? null),
      h('div', { class: 'rl-sticky' }, controls, chips, this.bulk ? this.bulkBar(rows) : null),
      card && selIdx < 0 ? card : null,
      rows.length ? this.list(rows, selIdx, selIdx >= 0 ? card : null) : this.empty(),
    );
    if (card && selIdx >= 0) this.queueMeasure();
    return body;
  }

  /** After a render with an open card: if its real height differs from the space left for it, lay out again. */
  private queueMeasure(): void {
    if (this.measureQueued) return;
    this.measureQueued = true;
    requestAnimationFrame(() => {
      this.measureQueued = false;
      const el = document.querySelector<HTMLElement>('.panel .rl-detail.inline');
      if (!el) return;
      const hgt = el.offsetHeight + CARD_GAP;
      if (Math.abs(hgt - this.cardH) > 1) {
        this.cardH = hgt;
        this.host.refresh();
        if (this.revealQueued) this.toTop();
      }
      this.revealQueued = false;
    });
  }

  /** Nobody matches: say which filter and search are hiding everyone, with a way out. */
  private empty(): HTMLElement {
    const filtered = this.filter !== 'all';
    const q = this.query.trim();
    const what = [filtered ? `the ${FILTERS.find((f) => f.key === this.filter)?.label ?? this.filter} filter` : '', q ? `the search "${q}"` : ''].filter(Boolean).join(' and ');
    return h(
      'div',
      { class: 'rl-empty' },
      h('p', { class: 'muted', style: 'margin:0 0 8px' }, q && !filtered ? `Nobody called "${q}" here.` : 'Nobody here right now.'),
      what ? h('p', { class: 'small', style: 'margin:0 0 8px' }, `Hidden by ${what}.`) : null,
      what
        ? h(
            'button',
            {
              class: 'primary',
              onclick: () => {
                this.opened();
                this.host.refresh();
                this.toTop();
              },
            },
            '✕ Clear filters',
          )
        : null,
    );
  }

  /** The windowed list: a tall box with only the rows in view placed inside it (and the open card, if any). */
  private list(rows: RowInfo[], selIdx: number, card: HTMLElement | null): HTMLElement {
    const extra = card ? this.cardH - PITCH : 0;
    const [from, to] = this.window(rows.length, selIdx, extra);
    const el = h('div', { class: 'rl-list', style: `height:${rows.length * PITCH + extra}px` });
    // The card always comes first in the DOM (it is placed absolutely), so re-renders while
    // scrolling patch the same nodes and a tap on its buttons never lands on a swapped element.
    // It is built even when scrolled out of the window, so its height stays known.
    if (card) {
      card.style.top = `${selIdx * PITCH}px`;
      el.append(card);
    }
    for (let i = from; i < to; i++) {
      const x = rows[i];
      if (!x || (i === selIdx && card)) continue;
      el.append(this.row(x, i, i > selIdx && card ? extra : 0));
    }
    return el;
  }

  /** Which rows are in view, from the live scroller of the last render. */
  private window(n: number, selIdx: number, extra: number): [number, number] {
    const body = document.querySelector<HTMLElement>('.panel .rl-body');
    const list = body?.querySelector<HTMLElement>('.rl-list');
    if (!body || !list) return [0, Math.min(n, Math.max(16, selIdx + 8) + OVERSCAN)];
    const listTop = list.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
    // Pixels in the list to a row index, allowing for the open card's extra height.
    const at = (px: number): number => {
      if (selIdx < 0 || px <= (selIdx + 1) * PITCH) return Math.floor(px / PITCH);
      return Math.max(selIdx + 1, Math.floor((px - extra) / PITCH));
    };
    const y = body.scrollTop - listTop;
    const from = Math.max(0, at(y) - OVERSCAN);
    const to = Math.min(n, at(y + body.clientHeight) + 1 + OVERSCAN);
    return [from, Math.max(from, to)];
  }

  private onScroll(): void {
    if (this.scrollQueued) return;
    this.scrollQueued = true;
    requestAnimationFrame(() => {
      this.scrollQueued = false;
      this.host.refresh();
    });
  }

  /** Scroll to where the picked resident's card sits: in its place in the list, or the top. */
  toTop(): void {
    const body = document.querySelector<HTMLElement>('.panel .rl-body');
    if (!body) return;
    const card = body.querySelector<HTMLElement>('.rl-detail.inline');
    if (!card) {
      body.scrollTo(0, 0);
      return;
    }
    this.revealQueued = true;
    const sticky = body.querySelector<HTMLElement>('.rl-sticky')?.offsetHeight ?? 0;
    const cardTop = card.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
    const view = body.clientHeight - sticky;
    // Already fully in view: leave the scroll alone.
    const rel = cardTop - body.scrollTop - sticky;
    if (rel >= 0 && rel + card.offsetHeight <= view) return;
    body.scrollTo(0, Math.max(0, cardTop - sticky - 6));
  }

  private row(x: RowInfo, i: number, shift = 0): HTMLElement {
    const { content } = this.game;
    const r = x.r;
    const picked = this.picked.has(r.id);
    const single = !this.bulk && this.host.selectedId() === r.id;
    const hpPct = r.maxHp > 0 ? Math.max(0, Math.min(100, (r.hp / r.maxHp) * 100)) : 0;
    const taintPct = r.maxHp > 0 ? Math.min(100, (r.taint / r.maxHp) * 100) : 0;
    // The value on the right follows the sort, so the list reads as a ranking.
    const k = this.sort;
    const value =
      k === 'mood'
        ? `${Math.round(r.happiness)}%`
        : k === 'hp'
          ? r.dead
            ? '☠'
            : `${Math.ceil(r.hp)}/${Math.ceil(x.maxHp)}`
          : k === 'level' || k === 'name' || k === 'room'
            ? `L${r.level}`
            : `${STAT_SHORT[k]} ${effectiveStat(content, r, k)}`;
    const tags = `${r.pregnancy ? ' 🤰' : ''}${r.courtship ? ' ♥' : ''}${r.hp < x.maxHp - 0.5 && !r.dead ? ' ✚' : ''}${tainted(r) ? ' ☢' : ''}`;
    const sub = `${k === 'level' || k === 'name' || k === 'room' ? '' : `L${r.level} · `}${x.where}${k === 'mood' ? '' : ` · ☺ ${Math.round(r.happiness)}%`}`;
    return h(
      'div',
      {
        class: `rl-row${picked ? ' picked' : ''}${single ? ' selected' : ''}${r.dead ? ' dead' : ''}${x.away ? ' away' : ''}`,
        style: `top:${i * PITCH + shift}px`,
        role: this.bulk ? 'checkbox' : 'button',
        'aria-checked': this.bulk ? (picked ? 'true' : 'false') : undefined,
        'data-id': r.id,
        onclick: (e: Event) => {
          // The re-render below can turn this row's ancestor into the detail card; don't let the tap reach it.
          e.stopPropagation();
          if (this.bulk) {
            if (picked) this.picked.delete(r.id);
            else this.picked.add(r.id);
          } else this.host.select(single ? null : r.id);
          this.host.refresh();
          // The card opened in the row's place: make sure all of it is in view.
          if (!this.bulk && !single) this.toTop();
        },
      },
      this.bulk ? h('span', { class: `rl-check${picked ? ' on' : ''}` }, picked ? '✓' : '') : null,
      h(
        'span',
        { class: 'rl-main' },
        h(
          'span',
          { class: 'rl-name' },
          r.legendary
            ? h('span', { class: 'legend-badge', title: 'Legendary resident' }, '★')
            : r.rarity !== 'common'
              ? h('span', { class: `rarity ${r.rarity}` }, r.rarity === 'legendary' ? '★ ' : '◆ ')
              : null,
          `${r.firstName} ${r.lastName}`,
          tags ? h('span', { class: 'rl-tags' }, tags) : null,
        ),
        h('span', { class: 'rl-sub' }, this.host.traitTag?.(r) ?? null, sub),
      ),
      h('b', { class: 'rl-value' }, value),
      h('span', { class: 'rl-hp' }, h('span', { class: 'hp', style: `width:${hpPct}%` }), h('span', { class: 'taint', style: `width:${taintPct}%` })),
    );
  }

  // ---------------------------------------------------------------- bulk

  private pickedResidents(): Resident[] {
    return this.game.state.residents.filter((r) => this.picked.has(r.id));
  }

  private bulkBar(rows: RowInfo[]): HTMLElement {
    const picked = this.pickedResidents();
    const n = picked.length;
    const allShown = rows.length > 0 && rows.every((x) => this.picked.has(x.r.id));
    return h(
      'div',
      { class: 'rl-bulk' },
      h(
        'div',
        { class: 'row', style: 'margin:0 0 6px' },
        h('b', {}, n ? `${n} selected` : 'Tap residents to select them'),
        h(
          'button',
          {
            class: 'close',
            disabled: !rows.length,
            onclick: () => {
              if (allShown) for (const x of rows) this.picked.delete(x.r.id);
              else for (const x of rows) this.picked.add(x.r.id);
              this.host.refresh();
            },
          },
          allShown ? 'Clear shown' : `Select shown (${rows.length})`,
        ),
      ),
      h(
        'div',
        { class: 'rl-bulk-actions' },
        h('button', { class: 'primary', disabled: !n, onclick: () => this.showRoomPicker() }, 'Assign to…'),
        h('button', { disabled: !n, onclick: () => this.unassign() }, 'Unassign'),
        h('button', { disabled: !n, onclick: () => this.healAll() }, '✚ Heal'),
      ),
      n ? h('div', { class: 'muted small', style: 'margin-top:4px' }, 'Or tap a room in the homestead to send them there.') : null,
    );
  }

  private autoAssign(): void {
    const res = this.game.run({ type: 'autoAssign' });
    const left = idleAdults(this.game.state).length;
    const rest = left ? ` ${left} still idle: no free slots left in rooms that use a stat. Build or upgrade rooms.` : ' Nobody is idle now.';
    this.host.toast(res.ok ? `⚙ Auto-assign: ${res.detail ?? 'done'}, each to the free job that suits them best.${rest}` : `Auto-assign: ${res.reason}.`, res.ok ? 'good' : 'bad');
    this.host.refresh();
  }

  /** Put as many picked residents as fit into `room`, best at its job first. Returns how many went. */
  assignPicked(room: Room): number {
    const { state, content } = this.game;
    const def = roomDef(content, room);
    const cap = roomCapacity(content, room);
    const name = roomName(content, room);
    if (cap === 0) {
      this.host.toast(`Nobody can work in the ${name}.`, 'bad');
      return 0;
    }
    const all = this.pickedResidents();
    const ready = all.filter((r) => !r.dead && !isAway(r) && !isChild(state, r) && r.roomId !== room.id);
    const unable = all.filter((r) => r.dead || isAway(r) || isChild(state, r)).length;
    const free = Math.max(0, cap - residentsInRoom(state, room.id).length);
    const stat = def.stat;
    const order = [...ready].sort((a, b) => (stat ? effectiveStat(content, b, stat) - effectiveStat(content, a, stat) : 0) || a.id - b.id);
    let sent = 0;
    for (const r of order.slice(0, free)) {
      if (this.game.run({ type: 'assign', residentId: r.id, roomId: room.id }).ok) {
        sent++;
        this.picked.delete(r.id);
      }
    }
    const left = ready.length - sent;
    if (sent) this.host.toast(`${plural(sent, 'resident')} → ${name}${left ? ` · ${left} didn't fit` : ''}`, 'good');
    else this.host.toast(free === 0 ? `The ${name} is full.` : 'Nobody picked can work there right now.', 'bad');
    if (unable) this.host.toast(`${plural(unable, 'pick')} can't work right now (children, away or fallen).`);
    this.host.refresh();
    return sent;
  }

  private unassign(): void {
    const { state } = this.game;
    let n = 0;
    for (const r of this.pickedResidents()) {
      if (r.roomId === null || r.dead || isAway(r) || isChild(state, r)) continue;
      if (this.game.run({ type: 'assign', residentId: r.id, roomId: null }).ok) n++;
    }
    this.host.toast(n ? `${plural(n, 'resident')} taken off the job.` : 'Nobody picked has a job to leave.', n ? 'good' : undefined);
    this.host.refresh();
  }

  /** Patch up everyone picked, the worst hurt first, until they are well or the stock runs out. */
  private healAll(): void {
    const { state } = this.game;
    const hurt = this.pickedResidents()
      .filter((r) => !r.dead && !isAway(r))
      .sort((a, b) => a.hp / Math.max(1, a.maxHp) - b.hp / Math.max(1, b.maxHp) || a.id - b.id);
    let patches = 0;
    let purges = 0;
    const helped = new Set<number>();
    for (const r of hurt) {
      for (let i = 0; i < 6 && tainted(r) && state.resources.purge >= 1; i++) {
        if (!this.game.run({ type: 'purge', residentId: r.id }).ok) break;
        purges++;
        helped.add(r.id);
      }
    }
    for (const r of hurt) {
      for (let i = 0; i < 6 && r.hp < effectiveMaxHp(r) - 0.5 && state.resources.medpatch >= 1; i++) {
        if (!this.game.run({ type: 'heal', residentId: r.id }).ok) break;
        patches++;
        helped.add(r.id);
      }
    }
    const stillHurt = hurt.filter((r) => r.hp < effectiveMaxHp(r) - 0.5 || tainted(r)).length;
    if (!helped.size) this.host.toast(stillHurt ? 'Out of Med-Patches and Purge. Build a Clinic or a Purge Lab.' : 'Everyone picked is already in good health.', stillHurt ? 'bad' : undefined);
    else {
      const used = [patches ? plural(patches, 'Med-Patch', 'Med-Patches') : '', purges ? `${purges} Purge` : ''].filter(Boolean).join(' and ');
      this.host.toast(`✚ Used ${used} on ${plural(helped.size, 'resident')}${stillHurt ? `. ${stillHurt} still hurt: stock ran out.` : '.'}`, stillHurt ? 'bad' : 'good');
    }
    this.host.refresh();
  }

  /** Pick a room for everyone selected: rooms with space first, best fit for the group on top. */
  private showRoomPicker(): void {
    const { state, content } = this.game;
    const group = this.pickedResidents().filter((r) => !r.dead && !isAway(r) && !isChild(state, r));
    const close = () => this.host.modalHost.replaceChildren();
    const rooms = state.rooms
      .map((room) => {
        const def = roomDef(content, room);
        const cap = roomCapacity(content, room);
        const crew = residentsInRoom(state, room.id).length;
        const stat = def.stat;
        const avg = stat && group.length ? group.reduce((s, r) => s + effectiveStat(content, r, stat), 0) / group.length : 0;
        return { room, def, cap, crew, stat, avg, free: Math.max(0, cap - crew) };
      })
      .filter((x) => x.cap > 0)
      .sort(
        (a, b) =>
          Number(b.free > 0) - Number(a.free > 0) ||
          Number(b.free >= group.length) - Number(a.free >= group.length) ||
          b.avg - a.avg ||
          a.room.floor - b.room.floor ||
          a.room.x - b.room.x,
      );
    const items = rooms.map((x) =>
      h(
        'button',
        {
          class: `rl-room${x.free ? '' : ' full'}`,
          disabled: !x.free,
          onclick: () => {
            close();
            this.assignPicked(x.room);
          },
        },
        h('span', { class: 'rl-room-name' }, h('b', {}, roomName(content, x.room)), h('span', { class: 'muted small' }, ` · floor ${x.room.floor + 1}`)),
        h('span', { class: 'muted small' }, x.stat ? `${STAT_FULL[x.stat]} · group avg ${x.avg.toFixed(1)}` : x.def.category === 'door' ? 'Guards' : 'No stat', ' ', this.host.groupFit?.(group, x.room) ?? null),
        h('span', { class: `rl-room-slots${x.free ? '' : ' short'}` }, `${x.crew}/${x.cap}`),
      ),
    );
    this.host.modalHost.replaceChildren(
      h(
        'div',
        { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && close() },
        h(
          'div',
          { class: 'modal explore-modal rl-room-modal' },
          h('h2', {}, `Assign ${group.length}`),
          h('p', { class: 'muted small', style: 'margin-top:0' }, 'Rooms with space for everyone come first, then the best match for the group. If not everyone fits, the best at the job go in first.'),
          group.length ? h('div', { class: 'rl-rooms' }, ...items) : h('p', { class: 'short' }, 'Nobody picked can work right now (children, away or fallen).'),
          h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:10px' }, h('button', { onclick: close }, 'Cancel')),
        ),
      ),
    );
  }
}

/** Glare-sickness worth a Purge: a sliver from a brief water shortage is not. */
function tainted(r: Resident): boolean {
  return r.taint >= Math.max(1, r.maxHp * 0.05);
}

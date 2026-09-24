// M6 quality-of-life client (GDD §6.6), gathered in one place so ui.ts only
// needs a handful of one-line hooks: the resident list, the notification
// centre, save slots, loadout presets, the room stats overlay, and the two
// round buttons under the HUD that open the log and toggle the overlay.

import type { GameEvent, Resident, Room } from '../../sim';
import type { Game } from '../game';
import { StatsOverlay } from '../render/statsOverlay';
import type { VaultView } from '../render/vaultView';
import { readJson, writeJson } from '../storage';
import { h, morph } from './dom';
import { Loadouts } from './loadouts';
import { NoticeCentre } from './notices';
import { ResidentList } from './residentList';
import { SaveSlots } from './saves';
import type { ToastFn } from './toasts';

export interface QolHost {
  game: Game;
  view: VaultView;
  hud: HTMLElement;
  modalHost: HTMLElement;
  toast: ToastFn;
  /** Re-render the open side panel now. */
  refresh(): void;
  openNotices(): void;
  closePanel(): void;
  /** Which panel is open (for the notices button's state). */
  panel(): string | null;
  selectedId(): number | null;
  select(id: number | null): void;
  detailCard(r: Resident): HTMLElement;
  /** M6 trait hooks for the resident list (see ui/traits.ts). */
  traitTag?(r: Resident): HTMLElement | null;
  groupFit?(rs: Resident[], room: Room): HTMLElement | null;
}

const PREFS = 'homestead.qol';

export class QolUI {
  readonly people: ResidentList;
  readonly notices: NoticeCentre;
  readonly saves: SaveSlots;
  readonly loadouts: Loadouts;
  readonly stats: StatsOverlay;
  private fabs = h('div', { class: 'qol-fabs' });
  private fabKey = '';
  private lastFrame = performance.now();

  constructor(private host: QolHost) {
    const { game } = host;
    this.people = new ResidentList({
      game,
      modalHost: host.modalHost,
      toast: (t, k, o) => host.toast(t, k, o),
      refresh: () => host.refresh(),
      selectedId: () => host.selectedId(),
      select: (id) => host.select(id),
      detailCard: (r) => host.detailCard(r),
      traitTag: (r) => host.traitTag?.(r) ?? null,
      groupFit: (rs, room) => host.groupFit?.(rs, room) ?? null,
    });
    this.notices = new NoticeCentre(game);
    this.saves = new SaveSlots({ game, toast: (t, k, o) => host.toast(t, k, o), refresh: () => host.refresh(), loaded: () => host.closePanel() });
    this.loadouts = new Loadouts(game);
    this.stats = new StatsOverlay(game, host.view);
    this.stats.visible = readJson<{ stats?: boolean }>(PREFS)?.stats ?? false;
  }

  /** Every frame, after the HUD is drawn. */
  update(): void {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.stats.update(dt);
    // Added after the HUD's own two parts exist (it builds them when empty).
    if (!this.fabs.isConnected && this.host.hud.firstChild) this.host.hud.append(this.fabs);
    if (this.host.panel() === 'notices') this.notices.markRead();
    this.renderFabs();
  }

  private renderFabs(): void {
    const unread = this.notices.unread();
    const open = this.host.panel() === 'notices';
    const key = `${unread}|${open}|${this.stats.visible}`;
    if (key === this.fabKey) return;
    this.fabKey = key;
    const next = h(
      'div',
      { class: 'qol-fabs' },
      h(
        'button',
        {
          class: `fab${open ? ' active' : ''}`,
          title: 'Notifications',
          'aria-label': `Notifications${unread ? `, ${unread} new` : ''}`,
          onclick: () => (this.host.panel() === 'notices' ? this.host.closePanel() : this.host.openNotices()),
        },
        '🔔',
        unread ? h('span', { class: 'badge' }, unread > 99 ? '99+' : unread) : null,
      ),
      h(
        'button',
        {
          class: `fab${this.stats.visible ? ' active' : ''}`,
          title: 'Room stats overlay',
          'aria-label': 'Room stats overlay',
          'aria-pressed': this.stats.visible ? 'true' : 'false',
          onclick: () => this.toggleStats(),
        },
        '▦',
      ),
    );
    morph(this.fabs, next);
  }

  toggleStats(): void {
    this.stats.visible = !this.stats.visible;
    writeJson(PREFS, { stats: this.stats.visible });
    this.renderFabs();
  }

  onEvents(events: GameEvent[]): void {
    this.notices.onEvents(events);
  }

  onStateReplaced(): void {
    this.people.reset();
    this.notices.onStateReplaced();
  }
}

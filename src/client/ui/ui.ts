// DOM interface over the Pixi view: HUD, toolbar, side panels, toasts, hints.

import {
  achievementProgress,
  buildCost,
  cycleSeconds,
  effectiveMaxHp,
  foodDemandPerMin,
  maxLevel,
  population,
  powerDemandPerMin,
  resourceCapacity,
  residentsInRoom,
  reviveCost,
  roomCapacity,
  roomDef,
  rushFailChance,
  shortageThreshold,
  storageCapacity,
  topStats,
  upgradeCost,
  vaultHappiness,
  waterDemandPerMin,
  xpToNext,
  STAT_KEYS,
  tableValue,
  type GameEvent,
  type Resident,
  type Room,
  type StatKey,
} from '../../sim';
import type { Game } from '../game';
import type { VaultView } from '../render/vaultView';
import { downloadFile } from '../storage';
import { duration, fmt, h } from './dom';

type PanelKind = 'build' | 'room' | 'residents' | 'achievements' | 'menu' | null;

const STAT_LABEL: Record<StatKey, string> = {
  brawn: 'BRN',
  sight: 'SGT',
  grit: 'GRT',
  charm: 'CHR',
  wits: 'WIT',
  knack: 'KNK',
  fortune: 'FOR',
};
const STAT_NAME: Record<StatKey, string> = {
  brawn: 'Brawn',
  sight: 'Sight',
  grit: 'Grit',
  charm: 'Charm',
  wits: 'Wits',
  knack: 'Knack',
  fortune: 'Fortune',
};

export class UI {
  private root: HTMLElement;
  private hud = h('div', { class: 'hud' });
  private toolbar = h('div', { class: 'toolbar' });
  private panelHost = h('div');
  private toasts = h('div', { class: 'toasts' });
  private hint = h('div', { class: 'hint', style: 'display:none' });
  private modalHost = h('div');

  private panel: PanelKind = null;
  private roomId: number | null = null;
  private residentId: number | null = null;
  private sortBy: 'level' | StatKey | 'name' = 'level';
  private lastPanelRender = 0;

  constructor(
    private game: Game,
    private view: VaultView,
  ) {
    this.root = document.getElementById('ui') as HTMLElement;
    this.root.append(this.hud, this.toasts, this.panelHost, this.hint, this.toolbar, this.modalHost);
    this.renderToolbar();
    game.on((events) => this.onEvents(events));
    if (game.lastCatchUp) this.showAwaySummary();
    else if (game.state.time < 5) this.showWelcome();
  }

  // ---------------------------------------------------------------- view callbacks

  onRoomTap(room: Room): void {
    const { state } = this.game;
    if (this.residentId !== null && this.panel === 'residents') {
      this.assign(this.residentId, room);
      return;
    }
    if (room.type === 'door' && state.residents.some((r) => r.waiting)) {
      const res = this.game.run({ type: 'admitAll' });
      this.toast(res.ok ? `Welcome to Homestead ${state.homesteadNumber}! (${res.detail})` : res.reason, res.ok ? 'good' : 'bad');
      return;
    }
    if (room.ready) {
      this.game.run({ type: 'collect', roomId: room.id });
      return;
    }
    this.openRoom(room.id);
  }

  onEmptyTap(): void {
    if (this.view.buildMode) return;
    this.closePanel();
  }

  onResidentTap(res: Resident): void {
    this.residentId = res.id;
    this.view.selectedResidentId = res.id;
    this.openPanel('residents');
  }

  onResidentDrop(residentId: number, room: Room | null): void {
    if (!room) return;
    this.assign(residentId, room);
  }

  onBuildAt(floor: number, x: number): void {
    const type = this.view.buildMode;
    if (!type) return;
    const res = this.game.run({ type: 'build', roomType: type, floor, x });
    if (!res.ok) this.toast(res.reason, 'bad');
    this.view.rebuildGhosts();
    this.renderPanel(true);
  }

  private assign(residentId: number, room: Room): void {
    const res = this.game.run({ type: 'assign', residentId, roomId: room.id });
    const who = this.game.state.residents.find((r) => r.id === residentId);
    if (!res.ok) this.toast(res.reason, 'bad');
    else if (who) {
      const def = roomDef(this.game.content, room);
      const good = def.stat && topStats(who.stats).includes(def.stat);
      this.toast(`${who.firstName} → ${def.name}${good ? ' ✓ great fit' : ''}${res.detail ? ` (${res.detail})` : ''}`, good ? 'good' : undefined);
    }
    this.renderPanel(true);
  }

  // ---------------------------------------------------------------- frame

  update(): void {
    this.renderHud();
    this.renderHint();
    if (performance.now() - this.lastPanelRender > 500) this.renderPanel();
  }

  private renderHud(): void {
    const { state, content } = this.game;
    const meter = (key: 'power' | 'food' | 'water', color: string, glyph: string, demand: number) => {
      const cap = resourceCapacity(state, content, key);
      const val = state.resources[key];
      const tick = shortageThreshold(demand, content);
      const pct = cap > 0 ? Math.min(100, (val / cap) * 100) : 0;
      const tickPct = cap > 0 ? Math.min(100, (tick / cap) * 100) : 0;
      return h(
        'div',
        { class: `meter${val < tick ? ' short' : ''}`, title: `${key}: ${Math.floor(val)} / ${cap} (shortage below ${Math.ceil(tick)})` },
        h('div', { class: 'icon', style: `background:${color}` }, glyph),
        h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${pct}%;background:${color}` }), h('div', { class: 'tick', style: `left:${tickPct}%` })),
        h('div', { class: 'num' }, `${Math.floor(val)}/${cap}`),
      );
    };
    const pop = population(state);
    const cap = storageCapacity(state, content, 'population');
    this.hud.replaceChildren(
      h('div', { class: 'title' }, `HOMESTEAD ${state.homesteadNumber}`),
      meter('power', 'var(--power)', 'P', powerDemandPerMin(state, content)),
      meter('food', 'var(--food)', 'F', foodDemandPerMin(state, content)),
      meter('water', 'var(--water)', 'W', waterDemandPerMin(state, content)),
      h('div', { class: 'stat-chip' }, 'Scrip ', h('b', {}, fmt(state.scrip))),
      h('div', { class: 'stat-chip' }, 'Pop ', h('b', {}, `${pop}/${cap}`)),
      h('div', { class: 'stat-chip' }, 'Mood ', h('b', {}, `${Math.round(vaultHappiness(state))}%`)),
      h('div', { class: 'stat-chip', title: 'Med-Patches / Purge' }, '✚ ', h('b', {}, `${Math.floor(state.resources.medpatch)}`), ' ☢ ', h('b', {}, `${Math.floor(state.resources.purge)}`)),
    );
  }

  private renderHint(): void {
    const { state } = this.game;
    let text = '';
    const waiting = state.residents.filter((r) => r.waiting).length;
    if (this.view.buildMode) {
      const def = this.game.content.rooms[this.view.buildMode];
      text = `Tap a green slot to build ${def?.name ?? ''} (${buildCost(state, this.game.content, this.view.buildMode)} scrip)`;
    } else if (this.residentId !== null && this.panel === 'residents') {
      const r = state.residents.find((x) => x.id === this.residentId);
      if (r && !r.dead) text = `Tap a room (or drag ${r.firstName}) to assign`;
    } else if (waiting > 0) {
      text = `${waiting} resident${waiting > 1 ? 's' : ''} waiting: tap the door to let them in`;
    } else if (state.residents.some((r) => !r.waiting && !r.dead && r.roomId === null)) {
      text = 'Drag idle residents into rooms to put them to work';
    }
    this.hint.style.display = text ? '' : 'none';
    this.hint.textContent = text;
  }

  // ---------------------------------------------------------------- toolbar

  private renderToolbar(): void {
    const btn = (label: string, kind: PanelKind | 'collect', extra = '') =>
      h(
        'button',
        {
          class: `${this.panel === kind ? 'active' : ''} ${extra}`,
          onclick: () => {
            if (kind === 'collect') {
              const res = this.game.run({ type: 'collectAll' });
              if (res.ok && res.detail?.startsWith('0')) this.toast('Nothing ready yet');
              return;
            }
            if (this.panel === kind) this.closePanel();
            else this.openPanel(kind);
          },
        },
        label,
      );
    this.toolbar.replaceChildren(
      btn('Build', 'build', 'primary'),
      btn('Residents', 'residents'),
      btn('Collect', 'collect'),
      btn('Goals', 'achievements'),
      btn('☰', 'menu'),
    );
  }

  // ---------------------------------------------------------------- panels

  openPanel(kind: PanelKind): void {
    if (kind !== 'build') this.setBuildMode(null);
    if (kind !== 'residents') {
      this.residentId = null;
      this.view.selectedResidentId = null;
    }
    if (kind !== 'room') {
      this.roomId = null;
      this.view.selectedRoomId = null;
    }
    this.panel = kind;
    this.renderToolbar();
    this.renderPanel(true);
  }

  openRoom(id: number): void {
    this.openPanel('room');
    this.roomId = id;
    this.view.selectedRoomId = id;
    this.renderPanel(true);
  }

  closePanel(): void {
    this.openPanel(null);
  }

  private setBuildMode(type: string | null): void {
    this.view.buildMode = type;
    this.view.rebuildGhosts();
  }

  private renderPanel(force = false): void {
    if (!force && (this.panel === 'menu' || this.panel === null)) return;
    this.lastPanelRender = performance.now();
    if (!this.panel) {
      this.panelHost.replaceChildren();
      return;
    }
    const titles: Record<Exclude<PanelKind, null>, string> = {
      build: 'Build',
      room: 'Room',
      residents: 'Residents',
      achievements: 'Goals',
      menu: 'Menu',
    };
    let body: HTMLElement;
    let title = titles[this.panel];
    switch (this.panel) {
      case 'build':
        body = this.buildPanel();
        break;
      case 'room': {
        const room = this.game.state.rooms.find((r) => r.id === this.roomId);
        if (!room) {
          this.closePanel();
          return;
        }
        const def = roomDef(this.game.content, room);
        title = def.levelNames?.[room.level - 1] ?? def.name;
        body = this.roomPanel(room);
        break;
      }
      case 'residents':
        body = this.residentsPanel();
        break;
      case 'achievements':
        body = this.achievementsPanel();
        break;
      case 'menu':
        body = this.menuPanel();
        break;
    }
    const panel = h(
      'div',
      { class: 'panel' },
      h('header', {}, h('h2', {}, title), h('button', { class: 'close', onclick: () => this.closePanel() }, '✕')),
      body,
    );
    // Only swap the DOM when something visible changed, so elements are not
    // replaced under the player's finger mid-tap. Scroll position is kept.
    const old = this.panelHost.firstElementChild;
    if (old && old.outerHTML === panel.outerHTML) return;
    const oldBody = this.panelHost.querySelector('.body');
    const scroll = oldBody?.scrollTop ?? 0;
    this.panelHost.replaceChildren(panel);
    const newBody = panel.querySelector('.body');
    if (newBody) newBody.scrollTop = scroll;
  }

  private buildPanel(): HTMLElement {
    const { state, content } = this.game;
    const items = content.roomList
      .filter((d) => d.buildable)
      .sort((a, b) => a.unlockPop - b.unlockPop)
      .map((def) => {
        const unlocked = state.unlockedRooms.includes(def.id);
        const cost = buildCost(state, content, def.id);
        const selected = this.view.buildMode === def.id;
        const what = def.produces
          ? `Makes ${def.produces.resource} · uses ${def.stat ? STAT_NAME[def.stat] : '—'}`
          : def.storage?.resource === 'population'
            ? `Houses residents · ${def.stat ? STAT_NAME[def.stat] : ''}`
            : def.category === 'elevator'
              ? 'Connects floors'
              : def.storage
                ? `Stores ${def.storage.resource}`
                : '';
        return h(
          'div',
          {
            class: `list-item${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`,
            onclick: () => {
              if (!unlocked) return;
              this.setBuildMode(selected ? null : def.id);
              this.renderPanel(true);
            },
          },
          h('div', { class: 'row' }, h('b', {}, def.name), h('span', {}, unlocked ? `${fmt(cost)} scrip` : `🔒 pop ${def.unlockPop}`)),
          h('div', { class: 'muted' }, what),
        );
      });
    return h(
      'div',
      { class: 'body' },
      h('p', { class: 'muted' }, 'Pick a room, then tap a green slot. Rooms of the same type and level merge up to 3 wide, which is more efficient than separate rooms.'),
      ...items,
    );
  }

  private roomPanel(room: Room): HTMLElement {
    const { state, content } = this.game;
    const def = roomDef(content, room);
    const crew = residentsInRoom(state, room.id);
    const cap = roomCapacity(content, room);
    const parts: (HTMLElement | string)[] = [];

    parts.push(h('div', { class: 'row muted' }, `Level ${room.level}/${maxLevel(def)} · ${room.segments} wide`, def.stat ? `Needs ${STAT_NAME[def.stat]}` : ''));
    if (!room.powered) parts.push(h('div', { class: 'row', style: 'color:var(--danger)' }, '⚡ No power: this room is shut down'));

    if (def.produces) {
      const secs = cycleSeconds(state, content, room);
      const out = tableValue(def.produces.output, room.level, room.segments);
      parts.push(h('div', { class: 'row' }, `Makes ${out} ${def.produces.resource} per batch`, h('b', {}, room.ready ? 'READY' : duration(secs))));
    }
    if (def.storage) {
      const amt = tableValue(def.storage.amount, room.level, room.segments);
      parts.push(h('div', { class: 'row muted' }, `Adds ${amt} ${def.storage.resource === 'population' ? 'beds' : `${def.storage.resource} storage`}`));
    }

    if (cap > 0) {
      parts.push(h('h3', { style: 'margin:12px 0 4px;font-size:14px' }, `Crew ${crew.length}/${cap}`));
      for (const r of crew) {
        parts.push(
          h(
            'div',
            { class: 'list-item row' },
            h('span', {}, `${r.firstName} ${r.lastName} · L${r.level}`),
            h(
              'span',
              {},
              def.stat ? h('b', {}, `${STAT_LABEL[def.stat]} ${r.stats[def.stat]}`) : '',
              ' ',
              h('button', { class: 'close', onclick: () => (this.game.run({ type: 'assign', residentId: r.id, roomId: null }), this.renderPanel(true)) }, 'Remove'),
            ),
          ),
        );
      }
      if (crew.length < cap) parts.push(h('div', { class: 'muted' }, 'Drag residents here, or pick one in Residents and tap this room.'));
    }

    const actions: HTMLElement[] = [];
    if (room.type === 'door' && state.residents.some((r) => r.waiting)) {
      actions.push(h('button', { class: 'primary', onclick: () => this.onRoomTap(room) }, 'Let residents in'));
    }
    if (def.produces) {
      if (room.ready) actions.push(h('button', { class: 'primary', onclick: () => this.game.run({ type: 'collect', roomId: room.id }) }, 'Collect'));
      else if (crew.length) {
        const pct = Math.round(rushFailChance(state, content, room) * 100);
        actions.push(
          h(
            'button',
            {
              onclick: () => {
                const res = this.game.run({ type: 'rush', roomId: room.id });
                if (!res.ok) this.toast(res.reason, 'bad');
                else if (res.detail === 'failure') this.toast('Rush failed: fire!', 'bad');
                this.renderPanel(true);
              },
            },
            `Rush (${pct}% risk)`,
          ),
        );
      }
    }
    const up = upgradeCost(content, room);
    if (up !== null) {
      actions.push(
        h(
          'button',
          {
            disabled: state.scrip < up,
            onclick: () => {
              const res = this.game.run({ type: 'upgrade', roomId: room.id });
              if (!res.ok) this.toast(res.reason, 'bad');
              this.renderPanel(true);
            },
          },
          `Upgrade (${fmt(up)})`,
        ),
      );
    }
    if (room.type !== 'door') {
      actions.push(
        h(
          'button',
          {
            class: 'danger',
            onclick: () => {
              if (!confirm(`Demolish this ${def.name}? No refund.`)) return;
              const res = this.game.run({ type: 'demolish', roomId: room.id });
              if (!res.ok) this.toast(res.reason, 'bad');
            },
          },
          'Demolish',
        ),
      );
    }
    return h('div', { class: 'body' }, ...parts, h('div', { class: 'row', style: 'flex-wrap:wrap;justify-content:flex-start;margin-top:12px' }, ...actions));
  }

  private residentCard(r: Resident, detailed: boolean): HTMLElement {
    const { state, content } = this.game;
    const room = r.roomId !== null ? state.rooms.find((x) => x.id === r.roomId) : undefined;
    const where = r.dead ? '☠ Fallen' : r.waiting ? 'At the door' : room ? (roomDef(content, room).name) : 'Idle';
    const top = topStats(r.stats);
    const max = r.maxHp;
    const hpPct = Math.max(0, (r.hp / max) * 100);
    const taintPct = Math.min(100, (r.taint / max) * 100);
    const stats = h('div', { class: 'stats' }, ...STAT_KEYS.map((k) => h('span', { class: top.includes(k) ? 'hi' : '', title: STAT_NAME[k] }, `${STAT_LABEL[k]} ${r.stats[k]}`)));
    const card = h(
      'div',
      {
        class: `list-item${this.residentId === r.id ? ' selected' : ''}`,
        onclick: () => {
          this.residentId = this.residentId === r.id ? null : r.id;
          this.view.selectedResidentId = this.residentId;
          this.renderPanel(true);
        },
      },
      h('div', { class: 'row' }, h('b', {}, `${r.firstName} ${r.lastName}`), h('span', { class: 'muted' }, `L${r.level} · ${where}`)),
      stats,
      h('div', { class: 'hpbar' }, h('div', { class: 'hp', style: `width:${hpPct}%` }), h('div', { class: 'taint', style: `width:${taintPct}%` })),
    );
    if (detailed) {
      const next = xpToNext(content, r.level);
      card.append(
        h('div', { class: 'row muted' }, `HP ${Math.ceil(r.hp)}/${Math.ceil(effectiveMaxHp(r))}`, `Mood ${Math.round(r.happiness)}%`, `XP ${Math.floor(r.xp)}/${next}`),
      );
      if (r.dead) {
        const cost = reviveCost(content, r);
        card.append(
          h(
            'button',
            {
              class: 'primary',
              onclick: (e: Event) => {
                e.stopPropagation();
                const res = this.game.run({ type: 'revive', residentId: r.id });
                this.toast(res.ok ? `${r.firstName} is back on their feet.` : res.reason, res.ok ? 'good' : 'bad');
              },
            },
            `Revive (${cost} scrip)`,
          ),
        );
      }
    }
    return card;
  }

  private residentsPanel(): HTMLElement {
    const { state } = this.game;
    const list = state.residents.filter((r) => !r.waiting);
    const key = this.sortBy;
    list.sort((a, b) => {
      if (key === 'name') return a.firstName.localeCompare(b.firstName);
      if (key === 'level') return b.level - a.level || a.id - b.id;
      return b.stats[key] - a.stats[key] || a.id - b.id;
    });
    const tabs = h(
      'div',
      { class: 'tabs' },
      ...(['level', 'name', ...STAT_KEYS] as const).map((k) =>
        h(
          'button',
          {
            class: this.sortBy === k ? 'active' : '',
            onclick: () => {
              this.sortBy = k;
              this.renderPanel(true);
            },
          },
          k === 'level' ? 'Level' : k === 'name' ? 'Name' : STAT_LABEL[k],
        ),
      ),
    );
    const idle = list.filter((r) => !r.dead && r.roomId === null).length;
    return h(
      'div',
      { class: 'body' },
      h('div', { class: 'muted', style: 'margin-bottom:6px' }, `${list.length} residents · ${idle} idle. Select one, then tap a room.`),
      tabs,
      ...list.map((r) => this.residentCard(r, r.id === this.residentId)),
    );
  }

  private achievementsPanel(): HTMLElement {
    const { state, content } = this.game;
    const total = content.achievements.length;
    const done = content.achievements.filter((a) => state.achievements[a.id] !== undefined).length;
    const items = content.achievements.map((a) => {
      const got = state.achievements[a.id] !== undefined;
      const hidden = a.hidden && !got;
      const p = achievementProgress(state, a);
      return h(
        'div',
        { class: `list-item ach${got ? '' : ' locked'}` },
        h('div', { class: `medal ${a.tier}` }, got ? '★' : ''),
        h(
          'div',
          { style: 'flex:1' },
          h('b', {}, hidden ? '???' : a.name),
          h('div', { class: 'muted' }, hidden ? 'Hidden achievement' : a.description),
          got || hidden ? null : h('div', { class: 'progress' }, h('div', { style: `width:${p * 100}%` })),
        ),
      );
    });
    return h(
      'div',
      { class: 'body' },
      h('div', { class: 'row' }, h('b', {}, `${done} / ${total} earned`), h('span', { class: 'muted' }, "Warden's Seal: earn them all")),
      h('div', { class: 'progress', style: 'margin-bottom:10px' }, h('div', { style: `width:${(done / total) * 100}%;background:var(--accent)` })),
      ...items,
    );
  }

  private menuPanel(): HTMLElement {
    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' }) as HTMLInputElement;
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      try {
        this.game.importSave(await f.text());
        this.toast('Save imported', 'good');
      } catch (err) {
        this.toast(`Import failed: ${(err as Error).message}`, 'bad');
      }
    });
    return h(
      'div',
      { class: 'body' },
      h('p', { class: 'muted' }, 'The game saves automatically in this browser.'),
      h('div', { class: 'row', style: 'flex-wrap:wrap;justify-content:flex-start' },
        h('button', { onclick: () => (this.game.save(), this.toast('Saved', 'good')) }, 'Save now'),
        h('button', { onclick: () => downloadFile(`homestead-${this.game.state.homesteadNumber}.json`, this.game.exportSave()) }, 'Export save'),
        h('button', { onclick: () => fileInput.click() }, 'Import save'),
        fileInput,
      ),
      h('div', { class: 'row', style: 'margin-top:18px' },
        h(
          'button',
          {
            class: 'danger',
            onclick: () => {
              if (confirm('Start a brand new homestead? Your current save will be erased.')) {
                this.game.reset();
                this.closePanel();
                this.showWelcome();
              }
            },
          },
          'New homestead',
        ),
      ),
      h('p', { class: 'muted', style: 'margin-top:18px' }, 'Homestead is an early prototype (milestone M1). Placeholder art. Developer console: window.homestead'),
    );
  }

  // ---------------------------------------------------------------- events & feedback

  private onEvents(events: GameEvent[]): void {
    const { state, content } = this.game;
    for (const ev of events) {
      switch (ev.type) {
        case 'achievementUnlocked': {
          const a = content.achievements.find((x) => x.id === ev.achievementId);
          if (a) this.toast(`🏆 ${a.name}: ${a.description}`, 'gold');
          break;
        }
        case 'roomUnlocked': {
          const d = content.rooms[ev.roomType];
          if (d) this.toast(`New room unlocked: ${d.name}`, 'gold');
          break;
        }
        case 'incidentStarted':
          this.toast('🔥 Fire! Keep residents in the room to put it out.', 'bad');
          break;
        case 'incidentResolved':
          this.toast('Fire extinguished.', 'good');
          break;
        case 'residentDied': {
          const r = state.residents.find((x) => x.id === ev.residentId);
          if (r) this.toast(`${r.firstName} ${r.lastName} has fallen. Revive them from Residents.`, 'bad');
          break;
        }
        case 'roomsMerged':
          if (ev.segments === 3) this.toast('Rooms merged into a triple!', 'good');
          break;
      }
    }
  }

  toast(text: string, kind?: 'good' | 'bad' | 'gold'): void {
    const el = h('div', { class: `toast ${kind ?? ''}` }, text);
    this.toasts.prepend(el);
    while (this.toasts.children.length > 5) this.toasts.lastElementChild?.remove();
    setTimeout(() => el.remove(), 4200);
  }

  private modal(title: string, ...content: (HTMLElement | string)[]): void {
    const close = () => this.modalHost.replaceChildren();
    this.modalHost.replaceChildren(
      h(
        'div',
        { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && close() },
        h('div', { class: 'modal' }, h('h2', {}, title), ...content, h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px' }, h('button', { class: 'primary', onclick: close }, 'Got it'))),
      ),
    );
  }

  private showWelcome(): void {
    const n = this.game.state.homesteadNumber;
    this.modal(
      `Welcome, Warden`,
      h('p', {}, `HALCY here! Congratulations on your appointment as Warden of Halcyon Homestead ${n}. Your founding residents are waiting at the door.`),
      h('p', { class: 'muted' }, '1. Tap the door to let them in.  2. Drag residents into rooms that match their best stat (highlighted in green).  3. Tap rooms to collect power, food and water.  4. Build more rooms to grow.'),
    );
  }

  private showAwaySummary(): void {
    const s = this.game.lastCatchUp;
    if (!s) return;
    this.game.lastCatchUp = null;
    this.modal(
      'While you were away',
      h('p', {}, `${duration(s.seconds)} passed. ${s.readyRooms} room${s.readyRooms === 1 ? ' is' : 's are'} ready to collect.`),
      s.cappedAt ? h('p', { class: 'muted' }, `Offline progress is capped at ${duration(s.cappedAt)}.`) : '',
      h('p', { class: 'muted' }, 'Your homestead is safe while you are gone: no incidents, no shortage damage.'),
    );
  }
}

// DOM interface over the Pixi view: HUD, toolbar, side panels, toasts, hints.

import {
  achievementProgress,
  buildCost,
  combatDamage,
  courtshipSeconds,
  cycleSeconds,
  effectiveMaxHp,
  effectiveStats,
  foodDemandPerMin,
  isChild,
  itemCapacity,
  maxLevel,
  population,
  powerDemandPerMin,
  radioChance,
  radioInterval,
  resourceCapacity,
  residentsInRoom,
  reviveCost,
  roomCapacity,
  roomDef,
  rushFailChance,
  sellValue,
  shortageThreshold,
  storageCapacity,
  topStats,
  upgradeCost,
  vaultHappiness,
  waterDemandPerMin,
  xpToNext,
  STAT_KEYS,
  tableValue,
  type CrateCard,
  type CrateTier,
  type GameEvent,
  type Resident,
  type Room,
  type StatKey,
} from '../../sim';
import type { Game } from '../game';
import type { VaultView } from '../render/vaultView';
import { downloadFile } from '../storage';
import { duration, fmt, h } from './dom';

type PanelKind = 'build' | 'room' | 'residents' | 'storage' | 'crates' | 'achievements' | 'menu' | null;

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
const TIER_NAME: Record<CrateTier, string> = { standard: 'Supply Crate', rare: 'Rare Crate', legendary: 'Legendary Crate' };
const INCIDENT_TOAST: Record<string, string> = {
  fire: '🔥 Fire! Keep residents in the room to put it out.',
  skitters: '🪲 Skitters! Stay in the room and stamp them out.',
  burrowers: '⛏ Burrowers broke through the wall and are draining power!',
  rustmen: '⚔ Rustmen raiders are at the door! Arm your door guards.',
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
  /** When set, the storage panel is picking gear for this resident. */
  private equipFor: { residentId: number; slot: 'weapon' | 'outfit' } | null = null;
  private sortBy: 'level' | StatKey | 'name' = 'level';
  private lastPanelRender = 0;
  private lastToolbarKey = '';

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
    this.openPanel('residents');
    this.residentId = res.id;
    this.view.selectedResidentId = res.id;
    this.renderPanel(true);
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
      const good = def.stat && topStats(effectiveStats(this.game.content, who)).includes(def.stat);
      this.toast(`${who.firstName} → ${def.name}${good ? ' ✓ great fit' : ''}${res.detail ? ` (${res.detail})` : ''}`, good ? 'good' : undefined);
    }
    this.renderPanel(true);
  }

  // ---------------------------------------------------------------- frame

  update(): void {
    this.renderHud();
    this.renderHint();
    this.renderToolbar();
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
    const crates = state.crates.standard + state.crates.rare + state.crates.legendary;
    this.hud.replaceChildren(
      h('div', { class: 'title' }, `HOMESTEAD ${state.homesteadNumber}`),
      meter('power', 'var(--power)', 'P', powerDemandPerMin(state, content)),
      meter('food', 'var(--food)', 'F', foodDemandPerMin(state, content)),
      meter('water', 'var(--water)', 'W', waterDemandPerMin(state, content)),
      h('div', { class: 'stat-chip' }, 'Scrip ', h('b', {}, fmt(state.scrip))),
      h('div', { class: 'stat-chip' }, 'Pop ', h('b', {}, `${pop}/${cap}`)),
      h('div', { class: 'stat-chip' }, 'Mood ', h('b', {}, pop > 0 ? `${Math.round(vaultHappiness(state))}%` : '—')),
      h('div', { class: 'stat-chip', title: 'Med-Patches / Purge' }, '✚ ', h('b', {}, `${Math.floor(state.resources.medpatch)}`), ' ☢ ', h('b', {}, `${Math.floor(state.resources.purge)}`)),
      h(
        'button',
        { class: `stat-chip chip-button${crates ? ' glow' : ''}`, title: 'Supply Crates', onclick: () => this.openPanel('crates') },
        '📦 ',
        h('b', {}, `${crates}`),
        h('span', { class: 'token-mini' }, h('span', { style: `width:${(state.crateTokens / content.balance.crates.tokensPerCrate) * 100}%` })),
      ),
    );
  }

  private renderHint(): void {
    const { state } = this.game;
    let text = '';
    const waiting = state.residents.filter((r) => r.waiting).length;
    const raid = state.incidents.find((i) => i.type === 'rustmen');
    if (this.view.buildMode) {
      const def = this.game.content.rooms[this.view.buildMode];
      text = `Tap a green slot to build ${def?.name ?? ''} (${buildCost(state, this.game.content, this.view.buildMode)} scrip)`;
    } else if (this.equipFor) {
      text = 'Pick an item from storage to equip';
    } else if (this.residentId !== null && this.panel === 'residents') {
      const r = state.residents.find((x) => x.id === this.residentId);
      if (r && !r.dead && !isChild(state, r)) text = `Tap a room (or drag ${r.firstName}) to assign`;
    } else if (raid) {
      text = raid.doorHp > 0 ? 'Raiders are breaking in: drag fighters to the door!' : 'Raiders inside: drag armed residents into their room!';
    } else if (state.incidents.length) {
      text = 'Incident! Drag residents into the affected room to deal with it';
    } else if (waiting > 0) {
      text = `${waiting} resident${waiting > 1 ? 's' : ''} waiting: tap the door to let them in`;
    } else if (state.residents.some((r) => !r.waiting && !r.dead && r.roomId === null && !isChild(state, r))) {
      text = 'Drag idle residents into rooms to put them to work';
    }
    // On phones an open panel covers the bottom of the screen; the hint would sit on top of it.
    if (this.panel && window.innerWidth < 640) text = '';
    this.hint.style.display = text ? '' : 'none';
    this.hint.textContent = text;
  }

  // ---------------------------------------------------------------- toolbar

  private renderToolbar(): void {
    const { state } = this.game;
    const crates = state.crates.standard + state.crates.rare + state.crates.legendary;
    const key = `${this.panel}|${crates}|${state.items.length}`;
    if (key === this.lastToolbarKey) return;
    this.lastToolbarKey = key;
    const btn = (label: string, kind: PanelKind | 'collect', extra = '', badge?: number) =>
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
        badge ? h('span', { class: 'badge' }, badge) : null,
      );
    this.toolbar.replaceChildren(
      btn('Build', 'build', 'primary'),
      btn(window.innerWidth < 640 ? 'People' : 'Residents', 'residents'),
      btn('Storage', 'storage'),
      btn('Crates', 'crates', '', crates),
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
    if (kind !== 'storage') this.equipFor = null;
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
      storage: 'Storage',
      crates: 'Supply Crates',
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
      case 'storage':
        body = this.storagePanel();
        break;
      case 'crates':
        body = this.cratesPanel();
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
            ? `Houses residents · families start here`
            : def.category === 'elevator'
              ? 'Connects floors'
              : def.category === 'radio'
                ? 'Broadcasts to attract new residents · uses Charm'
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
    const inc = state.incidents.find((i) => i.roomId === room.id);
    if (inc) parts.push(h('div', { class: 'row', style: 'color:var(--danger)' }, `${INCIDENT_TOAST[inc.type] ?? 'Incident!'}`));

    if (def.produces) {
      const secs = cycleSeconds(state, content, room);
      const out = tableValue(def.produces.output, room.level, room.segments);
      parts.push(h('div', { class: 'row' }, `Makes ${out} ${def.produces.resource} per batch`, h('b', {}, room.ready ? 'READY' : duration(secs))));
    }
    if (def.storage) {
      const amt = tableValue(def.storage.amount, room.level, room.segments);
      parts.push(h('div', { class: 'row muted' }, `Adds ${amt} ${def.storage.resource === 'population' ? 'beds' : `${def.storage.resource} storage`}`));
    }
    if (def.category === 'radio') {
      const interval = radioInterval(state, content, room);
      parts.push(
        h('div', { class: 'row' }, 'Next broadcast', h('b', {}, crew.length ? duration(Math.max(0, interval - room.timer)) : 'needs a DJ')),
        h('div', { class: 'row muted' }, `Each broadcast has a ${Math.round(radioChance(content, room) * 100)}% chance to attract a new resident. Charm shortens the wait; wider and upgraded rooms reach further.`),
      );
    }
    if (def.category === 'door') {
      const hp = def.doorHp?.[room.level - 1] ?? 0;
      parts.push(h('div', { class: 'row' }, 'Door strength', h('b', {}, `${hp}`)));
      parts.push(h('div', { class: 'row muted' }, 'Guards stationed here meet raiders first. Arm them well. Upgrading the door holds raiders outside for longer.'));
    }
    if (def.category === 'living') {
      const couples = crew.filter((r) => r.courtship);
      parts.push(
        h(
          'div',
          { class: 'row muted' },
          couples.length
            ? `${couples.length} couple${couples.length > 1 ? 's' : ''} getting to know each other…`
            : 'Put a woman and a man here to start a family. More Charm, faster romance.',
        ),
      );
    }

    if (cap > 0) {
      parts.push(h('h3', { style: 'margin:12px 0 4px;font-size:14px' }, `${def.category === 'door' ? 'Guards' : 'Crew'} ${crew.length}/${cap}`));
      for (const r of crew) {
        const tag = r.courtship ? ' ♥' : r.pregnancy ? ' 🤰' : '';
        parts.push(
          h(
            'div',
            { class: 'list-item row' },
            h('span', {}, `${r.firstName} ${r.lastName} · L${r.level}${tag}`),
            h(
              'span',
              {},
              def.stat ? h('b', {}, `${STAT_LABEL[def.stat]} ${effectiveStats(content, r)[def.stat]}`) : h('b', {}, `DMG ${combatDamage(content, r)}`),
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
              disabled: state.incidents.length > 0,
              onclick: () => {
                const res = this.game.run({ type: 'rush', roomId: room.id });
                if (!res.ok) this.toast(res.reason, 'bad');
                else if (res.detail === 'failure') this.toast('Rush failed!', 'bad');
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

  private statusLine(r: Resident): string {
    const { state, content } = this.game;
    if (r.dead) return '☠ Fallen';
    if (isChild(state, r)) return `Child · grows up in ${duration((r.adultAt ?? 0) - state.time)}`;
    const bits: string[] = [];
    if (r.pregnancy) bits.push(`Expecting · due in ${duration(r.pregnancy.dueAt - state.time)}`);
    if (r.courtship) {
      const partner = state.residents.find((x) => x.id === r.courtship?.partnerId);
      if (partner) bits.push(`Falling for ${partner.firstName} (${Math.round((r.courtship.progress / courtshipSeconds(content, r, partner)) * 100)}%)`);
    }
    return bits.join(' · ');
  }

  private residentCard(r: Resident, detailed: boolean): HTMLElement {
    const { state, content } = this.game;
    const room = r.roomId !== null ? state.rooms.find((x) => x.id === r.roomId) : undefined;
    const child = isChild(state, r);
    const where = r.dead ? '☠ Fallen' : r.waiting ? 'At the door' : child ? 'Child' : room ? roomDef(content, room).name : 'Idle';
    const eff = effectiveStats(content, r);
    const top = topStats(eff);
    const max = r.maxHp;
    const hpPct = Math.max(0, (r.hp / max) * 100);
    const taintPct = Math.min(100, (r.taint / max) * 100);
    const stats = h(
      'div',
      { class: 'stats' },
      ...STAT_KEYS.map((k) =>
        h('span', { class: `${top.includes(k) ? 'hi' : ''}${eff[k] > r.stats[k] ? ' boosted' : ''}`, title: `${STAT_NAME[k]} ${r.stats[k]}${eff[k] > r.stats[k] ? ` +${eff[k] - r.stats[k]} from outfit` : ''}` }, `${STAT_LABEL[k]} ${eff[k]}`),
      ),
    );
    const rarityTag = r.rarity !== 'common' ? h('span', { class: `rarity ${r.rarity}` }, r.rarity === 'legendary' ? '★' : '◆') : null;
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
      h('div', { class: 'row' }, h('b', {}, rarityTag, ` ${r.firstName} ${r.lastName}`), h('span', { class: 'muted' }, `L${r.level} · ${where}`)),
      stats,
      h('div', { class: 'hpbar' }, h('div', { class: 'hp', style: `width:${hpPct}%` }), h('div', { class: 'taint', style: `width:${taintPct}%` })),
    );
    const status = this.statusLine(r);
    if (status && !r.dead) card.append(h('div', { class: 'muted', style: 'margin-top:4px' }, status));
    if (!detailed) return card;

    const stop = (fn: () => void) => (e: Event) => {
      e.stopPropagation();
      fn();
    };
    const next = xpToNext(content, r.level);
    card.append(
      h(
        'div',
        { class: 'row muted' },
        h('span', {}, `HP ${Math.ceil(r.hp)}/${Math.ceil(effectiveMaxHp(r))}`),
        h('span', {}, `Mood ${Math.round(r.happiness)}%`),
        h('span', {}, `XP ${Math.floor(r.xp)}/${next}`),
      ),
    );
    const parents = [r.motherId, r.fatherId].map((id) => state.residents.find((x) => x.id === id)).filter((x): x is Resident => !!x);
    if (parents.length) card.append(h('div', { class: 'muted' }, `Child of ${parents.map((p) => p.firstName).join(' & ')}`));

    // Gear
    const weapon = r.weapon ? content.weapons[r.weapon] : undefined;
    const outfit = r.outfit ? content.outfits[r.outfit] : undefined;
    const gearRow = (label: string, text: string, slot: 'weapon' | 'outfit', equipped: boolean) =>
      h(
        'div',
        { class: 'row gear' },
        h('span', {}, h('span', { class: 'muted' }, `${label}: `), text),
        h(
          'span',
          {},
          !r.dead && !child
            ? h(
                'button',
                {
                  class: 'close',
                  onclick: stop(() => {
                    this.equipFor = { residentId: r.id, slot };
                    const keep = r.id;
                    this.openPanel('storage');
                    this.equipFor = { residentId: keep, slot };
                    this.renderPanel(true);
                  }),
                },
                'Change',
              )
            : '',
          equipped
            ? h(
                'button',
                {
                  class: 'close',
                  onclick: stop(() => {
                    const res = this.game.run({ type: 'unequip', residentId: r.id, slot });
                    if (!res.ok) this.toast(res.reason, 'bad');
                    this.renderPanel(true);
                  }),
                },
                'Remove',
              )
            : '',
        ),
      );
    card.append(
      gearRow('Weapon', weapon ? `${weapon.name} (${weapon.min}–${weapon.max} dmg)` : 'Fists (1 dmg)', 'weapon', !!weapon),
      gearRow('Outfit', outfit ? `${outfit.name} (${bonusText(outfit.bonus)})` : 'Halcyon jumpsuit', 'outfit', !!outfit),
    );

    const actions: HTMLElement[] = [];
    if (r.dead) {
      actions.push(
        h(
          'button',
          {
            class: 'primary',
            onclick: stop(() => {
              const res = this.game.run({ type: 'revive', residentId: r.id });
              this.toast(res.ok ? `${r.firstName} is back on their feet.` : res.reason, res.ok ? 'good' : 'bad');
            }),
          },
          `Revive (${reviveCost(content, r)} scrip)`,
        ),
        h(
          'button',
          {
            class: 'danger',
            onclick: stop(() => {
              if (!confirm(`Lay ${r.firstName} to rest? This is permanent. Their gear goes to storage.`)) return;
              this.game.run({ type: 'layToRest', residentId: r.id });
              this.residentId = null;
            }),
          },
          'Lay to rest',
        ),
      );
    } else {
      if (r.hp < effectiveMaxHp(r) - 0.5)
        actions.push(h('button', { disabled: state.resources.medpatch < 1, onclick: stop(() => this.cmdToast({ type: 'heal', residentId: r.id }, 'Patched up.')) }, `✚ Med-Patch (${Math.floor(state.resources.medpatch)})`));
      if (r.taint > 0)
        actions.push(h('button', { disabled: state.resources.purge < 1, onclick: stop(() => this.cmdToast({ type: 'purge', residentId: r.id }, 'Glare-sickness purged.')) }, `☢ Purge (${Math.floor(state.resources.purge)})`));
    }
    if (actions.length) card.append(h('div', { class: 'row', style: 'justify-content:flex-start;flex-wrap:wrap;margin-top:6px' }, ...actions));
    return card;
  }

  private cmdToast(cmd: Parameters<Game['run']>[0], okText: string): void {
    const res = this.game.run(cmd);
    this.toast(res.ok ? okText : res.reason, res.ok ? 'good' : 'bad');
    this.renderPanel(true);
  }

  private residentsPanel(): HTMLElement {
    const { state, content } = this.game;
    const list = state.residents.filter((r) => !r.waiting);
    const key = this.sortBy;
    list.sort((a, b) => {
      if (key === 'name') return a.firstName.localeCompare(b.firstName);
      if (key === 'level') return b.level - a.level || a.id - b.id;
      return effectiveStats(content, b)[key] - effectiveStats(content, a)[key] || a.id - b.id;
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
    const idle = list.filter((r) => !r.dead && r.roomId === null && !isChild(state, r)).length;
    const kids = list.filter((r) => isChild(state, r)).length;
    // Selected resident first, expanded.
    const selected = list.find((r) => r.id === this.residentId);
    const rest = list.filter((r) => r.id !== this.residentId);
    return h(
      'div',
      { class: 'body' },
      h('div', { class: 'muted', style: 'margin-bottom:6px' }, `${list.length} residents · ${idle} idle${kids ? ` · ${kids} children` : ''}. Select one, then tap a room.`),
      tabs,
      selected ? this.residentCard(selected, true) : null,
      ...rest.map((r) => this.residentCard(r, false)),
    );
  }

  private storagePanel(): HTMLElement {
    const { state, content } = this.game;
    const target = this.equipFor ? state.residents.find((r) => r.id === this.equipFor?.residentId) : undefined;
    const slot = this.equipFor?.slot;
    const order = { legendary: 0, rare: 1, common: 2 } as const;
    const items = state.items
      .map((i) => ({ item: i, def: content.items[i.defId] }))
      .filter((x): x is { item: (typeof state.items)[number]; def: NonNullable<(typeof x)['def']> } => !!x.def)
      .filter((x) => !slot || x.def.kind === slot)
      .sort((a, b) => order[a.def.rarity] - order[b.def.rarity] || a.def.name.localeCompare(b.def.name));
    const header = target
      ? h(
          'div',
          { class: 'row' },
          h('b', {}, `Choose ${slot === 'weapon' ? 'a weapon' : 'an outfit'} for ${target.firstName}`),
          h('button', { class: 'close', onclick: () => ((this.equipFor = null), this.renderPanel(true)) }, 'Cancel'),
        )
      : h('p', { class: 'muted' }, 'Weapons help residents fight incidents. Outfits boost stats, which speeds up work and changes their best room. Equip from a resident\'s card, or sell spares here.');
    const rows = items.map(({ item, def }) =>
      h(
        'div',
        { class: 'list-item row' },
        h(
          'span',
          {},
          h('span', { class: `rarity ${def.rarity}` }, def.rarity === 'legendary' ? '★' : def.rarity === 'rare' ? '◆' : '•'),
          ` ${def.name} `,
          h('span', { class: 'muted' }, def.kind === 'weapon' ? `${def.min}–${def.max} dmg` : bonusText(def.bonus)),
        ),
        h(
          'span',
          {},
          target
            ? h(
                'button',
                {
                  class: 'primary close',
                  onclick: () => {
                    const res = this.game.run({ type: 'equip', residentId: target.id, itemId: item.id });
                    if (!res.ok) this.toast(res.reason, 'bad');
                    else this.toast(`${target.firstName} equipped ${def.name}`, 'good');
                    const who = target.id;
                    this.openPanel('residents');
                    this.residentId = who;
                    this.view.selectedResidentId = who;
                    this.renderPanel(true);
                  },
                },
                'Equip',
              )
            : '',
          ' ',
          h(
            'button',
            {
              class: 'close',
              onclick: () => {
                const res = this.game.run({ type: 'sell', itemId: item.id });
                if (res.ok) this.toast(`Sold ${def.name} for ${sellValue(content, def.id)} scrip`);
                this.renderPanel(true);
              },
            },
            `Sell ${sellValue(content, def.id)}`,
          ),
        ),
      ),
    );
    return h(
      'div',
      { class: 'body' },
      h('div', { class: 'row' }, h('b', {}, `${state.items.length}/${itemCapacity(state, content)} items`), h('span', { class: 'muted' }, 'Storerooms add space')),
      header,
      ...(rows.length ? rows : [h('p', { class: 'muted' }, 'Nothing here yet. Open Supply Crates to find gear.')]),
    );
  }

  private cratesPanel(): HTMLElement {
    const { state, content } = this.game;
    const c = content.balance.crates;
    const untilPity = Math.max(1, c.pityThreshold - state.pity);
    const tiers = (['legendary', 'rare', 'standard'] as const).map((tier) =>
      h(
        'div',
        { class: `list-item row crate-row ${tier}` },
        h('span', {}, h('span', { class: `crate-icon ${tier}` }), h('b', {}, TIER_NAME[tier]), h('span', { class: 'muted' }, ` × ${state.crates[tier]}`)),
        h('button', { class: 'primary', disabled: state.crates[tier] < 1, onclick: () => this.openCrate(tier) }, 'Open'),
      ),
    );
    return h(
      'div',
      { class: 'body' },
      ...tiers,
      h('div', { class: 'row', style: 'margin-top:10px' }, h('b', {}, 'Crate tokens'), h('span', {}, `${state.crateTokens}/${c.tokensPerCrate}`)),
      h('div', { class: 'progress' }, h('div', { style: `width:${(state.crateTokens / c.tokensPerCrate) * 100}%;background:var(--accent)` })),
      h('p', { class: 'muted' }, 'Tokens drop from collecting, rushing, stopping incidents, births and new arrivals. Every 10 tokens is a free crate.'),
      h('div', { class: 'row' }, h('b', {}, 'Luck meter'), h('span', {}, `Legendary guaranteed within ${untilPity} crate${untilPity > 1 ? 's' : ''}`)),
      h('div', { class: 'progress' }, h('div', { style: `width:${(state.pity / c.pityThreshold) * 100}%;background:var(--legendary)` })),
      h('div', { class: 'row', style: 'margin-top:10px' }, h('b', {}, 'Daily crate'), h('span', {}, `Streak ${state.daily.streak} day${state.daily.streak === 1 ? '' : 's'}`)),
      h('p', { class: 'muted' }, 'A crate every day you visit; every 7th day in a row is a Rare Crate. You also earn crates from population milestones, every 10th level a resident reaches, and silver and gold achievements.'),
    );
  }

  private openCrate(tier: CrateTier): void {
    const before = this.game.state.stats['cratesOpened'] ?? 0;
    let cards: CrateCard[] = [];
    const off = this.game.on((events) => {
      for (const ev of events) if (ev.type === 'crateOpened') cards = ev.cards;
    });
    const res = this.game.run({ type: 'openCrate', tier });
    off();
    if (!res.ok || (this.game.state.stats['cratesOpened'] ?? 0) === before) {
      this.toast(res.ok ? 'Could not open crate' : res.reason, 'bad');
      return;
    }
    this.showCrate(tier, cards);
    this.renderPanel(true);
  }

  private cardView(card: CrateCard, i: number): HTMLElement {
    const { state, content } = this.game;
    let rarity = 'common';
    let icon = '';
    let title = '';
    let sub = '';
    switch (card.kind) {
      case 'scrip':
        icon = '💰';
        title = `${card.amount} scrip`;
        rarity = card.amount >= 500 ? 'rare' : 'common';
        break;
      case 'resource':
        icon = { power: '⚡', food: '🥫', water: '💧', medpatch: '✚', purge: '☢' }[card.resource];
        title = `${card.amount} ${card.resource === 'medpatch' ? 'Med-Patch' : card.resource === 'purge' ? 'Purge' : card.resource}`;
        break;
      case 'tokens':
        icon = '🎟';
        title = `${card.amount} crate tokens`;
        break;
      case 'item': {
        const def = content.items[card.defId];
        rarity = card.rarity;
        icon = def?.kind === 'weapon' ? '🔫' : '🧥';
        title = def?.name ?? card.defId;
        sub = def ? (def.kind === 'weapon' ? `${def.min}–${def.max} dmg` : bonusText(def.bonus)) : '';
        if (card.sold) sub += ` · storage full, sold for ${card.sold}`;
        break;
      }
      case 'resident': {
        const r = state.residents.find((x) => x.id === card.residentId);
        rarity = card.rarity;
        icon = '🧑';
        title = r ? `${r.firstName} ${r.lastName}` : 'A new resident';
        sub = `${card.rarity} resident · waiting at the door`;
        break;
      }
    }
    return h(
      'div',
      { class: `crate-card ${rarity}`, style: `animation-delay:${i * 0.25}s` },
      h('div', { class: 'crate-card-inner' }, h('div', { class: 'face back' }), h('div', { class: 'face front' }, h('div', { class: 'card-icon' }, icon), h('b', {}, title), h('div', { class: 'muted' }, sub))),
    );
  }

  private showCrate(tier: CrateTier, cards: CrateCard[]): void {
    const { state } = this.game;
    const more = state.crates[tier] > 0;
    const close = () => this.modalHost.replaceChildren();
    this.modalHost.replaceChildren(
      h(
        'div',
        { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && close() },
        h(
          'div',
          { class: 'modal crate-modal' },
          h('h2', {}, TIER_NAME[tier]),
          h('div', { class: 'cards' }, ...cards.map((c, i) => this.cardView(c, i))),
          h(
            'div',
            { class: 'row', style: 'justify-content:flex-end;margin-top:12px;gap:8px' },
            more ? h('button', { onclick: () => this.openCrate(tier) }, `Open another (${state.crates[tier]})`) : null,
            h('button', { class: 'primary', onclick: close }, 'Nice!'),
          ),
        ),
      ),
    );
  }

  private achievementsPanel(): HTMLElement {
    const { state, content } = this.game;
    const total = content.achievements.length;
    const done = content.achievements.filter((a) => state.achievements[a.id] !== undefined).length;
    const reward = content.balance.crates.achievementReward as Record<string, string | null>;
    const items = content.achievements.map((a) => {
      const got = state.achievements[a.id] !== undefined;
      const hidden = a.hidden && !got;
      const p = achievementProgress(state, a);
      const prize = reward[a.tier];
      return h(
        'div',
        { class: `list-item ach${got ? '' : ' locked'}` },
        h('div', { class: `medal ${a.tier}` }, got ? '★' : ''),
        h(
          'div',
          { style: 'flex:1' },
          h('div', { class: 'row', style: 'margin:0' }, h('b', {}, hidden ? '???' : a.name), prize && !hidden ? h('span', { class: 'muted' }, `📦 ${prize}`) : null),
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
      h(
        'div',
        { class: 'row', style: 'flex-wrap:wrap;justify-content:flex-start' },
        h('button', { onclick: () => (this.game.save(), this.toast('Saved', 'good')) }, 'Save now'),
        h('button', { onclick: () => downloadFile(`homestead-${this.game.state.homesteadNumber}.json`, this.game.exportSave()) }, 'Export save'),
        h('button', { onclick: () => fileInput.click() }, 'Import save'),
        fileInput,
      ),
      h(
        'div',
        { class: 'row', style: 'margin-top:18px' },
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
      h('p', { class: 'muted', style: 'margin-top:18px' }, 'Homestead is an early prototype (milestone M2). Placeholder art. Developer console: window.homestead'),
    );
  }

  // ---------------------------------------------------------------- events & feedback

  private name(id: number): string {
    const r = this.game.state.residents.find((x) => x.id === id);
    return r ? r.firstName : 'Someone';
  }

  private onEvents(events: GameEvent[]): void {
    const { content } = this.game;
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
          this.toast(INCIDENT_TOAST[ev.incident] ?? 'Incident!', 'bad');
          break;
        case 'doorBreached':
          this.toast('The raiders broke through the door!', 'bad');
          break;
        case 'incidentResolved':
          if (ev.incident === 'rustmen') this.toast(ev.loot > 0 ? `Raiders repelled! Recovered ${ev.loot} scrip.` : 'The raiders got away with their loot.', ev.loot > 0 ? 'good' : 'bad');
          else if (!this.game.state.incidents.some((i) => i.type === ev.incident)) this.toast(`${content.balance.incidents.types[ev.incident].name} dealt with.`, 'good');
          break;
        case 'residentDied':
          this.toast(`${this.name(ev.residentId)} has fallen. Revive them from Residents.`, 'bad');
          break;
        case 'pregnancy':
          this.toast(`💕 ${this.name(ev.motherId)} and ${this.name(ev.fatherId)} are expecting!`, 'good');
          break;
        case 'birth':
          this.toast(`👶 ${this.name(ev.motherId)} had a baby: welcome, ${this.name(ev.childId)}!`, 'gold');
          break;
        case 'grewUp':
          this.toast(`${this.name(ev.residentId)} is all grown up and ready to work.`, 'good');
          break;
        case 'residentArrived':
          if (ev.source !== 'crate') this.toast(ev.source === 'radio' ? `📻 ${this.name(ev.residentId)} heard your broadcast and is at the door.` : `A stranger, ${this.name(ev.residentId)}, is knocking at the door.`);
          break;
        case 'crateEarned':
          this.toast(`📦 ${TIER_NAME[ev.tier]} earned (${ev.source})`, ev.tier === 'standard' ? 'good' : 'gold');
          break;
        case 'storageFull': {
          const d = content.items[ev.defId];
          this.toast(`Storage full: sold ${d?.name ?? 'an item'} for ${ev.sold} scrip. Build a Storeroom!`, 'bad');
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
      h('p', {}, `HALCY here! Congratulations on your appointment as Warden of Halcyon Homestead ${n}. Your founding residents are waiting at the door, and Halcyon has sent a few Supply Crates to get you started.`),
      h('p', { class: 'muted' }, '1. Tap the door to let them in.  2. Drag residents into rooms that match their best stat (highlighted in green).  3. Tap rooms to collect power, food and water.  4. Open your Supply Crates and arm your residents.  5. Build more rooms to grow.'),
    );
  }

  private showAwaySummary(): void {
    const s = this.game.lastCatchUp;
    if (!s) return;
    this.game.lastCatchUp = null;
    const extras = [s.births ? `${s.births} baby${s.births > 1 ? ' babies were' : ' was'} born.` : '', s.arrivals ? `${s.arrivals} new arrival${s.arrivals > 1 ? 's are' : ' is'} at the door.` : '']
      .filter(Boolean)
      .join(' ');
    this.modal(
      'While you were away',
      h('p', {}, `${duration(s.seconds)} passed. ${s.readyRooms} room${s.readyRooms === 1 ? ' is' : 's are'} ready to collect. ${extras}`),
      s.cappedAt ? h('p', { class: 'muted' }, `Offline progress is capped at ${duration(s.cappedAt)}.`) : '',
      h('p', { class: 'muted' }, 'Your homestead is safe while you are gone: no incidents, no shortage damage.'),
    );
  }
}

function bonusText(bonus: Partial<Record<StatKey, number>>): string {
  return Object.entries(bonus)
    .map(([k, v]) => `+${v} ${STAT_NAME[k as StatKey]}`)
    .join(', ');
}

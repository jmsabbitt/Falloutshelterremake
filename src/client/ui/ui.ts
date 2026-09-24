// DOM interface over the Pixi view: HUD, toolbar, side panels, toasts, hints.

import {
  achievementProgress,
  buildCost,
  canCraft,
  canExplore,
  canReforge,
  carriedCount,
  combatDamage,
  craftSeconds,
  craftTimeLeft,
  crewCraftStat,
  fragmentsNeeded,
  isAway,
  knowsRecipe,
  recipeFor,
  reforgeChance,
  reforgeCost,
  salvageCount,
  scrapPreview,
  secondsUntilHome,
  workersInRoom,
  workshopRecipes,
  CARRY_LIMIT,
  MAX_EXPLORERS,
  MAX_SUPPLIES,
  SALVAGE_CAP,
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
  type Expedition,
  type ExpeditionLoot,
  type GameEvent,
  type Item,
  type ItemDef,
  type JournalEntry,
  type Rarity,
  type Recipe,
  type Resident,
  type Room,
  type StatKey,
} from '../../sim';
import type { Content } from '../../sim';
import type { Game } from '../game';
import type { QuestView } from '../render/questView';
import type { VaultView } from '../render/vaultView';
import { downloadFile } from '../storage';
import { duration, fmt, h, morph } from './dom';
import { QuestUI } from './quests';

type PanelKind = 'build' | 'room' | 'residents' | 'storage' | 'crates' | 'explore' | 'quests' | 'achievements' | 'menu' | null;
type StorageTab = 'items' | 'salvage' | 'blueprints';

/** Draft of the send-to-explore modal. */
interface ExploreDraft {
  residentId: number | null;
  regionId: string;
  medpatch: number;
  purge: number;
}

interface RegionInfo {
  id: string;
  name: string;
  description: string;
  danger: number;
}

const RARITY_ORDER: Record<Rarity, number> = { legendary: 0, rare: 1, common: 2 };
const RARITY_MARK: Record<Rarity, string> = { legendary: '★', rare: '◆', common: '•' };
/** Fallback for the reforge pity streak if the crafting tuning does not say. */
const REFORGE_PITY = 3;
const EXPEDITION_STATUS: Record<Expedition['status'], string> = {
  exploring: 'Exploring',
  returning: 'Heading home',
  returned: 'Home',
  dead: 'Fallen',
};

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
  /** What the open panel is showing; a change means a fresh render rather than a patch. */
  private panelKey = '';
  private storageTab: StorageTab = 'items';
  /** Item ids picked for reforging; null when not in reforge mode. */
  private reforgeSel: number[] | null = null;
  /** Expeditions whose journal is expanded. */
  private openJournals = new Set<number>();
  /** Expedition id -> resident id, kept after an expedition is removed so late events can name them. */
  private explorerOf = new Map<number, number>();
  private exploreDraft: ExploreDraft | null = null;
  /** M4: quests panel, party picker and the quest screen. */
  readonly quests: QuestUI;

  constructor(
    private game: Game,
    private view: VaultView,
    questView: QuestView,
  ) {
    this.root = document.getElementById('ui') as HTMLElement;
    this.root.append(this.hud, this.toasts, this.panelHost, this.hint, this.toolbar, this.modalHost);
    this.quests = new QuestUI(
      {
        game,
        modalHost: this.modalHost,
        toast: (text, kind) => this.toast(text, kind),
        openQuests: () => this.openPanel('quests'),
        refreshPanel: () => this.renderPanel(true),
        openBuild: () => this.openPanel('build'),
      },
      questView,
      view,
      this.root,
    );
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
    if (room.job && room.job.remaining === 0) {
      const res = this.game.run({ type: 'collectCraft', roomId: room.id });
      if (!res.ok) {
        this.toast(res.reason, 'bad');
        this.openRoom(room.id);
      }
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
    if (this.game.lastCatchUp) this.showAwaySummary();
    this.renderHud();
    this.renderHint();
    this.renderToolbar();
    this.quests.update();
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
    const ready = state.rooms.filter((r) => r.ready).length;
    const info = h(
      'div',
      { class: 'hud-part' },
      h('div', { class: 'title' }, `HOMESTEAD ${state.homesteadNumber}`),
      meter('power', 'var(--power)', 'P', powerDemandPerMin(state, content)),
      meter('food', 'var(--food)', 'F', foodDemandPerMin(state, content)),
      meter('water', 'var(--water)', 'W', waterDemandPerMin(state, content)),
      h('div', { class: 'stat-chip' }, 'Scrip ', h('b', {}, fmt(state.scrip))),
      h('div', { class: 'stat-chip' }, 'Pop ', h('b', {}, `${pop}/${cap}`)),
      h('div', { class: 'stat-chip' }, 'Mood ', h('b', {}, pop > 0 ? `${Math.round(vaultHappiness(state))}%` : '—')),
      h('div', { class: 'stat-chip', title: 'Med-Patches / Purge' }, '✚ ', h('b', {}, `${Math.floor(state.resources.medpatch)}`), ' ☢ ', h('b', {}, `${Math.floor(state.resources.purge)}`)),
    );
    const tokens = Math.round((state.crateTokens / content.balance.crates.tokensPerCrate) * 100);
    const buttons = h(
      'div',
      { class: 'hud-part' },
      h(
        'button',
        { class: `stat-chip chip-button${crates ? ' glow' : ''}`, title: 'Supply Crates', onclick: () => this.openPanel('crates') },
        '📦 ',
        h('b', {}, `${crates}`),
        h('span', { class: 'token-mini' }, h('span', { style: `width:${tokens}%` })),
      ),
      h(
        'button',
        {
          class: `stat-chip chip-button collect-chip${ready ? ' glow' : ''}`,
          title: 'Collect everything that is ready',
          onclick: () => {
            const res = this.game.run({ type: 'collectAll' });
            if (res.ok && res.detail?.startsWith('0')) this.toast('Nothing ready yet');
          },
        },
        '⤓ Collect',
        ready ? h('b', {}, ` ${ready}`) : null,
      ),
      this.quests.hudChip(),
    );
    // The meters change nearly every frame. Patch in place, and keep the buttons
    // in their own part so they are only touched when their own markup changes.
    if (!this.hud.firstChild) this.hud.append(h('div', { class: 'hud-part' }), h('div', { class: 'hud-part' }));
    const [infoHost, buttonHost] = [this.hud.children[0], this.hud.children[1]] as HTMLElement[];
    if (infoHost && infoHost.innerHTML !== info.innerHTML) morph(infoHost, info);
    if (buttonHost && buttonHost.innerHTML !== buttons.innerHTML) morph(buttonHost, buttons);
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
    } else if (state.residents.some((r) => !r.waiting && !r.dead && !isAway(r) && r.roomId === null && !isChild(state, r))) {
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
    const homeOrFallen = state.expeditions.filter((e) => e.status === 'returned' || e.status === 'dead').length;
    const office = this.quests.hasOffice();
    const questNeed = this.quests.attention();
    const key = `${this.panel}|${crates}|${state.items.length}|${homeOrFallen}|${window.innerWidth < 640}|${office}|${questNeed}`;
    if (key === this.lastToolbarKey) return;
    this.lastToolbarKey = key;
    const btn = (label: string, kind: PanelKind, extra = '', badge?: number) =>
      h(
        'button',
        {
          class: `${this.panel === kind ? 'active' : ''} ${extra}`,
          onclick: () => {
            if (this.panel === kind) this.closePanel();
            else this.openPanel(kind);
          },
        },
        label,
        badge ? h('span', { class: 'badge' }, badge) : null,
      );
    // Phones get short labels so all eight buttons fit at 390 px.
    const phone = window.innerWidth < 640;
    this.toolbar.replaceChildren(
      btn('Build', 'build', 'primary'),
      btn(phone ? 'People' : 'Residents', 'residents'),
      btn(phone ? 'Items' : 'Storage', 'storage'),
      btn('Crates', 'crates', '', crates),
      btn(phone ? '🧭' : 'Explore', 'explore', '', homeOrFallen),
      ...(office ? [btn('Quests', 'quests', '', questNeed)] : []),
      btn(phone ? '🏆' : 'Goals', 'achievements'),
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
    if (kind !== 'storage') {
      this.equipFor = null;
      this.reforgeSel = null;
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
    // Set the room first: openPanel renders, and a room panel with no room closes itself.
    this.roomId = id;
    this.openPanel('room');
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
      explore: 'The Glarelands',
      quests: 'Quests',
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
      case 'explore':
        body = this.explorePanel();
        break;
      case 'quests':
        body = this.quests.panel();
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
    // Same view: patch the live panel in place, which keeps the nodes under the
    // finger and the scroll position. A different view starts fresh at the top.
    const key = `${this.panel}|${this.roomId}|${this.storageTab}|${this.equipFor ? 'equip' : ''}`;
    if (old && key === this.panelKey) morph(old, panel);
    else this.panelHost.replaceChildren(panel);
    this.panelKey = key;
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

    if (def.category === 'workshop') parts.push(...this.workshopSection(room));
    if (def.category === 'office') parts.push(...this.quests.officeSection());

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
              def.stat
                ? h('b', {}, `${STAT_LABEL[def.stat]} ${effectiveStats(content, r)[def.stat]}`)
                : def.category === 'workshop'
                  ? h('b', {}, topStats(effectiveStats(content, r)).slice(0, 2).map((k) => `${STAT_LABEL[k]} ${effectiveStats(content, r)[k]}`).join(' '))
                  : h('b', {}, `DMG ${combatDamage(content, r)}`),
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
    const away = isAway(r);
    const where = away ? (r.quest !== null ? '⚔ On a quest' : r.dead ? '☠ Fallen outside' : '🧭 Glarelands') : r.dead ? '☠ Fallen' : r.waiting ? 'At the door' : child ? 'Child' : room ? roomDef(content, room).name : 'Idle';
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
          !r.dead && !child && !away
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
          equipped && !away
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
    if (away) {
      // Out in the Glarelands: everything is managed from the expedition card.
      if (r.quest !== null) actions.push(h('button', { class: 'primary', onclick: stop(() => this.openPanel('quests')) }, 'View quest'));
      else actions.push(h('button', { class: 'primary', onclick: stop(() => this.openPanel('explore')) }, 'View expedition'));
    } else if (r.dead) {
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
    const exploreWhy = !away && !r.dead ? canExplore(state, content, r) : undefined;
    if (exploreWhy !== undefined) {
      actions.push(
        h(
          'button',
          { disabled: exploreWhy !== null, title: exploreWhy ?? 'Send out into the Glarelands', onclick: stop(() => this.showExploreModal(r.id)) },
          '🧭 Explore',
        ),
      );
    }
    if (actions.length) card.append(h('div', { class: 'row', style: 'justify-content:flex-start;flex-wrap:wrap;margin-top:6px' }, ...actions));
    if (exploreWhy) card.append(h('div', { class: 'muted small' }, `Can't explore: ${exploreWhy}`));
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
    const idle = list.filter((r) => !r.dead && !isAway(r) && r.roomId === null && !isChild(state, r)).length;
    const exploring = list.filter((r) => isAway(r)).length;
    const kids = list.filter((r) => isChild(state, r)).length;
    // Selected resident first, expanded.
    const selected = list.find((r) => r.id === this.residentId);
    const rest = list.filter((r) => r.id !== this.residentId);
    return h(
      'div',
      { class: 'body' },
      h('div', { class: 'muted', style: 'margin-bottom:6px' }, `${list.length} residents · ${idle} idle${exploring ? ` · ${exploring} exploring` : ''}${kids ? ` · ${kids} children` : ''}. Select one, then tap a room.`),
      tabs,
      selected ? this.residentCard(selected, true) : null,
      ...rest.map((r) => this.residentCard(r, false)),
    );
  }

  // ---------------------------------------------------------------- storage

  private storagePanel(): HTMLElement {
    const { state } = this.game;
    // Picking gear for someone always happens on the Items tab.
    const tab: StorageTab = this.equipFor ? 'items' : this.storageTab;
    const salvageUnits = Object.values(state.salvage).reduce((a, b) => a + b, 0);
    const blueprints = state.recipes.length;
    const tabBtn = (id: StorageTab, label: string) =>
      h(
        'button',
        {
          class: tab === id ? 'active' : '',
          onclick: () => {
            this.storageTab = id;
            this.equipFor = null;
            if (id !== 'items') this.reforgeSel = null;
            this.renderPanel(true);
          },
        },
        label,
      );
    const tabs = h(
      'div',
      { class: 'tabs storage-tabs' },
      tabBtn('items', `Items ${state.items.length}`),
      tabBtn('salvage', `Salvage ${fmt(salvageUnits)}`),
      tabBtn('blueprints', `Blueprints ${blueprints}`),
    );
    const body = tab === 'items' ? this.itemsTab() : tab === 'salvage' ? this.salvageTab() : this.blueprintsTab();
    return h('div', { class: 'body' }, tabs, ...body);
  }

  private itemsTab(): HTMLElement[] {
    const { state, content } = this.game;
    const target = this.equipFor ? state.residents.find((r) => r.id === this.equipFor?.residentId) : undefined;
    const slot = this.equipFor?.slot;
    const reforging = this.reforgeSel !== null && !target;
    // Drop picks that no longer exist (sold, scrapped, equipped).
    const sel = (this.reforgeSel ?? []).filter((id) => state.items.some((i) => i.id === id));
    if (this.reforgeSel) this.reforgeSel = sel;
    const firstDef = sel.length ? content.items[state.items.find((i) => i.id === sel[0])?.defId ?? ''] : undefined;

    const items = state.items
      .map((i) => ({ item: i, def: content.items[i.defId] }))
      .filter((x): x is { item: Item; def: ItemDef } => !!x.def)
      .filter((x) => !slot || x.def.kind === slot)
      .sort((a, b) => RARITY_ORDER[a.def.rarity] - RARITY_ORDER[b.def.rarity] || a.def.name.localeCompare(b.def.name));

    const header = target
      ? h(
          'div',
          { class: 'row' },
          h('b', {}, `Choose ${slot === 'weapon' ? 'a weapon' : 'an outfit'} for ${target.firstName}`),
          h('button', { class: 'close', onclick: () => ((this.equipFor = null), this.renderPanel(true)) }, 'Cancel'),
        )
      : reforging
        ? this.reforgeBar(sel, firstDef)
        : h(
            'div',
            {},
            h('p', { class: 'muted' }, "Weapons help residents fight incidents. Outfits boost stats. Equip from a resident's card; sell or scrap spares here."),
            h(
              'div',
              { class: 'row', style: 'justify-content:flex-start' },
              h(
                'button',
                {
                  class: 'close nowrap',
                  disabled: items.length < 3,
                  title: 'Combine three items of the same kind and rarity for a chance at a better one',
                  onclick: () => {
                    this.reforgeSel = [];
                    this.renderPanel(true);
                  },
                },
                '⚗ Reforge…',
              ),
              h('span', { class: 'muted small' }, 'Scrap breaks an item into salvage for crafting.'),
            ),
          );

    const rows = items.map(({ item, def }) => {
      const stats = h('span', { class: 'muted' }, def.kind === 'weapon' ? `${def.min}–${def.max} dmg` : bonusText(def.bonus));
      const label = h('span', { class: 'item-name' }, h('span', { class: `rarity ${def.rarity}` }, RARITY_MARK[def.rarity]), ` ${def.name} `, stats);
      if (reforging) {
        const picked = sel.includes(item.id);
        const fits = !firstDef || (firstDef.kind === def.kind && firstDef.rarity === def.rarity);
        const usable = picked || (fits && sel.length < 3);
        return h(
          'div',
          {
            class: `list-item row pick${picked ? ' selected' : ''}${usable ? '' : ' locked'}`,
            onclick: () => {
              if (!usable) return;
              this.reforgeSel = picked ? sel.filter((id) => id !== item.id) : [...sel, item.id];
              this.renderPanel(true);
            },
          },
          label,
          h('span', { class: `check${picked ? ' on' : ''}` }, picked ? '✓' : ''),
        );
      }
      const preview = scrapText(content, scrapPreview(content, def.id));
      return h(
        'div',
        { class: 'list-item row' },
        label,
        h(
          'span',
          { class: 'item-actions' },
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
            : null,
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
          target
            ? null
            : h(
                'button',
                {
                  class: 'close',
                  title: preview ? `Scrap for about: ${preview}` : 'Break down into salvage',
                  onclick: () => {
                    if (def.rarity !== 'common' && !confirm(`Scrap ${def.name}?${preview ? ` You get about ${preview}.` : ''}`)) return;
                    const res = this.game.run({ type: 'scrap', itemId: item.id });
                    if (!res.ok) this.toast(res.reason, 'bad');
                    this.renderPanel(true);
                  },
                },
                'Scrap',
              ),
        ),
      );
    });
    return [
      h('div', { class: 'row' }, h('b', {}, `${state.items.length}/${itemCapacity(state, content)} items`), h('span', { class: 'muted' }, 'Storerooms add space')),
      header,
      ...(rows.length ? rows : [h('p', { class: 'muted' }, 'Nothing here yet. Open Supply Crates or explore the Glarelands to find gear.')]),
    ];
  }

  /** Reforge mode header: what is picked, the cost, the odds and the confirm button. */
  private reforgeBar(sel: number[], first: ItemDef | undefined): HTMLElement {
    const { state, content } = this.game;
    const cost = first ? reforgeCost(content, first.rarity) : 0;
    const odds = first ? reforgeChance(state, content, first.rarity) : 0;
    const pityAfter = (content.crafting as { tuning?: { reforge?: { pityAfter?: number } } }).tuning?.reforge?.pityAfter ?? REFORGE_PITY;
    const pityLeft = Math.max(1, pityAfter - state.reforgePity);
    const why = sel.length === 3 ? canReforge(state, content, sel) : null;
    const next: Record<Rarity, string> = { common: 'rare', rare: 'legendary', legendary: 'legendary' };
    const outcome = !first
      ? 'Pick three items of the same kind (weapon or outfit) and rarity.'
      : first.rarity === 'legendary'
        ? 'Three legendaries reroll into a different legendary.'
        : odds >= 1
          ? `Lucky streak: this reforge is guaranteed to give a ${next[first.rarity]} ${first.kind}.`
          : `${Math.round(odds * 100)}% chance of a ${next[first.rarity]} ${first.kind}; otherwise a different ${first.rarity} one. ` +
            `Upgrade guaranteed within ${pityLeft} ${pityLeft === 1 ? 'try' : 'tries'}.`;
    const short = state.scrip < cost;
    return h(
      'div',
      { class: 'reforge-bar' },
      h(
        'div',
        { class: 'row', style: 'margin-top:0' },
        h('b', {}, `⚗ Reforge · ${sel.length}/3 picked`),
        h('button', { class: 'close', onclick: () => ((this.reforgeSel = null), this.renderPanel(true)) }, 'Cancel'),
      ),
      h('div', { class: 'muted' }, outcome),
      why ? h('div', { class: 'muted small short' }, why) : null,
      h(
        'div',
        { class: 'row' },
        h('span', { class: short && first ? 'short' : '' }, first ? `Cost ${fmt(cost)} scrip` : ''),
        h(
          'button',
          {
            class: 'primary',
            disabled: sel.length !== 3 || !!why,
            title: why ?? 'Reforge these three',
            onclick: () => {
              const res = this.game.run({ type: 'reforge', itemIds: sel });
              if (!res.ok) this.toast(res.reason, 'bad');
              else this.reforgeSel = [];
              this.renderPanel(true);
            },
          },
          'Reforge',
        ),
      ),
    );
  }

  private salvageTab(): HTMLElement[] {
    const { state, content } = this.game;
    const materials: string[] = [];
    for (const s of content.salvageList) if (!materials.includes(s.material)) materials.push(s.material);
    const total = Object.values(state.salvage).reduce((a, b) => a + b, 0);
    const groups = materials.map((m) => {
      const list = content.salvageList.filter((s) => s.material === m).sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]);
      const sum = list.reduce((a, s) => a + salvageCount(state, s.id), 0);
      return h(
        'div',
        { class: `list-item salvage-group${sum ? '' : ' empty'}` },
        h('div', { class: 'row', style: 'margin:0 0 4px' }, h('b', {}, capitalize(m)), h('span', { class: 'muted' }, `${sum}`)),
        h(
          'div',
          { class: 'salvage-cells' },
          ...list.map((s) => {
            const n = salvageCount(state, s.id);
            return h(
              'div',
              { class: `salvage-cell ${s.rarity}${n ? '' : ' none'}`, title: `${s.name} (${s.rarity}): ${n}/${SALVAGE_CAP}` },
              h('span', { class: `rarity ${s.rarity}` }, RARITY_MARK[s.rarity]),
              h('span', { class: 'sname' }, s.name),
              h('b', {}, `${n}`),
            );
          }),
        ),
      );
    });
    return [
      h('div', { class: 'row' }, h('b', {}, `${fmt(total)} salvage`), h('span', { class: 'muted' }, `Own bin · up to ${SALVAGE_CAP} each`)),
      h('p', { class: 'muted', style: 'margin-top:0' }, 'Explorers bring salvage home from the Glarelands, and scrapping items breaks them down. Workshops turn it into gear.'),
      ...groups,
    ];
  }

  private blueprintsTab(): HTMLElement[] {
    const { state, content } = this.game;
    const special = Object.values(content.items)
      .filter((d) => d.rarity !== 'common')
      .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.name.localeCompare(b.name));
    const known = special.filter((d) => knowsRecipe(state, content, d.id));
    const partial = special.filter((d) => !knowsRecipe(state, content, d.id) && (state.fragments[d.id] ?? 0) > 0);
    const unseen = special.length - known.length - partial.length;
    const where = (d: ItemDef) => {
      const r = recipeFor(content, d.id);
      const shop = r ? content.rooms[r.workshop]?.name : content.rooms[d.kind === 'weapon' ? 'weaponshop' : 'outfitshop']?.name;
      return `${shop ?? 'Workshop'}${r ? ` · level ${r.minLevel}` : ''}`;
    };
    const line = (d: ItemDef, extra: HTMLElement | string) =>
      h(
        'div',
        { class: 'list-item' },
        h('div', { class: 'row', style: 'margin:0' }, h('span', {}, h('span', { class: `rarity ${d.rarity}` }, RARITY_MARK[d.rarity]), ` ${d.name}`), extra),
        h('div', { class: 'muted small' }, `${d.kind === 'weapon' ? `${d.min}–${d.max} dmg` : bonusText(d.bonus)} · ${where(d)}`),
      );
    const out: HTMLElement[] = [
      h('p', { class: 'muted', style: 'margin-top:0' }, 'Common recipes are always known. Rare and legendary ones need blueprint fragments: explorers find them, and scrapping an item you cannot craft yet gives one toward it.'),
    ];
    if (partial.length) {
      out.push(h('h3', { class: 'group' }, 'Fragments'));
      for (const d of partial) {
        const have = state.fragments[d.id] ?? 0;
        const need = Math.max(1, fragmentsNeeded(content, d.id));
        out.push(
          h(
            'div',
            { class: 'list-item' },
            h('div', { class: 'row', style: 'margin:0' }, h('span', {}, h('span', { class: `rarity ${d.rarity}` }, RARITY_MARK[d.rarity]), ` ${d.name}`), h('b', {}, `📜 ${have}/${need}`)),
            h('div', { class: 'progress' }, h('div', { style: `width:${Math.min(100, (have / need) * 100)}%;background:var(--${d.rarity})` })),
          ),
        );
      }
    }
    out.push(h('h3', { class: 'group' }, `Known recipes ${known.length}/${special.length}`));
    if (known.length) out.push(...known.map((d) => line(d, h('span', { class: 'ok-text' }, '✓ known'))));
    else out.push(h('p', { class: 'muted' }, 'No rare or legendary recipes yet.'));
    if (unseen > 0) out.push(h('p', { class: 'muted' }, `${unseen} more blueprint${unseen === 1 ? '' : 's'} still out there.`));
    return out;
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
      h('p', { class: 'muted', style: 'margin-top:18px' }, 'Homestead is an early prototype (milestone M4). Placeholder art. Developer console: window.homestead'),
    );
  }

  // ---------------------------------------------------------------- Glarelands

  private regions(): RegionInfo[] {
    return (this.game.content.exploration.regions ?? []) as RegionInfo[];
  }

  private explorePanel(): HTMLElement {
    const { state, content } = this.game;
    const regions = this.regions();
    const eligible = state.residents.filter((r) => !r.waiting && canExplore(state, content, r) === null);
    const out = state.expeditions.length;
    const regionCards = regions.map((rg) => {
      const open = state.regionsUnlocked.includes(rg.id);
      const here = state.expeditions.filter((e) => e.regionId === rg.id).length;
      return h(
        'div',
        { class: `list-item region-card${open ? '' : ' locked'}` },
        h('div', { class: 'row', style: 'margin:0' }, h('b', {}, open ? rg.name : `🔒 ${rg.name}`), dangerPips(rg.danger)),
        h('div', { class: 'muted' }, rg.description),
        here ? h('div', { class: 'muted small', style: 'margin-top:4px' }, `${here} explorer${here === 1 ? '' : 's'} out here`) : null,
      );
    });
    const order: Record<Expedition['status'], number> = { returned: 0, dead: 1, returning: 2, exploring: 3 };
    const exps = [...state.expeditions].sort((a, b) => order[a.status] - order[b.status] || a.id - b.id);
    return h(
      'div',
      { class: 'body' },
      ...regionCards,
      h(
        'div',
        { class: 'row' },
        h('b', {}, `Explorers ${out}/${MAX_EXPLORERS}`),
        h(
          'button',
          { class: 'primary close', disabled: !eligible.length || out >= MAX_EXPLORERS, onclick: () => this.showExploreModal(null) },
          '🧭 Send explorer',
        ),
      ),
      ...(exps.length
        ? exps.map((e) => this.expeditionCard(e))
        : [
            h(
              'p',
              { class: 'muted' },
              eligible.length
                ? 'Nobody is out. Explorers bring home scrip, gear, salvage and blueprint fragments. The longer they stay out, the better the finds and the worse the danger.'
                : 'Nobody is out, and nobody can leave right now. Adults inside the homestead can be sent from their card in Residents.',
            ),
          ]),
    );
  }

  private expeditionCard(e: Expedition): HTMLElement {
    const { state, content } = this.game;
    const r = state.residents.find((x) => x.id === e.residentId);
    const name = r ? `${r.firstName} ${r.lastName}` : 'Unknown explorer';
    const region = this.regions().find((x) => x.id === e.regionId)?.name ?? e.regionId;
    const max = r?.maxHp ?? 1;
    const hp = r ? Math.max(0, r.hp) : 0;
    const taint = r?.taint ?? 0;
    const carried = carriedCount(e);
    // Recalling a fallen explorer brings the body home.
    const body = e.status === 'returning' && !!r?.dead;
    const statusText =
      e.status === 'exploring'
        ? `${duration(e.elapsed)} out`
        : e.status === 'returning'
          ? `${body ? 'body ' : ''}home in ${duration(secondsUntilHome(e))}`
          : e.status === 'returned'
            ? 'ready to collect'
            : `after ${duration(e.elapsed)}`;

    const actions: HTMLElement[] = [];
    if (e.status === 'exploring') {
      actions.push(h('button', { onclick: () => this.expCmd({ type: 'recall', expeditionId: e.id }) }, 'Recall'));
    } else if (e.status === 'returned') {
      actions.push(h('button', { class: 'primary', onclick: () => this.expCmd({ type: 'collectExpedition', expeditionId: e.id }) }, 'Collect'));
    } else if (e.status === 'dead' && r) {
      const cost = reviveCost(content, r);
      actions.push(
        h(
          'button',
          {
            class: 'primary',
            disabled: state.scrip < cost,
            onclick: () => this.expCmd({ type: 'revive', residentId: r.id }, `${r.firstName} is back on their feet and exploring.`),
          },
          `Revive (${fmt(cost)} scrip)`,
        ),
        h(
          'button',
          {
            class: 'danger',
            onclick: () => {
              if (!confirm(`Bring ${r.firstName}'s body home? Half of what they carried is lost.`)) return;
              this.expCmd({ type: 'recall', expeditionId: e.id });
            },
          },
          'Recall body',
        ),
      );
    }
    const open = this.openJournals.has(e.id);
    actions.push(
      h(
        'button',
        {
          class: 'close journal-toggle',
          onclick: () => {
            if (open) this.openJournals.delete(e.id);
            else this.openJournals.add(e.id);
            this.renderPanel(true);
          },
        },
        `Journal ${e.journal.length} ${open ? '▴' : '▾'}`,
      ),
    );

    const card = h(
      'div',
      { class: `list-item expedition ${e.status}` },
      h(
        'div',
        { class: 'row', style: 'margin:0' },
        h('b', {}, r && r.rarity !== 'common' ? h('span', { class: `rarity ${r.rarity}` }, RARITY_MARK[r.rarity]) : null, ` ${name}`, h('span', { class: 'muted' }, ` L${r?.level ?? 1}`)),
        h('span', { class: `status-pill ${body ? 'dead' : e.status}` }, body ? 'Carried home' : EXPEDITION_STATUS[e.status]),
      ),
      h('div', { class: 'muted small' }, `${region} · ${statusText}`),
      h('div', { class: 'hpbar' }, h('div', { class: 'hp', style: `width:${Math.min(100, (hp / max) * 100)}%` }), h('div', { class: 'taint', style: `width:${Math.min(100, (taint / max) * 100)}%` })),
      h(
        'div',
        { class: 'row muted small exp-stats' },
        h('span', {}, `HP ${Math.ceil(hp)}/${Math.ceil(r ? effectiveMaxHp(r) : 0)}`),
        h('span', { title: 'Glare-sickness' }, `Taint ${Math.ceil(taint)}`),
        h('span', { title: 'Med-Patches / Purge left' }, `✚ ${e.supplies.medpatch} ☢ ${e.supplies.purge}`),
        h('span', { class: carried >= CARRY_LIMIT ? 'short' : '', title: 'Carried items and salvage' }, `🎒 ${carried}/${CARRY_LIMIT}`),
      ),
      h('div', { class: 'loot-line' }, ...lootChips(e.loot)),
      h('div', { class: 'row', style: 'justify-content:flex-start;flex-wrap:wrap;margin-bottom:0' }, ...actions),
    );
    if (open) card.append(this.journalView(e));
    return card;
  }

  private journalView(e: Expedition): HTMLElement {
    const { content } = this.game;
    const found = e.loot.items
      .map((id) => content.items[id])
      .filter((d): d is ItemDef => !!d)
      .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
    const entries = [...e.journal].reverse().slice(0, 150);
    return h(
      'div',
      { class: 'journal' },
      found.length
        ? h(
            'div',
            { class: 'journal-loot' },
            ...[...new Set(found)].map((d) => {
              const n = found.filter((x) => x === d).length;
              return h('span', { class: `rarity ${d.rarity}` }, `${RARITY_MARK[d.rarity]} ${d.name}${n > 1 ? ` ×${n}` : ''}`);
            }),
          )
        : null,
      ...(entries.length
        ? entries.map((j) => h('div', { class: `jline ${j.kind}` }, h('span', { class: 'jt' }, clock(j.t)), h('span', {}, j.text)))
        : [h('div', { class: 'muted small' }, 'Nothing written yet.')]),
    );
  }

  /** Run an expedition command, toasting failures (success toasts come from events). */
  private expCmd(cmd: Parameters<Game['run']>[0], okText?: string): void {
    const res = this.game.run(cmd);
    if (!res.ok) this.toast(res.reason, 'bad');
    else if (okText) this.toast(okText, 'good');
    this.renderPanel(true);
  }

  private showExploreModal(residentId: number | null): void {
    const { state, content } = this.game;
    const first = residentId ?? state.residents.find((r) => !r.waiting && canExplore(state, content, r) === null)?.id ?? null;
    const open = this.regions().filter((rg) => state.regionsUnlocked.includes(rg.id));
    this.exploreDraft = {
      residentId: first,
      regionId: open[0]?.id ?? state.regionsUnlocked[0] ?? 'dustbowl',
      medpatch: Math.min(5, this.supplyMax('medpatch')),
      purge: Math.min(5, this.supplyMax('purge')),
    };
    this.renderExploreModal(residentId === null);
  }

  private supplyMax(kind: 'medpatch' | 'purge'): number {
    return Math.max(0, Math.min(MAX_SUPPLIES, Math.floor(this.game.state.resources[kind])));
  }

  private renderExploreModal(pickResident: boolean): void {
    const d = this.exploreDraft;
    if (!d) return;
    const { state, content } = this.game;
    const close = () => {
      this.exploreDraft = null;
      this.modalHost.replaceChildren();
    };
    const again = () => this.renderExploreModal(pickResident);
    const res = state.residents.find((r) => r.id === d.residentId);
    const why = res ? canExplore(state, content, res) : 'pick someone to send';

    let picker: HTMLElement | null = null;
    if (pickResident) {
      const eligible = state.residents.filter((r) => !r.waiting && canExplore(state, content, r) === null).sort((a, b) => b.level - a.level || a.id - b.id);
      const select = h(
        'select',
        {
          class: 'picker',
          onchange: (ev: Event) => {
            d.residentId = Number((ev.target as HTMLSelectElement).value);
            again();
          },
        },
        ...eligible.map((r) => h('option', { value: r.id, selected: r.id === d.residentId }, `${r.firstName} ${r.lastName} · L${r.level} · HP ${Math.ceil(r.hp)}`)),
      );
      picker = h('label', { class: 'field' }, h('span', { class: 'muted' }, 'Explorer'), select);
    }

    let summary: HTMLElement | null = null;
    if (res) {
      const eff = effectiveStats(content, res);
      const weapon = res.weapon ? content.weapons[res.weapon] : undefined;
      const outfit = res.outfit ? content.outfits[res.outfit] : undefined;
      summary = h(
        'div',
        { class: 'list-item explorer-summary' },
        h('div', { class: 'row', style: 'margin:0' }, h('b', {}, `${res.firstName} ${res.lastName}`), h('span', { class: 'muted' }, `L${res.level} · HP ${Math.ceil(res.hp)}/${Math.ceil(effectiveMaxHp(res))}`)),
        h('div', { class: 'stats' }, ...STAT_KEYS.map((k) => h('span', { class: k === 'fortune' || k === 'grit' ? 'hi' : '' }, `${STAT_LABEL[k]} ${eff[k]}`))),
        h('div', { class: 'muted small', style: 'margin-top:4px' }, `${weapon ? `${weapon.name} (${weapon.min}–${weapon.max} dmg)` : 'Fists (1 dmg)'} · ${outfit ? outfit.name : 'Halcyon jumpsuit'}`),
        h('div', { class: 'muted small' }, 'Every stat matters out there: Grit shrugs off the Glare, Fortune finds scrip, and a good weapon wins fights.'),
        res.hp < effectiveMaxHp(res) * 0.5 ? h('div', { class: 'small short', style: 'margin-top:4px' }, '⚠ Low on health. Patch them up before they go.') : null,
      );
    }

    const regions = this.regions().map((rg) => {
      const open = state.regionsUnlocked.includes(rg.id);
      return h(
        'div',
        {
          class: `list-item region-pick${d.regionId === rg.id ? ' selected' : ''}${open ? '' : ' locked'}`,
          onclick: () => {
            if (!open) return;
            d.regionId = rg.id;
            again();
          },
        },
        h('div', { class: 'row', style: 'margin:0' }, h('b', {}, open ? rg.name : `🔒 ${rg.name}`), dangerPips(rg.danger)),
        h('div', { class: 'muted small' }, rg.description),
      );
    });

    const stepper = (kind: 'medpatch' | 'purge', label: string) => {
      const max = this.supplyMax(kind);
      const set = (n: number) => {
        d[kind] = Math.max(0, Math.min(max, n));
        again();
      };
      return h(
        'div',
        { class: 'row stepper-row' },
        h('span', {}, label, h('span', { class: 'muted small' }, ` · ${Math.floor(state.resources[kind])} in stock`)),
        h(
          'span',
          { class: 'stepper' },
          h('button', { disabled: d[kind] <= 0, onclick: () => set(d[kind] - 1), 'aria-label': `fewer ${label}` }, '−'),
          h('b', {}, `${d[kind]}`),
          h('button', { disabled: d[kind] >= max, onclick: () => set(d[kind] + 1), 'aria-label': `more ${label}` }, '+'),
        ),
      );
    };

    const send = () => {
      if (d.residentId === null) return;
      const result = this.game.run({ type: 'explore', residentId: d.residentId, regionId: d.regionId, medpatch: d.medpatch, purge: d.purge });
      if (!result.ok) {
        this.toast(result.reason, 'bad');
        return;
      }
      close();
      this.openPanel('explore');
    };

    this.modalHost.replaceChildren(
      h(
        'div',
        { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && close() },
        h(
          'div',
          { class: 'modal explore-modal' },
          h('h2', {}, 'Into the Glarelands'),
          picker,
          summary,
          h('h3', { class: 'group' }, 'Region'),
          ...regions,
          h('h3', { class: 'group' }, 'Supplies'),
          stepper('medpatch', '✚ Med-Patches'),
          stepper('purge', '☢ Purge'),
          h('p', { class: 'muted small' }, `Up to ${MAX_SUPPLIES} of each. Med-Patches are used at half health, Purge when Glare-sickness builds up. Whatever is left comes home.`),
          why ? h('div', { class: 'row short' }, `Can't send: ${why}`) : null,
          h(
            'div',
            { class: 'row', style: 'justify-content:flex-end;margin-top:12px;gap:8px' },
            h('button', { onclick: close }, 'Cancel'),
            h('button', { class: 'primary', disabled: !!why, onclick: send }, 'Send out'),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- workshops

  private workshopSection(room: Room): HTMLElement[] {
    const { state, content } = this.game;
    const parts: HTMLElement[] = [];
    const job = room.job;
    if (job) {
      const def = content.items[job.defId];
      const done = job.remaining <= 0;
      const left = craftTimeLeft(state, content, room);
      const p = job.total > 0 ? Math.max(0, Math.min(1, 1 - job.remaining / job.total)) : 0;
      const stall = !room.powered
        ? 'no power'
        : workersInRoom(state, room.id).length === 0
          ? 'nobody is working here'
          : state.incidents.some((i) => i.roomId === room.id)
            ? 'incident in the room'
            : null;
      parts.push(
        h(
          'div',
          { class: `list-item craft-job${done ? ' done' : ''}` },
          h(
            'div',
            { class: 'row', style: 'margin:0' },
            h('span', {}, def ? h('span', { class: `rarity ${def.rarity}` }, RARITY_MARK[def.rarity]) : null, h('b', {}, ` ${def?.name ?? job.defId}`)),
            h('b', {}, done ? 'READY' : isFinite(left) ? `${duration(left)} left` : 'Stalled'),
          ),
          h('div', { class: 'progress' }, h('div', { style: `width:${p * 100}%;background:var(--accent)` })),
          !done && (stall || !isFinite(left)) ? h('div', { class: 'muted small short' }, `Paused: ${stall ?? 'waiting for a crew'}`) : null,
          h(
            'div',
            { class: 'row', style: 'justify-content:flex-start;margin-bottom:0' },
            done
              ? h('button', { class: 'primary', onclick: () => this.craftCmd({ type: 'collectCraft', roomId: room.id }) }, 'Collect')
              : h(
                  'button',
                  {
                    class: 'danger close',
                    onclick: () => {
                      if (!confirm(`Cancel crafting ${def?.name ?? 'this item'}? Salvage and scrip are refunded.`)) return;
                      this.craftCmd({ type: 'cancelCraft', roomId: room.id }, 'Job cancelled. Materials refunded.');
                    },
                  },
                  'Cancel (refund)',
                ),
          ),
        ),
      );
    }

    const recipes = workshopRecipes(content, room);
    parts.push(h('h3', { class: 'group' }, 'Recipes'));
    if (!recipes.length) {
      parts.push(h('p', { class: 'muted' }, 'No recipes available here yet.'));
      return parts;
    }
    parts.push(h('p', { class: 'muted small', style: 'margin-top:0' }, 'Each recipe is sped up by one stat of the crew working here. Rare recipes need workshop level 2, legendary level 3.'));
    for (const rarity of ['common', 'rare', 'legendary'] as const) {
      const group = recipes
        .filter((r) => content.items[r.defId]?.rarity === rarity)
        .sort((a, b) => Number(knowsRecipe(state, content, b.defId)) - Number(knowsRecipe(state, content, a.defId)) || a.scrip - b.scrip);
      if (!group.length) continue;
      const known = group.filter((r) => knowsRecipe(state, content, r.defId)).length;
      parts.push(h('div', { class: 'row group-row' }, h('b', { class: `rarity ${rarity}` }, `${RARITY_MARK[rarity]} ${capitalize(rarity)}`), h('span', { class: 'muted small' }, `${known}/${group.length} known`)));
      for (const r of group) parts.push(this.recipeCard(room, r));
    }
    return parts;
  }

  private recipeCard(room: Room, recipe: Recipe): HTMLElement {
    const { state, content } = this.game;
    const def = content.items[recipe.defId];
    if (!def) return h('div');
    const title = h('span', {}, h('span', { class: `rarity ${def.rarity}` }, RARITY_MARK[def.rarity]), ` ${def.name}`);
    const crew = workersInRoom(state, room.id).length ? crewCraftStat(state, content, room, recipe.defId) : 0;
    const stats = `${def.kind === 'weapon' ? `${def.min}–${def.max} dmg` : bonusText(def.bonus)} · ${STAT_NAME[def.craftStat]}${crew ? ` (crew ${crew})` : ''}`;
    if (!knowsRecipe(state, content, recipe.defId)) {
      const have = state.fragments[recipe.defId] ?? 0;
      const need = Math.max(1, fragmentsNeeded(content, recipe.defId));
      return h(
        'div',
        { class: 'list-item recipe locked-recipe' },
        h('div', { class: 'row', style: 'margin:0' }, h('span', {}, '🔒 ', title), h('span', { class: 'muted' }, `📜 ${have}/${need}`)),
        h('div', { class: 'progress' }, h('div', { style: `width:${Math.min(100, (have / need) * 100)}%;background:var(--${def.rarity})` })),
        h('div', { class: 'muted small' }, `${stats} · blueprint fragments needed`),
      );
    }
    const why = canCraft(state, content, room, recipe.defId);
    const secs = craftSeconds(state, content, room, recipe.defId);
    const costs = Object.entries(recipe.salvage).map(([id, n]) => {
      const s = content.salvage[id];
      const have = salvageCount(state, id);
      return h('span', { class: `cost ${have >= n ? 'ok' : 'short'}`, title: s ? `${s.name} (${s.rarity})` : id }, h('span', { class: `rarity ${s?.rarity ?? 'common'}` }, RARITY_MARK[s?.rarity ?? 'common']), ` ${s?.name ?? id} ${have}/${n}`);
    });
    const scripOk = state.scrip >= recipe.scrip;
    return h(
      'div',
      { class: 'list-item recipe' },
      h('div', { class: 'row', style: 'margin:0' }, title, h('span', { class: 'muted' }, `⏱ ${duration(secs)}`)),
      h('div', { class: 'muted small' }, stats),
      h('div', { class: 'costs' }, ...costs, h('span', { class: `cost ${scripOk ? 'ok' : 'short'}` }, `💰 ${fmt(recipe.scrip)} scrip`)),
      h(
        'div',
        { class: 'row', style: 'margin-bottom:0' },
        h('span', { class: 'muted small' }, room.job ? '' : why ?? ''),
        h('button', { class: 'primary close', disabled: !!why, title: why ?? `Craft ${def.name}`, onclick: () => this.craftCmd({ type: 'craft', roomId: room.id, defId: recipe.defId }) }, 'Craft'),
      ),
    );
  }

  private craftCmd(cmd: Parameters<Game['run']>[0], okText?: string): void {
    const res = this.game.run(cmd);
    if (!res.ok) this.toast(res.reason, 'bad');
    else if (okText) this.toast(okText, 'good');
    this.renderPanel(true);
  }

  // ---------------------------------------------------------------- events & feedback

  private name(id: number): string {
    const r = this.game.state.residents.find((x) => x.id === id);
    return r ? r.firstName : 'Someone';
  }

  private explorerName(expeditionId: number): string {
    const e = this.game.state.expeditions.find((x) => x.id === expeditionId);
    const rid = e?.residentId ?? this.explorerOf.get(expeditionId);
    return rid === undefined ? 'An explorer' : this.name(rid);
  }

  private onEvents(events: GameEvent[]): void {
    const { content } = this.game;
    // Remember who is on which expedition, so events after collection can still name them.
    for (const e of this.game.state.expeditions) this.explorerOf.set(e.id, e.residentId);
    this.journalToasts(events);
    this.quests.onEvents(events);
    for (const ev of events) {
      if (ev.type === 'expeditionStarted') this.explorerOf.set(ev.expeditionId, ev.residentId);
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
          // A wiped quest party gets its own toast, and can't be revived until it is home.
          if (this.game.state.residents.find((r) => r.id === ev.residentId)?.quest != null) break;
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
        // M3: the Glarelands
        case 'expeditionStarted':
          this.toast(`🧭 ${this.name(ev.residentId)} sets out into the Glarelands.`, 'good');
          break;
        // expeditionJournal is batched in journalToasts() below.
        case 'expeditionReturning':
          this.toast(
            ev.reason === 'full'
              ? `🎒 ${this.explorerName(ev.expeditionId)} can't carry any more and is heading home.`
              : `${this.explorerName(ev.expeditionId)} is heading home.`,
          );
          break;
        case 'expeditionReturned':
          this.toast(`🏠 ${this.explorerName(ev.expeditionId)} is back from the Glarelands. Collect their haul in Explore.`, 'gold');
          break;
        case 'expeditionCollected': {
          const bits = lootText(content, ev.loot);
          this.toast(`${this.explorerName(ev.expeditionId)} unpacked${bits ? `: ${bits}` : '. Nothing much this time.'}`, 'good');
          break;
        }
        case 'explorerDied':
          this.toast(`☠ ${this.name(ev.residentId)} has fallen in the Glarelands. Revive them or recall the body from Explore.`, 'bad');
          break;
        // M3: crafting and salvage
        case 'recipeUnlocked': {
          const d = content.items[ev.defId];
          this.toast(`📜 Recipe learned: ${d?.name ?? ev.defId}${ev.source === 'fragments' ? ' (blueprint complete)' : ''}`, 'gold');
          break;
        }
        case 'fragmentFound': {
          const d = content.items[ev.defId];
          this.toast(`📜 Blueprint fragment: ${d?.name ?? ev.defId} (${ev.have}/${ev.need})`, 'good');
          break;
        }
        case 'craftStarted': {
          const d = content.items[ev.defId];
          this.toast(`🔧 Crafting ${d?.name ?? 'an item'}.`);
          break;
        }
        case 'craftFinished': {
          const d = content.items[ev.defId];
          const room = this.game.state.rooms.find((r) => r.id === ev.roomId);
          const where = room ? roomDef(content, room).name : 'the workshop';
          this.toast(`🔧 ${d?.name ?? 'An item'} is ready in the ${where}. Tap the room to collect.`, 'gold');
          break;
        }
        case 'craftCollected': {
          const d = content.items[ev.defId];
          this.toast(`${d?.name ?? 'Item'} added to storage.`, 'good');
          break;
        }
        case 'itemScrapped': {
          const d = content.items[ev.defId];
          const got = scrapText(content, ev.salvage);
          this.toast(`Scrapped ${d?.name ?? 'an item'}${got ? `: ${got}` : ''}`);
          break;
        }
        case 'reforged': {
          const d = content.items[ev.result];
          this.toast(
            ev.upgraded ? `⚗ Reforge succeeded: ${d?.name ?? ev.result} (${d?.rarity ?? 'better'})!` : `⚗ Reforged into ${d?.name ?? ev.result}. No upgrade this time.`,
            ev.upgraded ? 'gold' : undefined,
          );
          break;
        }
      }
    }
  }

  /**
   * Journal entries can arrive by the dozen after an offline catch-up, so each
   * flush gives at most one toast per expedition (its latest entry), or a single
   * summary line when several explorers report at once.
   */
  private journalToasts(events: GameEvent[]): void {
    const latest = new Map<number, { entry: JournalEntry; n: number }>();
    for (const ev of events) {
      if (ev.type !== 'expeditionJournal') continue;
      latest.set(ev.expeditionId, { entry: ev.entry, n: (latest.get(ev.expeditionId)?.n ?? 0) + 1 });
    }
    if (latest.size > 2) {
      const total = [...latest.values()].reduce((a, b) => a + b.n, 0);
      this.toast(`🧭 ${total} journal entries from ${latest.size} explorers. Read them in Explore.`);
      return;
    }
    for (const [id, { entry, n }] of latest) {
      const tone = entry.kind === 'danger' || entry.kind === 'status' ? 'bad' : entry.kind === 'levelup' || entry.kind === 'find' ? 'gold' : undefined;
      this.toast(`🧭 ${this.explorerName(id)}: ${entry.text}${n > 1 ? ` (+${n - 1} more)` : ''}`, tone);
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
    const names = (ids: number[]) => {
      const n = ids.map((id) => this.name(id));
      return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : (n[0] ?? '');
    };
    const home = s.explorersHome.length;
    const fallen = s.explorersFallen.length;
    const extras = [
      s.births ? `${s.births} baby${s.births > 1 ? ' babies were' : ' was'} born.` : '',
      s.arrivals ? `${s.arrivals} new arrival${s.arrivals > 1 ? 's are' : ' is'} at the door.` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const out = this.game.state.expeditions.filter((e) => e.status === 'exploring' || e.status === 'returning').length;
    const glare = [
      home ? `🏠 ${names(s.explorersHome)} came home from the Glarelands with their haul.` : '',
      fallen ? `☠ ${names(s.explorersFallen)} fell out in the Glarelands.` : '',
      out && !home && !fallen ? `🧭 ${out} explorer${out === 1 ? ' is' : 's are'} still out in the Glarelands.` : '',
    ].filter(Boolean);
    this.modal(
      'While you were away',
      h('p', {}, `${duration(s.seconds)} passed. ${s.readyRooms} room${s.readyRooms === 1 ? ' is' : 's are'} ready to collect. ${extras}`),
      ...glare.map((t) => h('p', {}, t)),
      s.cappedAt ? h('p', { class: 'muted' }, `Offline progress is capped at ${duration(s.cappedAt)}.`) : '',
      h('p', { class: 'muted' }, 'Your homestead is safe while you are gone: no incidents, no shortage damage.'),
      home || fallen ? h('div', { class: 'row', style: 'justify-content:flex-start' }, h('button', { onclick: () => (this.modalHost.replaceChildren(), this.openPanel('explore')) }, 'Open the Glarelands')) : '',
    );
  }
}

function bonusText(bonus: Partial<Record<StatKey, number>>): string {
  return Object.entries(bonus)
    .map(([k, v]) => `+${v} ${STAT_NAME[k as StatKey]}`)
    .join(', ');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Expedition clock for journal lines: 0:05, 2:14, 26:03 (hours:minutes out). */
function clock(t: number): string {
  const m = Math.floor(Math.max(0, t) / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function dangerPips(danger: number): HTMLElement {
  const n = Math.max(1, Math.min(5, Math.round(danger)));
  return h('span', { class: 'danger-pips', title: `Danger ${n}/5` }, '☠'.repeat(n), h('span', { class: 'off' }, '☠'.repeat(5 - n)));
}

/** "2 Tin Cans, 1 Sticky Tape" from a salvage map. */
function scrapText(content: Content, salvage: Record<string, number>): string {
  return Object.entries(salvage)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${Math.round(n * 10) / 10} ${content.salvage[id]?.name ?? id}`)
    .join(', ');
}

function lootCounts(loot: ExpeditionLoot) {
  return {
    scrip: loot.scrip,
    items: loot.items.length,
    salvage: Object.values(loot.salvage).reduce((a, b) => a + b, 0),
    fragments: Object.values(loot.fragments).reduce((a, b) => a + b, 0),
    recipes: loot.recipes.length,
  };
}

function lootChips(loot: ExpeditionLoot): HTMLElement[] {
  const c = lootCounts(loot);
  const chip = (icon: string, n: number, label: string) => h('span', { class: `loot-chip${n ? '' : ' none'}`, title: label }, `${icon} ${fmt(n)}`);
  return [
    chip('💰', c.scrip, 'Scrip'),
    chip('⚔', c.items, 'Weapons and outfits'),
    chip('⚙', c.salvage, 'Salvage'),
    chip('📜', c.fragments, 'Blueprint fragments'),
    c.recipes ? chip('📘', c.recipes, 'Whole recipes') : null,
  ].filter((x): x is HTMLElement => !!x);
}

function lootText(content: Content, loot: ExpeditionLoot): string {
  const c = lootCounts(loot);
  const bits: string[] = [];
  if (c.scrip) bits.push(`${fmt(c.scrip)} scrip`);
  if (c.items) {
    const best = loot.items.map((id) => content.items[id]).filter((d): d is ItemDef => !!d).sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity])[0];
    bits.push(`${c.items} item${c.items === 1 ? '' : 's'}${best && best.rarity !== 'common' ? ` incl. ${best.name}` : ''}`);
  }
  if (c.salvage) bits.push(`${c.salvage} salvage`);
  if (c.fragments) bits.push(`${c.fragments} fragment${c.fragments === 1 ? '' : 's'}`);
  if (c.recipes) bits.push(`${c.recipes} recipe${c.recipes === 1 ? '' : 's'}`);
  return bits.join(', ');
}

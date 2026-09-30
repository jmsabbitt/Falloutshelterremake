// DOM interface over the Pixi view: HUD, toolbar, side panels, toasts, hints.

import { watchAnotherTab } from './anotherTab';
import { itemIcon, salvageIcon } from './icons';
import { applyChromeArt, artImg, artUrl, iconize, loadUiArt, uiIcon } from './art';
import { GearUI, groupItems, itemLabel, itemStats, type GearSlot } from './gear';
import { halcyFace } from './halcy';
import {
  achievementProgress,
  buildCost,
  moveBlocked,
  moveCost,
  canCraft,
  canExplore,
  explorerCandidates,
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
  fizzHeld,
  workersInRoom,
  workshopRecipes,
  CARRY_LIMIT,
  MAX_EXPLORERS,
  MAX_SUPPLIES,
  SALVAGE_CAP,
  courtshipSeconds,
  cycleSeconds,
  secondsToReady,
  effectiveMaxHp,
  effectiveStats,
  isChild,
  itemCapacity,
  maxLevel,
  population,
  radioChance,
  radioInterval,
  resourceCapacity,
  residentsInRoom,
  reviveCost,
  roomCapacity,
  roomDef,
  rushFailChance,
  sellValue,
  shortageLine,
  storageCapacity,
  topStats,
  upgradeCost,
  vaultHappiness,
  xpToNext,
  STAT_KEYS,
  cacheDef,
  exclusiveRegionOf,
  isLootOnly,
  legendDef,
  lootContent,
  wardenTitle,
  endingTitle,
  collectionEntries,
  questContent,
  type CollectionCategory,
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
import type { Content, GameState } from '../../sim';
import type { Game } from '../game';
import type { QuestView } from '../render/questView';
import type { VaultView } from '../render/vaultView';
import { ask } from './confirm';
import { duration, fmt, h, morph } from './dom';
import { fizzButton } from './fizz';
import { LegacyUI } from './prestige';
import { QolUI } from './qol';
import { QuestUI } from './quests';
import { DeepUI, type DeepTab } from './deep';
import { buildInfo, ResearchUI } from './research';
import { compactLayout, isPhone, syncHudHeight } from './layout';
import { installSheetSwipe } from './sheet';
import { haptic, isNative, onBack, runBack } from '../platform';
import { settingsPanel } from './settings';
import { ThreatUI } from './threat';
import { Toasts, type ToastKind, type ToastOptions } from './toasts';
import { TraitsUI } from './traits';
import { FactionsUI, type FactionsTab } from './factions';
import { TopsideUI } from './topside';
import { reviveBlocked, reviveLabel, rulesHudChip, rulesTitle, survivalMark } from './rules';
import { customGameButton } from './custom';
import { LegendsUI } from './legends';
import { CollectionUI } from './collection';
import { m9Console } from '../m9Dev';
import { EndingsUI } from './endings';
import { endingConsole } from '../endingDev';
import { roomName as levelName } from './qolText';
import { TutorialCoach } from './tutorial';
import { StatFlash, statTrainedToast, trainingBlurb, trainingGain, trainingLine, trainingSection } from './training';

declare const __APP_VERSION__: string;

type PanelKind = 'build' | 'room' | 'residents' | 'storage' | 'crates' | 'explore' | 'quests' | 'legacy' | 'achievements' | 'menu' | 'notices' | 'research' | 'deep' | 'factions' | 'collection' | null;
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
/** Build-list lines for rooms whose job isn't a resource or storage. */
const ROOM_BLURB: Record<string, string> = {
  office: 'Sends parties of up to three on story quests and bounty contracts · one per homestead',
  weaponshop: 'Crafts weapons from salvage and scrip · each recipe is sped up by one crew stat',
  outfitshop: 'Crafts outfits from salvage and scrip · each recipe is sped up by one crew stat',
  lab: 'Makes research points for the tech tree · uses Wits',
  watchtower: 'Spots raiders early and softens their attack · uses Sight · up to 2',
  trading_post: 'Opens the trade board and sends caravans · uses Charm · one per homestead',
  signal_mast: 'Reaches the neighbouring factions; each level reaches further · uses Charm',
};
type MeterKey = 'power' | 'food' | 'water';
const METER_NAME: Record<MeterKey, string> = { power: 'Power', food: 'Food', water: 'Water' };
const TIER_NAME: Record<CrateTier, string> = { standard: 'Supply Crate', rare: 'Rare Crate', legendary: 'Legendary Crate' };
const INCIDENT_TOAST: Record<string, string> = {
  fire: ':inc_fire: Fire! Keep residents in the room to put it out.',
  skitters: ':inc_skitters: Skitters! Stay in the room and stamp them out.',
  burrowers: ':inc_burrowers: Burrowers broke through the wall and are draining power!',
  rustmen: ':inc_rustmen: Rustmen raiders are at the door! Arm your door guards.',
  cavein: ':inc_cavein: Cave-in! Send strong residents (Brawn) to dig the room out.',
  flood: ':inc_flood: Flooding! Send handy residents (Knack) before it spreads sideways.',
  deepcrawlers: ':inc_deepcrawlers: Deepcrawlers are coming out of the rock! Send armed residents.',
  surge: ':inc_surge: Electrical surge! Anyone in the room helps ground it before it jumps the wiring.',
  hollowed: ':inc_hollowed: The Hollowed got in. They hit with Glare as much as fists: send armed residents, and a Purge after.',
  glassbacks: ':inc_glassbacks: Glassbacks! They drain power and hop rooms. Chase them with armed residents.',
  maulers: ':inc_maulers: A Mauler is coming for the door! Put your best-armed residents on it.',
};

export class UI {
  private root: HTMLElement;
  private hud = h('div', { class: 'hud' });
  private toolbar = h('div', { class: 'toolbar' });
  private panelHost = h('div', { class: 'panel-host' });
  private toasts = h('div', { class: 'toasts' });
  private toastStack = new Toasts(this.toasts);
  private hint = h('div', { class: 'hint', style: 'display:none' });
  private modalHost = h('div');

  private panel: PanelKind = null;
  /** Phones: the build or assign sheet is pulled up to full height (otherwise it sits as a small bar). */
  private sheetOpen = false;
  /** Rooms built since the current room type was picked: the bar offers Done rather than Cancel. */
  private builtInMode = 0;
  /** When the camera's DOM insets were last measured. */
  private insetsAt = 0;
  private roomId: number | null = null;
  private residentId: number | null = null;
  /** Storage: which kind of item the Items tab lists, and the item type whose Sell/Scrap row is open. */
  private storageKind: GearSlot | 'all' = 'all';
  private storageOpen: string | null = null;
  private lastPanelRender = 0;
  /** Stats raised in the last few seconds, flashed on resident cards. */
  private statFlash = new StatFlash();
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
  /** M5: Legacy panel, HUD chips and the Found flow. */
  readonly legacy: LegacyUI;
  /** M6: research, the Deep, and traits and mastery. */
  readonly research: ResearchUI;
  readonly deep: DeepUI;
  readonly traits: TraitsUI;
  private threat: ThreatUI;
  /** M6: resident list, notification centre, save slots, loadouts, stats overlay. */
  readonly qol: QolUI;
  /** M7: factions, trade and caravans; the weather and surface buildings. */
  readonly factions: FactionsUI;
  readonly topside: TopsideUI;
  /** M9: legendary residents, and the Collection Log with the Warden's Seal. */
  readonly legends: LegendsUI;
  readonly collection: CollectionUI;
  /** Gear pickers: an item for a resident, or a resident for an item. */
  readonly gear: GearUI;
  /** Act 4: the ending choice, the epilogue and credits, replays and titles. */
  readonly endings: EndingsUI;
  /** HALCY's first-homestead tutorial bubble. */
  readonly coach: TutorialCoach;
  /** M9: incidents that left on their own this batch (their incidentResolved is not a win). */
  private escaped = new Set<number>();

  constructor(
    private game: Game,
    private view: VaultView,
    questView: QuestView,
  ) {
    this.root = document.getElementById('ui') as HTMLElement;
    // The painted icons' paths; until the manifest is in, the usual file names stand in.
    applyChromeArt();
    void loadUiArt().then(() => {
      applyChromeArt();
      this.lastToolbarKey = '';
      this.renderToolbar();
    });
    this.root.append(this.hud, this.toasts, this.panelHost, this.hint, this.toolbar, this.modalHost);
    this.coach = new TutorialCoach({
      game,
      view,
      panel: () => this.panel,
      openBuild: (type) => {
        this.openPanel('build');
        this.setBuildMode(type);
        this.renderPanel(true);
        this.revealGhosts();
      },
      endBuild: () => {
        if (this.panel !== 'build') return;
        this.setBuildMode(null);
        this.closePanel();
      },
      toast: (text, kind) => this.toast(text, kind),
      reveal: (roomId, above) => {
        const room = this.game.state.rooms.find((r) => r.id === roomId);
        if (!room) return;
        const ins = this.viewInsets();
        this.view.insets = ins;
        this.view.revealRoom(room, { ...ins, top: ins.top + above });
      },
    });
    this.root.insertBefore(this.coach.el, this.modalHost);
    this.qol = new QolUI({
      game,
      view,
      hud: this.hud,
      modalHost: this.modalHost,
      toast: (text, kind, opts) => this.toast(text, kind, opts),
      refresh: () => this.renderPanel(true),
      openNotices: () => this.openPanel('notices'),
      closePanel: () => this.closePanel(),
      panel: () => this.panel,
      selectedId: () => this.residentId,
      select: (id) => {
        if (id !== this.residentId) this.sheetOpen = false;
        this.residentId = id;
        this.view.selectedResidentId = id;
      },
      detailCard: (r) => this.residentCard(r, true),
      traitTag: (r) => this.traits.tag(r),
      groupFit: (rs, room) => this.traits.groupFit(rs, room),
    });
    this.quests = new QuestUI(
      {
        game,
        loadouts: this.qol.loadouts,
        modalHost: this.modalHost,
        toast: (text, kind, opts) => this.toast(text, kind, opts),
        openQuests: () => this.openPanel('quests'),
        refreshPanel: () => this.renderPanel(true),
        openBuild: () => this.openPanel('build'),
      },
      questView,
      view,
      this.root,
    );
    this.legacy = new LegacyUI({
      game,
      modalHost: this.modalHost,
      toast: (text, kind, opts) => this.toast(text, kind, opts),
      openLegacy: (tab) => {
        this.legacy.opened(tab);
        this.openPanel('legacy');
      },
      refreshPanel: () => this.renderPanel(true),
    });
    this.research = new ResearchUI({
      game,
      toast: (text, kind, opts) => this.toast(text, kind, opts),
      openResearch: () => this.openPanel('research'),
      openDeep: () => this.openDeep(),
      refreshPanel: () => this.renderPanel(true),
    });
    this.deep = new DeepUI({
      game,
      view,
      modalHost: this.modalHost,
      toast: (text, kind, opts) => this.toast(text, kind, opts),
      openDeep: (tab) => this.openDeep(tab),
      openResearch: () => this.openPanel('research'),
      refreshPanel: () => this.renderPanel(true),
      closePanel: () => this.closePanel(),
    });
    this.threat = new ThreatUI(game, this.modalHost);
    this.traits = new TraitsUI({ game, toast: (text, kind, opts) => this.toast(text, kind, opts), refreshPanel: () => this.renderPanel(true) });
    this.factions = new FactionsUI({
      game,
      modalHost: this.modalHost,
      toast: (text, kind, opts) => this.toast(text, kind, opts),
      openFactions: (tab) => this.openFactions(tab),
      refreshPanel: () => this.renderPanel(true),
    });
    this.topside = new TopsideUI(
      {
        game,
        modalHost: this.modalHost,
        toast: (text, kind, opts) => this.toast(text, kind, opts),
        openFactions: (tab, id) => this.openFactions(tab, id),
        openCaravan: (id) => this.factions.openCaravan(id),
      },
      this.root,
    );
    this.legends = new LegendsUI({
      game,
      modalHost: this.modalHost,
      toast: (text, kind, opts) => this.toast(text, kind, opts),
      refreshPanel: () => this.renderPanel(true),
      showResident: (id) => this.showResident(id),
      openQuests: () => this.openPanel('quests'),
    });
    this.collection = new CollectionUI({
      game,
      showLegend: (id) => this.legends.showCard(id),
      openCollection: () => this.openPanel('collection'),
    });
    this.gear = new GearUI({ game, modalHost: this.modalHost, toast: (text, kind, opts) => this.toast(text, kind, opts), refresh: () => this.renderPanel(true) });
    this.endings = new EndingsUI({ game, toast: (text, kind) => this.toast(text, kind), refreshPanel: () => this.renderPanel(true) });
    this.quests.endings = this.endings;
    this.qol.people.extra = () => this.legends.section();
    this.renderToolbar();
    game.on((events) => this.onEvents(events));
    game.onReplace(() => this.onStateReplaced());
    watchAnotherTab(game, (msg, kind) => this.toast(msg, kind));
    game.onSaveError(() => this.toast("Couldn't save: this browser's storage is full. Export your homestead (Menu → Saves) to keep your progress.", 'bad'));
    // M8: Android back (and Escape) closes the topmost thing first.
    onBack(() => this.back());
    // For automated tests: press "back" as the device would.
    const hs = (window as unknown as { homestead?: Record<string, unknown> }).homestead;
    if (hs) hs.back = () => runBack();
    // M9 dev helpers: legends, creatures, the Mauler, the Collection Log, the Seal, maps.
    if (hs && !hs.m9) hs.m9 = m9Console(game);
    // Act 4 dev helpers: jump to Act 4, meet the true ending's conditions, play each ending.
    if (hs && !hs.ending) hs.ending = endingConsole(game, this.endings);
    // Phones: pull a sheet down by its handle to close it.
    installSheetSwipe(this.panelHost, () => this.swipeClose());
    if (game.lastCatchUp) this.showAwaySummary();
    else if (game.state.time < 5 && !this.coach.active()) this.showWelcome();
  }

  // ---------------------------------------------------------------- view callbacks

  onRoomTap(room: Room): void {
    const { state } = this.game;
    // Moving a room: taps on rooms don't open them (the slots and the bar's Cancel do the work).
    if (this.view.moveRoomId !== null) {
      if (room.id !== this.view.moveRoomId) this.toast('Tap a green slot to move the room there, or Cancel');
      return;
    }
    // Assigning is drag only: a room tap never sends the selected resident (playtest 1).
    if (room.type === 'door' && state.residents.some((r) => r.waiting)) {
      const res = this.game.run({ type: 'admitAll' });
      this.toast(res.ok ? `Welcome to Homestead ${state.homesteadNumber}! (${res.detail})` : res.reason, res.ok ? 'good' : 'bad');
      return;
    }
    if (room.ready) {
      if (this.game.run({ type: 'collect', roomId: room.id }).ok) haptic('tap');
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
    if (this.view.buildMode || this.view.moveRoomId !== null) return;
    this.closePanel();
  }

  onResidentTap(res: Resident): void {
    if (this.panel === 'residents' && this.qol.people.bulk) {
      this.qol.people.togglePick(res.id);
      return;
    }
    this.openPanel('residents');
    if (this.residentId !== res.id) this.sheetOpen = false;
    this.residentId = res.id;
    this.view.selectedResidentId = res.id;
    this.renderPanel(true);
    this.qol.people.toTop();
  }

  /** Open the residents panel with this resident's card. */
  showResident(id: number): void {
    const res = this.game.state.residents.find((r) => r.id === id);
    if (!res) return;
    if (res.waiting) {
      this.openPanel(null);
      const door = this.game.state.rooms.find((r) => r.type === 'door');
      if (door) this.openRoom(door.id);
      return;
    }
    this.onResidentTap(res);
  }

  onResidentDrop(residentId: number, room: Room | null): void {
    if (!room) return;
    this.assign(residentId, room);
  }

  onBuildAt(floor: number, x: number): void {
    if (this.view.moveRoomId !== null) {
      this.moveTo(floor, x);
      return;
    }
    const type = this.view.buildMode;
    if (!type) return;
    const res = this.game.run({ type: 'build', roomType: type, floor, x });
    if (!res.ok) {
      this.toast(res.reason, 'bad');
      haptic('error');
    } else {
      this.builtInMode++;
      haptic('success');
    }
    this.view.rebuildGhosts();
    this.renderPanel(true);
  }

  private assign(residentId: number, room: Room): void {
    const res = this.game.run({ type: 'assign', residentId, roomId: room.id });
    const who = this.game.state.residents.find((r) => r.id === residentId);
    haptic(res.ok ? 'success' : 'error');
    if (!res.ok) this.toast(res.reason, 'bad');
    else if (who) {
      const def = roomDef(this.game.content, room);
      const good = def.stat && topStats(effectiveStats(this.game.content, who)).includes(def.stat);
      this.toast(`${who.firstName} → ${def.name}${good ? ' ✓ great fit' : ''}${this.traits.fitNote(who, room)}${res.detail ? ` (${res.detail})` : ''}`, good ? 'good' : undefined);
    }
    this.renderPanel(true);
  }

  // ---------------------------------------------------------------- frame

  update(): void {
    if (this.game.lastCatchUp) this.showAwaySummary();
    // Measuring the DOM forces a layout: a few times a second is plenty for the camera bounds.
    const now = performance.now();
    if (now - this.insetsAt > 250) {
      this.insetsAt = now;
      this.view.insets = this.viewInsets();
    }
    this.renderHud();
    syncHudHeight(this.hud);
    this.renderHint();
    this.renderToolbar();
    this.coach.update();
    this.quests.update();
    this.legacy.update();
    this.deep.update();
    this.qol.update();
    this.topside.update();
    this.factions.update();
    if (performance.now() - this.lastPanelRender > 500) this.renderPanel();
  }

  private renderHud(): void {
    const { state, content } = this.game;
    const meter = (key: MeterKey, color: string, glyph: string) => {
      const art = uiIcon(key, { alt: '', fallback: glyph });
      const cap = resourceCapacity(state, content, key);
      const val = state.resources[key];
      const tick = shortageLine(state, content, key);
      const pct = cap > 0 ? Math.min(100, (val / cap) * 100) : 0;
      const tickPct = cap > 0 ? Math.min(100, (tick / cap) * 100) : 0;
      const short = val < tick;
      // Tooltips don't exist on touch: a tap says the same thing as a toast.
      const tip = cap > 0 ? `${METER_NAME[key]}: ${fmt(val)} / ${fmt(cap)} · shortage below ${fmt(Math.ceil(tick))}` : `${METER_NAME[key]}: no room stores it yet. Build one to start making it.`;
      return h(
        'div',
        { class: `meter${short ? ' short' : ''}`, title: tip, role: 'button', 'aria-label': tip, onclick: () => this.toast(short ? `${tip}. ${this.shortageFix(key)}` : tip, short ? 'bad' : undefined, { fold: `meter-${key}` }) },
        art instanceof HTMLElement ? h('div', { class: 'icon art' }, art) : h('div', { class: 'icon', style: `background:${color}` }, glyph),
        h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${pct}%;background:${color}` }), h('div', { class: 'tick', style: `left:${tickPct}%` })),
        h('div', { class: 'num' }, cap > 0 ? `${fmt(val)}/${fmt(cap)}` : '—'),
      );
    };
    const pop = population(state);
    const cap = storageCapacity(state, content, 'population');
    const seal = wardenTitle(state, content);
    const crates = state.crates.standard + state.crates.rare + state.crates.legendary;
    const ready = state.rooms.filter((r) => r.ready).length;
    const meters = h(
      'div',
      { class: 'hud-part hud-meters' },
      h(
        'div',
        { class: 'title', title: [seal ? `Warden's Seal: ${seal}` : '', endingTitle(state) ? `Title: ${endingTitle(state)}` : '', rulesTitle(state, content) ?? ''].filter(Boolean).join(' · ') || undefined },
        seal ? h('span', { class: 'seal-mark' }, '✪ ') : null,
        `HOMESTEAD ${state.homesteadNumber}${survivalMark(state)}`,
        this.endings.hudTitle(),
      ),
      meter('power', 'var(--power)', 'P'),
      meter('food', 'var(--food)', 'F'),
      meter('water', 'var(--water)', 'W'),
    );
    const info = h(
      'div',
      { class: 'hud-part hud-info' },
      h('div', { class: 'stat-chip', title: 'Scrip' }, uiIcon('scrip', { fallback: 'Scrip ' }), ' ', h('b', {}, fmt(state.scrip))),
      h('div', { class: 'stat-chip', title: 'Population / beds' }, uiIcon('population', { fallback: 'Pop ' }), ' ', h('b', {}, `${pop}/${cap}`)),
      h('div', { class: 'stat-chip', title: 'Average mood' }, uiIcon(pop > 0 && vaultHappiness(state) < 40 ? 'sad' : 'mood', { fallback: 'Mood ' }), ' ', h('b', {}, pop > 0 ? `${Math.round(vaultHappiness(state))}%` : '—')),
      h('div', { class: 'stat-chip', title: 'Med-Patches / Purge' }, '✚ ', h('b', {}, `${Math.floor(state.resources.medpatch)}`), ' ☢ ', h('b', {}, `${Math.floor(state.resources.purge)}`)),
      this.traits.shiftChip(),
    );
    const tokens = Math.round((state.crateTokens / content.balance.crates.tokensPerCrate) * 100);
    const buttons = h(
      'div',
      { class: 'hud-part hud-buttons' },
      h(
        'button',
        { class: `stat-chip chip-button crate-chip${crates ? ' glow' : ''}`, title: 'Supply Crates', 'aria-label': 'Supply Crates', onclick: () => this.openPanel('crates') },
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
            else if (res.ok) haptic('tap');
          },
        },
        '⤓ Collect',
        ready ? h('b', {}, ` ${ready}`) : null,
      ),
      this.endings.hudChip(),
      this.quests.hudChip(),
      this.research.hudChip(),
      this.deep.hudChip(),
      this.threat.hudChip(),
      rulesHudChip(state, content, (t) => this.toast(t)),
      ...this.topside.hudChips(),
      ...this.legacy.hudChips(),
    );
    // The meters change nearly every frame. Patch in place, and keep the buttons
    // in their own part so they are only touched when their own markup changes.
    // Phones: the meters take the first row and the chips a second one that scrolls sideways.
    if (!this.hud.firstChild) this.hud.append(h('div', { class: 'hud-part hud-meters' }), h('div', { class: 'hud-strip' }, h('div', { class: 'hud-part hud-info' }), h('div', { class: 'hud-part hud-buttons' })));
    const meterHost = this.hud.children[0] as HTMLElement | undefined;
    const strip = this.hud.children[1] as HTMLElement | undefined;
    const [infoHost, buttonHost] = [strip?.children[0], strip?.children[1]] as (HTMLElement | undefined)[];
    if (meterHost && meterHost.innerHTML !== meters.innerHTML) morph(meterHost, meters);
    if (infoHost && infoHost.innerHTML !== info.innerHTML) morph(infoHost, info);
    this.hud.classList.toggle('hud-short', this.shortages().length > 0);
    if (buttonHost && buttonHost.innerHTML !== buttons.innerHTML) morph(buttonHost, buttons);
  }

  /** Resources below their shortage line, the worst first. */
  private shortages(): MeterKey[] {
    const { state, content } = this.game;
    return (['power', 'food', 'water'] as const)
      .map((key) => ({ key, line: shortageLine(state, content, key), have: state.resources[key] }))
      .filter((x) => x.line > 0 && x.have < x.line)
      .sort((a, b) => a.have / a.line - b.have / b.line)
      .map((x) => x.key);
  }

  /** The room that makes a resource: "Canteen" for food. */
  private makerName(key: MeterKey): string {
    const maker = this.game.content.roomList
      .filter((d) => d.buildable && d.produces?.resource === key && d.minFloor === undefined && !d.requiresResearch)
      .sort((a, b) => a.unlockPop - b.unlockPop)[0];
    return maker?.name ?? 'producer';
  }

  /** What to do about a shortage. */
  private shortageFix(key: MeterKey): string {
    return `${key === 'power' ? 'Rooms are shutting down: s' : 'S'}taff or build a ${this.makerName(key)}.`;
  }

  /** Top-priority hint: "Food shortage: staff or build a Canteen". */
  private shortageHint(): string | null {
    const short = this.shortages();
    const key = short[0];
    if (!key) return null;
    const more = short.length > 1 ? ` (and ${short.slice(1).map((k) => METER_NAME[k].toLowerCase()).join(' and ')})` : '';
    const icon = { power: '⚡', food: '🥫', water: '💧' }[key];
    const what = key === 'power' ? 'rooms are shutting down. Staff' : 'staff';
    return `${icon} ${METER_NAME[key]} shortage${more}: ${what} or build a ${this.makerName(key)}`;
  }

  private renderHint(): void {
    const { state } = this.game;
    let text = '';
    const waiting = state.residents.filter((r) => r.waiting).length;
    const raid = state.incidents.find((i) => i.type === 'rustmen');
    const mauler = state.incidents.find((i) => i.type === 'maulers');
    const glass = state.incidents.find((i) => i.type === 'glassbacks');
    const shortage = this.shortageHint();
    if (shortage) {
      text = shortage;
    } else if (this.view.moveRoomId !== null) {
      text = '';
    } else if (this.view.buildMode) {
      const def = this.game.content.rooms[this.view.buildMode];
      text = `Tap a green slot to build ${def?.name ?? ''} (${buildCost(state, this.game.content, this.view.buildMode)} scrip)`;
    } else if (this.panel === 'residents' && this.qol.people.bulkCount()) {
      text = `Use Assign to… to send the ${this.qol.people.bulkCount()} selected to a room`;
    } else if (this.residentId !== null && this.panel === 'residents') {
      const r = state.residents.find((x) => x.id === this.residentId);
      if (r && !r.dead && !isChild(state, r)) text = `Drag ${r.firstName} into a room to assign them`;
    } else if (mauler) {
      const where = state.rooms.find((r) => r.id === mauler.roomId);
      text =
        (mauler.warning ?? 0) > 0
          ? `A Mauler is coming (${Math.ceil(mauler.warning ?? 0)}s): drag your best-armed residents to the door!`
          : mauler.doorHp > 0
            ? 'A Mauler is battering the door: pile fighters in there!'
            : `A Mauler is loose in the ${where ? levelName(this.game.content, where) : 'homestead'}: send everyone armed!`;
    } else if (raid) {
      text = (raid.warning ?? 0) > 0 ? `Raiders on the way (${Math.ceil(raid.warning ?? 0)}s): drag armed residents to the door!` : raid.doorHp > 0 ? 'Raiders are breaking in: drag fighters to the door!' : 'Raiders inside: drag armed residents into their room!';
    } else if (glass) {
      const where = state.rooms.find((r) => r.id === glass.roomId);
      text = `Glassbacks in the ${where ? levelName(this.game.content, where) : 'homestead'}: they jump rooms, so chase them with armed residents`;
    } else if (state.incidents.length) {
      text = 'Incident! Drag residents into the affected room to deal with it';
    } else if (waiting > 0) {
      text = `${waiting} resident${waiting > 1 ? 's' : ''} waiting: tap the door to let them in`;
    } else if (state.residents.some((r) => !r.waiting && !r.dead && !isAway(r) && r.roomId === null && !isChild(state, r))) {
      text = 'Drag idle residents into rooms to put them to work';
    }
    // The tutorial coach already says what to do next; only a shortage still needs the pill.
    if (this.coach.active() && !shortage) text = '';
    // On phones an open panel covers the bottom of the screen; the hint would sit on top of it.
    // A sheet collapsed to its bar leaves room above it, but the bar already says what to do.
    const phone = isPhone();
    const bar = this.sheetCollapsed();
    if (this.panel && (phone ? !bar || !shortage : this.panel === 'legacy' || this.panel === 'research')) text = '';
    this.hint.style.display = text ? '' : 'none';
    this.hint.classList.toggle('warn', !!shortage);
    this.hint.classList.toggle('raised', bar);
    if (this.hint.dataset.text !== text) {
      this.hint.dataset.text = text;
      this.hint.replaceChildren(...iconize(text));
    }
  }

  // ---------------------------------------------------------------- toolbar

  private renderToolbar(): void {
    const { state } = this.game;
    const crates = state.crates.standard + state.crates.rare + state.crates.legendary;
    const homeOrFallen = state.expeditions.filter((e) => e.status === 'returned' || e.status === 'dead').length;
    const office = this.quests.hasOffice();
    const questNeed = this.quests.attention();
    const legacyNeed = this.legacy.badge();
    const research = this.research.visible() ? this.research.badge() : -1;
    const factions = this.factions.visible() ? this.factions.badge() : -1;
    const compact = compactLayout();
    const key = `${this.panel}|${crates}|${state.items.length}|${homeOrFallen}|${compact}|${office}|${questNeed}|${legacyNeed}|${research}|${factions}`;
    if (key === this.lastToolbarKey) return;
    this.lastToolbarKey = key;
    // Every button is a painted icon and a word: side by side on desktop, the word as a
    // tiny caption under the icon on phones (so each keeps a 44 px target at 360 px).
    const phone = compact;
    const btn = (icon: string, label: string, kind: PanelKind, extra = '', badge?: number, title?: string) =>
      h(
        'button',
        {
          class: `${this.panel === kind ? 'active' : ''} ${extra} tb-art${phone ? ' captioned' : ''}`,
          title: title ?? label,
          'aria-label': title ?? label,
          'aria-pressed': this.panel === kind ? 'true' : 'false',
          onclick: () => {
            if (this.panel === kind) this.closePanel();
            else this.openPanel(kind);
          },
        },
        h('span', { class: 'tb-icon', 'aria-hidden': 'true' }, uiIcon(icon, { alt: '', fallback: '' })),
        h('span', { class: 'tb-cap', 'aria-hidden': 'true' }, label),
        badge ? h('span', { class: 'badge' }, badge) : null,
      );
    // Phones get short words. Crates open from the crate chip in the HUD; Legacy, Goals and
    // Factions move into the menu, whose badge carries Legacy's.
    this.toolbar.replaceChildren(
      btn('build', 'Build', 'build', 'build-btn'),
      btn('residents', phone ? 'People' : 'Residents', 'residents'),
      btn('storage', phone ? 'Items' : 'Storage', 'storage', 'storage-btn'),
      ...(phone ? [] : [btn('crates', 'Crates', 'crates', '', crates, 'Supply Crates')]),
      btn('explore', 'Explore', 'explore', '', homeOrFallen, 'Explore the Glarelands'),
      ...(office ? [btn('quests', 'Quests', 'quests', '', questNeed, 'Quests')] : []),
      ...(research >= 0 ? [btn('research', phone ? 'Lab' : 'Research', 'research', 'research-btn', research, 'Research')] : []),
      ...(factions >= 0 && !phone ? [btn('factions', 'Factions', 'factions', 'factions-btn', factions, 'Factions, trade and caravans')] : []),
      ...(phone ? [] : [btn('legacy', 'Legacy', 'legacy', 'legacy-btn', legacyNeed, 'Legacy'), btn('goals', 'Goals', 'achievements')]),
      btn('menu', 'Menu', 'menu', 'menu-btn', phone ? legacyNeed + Math.max(0, factions) : undefined, 'Menu'),
    );
  }

  // ---------------------------------------------------------------- panels

  openPanel(kind: PanelKind): void {
    if (kind !== this.panel) this.sheetOpen = false;
    this.endMove();
    // M8: the room sheet moved the camera to show its room; put it back.
    if (this.panel === 'room' && kind !== 'room') this.view.restoreCamera();
    // A fresh look at the list: no filter or search left over from last time.
    if (kind === 'residents' && this.panel !== 'residents') this.qol.people.opened();
    if (kind !== 'build') this.setBuildMode(null);
    if (kind !== 'residents') {
      this.residentId = null;
      this.view.selectedResidentId = null;
    }
    if (kind !== 'storage') {
      this.storageOpen = null;
      this.reforgeSel = null;
    }
    if (kind !== 'room') {
      this.roomId = null;
      this.view.selectedRoomId = null;
    }
    if (kind === 'legacy') this.legacy.opened();
    if (kind === 'deep') this.deep.opened();
    if (kind === 'notices') this.qol.notices.opened();
    // The tutorial's build steps open the list with their room already picked.
    const lead = kind === 'build' && this.panel !== 'build' && !this.view.buildMode ? this.coach.buildTarget() : null;
    this.panel = kind;
    if (lead) this.setBuildMode(lead);
    this.renderToolbar();
    this.renderPanel(true);
    if (lead) this.revealGhosts();
  }

  openRoom(id: number): void {
    // Set the room first: openPanel renders, and a room panel with no room closes itself.
    this.roomId = id;
    this.openPanel('room');
    this.view.selectedRoomId = id;
    this.renderPanel(true);
    // M8: if the sheet (or docked panel) now covers the room, glide it into the free space.
    const room = this.game.state.rooms.find((r) => r.id === id);
    if (room) {
      const ins = this.viewInsets();
      this.view.insets = ins;
      this.view.revealRoom(room, ins);
    }
  }

  closePanel(): void {
    this.openPanel(null);
  }

  /** M7: open the Factions panel on a tab (the trade tab can lead with one faction). */
  openFactions(tab?: FactionsTab, factionId?: string): void {
    this.factions.opened(tab, factionId);
    this.openPanel('factions');
  }

  /** M6: open the Deep panel on a tab. */
  openDeep(tab?: DeepTab): void {
    this.deep.opened(tab);
    this.openPanel('deep');
  }

  /** Room panel's Move button: show where this room can go (move mode). */
  private startMove(room: Room): void {
    this.setBuildMode(null);
    this.view.moveRoomId = room.id;
    this.view.selectedRoomId = room.id;
    this.view.rebuildGhosts();
    this.renderPanel(true);
    if (!this.view.ghostCount) this.toast('Nowhere to move it right now: it needs a gap as wide as the room, next to an elevator or room', 'bad');
    else this.revealGhosts();
  }

  /** Leave move mode. */
  private endMove(): void {
    if (this.view.moveRoomId === null) return;
    this.view.moveRoomId = null;
    this.view.rebuildGhosts();
  }

  private moveTo(floor: number, x: number): void {
    const { state, content } = this.game;
    const room = state.rooms.find((r) => r.id === this.view.moveRoomId);
    if (!room) {
      this.endMove();
      return;
    }
    const name = levelName(content, room);
    const res = this.game.run({ type: 'moveRoom', roomId: room.id, floor, x });
    if (!res.ok) {
      this.toast(res.reason, 'bad');
      haptic('error');
      this.view.rebuildGhosts();
      return;
    }
    haptic('success');
    // A merge keeps the left room's id: follow the room to wherever it ended up.
    const now = state.rooms.find((r) => r.id === room.id) ?? state.rooms.find((r) => r.floor === floor && r.x <= x && x < r.x + roomDef(content, r).cells * r.segments);
    this.toast(`Moved the ${name}: its crew and work came along`, 'good');
    this.endMove();
    if (now) this.openRoom(now.id);
    else this.renderPanel(true);
  }

  /** The bar shown while moving a room: what to do, the price, and Cancel. */
  private moveBar(): HTMLElement {
    const { state, content } = this.game;
    const room = state.rooms.find((r) => r.id === this.view.moveRoomId);
    const cost = room ? moveCost(state, content, room) : 0;
    const slots = this.view.ghostCount;
    return h(
      'div',
      { class: 'panel sheet-bar move-bar' },
      h(
        'div',
        { class: 'sb-text' },
        h('b', {}, `Move ${room ? levelName(content, room) : 'room'}`),
        h(
          'span',
          { class: `small${slots && state.scrip >= cost ? ' muted' : ' short'}` },
          !slots ? 'No free spot for a room this wide next to an elevator or room.' : state.scrip < cost ? `Needs ${fmt(cost)} scrip (you have ${fmt(state.scrip)})` : `Tap a green slot · ${fmt(cost)} scrip · crew and work come along`,
        ),
      ),
      h(
        'div',
        { class: 'sb-actions' },
        h(
          'button',
          {
            onclick: () => {
              this.endMove();
              this.renderPanel(true);
            },
          },
          'Cancel',
        ),
      ),
    );
  }

  private setBuildMode(type: string | null): void {
    if (type !== this.view.buildMode) {
      this.builtInMode = 0;
      this.sheetOpen = false;
    }
    this.view.buildMode = type;
    this.view.rebuildGhosts();
  }

  private isPhone(): boolean {
    return isPhone();
  }

  /**
   * M8: one press of Android back (or Escape). The topmost thing closes first:
   * a confirm or modal, then the panel (a placing sheet steps back to its list),
   * then the quest screen. False when there was nothing to close.
   */
  private back(): boolean {
    // Confirms are appended last, so the topmost layer is the last in document order.
    const layers = [...this.root.querySelectorAll<HTMLElement>('.modal-backdrop, .found-flow')].filter((el) => el.getClientRects().length > 0);
    const top = layers[layers.length - 1];
    if (top) {
      // The Found flow has its own ✕ (which asks before throwing the draft away).
      if (top.classList.contains('found-flow')) top.querySelector<HTMLElement>('.ff-close')?.click();
      // Every modal closes on a click on its own backdrop; ones that must be answered ignore it.
      else top.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    }
    if (this.quests.screen.isOpen) {
      this.quests.screen.close();
      return true;
    }
    if (this.view.moveRoomId !== null) {
      this.endMove();
      this.renderPanel(true);
      return true;
    }
    if (!this.panel) return false;
    const bar = this.collapsible();
    if (this.panel === 'build' && this.view.buildMode) {
      // Placing a room: first shrink the sheet back to its bar, then step back to the room list.
      if (bar && this.sheetOpen) this.sheetOpen = false;
      else {
        this.setBuildMode(null);
        this.sheetOpen = true;
      }
      this.renderPanel(true);
      return true;
    }
    if (bar === 'assign' && this.sheetOpen) {
      this.sheetOpen = false;
      this.renderPanel(true);
      return true;
    }
    this.closePanel();
    return true;
  }

  /** The sheet was pulled down by its handle. */
  private swipeClose(): void {
    if (this.collapsible() && this.sheetOpen) {
      this.sheetOpen = false;
      this.renderPanel(true);
      return;
    }
    if (this.panel === 'build' && this.view.buildMode) this.setBuildMode(null);
    this.closePanel();
  }

  /** The resident whose card is open, if they can take a job right now (drag them to assign). */
  private assignee(): Resident | undefined {
    if (this.panel !== 'residents' || this.residentId === null || this.qol.people.bulk) return undefined;
    const { state } = this.game;
    const r = state.residents.find((x) => x.id === this.residentId);
    return r && !r.dead && !r.waiting && !isAway(r) && !isChild(state, r) ? r : undefined;
  }

  /** Phones: which sheet can shrink to a bar so the homestead stays usable. */
  private collapsible(): 'build' | 'assign' | null {
    if (!this.isPhone()) return null;
    if (this.panel === 'build' && this.view.buildMode) return 'build';
    if (this.assignee()) return 'assign';
    return null;
  }

  private sheetCollapsed(): boolean {
    return this.collapsible() !== null && !this.sheetOpen;
  }

  /** Screen space the DOM covers (HUD, toolbar, the open panel), so the camera can pan things out from under it. */
  private viewInsets(): { top: number; right: number; bottom: number } {
    const W = window.innerWidth;
    const H = window.innerHeight;
    // HALCY's tutorial bubble sits under the HUD: keep build slots out from under it too.
    const top = Math.max(this.hud.getBoundingClientRect().bottom, this.coach.visible() ? this.coach.el.getBoundingClientRect().bottom : 0);
    let bottom = H - this.toolbar.getBoundingClientRect().top;
    let right = 0;
    const p = this.panelHost.firstElementChild?.getBoundingClientRect();
    if (p && p.width > 0) {
      // Docked on the right (desktop) or a sheet along the bottom (phones). Wide panels cover it all: ignore.
      if (p.left > W * 0.4) right = W - p.left;
      else if (p.top > H * 0.3) bottom = Math.max(bottom, H - p.top);
    }
    return { top, right, bottom };
  }

  /** Just picked a room to build: bring a green slot into view if none is showing. */
  private revealGhosts(): void {
    this.view.insets = this.viewInsets();
    this.view.revealGhosts();
  }

  /** Why a room type has nowhere to go right now. */
  private noSlotReason(type: string): string {
    const { state, content } = this.game;
    const def = content.rooms[type];
    if (!def) return 'No free spot.';
    const built = state.rooms.filter((r) => r.type === type).length;
    if (def.maxBuilt !== undefined && built >= def.maxBuilt) return `You already have ${def.maxBuilt === 1 ? 'one' : def.maxBuilt}: only ${def.maxBuilt} per homestead.`;
    if (def.topside) return `No free spot on the surface: it needs a ${def.cells}-cell stretch of ground above the door or beside another surface building.`;
    const deep = def.minFloor !== undefined ? ` on floor ${def.minFloor + 1} or deeper` : '';
    if (def.category === 'elevator') return `No free spot: an elevator needs an empty cell above or below another elevator, or beside a room${deep}.`;
    return `No free spot: needs a ${def.cells}-cell gap next to an elevator or room${deep}. Build an elevator down to open up space.`;
  }

  /** Phones: the sheet shrunk to a bar with what to do and a way out. */
  private sheetBar(kind: 'build' | 'assign'): HTMLElement {
    const { state, content } = this.game;
    const expand = h(
      'button',
      {
        class: 'close',
        onclick: () => {
          this.sheetOpen = true;
          this.renderPanel(true);
          // The card opens in its row's place: bring it into view.
          if (kind === 'assign') this.qol.people.toTop();
        },
      },
      kind === 'build' ? '▴ Rooms' : '▴ Card',
    );
    if (kind === 'build') {
      const type = this.view.buildMode ?? '';
      const def = content.rooms[type];
      const cost = buildCost(state, content, type);
      const slots = this.view.ghostCount;
      const done = this.builtInMode > 0;
      return h(
        'div',
        { class: 'panel sheet-bar' },
        h(
          'div',
          { class: 'sb-text' },
          h('b', {}, `Build ${def?.name ?? type}`, def?.stat ? h('span', { class: 'stat-badge' }, STAT_LABEL[def.stat]) : null),
          h(
            'span',
            { class: `small${slots && state.scrip >= cost ? ' muted' : ' short'}` },
            !slots ? this.noSlotReason(type) : state.scrip < cost ? `Needs ${fmt(cost)} scrip (you have ${fmt(state.scrip)})` : `Tap a green slot · ${cost === 0 ? 'free' : `${fmt(cost)} scrip`}${done ? ` · ${this.builtInMode} built` : ''}`,
          ),
        ),
        h(
          'div',
          { class: 'sb-actions' },
          expand,
          h(
            'button',
            {
              class: done ? 'primary' : '',
              onclick: () => {
                this.setBuildMode(null);
                this.closePanel();
              },
            },
            done ? 'Done' : 'Cancel',
          ),
        ),
      );
    }
    const r = this.assignee();
    const top = r ? topStats(effectiveStats(content, r)) : [];
    return h(
      'div',
      { class: 'panel sheet-bar' },
      h(
        'div',
        { class: 'sb-text' },
        h('b', {}, r ? `${r.firstName} ${r.lastName}` : 'Assign'),
        h('span', { class: 'muted small' }, `Drag ${r ? r.firstName : 'them'} into a room. While you drag, rooms that use ${orList(top.map((k) => STAT_NAME[k]))} light up green.`),
      ),
      h(
        'div',
        { class: 'sb-actions' },
        expand,
        h(
          'button',
          {
            class: 'primary',
            onclick: () => {
              this.residentId = null;
              this.view.selectedResidentId = null;
              this.closePanel();
            },
          },
          'Done',
        ),
      ),
    );
  }

  /** The panel's ✕: while placing a room on a phone it only shrinks the sheet; Cancel is on the bar. */
  private headerClose(): void {
    if (this.collapsible() === 'build') {
      this.sheetOpen = false;
      this.renderPanel(true);
      return;
    }
    this.closePanel();
  }

  private renderPanel(force = false): void {
    if (!force && (this.panel === 'menu' || this.panel === null)) return;
    this.lastPanelRender = performance.now();
    if (!this.panel) {
      this.panelHost.replaceChildren();
      return;
    }
    if (this.panel === 'room' && this.view.moveRoomId !== null) {
      const next = this.moveBar();
      const cur = this.panelHost.firstElementChild;
      const key = `move|${this.view.moveRoomId}`;
      if (cur && this.panelKey === key) {
        if (cur.outerHTML !== next.outerHTML) morph(cur, next);
      } else this.panelHost.replaceChildren(next);
      this.panelKey = key;
      return;
    }
    const bar = this.sheetCollapsed() ? this.collapsible() : null;
    if (bar) {
      const next = this.sheetBar(bar);
      const cur = this.panelHost.firstElementChild;
      const barKey = `bar|${bar}|${this.view.buildMode}|${this.residentId}`;
      if (cur && this.panelKey === barKey) {
        if (cur.outerHTML !== next.outerHTML) morph(cur, next);
      } else this.panelHost.replaceChildren(next);
      this.panelKey = barKey;
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
      legacy: 'Legacy',
      achievements: 'Goals',
      menu: 'Menu',
      research: 'Research',
      deep: 'The Deep',
      notices: 'Notifications',
      factions: 'Factions',
      collection: 'Collection Log',
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
        body = this.qol.people.panel();
        break;
      case 'notices':
        body = this.qol.notices.panel(() => this.renderPanel(true));
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
      case 'legacy':
        body = this.legacy.panel();
        break;
      case 'achievements':
        body = this.achievementsPanel();
        break;
      case 'menu':
        body = this.menuPanel();
        break;
      case 'research':
        body = this.research.panel();
        break;
      case 'deep':
        body = this.deep.panel();
        break;
      case 'factions':
        body = this.factions.panel();
        break;
      case 'collection':
        body = this.collection.panel();
        break;
    }
    const panel = h(
      'div',
      { class: `panel ${this.panel}-sheet${this.panel === 'legacy' ? ' panel-wide legacy-panel' : this.panel === 'research' ? ' panel-wide research-panel' : this.panel === 'deep' ? ' deep-panel' : ''}` },
      h('div', { class: 'grab', 'aria-hidden': 'true' }),
      h(
        'header',
        {},
        h('h2', {}, title),
        h(
          'span',
          { class: 'header-actions' },
          this.collapsible() ? h('button', { class: 'close', title: 'Show the homestead', 'aria-label': 'Shrink the sheet', onclick: () => ((this.sheetOpen = false), this.renderPanel(true)) }, '▾') : null,
          h('button', { class: 'close', 'aria-label': 'Close', onclick: () => this.headerClose() }, '✕'),
        ),
      ),
      body,
    );
    // Only swap the DOM when something visible changed, so elements are not
    // replaced under the player's finger mid-tap. Scroll position is kept.
    const old = this.panelHost.firstElementChild;
    if (old && old.outerHTML === panel.outerHTML) return;
    // Same view: patch the live panel in place, which keeps the nodes under the
    // finger and the scroll position. A different view starts fresh at the top.
    const key = `${this.panel}|${this.roomId}|${this.storageTab}|${this.panel === 'legacy' ? this.legacy.tab : this.panel === 'deep' ? this.deep.tab : this.panel === 'factions' ? this.factions.tab : this.panel === 'collection' ? this.collection.tab : ''}`;
    if (old && key === this.panelKey) morph(old, panel);
    else this.panelHost.replaceChildren(panel);
    this.panelKey = key;
  }

  private buildPanel(): HTMLElement {
    const { state, content } = this.game;
    const items = content.roomList
      .filter((d) => d.buildable)
      .sort((a, b) => Number(!!a.topside) - Number(!!b.topside) || a.unlockPop - b.unlockPop)
      .flatMap((def, i, all) => {
        const unlocked = state.unlockedRooms.includes(def.id);
        const cost = buildCost(state, content, def.id);
        const selected = this.view.buildMode === def.id;
        const info = buildInfo(state, content, def);
        const surface = def.topside && def.produces ? `Surface · makes ${def.produces.resource} · uses ${def.stat ? STAT_NAME[def.stat] : '—'} · output follows the weather` : undefined;
        const what =
          ROOM_BLURB[def.id] ??
          trainingBlurb(def) ??
          surface ??
          info.what ??
          (def.produces
            ? `Makes ${def.produces.resource} · uses ${def.stat ? STAT_NAME[def.stat] : '—'}`
            : def.storage?.resource === 'population'
              ? `Houses residents · families start here`
              : def.category === 'elevator'
                ? 'Connects floors'
                : def.category === 'radio'
                  ? 'Broadcasts to attract new residents · uses Charm'
                  : def.storage
                    ? `Stores ${def.storage.resource}`
                    : '');
        const size = def.category === 'elevator' ? '' : def.maxSegments > 1 ? '' : ` · ${def.cells} cells, doesn't merge`;
        const noSlot = selected && this.view.ghostCount === 0;
        // M7: surface buildings get their own heading, after the underground rooms.
        const heading =
          def.topside && !all[i - 1]?.topside
            ? h('div', { class: 'topside-head' }, h('h3', { class: 'group' }, '☀ Topside'), h('div', { class: 'muted small' }, 'On the ground above the door, open to the weather. Good output, but the sky has a say.'))
            : null;
        const card = h(
          'div',
          {
            class: `list-item build-item${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}${this.coach.buildTarget() === def.id ? ' tut-pulse' : ''}`,
            onclick: () => {
              if (!unlocked) return;
              this.setBuildMode(selected ? null : def.id);
              this.renderPanel(true);
              if (!selected) this.revealGhosts();
            },
          },
          h(
            'div',
            { class: 'row' },
            h('b', {}, def.name, def.stat ? h('span', { class: 'stat-badge', title: `Uses ${STAT_NAME[def.stat]}` }, STAT_LABEL[def.stat]) : null),
            h('span', {}, unlocked ? (cost === 0 ? 'Free' : `${fmt(cost)} scrip`) : (info.lock ?? `🔒 pop ${def.unlockPop}`)),
          ),
          h('div', { class: 'muted' }, `${what}${size}`),
          noSlot ? h('div', { class: 'small short', style: 'margin-top:4px' }, this.noSlotReason(def.id)) : null,
          selected && !noSlot ? h('div', { class: 'small ok-text', style: 'margin-top:4px' }, `Tap a green slot in the homestead (${this.view.ghostCount} free)`) : null,
        );
        return heading ? [heading, card] : [card];
      });
    return h(
      'div',
      { class: 'body' },
      h('p', { class: 'muted' }, 'Pick a room, then tap a green slot. Rooms of the same type and level merge up to 3 wide, which is more efficient than separate rooms. The letters show which stat a room uses.'),
      ...items,
    );
  }

  private roomPanel(room: Room): HTMLElement {
    const { state, content } = this.game;
    const def = roomDef(content, room);
    const crew = residentsInRoom(state, room.id);
    const cap = roomCapacity(content, room);
    const parts: (HTMLElement | string | null)[] = [];

    const width = def.category === 'elevator' ? '' : def.maxSegments > 1 ? ` · ${room.segments} of ${def.maxSegments} wide` : ` · ${def.cells} cells, doesn't merge`;
    parts.push(h('div', { class: 'row muted' }, h('span', {}, `Level ${room.level}/${maxLevel(def)}${width}`), h('span', {}, def.stat ? `Needs ${STAT_NAME[def.stat]}` : '')));
    if (!room.powered) parts.push(h('div', { class: 'row', style: 'color:var(--danger)' }, '⚡ No power: this room is shut down'));
    const inc = state.incidents.find((i) => i.roomId === room.id);
    if (inc) parts.push(h('div', { class: 'row', style: 'color:var(--danger)' }, `${INCIDENT_TOAST[inc.type] ?? 'Incident!'}`));

    if (def.produces) {
      const secs = cycleSeconds(state, content, room);
      const left = secondsToReady(state, content, room);
      const out = tableValue(def.produces.output, room.level, room.segments);
      // Time left on this batch (the panel re-renders every half second, so it counts down).
      // Without a crew the timer never runs: say so rather than showing a dash.
      const timer = room.ready
        ? h('b', {}, 'READY')
        : !crew.length
          ? h('b', { class: 'short' }, 'Needs crew')
          : isFinite(left)
            ? h('b', { class: 'countdown', title: `A batch takes ${duration(secs)} with this crew` }, `Ready in ${duration(left)}`)
            : h('b', { class: 'short' }, room.powered ? 'Stopped' : 'No power');
      parts.push(h('div', { class: 'row' }, `Makes ${amount(out)} ${def.produces.resource} per batch`, timer));
    }
    if (def.storage) {
      const amt = tableValue(def.storage.amount, room.level, room.segments);
      parts.push(h('div', { class: 'row muted' }, `Adds ${amount(amt)} ${def.storage.resource === 'population' ? 'beds' : `${def.storage.resource} storage`}`));
    }
    if (def.category === 'radio') {
      const interval = radioInterval(state, content, room);
      parts.push(
        h('div', { class: 'row' }, 'Next broadcast', crew.length ? h('b', {}, duration(Math.max(0, interval - room.timer))) : h('b', { class: 'short' }, 'Needs a DJ')),
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

    // The room's everyday actions sit right under what it does.
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
    if (actions.length) parts.push(h('div', { class: 'row room-actions' }, ...actions));

    if (def.category === 'workshop') parts.push(...this.workshopSection(room));
    if (def.category === 'office') parts.push(...this.quests.officeSection());
    if (def.category === 'training') parts.push(...trainingSection(state, content, room));
    parts.push(...this.research.roomSection(room), ...this.deep.roomSection(room), ...this.topside.roomSection(room));

    if (cap > 0) parts.push(...this.crewGrid(room, crew, cap));

    parts.push(this.upgradeBox(room));

    if (room.type !== 'door' && room.type !== 'elevator') {
      const blocked = moveBlocked(state, content, room);
      const price = moveCost(state, content, room);
      parts.push(
        h(
          'div',
          { class: 'room-move' },
          h('span', { class: 'muted small' }, blocked ? `Can't move it now: ${blocked}.` : 'Move the whole room to another free spot. Its level, crew and work come along.'),
          h(
            'button',
            {
              disabled: !!blocked || state.scrip < price,
              title: state.scrip < price ? `Needs ${fmt(price)} scrip` : '',
              onclick: () => this.startMove(room),
            },
            `Move (${fmt(price)} scrip)`,
          ),
        ),
      );
    }
    if (room.type !== 'door') {
      parts.push(
        h(
          'div',
          { class: 'room-danger' },
          h('span', { class: 'muted small' }, 'Tear the room out for good. No refund; its crew goes idle.'),
          h(
            'button',
            {
              class: 'danger close',
              onclick: () =>
                ask({ title: `Demolish ${def.name}?`, text: `The room is torn out for good, with no refund. Its crew goes idle.${this.demolishLoss(room)}`, ok: 'Demolish', danger: true }, () => {
                  const res = this.game.run({ type: 'demolish', roomId: room.id });
                  if (!res.ok) this.toast(res.reason, 'bad');
                }),
            },
            'Demolish',
          ),
        ),
      );
    }
    return h('div', { class: 'body room-body' }, ...parts);
  }

  /** " 40 water won't fit in storage without it and will be lost.", or '' when nothing would be. */
  private demolishLoss(room: Room): string {
    const { state, content } = this.game;
    const without: GameState = { ...state, rooms: state.rooms.filter((r) => r.id !== room.id) };
    const lost = (['power', 'food', 'water', 'medpatch', 'purge'] as const)
      .map((k) => [k, Math.floor(state.resources[k] - resourceCapacity(without, content, k))] as const)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${fmt(n)} ${AWAY_RESOURCE[k]}`);
    if (!lost.length) return '';
    return ` ${lost.length > 1 ? `${lost.slice(0, -1).join(', ')} and ${lost[lost.length - 1]}` : lost[0]} won't fit in storage without it and will be lost.`;
  }

  /** Crew as a grid of slots: residents in the filled ones, dashed outlines for the free ones. */
  private crewGrid(room: Room, crew: Resident[], cap: number): HTMLElement[] {
    const { content } = this.game;
    const def = roomDef(content, room);
    const statOf = (r: Resident): string =>
      def.stat
        ? `${STAT_LABEL[def.stat]} ${effectiveStats(content, r)[def.stat]}`
        : def.category === 'workshop'
          ? topStats(effectiveStats(content, r))
              .slice(0, 2)
              .map((k) => `${STAT_LABEL[k]} ${effectiveStats(content, r)[k]}`)
              .join(' ')
          : `DMG ${Math.round(combatDamage(content, r) * 10) / 10}`;
    const slots: HTMLElement[] = crew.map((r) => {
      const tag = r.courtship ? ' ♥' : r.pregnancy ? ' 🤰' : '';
      return h(
        'div',
        { class: 'crew-slot filled' },
        h(
          'span',
          { class: 'crew-main' },
          h('b', { class: 'crew-name', title: `${r.firstName} ${r.lastName}` }, `${r.firstName} ${r.lastName}${tag}`),
          h('span', { class: 'crew-sub' }, h('span', {}, `L${r.level} · `), h('b', {}, statOf(r)), ' ', this.traits.fitBadge(r, room)),
        ),
        h(
          'button',
          {
            class: 'close crew-remove',
            title: `Take ${r.firstName} off this job`,
            'aria-label': `Remove ${r.firstName} ${r.lastName}`,
            onclick: () => (this.game.run({ type: 'assign', residentId: r.id, roomId: null }), this.renderPanel(true)),
          },
          '✕',
        ),
      );
    });
    for (let i = crew.length; i < cap; i++) slots.push(h('div', { class: 'crew-slot empty', 'aria-label': 'Empty slot' }, h('span', { class: 'muted small' }, 'Empty slot')));
    const out: HTMLElement[] = [h('h3', { class: 'group crew-head' }, `${def.category === 'door' ? 'Guards' : 'Crew'} ${crew.length}/${cap}`), h('div', { class: 'crew-grid' }, ...slots)];
    if (crew.length < cap) out.push(h('div', { class: 'muted small' }, 'Drag residents here to put them to work.'));
    return out;
  }

  /** What the next level brings, before → after, with the Upgrade button. */
  private upgradeBox(room: Room): HTMLElement | null {
    const { state, content } = this.game;
    const def = roomDef(content, room);
    const up = upgradeCost(content, room, state);
    if (up === null) return maxLevel(def) > 1 ? h('div', { class: 'upgrade-box maxed' }, h('span', { class: 'muted small' }, `Level ${room.level}: fully upgraded.`)) : null;
    const next = { ...room, level: room.level + 1 };
    const gains: [string, string, string][] = [];
    if (def.produces) gains.push([`${capitalize(def.produces.resource)} per batch`, amount(tableValue(def.produces.output, room.level, room.segments)), amount(tableValue(def.produces.output, next.level, room.segments))]);
    if (def.storage) {
      const what = def.storage.resource === 'population' ? 'Beds' : `${capitalize(def.storage.resource)} storage`;
      gains.push([what, amount(tableValue(def.storage.amount, room.level, room.segments)), amount(tableValue(def.storage.amount, next.level, room.segments))]);
    }
    if (def.category === 'door') gains.push(['Door strength', `${def.doorHp?.[room.level - 1] ?? 0}`, `${def.doorHp?.[room.level] ?? def.doorHp?.[room.level - 1] ?? 0}`]);
    const trainGain = trainingGain(state, content, room);
    if (trainGain) gains.push(trainGain);
    if (def.category === 'radio') gains.push(['Arrival chance', `${Math.round(radioChance(content, room) * 100)}%`, `${Math.round(radioChance(content, next) * 100)}%`]);
    const capNow = roomCapacity(content, room);
    const capNext = roomCapacity(content, next);
    if (capNext !== capNow) gains.push([def.category === 'door' ? 'Guards' : 'Crew', `${capNow}`, `${capNext}`]);
    if (def.category === 'workshop') {
      const unlocks = workshopRecipes(content, room).filter((r) => r.minLevel === next.level).length;
      if (unlocks) gains.push(['Recipes', `level ${room.level}`, `+${unlocks} ${next.level === 2 ? 'rare' : next.level === 3 ? 'legendary' : 'new'}`]);
    }
    const changed = gains.filter(([, a, b]) => a !== b);
    const newName = def.levelNames?.[room.level];
    const short = state.scrip < up;
    return h(
      'div',
      { class: 'upgrade-box' },
      h('div', { class: 'row', style: 'margin:0 0 4px' }, h('b', {}, `Upgrade to level ${next.level}`), newName && newName !== def.levelNames?.[room.level - 1] ? h('span', { class: 'muted small' }, `becomes ${newName}`) : null),
      changed.length
        ? h(
            'div',
            { class: 'upgrade-gains' },
            ...changed.map(([label, a, b]) => h('div', { class: 'gain' }, h('span', { class: 'muted' }, label), h('span', { class: 'gain-vals' }, h('span', { class: 'from' }, a), ' → ', h('b', { class: 'to' }, b)))),
          )
        : h('div', { class: 'muted small' }, 'A sturdier, better-looking room.'),
      h(
        'div',
        { class: 'row', style: 'margin:6px 0 0' },
        h('span', { class: `small ${short ? 'short' : 'muted'}` }, short ? `Need ${fmt(up - state.scrip)} more scrip` : `Costs ${fmt(up)} scrip`),
        h(
          'button',
          {
            class: 'primary',
            disabled: short,
            onclick: () => {
              const res = this.game.run({ type: 'upgrade', roomId: room.id });
              if (!res.ok) this.toast(res.reason, 'bad');
              this.renderPanel(true);
            },
          },
          `Upgrade · ${fmt(up)}`,
        ),
      ),
    );
  }

  private statusLine(r: Resident): string {
    const { state, content } = this.game;
    if (r.dead) return '☠ Fallen';
    if (isChild(state, r)) return `Child · grows up in ${duration((r.adultAt ?? 0) - state.time)}`;
    const bits: string[] = [];
    const training = trainingLine(state, content, r);
    if (training) bits.push(training);
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
    const where = away ? (r.quest !== null ? '⚔ On a quest' : r.caravan != null ? '🛒 With a caravan' : r.dead ? '☠ Fallen outside' : '🧭 Glarelands') : r.dead ? '☠ Fallen' : r.waiting ? 'At the door' : child ? 'Child' : room ? roomDef(content, room).name : 'Idle';
    const eff = effectiveStats(content, r);
    const top = topStats(eff);
    const max = r.maxHp;
    const hpPct = Math.max(0, (r.hp / max) * 100);
    const taintPct = Math.min(100, (r.taint / max) * 100);
    const stats = h(
      'div',
      { class: 'stats' },
      ...STAT_KEYS.map((k) =>
        h('span', { class: `${top.includes(k) ? 'hi' : ''}${eff[k] > r.stats[k] ? ' boosted' : ''}${this.statFlash.cls(r.id, k)}`, title: `${STAT_NAME[k]} ${r.stats[k]}${eff[k] > r.stats[k] ? ` +${eff[k] - r.stats[k]} from outfit` : ''}` }, `${STAT_LABEL[k]} ${eff[k]}`),
      ),
    );
    const legend = r.legendary ? legendDef(content, r.legendary) : undefined;
    const rarityTag = legend
      ? h('span', { class: 'legend-badge', title: 'Legendary resident' }, ':badge_legend:')
      : r.rarity !== 'common'
        ? h('span', { class: `rarity ${r.rarity}` }, r.rarity === 'legendary' ? '★' : '◆')
        : null;
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
      h('div', { class: 'row' }, h('span', { class: 'name-line' }, h('b', {}, rarityTag, ` ${r.firstName} ${r.lastName}`), detailed ? null : this.traits.topChip(r)), h('span', { class: 'muted' }, `L${r.level} · ${where}`)),
      stats,
      h('div', { class: 'hpbar' }, h('div', { class: 'hp', style: `width:${hpPct}%` }), h('div', { class: 'taint', style: `width:${taintPct}%` })),
    );
    const status = this.statusLine(r);
    if (status && !r.dead) card.append(h('div', { class: 'muted', style: 'margin-top:4px' }, status));
    if (!detailed) {
      const tip = this.traits.tip(r);
      if (tip) card.append(tip);
      return card;
    }

    const stop = (fn: () => void) => (e: Event) => {
      e.stopPropagation();
      fn();
    };
    const next = xpToNext(content, r.level);
    // M9: a legend's title and a way to their card.
    if (legend)
      card.append(
        h(
          'div',
          { class: 'row legend-line', style: 'margin:4px 0 2px' },
          h('span', { class: 'small' }, h('b', { class: 'legend-text' }, 'Legend'), ` · ${legend.title}`),
          h('button', { class: 'close', onclick: stop(() => this.legends.showCard(legend.id)) }, '★ Legend card'),
        ),
      );
    card.append(
      h(
        'div',
        { class: 'row muted' },
        h('span', {}, `HP ${Math.ceil(r.hp)}/${Math.ceil(effectiveMaxHp(r))}`),
        h('span', {}, `Mood ${Math.round(r.happiness)}%`),
        h('span', {}, `XP ${Math.floor(r.xp)}/${next}`),
      ),
    );
    // M6: traits, profession and mastery.
    const chips = this.traits.chips(r);
    if (chips) card.append(chips);
    const tip = this.traits.tip(r);
    if (tip) card.append(tip);
    const mastery = this.traits.mastery(r);
    if (mastery) card.append(mastery);
    const parents = [r.motherId, r.fatherId].map((id) => state.residents.find((x) => x.id === id)).filter((x): x is Resident => !!x);
    if (parents.length) card.append(h('div', { class: 'muted' }, `Child of ${parents.map((p) => p.firstName).join(' & ')}`));

    // Gear
    const weapon = r.weapon ? content.weapons[r.weapon] : undefined;
    const outfit = r.outfit ? content.outfits[r.outfit] : undefined;
    const weaponDef = r.weapon ? content.items[r.weapon] : undefined;
    const outfitDef = r.outfit ? content.items[r.outfit] : undefined;
    const gearRow = (label: string, text: HTMLElement | string, slot: 'weapon' | 'outfit', equipped: boolean) =>
      h(
        'div',
        { class: 'row gear' },
        h('span', { class: 'gear-what' }, h('span', { class: 'muted' }, `${label}: `), text),
        h(
          'span',
          {},
          !r.dead && !child && !away
            ? h(
                'button',
                {
                  class: 'close',
                  onclick: stop(() => this.gear.pickItem(r.id, slot)),
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
      gearRow('Weapon', weaponDef ? h('span', {}, itemLabel(weaponDef), h('span', { class: 'item-stats' }, ` · ${itemStats(weaponDef)}`)) : 'Fists · 1 dmg', 'weapon', !!weapon),
      gearRow('Outfit', outfitDef ? h('span', {}, itemLabel(outfitDef), h('span', { class: 'item-stats' }, ` · ${itemStats(outfitDef)}`)) : 'Halcyon jumpsuit', 'outfit', !!outfit),
    );

    const actions: HTMLElement[] = [];
    if (away) {
      // Out in the Glarelands: everything is managed from the expedition card.
      if (r.quest !== null) actions.push(h('button', { class: 'primary', onclick: stop(() => this.openPanel('quests')) }, 'View quest'));
      else if (r.caravan != null) actions.push(h('button', { class: 'primary', onclick: stop(() => this.openFactions('caravans')) }, 'View caravan'));
      else actions.push(h('button', { class: 'primary', onclick: stop(() => this.openPanel('explore')) }, 'View expedition'));
    } else if (r.dead) {
      actions.push(
        h(
          'button',
          {
            class: 'primary',
            disabled: !!reviveBlocked(state),
            title: reviveBlocked(state) ?? undefined,
            onclick: stop(() => {
              const res = this.game.run({ type: 'revive', residentId: r.id });
              this.toast(res.ok ? `${r.firstName} is back on their feet.` : res.reason, res.ok ? 'good' : 'bad');
            }),
          },
          reviveLabel(state, fmt(reviveCost(content, r))),
        ),
        h(
          'button',
          {
            class: 'danger',
            onclick: stop(() =>
              ask({ title: `Lay ${r.firstName} to rest?`, text: r.legendary ? 'Their other gear goes to storage. A legend can be sent for again later (Residents → Legends) and comes back with their signature gear.' : 'This is permanent. Their gear goes to storage.', ok: 'Lay to rest', danger: true }, () => {
                this.game.run({ type: 'layToRest', residentId: r.id });
                this.residentId = null;
                this.view.selectedResidentId = null;
                this.renderPanel(true);
              }),
            ),
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

  // ---------------------------------------------------------------- storage

  private storagePanel(): HTMLElement {
    const { state } = this.game;
    // Picking gear for someone always happens on the Items tab.
    const tab: StorageTab = this.storageTab;
    const salvageUnits = Object.values(state.salvage).reduce((a, b) => a + b, 0);
    const blueprints = state.recipes.length;
    const tabBtn = (id: StorageTab, label: string) =>
      h(
        'button',
        {
          class: tab === id ? 'active' : '',
          onclick: () => {
            this.storageTab = id;
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
    const reforging = this.reforgeSel !== null;
    // Drop picks that no longer exist (sold, scrapped, equipped).
    const sel = (this.reforgeSel ?? []).filter((id) => state.items.some((i) => i.id === id));
    if (this.reforgeSel) this.reforgeSel = sel;
    const firstDef = sel.length ? content.items[state.items.find((i) => i.id === sel[0])?.defId ?? ''] : undefined;
    const kind = this.storageKind;
    const count = (k: GearSlot) => state.items.filter((i) => content.items[i.defId]?.kind === k).length;

    const seg = (id: GearSlot | 'all', label: string, n: number) =>
      h(
        'button',
        {
          class: kind === id ? 'active' : '',
          'aria-pressed': kind === id ? 'true' : 'false',
          onclick: () => {
            this.storageKind = id;
            this.storageOpen = null;
            this.renderPanel(true);
          },
        },
        label,
        h('span', { class: 'n' }, `${n}`),
      );
    const filter = h('div', { class: 'segmented storage-kind', role: 'group', 'aria-label': 'Show' }, seg('all', 'All', state.items.length), seg('weapon', 'Weapons', count('weapon')), seg('outfit', 'Outfits', count('outfit')));

    const head = h(
      'div',
      { class: 'row storage-head' },
      h('span', {}, h('b', {}, `${state.items.length}/${itemCapacity(state, content)} items`), h('span', { class: 'muted small storage-more' }, ' · Storerooms add space')),
      reforging
        ? null
        : h(
            'button',
            {
              class: 'close nowrap',
              disabled: state.items.length < 3,
              title: 'Combine three items of the same kind and rarity for a chance at a better one',
              onclick: () => {
                this.reforgeSel = [];
                this.renderPanel(true);
              },
            },
            '⚗ Reforge…',
          ),
    );

    if (reforging) {
      const rows = state.items
        .map((i) => ({ item: i, def: content.items[i.defId] }))
        .filter((x): x is { item: Item; def: ItemDef } => !!x.def && (kind === 'all' || x.def.kind === kind))
        .sort((a, b) => RARITY_ORDER[a.def.rarity] - RARITY_ORDER[b.def.rarity] || a.def.name.localeCompare(b.def.name))
        .map(({ item, def }) => {
          const picked = sel.includes(item.id);
          const fits = !firstDef || (firstDef.kind === def.kind && firstDef.rarity === def.rarity);
          const usable = picked || (fits && sel.length < 3);
          return h(
            'div',
            {
              class: `list-item item-row pick${picked ? ' selected' : ''}${usable ? '' : ' locked'}`,
              onclick: () => {
                if (!usable) return;
                this.reforgeSel = picked ? sel.filter((id) => id !== item.id) : [...sel, item.id];
                this.renderPanel(true);
              },
            },
            h('div', { class: 'item-line' }, itemIcon(def.id, def.kind), h('span', { class: 'item-main' }, itemLabel(def), h('span', { class: 'item-stats' }, itemStats(def))), h('span', { class: `check${picked ? ' on' : ''}` }, picked ? '✓' : '')),
          );
        });
      return [head, this.reforgeBar(sel, firstDef), filter, ...rows];
    }

    const groups = groupItems(this.game, kind);
    const rows = groups.map(({ def, ids }) => {
      const open = this.storageOpen === def.id;
      const preview = scrapText(content, scrapPreview(content, def.id));
      const extra = this.itemExtra(def);
      const toggle = () => {
        this.storageOpen = open ? null : def.id;
        this.renderPanel(true);
      };
      return h(
        'div',
        { class: `list-item item-row r-${def.rarity}${open ? ' open' : ''}` },
        h(
          'div',
          {
            class: 'item-line',
            role: 'button',
            tabindex: 0,
            'aria-expanded': open ? 'true' : 'false',
            title: open ? 'Hide Sell and Scrap' : 'Tap for Sell and Scrap',
            onclick: toggle,
            onkeydown: (e: Event) => {
              const k = (e as KeyboardEvent).key;
              if (k === 'Enter' || k === ' ') {
                e.preventDefault();
                toggle();
              }
            },
          },
          itemIcon(def.id, def.kind),
          h('span', { class: 'item-main' }, itemLabel(def, ids.length), h('span', { class: 'item-stats' }, itemStats(def))),
          h(
            'button',
            {
              class: 'close equip-btn',
              title: `Give a ${def.name} to a resident`,
              onclick: (e: Event) => {
                e.stopPropagation();
                this.gear.pickResident(def.id);
              },
            },
            'Equip…',
          ),
          h('span', { class: 'item-more', 'aria-hidden': 'true' }, open ? '▴' : '▾'),
        ),
        open
          ? h(
              'div',
              { class: 'item-drawer' },
              extra,
              h(
                'div',
                { class: 'item-drawer-actions' },
                h(
                  'button',
                  {
                    class: 'close',
                    onclick: () => {
                      const id = ids[0];
                      if (id === undefined) return;
                      const res = this.game.run({ type: 'sell', itemId: id });
                      if (res.ok) this.toast(`Sold ${def.name} for ${sellValue(content, def.id)} scrip`);
                      if (ids.length <= 1) this.storageOpen = null;
                      this.renderPanel(true);
                    },
                  },
                  `Sell one · ${sellValue(content, def.id)} scrip`,
                ),
                h(
                  'button',
                  {
                    class: 'close',
                    title: preview ? `Scrap for about: ${preview}` : 'Break down into salvage',
                    onclick: () => {
                      const id = ids[0];
                      if (id === undefined) return;
                      const scrap = () => {
                        const res = this.game.run({ type: 'scrap', itemId: id });
                        if (!res.ok) this.toast(res.reason, 'bad');
                        if (ids.length <= 1) this.storageOpen = null;
                        this.renderPanel(true);
                      };
                      if (def.rarity === 'common') scrap();
                      else ask({ title: `Scrap ${def.name}?`, text: `It is ${def.rarity}.${preview ? ` You get about ${preview}.` : ''}`, ok: 'Scrap', danger: true }, scrap);
                    },
                  },
                  'Scrap one',
                ),
              ),
              preview ? h('div', { class: 'muted small' }, `Scrap gives about ${preview}.`) : null,
            )
          : null,
      );
    });
    const empty = state.items.length
      ? h('p', { class: 'muted' }, `No ${kind === 'weapon' ? 'weapons' : 'outfits'} in storage.`)
      : h('p', { class: 'muted' }, 'Nothing here yet. Open Supply Crates or explore the Glarelands to find gear.');
    return [
      head,
      filter,
      this.respecRow(),
      h('p', { class: 'muted small storage-hint' }, 'Tap an item to sell or scrap one; Equip… picks who gets it.'),
      ...(rows.length ? rows : [empty]),
    ];
  }

  /**
   * Respec: take every weapon, every outfit or both off everyone at home, into
   * storage, then hand them out again with Equip… (best fit first).
   */
  private respecRow(): HTMLElement {
    const { state, content } = this.game;
    const home = state.residents.filter((r) => !r.dead && !r.waiting && !isAway(r));
    const weapons = home.filter((r) => r.weapon).length;
    const outfits = home.filter((r) => r.outfit).length;
    const free = Math.max(0, itemCapacity(state, content) - state.items.length);
    const run = (slot: 'weapon' | 'outfit' | 'all', n: number, what: string) =>
      ask(
        {
          title: `Unequip all ${what}?`,
          text: `${n} item${n === 1 ? '' : 's'} go back to storage (${free} space${free === 1 ? '' : 's'} free${n > free ? ': the rest stay on' : ''}). Residents who are away keep theirs. Then use Equip… to hand them out again, best fit first.`,
          ok: 'Unequip',
        },
        () => {
          const res = this.game.run({ type: 'unequipAll', slot });
          this.toast(res.ok ? `Unequipped: ${res.detail}.` : res.reason, res.ok ? 'good' : 'bad');
          this.renderPanel(true);
        },
      );
    const auto = (slot: 'weapon' | 'outfit' | 'all', what: string) =>
      ask(
        {
          title: `Auto-equip ${what}?`,
          text: `Everyone at home trades in their ${what === 'gear' ? 'weapons and outfits' : what}, and the best go where they help most: outfits to the job that uses their stat, weapons to rooms under attack, the door, then rooms with the fewest armed defenders. Spares stay in storage. Residents who are away keep theirs.`,
          ok: 'Auto-equip',
        },
        () => {
          const res = this.game.run({ type: 'autoEquip', slot });
          this.toast(res.ok ? `Auto-equip: ${res.detail}.` : res.reason, res.ok ? 'good' : 'bad');
          this.renderPanel(true);
        },
      );
    const spareW = state.items.filter((i) => content.items[i.defId]?.kind === 'weapon').length;
    const spareO = state.items.filter((i) => content.items[i.defId]?.kind === 'outfit').length;
    return h(
      'div',
      { class: 'storage-respec-wrap' },
      h(
        'div',
        { class: 'row storage-respec' },
        h('span', { class: 'muted small' }, 'Auto-equip:'),
        h('button', { class: 'close primary', disabled: !(weapons + spareW), onclick: () => auto('weapon', 'weapons') }, 'Weapons'),
        h('button', { class: 'close primary', disabled: !(outfits + spareO), onclick: () => auto('outfit', 'outfits') }, 'Outfits'),
        h('button', { class: 'close primary', disabled: !(weapons + outfits + spareW + spareO), onclick: () => auto('all', 'gear') }, 'Both'),
      ),
      h(
      'div',
      { class: 'row storage-respec' },
      h('span', { class: 'muted small' }, 'Unequip:'),
      h('button', { class: 'close', disabled: !weapons || !free, onclick: () => run('weapon', weapons, 'weapons') }, `Weapons (${weapons})`),
      h('button', { class: 'close', disabled: !outfits || !free, onclick: () => run('outfit', outfits, 'outfits') }, `Outfits (${outfits})`),
      h('button', { class: 'close', disabled: !(weapons + outfits) || !free, onclick: () => run('all', weapons + outfits, 'gear') }, 'Both'),
      ),
    );
  }

  /** M9: "Rare find" for loot-only items (and where), plus the item's flavour line. */
  private itemExtra(def: ItemDef): HTMLElement | null {
    const { content } = this.game;
    const rare = isLootOnly(content, def.id);
    const flavor = (def as { flavor?: string }).flavor;
    if (!rare && !flavor) return null;
    const region = exclusiveRegionOf(content, def.id);
    const regionName = region ? (this.regions().find((r) => r.id === region)?.name ?? region) : null;
    return h(
      'span',
      { class: 'item-extra' },
      rare ? h('span', { class: 'rare-find' }, `✦ Rare find${regionName ? ` · ${regionName} only` : ''}`) : null,
      flavor ? h('span', { class: 'item-flavor' }, flavor) : null,
    );
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
              salvageIcon(s.id),
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
    // Loot-only items (boss drops, caches, region exclusives) have no blueprint.
    const special = Object.values(content.items)
      .filter((d) => d.rarity !== 'common' && !isLootOnly(content, d.id))
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
        h('span', { class: 'crate-label' }, crateArt(tier, 'crate-art'), h('b', {}, TIER_NAME[tier]), h('span', { class: 'muted' }, ` × ${state.crates[tier]}`)),
        h('button', { class: 'primary', disabled: state.crates[tier] < 1, onclick: () => this.openCrate(tier) }, 'Open'),
      ),
    );
    return h(
      'div',
      { class: 'body' },
      ...tiers,
      h('div', { class: 'row', style: 'margin-top:10px' }, h('b', {}, '🎟 Crate tokens'), h('span', {}, `${state.crateTokens}/${c.tokensPerCrate}`)),
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
    haptic('heavy');
    this.showCrate(tier, cards);
    this.renderPanel(true);
  }

  private cardView(card: CrateCard, i: number): HTMLElement {
    const { state, content } = this.game;
    let rarity = 'common';
    let icon: string | Node = '';
    let title = '';
    let sub = '';
    /** An item that went to storage: hand it straight to someone. */
    let equip: string | null = null;
    switch (card.kind) {
      case 'scrip':
        icon = uiIcon('scrip', { cls: 'lg' });
        title = `${fmt(card.amount)} scrip`;
        rarity = card.amount >= 500 ? 'rare' : 'common';
        break;
      case 'resource': {
        icon = uiIcon(card.resource, { cls: 'lg' });
        // What didn't fit in storage was sold on: the headline counts only what was kept.
        const kept = card.refund ? Math.floor(card.kept ?? 0) : Math.round(card.amount);
        const name = (n: number) => (card.resource === 'medpatch' ? (n === 1 ? 'Med-Patch' : 'Med-Patches') : card.resource === 'purge' ? 'Purge' : card.resource);
        if (card.refund && kept < 1) {
          title = `${fmt(Math.round(card.amount))} ${name(Math.round(card.amount))}`;
          sub = `Storage full: sold for ${fmt(card.refund)} scrip`;
        } else {
          title = `+${fmt(kept)} ${name(kept)}`;
          if (card.refund) sub = `${fmt(Math.round(card.amount) - kept)} more didn't fit: sold for ${fmt(card.refund)} scrip`;
        }
        break;
      }
      case 'tokens':
        icon = uiIcon('crate_token', { cls: 'lg' });
        title = `${fmt(card.amount)} crate tokens`;
        break;
      case 'fizz':
        icon = uiIcon('fizz', { cls: 'lg' });
        title = `${card.amount} Halcyon Fizz`;
        rarity = 'rare';
        sub = card.refund ? `Carrying the most you can: sold for ${fmt(card.refund)} scrip` : 'Brings an explorer home at once';
        break;
      case 'item': {
        const def = content.items[card.defId];
        rarity = card.rarity;
        icon = def ? itemIcon(def.id, def.kind, 'large') : '🧥';
        title = def?.name ?? card.defId;
        sub = def ? (def.kind === 'weapon' ? `${def.min}–${def.max} dmg` : bonusText(def.bonus)) : '';
        if (card.sold) sub += ` · storage full, sold for ${card.sold}`;
        else if (def) equip = card.defId;
        break;
      }
      case 'resident': {
        const r = state.residents.find((x) => x.id === card.residentId);
        rarity = card.rarity;
        icon = arrivalPortrait();
        title = r ? `${r.firstName} ${r.lastName}` : 'A new resident';
        sub = `${card.rarity} resident · waiting at the door`;
        break;
      }
    }
    const cardBack = artUrl('crates', 'card_back');
    return h(
      'div',
      { class: `crate-card ${rarity}`, style: `animation-delay:${i * 0.25}s` },
      h('div', { class: 'crate-card-inner' }, h('div', { class: `face back${cardBack ? ' art' : ''}`, style: cardBack ? `background-image:url("${cardBack}")` : undefined }), h(
          'div',
          { class: 'face front' },
          h('div', { class: 'card-icon' }, icon),
          h('b', {}, title),
          h('div', { class: 'muted' }, sub),
          equip ? h('button', { class: 'card-equip', onclick: () => equip && state.items.some((it) => it.defId === equip) && this.gear.pickResident(equip) }, 'Equip') : null,
        ),
      ),
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
          { class: `modal crate-modal ${tier}` },
          h('h2', { class: 'crate-modal-head' }, crateArt(tier, 'crate-art big'), TIER_NAME[tier]),
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
      const prize = a.crate ?? reward[a.tier];
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
      h('div', { class: 'row' }, h('b', {}, `${done} / ${total} earned`), h('span', { class: 'muted' }, 'Every one counts toward the Seal')),
      h('div', { class: 'progress', style: 'margin-bottom:10px' }, h('div', { style: `width:${(done / total) * 100}%;background:var(--accent)` })),
      this.endings.goalsSection(),
      this.collection.sealSection(),
      ...items,
    );
  }

  private menuPanel(): HTMLElement {
    return h(
      'div',
      { class: 'body' },
      // Phones keep the toolbar short: Goals lives here.
      compactLayout()
        ? h(
            'div',
            { class: 'row menu-links', style: 'justify-content:flex-start;margin-top:0;gap:6px;flex-wrap:wrap' },
            h('button', { class: 'legacy-btn', onclick: () => this.openPanel('legacy') }, '◆ Legacy', this.legacy.badge() ? h('span', { class: 'badge' }, this.legacy.badge()) : null),
            h('button', { onclick: () => this.openPanel('achievements') }, '🏆 Goals'),
            this.factions.visible() ? h('button', { onclick: () => this.openFactions() }, '🤝 Factions', this.factions.badge() ? h('span', { class: 'badge' }, this.factions.badge()) : null) : null,
          )
        : null,
      h(
        'div',
        { class: 'row menu-links', style: 'justify-content:flex-start;margin-top:0;gap:6px;flex-wrap:wrap' },
        h('button', { onclick: () => this.openPanel('collection') }, '📖 Collection Log'),
        h('button', { onclick: () => this.openPanel('residents') }, '★ Legends'),
      ),
      endingTitle(this.game.state) ? h('p', { class: 'end-menu-title' }, `✦ Title: ${endingTitle(this.game.state)} (change it in Goals → Endings)`) : null,
      h('h3', { class: 'group menu-head' }, 'Settings'),
      settingsPanel(this.game),
      h('h3', { class: 'group menu-head' }, 'Saves'),
      h('p', { class: 'muted', style: 'margin-top:0' }, `The game saves automatically ${isNative() ? 'on this device' : 'in this browser'}. Keep copies in the slots below, or export them to a file.`),
      this.qol.saves.section(),
      h(
        'div',
        { class: 'menu-danger' },
        h('h3', { class: 'group menu-head' }, 'Start over'),
        h(
          'div',
          { class: 'row', style: 'margin:0' },
          h('span', { class: 'muted small' }, 'Replaces this homestead. A backup is kept until the next load.'),
          h(
            'button',
            {
              class: 'danger',
              onclick: () =>
                ask({ title: 'Start a new homestead?', text: 'Your current one is replaced. A copy is kept under Backups until the next load.', ok: 'Start over', danger: true }, () => {
                  if (!this.game.reset()) {
                    this.toast("Couldn't start over, so nothing was replaced. Storage may be full: export a copy first.", 'bad');
                    return;
                  }
                  this.closePanel();
                  if (!this.coach.active()) this.showWelcome();
                }),
            },
            'New homestead',
          ),
        ),
      ),
      h(
        'p',
        { class: 'muted small menu-version' },
        `Homestead ${typeof __APP_VERSION__ === 'string' ? `v${__APP_VERSION__}` : 'dev build'}`,
        isPhone() || isNative() || !(window as unknown as { homestead?: unknown }).homestead ? null : h('span', { class: 'dev-hint' }, ' · Developer console: window.homestead'),
      ),
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
      // Only those still out there: a returned explorer is home, waiting to be collected.
      const here = state.expeditions.filter((e) => e.regionId === rg.id && (e.status === 'exploring' || e.status === 'returning')).length;
      return h(
        'div',
        { class: `list-item region-card${open ? '' : ' locked'}${artUrl('regions', rg.id) ? ' has-banner' : ''}` },
        regionBanner(rg.id, h('div', { class: 'row', style: 'margin:0' }, h('b', {}, open ? rg.name : `🔒 ${rg.name}`), dangerPips(rg.danger))),
        h('div', { class: 'muted' }, rg.description),
        here ? h('div', { class: 'muted small', style: 'margin-top:4px' }, `${here} explorer${here === 1 ? '' : 's'} out here`) : null,
        ...this.regionLoot(rg.id, open),
      );
    });
    const maps = state.loot?.maps ?? [];
    const undug = maps.filter((m) => !m.found);
    const order: Record<Expedition['status'], number> = { returned: 0, dead: 1, returning: 2, exploring: 3 };
    const exps = [...state.expeditions].sort((a, b) => order[a.status] - order[b.status] || a.id - b.id);
    return h(
      'div',
      { class: 'body' },
      undug.length
        ? h(
            'div',
            { class: 'map-banner' },
            h('b', {}, `🗺 ${undug.length} treasure map${undug.length === 1 ? '' : 's'} to dig up`),
            h('div', { class: 'muted small' }, `Send an explorer to ${orList([...new Set(undug.map((m) => this.regions().find((r) => r.id === m.regionId)?.name ?? m.regionId))])}. The longer they stay, the better the odds they find the spot.`),
          )
        : null,
      ...regionCards,
      h(
        'div',
        { class: 'row' },
        h('b', {}, `Explorers ${out}/${MAX_EXPLORERS}`),
        h('span', { class: 'muted small fizz-count', title: 'Halcyon Fizz: brings an explorer home at once' }, `🥤 ${fizzHeld(state)} Fizz`),
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

  /** M9: a region's treasure maps (with a "dig here" hint) and the loot found only there. */
  private regionLoot(regionId: string, open: boolean): HTMLElement[] {
    const { state, content } = this.game;
    const out: HTMLElement[] = [];
    for (const m of (state.loot?.maps ?? []).filter((x) => x.regionId === regionId)) {
      const cache = cacheDef(content, m.cacheId);
      out.push(
        h(
          'div',
          { class: `map-line${m.found ? ' found' : ''}` },
          h('span', {}, m.found ? '✓ ' : '🗺 ', h('b', {}, cache?.name ?? 'A treasure map')),
          h('span', { class: 'muted small' }, m.found ? ' dug up' : open ? ' · dig here: send an explorer to this region' : ' · this region is still locked'),
        ),
      );
    }
    const ex = lootContent(content).regionExclusives[regionId];
    if (ex && typeof ex === 'object' && ex.items.length) {
      const logged = new Set(state.collection?.items ?? []);
      out.push(
        h(
          'div',
          { class: 'exclusive-line small' },
          h('span', { class: 'muted' }, 'Only found here: '),
          ...ex.items.map((id, i) => {
            const d = content.items[id];
            const seen = logged.has(id);
            return h('span', { class: `rarity ${d?.rarity ?? 'rare'}${seen ? '' : ' unseen'}`, title: seen ? 'In your Collection Log' : 'Not found yet' }, `${i ? ', ' : ''}✦ ${d?.name ?? id}${seen ? ' ✓' : ''}`);
          }),
        ),
      );
    }
    return out;
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
    if (e.status === 'exploring' || e.status === 'returning') {
      if (e.status === 'exploring') actions.push(h('button', { onclick: () => this.expCmd({ type: 'recall', expeditionId: e.id }) }, 'Recall'));
      // Halcyon Fizz: home right now, for a bottle or for scrip.
      const who = r?.firstName ?? 'They';
      const done = body ? `${who}'s body is home.` : `${who} is home. Collect when you're ready.`;
      const fizz = fizzButton(this.game, 'explorer', e.id, { done, after: (ok, text) => (this.toast(text, ok ? 'good' : 'bad'), this.renderPanel(true)) });
      if (fizz) actions.push(fizz);
    } else if (e.status === 'returned') {
      actions.push(h('button', { class: 'primary', onclick: () => this.expCmd({ type: 'collectExpedition', expeditionId: e.id }) }, 'Collect'));
    } else if (e.status === 'dead' && r) {
      const cost = reviveCost(content, r);
      actions.push(
        h(
          'button',
          {
            class: 'primary',
            disabled: state.scrip < cost || !!reviveBlocked(state),
            title: reviveBlocked(state) ?? undefined,
            onclick: () => this.expCmd({ type: 'revive', residentId: r.id }, `${r.firstName} is back on their feet and exploring.`),
          },
          reviveLabel(state, fmt(cost)),
        ),
        h(
          'button',
          {
            class: 'danger',
            onclick: () =>
              ask({ title: `Bring ${r.firstName}'s body home?`, text: 'Half of what they carried is lost on the way.', ok: 'Recall body', danger: true }, () => this.expCmd({ type: 'recall', expeditionId: e.id })),
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
    const { state } = this.game;
    // Default to the best-armed healthy resident; the injured only if nobody else can go.
    const ranked = this.explorerCandidates();
    const healthy = ranked.find((r) => r.hp >= effectiveMaxHp(r) * 0.5);
    const first = residentId ?? (healthy ?? ranked[0])?.id ?? null;
    const open = this.regions().filter((rg) => state.regionsUnlocked.includes(rg.id));
    // Half the stock by default, so there is some left at home.
    const half = (k: 'medpatch' | 'purge') => Math.min(this.supplyMax(k), Math.floor(Math.floor(state.resources[k]) / 2));
    this.exploreDraft = {
      residentId: first,
      regionId: open[0]?.id ?? state.regionsUnlocked[0] ?? 'dustbowl',
      medpatch: half('medpatch'),
      purge: half('purge'),
    };
    this.renderExploreModal(residentId === null);
  }

  /** Who can explore now, in the order the Send dialog offers them. */
  private explorerCandidates(): Resident[] {
    return explorerCandidates(this.game.state, this.game.content);
  }

  /** An unarmed explorer while a weapon sits in storage: offer the best one before they go. */
  private spareWeaponHint(res: Resident, rerender: () => void): HTMLElement | null {
    const { state, content } = this.game;
    if (res.weapon) return null;
    let best: { id: number; name: string; avg: number } | null = null;
    for (const item of state.items) {
      const w = content.weapons[item.defId];
      if (!w) continue;
      const avg = (w.min + w.max) / 2;
      if (!best || avg > best.avg) best = { id: item.id, name: w.name, avg };
    }
    if (!best) return null;
    const pick = best;
    return h(
      'div',
      { class: 'row small', style: 'margin-top:6px;gap:8px' },
      h('span', { class: 'short' }, `⚠ Unarmed, and a ${pick.name} is in storage.`),
      h(
        'button',
        {
          onclick: () => {
            const out = this.game.run({ type: 'equip', residentId: res.id, itemId: pick.id });
            if (!out.ok) this.toast(out.reason, 'bad');
            rerender();
          },
        },
        `Arm with ${pick.name}`,
      ),
    );
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
      const eligible = this.explorerCandidates();
      const select = h(
        'select',
        {
          class: 'picker',
          onchange: (ev: Event) => {
            d.residentId = Number((ev.target as HTMLSelectElement).value);
            again();
          },
        },
        ...eligible.map((r) => {
          const w = r.weapon ? content.weapons[r.weapon] : undefined;
          const hurt = r.hp < effectiveMaxHp(r) * 0.5 ? ' · hurt' : '';
          const idle = r.roomId === null ? ' · idle' : '';
          return h('option', { value: r.id, selected: r.id === d.residentId }, `${r.firstName} ${r.lastName} · L${r.level} · HP ${Math.ceil(r.hp)} · ${w ? `${w.min}–${w.max} dmg` : 'unarmed'}${hurt}${idle}`);
        }),
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
        this.spareWeaponHint(res, again),
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
        regionBanner(rg.id, h('div', { class: 'row', style: 'margin:0' }, h('b', {}, open ? rg.name : `🔒 ${rg.name}`), dangerPips(rg.danger))),
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
        h('span', {}, label, h('span', { class: 'muted small' }, ` · ${Math.floor(state.resources[kind])} in stock, ${Math.max(0, Math.floor(state.resources[kind]) - d[kind])} stay home`)),
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

    const loadouts = this.qol.loadouts.bar({
      kind: 'explore',
      current: () => ({ ids: d.residentId !== null ? [d.residentId] : [], medpatch: d.medpatch, purge: d.purge, regionId: d.regionId }),
      apply: (l) => {
        const note = this.qol.loadouts.applyExplore(l, d, pickResident);
        if (note) this.toast(note, 'bad');
        again();
      },
      rerender: again,
    });

    this.modalHost.replaceChildren(
      h(
        'div',
        { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && close() },
        h(
          'div',
          { class: 'modal explore-modal' },
          h('h2', {}, 'Into the Glarelands'),
          loadouts,
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
            h('b', { class: 'countdown' }, done ? 'READY' : isFinite(left) ? `Ready in ${duration(left)}` : 'Stalled'),
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
                    onclick: () =>
                      ask({ title: `Cancel crafting ${def?.name ?? 'this item'}?`, text: 'Salvage and scrip are refunded.', ok: 'Cancel the job', cancel: 'Keep crafting', danger: true }, () =>
                        this.craftCmd({ type: 'cancelCraft', roomId: room.id }, 'Job cancelled. Materials refunded.'),
                      ),
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
    const crew = workersInRoom(state, room.id).length ? crewCraftStat(state, content, room, recipe.defId) : 0;
    const stats = `${itemStats(def)} · ${STAT_NAME[def.craftStat]}${crew ? ` (crew ${Math.round(crew * 10) / 10})` : ''}`;
    const head = (extra: HTMLElement | null) =>
      h('div', { class: 'recipe-head' }, itemIcon(def.id, def.kind), h('span', { class: 'recipe-title' }, itemLabel(def), h('span', { class: 'item-stats' }, stats)), extra);
    if (!knowsRecipe(state, content, recipe.defId)) {
      const have = state.fragments[recipe.defId] ?? 0;
      const need = Math.max(1, fragmentsNeeded(content, recipe.defId));
      return h(
        'div',
        { class: 'list-item recipe locked-recipe' },
        head(h('span', { class: 'muted nowrap' }, `🔒 📜 ${have}/${need}`)),
        h('div', { class: 'progress' }, h('div', { style: `width:${Math.min(100, (have / need) * 100)}%;background:var(--${def.rarity})` })),
        h('div', { class: 'muted small' }, 'Blueprint fragments needed'),
      );
    }
    const why = canCraft(state, content, room, recipe.defId);
    const secs = craftSeconds(state, content, room, recipe.defId);
    const costs = Object.entries(recipe.salvage).map(([id, n]) => {
      const s = content.salvage[id];
      const have = salvageCount(state, id);
      return h(
        'span',
        { class: `cost ${have >= n ? 'ok' : 'short'}`, title: s ? `${s.name} (${s.rarity}): need ${n}, have ${have}` : id },
        h('span', { class: `rarity ${s?.rarity ?? 'common'}` }, RARITY_MARK[s?.rarity ?? 'common']),
        ` ${s?.name ?? id} `,
        h('span', { class: 'need' }, `need ${n} · have ${have}`),
      );
    });
    const scripOk = state.scrip >= recipe.scrip;
    return h(
      'div',
      { class: 'list-item recipe' },
      head(null),
      h('div', { class: 'costs' }, ...costs, h('span', { class: `cost ${scripOk ? 'ok' : 'short'}` }, `💰 ${fmt(recipe.scrip)} scrip`)),
      h(
        'div',
        { class: 'row recipe-foot' },
        h('span', { class: 'muted small' }, room.job ? '' : why ?? ''),
        h(
          'span',
          { class: 'recipe-go' },
          h('span', { class: 'muted small nowrap', title: 'Craft time with this crew' }, `⏱ ${duration(secs)}`),
          h('button', { class: 'primary close', disabled: !!why, title: why ?? `Craft ${def.name}`, onclick: () => this.craftCmd({ type: 'craft', roomId: room.id, defId: recipe.defId }) }, 'Craft'),
        ),
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
    this.legacy.onEvents(events);
    this.research.onEvents(events);
    this.deep.onEvents(events);
    this.traits.onEvents(events);
    this.qol.onEvents(events);
    this.topside.onEvents(events);
    this.factions.onEvents(events);
    this.legends.onEvents(events);
    this.endings.onEvents(events);
    this.coach.onEvents(events);
    this.statFlash.note(events);
    this.escaped.clear();
    for (const ev of events) if (ev.type === 'incidentEscaped') this.escaped.add(ev.incidentId);
    const incName = (type: string) => (content.balance.incidents.types as Record<string, { name: string }>)[type]?.name ?? 'Incident';
    const roomName = (id: number) => {
      const room = this.game.state.rooms.find((r) => r.id === id);
      return room ? levelName(content, room) : 'homestead';
    };
    for (const ev of events) {
      if (ev.type === 'expeditionStarted') this.explorerOf.set(ev.expeditionId, ev.residentId);
      switch (ev.type) {
        case 'achievementUnlocked': {
          const a = content.achievements.find((x) => x.id === ev.achievementId);
          if (a) this.toast(`🏆 ${a.name}: ${a.description}`, 'gold', { fold: 'achievement', low: true });
          break;
        }
        case 'roomUnlocked': {
          const d = content.rooms[ev.roomType];
          // Research-gated rooms get their own toast (research.ts).
          if (d && !d.requiresResearch) this.toast(`New room unlocked: ${d.name}`, 'gold');
          break;
        }
        case 'incidentStarted': {
          const inc = this.game.state.incidents.find((i) => i.id === ev.incidentId);
          if (ev.incident === 'maulers' && (inc?.warning ?? 0) > 0) this.toast(`:inc_maulers: A Mauler has been spotted crossing the flats. It reaches the door in ${Math.ceil(inc?.warning ?? 0)}s: arm your door guards!`, 'bad');
          else this.toast(INCIDENT_TOAST[ev.incident] ?? 'Incident!', 'bad');
          if (ev.incident === 'maulers') haptic('warning');
          break;
        }
        case 'doorBreached': {
          const inc = this.game.state.incidents.find((i) => i.id === ev.incidentId);
          this.toast(inc?.type === 'maulers' ? 'The Mauler smashed through the door!' : 'The raiders broke through the door!', 'bad');
          break;
        }
        case 'incidentMoved':
          this.toast(ev.incident === 'glassbacks' ? `:inc_glassbacks: The Glassbacks jumped into the ${roomName(ev.roomId)}!` : `${incName(ev.incident)} moved into the ${roomName(ev.roomId)}.`, 'bad', { fold: `moved-${ev.incidentId}` });
          break;
        case 'incidentEscaped':
          this.toast(
            ev.incident === 'maulers'
              ? 'The Mauler lumbered off into the Glarelands. HALCY is fairly sure it will be back.'
              : ev.incident === 'glassbacks'
                ? 'The Glassbacks burrowed back out through the walls. Nobody is sure where to.'
                : `${incName(ev.incident)} left on its own.`,
            undefined,
            { fold: 'escaped' },
          );
          break;
        case 'maulerStirring':
          haptic('warning');
          this.toast(`:inc_maulers: Something big has noticed all the noise (Mauler meter ${Math.round(ev.meter * 100)}%). Arm the door, staff a Watchtower, keep the door shut.`, 'bad');
          break;
        case 'bossFirstKill': {
          const enemy = questContent(content).enemies[ev.enemyId];
          const item = content.items[ev.defId];
          haptic('success');
          this.toast(`☠ First kill: ${enemy?.name ?? 'the boss'}! ${item ? `${item.name} goes in the loot` : 'A trophy goes in the loot'} (paid if the quest succeeds).`, 'gold');
          break;
        }
        case 'treasureMapFound': {
          const cache = cacheDef(content, ev.cacheId);
          const region = this.regions().find((r) => r.id === ev.regionId)?.name ?? ev.regionId;
          this.toast(`🗺 Treasure map: ${cache?.name ?? 'a cache'} in ${region}. Send an explorer there to dig.`, 'gold');
          break;
        }
        case 'cacheDug': {
          const cache = cacheDef(content, ev.cacheId);
          this.toast(`⛏ ${this.explorerName(ev.expeditionId)} dug up ${cache?.name ?? 'a cache'}! It comes home with them.`, 'gold');
          break;
        }
        case 'collectionLogged': {
          if (this.game.state.time < 5 || this.game.flushingAway) break;
          if (ev.category !== 'residents' && ev.category !== 'regions' && ev.category !== 'creatures') break;
          const entry = collectionEntries(this.game.state, content, ev.category as CollectionCategory).find((x) => x.id === ev.id);
          this.toast(`📖 Collection Log: ${entry?.name ?? ev.id}`, undefined, { fold: 'collection', low: true });
          break;
        }
        case 'incidentResolved':
          if (this.escaped.has(ev.incidentId)) break;
          if (ev.incident === 'maulers') this.toast(ev.loot > 0 ? `The Mauler is down! Recovered ${ev.loot} scrip, and a lot of paperwork.` : 'The Mauler is gone.', ev.loot > 0 ? 'gold' : undefined);
          else if (ev.incident === 'rustmen') this.toast(ev.loot > 0 ? `Raiders repelled! Recovered ${ev.loot} scrip.` : 'The raiders got away with their loot.', ev.loot > 0 ? 'good' : 'bad');
          else if (!this.game.state.incidents.some((i) => i.type === ev.incident)) this.toast(`${(content.balance.incidents.types as Record<string, { name: string }>)[ev.incident]?.name ?? 'Incident'} dealt with.`, 'good');
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
        case 'statTrained':
          // Offline gains are listed in the away report instead of a burst of toasts.
          if (!this.game.flushingAway) statTrainedToast(this.game.state, content, ev, (text, kind, opts) => this.toast(text, kind, opts));
          break;
        case 'grewUp':
          this.toast(`${this.name(ev.residentId)} is all grown up and ready to work.`, 'good', { fold: true, low: true });
          break;
        case 'residentArrived':
          if (ev.source === 'recruit') this.toast(`👤 ${this.name(ev.residentId)}, your new recruit, is at the door. Tap it to let them in.`, 'gold');
          else if (ev.source !== 'crate') this.toast(ev.source === 'radio' ? `📻 ${this.name(ev.residentId)} heard your broadcast and is at the door.` : `A stranger, ${this.name(ev.residentId)}, is knocking at the door.`, undefined, { fold: 'arrival' });
          break;
        case 'crateEarned':
          this.toast(`📦 ${TIER_NAME[ev.tier]} earned (${ev.source})`, ev.tier === 'standard' ? 'good' : 'gold', { fold: `crate-${ev.tier}`, low: true });
          break;
        case 'suppliesLost':
          this.toast(`Storage full: ${fmt(ev.amount)} ${AWAY_RESOURCE[ev.key] ?? ev.key} didn't fit and were left behind.`, 'bad', { fold: `lost-${ev.key}` });
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
          this.toast(`📜 Blueprint fragment: ${d?.name ?? ev.defId} (${ev.have}/${ev.need})`, 'good', { fold: 'fragment' });
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
      this.toast(`🧭 ${this.explorerName(id)}: ${entry.text}${n > 1 ? ` (+${n - 1} more)` : ''}`, tone, { low: entry.kind === 'levelup' || entry.kind === 'musing' });
    }
  }

  /** game.state was swapped for another homestead: drop every panel, modal and id that pointed into the old one. */
  private onStateReplaced(): void {
    if (this.quests.screen.isOpen) this.quests.screen.close();
    this.legacy.onStateReplaced();
    this.deep.onStateReplaced();
    this.qol.onStateReplaced();
    this.factions.onStateReplaced();
    this.coach.onStateReplaced();
    this.modalHost.replaceChildren();
    this.exploreDraft = null;
    this.explorerOf.clear();
    this.openJournals.clear();
    this.storageOpen = null;
    this.reforgeSel = null;
    this.closePanel();
    this.lastToolbarKey = '';
    this.panelKey = '';
  }

  toast(text: string, kind?: ToastKind, opts?: ToastOptions): void {
    this.toastStack.show(text, kind, opts);
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
      h('p', { class: 'halcy-quote' }, halcyFace('smile'), `HALCY here! Congratulations on your appointment as Warden of Halcyon Homestead ${n}. Your founding residents are waiting at the door, and Halcyon has sent a few Supply Crates to get you started.`),
      h(
        'ol',
        { class: 'welcome-steps muted' },
        h('li', {}, 'Tap the door to let them in.'),
        h('li', {}, 'Drag residents into rooms that match their best stat: those rooms light up green while you drag.'),
        h('li', {}, 'Tap rooms to collect, open your Supply Crates, and build to grow.'),
      ),
      h('p', { class: 'muted small', style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap' }, 'Just want to tinker?', customGameButton(() => this.modalHost.replaceChildren())),
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
      s.births ? `${s.births} ${s.births > 1 ? 'babies were' : 'baby was'} born.` : '',
      s.arrivals ? `${s.arrivals} new arrival${s.arrivals > 1 ? 's are' : ' is'} at the door.` : '',
      s.research ? `The Labs worked out ${fmt(s.research)} research points.` : '',
      s.refined ? `The refinery turned out ${s.refined} piece${s.refined > 1 ? 's' : ''} of salvage.` : '',
      s.crafted ? `${s.crafted} crafting job${s.crafted > 1 ? 's are' : ' is'} finished.` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const out = this.game.state.expeditions.filter((e) => e.status === 'exploring' || e.status === 'returning').length;
    const glare = [
      home ? `🏠 ${names(s.explorersHome)} came home from the Glarelands with their haul.` : '',
      fallen ? `☠ ${names(s.explorersFallen)} fell out in the Glarelands.` : '',
      out && !home && !fallen ? `🧭 ${out} explorer${out === 1 ? ' is' : 's are'} still out in the Glarelands.` : '',
      s.caravansHome ? `🛒 ${s.caravansHome} caravan${s.caravansHome > 1 ? 's are' : ' is'} back at the Trading Post.` : '',
      s.questsArrived ? `⚔ ${s.questsArrived} quest part${s.questsArrived > 1 ? 'ies reached their' : 'y reached its'} destination.` : '',
      s.questsHome ? `⚔ ${s.questsHome} quest part${s.questsHome > 1 ? 'ies are' : 'y is'} home. Collect in Quests.` : '',
    ].filter(Boolean);
    const trained = awayTrained(s.trained ?? [], (id) => this.name(id));
    const came = awayCollected(s.collected);
    const ready = s.readyRooms
      ? came
        ? `Storage filled up, so ${s.readyRooms} room${s.readyRooms === 1 ? ' is' : 's are'} holding a batch for you.`
        : `${s.readyRooms} room${s.readyRooms === 1 ? ' is' : 's are'} ready to collect.`
      : 'No rooms are waiting on you.';
    this.modal(
      'While you were away',
      h('p', {}, `${duration(s.seconds)} passed. ${ready} ${extras}`),
      came ? h('p', { class: 'away-collected' }, `📦 ${came} collected while you were away.`) : '',
      trained ? h('p', {}, `💪 ${trained}`) : '',
      ...glare.map((t) => h('p', {}, t)),
      s.cappedAt ? h('p', { class: 'muted' }, `Offline progress is capped at ${duration(s.cappedAt)}.`) : '',
      h('p', { class: 'muted' }, 'Your homestead is safe while you are gone: no incidents, no shortage damage.'),
      home || fallen ? h('div', { class: 'row', style: 'justify-content:flex-start' }, h('button', { onclick: () => (this.modalHost.replaceChildren(), this.openPanel('explore')) }, 'Open the Glarelands')) : '',
    );
  }
}

const AWAY_RESOURCE: Record<string, string> = { power: 'power', food: 'food', water: 'water', medpatch: 'Med-Patches', purge: 'Purge' };

/** "+340 power, +210 food and +180 water", or '' when nothing came in. */
function awayCollected(collected: Partial<Record<string, number>> | undefined): string {
  const bits = Object.entries(collected ?? {})
    .filter(([, v]) => (v ?? 0) >= 1)
    .map(([k, v]) => `+${fmt(Math.round(v ?? 0))} ${AWAY_RESOURCE[k] ?? k}`);
  return bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}` : (bits[0] ?? '');
}

/** "Ada: Brawn 10; Bo: Brawn 9 and Wits 4", each resident's stats at their new values. */
function awayTrained(trained: { residentId: number; stat: StatKey; value: number }[], name: (id: number) => string): string {
  const best = new Map<number, Map<StatKey, number>>();
  for (const t of trained) {
    const m = best.get(t.residentId) ?? new Map<StatKey, number>();
    m.set(t.stat, Math.max(m.get(t.stat) ?? 0, t.value));
    best.set(t.residentId, m);
  }
  const people = [...best].map(([id, m]) => `${name(id)}: ${[...m].map(([k, v]) => `${STAT_NAME[k]} ${v}`).join(', ')}`);
  if (!people.length) return '';
  const shown = people.slice(0, 6).join('; ');
  return `Trained up. ${shown}${people.length > 6 ? `; and ${people.length - 6} more` : ''}.`;
}

/** "Wits, Knack or Fortune". */
function orList(words: string[]): string {
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}` : (words[0] ?? '');
}

/** A resource amount for display: whole numbers, or one decimal below 1 so a trickle isn't shown as 0. */
function amount(n: number): string {
  if (n > 0 && n < 1) return n.toFixed(1);
  return fmt(Math.round(n));
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
    .map(([id, n]) => `${n < 1 ? 'maybe 1' : Math.round(n)} ${content.salvage[id]?.name ?? id}`)
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

/** A crate's painting, or the old CSS box when it has no art. */
function crateArt(tier: CrateTier, cls: string): HTMLElement {
  const src = artUrl('crates', tier);
  const box = () => h('span', { class: `crate-icon ${tier}` });
  return src ? artImg(src, { cls, alt: TIER_NAME[tier], fallback: box }) : box();
}

/** A new resident's card: the arrival silhouette, or the old emoji. */
function arrivalPortrait(): Node {
  return uiIcon('arrival', { cls: 'arrival-portrait', alt: 'New resident' });
}

/** A region card's painted banner with the name row over its calm left third (X1); just the row without art. */
function regionBanner(regionId: string, head: HTMLElement): HTMLElement {
  const src = artUrl('regions', regionId);
  if (!src) return head;
  return h('div', { class: 'region-banner', style: `background-image:url("${src}")` }, head);
}

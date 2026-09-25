// The homestead cross-section. Rooms are drawn as 2.5D cutaway boxes: a back
// wall, receding ceiling/floor/side planes, and props, so the view reads as
// depth rather than flat tiles. Static art is rebuilt only when the layout
// changes; overlays and residents are updated every frame.

import { Application, Container, Graphics, Sprite, Text, type FederatedPointerEvent } from 'pixi.js';
import {
  buildCost,
  isAway,
  isChild,
  radioInterval,
  type Content,
  type Incident,
  canPlace,
  poolSize,
  roomCells,
  roomDef,
  type GameEvent,
  type Resident,
  type Room,
  braced,
  isDeepFloor,
  stratumDef,
  stratumOf,
  totalFloors,
  deepContent,
  effectiveStats,
  roomCapacity,
  topStats,
  type StatKey,
  isTopside,
  TOPSIDE_FLOOR,
  type Caravan,
} from '../../sim';
import type { Game } from '../game';
import {
  type RoomLook,
  FRAME,
  GROUND,
  LAMP,
  RARITY_COLORS,
  RESOURCE_COLORS,
  ROCK,
  ROCK_DARK,
  ROCK_SPECK,
  SKY_BOTTOM,
  SKY_TOP,
  roomLook,
  shade,
} from './palette';
import { drawOffice } from './officeArt';
import { buildDeepBackground, DEEP_INCIDENT_COLORS, DeepLayer, deepViewKey, drawDeepFrame, drawDeepIncident, drawDepthRoom, labelInk, lampFor, SEAL_H, type DeepGeometry } from './deepArt';
import { type Action, type CharacterArt, CreatureFigure, Figure, residentTints } from './sprites';
import { drawTopsideBuilding, drawTopsideParts, GROUND_DEPTH, TopsideLayer, WeatherLayer, type TopsidePart } from './topsideArt';

export const CELL = 44;
export const FLOOR_H = 132;
export const SURFACE_H = 300;
const DEPTH_X = 16; // horizontal inset of the back wall (perspective)
const DEPTH_Y = 12; // vertical inset of the back wall
const MARGIN_CELLS = 4;
export const RESIDENT_H = 46;
/** Displayed height of sprite-art adults; a touch taller than the placeholder, which has no neck. */
export const SPRITE_H = RESIDENT_H * 1.1;

export interface ViewCallbacks {
  onRoomTap(room: Room): void;
  onEmptyTap(): void;
  onResidentDrop(residentId: number, room: Room | null): void;
  onResidentTap(resident: Resident): void;
  onBuildAt(floor: number, x: number): void;
  /** Tapped one of the explorer figures on the surface. */
  onExplorerTap(): void;
  /** M7: tapped a caravan on the surface. */
  onCaravanTap?(): void;
}

/** Explorer figures drawn on the surface while expeditions are out. */
interface Walker {
  root: Container;
  /** Rotated as one: the drawn figure (or sprite) plus its overlays. */
  pose: Container;
  body: Graphics;
  figure: Figure | null;
  look: string;
}

/** At most this many explorers are drawn on the surface at once. */
const MAX_WALKERS = 5;
/** How far right of the door explorers walk before fading into the Glarelands. */
const WALK_RANGE = 560;
const WALKER_SCALE = 0.8;
/** How far right of the door caravans walk before they drop over the horizon. */
const CARAVAN_RANGE = 640;
/** Pennant colours on caravan carts, by faction. */
const FACTION_COLOURS: Record<string, number> = { caravaners: 0xf2a541, tinkers: 0x4fb3a9, lamplighters: 0xf4ecd8, rustmen: 0xb5562f, homestead9: 0x7fb7c9 };
/** Incidents drawn from creature art when it exists: which look, one per `per` world units of room (at least `min`), and displayed height. */
const INCIDENT_ART: Record<string, { look: string; per: number; min: number; h: number }> = {
  skitters: { look: 'skitter', per: 70, min: 2, h: 20 },
  burrowers: { look: 'burrower', per: 80, min: 2, h: 26 },
  rustmen: { look: 'rustman', per: Infinity, min: 3, h: 50 },
  deepcrawlers: { look: 'deepcrawler', per: 70, min: 2, h: 24 },
};

/** Room categories where a resident standing still is shown at work. */
const WORK_ROOMS = new Set(['production', 'workshop', 'research', 'radio', 'office']);

interface ResidentSprite {
  root: Container;
  /** Rotated as one: the drawn figure (or sprite) plus its overlays. */
  pose: Container;
  body: Graphics;
  /** Sprite art, when the resident's body type has some; else body draws a placeholder. */
  figure: Figure | null;
  moving: boolean;
  x: number;
  targetX: number;
  roomId: number | null | 'waiting' | 'child';
  phase: number;
  facing: 1 | -1;
  /** Key of what the sprite currently shows; redraw when it changes. */
  look: string;
  /** What the figure is doing (picks the animation). */
  action: Action;
}

interface FloatText {
  text: Text;
  life: number;
  vy: number;
}

function hash(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  return x >>> 0; // keep it unsigned: XOR can produce negative 32-bit ints
}

const SKIN = [0xf1c9a5, 0xe0ac86, 0xc68b62, 0x9c6644, 0x70462c, 0xf6d6c2];
const HAIR = [0x2b1e16, 0x5a3a22, 0x8c5a2b, 0xd9b26a, 0x9b2f1f, 0x1b1b1b, 0xbfb6a8];

export class VaultView {
  readonly world = new Container();
  private bg = new Container();
  private statics = new Container();
  private overlay = new Graphics();
  private ghostLayer = new Container();
  private residentLayer = new Container();
  private walkerLayer = new Container();
  private fxLayer = new Container();
  /** Incident creatures drawn from sprite art, by incident id (drawOverlay keeps them in step). */
  private incidentLayer = new Container();
  private incidentFigs = new Map<number, CreatureFigure[]>();
  private incidentsShown = new Set<number>();
  /** M6: animated deep-room bits and the dig site (deepArt.ts). */
  private deep = new DeepLayer(() => this.deepGeometry());
  /** What the background and room frames were drawn for (strata, bracing). */
  private deepKey = '';
  /** M7: weather over the surface, and the topside buildings' moving parts. */
  private weather = new WeatherLayer();
  private topside = new TopsideLayer();
  private topsideParts = new Map<number, TopsidePart[]>();
  /** Caravan figures on the surface, by "caravanId:residentId". */
  private caravanWalkers = new Map<string, Walker>();
  private caravanCarts = new Graphics();
  /** Longest warning seen per raid, so approaching raiders walk in from the horizon. */
  private raidWarn = new Map<number, number>();

  private builtLayout = -1;
  private sprites = new Map<number, ResidentSprite>();
  private walkers = new Map<number, Walker>();
  private floats: FloatText[] = [];
  private time = 0;
  private art: CharacterArt | null = null;

  buildMode: string | null = null;
  selectedRoomId: number | null = null;
  selectedResidentId: number | null = null;
  /** Resident picked for tap-a-room assignment: rooms using their best stats light up green. */
  fitResidentId: number | null = null;
  /** Screen space the DOM covers (HUD, toolbar, open panel), so the camera can pan rooms out from under it. */
  insets = { top: 0, right: 0, bottom: 0 };
  /** Where the room picked in build mode can go right now. */
  private ghostSlots: { floor: number; x: number }[] = [];
  /** Stat badges on rooms while someone is being assigned. */
  private fitLayer = new Container();
  private fitKey = '';
  /** True while a full-screen scene (the quest screen) sits on top: ignore input. */
  suspended = false;

  // camera / input
  private zoom = window.innerWidth < 640 ? 0.55 : 0.85;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: { kind: 'none' | 'pan' | 'pinch' | 'drag'; startX: number; startY: number; t: number; moved: boolean; pinchDist?: number; residentId?: number } = {
    kind: 'none',
    startX: 0,
    startY: 0,
    t: 0,
    moved: false,
  };

  constructor(
    private app: Application,
    private game: Game,
    private cb: ViewCallbacks,
  ) {
    this.world.addChild(this.bg, this.weather.back, this.statics, this.topside.root, this.overlay, this.fitLayer, this.deep.root, this.ghostLayer, this.incidentLayer, this.residentLayer, this.caravanCarts, this.walkerLayer, this.weather.front, this.fxLayer);
    this.caravanCarts.eventMode = 'none';
    this.fitLayer.eventMode = 'none';
    app.stage.addChild(this.world);
    this.drawBackground();
    this.installInput();
    this.centerOn(window.innerWidth < 640 ? 6 * CELL : 9 * CELL, SURFACE_H + FLOOR_H * 0.8);
    game.on((events) => this.onEvents(events));
  }

  /**
   * The whole homestead was swapped (founding, import, reset): drop every
   * sprite, walker, float and ghost drawn for the old one, forget selections
   * and gestures, rebuild the rooms and put the camera back at the door.
   */
  resync(): void {
    for (const sp of this.sprites.values()) sp.root.destroy({ children: true });
    this.sprites.clear();
    for (const figs of this.incidentFigs.values()) for (const f of figs) f.destroy();
    this.incidentFigs.clear();
    for (const w of this.walkers.values()) w.root.destroy({ children: true });
    this.walkers.clear();
    for (const w of this.caravanWalkers.values()) w.root.destroy({ children: true });
    this.caravanWalkers.clear();
    this.raidWarn.clear();
    for (const f of this.floats) f.text.destroy();
    this.floats = [];
    this.buildMode = null;
    this.selectedRoomId = null;
    this.selectedResidentId = null;
    this.ghostLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.overlay.clear();
    this.pointers.clear();
    this.gesture = { kind: 'none', startX: 0, startY: 0, t: 0, moved: false };
    this.suspended = false;
    this.world.visible = true;
    this.rebuildStatics();
    this.zoom = window.innerWidth < 640 ? 0.55 : 0.85;
    this.centerOn(window.innerWidth < 640 ? 6 * CELL : 9 * CELL, SURFACE_H + FLOOR_H * 0.8);
  }

  /** For automated UI tests: what is drawn right now. */
  debugCounts() {
    return { sprites: this.sprites.size, residentLayer: this.residentLayer.children.length, walkers: this.walkers.size, caravanWalkers: this.caravanWalkers.size, topside: this.topsideParts.size, statics: this.statics.children.length, ghosts: this.ghostLayer.children.length, zoom: this.zoom, x: Math.round(this.world.x), y: Math.round(this.world.y) };
  }

  /** How many residents show each action, and which animation stands in for it ("fight>idle"). */
  debugFigures(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const sp of this.sprites.values()) {
      const k = sp.figure ? `${sp.action}>${sp.figure.showing}` : `${sp.action}>placeholder`;
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  }

  // ---------------------------------------------------------------- geometry

  roomRect(room: Room) {
    return {
      x: room.x * CELL,
      y: SURFACE_H + room.floor * FLOOR_H,
      w: roomCells(this.game.content, room) * CELL,
      h: FLOOR_H,
    };
  }

  private worldSize() {
    const { cellsPerFloor } = this.game.content.balance.grid;
    // M6: the Deep adds floors below the charter grid, then a band of sealed rock.
    return { w: cellsPerFloor * CELL, h: SURFACE_H + totalFloors(this.game.state, this.game.content) * FLOOR_H + SEAL_H * 0.6 };
  }

  private deepGeometry(): DeepGeometry {
    const { content } = this.game;
    const { floors, cellsPerFloor } = content.balance.grid;
    return {
      surfaceH: SURFACE_H,
      floorH: FLOOR_H,
      cell: CELL,
      width: cellsPerFloor * CELL,
      margin: MARGIN_CELLS * CELL,
      baseFloors: floors,
      floorsPerStratum: deepContent(content).tuning.floorsPerStratum,
      depthX: DEPTH_X,
      depthY: DEPTH_Y,
    };
  }

  /** Centre the camera on a floor (the dig site, a new stratum). */
  focusFloor(floor: number, cellX?: number): void {
    const x = cellX === undefined ? this.worldSize().w / 2 : cellX * CELL + CELL / 2;
    this.centerOn(x, SURFACE_H + floor * FLOOR_H + FLOOR_H / 2);
  }

  roomAt(wx: number, wy: number): Room | null {
    // Surface buildings rise above their row (masts, turbines): a tap on the tall part counts.
    let floor = Math.floor((wy - SURFACE_H) / FLOOR_H);
    if (wy < SURFACE_H - FLOOR_H && wy > SURFACE_H - FLOOR_H - 90) floor = TOPSIDE_FLOOR;
    const cell = Math.floor(wx / CELL);
    for (const room of this.game.state.rooms) {
      if (room.floor !== floor) continue;
      if (cell >= room.x && cell < room.x + roomCells(this.game.content, room)) return room;
    }
    return null;
  }

  centerOn(wx: number, wy: number): void {
    this.world.scale.set(this.zoom);
    this.world.position.set(this.app.screen.width / 2 - wx * this.zoom, this.app.screen.height / 2 - wy * this.zoom);
    this.clampCamera();
  }

  /** The DOM insets, dropped when they would leave too little of the homestead to look at. */
  private usableInsets(): { top: number; right: number; bottom: number } {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const { top, right, bottom } = this.insets;
    return { top, right: sw - right < 240 ? 0 : right, bottom: sh - top - bottom < 160 ? 0 : bottom };
  }

  private clampCamera(): void {
    const { w, h } = this.worldSize();
    const m = MARGIN_CELLS * CELL * this.zoom;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const ins = this.usableInsets();
    // The far right and the deepest floor can be pulled clear of a docked panel or a sheet.
    const minX = sw - ins.right - (w * this.zoom + m);
    const maxX = m;
    const minY = sh - (h * this.zoom + Math.max(160, ins.bottom + 40));
    // Leave room above the surface row for masts, turbines and the weather.
    const maxY = Math.max(80, ins.top + 120 * this.zoom);
    this.world.x = minX > maxX ? (minX + maxX) / 2 : Math.min(maxX, Math.max(minX, this.world.x));
    this.world.y = Math.min(maxY, Math.max(minY, this.world.y));
  }

  private zoomAt(screenX: number, screenY: number, factor: number): void {
    const next = Math.max(0.35, Math.min(2.2, this.zoom * factor));
    const wx = (screenX - this.world.x) / this.zoom;
    const wy = (screenY - this.world.y) / this.zoom;
    this.zoom = next;
    this.world.scale.set(next);
    this.world.x = screenX - wx * next;
    this.world.y = screenY - wy * next;
    this.clampCamera();
  }

  // ---------------------------------------------------------------- drawing

  private drawBackground(): void {
    const { w } = this.worldSize();
    const h = SURFACE_H + this.game.content.balance.grid.floors * FLOOR_H;
    const m = MARGIN_CELLS * CELL;
    const g = new Graphics();
    // sky gradient (banded), from high above the surface down to the horizon
    const skyTop = -900;
    const horizon = SURFACE_H - 40;
    const bands = 24;
    const bandH = (horizon - skyTop) / bands;
    for (let i = 0; i < bands; i++) {
      g.rect(-m * 3, skyTop + i * bandH, w + m * 6, bandH + 1).fill(lerpColor(SKY_TOP, SKY_BOTTOM, i / (bands - 1)));
    }
    // distant mesas
    g.poly([-m * 3, SURFACE_H - 40, -m, SURFACE_H - 120, m * 2, SURFACE_H - 130, m * 3, SURFACE_H - 40]).fill(shade(SKY_BOTTOM, -0.35));
    g.poly([w * 0.55, SURFACE_H - 40, w * 0.62, SURFACE_H - 150, w * 0.8, SURFACE_H - 160, w * 0.9, SURFACE_H - 40]).fill(shade(SKY_BOTTOM, -0.3));
    // ground crust
    g.rect(-m * 3, SURFACE_H - 40, w + m * 6, 40).fill(GROUND);
    g.rect(-m * 3, SURFACE_H - 8, w + m * 6, 8).fill(shade(GROUND, -0.35));
    // bedrock
    g.rect(-m * 3, SURFACE_H, w + m * 6, h - SURFACE_H + 400).fill(ROCK);
    // deterministic speckles and strata
    for (let i = 0; i < 900; i++) {
      const hx = hash(i * 7 + 1);
      const hy = hash(i * 13 + 5);
      const x = (hx % (w + m * 6)) - m * 3;
      const y = SURFACE_H + (hy % (h - SURFACE_H + 300));
      const s = 2 + (hash(i) % 5);
      g.rect(x, y, s * 2, s).fill(i % 3 === 0 ? ROCK_DARK : ROCK_SPECK);
    }
    // faint build grid
    const { floors } = this.game.content.balance.grid;
    for (let f = 0; f <= floors; f++) {
      g.rect(0, SURFACE_H + f * FLOOR_H - 1, w, 2).fill({ color: 0x000000, alpha: 0.18 });
    }
    this.bg.addChild(g);
    // M6: dug strata below the charter floors, and the seal under the last one.
    const { state, content } = this.game;
    const dc = deepContent(content);
    const names: Record<number, string> = {};
    for (const st of dc.strata) names[st.index] = stratumDef(content, st.index)?.name ?? `Stratum ${st.index}`;
    this.bg.addChild(buildDeepBackground(this.deepGeometry(), { strata: state.deep.strata, maxStrata: dc.strata.length, names }));
  }

  private rebuildStatics(): void {
    this.statics.removeChildren().forEach((c) => c.destroy({ children: true }));
    const { state, content } = this.game;
    const isBraced = braced(state, content);
    this.topsideParts.clear();
    for (const room of this.game.state.rooms) {
      if (isTopside(room)) {
        this.buildTopside(room);
        continue;
      }
      const r = this.roomRect(room);
      const g = new Graphics();
      const wall = this.art?.roomWall(room.type, room.level);
      drawRoomBox(g, room.type, r.w, r.h, room.level, room.segments, !!wall);
      if (isDeepFloor(content, room.floor)) drawDeepFrame(g, r.w, r.h, stratumOf(content, room.floor), isBraced, room.id, room.type === 'elevator');
      g.position.set(r.x, r.y);
      this.statics.addChild(g);
      if (wall) {
        // Painted back wall: one module per segment for rooms that merge, else one image.
        const def = roomDef(this.game.content, room);
        const tiles = def.cells === 3 ? room.segments : 1;
        const { x: bx, y: by, w: bw, h: bh } = backWall(r.w, r.h);
        for (let i = 0; i < tiles; i++) {
          const s = new Sprite(wall);
          s.position.set(r.x + bx + (bw / tiles) * i, r.y + by);
          s.width = bw / tiles;
          s.height = bh;
          this.statics.addChild(s);
        }
      }
      const def = roomDef(this.game.content, room);
      if (room.type !== 'elevator') {
        const name = def.levelNames?.[room.level - 1] ?? def.name;
        const label = new Text({
          text: name.toUpperCase(),
          style: { fontFamily: 'Bungee, sans-serif', fontSize: 11, fill: labelInk(roomLook(room.type).wall), letterSpacing: 1 },
        });
        label.alpha = 0.7;
        label.position.set(r.x + DEPTH_X + 6, r.y + DEPTH_Y + 4);
        if (wall) {
          // On painted walls the name sits on a dark tab so it stays readable.
          label.style.fill = 0xf4ecd8;
          label.alpha = 0.9;
          const tab = new Graphics().roundRect(-4, -2, label.width + 8, label.height + 3, 4).fill({ color: 0x14100d, alpha: 0.6 });
          tab.position.set(label.x, label.y);
          this.statics.addChild(tab);
        }
        this.statics.addChild(label);
      }
    }
    this.builtLayout = this.game.layoutVersion;
    this.deepKey = deepViewKey(state, isBraced);
    this.rebuildGhosts();
  }

  /**
   * M7: a surface building, standing in the open on the ground above the door.
   * Painted art (when some exists for the type) stands in for the drawn
   * structure; the name sits on a dark tab on the ground in front of it.
   */
  private buildTopside(room: Room): void {
    const { content } = this.game;
    const r = this.roomRect(room);
    const g = new Graphics();
    const wall = this.art?.roomWall(room.type, room.level);
    const gy = r.h - GROUND_DEPTH;
    if (wall) {
      g.rect(2, gy - 2, r.w - 4, 8).fill(shade(GROUND, -0.2));
      g.position.set(r.x, r.y);
      this.statics.addChild(g);
      const s = new Sprite(wall);
      const hgt = Math.min(gy + 60, (r.w / Math.max(1, wall.width)) * wall.height);
      s.position.set(r.x, r.y + gy - hgt);
      s.width = r.w;
      s.height = hgt;
      this.statics.addChild(s);
    } else {
      this.topsideParts.set(room.id, drawTopsideBuilding(g, room.type, r.w, r.h, room.level, room.segments));
      g.position.set(r.x, r.y);
      this.statics.addChild(g);
    }
    const def = roomDef(content, room);
    const name = def.levelNames?.[room.level - 1] ?? def.name;
    const label = new Text({ text: name.toUpperCase(), style: { fontFamily: 'Bungee, sans-serif', fontSize: 10, fill: 0xf4ecd8, letterSpacing: 1 } });
    label.alpha = 0.92;
    label.position.set(r.x + 8, r.y + gy + 12);
    const tab = new Graphics().roundRect(-4, -2, label.width + 8, label.height + 3, 4).fill({ color: 0x14100d, alpha: 0.6 });
    tab.position.set(label.x, label.y);
    this.statics.addChild(tab, label);
  }

  /** How many green slots build mode is showing. */
  get ghostCount(): number {
    return this.buildMode ? this.ghostSlots.length : 0;
  }

  /**
   * Build mode just started: if no green slot is in the part of the screen the
   * DOM leaves free, pan to the nearest one. Returns how many slots there are.
   */
  revealGhosts(): number {
    const type = this.buildMode;
    const def = type ? this.game.content.rooms[type] : undefined;
    const slots = this.ghostSlots;
    if (!def || !slots.length) return slots.length;
    const z = this.zoom;
    const ins = this.usableInsets();
    const area = { x0: 0, x1: this.app.screen.width - ins.right, y0: ins.top, y1: this.app.screen.height - ins.bottom };
    const rect = (c: { floor: number; x: number }) => ({
      x: this.world.x + c.x * CELL * z,
      y: this.world.y + (SURFACE_H + c.floor * FLOOR_H) * z,
      w: def.cells * CELL * z,
      h: FLOOR_H * z,
    });
    const inView = slots.some((c) => {
      const r = rect(c);
      return r.x >= area.x0 - 2 && r.x + r.w <= area.x1 + 2 && r.y >= area.y0 - 2 && r.y + r.h <= area.y1 + 2;
    });
    if (inView) return slots.length;
    const cx = (area.x0 + area.x1) / 2;
    const cy = (area.y0 + area.y1) / 2;
    let best: { dx: number; dy: number; d: number } | null = null;
    for (const c of slots) {
      const r = rect(c);
      const dx = cx - (r.x + r.w / 2);
      const dy = cy - (r.y + r.h / 2);
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { dx, dy, d };
    }
    if (best) {
      this.world.x += best.dx;
      this.world.y += best.dy;
      this.clampCamera();
    }
    return slots.length;
  }

  rebuildGhosts(): void {
    this.ghostLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.ghostSlots = [];
    const type = this.buildMode;
    if (!type) return;
    const { content, state } = this.game;
    const def = content.rooms[type];
    if (!def) return;
    // One-per-homestead rooms (the Command Office) have nowhere to go once built.
    if (def.maxBuilt !== undefined && state.rooms.filter((r) => r.type === type).length >= def.maxBuilt) return;
    const seen = new Set<string>();
    const candidates: { floor: number; x: number }[] = [];
    const push = (floor: number, x: number) => {
      const k = `${floor}:${x}`;
      if (seen.has(k)) return;
      seen.add(k);
      if (canPlace(state, content, type, floor, x).ok) candidates.push({ floor, x });
    };
    // Surface buildings go anywhere along the ground that links back to the door.
    if (def.topside) for (let x = 0; x + def.cells <= content.balance.grid.cellsPerFloor; x++) push(TOPSIDE_FLOOR, x);
    for (const room of state.rooms) {
      if (def.topside) break;
      const w = roomCells(content, room);
      push(room.floor, room.x + w);
      push(room.floor, room.x - def.cells);
      if (type === 'elevator' && room.type === 'elevator') {
        push(room.floor + 1, room.x);
        push(room.floor - 1, room.x);
      }
    }
    // Surface slots can overlap (any spot over the door links up): show a tidy, non-overlapping set.
    if (def.topside) {
      const kept: { floor: number; x: number }[] = [];
      for (const c of candidates.sort((a, b) => a.x - b.x)) if (!kept.some((k) => c.x < k.x + def.cells && k.x < c.x + def.cells)) kept.push(c);
      candidates.splice(0, candidates.length, ...kept);
    }
    this.ghostSlots = candidates;
    const cost = buildCost(state, content, type);
    const affordable = state.scrip >= cost;
    for (const c of candidates) {
      const x = c.x * CELL;
      const y = SURFACE_H + c.floor * FLOOR_H;
      const w = def.cells * CELL;
      // On the surface the slot stands on the ground rather than filling a floor.
      const gh = c.floor < 0 ? FLOOR_H - GROUND_DEPTH + 4 : FLOOR_H;
      const g = new Graphics();
      g.rect(x + 3, y + 3, w - 6, gh - 6).fill({ color: affordable ? 0x8fc93a : 0xe4572e, alpha: 0.18 });
      g.rect(x + 3, y + 3, w - 6, gh - 6).stroke({ width: 3, color: affordable ? 0x8fc93a : 0xe4572e, alpha: 0.9 });
      const cx = x + w / 2;
      const cy = y + gh / 2;
      g.rect(cx - 14, cy - 3, 28, 6).fill(0xf4ecd8);
      g.rect(cx - 3, cy - 14, 6, 28).fill(0xf4ecd8);
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.on('pointertap', (e: FederatedPointerEvent) => {
        e.stopPropagation();
        this.cb.onBuildAt(c.floor, c.x);
      });
      this.ghostLayer.addChild(g);
      if (w >= CELL * 2) {
        const t = new Text({ text: `${cost}`, style: { fontFamily: 'Work Sans, sans-serif', fontWeight: '700', fontSize: 14, fill: 0xf4ecd8 } });
        t.anchor.set(0.5);
        t.position.set(cx, cy + 28);
        this.ghostLayer.addChild(t);
      }
    }
  }

  // ---------------------------------------------------------------- frame

  update(dt: number): void {
    this.time += dt;
    const { state, content } = this.game;
    const deepKey = deepViewKey(state, braced(state, content));
    if (deepKey !== this.deepKey) {
      // A stratum opened (or Deep Bracing went in): redraw the rock and the room frames.
      this.bg.removeChildren().forEach((c) => c.destroy({ children: true }));
      this.drawBackground();
      this.rebuildStatics();
      this.clampCamera();
    } else if (this.builtLayout !== this.game.layoutVersion) this.rebuildStatics();
    // M6: with up to 45 floors, only rooms near the camera are drawn.
    const vb = this.viewBounds();
    this.cull(vb);
    this.drawOverlay(vb);
    this.drawFit();
    this.deep.update(state, content, this.time, (room) => this.roomRect(room), vb);
    this.updateTopside(dt, vb);
    this.updateResidents(dt);
    this.updateWalkers();
    this.updateCaravans();
    this.updateFloats(dt);
  }

  /** M7: the weather over the surface and the buildings' moving parts, while the surface is on screen. */
  private updateTopside(dt: number, vb: { y0: number; y1: number }): void {
    const { state } = this.game;
    const visible = vb.y0 < SURFACE_H;
    const { w } = this.worldSize();
    const m = MARGIN_CELLS * CELL * 3;
    const kind = state.weather?.kind ?? 'clear';
    this.weather.update(kind, this.time, dt, { x0: -m, x1: w + m, y0: Math.max(-900, vb.y0 - FLOOR_H), ground: SURFACE_H - GROUND_DEPTH }, visible);
    const g = this.topside.g;
    g.clear();
    if (!visible || !this.topsideParts.size) return;
    const crewed = new Set<number>();
    for (const r of state.residents) if (r.roomId !== null && !r.dead && !isAway(r)) crewed.add(r.roomId);
    for (const room of state.rooms) {
      const parts = this.topsideParts.get(room.id);
      if (!parts) continue;
      const r = this.roomRect(room);
      const live = room.powered && (room.type !== 'watchtower' || crewed.has(room.id));
      drawTopsideParts(g, parts, r.x, r.y, this.time, kind, live, room.id);
    }
  }

  /** World rows in view, plus a floor of margin either side. */
  private viewBounds(): { y0: number; y1: number } {
    const z = this.world.scale.y || 1;
    return { y0: -this.world.y / z - FLOOR_H, y1: (this.app.screen.height - this.world.y) / z + FLOOR_H };
  }

  private cullKey = '';
  /** Hide static room art and residents that are off screen (they cost draw calls at 45 floors). */
  private cull(vb: { y0: number; y1: number }): void {
    const key = `${Math.round(vb.y0)}|${Math.round(vb.y1)}|${this.statics.children.length}|${this.builtLayout}`;
    if (key !== this.cullKey) {
      this.cullKey = key;
      for (const c of this.statics.children) c.visible = c.y + FLOOR_H >= vb.y0 && c.y <= vb.y1;
    }
    for (const c of this.residentLayer.children) c.visible = c.y >= vb.y0 && c.y - FLOOR_H <= vb.y1;
  }

  private drawOverlay(vb: { y0: number; y1: number }): void {
    const g = this.overlay;
    g.clear();
    const { state, content } = this.game;
    const burning = new Map(state.incidents.map((i) => [i.roomId, i]));
    this.incidentsShown.clear();
    for (const room of state.rooms) {
      const r = this.roomRect(room);
      // Rustmen at the door stand on the surface, so the door is always drawn.
      if ((r.y + r.h < vb.y0 || r.y > vb.y1) && room.type !== 'door') continue;
      const def = roomDef(content, room);
      const top = isTopside(room);
      // interior lamp glow / brownout (open-air buildings have no ceiling lamp)
      if (top) {
        if (!room.powered) g.rect(r.x + 2, r.y + 2, r.w - 4, r.h - GROUND_DEPTH - 2).fill({ color: 0x000000, alpha: 0.3 });
      } else if (!room.powered) {
        g.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 4).fill({ color: 0x000000, alpha: 0.55 });
      } else if (room.type !== 'elevator') {
        const flicker = 0.1 + 0.03 * Math.sin(this.time * 3 + room.id);
        g.rect(r.x + DEPTH_X, r.y + DEPTH_Y + 2, r.w - DEPTH_X * 2, 10).fill({ color: lampFor(content, room), alpha: flicker });
      }
      // production progress along the floor lip
      if (def.produces && !room.ready) {
        const p = Math.min(1, room.pool / Math.max(1, poolSize(content, room)));
        if (top) g.rect(r.x + 6, r.y + r.h - GROUND_DEPTH + 4, r.w - 12, 3).fill({ color: 0x000000, alpha: 0.35 });
        g.rect(r.x + 6, top ? r.y + r.h - GROUND_DEPTH + 4 : r.y + r.h - 7, (r.w - 12) * p, 3).fill({ color: RESOURCE_COLORS[def.produces.resource] ?? 0xffffff, alpha: 0.9 });
      }
      // ready bubble
      if (room.ready && def.produces) {
        const bob = Math.sin(this.time * 4 + room.id) * 3;
        const cx = r.x + r.w / 2;
        const cy = r.y + 30 + bob;
        const color = RESOURCE_COLORS[def.produces.resource] ?? 0xffffff;
        g.circle(cx, cy, 17).fill(0x14100d);
        g.circle(cx, cy, 14).fill(color);
        drawResourceGlyph(g, def.produces.resource, cx, cy);
      }
      // crafting progress, and a bubble with the item once it is done
      if (room.job) {
        const job = room.job;
        const item = content.items[job.defId];
        if (job.remaining > 0) {
          const p = job.total > 0 ? Math.max(0, Math.min(1, 1 - job.remaining / job.total)) : 0;
          g.rect(r.x + 6, r.y + r.h - 7, r.w - 12, 3).fill({ color: 0x000000, alpha: 0.35 });
          g.rect(r.x + 6, r.y + r.h - 7, (r.w - 12) * p, 3).fill({ color: roomLook(room.type).accent, alpha: 0.95 });
        } else {
          const bob = Math.sin(this.time * 4 + room.id) * 3;
          const cx = r.x + r.w / 2;
          const cy = r.y + 30 + bob;
          g.circle(cx, cy, 19).fill(0x14100d);
          g.circle(cx, cy, 16).fill(RARITY_COLORS[item?.rarity ?? 'common'] ?? 0xf4ecd8);
          drawItemGlyph(g, item?.kind ?? 'weapon', cx, cy);
        }
      }
      const inc = burning.get(room.id);
      // Surface incidents happen on the ground, not on the crust below it.
      if (inc) this.drawIncident(g, inc, top ? { ...r, h: r.h - GROUND_DEPTH + 10 } : r);
      // Radio: signal progress arc on the ceiling lip.
      if (def.category === 'radio' && room.powered) {
        const p = Math.min(1, room.timer / Math.max(1, radioInterval(state, content, room)));
        g.rect(r.x + 6, r.y + r.h - 7, (r.w - 12) * p, 3).fill({ color: 0xd9645b, alpha: 0.9 });
      }
      if (room.id === this.selectedRoomId) {
        const pulse = 0.6 + 0.4 * Math.sin(this.time * 5);
        if (top) g.rect(r.x + 1, r.y - 30, r.w - 2, r.h - GROUND_DEPTH + 34).stroke({ width: 3, color: 0xf2a541, alpha: pulse });
        else g.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).stroke({ width: 3, color: 0xf2a541, alpha: pulse });
      }
    }
    // Incident creatures: hide those whose room is off screen, drop those whose incident ended.
    for (const [id, figs] of this.incidentFigs) {
      if (!state.incidents.some((i) => i.id === id)) {
        for (const f of figs) f.destroy();
        this.incidentFigs.delete(id);
      } else for (const f of figs) f.visible = this.incidentsShown.has(id);
    }
    for (const id of this.raidWarn.keys()) if (!state.incidents.some((i) => i.id === id)) this.raidWarn.delete(id);
    // Hearts above courting couples.
    for (const res of state.residents) {
      if (!res.courtship) continue;
      const a = this.sprites.get(res.id);
      const b = this.sprites.get(res.courtship.partnerId);
      if (!a || !b) continue;
      const hx = (a.x + b.x) / 2;
      const hy = a.root.y - RESIDENT_H - 16 + Math.sin(this.time * 3) * 3;
      drawHeart(g, hx, hy, 7 + Math.sin(this.time * 6) * 1);
    }
  }

  /** Who is being assigned right now: the resident being dragged, or the one picked in Residents. */
  private fitId(): number | null {
    if (this.gesture.kind === 'drag' && this.gesture.moved && this.gesture.residentId !== undefined) return this.gesture.residentId;
    return this.fitResidentId;
  }

  /**
   * While someone is being assigned: rooms that use one of their best stats get
   * a green tint and outline, and every room with a stat shows its letters.
   */
  private drawFit(): void {
    const id = this.fitId();
    const { state, content } = this.game;
    const res = id === null ? undefined : state.residents.find((r) => r.id === id);
    const rooms = res ? state.rooms.filter((room) => roomDef(content, room).stat && roomCapacity(content, room) > 0) : [];
    const top = res ? topStats(effectiveStats(content, res)) : [];
    // Full rooms say so (unless it's the one they already work in). One pass over the residents.
    const crew = new Map<number, number>();
    if (res) for (const r of state.residents) if (r.roomId !== null && !r.dead) crew.set(r.roomId, (crew.get(r.roomId) ?? 0) + 1);
    const isFull = (room: Room) => (crew.get(room.id) ?? 0) >= roomCapacity(content, room) && res?.roomId !== room.id;
    const key = res ? `${res.id}|${top.join(',')}|${this.builtLayout}|${rooms.map((room) => `${room.id}:${isFull(room) ? 1 : 0}`).join(',')}` : '';
    if (key !== this.fitKey) {
      this.fitKey = key;
      this.fitLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
      for (const room of rooms) {
        const def = roomDef(content, room);
        const stat = def.stat as StatKey;
        const good = top.includes(stat);
        const full = isFull(room);
        const r = this.roomRect(room);
        const label = new Text({
          text: `${STAT_LETTERS[stat]}${full ? ' · FULL' : ''}`,
          style: { fontFamily: 'Work Sans, sans-serif', fontWeight: '700', fontSize: 13, fill: good ? 0x14100d : 0xf4ecd8 },
        });
        const bw = label.width + 12;
        const bx = r.x + r.w - DEPTH_X - 6 - bw;
        const by = r.y + DEPTH_Y + 20; // under the room's name
        const bg = new Graphics().roundRect(bx, by, bw, 20, 6).fill({ color: good ? 0x8fc93a : 0x14100d, alpha: good ? 0.95 : 0.8 });
        label.position.set(bx + 6, by + 2);
        this.fitLayer.addChild(bg, label);
      }
    }
    if (!res) return;
    const g = this.overlay;
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 4);
    for (const room of rooms) {
      if (!top.includes(roomDef(content, room).stat as StatKey)) continue;
      const r = this.roomRect(room);
      g.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 4).fill({ color: 0x8fc93a, alpha: 0.13 });
      g.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 4).stroke({ width: 3, color: 0x8fc93a, alpha: 0.9 * pulse });
    }
  }

  /**
   * Incident creatures from sprite art: they pace the room and strike now and
   * then; raiders breaking in hammer on the door from the surface. Returns
   * false when there's no art, so the drawn version is used.
   */
  private drawIncidentArt(inc: Incident, r: { x: number; y: number; w: number; h: number }): boolean {
    const spec = INCIDENT_ART[inc.type];
    const creature = spec ? this.art?.forLook(spec.look) : undefined;
    if (!spec || !creature) return false;
    const n = Math.max(spec.min, Math.round(r.w / spec.per));
    let figs = this.incidentFigs.get(inc.id);
    if (!figs || figs.length !== n) {
      for (const f of figs ?? []) f.destroy();
      figs = Array.from({ length: n }, () => this.incidentLayer.addChild(new CreatureFigure(creature, spec.h)));
      this.incidentFigs.set(inc.id, figs);
    }
    this.incidentsShown.add(inc.id);
    const t = this.time;
    const breaking = inc.type === 'rustmen' && inc.doorHp > 0;
    const approach = this.approachX(inc, r);
    figs.forEach((f, i) => {
      const strike = f.duration('attack');
      let x: number;
      let y = r.y + r.h - 10;
      let right = false;
      if (approach !== null) {
        // Spotted from the Watchtower: still crossing the flats toward the door.
        x = approach + i * 34;
        y = SURFACE_H - 10 - Math.abs(Math.sin(t * 7 + i)) * 2;
        f.play('idle', t * 2 + i);
      } else if (breaking) {
        // On the surface above the door, facing it, hammering away.
        x = r.x + r.w * 0.2 + i * 36;
        y = SURFACE_H - 10;
        f.play('attack', (t + i * 0.3) % Math.max(0.1, strike));
      } else {
        // Back and forth across the room, each at its own pace.
        const phase = (t * (0.06 + (i % 3) * 0.025) + i * 0.37) % 1;
        right = phase < 0.5;
        const along = right ? phase * 2 : 2 - phase * 2;
        x = r.x + 18 + along * (r.w - 36);
        const cycle = (t + i * 0.9) % 2.4;
        if (cycle < strike) f.play('attack', cycle);
        else f.play('idle', t + i);
      }
      f.position.set(x, y);
      // Sheets face left; mirror to face right.
      f.scale.x = Math.abs(f.scale.x) * (right ? -1 : 1);
    });
    return true;
  }

  /** Raiders spotted by a Watchtower walk in from the horizon: where the first one is now, or null once at the door. */
  private approachX(inc: Incident, door: { x: number; w: number }): number | null {
    const warn = inc.type === 'rustmen' ? (inc.warning ?? 0) : 0;
    if (warn <= 0) return null;
    const max = Math.max(warn, inc.warningTotal ?? 0, this.raidWarn.get(inc.id) ?? 0);
    this.raidWarn.set(inc.id, max);
    return door.x + door.w + 30 + (warn / max) * 560;
  }

  private drawIncident(g: Graphics, inc: Incident, r: { x: number; y: number; w: number; h: number }): void {
    const floorY = r.y + r.h - 10;
    const t = this.time;
    const art = this.drawIncidentArt(inc, r);
    switch (art && inc.type !== 'rustmen' ? 'art' : inc.type) {
      case 'art':
        break;
      case 'fire':
        for (let i = 0; i < Math.ceil(r.w / 22); i++) {
          const fx = r.x + 10 + i * 22 + Math.sin(t * 9 + i) * 3;
          const fh = 26 + Math.sin(t * 13 + i * 1.7) * 9;
          g.poly([fx - 9, floorY, fx, floorY - fh, fx + 9, floorY]).fill({ color: 0xff7a1a, alpha: 0.85 });
          g.poly([fx - 5, floorY, fx, floorY - fh * 0.6, fx + 5, floorY]).fill({ color: 0xffd23f, alpha: 0.9 });
        }
        break;
      case 'skitters':
        // A swarm of glowing beetles scurrying across the floor.
        for (let i = 0; i < Math.ceil(r.w / 16); i++) {
          const phase = (t * (0.35 + (i % 5) * 0.08) + i * 0.37) % 1;
          const dir = i % 2 === 0 ? 1 : -1;
          const bx = r.x + 12 + (dir > 0 ? phase : 1 - phase) * (r.w - 24);
          const by = floorY - 2 - (i % 3) * 3;
          g.ellipse(bx, by, 7, 4).fill(0x2c3a1e);
          g.ellipse(bx + dir * 4, by - 1, 3, 2.5).fill(0xb7f36a);
        }
        break;
      case 'burrowers':
        for (let i = 0; i < Math.max(2, Math.floor(r.w / 45)); i++) {
          const mx = r.x + 24 + i * ((r.w - 48) / Math.max(1, Math.floor(r.w / 45) - 1 || 1));
          g.ellipse(mx, floorY + 2, 16, 7).fill(0x5a3b24);
          const pop = Math.max(0, Math.sin(t * 3 + i * 2));
          g.ellipse(mx, floorY - 4 - pop * 10, 8, 7 + pop * 3).fill(0xc79a82);
          g.circle(mx + 3, floorY - 8 - pop * 10, 1.6).fill(0x1b1b1b);
        }
        break;
      case 'rustmen': {
        // Three raiders in rust-red scrap armour; at the door they hammer on it.
        const breaking = inc.doorHp > 0;
        const approach = this.approachX(inc, r);
        for (let i = 0; i < (art ? 0 : 3); i++) {
          // While breaking in they stand on the surface above the door; spotted early, they are still on their way.
          const rx = approach !== null ? approach + i * 26 : breaking ? r.x + r.w * 0.2 + i * 26 : r.x + r.w * (0.3 + i * 0.22) + Math.sin(t * 2 + i) * 6;
          const ry = breaking ? SURFACE_H - 10 : floorY;
          const lunge = breaking ? Math.max(0, Math.sin(t * 8 + i * 2)) * 5 : 0;
          g.roundRect(rx - 8 + lunge, ry - 30, 16, 20, 4).fill(0x7a2e1c);
          g.rect(rx - 8 + lunge, ry - 24, 16, 3).fill(0x2b1b14);
          g.roundRect(rx - 6 + lunge, ry - 12, 5, 12, 2).fill(0x3b2a20);
          g.roundRect(rx + 1 + lunge, ry - 12, 5, 12, 2).fill(0x3b2a20);
          g.circle(rx + lunge, ry - 37, 7).fill(0xc68b62);
          g.poly([rx - 8 + lunge, ry - 40, rx - 4 + lunge, ry - 50, rx + lunge, ry - 42, rx + 4 + lunge, ry - 52, rx + 8 + lunge, ry - 40]).fill(0x8c8c8c);
        }
        if (breaking) {
          const doorMax = roomDef(this.game.content, this.game.state.rooms.find((x) => x.id === inc.roomId) as Room).doorHp?.[0] ?? 1;
          const hpFrac = Math.min(1, inc.doorHp / Math.max(doorMax, inc.doorHp));
          g.rect(r.x + 10, r.y - 14, r.w - 20, 6).fill(0x14100d);
          g.rect(r.x + 10, r.y - 14, (r.w - 20) * hpFrac, 6).fill(0x9fb4b2);
        }
        break;
      }
      default:
        drawDeepIncident(g, inc, r, t);
    }
    const colour = ({ fire: 0xff7a1a, skitters: 0xb7f36a, burrowers: 0xc79a82, rustmen: 0xe4572e, ...DEEP_INCIDENT_COLORS } as Record<string, number>)[inc.type] ?? 0xd0c080;
    g.rect(r.x + 10, r.y + 8, r.w - 20, 6).fill(0x14100d);
    g.rect(r.x + 10, r.y + 8, (r.w - 20) * Math.max(0, inc.hp / inc.maxHp), 6).fill(colour);
  }

  /** Switch residents to sprite art once it has loaded. */
  setArt(art: CharacterArt | null): void {
    this.art = art;
    this.builtLayout = -1; // rebuild rooms with any painted walls
    for (const sp of this.sprites.values()) sp.look = '';
    for (const w of this.walkers.values()) w.look = '';
  }

  /**
   * Redraw a figure: sprite art with small overlays if there is art for the
   * resident's body type, else the drawn placeholder.
   */
  private dress(f: { pose: Container; body: Graphics; figure: Figure | null }, res: Resident, child: boolean, backpack: boolean, armed = false): void {
    const character = this.art?.forResident(res);
    if (f.figure && f.figure.character !== character) {
      f.figure.destroy();
      f.figure = null;
    }
    if (character && !f.figure) {
      f.figure = new Figure(character, SPRITE_H);
      f.pose.addChildAt(f.figure, 1);
    }
    const { content } = this.game;
    f.body.clear();
    // Carry art draws its own pack.
    if (backpack && !f.figure?.has('carry')) drawBackpack(f.body);
    if (f.figure) {
      f.figure.setTints(residentTints(res, content, child));
      drawOverlays(f.body, res, content, !armed);
    } else {
      drawResident(f.body, res, content, child);
    }
    // Shadow sits under the sprite; overlays and placeholder on top.
    f.pose.setChildIndex(f.body, f.pose.children.length - 1);
  }

  private updateResidents(dt: number): void {
    const { state } = this.game;
    const alive = new Set<number>();
    const waitingList = state.residents.filter((r) => r.waiting);
    // What each room has its residents doing when they stand still.
    const roomAction = new Map<number, Action>();
    for (const room of state.rooms) if (WORK_ROOMS.has(this.game.content.rooms[room.type]?.category ?? '')) roomAction.set(room.id, 'work');
    for (const inc of state.incidents) roomAction.set(inc.roomId, 'fight');
    for (const res of state.residents) {
      // Explorers are out in the Glarelands, not inside (see updateWalkers).
      if (isAway(res)) continue;
      alive.add(res.id);
      let sp = this.sprites.get(res.id);
      if (!sp) {
        sp = this.createSprite(res);
        this.sprites.set(res.id, sp);
      }
      const child = isChild(state, res);
      // Last frame's action decides whether fight art holds the weapon itself.
      const armed = sp.action === 'fight' && !!sp.figure?.has('fight');
      const look = `${res.pregnancy ? 'p' : ''}${child ? 'c' : ''}${armed ? 'a' : ''}${res.weapon ?? ''}|${res.outfit ?? ''}`;
      if (sp.look !== look) {
        sp.look = look;
        this.dress(sp, res, child, false, armed);
      }
      const where: ResidentSprite['roomId'] = res.waiting ? 'waiting' : child ? 'child' : res.roomId;
      const bounds = this.residentBounds(res, waitingList.indexOf(res));
      if (sp.roomId !== where) {
        sp.roomId = where;
        sp.x = bounds.min + (hash(res.id) % 1000) / 1000 * (bounds.max - bounds.min);
        sp.targetX = sp.x;
      }
      if (this.gesture.kind === 'drag' && this.gesture.residentId === res.id) continue;
      // wander
      sp.moving = false;
      if (Math.abs(sp.targetX - sp.x) < 2) {
        if (hash(res.id + Math.floor(this.time * 0.4 + res.id)) % 60 === 0 || sp.targetX < bounds.min || sp.targetX > bounds.max) {
          sp.targetX = bounds.min + ((hash(Math.floor(this.time * 10) + res.id * 31) % 1000) / 1000) * (bounds.max - bounds.min);
        }
      } else {
        const dir = Math.sign(sp.targetX - sp.x);
        sp.facing = dir > 0 ? 1 : -1;
        const speed = res.dead ? 0 : 38;
        sp.x += dir * Math.min(Math.abs(sp.targetX - sp.x), speed * dt);
        sp.phase += dt * 9;
        sp.moving = speed > 0;
      }
      sp.x = Math.min(bounds.max, Math.max(bounds.min, sp.x));
      sp.root.position.set(sp.x, bounds.y);
      const size = child ? 0.62 : 1;
      sp.root.scale.set(sp.facing * size, size);
      sp.action = res.dead ? 'fallen' : sp.moving ? 'walk' : (!child && res.roomId !== null && roomAction.get(res.roomId)) || 'idle';
      // Sprites carry their own walk; only the placeholder needs a wobble.
      // The dead lie flat unless the art has its own fallen pose.
      const flat = res.dead && !sp.figure?.has('fallen');
      sp.pose.rotation = flat ? -Math.PI / 2 : sp.figure ? 0 : Math.sin(sp.phase) * 0.04;
      sp.figure?.play(sp.action, sp.action === 'walk' ? sp.phase / 9 : this.time + (hash(res.id) % 1000) / 250);
      sp.root.alpha = res.dead ? 0.7 : 1;
      const selected = res.id === this.selectedResidentId;
      sp.root.children[0]!.visible = selected;
    }
    for (const [id, sp] of this.sprites) {
      if (!alive.has(id)) {
        sp.root.destroy({ children: true });
        this.sprites.delete(id);
      }
    }
  }

  /**
   * A visual cue for expeditions: small figures on the surface, walking off to
   * the right while exploring, back toward the door while returning, and
   * waiting by the door once home. Positions come from the clock, so there is
   * no per-walker state to keep in sync.
   */
  private updateWalkers(): void {
    const { state, content } = this.game;
    // Fallen explorers (and bodies being carried home) are not shown walking.
    const shown = state.expeditions.filter((e) => e.status !== 'dead' && !state.residents.find((r) => r.id === e.residentId)?.dead).slice(0, MAX_WALKERS);
    const door = state.rooms.find((r) => r.type === 'door');
    const base = door ? this.roomRect(door).x + this.roomRect(door).w + 16 : 200;
    const keep = new Set<number>();
    shown.forEach((e, i) => {
      const res = state.residents.find((r) => r.id === e.residentId);
      if (!res) return;
      keep.add(e.id);
      let w = this.walkers.get(e.id);
      if (!w) {
        const root = new Container();
        const pose = new Container();
        const shadow = new Graphics().ellipse(0, 0, 11, 3).fill({ color: 0x000000, alpha: 0.35 });
        const body = new Graphics();
        pose.addChild(shadow, body);
        root.addChild(pose);
        this.walkerLayer.addChild(root);
        w = { root, pose, body, figure: null, look: '' };
        this.walkers.set(e.id, w);
      }
      const look = `${res.weapon ?? ''}|${res.outfit ?? ''}`;
      if (w.look !== look) {
        w.look = look;
        this.dress(w, res, false, true);
      }
      const offset = (i * WALK_RANGE) / MAX_WALKERS;
      const along = (this.time * 20 + offset + (hash(e.id) % 60)) % WALK_RANGE;
      let x = base;
      let facing = 1;
      let alpha = 1;
      let bobbing = true;
      if (e.status === 'exploring') {
        x = base + along;
        alpha = Math.min(1, (WALK_RANGE - along) / 90, along / 30 + 0.2);
      } else if (e.status === 'returning') {
        x = base + WALK_RANGE - along;
        facing = -1;
        alpha = Math.min(1, along / 90, (WALK_RANGE - along) / 30 + 0.2);
      } else {
        // Home and waiting to be collected: stand by the door.
        x = base + 4 + i * 26;
        facing = -1;
        bobbing = false;
      }
      const step = bobbing && !w.figure ? Math.abs(Math.sin(this.time * 8 + e.id)) * 2 : 0;
      w.root.position.set(x, SURFACE_H - 40 - step);
      w.root.scale.set(facing * WALKER_SCALE, WALKER_SCALE);
      w.root.alpha = Math.max(0, alpha);
      w.pose.rotation = bobbing && !w.figure ? Math.sin(this.time * 8 + e.id) * 0.05 : 0;
      w.figure?.play(bobbing ? 'carry' : 'idle', this.time + e.id);
    });
    for (const [id, w] of this.walkers) {
      if (keep.has(id)) continue;
      w.root.destroy({ children: true });
      this.walkers.delete(id);
    }
  }

  /**
   * M7: caravans on the surface, a lane in front of the explorers. Each party
   * walks in single file behind a handcart flying its faction's colours:
   * out to the right while travelling, back toward the door while returning,
   * and waiting beside the door once home. Clock-driven, like explorers.
   */
  private updateCaravans(): void {
    const { state } = this.game;
    const g = this.caravanCarts;
    g.clear();
    const door = state.rooms.find((r) => r.type === 'door');
    const base = door ? this.roomRect(door).x + this.roomRect(door).w + 24 : 220;
    const laneY = SURFACE_H - GROUND_DEPTH + 10;
    const keep = new Set<string>();
    const caravans: Caravan[] = (state.caravans ?? []).slice(0, 3);
    caravans.forEach((c, ci) => {
      const along = (this.time * 16 + ci * 190 + (hash(c.id) % 120)) % CARAVAN_RANGE;
      const home = c.status === 'returned';
      const out = c.status === 'travelling';
      const facing: 1 | -1 = home ? -1 : out ? 1 : -1;
      const lead = home ? base + 330 + ci * 120 : out ? base + along : base + CARAVAN_RANGE - along;
      const alpha = home ? 1 : Math.max(0, Math.min(1, (CARAVAN_RANGE - along) / 90, along / 30 + 0.2));
      // The cart goes first, the party follows it.
      const cartX = lead + facing * 10;
      const bump = home ? 0 : Math.abs(Math.sin(this.time * 6 + c.id)) * 1.5;
      const colour = FACTION_COLOURS[c.factionId] ?? 0xf2a541;
      g.rect(cartX - 20, laneY - 20 - bump, 40, 12).fill({ color: 0x8a6a45, alpha });
      g.rect(cartX - 20, laneY - 20 - bump, 40, 3).fill({ color: 0xb08d5b, alpha });
      g.rect(cartX - 16, laneY - 32 - bump, 16, 12).fill({ color: 0x9b7447, alpha });
      g.rect(cartX + 2, laneY - 29 - bump, 12, 9).fill({ color: 0xe9d9b6, alpha });
      g.circle(cartX - 11, laneY - 6, 6).stroke({ width: 2, color: 0x2b2f33, alpha });
      g.circle(cartX + 11, laneY - 6, 6).stroke({ width: 2, color: 0x2b2f33, alpha });
      g.rect(cartX - facing * 20 - 1, laneY - 50 - bump, 2, 32).fill({ color: 0x2b2f33, alpha });
      const wave = Math.sin(this.time * 5 + c.id) * 2;
      g.poly([cartX - facing * 20, laneY - 50 - bump, cartX - facing * 34, laneY - 46 - bump + wave, cartX - facing * 20, laneY - 42 - bump]).fill({ color: colour, alpha });
      c.residentIds.forEach((rid, i) => {
        const res = state.residents.find((r) => r.id === rid);
        if (!res) return;
        const key = `${c.id}:${rid}`;
        keep.add(key);
        let w = this.caravanWalkers.get(key);
        if (!w) {
          const root = new Container();
          const pose = new Container();
          const shadow = new Graphics().ellipse(0, 0, 11, 3).fill({ color: 0x000000, alpha: 0.35 });
          const body = new Graphics();
          pose.addChild(shadow, body);
          root.addChild(pose);
          this.walkerLayer.addChild(root);
          w = { root, pose, body, figure: null, look: '' };
          this.caravanWalkers.set(key, w);
        }
        const look = `${res.weapon ?? ''}|${res.outfit ?? ''}`;
        if (w.look !== look) {
          w.look = look;
          this.dress(w, res, false, false);
        }
        const x = home ? lead + 34 + i * 24 : lead - facing * (34 + i * 24);
        const step = !home && !w.figure ? Math.abs(Math.sin(this.time * 8 + rid)) * 2 : 0;
        w.root.position.set(x, laneY - step);
        w.root.scale.set(facing * WALKER_SCALE, WALKER_SCALE);
        w.root.alpha = alpha;
        w.pose.rotation = !home && !w.figure ? Math.sin(this.time * 8 + rid) * 0.05 : 0;
        w.figure?.play(home ? 'idle' : 'walk', home ? this.time + rid : this.time * 1.2 + rid);
      });
    });
    for (const [key, w] of this.caravanWalkers) {
      if (keep.has(key)) continue;
      w.root.destroy({ children: true });
      this.caravanWalkers.delete(key);
    }
  }

  /** True if a world point is on one of the surface caravan figures. */
  private caravanAt(wx: number, wy: number): boolean {
    for (const w of this.caravanWalkers.values()) {
      if (w.root.alpha < 0.2) continue;
      const { x, y } = w.root.position;
      if (Math.abs(wx - x) < 22 && wy < y + 6 && wy > y - RESIDENT_H * WALKER_SCALE - 10) return true;
    }
    return false;
  }

  /** True if a world point is on one of the surface explorer figures. */
  private walkerAt(wx: number, wy: number): boolean {
    for (const w of this.walkers.values()) {
      if (w.root.alpha < 0.2) continue;
      const { x, y } = w.root.position;
      if (Math.abs(wx - x) < 16 && wy < y + 6 && wy > y - RESIDENT_H * WALKER_SCALE - 6) return true;
    }
    return false;
  }

  private residentBounds(res: Resident, waitingIndex: number) {
    const { state } = this.game;
    if (res.waiting) {
      const door = state.rooms.find((r) => r.type === 'door');
      const base = door ? this.roomRect(door).x + 20 : 20;
      const x = base + waitingIndex * 30;
      return { min: x, max: x, y: SURFACE_H - 40 };
    }
    let room = res.roomId !== null ? state.rooms.find((r) => r.id === res.roomId) : undefined;
    if (!room && isChild(state, res)) {
      // Children play in the quarters.
      const homes = state.rooms.filter((r) => roomDef(this.game.content, r).category === 'living');
      room = homes[hash(res.id) % Math.max(1, homes.length)];
    }
    const target = room ?? state.rooms.find((r) => r.type === 'door');
    if (!target) return { min: 0, max: 0, y: SURFACE_H };
    const r = this.roomRect(target);
    // Topside workers stand on the open ground in front of their building.
    if (isTopside(target)) return { min: r.x + 14, max: r.x + r.w - 14, y: SURFACE_H - GROUND_DEPTH + 4 };
    return { min: r.x + DEPTH_X + 12, max: r.x + r.w - DEPTH_X - 12, y: r.y + r.h - DEPTH_Y / 2 - 4 };
  }

  private createSprite(res: Resident): ResidentSprite {
    const root = new Container();
    const halo = new Graphics();
    halo.ellipse(0, 0, 18, 6).fill({ color: 0xf2a541, alpha: 0.8 });
    halo.visible = false;
    root.addChild(halo);
    const pose = new Container();
    const shadow = new Graphics().ellipse(0, 0, 11, 3).fill({ color: 0x000000, alpha: 0.35 });
    const body = new Graphics();
    pose.addChild(shadow, body);
    root.addChild(pose);
    root.eventMode = 'static';
    root.cursor = 'grab';
    root.hitArea = { contains: (x: number, y: number) => x > -14 && x < 14 && y > -RESIDENT_H && y < 4 };
    root.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
      this.gesture = { kind: 'drag', startX: e.global.x, startY: e.global.y, t: performance.now(), moved: false, residentId: res.id };
    });
    this.residentLayer.addChild(root);
    return { root, pose, body, figure: null, moving: false, x: 0, targetX: 0, roomId: -999, phase: hash(res.id) % 10, facing: 1, look: '', action: 'idle' };
  }

  // ---------------------------------------------------------------- input

  private installInput(): void {
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;

    stage.on('pointerdown', (e: FederatedPointerEvent) => {
      if (this.suspended) return;
      this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        this.gesture = { kind: 'pinch', startX: 0, startY: 0, t: 0, moved: true, pinchDist: Math.hypot(a.x - b.x, a.y - b.y) };
      } else if (this.gesture.kind !== 'drag') {
        this.gesture = { kind: 'pan', startX: e.global.x, startY: e.global.y, t: performance.now(), moved: false };
      }
    });

    stage.on('globalpointermove', (e: FederatedPointerEvent) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.global.x - prev.x;
      const dy = e.global.y - prev.y;
      this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
      const g = this.gesture;
      if (Math.hypot(e.global.x - g.startX, e.global.y - g.startY) > 6) g.moved = true;
      if (g.kind === 'pan' && g.moved) {
        this.world.x += dx;
        this.world.y += dy;
        this.clampCamera();
      } else if (g.kind === 'pinch' && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (g.pinchDist) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / g.pinchDist);
        g.pinchDist = dist;
      } else if (g.kind === 'drag' && g.residentId !== undefined && g.moved) {
        const sp = this.sprites.get(g.residentId);
        if (sp) {
          const local = this.world.toLocal(e.global);
          sp.x = local.x;
          sp.root.position.set(local.x, local.y + 20);
          sp.root.cursor = 'grabbing';
        }
      }
    });

    const end = (e: FederatedPointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.suspended) {
        this.gesture = { kind: 'none', startX: 0, startY: 0, t: 0, moved: false };
        return;
      }
      const g = this.gesture;
      if (this.pointers.size > 0 && g.kind === 'pinch') return;
      const local = this.world.toLocal(e.global);
      if (g.kind === 'drag' && g.residentId !== undefined) {
        const res = this.game.state.residents.find((r) => r.id === g.residentId);
        if (res) {
          if (g.moved && !res.dead) this.cb.onResidentDrop(res.id, this.roomAt(local.x, local.y));
          else this.cb.onResidentTap(res);
        }
        const sp = this.sprites.get(g.residentId);
        if (sp) sp.roomId = -999; // re-seat
      } else if (g.kind === 'pan' && !g.moved) {
        const room = this.roomAt(local.x, local.y);
        if (this.walkerAt(local.x, local.y)) this.cb.onExplorerTap();
        else if (this.cb.onCaravanTap && this.caravanAt(local.x, local.y)) this.cb.onCaravanTap();
        else if (room) this.cb.onRoomTap(room);
        else this.cb.onEmptyTap();
      }
      this.gesture = { kind: 'none', startX: 0, startY: 0, t: 0, moved: false };
    };
    stage.on('pointerup', end);
    stage.on('pointerupoutside', end);

    this.app.canvas.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        if (this.suspended) return;
        this.zoomAt(ev.offsetX, ev.offsetY, ev.deltaY < 0 ? 1.1 : 1 / 1.1);
      },
      { passive: false },
    );
    window.addEventListener('resize', () => this.clampCamera());
  }

  // ---------------------------------------------------------------- effects

  private onEvents(events: GameEvent[]): void {
    const { state } = this.game;
    for (const ev of events) {
      if (ev.type === 'collected') {
        const room = state.rooms.find((r) => r.id === ev.roomId);
        if (!room) continue;
        const r = this.roomRect(room);
        this.float(`+${floatAmount(ev.amount)}`, r.x + r.w / 2, r.y + 30, RESOURCE_COLORS[ev.resource] ?? 0xffffff);
        const scrip = Math.round(ev.bonusScrip + (ev.baseScrip ?? 0));
        if (scrip > 0) this.float(`+${scrip} scrip${ev.bonusScrip > 0 ? '!' : ''}`, r.x + r.w / 2, r.y + 54, 0xf2a541);
      } else if (ev.type === 'residentLeveled') {
        const sp = this.sprites.get(ev.residentId);
        if (sp) this.float(`LEVEL ${ev.level}`, sp.x, sp.root.y - RESIDENT_H - 10, 0xf4ecd8);
      } else if (ev.type === 'craftCollected') {
        const room = state.rooms.find((r) => r.id === ev.roomId);
        const item = this.game.content.items[ev.defId];
        if (room && item) {
          const r = this.roomRect(room);
          this.float(`+ ${item.name}`, r.x + r.w / 2, r.y + 40, RARITY_COLORS[item.rarity] ?? 0xf4ecd8);
        }
      } else if (ev.type === 'rushSucceeded') {
        const room = state.rooms.find((r) => r.id === ev.roomId);
        if (room) {
          const r = this.roomRect(room);
          this.float('RUSHED!', r.x + r.w / 2, r.y + 60, 0x8fc93a);
        }
      }
    }
  }

  private float(text: string, x: number, y: number, color: number): void {
    const t = new Text({
      text,
      style: { fontFamily: 'Bungee, sans-serif', fontSize: 18, fill: color, stroke: { color: 0x14100d, width: 4 } },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.fxLayer.addChild(t);
    this.floats.push({ text: t, life: 1.4, vy: -34 });
  }

  private updateFloats(dt: number): void {
    for (const f of this.floats) {
      f.life -= dt;
      f.text.y += f.vy * dt;
      f.text.alpha = Math.max(0, Math.min(1, f.life / 0.5));
    }
    const dead = this.floats.filter((f) => f.life <= 0);
    for (const f of dead) f.text.destroy();
    this.floats = this.floats.filter((f) => f.life > 0);
  }
}

// -------------------------------------------------------------------- art

/** A collected amount as a floater: whole numbers, one decimal for a trickle under 1. */
function floatAmount(n: number): string {
  if (n > 0 && n < 1) return n.toFixed(1);
  return Math.round(n).toLocaleString();
}

const STAT_LETTERS: Record<StatKey, string> = { brawn: 'BRN', sight: 'SGT', grit: 'GRT', charm: 'CHR', wits: 'WIT', knack: 'KNK', fortune: 'FOR' };

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

/** Draw a cutaway room box at (0,0) of size w×h. */
/** The back wall's rectangle inside a room box (the painted art covers it). */
function backWall(w: number, h: number): { x: number; y: number; w: number; h: number } {
  const i = 3;
  return { x: i + DEPTH_X, y: i + DEPTH_Y, w: w - 2 * (i + DEPTH_X), h: h - 2 * (i + DEPTH_Y) };
}

/** `shell` draws only the box (frame, ceiling, floor, walls): painted art supplies the rest. */
function drawRoomBox(g: Graphics, type: string, w: number, h: number, level: number, segments: number, shell = false): void {
  const look = roomLook(type);
  const dx = DEPTH_X;
  const dy = DEPTH_Y;
  // frame / rock lip
  g.rect(0, 0, w, h).fill(FRAME);
  const i = 3; // frame thickness
  // ceiling plane
  g.poly([i, i, w - i, i, w - i - dx, i + dy, i + dx, i + dy]).fill(shade(look.wall, -0.45));
  // floor plane
  g.poly([i, h - i, w - i, h - i, w - i - dx, h - i - dy, i + dx, h - i - dy]).fill(shade(look.floor, 0.05));
  // side walls
  g.poly([i, i, i + dx, i + dy, i + dx, h - i - dy, i, h - i]).fill(shade(look.wall, -0.3));
  g.poly([w - i, i, w - i - dx, i + dy, w - i - dx, h - i - dy, w - i, h - i]).fill(shade(look.wall, -0.38));
  // back wall with wainscot
  const bx = i + dx;
  const by = i + dy;
  const bw = w - 2 * (i + dx);
  const bh = h - 2 * (i + dy);
  g.rect(bx, by, bw, bh).fill(look.wall);
  g.rect(bx, by + bh * 0.62, bw, bh * 0.38).fill(shade(look.wall, -0.12));
  g.rect(bx, by + bh * 0.62, bw, 3).fill(look.trim);
  // level stripes on the ceiling lip
  for (let l = 0; l < level; l++) g.rect(bx + 4 + l * 10, by + 2, 7, 3).fill(look.accent);
  if (shell) return;

  switch (type) {
    case 'door': {
      // blast door: thick slab with hazard chevrons (deliberately not a round cog)
      const cx = bx + bw * 0.28;
      g.rect(cx - 30, by + 6, 60, bh - 6).fill(0x4a5553);
      g.rect(cx - 26, by + 10, 52, bh - 14).fill(0x5d6a68);
      for (let k = 0; k < 5; k++) {
        const yy = by + 14 + k * 16;
        g.poly([cx - 22, yy, cx - 10, yy, cx + 2, yy + 8, cx - 10, yy + 8]).fill(0xf2a541);
        g.poly([cx + 4, yy, cx + 16, yy, cx + 22, yy + 4, cx + 22, yy + 8, cx + 16, yy + 8]).fill(0x1b1b1b);
      }
      g.circle(cx, by + bh / 2, 7).fill(0x2b3332);
      g.rect(bx + bw * 0.6, by + bh * 0.2, 36, 22).fill(0x263234);
      g.rect(bx + bw * 0.6 + 4, by + bh * 0.2 + 4, 28, 14).fill(0x7fe0c0);
      break;
    }
    case 'elevator': {
      g.rect(0, 0, w, h).fill(0x1d2628);
      g.rect(w / 2 - 2, 0, 4, h).fill(0x0e1415);
      g.rect(4, h * 0.3, w - 8, h * 0.6).fill(0x3a4a4c);
      g.rect(6, h * 0.34, w - 12, 6).fill(0xf2a541);
      break;
    }
    case 'generator': {
      for (let s = 0; s < segments; s++) {
        const cx = bx + (bw / segments) * (s + 0.5);
        const cy = by + bh * 0.55;
        g.rect(cx - 24, cy + 6, 48, bh * 0.4).fill(shade(look.trim, -0.2));
        g.circle(cx, cy, 24).fill(0x3b3f3a);
        g.circle(cx, cy, 18).fill(look.accent);
        g.circle(cx, cy, 7).fill(0x3b3f3a);
        for (let k = 0; k < 4; k++) {
          const a = (Math.PI / 2) * k;
          g.poly([cx, cy, cx + Math.cos(a) * 17, cy + Math.sin(a) * 17, cx + Math.cos(a + 0.4) * 17, cy + Math.sin(a + 0.4) * 17]).fill(0x3b3f3a);
        }
      }
      break;
    }
    case 'canteen': {
      g.rect(bx + 6, by + bh * 0.55, bw - 12, 10).fill(look.trim);
      g.rect(bx + 10, by + bh * 0.55 + 10, bw - 20, bh * 0.45 - 10).fill(shade(look.trim, -0.25));
      for (let s = 0; s < segments * 2; s++) {
        const px = bx + 18 + s * ((bw - 36) / Math.max(1, segments * 2 - 1));
        g.circle(px, by + bh * 0.5, 6).fill(0xf4ecd8);
        g.circle(px, by + bh * 0.5, 3).fill(look.accent);
      }
      g.rect(bx + 10, by + 10, 40, 16).fill(0x2e5a4e);
      break;
    }
    case 'waterworks': {
      for (let s = 0; s < segments * 2; s++) {
        const tx = bx + 10 + s * ((bw - 20) / (segments * 2));
        const tw = (bw - 20) / (segments * 2) - 8;
        g.roundRect(tx, by + bh * 0.22, tw, bh * 0.74, 10).fill(shade(look.trim, 0.1));
        g.roundRect(tx + 4, by + bh * 0.5, tw - 8, bh * 0.42, 6).fill(look.accent);
      }
      g.rect(bx, by + 8, bw, 5).fill(shade(look.trim, -0.3));
      break;
    }
    case 'quarters': {
      for (let s = 0; s < segments; s++) {
        const px = bx + (bw / segments) * s + 8;
        const pw = bw / segments - 16;
        g.rect(px, by + bh * 0.66, pw * 0.55, 12).fill(look.accent);
        g.rect(px, by + bh * 0.66 + 12, pw * 0.55, 6).fill(shade(look.trim, -0.2));
        g.rect(px, by + bh * 0.58, 12, 8).fill(0xf4ecd8);
        g.rect(px + pw * 0.66, by + bh * 0.2, pw * 0.3, bh * 0.3).fill(0x7fb7c9); // window/poster
        g.rect(px + pw * 0.66, by + bh * 0.2, pw * 0.3, 4).fill(look.trim);
      }
      break;
    }
    case 'radio': {
      for (let s = 0; s < segments; s++) {
        const cx = bx + (bw / segments) * (s + 0.5);
        // console desk with dials, a microphone and a speaker grille
        g.rect(cx - 30, by + bh * 0.58, 60, bh * 0.42).fill(shade(look.trim, -0.2));
        g.rect(cx - 26, by + bh * 0.62, 52, 8).fill(0x2b2f33);
        for (let k = 0; k < 4; k++) g.circle(cx - 18 + k * 12, by + bh * 0.66, 3).fill(k % 2 ? look.accent : 0x7fe0c0);
        g.rect(cx + 18, by + bh * 0.3, 3, bh * 0.28).fill(0x2b2f33);
        g.roundRect(cx + 13, by + bh * 0.22, 13, 16, 6).fill(0x5d6a68);
        g.roundRect(cx - 34, by + bh * 0.16, 26, 30, 4).fill(0x3b2f2a);
        for (let k = 0; k < 4; k++) g.rect(cx - 30, by + bh * 0.16 + 5 + k * 6, 18, 2).fill(0x8c7a4a);
      }
      break;
    }
    case 'clinic': {
      for (let s = 0; s < segments; s++) {
        const px = bx + (bw / segments) * s + 10;
        const pw = bw / segments - 20;
        g.rect(px, by + bh * 0.62, pw * 0.7, 10).fill(0xf4ecd8);
        g.rect(px, by + bh * 0.62 + 10, 4, bh * 0.25).fill(0x9b9b9b);
        g.rect(px + pw * 0.7 - 4, by + bh * 0.62 + 10, 4, bh * 0.25).fill(0x9b9b9b);
        const cx = px + pw * 0.8;
        const cy = by + bh * 0.3;
        g.rect(cx - 9, cy - 3, 18, 6).fill(look.accent);
        g.rect(cx - 3, cy - 9, 6, 18).fill(look.accent);
      }
      break;
    }
    case 'purgelab': {
      for (let s = 0; s < segments * 3; s++) {
        const fx = bx + 14 + s * ((bw - 28) / (segments * 3));
        g.rect(bx + 6, by + bh * 0.66, bw - 12, 6).fill(shade(look.trim, -0.2));
        g.rect(fx + 4, by + bh * 0.42, 6, 12).fill(0xe6e0f0);
        g.poly([fx, by + bh * 0.66, fx + 14, by + bh * 0.66, fx + 10, by + bh * 0.52, fx + 4, by + bh * 0.52]).fill(s % 2 ? look.accent : 0x7fe0c0);
      }
      break;
    }
    case 'storeroom': {
      for (let s = 0; s < segments * 3; s++) {
        const cx = bx + 10 + s * ((bw - 20) / (segments * 3));
        const size = 18 + (s % 3) * 4;
        g.rect(cx, by + bh - size - 2, size, size).fill(0x9b7447);
        g.rect(cx, by + bh - size - 2, size, 3).fill(0x6a4f30);
        g.rect(cx + size / 2 - 1, by + bh - size - 2, 2, size).fill(0x6a4f30);
        if (s % 2 === 0) g.rect(cx + 2, by + bh - size * 2 - 2, size - 4, size).fill(0xb58a57);
      }
      break;
    }
    case 'weaponshop':
      drawWeaponshop(g, look, bx, by, bw, bh);
      break;
    case 'outfitshop':
      drawOutfitshop(g, look, bx, by, bw, bh);
      break;
    case 'office':
      drawOffice(g, look, bx, by, bw, bh);
      break;
    case 'lab':
    case 'geothermal':
    case 'fungalfarm':
    case 'refinery':
    case 'aquifer':
      drawDepthRoom(g, type, look, bx, by, bw, bh, segments);
      break;
    default: {
      for (let s = 0; s < segments * 2; s++) {
        const px = bx + 10 + s * ((bw - 20) / (segments * 2));
        g.rect(px, by + bh * 0.4, (bw - 20) / (segments * 2) - 8, bh * 0.56).fill(shade(look.trim, -0.1));
        g.rect(px + 4, by + bh * 0.45, 10, 6).fill(look.accent);
      }
    }
  }
}

const WOOD = 0x8a6a45;
const WOOD_DARK = 0x5e452c;
const STEEL = 0x6f7b7a;
const STEEL_DARK = 0x2b2f33;

/** Weapon Workshop: tool pegboard, workbench with a vice, and a gun rack. */
function drawWeaponshop(g: Graphics, look: RoomLook, bx: number, by: number, bw: number, bh: number): void {
  const floorY = by + bh;
  // pegboard with hanging tools
  const px = bx + 12;
  const py = by + 20;
  g.rect(px, py, 104, 40).fill(shade(look.wall, -0.28));
  g.rect(px, py, 104, 3).fill(look.trim);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) g.circle(px + 6 + c * 10.5, py + 7 + r * 9, 1).fill(shade(look.wall, -0.5));
  // wrench
  g.rect(px + 12, py + 10, 4, 26).fill(STEEL);
  g.circle(px + 14, py + 10, 5).fill(STEEL);
  g.circle(px + 14, py + 8, 2.5).fill(shade(look.wall, -0.28));
  // hammer
  g.rect(px + 32, py + 14, 4, 24).fill(WOOD);
  g.rect(px + 26, py + 9, 16, 7).fill(STEEL_DARK);
  // saw
  g.poly([px + 50, py + 10, px + 76, py + 10, px + 76, py + 18, px + 50, py + 30]).fill(0xa9b3b2);
  g.roundRect(px + 74, py + 8, 10, 14, 3).fill(look.accent);
  // screwdrivers
  for (let k = 0; k < 3; k++) {
    g.rect(px + 88 + k * 5, py + 10, 3, 9).fill(k % 2 ? look.accent : 0xf2c14e);
    g.rect(px + 89 + k * 5, py + 19, 1.5, 14).fill(STEEL);
  }

  // hanging lamp over the bench
  const lx = bx + 140;
  g.rect(lx - 1, by, 2, 18).fill(STEEL_DARK);
  g.poly([lx - 12, by + 28, lx - 5, by + 18, lx + 5, by + 18, lx + 12, by + 28]).fill(look.trim);
  g.ellipse(lx, by + 29, 9, 2.5).fill(LAMP);

  // workbench
  const benchX = bx + 20;
  const benchW = 176;
  const topY = by + bh * 0.6;
  g.rect(benchX + 6, topY + 8, 8, floorY - topY - 8).fill(WOOD_DARK);
  g.rect(benchX + benchW - 14, topY + 8, 8, floorY - topY - 8).fill(WOOD_DARK);
  g.rect(benchX + 10, floorY - 14, benchW - 20, 5).fill(WOOD_DARK);
  g.rect(benchX + 40, topY + 10, 60, 18).fill(shade(WOOD, -0.15));
  g.rect(benchX + 66, topY + 17, 10, 3).fill(STEEL);
  g.rect(benchX, topY, benchW, 10).fill(WOOD);
  g.rect(benchX, topY, benchW, 3).fill(shade(WOOD, 0.2));
  // a pistol being assembled on the bench
  g.rect(benchX + 22, topY - 7, 30, 6).fill(STEEL_DARK);
  g.poly([benchX + 22, topY - 1, benchX + 32, topY - 1, benchX + 28, topY - 0.5, benchX + 22, topY - 0.5]).fill(STEEL_DARK);
  g.rect(benchX + 26, topY - 3, 8, 3).fill(WOOD);
  for (let k = 0; k < 3; k++) g.circle(benchX + 64 + k * 6, topY - 2, 1.6).fill(0xc9a45a);
  // bench vice
  const vx = benchX + benchW - 44;
  g.rect(vx, topY - 6, 30, 6).fill(STEEL_DARK);
  g.rect(vx + 2, topY - 20, 10, 14).fill(look.accent);
  g.rect(vx + 18, topY - 20, 10, 14).fill(look.accent);
  g.rect(vx + 2, topY - 20, 26, 3).fill(shade(look.accent, -0.3));
  g.rect(vx + 28, topY - 14, 14, 3).fill(STEEL);
  g.rect(vx + 40, topY - 18, 3, 11).fill(STEEL);
  g.rect(vx + 12, topY - 16, 6, 4).fill(0xc9a45a); // stock clamped in the jaws

  // gun rack on the right
  const rw = 112;
  const rx = bx + bw - rw - 12;
  const ry = by + 20;
  const rh = bh - 24;
  g.rect(rx, ry, rw, rh).fill(shade(WOOD, -0.35));
  g.rect(rx + 4, ry + 4, rw - 8, rh - 8).fill(shade(look.wall, -0.4));
  for (let k = 0; k < 5; k++) {
    const gx = rx + 14 + k * 21;
    const long = k % 2 === 0;
    const top = ry + (long ? 8 : 18);
    g.rect(gx, top, 4, rh - 34 - (top - ry - 8)).fill(STEEL_DARK);
    g.rect(gx - 1, top + 16, 6, 12).fill(STEEL);
    g.poly([gx - 3, ry + rh - 28, gx + 7, ry + rh - 28, gx + 9, ry + rh - 8, gx - 1, ry + rh - 8]).fill(k === 2 ? 0xa0522d : WOOD);
    if (k === 1 || k === 3) g.rect(gx + 4, top + 8, 5, 4).fill(STEEL_DARK); // scope
  }
  g.rect(rx + 2, ry + 26, rw - 4, 4).fill(WOOD);
  g.rect(rx + 2, ry + rh - 10, rw - 4, 6).fill(WOOD);
  g.rect(rx + rw / 2 - 18, ry - 2, 36, 8).fill(look.accent);

  // ammo crates on the floor between bench and rack
  const cx = benchX + benchW + 14;
  g.rect(cx, floorY - 20, 26, 20).fill(0x5d6b3a);
  g.rect(cx, floorY - 20, 26, 3).fill(0x3e4a26);
  g.rect(cx + 8, floorY - 13, 10, 5).fill(0xf2c14e);
  g.rect(cx + 3, floorY - 34, 20, 14).fill(0x6b7a44);
  g.rect(cx + 3, floorY - 34, 20, 3).fill(0x3e4a26);
}

/** Outfit Workshop: fabric rolls, a sewing machine table and dress forms. */
function drawOutfitshop(g: Graphics, look: RoomLook, bx: number, by: number, bw: number, bh: number): void {
  const floorY = by + bh;
  const cloth = [0x3f6f9a, 0xd9645b, 0x8fc93a, 0xf2c14e, 0x8e3b5e, 0x4fb3a9, 0xe8e4d8, 0xb5562f];

  // fabric shelf: rolls seen end-on
  const sx = bx + 12;
  const sy = by + 20;
  g.rect(sx, sy, 78, bh - 20).fill(shade(WOOD, -0.3));
  g.rect(sx + 3, sy + 3, 72, bh - 26).fill(shade(look.wall, -0.35));
  for (let row = 0; row < 3; row++) {
    const yy = sy + 4 + row * 25;
    g.rect(sx + 2, yy + 20, 74, 4).fill(WOOD);
    for (let c = 0; c < 3; c++) {
      const col = cloth[(row * 3 + c) % cloth.length] ?? 0xffffff;
      const cxr = sx + 15 + c * 24;
      g.circle(cxr, yy + 10, 9.5).fill(col);
      g.circle(cxr, yy + 10, 6.5).fill(shade(col, -0.15));
      g.circle(cxr, yy + 10, 2.5).fill(0xe9d9b6);
    }
  }
  // two tall rolls leaning against the shelf
  g.poly([sx + 82, floorY, sx + 90, floorY, sx + 104, by + 22, sx + 96, by + 20]).fill(cloth[4] ?? 0);
  g.poly([sx + 94, floorY, sx + 102, floorY, sx + 110, by + 34, sx + 102, by + 32]).fill(cloth[5] ?? 0);

  // pattern sheets pinned to the wall
  g.rect(bx + 132, by + 22, 34, 24).fill(0xf4ecd8);
  g.poly([bx + 138, by + 27, bx + 160, by + 27, bx + 156, by + 40, bx + 142, by + 40]).stroke({ width: 1, color: 0x7fb7c9 });
  g.rect(bx + 172, by + 24, 26, 20).fill(0xe9d9b6);
  g.circle(bx + 185, by + 34, 6).stroke({ width: 1, color: look.trim });
  g.circle(bx + 149, by + 23, 2).fill(look.accent);
  g.circle(bx + 185, by + 25, 2).fill(look.accent);

  // sewing table
  const tx = bx + 124;
  const tw = 104;
  const topY = by + bh * 0.62;
  g.rect(tx + 6, topY + 8, 6, floorY - topY - 8).fill(STEEL_DARK);
  g.rect(tx + tw - 12, topY + 8, 6, floorY - topY - 8).fill(STEEL_DARK);
  // treadle
  g.rect(tx + 30, floorY - 8, 40, 5).fill(STEEL_DARK);
  g.circle(tx + tw - 20, floorY - 18, 9).stroke({ width: 2, color: STEEL_DARK });
  g.rect(tx, topY, tw, 8).fill(WOOD);
  g.rect(tx, topY, tw, 2).fill(shade(WOOD, 0.2));
  // sewing machine (classic arm shape)
  const mx = tx + 22;
  g.rect(mx, topY - 8, 60, 8).fill(STEEL_DARK);
  g.rect(mx + 44, topY - 34, 14, 28).fill(STEEL_DARK);
  g.roundRect(mx + 4, topY - 38, 54, 11, 4).fill(STEEL_DARK);
  g.rect(mx + 4, topY - 30, 12, 18).fill(STEEL_DARK);
  g.rect(mx + 9, topY - 12, 2, 5).fill(0xc9d1d3); // needle
  g.rect(mx + 8, topY - 35, 46, 2).fill(0xf2c14e); // gold stripe
  g.circle(mx + 58, topY - 22, 6).fill(0x5d6a68); // handwheel
  g.rect(mx + 28, topY - 44, 4, 6).fill(look.accent); // spool
  g.rect(mx - 12, topY - 3, 40, 3).fill(cloth[0] ?? 0); // fabric under the needle
  // pincushion and scissors
  g.circle(tx + tw - 10, topY - 4, 5).fill(look.accent);
  g.circle(tx + tw - 22, topY - 2, 2).stroke({ width: 1, color: STEEL });
  g.circle(tx + tw - 16, topY - 2, 2).stroke({ width: 1, color: STEEL });

  // dress forms (mannequins) on stands
  const form = (fx: number, color: number, dressed: boolean) => {
    g.rect(fx - 1.5, by + bh * 0.62, 3, floorY - by - bh * 0.62 - 4).fill(STEEL_DARK);
    g.poly([fx - 12, floorY, fx, floorY - 8, fx + 12, floorY]).fill(STEEL_DARK);
    const top = by + 24;
    g.rect(fx - 2, top - 6, 4, 6).fill(WOOD_DARK);
    g.circle(fx, top - 7, 3).fill(WOOD_DARK);
    // torso: shoulders, waist, hips
    g.poly([fx - 15, top + 4, fx - 11, top, fx + 11, top, fx + 15, top + 4, fx + 9, top + 26, fx + 14, top + 42, fx - 14, top + 42, fx - 9, top + 26]).fill(dressed ? color : 0xe9d9b6);
    if (dressed) {
      g.rect(fx - 9, top + 23, 18, 4).fill(shade(color, -0.35)); // belt
      g.poly([fx - 4, top, fx, top + 10, fx + 4, top]).fill(0xf4ecd8); // collar
    } else {
      g.rect(fx - 12, top + 17, 24, 1.5).fill(look.trim); // tape measure
    }
  };
  form(bx + bw - 94, 0x3f6f9a, true);
  form(bx + bw - 44, look.accent, false);
  // an outfit on a hanger rail between them
  g.rect(bx + bw - 76, by + 20, 22, 2).fill(STEEL);
}

function drawItemGlyph(g: Graphics, kind: 'weapon' | 'outfit', cx: number, cy: number): void {
  const ink = 0x14100d;
  if (kind === 'weapon') {
    g.rect(cx - 9, cy - 5, 18, 5).fill(ink);
    g.poly([cx - 9, cy, cx - 2, cy, cx - 4, cy + 9, cx - 9, cy + 9]).fill(ink);
    g.rect(cx + 7, cy - 7, 2, 2).fill(ink);
  } else {
    g.poly([cx - 4, cy - 8, cx - 10, cy - 4, cx - 7, cy + 1, cx - 5, cy - 1, cx - 5, cy + 9, cx + 5, cy + 9, cx + 5, cy - 1, cx + 7, cy + 1, cx + 10, cy - 4, cx + 4, cy - 8, cx, cy - 5]).fill(ink);
  }
}

/** Explorer's pack, drawn behind the figure (who faces right). */
function drawBackpack(g: Graphics): void {
  const top = -RESIDENT_H;
  g.roundRect(-17, top + 13, 10, 18, 3).fill(0x6b5434);
  g.rect(-17, top + 18, 10, 2).fill(0x3e2f1c);
  g.roundRect(-15, top + 8, 7, 6, 2).fill(0xd9c9a3); // bedroll
}

function drawResourceGlyph(g: Graphics, resource: string, cx: number, cy: number): void {
  const ink = 0x14100d;
  switch (resource) {
    case 'power':
      g.poly([cx + 2, cy - 9, cx - 6, cy + 1, cx - 1, cy + 1, cx - 3, cy + 9, cx + 6, cy - 2, cx + 1, cy - 2]).fill(ink);
      break;
    case 'food':
      g.circle(cx, cy + 1, 7).fill(ink);
      g.rect(cx - 1, cy - 9, 3, 5).fill(ink);
      break;
    case 'water':
      g.poly([cx, cy - 9, cx + 6, cy + 2, cx - 6, cy + 2]).fill(ink);
      g.circle(cx, cy + 3, 6).fill(ink);
      break;
    default:
      g.rect(cx - 6, cy - 2, 12, 4).fill(ink);
      g.rect(cx - 2, cy - 6, 4, 12).fill(ink);
  }
}

/** Outfit colour by the stat it boosts; the plain teal is the Halcyon jumpsuit. */
const OUTFIT_COLORS: Record<string, number> = {
  brawn: 0xb5562f,
  sight: 0x3f6f9a,
  grit: 0x6b6b4a,
  charm: 0x8e3b5e,
  wits: 0xe8e4d8,
  knack: 0x3d8a4f,
  fortune: 0x2c2c34,
};
const RARITY_TRIM: Record<string, number> = { common: 0xf2a541, rare: 0xc9d1d3, legendary: 0xf2c14e };

function drawHeart(g: Graphics, x: number, y: number, s: number): void {
  g.circle(x - s * 0.5, y, s * 0.55).fill(0xe4576e);
  g.circle(x + s * 0.5, y, s * 0.55).fill(0xe4576e);
  g.poly([x - s, y + s * 0.15, x + s, y + s * 0.15, x, y + s * 1.2]).fill(0xe4576e);
}

export function drawResident(g: Graphics, res: Resident, content: Content, child: boolean): void {
  const skin = SKIN[res.appearance.skin % SKIN.length] ?? 0xf1c9a5;
  const hair = HAIR[res.appearance.hair % HAIR.length] ?? 0x2b1e16;
  const outfit = res.outfit ? content.outfits[res.outfit] : undefined;
  const outfitStat = outfit ? Object.keys(outfit.bonus)[0] : undefined;
  const suit = child ? 0x6fb5c9 : outfitStat ? (OUTFIT_COLORS[outfitStat] ?? 0x3f8f8a) : 0x3f8f8a;
  const stripe = outfit ? (RARITY_TRIM[outfit.rarity] ?? 0xf2a541) : 0xf2a541;
  const top = -RESIDENT_H;
  // legs
  g.roundRect(-7, top + 30, 6, 16, 2).fill(shade(suit, -0.3));
  g.roundRect(1, top + 30, 6, 16, 2).fill(shade(suit, -0.3));
  // torso
  g.roundRect(-10, top + 14, 20, 20, 6).fill(suit);
  g.rect(-10, top + 22, 20, 3).fill(stripe);
  // arms
  g.roundRect(-13, top + 16, 5, 14, 2).fill(shade(suit, -0.1));
  g.roundRect(8, top + 16, 5, 14, 2).fill(shade(suit, -0.1));
  // head
  g.circle(0, top + 8, 9).fill(skin);
  // hair (skull cap + style)
  if (res.sex === 'f') {
    g.ellipse(0, top + 3, 10, 6).fill(hair);
    g.roundRect(-10, top + 3, 5, 12, 2).fill(hair);
  } else {
    g.ellipse(0, top + 1, 9, 5).fill(hair);
  }
  // eye (facing right; sprite is mirrored for left)
  g.circle(4, top + 8, 1.4).fill(0x1b1b1b);
  if (res.pregnancy) g.ellipse(9, top + 27, 5, 6).fill(suit);
  drawWeapon(g, res, content, 10, top + 24);
  drawRarityPip(g, res, top - 6);
}

function drawWeapon(g: Graphics, res: Resident, content: Content, x: number, y: number): void {
  if (!res.weapon) return;
  const w = content.weapons[res.weapon];
  const len = w ? 10 + Math.min(12, w.max / 2) : 10;
  g.rect(x, y, len, 4).fill(0x2b2f33);
  g.rect(x, y + 3, 4, 5).fill(0x4a3a2a);
}

function drawRarityPip(g: Graphics, res: Resident, y: number): void {
  if (res.rarity !== 'common') g.circle(0, y, 3).fill(res.rarity === 'legendary' ? 0xf2c14e : 0xc9d1d3);
}

/**
 * What sprite art doesn't show, drawn over it: the weapon held low at the
 * side (left out while a fight animation holds its own), an expecting marker,
 * and the rarity pip.
 */
export function drawOverlays(g: Graphics, res: Resident, content: Content, weapon = true): void {
  const top = -SPRITE_H;
  if (weapon) drawWeapon(g, res, content, 4, top + SPRITE_H * 0.5);
  if (res.pregnancy) drawHeart(g, 11, top + 4, 3);
  drawRarityPip(g, res, top - 5);
}

// The quest scene: a full-screen Pixi layer over the homestead. It draws the
// quest map as ruined cutaway rooms on their floor/col grid, the party and the
// enemies, telegraphs, floating numbers and effects, and runs the crit ring.
// It never changes the game itself: taps are handed to callbacks, which send
// commands through game.run (see ui/questScreen.ts).

import { Application, Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js';
import {
  critRingSpeed,
  currentRoom,
  effectiveMaxHp,
  enemyDef,
  inCombat,
  questContent,
  type EnemyDef,
  type GameEvent,
  type Quest,
  type QuestEnemy,
  type QuestRoom,
  type Resident,
  lootContent,
} from '../../sim';
import type { Game } from '../game';
import { haptic } from '../platform';
import { reducedMotion } from './prefs';
import { drawEnemy, drawEnemyShadow, lookSize } from './enemyArt';
import { SKY_BOTTOM, shade } from './palette';
import {
  DEPTH_X,
  FLOOR_Y,
  GX,
  GY,
  LADDER_X,
  RH,
  RW,
  type Theme,
  drawCorridor,
  drawLadder,
  drawRuinRoom,
  drawStairs,
  strHash,
  themeFor,
} from './ruinArt';
import { type Action, type CharacterArt, CreatureFigure, Figure, residentTints } from './sprites';
import { RESIDENT_H, SPRITE_H, drawOverlays, drawResident } from './vaultView';

/** Displayed height of party members, in world units. */
const PARTY_H = 64;
const PARTY_SCALE = PARTY_H / RESIDENT_H;
/** Creature sprite art stands a little taller than the drawn look size, which has no head room. */
const CREATURE_H = 1.15;
/** Smallest on-screen tap target, in pixels. */
const MIN_TAP = 48;

/** Crit ring geometry, in screen pixels. */
const RING_MAX = 118;
const RING_MIN = 12;
/** Where in each sweep the shrinking ring meets the target ring. */
export const RING_SWEET = 0.7;
/** Offsets (in sweeps) that still count as perfect, and where quality reaches 0. */
const RING_PERFECT = 0.03;
const RING_ZERO = 0.33;
/** Sweeps before an untouched ring gives up (the meter stays full). */
const RING_TIMEOUT_SWEEPS = 3.2;

export interface QuestViewCallbacks {
  onRoomTap(roomId: string): void;
  onEnemyTap(uid: number): void;
  /** quality is null when the ring timed out or was cancelled. */
  onRingResult(residentId: number, quality: number | null): void;
}

/** Timing quality (0..1) from how far the tap was from the sweet spot, in sweeps. */
export function ringQuality(offset: number): number {
  const o = Math.abs(offset);
  if (o <= RING_PERFECT) return 1;
  return Math.max(0, 1 - (o - RING_PERFECT) / (RING_ZERO - RING_PERFECT));
}

export function ringLabel(quality: number): string {
  if (quality >= 0.95) return 'PERFECT!';
  if (quality >= 0.75) return 'GREAT!';
  if (quality >= 0.45) return 'GOOD';
  return 'GLANCING';
}

interface MemberSprite {
  root: Container;
  pose: Container;
  body: Graphics;
  figure: Figure | null;
  look: string;
  name: Text;
  x: number;
  y: number;
  facing: 1 | -1;
  walk: number;
  moving: boolean;
  lunge: number;
  hurt: number;
  /** Crit meter last frame, to call out the moment it fills. */
  crit: number;
  /** What the figure is doing (picks the animation). */
  action: Action;
}

interface EnemySprite {
  uid: number;
  def: EnemyDef;
  root: Container;
  g: Graphics;
  wind: Text;
  plate: Text | null;
  slot: number;
  row: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  scale: number;
  /** Drawn scale: the look's scale, shrunk when the room is crowded and for back rows. */
  fit: number;
  hurt: number;
  lunge: number;
  /** Seconds since it fell; -1 while alive. */
  dead: number;
  /** Last known state, so a fallen enemy can keep fading after the sim drops it. */
  last: QuestEnemy;
  /** Ability index being wound up last frame. */
  winding: number | null;
  interrupted: number;
  /** Creature art, when the look has some; else g draws the enemy. */
  fig: CreatureFigure | null;
  /** Clock time the last attack started (plays the attack animation), or -1. */
  attackAt: number;
}

interface Float {
  text: Text;
  life: number;
  max: number;
  vy: number;
  /** Where it was asked to appear, before stacking, so the next one nearby can stack above it. */
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
  gravity: number;
}

interface Wave {
  x: number;
  y: number;
  life: number;
  max: number;
  radius: number;
  color: number;
  flat: boolean;
}

interface Tracer {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  life: number;
  color: number;
  width: number;
}

interface Ring {
  residentId: number;
  start: number;
  speed: number;
  /** Frame time the ring has been shown; the timeout uses this, so a hitch can't eat it. */
  age: number;
}

/** Damage as a floater: whole numbers, at least 1 for any hit that landed. */
function hitText(n: number): string {
  return `${n > 0 ? Math.max(1, Math.round(n)) : 0}`;
}

export function roomOrigin(room: { floor: number; col: number }) {
  return { x: room.col * (RW + GX), y: room.floor * (RH + GY) };
}

export class QuestView {
  readonly root = new Container();
  private sky = new Graphics();
  readonly world = new Container();
  private earth = new Graphics();
  private links = new Graphics();
  private rooms = new Container();
  private fog = new Graphics();
  private marks = new Container();
  private highlight = new Graphics();
  private actors = new Container();
  private overlay = new Graphics();
  private labels = new Container();
  private fx = new Graphics();
  private floatLayer = new Container();
  private dim = new Graphics();
  private ringLayer = new Container();
  private ringG = new Graphics();
  private ringText: Text;

  questId: number | null = null;
  /** Screen space the DOM bars cover, so the camera centres in what is left. */
  insets = { top: 60, bottom: 150 };

  private art: CharacterArt | null = null;
  private time = 0;
  private staticKey = '';
  private theme: Theme | null = null;
  private members = new Map<number, MemberSprite>();
  private enemies = new Map<number, EnemySprite>();
  private slotCount = 0;
  private floats: Float[] = [];
  private particles: Particle[] = [];
  private waves: Wave[] = [];
  private tracers: Tracer[] = [];
  private shake = 0;
  private cam = { x: 0, y: 0 };
  private zoom = 1;
  /** The player panned: the camera stays put until the party moves on (see updateCamera). */
  private manual = false;
  /** What the party was doing when the player panned: moving, and in which room. */
  private manualAnchor = '';
  private zoomInit = false;
  private skySize = '';
  private ring: Ring | null = null;
  /** Where the ring was last drawn (world), so the result pops up in the same place. */
  private ringAt: { x: number; y: number } | null = null;
  /** Doorway chevrons drawn this frame (tap one to go that way; world coords). */
  private doors: { roomId: string; x: number; y: number }[] = [];
  private down: { id: number; x: number; y: number; cx: number; cy: number; moved: boolean; used: boolean } | null = null;

  constructor(
    private app: Application,
    private game: Game,
    private cb: QuestViewCallbacks,
  ) {
    // The map art only changes when a room is revealed. As its own render group
    // it is not re-batched every frame along with the fighters and effects.
    const statics = new Container({ isRenderGroup: true });
    statics.addChild(this.earth, this.links, this.rooms, this.fog, this.marks);
    this.world.addChild(statics, this.highlight, this.actors, this.overlay, this.labels, this.fx, this.floatLayer);
    this.actors.sortableChildren = true;
    this.ringText = new Text({ text: '', style: { fontFamily: 'Bungee, sans-serif', fontSize: 16, fill: 0xf4ecd8, stroke: { color: 0x14100d, width: 4 } } });
    this.ringText.anchor.set(0.5);
    this.ringLayer.addChild(this.ringG, this.ringText);
    this.root.addChild(this.sky, this.world, this.dim, this.ringLayer);
    this.root.visible = false;
    this.root.eventMode = 'static';
    this.root.hitArea = app.screen;
    this.installInput();
    app.stage.addChild(this.root);
    game.on((events) => this.onEvents(events));
  }

  get isOpen(): boolean {
    return this.questId !== null;
  }

  setArt(art: CharacterArt | null): void {
    this.art = art;
    for (const m of this.members.values()) m.look = '';
  }

  open(questId: number): void {
    if (this.questId !== questId) this.reset();
    this.questId = questId;
    this.root.visible = true;
    const q = this.quest();
    if (q) {
      const room = currentRoom(q);
      if (room) {
        const o = roomOrigin(room);
        this.cam = { x: o.x + RW / 2, y: o.y + RH / 2 };
      }
    }
  }

  close(): void {
    this.cancelRing();
    this.questId = null;
    this.root.visible = false;
    this.reset();
  }

  private reset(): void {
    this.staticKey = '';
    this.manual = false;
    this.zoomInit = false;
    for (const m of this.members.values()) m.root.destroy({ children: true });
    for (const e of this.enemies.values()) e.root.destroy({ children: true });
    this.members.clear();
    this.enemies.clear();
    for (const f of this.floats) f.text.destroy();
    this.floats = [];
    this.particles = [];
    this.waves = [];
    this.tracers = [];
    this.labels.removeChildren().forEach((c) => c.destroy());
    this.slotCount = 0;
  }

  private quest(): Quest | undefined {
    return this.questId === null ? undefined : this.game.state.quests.find((q) => q.id === this.questId);
  }

  private resident(id: number): Resident | undefined {
    return this.game.state.residents.find((r) => r.id === id);
  }

  // ---------------------------------------------------------------- crit ring

  get ringActive(): boolean {
    return this.ring !== null;
  }

  /** Open the ring for a party member; returns false if there is nothing to crit. */
  startRing(residentId: number): boolean {
    const q = this.quest();
    const r = this.resident(residentId);
    if (!q || !r || !inCombat(q)) return false;
    this.ring = { residentId, start: performance.now(), speed: critRingSpeed(this.game.content, r), age: 0 };
    this.ringAt = null;
    return true;
  }

  /** The player tapped: score the ring. */
  tapRing(): void {
    const ring = this.ring;
    if (!ring) return;
    const phase = (((performance.now() - ring.start) / 1000) * ring.speed) % 1;
    const quality = ringQuality(phase - RING_SWEET);
    this.ring = null;
    const at = this.ringAt ?? this.ringCentre(ring.residentId);
    this.cb.onRingResult(ring.residentId, quality);
    const perfect = quality >= 0.95;
    haptic(perfect ? 'heavy' : quality > 0 ? 'tap' : 'warning');
    this.float(ringLabel(quality), at.x, at.y - 30 / this.zoom, perfect ? 0xffd23f : quality >= 0.45 ? 0xf4ecd8 : 0xb9b19c, perfect ? 30 : 22, 1.1);
    this.waves.push({ x: at.x, y: at.y, life: 0.45, max: 0.45, radius: (RING_MAX * 0.9) / this.zoom, color: perfect ? 0xffd23f : 0xf4ecd8, flat: false });
    if (perfect) this.burst(at.x, at.y, 0xffd23f, 26, 260);
  }

  private cancelRing(): void {
    if (!this.ring) return;
    const id = this.ring.residentId;
    this.ring = null;
    this.cb.onRingResult(id, null);
  }

  /** Where the ring sits: over the member's target. */
  private ringCentre(residentId: number): { x: number; y: number } {
    const q = this.quest();
    const m = q?.party.find((x) => x.residentId === residentId);
    const target = q ? effectiveTarget(q, m?.target ?? null) : undefined;
    const sp = target ? this.enemies.get(target.uid) : undefined;
    if (sp) {
      const size = lookSize(sp.def.look);
      return { x: sp.x, y: sp.y - (size.h * sp.fit) / 2 };
    }
    const room = q ? currentRoom(q) : undefined;
    const o = room ? roomOrigin(room) : { x: 0, y: 0 };
    return { x: o.x + RW * 0.7, y: o.y + FLOOR_Y - 40 };
  }

  // ---------------------------------------------------------------- input

  private installInput(): void {
    this.root.on('pointerdown', (e: FederatedPointerEvent) => {
      // Timing matters: the ring is scored on press, not release.
      if (this.ring) {
        this.tapRing();
        this.down = { id: e.pointerId, x: e.global.x, y: e.global.y, cx: this.cam.x, cy: this.cam.y, moved: false, used: true };
        return;
      }
      this.down = { id: e.pointerId, x: e.global.x, y: e.global.y, cx: this.cam.x, cy: this.cam.y, moved: false, used: false };
    });
    this.root.on('globalpointermove', (e: FederatedPointerEvent) => {
      const d = this.down;
      if (!d || d.id !== e.pointerId || d.used) return;
      const dx = e.global.x - d.x;
      const dy = e.global.y - d.y;
      if (!d.moved && Math.hypot(dx, dy) > 10) d.moved = true;
      if (d.moved) {
        this.cam.x = d.cx - dx / this.zoom;
        this.cam.y = d.cy - dy / this.zoom;
        if (!this.manual) {
          const q = this.quest();
          this.manualAnchor = q ? this.anchor(q) : '';
        }
        this.manual = true;
      }
    });
    const up = (e: FederatedPointerEvent) => {
      const d = this.down;
      this.down = null;
      if (!d || d.id !== e.pointerId || d.used || d.moved) return;
      this.tap(e.global.x, e.global.y);
    };
    this.root.on('pointerup', up);
    this.root.on('pointerupoutside', () => (this.down = null));
  }

  private tap(sx: number, sy: number): void {
    const q = this.quest();
    if (!q) return;
    const p = this.world.toLocal({ x: sx, y: sy });
    const pad = MIN_TAP / this.zoom;
    // Enemies first: the nearest one whose (generous) box holds the point.
    let best: { uid: number; d: number } | null = null;
    for (const sp of this.enemies.values()) {
      if (sp.dead >= 0) continue;
      const size = lookSize(sp.def.look);
      const w = Math.max(size.w * sp.fit, pad);
      const h = Math.max(size.h * sp.fit, pad);
      const cx = sp.x;
      const cy = sp.y - h / 2;
      if (Math.abs(p.x - cx) <= w / 2 + 6 && Math.abs(p.y - cy) <= h / 2 + 10) {
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (!best || d < best.d) best = { uid: sp.uid, d };
      }
    }
    if (best) {
      this.cb.onEnemyTap(best.uid);
      return;
    }
    // Doorway chevrons: on a phone the next room may be off screen.
    for (const d of this.doors) {
      if (Math.hypot(p.x - d.x, p.y - d.y) <= Math.max(34, pad * 0.8)) {
        this.cb.onRoomTap(d.roomId);
        return;
      }
    }
    for (const room of q.rooms) {
      const o = roomOrigin(room);
      if (p.x >= o.x && p.x <= o.x + RW && p.y >= o.y && p.y <= o.y + RH) {
        this.cb.onRoomTap(room.id);
        return;
      }
    }
  }

  /** Point the camera back at the party (after the player panned away). */
  follow(): void {
    this.manual = false;
  }

  /** Changes when the party sets off or reaches another room: a manual pan ends then. */
  private anchor(q: Quest): string {
    return `${q.moving ? 1 : 0}|${q.roomId}`;
  }

  /**
   * Keep the camera over the map. The bottom gets extra room so the lowest
   * rooms can be pulled up clear of the party bar.
   */
  private clampCam(q: Quest): void {
    if (!q.rooms.length) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const room of q.rooms) {
      const o = roomOrigin(room);
      x0 = Math.min(x0, o.x);
      y0 = Math.min(y0, o.y);
      x1 = Math.max(x1, o.x + RW);
      y1 = Math.max(y1, o.y + RH);
    }
    // Any room can be brought to the middle of the free view (between the header and the party bar), and a
    // little past the edges; the bottom gets extra room so the lowest row clears the bar with space to spare.
    const bottomPad = RH * 0.5 + this.insets.bottom / this.zoom / 2;
    this.cam.x = Math.min(x1 + RW * 0.5, Math.max(x0 - RW * 0.5, this.cam.x));
    this.cam.y = Math.min(y1 + bottomPad, Math.max(y0 - RH * 0.5, this.cam.y));
  }

  // ---------------------------------------------------------------- test hooks

  enemyScreen(uid: number): { x: number; y: number } | null {
    const sp = this.enemies.get(uid);
    if (!sp) return null;
    const size = lookSize(sp.def.look);
    return this.world.toGlobal({ x: sp.x, y: sp.y - (size.h * sp.fit) / 2 });
  }

  /** The doorway chevron toward a linked room, if one is showing. */
  doorScreen(roomId: string): { x: number; y: number } | null {
    const d = this.doors.find((x) => x.roomId === roomId);
    return d ? this.world.toGlobal({ x: d.x, y: d.y }) : null;
  }

  roomScreen(roomId: string): { x: number; y: number } | null {
    const room = this.quest()?.rooms.find((r) => r.id === roomId);
    if (!room) return null;
    const o = roomOrigin(room);
    return this.world.toGlobal({ x: o.x + RW / 2, y: o.y + RH / 2 });
  }

  // ---------------------------------------------------------------- frame

  update(dt: number): void {
    const q = this.quest();
    if (!q) {
      if (this.questId !== null) this.close();
      return;
    }
    this.time += dt;
    const key = `${q.id}|${q.rooms.map((r) => `${r.id}${r.visited ? 1 : 0}${r.cleared ? 1 : 0}${r.kind}`).join(',')}`;
    if (key !== this.staticKey) this.rebuildStatics(q, key);
    this.drawSky();
    this.syncEnemies(q, dt);
    this.syncMembers(q, dt);
    this.updateCamera(q, dt);
    this.drawHighlight(q);
    this.drawOverlay(q);
    this.drawFx(dt);
    this.updateFloats(dt);
    if (this.ring) this.ring.age += dt;
    this.drawRing(q);
  }

  private computeZoom(fight: boolean): number {
    const W = this.app.screen.width;
    const H = Math.max(200, this.app.screen.height - this.insets.top - this.insets.bottom);
    if (W < 700) return Math.max(0.6, Math.min((W - 18) / RW, H / (RH * 1.3)));
    // Wide screens show the neighbouring rooms too, so the way on is visible;
    // in a fight the camera moves in on the room.
    const base = Math.max(0.8, Math.min(1.6, W / ((RW + GX) * 2.5), H / ((RH + GY) * 1.9)));
    return fight ? Math.max(base, Math.min(base * 1.4, (W * 0.8) / RW, H / (RH * 1.2))) : base;
  }

  private updateCamera(q: Quest, dt: number): void {
    const want = this.computeZoom(inCombat(q) || this.enemies.size > 0);
    if (!this.zoomInit) {
      this.zoom = want;
      this.zoomInit = true;
    }
    this.zoom += (want - this.zoom) * (1 - Math.exp(-dt * 3));
    // A pan holds until the party moves: it sets off, or arrives somewhere new.
    if (this.manual && this.anchor(q) !== this.manualAnchor) this.manual = false;
    if (this.manual) this.clampCam(q);
    else {
      let tx: number;
      let ty: number;
      const standing = [...this.members.values()];
      const room = currentRoom(q);
      if (q.moving && standing.length) {
        tx = standing.reduce((a, m) => a + m.x, 0) / standing.length;
        ty = standing.reduce((a, m) => a + m.y, 0) / standing.length - FLOOR_Y + RH / 2;
      } else if (room) {
        const o = roomOrigin(room);
        tx = o.x + RW / 2;
        ty = o.y + RH / 2;
      } else {
        tx = this.cam.x;
        ty = this.cam.y;
      }
      const k = 1 - Math.exp(-dt * 5);
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
    }
    // Reduced motion: no screen shake (the hit flashes and numbers still show).
    this.shake = reducedMotion() ? 0 : Math.max(0, this.shake - dt * 30);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const cy = this.insets.top + (H - this.insets.top - this.insets.bottom) / 2;
    this.world.scale.set(this.zoom);
    this.world.position.set(W / 2 - this.cam.x * this.zoom + sx, cy - this.cam.y * this.zoom + sy);
    this.ringLayer.scale.copyFrom(this.world.scale);
    this.ringLayer.position.copyFrom(this.world.position);
  }

  // ---------------------------------------------------------------- static art

  private drawSky(): void {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const size = `${W}x${H}`;
    if (size === this.skySize) return;
    this.skySize = size;
    const g = this.sky;
    g.clear();
    // A bruised sky, lit sickly by the Glare.
    const bands = 20;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      g.rect(0, (H * i) / bands, W, H / bands + 1).fill(lerp(0x2b2140, shade(SKY_BOTTOM, -0.15), t));
    }
    const gx = W * 0.78;
    const gy = H * 0.16;
    for (let k = 6; k > 0; k--) g.circle(gx, gy, 18 + k * 16).fill({ color: 0xe8ffb0, alpha: 0.04 });
    g.circle(gx, gy, 22).fill(0xf6ffd8);
  }

  private rebuildStatics(q: Quest, key: string): void {
    this.staticKey = key;
    this.theme = themeFor(q.title, q.defId);
    const theme = this.theme;
    this.rooms.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.marks.removeChildren().forEach((c) => c.destroy({ children: true }));
    const earth = this.earth.clear();
    const links = this.links.clear();
    const fog = this.fog.clear();
    const byId = new Map(q.rooms.map((r) => [r.id, r]));
    const minF = Math.min(...q.rooms.map((r) => r.floor));
    const maxF = Math.max(...q.rooms.map((r) => r.floor));
    const minC = Math.min(...q.rooms.map((r) => r.col));
    const maxC = Math.max(...q.rooms.map((r) => r.col));
    const left = minC * (RW + GX) - 2400;
    const right = (maxC + 1) * (RW + GX) + 2400;
    const surface = minF * (RH + GY) - 70;
    // The horizon: far mesas, then the broken skyline of what the Glare left.
    const rnd = (k: number) => (strHash(`${q.defId}:${k}`) % 1000) / 1000;
    const far: number[] = [left, surface];
    for (let x = left; x <= right; x += 160) far.push(x, surface - 90 - rnd(x) * 120);
    far.push(right, surface);
    earth.poly(far).fill(0x4a3548);
    let x = left;
    let k = 0;
    while (x < right) {
      const bw = 60 + rnd(k * 3) * 110;
      const bh = 50 + rnd(k * 3 + 1) * 150;
      const top = surface - bh;
      // A jagged, bombed-out roofline.
      const pts = [x, surface, x, top + rnd(k * 5) * 20];
      for (let j = 1; j < 5; j++) pts.push(x + (bw * j) / 5, top + rnd(k * 7 + j) * 40);
      pts.push(x + bw, top + rnd(k * 11) * 30, x + bw, surface);
      earth.poly(pts).fill(0x2e2230);
      for (let wy = top + 30; wy < surface - 16; wy += 22) {
        for (let wx = x + 10; wx < x + bw - 14; wx += 18) if (rnd(wx * 13 + wy) > 0.45) earth.rect(wx, wy, 7, 10).fill(rnd(wx + wy) > 0.93 ? 0xf2c14e : 0x1b1420);
      }
      if (rnd(k * 17) > 0.7) {
        // A radio mast, leaning.
        earth.moveTo(x + bw / 2, top + 10).lineTo(x + bw / 2 + 14, top - 70).stroke({ width: 3, color: 0x2e2230 });
        earth.circle(x + bw / 2 + 14, top - 72, 3).fill(0xe4572e);
      }
      x += bw + 20 + rnd(k * 19) * 80;
      k++;
    }
    earth.rect(left, surface, right - left, 30).fill(0x8a6a45);
    for (let j = 0; j < 60; j++) {
      const mx = left + rnd(j * 23) * (right - left);
      earth.ellipse(mx, surface + 2, 20 + rnd(j * 29) * 40, 8 + rnd(j * 31) * 8).fill(0x7a5a38);
    }
    earth.rect(left, surface + 22, right - left, 8).fill(shade(0x8a6a45, -0.35));
    earth.rect(left, surface + 30, right - left, (maxF - minF + 3) * (RH + GY) + 2000).fill(theme.rock);
    for (let k = 0; k < 500; k++) {
      const x = left + (strHash(`x${k}`) % (right - left));
      const y = surface + 40 + (strHash(`y${k}`) % ((maxF - minF + 2) * (RH + GY) + 400));
      const s = 2 + (k % 5);
      earth.rect(x, y, s * 2, s).fill(shade(theme.rock, k % 3 ? 0.12 : -0.3));
    }

    const visited = (r: QuestRoom) => r.visited;
    const known = (r: QuestRoom) => r.visited || r.links.some((id) => byId.get(id)?.visited);
    // Passages first, so rooms sit over their ends.
    const drawn = new Set<string>();
    for (const a of q.rooms) {
      for (const id of a.links) {
        const b = byId.get(id);
        if (!b) continue;
        const k = [a.id, b.id].sort().join('>');
        if (drawn.has(k)) continue;
        drawn.add(k);
        if (!visited(a) && !visited(b)) continue;
        const A = roomOrigin(a);
        const B = roomOrigin(b);
        if (a.floor === b.floor) {
          const [l, r] = A.x < B.x ? [A, B] : [B, A];
          drawCorridor(links, l.x + RW - 6, r.x + 6, A.y, theme);
        } else if (a.col === b.col) {
          const [t, u] = A.y < B.y ? [A, B] : [B, A];
          drawLadder(links, t.x + LADDER_X, t.y + RH - 6, u.y + 6, theme);
        } else {
          const [p0, p1] = stairEnds(a, b);
          drawStairs(links, p0.x, p0.y, p1.x, p1.y, theme);
        }
      }
    }
    for (const room of q.rooms) {
      const o = roomOrigin(room);
      const g = new Graphics();
      const open = { left: false, right: false, up: false, down: false };
      for (const id of room.links) {
        const b = byId.get(id);
        if (!b) continue;
        if (b.floor === room.floor || b.col !== room.col) {
          if (b.col > room.col) open.right = true;
          else if (b.col < room.col) open.left = true;
        } else if (b.floor > room.floor) open.down = true;
        else open.up = true;
      }
      drawRuinRoom(g, room, theme, strHash(`${q.defId}:${room.id}`), open);
      g.position.set(o.x, o.y);
      this.rooms.addChild(g);
      if (!room.visited) {
        const isKnown = known(room);
        fog.rect(o.x - 2, o.y - 2, RW + 4, RH + 4).fill({ color: 0x07090a, alpha: isKnown ? 0.82 : 0.95 });
        if (isKnown) {
          const mark = new Text({ text: '?', style: { fontFamily: 'Bungee, sans-serif', fontSize: 54, fill: 0x6f7b7a } });
          mark.anchor.set(0.5);
          mark.alpha = 0.8;
          mark.position.set(o.x + RW / 2, o.y + RH / 2);
          this.marks.addChild(mark);
        }
      }
      if (room.objective && !room.visited) {
        // HALCY's waypoint: the objective is always marked.
        const fx = o.x + RW - 40;
        const fy = o.y + 24;
        const flag = new Graphics();
        flag.rect(fx, fy, 3, 40).fill(0xe9e1cc);
        flag.poly([fx + 3, fy, fx + 30, fy + 8, fx + 3, fy + 18]).fill(0xf2a541);
        flag.circle(fx + 12, fy + 9, 3).fill(0x14100d);
        this.marks.addChild(flag);
      }
    }
  }

  // ---------------------------------------------------------------- party

  private slotX(q: Quest, room: QuestRoom, i: number, n: number, fight: boolean): { x: number; y: number } {
    const o = roomOrigin(room);
    // Index 0 leads: frontmost in a fight, rightmost otherwise.
    const x = fight ? o.x + DEPTH_X + 30 + (n - 1 - i) * 46 : o.x + RW / 2 + ((n - 1) / 2 - i) * 62;
    void q;
    return { x, y: o.y + FLOOR_Y };
  }

  private syncMembers(q: Quest, dt: number): void {
    const { content } = this.game;
    const here = currentRoom(q);
    const onSite = q.status === 'onsite' || (q.status === 'returning' && q.outcome !== 'abandoned' && q.onsiteTime > 0);
    const keep = new Set<number>();
    if (here && onSite) {
      const fight = inCombat(q) || q.enemies.length > 0;
      const n = q.party.length;
      const walk = questContent(content).tuning.walkSeconds;
      const to = q.moving ? q.rooms.find((r) => r.id === q.moving?.to) : undefined;
      q.party.forEach((m, i) => {
        const res = this.resident(m.residentId);
        if (!res) return;
        keep.add(res.id);
        const sp = this.memberSprite(res);
        let target = this.slotX(q, here, i, n, fight);
        if (to && q.moving) {
          const p = Math.max(0, Math.min(1, 1 - q.moving.remaining / walk));
          const path = [this.slotX(q, here, i, n, false), ...walkPath(here, to), this.slotX(q, to, i, n, false)];
          target = along(path, p * 1.12 - (i * 0.08) / Math.max(1, n - 1 || 1));
        }
        const down = m.downed || res.dead;
        if (m.crit >= 1 && sp.crit < 1 && inCombat(q) && !down) this.float('CRIT READY', sp.x, sp.y - PARTY_H - 40, 0xffd23f, 13, 1.1);
        sp.crit = m.crit;
        const dx = target.x - sp.x;
        const dy = target.y - sp.y;
        const dist = Math.hypot(dx, dy);
        const speed = q.moving ? 420 : 180;
        if (dist > 0.5 && !down) {
          const step = Math.min(dist, speed * dt);
          sp.x += (dx / dist) * step;
          sp.y += (dy / dist) * step;
          if (Math.abs(dx) > 0.5) sp.facing = dx > 0 ? 1 : -1;
          sp.moving = dist > 1.5;
        } else {
          sp.moving = false;
          if (fight) sp.facing = 1;
        }
        if (sp.moving) sp.walk += dt;
        sp.lunge = Math.max(0, sp.lunge - dt * 6);
        sp.hurt = Math.max(0, sp.hurt - dt * 4);
        const shakeX = sp.hurt > 0 ? Math.sin(this.time * 80) * 2 * sp.hurt : 0;
        sp.root.position.set(sp.x + sp.facing * sp.lunge * 10 + shakeX, sp.y);
        sp.root.zIndex = 30 + i;
        sp.pose.scale.set(sp.facing * PARTY_SCALE, PARTY_SCALE);
        const flat = down && !sp.figure?.has('fallen');
        sp.pose.rotation = flat ? -Math.PI / 2 * sp.facing : sp.figure ? 0 : sp.moving ? Math.sin(sp.walk * 12) * 0.05 : 0;
        sp.pose.alpha = down ? 0.6 : 1;
        const action = down ? 'fallen' : sp.moving ? 'walk' : fight ? 'fight' : 'idle';
        if (action !== sp.action) {
          sp.action = action;
          // Fight art holds the weapon itself; redress to drop the overlay.
          if (sp.figure?.has('fight')) this.dress(sp, res);
        }
        sp.figure?.play(action, action === 'walk' ? sp.walk : this.time + i * 0.37);
        sp.root.tint = sp.hurt > 0.5 ? 0xff9a8a : 0xffffff;
        sp.name.position.set(0, down ? -30 : -PARTY_H - 30);
      });
    }
    for (const [id, sp] of this.members) {
      if (keep.has(id)) continue;
      sp.root.destroy({ children: true });
      this.members.delete(id);
    }
  }

  private memberSprite(res: Resident): MemberSprite {
    let sp = this.members.get(res.id);
    if (!sp) {
      const q = this.quest();
      const room = q ? currentRoom(q) : undefined;
      const start = room ? { x: roomOrigin(room).x + 40, y: roomOrigin(room).y + FLOOR_Y } : { x: 0, y: 0 };
      const root = new Container();
      const pose = new Container();
      const shadow = new Graphics().ellipse(0, 0, 11, 3).fill({ color: 0x000000, alpha: 0.35 });
      const body = new Graphics();
      pose.addChild(shadow, body);
      const name = new Text({ text: res.firstName, style: { fontFamily: 'Work Sans, sans-serif', fontWeight: '700', fontSize: 12, fill: 0xf4ecd8, stroke: { color: 0x14100d, width: 3 } } });
      name.anchor.set(0.5, 1);
      root.addChild(pose, name);
      this.actors.addChild(root);
      sp = { root, pose, body, figure: null, look: '', name, x: start.x, y: start.y, facing: 1, walk: 0, moving: false, lunge: 0, hurt: 0, crit: 0, action: 'idle' };
      this.members.set(res.id, sp);
    }
    const look = `${res.weapon ?? ''}|${res.outfit ?? ''}|${this.art ? 1 : 0}`;
    if (sp.look !== look) {
      sp.look = look;
      this.dress(sp, res);
    }
    return sp;
  }

  private dress(sp: MemberSprite, res: Resident): void {
    const character = this.art?.forResident(res);
    if (sp.figure && sp.figure.character !== character) {
      sp.figure.destroy();
      sp.figure = null;
    }
    if (character && !sp.figure) {
      sp.figure = new Figure(character, SPRITE_H);
      sp.pose.addChildAt(sp.figure, 1);
    }
    const { content } = this.game;
    sp.body.clear();
    if (sp.figure) {
      sp.figure.setTints(residentTints(res, content, false));
      drawOverlays(sp.body, res, content, !(sp.action === 'fight' && sp.figure.has('fight')));
    } else {
      drawResident(sp.body, res, content, false);
    }
    sp.pose.setChildIndex(sp.body, sp.pose.children.length - 1);
  }

  /** Screen-space-ish anchor above a member's head (world units). */
  private memberHead(id: number): { x: number; y: number } | null {
    const sp = this.members.get(id);
    return sp ? { x: sp.x, y: sp.y - PARTY_H } : null;
  }

  // ---------------------------------------------------------------- enemies

  private syncEnemies(q: Quest, dt: number): void {
    const { content } = this.game;
    const room = currentRoom(q);
    const live = new Set<number>();
    if (!q.enemies.length && ![...this.enemies.values()].some((e) => e.dead >= 0 && e.dead < 0.8)) this.slotCount = 0;
    for (const e of q.enemies) {
      live.add(e.uid);
      let sp = this.enemies.get(e.uid);
      if (!sp) {
        const def = safeEnemyDef(content, e.defId);
        const root = new Container();
        const g = new Graphics();
        root.addChild(g);
        this.actors.addChild(root);
        const wind = new Text({ text: '', style: { fontFamily: 'Bungee, sans-serif', fontSize: 14, fill: 0xffd23f, stroke: { color: 0x5a1208, width: 4 } } });
        wind.anchor.set(0.5, 1);
        wind.visible = false;
        this.labels.addChild(wind);
        let plate: Text | null = null;
        if (def.boss) {
          // A plaque at the boss's feet, clear of the telegraphs above.
          // M9: a boss whose guaranteed first-kill drop is still on offer says so.
          const firstKill = !!lootContent(content).bossFirstKill[e.defId] && !this.game.state.loot?.bossKills?.includes(e.defId);
          plate = new Text({ text: `${def.name.toUpperCase()}${firstKill ? '\nFIRST KILL DROP' : ''}`, style: { fontFamily: 'Bungee, sans-serif', fontSize: 11, fill: 0xf2a541, align: 'center', stroke: { color: 0x14100d, width: 4 } } });
          plate.anchor.set(0.5, 0);
          this.labels.addChild(plate);
        }
        const o = room ? roomOrigin(room) : { x: 0, y: 0 };
        sp = {
          uid: e.uid,
          def,
          root,
          g,
          wind,
          plate,
          slot: this.slotCount++,
          row: 0,
          x: o.x + RW + 30,
          y: o.y + FLOOR_Y,
          tx: 0,
          ty: 0,
          scale: def.boss ? 1.12 : 1,
          fit: def.boss ? 1.12 : 1,
          hurt: 0,
          lunge: 0,
          dead: -1,
          last: e,
          winding: null,
          interrupted: 0,
          fig: null,
          attackAt: -1,
        };
        this.enemies.set(e.uid, sp);
        // Summoned adds (and fresh spawns) arrive with a puff.
        if (this.time > 0.3) this.burst(sp.x - 30, sp.y - 20, 0x6a5a8a, 10, 90);
      }
      sp.last = e;
      if (e.hp <= 0 && sp.dead < 0) sp.dead = 0;
      this.detectLanding(q, sp, e);
    }
    // Enemies the sim has dropped (fight over): let the fallen fade out.
    for (const sp of this.enemies.values()) if (!live.has(sp.uid) && sp.dead < 0) sp.dead = 0;
    if (room) this.layoutEnemies(room);
    for (const [uid, sp] of this.enemies) {
      if (sp.dead >= 0) sp.dead += dt;
      // Creature art plays its death before fading out; drawn enemies just fade.
      const fade = sp.fig ? Math.max(0.4, sp.fig.duration('death')) : 0;
      if (sp.dead > 0.9 + fade) {
        sp.root.destroy({ children: true });
        sp.wind.destroy();
        sp.plate?.destroy();
        this.enemies.delete(uid);
        continue;
      }
      sp.x += (sp.tx - sp.x) * (1 - Math.exp(-dt * 6));
      sp.y += (sp.ty - sp.y) * (1 - Math.exp(-dt * 6));
      sp.hurt = Math.max(0, sp.hurt - dt * 4);
      sp.lunge = Math.max(0, sp.lunge - dt * 5);
      sp.interrupted = Math.max(0, sp.interrupted - dt);
      const e = sp.last;
      const ab = e.windup ? sp.def.abilities?.[e.windup.index] : undefined;
      const windup = e.windup && ab ? Math.max(0, Math.min(1, 1 - e.windup.remaining / Math.max(0.01, ab.windup))) : null;
      sp.g.clear();
      // Bespoke art for this enemy (art/raw/<enemyId>) wins over its shared look.
      const creature = this.art?.forLook(sp.def.id) ?? this.art?.forLook(sp.def.look);
      if (creature && !sp.fig) {
        sp.fig = new CreatureFigure(creature, lookSize(sp.def.look).h * CREATURE_H);
        sp.root.addChild(sp.fig);
      }
      if (sp.fig) {
        drawEnemyShadow(sp.g, sp.def.look);
        const since = this.time - sp.attackAt;
        if (sp.dead >= 0) sp.fig.play('death', sp.dead);
        // A wind-up holds the attack's raised pose, rising with the charge.
        else if (windup !== null) sp.fig.play('attack', 0, windup * 0.45);
        else if (sp.attackAt >= 0 && since < sp.fig.duration('attack')) sp.fig.play('attack', since);
        else sp.fig.play('idle', e.stunned > 0 ? 0 : this.time + sp.uid * 0.37);
      } else {
        drawEnemy(sp.g, sp.def.look, { t: this.time + sp.uid * 0.37, windup, stunned: e.stunned > 0, attack: sp.lunge });
      }
      const shakeX = (sp.hurt > 0 ? Math.sin(this.time * 90) * 3 * sp.hurt : 0) + (windup !== null ? Math.sin(this.time * 60) * (0.6 + windup * 1.6) : 0);
      const s = sp.fit;
      sp.root.position.set(sp.x + shakeX, sp.y);
      sp.root.scale.set(s);
      sp.root.zIndex = 10 - sp.row;
      if (sp.dead >= 0) {
        sp.root.alpha = Math.max(0, 1 - Math.max(0, sp.dead - fade) / 0.9);
        sp.root.rotation = sp.fig ? 0 : Math.min(1, sp.dead * 3) * 0.5;
      } else {
        sp.root.alpha = 1;
        sp.root.rotation = e.stunned > 0 ? Math.sin(this.time * 6) * 0.06 : 0;
      }
      sp.root.tint = sp.hurt > 0.5 ? 0xffc0b0 : e.enraged > 0 ? 0xff8f80 : 0xffffff;
    }
  }

  /**
   * Line the enemies up from the right wall toward the party. A crowded room
   * shrinks them a little, then overlaps them evenly in two staggered rows,
   * so nobody spills into the party's half of the room.
   */
  private layoutEnemies(room: QuestRoom): void {
    const o = roomOrigin(room);
    const right = o.x + RW - DEPTH_X - 14;
    const left = o.x + RW * 0.45;
    const zone = right - left;
    const gap = 10;
    const list = [...this.enemies.values()].sort((a, b) => a.slot - b.slot);
    if (!list.length) return;
    const base = list.map((sp) => lookSize(sp.def.look).w * sp.scale);
    const total = base.reduce((a, b) => a + b, 0) + gap * (list.length - 1);
    const shrink = total > zone ? Math.max(0.72, Math.sqrt(zone / total)) : 1;
    const ws = base.map((w) => w * shrink);
    const packed = ws.reduce((a, b) => a + b, 0) + gap * (list.length - 1);
    const k = packed > zone ? zone / packed : 1;
    let used = 0;
    list.forEach((sp, i) => {
      const w = ws[i]!;
      const row = k < 1 ? i % 2 : 0;
      sp.row = row;
      sp.fit = sp.scale * shrink * (1 - row * 0.06);
      sp.tx = right - (used + w / 2) * k;
      sp.ty = o.y + FLOOR_Y - row * 10;
      used += w + gap;
    });
  }

  /** A wind-up that ended without an interrupt has landed: show it. */
  private detectLanding(q: Quest, sp: EnemySprite, e: QuestEnemy): void {
    const now = e.windup ? e.windup.index : null;
    const was = sp.winding;
    sp.winding = now;
    if (was === null || now !== null || e.hp <= 0 || sp.interrupted > 0) return;
    const ab = sp.def.abilities?.[was];
    if (!ab) return;
    const size = lookSize(sp.def.look);
    const top = sp.y - size.h * sp.fit;
    sp.lunge = 1;
    sp.attackAt = this.time;
    switch (ab.effect) {
      case 'slam': {
        this.shake = 14;
        const room = currentRoom(q);
        const o = room ? roomOrigin(room) : { x: sp.x, y: sp.y };
        this.waves.push({ x: sp.x, y: sp.y, life: 0.6, max: 0.6, radius: RW * 0.9, color: 0xff7a1a, flat: true });
        this.burst(o.x + RW * 0.25, o.y + FLOOR_Y - 6, 0xc9a45a, 24, 200);
        break;
      }
      case 'heavy': {
        this.shake = 9;
        const t = e.target !== null ? this.memberHead(e.target) : null;
        if (t) this.burst(t.x, t.y + 20, 0xff5a3a, 18, 220);
        break;
      }
      case 'summon':
        this.float(ab.name.toUpperCase(), sp.x, top - 20, 0xc9a0ff, 18, 1.2);
        break;
      case 'enrage':
        this.float('ENRAGED!', sp.x, top - 20, 0xff5a3a, 20, 1.2);
        this.burst(sp.x, top + 10, 0xff5a3a, 16, 120);
        break;
      case 'heal':
        this.float('HEALED', sp.x, top - 20, 0x8fc93a, 18, 1.2);
        this.burst(sp.x, top + 10, 0x8fc93a, 16, 100);
        break;
    }
  }

  // ---------------------------------------------------------------- overlays

  private drawHighlight(q: Quest): void {
    const g = this.highlight.clear();
    this.doors = [];
    const here = currentRoom(q);
    if (!here || q.status !== 'onsite') return;
    const free = !q.moving && !inCombat(q) && !q.pendingEvent;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    const ho = roomOrigin(here);
    g.rect(ho.x - 3, ho.y - 3, RW + 6, RH + 6).stroke({ width: 3, color: 0xf2a541, alpha: 0.5 });
    if (!free) return;
    for (const id of here.links) {
      const r = q.rooms.find((x) => x.id === id);
      if (!r) continue;
      const o = roomOrigin(r);
      g.rect(o.x - 4, o.y - 4, RW + 8, RH + 8).stroke({ width: 4, color: 0x7fe0c0, alpha: 0.35 + pulse * 0.5 });
      // A chevron at the doorway in the current room, pointing the way.
      const dirX = Math.sign(r.col - here.col);
      const dirY = Math.sign(r.floor - here.floor);
      let cx = ho.x + RW / 2;
      let cy = ho.y + RH / 2;
      if (dirX !== 0) {
        cx = ho.x + (dirX > 0 ? RW - 30 : 30);
        cy = ho.y + FLOOR_Y - 60 + (dirY * 30);
      } else {
        cx = ho.x + LADDER_X;
        cy = dirY > 0 ? ho.y + RH - 34 : ho.y + 34;
      }
      this.doors.push({ roomId: r.id, x: cx, y: cy });
      const nudge = Math.sin(this.time * 5) * 4;
      chevron(g, cx + dirX * nudge, cy + (dirX === 0 ? dirY * nudge : 0), dirX, dirY, 0x7fe0c0, 0.6 + pulse * 0.4);
    }
  }

  private drawOverlay(q: Quest): void {
    const g = this.overlay.clear();
    const { content } = this.game;
    const fight = inCombat(q);
    // Party: rally glow, taunt aura, HP bars and crit rings.
    q.party.forEach((m) => {
      const res = this.resident(m.residentId);
      const sp = this.members.get(m.residentId);
      if (!res || !sp) return;
      const down = m.downed || res.dead;
      if (q.rally > 0 && !down) g.ellipse(sp.x, sp.y, 26, 7).fill({ color: 0xffd23f, alpha: 0.35 + 0.2 * Math.sin(this.time * 8) });
      if (m.taunt > 0 && !down) {
        g.ellipse(sp.x, sp.y - PARTY_H / 2, 30, PARTY_H * 0.62).stroke({ width: 3, color: 0xf2a541, alpha: 0.5 + 0.3 * Math.sin(this.time * 6) });
        shield(g, sp.x + 18, sp.y - PARTY_H - 4, 0xf2a541);
      }
      const bw = 36;
      const bx = sp.x - bw / 2 + 6;
      const by = down ? sp.y - 22 : sp.y - PARTY_H - 16;
      const max = Math.max(1, effectiveMaxHp(res));
      const frac = Math.max(0, Math.min(1, res.hp / max));
      g.roundRect(bx - 1, by - 1, bw + 2, 8, 3).fill(0x14100d);
      g.roundRect(bx, by, bw * frac, 6, 2).fill(frac > 0.5 ? 0x8fc93a : frac > 0.25 ? 0xf2c14e : 0xe4572e);
      // Crit meter ring, just left of the bar; full = pulsing gold.
      const rx = bx - 8;
      const ry = by + 3;
      g.circle(rx, ry, 7).fill({ color: 0x14100d, alpha: 0.75 }).stroke({ width: 1.5, color: 0xf2a541, alpha: 0.45 });
      if (m.crit >= 1 && fight && !down) {
        const p = 0.5 + 0.5 * Math.sin(this.time * 10);
        g.circle(rx, ry, 11 + p * 3).fill({ color: 0xffd23f, alpha: 0.25 + p * 0.25 });
        g.circle(rx, ry, 7).fill(0xffd23f);
        g.rect(rx - 1, ry - 4, 2, 5).fill(0x14100d);
        g.rect(rx - 1, ry + 2, 2, 2).fill(0x14100d);
      } else if (m.crit > 0) {
        g.moveTo(rx, ry).arc(rx, ry, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * m.crit).lineTo(rx, ry).fill(0xf2a541);
      }
      if (down) {
        g.roundRect(sp.x - 22, sp.y - 42, 44, 14, 4).fill({ color: 0x5a1208, alpha: 0.9 });
      }
      // Only touch the text when it changes: a restyle re-rasterises it.
      const label = down ? (res.dead ? 'FALLEN' : 'DOWN') : res.firstName;
      if (sp.name.text !== label) {
        sp.name.text = label;
        sp.name.style.fill = down ? 0xff8a7a : 0xf4ecd8;
      }
    });

    // Enemies: target reticle, HP bars, wind-up telegraphs, stun stars.
    const targets = new Set<number>();
    for (const m of q.party) {
      if (m.downed) continue;
      const t = effectiveTarget(q, m.target);
      if (t) targets.add(t.uid);
    }
    const explicit = new Set(q.party.filter((m) => m.target !== null).map((m) => m.target as number));
    for (const sp of this.enemies.values()) {
      const e = sp.last;
      const size = lookSize(sp.def.look);
      const s = sp.fit;
      const h = size.h * s;
      const w = size.w * s;
      const top = sp.y - h;
      sp.wind.visible = false;
      if (sp.plate) {
        sp.plate.visible = sp.dead < 0;
        sp.plate.position.set(sp.x, sp.y + 2);
      }
      if (sp.dead >= 0) continue;
      if (targets.has(sp.uid) && fight) reticle(g, sp.x, sp.y - h / 2, Math.max(w, 36) / 2 + 8, h / 2 + 8, explicit.has(sp.uid) ? 0xf2a541 : 0xf4ecd8, explicit.has(sp.uid) ? 0.95 : 0.35, this.time);
      const bw = Math.max(36, Math.min(sp.def.boss ? 120 : 56, w * 0.8));
      const bx = sp.x - bw / 2;
      const by = top - 12;
      const frac = Math.max(0, Math.min(1, e.hp / Math.max(1, e.maxHp)));
      g.roundRect(bx - 1, by - 1, bw + 2, 8, 3).fill(0x14100d);
      g.roundRect(bx, by, bw * frac, 6, 2).fill(e.enraged > 0 ? 0xff3b1f : 0xd9453a);
      if (e.stunned > 0) {
        for (let k = 0; k < 3; k++) {
          const a = this.time * 5 + (k * Math.PI * 2) / 3;
          g.star(sp.x + Math.cos(a) * 14, top - 20 + Math.sin(a) * 4, 5, 4, 2).fill(0xffd23f);
        }
      }
      if (sp.interrupted > 0) continue;
      const ab = e.windup ? sp.def.abilities?.[e.windup.index] : undefined;
      if (!e.windup || !ab) continue;
      // The telegraph: a big bar filling toward release, the ability's name,
      // a warning glyph, and a marker on what it will hit.
      const p = Math.max(0, Math.min(1, 1 - e.windup.remaining / Math.max(0.01, ab.windup)));
      const flash = 0.5 + 0.5 * Math.sin(this.time * (10 + p * 20));
      const tw = Math.max(64, Math.min(sp.def.boss ? 130 : 84, w + 10));
      // Keep the telegraph inside the room, so it never runs off a phone screen.
      const here = currentRoom(q);
      const ro = here ? roomOrigin(here) : { x: sp.x - RW, y: 0 };
      const tx = Math.max(ro.x + 8, Math.min(ro.x + RW - 8 - tw, sp.x - tw / 2));
      // Neighbours winding up at once stack their telegraphs instead of overlapping.
      const stagger = [...this.enemies.values()].some((o) => o !== sp && o.dead < 0 && o.last.windup && Math.abs(o.x - sp.x) < (tw + 20) && o.slot < sp.slot) ? 34 : 0;
      const ty = by - (sp.def.boss ? 36 : 22) - stagger;
      g.ellipse(sp.x, sp.y, w * 0.7, 9).fill({ color: 0xff3b1f, alpha: 0.2 + flash * 0.3 });
      g.roundRect(tx - 3, ty - 3, tw + 6, 14, 5).fill({ color: 0xff3b1f, alpha: 0.35 + flash * 0.5 });
      g.roundRect(tx, ty, tw, 8, 3).fill(0x14100d);
      g.roundRect(tx, ty, tw * p, 8, 3).fill(lerp(0xffd23f, 0xff3b1f, p));
      warning(g, tx - 14, ty + 4, 11, flash);
      sp.wind.visible = true;
      const wname = ab.name.toUpperCase();
      if (sp.wind.text !== wname) sp.wind.text = wname;
      const half = sp.wind.width / 2;
      sp.wind.position.set(Math.max(ro.x + 4 + half, Math.min(ro.x + RW - 4 - half, sp.x)), ty - 4);
      sp.wind.scale.set(1 + flash * 0.06);
      const room = currentRoom(q);
      if (ab.effect === 'slam' && room) {
        const o = roomOrigin(room);
        g.rect(o.x + DEPTH_X, o.y + FLOOR_Y - 8, RW * 0.44, 12).fill({ color: 0xff3b1f, alpha: 0.18 + flash * 0.3 });
      } else if (ab.effect === 'heavy') {
        const t = e.target !== null ? this.members.get(e.target) : undefined;
        if (t) reticle(g, t.x, t.y - PARTY_H / 2, 24, PARTY_H / 2 + 6, 0xff3b1f, 0.5 + flash * 0.5, this.time * 2);
      } else if (ab.effect === 'summon' && room) {
        const o = roomOrigin(room);
        for (let k = 0; k < (ab.adds?.length ?? 1); k++) {
          const cx = o.x + RW * 0.55 + k * 40;
          g.ellipse(cx, o.y + FLOOR_Y, 16 + flash * 4, 5).fill({ color: 0x9a6aff, alpha: 0.3 + flash * 0.4 });
        }
      }
    }
    void content;
  }

  // ---------------------------------------------------------------- effects

  private onEvents(events: GameEvent[]): void {
    const q = this.quest();
    if (!q) return;
    for (const ev of events) {
      if (!('questId' in ev) || ev.questId !== q.id) continue;
      switch (ev.type) {
        case 'questHit':
          this.onHit(q, ev);
          break;
        case 'questWindup': {
          const sp = this.enemies.get(ev.enemyUid);
          if (sp) {
            const size = lookSize(sp.def.look);
            this.float('!', sp.x + 20, sp.y - size.h * sp.fit - 30, 0xff3b1f, 34, 0.7);
          }
          break;
        }
        case 'questInterrupted': {
          const sp = this.enemies.get(ev.enemyUid);
          if (sp) {
            sp.interrupted = 0.8;
            sp.winding = null;
            const size = lookSize(sp.def.look);
            const top = sp.y - size.h * sp.fit;
            this.float('INTERRUPTED!', sp.x, top - 30, 0x7fe0c0, 22, 1.3);
            this.burst(sp.x, top + 10, 0x7fe0c0, 20, 200);
            this.shake = 8;
          }
          break;
        }
        case 'questEnemyDown': {
          const sp = this.enemies.get(ev.enemyUid);
          if (sp) {
            sp.dead = Math.max(0, sp.dead);
            this.burst(sp.x, sp.y - 20, 0xb9b19c, 14, 140);
          }
          break;
        }
        case 'questMemberDown': {
          const h = this.memberHead(ev.residentId);
          if (h) this.float('DOWN!', h.x, h.y - 10, 0xff5a3a, 20, 1.2);
          break;
        }
        case 'questAbility':
          this.onAbility(q, ev.residentId, ev.ability);
          break;
        case 'questCombat': {
          const room = currentRoom(q);
          if (room) {
            const o = roomOrigin(room);
            this.float('FIGHT!', o.x + RW / 2, o.y + 60, 0xe4572e, 30, 1.1);
          }
          this.shake = 6;
          break;
        }
        case 'questRoomCleared': {
          const room = q.rooms.find((r) => r.id === ev.roomId);
          if (room && (room.kind === 'fight' || room.kind === 'boss')) {
            const o = roomOrigin(room);
            this.float(room.objective ? 'OBJECTIVE CLEARED!' : 'ROOM CLEARED', o.x + RW / 2, o.y + 70, 0x8fc93a, room.objective ? 26 : 22, 1.6);
          }
          break;
        }
        case 'questLoot': {
          const room = currentRoom(q);
          if (room) {
            const o = roomOrigin(room);
            this.float(`+ ${ev.text}`, o.x + RW / 2, o.y + 100, 0xf2c14e, 16, 2.2);
            this.burst(o.x + RW * 0.62, o.y + FLOOR_Y - 20, 0xf2c14e, 16, 160);
          }
          break;
        }
      }
    }
  }

  private onHit(q: Quest, ev: Extract<GameEvent, { type: 'questHit' }>): void {
    if (ev.from === 'party') {
      const sp = this.enemies.get(ev.target);
      const m = this.members.get(ev.source);
      const res = this.resident(ev.source);
      if (!sp) return;
      const size = lookSize(sp.def.look);
      const cx = sp.x;
      const cy = sp.y - (size.h * sp.fit) / 2;
      sp.hurt = 1;
      if (m) {
        m.lunge = 1;
        if (res?.weapon) this.tracers.push({ x0: m.x + m.facing * 18, y0: m.y - PARTY_H * 0.55, x1: cx, y1: cy, life: 0.09, color: ev.crit ? 0xffd23f : 0xffe3a3, width: ev.crit ? 4 : 2 });
      }
      const jitter = (Math.random() - 0.5) * 20;
      if (ev.crit) {
        this.float(`${hitText(ev.amount)}!`, cx + jitter, cy - 30, 0xffd23f, 30, 1.2);
        this.burst(cx, cy, 0xffd23f, 18, 240);
        this.shake = Math.max(this.shake, 10);
      } else {
        this.float(hitText(ev.amount), cx + jitter, cy - 24, 0xf4ecd8, 17, 0.9);
        this.burst(cx, cy, 0xffe3a3, 5, 120);
      }
    } else {
      const m = this.members.get(ev.target);
      const sp = this.enemies.get(ev.source);
      if (sp) {
        sp.lunge = 1;
        sp.attackAt = this.time;
      }
      if (!m) return;
      m.hurt = 1;
      const jitter = (Math.random() - 0.5) * 16;
      this.float(`-${hitText(ev.amount)}`, m.x + jitter, m.y - PARTY_H * 0.55, 0xff6a5a, 17, 0.9);
      this.burst(m.x, m.y - PARTY_H * 0.5, 0xff5a3a, 5, 110);
    }
    void q;
  }

  private onAbility(q: Quest, residentId: number, ability: string): void {
    const def = Object.values(questContent(this.game.content).abilities).find((a) => a.id === ability);
    const head = this.memberHead(residentId);
    if (!head) return;
    this.float(def?.name.toUpperCase() ?? ability.toUpperCase(), head.x, head.y - 40, 0x7fe0c0, 18, 1.3);
    const room = currentRoom(q);
    const o = room ? roomOrigin(room) : { x: head.x, y: head.y };
    const m = q.party.find((x) => x.residentId === residentId);
    const target = effectiveTarget(q, m?.target ?? null);
    const tsp = target ? this.enemies.get(target.uid) : undefined;
    switch (def?.stat) {
      case 'brawn':
        if (tsp) {
          this.burst(tsp.x, tsp.y - 30, 0xf2a541, 24, 260);
          this.waves.push({ x: tsp.x, y: tsp.y - 30, life: 0.35, max: 0.35, radius: 60, color: 0xf2a541, flat: false });
        }
        this.shake = 12;
        break;
      case 'sight':
        if (tsp) this.tracers.push({ x0: head.x + 18, y0: head.y + 26, x1: tsp.x, y1: tsp.y - 30, life: 0.2, color: 0x7fe0c0, width: 5 });
        this.shake = 6;
        break;
      case 'grit':
        this.waves.push({ x: head.x, y: head.y + 32, life: 0.5, max: 0.5, radius: 70, color: 0xf2a541, flat: false });
        break;
      case 'charm':
        for (const sp of this.members.values()) this.burst(sp.x, sp.y - PARTY_H, 0xffd23f, 8, 90);
        break;
      case 'wits':
        for (const sp of this.members.values()) this.burst(sp.x, sp.y - PARTY_H / 2, 0x8fc93a, 10, 80, -60);
        break;
      case 'knack':
        for (const sp of this.enemies.values()) {
          if (sp.dead >= 0) continue;
          this.waves.push({ x: sp.x, y: sp.y - 20, life: 0.45, max: 0.45, radius: 50, color: 0xff7a1a, flat: false });
          this.burst(sp.x, sp.y - 20, 0xff7a1a, 16, 220);
        }
        this.shake = 14;
        break;
      case 'fortune':
        for (const sp of this.members.values()) this.burst(sp.x, sp.y - PARTY_H, 0x8fc93a, 10, 100);
        break;
    }
    void o;
  }

  private float(text: string, x: number, y: number, color: number, size: number, life: number): void {
    const t = new Text({ text, style: { fontFamily: 'Bungee, sans-serif', fontSize: size, fill: color, stroke: { color: 0x14100d, width: Math.max(3, size / 5) } } });
    t.anchor.set(0.5);
    // Numbers landing on the same spot in quick succession stack upwards and fan out, instead of overprinting.
    let n = 0;
    for (const f of this.floats) if (f.max - f.life < 0.5 && Math.abs(f.x - x) < 46 && Math.abs(f.y - y) < 36) n++;
    const lift = Math.min(n, 4);
    t.position.set(x + (n % 2 ? 1 : -1) * lift * 7, y - lift * (size * 0.8 + 4));
    this.floatLayer.addChild(t);
    this.floats.push({ text: t, life, max: life, vy: -40, x, y });
    // Keep the scene readable in a big fight.
    while (this.floats.length > 28) this.floats.shift()?.text.destroy();
  }

  private burst(x: number, y: number, color: number, n: number, speed: number, gravity = 300): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: 0.5 + Math.random() * 0.3, max: 0.8, color, size: 2 + Math.random() * 3, gravity });
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  private updateFloats(dt: number): void {
    for (const f of this.floats) {
      f.life -= dt;
      f.text.y += f.vy * dt;
      f.vy *= 0.96;
      const age = f.max - f.life;
      f.text.alpha = Math.max(0, Math.min(1, f.life / 0.35));
      f.text.scale.set(age < 0.12 ? 0.6 + (age / 0.12) * 0.55 : Math.max(1, 1.15 - (age - 0.12) * 1.2));
    }
    for (const f of this.floats.filter((x) => x.life <= 0)) f.text.destroy();
    this.floats = this.floats.filter((f) => f.life > 0);
  }

  private drawFx(dt: number): void {
    const g = this.fx.clear();
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life > 0) g.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size).fill({ color: p.color, alpha: Math.min(1, p.life / 0.3) });
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const w of this.waves) {
      w.life -= dt;
      const t = 1 - w.life / w.max;
      if (w.life <= 0) continue;
      if (w.flat) g.ellipse(w.x - (w.radius * t) / 2, w.y, w.radius * t, 10 + t * 8).stroke({ width: 6 * (1 - t) + 1, color: w.color, alpha: 1 - t });
      else g.circle(w.x, w.y, w.radius * t).stroke({ width: 5 * (1 - t) + 1, color: w.color, alpha: 1 - t });
    }
    this.waves = this.waves.filter((w) => w.life > 0);
    for (const tr of this.tracers) {
      tr.life -= dt;
      if (tr.life <= 0) continue;
      g.moveTo(tr.x0, tr.y0).lineTo(tr.x1, tr.y1).stroke({ width: tr.width, color: tr.color, alpha: 0.9 });
      g.circle(tr.x0, tr.y0, tr.width * 1.6).fill({ color: 0xffe3a3, alpha: 0.8 });
    }
    this.tracers = this.tracers.filter((t) => t.life > 0);
  }

  private drawRing(q: Quest): void {
    const g = this.ringG.clear();
    const dim = this.dim.clear();
    const ring = this.ring;
    this.ringText.visible = false;
    if (!ring) return;
    const m = q.party.find((x) => x.residentId === ring.residentId);
    if (!inCombat(q) || !m || m.downed || m.crit < 1) {
      this.cancelRing();
      return;
    }
    const elapsed = (performance.now() - ring.start) / 1000;
    if (ring.age * ring.speed > RING_TIMEOUT_SWEEPS) {
      this.cancelRing();
      return;
    }
    dim.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({ color: 0x000000, alpha: 0.32 });
    const z = this.zoom;
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    // Keep the whole ring on screen, even over an enemy at the room's edge on a phone.
    const rmax = Math.min(RING_MAX, W * 0.3);
    const scr = this.world.toGlobal(this.ringCentre(ring.residentId));
    scr.x = Math.max(rmax + 8, Math.min(W - rmax - 8, scr.x));
    scr.y = Math.max(this.insets.top + rmax + 8, Math.min(H - this.insets.bottom - rmax - 34, scr.y));
    const at = this.world.toLocal(scr);
    this.ringAt = { x: at.x, y: at.y };
    const phase = (elapsed * ring.speed) % 1;
    const radius = (p: number) => (rmax - (rmax - RING_MIN) * p) / z;
    const sweet = radius(RING_SWEET);
    const goodIn = radius(Math.min(1, RING_SWEET + 0.15));
    const goodOut = radius(RING_SWEET - 0.15);
    const perfIn = radius(RING_SWEET + RING_PERFECT + 0.012);
    const perfOut = radius(RING_SWEET - RING_PERFECT - 0.012);
    // Target bands: a wide "good" annulus and a bright "perfect" one.
    g.circle(at.x, at.y, (goodOut + goodIn) / 2).stroke({ width: goodOut - goodIn, color: 0xf2a541, alpha: 0.18 });
    g.circle(at.x, at.y, (perfOut + perfIn) / 2).stroke({ width: Math.max(2 / z, perfOut - perfIn), color: 0xffd23f, alpha: 0.9 });
    g.circle(at.x, at.y, sweet).stroke({ width: 1 / z, color: 0xffffff, alpha: 0.8 });
    // The shrinking ring: white, turning gold inside the good band.
    const r = radius(phase);
    const off = Math.abs(phase - RING_SWEET);
    const hot = off < 0.15;
    g.circle(at.x, at.y, r).stroke({ width: (hot ? 6 : 4) / z, color: hot ? 0xffd23f : 0xf4ecd8, alpha: 0.95 });
    g.circle(at.x, at.y, 3 / z).fill(0xf4ecd8);
    const res = this.resident(ring.residentId);
    this.ringText.visible = true;
    const label = `${res?.firstName ?? ''}: TAP ON GOLD!`;
    if (this.ringText.text !== label) this.ringText.text = label;
    this.ringText.scale.set(1 / z);
    this.ringText.position.set(at.x, at.y + (rmax + 20) / z);
  }
}

// ------------------------------------------------------------------ helpers

function safeEnemyDef(content: Game['content'], id: string): EnemyDef {
  try {
    return enemyDef(content, id);
  } catch {
    return { id, name: id, look: 'unknown', hp: 1, damage: [1, 1], interval: 1, xp: 0 };
  }
}

/** The enemy a member hits: their pick if it still stands, else the first standing one. */
function effectiveTarget(q: Quest, target: number | null): QuestEnemy | undefined {
  const alive = q.enemies.filter((e) => e.hp > 0);
  return alive.find((e) => e.uid === target) ?? alive[0];
}

function stairEnds(a: QuestRoom, b: QuestRoom): [{ x: number; y: number }, { x: number; y: number }] {
  const A = roomOrigin(a);
  const B = roomOrigin(b);
  const dir = Math.sign(b.col - a.col);
  return [
    { x: A.x + (dir > 0 ? RW - 4 : 4), y: A.y + FLOOR_Y - 8 },
    { x: B.x + (dir > 0 ? 4 : RW - 4), y: B.y + FLOOR_Y - 8 },
  ];
}

/** Waypoints between two linked rooms (doorways, ladders or stairs). */
function walkPath(a: QuestRoom, b: QuestRoom): { x: number; y: number }[] {
  const A = roomOrigin(a);
  const B = roomOrigin(b);
  if (a.floor !== b.floor && a.col === b.col) return [{ x: A.x + LADDER_X, y: A.y + FLOOR_Y }, { x: B.x + LADDER_X, y: B.y + FLOOR_Y }];
  const dir = Math.sign(b.col - a.col) || 1;
  return [
    { x: A.x + (dir > 0 ? RW - 24 : 24), y: A.y + FLOOR_Y },
    { x: B.x + (dir > 0 ? 24 : RW - 24), y: B.y + FLOOR_Y },
  ];
}

/** Point at fraction t (0..1) along a polyline. */
function along(path: { x: number; y: number }[], t: number): { x: number; y: number } {
  const c = Math.max(0, Math.min(1, t));
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
    lens.push(l);
    total += l;
  }
  let d = c * total;
  for (let i = 1; i < path.length; i++) {
    const l = lens[i - 1]!;
    if (d <= l || i === path.length - 1) {
      const k = l > 0 ? Math.min(1, d / l) : 1;
      return { x: path[i - 1]!.x + (path[i]!.x - path[i - 1]!.x) * k, y: path[i - 1]!.y + (path[i]!.y - path[i - 1]!.y) * k };
    }
    d -= l;
  }
  return path[path.length - 1]!;
}

function lerp(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

function chevron(g: Graphics, x: number, y: number, dx: number, dy: number, color: number, alpha: number): void {
  const a = dx !== 0 ? (dx > 0 ? 0 : Math.PI) : dy > 0 ? Math.PI / 2 : -Math.PI / 2;
  for (let k = 0; k < 2; k++) {
    const ox = x + Math.cos(a) * k * 12;
    const oy = y + Math.sin(a) * k * 12;
    const p = (ang: number, r: number) => [ox + Math.cos(a + ang) * r, oy + Math.sin(a + ang) * r];
    g.poly([...p(0, 12), ...p(2.4, 12), ...p(Math.PI, 4), ...p(-2.4, 12)]).fill({ color, alpha: alpha * (k ? 0.6 : 1) });
  }
}

function reticle(g: Graphics, x: number, y: number, rw: number, rh: number, color: number, alpha: number, t: number): void {
  const k = 1 + Math.sin(t * 6) * 0.04;
  const w = rw * k;
  const h = rh * k;
  const l = 10;
  const s = { width: 3, color, alpha };
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const cx = x + sx * w;
    const cy = y + sy * h;
    g.moveTo(cx - sx * l, cy).lineTo(cx, cy).lineTo(cx, cy - sy * l).stroke(s);
  }
}

function warning(g: Graphics, x: number, y: number, r: number, flash: number): void {
  g.poly([x, y - r, x + r, y + r * 0.8, x - r, y + r * 0.8]).fill(flash > 0.5 ? 0xffd23f : 0xff3b1f);
  g.rect(x - 1.5, y - r * 0.4, 3, r * 0.7).fill(0x14100d);
  g.rect(x - 1.5, y + r * 0.4, 3, 3).fill(0x14100d);
}

function shield(g: Graphics, x: number, y: number, color: number): void {
  g.poly([x - 8, y - 9, x + 8, y - 9, x + 8, y, x, y + 9, x - 8, y]).fill(color);
  g.poly([x - 4, y - 5, x + 4, y - 5, x + 4, y, x, y + 4, x - 4, y]).fill(0x14100d);
}

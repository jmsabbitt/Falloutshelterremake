// The homestead cross-section. Rooms are drawn as 2.5D cutaway boxes: a back
// wall, receding ceiling/floor/side planes, and props, so the view reads as
// depth rather than flat tiles. Static art is rebuilt only when the layout
// changes; overlays and residents are updated every frame.

import { Application, Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js';
import {
  buildCost,
  canPlace,
  poolSize,
  roomCells,
  roomDef,
  type GameEvent,
  type Resident,
  type Room,
} from '../../sim';
import type { Game } from '../game';
import {
  FRAME,
  GROUND,
  LAMP,
  RESOURCE_COLORS,
  ROCK,
  ROCK_DARK,
  ROCK_SPECK,
  SKY_BOTTOM,
  SKY_TOP,
  roomLook,
  shade,
} from './palette';

export const CELL = 44;
export const FLOOR_H = 132;
export const SURFACE_H = 300;
const DEPTH_X = 16; // horizontal inset of the back wall (perspective)
const DEPTH_Y = 12; // vertical inset of the back wall
const MARGIN_CELLS = 4;
const RESIDENT_H = 46;

export interface ViewCallbacks {
  onRoomTap(room: Room): void;
  onEmptyTap(): void;
  onResidentDrop(residentId: number, room: Room | null): void;
  onResidentTap(resident: Resident): void;
  onBuildAt(floor: number, x: number): void;
}

interface ResidentSprite {
  root: Container;
  body: Graphics;
  x: number;
  targetX: number;
  roomId: number | null | 'waiting';
  phase: number;
  facing: 1 | -1;
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
  private fxLayer = new Container();

  private builtLayout = -1;
  private sprites = new Map<number, ResidentSprite>();
  private floats: FloatText[] = [];
  private time = 0;

  buildMode: string | null = null;
  selectedRoomId: number | null = null;
  selectedResidentId: number | null = null;

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
    this.world.addChild(this.bg, this.statics, this.overlay, this.ghostLayer, this.residentLayer, this.fxLayer);
    app.stage.addChild(this.world);
    this.drawBackground();
    this.installInput();
    this.centerOn(window.innerWidth < 640 ? 6 * CELL : 9 * CELL, SURFACE_H + FLOOR_H * 0.8);
    game.on((events) => this.onEvents(events));
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
    const { floors, cellsPerFloor } = this.game.content.balance.grid;
    return { w: cellsPerFloor * CELL, h: SURFACE_H + floors * FLOOR_H };
  }

  roomAt(wx: number, wy: number): Room | null {
    const floor = Math.floor((wy - SURFACE_H) / FLOOR_H);
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

  private clampCamera(): void {
    const { w, h } = this.worldSize();
    const m = MARGIN_CELLS * CELL * this.zoom;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const minX = sw - (w * this.zoom + m);
    const maxX = m;
    const minY = sh - (h * this.zoom + 160);
    const maxY = 80;
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
    const { w, h } = this.worldSize();
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
  }

  private rebuildStatics(): void {
    this.statics.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const room of this.game.state.rooms) {
      const r = this.roomRect(room);
      const g = new Graphics();
      drawRoomBox(g, room.type, r.w, r.h, room.level, room.segments);
      g.position.set(r.x, r.y);
      this.statics.addChild(g);
      const def = roomDef(this.game.content, room);
      if (room.type !== 'elevator') {
        const name = def.levelNames?.[room.level - 1] ?? def.name;
        const label = new Text({
          text: name.toUpperCase(),
          style: { fontFamily: 'Bungee, sans-serif', fontSize: 11, fill: 0x1b1b1b, letterSpacing: 1 },
        });
        label.alpha = 0.7;
        label.position.set(r.x + DEPTH_X + 6, r.y + DEPTH_Y + 4);
        this.statics.addChild(label);
      }
    }
    this.builtLayout = this.game.layoutVersion;
    this.rebuildGhosts();
  }

  rebuildGhosts(): void {
    this.ghostLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const type = this.buildMode;
    if (!type) return;
    const { content, state } = this.game;
    const def = content.rooms[type];
    if (!def) return;
    const seen = new Set<string>();
    const candidates: { floor: number; x: number }[] = [];
    const push = (floor: number, x: number) => {
      const k = `${floor}:${x}`;
      if (seen.has(k)) return;
      seen.add(k);
      if (canPlace(state, content, type, floor, x).ok) candidates.push({ floor, x });
    };
    for (const room of state.rooms) {
      const w = roomCells(content, room);
      push(room.floor, room.x + w);
      push(room.floor, room.x - def.cells);
      if (type === 'elevator' && room.type === 'elevator') {
        push(room.floor + 1, room.x);
        push(room.floor - 1, room.x);
      }
    }
    const cost = buildCost(state, content, type);
    const affordable = state.scrip >= cost;
    for (const c of candidates) {
      const x = c.x * CELL;
      const y = SURFACE_H + c.floor * FLOOR_H;
      const w = def.cells * CELL;
      const g = new Graphics();
      g.rect(x + 3, y + 3, w - 6, FLOOR_H - 6).fill({ color: affordable ? 0x8fc93a : 0xe4572e, alpha: 0.18 });
      g.rect(x + 3, y + 3, w - 6, FLOOR_H - 6).stroke({ width: 3, color: affordable ? 0x8fc93a : 0xe4572e, alpha: 0.9 });
      const cx = x + w / 2;
      const cy = y + FLOOR_H / 2;
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
    if (this.builtLayout !== this.game.layoutVersion) this.rebuildStatics();
    this.drawOverlay();
    this.updateResidents(dt);
    this.updateFloats(dt);
  }

  private drawOverlay(): void {
    const g = this.overlay;
    g.clear();
    const { state, content } = this.game;
    const burning = new Map(state.incidents.map((i) => [i.roomId, i]));
    for (const room of state.rooms) {
      const r = this.roomRect(room);
      const def = roomDef(content, room);
      // interior lamp glow / brownout
      if (!room.powered) {
        g.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 4).fill({ color: 0x000000, alpha: 0.55 });
      } else if (room.type !== 'elevator') {
        const flicker = 0.1 + 0.03 * Math.sin(this.time * 3 + room.id);
        g.rect(r.x + DEPTH_X, r.y + DEPTH_Y + 2, r.w - DEPTH_X * 2, 10).fill({ color: LAMP, alpha: flicker });
      }
      // production progress along the floor lip
      if (def.produces && !room.ready) {
        const p = Math.min(1, room.pool / Math.max(1, poolSize(content, room)));
        g.rect(r.x + 6, r.y + r.h - 7, (r.w - 12) * p, 3).fill({ color: RESOURCE_COLORS[def.produces.resource] ?? 0xffffff, alpha: 0.9 });
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
      // fire
      const inc = burning.get(room.id);
      if (inc) {
        for (let i = 0; i < Math.ceil(r.w / 22); i++) {
          const fx = r.x + 10 + i * 22 + Math.sin(this.time * 9 + i) * 3;
          const fh = 26 + Math.sin(this.time * 13 + i * 1.7) * 9;
          g.poly([fx - 9, r.y + r.h - 10, fx, r.y + r.h - 10 - fh, fx + 9, r.y + r.h - 10]).fill({ color: 0xff7a1a, alpha: 0.85 });
          g.poly([fx - 5, r.y + r.h - 10, fx, r.y + r.h - 10 - fh * 0.6, fx + 5, r.y + r.h - 10]).fill({ color: 0xffd23f, alpha: 0.9 });
        }
        g.rect(r.x + 10, r.y + 8, r.w - 20, 6).fill(0x14100d);
        g.rect(r.x + 10, r.y + 8, (r.w - 20) * Math.max(0, inc.hp / inc.maxHp), 6).fill(0xff7a1a);
      }
      if (room.id === this.selectedRoomId) {
        const pulse = 0.6 + 0.4 * Math.sin(this.time * 5);
        g.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).stroke({ width: 3, color: 0xf2a541, alpha: pulse });
      }
    }
  }

  private updateResidents(dt: number): void {
    const { state } = this.game;
    const alive = new Set<number>();
    const waitingList = state.residents.filter((r) => r.waiting);
    for (const res of state.residents) {
      alive.add(res.id);
      let sp = this.sprites.get(res.id);
      if (!sp) {
        sp = this.createSprite(res);
        this.sprites.set(res.id, sp);
      }
      const where: number | null | 'waiting' = res.waiting ? 'waiting' : res.roomId;
      const bounds = this.residentBounds(res, waitingList.indexOf(res));
      if (sp.roomId !== where) {
        sp.roomId = where;
        sp.x = bounds.min + (hash(res.id) % 1000) / 1000 * (bounds.max - bounds.min);
        sp.targetX = sp.x;
      }
      if (this.gesture.kind === 'drag' && this.gesture.residentId === res.id) continue;
      // wander
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
      }
      sp.x = Math.min(bounds.max, Math.max(bounds.min, sp.x));
      sp.root.position.set(sp.x, bounds.y);
      sp.root.scale.x = sp.facing;
      sp.body.rotation = res.dead ? -Math.PI / 2 : Math.sin(sp.phase) * 0.04;
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

  private residentBounds(res: Resident, waitingIndex: number) {
    const { state } = this.game;
    if (res.waiting) {
      const door = state.rooms.find((r) => r.type === 'door');
      const base = door ? this.roomRect(door).x + 20 : 20;
      const x = base + waitingIndex * 30;
      return { min: x, max: x, y: SURFACE_H - 40 };
    }
    const room = res.roomId !== null ? state.rooms.find((r) => r.id === res.roomId) : undefined;
    const target = room ?? state.rooms.find((r) => r.type === 'door');
    if (!target) return { min: 0, max: 0, y: SURFACE_H };
    const r = this.roomRect(target);
    return { min: r.x + DEPTH_X + 12, max: r.x + r.w - DEPTH_X - 12, y: r.y + r.h - DEPTH_Y / 2 - 4 };
  }

  private createSprite(res: Resident): ResidentSprite {
    const root = new Container();
    const halo = new Graphics();
    halo.ellipse(0, 0, 18, 6).fill({ color: 0xf2a541, alpha: 0.8 });
    halo.visible = false;
    root.addChild(halo);
    const body = new Graphics();
    drawResident(body, res);
    root.addChild(body);
    root.eventMode = 'static';
    root.cursor = 'grab';
    root.hitArea = { contains: (x: number, y: number) => x > -14 && x < 14 && y > -RESIDENT_H && y < 4 };
    root.on('pointerdown', (e: FederatedPointerEvent) => {
      if (res.dead) return;
      e.stopPropagation();
      this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
      this.gesture = { kind: 'drag', startX: e.global.x, startY: e.global.y, t: performance.now(), moved: false, residentId: res.id };
    });
    this.residentLayer.addChild(root);
    return { root, body, x: 0, targetX: 0, roomId: -999, phase: hash(res.id) % 10, facing: 1 };
  }

  // ---------------------------------------------------------------- input

  private installInput(): void {
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;

    stage.on('pointerdown', (e: FederatedPointerEvent) => {
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
      const g = this.gesture;
      if (this.pointers.size > 0 && g.kind === 'pinch') return;
      const local = this.world.toLocal(e.global);
      if (g.kind === 'drag' && g.residentId !== undefined) {
        const res = this.game.state.residents.find((r) => r.id === g.residentId);
        if (res) {
          if (g.moved) this.cb.onResidentDrop(res.id, this.roomAt(local.x, local.y));
          else this.cb.onResidentTap(res);
        }
        const sp = this.sprites.get(g.residentId);
        if (sp) sp.roomId = -999; // re-seat
      } else if (g.kind === 'pan' && !g.moved) {
        const room = this.roomAt(local.x, local.y);
        if (room) this.cb.onRoomTap(room);
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
        this.float(`+${ev.amount}`, r.x + r.w / 2, r.y + 30, RESOURCE_COLORS[ev.resource] ?? 0xffffff);
        if (ev.bonusScrip > 0) this.float(`+${ev.bonusScrip} scrip`, r.x + r.w / 2, r.y + 54, 0xf2a541);
      } else if (ev.type === 'residentLeveled') {
        const sp = this.sprites.get(ev.residentId);
        if (sp) this.float(`LEVEL ${ev.level}`, sp.x, sp.root.y - RESIDENT_H - 10, 0xf4ecd8);
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

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

/** Draw a cutaway room box at (0,0) of size w×h. */
function drawRoomBox(g: Graphics, type: string, w: number, h: number, level: number, segments: number): void {
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
    default: {
      for (let s = 0; s < segments * 2; s++) {
        const px = bx + 10 + s * ((bw - 20) / (segments * 2));
        g.rect(px, by + bh * 0.4, (bw - 20) / (segments * 2) - 8, bh * 0.56).fill(shade(look.trim, -0.1));
        g.rect(px + 4, by + bh * 0.45, 10, 6).fill(look.accent);
      }
    }
  }
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

function drawResident(g: Graphics, res: Resident): void {
  const h = hash(res.id);
  const skin = SKIN[h % SKIN.length] ?? 0xf1c9a5;
  const hair = HAIR[(h >> 4) % HAIR.length] ?? 0x2b1e16;
  const suit = 0x3f8f8a; // teal Halcyon jumpsuit
  const stripe = 0xf2a541;
  const top = -RESIDENT_H;
  // shadow
  g.ellipse(0, 0, 11, 3).fill({ color: 0x000000, alpha: 0.35 });
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
  if (res.rarity !== 'common') g.circle(0, top - 6, 3).fill(res.rarity === 'legendary' ? 0xf2c14e : 0xc9d1d3);
}

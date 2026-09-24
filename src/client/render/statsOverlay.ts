// M6 room stats overlay (GDD §6.6): a toggle that puts a plate on every room
// with its output per minute, its crew against its slots, its stat total and
// whether it's ready or banked. Plates keep a readable size at any zoom and
// are refreshed a few times a second, only while the overlay is on.

import { Container, Graphics, Text } from 'pixi.js';
import {
  batchOutput,
  cycleSeconds,
  radioInterval,
  residentsInRoom,
  roomCapacity,
  roomDef,
  roomStatTotal,
  tableValue,
  labRate,
  refineryPerHour,
  type Room,
} from '../../sim';
import type { Game } from '../game';
import { STAT_SHORT } from '../ui/qolText';
import { RESOURCE_COLORS } from './palette';
import type { VaultView } from './vaultView';

/** Screen-space font size in px. */
const FONT = 11;
const LINE = 13;
const REFRESH_S = 0.4;
const INK = 0xf4ecd8;
const DIM = 0xb9b19c;
const WARN = 0xff8a6a;
const GOLD = 0xf2c14e;

interface Plate {
  root: Container;
  bg: Graphics;
  lines: Text[];
  key: string;
}

interface PlateLine {
  text: string;
  color: number;
}

export class StatsOverlay {
  readonly layer = new Container();
  private plates = new Map<number, Plate>();
  private since = REFRESH_S;
  private lastZoom = 0;
  private on = false;

  constructor(
    private game: Game,
    private view: VaultView,
  ) {
    this.layer.eventMode = 'none';
    this.layer.visible = false;
    view.world.addChild(this.layer);
  }

  get visible(): boolean {
    return this.on;
  }

  set visible(v: boolean) {
    this.on = v;
    this.layer.visible = v;
    this.since = REFRESH_S;
  }

  update(dt: number): void {
    if (!this.on) return;
    // Keep the layer on top if the view re-adds its own layers.
    if (this.layer.parent !== this.view.world) this.view.world.addChild(this.layer);
    this.since += dt;
    const zoom = this.view.world.scale.x || 1;
    if (this.since < REFRESH_S && zoom === this.lastZoom) return;
    this.since = 0;
    this.lastZoom = zoom;
    this.refresh(zoom);
  }

  private refresh(zoom: number): void {
    const { state } = this.game;
    // Plates stay about the same size on screen: bigger in the world when zoomed out.
    const s = Math.max(1, Math.min(2.6, 1 / zoom));
    const alive = new Set<number>();
    for (const room of state.rooms) {
      if (room.type === 'elevator') continue;
      alive.add(room.id);
      const r = this.view.roomRect(room);
      // Narrow rooms on screen (single rooms on a phone) get the short wording.
      const lines = this.linesFor(room, r.w * zoom < 150);
      const plate = this.plates.get(room.id) ?? this.createPlate(room.id);
      const key = lines.map((l) => `${l.text}#${l.color}`).join('|');
      if (key !== plate.key) this.draw(plate, lines, key);
      // Never wider than the room, so neighbours' plates don't overlap.
      const fit = Math.min(s, (r.w - 6) / Math.max(1, plate.bg.width));
      const w = plate.bg.width * fit;
      const hgt = plate.bg.height * fit;
      plate.root.scale.set(fit);
      // Centre on the room; drop below the ready bubble when the room is tall enough on screen.
      plate.root.position.set(Math.round(r.x + (r.w - w) / 2), Math.round(r.y + Math.max(8, Math.min(r.h - hgt - 6, r.h * 0.5 - hgt / 2 + 10))));
    }
    for (const [id, plate] of this.plates) {
      if (alive.has(id)) continue;
      plate.root.destroy({ children: true });
      this.plates.delete(id);
    }
  }

  private createPlate(id: number): Plate {
    const root = new Container();
    const bg = new Graphics();
    root.addChild(bg);
    const plate: Plate = { root, bg, lines: [], key: '' };
    this.plates.set(id, plate);
    this.layer.addChild(root);
    return plate;
  }

  private draw(plate: Plate, lines: PlateLine[], key: string): void {
    plate.key = key;
    while (plate.lines.length < lines.length) {
      const t = new Text({ text: '', style: { fontFamily: 'Work Sans, sans-serif', fontWeight: '700', fontSize: FONT, fill: INK } });
      plate.lines.push(t);
      plate.root.addChild(t);
    }
    let width = 0;
    plate.lines.forEach((t, i) => {
      const line = lines[i];
      t.visible = !!line;
      if (!line) return;
      if (t.text !== line.text) t.text = line.text;
      t.style.fill = line.color;
      t.position.set(6, 4 + i * LINE);
      width = Math.max(width, t.width);
    });
    const hgt = 6 + lines.length * LINE;
    plate.bg.clear();
    plate.bg.roundRect(0, 0, Math.ceil(width) + 12, hgt, 5).fill({ color: 0x0c1214, alpha: 0.86 }).stroke({ width: 1, color: 0x4fb3a9, alpha: 0.7 });
  }

  /** What a room's plate says. */
  private linesFor(room: Room, compact: boolean): PlateLine[] {
    const { state, content } = this.game;
    const def = roomDef(content, room);
    const cap = roomCapacity(content, room);
    const crew = residentsInRoom(state, room.id).length;
    const out: PlateLine[] = [];
    if (def.produces) {
      const secs = cycleSeconds(state, content, room);
      const perMin = isFinite(secs) && secs > 0 ? (batchOutput(content, room) * 60) / secs : 0;
      const what = compact ? '' : ` ${def.produces.resource === 'medpatch' ? 'patch' : def.produces.resource}`;
      out.push({ text: `+${rate(perMin)}${what}/min`, color: RESOURCE_COLORS[def.produces.resource] ?? INK });
    } else if (def.category === 'radio') {
      const left = Math.max(0, radioInterval(state, content, room) - room.timer);
      out.push({ text: crew ? `${compact ? 'Next' : 'Broadcast'} ${short(left)}` : compact ? 'Silent' : 'Radio silent', color: 0xd9645b });
    } else if (def.category === 'workshop') {
      const job = room.job;
      const p = job && job.total > 0 ? Math.round((1 - job.remaining / job.total) * 100) : 0;
      out.push({ text: job ? (job.remaining <= 0 ? 'Item ready' : `${compact ? 'Craft' : 'Crafting'} ${p}%`) : 'No job', color: job ? GOLD : DIM });
    } else if (def.category === 'research') {
      // M6: Labs make research points continuously.
      out.push({ text: `+${rate(labRate(state, content, room))}${compact ? '' : ' RP'}/h`, color: 0x7fe0c0 });
    } else if (room.type === 'refinery') {
      out.push({ text: `+${rate(refineryPerHour(state, content, room))}${compact ? '' : ' salvage'}/h`, color: 0xc9d1d3 });
    } else if (def.storage) {
      const amt = tableValue(def.storage.amount, room.level, room.segments);
      out.push({ text: def.storage.resource === 'population' ? `${amt} beds` : compact ? `Store +${amt}` : `+${amt} storage`, color: DIM });
    } else if (def.category === 'door') {
      out.push({ text: `Door ${def.doorHp?.[room.level - 1] ?? 0}`, color: DIM });
    }
    if (cap > 0) out.push({ text: `${def.category === 'door' ? 'Guards' : 'Crew'} ${crew}/${cap}`, color: crew >= cap ? INK : crew === 0 ? WARN : DIM });
    if (def.stat) out.push({ text: `${STAT_SHORT[def.stat]} ${Math.round(roomStatTotal(state, content, room))}`, color: INK });
    // Status last: what the player should act on.
    const banked = room.banked ?? 0;
    if (!room.powered) out.push({ text: 'NO POWER', color: WARN });
    else if (state.incidents.some((i) => i.roomId === room.id)) out.push({ text: 'INCIDENT', color: WARN });
    else if (room.ready) out.push({ text: banked ? `READY ×${banked + 1}` : 'READY', color: GOLD });
    else if (def.produces && crew === 0) out.push({ text: 'No crew', color: WARN });
    return out;
  }
}

function rate(n: number): string {
  if (n >= 100) return `${Math.round(n)}`;
  if (n >= 10) return n.toFixed(1).replace(/\.0$/, '');
  return n.toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
}

function short(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

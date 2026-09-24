// Quest-site rooms: the same 2.5D cutaway as homestead rooms, but ruined.
// Cracked walls, rust bloom, hanging cable, rubble on the floor, a lamp that
// has seen better decades. Each quest picks a theme (a relay station, a dead
// homestead or a scrapyard shack) and each room is varied by a seed, so the
// same map looks lived-in (or died-in) rather than tiled.

import type { Graphics } from 'pixi.js';
import type { QuestRoom } from '../../sim';
import { FRAME, shade } from './palette';

export const RW = 360;
export const RH = 210;
/** Horizontal gap between rooms (corridors) and vertical gap between floors (stairs). */
export const GX = 76;
export const GY = 90;
export const DEPTH_X = 18;
export const DEPTH_Y = 14;
/** Where the actors stand, from the room top. */
export const FLOOR_Y = RH - 20;
/** Ladders between floors sit here (room-local x). */
export const LADDER_X = RW * 0.5;

export interface Theme {
  id: 'relay' | 'homestead' | 'scrapyard';
  wall: number;
  trim: number;
  floor: number;
  accent: number;
  rock: number;
}

export const THEMES: Record<Theme['id'], Theme> = {
  relay: { id: 'relay', wall: 0x8a8d84, trim: 0x44605f, floor: 0x4a4638, accent: 0x7fe0c0, rock: 0x2a2320 },
  homestead: { id: 'homestead', wall: 0xbdae88, trim: 0x7a6a42, floor: 0x5e4a33, accent: 0xf2a541, rock: 0x241a14 },
  scrapyard: { id: 'scrapyard', wall: 0x8f6a4e, trim: 0x5a3a2a, floor: 0x4d3a2a, accent: 0xe4572e, rock: 0x2c1f16 },
};

export function hash(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return x >>> 0;
}

export function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Deterministic 0..1 values from a seed. */
function rnd(seed: number, i: number): number {
  return (hash(seed * 31 + i * 7919) % 10000) / 10000;
}

export function themeFor(title: string, defId: string): Theme {
  if (/212|homestead|shelter|vault|strata|warden/i.test(title)) return THEMES.homestead;
  if (/relay|pylon|radio|tower|antenna|station|signal/i.test(title)) return THEMES.relay;
  const ids: Theme['id'][] = ['relay', 'homestead', 'scrapyard'];
  return THEMES[ids[strHash(defId) % ids.length]!];
}

export interface Openings {
  left: boolean;
  right: boolean;
  /** Ladder hatches in the floor (to a room below) or ceiling (to a room above). */
  down: boolean;
  up: boolean;
}

/** Draw a ruined room at (0, 0). Contents are only drawn once the room has been seen. */
export function drawRuinRoom(g: Graphics, room: QuestRoom, theme: Theme, seed: number, open: Openings): void {
  const w = RW;
  const h = RH;
  const dx = DEPTH_X;
  const dy = DEPTH_Y;
  const i = 4;
  const boss = room.visited && room.kind === 'boss';
  const wall = boss ? shade(theme.wall, -0.25) : shade(theme.wall, (rnd(seed, 1) - 0.5) * 0.12);
  g.rect(0, 0, w, h).fill(FRAME);
  g.poly([i, i, w - i, i, w - i - dx, i + dy, i + dx, i + dy]).fill(shade(wall, -0.5));
  g.poly([i, h - i, w - i, h - i, w - i - dx, h - i - dy, i + dx, h - i - dy]).fill(shade(theme.floor, 0.05));
  g.poly([i, i, i + dx, i + dy, i + dx, h - i - dy, i, h - i]).fill(shade(wall, -0.35));
  g.poly([w - i, i, w - i - dx, i + dy, w - i - dx, h - i - dy, w - i, h - i]).fill(shade(wall, -0.42));
  const bx = i + dx;
  const by = i + dy;
  const bw = w - 2 * (i + dx);
  const bh = h - 2 * (i + dy);
  g.rect(bx, by, bw, bh).fill(wall);
  // wainscot, half of it peeled away
  g.rect(bx, by + bh * 0.62, bw, bh * 0.38).fill(shade(wall, -0.15));
  const peel = rnd(seed, 2) * bw * 0.6;
  g.rect(bx + peel, by + bh * 0.62, bw * 0.25, 3).fill(theme.trim);
  g.rect(bx, by + bh * 0.62, peel * 0.8, 3).fill(theme.trim);
  // wall panels and seams
  for (let k = 1; k < 5; k++) g.rect(bx + (bw / 5) * k, by, 2, bh * 0.62).fill({ color: 0x000000, alpha: 0.12 });

  // rust bloom and water stains running down from the ceiling
  for (let k = 0; k < 4; k++) {
    const sx = bx + rnd(seed, 10 + k) * (bw - 30);
    const sw = 10 + rnd(seed, 20 + k) * 22;
    const sh = 20 + rnd(seed, 30 + k) * (bh * 0.5);
    g.poly([sx, by, sx + sw, by, sx + sw * 0.7, by + sh, sx + sw * 0.4, by + sh * 0.8]).fill({ color: 0x5a3a1c, alpha: 0.28 });
  }
  // cracks
  for (let k = 0; k < 2; k++) {
    let cx = bx + 20 + rnd(seed, 40 + k) * (bw - 40);
    let cy = by + 4;
    g.moveTo(cx, cy);
    for (let s = 0; s < 5; s++) {
      cx += (rnd(seed, 50 + k * 10 + s) - 0.5) * 22;
      cy += 8 + rnd(seed, 60 + k * 10 + s) * 12;
      g.lineTo(cx, cy);
    }
    g.stroke({ width: 1.5, color: 0x1b140f, alpha: 0.75 });
  }
  // a hole blown through the back wall, showing rock
  if (rnd(seed, 3) > 0.5) {
    const hx = bx + 30 + rnd(seed, 4) * (bw - 100);
    const hy = by + 16 + rnd(seed, 5) * 30;
    g.poly([hx, hy + 10, hx + 18, hy, hx + 42, hy + 6, hx + 52, hy + 26, hx + 30, hy + 38, hx + 8, hy + 30]).fill(theme.rock);
    g.poly([hx + 8, hy + 14, hx + 22, hy + 8, hx + 38, hy + 12, hx + 40, hy + 24, hx + 24, hy + 30]).fill(shade(theme.rock, -0.35));
    g.moveTo(hx + 4, hy + 20).lineTo(hx + 50, hy + 16).stroke({ width: 2, color: 0x6a4a2a }); // bent rebar
  }
  // pipes along the ceiling, one of them broken and dripping
  g.rect(bx, by + 6, bw, 6).fill(shade(theme.trim, -0.2));
  const brk = bx + rnd(seed, 6) * (bw - 40) + 20;
  g.rect(brk - 4, by + 6, 8, 6).fill(shade(wall, -0.5));
  g.rect(brk + 5, by + 12, 2, 8).fill({ color: 0x7fb7c9, alpha: 0.6 });
  // hanging cable and a dead (or dying) lamp
  const lx = bx + bw * (0.3 + rnd(seed, 7) * 0.4);
  const sag = 10 + rnd(seed, 8) * 16;
  g.moveTo(bx + 10, by + 12).quadraticCurveTo((bx + 10 + lx) / 2, by + 12 + sag * 2, lx, by + 14 + sag).stroke({ width: 1.5, color: 0x14100d });
  g.poly([lx - 9, by + 24 + sag, lx - 4, by + 14 + sag, lx + 4, by + 14 + sag, lx + 9, by + 24 + sag]).fill(shade(theme.trim, -0.1));

  // theme dressing
  if (theme.id === 'relay') {
    // dead equipment racks with a few lit diodes
    const rx = bx + bw - 70 - rnd(seed, 9) * 40;
    g.rect(rx, by + bh * 0.28, 40, bh * 0.72).fill(0x2b2f33);
    for (let k = 0; k < 5; k++) {
      g.rect(rx + 4, by + bh * 0.32 + k * 14, 32, 10).fill(0x3b3f3a);
      if (rnd(seed, 70 + k) > 0.6) g.circle(rx + 30, by + bh * 0.32 + k * 14 + 5, 1.6).fill(theme.accent);
    }
  } else if (theme.id === 'homestead') {
    // a HALCY poster, faded, one corner flapping
    const px = bx + 20 + rnd(seed, 9) * (bw * 0.5);
    g.rect(px, by + 26, 34, 44).fill(0xe0cfa0);
    g.circle(px + 17, by + 42, 9).fill(0xf2a541);
    g.rect(px + 12, by + 40, 3, 3).fill(0x14100d);
    g.rect(px + 19, by + 40, 3, 3).fill(0x14100d);
    g.rect(px + 12, by + 46, 10, 2).fill(0x14100d);
    g.rect(px + 5, by + 58, 24, 3).fill(0x3f8f8a);
    g.poly([px + 34, by + 70, px + 24, by + 70, px + 34, by + 60]).fill(shade(wall, -0.2));
  } else {
    // corrugated sheet patches and a painted warning
    for (let k = 0; k < 2; k++) {
      const px = bx + 10 + rnd(seed, 80 + k) * (bw - 70);
      g.rect(px, by + 20 + k * 20, 56, 34).fill(0x7a7f7a);
      for (let c = 0; c < 7; c++) g.rect(px + 2 + c * 8, by + 20 + k * 20, 3, 34).fill(0x5d6260);
    }
    g.rect(bx + bw - 60, by + 30, 44, 12).fill({ color: 0xe4572e, alpha: 0.7 });
  }

  // openings: doorways in the side walls, hatches for ladders
  if (open.left) doorway(g, i + 2, h);
  if (open.right) doorway(g, w - i - 2 - (dx - 2), h);
  if (open.down) g.rect(LADDER_X - 22, h - i - 6, 44, 6).fill(0x0c0907);
  if (open.up) g.rect(LADDER_X - 22, i, 44, 6).fill(0x0c0907);

  // rubble along the floor
  const floorTop = h - i - dy;
  for (let k = 0; k < 7; k++) {
    const rx = bx + rnd(seed, 90 + k) * bw;
    const rs = 4 + rnd(seed, 100 + k) * 8;
    g.poly([rx - rs, floorTop + 4, rx - rs * 0.4, floorTop - rs * 0.6, rx + rs * 0.5, floorTop - rs * 0.4, rx + rs, floorTop + 4]).fill(shade(theme.floor, 0.1 + rnd(seed, 110 + k) * 0.15));
  }

  if (room.visited) drawContents(g, room, theme, seed, bx, by, bw, bh);
}

function doorway(g: Graphics, x: number, h: number): void {
  const dw = DEPTH_X - 2;
  const top = h - DEPTH_Y - 4 - 96;
  g.rect(x, top, dw, 96).fill(0x0c0907);
  g.rect(x, top, dw, 4).fill(0x3b2f2a);
}

/** Props that give away what the room held: crates, a console, the boss's lair. */
function drawContents(g: Graphics, room: QuestRoom, theme: Theme, seed: number, bx: number, by: number, bw: number, bh: number): void {
  const floorY = by + bh;
  switch (room.kind) {
    case 'loot': {
      // footlockers, lids off once looted
      for (let k = 0; k < 2; k++) {
        const cx = bx + bw * 0.55 + k * 46;
        g.rect(cx, floorY - 22, 38, 22).fill(0x5d6b3a);
        g.rect(cx, floorY - 22, 38, 4).fill(0x3e4a26);
        g.rect(cx + 15, floorY - 16, 8, 5).fill(0xf2c14e);
        if (room.cleared) g.poly([cx - 2, floorY - 24, cx + 36, floorY - 34, cx + 38, floorY - 30, cx, floorY - 20]).fill(0x6b7a44);
        else g.rect(cx - 1, floorY - 26, 40, 5).fill(0x6b7a44);
      }
      break;
    }
    case 'event': {
      // a console or cabinet with a single stubborn light
      const cx = bx + bw * 0.62;
      g.rect(cx, floorY - 64, 52, 64).fill(0x3b3f3a);
      g.rect(cx + 6, floorY - 58, 40, 22).fill(0x1d2628);
      g.rect(cx + 9, floorY - 50, 30, 2).fill(theme.accent);
      for (let k = 0; k < 4; k++) g.circle(cx + 10 + k * 10, floorY - 24, 3).fill(k === 1 ? 0xe4572e : 0x6f7b7a);
      break;
    }
    case 'boss': {
      // hazard stripes and a pile of trophies: someone lived (and ate) here
      for (let k = 0; k < 8; k++) g.poly([bx + k * (bw / 8), by + bh * 0.62, bx + k * (bw / 8) + 14, by + bh * 0.62, bx + k * (bw / 8) + 24, by + bh * 0.62 + 6, bx + k * (bw / 8) + 10, by + bh * 0.62 + 6]).fill({ color: 0xf2a541, alpha: 0.55 });
      for (let k = 0; k < 5; k++) {
        const x = bx + bw * 0.62 + rnd(seed, 120 + k) * bw * 0.3;
        g.ellipse(x, floorY - 3, 7, 3).fill(0xe9e1cc);
        g.circle(x + 5, floorY - 6, 3).fill(0xe9e1cc);
      }
      break;
    }
    case 'start': {
      // the way in: daylight through a broken hatch
      g.poly([bx + 10, by, bx + 60, by, bx + 90, floorY, bx + 10, floorY]).fill({ color: 0xffe3a3, alpha: 0.12 });
      break;
    }
    default:
      break;
  }
}

/** A short horizontal passage between two rooms on the same floor. */
export function drawCorridor(g: Graphics, x0: number, x1: number, floorTop: number, theme: Theme): void {
  const top = floorTop + RH - DEPTH_Y - 4 - 96;
  const bottom = floorTop + RH - DEPTH_Y + 2;
  g.rect(x0, top - 6, x1 - x0, bottom - top + 12).fill(FRAME);
  g.rect(x0, top, x1 - x0, bottom - top).fill(shade(theme.wall, -0.6));
  g.rect(x0, bottom - 8, x1 - x0, 8).fill(shade(theme.floor, -0.1));
  // support beams
  for (let x = x0 + 12; x < x1 - 6; x += 30) g.rect(x, top, 5, bottom - top).fill(shade(theme.trim, -0.35));
}

/** A ladder shaft down from one floor to the next. */
export function drawLadder(g: Graphics, x: number, y0: number, y1: number, theme: Theme): void {
  g.rect(x - 26, y0, 52, y1 - y0).fill(FRAME);
  g.rect(x - 22, y0, 44, y1 - y0).fill(shade(theme.wall, -0.62));
  g.rect(x - 14, y0, 3, y1 - y0).fill(0x6f7b7a);
  g.rect(x + 11, y0, 3, y1 - y0).fill(0x6f7b7a);
  for (let y = y0 + 6; y < y1; y += 14) g.rect(x - 14, y, 28, 3).fill(0x8a9493);
}

/** A stairway cut diagonally through the rock between two floors. */
export function drawStairs(g: Graphics, ax: number, ay: number, bx: number, by: number, theme: Theme): void {
  const n = 12;
  g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 44, color: FRAME });
  g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 36, color: shade(theme.wall, -0.6) });
  for (let k = 0; k <= n; k++) {
    const x = ax + ((bx - ax) * k) / n;
    const y = ay + ((by - ay) * k) / n;
    g.rect(x - 10, y + 8, 20, 4).fill(shade(theme.floor, 0.1));
  }
}

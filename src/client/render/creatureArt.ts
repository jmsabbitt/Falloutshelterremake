// M9 vault creatures (GDD §7.1), drawn with plain Graphics in the same 2.5D
// cutaway style as the other incidents: electrical surges, the Hollowed,
// Glassbacks (taint-crystal arachnids that jump between rooms) and the
// Mauler, the apex threat that walks in from the door. Also the Warden's Seal
// monument that stands by the door once the Seal is earned.
//
// Everything here redraws per frame into the view's overlay Graphics; the
// view decides where things are (vaultView.ts), these only draw them.

import type { Graphics } from 'pixi.js';

type Rect = { x: number; y: number; w: number; h: number };

/** Health-bar colours for the new incidents. */
export const CREATURE_COLORS: Record<string, number> = {
  surge: 0x7fd8ff,
  hollowed: 0x9fd86a,
  glassbacks: 0xbff3ee,
  maulers: 0xc2452d,
};

/** A small deterministic hash so each bolt and creature keeps its own rhythm. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ------------------------------------------------------------------ surge

/** A jagged bolt from a to b, re-rolled a few times a second. */
function bolt(g: Graphics, ax: number, ay: number, bx: number, by: number, seed: number, width: number, color: number, alpha: number): void {
  const steps = 7;
  g.moveTo(ax, ay);
  for (let i = 1; i < steps; i++) {
    const p = i / steps;
    const jx = (hash(seed + i * 3.1) - 0.5) * 22;
    const jy = (hash(seed + i * 7.7) - 0.5) * 16;
    g.lineTo(ax + (bx - ax) * p + jx, ay + (by - ay) * p + jy);
  }
  g.lineTo(bx, by);
  g.stroke({ width, color, alpha });
}

/** Arcs crawling over the walls and floor, a blue flicker, sparks from the fittings. */
export function drawSurge(g: Graphics, r: Rect, t: number): void {
  const floorY = r.y + r.h - 8;
  const flash = Math.max(0, Math.sin(t * 23) * Math.sin(t * 7.3));
  g.rect(r.x + 3, r.y + 3, r.w - 6, r.h - 6).fill({ color: 0x3a8cff, alpha: 0.06 + 0.12 * flash });
  // Conduits on the ceiling glowing hot.
  g.rect(r.x + 8, r.y + 16, r.w - 16, 3).fill({ color: 0xbfeaff, alpha: 0.5 + 0.4 * flash });
  const tick = Math.floor(t * 9);
  const n = Math.max(2, Math.round(r.w / 70));
  for (let i = 0; i < n; i++) {
    const seed = tick * 13 + i * 101;
    const ax = r.x + 14 + hash(seed) * (r.w - 28);
    const bx = r.x + 14 + hash(seed + 5) * (r.w - 28);
    const by = floorY - hash(seed + 9) * 20;
    bolt(g, ax, r.y + 18, bx, by, seed, 5, 0x3a8cff, 0.35);
    bolt(g, ax, r.y + 18, bx, by, seed, 2, 0xeaf8ff, 0.95);
    // a scorch where it lands
    g.ellipse(bx, floorY + 2, 10, 3).fill({ color: 0x14100d, alpha: 0.35 });
    g.circle(bx, by, 4 + flash * 3).fill({ color: 0xeaf8ff, alpha: 0.8 });
  }
  // Sparks falling from the fittings.
  for (let i = 0; i < Math.ceil(r.w / 30); i++) {
    const period = 0.6 + hash(i) * 0.5;
    const p = ((t + hash(i + 40) * 3) % period) / period;
    const sx = r.x + 16 + hash(i + 20) * (r.w - 32) + (hash(i + 60) - 0.5) * 30 * p;
    const sy = r.y + 20 + p * p * (r.h - 34);
    g.rect(sx, sy, 2, 4).fill({ color: 0xfff3a0, alpha: 1 - p });
  }
}

// ------------------------------------------------------------------ the Hollowed

/** A hunched, Glare-sick drifter with lamp-green eyes. x is the feet, facing 1 = right. */
function hollowedFigure(g: Graphics, x: number, y: number, t: number, facing: number, seed: number, lunge: number): void {
  const sway = Math.sin(t * 2.2 + seed) * 2;
  const f = facing;
  const lx = x + lunge * f;
  // taint seeping from them, and a sickly glow so they stand out
  g.ellipse(x + 4 * facing, y - 24, 17, 28).fill({ color: 0x9fd86a, alpha: 0.14 });
  g.ellipse(x, y + 1, 14, 4).fill({ color: 0x9fd86a, alpha: 0.3 });
  // legs, one dragging
  const step = Math.sin(t * 2.6 + seed);
  g.roundRect(lx - 6 + step * 2, y - 18, 5, 18, 2).fill(0x3a3f33);
  g.roundRect(lx + 1 - step * 2, y - 17, 5, 17, 2).fill(0x30352b);
  // torso in ragged jumpsuit, stooped forward
  g.poly([lx - 9, y - 18, lx + 8, y - 18, lx + 10 * f + sway, y - 40, lx - 6 * f + sway, y - 42]).fill(0x3c4636);
  g.poly([lx - 9, y - 26, lx + 9, y - 26, lx + 8, y - 22, lx - 8, y - 22]).fill(0x3f473a);
  // long arms reaching
  const reach = 6 + lunge;
  g.roundRect(lx + 4 * f + sway, y - 38, 4, 20, 2).fill(0xa8b894);
  g.moveTo(lx + 6 * f + sway, y - 36).lineTo(lx + (14 + reach) * f + sway, y - 30).stroke({ width: 4, color: 0xa8b894 });
  // head, hanging low, glowing eyes
  const hx = lx + 8 * f + sway;
  const hy = y - 44;
  g.circle(hx, hy, 7).fill(0xb4c49c).stroke({ width: 1.2, color: 0x1d2419 });
  g.circle(hx - 2, hy - 5, 4).fill({ color: 0x5b6450, alpha: 0.8 });
  const glow = 0.7 + 0.3 * Math.sin(t * 5 + seed);
  g.circle(hx + 3 * f, hy, 1.8).fill({ color: 0xc8ff7a, alpha: glow });
  g.circle(hx + 3 * f, hy, 4).fill({ color: 0xc8ff7a, alpha: 0.18 * glow });
}

/** A few of them shambling about in a green haze. */
export function drawHollowed(g: Graphics, r: Rect, t: number): void {
  const floorY = r.y + r.h - 10;
  // lingering taint haze
  const puffs = Math.max(2, Math.floor((r.w - 48) / 40));
  for (let i = 0; i < puffs; i++) {
    const hx = r.x + 30 + (i / Math.max(1, puffs - 1)) * (r.w - 60) + Math.sin(t * 0.6 + i) * 5;
    g.ellipse(hx, floorY - 6 - (i % 2) * 6, 20, 8).fill({ color: 0x9fd86a, alpha: 0.12 });
  }
  const n = Math.max(2, Math.min(4, Math.round(r.w / 75)));
  for (let i = 0; i < n; i++) {
    const phase = (t * (0.035 + (i % 3) * 0.012) + i * 0.41) % 1;
    const right = phase < 0.5;
    const along = right ? phase * 2 : 2 - phase * 2;
    const x = r.x + 22 + along * (r.w - 44);
    const lunge = Math.max(0, Math.sin(t * 1.7 + i * 2.3)) ** 6 * 8;
    hollowedFigure(g, x, floorY, t, right ? 1 : -1, i * 1.9, lunge);
  }
}

// ------------------------------------------------------------------ Glassbacks

/** One crystal arachnid: a pale shard body with spikes and eight picking legs. k scales it. */
export function glassbackFigure(g: Graphics, x: number, y: number, t: number, facing: number, seed: number, airborne = false, k = 1.5): void {
  const f = facing * k;
  const bob = airborne ? 0 : Math.abs(Math.sin(t * 9 + seed)) * 1.5 * k;
  const by = y - 9 * k - bob;
  // a cold glow so they read against busy rooms
  g.ellipse(x, by, 18 * k, 10 * k).fill({ color: 0x7fe8ff, alpha: 0.16 });
  // legs: four each side, alternating
  for (let i = 0; i < 4; i++) {
    const q = i - 1.5;
    const swing = airborne ? 0.6 : Math.sin(t * 14 + seed + i * 1.6);
    const kneeX = x + (q * 6 + swing * 2) * k;
    const kneeY = by - 7 * k;
    const footX = x + (q * 9 + swing * 3) * k;
    const footY = airborne ? by + 6 * k : y;
    g.moveTo(x + q * 3 * k, by).lineTo(kneeX, kneeY).lineTo(footX, footY).stroke({ width: 1.4 * k, color: 0x2f4a50 });
  }
  // body: two faceted segments
  g.poly([x - 11 * f, by + 2 * k, x - 4 * f, by - 6 * k, x + 4 * f, by - 5 * k, x + 6 * f, by + 3 * k, x - 6 * f, by + 5 * k]).fill(0x9cc9c6).stroke({ width: 1, color: 0x2f4a50 });
  g.poly([x + 4 * f, by - 3 * k, x + 12 * f, by - 2 * k, x + 13 * f, by + 3 * k, x + 5 * f, by + 4 * k]).fill(0xc7ece8).stroke({ width: 1, color: 0x2f4a50 });
  // crystal spikes along the back, glinting
  const glint = 0.5 + 0.5 * Math.sin(t * 4 + seed);
  for (let i = 0; i < 3; i++) {
    const sx = x + (-7 + i * 5) * f;
    g.poly([sx - 2 * k, by - 4 * k, sx + (1 - i * 0.5) * f, by - (13 + i * 2) * k, sx + 3 * k, by - 4 * k]).fill(i === 1 ? 0xe9fffd : 0x8fd6d0);
  }
  g.circle(x - 2 * f, by - 11 * k, 1.5 * k).fill({ color: 0xffffff, alpha: glint });
  // eyes
  g.circle(x + 12 * f, by, 1.3 * k).fill(0xff3a6a);
  g.circle(x + 11 * f, by - 2 * k, 1 * k).fill(0xff3a6a);
}

/** A cluster of them skittering along the floor, and the power they drain crackling off them. */
export function drawGlassbacks(g: Graphics, r: Rect, t: number, hidden = false): void {
  const floorY = r.y + r.h - 9;
  // shards they shed on the floor
  for (let i = 0; i < Math.ceil(r.w / 45); i++) {
    const sx = r.x + 16 + hash(i + r.x) * (r.w - 32);
    g.poly([sx - 3, floorY + 2, sx, floorY - 4, sx + 3, floorY + 2]).fill({ color: 0xbff3ee, alpha: 0.55 });
  }
  if (hidden) return;
  const n = Math.max(2, Math.min(4, Math.round(r.w / 80)));
  for (let i = 0; i < n; i++) {
    const phase = (t * (0.08 + (i % 3) * 0.03) + i * 0.29) % 1;
    const right = phase < 0.5;
    const along = right ? phase * 2 : 2 - phase * 2;
    const x = r.x + 18 + along * (r.w - 36);
    // now and then one scuttles up the back wall
    const climb = i % 3 === 2 ? Math.max(0, Math.sin(t * 0.8 + i)) * 40 : 0;
    glassbackFigure(g, x, floorY - climb, t, right ? 1 : -1, i * 2.7);
  }
  // they drink the room's power: faint blue motes drifting to them
  for (let i = 0; i < 6; i++) {
    const p = (t * 0.7 + i / 6) % 1;
    g.circle(r.x + r.w * (0.1 + 0.15 * i), r.y + 20 + p * (r.h - 40), 2).fill({ color: 0x7fd8ff, alpha: 0.6 * (1 - p) });
  }
}

/** Glassbacks mid-leap between two rooms: an arc from one floor to the next. p goes 0 → 1. */
export function drawGlassbackLeap(g: Graphics, from: { x: number; y: number }, to: { x: number; y: number }, p: number, t: number): void {
  const n = 3;
  for (let i = 0; i < n; i++) {
    const q = Math.max(0, Math.min(1, p * 1.3 - i * 0.12));
    if (q <= 0 || q >= 1) continue;
    const x = from.x + (to.x - from.x) * q + (i - 1) * 14;
    const arc = Math.sin(q * Math.PI) * (60 + Math.abs(to.y - from.y) * 0.25);
    const y = from.y + (to.y - from.y) * q - arc;
    g.ellipse(x, y + 8, 6, 2).fill({ color: 0x000000, alpha: 0.15 });
    glassbackFigure(g, x, y, t, to.x >= from.x ? 1 : -1, i * 3.3, true);
    // a glittering trail
    for (let k = 1; k <= 3; k++) {
      const qk = Math.max(0, q - k * 0.04);
      const tx = from.x + (to.x - from.x) * qk + (i - 1) * 14;
      const ty = from.y + (to.y - from.y) * qk - Math.sin(qk * Math.PI) * (60 + Math.abs(to.y - from.y) * 0.25);
      g.circle(tx, ty - 8, 1.6).fill({ color: 0xe9fffd, alpha: 0.6 - k * 0.15 });
    }
  }
}

// ------------------------------------------------------------------ the Mauler

/**
 * The Mauler: a hulking, hunched thing of hide and bony plates with tusks,
 * about twice a resident's height. x is its feet, facing 1 = right. `walk`
 * animates the legs, `swipe` (0..1) raises the forelimbs for a strike.
 */
export function drawMauler(g: Graphics, x: number, y: number, t: number, facing: number, walk: boolean, swipe = 0): void {
  const f = facing;
  const H = 84;
  const step = walk ? Math.sin(t * 5) : 0;
  const breathe = Math.sin(t * 2) * 1.5;
  g.ellipse(x, y + 2, 38, 6).fill({ color: 0x000000, alpha: 0.35 });
  // hind legs
  g.roundRect(x - 22 * f - 6 + step * 4, y - 30, 13, 30, 5).fill(0x2e221c);
  g.roundRect(x - 8 * f - 6 - step * 4, y - 28, 13, 28, 5).fill(0x3a2b22);
  // the great hunched back
  g.poly([
    x - 30 * f, y - 26,
    x - 26 * f, y - H * 0.72 + breathe,
    x - 6 * f, y - H + breathe,
    x + 18 * f, y - H * 0.86 + breathe,
    x + 30 * f, y - H * 0.55,
    x + 24 * f, y - 22,
  ]).fill(0x4a3528);
  // belly
  g.poly([x - 22 * f, y - 26, x + 22 * f, y - 24, x + 16 * f, y - 40, x - 16 * f, y - 44]).fill(0x5e4636);
  // bony plates along the spine
  for (let i = 0; i < 5; i++) {
    const px = x + (-22 + i * 10) * f;
    const py = y - H * (0.7 + 0.25 * Math.sin((i / 4) * Math.PI)) + breathe;
    g.poly([px - 5, py + 4, px + 2 * f, py - 10, px + 6, py + 4]).fill(0xcfc2a4);
  }
  // forelimbs, the near one swiping
  const raise = swipe * 26;
  g.roundRect(x + 14 * f - 7 - step * 3, y - 34, 14, 34, 5).fill(0x3a2b22);
  g.poly([
    x + 18 * f, y - 48,
    x + (28 + swipe * 10) * f, y - 30 - raise,
    x + (34 + swipe * 14) * f, y - 6 - raise * 1.3,
    x + (24 + swipe * 6) * f, y - 6 - raise * 1.2,
  ]).fill(0x4a3528);
  // claws
  for (let i = 0; i < 3; i++) {
    const cx = x + (26 + i * 4 + swipe * 10) * f;
    const cy = y - 4 - raise * 1.25;
    g.poly([cx, cy, cx + 3 * f, cy + 7, cx + 5 * f, cy]).fill(0xe8dcc0);
  }
  // head: low and forward, tusks up
  const hx = x + 30 * f;
  const hy = y - H * 0.55 + breathe;
  g.ellipse(hx, hy, 15, 12).fill(0x3f2d22);
  g.poly([hx + 8 * f, hy + 2, hx + 22 * f, hy - 10, hx + 14 * f, hy + 6]).fill(0xefe6cf);
  g.poly([hx + 2 * f, hy + 5, hx + 12 * f, hy - 4, hx + 8 * f, hy + 9]).fill(0xd9ceb4);
  const glare = 0.75 + 0.25 * Math.sin(t * 6);
  g.circle(hx + 7 * f, hy - 4, 2.2).fill({ color: 0xff5a3a, alpha: glare });
  g.circle(hx + 7 * f, hy - 4, 5).fill({ color: 0xff5a3a, alpha: 0.2 * glare });
  // breath in the cold
  const puff = (t * 0.8) % 1;
  g.circle(hx + (18 + puff * 14) * f, hy + 4 - puff * 8, 3 + puff * 6).fill({ color: 0xe8e4d8, alpha: 0.25 * (1 - puff) });
}

/** Claw marks and a dent in the door while it batters away. */
export function drawDoorDamage(g: Graphics, door: Rect, frac: number): void {
  const marks = Math.ceil((1 - frac) * 4);
  for (let i = 0; i < marks; i++) {
    const cx = door.x + door.w * (0.3 + i * 0.14);
    const cy = door.y + door.h * 0.35;
    for (let k = 0; k < 3; k++) g.moveTo(cx + k * 5, cy).lineTo(cx + k * 5 + 8, cy + 26).stroke({ width: 2, color: 0x14100d, alpha: 0.7 });
  }
}

// ------------------------------------------------------------------ the Warden's Seal

/**
 * The monument HALCY puts up by the door once the Warden's Seal is earned: a
 * stepped plinth with a brass seal on an obelisk and a small flag. x is the
 * centre, y the ground.
 */
export function drawSealMonument(g: Graphics, x: number, y: number, t: number): void {
  // plinth
  g.rect(x - 26, y - 10, 52, 10).fill(0x6f7b7a);
  g.rect(x - 20, y - 18, 40, 8).fill(0x8a9695);
  g.rect(x - 26, y - 10, 52, 2).fill(0xa9b4b2);
  // obelisk
  g.poly([x - 11, y - 18, x + 11, y - 18, x + 7, y - 92, x, y - 102, x - 7, y - 92]).fill(0xd8cfb8);
  g.poly([x + 2, y - 18, x + 11, y - 18, x + 7, y - 92, x, y - 102, x + 2, y - 92]).fill(0xb9b09a);
  // the seal: a brass star in a ring, glinting
  const cy = y - 66;
  g.circle(x, cy, 12).fill(0x8a5a1c);
  g.circle(x, cy, 10).fill(0xf2c14e);
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? 7 : 3;
    pts.push(x + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.poly(pts).fill(0xfff1b8);
  const glint = Math.max(0, Math.sin(t * 1.3)) ** 8;
  g.circle(x + 4, cy - 5, 2 + glint * 3).fill({ color: 0xffffff, alpha: 0.4 + 0.6 * glint });
  // an inscription band
  g.rect(x - 7, y - 40, 14, 3).fill(0x8a8272);
  g.rect(x - 6, y - 34, 12, 2).fill(0x8a8272);
  // a small Halcyon pennant on a pole beside it
  g.rect(x + 22, y - 58, 2, 48).fill(0x2b2f33);
  const wave = Math.sin(t * 3) * 3;
  g.poly([x + 24, y - 58, x + 42, y - 54 + wave, x + 24, y - 48]).fill(0xf2a541);
}

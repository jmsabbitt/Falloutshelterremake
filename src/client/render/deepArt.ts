// M6 art for the Deep and the new rooms: the strata below the charter floors
// (darker and stranger with depth), the sealed boundary under the last dug
// stratum, the drill at the dig site, deep-floor room frames, props for the
// Lab and the deep rooms, their animated bits, and the deep incidents.
//
// Everything here is drawn with plain Graphics in the same 2.5D cutaway style
// as vaultView.ts. Static pieces (background, room props, frames) are built
// once per layout; DeepLayer.update() redraws the cheap animated bits per frame.

import { Container, Graphics, Text } from 'pixi.js';
import {
  digShaft,
  isDeepFloor,
  refineryBatch,
  stratumOf,
  type Content,
  type GameState,
  type Incident,
  type Room,
} from '../../sim';
import { LAMP, type RoomLook, shade } from './palette';

/** Pixels of sealed rock drawn under the last open floor. */
export const SEAL_H = 170;

export interface DeepGeometry {
  surfaceH: number;
  floorH: number;
  cell: number;
  /** World width of the grid in pixels. */
  width: number;
  /** Side margin in pixels (the rock extends three margins out). */
  margin: number;
  baseFloors: number;
  floorsPerStratum: number;
  depthX: number;
  depthY: number;
}

export interface StratumLook {
  rock: number;
  dark: number;
  speck: number;
  /** Room ceiling lamp colour on this stratum. */
  lamp: number;
  /** Darkening laid over rooms on this stratum. */
  tint: number;
  tintAlpha: number;
  /** Colour of the stratum's name painted in the rock. */
  ink: number;
}

const LOOKS: StratumLook[] = [
  { rock: 0x2a1d15, dark: 0x1c130e, speck: 0x3b2a1f, lamp: LAMP, tint: 0x000000, tintAlpha: 0, ink: 0xb9b19c },
  // 1: The Service Levels. Halcyon's own concrete and conduit, warm but tired.
  { rock: 0x221a16, dark: 0x15100d, speck: 0x352a22, lamp: 0xffd68a, tint: 0x0b0806, tintAlpha: 0.1, ink: 0xf2a541 },
  // 2: The Cisterns. Wet blue-black stone.
  { rock: 0x121b1f, dark: 0x0a1013, speck: 0x1f2f36, lamp: 0xa8e4ef, tint: 0x04121a, tintAlpha: 0.18, ink: 0x7fc8dc },
  // 3: The Proving Floors. Violet-black with pale veins and things that glow.
  { rock: 0x16121b, dark: 0x0c0a10, speck: 0x2a2433, lamp: 0xc8f5dc, tint: 0x0a0612, tintAlpha: 0.26, ink: 0x9cf0c0 },
  // 4: The Seal. Near black, warm to the touch.
  { rock: 0x150a08, dark: 0x0a0404, speck: 0x2c110c, lamp: 0xffa07a, tint: 0x1a0402, tintAlpha: 0.3, ink: 0xff8a5a },
];

export function stratumLook(stratum: number): StratumLook {
  return LOOKS[Math.max(0, Math.min(LOOKS.length - 1, stratum))] as StratumLook;
}

function hash(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  return x >>> 0;
}

/** Deterministic 0..1 from two ints. */
function rnd(a: number, b: number): number {
  return (hash(a * 7919 + b * 104729 + 17) % 10000) / 10000;
}

/** Light text on dark walls, dark text on light ones. */
export function labelInk(wall: number): number {
  const r = (wall >> 16) & 0xff;
  const g = (wall >> 8) & 0xff;
  const b = wall & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b < 145 ? 0xf4ecd8 : 0x1b1b1b;
}

// -------------------------------------------------------------------- background

export interface DeepBackgroundInfo {
  strata: number;
  maxStrata: number;
  /** Stratum names by index (1..), e.g. "Stratum 2: The Cisterns". */
  names: Record<number, string>;
}

/** Everything below the charter floors: dug strata, then the seal. */
export function buildDeepBackground(geo: DeepGeometry, info: DeepBackgroundInfo): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const left = -geo.margin * 3;
  const full = geo.width + geo.margin * 6;
  const bandH = geo.floorsPerStratum * geo.floorH;
  const baseBottom = geo.surfaceH + geo.baseFloors * geo.floorH;

  for (let s = 1; s <= info.strata; s++) {
    const y0 = baseBottom + (s - 1) * bandH;
    const look = stratumLook(s);
    const above = stratumLook(s - 1);
    g.rect(left, y0, full, bandH + 2).fill(look.rock);
    // speckle
    for (let i = 0; i < 260; i++) {
      const x = left + rnd(s, i) * full;
      const y = y0 + rnd(s + 50, i) * bandH;
      const w = 3 + rnd(s + 90, i) * 8;
      g.rect(x, y, w, w / 2).fill(i % 3 === 0 ? look.dark : look.speck);
    }
    stratumFeatures(g, s, left, full, y0, bandH, geo);
    // A ragged seam where the stratum above gives way.
    seam(g, left, full, y0, above.rock, s);
    // faint build grid
    for (let f = 0; f <= geo.floorsPerStratum; f++) g.rect(0, y0 + f * geo.floorH - 1, geo.width, 2).fill({ color: 0x000000, alpha: 0.22 });
    // The stratum's name, painted in the margin like a survey mark.
    const name = info.names[s] ?? `Stratum ${s}`;
    const [head, tail] = name.includes(':') ? [name.slice(0, name.indexOf(':')), name.slice(name.indexOf(':') + 1).trim()] : [name, ''];
    const t1 = new Text({ text: head.toUpperCase(), style: { fontFamily: 'Bungee, sans-serif', fontSize: 15, fill: look.ink, letterSpacing: 1 } });
    t1.alpha = 0.55;
    t1.position.set(-geo.margin + 10, y0 + 14);
    const t2 = new Text({ text: tail.toUpperCase(), style: { fontFamily: 'Bungee, sans-serif', fontSize: 10, fill: look.ink, letterSpacing: 1, wordWrap: true, wordWrapWidth: geo.margin - 16 } });
    t2.alpha = 0.45;
    t2.position.set(-geo.margin + 10, y0 + 34);
    const depth = new Text({ text: `FLOORS ${geo.baseFloors + (s - 1) * geo.floorsPerStratum + 1}–${geo.baseFloors + s * geo.floorsPerStratum}`, style: { fontFamily: 'Work Sans, sans-serif', fontWeight: '700', fontSize: 10, fill: look.ink } });
    depth.alpha = 0.35;
    depth.position.set(-geo.margin + 10, y0 + 64);
    root.addChild(t1, t2, depth);
  }

  // The seal under the last open stratum.
  const yS = baseBottom + info.strata * bandH;
  if (info.strata >= info.maxStrata) drawTheSeal(root, g, geo, left, full, yS);
  else drawSealedBoundary(root, g, geo, left, full, yS, info.strata);
  return root;
}

function seam(g: Graphics, left: number, full: number, y: number, color: number, s: number): void {
  const pts: number[] = [left, y - 1];
  const step = 26;
  for (let x = left, i = 0; x <= left + full + step; x += step, i++) pts.push(x, y + 3 + rnd(s * 31, i) * 16);
  pts.push(left + full + step, y - 1);
  g.poly(pts).fill(color);
}

function stratumFeatures(g: Graphics, s: number, left: number, full: number, y0: number, bandH: number, geo: DeepGeometry): void {
  switch (s) {
    case 1: {
      // Halcyon conduit runs through the rock: teal pipes with brass collars, and junction lamps.
      for (let k = 0; k < 4; k++) {
        const y = y0 + 40 + rnd(101, k) * (bandH - 80);
        g.rect(left, y, full, 9).fill(0x274a48);
        g.rect(left, y + 1, full, 2).fill(0x3f7472);
        for (let x = left + rnd(102, k) * 80; x < left + full; x += 90 + rnd(103, Math.floor(x)) * 40) g.rect(x, y - 2, 6, 13).fill(0x8c6a3f);
      }
      for (let k = 0; k < 5; k++) {
        const x = left + rnd(104, k) * full;
        const y = y0 + rnd(105, k) * bandH;
        g.rect(x, y, 8, 60 + rnd(106, k) * 90).fill(0x1d3534);
      }
      for (let k = 0; k < 14; k++) {
        const x = left + rnd(107, k) * full;
        const y = y0 + rnd(108, k) * bandH;
        g.circle(x, y, 10).fill({ color: 0xf2a541, alpha: 0.08 });
        g.circle(x, y, 2.5).fill({ color: 0xf2a541, alpha: 0.7 });
      }
      break;
    }
    case 2: {
      // Seeping water: wet streaks, beads and black pools, and great riveted pipes.
      for (let k = 0; k < 70; k++) {
        const x = left + rnd(201, k) * full;
        const y = y0 + rnd(202, k) * bandH;
        const len = 20 + rnd(203, k) * 70;
        g.rect(x, y, 2, len).fill({ color: 0x3f7f95, alpha: 0.35 });
        g.circle(x + 1, y + len + 2, 2).fill({ color: 0x9fd8e8, alpha: 0.6 });
      }
      for (let k = 0; k < 6; k++) {
        const x = left + rnd(204, k) * full;
        g.rect(x, y0, 20, bandH).fill(0x16262d);
        g.rect(x + 3, y0, 3, bandH).fill({ color: 0x3a5a66, alpha: 0.7 });
        for (let y = y0 + 20; y < y0 + bandH; y += 70) g.rect(x - 3, y, 26, 6).fill(0x223a44);
      }
      for (let k = 0; k < 10; k++) {
        const x = left + rnd(205, k) * full;
        const y = y0 + geo.floorH * (1 + Math.floor(rnd(206, k) * geo.floorsPerStratum)) - 6;
        g.ellipse(x, y, 40 + rnd(207, k) * 40, 5).fill({ color: 0x06141a, alpha: 0.9 });
        g.rect(x - 20, y - 2, 40, 1).fill({ color: 0x6fb7c9, alpha: 0.35 });
      }
      break;
    }
    case 3: {
      // Pale veins, glowing specks and the ribbed shapes of shed skins.
      for (let k = 0; k < 22; k++) {
        let x = left + rnd(301, k) * full;
        let y = y0 + rnd(302, k) * bandH;
        g.moveTo(x, y);
        for (let j = 0; j < 7; j++) {
          x += 20 + rnd(303 + j, k) * 40;
          y += (rnd(310 + j, k) - 0.5) * 50;
          g.lineTo(x, y);
        }
        g.stroke({ width: 2, color: 0xd8d2c0, alpha: 0.16 });
      }
      for (let k = 0; k < 90; k++) {
        const x = left + rnd(320, k) * full;
        const y = y0 + rnd(321, k) * bandH;
        const r = 1.2 + rnd(322, k) * 2;
        g.circle(x, y, r * 4).fill({ color: 0x9cf0c0, alpha: 0.06 });
        g.circle(x, y, r).fill({ color: 0x9cf0c0, alpha: 0.5 + rnd(323, k) * 0.4 });
      }
      for (let k = 0; k < 7; k++) {
        const cx = left + rnd(330, k) * full;
        const cy = y0 + rnd(331, k) * bandH;
        for (let j = 0; j < 9; j++) {
          const a = -0.8 + j * 0.2;
          g.rect(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60 + j * 2, 10, 3).fill({ color: 0xe8e4d0, alpha: 0.14 });
        }
      }
      break;
    }
    case 4: {
      // Warm cracks glowing from somewhere below.
      for (let k = 0; k < 16; k++) {
        let x = left + rnd(401, k) * full;
        let y = y0 + rnd(402, k) * bandH;
        const pts: [number, number][] = [[x, y]];
        for (let j = 0; j < 6; j++) {
          x += (rnd(403 + j, k) - 0.5) * 60;
          y += 14 + rnd(410 + j, k) * 30;
          pts.push([x, y]);
        }
        for (const [w, a] of [[8, 0.08], [4, 0.2], [1.5, 0.8]] as const) {
          g.moveTo(pts[0]![0], pts[0]![1]);
          for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
          g.stroke({ width: w, color: 0xff6a2a, alpha: a });
        }
      }
      for (let k = 0; k < 60; k++) g.circle(left + rnd(420, k) * full, y0 + rnd(421, k) * bandH, 1.5).fill({ color: 0xf2a541, alpha: 0.5 });
      break;
    }
  }
}

/** A concrete-and-steel bulkhead, then the next stratum lost in the dark. */
function drawSealedBoundary(root: Container, g: Graphics, geo: DeepGeometry, left: number, full: number, y: number, strata: number): void {
  const next = stratumLook(strata + 1);
  g.rect(left, y, full, SEAL_H + 900).fill(next.dark);
  for (let i = 0; i < 120; i++) g.rect(left + rnd(900 + strata, i) * full, y + 30 + rnd(950 + strata, i) * SEAL_H, 4, 2).fill(next.speck);
  // fog into black
  for (let k = 0; k < 8; k++) g.rect(left, y + 40 + k * 18, full, 20).fill({ color: 0x000000, alpha: 0.1 + k * 0.1 });
  g.rect(left, y + 184, full, 900).fill(0x000000);
  // the bulkhead band with chevrons
  g.rect(left, y, full, 26).fill(0x3d3a35);
  g.rect(left, y + 22, full, 4).fill(0x201e1b);
  for (let x = left; x < left + full; x += 28) {
    g.poly([x, y, x + 14, y, x + 6, y + 10, x - 8, y + 10]).fill(0xf2c14e);
    g.poly([x + 14, y, x + 28, y, x + 20, y + 10, x + 6, y + 10]).fill(0x1b1b1b);
  }
  for (let x = left + 10; x < left + full; x += 40) g.circle(x, y + 17, 2).fill(0x77706a);
  const t = new Text({
    text: 'SEALED BY ORDER OF THE HALCYON SHELTER COMPANY',
    style: { fontFamily: 'Bungee, sans-serif', fontSize: 16, fill: 0xf2c14e, letterSpacing: 2 },
  });
  t.alpha = 0.6;
  t.anchor.set(0.5, 0);
  t.position.set(geo.width / 2, y + 44);
  const sub = new Text({
    text: 'Excavation needs a survey, scrip, and an elevator on the bottom floor',
    style: { fontFamily: 'Work Sans, sans-serif', fontSize: 12, fill: 0xb9b19c, fontStyle: 'italic' },
  });
  sub.alpha = 0.55;
  sub.anchor.set(0.5, 0);
  sub.position.set(geo.width / 2, y + 70);
  root.addChild(t, sub);
}

/** The bottom of everything: one bulkhead as wide as the homestead, with the sunburst. */
function drawTheSeal(root: Container, g: Graphics, geo: DeepGeometry, left: number, full: number, y: number): void {
  g.rect(left, y, full, SEAL_H + 900).fill(0x070303);
  const x0 = -geo.margin * 0.5;
  const w = geo.width + geo.margin;
  const h = SEAL_H - 20;
  // heat bleeding round the edges
  g.rect(x0 - 12, y, w + 24, h + 6).fill({ color: 0xff6a2a, alpha: 0.12 });
  g.rect(x0, y, w, h).fill(0x3a3430);
  for (let px = x0; px < x0 + w; px += 120) {
    g.rect(px + 2, y + 4, 116, h - 8).fill(0x45403a);
    for (let ry = y + 10; ry < y + h - 6; ry += 22) {
      g.circle(px + 8, ry, 2).fill(0x8a817a);
      g.circle(px + 112, ry, 2).fill(0x8a817a);
    }
  }
  // the sunburst: a half-sun with rays, not a cog
  const cx = geo.width / 2;
  const cy = y + h - 10;
  for (let k = 0; k < 13; k++) {
    const a = Math.PI + (Math.PI * (k + 0.5)) / 13;
    g.poly([cx, cy, cx + Math.cos(a - 0.07) * 88, cy + Math.sin(a - 0.07) * 88, cx + Math.cos(a + 0.07) * 88, cy + Math.sin(a + 0.07) * 88]).fill(0xb08d3f);
  }
  g.circle(cx, cy, 46).fill(0xd9b25a);
  g.rect(cx - 60, cy, 120, 12).fill(0x3a3430);
  g.moveTo(x0, y + 2).lineTo(x0 + w, y + 2).stroke({ width: 2, color: 0xff8a5a, alpha: 0.5 });
  const t = new Text({ text: 'THE SEAL', style: { fontFamily: 'Bungee, sans-serif', fontSize: 22, fill: 0xf2c14e, letterSpacing: 4 } });
  t.alpha = 0.75;
  t.anchor.set(0.5, 0);
  t.position.set(cx - 250, y + 12);
  const sub = new Text({
    text: 'PLEASE DO NOT KNOCK',
    style: { fontFamily: 'Work Sans, sans-serif', fontWeight: '700', fontSize: 11, fill: 0x1b1b1b, letterSpacing: 2 },
  });
  sub.anchor.set(0.5, 0);
  sub.position.set(cx, cy + 1);
  root.addChild(t, sub);
}

// -------------------------------------------------------------------- deep-floor room frames

/** Rock teeth, a darker mood, and bracing once Deep Bracing is researched. */
export function drawDeepFrame(g: Graphics, w: number, h: number, stratum: number, braced: boolean, seed: number, elevator: boolean): void {
  const look = stratumLook(stratum);
  if (look.tintAlpha > 0) g.rect(3, 3, w - 6, h - 6).fill({ color: look.tint, alpha: look.tintAlpha });
  // stalactites hanging off the frame into the ceiling
  const n = Math.max(2, Math.floor(w / 26));
  for (let i = 0; i < n; i++) {
    if (rnd(seed, i) < 0.35) continue;
    const x = 6 + (i + rnd(seed + 3, i) * 0.6) * ((w - 12) / n);
    const len = 6 + rnd(seed + 7, i) * (8 + stratum * 3);
    g.poly([x - 5, 0, x + 5, 0, x + 1, len]).fill(look.rock);
  }
  // rough outcrops on the top corners
  g.poly([0, 0, 18, 0, 10, 8, 0, 14]).fill(look.rock);
  g.poly([w, 0, w - 18, 0, w - 10, 8, w, 14]).fill(look.rock);
  if (stratum === 2) {
    // water stains down the back wall
    for (let i = 0; i < Math.floor(w / 60); i++) g.rect(20 + rnd(seed + 11, i) * (w - 40), 15, 3, 30 + rnd(seed + 12, i) * 40).fill({ color: 0x0d2a33, alpha: 0.25 });
  }
  if (braced && !elevator) {
    // Deep Bracing: steel posts with caution feet and a header beam.
    g.rect(3, 15, w - 6, 5).fill(0x55605f);
    g.rect(3, 15, w - 6, 1.5).fill(0x8a9695);
    for (const x of [6, w - 11]) {
      g.rect(x, 15, 5, h - 18).fill(0x5d6a68);
      g.rect(x + 1, 15, 1.5, h - 18).fill(0x8a9695);
      for (let k = 0; k < 3; k++) g.rect(x, h - 18 + k * 4, 5, 2).fill(k % 2 ? 0x1b1b1b : 0xf2c14e);
    }
  }
}

// -------------------------------------------------------------------- room props (static)

const STEEL = 0x6f7b7a;
const STEEL_DARK = 0x2b2f33;
const WOOD = 0x8a6a45;
const WOOD_DARK = 0x5e452c;

/** Props for the Lab and the deep rooms. Returns false for other room types. */
export function drawDepthRoom(g: Graphics, type: string, look: RoomLook, bx: number, by: number, bw: number, bh: number, segments: number): boolean {
  const seg = bw / segments;
  switch (type) {
    case 'lab':
      for (let s = 0; s < segments; s++) labSegment(g, look, bx + seg * s, by, seg, bh, s);
      return true;
    case 'geothermal':
      for (let s = 0; s < segments; s++) geothermalSegment(g, look, bx + seg * s, by, seg, bh, s);
      return true;
    case 'fungalfarm':
      for (let s = 0; s < segments; s++) fungalSegment(g, look, bx + seg * s, by, seg, bh, s);
      return true;
    case 'refinery':
      for (let s = 0; s < segments; s++) refinerySegment(g, look, bx + seg * s, by, seg, bh, s);
      return true;
    case 'aquifer':
      for (let s = 0; s < segments; s++) aquiferSegment(g, look, bx + seg * s, by, seg, bh, s);
      return true;
  }
  return false;
}

function labSegment(g: Graphics, look: RoomLook, x: number, by: number, w: number, bh: number, s: number): void {
  const floorY = by + bh;
  if (s % 2 === 0) {
    // chalkboard with formulae
    const cx = x + 10;
    g.rect(cx, by + 12, 64, 34).fill(WOOD_DARK);
    g.rect(cx + 3, by + 15, 58, 28).fill(0x2e4a3e);
    for (let k = 0; k < 4; k++) g.rect(cx + 7, by + 19 + k * 6, 14 + ((k * 17) % 30), 1.5).fill({ color: 0xe8e4d8, alpha: 0.7 });
    g.circle(cx + 48, by + 29, 7).stroke({ width: 1, color: 0xe8e4d8, alpha: 0.7 });
    g.ellipse(cx + 48, by + 29, 11, 3).stroke({ width: 1, color: 0xe8e4d8, alpha: 0.6 });
    g.circle(cx + 48, by + 29, 1.5).fill(0xe8e4d8);
  } else {
    // a computer bank with tape reels (lights blink in DeepLayer)
    const cx = x + 10;
    g.rect(cx, by + 8, 40, bh - 8).fill(look.trim);
    g.rect(cx + 3, by + 11, 34, 26).fill(shade(look.trim, -0.35));
    g.circle(cx + 12, by + 24, 7).fill(0xc9d1d3);
    g.circle(cx + 28, by + 24, 7).fill(0xc9d1d3);
    g.circle(cx + 12, by + 24, 2).fill(STEEL_DARK);
    g.circle(cx + 28, by + 24, 2).fill(STEEL_DARK);
    g.rect(cx + 4, by + 42, 32, 16).fill(STEEL_DARK);
  }
  // bench with glassware
  const bx = x + (s % 2 === 0 ? 8 : 56);
  const bw = Math.max(40, w - (s % 2 === 0 ? 16 : 64));
  const topY = by + bh * 0.64;
  g.rect(bx + 4, topY + 6, 5, floorY - topY - 6).fill(STEEL_DARK);
  g.rect(bx + bw - 9, topY + 6, 5, floorY - topY - 6).fill(STEEL_DARK);
  g.rect(bx, topY, bw, 7).fill(0xe9e2cc);
  g.rect(bx, topY + 5, bw, 2).fill(shade(look.trim, -0.2));
  const liquids = [look.accent, 0xb18cf2, 0xf2c14e];
  for (let k = 0; k < Math.floor(bw / 22); k++) {
    const fx = bx + 10 + k * 22;
    const c = liquids[k % liquids.length] ?? look.accent;
    if (k % 2 === 0) {
      g.poly([fx - 7, topY, fx + 7, topY, fx + 2, topY - 12, fx + 2, topY - 18, fx - 2, topY - 18, fx - 2, topY - 12]).fill({ color: 0xe6f2f0, alpha: 0.8 });
      g.poly([fx - 6, topY - 1, fx + 6, topY - 1, fx + 3, topY - 7, fx - 3, topY - 7]).fill(c);
    } else {
      g.circle(fx, topY - 7, 6).fill({ color: 0xe6f2f0, alpha: 0.8 });
      g.circle(fx, topY - 6, 4.5).fill(c);
      g.rect(fx - 1.5, topY - 18, 3, 7).fill({ color: 0xe6f2f0, alpha: 0.8 });
    }
  }
}

function geothermalSegment(g: Graphics, look: RoomLook, x: number, by: number, w: number, bh: number, s: number): void {
  const floorY = by + bh;
  const cx = x + w / 2;
  // floor vent grate (glow flickers in DeepLayer)
  g.rect(cx - 34, floorY - 6, 68, 6).fill(0x2a1a10);
  // bore pipe from the rock up into the exchanger
  g.rect(cx - 11, by, 22, bh).fill(0x5d4a3e);
  g.rect(cx - 7, by, 4, bh).fill({ color: 0xc9a07a, alpha: 0.35 });
  for (let y = by + 10; y < floorY; y += 32) g.rect(cx - 15, y, 30, 5).fill(0xb08d5b);
  // heat exchanger box
  g.roundRect(cx - 30, by + bh * 0.3, 60, 38, 5).fill(look.trim);
  g.rect(cx - 26, by + bh * 0.3 + 4, 52, 4).fill(look.accent);
  for (let k = 0; k < 5; k++) g.rect(cx - 24 + k * 10, by + bh * 0.3 + 12, 6, 20).fill(shade(look.trim, -0.4));
  // pressure gauges
  const gx = s % 2 === 0 ? x + w - 14 : x + 14;
  for (let k = 0; k < 2; k++) {
    const gy = by + 18 + k * 22;
    g.circle(gx, gy, 8).fill(0x2b2f33);
    g.circle(gx, gy, 6.5).fill(0xf4ecd8);
    g.rect(gx - 0.75, gy - 5, 1.5, 5).fill(0xc0392b);
  }
  // hot pipe running along the wall
  g.rect(x, by + bh * 0.22, w, 5).fill(shade(look.accent, -0.35));
}

function fungalSegment(g: Graphics, look: RoomLook, x: number, by: number, w: number, bh: number, s: number): void {
  const floorY = by + bh;
  // misting pipe with nozzles along the ceiling
  g.rect(x, by + 6, w, 4).fill(STEEL);
  for (let k = 0; k < 3; k++) g.rect(x + 14 + k * ((w - 28) / 2), by + 10, 3, 5).fill(STEEL_DARK);
  // growing racks, three shelves each
  const racks = 2;
  const rw = (w - 16) / racks - 6;
  const caps = [0xd8e6d0, 0x9cf0c0, 0xb9a7e0, 0xe9d9b6];
  for (let r = 0; r < racks; r++) {
    const rx = x + 8 + r * (rw + 6);
    g.rect(rx, by + 18, 3, floorY - by - 18).fill(WOOD_DARK);
    g.rect(rx + rw - 3, by + 18, 3, floorY - by - 18).fill(WOOD_DARK);
    for (let sh = 0; sh < 3; sh++) {
      const sy = by + 38 + sh * ((bh - 42) / 3);
      g.rect(rx, sy, rw, 4).fill(WOOD);
      g.rect(rx + 3, sy - 3, rw - 6, 3).fill(0x3a2a1c); // compost
      for (let m = 0; m < Math.floor(rw / 11); m++) {
        const mx = rx + 7 + m * 11;
        const tall = 3 + ((m + sh + s) % 3) * 2;
        const c = caps[(m + r + sh) % caps.length] ?? 0xd8e6d0;
        g.rect(mx - 1, sy - 3 - tall, 2, tall).fill(0xe9e2cc);
        g.ellipse(mx, sy - 3 - tall, 4.5, 3).fill(c);
      }
    }
  }
}

function refinerySegment(g: Graphics, look: RoomLook, x: number, by: number, w: number, bh: number, s: number): void {
  const floorY = by + bh;
  if (s === 0) {
    // the furnace, with an arched mouth (the glow is animated)
    const fx = x + 10;
    const fw = Math.min(70, w - 30);
    g.rect(fx, by + 16, fw, bh - 16).fill(0x4a3e36);
    g.rect(fx, by + 16, fw, 6).fill(look.trim);
    for (let y = by + 28; y < floorY; y += 12) for (let k = 0; k < fw / 14; k++) g.rect(fx + k * 14 + ((y / 12) % 2) * 7, y, 12, 1.5).fill(0x3a302a);
    g.roundRect(fx + fw / 2 - 16, floorY - 34, 32, 30, 14).fill(0x1a0e08);
    // extraction hood over the mouth
    g.poly([fx + fw / 2 - 22, floorY - 40, fx + fw / 2 + 22, floorY - 40, fx + fw / 2 + 14, floorY - 48, fx + fw / 2 - 14, floorY - 48]).fill(STEEL_DARK);
    // crucible on a gantry
    const cx = fx + fw + 20;
    g.rect(cx - 14, by + 6, 28, 3).fill(STEEL_DARK);
    g.rect(cx - 1, by + 9, 2, 18).fill(STEEL_DARK);
    g.poly([cx - 12, by + 27, cx + 12, by + 27, cx + 9, by + 46, cx - 9, by + 46]).fill(0x5d6a68);
  } else {
    // ore hopper and a conveyor (ore moves in DeepLayer)
    const hx = x + w / 2;
    g.poly([hx - 30, by + 14, hx + 30, by + 14, hx + 10, by + 50, hx - 10, by + 50]).fill(look.trim);
    g.rect(hx - 30, by + 14, 60, 4).fill(look.accent);
    for (let k = 0; k < 5; k++) g.circle(hx - 18 + k * 9, by + 12, 4).fill(0x6b5a4a);
  }
  // conveyor along the floor
  const cy = floorY - 16;
  g.rect(x, cy, w, 8).fill(STEEL_DARK);
  g.rect(x, cy, w, 2).fill(STEEL);
  for (let k = 0; k < w / 16; k++) g.circle(x + 8 + k * 16, cy + 10, 3).fill(0x5d6a68);
  // ingots stacked by the wall
  if (s === 0 || s === 2) {
    const ix = x + w - 30;
    for (let k = 0; k < 3; k++) g.poly([ix + k * 3, floorY - 20 - k * 5, ix + 20 - k * 3, floorY - 20 - k * 5, ix + 22 - k * 3, floorY - 16 - k * 5, ix - 2 + k * 3, floorY - 16 - k * 5]).fill(k === 2 ? 0xc9a45a : 0x9aa3a2);
  }
}

function aquiferSegment(g: Graphics, look: RoomLook, x: number, by: number, w: number, bh: number, s: number): void {
  const floorY = by + bh;
  const cx = x + w / 2;
  // black pool in a pit
  g.ellipse(cx, floorY - 3, w * 0.36, 6).fill(0x06141a);
  // riveted tank with a sight glass
  const tw = 46;
  const tx = s % 2 === 0 ? x + 12 : x + w - 12 - tw;
  g.roundRect(tx, by + 14, tw, bh - 20, 10).fill(shade(look.trim, 0.1));
  g.rect(tx + tw / 2 - 5, by + 24, 10, bh - 44).fill(0x0d2a33);
  g.rect(tx + tw / 2 - 4, by + 24 + (bh - 44) * 0.35, 8, (bh - 44) * 0.65).fill(look.accent);
  for (let y = by + 22; y < floorY - 10; y += 16) {
    g.circle(tx + 5, y, 1.8).fill(0x9fb4b2);
    g.circle(tx + tw - 5, y, 1.8).fill(0x9fb4b2);
  }
  // pump housing (the piston moves in DeepLayer)
  const px = s % 2 === 0 ? x + w - 40 : x + 16;
  g.rect(px, by + 8, 24, 20).fill(STEEL_DARK);
  g.rect(px + 2, by + 10, 20, 3).fill(look.accent);
  g.rect(px + 9, by + 28, 6, floorY - by - 28).fill({ color: 0x1d2628, alpha: 0.6 });
  // pipe to the pool
  g.rect(x, by + bh * 0.5, w, 6).fill(shade(look.trim, -0.2));
}

// -------------------------------------------------------------------- incidents

/** Draw a deep incident; returns false for other types. */
export function drawDeepIncident(g: Graphics, inc: Incident, r: { x: number; y: number; w: number; h: number }, t: number): boolean {
  const floorY = r.y + r.h - 8;
  switch (inc.type) {
    case 'cavein': {
      const heap = 0.45 + 0.55 * Math.max(0, inc.hp / Math.max(1, inc.maxHp));
      // a haze of dust over everything
      g.rect(r.x + 3, r.y + 3, r.w - 6, r.h - 6).fill({ color: 0xb8a58c, alpha: 0.18 });
      // rubble heaps, bigger while there is more to dig
      const heaps = Math.max(2, Math.round(r.w / 55));
      for (let i = 0; i < heaps; i++) {
        const hx = r.x + 14 + (i + 0.5) * ((r.w - 28) / heaps);
        const hw = 30 + (i % 2) * 12;
        const hh = (34 + (i % 3) * 10) * heap;
        g.poly([hx - hw, floorY + 5, hx - hw * 0.45, floorY - hh, hx + hw * 0.25, floorY - hh * 0.85, hx + hw, floorY + 5]).fill(0x7a6a5a);
        g.poly([hx - hw * 0.7, floorY + 5, hx - hw * 0.25, floorY - hh * 0.62, hx + hw * 0.55, floorY + 5]).fill(0x9a8a76);
        g.poly([hx - 8, floorY - hh * 0.55, hx + 2, floorY - hh * 0.75, hx + 12, floorY - hh * 0.5, hx + 4, floorY - hh * 0.35]).fill(0xc2b29a);
        g.poly([hx - hw, floorY + 5, hx - hw * 0.45, floorY - hh, hx + hw * 0.25, floorY - hh * 0.85, hx + hw, floorY + 5]).stroke({ width: 1.5, color: 0x2a221c });
        g.rect(hx - hw * 0.6, floorY - hh * 0.4, 16, 4).fill(0x5d6a68); // a bent strut in the pile
      }
      // falling rocks, each on its own loop
      for (let i = 0; i < Math.ceil(r.w / 24); i++) {
        const period = 0.8 + (i % 4) * 0.22;
        const p = ((t + i * 0.37) % period) / period;
        const rx = r.x + 14 + ((i * 53) % Math.max(1, r.w - 28));
        const ry = r.y + 12 + p * p * (r.h - 40);
        const sz = 4 + (i % 3) * 2.5;
        g.poly([rx - sz, ry, rx, ry - sz, rx + sz, ry - 1, rx + 1, ry + sz]).fill(0x9a8a78);
      }
      // cracks in the ceiling
      for (const f of [0.28, 0.55, 0.78]) {
        const cx = r.x + r.w * f;
        g.moveTo(cx, r.y + 3).lineTo(cx + 5, r.y + 16).lineTo(cx - 2, r.y + 26).lineTo(cx + 4, r.y + 34).stroke({ width: 2.5, color: 0x14100d });
      }
      // billowing dust
      for (let i = 0; i < 8; i++) {
        const dx = r.x + r.w * (0.08 + i * 0.12) + Math.sin(t * 0.7 + i) * 10;
        const dy = r.y + r.h * 0.5 + Math.cos(t * 0.5 + i * 2) * 16;
        g.circle(dx, dy, 18 + (i % 3) * 9).fill({ color: 0xd8c8b0, alpha: 0.2 });
      }
      beacon(g, r, t, 0xf2a541);
      return true;
    }
    case 'flood': {
      // water rising while it goes unfixed, with a moving surface
      const rise = Math.min(1, 0.45 + inc.roomTime / 40);
      const level = r.y + r.h - 6 - rise * (r.h * 0.62) * (0.55 + 0.45 * Math.max(0, inc.hp / Math.max(1, inc.maxHp)));
      const pts: number[] = [r.x + 3, r.y + r.h - 3];
      for (let x = r.x + 3; x <= r.x + r.w - 3; x += 8) pts.push(x, level + Math.sin(t * 3 + x * 0.06) * 3.5);
      pts.push(r.x + r.w - 3, r.y + r.h - 3);
      g.poly(pts).fill({ color: 0x1a6a8a, alpha: 0.72 });
      g.rect(r.x + 3, level + 8, r.w - 6, r.y + r.h - level - 12).fill({ color: 0x0a3a52, alpha: 0.35 });
      for (let x = r.x + 6; x < r.x + r.w - 10; x += 26) g.rect(x + Math.sin(t * 2 + x) * 4, level + 1 + Math.sin(t * 3 + x * 0.06) * 3, 12, 2).fill({ color: 0xcfeef7, alpha: 0.7 });
      // bubbles
      for (let i = 0; i < Math.ceil(r.w / 30); i++) {
        const p = (t * 0.6 + i * 0.29) % 1;
        const bx = r.x + 14 + ((i * 47) % Math.max(1, r.w - 28));
        g.circle(bx, r.y + r.h - 8 - p * (r.y + r.h - 8 - level), 2.5 + (i % 2)).stroke({ width: 1.2, color: 0xcfeef7, alpha: 0.8 });
      }
      // spray from a burst pipe on the wall
      const sx = r.x + r.w - 26;
      for (let i = 0; i < 10; i++) {
        const p = (t * 1.6 + i / 10) % 1;
        g.circle(sx - p * 40, r.y + 26 + p * p * 60, 2.5).fill({ color: 0x9fd8e8, alpha: 1 - p });
      }
      g.rect(sx, r.y + 18, 20, 8).fill(0x2d4a55);
      g.rect(sx - 3, r.y + 16, 4, 12).fill(0x5d6a68);
      beacon(g, r, t, 0x4fb3e9);
      return true;
    }
    case 'deepcrawlers': {
      // Pale, jointed like a folding ruler, too many legs, faint green eyes.
      const n = Math.max(3, Math.round(r.w / 50));
      const segs = r.w < 200 ? 4 : 6;
      const body = segs * 12 + 10;
      for (let i = 0; i < n; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        const phase = (t * (0.1 + (i % 3) * 0.03) + i * 0.41) % 1;
        // Keep the whole body inside the room: the head leads, the body trails behind it.
        const lo = r.x + 12 + (dir > 0 ? body : 20);
        const hi = r.x + r.w - 12 - (dir > 0 ? 20 : body);
        const cx = lo + (dir > 0 ? phase : 1 - phase) * Math.max(0, hi - lo);
        const onCeiling = i % 3 === 2;
        const baseY = onCeiling ? r.y + 18 : floorY - 2;
        drawCrawler(g, cx, baseY, dir, onCeiling, t + i, segs);
      }
      // a hole they came out of
      g.ellipse(r.x + 14, floorY - 16, 9, 18).fill(0x0a0706);
      g.ellipse(r.x + r.w - 14, r.y + r.h * 0.45, 8, 16).fill(0x0a0706);
      beacon(g, r, t, 0x9cf0c0);
      return true;
    }
  }
  return false;
}

/** A flashing warning lamp on the ceiling of a room with a deep incident. */
function beacon(g: Graphics, r: { x: number; y: number; w: number; h: number }, t: number, color: number): void {
  const on = Math.sin(t * 8) > 0;
  const x = r.x + r.w - 20;
  const y = r.y + 22;
  g.rect(x - 5, y - 8, 10, 4).fill(0x2b2f33);
  g.circle(x, y, 5).fill(on ? 0xff5a3a : 0x5a2418);
  if (on) g.circle(x, y, 14).fill({ color: 0xff5a3a, alpha: 0.25 });
  g.rect(r.x + 3, r.y + 3, r.w - 6, 3).fill({ color, alpha: on ? 0.8 : 0.3 });
}

function drawCrawler(g: Graphics, x: number, y: number, dir: number, flipped: boolean, t: number, segs: number): void {
  const up = flipped ? 1 : -1;
  const len = 12;
  for (let k = 0; k < segs; k++) {
    const sx = x - dir * k * len;
    const sy = y + up * (9 + Math.sin(t * 6 + k) * 2);
    // legs: two thin jointed pairs per segment
    const swing = Math.sin(t * 14 + k * 1.3) * 3;
    for (const side of [-1, 1]) {
      g.moveTo(sx, sy)
        .lineTo(sx + side * 6 + swing, sy + up * -10)
        .lineTo(sx + side * 10 + swing, y)
        .stroke({ width: 1.6, color: 0xcfc9b2 });
    }
    g.roundRect(sx - len / 2 - 1, sy - 5, len + 2, 10, 4).fill(k === 0 ? 0xf0ecdc : 0xe0dac6);
    g.rect(sx - len / 2 + 1, sy - 5, 1.5, 10).fill(0x9a9480);
  }
  // head with feelers and eyes
  const hx = x + dir * 9;
  const hy = y + up * 9;
  g.ellipse(hx, hy, 7, 6).fill(0xf6f2e4);
  g.moveTo(hx, hy).lineTo(hx + dir * 18, hy + up * 12).stroke({ width: 1.3, color: 0xcfc9b2 });
  g.moveTo(hx, hy).lineTo(hx + dir * 20, hy + up * 2).stroke({ width: 1.3, color: 0xcfc9b2 });
  g.circle(hx + dir * 3, hy - 2, 4).fill({ color: 0x9cf0c0, alpha: 0.3 });
  g.circle(hx + dir * 3, hy - 2, 1.8).fill(0x9cf0c0);
  g.circle(hx + dir * 3, hy + 2, 1.4).fill(0x9cf0c0);
}

export const DEEP_INCIDENT_COLORS: Record<string, number> = { cavein: 0xb8a58c, flood: 0x4fb3e9, deepcrawlers: 0xe8e4d0 };

// -------------------------------------------------------------------- per-frame layer

/**
 * The animated half of the Deep: room effects (vent glow, spores, blinking
 * computers, molten metal, pumps, refinery progress) and the dig site with
 * its drill. One Graphics redrawn each frame, like the vault overlay.
 */
export class DeepLayer {
  readonly root = new Container();
  private g = new Graphics();
  private digText = new Text({ text: '', style: { fontFamily: 'Bungee, sans-serif', fontSize: 13, fill: 0xf2c14e, stroke: { color: 0x14100d, width: 4 } } });
  private lastDigText = '';

  constructor(private geo: () => DeepGeometry) {
    this.digText.anchor.set(1, 0.5);
    this.digText.visible = false;
    this.root.addChild(this.g, this.digText);
  }

  update(state: GameState, content: Content, time: number, rectOf: (room: Room) => { x: number; y: number; w: number; h: number }, view: { y0: number; y1: number }): void {
    const g = this.g;
    g.clear();
    const geo = this.geo();
    for (const room of state.rooms) {
      const t = room.type;
      if (t !== 'lab' && t !== 'geothermal' && t !== 'fungalfarm' && t !== 'refinery' && t !== 'aquifer') continue;
      if (!room.powered && content.rooms[t]?.usesPower) continue;
      const r = rectOf(room);
      if (r.y + r.h < view.y0 || r.y > view.y1) continue;
      const bx = r.x + 3 + geo.depthX;
      const by = r.y + 3 + geo.depthY;
      const bw = r.w - 2 * (3 + geo.depthX);
      const bh = r.h - 2 * (3 + geo.depthY);
      const seg = bw / room.segments;
      const burning = state.incidents.some((i) => i.roomId === room.id);
      // An incident stops the work, and its art needs the room to itself.
      if (!burning) for (let s = 0; s < room.segments; s++) roomFx(g, t, bx + seg * s, by, seg, bh, s, time + room.id * 1.7);
      if (t === 'refinery') {
        const p = Math.min(1, room.pool / Math.max(1, refineryBatch(content, room)));
        g.rect(r.x + 6, r.y + r.h - 7, r.w - 12, 3).fill({ color: 0x000000, alpha: 0.35 });
        g.rect(r.x + 6, r.y + r.h - 7, (r.w - 12) * p, 3).fill({ color: 0xc9d1d3, alpha: 0.95 });
      }
    }
    this.drawDig(state, content, time, rectOf, geo);
  }

  private drawDig(state: GameState, content: Content, time: number, rectOf: (room: Room) => { x: number; y: number; w: number; h: number }, geo: DeepGeometry): void {
    const dig = state.deep.dig;
    const shaft = dig ? digShaft(state, content) : null;
    if (!dig) {
      this.digText.visible = false;
      return;
    }
    // The dig runs from the shaft it started at; if that elevator is gone, draw it mid-grid.
    const r = shaft ? rectOf(shaft) : { x: geo.width / 2 - geo.cell / 2, y: geo.surfaceH + (geo.baseFloors + state.deep.strata * geo.floorsPerStratum - 1) * geo.floorH, w: geo.cell, h: geo.floorH };
    const progress = dig.total > 0 ? Math.max(0, Math.min(1, 1 - dig.remaining / dig.total)) : 0;
    const top = r.y + r.h;
    const depth = 40 + progress * (SEAL_H - 50);
    const cx = r.x + r.w / 2;
    const g = this.g;
    // work light spilling into the rock
    g.circle(cx, top + depth - 10, 70).fill({ color: 0xf2a541, alpha: 0.07 });
    g.circle(cx, top + depth - 10, 40).fill({ color: 0xf2a541, alpha: 0.08 });
    // the shaft being cut, lined with timber rings
    g.rect(cx - 20, top, 40, depth).fill(0x080504);
    for (let y = top + 6; y < top + depth - 10; y += 14) {
      g.rect(cx - 22, y, 44, 3).fill(0x6e5334);
      g.rect(cx - 22, y, 3, 8).fill(0x4e3a24);
      g.rect(cx + 19, y, 3, 8).fill(0x4e3a24);
    }
    // cable
    g.rect(cx - 1.5, top - 60, 3, depth + 30).fill(0x1b1b1b);
    // derrick over the shaft mouth, standing in the elevator car
    g.poly([cx - 20, top, cx - 4, top - 68, cx + 4, top - 68, cx + 20, top]).stroke({ width: 3, color: 0xf2a541 });
    for (const y of [top - 22, top - 44]) {
      const half = 20 - ((top - y) / 68) * 16;
      g.rect(cx - half, y, half * 2, 3).fill(0xf2a541);
    }
    g.circle(cx, top - 66, 5).fill(0x3b3f3a);
    // the drill head, spiral bands turning
    const hy = top + depth - 34;
    const bw = 18;
    g.poly([cx - bw, hy, cx + bw, hy, cx, hy + 34]).fill(0x9a9a9a);
    const spin = (time * 3) % 1;
    for (let k = 0; k < 5; k++) {
      const f = (k + spin) / 5;
      const yy = hy + f * 30;
      const half = bw * (1 - f);
      g.poly([cx - half, yy, cx + half, yy - 4, cx + half, yy, cx - half, yy + 4]).fill(0x3b3f3a);
    }
    g.rect(cx - bw - 3, hy - 12, (bw + 3) * 2, 12).fill(0xf2a541);
    g.rect(cx - bw - 3, hy - 12, (bw + 3) * 2, 3).fill(0xffd27f);
    for (let k = 0; k < 4; k++) g.rect(cx - bw + k * 11, hy - 8, 5, 5).fill(0x1b1b1b);
    // debris kicked up around the bit
    for (let i = 0; i < 12; i++) {
      const p = (time * 1.8 + i / 12) % 1;
      const side = i % 2 ? 1 : -1;
      const dx = cx + side * (8 + p * 28);
      const dy = hy + 30 - Math.sin(p * Math.PI) * 34;
      g.rect(dx, dy, 3 + (i % 3), 3).fill({ color: 0xa08c74, alpha: 1 - p });
    }
    g.circle(cx, hy + 26, 24 + Math.sin(time * 5) * 4).fill({ color: 0xc8b8a0, alpha: 0.14 });
    // a work lamp that flashes amber
    const flash = 0.5 + 0.5 * Math.sin(time * 6);
    g.circle(cx + 26, top - 52, 12).fill({ color: 0xf2a541, alpha: 0.15 + 0.2 * flash });
    g.circle(cx + 26, top - 52, 4.5).fill({ color: 0xffd27f, alpha: 0.5 + 0.5 * flash });
    const label = `DIGGING STRATUM ${dig.stratum} · ${Math.floor(progress * 100)}%`;
    if (label !== this.lastDigText) {
      this.digText.text = label;
      this.lastDigText = label;
    }
    this.digText.visible = true;
    this.digText.position.set(cx - 30, top + depth - 20);
  }
}

function roomFx(g: Graphics, type: string, x: number, by: number, w: number, bh: number, s: number, t: number): void {
  const floorY = by + bh;
  switch (type) {
    case 'lab': {
      if (s % 2 === 1) {
        for (let k = 0; k < 12; k++) {
          const on = Math.sin(t * (2 + (k % 5)) + k * 1.9) > 0.2;
          g.rect(x + 15 + (k % 4) * 7, by + 45 + Math.floor(k / 4) * 4, 4, 2).fill(on ? (k % 3 === 0 ? 0xef6f6c : 0x7fe0c0) : 0x1b2224);
        }
      }
      // a bubble in a flask now and then
      const p = (t * 0.8 + s * 0.3) % 1;
      g.circle(x + (s % 2 === 0 ? 18 : 66), by + bh * 0.64 - 8 - p * 14, 1.6).fill({ color: 0xe6f2f0, alpha: 1 - p });
      break;
    }
    case 'geothermal': {
      const cx = x + w / 2;
      const f = 0.55 + 0.25 * Math.sin(t * 7) + 0.15 * Math.sin(t * 13.3);
      g.rect(cx - 32, floorY - 5, 64, 4).fill({ color: 0xff7a1a, alpha: f });
      for (let k = 0; k < 7; k++) g.rect(cx - 30 + k * 10, floorY - 6, 3, 6).fill(0x1a0e08);
      g.ellipse(cx, floorY - 8, 40, 10).fill({ color: 0xff7a1a, alpha: 0.1 * f });
      // steam from the exchanger valve
      for (let k = 0; k < 4; k++) {
        const p = (t * 0.5 + k / 4) % 1;
        g.circle(cx + 26 + p * 10, by + bh * 0.3 - p * 26, 4 + p * 7).fill({ color: 0xf4ecd8, alpha: 0.22 * (1 - p) });
      }
      break;
    }
    case 'fungalfarm': {
      const glow = 0.1 + 0.06 * Math.sin(t * 1.5 + s);
      g.rect(x + 6, by + 16, w - 12, bh - 18).fill({ color: 0x9cf0c0, alpha: glow * 0.5 });
      for (let k = 0; k < 5; k++) {
        const p = (t * 0.12 + k / 5 + s * 0.13) % 1;
        g.circle(x + 10 + ((k * 37 + s * 11) % Math.max(1, w - 20)) + Math.sin(t + k) * 4, floorY - 10 - p * (bh - 20), 1.4).fill({ color: 0xd8f5e4, alpha: 0.7 * (1 - p) });
      }
      break;
    }
    case 'refinery': {
      if (s === 0) {
        const fw = Math.min(70, w - 30);
        const mx = x + 10 + fw / 2;
        const f = 0.7 + 0.2 * Math.sin(t * 9) + 0.1 * Math.sin(t * 17);
        g.roundRect(mx - 13, floorY - 31, 26, 24, 11).fill({ color: 0xff8a2a, alpha: f });
        g.roundRect(mx - 8, floorY - 22, 16, 15, 7).fill({ color: 0xffd23f, alpha: f });
        g.ellipse(mx, floorY - 10, 36, 14).fill({ color: 0xff7a1a, alpha: 0.12 });
        // the crucible glows and drips
        const cx = x + 10 + fw + 20;
        g.poly([cx - 9, by + 30, cx + 9, by + 30, cx + 7, by + 42, cx - 7, by + 42]).fill({ color: 0xffa23a, alpha: f });
        const p = (t * 1.2) % 1;
        g.circle(cx, by + 46 + p * 30, 2).fill({ color: 0xffd23f, alpha: 1 - p });
        for (let k = 0; k < 3; k++) {
          const sp = (t * 2 + k / 3) % 1;
          g.rect(mx + (k - 1) * 8 + sp * (k - 1) * 10, floorY - 34 - sp * 20, 2, 2).fill({ color: 0xffd23f, alpha: 1 - sp });
        }
      }
      // ore riding the belt
      const cy = floorY - 16;
      for (let k = 0; k < Math.floor(w / 30); k++) {
        const ox = x + ((t * 18 + k * 30) % w);
        g.poly([ox, cy, ox + 4, cy - 5, ox + 9, cy - 4, ox + 10, cy]).fill(k % 3 === 0 ? 0x9a8a6a : 0x6b5a4a);
      }
      break;
    }
    case 'aquifer': {
      const px = s % 2 === 0 ? x + w - 40 : x + 16;
      const stroke = (Math.sin(t * 2.4) + 1) / 2;
      g.rect(px + 10, by + 28, 4, 12 + stroke * 30).fill(0x9fb4b2);
      g.rect(px + 6, by + 38 + stroke * 30, 12, 5).fill(0x5d6a68);
      const cx = x + w / 2;
      const rip = (t * 0.7) % 1;
      g.ellipse(cx, floorY - 3, w * 0.1 + rip * w * 0.24, 2 + rip * 3).stroke({ width: 1, color: 0x6fb7c9, alpha: 0.6 * (1 - rip) });
      break;
    }
  }
}

/** Key for what the deep background and room frames depend on. */
export function deepViewKey(state: GameState, braced: boolean): string {
  return `${state.deep.strata}|${braced ? 1 : 0}`;
}

/** Ceiling lamp colour for a room (colder and stranger with depth). */
export function lampFor(content: Content, room: Room): number {
  return isDeepFloor(content, room.floor) ? stratumLook(stratumOf(content, room.floor)).lamp : LAMP;
}

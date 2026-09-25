// M7 Topside: surface buildings drawn as open-air structures standing on the
// ground above the door, their moving parts (turbine rotors, the mast's beacon,
// the watchtower's searchlight, trading flags), and the weather over the
// surface (dust haze, taint storms, heatwave shimmer). Static structures are
// drawn once per layout into the room's Graphics; the animated bits and the
// weather are redrawn every frame, only while the surface is on screen.

import { Container, Graphics } from 'pixi.js';
import type { WeatherKind } from '../../sim';
import { shade } from './palette';

/** Height of the ground crust at the bottom of the topside row (the row's floor is the crust's top). */
export const GROUND_DEPTH = 40;

const WOOD = 0x8a6a45;
const WOOD_DARK = 0x5e452c;
const STEEL = 0x8a9593;
const STEEL_DARK = 0x2b2f33;
const CANVAS = 0xe9d9b6;
const CONCRETE = 0x9a948a;
const RUST = 0xa0522d;

/** A moving part of a building, in the room's local coordinates. */
export type TopsidePart =
  | { kind: 'rotor'; x: number; y: number; r: number }
  | { kind: 'beacon'; x: number; y: number; waves: boolean }
  | { kind: 'beam'; x: number; y: number }
  | { kind: 'flag'; x: number; y: number; color: number }
  | { kind: 'glint'; x: number; y: number; w: number; h: number }
  | { kind: 'drip'; x: number; y: number; len: number };

/**
 * Draw a surface building at (0,0) of its row rectangle (w x h). The ground is
 * at h - GROUND_DEPTH; structures stand on it and may rise above the row.
 * Returns the parts that move.
 */
export function drawTopsideBuilding(g: Graphics, type: string, w: number, h: number, level: number, segments: number): TopsidePart[] {
  const gy = h - GROUND_DEPTH;
  const parts: TopsidePart[] = [];
  // A packed-earth pad and a shadow tie the building to the ground.
  g.rect(2, gy - 2, w - 4, 8).fill(shade(0x8a6a45, -0.2));
  g.rect(2, gy + 6, w - 4, 3).fill({ color: 0x000000, alpha: 0.18 });
  switch (type) {
    case 'solar_array':
      for (let s = 0; s < segments; s++) solar(g, parts, s * (w / segments), gy, w / segments, level);
      break;
    case 'wind_turbine':
      for (let s = 0; s < segments; s++) turbine(g, parts, s * (w / segments), gy, w / segments, level);
      break;
    case 'rain_catcher':
      for (let s = 0; s < segments; s++) rainCatcher(g, parts, s * (w / segments), gy, w / segments, level);
      break;
    case 'farm_plots':
      for (let s = 0; s < segments; s++) farm(g, s * (w / segments), gy, w / segments, level, s);
      break;
    case 'watchtower':
      watchtower(g, parts, w, gy, level);
      break;
    case 'trading_post':
      tradingPost(g, parts, w, gy, level);
      break;
    case 'signal_mast':
      signalMast(g, parts, w, gy, level);
      break;
    default:
      shack(g, w / 2, gy, 0x9b7447);
  }
  // Level pips on a little post at the left.
  for (let l = 0; l < level; l++) g.rect(6 + l * 8, gy - 6, 6, 3).fill(0xf2a541);
  return parts;
}

// ------------------------------------------------------------------ buildings

function solar(g: Graphics, parts: TopsidePart[], x0: number, gy: number, w: number, level: number): void {
  const racks = level >= 2 ? 3 : 2;
  const rw = (w - 20) / racks;
  for (let i = 0; i < racks; i++) {
    const x = x0 + 10 + i * rw;
    const pw = rw - 8;
    const top = gy - 62 - (i % 2) * 6;
    const bottom = gy - 26;
    // legs
    g.rect(x + 6, bottom, 3, gy - bottom).fill(STEEL_DARK);
    g.rect(x + pw - 9, top + 18, 3, gy - top - 18).fill(STEEL_DARK);
    g.poly([x + 8, gy, x + pw - 8, top + 22, x + pw - 6, top + 24, x + 10, gy]).fill(shade(STEEL_DARK, 0.2));
    // tilted panel: bottom edge forward, top leaning back to the right
    const panel = [x, bottom, x + pw - 10, bottom, x + pw, top, x + 10, top];
    g.poly(panel).fill(0x23456b);
    g.poly(panel).stroke({ width: 2, color: level >= 3 ? 0xf2c14e : 0xc9d1d3 });
    // cell grid
    for (let c = 1; c < 4; c++) {
      const t = c / 4;
      g.moveTo(x + (pw - 10) * t, bottom).lineTo(x + 10 + (pw - 10) * t, top).stroke({ width: 1, color: 0x5d8fc2, alpha: 0.8 });
    }
    for (let r = 1; r < 3; r++) {
      const t = r / 3;
      const yy = bottom + (top - bottom) * t;
      g.moveTo(x + 10 * t, yy).lineTo(x + pw - 10 + 10 * t, yy).stroke({ width: 1, color: 0x5d8fc2, alpha: 0.8 });
    }
    parts.push({ kind: 'glint', x: x + 4, y: top + 4, w: pw - 8, h: bottom - top - 8 });
  }
  // battery cabinet with a charge lamp
  const bx = x0 + w - 26;
  g.rect(bx, gy - 22, 18, 22).fill(0xd8d2c4);
  g.rect(bx, gy - 22, 18, 3).fill(0x8c7a4a);
  g.circle(bx + 9, gy - 12, 3).fill(0x8fc93a);
}

function turbine(g: Graphics, parts: TopsidePart[], x0: number, gy: number, w: number, level: number): void {
  const main = (cx: number, height: number, r: number) => {
    const top = gy - height;
    // guy wires
    g.moveTo(cx, top + 20).lineTo(cx - 34, gy).stroke({ width: 1, color: STEEL_DARK, alpha: 0.6 });
    g.moveTo(cx, top + 20).lineTo(cx + 34, gy).stroke({ width: 1, color: STEEL_DARK, alpha: 0.6 });
    // tapered tower with a red band
    g.poly([cx - 6, gy, cx + 6, gy, cx + 2.5, top, cx - 2.5, top]).fill(0xe0dace);
    g.poly([cx - 5, gy - height * 0.35, cx + 5, gy - height * 0.35, cx + 4.4, gy - height * 0.42, cx - 4.4, gy - height * 0.42]).fill(0xd9645b);
    g.rect(cx - 10, gy - 6, 20, 6).fill(CONCRETE);
    // nacelle
    g.roundRect(cx - 7, top - 5, 18, 10, 3).fill(0xc9c2b2);
    g.poly([cx + 11, top - 3, cx + 20, top, cx + 11, top + 3]).fill(0x9b958a);
    parts.push({ kind: 'rotor', x: cx - 7, y: top, r });
  };
  main(x0 + w / 2, 104 + (level - 1) * 10, 30 + (level - 1) * 3);
  if (level >= 3) main(x0 + 20, 70, 20);
}

function rainCatcher(g: Graphics, parts: TopsidePart[], x0: number, gy: number, w: number, level: number): void {
  const cx = x0 + w / 2;
  // cistern tank with hoops and a gauge
  const tw = 54;
  const th = 44;
  g.roundRect(cx - tw / 2, gy - th, tw, th, 8).fill(0x4f8c95);
  g.rect(cx - tw / 2, gy - th + 10, tw, 3).fill(shade(0x4f8c95, -0.3));
  g.rect(cx - tw / 2, gy - 12, tw, 3).fill(shade(0x4f8c95, -0.3));
  g.rect(cx + tw / 2 - 10, gy - th + 16, 5, 22).fill(0x14100d);
  g.rect(cx + tw / 2 - 9, gy - th + 26, 3, 11).fill(0x4fb3e9);
  g.rect(cx - 6, gy - 8, 12, 8).fill(STEEL_DARK); // tap
  // funnel sails on poles, feeding the tank
  const funnels = level >= 2 ? [cx - 30, cx + 30] : [cx];
  if (level >= 3) funnels.push(cx);
  funnels.forEach((fx, i) => {
    const top = gy - th - 44 - (i === 2 ? 14 : 0);
    const fw = i === 2 ? 30 : 40;
    g.rect(fx - fw / 2, top, 2, gy - th - top).fill(WOOD_DARK);
    g.rect(fx + fw / 2 - 2, top, 2, gy - th - top).fill(WOOD_DARK);
    g.poly([fx - fw / 2 - 4, top, fx + fw / 2 + 4, top, fx + 3, top + 26, fx - 3, top + 26]).fill(CANVAS);
    g.poly([fx - fw / 2 - 4, top, fx + fw / 2 + 4, top, fx + fw / 2, top + 5, fx - fw / 2, top + 5]).fill(shade(CANVAS, -0.2));
    g.rect(fx - 2, top + 26, 4, gy - th - top - 26).fill(STEEL);
    parts.push({ kind: 'drip', x: fx, y: top + 28, len: gy - th - top - 28 });
  });
  // spare barrels
  for (let k = 0; k < 2; k++) {
    const bx = x0 + 8 + k * 16;
    g.roundRect(bx, gy - 18, 13, 18, 3).fill(k ? 0x5d6b3a : RUST);
    g.rect(bx, gy - 13, 13, 2).fill(0x14100d);
  }
}

function farm(g: Graphics, x0: number, gy: number, w: number, level: number, seg: number): void {
  // fence posts and a rail
  g.rect(x0 + 4, gy - 22, 3, 22).fill(WOOD_DARK);
  g.rect(x0 + w - 7, gy - 22, 3, 22).fill(WOOD_DARK);
  g.rect(x0 + 4, gy - 18, w - 8, 2).fill(WOOD);
  // two raised beds with crops
  const bw = (w - 24) / 2;
  for (let b = 0; b < 2; b++) {
    const bx = x0 + 10 + b * (bw + 4);
    g.rect(bx, gy - 12, bw, 12).fill(WOOD);
    g.rect(bx + 2, gy - 12, bw - 4, 4).fill(0x4a3220);
    const corn = (seg + b) % 2 === 0;
    const n = Math.floor(bw / 10);
    for (let i = 0; i < n; i++) {
      const px = bx + 6 + i * ((bw - 12) / Math.max(1, n - 1));
      if (corn) {
        g.rect(px - 1, gy - 38, 2, 26).fill(0x5d8a3a);
        g.poly([px, gy - 28, px - 8, gy - 34, px - 1, gy - 30]).fill(0x7aa05a);
        g.poly([px, gy - 22, px + 8, gy - 28, px + 1, gy - 24]).fill(0x7aa05a);
        g.roundRect(px + 1, gy - 36, 4, 9, 2).fill(0xf2c14e);
      } else {
        g.circle(px, gy - 16, 5).fill(0x6f9a45);
        g.circle(px - 3, gy - 19, 3.5).fill(0x8fc93a);
        g.circle(px + 3, gy - 18, 3).fill(0x8fc93a);
      }
    }
  }
  // cold-frame hoops at the showcase level
  if (level >= 3) {
    for (let k = 0; k < 3; k++) {
      const hx = x0 + 18 + k * ((w - 36) / 2);
      g.moveTo(hx - 16, gy - 12).quadraticCurveTo(hx, gy - 52, hx + 16, gy - 12).stroke({ width: 2, color: 0xc9d1d3, alpha: 0.8 });
    }
    g.rect(x0 + 6, gy - 44, w - 12, 30).fill({ color: 0xdff4ff, alpha: 0.12 });
  }
  // a scarecrow on the first plot, a water butt on upgraded ones
  if (seg === 0) {
    const sx = x0 + w - 22;
    g.rect(sx - 1, gy - 58, 3, 46).fill(WOOD_DARK);
    g.rect(sx - 14, gy - 46, 30, 3).fill(WOOD_DARK);
    g.roundRect(sx - 8, gy - 46, 17, 20, 3).fill(0xb5562f);
    g.circle(sx, gy - 52, 6).fill(CANVAS);
    g.poly([sx - 10, gy - 55, sx + 10, gy - 55, sx + 4, gy - 64, sx - 4, gy - 64]).fill(0x8c7a4a);
  } else if (level >= 2) {
    g.roundRect(x0 + w - 20, gy - 20, 12, 20, 3).fill(0x4f8c95);
  }
}

function watchtower(g: Graphics, parts: TopsidePart[], w: number, gy: number, level: number): void {
  const cx = w / 2;
  const deck = gy - 86 - (level - 1) * 10;
  const metal = level >= 3;
  const leg = metal ? 0x6f7b7a : WOOD_DARK;
  const spread = 34;
  // splayed legs and cross bracing
  g.poly([cx - spread - 4, gy, cx - spread + 4, gy, cx - 22, deck, cx - 28, deck]).fill(leg);
  g.poly([cx + spread - 4, gy, cx + spread + 4, gy, cx + 28, deck, cx + 22, deck]).fill(leg);
  for (let k = 0; k < 3; k++) {
    const y1 = gy - (k * (gy - deck)) / 3;
    const y2 = gy - ((k + 1) * (gy - deck)) / 3;
    const off1 = spread - ((spread - 25) * k) / 3;
    const off2 = spread - ((spread - 25) * (k + 1)) / 3;
    g.moveTo(cx - off1, y1).lineTo(cx + off2, y2).stroke({ width: 2, color: leg });
    g.moveTo(cx + off1, y1).lineTo(cx - off2, y2).stroke({ width: 2, color: leg });
  }
  // ladder
  g.rect(cx + 8, deck, 2, gy - deck).fill(WOOD);
  g.rect(cx + 18, deck, 2, gy - deck).fill(WOOD);
  for (let y = deck + 8; y < gy; y += 9) g.rect(cx + 8, y, 12, 2).fill(WOOD);
  // deck, rail and hut
  g.rect(cx - 40, deck - 4, 80, 6).fill(metal ? STEEL_DARK : WOOD);
  g.rect(cx - 40, deck - 18, 3, 14).fill(leg);
  g.rect(cx + 37, deck - 18, 3, 14).fill(leg);
  g.rect(cx - 40, deck - 18, 80, 2).fill(leg);
  g.rect(cx - 22, deck - 34, 44, 30).fill(metal ? 0x5d6a68 : 0x9b7447);
  g.rect(cx - 16, deck - 28, 32, 10).fill(0x1b2224); // lookout slot
  g.poly([cx - 30, deck - 34, cx, deck - 52, cx + 30, deck - 34]).fill(metal ? 0x3d4746 : 0x6a4f30);
  // pennant pole
  g.rect(cx - 1, deck - 70, 2, 20).fill(STEEL_DARK);
  parts.push({ kind: 'flag', x: cx + 1, y: deck - 70, color: 0xf2a541 });
  // searchlight on the rail
  g.roundRect(cx + 24, deck - 26, 12, 9, 3).fill(STEEL_DARK);
  parts.push({ kind: 'beam', x: cx + 36, y: deck - 22 });
}

function tradingPost(g: Graphics, parts: TopsidePart[], w: number, gy: number, level: number): void {
  const stalls = level >= 2 ? 3 : 2;
  const colours = [0xd9645b, 0x4fb3a9, 0xf2c14e];
  const sw = (w - 70) / stalls;
  for (let i = 0; i < stalls; i++) {
    const x = 40 + i * sw;
    const c = colours[i % colours.length] as number;
    const top = gy - 70;
    // posts
    g.rect(x + 2, top, 4, gy - top).fill(WOOD_DARK);
    g.rect(x + sw - 10, top, 4, gy - top).fill(WOOD_DARK);
    // striped awning with a scalloped edge
    const stripes = 6;
    const aw = sw - 4;
    for (let k = 0; k < stripes; k++) {
      const sx = x + (aw / stripes) * k;
      g.poly([sx, top, sx + aw / stripes, top, sx + aw / stripes + 3, top + 16, sx + 3, top + 16]).fill(k % 2 ? CANVAS : c);
      g.circle(sx + 3 + aw / stripes / 2, top + 16, aw / stripes / 2).fill(k % 2 ? CANVAS : c);
    }
    // counter and goods
    const cy = gy - 26;
    g.rect(x, cy, sw - 4, 26).fill(WOOD);
    g.rect(x, cy, sw - 4, 3).fill(shade(WOOD, 0.25));
    g.rect(x + 4, cy + 8, sw - 12, 2).fill(WOOD_DARK);
    const goods = [
      () => {
        for (let k = 0; k < 4; k++) g.roundRect(x + 8 + k * 9, cy - 10, 7, 10, 2).fill(k % 2 ? 0x7fb7c9 : 0xc9d1d3);
      },
      () => {
        g.rect(x + 8, cy - 14, 16, 14).fill(0x9b7447);
        g.rect(x + 8, cy - 14, 16, 2).fill(0x6a4f30);
        g.circle(x + 34, cy - 6, 6).fill(0xe4572e);
        g.circle(x + 44, cy - 5, 5).fill(0x8fc93a);
      },
      () => {
        g.rect(x + 8, cy - 6, 26, 6).fill(STEEL_DARK);
        g.rect(x + 12, cy - 12, 6, 6).fill(0xf2a541);
        g.rect(x + 24, cy - 11, 8, 5).fill(0x7fe0c0);
      },
    ];
    goods[i % goods.length]?.();
    // hanging lamp
    g.rect(x + sw / 2 - 1, top + 16, 2, 8).fill(STEEL_DARK);
    g.circle(x + sw / 2, top + 27, 4).fill(0xffe3a3);
  }
  // signboard with a pair of scales
  g.rect(8, gy - 64, 4, 64).fill(WOOD_DARK);
  g.rect(30, gy - 64, 4, 64).fill(WOOD_DARK);
  g.rect(4, gy - 82, 34, 22).fill(0x6a4f30);
  g.rect(6, gy - 80, 30, 18).fill(0xe9d9b6);
  g.rect(20, gy - 78, 2, 14).fill(0x14100d);
  g.rect(12, gy - 76, 18, 2).fill(0x14100d);
  g.poly([10, gy - 70, 16, gy - 70, 13, gy - 75]).fill(0x14100d);
  g.poly([26, gy - 70, 32, gy - 70, 29, gy - 75]).fill(0x14100d);
  // flagpole at the right end
  g.rect(w - 18, gy - 110, 3, 110).fill(STEEL_DARK);
  parts.push({ kind: 'flag', x: w - 15, y: gy - 110, color: 0xd9645b });
  // a handcart by the stalls
  const kx = w - 60;
  g.rect(kx, gy - 20, 30, 12).fill(WOOD);
  g.rect(kx + 28, gy - 18, 14, 2).fill(WOOD_DARK);
  g.circle(kx + 8, gy - 6, 6).stroke({ width: 2, color: STEEL_DARK });
  g.circle(kx + 22, gy - 6, 6).stroke({ width: 2, color: STEEL_DARK });
  g.rect(kx + 3, gy - 28, 12, 8).fill(0x9b7447);
  if (level >= 3) {
    // an exchange board: a tin roof over everything
    g.poly([34, gy - 88, w - 24, gy - 88, w - 30, gy - 80, 40, gy - 80]).fill(0x7b8784);
  }
}

function signalMast(g: Graphics, parts: TopsidePart[], w: number, gy: number, level: number): void {
  const cx = w / 2 + 14;
  const height = 150 + (level - 1) * 22;
  const top = gy - height;
  const base = 22;
  // lattice: two legs converging, zig-zag bracing
  g.poly([cx - base, gy, cx - base + 4, gy, cx + 2, top, cx - 2, top]).fill(0xb5562f);
  g.poly([cx + base - 4, gy, cx + base, gy, cx + 2, top, cx - 2, top]).fill(0xb5562f);
  const steps = 9 + level * 2;
  for (let k = 0; k < steps; k++) {
    const y1 = gy - (k * height) / steps;
    const y2 = gy - ((k + 1) * height) / steps;
    const o1 = base * (1 - k / steps);
    const o2 = base * (1 - (k + 1) / steps);
    g.moveTo(cx - o1, y1).lineTo(cx + o2, y2).stroke({ width: 1.5, color: k % 2 ? 0xe9d9b6 : 0xb5562f });
    g.moveTo(cx - o2, y2).lineTo(cx + o2, y2).stroke({ width: 1, color: 0xb5562f });
  }
  // dishes
  const dish = (dy: number, left: boolean, size: number) => {
    const y = gy - dy;
    const dx = left ? cx - 10 : cx + 10;
    g.rect(left ? dx - 4 : dx, y - 1, 6, 2).fill(STEEL_DARK);
    g.ellipse(left ? dx - 8 : dx + 8, y, size * 0.35, size).fill(0xd8d2c4);
    g.ellipse(left ? dx - 7 : dx + 7, y, size * 0.2, size * 0.8).fill(0xb9b19c);
  };
  dish(height * 0.55, true, 12);
  if (level >= 2) dish(height * 0.75, false, 10);
  if (level >= 3) {
    for (let k = -1; k <= 1; k += 2) g.rect(cx + k * 8 - 1, top + 10, 2, 18).fill(STEEL_DARK);
    g.rect(cx - 9, top + 18, 18, 2).fill(STEEL_DARK);
  }
  // whip antenna
  g.rect(cx - 1, top - 24, 2, 24).fill(STEEL_DARK);
  parts.push({ kind: 'beacon', x: cx, y: top - 26, waves: true });
  // radio shed at the foot
  const sx = 10;
  g.rect(sx, gy - 34, 40, 34).fill(0xd3c4a2);
  g.poly([sx - 4, gy - 34, sx + 44, gy - 34, sx + 40, gy - 42, sx, gy - 42]).fill(0x6a5a44);
  g.rect(sx + 6, gy - 22, 10, 22).fill(0x5e452c);
  g.rect(sx + 22, gy - 26, 12, 8).fill(0x7fe0c0);
  // cable from shed to mast
  g.moveTo(sx + 40, gy - 30).quadraticCurveTo(cx - 20, gy - 14, cx - 6, gy - 40).stroke({ width: 1.5, color: STEEL_DARK });
}

function shack(g: Graphics, cx: number, gy: number, color: number): void {
  g.rect(cx - 30, gy - 40, 60, 40).fill(color);
  g.poly([cx - 36, gy - 40, cx, gy - 60, cx + 36, gy - 40]).fill(shade(color, -0.3));
  g.rect(cx - 8, gy - 24, 16, 24).fill(shade(color, -0.45));
}

// ------------------------------------------------------------------ moving parts

/** Draw a building's moving parts at a time, offset to the room's world position. */
export function drawTopsideParts(g: Graphics, parts: TopsidePart[], ox: number, oy: number, t: number, weather: WeatherKind, powered: boolean, seed: number): void {
  const windy = weather === 'dust' ? 2.2 : weather === 'taintstorm' ? 1.7 : weather === 'heatwave' ? 0.5 : 1;
  for (const p of parts) {
    const x = ox + p.x;
    const y = oy + p.y;
    switch (p.kind) {
      case 'rotor': {
        const a0 = t * 2.4 * windy + seed;
        for (let k = 0; k < 3; k++) {
          const a = a0 + (k * Math.PI * 2) / 3;
          const tx = x + Math.cos(a) * p.r;
          const ty = y + Math.sin(a) * p.r;
          const nx = Math.cos(a + Math.PI / 2) * 3.5;
          const ny = Math.sin(a + Math.PI / 2) * 3.5;
          g.poly([x + nx, y + ny, tx + nx * 0.3, ty + ny * 0.3, tx - nx * 0.3, ty - ny * 0.3, x - nx * 0.6, y - ny * 0.6]).fill(0xf4ecd8);
        }
        g.circle(x, y, 4).fill(0x9b958a);
        break;
      }
      case 'beacon': {
        const on = powered && Math.sin(t * 3.2 + seed) > 0.2;
        g.circle(x, y, 4).fill(on ? 0xff4a3a : 0x5a2418);
        if (on) g.circle(x, y, 10).fill({ color: 0xff4a3a, alpha: 0.25 });
        if (p.waves && powered) {
          for (let k = 0; k < 3; k++) {
            const ph = (t * 0.6 + k / 3) % 1;
            const r = 12 + ph * 60;
            g.moveTo(x + Math.cos(-Math.PI * 0.85) * r, y + Math.sin(-Math.PI * 0.85) * r).arc(x, y, r, -Math.PI * 0.85, -Math.PI * 0.15).stroke({ width: 2, color: 0x7fe0c0, alpha: 0.55 * (1 - ph) });
          }
        }
        break;
      }
      case 'beam': {
        const a = Math.sin(t * 0.7 + seed) * 0.35 + 0.15;
        const len = 170;
        const spread = 0.09;
        g.poly([x, y, x + Math.cos(a - spread) * len, y + Math.sin(a - spread) * len, x + Math.cos(a + spread) * len, y + Math.sin(a + spread) * len]).fill({ color: 0xfff1b0, alpha: powered ? 0.16 : 0.05 });
        g.circle(x, y, 3).fill(0xfff1b0);
        break;
      }
      case 'flag': {
        const flap = t * 6 * windy + seed;
        const len = 18 + (windy > 1.5 ? 4 : 0);
        const pts: number[] = [x, y];
        for (let k = 1; k <= 4; k++) pts.push(x + (len * k) / 4, y + Math.sin(flap + k) * 2 * (k / 4) + (windy < 1 ? k * 1.5 : 0));
        for (let k = 4; k >= 1; k--) pts.push(x + (len * k) / 4, y + 10 + Math.sin(flap + k) * 2 * (k / 4) + (windy < 1 ? k * 1.5 : 0));
        pts.push(x, y + 10);
        g.poly(pts).fill(p.color);
        break;
      }
      case 'glint': {
        if (weather === 'dust' || weather === 'taintstorm') break;
        const ph = (t * 0.25 + seed * 0.13) % 1;
        const gx = x + ph * p.w;
        g.poly([gx, y + p.h, gx + 6, y + p.h, gx + 14, y, gx + 8, y]).fill({ color: 0xffffff, alpha: weather === 'heatwave' ? 0.4 : 0.22 });
        break;
      }
      case 'drip': {
        if (weather === 'heatwave' || weather === 'dust') break;
        const fast = weather === 'taintstorm' ? 2.5 : 0.8;
        for (let k = 0; k < 2; k++) {
          const ph = (t * fast + k * 0.5 + seed * 0.1) % 1;
          g.rect(x - 1, y + ph * p.len, 2, 4).fill({ color: weather === 'taintstorm' ? 0xa8e05a : 0x7fd0ff, alpha: 0.85 });
        }
        break;
      }
    }
  }
}

// ------------------------------------------------------------------ weather

export interface SkyBounds {
  x0: number;
  x1: number;
  /** Top of the sky to draw (the camera's top edge, clamped). */
  y0: number;
  /** The ground line (top of the crust). */
  ground: number;
}

function h32(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d) >>> 0;
  x ^= x >>> 12;
  return x >>> 0;
}
const rnd = (n: number) => (h32(n) % 10000) / 10000;

/**
 * Weather over the surface: a tint behind the buildings (`back`) and haze,
 * particles and flashes in front of them (`front`). Changing weather
 * cross-fades over a few seconds.
 */
export class WeatherLayer {
  readonly back = new Graphics();
  readonly front = new Graphics();
  private kind: WeatherKind | null = null;
  private prev: WeatherKind | null = null;
  private fade = 1;
  /** Next lightning strike, and the one showing. */
  private nextBolt = 3;
  private bolt: { t: number; x: number; seed: number } | null = null;

  constructor() {
    this.back.eventMode = 'none';
    this.front.eventMode = 'none';
  }

  /** Lightning is flashing right now (for the HUD chip flicker). */
  get flashing(): boolean {
    return this.bolt !== null;
  }

  update(kind: WeatherKind, t: number, dt: number, b: SkyBounds, visible: boolean): void {
    if (kind !== this.kind) {
      this.prev = this.kind;
      this.kind = kind;
      this.fade = this.prev === null ? 1 : 0;
    }
    this.fade = Math.min(1, this.fade + dt / 3);
    this.back.clear();
    this.front.clear();
    if (!visible) return;
    if (this.prev && this.fade < 1) this.draw(this.prev, t, dt, b, 1 - this.fade);
    this.draw(kind, t, dt, b, this.fade);
  }

  private draw(kind: WeatherKind, t: number, dt: number, b: SkyBounds, a: number): void {
    const back = this.back;
    const front = this.front;
    const w = b.x1 - b.x0;
    const skyH = b.ground - b.y0;
    if (skyH <= 0) return;
    switch (kind) {
      case 'clear': {
        // A soft sun and a few slow clouds.
        const sx = b.x0 + w * 0.78;
        const sy = b.ground - 330;
        back.circle(sx, sy, 60).fill({ color: 0xfff1c4, alpha: 0.18 * a });
        back.circle(sx, sy, 30).fill({ color: 0xfff6dc, alpha: 0.85 * a });
        for (let i = 0; i < 5; i++) {
          const cx = b.x0 + ((rnd(i * 7) * w + t * (6 + i * 2)) % (w + 300)) - 150;
          const cy = b.ground - 200 - rnd(i * 11) * 260;
          if (cy < b.y0 - 40) continue;
          const s = 0.7 + rnd(i * 3) * 0.8;
          back.ellipse(cx, cy, 60 * s, 14 * s).fill({ color: 0xffffff, alpha: 0.35 * a });
          back.ellipse(cx + 22 * s, cy - 8 * s, 30 * s, 12 * s).fill({ color: 0xffffff, alpha: 0.3 * a });
        }
        break;
      }
      case 'dust': {
        // Brown sky, a thick band of haze at ground level, grit blowing sideways.
        back.rect(b.x0, b.y0, w, skyH).fill({ color: 0xa47a42, alpha: 0.66 * a });
        back.rect(b.x0, b.ground - 200, w, 200).fill({ color: 0xc9a46a, alpha: 0.4 * a });
        const sx = b.x0 + w * 0.7;
        back.circle(sx, b.ground - 300, 26).fill({ color: 0xf0d8a8, alpha: 0.35 * a });
        front.rect(b.x0, b.ground - 150, w, 160).fill({ color: 0xc9a46a, alpha: 0.26 * a });
        front.rect(b.x0, b.ground - 60, w, 70).fill({ color: 0xb8925a, alpha: 0.16 * a });
        for (let i = 0; i < 90; i++) {
          const speed = 220 + rnd(i) * 260;
          const px = b.x0 + ((rnd(i * 13) * w + t * speed) % w);
          const py = b.ground + 6 - Math.pow(rnd(i * 17), 1.6) * Math.min(skyH, 380) + Math.sin(t * 3 + i) * 4;
          if (py < b.y0) continue;
          const len = 10 + rnd(i * 5) * 26;
          front.rect(px, py, len, 1.5 + rnd(i * 19) * 1.5).fill({ color: i % 3 ? 0xd9b77a : 0x8a6a45, alpha: (0.35 + rnd(i * 23) * 0.4) * a });
        }
        // tumbling clumps
        for (let i = 0; i < 4; i++) {
          const px = b.x0 + ((rnd(i * 91) * w + t * 140) % w);
          const py = b.ground - 6 - Math.abs(Math.sin(t * 4 + i)) * 12;
          front.circle(px, py, 5).stroke({ width: 1.5, color: 0x6a4f30, alpha: 0.8 * a });
        }
        break;
      }
      case 'taintstorm': {
        // Sickly green sky, bruised cloud banks, green rain and lightning.
        back.rect(b.x0, b.y0, w, skyH).fill({ color: 0x3f6a22, alpha: 0.62 * a });
        for (let i = 0; i < 6; i++) {
          const cx = b.x0 + ((rnd(i * 29) * w + t * 22) % (w + 400)) - 200;
          const cy = b.ground - 250 - rnd(i * 31) * 200;
          if (cy < b.y0 - 60) continue;
          back.ellipse(cx, cy, 140, 30).fill({ color: 0x1f3314, alpha: 0.55 * a });
          back.ellipse(cx + 60, cy + 12, 90, 22).fill({ color: 0x2c4a1a, alpha: 0.5 * a });
        }
        const rainTop = Math.max(b.y0, b.ground - 500);
        for (let i = 0; i < 110; i++) {
          const fall = 420 + rnd(i * 3) * 200;
          const px = b.x0 + ((rnd(i * 37) * w + t * 90) % w);
          const span = b.ground - rainTop;
          const py = rainTop + ((rnd(i * 41) * span + t * fall) % span);
          front.moveTo(px, py).lineTo(px - 5, py + 14).stroke({ width: 1.5, color: 0xa8e05a, alpha: 0.55 * a });
        }
        front.rect(b.x0, b.ground - 120, w, 130).fill({ color: 0x7fbf3a, alpha: 0.1 * a });
        // lightning
        if (a > 0.5) {
          this.nextBolt -= dt;
          if (!this.bolt && this.nextBolt <= 0) {
            this.bolt = { t: 0, x: b.x0 + rnd(Math.floor(t * 10)) * w, seed: Math.floor(t * 100) };
            this.nextBolt = 2.5 + rnd(Math.floor(t * 7)) * 5;
          }
          if (this.bolt) {
            this.bolt.t += dt;
            const k = this.bolt.t;
            const flash = k < 0.08 || (k > 0.16 && k < 0.24);
            if (flash) {
              back.rect(b.x0, b.y0, w, skyH).fill({ color: 0xd8ff9a, alpha: 0.35 });
              front.rect(b.x0, b.ground - 300, w, 310).fill({ color: 0xe8ffc0, alpha: 0.12 });
              const pts: number[] = [];
              let bx = this.bolt.x;
              let by = Math.max(b.y0, b.ground - 480);
              pts.push(bx, by);
              for (let s = 0; s < 8 && by < b.ground - 20; s++) {
                bx += (rnd(this.bolt.seed + s) - 0.5) * 60;
                by += 40 + rnd(this.bolt.seed + s * 3) * 30;
                pts.push(bx, Math.min(by, b.ground - 10));
              }
              for (let s = 0; s + 3 < pts.length; s += 2) {
                front.moveTo(pts[s] as number, pts[s + 1] as number).lineTo(pts[s + 2] as number, pts[s + 3] as number).stroke({ width: 3, color: 0xf0ffd0, alpha: 0.9 });
              }
            }
            if (k > 0.35) this.bolt = null;
          }
        }
        break;
      }
      case 'heatwave': {
        // A white-hot sky, a swollen sun, and shimmer rising off the ground.
        back.rect(b.x0, b.y0, w, skyH).fill({ color: 0xfff6dc, alpha: 0.55 * a });
        back.rect(b.x0, b.ground - 140, w, 140).fill({ color: 0xffb35a, alpha: 0.3 * a });
        const sx = b.x0 + w * 0.3;
        const sy = b.ground - 340;
        const pulse = 1 + Math.sin(t * 1.5) * 0.04;
        back.circle(sx, sy, 110 * pulse).fill({ color: 0xffffff, alpha: 0.16 * a });
        back.circle(sx, sy, 70 * pulse).fill({ color: 0xfff8e0, alpha: 0.3 * a });
        back.circle(sx, sy, 40).fill({ color: 0xffffff, alpha: 0.95 * a });
        for (let row = 0; row < 12; row++) {
          const y = b.ground - 4 - row * 9;
          const alpha = (0.26 - row * 0.018) * a;
          if (alpha <= 0) continue;
          const pts: number[] = [];
          for (let x = b.x0; x <= b.x1; x += 18) pts.push(x, y + Math.sin(x * 0.035 + t * 4.5 + row * 1.3) * 3);
          for (let i = 0; i + 3 < pts.length; i += 2) front.moveTo(pts[i] as number, pts[i + 1] as number).lineTo(pts[i + 2] as number, pts[i + 3] as number);
          front.stroke({ width: 2, color: 0xfff4d8, alpha });
        }
        // a warm wash over everything topside
        front.rect(b.x0, b.ground - 160, w, 170).fill({ color: 0xffc070, alpha: 0.08 * a });
        break;
      }
    }
  }
}

/** A world-space container for the topside's moving parts. */
export class TopsideLayer {
  readonly root = new Container();
  readonly g = new Graphics();
  constructor() {
    this.root.eventMode = 'none';
    this.root.addChild(this.g);
  }
}

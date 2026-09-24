// Command Office props: the Warden's war room. A big wall map of the
// Glarelands with pins and string, a desk with a lamp and a typewriter, and a
// valve radio set that talks to parties in the field.

import type { Graphics } from 'pixi.js';
import { LAMP, type RoomLook, shade } from './palette';

const WOOD = 0x7a5a3a;
const WOOD_DARK = 0x4e3924;
const STEEL = 0x6f7b7a;
const STEEL_DARK = 0x2b2f33;
const PAPER = 0xf1e6c8;

export function drawOffice(g: Graphics, look: RoomLook, bx: number, by: number, bw: number, bh: number): void {
  const floorY = by + bh;

  // Wall map: a framed chart with terrain, a route and pins.
  const mx = bx + 12;
  const my = by + 12;
  const mw = Math.min(118, bw * 0.46);
  const mh = bh * 0.56;
  g.rect(mx - 3, my - 3, mw + 6, mh + 6).fill(WOOD_DARK);
  g.rect(mx, my, mw, mh).fill(0xe3d3a4);
  // mesas and a dry riverbed
  g.poly([mx, my + mh * 0.75, mx + mw * 0.2, my + mh * 0.45, mx + mw * 0.34, my + mh * 0.62, mx + mw * 0.5, my + mh * 0.4, mx + mw * 0.62, my + mh * 0.7, mx + mw, my + mh * 0.55, mx + mw, my + mh, mx, my + mh]).fill(0xc9ab72);
  g.moveTo(mx + 4, my + mh * 0.2).bezierCurveTo(mx + mw * 0.3, my + mh * 0.5, mx + mw * 0.6, my + mh * 0.05, mx + mw - 4, my + mh * 0.35).stroke({ width: 2, color: 0x7fb7c9 });
  for (let k = 0; k < 4; k++) g.rect(mx + 6 + k * (mw / 4), my + 4, 1, mh - 8).fill({ color: 0x8a6a45, alpha: 0.35 });
  for (let k = 0; k < 3; k++) g.rect(mx + 4, my + 6 + k * (mh / 3), mw - 8, 1).fill({ color: 0x8a6a45, alpha: 0.35 });
  // pins joined by red string
  const pins: [number, number][] = [
    [0.15, 0.3],
    [0.42, 0.62],
    [0.66, 0.25],
    [0.86, 0.72],
  ];
  const pts = pins.map(([px, py]) => [mx + px * mw, my + py * mh] as const);
  g.moveTo(pts[0]![0], pts[0]![1]);
  for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
  g.stroke({ width: 1, color: look.accent });
  pts.forEach(([px, py], i) => {
    g.circle(px, py, 3).fill(i === 3 ? 0xf2c14e : look.accent);
    g.circle(px - 1, py - 1, 1).fill(0xffffff);
  });
  // "HQ" star and a pinned note
  g.star(mx + mw * 0.08, my + mh * 0.82, 5, 4, 2).fill(0x2e5a4e);
  g.rect(mx + mw + 6, my + 4, 18, 22).fill(PAPER);
  for (let k = 0; k < 4; k++) g.rect(mx + mw + 9, my + 9 + k * 4, 12, 1).fill(0x8a8070);
  g.circle(mx + mw + 15, my + 5, 2).fill(look.accent);

  // Desk with a lamp, typewriter and a stack of files.
  const dx = bx + bw * 0.5;
  const dw = Math.min(110, bw * 0.4);
  const topY = by + bh * 0.62;
  g.rect(dx, topY, dw, 8).fill(WOOD);
  g.rect(dx, topY, dw, 2).fill(shade(WOOD, 0.25));
  g.rect(dx + 4, topY + 8, 30, floorY - topY - 8).fill(WOOD_DARK);
  for (let k = 0; k < 3; k++) g.rect(dx + 8, topY + 14 + k * 11, 22, 2).fill(shade(WOOD_DARK, 0.3));
  g.rect(dx + dw - 8, topY + 8, 5, floorY - topY - 8).fill(WOOD_DARK);
  // typewriter
  g.roundRect(dx + 40, topY - 12, 34, 12, 3).fill(0x2e5a4e);
  g.rect(dx + 44, topY - 18, 26, 6).fill(PAPER);
  for (let k = 0; k < 5; k++) g.circle(dx + 45 + k * 6, topY - 4, 1.5).fill(0xe9d9b6);
  // files
  g.rect(dx + 80, topY - 6, 20, 6).fill(0xb58a57);
  g.rect(dx + 82, topY - 10, 18, 4).fill(0xc9a45a);
  // desk lamp
  g.rect(dx + 14, topY - 20, 2, 20).fill(STEEL_DARK);
  g.poly([dx + 6, topY - 18, dx + 12, topY - 28, dx + 24, topY - 28, dx + 28, topY - 18]).fill(look.trim);
  g.ellipse(dx + 17, topY - 17, 10, 2).fill(LAMP);

  // Radio set: valve cabinet with dials, a handset and an aerial.
  const rw = Math.min(56, bw * 0.2);
  const rx = bx + bw - rw - 10;
  const ry = by + bh * 0.3;
  g.rect(rx, ry, rw, floorY - ry).fill(shade(WOOD, -0.25));
  g.rect(rx + 4, ry + 4, rw - 8, 20).fill(0x1d2628);
  g.rect(rx + 7, ry + 12, rw - 14, 2).fill(0x7fe0c0);
  g.rect(rx + 7 + ((rw - 18) * 0.6), ry + 7, 2, 14).fill(0xe4572e);
  for (let k = 0; k < 3; k++) {
    g.circle(rx + 12 + k * ((rw - 24) / 2), ry + 34, 5).fill(STEEL_DARK);
    g.circle(rx + 12 + k * ((rw - 24) / 2), ry + 34, 2).fill(STEEL);
  }
  for (let k = 0; k < 4; k++) g.rect(rx + 8, ry + 46 + k * 5, rw - 16, 2).fill(shade(WOOD, -0.45));
  g.circle(rx + rw - 10, ry + 26, 3).fill(0x8fc93a);
  // aerial
  g.rect(rx + rw - 12, ry - 30, 2, 30).fill(STEEL);
  g.circle(rx + rw - 11, ry - 31, 2.5).fill(look.accent);
  // handset on a hook
  g.roundRect(rx - 10, ry + 20, 8, 20, 3).fill(STEEL_DARK);
  g.moveTo(rx - 6, ry + 40).bezierCurveTo(rx - 10, ry + 56, rx - 2, ry + 58, rx, ry + 50).stroke({ width: 1.5, color: STEEL_DARK });
}

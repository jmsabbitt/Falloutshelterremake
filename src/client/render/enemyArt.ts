// Quest enemies, drawn with Graphics in the style of the incident art in
// vaultView.ts: chunky shapes, a few highlights, glowing eyes. Every figure is
// drawn with its feet at (0, 0), facing left (toward the party), and animates
// from the pose passed in, so the caller only redraws it each frame.
//
// Looks come from EnemyDef.look. Unknown looks fall back to a shadowy
// silhouette, so content can add enemies before the art exists.

import type { Graphics } from 'pixi.js';
import { shade } from './palette';

export interface EnemyPose {
  /** Seconds, for idle animation. */
  t: number;
  /** Wind-up progress 0..1, or null when not winding up. */
  windup: number | null;
  stunned: boolean;
  /** Attack lunge, 0..1 (1 = fully forward). */
  attack: number;
}

export interface LookSize {
  w: number;
  h: number;
}

const SIZES: Record<string, LookSize> = {
  skitter: { w: 60, h: 34 },
  skitter_queen: { w: 140, h: 84 },
  burrower: { w: 50, h: 44 },
  rustman: { w: 42, h: 70 },
  rustman_brute: { w: 60, h: 84 },
  rustman_chief: { w: 58, h: 86 },
  hollowed: { w: 40, h: 64 },
  hollowed_hulk: { w: 76, h: 92 },
  mauler: { w: 116, h: 84 },
  sentry: { w: 54, h: 72 },
};
const FALLBACK: LookSize = { w: 48, h: 60 };

/** Every look the art covers (the spec's list). */
export const KNOWN_LOOKS = Object.keys(SIZES);

export function lookSize(look: string): LookSize {
  return SIZES[look] ?? FALLBACK;
}

/** The contact shadow under an enemy (also used under creature sprite art). */
export function drawEnemyShadow(g: Graphics, look: string): void {
  g.ellipse(0, 0, lookSize(look).w * 0.5, 4).fill({ color: 0x000000, alpha: 0.35 });
}

export function drawEnemy(g: Graphics, look: string, p: EnemyPose): void {
  // Contact shadow first, so it sits under everything.
  drawEnemyShadow(g, look);
  switch (look) {
    case 'skitter':
      return skitter(g, p, 1.4);
    case 'skitter_queen':
      return skitterQueen(g, p);
    case 'burrower':
      return burrower(g, p);
    case 'rustman':
      return rustman(g, p);
    case 'rustman_brute':
      return rustmanBrute(g, p);
    case 'rustman_chief':
      return rustmanChief(g, p);
    case 'hollowed':
      return hollowed(g, p);
    case 'hollowed_hulk':
      return hollowedHulk(g, p);
    case 'mauler':
      return mauler(g, p);
    case 'sentry':
      return sentry(g, p);
    default:
      return unknown(g, p);
  }
}

// ------------------------------------------------------------------ bugs

const SHELL = 0x2c3a1e;
const SHELL_HI = 0x46602a;
const GLOW = 0xb7f36a;
const LEG = 0x18200f;

function skitter(g: Graphics, p: EnemyPose, s: number): void {
  const t = p.t;
  const scurry = p.stunned ? 0 : 1;
  const bob = Math.sin(t * 16) * 0.8 * scurry;
  const lx = -p.attack * 8;
  const rear = p.windup !== null ? -p.windup * 6 : 0;
  for (let i = 0; i < 3; i++) {
    const x = (-9 + i * 9) * s + lx;
    const swing = Math.sin(t * 20 + i * 2.1) * 3 * scurry;
    g.moveTo(x, -8 * s + bob).lineTo(x - 5 * s + swing, -3 * s).lineTo(x - 7 * s + swing, 0).stroke({ width: 2 * s, color: LEG });
    g.moveTo(x + 3 * s, -8 * s + bob).lineTo(x + 8 * s - swing, -3 * s).lineTo(x + 10 * s - swing, 0).stroke({ width: 2 * s, color: LEG });
  }
  // abdomen and shell
  g.ellipse(6 * s + lx, -11 * s + bob, 15 * s, 8.5 * s).fill(SHELL);
  g.ellipse(8 * s + lx, -14 * s + bob, 11 * s, 4 * s).fill(SHELL_HI);
  g.rect(6 * s + lx, -19 * s + bob, 1.5 * s, 16 * s).fill({ color: 0x141b0b, alpha: 0.8 });
  g.circle(12 * s + lx, -12 * s + bob, 2 * s).fill({ color: GLOW, alpha: 0.75 });
  g.circle(2 * s + lx, -14 * s + bob, 1.6 * s).fill({ color: GLOW, alpha: 0.6 });
  // head, lifted when rearing up to strike
  const hx = -12 * s + lx;
  const hy = -10 * s + bob + rear;
  g.ellipse(hx, hy, 7.5 * s, 6 * s).fill(0x3a4a22);
  g.circle(hx - 4 * s, hy - 2 * s, 2.2 * s).fill(GLOW);
  g.circle(hx - 1 * s, hy - 3 * s, 1.4 * s).fill(GLOW);
  const pinch = Math.sin(t * 9) * 2 * scurry;
  g.poly([hx - 6 * s, hy + 1 * s, hx - 13 * s, hy - 1 * s + pinch, hx - 8 * s, hy + 3 * s]).fill(0x6a5a2a);
  g.poly([hx - 6 * s, hy + 3 * s, hx - 12 * s, hy + 6 * s - pinch, hx - 6 * s, hy + 5 * s]).fill(0x6a5a2a);
  // antennae
  g.moveTo(hx - 3 * s, hy - 5 * s).lineTo(hx - 10 * s, hy - 12 * s + Math.sin(t * 7) * 2).stroke({ width: 1, color: LEG });
}

function skitterQueen(g: Graphics, p: EnemyPose): void {
  const t = p.t;
  const breathe = Math.sin(t * 2.4) * 2;
  const rear = p.windup !== null ? p.windup : 0;
  const lx = -p.attack * 10;
  // six long jointed legs
  for (let i = 0; i < 3; i++) {
    const bx = -18 + i * 16 + lx;
    const swing = p.stunned ? 0 : Math.sin(t * 4 + i * 1.7) * 3;
    g.moveTo(bx, -34).lineTo(bx - 16 + swing, -52).lineTo(bx - 24 + swing, 0).stroke({ width: 4, color: LEG });
    g.moveTo(bx + 6, -34).lineTo(bx + 22 - swing, -50).lineTo(bx + 30 - swing, 0).stroke({ width: 4, color: LEG });
  }
  // swollen egg-sac abdomen, glowing in bands
  const ax = 30 + lx;
  const ay = -38 + breathe * 0.4;
  g.ellipse(ax, ay, 40 + breathe, 28 + breathe * 0.5).fill(0x4a3a1e);
  for (let k = 0; k < 4; k++) {
    const pulse = 0.35 + 0.35 * Math.sin(t * 3 + k);
    g.ellipse(ax + 10 - k * 9, ay, 4, 22 - Math.abs(k - 1.5) * 4).fill({ color: GLOW, alpha: pulse });
  }
  g.ellipse(ax + 6, ay - 16, 22, 7).fill({ color: 0x6a5a2a, alpha: 0.7 });
  // thorax
  const tx = -8 + lx;
  g.ellipse(tx, -40 - rear * 6, 24, 19).fill(SHELL);
  g.ellipse(tx + 2, -48 - rear * 6, 16, 6).fill(SHELL_HI);
  // head with a crown of horns, raised during a wind-up (the Screech)
  const hx = -34 + lx;
  const hy = -46 - rear * 16;
  g.ellipse(hx, hy, 17, 14).fill(0x3a4a22);
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 - 0.9 + k * 0.45;
    const r0 = 11;
    const r1 = 24 + (k % 2) * 6;
    g.poly([hx + Math.cos(a - 0.12) * r0, hy + Math.sin(a - 0.12) * r0, hx + Math.cos(a) * r1, hy + Math.sin(a) * r1, hx + Math.cos(a + 0.12) * r0, hy + Math.sin(a + 0.12) * r0]).fill(0x7a8a3a);
  }
  for (const [ex, ey, r] of [[-8, -3, 3], [-3, -6, 2.4], [-10, 3, 2], [-4, 1, 2.2]] as const) g.circle(hx + ex, hy + ey, r).fill(GLOW);
  // mandibles, wide open when screeching
  const open = 3 + rear * 8 + Math.sin(t * 5) * 1.5;
  g.poly([hx - 12, hy + 4, hx - 30, hy - open, hx - 16, hy + 8]).fill(0x8a7a3a);
  g.poly([hx - 12, hy + 8, hx - 28, hy + 12 + open, hx - 12, hy + 12]).fill(0x8a7a3a);
  if (rear > 0) g.circle(hx - 16, hy + 6, 4 + rear * 5).fill({ color: GLOW, alpha: 0.35 + rear * 0.4 });
}

// ------------------------------------------------------------------ burrower

function burrower(g: Graphics, p: EnemyPose): void {
  const t = p.t;
  const pop = p.stunned ? 0.2 : 0.6 + 0.4 * Math.sin(t * 3);
  const lunge = p.attack * 8;
  const rise = 10 + pop * 10 + (p.windup ?? 0) * 8;
  // dirt mound
  g.ellipse(0, -2, 24, 8).fill(0x5a3b24);
  g.ellipse(-6, -5, 10, 4).fill(0x6e4a2e);
  g.circle(14, -4, 3).fill(0x4a3020);
  // wrinkled pink body
  const bx = -lunge;
  g.ellipse(bx + 2, -rise, 15, rise).fill(0xc79a82);
  for (let k = 0; k < 3; k++) g.rect(bx - 10, -rise - 6 + k * 7, 20, 1.5).fill({ color: 0x9c6f5c, alpha: 0.8 });
  // head
  const hx = bx - 6;
  const hy = -rise * 1.7;
  g.ellipse(hx, hy, 13, 11).fill(0xd8aa92);
  g.ellipse(hx - 9, hy + 3, 6, 5).fill(0xe8bba5);
  g.circle(hx - 14, hy + 2, 2).fill(0x7a3a3a);
  // squinty eyes and huge incisors
  g.rect(hx - 6, hy - 5, 4, 1.5).fill(0x1b1b1b);
  g.rect(hx + 1, hy - 5, 4, 1.5).fill(0x1b1b1b);
  g.rect(hx - 12, hy + 7, 3, 7).fill(0xf4ecd8);
  g.rect(hx - 8, hy + 7, 3, 7).fill(0xf4ecd8);
  // digging claws
  const claw = Math.sin(t * 8) * 2;
  for (let k = 0; k < 3; k++) g.poly([hx - 16 + k * 3, -rise * 0.9 + claw, hx - 24 + k * 3, -rise * 0.8 + claw + 3, hx - 15 + k * 3, -rise * 0.8 + claw + 2]).fill(0x3b2a20);
}

// ------------------------------------------------------------------ rustmen

const RUST = 0x7a2e1c;
const RUST_DARK = 0x4e1d12;
const STRAP = 0x2b1b14;
const SCRAP = 0x8c8c8c;
const RSKIN = 0xc68b62;

/** A raider body; returns the shoulder point for the weapon arm. */
function raiderBody(g: Graphics, p: EnemyPose, s: number, armour: number): { sx: number; sy: number; hx: number; hy: number } {
  const t = p.t;
  const sway = p.stunned ? 0 : Math.sin(t * 2.5) * 1.2;
  const lx = -p.attack * 10;
  const lean = p.windup !== null ? p.windup * 4 : 0; // leans back to wind up
  // legs
  g.roundRect(-8 * s + lx * 0.3, -22 * s, 7 * s, 22 * s, 2).fill(0x3b2a20);
  g.roundRect(2 * s + lx * 0.3, -22 * s, 7 * s, 22 * s, 2).fill(0x3b2a20);
  g.rect(-9 * s + lx * 0.3, -3 * s, 9 * s, 3 * s).fill(0x1b130e);
  g.rect(1 * s + lx * 0.3, -3 * s, 9 * s, 3 * s).fill(0x1b130e);
  // torso with scrap plates
  const tx = lx + lean + sway * 0.4;
  g.roundRect(-11 * s + tx, -48 * s, 22 * s, 28 * s, 5).fill(armour);
  g.rect(-11 * s + tx, -38 * s, 22 * s, 4 * s).fill(STRAP);
  g.poly([-11 * s + tx, -48 * s, 11 * s + tx, -30 * s, 11 * s + tx, -26 * s, -11 * s + tx, -44 * s]).fill({ color: STRAP, alpha: 0.7 });
  g.rect(-6 * s + tx, -46 * s, 7 * s, 6 * s).fill(SCRAP);
  g.circle(-5 * s + tx, -45 * s, 1).fill(0x3b3b3b);
  // back arm
  g.roundRect(6 * s + tx, -46 * s, 6 * s, 18 * s, 2).fill(shade(armour, -0.25));
  // head
  const hx = -1 * s + tx + lean;
  const hy = -56 * s;
  g.circle(hx, hy, 8 * s).fill(RSKIN);
  g.rect(hx - 8 * s, hy - 2 * s, 11 * s, 4 * s).fill(0x2b2f33); // goggles strap
  g.circle(hx - 5 * s, hy, 2.4 * s).fill(0xf2a541);
  return { sx: -8 * s + tx, sy: -44 * s, hx, hy };
}

function spikedHelmet(g: Graphics, hx: number, hy: number, s: number): void {
  g.poly([hx - 9 * s, hy - 3 * s, hx - 6 * s, hy - 14 * s, hx - 2 * s, hy - 6 * s, hx + 2 * s, hy - 16 * s, hx + 5 * s, hy - 6 * s, hx + 9 * s, hy - 12 * s, hx + 9 * s, hy - 3 * s]).fill(SCRAP);
  g.rect(hx - 9 * s, hy - 4 * s, 18 * s, 3 * s).fill(0x6a6a6a);
}

function rustman(g: Graphics, p: EnemyPose): void {
  const s = 1.25;
  const b = raiderBody(g, p, s, RUST);
  spikedHelmet(g, b.hx, b.hy, s);
  // pipe club held forward, raised for a big swing during a wind-up
  const up = p.windup !== null ? p.windup : 0;
  const ang = -0.3 - up * 1.8 + p.attack * 1.2;
  const len = 30 * s;
  const ex = b.sx + Math.cos(Math.PI + ang) * len;
  const ey = b.sy + Math.sin(Math.PI + ang) * len;
  g.moveTo(b.sx, b.sy).lineTo(b.sx - 8 * s, b.sy + 8 * s).stroke({ width: 5 * s, color: RUST_DARK });
  g.moveTo(b.sx - 6 * s, b.sy + 6 * s).lineTo(ex, ey).stroke({ width: 4 * s, color: 0x5d6a68 });
  g.circle(ex, ey, 4 * s).fill(0x4a5553);
  g.circle(b.sx - 7 * s, b.sy + 7 * s, 3 * s).fill(RSKIN);
}

function rustmanBrute(g: Graphics, p: EnemyPose): void {
  const s = 1.55;
  const b = raiderBody(g, p, s, 0x6a2a18);
  // welded face mask instead of a helmet
  g.roundRect(b.hx - 9 * s, b.hy - 9 * s, 16 * s, 16 * s, 3).fill(0x5d6a68);
  g.rect(b.hx - 7 * s, b.hy - 2 * s, 10 * s, 2 * s).fill(0x1b1b1b);
  g.circle(b.hx - 5 * s, b.hy - 1 * s, 1.6 * s).fill(0xe4572e);
  // spiked shoulder pad
  g.ellipse(b.sx + 2 * s, b.sy - 1 * s, 8 * s, 5 * s).fill(SCRAP);
  for (let k = 0; k < 3; k++) g.poly([b.sx - 3 * s + k * 5 * s, b.sy - 4 * s, b.sx - 1 * s + k * 5 * s, b.sy - 11 * s, b.sx + 1 * s + k * 5 * s, b.sy - 4 * s]).fill(0xb9b19c);
  // sledgehammer: lifted overhead through the wind-up, slammed down on release
  const up = p.windup !== null ? p.windup : 0;
  const ang = -0.1 - up * 2.2 + p.attack * 1.4;
  const len = 34 * s;
  const ex = b.sx + Math.cos(Math.PI + ang) * len;
  const ey = b.sy + Math.sin(Math.PI + ang) * len;
  g.moveTo(b.sx, b.sy).lineTo(ex, ey).stroke({ width: 3.5 * s, color: 0x8a6a45 });
  const nx = Math.cos(Math.PI + ang + Math.PI / 2);
  const ny = Math.sin(Math.PI + ang + Math.PI / 2);
  g.poly([ex + nx * 9 * s - 4, ey + ny * 9 * s - 4, ex - nx * 9 * s - 4, ey - ny * 9 * s - 4, ex - nx * 9 * s + 4, ey - ny * 9 * s + 4, ex + nx * 9 * s + 4, ey + ny * 9 * s + 4]).fill(0x3b3f3a);
  g.circle(b.sx - 2 * s, b.sy + 2 * s, 3.4 * s).fill(RSKIN);
}

function rustmanChief(g: Graphics, p: EnemyPose): void {
  const s = 1.45;
  const t = p.t;
  // cape behind, flapping
  const flap = Math.sin(t * 3) * 3;
  g.poly([-6 * s, -48 * s, 14 * s, -48 * s, 20 * s + flap, -6 * s, -2 * s + flap * 0.5, -4 * s]).fill(0x8e1f1f);
  // banner pole with a rag flag on the back
  g.rect(12 * s, -92 * s, 2.5 * s, 70 * s).fill(0x5e452c);
  g.poly([14 * s, -92 * s, 30 * s + flap, -88 * s, 26 * s + flap, -80 * s, 14 * s, -78 * s]).fill(0xd9c9a3);
  g.circle(21 * s + flap * 0.5, -85 * s, 2.5 * s).fill(RUST);
  const b = raiderBody(g, p, s, 0x5a2416);
  // skull plate and medals
  g.circle(b.sx + 8 * s, b.sy + 4 * s, 3.5 * s).fill(0xe9e1cc);
  g.rect(b.sx + 12 * s, b.sy + 1 * s, 3 * s, 4 * s).fill(0xf2c14e);
  g.rect(b.sx + 16 * s, b.sy + 1 * s, 3 * s, 4 * s).fill(0xc9d1d3);
  // hubcap crown with rebar spikes
  g.rect(b.hx - 9 * s, b.hy - 6 * s, 18 * s, 4 * s).fill(0xc9d1d3);
  for (let k = 0; k < 5; k++) g.rect(b.hx - 8 * s + k * 4 * s, b.hy - (14 + (k % 2) * 5) * s, 1.8 * s, (9 + (k % 2) * 5) * s).fill(0x7a5a3a);
  g.circle(b.hx, b.hy - 4 * s, 2 * s).fill(0xe4572e);
  // big cleaver
  const up = p.windup !== null ? p.windup : 0;
  const ang = -0.5 - up * 1.9 + p.attack * 1.3;
  const len = 22 * s;
  const ex = b.sx + Math.cos(Math.PI + ang) * len;
  const ey = b.sy + Math.sin(Math.PI + ang) * len;
  g.moveTo(b.sx, b.sy).lineTo(ex, ey).stroke({ width: 3 * s, color: 0x3b2a20 });
  const nx = Math.cos(Math.PI + ang - Math.PI / 2);
  const ny = Math.sin(Math.PI + ang - Math.PI / 2);
  const fx = Math.cos(Math.PI + ang);
  const fy = Math.sin(Math.PI + ang);
  g.poly([ex, ey, ex + fx * 16 * s, ey + fy * 16 * s, ex + fx * 16 * s + nx * 10 * s, ey + fy * 16 * s + ny * 10 * s, ex + nx * 10 * s, ey + ny * 10 * s]).fill(0xa9b3b2);
  g.circle(b.sx - 1 * s, b.sy + 1 * s, 3 * s).fill(RSKIN);
}

// ------------------------------------------------------------------ the Hollowed

const HSKIN = 0x9aa58a;
const SORE = 0xc8ff6a;
const RAGS = 0x3f6a66; // a faded Halcyon jumpsuit: they were residents once

function hollowed(g: Graphics, p: EnemyPose): void {
  const t = p.t;
  const sway = p.stunned ? 0 : Math.sin(t * 1.8) * 3;
  const lx = -p.attack * 12;
  const hunch = 6 + (p.windup ?? 0) * 6;
  // legs, one dragging
  g.roundRect(-6, -24, 6, 24, 2).fill(shade(RAGS, -0.35));
  g.poly([2, -24, 8, -24, 12, 0, 5, 0]).fill(shade(RAGS, -0.35));
  // torso, hunched forward
  const tx = lx + sway * 0.5;
  g.poly([-9 + tx - hunch, -50, 9 + tx - hunch * 0.5, -52, 10 + tx, -22, -9 + tx, -22]).fill(RAGS);
  g.rect(-9 + tx - hunch * 0.7, -40, 19, 3).fill(0xf2a541); // what is left of the stripe
  g.poly([-4 + tx, -30, 2 + tx, -34, 6 + tx, -26]).fill({ color: 0x1b1b1b, alpha: 0.5 }); // tear
  // sores
  const glow = 0.5 + 0.5 * Math.sin(t * 4);
  g.circle(4 + tx - hunch * 0.5, -44, 2.4).fill({ color: SORE, alpha: 0.5 + glow * 0.5 });
  g.circle(-3 + tx, -28, 1.8).fill({ color: SORE, alpha: 0.4 + glow * 0.4 });
  // reaching arms
  const reach = Math.sin(t * 2.2) * 3 + p.attack * 8 + (p.windup ?? 0) * 6;
  g.moveTo(-6 + tx - hunch, -46).lineTo(-20 + tx - hunch - reach, -38).lineTo(-24 + tx - hunch - reach, -34).stroke({ width: 4, color: HSKIN });
  g.moveTo(2 + tx - hunch, -46).lineTo(-14 + tx - hunch - reach * 0.7, -32).stroke({ width: 4, color: shade(HSKIN, -0.2) });
  // head, drooping
  const hx = -8 + tx - hunch * 1.3;
  const hy = -56 + hunch * 0.4;
  g.circle(hx, hy, 7.5).fill(HSKIN);
  g.circle(hx + 3, hy - 4, 2).fill({ color: SORE, alpha: 0.6 });
  g.circle(hx - 4, hy - 1, 1.8).fill(0xe8ff9a);
  g.circle(hx - 0.5, hy - 1.5, 1.4).fill(0xe8ff9a);
  g.rect(hx - 5, hy + 3, 5, 1.5).fill(0x3b2a20);
}

function hollowedHulk(g: Graphics, p: EnemyPose): void {
  const t = p.t;
  const lx = -p.attack * 10;
  const heave = Math.sin(t * 1.6) * 2;
  const up = p.windup ?? 0;
  // stumpy legs
  g.roundRect(-14, -26, 11, 26, 3).fill(shade(HSKIN, -0.3));
  g.roundRect(4, -26, 11, 26, 3).fill(shade(HSKIN, -0.3));
  // bloated body with glowing growths
  const bx = lx;
  g.ellipse(bx + 2, -50 - heave, 30, 30 + heave * 0.5).fill(HSKIN);
  g.poly([bx - 26, -60, bx + 20, -76, bx + 30, -40, bx - 20, -30]).fill({ color: RAGS, alpha: 0.9 });
  for (const [gx, gy, r] of [[12, -66, 7], [-14, -44, 5], [20, -46, 4], [-4, -72, 4]] as const) {
    g.circle(bx + gx, gy - heave, r).fill(shade(SORE, -0.35));
    g.circle(bx + gx, gy - heave, r * 0.6).fill({ color: SORE, alpha: 0.6 + 0.4 * Math.sin(t * 3 + gx) });
  }
  // tiny head
  g.circle(bx - 12, -82 - heave, 7).fill(HSKIN);
  g.circle(bx - 15, -83 - heave, 1.8).fill(0xe8ff9a);
  // huge club arm, raised overhead in the wind-up
  const ang = -0.2 - up * 2 + p.attack * 1.2;
  const sx = bx - 20;
  const sy = -62 - heave;
  const ex = sx + Math.cos(Math.PI + ang) * 32;
  const ey = sy + Math.sin(Math.PI + ang) * 32;
  g.moveTo(sx, sy).lineTo(ex, ey).stroke({ width: 12, color: shade(HSKIN, -0.1) });
  g.circle(ex, ey, 10).fill(shade(HSKIN, -0.15));
  g.circle(ex - 2, ey - 3, 3).fill({ color: SORE, alpha: 0.7 });
}

// ------------------------------------------------------------------ Mauler

function mauler(g: Graphics, p: EnemyPose): void {
  const t = p.t;
  const breathe = Math.sin(t * 2) * 1.5;
  const lx = -p.attack * 14;
  const crouch = (p.windup ?? 0) * 8; // crouches before the pounce
  const HIDE = 0x4a3228;
  // tail
  g.moveTo(40 + lx, -44 + crouch).bezierCurveTo(56 + lx, -52, 60 + lx, -30 + Math.sin(t * 3) * 6, 54 + lx, -18).stroke({ width: 6, color: shade(HIDE, -0.2) });
  // back legs
  g.poly([22 + lx, -40 + crouch, 38 + lx, -38 + crouch, 36 + lx, 0, 26 + lx, 0]).fill(shade(HIDE, -0.25));
  // body with a humped, spined back
  g.ellipse(10 + lx, -42 + crouch + breathe * 0.3, 40, 22 + breathe * 0.4).fill(HIDE);
  for (let k = 0; k < 6; k++) {
    const sx = -14 + k * 9 + lx;
    const sy = -60 + crouch + Math.abs(k - 2.5) * 2;
    g.poly([sx - 3, sy + 4, sx + 1, sy - 10 - (k % 2) * 4, sx + 5, sy + 4]).fill(0xd9c9a3);
  }
  g.ellipse(6 + lx, -34 + crouch, 26, 8).fill({ color: 0x6a4a3a, alpha: 0.8 });
  // front legs with claws
  const step = p.stunned ? 0 : Math.sin(t * 3) * 2;
  for (const off of [-26, -12]) {
    g.poly([off + lx, -38 + crouch, off + 12 + lx, -38 + crouch, off + 10 + lx + step, 0, off - 2 + lx + step, 0]).fill(shade(HIDE, -0.1));
    for (let c = 0; c < 3; c++) g.poly([off - 4 + c * 4 + lx + step, 0, off - 8 + c * 4 + lx + step, 2, off - 2 + c * 4 + lx + step, -3]).fill(0xe9e1cc);
  }
  // head: long jaw, curling horns, red eyes
  const hx = -38 + lx;
  const hy = -44 + crouch * 1.4;
  const jaw = 4 + Math.max(0, Math.sin(t * 2.6)) * 3 + (p.windup ?? 0) * 8;
  g.ellipse(hx, hy, 18, 13).fill(shade(HIDE, 0.08));
  g.poly([hx - 8, hy + 2, hx - 30, hy + 4, hx - 28, hy + 8, hx - 6, hy + 8]).fill(shade(HIDE, 0.12));
  g.poly([hx - 6, hy + 8, hx - 26, hy + 8 + jaw, hx - 4, hy + 14]).fill(shade(HIDE, -0.05));
  for (let k = 0; k < 4; k++) g.poly([hx - 26 + k * 5, hy + 8, hx - 24 + k * 5, hy + 12, hx - 22 + k * 5, hy + 8]).fill(0xf4ecd8);
  g.moveTo(hx + 4, hy - 10).bezierCurveTo(hx + 16, hy - 30, hx - 6, hy - 34, hx - 12, hy - 24).stroke({ width: 5, color: 0xd9c9a3 });
  g.moveTo(hx + 10, hy - 6).bezierCurveTo(hx + 26, hy - 24, hx + 12, hy - 32, hx + 4, hy - 26).stroke({ width: 4, color: 0xc9b993 });
  g.circle(hx - 10, hy - 4, 2.8).fill(0xff5a3a);
  g.circle(hx - 10, hy - 4, 5).fill({ color: 0xff5a3a, alpha: 0.25 });
}

// ------------------------------------------------------------------ Halcyon sentry

function sentry(g: Graphics, p: EnemyPose): void {
  const t = p.t;
  const lx = -p.attack * 4;
  const CREAM = 0xd8c69a;
  const TEAL = 0x3f8f8a;
  // treads
  g.roundRect(-22, -12, 44, 12, 6).fill(0x2b2f33);
  for (let k = 0; k < 5; k++) g.circle(-16 + k * 8, -6, 3).fill(0x4a5553);
  // body: Halcyon livery, dented
  g.roundRect(-18 + lx, -50, 36, 40, 6).fill(CREAM);
  g.rect(-18 + lx, -34, 36, 5).fill(TEAL);
  g.poly([6 + lx, -50, 18 + lx, -50, 18 + lx, -40]).fill({ color: 0x5e452c, alpha: 0.6 }); // rust bloom
  g.circle(0 + lx, -22, 5).fill(0xf2a541);
  g.rect(-2 + lx, -25, 4, 6).fill(0x14100d); // an "H"
  g.rect(-4 + lx, -23, 8, 2).fill(0x14100d);
  // antenna with a blinking light
  g.rect(10 + lx, -66, 2, 16).fill(0x6f7b7a);
  g.circle(11 + lx, -67, 2.5).fill(Math.sin(t * 6) > 0 ? 0xe4572e : 0x5a2418);
  // dome head with a scanning red eye
  const scan = p.stunned ? 0 : Math.sin(t * 2.2) * 5;
  g.ellipse(0 + lx, -52, 14, 10).fill(0x9fb4b2);
  g.rect(-12 + lx, -54, 24, 5).fill(0x1d2628);
  const charge = p.windup ?? 0;
  g.circle(-4 + lx + scan, -52, 3 + charge * 2).fill(0xff3b1f);
  g.circle(-4 + lx + scan, -52, 6 + charge * 5).fill({ color: 0xff3b1f, alpha: 0.2 + charge * 0.3 });
  // gun arm pointing at the party; the muzzle glows while charging
  g.rect(-34 + lx, -38, 18, 6).fill(0x3b3f3a);
  g.rect(-40 + lx, -37, 6, 4).fill(0x2b2f33);
  if (charge > 0) g.circle(-42 + lx, -35, 3 + charge * 5).fill({ color: 0xffd23f, alpha: 0.5 + charge * 0.5 });
  // a loose spark now and then
  if (Math.sin(t * 11) > 0.93) g.circle(14 + lx, -40, 2).fill(0xffe3a3);
}

// ------------------------------------------------------------------ fallback

function unknown(g: Graphics, p: EnemyPose): void {
  const t = p.t;
  const wob = Math.sin(t * 3) * 2;
  const lx = -p.attack * 8;
  g.ellipse(lx, -28 + wob * 0.5, 20, 28 + wob).fill(0x2a2230);
  g.ellipse(lx - 4, -40 + wob * 0.5, 12, 10).fill(0x3a3040);
  g.circle(lx - 9, -40 + wob, 2.6).fill(0xf2c14e);
  g.circle(lx - 2, -41 + wob, 2.2).fill(0xf2c14e);
  for (let k = 0; k < 3; k++) g.poly([lx - 14 + k * 10, -6, lx - 10 + k * 10, 4, lx - 6 + k * 10, -6]).fill(0x2a2230);
}

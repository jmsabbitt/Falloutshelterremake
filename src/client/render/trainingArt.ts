// Training room props (playtest 1, item 14), drawn in code only while a training
// room's painted wall is loading or failed to load (roomWall() normally takes over). One set of props per segment, so a merged room reads as a bigger gym.

import type { Graphics } from 'pixi.js';
import { LAMP, type RoomLook, shade } from './palette';

const WOOD = 0x8a6a45;
const WOOD_DARK = 0x5e452c;
const STEEL = 0x6f7b7a;
const STEEL_DARK = 0x2b2f33;
const PAPER = 0xf1e6c8;
const FELT = 0x2e6a45;

export function drawTrainingRoom(g: Graphics, type: string, look: RoomLook, bx: number, by: number, bw: number, bh: number, segments: number): void {
  const floorY = by + bh;
  const seg = bw / Math.max(1, segments);
  // A pennant strip along the top: every training room is a bit of a club.
  for (let k = 0; k < Math.floor(bw / 18); k++) {
    const px = bx + 6 + k * 18;
    g.poly([px, by + 8, px + 12, by + 8, px + 6, by + 18]).fill(k % 2 ? look.accent : shade(look.trim, 0.2));
  }
  for (let s = 0; s < segments; s++) {
    const x0 = bx + seg * s;
    const cx = x0 + seg / 2;
    switch (type) {
      case 'weight_room': {
        // a barbell on a rack, a stack of plates and a punching bag
        g.rect(cx - 34, floorY - bh * 0.46, 4, bh * 0.46).fill(STEEL_DARK);
        g.rect(cx + 30, floorY - bh * 0.46, 4, bh * 0.46).fill(STEEL_DARK);
        g.rect(cx - 44, floorY - bh * 0.44, 88, 4).fill(STEEL);
        for (const dx of [-42, -38, 34, 38]) g.roundRect(cx + dx, floorY - bh * 0.44 - 12, 5, 28, 2).fill(0x1b1b1b);
        for (let k = 0; k < 3; k++) g.ellipse(x0 + 16, floorY - 4 - k * 6, 12 - k * 2, 3).fill(k % 2 ? STEEL_DARK : 0x3b3f3a);
        g.rect(x0 + seg - 22, by + 20, 2, bh * 0.2).fill(STEEL_DARK);
        g.roundRect(x0 + seg - 30, by + 20 + bh * 0.2, 18, bh * 0.34, 8).fill(look.accent);
        g.rect(x0 + seg - 30, by + 20 + bh * 0.2 + 6, 18, 3).fill(shade(look.accent, -0.3));
        break;
      }
      case 'reading_room': {
        // a tall bookcase, a reading lamp and an armchair
        const shelfW = Math.min(64, seg * 0.42);
        const sx = x0 + 10;
        g.rect(sx, by + 22, shelfW, bh - 26).fill(WOOD_DARK);
        for (let row = 0; row < 4; row++) {
          const ry = by + 26 + row * ((bh - 30) / 4);
          g.rect(sx + 3, ry + (bh - 30) / 4 - 4, shelfW - 6, 3).fill(WOOD);
          for (let b = 0; b < 6; b++) {
            const bwid = (shelfW - 10) / 6;
            const tall = (bh - 30) / 4 - 8 - ((b + row) % 3) * 2;
            g.rect(sx + 5 + b * bwid, ry + (bh - 30) / 4 - 4 - tall, bwid - 1, tall).fill([0x7a3e4e, 0x3f5a6b, 0x7a9a5a, 0xc08a4b][(b + row) % 4] as number);
          }
        }
        const ax = x0 + seg * 0.62;
        g.roundRect(ax, floorY - 26, 34, 22, 6).fill(look.accent);
        g.roundRect(ax - 4, floorY - 40, 10, 36, 4).fill(shade(look.accent, -0.2));
        g.rect(ax + 42, floorY - 48, 2, 44).fill(STEEL_DARK);
        g.poly([ax + 34, floorY - 48, ax + 52, floorY - 48, ax + 48, floorY - 58, ax + 38, floorY - 58]).fill(LAMP);
        break;
      }
      case 'lounge': {
        // a long sofa, a starburst clock and a standing lamp
        g.roundRect(cx - 38, floorY - 24, 76, 18, 6).fill(look.accent);
        g.roundRect(cx - 40, floorY - 38, 80, 16, 6).fill(shade(look.accent, -0.18));
        g.rect(cx - 34, floorY - 6, 4, 6).fill(WOOD_DARK);
        g.rect(cx + 30, floorY - 6, 4, 6).fill(WOOD_DARK);
        const clx = cx;
        const cly = by + bh * 0.3;
        for (let k = 0; k < 12; k++) {
          const a = (Math.PI / 6) * k;
          g.rect(clx + Math.cos(a) * 12 - 1, cly + Math.sin(a) * 12 - 1, 3, 3).fill(0xc9a24a);
        }
        g.circle(clx, cly, 8).fill(PAPER);
        g.rect(x0 + 12, floorY - bh * 0.6, 2, bh * 0.6).fill(0xc9a24a);
        g.poly([x0 + 4, floorY - bh * 0.6, x0 + 22, floorY - bh * 0.6, x0 + 18, floorY - bh * 0.6 - 14, x0 + 8, floorY - bh * 0.6 - 14]).fill(LAMP);
        break;
      }
      case 'shooting_gallery': {
        // a counter and a row of tin targets on a rail
        g.rect(x0 + 8, by + bh * 0.28, seg - 16, 3).fill(STEEL_DARK);
        for (let k = 0; k < 3; k++) {
          const tx = x0 + 22 + k * ((seg - 44) / 2);
          const ty = by + bh * 0.28 + 14;
          g.circle(tx, ty, 11).fill(PAPER);
          g.circle(tx, ty, 7).fill(look.accent);
          g.circle(tx, ty, 3).fill(PAPER);
          g.rect(tx - 1, by + bh * 0.28, 2, 4).fill(STEEL_DARK);
        }
        g.rect(x0 + 6, floorY - bh * 0.3, seg - 12, 8).fill(WOOD);
        g.rect(x0 + 10, floorY - bh * 0.3 + 8, seg - 20, bh * 0.3 - 8).fill(WOOD_DARK);
        for (let k = 0; k < 4; k++) g.rect(x0 + 14 + k * ((seg - 28) / 4), floorY - bh * 0.3 + 12, (seg - 28) / 4 - 6, 4).fill(look.trim);
        break;
      }
      case 'tinker_bench': {
        // a workbench with a vice, a gear on the pegboard and a radio chassis
        g.rect(x0 + 10, by + 22, seg * 0.5, bh * 0.34).fill(shade(look.wall, -0.25));
        for (let k = 0; k < 5; k++) for (let j = 0; j < 3; j++) g.circle(x0 + 16 + k * (seg * 0.09), by + 30 + j * (bh * 0.1), 1.5).fill(STEEL_DARK);
        const gx = x0 + 10 + seg * 0.34;
        const gy = by + 22 + bh * 0.17;
        for (let k = 0; k < 8; k++) {
          const a = (Math.PI / 4) * k;
          g.rect(gx + Math.cos(a) * 10 - 2, gy + Math.sin(a) * 10 - 2, 5, 5).fill(look.accent);
        }
        g.circle(gx, gy, 9).fill(look.accent);
        g.circle(gx, gy, 3).fill(shade(look.wall, -0.25));
        g.rect(x0 + 6, floorY - bh * 0.32, seg - 12, 7).fill(WOOD);
        g.rect(x0 + 10, floorY - bh * 0.32 + 7, 5, bh * 0.32 - 7).fill(WOOD_DARK);
        g.rect(x0 + seg - 15, floorY - bh * 0.32 + 7, 5, bh * 0.32 - 7).fill(WOOD_DARK);
        g.rect(x0 + seg * 0.6, floorY - bh * 0.32 - 16, 30, 16).fill(STEEL);
        g.circle(x0 + seg * 0.6 + 8, floorY - bh * 0.32 - 8, 3).fill(0x7fe0c0);
        g.rect(x0 + 20, floorY - bh * 0.32 - 10, 12, 10).fill(STEEL_DARK);
        break;
      }
      case 'endurance_track': {
        // a lane with white stripes, a hurdle and a stopwatch board
        g.rect(x0 + 2, floorY - 12, seg - 4, 10).fill(0xa8603c);
        for (let k = 0; k < 6; k++) g.rect(x0 + 6 + k * ((seg - 12) / 6), floorY - 8, (seg - 12) / 12, 2).fill(PAPER);
        g.rect(cx - 16, floorY - 34, 3, 22).fill(PAPER);
        g.rect(cx + 13, floorY - 34, 3, 22).fill(PAPER);
        g.rect(cx - 18, floorY - 36, 36, 6).fill(look.accent);
        g.rect(cx - 18, floorY - 36, 6, 6).fill(0x1b1b1b);
        g.rect(cx, floorY - 36, 6, 6).fill(0x1b1b1b);
        g.circle(x0 + seg - 24, by + bh * 0.3, 14).fill(PAPER);
        g.circle(x0 + seg - 24, by + bh * 0.3, 11).fill(0xf4ecd8);
        g.rect(x0 + seg - 25, by + bh * 0.3 - 9, 2, 9).fill(STEEL_DARK);
        g.rect(x0 + seg - 27, by + bh * 0.3 - 18, 6, 4).fill(STEEL);
        break;
      }
      case 'card_parlour': {
        // a green felt card table with cards and chips, and a wall of playing-card suits
        g.ellipse(cx, floorY - bh * 0.3, seg * 0.34, 10).fill(FELT);
        g.ellipse(cx, floorY - bh * 0.3 + 3, seg * 0.34, 8).fill(shade(FELT, -0.35));
        g.rect(cx - 3, floorY - bh * 0.3 + 8, 6, bh * 0.3 - 8).fill(WOOD_DARK);
        for (let k = 0; k < 3; k++) g.rect(cx - 18 + k * 12, floorY - bh * 0.3 - 5, 8, 11).fill(PAPER);
        for (let k = 0; k < 3; k++) g.ellipse(cx + 22, floorY - bh * 0.3 - 2 - k * 3, 5, 2).fill(k % 2 ? look.accent : 0xf2c14e);
        for (let k = 0; k < 4; k++) {
          const px = x0 + 14 + k * ((seg - 28) / 3);
          const py = by + bh * 0.28;
          g.roundRect(px - 8, py - 11, 16, 22, 2).fill(PAPER);
          g.circle(px, py, 4).fill(k % 2 ? look.accent : 0x1b1b1b);
        }
        break;
      }
    }
  }
}

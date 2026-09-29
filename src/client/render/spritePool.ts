// A pool of plain sprites for painted pieces drawn frame by frame (resource
// icons on ready bubbles, fire, rubble, beacons, badges): the view calls
// begin(), adds what this frame shows, then end() hides the sprites left over,
// so nothing is created or destroyed while the picture holds still.

import { Container, Sprite, type Texture } from 'pixi.js';

export interface PoolOptions {
  /** Anchor (0..1); default the centre. */
  ax?: number;
  ay?: number;
  alpha?: number;
  tint?: number;
  rotation?: number;
  /** Mirror sideways. */
  flip?: boolean;
  blend?: 'normal' | 'multiply' | 'add' | 'screen';
}

export class SpritePool {
  readonly root = new Container();
  private sprites: Sprite[] = [];
  private used = 0;

  constructor() {
    this.root.eventMode = 'none';
  }

  begin(): void {
    this.used = 0;
  }

  /** Draw `tex` at (x, y) sized w×h (h omitted: keep the texture's aspect). */
  add(tex: Texture, x: number, y: number, w: number, h?: number, o: PoolOptions = {}): Sprite {
    let s = this.sprites[this.used];
    if (!s) {
      s = new Sprite(tex);
      this.sprites.push(s);
      this.root.addChild(s);
    }
    this.used++;
    s.texture = tex;
    s.visible = true;
    s.anchor.set(o.ax ?? 0.5, o.ay ?? 0.5);
    s.position.set(x, y);
    const height = h ?? (w * tex.height) / Math.max(1, tex.width);
    s.scale.set(((o.flip ? -1 : 1) * w) / Math.max(1, tex.width), height / Math.max(1, tex.height));
    s.alpha = o.alpha ?? 1;
    s.tint = o.tint ?? 0xffffff;
    s.rotation = o.rotation ?? 0;
    s.blendMode = o.blend ?? 'normal';
    return s;
  }

  end(): void {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i]!.visible = false;
  }
}

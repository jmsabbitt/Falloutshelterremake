// Seeded, serialisable PRNG (sfc32). The state lives inside GameState so that
// a saved game replays identically.

export type RngState = [number, number, number, number];

export function seedRng(seed: number): RngState {
  // splitmix32 to spread a single seed across four words.
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  const st: RngState = [next(), next(), next(), next()];
  for (let i = 0; i < 12; i++) nextFloat(st);
  return st;
}

/** Uniform float in [0, 1). Mutates `st`. */
export function nextFloat(st: RngState): number {
  let [a, b, c, d] = st;
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) >>> 0;
  st[0] = a >>> 0; st[1] = b >>> 0; st[2] = c >>> 0; st[3] = d;
  return t / 4294967296;
}

/** Integer in [min, max] inclusive. */
export function nextInt(st: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(st) * (max - min + 1));
}

export function chance(st: RngState, p: number): boolean {
  return nextFloat(st) < p;
}

export function pick<T>(st: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick from empty list');
  return items[Math.floor(nextFloat(st) * items.length)] as T;
}

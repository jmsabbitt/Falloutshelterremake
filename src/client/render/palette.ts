// Placeholder art direction: atompunk cutaways. Warm cream walls, teal
// machinery, amber lamps, over dark bedrock. Final art may replace these with
// PixelLab or hand-made sprites; the renderer only needs a colour per room.

export interface RoomLook {
  wall: number;
  trim: number;
  accent: number;
  floor: number;
}

export const ROCK = 0x2a1d15;
export const ROCK_DARK = 0x1c130e;
export const ROCK_SPECK = 0x3b2a1f;
export const SKY_TOP = 0x3d6f86;
export const SKY_BOTTOM = 0xe7b27a;
export const GROUND = 0x8a6a45;
export const FRAME = 0x14100d;
export const LAMP = 0xffe3a3;

export const RESOURCE_COLORS: Record<string, number> = {
  power: 0xf2c14e,
  food: 0x8fc93a,
  water: 0x4fb3e9,
  medpatch: 0xef6f6c,
  purge: 0xb18cf2,
};

const LOOKS: Record<string, RoomLook> = {
  door: { wall: 0x6d7a78, trim: 0x3d4746, accent: 0xf2a541, floor: 0x3b4443 },
  elevator: { wall: 0x3a4a4c, trim: 0x263234, accent: 0xf2a541, floor: 0x2a3436 },
  quarters: { wall: 0xe9d9b6, trim: 0xb08d5b, accent: 0xd9645b, floor: 0x8b6a47 },
  generator: { wall: 0xd8c69a, trim: 0x8c7a4a, accent: 0xf2c14e, floor: 0x6c5a3a },
  canteen: { wall: 0xe8d7a8, trim: 0x7aa05a, accent: 0x8fc93a, floor: 0x7a5c3c },
  waterworks: { wall: 0xcfe0dc, trim: 0x4f8c95, accent: 0x4fb3e9, floor: 0x55696b },
  storeroom: { wall: 0xcdbb95, trim: 0x7b6848, accent: 0xc08a4b, floor: 0x6a5538 },
  clinic: { wall: 0xf1e9dc, trim: 0xb86a66, accent: 0xef6f6c, floor: 0x9b8f84 },
  purgelab: { wall: 0xe6e0f0, trim: 0x7c6ca8, accent: 0xb18cf2, floor: 0x7f7890 },
  radio: { wall: 0xe2c9a6, trim: 0x8a5a44, accent: 0xd9645b, floor: 0x6d4f3b },
  weaponshop: { wall: 0xd3c4a2, trim: 0x5f5446, accent: 0xe4572e, floor: 0x5b4a37 },
  office: { wall: 0xd9cfb4, trim: 0x4a5a3a, accent: 0xc0392b, floor: 0x5e4a36 },
  outfitshop: { wall: 0xecdcd2, trim: 0x8e3b5e, accent: 0xe08fb0, floor: 0x7a5a52 },
  // M6: the Lab and the deep rooms (props in deepArt.ts)
  lab: { wall: 0xdde4d8, trim: 0x3f5a6b, accent: 0x7fe0c0, floor: 0x5a6468 },
  geothermal: { wall: 0x9a7d66, trim: 0x3b2f2a, accent: 0xff7a1a, floor: 0x4a3a30 },
  fungalfarm: { wall: 0x5e6b58, trim: 0x2e3a2c, accent: 0x9cf0c0, floor: 0x3a3328 },
  refinery: { wall: 0x8a7e70, trim: 0x3a3632, accent: 0xe4572e, floor: 0x3e3834 },
  aquifer: { wall: 0x6d878c, trim: 0x2d4a55, accent: 0x4fb3e9, floor: 0x33434a },
  // Playtest 1 #14: training rooms (props in trainingArt.ts until their walls are painted)
  weight_room: { wall: 0xd6c7a4, trim: 0x6b4a36, accent: 0xd9645b, floor: 0x6a5238 },
  reading_room: { wall: 0xe4d6b8, trim: 0x5e452c, accent: 0x7a9a5a, floor: 0x6d5236 },
  lounge: { wall: 0xe8cfc0, trim: 0x7a3e4e, accent: 0xe08fb0, floor: 0x6a4a44 },
  shooting_gallery: { wall: 0xd9cba0, trim: 0x4f5a3a, accent: 0xe4572e, floor: 0x5c4c36 },
  tinker_bench: { wall: 0xd0c8ae, trim: 0x4f6a6e, accent: 0xf2a541, floor: 0x585248 },
  endurance_track: { wall: 0xcfd8c4, trim: 0x46604a, accent: 0xf2c14e, floor: 0x8a5a3c },
  card_parlour: { wall: 0xd8c9a8, trim: 0x3e5a3e, accent: 0xc0392b, floor: 0x5a4632 },
};

export function roomLook(type: string): RoomLook {
  return LOOKS[type] ?? { wall: 0xcccccc, trim: 0x777777, accent: 0xffffff, floor: 0x555555 };
}

/** Shade a colour: amount < 0 darkens, > 0 lightens. */
export function shade(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

/** Rarity colours shared by item icons, bubbles and salvage. */
export const RARITY_COLORS: Record<string, number> = {
  common: 0xb9b19c,
  rare: 0xc9d1d3,
  legendary: 0xf2c14e,
};

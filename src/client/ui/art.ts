// Painted UI art from the sprite pipeline (docs/art/ART-LIST.md §9 to §11): the
// resource, toolbar, status, incident, ruleset and faction icons (`ui_icons`),
// the crates, region banners, site paintings, the unmet-legend silhouette,
// the arrival portrait and the app art. Paths come from sprites/manifest.json;
// until it loads, the pipeline's usual file names are used, so the first frame
// already shows the art. Anything missing, or an image that fails to load,
// falls back to the emoji or drawn look it replaced.
//
// Strings can carry icons two ways: the emoji they always had (⚡ 🥫 💧 ✚ ☢ 📦
// ★ ◆ ☠ 🔒 …), which `iconize` swaps for the matching image, or a `:name:`
// shortcode for icons with no emoji of their own (`:inc_rustmen:`,
// `:faction_tinkers:`). h() runs every string child through `iconize`, so
// panel code keeps writing plain strings. Titles and aria labels stay text
// (use `plainIcons` for those).

type Group = 'ui_icons' | 'crates' | 'regions' | 'sites' | 'legends' | 'ui_chrome' | 'app' | 'arrival' | 'badges';

const BASE = 'sprites/';

/** Where the sprite pipeline writes each group (the manifest says the same once it loads). */
const DEFAULT_PATH: Record<Group, (name: string) => string> = {
  ui_icons: (n) => `icons/${n}.webp`,
  crates: (n) => `icons/crate_${n}.webp`,
  regions: (n) => `regions/${n}.webp`,
  sites: (n) => `sites/${n}.webp`,
  legends: (n) => `portraits/legend_${n}.webp`,
  ui_chrome: (n) => `ui/${n}.webp`,
  app: (n) => `app/${n}.webp`,
  arrival: () => 'portraits/arrival.webp',
  badges: (n) => `icons/badge_${n}.webp`,
};

let manifest: Partial<Record<Group, Record<string, string>>> | null = null;
let loading: Promise<void> | null = null;

/** Read the art paths from the sprite manifest (once). Without a manifest nothing shows but the fallbacks. */
export function loadUiArt(): Promise<void> {
  loading ??= fetch(`${BASE}manifest.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((m: { portraits?: Partial<Record<Group, Record<string, string>>> } | null) => {
      manifest = m?.portraits ?? {};
    })
    .catch(() => {
      // Offline without a cached manifest: keep guessing the usual paths.
    });
  return loading;
}

/**
 * The painted chrome (X7) as CSS variables on :root: --art-panel, --art-button and
 * --art-hud. Unset (so the CSS keeps its plain boxes) when the manifest has no such art.
 */
export function applyChromeArt(): void {
  const root = document.documentElement.style;
  for (const [name, v] of [['panel', '--art-panel'], ['button', '--art-button'], ['hud_bar', '--art-hud']] as const) {
    const src = artUrl('ui_chrome', name);
    if (src) root.setProperty(v, `url("${new URL(src, document.baseURI).href}")`);
    else root.removeProperty(v);
  }
}

/** URL of one piece of UI art, or null when the manifest has none. */
export function artUrl(group: Group, name: string): string | null {
  if (manifest) {
    const file = manifest[group]?.[name];
    return file ? BASE + file : null;
  }
  return BASE + DEFAULT_PATH[group](name);
}

// ------------------------------------------------------------------ icons

interface IconDef {
  group: Group;
  name: string;
  /** Screen-reader text. */
  label: string;
  /** Shown when the image is missing. */
  fallback: string;
}

const ui = (label: string, fallback: string): Omit<IconDef, 'name'> => ({ group: 'ui_icons', label, fallback });

const DEFS: Record<string, Omit<IconDef, 'name'>> = {
  // M1 resources, M9 Fizz
  power: ui('Power', '⚡'),
  food: ui('Food', '🥫'),
  water: ui('Water', '💧'),
  scrip: ui('Scrip', '💰'),
  medpatch: ui('Med-Patch', '✚'),
  purge: ui('Purge', '☢'),
  crate_token: ui('Crate token', '🎟'),
  treasure_map: ui('Treasure map', '🗺'),
  fizz: ui('Halcyon Fizz', '🥤'),
  // U1 toolbar and HUD
  build: ui('Build', '🏗'),
  residents: ui('Residents', '👥'),
  storage: ui('Storage', '🎒'),
  crates: ui('Supply Crates', '📦'),
  explore: ui('Explore', '🧭'),
  quests: ui('Quests', '⚔'),
  research: ui('Research', '🔬'),
  factions: ui('Factions', '🤝'),
  legacy: ui('Legacy', '📜'),
  goals: ui('Goals', '🏆'),
  menu: ui('Menu', '☰'),
  population: ui('Population', '👥'),
  mood: ui('Mood', '☺'),
  // U2 shifts and weather
  shift_morning: ui('Morning shift', '🌅'),
  shift_day: ui('Day shift', '☀'),
  shift_night: ui('Night shift', '🌙'),
  weather_clear: ui('Clear skies', '☀'),
  weather_dust: ui('Dust storm', '🌪'),
  weather_taintstorm: ui('Taint storm', '☢'),
  weather_heatwave: ui('Heatwave', '🔥'),
  // U3 incidents
  inc_fire: ui('Fire', '🔥'),
  inc_skitters: ui('Skitters', '🪲'),
  inc_burrowers: ui('Burrowers', '⛏'),
  inc_rustmen: ui('Rustmen', '⚔'),
  inc_cavein: ui('Cave-in', '🪨'),
  inc_flood: ui('Flood', '🌊'),
  inc_deepcrawlers: ui('Deepcrawlers', '🕷'),
  inc_surge: ui('Electrical surge', '⚡'),
  inc_hollowed: ui('The Hollowed', '☢'),
  inc_glassbacks: ui('Glassbacks', '🕸'),
  inc_maulers: ui('Mauler', '⚠'),
  // U4 notice groups and research branches
  crafting: ui('Crafting', '🔧'),
  rewards: ui('Rewards', '🏅'),
  homestead: ui('Homestead', '🏠'),
  warning: ui('Warning', '⚠'),
  industry: ui('Industry', '⚙'),
  medicine: ui('Medicine', '✚'),
  defense: ui('Defense', '🛡'),
  automation: ui('Automation', '🤖'),
  deep: ui('The Deep', '⛏'),
  // U5 status glyphs
  lock: ui('Locked', '🔒'),
  check: ui('Done', '✓'),
  cross: ui('No', '✗'),
  alert: ui('Alert', '⚠'),
  skull: ui('Skull', '☠'),
  star: ui('Star', '★'),
  diamond: ui('Diamond', '◆'),
  sad: ui('Unhappy', '☹'),
  // U6 rulesets and presets
  famine: ui('Famine', '🥫'),
  lean_times: ui('Lean Times', '💸'),
  brownout: ui('Brownout', '🔌'),
  short_fuse: ui('Short Fuse', '🧨'),
  no_radio: ui('No Radio', '📻'),
  iron_door: ui('Iron Door', '🚪'),
  endless_night: ui('Endless Night', '🌙'),
  glass_sky: ui('Glass Sky', '☢'),
  skeleton_crew: ui('Skeleton Crew', '🦴'),
  rules: ui('Rules', '⚖'),
  blank_slate: ui('Blank Slate', '📋'),
  boomtown: ui('Boomtown', '🏙'),
  deep_day_one: ui('Deep Day One', '⛏'),
  ruined: ui('Ruined', '🏚'),
  all_rooms: ui('All Rooms', '🗝'),
  // U7 factions
  faction_caravaners: ui('Caravaners', '🛒'),
  faction_tinkers: ui('Tinkers', '🔧'),
  faction_lamplighters: ui('Lamplighters', '🕯'),
  faction_rustmen: ui('Rustmen', '⚔'),
  faction_homestead9: ui('Homestead 9', '🏢'),
  // U8 Collection Log and the Deep
  creature: ui('Creature', '🐾'),
  room: ui('Room', '▦'),
  seal_medal: ui("Warden's Seal", '✪'),
  halcyon_log: ui('Halcyon log', '📖'),
  relic: ui('Relic', '🗿'),
  // Q6 markers that also make sense in text
  map_objective: ui('Objective', '🚩'),
  map_unknown: ui('Unknown', '❓'),
  // M3 crates
  crate_standard: { group: 'crates', label: 'Supply Crate', fallback: '📦' },
  crate_rare: { group: 'crates', label: 'Rare Crate', fallback: '📦' },
  crate_legendary: { group: 'crates', label: 'Legendary Crate', fallback: '📦' },
  // R1 badges
  badge_heart: { group: 'badges', label: 'Heart', fallback: '♥' },
  badge_legend: { group: 'badges', label: 'Legendary resident', fallback: '★' },
  // M4 new arrival
  arrival: { group: 'arrival', label: 'New resident', fallback: '🧑' },
};

const ICONS: Record<string, IconDef> = {};
for (const [key, d] of Object.entries(DEFS)) {
  const name = d.group === 'crates' ? key.replace(/^crate_/, '') : d.group === 'badges' ? key.replace(/^badge_/, '') : key;
  ICONS[key] = { ...d, name };
}

/** Emoji in UI strings, and the icon each one stands for. */
const EMOJI: Record<string, string> = {
  '⚡': 'power',
  '🥫': 'food',
  '💧': 'water',
  '💰': 'scrip',
  '✚': 'medpatch',
  '☢': 'purge',
  '🎟': 'crate_token',
  '🗺': 'treasure_map',
  '🥤': 'fizz',
  '📦': 'crates',
  '🏗': 'build',
  '👥': 'residents',
  '🎒': 'storage',
  '🧭': 'explore',
  '⚔': 'quests',
  '🔬': 'research',
  '🤝': 'factions',
  '📜': 'legacy',
  '🏆': 'goals',
  '☰': 'menu',
  '☺': 'mood',
  '🌅': 'shift_morning',
  '☀': 'shift_day',
  '🌙': 'shift_night',
  '🌪': 'weather_dust',
  '🔥': 'inc_fire',
  '🪲': 'inc_skitters',
  '🪨': 'inc_cavein',
  '🌊': 'inc_flood',
  '🕷': 'inc_deepcrawlers',
  '🕸': 'inc_glassbacks',
  '🔧': 'crafting',
  '🏅': 'rewards',
  '🎖': 'rewards',
  '🎁': 'rewards',
  '🏠': 'homestead',
  '⚙': 'industry',
  '🛡': 'defense',
  '🤖': 'automation',
  '⛏': 'deep',
  '🔒': 'lock',
  '✓': 'check',
  '✔': 'check',
  '✗': 'cross',
  '⚠': 'alert',
  '☠': 'skull',
  '★': 'star',
  '⭐': 'star',
  '◆': 'diamond',
  '☹': 'sad',
  '💸': 'lean_times',
  '🔌': 'brownout',
  '🧨': 'short_fuse',
  '📻': 'no_radio',
  '🚪': 'iron_door',
  '🦴': 'skeleton_crew',
  '⚖': 'rules',
  '🏙': 'boomtown',
  '🗝': 'all_rooms',
  '🛒': 'faction_caravaners',
  '🕯': 'faction_lamplighters',
  '🏢': 'faction_homestead9',
  '🐾': 'creature',
  '▦': 'room',
  '✪': 'seal_medal',
  '📖': 'halcyon_log',
  '🗿': 'relic',
  '🚩': 'map_objective',
  '❓': 'map_unknown',
  '🧑': 'arrival',
  '👤': 'arrival',
  '♥': 'badge_heart',
  '❤': 'badge_heart',
  '💕': 'badge_heart',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TOKEN = new RegExp(`(${Object.keys(EMOJI).map(escape).join('|')})\\uFE0F?|:([a-z][a-z0-9_]*):`, 'gu');

/** Image URLs that failed to load: those icons show their fallback from now on. */
const failed = new Set<string>();

export interface IconOpts {
  /** Extra classes. */
  cls?: string;
  /** Screen-reader text; '' marks it decorative (when a word beside it says the same). */
  alt?: string;
  /** Text to show if there is no image (defaults to the icon's emoji). */
  fallback?: string;
}

/** One icon as an <img> sized to the text around it, or its emoji when there is no art. */
export function uiIcon(key: string, opts: IconOpts = {}): HTMLElement | Text {
  const def = ICONS[key];
  const fallback = opts.fallback ?? def?.fallback ?? '';
  const src = def ? artUrl(def.group, def.name) : null;
  if (!def || !src || failed.has(src)) return document.createTextNode(fallback);
  return artImg(src, { cls: `ui-icon${opts.cls ? ` ${opts.cls}` : ''}`, alt: opts.alt ?? def.label, fallback });
}

/** A painted image (banner, site, crate…) with a fallback node if it can't load. */
export function artImg(src: string, opts: { cls?: string; alt?: string; fallback?: string | (() => Node) } = {}): HTMLImageElement {
  const img = document.createElement('img');
  img.src = src;
  img.alt = opts.alt ?? '';
  if (opts.cls) img.className = opts.cls;
  img.draggable = false;
  img.decoding = 'async';
  if (opts.alt === '') img.setAttribute('aria-hidden', 'true');
  img.addEventListener('error', () => {
    failed.add(src);
    const fb = opts.fallback;
    if (fb === undefined) img.remove();
    else img.replaceWith(typeof fb === 'function' ? fb() : document.createTextNode(fb));
  });
  return img;
}

/** Has this art failed to load (so a caller can pick its drawn look up front)? */
export const artFailed = (src: string | null): boolean => !src || failed.has(src);

/** Split a string into text and icon images. Returns [text] when it has no icons. */
export function iconize(text: string): (Node | string)[] {
  TOKEN.lastIndex = 0;
  if (!TOKEN.test(text)) return [text];
  TOKEN.lastIndex = 0;
  const out: (Node | string)[] = [];
  let last = 0;
  for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) {
    const key = m[1] !== undefined ? EMOJI[m[1]] : m[2];
    if (!key || !ICONS[key]) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(uiIcon(key, m[1] !== undefined ? { fallback: m[0] } : {}));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The same string for places that can only hold text (titles, aria labels): shortcodes become their emoji. */
export function plainIcons(text: string): string {
  return text.replace(/:([a-z][a-z0-9_]*):/g, (all, key: string) => ICONS[key]?.fallback ?? all);
}

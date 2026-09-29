import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

/**
 * M8: write dist/sw.js from src/client/platform/sw.template.js once the build
 * is on disk, precaching every output file (relative, so base './' works).
 * The cache version is a hash of the file list and contents.
 */
/**
 * Sprite folders loaded at start-up or in the first minutes (see EAGER_CREATURES,
 * EAGER_IMAGES and LAZY_IMAGES in src/client/render/sprites.ts): rooms holds the
 * walls, the room frames and the elevator; backdrop the sky, dirt and Deep rock;
 * icons the badges and resource icons; fx and props the door damage, incident
 * pieces, carts and the monument (all small); ui and app the UI chrome and splash.
 */
const PRECACHED_SPRITES = ['resident_f', 'resident_m', 'rooms', 'items', 'portraits', 'backdrop', 'icons', 'fx', 'props', 'fx_fire', 'ui', 'app', 'skitter', 'burrower', 'rustman', 'deepcrawler', 'hollowed', 'glassback'];

function serviceWorkerPlugin(): Plugin {
  let outDir = 'dist';
  let root = '.';
  return {
    name: 'homestead-sw',
    apply: 'build',
    configResolved(c) {
      root = c.root;
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const files = filesUnder(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        // woff2 is enough for every browser that has service workers; the .woff fallbacks stay network/runtime-cached.
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !f.endsWith('.woff'))
        // Sprites the game loads at start-up are precached; quest enemies, bosses, legend
        // bodies and ending art (most of the 20+ MB) are cached at runtime, the first time they load.
        .filter((f) => !f.startsWith('sprites/') || f === 'sprites/manifest.json' || PRECACHED_SPRITES.some((d) => f.startsWith(`sprites/${d}/`)))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = `${pkg.version}-${hash.digest('hex').slice(0, 10)}`;
      const list = ['./', ...files.map((f) => `./${f}`)];
      const template = readFileSync(resolve(root, 'src/client/platform/sw.template.js'), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(list, null, 0)));
    },
  };
}

export default defineConfig({
  base: './',
  // Safari 15 too: iPhones on older iOS get newer syntax down-levelled.
  build: { target: ['es2022', 'safari15'] },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [serviceWorkerPlugin()],
  // Some balance tests simulate days of play; under a full parallel run they can pass 5 s.
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
});

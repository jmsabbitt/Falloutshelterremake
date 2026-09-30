/// <reference types="vite/client" />
import { Application } from 'pixi.js';
import { Game } from './game';
import { runStage } from './frameGuard';
import { CharacterArt } from './render/sprites';
import { QuestView } from './render/questView';
import { CELL, FLOOR_H, SURFACE_H, VaultView } from './render/vaultView';
import { UI } from './ui/ui';
import { CustomGameUI } from './ui/custom';
import { initPlatform, isNative } from './platform';
import { getSettings, onSettingsChange, reloadSettings, type Settings } from './platform/settings';
import { initStorage } from './storage';
import { initAudio } from './platform/audio';
// M8: fonts are bundled so the game looks right in airplane mode.
import '@fontsource/bungee/400.css';
import '@fontsource/work-sans/400.css';
import '@fontsource/work-sans/600.css';
import '@fontsource/work-sans/700.css';
import './style.css';

/** M8: the PWA's offline cache (the native app ships its files, so it doesn't need one). */
function registerServiceWorker(): void {
  if (!import.meta.env.PROD || isNative() || !('serviceWorker' in navigator)) return;
  // The offline copy (~20 MB) downloads only after the game's own art is in, so the
  // two don't compete for the connection on a first visit.
  const register = () => navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker not registered:', err));
  const w = window as unknown as { __homesteadArtReady?: boolean };
  const start = Date.now();
  const wait = window.setInterval(() => {
    if (!w.__homesteadArtReady && Date.now() - start < 20000) return;
    window.clearInterval(wait);
    window.setTimeout(register, 4000);
  }, 250);
}

/** Dev builds, or a production build made with VITE_DEV_CONSOLE=1 (for automated UI tests). */
function devConsole(): boolean {
  return import.meta.env.DEV || import.meta.env['VITE_DEV_CONSOLE'] === '1';
}

async function boot(): Promise<void> {
  // M8: natively the saves are mirrored in Preferences; load them before the game reads its save.
  await initStorage();
  reloadSettings();
  registerServiceWorker();
  const host = document.getElementById('stage') as HTMLElement;
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x120d0a,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  host.appendChild(app.canvas);

  const game = new Game();
  // The developer console (window.homestead: scrip, crates, skip…) is for development
  // and automated tests only. Players never get it: it would unlock every achievement.
  // `VITE_DEV_CONSOLE=1 npm run build` keeps it in a production build for testing.
  if (devConsole()) game.installConsole();

  // The UI and view need each other; wire callbacks through a late-bound ref.
  let ui: UI | null = null;
  const view = new VaultView(app, game, {
    onRoomTap: (room) => ui?.onRoomTap(room),
    onEmptyTap: () => ui?.onEmptyTap(),
    onResidentDrop: (id, room) => ui?.onResidentDrop(id, room),
    onResidentTap: (res) => ui?.onResidentTap(res),
    onBuildAt: (floor, x) => ui?.onBuildAt(floor, x),
    onExplorerTap: () => ui?.openPanel('explore'),
    onCaravanTap: () => ui?.openFactions('caravans'),
  });
  const questView = new QuestView(app, game, {
    onRoomTap: (id) => ui?.quests.screen.onRoomTap(id),
    onEnemyTap: (uid) => ui?.quests.screen.onEnemyTap(uid),
    onRingResult: (id, quality) => ui?.quests.screen.onRingResult(id, quality),
  });
  ui = new UI(game, view, questView);
  // Synthesised sound effects and ambience; silent until the first tap or key press.
  initAudio(game);
  // M9: the Custom Game banner, sandbox toolbar and screen draw their own layer over the UI.
  const custom = new CustomGameUI({ game, toast: (...args) => ui?.toast(...args) });
  await initPlatform(game).catch((err) => console.warn('Platform init failed:', err));
  // M8 battery saver: cap at 30 fps (stream T's idle governor goes lower on its own).
  // Reduced motion is exposed to CSS as :root[data-reduced-motion].
  const applySettings = (s: Settings) => {
    app.ticker.maxFPS = s.batterySaver ? 30 : 0;
    document.documentElement.toggleAttribute('data-reduced-motion', s.reducedMotion);
    document.documentElement.toggleAttribute('data-battery-saver', s.batterySaver);
  };
  applySettings(getSettings());
  onSettingsChange(applySettings);
  // Founding, import and reset swap the whole homestead: redraw it from scratch.
  game.onReplace(() => view.resync());
  (window as unknown as { __homesteadBooted?: boolean }).__homesteadBooted = true;
  // Sprite art streams in after first paint; until then (or without it) residents use drawn placeholders.
  // Only this homestead's room paintings load now (at their level and width); the rest
  // load when a room is built, merged or upgraded. The boot screen waits for them and
  // the residents' core sheets (up to 8 s), so the drawn stand-ins never flash by.
  const wantRooms = game.state.rooms.flatMap((r) => [`${r.type}:${r.level}`, ...(r.segments > 1 ? [`${r.type}:${r.level}w${r.segments}`] : [])]);
  const artReady = () => ((window as unknown as { __homesteadArtReady?: boolean }).__homesteadArtReady = true);
  window.setTimeout(artReady, 8000);
  void CharacterArt.load(undefined, wantRooms).then(async (art) => {
    view.setArt(art);
    questView.setArt(art);
    await art?.charactersReady;
    // One frame to draw with everything in, then the boot screen can go.
    requestAnimationFrame(() => requestAnimationFrame(artReady));
  }, artReady);
  const cost = { n: 0, sim: 0, view: 0, ui: 0 };
  if (devConsole()) (window as unknown as Record<string, unknown>).homesteadView = {
    /** Screen position of a room's centre; for automated UI tests. */
    roomScreen: (id: number) => {
      const room = game.state.rooms.find((r) => r.id === id);
      if (!room) return null;
      const r = view.roomRect(room);
      return view.world.toGlobal({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    },
    worldToScreen: (x: number, y: number) => view.world.toGlobal({ x, y }),
    /** Screen position of a resident's figure, to drag them in automated UI tests. */
    residentScreen: (id: number) => view.debugResidentScreen(id),
    /** What the vault view has drawn (sprites, rooms, camera), to check a re-sync. */
    counts: () => view.debugCounts(),
    /** Build or move slots on show (and how wide each merges to), and a slot's screen centre. */
    ghosts: () => view.debugGhosts(),
    cellScreen: (floor: number, x: number, cells = 3) => view.world.toGlobal({ x: (x + cells / 2) * CELL, y: SURFACE_H + floor * FLOOR_H + FLOOR_H / 2 }),
    /** Which animation each resident figure is showing, by action. */
    figures: () => view.debugFigures(),
    /** Quest screen: open one, and find enemies and rooms on screen. */
    openQuest: (id: number) => ui?.quests.open(id),
    enemyScreen: (uid: number) => questView.enemyScreen(uid),
    questRoomScreen: (roomId: string) => questView.roomScreen(roomId),
    questDoorScreen: (roomId: string) => questView.doorScreen(roomId),
    /** M6: centre the camera on a floor, and the average JS cost of a frame (ms) since the last call. */
    focusFloor: (floor: number, cellX?: number) => view.focusFloor(floor, cellX),
    /** Raise a toast, and the stats overlay's plates on screen; for automated UI tests. */
    toast: (...args: Parameters<UI['toast']>) => ui?.toast(...args),
    statPlates: () => ui?.qol.stats.plateBounds() ?? [],
    frameCost: () => {
      const out = { frames: cost.n, sim: cost.sim / Math.max(1, cost.n), view: cost.view / Math.max(1, cost.n), ui: cost.ui / Math.max(1, cost.n) };
      cost.n = cost.sim = cost.view = cost.ui = 0;
      return out;
    },
  };

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    const t0 = performance.now();
    // The sim gets the real time since the last frame. Pixi clamps deltaMS to
    // 100 ms, so slow frames would otherwise lose game time for good (and the
    // long-gap catch-up in game.update would never fire); animation keeps the clamp.
    runStage('sim', () => game.update(ticker.elapsedMS / 1000));
    const t1 = performance.now();
    runStage('view', () => view.update(Math.min(dt, 0.1)));
    runStage('quest view', () => questView.update(Math.min(dt, 0.1)));
    const t2 = performance.now();
    runStage('ui', () => ui?.update());
    runStage('custom', () => custom.update());
    const t3 = performance.now();
    cost.n++;
    cost.sim += t1 - t0;
    cost.view += t2 - t1;
    cost.ui += t3 - t2;
  });
}

boot().catch((err) => {
  console.error(err);
  // Shown in the boot-diagnostics panel (index.html) with the browser's version, so a phone screenshot says what broke.
  const show = (window as unknown as { __bootError?: (msg: string) => void }).__bootError;
  const msg = `Failed to start: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`;
  if (show) show(msg);
  else document.body.innerHTML = `<pre style="color:#f4ecd8;padding:20px">${msg}</pre>`;
});

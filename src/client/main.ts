import { Application } from 'pixi.js';
import { Game } from './game';
import { CharacterArt } from './render/sprites';
import { QuestView } from './render/questView';
import { VaultView } from './render/vaultView';
import { UI } from './ui/ui';
import './style.css';

async function boot(): Promise<void> {
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
  game.installConsole();

  // The UI and view need each other; wire callbacks through a late-bound ref.
  let ui: UI | null = null;
  const view = new VaultView(app, game, {
    onRoomTap: (room) => ui?.onRoomTap(room),
    onEmptyTap: () => ui?.onEmptyTap(),
    onResidentDrop: (id, room) => ui?.onResidentDrop(id, room),
    onResidentTap: (res) => ui?.onResidentTap(res),
    onBuildAt: (floor, x) => ui?.onBuildAt(floor, x),
    onExplorerTap: () => ui?.openPanel('explore'),
  });
  const questView = new QuestView(app, game, {
    onRoomTap: (id) => ui?.quests.screen.onRoomTap(id),
    onEnemyTap: (uid) => ui?.quests.screen.onEnemyTap(uid),
    onRingResult: (id, quality) => ui?.quests.screen.onRingResult(id, quality),
  });
  ui = new UI(game, view, questView);
  // Founding, import and reset swap the whole homestead: redraw it from scratch.
  game.onReplace(() => view.resync());
  // Sprite art streams in after first paint; until then (or without it) residents use drawn placeholders.
  void CharacterArt.load().then((art) => {
    view.setArt(art);
    questView.setArt(art);
  });
  const cost = { n: 0, sim: 0, view: 0, ui: 0 };
  (window as unknown as Record<string, unknown>).homesteadView = {
    /** Screen position of a room's centre; for automated UI tests. */
    roomScreen: (id: number) => {
      const room = game.state.rooms.find((r) => r.id === id);
      if (!room) return null;
      const r = view.roomRect(room);
      return view.world.toGlobal({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    },
    worldToScreen: (x: number, y: number) => view.world.toGlobal({ x, y }),
    /** What the vault view has drawn (sprites, rooms, camera), to check a re-sync. */
    counts: () => view.debugCounts(),
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
    game.update(dt);
    const t1 = performance.now();
    view.update(Math.min(dt, 0.1));
    questView.update(Math.min(dt, 0.1));
    const t2 = performance.now();
    ui?.update();
    const t3 = performance.now();
    cost.n++;
    cost.sim += t1 - t0;
    cost.view += t2 - t1;
    cost.ui += t3 - t2;
  });
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#f4ecd8;padding:20px">Failed to start: ${String(err)}</pre>`;
});

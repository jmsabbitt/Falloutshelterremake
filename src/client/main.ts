import { Application } from 'pixi.js';
import { Game } from './game';
import { CharacterArt } from './render/sprites';
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
  ui = new UI(game, view);
  // Sprite art streams in after first paint; until then (or without it) residents use drawn placeholders.
  void CharacterArt.load().then((art) => view.setArt(art));
  (window as unknown as Record<string, unknown>).homesteadView = {
    /** Screen position of a room's centre; for automated UI tests. */
    roomScreen: (id: number) => {
      const room = game.state.rooms.find((r) => r.id === id);
      if (!room) return null;
      const r = view.roomRect(room);
      return view.world.toGlobal({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    },
    worldToScreen: (x: number, y: number) => view.world.toGlobal({ x, y }),
  };

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    game.update(dt);
    view.update(Math.min(dt, 0.1));
    ui?.update();
  });
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#f4ecd8;padding:20px">Failed to start: ${String(err)}</pre>`;
});

# Homestead (working title)

An original atompunk colony-management game inspired by *Fallout Shelter*: a 2.5D cross-section of an underground homestead, with residents, production, incidents, exploration, quests and a prestige system that expands the game every cycle.

Web first (TypeScript + PixiJS), with a mobile build through Capacitor later.

## Run it

```bash
npm install
npm run dev        # play at http://localhost:5173
npm test           # simulation tests
npm run typecheck
npm run build      # production build in dist/
npm run sim -- 24  # headless balance run: 24 in-game hours
```

In the browser console, `window.homestead` is a developer console: `skip(seconds)`, `addScrip(n)`, `spawn(n)`, `fill()`, `run(command)`, `reset()`. It is the basis for the future Custom Game mode.

## How to play (current prototype)

1. Tap the door to let the founding residents in.
2. Drag residents into rooms. A room is a good fit when it matches the resident's highest stat (Generator = Brawn, Canteen = Knack, Water Works = Sight).
3. Tap a room when its bubble appears to collect.
4. **Build**, then tap a green slot. Rooms of the same type and level merge up to 3 wide.
5. Open a room to **Rush** it (instant batch, with a risk of fire) or **Upgrade** it.

## Layout

```
src/sim/        pure game logic: no DOM, deterministic, seeded RNG, fully testable
  systems/      production, needs (power/food/water/happiness), incidents, rush, achievements
src/content/    JSON data: rooms, balance numbers, names, achievements
src/client/     PixiJS renderer (render/) and DOM interface (ui/)
tests/          Vitest simulation tests
scripts/        headless balance simulation
docs/research/  deep-dive research on Fallout Shelter
docs/design/    game design document (GDD.md)
```

The client only changes the game through `applyCommand`. This keeps the simulation portable (to Capacitor now, or another engine later) and makes replays, tests and the Custom Game mode straightforward.

## Status

- **M0 (foundations): done.** Sim core, content pipeline, save/load with versioning, offline catch-up, tests.
- **M1 (vault loop): playable.** Build, merge, upgrade, assign, collect, rush, fire, happiness, power brownouts, achievements.
- Next: **M2** (incident roster, breeding and recruiting, storage and med rooms, Supply Crates).

See [`docs/design/GDD.md`](docs/design/GDD.md) for the full plan.

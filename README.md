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
npm run sim -- 48  # headless bot-player balance run: 48 in-game hours
```

In the browser console, `window.homestead` is a developer console: `skip(seconds)`, `addScrip(n)`, `spawn(n)`, `fill()`, `raid()`, `incident(type)`, `give(itemId)`, `crate(tier, n)`, `salvage(id, n)`, `fragments(itemId, n)`, `learn(itemId)`, `explore(residentId?)`, `run(command)`, `reset()`. It is the basis for the future Custom Game mode.

## How to play (current prototype)

1. Tap the door to let the founding residents in.
2. Drag residents into rooms. A room is a good fit when it matches the resident's highest stat (Generator = Brawn, Canteen = Knack, Water Works = Sight).
3. Tap a room when its bubble appears to collect.
4. **Build**, then tap a green slot. Rooms of the same type and level merge up to 3 wide.
5. Open a room to **Rush** it (instant batch, with a risk of an incident) or **Upgrade** it.
6. **Crates**: open Supply Crates for scrip, supplies, gear and even new residents. You get one every day you play, from milestones, and from crate tokens earned by playing. A legendary is guaranteed at least every 10 crates.
7. **Residents → Change** to equip weapons (for fighting) and outfits (stat boosts). **Storage** holds spare gear.
8. Put a woman and a man in the **Quarters** to start a family. Babies grow up into working adults in a few hours.
9. Defend against fires, skitters, burrowers and **Rustmen raiders**: drag residents into the affected room. Arm your two door guards.
10. Build a **Radio Room** (population 20) to attract new residents.
11. **Explore**: send a resident into the Glarelands with Med-Patches and Purge. They keep exploring while you're away, writing a journal, and bring home scrip, gear, salvage and blueprint fragments. Recall them before they get into trouble.
12. **Craft**: build a Weapon Workshop (population 22) or Outfit Workshop (32), staff it, and turn salvage into gear. Rare and legendary recipes come from blueprint fragments (exploring, scrapping duplicates). **Storage → Scrap** breaks items into salvage; **Reforge** turns three of a kind into a chance at the next rarity, guaranteed after a few tries.

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
- **M2 (threats and growth): playable.** Four incident types including raiders, families and children, wanderers and radio recruiting, weapons and outfits, storage, Med-Patch/Purge, Supply Crates with pity and daily streaks, 37 achievements. A bot playing headlessly reaches population 40 in about a day of very active play.
- **M3 (the Glarelands and crafting): playable.** Dustbowl Flats region with 26 enemies, 17 locations, 12 NPCs and 85+ journal musings; offline-safe explorer simulation; 21 salvage types; 36 recipes; Weapon and Outfit Workshops; blueprint fragments; scrapping; reforging with pity; 61 achievements. Built in parallel by three agents against a written contract (`docs/design/M3-spec.md`).
- Next: **M4** (quests: Command Office, quest runner, real-time combat, first questline).

See [`docs/design/GDD.md`](docs/design/GDD.md) for the full plan.

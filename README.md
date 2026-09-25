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
npm run quest-balance  # every quest and contract with scripted parties
npm run sprites    # rebuild character sprites from art/raw (see docs/design/art-spec.md)
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
- **M4 (quests): playable.** Command Office (pop 18, 1–3 concurrent quests); parties of 1–3; side-view quest maps with shuffled rooms; real-time combat with a crit-ring minigame (Fortune fills, Sight slows), one stat-based ability per resident, Grit as armour, telegraphed boss attacks that a stun interrupts; event choices with stat checks; Act 1 "The Silent Neighbour" (6 quests up to the first boss, Baron Oxide); contracts (3 every 6 hours) that name their bounty; 19 enemies, 18 events, 19 more achievements. Screenshots in `docs/screens/m4/`. Contract: `docs/design/M4-spec.md`.
- **M5 (prestige v1): playable.** Charter milestone (100 residents + the Act 1 finale; later homesteads: 100 + 15 contracts); Legacy scored per homestead; the Found a New Homestead flow (review, site, founding party, heirlooms, confirm with automatic backup); 4 sites with modifiers and Legacy multipliers; an 18-perk Legacy tree in 6 branches; old homesteads become idle outposts that trickle scrip, salvage and crates. In headless bot runs the first homestead met its Charter after 76–226 h (the story quests gate it), and homestead 2, with 7 perks, reached 100 residents in 59 h. Screenshots in `docs/screens/m5/`; contract `docs/design/M5-spec.md`. Console: `homestead.prestige.charter()`, `.legacy(n)`, `.found(siteId)`.
- **M6 (depth pass): playable.**
  - *Research:* Labs (Wits) and a 46-node tech tree in 6 branches. Automation research covers Holding Tanks (banked batches), a Personnel Office (auto-assign), Supply Bots (auto-heal/purge) and conveyor auto-collect. An Institutional Memory perk keeps research across foundings.
  - *The Deep:* 4 strata below floor 25, dug with research, scrip and time. It has deep-only rooms (Geothermal Tap, Fungal Farm, Ore Refinery, Aquifer Pump), cave-ins, floods and Deepcrawlers, and 20 story discoveries pointing to Act 2.
  - *Residents:* 25 traits, partly inherited. Job mastery runs Apprentice → Journeyman → Master, with profession titles and a shift clock.
  - *Quality of life:* a sortable/filterable resident list with bulk actions and auto-assign, a room stats overlay, a notification centre with "while you were away", save slots, loadout presets, and a Threat Rating gauge.
  - Screenshots are in `docs/screens/m6/` and `docs/screens/m6q/`; the contract is `docs/design/M6-spec.md`.
- **M7 (Topside and factions): playable.**
  - *Topside:* a surface row above the door (floor −1) with 7 buildings: Solar Array, Wind Turbine, Rain Catcher, Farm Plots, Watchtower, Trading Post and Signal Mast. Weather rotates between clear, dust storm, taint storm and heatwave. Each building reacts differently; taint storms Glare-soak anyone working outside. A Topside research branch unlocks the surface and softens the weather. Staffed Watchtowers spot raiders early and blunt their attack.
  - *Factions:* the Long Road Caravan Co., the Scrapwright Guild, the Order of the Last Lamp, the Rustman clans and the rival Halcyon Homestead 9. You reach them through the Signal Mast. Reputation runs from Hostile to Allied. The Trading Post runs a trade board (50 offers, refreshed every 8 h), caravans take 1–3 residents and goods down a faction's road (online and offline, with ambushes), and you earn Influence to spend on offers and recruits. Hostile Rustmen raid more often.
  - *Act 2 "Neighbours":* 8 quests for the second homestead, ending in `act2_finale`, which the Charter now requires. There are faction-choice events and 6 faction contracts. It opens the Glass Flats, a harsher region with 17 enemies, 12 locations, 10 NPCs and 46 musings.
  - The game now has 141 achievements. Screenshots are in `docs/screens/m7/`; the contract is `docs/design/M7-spec.md`. Console: `homestead.m7.topside()`, `.meet()`, `.influence(n)`, `.weather(kind)`, `.arrive()`.
- **M8 (Mobile): playable on phones.**
  - *App:* a Capacitor 8 shell for Android and iOS (`ai.avolis.homestead`). `npm run android:build` builds a debug APK, and CI does the same on every push (`.github/workflows/android.yml`). iOS is generated, with Swift Package Manager and no CocoaPods, and needs Xcode on a Mac to compile.
  - *Web:* the build also installs as a PWA. It plays offline and the fonts are bundled.
  - *Saves:* they are compressed (a population-100 save is about 7.7k characters) and mirrored to native storage, so the OS clearing the WebView can't lose them.
  - *Notifications:* local notifications come from `upcomingReminders`, which predicts what finishes while the game is closed: explorers, caravans, quest parties, crafting, research, storage, births, fresh offers, the daily crate, digs and outposts. Each kind can be switched on or off, and there are quiet hours. Permission is asked the first time it matters.
  - *Touch:* gestures are tuned (fling, pinch, double-tap zoom, hold to pick up a resident, edge scrolling while dragging). A room slides clear of its sheet. The Android back button closes things in order. Every tap target is at least 44 px, and swipe-down closes a sheet. There are landscape and tablet layouts, haptics, and an idle frame governor with a battery saver.
  - Screenshots are in `docs/screens/m8/`, the contract is `docs/design/M8-spec.md`, and build notes are in `docs/mobile.md`.
- **M9 (Content): playable.**
  - *Act 3, "The Seal":* 8 quests for the third homestead, ending in `act3_finale` (the Charter now needs it). It has a two-phase finale, 21 new enemies, 15 events and 5 contracts. It opens the **Stillwater**, the hardest region, with 15 enemies, 11 locations, 9 NPCs and 45 musings.
  - *Legendary residents:* 11 named characters (for example Marla "Switchback" Voss, Doc Ferris, Rook, Captain Orla Brandt). Each has a signature trait and a two-quest personal questline that "awakens" them. They join through faction standing, the radio, Legendary crates, the Deep, a boss's first defeat, treasure caches or the story. You can recall them from outposts.
  - *Collection Log and Warden's Seal:* a codex of items, legends, creatures, rooms and regions, with milestone crates. The Seal is earned with every other achievement; the ones for losing people are optional. The game now has 229 achievements.
  - *New threats:* electrical surges, the Hollowed, Glassbacks (they jump rooms and drain power) and **Maulers**, which a noise-and-wealth meter on the Threat gauge summons with a warning.
  - *Rare-item paths:* a guaranteed drop the first time each of the 24 bosses is defeated, treasure maps that lead to 5 caches, region-exclusive loot, and 14 loot-only items.
  - *Rulesets and Survival:* 9 rulesets (Famine, Lean Times, Brownout, Short Fuse, No Radio, Iron Door, Endless Night, Glass Sky, Skeleton Crew) chosen when founding. Each is unlocked by prestige progress and pays extra Legacy. Survival means the fallen stay fallen.
  - *Custom Game:* 7 presets or an advanced setup, a sandbox console, a ×1–×100 time scale, its own save slot and no achievements.
  - Screenshots are in `docs/screens/m9/`; the contract is `docs/design/M9-spec.md`. Console: `homestead.m9.*` and `homestead.custom.*`.
- Next: the true ending for homesteads 4+, more regions and creatures, bespoke legend art, and polish.

Quest tools: `npm run quest-balance` plays every quest with a scripted party across levels and gear. In the browser console, `homestead.quest.office()`, `.party(level, weapon)`, `.skip()` and `.win()` help testing.

See [`docs/design/GDD.md`](docs/design/GDD.md) for the full plan.

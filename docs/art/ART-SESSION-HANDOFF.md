# Art session handoff: residents, creatures, portraits, icons and rooms

What this session finished, where it lives, and what is left. The pipeline itself (sheet layout, `sprite.json` options, recolouring rules) is documented in [SPRITE-HANDOFF.md](SPRITE-HANDOFF.md); this page is the summary of the work done on top of it.

Branch: `claude/intelligent-darwin-1j3dsk`. All art is built by `npm run sprites` (`tools/sprites/build.py`) from `art/raw/` into `public/sprites/` (about 47 MB of lossy WebP now, after round 2 and the ART-LIST briefs) plus `public/sprites/manifest.json`.

## What is finished

| Area | Source (`art/raw/`) | Output (`public/sprites/`) | Used by |
|---|---|---|---|
| Residents, female and male | `resident_f`, `resident_m` | `resident_f/`, `resident_m/` (tint layers) | Vault view and quest screen: walk, idle, work, the five weapon-grip fight sheets, the extinguish and repair sheets, fallen, carry, picked by what the resident is doing |
| Creatures (11 looks) | `skitter`, `skitter_queen`, `burrower`, `rustman`, `rustman_brute`, `rustman_chief`, `hollowed`, `hollowed_hulk`, `mauler`, `sentry`, `deepcrawler` | one folder per look (idle, attack, death) | Quest combat (`questView.ts`), vault incidents for skitters, burrowers, raiders and deepcrawlers (`vaultView.ts`) |
| HALCY portraits | `halcy` | `portraits/halcy_{smile,talk,worried,wink}.webp` | Beside her lines: welcome, quests, prestige (`ui/halcy.ts`) |
| Item icons (36 weapons and outfits) | `items` | `items/<itemId>.webp` | Storage list, crate cards (`ui/icons.ts`) |
| Salvage icons (21 types) | `salvage` | `items/<salvageId>.webp` | Storage salvage cells |
| Room walls, 17 types × up to 3 levels (49 images) | `room_<type>/level{1,2,3}.png` | `rooms/room_<type>_<level>.webp` | Vault view back walls |

Everything falls back to the old drawn (Graphics or emoji) version when an image is missing, so partial art never breaks the game.

### Room walls in detail

- Every room type has a level-1 painting: door, quarters, generator, canteen, waterworks, storeroom, clinic, purge lab, weapon and outfit workshops, command office, research lab, radio room, and the four deep rooms (geothermal, fungal farm, refinery, aquifer). The elevator was left out at first; its shaft and car have since been painted (ART-LIST.md V1).
- The 16 upgradable rooms also have level 2 and level 3, made image-to-image from the level below so framing and style match. Level 2 is a modest upgrade and level 3 is the showpiece.
- Shapes: square images tile once per segment in rooms that merge (three cells per segment); workshops are one 4:1 image, office and door one 21:9 image.
- Code: `CharacterArt.roomWall(type, level)` in `src/client/render/sprites.ts` (falls back to a lower level); `rebuildStatics` in `src/client/render/vaultView.ts` draws only the room shell when a wall exists (`drawRoomBox(..., shell = true)`) and puts the room name on a dark tab.
- The level-2 Infirmary (clinic) was regenerated once because the first pass barely differed from level 1.

### Code changes made along the way

- `tools/sprites/build.py`: `magenta`, `corner` and `none` backgrounds; `split: "figures"`, `order: "x"`, `boxes`, `whole`, `crop`, `drop`, `take`, `flip`, `mirror`, per-animation `regions`, `heightFrom`, `fitHeight`; `kind: "creature"` and `kind: "portrait"`; WebP output; `<id>_lineup.png` previews in `art/previews/`.
- `src/client/render/sprites.ts`: animation fallback chain, parallel loading, `CreatureFigure`, room textures.
- `src/client/render/vaultView.ts`, `questView.ts`, `enemyArt.ts`: resident actions, creature art in incidents and combat, room walls.
- `src/client/ui/halcy.ts`, `ui/icons.ts`, `style.css`: HALCY faces and item or salvage icons.
- Debug hook: `homesteadView.figures()` in the browser console counts residents per `action>animation`.

## How the art was made

- Artlist AI Suite, Nano Banana 2 at 2K: text-to-image model 2251, image-to-image model 2247. 130 credits per image.
- Residents and creatures were built from the uploaded resident reference; icons and rooms from text prompts; upgrade levels by image-to-image from the level below.
- Credits: about 164,660 left of 180,000 at the end of the session (renews 2026-10-07). The agreed floor was 60,000.

To regenerate one image: make it, save the PNG over `art/raw/<id>/<file>.png` (same name), run `npm run sprites -- <id>` (just that folder), check it in the game, commit both the raw PNG and the WebP. To add a new room level, add an entry to that room's `sprite.json` `anims` (`{"file": "level2.png", "whole": true, "names": ["2"]}`).

## Checking it

- `npx tsc --noEmit -p .` and `npm test` pass (240 tests).
- Browser check: `npx vite build`, then `npx vite preview --port 4177`. In the console run `homestead.qol.bigVault(60)`, `homestead.research.all()` and `homestead.deep.open(4)` to get every room type, then look at surface, middle and deep floors.
- The boot screen now waits (up to 8 s) for this homestead's room paintings and the residents' core sheets, so the drawn fallback no longer flashes by. Other room paintings load when a room is built, merged or upgraded.

## Open items

1. **Licensing sign-off.** The table in SPRITE-HANDOFF.md section 8 lists tool, plan and date for every batch, but the "Checked" boxes are empty. Someone needs to confirm the Artlist plan's commercial terms before release. The first `resident_f / walk` row still has unknown plan and date.
2. **Kept on purpose, but worth knowing:** the level-3 Weapon Foundry shows an empty suit of power armour on display, and the level-3 Command Bureau map shows real-world continents. The user reviewed both and kept them.
3. **Repo size.** `art/raw/` is now about 3.6 GB of 2K source PNGs, plus about 100 MB of previews in `art/previews/`, all in plain git (no LFS). Consider Git LFS or moving raw art out of the repo if clones get slow.
4. **Made since:** the elevator shaft and car, the surface backdrops (sky, crust, dirt), the quest screen backdrop and ruin walls, and everything else in [ART-LIST.md](ART-LIST.md). Still not made: animated room props. The drawn animated effects in deep rooms still play over the paintings.

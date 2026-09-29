# Art list: everything still drawn in code

Playtest 1, item 4 ([playtest-1-plan.md](../design/playtest-1-plan.md)). The team's note: "Everything in the game should have a generated image for its texture. The drawn shapes clash with the painted art." This is the complete list of what is still drawn in code at runtime in normal play: PixiJS `Graphics` shapes, CSS-drawn shapes and emoji used as pictures. It is in priority order, so the art session can work from the top.

How this list was made: every drawing function in `src/client/render/*.ts` and every icon or emoji in `src/client/ui/*.ts`, `style.css`, `m9.css` and `endings.css` was checked against what is built into `public/sprites/manifest.json` and loaded by `sprites.ts` (`roomWall`, `backdrop`, `creatureFor`, `forResident`) or by the UI (`items/`, `portraits/`, `endings/`). A drawn fallback that never shows, because the art exists, is left out. Those are listed at the end so nobody paints them twice.

Tools and method stay the same as in rounds 1 and 2: Artlist, Nano Banana 2 at 2K, image-to-image from the existing art wherever the style has to match. How sheets are laid out, keyed and built is in [SPRITE-HANDOFF.md](SPRITE-HANDOFF.md) and [art-spec.md](../design/art-spec.md). The game is original IP: atompunk, 1950s Americana gone to seed, chunky cartoon proportions, dry humour. No Fallout names, logos, power armour or look-alikes, and no real brands.

**Priority:** P1 is seen in the first hour of a new game. P2 is seen in a normal first week (the surface, quests, the Explore panel). P3 is late game, rare, or polish.

**Code status:** §1 and §2 are being wired now, so the code picks them up with no further changes. Section 10 of ART-HANDOFF-M9 (backdrops) and the door levels are already wired. Everything else says **needs hookup**: the folder names here are the proposal, and the code session will read the art from exactly these paths. They can be painted before the hookup lands.

---

## House style (match this)

From `art/raw/room_generator/level1.png`, `art/raw/items/icons_w1.png`, `art/raw/resident_m/fight.png` and the creature sheets:

- **Line:** clean, confident dark outlines (near-black brown, not pure black), a little heavier on the silhouette than inside it.
- **Shading:** cel-shaded with soft gradient fills, one warm key light from above, gentle ambient occlusion in corners. No hard photographic texture and no painterly brush noise.
- **Palette:** atompunk and worn. Sage and olive greens, riveted grey-green steel, copper pipes, brass fittings, dark walnut wood, hazard yellow with black chevrons, cream enamel, and a teal Halcyon accent used sparingly. Warm lamp light at the top of rooms, cooler shadow at the floor.
- **Wear:** chipped paint, rivets, dents, a few stains. It's lived in and maintained, not ruined (except ruins, which are ruined).
- **Proportions:** chunky and readable at small sizes. A prop should read at 24 px tall.
- **Backgrounds:** full-bleed for walls and backdrops. Flat magenta `#FF00FF` for props, icons and anything that stands against the sky. Flat green `#00FF00` for resident sheets (they must be green; the recolouring depends on it).
- **No text** in any image, except where a line says so. Signs can carry shapes and made-up symbols, not words (the UI writes names on top).

---

## §1. Wide room walls (P1 to P3, 102 images, being wired now)

**Why:** a room merged to 2 or 3 segments shows the same single-width painting 2 or 3 times side by side (playtest item 2). The code now looks for a painting made for the room's width first, and falls back to tiling only when there isn't one.

**Which rooms:** every type whose `rooms.json` entry has `cells: 3` and `maxSegments: 3`. That's 13 underground types (quarters, generator, canteen, waterworks, storeroom, clinic, purgelab, lab, radio, geothermal, fungalfarm, refinery, aquifer) and 4 surface types (solar_array, wind_turbine, rain_catcher, farm_plots).

**What each image is:** one continuous, wider room, painted as a single scene. **Not the single-width image repeated or mirrored.** Make it from that level's existing single painting with image-to-image, so the style, lighting, wall colour, floor band and props match exactly. It should look like the same room with more space, with its machinery re-arranged to fill it: one long bank of equipment, a bigger central machine flanked by smaller ones, or two stations sharing pipework. Merged rooms are contiguous (the elevator shaft never sits inside one), so there is no gap, pillar or seam to paint in the middle.

**Files** (per type and level, L = 1, 2, 3):
- `art/raw/room_<type>/level{L}_w2.png` (2 segments wide)
- `art/raw/room_<type>/level{L}_w3.png` (3 segments wide)

**sprite.json:** add entries to that folder's existing `sprite.json` next to `"1"`, `"2"` and `"3"`. Keep the file's `kind`, `background`, `outDir` and `prefix` as they are. Surface types keep `"trimBottom": true` on each entry, like their existing ones.

```json
"1w2": { "file": "level1_w2.png", "whole": true, "names": ["1w2"] },
"1w3": { "file": "level1_w3.png", "whole": true, "names": ["1w3"] },
"2w2": { "file": "level2_w2.png", "whole": true, "names": ["2w2"] },
"2w3": { "file": "level2_w3.png", "whole": true, "names": ["2w3"] },
"3w2": { "file": "level3_w2.png", "whole": true, "names": ["3w2"] },
"3w3": { "file": "level3_w3.png", "whole": true, "names": ["3w3"] }
```

These build to `public/sprites/rooms/room_<type>_1w2.webp` and so on, listed under `portraits.room_<type>` in the manifest.

**Size and shape.** Every existing single-width painting of these 17 types is **2048 × 2048 (1:1)**. A room segment is 3 grid cells, so the wide ones are 2× and 3× the single width at the same height:

| Width | Aspect | Ideal size | Practical with the image tool |
|---|---|---|---|
| single (exists) | 1:1 | 2048 × 2048 | |
| `w2` | **2:1** | 4096 × 2048 | Generate at 21:9 (3168 × 1344) with a little spare at the sides, then crop to 2:1 (2688 × 1344) |
| `w3` | **3:1** | 6144 × 2048 | Generate at 4:1 (4128 × 1024) with spare at the sides, then crop to 3:1 (3072 × 1024) |

The build scales every wall to 256 px tall, so the exact pixel count doesn't matter, only the ratio. For reference, in the game the underground back wall is drawn about 0.92:1 at one segment, 2.2:1 at two and 3.5:1 at three (it's stretched to fit, as the singles already are). Surface buildings are drawn at the painting's own ratio on the ground line, so 2:1 and 3:1 keep them the same height as the single ones.

**Composition rules:**
- Underground (`background: none`, full bleed): keep the floor band along the bottom at the same height as in the single painting, and the wainscot and ceiling line level across the whole width. Residents walk along that floor, so keep the lower third fairly clear, as the singles do. The name tab sits at the top left; keep the top-left corner quiet.
- Surface (`background: magenta`): the ground line along the bottom edge, flat magenta above and around. Structures at the same scale as in the single painting, so a 2-wide Solar Array is a longer rack, not a taller one.
- Level 1 is ramshackle, level 3 the showpiece, as in the singles. Make `level2_w2` from `level2.png`, not from `level1_w2`, so each width matches its own level.

Ideas per type (a starting point; anything that reads as one bigger room is fine):

| Type | 2 wide | 3 wide |
|---|---|---|
| generator | Two turbine housings sharing one bus bar and control panel | One big central reactor fan flanked by two smaller ones, cable trays along the ceiling |
| waterworks | A row of four tanks joined by one manifold | Six tanks, a big filter drum in the middle |
| canteen | A long serving counter with two hot-plates and a menu board | Counter plus a row of booths and a jukebox |
| quarters | Two bunks with a shared rug and a radio on a shelf | Three bunks, a small sitting corner, a family photo wall |
| storeroom | Shelving racks the full width, crates stacked high | The same with a forklift or trolley and a caged section |
| clinic | Two beds and a medicine cabinet | Three beds, a curtain rail and an X-ray light box |
| purgelab | A long lab bench of glassware | Bench plus a big distillation column in the middle |
| lab | Two workstations and a chalkboard | A central experiment rig with consoles either side |
| radio | A double console and a tall transmitter cabinet | A switchboard wall with two operator desks |
| geothermal | Two heat exchangers on one steam main | A big central bore cap with exchangers either side |
| fungalfarm | Two tiers of glowing growing trays | Three tiers and a misting pipe along the ceiling |
| refinery | Crucible and a conveyor | Crucible, conveyor and an ingot rack |
| aquifer | A pump with a long pipe run | Two pumps and a pressure tank |
| solar_array | One long rack of panels on scaffolding | Two racks joined by a walkway, a battery hut |
| wind_turbine | Two rotors on one lattice (rotors still) | One tall main rotor with two small ones |
| rain_catcher | A wider tarp funnel over two cisterns | Three funnels over one long riveted cistern |
| farm_plots | Four raised beds, the scarecrow | Six beds, a water butt and a tool shed |

Wide references already in the repo: `art/raw/room_office/` (21:9, a 6-cell room) and `art/raw/room_weaponshop/` (4:1, a 9-cell room) show how the round-1 walls handled width.

**Priority order** (6 images per type):
1. **P1, the starter rooms:** generator, waterworks, canteen, quarters (24 images). The new tutorial builds these first, and they're the first rooms players merge.
2. **P2, by the population that unlocks them:** storeroom (12), clinic (14), purgelab (16), radio (20), lab (25), then the four surface types (30) (54 images).
3. **P3, the Deep rooms (40):** geothermal, fungalfarm, refinery, aquifer (24 images).

Within a type, do `w2` for all three levels before `w3`: two-wide rooms are far more common.

**Count:** 17 types × 3 levels × 2 widths = **102 images**.

---

## §2. Weapon grip fight sheets (P1 and P3, 65 images, being wired now)

**Why:** residents no longer carry a drawn gun (playtest item 5). A weapon shows only while a resident fights an incident in their room, and it comes from a fight sheet for that weapon's grip. Each weapon gets a `grip` in `items.json`. Until a grip's sheet exists, the current `fight` sheet (a generic shotgun) stays as the fallback for the gun grips.

**The five grips:**

| Anim key | Grip | Pose | Typical weapons (the code session sets `grip` in items.json) |
|---|---|---|---|
| `fight_pistol` | Pistol | One-handed aim: gun arm straight out at shoulder height, off hand relaxed or bracing the wrist; recoil kicks the wrist up | rusty_revolver, service_pistol, flare_gun, arc_pistol, dust_devil, quitclaim, nail_driver |
| `fight_longgun` | Long gun | Rifle shouldered, stock at the shoulder, both hands on it, cheek down to aim; recoil rocks the shoulder back | scrap_carbine, rivet_rifle, scattergun, longrifle, coilgun, sunbeam_rifle, salvage_harpoon, wick_gun |
| `fight_heavy` | Heavy | A big, heavy gun braced at the hip with both hands, wide stance, leaning into it; the whole body shakes | thunderclap, glare_lance, peacemaker |
| `fight_melee` | Melee | A two-handed swing with a club-like tool: wind-up at the shoulder, swing across, follow-through, back to guard | wrench, prospector_pick, custodial_baton, glasscutter, mauler_tusk |
| `fight_unarmed` | Unarmed | Fists up, boxing guard: jab, cross, back to guard, a small bounce | tin_knuckles, and anyone with no weapon |

The weapon in each sheet is **generic** for its grip: a plain revolver-sized pistol, a plain rifle, a plain heavy gun, a plain length of heavy pipe or club, bare fists. The same sheet serves every weapon of that grip, so nothing should identify one item.

**Files:** `art/raw/resident_m/fight_<grip>.png` and `art/raw/resident_f/fight_<grip>.png`, 10 sheets.

**Template: copy the existing `fight` sheet exactly.** `art/raw/resident_m/fight.png` and `art/raw/resident_f/fight.png` are **2752 × 1536** (16:9), green `#00FF00`, **12 frames in two rows of six**, the figure facing right, head to feet, the same size in every frame, with clear empty space between frames. Make each grip sheet from the matching body's `fight.png` (for pose, framing and timing) plus its `walk` sheet (for the figure), image-to-image. Their `sprite.json` entry is the template:

```json
"fight_pistol": {
  "file": "fight_pistol.png",
  "fps": 10,
  "split": "figures",
  "regions": { "hair": { "aboveFraction": 0.36 } }
}
```

Add one like it per grip (`fight_longgun`, `fight_heavy`, `fight_melee`, `fight_unarmed`) to `art/raw/resident_m/sprite.json` and `art/raw/resident_f/sprite.json`, beside the existing `fight` entry, which stays.

**Rules that matter for residents** (their sheets are split into tinted layers, see [art-spec.md](../design/art-spec.md)):
- Keep the reference outfit exactly: teal jumpsuit, orange chest stripe, dark hair, light skin, brown boots.
- **Weapon colours:** neutral grey or black steel and **dark** brown wood only. The build reads teal or cyan as the suit, bright saturated orange, yellow or red as the rarity trim, light tan as skin, and dark blue-grey near the head as hair, and recolours them. So: no teal or blue-tinted gunmetal, no light blond wood, no hazard-yellow paint, no glowing parts.
- **No muzzle flashes, sparks or motion lines.** They get tinted, and they bridge frames (Pip's sheet needed hand cleanup for this). Show recoil with the pose.
- **Keep the weapon below the top of the head in every frame.** The figure is scaled so its topmost pixel is at full height, so a club raised overhead shrinks the whole resident. If a melee swing must go overhead, add `"fitHeight": false` to that entry so it shares the walk's scale.
- Both hands on the weapon where the pose uses both, and gripping it properly (fingers round the grip and fore-end). This is the whole point of the change.

**Legend bodies (P3):** the same five sheets for each of the 11 legend bodies, which all have a `fight` anim today: `legend_ada_quill`, `legend_brother_wick`, `legend_captain_orla`, `legend_doc_ferris`, `legend_granny_ash`, `legend_june_halloran`, `legend_lucky_lou`, `legend_marla_voss`, `legend_pip`, `legend_rook`, `legend_seven`. Files `art/raw/legend_<id>/fight_<grip>.png`, same 2752 × 1536 grid, made from that legend's own `fight.png` plus the new resident grip sheet. Their entry has no `regions` (legend bodies aren't recoloured):

```json
"fight_pistol": { "file": "fight_pistol.png", "fps": 10, "split": "figures" }
```

Legends paint their real colours, so the weapon-colour rule above doesn't apply to them. Lucky Lou stays on magenta (his folder's top-level `"background": "magenta"`). The weapon still stays below the top of the head.

**Priority:** resident_m and resident_f first (P1; every fight in the first hour), in the order pistol, long gun, melee, unarmed, heavy (the order players meet the weapons). Then legends (P3), one legend at a time.

**Count:** 2 bodies × 5 = 10 (P1), plus 11 legends × 5 = 55 (P3), **65 images**.

---

## 3. Vault rooms and structures

### V1. Elevator shaft and car (P1, 2 images, needs hookup)
- **Now:** `vaultView.ts:drawRoomBox`, case `elevator`: a flat dark box with a centre rail and an amber-striped grey car. It is the only underground room type with no painting, and it runs down the middle of every homestead from the first second (the new tutorial starts with only the door and the shaft).
- **Deliver:** `art/raw/room_elevator/shaft.png` (full bleed, `background: none`) and `car.png` (magenta), with a `sprite.json` like `room_generator`'s (`kind: portrait`, `outDir: rooms`, `prefix: room_elevator_`), entries `"shaft"` and `"car"`; put `"background": "magenta"` on the `car` entry.
- **Shape:** the shaft is one cell wide by one floor tall, **1:3** (for example 768 × 2304). It must **tile vertically without a seam** (the top edge continues into the bottom): riveted steel guide rails, a cable, cross-bracing, a dim work lamp. The car is about 1 cell wide and 0.7 floor tall on magenta: a cage lift with a folding gate, brass trim, a little floor indicator dial.
- **Note:** residents will ride the car when reassigned (playtest item 7), so the car is drawn separately and moves. The code needs to draw the shaft art across the whole cell rather than inside the usual back-wall inset.

### V2. Door levels 2 and 3 (P2, 2 images, wired)
- **Now:** `art/raw/room_door/` has only `level1.png`, and `roomWall` falls back to it, so an upgraded door looks unchanged.
- **Deliver:** `art/raw/room_door/level2.png` and `level3.png` at **3168 × 1344 (21:9)**, like level 1, image-to-image from it; add `"2"` and `"3"` entries to its `sprite.json`. Level 2 is a reinforced door with extra bolts and a heavier frame, level 3 a showpiece vault door with hydraulic rams and brass.

### V3. Door damage marks (P2, 1 image, needs hookup)
- **Now:** `creatureArt.ts:drawDoorDamage`: flat grey claw scratches and a dent over the door while a Mauler or raiders batter it.
- **Deliver:** `art/raw/fx_door_damage/damage.png`, magenta, three stages side by side (light scratches, deep gouges, buckled and dented), `kind: portrait`, `split: figures`, `order: x`, names `["1", "2", "3"]`, `outDir: fx`. Each about 1:1 and sized to overlay the painted door slab.

### V4. Room frame (P2, 1 image, needs hookup)
- **Now:** `vaultView.ts:drawRoomBox` with `shell = true` still draws every room's box in flat colour around the painted wall: the dark frame, the ceiling and floor planes in perspective, and the two side walls. It's the most visible remaining style clash, since it borders every painting.
- **Deliver:** `art/raw/room_frame/frame.png`, full bleed: a painted room box with the back wall area left as flat magenta (it's cut out and the painted wall shows through). Riveted steel ceiling with a lamp strip, a scuffed floor lip, side walls in perspective. **3:1** at 3 segments, painted so the code can stretch the middle and keep the ends (a 9-slice), for example 3072 × 1024.

### V5. Deep-floor room frame (P3, 2 images, needs hookup)
- **Now:** `deepArt.ts:drawDeepFrame`: jagged rock teeth around rooms below floor 25, and timber and steel bracing once Deep Bracing is researched.
- **Deliver:** `art/raw/room_frame/deep.png` and `deep_braced.png`, magenta, the same shape as V4's frame: a raw rock border, and the same with shoring timbers and steel props.

### V6. The Warden's Seal monument (P3, 1 image, needs hookup)
- **Now:** `creatureArt.ts:drawSealMonument`: a stepped plinth, an obelisk with a brass seal, an inscription band and a small pennant, on the ground left of the door once the Warden's Seal is earned.
- **Deliver:** `art/raw/seal_monument/monument.png`, magenta, **1:2** (for example 1024 × 2048), ground line at the bottom, `kind: portrait`, `outDir: props`, `trimBottom: true`. A brass star-in-a-ring seal on a concrete obelisk; the pennant is a plain Halcyon teal swallowtail with no lettering.

---

## 4. Surface

### S1. Backdrops: sky panorama, ground crust, dirt (P1, 3 images, wired)
- **Now:** `vaultView.ts:drawBackground`: a banded sky gradient with two flat polygon mesas, a flat brown crust strip, and flat brown earth with rectangle speckles. The earth fills the whole screen around the rooms, so it's on screen at all times.
- **Deliver:** exactly as in [ART-HANDOFF-M9.md §10](ART-HANDOFF-M9.md#10-backdrops-the-sky-above-ground-and-the-dirt-around-the-homestead): `art/raw/backdrop/surface.png` (about 3:1, wraps sideways), `crust.png` (about 8:1, wraps sideways), `dirt.png` (1:1, wraps both ways, dark and low contrast). The code is already wired, so these show up as soon as they're built. Do `dirt` first.

### S2. Caravan handcarts (P2, 1 image, needs hookup)
- **Now:** `vaultView.ts:updateCaravans`: a box of rectangles on two circle wheels, with a triangle pennant in the faction's colour, leading each caravan party across the surface.
- **Deliver:** `art/raw/caravan_carts/carts.png`, magenta, five handcarts in a row, facing right, each flying its faction's pennant: caravaners amber `#f2a541`, tinkers teal `#4fb3a9`, lamplighters cream `#f4ecd8`, rustmen rust `#b5562f`, homestead9 pale blue `#7fb7c9`. `kind: portrait`, `split: figures`, `order: x`, names `["caravaners", "tinkers", "lamplighters", "rustmen", "homestead9"]`, `prefix: cart_`, `outDir: props`. Each cart about 3:2, loaded with crates and a tarp; about as tall as a resident's waist in game.

### S3. Wind turbine rotor (P3, 1 image, needs hookup)
- **Now:** the painted turbines are drawn with a still rotor (the code can't animate a painting). Without art, `topsideArt.ts:drawTopsideParts` spins a drawn one.
- **Deliver (optional):** `art/raw/room_wind_turbine/rotor.png`, magenta, one three-blade rotor seen face on, 1:1, so the code can spin it over the painted tower. Only worth doing if the still rotor bothers people.

---

## 5. The Deep

### D1. Stratum rock textures (P2, 4 images, needs hookup)
- **Now:** `deepArt.ts:buildDeepBackground` and `stratumFeatures`: each dug stratum (5 floors) is a flat rock colour with speckles and drawn features.
- **Deliver:** `art/raw/backdrop/stratum1.png` to `stratum4.png`, added to the backdrop `sprite.json`. **1:1, tiling both ways** (for example 1024 × 1024), dark and low contrast like `dirt`, getting darker and stranger with depth:
  1. The Service Levels: grey rock with Halcyon conduit runs, teal pipes with brass collars, a junction lamp.
  2. The Cisterns: wet dark rock, water streaks, black pools, great riveted pipes.
  3. The Proving Floors: pale veins, glowing specks, ribbed shapes of shed skins.
  4. The Seal: near-black rock with warm glowing cracks from somewhere below.
- The stratum names stay as text in the margin.

### D2. Sealed boundary bulkhead (P2, 1 image, needs hookup)
- **Now:** `deepArt.ts:drawSealedBoundary`: a concrete band with chevrons under the last dug stratum, fading into black.
- **Deliver:** `art/raw/backdrop/bulkhead.png`, full bleed, **8:1** (2048 × 256), tiling sideways: a concrete and steel bulkhead with hazard chevrons and bolts.

### D3. The Seal (P3, 2 images, needs hookup)
- **Now:** `deepArt.ts:drawTheSeal`: at the very bottom, one bulkhead as wide as the homestead with a half-sun sunburst.
- **Deliver:** `art/raw/backdrop/seal_band.png` (8:1, tiling sideways, heavier and older than D2, heat bleeding round the edges) and `seal_centre.png` (magenta, 2:1, a half-sun of brass rays over a round hatch, not a cog), which the code centres on the band.

### D4. Dig site rig (P2, 2 images, needs hookup)
- **Now:** `deepArt.ts:DeepLayer` draws the excavation under the shaft while a stratum is dug: a derrick of amber bars, timber-ringed shaft, a spiral drill head, flying debris and a flashing lamp.
- **Deliver:** `art/raw/dig_rig/derrick.png` (magenta, 1:2, a small lattice derrick with a winch and a work lamp, `kind: portrait`) and `art/raw/dig_rig/drill.png` (magenta, a 4-frame row of the drill head turning, `kind: creature` so it builds as an animation strip; name the anim `idle`). The debris and dust stay drawn.

---

## 6. Residents and overlays

### R1. Resident badges (P2, 1 image, needs hookup)
- **Now:** `vaultView.ts:drawOverlays`, `drawRarityPip`, `drawHeart`, `drawFallenMark`: small shapes drawn over the sprite art.
- **Deliver:** `art/raw/badges/badges.png`, magenta, five small icons in a row with gaps, `kind: portrait`, `split: figures`, `order: x`, `fit: 64`, `outDir: icons`, `prefix: badge_`, names:
  - `heart`: a plump red heart (expecting residents, and over courting couples)
  - `fallen`: a dark round token with a pale red medical cross (a fallen resident who can be revived)
  - `rare`: a small silver pip
  - `legendary`: a small gold pip
  - `legend`: a gold five-point star badge with a dark rim (legendary residents)
- Each reads at 12 px. The weapon at the hip is gone (§2), so it isn't listed.

---

## 7. Incidents and enemies

All quest enemies and bosses have creature art, and so do the vault's skitters, burrowers, rustmen, deepcrawlers, Hollowed and Glassbacks. What is still drawn:

### I1. Fire (P1, 1 image, needs hookup)
- **Now:** `vaultView.ts:drawIncident`, case `fire`: rows of orange and yellow triangles flickering along the floor. Fire is the most common first incident.
- **Deliver:** `art/raw/fx_fire/`, a `kind: creature` folder with one anim `idle`: a looping sheet of **8 frames** of a knee-high patch of cartoon flames with a little smoke, one row, green `#00FF00`, feet (the base of the flames) on a common line. Hard-edged cel flames with no soft glow, so the key stays clean. The code repeats it along the room.

### I2. Electrical surge (P2, 1 image, needs hookup)
- **Now:** `creatureArt.ts:drawSurge`: blue jagged bolts over the walls and floor, sparks and a flicker.
- **Deliver:** `art/raw/fx_surge/`, `kind: creature`, anim `idle`, 6 frames of a crackling arc cluster jumping off a junction box, magenta. The room flicker stays drawn.

### I3. The Mauler in the vault (P2, 1 image, needs hookup)
- **Now:** `creatureArt.ts:drawMauler`: the vault Mauler walks in from the horizon, claws the door and walks room to room, drawn from shapes. The `mauler` creature art has idle, attack and death, but no walk.
- **Deliver:** `art/raw/mauler/walk.png`, a walk cycle, 8 frames, magenta, from `idle.png` image-to-image, with a `"walk"` entry in its `sprite.json` like `"idle"` (`split: figures`, `mirror: true`). The code then uses idle, walk and attack.

### I4. Cave-in (P3, 2 images, needs hookup)
- **Now:** `deepArt.ts:drawDeepIncident`, case `cavein`: rubble polygons, falling rock shapes, ceiling cracks and dust.
- **Deliver:** `art/raw/fx_cavein/rubble.png` (magenta, three rubble heaps, big to small, with a bent strut, `kind: portrait`, `split: figures`, names `["1", "2", "3"]`, `outDir: fx`, `prefix: rubble_`) and `rocks.png` (magenta, four falling rocks, names `["a", "b", "c", "d"]`, `prefix: rock_`). The dust and cracks stay drawn.

### I5. Flood (P3, 1 image, needs hookup)
- **Now:** `deepArt.ts:drawDeepIncident`, case `flood`: rising water (fine as an effect) and a drawn burst pipe spraying.
- **Deliver:** `art/raw/fx_flood/pipe.png`, magenta, a burst wall pipe with a split flange, about 2:1, `kind: portrait`, `outDir: fx`. The water stays drawn.

### I6. Warning beacon (P3, 1 image, needs hookup)
- **Now:** `deepArt.ts:beacon`: a flashing ceiling lamp in rooms with a deep incident.
- **Deliver:** `art/raw/fx_beacon/beacon.png`, magenta, two frames side by side (off, on) of a caged red rotating lamp, names `["off", "on"]`, `outDir: fx`, `prefix: beacon_`.

---

## 8. Quest map (ruins)

The quest screen (`questView.ts`, `ruinArt.ts`) draws each quest as ruined cutaway rooms under a skyline. None of it is painted yet. Rooms are 360 × 210 world units, in three themes picked from the quest: `relay` (grey concrete, teal diodes), `homestead` (cream Halcyon enamel, amber trim) and `scrapyard` (rust and corrugated sheet).

### Q1. Quest sky (P2, 1 image, needs hookup)
- **Now:** `questView.ts:drawSky`: a bruised purple-to-dusk gradient with a pale Glare sun.
- **Deliver:** `art/raw/quest_backdrop/sky.png`, full bleed, **16:9** (2752 × 1536): a bruised violet sky, sickly green-white Glare sun top right, thin clouds. No land.

### Q2. Quest skyline (P2, 1 image, needs hookup)
- **Now:** `questView.ts:rebuildStatics`: far mesa polygons, a bombed-out skyline of rectangles with lit windows, leaning radio masts, then a flat ground strip and speckled rock.
- **Deliver:** `art/raw/quest_backdrop/skyline.png`, magenta, **4:1**, tiling sideways: far mesas and a broken town skyline in dusk purples, a few lit windows, a leaning mast with a red light. The ground and rock under the rooms reuse S1's `crust` and `dirt`.

### Q3. Ruin room walls (P2, 9 images, needs hookup)
- **Now:** `ruinArt.ts:drawRuinRoom`: a cutaway box like the vault rooms, with peeling wainscot, stains, cracks, a blown-out hole, broken pipes, a dangling lamp and theme dressing (dead equipment racks, a faded HALCY poster, corrugated patches).
- **Deliver:** `art/raw/ruin_<theme>/` for `relay`, `homestead` and `scrapyard`: `wall1.png`, `wall2.png` (two variants so neighbouring rooms differ) and `boss.png` (a darker lair: hazard stripes, scorch marks, a nest of scrap). Full bleed, `background: none`, **16:9** (2752 × 1536; the back wall shows at about 1.8:1). `kind: portrait`, `outDir: ruins`, `prefix: ruin_<theme>_`. Same style as the vault walls, but ruined: the homestead theme is a vault room like the ones players build, 40 years abandoned. Doorways, ladder hatches and rubble stay drawn over them.

### Q4. Ruin room props (P2, 2 images, needs hookup)
- **Now:** `ruinArt.ts:drawContents`: footlockers (lids off once looted), a console with one stubborn light, a boss's trophy pile, daylight through a broken entrance hatch.
- **Deliver:** `art/raw/ruin_props/props1.png` (magenta: `locker_shut`, `locker_open`, `console`) and `props2.png` (magenta: `trophies`, `hatch`), `split: figures`, `order: x`, `outDir: ruins`, `prefix: prop_`. Each about knee to waist height in game.

### Q5. Passages (P3, 3 images, needs hookup)
- **Now:** `ruinArt.ts:drawCorridor`, `drawLadder`, `drawStairs`: flat-colour connecting passages.
- **Deliver:** `art/raw/ruin_props/corridor.png` (full bleed, 2:1, tiles sideways: a short rubble-strewn service tunnel), `ladder.png` (magenta, 1:4, tiles vertically: a rusty ladder in a shaft) and `stairs.png` (magenta, 1:1, a broken concrete stairway going down to the right; the code mirrors it).

### Q6. Map markers (P2, 1 image, needs hookup)
- **Now:** `questView.ts:rebuildStatics`: HALCY's objective flag (a pole and triangle), a grey `?` over rooms that are known but unseen, and `chevron()` arrows in doorways you can tap.
- **Deliver:** `art/raw/ruin_props/markers.png`, magenta, three icons: `objective` (a small amber Halcyon pennant on a pole), `unknown` (a stencilled question mark on a scrap of board; one of the few images with a symbol), `go` (a chunky amber arrow pointing right), `fit: 96`, `outDir: icons`, `prefix: map_`.

---

## 9. Items, resources and crates

Every weapon, outfit and salvage type has an icon (`items/<id>.webp`), so the emoji fallback in `icons.ts` never shows.

### M1. Resource icons (P1, 2 images, needs hookup)
- **Now:** the room's "ready" bubble draws a flat black glyph (`vaultView.ts:drawResourceGlyph`: a bolt, a circle, a drop, and a plus for everything else). The HUD meters show the **letters** P, F and W (`ui.ts:renderHud`). The HUD chip, crate cards, research lines and trade panels use emoji: ⚡ 🥫 💧 ✚ ☢ 💰 🎟 🗺.
- **Deliver:** `art/raw/ui_icons/resources1.png` (`power`, `food`, `water`, `scrip`) and `resources2.png` (`medpatch`, `purge`, `crate_token`, `treasure_map`), magenta, four per sheet with gaps, like `art/raw/items/`: `kind: portrait`, `split: figures`, `order: x`, `take: 4`, `fit: 96`, `outDir: icons`, `prefix: ""`.
  - `power`: a chunky lightning bolt over a small brass battery cell
  - `food`: a dented tin can with a plain label and a fork
  - `water`: a fat droplet with a highlight, or a water flask
  - `scrip`: a small stack of stamped tin tokens with a Halcyon sunburst
  - `medpatch`: an adhesive patch with a red cross
  - `purge`: a small vial of violet liquid with a hazard trefoil-like symbol (made up, not the real radiation sign)
  - `crate_token`: a punched brass ticket
  - `treasure_map`: a rolled map with a red X
- They must read inside a 28 px coloured circle (the ready bubble) and at 16 px in text.

### M2. Crafted-item bubble (P1, 0 images, code only)
- **Now:** `vaultView.ts:drawItemGlyph` draws a black gun or coat silhouette in the bubble when a workshop finishes. The item's own icon already exists, so this needs no art, only a code change to show it.

### M3. Supply crates (P1, 2 images, needs hookup)
- **Now:** the crate panel and the crate-opening cards are CSS: a striped card back (`style.css` `.crate-card .back`) and a gradient front with an emoji. The HUD crate chip is 📦. The new tutorial opens a crate in the first minutes.
- **Deliver:** `art/raw/crates/crates.png`, magenta, three closed crates in a row: `standard` (a wooden supply crate with a Halcyon stencil shape), `rare` (a steel footlocker with silver trim), `legendary` (a brass-bound chest with a gold glow painted on, not a halo), `split: figures`, `order: x`, `fit: 192`, `outDir: icons`, `prefix: crate_`. Plus `art/raw/crates/card_back.png`, full bleed, **2:3**: the back of a reward card, riveted teal panel with a sunburst.

### M4. New arrival portrait (P2, 1 image, needs hookup)
- **Now:** a crate card that brings a resident shows 🧑, and faction recruits show 👤 (`ui.ts`, `factions.ts`).
- **Deliver:** `art/raw/ui_icons/arrival.png`, magenta, a head-and-shoulders silhouette of a resident in a Halcyon jumpsuit, in shadow with a warm rim light (so it works for anyone), 1:1, `outDir: portraits`, name `arrival`.

---

## 10. HUD, toolbar and UI icons

All of these are emoji or letters today, and they sit right next to painted item icons. Deliver them like M1: `art/raw/ui_icons/<sheet>.png`, magenta, four icons per sheet with clear gaps, `kind: portrait`, `split: figures`, `order: x`, `fit: 96`, `outDir: icons`, `prefix: ""`, `names` left to right. Same icon style as the item icons: a single chunky object, three-quarter view, bold outline, readable at 20 px. The code session swaps each emoji for `sprites/icons/<name>.webp`.

### U1. Toolbar and HUD (P1, 13 icons, 4 sheets)
- **Now:** `ui.ts:renderToolbar` uses 🧭 ⚔ 🔬 ☰ on phones and words on desktop; the HUD chips say "Pop" and "Mood" in words.
- **Icons:** `build` (a hammer and a blueprint), `residents` (two jumpsuited heads), `storage` (a footlocker), `crates` (the standard crate, smaller), `explore` (a brass compass), `quests` (a crossed pistol and wrench), `research` (a microscope), `factions` (a handshake), `legacy` (a folded charter with a wax seal), `goals` (a trophy cup), `menu` (a clipboard), `population` (a little homestead door with a head count), `mood` (a smiling face on a round badge).

### U2. Shift and weather chips (P2, 7 icons, 2 sheets)
- **Now:** `traits.ts` (🌅 ☀ 🌙) and `topside.ts` (☀ 🌪 ☢ 🔥).
- **Icons:** `shift_morning`, `shift_day`, `shift_night`, `weather_clear`, `weather_dust`, `weather_taintstorm` (a sickly green storm cloud), `weather_heatwave`.

### U3. Incident icons (P2, 11 icons, 3 sheets)
- **Now:** `ui.ts:INCIDENT_TOAST`, notices and the Collection Log use 🔥 🪲 ⛏ ⚔ 🪨 🌊 🕷 ⚡ ☢ 🕸 ⚠.
- **Icons:** `inc_fire`, `inc_skitters`, `inc_burrowers`, `inc_rustmen`, `inc_cavein`, `inc_flood`, `inc_deepcrawlers`, `inc_surge`, `inc_hollowed`, `inc_glassbacks`, `inc_maulers`. Creature ones are a small head of that creature from its sprite art.

### U4. Notice groups and research branches (P2, 9 icons, 3 sheets)
- **Now:** `notices.ts:GROUPS` and `research.ts:BRANCH_ICON`.
- **Icons:** `crafting` (a wrench on a bench), `rewards` (a rosette), `homestead` (a homestead door in a hillside), `warning` (a hazard triangle); research branches `industry` (a cog on a piston), `medicine` (a medical bag), `defense` (a riveted shield), `automation` (a little Halcyon helper robot), `deep` (a pickaxe). The other groups and branches reuse U1 icons.

### U5. Status glyphs (P3, 8 icons, 2 sheets)
- **Now:** 🔒 ✓ ✕ ⚠ ☠ ★ ◆ ☹ across every panel (locked items, danger pips, rarity marks, mood).
- **Icons:** `lock` (a brass padlock), `check` (a green tick on a tag), `cross` (a red X on a tag), `alert` (a small hazard triangle), `skull` (a cartoon skull, not a real-world hazard symbol), `star` (a gold star), `diamond` (a silver diamond), `sad` (a frowning badge). Arrows (▾ ▸ → ↑ ↓) stay as text.

### U6. Rulesets and custom-game presets (P3, 15 icons, 4 sheets)
- **Now:** `rules.ts:RULE_ICON` and `custom.ts:PRESET_ICON`.
- **Icons:** rulesets `famine`, `lean_times`, `brownout`, `short_fuse`, `no_radio`, `iron_door`, `endless_night`, `glass_sky`, `skeleton_crew`, `rules` (a balance scale, the default); presets `blank_slate`, `boomtown`, `deep_day_one`, `ruined`, `all_rooms`.

### U7. Faction emblems (P3, 5 icons, 2 sheets)
- **Now:** `factions.ts` and `endings.ts` use 🛒 🔧 🕯 ⚔ 🏢 next to the painted leader portraits.
- **Icons:** `faction_caravaners` (a wagon wheel), `faction_tinkers` (a gear and calipers), `faction_lamplighters` (a lantern), `faction_rustmen` (a rebar crown), `faction_homestead9` (a cold blue "9" plate; a symbol, not a word).

### U8. Collection Log and the Deep (P3, 5 icons, 2 sheets)
- **Now:** `collection.ts` (🐾 ▦ and a ✪ medal drawn in CSS), `deep.ts:KIND` (📜 🗿).
- **Icons:** `creature` (a paw print), `room` (a small room cutaway), `seal_medal` (the Warden's Seal as a medal), `halcyon_log` (a Halcyon logbook), `relic` (a strange pre-Glare artefact on a stand).

---

## 11. Screens and modals

### X1. Region banners (P2, 3 images, needs hookup)
- **Now:** the Explore panel's region cards are text on a CSS gradient (`ui.ts`, `.region-card`).
- **Deliver:** `art/raw/regions/dustbowl.png`, `glassflats.png`, `stillwater.png`, full bleed, **4:1** banners (4128 × 1024), `kind: portrait`, `outDir: regions`, `prefix: ""`. Dustbowl: dunes and a buried billboard frame; Glassflats: a glittering glass plain under the Glare; Stillwater: a drowned town with rooftops above flat water. Keep the left third calm; the region name sits there.

### X2. App icon and splash (P2, 2 images, needs hookup)
- **Now:** `public/icons/icon.svg` is a flat amber house shape; the PNG icons and the native splash follow it.
- **Deliver:** `art/raw/app/icon.png` (1:1, 1024 × 1024, full bleed: a homestead door in a hillside, warm light spilling out, readable at 48 px) and `splash.png` (1:1, 2732 × 2732, the same scene wider with the centre third safe). The code session generates the icon sizes from these.

### X3. New homestead sites (P3, 4 images, needs hookup)
- **Now:** the Legacy "found a new homestead" flow shows each site as an emoji on a tinted CSS card (`prestige.ts:SITE_LOOK`, "the content has no art for sites yet").
- **Deliver:** `art/raw/sites/plot7.png`, `dry_wells.png`, `rust_country.png`, `the_scorch.png`, full bleed, **16:9**, `outDir: sites`: a surveyor's view of each plot of land, with a small marker flag where the door will go.

### X4. Ribbon-cutting ceremony (P3, 1 image, needs hookup)
- **Now:** a red CSS ribbon with a rosette that splits in two when a new homestead opens (`style.css` `.ribbon`).
- **Deliver:** `art/raw/sites/ribbon.png`, magenta, a red ribbon with a rosette across a doorway, **4:1**. The cut animation can stay CSS over it.

### X5. Deep discovery modal (P3, 2 images, needs hookup)
- **Now:** Halcyon logs and relics open on a CSS paper or radial-gradient panel (`deep.ts`, `.disc-paper`).
- **Deliver:** `art/raw/sites/log_paper.png` (full bleed, 3:4, an aged Halcyon memo sheet with a letterhead shape and no words) and `relic_case.png` (full bleed, 3:4, a museum display case interior, velvet and brass).

### X6. Unmet legend silhouette (P3, 1 image, needs hookup)
- **Now:** a legend you haven't met shows as a CSS-drawn head silhouette (`legends.ts:legendPortrait` with `silhouette`).
- **Deliver:** `art/raw/legends/silhouette.png`, magenta, a dark head-and-shoulders shape with a gold question-mark glint, 1:1, name `unknown`, `prefix: legend_`.

### X7. UI chrome (P3, 3 images, needs hookup)
- **Now:** every panel, button and HUD bar is a CSS box with a border and a gradient.
- **Deliver (optional polish):** `art/raw/ui_chrome/panel.png` (a riveted dark-teal steel plate with a brass edge, 1:1, painted for a CSS `border-image` 9-slice: plain centre, detail only in a 64 px border), `button.png` (the same, 3:1, a raised enamel button) and `hud_bar.png` (8:1, a riveted strip for the top bar). Keep them dark and quiet, since text sits on them.

---

## Not on the list (and why)

So nobody paints these twice:
- **Room walls at levels 1 to 3** for all 23 room types other than the door and the elevator (the 7 surface buildings included), the door at level 1, residents (6 sheets each), 11 legend bodies, 83 creature looks and bosses, HALCY, legend and faction portraits, 52 item and 21 salvage icons, and the 10 ending illustrations: all painted and in the manifest. Their drawn fallbacks (`drawResident`, `drawEnemy`, `drawTopsideBuilding`, the room props in `drawRoomBox`, `officeArt.ts`, `drawDepthRoom`, the drawn skitters, burrowers, rustmen, Hollowed and Glassbacks, the explorer backpack, the ending glyphs) no longer show.
- **Effects that should stay drawn:** weather (dust, storms, heatwave shimmer), room lamp flicker and brownout dimming, the Deep rooms' animated glow and steam (`DeepLayer.roomFx`), flood water, dust clouds, hit sparks and bursts on the quest screen.
- **Interface marks that are information, not pictures:** progress bars and health bars, the build-mode slots and merge arrows, selection outlines, the green "fits" highlight and stat letters, nameplates, floating numbers, the crit ring, target reticles, telegraph warnings, the fog of war, the "+N" crowd tags, and arrows used as text.

---

## Summary

| Area | Images | P1 | P2 | P3 |
|---|---|---|---|---|
| §1 Wide room walls | 102 | 24 | 54 | 24 |
| §2 Weapon grip fight sheets | 65 | 10 | 0 | 55 |
| 3. Vault rooms and structures | 9 | 2 | 4 | 3 |
| 4. Surface | 5 | 3 | 1 | 1 |
| 5. The Deep | 9 | 0 | 7 | 2 |
| 6. Residents and overlays | 1 | 0 | 1 | 0 |
| 7. Incidents and enemies | 7 | 1 | 2 | 4 |
| 8. Quest map (ruins) | 17 | 0 | 14 | 3 |
| 9. Items, resources and crates | 5 | 4 | 1 | 0 |
| 10. HUD, toolbar and UI icons (73 icons) | 22 | 4 | 8 | 10 |
| 11. Screens and modals | 16 | 0 | 5 | 11 |
| **Total** | **258** | **48** | **97** | **113** |

Images count generations: an icon sheet of four is one image. At 130 credits an image the whole list is about 33,500 credits, against about 120,330 left after round 2 (renews 2026-10-07). P1 alone is 48 images (about 6,200 credits).

**Suggested order:** §1 starter rooms (24) and §2 resident sheets (10), then S1 backdrops, V1 elevator, I1 fire, M1 resources, M3 crates and U1 toolbar. Then P2 by area, then P3.

---

## How to deliver

1. Put the raw PNG(s) in the named `art/raw/<folder>/` and add or extend its `sprite.json` as shown in each entry.
2. Build only that folder: `npm run sprites -- <folder>` (several folders at once is fine, for example `npm run sprites -- room_generator room_waterworks`). This merges into the existing manifest in seconds instead of rebuilding all of `art/raw`.
3. Check the output. Character and creature folders write previews to `art/previews/<id>_<anim>.png` (cut frames) and `art/previews/<id>_lineup.png` (sizes). Portrait-kind folders (walls, icons, backdrops) write no previews, so look at the files under `public/sprites/<outDir>/`.
4. Look at it in the game with `npm run dev` (no offline cache), on desktop and at phone width. Useful console helpers: `homestead.qol.bigVault(40)` for many merged rooms, `homestead.m7.topside()` for the surface, `homestead.m9.creature('glassbacks')` and the other incident helpers for fights.
5. Commit the raw PNG, the generated WebP files and `public/sprites/manifest.json` together, and add a licensing row in [SPRITE-HANDOFF.md §8](SPRITE-HANDOFF.md).
6. For anything marked **needs hookup**, tell the code session which folders landed; §1, §2, S1 and V2 show up on their own.

Partial delivery is fine everywhere: anything missing keeps its current look.

---

## Delivery log

Updated by the art session as batches land. "Shows up on its own" means the code already reads it; "needs hookup" means the code session still has to wire the folder.

| Date | Items | Folders | Code |
|---|---|---|---|
| 2026-09-28 | §1 P1 wide walls: generator, waterworks, canteen, quarters, levels 1 to 3, `w2` and `w3` (24) | `room_generator`, `room_waterworks`, `room_canteen`, `room_quarters` | shows up on its own |
| 2026-09-28 | §2 P1 grip fight sheets: pistol, long gun, melee, unarmed, heavy for `resident_m` and `resident_f` (10) | `resident_m`, `resident_f` | shows up on its own (melee entries use `fitHeight: false`) |
| 2026-09-28 | S1 backdrops (`surface`, `crust`, `dirt`); V1 elevator (`shaft`, `car`); I1 fire; M1 resources (2 sheets); M3 crates (`crate_standard`, `crate_rare`, `crate_legendary`, `crate_card_back`); U1 to U8 icon sheets, R1/Q6 icons as available (75 icons in `ui_icons`, names as in the list; map markers are `map_objective`, `map_unknown`, `map_go`) | `backdrop`, `room_elevator`, `fx_fire`, `crates`, `ui_icons` | S1 shows up on its own; the rest need hookup |
| 2026-09-28 | Deep: D1 strata 1 to 4, D2 bulkhead, D3 `seal_band` and `seal_centre`, D4 derrick (`dig_rig/derrick`) and drill (own folder `dig_drill`, creature `idle`); V4/V5 room frames (`room_frame`: `frame`, `deep`, `deep_braced`); V6 monument; S2 carts; R1 badges (`badges`); I2 surge, I4 rubble and rocks (names `rubble_1..3`, `rock_a..d`), I5 pipe, I6 beacon; Q1 to Q5 quest sky, skyline, nine ruin walls, ruin props, corridor, ladder, stairs; M4 arrival; X1 regions; X2 app icon; X3 sites (3 of 4) and X5 log paper and relic case; X6 legend silhouette (`legend_unknown`); X7 UI chrome | `backdrop`, `room_frame`, `seal_monument`, `caravan_carts`, `dig_rig`, `dig_drill`, `badges`, `fx_surge`, `fx_cavein`, `fx_flood`, `fx_beacon`, `quest_backdrop`, `ruin_relay`, `ruin_homestead`, `ruin_scrapyard`, `ruin_props`, `arrival`, `regions`, `app`, `sites`, `legends`, `ui_chrome` | needs hookup (the code session reads these paths; where a folder name differs from the list above it is noted in the Items column) |
| 2026-09-28 | Redo and P2 batch: door levels 2 and 3, mauler walk, door-damage patches, wind turbine rotor, dry-wells and ribbon site art, splash, log/relic icons; P2 wide walls for storeroom, clinic, purgelab, radio and lab (levels 1 to 3, `w2` and `w3`, 30) and the surface types solar_array, wind_turbine, rain_catcher, farm_plots at `w2` (12) | `room_door`, `mauler`, `fx_door_damage`, `room_wind_turbine`, `sites`, `app`, `ui_icons`, `room_storeroom`, `room_clinic`, `room_purgelab`, `room_radio`, `room_lab`, `room_solar_array`, `room_wind_turbine`, `room_rain_catcher`, `room_farm_plots` | walls show up on their own; door, mauler walk and fx need hookup |
| 2026-09-28 | Wide walls, rest of P2 and P3: surface types `w3` (solar_array, wind_turbine, rain_catcher, farm_plots, 12) and the Deep rooms geothermal, fungalfarm, refinery, aquifer at `w2` and `w3` (24), so every merging room now has all six wide walls (102 in total); legend fight grips: pistol, long gun, melee, unarmed, heavy for all 11 legend bodies (55) | `room_solar_array`, `room_wind_turbine`, `room_rain_catcher`, `room_farm_plots`, `room_geothermal`, `room_fungalfarm`, `room_refinery`, `room_aquifer`, `legend_ada_quill`, `legend_brother_wick`, `legend_captain_orla`, `legend_doc_ferris`, `legend_granny_ash`, `legend_june_halloran`, `legend_lucky_lou`, `legend_marla_voss`, `legend_pip`, `legend_rook`, `legend_seven` | walls show up on their own; legend grip sheets show up wherever the grip lookup already reads `fight_<grip>` for legend bodies, otherwise they need hookup (melee entries use `fitHeight: false`) |
| 2026-09-28 | V7 training room walls: weight_room, reading_room, lounge, shooting_gallery, tinker_bench, endurance_track, card_parlour at levels 1 to 3 (21) | `room_<type>` | Shows up on its own (`roomWall()`) |
| 2026-09-28 | V7 wide training room walls: the seven training rooms at `w2` and `w3`, levels 1 to 3 (42) | `room_<type>` | Shows up on its own (`roomWall()`) |
| 2026-09-28 | §2b tool sheets: `fight_extinguish` and `fight_repair` for male and female residents (4), M9 Halcyon Fizz bottle icon (1) | `resident_m`, `resident_f`, `ui_icons` | Needs hookup (animation keys `fight_extinguish`, `fight_repair`; icon `fizz`) |
| 2026-09-28 | Fixes: quarters level 1 (single, w2, w3) redone with a wood plank floor and a flat rug (the rug read as hanging on the wall); toolbar/UI icons redone clean: `residents`, `goals`, `deep_day_one`, `ruined`, `room`, and `fizz` without an outer glow | `room_quarters`, `ui_icons` | Shows up on its own |
| 2026-09-28 | Legend tool sheets: `fight_extinguish` and `fight_repair` for all 11 legends (22), same 12-frame template as the resident sheets | `legend_<id>` (all 11) | Needs hookup (animation keys `fight_extinguish`, `fight_repair` per legend) |

Notes on the wide walls: `w2` is generated at 21:9 from the level's single painting, then cropped to 2:1. `w3` is generated at 4:1 from that level's `w2`, then cropped to 3:1. The image tool sometimes leaves a soft, ghosted patch at 4:1; those were repaired with an edit pass or by copying a sharp neighbour, and a few small soft spots remain at the edges of `quarters` level 1 and 2 `w3` and `canteen` level 2 `w3`.

Completion notes: all 17 merging room types now have `w2` and `w3` at levels 1 to 3. The `w3` walls for `wind_turbine` level 1 and `solar_array` level 3 were rerolled or patched (a sharp neighbouring stack copied over a ghosted one), and small soft spots remain at the edges of a few others (`radio` level 2 `w3`, `purgelab` level 3 `w3`, `fungalfarm` levels 2 and 3 `w3`, `geothermal` level 3 `w3`). Legend grip sheets: two of them (`legend_captain_orla/fight_longgun` and `legend_rook/fight_pistol`) had weapons touching the next figure, so a thin gap was cut between frames so that `split: figures` finds all 12. Folder names for the surface and Deep walls are the existing `room_<type>` folders, and no `regions` entry is set on legend grips.

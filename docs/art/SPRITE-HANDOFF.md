# Character sprite handoff (for the art session)

This is everything needed to make resident sprite sheets for **Homestead**, an original atompunk colony game inspired by Fallout Shelter (original IP; no Fallout names or look). You make the sheets. The repo turns them into game sprites with one command.

Deeper technical detail is in [`docs/design/art-spec.md`](../design/art-spec.md). This page is the short version to work from.

For what has already been made (residents, creatures, portraits, icons and room walls) and what is still open, see [ART-SESSION-HANDOFF.md](ART-SESSION-HANDOFF.md). **The current to-do list (round 2: legends, loot icons, bosses, topside, factions, endings) is [ART-HANDOFF-M9.md](ART-HANDOFF-M9.md).**

---

## 1. What already exists

| id | Body | Animations done | Source |
|---|---|---|---|
| `resident_f` | female | `walk`, `idle`, `work`, `fight`, `fallen`, `carry` | `art/raw/resident_f/` |
| `resident_m` | male | `walk`, `idle`, `work`, `fight`, `fallen`, `carry` | `art/raw/resident_m/` |

Every resident animation is done and in the game. The female walk was the approved look. The other sheets were generated from it with Artlist's Nano Banana 2 image-to-image model at 2K, and each male sheet used the male walk as its reference. The table in section 2 is kept as the list of what the set covers.

## 2. What to make, in priority order

| # | id / anim | Frames | Loop | What it shows |
|---|---|---|---|---|
| 1 | `resident_m` / `walk` | 8–12 | yes | Male walk cycle, same outfit and colours as the female sheet |
| 2 | `resident_f` / `idle` | 4–8 | yes | Standing, gentle breathing and weight shift |
| 3 | `resident_m` / `idle` | 4–8 | yes | Same as above |
| 4 | `resident_f` / `work` | 6–10 | yes | Working at a console or bench with both hands, facing right |
| 5 | `resident_m` / `work` | 6–10 | yes | Same as above |
| 6 | `resident_f` / `fight` | 6–8 | yes | Holding a rifle-sized weapon at the ready, then firing (recoil) |
| 7 | `resident_m` / `fight` | 6–8 | yes | Same as above |
| 8 | `resident_f` / `fallen` | 1–4 | no | Lying on the ground, knocked out |
| 9 | `resident_m` / `fallen` | 1–4 | no | Same as above |
| 10 | either / `carry` | 8–12 | yes | Optional: the walk cycle with a backpack, for surface explorers |

Children don't need art: they reuse the adult sheet at 62% scale with a lighter suit.

All ten are done. When a sheet is missing, the game falls back as described in section 6.

---

## 3. Hard rules (the recolouring depends on these)

The game recolours **skin, hair, suit and trim** at runtime from one sheet, so every resident looks different. It finds those regions by colour, so the sheet **must** use these reference colours:

| Part | Reference colour | Example hex | Why |
|---|---|---|---|
| Jumpsuit | **Teal**, not green and not blue | `#2FA39B` | Recoloured to the outfit's colour |
| Chest stripe, collar, cuffs | **Bright saturated orange** | `#FF8A1F` | Recoloured to the rarity trim (orange, silver or gold) |
| Hair | **Dark blue-black** | `#1E2433` | Recoloured to one of 7 hair colours |
| Skin | **Light warm skin** | `#F2C9A0` | Recoloured to one of 6 skin tones |
| Boots, belt | **Brown / charcoal** (dark) | `#5A3A22` | Kept as drawn |
| Outlines, eyes | Near-black | `#15110E` | Kept as drawn |
| **Background** | **Flat pure green** | `#00FF00` | Keyed out. Use magenta `#FF00FF` only if the character has green in it |

Keep the whole character inside these colours:
- **No props, no extra colours:** no teal props, no orange pouches or patches, no blue items.
- **Nothing on the background:** no shadow, gradient, floor, text, frame numbers or grid lines.

The pipeline's detection ranges, for reference:
- **suit:** hue 150–197°
- **hair:** hue 197–260° with brightness 0.12–0.5
- **trim:** saturation above 0.66 and brightness above 0.75
- **boots:** the bottom 20% of the figure, brightness below 0.7
- **skin:** warm and brightness above 0.45

### Sheet layout

- **Direction and layout:** side view, facing **right**, full body. Frames go in one row (or a few rows) with **clear empty space between frames**, since frames are found by the gaps. Frames must not touch or overlap.
- **Consistency:** keep the same size and position in every frame, with the feet on a common line.
- **Resolution:** the character should be at least 250 px tall. It is scaled down to about 50 px in game (100 px on high-DPI screens).
- **Proportions:** chunky. The head is about ⅓ of the body height, with a sturdy body and short legs. Thin or realistic proportions lose their detail at game size.
- **Timing:** even. A single bad frame is fine, because it can be dropped.
- **Format:** PNG or WEBP (JPG works but is worse).
- **Matching sheets:** every animation for one character must be the same character, at the same size, in the same outfit.

---

## 4. Prompt template

Use this base and change only the bracketed action.

> 2D game sprite sheet of a single cartoon character, **[walking cycle, 12 frames, evenly spaced timing]**, side view facing right, all frames in one row with even spacing and empty space between frames. Chunky stylised proportions: big head (about 1/3 of body height), sturdy body, short legs, readable at small size. Retro 1950s atompunk look. The character wears a **teal one-piece jumpsuit** with a **bright orange stripe** across the chest and orange collar and cuffs, **brown boots**, and a **brown belt**. **Short dark blue-black hair**, **light warm skin**. Clean dark outlines, soft cel shading. Flat pure green (#00FF00) background, no ground, no shadow, no text, no border.

**Negative prompt:** realistic, photo, thin, tall proportions, multiple characters, overlapping frames, gradient background, floor shadow, props, text, labels, frame numbers, border, grid lines, cropped feet, green clothing, orange or teal props, blue clothing.

### Variations

- **Male:** add "male, broad shoulders, short cropped hair". Keep every colour the same.
- **idle:** `[standing idle, 6 frames, gentle breathing and weight shift]`
- **work:** `[standing at a workbench working with both hands, 8 frames, facing right]`
- **fight:** `[holding a rifle at the ready then firing with recoil, 8 frames, facing right]`
- **fallen:** `[lying on the ground unconscious, 1 to 3 frames]`
- **carry:** `[walking cycle carrying a large backpack, 12 frames]`. The backpack should be brown, not teal or orange.

**If the tool supports a reference or character image,** give it the approved walk sheet for every new animation, so it's the same person.

---

## 5. How to deliver

Put each sheet in the repo like this:

```
art/raw/resident_m/walk.png      ← male walk sheet
art/raw/resident_f/idle.png      ← female idle sheet
...
```

Each character folder has a `sprite.json`. The female one already exists. Create or extend them like this (the `anims` keys must be the animation names above):

```json
{
  "id": "resident_m",
  "sex": "m",
  "targetHeight": 128,
  "referenceAnim": "walk",
  "anims": {
    "walk":   { "file": "walk.png",   "fps": 11, "drop": [], "idleFrame": 2 },
    "idle":   { "file": "idle.png",   "fps": 6 },
    "work":   { "file": "work.png",   "fps": 8 },
    "fight":  { "file": "fight.png",  "fps": 10 },
    "fallen": { "file": "fallen.png", "fps": 4, "loop": false }
  }
}
```

The fields:
- **`drop`:** 0-based frame numbers to throw away, counted left to right and then top to bottom.
- **`idleFrame`:** the frame to show when the character stands still, counted after dropping.
- **`loop`:** defaults to `true`.

Then build and check:

```bash
pip install -r tools/sprites/requirements.txt   # once
npm run sprites -- resident_m                    # just this folder (any number of art/raw folder names)
npm run sprites                                  # every folder (slow: art/raw is large)
```

Naming folders builds only those and merges them into the existing `public/sprites/manifest.json`, leaving everything else as it is. An unknown folder name is an error and builds nothing. With no names, every folder is rebuilt and the manifest is written from scratch.

This writes:
- `public/sprites/<id>/<anim>_<layer>.webp` (the game layers)
- `public/sprites/manifest.json`
- `art/previews/<id>_<anim>.png`: a contact sheet in several colour sets

**Check the preview:**
- Skin turned into suit colour, or hair that didn't recolour, means the colours were off.
- Green fringes mean the background wasn't flat.

Fix the sheet, or tune that character's `"regions"` in `sprite.json` (see `art-spec.md`), then run the command again.

### Options for awkward sheets

Generated sheets are rarely perfect. These per-animation options in `sprite.json` let you use one anyway instead of regenerating:

| Option | Example | Use |
|---|---|---|
| `drop` | `[6, 7, 8]` | Throw away bad frames (0-based, reading order) |
| `crop` | `[0, 0, 2752, 806]` | Use only part of the sheet (e.g. the first row, when the second row drifts off-brief) |
| `split` | `"figures"` | Find frames as separate figures instead of by empty gaps. Use when frames nearly touch (a rifle reaching the next figure) |
| `flip` | `[3]` | Mirror frames (counted after `drop`) that face the wrong way |
| `regions` | `{"hair": {"aboveFraction": 0.36}}` | Override the colour rules for this animation only. `aboveFraction` keeps hair to the head (a gunmetal rifle reads as hair otherwise). `skin.maxSat` and `skin.minVal` keep a leather backpack out of the skin |
| `heightFrom` | `0` | Size the animation from this frame, for sheets where the figure doesn't stand throughout (`fallen`) |
| `fitHeight` | `false` | Share the reference animation's scale instead of fitting this one to `targetHeight` |

Each animation is scaled so the figure stands `targetHeight` tall, because sheets from separate generations come out at different sizes. `art/previews/<id>_lineup.png` shows frame 0 of every animation side by side to check this.

If the art session can't run the pipeline, drop the raw sheets and a short note in `art/raw/<id>/` and commit. The main session will build them.

---

## 6. Wiring status

The code side is done. **Every animation above is picked up as soon as it's built.** No code changes are needed.

- **The loader** (`src/client/render/sprites.ts`) picks a character by `sex`, meaning the first manifest entry per sex. A `resident_m` sheet is used for men automatically. Until then, men are drawn placeholders. A legendary resident with a bespoke body (`"kind": "legend"`, section 7) gets that instead, once it has loaded.
- **`Figure.play(action, time)`** picks the animation for what the resident is doing, and falls back when a sheet is missing:

  | Action | When | Falls back to |
  |---|---|---|
  | `walk` | moving | (always exists) |
  | `idle` | standing in a living room or storage, waiting at the door, or in a quest between fights | walk `idleFrame` |
  | `work` | standing in a production room, workshop, Lab, Radio Room or Command Office | `idle`, then walk `idleFrame` |
  | `fight` | in a room with an incident, or in quest combat | `idle`, then walk `idleFrame` |
  | `fallen` | dead or downed; plays once and holds the last frame | `idle` or walk, rotated flat |
  | `carry` | explorers walking on the surface | `walk` with a drawn backpack |

- **Weapons:** while the `fight` art is showing, the drawn hip weapon is hidden, because the sheet holds its own rifle. With `carry` art, the drawn backpack is hidden.
- **Checking in a browser:** `homesteadView.figures()` in the console counts residents per `action>animation`, for example `{"work>idle": 12, "fight>fight": 3}`, plus `legend:<id>` for each legend drawn with their own body.

## 7. Creatures and portraits

The same pipeline builds enemies, legend bodies and interface portraits. Set `"kind"` in `sprite.json`:

- **`"kind": "creature"`** (in `art/raw/<look>/`, named after the enemy's `look`): full colour, no recolouring. Animations are `idle` (loop), `attack` (plays when it strikes; its early frames are held during a boss wind-up) and `death` (plays once before the fade). Sheets must end up **facing left**, toward the party; use `"mirror": true` for sheets drawn facing right. Use `"background": "magenta"` for anything with green in it. The quest screen and the vault incidents (skitters, burrowers, raiders, deepcrawlers) use the art when a look has some, and draw the old Graphics version otherwise.
- **`"kind": "legend"`** (in `art/raw/legend_<id>/`, with `"legend"` and `"sex"`: the legends.json id defaults to the folder name without `legend_`, and the sex to that legend's): a legendary resident's own body. It is built like a creature (full colour, no recolouring, so no reference colours are needed), but it **faces right** like the residents and has the resident animations: `walk` is required, and `idle`, `work`, `fight`, `fallen` and `carry` are optional and fall back as in section 6. The per-animation options above work too, except `regions` (nothing is recoloured). Its `"id"` must be the folder name (or left out), and each legend can have only one body folder: the build refuses a copy that would overwrite another legend's body. It goes in the manifest's `legends` section and loads the first time that legend is drawn. Legends without one keep the shared body. The weapon overlay and the legend star are still drawn over it, but the outfit colour isn't applied, because the outfit is painted. Delivery details are in [ART-HANDOFF-M9.md](ART-HANDOFF-M9.md) section 9.
- **`"kind": "portrait"`**: each frame is saved as its own image in `public/sprites/portraits/<id>_<name>.webp`, named by `"names"`. HALCY's four faces (`smile`, `talk`, `worried`, `wink`) appear beside her lines (`src/client/ui/halcy.ts`).
- **Item icons** use the portrait kind too (`art/raw/items/`, `"outDir": "items"`, `"prefix": ""`, `"fit": 96`), one image per item id in `public/sprites/items/`. The storage list and crate cards show them (`src/client/ui/icons.ts`), with the old emoji as fallback. Icon sheets often come out shuffled or with repeats: `"order": "x"` reads a row strictly left to right, `"boxes"` names explicit regions of the sheet, and `"background": "corner"` keys any flat background colour.
- **Salvage icons** work the same way (`art/raw/salvage/`, one sheet per material), shown in the salvage cells of the storage panel.
- **Room walls** (`art/raw/room_<type>/`, `"outDir": "rooms"`, `"background": "none"`, `"whole": true`, one animation per level named `1`, `2`, `3`) become `public/sprites/rooms/room_<type>_<level>.webp`. A painted wall replaces the drawn back wall and props; the room frame, level stripes, deep-floor bracing and animated effects are still drawn on top. Rooms that merge (three cells per segment) tile one square image per segment. Office and door images are one wide 21:9 picture. A missing level falls back to the highest lower level, and a room with no art keeps the Graphics version. The elevator has none by design.
- **Topside buildings** (`art/raw/room_<type>/` for the seven surface types) are the same, but on `"background": "magenta"` with `"trimBottom": true` on each level, which drops empty rows under the picture so the building's base sits on the image's bottom edge (the vault view stands the image on the ground line).

| Look | Used by | Animations |
|---|---|---|
| `skitter`, `skitter_queen` | Skitters, Spitters, the Broodmother; the skitter incident | idle, attack, death |
| `burrower` | Burrower pups to the Matriarch; the burrower incident | idle, attack, death |
| `rustman`, `rustman_brute`, `rustman_chief` | Rustmen, Brutes, Toll-Keeper Mags, Baron Oxide; raids | idle, attack, death |
| `hollowed`, `hollowed_hulk` | The Hollowed, Shriekers, Hulks, the Night Supervisor | idle, attack, death |
| `mauler` | The Mauler | idle, attack, death |
| `sentry` | Courtesy Sentries and Greeter Units | idle, attack, death |
| `deepcrawler` | The deepcrawler incident | idle, attack, death |

Game images are written as lossy WebP (alpha lossless), about a third the size of PNG. Characters ship only their tint layers; creatures and legend bodies ship one full-colour layer.

## 8. Licensing: check before anything ships

We need commercial use rights with no attribution or exclusivity strings. Record the tool, plan and date here:

| id / anim | Tool | Plan / licence | Date | Checked |
|---|---|---|---|---|
| resident_f / walk | artlist.io | ? | ? | ☐ |
| resident_f / idle, work, fight, fallen, carry | artlist.io, Nano Banana 2 I2I 2K | AI Suite plan (credits) | 2026-09-24 | ☐ |
| resident_m / all | artlist.io, Nano Banana 2 I2I 2K | AI Suite plan (credits) | 2026-09-24 | ☐ |
| all creatures, HALCY portraits | artlist.io, Nano Banana 2 I2I 2K | AI Suite plan (credits) | 2026-09-24 | ☐ |
| item and salvage icons, room walls | artlist.io, Nano Banana 2 T2I / I2I 2K | AI Suite plan (credits) | 2026-09-25 | ☐ |
| legend and faction portraits, loot icons, 33 bosses, glassback, topside buildings | artlist.io, Nano Banana 2 I2I / T2I 2K | AI Suite plan (credits) | 2026-09-26 | ☐ |
| Act 4: 2 loot icons, 10 bosses, 16 regular enemies, 10 ending illustrations | artlist.io, Nano Banana 2 I2I / T2I 2K | AI Suite plan (credits) | 2026-09-26 | ☐ |
| legend bodies (11 legends × walk, idle, work, fight, fallen, carry) | artlist.io, Nano Banana 2 I2I 2K | AI Suite plan (credits) | 2026-09-28 | ☐ |
| wide room walls (ART-LIST §1), P1: generator, waterworks, canteen, quarters × 3 levels × w2/w3 | artlist.io, Nano Banana 2 I2I 2K | AI Suite plan (credits) | 2026-09-28 | ☐ |
| resident weapon grip fight sheets (ART-LIST §2), P1: pistol, long gun, melee, unarmed, heavy × male/female | artlist.io, Nano Banana 2 I2I 2K | AI Suite plan (credits) | 2026-09-28 | ☐ |
| backdrops, elevator, fire, resource / crate / toolbar / HUD / status / incident / ruleset / faction icons (ART-LIST P1 and part of P2 and P3) | artlist.io, Nano Banana 2 I2I 2K | AI Suite plan (credits) | 2026-09-28 | ☐ |
| Deep strata, frames, quest ruins, region banners, app icon, sites, UI chrome and the remaining ART-LIST P2 and P3 images | artlist.io, Nano Banana 2 I2I 2K | AI Suite plan (credits) | 2026-09-28 | ☐ |
| wide room walls (ART-LIST §1), P2: storeroom, clinic, purgelab, radio, lab and the four surface types; door levels 2 and 3, mauler walk, door-damage patches, rotor, site art | artlist.io, Nano Banana 2 I2I 2K | AI Suite plan (credits) | 2026-09-28 | ☐ |
| wide room walls (ART-LIST §1), rest of P2 and P3: surface types w3, geothermal, fungalfarm, refinery, aquifer w2 and w3; legend weapon grip fight sheets (ART-LIST §2, P3) for 11 legends × 5 grips | artlist.io, Nano Banana 2 I2I 2K | AI Suite plan (credits) | 2026-09-28 | ☐ |
| Training room walls (7 types x 3 levels) | artlist.io, Nano Banana 2 I2I 2K | AI Suite plan (credits) | 2026-09-28 | ☐ |
| Wide training room walls (7 types x 3 levels x w2/w3) | artlist.io, Nano Banana 2 I2I 2K | AI Suite plan (credits) | 2026-09-28 | ☐ |
| Resident tool sheets (extinguisher, repair) and Fizz bottle icon | artlist.io, Nano Banana 2 I2I 2K | AI Suite plan (credits) | 2026-09-28 | ☐ |
| Quarters level 1 floor fix and six redone UI icons | artlist.io, Nano Banana 2 I2I 2K | AI Suite plan (credits) | 2026-09-28 | ☐ |
| Legend extinguisher and repair sheets (22) | artlist.io, Nano Banana 2 I2I 2K | AI Suite plan (credits) | 2026-09-28 | ☐ |

# Character Art Spec

> Making sprites? Start with the short handoff: [`docs/art/SPRITE-HANDOFF.md`](../art/SPRITE-HANDOFF.md). It also covers creatures (enemies) and portraits, which use the same pipeline.

How to make resident sprite sheets that drop straight into the game. The short version:

1. Generate a sheet in the **reference colours** below, on flat green.
2. Put it in `art/raw/<id>/` with a `sprite.json`.
3. Run `npm run sprites`.
4. Check `art/previews/`, then reload the game.

One sheet per body type is all we need. The game recolours skin, hair, outfit and trim at runtime, so there is no per-resident art.

## How recolouring works (why the reference colours matter)

The pipeline (`tools/sprites/build.py`) sorts each pixel into a region by its colour:

| Region | Reference colour in the sheet | Recoloured at runtime to |
|---|---|---|
| suit | **teal** jumpsuit (hue 150–197°) | the outfit's stat colour, or Halcyon teal |
| trim | **bright orange** chest stripe, collar and cuffs (very saturated, bright) | outfit rarity: orange, silver or gold |
| hair | **dark blue-black** hair (hue 197–260°, dark) | one of 7 hair colours |
| skin | **light, warm** skin | one of 6 skin tones |
| boots, belt, eyes, outline | anything else (brown boots, black lines) | unchanged ("base") |

Each region is saved as a grey, shaded layer and multiplied by a tint in game. The palette lives in `src/content/appearance.json`.

A few consequences:

- **Keep the reference colours.** If the suit comes out green, or the hair comes out brown, those pixels land in the wrong layer. They then won't recolour, or will recolour as the wrong thing.
- **Keep the other colours out of the reference ranges.** No teal props, no orange pouches, no blue-black belts. Boots and belts should be brown or charcoal.
- **Shading is kept.** Highlights and shadows inside a region survive recolouring, so lit, rendered art is fine.
- If one sheet keeps misclassifying, you can override a region's thresholds under `"regions"` in its `sprite.json`. The keys match `DEFAULT_REGIONS` in the script. Fix the art first if you can.

## Sheet format

- **Background:** flat pure green `#00FF00`, with no gradient, floor shadow or vignette. Magenta `#FF00FF` also works if the character has green in them.
- **Layout:** frames in one or more rows, with clear empty space between frames. The pipeline finds frames by looking for empty rows and columns, so frames must not touch or overlap.
- **Facing:** the character faces **right**. The game mirrors the sprite for left.
- **Framing:** full body from head to feet, the same size in every frame, feet on a common line. The pipeline aligns frames on the torso and plants the feet anyway, but consistent source art gives a steadier result.
- **Resolution:** at least about 250 px per character height. Sprites are scaled so the reference animation is 128 px tall (`targetHeight`). They are shown at roughly 50 px, or about 100 px on high-DPI screens.
- **Proportions:** chunky and readable at small size: a big head (about 1/4 to 1/3 of the height), a sturdy body, clear silhouettes. The thin, realistic first test lost its detail at game size. The chunky second sheet is the target look.
- **Timing:** an evenly spaced cycle. Use 8–12 frames for a walk. The pipeline can drop bad frames (`drop`), so a sheet with one broken frame is still usable.

## Animations

| Anim | Status | Frames | Loop | Notes |
|---|---|---|---|---|
| `walk` | **used now** | 8–12 | yes | Also provides the idle pose (`idleFrame`) |
| `idle` | wired | 4–8 | yes | Subtle breathing and weight shift |
| `work` | wired | 6–10 | yes | Generic working at a console or bench, facing right |
| `fight` | wired | 6–8 | yes | Holding a rifle-sized weapon at the ready, then firing |
| `fallen` | wired | 1–4 | no | Lying down, used for dead residents |
| `carry` / explorer | wired, optional | 8–12 | yes | Walk with a backpack, for surface explorers |

The game picks the animation for what a resident is doing (`Figure.play` in `sprites.ts`). Every one in the table is wired and is used as soon as it's built. Until an animation exists, the game falls back:

- **Standing, working or fighting:** `idle` if it exists, else the walk sheet's `idleFrame`.
- **Dead:** `idle` or the walk figure, rotated flat.
- **Weapon:** drawn as a small overlay at the hip. It's hidden while `fight` art shows its own weapon.
- **Explorers:** the walk sheet with a drawn pack. It's hidden when `carry` art exists.

Every animation for one character must show the same character. The pipeline scales each animation so the figure stands `targetHeight` tall (see the options table in the handoff doc), and writes `art/previews/<id>_lineup.png` to check that they match.

### Body types needed

| id | sex | Status |
|---|---|---|
| `resident_f` | f | **done** (all animations) |
| `resident_m` | m | **done** (all animations) |
| child | n/a | Not needed: children use the adult sheet scaled to 62% with the child suit tint |

## Prompt template

Use this as the base and change only the bracketed action.

> 2D game sprite sheet of a single cartoon character, **[walking cycle, 12 frames, evenly spaced timing]**, side view facing right, in one row with even spacing and empty space between frames. Chunky stylised proportions: big head (about 1/3 of body height), sturdy body, short legs, readable at small size. Retro 1950s atompunk look. The character wears a **teal one-piece jumpsuit** with a **bright orange stripe** across the chest and orange collar and cuffs, **brown boots**, and a **brown belt**. **Short dark blue-black hair**, **light warm skin**. Clean dark outlines, soft cel shading. Flat pure green (#00FF00) background, no ground, no shadow, no text, no border.

**Negative prompt:** realistic, photo, thin, tall proportions, multiple characters, overlapping frames, gradient background, floor shadow, props, text, labels, frame numbers, border, grid lines, cropped feet, green clothing, orange or teal props.

Variations:

- **Male base:** add "male, broad shoulders, short cropped hair". Keep every colour the same.
- **Other animations:** replace the bracket, for example "[idle standing, 6 frames, gentle breathing]" or "[standing at a workbench working with both hands, 8 frames]". Keep the same character description so the sheets match.
- If the generator supports a reference image, feed it the approved walk sheet so later animations match the same character.

## Adding a sheet to the game

1. Create `art/raw/<id>/` and put the sheet in it (png, webp or jpg).
2. Add or edit `art/raw/<id>/sprite.json`:

   ```json
   {
     "id": "resident_m",
     "sex": "m",
     "targetHeight": 128,
     "referenceAnim": "walk",
     "anims": {
       "walk": { "file": "walk.webp", "fps": 11, "drop": [], "idleFrame": 2 }
     }
   }
   ```

   - `drop` lists 0-based frame indexes to throw away, counted left to right and top to bottom.
   - `idleFrame` is counted after dropping.
   - `loop` defaults to true.
3. Install the pipeline's dependencies once: `pip install -r tools/sprites/requirements.txt`.
4. Run `npm run sprites`. This writes:
   - `public/sprites/<id>/<anim>_<layer>.webp`, the layer strips the game loads
   - `public/sprites/manifest.json`
   - `art/previews/<id>_<anim>.png`, a contact sheet of the frames recoloured in several palettes
5. **Check the preview.** Look for skin that turned into suit colour, hair that didn't recolour, or stray green fringes. Fix these in the art, or adjust `regions`, then run the pipeline again.
6. Reload the game. The first character listed for each `sex` is the one used.

## Licensing

Before any generated art ships, check the tool's terms. We need commercial use rights and no attribution or exclusivity strings attached. Record the tool, plan and date in the character's `sprite.json` or here.

| id | Tool | Terms checked |
|---|---|---|
| `resident_f` | artlist.io (walk); Nano Banana 2 on artlist.io (the rest) | **to confirm** |
| `resident_m` | Nano Banana 2 on artlist.io | **to confirm** |

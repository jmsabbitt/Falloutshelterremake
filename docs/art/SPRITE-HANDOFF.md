# Character sprite handoff (for the art session)

This is everything needed to make resident sprite sheets for **Homestead**, an original atompunk colony game inspired by Fallout Shelter (original IP; no Fallout names or look). You make the sheets. The repo turns them into game sprites with one command.

Deeper technical detail is in [`docs/design/art-spec.md`](../design/art-spec.md). This page is the short version to work from.

---

## 1. What already exists

| id | Body | Animations done | Status |
|---|---|---|---|
| `resident_f` | female | `walk` (12 frames, 1 dropped) | ✅ in game. Source: `art/raw/resident_f/walk.webp` |
| `resident_m` | male | none | ❌ **needed first.** Men are still drawn placeholders |

**The approved look is the existing female walk sheet.** Match it: chunky, readable at small size, soft cel shading, dark outlines. Open `art/raw/resident_f/walk.webp` and `art/previews/resident_f_walk.png`, and feed the sheet to the generator as a reference image if it accepts one.

---

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

Rows 1–3 give the biggest visible improvement. The game currently shows the walk sheet's `idleFrame` when a resident stands still, and a rotated walk frame for a fallen resident.

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
npm run sprites
```

This writes:
- `public/sprites/<id>/<anim>_<layer>.png` (the game layers)
- `public/sprites/manifest.json`
- `art/previews/<id>_<anim>.png`: a contact sheet in several colour sets

**Check the preview:**
- Skin turned into suit colour, or hair that didn't recolour, means the colours were off.
- Green fringes mean the background wasn't flat.

Fix the sheet, or tune that character's `"regions"` in `sprite.json` (see `art-spec.md`), then run the command again.

If the art session can't run the pipeline, drop the raw sheets and a short note in `art/raw/<id>/` and commit. The main session will build them.

---

## 6. Wiring status

These are notes for whoever picks this up in code.

- **The loader** (`src/client/render/sprites.ts`) picks a character by `sex`, meaning the first manifest entry per sex. A `resident_m` sheet is used for men automatically.
- **Only the `walk` animation is used in code today.** It walks while moving and holds `idleFrame` when still.
- **When `idle`, `work`, `fight` and `fallen` exist,** `Figure` needs a small change: pick the animation by state (idle / working in a production room / fighting in an incident or on a quest / dead). That's a short code task in `sprites.ts` and `vaultView.ts`, and the quest screen (`questView.ts`) uses the same `Figure`.

---

## 7. Licensing: check before anything ships

We need commercial use rights with no attribution or exclusivity strings. Record the tool, plan and date here:

| id / anim | Tool | Plan / licence | Date | Checked |
|---|---|---|---|---|
| resident_f / walk | artlist.io | ? | ? | ☐ |

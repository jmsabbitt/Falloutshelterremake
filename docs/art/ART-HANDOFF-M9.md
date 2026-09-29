# Art handoff, round 2: M7–M9 and the true ending

**Status: every section here (1 to 10) has been delivered and is wired in the game.** What is left is the [Redo list in ART-LIST.md](ART-LIST.md#redo-list-from-the-code-sessions-hookup-pass).

This was the to-do list for the art session after M9. The first round (residents, 11 creature looks, HALCY, 36 item icons, 21 salvage icons, 49 room walls) is done and summarised in [ART-SESSION-HANDOFF.md](ART-SESSION-HANDOFF.md). How sheets are laid out, keyed and built is in [SPRITE-HANDOFF.md](SPRITE-HANDOFF.md). Use the same tools and style: Artlist, Nano Banana 2 at 2K, image-to-image from existing art wherever a style match matters.

**Round 3 (playtest 1):** the list of what was still drawn in code, with the wide room walls and weapon grip fight sheets first, is [ART-LIST.md](ART-LIST.md). It has been delivered and wired too.

**The code is already wired for everything in this list.** Drop the raw image in the named folder, add or extend its `sprite.json`, run `npm run sprites -- <folder>`, and it shows up in the game. Anything missing keeps its drawn fallback, so partial delivery is fine.

The game is original IP: atompunk, 1950s Americana gone to seed, chunky cartoon proportions, dry humour. No Fallout names, logos, power armour or vault-boy look-alikes, no real brands, no real-world maps.

**Budget:** about 164,660 Artlist credits remained at the end of round 1 (renews 2026-10-07), against a floor of 60,000. At 130 credits an image, that leaves roughly 800 images. Everything below, including the optional sections, comes to about 290 images.

---

## Status after the round-2 art session (2026-09-26)

Sections 1 to 8 are done and built into `public/sprites/`, including the Act 4 additions (two more loot icons, the two Act 4 finale bosses, eight Act 4 bosses, the ten ending illustrations and the sixteen optional Act 4 regular enemies). Section 9 (bespoke legend bodies) is done too: all 11 legends have all six sheets (see the section 9 notes below).

| # | Delivered | Source | Output |
|---|---|---|---|
| 1 | 11 legend portraits | `art/raw/legends/` (3 sheets; the first two cut by `boxes` because faces touch) | `portraits/legend_<id>.webp` |
| 2 | 16 loot-only icons | `art/raw/items/icons_l1..l5.png` | `items/<itemId>.webp` |
| 3, 7 | All 55 bosses from sections 3 and 7 (14 flagship, 41 more), idle + attack + death | `art/raw/<enemyId>/`, `sprite.json` copied from the base look | `<enemyId>/*.webp` |
| 8 | 10 ending illustrations (4 title slides, 6 shared scenes) | `art/raw/endings/<file>.png`, 16:9 full-bleed | `endings/<file>.webp` |
| 8 | 16 Act 4 regular enemies, idle + attack + death | `art/raw/<enemyId>/` (same method as the bosses) | `<enemyId>/*.webp` |
| 4 | Glassback, idle 8 + attack 4 + death 4 | `art/raw/glassback/` (skitter config) | `glassback/*.webp` |
| 5 | 7 topside buildings × 3 levels | `art/raw/room_<type>/level{1,2,3}.png`, magenta, `trimBottom` | `rooms/room_<type>_<level>.webp` |
| 6 | 5 faction leaders | `art/raw/factions/leaders.png` (cut by `boxes`) | `portraits/faction_<id>.webp` |

Notes on the bosses:
- Each boss was made from its base look's idle sheet, then attack and death from the look's sheets plus the new idle, so frames line up with the look.
- `iron_matron` and `big_tin` (rustman_brute look) cut 5 attack frames because of that look's `drop` setting. `pipe_mother` and `silt_queen` (skitter_queen look) have a 4-frame idle, like the look.
- `the_dealer` attack has `"drop": [0]` because his thrown cards cut as a separate first frame.
- `the_drowned_mayor` death was regenerated once because the first sheet never fell down.
- A frame-height scan over every creature caught death and attack sheets where a dropped prop, a merged pair or a second-row figure had been cut as a frame. These now use `boxes` on their cleaner row, with cut lines at the emptiest columns: deaths of `assessor_9c`, `deacon_mire`, `pump_warden`, `rust_tollman`, `signatory_countersigned`, `the_detour`, `wire_scav`, `moth_choir`, `the_doorkeeper`, and attacks of `assessor_9c` and `moth_choir` (whose wing tips are clipped where they overlap the next frame).
- Other sheets are cut on a fixed grid with `boxes` because frames touch: `company_secretary` (all three; the idle was also edited so the shredded paper stays in its frame), `receiver_wound_up` idle (smoke joins frames), and the deaths of `the_registrar`, `board_bailiff` and `receivers_clerk` (the fallen frame touches its neighbour). `build.py` now applies `mirror` and `flip` to `boxes` cuts too.
- The rustman and hollowed looks have 12-frame idles and 6-frame attacks, so `wire_scav` and `the_unanswered` do too. `line_tapper`, `tier_zero_holdout` and `board_bailiff` (rustman_brute) cut 5 attack frames, like `iron_matron`.

Notes on the topside buildings (for the code session):
- The shapes follow `buildTopside` in `vaultView.ts`: one image stretched to the room's width, at most `gy + 60` (152 px) tall. They are square for the 3-cell types, 4:5 for the watchtower and signal mast (the 3-cell plot is 132 × 152 at most), and 16:9 for the 6-cell trading post.
- **Solar, wind, rain and farm grow to 3 segments, but `buildTopside` draws one image across the whole width.** At 2 or 3 segments the square picture is stretched and then capped in height, so it looks squashed. Tiling one image per segment, as underground rooms do, would fix it.
- `tools/sprites/build.py` gained `"trimBottom": true` for `whole` images, so the base of each building sits on the ground line.

Credits: 130,210 left after this round, including the Act 4 additions (renews 2026-10-07).

Section 9, bespoke legend bodies (2026-09-28):
- All 11 legends have walk, idle, work, fight, fallen and carry in `art/raw/legend_<id>/`, built to `public/sprites/legend_<id>/` and listed under `legends` in the manifest. Lucky Lou is on magenta.
- Method: image-to-image from the matching resident sheet plus the legend's approved walk sheet (the walk itself came from the resident walk plus the portrait). One `carry` reference (the woman's) served both sexes.
- The model drew idle and work as 2 rows even when asked for one. Both use row 1 only (`drop` 6–11), so work is 6 frames. Row 2 of work drifted into walking.
- Fallen needed the most work. The model kept adding extra standing figures and a second row. Each `fallen.png` is a cleaned single row of exactly 4 poses, cut from the best row of a generation (June and Orla are edits of Ada's good sheet). They are all built with `"order": "x"`. Marla's lying frame faced the other way, so it has `"flip": [3]`.
- Lou's sheets came with a thin ground line under each row, which was painted out. Pip's fight had muzzle flashes bridging frames; those were erased and cut lines added at the emptiest columns.
- Checked in the browser: `homestead.m9.legend('marla_voss', true)` returns ok, `homesteadView.figures()` lists `"legend:marla_voss": 1`, and she stands in the door room at resident scale.
- Credits: 120,330 left after section 9 (about 76 images, 9,880 credits).

Integrated by the code session (2026-09-26):
- **Surface buildings:** the 3-cell types now stand one painting per segment, so merged Solar Arrays and the rest no longer stretch.
- **Loading:** creature art for quest enemies and bosses loads when a quest opens, not at start-up. The vault's own looks still load up front.
- **Offline cache:** the service worker precaches only the start-up art. Bosses, enemies and ending illustrations are cached the first time they load, so a first visit no longer downloads the whole art set (22 MB then, about 47 MB now).
- **Checked in the browser, desktop and phone:** legend and faction portraits, the Glassbacks in the vault, the surface buildings, bespoke bosses in combat (HALCY-9 Custodian Frame, The Official Receiver) and the ending illustrations.
- **Legend bodies:** a legendary resident is drawn with their own `legend_<id>` body once one is built, and with the shared body until then. `npm run sprites -- <folder>` builds only the named `art/raw` folders and merges them into the manifest, instead of rebuilding all of it (1.9 GB then, about 3.6 GB now).
- **Repo size:** `art/raw/` was 1.9 GB then and is about 3.6 GB now (plus about 100 MB of previews), so clones are slow. Moving `art/raw/` and `art/previews/` to Git LFS, or out of the repo, is worth doing before the repo is shared more widely.

---

## Priority order

| # | What | Images | Where it shows |
|---|---|---|---|
| 1 | Legend portraits (11) | 3 sheets | Legend cards, arrival pop-ups, Collection Log, resident list |
| 2 | Loot-only item icons (16) | 4 sheets | Storage, quest rewards, crates, Collection Log |
| 3 | Flagship boss creatures (14) | 42 (idle, attack, death) | Quest combat |
| 4 | Glassback creature | 3 | Vault incident, quest combat |
| 5 | Topside buildings (7 × 3 levels) | 21 | The surface row above the door |
| 6 | Faction leader portraits (5) | 1–2 sheets | Factions panel cards |
| 7 | More bosses (the other 41) | about 123 | Quest combat |
| 8 | Ending illustrations | 10 | The epilogue slides of the four endings |
| 10 | Backdrops: sky panorama, ground crust, dirt | 3 | Above ground and the earth around the rooms (section 10) |
| 9 | Optional: bespoke legend body sheets | 11 to 66 (walk first, up to 6 per legend) | Vault, surface and quest combat (wired; one legend at a time is fine) |

---

## 1. Legend portraits

Eleven named characters join the homestead as legendary residents. Each needs one head-and-shoulders portrait, facing the viewer or three-quarter, on a flat magenta `#FF00FF` background. They're shown in a gold-rimmed **circle** (34 px to 64 px in game), so keep the face centred with some shoulders and a little space above the hair.

The style should match the HALCY portrait sheet and the resident sprites: cel-shaded cartoon, chunky, warm, readable at 34 px. Each character wears their own clothes, not the teal jumpsuit (except Seven; see the table).

**Delivery:**
- **Files:** `art/raw/legends/portraits_1.png` (four faces in a row), `portraits_2.png` (four) and `portraits_3.png` (three), with space between the faces.
- **Config:** `art/raw/legends/sprite.json`:

```json
{
  "id": "legends",
  "kind": "portrait",
  "background": "magenta",
  "prefix": "legend_",
  "fit": 128,
  "targetHeight": 128,
  "anims": {
    "a": { "file": "portraits_1.png", "split": "figures", "order": "x", "take": 4, "names": ["marla_voss", "ada_quill", "seven", "doc_ferris"] },
    "b": { "file": "portraits_2.png", "split": "figures", "order": "x", "take": 4, "names": ["lucky_lou", "pip", "rook", "granny_ash"] },
    "c": { "file": "portraits_3.png", "split": "figures", "order": "x", "take": 3, "names": ["brother_wick", "june_halloran", "captain_orla"] }
  }
}
```

This writes `public/sprites/portraits/legend_<id>.webp`, which `ui/legends.ts` loads on top of the drawn face.

| id | Who | Look notes |
|---|---|---|
| `marla_voss` | Marla "Switchback" Voss, caravan scout who never takes the same road twice (f) | Sun-weathered, goggles pushed up, road-dust scarf, wry half-smile |
| `ada_quill` | Ada Quill, Scrapwright guildmaster in exile (f) | Welding visor up, soot, tool belt, magnifier loupe on one eye, sharp look |
| `seven` | Seven, a Homestead 9 runaway raised by the cold HALCY (m) | Young, too-neat grey Homestead 9 jumpsuit with a stencilled "9", blank polite expression |
| `doc_ferris` | Dr. Aurelio Ferris, pre-Glare Halcyon medic, very tired (m) | Older, white coat over a faded Halcyon uniform, head mirror, deep eye bags |
| `lucky_lou` | Lucky Lou Bettancourt, a gambler who swears by the house edge (m) | Pencil moustache, waistcoat, visor cap, playing card tucked behind the ear |
| `pip` | Pip Underhill, a kid who grew up in the Deep (f) | About 12, huge eyes, patched cave gear, glowing fungus lamp on a string |
| `rook` | Rook Tinbreaker, a Rustman clan champion who switched sides (m) | Big, scarred, rust-orange shoulder plate made from a road sign, grin with a missing tooth |
| `granny_ash` | Granny Ash Mercer, the oldest woman in the Glarelands (f) | Very old, knitted shawl, wooden spoon, one eyebrow permanently raised |
| `brother_wick` | Brother Wick, a lapsed Lamplighter (m) | Monk-like robe with a snuffed lantern symbol, shaved head, guilty kind eyes |
| `june_halloran` | June Halloran, a Stillwater salvage diver (f) | Wet hair, brass diving collar, harpoon strap over the shoulder, freckles |
| `captain_orla` | Captain Orla Brandt of pre-Glare Halcyon security, thawed beneath the Seal (f) | Stern, frost still on the shoulders of a 1950s security uniform, peaked cap |

Optional: a second expression for each (for example "pleased") can come later; the code uses only one for now.

---

## 2. Loot-only item icons

These are 16 rare or legendary items that only come from boss first kills, treasure caches and region-exclusive finds (the last two from Act 4). Match the round-1 icon sheets in `art/raw/items/` (same framing and lighting, magenta background, four icons per sheet with clear gaps).

**Delivery:** add `icons_l1.png` to `icons_l4.png` to `art/raw/items/` and add entries to `art/raw/items/sprite.json` like the existing `w1`/`o1` ones, with `names` in left-to-right order. The output is `items/<id>.webp`, picked up automatically.

| id | Name | Kind | Rarity | Idea |
|---|---|---|---|---|
| `dust_devil` | Dust Devil | weapon | rare | A pistol with a small spinning fan-drum, sand-blasted finish |
| `glasscutter` | Glasscutter | weapon | legendary | A crystal-edged blade grown from Glare glass, faint green glow |
| `salvage_harpoon` | Salvage Harpoon | weapon | legendary | A brass harpoon gun with a coiled line, barnacles |
| `tin_knuckles` | Tin Knuckles | weapon | rare | Knuckle-dusters beaten out of tin cans, labels still visible (made-up brands) |
| `mauler_tusk` | Mauler Tusk | weapon | legendary | A huge curved tusk with a wrapped grip, used as a club |
| `wick_gun` | Wick Gun | weapon | legendary | A lantern-rifle whose barrel is a glass chimney with a flame |
| `custodial_baton` | Custodial Baton | weapon | legendary | A chrome janitor's baton with a HALCY-9 stamp and a blue arc at the tip |
| `prospector_pick` | Prospector's Pick | weapon | rare | An old pickaxe with a lucky rabbit's foot on the handle |
| `drover_poncho` | Drover's Poncho | outfit | rare | A striped trail poncho with a bandana |
| `mirrorweave_cloak` | Mirrorweave Cloak | outfit | rare | A cloak sewn with little mirror tiles that catch light |
| `diving_bell_suit` | Diving Bell Suit | outfit | rare | A brass-helmeted diving suit, portholes |
| `broodsilk_coveralls` | Broodsilk Coveralls | outfit | rare | Pale, faintly iridescent coveralls woven from Skitter silk |
| `barons_greatcoat` | Baron's Greatcoat | outfit | legendary | A long rust-red coat with bottle-cap epaulettes and a fur collar |
| `surveyor_duster` | Surveyor's Duster | outfit | legendary | A long duster with map pockets, a compass and a theodolite strap |
| `quitclaim` | Quitclaim | weapon | legendary | A brass notary-stamp pistol, a rolled legal notice as the magazine |
| `good_neighbour_cardigan` | Good Neighbour Cardigan | outfit | legendary | A hand-knitted cardigan, warm colours, elbow patches, a knitted house on the pocket |

---

## 3. Flagship bosses

Every quest enemy is drawn with one of 10 shared looks today. The bosses reuse them, so for example 16 bosses all look like `sentry`. The combat view now **prefers art named after the enemy id** over its shared look. A boss sheet therefore goes in `art/raw/<enemyId>/` with a `sprite.json` copied from the matching look (for example `art/raw/mauler/sprite.json`), and takes over for that boss only.

Each boss needs **idle, attack and death** sheets (3 images). Make them from the shared look's sheets with image-to-image, so the family resemblance and framing stay, but make them bigger, more ornate and clearly "named". Use a magenta background and face **left** (the looks are mirrored for the party side automatically; follow the existing `mirror` setting).

These are the first 14. They're the story bosses players meet at act finales and turning points:

| enemy id | Name | Based on look | Idea |
|---|---|---|---|
| `rust_warlord` | Baron Oxide (Act 1 finale) | `rustman_chief` | A rust baron in a greatcoat and a crown of bent rebar, riding-crop sceptre |
| `lamp_solenne` | High Lamplighter Solenne | `hollowed_hulk` | A tall robed zealot with a halo of lit lanterns, Glare-scarred |
| `custodian_frame` | HALCY-9 Custodian Frame (Act 2) | `sentry` | A cold grey-blue robot frame with a HALCY-9 face screen, mop-and-taser arms |
| `big_tin` | Big Tin, Clan Champion | `rustman_brute` | A huge wrestler in tin-can armour, championship belt |
| `kiln_mother` | Kiln Mother | `skitter_queen` | A skitter queen glowing like a furnace, glassy egg sacs |
| `shatterjaw` | Old Shatterjaw | `mauler` | An ancient Mauler with a cracked glass jaw and old spears stuck in its hide |
| `deacon_mire` | Deacon Mire of the Drowned Lamp | `hollowed_hulk` | A waterlogged preacher, lantern full of pond water, weeds |
| `the_undertow` | The Undertow | `mauler` | An eel-like water beast, all mouth and current |
| `the_chair` | The Chair of the Board | `sentry` | A 1950s boardroom chair turned war machine, pinstriped, gavel arm |
| `the_conductor` | The Conductor | `hollowed_hulk` | A ghostly train conductor with a ticket punch and a lamp |
| `the_signatory` | The Signatory (Act 3 finale, phase 1) | `sentry` | A towering automaton with a giant fountain-pen arm and a wax-seal chest |
| `signatory_countersigned` | The Signatory, Countersigned (phase 2) | `mauler` | The same thing broken open, something huge wearing the frame |
| `the_receiver` | The Official Receiver (Act 4 finale, phase 1) | `sentry` | A brass receiver automaton on a chair-throne, ledger in one hand, a winding key in its back |
| `receiver_wound_up` | The Receiver, Fully Wound Up (Act 4 finale, phase 2) | `mauler` | The Receiver fused to a warm, living wall of the Freeholder, its clockwork key spinning |

---

## 4. The Glassback (new vault creature)

Glassbacks are taint-crystal arachnids that jump between rooms and drain power. Make them small, flat and fast, with a glassy green-and-teal crystal carapace and a faint glow. Their size and framing should match the `skitter` sheets. They show 2–4 at a time in a vault room at about 24 px tall.

**Delivery:** `art/raw/glassback/` with idle (4–6 frames), attack (4) and death (4), using a `sprite.json` copied from `art/raw/skitter/`. The vault view already asks for the `glassback` look.

The other new threats need no sprites. Electrical surges are drawn as an effect. The Hollowed already use the `hollowed` art (now also in the vault). The vault Mauler uses a custom drawn walk-in; the quest-combat Mauler already has art.

---

## 5. Topside buildings

Seven open-air structures stand on the ground above the homestead door, drawn in code today. The vault view already uses a `roomWall` texture for any room type that has one, so a painting takes over automatically.

The difference from the underground rooms: **these stand against the sky**. Paint them on a flat **magenta** background (not a full-bleed wall), with the ground line at the bottom edge. Each needs **levels 1, 2 and 3**: level 1 is ramshackle, level 3 is the showpiece. Make each level from the one below with image-to-image, as in round 1.

| type | Name | Width | Idea |
|---|---|---|---|
| `solar_array` | Solar Array | 3 cells (square image per segment) | Racks of mirrored panels on scaffolding |
| `wind_turbine` | Wind Turbine | 3 cells | A tall rotor on a lattice tower (paint it with the rotor still; the code can't animate a painting) |
| `rain_catcher` | Rain Catcher | 3 cells | Funnels and tarps over a riveted cistern |
| `farm_plots` | Farm Plots | 3 cells | Raised beds, a scarecrow in a Halcyon cap |
| `watchtower` | Watchtower | 1 wide, tall | A wooden tower with a searchlight and a lookout hut |
| `trading_post` | Trading Post | 1 wide (6 cells in world) | Striped awnings, stalls, a hand-painted sign |
| `signal_mast` | Signal Mast | 1 wide, very tall | A lattice mast with dishes and a beacon |

**Delivery:** `art/raw/room_<type>/level1.png`, `level2.png` and `level3.png`. Copy a `sprite.json` from `art/raw/room_lab/` and change `"background": "none"` to `"background": "magenta"`.

A 1-wide building is one image, and 3-cell buildings tile one square per segment like underground rooms. **Check each one in the game** after building: the surface drawings are taller than the row, so if a painting looks squashed, tell the code session and it will adjust the frame.

---

## 6. Faction leader portraits

The Factions panel shows one card per faction. Each card now loads `portraits/faction_<id>.webp` next to the name, as a circle of about 32 px. Use the same portrait style as the legends.

**Delivery:** `art/raw/factions/leaders.png` with five faces, and a `sprite.json` like the legends one but with `"prefix": "faction_"` and names `["caravaners", "tinkers", "lamplighters", "rustmen", "homestead9"]`.

| id | Faction | Face |
|---|---|---|
| `caravaners` | The Long Road Caravan Co. | A cheerful trail boss in a duster with a ledger and a pencil behind the ear |
| `tinkers` | The Scrapwright Guild | A guild elder with magnifying goggles and a brass hearing trumpet |
| `lamplighters` | The Order of the Last Lamp | A serene hooded priestess lit from below by a lantern |
| `rustmen` | The Rustman clans | A clan chief with a rebar crown and warpaint made of rust |
| `homestead9` | Halcyon Homestead 9 | The cold HALCY-9 face screen, blue-grey, the smile slightly wrong |

---

## 7. More bosses (after the first 14)

These use the same method as section 3. Each needs three images in `art/raw/<enemyId>/`. The ids are:

- **Act 1:** `relay_boss`, `burrower_matriarch`, `rust_tollman`, `hollowed_supervisor`
- **Act 2:** `moth_choir`, `assessor_9c`, `readiness_officer`, `chief_sprocket`
- **Act 3:** `pump_warden`, `stationmaster`, `knock_captain`
- **Act 4:**
  - `head_operator`: a huge switchboard torso with cords for arms
  - `the_registrar`: a notary-press giant
  - `last_verger`: a bell-ringer carrying a bell
  - `restore_point`: HALCY-9 as a refrigerated server cabinet with a face
  - `company_secretary`: a secretary frame with a paper shredder
  - `the_liquidator`: a Mauler covered in auction tags
  - `the_doorkeeper`: a hulk fused to a door frame
  - `rent_officer`: an officer with a clipboard and a door-knocker hand
- **Legend questlines:**
  - `the_detour`, `the_long_road`, `foreman_crank`, `the_motion`, `proctor_cold`, `mother_nine`, `head_of_ward`, `chief_of_staff`
  - `pit_boss`, `the_dealer`, `pipe_mother`, `the_hum`, `iron_matron`, `the_old_champion`, `cinder_alpha`, `the_old_flame`
  - `lamp_inquisitor`, `the_first_lamp`, `silt_queen`, `the_drowned_mayor`, `seal_warden_frame`, `director_hale`

Names and base looks are in `src/content/quests.json` and `src/content/legends.json` (`enemies`, fields `name` and `look`). Do them in any order.

---

## 8. Ending illustrations

Act 4, "Rent Day", ends the story for the fourth homestead onward. The thing under every homestead, the **Freeholder**, is a vast, warm, living thing under the region. Halcyon swapped the parties on its lease, the Glare was its gaze, and HALCY is the 1,006 Sunrise Line passengers "compressed for cheerfulness". The player picks one of four endings.

The epilogue slides are text over a small drawn glyph today. They now load a **wide illustration** above the text when one exists. They look first for `endings/<slideId>.webp`, then for `endings/scene_<art>.webp`, a scene shared by several slides.

Paint them at 16:9, as full-bleed scenes (no magenta), in the same painterly-cartoon style as the room walls. They show at up to 560 px wide.

**The four title slides, one per ending (most important):**

| file name | Ending | Scene |
|---|---|---|
| `open_renewal` | Under New Management: the lease is renewed, and the knocking is filed as noise | A warm, tidy boardroom by the Seal. A 41-page lease with a fountain pen, HALCY's face screen smiling a little too hard, and three knock marks on the Seal door in the background |
| `open_eviction` | Notice to Quit: the ground is given back and the homesteads move up to the surface | Two leases burning in a furnace, then people walking out onto a cold, blue-sky glass plain with bundles and handcarts |
| `open_holdover` | Holding Over: HALCY stays in the key slot to answer the knock | HALCY's glowing core sitting in the Seal's key slot like a keeper at a lighthouse, with a kettle and a chair next to it |
| `open_neighbours` | Good Neighbours (the true ending): the whole network knocks back together | Dawn. Every homestead door open at once, the outposts, factions and legends at their doors, all knocking. Something enormous and warm under the ground, glowing softly like a hearth |

**Six shared scenes** (for the other slides; lower priority):

| file name | Used by | Scene |
|---|---|---|
| `scene_lease` | "The Original Instrument" slides | The honest handwritten lease in a frame, one new line in pen: "Visits welcome." |
| `scene_door` | Knocking and returning slides | A homestead Seal door seen from inside, lit warm, with three dents where something knocked |
| `scene_glare` | "The ground" slides | The land above: pipes, Cisterns and the Groundworks, cutaway to the warm dark below |
| `scene_home` | Homestead and rules slides | A homestead cross-section at evening, lights on, people at dinner |
| `scene_relay` | Network (outpost) slides | A signal mast relaying between distant homestead doors across the Glarelands at night |
| `scene_end` | The closing slide of each ending | A HALCY "Thank you for choosing Halcyon" sign, repainted by hand to read "Home" |

**Delivery:** `art/raw/endings/<file name>.png`, one image per file, with this `sprite.json`:

```json
{
  "id": "endings",
  "kind": "portrait",
  "background": "none",
  "outDir": "endings",
  "prefix": "",
  "targetHeight": 360,
  "anims": {
    "open_renewal": { "file": "open_renewal.png", "whole": true, "names": ["open_renewal"] },
    "open_eviction": { "file": "open_eviction.png", "whole": true, "names": ["open_eviction"] },
    "open_holdover": { "file": "open_holdover.png", "whole": true, "names": ["open_holdover"] },
    "open_neighbours": { "file": "open_neighbours.png", "whole": true, "names": ["open_neighbours"] },
    "scene_lease": { "file": "scene_lease.png", "whole": true, "names": ["scene_lease"] }
  }
}
```

Add one entry per delivered file. To see them, open the browser console and run `homestead.ending.play('neighbours')` (or `renewal`, `eviction`, `holdover`); `homestead.ending.list()` lists the endings.

**Faction slides** reuse the faction leader portraits from section 6. **Legend slides** reuse the legend portraits from section 1. Nothing extra is needed for either.

**Act 4 regular enemies (optional, after the bosses):**
- `wire_scav`, `line_tapper`, `switchboard_op`, `filing_mite`, `registry_clerk`
- `the_unanswered`, `vigil_keeper`, `compliance_drone`, `tier_zero_holdout`, `board_bailiff`
- `warm_guard`, `liquidation_drone`, `asset_stripper`, `cistern_leech`, `knocker`, `receivers_clerk`

Their names, looks and flavour are in `src/content/quests.json` (`enemies`). They use the same `art/raw/<enemyId>/` method as the bosses.

---

## 9. Optional: bespoke legend bodies

Today every legend uses the shared resident body with their fixed skin and hair, plus a gold star. **The loader is wired for bespoke bodies.** Once `art/raw/legend_<id>/` is built, that legend is drawn with their own painted body in the vault, on the surface (explorers and caravans) and in quest combat. Legends without one keep the shared body, so they can be delivered one at a time.

**Delivery:**
- **Folder:** `art/raw/legend_<id>/`, for example `art/raw/legend_marla_voss/`, with one sheet per animation (`walk.png`, `idle.png` and so on).
- **Config:** `art/raw/legend_<id>/sprite.json`. The fps and `idleFrame` values match `art/raw/resident_f/sprite.json`:

```json
{
  "kind": "legend",
  "legend": "marla_voss",
  "sex": "f",
  "targetHeight": 128,
  "referenceAnim": "walk",
  "anims": {
    "walk":   { "file": "walk.png",   "fps": 11, "idleFrame": 2 },
    "idle":   { "file": "idle.png",   "fps": 6 },
    "work":   { "file": "work.png",   "fps": 8 },
    "fight":  { "file": "fight.png",  "fps": 10, "split": "figures" },
    "fallen": { "file": "fallen.png", "fps": 6, "loop": false, "split": "figures", "heightFrom": 0 },
    "carry":  { "file": "carry.png",  "fps": 11 }
  }
}
```

- `"legend"` is the legend's id from the table below, and `"sex"` is their sex (`f` or `m`, also in the table). **When you copy this file for another legend, change `"legend"` and `"sex"` together.** Both can also be left out: `"legend"` then comes from the folder name without `legend_`, and `"sex"` from `src/content/legends.json`.
- `"id"` defaults to the folder name, and for a legend body it must be the folder name if you set it. The build refuses a sprite.json whose `"id"` names another folder, or whose `"legend"` already has a body from another folder, so a copied file can't silently overwrite another legend's body. It warns when `"sex"` doesn't match legends.json.
- List only the sheets you have. These per-animation options let you use an awkward sheet instead of regenerating it (more in "Options for awkward sheets" in [SPRITE-HANDOFF.md](SPRITE-HANDOFF.md)):

  | Option | Example | Use |
  |---|---|---|
  | `drop` | `[5]` | Throw away frames (0-based, left to right, then top to bottom) |
  | `take` | `4` | Keep only the first n frames, after `drop` |
  | `crop` | `[0, 0, 2752, 806]` | Use only part of the sheet (`[x0, y0, x1, y1]`), for example its first row |
  | `split` | `"figures"` | Find frames as separate figures instead of by empty gaps, for frames that nearly touch |
  | `order` | `"x"` | With `"split": "figures"`, read the figures strictly left to right |
  | `boxes` | `[[0, 0, 460, 760], [460, 0, 920, 760]]` | One frame per box of the sheet (`[x0, y0, x1, y1]` each). `drop` and `take` don't apply |
  | `flip` | `[3]` | Mirror single frames (counted after `drop`) that face the wrong way |
  | `mirror` | `true` | Mirror the whole sheet, for one that came out facing left |
  | `heightFrom` | `0` | Size the animation from this frame, for `fallen` |
  | `fitHeight` | `false` | Share the walk's scale instead of fitting this animation to `targetHeight` |

  `regions` does not apply, because nothing is recoloured. `"background"` goes at the top level, next to `"kind"` (or in one animation, for that sheet only).
- The build writes `public/sprites/legend_<id>/<anim>_full.webp` and a `legends` entry in `public/sprites/manifest.json`.

**Animations:**
- **`walk` is required.** The build refuses a legend body without one. Its `idleFrame` is also the standing pose.
- **`idle`, `work`, `fight`, `fallen` and `carry` are optional.** They fall back the way the residents' sheets do: `work` and `fight` use `idle`, then the walk's `idleFrame`; `fallen` uses `idle` or the walk figure rotated flat; `carry` uses the walk with a drawn backpack. A legend with only a walk sheet already works. The fallback table is in SPRITE-HANDOFF.md section 6.

**Art rules:**
- **Match the resident sheets:** the same chunky proportions (big head, sturdy body), the same height and the same framing, full body from head to feet. Every body is drawn at the same height in the game, whatever the sheet size. That height is measured from the topmost pixel (hair, a hat, or anything held up) to the feet, so a tall hat or a prop raised above the head shrinks the whole figure. Keep hats close to the head (Orla's peaked cap, Lou's visor) and props below the top of the head and close to the body (Granny's spoon, June's harpoon). A stoop or a kid's build is scaled up to the same height too, so show it in the proportions, not in a smaller figure. The lineup preview only compares one legend's own animations, so check the height against the residents in the game.
- **Face right.** The game mirrors the sprite for left. If a sheet comes out facing left, add `"mirror": true` to that animation instead of regenerating it (or `"flip"` for single frames).
- **Frames:** feet on a common line, the same size in every frame, and clear empty space between frames. If frames nearly touch (a weapon reaching the next figure), use `"split": "figures"`.
- **Background:** flat `#00FF00` by default, with no gradient, floor or shadow. The green key also turns green in the figure see-through or grey, so a legend with green in the outfit goes on magenta `#FF00FF` instead, with `"background": "magenta"` at the top level of their sprite.json, next to `"kind"`. **Lucky Lou must use magenta** (green visor and green waistcoat). The others are fine on green: Doc Ferris's teal uniform survives the green key, and Pip's lamp glows blue. On magenta, avoid strong pink and purple in the figure.
- **No reference colours.** Nothing is recoloured, so paint the legend's real outfit, skin and hair. The teal-suit and orange-stripe rules for residents don't apply.
- **Keep the portrait's look** (face, hair, outfit and colours from section 1), so the legend card and the body read as the same person.
- **Timing:** evenly spaced cycles, with about as many frames as the resident sheet for that animation: 12 for walk, fight and carry (two rows of six), 6 to 12 for work, 6 for idle (one row) and 4 for fallen (one row). A single bad frame can be thrown away with `drop`.

**Method:** image-to-image from the matching resident sheet (`art/raw/resident_f/` or `art/raw/resident_m/`, same animation) for pose, timing and framing, plus the legend's portrait (`art/raw/legends/portraits_<n>.png`) for face and outfit. Make the walk first. Then make the other animations from the resident sheet for that animation plus the approved walk, so every sheet shows the same person.

**Don't copy the residents' extra rows.** Some resident sheets have a row the game throws away:
- `resident_f/fallen.png` and `resident_m/fallen.png` have a row of walking figures under the four fallen frames (the residents cut it with `"crop": [0, 0, 2752, 806]` and `[0, 0, 2752, 800]`).
- The `idle.png` sheets and `resident_m/work.png` have a second row the residents drop (`"drop": [6, 7, 8, 9, 10, 11]`). `resident_m/work.png`'s second row is walking, not working.

For `fallen`, `idle` and a man's `work`, crop the reference to its first row before you use it, and ask for a single row. Walk, fight and carry use both rows. After building, open `art/previews/legend_<id>_fallen.png`: the last frame must be lying flat, because `fallen` plays once and holds its last frame. If extra figures got in, add a `"crop"` to the first row (as in `art/raw/resident_f/sprite.json`) or a `"drop"` to that animation.

| id | Sex | Start from | Body and outfit (from section 1) |
|---|---|---|---|
| `marla_voss` | f | `resident_f` | Sun-weathered caravan scout: goggles pushed up, road-dust scarf, trail jacket, cargo trousers, boots |
| `ada_quill` | f | `resident_f` | Welding visor pushed up, soot, leather apron and tool belt, magnifier loupe on one eye |
| `seven` | m | `resident_m` | Young, a too-neat **grey** Homestead 9 jumpsuit with a stencilled "9" (grey, not teal), stiff polite posture |
| `doc_ferris` | m | `resident_m` | Older and tired, a white coat over a faded Halcyon uniform, head mirror, a slight stoop |
| `lucky_lou` | m | `resident_m` | Pencil moustache, green waistcoat and shirtsleeves, green visor cap, playing card tucked behind the ear. **Magenta background** |
| `pip` | f | `resident_f` | About 12, huge eyes, patched cave gear, a fungus lamp on a string that glows blue (as in her portrait). She is drawn as tall as the adults, so give her a kid's proportions (bigger head, shorter limbs) rather than a smaller figure |
| `rook` | m | `resident_m` | Big and broad, scarred, rust-orange shoulder plate made from a road sign, missing-tooth grin |
| `granny_ash` | f | `resident_f` | Very old, a little stooped, knitted shawl over a long skirt, wooden spoon, one eyebrow raised |
| `brother_wick` | m | `resident_m` | Monk-like robe with a snuffed lantern symbol, rope belt, shaved head |
| `june_halloran` | f | `resident_f` | Stillwater salvage diver: patched wetsuit, brass diving collar, wet hair, harpoon strap over the shoulder, freckles |
| `captain_orla` | f | `resident_f` | Stern, a 1950s security uniform and peaked cap, frost still on the shoulders |

**Images:** 11 legends × up to 6 animations, so up to 66 images. The 11 walk sheets alone are enough to show every legend in their own body.

**Build and check one legend:**

```bash
npm run sprites -- legend_marla_voss
```

This builds only that folder and merges it into the existing manifest, so it takes seconds, not a full rebuild. Check `art/previews/legend_<id>_<anim>.png` (the cut frames) and `art/previews/legend_<id>_lineup.png` (frame 0 of every animation on one ground line, to check they match in size). Then check her in the game. `npm run dev` is simplest, because it has no offline cache. With `npx vite build && npx vite preview`, the service worker can keep serving the old manifest after a rebuild, even over several reloads, so unregister it or clear the site data first (DevTools, Application tab). In the browser console:
- `homestead.m9.legend('marla_voss', true)` brings her to the door and admits her. It says `'ok'` even when she can't come in: with no free quarters she waits at the door (still drawn and counted), and under a population cap (the Skeleton Crew ruleset) a full homestead queues her instead, so use a normal new game.
- `homesteadView.figures()` should list `"legend:marla_voss": 1` next to the usual `action>animation` counts. It counts residents inside the homestead and at the door. Explorers, caravans and the quest party aren't counted, so check those by eye. The body loads the first time the legend is drawn, so for a moment she may show the shared body.

**Outfits and weapons:** the game still draws the weapon at the hip (hidden while a `fight` sheet is showing, since that holds its own weapon), the backpack for explorers without `carry` art, the expecting heart and the gold legend star. The outfit colour is **not** applied: a legend's body is drawn as painted, so an equipped outfit's stat colour and rarity trim don't show on it. The outfit's bonus still counts.

---

## 10. Backdrops: the sky above ground and the dirt around the homestead

**Delivered and wired:** `surface`, `crust` and `dirt` are painted and in the game (see the Redo list in ART-LIST.md for a seam fix on `crust` and `dirt`). The brief is kept below for reference.

Before this, the sky was a drawn gradient with two flat mesas, and the earth around the rooms was flat brown with speckles. The vault view uses the painted backdrops when they exist, and keeps the drawn versions as a fallback. There are three images, and each one repeats (tiles), so **every edge must wrap seamlessly**: the left edge continues into the right edge, and for the dirt, the top continues into the bottom too.

| file name | What it is | Size and shape | How the game uses it |
|---|---|---|---|
| `surface` | The view above ground: sky near the horizon and the far landscape of the Glarelands (mesas, ruined towns, pylons, the odd wreck). Atompunk, dusk-warm, the same painterly-cartoon style as the room walls. | Wide panorama, about 3:1 (for example 3072 × 1024). The landscape sits on the **bottom edge**, which is the horizon. The **top edge is plain, even sky**, because the game stretches the top row of pixels up to fill the sky above it. | Stands on the horizon, 420 world units tall (a bit more than two room floors), repeated sideways across the whole view. The weather (dust, storms, heatwaves) is drawn over it, and the surface buildings stand in front of it. |
| `crust` | The ground strip between the horizon and the first floor: packed earth and sand, a few stones, roots at the bottom. | Wide strip, about 8:1 (for example 2048 × 256). | Fills the 40-unit band just under the horizon, repeated sideways. |
| `dirt` | The earth that surrounds the rooms, left and right of the homestead and behind the elevator: packed soil with stones, pebbles, old pipes and roots. Keep it **dark and low-contrast** (around `#2a1d15`, the current rock colour) so rooms and residents stay the focus. No strong single features, because they repeat visibly. | Square, for example 1024 × 1024. Tiles in both directions. | Repeated every two floors' height across the underground. The build grid lines are drawn on top. The Deep keeps its own strata art below floor 25. |

**Rules**
- **No characters, text or UI**, and no buildings in the foreground. The surface panorama is distance only; the game draws the homestead's own surface buildings.
- **Colours:** keep the sky warm near the horizon (the current `#e7b27a`) and teal higher up (`#3d6f86`), so the weather overlays still read. Night isn't shown yet, so paint a late afternoon.
- **Background:** these are full-bleed images, so no magenta or green key.
- **Seams:** check the tiling before delivery by placing two copies side by side (and, for the dirt, two copies stacked) and looking for a seam.

**Delivery:** `art/raw/backdrop/surface.png`, `crust.png` and `dirt.png`, with this `sprite.json`:

```json
{
  "id": "backdrop",
  "kind": "portrait",
  "background": "none",
  "outDir": "backdrop",
  "prefix": "",
  "targetHeight": 1024,
  "anims": {
    "surface": { "file": "surface.png", "whole": true, "names": ["surface"] },
    "crust": { "file": "crust.png", "whole": true, "names": ["crust"], "targetHeight": 256 },
    "dirt": { "file": "dirt.png", "whole": true, "names": ["dirt"] }
  }
}
```

Then `npm run sprites -- backdrop`. Each image is optional, so you can deliver the dirt first. To check it, run `homestead.qol.bigVault(40)` and look at the surface and at the earth either side of the rooms, zoomed in and out, on desktop and on phone width. Also run `homestead.m7.topside()` and `homestead.m7.weather('dust')` to check that the surface buildings and the weather look right against the panorama.

---

## Checklist per delivery

1. Put the raw PNG(s) and `sprite.json` in `art/raw/<folder>/`.
2. Run `npm run sprites -- <folder>` to build just that folder (or `npm run sprites` to rebuild everything, which is slow). Check `art/previews/<id>_<anim>.png` for the cut frames and `art/previews/<id>_lineup.png` for matching sizes. Portrait-kind folders (portraits, icons, room walls, endings) write no previews, so look at their images under `public/sprites/`.
3. Run `npm run dev`, or `npx vite build && npx vite preview` (after a rebuild, unregister the service worker or clear the site data first, or it may keep serving the old art). Look at it in the game on desktop and at phone width.
4. Commit both the raw PNG and the generated WebP, plus `public/sprites/manifest.json`.
5. Add a row to the licensing table in SPRITE-HANDOFF.md section 8 (tool, plan, date). The "Checked" boxes there still need someone to confirm the Artlist plan's commercial terms before release.

Dev console helpers for checking art in the browser:
- `homestead.m9.legends()` brings every legend in and admits them. `homestead.m9.legend('<id>', true)` does it for one.
- `homesteadView.figures()` counts residents per `action>animation`, and per `legend:<id>` for legends drawn with their own body.
- `homestead.m9.creature('glassbacks')` starts a Glassback incident.
- `homestead.m7.topside()` builds the surface row, and `homestead.m7.weather('clear')` sets the weather.
- `homestead.quest.*` sets up quests.

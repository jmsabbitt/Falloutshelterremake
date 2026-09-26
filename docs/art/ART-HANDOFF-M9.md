# Art handoff, round 2: what still needs painting (M7–M9 and the true ending)

This is the to-do list for the art session after M9. The first round (residents, 11 creature looks, HALCY, 36 item icons, 21 salvage icons, 49 room walls) is done and summarised in [ART-SESSION-HANDOFF.md](ART-SESSION-HANDOFF.md). How sheets are laid out, keyed and built is in [SPRITE-HANDOFF.md](SPRITE-HANDOFF.md). Use the same tools and style: Artlist, Nano Banana 2 at 2K, image-to-image from existing art wherever a style match matters.

**The code is already wired for everything in this list.** Drop the raw image in the named folder, add or extend its `sprite.json`, run `npm run sprites`, and it shows up in the game. Anything missing keeps its drawn fallback, so partial delivery is fine.

The game is original IP: atompunk, 1950s Americana gone to seed, chunky cartoon proportions, dry humour. No Fallout names, logos, power armour or vault-boy look-alikes, no real brands, no real-world maps.

**Budget:** about 164,660 Artlist credits remained at the end of round 1 (renews 2026-10-07), against a floor of 60,000. At 130 credits an image, that leaves roughly 800 images. Everything below, including the optional sections, comes to about 290 images.

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
| 9 | Optional: bespoke legend body sheets | about 66 | Vault and quests (needs a small code change first; ask) |

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

Today legends use the normal resident sprite with their fixed skin and hair plus a gold star. Giving each legend their own body sheets (walk, idle, work, fight, fallen) means 11 × 6 images and a small loader change so a legendary resident picks `art/raw/legend_<id>/` over the shared body. **Ask the code session to wire this first** if you want it.

---

## Checklist per delivery

1. Put the raw PNG(s) and `sprite.json` in `art/raw/<folder>/`.
2. Run `npm run sprites`. Check `art/previews/<id>_lineup.png` for the cut frames.
3. Run `npx vite build && npx vite preview`. Look at it in the game on desktop and at phone width.
4. Commit both the raw PNG and the generated WebP, plus `public/sprites/manifest.json`.
5. Add a row to the licensing table in SPRITE-HANDOFF.md section 8 (tool, plan, date). The "Checked" boxes there still need someone to confirm the Artlist plan's commercial terms before release.

Dev console helpers for checking art in the browser:
- `homestead.m9.legends()` brings every legend to the door.
- `homestead.m9.creature('glassbacks')` starts a Glassback incident.
- `homestead.m7.topside()` builds the surface row, and `homestead.m7.weather('clear')` sets the weather.
- `homestead.quest.*` sets up quests.

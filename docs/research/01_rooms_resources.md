# Fallout Shelter: Vault Building, Rooms and the Resource Economy

Research notes for the remake. They cover room types, costs, capacities, production formulas, consumption, shortages, rushing, layout and happiness.

**Sources and access:** fallout.fandom.com returned HTTP 402 and could not be fetched. The raw wikitext of the same pages came from the independent **fallout.wiki**, which forked from the Fandom wiki and uses the same tables, via `index.php?title=...&action=raw`. Other sources:
- the community **Fallout Shelter FAQ** (therabidsquirel, GitHub wiki, maintained through 2025). It is the most reliable source on mechanics and was cloned directly.
- **sharlikran's fsdoc** mirror (older, player-recorded tables with some gaps)
- Steam and GameFAQs threads

Markers: **[CONFLICT]** means sources disagree. **[UNCERTAIN]** means the value is unverified or inferred.

---

## 1. Global rules

| Rule | Value |
|---|---|
| Room levels | 1 → 2 → 3 (upgraded with caps). The barbershop has only 2 levels. |
| Merging | Up to **3 segments** of the same type **and same level** merge automatically when placed side by side (single, double, triple). You cannot merge rooms of different levels, so upgrade them to match first. |
| Dwellers per segment | **2** (single = 2, double = 4, triple = 6). The vault door holds 2. The overseer's office holds none (except during incidents). Workshops are triple-only and hold 6. |
| Fixed-size rooms | Weapon, outfit and theme workshops are **triple only**. The barbershop and overseer's office are **double only** (FAQ 3.11 and fallout.wiki). [CONFLICT] sharlikran calls the overseer's office triple; fallout.wiki and the FAQ both say double. |
| Upgrade discount | Upgrade cost for width W = single cost × (1, 1.5, 2) for W = 1, 2, 3. A double is 25% cheaper than two singles and a triple about 33% cheaper than three singles. **Merge first, then upgrade.** |
| Build cost scaling | `cost = base + increment × (number of rooms of that type already built)`. A merged segment appears to count as one room each. [UNCERTAIN] Most pages say "+X per existing room". |
| Max population | **200** dwellers. You cannot build or upgrade living quarters past 200 capacity. Explorers, questers and dead bodies all count. |
| Connectivity | Every room and elevator needs a path to the vault door. You cannot demolish living quarters or storage if it would drop capacity below the current population or item count. |
| Unlocks | A room type unlocks permanently once population first reaches the threshold. Population-gated **upgrades** (office and workshops) need that population at the moment you upgrade. |

### "Size" units (fallout.wiki room table)
The main room table lists sizes where **elevator = 1**, **single room = 3**, **double = 6**, **triple = 9**, **vault door = 6**.
- Each floor holds 8 room segments plus up to 2 elevators, so a floor is 8×3 + 2×1 = **26 units wide**.
- The FAQ says: "On each floor you can fit 2 triple rooms, 1 double room, and 2 elevators" (9+9+6+1+1 = 26).

---

## 2. Master room table

Build cost is `base + increment × already built`. The upgrade costs below are for a **single** segment unless stated otherwise. Multiply by 1.5 for a double and by 2 for a triple.

| Room | Category | SPECIAL | Unlock pop. | Base cost | +per room | Upgr. L1→2 (single) | Upgr. L2→3 (single) | Sizes allowed | Output |
|---|---|---|---|---|---|---|---|---|---|
| Vault Door | Misc | - | start | fixed | - | 500 | 2,000 | fixed (6 units) | defense |
| Elevator | Misc | - | start | 100 [CONFLICT: fsdoc/fallout.wiki page say 150] | +25 | - | - | 1 unit | movement |
| Living Quarters | Capacity | Charisma | start | 100 | +25 [CONFLICT: see 3.3] | 250 | 750 | 1–3 | pop. capacity |
| Power Generator | Production | Strength | start | 100 | +25 | 250 | 750 | 1–3 | Power |
| Diner | Production | Agility | start | 100 | +25 | 250 | 750 | 1–3 | Food |
| Water Treatment | Production | Perception | start | 100 | +25 | 250 | 750 | 1–3 | Water |
| Storage Room | Capacity | Endurance (no effect) | 12 | 300 | +75 | 750 | 2,250 | 1–3 | item slots |
| Medbay | Production | Intelligence | 14 | 400 | +100 | 1,000 | 3,000 | 1–3 | Stimpaks |
| Science Lab | Production | Intelligence | 16 | 400 | +100 | 1,000 | 3,000 | 1–3 | RadAway |
| Overseer's Office | Quests | - | 18 | 1,000 | - (only one allowed) | 3,500 (needs 30 pop) | 15,000 (needs 55 pop) | double only | 1/2/3 quests |
| Radio Studio | Special | Charisma | 20 | 600 | +150 | 1,500 | 4,500 | 1–3 | recruits, happiness |
| Weapon Workshop | Crafting | depends on item | 22 | 800 | +600 | 8,000 (45 pop) | 60,000 (75 pop) | triple only | weapons |
| Weight Room | Training | Strength | 24 | 600 | +150 | 1,500 | 4,500 | 1–3 | +S |
| Athletics Room | Training | Agility | 26 | 600 | +150 | 1,500 | 4,500 | 1–3 | +A |
| Armory | Training | Perception | 28 | 600 | +150 | 1,500 | 4,500 | 1–3 | +P |
| Classroom | Training | Intelligence | 30 | 600 | +150 | 1,500 | 4,500 | 1–3 | +I |
| Outfit Workshop | Crafting | depends on item | 32 | 1,200 [CONFLICT: outfit page says 800 +1,300] | +900 | 12,000 (55 pop) | 90,000 (90 pop) | triple only | outfits |
| Fitness Room | Training | Endurance | 35 | 600 | +150 | 1,500 | 4,500 | 1–3 | +E |
| Lounge | Training | Charisma | 40 | 600 | +150 | 1,500 | 4,500 | 1–3 | +C |
| Theme Workshop | Crafting | depends on item | 42 | 3,200 | +2,400 | 16,000 (65 pop) | 120,000 (105 pop) | triple only | room themes |
| Game Room | Training | Luck | 45 | 600 | +150 | 1,500 | 4,500 | 1–3 | +L |
| Barbershop | Misc | Charisma | 50 | 10,000 | +5,000 | 50,000 (max level 2) | - | double only | appearance |
| Nuclear Reactor | Production | Strength | 60 | 1,200 | +300 | 3,000 | 9,000 | 1–3 | Power |
| Garden | Production | Agility | 70 | 1,200 | +300 | 3,000 | 9,000 | 1–3 | Food |
| Water Purification | Production | Perception | 80 | 1,200 | +300 | 3,000 | 9,000 | 1–3 | Water |
| Nuka-Cola Bottler | Production | Endurance | 100 | 3,000 | +750 | 7,500 | 22,500 | 1–3 | Food **and** Water |

Notes on the table:
- Workshop, office and barbershop upgrade costs are for their fixed size.
- **[CONFLICT] Upgrade costs.** fallout.wiki's summary table lists Power Generator/Diner/Water upgrades as 500/1500, which are the **triple** values. The Bottler row shows 15,000/45,000, also triple. The Medbay/Lab/Nuclear/training rows show **single** values. The per-room pages all agree on the single/double/triple progressions used here.
- **[CONFLICT] Storage room.** The summary table says L2→3 costs 1,500. The per-room page and fsdoc both say 2,250 single, 3,375 double and 4,500 triple. Use 2,250.

---

## 3. Per-room detail (single / double / triple)

### 3.1 Tier-1 production rooms
Power Generator, Diner and Water Treatment. The level names are:
- Power Generator: Generator → Station → Plant
- Diner: Diner → Restaurant → Cafeteria
- Water Treatment: Treatment → Station → Plant

| Stat | Single | Double | Triple |
|---|---|---|---|
| **Upgrade → L2** | 250 | 375 | 500 |
| **Upgrade → L3** | 750 | 1,125 | 1,500 |
| Storage L1 / L2 / L3 (all three rooms) | 50 / 75 / 100 | 100 / 150 / 200 | 150 / 225 / 300 |
| **Food/Water output** L1 / L2 / L3 | 8 / 10 / 12 | 18 / 22 / 26 | 28 / 34 / 40 |
| **Power output** L1 / L2 / L3 | 10 / 12 / 15 | 21 / 25 / 31 | 44 / 52 / 66 |

- Food/Water output fits the formula `2·W·(L+4) − 2` (W = width 1–3, L = level 1–3). That is +2 for each extra connected segment.
- Storage fits `25·W·(L+1)`.
- Power output follows no simple formula. The wiki lists an unfinished one.

### 3.2 Tier-2 production rooms
Nuclear Reactor, Garden and Water Purification. The level names are:
- Nuclear Reactor: Reactor → Advanced → Super
- Garden: Garden → Greenhouse → Hydroponics
- Water Purification: Purification → Station → Plant

| Stat | Single | Double | Triple |
|---|---|---|---|
| Upgrade → L2 | 3,000 | 4,500 | 6,000 |
| Upgrade → L3 | 9,000 | 13,500 | 18,000 |
| Garden/Purifier output L1 / L2 / L3 | 10 / 12 / 15 | 22 / 27 / 33 [the Garden page says 31, probably a typo] | 35 / 46 / 55 |
| Garden/Purifier storage | 50 / 75 / 100 | 100 / 150 / 200 | 150 / 225 / 300 |
| Nuclear output L1 / L2 / L3 | 13 / 15 / 19 | 27 / 32 / 40 | 57 / 68 / 85 |
| Nuclear storage L1 / L2 / L3 | 200 / 300 / 400 | 400 / 600 / 800 | 600 / 900 / 1,200 |

- [CONFLICT] fsdoc lists different L2 and L3 nuclear outputs (14/18, 31/39, 48/59). fallout.wiki's values increase consistently and are preferred.
- Nuclear storage = `100·W·(L+1)`, four times the storage of a generator.

### 3.3 Nuka-Cola Bottler (100 pop, Endurance, makes Food AND Water each cycle)

| Stat | Single | Double | Triple |
|---|---|---|---|
| Build | 3,000 (+750 per existing) | | |
| Upgrade → L2 (Station) | 7,500 | 11,250 | 15,000 |
| Upgrade → L3 (Plant) | 22,500 | 33,750 | 45,000 |
| Output L1 / L2 / L3 (each of food and water) | 10 / 12 / 15 | 22 / 27 / 33 | 35 / 46 / 55 |
| Storage L1 / L2 / L3 | 50 / 75 / 100 | 100 / 150 / 200 | 150 / 225 / 300 |

- [CONFLICT] fsdoc lists triple output as 33/41/50. fallout.wiki is preferred because it matches the Garden and Purifier.
- The summary table gives storage as `50·W·(L+1)`, but the per-room table shows 25·W·(L+1).

### 3.4 Living Quarters
The level names are Living Quarters → Residence → Barracks.

| Stat | Single | Double | Triple |
|---|---|---|---|
| Upgrade → L2 / L3 | 250 / 750 | 375 / 1,125 | 500 / 1,500 |
| Pop. capacity L1 / L2 / L3 | 8 / 10 / 12 | 18 / 22 / 26 | 28 / 34 / 40 |
| Power/min L1 / L2 / L3 | 0.518 / 0.622 / 1.140 | 1.088 / 1.305 / 2.393 | 1.709 / 2.051 / 3.760 |

- Capacity = `2·W·(L+4) − 2`. Five L3 triples = 200, the maximum.
- Build cost [CONFLICT]:
  - Summary table: 100 + 25/room.
  - Living Room page: `5x² + 25x + 100` (x = living quarters already built).
  - fsdoc: "(living spaces × 10) + 10".
  - `5x²+25x+100` is the most specific. [UNCERTAIN]
- Living quarters use Charisma for breeding speed. Two dwellers of opposite sex go to 100% happiness. Pregnancy lasts 3 h, and a child takes another 3 h to grow up.

### 3.5 Storage Room (12 pop)
The level names are Storage → Depot → Warehouse. Storage rooms hold weapons, outfits and junk; they do **not** hold stimpaks or RadAway. The vault has **10 item slots** before any storage room is built.

| Stat | Single | Double | Triple |
|---|---|---|---|
| Upgrade → L2 / L3 | 750 / 2,250 | 1,125 / 3,375 | 1,500 / 4,500 |
| Capacity L1 / L2 / L3 (fallout.wiki Storage page) | 10 / 15 / 25 | 20 / 35 / 55 | 30 / 75 / 125 |
| Capacity by the summary-table formula `5·W·(L+1)` | 10 / 15 / 20 | 20 / 30 / 40 | 30 / 45 / 60 |
| Power/min | 0.51 / 0.62 / 1.13 | 1.08 / 1.31 / 2.39 | 1.70 / 2.04 / 3.75 |

[CONFLICT] The two capacity rows disagree. The FAQ says triples are more efficient for storage, which supports the upper row's super-linear growth, but this is unverified.

### 3.6 Medbay (14 pop) / Science Lab (16 pop)
Both use Intelligence.
- Medbay makes Stimpaks: Medbay → Clinic → Hospital.
- Science Lab makes RadAway: Lab → Station → Center.

| Stat | Single | Double | Triple |
|---|---|---|---|
| Build | 400 (+100 per existing) | | |
| Upgrade → L2 / L3 | 1,000 / 3,000 | 1,500 / 4,500 | 2,000 / 6,000 |
| Output per cycle | 1 | 3 | 4 |
| Storage | 10 per segment | 20 | 30 |

- Base stimpak and RadAway capacity is **5**. Level does not change storage.
- [CONFLICT] fsdoc says output scales with level (1/2/3, 3/6/9, 4/8/12). fallout.wiki says upgrading gives no capacity benefit, and its output row (1/3/4) does not mention level. Upgrades probably speed up production, but this is [UNCERTAIN].
- Three doubles out-produce two triples for the same space, so the FAQ recommends putting medbays and labs in the double slots.
- A stimpak heals 50% HP and cannot heal the radiation part of the bar. A dweller can take at most 25 stimpaks and 25 RadAway into the wasteland.

### 3.7 Radio Studio (20 pop, Charisma)
The level names are Studio → Station → Broadcast Center.
- **Build:** 600 (+150 per existing).
- **Upgrades:** 1,500 / 4,500 single, 2,250 / 6,750 double, 3,000 / 9,000 triple.
- **Wasteland mode:** a timer runs. When it hits zero, the room rolls a chance to create a signal that you use to call one dweller.
  - Called dwellers are level-1 commons with 12 total SPECIAL.
  - Charisma only shortens the timer, by up to 60%. That maximum takes 20 C in a single, 40 in a double and 60 in a triple.
  - Each room can buffer only 1 signal.
  - fsdoc observed about 2 h 47 m per cycle with C2 and about 1 h 47 m with C12 (L2 single).
- **Vault mode:** no signals are made; the room is used for happiness (see §8).
- A poorly staffed radio can attract raiders or deathclaws (wiki). It cannot be rushed.

Signal success chance per roll (FAQ, sourced from data-mining):

| | L1 | L2 | L3 |
|---|---|---|---|
| Single | 8% | 10% | 13% |
| Double | 18% | 23% | 28% |
| Triple | 30% | 33% | 38% |

### 3.8 Training rooms
There is one per SPECIAL stat:

| Room | Stat | Unlock pop. |
|---|---|---|
| Weight Room | Strength | 24 |
| Athletics | Agility | 26 |
| Armory | Perception | 28 |
| Classroom | Intelligence | 30 |
| Fitness | Endurance | 35 |
| Lounge | Charisma | 40 |
| Game Room | Luck | 45 |

- **Build:** 600 (+150 per existing).
- **Upgrades:** 1,500 / 4,500 single, 2,250 / 6,750 double, 3,000 / 9,000 triple.
- Base stats run 1–10; outfits can raise a stat to at most 17.
- Training progress is saved when a dweller leaves the room. Training cannot be rushed with the rush button, but Quantum can skip it.
- **Training pool** (fallout.wiki) to go from stat SP to SP+1:
  - Pool size = `½·(SP² + SP)·1800` points, where 1800 points = 30 min at 1 pt/s.
  - Stat 1→2 needs 1,800 points. Stat 9→10 needs 81,000 points (22.5 h at 1 pt/s).
  - Going from 1 to 10 needs 297,000 points in total, about 82.5 h (about 3 d 10 h) at the base rate.
- **Points per second** = `(1 + 0.02·(D−1)) × (1 + 0.05·(T−1)) × (1 + H)`
  - D = dwellers in the room (1–6)
  - T = room level (1–3)
  - H = vault happiness bonus (0–0.10)
  - The best case is ×1.331, which gives about 2 d 12 h 52 m for a full 1→10.
- The Training Time pet also speeds training. **No SPECIAL speeds training** (FAQ 2.5).

Measured training times for the Weight Room (fallout.wiki). All training rooms are the same.

| Stat | L1 room | L2 room | L3 room |
|---|---|---|---|
| 1→2 | 26 m | 25 m | 24 m |
| 2→3 | 1 h 20 m | 1 h 16 m | 1 h 13 m |
| 3→4 | 2 h 40 m | 2 h 32 m | 2 h 26 m |
| 4→5 | 4 h 27 m | 4 h 14 m | 4 h 3 m |
| 5→6 | 6 h 41 m | 6 h 22 m | 6 h 5 m |
| 6→7 | 9 h 21 m | 8 h 55 m | 8 h 31 m |
| 7→8 | 12 h 28 m | 11 h 53 m | 11 h 21 m |
| 8→9 | 16 h 2 m | 15 h 17 m | 14 h 36 m |
| 9→10 | 20 h 3 m | 19 h 6 m | 18 h 15 m |

### 3.9 Crafting rooms (all triple-only, 6 dwellers)

| Room | Build | Lv2 (pop needed) | Lv3 (pop needed) | Level gating |
|---|---|---|---|---|
| Weapon Workshop (22) | 800 (+600) | 8,000 (45) | 60,000 (75) | L1 common, L2 rare, L3 legendary |
| Outfit Workshop (32) | 1,200 (+900) [CONFLICT: 800 +1,300] | 12,000 (55) | 90,000 (90) | same as above |
| Theme Workshop (42) | 3,200 (+2,400) | 16,000 (65) | 120,000 (105) | themes for fully upgraded diners and living quarters. There are 8 themes (BoS, Institute, Minutemen and Railroad, each for a diner and a living quarters). Each can be crafted only once. |

- The room's stat is the stat of the item being crafted. With nothing being crafted, the room has no stat.
- Crafting time falls with the total of the relevant SPECIAL: about 1% per point for outfits. Weapons have a floor of 2:52 when reduced by SPECIAL alone.
- Example: a Pipe Rifle takes 1 h 42 m.
- Themes take a long time, e.g. the Railroad LQ theme takes 37 h 56 m at L1 and 18 h 58 m at L3.
- Common weapon craft cost = `floor(avgDmg/5) + 5` caps, and it needs `ceil(avgDmg/3)` junk.
- Common outfits cost 5 caps. Rare outfits cost 300 caps. Legendary outfits cost 16,250–22,550 caps.
- Junk is covered in a separate doc.

### 3.10 Overseer's Office (18 pop), Barbershop (50 pop), Vault Door, Elevator

**Overseer's Office**
- Double only, and only one per vault. It takes no staff and uses **no power** (FAQ).
- Levels: L1 allows 1 quest at a time. L2 (Control Station, 3,500 caps, 30 pop) allows 2. L3 (Command Center, 15,000 caps, 55 pop) allows 3.
- It can be demolished and rebuilt without losing quest progress.

**Barbershop**
- Double only. Costs 10,000 (+5,000 per existing) and upgrades to the Salon for 50,000.
- L1 changes hair style and color. L2 adds facial features (glasses, facial hair, hats, ghoul look).
- Higher Charisma shortens the change timer.

**Vault Door**
- Fixed at the top-left of floor 1. It cannot be built or demolished.
- Upgrades cost 500 (L2) and 2,000 (L3). Each upgrade makes it take longer for attackers to break in.
- 2 guards. Guards gain XP only during raids.

**Elevator**
- Costs 100 or 150 [CONFLICT], +25 for each one already built. fsdoc: "You start with 3 elevators. The 4th costs 175; the 7th costs 250."
- 1 unit wide. No upgrades. **No power used.**
- If you build one with nothing above or below it, a second unit is added automatically below it unless a room or rock is in the way.
- Incidents cannot spawn in elevators, and elevators block mole rats from reaching dirt.

---

## 4. Resource production mechanics

### 4.1 The time pool (fallout.wiki "Room time pool")
- Each production room has a hidden **pool**.
- Every second, each working dweller adds their **room stat** to the pool, including outfit bonuses and stats above 10. The total is multiplied by `(1 + happiness bonus)`.
- When the pool is full, the resource is ready to collect and the pool resets. Only the room stat matters, so four dwellers with S5 equal two dwellers with S10.
- **Merging** multiplies the pool size by the width: 2× for a double, 3× for a triple. **Level does not change pool size**. Level increases the **amount** produced (the output tables above).
- The pool is kept when dwellers leave the room.

Base pool sizes. The time shown is for a total stat of 1 in a single room.

| Room | Pool (single) | Time at total stat 1 |
|---|---|---|
| Power Generator | 1,320 | 22 min |
| Nuclear Reactor | 1,800 | 30 min |
| Diner | 960 | 16 min |
| Water Treatment | 960 | 16 min |
| Garden | 1,200 | 20 min |
| Water Purification | 1,200 | 20 min |
| Nuka-Cola Bottler | 1,200 | 20 min |
| Medbay | 2,400 | 40 min |
| Science Lab | 2,400 | 40 min |
| Radio Studio | unknown | - |

**Cycle time formula:** `cycle_seconds = pool_base × W / (Σ room_stat of workers × (1 + H))`, where H is 0–0.10.

Example: a single power generator with one S5 dweller and 100% happiness takes 1320 / (5 × 1.1) = 240 s = **4 min** and makes 10 power.

**Efficiency** (fallout.wiki): resource×1000 / (time×skill) at skill 1.
- A single L1 generator scores 8.26 and a single L1 nuclear reactor 9.08. The bottler scores 20.18, the best.
- At L3 triple, nuclear scores 22.49 against 20.75 for generators.
- Wiki's configuration multipliers relative to a single L1:

| | Single | Double | Triple |
|---|---|---|---|
| L1 | 1.0× | 2.1× | 4.4× |
| L2 | 1.2× | 2.5× | 5.2× |
| L3 | 1.5× | 3.1× | 6.6× |

- These fit `2.1^(W−1) × (0.9 + 0.1 × Σ_{i=1..L} i)`. [UNCERTAIN; this is wiki-derived]

### 4.2 Bonus caps on collection (FAQ 3.16, data-mined)
- The bonus roll happens on every collection and every successful rush.
- Chance of bonus caps = 5% × the average Luck of the room's workers, capped at 50% at L10.
- If the bonus triggers, the game rolls the tiers top-down and stops at the first success:

| Chance | Base value | Multiplier |
|---|---|---|
| 1% | 200 | ×6 |
| 5% | 100 | ×4 |
| 20% | 20 | ×3 |
| 100% (fallback) | 5 | ×1 |

- Caps = `(Base + RoomLevel) × Width × Multiplier`, so the range is 6 to 3,654. Example: a level-3 double hitting the 5% tier gives (100+3)×2×4 = 824.

### 4.3 Collecting and offline progress
- Rooms produce while you are offline, and the game computes elapsed time on load.
- Rooms without workers do not produce.
- Mr. Handy collects resources on his floor automatically.

---

## 5. Consumption, storage and shortages

### 5.1 Consumption
- **Food and water:** about **0.36 per dweller per minute** each (Steam, secondary source) [UNCERTAIN].
  - Only dwellers **inside** the vault consume. Explorers, questers and people waiting in line do not.
  - [CONFLICT] One Steam user saw about 58/min each with 200 dwellers (≈0.29/dweller), which may be because some dwellers were outside.
- **Power:** consumed per room segment by level. Elevators, the vault door, power rooms (per FAQ) and the overseer's office do **not** use power. [CONFLICT] fallout.wiki excludes only elevators and the vault door; the FAQ also excludes power rooms and the office.

Power use per minute, which is about the same for every room type:

| | Single | Double | Triple | Barbershop |
|---|---|---|---|---|
| L1 | 0.52 | 1.09 | 1.71 | - |
| L2 | 0.62 | 1.30 | 2.05 | 2.05 |
| L3 | 1.14 | 2.39 | 3.76 | 3.76 |

- A double uses 5% more than two singles. A triple uses 10% more than three singles.
- L2 uses about 20% more than L1, and L3 about 83% more than L2.
- The wiki calls an L2 double the "sweet spot".
- A full late-game vault uses roughly 160–200 power/min.

### 5.2 Storage caps
- Power, food and water storage is the **sum of the storage of every room of that resource**. The storage values are in the tables in §3.
- Stimpaks and RadAway: 5 base + 10 per medbay or lab segment.
- Items: 10 base plus storage rooms.
- Caps: maximum **999,999**. Caps from lunchbox cards can go past it.
- Population is capped by living quarters, up to 200.

### 5.3 The requirement tick and shortages
- Each resource bar has a **tick mark**, the minimum safe level. Below it, a shortage begins.
  - For power the tick ≈ **total power consumption/min × 13.5**. Examples: 1 single L1 room → 7.02; 7 rooms → 48.87.
  - Rule of thumb: keep the tick at or below 50% of the bar, i.e. 3–4 rooms per 50 power storage. Keep production at least 2× consumption.
  - The tick moves right as consumption rises and left as storage grows.
- **Power shortage:** rooms lose power and stop working, **starting with the rooms farthest from the power sources**. Unpowered rooms go dark and do not produce food or water, which can cascade. Priority: fix power first.
- **Food shortage:** dwellers slowly **lose HP**. They do not die from it alone. [UNCERTAIN; no exact rate was found]
- **Water shortage:** dwellers slowly take **radiation damage**, the red part of the HP bar, which caps maximum HP until RadAway removes it. [UNCERTAIN; no exact rate was found]
- Shortages, low HP and radiation all **lower happiness**.
- The FAQ advises not to spend stimpaks or RadAway during a shortage, because dwellers just get hurt again.

---

## 6. Rushing

- **Which rooms:** production rooms only: power, food, water, bottler, medbay, lab and nuclear. You cannot rush:
  - training rooms, storage, living quarters, the door or elevators
  - the radio (per wiki)
- **Failure chance** (FAQ 3.10, current since v1.5):
  ```
  fail% = max(10, 40 − 1.5 × (avg room stat + avg Luck))   // averages over dwellers in room, outfits included
  fail% += 10 × recentRushes   (up to 6 recent rushes; decays over time / on exiting)
  ```
  - The minimum is 10% at an average of 10 stat and 10 Luck. Averages matter, not totals: one 10/10 dweller has a better rush chance than six 9/9 dwellers.
  - [CONFLICT] An older formula (GameFAQs, pre-1.5) was `40 − 2×(avgL + avgStat) + 10×recent`. Early versions could reach 0%. The minimum has been 10% since.
- **Success:** the resource is produced instantly, with XP and the bonus-caps roll. The room gets a **+10% happiness over 30 s** effect for dwellers in it.
- **Failure:** starts an **incident** in that room: fire, radroach infestation, or (at higher population) mole rats or radscorpions. The room gets a −10% happiness over 30 s effect, and pregnant dwellers flee.
- **Both outcomes reset the production timer**, so only rush right after collecting.
- Incidents are harder in higher-level and merged rooms and scale with the average dweller level.

---

## 7. Vault layout grid

| Property | Value |
|---|---|
| Floors | **25**. The top floor holds the vault door; the other 24 are underground. |
| Width per floor | 8 room segments (each 3 units) + 2 elevators (each 1 unit) = 26 units. Typical layout: [elev][triple][double][triple][elev] or two long elevator shafts. [CONFLICT] One secondary site says "20×25 grid, 20 spaces per level", which doesn't match the wiki's 8-rooms-plus-2-elevators model. |
| Vault door | Fixed at the start of the top floor, 2 segments wide. The first elevator sits next to it. |
| Rocks / boulders | Appear **from floor 4 downward**. They must be blasted with caps before you can build: about **50 caps + 25 per floor** (a secondary source gives 175 on floor 5) [UNCERTAIN formula]. Plain dirt needs no excavation cost. |
| Dirt | Rooms touching dirt can get **mole rats** (from 30 pop, at the time of the FAQ). Dirt above the buildable area does not count. Incidents do **not spread through dirt**, so "checkerboard" layouts isolate them. Elevators between a room and the dirt block mole rats. |
| Spreading | Fires and pests spread to adjacent connected rooms when a room is empty or its dwellers fail. |
| Pathing | Every room must connect to the door. Dwellers path through elevators. Elevators allow crossing and do not queue except at boarding. |
| Advice | Put living quarters and storage deep (fewer incidents to deal with). Put the best fighters in the rooms next to the door. Avoid a nuclear reactor as the first room: it is deep, and dwellers at the back arrive late to fights. |

---

## 8. Happiness

| Item | Detail |
|---|---|
| Resting level | Dwellers settle at **50%**, or **75%** if they work in the room matching their highest SPECIAL (ties count; outfits included). A green outline means it matches. Living quarters, training rooms and the barbershop always show yellow but still count. |
| Vault happiness | The average across dwellers. **Production and training bonus = VaultHappiness / 10 %** (0–10%), applied as `(1+H)` to pool-fill speed. |
| Raises | **Breeding** in living quarters (both → 100%). **Successful rush** (+10% over 30 s to occupants). **Radio studio** in Vault mode (see below). **Happiness pets** (+X%, can exceed 100% hidden). Healing injured or irradiated dwellers. Keeping resources above the tick. |
| Lowers | A **dead dweller in the room** (large hit). Being heavily injured or irradiated. **Failed rush** (−10% over 30 s). Any resource shortage. Removing a dweller from a radio room. Removing a happiness pet. **Any active decrease overrides all increases.** |
| Radio happiness | Placing any dweller in a radio room gives the **whole vault +0.5% to +1%** once. It is +0.5% alone and +1% when the room already holds 5 others (6 in a triple). Removing a dweller gives the same amount negatively. Six dwellers in one triple = +6% vault-wide. This stacks across rooms. Charisma and room level do not matter for happiness. |
| Daily report | Every 24 h caps are awarded by happiness grade. Every 7th day gives a lunchbox instead of caps. |

Daily report grades:

| Grade | Happiness | Caps |
|---|---|---|
| A | ≥93% | 140 |
| A- | 90–92 | 130 |
| B+ | 87–89 | 120 |
| B | 83–86 | 110 |
| B- | 80–82 | 100 |
| C+ | 77–79 | 90 |
| C | 73–76 | 80 |
| C- | 70–72 | 70 |
| D+ | 67–69 | 60 |
| D | 63–66 | 50 |
| D- | 60–62 | 40 |
| E | 50–59 | 30 |
| F | ≤49 | 20 |

---

## 9. Secondary resources

| Resource | Notes |
|---|---|
| Caps | Maximum 999,999. Sources: collection bonus, rushes, exploration, raider loot, selling items, dweller level-ups (caps = the new level), objectives, lunchboxes (100 / 500 / 3,000 cards), the Mysterious Stranger (up to about 5,000; streams below 500, "rain" at 500 and up), Bottle & Cappy, and the daily report. Reviving a dead dweller costs 100 caps at level 1 up to 1,000 at level 50. Survival mode has no revives. |
| Stimpak | Heals 50% HP. Made in medbays. |
| RadAway | Removes radiation. Made in science labs. |
| Nuka-Cola Quantum | Premium currency. Uses: skip wasteland/quest travel, crafting, training and barbershop time at **1 Quantum per 2 h** (rounded up); skip objectives (2, 3, 5, 8, 12, 18, 27, 41, then 62 max; resets on the next free skip); skip daily, weekly or blue quests for 1; finish a theme recipe for 3 per missing fragment (up to 27). Sources: objectives, quests, lunchboxes, Bottle & Cappy (1/2/3/5), exploration, and the store. It cannot be used to rush rooms (that was an early wiki claim). |
| Nuka-Cola (bottler output) | Not a separate resource. The bottler adds its output to **both** food and water each cycle. |

---

## 10. Implementation-ready formulas (summary)

```
buildCost(type)           = base[type] + inc[type] * countBuilt[type]          // LQ may be 5x^2+25x+100
upgradeCost(type,W,L→L+1) = singleUpg[type][L] * {1:1, 2:1.5, 3:2}[W]
foodWaterOut(W,L)         = 2*W*(L+4) - 2          // diner/water treatment; also LQ capacity
storageBasic(W,L)         = 25*W*(L+1)             // power/food/water rooms; nuclear = 100*W*(L+1)
cycleSeconds              = poolBase[type] * W / (sum(workerStat) * (1 + vaultHappiness/1000))  // happiness 0..100 -> 0..0.1
rushFail%                 = max(10, 40 - 1.5*(avgStat + avgLuck)) + 10*min(recent,6)
bonusCapChance            = min(0.5, 0.05*avgLuck); caps = (base+L)*W*mult
powerTick                 = 13.5 * totalPowerConsumptionPerMin
trainPool(SP)             = 900*(SP^2+SP);  rate = (1+0.02(D-1))*(1+0.05(T-1))*(1+H)
foodWaterUse              ≈ 0.36/min per in-vault dweller (unverified)
```

---

## Sources
- fallout.wiki (independent Fallout Wiki, a fork of Nukapedia), raw wikitext:
  - Fallout Shelter Rooms: https://fallout.wiki/index.php?title=Fallout_Shelter_Rooms&action=raw
  - Power: https://fallout.wiki/index.php?title=Power_(Fallout_Shelter)&action=raw
  - Power Generator: https://fallout.wiki/index.php?title=Power_Generator&action=raw
  - Nuclear Reactor: https://fallout.wiki/index.php?title=Nuclear_Reactor&action=raw
  - Nuka-Cola Bottler: https://fallout.wiki/index.php?title=Nuka-Cola_Bottler&action=raw
  - Garden: https://fallout.wiki/index.php?title=Garden_(Fallout_Shelter)&action=raw
  - Water Purification: https://fallout.wiki/index.php?title=Water_purification&action=raw
  - Water Treatment: https://fallout.wiki/index.php?title=Water_Treatment&action=raw
  - Living Room: https://fallout.wiki/index.php?title=Living_Room&action=raw
  - Storage Room: https://fallout.wiki/index.php?title=Storage_room&action=raw
  - Medbay: https://fallout.wiki/index.php?title=Medbay&action=raw
  - Science Lab: https://fallout.wiki/index.php?title=Science_lab&action=raw
  - Radio Studio: https://fallout.wiki/index.php?title=Radio_studio&action=raw
  - Weight Room: https://fallout.wiki/index.php?title=Weight_room&action=raw
  - Weapon Workshop: https://fallout.wiki/index.php?title=Weapon_Workshop&action=raw
  - Outfit Workshop: https://fallout.wiki/index.php?title=Outfit_Workshop&action=raw
  - Theme Workshop: https://fallout.wiki/index.php?title=Theme_workshop&action=raw
  - Overseer's Office: https://fallout.wiki/index.php?title=Overseer%27s_office&action=raw
  - Barbershop: https://fallout.wiki/index.php?title=Barbershop&action=raw
  - Elevator: https://fallout.wiki/index.php?title=Elevator_(Fallout_Shelter)&action=raw
  - Vault Door: https://fallout.wiki/index.php?title=Vault_door_(Fallout_Shelter)&action=raw
  - Happiness: https://fallout.wiki/index.php?title=Happiness_(Fallout_Shelter)&action=raw
  - Rushing: https://fallout.wiki/index.php?title=Rushing&action=raw
  - Daily Report: https://fallout.wiki/index.php?title=Daily_Report&action=raw
  - Bottle Cap: https://fallout.wiki/index.php?title=Bottle_Cap_(Fallout_Shelter)&action=raw
  - Stimpak: https://fallout.wiki/index.php?title=Stimpak_(Fallout_Shelter)&action=raw
  - Nuka-Cola Quantum: https://fallout.wiki/index.php?title=Nuka-Cola_Quantum_(Fallout_Shelter)&action=raw
  - Food: https://fallout.wiki/index.php?title=Food_(Fallout_Shelter)&action=raw
  - Water: https://fallout.wiki/index.php?title=Water_(Fallout_Shelter)&action=raw
- The Fallout Shelter FAQ (therabidsquirel), sections 1–4, 6 and 19: https://github.com/therabidsquirel/The-Fallout-Shelter-FAQ/wiki
  - Section 3 (rooms, rush formula, bonus caps, radio odds): https://github.com/therabidsquirel/The-Fallout-Shelter-FAQ/wiki/Section-3:-Rooms,-Resources,-and-Storage
  - Section 4 (happiness): https://github.com/therabidsquirel/The-Fallout-Shelter-FAQ/wiki/Section-4:-Dweller-Happiness-and-Health
- sharlikran fsdoc (player-made room tables): http://sharlikran.github.io/fsdoc/index.html, e.g. http://sharlikran.github.io/fsdoc/PowerGenerator.html, NuclearReactor.html, StorageRoom.html, Medbay.html, RadioStudio.html, Elevator.html, WeaponWorkshop.html
- Steam discussion "Resource support for 200 dwellers": https://steamcommunity.com/app/588430/discussions/0/135513901708017933/
- Steam discussion "How much do dwellers consume?": https://steamcommunity.com/app/588430/discussions/0/1354868867709244945/
- GameFAQs "Notes on rushing, incident % chance…" (old rush formula): https://gamefaqs.gamespot.com/boards/168521-fallout-shelter/72047443
- Rocks cost (search-result summaries of supercheats / fallout-archive; pages not directly fetchable): https://www.supercheats.com/fallout-shelter/walkthrough/rocks , https://fallout-archive.fandom.com/wiki/Vault_(Fallout_Shelter)
- Inaccessible (HTTP 402): https://fallout.fandom.com/wiki/Fallout_Shelter_rooms

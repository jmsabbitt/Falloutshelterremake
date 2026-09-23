# Fallout Shelter: Dwellers, SPECIAL, Pets, Robots, Weapons, Outfits, Crafting

Research notes for the remake. The main sources are the Fallout Wiki (fandom; wikitext pulled through its API) and **The Fallout Shelter FAQ** by therabidsquirel on GitHub. The FAQ is built with r/foshelter contributors and data-miners such as "Lasercar", and on mechanics it is usually more reliable than the wiki. Its own section 1.3 warns that the wiki is "sometimes incorrect" about mechanics.

**Game versions:** Steam, Android and iOS run **2.x** (1.15 to 1.18 content plus 2.0 seasonal "experimental vaults"). Consoles and other platforms are frozen at **1.13.13**. When a number differs between versions, the notes below say so.

Confidence markers: **[C]** means confirmed by two or more sources or by a data-mine. **[W]** means a single wiki claim. **[?]** means uncertain, or the sources conflict.

---

## 1. SPECIAL overview

Seven stats, S P E C I A L. Training raises a stat to at most **10**. Outfits add up to **+7** in one stat, so the effective maximum in one stat is **17** [C]. The outfit bonus is hidden from the stat bars and shown when you tap them. Every single-stat bonus in the outfit data is at most **+7**. A few 2.x unique outfits give +6 in a stat (Valentine's trench coat P+6, Legate armor E+6, Kellogg's armor A+6, Enclave power armor S+6/E+6), so 17 remains the ceiling [C].

| Stat | Training room (pop unlock) | Vault rooms using it | Exploration (wasteland) | Quests | Crafting |
|---|---|---|---|---|---|
| **S**trength | Weight room (24) | Power generator, Nuclear reactor | Survivability (some events test S) | none | Heavy weapons: Junk Jets, flamers, miniguns, missile launchers, Gatling lasers, Fat Men, plasma throwers, most power fists, plasma casters (46 of 175 weapons) |
| **P**erception | Armory (28) | Water treatment, Water purification | Small help toward legendary junk (normal mode) | **Slows the critical-hit arrow** in the crit mini-game, which makes the x5 multiplier easier | Rifles: BB, lever-action, hunting, pipe, sniper, laser, railway, Gauss, plasma rifles (55 of 175) |
| **E**ndurance | Fitness room (35) | Nuka-Cola bottler; storage room ("right room" only, no effect) | **Rad resistance, immune at E 11+**; legendary junk (normal); survivability | HP only | Shotguns, pickaxe (18 of 175) |
| **C**harisma | Lounge (40) | Living quarters (faster mating), Radio studio (shorter signal timer), Barbershop (faster alterations) | Legendary junk (normal) | none | No weapons. Some outfits |
| **I**ntelligence | Classroom (30) | Medbay (stimpaks), Science lab (RadAway) | none | none | Institute weapons, Fire hydrant bat, pulse rifles, surgical rippers, Ed's power fist (13 weapons, 18 outfits) |
| **A**gility | Athletics room (26) | Diner, Garden (food) | Survivability | **Attack rate** (does NOT affect crit build) | Pistols, assault rifle, alien blasters, rippers, tranq and T60 pistols |
| **L**uck | Game room (45) | **Rush success chance**; **bonus-caps chance on every collection** | **Caps found (scales linearly)**; legendary junk (normal); survivability | **Crit meter build rate** | Butcher knife only |

Myths the FAQ debunks by testing [C]:
- Intelligence does NOT increase XP or training speed. No SPECIAL does.
- Strength does NOT increase weapon damage in the vault or on quests. In the wasteland, each event tests one stat, and some events test S.
- No SPECIAL affects vault combat (incidents), apart from Endurance's effect on HP.
- Outfits and power armor give no armor or damage resistance. Their only effect is the SPECIAL bonus.
- Rooms produce according to the room's **total** stat (all assigned dwellers, outfits included). Rush chance uses the **average** room stat and average Luck.

### 1.1 Luck and bonus caps (data-mined, FAQ 3.11) [C]
When you collect from a production room, or rush it successfully, the chance of bonus caps is **5% per point of average room Luck, capped at 50% at Luck 10**. If the bonus triggers, the game rolls the reward tiers from highest to lowest and stops at the first success:

| Tier chance | Base value | Multiplier |
|---|---|---|
| 1% | 200 | 6 |
| 5% | 100 | 4 |
| 20% | 20 | 3 |
| 100% (fallback) | 5 | 1 |

Caps = `(Base + RoomLevel) * RoomWidth * Multiplier`. The minimum is 6 and the maximum is 3,654. Example: tier 2 in a level 3 double room gives (100+3)*2*4 = 824.

### 1.2 Rush formula [?] (sources conflict)
- FAQ 3.4 (post-1.5 patch): **fail% = 40 − 1.5 × (avg room stat + avg Luck), minimum 10%**, then **+10% for each recent rush, up to 6 recent rushes**. The penalty decays with time or when the game is restarted.
- The older Steam and GameFAQs formula: `40 − 2 × (avgLuck + avgStat) + 10 × recentRushes`. This is probably the pre-1.5 version.
- Wiki: a 0% risk used to be reachable, but an update made it impossible. That matches the 10% floor.
- A successful rush gives the room **+10% happiness over 30 s** plus XP. A failed rush starts an incident and gives **−10% happiness over 30 s**. Training rooms, living quarters, storage, the vault door and elevators cannot be rushed.

### 1.3 Charisma and radio (FAQ 3.17, data-mined) [C]
- Charisma only shortens the radio **timer**, by at most **60%**. That cap is reached at total C 20 in a single room, 40 in a double, 60 in a triple.
- Each timer expiry rolls a chance to generate a signal, which depends only on merge width and upgrade level:

| Radio room | Lv1 | Lv2 | Lv3 |
|---|---|---|---|
| Single | 8% | 10% | 13% |
| Double | 18% | 23% | 28% |
| Triple | 30% | 33% | 38% |

- A room holds one waiting signal. Radio recruits are always **Common**: level 1 with about 12 SPECIAL points (level 5 in Survival, with a weak common weapon). Recruiting can draw Deathclaws or raiders. The wiki names both, and the FAQ discusses Deathclaws (FAQ 6.15).
- Radio happiness (FAQ 4.5): each dweller placed in a radio room gives a one-time vault-wide happiness change of **+0.5% (alone) up to +1% (with 5 others in a triple)**. Removing that dweller applies the same amount as a loss. C and room level do not matter for happiness. The toggle between "Vault" and "Wasteland" broadcast pauses signal generation.

---

## 2. Training rooms

All seven training rooms share the same timetable (verified on the Weight room, Fitness room, Game room and Lounge pages). They cost **600 caps, plus 150 for each existing room of that type**. Upgrades cost 1,500 / 2,250 / 3,000 for Lv2 (single, double, triple) and 4,500 / 6,750 / 9,000 for Lv3. Capacity is 2, 4 or 6 dwellers.

Time for one dweller to gain the next point (wiki table). The base conditions behind these times, such as occupancy and happiness, are not stated [?].

| Stat step | Room Lv1 | Room Lv2 | Room Lv3 |
|---|---|---|---|
| 1 → 2 | 26 m | 25 m | 24 m |
| 2 → 3 | 1 h 20 m | 1 h 16 m | 1 h 13 m |
| 3 → 4 | 2 h 40 m | 2 h 32 m | 2 h 26 m |
| 4 → 5 | 4 h 27 m | 4 h 14 m | 4 h 3 m |
| 5 → 6 | 6 h 41 m | 6 h 22 m | 6 h 5 m |
| 6 → 7 | 9 h 21 m | 8 h 55 m | 8 h 31 m |
| 7 → 8 | 12 h 28 m | 11 h 53 m | 11 h 21 m |
| 8 → 9 | 16 h 2 m | 15 h 17 m | 14 h 36 m |
| 9 → 10 | 20 h 3 m | 19 h 6 m | 18 h 15 m |
| **Total 1 → 10** | **73 h 28 m** | **70 h 0 m** | **66 h 54 m** |

Things that speed training up [C]:
- Higher room level.
- **More dwellers in the same room**, which reduces time for everyone in it.
- The vault happiness bonus (see section 7).
- Training-time pets (Maine Coon, Black Lab, +6 to 30%).
- Nuka-Cola Quantum to finish instantly (1 Quantum per 2 h remaining).

Progress is kept when a dweller leaves the room, because stats accumulate like hidden XP. When a point is earned, an icon appears over the dweller's head and has to be tapped before the next point starts. At 10, the dweller shows "Max Level Reached".

---

## 3. Leveling, XP and HP

- **Max level 50** [C]. Levels come from XP. XP sources: working in a production or crafting room (slow over time), successful rushes, and being in the room when enemies are killed (incidents or quests). Radio rooms give no XP. Training gives no level XP. Crafting rooms do give XP.
- **The per-level XP table was not found** in any accessible source [?]. Sources only say the requirement grows with level. The remake will need its own curve.
- On level-up the dweller's health is fully restored (the RadAway page says leveling heals). The player also receives **caps equal to the new level**.
- The XP gain rate depends on room size, the number and level of co-workers, and rush successes (wiki) [W]. XP pets add +6 to 45%.

### 3.1 HP formula [C]
- Starting HP at level 1 = **105**.
- HP gained at each level-up = **2.5 + 0.5 × END**. END here includes the outfit bonus at the moment of the level-up. Fractions accumulate.
- HP at level 50 = 105 + 49 × (2.5 + 0.5·E), if E is constant throughout.
- **Not retroactive.** Training END after leveling does nothing for HP already gained. That is why END should be trained to 10 at level 1 and the dweller then leveled while wearing a +7 END outfit (Heavy wasteland gear), for 17 END in total. Health pets and all other stats do NOT change max HP.

| END while leveling | HP per level | HP at level 50 |
|---|---|---|
| 1 | 3 | 252 |
| 3 | 4 | 301 |
| 5 | 5 | 350 |
| 7 | 6 | 399 |
| 10 | 7.5 | 472.5 |
| 12 | 8.5 | 521.5 |
| 15 | 10 | 595 |
| 17 | 11 | 644 |

(At every END value from 1 to 17 the rule holds: each extra point of END adds 0.5 HP per level, which is 24.5 HP by level 50.)

In-game HP numbers are hidden. They can only be seen with a save editor.

---

## 4. Health, radiation, death, revival

- **Health bar** (green) with **radiation** (red) growing in from the right. Radiation lowers max HP until removed, but **radiation alone cannot kill** [W].
- Low **food** makes dwellers lose HP. Low **water** makes them gain radiation. Low **power** shuts rooms down, starting with the rooms farthest from the reactors.
- **Stimpak:** heals 50% of max HP and does not remove rads. Produced by the Medbay (Intelligence).
- **RadAway:** removes 50% of rads (the general Radiation page says all). Produced by the Science lab (Intelligence).
- Explorers and quest teams can carry at most **25 stimpaks and 25 RadAway**. Explorers use them automatically at ≤50% HP, or when rads reach 50% of health. On quests the player uses them by hand.
- A steady food and water supply slowly heals HP and rads.
- In the wasteland, END 11+ gives immunity to the radiation bursts of exploration (not in quest combat).
- **Death:** in the vault (incidents), in the wasteland (HP runs out with no stimpaks left), or on quests.
- A dead body left in a room gives a **big happiness loss to living dwellers** in that room.
- **Revive cost:** "**100 caps at level 1 up to 1,000 caps at level 50**" [C]. The FAQ states this in sections 6.13, 10.x and 20.x, and the Steam discussion says "never more than 1000".
  - A widely quoted formula is **100 + 20 × (level − 1)**, but that gives 1,080 at level 50 [?]. The real curve is either capped at 1,000 or about 18.4 caps per level (a linear 100 → 1,000). A reasonable remake choice is `min(1000, 100 + 20*(L-1))` or linear interpolation.
  - The caps an explorer is carrying cannot pay for their own revive.
- Revival **fully heals** the dweller, apart from rads they had before dying, and restores the happiness they had before death. There is no other penalty.
- Choosing **Remove** instead of revive:
  - In the vault, the dweller's equipment goes to storage.
  - In the wasteland, the collected loot and equipment are lost, but an equipped **pet returns** along with everything the dweller carried. The pet page says pets bring back the owner's full inventory, including equipped items.
- On quests, dead members can only be revived after the quest is finished and exited. Survivors carry the gear of the dead.
- **Survival mode: permadeath, no revives** anywhere. This does not apply to Mr. Handy, whose repair still costs 2,000. Survival also has faster resource drain, stronger and more frequent incidents, Deathclaws from 35+ population instead of 60+, and recruits and starting dwellers at level 5.
- The FAQ mentions a time limit for reviving [?], but no number was found. Players say you must revive before leaving or reloading, or the body is removed.

---

## 5. Breeding, pregnancy, children

| Item | Value |
|---|---|
| Where | Living quarters: 2 adults in a single, 4 in a double, 6 in a triple. One man and one woman, not closely related |
| Sequence | Meet, talk, dance, then run to the bedroom. Speed scales with **Charisma** (both dwellers). The game must be actively running for the last step |
| Happiness | Both partners go to **100%** once they start. They cannot be dragged apart after that |
| Pregnancy length | **3 hours** [C] |
| Childhood | **3 hours** from birth to adult. Children cannot be assigned and wander the vault [C] |
| Pregnant women | Do NOT respond to incidents or fight. They **flee to living quarters** (children and pets do too) and return when the incident ends. They also cannot be sent to explore or quest |
| Blocked birth | No birth happens if living capacity is full or the vault has 200 dwellers |
| Twins and triplets | Twins require a "Twins chance" pet on the mother at the moment the baby icon appears. With a successful twins pet, there is a flat 2% chance of triplets [C] |
| Child surname | A boy takes the mother's surname and a girl takes the father's [W] |

**Incest rules** [C]: siblings or half-siblings (any shared parent), parent with child, and grandparent with grandchild cannot mate ("Hanging out with the family" message). Cousins can, and so can aunt with nephew or uncle with niece.

**Inheritance:**
- **Appearance:** the child inherits looks (hair, skin) from the parents. Exact rules were not captured [?].
- **Primary stat:** a 50/50 pick of either parent's highest base SPECIAL (outfits not counted).
  - Ties in **2.x:** the stat earlier in S-P-E-C-I-A-L order wins.
  - Ties in **1.13:** a lookup table decides. With all stats tied, Intelligence wins. With only two tied, the order is E>C>P>I>A>L>S.
- **Common children** get about 12 to 13 total points. The primary stat is 3 and the others are 1 or 2.
- **Rare and legendary children** (FAQ 5.7, data-mined) [C]:
  - `max = (maleTotalSPECIAL + femaleTotalSPECIAL − 14) / 126`
  - `value = random(max/4, max)`
  - `value ≥ 0.95` gives a **legendary-stat** child (40 points). `0.85 ≤ value < 0.95` gives a **rare-stat** child (28 points). Anything lower gives a common child.
  - Two parents with maxed stats (70 + 70) get 80% common, about 13.33% rare and about 6.67% legendary.
  - A rare child needs the parents' combined base SPECIAL at **≥122**. A legendary child needs **≥134**.
  - These children are still labelled **Common rarity**. Only the stat total differs.
- A "Child SPECIALs" pet on the mother when you tap the baby icon adds **+1 to +3 to every one of the child's stats**, so +3 means 21 extra points.

---

## 6. Population and assignment

- **Maximum 200 dwellers.** Explorers, questers and the dead all count.
- Living quarters capacity: single 8, double 18, triple 28. Residence upgrade: 10 / 22 / 34. Barracks upgrade: 12 / 26 / 40.
- Five level 3 triple living quarters give 200. Cost of the n-th living quarters = `5x² + 25x + 100` caps, where x is the number of existing living quarters.
- You cannot build living quarters beyond 200 capacity, and you cannot demolish below current population.
- The arrival queue at the vault door holds at most 10. Lunchboxes cannot be opened while it is full.
- Start of game: up to **15 dwellers** (the tutorial wave). Common dwellers start at level 1.
- **Drag and drop:**
  - Dragging a dweller into a room starts that room's activity.
  - The room outline is **green** for the "right" room (the dweller's highest SPECIAL, outfits included, ties all count) and **yellow** otherwise. Living quarters, training rooms and barbershops always show yellow even when they are the right room.
  - Dropping a dweller into a full room **swaps out the occupant with the lowest relevant stat** (random among ties). That dweller goes on a "coffee break".
  - A dweller dragged into a room during an incident returns to their previous job afterwards.
- **Wrong room effects:**
  - A low relevant stat means slower production.
  - Happiness stabilizes at **50%** in a wrong room versus **75%** in the right room [C].
  - Nothing is otherwise blocked.
- Limits: **25 explorers**, **5 Mr. Handy explorers** and **3 quest teams** of 3, all independent.
- An explorer carries up to **100 items**. Recipes, lunchboxes and pet carriers do not count toward that limit.
- Incident population thresholds:

| Incident | Starts at population |
|---|---|
| Raiders | 14+ |
| Feral ghouls | 40+ |
| Radscorpions | 50+ |
| Deathclaws | 60+ (35+ in Survival) |

- Incident strength scales with the **average dweller level** and with the size and level of the room the incident starts in.

---

## 7. Happiness

- Happiness is tracked for each dweller (0 to 100%). The vault's happiness is the average.
- **Efficiency bonus** = vault happiness / 10, so **0 to 10%**. It applies to production **and training** speed [W].
- The daily report pays caps based on happiness. The 7th consecutive daily reward is a lunchbox.

| Raises happiness | Effect |
|---|---|
| Right room (highest SPECIAL) | Stabilizes at 75% (otherwise 50%) |
| Mating in living quarters | Sets both to 100% |
| Successful rush | +10% over 30 s for everyone in the room |
| Radio room placements | +0.5% to 1% vault-wide for each dweller added |
| Happiness pets (Persian, Poodle, Rollerbrain) | +25% to 100%. Can exceed 100% internally (the display stops at 100%). Removing the pet removes the bonus |
| Healing with stimpaks and RadAway | Removes the injury and irradiation penalty |
| Training rooms | Counts as a room assignment (can be the right room) |

| Lowers happiness | Effect |
|---|---|
| Dead body in the room | Large loss |
| Heavy injury or irradiation (food or water shortage) | Continuous loss |
| Failed rush | −10% over 30 s for everyone in the room |
| Removing a dweller from a radio room | −0.5% to 1% vault-wide |
| Removing a happiness pet | Loses the pet's bonus |

Decreases always override increases while both are active.

---

## 8. Dweller rarity and legendary dwellers

| Rarity | SPECIAL total | Sources |
|---|---|---|
| Common | about 12 to 13 | Radio, birth (always labelled Common), starting wave |
| Rare | **28** (random distribution; 3 preset exceptions) | Lunchboxes, quest or random-encounter survivors, rare arrivals at the door, starter pack |
| Legendary | **40** | Lunchboxes (5th card: legendary dweller 3.8%), some quests (for example Sarah Lyons, Three Dog, Preston Garvey through overseer's office quests) |

- Rare and legendary dwellers arrive in their own outfit. Legendaries come with a **legendary outfit and usually a rare or legendary weapon**.
- They are **not unique**, so duplicates are possible. All cards are equally likely to be drawn.
- 20 preset rare dwellers exist only in the game files. Each has randomized looks and a name.

### 8.1 Legendary dwellers (53 as of 2.0.0, wiki)
Stats are base SPECIAL (S P E C I A L). Entries marked "–" were left blank on the wiki.

| Name | Origin | Weapon | Outfit | S | P | E | C | I | A | L |
|---|---|---|---|---|---|---|---|---|---|---|
| Abraham Washington | FO3 | Lincoln's repeater | Abraham's relaxedwear | 2 | 8 | 6 | 6 | 8 | 4 | 6 |
| Allistair Tenpenny | FO3 | Victory rifle | Tenpenny's suit | 2 | 9 | 2 | 9 | 7 | 2 | 9 |
| Amata | FO3 | Lone Wanderer | – | 4 | 6 | 5 | 8 | 4 | 7 | 6 |
| Betty | TV | 10mm pistol | Vault 33 suit | 3 | 7 | 5 | 7 | 7 | 4 | 7 |
| Bittercup | FO3 | – | Bittercup's outfit | 5 | 4 | 7 | 9 | 5 | 5 | 5 |
| Butch (DeLoria) | FO3 | Lone Wanderer | Tunnel Snakes' outfit | 5 | 7 | 6 | 9 | 5 | 6 | 2 |
| Chet | TV | Baseball bat | Vault 33 suit | 7 | 4 | 5 | 7 | 5 | 5 | 7 |
| Colonel Autumn | FO3 | Smuggler's End | Autumn's uniform | 4 | 6 | 5 | 9 | 5 | 5 | 6 |
| Confessor Cromwell | FO3 | – | Confessor Cromwell's rags | 7 | 4 | 7 | 8 | 6 | 3 | 5 |
| Conrad Kellogg | FO4 | – | Kellogg's armor | – | – | – | – | – | – | – |
| Cooper Howard | TV | .32 pistol | Sleek suit | 5 | 5 | 5 | 10 | 5 | 7 | 3 |
| Desdemona | FO4 | Railmaster | Heavy merc gear | 2 | 8 | 5 | 7 | 8 | 7 | 3 |
| Dr. Henry | FNV | Tri-beam laser rifle | Wasteland surgeon | 4 | 7 | 4 | 4 | 8 | 6 | 7 |
| Dr. Li | FO3/FO4 | – | Expert lab coat | 4 | 6 | 6 | 7 | 9 | 4 | 4 |
| Ed the Ghoul | original | Ed's custom power fist | RobCo R&D suit | 6 | 5 | 7 | 3 | 9 | 3 | 7 |
| Elder Lyons | FO3 | Smuggler's End | Elder robe | 4 | 3 | 3 | 9 | 9 | 3 | 9 |
| Eulogy Jones | FO3 | Blackhawk | Eulogy Jones' suit | 5 | 6 | 5 | 8 | 5 | 4 | 7 |
| Hank | TV | 10mm pistol | Vault 33 suit | 6 | 6 | 5 | 7 | 7 | 4 | 5 |
| Hank (New Vegas) | TV | T60 pistol | Hank's power armor | 6 | 6 | 5 | 7 | 7 | 4 | 5 |
| Harkness | FO3 | Infiltrator | Heavy battle armor | 8 | 5 | 8 | 5 | 5 | 6 | 3 |
| James (Dad) | FO3 | Wild Bill's Sidearm | Expert lab coat | 5 | 8 | 4 | 7 | 9 | 4 | 3 |
| Jericho | FO3 | Infiltrator | Heavy leather armor | 8 | 6 | 8 | 2 | 3 | 7 | 6 |
| Legate | TV | Relentless raider sword | Legate armor | 9 | 6 | 8 | 6 | 3 | 4 | 4 |
| Liam Binet | FO4 | – | Expert Institute jumper | 2 | 7 | 3 | 5 | 10 | 8 | 5 |
| Luc the Human | original | Alien blaster | Incognito leisurewear | 5 | 6 | 5 | 6 | 6 | 6 | 6 |
| Lucas Simms | FO3 | Infiltrator | Sheriff's duster | 5 | 9 | 8 | 5 | 5 | 6 | 2 |
| Lucy (MacLean) | TV | Tranq gun | Lucy's vault suit | 4 | 7 | 6 | 5 | 6 | 5 | 7 |
| Lucy (New Vegas) | TV | Shotgun | Mojave wasteland survivor | 4 | 7 | 6 | 5 | 6 | 5 | 7 |
| Ma June | TV | Enhanced hunting rifle | Ma June jacket | 5 | 7 | 5 | 7 | 6 | 4 | 6 |
| Maximus | TV | T60 pistol | BOS casual | 7 | 6 | 6 | 5 | 4 | 7 | 5 |
| Moira Brown | FO3 | – | Expert jumpsuit | 4 | 8 | 3 | 8 | 7 | 5 | 5 |
| Moldaver | TV | Amplified laser pistol | Moldaver's armor | 3 | 6 | 5 | 10 | 7 | 4 | 5 |
| Mr. Burke | FO3 | Wild Bill's Sidearm | Lucky formal wear | 4 | 7 | 4 | 6 | 9 | 2 | 8 |
| Mr. House | TV | – | Mr. House's suit | 2 | 5 | 6 | 9 | 9 | 2 | 7 |
| Nick Valentine | FO4 | – | Valentine's trench coat | – | – | – | – | – | – | – |
| Norm | TV | Tranq gun | Vault 33 suit | 3 | 8 | 4 | 4 | 9 | 6 | 6 |
| Old Longfellow | FO4 Far Harbor | Henrietta | Tattered longcoat | 5 | 7 | 8 | 4 | 6 | 3 | 7 |
| Paladin (Xander Harkness) | TV | Amplified Gatling laser | BoS paladin jacket | 8 | 10 | 8 | 2 | 4 | 5 | 3 |
| Paladin Danse | FO4 | Amplified laser rifle | Paladin Danse's power armor | 5 | 6 | 7 | 4 | 7 | 8 | 3 |
| Piper | FO4 | – | Piper's outfit | 4 | 4 | 9 | 6 | 7 | 4 | 4 |
| Preston Garvey | FO4 | Laser musket | Minuteman uniform | 3 | 9 | 8 | 6 | 5 | 6 | 3 |
| Regs | FO76 | 10mm pistol | Regs' dirty black suit | 2 | 10 | 5 | 7 | 8 | 5 | 3 |
| Sarah Lyons | FO3 | Wazer Wifle | T-51f power armor | 8 | 6 | 8 | 6 | 5 | 5 | 2 |
| Scribe Rothchild | FO3 | Lone Wanderer | Scribe Rothchild's robe | 6 | 5 | 6 | 9 | 4 | 5 | 5 |
| Scribe Valdez | FO76 | – | Scribe robe | 5 | 7 | 5 | 5 | 8 | 6 | 4 |
| Snake Oil Salesman | TV | 10mm pistol | Sleazy suit | 4 | 5 | 5 | 8 | 8 | 4 | 6 |
| Star Paladin Cross | FO3 | Smuggler's End | T-51f power armor | 7 | 8 | 4 | 8 | 4 | 6 | 3 |
| Stephanie (Harper) | TV | Assault rifle | Vault 33 suit | 2 | 8 | 4 | 10 | 7 | 5 | 4 |
| The Ghoul | TV | Mare's Leg | The Ghoul's coat | 5 | 6 | 7 | 7 | 4 | 7 | 4 |
| The Ghoul (New Vegas) | TV | Ghoul revolver | Prewar cowboy costume | 5 | 6 | 7 | 7 | 4 | 7 | 4 |
| Three Dog | FO3 | – | Three Dog's outfit | 4 | 4 | 6 | 9 | 5 | 5 | 7 |
| Wilzig | TV | 10mm pistol | Wilzig's travelwear | 3 | 7 | 6 | 5 | 10 | 5 | 4 |
| 76 Overseer | FO76 | Mountain Momma | Sturdy vault suit | 4 | 5 | 7 | 8 | 6 | 5 | 5 |

Notes:
- Every row with stats sums to 40 except Piper, who sums to 38 as listed on the wiki (probably a wiki typo [?]). Treat 40 as the design total.
- **Elder Maxson is NOT a legendary dweller** in Fallout Shelter. He does not appear in the wiki list. "Maxson's Roughnecks" appears only as a quest faction [?].
- Rare dwellers in the wiki table (28 points each) include, for example: Akira Katana (Ninja outfit, 4/3/4/3/4/8/3), Carlos the Great (all 6s, which is a preset exception), and Laurel Divinitus (all 7s, 49 points, also a preset exception).

---

## 9. Mysterious Stranger

- A trench-coated NPC who appears at random in a **powered** room or an elevator. His arrival is announced by a sound cue and a puff of smoke.
- Tapping him before he vanishes awards a random amount of caps. Amounts are not documented. Community reports range from a few hundred to a few thousand, scaling with vault progress [?].
- He spawns at intervals of **at least about 10 minutes**, whether or not an incident is happening. He never spawns in unpowered rooms.
- **Stranger-chance pets** (Toyger cat x2.5 / x5 / x7.5; Akita dog x2.5 / x5 or x7.5) increase the appearance chance. The effect applies to the whole room the pet is in.

---

## 10. Robots: Mr. Handy and Snip Snip

| Property | Mr. Handy |
|---|---|
| Source | Lunchbox 5th card (0.2%), Mr. Handy boxes (store, objectives), quests ("Collector's Edition", "Robot Retrieval", others) |
| Rarity | Legendary card |
| Placement | **One per floor**. Moves along that floor collecting finished resources automatically. Can be told not to collect |
| Incidents | Always responds on his floor. Weapons are a flamer and a saw. He follows invaders from room to room on the floor |
| Healing | **Cannot heal.** Damage accumulates until he is destroyed, then he explodes like a mini-nuke. Repair costs **2,000 caps** (also in Survival). Destruction does not count as a casualty |
| Exploration | Up to **5** at once. Collects caps only, takes no damage and avoids fights. Returns automatically at **5,000 caps**, which takes about 2.5 to 5 days, plus return time of half the outbound time |
| Cannot | Tap level-up, stat-up, birth or barbershop icons. Collect from crafting rooms. Use radio signals. Earn XP or train |

**Snip Snip** (2.x only, update 1.16): a Mr. Handy variant from the "Power Struggle" questline. A Mr. Handy box gives Snip Snip 8% of the time (92% plain Mr. Handy). He takes 33% less damage from all incidents except Deathclaws and deals 50% more damage.

Data-mined incident numbers (per tick):

| Incident | Handy dealt | Handy taken | Snip dealt | Snip taken |
|---|---|---|---|---|
| Fire | 1 | 2.76 | 1.5 | 1.85 |
| Radroaches | 1 | 0.38 | 1.5 | 0.25 |
| Mole rats | 3 | 4.14 | 4.5 | 2.77 |
| Radscorpions | 3 | 5 | 4.5 | 3.35 |
| Raiders / Aliens | 2 | 3.25 | 3 | 2.18 |
| Feral ghouls | 2 | 4 | 3 | 2.68 |
| Deathclaws | 3 | 6.5 | 4.5 | 6.5 |

Against fires, every dweller contributes 1 point of firefighting (Mr. Handy 1, Snip Snip 1.5). Other robots (Protectrons, Eyebots, added in 1.15) are **quest enemies only**, not vault helpers. The Rollerbrain and the Alien Drone are **pets**.

---

## 11. Pets (added in update 1.4)

**General rules** [C]:
- Pets come from **pet carriers** (store, objectives, quests) and from lunchboxes (2nd card: common 2.3%, rare 0.5%, legendary 0.1%; 5th card: 0.03% / 0.9% / 0.3%).
- Room limit: **pets equipped ≤ half the room's dweller capacity** (1 in a single, 2 in a double, 3 in a triple). The vault door allows 2.
- There is a global maximum of **100 equipped pets**.
- **Bonuses with the same effect do not stack** within their area of effect. Only the highest applies.
- **Room-wide effects:** crafting cost, crafting time, objective completion and stranger chance.
- **Quest team-wide effect:** wasteland return speed.
- **Hidden bonus:** every pet adds **+2 / +4 / +6 damage (common / rare / legendary)** in the vault and on quests, on top of any damage-pet bonus. Not in exploration.
- Pets are indestructible. When the owner dies in the wasteland or on a quest, the pet returns with all the owner's gear. This is vital in Survival.
- During incidents, pets hide in living quarters.
- Some breeds have no common or rare version, only three legendary versions of different strength: Bloodhound, Pit Bull, LaPerm, Manx.

| Bonus type | Breeds (legendary name) | Common | Rare | Legendary |
|---|---|---|---|---|
| Damage (+flat) | Lykoi cat (Calypso); Pit Bull (Ranger / Titan / Hulk); Trained parrot (Butch, Polly); Alien Drone (rare) | +2 | +4 | +6 |
| Damage resistance | Abyssinian cat (Zula); Pirate parrot (Wanderer) | +20–24% | +36–40% | +46–50% |
| Health | Bombay cat (Shadow); Rottweiler (Maizie Rai) | +25–33% | +58–66% | +91–100% |
| Healing speed | British Shorthair (Ashes); Doberman (Apolda) | x2 | x3 | x4 |
| Rad healing speed | Siamese (Goblet); German Pointer (Mr. Peepers) | x2 | x3 | x4 |
| Happiness | Persian (Mr. Pebbles); Poodle (Lord Puffington); Rollerbrain | +25–33% | +58–66% | +91–100% |
| XP | Scottish Fold (Ginger); Boxer (Scavver); Belgian Malinois CX404 | +6–15% | +21–30% | +36–45% |
| Training time | Maine Coon (Bangor); Black Lab (Muttface); Persian (Pugsley) | +6–10% | +16–20% | +26–30% (legendary = "uninterrupted training") |
| Crafting time | Havana Brown (Merlin); Somali (Saffron); Greyhound (Little Helper) | −6–15% | −6–10% to −21–31% | −36–45% |
| Crafting cost | Burmilla (Cloudy, Diamond); Collie (Pal, Bigsby); English Mastiff (Goliath) | −6–10% | −6–20% | −16–45% |
| Crafting time and cost | Brittany (Gaston) | −6–10% | −16–20% | −26–30% |
| Wasteland caps | American Shorthair (Sterling); Cattle Dog (Four Score) | +6–15% | +21–30% | +36–50% |
| Wasteland junk | Pallas's cat (Cinder); St. Bernard (Barry); LaPerm (Static / Luna / Pouncer); Bloodhound (Valentine / Moose / Duke) | +25–33% | +58–66% | +91–100% |
| Wasteland weapons and outfits | Ocicat (Speckle); Golden Retriever (Cindy) | +6–10% | +16–20% | +26–30% |
| Wasteland return speed | Sphynx (Bastet); Husky (Trench); German Pointer (Cocoa Bean) | x1.25 | x2 | x4 |
| Stranger chance | Toyger (Kato); Akita (Kabosu, Kuma) | x2.5 | x5 | x7.5 |
| Objective completion | German Shepherd (**Dogmeat**); Vault-Tec parrot (Vinnie, Pip) | – | x2 | x3 |
| Twins chance | Manx (Genius / Stubbs / Shakespeare); Dalmatian (Lucky, Pongo) | – | +25% | +50% / +75% |
| Child SPECIALs | Turkish Van (Pumpkin, Duchess); Australian Shepherd (Bandit) | – | +1 | +2 / +3 |

(About 20 cat breeds, 20 dog breeds, 3 parrots and 2 others. Ranges are rolled when the pet is obtained, so every pet is a little different.)

---

## 12. Weapons

- **238 weapons** as of 2.0.0, according to the in-game Survival Guide. Weapons come from exploration, quests, crafting, lunchboxes, legendary dwellers and dead raiders.
- **Fist = 1 damage.**
- **Rarity and sell value:** Common sells for 10 caps, Rare for 100, Legendary for 500.
- Weapons come in **families of 4 to 6 tiers** (Rusty → base → Enhanced/Tuned → Hardened/Focused → Armor piercing/Amplified → named Legendary). Each tier raises average damage by about 0.5 to 1.5.
- **Damage is uniform between min and max.** Compare weapons by average damage. No SPECIAL modifies damage.
- In quests there are 4 attack types [C]:
  - **Single-shot** (most weapons).
  - **Melee:** only one melee attacker per enemy, and the enemy targets them back.
  - **Multi-shot** (miniguns, Gatling lasers, power fists): damage is split over several shots and carries over to a new target when one dies.
  - **AOE** (Fat Man and missile launcher families): damage is split across all enemies.
- Best weapons:

| Weapon | Damage | Avg | Rarity | Note |
|---|---|---|---|---|
| Dragon's Maw | 22–29 | 25.5 | Legendary | Best overall. Craft-only |
| Fire hydrant bat | 19–31 | 25 | Legendary | Best melee. Craft-only (plus one quest reward) |
| MIRV | 22–27 | 24.5 | Legendary | Best AOE |
| Overcharged plasma thrower | 21–27 | 24 | Legendary | |
| Vengeance | 21–26 | 23.5 | Legendary | Best multi-shot |
| Armor piercing BOS assault rifle | 19–21 | 20 | Rare | Best rare (2.x only) |
| Plasma rifle | 17–18 | 17.5 | Rare | Best rare on 1.13 |
| Lone Wanderer | 2–7 | 4.5 | Legendary | Weak legendary: legendary versions of low-tier families stay weak |
| Red Rocket | 0–6 | 3 | Legendary | Weakest legendary (BB gun family) |

The full list is in Appendix A1.

---

## 13. Outfits

- **147 outfits** as of 2.1.1. Outfits only give SPECIAL bonuses. Some are gender-locked (M or F).
- Everyone starts in the Vault suit (+0).
- **Tier pattern** for single-stat lines: Common **+3**, Rare **+5**, Legendary **+7**. Two-stat lines split as 2+1 / 3+2 / 4+3.

| Stat | +3 common | +5 rare | +7 legendary |
|---|---|---|---|
| S | Military fatigues | Officer fatigues | Commander fatigues |
| P | Armored vault suit | Sturdy vault suit | Heavy vault suit |
| E | Wasteland gear | Sturdy wasteland gear | **Heavy wasteland gear** (used for leveling) |
| C | Nightwear | Naughty nightwear | Lucky nightwear |
| I | Lab coat | Advanced lab coat | Expert lab coat |
| A | Handyman jumpsuit | Advanced jumpsuit | Expert jumpsuit |
| L | Formal wear | Fancy formal wear | Lucky formal wear |

- Unique legendary outfits reach **+16 total**: War's armor, Death's jacket, Famine's vestment, Pestilence's plating, Rackie Jobinson's jersey, Detective outfit (+4 in four stats each).
- **Power armor** gives only SPECIAL, with no protection. For example X-01 Mk VI gives S+5 P+1 E+1.
- The full list is in Appendix A2.

---

## 14. Junk and crafting

### 14.1 Junk (21 items, 7 material types × 3 rarities)

| Type | Common (value 2) | Rare (value 50) | Legendary (value 200) |
|---|---|---|---|
| Circuitry | Alarm clock | Camera | Military circuit board |
| Leather | Baseball glove | Brahmin hide | Yao guai hide |
| Adhesive | Duct tape | Wonderglue | Military duct tape |
| Cloth | Yarn | Teddy bear | Tri-fold flag |
| Science | Magnifying glass | Microscope | Chemistry flask |
| Steel | Desk fan | Shovel | Giddyup Buttercup |
| Valuables | Toy car | Globe | Gold watch |

- **Sources:** exploration, quests, dead enemies, lunchboxes (4th card is always junk: common 21.5%, rare 46.4%, legendary 32.1%), and scrapping.
- A recipe uses up to 3 junk types, up to 5 of each. Themes use up to 5 types, 6 of each.
- **Scrapping** returns only the item's recipe junk minus a random amount [C]:
  - **Common items:** subtract 0 / 1 / 2 / 3 at 25 / 40 / 25 / 10%.
  - **Rare items**, rare junk: subtract 0 / 1 / 2 / 3 / all at 20 / 25 / 25 / 20 / 10%. Common junk: subtract 0 or 1 at 50 / 50%.
  - **Legendary items**, legendary junk: subtract 0 / 1 / 2 / 3 at 20 / 30 / 30 / 20%. Always at least 1 is returned. Rare junk: subtract 0 or 1 at 50 / 50%.

### 14.2 Workshops

| Workshop | Unlock pop | Build cost | Lv2 (rare items) | Lv3 (legendary items) |
|---|---|---|---|---|
| Weapon workshop (triple, 6 dwellers) | 22 | 800 (+600 per existing one) | Weapon Factory, 8,000 caps, pop 45 | Weapon Plant, 60,000 caps, pop 75 |
| Outfit workshop (triple) | 32 | 800 (+1,300 per existing one) | Outfit Factory, 12,000, pop 55 | Outfit Plant, 90,000, pop 90 |
| Theme workshop | 42 | 3,200 (+2,400) | 16,000 | 120,000 |

- **Recipes:** common items need no recipe. **Rare items need a rare recipe and legendary items need a legendary recipe.** A recipe, once found, unlocks the item permanently.
- **How recipes drop:**
  - Exploration converts a found common item into a rare recipe **5%** of the time, and a found rare item into a legendary recipe **25%** of the time. The legendary conversion needs a Lv2+ workshop.
  - Raiders convert a common drop into a rare recipe **5–25%** of the time (+5% for each 10 levels of vault average level). They convert a rare drop into a legendary recipe **25%** of the time.
  - Recipes can also be quest loot.
- **Crafting stat:** each item has a governing stat (see the weapon mapping in section 1). The room's **total** of that stat (all 6 dwellers plus outfits, maximum 6×17 = 102) reduces the time. At 102 total, the minimum time from SPECIAL alone is **2 m 52 s** for commons and rares. Legendaries take several hours even at 102. Crafting-time pets reduce it further.
- **Common weapon cost formulas** [W]:
  - caps = `floor(avgDamage/5) + 5`
  - junk count = `ceil(avgDamage/3)`
- **Rare weapon junk** = 3 or 5 common + `floor(avgDmg × 0.33 + 0.5)` rare. The cap-cost formula for rares is unknown. Rare weapons cost 200 to 500 caps.
- **Legendary weapons** cost about **16,800 to 22,050 caps** plus legendary junk.
- Example weapon crafts (total stat 10 / 60 / 102):

| Item | Stat | Junk | Caps | 10 | 60 | 102 |
|---|---|---|---|---|---|---|
| .32 pistol (C) | A | Desk fan ×1 | 5 | 25 m 40 s | 10 m 9 s | 2 m 52 s |
| Hunting rifle (C) | P | Duct tape, Toy car | 6 | 1 h 42 m | 40 m 39 s | 2 m 52 s |
| Laser rifle (R) | P | Camera ×4, Desk fan ×3, Magnifying glass ×2 | 300 | 8 h 34 m | 3 h 23 m | 2 m 52 s |
| Plasma rifle (R) | P | Alarm clock ×3, Globe ×3, Microscope ×3 | 400 | 13 h 49 m | 6 h 4 m | 2 m 52 s |
| Minigun (L) | S | Gold watch ×4, Wonderglue ×3, Shovel ×2 | 19,950 | 12 d 0 h | 5 d 15 h | 9 h 25 m |
| Fat Man (L) | S | Shovel ×4, Mil. duct tape ×3, Chem flask ×2 | 21,000 | 12 d 16 h | 5 d 23 h | 10 h 5 m |
| Dragon's Maw (L) | S | Chem flask ×3, Globe ×3, Mil. circuit board ×3 | 22,050 | 13 d 7 h | 6 d 6 h | 10 h 45 m |

- **Outfit crafting time.** Roughly 1% less time per relevant SPECIAL point. Caps: Common 5, Rare 300, Legendary 16,250 to 22,500.

| Total room stat | Common | Rare | Legendary (21,000 caps) |
|---|---|---|---|
| 0 | 1 h 26 m 23 s | 9 h 36 m | 14 d 0 h |
| 10 | 1 h 17 m 9 s | 8 h 34 m | 12 d 16 h |
| 30 | 58 m 41 s | 6 h 31 m | 10 d 0 h |
| 60 | 30 m 59 s | 3 h 26 m 40 s | 6 d 0 h 17 m |
| 90 | 3 m 18 s | 22 m 1 s | 2 d 0 h 25 m |
| 102 | 2 m 52 s | 2 m 52 s | 10 h 5 m 24 s |

- Example outfit recipes:
  - Formal wear: Yarn ×2, 5 caps.
  - Fancy formal wear: Yarn ×5, Teddy bear ×4, 300 caps.
  - Lucky formal wear: Tri-fold flag ×5, Teddy bear ×4, 21,000 caps.
  - Heavy wasteland gear: Globe ×4, Yao guai hide ×3, Chem flask ×2, 21,000 caps.
- Full recipe tables are in Appendix A3 (weapons) and A4 (outfits).

### 14.3 Lunchbox odds (5 cards; relevant to item and dweller acquisition)

| Card | Contents |
|---|---|
| 1 | Caps (100%) |
| 2 | Common weapon 38.8%, rare 7.9%, legendary 1.3%; common outfit 42.1%, rare 5.3%, legendary 1.7%; pets 2.9% |
| 3 | Water, food, power, stimpak or RadAway (about 18% each), Quantum 8.8% |
| 4 | Junk: common 21.5%, rare 46.4%, legendary 32.1% |
| 5 (guaranteed rare or better) | Rare dweller 21.2%, legendary dweller 3.8%, Mr. Handy 0.2%, rare weapon 13.3%, legendary weapon 7.3%, rare outfit 12.27%, legendary outfit 8.2%, pets 1.23%, caps 32.5% |

---

## 15. Open questions and conflicts

1. **XP table per level:** not found. Needs a design decision.
2. **Revive cost curve:** the end points (100 at L1, 1,000 at L50) are confirmed. The curve between them is not (20/level with a cap, versus linear at about 18.37/level).
3. **Rush formula coefficient:** 1.5 (FAQ, post-1.5, 10% floor) versus 2 (older sources). The FAQ value is the one to trust.
4. **Mysterious Stranger cap amounts and spawn odds:** no data. Only "at least about 10 minutes between spawns".
5. **RadAway:** the Shelter wiki page says it removes 50% of rads. The general Radiation page says "all rads instantly". 50% is probably right for Shelter.
6. **Max per-stat bonus:** no outfit exceeds +7 in a single stat (the largest in 2.x uniques are +6), so 10 + 7 = 17 holds.
7. **Kellogg and Nick Valentine** base stats are blank on the wiki.
8. **Training base time conditions** (single dweller? happiness?) are unspecified.

---

## Appendix A: full data tables (from the Fallout Wiki, 2.x data)

### A1. Full weapon list (damage / avg / sell value / rarity)


**Unarmed**

| Weapon | Damage | Avg | Value | Rarity |
|---|---|---|---|---|
| Fist | 1 | 1 | 0 | none |

**Melee weapons**

| Weapon | Damage | Avg | Value | Rarity |
|---|---|---|---|---|
| Baseball bat | 5-15 | 10 | 100 | rare |
| Butcher knife | 8-18 | 13 | 100 | rare |
| Kitchen knife | 3-11 | 7 | 100 | rare |
| Pickaxe | 11-21 | 16 | 100 | rare |
| Pool cue | 0-8 | 4 | 100 | rare |
| Fire hydrant bat | 19-31 | 25 | 500 | legendary |
| Relentless raider sword | 16-28 | 22 | 500 | legendary |
| Rusty Ripper | 10-15 | 12.5 | 100 | rare |
| Ripper | 11-16 | 13.5 | 100 | rare |
| Enhanced Ripper | 12-17 | 14.5 | 100 | rare |
| Hardened Ripper | 13-18 | 15.5 | 100 | rare |
| Rusty surgical Ripper | 12 | 12 | 100 | rare |
| Surgical Ripper | 13-14 | 12.5 | 100 | rare |
| Enhanced surgical Ripper | 14-15 | 14.5 | 100 | rare |
| Hardened surgical Ripper | 16-17 | 16.5 | 100 | rare |
| Rusty power fist | 12-17 | 14.5 | 500 | legendary |
| Power fist | 13-18 | 15.5 | 500 | legendary |
| Enhanced power fist | 14-19 | 16.5 | 500 | legendary |
| Hardened power fist | 15-20 | 17.5 | 500 | legendary |
| Ed's custom power fist | 16-22 | 19 | 500 | legendary |
| Grognak's axe | 18-26 | 22 | 500 | legendary |
| Super sledge | 18-32 | 25 | 100 | legendary |
| Ultracite sword | 3-6 | 4.5 | 10 | common |

**Guns - Pistols**

| Weapon | Damage | Avg | Value | Rarity |
|---|---|---|---|---|
| Rusty .32 pistol | 1 | 1 | 10 | common |
| .32 pistol | 1-2 | 1.5 | 10 | common |
| Enhanced .32 pistol | 1-3 | 2 | 10 | common |
| Hardened .32 pistol | 1-4 | 2.5 | 100 | rare |
| Armor piercing .32 pistol | 1-5 | 3 | 100 | rare |
| Wild Bill's Sidearm | 1-6 | 3.5 | 500 | legendary |
| Rusty 10mm pistol | 2 | 2 | 10 | common |
| 10mm pistol | 2-3 | 2.5 | 10 | common |
| Enhanced 10mm pistol | 2-4 | 3 | 10 | common |
| Hardened 10mm pistol | 2-5 | 3.5 | 100 | rare |
| Armor piercing 10mm pistol | 2-6 | 4 | 100 | rare |
| Lone Wanderer | 2-7 | 4.5 | 500 | legendary |
| Rusty scoped .44 | 3 | 3 | 10 | common |
| Scoped .44 | 3-4 | 3.5 | 10 | common |
| Enhanced scoped .44 | 3-5 | 4 | 10 | common |
| Hardened scoped .44 | 3-6 | 4.5 | 100 | rare |
| Armor piercing scoped .44 | 3-7 | 5 | 100 | rare |
| Blackhawk | 3-8 | 5.5 | 500 | legendary |
| Rusty Gauss pistol | 12 | 12 | 100 | rare |
| Focused Gauss pistol | 13 | 13 | 100 | rare |
| Enhanced Gauss pistol | 14 | 14 | 100 | rare |
| Hardened Gauss pistol | 15 | 15 | 100 | rare |
| Pipe pistol | 1-3 | 2 | 10 | common |
| Hair trigger pipe pistol | 2-5 | 3.5 | 10 | common |
| Heavy pipe pistol | 3-7 | 5 | 10 | common |
| Scoped pipe pistol | 4-9 | 6.5 | 100 | rare |
| Auto pipe pistol | 5-11 | 8 | 100 | rare |
| Little Brother | 6-13 | 9.5 | 500 | legendary |
| Rusty tranq gun | 1-10 | 5.5 | 100 | rare |
| Tranq gun | 2-12 | 7 | 100 | rare |
| Enhanced tranq gun | 4-12 | 8 | 100 | rare |
| Hardened tranq gun | 6-12 | 9 | 100 | rare |
| Rusty T60 pistol | 9-13 | 11 | 100 | rare |
| T60 pistol | 10-14 | 12 | 100 | rare |
| Enhanced T60 pistol | 11-14 | 12.5 | 100 | rare |
| Hardened T60 pistol | 12-15 | 13.5 | 100 | rare |
| Armor piercing T60 pistol | 13-16 | 14.5 | 100 | rare |
| Kellogg's pistol | 15-27 | 21 | 500 | legendary |

**Guns - Rifles**

| Weapon | Damage | Avg | Value | Rarity |
|---|---|---|---|---|
| Rusty assault rifle | 8 | 8 | 100 | rare |
| Assault rifle | 8-9 | 8.5 | 100 | rare |
| Enhanced assault rifle | 8-10 | 9 | 100 | rare |
| Hardened assault rifle | 8-11 | 9.5 | 100 | rare |
| Armor piercing assault rifle | 8-12 | 10 | 100 | rare |
| Infiltrator | 8-13 | 10.5 | 500 | legendary |
| Rusty BB gun | 0-1 | 0.5 | 10 | common |
| BB gun | 0-2 | 1 | 10 | common |
| Enhanced BB gun | 0-3 | 1.5 | 10 | common |
| Hardened BB gun | 0-4 | 2 | 100 | rare |
| Armor piercing BB gun | 0-5 | 2.5 | 100 | rare |
| Red Rocket | 0-6 | 3 | 500 | legendary |
| Rusty BOS assault rifle | 15 | 15 | 100 | rare |
| BOS assault rifle | 16 | 16 | 100 | rare |
| Enhanced BOS assault rifle | 16-18 | 17 | 100 | rare |
| Hardened BOS assault rifle | 17-19 | 18 | 100 | rare |
| Armor piercing BOS assault rifle | 19-21 | 20 | 100 | rare |
| Rusty Gauss rifle | 16 | 16 | 100 | rare |
| Gauss rifle | 16-17 | 16.5 | 100 | rare |
| Enhanced Gauss rifle | 16-18 | 17 | 500 | legendary |
| Hardened Gauss rifle | 16-19 | 17.5 | 500 | legendary |
| Accelerated Gauss rifle | 16-20 | 18 | 500 | legendary |
| Magnetron 4000 | 16-21 | 18.5 | 500 | legendary |
| Henrietta | 13-16 | 14.5 | 500 | legendary |
| Rusty hunting rifle | 5 | 5 | 10 | common |
| Hunting rifle | 5-6 | 5.5 | 10 | common |
| Enhanced hunting rifle | 5-7 | 6 | 10 | common |
| Hardened hunting rifle | 5-8 | 6.5 | 100 | rare |
| Armor piercing hunting rifle | 5-9 | 7 | 100 | rare |
| Ol' Painless | 5-10 | 7.5 | 500 | legendary |
| Rusty lever-action rifle | 4 | 4 | 10 | common |
| Lever-action rifle | 4-5 | 4.5 | 10 | common |
| Enhanced lever-action rifle | 4-6 | 5 | 10 | common |
| Hardened lever-action rifle | 4-7 | 5.5 | 100 | rare |
| Armor piercing lever-action rifle | 4-8 | 6 | 100 | rare |
| Lincoln's repeater | 4-9 | 6.5 | 500 | legendary |
| Mare's Leg | 9-13 | 11 | 500 | legendary |
| Pipe rifle | 5-7 | 6 | 10 | common |
| Calibrated pipe rifle | 6-9 | 7.5 | 100 | rare |
| Long pipe rifle | 7-11 | 9 | 100 | rare |
| Night-vision pipe rifle | 8-13 | 10.5 | 100 | rare |
| Bayoneted pipe rifle | 9-15 | 12 | 100 | rare |
| Big Sister | 10-17 | 13.5 | 500 | legendary |
| Rusty railway rifle | 14 | 14 | 100 | rare |
| Railway rifle | 14-15 | 14.5 | 100 | rare |
| Enhanced railway rifle | 14-16 | 15 | 100 | rare |
| Hardened railway rifle | 14-17 | 15.5 | 500 | legendary |
| Accelerated railway rifle | 14-18 | 16 | 500 | legendary |
| Railmaster | 14-19 | 16.5 | 500 | legendary |
| Rusty sniper rifle | 10 | 10 | 100 | rare |
| Sniper rifle | 10-11 | 10.5 | 100 | rare |
| Enhanced sniper rifle | 10-12 | 11 | 100 | rare |
| Hardened sniper rifle | 10-13 | 11.5 | 100 | rare |
| Armor piercing sniper rifle | 10-14 | 12 | 100 | rare |
| Victory rifle | 10-15 | 12.5 | 500 | legendary |
| Radium rifle | 18-22 | 20 | 500 | legendary |

**Guns - Shotguns**

| Weapon | Damage | Avg | Value | Rarity |
|---|---|---|---|---|
| Rusty combat shotgun | 13 | 13 | 100 | rare |
| Combat shotgun | 13-14 | 13.5 | 100 | rare |
| Enhanced combat shotgun | 13-15 | 14 | 100 | rare |
| Hardened combat shotgun | 13-16 | 14.5 | 100 | rare |
| Double-barrel combat shotgun | 13-17 | 15 | 500 | legendary |
| Charon's shotgun | 13-18 | 15.5 | 500 | legendary |
| Mountain Momma | 14-19 | 16.5 | 500 | legendary |
| Rusty sawed-off shotgun | 6 | 6 | 10 | common |
| Sawed-off shotgun | 6-7 | 6.5 | 10 | common |
| Enhanced sawed-off shotgun | 6-8 | 7 | 10 | common |
| Hardened sawed-off shotgun | 6-9 | 7.5 | 100 | rare |
| Double-barrel sawed-off shotgun | 6-10 | 8 | 100 | rare |
| Kneecapper | 6-11 | 8.5 | 500 | legendary |
| Rusty shotgun | 9 | 9 | 100 | rare |
| Shotgun | 9-10 | 9.5 | 100 | rare |
| Enhanced shotgun | 9-11 | 10 | 100 | rare |
| Hardened shotgun | 9-12 | 10.5 | 100 | rare |
| Double-barrel shotgun | 9-13 | 11 | 100 | rare |
| Farmer's Daughter | 9-14 | 11.5 | 500 | legendary |
| Ghoul revolver | 8-12 | 10 | 500 | legendary |

**Energy weapons - Pistols**

| Weapon | Damage | Avg | Value | Rarity |
|---|---|---|---|---|
| Rusty alien blaster | 18 | 18 | 500 | legendary |
| Alien blaster | 18-19 | 18.5 | 500 | legendary |
| Tuned alien blaster | 18-20 | 19 | 500 | legendary |
| Focused alien blaster | 18-21 | 19.5 | 500 | legendary |
| Amplified alien blaster | 18-22 | 20 | 500 | legendary |
| Destabilizer | 18-23 | 20.5 | 500 | legendary |
| Institute pistol | 9-11 | 10 | 100 | rare |
| Incendiary Institute pistol | 10-13 | 11.5 | 100 | rare |
| Improved Institute pistol | 11-15 | 13 | 100 | rare |
| Scoped Institute pistol | 12-17 | 14.5 | 100 | rare |
| Scattered Institute pistol | 13-19 | 16 | 500 | legendary |
| Apotheosis | 14-21 | 17.5 | 500 | legendary |
| Rusty laser pistol | 7 | 7 | 10 | common |
| Laser pistol | 7-8 | 7.5 | 100 | rare |
| Tuned laser pistol | 7-9 | 8 | 100 | rare |
| Focused laser pistol | 7-10 | 8.5 | 100 | rare |
| Amplified laser pistol | 7-11 | 9 | 100 | rare |
| Smuggler's End | 7-12 | 9.5 | 500 | legendary |
| Rusty plasma pistol | 11 | 11 | 100 | rare |
| Plasma pistol | 11-12 | 11.5 | 100 | rare |
| Tuned plasma pistol | 11-13 | 12 | 100 | rare |
| Focused plasma pistol | 11-14 | 12.5 | 100 | rare |
| Amplified plasma pistol | 11-15 | 13 | 500 | legendary |
| MPXL Novasurge | 11-16 | 13.5 | 500 | legendary |
| Rusty Assaultron head | 7-11 | 9 | 100 | rare |
| Assaultron head | 8-12 | 10 | 100 | rare |
| Enhanced Assaultron head | 9-13 | 11 | 100 | rare |
| Hardened Assaultron head | 10-14 | 12 | 100 | rare |

**Energy weapons - Rifles**

| Weapon | Damage | Avg | Value | Rarity |
|---|---|---|---|---|
| Laser musket | 10-13 | 11.5 | 500 | legendary |
| Rusty alien disintegrator | 16 | 16 | 500 | legendary |
| Alien disintegrator | 17 | 17 | 500 | legendary |
| Enhanced alien disintegrator | 18 | 18 | 500 | legendary |
| Hardened alien disintegrator | 19 | 19 | 500 | legendary |
| Institute rifle | 14-16 | 15 | 100 | rare |
| Excited Institute rifle | 15-18 | 16.5 | 100 | rare |
| Long Institute rifle | 16-20 | 18 | 500 | legendary |
| Night-vision Institute rifle | 17-22 | 19.5 | 500 | legendary |
| Targeting Institute rifle | 18-24 | 21 | 500 | legendary |
| Virgil's rifle | 19-26 | 22.5 | 500 | legendary |
| Rusty laser rifle | 12 | 12 | 100 | rare |
| Laser rifle | 12-13 | 12.5 | 100 | rare |
| Tuned laser rifle | 12-14 | 13 | 100 | rare |
| Focused laser rifle | 12-15 | 13.5 | 100 | rare |
| Amplified laser rifle | 12-16 | 14 | 500 | legendary |
| Wazer Wifle | 12-17 | 14.5 | 500 | legendary |
| Rusty plasma rifle | 17 | 17 | 100 | rare |
| Plasma rifle | 17-18 | 17.5 | 100 | rare |
| Tuned plasma rifle | 17-19 | 18 | 500 | legendary |
| Focused plasma rifle | 17-20 | 18.5 | 500 | legendary |
| Amplified plasma rifle | 17-22 | 19.5 | 500 | legendary |
| Mean Green Monster | 17-23 | 20 | 500 | legendary |
| Plasma thrower | 17-19 | 18 | 500 | legendary |
| Agitated plasma thrower | 18-21 | 19.5 | 500 | legendary |
| Tactical plasma thrower | 19-23 | 21 | 500 | legendary |
| Boosted plasma thrower | 20-25 | 22.5 | 500 | legendary |
| Overcharged plasma thrower | 21-27 | 24 | 500 | legendary |
| Dragon's Maw | 22-29 | 25.5 | 500 | legendary |
| Rusty pulse rifle | 17-18 | 17.5 | 500 | legendary |
| Pulse rifle | 18-19 | 18.5 | 500 | legendary |
| Enhanced pulse rifle | 19-20 | 19.5 | 500 | legendary |
| Hardened pulse rifle | 20-21 | 20.5 | 500 | legendary |
| Cryolator | 20-24 | 22 | 500 | legendary |
| Ultracite plasma rifle | 6-8 | 7 | 10 | common |
| Optimized Ultracite plasma rifle | 16-18 | 17 | 500 | legendary |

**Heavy weapons**

| Weapon | Damage | Avg | Value | Rarity |
|---|---|---|---|---|
| Rusty Fat Man | 22 | 22 | 500 | legendary |
| Fat Man | 22-23 | 22.5 | 500 | legendary |
| Enhanced Fat Man | 22-24 | 23 | 500 | legendary |
| Hardened Fat Man | 22-25 | 23.5 | 500 | legendary |
| Guided Fat Man | 22-26 | 24 | 500 | legendary |
| MIRV | 22-27 | 24.5 | 500 | legendary |
| Rusty flamer | 15 | 15 | 100 | rare |
| Flamer | 15-16 | 15.5 | 100 | rare |
| Enhanced flamer | 15-17 | 16 | 100 | rare |
| Hardened flamer | 15-18 | 16.5 | 100 | rare |
| Pressurized flamer | 15-19 | 17 | 100 | rare |
| Burnmaster | 15-20 | 17.5 | 500 | legendary |
| Rusty Gatling laser | 21 | 21 | 500 | legendary |
| Gatling laser | 21-22 | 21.5 | 500 | legendary |
| Tuned Gatling laser | 21-23 | 22 | 500 | legendary |
| Focused Gatling laser | 21-24 | 22.5 | 500 | legendary |
| Amplified Gatling laser | 21-25 | 23 | 500 | legendary |
| Vengeance | 21-26 | 23.5 | 500 | legendary |
| Junk Jet | 13-15 | 14 | 100 | rare |
| Recoil compensated Junk Jet | 14-17 | 15.5 | 100 | rare |
| Tactical Junk Jet | 15-19 | 17 | 100 | rare |
| Electrified Junk Jet | 16-21 | 18.5 | 500 | legendary |
| Flaming Junk Jet | 17-23 | 20 | 500 | legendary |
| Technician's Revenge | 18-25 | 21.5 | 500 | legendary |
| Rusty minigun | 19 | 19 | 500 | legendary |
| Minigun | 19-20 | 19.5 | 500 | legendary |
| Enhanced minigun | 19-21 | 20 | 500 | legendary |
| Hardened minigun | 19-22 | 20.5 | 500 | legendary |
| Armor piercing minigun | 19-23 | 21 | 500 | legendary |
| Lead Belcher | 19-24 | 21.5 | 500 | legendary |
| Rusty missile launcher | 20 | 20 | 500 | legendary |
| Missile launcher | 20-21 | 20.5 | 500 | legendary |
| Enhanced missile launcher | 20-22 | 21 | 500 | legendary |
| Hardened missile launcher | 20-23 | 21.5 | 500 | legendary |
| Guided missile launcher | 20-24 | 22 | 500 | legendary |
| Miss Launcher | 20-25 | 22.5 | 500 | legendary |
| Rusty plasma caster | 16-20 | 18 | 500 | legendary |
| Plasma caster | 17-21 | 19 | 500 | legendary |
| Enhanced plasma caster | 18-22 | 20 | 500 | legendary |
| Hardened plasma caster | 19-23 | 21 | 500 | legendary |
| Rusty .50 cal machine gun | 10-12 | 11 | 100 | rare |
| .50 cal machine gun | 11-14 | 12.5 | 100 | rare |
| Enhanced .50 cal machine gun | 12-14 | 13 | 100 | rare |
| Hardened .50 cal machine gun | 13-15 | 14 | 100 | rare |
| Armor piercing .50 cal machine gun | 15-16 | 15.5 | 100 | rare |
| Ultracite Gatling laser | 7-12 | 9.5 | 100 | rare |
| Maximized Ultracite Gatling laser | 20-22 | 21 | 500 | legendary |

**Cut content**

| Weapon | Damage | Avg | Value | Rarity |
|---|---|---|---|---|
| Amata's pistol | 2—5 | 3.5 | 5 | common |

### A2. Full outfit list (SPECIAL bonus)


**Tiered outfits**

| Outfit (legendary dweller) | Rarity | Bonus | Total / Sex / Craftable |
|---|---|---|---|
| Armored vault suit | common | P+3 | 3  craftable |
| Sturdy vault suit | rare | P+5 | 5  craftable |
| Heavy vault suit | legendary | P+7 | 7  craftable |
| Battle armor | common | S+2 E+1 | 3  craftable |
| Sturdy battle armor | rare | S+3 E+2 | 5  craftable |
| Heavy battle armor | legendary | S+4 E+3 | 7  craftable |
| Combat armor | common | S+2 A+1 | 3  craftable |
| Sturdy combat armor | rare | S+3 A+2 | 5  craftable |
| Heavy combat armor | legendary | S+4 A+3 | 7  craftable |
| Formal wear | common | L+3 | 3  craftable |
| Fancy formal wear | rare | L+5 | 5  craftable |
| Lucky formal wear | legendary | L+7 | 7  craftable |
| Handyman jumpsuit | common | A+3 | 3  craftable |
| Advanced jumpsuit | rare | A+5 | 5  craftable |
| Expert jumpsuit | legendary | A+7 | 7  craftable |
| Lab coat | common | I+3 | 3  craftable |
| Advanced lab coat | rare | I+5 | 5  craftable |
| Expert lab coat | legendary | I+7 | 7  craftable |
| Leather armor | common | S+1 E+2 | 3  craftable |
| Sturdy leather armor | rare | S+2 E+3 | 5  craftable |
| Heavy leather armor | legendary | S+3 E+4 | 7  craftable |
| Merc gear | common | P+1 A+1 L+1 | 3  craftable |
| Sturdy merc gear | rare | P+1 A+2 L+2 | 5  craftable |
| Heavy merc gear | legendary | P+2 A+3 L+2 | 7  craftable |
| Military fatigues | common | S+3 | 3  craftable |
| Officer fatigues | rare | S+5 | 5  craftable |
| Commander fatigues | legendary | S+7 | 7  craftable |
| Nightwear | common | C+3 | 3  craftable |
| Naughty nightwear | rare | C+5 | 5  craftable |
| Lucky nightwear | legendary | C+7 | 7  craftable |
| Junior officer uniform | common | C+1 I+2 | 3  craftable |
| Officer uniform | rare | C+2 I+3 | 5  craftable |
| Commander uniform | legendary | C+3 I+4 | 7  craftable |
| Radiation suit | common | P+1 E+2 | 3  craftable |
| Advanced radiation suit | rare | P+2 E+3 | 5  craftable |
| Expert radiation suit | legendary | P+3 E+4 | 7  craftable |
| Raider armor | common | P+1 A+2 | 3  craftable |
| Sturdy raider armor | rare | P+2 A+3 | 5  craftable |
| Heavy raider armor | legendary | P+3 A+4 | 7  craftable |
| Initiate robe | common | C+2 A+1 | 3  craftable |
| Scribe robe | rare | C+3 A+2 | 5  craftable |
| Wasteland gear | common | E+3 | 3  craftable |
| Sturdy wasteland gear | rare | E+5 | 5  craftable |
| Heavy wasteland gear | legendary | E+7 | 7  craftable |
| Wasteland medic | common | P+2 L+1 | 3  craftable |
| Wasteland doctor | rare | P+3 L+2 | 5  craftable |
| Wasteland surgeon | legendary | P+4 L+3 | 7  craftable |
| Treasure hunter gear | common | S+2 P+1 | 3  craftable |
| Bounty hunter gear | rare | S+3 P+2 | 5  craftable |
| Mutant hunter gear | legendary | S+4 P+3 | 7  craftable |
| Flight suit | common | E+1 A+2 | 3  craftable |
| Advanced flight suit | rare | E+2 A+3 | 5  craftable |
| Expert flight suit | legendary | E+3 A+4 | 7  craftable |
| BoS uniform | common | P+2 C+1 | 3  craftable |
| Advanced BoS uniform | rare | P+3 C+2 | 5  craftable |
| Expert BoS uniform | legendary | P+4 C+3 | 7  craftable |
| Sturdy metal armor | rare | S+3 L+2 | 5  craftable |
| Heavy metal armor | legendary | S+4 L+3 | 7  craftable |
| Advanced Institute jumper | rare | I+3 A+2 | 5  craftable |
| Expert Institute jumper | legendary | I+4 A+3 | 7  craftable |

**Common outfits**

| Outfit (legendary dweller) | Rarity | Bonus | Total / Sex / Craftable |
|---|---|---|---|
| Mechanic jumpsuit | common | S+1 C+1 | 2 M craftable |
| RobCo factory uniform | common | E+2 L+2 | 4  not craftable |
| Polka dot sundress | common | S+1 I+1 | 2 F craftable |
| Pre-War suburbanite | common | P+1 I+1 | 2 M craftable |
| Rural schoolmarm | common | P+1 E+1 | 2 F craftable |
| Spring casualwear | common | E+1 A+1 | 2 M craftable |
| Vault socialite | common | C+1 A+1 | 2 F craftable |
| Accountant outfit | common | P+4 | 4 M not craftable |
| Agent provocateur | common | I+4 | 4 F not craftable |
| Bespoke attire | common | E+4 | 4 M not craftable |
| Business suit | common | C+4 | 4 M not craftable |
| Country girl | common | S+4 | 4 F not craftable |
| Waitress uniform | common | A+4 | 4 F not craftable |

**Rare outfits**

| Outfit (legendary dweller) | Rarity | Bonus | Total / Sex / Craftable |
|---|---|---|---|
| BOS casual | rare | E+2 A+2 | 4  craftable |
| NCR Ranger outfit | rare | P+4 C+2 | 6  craftable |
| RobCo R&D suit | rare | E+2 I+4 | 6  not craftable |
| Robot armor | rare | S+2 E+2 L+2 | 6  craftable |
| Bowling shirt | rare | P+6 | 6 M not craftable |
| Clergy outfit | rare | C+4 L+1 | 5 M craftable |
| Swing dress | rare | A+6 | 6 F not craftable |
| Comedian outfit | rare | P+2 C+2 L+1 | 5 M craftable |
| Doo-wop singer | rare | S+1 C+1 A+1 L+1 | 4 F craftable |
| Drag racer | rare | S+1 E+1 A+1 L+1 | 4 M craftable |
| Post-War Casanova | rare | P+1 C+1 I+1 L+1 | 4 M craftable |
| Soda fountain dress | rare | P+1 E+1 I+1 L+1 | 4 F craftable |
| Elf outfit | rare | I+3 L+2 | 5  not craftable |
| Enclave security outfit | rare | S+2 E+2 | 4  craftable |
| Engineer outfit | rare | E+2 I+2 L+1 | 5 F craftable |
| Ghost costume | rare | E+2 A+3 | 5  not craftable |
| Greaser outfit | rare | C+2 A+2 L+1 | 5 M craftable |
| Horror fan outfit | rare | E+4 L+1 | 5 M craftable |
| Knight armor | rare | S+2 P+2 L+1 | 5 M craftable |
| Librarian outfit | rare | I+4 L+1 | 5 F craftable |
| Mayor outfit | rare | C+2 I+2 L+1 | 5 M craftable |
| Medieval ruler outfit | rare | P+2 C+2 L+1 | 5 M craftable |
| Motorcycle jacket | rare | S+6 | 6  not craftable |
| Movie fan outfit | rare | P+4 L+1 | 5 F craftable |
| Ninja outfit | rare | A+4 L+1 | 5 M craftable |
| Nobility outfit | rare | E+2 I+2 L+1 | 5 M craftable |
| Pilgrim outfit | rare | C+3 I+2 | 5  not craftable |
| Professor outfit | rare | I+4 L+1 | 5 M craftable |
| Republic robes | rare | C+4 L+1 | 5 F craftable |
| Santa suit | rare | P+3 C+2 | 5  not craftable |
| Sci-fi fan outfit | rare | I+2 A+2 L+1 | 5 M craftable |
| Skeleton costume | rare | S+2 L+3 | 5  not craftable |
| Soldier uniform | rare | S+2 E+2 L+1 | 5 F craftable |
| Sports fan outfit | rare | S+4 L+1 | 5 M craftable |
| Surgeon outfit | rare | P+2 A+2 L+1 | 5 F craftable |
| Survivor armor | rare | S+2 A+2 L+1 | 5 M craftable |
| Wrestler outfit | rare | S+2 E+2 L+1 | 5 M craftable |
| Baseball uniform | rare | A+4 L+1 | 5  craftable |
| Lifeguard outfit | rare | P+4 L+1 | 5  craftable |
| Swimsuit | rare | E+2 C+2 L+1 | 5  craftable |
| Vault 33 suit | rare | P+3 L+2 | 5  craftable |
| Ma June jacket | rare | P+2 L+2 | 4  craftable |
| Sleazy suit | rare | C+2 I+2 | 4  craftable |
| Prewar cowboy costume | rare | C+2 A+2 | 4  craftable |
| Wedding dress | rare | C+2 L+2 | 4  craftable |
| Action wedding dress | rare | A+2 L+2 | 4  craftable |
| Vault security outfit | rare | E+2 L+2 | 4  craftable |

**Legendary outfits**

| Outfit (legendary dweller) | Rarity | Bonus | Total / Sex / Craftable |
|---|---|---|---|
| Pioneer overseer suit | legendary | P+2 E+3 C+4 I+5 | 14  craftable |
| Mojave wasteland survivor (Lucy MacLean) | legendary | P+1 E+5 L+2 | 8  not craftable |
| Abraham's relaxedwear (Abraham Washington) | legendary | E+1 I+2 A+2 L+2 | 7 M craftable |
| Tattered longcoat (Old Longfellow) | legendary | S+2 E+2 C+2 L+2 | 8 M not craftable |
| Autumn's uniform (Augustus Autumn) | legendary | S+2 P+2 E+2 C+1 | 7 M craftable |
| Bittercup's outfit (Bittercup) | legendary | S+2 P+2 E+2 C+1 | 7 F craftable |
| Confessor Cromwell's rags (Confessor Cromwell) | legendary | P+2 E+2 I+1 L+2 | 7 M craftable |
| Elder robe (Elder Lyons) | legendary | C+4 A+3 | 7  craftable |
| Eulogy Jones' suit (Eulogy Jones) | legendary | P+2 C+2 I+1 L+2 | 7 M craftable |
| Heavy synth armor | legendary | E+4 I+3 | 7  craftable |
| Incognito leisurewear | legendary | C+2 I+2 A+2 L+2 | 8  craftable |
| Lucy's vault suit (Lucy MacLean) | legendary | P+3 E+2 L+3 | 8  craftable |
| Moldaver's armor | legendary | S+2 P+2 E+4 L+4 | 12  craftable |
| Minuteman uniform (Preston Garvey) | legendary | S+2 P+2 I+2 A+2 | 8 M craftable |
| Piper's outfit (Piper) | legendary | P+2 E+2 A+2 L+2 | 8 F craftable |
| Scribe Rothchild's robe (Scribe Rothchild) | legendary | P+2 E+1 C+2 I+2 | 7 M craftable |
| Sheriff's duster (Lucas Simms) | legendary | P+2 E+5 | 7 M craftable |
| Sleek suit (Cooper Howard) | legendary | C+2 I+2 A+4 L+4 | 12  craftable |
| Tenpenny's suit (Allistair Tenpenny) | legendary | P+2 C+2 I+2 L+1 | 7 M craftable |
| Three Dog's outfit (Three Dog) | legendary | P+2 C+5 | 7 M craftable |
| Tunnel Snakes' outfit (Butch) | legendary | P+2 E+1 C+2 A+2 | 7 M craftable |
| Rackie Jobinson's Jersey | legendary | S+4 P+4 C+4 A+4 | 16  not craftable |
| Detective outfit | legendary | P+4 E+4 I+4 L+4 | 16 M not craftable |
| Original Santa suit | legendary | P+4 E+3 C+4 | 11  not craftable |
| Death's jacket | legendary | P+4 E+4 A+4 L+4 | 16  not craftable |
| Famine's vestment | legendary | S+4 E+4 I+4 L+4 | 16  not craftable |
| Pestilence's plating | legendary | E+4 C+4 I+4 A+4 | 16  not craftable |
| Alien space suit | legendary | P+2 I+4 A+2 | 8  not craftable |
| Alien space suit (variant) | legendary | E+1 I+2 A+2 L+2 | 7  not craftable |
| The Ghoul's coat | legendary | P+2 E+2 C+2 A+2 | 8  craftable |
| Wilzig's travelwear | legendary | P+4 E+2 A+2 L+4 | 12  craftable |
| Lucy's yellow dress | legendary | C+6 A+4 L+2 | 12 F craftable |
| Legate armor | legendary | S+4 E+6 C+4 | 14 M craftable |
| Mr. House's suit | legendary | C+4 I+2 L+2 | 8  craftable |
| Maximus's jacket | legendary | S+2 C+2 A+4 L+4 | 12  craftable |
| Brotherhood of Steel paladin jacket | legendary | S+2 P+4 C+2 | 8  craftable |
| Jailhouse Rocker | legendary | A+4 L+4 | +8  craftable |
| BoS paladin jacket | legendary |  |  |
| Valentine's trench coat | legendary | P+6 I+4 A+4 | 14 M not craftable |
| Kellogg's armor | legendary | S+2 E+4 A+6 | 12 M not craftable |
| Courser uniform | legendary | P+5 E+5 | 10  not craftable |

**Power armor**

| Outfit (legendary dweller) | Rarity | Bonus | Total / Sex / Craftable |
|---|---|---|---|
| T-45a power armor | legendary | S+2 P+3 | 5  craftable |
| T-45d power armor | legendary | S+2 P+4 | 6  craftable |
| T-45f power armor | legendary | S+2 P+5 | 7  craftable |
| T-51a power armor | legendary | S+3 P+1 | 4  craftable |
| T-51d power armor | legendary | S+3 P+2 | 5  craftable |
| T-51f power armor | legendary | S+4 P+3 | 7  craftable |
| T-60a power armor | legendary | S+2 E+3 | 5  craftable |
| T-60d power armor | legendary | S+2 E+4 | 6  craftable |
| T-60f power armor | legendary | S+1 P+1 E+5 | 7  craftable |
| War's armor | legendary | S+4 P+4 E+4 C+4 | 16  not craftable |
| Scarred power armor | legendary | S+4 P+2 E+4 C+2 | 12  craftable |
| X-01 Mk I power armor | legendary | S+3 P+1 E+1 | 5  craftable |
| X-01 Mk IV power armor | legendary | S+4 P+1 E+1 | 6  craftable |
| X-01 Mk VI power armor | legendary | S+5 P+1 E+1 | 7  craftable |
| NCR power armor | legendary | S+1 P+2 E+4 C+2 | 9  not craftable |
| Hank's power armor | legendary | S+2 E+3 C+2 | 7  not craftable |
| Enclave power armor | legendary | S+6 E+6 I+2 | 14  not craftable |
| Paladin Danse's power armor | legendary | S+5 P+1 E+1 | 7 M not craftable |

**Cut content**

| Outfit (legendary dweller) | Rarity | Bonus | Total / Sex / Craftable |
|---|---|---|---|
| Cross' power armor | common | S+5 P+2 E+2 | 9 F not craftable |
| Lyon's Pride armor | common | S+4 P+3 L+1 | 8 F not craftable |
| Enclave power armor | legendary | S+6 E+6 I+2 | 14  not craftable |
| Jericho's leather armor | common | S+2 E+6 | 8 M not craftable |
| Elder Lyon's robe | common | P+2 E+1 C+6 I+2 | 11 M not craftable |
| Harkness' security uniform | common | P+5 A+3 L+2 | 10 M not craftable |
| Moira's RobCo jumpsuit | common | P+3 E+1 I+2 | 6 F not craftable |
| Mr. Burke's businesswear | common | C+4 L+4 | 8 M not craftable |
| Amata's jumpsuit | common | C+2 I+2 L+2 | 6 F not craftable |
| Dad's lab uniform | common | I+5 L+2 | 7 M not craftable |
| Doctor Li's outfit | common | I+3 L+2 | 5 F not craftable |

### A3. Weapon crafting recipes (stat, junk, caps, time at total room stat 10 / 60 / 102)

| Tier | Weapon | Stat | Dmg | Avg | Junk | Caps | Time (10 ; 60 ; 102) | Craft-only |
|---|---|---|---|---|---|---|---|---|
| Common | .32 pistol | A | 1‑2 | 1.5 | Desk Fan x1 | 5 | 10 = 25m 40s ; 60 = 10m 9s ; 102 = 2m 52s | No |
| Common | 10mm pistol | A | 2‑3 | 2.5 | Desk Fan x1 | 5 | 10 = 51m 22s ; 60 = 20m 19s ; 102 = 2m 52s | No |
| Common | BB gun | P | 0‑2 | 1 | Toy Car x1 | 5 | 10 = 25m 40s ; 60 = 10m 9s ; 102 = 2m 52s | No |
| Common | Enhanced .32 pistol | A | 1‑3 | 2 | Desk Fan x1 | 5 | 10 = 51m 22s ; 60 = 20m 19s ; 102 = 2m 52s | No |
| Common | Enhanced 10mm pistol | A | 2‑4 | 3 | Desk Fan x1 | 5 | 10 = 51m 22s ; 60 = 20m 19s ; 102 = 2m 52s | No |
| Common | Enhanced BB gun | P | 0‑3 | 1.5 | Toy Car x1 | 5 | 10 = 25m ; 60 = 10m 9s ; 102 = 2m 52s | No |
| Common | Enhanced hunting rifle | P | 5‑7 | 6 | Duct Tape x1,  Toy Car x1 | 6 | 10 = 1h 42m 45s ; 60 = 40m 39s ; 102 = 2m 52s | No |
| Common | Enhanced lever-action rifle | P | 4‑6 | 5 | Duct Tape x1,  Toy Car x1 | 6 | 10 = 1h 42m 45s ; 60 = 40m 39s ; 102 = 2m 52s | No |
| Common | Enhanced sawed-off shotgun | E | 6‑8 | 7 | Desk Fan x1,  Duct Tape x1,  Toy Car x1 | 6 | 10 = 2h 21m 18s ; 60 = 55m 54s ; 102 = 2m 52s | No |
| Common | Enhanced scoped .44 | A | 3‑5 | 4 | Alarm Clock x1,  Magnifying Glass x1 | 5 | 10 = 1h 17m 4s ; 60 = 30m 29s ; 102 = 2m 52s | No |
| Common | Hair trigger pipe pistol | A | 2‑5 | 3.5 | Desk Fan x1,  Toy Car x1 | 5 | 10 = 1h 17m 4s ; 60 = 30m 29s ; 102 = 2m 52s | Yes |
| Common | Heavy pipe pistol | A | 3‑7 | 5 | Desk Fan x1,  Toy Car x1 | 6 | 10 = 1h 42m 45s ; 60 = 40m 39s ; 102 = 2m 52s | Yes |
| Common | Hunting rifle | P | 5‑6 | 5.5 | Duct Tape x1,  Toy Car x1 | 6 | 10 = 1h 42m 45s ; 60 = 40m 39s ; 102 = 2m 52s | No |
| Common | Lever-action rifle | P | 4‑5 | 4.5 | Duct Tape x1,  Toy Car x1 | 5 | 10 = 1h 17m 4s ; 60 = 30m 29s ; 102 = 2m 52s | No |
| Common | Pipe pistol | A | 1‑3 | 2 | Desk Fan x1 | 5 | 10 = 51m 22s ; 60 = 20m 19s ; 102 = 2m 52s | Yes |
| Common | Pipe rifle | P | 5‑7 | 6 | Desk Fan x1,  Toy Car x1 | 6 | 10 = 1h 42m 45s ; 60 = 40m 39s ; 102 = 2m 52s | Yes |
| Common | Rusty .32 pistol | A | 1 | 1 | Desk Fan x1 | 5 | 10 = 25m 40s ; 60 = 10m 9s ; 102 = 2m 52s | No |
| Common | Rusty 10mm pistol | A | 2 | 2 | Desk Fan x1 | 5 | 10 = 51m 22s ; 60 = 20m 19s ; 102 = 2m 52s | No |
| Common | Rusty BB gun | P | 0‑1 | 0.5 | Toy Car x1 | 5 | 10 = 25m 40s ; 60 = 10m 9s ; 102 = 2m 52s | No |
| Common | Rusty hunting rifle | P | 5 | 5 | Duct Tape x1,  Toy Car x1 | 6 | 10 = 1h 42m 45s ; 60 = 40m 39s ; 102 = 2m 52s | No |
| Common | Rusty laser pistol | A | 7 | 7 | Alarm Clock x1,  Desk Fan x1,  Magnifying Glass x1 | 6 | 10 = 2h 21m 18s ; 60 = 55m 54s ; 102 = 2m 52s | No |
| Common | Rusty lever-action rifle | P | 4 | 4 | Duct Tape x1,  Toy Car x1 | 5 | 10 = 1h 17m 4s ; 60 = 30m 29s ; 102 = 2m 52s | No |
| Common | Rusty sawed-off shotgun | E | 6 | 6 | Duct Tape x1,  Toy Car x1 | 6 | 10 = 1h 42m 45s ; 60 = 40m 39s ; 102 = 2m 52s | No |
| Common | Rusty scoped .44 | A | 3 | 3 | Magnifying Glass x1 | 5 | 10 = 51m 22s ; 60 = 20m 19s ; 102 = 2m 52s | No |
| Common | Sawed-off shotgun | E | 6‑7 | 6.5 | Desk Fan x1,  Duct Tape x1,  Toy Car x1 | 6 | 10 = 2h 21m 18s ; 60 = 55m 54s ; 102 = 2m 52s | No |
| Common | Scoped .44 | A | 3‑4 | 3.5 | Alarm Clock x1,  Magnifying Glass x1 | 5 | 10 = 1h 17m 4s ; 60 = 30m 29s ; 102 = 2m 52s | No |
| Rare | Rusty BOS assault rifle | P | 15 | 15 | Globe x3,  Magnifying Glass x3,  Shovel x3 | 350 | 10 = 9h 31m 43s ; 60 = 4h 22m 26s ; 102 = 2m 52s | No |
| Rare | Hardened BOS assault rifle | P | 17-19 | 18 | Globe x3,  Magnifying Glass x3,  Shovel x3 | 500 | 10 = 13h 48m 40s ; 60 = 6h 4m 5s ; 102 = 2m 52s | No |
| Rare | Enhanced BOS assault rifle | P | 16-18 | 17 | Globe x3,  Magnifying Glass x3,  Shovel x3 | 500 | 10 = 13h 48m 40s ; 60 = 6h 4m 5s ; 102 = 2m 52s | No |
| Rare | Armor piercing BOS assault rifle | P | 19-21 | 20 | Shovel x4,  Globe x3,  Magnifying Glass x3 | 500 | 10 = 12h 57m 17s ; 60 = 5h 43m 45s ; 102 = 2m 52s | No |
| Rare | BOS assault rifle | P | 16 | 16 | Magnifying Glass x5,  Shovel x3,  Globe x2 | 400 | 10 = 10h 23m 6s ; 60 = 4h 42m 46s ; 102 = 2m 52s | No |
| Rare | Rusty tranq gun | A | 1-10 | 5.5 | Magnifying Glass x2,  Shovel x2,  Duct Tape x1 | 200 | 10 = 5h 34m 0s ; 60 = 2h 12m 8s ; 102 = 2m 52s | No |
| Rare | Hardened tranq gun | A | 6-12 | 9 | Duct Tape x3,  Shovel x2,  Microscope x1 | 250 | 10 = 6h 25m 24s ; 60 = 2h 32m 28s ; 102 = 2m 52s | No |
| Rare | Enhanced tranq gun | A | 4-12 | 8 | Duct Tape x3,  Shovel x2,  Microscope x1 | 250 | 10 = 6h 25m 24s ; 60 = 2h 32m 28s ; 102 = 2m 52s | No |
| Rare | Tranq gun | A | 2-12 | 7 | Magnifying Glass x3,  Duct Tape x2,  Shovel x2 | 200 | 10 = 5h 59m 43s ; 60 = 2h 22m 18s ; 102 = 2m 52s | No |
| Rare | Rusty T60 pistol | A | 9-13 | 11 | Duct Tape x3,  Shovel x2,  Globe x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | No |
| Rare | Hardened T60 pistol | A | 12-15 | 13.5 | Shovel x4,  Toy Car x3,  Duct Tape x2 | 300 | 10 = 8h 33m 52s ; 60 = 3h 23m 17s ; 102 = 2m 52s | No |
| Rare | T60 pistol | A | 10-14 | 12 | Duct Tape x3,  Globe x2,  Shovel x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | No |
| Rare | Enhanced T60 pistol | A | 11-14 | 12.5 | Shovel x4,  Toy Car x3,  Duct Tape x2 | 300 | 10 = 8h 33m 52s ; 60 = 3h 23m 17s ; 102 = 2m 52s | No |
| Rare | Armor piercing T60 pistol | A | 13-16 | 14.5 | Duct Tape x3,  Shovel x3,  Globe x2 | 350 | 10 = 9h 31m 43s ; 60 = 4h 22m 26s ; 102 = 2m 52s | No |
| Rare | Enhanced Gauss pistol | A | 14 | 14 | Globe x3,  Magnifying Glass x3,  Camera x2 | 350 | 10 = 9h 31m 43s ; 60 = 4h 22m 26s ; 102 = 2m 52s | No |
| Rare | Focused Gauss pistol | A | 13 | 13 | Globe x4,  Alarm Clock x3,  Magnifying Glass x2 | 300 | 10 = 8h 33m 52s ; 60 = 3h 23m 17s ; 102 = 2m 52s | No |
| Rare | Hardened Gauss pistol | A | 15 | 15 | Globe x3,  Magnifying Glass x3,  Camera x2 | 350 | 10 = 9h 31m 43s ; 60 = 4h 22m 26s ; 102 = 2m 52s | No |
| Rare | Rusty Gauss pistol | A | 12 | 12 | Magnifying Glass x3,  Camera x2,  Globe x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | No |
| Rare | Assaultron head | A | 8-12 | 10 | Alarm Clock x3,  Globe x3,  Magnifying Glass x2 | 250 | 10 = 6h 51m 5s ; 60 = 2h 42m 37s ; 102 = 2m 52s | No |
| Rare | Enhanced Assaultron head | A | 9-13 | 11 | Magnifying Glass x3,  Camera x2,  Globe x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | No |
| Rare | Hardened Assaultron head | A | 10-14 | 12 | Magnifying Glass x3,  Camera x2,  Globe x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | No |
| Rare | Rusty Assaultron head | A | 7-11 | 9 | Magnifying Glass x3,  Globe x2,  Camera x1 | 250 | 10 = 6h 25m 24s ; 60 = 2h 32m 28s ; 102 = 2m 52s | No |
| Rare | Ripper | A | 11-16 | 13.5 | Shovel x2,  Alarm Clock x3,  Toy Car x2 | 300 | 10 = 8h 34m 26s ; 60 = 3h 26m 40s ; 102 = 2m 52s | No |
| Rare | Enhanced Ripper | A | 12-17 | 14.5 | Shovel x3,  Toy Car x3,  Camera x2 | 350 | 10 = 9h 32m 17s ; 60 = 4h 25m 48s  ; 102 = 2m 52s | No |
| Rare | Hardened Ripper | A | 13-18 | 15.5 | Toy Car x5,  Shovel x3,   Camera x2 | 400 | 10 = 10h 23m 44s ; 60 = 4h 46m 29s ; 102 = 2m 52s | No |
| Rare | Rusty Ripper | A | 10-15 | 12.5 | Shovel x4,   Alarm Clock x3,  Toy Car x2 | 300 | 10 = 8h 34m 44s ; 60 = 3h 26m 26s ; 102 = 2m 52s | No |
| Rare | Rusty surgical Ripper | I | 12 | 12 | Magnifying Glass x3,  Camera x2,  Shovel x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | No |
| Rare | Surgical Ripper | I | 13-14 | 13.5 | Shovel x4,  Alarm Clock x3,  Magnifying Glass x2 | 300 | 10 = 8h 33m 52s ; 60 = 3h 23m 17s  ; 102 = 2m 52s | No |
| Rare | Enhanced surgical Ripper | I | 14-15 | 14.5 | Magnifying Glass x3,  Shovel x3,   Camera x2 | 350 | 10 = 9h 31m 43s ; 60 = 4h 22m 26s  ; 102 = 2m 52s | No |
| Rare | Hardened surgical Ripper | I | 16-17 | 16.5 | Magnifying Glass x5,  Shovel x3,    Camera x2 | 400 | 10 = 10h 23m 6s ; 60 = 4h 42m 46s  ; 102 = 2m 52s | No |
| Rare | Hardened .50 cal machine gun | P | 13-15 | 14 | Shovel x3,  Toy Car x3,  Wonderglue x2 | 350 | 10 = 9h 31m 43s ; 60 = 4h 22m 26s  ; 102 = 2m 52s | No |
| Rare | Enhanced .50 cal machine gun | P | 12-14 | 13 | Shovel x4,  Duct Tape x3,  Toy Car x2 | 300 | 10 = 8h 33m 52s ; 60 = 3h 23m 17s ; 102 = 2m 52s | No |
| Rare | Rusty .50 cal machine gun | P | 10-12 | 11 | Toy Car x3,  Shovel x2,  Wonderglue x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | No |
| Rare | Armor piercing .50 cal machine gun | P | 15-16 | 15.5 | Toy Car x5,  Shovel x3,  Wonderglue x2 | 400 | 10 = 10h 23m 6s ; 60 = 4h 42m 46s ; 102 = 2m 52s | No |
| Rare | .50 cal machine gun | P | 11-14 | 12.5 | Shovel x4,  Duct Tape x3,  Toy Car x2 | 250 | 10 = 8h 33m 52s ; 60 = 3h 23m 17s ; 102 = 2m 52s | No |
| Rare | Amplified laser pistol | A | 7‑11 | 9 | Magnifying Glass x3,  Camera x2,  Shovel x1 | 250 | 10 = 6h 25m 24s ; 60 = 2h 32m 28s ; 102 = 2m 52s | No |
| Rare | Armor piercing .32 pistol | A | 1‑5 | 3 | Toy Car x2,  Duct Tape x1,  Shovel x1 | 150 | 10 = 4h 42m 37s ; 60 = 1h 51m 48s ; 102 = 2m 52s | No |
| Rare | Armor piercing 10mm pistol | A | 2‑6 | 4 | Duct Tape x3,  Desk Fan x2,  Shovel x1 | 200 | 10 = 5h 8m 18s ; 60 = 2h 1m 58s ; 102 = 2m 52s | No |
| Rare | Armor piercing assault rifle | A | 8‑12 | 10 | Toy Car x3,  Wonderglue x3,  Alarm Clock x2 | 250 | 10 = 6h 51m 5s ; 60 = 2h 42m 37s ; 102 = 2m 52s | No |
| Rare | Armor piercing BB gun | P | 0‑5 | 2.5 | Duct Tape x2,  Desk Fan x1,  Globe x1 | 150 | 10 = 4h 42m 37s ; 60 = 1h 51m 48s ; 102 = 2m 52s | No |
| Rare | Armor piercing hunting rifle | P | 5‑9 | 7 | Toy Car x3,  Desk Fan x2,  Wonderglue x2 | 200 | 10 = 5h 59m 43s ; 60 = 2h 22m 18s ; 102 = 2m 52s | No |
| Rare | Armor piercing lever-action rifle | P | 4‑8 | 6 | Toy Car x2,  Wonderglue x2,  Desk Fan x1 | 200 | 10 = 5h 34m 0s ; 60 = 2h 12m 8s ; 102 = 2m 52s | No |
| Rare | Armor piercing scoped .44 | A | 3‑7 | 5 | Alarm Clock x2,  Microscope x2,  Desk Fan x1 | 200 | 10 = 5h 34m 0s ; 60 = 2h 12m 8s ; 102 = 2m 52s | No |
| Rare | Armor piercing sniper rifle | P | 10‑14 | 12 | Magnifying Glass x3,  Camera x2,  Shovel x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | No |
| Rare | Assault rifle | A | 8‑9 | 8.5 | Alarm Clock x3,  Wonderglue x2,  Globe x1 | 250 | 10 = 6h 25m 24s ; 60 = 2h 32m 28s ; 102 = 2m 52s | No |
| Rare | Auto pipe pistol | A | 5‑11 | 8 | Duct Tape x3,  Shovel x2,  Globe x1 | 250 | 10 = 6h 25m 24s ; 60 = 2h 32m 28s ; 102 = 2m 52s | Yes |
| Rare | Baseball bat | S | 5‑15 | 10 | Duct Tape x3,  Globe x3,  Desk Fan x2 | 250 | 10 = 6h 51m 5s ; 60 = 2h 42m 37s ; 102 = 2m 52s | No |
| Rare | Bayoneted pipe rifle | P | 9‑15 | 12 | Duct Tape x3,  Globe x2,  Shovel x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | Yes |
| Rare | Butcher knife | L | 8‑18 | 13 | Shovel x4,  Duct Tape x3,  Magnifying Glass x2 | 300 | 10 = 8h 33m 52s ; 60 = 3h 23m 17s ; 102 = 2m 52s | No |
| Rare | Calibrated pipe rifle | P | 6‑9 | 7.5 | Toy Car x3,  Duct Tape x2,  Shovel x2 | 200 | 10 = 5h 59m 43s ; 60 = 2h 22m 18s ; 102 = 2m 52s | Yes |
| Rare | Combat shotgun | E | 13‑14 | 13.5 | Globe x4,  Duct Tape x3,  Desk Fan x2 | 300 | 10 = 8h 33m 52s ; 60 = 3h 23m 17s ; 102 = 2m 52s | No |
| Rare | Double-barrel sawed-off shotgun | E | 6‑10 | 8 | Desk Fan x3,  Globe x2,  Wonderglue x1 | 250 | 10 = 6h 25m 24s ; 60 = 2h 32m 28s ; 102 = 2m 52s | No |
| Rare | Double-barrel shotgun | E | 9‑13 | 11 | Desk Fan x3,  Globe x2,  Wonderglue x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | No |
| Rare | Enhanced assault rifle | A | 8‑10 | 9 | Alarm Clock x3,  Wonderglue x2,  Globe x1 | 250 | 10 = 6h 25m 24s ; 60 = 2h 32m 28s ; 102 = 2m 52s | No |
| Rare | Enhanced combat shotgun | E | 13‑15 | 14 | Desk Fan x3,  Globe x3,  Wonderglue x2 | 350 | 10 = 9h 31m 43s ; 60 = 4h 22m 26s ; 102 = 2m 52s | No |
| Rare | Enhanced flamer | S | 15‑17 | 16 | Alarm Clock x5,  Shovel x3,  Microscope x2 | 400 | 10 = 10h 23m 6s ; 60 = 4h 42m 46s ; 102 = 2m 52s | No |
| Rare | Enhanced railway rifle | P | 14‑16 | 15 | Toy Car x3,  Wonderglue x3,  Shovel x2 | 350 | 10 = 9h 31m 43s ; 60 = 4h 22m 26s ; 102 = 2m 52s | No |
| Rare | Enhanced shotgun | E | 9‑11 | 10 | Duct Tape x3,  Globe x3,  Desk Fan x2 | 250 | 10 = 6h 51m 5s ; 60 = 2h 42m 37s ; 102 = 2m 52s | No |
| Rare | Enhanced sniper rifle | P | 10‑12 | 11 | Magnifying Glass x3,  Camera x2,  Shovel x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | No |
| Rare | Excited Institute rifle | I | 15‑18 | 16.5 | Magnifying Glass x5,  Globe x3,  Camera x2 | 400 | 10 = 10h 23m 6s ; 60 = 4h 42m 46s ; 102 = 2m 52s | Yes |
| Rare | Flamer | S | 15‑16 | 15.5 | Alarm Clock x5,  Shovel x3,  Microscope x2 | 400 | 10 = 10h 23m 6s ; 60 = 4h 42m 46s ; 102 = 2m 52s | No |
| Rare | Focused laser pistol | A | 7‑10 | 8.5 | Magnifying Glass x3,  Camera x2,  Shovel x1 | 250 | 10 = 6h 25m 24s ; 60 = 2h 32m 28s ; 102 = 2m 52s | No |
| Rare | Focused laser rifle | P | 12‑15 | 13.5 | Camera x4,  Desk Fan x3,  Magnifying Glass x2 | 300 | 10 = 8h 33m 52s ; 60 = 3h 23m 17s ; 102 = 2m 52s | No |
| Rare | Focused plasma pistol | A | 11‑14 | 12.5 | Microscope x4,  Toy Car x3,  Alarm Clock x2 | 300 | 10 = 8h 33m 52s ; 60 = 3h 23m 17s ; 102 = 2m 52s | No |
| Rare | Gauss rifle | P | 16‑17 | 16.5 | Alarm Clock x5,  Microscope x3,  Shovel x2 | 400 | 10 = 10h 23m 6s ; 60 = 4h 42m 46s ; 102 = 2m 52s | No |
| Rare | Hardened .32 pistol | A | 1‑4 | 2.5 | Toy Car x2,  Duct Tape x1,  Shovel x1 | 150 | 10 = 4h 42m 37s ; 60 = 1h 51m 48s ; 102 = 2m 52s | No |
| Rare | Hardened 10mm pistol | A | 2‑5 | 3.5 | Duct Tape x3,  Desk Fan x2,  Shovel x1 | 200 | 10 = 5h 8m 18s ; 60 = 2h 1m 58s ; 102 = 2m 52s | No |
| Rare | Hardened assault rifle | A | 8‑11 | 9.5 | Toy Car x3,  Wonderglue x3,  Alarm Clock x2 | 250 | 10 = 6h 51m 5s ; 60 = 2h 42m 37s ; 102 = 2m 52s | No |
| Rare | Hardened BB gun | P | 0‑4 | 2 | Duct Tape x2,  Desk Fan x1,  Globe x1 | 150 | 10 = 4h 42m 37s ; 60 = 1h 51m 48s ; 102 = 2m 52s | No |
| Rare | Hardened combat shotgun | E | 13‑16 | 14.5 | Desk Fan x3,  Globe x3,  Wonderglue x2 | 350 | 10 = 9h 31m 43s ; 60 = 4h 22m 26s ; 102 = 2m 52s | No |
| Rare | Hardened flamer | S | 15‑18 | 16.5 | Alarm Clock x5,  Shovel x3,  Microscope x2 | 400 | 10 = 10h 23m 6s ; 60 = 4h 42m 46s ; 102 = 2m 52s | No |
| Rare | Hardened hunting rifle | P | 5‑8 | 6.5 | Toy Car x3,  Desk Fan x2,  Wonderglue x2 | 200 | 10 = 5h 59m 43s ; 60 = 2h 22m 18s ; 102 = 2m 52s | No |
| Rare | Hardened lever-action rifle | P | 4‑7 | 5.5 | Toy Car x2,  Wonderglue x2,  Desk Fan x1 | 200 | 10 = 5h 34m 0s ; 60 = 2h 12m 8s ; 102 = 2m 52s | No |
| Rare | Hardened sawed-off shotgun | E | 6‑9 | 7.5 | Duct Tape x3,  Desk Fan x2,  Globe x2 | 200 | 10 = 5h 59m 43s ; 60 = 2h 22m 18s ; 102 = 2m 52s | No |
| Rare | Hardened scoped .44 | A | 3‑6 | 4.5 | Alarm Clock x3,  Desk Fan x2,  Microscope x1 | 200 | 10 = 5h 8m 18s ; 60 = 2h 1m 58s ; 102 = 2m 52s | No |
| Rare | Hardened shotgun | E | 9‑12 | 10.5 | Duct Tape x3,  Globe x3,  Desk Fan x2 | 250 | 10 = 6h 51m 5s ; 60 = 2h 42m 37s ; 102 = 2m 52s | No |
| Rare | Hardened sniper rifle | P | 10‑13 | 11.5 | Magnifying Glass x3,  Camera x2,  Shovel x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | No |
| Rare | Improved Institute pistol | I | 11‑15 | 13 | Globe x4,  Alarm Clock x3,  Magnifying Glass x2 | 300 | 10 = 8h 33m 52s ; 60 = 3h 23m 17s ; 102 = 2m 52s | Yes |
| Rare | Incendiary Institute pistol | I | 10‑13 | 11.5 | Magnifying Glass x3,  Camera x2,  Globe x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | Yes |
| Rare | Institute pistol | I | 9‑11 | 10 | Alarm Clock x3,  Globe x3,  Magnifying Glass x2 | 250 | 10 = 6h 51m 5s ; 60 = 2h 42m 37s ; 102 = 2m 52s | Yes |
| Rare | Institute rifle | I | 14‑16 | 15 | Globe x3,  Magnifying Glass x3,  Camera x2 | 350 | 10 = 9h 31m 43s ; 60 = 4h 22m 26s ; 102 = 2m 52s | Yes |
| Rare | Junk Jet | S | 13‑15 | 14 | Alarm Clock x3,  Wonderglue x3,  Shovel x2 | 350 | 10 = 9h 31m 43s ; 60 = 4h 22m 26s ; 102 = 2m 52s | Yes |
| Rare | Kitchen knife | P | 3‑11 | 7 | Desk Fan x5,  Shovel x2 | 200 | 10 = 5h 59m 43s ; 60 = 2h 22m 18s ; 102 = 2m 52s | No |
| Rare | Laser pistol | A | 7‑8 | 7.5 | Desk Fan x3,  Camera x2,  Magnifying Glass x2 | 200 | 10 = 5h 59m 43s ; 60 = 2h 22m 18s ; 102 = 2m 52s | No |
| Rare | Laser rifle | P | 12‑13 | 12.5 | Camera x4,  Desk Fan x3,  Magnifying Glass x2 | 300 | 10 = 8h 33m 52s ; 60 = 3h 23m 17s ; 102 = 2m 52s | No |
| Rare | Long pipe rifle | P | 7‑11 | 9 | Duct Tape x3,  Shovel x2,  Globe x1 | 250 | 10 = 6h 25m 24s ; 60 = 2h 32m 28s ; 102 = 2m 52s | Yes |
| Rare | Night-vision pipe rifle | P | 8‑13 | 10.5 | Shovel x3,  Toy Car x3,  Duct Tape x2 | 250 | 10 = 6h 51m 5s ; 60 = 2h 42m 37s ; 102 = 2m 52s | Yes |
| Rare | Pickaxe | E | 11‑21 | 16 | Duct Tape x5,  Shovel x3,  Globe x2 | 400 | 10 = 10h 23m 6s ; 60 = 4h 42m 46s ; 102 = 2m 52s | No |
| Rare | Plasma pistol | A | 11‑12 | 11.5 | Alarm Clock x3,  Globe x2,  Microscope x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | No |
| Rare | Plasma rifle | P | 17‑18 | 17.5 | Alarm Clock x3,  Globe x3,  Microscope x3 | 400 | 10 = 13h 48m 40s ; 60 = 6h 4m 5s ; 102 = 2m 52s | No |
| Rare | Pool cue | A | 0‑8 | 4 | Toy Car x5,  Globe x1 | 200 | 10 = 5h 8m 18s ; 60 = 2h 1m 58s ; 102 = 2m 52s | No |
| Rare | Pressurized flamer | S | 15‑19 | 17 | Alarm Clock x3,  Microscope x3,  Shovel x3 | 400 | 10 = 13h 48m 40s ; 60 = 6h 4m 5s ; 102 = 2m 52s | No |
| Rare | Railway rifle | P | 14‑15 | 14.5 | Toy Car x3,  Wonderglue x3,  Shovel x2 | 350 | 10 = 9h 31m 43s ; 60 = 4h 22m 26s ; 102 = 2m 52s | No |
| Rare | Recoil compensated Junk Jet | S | 14‑17 | 15.5 | Alarm Clock x5,  Wonderglue x3,  Shovel x2 | 400 | 10 = 10h 23m 6s ; 60 = 4h 42m 46s ; 102 = 2m 52s | Yes |
| Rare | Rusty assault rifle | A | 8 | 8 | Alarm Clock x3,  Wonderglue x2,  Globe x1 | 250 | 10 = 6h 25m 24s ; 60 = 2h 32m 28s ; 102 = 2m 52s | No |
| Rare | Rusty combat shotgun | E | 13 | 13 | Globe x4,  Duct Tape x3,  Desk Fan x2 | 300 | 10 = 8h 33m 52s ; 60 = 3h 23m 17s ; 102 = 2m 52s | No |
| Rare | Rusty flamer | S | 15 | 15 | Alarm Clock x3,  Shovel x3,  Microscope x2 | 350 | 10 = 9h 31m 43s ; 60 = 4h 22m 26s ; 102 = 2m 52s | No |
| Rare | Rusty Gauss rifle | P | 16 | 16 | Alarm Clock x5,  Microscope x3,  Shovel x2 | 400 | 10 = 10h 23m 6s ; 60 = 4h 42m 46s ; 102 = 2m 52s | No |
| Rare | Rusty laser rifle | P | 12 | 12 | Magnifying Glass x3,  Camera x2,  Shovel x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | No |
| Rare | Rusty plasma pistol | A | 11 | 11 | Alarm Clock x3,  Globe x2,  Microscope x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | No |
| Rare | Rusty plasma rifle | P | 17 | 17 | Alarm Clock x3,  Globe x3,  Microscope x3 | 400 | 10 = 13h 48m 40s ; 60 = 6h 4m 5s ; 102 = 2m 52s | No |
| Rare | Rusty railway rifle | P | 14 | 14 | Toy Car x3,  Wonderglue x3,  Shovel x2 | 350 | 10 = 9h 31m 43s ; 60 = 4h 22m 26s ; 102 = 2m 52s | No |
| Rare | Rusty shotgun | E | 9 | 9 | Desk Fan x3,  Globe x2,  Wonderglue x1 | 250 | 10 = 6h 25m 24s ; 60 = 2h 32m 28s ; 102 = 2m 52s | No |
| Rare | Rusty sniper rifle | P | 10 | 10 | Camera x3,  Desk Fan x3,  Magnifying Glass x2 | 250 | 10 = 6h 51m 5s ; 60 = 2h 42m 37s ; 102 = 2m 52s | No |
| Rare | Scoped Institute pistol | I | 12‑17 | 14.5 | Globe x3,  Magnifying Glass x3,  Camera x2 | 350 | 10 = 9h 31m 43s ; 60 = 4h 22m 26s ; 102 = 2m 52s | Yes |
| Rare | Scoped pipe pistol | A | 4‑9 | 6.5 | Toy Car x3,  Duct Tape x2,  Shovel x2 | 200 | 10 = 5h 59m 43s ; 60 = 2h 22m 18s ; 102 = 2m 52s | Yes |
| Rare | Shotgun | E | 9‑10 | 9.5 | Duct Tape x3,  Globe x3,  Desk Fan x2 | 250 | 10 = 6h 51m 5s ; 60 = 2h 42m 37s ; 102 = 2m 52s | No |
| Rare | Sniper rifle | P | 10‑11 | 10.5 | Camera x3,  Desk Fan x3,  Magnifying Glass x2 | 250 | 10 = 6h 51m 5s ; 60 = 2h 42m 37s ; 102 = 2m 52s | No |
| Rare | Tactical Junk Jet | S | 15‑19 | 17 | Alarm Clock x3,  Shovel x3,  Wonderglue x3 | 400 | 10 = 13h 48m 40s ; 60 = 6h 4m 5s ; 102 = 2m 52s | Yes |
| Rare | Tuned laser pistol | A | 7‑9 | 8 | Magnifying Glass x3,  Camera x2,  Shovel x1 | 250 | 10 = 6h 25m 24s ; 60 = 2h 32m 28s ; 102 = 2m 52s | No |
| Rare | Tuned laser rifle | P | 12‑14 | 13 | Camera x4,  Desk Fan x3,  Magnifying Glass x2 | 300 | 10 = 8h 33m 52s ; 60 = 3h 23m 17s ; 102 = 2m 52s | No |
| Rare | Tuned plasma pistol | A | 11‑13 | 12 | Alarm Clock x3,  Globe x2,  Microscope x2 | 300 | 10 = 7h 42m 29s ; 60 = 3h 2m 57s ; 102 = 2m 52s | No |
| Legendary | Mare's Leg | P | 9-13 | 11 | Wonderglue x3,  Giddyup Buttercup x2,  Gold watch x1 | 17,300 | 10 = 10d 10h 32m ; 60 = 4d 21h 14m ; 102 = 5h 16m 48s | No |
| Legendary | Ghoul revolver | A | 8-12 | 10 | Globe x3,  Giddyup Buttercup x2,  Wonderglue x2 | 16,800 | 10 = 10d 2h 56m ; 60 = 4d 17h 38m ; 102 = 5h 1m 12s | No |
| Legendary | Ed's custom power fist | I | 16-22 | 19 | Giddyup Buttercup x4,  Camera x3,  Globe x2 | 19,950 | 10 = 12d 0h 33m ; 60 = 5d 15h 18m ; 102 = 6h 34m 48s | No |
| Legendary | Enhanced power fist | S | 14-19 | 17.5 | Globe x3,  Giddyup Buttercup x2,  Military Circuit Board x2 | 18,900 | 10 = 11d 9h 20m ; 60 = 5d 8h 4m ; 102 = 6h 3m 36s | No |
| Legendary | Hardened power fist | S | 15-20 | 17.5 | Globe x4,  Giddyup Buttercup x2,  Military Circuit Board x2 | 19,400 | 10 = 11d 16h 56m ; 60 = 5d 11h 41m ; 102 = 6h 19m 12s | No |
| Legendary | Rusty power fist | S | 12-17 | 14.5 | Camera x3,  Giddyup Buttercup x3,  Globe x2 | 18,350 | 10 = 11d 1h 44m ; 60 = 5d 4h 28m ; 102 = 5h 48m 0s | No |
| Legendary | Power fist | S | 13-18 | 15.5 | Globe x3,  Giddyup Buttercup x2,  Military Circuit Board x2 | 18,900 | 10 = 11d 9h 20m ; 60 = 5d 8h 4m ; 102 = 6h 3m 36s | No |
| Legendary | Mountain Momma | E | 14-19 | 16.5 | Shovel x3,  Gold watch x2,  Military Duct Tape x2 | 18,900 | 10 = 11d 9h 20m ; 60 = 5d 8h 4m ; 102 = 6h 3m 36s | No |
| Legendary | Grognak's axe | S | 18-26 | 22 | Microscope x4,  Giddyup Buttercup x3,  Military Duct Tape x2 | 21,000 | 10 = 12d 15h 56m ; 60 = 5d 22h 31m ; 102 = 7h 6m 0s | No |
| Legendary | Alien disintegrator | P | 17 | 17 | Microscope x4,  Gold watch x2,   Military Circuit Board x2 | 19,400 | 10 = 11d 16h 56m ; 60 = 5d 11h 41m ; 102 = 6h 19m 12s | No |
| Legendary | Rusty alien disintegrator | P | 16 | 16 | Microscope x3,  Gold watch x2,   Military Circuit Board x2 | 18,900 | 10 = 11d 9h 20m ; 60 = 5h 8h 4m ; 102 = 6h 3m 36s | No |
| Legendary | Enhanced alien disintegrator | P | 18 | 18 | Microscope x4,  Gold watch x2,   Military Circuit Board x2 | 19,400 | 10 = 11d 16h 56m ; 60 = 5d 11h 41m ; 102 = 6h 19m 12s | No |
| Legendary | Hardened alien disintegrator | P | 19 | 19 | Gold watch x4,  Camera x3,  Microscope x2 | 19,950 | 10 = 12d 0h 33m ; 60 = 5d 15h 18m ; 102 = 6h 34m 48s | No |
| Legendary | Pulse rifle | I | 18-19 | 18.5 | Gold watch x4,  Microscope x3,  Camera x2 | 19,950 | 10 = 12d 0h 33m ; 60 = 5d 15h 18m ; 102 = 64 34m 48s | No |
| Legendary | Rusty pulse rifle | I | 17-18 | 17.5 | Camera x4,  Chemistry Flask x2,  Gold watch x2 | 19,400 | 10 = 11d 16h 56m ; 60 = 5d 11h 41m ; 102 = 6h 19m 12s | No |
| Legendary | Enhanced pulse rifle | I | 19-20 | 19.5 | Gold watch x4,  Microscope x3,  Camera x2 | 19,950 | 10 = 12d 0h 33m ; 60 = 5d 15h 18m  ; 102 = 6h 34m 48s | No |
| Legendary | Hardened pulse rifle | I | 20-21 | 20.5 | Camera x3,  Gold watch x3,  Chemistry Flask x2 | 20,450 | 10 = 12d 8h 9m ; 60 = 5d 18h 55m ; 102 = 6h 50m 24s | No |
| Legendary | Accelerated Gauss rifle | P | 16‑20 | 18 | Camera x4,  Chemistry Flask x2,  Giddyup Buttercup x2 | 19,400 | 10 = 11d 16h 56m ; 60 = 5d 11h 41m ; 102 = 6h 19m 12s | No |
| Legendary | Accelerated railway rifle | P | 14‑18 | 16 | Globe x3,  Giddyup Buttercup x2,  Military Duct Tape x2 | 18,900 | 10 = 11d 9h 20m ; 60 = 5d 8h 4m ; 102 = 6h 3m 35s | No |
| Legendary | Agitated plasma thrower | S | 18‑21 | 19.5 | Chemistry Flask x4,  Camera x3,  Globe x2 | 19,950 | 10 = 12d 0h 33m ; 60 = 5d 15h 18m ; 102 = 9h 25m 19s | Yes |
| Legendary | Alien blaster | A | 18‑19 | 18.5 | Military Duct Tape x4,  Microscope x3,  Camera x2 | 19,950 | 10 = 12d 0h 33m ; 60 = 5d 15h 18m ; 102 = 9h 25m 19s | No |
| Legendary | Amplified alien blaster | A | 18‑22 | 20 | Camera x3,  Military Duct Tape x3,  Chemistry Flask x2 | 20,450 | 10 = 12d 8h 9m ; 60 = 5d 18h 55m ; 102 = 9h 45m 21s | No |
| Legendary | Amplified Gatling laser | S | 21‑25 | 23 | Microscope x5,  Military Circuit Board x3,  Giddyup Buttercup x2 | 21,500 | 10 = 12d 23h 21m ; 60 = 6d 2h 8m ; 102 = 10h 25m 26s | No |
| Legendary | Amplified laser rifle | P | 12‑16 | 14 | Military Circuit Board x3,  Shovel x3,  Microscope x2 | 18,350 | 10 = 11d 1h 44m ; 60 = 5d 4h 28m ; 102 = 5h 47m 59s | No |
| Legendary | Amplified plasma pistol | A | 11‑15 | 13 | Chemistry Flask x3,  Camera x2,  Globe x2 | 17,850 | 10 = 10d 18h 8m ; 60 = 5d 0h 51m ; 102 = 5h 32m 24s | No |
| Legendary | Amplified plasma rifle | P | 17‑22 | 19.5 | Chemistry Flask x4,  Globe x3,  Camera x2 | 19,950 | 10 = 12d 0h 33m ; 60 = 5d 15h 18m ; 102 = 6h 34m 47s | No |
| Legendary | Apotheosis | I | 14‑21 | 17.5 | Microscope x4,  Gold watch x2,  Military Circuit Board x2 | 19,400 | 10 = 11d 16h 56m ; 60 = 5d 11h 41m ; 102 = 6h 19m 12s | Yes |
| Legendary | Armor piercing minigun | S | 19‑23 | 21 | Gold watch x3,  Shovel x3,  Military Duct Tape x2 | 20,450 | 10 = 12d 8h 9m ; 60 = 5d 18h 55m ; 102 = 9h 45m 21s | No |
| Legendary | Big Sister | P | 10‑17 | 13.5 | Giddyup Buttercup x3,  Globe x2,  Wonderglue x2 | 17,850 | 10 = 11d 18h 23m ; 60 = 5d 0h 51m ; 102 = 5h 32m 24s | Yes |
| Legendary | Blackhawk | A | 3‑8 | 5.5 | Camera x3,  Shovel x2,  Chemistry Flask x1 | 15,200 | 10 = 9d 4h 14m ; 60 = 4d 7h 26m ; 102 = 7h 30m 21s | No |
| Legendary | Boosted plasma thrower | S | 20‑25 | 22.5 | Globe x4,  Chemistry Flask x3,  Military Circuit Board x2 | 21,000 | 10 = 12d 15h 45m ; 60 = 5d 22h 31m ; 102 = 10h 5m 24s | Yes |
| Legendary | Burnmaster | S | 15‑20 | 17.5 | Camera x4,  Chemistry Flask x2,  Giddyup Buttercup x2 | 19,400 | 10 = 11d 16h 56m ; 60 = 5d 11h 41m ; 102 = 6h 19m 12s | No |
| Legendary | Charon's shotgun | S | 13‑18 | 15.5 | Shovel x3,  Gold watch x2,  Military Duct Tape x2 | 18,900 | 10 = 11d 9h 20m ; 60 = 5d 8h 4m ; 102 = 8h 45m 14s | No |
| Legendary | Destabilizer | A | 18‑23 | 20.5 | Camera x3,  Military Duct Tape x3,  Chemistry Flask x2 | 20,450 | 10 = 12d 8h 9m ; 60 = 5d 18h 55m ; 102 = 9h 45m 21s | No |
| Legendary | Double-barrel combat shotgun | E | 13‑17 | 15 | Gold watch x3,  Wonderglue x3,  Shovel x2 | 18,350 | 10 = 11d 1h 44m ; 60 = 5d 4h 28m ; 102 = 5h 47m 59s | No |
| Legendary | Dragon's Maw | S | 22‑29 | 25.5 | Chemistry Flask x3,  Globe x3,  Military Circuit Board x3 | 22,050 | 10 = 13d 7h 15m ; 60 = 6d 5h 45m ; 102 = 10h 45m 28s | Yes |
| Legendary | Electrified Junk Jet | S | 16‑21 | 18.5 | Military Duct Tape x4,  Shovel x3,  Camera x2 | 19,950 | 10 = 12d 0h 33m ; 60 = 5d 15h 18m ; 102 = 9h 25m 19s | Yes |
| Legendary | Enhanced Fat Man | S | 22‑24 | 23 | Shovel x5,  Military Duct Tape x3,  Chemistry Flask x2 | 21,500 | 10 = 12d 23h 21m ; 60 = 6d 2h 8m ; 102 = 10h 25m 26s | No |
| Legendary | Enhanced Gauss rifle | S | 16‑18 | 17 | Camera x4,  Chemistry Flask x2,  Giddyup Buttercup x2 | 19,400 | 10 = 11d 16h 56m ; 60 = 5d 11h 41m ; 102 = 6h 19m 12s | No |
| Legendary | Enhanced minigun | S | 19‑21 | 20 | Gold watch x3,  Shovel x3,  Military Duct Tape x2 | 20,450 | 10 = 12d 8h 9m ; 60 = 5d 18h 55m ; 102 = 9h 45m 21s | No |
| Legendary | Enhanced missile launcher | S | 20‑22 | 21 | Gold watch x3,  Microscope x3,  Military Circuit Board x2 | 20,450 | 10 = 12d 8h 9m ; 60 = 5d 18h 55m ; 102 = 9h 45m 21s | No |
| Legendary | Farmer's Daughter | E | 9‑14 | 11.5 | Shovel x3,  Gold watch x2,  Military Duct Tape x1 | 17,300 | 10 = 10d 10h 32m ; 60 = 4d 21h 14m ; 102 = 5h 16m 47s | No |
| Legendary | Fat Man | S | 22‑23 | 22.5 | Shovel x4,  Military Duct Tape x3,  Chemistry Flask x2 | 21,000 | 10 = 12d 15h 45m ; 60 = 5d 22h 31m ; 102 = 10h 5m 24s | No |
| Legendary | Fire hydrant bat | I | 19‑31 | 25 | Chemistry Flask x3,  Military Duct Tape x3,  Shovel x3 | 22,050 | 10 = 13d 6h 57m ; 60 = 6d 5h 45m ; 102 = 7h 37m 12s | No |
| Legendary | Flaming Junk Jet | S | 17‑23 | 20 | Camera x3,  Military Duct Tape x3,  Giddyup Buttercup x2 | 21,000 | 10 = 12d 8h 9m ; 60 = 5d 18h 55m ; 102 = 9h 45m 21s | Yes |
| Legendary | Focused alien blaster | A | 18‑21 | 19.5 | Military Duct Tape x4,  Microscope x3,  Camera x2 | 19,950 | 10 = 12d 0h 33m ; 60 = 5d 15h 18m ; 102 = 9h 25m 19s | No |
| Legendary | Focused Gatling laser | S | 21‑24 | 22.5 | Microscope x4,  Military Circuit Board x3,  Giddyup Buttercup x2 | 21,000 | 10 = 12d 15h 45m ; 60 = 5d 22h 31m ; 102 = 10h 5m 24s | No |
| Legendary | Focused plasma rifle | P | 17‑20 | 18.5 | Chemistry Flask x4,  Globe x3,  Camera x2 | 19,950 | 10 = 12d 0h 33m ; 60 = 5d 15h 18m ; 102 = 6h 34m 47s | No |
| Legendary | Gatling laser | S | 21‑22 | 21.5 | Microscope x4,  Military Circuit Board x3,  Giddyup Buttercup x2 | 21,000 | 10 = 12d 15h 45m ; 60 = 5d 22h 31m ; 102 = 10h 5m 24s | No |
| Legendary | Guided Fat Man | S | 22‑26 | 24 | Shovel x5,  Military Duct Tape x3,  Chemistry Flask x2 | 21,500 | 10 = 12d 23h 21m ; 60 = 6d 2h 8m ; 102 = 10h 25m 26s | No |
| Legendary | Guided missile launcher | S | 20‑24 | 22 | Microscope x4,  Gold watch x3,  Military Circuit Board x2 | 21,000 | 10 = 12d 15h 45m ; 60 = 5d 22h 31m ; 102 = 10h 5m 24s | No |
| Legendary | Hardened Fat Man | S | 22‑25 | 23.5 | Shovel x5,  Military Duct Tape x3,  Chemistry Flask x2 | 21,500 | 10 = 12d 23h 21m ; 60 = 6d 2h 8m ; 102 = 10h 25m 26s | No |
| Legendary | Hardened Gauss rifle | P | 16‑19 | 17.5 | Camera x4,  Chemistry Flask x2,  Giddyup Buttercup x2 | 19,400 | 10 = 11d 16h 56m ; 60 = 5d 11h 41m ; 102 = 6h 19m 12s | No |
| Legendary | Hardened minigun | S | 19‑22 | 20.5 | Gold watch x3,  Shovel x3,  Military Duct Tape x2 | 20,450 | 10 = 12d 8h 9m ; 60 = 5d 18h 55m ; 102 = 9h 45m 21s | No |
| Legendary | Hardened missile launcher | S | 20‑23 | 21.5 | Microscope x4,  Gold watch x3,  Military Circuit Board x2 | 21,000 | 10 = 12d 15h 45m ; 60 = 5d 22h 31m ; 102 = 10h 5m 24s | No |
| Legendary | Hardened railway rifle | P | 14‑17 | 15.5 | Globe x3,  Giddyup Buttercup x2,  Military Duct Tape x2 | 18,900 | 10 = 11d 9h 20m ; 60 = 5d 8h 4m ; 102 = 6h 3m 35s | No |
| Legendary | Infiltrator | A | 8‑13 | 10.5 | Globe x3,  Camera x2,  Military Duct Tape x2 | 16,800 | 10 = 10d 2h 56m ; 60 = 4d 17h 38m ; 102 = 7h 25m 4s | No |
| Legendary | Kneecapper | E | 6‑11 | 8.5 | Gold watch x2,  Shovel x2,  Wonderglue x2 | 16,250 | 10 = 9d 19h 26m ; 60 = 4d 14h 40m ; 102 = 5h 51m 35s | No |
| Legendary | Laser musket | P | 10‑13 | 11.5 | Microscope x3,  Military Circuit Board x2,  Giddyup Buttercup x1 | 17,300 | 10 = 10d 10h 32m ; 60 = 4d 21h 14m ; 102 = 5h 16m 47s | No |
| Legendary | Lead Belcher | S | 19‑24 | 21.5 | Shovel x4,  Gold watch x3,  Military Duct Tape x2 | 21,000 | 10 = 12d 15h 45m ; 60 = 5d 22h 31m ; 102 = 10h 5m 24s | No |
| Legendary | Lincoln's repeater | P | 4‑9 | 6.5 | Globe x2,  Military Duct Tape x2,  Shovel x1 | 15,750 | 10 = 9d 11h 50m ; 60 = 4d 11h 3m ; 102 = 5h 35m 59s | No |
| Legendary | Little Brother | A | 6‑13 | 9.5 | Globe x3,  Giddyup Buttercup x2,  Wonderglue x2 | 16,800 | 10 = 10d 2h 56m ; 60 = 4d 17h 38m ; 102 = 7h 25m 4s | Yes |
| Legendary | Lone Wanderer | A | 2‑7 | 4.5 | Wonderglue x2,  Giddyup Buttercup x1,  Shovel x1 | 14,700 | 10 = 8d 20h 38m ; 60 = 4d 3h 50m ; 102 = 7h 10m 9s | No |
| Legendary | Long Institute rifle | I | 16‑20 | 18 | Microscope x4,  Gold Watch x2,  Military Circuit Board x2 | 19,400 | 10 = 11d 16h 56m ; 60 = 5d 11h 41m ; 102 = 6h 19m 12s | Yes |
| Legendary | Magnetron 4000 | P | 16‑21 | 18.5 | Chemistry Flask x4,  Shovel x3,  Microscope x2 | 19,950 | 10 = 12d 0h 33m ; 60 = 5d 15h 18m ; 102 = 6h 34m 47s | No |
| Legendary | Mean Green Monster | P | 17‑23 | 20 | Camera x3,  Chemistry Flask x3,  Gold watch x2 | 20,450 | 10 = 12d 8h 9m ; 60 = 5d 18h 55m ; 102 = 6h 50m 24s | No |
| Legendary | Minigun | S | 19‑20 | 19.5 | Gold watch x4,  Wonderglue x3,  Shovel x2 | 19,950 | 10 = 12d 0h 33m ; 60 = 5d 15h 18m ; 102 = 9h 25m 19s | No |
| Legendary | MIRV | S | 22‑27 | 24.5 | Chemistry Flask x3,  Military Duct Tape x3,  Shovel x3 | 22,050 | 10 = 13d 7h 15m ; 60 = 6d 5h 45m ; 102 = 10h 45m 28s | No |
| Legendary | Miss Launcher | S | 20‑25 | 22.5 | Microscope x4,  Gold Watch x3,  Military Circuit Board x2 | 21,000 | 10 = 12d 15h 45m ; 60 = 5d 22h 31m ; 102 = 10h 5m 24s | No |
| Legendary | Missile launcher | S | 20‑21 | 20.5 | Gold watch x3,  Microscope x3,  Military Circuit Board x2 | 20,450 | 10 = 12d 8h 9m ; 60 = 5d 18h 55m ; 102 = 9h 45m 21s | No |
| Legendary | MPXL Novasurge | A | 11‑16 | 13.5 | Chemistry Flask x3,  Camera x2,  Globe x2 | 17,850 | 10 = 10d 18h 8m ; 60 = 5d 0h 51m ; 102 = 5h 32m 24s | No |
| Legendary | Night-vision Institute rifle | I | 17‑22 | 19.5 | Gold watch x4,  Camera x3,  Microscope x2 | 19,950 | 10 = 12d 0h 33m ; 60 = 5d 15h 18m ; 102 = 6h 34m 47s | Yes |
| Legendary | Ol' Painless | P | 5‑10 | 7.5 | Globe x2,  Military Duct Tape x2,  Shovel x1 | 15,750 | 10 = 9d 11h 50m ; 60 = 4d 11h 3m ; 102 = 5h 35m 59s | No |
| Legendary | Overcharged plasma thrower | S | 21‑27 | 24 | Globe x5,  Chemistry Flask x3,  Military Circuit Board x2 | 21,500 | 10 = 12d 23h 21m ; 60 = 6d 2h 8m ; 102 = 10h 25m 26s | Yes |
| Legendary | Plasma thrower | S | 17‑19 | 18 | Globe x4,  Chemistry Flask x2,  Military Circuit Board x2 | 19,400 | 10 = 11d 9h 20m ; 60 = 5d 11h 41m ; 102 = 6h 19m 12s | Yes |
| Legendary | Railmaster | P | 14‑19 | 16.5 | Globe x3,  Giddyup Buttercup x2,  Military Duct Tape x2 | 18,900 | 10 = 11d 9h 20m ; 60 = 5d 8h 4m ; 102 = 6h 3m 35s | No |
| Legendary | Red Rocket | P | 0‑6 | 3 | Wonderglue x2,  Gold watch x1,  Shovel x1 | 14,150 | 10 = 8d 13h 2m ; 60 = 4d 0h 13m ; 102 = 4h 49m 12s | No |
| Legendary | Relentless raider sword | S | 16‑28 | 22 | Wonderglue x4,  Giddyup Buttercup x3,  Gold watch x2 | 21,000 | 10 = 12d 15h 45m ; 60 = 5d 22h 31m ; 102 = 7h 5m 59s | No |
| Legendary | Rusty alien blaster | A | 18 | 18 | Camera x4,  Chemistry Flask x2,  Military Duct Tape x2 | 19,400 | 10 = 11d 16h 56m ; 60 = 5d 11h 41m ; 102 = 6h 19m 12s | No |
| Legendary | Rusty Fat Man | S | 22 | 22 | Shovel x4,  Military Duct Tape x3,  Chemistry Flask x2 | 21,000 | 10 = 12d 15h 45m ; 60 = 5d 22h 31m ; 102 = 10h 5m 24s | No |
| Legendary | Rusty Gatling laser | S | 21 | 21 | Microscope x3,  Military Circuit Board x3,  Giddyup Buttercup x2 | 20,450 | 10 = 12d 8h 9m ; 60 = 5d 18h 55m ; 102 = 9h 45m 21s | No |
| Legendary | Rusty minigun | S | 19 | 19 | Gold watch x4,  Wonderglue x3,  Shovel x2 | 19,950 | 10 = 12d 0h 33m ; 60 = 5d 15h 18m ; 102 = 9h 25m 19s | No |
| Legendary | Rusty missile launcher | S | 20 | 20 | Gold watch x3,  Microscope x3,  Military Circuit Board x2 | 20,450 | 10 = 12d 8h 9m ; 60 = 5d 18h 55m ; 102 = 9h 45m 21s | No |
| Legendary | Scattered Institute pistol | I | 13‑19 | 16 | Microscope x3,  Gold watch x2,  Military Circuit Board x2 | 18,900 | 10 = 11d 9h 20m ; 60 = 5d 8h 4m ; 102 = 6h 3m 35s | Yes |
| Legendary | Smuggler's End | A | 7‑12 | 9.5 | Shovel x3,  Microscope x2,  Military Circuit Board x2 | 16,800 | 10 = 10d 2h 56m ; 60 = 4d 17h 38m ; 102 = 7h 25m 4s | No |
| Legendary | Tactical plasma thrower | S | 19‑23 | 21 | Chemistry Flask x3,  Globe x3,  Military Circuit Board x2 | 20,450 | 10 = 12d 8h 9m ; 60 = 5d 18h 55m ; 102 = 9h 45m 21s | Yes |
| Legendary | Targeting Institute rifle | I | 18‑24 | 21 | Gold watch x3,  Microscope x3,  Military Circuit Board x2 | 20,450 | 10 = 12d 8h 9m ; 60 = 5d 18h 55m ; 102 = 6h 50m 24s | Yes |
| Legendary | Technician's Revenge | S | 18‑25 | 21.5 | Camera x4,  Military Duct Tape x3,  Giddyup Buttercup x2 | 21,000 | 10 = 12d 15h 45m ; 60 = 5d 22h 31m ; 102 = 10h 5m 24s | Yes |
| Legendary | Tuned alien blaster | A | 18‑20 | 19 | Military Duct Tape x4,  Microscope x3,  Camera x2 | 19,950 | 10 = 12d 0h 33m ; 60 = 5d 15h 18m ; 102 = 9h 25m 19s | No |
| Legendary | Tuned Gatling laser | S | 21‑23 | 22 | Microscope x4,  Military Circuit Board x3,  Giddyup Buttercup x2 | 21,000 | 10 = 12d 15h 45m ; 60 = 5d 22h 31m ; 102 = 10h 5m 24s | No |
| Legendary | Tuned plasma rifle | P | 17‑19 | 18 | Camera x4,  Chemistry Flask x2,  Gold watch x2 | 19,400 | 10 = 11d 16h 56m ; 60 = 5d 11h 41m ; 102 = 6h 19m 12s | No |
| Legendary | Vengeance | S | 21‑26 | 23.5 | Microscope x5,  Military Circuit Board x3,  Giddyup Buttercup x2 | 21,500 | 10 = 12d 23h 21m ; 60 = 6d 2h 8m ; 102 = 10h 25m 26s | No |
| Legendary | Victory rifle | P | 10‑15 | 12.5 | Military Circuit Board x3,  Microscope x2,  Shovel x2 | 17,850 | 10 = 10d 18h 8m ; 60 = 5d 0h 51m ; 102 = 5h 32m 24s | No |
| Legendary | Virgil's rifle | I | 19‑26 | 22.5 | Microscope x4,  Gold watch x3,  Military Circuit Board x2 | 21,000 | 10 = 12d 15h 45m ; 60 = 5d 22h 31m ; 102 = 7h 5m 59s | Yes |
| Legendary | Wazer Wifle | P | 12‑17 | 14.5 | Military Circuit Board x3,  Shovel x3,  Microscope x2 | 18,350 | 10 = 11d 1h 44m ; 60 = 5d 4h 28m ; 102 = 5h 47m 59s | No |
| Legendary | Wild Bill's Sidearm | A | 1‑6 | 3.5 | Globe x2,  Giddyup Buttercup x1,  Wonderglue x1 | 14,700 | 10 = 8d 20h 38m ; 60 = 4d 3h 50m ; 102 = 7h 10m 9s | No |

### A4. Outfit crafting recipes (stat, bonus, junk, caps)

| Tier | Outfit | Stat | Bonus | Junk | Caps | Craft-only |
|---|---|---|---|---|---|---|
| Common | Armored vault suit | P | P+3 | Baseball Glove x1,  Yarn x1 | 5 | No |
| Common | Battle armor | S | S+2 E+1 | Desk Fan x1,  Toy Car x1 | 5 | No |
| Common | BoS uniform | P | P+2, C+1 | Alarm Clock x1,  Baseball Glove x1 | 5 | Yes |
| Common | Combat armor | S | S+2 A+1 | Baseball Glove x1,  Toy Car x1 | 5 | No |
| Common | Flight suit | A | E+1 A+2 | Baseball Glove x1,  Yarn x1 | 5 | Yes |
| Common | Formal wear | L | L+3 | Yarn x2 | 5 | No |
| Common | Handyman jumpsuit | A | A+3 | Baseball Glove x1,  Yarn x1 | 5 | No |
| Common | Initiate robe | C | C+2 A+1 | Baseball Glove x1,  Yarn x1 | 5 | No |
| Common | Junior officer uniform | I | C+1 I+2 | Baseball Glove x1,  Yarn x1 | 5 | No |
| Common | Lab coat | I | I+3 | Magnifying Glass x1,  Yarn x1 | 5 | No |
| Common | Leather armor | E | S+1 E+2 | Baseball Glove x1,  Toy Car x1 | 5 | No |
| Common | Merc gear | A | P+1 A+1 L+1 | Baseball Glove x1,  Yarn x1 | 5 | No |
| Common | Military fatigues | S | S+3 | Toy Car x1,  Yarn x1 | 5 | No |
| Common | Nightwear | C | C+3 | Duct Tape x1, Yarn x1 | 5 | No |
| Common | Radiation suit | E | P+1 E+2 | Magnifying Glass x1,  Yarn x1 | 5 | No |
| Common | Raider armor | A | P+1 A+2 | Baseball Glove x1,  Duct Tape x1 | 5 | No |
| Common | Treasure hunter gear | S | S+2 P+1 | Baseball Glove x1,  Yarn x1 | 5 | Yes |
| Common | Wasteland gear | E | E+3 | Baseball Glove x1,  Magnifying Glass x1 | 5 | No |
| Common | Wasteland medic | P | P+2 L+1 | Baseball Glove x1,  Yarn x1 | 5 | No |
| Common | Mechanic jumpsuit | C | S+1 C+1 | Yarn x1 | 5 | Yes |
| Common | Polka dot sundress | I | S+1 I+1 | Yarn x1 | 5 | Yes |
| Common | Pre-War suburbanite | I | P+1 I+1 | Yarn x1 | 5 | Yes |
| Common | Rural schoolmarm | E | P+1 E+1 | Yarn x1 | 5 | Yes |
| Common | Spring casualwear | E | E+1 A+1 | Yarn x1 | 5 | Yes |
| Common | Vault socialite | C | C+1 A+1 | Yarn x1 | 5 | Yes |
| Rare | Advanced BoS uniform | P | P+3, C+2 | Brahmin Hide x4,  Alarm Clock x3,  Yarn x2 | 300 | Yes |
| Rare | Advanced flight suit | A | E+2 A+3 | Brahmin Hide x4,  Yarn x4,  Baseball Glove x1 | 300 | Yes |
| Rare | Advanced Institute jumper | I | I+3, A+2 | Baseball Glove x4, Teddy Bear x4,  Yarn x1 | 300 | Yes |
| Rare | Advanced jumpsuit | A | A+5 | Brahmin Hide x4,  Yarn x4,  Baseball Glove x1 | 300 | No |
| Rare | Advanced lab coat | I | I+5 | Microscope x4,  Yarn x4,  Magnifying Glass x1 | 300 | No |
| Rare | Advanced radiation suit | E | P+2, E+3 | Teddy Bear x4,  Magnifying Glass x3,  Toy Car x2 | 300 | No |
| Rare | Baseball uniform | A | A+4, L+1 | Baseball Glove x4, Teddy Bear x4,  Yarn x1 | 300 | Yes |
| Rare | Bounty hunter gear | A | S+3, P+2 | Brahmin Hide x4,  Yarn x4,  Baseball Glove x1 | 300 | Yes |
| Rare | Clergy outfit | C | C+4, L+1 | Baseball Glove x4, Teddy Bear x4,  Yarn x1 | 300 | No |
| Rare | Comedian outfit | C | P+2, C+2, L+1 | Teddy Bear x4,  Baseball Glove x3,  Duct Tape x2 | 300 | No |
| Rare | Engineer outfit | I | E+2, I+2, L+1 | Brahmin Hide x4,  Toy Car x4, Baseball Glove x1 | 300 | No |
| Rare | Fancy formal wear | L | L+5 | Yarn x5,  Teddy Bear x4 | 300 | No |
| Rare | Greaser outfit | C | C+2, A+2, L+1 | Brahmin Hide x4,  Yarn x4,  Baseball Glove x1 | 300 | No |
| Rare | Horror fan outfit | E | E+4, L+1 | Teddy Bear x4,  Toy Car x3,  Baseball Glove x2 | 300 | No |
| Rare | Knight armor | S | S+2, P+2, L+1 | Brahmin Hide x4,  Desk Fan x4,  Baseball Glove x1 | 300 | No |
| Rare | Librarian outfit | I | I+4, L+1 | Magnifying Glass x4,  Teddy Bear x4,  Yarn x1 | 300 | No |
| Rare | Lifeguard outfit | P | P+4, L+1 | Yarn x5,  Teddy Bear x4 | 300 | Yes |
| Rare | Mayor outfit | C | C+2, I+2, L+1 | Magnifying Glass x4, Teddy Bear x4,  Yarn x1 | 300 | No |
| Rare | Medieval ruler outfit | C | P+2, C+2, L+1 | Baseball Glove x4, Teddy Bear x4,  Yarn x1 | 300 | No |
| Rare | Movie fan outfit | P | P+4, L+1 | Yarn x5,  Teddy Bear x4 | 300 | No |
| Rare | Naughty nightwear | C | C+5 | Duct Tape x4, Teddy Bear x4,  Yarn x1 | 300 | No |
| Rare | Ninja outfit | A | A+4, L+1 | Teddy Bear x4,  Baseball Glove x3,  Duct Tape x2 | 300 | No |
| Rare | Nobility outfit | I | E+2, I+2, L+1 | Baseball Glove x4, Teddy Bear x4,  Yarn x1 | 300 | No |
| Rare | Officer fatigues | S | S+5 | Teddy Bear x4,  Toy Car x4, Yarn x1 | 300 | No |
| Rare | Officer uniform | I | C+2, I+3 | Baseball Glove x4, Teddy Bear x4,  Yarn x1 | 300 | No |
| Rare | Professor outfit | I | L+1, I+4 | Magnifying Glass x4, Teddy Bear x4,  Yarn x1 | 300 | No |
| Rare | Republic robes | C | C+4, L+1 | Teddy Bear x4,  Toy Car x4, Yarn x1 | 300 | No |
| Rare | Sci-fi fan outfit | I | I+2, A+2, L+1 | Teddy Bear x4,  Baseball Glove x3,  Duct Tape x2 | 300 | No |
| Rare | Scribe robe | C | C+3, A+2 | Brahmin Hide x4,  Yarn x4,  Baseball Glove x1 | 300 | No |
| Rare | Soldier uniform | E | S+2, E+2, L+1 | Yarn x5,  Teddy Bear x4 | 300 | No |
| Rare | Sports fan outfit | S | S+4, L+1 | Baseball Glove x4, Globe x4, Toy Car x1 | 300 | No |
| Rare | Sturdy battle armor | S | S+3, E+2 | Shovel x4,  Toy Car x3,  Baseball Glove x2 | 300 | No |
| Rare | Sturdy combat armor | S | S+3, A+2 | Baseball Glove x4, Globe x4, Toy Car x1 | 300 | No |
| Rare | Sturdy leather armor | E | S+2, E+3 | Brahmin Hide x4,  Toy Car x4, Baseball Glove x1 | 300 | No |
| Rare | Sturdy merc gear | A | P+1, A+2, L+2 | Brahmin Hide x4,  Yarn x4,  Baseball Glove x1 | 300 | No |
| Rare | Sturdy metal armor | S | S+3, L+2 | Baseball Glove x4, Shovel x4,  Desk Fan x1 | 300 | Yes |
| Rare | Sturdy raider armor | A | P+2, A+3 | Brahmin Hide x4,  Duct Tape x3,  Desk Fan x2 | 300 | No |
| Rare | Sturdy vault suit | P | P+5 | Baseball Glove x4, Teddy Bear x4,  Yarn x1 | 300 | No |
| Rare | Sturdy wasteland gear | E | E+5 | Brahmin Hide x4,  Magnifying Glass x3,  Toy Car x2 | 300 | No |
| Rare | Surgeon outfit | P | P+2, A+2, L+1 | Brahmin Hide x4,  Yarn x3,  Magnifying Glass x2 | 300 | No |
| Rare | Survivor armor | A | S+2, A+2, L+1 | Brahmin Hide x4,  Toy Car x3,  Magnifying Glass x2 | 300 | No |
| Rare | Swimsuit | C | E+2, C+2, L+1 | Duct Tape x4, Teddy Bear x4,  Yarn x1 | 300 | Yes |
| Rare | Wasteland doctor | P | P+3, L+2 | Teddy Bear x4,  Baseball Glove x3,  Magnifying Glass x2 | 300 | No |
| Rare | Wrestler outfit | E | S+2, E+2, L+1 | Brahmin Hide x4,  Yarn x3,  Duct Tape x2 | 300 | No |
| Rare | Doo-wop singer | L | S+1, C+1, A+1, L+1 | Teddy Bear x3,  Yarn x3 | 250 | Yes |
| Rare | Drag racer | L | S+1, E+1, A+1, L+1 | Teddy Bear x3,  Yarn x3 | 250 | Yes |
| Rare | Post-War Casanova | L | P+1, C+1, I+1, L+1 | Teddy Bear x3,  Yarn x3 | 250 | Yes |
| Rare | Soda fountain dress | L | P+1, E+1, I+1, L+1 | Teddy Bear x3,  Yarn x3 | 250 | Yes |
| Legendary | Abraham's relaxedwear | I | E+1, I+2, A+2, L+2 | Trifold American Flag x5,  Teddy Bear x4 | 21,000 | No |
| Legendary | Autumn's uniform | P | S+2, P+2, E+2, C+1 | Trifold American Flag x5,  Brahmin Hide x4 | 21,000 | No |
| Legendary | Bittercup's outfit | S | S+2, P+2, E+2, C+1 | Yao Guai Hide x5,  Brahmin Hide x4 | 21,000 | No |
| Legendary | Commander fatigues | S | S+7 | Trifold American Flag x5,  Globe x4 | 21,000 | No |
| Legendary | Commander uniform | I | C+3, I+4 | Trifold American Flag x5,  Brahmin Hide x4 | 21,000 | No |
| Legendary | Confessor Cromwell's rags | L | P+2, E+2, L+2, I+1 | Trifold American Flag x5,  Brahmin Hide x4 | 21,000 | No |
| Legendary | Elder robe | C | C+4, A+3 | Yao Guai Hide x5,  Teddy Bear x4 | 21,000 | No |
| Legendary | Eulogy Jones' suit | C | P+2, C+2, I+1, L+2 | Trifold American Flag x5,  Teddy Bear x4 | 21,000 | No |
| Legendary | Expert BoS uniform | P | P+4, C+3 | Teddy Bear x4,  Yao Guai Hide x3,  Military Circuit Board x2 | 21,000 | Yes |
| Legendary | Expert flight suit | A | E+3, A+4 | Yao Guai Hide x5,  Teddy Bear x4 | 21,000 | Yes |
| Legendary | Expert Institute jumper | I | I+4, A+3 | Trifold American Flag x5,  Brahmin Hide x4 | 21,000 | Yes |
| Legendary | Expert jumpsuit | A | A+7 | Yao Guai Hide x5,  Teddy Bear x4 | 21,000 | No |
| Legendary | Expert lab coat | I | I+7 | Chemistry Flask x5,  Teddy Bear x4 | 21,000 | No |
| Legendary | Expert radiation suit | E | P+3, E+4 | Globe x4, Trifold American Flag x3,  Chemistry Flask x2 | 21,000 | No |
| Legendary | Heavy battle armor | S | S+4, E+3 | Brahmin Hide x4,  Giddyup Buttercup x3, Gold Watch x2 | 21,000 | No |
| Legendary | Heavy combat armor | S | S+4, A+3 | Gold Watch x5,  Brahmin Hide x4 | 21,000 | No |
| Legendary | Heavy leather armor | E | S+3, E+4 | Yao Guai Hide x5,  Globe x4 | 21,000 | No |
| Legendary | Heavy merc gear | A | P+2, A+3, L+2 | Yao Guai Hide x5,  Teddy Bear x4 | 21,000 | No |
| Legendary | Heavy metal armor | S | S+4, L+3 | Giddyup Buttercup x5,  Brahmin Hide x4 | 21,000 | Yes |
| Legendary | Heavy raider armor | A | P+3, A+4 | Shovel x4,  Yao Guai Hide x3,  Military Duct Tape x2 | 21,000 | No |
| Legendary | Heavy synth armor | E | E+4, I+3 | Gold Watch x5,  Shovel x4 | 21,000 | Yes |
| Legendary | Heavy vault suit | P | P+7 | Trifold American Flag x5,  Brahmin Hide x4 | 21,000 | No |
| Legendary | Heavy wasteland gear | E | E+7 | Globe x4, Yao Guai Hide x3,  Chemistry Flask x2 | 21,000 | No |
| Legendary | Incognito Leisurewear | I | C+2, I+2, A+2, L+2 | Wonderglue x4, Military Circuit Board x3, Trifold American Flag x3 | 22,550 | No |
| Legendary | Lucky formal wear | L | L+7 | Trifold American Flag x5,  Teddy Bear x4 | 21,000 | No |
| Legendary | Lucky nightwear | C | C+7 | Trifold American Flag x5,  Wonderglue x4 | 21,000 | No |
| Legendary | Minuteman uniform | P | S+2, P+2, I+2, A+2 | Trifold American Flag x5,  Brahmin Hide x4,  Yao Guai Hide x1 | 22,550 | No |
| Legendary | Mutant hunter gear | S | S+4, P+3 | Yao Guai Hide x5,  Teddy Bear x4 | 21,000 | Yes |
| Legendary | Piper's outfit | A | P+2, E+2, A+2, L+2 | Yao Guai Hide x5,  Teddy Bear x4,  Trifold American Flag x1 | 22,550 | No |
| Legendary | Scarred power armor | S | S+4, P+2, E+4, C+2 | Microscope x4, Giddyup Buttercup x3, Military Circuit Board x3 | 22,550 | No |
| Legendary | Scribe Rothchild's robe | I | P+2, E+1, C+2, I+2 | Yao Guai Hide x5,  Teddy Bear x4 | 21,000 | No |
| Legendary | Sheriff's duster | E | P+2, E+5 | Trifold American Flag x5,  Brahmin Hide x4 | 21,000 | No |
| Legendary | T-45a power armor | P | S+2, P+3 | Giddyup Buttercup x3, Camera x2,  Wonderglue x2 | 17,850 | No |
| Legendary | T-45d power armor | P | S+2, P+4 | Wonderglue x4,  Giddyup Buttercup x2, Military Circuit Board x2 | 19,400 | No |
| Legendary | T-45f power armor | P | S+2, P+5 | Wonderglue x4,  Giddyup Buttercup x3, Military Circuit Board x2 | 21,000 | No |
| Legendary | T-51a power armor | S | S+3, P+1 | Camera x2,  Giddyup Buttercup x2, Wonderglue x2 | 16,250 | No |
| Legendary | T-51d power armor | S | S+3, P+2 | Giddyup Buttercup x3, Camera x2,  Wonderglue x2 | 17,850 | No |
| Legendary | T-51f power armor | S | S+4, P+3 | Wonderglue x4,  Giddyup Buttercup x3, Military Circuit Board x2 | 21,000 | No |
| Legendary | T-60a power armor | E | S+2, E+3 | Giddyup Buttercup x3, Camera x2,  Wonderglue x2 | 17,850 | No |
| Legendary | T-60d power armor | E | S+2, E+4 | Wonderglue x4,  Giddyup Buttercup x2, Military Circuit Board x2 | 19,400 | No |
| Legendary | T-60f power armor | E | S+1. P+1, E+5 | Wonderglue x4,  Giddyup Buttercup x3, Military Circuit Board x2 | 21,000 | No |
| Legendary | Tenpenny's suit | I | P+2, C+2, I+2, L+1 | Trifold American Flag x5,  Teddy Bear x4 | 21,000 | No |
| Legendary | Three Dog's outfit | C | P+2, C+5 | Yao Guai Hide x5,  Teddy Bear x4 | 21,000 | No |
| Legendary | Tunnel Snakes' outfit | C | P+2, E+1, C+2, A+2 | Yao Guai Hide x5,  Teddy Bear x4 | 21,000 | No |
| Legendary | Wasteland surgeon | P | P+4, L+3 | Microscope x4,  Trifold American Flag x3,  Yao Guai Hide x2 | 21,000 | No |
| Legendary | X-01 Mk I power armor | S | S+3, P+1, E+1 | Giddyup Buttercup x3, Camera x2,  Wonderglue x2 | 17,850 | No |
| Legendary | X-01 Mk IV power armor | S | S+4, P+1, E+1 | Wonderglue x4,  Giddyup Buttercup x2, Military Circuit Board x2 | 19,400 | No |
| Legendary | X-01 Mk VI power armor | S | S+5, P+1, E+1 | Wonderglue x4,  Giddyup Buttercup x3, Military Circuit Board x2 | 21,000 | No |

---

## Sources

- Fallout Wiki (fandom), fetched through the MediaWiki API (wikitext):
  - https://fallout.fandom.com/wiki/Vault_dwellers_(Fallout_Shelter)
  - https://fallout.fandom.com/wiki/Fallout_Shelter_SPECIAL
  - https://fallout.fandom.com/wiki/Fallout_Shelter_characters (legendary and rare dweller tables)
  - https://fallout.fandom.com/wiki/Fallout_Shelter_pets
  - https://fallout.fandom.com/wiki/Fallout_Shelter_weapons
  - https://fallout.fandom.com/wiki/Fallout_Shelter_outfits
  - https://fallout.fandom.com/wiki/Fallout_Shelter_junk_items
  - https://fallout.fandom.com/wiki/Weapon_workshop
  - https://fallout.fandom.com/wiki/Outfit_workshop
  - https://fallout.fandom.com/wiki/Mister_Handy_(Fallout_Shelter)
  - https://fallout.fandom.com/wiki/Mysterious_Stranger_(character) (Fallout Shelter section)
  - https://fallout.fandom.com/wiki/Happiness_(Fallout_Shelter)
  - https://fallout.fandom.com/wiki/Living_room
  - https://fallout.fandom.com/wiki/Weight_room , /Fitness_room , /Lounge , /Game_room
  - https://fallout.fandom.com/wiki/Fallout_Shelter_rooms
  - https://fallout.fandom.com/wiki/Rushing
  - https://fallout.fandom.com/wiki/Incident
  - https://fallout.fandom.com/wiki/Radio_studio
  - https://fallout.fandom.com/wiki/Stimpak_(Fallout_Shelter) , /RadAway_(Fallout_Shelter) , /Radiation
  - https://fallout.fandom.com/wiki/Lunchbox_(Fallout_Shelter)
  - https://fallout.fandom.com/wiki/Bottle_cap_(Fallout_Shelter)
  - https://fallout.fandom.com/wiki/Nuka-Cola_Quantum_(Fallout_Shelter)
  - https://fallout.fandom.com/wiki/Survival_mode_(Fallout_Shelter)
  - https://fallout.fandom.com/wiki/Experience_Points , /Level
- The Fallout Shelter FAQ by therabidsquirel (r/foshelter community, with data-mines by Lasercar): https://github.com/therabidsquirel/The-Fallout-Shelter-FAQ/wiki
  - Sections 1 (version changes), 2 (SPECIAL), 3 (rooms, rush formula, luck caps, radio), 4 (happiness and health), 5 (breeding formulas), 6 (incidents and death), 7 (weapons and outfits), 8 (pets), 9 (junk, recipes, scrapping), 10 (wasteland), 12 (Mr. Handy and Snip Snip), 20 (quests)
- r/foshelter posts referenced by the FAQ: "Everything health" https://www.reddit.com/r/foshelter/comments/4c4m46/everything_health/ ; SPECIAL inheritance https://www.reddit.com/r/foshelter/comments/3jdiao/special_inheritance_and_super_children_vaulttec/ ; strength and damage test https://www.reddit.com/r/foshelter/comments/8lyinz/testing_for_strength_and_damage/
- Steam discussions: revive cost "never more than 1000" https://steamcommunity.com/app/588430/discussions/0/135514800409861648 ; leveling and endurance https://steamcommunity.com/app/588430/discussions/0/1327844097117092414/ ; rush percentages https://steamcommunity.com/app/588430/discussions/0/760680362677604909/
- GameFAQs (search snippets only; page blocked with 403): revive costs https://gamefaqs.gamespot.com/boards/168521-fallout-shelter/72343906 ; rush notes https://gamefaqs.gamespot.com/boards/168521-fallout-shelter/72047443

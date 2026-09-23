# Fallout Shelter: Threats, Incidents, Exploration, Quests and Rewards

Research notes for a remake. Covers incidents, the vault door, Normal vs Survival, wasteland exploration, quests and quest combat, enemies, objectives, lunchboxes, pets, Mr. Handy and Nuka-Cola Quantum.

**Where the numbers come from, and how much to trust them**
- **[DM] = datamined.** A user named Lasercar pulled these from the game code with AssetRipper (GitHub FAQ issue #7). the_rabidsquirel then organised them in the r/foshelter FAQ and the "The Wasteland Detailed" post. These are the most reliable numbers here.
- **[T] = community testing.** Measured by players (reddit / FAQ). Reliable on direction, but the exact values are approximate.
- **[W] = Fallout Wiki (Fandom).** Often not sourced. Where it disagrees with DM, trust DM.
- **Game versions.** There are two live branches. Steam, Android and iOS are on "2.x" (the FAQ reports 2.4.0; Fandom reports 2.6.0 in Sep 2026). The FAQ calls the mobile-exclusive content updates 1.15–1.18 and the seasons era 2.0+. Consoles and the Microsoft Store are frozen at **1.13**. Some wasteland tables differ between the branches, and where they do this doc says which version a number applies to. The wasteland reddit post calls the newer branch "1.16"; treat that as the same newer branch.

---

## 1. Incidents (vault threats)

### 1.1 Incident list

| Incident | Class | Where it spawns / how it enters | Special behaviour | Loot | Notes |
|---|---|---|---|---|---|
| **Fire** | Internal | Any room | Dwellers use extinguishers. **Weapons don't matter**: each dweller adds 1 "point" of fire-fighting [DM] | none | Damages everyone in the room over time. Spreads when the room is empty. |
| **Radroach infestation** | Internal | Any room | Weakest enemy. Multiplies into adjacent rooms. | none | |
| **Mole rat attack** | Internal | Only rooms **directly touching dirt** (not the dirt above the build area; elevators block it) | Drains **power** while active. Spreads like roaches (burrows back into its hole, then into the target room). | none | You can make a vault "mole-rat proof" by layout. |
| **Radscorpion attack** | Internal | Random room | **Does not multiply.** After a timer it **teleports** (burrows) to a random room, *even while being fought*. Deals physical + radiation damage. Drains power (Fandom: about 1,000 power over 2 min, then stops; about 40–50% on PS4). Never enters the vault-door room. | none | Leaves after an extended time if not killed [W]. Hardest internal incident. |
| **Raider attack** | External | Break in through the vault door | Usually 3 raiders; more if you have lots of caps [W]. They steal resources (the bars flash red), and stronger raiders steal **caps**. On new vaults they carry only raider knives, with better weapons at higher tiers. | Corpses give caps, a recipe, a weapon or an outfit | **Won't spawn if you have never sent a dweller to the wasteland** [W] |
| **Feral ghoul attack** | External | Vault door | Big packs. Physical + **radiation** damage. | Bodies vanish, no loot | |
| **Deathclaw attack** | External | Vault door, which falls almost instantly | Strongest threat. **Smashes through elevator-shaft floors** to go down rather than using elevators. | No loot, XP only | Chance rises with door opens / radio calls (see 1.4) |
| **Alien attack** | External | Vault door | Individually weaker than raiders, but in larger numbers | Lootable | 2.x branch only |
| **Securitron attack** | External | Vault door | — | Wreckage not lootable | 2.x only, per Fandom main page. **Low confidence**: the FAQ doesn't mention it. |
| Gunners | — | — | **Not an incident type.** No source lists Gunners as vault attackers. | — | Don't include them. |

Common rules [W][T]:
- While any incident is active you **can't rush or upgrade rooms**, and you can't start quests.
- Dwellers in the room stop working. **Pregnant dwellers and children flee.** Unarmed dwellers sometimes flee too.
- Dragging dwellers in during an incident is a **temporary** assignment; they return to their jobs when it ends.
- External attackers fight each room for "several seconds", then move on. They prefer rooms on the same floor before going down. Invaders wait in a room for a Mr. Handy to catch up.
- Mole rats and roaches only spread when a room is empty (see 1.3).
- Incidents also trigger when you come back to the game (see the timer, 1.4).

### 1.2 Population thresholds [DM], normal vs survival

The game checks `population > threshold`. The table lists the **first population at which the incident can occur**. Internal incidents can appear 1 population earlier, but only from a failed rush. External incidents **cannot** come from a failed rush.

| Incident | Normal (natural) | Normal (failed rush) | Survival (natural) | Survival (failed rush) |
|---|---|---|---|---|
| Fire | 2 | 1 | 2 | 1 |
| Radroaches | 9 | 8 | 6 | 5 |
| Mole rats | 31 | 30 | 21 | 20 |
| Radscorpions | 51 | 50 | 51 | 50 |
| Raiders | 14 | — | 16 | — |
| Aliens (2.x) | 26 | — | ? | — |
| Feral ghouls | 41 | — | 41 | — |
| Deathclaws | 61 | — | 36 | — |

Conflicts: Fandom rounds these to "Raiders 14+, Ghouls 40+, Radscorpions 50+ (45 survival), Deathclaws 60+ (35/36 survival)". An old 2016 reddit crowd post put raiders at about 16 and roaches at about 10–11. **Use the DM table.** Thresholds are not "unlocked" permanently: dropping back below one removes that incident from the pool, though the pool may take a while to update.

### 1.3 How incidents spread [T]

- An incident **only spreads once its room is empty**: it started empty, you moved everyone out, or everyone died. After a short delay in an empty room it spreads, and the source room is then done with that incident.
- An incident **never re-enters a room it already visited**, so every incident eventually burns out.
- **Left/right:** it checks the neighbour on each side. A room gets infected. Dirt stops spread on that side. An elevator passes the check through to the next tile in the same direction, so it chains across elevators.
- **Up/down:** it takes the **leftmost** room touching that side. An elevator passes the check vertically. If an elevator leads to dirt, the check moves one tile right and tries again.
- One room is infected per side, so up to 4 new rooms per spread. The vault-door area counts as a room for blocking but **can't be infected**. Incidents can't spawn in elevators.
- **Radscorpions are the exception.** They teleport to a random room on a timer, and don't spread.

### 1.4 Frequency and triggers

| Trigger | Mechanic |
|---|---|
| **Background incident timer** [T] | A hidden timer ticks. The longer since the last incident, the higher the chance, until an incident is guaranteed. It keeps ticking while the game is tabbed out or a full-screen UI is open (crafting, explorer screen, storage, Survival Guide), but incidents can't fire then, so one triggers **immediately when you return**. A **failed rush resets the timer**. The known exploit is a small level-1 room you deliberately rush-fail to get easy incidents. |
| **Rush failure** [T] | See the formula below. Failure spawns an internal incident (fire, roach, mole rat or radscorpion) in **that room**. |
| **Deathclaw meter** [DM] | A hidden value starts at 0. **+0.05 per vault-door open by a dweller or Mr. Handy** (Bottle & Cappy don't count). A radio-room call adds more: single L1/2/3 = 0.07/0.09/0.11, double 0.08/0.10/0.12, triple 0.13/0.16/0.20. After each increment it rolls `rand(0,1) < value`; on success it triggers a deathclaw attack and resets the value to 0. Capped at 0.8. Explains the folklore "attacks right after sending an explorer out". (Testing suggests back-to-back door opens may count once.) |
| **Survival** | "Incidents occur **much** more frequently." The multiplier is not published; a remake needs a guess (e.g. timer ×0.5). |

**Rush failure formula** (since v1.5) [T/DM]:
`fail% = 40 − 1.5 × (avg room-SPECIAL + avg Luck)`, **floor 10%**, then **+10% for each recent rush**, up to 6 stacked. It decays over "a moderate length of time". Averages include outfits. Success gives +10% happiness over about 30 s; failure gives −10%. The room timer resets either way. The 0% failure cap was removed in a later version. Older alternate formula: `40 − 2×(L+S) + 10×recent`.

### 1.5 Difficulty scaling [T]

- **Average dweller level (ADL) matters most**, for both internal and external incidents. Then **room level**, then **room width**. For external incidents, ADL seems to be the only factor.
- Incident HP is a random range that widens with difficulty.
- Measured mole-rat damage per dweller (644 HP test dwellers, unarmed, SPECIAL 1):

| Room | ADL 1 | ADL 50 |
|---|---|---|
| L1 single | 10–12 | 185–289 |
| L1 triple | 15–22 | 332–519 |
| L3 single | 50–66 | 913–1449 |
| L3 triple | 60–144 | 1445–2535 |

- **Survival:** all enemies hit harder, and incidents are more frequent and stronger.

### 1.6 How vault combat works [T/DM]

- It is **not** real per-hit combat. Each side's damage is **summed and applied as damage-over-time** to the other side. The incident has an HP pool, and the incident ends when that pool reaches 0. Running and shooting animations are cosmetic.
- A dweller's contribution depends **only on the weapon's damage + pet damage bonus**. SPECIAL does **not** affect vault combat. Outfits give **no armor**. How much damage a dweller can take depends on their HP.
- A dweller only starts contributing (and taking damage) once they reach their battle spot. Deep rooms like the reactor make this slower.
- Any pet adds +2/+4/+6 damage (common/rare/legendary) in the vault and on quests, on top of a damage pet's own bonus. Damage-resist, health, XP and objective pets also apply.
- Dweller HP: base **105** at level 1. Each level-up adds `2.5 + 0.5 × END`, where END includes the outfit **at the moment of level-up**. It is not retroactive. Level 50 totals: END 1 = 252, END 10 = 472.5, END 15 = 595, END 17 = 644 (the maximum).
- Stimpak heals **50% of max HP**. RadAway removes **50% of max HP worth of rads**. Rads reduce the effective maximum (shown as the red part of the bar). Low food regenerates slowly.
- **Mr. Handy / Snip Snip in incidents** [DM] (damage dealt / damage taken multipliers):

| Incident | Handy dealt | Handy taken | Snip Snip dealt | Snip Snip taken |
|---|---|---|---|---|
| Fire | 1 (= 1 dweller) | 2.76 | 1.5 | 1.85 |
| Radroaches | 1 | 0.38 | 1.5 | 0.25 |
| Mole rats | 3 | 4.14 | 4.5 | 2.77 |
| Radscorpions | 3 | 5 | 4.5 | 3.35 |
| Raiders / Aliens | 2 | 3.25 | 3 | 2.18 |
| Feral ghouls | 2 | 4 | 3 | 2.68 |
| Deathclaws | 3 | 6.5 | 4.5 | 6.5 |

- Death in Normal: revive cost = **100 caps at level 1, rising 20 caps per level, capped at 1,000** (so level 10 = 280). The formula `100 + 20×(L−1)` gives 1,080 at level 50, so the 1,000 cap applies from about level 46 [T]. A revive heals fully except for existing rads and keeps happiness. Other dwellers lose happiness while a corpse is in their room. If you remove the dead dweller instead, their gear goes to storage.

## 2. Vault door

| Item | Value |
|---|---|
| Capacity | 2 guard dwellers. They gain XP only from fights, not from time spent there. |
| Upgrades | Level 1 → 2: **500 caps**. Level 2 → 3: **2,000 caps** [W]. Names: Vault Door → "advanced" (L2) → "fortified" (L3). |
| Effect | Only **delays the break-in**. Stronger enemies break it faster. |
| Break-in times | Anecdotal [T]: a deathclaw takes about 0–3 s against an L1/L2 door and about **10–12 s** against L3. Raiders take noticeably longer. **Actual door HP values were not found in any source.** A remake must invent them (e.g. L1/L2/L3 HP scaled so raiders take about 5/10/15 s). |
| Radscorpions | Never enter the door room, so dwellers there are safe from them. |
| Infection | The door room can't be infected by internal incidents. |

## 3. Normal vs Survival

| Aspect | Normal | Survival |
|---|---|---|
| Selection | Default | Checkbox at vault creation, with two warnings. Can't be changed later. Marked with a radiation "S" icon. |
| Death | Revive for 100–1,000 caps (also possible in the wasteland and on quests) | **Permadeath** everywhere: vault, wasteland, quests. Mr. Handy can still be repaired (2,000 caps). |
| Resources | Normal drain | **Faster drain** |
| Incidents | Normal | **More damage, much more frequent** |
| Thresholds | Deathclaw 61, Mole rat 31, Roach 9, Raider 14 | **Deathclaw 36**, Mole rat 21, Roach 6, Raider 16 (radscorp and ghoul unchanged) |
| Exploration | Base difficulty table | Most enemy and location difficulties about **+30–50%**, failure damage about ×1.5, event time windows ×2. **Junk events are easier and earlier**, so there is *more* legendary junk. |
| Quests | Normal | Harder |
| Objectives | Normal | Harder, with better rewards |
| Pets | Nice to have | Important: if an explorer or quest team dies, a pet brings back all their gear and loot |

Community survival strategy: stay at 35 or fewer dwellers (below the deathclaw threshold) until you have the fitness room. Keep rooms at level 1. Don't level low-END dwellers. Use a rush-fail room to control incidents.

## 4. Wasteland exploration

### 4.1 Basics

| Rule | Value |
|---|---|
| How | Drag a dweller out of the vault door, or use the explorer UI. Equip them with **up to 25 Stimpaks and 25 RadAway** from vault stock. |
| Limits | **25 explorers** + **5 Mr. Handy** + **3 quest teams**, each limit independent |
| Duration | Unlimited, until recalled, dead, or full. With good gear and stats a run lasts about **2–5 days** real time. |
| Carry limit | **100 items** (weapons, outfits, junk). The explorer then auto-returns. Recipes, lunchboxes, pet carriers, Quantum and caps **don't count**. |
| Return time | **Half the time spent out** (12 h out → 6 h back). Return-speed pets: ×1.25 / ×2 / ×3 / ×4. Skip with Quantum at 1 per 2 h. |
| Auto-heal | A Stimpak is used automatically at **≤50% HP**. RadAway is used automatically when **rads reach 50% of HP**. (Quests are manual.) |
| Offline | Everything is simulated on load from timestamps. Absences over about 24 days can bug and generate late-game events. |
| Level-ups | Dwellers level up in the field, and each level-up **refills HP**. |
| Death (Normal) | Revive with caps and keep going. If you don't revive, gear and loot are lost **unless a pet is equipped**, in which case the pet brings everything home. |
| Ad bonus (2.x mobile) | Watching an ad advances one explorer by 30 min, forcing an item drop. |

### 4.2 How SPECIAL affects exploration

| Stat | Effect in the wasteland |
|---|---|
| **S** | Used in success checks for some events (yao guai, ants, super mutants, Hubris Comics...) |
| **P** | Used in checks for dog, radroach and Mirelurk-hunter events and Gwinnett Brewery. Does **not** increase random-quest discovery (a myth). |
| **E** | **Most important.** HP from level-ups. **Wasteland radiation resistance: immune at END 11+** (wasteland only, not quests). Used in checks for radscorpion, mirelurk and behemoth events and the legendary-junk "Caravan Merchant" event. |
| **C** | Used in checks for NPC and location events (Merchant, Brotherhood Patrol, Goodneighbor) and the legendary-junk "Dark Cave" event |
| **I** | Used in checks for Sealed Room, Robot Factory, fire ant soldier and Broadcasting Tower |
| **A** | Used in checks for ghoul, centaur and raider events. On random quests it raises attack rate. |
| **L** | **Caps found scale linearly with Luck.** Used in checks for deathclaw events and the legendary-junk "Wide Open Field" event. Does **not** raise loot quality. |

### 4.3 Event system [DM]

Event cadence while exploring:
- **Random caps** finds, scaled by Luck.
- A **guaranteed weapon or outfit about every 60 min**, no check involved.
- A **junk event about every 180 min**, with a check.
- **Location, NPC and enemy events** scattered in between, each with a check.
- **Recipe substitution:** a common weapon or outfit drop has a 5% chance to become a **rare recipe**. A rare drop has a 25% chance to become a **legendary recipe**. This needs a workshop of the matching level.
- **Legendary weapons and outfits can't be found while exploring** (only on high-level quests). Legendary junk and recipes can.
- Explorers auto-equip better gear. Weapons compare **max damage**, then min damage. Outfits compare **total SPECIAL**; the best found drops are about +5 (+6 on 2.x).

**Success check** (per event):
```
roll = ceil(level/2) + randInt(minDmg, maxDmg+1) + randInt(0, S-1) + randInt(0, S-1)
success if roll >= difficulty
```
S is the event's SPECIAL including outfit. Damage includes a damage pet; fists count as 1. A level-50 dweller auto-passes difficulty 26 or less, and a level-50 dweller with Dragon's Maw (22–29) auto-passes 47 or less.

- Success: reward + XP, 0 damage for most events.
- Failure: no reward, damage taken, reduced XP. For enemies, "flee": the dweller gets 10% of the XP [W].
- Damage values are small integers. Their unit is not documented and is probably scaled; **treat as relative**.

**Enemy events (v1.13, Normal; Survival in parentheses)** [DM]. Min/max = the exploration-minute window in which the enemy can appear.

| Enemy | Stat | Difficulty | Min min | Max min | Fail dmg | Success XP |
|---|---|---|---|---|---|---|
| Savage dog | P | 1 (2) | 1 | 180 | 1 (2) | 200 |
| Mole rat | A | 2 (3) | 1 | 180 | 1 (2) | 225 |
| Bloatfly | E | 4 (6) | 1 | 220 | 1 (2) | 255 |
| Radroach | P | 6 (8) | 1 | 270 | 2 (3) | 285 |
| Yao guai | S | 8 (11) | 1 | 330 | 2 (3) | 320/915 |
| Feral ghoul | A | 10 (13) | 60 | 405 | 2 (3) | 360 |
| Giant ant | I | 12 (16) | 75 | 495 | 3 (5) | 405 |
| Scavenger's dog | P | 14 (19) | 90 | 605 | 3 (5) | 455 |
| Guard dog | P | 14 (19) | 90 | 605 | 5 (8) | 815 |
| Giant worker ant | S | 16 (21) | 110 | 740 | 1–3 | 510 |
| Fire ant warrior | S | 16 (21) | 110 | 740 | 3–5 | 510/915 |
| Radscorpion | E | 18 (24) | 135 | 910 | 4 (6) | 575 |
| Giant soldier ant | S | 20 (26) | 165 | 1154 | 4 (6) | 645 |
| Fire ant soldier | I | 22 (29) | 200 | 1370 | 3–4 | 405/725 |
| Mirelurk | E | 28 (37) | 370 | 2530 | 5 (8) | 1030 |
| Feral ghoul roamer | A | 30 (39) | 455 | 3105 | 6 (9) | 1155 |
| Giant radscorpion | S | 32 (42) | 560 | 3810 | 6 (9) | 1295 |
| Mirelurk hunter | P | 34 (45) | 685 | 4675 | 6 (9) | 1455 |
| Vicious dog | P | 36 (47) | 840 | 5735 | 7 (11) | 1635 |
| Centaur | A | 38 (50) | 1030 | 7040 | 7 (11) | 1835 |
| Feral ghoul reaver | A | 40 (52) | 1265 | 8640 | 7 (11) | 2060 |
| Deathclaw | L | 42 (55) | 1550 | 10605 | 8 (12) | 2315 |
| Enclave deathclaw | L | 44 (58) | 1900 | 13015 | 8 (12) | 2600 |
| Super mutant | S | 46 (60) | 2330 | 15970 | 8 (12) | 2920 |
| Super mutant master | E | 48 (63) | 2860 | 19600 | 9 (14) | 3280 |
| Super mutant overlord | S | 50 (65) | 3510 | no limit | 9 (14) | 3685 |
| Super mutant behemoth | E | 52 (68) | 4035 | no limit | 10 (15) | 4000 |

In Survival the time windows are about ×1.5. The newer branch scrambled many of these values, apparently a bug. **For a remake, use the 1.13 table.**

**Junk events (v1.13; Survival values in parentheses are much easier and earlier)**

| Event | Reward | Stat | Diff | Window (min) |
|---|---|---|---|---|
| Convenience Store | common junk | S | 5 (2) | 1–300 |
| Raider Hideout | common | L | 10 (3) | 1–600 |
| Irradiated Lake | rare | E | 15 (6) | 60–1200 |
| Sealed Room | common | I | 20 (8) | 120–1800 |
| Large Apartment Bldg | common | P | 25 (11) | 180–2400 |
| Outpost of Survivors | rare | C | 30 (13) | 300–3000 |
| Children of Atom Camp | common | A | 35 (16) | 600–3600 |
| Old Mansion | rare | P | 40 (19) | 1200+ |
| Robot Factory | rare | I | 45 (21) | 1800+ |
| **Dark Cave** | **legendary** | C | 50 (24) | 2400+ (Surv 203+) |
| **Caravan Merchant** | **legendary** | E | 55 (26) | 3000+ (Surv 248+) |
| **Wide Open Field** | **legendary** | L | 60 (29) | 3600+ (Surv 300+) |

**Location events** (one-time per trip, 10% item chance on success): Broadcasting Tower (I, 2), Raiders (A, 3), Abandoned Shack (L, 4), Refrigerator (S, 5), Goodneighbor (C, 15, junk), Safe (A, 6), C.I.T. Ruins (I, 20), Super Duper Mart (A, 8), Museum of Witchcraft (L, 25), Escaped Slaves (C, 10, rare outfit), Weston Water Treatment (E, 30, rare junk), Slave Camp, Gas Station, Hubris Comics (S, 40), Diner (S, 20, rare weapon), Gwinnett Brewery (P, 55, legendary junk, from 3384 min), National Guard Depot (E, 25, rare weapon, from 3600 min).

**NPC events** (caps + XP, one-time): Fugitive Slave 25 caps (P, 3), Wounded Sheriff 30 (I), Ghoul 40 (E), Merchant 50 (C), Talon Company Mercs 65 (I), Hunter 80 (A), Drunken Drifter 100 (L), Brotherhood Patrol 125 (C, from 1200 min), Lost Farmer 155 (E), Mister Handy 195 (P, from 4500 min).

### 4.4 Random encounters (explorable locations during exploration) [DM/T]

- These only happen once the **Overseer's Office** is built. They are detected in real time, so the game must be open.
- Every **60 s** of in-game time the game rolls for one. The chance grows with the number of explorers out (about +2% each, diminishing, **max 20% at 21 explorers**). There is a **20-min cooldown**.
- A notification appears top-left and you choose explore or ignore. The encounter then plays exactly like a quest: 1–3 rooms, real-time combat with a solo dweller.
- Each has **5 difficulty/loot variants by explorer level**: 1–11, 12–22, 23–33, 34–44, 45–50.
- Base locations: **Red Rocket, Super-Duper Mart, Abandoned Cabin**, with more added in 1.7 and 2.x. Examples:

| Encounter | Location | Enemies | Notable reward |
|---|---|---|---|
| Pest Control | Red Rocket | Radroaches | 250–1500 caps + rare/legendary junk |
| Pit Stop | Red Rocket | Deathclaw / radscorpion / ghoul | 5–25 Stimpaks + RadAway + recipe |
| Misery Loathes Company | Red Rocket | Raider boss | 2 rare items |
| A Cry for Help | Red Rocket | none | random (rare) dweller |
| Gas 'N Go | Red Rocket | Raider | 2 Quantum |
| Crossing Paths | Super-Duper Mart | 2 Deathclaws + Alpha | **Mr. Handy** |
| One Ghoul Customer | Super-Duper Mart | Ghouls | 2 Quantum + recipe |
| Clean-Up on Aisle Five | Super-Duper Mart | Raider boss | 120–980 caps, 2 Quantum |
| Pest-Case Scenario | Super-Duper Mart | Mole rat brood mother | items/junk |
| Food Fight! / Get in Line | Super-Duper Mart | Raiders | lunchbox |
| Uninvited Guests | Cabin | Raiders | **pet carrier** |
| Family Matters | Cabin | Ghouls | up to 3 legendary junk |
| Anybody Home? | Cabin | Deathclaw / mole rat | rare items |
| Wasteland Getaway | Cabin | Roaches / mole rats | common item, 4 Stimpaks, 164 caps |

### 4.5 Journal / log text (for flavour)

The explorer UI shows a timestamped ticker covering finds, enemies (encounter / win / retreat lines), locations and musings. Verbatim examples:
- Musing: "My kingdom for a bicycle." "Gunshots to the south. I guess I'll go north." "I'd really like to sleep in my own bed tonight." "The longer I'm out here the more danger I'm in."
- Journal: "Explorer's journal. New entry. Squirrel tastes much better than you'd think." "...So many skeletons. The world is a grave." "...Giant ants are indeed Giant ants." "...Most dogs no longer man's best friend."
- Junk-event chain: "Stumbled across a Sealed Room in a house basement" → "Hacking a terminal to get the door open." → "I found the password. Looks like there's a Workshop inside."
- Enemy lines: "Spotted a deadly Deathclaw." / "How can I possibly survive against this Deathclaw?!" / retreat: "Fighting a Deathclaw? I must have been out of my mind! I've got to run!" Enclave deathclaw retreat: "The Enclave Deathclaw is trained to kill anything in its path! I have to run!" Win: "It was a nasty fight but the Feral Ghoul Reaver is dead."
- Pattern per enemy: 1–2 encounter lines (the verb is randomised: "Saw", "Spotted", "Observed"), 1 win line, 1 retreat line.
- Vault barks for rush failure, low HP and rads: "Oh no! Critical production failure!", "Anyone got a Stimpak?", "Is my nose bleeding?"

### 4.6 Mr. Handy exploring

Finds **caps only**, takes no damage and avoids fights. Returns automatically at **5,000 caps**, which takes about 2.5–5 days, plus half that time to return. Up to 5 can explore at once.

## 5. Quests (Overseer's Office, added in **Update 1.6**)

Not in 1.4: 1.4 added pets and 1.6 added quests and Quantum.

| Rule | Value |
|---|---|
| Unlock | Population **18**. Office costs **1,000 caps**. Fixed 2-wide room with no workers (incidents can still spread into it). Only one per vault. Can be destroyed or moved without affecting active quests. |
| Upgrades | L2: 3,500 caps (needs 30 pop), 2 concurrent quests. L3: 15,000 caps (needs 55 pop), 3 concurrent quests. |
| Party | **1–3 dwellers**. Some quests cap the party at 1 or 2. Max 25 Stimpaks + 25 RadAway each; more can be looted. |
| Requirements (apply to every member) | Min level; **max weapon damage ≥ X**; specific weapon or outfit type (variants OK); SPECIAL ≥ N; party size cap |
| Travel | A fixed travel time out. The return trip also takes time (return pets apply to the whole team; the highest one counts). Skip with Quantum. |
| On site | A side-scrolling map of rooms connected by elevators, one to three rooms wide. You tap rooms to move. Rooms hold enemies, loot (shiny containers, corpses) and dialogue choices. Layouts are **randomly generated per attempt**. |
| Fail / give up | If everyone dies or you give up, all loot is lost. You can pay to revive everyone and retry from the start, with a small retry fee of up to about 1,000. If only some members die, revive them after the quest; there are no other penalties. Survival: permadeath. |
| Rewards | Carried home. Boxes, Quantum and dwellers appear on collection. The listed reward usually has to be looted in the objective room. |
| Blocked | Can't start while a vault incident is active |
| Visibility | Many quests only appear once the **average dweller level** is high enough |
| Skipping | Daily, weekly and "blue" single quests: 1 Quantum, rising for more skips the same day |
| Quest clues | Very rare drop that unlocks one of 5 hidden quests (Factory Floor of Fear, Mystery of Vault 666, Vault 789, Welcome to Paradise, With Friends Like These). One is guaranteed at the end of Horsemen of the Post-Apocalypse. |

**Quest types**
- **Single-stage "blue"** quests, a large pool. Examples: "Getting Started" (tutorial: kill a glowing radroach; 15 Quantum + lunchbox), "Hostage Negotiations" (L12, 6+ DAM), "A Gathering of Ghouls" (L27, 12+ DAM), "Against the Odds" (L46, solo).
- **Daily** quests rotate each day, e.g. "Extreme Outerference" (L50, legendary blueprint).
- **Weekly** quests rotate each week, e.g. "Game Show Gauntlet" (trivia; a wrong answer starts a fight) and "Brotherhood of Feels".
- **Multi-stage questlines:** A Settler Needs Your Help (Preston Garvey), Horsemen of the Post-Apocalypse 1–3, Secret Agent Person, Journey to the Center of Vaultopolis, The Search for Jobinson's Jersey!, A Wasteland Tail, Echoes of Steel, The Thrill of the Hunt, Zines from the Commonwealth, The Great Tato Famine, Detective Case Files, Climbing the Ranks, Almost Human, The Wizard of Water, Food Glowrious Food, Searching in the Dark and Power Struggle (1.15+ / 2.x).
- **Limited-time holiday** quests: Valentine's, St Patrick's, Easter, Labor Day, NFL, Halloween, Thanksgiving and Christmas. Examples: "Vault-Tec Saves Christmas!", "The Mystery of Vault 31".
- **Dialogue choices:** pick a reward (weapon, outfit or meds), fight or befriend, or answer trivia.

### 5.1 Real-time quest combat [T/DM]

- Each dweller attacks **one target** at a set interval. The **interval shortens with Agility**, and damage comes from the weapon plus pet. Enemies spread themselves across dwellers (e.g. 5 enemies vs 3 dwellers split 2-2-1) and re-balance as enemies die.
- You **retarget** by dragging a dweller onto an enemy, or tapping the dweller then the enemy. Stimpaks and RadAway are applied **manually**.
- **Crit minigame:** each dweller has a hidden crit meter that **fills faster with Luck** (Agility doesn't affect it). When full, a yellow check-mark icon appears over that dweller's target. Tap it and time freezes: arrows or rings converge on the target, and tapping closer to the centre gives up to **×5 damage**. **Perception slows the arrows.** The crit goes to that target only and is followed by a normal attack. **Crits can be banked indefinitely** within a quest, carrying across fights, until you use them.
- **Weapon behaviour types:**
  - **Single-shot:** one damage chunk per interval.
  - **Melee:** single-shot, but only one melee dweller can engage an enemy, and that enemy is forced to attack the melee dweller, which works as a taunt.
  - **Multi-shot** (miniguns, gatling lasers, Power Fist): damage split over several shots, and it retargets when the target dies.
  - **AOE** (missile launcher, Fat Man): damage split across *all* enemies. The crit part is single-target.
- **Bosses** show a skull by their HP bar. Special attacks:
  - Glowing radroach: summons 1–4 roaches.
  - Mole rat brood mother: summons 1–2 mole rats.
  - Glowing One: radiation burst on the whole party and heals ghouls.
  - Glowing radscorpion / big deathclaw: a telegraphed orange-glow wind-up, then a massive hit that can one-shot dwellers under about E13.
  - Raider boss: grenade, AOE split across the party.
  - Alpha deathclaw: buffs other deathclaws.
- The fight only starts once all party members are in the room.
- Other quest enemies: raiders, Gunner-style mercs ("Psycho 77" gang), super mutants, ghouls, ants, mirelurks, protectrons, eyebots, aliens and synths (1.15 / 2.x).

## 6. Enemy roster summary

| Family | Vault incident | Wasteland text event | Quest (visible) | Boss variant |
|---|---|---|---|---|
| Radroach | yes | yes | yes | Glowing radroach |
| Mole rat | yes | yes | yes | Brood mother |
| Radscorpion | yes | yes (+ giant) | yes | Glowing radscorpion |
| Feral ghoul (roamer, reaver) | yes | yes | yes | Glowing One |
| Deathclaw (Enclave) | yes | yes | yes | Alpha deathclaw |
| Raider | yes | location event | yes | Raider boss (face paint) |
| Alien | yes (2.x) | — | yes | ? |
| Securitron | yes (2.x, low confidence) | — | ? | ? |
| Dogs (savage, scavenger's, guard, vicious) | — | yes | yes | — |
| Bloatfly, yao guai, giant ants, fire ants, mirelurk (hunter), centaur, super mutants (master/overlord/behemoth) | — | yes | some | — |
| Protectron, eyebot | — | — | yes (1.15+) | ? |

## 7. Objectives

- **3 active objectives** at a time. **One free skip per day** (red X). Further skips cost Quantum (blue X) at **2, 3, 5, 8, 12, 18, 27, 41, 62** (each about ×1.5, capped at 62), and the cost resets with the next free skip. A completed or skipped objective is replaced by a new one.
- Rewards (from about 530 listed objectives): **caps** (about 60%, 25–5,280), **lunchbox** (about 20%), **pet carrier** (about 6%), **Mr. Handy** (about 3%), **Quantum** (about 3%), and some "X or Y" choices.
- Rewards scale with the requirement, e.g. "Assign 2 dwellers in the right room" = 25 caps, "Collect 32000 caps" = Mr. Handy.
- Progress only counts while the objective is active. Explorers who were already out before an objective arrived don't count towards "explore for X hours".
- Objective-completion pets multiply the dweller's contribution ×2 or ×3, and apply to the whole room.

| Category (count of listed variants) | Examples → reward |
|---|---|
| Collect X (171): caps, caps in wasteland, food, water, power, stimpaks, outfits, weapons, junk, from quest containers | Collect 50 food → 25 caps; Collect 9200 food → lunchbox; Collect 55000 caps in the Wasteland → 4000 caps; Collect from 105 containers on quests → pet carrier |
| Equip X dwellers with weapon/outfit (39) | Equip 50 with a weapon → lunchbox |
| Kill X (38): creatures in wasteland; roaches/mole rats/deathclaws *without a weapon* | Kill 8 deathclaws without a weapon → lunchbox |
| Sell X items (33) | Sell 3 → 100 caps |
| Have X (32): bald dwellers, pregnant dwellers, couples dancing, dwellers at 100% happiness | Have 5 bald dwellers → 350 caps or lunchbox |
| Raise SPECIAL / happiness (32) | Raise any SPECIAL of 7 dwellers → 75 caps |
| Successfully extinguish fires / rush rooms (29) | Rush 53 rooms → 1900 caps |
| Craft (22), Stop X incidents (17), Survive X attacks without casualties (17) | Stop 16 incidents → lunchbox; Survive 8 mole rat attacks → pet carrier or lunchbox |
| Assign to the right room (12), Send X to wasteland (10), Perform X perfect crits (10), Deliver babies, Level up, Make friends in wasteland, Complete quests, Find the Mysterious Stranger, Scrap, Explore locations, Merge rooms, Upgrade rooms, Win X, Customize | Perform 10 perfect criticals → 2200 caps; Explore 20 locations → Mr. Handy |

## 8. Lunchboxes, pet carriers, Mr. Handy boxes, Quantum

### 8.1 Lunchbox (5 cards)

The first four cards come in random order; the 5th is the "rare" card.

| Card | Contents / odds (Fandom) |
|---|---|
| Caps card | 100 caps (common) or 500 caps (rare). Fandom lists "Caps 100%". |
| Item card | Common weapon 38.8%, rare weapon 7.9%, **legendary weapon 1.3%**, common armor 42.1%, rare armor 5.3%, **legendary armor 1.7%**, common pet 2.3%, rare pet 0.5%, legendary pet 0.1% |
| Resource card | Water 18.1%, Food 18.2%, Power 18.3% (50 each), Stimpak 18.2%, RadAway 18.4% (1 each), **Nuka-Cola Quantum 8.8%** (2–6) |
| Junk card | Common 21.5%, rare 46.4%, legendary 32.1% |
| **Rare card** (guaranteed rare or better) | 500 caps 32.5%, **rare dweller 21.2%, legendary dweller 3.8%**, rare weapon 13.3%, **legendary weapon 7.3%**, rare armor 12.27%, **legendary armor 8.2%**, common pet 0.03%, rare pet 0.9%, legendary pet 0.3%, **Mr. Handy 0.2%** |

- Overall chance of at least one legendary card (weapon, outfit, dweller or pet) per box: roughly 1 − (1−0.031)(1−0.198) ≈ **22%**. Legendary junk (32%) comes on top of that. This is derived from the table above, not an official figure.
- The in-game text says: "guaranteed to either have a dweller or a rare item and a guaranteed junk". 500 caps counts as the "rare" item.
- Sources: objectives, quests, random-encounter corpses, the day-7 login reward (always a lunchbox), and the store.
- Store prices: 1 = $0.99, 5 = $3.99, 15 = $9.99, 40 = $19.99.
- A lunchbox can't contain a lunchbox.
- Card rarity is shown by the card back: bronze/common, silver/rare, gold/legendary. Quantum cards are purple.

### 8.2 Pet carrier and Mr. Handy box

- **Pet carrier:** a single card holding one pet of common, rare or legendary rarity. Sources: objectives, quests (e.g. "Captured Critter"), the "Uninvited Guests" encounter, and the store.
- **Mr. Handy box:** a single card, priced like a 5-card lunchbox ($0.99 for 1, $3.99 for 5). On 2.x it gives **Mr. Handy 92% / Snip Snip 8%**. Also an objective reward.
- **Mr. Handy:** one per floor. Collects resources and fights incidents on its floor. Can't be healed; repair costs **2,000 caps** (also in Survival). Explodes when destroyed. Can explore for caps (see 4.6).
- **Pets** (added in 1.4): one per dweller. Types are cats, dogs and parrots. Bonus ranges by common / rare / legendary:

| Pet bonus | Common | Rare | Legendary |
|---|---|---|---|
| Damage | +2 | +4 | +6 |
| Damage resistance | +20–24% | +36–40% | +46–50% |
| Health (max HP) | +25–33% | +58–66% | +91–100% |
| Healing / Rad-healing speed | ×2 | ×3 | ×4 |
| Wasteland return speed | ×1.25–2 | ×2–3 | ×4 |
| Wasteland caps | +6–15% | +21–30% | +36–50% |
| Wasteland junk | +25–33% | +58–66% | +91–100% |
| Wasteland weapons & outfits | +6–10% | +16–20% | +26–30% |
| XP | +6–15% | +21–30% | +36–45% |
| Objective completion | — | ×2 | ×2 / ×3 |
| Stranger chance | ×2.5 | ×5 | ×7.5 |
| Crafting time / cost | −6–15% | −16–30% | −26–45% |
| Training time, happiness, twins chance, child SPECIAL | various | | |

- Wasteland junk and weapon/outfit pets work as a chance to find a *second* copy of the same tier.
- Pets are **indestructible**. If the owner dies outside the vault, the pet returns with all their gear and loot.
- Bonuses don't stack within an area of effect; the highest one wins.

### 8.3 Nuka-Cola Quantum (added in 1.6)

| Use | Cost |
|---|---|
| Skip wasteland return, quest travel, crafting, training, barbershop | **1 per 2 h** (any part of a 2-h block rounds up) |
| Skip an objective (after the free daily skip) | 2, 3, 5, 8, 12, 18, 27, 41, 62 |
| Skip a daily, weekly or blue quest | 1 (rising for more skips the same day) |
| Complete a theme recipe | 3 per missing fragment (9 fragments, so up to 27) |
| Season pass ranks (2.x) | varies |

- Sources: lunchbox resource card (2–6, 8.8%), quests (the tutorial gives 15), random encounters (usually 2), wasteland, Bottle & Cappy (1/2/3/5), and objectives.
- Store: 6 = $0.99, 32 = $4.99, 70 = $9.99, 150 = $19.99, 400 = $49.99, 1000 = $99.99 (the 1000 pack plays a delivery-truck animation). The starter pack includes 10.

## 9. Design takeaways for a remake

1. Build incidents as **two HP pools trading DPS**: the incident pool against the room's summed dweller weapon damage plus pet damage. Incident HP and DPS scale with ADL (strongest), room level and room width, times a survival multiplier.
2. Spread only from **empty rooms**, one room per side, never revisiting a room. Radscorpions teleport on a timer instead.
3. Drive incidents with a **hidden timer**, the **rush formula** `max(10, 40 − 1.5(S̄+L̄)) + 10×recent(≤6)`, and the **deathclaw meter** (+0.05 per door open, cap 0.8).
4. Simulate exploration **offline from timestamps**. Use a 60-min guaranteed item, 180-min junk, and time-windowed events that each have a SPECIAL check `ceil(lvl/2)+dmg+2×rand(0,S−1)`. Return takes half the elapsed time, with a 100-item cap and auto-heal at 50%.
5. Keep door HP, the survival incident-frequency multiplier and the exact caps-per-Luck rate as **tunable unknowns**. No source gives them.

---

## Sources

- Fallout Wiki (Fandom), read through the MediaWiki API because direct page loads were blocked:
  - https://fallout.fandom.com/wiki/Incident
  - https://fallout.fandom.com/wiki/Fallout_Shelter (Wasteland, Incidents, Lunchboxes, Quests sections)
  - https://fallout.fandom.com/wiki/Survival_mode_(Fallout_Shelter)
  - https://fallout.fandom.com/wiki/Vault_door_(Fallout_Shelter)
  - https://fallout.fandom.com/wiki/Rushing
  - https://fallout.fandom.com/wiki/Fallout_Shelter_creatures
  - https://fallout.fandom.com/wiki/Raider_(Fallout_Shelter), .../Deathclaw_(Fallout_Shelter), .../Mole_rat_(Fallout_Shelter), .../Radroach_(Fallout_Shelter), .../Radscorpion_(Fallout_Shelter), .../Feral_ghoul_(Fallout_Shelter)
  - https://fallout.fandom.com/wiki/Stimpak_(Fallout_Shelter), https://fallout.fandom.com/wiki/RadAway_(Fallout_Shelter)
  - https://fallout.fandom.com/wiki/Fallout_Shelter_quests
  - https://fallout.fandom.com/wiki/Fallout_Shelter_random_encounters
  - https://fallout.fandom.com/wiki/Fallout_Shelter_locations
  - https://fallout.fandom.com/wiki/Overseer%27s_office
  - https://fallout.fandom.com/wiki/Fallout_Shelter_objectives
  - https://fallout.fandom.com/wiki/Lunchbox_(Fallout_Shelter)
  - https://fallout.fandom.com/wiki/Fallout_Shelter_pets (pet carrier)
  - https://fallout.fandom.com/wiki/Mister_Handy_(Fallout_Shelter)
  - https://fallout.fandom.com/wiki/Nuka-Cola_Quantum_(Fallout_Shelter)
  - https://fallout.fandom.com/wiki/Fallout_Shelter_SPECIAL
- The Fallout Shelter FAQ (the_rabidsquirel), GitHub wiki, sections 1, 3, 4, 6, 8, 10–14, 19, 20: https://github.com/therabidsquirel/The-Fallout-Shelter-FAQ/wiki
  - Datamine thread (Lasercar): https://github.com/therabidsquirel/The-Fallout-Shelter-FAQ/issues/7
- r/foshelter posts, read through the arctic-shift archive:
  - "The Wasteland Detailed": https://www.reddit.com/r/foshelter/comments/1daltwd/the_wasteland_detailed/
  - "A Rough Analysis on Incident Difficulty": https://www.reddit.com/r/foshelter/comments/vilnpw/
  - "Incident Propagation Explanation": https://www.reddit.com/r/foshelter/comments/4bnq6z/
  - "Everything Health": https://www.reddit.com/r/foshelter/comments/4c4m46/
  - "Minimum Population for Incidents": https://www.reddit.com/r/foshelter/comments/51dv4y/
  - "Random Wasteland Quests Detailed": https://www.reddit.com/r/foshelter/comments/4y3aia/
  - "A Statistical Approach to Wasteland Exploration": https://www.reddit.com/r/foshelter/comments/1dcw1s6/
- Steam guide "Quote Guide" (journal and bark lines): https://steamcommunity.com/sharedfiles/filedetails/?id=3486066956
- TheGamer exploration guide: https://www.thegamer.com/fallout-shelter-complete-guide-to-exploring-wasteland-random-fixed-time-events/
- Revive cost (GameFAQs board, via search summary): https://gamefaqs.gamespot.com/boards/168521-fallout-shelter/72343906
- Vault door break times (Steam discussions, via search summary): https://steamcommunity.com/app/588430/discussions/0/1319962514593833941
- Return time = half (via search summary): https://fallout-archive.fandom.com/wiki/Exploring

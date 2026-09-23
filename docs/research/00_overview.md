# Fallout Shelter: Research Overview

Research compiled on 2026-09-23 as groundwork for a Fallout Shelter remake. This file is a summary and map of the research. Formulas, tables and full data live in the five detailed files:

| File | Covers |
|---|---|
| [01_rooms_resources.md](01_rooms_resources.md) | All 26 room types: costs, unlocks, upgrades and output. The production time-pool formula, power, food and water, storage, shortages, rushing, vault grid and happiness |
| [02_dwellers_items.md](02_dwellers_items.md) | SPECIAL, training, levelling and HP, death and revival, breeding and inheritance, the legendary dweller list, pets, Mr. Handy, the full weapon and outfit lists, junk and crafting recipes |
| [03_threats_exploration.md](03_threats_exploration.md) | Incidents and their thresholds, spread and scaling, vault combat, Normal vs Survival, wasteland exploration event tables, quests and real-time quest combat, objectives, lunchbox odds, Quantum |
| [04_story_quests.md](04_story_quests.md) | Setting and tone, the tutorial, every known questline (main, hidden, weekly, holiday, tie-in), NPCs, writing style, visual and audio presentation |
| [05_history_design.md](05_history_design.md) | Development, ports, awards, revenue, full version history including 2025–26 Seasons, monetization and prices, pacing by population, offline rules, design analysis, competitors, legal risk for fan remakes |

Confidence tags differ between files, but they mean roughly the same thing. **[C]/[V]/[DM]** means confirmed, verified or datamined. **[W]/[S]** means a single wiki or secondary source. **[?]/[U]/[UNVERIFIED]/[CONFLICT]** means uncertain or disputed.

**Sources.** The wiki pages usually cited (fallout.fandom.com and fallout.wiki) blocked normal fetching, so we read them through their MediaWiki APIs or raw wikitext. The most reliable mechanics source is the community **Fallout Shelter FAQ** (therabidsquirel, GitHub). It is built with r/foshelter and includes values datamined from the game code.

---

## TL;DR

Fallout Shelter (Bethesda Game Studios with Behaviour Interactive, Unity, released 14 June 2015) is a free-to-play **side-view "ant farm" colony manager**. You are the unseen Overseer of a Vault-Tec vault. You assign dwellers to rooms by their seven SPECIAL stats to produce **Power, Food and Water**, grow the population to 200, and fight off incidents. You also send dwellers into the wasteland and on quests for gear.

There is **no main story and no ending**. Narrative comes from hand-written, pun-heavy questlines added in 2016 and from later live-ops content. Progression is gated almost entirely by **population milestones**. The game's best-known weakness is an empty endgame after about 100 dwellers.

For a remake, the mechanics can be reused. The Fallout names, art and lore cannot be reused safely.

---

## Executive summary

**The core loop.** You build rooms on a 25-floor × 8-segment grid connected by elevators. Each worker adds their room-relevant SPECIAL stat to a hidden "time pool" every second. When the pool fills, a resource is ready to tap-collect.
- Merging 2–3 adjacent same-level rooms multiplies the pool size and increases output.
- Upgrading (levels 1→3) raises output per cycle.
- Food and water are consumed per dweller.
- Shortages cascade: no power shuts rooms down, starting with those farthest from the generators. No food drains HP. No water adds radiation.
- **Rushing** gives an instant payout at a risk of failure. The failure chance is `max(10, 40 − 1.5·(avg stat + avg Luck)) + 10 per recent rush`, and a failed rush starts an incident in that room.

**Dwellers.**
- **Stats:** 7 SPECIAL stats. Training raises each to 10, and outfits add up to +7, for a maximum of 17 in one stat.
- **Levels and HP:** levels run 1–50. HP starts at 105 and gains `2.5 + 0.5·Endurance` per level. The gain is not retroactive, which is why players train Endurance before levelling.
- **Happiness:** 50% baseline, 75% in the right room. Vault-wide happiness gives up to +10% production.
- **Population growth:** breeding (3 h pregnancy, 3 h childhood) and radio recruitment grow the vault. Rare and legendary dwellers mostly come from lunchboxes.
- **Combat factors:** vault combat depends only on weapon damage plus pet bonus. On quests, Agility sets attack speed, Luck fills the crit meter and Perception slows the crit timing ring.

**Threats.**
- **Incident types (9):** fire, radroaches, mole rats, radscorpions, raiders, feral ghouls, deathclaws, plus aliens and possibly Securitrons on the 2.x branch.
- **Unlock thresholds:** each type unlocks above a population threshold. In Normal, deathclaws start above 60 dwellers. In Survival they start above 35.
- **Difficulty:** scales mostly with **average dweller level**, then room level and width.
- **Spread:** incidents spread only from empty rooms and never re-enter a room.
- **Deathclaw chance:** a hidden meter builds with every vault-door opening.
- **Survival mode:** adds permadeath, faster resource drain and harder, more frequent incidents.

**Exploration and quests.**
- **Wasteland explorers** are simulated from timestamps while offline:
  - a guaranteed item roughly every 60 minutes and a junk event roughly every 180 minutes
  - time-windowed enemy, location and NPC events, each with a SPECIAL-based success check
  - a 100-item carry cap, and the trip home takes half the time spent out
- **Quests** (update 1.6, 2016) come from the Overseer's Office at 18 dwellers:
  - parties of 1–3 travel in real time, then explore procedurally laid-out rooms
  - real-time tap combat with a timing-based crit minigame
  - dialogue choices and loot

**Economy and monetization.**
- **Caps** are the soft currency. **Nuka-Cola Quantum** is the premium time-skip currency, at about 1 per 2 hours skipped.
- **Lunchboxes** are 5-card packs, with the fifth card guaranteed rare or better.
- Other paid items: pet carriers, Mr. Handy robots and a starter pack.
- No build timers, no energy system and no paywalled rooms. This "fair F2P" reputation was central to its success: $5.1M in the first two weeks, about $100M on mobile by 2019, and 230M+ downloads by 2025 according to Bethesda.
- Since December 2025 the game runs **Seasons**: roughly 40-day "Experimental Vaults" with a $9.99 / $19.99 battle pass.

**Story.**
- Tone: 1950s-Americana corporate parody, with grim events drawn in cheerful Vault Boy style.
- Content:
  - about 18 permanent multi-stage questlines, e.g. Vaultopolis, Horsemen of the Post-Apocalypse 1–3, Wizard of Water, Detective Case Files, Climbing the Ranks
  - hidden "Quest Clue" quests
  - daily and weekly quests
  - holiday questlines
  - tie-ins for Nuka-World, the 2024 TV show and the Season 2 "Viva New Vegas" season
- Explorer journals add one-line deadpan humour.

---

## The game on one page

### Systems map

```
                 ┌──────────── Population (radio, breeding, lunchboxes, quests) ────────────┐
                 ▼                                                                           │
  Dwellers (SPECIAL, level, HP, happiness, gear, pet)                                        │
     │ assigned to                                                                           │
     ▼                                                                                       │
  Rooms ──produce──► Power ─► keeps rooms running                                            │
     │               Food / Water ─► consumed per dweller (shortage → HP loss / radiation)   │
     │               Stimpaks / RadAway ─► healing for incidents, explorers, quests          │
     │               Caps (Luck bonus on collect) ─► build / upgrade / revive / craft        │
     │                                                                                       │
     ├─ Training rooms ─► SPECIAL +1 (hours to days)                                         │
     ├─ Workshops ─► junk + caps + recipe ─► weapons / outfits / room themes                 │
     ├─ Rush ─► instant output OR incident (fire, pests)                                     │
     └─ Pop. thresholds ─► new room types  AND  new incident types (raiders→ghouls→deathclaws)
                                                                                             │
  Vault door ─► Wasteland explorers (offline sim) ─► caps, gear, junk, recipes, XP ──────────┤
            └─► Quests (Overseer's Office) ─► legendary gear, dwellers, pets, Quantum, lunchboxes
  Objectives (3 active) + daily login ─► lunchboxes, caps, Quantum, pet carriers, Mr. Handy ─┘
```

### Loops

| Loop | Timescale | Content |
|---|---|---|
| Micro | seconds | Tap to collect, optionally rush, resolve an incident mini-battle |
| Session | 5–10 min | Check resources, reassign workers, collect, send out or recall explorers, start training, crafting or pregnancies, close the app |
| Meta | days to weeks | Population milestones unlock new room tiers. Train SPECIAL, gear up, take on harder incidents and quests, collect legendaries |
| Live-ops (2025+) | about 40 days | Seasonal Experimental Vault, battle pass, leaderboard |

### Progression by population

| Pop. | Unlocks (rooms) | New threats |
|---|---|---|
| Start | Door, elevator, living quarters, power generator, diner, water treatment | Fire |
| 9–20 | Storage (12), medbay (14), science lab (16), **Overseer's Office / quests (18)**, radio (20) | Radroaches (>9), raiders (>14) |
| 22–45 | Weapon workshop (22), training rooms (24–45), outfit workshop (32), theme workshop (42) | Aliens (>26, 2.x), mole rats (>31), feral ghouls (>41) |
| 50–60 | Barbershop (50), nuclear reactor (60) | Radscorpions (>51), **deathclaws (>61)** |
| 70–100 | Garden (70), water purification (80), Nuka-Cola bottler (100) | — |
| 100–200 | Nothing new. This is the well-known dead zone | — |

### Offline rules (important for architecture)

While the app is closed:
- Timers keep running: training, crafting, pregnancy, childhood, quest travel, explorer trips and the radio.
- Explorers keep generating events.
- Each production room finishes **one** batch, then waits to be tapped.
- **No incidents fire.**
- Resource drain stops quickly. Sources disagree on exactly when.

The design goal is that returning to the game is rewarding and never punishing.

---

## Cross-file conflicts found while merging

These are places where the detail files, or their sources, disagree. Resolve each before implementing.

| Topic | Conflict | Best evidence |
|---|---|---|
| When pets were added | 02 and 03 say **1.4**. 05 says **1.3 (Dec 2015)**, with crafting in 1.4, citing a Bethesda.net 1.4 post | 1.3 for pets and 1.4 for crafting (05 cites the official patch post) |
| Survival mode and Mysterious Stranger | 04 marks the versions unverified. 05 says **1.2 (Oct 2015)** | 1.2 |
| When Quantum was added | 1.6 or 1.7 | Probably 1.6 |
| Upgrade costs in summary tables | 05's table lists 500/1,500 for tier-1 rooms and 15,000/45,000 for the bottler. Those are **triple-width** values; single-width is 250/750 and 7,500/22,500 (see 01 §2) | Use the per-width values in 01 |
| Outfit workshop build cost | 1,200 + 900 per existing room, or 800 + 1,300 | Unresolved |
| Storage capacity per level | 10/15/25 or 10/15/20 per segment | Unresolved. Pick a value for the remake |
| Deathclaw threshold in Survival | 35+ or 36+ | Datamined: population > 35, so the first attack can happen at 36 |
| Revive cost curve | 100 + 20 per level gives 1,080 at level 50, but the observed maximum is 1,000 | Use `min(1000, 100 + 20·(L−1))` |
| Rush coefficient | 1.5 (post-1.5 patch) or 2 (older) | 1.5 |
| Season 1 launch date | 12 Dec 2025 (Steam news) or 15 Dec 2025 | 12 Dec (05) |
| Lunchbox prices | 2015: $0.99 / $3.99 / $9.99 / $19.99. Sept 2026 App Store: $0.99 / $2.99 / $6.99 / $9.99 | Both are right for their dates |
| Sarah Lyons as a quest reward | Climbing the Ranks or Echoes of Steel | Climbing the Ranks (most sources) |

---

## Gaps and limitations

No accessible source gives these values. The remake will have to design its own:
- **Per-level XP table**, for levels 1→50.
- **Vault door HP** per level. Break-in times are only anecdotal.
- **Survival incident-frequency multiplier.** The sources only say "much more frequent".
- **Food and water shortage damage rates.**
- **Exact caps-per-Luck rate** in the wasteland, beyond "linear".
- **Mysterious Stranger payout table and spawn odds.**
- Base stats for Nick Valentine and Kellogg. Piper's listed stats sum to 38, not 40.
- Exact feature lists for updates 1.7–1.13 and 1.17–1.22.
- Push-notification behaviour.
- A developer postmortem or GDC talk. None was found, so the design rationale comes from E3 remarks, the inspirations Pete Hines named (Little Computer People, Progress Quest, XCOM, SimCity, FTL) and reviews.

Some tutorial steps and a few explorer-journal lines in 04 come from memory or an unreliable AI-generated fan site, and are flagged there. There are also two live game branches: 1.13 on consoles and 2.x on Steam and mobile. Some wasteland values differ between them. The 03 file recommends the 1.13 tables.

---

## Legal note (summary of 05 §7)

- **Game mechanics are generally not copyrightable.** A stat-driven cross-section colony sim with rushing and exploration is fair game.
- **Protected material:** Fallout trademarks (Fallout, Vault-Tec, Nuka-Cola, Pip-Boy, Vault Boy, S.P.E.C.I.A.L.), the art, the characters and the lore.
- **Look and feel is also protected.** See *Tetris v. Xio*, and Bethesda's 2018 lawsuit against its own co-developer's *Westworld* clone, which ended with that game being pulled.
- **Options:**
  - **Original IP** with original art and names. This is safe to release commercially.
  - **An explicitly unofficial, free, non-commercial Fallout fan game.** This carries takedown risk.

This is not legal advice.

---

## Follow-up questions

1. **IP direction:** a faithful Fallout fan project, or an original-IP spiritual successor? This decides names, art direction and whether the project can ever be monetized.
2. **Platform and tech stack:** web (TypeScript + Canvas/Pixi), Unity, or Godot? Should it be mobile-first with touch controls like the original?
3. **Scope of the first playable version:** the core vault loop only (rooms, dwellers, resources, incidents), or also exploration and quests?
4. **Fixing the endgame:** which of the original's criticisms do we want to fix? Options: the 100→200 dead zone, automation as a progression reward, incident scaling that punishes levelling up, and a prestige or new-vault mode.
5. **Monetization:** none, cosmetic-only, or the original's lunchbox and Quantum model?

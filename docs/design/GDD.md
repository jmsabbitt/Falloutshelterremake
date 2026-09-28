# Game Design Document — v0.2

**Status:** v0.2. It now includes the owner's decisions and wishlist (§15, §16). Every name here is a **placeholder** until we settle the identity and run a trademark check.
**Direction (decided):** an original IP inspired by Fallout Shelter. Web first, with a port to mobile later. Wasteland exploration and quests are in scope from the start. The headline feature is a **prestige system** that keeps opening up the game instead of simply resetting it.

Research that backs this document is in [`../research/`](../research/00_overview.md). When this doc says "same as the original", the formulas are in those files.

---

## 1. Vision

> Everything that made the vault sim addictive, plus the depth the original never got to: a real story with an ending, an endgame that keeps growing, and a network of shelters that outlives any single one.

**Pillars**

1. **The ant-farm is the game.** A readable side-view cross-section, lots of small decisions, and visible progress in every session. The original's core loop is kept almost exactly.
2. **Depth after 100.** The original runs out of new content at 100 dwellers. Here, every population band, every level of depth and every prestige cycle adds systems, rooms, threats and story.
3. **Legacy, not reset.** Prestige means **founding a new shelter**. The old one keeps going as part of a network, and you carry forward people, heirlooms, knowledge and perks.
4. **Fair and respectful.** No build timers, no energy system, no paywalls. Offline play is safe: coming back always rewards you and never punishes you. Monetization, if there is any, is cosmetic only.
5. **Automation is earned.** Tedium, such as tapping 40 rooms or micromanaging 200 people, is solved by unlocking tools through play, not by buying them.

---

## 2. Setting and tone (original IP, placeholder names)

| Element | Original game | Ours (placeholder) |
|---|---|---|
| Catastrophe | Nuclear Great War | **"The Glare"**: a sky-fire event of unclear cause. The mystery at the heart of the main story |
| Corporation | Vault-Tec | **Halcyon Shelter Company**, which sold "Halcyon Homesteads" on subscription before the Glare |
| Player role | Overseer | **Warden** |
| Shelter | Vault (number 000–999) | **Homestead** (numbered, e.g. "Homestead 214") |
| People | Dwellers | **Residents** |
| Mascot / voice | Vault Boy cards | **HALCY**, the shelter's cheerful corporate AI. It narrates the tutorial, tips and objectives, and has an agenda of its own. It is a voice and an interface, not a thumbs-up cartoon man |
| Soft currency | Bottle caps | **Scrip** (company scrip, which fits the corporate theme) |
| Premium skip | Nuka-Cola Quantum | **Chrono-Tonic**, earned in play (see §10 for monetization) |
| Loot pack | Lunchbox | **Supply Crate** |
| Surface | Wasteland | **The Glarelands**, or "Topside" |
| Radiation | Radiation | **Glare-sickness** ("taint"), shown as a red bar that cuts into max HP, same as the original |

**Tone:** atompunk and retro-futurist Americana, which is a genre rather than anyone's IP (compare *ATOM RPG* and *Atomic Heart*). Corporate optimism against a horrific surface, with deadpan humour and pun-filled quest titles. The art should be clearly our own: **no big-headed thumbs-up mascot, no cog-shaped vault door, no Pip-Boy green UI.** We will pick a distinct palette and silhouette language during art direction.

**Legal guardrails:** do not use Fallout names, lore, characters, assets or UI layouts, and do not decompile anything. Mechanics can be reused (see research 05 §7).

---

## 3. Core systems carried over (the foundation)

These match the original closely, because they work. Numbers start from the researched values and are then tuned.

| System | Baseline (from research) | Our change |
|---|---|---|
| Grid | 25 floors × 8 segments + 2 elevator slots per floor | Start with **25 floors**. The Deep (§6.3) adds more below |
| Rooms | 1–3 wide, levels 1–3, merge same type and level | Add **level 4 "Mastercraft"** rooms after the first prestige. **Move and rebuild rooms** without demolishing them, a common wish |
| Production | Time pool: `poolBase × width / (Σ stat × (1 + happiness bonus))` | Same |
| Rush | `max(10, 40 − 1.5·(avg stat + avg Fortune)) + 10 per recent rush` | Same, plus a visible "strain" meter so the risk is readable |
| 7 stats | SPECIAL, trained to 10, gear adds up to +7 | Our own 7 stats (§4.1). The cap can rise through prestige perks |
| HP | 105 + (2.5 + 0.5·Grit) per level, not retroactive | **Retroactive recalculation** unlockable as a perk, which removes a newbie trap |
| Happiness | 50% baseline, 75% in the matching room, up to +10% production | Add traits and needs (§6.1), so happiness means more than room matching |
| Breeding | 3 h pregnancy, 3 h childhood, stat inheritance formula | Add **family trees**, heirs and trait inheritance |
| Incidents | 9 types, population thresholds, spread from empty rooms, deathclaw-style meter | Our own creature roster (§7). Difficulty is **telegraphed** and not purely tied to average level (§7.2) |
| Exploration | Offline timestamp sim, events every 60 / 180 min, 100-item cap, return takes half the time | Same core. Add a **world map with regions** (§8) |
| Quests | Office at pop 18, parties of 1–3, real-time tap combat, crit minigame | Same core. Add **party roles, armor that matters and skill abilities** (§9) |
| Offline | Timers run; each room finishes 1 batch then waits; no incidents | Timers run; finished batches **collect themselves into storage while there is space** (scrip, XP and mastery at half rate), and the rest wait for a tap; no incidents. Automation upgrades let rooms bank **N batches** |

---

## 4. Residents

### 4.1 Stats (placeholder names)

| Stat | Role in the original | Produces or affects |
|---|---|---|
| **Brawn** | Strength | Power, heavy weapons |
| **Sight** | Perception | Water, rifles, crit timing |
| **Grit** | Endurance | HP per level, taint resistance, bottler-type rooms |
| **Charm** | Charisma | Recruiting, breeding, trade and diplomacy (new) |
| **Wits** | Intelligence | Medicine, research (new) |
| **Knack** | Agility | Food, attack speed |
| **Fortune** | Luck | Rush odds, bonus scrip, crit meter, loot |

### 4.2 New resident depth

- **Traits** (1–3 per resident, some inherited). Examples: *Night Owl* (+production on the night shift), *Claustrophobic* (unhappy deep down, happy topside), *Green Thumb*, *Hothead* (fights better, argues more), *Hoarder*. Traits make every resident feel like an individual, not a row of stats.
- **Professions and mastery.** Time spent in one room type builds mastery (Apprentice → Journeyman → Master), which gives small boosts and unlocks abilities. This gives a reason to keep people in their roles.
- **Relationships.** Friends, rivals, partners and family trees. Friends in the same room are happier; rivals cause friction events.
- **Children and heirs.** Residents born in the homestead start as children and grow into adults. There is no ageing beyond that and no death from old age (decided 2026-09-23; may be revisited). Heirlooms can still pass down family lines.
- **Legendary residents** are original named characters, each with a personal questline.

### 4.3 Levels

The level cap is **50**, rising to **60 / 70** through prestige. Our own XP curve: `xpToNext(L) = round(100 · L^1.6)`. This is a placeholder to tune. The original's curve was never published.

---

## 5. Economy and resources

| Resource | Source | Sink |
|---|---|---|
| Power / Food / Water | Production rooms | Consumed by rooms and residents |
| Med-Patch / Purge (stimpak / RadAway equivalents) | Clinic / Lab | Healing, exploring, quests |
| **Scrip** | Collection bonus, exploring, quests, trade | Build, upgrade, revive, craft |
| **Salvage** (7 materials × 3 rarities, as junk in the original) | Exploring, quests, scrapping | Crafting |
| **Research Points** (new) | Lab and Archive rooms (Wits) | Tech tree (§6.2) |
| **Influence** (new) | Diplomacy, trade, quests | Faction reputation, outposts |
| **Legacy** (prestige currency) | Founding a new homestead (§5.1) | Permanent perk tree |
| **Chrono-Tonic** | Objectives, quests | Time skips (1 per 2 h, as in the original) |

### 5.1 Resource sinks for the late game

The original had none worth mentioning. Ours:
- Level-4 room upgrades
- Deep excavation (§6.3)
- Surface construction (§6.4)
- Research
- Legendary crafting chains
- Outfitting trade caravans
- Monument and "wonder" builds that give vault-wide buffs and act as long-term goals

---

## 6. Expansions beyond the original

### 6.1 Needs and morale

Beyond room matching, residents have light **needs**: rest, recreation and social. These are satisfied by lounges, bars, a chapel and a theatre, so the "fun" rooms finally have a purpose. Morale events include celebrations, strikes, feuds and weddings.

### 6.2 Research and tech tree

An Archive or Lab produces Research Points. The tree has branches such as:
- **Industry:** better production, a power grid
- **Medicine:** faster healing, cures
- **Defense:** turrets, door tiers, traps
- **Automation:** auto-collect, auto-assign, supply bots, which replace the paid Mr. Handy
- **Topside:** surface buildings
- **Expeditions:** a bigger world map, vehicles

This gives mid- and late-game goals and a strong sense of progression.

### 6.3 The Deep (vertical expansion)

Past floor 25, **excavation** opens deeper strata. Each stratum has:
- **New resources:** geothermal power, fungal farms, rare ores
- **New threats:** burrowing creatures, cave-ins, flooding
- **Story discoveries:** what is Halcyon hiding down there?

Late rooms live here, which fixes the "nothing after 100" cliff.

### 6.4 Topside (horizontal expansion)

In the mid game, residents can build **surface structures** above the homestead: farms, wind and solar, watchtowers, a trading post. These are exposed to weather, raids and taint storms. It is a risk/reward layer, and it is also the gateway to diplomacy and trade.

### 6.5 Factions and trade

A handful of original surface factions: traders, a zealot cult, techno-scavengers, raider clans and a rival Halcyon homestead. Each has a **reputation** track, trade routes, faction quests and distinct recruits. Caravans are like explorers, but they carry goods to earn scrip and Influence.

### 6.6 Quality of life (the pain points everyone has)

- Resident list with **sort, filter and search**; bulk assign; "auto-assign best fit"
- Room move and swap; layout templates; room stats overlay
- Auto-collect is **earned** through research, not paid for
- Loadout presets for explorers and quest teams
- A notification centre with a log of what happened while you were away
- Multiple save slots, cloud save and export/import

---

## 7. Threats

### 7.1 Roster (original creatures; stand-ins for the original's roles)

| Role in the original | Ours (placeholder) | Notes |
|---|---|---|
| Fire | Fire / **electrical surge** | Surges hit power rooms |
| Radroach | **Skitters** (glowing cave beetles) | Swarm and spread |
| Mole rat | **Burrowers** | Enter from dirt edges |
| Radscorpion | **Glassbacks** (taint-crystal arachnids) | Teleport, drain power |
| Raiders | **Rustmen** clans | Steal, loot them |
| Feral ghoul | **The Hollowed** (Glare-sick humans) | Deal taint damage |
| Deathclaw | **Maulers** | Apex threat, build a meter as in the original |
| — | **Deep-strata creatures** (new) | Only in the Deep |
| — | **Environmental**: cave-in, flood, taint storm (Topside) | New |

### 7.2 Fairer scaling

Threat level is **visible** as a vault "Threat Rating" gauge. It is driven by *wealth, depth and noise* (door openings, radio) as well as average level. Defensive research (turrets, door tiers, training drills) directly lowers the effective danger. Players should never feel punished for levelling their residents.

### 7.3 Modes

- **Normal**
- **Survival:** permadeath, as in the original
- **Custom rulesets**, unlocked through prestige, e.g. "Famine", "Endless Night", "No Radio"

---

## 8. Exploration: the Glarelands

- The **world map** is split into regions, each with its own biome, danger level, loot table and faction presence. Regions unlock through research, story and prestige.
- **Solo explorers** work as in the original: offline timestamp simulation, an item roughly every 60 minutes, salvage roughly every 180 minutes, time-windowed events with a stat-based success check, a 100-item carry cap and a return trip of half the time.
- **New:**
  - **Points of interest** found while exploring become permanent map pins that can become quest sites or outposts.
  - **Explorer journal** with generated lines in our own voice. Content writing is a real workstream.
  - **Choices**: an occasional prompt ("Help the stranded caravan?") that the player answers on return, or that a stance setting decides automatically (Cautious / Balanced / Bold).
  - **Vehicles** (late-game research) go faster, carry more and reach far regions.

---

## 9. Quests and combat

- There is a **Command Office** (the Overseer's Office equivalent) with 1 / 2 / 3 concurrent quests.
- **Main story campaign** (§11), **faction questlines**, **legendary-resident personal quests**, **repeatable contracts** (dailies and weeklies) and **hidden quests** (clues).
- Quest maps work like the original: side-view rooms and tap-to-move. We will use **hand-authored rooms with procedural shuffling**.

**Combat upgrades over the original:**
- **Armor matters.** Outfits give defence and stats. Separate cosmetic slot?
- **Party roles:** Tank (taunt, as melee did in the original), Damage, Support (heals, buffs). The role is derived from gear and profession.
- **One active ability per resident**, with a cooldown, based on profession or gear. Examples: medic heal, grenade, suppressing fire.
- The **crit minigame** is kept: Fortune fills the meter and Sight slows the ring.
- **Boss mechanics** are telegraphed and readable.

---

## 10. Prestige: "Found a New Homestead"

This is the feature that makes our game more than a remake.

### 10.1 Loop

1. Reach a **Charter milestone** in your current homestead. The first one: 100 residents plus the Act 1 story finale.
2. Choose **"Found a New Homestead"**. You pick:
   - a **Founding Party** of up to *N* residents to bring (N grows with Legacy)
   - up to *K* **heirlooms** (items)
   - a **site**: region, biome and a ruleset modifier. Harder sites pay more Legacy
3. You earn **Legacy** based on the old homestead's achievements: population, depth, research, quests, wealth and survival time.
4. The old homestead becomes an **Outpost** in your network. It runs in a light "idle" simulation: it produces a trickle of resources and supply crates, can be visited, can be raided, and can trade with your active homestead. Nothing is thrown away.

### 10.2 What carries over

| Carries over | Does not carry over |
|---|---|
| Legacy perk tree (permanent) | Rooms and layout (a new site means a fresh build) |
| Founding Party residents and heirlooms | Most stored resources (a starting "endowment" scales with Legacy) |
| Unlocked recipes, codex, lore and story progress | Room levels |
| Research, partially (a Legacy perk keeps a percentage) | Residents who were not in the founding party (they stay at the Outpost) |
| Unlocked regions, factions and reputation, partially | |

### 10.3 Legacy perk tree (examples)

- **Foundations:** start with more rooms or scrip; room build costs −x%
- **Bloodlines:** higher stat caps (10 → 11 → 12); better child stats; trait inheritance control
- **Automation:** auto-collect from day 1; start with supply bots
- **Expeditions:** extra explorer slots; start with vehicles; see more of the map
- **Warden's Authority:** more concurrent quests; reroll contracts
- **Deep Knowledge:** start with some Deep strata already surveyed
- **Network:** outposts produce more; trade routes between homesteads

### 10.4 Pacing targets (to validate in playtests)

| Cycle | Target time | New in this cycle |
|---|---|---|
| Homestead 1 | 2–4 weeks of casual play | Core loop, exploring, quests, Act 1 |
| Homestead 2 | 1–2 weeks (faster thanks to Legacy) | The Deep, research tiers 2–3, Act 2, factions |
| Homestead 3 | 1–2 weeks | Topside, vehicles, far regions, Act 3 |
| Homestead 4+ | Open-ended | Custom rulesets, mastery challenges, network endgame, the true ending |

Each cycle **adds** content instead of repeating the same 0 → 200 climb.

---

## 11. Story (sketch)

- **Premise:** after the Glare, Halcyon sealed its subscribers underground. HALCY runs every homestead with relentless good cheer. Nobody knows what the Glare was, why Halcyon knew it was coming, or why the lower strata of every homestead are sealed.
- **Structure:** a **campaign in acts**, one act per prestige cycle, told through HALCY's messages, quests, logs found while exploring and discoveries in the Deep. It has a **real ending** (possibly several endings, depending on faction choices). After the ending the game continues as an **endless** sandbox.
- **Side content:** faction arcs, personal quests for legendary residents, holiday events (optional, since this is not live-ops), and pun-filled one-off quests in the original's spirit.

This needs a dedicated writing pass once the systems are stable.

**Act 4 "Rent Day" and the endings (homestead 4+).** What the acts were building to:
- **The Tenant** is really the *Freeholder*: a vast, warm, patient living thing under the whole region. The Groundworks are its body, the Cisterns water it, and every homestead's warmth is its warmth. The knock is its heartbeat and its greeting: *anyone home?*
- **Halcyon** found it and signed an honest lease, the handwritten *Original Instrument*: live on its ground warm, in quiet enjoyment, and pay the rent by *answering when it knocks*. The Board then swapped the parties on a forty-page copy, called the Freeholder "the Tenant" and billed it for its own warmth. When it knocked for its rent, the Board opened the Seal so it could come up and look for its tenants, knowing its gaze would burn the surface (the Glare, the "Sunrise"), and sold Sunrise Packages below.
- **HALCY** is made of the Sunrise Line passengers, 1,006 voices recorded when they went down to answer the knock and compressed for cheerfulness. That's why its core fits the Seal's key slot, and why the Freeholder can speak through it.
- **Every homestead has a Seal** because Halcyon built one over every door the Freeholder could knock on, so each knock landed on company property and was filed as noise.
- **The rent** is company: somebody knocking back.
- The finale's choice: *Under New Management* (renew the lease), *Notice to Quit* (give the ground back and go topside), *Holding Over* (HALCY stays to answer), and the true ending *Good Neighbours* (the whole network answers together), which needs 3 Friendly factions, 5 legends met, 2 legend stories finished, 3 outposts and the Deep dug to the Seal. Endings are lifetime (`state.story`); later homesteads can answer again at a Rent Review. Content lives in `quests.json` (Act 4) and `endings.json`; code in `systems/endings.ts` and `systems/network.ts`.

---

## 12. Monetization

**Default: none**, since this is a personal project.
- If the game is ever released publicly, monetization stays **cosmetic-only** (room themes, outfits) or the game is sold once at a fixed price.
- Chrono-Tonic can only be earned in play.
- Supply Crates are gameplay rewards only.

---

## 13. Technical approach

### 13.1 Architecture: the key decision for "web now, mobile later"

The simulation is kept strictly separate from rendering:

```
content/           JSON data: rooms, items, creatures, quests, perks, text   ← engine-agnostic
sim/               pure TypeScript game logic: deterministic, no DOM, fixed tick, seeded RNG
  state            serialisable GameState (versioned save format)
  systems          production, consumption, incidents, exploration, quests, prestige...
  offline          fast-forward from timestamps (closed-form where possible)
client/            renderer + UI (reads state, sends commands)
tests/             headless sim tests, balance simulations (run 30 in-game days in seconds)
```

- **Commands in, state out.** Examples: `assign(resident, room)`, `build(type, x, y)`, `rush(room)`. This makes the sim testable, replayable and portable.
- **Content is data.** Designers and players can add rooms, items and quests without touching code.

### 13.2 Getting to mobile: two viable paths

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. TypeScript + PixiJS web app, wrapped with Capacitor** for iOS and Android | One codebase: web → native wrapper | Fastest to iterate; runs in any browser; Capacitor gives app-store builds, push notifications and storage | Performance on low-end phones needs care (fine for a 2D sim) |
| **B. Godot 4 from day one, exported to Web + iOS + Android** | One Godot project; HTML5 export for the web version | A real game engine: tooling, animation, a 2.5D look is easy, strong mobile exports | Web exports are heavier and load slowly; GDScript rather than TS; C# does not export to web |
| C. Start in TS, port to Godot later | Rewrite the sim in GDScript, reuse `content/` | — | A full rewrite; not recommended |

**Recommendation: Option A.** It matches "web-based first". Capacitor covers the mobile goal without a rewrite. The `content/` data and the pure `sim/` design keep a Godot move possible if we ever need 3D.

If you would rather end up in Godot for sure, **Option B** is better than C: build in Godot from the start and use its web export.

### 13.3 Other technical decisions

- **Stack (Option A):**
  - Vite + TypeScript
  - PixiJS for the vault view
  - UI in plain DOM, or Preact/React for menus
  - Vitest for sim tests
- **Saves:** IndexedDB locally, JSON export/import, a version number on every save, and migrations between versions. Cloud save later.
- **Time:** the sim uses wall-clock deltas. It is protected against clock tampering, and offline catch-up is capped (for example, a maximum of 3 days per session, adjustable).
- **Balancing:** a headless "bot player" runs whole cycles to check the pacing targets in §10.4.

---

## 14. Roadmap (milestones)

| # | Milestone | Scope | Done when |
|---|---|---|---|
| M0 | Foundations | Repo scaffold, sim/content/client split, save/load, tick loop, test harness | Sim runs headless, and a test simulates 24 h |
| M1 | **Vault loop** | Grid, build and merge, upgrades, 3 resources, residents, stats, assignment, happiness, collect, rush, offline catch-up | You can play the first hour with placeholder art |
| M2 | Threats and growth | Incidents (fire, pests, raiders), combat, death and revive, breeding, recruiting, storage, med rooms | Pop 1 → 40 is playable |
| M3 | Exploration | World map (1 region), explorer sim, journal, salvage, crafting, workshops | An explorer's trip works end to end offline |
| M4 | Quests | Command Office, quest runner, real-time combat, crit, 1 questline + contracts | Act 1 is playable up to the first boss |
| M5 | **Prestige v1** | Charter milestone, founding party, Legacy tree (first ~15 perks), Outposts (idle) | Homestead 1 → 2 transition works |
| M6 | Depth pass | Research tree, the Deep, traits and professions, automation, QoL tools | The mid-game after 100 has new goals |
| M7 | Topside and factions | Surface layer, factions, trade, caravans, Act 2 | Homestead 2 has a new story and a living surface (done) |
| M8 | Mobile | Capacitor builds, touch polish, notifications | Installable on a phone (done: debug APK, PWA) |
| M9+ | Content | Acts 3+, more regions, creatures, legendary residents, custom rulesets | M9 done: Act 3, the Stillwater, 11 legends, Collection Log and Seal, 4 new threats, rare-item paths, rulesets, Survival, Custom Game. True ending done: Act 4 "Rent Day", the network in the field, four endings with epilogues |

Art and audio proceed in parallel. Placeholder art is fine through M4.

Two systems grow with every milestone instead of being a milestone of their own:
- **Achievements and the Collection Log.** The event bus and tracker land in M1, and every later milestone adds achievements for its systems.
- **Supply Crates and crate tokens.** These arrive in M2, and their sources expand with each system.

The **Custom Game** mode ships after M9. It is built on the developer console, which exists from M0.

---

## 15. Owner's wishlist (v0.2)

These come directly from the project owner's experience beating Fallout Shelter many times. They are design requirements, not nice-to-haves.

### 15.1 More ways to get rare items

In the original, rare and legendary gear came almost entirely from lunchbox RNG, late crafting and grinding high-level quests. Ours offers many overlapping, **deterministic-leaning** paths:

| Path | How it works |
|---|---|
| **Blueprint fragments** | Every legendary recipe splits into N fragments. Fragments drop from exploring, quests, bosses and scrapping. Collecting all N **guarantees** the recipe. This turns luck into steady progress |
| **Crate pity counter** | Each Supply Crate raises a hidden-but-shown "luck meter". A legendary is guaranteed every X crates (e.g. every 10) if none has dropped |
| **Reforging** | Combine 3 items of one rarity (plus scrip and salvage) for a chance at the next rarity, with guaranteed success after a few failures |
| **Faction vendors** | Rare and legendary items bought with scrip plus reputation. The stock rotates |
| **Bounty contracts** | Quests that **name the reward item** up front, so you can target the one you want |
| **Treasure maps** | Rare finds while exploring that point to a specific legendary cache on the world map |
| **Boss first-kill drops** | Each named boss guarantees a specific item the first time it is defeated, and has a lower chance afterwards |
| **Region and Deep exclusives** | Each region and stratum has signature loot that is only found there |
| **Outpost trade** | Prestige outposts can specialise, e.g. an armoury outpost produces gear |

### 15.2 Achievements and "Platinum"

- There are **150+ achievements** in tiers (bronze, silver, gold), across every system: building, residents, breeding, combat, exploring, quests, crafting, collecting, prestige, story, challenge modes and hidden ones.
- The **Warden's Seal** (our "Platinum") is awarded for earning every non-DLC achievement. It gives a unique cosmetic, a title and a homestead monument.
- The **Collection Log** (a codex) tracks every item, resident, creature and room theme you have ever obtained. It has its own completion percentage.
- Each achievement shows **visible progress** and gives a reward (titles, cosmetics, crates) so it feels like accomplishment, not a checklist.
- The design leaves room to mirror achievements to Steam, Game Center and Google Play Games later.
- **Rule:** no achievement requires spending money. None needs extreme luck either: bad luck is covered by the pity counters and fragments above.

### 15.3 Supply Crates are much easier to earn

In the original, a lunchbox could take hours to earn without paying. Our target: **several crates per day of normal play, and about one per hour of active play.**

| Source | Rate (starting point, to tune) |
|---|---|
| Daily login | A crate **every day**, not only every 7th day. Day 7 gives a better crate |
| Objectives | Crates are a common reward, not a rare one |
| Crate tokens | Almost every activity (collecting, rushing, winning fights, exploring) drops tokens. **10 tokens = 1 crate**, with a visible progress bar |
| Resident level-ups | A crate every 5th level of any resident |
| Population milestones | A crate at each milestone |
| Quests and bosses | Crates are part of the reward table |
| Explorer finds | A small chance per event |
| Outposts | Each outpost produces crates over time |
| Achievements | Many of them award crates |

- **Crate tiers:** Standard, Rare-guaranteed and Legendary-guaranteed.
- **Crate economy guardrail:** crates must not make crafting and exploring pointless. Crates give variety and a boost; targeted paths (§15.1) give control.

### 15.4 Custom Game (post-launch, low priority)

This is a sandbox and scenario mode for testing and "what if" play:
- Set resources and population, spawn residents and items, choose rooms and layout
- Trigger incidents on demand, speed time up or down (×1 to ×100), set stat caps and rules
- Save **scenarios** to share, and load preset challenges ("start with 5 residents at pop 80")
- Achievements are disabled, and custom saves are kept separate from normal ones

**Why it is cheap to add later:** the simulation takes commands and produces state (§13.1), so Custom Game is mostly a UI over a **developer console** that we build from day one for testing anyway.

---

## 16. Decisions log

| Date | Decision |
|---|---|
| 2026-09-23 | Original IP inspired by Fallout Shelter; exploring and quests in scope; prestige is the headline feature |
| 2026-09-23 | **Engine: TypeScript + PixiJS web app, mobile through Capacitor** (Option A) |
| 2026-09-23 | **Genre: atompunk** (placeholder names kept for now) |
| 2026-09-23 | **Art: 2.5D.** Rooms are layered pseudo-3D cross-sections with depth and parallax. Residents are sprite sheets. Procedural placeholder art at first; final assets may come from PixelLab |
| 2026-09-23 | Wishlist adopted: rare-item paths, Platinum-style achievements, easier crates, Custom Game (post-launch) |
| 2026-09-23 | **No ageing or death from old age.** Residents are born as children and grow into adults; that is the only life stage change. Revisit later |
| 2026-09-24 | **Quests (M4):** abilities come from a resident's best stat until professions exist (M6); a wiped party comes home dead (revivable); nothing on a quest site runs offline; smaller parties face weaker enemies, but 3 is recommended; contracts refresh every 6 h (dedicated players can keep playing) and name their bounty; legendaries only as fragments |
| 2026-09-24 | **Quest levels are recommended levels:** enemies fight 2 levels below a quest's stated level, so a party at the stated level wins comfortably and an under-levelled one has a real fight |
| 2026-09-24 | **Depth pass (M6):** one bonus() lookup for perks and research. Research is lost on founding unless Institutional Memory keeps a share. Mastery tiers fall at 2 and 7 days (offline counts). Deep threats split depth between HP and damage. The refinery gives only a trickle of legendary salvage. Cave-ins settle offline |
| 2026-09-24 | **Prestige v1 (M5):** Legacy is earned only by founding and scores only the homestead being left; founders keep levels, stats and worn gear; recipes, fragments, story, regions, achievements, lifetime stats and crates carry; outposts are an idle trickle capped at 24 h (visiting, raids and trade later); later Charters use contracts until Act 2 exists; residents gain +0.25 incident damage per level so seasoned residents keep up with level-scaled incidents |
| 2026-09-28 | **Playtest 1, round 2:** offline, finished batches collect themselves while storage has space (`offline.autoCollectEfficiency` 0.5 of the scrip, XP and mastery; the resources in full), so nobody comes back to a stalled homestead; full storage leaves batches ready. Rooms show the time left on a batch, not its length. Power was the one supply that always needed more crew (about 1.5 to 1.9 times food or water from a few hours in, because a level-3 room drew 1.8 times a level-2 one), so power rooms fill faster (poolBase 1320 to 1100) and level 3 draws 1.2 times level 2. See `docs/design/balance-playtest-1.md` |

## 17. Open questions

1. **Name and identity.** Keep the placeholders (Homestead, HALCY, the Glare, Scrip) or brainstorm?
2. **Real-time vs. idle balance.** Should the game stay a check-in game (5–10 minute sessions), or also support long active sessions?

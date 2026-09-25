# M7 spec: Topside, factions and Act 2

M7 opens the surface and the neighbours (GDD §6.4, §6.5 and §11). There are three parallel sim/content streams:

- A: Topside and weather
- B: Factions, trade and caravans
- C: Act 2 and faction content

A client stream (D) follows once they're merged. The acceptance goal: **the second homestead has a new story and a living world above ground.**

The ground rules are the same as M6 (see `docs/design/M6-spec.md`):

- original IP and our atompunk voice
- a deterministic, JSON-state sim
- systems return `string | null`
- `bump()` counters and events for the UI
- offline-safe
- `npx tsc --noEmit` and `npx vitest run` must pass
- **edit only the files you own**; describe anything else in your report

## Scaffolding already in place (phase 0)

| Piece | Where |
|---|---|
| **Topside rooms**: `RoomDef.topside: true` rooms go on **floor −1** (`TOPSIDE_FLOOR` in `grid.ts`), a row above floor 0. They connect outward from the ground above the door; `canPlace`, merging and connectivity handle this. They are ordinary rooms (staffing, production, upgrades, incidents) | `grid.ts`, `content.ts` |
| `weatherMult(state, content, room)` scales topside production (called in `tickProduction`/`cycleSeconds`). `tickWeather(dt, offline)` runs every step. `isTopside(room)` | `systems/weather.ts` (stub) |
| State: `state.weather {kind, remaining}`, `state.factions {id: {rep, met}}`, `state.influence`, `state.trade {offers, refreshAt}`, `state.caravans[]`, `resident.caravan` (counts as away) | `types.ts`, `state.ts`, `save.ts` v7 |
| `changeRep` (clamped to ±100; marks met; fires `factionMet`/`repChanged`), `repOf`, `factionDef`, `factionsContent`. Stubs: `trade`, `sendCaravan`, `recallCaravan`, `collectCaravan`, `tickFactions` | `systems/factions.ts` |
| Commands: `trade`, `sendCaravan`, `recallCaravan`, `collectCaravan` | `commands.ts` |
| **Quests**: `requires.cycle` (the homestead's number in the prestige chain; Act 2 is `cycle: 2`) and `requires.rep {faction, min}`. `QuestReward.rep {factionId: n}` and `.influence` are paid at collection. Contract templates take `faction`, `rep` (default 5) and `influence`, and success pays them | `quests.ts`, `types.ts` |
| **Charter 2** now requires quest **`act2_finale`**. Charter 3 requires population 120 and 20 contracts | `legacy.json` |
| Caravan residents are away (`isAway`), so they can't explore or quest, and founding waits for caravans to come home | `residents.ts`, `exploration.ts`, `prestige.ts` |

### Shared ids

- **Factions:**
  - `caravaners`: The Long Road Caravan Co. (traders)
  - `lamplighters`: the Order of the Last Lamp, a zealot cult that worships the Glare
  - `tinkers`: the Scrapwright Guild (techno-scavengers)
  - `rustmen`: the Rustman clans (raiders, but open to negotiation)
  - `homestead9`: Halcyon Homestead 9, a rival homestead run by a different, colder HALCY build
- **Topside rooms** that B relies on:
  - `trading_post`: needed for trade offers and caravans
  - `signal_mast`: makes contact with factions; each level reaches further
  - `watchtower`: warns of and softens raids
- **Topside research branch** node ids (stream A appends them to `research.json`): `topside_survey` unlocks building topside at all. Any others A adds are up to A.
- **Exploration region** (stream C): `glassflats`, the Glass Flats. It is unlocked by an Act 2 quest reward (`rewards.regions`).

---

## Stream A: Topside and weather

**Owns:**
- `src/sim/systems/weather.ts`
- `src/content/topside.json`
- **new** topside room entries appended to `rooms.json`
- **appended** Topside-branch nodes in `research.json` (add a `topside` branch; don't edit existing nodes)
- `tests/topside.test.ts`

**Implement:**
- **Weather:** weighted kinds with durations. It runs online and offline, and a 60 s step behaves like sixty 1 s steps (carry the remainder). Fire `weatherChanged`.
- **`weatherMult`:** the kind's `production` for topside rooms (floor < 0) and 1 elsewhere. Per-building resistances (for example, solar arrays suffer in dust storms but thrive in heatwaves) are welcome.
- **Taint storms:** online only, they add taint to residents working topside. The watchtower or research can reduce this.
- **Topside rooms** (`topside: true`, `minFloor` not needed, `requiresResearch: "topside_survey"` or later nodes):
  - `solar_array`: power, Sight
  - `wind_turbine`: power, Brawn (a steady output)
  - `rain_catcher`: water, Wits
  - `farm_plots`: food, Knack
  - `watchtower`: stat Sight. Staffed watchtowers cut raid door damage and raid damage by a share, and warn earlier. Wire this in `weather.ts` via an exported `raidDefense(state, content)`, and say in your report where incidents should call it.
  - `trading_post`: stat Charm, required by stream B
  - `signal_mast`: stat Charm, level 1–3 (upgrades), required by B

  Make them good but exposed, for example better output than the underground equivalent in clear weather.
- **Research nodes** (tiers 1–3, 5–7 nodes): `topside_survey`, plus weatherproofing (resist dust), Glare shielding (less storm taint), a signal booster, and anything else you find useful. Their effects need keys in `bonuses.ts`, which is shared. If you need new keys, use the ones below and list them in your report; I'll add them to the `ResearchEffect` union. Read them through `bonus()` with a cast, or ask. Suggested keys: `weatherproofing`, `stormShielding`, `signalRange`.
- About 6 achievements.
- Tests covering weather rotation and equivalence, the production multiplier, storm taint only online, topside placement, and research gating.

---

## Stream B: Factions, trade and caravans

**Owns:**
- `src/sim/systems/factions.ts`
- `src/content/factions.json`
- `tests/factions.test.ts`

**Implement:**
- **The 5 factions** (ids above), with names, descriptions and personalities in our voice, a start rep, and `repTiers` names (Hostile, Wary, Neutral, Friendly, Allied or similar). Export `repTier`.
- **Contact:** a faction is `met` once a `signal_mast` of high enough level exists, or through `changeRep` (from a quest or caravan). Stronger masts reach more factions: level 1 reaches the traders and tinkers, level 2 the lamplighters and rustmen, level 3 homestead9. Check this in `tickFactions`.
- **Trade board:** with a staffed `trading_post`, offers refresh every `tradeRefreshHours` for each met faction.
  - **What's traded:** sell salvage, resources or items for scrip and Influence; buy rare items, recipes, fragments, crates, Med-Patches and Purge.
  - **Rep:** better tiers unlock better offers and prices. Trading gives small rep.
  - **Faction flavour:** tinkers buy circuitry and sell recipes; lamplighters want Purge and pay Influence; rustmen sell weapons at hostile prices; homestead9 trades research points.
  - **Validation:** `trade()` checks the costs, the stock and the rep, then pays out and fires `traded`.
- **Caravans:** `sendCaravan` sends 1–3 eligible residents (like `canQuest`) with goods taken from stock to a met faction's route, which needs a `trading_post`.
  - Travel time depends on the faction (30 min to 4 h).
  - It runs online and offline, and is resolved deterministically with `state.rng`: Charm and Fortune raise the payout, and Brawn and Grit guard against ambushes.
  - On return (`caravanReturned`), `collectCaravan` pays scrip, Influence, rep and occasionally an item, and brings the residents home with `returnToJob` from `assign.ts`.
  - Recall turns a caravan back.
- **Influence** is a currency. Offers can cost Influence, and Influence can also buy rep or recruits (for example, "hire a Scrapwright engineer": a rare resident arriving at the door, via `createResident`, capped per faction).
- **Hostile rustmen** raid more often (hook: export `raidRateMult(state, content)` and say in your report where incidents should call it), and friendly rustmen raid less.
- About 8 achievements.
- Tests covering contact, trade validation and effects, the caravan lifecycle including offline and 1 s vs 60 s steps, rep clamping and tiers, and recruits.

---

## Stream C: Act 2 and faction content

**Owns:**
- **Act 2** entries in `src/content/quests.json`: a new questline `act2`, new enemies, pools, events and faction contract templates. Don't change Act 1 quests except the questline list.
- **The new region** `glassflats` in `src/content/exploration.json`: add it to `regions` with enemies, locations, NPCs and journal lines in the same shape as `dustbowl`.
- `tests/questContent.test.ts`: extend it.
- `scripts/questBalance.ts`

**Act 2: "Neighbours"** (working title), 7–8 quests. All have `requires.cycle: 2`, and the **final one is `act2_finale`**.
- **Beats:** the new homestead is not alone. Factions notice it.
  - Choose how to deal with the Lamplighters, who worship the Glare, and the rival Homestead 9's cold HALCY.
  - Uncover that Halcyon's "Sunrise" (Deep lore: the Glare was scheduled) and the "Tenant" below are connected.
  - The finale is a boss plus a revelation that sets up Act 3 (the Seal).
- **Rewards:** quests grant faction rep, some positive and some negative. Events offer choices that favour one faction over another (`reward.rep`). At least one quest unlocks `glassflats` through `rewards.regions`.
- **Stats:** levels about 10 → 22, with population gates of 30–80 (a second homestead grows faster).
- **Tone:** read the Deep discoveries in `src/content/deep.json` so the story threads line up. Keep the tone deadpan and atompunk, with no Fallout names.
- **Content:**
  - at least 10 new enemies and at least 10 new events, using the existing `look` list (see M4-spec) or the existing art looks
  - at least 5 faction contract templates (`faction`, `rep`, `influence`), one or more per faction
- **Glass Flats:** a harsher region (danger higher than the Dustbowl), with at least 12 enemies, 10 locations, 8 NPCs, faction flavour, and at least 40 new musings.
- **Balance:** use `npm run quest-balance`, with the same targets as M4 relative to the recommended level. Put the table in your report.
- **Tests:** extend the content tests: ids resolve, maps are connected, `act2_finale` exists and requires cycle 2, and every faction id used exists in the faction list (`caravaners`, `lamplighters`, `tinkers`, `rustmen`, `homestead9`).
- About 8 achievements.

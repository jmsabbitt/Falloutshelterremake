# Supplies and production balance (playtest 1, item 11)

Feedback: "Recheck the supplies and room production balancing as some of the rooms seem to be less problematic than others."

**Short version:** power was the problem supply. From a few hours in, keeping the lights on took about 1.5 to 1.9 times the crew that food or water took. Food and water were always even with each other, because their rooms and consumption use the same numbers. The gap came from power draw growing with the homestead's rooms and levels: a level-3 room drew 1.8 times a level-2 one, while a level-3 room only makes 1.2 times as much. Power producers now fill 20% faster, and level 3 now draws 1.2 times level 2, the same step as from level 1 to level 2. After the change, the three supplies need about the same crew at every stage. The first hours are no harder: power is a little easier, and food and water are unchanged.

## How it was measured

`scripts/resourceBalance.ts` (`npx tsx scripts/resourceBalance.ts [hours] [seeds]`) does two things:

1. **Analytic tables** read straight from `rooms.json` and `balance.json`: what one stat-5 worker makes per hour in each production room, by level and width. These tables are compared with what a resident eats and drinks, and with what a room draws.
2. **Bot runs.** It runs the `simulate.ts` bot with `BALANCE_OUT` set (a sample every minute) over several seeds and reports the following for each supply: the time below 25% of storage, below the shortage line, at 0 and full; the amounts made and used; and crew per resident.

The bot's crew counts can't be used directly. The bot overstaffs: it puts every idle adult in the job that matches their best stat. So its rooms can make 2 to 4 times what is used, and the collected amounts are capped by storage. The fair measure is the **labour each supply needs**: the crew's total stat, times what was used, divided by what the crew could make. That is counted in stat-5 workers per 10 residents. Food and water, whose numbers are identical, come out identical by this measure, which is a good sign that it works.

All runs below are on the merged wider-grid base (90ab24d): 48 h, seeds 3, 5 and 7, with the bot checking in every minute.

## Before

Labour each supply needs, in stat-5 workers per 10 residents:

| Hours | Pop | Power | Food | Water | Power ÷ food |
|---|---|---|---|---|---|
| 0–2 | 14 | 0.79 | 0.74 | 0.74 | 1.07 |
| 2–8 | 23 | 0.99 | 0.68 | 0.68 | 1.46 |
| 8–24 | 36 | 0.99 | 0.54 | 0.53 | 1.83 |
| 24–48 | 71 | 0.77 | 0.49 | 0.49 | 1.57 |

Use per resident per hour: power 14.6, then 21.3, 25.3 and 22.6 (it rises as rooms are upgraded). Food and water stay at 14 to 17 (0.3 a minute for each living resident).

One stat-5 worker, compared across room sizes:

| Room | Generator worker keeps N rooms of this size lit | Canteen worker feeds N residents |
|---|---|---|
| L1 1-wide | 4.4 | 8.3 |
| L1 2-wide | 2.2 | 9.4 |
| L2 3-wide | 1.9 | 11.8 |
| L3 3-wide | **1.3** | 13.9 |

Upgrading a canteen makes each worker more efficient. Upgrading anything to level 3, though, made power *harder*, because the level-3 row of `powerPerRoomPerMin` was 1.84 times the level-2 row (0.52, 0.62, then **1.14** per minute for a 1-wide room), while production only rises 1.2× and then 1.5×. Level 3 is where most rooms end up, and it is where the gap widens (8–24 h: 1.83×).

Other findings:

- **Food vs water:** the same in every way (same output tables, same poolBase 960, same 0.3 a minute each). Neither is more of a problem than the other, so there was no change.
- **Med-Patches and Purge** sat full 78 to 84% of the time. They are stockpiles that the player spends on healing, purging and explorers; nothing uses them automatically, so a full store is the expected state. A clinic makes 7.5 an hour per worker against a store of 10 per 1-wide room. There was no change.
- **Topside and Deep producers** beat their underground equivalents per worker (1.2 to 1.6×) for much more scrip, as intended (`tests/topside.test.ts` checks this). Since every power producer's poolBase changed by the same factor, the ratios are kept.
- **Output per scrip** (a full crew in a level-1, 1-wide room, per hour, per 100 scrip): generator 273 (now 327), canteen and waterworks 300, topside rooms 25 to 28, Deep rooms 18 to 21. The expensive rooms are for when beds and scrip are no longer the limit. There was no change.

## Changes

| Where | Before | After | Why |
|---|---|---|---|
| `rooms.json` power producers (generator, geothermal, solar_array, wind_turbine) `poolBase` | 1320 | 1100 | Each power worker makes 20% more. Batches take about as long as food and water batches do. |
| `balance.json` `consumption.powerPerRoomPerMin` level 3 (1/2/3 wide) | 1.14 / 2.39 / 3.76 | 0.74 / 1.56 / 2.46 | Level 3 now draws 1.2 times level 2, like the step from level 1 to level 2. Upgrading no longer punishes power. |
| Levels 1 and 2 draw, food and water use, output tables, starting supplies | unchanged | unchanged | The first hour after the tutorial stays as forgiving as it was, or more so for power. |

Tried and rejected: 0.36 a minute for food and water, a poolBase of 960 for power, and all power draw at ×0.75. That overshot. Power needed only about half the crew of food and water, and the early game got harder on food and water.

## After

Labour each supply needs, in stat-5 workers per 10 residents:

| Hours | Pop | Power | Food | Water | Power ÷ food |
|---|---|---|---|---|---|
| 0–2 | 15 | 0.62 | 0.72 | 0.70 | 0.86 |
| 2–8 | 26 | 0.69 | 0.65 | 0.62 | 1.06 |
| 8–24 | 41 | 0.53 | 0.52 | 0.51 | 1.02 |
| 24–48 | 74 | 0.42 | 0.48 | 0.48 | 0.88 |

Power use per resident per hour is now 13.7, 18.8, 17.2 and 15.4, in line with food's 14 to 17.

| Room | Generator worker keeps N rooms lit | Canteen worker feeds N residents |
|---|---|---|
| L1 1-wide | 5.2 | 8.3 |
| L1 2-wide | 2.6 | 9.4 |
| L2 3-wide | 2.3 | 11.8 |
| L3 3-wide | 2.4 | 13.9 |

## Headline bot numbers

48 h, seeds 3, 5 and 7:

| | Pop at 48 h | Rooms | Deaths | Pop 40 at (avg) | Pop 75 at (avg) | Time below the shortage line (P / F / W) |
|---|---|---|---|---|---|---|
| Before | 84, 76, 110 | 53, 32, 60 | 3, 5, 4 | 19.1 h | 40.2 h | 2% / 1% / 3% |
| After | 99, 98, 82 | 62, 60, 54 | 2, 3, 0 | 15.7 h | 37.6 h | 1% / 1% / 1% |

120 h, seed 3 (`npx tsx scripts/simulate.ts 120 3 1`):

| | Pop at 25 h / 50 h / 75 h | First founding | Deaths | Raids repelled | Crates earned |
|---|---|---|---|---|---|
| Before | 48 / 88 / 131 | 100.3 h | 8 (fire 4, maulers 4) | 38 | 364 |
| After | 60 / 102 / 156 | 105.9 h | 5 (maulers 5) | 33 | 434 |

Growth is a little faster (pop 40 about 3 hours sooner), and fewer residents die. That is expected, because the crew freed from generators goes elsewhere. The first homestead's founding time is about the same (within the noise between seeds).

## Re-running

```
npx tsx scripts/resourceBalance.ts 48 3,5,7      # analytic tables + three 48 h bot runs (about 75 s)
npx tsx scripts/resourceBalance.ts --no-sim      # analytic tables only
BALANCE_OUT=out.json npx tsx scripts/simulate.ts 48 3 1   # raw per-minute samples for one run
```

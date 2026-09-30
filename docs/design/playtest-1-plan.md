# Playtest 1: feedback and fixes

The first round of notes from the team, what is causing each one, and the fix.
The work happens on the branch `claude/playtest-feedback` and gets merged into the main line once it is cleaned up.

| # | Feedback | Cause | Fix | Art needed? |
|---|---|---|---|---|
| 1 | Drag and drop only; tapping a resident and then a room gets annoying | Tapping a resident selects them, and the next room tap assigns them (`ui.onRoomTap`) | Assign by drag only. Tapping a resident still opens their card, but a room tap never assigns anyone. Rooms light up green only while dragging. **Done.** | No |
| 2 | Rooms merged to 2 or 3 wide repeat the same image | `rebuildStatics` tiles the single-width back wall once per segment | Look up a painted wall for the room's width (`<level>w2`, `<level>w3`). If there isn't one, fall back to tiling. **Done:** all 102 wide walls (and 42 for the training rooms) are delivered and wired. | Yes: wide walls (ART-LIST.md §1) |
| 3 | Add a short tutorial, and don't start with the rooms built | `newGame` places a fixed starter layout | A first homestead starts with only the door and the elevator shaft. HALCY walks the player through building power, water and food on either side of the shaft (free for the tutorial), dragging the right founder into each, collecting, and opening a crate. It can be skipped at any step, and skipping builds (free) whichever of the three core rooms are still missing. **Done.** | No |
| 4 | Everything should use generated art; the drawn shapes clash | Anything without painted art falls back to shapes drawn in code | A full inventory of what is still drawn in code, in priority order: `docs/art/ART-LIST.md`. **Done:** everything on it is delivered and wired except the optional wind turbine rotor; images to redo are in its Redo list. | That list |
| 5 | Residents don't hold their weapon; a drawn gun floats beside them; it should only show in a fight | `drawOverlays` draws a small gun shape on every resident all the time. The only fight sheet holds a generic shotgun. | No weapon shape, ever. A weapon shows only while the resident is fighting an incident in their room, using a fight sheet for that weapon's grip: pistol, long gun, heavy, melee or unarmed. Each weapon gets a `grip` in items.json. **Done:** the grip sheets are delivered for both resident bodies and all 11 legends, so the old generic fight sheet is no longer needed. | Yes: grip fight sheets (ART-LIST.md §2) |
| 6 | 48 hours to reach Journeyman is far too long | Mastery is counted in seconds worked, at 48 h for Journeyman and 7 days for Master | Mastery becomes job experience. It builds while working, and every batch collected from the room adds a chunk. Journeyman takes about 2 h of steady play and Master about 10 h. (Retuned after testing to 8 h of job experience for Journeyman and 24 h for Master, with each batch collected adding 120 s, half as much as before.) **Done.** The whole game clock stays real time (see below). | No |
| 7 | Residents' movement looks odd | They move at a constant speed with instant stops. Wander targets come from a hash of the time. When someone is reassigned they teleport, and after a drop they snap to a random spot. | Ease in and out of each move, pause for a varied time between moves, and vary speed slightly per resident. The walk animation keeps pace with the distance covered, so feet don't slide. A reassigned resident walks to the shaft, rides it and walks into the new room. A dropped resident lands where they were dropped. **Done.** | No |

## Why not speed up the whole game clock?

Every timer is tuned against real seconds:
- production batches
- explorers
- quests
- research
- births
- offline catch-up and the reminder notifications

Running the clock faster would shorten all of them together. Everything would need rebalancing, and players would burn through the parts that pace fine now.

The complaint is about how slowly *improvement* comes, and that is almost all mastery. So mastery gets faster and becomes tied to play (collecting), while the rest stays as it is. If other waits still feel long after the next playtest, they can be tuned one by one: the explorer and quest timers, research and training.

## Order of work

1. Mastery pacing, and the wide-wall lookup. Both are small and self-contained.
2. Resident handling in the vault view: drag only, weapons and movement. These are one piece of work, because all three live in the same resident code.
3. The tutorial and the empty start.
4. The art list. It goes to the art session, which delivers the wide walls and grip sheets, and the code then picks them up without changes.

# Round 2 notes

| # | Feedback | Cause | Fix | Art needed? |
|---|---|---|---|---|
| 8 | Pay scrip to move a room instead of demolishing and rebuilding | There is no move command | A `moveRoom` command: the room, its level, crew and any job go to a new valid slot for scrip. It is refused if the move would cut other rooms off. In the vault, it works like build mode, using the room panel's "Move" button. **Done.** | No |
| 9 | Fire extinguishers, not weapons, for fires | Fires use the fight animation | Residents fighting a fire use a `fight_extinguish` sheet (holding an extinguisher), and cave-ins, floods and surges a `fight_repair` sheet. Without a sheet the code falls back to the `work` pose, never a gun. **Done:** both sheets are delivered for residents and all 11 legends. | Yes (ART-LIST §2b) |
| 10 | Can only build 2 slots left of the shaft, though there's dirt beyond | The grid is 26 cells, and the starter shaft sits at x = 6 | A wider grid, with the starting shaft moved right, so both sides have room. Existing saves shift every room by the same offset in a save migration. **Done:** 44 cells per floor, starter shaft at x = 24. | No |
| 11 | Supplies and room production feel unbalanced | Measured: power needed 1.5 to 1.9 times the crew of food or water from a few hours in, because level-3 power rooms drew 1.8 times level 2 | A bot and scripted analysis of each resource's shortage time and surplus, then tuning of rooms.json and consumption. **Done:** see `docs/design/balance-playtest-1.md`. | No |
| 12 | Show seconds until ready, not the batch length | The room panel shows `cycleSeconds` | A live countdown of what's left. **Done.** | No |
| 13 | Nothing collects offline, so you come back to a dead homestead | Offline, rooms finish one batch (or bank it) and then wait. Consumption runs for only 5 minutes. | While you're away, finished batches collect themselves into storage while there's space, and the rest stay banked for you to collect. The away summary says what came in. **Done** (scrip, XP and mastery at half rate offline; resources in full). | No |
| 14 | Ways for residents to raise their stats | Stats only change when a resident is created | Training rooms, one for each stat, where a resident trains that stat up by 1 at a time, taking longer the higher it gets. Each training room needs only a crew. **Done:** seven rooms, stats up to 10, plus +1 in a stat every 10 levels; walls delivered. | Yes (training room walls) |

# Round 3 (live updates)

Added since round 2, while the team kept playing:

- **Halcyon Fizz for caravans and quests:** a bottle (or scrip by the minute of road left) now brings a caravan or a quest party to the end of the road at once, as it already did for explorers. Bottles come from Supply Crates, the daily streak and one at the start.
- **Best-fit gear pickers:** the weapon and outfit pickers rank items by what each resident is doing now.
- **Stat strip:** every row of the People list shows all seven stats.
- **Unequip all:** take every weapon, every outfit or both off everyone at home, back into storage.
- **Auto-equip:** share everyone's weapons and outfits, and what's in storage, out by best fit.
- **Mastery retune:** Journeyman at 8 h of job experience and Master at 24 h, with each batch collected adding 120 s.
- **Settling In:** an optional achievement for playing on 3 different days (in a row or not). It sends a Legendary Supply Crate. The Warden's Seal doesn't need it.
- **Lazy art loading:** at start-up only this homestead's room paintings (at their level and width) and the residents' core sheets load, and the boot screen waits for them (up to 8 s). Other room paintings load when a room is built, merged or upgraded.
- **More scrip:** every room collection pays 6 scrip per width per batch (was 2), plus 50% more for each room level above 1. Lucky bonus rolls come 40% more often and pay double. Expeditions, quests, raider loot, caravans, crate scrip cards, discoveries in the Deep and outposts all pay 1.5× (`balance.scripIncome`). Sales, refunds and trades are unchanged, so buying and reselling can't make money. Measured with the bot over 72 h: about 2.3× the scrip for a player checking in every 10 minutes, about 1.7× at every 30 minutes, and room collections alone about 3×.

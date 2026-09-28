# Playtest 1: feedback and fixes

The first round of notes from the team, what is causing each one, and the fix.
The work happens on the branch `claude/playtest-feedback` and gets merged into the main line once it is cleaned up.

| # | Feedback | Cause | Fix | Art needed? |
|---|---|---|---|---|
| 1 | Drag and drop only; tapping a resident and then a room gets annoying | Tapping a resident selects them, and the next room tap assigns them (`ui.onRoomTap`) | Assign by drag only. Tapping a resident still opens their card, but a room tap never assigns anyone. Rooms light up green only while dragging. | No |
| 2 | Rooms merged to 2 or 3 wide repeat the same image | `rebuildStatics` tiles the single-width back wall once per segment | Look up a painted wall for the room's width (`<level>w2`, `<level>w3`). If there isn't one, fall back to tiling. | Yes: wide walls (ART-LIST.md §1) |
| 3 | Add a short tutorial, and don't start with the rooms built | `newGame` places a fixed starter layout | A first homestead starts with only the door and the elevator shaft. HALCY walks the player through building power, water and food on either side of the shaft (free for the tutorial), dragging the right founder into each, collecting, and opening a crate. It can be skipped, and skipping builds the classic layout. | No |
| 4 | Everything should use generated art; the drawn shapes clash | Anything without painted art falls back to shapes drawn in code | A full inventory of what is still drawn in code, in priority order: `docs/art/ART-LIST.md` | That list |
| 5 | Residents don't hold their weapon; a drawn gun floats beside them; it should only show in a fight | `drawOverlays` draws a small gun shape on every resident all the time. The only fight sheet holds a generic shotgun. | No weapon shape, ever. A weapon shows only while the resident is fighting an incident in their room, using a fight sheet for that weapon's grip: pistol, long gun, heavy, melee or unarmed. Each weapon gets a `grip` in items.json. Until the grip sheets exist, the current fight sheet stands in for guns. | Yes: grip fight sheets (ART-LIST.md §2) |
| 6 | 48 hours to reach Journeyman is far too long | Mastery is counted in seconds worked, at 48 h for Journeyman and 7 days for Master | Mastery becomes job experience. It builds while working, and every batch collected from the room adds a chunk. Journeyman takes about 2 h of steady play and Master about 10 h. The whole game clock stays real time (see below). | No |
| 7 | Residents' movement looks odd | They move at a constant speed with instant stops. Wander targets come from a hash of the time. When someone is reassigned they teleport, and after a drop they snap to a random spot. | Ease in and out of each move, pause for a varied time between moves, and vary speed slightly per resident. The walk animation keeps pace with the distance covered, so feet don't slide. A reassigned resident walks to the shaft, rides it and walks into the new room. A dropped resident lands where they were dropped. | No |

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
| 8 | Pay scrip to move a room instead of demolishing and rebuilding | There is no move command | A `moveRoom` command: the room, its level, crew and any job go to a new valid slot for scrip. It is refused if the move would cut other rooms off. In the vault, it works like build mode, using the room panel's "Move" button. | No |
| 9 | Fire extinguishers, not weapons, for fires | Fires use the fight animation | Residents fighting a fire use a `fight_extinguish` sheet (holding an extinguisher). Until that exists they use the unarmed or idle pose, never a gun. | Yes (ART-LIST §2b) |
| 10 | Can only build 2 slots left of the shaft, though there's dirt beyond | The grid is 26 cells, and the starter shaft sits at x = 6 | A wider grid, with the starting shaft moved right, so both sides have room. Existing saves shift every room by the same offset in a save migration. | No |
| 11 | Supplies and room production feel unbalanced | To be measured | A bot and scripted analysis of each resource's shortage time and surplus, then tuning of rooms.json and consumption. | No |
| 12 | Show seconds until ready, not the batch length | The room panel shows `cycleSeconds` | A live countdown of what's left. | No |
| 13 | Nothing collects offline, so you come back to a dead homestead | Offline, rooms finish one batch (or bank it) and then wait. Consumption runs for only 5 minutes. | While you're away, finished batches collect themselves into storage while there's space, and the rest stay banked for you to collect. The away summary says what came in. | No |
| 14 | Ways for residents to raise their stats | Stats only change when a resident is created | Training rooms, one for each stat, where a resident trains that stat up by 1 at a time, taking longer the higher it gets. Each training room needs only a crew. | Yes (training room walls) |

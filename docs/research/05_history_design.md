# 05 — Fallout Shelter: History, Business Model, Progression Pacing & Design Analysis

Research compiled 2026-09-23 for a fan remake / spiritual-successor project.
Confidence markers: **[V]** = verified in a fetched source; **[S]** = from search-result summaries (secondary, not read in full); **[U]** = uncertain, conflicting, or from general community knowledge and not verified this session.

> Access note: the fallout.fandom.com (Nukapedia), fallout.wiki, SteamDB and several news sites blocked automated fetches (HTTP 402/403). I used Wikipedia (raw wikitext), Bethesda.net, the App Store listing, Sensor Tower blogs, the community "Fallout Shelter FAQ" GitHub wiki (therabidsquirel, last edited May 2026), an archived copy of the Nukapedia rooms page, and search snippets. Check the gaps against the Nukapedia "Fallout Shelter updates" page by hand if you need exact per-version patch notes for 1.7–1.13 and 1.19–1.22.

---

## 1. Fact sheet

| Item | Value | Conf. |
|---|---|---|
| Developer | Bethesda Game Studios, with Behaviour Interactive (Montreal) as co-developer. Bethesda directed the design, mechanics and look and feel; Behaviour did most of the implementation | [V] Wikipedia / [S] fandom snippet |
| Publisher | Bethesda Softworks (ZeniMax Media; owned by Microsoft since March 2021) | [V] |
| Key credits | Producer Craig Lafferty; writer Emil Pagliarulo; artist Istvan Pely; designers Emmanuelle Hardy-Senecal, Tomas Henriquez, Janick Neveu | [V] Wikipedia infobox |
| Engine | Unity | [V] |
| Reveal / launch | Revealed at Bethesda's E3 2015 press conference on **June 14, 2015** and released on iOS the same day (a "shadow drop") | [V] |
| Genre | Construction and management sim with survival elements, single-player, F2P | [V] |
| Stated inspirations (Pete Hines) | *Little Computer People*, *Progress Quest*, *XCOM* (the ant-farm cross-section view), *SimCity*, *FTL* | [V] |
| Pre-history | In 2009 Todd Howard said several iOS Fallout designs had been pitched and rejected. John Carmack (id Software) had an internal proof-of-concept Fallout iPhone game in Nov 2009 | [V] |
| Origin of idea | GameSpot headline: "Fallout Shelter Was Entirely Fallout 4 Director Todd Howard's Idea" (article blocked, headline only) | [S] |
| Positioning quote | At E3 2015 Howard pitched it as genuinely free, with "no paywall timers, Internet connection requirements or build queues", and said they made it for mobile "because it couldn't be done anywhere else" | [S] TIME |
| Max population / layout | 200 dwellers max. 25 floors, 8 room-widths per floor, up to 2 elevators per floor without losing room space | [V] Nukapedia rooms (archived) |

### Platforms and ports

| Platform | Release date | Notes | Conf. |
|---|---|---|---|
| iOS | 2015-06-14 | Launch platform | [V] |
| Android | 2015-08-13 | Launched alongside the 1.1 update (Mr. Handy, deathclaws, mole rats) | [V] |
| Windows (Bethesda.net launcher) | 2016-07-14 | Launched with update 1.6 (quests) | [V] |
| Xbox One / Windows 10 | 2017-02-07 | Xbox Play Anywhere (shared saves and achievements with Win10) | [V] |
| Steam | 2017-03-28 | | [V] |
| PS4 and Nintendo Switch | 2018-06-10 | Shadow-dropped at the E3 2018 showcase. First Fallout game on a Nintendo platform (not counting pinball) | [V] |
| Tesla in-car | May 2020 | Tesla Arcade | [V] |
| Steam delisting | 2025-10-03 | Pulled over Unity CVE-2025-59489 (arbitrary code execution through command-line args). Later relisted with a patch and with mobile content ported | [V] |

**Content-parity split [V, community FAQ]:** Steam, Android and iOS are on the 2.x branch (2.4.0 as of May 2026; 2.6.0 on iOS as of Sept 2026). **Xbox, PS4, Switch and the Win10/Microsoft Store builds are frozen on 1.13.13**, last updated around 2017–2018. Until the Dec 2025 update, Steam also lagged: TV-show content in 2024 was mobile-only. A save from an older version loads in a newer one, but not the other way round.

### Awards

| Award | Category | Result |
|---|---|---|
| 33rd Golden Joystick Awards (2015) | Best Mobile Game | Won |
| The Game Awards 2015 | Best Mobile/Handheld Game | Nominated |
| 19th D.I.C.E. Awards (2016) | Mobile Game of the Year | Won |
| 19th D.I.C.E. Awards (2016) | Strategy/Simulation Game of the Year | Nominated |
| Apple App Store | Editors' Choice badge (current listing) | [V] |

### Reception

| Outlet | Score |
|---|---|
| Metacritic iOS / PC / Switch | 71 / 63 / 61 |
| IGN | 6.8/10 ("desperately in need of a set of endgame goals or resource sinks") |
| Game Informer | 7/10 (shop "completely unobtrusive and unnecessary") |
| Destructoid | 7/10 |
| Pocket Gamer | 7/10 |
| Gamezebo | 4/5 |
| GameRevolution | 3.5/5 (criticized the microtransaction advantage) |
| VentureBeat | 95/100 |
| App Store user rating (Sept 2026) | 4.8/5 from about 565K ratings [V] |

Praise focused on the Fallout flavor, the Vault Boy art and the core loop. Criticism focused on lack of depth, microtransactions and **no ending or endgame**.

### Revenue and player-count milestones

| Date | Metric | Source | Conf. |
|---|---|---|---|
| Launch day (Jun 2015) | #3 top-grossing on iOS. #1 free app in US and UK within a day. #1 iOS game on Jun 26 | Wikipedia | [V] |
| First 2 weeks (to Jul 16, 2015) | **$5.1M** IAP revenue | Wikipedia | [V] |
| Sep 14, 2015 | All-time daily revenue peak of about $237K/day | Sensor Tower | [V] |
| Jun 12, 2016 | 50M "players" | Wikipedia | [V] |
| Feb 2017 | About 75M players (Todd Howard estimate) | Wikipedia | [V] |
| Jun 15, 2018 | About $212K/day spike (3rd anniversary + Switch/PS4 E3 push) | Sensor Tower | [V] |
| Aug 2018 | **$93M** mobile lifetime. App Store 49% / Google Play 51%. US 59% | Sensor Tower | [V] |
| Jun 2019 | **$100M** mobile lifetime (about $68K/day average). **63M installs** (App Store + Google Play). US ~$60M, UK ~$9M, DE ~5%, CA ~4%, AU ~3.4%, China ~$3M | Sensor Tower | [V] |
| Jun 2019 | 150M+ downloads (Bethesda figure) | Wikipedia | [V] |
| Jun 2020 | 170M+ downloads | Wikipedia | [V] |
| Apr 2024 (TV show) | Daily revenue went from about $20K (Apr 10) to $80K (Apr 13). Daily downloads went from about 20K to 60K+. #7 US iOS free games, the highest since Jun 2018. Nearly $4M IAP in May 2024 before settling back | Sensor Tower via GI.biz, Destructoid, Gamigion | [S] |
| Jun 2025 (10th anniversary) | **230M+ downloads** across all platforms | Bethesda.net | [V] |

**Conflict / caveat:** Sensor Tower's 63M installs (mobile stores only, as of 2019) and Bethesda's 150M "downloads" (2019) do not match. Bethesda's figure almost certainly counts every platform, re-installs and possibly Chinese Android stores. Treat Bethesda's numbers as marketing totals. Lifetime revenue after 2019 has not been published, but probably sits in the **$120–150M+** range given the 2024 spike and the paid season passes from 2025 onward **[U — my estimate, not sourced]**.

---

## 2. Update / version history

The main-series version numbers are reconstructed from Wikipedia, Bethesda.net, press coverage and the gameupdatenotifier.com timeline. Rows marked [U] could not be confirmed in a primary source this session.

### 2015–2018 (active development, all platforms)

| Version | Date | Headline features | Conf. |
|---|---|---|---|
| 1.0 | 2015-06-14 | Launch on iOS. Core loop: build rooms, SPECIAL-based jobs, rush, incidents (fire, radroaches, raiders), wasteland exploring, breeding, lunchboxes, objectives | [V] |
| (content drop) | 2015-06-30 | **Preston Garvey** (Fallout 4 tie-in) plus the Laser Musket in lunchboxes, ahead of the Fallout 4 marketing push | [V] |
| 1.0.x | 2015-07-10 | First patch: bug fixes and **Photo Mode** | [V] |
| 1.1 | 2015-08-13 | Released with Android. New enemies: **mole rats** and **deathclaws**. Raiders now steal caps. **Mister Handy** robot (lunchbox/IAP) | [V] (Wikipedia doesn't number it; 1.1 inferred) |
| 1.2 | 2015-10-15 | **Cloud saves**, **Survival Mode**, Russian localization, **Piper** (Fallout 4, iOS lunchboxes), stats page, skip-tutorial option, dwellers loot gear from dead raiders, **Mysterious Stranger** | [V] (Mysterious Stranger [S] GamesRadar) |
| 1.2.x | late Oct 2015 | Halloween decorations and outfits. Removed the explorer cap added in 1.2 | [V] |
| (seasonal) | 2015-11-22 | Thanksgiving decorations and outfits | [V] |
| 1.3 | 2015-12-10 | **Pets** (including Dogmeat) plus a free **Pet Carrier** (new IAP), **evict dwellers**, "Sell All", new dweller conversations and pickup lines, Christmas and snow decorations | [V] |
| 1.4 | Mar 2016 | **Crafting**: Weapon and Outfit Workshops, **Junk** (lunchboxes gain a 5th card: junk), **Barbershop**, parrots and new pet bonuses, new Fallout 4 items, time-of-day display | [V] Bethesda.net |
| 1.5 | Apr 2016 | Dweller appearance customization, **scrapping** items, 3D Touch | [V] |
| 1.6 | 2016-07-14 | Announced at E3 2016 and shipped with the PC version. **Quest system** (Overseer's Office, multi-dweller parties, map), **feral ghouls** and **radscorpions**, combat tweaks. **Nuka-Cola Quantum** was probably introduced here (conflicting snippets say 1.6 or 1.7) | [V] / Quantum [S] |
| 1.7 | ~Aug–Sep 2016 | **Bottle and Cappy** (Nuka-World tie-in, first Special Event Quest), Weekly, Special Event and Holiday quests (skippable with Quantum) | [S] |
| 1.8 | ~Oct 2016 | **Theme Workshop** plus faction room themes (Brotherhood, Enclave, Railroad, Institute and others), unlocked with theme fragments and Quantum | [S] YouTube / wiki snippets |
| 1.9 | 2016-11-17 | Holiday quests and fixes (details unverified) | [S]/[U] |
| 1.10 | ~Feb 2017 | Start of the **Horsemen of the Post-Apocalypse** questline, Secret Agent and Valentine's quests | [S] |
| 1.11 | ~Apr 2017 | 30+ new quests, Easter quest with a legendary pet | [S] |
| 1.12 | 2017-05-24 | Horsemen conclusion (fight the Horsemen, recruit **Three Dog**, legendary outfit), chef seasoning quests, murder mystery, alien investigation, beauty pageant quests | [S] |
| 1.13.x | 2017–2018 (1.13.13 in 2018) | Seasonal quests (fall, Halloween, Thanksgiving, Christmas). **Last version on consoles and the Microsoft Store** | [S]/[U] |

### 2019–2024 (maintenance, then TV-show revival; mobile-first)

| Version | Date | Headline features | Conf. |
|---|---|---|---|
| 1.14 | ~2019–2020 | **Rewarded video ads** on Android and iOS only (see §3) | [V] FAQ (date [U]) |
| 1.15 | ~2022 (1.15.13 on 2023-12-05) | "Anniversary Update" for Fallout's 25th: **"Searching in the Dark"** 6-quest chain. Late 1.15.x builds promoted the TV series | [V] FAQ / [S] |
| 1.16 | 2024-04-11 | **Fallout TV series tie-in** (show premiered Apr 10, 2024). 8-quest **"Power Struggle"** questline. **Lucy, The Ghoul, Maximus**, Ma June, Snake Oil Salesman, **Snip Snip** (a stronger Mr. Handy variant), CX404 (pet). Free Vault 33 jumpsuit (+3 P, +2 L) until May 7. Mobile only at first | [V] TouchArcade/Bethesda / FAQ |
| 1.17 | ~May–Jun 2024 | More show content (details unverified) | [U] |
| 1.18 | 2024-07-16 | Chet, Norm and Moldaver characters, Moldaver's Armor, BOS Assault Rifle | [S] |
| 1.19–1.21 | Oct–Dec 2024 | Seasonal and holiday content, fixes | [U] |
| 1.22.x | Jan–Nov 2025 | 10th anniversary (June 2025): up to 70% off lunchboxes, June 16–21 login rewards (lunchboxes, pet carriers, Mr. Handys, Nuka), plus the Unity security patch (1.22.7/8, Oct 2025) | [V] Bethesda.net / [S] |

### 2025–2026: "Seasons" / Experimental Vaults (2.x branch)

**Update 2.0.0 (2025-12-12)** is billed as the largest update since quests in 2016. It released on **Steam, Android and iOS at the same time**. On Steam it also brought over "years of content" that had been mobile-only (Power Struggle, Searching in the Dark, new dwellers, enemies and exterior themes). It timed with Fallout TV Season 2 (Dec 2025).

- **Experimental Vault:** a separate, limited-time vault that is a 4th save slot, built from scratch each season with its own ruleset. A season lasts **about 40 days**.
- **Season Pass (battle pass):** 20 ranks plus 5 bonus lunchbox ranks. Players earn badges from seasonal challenges, and Quantum spent in *any* vault also counts. The free track (bottom row) gives lunchboxes, pet carriers and Mr. Handy but usually no new season content. Paid **Season Pass costs $9.99** and unlocks both rows. **Premium costs $19.99** (or $9.99 on top of the pass) and adds exclusive legendary dwellers, weapons, outfits, pets and 25 badges. Rewards are retroactive and can be redeemed once in each vault.
- **Leaderboards** (friends and seasonal), plus a **Lucky Spin** wheel that uses a season currency (poker chips, gold bullion, tokens).

| # | Season | Dates | Ver. | Hook | Conf. |
|---|---|---|---|---|---|
| 1 | **Viva New Vegas** | 2025-12-12 → 2026-01-18 | 2.0.0 | TV S2 tie-in: take control of Novac. Lucy, Maximus and The Ghoul. Poker-chip Lucky Spin | [V] |
| 2 | **House Always Wins** | 2026-01-21 → 2026-02-28 | 2.1.0 | Lucky 38 and New Vegas at Night themes, leaderboard | [S] |
| 3 | **Ultracite Fever** | 2026-03-04 → 2026-04-12 | 2.2.x | Fallout 76 / Appalachia theme. 2 new rooms (Ultracite mine, Ultracite weapon crafting). Waves of **Scorched** attacks | [V] Bethesda.net |
| 4 | **In Gold We Trust** | 2026-04-15 → 2026-05-24 | 2.3.0 | Enclave attacks the experimental vault. Gold-bullion wheel | [S] |
| 5 | **Synthetic Identity** | 2026-05-27 → 2026-07-12 | 2.4.0 | Institute / Synths. "Synth attacks" work like raider raids | [S] |
| 6 | Viva New Vegas (re-run) | 2026-07-16 → 2026-08-30 | 2.5.x | First rerun of a season | [S] |
| 7 | (current) | from 2026-09-01 | 2.6.0 | App Store notes: "Design a new Experimental Vault… Climb the leaderboard" | [V] App Store (name [U]) |

**Takeaway:** Bethesda spent 2019–2023 in maintenance mode. It revived the game around transmedia beats (TV S1 in Apr 2024, TV S2 in Dec 2025) and then moved to a **live-ops battle-pass cadence** of about 6 weeks per season, with a separate sandbox vault. The main vault's "endgame problem" is sidestepped rather than fixed: seasons restart the fun early game on purpose.

---

## 3. Monetization

### Currencies and premium goods

| Item | What it is | Free sources | Conf. |
|---|---|---|---|
| **Caps** | Soft currency for building, upgrading, reviving and so on | Resource collection (luck bonus), exploring, quests, objectives, Mr. Handy exploring, Mysterious Stranger, selling items | [V] |
| **Lunchbox** | 5 cards. The first 4 are 1 caps card, 1 resource card, 1 junk card and 1 item card in random order. The 5th is a **guaranteed rare-or-better card**: 500 caps, a rare/legendary weapon, outfit or dweller, a pet, or a Mr. Handy | Objectives, quests, 7th-day daily login reward, achievements/milestones, rewarded ads (5%), season free track | [V] FAQ |
| **Pet Carrier** (since 1.3) | Contains 1 pet (common, rare or legendary) | Objectives and quests (rare), ads (5%), events | [V] |
| **Mr. Handy** (since 1.1) | Robot: auto-collects on one floor, fights incidents weakly, explores (caps only, takes no damage, returns at 5,000 caps). Max 1 per floor, 5 in the wasteland | Lunchbox rare card, objectives, quests | [V] FAQ |
| **Nuka-Cola Quantum** (~1.6) | Premium time-skip. **1 Quantum per 2 hours skipped** (explore return, quest travel, crafting, training, barbershop). Objective skips cost 2, 3, 5, 8, 12, 18, 27, 41, then 62 (capped). Quest skip costs 1. Theme recipe costs 3 per missing fragment | Objectives, quests, lunchbox resource cards (2–6), Bottle and Cappy, ads (40%) | [V] FAQ |
| **Vault-Tec Starter Pack** | Once per vault: 1 legendary dweller, 2 rare dwellers, 1 legendary pet, 1 Mr. Handy, about 10 Quantum, resources | — | [S] Bethesda Support |
| **Season Pass / Premium** (2.0+) | $9.99 / $19.99 per season | Free track exists | [V] |

### Current US iOS price points (App Store, Sept 2026) [V]

| IAP | Price |
|---|---|
| Single Lunchbox | $0.99 |
| Bundle of 5 Lunchboxes | $2.99 |
| Bundle of 15 Lunchboxes | $6.99 |
| Bundle of 40 Lunchboxes | $9.99 |
| Mr. Handy | $0.99 |
| Bundle of 5 Mr. Handys | $2.99 |
| Bundle of 5 Pet Carriers | $6.99 |
| Six Pack (Nuka-Cola Quantum) | $0.99 |
| Case of Nuka-Cola Quantum | $3.99 |
| Vault-Tec Starter Pack | $4.99 |
| Season Pass / Premium Pass | $9.99 / +$9.99 (or $19.99) |

**[U]** The 2015 launch prices were higher: commonly cited as $0.99 for 1, $3.99 for 5, $9.99 for 15 and $19.99 for 40 lunchboxes (5 Mr. Handys for $3.99). The current 40-for-$9.99 bundle is much cheaper per box, possibly from a permanent price cut or an anniversary sale at the time of the fetch.

### Ads (v1.14+, Android and iOS only; not on Steam or consoles) [V FAQ]

| Ad | Cooldown | Requirement | Reward |
|---|---|---|---|
| Vault Ad (TV icon) | 2 h (per device) | Pop 13+ | Caps 50% (scaled 1–5× by room count), Quantum 40%, Lunchbox 5%, Pet Carrier 5% |
| Explorer Ad | 1.5 h | — | Advance explorer by 30 min, with guaranteed gear and junk drops |
| Room Rush Ad | 30 min | — | Guaranteed successful rush |
| Mysterious Stranger Ad | ? | — | Doubles the Stranger's caps |

All ads are opt-in rewarded videos. There are **no forced interstitials** [S].

### The "no paywall" reputation and why it held up

- There are **no build timers** (rooms appear instantly and cost only caps), no energy system, no build queue and no always-online requirement. These were explicit E3 selling points.
- The only accelerant is the **Rush**, which is free but gambles on an incident: failure chance = 40% − 1.5 × (avg room stat + avg luck), minimum 10%, **+10% for each recent rush up to 6** [V FAQ]. Rush is the "pay-with-risk" alternative to "pay-with-money".
- Spending buys **variance and convenience** (lunchbox rares, Quantum skips, Mr. Handy automation), not access. Every room is unlocked by population, never by payment.
- Monetization was front-loaded into the **launch-hype window** ($5.1M in 2 weeks). Lifetime per-install revenue is very low: about $100M / 63M installs ≈ **$1.60 per install** [derived]. The model relied on scale and on the game marketing Fallout 4.
- Critics were split. Game Informer called the shop "completely unobtrusive"; GameRevolution disliked the "micro-transaction advantage". The 2025 season pass drew cynicism (PCGamesN: "we only got this big update… because Bethesda suddenly had something it wanted to sell"), and Fallout Shelter Online and TES: Castles were criticized as much more aggressive.

---

## 4. Progression pacing

### Room unlocks by population [V — archived Nukapedia rooms table]

Costs are in caps. The "+" column is the extra cost for each additional room of that type already built. "Up L2/L3" are upgrade costs for a single-width room.

| Pop | Room | Category / Stat | Base cost | + each | Up L2 | Up L3 | Width |
|---|---|---|---|---|---|---|---|
| 0 | Vault door | Defense | — | — | 500 | 2,000 | 2 |
| 0 | Elevator | — | 100 | +25 | — | — | 1 |
| 0 | Living quarters | Capacity / C | 100 | +25 | 500 | 1,500 | 1–3 |
| 0 | Power generator | Prod / S | 100 | +25 | 500 | 1,500 | 1–3 |
| 0 | Diner | Prod / A | 100 | +25 | 500 | 1,500 | 1–3 |
| 0 | Water treatment | Prod / P | 100 | +25 | 500 | 1,500 | 1–3 |
| 12 | Storage room | Capacity / E | 300 | +75 | 750 | 1,500 | 1–3 |
| 14 | Medbay (Stimpaks) | Prod / I | 400 | +100 | 1,000 | 3,000 | 1–3 |
| 16 | Science lab (RadAway) | Prod / I | 400 | +100 | 1,000 | 3,000 | 1–3 |
| 18 | **Overseer's office** (quests) | — | 1,000 | — | 3,500 | 15,000 | 2 |
| 20 | **Radio studio** (attracts dwellers, +happiness) | Prod / C | 600 | +150 | 1,500 | 4,500 | 1–3 |
| 22 | Weapon workshop | Crafting | 800 | +600 | 8,000 | 60,000 | 3 |
| 24 | Weight room | Training / S | 600 | +150 | 1,500 | 4,500 | 1–3 |
| 26 | Athletics room | Training / A | 600 | +150 | 1,500 | 4,500 | 1–3 |
| 28 | Armory | Training / P | 600 | +150 | 1,500 | 4,500 | 1–3 |
| 30 | Classroom | Training / I | 600 | +150 | 1,500 | 4,500 | 1–3 |
| 32 | Outfit workshop | Crafting | 1,200 | +900 | 12,000 | 90,000 | 3 |
| 35 | Fitness room | Training / E | 600 | +150 | 1,500 | 4,500 | 1–3 |
| 40 | Lounge | Training / C | 600 | +150 | 1,500 | 4,500 | 1–3 |
| 42 | Theme workshop | Themes | 3,200 | +2,400 | 16,000 | 120,000 | 3 |
| 45 | Game room | Training / L | 600 | +150 | 1,500 | 4,500 | 1–3 |
| 50 | Barbershop | Cosmetic | 10,000 | +5,000 | 50,000 | — | 2 |
| 60 | Nuclear reactor (tier 2 power) | Prod / S | 1,200 | +300 | 3,000 | 9,000 | 1–3 |
| 70 | Garden (tier 2 food) | Prod / A | 1,200 | +300 | 3,000 | 9,000 | 1–3 |
| 80 | Water purification (tier 2 water) | Prod / P | 1,200 | +300 | 3,000 | 9,000 | 1–3 |
| 100 | Nuka-Cola bottler (food + water) | Prod / E | 3,000 | +750 | 15,000 | 45,000 | 1–3 |

Notes: some rooms also have population gates on their upgrades. For example, upgrading the Theme workshop needs 65 dwellers [V sharlikran fsdoc]. The Ultracite rooms from Season 3 exist only in the experimental vault. After 100 dwellers there are **no new room unlocks** (100 → 200 is pure scaling). This is a major pacing cliff.

### Incident thresholds (population must be *greater than* the value) [V FAQ]

| Incident | Normal (natural) | Normal (failed rush) | Survival (natural) | Survival (rush) |
|---|---|---|---|---|
| Fire | 2 | 1 | 2 | 1 |
| Radroaches | 9 | 8 | 6 | 5 |
| Raiders | 14 | — | 16 | — |
| Aliens (2.0+) | 26 | — | ? | — |
| Mole rats | 31 | 30 | 21 | 20 |
| Feral ghouls | 41 | — | 41 | — |
| Radscorpions | 51 | 50 | 51 | 50 |
| **Deathclaws** | **61** | — | **36** | — |

Incident difficulty scales mainly with **average dweller level**; room width and level matter much less. An incident timer ticks in the background and raises the chance of an incident over time, and a failed rush resets it. Deathclaw chance rises with door openings (+0.05 each) and radio calls (+0.07–0.2 each), capped at 0.8. Incidents **never fire while the app is closed or backgrounded**.

### Phase-by-phase pacing (community knowledge, generally consistent across guides [S/U])

| Phase | Pop range | Session length / focus | Key unlocks & goals | Pain points |
|---|---|---|---|---|
| **First hour (tutorial)** | ~5 → 15–20 | Continuous play. The tutorial walks you through power → water → food, living quarters and the first rushes. The vault door takes wasteland arrivals | Storage (12), Medbay (14), Science lab (16), Overseer's office (18, **quests**), Radio (20). The first objectives pay out lunchboxes quickly, a tuned early dopamine hit | Power shortfalls shut rooms down. Fires and roaches from rushes. Raiders at 15+ against unarmed dwellers |
| **Early game** | 20 → 40 | Several short check-ins a day (about 5–10 min) | Weapon workshop (22), training rooms (24–35), Outfit workshop (32), breeding (pregnancy about 3 h, child to adult about 3 h [U]), first explorers | Too much breeding causes starvation (pregnant women and children don't work). Mole rats at 31+ |
| **Mid game** | 40 → 60 | Check-ins every few hours. Explorers left out overnight | Lounge (40), Theme workshop (42), Game room (45), Barbershop (50). Crafting legendaries from junk. Quest chains become the main content | Feral ghouls (41+), radscorpions (51+) and **deathclaws (61+)** are a difficulty spike, so many players stall on purpose at 59–60 |
| **Late game** | 60 → 100 | 1–2 check-ins a day | Tier-2 production (60/70/80), Nuka-Cola bottler (100). Max-SPECIAL, max-level dwellers. Collection completion | Resource needs outscale single-room output. Radio room deathclaw calls |
| **Endgame** | 100 → 200 | Mostly quests plus seasonal events, or quitting | No new rooms. Survival Guide collection, all-legendary gear, a 200-dweller perfect vault, the Steam achievement list. From 2025, **seasons** | "Nothing to do" (see §5) |

### Standard strategies (widely repeated in guides and on reddit)

| Strategy | Rationale | Conf. |
|---|---|---|
| **Build 3-wide rooms and stack identical rooms vertically**. Run the first elevator straight down so each side of the shaft has room for a 3-wide block | Merged, upgraded 3-wide rooms beat 3 singles on production, capacity and incident resistance. Elevator shafts waste width | [S] |
| **Place high-risk and important rooms away from dirt edges.** Mole rats spawn in rooms touching the dirt/rock edge | Containment | [S] |
| **Keep population low (< 60) until you're geared.** Some players cap at 59–60 for a long time | Deathclaws start at 61 and scale with average dweller level | [V] thresholds / [S] strategy |
| **Train Endurance to 10 before levelling**, ideally at level 1 with +E gear | HP gained per level is calculated from Endurance *at the moment of levelling*, so max HP is permanently lost otherwise. Dwellers start at 105 HP | [S] |
| **Put guards with the best weapons at the vault door** (2 slots) and upgrade the door | Stops raiders and deathclaws before they reach inner rooms | [S] |
| **Don't over-breed.** Stagger pregnancies | Pregnant women can't fight incidents, children don't work, and consumption jumps | [S] |
| **Match workers to stats** (S = power, P = water, A = food, I = medbay/lab, C = radio/living, L = caps and rush). Fill rooms fully | Output scales with total stat. Understaffed rooms fail incidents | [V] Nukapedia |
| **Rush early when luck is high, with a cooldown between rushes** | Rush failure stacks +10% per recent rush | [V] |
| **Explore with high-Endurance, high-Luck dwellers carrying 25 Stimpaks + 25 RadAway**, and recall before HP runs out | Explorers are the main source of legendary gear and junk | [S] |
| **Save and exit properly** rather than leaving the app in the background | Backgrounded apps may keep draining resources (see §5) | [S] |
| **Multiple single radio rooms** instead of one triple (for offline play) | Each room holds one waiting "signal" when you're offline, so 3 singles yield 3 dwellers after 24 h | [V] Nukapedia |

### Production-math notes (useful for the remake's balancing) [V — Nukapedia archive]

- Each production room has a hidden time pool. Every second, each worker adds their relevant stat (plus the vault happiness bonus) to it. When the pool is full, the room shows a harvestable icon and **stops until it is tapped** (no auto-collect except Mr. Handy).
- Pool sizes (single room): Power 1,320; Diner and Water 960; Garden, Purifier and Bottler 1,200; Medbay and Lab 2,400; Reactor 1,800. Merging doubles or triples the pool, and upgrading raises output per cycle.
- Collecting has a luck-based chance of bonus caps.
- Resource shortages: no power turns rooms off (which cascades to food and water); no food drains HP; no water causes radiation damage.

---

## 5. Design analysis

### Why it worked

| Factor | Analysis |
|---|---|
| **Shadow-drop + IP marketing** | Launched the same moment it was revealed, bundled with the Fallout 4 reveal hype. It was effectively a F4 marketing product that paid for itself. Fallout 4 characters (Preston, Piper, later Nuka-World's Bottle and Cappy) cross-promoted |
| **Instantly readable "ant farm" view** | A side-on cross-section (after XCOM) with Vault Boy art and charming idle animations and conversations. You can see every system at a glance, and it screenshots and shares well (Photo Mode) |
| **Tamagotchi / Little Computer People loop** | Named dwellers with SPECIAL stats, relationships, babies and deaths. Players form attachments. Emergent stories (evicting "lazy" dwellers, dweller "gardens") drove word of mouth |
| **Fair F2P** | No build timers or energy, and every room is reachable for free. Rush turns risk into speed. This generated goodwill and press ("genuinely free") |
| **Low cognitive load, many micro-decisions** | Drag a dweller to a room, tap to collect, respond to incidents. Short sessions with visible progress |
| **Clear milestone ladder** | Population gates every 2–5 dwellers early on (12, 14, 16, 18, 20 …) give a steady drip of new rooms. The spacing widens later (60, 70, 80, 100) |
| **Scalable content hooks** | Quests (1.6+) added authored narrative on top of the sandbox. Themes, pets and legendary dwellers are cheap-to-make collectibles |

### Core loops

- **Micro loop (seconds):** production icon → tap to collect → caps/resource pop → (optional) rush → incident mini-battle.
- **Session loop (minutes):** check resources → reassign workers → collect everything → send or recall explorers → start training, crafting or pregnancies → close.
- **Meta loop (days/weeks):** population milestones → new room tiers → train SPECIAL → gear up → harder incidents and quests → legendary collection. From 2025, a 40-day seasonal reset in a separate vault with a battle pass.
- **Objectives:** 3 active at a time. Rewards are caps, Quantum or lunchboxes, and skipping costs Quantum on an escalating scale. These steer players to try every system [V/S].

### Offline progress: what is simulated while the app is closed

| System | Behavior when closed | Conf. |
|---|---|---|
| Production rooms | Keep filling their pool until the **first cycle completes**, then halt awaiting a tap. No accumulation beyond one batch | [V] Nukapedia + Steam threads |
| Resource consumption | Stops, reportedly after a short window. One source says "about 4 minutes", another "1–2 minutes", and players say production and consumption both stop "as soon as the next production is complete". **Conflicting.** If the app is only backgrounded (not killed), consumption may continue and cause starvation | [S] conflicting |
| Incidents / attacks | **Never** occur while closed or backgrounded. Some UIs (crafting, explorer storage) also block incidents while their timer keeps ticking | [V] FAQ |
| Wall-clock timers | **Continue**: SPECIAL training, crafting, pregnancies, child growth, quest travel, explorer return trips, barbershop | [V]/[S] |
| Wasteland explorers | **Keep exploring and taking damage.** Encounters are generated for the elapsed time on return, so explorers left too long can die. Long absences (24+ days) can produce bugged huge loot | [V] FAQ / [S] |
| Radio rooms | Keep working. Each holds one waiting signal (new dweller) | [V] |
| Mr. Handy | Collects on its floor while you're present. Offline behavior is unclear (GameRant says it collects while away) | [S]/[U] |
| Health / radiation | Dwellers inside regenerate | [S] |
| Device clock | Changing it breaks timers, and explorers find nothing | [V] FAQ |

**Design read:** the vault is deliberately *safe* offline (no attacks, no starvation) while *time-based rewards* progress. Coming back means collecting and seeing what your explorers found. Unlike a pure idle game, production does not stockpile, so logging in is required. This caps offline gains and creates a reason for regular check-ins, without the punishment of returning to a dead vault.

**Notifications [U — not verified this session]:** push notifications (iOS/Android) for explorer or quest events, training and crafting completion, and babies, plus marketing pushes for events and seasons. The exact list couldn't be confirmed, so check a current install.

### Common criticisms

| Criticism | Evidence |
|---|---|
| **No endgame / no ending** | Wikipedia reception summary. IGN: "desperately in need of a set of endgame goals or resource sinks". Steam reviews: fun "for the first 20 hours… after a while it becomes pretty repetitive" |
| **Self-sufficient vault = no challenge** | "There is zero incentive to keep playing… attacks are more annoying than engaging" (Metacritic / AOTF user review). IGN: "weak or nonexistent challenge once the vault gets older" |
| **Tedium at scale** | Manually tapping 30+ rooms, micromanaging 200 dwellers and repetitive quest combat. Few automation tools apart from paid Mr. Handy |
| **Late game has no new rooms** | Nothing new after pop 100, and 60→100 only adds bigger versions of existing rooms |
| **Incidents scale badly** | Deathclaw/radscorpion difficulty tied to average level feels punishing and pushes players to stay low-level or low-population |
| **Platform fragmentation** | Consoles frozen at 1.13.13. Mobile-first content left Steam behind for years |
| **RNG monetization** | Lunchbox loot boxes (rare card usually 500 caps or a rare dweller). Later seasons put new content behind the paid pass tiers |

### Lessons for a remake

1. Keep the fair F2P feel: no build timers, risk-based rush, all rooms reachable for free.
2. Fix the **100→200 dead zone** with new tiers or a prestige system (e.g. "found a new vault", which is essentially what Experimental Vaults do) and resource sinks.
3. Offer **automation as progression**, not only as a purchase (e.g. unlockable auto-collect).
4. Build **offline rules** that are explicit and deterministic: simulate on resume from a saved timestamp, cap production at one batch per room (or N batches), no incidents, and continue timers. This also avoids the "backgrounded app starved my vault" bug.
5. Decouple incident difficulty from average dweller level, or telegraph it better, so players aren't punished for levelling up.
6. Seasonal "fresh vault" modes are a proven retention restart.

---

## 6. Similar games and competitors

| Game | Year / Dev | Relevance |
|---|---|---|
| **Tiny Tower** | 2011, NimbleBit | Direct ancestor of the cross-section vertical builder on mobile: floor stacking, named "Bitizens", jobs by aptitude. Widely seen as a strong influence **[U — not stated by Bethesda]** |
| **Little Computer People** | 1985, Activision | Named by Hines. The "watch tiny people live in a cross-section house" tamagotchi feel |
| **XCOM** (UFO Defense 1994 / Enemy Unknown 2012) | Firaxis | Named by Hines. The ant-farm base-view cross-section |
| **FTL: Faster Than Light** | 2012, Subset | Named by Hines. Assigning crew to rooms, room-level incidents (fires, boarders) |
| **Progress Quest** | 2002 | Named by Hines. Idle, progresses-without-you exploring |
| **SimCity** | Maxis | Named by Hines. Resource balance and zoning |
| **Sheltered** / **Sheltered 2** | 2016 / 2021, Unicube / Team17 | Premium PC/console post-apocalyptic bunker survival: harder, deeper and more grim. Good reference for an alternative "real survival" tone |
| **Fallout Shelter Online** | 2019 (CN) / Jun 2020 (SEA, JP, KR), Shengqu Games / Gaea | Official MMO sequel: gacha heroes, auto-battle, PvP. Criticized for aggressive monetization. Never released in the West |
| **Westworld** (mobile) | 2018, Behaviour / WB | Near-clone by Fallout Shelter's own co-developer. Bethesda sued in June 2018 (copyright, breach of contract, trade secrets, alleging reused code). Settled Jan 2019, and the game was pulled (servers off Apr 16, 2019) |
| **The Elder Scrolls: Castles** | Sept 10, 2024, Bethesda | Official "spiritual successor": castle cross-section, dynasties, rulings, a year passing per real day. Reviews mixed (GamesRadar 2.5/5: "a retooled Fallout Shelter with more options and the same problems"). More aggressive monetization (battle pass with 2 paid tiers, bundles, loot boxes) |
| **Fallout Shelter: The Board Game** | 2020, Fantasy Flight | Tabletop adaptation of the same loop |
| Others to study | — | *Oxygen Not Included* and *RimWorld* (deep colony-sim systems), *Surviving Mars*, *Idle Miner Tycoon* (idle offline accrual), *Pocket Build*, *Monster Hotel* / *Tiny Tower Vegas* (cross-section F2P), *Frostpunk* (survival and morale tension) |

---

## 7. Legal considerations for a fan remake

**This is not legal advice. Consult an IP lawyer before public or commercial release.**

| Topic | Summary |
|---|---|
| **Ownership** | Fallout IP (names, logos, Vault Boy, Vault-Tec, Nuka-Cola, SPECIAL branding, lore, characters, art, music, code) belongs to **Bethesda Softworks / ZeniMax Media**, a subsidiary of **Microsoft** since 2021. "Fallout", "Fallout Shelter", "Vault-Tec", "Nuka-Cola" and "Vault Boy" are registered trademarks, and the art and text are copyrighted |
| **Mechanics are generally not copyrightable** | The US Copyright Office says "copyright does not protect the idea for a game." *Spry Fox v. 6Waves* (Triple Town/Yeti Town) held that a hierarchical match-3 *idea* is not protectable. So a cross-section vault builder with stat-based jobs, rushing and exploring is legally reusable in principle |
| **…but expression and "look and feel" is** | *Tetris Holding v. Xio* (2012): a clone that copied the visual expression and overall look was found infringing even though the rules are unprotectable. *Spry Fox* also found possible infringement from copying the expression. Bethesda's own suit against Behaviour/WB over *Westworld* alleged "the same or highly similar game design, art style, animations, features" plus reused code. It settled and the game was pulled. **Close visual mimicry (Vault Boy-style dwellers, the vault-door gear, the same UI layout) is the main risk** |
| **Trademark** | Using "Fallout", "Vault-Tec", "Nuka-Cola", "Pip-Boy" or "SPECIAL" in the title, store listing or marketing risks trademark claims (likelihood of confusion, dilution) and store takedowns. Store platforms act on trademark complaints quickly |
| **Microsoft Game Content Usage Rules** | They allow non-commercial fan *videos and creations* using game content, but forbid selling, charging, using content in paid apps or reverse engineering to extract assets. The page says they apply to "games… published and owned by Microsoft Studios" and **do not cover Bethesda titles**, which have separate policies [V]. **Neither permits a standalone fan game using Fallout assets** |
| **Bethesda's track record** | It has been tolerant of mods (Creation Kit) and some fan media (Nuka Break), but projects involving extracted assets or voice work have shut down after legal consultation (Capital Wasteland Project). Fallout: Vault 13 stopped for internal reasons, not a C&D. There have also been C&Ds to fan sites. Enforcement is selective and unpredictable |
| **Practical recommendations** | (1) Use an **original setting and names** (not Vault-Tec or Nuka-Cola). Write your own attribute system instead of "S.P.E.C.I.A.L." (the 7-stat concept is fine; the branding isn't). (2) Make **all original art, audio and UI**, and avoid a Vault Boy-lookalike mascot or the cog vault door. (3) Don't decompile or reuse Fallout Shelter code or assets (this was central to the Westworld claim). (4) Keep a "Fallout Shelter-inspired" mention to descriptive, non-trademark use, or leave it out entirely. (5) If you do make a true Fallout fan game, keep it **free, non-commercial, clearly unofficial**, and expect that a takedown is possible |

---

## 8. Open questions and uncertainties

- Exact feature lists for 1.7–1.13 and 1.17–1.22. Nukapedia's "Fallout Shelter updates" page is the best source but blocked automated access.
- When Nuka-Cola Quantum was introduced (1.6 vs 1.7); snippets conflict.
- Offline consumption window (about 4 min vs 1–2 min vs "until next cycle").
- The Season 7 name (Sept 2026, v2.6.0) and whether seasons 2–6 had exact version numbers as listed.
- Current lifetime revenue after 2019, and whether the 40-lunchbox $9.99 price is permanent.
- Push-notification specifics.
- Whether Bethesda has ever given a GDC or Game Developer postmortem. None was found this session; the design rationale here comes from E3 remarks, the Hines inspiration list and reviews.

---

## Sources

- Wikipedia, Fallout Shelter (raw wikitext): https://en.wikipedia.org/wiki/Fallout_Shelter
- Bethesda.net, 10th Anniversary: https://bethesda.net/en-US/news/fallout-shelter-10th-anniversary
- Bethesda.net, Update 1.4: https://bethesda.net/en-US/news/fallout-shelter-update-1-4-now-available-crafting-barbershop-new-rooms-and
- Bethesda.net, Seasons / Viva New Vegas: https://fallout.bethesda.net/en-US/news/fallout-shelter-seasons-officially-launches-with-viva-new-vegas
- Bethesda.net, Ultracite Fever: https://fallout.bethesda.net/en-US/news/fallout-shelter-ultracite-fever-season-begins-now
- Bethesda.net, In Gold We Trust: https://fallout.bethesda.net/en-US/news/fallout-shelter-in-gold-we-trust-season
- Bethesda Support, Season Pass: https://help.bethesda.net/app/answers/detail/a_id/73404/~/season-pass---fallout-shelter
- Bethesda Support, Starter Pack: https://help.bethesda.net/app/answers/detail/a_id/34967/~/what-is-the-fallout-shelter-vault-tec-starter-pack
- Apple App Store listing (IAP prices, v2.6.0): https://apps.apple.com/us/app/fallout-shelter/id991153141
- Game Update Notifier (version dates): https://gameupdatenotifier.com/g/fallout-shelter
- Steam News, Largest update: https://store.steampowered.com/news/app/588430/view/514102575975368959
- Steam News, House Always Wins: https://store.steampowered.com/news/app/588430/view/507351614918492483
- PCGamesN, Steam season pass update: https://www.pcgamesn.com/fallout-shelter/update-steam-season-pass
- TweakTown, $10 season pass: https://www.tweaktown.com/news/109356/fallout-shelter-adds-dollars10-season-pass-in-hopes-of-capitalizing-on-fallout-tv-show-season-2/index.html
- PC Gamer, Season 2 tie-in: https://www.pcgamer.com/games/fallout/get-a-head-start-on-fallout-season-2-the-new-fallout-shelter-update-adds-the-ghoul-lucy-and-maximus-in-a-vault-under-new-vegas/
- GameSpew, 230M downloads: https://www.gamespew.com/2025/06/fallout-shelter-10th-anniversary/
- GameSpew, Season update: https://www.gamespew.com/2025/12/fallout-shelter-update/
- Nukapedia seasons / season pages (search snippets): https://fallout.fandom.com/wiki/Fallout_Shelter_seasons , https://fallout.fandom.com/wiki/House_Always_Wins_(Fallout_Shelter) , https://fallout.fandom.com/wiki/Ultracite_Fever , https://fallout.fandom.com/wiki/In_Gold_We_Trust , https://fallout.fandom.com/wiki/Synthetic_Identity , https://fallout.fandom.com/wiki/Viva_New_Vegas
- Nukapedia, Fallout Shelter rooms (Wayback archive copy): https://fallout.fandom.com/wiki/Fallout_Shelter_rooms
- PC Gamer, Unity delisting: https://www.pcgamer.com/software/security/fallout-shelter-pentiment-and-other-unity-games-have-been-delisted-on-steam-thanks-to-unitys-security-vulnerability/
- TouchArcade, TV show update (Apr 2024): https://toucharcade.com/2024/04/12/fallout-shelter-new-update-fallout-tv-series-prime-quest-characters/
- Android Police, TV characters: https://www.androidpolice.com/fallout-tv-show-characters-in-shelter/
- GamesRadar, Pets update: https://www.gamesradar.com/fallout-shelter-pets-update/
- GamesRadar, Mysterious Stranger & Survival: https://www.gamesradar.com/todays-fallout-shelter-update-adds-mysterious-stranger-and-survivor-mode/
- Digital Trends, 1.7 weekly quests / Nuka-World: https://www.digitaltrends.com/gaming/fallout-shelter-updates-with-weekly-quests-nuka-world-event/
- PhoneArena, 1.7 characters: https://www.phonearena.com/news/Fallout-Shelter-for-Android-iOS-updated-with-two-new-characters-more-quests_id84539
- Steam News, Update 1.12: https://store.steampowered.com/news/app/588430/view/3929910003151908320
- The Fallout Shelter FAQ (GitHub wiki), Incidents, Lunchboxes, Ads, Quantum, Experimental Vaults, Mr. Handy, Rooms, Important Info: https://github.com/therabidsquirel/The-Fallout-Shelter-FAQ/wiki
- Sharlikran Fallout Shelter docs, Theme Workshop: http://sharlikran.github.io/fsdoc/ThemeWorkshop.html
- Sensor Tower, $93M: https://sensortower.com/blog/fallout-shelter-revenue
- Sensor Tower, $100M: https://sensortower.com/blog/fallout-shelter-revenue-100-million
- GamesIndustry.biz / Sensor Tower (TV show spike): https://x.com/GIBiz/status/1780164901173932335
- Destructoid, TV revenue: https://www.destructoid.com/fallout-shelter-adds-the-tv-show-characters-as-daily-revenue-shoots-up/
- Gamigion, TV series revenue: https://www.gamigion.com/fallout-tv-series-how-game-revenues-grow-fall-out/
- TIME, Fallout Shelter on phones: https://time.com/3920939/fallout-shelter/
- GameSpot, Howard's idea: https://www.gamespot.com/articles/fallout-shelter-was-entirely-fallout-4-director-to/1100-6442395/
- GameRant, Does it run while closed: https://gamerant.com/fallout-shelter-run-while-closed-save/
- Steam discussions, offline behavior: https://steamcommunity.com/app/588430/discussions/0/135513421440986866/ , https://steamcommunity.com/app/588430/discussions/0/135512931353183278/
- Steam discussions / reviews on endgame: https://steamcommunity.com/app/588430/discussions/0/1496741765141500364/ , https://attackofthefanboy.com/reviews/fallout-shelter-review/ , https://www.metacritic.com/game/fallout-shelter/user-reviews/
- Fallout Shelter Online: https://screenrant.com/fallout-shelter-online-gacha-system-pvp-combat/ , https://fosol.shengqu.com/en/index.html
- The Elder Scrolls: Castles: https://en.wikipedia.org/wiki/The_Elder_Scrolls:_Castles , https://www.gamesradar.com/games/the-elder-scrolls/the-elder-scrolls-castles-review/ , https://news.xbox.com/en-us/2024/09/18/elder-scrolls-castles-interview/
- Shacknews, Bethesda/Behaviour settlement: https://www.shacknews.com/article/109198/bethesda-and-behaviour-interactive-amicably-resolve-fallout-shelter-suit
- Game Developer, "Clone Wars" legal cases: https://www.gamedeveloper.com/business/clone-wars-the-five-most-important-cases-every-game-developer-should-know
- Tetris Holding v. Xio: https://en.wikipedia.org/wiki/Tetris_Holding,_LLC_v._Xio_Interactive,_Inc.
- FKKS, copyright for video games: https://fkks.com/news/how-courts-view-copyright-protection-for-video-games
- Microsoft Game Content Usage Rules: https://www.xbox.com/en-US/developers/rules
- Fan project cases: https://www.dailydot.com/parsec/fan-fallout-3-project-scrapped/ , https://www.pcgamer.com/games/fallout/fallout-1-fan-remake-taps-out-just-2-months-after-it-got-a-meaty-demo-but-promises-its-not-because-of-infighting-or-bethesda-meddling/

# PoE 2 QuickTools — End-of-build test plan

Everything below was **built but not tested in the real game**. Automated checks (typecheck, lint, 142 unit and component tests, build) pass. This plan covers what only a person at the keyboard can check.

How to use: work top to bottom, tick **Pass** or write what happened. Each ID maps to an acceptance criterion in `BUILD_PLAN.md` (M1 #3 = milestone 1, criterion 3).

## 0. Setup

| # | Step |
|---|---|
| 0.1 | PoE 2 installed, English client, logged in, in a town. Graphics → **Windowed Fullscreen** unless a case says otherwise. |
| 0.2 | Run the dev build: `npm run dev` (or the packaged build for section 7). A tray icon (amber square) appears. |
| 0.3 | Tray → **Settings…**. Pick your league if asked (two leagues are live, so the picker should appear). |
| 0.4 | Settings → Advanced → tick **Developer tools** (enables the "save item text" hotkey `Ctrl + Alt + F12`). |
| 0.5 | Have in the stash/inventory: 2 waystones (one corrupted), 2 tablets (one unique), 2 rares (armour + jewellery/weapon), 1 unique, a currency stack (e.g. Exalted Orbs), a rune, an essence, a soul core. |
| 0.6 | Logs: tray → **Open logs folder** (`%APPDATA%\PoE2QuickTools\logs`). Keep it open to check for errors. |

## 1. Overlay and copy loop (M1)

| ID | Test | Expected | Pass? |
|---|---|---|---|
| 1.1 | Start QuickTools with PoE 2 already running. | Overlay attaches; nothing visible until a hotkey. Log: `attached …`. | |
| 1.2 | Start QuickTools **before** PoE 2, wait 15 s. | Tray balloon "Waiting for Path of Exile 2". Launch the game → overlay attaches. | |
| 1.3 | Set PoE 2 to **exclusive Fullscreen**, restart QuickTools, wait 15 s. (M1 #8) | Tray balloon "PoE 2 is in exclusive fullscreen" with instructions. No crash. | |
| 1.4 | Hover a Waystone, press **Ctrl + D**. Repeat for a Tablet, a rare armour, a currency stack. (M1 #1) | Card appears next to the cursor with the right item class and base. Log line `item text in N ms`. | |
| 1.5 | Repeat 1.4 twenty times on one item, note the `item text in N ms` values. (M1 #1) | Median ≤ 300 ms. | |
| 1.6 | In PoE 2 Options, turn **off** "Show advanced item descriptions" style toggles; price-check a rare. (M1 #2) | Card shows mod tiers (T1, T2…) — i.e. the copy was the advanced text. No "Copied without advanced descriptions" warning. | |
| 1.7 | Copy some text in Notepad, then price-check an item in game, then paste in Notepad. (M1 #3) | Notepad text pastes back, not the item. | |
| 1.8 | Settings → turn off **Restore my clipboard**; repeat 1.7. | The item text pastes. Turn the setting back on. | |
| 1.9 | Alt-tab to Notepad, press **Ctrl + D** there. (M1 #4) | Notepad receives Ctrl+D normally; no card, no synthetic copy. | |
| 1.10 | Close QuickTools. Edit `%APPDATA%\PoE2QuickTools\settings.json`: set `"price-check": "Ctrl + Shift + Q"`. Start again. (M1 #5) | Only Ctrl+Shift+Q price-checks; Ctrl+D does nothing in game. Then set it back (or Settings → Reset). | |
| 1.11 | Bind Price check to a combo another running program owns (e.g. a screenshot tool's hotkey), focus PoE 2. (M1 #5) | Settings row shows "Could not register: in use by another program"; log has a matching `WARN [hotkeys]` line. | |
| 1.12 | With no card open, click around in the game. (M1 #6) | Every click reaches the game (move, loot, open panels). | |
| 1.13 | Open a rare card, click a mod checkbox. | Checkbox toggles; the game does not receive the click; keyboard still controls the game. | |
| 1.14 | Click a **min** box on the card and type `123`. Press W/A/S/D/Q while typing. (M1 #6) | Digits/letters go into the box; nothing happens in game. | |
| 1.15 | While typing, press **Esc**. (M1 #6) | Focus returns to the game (keys reach the game again); card stays open. | |
| 1.16 | Press **Shift + Space** in game, then again. | First press makes the overlay interactive (keyboard focus); second returns to the game. Note: this shadows Shift+dodge while bound. | |
| 1.17 | Open a card, Alt-tab away, Alt-tab back. (M1 #9) | Overlay hides while away; comes back without stealing focus (game keys work immediately). | |
| 1.18 | Open a card, move the mouse far away (not over the card). | Quick-peek card closes. With **Pin** (or Ctrl + Shift + P) it stays. | |
| 1.19 | Open a card, press **Esc** while the game is focused. | Card closes (Dismiss hotkey). Esc does nothing to QuickTools when no card is open (game menu opens normally). | |
| 1.20 | Hover nothing (empty ground), press Ctrl + D. | Notice "Couldn't read item. Hover an item and try again." | |
| 1.21 | Run PoE 2 **as administrator**, QuickTools normally. | Error dialog "PoE 2 window – no access" explaining to run both the same way. | |
| 1.22 | Check `src/main/**` files that came from Exiled Exchange 2. (M1 #12) | Each starts with the `Adapted from Exiled-Exchange-2 … (MIT)` header and is listed in `THIRD_PARTY_NOTICES.md`. (Already true — just confirm.) | |

### 1A. Display matrix (M1 #7)

Record results in `docs/test-matrix.md`. For each row: the card appears beside the cursor, fully inside the game window, text is sharp, clicks hit the right controls.

| # | OS | Setup | Mode |
|---|---|---|---|
| a | Win 11 | single monitor 150% (owner) | Windowed Fullscreen |
| b | Win 11 | single 100% | Windowed (not maximised, moved around) |
| c | Win 10 | single 125% | Windowed Fullscreen |
| d | Win 10/11 | 200% (or max, e.g. 4K) | Windowed Fullscreen |
| e | any | two monitors, mixed DPI (100% + 150%), game on secondary | both modes |
| f | any | secondary monitor left of / above primary (negative coordinates) | both modes |
| g | any | drag the game window across monitors while a card is pinned | Windowed |
| h | any | change Windows scaling while QuickTools runs | Windowed Fullscreen |

Also try each edge: price-check items at the far right, bottom, top-left of the game window — the card flips/clamps and never goes off the game window.

### 1B. Capture real fixtures (M1 #11)

With Developer tools on, hover each item from 0.5 and press **Price check** then **Ctrl + Alt + F12**. Files appear in `tests/fixtures/clipboard/`. Then run `npm test` — the parser and matcher tests pick them up automatically.

| ID | Expected | Pass? |
|---|---|---|
| 1B.1 | ≥ 10 files saved (2 waystones incl. corrupted, 2 tablets incl. unique, 2 rares, 1 unique, currency, rune, essence, soul core). | |
| 1B.2 | `npm test` passes: every fixture parses with no unparsed lines; ≥ 95% of explicit lines match a stat id. If not, send me the failing file. | |

## 2. Parser checks on real items (M2)

| ID | Test | Expected | Pass? |
|---|---|---|---|
| 2.1 | Price-check each fixture item. | Header shows correct name/base/class/ilvl; no "N lines not recognised" (or only on genuinely odd mods). | |
| 2.2 | Waystone card. | Header props (Revives, Pack Size, Rare Monsters, Drop Chance, Monster Effectiveness…) shown with values; no Item Quantity. | |
| 2.3 | Tablet card. | Mechanic line ("Adds … to a Map"), "N uses remaining". | |
| 2.4 | Magic item (e.g. magic ring). | Base type found despite prefix/suffix in the name (check "Search by base type" label). | |

## 3. Network and rate limits (M3)

| ID | Test | Expected | Pass? |
|---|---|---|---|
| 3.1 | `npm run check:live` (once). | All 3 live tests pass; it prints the live `X-Rate-Limit-Ip` for search and fetch — compare with `config/trade-rate-limits.json`. | |
| 3.2 | Price-check 20 rares as fast as you can (~5 s). | Never an error from GGG; cards show "Busy" or wait; the meter never goes red. Log has **no** `429`. | |
| 3.3 | Watch the meter in a card footer ("Searches: n/5 per 10 s · n/15 per 1 min"). | Counts rise with each search and fall over time; turns amber near the limit. | |
| 3.4 | Fake a lockout: close the app, create `%APPDATA%\PoE2QuickTools\ratelimit-lockouts.json` with `{"trade-search-request-limit": <now+120000 in ms>}`, start, price-check a rare. | Card shows "Rate limit reached – waiting (N s)" countdown; no request is sent (log). After 2 min searches work again. | |
| 3.5 | Settings → League → pick each league in turn. | Searches use that league ("Open on trade site" URL contains it); poe.ninja prices refresh for it. | |
| 3.6 | Delete the saved league (Settings → Automatic). | Picker appears again in the overlay when a card opens (two leagues qualify). | |
| 3.7 | Disconnect the network, restart QuickTools. | App starts; uses cached trade data (≤ 24 h) and cached poe.ninja (≤ 6 h); cards say prices unavailable instead of crashing. | |
| 3.8 | Leave the app running 30 min. | Log shows poe.ninja refreshes every 15 min; Settings shows the updated time. | |
| 3.9 | Settings → League & data → check the poe.ninja error list. | Empty, or only types that genuinely have no data. Report any listed type. | |

## 4. Price check cards (M4)

| ID | Test | Expected | Pass? |
|---|---|---|---|
| 4.1 | **Currency stack** (e.g. 7 Exalted). | Price in Div / Ex / Chaos / Vaal (in your currency order), stack value, 7-day sparkline, 7d and 24h badges, traded volume, "Open on poe.ninja" link opens the right page. | |
| 4.2 | Rune, essence, soul core, an omen, a splinter. | Each found on poe.ninja with a price. Note any "Not found on poe.ninja". | |
| 4.3 | **Unique** (gear). | poe.ninja price shows instantly, no search sent; **Live listings** runs one search and lists sellers. | |
| 4.4 | **Unique tablet**. | poe.ninja UniqueTablets price + tablet info + Live listings. | |
| 4.5 | **Waystone**. | Auto-search runs; Waystone Tier pinned min=max; Pack Size / Item Rarity / Drop Chance checked with min = value − 10%; explicit mods listed but off; "Monster Effectiveness" breakdown line if present. | |
| 4.6 | Waystone: set a mod to **NOT**, tick it, Search. | Results exclude that mod (verify one listing on the trade site link). | |
| 4.7 | **Tablet**. | Type = base (legacy "Precursor" mapped to new name), uses-remaining filter on, explicits on; results load. | |
| 4.8 | Flag a tablet mod as jackpot (Settings → Jackpot tablet mods), re-check a tablet with it. | Row highlighted with ★ and forced on. | |
| 4.9 | **Rare** armour. | Explicit mods ticked with min rolls, implicits/runes off, category search (not base). Tick "Search by base type" → results narrow to the base. | |
| 4.10 | Rare: **+ Add stat** "total elemental resistance", set a min, Search. | Pseudo stat added and used. | |
| 4.11 | Listings. | Up to 10 rows: price, Div value, ● online / ○ offline, account. **Whisper** copies the message (paste in chat manually — QuickTools never sends it). | |
| 4.12 | "Open on trade site" link. | Opens the same search on pathofexile.com/trade2. | |
| 4.13 | **Ctrl + Alt + D** on a currency/unique card. | Opens that item on poe.ninja. | |
| 4.14 | **F4** converter. | Converts between any two currencies; ⇄ swaps; "+ Add this pair" adds a favourite; drag to reorder; ✕ removes; persists after restart; label "poe.ninja average, updated HH:MM". | |
| 4.15 | Gem or quest item. | Fallback card "This item type is not priced in v1" with raw text and "Copy item text for a bug report". | |
| 4.16 | Compare 5 item prices with the trade site / poe.ninja by eye. (M4 DoD) | Roughly consistent; 0 × 429 in the log. | |

## 5. Settings and hotkey UI (M5)

| ID | Test | Expected | Pass? |
|---|---|---|---|
| 5.1 | Every action has a row; click one, press a combo. (M5 #1) | Captured and shown like `Ctrl + Shift + K`; applied at once. | |
| 5.2 | While recording press Backspace; record again and press Esc. (M5 #1) | Backspace clears the binding ("Not set"); Esc cancels. | |
| 5.3 | Record Ctrl + D on another action. (M5 #2) | Blocking error "Already used by …"; not saved. | |
| 5.4 | Record Ctrl + Q. (M5 #3) | Warning naming "Secondary skill slot Q"; **Use anyway** saves it. | |
| 5.5 | Tick "I play with WASD movement", record A. (M5 #3) | Warning about movement. Add your own rebind under "My PoE 2 key rebinds" and record it → warning with your label. | |
| 5.6 | Record a bare key (e.g. F7) and Alt + F4. (M5 #4) | F7: warning "No modifier…". Alt + F4: Windows usually swallows it; if captured → blocked. | |
| 5.7 | Record a combo another program owns. (M5 #5) | "In use by another program" error on that row. | |
| 5.8 | Reset one row; Reset all. (M5 #6) | Defaults restored. | |
| 5.9 | Change a hotkey, switch to the game, use it; restart; use it again. (M5 #7) | Works immediately without restart, and after restart. | |
| 5.10 | Other settings: advanced-descriptions key, UI scale 75/100/150%, currency order, min-roll %, online only. | Each takes effect on the next card; all persist across restarts. | |
| 5.11 | About section in Settings. | Version, User-Agent `PoE2QuickTools/0.1.0 (contact: Bhemfinechua@gmail.com)`, GGG notice, third-party notices (EE2 MIT text + file table). GGG notice also at the top of Settings. | |
| 5.12 | Tray → Copy diagnostics, paste somewhere. | Version, overlay state, hotkey status, settings, recent log. | |

## 6. Hard constraints (PLAN §1.4) — must all pass

| ID | Check | Expected | Pass? |
|---|---|---|---|
| 6.1 | One hotkey press → at most one synthetic action. | Only the Ctrl+Alt+C copy; nothing typed into chat, no clicks. | |
| 6.2 | Whispers. | Only copied to clipboard; never sent. | |
| 6.3 | User-Agent. | In a proxy (e.g. Fiddler) or from the log/diagnostics: every request to pathofexile.com and poe.ninja carries `PoE2QuickTools/<version> (contact: Bhemfinechua@gmail.com)`. | |
| 6.4 | No 429 in any log after sections 3–4. | `findstr 429 %APPDATA%\PoE2QuickTools\logs\*.log` finds nothing. | |
| 6.5 | No timers/screen triggers. | Nothing happens in game unless you press a hotkey (background refreshes — poe.ninja, trade data re-check, game lists, update check — are network only). | |

## 7. Packaging (M5 DoD)

| ID | Test | Expected | Pass? |
|---|---|---|---|
| 7.1 | `npm run dist`. | `dist/PoE2QuickTools-Setup-0.1.0.exe` and `dist/PoE2QuickTools-Portable-0.1.0.exe`. | |
| 7.2 | Clean **Windows 11** VM (no Node): install with the Setup exe; then run the portable exe. | Both start (SmartScreen "More info → Run anyway" because unsigned); tray icon; settings open. | |
| 7.3 | Same on a clean **Windows 10** VM. | Same. | |
| 7.4 | Re-run sections 1A (display matrix) and 4.1/4.5/4.9 on the **packaged** build. | Same results as dev. | |
| 7.5 | Auto-update: install 0.1.0 with the Setup exe, then release 0.1.1 (`docs/release.md`) and publish the draft. Start the installed app. | Settings → Updates: "Downloading version 0.1.1" then "ready" + tray balloon. **Restart now** (or quitting) installs it; Settings → About shows 0.1.1 afterwards. | |
| 7.6 | Same release, run the 0.1.0 **portable** exe. | Settings → Updates: "Version 0.1.1 is available" with a **Download** link to the GitHub release; nothing installs by itself. | |
| 7.7 | Settings → untick "Update QuickTools automatically", restart. | Updates shows "Off (turned off)"; the log has no `[updater] Checking for update`. | |

### 7B. Following a patch (no new release needed)

| ID | Test | Expected | Pass? |
|---|---|---|---|
| 7B.1 | Packaged build, online: Settings → League & data. | "Game lists: online copy (updated …)". In `%APPDATA%\PoE2QuickTools\data-cache` there is `remote-config.json`. | |
| 7B.2 | Edit `config/poe2-default-binds.json` on GitHub (add `{ "combo": "Ctrl + K", "action": "Test bind" }`), push, restart the packaged app. Then revert. | Recording Ctrl+K in Settings warns "Test bind". After the revert and a restart the warning is gone. | |
| 7B.3 | A broken online file. Covered by the automated test `tests/unit/patch-updates.test.ts` (a bad file is ignored and the last good copy is kept); not worth breaking `main` to test by hand. | — | n/a |
| 7B.4 | Patch detection: delete nothing; set the PC clock 2 h ahead (or wait), start the app. | ~10 s after start the log shows trade data being re-checked; if GGG changed anything: `trade data version … (startup check)` and an overlay notice "Game data updated". | |
| 7B.5 | After a real patch, price-check items with new mods. | First unrecognised mod → log `unrecognised mod lines: [...]` and (if the data is >15 min old) a re-download. If many mods still fail: amber "⚠ … an app update is needed" on cards, in Settings, and a tray balloon once. | |

## 8. Things I assumed that need confirming

Tell me which of these turn out wrong; each is a small fix.

| # | Assumption | Where |
|---|---|---|
| 8.1 | poe.ninja **unique** `primaryValue` is in Divine (the site shows Divine icons next to those numbers). | `src/shared/pricing/ninja.ts` |
| 8.2 | poe.ninja URL slugs other than `unique-armours` (e.g. `uncut-gems`, `soul-cores`, `unique-relics`). | `config/ninja-types.json` |
| 8.3 | `poe2_production_Config.ini` uses `[DISPLAY] fullscreen=` and `borderless_windowed_fullscreen=`. | `src/shared/game-config.ts` (test 1.3) |
| 8.4 | Windows `SendInput` (called through koffi; no keyboard-hook library) reaches PoE 2 like a real Ctrl+Alt+C. | `src/main/input/send-input.ts` (test 1.4) |
| 8.5 | Electron 45 + electron-overlay-window 4.1 work on Windows 11 (EOW officially lists 7–10). | test 1.1 |
| 8.6 | Item classes treated as commodities (Stackable Currency, Socketable, Omen, Map Fragments, splinters…). | `src/shared/parser/parse.ts` (test 4.2) |
| 8.7 | Trade `map_filters` labels: "Monster Effectiveness" → `map_magic_monsters`, "Monster Rarity" → `map_rare_monsters` (taken from the API's own labels; "Magic Monsters"/"Rare Monsters" header lines have no filter). | `src/shared/query/model.ts` (test 4.5) |
| 8.8 | PoE 2 default key labels in the conflict list (only Q–T, Ctrl+Q–T, P, X, I, C, Space, Tab, Z, Enter are named; the rest say "Default bind"). | `config/poe2-default-binds.json` |
| 8.9 | Trade search/fetch response shape (only the data endpoints were recorded; search/fetch schemas come from the plan and EE2). | test 3.1 |
| 8.10 | Tablet slot rule shown: only "6 mods enable all 3 slots". | `TabletInfo.vue` |
| 8.11 | Monster Effectiveness stacking (labelled "approx."). | `WaystoneInfo.vue` |

## 9. After PoE 2 1.0 (11 Dec 2026) — M6

Re-run 1B (re-capture fixtures), 3.1 (`check:live`), 3.9, 4.1–4.9. Update `config/*.json` if poe.ninja types, tablet/waystone names, `map_filters` or leagues changed: pushing `ninja-types.json` or `poe2-default-binds.json` to `main` reaches installed apps within 6 h (or on restart) without a release; anything else needs a release (`docs/release.md`). Not built yet: the optional RePoE mod-tier extract (`scripts/extract-repoe.ts` in the plan) — tiers come from the advanced copy, so it is only needed if 1.0 removes tiers from item text.

# PoE 2 QuickTools — PLAN.md Review

> **Status 9 Nov 2026 (later):** every item below is annotated "Resolved by PLAN v2". The original v1 plan is kept as `PLAN.v1.md`.

Reviewed: `bhemfine/poe2_quicktools` → `PLAN.md` (all 751 lines). Checked on **Mon 9 Nov 2026, ~13:30 SGT (UTC+8)** against live endpoints, the official GGG developer docs, npm, RePoE, and the source of Exiled Exchange 2 (EE2, MIT, last commit 6 Sep 2026), which is the closest working reference.

**Verdict:** The architecture is sound: Electron overlay, clipboard copy, trade2 API, and poe.ninja are the same approach EE2 and Sidekick use. But several **data-contract and game-fact claims are out of date**, and a coding agent following the plan as written would build features that can't work: the poe.ninja response shape is different, the rate-limit assumptions are wrong, tablet names and item class are wrong, and Item Quantity no longer exists on waystones. None of this kills the project. All of it should be fixed in PLAN.md before Phase 2/3 code is written. Phase 0 and 1 can start once the stack versions and overlay config are corrected.

---

## 0. Endpoint check (live curl, 9 Nov 2026 ~13:25 SGT, from a US datacenter IP)

| Endpoint | Result |
|---|---|
| `GET poe.ninja/poe2/api/economy/leagues` | **200**. `[{id,name}]` for Forbidden Rites, Runes of Aldur, HC Forbidden Rites, HC Runes of Aldur, Standard, Hardcore |
| `GET poe.ninja/poe2/api/data/index-state` | **200**. Richer: `economyLeagues[{name,url,hardcore,indexed}]` plus private leagues in `buildLeagues` |
| `GET poe.ninja/poe2/api/economy/exchange/current/overview?league=…&type=Currency` | **200**, but the **schema differs from the plan** (see B1) |
| same, `type=Uncut Gems` (with space, as written in the plan) | **200 with 0 lines** (silent failure). Correct value is `UncutGems` |
| same, `type=Omens` / `Waystones` / `Tablets` / `Talismans` | 200, 0 lines (not valid exchange types) |
| `GET poe.ninja/poe2/api/economy/stash/current/item/overview?league=…&type=UniqueArmours` | **200**. This is the uniques endpoint (not in the plan) |
| `GET pathofexile.com/api/trade2/data/leagues` | **200**, same 6 leagues, `realm: poe2` |
| `GET /api/trade2/data/stats` | **200**, 855 KB. Groups: pseudo, explicit, implicit, fractured, crafted, enchant, rune, desecrated, sanctum, skill |
| `GET /api/trade2/data/static` | **200** (currency ids such as `chaos`, `exalted`, `divine`, `vaal`) |
| `GET /api/trade2/data/filters` | **200**. Includes `map_filters` (see B4) |
| `GET /api/trade2/data/items` | **200** (base types; plan does not list it but needs it) |
| `POST /api/trade2/search/poe2/Forbidden%20Rites` | **200**. `X-Rate-Limit-Policy: trade-search-request-limit`, `X-Rate-Limit-Rules: Ip`, **`X-Rate-Limit-Ip: 5:10:60,15:60:300,30:300:1800,600:21600:3600`** |
| `GET /api/trade2/fetch/{10 ids}?query={id}` | **200**, 10 results. `X-Rate-Limit-Policy: trade-fetch-request-limit`, **`X-Rate-Limit-Ip: 12:4:10,16:12:300,50:300:300,1000:21600:1800`** |
| `repoe-fork.github.io/poe2/` | 200. Title "RePoE - PoE2 version 0.5.5.7", repo last commit 7 Nov 2026 00:17 SGT |
| `…/mods.json` (13 MB), `…/base_items.json` (8 MB) | 200 |
| `…/stats.json` | **404** (doesn't exist) |
| `…/stat_translations.json` | **404**. It is a **directory** `stat_translations/` with per-domain files (`stat_descriptions.json`, `endgame_map_stat_descriptions.json`, `tablet_stat_descriptions.json`, …) |

No Cloudflare challenge appeared on any call, with a custom UA and no cookies. From a residential connection in Singapore this may differ. I could not test that.

---

## 🔴 Blockers (feature cannot work as specified; fix in the plan before coding that part)

### B1. poe.ninja response schema in §3.1 / §2.4 is wrong, so buy/sell spread and arbitrage have no data source
- **What's wrong:** The plan expects `lines[].currencyTypeName`, `chaosEquivalent`, `pay{}`, `receive{}`, `paySparkLine`, `receiveSparkLine`. That is the old PoE1 `currencyoverview` shape.
- **Evidence:** live `exchange/current/overview?league=Runes%20of%20Aldur&type=Currency` returns top-level keys `core`, `lines`, `items`.
  - `core = { items:[divine, exalted, chaos], rates:{ exalted: 545.0, chaos: 8.92 }, primary:"divine", secondary:"chaos" }`
  - `lines[] = { id:"alch", primaryValue:0.003636, volumePrimaryValue:0.3333, maxVolumeCurrency:"divine", maxVolumeRate:275, sparkline:{ totalChange:81.82, data:[7 values] } }`
  - `items[] = { id, name, image, category, detailsId }` (join with `lines` on `id`)
- **Impact:** "Exchange Buy Rate / Sell Rate", "spread < 2%" note, separate pay/receive sparklines (§2.4), and the whole **Arbitrage Flagger / spread margin** in the Conversion HUD (§2.5) have **no data** from poe.ninja. There is only one value per item (in Divines), plus volume and one sparkline.
- **Fix:**
  1. Rewrite §3.1 with the real schema. Price = `primaryValue` Div. Convert with `core.rates` (Ex/Div, Chaos/Div). Vaal comes from its own `lines` entry (`id:"vaal"`).
  2. Drop buy/sell spread and arbitrage from v1, **or** source them from trade2's bulk exchange endpoint `POST /api/trade2/exchange/poe2/{league}` (EE2 uses it; it's rate-limited under its own policy, so on-demand only, never background polling). The official Currency Exchange API (`/developer/docs` → "Currency Exchange") needs a registered OAuth client, and GGG states "We are currently unable to process new applications."
  3. Use the valid `type` values (live list, case-sensitive): `Currency, Fragments, Essences, Runes, UncutGems, SoulCores, Ritual, Breach, Delirium, Abyss, Expedition, Idols, LineageSupportGems, Verisium, PrecursorTablets`. Uniques use `stash/current/item/overview` with `UniqueArmours, UniqueWeapons, UniqueAccessories, UniqueFlasks, UniqueJewels, UniqueCharms, UniqueTablets, UniqueSanctumRelics` (fields: `name, baseType, primaryValue, listingCount, sparkLine`). Treat "200 + 0 lines" as an error.
  4. poe.ninja's API is unofficial and undocumented, and its shape has already drifted from what the plan assumes. Wrap it behind a schema validator (zod) and fail soft.
- ✅ **Resolved by PLAN v2:** §2.4 and §3.1 use the real schema (single `primaryValue`, `core.rates`, volume, one sparkline) and the exact type list; "200 + 0 lines" is an error. The arbitrage flagger is removed and §2.5 becomes a converter; on-demand bulk-exchange quotes are post-v1.

### B2. Trade API rate limits are much tighter than the plan assumes, and the stress-test DoD would get the user's IP locked out
- **What's wrong:** §3.3 uses `12:6:60` as the example and says "a player cannot physically trigger more than 2–3 price checks per 6 seconds… the rate limit is effectively never reached." §5.3 tells the tester to press Ctrl+D on **20 items in 5 seconds**.
- **Evidence (live headers):** search = `5:10:60, 15:60:300, 30:300:1800, 600:21600:3600`. That means max **5 searches/10 s**, **15/min**, **30 per 5 min**, and breaking the 5-minute rule costs a **30-minute lockout**. Fetch is a separate policy: `12:4:10, 16:12:300, 50:300:300, 1000:21600:1800`. Every rare/waystone/tablet check = 1 search + ≥1 fetch.
- GGG docs (`pathofexile.com/developer/docs`, "Errors → Invalid Requests Threshold"): *"Applications that make too many invalid requests… will be restricted… This includes… 429."* So the "exponential backoff with jitter on 429" design is wrong in principle. The client must **never** produce a 429, and when one does happen it must honour `Retry-After` / the `-State` restrict time, not a guessed backoff.
- **Fix:**
  - Rate limiter keyed **per `X-Rate-Limit-Policy`**, enforcing **all** rules in `X-Rate-Limit-Rules` (Ip, and Account when logged in) at once. Seed it with conservative defaults before the first response; never send if any window would be ≥ limit−1.
  - Queue with **cancellation**: a new price check cancels queued-but-unsent searches from the old one.
  - Show remaining budget ("3/5 searches left in 10 s") rather than only a banner after the fact.
  - On 429: stop all requests on that policy for `Retry-After` seconds, persist that across app restarts, show a countdown.
  - Change the §5.3 test to "20 checks in 5 s → 5 sent, rest queued/cancelled, **zero 429s**", and run it against a **mock server**, not the live API.
  - Remove the "effectively never reached" claim; 30 per 5 min is reachable by an active trader.
- ✅ **Resolved by PLAN v2:** §3.3 documents the live limits and specifies a per-policy, all-rules, one-slot-margin limiter with cancellation, persisted lockouts and `Retry-After`. BUILD_PLAN M3 DoD requires 0 × 429 against a mock server.

### B3. Tablet item names and Item Class are wrong (parser and trade queries would miss every tablet)
- **What's wrong:** §2.2 says Item Class is `Tablets` and lists `Breach Precursor Tablet`, `Expedition Precursor Tablet`, etc.
- **Evidence:**
  - trade2 `/data/items` (live) lists base types **`Breach Tablet`, `Expedition Tablet`, `Delirium Tablet`, `Ritual Tablet`, `Abyss Tablet`, `Temple Tablet`, `Irradiated Tablet`, `Overseer Tablet`** plus **10 unique tablets** (e.g. "The Grand Project Irradiated Tablet").
  - RePoE 0.5.5.7 `base_items.json`: same 8 names, item_class `TowerAugmentation`. `item_classes.json` → display name **`Tablet`** (singular).
  - EE2 clipboard fixture: `Item Class: Tablet`. poe2wiki: "0.5.0 – 'Precursor Tablet' renamed to Irradiated Precursor Tablet"; current data drops "Precursor" entirely.
  - Trade has `pseudo.pseudo_number_of_uses_remaining` ("# uses remaining (Tablets)") and category `map.tablet`.
- **Fix:** Match `Item Class: Tablet`. Take the base type from the last header line (`<X> Tablet`), but also accept the legacy `<X> Precursor Tablet` (old items and fixtures may still say that). Use `type` = base type, `pseudo_number_of_uses_remaining` for the uses filter, and handle unique tablets via poe.ninja `UniqueTablets`.
- ✅ **Resolved by PLAN v2:** §2.2 uses `Item Class: Tablet`, the `<X> Tablet` bases (legacy "Precursor" accepted, list fetched at runtime), unique tablets, and `pseudo_number_of_uses_remaining`.

### B4. Waystone model is out of date: no Item Quantity, wrong prefix/suffix meaning, and it ignores the trade API's built-in waystone filters
- **What's wrong:**
  - §2.1 centres on `Item Quantity: +48% (augmented)` and the Breach synergy uses Pack Size + **Item Quantity**.
  - It says prefixes are "reward mods" and suffixes are "challenge mods".
  - It says header aggregates aren't searchable and must be searched mod-by-mod.
  - It treats Monster Effectiveness as an app-computed aggregate.
- **Evidence:**
  - trade2 `/data/filters` → `map_filters`: **`map_tier, map_packsize, map_magic_monsters` (labelled "Monster Effectiveness"), `map_iir, map_rare_monsters, map_revives, map_bonus` (Waystone Drop Chance), `map_gold, map_experience`**. There is **no IIQ filter**.
  - A live T15 listing's `properties`: Revives Available, Item Rarity, Pack Size, Monster Rarity, **Monster Effectiveness +28%**, Waystone Drop Chance. No Item Quantity.
  - Its mods: `"24% more Monster Life"` is **prefix** (tier P1 "Tough"), `"Monsters have 11% increased Attack, Cast and Movement Speed"` is **prefix**. EE2 fixtures show prefixes "Painful", "Enduring", "Slowing" (all difficulty mods).
- **Fix:**
  - Parse every `Xxx: +N% (augmented)` header line generically (Revives Available, Pack Size, Magic Monsters, Rare Monsters, Monster Rarity, Item Rarity, Monster Effectiveness, Waystone Drop Chance, Gold, Experience) and map them to `map_filters`.
  - **Price waystones mainly on tier + header filters**, which is how they are actually traded. Offer explicit mods as optional extra filters (e.g. to exclude "no regen" style mods).
  - Remove Item Quantity everywhere. Read Monster Effectiveness from the header, don't compute it.
  - Treat both prefixes and suffixes as difficulty mods.
- ✅ **Resolved by PLAN v2:** §2.1 drops Item Quantity, treats both affix types as difficulty mods, prices on tier + `map_filters`, and reads Monster Effectiveness from the header.

---

## 🟠 Should fix

### S1. Stack versions are stale; Electron 33 is end-of-life
- **Evidence (npm, 9 Nov 2026):**

  | Package | Current |
  |---|---|
  | electron | 45.2.3 (supported: 45/44/43) |
  | electron-builder | 26.18 |
  | vite | 8.3 |
  | @vitejs/plugin-vue | 6.0.10 (vite ≤ 8) |
  | vitest | 5.1 (vite 6.4–8) |
  | tailwindcss | 4.3 (CSS-first config, so the plan's `tailwind.config.js`/`postcss.config.js` are v3-style) |
  | electron-store | 12.0 (**ESM-only, Node ≥ 22**) |
  | typescript | **7.0.2**, the Go-native port (vue-tsc compatibility not guaranteed). 5.9.3 is the last 5.x |
  | pinia | 4.1 |
  | electron-overlay-window | 4.1.0 (Apr 2026) |
  | uiohook-napi | 1.5.5 |

  EE2 ships Electron 40 + electron-overlay-window 4.0.2 + uiohook-napi 1.5.x + TS 5.9.
- **Fix:** Pin the versions in BUILD_PLAN.md: Electron 45, TS ~5.9, Vite 8 (or 7 if electron-vite/plugins lag), Tailwind 4 via `@tailwindcss/vite`, Vitest 5. Drop `robotjs` and `nut-js`: `uiohook-napi` already has `keyTap`/`keyToggle` (EE2 does this), so robotjs would be a second native module for no gain, and `@nut-tree/nut-js` returns 404 on public npm.
- ✅ **Resolved by PLAN v2:** §4.2 pins Electron ~45, Vite 8, Tailwind 4, TS ~5.9, electron-store 12 + safeStorage. robotjs and nut-js are dropped.

### S2. The overlay window config contradicts electron-overlay-window, and `focusable:false` breaks typing
- **What's wrong:** §5.5 and Phase 1 create the window with `resizable:false`, `focusable:false`, and `setAlwaysOnTop(true,'screen-saver')`, then "also" use electron-overlay-window (EOW).
- **Evidence:** EOW `src/index.ts` exports `OVERLAY_WINDOW_OPTS = { fullscreenable:true, skipTaskbar, frame:false, show:false, transparent:true, resizable:!isLinux, … }`, and the README says: *"You can have only one overlay window"*, *"initialize library only once (Electron window must never die)"*. EOW owns z-order and bounds via `attachByTitle(win, 'Path of Exile 2')` and focus via `activateOverlay()` / `focusTarget()`.
- A `focusable:false` window **cannot receive keyboard input**, so the plan's Min/Max inputs, searchable "+ Add Custom Stat" dropdown, keybind recorder, and POESESSID field would not work.
- **Fix:**
  - Use `new BrowserWindow({...OVERLAY_WINDOW_OPTS, webPreferences:{preload, contextIsolation:true, sandbox:true}})` and **one** overlay window that hosts all cards and the HUD.
  - Use EE2's interaction model: click-through by default; an "interactive mode" key (or clicking a card) calls `activateOverlay()` so inputs get focus; `Esc` or a click on the game calls `focusTarget()`.
  - Don't call `setAlwaysOnTop('screen-saver')`.
  - EOW README officially lists **Windows 7–10**. Windows 11 works in practice (EE2's user base) but must be tested in Phase 1.
- ✅ **Resolved by PLAN v2:** §5.3 uses `OVERLAY_WINDOW_OPTS`, one window, `activateOverlay`/`focusTarget` for real keyboard focus, and no `focusable:false` or `screen-saver`.

### S3. Hotkeys conflict with PoE 2 defaults, and uiohook can't swallow keys
- **Evidence:** PoE 2 defaults (fextralife Controls page, Sep 2026; mobalytics): **P = Passive Skill Tree**, **X = Weapon Swap**, **Ctrl = Toggle skill set** (Ctrl+Q…T = skills 9–13), **D = Move Right in WASD mode**, **Esc = close UI / menu**, Alt = Show Advanced Item Descriptions. `uiohook-napi` is a passive global hook: the game still receives every key. EE2 registers hotkeys with Electron `globalShortcut` (which consumes the key) and only while the game window is focused.
- **Impact:** Bare `P` for pin opens the passive tree every time. `Ctrl+X` sits on weapon swap plus the skill-set toggle. Global `Esc` fights the game menu. Phase 1's DoD "Ctrl+D anywhere in Windows" would fire Ctrl+C into browsers and editors too.
- **Fix:**
  - Register via `globalShortcut` only while PoE 2 has focus (EOW `focus`/`blur` events). Use uiohook only for synthesising the copy keystroke and tracking held modifiers.
  - Defaults: Price check `Ctrl+D` (same as EE2), Waystone/Tablet check: merge into Ctrl+D (the dispatcher already knows the item class) or use `Ctrl+Shift+D`, HUD `F4` (unbound by default; verify in-client), pin: click the card's pin icon or use `Ctrl+Shift+P`.
  - `Esc` only closes the overlay while it is interactive and focused (handled in the renderer, not globally).
- ✅ **Resolved by PLAN v2:** §5.4 makes all hotkeys user-customizable (capture, conflict detection, PoE 2 default-bind warnings, reset, persisted), registers them with `globalShortcut` only while PoE 2 is focused, and has no bare-letter or global Esc defaults. BUILD_PLAN M1 and M5 add acceptance criteria.

### S4. Clipboard capture: send Ctrl+Alt+C, poll, restore the clipboard
- **What's wrong:** Phase 1 sends Ctrl+C, waits a fixed 30 ms, and reads. §2.1 says the format depends on the "Advanced Mod Descriptions" *setting*.
- **Evidence:** EE2 `main/src/shortcuts/Shortcuts.ts`: `mergeTwoHotkeys("Ctrl + C", showModsKey)` (default Alt), so it **sends Ctrl+Alt+C** to always get the advanced format (`{ Prefix Modifier "…" (Tier: n) }`, roll ranges). It skips modifiers the user is already holding and releases them after 10 ms. `HostClipboard.ts` clears first, **polls every 48 ms up to 500 ms**, and **restores the previous clipboard** (comment: otherwise a lagging game could read a restored password).
- **Fix:** Copy that pattern. Keep a basic-format fallback parser for pasted text, but make advanced the primary path. One hotkey press = one synthetic copy keystroke (see S6).
- ✅ **Resolved by PLAN v2:** §5.5: Ctrl+Alt+C (configurable advanced-descriptions key), 48 ms polling up to 500 ms, clipboard restore.

### S5. POESESSID: the "doubles headroom" claim is wrong, the encryption is weak, and asking for it carries policy risk
- **Evidence:** GGG docs, rate limits: `X-Rate-Limit-Rules` is "a comma-delimited list of applicable rules". With a session, Ip **and** Account rules apply together, so the stricter one wins and headroom does not double. GGG Developer Guidelines: *"Don't share your account or application's credentials with anyone."* POESESSID is a full web-session credential (account and store access). `electron-store`'s `encryptionKey` is obfuscation (the key ships in the binary), not real security.
- **Fix:** Cut POESESSID from v1; the app works without it. If added later, store it with Electron **`safeStorage`** (Windows DPAPI), send it only to `www.pathofexile.com`, and explain the risk on screen. Also remove "expires after ~30 days" (unverified).
- ✅ **Resolved by PLAN v2:** POESESSID is removed from v1 (§3.2). Post-v1 opt-in would use `safeStorage` (§10). The "doubles headroom" claim is gone.

### S6. Be explicit about GGG policy; trade2 is an undocumented API
- **Evidence (pathofexile.com/developer/docs):**
  - Executable apps that run independently from the game are *"not encouraged, [but] permitted"*.
  - Macros must be *"invoked manually by the user… one set function… only perform one action that interacts with the game"*.
  - Apps that *"interact with the game or game files"* (memory reading, injection) = *"immediate account termination"*.
  - **"It is against our Terms of Use (section 7i) to reverse-engineer endpoints outside of this documentation."** `/api/trade2/*` is not in the API Reference. EE2, Sidekick, and Awakened PoE Trade have used it for years without action, but it is tolerated, not sanctioned.
  - Required UA format: `OAuth {clientId}/{version} (contact: {contact})`. Required notice: *"This product isn't affiliated with or endorsed by Grinding Gear Games in any way."*
- **Assessment of the plan:** No memory reading, no game-file access. One synthetic Ctrl+Alt+C per manual hotkey press is one client-side action, the same model as EE2 and Sidekick. ✅ Nothing in the plan auto-sends whispers or chat. ✅ Keep it that way (copy the whisper to the clipboard only; don't auto-paste and send). Auto-dismiss on cursor move is fine. Never trigger a copy from a timer or from screen reading.
- **Fix:**
  - Add a "Policy & ToS" section to PLAN.md stating these rules as hard constraints.
  - Use UA `PoE2QuickTools/<ver> (contact: <real email>)` (no `OAuth` prefix since there's no client id) via the main-process `net` module with a persistent session (CF cookies).
  - Keep request volume low; add the GGG notice to the About and Settings pages.
  - Accept and document the residual trade2 risk.
- ✅ **Resolved by PLAN v2:** §1.4 adds hard constraints, the trade2 risk note, the UA `PoE2QuickTools/<version> (contact: Bhemfinechua@gmail.com)`, and the GGG notice.

### S7. League detection logic is under-specified (two challenge leagues are live right now)
- **Evidence:** Both sources currently return **two** non-Standard softcore leagues: `Forbidden Rites` (0.5.5 event, launched 4 Sep 2026) and `Runes of Aldur` (0.5 league), plus HC variants. The GGG FAQ (forum thread 4000430) says Forbidden Rites runs until **PoE 2 1.0 on 11 Dec 2026** and ends alongside Runes of Aldur. "Filter out Standard" leaves 4 candidates; list order is not a contract.
- **Fix:**
  - Use trade2 `/data/leagues` as the source of truth (it's what search accepts). Use poe.ninja `index-state` only to map name → URL slug (`forbiddenrites`) for links.
  - Exclude `HC*`/Hardcore, SSF, and private (`(PLnnnn)`) leagues.
  - If more than one candidate remains, show a league picker on first run and remember the choice. Re-validate on each start and when a search returns "invalid league".
  - "Forbidden Rites" is correct as the *example* today but must never be hardcoded.
- ✅ **Resolved by PLAN v2:** §1.1 and §3.4: trade2 leagues are the source of truth; HC/SSF/private are excluded; there is a picker when more than one league remains; no hardcoded names.

### S8. PoE 2 1.0 lands ~4.5 weeks from now (11 Dec 2026)
- **Impact:** New league, Duelist, and likely mod, tablet, and waystone changes. Expect parser fixtures, stat text, poe.ninja types, and base names to change.
- **Fix:** Keep everything data-driven (stats/items/filters fetched at startup, cached with a patch/version key). Keep parsers tolerant: unknown lines go into `unparsed[]` and are not thrown. Schedule a "1.0 refresh" milestone. Prioritise pieces that survive the patch (overlay, clipboard, rate limiter, trade client) before waystone/tablet heuristics.
- ✅ **Resolved by PLAN v2:** §3.6 covers data-driven names, a tolerant parser, and re-capturable fixtures. BUILD_PLAN M6 is the "1.0 refresh".

### S9. RePoE file list is wrong, and RePoE is mostly unnecessary at runtime
- **Evidence:** `stats.json` and `stat_translations.json` are 404. Translations are split under `stat_translations/*.json`, and there is `stats_by_file.json`, `mods_by_base.json`, `item_classes.json`, and `.min.json` variants. `mods.json` is 13 MB and `base_items.json` 8 MB.
- **Fix:** Trade stat matching needs only `/api/trade2/data/stats` and `/data/items`, plus the advanced clipboard text (which already carries tier and range). Use RePoE only as a **build-time** step that extracts a small `mod-tiers.json` (for showing "T1/T2" when advanced text is missing). Don't bundle 20+ MB of JSON.
- ✅ **Resolved by PLAN v2:** §3.5 lists the real RePoE files (`stat_translations/` directory, no `stats.json`) and makes RePoE build-time only, extracted to `data/mod-tiers.json`.

### S10. Stat-text matching needs real normalisation
- **Evidence:** Live stat texts use `#` templates and in-game wording such as `"#% increased Pack Size in Map"` and `"Breaches in Map have #% increased Pack Size"`. The plan's examples (`increased Monster Pack Size`, `Breach Monsters in Map have 15% increased Pack Size`, `Breaches in Map have 2 additional Spawns`) don't match any stat text. Some stats appear twice ("…in Area" / "…in Map") under one id. EE2 fixtures show **multi-line hybrid mods** under one modifier header and the suffix `— Unscalable Value`. Live listings embed markup like `[IgnitedGround|Ignited Ground]`.
- **Fix:** Build a matcher: strip `[a|b]`→`b`, replace numbers with `#`, handle `+#`/`-#`, "reduced"↔negative "increased", option stats, and hybrid blocks. Index all stat groups (explicit/implicit/desecrated/fractured/rune/enchant). Unit-test it against real clipboard fixtures. Consider porting EE2's matcher (MIT, attribute it).
- ✅ **Resolved by PLAN v2:** §2.3 and BUILD_PLAN M2: the stat matcher is ported from EE2 (§4.3), with normalisation for markup, hybrids and `— Unscalable Value`; DoD is ≥95% mapping.

### S11. Missing non-functional pieces
- First-run setup: league picker, contact email for the UA, GGG notice.
- Error states for: no game window, clipboard timeout, unknown item, poe.ninja down or empty, trade 4xx/5xx, rate-limited.
- Logging to file plus a "copy diagnostics" button. A "save last clipboard as fixture" dev command to grow the test corpus.
- Multi-monitor and DPI: EOW `targetBounds` are **physical pixels on Windows** (per its source). The renderer works in DIPs, so convert.
- Auto-update: `portable` builds can't auto-update; use `nsis` + `electron-updater` (GitHub Releases). Unsigned builds trigger SmartScreen, so budget for code signing or document the warning.
- Settings schema versioning and migration. Only the English client is supported (say so).
- Security: `contextIsolation:true`, `sandbox:true`, `nodeIntegration:false`, typed IPC allow-list, all network in the main process.
- ✅ **Resolved by PLAN v2:** §5.6 (Windows 10/11, any DPI, mixed-DPI, negative coordinates), §5.7 (error states and logs), §6 (settings and migrations), §7 (nsis/portable, updater, signing), §8 (testing). Still open: release channel and code signing.

### S12. Tablet / map-device mechanics claims are partly unverifiable or outdated
- **Evidence:** 0.3.1 (poe2wiki Tower page, GGG video): tablets go into the **Map Device** (towers are no longer required). Up to 3 tablets, slots based on the map's mod count, **"Running a 6 mod map will enable all 3."** GGG also said every map now gets **1–3 extra random content features** in addition to tablets.
- **Not verified:** the exact 1–2 → 1 slot and 3–5 → 2 slots thresholds, and "filling all slots locks the map to only the chosen tablet types" (that seems to contradict the random-extras change).
- **Fix:** Rename "Tower & Waystone Synergy" to "Map Device slots". Show only the verified rule (6 mods = 3 slots) until the thresholds are confirmed in-game, and delete the "locks the map" claim unless confirmed.
- ✅ **Resolved by PLAN v2:** §2.2 shows only "6 mods = 3 slots" and drops the "locks map" claim; the other thresholds are marked unverified in §11.

---

## 🟢 Nice to have / minor

- **N1. Monster Effectiveness formula:** The plan's "per 1%: +1% toughness, +0.5% XP, +0.5% quantity" matches the in-game keyword text (poe2way, wraeclastindex, patch 0.5.5: *"For every 2% increased Effectiveness, Monsters gain 2% more Toughness, 1% more Experience and 1% more quantity of items dropped"*). But **toughness ≠ HP/defences**: 100% toughness = monsters take 50% less damage. Relabel it. I couldn't verify whether multiple sources stack additively. ✅ *Resolved by PLAN v2:* §2.1 defines toughness correctly and labels the numbers "approx."
- **N2. Content Synergy scores** have no data basis (the plan admits this). They're also partly built on Item Quantity (gone). Defer to post-v1, or ship as clearly labelled user-tunable weights. ✅ *Resolved by PLAN v2:* Deferred to post-v1 (§10).
- **N3. Performance targets:** "<15 ms cache" is fine. "Trade 200–800 ms" is search + fetch = 2 round trips. My combined round trip from a US box was roughly 0.5–0.7 s; from Singapore expect more, and queueing under the limits adds seconds. Set the target as "first result ≤ 1.5 s when budget is available" and show progress. ✅ *Resolved by PLAN v2:* M1 sets ≤300 ms p50 for the card. M4 shows progress and the rate-limit meter. A trade-result latency target is still not fixed (depends on network and queue).
- **N4.** `/api/trade2/data/items` is needed (base types) but isn't listed. `/data/static` is only for currency ids and icons. ✅ *Resolved by PLAN v2:* Added in §3.2.
- **N5.** Max 10 IDs per `/fetch` matches EE2 and widespread usage (not tested beyond 10, to avoid generating 4xx). ✅ *Resolved by PLAN v2:* §3.2 says ≤10 ids per fetch.
- **N6.** The poe.ninja link format `poe.ninja/poe2/economy/[league]/[category]?name=` should use the URL slug (`forbiddenrites`) and category slug (`currency`, `unique-armours`…), or the item `detailsId` path as EE2 does (`/poe2/economy/{league}/{category}/{detailsId}`). ✅ *Resolved by PLAN v2:* §2.4 uses the `{leagueSlug}/{categorySlug}/{detailsId}` link.
- **N7.** Plan folder says `poe2-quicktools/` while the repo is `poe2_quicktools`. Harmless, but pick one. ✅ *Resolved by PLAN v2:* PLAN v2 uses `poe2_quicktools/`.
- **N8.** EE2 is MIT-licensed (© 2020 Alexander Drozdov, from Awakened PoE Trade), so porting its parser, rate limiter, and clipboard code is allowed with attribution and would save weeks. ✅ *Resolved by PLAN v2:* §4.3 and BUILD_PLAN "EE2 reuse rules" (approved by the owner).
- **N9.** Fixture "Rare Regicide Armour" in Phase 2: I couldn't verify the base name. Use real copied items. ✅ *Resolved by PLAN v2:* Real fixtures are captured in M1.
- **N10.** Phase 0's `vite-plugin-electron` *or* custom script: pick one. Recommendation: `electron-vite` (main/preload/renderer in one config). ✅ *Resolved by PLAN v2:* electron-vite chosen (§4.2).

---

## What I could not verify
- Real in-game clipboard text for the current patch (I relied on EE2 fixtures, RePoE, and trade JSON instead). Need a few real Ctrl+Alt+C copies from Boon Eng's client.
- Behaviour from a Singapore residential IP (Cloudflare challenges, latency).
- Account-rule numbers when logged in with POESESSID (deliberately not tested).
- Windows 11 + Electron 45 + EOW 4.1 together (EE2 proves Win11 + Electron 40 + EOW 4.0.2).
- Tablet slot thresholds, the "locks map" claim, and effectiveness stacking.
- Whether F4 / Ctrl+D are free in Boon Eng's own keybinds.

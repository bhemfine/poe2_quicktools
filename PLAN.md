# PoE 2 QuickTools — Architecture & Implementation Plan (v2)

> **A fast, non-intrusive in-game overlay for Path of Exile 2.**
> Exiled Exchange 2-style mod filtering, Sidekick-style speed, and poe.ninja prices, in one click-through overlay.
> *This product isn't affiliated with or endorsed by Grinding Gear Games in any way.*

## Changelog: v2 (9 Nov 2026) vs v1

Based on `REVIEW.md` (live checks on 9 Nov 2026) and the owner's answers.

| # | Area | v1 said | v2 says |
|---|---|---|---|
| 1 | poe.ninja | `pay`/`receive`, `chaosEquivalent`, buy/sell spread, arbitrage flagger | Real schema: one `primaryValue` (in Divine) per item, `core.rates`, volume, one 7-day sparkline. **No buy/sell or spread data.** Arbitrage flagger removed. Currency HUD redesigned as a converter, with optional on-demand live quotes from the trade bulk exchange (post-v1) |
| 2 | poe.ninja types | `Uncut Gems`, … | Exact case-sensitive type list (§3.1); "200 + 0 lines" treated as an error; uniques via `stash/current/item/overview` |
| 3 | Rate limits | `12:6:60` example, "never reached", backoff + jitter on 429 | Live limits documented (search **5/10 s, 15/60 s, 30/300 s, 1800 s lockout**); proactive per-policy limiter; **zero-429 design**; `Retry-After` honoured and persisted |
| 4 | Tablets | `Item Class: Tablets`, "Breach Precursor Tablet" | `Item Class: Tablet`; bases `Breach Tablet` … `Overseer Tablet` (legacy "Precursor" accepted); unique tablets; `pseudo_number_of_uses_remaining` |
| 5 | Waystones | Item Quantity header; prefix = reward, suffix = challenge; search by mods only | No Item Quantity; prefixes and suffixes are both difficulty mods; price on tier + trade **`map_filters`**; explicit mods optional |
| 6 | Monster Effectiveness | Computed aggregate, "HP/Defenses" | Read from the waystone header; "toughness" defined correctly |
| 7 | Overlay | `focusable:false`, `resizable:false`, `alwaysOnTop('screen-saver')` | `OVERLAY_WINDOW_OPTS` from electron-overlay-window, one window, EE2-style interactive mode with real keyboard focus |
| 8 | Stack | Electron 33, Vite 5, Tailwind 3, electron-store 8, robotjs/nut-js | Electron 45, Vite 8, Tailwind 4, TS 5.9, electron-store 12 + safeStorage, uiohook only (§4) |
| 9 | Hotkeys | Fixed Ctrl+D / Ctrl+X / F4 / P / Esc via uiohook, active everywhere | **All rebindable** (key capture, conflict detection, PoE 2 default-bind warnings, reset, persisted); registered via `globalShortcut` **only while PoE 2 is focused**; no bare-letter or global Esc defaults |
| 10 | Copy | Ctrl+C, fixed 30 ms wait | **Ctrl+Alt+C** (advanced text), poll 48 ms × ≤500 ms, **restore clipboard** |
| 11 | POESESSID | Optional, "doubles headroom", electron-store encryption | **Removed from v1.** Possible post-v1 opt-in via `safeStorage` |
| 12 | League | First non-Standard league | trade2 leagues as the source of truth; exclude HC/SSF/private; **league picker** when more than one remains |
| 13 | Patch readiness | — | PoE 2 **1.0 on 11 Dec 2026**: every name, stat id, base, type, and league is fetched at runtime; parser tolerant; "1.0 refresh" milestone |
| 14 | RePoE | `stats.json`, `stat_translations.json` bundled | Those files don't exist (`stat_translations/` is a directory); RePoE is **build-time only**, small extract |
| 15 | DPI / monitors | not covered | Windows 10/11, any scaling (100–200%+), mixed-DPI multi-monitor, negative coordinates, windowed / borderless (§5.6) |
| 16 | Policy | Brief | Hard constraints section (§1.4), GGG notice, UA with contact email |
| 17 | Code reuse | — | Port MIT-licensed Exiled Exchange 2 modules with attribution (§4.3) |
| 18 | Tablet slots | 1–2/3–5/6+ mods table, "locks map" | Only the verified rule (6 mods = 3 slots) shown; others marked unverified |
| 19 | Roadmap | Phases 0–5 | Replaced by `BUILD_PLAN.md` milestones M0–M6 |

---

## 1. Overview & Core Philosophy

### 1.1 Strictly PoE 2, current league
- PoE 2 only, English client.
- **League selection** (see §3.4): fetched at startup from `GET https://www.pathofexile.com/api/trade2/data/leagues` (source of truth). poe.ninja `GET https://poe.ninja/poe2/api/data/index-state` maps names to URL slugs. HC, SSF, and private `(PLnnnn)` leagues are excluded. If more than one candidate remains (today: *Forbidden Rites* and *Runes of Aldur*), the user picks once and the choice is remembered. No league name is ever hardcoded.

### 1.2 100% deterministic (no AI at runtime)
- No LLM calls. Stat ids, base types, filters, and leagues come from the official trade data endpoints at startup and are cached under a version key.
- Static mod-tier hints come from a **build-time** extract of the RePoE PoE 2 fork (§3.5).

### 1.3 Click-through overlay
- `electron-overlay-window` (SnosMe, v4.1) attaches a **single** transparent overlay to the window titled `Path of Exile 2` and keeps bounds and z-order in sync.
- Idle: click-through. Interactive: real keyboard focus for inputs (§5.3).

### 1.4 Hard constraints (policy and ToS, never violate)
Source: pathofexile.com/developer/docs (Third-Party Policy, Developer Guidelines, Rate Limits).
1. **No game memory reading, injection, or game-file modification.** No actions triggered by timers, file changes, or screen reading.
2. **One manual hotkey press → at most one synthetic action into the game** (the Ctrl+Alt+C copy). Never auto-send chat or whispers; trade whispers are copied to the clipboard only.
3. All web requests come from the main process with UA **`PoE2QuickTools/<version> (contact: Bhemfinechua@gmail.com)`**.
4. Obey `X-Rate-Limit-*` per policy and design for **zero 429s** (GGG counts 4xx/429 toward an "invalid requests threshold" that can restrict access). Honour `Retry-After`.
5. Show the GGG non-affiliation notice in About and Settings.
6. **Known risk:** `/api/trade2/*` is the trade website's undocumented API. GGG's docs say using endpoints outside the documented API is against ToU 7i, but Exiled Exchange 2, Sidekick, and Awakened PoE Trade have used it for years. We minimise volume and stay identifiable. The official Currency Exchange API needs an OAuth client, and GGG currently isn't accepting new applications.

---

## 2. Feature Specifications

All hotkeys below are **defaults only**. Every one is rebindable (§5.4).

### 2.1 Waystone valuation (default: Price Check hotkey; the dispatcher detects `Item Class: Waystones`)

**Clipboard format (advanced, via Ctrl+Alt+C):**
```
Item Class: Waystones
Rarity: Rare
Desolate Route
Waystone (Tier 14)
--------
Revives Available: 2 (augmented)
Pack Size: +34% (augmented)
Rare Monsters: +28% (augmented)
Waystone Drop Chance: +75% (augmented)
--------
Item Level: 80
--------
{ Prefix Modifier "Painful" (Tier: 1) }
28(26-30)% increased Monster Damage
{ Suffix Modifier "of Destruction" (Tier: 1) }
Monsters have 293(260-300)% increased Critical Hit Chance
+26(26-30)% to Monster Critical Damage Bonus
...
```
*(from EE2 test fixtures; real copies from the current patch will be captured in M1)*

- **Header properties** (parsed generically as `Key: ±N% (augmented)`): Revives Available, Pack Size, Magic Monsters, Rare Monsters, Monster Rarity, Item Rarity, **Monster Effectiveness**, Waystone Drop Chance, Gold, Experience. **Waystones have no Item Quantity line.** Unknown keys are kept and displayed.
- **Tier:** from the base line `Waystone (Tier N)`.
- **Explicit mods:** both prefixes and suffixes are **difficulty** modifiers; their rewards show up in the header. Parse name, tier, value and range, multi-line hybrids, and `— Unscalable Value`.
- **Trade query (primary): `type` + `map_filters`.** Live ids from `/api/trade2/data/filters`: `map_tier`, `map_packsize`, `map_magic_monsters` (labelled "Monster Effectiveness" by the API), `map_iir`, `map_rare_monsters`, `map_revives`, `map_bonus` (Waystone Drop Chance), `map_gold`, `map_experience`. Each shows as a checkbox row with editable min/max (default min = item value − 10% relative, max empty). The mapping from header key to filter id comes from the filters endpoint's `text` labels and isn't hardcoded.
- **Explicit mods (secondary):** shown as optional filters, off by default. Typical use: exclude a deal-breaker mod (`not` group).
- **Monster Effectiveness breakdown:** per the in-game keyword text (0.5.5): *"For every 2% increased Effectiveness, Monsters gain 2% more Toughness, 1% more Experience granted and 1% more quantity of items dropped."* Display: `+E% effectiveness → ~E% more toughness (monsters take ≈ 1/(1+E/100) of damage), ~E/2% more XP, ~E/2% more item quantity`. Stacking across sources isn't verified, so it's labelled "approx."
- **Content synergy scores:** moved to post-v1 (no data basis; previously relied on Item Quantity).

### 2.2 Tablet valuation
- **Detection:** `Item Class: Tablet` (singular). Base from the last header line, from the live trade item list: `Breach Tablet`, `Expedition Tablet`, `Delirium Tablet`, `Ritual Tablet`, `Abyss Tablet`, `Temple Tablet`, `Irradiated Tablet`, `Overseer Tablet`. Also accept legacy `<X> Precursor Tablet`. The list is fetched at runtime (`/data/items`, category `map.tablet`), not hardcoded.
- Implicit block: mechanic line (e.g. `Adds a Mirror of Delirium to a Map`) and `N uses remaining`.
- **Uniques** (10 today, e.g. *The Grand Project* Irradiated Tablet): poe.ninja `UniqueTablets` price, plus an optional live check.
- **Trade query:** `type` = base, `pseudo.pseudo_number_of_uses_remaining` min (default = item's uses − 0), plus selected explicit mods. Category `map.tablet`.
- **Map Device guidance (verified only):** tablets go in the Map Device (since 0.3.1); up to 3; slots depend on the waystone's mod count; **6 mods enable all 3 slots**. The 1–2/3–5 thresholds and v1's "locks the map" claim are unverified and are **not shown** until confirmed in-game.
- **High-value mods:** the user flags mods in settings as "jackpot" (by stat id). No hardcoded examples, because v1's example texts don't match any live stat.
- Prices are shown in Div / Ex / Chaos / Vaal (converted from listing currency via poe.ninja `core.rates` and the Vaal line).

### 2.3 Rare and unique gear
- Full affix parse (implicit, explicit, rune, desecrated, fractured, crafted, enchant) with tier and range.
- Per-mod checkbox + min/max, `[+ Add Stat]` searchable dropdown over all `/data/stats` groups including `pseudo` (e.g. `+#% total Elemental Resistance`), plus item-level, corrupted, and quality filters from `/data/filters`.
- Shows the 10 cheapest online listings (one search + one fetch of ≤10 ids), seller online status, and price normalised to Divine. Whisper copied to clipboard.
- **Uniques:** poe.ninja `stash/current/item/overview` price instantly, plus a "live listings" button.

### 2.4 Commodity pricing (Currency, Fragments, Runes, Essences, Uncut Gems, Soul Cores, Omens/Ritual, Breach, Delirium, Abyss, Expedition, Idols, Lineage Supports, Verisium)
- **Single market price** from poe.ninja `primaryValue` (Divine), shown in **Divine / Exalted / Chaos / Vaal** using `core.rates` (Ex per Div, Chaos per Div) and the `vaal` line.
- **Stack value:** price × stack size from the clipboard.
- **Trend:** 7-point `sparkline.data` (% change vs 7 days ago) → micro SVG chart, 7-day badge = `totalChange`, 24 h badge = difference of the last two points.
- **Confidence:** `volumePrimaryValue` (traded volume in Div) with a low-volume warning.
- **No buy/sell spread.** poe.ninja doesn't publish it.
- **Open on poe.ninja:** `https://poe.ninja/poe2/economy/{leagueSlug}/{categorySlug}/{detailsId}`.

### 2.5 Currency Converter HUD (default hotkey F4, rebindable)
- **v1:** a converter between any two currencies using poe.ninja cached values (e.g. `1 Div = 628 Ex = 9.5 Chaos`), plus user-defined favourite pairs (add, delete, drag to reorder, persisted). Clearly labelled "poe.ninja average, updated HH:MM".
- **No arbitrage flagger in v1.** poe.ninja's single price can't show spreads.
- **Post-v1 (optional):** "Live quote" button per pair that runs one on-demand query against `POST /api/trade2/exchange/poe2/{league}` (bulk exchange, its own rate-limit policy) and shows the best ask/bid from listings. Never polled in the background.

---

## 3. Data Sources & API Integration

All responses are validated with zod. Schema drift is logged and the UI fails soft ("price unavailable") instead of crashing.

### 3.1 poe.ninja (unofficial; primary for commodities and uniques)
- `GET /poe2/api/data/index-state` → `economyLeagues[{name,url,hardcore,indexed}]` (name → slug).
- `GET /poe2/api/economy/exchange/current/overview?league={name}&type={type}`
  - Types (case-sensitive, live 9 Nov 2026): `Currency, Fragments, Essences, Runes, UncutGems, SoulCores, Ritual, Breach, Delirium, Abyss, Expedition, Idols, LineageSupportGems, Verisium, PrecursorTablets`.
  - Response:
    ```json
    {
      "core": { "items": [{"id":"divine",...},{"id":"exalted",...},{"id":"chaos",...}],
                "rates": { "exalted": 628.2, "chaos": 9.48 }, "primary": "divine", "secondary": "chaos" },
      "lines": [{ "id": "alch", "primaryValue": 0.003636, "volumePrimaryValue": 0.33,
                  "maxVolumeCurrency": "divine", "maxVolumeRate": 275,
                  "sparkline": { "totalChange": 81.82, "data": [12.35, 85.23, 119.7, 62.04, 81.05, 68.61, 81.82] } }],
      "items": [{ "id": "alch", "name": "Orb of Alchemy", "image": "...", "category": "Currency", "detailsId": "orb-of-alchemy" }]
    }
    ```
    Join `lines` ↔ `items` on `id`. Sparkline values may be `null`.
- `GET /poe2/api/economy/stash/current/item/overview?league={name}&type={UniqueArmours|UniqueWeapons|UniqueAccessories|UniqueFlasks|UniqueJewels|UniqueCharms|UniqueTablets|UniqueSanctumRelics}`
  - `lines[{ name, baseType, primaryValue, listingCount, corrupted, sparkLine{data,totalChange}, detailsId, … }]`
- **"200 with 0 lines" = error** (invalid type or league).
- Refresh every 15 min in the background (one request per type, staggered), plus on league change. UA as in §1.4. The type list lives in `config/ninja-types.json` so it can be updated without code changes.

### 3.2 Official trade API (rares, waystones, tablets, live checks)
- `GET /api/trade2/data/leagues | stats | items | filters | static` at startup; cached 24 h on disk plus refetch when the game patch or version changes (ETag/hash compare).
- `POST /api/trade2/search/poe2/{league}` → `{ id, result:[ids], total, complexity }`.
- `GET /api/trade2/fetch/{≤10 ids}?query={id}` → listings (`listing.price{amount,currency}`, `listing.account.online`, `listing.whisper`, `item.properties`, `item.explicitMods[{description, hash, mods[{name,tier,magnitudes}]}]`).
- Headers: `User-Agent: PoE2QuickTools/<version> (contact: Bhemfinechua@gmail.com)`, `Content-Type: application/json`. Uses Electron `net` with a persistent session (Cloudflare cookies). **No POESESSID in v1.**

### 3.3 Rate limiting (proactive, zero-429)
Live headers (9 Nov 2026, unauthenticated):
| Policy (`X-Rate-Limit-Policy`) | `X-Rate-Limit-Ip` |
|---|---|
| `trade-search-request-limit` | `5:10:60, 15:60:300, 30:300:1800, 600:21600:3600` |
| `trade-fetch-request-limit` | `12:4:10, 16:12:300, 50:300:300, 1000:21600:1800` |

Format: `hits:period_s:restrict_s`; `-State` = `current:period:active_restrict`. **These numbers are seeds only; the limiter always adopts the latest headers.**

`rate-limiter.ts` design:
1. One bucket set per **policy**. Each bucket holds every rule listed in `X-Rate-Limit-Rules` (`Ip`, later `Account`), and every window in each rule.
2. Before sending, compute for each window the hits in the trailing period (local timestamp log, reconciled with server `-State`). Send only if **every** window has `hits ≤ limit − 1` (one-slot safety margin); otherwise wait until the oldest hit ages out.
3. Requests whose policy is unknown (first call) go out one at a time until headers are seen.
4. **Queue with cancellation:** a new price check cancels queued, unsent requests from the previous check. Max queue depth 3; beyond that, "busy" is shown immediately.
5. If `-State` shows an active restriction, or a 429 arrives anyway: block that policy until `Retry-After` / restrict time, **persist the lockout to disk** (survives restarts), and show a countdown. No exponential-backoff guessing.
6. The UI shows the remaining budget per policy ("Searches: 3/5 per 10 s · 22/30 per 5 min").
7. Search results are cached for 60 s keyed by query JSON. Fetch results are cached for 60 s per item id.
8. Unit tests run against a mock server that enforces the real rules and fails the test on any 429.

### 3.4 League detector
- Source of truth: trade2 `/data/leagues` (`realm: poe2`). Exclude `Standard`, `Hardcore`, ids starting `HC `, `SSF`, `(PL…)`. If one remains, use it; if several, show a picker (first run and whenever the saved league disappears). Settings shows all leagues, including HC and Standard, for manual choice.
- Re-validate on each start. If a search returns "invalid league", re-run detection.

### 3.5 Static game data (RePoE PoE 2 fork, build-time only)
- Real files at `https://repoe-fork.github.io/poe2/` (version 0.5.5.7 on 9 Nov 2026): `mods.json` (13 MB) / `mods.min.json`, `mods_by_base.json`, `base_items.json` (8 MB), `item_classes.json`, `stats_by_file.json`, `stat_translations/` **directory** (`stat_descriptions.json`, `endgame_map_stat_descriptions.json`, `tablet_stat_descriptions.json`, …). **`stats.json` and `stat_translations.json` do not exist.**
- `scripts/extract-repoe.ts` builds `data/mod-tiers.json` (few hundred KB): mod name → tier ranges for waystone, tablet, and gear mods. Used only to show tiers when the clipboard lacks them. It is regenerated by a script and not edited by hand.

### 3.6 PoE 2 1.0 readiness (launch 11 Dec 2026)
- Nothing game-specific is hardcoded in code: leagues, stat ids and texts, base names, filter ids, and ninja types are all fetched or kept in `config/*.json`.
- The parser never throws on unknown lines. It collects them in `unparsed[]`, shows "N lines not recognised", and offers "copy item text for a bug report".
- A fixture corpus in `tests/fixtures/clipboard/` can be re-captured with a dev hotkey. Milestone M6 = 1.0 refresh.
- Startup self-check: if `/data/stats` hash changed, rebuild stat-match indexes automatically.

---

## 4. System Architecture & Tech Stack

### 4.1 Layout
```
poe2_quicktools/
├── src/
│   ├── main/                      # Electron main (Node)
│   │   ├── index.ts               # lifecycle, single-instance lock
│   │   ├── overlay/               # EOW attach, interactive mode, DPI/bounds mapping
│   │   ├── input/                 # hotkey registry (globalShortcut), focus-gating, copy keystroke (uiohook)
│   │   ├── clipboard/             # poll + restore
│   │   ├── net/                   # http (electron.net), UA, rate-limiter, caches
│   │   │   ├── trade/             # leagues, stats, items, filters, search, fetch
│   │   │   └── ninja/             # index-state, exchange overview, item overview
│   │   ├── settings/              # electron-store schema, migrations, safeStorage helper
│   │   ├── logging/
│   │   └── ipc.ts                 # typed allow-listed IPC
│   ├── preload/index.ts
│   ├── shared/                    # pure TS, no Electron imports, fully unit-tested
│   │   ├── parser/  stat-match/  query/  pricing/  hotkeys/  types.ts
│   └── renderer/                  # Vue 3 single overlay app
│       ├── App.vue
│       ├── stores/                # overlay, economy, settings, ratelimit
│       └── components/            # WaystoneCard, TabletCard, GearCard, CommodityCard,
│                                  # ConverterHUD, SettingsModal, HotkeyRecorder, RateLimitMeter, LeaguePicker
├── config/                        # ninja-types.json, poe2-default-binds.json, default-hotkeys.json
├── data/                          # mod-tiers.json (build-time extract)
├── scripts/                       # extract-repoe.ts, capture helpers
├── tests/fixtures/{clipboard,api}/  tests/unit/  tests/mock-server/
├── THIRD_PARTY_NOTICES.md         # EE2 MIT license text + list of ported files
└── electron.vite.config.ts, electron-builder.yml, package.json, tsconfig*.json
```

### 4.2 Stack (pinned majors, npm 9 Nov 2026)
| | Package | Version |
|---|---|---|
| Runtime | electron | `~45` (fallback 44/43; EE2 ships 40) |
| Build | electron-vite `^6`, vite `^8` (→ `^7` if a peer conflicts), @vitejs/plugin-vue `^6` | |
| UI | vue `^3.5`, pinia `^4`, tailwindcss `^4` + @tailwindcss/vite | |
| Lang | typescript `~5.9` (not 7.x yet), vue-tsc `^3` | |
| Native | electron-overlay-window `^4.1`, uiohook-napi `^1.5` | |
| Data | zod (current major), electron-store `^12` (ESM, Node ≥ 22) + Electron `safeStorage` | |
| Test | vitest `^5`, happy-dom, msw `^2` / custom mock server | |
| Ship | electron-builder `^26` (nsis + portable), electron-updater `^6` | |
| Dev Node | 24 LTS | |
No robotjs or nut-js; uiohook-napi does key synthesis.

### 4.3 Reuse from Exiled Exchange 2 (MIT, approved)
Source: `github.com/Kvan7/Exiled-Exchange-2` (MIT, © 2020 Alexander Drozdov; fork lineage from Awakened PoE Trade). Port by copying and adapting into our structure (not as a dependency). Keep the MIT text and a per-file header `// Adapted from Exiled-Exchange-2 <path> @ <commit>, MIT`. List every file in `THIRD_PARTY_NOTICES.md`. Pin the source commit (current shallow HEAD `cca30662`, 6 Sep 2026).

| EE2 file | Use in QuickTools |
|---|---|
| `main/src/shortcuts/HostClipboard.ts` | Clipboard poll (48 ms, ≤500 ms) + restore → `main/clipboard/` |
| `main/src/shortcuts/Shortcuts.ts` (`pressKeysToCopyItemText`, key-name ↔ Electron accelerator helpers, focus-gated `globalShortcut` registration) | `main/input/` |
| `main/src/windowing/GameWindow.ts`, `OverlayWindow.ts`, `OverlayVisibility.ts` | EOW attach, interactive toggle (`activateOverlay` / `focusTarget`) → `main/overlay/` |
| `main/src/proxy.ts` (ideas only: electron `net`, session cookies, CF partitioned-cookie fix) | `main/net/http.ts` |
| `renderer/src/parser/Parser.ts`, `ParsedItem.ts`, `modifiers.ts`, `advanced-mod-desc.ts`, `stat-translations.ts`, `meta.ts` | `shared/parser/`, `shared/stat-match/` (largest time saver) |
| `renderer/src/web/price-check/trade/RateLimiter.ts`, `Cache.ts` | Base for limiter/cache, extended for per-policy, persisted lockouts, cancellation |
| `renderer/src/web/price-check/trade/pathofexile-trade.ts`, `filters/create-stat-filters.ts`, `create-item-filters.ts` | Query building (stat filters, map filters, pseudo) → `shared/query/` |
| `renderer/specs/Parser/items.ts` | Seed test fixtures (then replace with fresh real copies) |
| `dataParser/` (reference) | How EE2 builds its stat data; informs `scripts/extract-repoe.ts` |
Not reused: EE2's UI/widgets, its `api.exiledexchange2.dev` proxy, telemetry/remote logger, i18n.

---

## 5. In-Game Ergonomics & UI/UX

### 5.1 Cursor anchoring
The card spawns 20 DIP right and below the cursor, flipped and clamped to the **game window's** bounds (not the primary monitor). Cursor position comes from `screen.getCursorScreenPoint()` (DIP).

### 5.2 Modes
- **Quick-peek:** shown on hotkey; dismissed when the cursor moves more than N px away (polled at 30 Hz only while a card is open), by the Dismiss hotkey, or by a new check.
- **Pinned:** pin icon on the card or the rebindable Pin hotkey; stays until closed.

### 5.3 Click-through and focus (fixes v1)
- Window: `new BrowserWindow({ ...OVERLAY_WINDOW_OPTS, webPreferences:{ preload, contextIsolation:true, sandbox:true, nodeIntegration:false } })`, then `OverlayController.attachByTitle(win, 'Path of Exile 2')`. **One overlay window** hosts every card and the HUD. No `focusable:false`, no `setAlwaysOnTop('screen-saver')`.
- Idle: `setIgnoreMouseEvents(true, { forward:true })`. Renderer hit-tests (throttled `elementFromPoint` on forwarded mousemove) and calls `overlay:set-mouse-capture(true)` while over a card, so buttons and checkboxes are clickable without stealing keyboard focus.
- **Typing** (min/max, Add Stat search, hotkey recorder): focusing an input calls `overlay:activate` → `OverlayController.activateOverlay()` so the window really gets keyboard focus. `Esc` in the renderer, clicking the game, or closing the card calls `OverlayController.focusTarget()`. There's also a rebindable "Toggle interactive mode" hotkey (default `Shift+Space`, same as EE2; see §5.4).
- Alt-tab away: overlay hides (EOW `blur`); back: restores without taking focus.

### 5.4 Hotkeys: fully customizable
- **Defaults** (`config/default-hotkeys.json`): Price Check `Ctrl+D` · Converter HUD `F4` · Toggle Interactive `Shift+Space` (EE2's long-standing default; while PoE 2 is focused it shadows Shift+dodge, and the recorder warns about that) · Pin card `Ctrl+Shift+P` · Open on poe.ninja `Ctrl+Alt+D` · Dismiss `Esc` *(only while a card is open)*. Waystone and tablet use the same Price Check key (the dispatcher routes by Item Class); an optional separate binding is allowed.
- **Registration:** Electron `globalShortcut` (consumes the key), registered **only while PoE 2 is the foreground window** (EOW `focus`/`blur`) and unregistered on blur. Dismiss/Esc is registered only while a card is visible. uiohook is used only to synthesise the copy keystroke and read held modifiers. If `globalShortcut.register` fails (taken by another app), Settings shows "could not register: in use by another program".
- **Settings UI (HotkeyRecorder):**
  - Click a field, press the combo (captured in the renderer while the overlay is interactive), show it as `Ctrl + Shift + D`. Backspace clears; Esc cancels.
  - Supports modifiers Ctrl/Shift/Alt + letter/digit/F1–F24/numpad/punctuation; mouse side buttons are optional, via uiohook, post-v1.
  - **Conflict detection:**
    - (a) **Error** if the combo duplicates another QuickTools action.
    - (b) **Warning** if it matches a PoE 2 default bind from `config/poe2-default-binds.json`, which lists at least: P passive tree, X weapon swap, Ctrl (+Q/W/E/R/T secondary skills), Q/W/E/R/T, 1/2, Space, I, C, G, U, Ctrl+U, Tab, O, L, H, K, N, B, M, V, F, Z, Alt, Shift, Enter, F1, F8, ; and ' (WASD movement keys flagged when the user marks "WASD mode"). The user can add their own rebinds to the list.
    - (c) **Warning** for bare keys without modifiers and for combos Windows reserves (Win+…, Ctrl+Alt+Del, Alt+Tab, Alt+F4).
    - (d) **Error** if registration fails.
  - **Reset** per action and **Reset all to defaults**.
  - **Persisted** in electron-store (`hotkeys` schema v1 with migrations). Changes apply immediately (re-register).
  - Copy keystroke setting: "Show Advanced Item Descriptions key" (default `Alt`, matching PoE 2's default) so users who rebound it in-game still get the advanced text.

### 5.5 Copy pipeline (one action per press)
On Price Check: (1) skip modifiers the user is already holding; (2) uiohook `keyToggle` the missing Ctrl/Alt down, `keyTap(C)`, release after ~10 ms; (3) clear clipboard first if it held item text, poll every 48 ms up to 500 ms for text starting with `Item Class:`; (4) restore the previous clipboard (setting, default on); (5) parse and render. Timeout → "Couldn't read item. Hover an item and try again."

### 5.6 Display generality (Windows 10/11, any DPI, any layout)
Requirement: works on Windows 10 and 11, at any per-monitor scaling (100–200%+), on mixed-DPI multi-monitor setups, with any monitor arrangement including negative coordinates (monitors left of or above the primary), and with PoE 2 in Windowed or Windowed Fullscreen (borderless). Exclusive fullscreen is not supported (no overlay can draw over it; detect and tell the user).
- Coordinate model: EOW `targetBounds` are **physical pixels** on Windows (per EOW source). Convert to DIP with `screen.screenToDipRect(win, rect)` before any layout. Cursor from `screen.getCursorScreenPoint()` (DIP). Never assume primary-monitor origin (0,0) or a single scale factor; use `screen.getDisplayMatching(gameRect).scaleFactor`.
- Re-layout on EOW `moveresize`, on `screen` `display-metrics-changed` / `display-added` / `display-removed`, and when the game moves to another monitor.
- Card size in DIP so text stays legible at every scale. User "UI scale" setting 75–150% on top.
- Electron is per-monitor-DPI-aware v2 by default; no manifest override.
- Manual test matrix in BUILD_PLAN M1. Unit tests for the pure geometry functions (flip/clamp with negative origins and fractional scales).

### 5.7 Error and status UX
States: game not found, clipboard timeout, unknown item (show raw text and "copy for bug report"), poe.ninja unavailable or schema changed, trade 4xx/5xx, rate-limit wait (countdown), league missing (picker). Logs go to `%APPDATA%/PoE2QuickTools/logs` with a "Copy diagnostics" button.

---

## 6. Settings
League (picker) · hotkeys (§5.4) · advanced-descriptions key · clipboard restore · UI scale · currency display order · price-check defaults (min-roll %, online only) · favourite currency pairs · jackpot tablet mods · check for updates · About (version, GGG notice, third-party notices). Stored in electron-store with a versioned schema. Any future secret goes through `safeStorage` (DPAPI).

## 7. Packaging and updates
electron-builder `nsis` (auto-update via electron-updater from GitHub Releases) + `portable` (no auto-update). The repo is private, so releases need a public release repo or manual distribution; decide before M5. Unsigned builds trigger SmartScreen: document it or buy code signing.

## 8. Testing strategy
- Unit (Vitest): parser (real fixtures, advanced + basic), stat matcher, query builder, pricing conversion, rate limiter (fake timers + mock server enforcing live rules; **any 429 fails the test**), hotkey conflict logic, geometry/DPI math.
- Contract tests: recorded API fixtures validated by the zod schemas. `npm run check:live` (manual, rate-limited, one call each) re-validates live endpoints.
- Manual in-game checklist per release (BUILD_PLAN).

## 9. Roadmap
See **`BUILD_PLAN.md`** (M0 scaffold → M1 overlay + copy loop → M2 parsers → M3 network → M4 price check → M5 settings/hotkeys UI/packaging → M6 PoE 2 1.0 refresh).

## 10. Post-v1 ideas
Live bulk-exchange quotes in the Converter (on-demand), content-synergy scores (labelled community estimates, user weights), opt-in POESESSID via `safeStorage` with a risk warning, mouse-button hotkeys, other client languages.

## 11. Open / unverified
- Real clipboard text for the current patch (to capture in M1).
- Tablet slot thresholds below 6 mods; effectiveness stacking.
- Behaviour from residential networks (Cloudflare) and the Account-rule numbers (not used in v1).
- EOW officially lists Windows 7–10. Windows 11 works for EE2 users but must be verified with Electron 45 + EOW 4.1.
- What PoE 2 1.0 changes on 11 Dec 2026.

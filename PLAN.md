# PoE 2 QuickTools — Architecture & Implementation Plan

> **A high-performance, non-intrusive in-game overlay for Path of Exile 2.**
> Combines the modifier filtering of **Exiled Exchange 2**, the speed and ergonomics of **Sidekick**, and the real-time economy & multi-currency arbitrage tracking of **poe.ninja**.

---

## 1. Overview & Core Philosophy

1. **Strictly PoE 2 (Latest Active Challenge League):**
   - Dedicated exclusively to Path of Exile 2.
   - Auto-detects the active challenge league (e.g. `Forbidden Rites`) on boot using a two-source fallback:
     1. **Primary:** `GET https://poe.ninja/poe2/api/economy/leagues` (no auth, simplest)
     2. **Fallback:** `GET https://www.pathofexile.com/api/trade2/data/leagues` (no auth, authoritative)
   - Filters out `Standard` — only the active challenge league is used.
2. **100% Deterministic (Zero AI at Runtime):**
   - No external AI/LLM APIs, no token costs, and zero hallucinations.
   - Uses pre-compiled stat definitions from **RePoE PoE 2 fork** (`repoe-fork.github.io/poe2/` — provides `mods.json`, `stats.json`, `stat_translations.json`, `base_items.json`) and dynamically fetched trade stat IDs from the official `/api/trade2/data/stats` endpoint.
   - Cache lookups < 15 ms; live trade API queries 200–800 ms with loading indicator.
3. **Seamless Windows Click-Through Overlay:**
   - Uses `electron-overlay-window` (SnosMe/electron-overlay-window) to attach the Electron HWND directly to the PoE 2 game process for reliable z-ordering and rendering.
   - Mouse clicks pass directly through into PoE 2 when idle (`setIgnoreMouseEvents(true, { forward: true })`).
   - Overlay is created with `focusable: false` and displayed via `showInactive()` to prevent stealing focus from the game.
   - Interactivity activates only when hovering an active overlay card or entering Pinned Mode (`P`).

---

## 2. Feature Specifications

### 2.1 Waystone Valuation & Live Market Calculation

When you hover over any Waystone and trigger the hotkey (e.g. `Ctrl + D`):

- **Deep Stat Parsing (Dual-Format Support):**
  - PoE 2 clipboard output differs based on the **"Advanced Mod Descriptions"** game setting. The parser handles both formats:
    - **Advanced ON:** Shows tier names and roll ranges (e.g. `{ Prefix Modifier "Populated" } 33(29-35)% increased number of Monster Packs`)
    - **Advanced OFF:** Shows flat text (e.g. `Monsters deal 16% increased Damage`)
  - Extracts the **aggregated header values** (displayed as `(augmented)`) for user display:
    - `Item Quantity: +48% (augmented)`
    - `Item Rarity: +24% (augmented)`
    - `Pack Size: +15% (augmented)`
    - `Monster Effectiveness` (computed aggregate)
  - Extracts the **individual explicit modifiers** (the actual affixes) for trade API queries:
    - Prefixes (reward mods): `increased Magic Monsters`, `increased Rarity of Items found in this Area`, `increased number of Monster Packs`, `increased Item Quantity`, `Bonus Experience`
    - Suffixes (challenge mods): `Extra Fire/Cold/Lightning damage`, `Monster speed buffs`, `Area hazards (Ignited Ground)`, `Cooldown recovery reduction`

  > **Important:** Item Quantity, Item Rarity, Pack Size, and Monster Effectiveness are NOT standalone explicit modifiers — they are computed aggregates derived from the individual explicit mods. The trade API searches by individual explicit mod stat IDs, not by the aggregated header numbers.

- **Direct Query to `pathofexile.com/api/trade2/search/poe2/[league]`:**
  - Stat IDs are **dynamically resolved** on startup from `GET /api/trade2/data/stats` (never hardcoded, as numeric hashes change between game patches).
  - Converts parsed explicit mod values into official trade API stat filters.
  - Fetches lowest active online listings to reflect what players are genuinely paying for those specific roll thresholds.

- **Interactive Mod Toggles & Sliders (Exiled Exchange 2 Style):**
  - Every explicit modifier displayed as a checkbox row with editable Min/Max inputs.
  - Toggle any mod on/off with a single click to broaden or narrow the search.
  - `[ + Add Custom Stat ]` button: searchable dropdown to add pseudo-stats not on the raw item text (e.g. `+#% Total Elemental Resistance`, `Item Level >= 82`, `Corrupted: No`).

- **Monster Effectiveness Breakdown:**
  - Calculates exact net multipliers from the confirmed formula (per `poe2db.tw` / `poe2way.com`):
    - Per 1% Monster Effectiveness: `+1.0% More Monster Toughness (HP/Defenses)`, `+0.5% More XP Granted`, `+0.5% More Item Quantity Dropped`
  - Displays as a clear breakdown card showing the trade-off between difficulty and rewards.

- **Content Synergy Scoring:**
  - Evaluates weighted synergy scores (0–100) for **Breach**, **Abyss**, **Delirium**, and **Ritual**.
  - **Scoring is labeled as "Community Estimate"** — no exact coefficients have been datamined for how Pack Size multiplies content spawns. Relative weightings are based on community testing consensus:
    - **Ritual:** Pack Size is king (more monsters = more Tribute in the circle)
    - **Breach:** Pack Size + Item Quantity scale splinter/catalyst drops
    - **Delirium:** Pack Size + Monster Effectiveness maximize fog reward tiers
    - **Abyss:** Rare Monster frequency prevents pits from closing early
  - **Note:** Blight and Legion have FIXED spawns — Pack Size does NOT affect them.
  - Weights are stored in a configurable `synergy-weights.json` so advanced users can tune coefficients.

### 2.2 Precursor Tablet In-Game Hover Check

Hovering over any Precursor Tablet in your inventory or stash and triggering the hotkey activates full valuation.

- **Clipboard Detection:**
  - Item Class in clipboard is `Tablets` (not `Precursor Tablets`).
  - Base implicit line identifies the mechanic (e.g. `Adds an Otherworldly Breach to a Map`).
  - `Uses remaining` appears as an implicit line (charges system).

- **All 8 Tablet Types Supported:**
  1. `Breach Precursor Tablet` — Otherworldly Breaches
  2. `Expedition Precursor Tablet` — Kalguuran Expedition encounters
  3. `Delirium Precursor Tablet` — Mirror of Delirium
  4. `Ritual Precursor Tablet` — Ritual Altars
  5. `Abyss Precursor Tablet` — Abysses / Abyss pits
  6. `Temple Precursor Tablet` — Vaal Beacon / Incursion content
  7. `Irradiated Tablet` — Increased area level, monster difficulty, item rarity, experience
  8. `Overseer Tablet` — Empowers map bosses (extra mods, Azmeri Spirits)

- **Market Valuation:**
  - Parses explicit roll tiers and uses remaining.
  - Queries `pathofexile.com/api/trade2/search/poe2/[league]` for matching tablet base type + explicit rolls.
  - Filters by minimum `Uses Remaining` threshold to avoid depleted tablet scam listings.
  - Denominates price in **Chaos, Exalted, Vaal, and Divine**.

- **Tower & Waystone Synergy Guidance:**
  - Displays Waystone mod slot requirements (1–2 mods = 1 slot, 3–5 mods = 2 slots, 6+ mods = 3 slots).
  - Highlights optimal Waystone pairings (e.g. pair Breach Tablet with T15+ Waystone with high Pack Size).
  - Notes that filling all slots locks the map to only the chosen tablet types.

- **"Jackpot" Modifier Highlights:**
  - Identifies high-demand roll tiers (e.g. T1 `Breaches in Map have 2 additional Spawns`, T1 `Breach Monsters in Map have 15% increased Pack Size`).
  - Displays premium above base tablet price.

### 2.3 Rare & Unique Gear Valuation

When you hover over weapons, armour, jewelry, or charms:

- **Full Affix Parsing:** Extracts every prefix/suffix, tier, and numeric value.
- **Interactive Overlay:** Checkboxes per mod, min/max roll sliders, `[ + Add Custom Stat ]` button.
- **Live Trade Listings:** Queries official PoE 2 trade API with exact filters, shows top active listings with player online/AFK status.
- **Unique Items:** Cross-references poe.ninja cache for instant pricing (no trade API needed).

### 2.4 Commodity Pricing & Multi-Currency Display

For all bulk items (Runes, Currencies, Essences, Uncut Gems, Soul Cores):

- **Multi-Denomination (Always Shown):**
  - 🔸 **Chaos**
  - ⭐ **Exalted**
  - 🩸 **Vaal**
  - 💠 **Divine**

- **Buy vs. Sell Spread:**
  - Sourced from poe.ninja PoE 2 API `pay` and `receive` objects.
  - Labeled as **"Exchange Buy Rate"** and **"Exchange Sell Rate"** (PoE 2 uses the automated in-game Currency Exchange, so spreads may be smaller than PoE 1 player-to-player trading).
  - When spread is < 2%, displays a note: "Effectively single market rate."

- **24h & 7d Trend Sparkline:**
  - Micro SVG chart from poe.ninja's `sparkline.data` (7-element array of daily % changes) and `sparkline.totalChange`.
  - Separate `paySparkLine` and `receiveSparkLine` for buy/sell trend divergence.
  - Trend badges: `▲ +18.4%` (green) / `▼ -12.1%` (red).
  - **Volume & Confidence:** Shows listing count so users can spot price fixers (3 listings vs. 1,000+ listings).

- **One-Click poe.ninja Link:**
  - Button opens `https://poe.ninja/poe2/economy/[league]/[category]?name=[itemName]` in default browser.

### 2.5 Dedicated Currency Conversion & Arbitrage Mini-HUD

Summoned via dedicated hotkey (e.g. `F4`):

- **Real-Time Exchange Rates:**
  - Displays instant Buy and Sell ratios + spread margin from poe.ninja cache.

- **Default Pairs:**
  - `Chaos ➔ Divine`
  - `Chaos ➔ Exalted`
  - `Exalted ➔ Chaos`
  - `Exalted ➔ Divine`
  - `Vaal ➔ Exalted`
  - `Alchemy ➔ Exalted`

- **Customizable Pair Manager:**
  - `[ + Add Custom Currency Pair ]`: Choose any base + target currency from dropdowns.
  - `🗑️` delete icon to remove pairs. Drag to reorder.
  - Settings saved locally to config store.

- **Arbitrage Flagger (`⚡`):** Highlights spreads exceeding 10%.

---

## 3. Data Sources & API Integration

### 3.1 poe.ninja PoE 2 Economy API (Primary Data Source)

> **Handles ~70% of all price lookups with zero trade API cost.**

- **Correct PoE 2 Endpoint (NOT the PoE 1 URL):**
  ```
  GET https://poe.ninja/poe2/api/economy/exchange/current/overview?league={league}&type={type}
  ```
  Types: `Currency`, `Fragments`, `Essences`, `Runes`, `Uncut Gems`, etc.

- **Leagues Endpoint:**
  ```
  GET https://poe.ninja/poe2/api/economy/leagues
  ```

- **Response Structure:**
  ```json
  {
    "lines": [{
      "currencyTypeName": "...",
      "chaosEquivalent": 42.5,
      "pay": { "value": ..., "count": ... },
      "receive": { "value": ..., "count": ... },
      "paySparkLine": { "data": [0, -0.1, 0.2, 0.4], "totalChange": 0.4 },
      "receiveSparkLine": { "data": [...], "totalChange": ... }
    }]
  }
  ```

- **Caching:** Data updates hourly on poe.ninja's side. App refreshes local cache every 10–15 minutes.
- **No authentication required.** No rate limits beyond polite caching.

### 3.2 Official PoE 2 Trade API (Secondary — For Rares, Waystones, Tablets)

- **Search Endpoint:**
  ```
  POST https://www.pathofexile.com/api/trade2/search/poe2/{league}
  ```

- **Fetch Listings Endpoint:**
  ```
  GET https://www.pathofexile.com/api/trade2/fetch/{id1},{id2},...?query={search_id}
  ```
  Max 10 item IDs per fetch call (always batch to maximum).

- **Supporting Data Endpoints (no auth required):**
  - `GET /api/trade2/data/leagues` — active leagues
  - `GET /api/trade2/data/stats` — all stat IDs with human-readable text (fetched on startup, cached)
  - `GET /api/trade2/data/static` — base type definitions
  - `GET /api/trade2/data/filters` — available filter categories

- **Required Headers:**
  ```
  User-Agent: PoE2QuickTools/1.0 (contact@your-email.com)
  Content-Type: application/json
  Cookie: POESESSID=<optional>
  ```
  > **GGG blocks generic or missing User-Agent headers.**

### 3.3 Rate Limiting Strategy

GGG uses **dynamic multi-tier sliding window** rate limits. The app must handle these proactively:

- **Response Headers to Parse:**
  - `X-Rate-Limit-Ip`: Format `limit:interval:timeout` (e.g. `12:6:60` = max 12 requests per 6 seconds, 60-second penalty)
  - `X-Rate-Limit-Ip-State`: Current usage counter (e.g. `3:6:0`)
  - `X-Rate-Limit-Account` / `X-Rate-Limit-Account-State`: Same format, per-account (requires POESESSID)
  - Multiple rules can be comma-separated (e.g. `12:6:60,45:60:120`)

- **Rate Limit Manager (`rate-limiter.ts`):**
  - Reads `X-Rate-Limit-*` headers from every response.
  - Tracks all active sliding windows simultaneously.
  - Proactively throttles requests before hitting any ceiling.
  - On HTTP `429 Too Many Requests`: exponential backoff with jitter.
  - Displays `RateLimitBanner.vue` in overlay when throttled ("Trade API throttled, retrying in Xs...").

- **Throughput Maximization Strategies:**

  | Strategy | Effect |
  |---|---|
  | **Use POESESSID** | Separate account-based rate bucket on top of IP bucket (effectively doubles headroom) |
  | **poe.ninja as primary** | ~70% of lookups served from local cache (zero trade API cost) |
  | **Batch fetch calls** | Always fetch 10 item IDs per `/fetch/` call (max allowed) |
  | **Deduplicate searches** | Short-lived response cache prevents re-querying same item within 30s |
  | **Dynamic header parsing** | Never hardcode limits — GGG adjusts them based on server load, especially during league launches |

- **Realistic Usage:** During normal gameplay, a player cannot physically trigger more than 2–3 price checks per 6 seconds. Combined with poe.ninja caching, the rate limit is effectively never reached.

### 3.4 POESESSID Configuration (Optional)

**What it is:** A session cookie from the Path of Exile website that identifies your account to the trade API.

**How to obtain it:**
1. Log into [pathofexile.com](https://www.pathofexile.com) in your browser
2. Press `F12` to open Developer Tools
3. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
4. Expand **Cookies** → click `https://www.pathofexile.com`
5. Find the row named `POESESSID` and copy its **Value** (hex string like `3c17e9baf6e2a148f0e4f53c26751a28`)

**Why it helps:**
- Without POESESSID: IP-only rate bucket (shared with all tools on your network)
- With POESESSID: Separate account-based rate bucket (higher effective throughput)

**Security:**
- Stored locally in `electron-store` (encrypted on disk)
- Never transmitted anywhere except to `pathofexile.com` trade API requests
- Displayed as masked dots (`●●●●●●`) in settings UI with toggle eye icon
- Expires when you log out of the website or after ~30 days — just paste a new one

**The app works fully without POESESSID.** This is purely an optional power-user setting for heavy traders.

### 3.5 Static Game Data Source

**RePoE PoE 2 Fork** (`repoe-fork.github.io/poe2/`):
- `mods.json` — All modifier definitions, tiers, weights, tags
- `stats.json` — Stat IDs and their properties
- `stat_translations.json` — Human-readable stat text templates
- `base_items.json` — All base item types

These JSON files are datamined directly from PoE 2 game files (GGPK), regularly updated, and machine-readable. Bundled as static data in the app's `data/repoe/` directory, with periodic update checks.

---

## 4. System Architecture & Tech Stack

```
poe2-quicktools/
├── electron/
│   ├── main.ts                 # App lifecycle, electron-overlay-window setup
│   ├── preload.ts              # Secure contextBridge (IPC API)
│   ├── overlay-manager.ts      # electron-overlay-window integration, cursor anchoring
│   ├── hotkey-service.ts       # uiohook-napi global hooks
│   ├── clipboard-service.ts    # Ctrl+C simulation & clipboard reading
│   ├── parsers/
│   │   ├── item-parser.ts      # Base parser (detects Item Class, dispatches to sub-parsers)
│   │   ├── waystone-parser.ts  # Parses BOTH header aggregates AND individual explicit mods
│   │   │                       # Handles Advanced Mod Descriptions ON and OFF formats
│   │   ├── tablet-parser.ts    # Item Class: "Tablets", base mechanic, uses remaining, explicits
│   │   ├── gear-parser.ts      # Rare/Unique equipment affixes
│   │   └── commodity-parser.ts # Runes, Currencies, Essences, Gems
│   ├── services/
│   │   ├── trade-api.ts        # pathofexile.com/api/trade2/ client WITH rate limiter
│   │   ├── trade-stats.ts      # Dynamic stat ID resolver (fetches /api/trade2/data/stats on startup)
│   │   ├── poe-ninja-api.ts    # poe.ninja/poe2/api/economy/ client + background cache (10-15 min)
│   │   ├── league-detector.ts  # Auto-detect active challenge league (poe.ninja + trade2 fallback)
│   │   └── synergy-engine.ts   # Community-estimate weighted scoring (configurable weights)
│   ├── rate-limiter.ts         # Sliding window rate limit manager (reads X-Rate-Limit-* headers)
│   └── config-store.ts         # electron-store: shortcuts, POESESSID (encrypted), currency pairs
│
├── data/
│   ├── repoe/                  # RePoE JSON snapshots (mods.json, stats.json, stat_translations.json)
│   └── synergy-weights.json    # Configurable content synergy coefficients
│
├── src/                        # Vue 3 Frontend (Vite + Tailwind CSS)
│   ├── App.vue                 # Overlay root container
│   ├── components/
│   │   ├── WaystoneCard.vue    # Waystone valuation, mod sliders, synergy scores, effectiveness breakdown
│   │   ├── TabletCard.vue      # Precursor Tablet valuation, tower guidance, jackpot highlights
│   │   ├── CommodityCard.vue   # Multi-currency prices (Chaos/Ex/Vaal/Div) & sparklines
│   │   ├── GearPriceCard.vue   # Rare/Unique gear affix filter & live trade results
│   │   ├── ConversionHUD.vue   # Currency arbitrage dashboard with Add/Remove pairs
│   │   ├── SettingsModal.vue   # Custom shortcuts, POESESSID input, display configuration
│   │   └── RateLimitBanner.vue # Shows throttle status when trade API is rate-limited
│   ├── stores/                 # Pinia state stores (currency rates, user pairs, cache)
│   └── assets/                 # Dark PoE 2 theme stylesheets
│
├── package.json
├── vite.config.ts
└── tsconfig.json
```

### Key Dependencies

```json
{
  "dependencies": {
    "electron-overlay-window": "^4.x",
    "uiohook-napi": "^1.x",
    "vue": "^3.x",
    "pinia": "^2.x",
    "electron-store": "^8.x"
  },
  "devDependencies": {
    "electron": "^33.x",
    "electron-builder": "^24.x",
    "vite": "^5.x",
    "@vitejs/plugin-vue": "^5.x",
    "tailwindcss": "^3.x",
    "typescript": "^5.x"
  }
}
```

---

## 5. In-Game Ergonomics & UI/UX

1. **Smart Cursor Anchoring:**
   - Overlay spawns beside cursor, dynamically flipping if near screen edges to prevent off-screen rendering.

2. **Two Interaction Modes:**
   - **Quick-Peek Mode:** Spawns on hotkey, automatically dismisses when cursor moves away or `Esc` is tapped.
   - **Pinned Mode (`P` key):** Freezes overlay for editing mod checkboxes, dragging sliders, or copying trade whispers.

3. **Click-Through Management:**
   - Default state: `win.setIgnoreMouseEvents(true, { forward: true })` — all clicks pass to PoE 2.
   - When overlay card is active: `win.setIgnoreMouseEvents(false)` — enables interaction with checkboxes, sliders, buttons.
   - Uses `focusable: false` and `win.showInactive()` to prevent stealing game focus.
   - Hover detection via throttled `document.elementFromPoint()` + `mousemove` (avoids `mouseenter`/`mouseleave` desync during rapid mouse movement).

4. **Custom Shortcut Management:**
   - `Price Check`: `Ctrl + D` (Default)
   - `Waystone / Tablet Check`: `Ctrl + X` (Default)
   - `Currency Arbitrage HUD`: `F4` (Default)
   - `Direct poe.ninja Open`: `Ctrl + Alt + D` (Default)
   - `Dismiss Overlay`: `Esc` (Default)
   - All shortcuts fully rebindable in Settings.

5. **Electron Overlay Window Configuration:**
   ```javascript
   // Main process — overlay window creation
   const overlayWindow = new BrowserWindow({
     transparent: true,
     frame: false,
     resizable: false,
     skipTaskbar: true,
     focusable: false,       // Critical: prevents stealing focus from PoE 2
     webPreferences: {
       preload: path.join(__dirname, 'preload.js'),
       contextIsolation: true,
     },
   });
   overlayWindow.setAlwaysOnTop(true, 'screen-saver');
   // Use showInactive() instead of show() to avoid focus steal
   overlayWindow.showInactive();
   ```

6. **Game Mode Requirement:** Path of Exile 2 must run in **Windowed Fullscreen (Borderless)**. Exclusive Fullscreen is not compatible with any overlay tool.

---

## 6. Comprehensive Phased Implementation Roadmap

> **Agent Resumption Protocol:**  
> Any agent resuming work must:
> 1. Check the **Phase Status Tracker** below to find the current active phase.
> 2. Run the **Verification Command** of the prior phase to ensure the workspace is in a healthy, passing state.
> 3. Implement the phase tasks strictly adhering to the file paths and interface contracts specified.
> 4. Execute the phase's **Definition of Done (DoD) Verification Commands**.
> 5. Update the Phase Status Tracker to `[x]` and commit with the provided conventional commit message.

### Phase Status Tracker

| Phase | Milestone Name | Status | Lead Artifact / Output |
|---|---|---|---|
| **Phase 0** | Project Scaffolding & Build Pipeline | `[ ] NOT STARTED` | Vite + Vue 3 + Electron + Vitest scaffold running |
| **Phase 1** | Transparent Overlay & Global Input Hooks | `[ ] NOT STARTED` | Borderless click-through overlay with `uiohook-napi` |
| **Phase 2** | Deterministic Parsers & Game Data | `[ ] NOT STARTED` | Dual-format Waystone, Tablet & Gear parsers + Vitest suite |
| **Phase 3** | Network Services, Caching & Rate Limiting | `[ ] NOT STARTED` | poe.ninja PoE 2 client, trade2 rate-limiter & stat resolver |
| **Phase 4** | In-Game Overlay UI Components | `[ ] NOT STARTED` | WaystoneCard, TabletCard, CommodityCard, ConversionHUD |
| **Phase 5** | E2E In-Game Polish, Stress Testing & Packaging | `[ ] NOT STARTED` | Standalone portable `.exe` + verified in-game workflow |

---

### Phase 0: Project Scaffolding & Build Pipeline

#### 0.1 Objectives
Create a rock-solid, type-safe development environment with Electron 33+, Vite 5+, Vue 3, TypeScript, Tailwind CSS, and Vitest. Ensure clean build, lint, and test scripts.

#### 0.2 Target File Tree
```
poe2-quicktools/
├── electron/
│   ├── main.ts              # Minimal bootstrap
│   └── preload.ts           # Basic IPC bridge
├── src/
│   ├── App.vue              # Base shell
│   ├── main.ts              # Vue app entry
│   └── assets/main.css      # Tailwind base styles
├── tests/
│   └── setup.ts             # Vitest test setup
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js
```

#### 0.3 Detailed Tasks
1. **Package Setup:** Initialize `package.json` with scripts:
   - `"dev"`: Runs Vite dev server + launches Electron.
   - `"build"`: Compiles TypeScript and packages renderer via Vite.
   - `"test"`: Runs Vitest in watch/run mode.
   - `"typecheck"`: Runs `vue-tsc --noEmit`.
2. **TypeScript & Vite Config:**
   - Configure path aliases (`@/` -> `src/`, `@electron/` -> `electron/`).
   - Configure `vite-plugin-electron` or custom concurrent dev script for hot module replacement (HMR) in renderer.
3. **Tailwind CSS Setup:**
   - Configure dark PoE 2 color palette (slate backgrounds `#0f1115`, gold `#d4a373`, currency purple `#9b5de5`, health red `#e63946`).
4. **Test Harness Setup:**
   - Configure Vitest with JSDOM environment for unit testing parsers and components without running Electron.

#### 0.4 Definition of Done (DoD) & Verification
- [ ] `npm run typecheck` exits code `0` with zero TypeScript errors.
- [ ] `npm run test` runs and passes basic sanity test.
- [ ] `npm run build` generates clean outputs in `dist/` and `dist-electron/`.
- **Commit:** `feat(setup): initialize vite electron vue3 typescript tailwind test pipeline`

---

### Phase 1: Transparent Overlay Architecture & Global Input Hooking

#### 1.1 Objectives
Implement the native Windows click-through transparent overlay window and global input interception that functions flawlessly while Path of Exile 2 is focused in Borderless Windowed mode.

#### 1.2 Target File Tree
```
electron/
├── overlay-manager.ts     # HWND attachment, sizing, screen-clamping, focusless display
├── hotkey-service.ts      # uiohook-napi global listener & shortcut dispatcher
├── clipboard-service.ts   # Robotic Ctrl+C trigger & clipboard text extractor
└── main.ts                # App lifecycle wiring & IPC handlers
```

#### 1.3 Detailed Tasks
1. **Window Creation & Properties:**
   - Window flags: `transparent: true`, `frame: false`, `resizable: false`, `skipTaskbar: true`, `focusable: false`.
   - Set `alwaysOnTop: 'screen-saver'` to sit above the game.
   - Attach to PoE 2 window bounds dynamically (via `electron-overlay-window` or screen dimension detection).
2. **Focusless Activation (`showInactive`):**
   - Ensure the window is shown with `win.showInactive()` so PoE 2 does not lose operating system focus or trigger game pause.
3. **Click-Through Toggling (`setIgnoreMouseEvents`):**
   - Idle state: `win.setIgnoreMouseEvents(true, { forward: true })`. All clicks pass directly through to PoE 2.
   - Interactive state (card active or pinned): `win.setIgnoreMouseEvents(false)`. Clicks engage with sliders and checkboxes.
   - IPC endpoints: `overlay:set-interactive(boolean)`.
4. **Global Input Interception (`uiohook-napi`):**
   - Register global listeners for:
     - `Ctrl + D` -> Trigger price check.
     - `Ctrl + X` -> Trigger Waystone/Tablet check.
     - `F4` -> Toggle Currency Conversion HUD.
     - `Esc` -> Dismiss overlay.
     - `P` -> Toggle Pinned Mode.
5. **Simulated Clipboard Capture (`clipboard-service.ts`):**
   - On price check hotkey: programmatically synthesize `Ctrl + C` (using `robotjs`, `nut-js`, or PowerShell/Windows API simulation), wait 30ms, and read `clipboard.readText()`.

#### 1.4 Definition of Done (DoD) & Verification
- [ ] Pressing `Ctrl + D` anywhere in Windows logs the captured clipboard text to Electron console.
- [ ] Overlay window renders on top of a game or browser without stealing active window focus.
- [ ] Mouse clicks fall through to underlying windows when idle, but register on overlay buttons when active.
- **Commit:** `feat(overlay): implement transparent click-through window and uiohook global input`

---

### Phase 2: Deterministic Parsers & Game Data (Zero AI Engine)

#### 2.1 Objectives
Build high-performance, deterministic regular expression parsers for all PoE 2 item types, supporting both "Advanced Mod Descriptions" ON and OFF. Implement the Monster Effectiveness breakdown and content synergy calculation engine.

#### 2.2 Target File Tree
```
electron/parsers/
├── item-parser.ts         # Master dispatcher inspecting 'Item Class' and 'Rarity'
├── waystone-parser.ts     # Dual-format parser: aggregated header + explicit affixes
├── tablet-parser.ts       # Base type (Breach, Ritual, etc.), charges, explicit rolls
├── gear-parser.ts         # Equipment affixes, roll brackets, implicit/explicit
└── commodity-parser.ts    # Runes, Currencies, Essences, Uncut Gems
electron/services/
├── synergy-engine.ts      # Deterministic formulas for Breach, Ritual, Delirium, Abyss
└── effectiveness-math.ts  # Monster Effectiveness toughness/XP/drop multipliers
data/
├── repoe/                 # Snapshot of RePoE PoE 2 JSON files
└── synergy-weights.json   # Configurable weights for content scoring
tests/parsers/
├── waystone-parser.spec.ts
├── tablet-parser.spec.ts
└── commodity-parser.spec.ts
```

#### 2.3 Detailed Tasks
1. **Master Item Parser Dispatcher (`item-parser.ts`):**
   - Parse raw clipboard text delimited by `--------`.
   - Read `Item Class: <Class>` and `Rarity: <Rarity>`.
   - Dispatch to dedicated sub-parsers.
2. **Waystone Parser (`waystone-parser.ts`):**
   - Extract Tier (1-16), Area Level, Quality.
   - Extract Aggregated Header values: `Item Quantity: +X% (augmented)`, `Item Rarity: +X% (augmented)`, `Pack Size: +X% (augmented)`, `Monster Effectiveness: +X%`.
   - Extract Individual Explicit Mods:
     - Handle Advanced ON: `{ Prefix Modifier "Name" } X(Min-Max)% <text>`.
     - Handle Advanced OFF: `X% <text>`.
3. **Precursor Tablet Parser (`tablet-parser.ts`):**
   - Match `Item Class: Tablets`.
   - Detect base mechanic from implicit line: `Adds an Otherworldly Breach to a Map`, `Adds a Kalguuran Expedition`, etc.
   - Extract `X uses remaining`.
   - Extract explicit modifier tiers and rolls.
4. **Effectiveness Math & Synergy Engine:**
   - Implement `calculateEffectiveness(effectivenessPercent)`:
     - `toughnessMultiplier = 1 + (effectivenessPercent * 0.01)`
     - `xpMultiplier = 1 + (effectivenessPercent * 0.005)`
     - `quantityMultiplier = 1 + (effectivenessPercent * 0.005)`
   - Implement `calculateSynergies(waystoneData, weights)`:
     - Calculates 0-100 scores for Breach, Ritual, Delirium, Abyss based on Pack Size, Quantity, Rarity, and specific mechanics.
5. **Comprehensive Vitest Suite:**
   - Create real PoE 2 clipboard mock fixtures for:
     - Rare T15 Waystone (Advanced ON & OFF)
     - Breach Precursor Tablet with 10 uses remaining
     - Rune of the Horde
     - Rare Regicide Armour with multiple affixes

#### 2.4 Definition of Done (DoD) & Verification
- [ ] `npm run test` executes all parser test suites with 100% pass rate.
- [ ] All edge cases (corrupted items, un-augmented waystones, 0 uses tablets) parsed without runtime throws.
- **Commit:** `feat(parser): add dual-format waystone tablet and gear deterministic parsers with vitest suite`

---

### Phase 3: Network Services, Caching & Dynamic Rate Limiting

#### 3.1 Objectives
Build resilient network clients for poe.ninja PoE 2 Economy and the official PoE 2 Trade API. Implement dynamic sliding-window rate limiting, in-memory caching, and encrypted local config persistence.

#### 3.2 Target File Tree
```
electron/services/
├── league-detector.ts     # Dynamic active challenge league resolver
├── poe-ninja-api.ts       # /poe2/api/economy/exchange/ client + 15m memory cache
├── trade-stats.ts         # Dynamic trade stat ID resolver from /api/trade2/data/stats
├── trade-api.ts           # Search & fetch client with batching (10 IDs)
├── rate-limiter.ts        # X-Rate-Limit header sliding-window queue & backpressure
└── config-store.ts        # electron-store for encrypted POESESSID and user preferences
tests/services/
├── rate-limiter.spec.ts
└── poe-ninja.spec.ts
```

#### 3.3 Detailed Tasks
1. **League Auto-Detection (`league-detector.ts`):**
   - Query primary: `GET https://poe.ninja/poe2/api/economy/leagues`.
   - Fallback query: `GET https://www.pathofexile.com/api/trade2/data/leagues`.
   - Filter out `Standard` and cache active league ID (e.g. `Forbidden Rites`).
2. **poe.ninja Client (`poe-ninja-api.ts`):**
   - Implement `GET https://poe.ninja/poe2/api/economy/exchange/current/overview?league={league}&type={type}`.
   - Cache results in memory with a 15-minute TTL.
   - Compute multi-currency conversion table across Chaos, Exalted, Vaal, Divine.
   - Extract 7-day sparklines (`paySparkLine`, `receiveSparkLine`, `sparkline.totalChange`).
3. **Dynamic Trade Stat Resolver (`trade-stats.ts`):**
   - Fetch `GET https://www.pathofexile.com/api/trade2/data/stats` on startup.
   - Index by text pattern to map human-readable mods (e.g. `increased Monster Pack Size`) to current patch stat IDs.
4. **Sliding-Window Rate Limiter (`rate-limiter.ts`):**
   - Parse `X-Rate-Limit-Ip`, `X-Rate-Limit-Ip-State`, `X-Rate-Limit-Account`, `X-Rate-Limit-Account-State`.
   - Maintain queue with delay throttling when usage exceeds 80% of window allowance.
   - Handle HTTP 429 with exponential backoff and dispatch IPC event to show `RateLimitBanner`.
5. **Official Trade Search & Batch Fetch (`trade-api.ts`):**
   - Construct queries for Waystones, Tablets, and Rare items.
   - Attach mandatory descriptive `User-Agent`.
   - Attach optional `Cookie: POESESSID=...` from config store.
   - Batch fetch: request 10 item IDs per `/fetch/` call.
   - 30-second in-memory deduplication cache.
6. **Encrypted Config Store (`config-store.ts`):**
   - Store custom currency pairs, shortcut rebinds, and encrypted POESESSID via `electron-store`.

#### 3.4 Definition of Done (DoD) & Verification
- [ ] Vitest mocks rate limit headers (`12:6:60`) and proves the rate limiter throttles before exceeding limits.
- [ ] poe.ninja client successfully parses multi-currency buy/sell rates and sparkline arrays.
- [ ] Config store safely encrypts and retrieves sensitive keys.
- **Commit:** `feat(api): add poe-ninja client sliding-window trade rate-limiter and league detector`

---

### Phase 4: In-Game Overlay UI Components & Ergonomics

#### 4.1 Objectives
Build high-contrast, non-intrusive Vue 3 components matching Path of Exile 2 aesthetics. Ensure snappy interactions, cursor anchoring, and keyboard accessibility.

#### 4.2 Target File Tree
```
src/
├── stores/
│   ├── overlay.ts         # Coordinates, active card type, pinned state
│   ├── economy.ts         # poe.ninja cached rates, conversion table
│   └── settings.ts        # Shortcuts, POESESSID, user pairs
├── components/
│   ├── WaystoneCard.vue   # Aggregates, mod toggles/sliders, synergy ratings, effectiveness
│   ├── TabletCard.vue     # Tablet base, explicit roll tiers, tower slot recommendations
│   ├── CommodityCard.vue  # Multi-currency (Chaos/Ex/Vaal/Div), buy/sell spread, sparklines
│   ├── GearPriceCard.vue  # Checkboxes, min/max inputs, "+ Add Stat", trade listings
│   ├── ConversionHUD.vue  # Quick arbitrage dashboard, custom pair manager
│   ├── SettingsModal.vue  # Rebindable shortcuts, masked POESESSID input
│   └── RateLimitBanner.vue# Yellow/red warning banner when trade API is throttled
├── App.vue                # Root view, cursor clamping, escape listener
└── assets/main.css
```

#### 4.3 Detailed Tasks
1. **Dynamic Cursor Positioning & Clamping:**
   - Spawn overlay adjacent to cursor (`x + 20px`, `y + 20px`).
   - Clamp to viewport: if `x + cardWidth > window.innerWidth`, flip to `x - cardWidth - 20px`. Same for `y`.
2. **WaystoneCard.vue:**
   - Render header aggregates (Pack Size, Quantity, Rarity, Effectiveness).
   - Render expandable explicit mod list with checkboxes and Min/Max numeric inputs.
   - Render Content Synergy scores (Breach, Ritual, Delirium, Abyss) with color badges (S-Tier Gold, A-Tier Purple, etc.).
   - Render Monster Effectiveness breakdown (+X% Toughness vs +Y% Quant/XP).
3. **TabletCard.vue:**
   - Display Tablet mechanic base icon, uses remaining, and explicit roll tiers.
   - Display Waystone synergy requirement (e.g. "Requires Waystone with 3-5 mods for 2 tablet slots").
   - Display active market prices in Chaos, Exalted, Vaal, Divine.
4. **CommodityCard.vue:**
   - Display Buy vs Sell prices across Chaos, Exalted, Vaal, Divine.
   - Display 24h & 7d % trend badges and mini SVG sparkline chart.
   - Render "Open on poe.ninja" button with external browser launch.
5. **ConversionHUD.vue:**
   - Dedicated modal triggered by `F4`.
   - Render default pairs (`Chaos ⇄ Div`, `Chaos ⇄ Ex`, `Ex ⇄ Div`, `Vaal ➔ Ex`, `Alc ➔ Ex`).
   - Provide `[ + Add Custom Pair ]` dropdown dialog and `🗑️` delete action.
   - Flag arbitrage opportunities (`⚡ Spread > 10%`).
6. **SettingsModal.vue:**
   - Keybind recorder to rebind shortcuts.
   - Masked POESESSID input with show/hide toggle.
   - Dark mode PoE 2 aesthetic.

#### 4.4 Definition of Done (DoD) & Verification
- [ ] All components render with zero console warnings in development mode.
- [ ] Hovering over mock Waystone, Tablet, Commodity, and Gear renders respective cards cleanly.
- [ ] Conversion HUD allows adding and deleting custom currency pairs with state persisted.
- [ ] Pressing `Esc` or clicking outside dismisses unpinned overlay.
- **Commit:** `feat(ui): implement poe2 themed waystone tablet commodity and conversion overlay components`

---

### Phase 5: E2E In-Game Polish, Stress Testing & Packaging

#### 5.1 Objectives
Perform end-to-end integration tests in real Path of Exile 2 gameplay (Borderless Windowed). Verify anti-flicker stability, rate-limit defense under rapid hotkey spam, and build standalone release executables.

#### 5.2 Target File Tree
```
poe2-quicktools/
├── electron-builder.yml   # Windows packaging configuration
├── build/                 # App icons (icon.ico, 256x256 png)
└── dist/                  # Packaged release binaries
```

#### 5.3 Detailed Tasks
1. **In-Game Overlay Verification:**
   - Test in PoE 2 (Windowed Fullscreen).
   - Test alt-tabbing: verify overlay does not minimize or lose z-order above the game.
   - Test interaction toggle: verify dragging sliders does not pass accidental clicks to the game character.
2. **Rate Limit Stress Testing:**
   - Rapidly press `Ctrl + D` on 20 items in 5 seconds.
   - Verify `RateLimitBanner` displays throttling notice gracefully without triggering HTTP 429 lockout.
3. **Dual Clipboard Compatibility Test:**
   - Verify parsing with in-game setting "Advanced Mod Descriptions" toggled ON and OFF.
4. **Standalone Packaging:**
   - Configure `electron-builder` for Windows (`target: ['nsis', 'portable']`).
   - Produce portable `.exe` in `dist/`.
   - Verify portable executable runs on a clean Windows machine without Node.js installed.

#### 5.4 Definition of Done (DoD) & Verification
- [ ] Portable `.exe` launches, captures clipboard from PoE 2, displays overlay, and closes cleanly.
- [ ] Rate limit manager successfully absorbs rapid querying without IP ban.
- [ ] All tests in `npm run test` pass with 0 failures.
- **Commit:** `chore(release): configure electron-builder packaging and finalize v1.0.0 release pipeline`

---

## 7. Next Immediate Action for Implementing Agent

To begin implementation right away, start with **Phase 0**:
```bash
# Verify environment
node -v
npm -v
git status

# Execute Phase 0 setup:
npm init -y
# Install Vite, Electron, Vue 3, TypeScript, Tailwind, Vitest
```


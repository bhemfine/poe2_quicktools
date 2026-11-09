# PoE 2 QuickTools — Architecture & Implementation Plan

> **A high-performance, non-intrusive in-game overlay for Path of Exile 2.**  
> Combines the modifier filtering of **Exiled Exchange 2**, the speed and ergonomics of **Sidekick**, and the real-time economy & multi-currency arbitrage tracking of **poe.ninja**.

---

## 1. Overview & Core Philosophy

1. **Strictly PoE 2 (Latest Active Challenge League):**
   - Dedicated exclusively to Path of Exile 2.
   - Auto-detects the active challenge league (e.g. `Forbidden Rites`) on boot. Standard league is ignored.
2. **100% Deterministic (Zero AI at Runtime):**
   - No external AI/LLM APIs, no token costs, and zero hallucinations.
   - Uses pre-compiled stat definitions from `poe2db.tw`, fast regex parsing, and direct REST calls to official PoE 2 APIs.
   - Instant response times (< 15 ms).
3. **Seamless Windows Click-Through Overlay:**
   - Fullscreen borderless transparent Electron window.
   - Mouse clicks pass directly through into PoE 2 when idle (`setIgnoreMouseEvents(true, { forward: true })`).
   - Interactivity activates only when hovering an active overlay card or entering Pinned Mode (`P`).

---

## 2. Feature Specifications

### 2.1 Waystone Valuation & Live Market Calculation
When you hover over any Waystone and trigger the hotkey (e.g. `Ctrl + D`):
- **Deep Stat Parsing:** Extracts Map Tier (T1–T16), Rarity, Quality, and exact numeric rolls for:
  - `+% Increased Quantity of Items Found` (Monster Quantity)
  - `+% Increased Monster Effectiveness`
  - `+% Increased Rarity of Items Found` (Drop Quality)
  - `+% Increased Monster Pack Size`
  - Explicit Modifiers (e.g. Area contains Breach, Extra packs, etc.)
- **Direct Query to `pathofexile.com/trade2/search/poe2/[league]`:**
  - Converts parsed values into official trade API filters (`map_tier`, `map_pack_size`, `map_iiq`, `explicit.stat_...` for Monster Effectiveness).
  - Fetches lowest active online listings to reflect what players are genuinely paying for those specific roll thresholds.
- **Interactive Mod Toggles & Sliders (Exiled Exchange 2 Style):**
  - Toggle any stat on/off with a single click.
  - Adjust min/max roll range inputs to widen or narrow the search.
- **Content Synergy Scoring:**
  - Evaluates synergy scores (0–100) for **Breach**, **Abyss**, **Delirium**, and **Ritual** based on `poe2db.tw` scaling formulas.
  - **Monster Effectiveness Breakdown:** Calculates exact net multipliers:
    - `+0.5% More Drops` per 1% roll.
    - `+0.5% More XP` per 1% roll.
    - `+1.0% More Toughness (HP/Defenses)` per 1% roll.

### 2.2 Precursor Tablet In-Game Hover Check
Hovering over any Precursor Tablet in your inventory or stash activates full valuation:
- **Tablet Mechanics Supported:**
  - `Breach Precursor Tablet`
  - `Expedition Precursor Tablet`
  - `Delirium Precursor Tablet`
  - `Ritual Precursor Tablet`
  - `Abyss Precursor Tablet`
  - `Overseer's Tablet` & `Irradiated Tablet`
- **Market Valuation:**
  - Parses explicit roll tiers (e.g. *+40% increased Clasped Hands*, *+35% Logbook Drops*) and charges remaining.
  - Queries `pathofexile.com/trade2/search/poe2/[league]` for matching rolls.
  - Denominates price in **Chaos, Exalted, Vaal, and Divine**.
- **Tower & Waystone Synergy Guidance:**
  - Displays Waystone mod slot requirements (1–2 mods = 1 slot, 3–5 mods = 2 slots, 6+ mods = 3 slots).
  - Highlights optimal Waystone pairings (e.g. pair Breach Tablet with T15+ Waystone with >30% Pack Size).

### 2.3 Commodity Pricing & Multi-Currency Arbitrage
For all bulk items (Runes, Currencies, Essences, Uncut Gems, Soul Cores):
- **Multi-Denomination:** Always displays prices in:
  - 🔸 **Chaos**
  - ⭐ **Exalted**
  - 🩸 **Vaal**
  - 💠 **Divine**
- **Buy vs. Sell Spread:**
  - Displays both **Buy Price** (instant purchase) and **Sell Price** (immediate liquidation) alongside the % arbitrage gap.
- **24h & 7d Trend Sparkline:**
  - Micro-chart embedded directly in the hover tooltip showing 7-day price trajectory.
  - Trend indicators (`▲ +18.4%` / `▼ -12.1%`).
- **One-Click poe.ninja Link:**
  - Quick-button opens `https://poe.ninja/poe2/economy/[league]/[category]?name=[itemName]` in default browser.

### 2.4 Dedicated Currency Conversion & Arbitrage Mini-HUD
Summoned via dedicated hotkey (e.g. `Ctrl + W` or `F4`):
- **Real-Time Exchange Rates:**
  - Displays instant Buy and Sell ratios + spread margin.
- **Default Pairs:**
  - `Chaos ➔ Divine`
  - `Chaos ➔ Exalted`
  - `Exalted ➔ Chaos`
  - `Exalted ➔ Divine`
  - `Vaal ➔ Exalted`
  - `Alchemy ➔ Exalted`
- **Customizable Pair Manager:**
  - Add any currency pair from dropdowns (`Regal`, `Gemcutter`, `Soul Cores`, `Runes`).
  - Delete or reorder pairs. Saved locally to `config.json`.
- **Arbitrage Flagger (`⚡`):** Highlights spreads exceeding 10% between instant buy and trade listings.

---

## 3. System Architecture & Tech Stack

```
poe2-quicktools/
├── electron/
│   ├── main.ts                # Application lifecycle & transparent window creation
│   ├── preload.ts             # Secure contextBridge exposing IPC API to renderer
│   ├── overlay-manager.ts     # Screen clamping, click-through management, position logic
│   ├── hotkey-service.ts      # Global input hook (uIOhook)
│   ├── clipboard-service.ts   # Simulated Ctrl+C & raw item text extractor
│   ├── parsers/
│   │   ├── item-parser.ts     # Regex parser for PoE 2 item blocks
│   │   ├── waystone-parser.ts # Waystone tier, effectiveness, quant, rarity, pack size
│   │   └── tablet-parser.ts   # Precursor Tablet base, explicit stats, charges
│   ├── services/
│   │   ├── trade-api.ts       # pathofexile.com/trade2/search API client
│   │   ├── poe-ninja-api.ts   # poe.ninja PoE 2 economy client & background cache
│   │   └── synergy-engine.ts  # poe2db.tw deterministic mechanics formulas
│   └── config-store.ts        # User settings, shortcuts, custom currency pairs
│
├── src/                       # Vue 3 Frontend (Vite + Tailwind CSS)
│   ├── App.vue                # Overlay root container
│   ├── components/
│   │   ├── WaystoneCard.vue   # Waystone valuation, mod sliders, synergy scores
│   │   ├── TabletCard.vue     # Precursor Tablet valuation & tower guidance
│   │   ├── CommodityCard.vue  # Multi-currency prices (Chaos/Ex/Vaal/Div) & sparklines
│   │   ├── GearPriceCard.vue  # Rare/Unique gear affix filter & live trade results
│   │   ├── ConversionHUD.vue  # Currency arbitrage dashboard with Add/Remove
│   │   └── SettingsModal.vue  # Custom shortcut manager & display configuration
│   ├── stores/                # Pinia state stores
│   └── assets/                # Dark PoE 2 theme stylesheets
│
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 4. In-Game Ergonomics & UI/UX

1. **Smart Cursor Anchoring:**
   - Overlay spawns beside cursor, dynamically flipping if near screen edges to prevent off-screen rendering.
2. **Two Interaction Modes:**
   - **Quick-Peek Mode:** Spawns on hotkey (`Ctrl + D`), automatically dismisses when cursor moves away or `Esc` is tapped.
   - **Pinned Mode (`P` key):** Freezes overlay for editing mod checkboxes, dragging sliders, or copying trade whispers.
3. **Custom Shortcut Management:**
   - `Price Check`: `Ctrl + D` (Default)
   - `Waystone / Tablet Check`: `Ctrl + X` (Default)
   - `Currency Arbitrage HUD`: `Ctrl + W` (Default)
   - `Direct poe.ninja Open`: `Ctrl + Alt + D` (Default)

---

## 5. Implementation Roadmap

### Phase 1: Foundation & Overlay Window
- Initialize Vite + Vue 3 + TypeScript + Tailwind CSS project with Electron.
- Implement fullscreen transparent window with `alwaysOnTop: 'screen-saver'` and `win.setIgnoreMouseEvents(true, { forward: true })`.
- Set up `uIOhook` for low-level global shortcut hooks.

### Phase 2: PoE 2 Parsers & Local Database
- Implement regex parsers for PoE 2 item formats:
  - Currencies, Runes, Essences, Gems.
  - Rare/Unique Equipment.
  - Waystones (Pack Size, Quantity, Rarity, Monster Effectiveness).
  - Precursor Tablets (Base mechanics, explicit rolls, charges).
- Compile static lookup tables from `poe2db.tw` for mod IDs, tiers, and synergy formulas.

### Phase 3: Trade & Economy Integrations
- Integrate `poe.ninja` PoE 2 Economy endpoints with background caching (multi-currency pricing across Chaos, Exalted, Vaal, Divine + 7-day sparkline).
- Integrate official `pathofexile.com/trade2/search/poe2/[league]` query builder for Waystones, Tablets, and Rare items.

### Phase 4: UI Components & Ergonomics
- Build `WaystoneCard.vue` with live market check and Breach/Abyss/Delirium/Ritual synergy ratings.
- Build `TabletCard.vue` with tower advice and explicit roll valuation.
- Build `CommodityCard.vue` with buy/sell arbitrage spread and sparklines.
- Build `ConversionHUD.vue` with custom pair management.
- Build `SettingsModal.vue` for user shortcut rebinding.

### Phase 5: Verification & Packaging
- Test in-game on borderless fullscreen Path of Exile 2.
- Package standalone Windows installer and portable `.exe` via electron-builder.

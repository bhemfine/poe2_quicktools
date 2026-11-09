# PoE 2 QuickTools — Build Plan (v2, 9 Nov 2026)

Matches **PLAN.md v2**. PLAN.md is the spec; this file is the milestone order and acceptance criteria for the coding agent. Read `PLAN.md §1.4 Hard constraints` first.

## Decisions (from the owner, 9 Nov 2026)
- **User-Agent:** `PoE2QuickTools/<version> (contact: Bhemfinechua@gmail.com)`. The version comes from `package.json`. Set in one place (`src/main/net/http.ts`).
- **Target platforms:** Windows 10 and 11, any scaling 100–200%+, mixed-DPI multi-monitor, any monitor arrangement including negative coordinates, PoE 2 Windowed or Windowed Fullscreen. The owner's machine (Win 11, 150%) is **one** test case, not the spec.
- **Hotkeys:** every action is user-customizable (capture UI, conflict detection, PoE 2 default-bind warnings, reset, persisted). Shipped combos are defaults only.
- **Exiled Exchange 2 reuse:** approved (MIT). Keep the license text and attribution (see "EE2 reuse rules").
- **No POESESSID in v1.** No app code is written until the owner says go.

## Hard constraints (summary of PLAN §1.4)
1. No memory reading, injection, or game-file changes. No timer- or screen-triggered actions.
2. One hotkey press → at most one synthetic action into the game (Ctrl+Alt+C). Whispers go to the clipboard only.
3. All HTTP from the main process with the UA above. Zero-429 rate limiting that follows `X-Rate-Limit-*` and `Retry-After`.
4. Nothing game-specific hardcoded (leagues, stats, bases, filter ids, ninja types → fetched or `config/*.json`).
5. GGG non-affiliation notice in About and Settings.

## Tech stack (pinned majors)
electron `~45` (fallback 44/43) · electron-vite `^6` · vite `^8` (→`^7` on peer conflict) · vue `^3.5` · @vitejs/plugin-vue `^6` · pinia `^4` · tailwindcss `^4` + @tailwindcss/vite · typescript `~5.9` (not 7.x) · vue-tsc `^3` · electron-overlay-window `^4.1` · uiohook-napi `^1.5` · zod (current) · electron-store `^12` + `safeStorage` · vitest `^5` + happy-dom · msw `^2` · electron-builder `^26` · electron-updater `^6` · Node 24 LTS. No robotjs or nut-js. Commit `package-lock.json`; CI uses `npm ci`.

## Repo layout
As in PLAN.md §4.1 (`src/main`, `src/preload`, `src/shared`, `src/renderer`, `config/`, `data/`, `scripts/`, `tests/{fixtures,unit,mock-server}`, `THIRD_PARTY_NOTICES.md`).

## EE2 reuse rules
- Source: `github.com/Kvan7/Exiled-Exchange-2`, pinned commit (record the SHA; shallow HEAD seen 9 Nov 2026 = `cca30662`, 6 Sep 2026). MIT, © 2020 Alexander Drozdov.
- Copy and adapt into our tree; don't add EE2 as a dependency. Each ported file starts with `// Adapted from Exiled-Exchange-2 <path> @ <sha> (MIT). Modified.`
- `THIRD_PARTY_NOTICES.md` contains the full MIT text plus a table of ported files → our files. Shown in About.
- Ported modules per milestone (full table in PLAN §4.3):

| Milestone | EE2 source | Our target |
|---|---|---|
| M1 | `main/src/shortcuts/HostClipboard.ts` | `src/main/clipboard/` |
| M1 | `main/src/shortcuts/Shortcuts.ts` (copy keystroke, accelerator helpers, focus-gated registration) | `src/main/input/` |
| M1 | `main/src/windowing/GameWindow.ts`, `OverlayWindow.ts`, `OverlayVisibility.ts` | `src/main/overlay/` |
| M2 | `renderer/src/parser/*` (Parser, ParsedItem, modifiers, advanced-mod-desc, stat-translations, meta) | `src/shared/parser/`, `src/shared/stat-match/` |
| M2 | `renderer/specs/Parser/items.ts` | seed fixtures (replaced by real copies) |
| M3 | `renderer/src/web/price-check/trade/RateLimiter.ts`, `Cache.ts`; ideas from `main/src/proxy.ts` | `src/main/net/` (extended: per-policy, persisted lockouts, cancellation) |
| M4 | `pathofexile-trade.ts`, `filters/create-stat-filters.ts`, `create-item-filters.ts` | `src/shared/query/` |

Not ported: EE2 UI widgets, its `api.exiledexchange2.dev` proxy, the remote logger, i18n.

---

## M0 — Scaffold & CI (½ day)
electron-vite + Vue + TS 5.9 + Tailwind 4 + Vitest + ESLint 9/Prettier. Scripts: `dev`, `build`, `typecheck`, `lint`, `test`. GitHub Actions on `windows-latest` (typecheck, lint, test, build). Secure defaults (`contextIsolation`, `sandbox`, no `nodeIntegration`, typed IPC allow-list). `THIRD_PARTY_NOTICES.md` skeleton, GGG notice in the About stub, UA constant.
**DoD:** all scripts exit 0 locally and in CI; a sanity test passes; `dist`/`out` builds.

## M1 — Overlay + copy loop on the real game ⭐ (3–4 days)
**Scope:**
- EOW `attachByTitle(win,'Path of Exile 2')` on one window built with `OVERLAY_WINDOW_OPTS`; click-through by default.
- Hotkey registry with the action list and defaults from `config/default-hotkeys.json`, registered via `globalShortcut` **only while PoE 2 is focused** (unregister on blur). Bindings are loaded from settings (persisted); a temporary JSON edit is enough for M1, the full UI comes in M5.
- Price Check → Ctrl+Alt+C via uiohook (skip held modifiers; configurable "advanced descriptions" key, default Alt) → clipboard poll 48 ms × ≤500 ms → restore previous clipboard → placeholder card (Item Class, Rarity, name/base, raw text).
- Interactive mode: clicking an input calls `activateOverlay()`; Esc or clicking the game calls `focusTarget()`.
- DPI-correct geometry module in `src/shared/geometry` (physical → DIP via `screen.screenToDipRect`, flip/clamp to game bounds).
- Dev hotkey "save last item text" → `tests/fixtures/clipboard/`. File logging.

**Acceptance criteria**
1. Hover an item in PoE 2 + Price Check hotkey → card within **300 ms** (p50 of 20) with the correct Item Class and base, for a Waystone, a Tablet, a rare armour, and a currency stack.
2. Copied text is the **advanced** format (contains `{ Prefix Modifier` / `{ Implicit Modifier`) regardless of in-game settings.
3. The previous clipboard (text copied from Notepad) is restored after each check.
4. With another app focused, the hotkey is **not registered**: the keypress reaches that app normally and no synthetic copy happens.
5. Bindings come from persisted settings: changing the Price Check binding in the settings file to `Ctrl+Shift+Q` and restarting makes only the new combo work. A combo already taken by another program is reported in the log/UI ("could not register"), not silently ignored.
6. Idle clicks reach the game. Clicking the card's test input lets you type into it with no keystrokes leaking to the game. Esc returns focus to the game.
7. **Display matrix** (card appears beside the cursor, fully inside the game window, text crisp, clicks land on the right elements):

   | # | OS | Setup | Mode |
   |---|---|---|---|
   | a | Win 11 | single monitor 150% (owner) | Windowed Fullscreen |
   | b | Win 11 | single 100% | Windowed (non-maximised, moved around) |
   | c | Win 10 | single 125% | Windowed Fullscreen |
   | d | Win 10 or 11 | 200% (or the max available, e.g. 4K) | Windowed Fullscreen |
   | e | any | two monitors, **mixed DPI** (e.g. 100% + 150%); game on secondary | both modes |
   | f | any | secondary monitor **left of / above** primary (negative coordinates) | both modes |
   | g | any | drag game window across monitors while overlay open | Windowed |
   | h | any | change Windows scaling while app running | Windowed Fullscreen |

   Cases without real hardware may be covered by a Windows VM / RDP session with custom scaling, but a, e, and f need real hardware or a reported tester. Record results in `docs/test-matrix.md`.
8. Exclusive fullscreen detected (or game not found) → tray notification with instructions; no crash.
9. Alt-tab away hides the overlay; back restores it without stealing focus.
10. Unit tests: modifier merging, clipboard poll/restore (Electron mocked), geometry (negative origins, scale factors 1.0/1.25/1.5/1.75/2.0/2.25, mixed-DPI rects, flip/clamp at all four edges). CI green.
11. ≥10 real fixtures saved (2 waystones incl. corrupted, 2 tablets incl. unique, 2 rares, 1 unique, currency, rune, essence, soul core).
12. Ported EE2 files carry headers and are listed in `THIRD_PARTY_NOTICES.md`.

## M2 — Parsers & stat matcher (3–4 days)
Port and adapt the EE2 parser into pure TS `src/shared`. Waystones: generic `Key: ±N% (augmented)` header, tier from base, both affix types as difficulty mods, no Item Quantity. Tablets: `Item Class: Tablet`, `<X> Tablet` + legacy `<X> Precursor Tablet`, `N uses remaining`, uniques. Gear: all mod groups, hybrids, `— Unscalable Value`, markup `[a|b]`. Stat matcher indexed from a recorded `/data/stats` fixture. Unknown lines go to `unparsed[]`; the parser never throws.
**DoD:** 100% of fixtures parse; ≥95% of explicit lines map to stat ids; fuzz test (random line deletion/duplication) has no throws.

## M3 — Network layer (3 days)
`electron.net` client with a persistent session and the UA. Per-policy limiter (PLAN §3.3): seeds search `5:10:60,15:60:300,30:300:1800,600:21600:3600`, fetch `12:4:10,16:12:300,50:300:300,1000:21600:1800`, always adopts live headers, one-slot margin, cancellation, max queue 3, lockouts persisted, `Retry-After` honoured. Startup data: trade2 leagues/stats/items/filters (24 h disk cache + hash compare); poe.ninja index-state, exchange overviews (`config/ninja-types.json`), unique item overviews, 15-min refresh, zod schemas, "200 + 0 lines" = error. League picker logic (exclude HC/SSF/private; ask if more than one remains).
**DoD:** mock server enforcing live rules: 20 checks in 5 s → ≤5 searches sent, rest cancelled or queued, **0 × 429**. Injected 429 → zero requests on that policy until `Retry-After`, survives restart. Schema-drift fixtures fail loudly. `npm run check:live` (manual) passes once.

## M4 — Price check v1 (4–5 days)
Cards per PLAN §2:
- **Commodity:** poe.ninja single price in Div/Ex/Chaos/Vaal, stack value, sparkline, volume confidence, ninja link.
- **Unique:** ninja price + live button.
- **Waystone:** `type` + `map_filters` with editable min/max; explicit mods optional.
- **Tablet:** `type` + uses-remaining pseudo + explicits.
- **Rare:** per-mod toggles, Add Stat, 10 cheapest online listings normalised to Div, whisper copied.

Converter HUD (no arbitrage). Rate-limit meter in the card.
**DoD:** each card renders from fixtures in component tests. A live manual run on 5 item types returns prices with 0 × 429.

## M5 — Settings, hotkey UI, packaging (3–4 days)
- **Hotkey settings UI** (PLAN §5.4) — acceptance:
  1. Every action has a binding row: capture by pressing keys, Backspace clears, Esc cancels.
  2. Duplicate binding inside the app → blocking error.
  3. Combo in `config/poe2-default-binds.json` (P, X, Ctrl+Q–T, Q–T, Space, I, C, G, U, Ctrl+U, Tab, Alt, …) → warning naming the PoE 2 action, user can still accept. The user can edit the bind list (e.g. for WASD mode or their own rebinds).
  4. Bare key without modifier → warning. Windows-reserved combo → blocked.
  5. `globalShortcut` registration failure → visible error on that row.
  6. Reset per row and Reset all.
  7. Persisted across restarts, applied immediately without restart.
  8. Settings migration test (v1 schema → current).
- Other settings: league, advanced-descriptions key, clipboard restore, UI scale 75–150%, currency order, price-check defaults, favourite pairs, jackpot tablet mods. About page: version, GGG notice, third-party notices.
- Packaging: electron-builder `nsis` + `portable`. electron-updater against GitHub Releases (decide public release repo vs manual). Code-signing decision written down.

**DoD:** installer and portable run on clean Win 10 and Win 11 VMs without Node. Auto-update tested once (nsis). The M1 display matrix is re-run on the packaged build.

## M6 — PoE 2 1.0 refresh (after 11 Dec 2026)
Re-capture fixtures. Verify ninja types, tablet/waystone names, `map_filters`, stat texts, and leagues. Update `config/*.json` and the RePoE extract (`scripts/extract-repoe.ts`). Release a patch build.

## Post-v1
On-demand bulk-exchange live quotes in the Converter · content-synergy estimates · opt-in POESESSID via `safeStorage` · mouse-button hotkeys · more client languages.

## Still open
- Release channel for a private repo (public releases repo vs manual) and code signing. Decide before M5.
- Testers or hardware for Win 10, 200%, and mixed-DPI / negative-coordinate cases.
- Unverified game facts listed in PLAN §11.

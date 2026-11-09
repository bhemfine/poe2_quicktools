# PoE 2 QuickTools

A fast, click-through in-game overlay for Path of Exile 2: price checks for waystones, tablets, gear, uniques and currency, using the official trade site and poe.ninja.

*This product isn't affiliated with or endorsed by Grinding Gear Games in any way.*

- Spec: [`PLAN.md`](PLAN.md) · milestones: [`BUILD_PLAN.md`](BUILD_PLAN.md)
- Manual test plan: [`docs/test-plan.md`](docs/test-plan.md) · releasing: [`docs/release.md`](docs/release.md)

## Develop

Requires Node 24 LTS on Windows 10/11.

```bash
npm ci
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | Run with hot reload. Tray icon → Settings. |
| `npm run typecheck` / `lint` / `test` | Checks run in CI on every push. |
| `npm run build` | Production bundle in `out/`. |
| `npm run dist` | Installer + portable exe in `dist/`. |
| `npm run check:live` | One real request per API endpoint to confirm the schemas (manual). |

If `npm run dev` says Electron failed to install, run `node node_modules/electron/install.js` once.

## Layout

`src/main` (Electron main: overlay, hotkeys, clipboard, network), `src/preload` (typed IPC bridge), `src/shared` (pure TypeScript: parser, stat matcher, query builder, rate limiter, pricing), `src/renderer` (Vue overlay and settings), `config/` (data that changes with the game), `tests/` (unit, component, live, fixtures).

Code adapted from [Exiled Exchange 2](https://github.com/Kvan7/Exiled-Exchange-2) (MIT) is listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

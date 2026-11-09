# Releasing PoE 2 QuickTools

## Build

```bash
npm ci
npm run dist
```

Output in `dist/`:

- `PoE2QuickTools-Setup-<version>.exe` — NSIS installer (per-user, choose folder). Auto-updates.
- `PoE2QuickTools-Portable-<version>.exe` — single-file portable build. Never auto-updates.

Neither needs Node installed on the target machine.

## Release channel — DECISION PENDING (owner)

The source repo `bhemfine/poe2_quicktools` is private, so `electron-updater` cannot read its releases without a token. Options:

1. **Public releases repo** (current config): create `bhemfine/poe2_quicktools-releases` (public, binaries only), then `GH_TOKEN=<token with repo scope> npm run release`. `electron-builder.yml → publish` already points there.
2. **Manual distribution**: share the files by hand; turn off "Check for updates" (or remove `publish`).

Until this is decided, the installer's update check just logs "update check failed" and carries on.

## Code signing — DECISION PENDING (owner)

Builds are **unsigned**. Windows SmartScreen shows "Windows protected your PC" on first run; users click **More info → Run anyway**. Options:

- Stay unsigned and document the SmartScreen step (free).
- Buy an OV/EV code-signing certificate (about USD 200–600 / year), set `CSC_LINK` / `CSC_KEY_PASSWORD` (or Azure Trusted Signing) before `npm run dist`.

Record the decision here when made.

## Before each release

1. Bump `version` in `package.json` (the User-Agent picks it up automatically).
2. `npm run typecheck && npm run lint && npm test && npm run build`.
3. Run the manual checklist in `docs/test-plan.md` (at least the smoke section) on the packaged build.
4. `npm run check:live` once to confirm the live APIs still match the schemas.

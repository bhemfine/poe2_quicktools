# Releasing PoE 2 QuickTools

## What reaches users without a release

| Change | How it reaches installed apps |
|---|---|
| New mods, items, leagues (GGG trade data) | Automatic. Re-checked 10 s after start (if the copy is over 1 h old), every 3 h, and when a price check finds unrecognised mods. |
| Prices (poe.ninja) | Automatic, every 15 min. |
| `config/ninja-types.json`, `config/poe2-default-binds.json` | Push the edited file to `main`. Apps re-read it from `raw.githubusercontent.com` at start and every 6 h; a file that fails validation is ignored. **Anything pushed to `main` in these two files goes live for everyone**, so check it first. |
| Code changes (parser, matcher, UI), other `config/` files | Need a release (below). |

When recent price checks look broken (many unrecognised mods, items that fail to parse, trade responses in a new format) the app shows "⚠ … an app update is needed" in Settings and on cards and logs the unrecognised lines (`[health]` in the log). That is the cue for a release.

## Build locally

```bash
npm ci
npm run dist
```

Output in `dist/`:

- `PoE2QuickTools-Setup-<version>.exe`: NSIS installer (per-user, choose folder). Updates itself.
- `PoE2QuickTools-Portable-<version>.exe`: single-file portable build. Cannot update itself; Settings shows a download link when a newer release exists.

Neither needs Node installed on the target machine.

## Release channel: GitHub Releases of this repo

The repo is public, so installed apps read releases from `bhemfine/poe2_quicktools` directly (`electron-builder.yml → publish`). No token is needed on the user side.

1. Bump `version` in `package.json` (the User-Agent picks it up automatically) and commit.
2. Tag and push:

   ```bash
   git tag v0.2.0
   git push origin main v0.2.0
   ```

3. `.github/workflows/release.yml` checks the tag matches `package.json`, runs typecheck/lint/tests, builds both exes and uploads them to a **draft** release.
4. On GitHub → Releases, open the draft, download the Setup exe and try it (at least the smoke section of `docs/test-plan.md`).
5. Click **Publish release**. From then on, installed apps download it in the background (checked at start and every 4 h) and install it when the user quits, or on Settings → Updates → **Restart now**.

To pull a bad release: delete it (or mark it as a draft again) on GitHub; apps that already installed it need the next version.

## Code signing: DECISION PENDING (owner)

Builds are **unsigned**. Windows SmartScreen shows "Windows protected your PC" on first run; users click **More info → Run anyway**. Auto-updates work unsigned. Options:

- Stay unsigned and document the SmartScreen step (free).
- Buy an OV/EV code-signing certificate (about USD 200–600 / year), set `CSC_LINK` / `CSC_KEY_PASSWORD` (or Azure Trusted Signing) before `npm run dist`.

Record the decision here when made.

## Before each release

1. `npm run typecheck && npm run lint && npm test && npm run build` (CI runs these too).
2. Run the manual checklist in `docs/test-plan.md` (at least the smoke section) on the packaged build.
3. `npm run check:live` once to confirm the live APIs still match the schemas.

# Clipboard fixtures

- `seed/` — starting fixtures. Files named `ee2-*` are copied from Exiled Exchange 2's MIT test items (`renderer/specs/Parser/items.ts` @ `cca30662`); `hand-*` were written by hand. They follow PoE 2's format but are **not** fresh copies from the current patch.
- This folder — real item text captured in-game with the dev hotkey **Save last item text** (default `Ctrl + Alt + F12`, enable "Developer tools" in Settings). Every `.txt` here is picked up by the parser and stat-matcher tests automatically.

Target corpus (BUILD_PLAN M1 #11): 2 waystones (one corrupted), 2 tablets (one unique), 2 rares, 1 unique, currency, rune, essence, soul core.

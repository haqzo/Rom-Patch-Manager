# Notes for Claude / contributors

Rom Patch Manager is a **browser-only** static app (no Electron, no build step). See README.md.

- Keep it simple: open ROM → pick complete visual features → preview → export `.nds` / `.bps`.
- Never require a clean ROM and never add ROM allow-lists. Locate files through the ROM's own FNT paths.
- One selectable item = one complete visual feature (e.g. Legendary Fly = all 11 members). Never expose
  fragments that break in game.
- Library = raw creator files in `app/library/files` (content-addressed) + `library.json`. Don't add BPS libraries.
  Rebuild with `scripts/build-library.mjs`, then `scripts/render-previews.mjs` (it also writes `thumbs`).
- No ROMs, ROM dumps or game data other than the creators' mods in the repo.
- Run `npm test` (plus the real-ROM tests with ROM_* variables when ROMs are available) before pushing.
- Be honest about verification: offline checks are not in-game proof.
- Other AI helpers (ChatGPT) follow AGENTS.md: content + docs only, via `chatgpt/*` branches and PRs. MaToRiuKo (matoriuko-cmd) has write access and publishes too. Community creator: YOKA.
- 1.1.0 is released (GitHub release v1.1.0 + PokeMMO forum topic, 18 Nov 2026). Ideas for later: docs/ideas.md.
- Dev mode for Haqzo: app/dev.js (?dev), see docs/dev-mode-plan.md.
- Template backgrounds: app/core/bgtemplate.js is a port of MaToRiuKo's romtool bgtemplate.py (only TEX0 changes, MDL0 is copied).
- Making new models (Surf/Fly): read docs/custom-models.md first. Never hand-write .nsbmd; go through CTRMap-CE.

# Rules for AI helpers (ChatGPT, Codex, other agents)

Read this first, then [docs/HANDOFF-CHATGPT.md](docs/HANDOFF-CHATGPT.md). Haqzo (owner) and MaToRiuKo
(co-creator) work on this repo with Claude. You help with **content and docs**, not with the app's code
or how the site is published.

## You may change
- `library-src/community/**` — the library content: `items.json`, `battle.json`, `renames.json`,
  `templates.json`, `edits.json` (written by dev mode — edit with care, the build validates it), model files (`.nsbmd` / `.nsbca`) and preview pictures (`previews/<id>.jpg`).
- `README.md`, `CHANGELOG.md` (an "Unreleased" section at the top), `GITHUB-RELEASE.md`.
- `docs/research/**` — new research notes (one file per topic, with sources).
- `experiments/**` — test files to try in game (models, .dae, PNGs, notes). Never shipped to the website.

## You must not change
- `app/**` (the tool itself, including `app/library/` — it is generated), `scripts/**`, `tests/**`,
  `tools/**`, `vendor-ts/**`, `.github/**` (deployment), `package.json`, `serve.py`, `start.sh`, `*.bat`.
- `CLAUDE.md`, `AGENTS.md`, `docs/custom-models.md`, `docs/dev-mode-plan.md`, `docs/ideas.md`,
  `docs/mato-resource-notes.md` (Haqzo/Claude/MaToRiuKo's working notes — read them, add new notes in
  `docs/research/` instead).
- Repository settings, collaborators, tokens, releases, GitHub Pages. If a task needs one of these, stop and
  tell Haqzo.

## How to work
1. **Never push to `main`.** Every push to `main` goes live on the website within a minute. Make a branch
   named `chatgpt/<short-topic>` and open a pull request; Haqzo merges.
2. Keep pull requests small and about one thing. Say in the description what changed and how it was checked.
3. **Never add ROMs, ROM dumps, extracted game folders or patched ROMs** (`.nds`, `.gba`, `.bps` of whole games,
   `data/`, `overlay/` …). Only creators' own mod files, with their permission and credit (`"by"`).
4. Never hand-write or edit `.nsbmd` / `.nsbca` bytes. Models come from CTRMap-CE exports or from creators.
5. Be honest about testing: "tested in PokeMMO" only when Haqzo or MaToRiuKo has played it.
6. Names in English, 简体中文 and Español where the library has them (`{ "en", "zh", "es" }`).

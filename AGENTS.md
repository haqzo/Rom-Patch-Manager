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

## Owner workstation and research continuity

- On the owner's CachyOS workstation, the permanent development HDD is mounted at `/mnt/development`. Canonical active repositories belong under `Projects/`; project assets under `Workspace/`; private ROMs, client dumps and tools under `Resources/`; historical outputs under `Archives/`; unsorted inputs under `00-Inbox/`. Existing compatibility links may point there. These are owner-local conventions, not installation requirements; discover actual paths on other systems. Verify the intended drive is mounted before writing, and do not write into its unmounted mountpoint.
- Use `~/Development-Scratch/` on the owner's NVMe for fast disposable builds, tests and temporary asset editing. Record the canonical checkout, branch, revision and any local changes before starting. Never overwrite another checkout, discard uncommitted changes, or create conflicting permanent copies. Return valuable results to the canonical project and clean only verified disposable build products; do not delete unsorted or unidentified files.
- At the start of a task, read the current project handoff, relevant research and existing agent instructions. Compare recovered research against the current branch by content, not filenames alone. Put genuinely new, publishable research, source references, decisions, limitations, and QA findings in the corresponding repository's documentation, with status (idea, experimental, approved, verified or superseded). Do not overwrite newer decisions with archived notes. Preserve conflicting or private material locally for review.
- Do not commit raw ROMs, client dumps, personal data, credentials, signing keys, private collaborator assets, generated caches or large temporary builds. Review research and permissions before publication. No unapproved implementation, version bumps, release changes, deployment or merge. Follow the repository's existing branch and testing rules.
- End substantive work with a concise handoff: changes, tests, known limitations, source references, pending decisions and locations of preserved artifacts. Keep ChatGPT, Codex and Claude aligned through the same repository documentation rather than relying on a chat session.

Keep ROM research in `docs/research/` and unpublished model experiments in `experiments/` or the owner's private workspace. Read `docs/custom-models.md` and `docs/HANDOFF-CHATGPT.md` before model work. Preserve creator attribution, unconfirmed platform mappings, CTRMap export workflow, and the existing content-only permissions. Never publish untested compatibility as confirmed.

Owner ROM preservation rule: never delete or deduplicate any of the owner's ROM files or ROM archives, including exact duplicates, all languages, editions, revisions, clean, modified and experimental ROMs. Do not include ROM collections in automated cleanup. Keep them private.

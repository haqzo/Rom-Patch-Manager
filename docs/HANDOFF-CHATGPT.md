# Handoff for ChatGPT — Rom Patch Manager

Written by Claude for Haqzo, 18 Nov 2026. Rules: [AGENTS.md](../AGENTS.md) (what you may and may not touch).
Your jobs: **update the library**, **understand how things are built** (read only), **keep the README up to date**,
**make files to try** in `experiments/`, and **research** (notes in `docs/research/`).

## 1. What this is

- **Rom Patch Manager**: a website (https://haqzo.github.io/Rom-Patch-Manager/) that mods Pokémon Black/White
  ROMs for PokeMMO. Open ROM → pick items (Surf, Fly, battle backgrounds, platforms …) → 3D preview → save `.nds` or `.bps`.
- Made by **Haqzo** and **MaToRiuKo** ("Mato", the modder whose files most of the library is). Current version 1.1.1.
- Everything runs in the browser; no ROM is uploaded anywhere and none is in the repo.
- MaToRiuKo also publishes directly (GitHub user `matoriuko-cmd`, shown as MaToRiuKo_666).
- **Community creators**: **YOKA** joined in Nov 2026 (Blue PVP Battle Field, uploaded by MaToRiuKo). New creators are
  credited in `by` with the exact name they use, and in the README credits.

## 2. How it's built (read only — don't change these parts)

```
library-src/community/   ← YOU edit this: raw mod files + small JSON lists
        │   scripts/add-community.mjs (runs on every push to main, in .github/workflows/pages.yml)
        ▼   checks every model, stores files content-addressed, merges the lists, renders missing previews
app/library/             ← generated: library.json + files/ + previews/  (never edit by hand)
        ▼
app/                     ← the website (GitHub Pages)
```

- The ROM is read through its own file table; files are archives like `a/0/7/5` (Surf) with numbered entries
  ("members"). One library item = one complete visual feature = a list of `{ path, member, file }` writes.
- `npm test` (Node 22) checks the library and the ROM logic. You can run it to verify a change; don't change the tests.

## 3. Updating the library

All files go in `library-src/community/`. Paths in the JSON are relative to that folder.

### Surf, Fly, platforms, TM/HM backgrounds, title screen, overworld → `items.json`
```json
{
  "id": "surf-wailmer",
  "cat": "surf",
  "name": { "en": "Wailmer", "zh": "吼吼鲸", "es": "Wailmer" },
  "by": "Haqzo",
  "desc": { "en": "Pokémon X/Y Wailmer. Tested in PokeMMO." },
  "writes": [ { "path": "a/0/7/5", "member": 49, "file": "Wailmer_Surf.nsbmd" } ],
  "view": { "model": "Wailmer_Surf.nsbmd", "kind": "object" }
}
```
- `cat`: `surf`, `fly`, `platforms`, `hmbg`, `title`, `world`. `id` must be unique; an entry with the id of an
  existing item replaces it.
- Where things go (Black/White):

| What | path | members |
|---|---|---|
| Surf ride | `a/0/7/5` | 49 (its water splash: 54) |
| Fly (always the complete set) | `a/1/1/5` | take-off model 58/103/107, take-off anim 60/104/108, landing model 66/111, landing anim 67/112 |
| Battle platforms (discs) | `a/0/1/1` | 0–33 (all 34 in one item; see `grounds/` and `disc-pixel-set`) |
| TM/HM background, Fly cut-in background | `a/1/1/5` | 25, 59 |
| Title screen | `a/1/6/0` | see existing items |
| Battle backgrounds | `a/0/1/1` | 34–83 → use `battle.json`, not `items.json` |

- Optional: `"linked": { "en": "Includes its own water splash" }` (shown on the card).

### Battle backgrounds → `battle.json`
```json
{ "id": "bg-e4-ghost", "name": { "en": "Elite Four · Ghost room", "zh": "幽灵系天王", "es": "Alto Mando · Sala Fantasma" },
  "by": "MaToRiuKo", "model": "mato-bg/Ghost_Elite_Four_Model.nsbmd", "anim": "mato-bg/Ghost_Elite_Four_Anim.nsbca",
  "native": [70], "preview": "bg-e4-ghost.jpg" }
```
- `modelOnly: true` (and no `anim`) when the creator says "replace model only".
- `native`: the battle types it's made for (used by the set "MaToRiuKo's collection"). Battle types (model member):
  34 Unova grass · 36–39 unconfirmed · 44 Undella surf/fishing · 46–49 spring/summer/autumn/winter grass (other regions) ·
  54 Unova cave · 56 Unova dark cave · 58 Unova forest · 60 caves (other regions) · 62 surf/fishing (all regions) ·
  64 Buildings & PvP (Celestial Tower, Pokémon Tower, PvP matchmaking) · 66 desert · 68 unconfirmed ·
  70 Shauntal · 72 Marshal · 74 Grimsley · 76 Caitlin · 78/80 N / Ghetsis finale · 82 Champion Alder.
- Preview: put a 480×288 `.jpg` at `previews/<id>.jpg` (MaToRiuKo's in-game screenshots work well). Without one,
  the site renders a 3D preview by itself.
- `keep` lists older scenes that stay; `sets` are the one-click sets.

### Fixes → `renames.json`
`"items": { "<id>": { "en", "zh", "es" } }` renames an item, `"slots": { "64": {…} }` renames a battle type,
`"remove": ["<id>"]` takes an item out of the library (its files are dropped automatically).

### Checklist for a library pull request
- Files are the creator's (credit in `by`), no ROM data. Models are CTRMap exports or the creator's own files.
- `npm test` passes. Say in the PR whether it was tested in PokeMMO and by whom.
- Add a line to the "Unreleased" section of `CHANGELOG.md`.

## 4. README

`README.md` is the GitHub front page: what the tool does, how to use it, what's in the library, credits.
Keep counts true (e.g. Surf models, battle scenes) — count from `library-src/community/*.json` plus the existing
library, or from https://haqzo.github.io/Rom-Patch-Manager/library/library.json. Screenshots live in
`screenshots/<version>/`. Don't describe internals of the code beyond the short "Repository" section.

## 5. Making files to try (`experiments/`)

- One folder per idea: `experiments/<topic>/` with the files and a `README.md` (what it is, how to try it,
  result once tested). These are never shipped.
- Models for PokeMMO must go through **CTRMap-CE** (export `.nsbmd`). What you can make: `.dae` (COLLADA) +
  PNG textures to import into CTRMap, pictures for the "Make your own background" templates (floor 512×512 and
  backdrop 512×256, or one 1024×1024 picture), TM/HM band designs (128×64, see below), research notes.
- Haqzo tests in game, then a working file can move to `library-src/community/` in a pull request.

## 6. What we already know (research so far)

Full notes: `docs/custom-models.md` (models), `docs/mato-resource-notes.md` (MaToRiuKo's resource map),
`docs/ideas.md` (plans). The short version:

**Models**
- **Only CTRMap-CE exports work in PokeMMO.** Hand-made/script-written `.nsbmd` crash the PokeMMO converter
  ("Invalid part specified …"). Every working model of MaToRiuKo's is a CTRMap export.
- CTRMap texture setting: **High Color + "Serialize as Lookup Table"** (palette). "Automatic" picks a compressed
  format that shows scratches. Textures ≤256 colours. Restart CreativeStudio between models.
- Surf: Y-up, facing +Z, waterline y=0, about 44–60 units wide; the game draws the player. Working: Wailmer, Wailord,
  Gyarados (X/Y), Lapras Paddle (Sun/Moon Poké Ride). Didn't look good: Mantine (both), Pikachu Float, Mega Gyarados.
- Fly needs MaToRiuKo's 8-node skeleton (animations drive nodes by index). A Lugia test worked technically but
  wasn't good enough; Fly is on hold.
- Battle platforms: radius 5.33, flat. The pixel set (15 grounds) maps each of the 34 slots to a ground type
  (`tools/model-pipeline/make-grounds.py`, `SLOTS`). Slot meanings come from the original textures; a few are guesses.
- Battle backgrounds: the older scenes were from old patches and sat offset — only MaToRiuKo's current-version
  set (Nov 2026) is in the library.
- Template backgrounds (MaToRiuKo's romtool): your pictures replace the template's textures; 16 or 256 colours,
  index 0 transparent; sizes = template size or 1/2, 1/4 … (never bigger). The full-picture template is ~1 MB per slot.
- Size: MaToRiuKo saw loading problems above ~10–20 MB of extra data in total.

**Ideas waiting** (details in `docs/ideas.md`)
- **Designed TM/HM bands** (Haqzo approved 8 concepts: hero band with gold rims, crimson comic, amethyst chevrons,
  sunset sparkle, starry night, emerald waves, rainbow framed, black & gold). The band texture is 128×64 and
  **moves right → left**, so designs must tile seamlessly sideways, chevrons point left, streak heads on the left.
  Haqzo doesn't want plain grey/black ones. Mockups: `screenshots/ideas/`.
- **More games**: Black 2/White 2 first (same engine, different archive numbers), then Platinum/HGSS (DS, but
  battles are 2D), then FireRed/Emerald (GBA, a different world: tiles + palettes). Example mods + their base ROM
  CRCs are listed in `docs/ideas.md`. Research to do: where Surf/Fly/backgrounds live in B2/W2.
- **Install counter** on each item (needs a tiny counter service; privacy: only item ids).
- **Fly update**: MaToRiuKo's newer Rayquaza / Flying Sword files — waiting for his OK.

Good research tasks for you: B2/W2 archive map (with sources), Gen 4 moddable visuals, which PokeMMO forum mods
could become library items (ask the author; credit them).

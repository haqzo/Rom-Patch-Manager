# PokeMMO battle-platform geometry research — 18 November 2026

## Scope and provenance
Measured the creator models on the default branch of [haqzo/Rom-Patch-Manager](https://github.com/haqzo/Rom-Patch-Manager) and inspected the repository's ground generators, converter notes and the library manifest. This is a **source-file / format inspection**, not an independent in-game test.

## Existing platform archive and library
- Disc models replace `a/0/1/1` members `0–33`. Haqzo's Pixel Battle Grounds set maps **15 terrain styles** to the 34 platform slots. `tools/model-pipeline/make-grounds.py` contains the mapping.
- The generator uses a nominal **radius 5.33**, **top Y=0.12**, **48 perimeter segments**, and slightly wider bottom bevel. Textures are **128×128**, quantized to **256 colours**.
- Your Green Grass file: **396 triangles**, ~**1.20 units** maximum Y, 128×128 paletted texture.
- Your Forest file: **488 triangles**, ~**1.62 units** maximum Y, 128×128 paletted texture.
- Your Rocks Brown file: **504 triangles**, ~**0.79 units** maximum Y, 128×128 paletted texture.
- Your flat River file: **144 triangles**, ~**0.12 units** maximum Y. Its texture uses a smaller 4-colour format after export.
- MaToRiuKo's transparent platform (`app/library/files/a9c1da5ec48c73f1.nsbmd`) contains a tiny mesh ~0.10 units wide located around **Y=-90.76**. It hides the disc by moving it below the battle, not by demonstrating a special alpha-rendering capability.

## What this tells us
1. The ground models **do contain genuine raised 3D geometry**. The current grass and rocks are simply low-detail procedural shapes; they do not demonstrate an absolute PokeMMO art limit.
2. A 2D-looking battle platform can have a raised perimeter. Starting with similar bounding dimensions minimizes layout risk.
3. The *format* can represent polygon meshes and textures. It does **not** establish the engine's maximum reliable triangle budget, edge height, alpha/occlusion behaviour or player/Pokémon animation clearance.
4. Changes should be incremental and evaluated in-game: first compare 128×128 texture/rim style while preserving footprint; then change geometric complexity and height independently.

## Proposed bounded experiment
- Two source-only prototype COLLADA models: Green Grass (varied grass clumps) and Rocks Brown (beveled stones).
- 128×128 single-texture palettes and a nearly unchanged disc footprint.
- Export via CTRMap-CE with **High Color + Serialize as Lookup Table**. Never write NSBMD binary bytes by hand.
- Test `CTRMap export → manager preview → distinct test ROM → PokeMMO in-game`. None of the preliminary checks substitutes for Haqzo's or MaToRiuKo's in-game testing.
- No changes to shipped library until validated.

## Repo sources
- `AGENTS.md`; `docs/HANDOFF-CHATGPT.md` (collaboration rules)
- `docs/custom-models.md` (CTRMap-CE and model constraints)
- `tools/model-pipeline/make-grounds.py` (mesh generation and slot map)
- `tools/model-pipeline/make-discs.py` (prior flat-disc workflow)
- `library-src/community/grounds/*.nsbmd` (15 existing models)
- `app/library/files/a9c1da5ec48c73f1.nsbmd` (MaToRiuKo transparent disc)
- `app/library/library.json` (set attribution and mapped entries)

**Do not claim a confirmed maximum vertex/triangle count or "tested in PokeMMO" for these experiments.**

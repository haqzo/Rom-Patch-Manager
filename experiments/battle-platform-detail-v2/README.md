# Battle platform detail v2 — safe experiment

**Status:** experimental. Not exported via CTRMap-CE or tested inside PokeMMO yet.
This folder is **not** part of the live library and must not be copied to `app/`.

## Aim
Try more visually natural terrain without discarding Haqzo's existing pixel battle grounds:
- **Green Grass:** clumps with varied blade heights, colours and leaning directions; a few shorter tufts inside the rim; quieter centre.
- **Rocks Brown:** irregular low-poly raised stones with beveled shoulder faces and smaller gravel; textured centre.
- Keep the original generator's **radius 5.33**, **48-segment flat disc**, top at **Y=0.12**, and rim radius 1.02×.
- Use one **128×128, <=256-colour PNG** atlas per model, as in Haqzo's existing pipeline.

## Generate on CachyOS
From the repository root, with Python 3 and Pillow installed:

```bash
python3 experiments/battle-platform-detail-v2/build.py
```

The `generated/` subfolder gets exactly four files:
- `Test_Green_Grass_Detail_v2.dae` + `test_green_grass_detail_v2.png`
- `Test_Rocks_Brown_Detail_v2.dae` + `test_rocks_brown_detail_v2.png`

These are **COLLADA source models + texture**, not playable PokeMMO mods. No ROM or NSBMD is provided.

## Convert with CTRMap-CE
1. Keep **PokeMMO closed** while building the test ROM. The Rom Patch Manager website can stay open.
2. Start **CTRMap-CE → CreativeStudio**, import the relevant `.dae` (the PNG needs to remain beside it).
3. Select the texture, set **High Color** and enable **Serialize as Lookup Table**. Save its settings.
4. Export the model as **Nitro System Binary Model (.nsbmd)**; check it generated a non-empty file.
5. Restart CreativeStudio between these two exports to prevent texture carry-over.

## Test with Rom Patch Manager
1. Keep the original ROM untouched. Open a **copy** or open the original in the website and **save under a different name**.
2. Use **Your files** → import the newly exported `.nsbmd` → assign **Battle platforms**. The normal import is a full replacement of the 34 platform slots; dev mode also supports per-slot experiments.
3. Preview the model in the built-in 3D viewer, compare to the original model, and **Save new ROM (.nds)** with a distinct `-GROUND-TEST` suffix.
4. Start PokeMMO with that **test** ROM. Verify Green Grass and Rocks Brown separately. Record if anything is mis-scaled, invisible, offset, clips through the Pokémon, or crashes.
5. If the client crashes, save `~/.var/app/com.pokemmo.PokeMMO/data/pokemmo-client-live/log/console.log` **before starting PokeMMO again**; relaunching replaces the log.

## Reporting
Please record *CTRMap export OK*, *manager preview OK*, *ROM build OK*, *in-game visual OK/FAIL* separately.
The first three steps are **not** evidence of in-game compatibility.
Only after Haqzo or MaToRiuKo verifies them in game should the exported NSBMDs be considered for `library-src/community/`.
Please do not merge this draft experiment expecting it to appear in the published library.

## Relevant existing sources
- `tools/model-pipeline/make-grounds.py` — original size, geometry, 15 styles, 34-slot map
- `tools/model-pipeline/make-discs.py` — earlier smooth-disc reference
- `docs/custom-models.md` — successful CTRMap export workflow and caveats
- `library-src/community/grounds/` — existing CTRMap-exported ground models
- `app/library/library.json` — existing transparent and pixel set manifests (read only)

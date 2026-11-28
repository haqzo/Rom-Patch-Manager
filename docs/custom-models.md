# Custom models for PokeMMO: what works (read this first)

Last updated 2026-11-17. Everything below was tested in PokeMMO unless marked *untested*.

## The one rule

**Hand-built or script-written .nsbmd files crash PokeMMO. Files exported by CTRMap-CE work.**
Every model of Mato's that works ends with the tag `CTRMapG3D`. Don't write Nintendo DS model
binaries yourself: make a `.dae`, let CTRMap-CE turn it into `.nsbmd`.

Why we know: our hand-made Viking/surfboard crashed every time (PokeMMO log:
`convert error … Invalid part specified ( offset=0, count=0, max=0 )`, then *Fatal render error*).
We cut them apart over ~10 test ROMs and ruled out materials, textures, headers, counts, box,
command style, UV range, waterline, winding. The same template put through CTRMap surfed fine.

## Pipeline (works)

```
X/Y model (models-resource .zip, ColladaMax .DAE + images/)
  -> tools/model-pipeline/xy2dae.py   (Surf: static model)      -> .dae + PNGs
  -> tools/model-pipeline/xy2fly.py   (Fly: Mato's fly skeleton) -> .dae + PNGs
  -> CTRMap-CE CreativeStudio: Import > COLLADA, Export > Nitro System Binary Model
  -> Rom Patch Manager "Your files" -> Save new ROM -> test in PokeMMO
```

CTRMap-CE on Linux: `sudo pacman -S jre-openjdk`, then `java -jar CTRMap.jar` (keep the terminal
open: errors only show there). Install CTRMapV.jar via *Global plug-in manager* once. Use
**CreativeStudio**, never the Projects/Games tabs.

CTRMap gotchas
- **Restart CreativeStudio between models**: otherwise textures of the previous model are exported too.
- **Texture format**: click every texture → *Desired format* → **High Color + "Serialize as Lookup
  Table"** (palette, what Mato uses), then *Save*. "Automatic" picks *Compressed* (4x4): it caused
  scratches on Wailmer. With "Lookup table" the PNG must have ≤256 colours (the scripts already
  reduce it), else CTRMap errors "more than 256 colors".
- Export: right-click the model → Export → `.nsbmd`; in the options box click *Export*. If nothing is
  saved, type the file name ending in `.nsbmd` yourself.

## Surf (A075 #49) — works

`python3 xy2dae.py Wailmer_ColladaMax.DAE out Wailmer_Surf --width 44 --sink 9`
- X/Y models are Z-up and face -Y; the script turns them Y-up facing +Z (like Mato's Lapras).
- `--width` = total width (Lapras ≈ 60), `--sink` = how far it sits under the water (y=0).
- Textures: body ≤512×256, 256 colours. The player is drawn by the game (no rider part needed).
- **Tested: Wailmer works** (after re-export with the palette texture format).

## Fly (A115) — experimental model conversion using Mato's skeleton

The Fly scene animates 8 fixed nodes: `world_root, Hero_body (player), flash_line (speed lines),
joint1 (body), joint2→joint3 (+X wing inner→outer), joint5→joint6 (−X wing)`. Animations drive
nodes by index, so **any model on this exact skeleton can use Mato's Charizard animations**.

`python3 xy2fly.py Lugia_ColladaMax.DAE fly-skeleton out Lugia_Fly --span 88 --pitch 28`
- Wings follow the source rig: `*Shoulder/*Arm` → inner wing joint, `*ForeArm/*Hand/*Finger*` →
  outer; everything else → body. X/Y skins name bones `BoneN` (sid): the script maps them to names.
- `--pitch` tilts the upright X/Y pose into a level glide (Lugia 28°). `--span` = wingspan (Mato's
  Charizard 88). Head faces +Z, player sprite rides at (0,6,0).
- `fly-skeleton/` = Mato's Charizard rest skeleton + player sprite + flash effects (`hero1`,
  `f_effect_a/b`, textures `fly_hero_1`, `fly_effect_1/2`), extracted by `fly-extract-skeleton.mjs`.
- Slots: take-off model 58/103/107, take-off anim 60/104/108, landing model 66/111, landing anim
  67/112. Use Mato's Charizard anims (library `fly-mega-charizard-y`, members 60 and 67).
- In Rom Patch Manager drop the model + 2 anims in *Your files*: since v1.0.3 it **switches to Fly
  automatically** (a model with `Hero_body`+`joint1` nodes) and uses one model for take-off and landing.
- **Failed visual prototype (Haqzo correction, 2026-11-28):** Lugia rendered and moved, but was too small, looked off, and did not meet MaToRiuKo’s visual quality. It is not a successful or release-ready Fly model. The palette re-export remains untested. See the [Fly design research and controlled test plan](research/fly-design-2026-11-28/README.md) for updated sizing, rigging, phase and material requirements.

## Checking in-game crashes

PokeMMO writes everything to `~/.var/app/com.pokemmo.PokeMMO/data/pokemmo-client-live/log/console.log`
(Flatpak). Read it **before relaunching** (it's replaced). The client restarts itself after
picking a ROM, so terminal output stops there; the file has the rest.
If a character crashes on login it's still surfing: log in with a working ROM, leave the water.

## Adding a finished model to the library

Put the tested `.nsbmd`/`.nsbca` in `library-src/community/`, add an entry to `items.json` (credit `by`),
run `node scripts/add-community.mjs`, render its preview (`node scripts/render-previews.mjs <id>`), `npm test`.

## Sources of models

X/Y rips (models-resource "Pokemon X/Y" zips) are what Mato's Lapras/Charizard use. Good surf:
Wailmer, Wailord (scale down). Good fly: Lugia (done), Latios/Latias, Yveltal, Pidgeot, Aerodactyl.
B2W2 rips (e.g. Mantine) are low-detail DS models.

## model2surf.py (any model → Surf .dae)

`tools/model-pipeline/model2surf.py src.dae outdir Name --width W --sink S [--yaw deg] [--keep-alpha]`
handles X/Y ColladaMax + OpenCollada, Sun/Moon Pokéride `*_fi.dae` (SPICA: NORMAL/TEXCOORD inside `<vertices>`),
Platinum DAEs, and Scarlet/Violet lod DAEs. It applies node matrices / TRS + bind_shape_matrix, turns
the model so the eyes face +Z, and writes 256-colour PNGs. Sizes used: Lapras Paddle 50/10, Mantine Surf 60/3,
Pikachu Float 14/4 --yaw 90 --keep-alpha (no eye texture, so turn it by hand), Gyarados XY 28/7, Wailord 58/12, Wailmer 44/9. In-game OK and in the library: Wailmer, Lapras Paddle, Wailord, Gyarados XY. Dropped after testing: Mantine Surf, Pikachu Float, Mega Gyarados, Mantine B2W2.

## Battle grounds (platforms, a/0/1/1 #0-33)

Black/White's discs: radius 5.33, flat, one material, UVs in a polar layout (32x32 textures).
"No battle ground" = the original discs flattened to the floor; Mato's transparent disc = a tiny disc at y=-90.
New grounds: `tools/model-pipeline/make-discs.py outdir [Stadium Grass Sand Stone Ice Neon Lava]` writes a disc
.dae (same size, top-down UVs, 128x128 PNG) → CTRMap (High Color + Lookup Table) → "Your files" → Battle platforms
(one model goes into all 34 slots). The first smooth set worked in game but looked off; the pixel-art set is `make-grounds.py` (grass blades / rocks / snow lumps as real geometry, colours from gradients in the texture corners).

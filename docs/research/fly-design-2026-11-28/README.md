# Fly design research — 2026-11-28

**Experimental research only.** Haqzo corrected the historical record: Lugia failed visually (too small, looked off, below MaToRiuKo's quality). Rendering and movement are not a pass. No new CTRMap or PokeMMO execution took place in this research; no new model is game-tested. This supersedes the older wording in docs/custom-models.md.

## Evidence and scope

Offline inspection used the archived RPM 1.1.4 source and catalog assets, original English Black IRBO from the user's Library, Fly-Maybe.zip (seven source packs), and previous regional metadata. Current app/app.js, docs/custom-models.md and tools/model-pipeline/xy2fly.py were consulted. Parser estimates are not authoritative game-camera rendering. No ROM or raw creator models are included here.

### A115 Fly scene contract

Archive a/1/1/5 has 183 stock members. MaToRiuKo's documented role mappings:

| Role | Model BMD0 | Skeletal BCA0 | Material BMA0 | Pattern BTP0 |
|---|---:|---:|---:|---:|
| Male take-off | 58 | 60 | 61 | 62 |
| Male landing | 66 | 67 | 68 | 69 |
| Champion take-off | 103 | 104 | 105 | 106 |
| Female take-off | 107 | 108 | 109 | 110 |
| Female landing | 111 | 112 | 113 | 114 |

Stock skeletal clips have 71/60 out/in frames; Charizard and Rayquaza 69/58. Do not infer game FPS or exact timing. Prior twelve-profile audit found the ten model/clip members byte-identical across its audited regional ROMs; structural equivalence is not gameplay certification.

| Reference | Nodes | Out body rest W/H/L | In body rest W/H/L | Out joint1 scale range | In joint1 scale |
|---|---:|---|---|---|---|
| Stock | 8 | — | — | — | — |
| Mato Charizard | 8 | 87.87 / 42.24 / 114.63 | 84.95 / 38.76 / 111.16 | 0–2.8623 | 1–1.01514 |
| Mato Rayquaza | 19 | 208.48 / 172.39 / 1064.77 | 49.72 / 41.12 / 254.02 | 0–0.19995 | identity |

All four paired Charizard/Rayquaza clips passed the archived RPM pose gate (parser validation only). Rayquaza's custom 19-node skeleton and matching clips demonstrate that the existing catalog is not limited to stock geometry or eight nodes. Both custom sets have equivalent rider translation and flash-scale ranges; verify full matrices before assuming exact equivalence. Separate phase assets are intentional. Rest size is not a universal constraint; evaluate animation scale and camera-relative occupancy. Exact binary size equality is not required by the NARC rebuilding engine.

### Why old Lugia failed

Old Lugia DAE rest dimensions approximately 88 x 45 x 81. Simulation using the Charizard eight-node local transforms and old DAE inverse binds:

| Take-off frame | Lugia world AABB W/H/L | Charizard world AABB W/H/L |
|---|---|---|
| 34 | 78.726 / 51.761 / 56.810 | 87.712 / 85.043 / 82.885 |
| 51 | 94.149 / 95.433 / 95.228 | 110.500 / 91.251 / 149.875 |

These are world bounds, not projected screen size or proof of the sole cause of the in-game failure. The old converter matches wingspan, centers using dominant body vertices, maps bones via regex (two per wing), ignores all but the first controller, handles triangles and simplistic material lookup, copies generic Lambert materials and does not enforce texture quantization. It can misalign mount and hinges and loses DS material properties. Pidgeot fails material lookup, Yveltal empty first mesh conversion, Giratina variants mapped entirely to body. These are converter limitations, not game incompatibility.

### Rider, effects and material dependencies

- Rider quad roughly 16 x 16 in examined custom models; effect mesh spans roughly 2215 world units in X at rest and dwarfs subject. Whole-scene automatic fitting is unsuitable for body sizing. Archived viewer uses robustBox and 30 FPS, not verified PokeMMO camera/timing. Subject-only and rider-relative metrics are essential.
- Charizard and Sword retain tiny original bird02_bird_a and bird02_line meshes (204/48 triangles); Rayquaza omits them. Old converter copies only hero1, f_effect_a, f_effect_b. Unknown purpose of dummy meshes; preserve them in a controlled roundtrip, don't add to Rayquaza by assumption.
- Stock BMA0/BTP0 member pairs listed above target hero1 and two effect targets. Out pattern dictionary contains nine texture names, in ten including trainer-specific frames. No exact texture or palette names match the five custom catalog models inspected; Champion material prefixes match only hero1. PokeMMO might ignore, remap or dynamically bind them. This is not established and not proof of Lugia's failure. Existing Charizard/Rayquaza leave these sidecars stock; do not silently expand writes or rename bindings.
- Reference body textures include indexed 256-colour (format 4), effects use A5I3 (format 6: 8 colour indices, 5-bit alpha), rider uses 16-colour (format 3). Preserve format/alpha per role rather than forcing everything to 256 colours. Reference Charizard body materials use white diffuse/ambient, light mask 1; effect light mask 0. Generic DAE Lambert is not equivalent to explicit DS material settings. Use CTRMap export, verify texture/palette bindings, alpha, depth/sort, culling, lighting, UVs and vertex colours.
- #59 fly_bg, #63 skeletal, #64 UV animation are separate. #65 SPA, #115 SPA, #116 model/#117 skeletal have unresolved client role. #118/#119 stock cave_ci, not a general Fly slot; existing Rayquaza #118 is creator-specific. #25 HM cut-in independent. No camera-specific resource identified. Do not patch client, executables, scripts or unrelated archives to investigate this cosmetic feature.

## Direction

Three tiers: A exact template-compatible model-only; B paired model + retargeted clips preserving rider/scene contract; C expanded species-specific skeleton/choreography plus experimental effects. Use MaToRiuKo's original designs as minimum visual standard; retain his originals unchanged. Start with one corrected Lugia and one Latios glide, not dozens of poor conversions. CTRMap CreativeStudio supports rigged DAE import and NSBMD/NSBCA export. apicula can read material/pattern animations but cannot be assumed to provide lossless roundtrip or BMA/BTP export. Hand-written NSBMD previously failed in PokeMMO; use CTRMap. Keep source assets private and preserve creator permission/credits.

## RPM integration (proposal, not implemented)

Current app/app.js supports autoRoles/importWrites, out/in model/animation, three out and two in slot fan-out; falls back to one model for both phases and has no explicit BMA/BTP roles. Proposed Dev Fly Builder manifest: role per trainer/phase, model/animation SHA, expected node order/parent graph, duration, texture/material/palette targets, explicit keep/replace sidecar policy, stock profile evidence, fit report, creator/license, stage and test status. Preflight magic, same archive member, skeleton indices/order/hierarchy/inverse bind, curve ranges, dependencies, no unintended slots, NARC readback and BPS roundtrip. Block model-only Sword on an incompatible retained Rayquaza animation until checked. Complete designs atomic; HM/TM backgrounds, Surf, platforms, battle backgrounds independent. Distinguish keep current and restore verified stock. Fixed reference camera and subject/rider/effect toggle previews; warn that client parity is unverified. No new sidecar writes until separately confirmed. Do not publish prototypes or change existing catalog assets without approval.

See [controlled test plan](TEST-PLAN.md). Full local research ZIP: RPM-Fly-Deep-Design-Research-2026-11-28.zip (15 files, including frame-by-frame JSON/CSV and scripts); this repository document records key findings and limitations, not the full binary archive.

## References

- [Current import implementation](https://github.com/haqzo/Rom-Patch-Manager/blob/main/app/app.js)
- [Existing custom-model documentation](https://github.com/haqzo/Rom-Patch-Manager/blob/main/docs/custom-models.md) (older Lugia statement superseded)
- [MaToRiuKo Legendary Overhaul](https://forums.pokemmo.com/index.php?/topic/200231-bw-legendary-overhaul-patch-battle-bgs-surf-fly-models-intro-replacement/)
- [MaToRiuKo Clean TM background](https://forums.pokemmo.com/index.php?/topic/201478-clean-tm-background/)
- [Rigged NSBMD creation](https://ds-pokemon-hacking.github.io/docs/universal/guides/rigged_nsbmd_creation/)
- [CTRMap BW guide](https://ds-pokemon-hacking.github.io/docs/generation-v/guides/bw_b2w2-using_ctrmap/)
- [apicula](https://github.com/scurest/apicula), [Nitro reverse-engineered notes](https://github.com/scurest/nsbmd_docs/blob/master/nsbmd_docs.txt), [GBATEK](https://problemkaputt.de/gbatek.htm#ds3dvideo)

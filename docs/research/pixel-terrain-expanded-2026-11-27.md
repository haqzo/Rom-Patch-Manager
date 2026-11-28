# Pixel Terrain expanded platform pack — recovered research (2026-11-27)

Status: **experimental source assets; not a published patch and not confirmed in PokeMMO**. This note consolidates the owner-supplied Pixel Terrain Expanded Source Pack's START-HERE, RESEARCH and TEST-PLAN. It complements [battle-platform-selector.md](battle-platform-selector.md). No source ROM, stock model, raw extraction or private local data is included. Numerical findings below are reported by the original offline audit, not independently re-tested during this documentation recovery.

## Scope and evidence

- Expanded pack: 136 editable COLLADA models and 136 palette-ready 128×128 textures, four optional designs A–D for each member 00–33. Previews, manifests and proposed write plans remain with the private source pack. The earlier technical report describes the initial A/B designs; do not mistake it for a fresh validation of all four sets.
- The audit read English Black (IRBO, rev 0, CRC32 4F6E5580) and White (IRAO, rev 0, CRC32 B552501C), resolving the archive through FNT/FAT. Archive a/0/1/1 contains 222 members; 00–33 are the ordinary platforms. Background/UI members 34–83 and special models 86/87 are outside this pack.
- The 34 model hashes and three stage lookup table hashes matched between English editions. Earlier regional indexes reportedly matched for twelve Black/White profiles (English, French, German, Italian, Spanish and Japanese); the ten non-English binaries were not re-read in this audit. Korean unverified.
- Vanilla DS lookup is not PokeMMO runtime mapping. Keep terrain labels and per-member suggestions unconfirmed until controlled gameplay tests.

## Vanilla environment lookup

The original selector uses field situation bgType, bgAttr, weather, season, zone and time. Terrain maps to an attribute column; trainer battle groups can override it. The audit decoded a/1/5/2: member 0 is 19 × 36-byte environment rows with 17 background/stage IDs; member 1 contains 20 background resource groups; member 2 is 25 × 68-byte platform groups with four model variant entries and animation IDs. Missing variants fall back to variant 0. Three groups contain four explicit members (01–04, 09–12, 28–31); the other 22 contain one. Group 02/member 05 is not referenced by the ordinary 323 environment cells in the vanilla lookup; that does not prove it is unused in PokeMMO.

The original audit reported 37 terrain-to-column pairs and 427 zone records per English edition with matching field-effect set values. Examples: grass column 5 selects 28–31 in seasonal environment rows 1/3 and 32 in many others; water column 6 often selects 14 or 15; cave column 10 often 07 (row 7 gives 00); sand column 8 often 16 or 17; ordinary ice column 13 often 19. Fixed rows 11–14 select 21–24. Snow, caves, paths and trainer fights do not have a universal one-member mapping. These are possible table inputs, not encounter observations.

## Geometry and texture design

Reported stock geometry: 16-sided top with side walls, 112 vertex emissions, 48 triangles, 32×32 4-bit palette texture. Stock top Y=2287/4096, bottom Y=1224/4096, radius=21829/4096. Normal vanilla stage places two draw objects from a single resource at Z=0x572f/4096 and -0xcb7d/4096. Do not infer separate player/enemy model selection or safe enlarged radii from that alone.

Initial A/B design: 48-sided procedural base, stock radius and standing height, planar top UVs, bounded grass blades outside central standing area, height cap 0.48 above top. Initial audit reported 144–699 triangles and up to 702 indexed positions (P31B densest). These numbers refer to the earlier A/B audit, not certified final CTRMap output or all A–D exports. Keep palette fidelity, avoid raised grass obscuring sprites, and test actual camera angles. Each stock texture's palette guided the procedural 128×128 atlas; texture colors are quantized and no stock NSBMD is distributed. Hardware limits do not establish PokeMMO renderer budgets.

## Export and verification gates

1. CreativeStudio/CTRMap-CE: import one DAE per fresh session, texture High Color + Serialize as Lookup Table, exact output name from the pack manifest, export NSBMD. Suggested initial sample P00B, P04C, P07C, P12C, P19D, P28D, P31C, P25D; additionally stress P31B. Run pack export checker if available. Never hand-write NSBMD.
2. Open each exported model in manager preview. Check orientation, scale, texture, palette, shadows, standing height, rim and seams.
3. Patch a disposable ROM, verify intended member writes independently, compare with stock in PokeMMO. Check both sides, wild/trainer/double/horde, indoors, routes, snow, cave and water as feasible. Record client build, location, battle type, season, model, observed effect and performance. A temporary transparent-model probe can narrow suspected members; restore stock between scenarios. Do not assume logs expose IDs. No game memory access.
4. Only after sample success, export further batches. Check NDS/BPS round trips, intended 00–33 members only, no changes to 34–83 or 86/87. Test complete, individual and mixed selections; retain existing sets. Verify en/zh/es names and attribution; owner approval before any publication. A/B/C/D are design options, not vanilla seasonal variant indices.
5. Keep original assets, manifests, previews, regional evidence and untested exports in owner workspace. Register only reviewed creator assets, not ROM-derived stock assets. This documentation change does not add a library entry.

## References

- [Current model workflow](../custom-models.md) and [selector research](battle-platform-selector.md)
- [Vanilla field setup](https://github.com/Project-Holon/aletheia/blob/main/src/game/ov021/field_encount.c), [terrain mapping](https://github.com/Project-Holon/aletheia/blob/main/src/game/ov021/map_attr.c), [zone data](https://github.com/Project-Holon/aletheia/blob/main/src/game/arm9/zonedata.c), [effect lookup](https://github.com/Project-Holon/aletheia/blob/main/src/game/ov094/btlv_effect.c), [stage placement](https://github.com/Project-Holon/aletheia/blob/main/src/game/ov094/btlv_stage.c)
- [GBATEK](https://mgba-emu.github.io/gbatek/), [CTRMap guide](https://ds-pokemon-hacking.github.io/docs/generation-v/guides/bw_b2w2-using_ctrmap/), [CTRMap-CE](https://github.com/ds-pokemon-hacking/CTRMap-CE/releases)
- Owner-supplied Pixel Terrain Expanded Source Pack and earlier Broad Asset Research archive, 2026-11-27. Full original audit/evidence retained locally; links to external sources inherited from that audit, not freshly verified during recovery.

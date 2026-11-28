# Fly development — controlled experiment plan

## Baseline and acceptance

Record the same two Fly destinations with known working stock, Mato Charizard, Rayquaza and sword. Same character, game client, region, screen size, graphics settings. Capture both take-off and landing, including full player visibility and destination reveal; inspect videos manually, no live game hooks. Compare frame-relative size against rider, body occupancy, position when rider boards/dismounts, wing/pivot integrity, eye/mouth visibility, alpha edges, lighting, smooth motion, no glitches, no excessive screen fill, no abrupt disappearance. Repeat at least one route and both character variants where available. Champion slot needs separate test if accessible; do not pretend equivalent. Keep clean and patched baseline copies separately. Avoid publishing until visual pass and export integrity.

## First gate: reference roundtrip

- Original untouched Charizard as positive control. Separate take-off and landing model & animation. Reimport to CTRMap, export unchanged. Compare node order, inverse binds, names, model scale, material and texture formats, per-poly bounds, all frames. Verify raw importer does not change semantics. One model substitution roundtrip first, then full matching bundle. If visual quality regresses, solve exporter before new meshes.
- Keep existing custom sidecar behaviour; compare unchanged stock BMA/BTP versus explicitly compatible texture naming in a separate private variant only after understanding renderer. Preserve stock references in ROM until a new paired sidecar is approved. No indiscriminate dropping unused textures.

## Lugia rescue

- Rig using actual shoulder/elbow/wrist pivots; flight pose tailored to Lugia, with horizontal wings, head raised, tail trailing. Mount reference at dorsal saddle, not body centroid. Use species-local anchor landmarks: rider contact, wing roots, head, body centre, tail. Match target near-pickup and carry size, not just rest span. Trial geometry scales 1.00/1.15/1.30 relative to old 88-span (hypotheses only); reject clipping or huge wings. Separate phase assets with carefully matched seam. Keep rider & flash geometry unchanged in first candidate; keep auxiliary material state and reference names. Compare actual footage with Charizard. Add white-blue airflow only after base passes.
- Use reference clip's rider and scene path. If changing body scale, do not scale hero or effects. For a fixed template adjust body mesh and weight pivots, not animated root. If custom skeletal clips, preserve rider and effect curves, independently retarget body path/rotation/scale, export all bone tracks, preserve known timeline. Match carry pose to rider at each relevant frame. Use quaternion-aware retargeting and check rotations, inverse binds, determinant and per-frame bounds. No new animation timing until visual alignment works.

## Alternative candidates / art direction

| Species | Motion / fitting | Effects (optional, after fit verified) |
|---|---|---|
| Lugia | Slow powerful flap, banking, visible rider on back; separate landing settle | Silver-blue tapered airflow |
| Latios/Latias and Mega variants | Streamlined rigid glide with gentle bank; smaller wings not necessarily flap, maintain strong torso silhouette | Thin blue/red contrails, subtle psychic ring |
| Pidgeot/Mega | Feathered bird flaps, wing-root pivot, stable head, feet tucked; fix material symbol mapping | Pale wind, restrained feathers |
| Aerodactyl/Mega | Wide membranous wing sweep; shoulders and fingers, check culling | Warm neutral wind streaks |
| Yveltal | Large wings and tail, custom rig; multi-mesh and controller support before scale | Dark crimson airflow, not screen-obscuring |
| Giratina Origin | Serpentine floating motion and independent appendages; 19-node Rayquaza reference | Restrained distortion rings |
| Giratina Altered | Upright six-leg body unsuitable for simple mapping; special pose and rig | Shadow wisps |
| Original vehicles | Flying carpet, paper plane, airship, cloud, broom; rigid glide on sword style | Optional movement/contrail, stable rider |

Do not create shiny colour variants until base shape/motion pass. Eye and translucent effects require separate material handling. User has not approved any design, sample sizes or public release; these are experiment choices. Enhanced alternatives to Mato's original designs should be separate library choices with permission and attribution, not replacements of the originals.

## Additional independent tests

1. Effects: preserve base effect mesh and edit texture only, retain A5I3 alpha; compare opacity/shape at all frames. Change effect geometry only after confirming texture-only. Measure subject separately from effects. Try layered rings, tapered streaks, feathers, cloud, psychic distortion; avoid overpowering subject. No new particles unless stock SPA role confirmed. Keep legacy Fly background (#59/63/64) and HM #25 independent. Verify what client actually displays; don't assume vanilla DS behaviour.
2. Full custom clip: use 8-node controlled pose edit first; verify exported NSBCA frames and bone bindings. Test single small wing motion delta, then body banking, then additional nodes on a species-specific rig. Keep same core rider/effects contract. Avoid extra camera bones and imported irrelevant meshes. Test 19-node Rayquaza separately as positive reference. Do not add a camera patch without identifying a legitimate cosmetic asset and evidence that the game consumes it.
3. Sidecars: exact stock BTP dictionaries may not bind to custom texture names; use explicit texture/palette name mapping only with confirmed compatibility. BMA requires independent parser and controlled opacity tests; do not confuse BTA UV animation with BMA material animation. Check alternate trainer appearances (not fixed sprites). Confirm how PokeMMO handles embedded placeholder and actual character sprite via visible tests only.
4. Model-only template: require explicit hash or node contract of retained animation; model-only import must not accidentally retain Rayquaza 19-track animation. If mismatch, block and propose complete pair. Preserve original ROM and existing other category mods. Test clean and already-modified Black/White, supported language profiles, readback exact changed members, BPS reapplication, no accidental #118 or HM changes.

## Release gate

Stage A: reference quality reproduced; Stage B: Lugia and Latios visual approval; Stage C: expanded species rig and effect experiments; Stage D: batch conversion only after pipeline proven; Stage E: complete Fly bundle integration and regression tests; Stage F: approval before public release. No experimental candidate should be labelled game-tested without a successful visual test in both phases.

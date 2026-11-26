# Battle Platform Selector — research and implementation handoff

**Research date:** 2026-11-26  
**Repository baseline:** `haqzo/Rom-Patch-Manager` `main` at `d952120ca3a17bfe73816cadd1e9bb91bc65e473`  
**Working branch:** `chatgpt/battle-platform-selector`  
**Recovery branch:** `backup/pre-battle-platforms-2026-11-26`  
**Status:** Implemented on the feature branch. Section 14 records the implemented behavior, verification, and gameplay checklist. Sections 1–13 preserve the research and earlier availability checks.

---

## 1. Executive decision

Build Battle Platforms as a slot-based selector using the same interaction pattern as Battle Backgrounds:

- Select one or multiple platform slots.
- Choose one platform model and apply it to the selected slots.
- Keep the existing complete platform sets.
- Allow a complete set to be applied first, then let individual slot choices override it.
- Start every slot as **Original / Unchanged**.
- Label environment names and mappings **Unconfirmed** until there is reliable evidence.
- Make the slot/group names, status, notes, and mapping editable in Dev Mode.

**Do not implement separate player-side and opponent-side models in the first version.** The byte-matched Pokémon Black/White decompilation shows one stage model resource being instantiated twice for the two sides. The two sides have separate render objects/transforms, but those objects are created from the same model resource. An ordinary replacement of one NARC model member therefore changes both sides together. A separate-side selector would be misleading unless PokeMMO's own engine is later shown to differ or an executable/overlay patch is deliberately designed.

The correct initial model is therefore **one linked platform choice per logical stage/variant**, with a visual indication that the same model is drawn on both sides.

---

## 2. Current ROM Patch Manager implementation

### 2.1 Platform category today

In `app/library/library.json`, the `platforms` category is currently:

- Category ID: `platforms`
- Target: `a/0/1/1 #0–33`
- Picker type: `one`

The current generated library contains three platform choices:

| Item | Writes | Unique model files | Meaning |
|---|---:|---:|---|
| `disc-none` | 34 | 34 | No Battle Ground complete set; each member has its own file |
| `disc-transparent` | 34 | 1 | One shared transparent disc model written to all members |
| `disc-pixel-set` | 34 | 15 | Pixel Battle Grounds complete set using 15 reusable designs |

The 15 reusable pixel designs already exist under `library-src/community/grounds/`. The current `disc-pixel-set` writes map those 15 files across members 0–33.

**Important implementation consequence:** not every platform choice is one reusable file:
- Pixel grounds are reusable individual models.
- Transparent discs are one reusable model.
- No Battle Ground is currently a complete set of 34 member-specific models. To apply that set to only selected members, use the corresponding member's file from the set rather than assuming one universal no-ground model.

### 2.2 Existing platform Dev Mode builder

`app/dev.js` already contains a useful first step:

- A platform builder accepts multiple `.nsbmd` files.
- It exposes all 34 members, #0–33.
- Each member can be assigned a model independently.
- It can auto-match filenames and create writes for the chosen members.

However, its `PLATFORM_SLOTS` names and `GROUND_FOR_SLOT` auto-mapping are hard-coded guesses. They must not be presented as confirmed environment mappings. The auto-match is a convenience heuristic, not a source of truth.

The new public selector should reuse the proven idea of one assignment per member, while the Dev Mode metadata editor should replace the hard-coded guesses with editable, explicitly labelled metadata.

### 2.3 Existing battle-background selector as the UI reference

The current background selector in `app/app.js` is the correct interaction reference:

- Multi-select slot cards.
- Select all / select none.
- Pick a library scene.
- Apply the selected scene to all selected slots.
- Clear individual assignments.
- Preview original ROM entries.
- Show complete sets.
- Show the resulting changes and overlapping writes.

The background data is not interchangeable with platform data. Keep platforms as their own feature and own data structure, but reuse the UI patterns and common helpers where practical.

### 2.4 Current planner and scan limitations

Current `app/core/plan.js` behavior:

- `picks.items.platforms` stores one complete platform item ID.
- `changesFor()` expands that item into its 34 writes.
- `scanInstalled()` scans `pick: "one"` categories as a single whole item.
- There is no per-platform-member selection state or per-member installed status.
- Battle backgrounds already use a slot-keyed selection map and grouped change generation.

Current `app/app.js` also needs platform-specific support in:
- `filesOfPicks()` — load all selected platform model files.
- Original ROM thumbnail generation — currently the battle loop is driven by `lib.battle.slots`; platforms need their own member previews.
- Platform slot cards and the platform panel.
- Change summaries/removal.
- Preset application and summaries.

Current presets represent `items` and `battle`; there is no platform-member map yet.

### 2.5 Existing tests

- `tests/features.test.mjs` has a synthetic-ROM test proving that the current Pixel Battle Grounds set writes all 34 members and leaves members 34–83 untouched.
- `tests/real-rom.test.mjs` currently tests a complete platform item (for example `disc-transparent`) and whole-set installed detection.
- There are no tests for individual platform assignments, mixed sets, per-member scans, or platform overrides.

The synthetic ROM already models `a/0/1/1` with 84 members, which is suitable for the new tests.

---

## 3. Black/White battle-stage architecture

### 3.1 Separate the model resources from the logical environment groups

The current project targets 34 platform model resources in:

`a/0/1/1` members `#0–33`

These 34 model members should **not** be described as 34 confirmed real-world environments.

The vanilla Black/White engine uses a separate battle-stage lookup table in:

`a/1/5/2`

The byte-matched Black/White decompilation identifies three sub-files in this archive as battle-stage/effect visual tables. The code reads:

- Archive member 0 for the stage-group lookup.
- Archive member 1 for field-resource lookup.
- Archive member 2 for stage model/animation resource lookup.

The source structures explain the relationship:

**Member 0 — stage-group rows**

`BtlvEffStageRow` is 0x24 bytes and contains:
- `hasLight`
- `hasVariant`
- `fieldId[17]`
- `stageId[17]`

The engine uses `stageGroup` and `stageIndex` to select a field ID and a stage ID. There are 17 terrain/stage-index positions per row.

**Member 1 — field resources**

`BTLV_FIELD_Create` reads a `[4][4]` integer table per field group and uses the selected variant to resolve a field model and its animations. This is the field/background side of the battle scene, not the small Pokémon standing platform.

**Member 2 — stage platform resources**

`BtlvStageFiles` is 0x44 bytes and contains:

`fileId[4][4]`

The source comments define:
- `fileId[0][variant]` = stage model resource.
- `fileId[1..3][variant]` = up to three animation resources.
- `-1` = no resource for that variant; the engine falls back to variant 0 for the model.

Earlier ROM inspection in this project reported the three `a/1/5/2` member sizes as 684, 1280, and 1700 bytes. Those values are consistent with the decompiled structure sizes (19 × 36-byte stage rows, 20 × 64-byte field rows, and 25 × 68-byte stage-file rows). **The raw ROM bytes could not be rematerialized in this research session, so Codex must re-check the exact sizes and decode the tables locally from the clean ROM before publishing a definitive mapping.**

This yields the useful distinction:

- 19 logical stage-group rows in the first table (based on the earlier extracted 684-byte member).
- 17 terrain/stage-index positions per row.
- 25 logical stage-resource groups in the third table (based on the earlier extracted 1700-byte member).
- 34 model member IDs in `a/0/1/1 #0–33`.

The exact mapping from each stage group and variant to each of the 34 model members must come from the decoded table, not from guessed labels or texture colours.

### 3.2 Player and opponent platforms are linked in vanilla Black/White

The byte-matched Black/White decompilation is decisive on this point:

1. `BTLV_STAGE_Create()` resolves one model file ID for the selected stage group and variant.
2. It creates one `stage->resource` from that model file.
3. It creates `render[0]` and `render[1]` from that same resource.
4. It creates `object[0]` and `object[1]` from those render objects.
5. The two sides have separate transforms/positions and per-side animation state, but they share the same underlying stage model resource.

Therefore, a normal replacement of one platform model member affects both sides. The interface may show both sides in a paired preview, but it should say **Shared on both sides** rather than offer a fake separate assignment.

This conclusion is grounded in vanilla Pokémon Black/White source. PokeMMO's internal engine is not available for inspection here, and no PokeMMO battle log is required or assumed. Treat the PokeMMO-specific equivalence as strongly suggested by its use of these ROM assets, not as independently verified engine behavior.

**Special-mode caveat:** the decompilation has a `mode == 3` branch that bypasses the normal stage lookup and loads fixed model/animation resource IDs `0x56` and `0x57`. The available evidence here does not establish whether PokeMMO uses that mode or which archive members those IDs resolve to in the target ROM. The local ROM audit must identify this path before the feature claims coverage of every special battle mode.

### 3.3 Do not copy Black 2 / White 2 assumptions

Black 2 / White 2 is a separate decompilation and resource layout. Do not import its stage table or its resource-member mapping into this Black/White tool. Use the Black/White source and the user's clean Black/White ROMs.

---

## 4. Autumn observation and current pack mapping

The user's gameplay observation is that the current pack can show a green platform in autumn. This is a real reason to expose individual selection; it is not enough to identify the exact model member PokeMMO selected.

The current Pixel Battle Grounds mapping assigns:
- Autumn Grass to members 3, 11, and 30.
- Snowy Grass to members 4, 12, and 31.
- Green Grass to members 1, 2, and 32.
- Forest to members 9, 10, 28, and 29.

These are the current pack's assignments, not a verified PokeMMO environment map.

One possible explanation is that PokeMMO selects a non-seasonal member such as #32 for a particular battle environment during autumn. That is only a hypothesis. The correct response is to expose the raw member and logical group/variant selection, mark names as **Unconfirmed**, and let Haqzo correct metadata in Dev Mode when new evidence is available.

Do not silently reassign #32 or any other member during this feature implementation.

---

## 5. Recommended user-facing design

### 5.1 Main Battle Platforms panel

Use the Battle Backgrounds interaction pattern, but make the platform data explicit.

**Initial state**
- Every slot is Original / Unchanged.
- No platform patch is selected automatically.
- Existing complete sets remain available.

**Selection**
- Select one or multiple raw platform members.
- Select a reusable model from the platform library.
- Apply it to all selected members.
- Clear one member back to Original / Unchanged.
- Select all / select none.
- Show the current assignment and preview per member.

**Environment grouping**
- Preferred long-term view: 25 logical stage groups, each expandable to its available variants.
- Advanced view: all 34 raw model members #0–33.
- Do not display guessed group names as facts. Until the lookup table has been decoded and reviewed, use neutral labels such as `Stage group 00 · Unconfirmed` and `Model member #00 · Unconfirmed`.
- Once the table is decoded, each raw model member should show its group ID and variant index. The group label remains editable in Dev Mode.

**Side presentation**
- Show a paired Player / Opponent preview if useful.
- Both previews use the same selected model and are labelled **Shared model**.
- Do not expose independent side selectors unless a future engine-level mechanism is proven.

### 5.2 Complete sets stay

Keep these options as one-click complete sets:
- No Battle Ground.
- Transparent Discs.
- Pixel Battle Grounds.

Users should be able to:
1. Apply a complete set.
2. See all 34 assignments.
3. Change only selected members afterwards.
4. Retain the rest of the set.

A new complete-set selection should have explicit, predictable behavior for existing per-member overrides (preferably ask whether to clear them or replace the entire platform configuration). Never leave hidden stale overrides.

### 5.3 Individual platform library

Expose the 15 existing Pixel Battle Grounds models as individual choices, plus the shared transparent model. Future models can be added through Dev Mode.

No Battle Ground needs special handling: its current complete set contains 34 different model files, so selecting its per-member entry should use the corresponding member-specific file. Do not treat it as one reusable file.

### 5.4 Original previews

When a ROM is open, render the original platform model for each raw member, not only member #0. Show:
- Original preview.
- Selected replacement preview.
- Member ID.
- Logical group/variant, once decoded.
- Metadata status (Unconfirmed / Verified).
- Current installed state (Original / known library asset / Custom).

---

## 6. Dev Mode requirements

Dev Mode must become the source of truth for platform slot metadata. At minimum, each raw member should support:

- Permanent member ID (0–33).
- Editable English, Simplified Chinese, and Spanish display names.
- Status: Unconfirmed / Verified.
- Editable description/notes.
- Logical stage-group ID.
- Variant index (0–3).
- Evidence/source note.
- Default suggested platform (optional; never auto-apply it to a user's ROM).

The group editor should support:
- Editable logical group name and status.
- Adding/removing a raw member from a group only with validation.
- Reordering display groups without changing ROM member IDs.
- Viewing all member variants in one group.

The existing Dev Mode platform file builder should use this metadata rather than its current hard-coded `PLATFORM_SLOTS` and `GROUND_FOR_SLOT` guesses.

Publishing slot metadata must be persistent and build-safe. The current `edits.json` pipeline edits items, scenes, categories, and presets; it does not yet have platform slot/group metadata. The implementation must extend the library source/build and Dev Mode edit pipeline coherently. Do not edit only the generated `app/library/library.json`.

---

## 7. Recommended data and patch-planning model

Keep the existing whole-set item format for backward compatibility. Add a separate per-member platform selection map rather than turning all current items into a new incompatible shape.

Suggested conceptual structure:

- `picks.items.platforms`: optional complete-set ID (existing behavior).
- `picks.platforms[member]`: optional individual model assignment for member 0–33.
- `lib.platforms.slots`: 34 raw member definitions with group/variant metadata.
- `lib.platforms.groups`: 25 logical stage groups once decoded.
- `lib.platforms.models`: reusable model library entries (15 pixel models, transparent model, future models).
- `lib.platforms.sets`: references to the existing complete sets, including member-specific file mappings where needed.

Planner order should be deterministic:
1. Existing complete platform set writes.
2. Individual platform member overrides.
3. Other unrelated feature writes.

The existing overlap detection can then show that an individual member choice overrides the corresponding member from a complete set.

Required supporting behavior:
- Load selected model files in `filesOfPicks()`.
- Generate one ROM write per assigned member.
- Group change summaries by model/assignment without hiding the member IDs.
- Scan each platform member independently.
- Continue to identify a fully installed legacy complete set.
- Represent mixed/partial platform states as a mixed/custom state, while still showing known per-member assignments.
- Include platform member assignments in presets and preset summaries.
- Preserve old presets and old `picks.items.platforms` behavior.
- Ensure a platform write never overlaps battle-background members 34–83.
- Keep the original ROM unchanged; all writes go to the output build only.

---

## 8. Required read-only ROM audit before coding

Codex should use the local clean ROM paths if they are available to its environment. Do not copy ROM bytes into the repository or handoff.

1. Verify the ROM identity and CRC against the user's established clean Black/White profiles.
2. Read-only extract `a/1/5/2` from both clean ROMs.
3. Verify its three sub-file sizes and compare the Black and White tables byte-for-byte.
4. Decode:
   - member 0: 19 stage-group rows and their 17 terrain/stage-index mappings;
   - member 1: field resource mapping;
   - member 2: 25 stage-resource groups and their four variants.
5. Resolve every `fileId[0][variant]` to its actual `a/0/1/1` model member.
6. Confirm the full set of referenced platform members is #0–33 and identify any unused or shared members.
7. Produce a machine-readable mapping fixture and a human-readable table.
8. Keep all labels unconfirmed until the table has been decoded and independently reviewed. Vanilla lookup mapping is not proof of PokeMMO's live selection behavior.

If Codex cannot access the clean ROM paths, stop and ask Haqzo for the local paths. Do not substitute guessed mappings.

---

## 9. Test and acceptance plan

### Unit / synthetic-ROM tests

- Exactly 34 raw platform members are represented: #0–33, no duplicates or missing IDs.
- Every assignment targets `a/0/1/1` and a member in 0–33.
- A single selection writes only that member.
- Multi-selection writes only the selected members.
- Members 34–83 (battle backgrounds) remain byte-for-byte unchanged.
- Applying a complete set writes all 34 platform members.
- Individual assignments override the corresponding complete-set writes deterministically.
- Replacing a complete set handles old individual overrides explicitly.
- Clearing an individual member restores the base set assignment or Original / Unchanged state as appropriate.
- Per-member installed scanning identifies original, known model, and custom entries.
- Full legacy set detection still works.
- Presets save and restore both the base set and per-member overrides.
- BPS build/apply round-trip reproduces the built ROM.
- Library rebuild is deterministic and Dev Mode metadata edits survive a clean build.

### Real-ROM structural tests

Run with the user's clean Black and White ROMs if available:
- Original platform scan.
- Full Pixel Battle Grounds set.
- Transparent set.
- No Battle Ground set.
- Mixed individual member assignments.
- Complete set followed by individual overrides.
- BPS export and re-apply.
- Confirm source ROM hashes remain unchanged.

### PokeMMO gameplay status

No log or internal client instrumentation is required. The feature should be useful without it.

Only Haqzo or MaToRiuKo can mark a platform mapping as PokeMMO gameplay-verified after visually observing the relevant battle. If a mapping cannot be observed, leave it Unconfirmed.

### Acceptance criteria

The feature is complete when:
- Individual platform choices work for any selected subset of #0–33.
- Existing complete sets still work.
- Mixed complete-set + per-member customization works.
- Original previews and installed-state scans work per member.
- Dev Mode can edit and persist names, groups, variants, status, and notes.
- Presets and change summaries correctly represent platform assignments.
- No battle-background, Surf, Fly, or other patch behavior regresses.
- All available automated and real-ROM structural tests pass.
- No claim of PokeMMO verification is made without actual gameplay evidence.

---

## 10. Repository policy gate — must be resolved by the owner

The current `AGENTS.md` explicitly limits AI helpers (including Codex) to content/docs and forbids edits to:
- `app/**`
- `tests/**`
- `scripts/**`
- `tools/**`

That policy conflicts with the requested application implementation. This research branch respects the current policy and changes documentation only.

**Before Codex is asked to implement the selector, Haqzo must explicitly authorize a narrow, branch-scoped exception in the repository instructions.** Do not ask Codex to ignore `AGENTS.md`, and do not modify that protected file through this research task.

Suggested owner-authored exception (if approved):
- Allow Codex to modify only the app, tests, and build/library files required for Battle Platforms.
- Work only on `chatgpt/battle-platform-selector` (or a new owner-approved feature branch).
- Never push to `main`, change deployment settings, publish, merge, or release.
- Preserve the backup branch.
- Keep all ROMs and ROM-derived binary dumps out of Git.
- Require the read-only ROM audit, regression tests, and Haqzo review before merge.

---

## 11. Sources

### This repository
- [Repository instructions](../../AGENTS.md)
- [Project handoff](../HANDOFF-CHATGPT.md)
- [Current platform definitions](../../app/library/library.json)
- [Community platform set](../../library-src/community/items.json)
- [Platform model generator and current 34-member mapping](../../tools/model-pipeline/make-grounds.py)
- [Current Dev Mode platform builder](../../app/dev.js)
- [Current patch planner and installed scan](../../app/core/plan.js)
- [Battle Background selector](../../app/app.js)
- [Library Dev Mode and preset editor](../../app/dev-library.js)
- [Synthetic platform tests](../../tests/features.test.mjs)
- [Real-ROM tests](../../tests/real-rom.test.mjs)

### Vanilla Pokémon Black/White decompilation
- [Project-Holon/aletheia — byte-matched Black/White decompilation](https://github.com/Project-Holon/aletheia)
- [Battle stage creation: one model resource, two render objects](https://github.com/Project-Holon/aletheia/blob/main/src/game/ov094/btlv_stage.c#L90-L175)
- [Battle stage resource-table structure](https://github.com/Project-Holon/aletheia/blob/main/src/game/ov094/btlv_stage_shared_types.h#L41-L62)
- [Stage-group lookup and stage creation](https://github.com/Project-Holon/aletheia/blob/main/src/game/ov094/btlv_effect.c#L197-L203)
- [Battle-stage archive identification](https://github.com/Project-Holon/aletheia/blob/main/tools/assets/tables.py#L505)

**Evidence boundary:** decompiled vanilla Black/White behavior is strong technical evidence for the original ROM architecture. It does not by itself prove every PokeMMO-specific environment mapping.


---

## 12. Follow-up source verification and ROM availability check

**Follow-up verification:** 2026-11-26.

The cited public decompilation source was fetched directly from Project-Holon/aletheia and the relevant code was checked:

- src/game/ov094/btlv_stage.c: BTLV_STAGE_Create() loads archive 0x98 member 2, resolves the model from fileId[0][variant] (falling back to variant 0 when the selected entry is -1), then creates both render[0] and render[1] from the same stage->resource. The two sides therefore share one model resource in the normal path.
- src/game/ov094/btlv_stage_shared_types.h: BtlvStageFiles.fileId[4][4] is documented as model row 0 and animation rows 1–3, indexed by variant. The BtlvStage structure separately stores two side render objects, objects, animation state and draw positions.
- src/game/ov094/btlv_effect.c: BtlvEffStageRow is a 0x24-byte row with 17 field IDs and 17 stage IDs, indexed by stage group and stage index.
- tools/assets/tables.py: archive a/1/5/2 is identified as the battle stage/effect visual table, with three sub-files and reader references in the battle visual-effect subsystem.

This directly supports the shared-side conclusion for the normal vanilla Black/White battle-stage path. It does not establish that PokeMMO has no custom engine changes. The special mode == 3 branch remains a separate unresolved path: it loads fixed model resource ID 0x56 and animation resource ID 0x57, bypassing the normal stage-table model lookup. Do not claim that every PokeMMO battle mode has been covered until the ROM audit resolves those IDs and Haqzo/MaToRiuKo have observed any relevant special mode.

### ChatGPT Library search

A follow-up search of the connected ChatGPT Library found useful supporting materials, including:
- Black build reports confirming the clean English Black source profile (IRBO, CRC32 4F6E5580, 268,435,456 bytes).
- Existing project notes identifying the user's local clean-ROM folder as ~/Desktop/Roms/Clean-Roms/Unzipped-Clean-Roms/, with Pokemon - Black Version (USA, Europe) (NDSi Enhanced).nds and Pokemon - White Version (USA, Europe) (NDSi Enhanced).nds.
- The established clean White profile (IRAO, CRC32 B552501C, 268,435,456 bytes).
- Prior synthetic and real-ROM test output showing the existing ROM build pipeline can preserve unrelated members and re-apply BPS output.

**No raw clean .nds ROM file or extracted a/1/5/2 table binary was returned by the Library search.** The Library evidence is useful for identity and prior test history, but it is not a substitute for the actual local ROM bytes. Codex/the local development environment must run the read-only extraction against the two local files above (or Haqzo must provide the current paths if they have moved). Do not upload ROMs or extracted ROM data to GitHub.

### Updated next action

Before any application implementation:
1. Run the read-only extraction/decode in Section 8 against both clean local ROMs.
2. Save only a human-readable mapping, a small non-ROM-derived test fixture if permitted by the repository policy, and the audit script/results needed to reproduce the mapping. Do not commit raw ROM bytes, extracted archive members, or full ROM-derived binary dumps.
3. Review the decoded 25-group/4-variant mapping against all 34 target model members. Keep environment labels Unconfirmed unless gameplay evidence confirms them.
4. Obtain Haqzo's explicit approval for a narrowly scoped exception to the current AGENTS.md before asking Codex or any agent to edit app/**, tests/**, scripts/**, or tools/**.

The current branch remains documentation-only; no application, test, script, tooling, library asset, deployment or main-branch change is authorized by this follow-up.


---

## 13. English real-ROM audit and all-language acceptance gate (2026-11-26)

This section supersedes the earlier missing-English-ROM limitation. Both English Black and White were recovered from user-owned ZIP files and inspected read-only. Independent Python FNT/FAT/NARC parsing followed the same path-based method as the project's ROM core. The source ZIP hashes were checked before and after the audit; no source files were changed. No ROM bytes, extracted assets, raw table dumps or private fingerprints are included in this repository.

### Measured results

- Both inputs matched the existing English clean profiles in app/core/rom.js, had valid header CRC16, 256 MiB size, and 484 FAT entries. The ordinary FNT walk resolved 247 named paths (FAT entries include other resources).
- a/1/5/2 resolved to file ID 394; it contains exactly three members of 684, 1280 and 1700 bytes. All three are byte-identical between the English editions (verified by SHA-256).
- a/0/1/1 resolved to file ID 253 and contains **222** members, not merely the first 84 exposed by the current UI. All 222 member hashes match between the English editions.
- The 19 environment rows (36 bytes each), 20 field groups (64 bytes each) and 25 stage-resource groups (68 bytes each) decode correctly.
- Every explicit ordinary stage model ID resolves to a BMD0 resource among members 0–33; the union is exactly those 34 members. The 25 leading reserved words are zero. All ordinary stage animation entries are -1. Model fallback is to variant 0; a fallback must never be shown as an independent editable model.
- Group 02 exists and resolves to #5, but is not referenced by any of the 323 ordinary environment lookup entries. Retain #5 in the advanced view and label its live usage Unconfirmed; absence from this table is not proof of total non-use.
- Field resource IDs are distinct from stage-platform IDs. Field models start at 34 and include 84; do not extend the existing background selector as incidental work.
- The special mode 3 explicitly requests archive 11 member 86 (BMD0) and 87 (BCA0). Both are outside the 34-platform scope; their actual PokeMMO use remains unconfirmed. Keep them unchanged.

### Group map (vanilla English; names and PokeMMO usage unconfirmed)

| Stage resource group | Explicit model members |
|---|---|
| 00 | 0 |
| 01 | 1–4 |
| 02 | 5 (not referenced by ordinary environment lookup) |
| 03–05 | 6–8, respectively |
| 06 | 9–12 |
| 07–21 | 13–27, respectively |
| 22 | 28–31 |
| 23 | 32 |
| 24 | 33 |

There are exactly three four-variant groups and 22 single-model groups. Variant order is confirmed as numeric index only; do not infer seasonal/environment labels from this alone. A group selection expands to its distinct member IDs; independent member selection is always available. Player/opponent share the model resource in the vanilla engine; side-independent choices remain excluded until a separate mechanism is demonstrated.

Source cross-check:
- https://github.com/Project-Holon/aletheia/blob/main/src/game/ov094/btlv_stage.c
- https://github.com/Project-Holon/aletheia/blob/main/src/game/ov094/btlv_stage_shared_types.h
- https://github.com/Project-Holon/aletheia/blob/main/src/game/arm9/g3d_system.c (resource dataId is passed to ARC_TOOL_LoadMember)
- https://github.com/Project-Holon/aletheia/blob/main/docs/ASSETS.md (archive inventory)

### All-language gate

The owner explicitly expanded the research scope to all Black/White ROM languages: English, Spanish, French, German, Italian, Japanese and Korean, Black and White for each (14 intended profiles). The current website UI languages are separately English, Simplified Chinese and Spanish, all required for the new feature. There is no assumption of a standard official Simplified Chinese ROM edition.

| ROM language | Black | White |
|---|---|---|
| English | Structural audit passed | Structural audit passed |
| Spanish | Pending byte access | Pending byte access |
| French | Pending byte access | Pending byte access |
| German | Pending byte access | Pending byte access |
| Italian | Pending byte access; suspect source label | Pending byte access |
| Japanese | Pending byte access | Pending byte access |
| Korean | Pending byte access; suspect source label | Pending byte access; suspect source label |

The regional ZIPs are present in the user's Library inventory, but raw-byte materialization was denied for all twelve. Do not claim that their stage lookup or model bytes match. Older six-ROM research found some differences elsewhere in a/0/1/1 in Spanish and Japanese, without isolating this new selector's exact targets. Do not generalize whole-archive differences to the platform subset.

For each regional ROM, run the same read-only extraction and verify header, revision, archive shape, tables, exact explicit/effective stage mapping, member signatures, and per-member differences relative to English. Compare assets 0–33 separately from 34–83 and the special IDs. Known fingerprint recognition does not establish authenticity, especially for files marked [b]. No blanket gameplay claims.

Design requirements:
- Resolve both archives using each ROM's own FNT, not hardcoded FAT indices or ROM offsets.
- Before enabling grouped selection on a ROM, validate archive/model bounds and decoded mapping; if it differs from the verified mapping, disable grouped choices pending review rather than silently remap. For structurally safe raw-member selection, use explicit member IDs and show the unconfirmed status; fail closed if a selected member is not a valid expected model or the archive cannot be parsed.
- Keep original previews sourced from the opened ROM. Never infer original/custom status from language alone.
- Keep BPS output bound to the exact input ROM; do not apply English BPS to another language.
- Localize the public selector, messages, state, presets and platform metadata in en/zh/es. Dev Mode must support editing all three names; do not change unrelated localization.
- Test no-op, single, mixed, full-set and override exports and prove preservation of non-target members for each available verified regional input. This is separate from the read-only audit.
- Preserve the existing website's general language handling; do not narrow it to English or falsely certify untested editions.

### Implementation status

English read-only audit complete. Regional structural audit remains blocked on access. Application code, library definitions, tooling, deployment and main remain untouched. Existing backup and working branches stay intact. The implementation must follow the repository's protected-path rules; no claim of a finished selector or PokeMMO gameplay test is made.

## 14. Implemented feature branch

The implementation started from `100053456c82b0974ab1bf8537e30b35d9e19ed8`. The tested implementation commit is `e3d294b62d361a7665f058a74dd18a78b2fc8819`. Main and the verified remote recovery branch `backup/pre-battle-platforms-2026-11-26` both pointed to `d952120ca3a17bfe73816cadd1e9bb91bc65e473` at checkout. The original local checkout's ahead-of-origin `main` at `bf88dd553b851e6f90ef81ecdc5d5742b03378b9` and the separately inspected local experiments were preserved. Verified local Git bundles accompany the handoff.

### Selector and ROM writes

- Apply a complete set, choose one or more destinations, then apply a different model, keep the loaded model, or restore stock. Clearing an override returns the member to its inherited assignment. Switching sets with existing overrides asks whether to retain or replace the overrides. Reset clears the platform choices and destination selection.
- The selector resolves `a/0/1/1` and `a/1/5/2` through the opened ROM's FNT and FAT. It checks the first 34 model headers, the lookup archive layout, and the numeric stage-group entries before exposing grouped selection. Raw selection remains available for compatible members if grouped selection is unavailable.
- The three existing legacy sets keep their IDs and assignments. The individual catalog references the same 15 pixel NSBMDs, MaToRiuKo's Transparent Disc, and the member-specific No Battle Ground set. The build checks the required NSBMDs separately from preview rendering, and content-addressing keeps files deduplicated.
- One model is shared by both sides in ordinary vanilla Black and White battles. The selector uses the numeric map in Section 13 and one pending assignment per physical member. Three groups have four explicit variants. The other groups fall back to their first member. The ordinary environment table does not reference group 02/member 5. PokeMMO environment names and special-mode behavior remain unconfirmed.
- A preset can reference the platform set and individual choices alongside battle backgrounds. The effective plan emits at most one platform write for each member #0–33. Keep-current exclusions emit no platform write. Explicit legacy custom imports still use the existing overlap warnings and precedence.
- Installed-state scanning uses the opened bytes. The app reports known library models, verified stock, mixed configurations, and unknown models where evidence is insufficient. Keeping the loaded model preserves any installed modification. Stock restoration uses the loaded clean profile or an explicitly opened clean donor with matching game code, revision and lookup bytes. Known clean CRC32, size, header and structural checks establish the supported donor profile. Donor model bytes stay in memory for the active target, and presets only store the restoration choice.
- The destination cards show the effective model picture using the Battle Backgrounds layout as a reference. Group and set previews show a representative member, and raw member cards show each effective assignment. The viewer opens the actual current or effective NSBMD. Loaded ROM thumbnails are generated as visible cards enter the viewport and are held in browser memory. Transparent and No Battle Ground assets display an intentional hidden state. No extracted stock models or stock previews are distributed.

### Dev Mode and offline build

- Dev Mode can edit English, Simplified Chinese and Spanish display names and descriptions for groups and members. Gameplay verification requires an evidence note. Optional suggested models are displayed as suggestions. Numeric member IDs and variants come from the audited lookup.
- The catalog editor registers reusable and member-restricted creator NSBMDs with localized text, attribution and optional preview art. Published assets can be reused by their existing content hash. The same edit logic validates Dev Mode drafts, the community build and preset references. The set builder retains filename suggestions as a convenience.
- The existing production path remains Node 22, `npm test`, `scripts/add-community.mjs` and missing-preview rendering. The change was served locally at `/Rom-Patch-Manager/`, including modules, thumbnails, model resources, downloads and offline reload. The service worker caches the selector modules, uses content-addressed model caching and refreshes online previews by ID. The public version is unchanged.

### Real-ROM verification

Each tested input had revision 0, a valid header checksum, 268,435,456 bytes, 484 FAT entries, and 222 members in `a/0/1/1`. All three lookup table members and the model bytes for members #0–33, #34–83 and #86/87 matched English Black across the twelve local inputs. The Italian Black filename carries a `[b]` marker. Its tested bytes matched the recorded profile and passed the same checks. The file label's provenance remains unconfirmed.

| Language | Black | White |
|---|---|---|
| English | IRBO · 4F6E5580 · passed | IRAO · B552501C · passed |
| Spanish | IRBS · 2CA88FAA · passed | IRAS · 32657121 · passed |
| French | IRBF · 308F9D56 · passed | IRAF · 8B4CBA44 · passed |
| German | IRBD · E59E6F87 · passed | IRAD · 95CF004D · passed |
| Italian | IRBI · 52A5634D · passed | IRAI · 2F025937 · passed |
| Japanese | IRBJ · 33AF46D5 · passed | IRAJ · CAA820CB · passed |
| Korean | IRBK · locally unavailable | IRAK · locally unavailable |

Each available profile passed no-op, individual replacement, all three complete sets, a mixed set with overrides and a keep-current exclusion, combined background and platform changes, and stock restoration. All twelve combined builds passed NDS verification and BPS reapplication. English Black and White also passed BPS reapplication of stock restoration. The source SHA-256 was checked before and after, along with all unrelated archive members and files.

### Automated and browser verification

- Node 22.23.5 with the local inputs ran 42 tests, with **40 passed and 2 skipped**. The skip count covers Korean Black and White. The opt-in profile matrix by itself recorded **12 passed and 2 skipped**. The separate modified-ROM regression used a disposable build created from the local English Black input.
- Chromium passed the Pages-style scenarios for destination pictures, keyboard grouping, individual NSBMD substitution, mixed set overrides, keep-current exclusions, installed-state inspection, compatible local donor restoration, combined background/platform preset export, Dev Mode draft persistence and offline reload. The English, Spanish and Simplified Chinese screens were exercised at desktop, narrow desktop and mobile widths.
- Linux Firefox passed file drop, keyboard group selection, individual model preview, and NDS/BPS download fallback. Headless Firefox cancelled the intercepted native picker, so Firefox file input used a local File passed through the app's drop handler. Chromium exercised the app's picker path.
- The isolated Pages-style build merged community assets, rendered missing previews and loaded with the production Content Security Policy. Preview evidence shows creator-authored models. The ROM-based thumbnail assertion ran locally without publishing a stock picture.

[Public selector with destination pictures](battle-platform-selector/public-selector.png) · [Individual model catalog](battle-platform-selector/model-catalog.png) · [Mixed overrides](battle-platform-selector/mixed-set-overrides.png) · [Pixel NSBMD](battle-platform-selector/pixel-model.png) · [Transparent Disc](battle-platform-selector/transparent-model.png)

[Dev Mode environment labels](battle-platform-selector/dev-environment.png) · [Dev Mode model registration](battle-platform-selector/dev-model.png) · [Spanish offline narrow view](battle-platform-selector/offline-narrow-es.png) · [Simplified Chinese mobile view](battle-platform-selector/mobile-zh.png)

### In-game checklist for Haqzo and MaToRiuKo

1. Start with an owned clean ROM and build a disposable output. Apply Pixel Battle Grounds and verify both platforms in ordinary outdoor, indoor, cave and water battles.
2. Assign a visible, distinct model to one member at a time to identify which group and variant PokeMMO loads. Record the game build, ROM edition, location, season, battle type, group and member. Confirm member #32 separately before interpreting the previous autumn observation.
3. Repeat a verified encounter with Transparent Disc on the same member. Check that the terrain, background and camera remain intact and that both sides behave as expected. Compare against the member-specific No Battle Ground choice.
4. Reopen a modified ROM and restore one known platform from a local clean donor. Set a second member to Keep current while applying the full set. Verify that both choices survive export and that the other assignments still apply.
5. Include ordinary encounters on both editions where useful, and document any exceptions from PvP or special battle modes. Leave group 02/member 5 and special members #86/87 unconfirmed unless observed. Record evidence in Dev Mode and keep suggested models advisory.

Actual PokeMMO gameplay verification of the selector and its environment labels remains pending.

## 15. Owner-test refinement

Started at `8d6f45ae3fa59ca968bab3914da2ee7e606c0af5`. The refinement is implemented at `23403f1cd212a17d6fa29bde2be9638a7ec0fffc`.

- The first view shows all three packs with preview and Apply controls. Pixel uses the actual representative creator model. No Battle Ground and Transparent Discs identify their intentionally hidden output. The model shelf and the compact destination chooser can be opened independently. Destination details retain the numeric IDs and evidence.
- Current and effective pictures follow the selected member and the loaded bytes. Mixed groups identify their representative member. Clean stock and unknown installed assets are rendered only in the browser. The planner still targets only `a/0/1/1` members #0–33 for platform writes. The previous 12-profile verification in Section 14 continues to apply to that pipeline. Both English editions were rechecked in this refinement.
- The destination and Changes views distinguish inherited set choices, individual model overrides, explicit Keep Current, and verified stock restoration. A destination without a pending assignment shows Unchanged. The build discards a stale platform picture when a creator replaces the corresponding NSBMD without supplying a new preview. Dev Mode can generate a local preview or use an explicitly registered image.
- The isolated owner build follows the Pages merge and missing-preview steps and includes all 15 Pixel model pictures. Its service worker was verified with the refinement cache and a local offline reload. The checkout at `batch05-owner-preview` beside the feature worktree is served on loopback at [127.0.0.1:8775/Rom-Patch-Manager/](http://127.0.0.1:8775/Rom-Patch-Manager/). From the directory containing that isolated build, restart it with:

  ```sh
  python3 -m http.server 8775 --bind 127.0.0.1 --directory batch05-owner-preview
  ```

  [Open Dev Mode](http://127.0.0.1:8775/Rom-Patch-Manager/?dev). The public version is unchanged. The draft is awaiting owner review and in-game verification. Korean Black and White remain unverified.

Node 22.23.5 recorded **29 passed and 14 skipped** on the refinement with English Black and White. The skipped cases use other regional or modified ROM inputs. Chromium exercised the production-style build with a local clean ROM, a disposable modified ROM, a matching stock donor, a rejected donor from the other edition, and NDS and BPS exports. A separate browser profile covered localized Dev Mode edits, verification notes, a user-supplied preview, draft reload and offline browsing. All captures linked below use creator assets.

[Public selector](battle-platform-refinement/public-selector.png) · [Mixed assignments](battle-platform-refinement/mixed-set-overrides.png) · [Model library](battle-platform-refinement/model-catalog.png) · [Pixel preview](battle-platform-refinement/pixel-model.png) · [Transparent preview](battle-platform-refinement/transparent-model.png)

[Dev environment editor](battle-platform-refinement/dev-environment.png) · [Dev model registration](battle-platform-refinement/dev-model.png) · [Spanish narrow offline](battle-platform-refinement/offline-narrow-es.png) · [Simplified Chinese mobile](battle-platform-refinement/mobile-zh.png)

# Battle Platform Selector — research and implementation handoff

**Research date:** 2026-11-26  
**Repository baseline:** `haqzo/Rom-Patch-Manager` `main` at `d952120ca3a17bfe73816cadd1e9bb91bc65e473`  
**Working branch:** `chatgpt/battle-platform-selector`  
**Recovery branch:** `backup/pre-battle-platforms-2026-11-26`  
**Status:** Research and implementation specification only. No application code, tests, scripts, library assets, or main-branch files have been changed.

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

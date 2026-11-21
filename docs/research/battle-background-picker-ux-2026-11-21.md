# Battle backgrounds picker — focused UX upgrade proposal (21 Nov 2026)

**Status:** proposal / implementation handoff only. No app code changed here.
**Source:** Haqzo's 47-second 2560×1440 browser recording from 21 Nov 2026, reviewed alongside `app/app.js` on `main` (the `renderBattle`, `slotTile`, `sceneCard`, and `assignScene` functions), plus the project README.
**Owner decision needed before coding:** whether to make the slot selector collapsed by default or remember its last open/closed state. Proposed default below is *expanded until there is a selection, then remember user choice*.

## Observed current workflow

- The Battle backgrounds tab starts with **Model + animation / Model only**. Under it, all **25 battle-type cards** are rendered as a full grid, followed by the custom-image background editor, sets, and the library of rendered scene cards.
- With no ROM loaded, the slot cards show the general mountain glyph and “Unchanged”. This is **expected behaviour**, not evidence of missing previews.
- Selecting slot cards and then clicking a scene assigns that scene to *all selected slots*. The user can also use Select all / Select none, one-click sets, and the custom picture-background generator.
- Existing search-by-name-or-creator and creator filters in the scene library should be retained, not duplicated. The left “Your changes” rail already summarises changes.
- In the recording, the actual scene library is pushed well below the top of the page. The slot grid is information-heavy but shows little visual content until a ROM is opened or patches are assigned.

## Goal

Make the **choose battle type → compare scene → apply → review** path obvious and compact without altering existing patch contents, 25-slot data, assignment logic, or the broad layout of other tabs.

## Proposed small first implementation

1. **Compact / expandable slot-picker section.** Show an always-visible header such as “Battle types — 3 selected”, with a clear expand/collapse affordance. While expanded, keep the existing 25 slot tiles and Select all / Select none. Remember the collapsed state during normal category navigation, and do **not** lose `S.selSlots` or any assignments when collapsed.
2. **Show the active target next to the scene library.** Add a small persistent line above scene cards: “Apply to: [selected battle types]” with a “Change” action that opens and scrolls/focuses the slot section. If nothing is selected, show “Choose battle types to apply a background”. Clicking a scene without selected slots must still **not** silently change anything.
3. **Keep preview separate from application.** Preserve the preview (eye) control and the existing model+animation / model-only behavior. Make the apply affordance clear in the scene card's focus/hover/selected state. Do not accidentally treat previewing as assignment.
4. **Keep existing one-click sets and the picture background creator.** Their controls must remain discoverable and must continue using the selected slot list. Avoid moving them into unrelated tabs or turning them into a wizard.
5. **Keyboard accessibility.** The current slot elements have `role="checkbox"` and `tabindex="0"` but the reviewed handler attaches `onclick` only. Add Space / Enter activation and a visible focus indicator. Preserve access to nested preview/remove buttons. Scene cards with `role="button"` and `tabindex="0"` also need reliable Enter / Space behavior. Validate against accidental double activation.
6. **Responsive layout.** At narrower widths, keep the selection summary and actions readable; reduce tile columns without horizontal overflow. Do not change the fixed left rail or other tabs as part of this task.

## Optional follow-up after first implementation

- Add battle-type **search** (e.g., forest / winter / PvP) and group slots by location only if it helps real users; this should filter the picker, **not** silently alter selected slots.
- Add a small scene-**comparison drawer** showing the selected scene, creator/credit, model-only vs model+animation, and a ROM-original preview when a ROM is loaded. Reuse the existing viewer; do not create duplicate graphics code.
- Audit persistent loading glyphs in the **TM/HM backgrounds** scene cards separately. The recording captures loading icons during a brief tab visit but is insufficient to diagnose a failure.

## Acceptance criteria for implementation

- [ ] Starting **without a ROM**, a user can pick 1, several, all or no battle types and apply a scene where valid; “Unchanged” remains honest.
- [ ] A scene is never applied merely by previewing it; trying to apply with zero targets gives a clear instruction.
- [ ] Existing picks, set-application, custom-picture templates and export paths behave the same as before.
- [ ] Selected count always matches the actual selected slots; collapsing/expanding or switching tabs does not reset them.
- [ ] The currently applied scene remains visible in the slot/changes review. Conflicts and size warnings are not hidden.
- [ ] Keyboard, focus and screen reader semantics work for slot selection, scene preview and apply.
- [ ] UI strings are available in **English / 简体中文 / Español**, with proper fallback.
- [ ] No ROM data, file bytes or personally identifying data leave the browser; existing offline behavior works.
- [ ] Run `npm test`. Check the UI at desktop and narrow widths, with/without a user-owned test ROM.
- [ ] **No in-game compatibility claim** without Haqzo or MaToRiuKo testing in PokeMMO.

## Scope / safety

The actual implementation belongs to Haqzo / Claude / MaToRiuKo, since repository `AGENTS.md` limits ChatGPT to library, docs, research and experiments. This research PR intentionally **does not edit** `app/**`, tests, scripts, deployment, generated library or repository settings. No ROMs or binary mod files are added.

**Suggested code touchpoints for the implementing developer:** `app/app.js` (`renderBattle`, `slotTile`, `sceneCard`, `assignScene`), `app/styles.css`, and `app/i18n.js`. Preserve all core ROM/build/export logic unchanged. Aim for one small separate code PR and a before/after screen recording.

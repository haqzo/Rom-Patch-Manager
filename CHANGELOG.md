# Changelog

## Unreleased
- Library: **Blue PVP Battle Field** by YOKA (model only, any battle type), uploaded by MaToRiuKo.
- AGENTS.md + docs/HANDOFF-CHATGPT.md: rules and handoff for AI helpers; `experiments/` and `docs/research/` folders.

## 1.1.1 (2026-11-18)
- Removed “Cynthia (Big Truck)” from Surf: MaToRiuKo uploaded it by mistake, it isn't a Surf model.
- Renamed with MaToRiuKo: the battle type “Misc.” is now **Buildings & PvP** — it's used for most building areas (Celestial Tower, Pokémon Tower …) and for PvP matchmaking battles.

## 1.1.0 (2026-11-18)
- Library: Pixel battle grounds (set) by Haqzo — 15 pixel-art grounds with 3D grass, rocks and snow; each of the 34 platform slots gets the matching ground. Tested in PokeMMO.
- Battle backgrounds: MaToRiuKo's new set for the current game version replaces the older scenes (which were offset): 13 scenes — Elite Four Ghost / Dark / Fighting / Psychic rooms, Champion Alder's room, N's Castle & Reshiram, Distortion World & Giratina, Groudon lava cave, Forest with Celebi & Mew, Undersea Temple & Lugia, Pokémon Champion arena (with and without mirror floor), PWT — with his in-game screenshots as pictures, and one set that puts them on their battle types. The library download is 10 MB smaller.
- Surf: Nyan Cat now comes with its own rainbow water splash.
- Library filter: search by name or creator, and creator buttons, on every library tab and in battle backgrounds.
- Battle backgrounds: "Make your own background from pictures" — MaToRiuKo's template swap (romtool 1.2.24). Your pictures replace the template's textures (16/256 colours, index 0 transparent); the 3D model is never touched. Two templates: floor + backdrop, or one full picture.
- Your files: map textures (a/0/1/4) — one area from a .BTX0 (area number read from the file name, 282 named areas), or a whole map pack .narc with "Replace the whole archive" (written in place when it is the same size).
- Dev mode (?dev): My items saved in the browser, save current changes as an item, .rpmpack packs to share, and a per-slot battle platform builder.
- Dev mode: **Publish to the library** — one click puts one of My items (Surf, Fly, battle background, platforms, …) into the public library for everyone, through a GitHub token kept in the browser. The site build merges it and renders its preview.
- ROM export: archive entries that keep their size or shrink are written in place, so a .bps only carries what really changed (one map area: ~25 KB instead of ~8 MB).
- Archives from MaToRiuKo's romtool (GMIF size without its 8-byte header) now open — e.g. his 282-area map packs.
- Checked on a real Black ROM: pixel set, template background, one map area and a whole map pack; ROM stays 268,435,456 bytes.

## 1.0.7 (2026-11-18)
- Offline helper always checks the server for app files and the library list, so a normal reload shows updates right away (GitHub Pages lets browsers keep old copies for 10 minutes).

## 1.0.6 (2026-11-18)
- New library items show up on the next reload (the library list is always checked against the server instead of a cached copy).

## 1.0.5 (2026-11-18)
- Library: three more surf models by Haqzo, tested in PokeMMO: Lapras Paddle (Sun/Moon Poké Ride, with saddle), Wailord and Gyarados (X/Y).
- tools/model-pipeline/model2surf.py: one converter for X/Y, Sun/Moon Poké Ride, Platinum and Scarlet/Violet DAEs.

## 1.0.4 (2026-11-17)
- Library: Wailmer surf by Haqzo (first community model, tested in PokeMMO). Community models live in library-src/community and are merged by scripts/add-community.mjs (also during full rebuilds).

## 1.0.3 (2026-11-17)
- Your files: Fly models (Hero_body + joint1 skeleton) switch "Put it into" to Fly automatically; one Fly model is used for take-off and landing.
- Model check: empty parts are blocked; stale header counts and bounding box are fixed on import.
- docs/custom-models.md + tools/model-pipeline: the tested X/Y → CTRMap → PokeMMO workflow (Wailmer surf, Lugia fly).

## 1.0.0 — 17 Nov 2026 (private test build)

Renamed to **Rom Patch Manager**. Published as a website (GitHub Pages) that can be installed as an app (Chrome/Edge) and works offline. Browser-only: the Electron desktop shell was dropped; `Rom Patch Manager.bat` / `start.sh` open it in its own window.

A rewrite of the editor around MaToRiuKo's original idea: raw files, any ROM, one click to export.

### What changed compared to the Patch Manager / "Lightweight" builds
- **No clean-ROM requirement and no ROM allow-list.** Any Black/White ROM opens, including already-patched ones. Files are located through the ROM's own file name table, so Spanish, English and other languages use the same code.
- **No BPS library.** 1,184 language-specific BPS files are replaced by 127 raw files (28 MB). BPS patches are generated on demand against the exact ROM you opened.
- **Complete features only.**
  - *Legendary Fly — Rayquaza (complete)* is one bundle of all 11 entries: 58/60, 66/67, 103/104, 107/108, 111/112 and #118. The six fragments are no longer selectable on their own. #118 was checked: in the clean ROM it is `cave_ci` (the cave cut-in effect model). The original Legendary patch replaces it with a Rayquaza model, so it stays in the bundle.
  - *Mega Charizard Y* Fly: 10 entries (take-off/landing models + animations, male/female/Champion).
  - *Xianxia Flying Sword* Fly: 5 model entries. It keeps the game's own Fly animations, exactly like MaToRiuKo's `a115`.
  - The files in MaToRiuKo's `Fly Models/Xianxia Flying Sword/in` and `/out` folders are byte-identical to his **Mega Charizard Y** members 58/60/66/67. They're labelled as Mega Charizard Y now.
  - Battle scenes keep model + animation together. A "model only" mode is available.
  - Ace's Striker surf boats bring their own water effect (`a/0/7/5 #54`). No other Surf model touches anything except #49.
  - Mini Merry II Surf and MaToRiuKo's battle-background collection (which came from the same old patch) are separate.
- **Battle backgrounds per battle type** (25 types from MaToRiuKo's A011 table) instead of whole packs, plus one-click sets. Slots 1_58 and 1_60 show MaToRiuKo's warning about missing animations since PokeMMO's battle-camera update.
- **TM/HM vs Fly backgrounds identified:** `a/1/1/5 #25` is `poke_ci2` (field-move cut-in) and `#59` is `fly_bg`. MaToRiuKo's own clean version replaces both. The two community "Clean TM/HM" versions replace only #25.
- New **"Your files"** tab: raw import to Surf / battle types / all platforms / Fly / any archive entry, plus batch import of a whole exported archive with a per-entry diff against your ROM.
- New **viewer**: 4 views, free rotation, animation, compare with ROM, load animation, export raw model.
- **"In this ROM now"** scan, with small renders of each battle type's current background.
- English / 简体中文 / Español UI.

### Library sources
- MaToRiuKo's `1.zip` (Surf models, Fly folders, battle backgrounds, transparent discs, title screen `a160`), `Universal custom.zip` and `transparent battle background.nsbmd`.
- The converted per-slot library (English Black, CRC 4F6E5580) was replayed on the clean ROM with `scripts/extract-raw.mjs`. Only entries stored completely in each patch were kept (all "exact source"). This produced the Gen 6 scenes, MaToRiuKo's battle collection, Legendary Fly, Ace boats and monuments, title showcase, No Battle Ground and the Clean TM/HM backgrounds.
- MaToRiuKo's older full-ROM BPS files (source CRC `E2BEE619`, not a clean dump) could only be recovered partially, so they were **not** used.

### Not verified yet
- Nothing has been tested in PokeMMO itself. All checks are offline: structure, byte comparisons, BPS round trip, previews.
- Battle types 36–39 and 68 are unnamed in MaToRiuKo's table and show as "unconfirmed". A "PvP" battle type has not been identified yet.
- Gen 6 extra graphics (`a/2/3/0` #33/38/41/43/56) and MaToRiuKo-collection extras (#42/46/57/58/62) are applied with their set. Their exact purpose isn't identified.

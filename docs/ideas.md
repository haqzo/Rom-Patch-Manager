# Ideas for later

## Install counter on each library item (Haqzo, 18 Nov 2026)
Show "installed 123×" on every card. Count +1 per item when someone presses Save new ROM / Save patch
(not on clicks or previews), so the number means real installs.

The site is static (GitHub Pages), so the count needs a small outside service:
- **Cloudflare Worker + KV** (free tier): `POST /hit {ids:[…]}` and `GET /counts`. Our own, no tracking, ~30 lines.
  Needs a Cloudflare account and adding its address to `connect-src` in app/index.html.
- **A free counter API** (e.g. Abacus): no server of our own, but depends on someone else's service staying up.
Only item ids are sent: no ROM data, no personal data, no cookies. Say so in About. Cache counts for a few minutes,
and allow turning it off. Rate-limit per item per browser so reloads can't inflate numbers.
Optional: sort the library by "most installed".

## Coloured TM/HM (and Fly cut-in) band (Haqzo, 18 Nov 2026)
The TM/HM background is a band model, a/1/1/5 #25: textures `poke_line` (128×64, 256-colour palette) + `poke_line_a`
(8×8 alpha). MaToRiuKo's "clean" files keep the model and make the texture fully transparent; the community
`hm-clean` file (a8a03ad276439802.nsbmd) still has the original blue streaks, so it's the base to recolour.
Plan: preset colours (Crimson, Ember, Gold, Emerald, Amethyst, Sakura, Graphite, OLED black, Rainbow, …) as library
items + a "custom colour" picker (and maybe your own 128×64 picture) built in the browser. Recolour = same-size
texture rewrite (palette, or pixels+palette like bgtemplate.js), geometry untouched. Keep the white streaks bright in
dark colours (only shift the band, not the highlights). Fly cut-in (#59, `BG_line` 128×32) the same way, but we
need its original texture first (MaToRiuKo's #59 is transparent). Test one colour in PokeMMO before shipping a set.
Mockup: screenshots/ideas/tmhm-band-colour-mockup.png
Haqzo's feedback: likes the colours + Rainbow, NOT Graphite / OLED black. Wants real designed bands that look good when
the Pokémon flies through: borders/frames, patterns. Designs must tile seamlessly left↔right (the band likely scrolls).
Concepts: screenshots/ideas/tmhm-band-designs-mockup.png (hero band with gold rims, crimson comic, amethyst chevrons,
sunset sparkle, starry night, emerald waves, rainbow framed, black & gold). Plus a custom maker in the TM/HM tab.
Haqzo likes these 8 — keep them as the future TM/HM backgrounds. The band moves RIGHT → LEFT in game: flip the
mockups so chevrons point left and streaks have their bright head on the left (tail trailing to the right).

## More games (Haqzo, 18 Nov 2026) — everything PokeMMO uses
Black/White ✅ · Black 2/White 2 (coming to PokeMMO soon) · Platinum · HeartGold/SoulSilver · FireRed · Emerald.

- **Black 2 / White 2 — first.** Same engine and file formats as B/W (Nitro .nsbmd/.nsbca in NARC archives).
  The ROM reader already recognises B2/W2 (rom.js GAMES), but the slots live at other archive numbers. Needs a
  per-game profile (where Surf / Fly / battle backgrounds / platforms / TM-HM / title are) and library items tagged
  with the games they work on. Most B/W mods should carry over once the slots are mapped; test each in PokeMMO.
- **Platinum, HeartGold/SoulSilver — second.** Also DS + Nitro, so loading, previews and export work as they are.
  But Gen 4 builds battles and Surf/Fly differently (battle backgrounds are 2D, not 3D scenes), so the categories
  differ per game. Needs research into which visuals are moddable + MaToRiuKo's notes.
- **FireRed, Emerald — last, basically a separate mode.** GBA ROMs: no file system, no 3D models — graphics are
  4bpp tiles + palettes at fixed offsets. Would need its own reader/writer and a 2D image editor/preview.
  BPS export works for any ROM.
- Ground rules stay: no ROM allow-lists (find files through each game's own structure), one item = one complete
  feature, and the library shows only what fits the opened ROM.
- Ask MaToRiuKo which archives/slots he already knows for B2/W2 and Gen 4.
- Example mods MaToRiuKo said we can use (Haqzo, 18 Nov): "Transparent World Map" for B/W, Platinum, HGSS
  (forum topic 201617) and "Kanto Map Rework" for FireRed (topic 198300). Patch files (not in the repo):
  BlackWhite_Transparent_Worldv1_3 .bps — source 268,435,456 B CRC E2BEE619 (not Haqzo's clean Black 4F6E5580);
  HeartGold_Transparent_World .bps — source 128 MB CRC FFD28F00; Platinum_Transparent_Worldv1.2 .bps — source 128 MB
  CRC 1D8A5220; Kanto_New_Graphics_Beta_0.9a .ups — FireRed 16 MB CRC 84EE4776.
  Their B/W ROM has a different file layout from ours, so the patch can't be read file-by-file without that exact ROM.
  Best: get the raw files (B/W map textures = a/0/1/4, like MaToRiuKo's TransparentMap narc) or apply each patch to
  its matching ROM once and extract the changed files → library items per game.

## Other open items
- Fly: MaToRiuKo's SourceFiles (18 Nov) have newer Rayquaza take-off / landing and Flying Sword landing files
  than the library — ask him whether they're current-version files, then update both Fly sets together.
- Dev mode: unpublish button, checks panel.

# Dev mode

**Built in 1.1.0** (app/dev.js): ?dev on, ?dev=off off. My items (IndexedDB), save current changes, .rpmpack packs, per-slot platform builder.
Publish (1.1.0): My item → Publish → one GitHub commit (files under library-src/community/dev/<id>/ + items.json; battle backgrounds as `scene: true`). pages.yml runs add-community + render-previews --missing before deploying. Token: fine-grained, Contents read/write on haqzo/Rom-Patch-Manager, stored in localStorage `rpm-gh-token`.
Still open: checks panel, unpublish.

## Original plan

Requested by Haqzo, 2026-11-18. **For Haqzo only** (not Mato for now). Build after the pixel battle-grounds set is done.

- Same app, hidden switch (e.g. `?dev`), no separate copy. Not secret: it only adds tools; nothing private on the site.
- Private library in the browser (IndexedDB/OPFS): save imported files as items (name, category, preview).
- Set builder: choose a file per slot (e.g. the 34 battle-ground slots, see `SLOTS` in tools/model-pipeline/make-grounds.py).
- Checks with clear warnings (empty parts, texture format/colours, size vs original) — reuse core/check.js.
- Before/after compare with the ROM's original (viewer already supports part of this).
- Export/import packs (`.rpmpack`, zip of items + files) and "make publish files" for library-src/community.
- Reuse what exists: Your files (incl. Advanced archive/member), archive browser, viewer.

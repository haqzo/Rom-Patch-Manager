#!/usr/bin/env node
/*
 * Merge library-src/community (raw .nsbmd/.nsbca + items.json) into app/library.
 * Files are stored content-hashed like every library file; items with the same id are replaced.
 * build-library.mjs runs this too, so community items survive a full rebuild.
 * usage: node scripts/add-community.mjs   (then: node scripts/render-previews.mjs <id>)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as rom from '../app/core/rom.js';
import { checkModel } from '../app/core/check.js';
import * as TEMPLATE from '../app/core/bgtemplate.js';
import { modelHeader, PLATFORM_PATH, validMember } from '../app/core/platforms.js';
import { applyEdits, validateEdits } from '../app/core/edits.js';

const SRC = 'library-src/community', OUT = 'app/library';
const EXT = { BMD0: 'nsbmd', BCA0: 'nsbca' };

export function addCommunity(lib, out = OUT) {
  const defs = JSON.parse(fs.readFileSync(path.join(SRC, 'items.json'), 'utf8'));
  const put = (name) => {
    const b = new Uint8Array(fs.readFileSync(path.join(SRC, name)));
    const m = rom.magic(b);
    if (m === 'BMD0') { const c = checkModel(b); if (c.errors.length) throw new Error(`${name}: ${JSON.stringify(c.errors)}`); }
    const h = crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
    const file = `${h}.${EXT[m] || 'bin'}`;
    const p = path.join(out, 'files', file);
    if (!fs.existsSync(p)) fs.writeFileSync(p, b);
    lib.files[file] = rom.fingerprint(b);
    return file;
  };
  for (const d of defs) {
    if (d.scene) { // a battle background scene (model + optional animation) published from dev mode
      const sc = { id: d.id, name: d.name, by: d.by, model: put(d.model), ...(d.anim ? { anim: put(d.anim) } : {}), ...(d.modelOnly ? { modelOnly: true } : {}), ...(d.desc ? { desc: d.desc } : {}), sources: [d.model, d.anim].filter(Boolean).map((f) => `community/${f}`) };
      const i = lib.battle.scenes.findIndex((x) => x.id === d.id);
      if (i >= 0) lib.battle.scenes[i] = sc; else lib.battle.scenes.push(sc);
      continue;
    }
    const map = {};
    const f = (n) => (map[n] ??= put(n));
    const item = { ...d, writes: d.writes.map((w) => ({ ...w, file: f(w.file) })), sources: [...new Set(d.writes.map((w) => `community/${w.file}`))] };
    if (d.view) item.view = { ...d.view, model: f(d.view.model), ...(d.view.anim ? { anim: f(d.view.anim) } : {}) };
    const i = lib.items.findIndex((x) => x.id === d.id);
    if (i >= 0) lib.items[i] = item; else lib.items.push(item);
  }
  // battle-background templates (MaToRiuKo's template swap): only the textures get replaced
  const tp = path.join(SRC, 'templates.json');
  if (fs.existsSync(tp)) {
    const { parseTemplate } = TEMPLATE;
    lib.templates = JSON.parse(fs.readFileSync(tp, 'utf8')).map((d) => {
      const file = put(d.file);
      const T = parseTemplate(new Uint8Array(fs.readFileSync(path.join(SRC, d.file))));
      const slots = d.slots.map((s) => { const x = T.textures.find((q) => q.name === s.tex); if (!x) throw new Error(`${d.id}: no texture ${s.tex}`); return { ...s, width: x.width, height: x.height, colors: x.bpp === 8 ? 256 : 16 }; });
      return { ...d, file, slots };
    });
  }
  // items taken out of the library (see renames.json "remove"); their files are pruned below
  const rmp = path.join(SRC, 'renames.json');
  if (fs.existsSync(rmp)) { const rm = JSON.parse(fs.readFileSync(rmp, 'utf8')).remove || []; lib.items = lib.items.filter((x) => !rm.includes(x.id)); }
  // battle backgrounds: battle.json replaces the scene list and the sets (MaToRiuKo's current-version set)
  const bp = path.join(SRC, 'battle.json');
  if (fs.existsSync(bp)) {
    const B = JSON.parse(fs.readFileSync(bp, 'utf8'));
    const keep = lib.battle.scenes.filter((x) => (B.keep || []).includes(x.id));
    const fresh = B.scenes.map((d) => {
      if (d.preview) { // MaToRiuKo's in-game screenshot as the library picture
        const src = path.join(SRC, 'previews', d.id + '.jpg');
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, 'previews', d.id + '.jpg'));
      }
      return { id: d.id, name: d.name, by: d.by, model: put(d.model), ...(d.anim ? { anim: put(d.anim) } : {}), ...(d.modelOnly ? { modelOnly: true } : {}), ...(d.native ? { native: d.native } : {}), ...(d.desc ? { desc: d.desc } : {}), sources: [d.model, d.anim].filter(Boolean).map((f) => `community/${f}`) };
    });
    // scenes published from dev mode (already in lib.battle.scenes, from items.json) stay too
    const devScenes = lib.battle.scenes.filter((x) => defs.some((d) => d.scene && d.id === x.id) && !fresh.some((f) => f.id === x.id));
    lib.battle.scenes = [...fresh, ...keep, ...devScenes];
    lib.battle.sets = B.sets.map((st) => ({ id: st.id, name: st.name, by: st.by, extras: st.extras || [],
      assign: st.fromNative ? Object.fromEntries(fresh.flatMap((sc) => (sc.native || []).map((m) => [String(m), sc.id]))) : st.assign }));
  }
  // name fixes (e.g. MaToRiuKo's renames)
  const rp = path.join(SRC, 'renames.json');
  if (fs.existsSync(rp)) {
    const R = JSON.parse(fs.readFileSync(rp, 'utf8'));
    for (const [id, name] of Object.entries(R.items || {})) { const it = lib.items.find((x) => x.id === id); if (it) it.name = name; }
    for (const [m, name] of Object.entries(R.slots || {})) { const sl = lib.battle.slots.find((x) => x.model === +m); if (sl) sl.name = name; }
  }
  const pp = path.join(SRC, 'platforms.json');
  if (fs.existsSync(pp)) {
    const P = JSON.parse(fs.readFileSync(pp, 'utf8'));
    if (P.version !== 1) throw new Error('Unsupported platform library schema');
    lib.platforms = { version: 1, groups: {}, slots: {}, models: P.models.map(m => {
      const file = m.file?.startsWith('lib:') ? m.file.slice(4) : m.file ? put(m.file) : null;
      return { ...m, ...(file ? { file } : {}) };
    }) };
  }
  // dev-mode edits (edits.json): item / scene / category edits, archive + remove, order, previews, presets
  const ep = path.join(SRC, 'edits.json');
  if (fs.existsSync(ep)) {
    const E = JSON.parse(fs.readFileSync(ep, 'utf8'));
    const resolve = (ref) => {
      if (ref.startsWith('lib:')) { const f = ref.slice(4); if (!lib.files[f] && !fs.existsSync(path.join(out, 'files', f))) throw new Error(`edits.json: library file ${f} is missing`); return f; }
      return put(ref);
    };
    const problems = validateEdits(lib, E, (ref) => (ref.startsWith('lib:') ? !!lib.files[ref.slice(4)] : fs.existsSync(path.join(SRC, ref)))).filter((x) => x.level === 'error');
    if (problems.length) throw new Error('edits.json:\n  ' + problems.map((x) => x.msg).join('\n  '));
    applyEdits(lib, E, resolve);
    for (const [id, ref] of Object.entries(E.previews || {})) fs.copyFileSync(path.join(SRC, ref), path.join(out, 'previews', id + '.jpg'));
  }
  // Validate required platform models independently of the optional preview job.
  const modelIds = new Set();
  const usedPlatform = new Set();
  for (const item of lib.items.filter(item => item.cat === 'platforms')) {
    const members = new Set();
    for (const w of item.writes) {
      if (w.path !== PLATFORM_PATH || !validMember(w.member) || members.has(w.member)) throw new Error(`Invalid platform set ${item.id}`);
      members.add(w.member);
      usedPlatform.add(w.file);
    }
  }
  for (const m of lib.platforms?.models || []) {
    if (modelIds.has(m.id) || (!!m.file === !!m.set)) throw new Error(`Invalid platform model ${m.id}`);
    modelIds.add(m.id);
    if (m.file) usedPlatform.add(m.file);
    if (m.set && !lib.items.some(it => it.id === m.set && it.cat === 'platforms')) throw new Error(`Missing platform set ${m.set}`);
  }
  for (const f of usedPlatform) {
    if (path.basename(f) !== f || !lib.files[f]) throw new Error(`Missing required platform file ${f}`);
    const data = new Uint8Array(fs.readFileSync(path.join(out, 'files', f)));
    if (!modelHeader(data) || checkModel(data).errors.length || lib.files[f] !== rom.fingerprint(data))
      throw new Error(`Invalid platform NSBMD ${f}`);
  }
  // only ship files something still uses
  const used = new Set(usedPlatform);
  for (const it of lib.items) { it.writes.forEach((w) => used.add(w.file)); if (it.view) { used.add(it.view.model); if (it.view.anim) used.add(it.view.anim); } }
  for (const sc of lib.battle.scenes) { used.add(sc.model); if (sc.anim) used.add(sc.anim); }
  for (const st of lib.battle.sets) st.extras.forEach((w) => used.add(w.file));
  for (const t of lib.templates || []) used.add(t.file);
  for (const f of Object.keys(lib.files)) if (!used.has(f)) { delete lib.files[f]; fs.rmSync(path.join(out, 'files', f), { force: true }); }
  // previews of scenes that are gone
  const ids = new Set([...lib.items.map((x) => x.id), ...lib.battle.scenes.map((x) => x.id), ...(lib.platforms?.models || []).filter(m => !m.empty).map(m => m.id)]);
  for (const f of fs.readdirSync(path.join(out, 'previews'))) if (f.endsWith('.jpg') && !ids.has(f.slice(0, -4))) fs.rmSync(path.join(out, 'previews', f));
  lib.thumbs = fs.readdirSync(path.join(out, 'previews')).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4)).sort();
  lib.files = Object.fromEntries(Object.entries(lib.files).sort());
  return defs.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const p = path.join(OUT, 'library.json');
  const lib = JSON.parse(fs.readFileSync(p, 'utf8'));
  const n = addCommunity(lib);
  fs.writeFileSync(p, JSON.stringify(lib, null, 1));
  console.log(`community items merged: ${n}`);
}

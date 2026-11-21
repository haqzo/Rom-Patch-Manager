/* Dev-mode library edits: applyEdits / validateEdits / mergeEdits and the site build (add-community) with edits.json. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { applyEdits, validateEdits, describeEdits, EMPTY_EDITS } from '../app/core/edits.js';
import { mergeEdits } from '../app/dev-library.js';

const LIB = JSON.parse(fs.readFileSync('app/library/library.json', 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const res = (ref) => (ref.startsWith('lib:') ? ref.slice(4) : 'draft:' + ref);
const anyFile = Object.keys(LIB.files).find((f) => f.endsWith('.nsbmd'));
const surf = LIB.items.filter((x) => x.cat === 'surf');

test('empty edits change nothing', () => {
  const a = applyEdits(clone(LIB), EMPTY_EDITS(), res);
  assert.deepEqual(a.items, LIB.items);
  assert.deepEqual(a.battle, LIB.battle);
  assert.deepEqual(a.categories, LIB.categories);
  assert.deepEqual(a.presets, []);
});

test('rename, describe, recredit, archive, reorder, remove', () => {
  const [a, b, c] = surf;
  const E = { ...EMPTY_EDITS(), items: { [a.id]: { name: { en: 'Renamed' }, by: 'X', desc: { en: 'D' } }, [b.id]: { archived: true } }, remove: [c.id], order: { surf: [b.id, a.id] } };
  const L = applyEdits(clone(LIB), E, res);
  const s = L.items.filter((x) => x.cat === 'surf');
  assert.equal(s[0].id, b.id); assert.equal(s[1].id, a.id);
  assert.equal(s[1].name.en, 'Renamed'); assert.equal(s[1].by, 'X'); assert.equal(s[1].desc.en, 'D');
  assert.equal(s[0].archived, true);
  assert.ok(!L.items.some((x) => x.id === c.id));
  // other categories keep their place and order
  assert.deepEqual(L.items.filter((x) => x.cat !== 'surf').map((x) => x.id), LIB.items.filter((x) => x.cat !== 'surf' && x.id !== c.id).map((x) => x.id));
  // restoring is explicit
  const R = applyEdits(L, { ...E, items: { [b.id]: { archived: false } }, remove: [], order: {} }, res);
  assert.ok(!R.items.find((x) => x.id === b.id).archived);
});

test('new item in a new generic category, with a new file and a library file', () => {
  const E = { ...EMPTY_EDITS(), categories: { effects: { name: { en: 'Effects' }, path: 'a/1/5/7', members: [3], accepts: ['BMD0'] } },
    items: { 'fx-test': { new: true, cat: 'effects', name: { en: 'Test' }, by: 'Haqzo', writes: [{ path: 'a/1/5/7', member: 3, file: 'dev/abc.nsbmd' }, { path: 'a/1/5/7', member: 4, file: `lib:${anyFile}` }] } },
    categoryOrder: ['effects'] };
  const L = applyEdits(clone(LIB), E, res);
  assert.equal(L.categories[0].id, 'effects'); assert.equal(L.categories[0].pick, 'one');
  const it = L.items.find((x) => x.id === 'fx-test');
  assert.deepEqual(it.writes.map((w) => w.file), ['draft:dev/abc.nsbmd', anyFile]);
  assert.equal(it.view.model, 'draft:dev/abc.nsbmd');
  const ok = validateEdits(LIB, E, (r) => r.startsWith('lib:') ? !!LIB.files[r.slice(4)] : r === 'dev/abc.nsbmd');
  assert.deepEqual(ok.filter((x) => x.level === 'error'), []);
  const bad = validateEdits(LIB, E, (r) => r.startsWith('lib:'));
  assert.ok(bad.some((x) => /missing/.test(x.msg)));
});

test('battle scenes: edit, new, model only, archive; presets and their checks', () => {
  const sc = LIB.battle.scenes[0];
  const E = { ...EMPTY_EDITS(), scenes: { [sc.id]: { name: { en: 'Scene!' }, native: [70] }, 'bg-new': { new: true, name: { en: 'New' }, by: 'YOKA', model: 'dev/m.nsbmd', anim: null } },
    presets: [{ id: 'p1', name: { en: 'P' }, items: { surf: surf[0].id }, battle: { 70: { scene: 'bg-new', mode: 'model' } } }] };
  const L = applyEdits(clone(LIB), E, res);
  assert.equal(L.battle.scenes[0].name.en, 'Scene!');
  const n = L.battle.scenes.find((x) => x.id === 'bg-new');
  assert.equal(n.model, 'draft:dev/m.nsbmd'); assert.ok(n.modelOnly && !n.anim);
  assert.equal(L.presets[0].battle[70].scene, 'bg-new');
  assert.deepEqual(validateEdits(LIB, E, () => true).filter((x) => x.level === 'error'), []);
  const broken = { ...E, remove: ['bg-new'] };
  assert.ok(validateEdits(LIB, broken, () => true).some((x) => /still uses/.test(x.msg)));
  const badPreset = { ...EMPTY_EDITS(), presets: [{ id: 'p', name: { en: 'x' }, items: { surf: 'nope' } }] };
  assert.ok(validateEdits(LIB, badPreset, () => true).some((x) => /doesn't exist/.test(x.msg)));
  assert.ok(describeEdits(EMPTY_EDITS(), E).length >= 3);
});

test('3-way merge keeps both people\'s changes', () => {
  const base = { ...EMPTY_EDITS(), items: { a: { by: 'old' } } };
  const mine = { ...EMPTY_EDITS(), items: { a: { by: 'old' }, b: { name: { en: 'mine' } } }, remove: ['z'], presets: [{ id: 'p', name: { en: 'mine' } }] };
  const remote = { ...EMPTY_EDITS(), items: { a: { by: 'theirs' }, c: { name: { en: 'theirs' } } }, presets: [{ id: 'q', name: { en: 'theirs' } }] };
  const m = mergeEdits(base, mine, remote);
  assert.equal(m.items.a.by, 'theirs'); assert.ok(m.items.b && m.items.c);
  assert.deepEqual(m.remove, ['z']);
  assert.deepEqual(m.presets.map((p) => p.id).sort(), ['p', 'q']);
});

test('site build applies edits.json (rename, archive, preview, preset) and stays repeatable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-edits-'));
  for (const d of ['app/library', 'library-src/community', 'app/core', 'scripts']) fs.cpSync(d, path.join(dir, d), { recursive: true });
  const a = surf[0], b = surf[1];
  const jpg = fs.readdirSync('app/library/previews').find((f) => f.endsWith('.jpg'));
  fs.mkdirSync(path.join(dir, 'library-src/community/dev/previews'), { recursive: true });
  fs.copyFileSync(path.join('app/library/previews', jpg), path.join(dir, 'library-src/community/dev/previews/x.jpg'));
  const E = { ...EMPTY_EDITS(), items: { [a.id]: { name: { en: 'Built rename' } }, [b.id]: { archived: true } }, previews: { [a.id]: 'dev/previews/x.jpg' },
    presets: [{ id: 'p1', name: { en: 'Preset' }, items: { surf: a.id } }] };
  fs.writeFileSync(path.join(dir, 'library-src/community/edits.json'), JSON.stringify(E));
  const run = () => { execFileSync('node', ['scripts/add-community.mjs'], { cwd: dir, stdio: 'pipe' }); return JSON.parse(fs.readFileSync(path.join(dir, 'app/library/library.json'), 'utf8')); };
  const L1 = run(), L2 = run();
  assert.equal(L1.items.find((x) => x.id === a.id).name.en, 'Built rename');
  assert.equal(L1.items.find((x) => x.id === b.id).archived, true);
  assert.ok(fs.existsSync(path.join(dir, 'app/library/files', b.writes[0].file)), 'archived items keep their files');
  assert.equal(L1.presets[0].id, 'p1');
  assert.ok(L1.thumbs.includes(a.id));
  assert.deepEqual(L2.items, L1.items, 'running the build twice gives the same library');
  // a broken edits.json stops the build with a clear message
  fs.writeFileSync(path.join(dir, 'library-src/community/edits.json'), JSON.stringify({ ...EMPTY_EDITS(), presets: [{ id: 'x', name: { en: 'x' }, items: { surf: 'missing-item' } }] }));
  assert.throws(() => execFileSync('node', ['scripts/add-community.mjs'], { cwd: dir, stdio: 'pipe' }), /doesn't exist/);
  fs.rmSync(dir, { recursive: true, force: true });
});

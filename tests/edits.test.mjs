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
    platformModels: { 'platform-test': { file: `lib:${LIB.platforms.models[0].file}`,
      name: { en: 'Test', zh: '测试', es: 'Prueba' }, by: 'Test', members: [0] } },
    platformSlots: { 0: { name: { en: 'Test slot', zh: '测试位置', es: 'Espacio de prueba' },
      status: 'unconfirmed', suggested: 'platform-test' } },
    presets: [{ id: 'p1', name: { en: 'Preset' }, items: { surf: a.id },
      platforms: { 0: { kind: 'model', id: 'platform-test' }, 1: { kind: 'stock' }, 2: { kind: 'keep' } } }] };
  fs.writeFileSync(path.join(dir, 'library-src/community/edits.json'), JSON.stringify(E));
  const run = () => { execFileSync('node', ['scripts/add-community.mjs'], { cwd: dir, stdio: 'pipe' }); return JSON.parse(fs.readFileSync(path.join(dir, 'app/library/library.json'), 'utf8')); };
  const L1 = run(), L2 = run();
  assert.equal(L1.items.find((x) => x.id === a.id).name.en, 'Built rename');
  assert.equal(L1.items.find((x) => x.id === b.id).archived, true);
  assert.ok(fs.existsSync(path.join(dir, 'app/library/files', b.writes[0].file)), 'archived items keep their files');
  assert.equal(L1.presets[0].id, 'p1');
  assert.ok(L1.thumbs.includes(a.id));
  assert.deepEqual(L2, L1, 'running the build twice gives the same library');
  assert.equal(L1.platforms.models.find(m => m.id === 'platform-test').file, LIB.platforms.models[0].file);
  assert.deepEqual(L1.presets[0].platforms, E.presets[0].platforms);
  const changedModel = L1.platforms.models.find(m => m.id === 'platform-pixel-green-grass');
  E.platformModels[changedModel.id] = { file: `lib:${L1.platforms.models.find(m => m.id === 'platform-pixel-snow').file}` };
  const jpgPath = path.join(dir, 'app/library/previews', changedModel.id + '.jpg');
  assert.ok(fs.existsSync(jpgPath));
  fs.writeFileSync(path.join(dir, 'library-src/community/edits.json'), JSON.stringify(E));
  assert.ok(!run().thumbs.includes(changedModel.id));
  assert.ok(!fs.existsSync(jpgPath));

  // a broken edits.json stops the build with a clear message
  fs.writeFileSync(path.join(dir, 'library-src/community/edits.json'), JSON.stringify({ ...EMPTY_EDITS(), presets: [{ id: 'x', name: { en: 'x' }, items: { surf: 'missing-item' } }] }));
  assert.throws(() => execFileSync('node', ['scripts/add-community.mjs'], { cwd: dir, stdio: 'pipe' }), /doesn't exist/);
  fs.writeFileSync(path.join(dir, 'library-src/community/edits.json'), JSON.stringify({
    ...EMPTY_EDITS(), platformModels: { 'platform-missing': { file: 'dev/missing.nsbmd',
      name: { en: 'Missing', zh: '缺失', es: 'Falta' }, by: 'Test' } } }));
  assert.throws(() => execFileSync('node', ['scripts/add-community.mjs'], { cwd: dir, stdio: 'pipe' }), /is missing/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('platform edits preserve numeric mapping and validate localized models and preset references', () => {
  const model = { name: { en: 'Sample', zh: '样例', es: 'Ejemplo' }, by: 'Haqzo', file: `lib:${anyFile}`, members: [3, 4] };
  const E = { ...EMPTY_EDITS(), platformModels: { 'platform-example': model },
    platformGroups: { 1: { name: { en: 'Grassy area', zh: '草地', es: 'Zona de hierba' }, status: 'unconfirmed' } },
    platformSlots: { 3: { suggested: 'platform-example' } },
    presets: [
      { id: 'legacy', name: { en: 'Legacy' }, items: { platforms: 'disc-pixel-set' } },
      { id: 'mixed', name: { en: 'Mixed' }, items: { platforms: 'disc-pixel-set' },
        platforms: { 0: { kind: 'keep' }, 3: { kind: 'model', id: 'platform-example' }, 33: { kind: 'stock' } } },
    ] };
  const validate = edits => validateEdits(LIB, edits, ref => ref === `lib:${anyFile}`).filter(x => x.level === 'error');
  assert.deepEqual(validate(E), []);
  let lib = applyEdits(clone(LIB), JSON.parse(JSON.stringify(E)), res);
  assert.equal(lib.platforms.groups[1].name.zh, '草地');
  assert.equal(lib.platforms.models.at(-1).file, anyFile);
  assert.deepEqual(lib.presets[1].platforms, E.presets[1].platforms);
  assert.ok(!Object.hasOwn(lib.presets[0], 'platforms'));
  assert.deepEqual(mergeEdits(EMPTY_EDITS(), E, { platformSlots: { 9: { status: 'unconfirmed' } } }).platformSlots,
    { 3: E.platformSlots[3], 9: { status: 'unconfirmed' } });
  const invalid = clone(E);
  invalid.platformGroups[1].members = [3, 4];
  invalid.platformSlots[3].status = 'verified';
  invalid.presets[1].platforms[34] = { kind: 'model', id: 'platform-example' };
  invalid.presets[1].platforms[33].bytes = 'private donor bytes';
  invalid.remove = ['platform-example'];
  const failures = validate(invalid).map(x => x.msg).join('\n');
  for (const msg of ['group', 'metadata', '#34', 'library references', '#3']) assert.match(failures, new RegExp(msg));
  assert.deepEqual(lib.items, LIB.items);
});

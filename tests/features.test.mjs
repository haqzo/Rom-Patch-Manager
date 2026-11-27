/*
 * Feature checks on a small synthetic ROM (no game data): pixel battle-ground set,
 * MaToRiuKo's template backgrounds, map packages (whole archive / one area).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as rom from '../app/core/rom.js';
import { changesFor, overlaps, sizeGrowth, scanInstalled } from '../app/core/plan.js';
import { buildFromTemplate, parseTemplate, checkSize, nearestLegal, indexImage } from '../app/core/bgtemplate.js';
import { checkModel } from '../app/core/check.js';
import { GROUPS, SLOT, MEMBERS, PLATFORM_PATH, LOOKUP_PATH, inspectPlatforms, donorCompatible, modelFile,
  platformAssignments, platformProblems } from '../app/core/platforms.js';

const LIB = JSON.parse(fs.readFileSync('app/library/library.json', 'utf8'));
const getFile = (n) => new Uint8Array(fs.readFileSync(path.join('app/library/files', n)));

const NARC_HEAD = (() => { const h = new Uint8Array(16); h.set([0x4E, 0x41, 0x52, 0x43, 0xFE, 0xFF, 0x00, 0x01]); rom.w16(h, 0x0C, 16); rom.w16(h, 0x0E, 3); return h; })();
const BTNF = (() => { const b = new Uint8Array(16); b.set([0x42, 0x54, 0x4E, 0x46]); rom.w32(b, 4, 16); rom.w32(b, 8, 4); rom.w16(b, 12, 0); rom.w16(b, 14, 1); return b; })();
const narc = (members) => rom.buildNarc({ hs: 16, head: NARC_HEAD, btnf: BTNF }, members);
const blob = (n, seed) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + seed * 7) & 255; return b; };

/** A synthetic NDS with unrelated members, maps and a generated platform lookup table. */
function fakeRom({ alterStage = false, invalidMember = -1 } = {}) {
  const replacement = getFile(LIB.platforms.models.find(m => m.id === 'platform-pixel-wood').file);
  const stage = new Uint8Array(1700).fill(255);
  for (const [group, members] of GROUPS.entries()) {
    rom.w32(stage, group * 68, 0);
    members.forEach((m, variant) => rom.w32(stage, group * 68 + 4 + 4 * variant, m));
  }
  if (alterStage) rom.w32(stage, 4, 1);
  const files = [
    narc(Array.from({ length: 222 }, (_, i) => i < 34 && i !== invalidMember ? replacement : blob(64 + i, i))),
    narc(Array.from({ length: 282 }, (_, i) => blob(96, 1000 + i))),
    narc([new Uint8Array(684), new Uint8Array(1280), stage]),
  ];
  // FNT: root -> a -> 0/1 with files "1","4"; a -> 1/5 with file "2".
  const sub = [
    [0x81, 0x61, 1, 0xF0, 0], [0x81, 0x30, 2, 0xF0, 0x81, 0x31, 4, 0xF0, 0],
    [0x81, 0x31, 3, 0xF0, 0], [1, 0x31, 1, 0x34, 0], [0x81, 0x35, 5, 0xF0, 0], [1, 0x32, 0],
  ];
  const fntHead = sub.length * 8;
  const fnt = new Uint8Array(fntHead + sub.reduce((n, x) => n + x.length, 0));
  let p = fntHead;
  sub.forEach((sb, i) => {
    rom.w32(fnt, i * 8, p);
    rom.w16(fnt, i * 8 + 4, i === 5 ? 2 : 0);
    rom.w16(fnt, i * 8 + 6, [sub.length, 0xF000, 0xF001, 0xF002, 0xF001, 0xF004][i]);
    fnt.set(sb, p);
    p += sb.length;
  });
  const fntAt = 0x200, fatAt = rom.align(fntAt + fnt.length, 16);
  p = rom.align(fatAt + 8 * files.length, 512);
  const offsets = files.map(file => { const at = p; p = rom.align(p + file.length, 512); return at; });
  const b = new Uint8Array(p + 0x4000).fill(255);
  b.fill(0, 0, 0x200);
  b.set(new TextEncoder().encode('POKEMON B'), 0);
  b.set(new TextEncoder().encode('IRBO'), 0x0C);
  rom.w32(b, 0x40, fntAt); rom.w32(b, 0x44, fnt.length); rom.w32(b, 0x48, fatAt);
  rom.w32(b, 0x4C, 8 * files.length);
  b.set(fnt, fntAt);
  files.forEach((file, id) => {
    rom.w32(b, fatAt + 8 * id, offsets[id]);
    rom.w32(b, fatAt + 8 * id + 4, offsets[id] + file.length);
    b.set(file, offsets[id]);
  });
  rom.w32(b, 0x80, offsets.at(-1) + files.at(-1).length);
  return b;
}

test('synthetic ROM parses', () => {
  const R = rom.parseRom(fakeRom());
  assert.equal(R.paths.get('a/0/1/1'), 0);
  assert.equal(R.paths.get('a/0/1/4'), 1);
  assert.equal(R.paths.get(LOOKUP_PATH), 2);
});

test('pixel battle-ground set: each of the 34 slots gets its own ground, nothing else changes', () => {
  const src = fakeRom();
  const ch = changesFor({ items: { platforms: 'disc-pixel-set' }, battle: {}, extras: [], custom: [] }, LIB, getFile);
  assert.equal(ch.length, 1);
  assert.equal(ch[0].writes.length, 34);
  const { rom: out } = rom.buildRom(src, ch[0].writes);
  const N0 = rom.parseNarc(rom.readFile(src, rom.parseRom(src), 'a/0/1/1')), N1 = rom.parseNarc(rom.readFile(out, rom.parseRom(out), 'a/0/1/1'));
  const it = LIB.items.find((x) => x.id === 'disc-pixel-set');
  for (let m = 0; m < 222; m++) {
    if (m < 34) assert.ok(rom.bytesEqual(N1.members[m], getFile(it.writes[m].file)), `slot ${m}`);
    else assert.ok(rom.bytesEqual(N1.members[m], N0.members[m]), `member ${m} untouched`);
  }
  assert.equal(new Set(it.writes.map((w) => w.file)).size, 15, '15 different grounds');
  for (const f of new Set(it.writes.map((w) => w.file))) assert.deepEqual(checkModel(getFile(f)).errors, []);
});

test('template backgrounds: rebuilt model is valid and only the chosen slots change', () => {
  for (const tp of LIB.templates) {
    const tpl = getFile(tp.file);
    const sl = tp.slots[0];
    const img = { width: sl.width / 2, height: sl.height / 2, rgba: new Uint8Array((sl.width / 2) * (sl.height / 2) * 4) };
    for (let i = 0; i < img.width * img.height; i++) img.rgba.set([(i * 13) & 255, (i >> 3) & 255, 128, 255], i * 4);
    const model = buildFromTemplate(tpl, { [sl.tex]: img });
    assert.deepEqual(checkModel(model).errors, [], tp.id);
    assert.ok(rom.bytesEqual(parseTemplate(model).mdl0.subarray(8), parseTemplate(tpl).mdl0.subarray(8)), 'geometry untouched');
    const t = parseTemplate(model).textures.find((x) => x.name === sl.tex);
    assert.equal(t.width, img.width, 'declared size follows the picture');
    const src = fakeRom();
    const { rom: out } = rom.buildRom(src, [34, 36].map((m) => ({ path: 'a/0/1/1', member: m, data: model })));
    const N0 = rom.parseNarc(rom.readFile(src, rom.parseRom(src), 'a/0/1/1')), N1 = rom.parseNarc(rom.readFile(out, rom.parseRom(out), 'a/0/1/1'));
    for (let m = 0; m < 222; m++) assert.equal(rom.bytesEqual(N1.members[m], [34, 36].includes(m) ? model : N0.members[m]), true, `member ${m}`);
  }
  assert.equal(checkSize(512, 512, 700, 700).reason, 'tooBig');
  assert.deepEqual(nearestLegal(512, 512, 300, 300), { width: 256, height: 256 });
  const g = { width: 64, height: 64, rgba: new Uint8Array(64 * 64 * 4) };
  for (let i = 0; i < 4096; i++) g.rgba.set([i & 255, (i >> 4) & 255, (i * 3) & 255, i % 97 === 0 ? 0 : 255], i * 4);
  const q = indexImage(g, 16);
  for (let i = 0; i < 4096; i++) assert.equal(q.idx[i] === 0, i % 97 === 0, 'index 0 only for transparent pixels');
});

test('map pack, whole archive, same size: written in place, ROM size and FAT unchanged', () => {
  const src = fakeRom(), R = rom.parseRom(src);
  const old = rom.parseNarc(rom.readFile(src, R, 'a/0/1/4'));
  const members = old.members.map((m, i) => (i % 3 ? m : blob(m.length, 5000 + i)));
  const pack = narc(members);
  assert.equal(pack.length, rom.readFile(src, R, 'a/0/1/4').length);
  const { rom: out } = rom.buildRom(src, [{ path: 'a/0/1/4', member: null, data: pack }]);
  assert.equal(out.length, src.length);
  const O = rom.parseRom(out);
  assert.deepEqual(O.files[1], R.files[1], 'FAT record unchanged');
  assert.ok(rom.bytesEqual(rom.readFile(out, O, 'a/0/1/4'), pack));
  const bps = rom.makeBps(src, out);
  assert.ok(rom.bytesEqual(rom.applyBps(bps, src), out));
});

test('map pack, whole archive, other size: moved to free space, other files untouched', () => {
  const src = fakeRom(), R = rom.parseRom(src);
  const pack = narc(Array.from({ length: 282 }, (_, i) => blob(120, 9000 + i)));
  const { rom: out } = rom.buildRom(src, [{ path: 'a/0/1/4', member: null, data: pack }]);
  const O = rom.parseRom(out);
  assert.equal(rom.parseNarc(rom.readFile(out, O, 'a/0/1/4')).members.length, 282);
  assert.ok(rom.bytesEqual(rom.readFile(out, O, 'a/0/1/1'), rom.readFile(src, R, 'a/0/1/1')), 'a/0/1/1 untouched');
});

test('map, one area (same length): only that area changes, file stays in place', () => {
  const src = fakeRom(), R = rom.parseRom(src);
  const area = blob(96, 4242);
  const { rom: out } = rom.buildRom(src, [{ path: 'a/0/1/4', member: 62, data: area }]);
  const O = rom.parseRom(out);
  assert.deepEqual(O.files[1], R.files[1]);
  const N0 = rom.parseNarc(rom.readFile(src, R, 'a/0/1/4')), N1 = rom.parseNarc(rom.readFile(out, O, 'a/0/1/4'));
  for (let i = 0; i < 282; i++) assert.equal(rom.bytesEqual(N1.members[i], i === 62 ? area : N0.members[i]), true, `area ${i}`);
  let diff = 0; for (let i = 0; i < src.length; i++) if (src[i] !== out[i]) diff++;
  assert.ok(diff <= 96 + 64, `small diff (${diff} bytes)`);
});

test('map names: 282 areas in English and Chinese', () => {
  const M = JSON.parse(fs.readFileSync('app/data/mapnames.json', 'utf8'));
  assert.equal(Object.keys(M.en).length, 282);
  assert.equal(Object.keys(M.zh).length, 282);
  assert.match(M.en['62'], /Village Bridge/);
});

test('smaller entry is written in place (small patch), other entries keep their bytes', () => {
  const src = Buffer.from(fakeRom()), R = rom.parseRom(src);
  const original = Buffer.from(src);
  const area = blob(60, 77);
  const { rom: out } = rom.buildRom(src, [{ path: 'a/0/1/4', member: 10, data: area }]);
  const O = rom.parseRom(out);
  assert.deepEqual(O.files[1], R.files[1]);
  const N0 = rom.parseNarc(rom.readFile(src, R, 'a/0/1/4')), N1 = rom.parseNarc(rom.readFile(out, O, 'a/0/1/4'));
  for (let i = 0; i < 282; i++) assert.equal(rom.bytesEqual(N1.members[i], i === 10 ? area : N0.members[i]), true, `area ${i}`);
  let diff = 0; for (let i = 0; i < src.length; i++) if (src[i] !== out[i]) diff++;
  assert.ok(diff <= 96 + 8, `small diff (${diff} bytes)`);
  assert.deepEqual(src, original, 'same-size write leaves Buffer sources intact');
});

test('archives whose GMIF size leaves out its 8-byte header still open (MaToRiuKo romtool packs)', () => {
  const n = narc([blob(40, 1), blob(40, 2)]);
  const g = n.length - (8 + 80); // GMIF header position
  rom.w32(n, g + 4, rom.u32(n, g + 4) - 8);
  const N = rom.parseNarc(n);
  assert.ok(N && N.members.length === 2 && rom.bytesEqual(N.members[1], blob(40, 2)));
});

test("MaToRiuKo's current battle backgrounds: every scene and set file exists and passes the model check", () => {
  const B = LIB.battle;
  assert.ok(B.scenes.length >= 13);
  for (const sc of B.scenes) {
    assert.deepEqual(checkModel(getFile(sc.model)).errors, [], sc.id);
    if (sc.anim) assert.equal(rom.magic(getFile(sc.anim)), 'BCA0', sc.id);
  }
  for (const st of B.sets) for (const [slot, id] of Object.entries(st.assign)) {
    assert.ok(B.slots.some((s) => s.model === +slot), `slot ${slot}`);
    assert.ok(B.scenes.some((s) => s.id === id), `scene ${id}`);
  }
  for (const f of Object.keys(LIB.files)) assert.ok(fs.existsSync(path.join('app/library/files', f)), f);
});

const baseline = () => ({ items: {}, battle: {}, platforms: {}, extras: [], custom: [] });
const transparent = { kind: 'model', id: 'platform-transparent' };
const noGround = { kind: 'model', id: 'platform-no-ground' };
const fps = new Map(Object.entries(LIB.files));

test('all 34 raw members and fallback variants use the expected group mapping', () => {
  const bytes = fakeRom(), R = rom.parseRom(bytes), profile = inspectPlatforms(bytes, R);
  assert.deepEqual(profile.valid, MEMBERS);
  assert.equal(GROUPS.length, 25);
  assert.equal(new Set(GROUPS.flat()).size, 34);
  assert.deepEqual(SLOT[4], { group: 1, variant: 3 });
  assert.deepEqual(SLOT[33], { group: 24, variant: 0 });
  assert.ok(profile.groupSafe && !profile.groupUsed.includes(2));
  for (const options of [{ alterStage: true }, { invalidMember: 0 }]) {
    const input = fakeRom(options), mismatch = inspectPlatforms(input, rom.parseRom(input));
    assert.ok(!mismatch.groupSafe);
    assert.ok(!donorCompatible(profile, mismatch));
    assert.ok(mismatch.valid.includes(33));
  }
  assert.ok(!donorCompatible(profile, { ...profile, code: 'IRAO' }));
  assert.ok(!donorCompatible(profile, { ...profile, revision: 1 }));
});

test('platform models resolve to approved files, with one transparent disc and per-member no-ground models', () => {
  assert.equal(LIB.platforms.models.filter(m => m.id.startsWith('platform-pixel-')).length, 15);
  for (const m of LIB.platforms.models) for (const member of MEMBERS) {
    const file = modelFile(m, member, LIB);
    assert.ok(file && fps.has(file));
    assert.equal(rom.magic(getFile(file)), 'BMD0');
  }
  const t = LIB.platforms.models.find(m => m.id === transparent.id);
  const none = LIB.platforms.models.find(m => m.id === noGround.id);
  assert.equal(modelFile(t, 33, LIB), 'a9c1da5ec48c73f1.nsbmd');
  assert.equal(new Set(MEMBERS.map(m => modelFile(none, m, LIB))).size, 34);
  assert.equal(modelFile(none, 34, LIB), null);
});

test('intentional overrides and keep-current exclusions resolve once before the planner detects accidental overlap', () => {
  const src = fakeRom(), R = rom.parseRom(src), target = inspectPlatforms(src, R);
  const picks = { ...baseline(), items: { platforms: 'disc-pixel-set' },
    platforms: { 1: transparent, 2: { kind: 'keep' }, 4: transparent, 33: noGround } };
  assert.deepEqual(platformProblems(picks, LIB, target, null), []);
  const changes = changesFor(picks, LIB, getFile, { target });
  assert.equal(overlaps(changes).size, 0);
  const writes = changes.flatMap(c => c.writes);
  assert.equal(writes.length, new Set(writes.map(w => w.member)).size);
  assert.ok(writes.every(w => w.path === PLATFORM_PATH && w.member <= 33));
  assert.ok(!writes.some(w => w.member === 2));
  assert.equal(rom.fingerprint(writes.find(w => w.member === 4).data), fps.get('a9c1da5ec48c73f1.nsbmd'));
  const result = rom.buildRom(src, writes), out = result.rom, O = rom.parseRom(out);
  assert.equal(sizeGrowth(src, R, changes), result.growth);
  for (let m = 0; m < 222; m++) {
    const expected = writes.find(w => w.member === m)?.data || rom.readMember(src, R, PLATFORM_PATH, m);
    assert.ok(rom.bytesEqual(rom.readMember(out, O, PLATFORM_PATH, m), expected), `member ${m}`);
  }
  assert.ok(rom.bytesEqual(rom.applyBps(rom.makeBps(src, out), src), out));
  const scan = scanInstalled(out, O, LIB, fps, inspectPlatforms(out, O), target);
  assert.equal(scan.items.platforms, 'mixed');
  assert.deepEqual(scan.platforms[4], transparent);
  assert.deepEqual(scan.platforms[33], noGround);
  assert.deepEqual(scan.platforms[2], { kind: 'stock' });
  const restore = { ...baseline(), platforms: { 4: { kind: 'stock' } } };
  assert.deepEqual(platformProblems(restore, LIB, inspectPlatforms(out, O), null), [{ member: 4, code: 'bpNeedDonor' }]);
  const restored = changesFor(restore, LIB, getFile, { target: inspectPlatforms(out, O), stock: target });
  assert.ok(rom.bytesEqual(restored[0].writes[0].data, target.models[4]));

  picks.custom.push({ id: 'custom', writes: [{ path: PLATFORM_PATH, member: 4, data: getFile(LIB.platforms.models[0].file) }] });
  assert.deepEqual(overlaps(changesFor(picks, LIB, getFile, { target })).get('custom:custom'), new Set(['platform:platform-transparent']));
  delete picks.platforms[1];
  assert.equal(platformAssignments(picks, LIB).get(1).kind, 'inherit');
  for (const m of ['-1', '34', '1.1', '01']) {
    assert.throws(() => changesFor({ ...baseline(), platforms: { [m]: transparent } }, LIB, getFile), /Invalid platform assignment/);
  }
});

test('platform cards distinguish explicit choices and label mixed variants', async () => {
  const { assignmentState, groupAssignment } = await import('../app/battle-platforms.js');
  assert.equal(assignmentState(undefined), 'bpUnchanged');
  for (const [kind, expected] of Object.entries({ inherit: 'bpInherited', model: 'bpOverride', keep: 'bpKeep', stock: 'bpStock' })) {
    assert.equal(assignmentState({ kind }), expected);
  }
  const group = GROUPS[1];
  assert.deepEqual(groupAssignment(group, new Map()), { mixed: false, assignment: undefined });
  const picks = { items: { platforms: 'disc-pixel-set' }, platforms: { 2: { kind: 'keep' }, 3: { kind: 'stock' } } };
  const assignments = platformAssignments(picks, LIB);
  assert.deepEqual(groupAssignment(group, assignments), { mixed: true });
  const inherited = platformAssignments({ items: { platforms: 'disc-pixel-set' } }, LIB);
  assert.deepEqual(groupAssignment(group, inherited), { mixed: true });
  const transparent = platformAssignments({ items: { platforms: 'disc-transparent' } }, LIB);
  assert.equal(groupAssignment(group, transparent).assignment.set.id, 'disc-transparent');
});

/*
 * Feature checks on a small synthetic ROM (no game data): pixel battle-ground set,
 * MaToRiuKo's template backgrounds, map packages (whole archive / one area).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as rom from '../app/core/rom.js';
import { changesFor } from '../app/core/plan.js';
import { buildFromTemplate, parseTemplate, checkSize, nearestLegal, indexImage } from '../app/core/bgtemplate.js';
import { checkModel } from '../app/core/check.js';

const LIB = JSON.parse(fs.readFileSync('app/library/library.json', 'utf8'));
const getFile = (n) => new Uint8Array(fs.readFileSync(path.join('app/library/files', n)));

const NARC_HEAD = (() => { const h = new Uint8Array(16); h.set([0x4E, 0x41, 0x52, 0x43, 0xFE, 0xFF, 0x00, 0x01]); rom.w16(h, 0x0C, 16); rom.w16(h, 0x0E, 3); return h; })();
const BTNF = (() => { const b = new Uint8Array(16); b.set([0x42, 0x54, 0x4E, 0x46]); rom.w32(b, 4, 16); rom.w32(b, 8, 4); rom.w16(b, 12, 0); rom.w16(b, 14, 1); return b; })();
const narc = (members) => rom.buildNarc({ hs: 16, head: NARC_HEAD, btnf: BTNF }, members);
const blob = (n, seed) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + seed * 7) & 255; return b; };

/** A tiny NDS: a/0/1/1 (84 members) and a/0/1/4 (282 members), real FNT/FAT. */
function fakeRom() {
  const a011 = narc(Array.from({ length: 84 }, (_, i) => blob(64 + i, i)));
  const a014 = narc(Array.from({ length: 282 }, (_, i) => blob(96, 1000 + i)));
  // FNT: root(F000) -> a(F001) -> 0(F002) -> 1(F003) -> files "1","4"
  const sub = [[0x81, 0x61, 0x01, 0xF0, 0], [0x81, 0x30, 0x02, 0xF0, 0], [0x81, 0x31, 0x03, 0xF0, 0], [0x01, 0x31, 0x01, 0x34, 0]];
  const dirs = 4, fntHead = dirs * 8;
  const subBytes = sub.map((x) => Uint8Array.from(x));
  const fnt = new Uint8Array(fntHead + subBytes.reduce((a, x) => a + x.length, 0));
  let p = fntHead;
  subBytes.forEach((sb, i) => { rom.w32(fnt, i * 8, p); rom.w16(fnt, i * 8 + 4, 0); rom.w16(fnt, i * 8 + 6, i === 0 ? dirs : 0xF000 + i - 1); fnt.set(sb, p); p += sb.length; });
  const fntAt = 0x200, fatAt = rom.align(fntAt + fnt.length, 0x10), f0 = rom.align(fatAt + 16, 0x200), f1 = rom.align(f0 + a011.length, 0x200);
  const size = rom.align(f1 + a014.length, 0x200) + 0x4000; // some free space at the end, like a real ROM
  const b = new Uint8Array(size).fill(0xFF);
  b.fill(0, 0, 0x200);
  b.set([...'POKEMON B'].map((c) => c.charCodeAt(0)), 0); b.set([...'IRBO'].map((c) => c.charCodeAt(0)), 0x0C);
  rom.w32(b, 0x40, fntAt); rom.w32(b, 0x44, fnt.length); rom.w32(b, 0x48, fatAt); rom.w32(b, 0x4C, 16);
  b.set(fnt, fntAt);
  rom.w32(b, fatAt, f0); rom.w32(b, fatAt + 4, f0 + a011.length); rom.w32(b, fatAt + 8, f1); rom.w32(b, fatAt + 12, f1 + a014.length);
  b.set(a011, f0); b.set(a014, f1);
  rom.w32(b, 0x80, f1 + a014.length);
  return b;
}

test('synthetic ROM parses', () => {
  const R = rom.parseRom(fakeRom());
  assert.equal(R.paths.get('a/0/1/1'), 0);
  assert.equal(R.paths.get('a/0/1/4'), 1);
});

test('pixel battle-ground set: each of the 34 slots gets its own ground, nothing else changes', () => {
  const src = fakeRom();
  const ch = changesFor({ items: { platforms: 'disc-pixel-set' }, battle: {}, extras: [], custom: [] }, LIB, getFile);
  assert.equal(ch.length, 1);
  assert.equal(ch[0].writes.length, 34);
  const { rom: out } = rom.buildRom(src, ch[0].writes);
  const N0 = rom.parseNarc(rom.readFile(src, rom.parseRom(src), 'a/0/1/1')), N1 = rom.parseNarc(rom.readFile(out, rom.parseRom(out), 'a/0/1/1'));
  const it = LIB.items.find((x) => x.id === 'disc-pixel-set');
  for (let m = 0; m < 84; m++) {
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
    for (let m = 0; m < 84; m++) assert.equal(rom.bytesEqual(N1.members[m], [34, 36].includes(m) ? model : N0.members[m]), true, `member ${m}`);
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
  const src = fakeRom(), R = rom.parseRom(src);
  const area = blob(60, 77);
  const { rom: out } = rom.buildRom(src, [{ path: 'a/0/1/4', member: 10, data: area }]);
  const O = rom.parseRom(out);
  assert.deepEqual(O.files[1], R.files[1]);
  const N0 = rom.parseNarc(rom.readFile(src, R, 'a/0/1/4')), N1 = rom.parseNarc(rom.readFile(out, O, 'a/0/1/4'));
  for (let i = 0; i < 282; i++) assert.equal(rom.bytesEqual(N1.members[i], i === 10 ? area : N0.members[i]), true, `area ${i}`);
  let diff = 0; for (let i = 0; i < src.length; i++) if (src[i] !== out[i]) diff++;
  assert.ok(diff <= 96 + 8, `small diff (${diff} bytes)`);
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

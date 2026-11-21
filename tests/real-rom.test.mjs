/*
 * End-to-end checks on real ROMs (not shipped). Run:
 *   ROM_MODIFIED=… ROM_EN=… ROM_ES=… node --test tests/
 * Each ROM variable is optional; missing ones skip their tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as rom from '../app/core/rom.js';
import { changesFor, scanInstalled, sizeGrowth, overlaps } from '../app/core/plan.js';

const LIB = JSON.parse(fs.readFileSync('app/library/library.json', 'utf8'));
const getFile = (n) => new Uint8Array(fs.readFileSync(path.join('app/library/files', n)));
const fps = new Map(Object.entries(LIB.files));
for (const [n, fp] of fps) if (rom.fingerprint(getFile(n)) !== fp) throw new Error('library file damaged: ' + n);
const load = (p) => (p && fs.existsSync(p) ? new Uint8Array(fs.readFileSync(p)) : null);

const MOD = load(process.env.ROM_MODIFIED);
const EN = load(process.env.ROM_EN);
const ES = load(process.env.ROM_ES);
const WH = load(process.env.ROM_WHITE);

const PICKS = {
  items: { surf: 'surf-lapras', platforms: 'disc-transparent', fly: 'fly-legendary', hmbg: 'hm-clean' },
  battle: { 34: { scene: 'bg-lugia-temple', mode: 'both' }, 70: { scene: 'bg-n-castle', mode: 'both' }, 58: { scene: 'bg-forest-celebi-mew', mode: 'model' } },
  extras: [],
  custom: [],
};

function membersOf(b, R, p) { return rom.parseNarc(rom.readFile(b, R, p)).members; }

function checkBuild(src, label) {
  const R = rom.parseRom(src);
  const before = rom.crc32(src);
  const changes = changesFor(PICKS, LIB, getFile);
  const writes = changes.flatMap((c) => c.writes);
  const { rom: out } = rom.buildRom(src, writes);
  assert.equal(rom.crc32(src), before, `${label}: source ROM must stay untouched`);
  const O = rom.parseRom(out);
  assert.ok(O.headerOk, 'header CRC fixed');
  // every write landed byte-for-byte
  for (const w of writes) assert.ok(rom.bytesEqual(rom.readMember(out, O, w.path, w.member), w.data), `${label}: ${w.path}#${w.member}`);
  // nothing else changed in the touched archives
  const touched = new Map();
  for (const w of writes) { if (!touched.has(w.path)) touched.set(w.path, new Set()); touched.get(w.path).add(w.member); }
  for (const [p, set] of touched) {
    const a = membersOf(src, R, p), b = membersOf(out, O, p);
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) if (!set.has(i)) assert.ok(rom.bytesEqual(a[i], b[i]), `${label}: ${p}#${i} must be unchanged`);
  }
  // every other file in the ROM is identical
  for (let id = 0; id < R.count; id++) {
    const isTouched = [...touched.keys()].some((p) => R.paths.get(p) === id);
    if (isTouched) continue;
    const [s, e] = R.files[id], [s2, e2] = O.files[id];
    assert.ok(rom.bytesEqual(src.subarray(s, e), out.subarray(s2, e2)), `${label}: file ${id} must be unchanged`);
  }
  // Legendary Fly: all 11 members present together
  const fly = LIB.items.find((x) => x.id === 'fly-legendary');
  assert.deepEqual(fly.writes.map((w) => w.member).sort((a, b) => a - b), [58, 60, 66, 67, 103, 104, 107, 108, 111, 112, 118]);
  // scan sees what we installed
  const scan = scanInstalled(out, O, LIB, fps);
  assert.equal(scan.items.surf, 'surf-lapras');
  assert.equal(scan.items.fly, 'fly-legendary');
  assert.equal(scan.items.platforms, 'disc-transparent');
  assert.equal(scan.battle[34], 'bg-lugia-temple');
  // BPS against this exact source rebuilds the same ROM
  const bps = rom.makeBps(src, out);
  const again = rom.applyBps(bps, src);
  assert.ok(rom.bytesEqual(again, out), `${label}: BPS round trip`);
  assert.throws(() => rom.applyBps(bps, out), /different ROM/);
  return { out, O, bpsSize: bps.length, growth: sizeGrowth(src, R, changes) };
}

test('already-modified Black ROM: surf + platform + 3 battle scenes + Legendary Fly + TM bg', { skip: !MOD }, () => {
  const R = rom.parseRom(MOD);
  const info = rom.describeRom(MOD, R);
  assert.equal(info.clean, false);
  const scanBefore = scanInstalled(MOD, R, LIB, fps);
  assert.equal(scanBefore.items.surf, 'surf-mini-merry', 'detects the Mini Merry surf already in this ROM');
  assert.equal(scanBefore.items.platforms, 'disc-none', 'detects No Battle Ground already in this ROM');
  const { out, O, bpsSize, growth } = checkBuild(MOD, 'modified');
  // earlier modification that we did NOT touch (TM bg was clean-TM; we re-apply clean) — and unrelated archives stay
  const a160 = (b, RR) => rom.readFile(b, RR, 'a/1/6/0');
  assert.ok(rom.bytesEqual(a160(MOD, R), a160(out, O)));
  console.log(`    modified ROM: patch ${(bpsSize / 1048576).toFixed(2)} MB, growth ${(growth / 1048576).toFixed(2)} MB`);
});

test('clean English Black', { skip: !EN }, () => {
  const R = rom.parseRom(EN);
  assert.equal(rom.describeRom(EN, R).clean, true);
  const s = scanInstalled(EN, R, LIB, fps);
  assert.equal(s.items.surf, 'original');
  assert.equal(s.items.fly, 'original');
  assert.equal(s.battle[34], 'original');
  checkBuild(EN, 'EN');
});

test('Spanish Black (same archive layout)', { skip: !ES }, () => { checkBuild(ES, 'ES'); });
test('English White (same archive layout)', { skip: !WH }, () => { checkBuild(WH, 'White'); });

test('later change overrides earlier one on the same entry', () => {
  const ch = [{ key: 'a', writes: [{ path: 'x', member: 1 }] }, { key: 'b', writes: [{ path: 'x', member: 1 }, { path: 'x', member: 2 }] }];
  assert.deepEqual([...overlaps(ch).get('b')], ['a']);
});

test('library: every referenced file exists and has the right type', () => {
  for (const it of LIB.items) for (const w of it.writes) assert.ok(LIB.files[w.file], `${it.id} ${w.file}`);
  for (const s of LIB.battle.scenes) {
    assert.equal(rom.magic(getFile(s.model)), 'BMD0', s.id);
    if (s.anim) assert.equal(rom.magic(getFile(s.anim)), 'BCA0', s.id);
  }
  for (const it of LIB.items.filter((i) => i.cat === 'surf')) assert.ok(it.writes.every((w) => w.path === 'a/0/7/5'));
  // Mini Merry surf is independent of the Mini Merry battle collection
  const mm = LIB.items.find((i) => i.id === 'surf-mini-merry');
  assert.ok(mm.writes.every((w) => w.path === 'a/0/7/5'));
});

test('BPS on synthetic data', () => {
  const a = new Uint8Array(5000).map((_, i) => i * 7);
  const b = a.slice(); b.set([1, 2, 3], 100); const c = new Uint8Array(6000); c.set(b); c.fill(9, 5000);
  assert.ok(rom.bytesEqual(rom.applyBps(rom.makeBps(a, c), a), c));
});

test('model check: empty part is an error, wrong header counts get fixed', async () => {
  const { checkModel } = await import('../app/core/check.js');
  const lapras = getFile(LIB.items.find((i) => i.id === 'surf-lapras').writes[0].file);
  assert.equal(checkModel(lapras).errors.length, 0);
  for (const it of LIB.items) for (const w of it.writes) if (w.file.endsWith('.nsbmd')) assert.equal(checkModel(getFile(w.file)).errors.length, 0, `${it.id} has an empty part`);
});

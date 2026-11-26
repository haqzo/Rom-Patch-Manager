/* Opt-in structural tests for the local Black/White inputs. Files are read only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as rom from '../app/core/rom.js';
import { changesFor, scanInstalled } from '../app/core/plan.js';
import { GROUPS, MEMBERS, PLATFORM_PATH, inspectPlatforms, verifiedSource, donorCompatible, platformProblems } from '../app/core/platforms.js';

const lib = JSON.parse(fs.readFileSync('app/library/library.json'));
const fps = new Map(Object.entries(lib.files));
const file = name => new Uint8Array(fs.readFileSync(path.join('app/library/files', name)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const local = process.env.ROM_PLATFORM_DIR;
const discovered = local ? fs.readdirSync(local).filter(f => /\.nds$/i.test(f)) : [];
const byName = pattern => {
  const found = discovered.find(name => pattern.test(name));
  return found ? path.join(local, found) : null;
};
const inputs = {
  IRBO: process.env.ROM_EN,
  IRAO: process.env.ROM_WHITE,
  IRBS: process.env.ROM_ES || byName(/edicion negra/i),
  IRAS: byName(/edicion blanca/i),
  IRBF: byName(/version noire/i),
  IRAF: byName(/version blanche/i),
  IRBD: byName(/schwarze/i),
  IRAD: byName(/weisse/i),
  IRBI: byName(/versione nera/i),
  IRAI: byName(/versione bianca/i),
  IRBJ: byName(/monsters - black/i),
  IRAJ: byName(/white.*\(j\)/i),
  IRBK: process.env.ROM_KO_BLACK,
  IRAK: process.env.ROM_KO_WHITE,
};
const selection = (options = {}) => ({ items: {}, battle: {}, extras: [], custom: [], platforms: {}, ...options });
const model = id => ({ kind: 'model', id: 'platform-' + id });
const before = (src, R) => rom.parseNarc(rom.readFile(src, R, PLATFORM_PATH)).members;

function examine(src, picks, target, stock, originals, roundtrip = false, selected = null) {
  const R = rom.parseRom(src);
  const changes = changesFor(picks, lib, file, { target, stock });
  assert.deepEqual(platformProblems(picks, lib, target, stock), []);
  const writes = changes.flatMap(c => c.writes);
  const expected = new Map(writes.map(w => [w.member, w.data]));
  assert.equal(expected.size, writes.length);
  if (selected) {
    assert.deepEqual(writes.map(w => w.member), selected);
    assert.ok(writes.every(w => w.path === PLATFORM_PATH));
  }
  const { rom: out } = rom.buildRom(src, writes);
  const O = rom.parseRom(out);
  const after = before(out, O);
  assert.ok(O.headerOk);
  assert.equal(after.length, originals.length);
  for (const [i, previous] of originals.entries()) assert.ok(rom.bytesEqual(after[i], expected.get(i) || previous), `member ${i}`);
  for (const [id, [start, end]] of R.files.entries()) {
    if (id === R.paths.get(PLATFORM_PATH)) continue;
    const [a, b] = O.files[id];
    assert.ok(rom.bytesEqual(src.subarray(start, end), out.subarray(a, b)), `archive ${id}`);
  }
  if (roundtrip) assert.ok(rom.bytesEqual(rom.applyBps(rom.makeBps(src, out), src), out));
  return out;
}

for (const [code, filename] of Object.entries(inputs)) test(`platform structural and export matrix: ${code}`, { skip: !filename }, () => {
  const src = fs.readFileSync(filename);
  const originalHash = hash(src);
  const R = rom.parseRom(src);
  const info = rom.describeRom(src, R);
  assert.equal(info.code, code);
  const profile = inspectPlatforms(src, R);
  assert.deepEqual(profile.valid, MEMBERS);
  const stock = verifiedSource(info, profile);
  const originals = before(src, R);
  const english = code.endsWith('O');
  if (english) assert.ok(stock && profile.groupSafe && profile.groupUsed.length === 24 && !profile.groupUsed.includes(2));
  console.log(`  ${code} rev ${profile.revision} CRC ${info.crc}, clean fingerprint ${info.clean}, header ${info.headerOk}, groups ${profile.groupSafe}, members ${originals.length}, donor ${!!stock}`);
  assert.ok(rom.bytesEqual(examine(src, selection(), profile, stock, originals), src), 'no-op');
  examine(src, selection({ platforms: { 33: model('pixel-wood') } }), profile, stock, originals);
  if (english) for (const selected of [[2], [0, 3, 28, 33], GROUPS[1]]) {
    const platforms = Object.fromEntries(selected.map(member => [member, model('transparent')]));
    examine(src, selection({ platforms }), profile, stock, originals, selected.length === 1, selected);
  }
  for (const id of ['disc-pixel-set', 'disc-transparent', 'disc-none']) {
    const out = examine(src, selection({ items: { platforms: id } }), profile, stock, originals);
    assert.equal(scanInstalled(out, rom.parseRom(out), lib, fps, inspectPlatforms(out, rom.parseRom(out)), stock).items.platforms, id);
  }
  const out = examine(src, selection({ items: { platforms: 'disc-pixel-set' },
    platforms: { 0: { kind: 'keep' }, 1: model('transparent'), 2: model('no-ground'), 3: model('pixel-river') },
    battle: { 34: { scene: 'bg-lugia-temple', mode: 'both' } } }), profile, stock, originals, true);
  const O = rom.parseRom(out), changed = inspectPlatforms(out, O);
  assert.equal(scanInstalled(out, O, lib, fps, changed, stock).items.platforms, 'mixed');
  if (stock) {
    assert.ok(donorCompatible(changed, stock));
    const restored = examine(out, selection({ platforms: { 1: { kind: 'stock' } } }), changed, stock, before(out, O), english);
    assert.ok(rom.bytesEqual(rom.readMember(restored, rom.parseRom(restored), PLATFORM_PATH, 1), profile.models[1]));
  }
  assert.equal(hash(src), originalHash);
  assert.equal(hash(fs.readFileSync(filename)), originalHash, 'the source file is unchanged');
});

#!/usr/bin/env node
/*
 * Turn an old full-ROM patch (.bps / .xdelta) into raw member files.
 *
 *   node extract-raw.mjs <clean.nds> <patch> <outDir> <label>
 *
 * The patch is replayed on the given clean ROM. BPS patches made from a slightly
 * different dump still work: every output byte is tracked as "known" when the patch
 * stores it literally, and a changed archive member is only kept when all of its
 * bytes are known (or it is byte-identical to the clean member, i.e. unchanged).
 * Output: <outDir>/<label>/manifest.json + one file per changed member.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as rom from '../app/core/rom.js';

const [cleanPath, patchPath, outDir, label] = process.argv.slice(2);
if (!label) { console.error('usage: extract-raw.mjs clean.nds patch outDir label'); process.exit(2); }
const clean = new Uint8Array(fs.readFileSync(cleanPath));
const patch = new Uint8Array(fs.readFileSync(patchPath));
const CR = rom.parseRom(clean);

function bpsPartial(patch, source) {
  let p = 4;
  const num = () => { let d = 0, s = 1; for (;;) { const x = patch[p++]; d += (x & 0x7f) * s; if (x & 0x80) break; s *= 128; d += s; } return d; };
  const srcSize = num(), tgtSize = num(), meta = num(); p += meta;
  const end = patch.length - 12;
  const srcCrc = rom.u32(patch, end);
  const exact = srcSize === source.length && rom.crc32(source) === srcCrc;
  const out = new Uint8Array(tgtSize);
  const known = new Uint8Array(tgtSize); // 1 = byte came from the patch itself (or the exact source)
  let o = 0, sr = 0, tr = 0;
  const src = (from, len) => { const n = Math.max(0, Math.min(len, source.length - from)); if (n > 0) out.set(source.subarray(from, from + n), o); if (exact) known.fill(1, o, o + len); };
  while (p < end) {
    const d = num(), cmd = d % 4, len = Math.floor(d / 4) + 1;
    if (cmd === 0) { src(o, len); o += len; }
    else if (cmd === 1) { out.set(patch.subarray(p, p + len), o); known.fill(1, o, o + len); p += len; o += len; }
    else if (cmd === 2) { const x = num(); sr += (x % 2 ? -1 : 1) * Math.floor(x / 2); src(sr, len); sr += len; o += len; }
    else { const x = num(); tr += (x % 2 ? -1 : 1) * Math.floor(x / 2); for (let i = 0; i < len; i++, o++, tr++) { out[o] = out[tr]; known[o] = known[tr]; } }
  }
  return { out, known, exact };
}

const allKnown = (k, s, e) => { for (let i = s; i < e; i++) if (!k[i]) return false; return true; };

let res;
const kind = rom.ascii(patch, 0, 4);
if (kind === 'BPS1') res = bpsPartial(patch, clean);
else { console.error('only BPS supported here'); process.exit(3); }

let T;
try { T = rom.parseRom(res.out); } catch (e) { console.error('result not an NDS:', e.message); process.exit(4); }
if (T.h.code.slice(0, 3) !== CR.h.code.slice(0, 3)) { console.error(`game mismatch ${T.h.code} vs ${CR.h.code}`); process.exit(5); }
const fatKnown = allKnown(res.known, T.h.fat[0], T.h.fat[0] + T.h.fat[1]);

const idToPath = new Map([...CR.paths].map(([p, id]) => [id, p]));
const dest = path.join(outDir, label);
fs.mkdirSync(dest, { recursive: true });
const items = [], lost = [], pending = [];
const knownBlobs = new Map(); // fingerprint -> true for members fully stored in the patch
for (let id = 0; id < CR.count; id++) {
  const name = idToPath.get(id) || `#${id}`;
  const [cs, ce] = CR.files[id];
  const [ts, te] = T.files[id] || [0, 0];
  const mine = clean.subarray(cs, ce), theirs = res.out.subarray(ts, te);
  if (rom.bytesEqual(mine, theirs)) continue;
  const NC = rom.parseNarc(mine), NT = rom.parseNarc(theirs);
  if (NC && NT && NC.members.length === NT.members.length) {
    for (let i = 0; i < NC.members.length; i++) {
      const a = NC.members[i], b = NT.members[i];
      if (rom.bytesEqual(a, b)) continue;
      const off = ts + (b.byteOffset - theirs.byteOffset);
      if (!allKnown(res.known, off, off + b.length)) { pending.push({ name, i, b, a }); continue; }
      knownBlobs.set(rom.fingerprint(b), true);
      const mg = rom.magic(b) || 'bin';
      const ext = { BMD0: 'nsbmd', BCA0: 'nsbca', BTX0: 'nsbtx', BTA0: 'nsbta', BTP0: 'nsbtp', BMA0: 'nsbma', BVA0: 'nsbva' }[mg] || 'bin';
      const file = `${name.replace(/\//g, '')}_${i}.${ext}`;
      fs.writeFileSync(path.join(dest, file), b);
      items.push({ path: name, member: i, magic: mg, size: b.length, fp: rom.fingerprint(b), file, cleanFp: rom.fingerprint(a) });
    }
  } else {
    items.push({ path: name, member: null, wholeFile: true, size: theirs.length, known: allKnown(res.known, ts, te) });
  }
}
// A member rebuilt partly from our own clean ROM is trusted only when it is byte-identical
// to a member the patch stores in full (patch encoders reuse identical blocks).
for (const { name, i, b, a } of pending) {
  if (!knownBlobs.has(rom.fingerprint(b))) { lost.push(`${name}:${i}`); continue; }
  const mg = rom.magic(b) || 'bin';
  const ext = { BMD0: 'nsbmd', BCA0: 'nsbca' }[mg] || 'bin';
  const file = `${name.replace(/\//g, '')}_${i}.${ext}`;
  fs.writeFileSync(path.join(dest, file), b);
  items.push({ path: name, member: i, magic: mg, size: b.length, fp: rom.fingerprint(b), file, cleanFp: rom.fingerprint(a), viaDuplicate: true });
}
items.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : (x.member ?? -1) - (y.member ?? -1)));
const manifest = { label, patch: path.basename(patchPath), exactSource: res.exact, fatKnown, target: T.h.code, items, lost };
fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`${label}: ${items.filter((x) => x.member !== null).length} members, ${items.filter((x) => x.member === null).length} whole files, lost ${lost.length}, exact=${res.exact}`);
const summ = new Map(); for (const it of items) { const k = `${it.path} ${it.magic || 'file'} ${it.size}`; if (!summ.has(k)) summ.set(k, []); summ.get(k).push(it.member); }
for (const [k, v] of summ) console.log('  ', k, '->', v.join(','));
if (lost.length) console.log('   lost:', lost.slice(0, 30).join(' '));

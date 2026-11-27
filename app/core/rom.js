/*
 * Rom Patch Manager — ROM core.
 * Works the same in Electron, a browser and Node: plain Uint8Arrays in and out.
 *
 * What it does:
 *  - reads any Nintendo DS ROM (clean or already modified — no restrictions)
 *  - finds internal files by path (a/0/7/5 …) through the ROM's own file name table,
 *    so it works on every language version and on already-patched ROMs
 *  - replaces single members inside NARC archives (or whole files) and rebuilds the ROM
 *  - makes / applies BPS patches
 *
 * Replacement strategy (same idea as MaToRiuKo's romtool): every other byte of the ROM
 * is copied unchanged. A rebuilt file is written back into its old place when it fits,
 * otherwise appended into the free space at the end of the ROM, and only its 8-byte FAT
 * entry is rewritten.
 */

// ---------------------------------------------------------------- bytes
export const u16 = (b, o) => b[o] | (b[o + 1] << 8);
export const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
export const w16 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; };
export const w32 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; b[o + 2] = (v >>> 16) & 255; b[o + 3] = (v >>> 24) & 255; };
export const align = (v, a) => Math.ceil(v / a) * a;
export const ascii = (b, o, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = b[o + i]; if (!c) break; s += String.fromCharCode(c); } return s; };

export class RomError extends Error {
  constructor(code, message, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}
const fail = (code, msg, extra) => { throw new RomError(code, msg, extra); };

export function bytesEqual(a, b) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------------------------------------------------------------- checksums
let CRC_T = null;
export function crc32(b, start = 0, end = b.length) {
  if (!CRC_T) {
    CRC_T = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; }
  }
  let c = 0xFFFFFFFF;
  for (let i = start; i < end; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
export const hex8 = (n) => (n >>> 0).toString(16).toUpperCase().padStart(8, '0');

export function crc16(b, start, end) {
  let c = 0xFFFF;
  for (let i = start; i < end; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = (c & 1) ? (c >>> 1) ^ 0xA001 : c >>> 1; }
  return c;
}

/** Small fast fingerprint for library matching: size + CRC32. */
export const fingerprint = (b) => `${b.length}:${hex8(crc32(b))}`;

// ---------------------------------------------------------------- game identity
export const GAMES = {
  IRB: { name: 'Pokémon Black', short: 'Black', family: 'bw' },
  IRA: { name: 'Pokémon White', short: 'White', family: 'bw' },
  IRE: { name: 'Pokémon Black 2', short: 'Black 2', family: 'bw2' },
  IRD: { name: 'Pokémon White 2', short: 'White 2', family: 'bw2' },
};
export const REGIONS = { O: 'en', E: 'en', P: 'en', S: 'es', F: 'fr', D: 'de', I: 'it', J: 'ja', K: 'ko' };

/** Clean dump CRC32s we know of (from the No-Intro sets the PokeMMO community uses). Only used for an info badge. */
export const KNOWN_CLEAN = {
  '4F6E5580': 'IRBO', 'B552501C': 'IRAO',
  '2CA88FAA': 'IRBS', '32657121': 'IRAS',
  '308F9D56': 'IRBF', '8B4CBA44': 'IRAF',
  'E59E6F87': 'IRBD', '95CF004D': 'IRAD',
  '52A5634D': 'IRBI', '2F025937': 'IRAI',
  '33AF46D5': 'IRBJ', 'CAA820CB': 'IRAJ',
  '436C1606': 'IRBK',
};

// ---------------------------------------------------------------- NDS
export function looksLikeNds(b) {
  if (!b || b.length < 0x200) return false;
  const fnt = u32(b, 0x40), fat = u32(b, 0x48), fatSize = u32(b, 0x4C);
  return fnt > 0 && fnt < b.length && fat > 0 && fat + fatSize <= b.length && fatSize % 8 === 0;
}

export function parseRom(b) {
  if (!looksLikeNds(b)) fail('NOT_NDS', 'This is not a Nintendo DS ROM (.nds).');
  const h = {
    title: ascii(b, 0, 12), code: ascii(b, 0x0C, 4), cap: b[0x14],
    fnt: [u32(b, 0x40), u32(b, 0x44)], fat: [u32(b, 0x48), u32(b, 0x4C)],
    used: u32(b, 0x80), hcrc: u16(b, 0x15E),
  };
  const count = h.fat[1] / 8;
  const files = new Array(count);
  for (let i = 0; i < count; i++) {
    const s = u32(b, h.fat[0] + i * 8), e = u32(b, h.fat[0] + i * 8 + 4);
    if (e < s || e > b.length) fail('FAT_DAMAGED', `The ROM's file table is damaged (file ${i}).`);
    files[i] = [s, e];
  }
  const paths = new Map(); // 'a/0/7/5' -> file id
  const base = h.fnt[0];
  try {
    const walk = (dirId, path, depth) => {
      if (depth > 32) return;
      const e = base + (dirId & 0xFFF) * 8;
      let p = base + u32(b, e);
      let id = u16(b, e + 4);
      for (let guard = 0; guard < 70000; guard++) {
        const len = b[p++];
        if (!len) break;
        const name = ascii(b, p, len & 0x7F); p += len & 0x7F;
        if (len & 0x80) { const sub = u16(b, p); p += 2; walk(sub, path + name + '/', depth + 1); }
        else paths.set(path + name, id++);
      }
    };
    walk(0xF000, '', 0);
  } catch { /* names only help lookups; a broken FNT just means fewer paths */ }
  const prefix = h.code.slice(0, 3);
  return {
    h, files, count, paths,
    game: GAMES[prefix] || null,
    lang: REGIONS[h.code[3]] || null,
    headerOk: crc16(b, 0, 0x15E) === h.hcrc,
    size: b.length,
  };
}

export function fileId(R, path) {
  const id = R.paths.get(path);
  if (id === undefined) fail('NO_FILE', `This ROM has no file "${path}".`, { path });
  return id;
}
export function readFile(b, R, path) {
  const [s, e] = R.files[fileId(R, path)];
  return b.subarray(s, e);
}

// ---------------------------------------------------------------- NARC
export function parseNarc(b) {
  if (!b || b.length < 0x1C || ascii(b, 0, 4) !== 'NARC' || u16(b, 4) !== 0xFFFE) return null;
  const hs = u16(b, 0x0C);
  let p = hs;
  if (p + 12 > b.length || ascii(b, p, 4) !== 'BTAF') return null;
  const btafSize = u32(b, p + 4), count = u16(b, p + 8), ent = p + 12;
  if (ent + count * 8 > b.length) return null;
  p += btafSize;
  if (p + 8 > b.length || ascii(b, p, 4) !== 'BTNF') return null;
  const btnf = b.subarray(p, p + u32(b, p + 4));
  p += btnf.length;
  if (p + 8 > b.length || ascii(b, p, 4) !== 'GMIF') return null;
  const img = p + 8, imgEnd = p + u32(b, p + 4);
  const members = [];
  for (let i = 0; i < count; i++) {
    const s = img + u32(b, ent + i * 8), e = img + u32(b, ent + i * 8 + 4);
    // some tools (e.g. MaToRiuKo's romtool) write a GMIF size without its 8-byte header: only the file end is a hard limit
    if (e < s || e > b.length || e > imgEnd + 11) return null;
    members.push(b.subarray(s, e));
  }
  return { hs, head: b.subarray(0, hs), btnf, members };
}

export function buildNarc(N, members) {
  const btafSize = 12 + 8 * members.length;
  let imgLen = 0; const offs = [];
  for (const m of members) { offs.push(imgLen); imgLen = align(imgLen + m.length, 4); }
  const total = N.hs + btafSize + N.btnf.length + 8 + imgLen;
  const o = new Uint8Array(total);
  o.set(N.head); w32(o, 8, total);
  let p = N.hs;
  o.set([0x42, 0x54, 0x41, 0x46], p); w32(o, p + 4, btafSize); w16(o, p + 8, members.length); w16(o, p + 10, 0);
  members.forEach((m, i) => { w32(o, p + 12 + i * 8, offs[i]); w32(o, p + 16 + i * 8, offs[i] + m.length); });
  p += btafSize;
  o.set(N.btnf, p); p += N.btnf.length;
  o.set([0x47, 0x4D, 0x49, 0x46], p); w32(o, p + 4, 8 + imgLen); p += 8;
  o.fill(0xFF, p);
  members.forEach((m, i) => o.set(m, p + offs[i]));
  return o;
}

export function readMember(b, R, path, index) {
  const N = parseNarc(readFile(b, R, path));
  if (!N) fail('NOT_NARC', `"${path}" is not an archive in this ROM.`, { path });
  if (index < 0 || index >= N.members.length) fail('NO_MEMBER', `"${path}" has no entry ${index} in this ROM.`, { path, index });
  return N.members[index];
}

/** Four-letter magic of a Nitro file ('BMD0', 'BCA0', 'NARC' …) or ''. */
export function magic(b) {
  if (!b || b.length < 4) return '';
  const s = ascii(b, 0, 4);
  return /^[A-Z0-9]{4}$/.test(s) ? s : '';
}

// ---------------------------------------------------------------- build
/**
 * writes: [{ path: 'a/0/7/5', member: 49, data: Uint8Array, label? }]
 *         member === null/undefined replaces the whole file.
 * Later writes to the same (path, member) win.
 * Returns { rom, report }. The source buffer is never modified.
 */
export function buildRom(src, writes, { onProgress } = {}) {
  const R = parseRom(src);
  // group by file
  const byPath = new Map();
  for (const w of writes) {
    if (!(w.data instanceof Uint8Array)) fail('BAD_DATA', `No data for ${w.path}.`);
    if (!byPath.has(w.path)) byPath.set(w.path, { whole: null, members: new Map() });
    const g = byPath.get(w.path);
    if (w.member === null || w.member === undefined) { g.whole = w.data; g.members.clear(); }
    else g.members.set(w.member, w.data);
  }

  const newFiles = new Map(); // fileId -> bytes
  const report = [];
  for (const [path, g] of byPath) {
    const id = fileId(R, path);
    const [s, e] = R.files[id];
    let data = g.whole ? g.whole : src.subarray(s, e);
    if (g.members.size) {
      const N = parseNarc(data);
      if (!N) fail('NOT_NARC', `"${path}" is not an archive in this ROM.`, { path });
      for (const [i] of g.members) if (i < 0 || i >= N.members.length) fail('NO_MEMBER', `"${path}" has no entry ${i} in this ROM (it has ${N.members.length}).`, { path, index: i });
      // entries that are the same size or smaller are written in place (only their end offset changes),
      // so a patch only carries the bytes that really differ; anything bigger rebuilds the archive
      if ([...g.members].every(([i, d]) => d.length <= N.members[i].length)) {
        // A Node Buffer is a Uint8Array, but Buffer.slice() shares the source memory.
        const out = new Uint8Array(data);
        const ent = N.hs + 12;
        const base = data.byteOffset;
        for (const [i, d] of g.members) {
          const at = N.members[i].byteOffset - base;
          out.set(d, at);
          if (d.length < N.members[i].length) out.fill(0xFF, at + d.length, at + N.members[i].length);
          w32(out, ent + i * 8 + 4, u32(out, ent + i * 8) + d.length);
        }
        data = out;
      } else {
        const members = N.members.slice();
        for (const [i, d] of g.members) members[i] = d;
        data = buildNarc(N, members);
      }
    }
    newFiles.set(id, data);
    report.push({ path, id, oldSize: e - s, newSize: data.length, members: [...g.members.keys()], whole: !!g.whole });
  }

  // where free space starts: after every file, the FNT/FAT, and the header's "used" size
  let tail = Math.max(R.h.used, R.h.fat[0] + R.h.fat[1], R.h.fnt[0] + R.h.fnt[1]);
  for (const [fs, fe] of R.files) if (fe > tail) tail = fe;
  let next = align(tail, 0x200);
  const placements = [];
  for (const [id, data] of newFiles) {
    const [s, e] = R.files[id];
    if (data.length <= e - s) placements.push({ id, at: s, data, oldEnd: e });
    else { placements.push({ id, at: next, data, oldEnd: e, appended: true }); next = align(next + data.length, 0x200); }
  }
  const need = Math.max(src.length, next);
  const out = new Uint8Array(need);
  out.set(src);
  if (need > src.length) out.fill(0xFF, src.length);
  let usedEnd = R.h.used;
  for (const p of placements) {
    out.set(p.data, p.at);
    if (!p.appended && p.at + p.data.length < p.oldEnd) out.fill(0xFF, p.at + p.data.length, p.oldEnd);
    w32(out, R.h.fat[0] + p.id * 8, p.at);
    w32(out, R.h.fat[0] + p.id * 8 + 4, p.at + p.data.length);
    usedEnd = Math.max(usedEnd, p.at + p.data.length);
  }
  w32(out, 0x80, usedEnd);
  let cap = out[0x14];
  while (0x20000 * Math.pow(2, cap) < out.length) cap++;
  out[0x14] = cap;
  w16(out, 0x15E, crc16(out, 0, 0x15E));

  // verify: every written member reads back
  const O = parseRom(out);
  for (const [path, g] of byPath) {
    const f = readFile(out, O, path);
    if (g.whole && !g.members.size && !bytesEqual(f, g.whole)) fail('VERIFY', `Check failed for ${path}.`);
    if (g.members.size) {
      const N = parseNarc(f);
      for (const [i, d] of g.members) if (!N || !bytesEqual(N.members[i], d)) fail('VERIFY', `Check failed for ${path} entry ${i}.`);
    }
  }
  const added = placements.filter((p) => p.appended).reduce((a, p) => a + p.data.length, 0);
  const growth = report.reduce((a, r) => a + Math.max(0, r.newSize - r.oldSize), 0);
  return { rom: out, report, added, growth };
}

// ---------------------------------------------------------------- BPS
function bpsNum(n) {
  const o = [];
  for (;;) { const x = n % 128; n = Math.floor(n / 128); if (n === 0) { o.push(0x80 | x); break; } o.push(x); n--; }
  return o;
}

/** Linear BPS (SourceRead + TargetRead). Fine for ROM edits, which are local. */
export function makeBps(source, target, metadata = '') {
  const chunks = [];
  let cur = []; let curLen = 0;
  const pushBytes = (arr) => { cur.push(Uint8Array.from(arr)); curLen += arr.length; };
  const pushView = (v) => { cur.push(v); curLen += v.length; };
  pushBytes([0x42, 0x50, 0x53, 0x31]);
  pushBytes(bpsNum(source.length)); pushBytes(bpsNum(target.length));
  const meta = new TextEncoder().encode(metadata);
  pushBytes(bpsNum(meta.length)); if (meta.length) pushView(meta);
  const n = target.length, m = source.length;
  let o = 0, litStart = -1;
  const flush = (to) => {
    if (litStart < 0) return;
    pushBytes(bpsNum((to - litStart - 1) * 4 + 1));
    pushView(target.subarray(litStart, to));
    litStart = -1;
  };
  while (o < n) {
    if (o < m && source[o] === target[o]) {
      let r = o + 1;
      while (r < n && r < m && source[r] === target[r]) r++;
      if (r - o >= 8 || r === n) {
        flush(o);
        // a SourceRead may be very long; split to keep numbers safe
        let a = o;
        while (a < r) { const len = Math.min(r - a, 1 << 28); pushBytes(bpsNum((len - 1) * 4)); a += len; }
        o = r; continue;
      }
      if (litStart < 0) litStart = o;
      o = r; continue;
    }
    if (litStart < 0) litStart = o;
    o++;
  }
  flush(n);
  const le = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  pushBytes(le(crc32(source))); pushBytes(le(crc32(target)));
  const body = new Uint8Array(curLen + 4);
  let k = 0; for (const c of cur) { body.set(c, k); k += c.length; }
  body.set(le(crc32(body, 0, curLen)), curLen);
  chunks.length = 0;
  return body;
}

export function applyBps(patch, source) {
  if (ascii(patch, 0, 4) !== 'BPS1') fail('NOT_BPS', 'Not a BPS patch.');
  let p = 4;
  const num = () => { let d = 0, s = 1; for (;;) { const x = patch[p++]; d += (x & 0x7f) * s; if (x & 0x80) break; s *= 128; d += s; } return d; };
  const srcSize = num(), tgtSize = num(), meta = num(); p += meta;
  const end = patch.length - 12;
  const srcCrc = u32(patch, end), tgtCrc = u32(patch, end + 4);
  if (source.length !== srcSize || crc32(source) !== srcCrc) fail('BPS_WRONG_SOURCE', 'This patch was made for a different ROM.');
  const out = new Uint8Array(tgtSize);
  let o = 0, sr = 0, tr = 0;
  while (p < end) {
    const d = num(), cmd = d % 4, len = Math.floor(d / 4) + 1;
    if (cmd === 0) { out.set(source.subarray(o, o + len), o); o += len; }
    else if (cmd === 1) { out.set(patch.subarray(p, p + len), o); p += len; o += len; }
    else if (cmd === 2) { const x = num(); sr += (x % 2 ? -1 : 1) * Math.floor(x / 2); out.set(source.subarray(sr, sr + len), o); sr += len; o += len; }
    else { const x = num(); tr += (x % 2 ? -1 : 1) * Math.floor(x / 2); for (let i = 0; i < len; i++) out[o++] = out[tr++]; }
  }
  if (crc32(out) !== tgtCrc) fail('BPS_BAD_RESULT', 'The patched result has the wrong checksum.');
  return out;
}

// ---------------------------------------------------------------- ROM summary for the UI
export function describeRom(b, R = parseRom(b)) {
  const crc = hex8(crc32(b));
  const known = KNOWN_CLEAN[crc];
  return {
    title: R.h.title, code: R.h.code, game: R.game, lang: R.lang, crc,
    size: b.length, files: R.count, headerOk: R.headerOk,
    clean: known === R.h.code,
    supported: !!R.game && R.game.family === 'bw',
  };
}

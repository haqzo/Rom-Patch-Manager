/*
 * Battle-background template swap (MaToRiuKo's romtool 1.2.24, bgtemplate.py, ported).
 * A template .nsbmd already has correct geometry/materials/UVs. We only re-encode its TEX0:
 * the user's image becomes a paletted texture (16 or 256 colours, index 0 = transparent),
 * MDL0 is copied verbatim. Geometry is never touched.
 *
 * images: { [textureName]: { width, height, rgba: Uint8Array|Uint8ClampedArray } }
 */
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const w16 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; };
const w32 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; b[o + 2] = (v >>> 16) & 255; b[o + 3] = (v >>> 24) & 255; };
const FMT_DEPTH = { 3: 4, 4: 8 };
const ascii = (b, o, n) => { let s = ''; for (let i = 0; i < n && b[o + i]; i++) s += String.fromCharCode(b[o + i]); return s; };

export function parseTemplate(data) {
  if (ascii(data, 0, 4) !== 'BMD0') throw new Error('Template is not a BMD0 model.');
  const nsect = u16(data, 0x0E);
  const sect = Array.from({ length: nsect }, (_, i) => u32(data, 0x10 + 4 * i));
  const mdl0 = sect[0], mdl0End = nsect > 1 ? sect[1] : data.length;
  let tex0 = -1;
  for (let o = mdl0End; o + 4 <= data.length; o += 4) if (ascii(data, o, 4) === 'TEX0') { tex0 = o; break; }
  if (tex0 < 0) throw new Error('Template has no TEX0 section.');
  const info = tex0 + 0x3C;
  const amt = data[info + 1];
  const dinfo = info + 12 + amt * 4;
  const es = Math.max(u16(data, dinfo), 8);
  const doff = dinfo + 4, noff = doff + amt * es;
  const tda = tex0 + u32(data, tex0 + 0x14);
  const pinfo = tex0 + u32(data, tex0 + 0x34);
  const pamt = data[pinfo + 1];
  const pdi = pinfo + 12 + pamt * 4;
  const pes = Math.max(u16(data, pdi), 4);
  const pdo = pdi + 4, pnoff = pdo + pamt * pes;
  const pda = tex0 + u32(data, tex0 + 0x38);
  const textures = [], extras = [], palettes = [];
  for (let i = 0; i < amt; i++) {
    const r = doff + i * es, pa = u16(data, r + 2);
    const fmt = (pa >> 10) & 7;
    textures.push({ name: ascii(data, noff + i * 16, 16), width: 8 << ((pa >> 4) & 7), height: 8 << ((pa >> 7) & 7), fmt, bpp: FMT_DEPTH[fmt] || 4, offset: u16(data, r) << 3 });
    extras.push(data.slice(r + 4, r + es));
  }
  for (let i = 0; i < pamt; i++) palettes.push({ name: ascii(data, pnoff + i * 16, 16), offset: u16(data, pdo + i * pes) << 3 });
  return {
    data, tex0, mdl0: data.subarray(mdl0, mdl0End), tda, pda, textures, extras, palettes,
    hdr: data.slice(tex0, tex0 + 0x3C), dictHdr: data.slice(info, dinfo + 4), palDictHdr: data.slice(pinfo, pdi + 4),
  };
}

/** Sizes allowed for a texture slot: template size / 1, 2, 4, 8, 16 (never bigger, never under 8 px). */
export function legalSizes(w, h) {
  const out = [];
  for (const k of [1, 2, 4, 8, 16]) { if (w % k || h % k || w / k < 8 || h / k < 8) break; out.push({ k, width: w / k, height: h / k }); }
  return out;
}
export function checkSize(w, h, iw, ih) {
  if (legalSizes(w, h).some((s) => s.width === iw && s.height === ih)) return { ok: true };
  return { ok: false, reason: iw > w || ih > h ? 'tooBig' : 'badSize' };
}
/** Nearest legal size with the same aspect ratio, never upscaling. */
export function nearestLegal(w, h, iw, ih) {
  let best = null;
  for (const s of legalSizes(w, h)) {
    const r = s.width / s.height;
    if (Math.abs(r - iw / ih) / r > 0.05) continue;
    if (s.width > iw || s.height > ih) continue;
    const d = Math.abs(s.width - iw) + Math.abs(s.height - ih);
    if (!best || d < best.d) best = { d, ...s };
  }
  return best ? { width: best.width, height: best.height } : { width: w, height: h };
}

// ---------------------------------------------------------------- quantization
/** Median cut on 15-bit colours (weighted by pixel count). Returns up to k [r,g,b] (0..255). */
function medianCut(hist, k) {
  const cols = [...hist.entries()].map(([c, n]) => ({ r: (c >> 10) & 31, g: (c >> 5) & 31, b: c & 31, n }));
  let boxes = [cols];
  const range = (bx) => { const m = { r: [31, 0], g: [31, 0], b: [31, 0] }; for (const c of bx) for (const ch of 'rgb') { m[ch][0] = Math.min(m[ch][0], c[ch]); m[ch][1] = Math.max(m[ch][1], c[ch]); } return m; };
  while (boxes.length < k) {
    let bi = -1, best = -1, axis = 'r';
    boxes.forEach((bx, i) => {
      if (bx.length < 2) return;
      const m = range(bx);
      for (const ch of 'rgb') { const span = (m[ch][1] - m[ch][0]) * Math.sqrt(bx.reduce((a, c) => a + c.n, 0)); if (span > best) { best = span; bi = i; axis = ch; } }
    });
    if (bi < 0 || best <= 0) break;
    const bx = boxes[bi].sort((a, b) => a[axis] - b[axis]);
    const total = bx.reduce((a, c) => a + c.n, 0);
    let acc = 0, cut = 1;
    for (let i = 0; i < bx.length - 1; i++) { acc += bx[i].n; if (acc >= total / 2) { cut = i + 1; break; } }
    boxes.splice(bi, 1, bx.slice(0, cut), bx.slice(cut));
  }
  return boxes.map((bx) => {
    const n = bx.reduce((a, c) => a + c.n, 0) || 1;
    return ['r', 'g', 'b'].map((ch) => Math.round((bx.reduce((a, c) => a + c[ch] * c.n, 0) / n) * 255 / 31));
  });
}

/**
 * Image → palette indices. Index 0 is always transparent on the DS, so colours start at 1:
 * 16 → 15 usable colours, 256 → 255. Few colours: exact; many: median cut + Floyd–Steinberg.
 */
export function indexImage(img, colors) {
  const { width: w, height: h, rgba } = img;
  const k = colors - 1, n = w * h;
  const idx = new Uint8Array(n);
  const hist = new Map();
  let transparent = 0;
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] < 128) { transparent++; continue; }
    const c = ((rgba[i * 4] >> 3) << 10) | ((rgba[i * 4 + 1] >> 3) << 5) | (rgba[i * 4 + 2] >> 3);
    hist.set(c, (hist.get(c) || 0) + 1);
  }
  let pal;
  if (hist.size <= k) {
    const keys = [...hist.keys()];
    pal = keys.map((c) => [((c >> 10) & 31) * 255 / 31, ((c >> 5) & 31) * 255 / 31, (c & 31) * 255 / 31].map(Math.round));
    const lut = new Map(keys.map((c, i) => [c, i + 1]));
    for (let i = 0; i < n; i++) {
      if (rgba[i * 4 + 3] < 128) continue;
      idx[i] = lut.get(((rgba[i * 4] >> 3) << 10) | ((rgba[i * 4 + 1] >> 3) << 5) | (rgba[i * 4 + 2] >> 3)) || 1;
    }
  } else {
    pal = medianCut(hist, k);
    const cache = new Map();
    const nearest = (r, g, b) => {
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      const hit = cache.get(key); if (hit !== undefined) return hit;
      let bi = 0, bd = Infinity;
      for (let j = 0; j < pal.length; j++) { const p = pal[j], d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (d < bd) { bd = d; bi = j; } }
      cache.set(key, bi); return bi;
    };
    const err = new Float32Array(n * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (rgba[i * 4 + 3] < 128) continue;
      const r = Math.max(0, Math.min(255, rgba[i * 4] + err[i * 3])), g = Math.max(0, Math.min(255, rgba[i * 4 + 1] + err[i * 3 + 1])), b = Math.max(0, Math.min(255, rgba[i * 4 + 2] + err[i * 3 + 2]));
      const j = nearest(r | 0, g | 0, b | 0); idx[i] = j + 1;
      const e = [r - pal[j][0], g - pal[j][1], b - pal[j][2]];
      const spread = (dx, dy, f) => { const xx = x + dx, yy = y + dy; if (xx < 0 || xx >= w || yy >= h) return; const t = yy * w + xx; for (let c = 0; c < 3; c++) err[t * 3 + c] += e[c] * f; };
      spread(1, 0, 7 / 16); spread(-1, 1, 3 / 16); spread(0, 1, 5 / 16); spread(1, 1, 1 / 16);
    }
  }
  const palette = [[0, 0, 0], ...pal];
  while (palette.length < colors) palette.push([0, 0, 0]);
  return { idx, palette: palette.slice(0, colors), transparent };
}
const rgb555 = (c) => (c[0] >> 3) | ((c[1] >> 3) << 5) | ((c[2] >> 3) << 10);

function encodePixels(idx, w, h, bpp) {
  if (bpp === 8) return Uint8Array.from(idx);
  const out = new Uint8Array((w * h) >> 1);
  for (let i = 0; i < w * h; i += 2) out[i >> 1] = (idx[i] & 15) | ((idx[i + 1] & 15) << 4);
  return out;
}

// ---------------------------------------------------------------- rebuild
/**
 * Build a new model from the template. images: { textureName: {width,height,rgba, colors?} }.
 * Textures without an image keep their original pixels and palette.
 */
export function buildFromTemplate(templateBytes, images = {}) {
  const T = parseTemplate(templateBytes);
  const data = T.data;
  const texs = T.textures.map((x, i) => {
    const img = images[x.name];
    if (img) {
      const c = checkSize(x.width, x.height, img.width, img.height);
      if (!c.ok) throw Object.assign(new Error(`${x.name}: ${img.width}×${img.height} is not allowed (template ${x.width}×${x.height}).`), { code: c.reason });
      const colors = img.colors || (x.bpp === 8 ? 256 : 16);
      const bpp = colors <= 16 ? 4 : 8;
      const q = indexImage(img, colors);
      return { name: x.name, width: img.width, height: img.height, fmt: bpp === 4 ? 3 : 4, pixels: encodePixels(q.idx, img.width, img.height, bpp), pal: q.palette.map(rgb555), extra: T.extras[i] };
    }
    const need = (x.width * x.height * x.bpp) >> 3;
    const pixels = data.slice(T.tda + x.offset, T.tda + x.offset + need);
    let pj = T.palettes.findIndex((p) => p.name === x.name || p.name === x.name + '_pl' || p.name.includes(x.name));
    if (pj < 0) pj = Math.min(i, T.palettes.length - 1);
    const po = T.pda + T.palettes[pj].offset;
    const pal = Array.from({ length: x.bpp === 8 ? 256 : 16 }, (_, c) => u16(data, po + 2 * c));
    return { name: x.name, width: x.width, height: x.height, fmt: x.fmt, pixels, pal, extra: T.extras[i] };
  });

  const parts = [];
  let len = 0;
  const push = (b) => { parts.push(b); len += b.length; };
  const pad8 = () => { if (len % 8) push(new Uint8Array(8 - (len % 8))); };
  const name16 = (s) => { const b = new Uint8Array(16); for (let i = 0; i < Math.min(15, s.length); i++) b[i] = s.charCodeAt(i) & 255; return b; };
  push(T.hdr.slice());
  push(T.dictHdr.slice());
  const entriesAt = len; push(new Uint8Array(8 * texs.length));
  texs.forEach((x) => push(name16(x.name)));
  push(T.palDictHdr.slice());
  const palEntriesAt = len; push(new Uint8Array(4 * texs.length));
  texs.forEach((x) => push(name16(x.name)));
  pad8();
  const tda = len;
  for (const x of texs) { x.off = len - tda; push(x.pixels); pad8(); }
  const texSize = len - tda;
  const pda = len;
  for (const x of texs) { x.palOff = len - pda; const b = new Uint8Array(x.pal.length * 2); x.pal.forEach((c, i) => w16(b, i * 2, c)); push(b); pad8(); }
  const palSize = len - pda;
  const out = new Uint8Array(len);
  let p = 0; for (const b of parts) { out.set(b, p); p += b.length; }
  texs.forEach((x, i) => {
    const we = Math.round(Math.log2(x.width / 8)), he = Math.round(Math.log2(x.height / 8));
    w16(out, entriesAt + 8 * i, x.off >> 3);
    w16(out, entriesAt + 8 * i + 2, (we << 4) | (he << 7) | (x.fmt << 10));
    out.set(x.extra.subarray(0, 4), entriesAt + 8 * i + 4);
    w16(out, palEntriesAt + 4 * i, x.palOff >> 3);
  });
  w32(out, 0x04, len);
  w16(out, 0x0C, texSize >> 3);          // texture data size (Mato's version leaves this stale)
  w32(out, 0x14, tda);
  for (const o of [0x24, 0x28, 0x38]) w32(out, o, pda);
  w32(out, 0x30, palSize >> 3);          // palette data size (likewise)

  const mdl = T.mdl0.slice();
  w32(mdl, 4, mdl.length);
  const total = 0x10 + 8 + mdl.length + out.length;
  const res = new Uint8Array(total);
  res.set(data.subarray(0, 0x10));
  w32(res, 0x08, total); w16(res, 0x0E, 2);
  w32(res, 0x10, 0x18); w32(res, 0x14, 0x18 + mdl.length);
  res.set(mdl, 0x18); res.set(out, 0x18 + mdl.length);
  return res;
}

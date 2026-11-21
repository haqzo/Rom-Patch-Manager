// A115 #25 in-place texture patch + 等比放大重建 — core logic (mirrors romtool a115bg.py / a115scale.py)
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const w16 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; };
const w32 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; b[o + 2] = (v >>> 16) & 255; b[o + 3] = (v >>> 24) & 255; };
const ascii = (b, o, n) => { let s = ''; for (let i = 0; i < n && b[o + i]; i++) s += String.fromCharCode(b[o + i]); return s; };
// 1 = A3I5（每像素 8 位：3 位 alpha + 5 位索引），不是 4bpp
const FMT_BPP = { 1: 8, 2: 2, 3: 4, 4: 8, 5: 2, 6: 8, 7: 16 };

/** 解析 BMD0 的 TEX0：除常规字段外还留出条目原始字节（重建 TEX0 要用） */
export function parseTEX0Full(data) {
  if (ascii(data, 0, 4) !== 'BMD0') throw new Error('不是 BMD0 模型');
  const nsect = u16(data, 0x0E);
  const s0 = u32(data, 0x10), s1 = nsect > 1 ? u32(data, 0x14) : data.length;
  let tex0 = -1;
  for (let o = s1; o + 4 <= data.length; o += 4) if (ascii(data, o, 4) === 'TEX0') { tex0 = o; break; }
  if (tex0 < 0) throw new Error('没有 TEX0 段');
  const info = tex0 + 0x3C, amt = data[info + 1], dinfo = info + 12 + amt * 4;
  const es = Math.max(u16(data, dinfo), 8), doff = dinfo + 4, noff = doff + amt * es;
  const tda = tex0 + u32(data, tex0 + 0x14);
  const pinfo = tex0 + u32(data, tex0 + 0x34), pamt = data[pinfo + 1], pdi = pinfo + 12 + pamt * 4;
  const pes = Math.max(u16(data, pdi), 4), pdo = pdi + 4, pnoff = pdo + pamt * pes;
  const pda = tex0 + u32(data, tex0 + 0x38);
  const tex = [], pal = [];
  for (let i = 0; i < amt; i++) {
    const r = doff + i * es, pa = u16(data, r + 2), fmt = (pa >> 10) & 7;
    tex.push({ name: ascii(data, noff + i * 16, 16), fmt, bpp: FMT_BPP[fmt] || 4,
      w: 8 << ((pa >> 4) & 7), h: 8 << ((pa >> 7) & 7), off: u16(data, r) << 3,
      entry: r, param: pa, color0Transparent: ((pa >> 13) & 1) === 1, extras: data.slice(r + 4, r + es) });
  }
  for (let i = 0; i < pamt; i++) pal.push({ name: ascii(data, pnoff + i * 16, 16), off: u16(data, pdo + i * pes) << 3 });
  return { data, tex0, mdl0: s0, mdlEnd: s1, tda, pda, palEnd: data.length - pda,
    hdr: data.slice(tex0, tex0 + 0x3C), dictHdr: data.slice(info, dinfo + 4), palDictHdr: data.slice(pinfo, pdi + 4),
    textures: tex, palettes: pal };
}

/** 兼容旧调用：只取常用字段 */
export function parseTEX0(data) {
  const T = parseTEX0Full(data);
  return { data, tex0: T.tex0, tda: T.tda, pda: T.pda, palEnd: T.palEnd, textures: T.textures, palettes: T.palettes };
}

/** Palette the game picks for this texture (same rule as bmdview / a115bg). */
export function paletteOf(T, name) {
  const offs = [...new Set([...T.palettes.map((p) => p.off), T.palEnd])].sort((a, b) => a - b);
  let hit = T.palettes.find((p) => p.name === name || p.name === name + '_pl');
  if (!hit) {
    let best = null;
    for (const p of T.palettes) {
      const base = p.name.endsWith('_pl') ? p.name.slice(0, -3) : p.name;
      if (base && name.includes(base) && (!best || base.length > best.len)) best = { len: base.length, p };
    }
    hit = best ? best.p : T.palettes[0];
  }
  const cur = hit.off, next = offs.find((o) => o > cur);
  return { name: hit.name, off: cur, colors: Math.max(1, ((next ?? T.palEnd) - cur) >> 1) };
}

// ---- quantization (same maths as the site's core/bgtemplate.js)
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
    const bx = boxes[bi].slice().sort((a, b) => a[axis] - b[axis]);
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
  return { idx, palette: palette.slice(0, colors), transparent, used: pal.length };
}

const rgb555 = (c) => (c[0] >> 3) | ((c[1] >> 3) << 5) | ((c[2] >> 3) << 10);
/** TEXIMAGE 参数 bit13 = 调色板索引 0 视为透明（真机素材里 89 个 fmt3/4 条目就是这么做的） */
const COLOR0_BIT = 0x2000;
function setColor0Transparent(buf, entryAt, on) {
  const pa = u16(buf, entryAt + 2);
  w16(buf, entryAt + 2, on ? (pa | COLOR0_BIT) : (pa & ~COLOR0_BIT));
}

/**
 * Patch one texture in place: same file length, same offsets (1× path).
 * Mask textures (*_a) are zeroed from their pixel offset up to the palette data,
 * i.e. the whole real block (A3I5 8×8 = 64 B), exactly like romtool's a115bg.
 */
export function patchA115(src, texName, img, colors, opts = {}) {
  const T = parseTEX0Full(src);
  const tx = T.textures.find((t) => t.name === texName);
  if (!tx) throw new Error('模型里没有贴图 ' + texName);
  if (img.width !== tx.w || img.height !== tx.h) throw new Error(`${img.width}×${img.height} 不是 ${tx.w}×${tx.h}`);
  const P = paletteOf(T, texName);
  const useColors = Math.max(2, Math.min(colors || 256, P.colors));
  const q = indexImage(img, useColors);
  const out = new Uint8Array(src);
  const bytes = (tx.w * tx.h * tx.bpp) >> 3;
  if (tx.bpp === 8) out.set(q.idx.subarray(0, bytes), T.tda + tx.off);
  else for (let i = 0; i < q.idx.length; i += 2) out[T.tda + tx.off + (i >> 1)] = (q.idx[i] & 15) | ((q.idx[i + 1] & 15) << 4);
  const palBytes = Math.min(P.colors, q.palette.length) * 2;
  for (let i = 0; i < palBytes / 2; i++) w16(out, T.pda + P.off + i * 2, rgb555(q.palette[i]));
  // 透明区：调色板索引 0 不画出来靠的是 TEXIMAGE 参数 bit13「color 0 transparent」。
  // 原模板这一位是 0（索引 0 会被当成不透明黑色画出来），有透明像素时补上。
  setColor0Transparent(out, tx.entry, q.transparent > 0);
  if (opts.clearMask !== false) {
    const masks = T.textures.filter((t) => /_a$/.test(t.name));
    if (masks.length) {
      const start = T.tda + Math.min(...masks.map((t) => t.off));
      out.fill(0, start, T.pda);
    }
  }
  return { out, tex: tx, palette: P, colors: useColors, transparent: q.transparent, usedColors: q.used,
    maskNames: masksOf(T), rebuilt: false, scale: 1 };
}

/* ------------------------------------------------------------------ 等比放大 ----------
 * 三处尺寸必须一起改，少一处游戏里就把画面平铺成 n×n：
 *   ① TEX0 贴图尺寸指数（pa 的高位）
 *   ② 纹理条目后 4 字节的尺寸声明
 *   ③ MDL0 材质条目的 TEXIMAGE 宽高（引擎真正的取样依据）
 * 另外 UV 是像素坐标，要乘同一个倍率。
 * 模板结构写死（9,764 B），长度对不上就直接拒绝，避免误伤别的模型。
 */
const TPL_LEN = 9764;
const UV_WORDS = [608, 628, 636, 648];   // 相对 mdl0 的 TEXCOORD 字（poly0 的 4 个顶点）
const MAT_SIZE = [472, 474];             // 材质 0 的 TEXIMAGE 宽 / 高（绝对偏移）
const MAX_SCALE = 4;                     // 贴图偏移 16 bit × 8 B ⇒ 4×（512×256）是结构上限

function masksOf(T) { return T.textures.filter((t) => /_a$/.test(t.name)).map((t) => t.name); }
const al8 = (n) => (n + 7) & ~7;

function scaleWord(word, f) {
  let u = word & 0xFFFF, v = (word >>> 16) & 0xFFFF;
  if (u > 32767) u -= 65536;
  if (v > 32767) v -= 65536;
  return ((Math.round(u * f) & 0xFFFF) | ((Math.round(v * f) & 0xFFFF) << 16)) >>> 0;
}

function encName(name) {
  const a = new Uint8Array(16);
  for (let i = 0; i < Math.min(15, name.length); i++) a[i] = name.charCodeAt(i) & 255;
  return a;
}

/** 2× / 4×：重建 TEX0（贴图变大）+ 同步 UV 与材质尺寸，掩膜整块置透明 */
export function rebuildA115(src, texName, img, scale) {
  if (src.length !== TPL_LEN) throw new Error('模板长度不是 9764，放大逻辑不支持这个模板');
  if (scale !== 2 && scale !== 4) throw new Error('倍率只能是 2 或 4');
  const T = parseTEX0Full(src);
  const ti = T.textures.findIndex((t) => t.name === texName);
  if (ti < 0) throw new Error('模型里没有贴图 ' + texName);
  const tx = T.textures[ti];
  const w = tx.w * scale, h = tx.h * scale;
  if (img.width !== w || img.height !== h) throw new Error('图 ' + img.width + '×' + img.height + ' 与目标 ' + w + '×' + h + ' 不一致');
  const q = indexImage(img, 256);

  const spanEnd = T.pda - T.tda;
  const edges = [...new Set([...T.textures.map((t) => t.off), spanEnd])].sort((a, b) => a - b);
  const pixels = T.textures.map((t, i) => {
    if (i === ti) return q.idx;
    const need = edges.find((e) => e > t.off) - t.off;
    return /_a$/.test(t.name) ? new Uint8Array(need) : src.slice(T.tda + t.off, T.tda + t.off + need);
  });

  const palEdges = [...new Set([...T.palettes.map((p) => p.off), T.palEnd])].sort((a, b) => a - b);
  const pals = T.palettes.map((p) => {
    const n = Math.max(1, (palEdges.find((o) => o > p.off) - p.off) >> 1);
    let cols = Array.from({ length: n }, (_, i) => u16(src, T.pda + p.off + i * 2));
    if (p.name === 'poke_line_pl') cols = Array.from({ length: n }, (_, i) => (q.palette[i] ? rgb555(q.palette[i]) : 0));
    return { name: p.name, cols };
  });

  const B = [];
  const put = (a) => { for (let i = 0; i < a.length; i++) B.push(a[i]); };
  put(T.hdr); put(T.dictHdr);
  const entriesAt = B.length;
  put(new Uint8Array(8 * T.textures.length));
  for (const t of T.textures) put(encName(t.name));
  put(T.palDictHdr);
  const palEntriesAt = B.length;
  put(new Uint8Array(4 * pals.length));
  for (const p of pals) put(encName(p.name));
  while (B.length % 8) B.push(0);
  const tdaOut = B.length;
  const texOff = [];
  for (const px of pixels) { texOff.push(B.length - tdaOut); put(px); while (B.length % 8) B.push(0); }
  const pdaOut = B.length;
  const palOff = [];
  for (const p of pals) {
    palOff.push(B.length - pdaOut);
    for (const c of p.cols) B.push(c & 255, (c >> 8) & 255);
    while (B.length % 8) B.push(0);
  }
  const out = Uint8Array.from(B);

  const dims = T.textures.map((t, i) => (i === ti ? { fmt: 4, w, h } : { fmt: t.fmt, w: t.w, h: t.h }));
  for (let i = 0; i < dims.length; i++) {
    const d = dims[i];
    const we = Math.round(Math.log2(d.w / 8)), he = Math.round(Math.log2(d.h / 8));
    const pa = (we << 4) | (he << 7) | (d.fmt << 10) | (i === ti && q.transparent > 0 ? COLOR0_BIT : 0);
    w16(out, entriesAt + 8 * i, texOff[i] >> 3);
    w16(out, entriesAt + 8 * i + 2, pa);
    const org = T.textures[i].extras;
    w16(out, entriesAt + 8 * i + 4, ((u16(org, 0) & 0xC000) | (d.w & 0x3FFF)) & 0xFFFF);
    w16(out, entriesAt + 8 * i + 6, (0x8000 | ((d.h >> 5) & 0x7FFF)) & 0xFFFF);
  }
  for (let i = 0; i < pals.length; i++) w16(out, palEntriesAt + 4 * i, palOff[i] >> 3);
  w32(out, 0x04, out.length);
  w32(out, 0x14, tdaOut);
  w32(out, 0x24, pdaOut); w32(out, 0x28, pdaOut); w32(out, 0x38, pdaOut);

  const mdl = src.slice(T.mdl0, T.mdlEnd);
  if (u16(src, MAT_SIZE[0]) !== 128 || u16(src, MAT_SIZE[1]) !== 64) throw new Error('材质尺寸字段位置和预期不符，拒绝生成');
  for (const rel of UV_WORDS) w32(mdl, rel, scaleWord(u32(mdl, rel), scale));
  w16(mdl, MAT_SIZE[0] - T.mdl0, w);
  w16(mdl, MAT_SIZE[1] - T.mdl0, h);
  w32(mdl, 4, mdl.length);

  const total = 0x10 + 8 + mdl.length + out.length;
  const head = Uint8Array.from(src.slice(0, 0x10));
  w32(head, 0x08, total);
  w16(head, 0x0E, 2);
  const tbl = new Uint8Array(8);
  w32(tbl, 0, 0x18);
  w32(tbl, 4, 0x18 + mdl.length);
  const result = new Uint8Array(total);
  let p = 0;
  for (const chunk of [head, tbl, mdl, out]) { result.set(chunk, p); p += chunk.length; }
  const plIdx = T.palettes.findIndex((x) => x.name === 'poke_line_pl');
  return { out: result, tex: { name: texName, w, h, bpp: 8 }, palette: { name: 'poke_line_pl', off: plIdx >= 0 ? palOff[plIdx] : 0, colors: 256 },
    transparent: q.transparent, usedColors: q.used, maskNames: masksOf(T), rebuilt: true, scale, uvCount: UV_WORDS.length };
}

/** 统一入口：1× 就地补丁，2×/4× 重建 */
export function makeA115(src, texName, img, opts = {}) {
  const scale = opts.scale || 1;
  if (scale === 1) return patchA115(src, texName, img, opts.colors || 256, { clearMask: opts.clearMask });
  return rebuildA115(src, texName, img, scale);
}

export const A115_MAX_SCALE = MAX_SCALE;

/** Decode a texture from the patched bytes, for the 2D preview. */
export function decodeTexture(data, texName) {
  const T = parseTEX0Full(data);
  const tx = T.textures.find((t) => t.name === texName);
  if (!tx) throw new Error('no texture ' + texName);
  const P = paletteOf(T, texName);
  const pal = [];
  for (let i = 0; i < Math.min(256, P.colors); i++) {
    const v = u16(data, T.pda + P.off + i * 2);
    pal.push([((v & 31) << 3) | 7, (((v >> 5) & 31) << 3) | 7, (((v >> 10) & 31) << 3) | 7, i ? 255 : 0]);
  }
  const rgba = new Uint8ClampedArray(tx.w * tx.h * 4);
  for (let y = 0; y < tx.h; y++) for (let x = 0; x < tx.w; x++) {
    let i;
    if (tx.bpp === 8) i = data[T.tda + tx.off + y * tx.w + x];
    else { const b = data[T.tda + tx.off + y * ((tx.w + 1) >> 1) + (x >> 1)]; i = (x & 1) ? (b >> 4) : (b & 15); }
    const c = pal[i] || [0, 0, 0, 0], o = (y * tx.w + x) * 4;
    rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = c[3];
  }
  return { width: tx.w, height: tx.h, rgba, colors: P.colors };
}

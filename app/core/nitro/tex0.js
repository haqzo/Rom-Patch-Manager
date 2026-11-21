/*
 * TEX0 texture block (inside BMD0 models and BTX0 texture files).
 * Ported from MaToRiuKo's bmdview.py (romtool 1.2.16), with two documented
 * differences selectable by `mode` (see VIEWER-NOTES.md):
 *  - 'spec' (default): palette colour 0 is transparent only when the texture's
 *    "colour 0 transparent" flag is set (TEXIMAGE_PARAM bit 29); A3I5/A5I3 use
 *    their palette colour with the stored alpha; direct-colour (format 7) is decoded.
 *  - 'matoriuko': exactly bmdview.py's behaviour (colour 0 always transparent),
 *    for comparison with his previews.
 * Format 5 (4×4 compressed) is decoded since milestone 4, following the
 * GBATEK description of the DS texture formats. MaToRiuKo's bmdview.py does not
 * decode it, so there is no reference output to compare with; it is labelled
 * "decoded per specification" in the viewer (VIEWER-NOTES.md §2).
 */
import { NitroError, readDict, rgb555 } from './reader.js';
export const TEXTURE_FORMATS = {
    0: 'none',
    1: 'A3I5',
    2: '4-colour',
    3: '16-colour',
    4: '256-colour',
    5: '4×4 compressed',
    6: 'A5I3',
    7: 'direct colour',
};
const BITS = { 1: 8, 2: 2, 3: 4, 4: 8, 6: 8, 7: 16 };
const PALETTE_SIZE = { 1: 32, 2: 4, 3: 16, 4: 256, 6: 8 };
/** Largest texture the DS can use (1024 × 1024). */
const MAX_SIDE = 1024;
export function parseTex0(r, tex0) {
    if (r.ascii(tex0, 4) !== 'TEX0')
        throw new NitroError('BAD_MAGIC', 'TEX0 block missing.');
    const texData = tex0 + r.u32(tex0 + 0x14);
    const palData = tex0 + r.u32(tex0 + 0x38);
    const texDict = readDict(r, tex0 + 0x3c, 4);
    const textures = [];
    for (let i = 0; i < texDict.count; i++) {
        const e = texDict.entry(i);
        const p = r.u16(e + 2);
        const width = 8 << ((p >> 4) & 7);
        const height = 8 << ((p >> 7) & 7);
        textures.push({ name: texDict.names[i], dataOffset: r.u16(e) << 3, width: Math.min(width, MAX_SIDE), height: Math.min(height, MAX_SIDE), format: (p >> 10) & 7, color0Transparent: ((p >> 13) & 1) === 1 });
    }
    const palDict = readDict(r, tex0 + r.u32(tex0 + 0x34), 2);
    const palettes = [];
    for (let i = 0; i < palDict.count; i++)
        palettes.push({ name: palDict.names[i], offset: r.u16(palDict.entry(i)) << 3 });
    return { textures, palettes, texData, palData, tex4x4Data: tex0 + r.u32(tex0 + 0x24), tex4x4PalIdx: tex0 + r.u32(tex0 + 0x28) };
}
/**
 * MaToRiuKo's palette-by-name rule (used for BTX0 files, which have no
 * material table, and as a fallback when a model's palette table is empty).
 */
export function paletteByName(pals, texName) {
    const exact = pals.find((p) => p.name === texName) ?? pals.find((p) => p.name === texName + '_pl');
    if (exact)
        return exact;
    const base = (n) => (n.endsWith('_pl') ? n.slice(0, -3) : n);
    let best = null;
    for (const p of pals) {
        const b = base(p.name);
        if (b && texName.includes(b) && (!best || b.length > best.len))
            best = { len: b.length, p };
    }
    if (best)
        return best.p;
    for (const p of pals) {
        const b = base(p.name);
        if (texName && b.includes(texName) && (!best || texName.length > best.len))
            best = { len: texName.length, p };
    }
    return best?.p ?? null;
}
/**
 * Palette for a texture: the model's material table first (documented binding),
 * then MaToRiuKo's name rule, then — like bmdview.py — the first palette, which
 * is a guess and is labelled as one.
 */
export function choosePalette(pals, texName, fromTable) {
    if (fromTable) {
        const p = pals.find((x) => x.name === fromTable);
        if (p)
            return { pal: p, how: 'table' };
    }
    const byName = paletteByName(pals, texName);
    if (byName)
        return { pal: byName, how: 'name' };
    const first = pals.find((x) => x.offset === 0) ?? pals[0] ?? null;
    return { pal: first, how: first ? 'guess' : null };
}
export function decodeTexture(r, t0, t, pal, mode = 'spec') {
    const { width: w, height: h, format: fmt } = t;
    const out = { rgba: null, width: w, height: h, problem: null };
    if (fmt === 5)
        return decode4x4(r, t0, t, pal, out);
    const bpp = BITS[fmt];
    if (!bpp)
        return { ...out, problem: 'unsupportedFormat' };
    const base = t0.texData + t.dataOffset;
    const rowBytes = (w * bpp) / 8;
    if (!r.has(base, rowBytes * h))
        return { ...out, problem: 'outOfBounds' };
    const rgba = new Uint8Array(w * h * 4);
    const b = r.b;
    if (fmt === 7) {
        for (let i = 0; i < w * h; i++) {
            const v = b[base + i * 2] | (b[base + i * 2 + 1] << 8);
            const [cr, cg, cb] = rgb555(v);
            rgba.set([cr, cg, cb, v & 0x8000 ? 255 : 0], i * 4);
        }
        return { ...out, rgba };
    }
    const n = PALETTE_SIZE[fmt];
    if (!pal)
        return { ...out, problem: 'noPalette' };
    const pc = [];
    for (let k = 0; k < n; k++) {
        const o = t0.palData + pal.offset + k * 2;
        pc.push(r.has(o, 2) ? rgb555(r.u16(o)) : [0, 0, 0]);
    }
    // Alpha of each palette entry for the paletted (non-alpha) formats.
    const c0Transparent = mode === 'matoriuko' ? true : t.color0Transparent;
    const put = (i, c, a) => {
        rgba[i * 4] = c[0];
        rgba[i * 4 + 1] = c[1];
        rgba[i * 4 + 2] = c[2];
        rgba[i * 4 + 3] = a;
    };
    const black = [0, 0, 0];
    for (let y = 0; y < h; y++) {
        const rb = base + y * rowBytes;
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (fmt === 1 || fmt === 6) {
                const by = b[rb + x];
                const idx = fmt === 1 ? by & 0x1f : by & 7;
                const a = fmt === 1 ? (((by >> 5) * 255) / 7) | 0 : (((by >> 3) * 255) / 31) | 0;
                // bmdview.py blanks palette entry 0 for every format; the DS uses its colour.
                put(i, mode === 'matoriuko' && idx === 0 ? black : idx < n ? pc[idx] : black, a);
                continue;
            }
            let idx;
            if (bpp === 8)
                idx = b[rb + x];
            else if (bpp === 4)
                idx = (b[rb + (x >> 1)] >> (4 * (x & 1))) & 0xf;
            else
                idx = (b[rb + (x >> 2)] >> (2 * (x & 3))) & 3;
            if (idx === 0 && c0Transparent)
                put(i, black, 0);
            else if (idx < n)
                put(i, pc[idx], 255);
            else
                put(i, black, fmt === 4 ? 255 : 0);
        }
    }
    return { ...out, rgba };
}
/**
 * Format 5, 4×4-compressed (GBATEK "DS 3D Texture Formats"): the image is made of
 * 4×4 blocks in row order. Each block has 4 bytes of 2-bit texels (one byte per
 * row, leftmost pixel in the low bits) in the 4×4 texel area, and one 16-bit word
 * in the palette-index area at half the texel offset: bits 0–13 give the block's
 * palette start in 4-byte steps, bits 14–15 the mode:
 *   0: colours 0, 1, 2, transparent        1: 0, 1, (0+1)/2, transparent
 *   2: colours 0, 1, 2, 3                  3: 0, 1, (5·0+3·1)/8, (3·0+5·1)/8
 * Blends are computed on the 5-bit components. The transparency is part of the
 * format, so both colour-0 modes decode it the same way.
 */
function decode4x4(r, t0, t, pal, out) {
    const { width: w, height: h } = t;
    if (!pal)
        return { ...out, problem: 'noPalette' };
    const blocks = (w >> 2) * (h >> 2);
    const texels = t0.tex4x4Data + t.dataOffset;
    const idxs = t0.tex4x4PalIdx + (t.dataOffset >> 1);
    if (!r.has(texels, blocks * 4) || !r.has(idxs, blocks * 2))
        return { ...out, problem: 'outOfBounds' };
    const rgba = new Uint8Array(w * h * 4);
    const base = t0.palData + pal.offset;
    const c5 = (v) => [v & 31, (v >> 5) & 31, (v >> 10) & 31];
    const expand = (c) => c.map((x) => ((x * 255) / 31) | 0); // as rgb555()
    const mix = (a, b, wa, wb, d) => a.map((x, k) => Math.floor((x * wa + b[k] * wb) / d));
    let outOfPalette = false;
    const bw = w >> 2;
    for (let bi = 0; bi < blocks; bi++) {
        const word = r.u16(idxs + 2 * bi);
        const mode = word >> 14;
        const at = base + (word & 0x3fff) * 4;
        const n = mode === 2 ? 4 : mode === 0 ? 3 : 2;
        if (!r.has(at, 2 * n)) {
            outOfPalette = true;
            continue;
        }
        const c = Array.from({ length: n }, (_, k) => c5(r.u16(at + 2 * k)));
        const colours = mode === 0 ? [c[0], c[1], c[2], null]
            : mode === 1 ? [c[0], c[1], mix(c[0], c[1], 1, 1, 2), null]
                : mode === 2 ? [c[0], c[1], c[2], c[3]]
                    : [c[0], c[1], mix(c[0], c[1], 5, 3, 8), mix(c[0], c[1], 3, 5, 8)];
        const rgb = colours.map((x) => (x ? expand(x) : null));
        const bx = (bi % bw) * 4;
        const by = Math.floor(bi / bw) * 4;
        for (let y = 0; y < 4; y++) {
            const row = r.u8(texels + 4 * bi + y);
            for (let x = 0; x < 4; x++) {
                const col = rgb[(row >> (2 * x)) & 3];
                const i = ((by + y) * w + bx + x) * 4;
                if (col) {
                    rgba[i] = col[0];
                    rgba[i + 1] = col[1];
                    rgba[i + 2] = col[2];
                    rgba[i + 3] = 255;
                }
            }
        }
    }
    return { ...out, rgba, problem: outOfPalette ? 'outOfBounds' : null };
}

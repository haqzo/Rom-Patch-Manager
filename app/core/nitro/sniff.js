/*
 * Identify a Nintendo DS resource by its signature (never by file extension).
 * Says what each kind is and whether this version can preview it.
 */
import { Reader } from './reader.js';
export const KIND_SUPPORT = {
    BMD0: 'model',
    BTX0: 'textures',
    BCA0: 'animation',
    NARC: 'archive',
    BTA0: 'none',
    BTP0: 'none',
    BMA0: 'none',
    BVA0: 'none',
    SPA: 'none',
    empty: 'none',
    unknown: 'none',
};
const NITRO = new Set(['BMD0', 'BTX0', 'BCA0', 'BTA0', 'BTP0', 'BMA0', 'BVA0']);
export function sniffNitro(b) {
    if (b.length === 0)
        return { kind: 'empty', magic: '', declaredSize: null, sizeMatches: null };
    const r = new Reader(b);
    const magic = r.ascii(0, Math.min(4, b.length));
    const printable = magic.replace(/[^\x20-\x7e]/g, '·');
    if (b.length >= 16 && NITRO.has(magic)) {
        const declared = r.u32(8);
        return { kind: magic, magic: printable, declaredSize: declared, sizeMatches: declared === b.length };
    }
    if (b.length >= 16 && magic === 'NARC') {
        const declared = r.u32(8);
        return { kind: 'NARC', magic: printable, declaredSize: declared, sizeMatches: declared === b.length };
    }
    // Particle resources ("SPA" written backwards as " APS").
    if (magic === ' APS')
        return { kind: 'SPA', magic: printable, declaredSize: null, sizeMatches: null };
    return { kind: 'unknown', magic: printable, declaredSize: null, sizeMatches: null };
}
/** Section list of a Nitro file (e.g. MDL0 + TEX0), for display. */
export function nitroSections(b) {
    try {
        const r = new Reader(b);
        const n = r.u16(14);
        if (n > 16)
            return [];
        const out = [];
        for (let i = 0; i < n; i++) {
            const off = r.u32(16 + 4 * i);
            out.push({ magic: r.has(off, 4) ? r.ascii(off, 4).replace(/[^\x20-\x7e]/g, '·') : '?', offset: off });
        }
        return out;
    }
    catch {
        return [];
    }
}

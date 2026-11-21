/*
 * Bounds-checked little-endian reading for untrusted Nintendo DS "Nitro" files.
 * Every read is range-checked; a bad offset throws NitroError instead of reading
 * garbage or running past the buffer. Read-only: nothing here writes bytes.
 */
export class NitroError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'NitroError';
    }
}
export class Reader {
    b;
    dv;
    constructor(b) {
        this.b = b;
        this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    }
    get length() {
        return this.b.length;
    }
    has(o, n) {
        return Number.isInteger(o) && o >= 0 && n >= 0 && o + n <= this.b.length;
    }
    need(o, n, what = 'data') {
        if (!this.has(o, n))
            throw new NitroError('TRUNCATED', `${what} at 0x${Math.max(0, o).toString(16)} (+${n}) is outside the file (${this.b.length} bytes).`);
    }
    u8(o) {
        this.need(o, 1);
        return this.b[o];
    }
    u16(o) {
        this.need(o, 2);
        return this.dv.getUint16(o, true);
    }
    u32(o) {
        this.need(o, 4);
        return this.dv.getUint32(o, true);
    }
    s32(o) {
        this.need(o, 4);
        return this.dv.getInt32(o, true);
    }
    ascii(o, n) {
        this.need(o, n);
        let s = '';
        for (let i = 0; i < n; i++)
            s += String.fromCharCode(this.b[o + i]);
        return s;
    }
    /** 16-byte NUL-padded resource name (latin1, as in MaToRiuKo's viewer). */
    name16(o) {
        this.need(o, 16, 'name');
        let s = '';
        for (let i = 0; i < 16; i++) {
            const c = this.b[o + i];
            if (c === 0)
                break;
            s += String.fromCharCode(c);
        }
        return s;
    }
}
/** Signed 1.19.12 fixed point stored in 32 bits. */
export const fx32 = (v) => (v | 0) / 4096;
/** Signed 1.3.12 fixed point stored in 16 bits. */
export const fx16 = (v) => ((v << 16) >> 16) / 4096;
/**
 * Signed fixed point with `integer` integer bits and `frac` fraction bits plus a
 * sign bit (port of Tinke's Get_Double, as used by MaToRiuKo's bmdview.py).
 */
export function fixed(v, integer, frac) {
    v >>>= 0;
    let total = integer + frac;
    if (total >= 32)
        total = 31;
    let val;
    if ((v >>> total) & 1)
        val = integer === 0 ? -1 : ((v >>> frac) & ((1 << (integer + 1)) - 1)) - (1 << (integer + 1));
    else
        val = integer === 0 ? 0 : (v >>> frac) & ((1 << integer) - 1);
    const fm = (1 << frac) - 1;
    if (fm)
        val += (v & fm) / (fm + 1);
    return val;
}
/** RGB555 → [r, g, b] 0–255 (same rounding as bmdview.py). */
export const rgb555 = (v) => [(((v & 0x1f) * 255) / 31) | 0, ((((v >> 5) & 0x1f) * 255) / 31) | 0, ((((v >> 10) & 0x1f) * 255) / 31) | 0];
export function readDict(r, off, minEntrySize = 4) {
    const count = r.u8(off + 1);
    const dataHdr = off + 4 + 8 + count * 4;
    const entrySize = r.u16(dataHdr);
    if (count > 0 && entrySize < minEntrySize)
        throw new NitroError('BAD_STRUCTURE', `Dictionary at 0x${off.toString(16)} has ${entrySize}-byte entries (expected at least ${minEntrySize}).`);
    const first = dataHdr + 4;
    const namesAt = first + count * entrySize;
    r.need(namesAt, count * 16, 'dictionary names');
    const names = [];
    for (let i = 0; i < count; i++)
        names.push(r.name16(namesAt + i * 16));
    return { count, entrySize, entry: (i) => first + i * entrySize, names };
}

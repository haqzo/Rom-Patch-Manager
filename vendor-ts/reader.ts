/*
 * Bounds-checked little-endian reading for untrusted Nintendo DS "Nitro" files.
 * Every read is range-checked; a bad offset throws NitroError instead of reading
 * garbage or running past the buffer. Read-only: nothing here writes bytes.
 */

/** Viewer-only parse problems (not patch-engine error codes; never shown as build errors). */
export type NitroErrorCode = 'TRUNCATED' | 'BAD_MAGIC' | 'BAD_STRUCTURE' | 'TOO_LARGE';

export class NitroError extends Error {
  constructor(
    readonly code: NitroErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'NitroError';
  }
}

export class Reader {
  private readonly dv: DataView;
  constructor(readonly b: Uint8Array) {
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  get length() {
    return this.b.length;
  }
  has(o: number, n: number) {
    return Number.isInteger(o) && o >= 0 && n >= 0 && o + n <= this.b.length;
  }
  need(o: number, n: number, what = 'data') {
    if (!this.has(o, n)) throw new NitroError('TRUNCATED', `${what} at 0x${Math.max(0, o).toString(16)} (+${n}) is outside the file (${this.b.length} bytes).`);
  }
  u8(o: number) {
    this.need(o, 1);
    return this.b[o]!;
  }
  u16(o: number) {
    this.need(o, 2);
    return this.dv.getUint16(o, true);
  }
  u32(o: number) {
    this.need(o, 4);
    return this.dv.getUint32(o, true);
  }
  s32(o: number) {
    this.need(o, 4);
    return this.dv.getInt32(o, true);
  }
  ascii(o: number, n: number) {
    this.need(o, n);
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.b[o + i]!);
    return s;
  }
  /** 16-byte NUL-padded resource name (latin1, as in MaToRiuKo's viewer). */
  name16(o: number) {
    this.need(o, 16, 'name');
    let s = '';
    for (let i = 0; i < 16; i++) {
      const c = this.b[o + i]!;
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
}

/** Signed 1.19.12 fixed point stored in 32 bits. */
export const fx32 = (v: number) => (v | 0) / 4096;
/** Signed 1.3.12 fixed point stored in 16 bits. */
export const fx16 = (v: number) => ((v << 16) >> 16) / 4096;

/**
 * Signed fixed point with `integer` integer bits and `frac` fraction bits plus a
 * sign bit (port of Tinke's Get_Double, as used by MaToRiuKo's bmdview.py).
 */
export function fixed(v: number, integer: number, frac: number): number {
  v >>>= 0;
  let total = integer + frac;
  if (total >= 32) total = 31;
  let val: number;
  if ((v >>> total) & 1) val = integer === 0 ? -1 : ((v >>> frac) & ((1 << (integer + 1)) - 1)) - (1 << (integer + 1));
  else val = integer === 0 ? 0 : (v >>> frac) & ((1 << integer) - 1);
  const fm = (1 << frac) - 1;
  if (fm) val += (v & fm) / (fm + 1);
  return val;
}

/** RGB555 → [r, g, b] 0–255 (same rounding as bmdview.py). */
export const rgb555 = (v: number): [number, number, number] => [(((v & 0x1f) * 255) / 31) | 0, ((((v >> 5) & 0x1f) * 255) / 31) | 0, ((((v >> 10) & 0x1f) * 255) / 31) | 0];

/**
 * A Nitro "3D info" dictionary: count, then (after an 8 + 4·count byte tree) a
 * data block of fixed-size entries, then 16-byte names.
 */
export interface NitroDict {
  count: number;
  entrySize: number;
  /** File offset of entry i. */
  entry: (i: number) => number;
  names: string[];
}

export function readDict(r: Reader, off: number, minEntrySize = 4): NitroDict {
  const count = r.u8(off + 1);
  const dataHdr = off + 4 + 8 + count * 4;
  const entrySize = r.u16(dataHdr);
  if (count > 0 && entrySize < minEntrySize) throw new NitroError('BAD_STRUCTURE', `Dictionary at 0x${off.toString(16)} has ${entrySize}-byte entries (expected at least ${minEntrySize}).`);
  const first = dataHdr + 4;
  const namesAt = first + count * entrySize;
  r.need(namesAt, count * 16, 'dictionary names');
  const names: string[] = [];
  for (let i = 0; i < count; i++) names.push(r.name16(namesAt + i * 16));
  return { count, entrySize, entry: (i) => first + i * entrySize, names };
}

/*
 * Identify a Nintendo DS resource by its signature (never by file extension).
 * Says what each kind is and whether this version can preview it.
 */
import { Reader } from './reader.js';

export type NitroKind = 'BMD0' | 'BTX0' | 'BCA0' | 'BTA0' | 'BTP0' | 'BMA0' | 'BVA0' | 'NARC' | 'SPA' | 'empty' | 'unknown';

/** What the viewer can do with each kind in this milestone. */
export type PreviewSupport = 'model' | 'textures' | 'animation' | 'archive' | 'none';

export const KIND_SUPPORT: Record<NitroKind, PreviewSupport> = {
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

export interface Sniffed {
  kind: NitroKind;
  /** The first four bytes, printable characters only (e.g. "BMD0", " APS"). */
  magic: string;
  /** Size written in a Nitro file header, when there is one. */
  declaredSize: number | null;
  /** True when the header's size equals the real size (false = truncated or padded). */
  sizeMatches: boolean | null;
}

const NITRO = new Set(['BMD0', 'BTX0', 'BCA0', 'BTA0', 'BTP0', 'BMA0', 'BVA0']);

export function sniffNitro(b: Uint8Array): Sniffed {
  if (b.length === 0) return { kind: 'empty', magic: '', declaredSize: null, sizeMatches: null };
  const r = new Reader(b);
  const magic = r.ascii(0, Math.min(4, b.length));
  const printable = magic.replace(/[^\x20-\x7e]/g, '·');
  if (b.length >= 16 && NITRO.has(magic)) {
    const declared = r.u32(8);
    return { kind: magic as NitroKind, magic: printable, declaredSize: declared, sizeMatches: declared === b.length };
  }
  if (b.length >= 16 && magic === 'NARC') {
    const declared = r.u32(8);
    return { kind: 'NARC', magic: printable, declaredSize: declared, sizeMatches: declared === b.length };
  }
  // Particle resources ("SPA" written backwards as " APS").
  if (magic === ' APS') return { kind: 'SPA', magic: printable, declaredSize: null, sizeMatches: null };
  return { kind: 'unknown', magic: printable, declaredSize: null, sizeMatches: null };
}

/** Section list of a Nitro file (e.g. MDL0 + TEX0), for display. */
export function nitroSections(b: Uint8Array): { magic: string; offset: number }[] {
  try {
    const r = new Reader(b);
    const n = r.u16(14);
    if (n > 16) return [];
    const out: { magic: string; offset: number }[] = [];
    for (let i = 0; i < n; i++) {
      const off = r.u32(16 + 4 * i);
      out.push({ magic: r.has(off, 4) ? r.ascii(off, 4).replace(/[^\x20-\x7e]/g, '·') : '?', offset: off });
    }
    return out;
  } catch {
    return [];
  }
}

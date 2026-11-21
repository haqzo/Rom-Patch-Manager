/*
 * BCA0 (NSBCA) skeletal animation.
 *
 * Milestone 3 ported MaToRiuKo's bmdview.py parse_bca / _read_curve / _sample.
 * Milestone 4 reads the curves with the Nitro SDK layout instead, because on
 * MaToRiuKo's batch 1 that layout accounts for every byte of 99 of 99
 * animations (see layoutProof() and VIEWER-NOTES.md §5), where the milestone-3
 * reading accounted for 27 and overlapped in 22:
 *
 *   curve info word  bits  0–15  start (always 0 in batch 1)
 *                    bits 16–28  step 1: sample count; step 2/4: last frame that is interpolated
 *                    bit  29     samples are 16-bit (1.3.12) instead of 32-bit (1.19.12)
 *                    bits 30–31  frame step (0 = every frame, 1 = every 2nd, 2 = every 4th)
 *   scale samples    pairs (scale, 1/scale): 8 bytes per sample, 4 when 16-bit
 *   rotation samples 16-bit table indices (bit 15 = pivot table, else basis table)
 *   object info u32  bits 0–13 flags (identity / base / constant per component), bits 24–31 node id
 *
 * Read-only. Every read is bounds-checked; limits guard against hostile files.
 */
import { NitroError, Reader, fx16, fx32, readDict } from './reader.js';

export interface SampleCurve {
  kind: 'samples';
  start: number;
  /** Bits 16–28 of the info word (sample count for step 1, last interpolated frame otherwise). */
  end: number;
  /** log2 of the frame step (0, 1 or 2). */
  rate: number;
  /** Samples (fixed-point values, or raw table indices for rotations). */
  vals: number[];
  /** Inverse values stored next to scale samples (scale curves only). */
  inv: number[] | null;
  u16: boolean;
  /** File offset and length of the sample array (for the layout proof). */
  at: number;
  bytes: number;
}
export interface ConstCurve {
  kind: 'const';
  v: number;
  /** Stored inverse (scale constants only). */
  inv: number | null;
}
export type Curve = ConstCurve | SampleCurve;

/** How one component group (translation, rotation or scale) is animated. */
export type Channel = 'identity' | 'base' | 'curves';

export interface AnimObject {
  /** Low 16 bits of the object info word. */
  flags: number;
  /** Node this object drives (bits 24–31 of the info word). */
  node: number;
  /** False when the whole object is flagged identity (bit 0): the node's local matrix is the identity (Nitro SDK). */
  animated: boolean;
  tMode: Channel;
  rMode: Channel;
  sMode: Channel;
  t: [Curve | null, Curve | null, Curve | null];
  s: [Curve | null, Curve | null, Curve | null];
  rot: Curve | null;
}

export interface Bca0Anim {
  name: string;
  frames: number;
  objects: AnimObject[];
  /** File offsets of the pivot and basis rotation tables. */
  pivotTable: number;
  basisTable: number;
  /** Start of this animation block and end of the area it may use (next block or end of JNT0). */
  blockStart: number;
  blockEnd: number;
  /** End of the header, object table and object records. */
  headerEnd: number;
  r: Reader;
}

export interface Bca0 {
  animations: Bca0Anim[];
}

export const ANIM_LIMITS = { animations: 64, frames: 20_000, objects: 255, samples: 200_000 };

/** Number of samples a curve stores (Nitro SDK rules, verified by layoutProof on batch 1). */
export function sampleCount(info: number, frames: number): number {
  const end = (info >>> 16) & 0x1fff;
  const rate = (info >>> 30) & 3;
  if (rate === 0) return end;
  // Step 2/4: samples at 0, step, 2·step … up to the last interpolated frame (L),
  // then the frames after L that cannot be interpolated. The Nitro SDK reads them
  // as (step 2) index (L >> 1) + 1 for every frame after L, and (step 4) index
  // (L >> 2) + (frame & 3): one stored sample per remaining frame, up to three.
  // Milestone 4 stored one extra sample for step 4 too, which leaves the 2nd and
  // 3rd trailing samples unread (and their bytes outside the layout proof).
  const trailing = Math.max(0, frames - 1 - end);
  return (end >> rate) + 1 + (rate === 1 ? Math.min(1, trailing) : Math.min(3, trailing));
}

type CurveKind = 'T' | 'R' | 'S';

function readCurve(r: Reader, info: number, at: number, kind: CurveKind, frames: number): SampleCurve {
  const start = info & 0xffff;
  const end = (info >>> 16) & 0x1fff;
  const rate = (info >>> 30) & 3;
  if (rate === 3) throw new NitroError('BAD_STRUCTURE', 'Unknown animation frame step.');
  const n = sampleCount(info, frames);
  if (n > ANIM_LIMITS.samples) throw new NitroError('TOO_LARGE', `${n} animation samples.`);
  const u16 = kind === 'R' || ((info >>> 29) & 1) === 1;
  const width = (u16 ? 2 : 4) * (kind === 'S' ? 2 : 1);
  r.need(at, n * width, 'animation samples');
  const vals: number[] = [];
  const inv: number[] | null = kind === 'S' ? [] : null;
  for (let k = 0; k < n; k++) {
    const o = at + k * width;
    if (kind === 'R') vals.push(r.u16(o));
    else if (u16) {
      vals.push(fx16(r.u16(o)));
      if (inv) inv.push(fx16(r.u16(o + 2)));
    } else {
      vals.push(fx32(r.u32(o)));
      if (inv) inv.push(fx32(r.u32(o + 4)));
    }
  }
  return { kind: 'samples', start, end, rate, vals, inv, u16, at, bytes: n * width };
}

const channel = (identity: number, base: number): Channel => (identity ? 'identity' : base ? 'base' : 'curves');

export function parseBca0(b: Uint8Array): Bca0 {
  const r = new Reader(b);
  if (r.ascii(0, 4) !== 'BCA0') throw new NitroError('BAD_MAGIC', 'Not a BCA0 animation.');
  const jnt = r.u32(0x10);
  if (r.ascii(jnt, 4) !== 'JNT0') throw new NitroError('BAD_STRUCTURE', 'No JNT0 block.');
  const jntEnd = Math.min(b.length, jnt + r.u32(jnt + 4));
  const dict = readDict(r, jnt + 8, 4);
  if (dict.count > ANIM_LIMITS.animations) throw new NitroError('TOO_LARGE', `${dict.count} animations.`);
  const starts = Array.from({ length: dict.count }, (_, a) => jnt + r.u32(dict.entry(a)));
  const animations: Bca0Anim[] = [];
  for (let a = 0; a < dict.count; a++) {
    const js = starts[a]!;
    if (r.ascii(js, 4) !== 'J\x00AC') throw new NitroError('BAD_STRUCTURE', 'J.AC marker missing.');
    const frames = r.u16(js + 4);
    const nobj = r.u16(js + 6);
    if (frames > ANIM_LIMITS.frames || nobj > ANIM_LIMITS.objects) throw new NitroError('TOO_LARGE', `${frames} frames / ${nobj} objects.`);
    const pivotTable = js + r.u32(js + 12);
    const basisTable = js + r.u32(js + 16);
    const blockEnd = starts.filter((s) => s > js).reduce((m, s) => Math.min(m, s), jntEnd > js ? jntEnd : b.length);
    let headerEnd = js + 20 + 2 * nobj;
    const objects: AnimObject[] = [];
    for (let i = 0; i < nobj; i++) {
      const o = js + r.u16(js + 20 + 2 * i);
      const info = r.u32(o);
      const flags = info & 0xffff;
      const obj: AnimObject = {
        flags,
        node: info >>> 24,
        animated: (flags & 1) === 0,
        tMode: channel((flags >> 1) & 1, (flags >> 2) & 1),
        rMode: channel((flags >> 6) & 1, (flags >> 7) & 1),
        sMode: channel((flags >> 9) & 1, (flags >> 10) & 1),
        t: [null, null, null],
        s: [null, null, null],
        rot: null,
      };
      objects.push(obj);
      let q = o + 4;
      if (obj.animated) {
        if (obj.tMode === 'curves')
          for (let k = 0; k < 3; k++) {
            if ((flags >> (3 + k)) & 1) {
              obj.t[k] = { kind: 'const', v: fx32(r.u32(q)), inv: null };
              q += 4;
            } else {
              obj.t[k] = readCurve(r, r.u32(q), js + r.u32(q + 4), 'T', frames);
              q += 8;
            }
          }
        if (obj.rMode === 'curves') {
          if ((flags >> 8) & 1) {
            obj.rot = { kind: 'const', v: r.u16(q), inv: null };
            q += 4;
          } else {
            obj.rot = readCurve(r, r.u32(q), js + r.u32(q + 4), 'R', frames);
            q += 8;
          }
        }
        if (obj.sMode === 'curves')
          for (let k = 0; k < 3; k++) {
            if ((flags >> (11 + k)) & 1) {
              obj.s[k] = { kind: 'const', v: fx32(r.u32(q)), inv: fx32(r.u32(q + 4)) };
              q += 8;
            } else {
              obj.s[k] = readCurve(r, r.u32(q), js + r.u32(q + 4), 'S', frames);
              q += 8;
            }
          }
      }
      headerEnd = Math.max(headerEnd, q);
    }
    animations.push({ name: dict.names[a]!, frames, objects, pivotTable, basisTable, blockStart: js, blockEnd, headerEnd, r });
  }
  return { animations };
}

/**
 * Value of a curve at an integer frame, following the Nitro SDK:
 * step 1 → sample[frame]; step 2/4 → the sample on the step, linear in between,
 * and the extra last sample for frames after the last interpolated frame.
 * Out-of-range frames are clamped to the first or last sample.
 * Rotation curves hold table indices and must not be blended: use curveSamples().
 */
export function sampleCurve(c: Curve | null, frame: number): number | null {
  if (!c) return null;
  if (c.kind === 'const') return c.v;
  const s = curveSamples(c, frame);
  if (!s) return null;
  const [a, b, g] = s;
  return g === 0 ? c.vals[a]! : c.vals[a]! * (1 - g) + c.vals[b]! * g;
}

/** The two sample indices and blend weight a frame uses (null when the curve has no samples). */
export function curveSamples(c: SampleCurve, frame: number): [number, number, number] | null {
  const n = c.vals.length;
  if (!n) return null;
  const f = Math.max(0, Math.floor(frame) - c.start);
  if (c.rate === 0) {
    const i = Math.min(f, n - 1);
    return [i, i, 0];
  }
  const step = 1 << c.rate;
  const rem = f & (step - 1);
  // Nitro SDK order (GetTransData_ / GetRotData_ / GetScaleData_): a frame on the
  // step uses its own sample; any other frame after the last interpolated one uses
  // the trailing samples, (L >> 1) + 1 for step 2 and (L >> 2) + (frame & 3) for step 4.
  if (rem === 0) {
    const i = Math.min(f >> c.rate, n - 1);
    return [i, i, 0];
  }
  if (f > c.end) {
    const i = Math.min((c.end >> c.rate) + (c.rate === 1 ? 1 : rem), n - 1);
    return [i, i, 0];
  }
  const lo = Math.min(f >> c.rate, n - 1);
  if (lo + 1 >= n) return [lo, lo, 0];
  return [lo, lo + 1, rem / step];
}

// ---------------------------------------------------------------- layout proof

export interface LayoutRegion {
  at: number;
  bytes: number;
  what: string;
}

export interface LayoutProof {
  /** True when every referenced byte range is inside the block, none overlap, and every gap is explained. */
  proven: boolean;
  regions: number;
  overlaps: number;
  outOfBounds: number;
  /** Gaps of ≥ 4 bytes that are not zero padding followed by a converter label. */
  unexplainedGaps: number;
  /** Converter section labels found in gaps (for example TRANSLATION, ROTATION-MTX3). */
  labels: string[];
  /** First problem, for the details panel. */
  detail: string | null;
}

/** Zero padding and converter section labels (each followed by zero padding); false when anything else is there. */
function explainGap(r: Reader, from: number, to: number): string[] | false {
  const labels: string[] = [];
  let i = from;
  for (;;) {
    while (i < to && r.u8(i) === 0) i++;
    if (i === to) return labels;
    let label = '';
    while (i < to && r.u8(i) >= 0x20 && r.u8(i) < 0x7f) label += String.fromCharCode(r.u8(i++));
    if (!/^[A-Z0-9][A-Z0-9_-]{2,}$/.test(label) || (i < to && r.u8(i) !== 0)) return false;
    labels.push(label);
  }
}

/**
 * Checks that the curve layout this parser assumed is the one the file uses:
 * the header, every sample array and the parts of the rotation tables in use
 * must lie inside the animation's block without overlapping, and the bytes
 * between them may only be alignment padding or the ASCII section labels the
 * original converter writes ("TRANSLATION", "ROTATION-VAR-IDX", …). A wrong
 * sample width or count shifts or overlaps the arrays, so it fails this check.
 * The bytes after the last referenced region, up to the end of the block, are
 * judged the same way.
 */
export function layoutProof(anim: Bca0Anim): LayoutProof {
  const r = anim.r;
  const regs: LayoutRegion[] = [{ at: anim.blockStart, bytes: anim.headerEnd - anim.blockStart, what: 'header' }];
  let maxPivot = -1;
  let maxBasis = -1;
  const useIndex = (idx: number) => {
    if (idx & 0x8000) maxPivot = Math.max(maxPivot, idx & 0x7fff);
    else maxBasis = Math.max(maxBasis, idx & 0x7fff);
  };
  anim.objects.forEach((o, i) => {
    const add = (c: Curve | null, what: string) => {
      if (c && c.kind === 'samples' && c.bytes > 0) regs.push({ at: c.at, bytes: c.bytes, what: `${what}${i}` });
    };
    o.t.forEach((c, k) => add(c, `T${'xyz'[k]}`));
    o.s.forEach((c, k) => add(c, `S${'xyz'[k]}`));
    add(o.rot, 'R');
    if (o.rot) (o.rot.kind === 'const' ? [o.rot.v] : o.rot.vals).forEach(useIndex);
  });
  if (maxPivot >= 0) regs.push({ at: anim.pivotTable, bytes: 6 * (maxPivot + 1), what: 'pivot table' });
  if (maxBasis >= 0) regs.push({ at: anim.basisTable, bytes: 10 * (maxBasis + 1), what: 'basis table' });
  regs.sort((a, b) => a.at - b.at || a.bytes - b.bytes);
  // Identical ranges are shared data (the converter may reuse a curve).
  const uniq = regs.filter((x, i) => !(i > 0 && regs[i - 1]!.at === x.at && regs[i - 1]!.bytes === x.bytes));
  const out: LayoutProof = { proven: false, regions: uniq.length, overlaps: 0, outOfBounds: 0, unexplainedGaps: 0, labels: [], detail: null };
  let cur = uniq[0]!.at;
  for (const g of uniq) {
    if (g.at < anim.blockStart || g.at + g.bytes > anim.blockEnd) {
      out.outOfBounds++;
      out.detail ??= `${g.what} outside the animation block`;
      continue;
    }
    if (g.at < cur) {
      out.overlaps++;
      out.detail ??= `${g.what} overlaps the previous data`;
    } else if (g.at > cur) {
      const why = explainGap(r, cur, g.at);
      if (why === false && g.at - cur >= 4) {
        out.unexplainedGaps++;
        out.detail ??= `${g.at - cur} unexplained bytes before ${g.what}`;
      } else if (why) out.labels.push(...why);
    }
    cur = Math.max(cur, g.at + g.bytes);
  }
  // After the last referenced data only padding and labels may follow (batch 1: 99/99).
  if (cur < anim.blockEnd) {
    const why = explainGap(r, cur, anim.blockEnd);
    if (why === false && anim.blockEnd - cur >= 4) {
      out.unexplainedGaps++;
      out.detail ??= `${anim.blockEnd - cur} unexplained bytes after the animation data`;
    } else if (why) out.labels.push(...why);
  }
  out.proven = out.overlaps === 0 && out.outOfBounds === 0 && out.unexplainedGaps === 0;
  return out;
}

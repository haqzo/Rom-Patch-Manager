/*
 * Model poses, at rest or at an animation frame. Matrices are 4×4 row-major
 * acting on column vectors, as in bmdview.py.
 *
 * Two poses are offered (VIEWER-NOTES.md §4–5):
 *  - evaluatePose(): "file-consistent" (milestone 4, default). Runs the model's
 *    render commands as a matrix stack, applies the position scale, per-vertex
 *    stack slots, rot8 rest rotations and skinning. On MaToRiuKo's batch 1 this
 *    reproduces the bounding box stored in 152 of 154 files within 0.1 %.
 *  - nodeMatrices(): milestone 3 / bmdview.py (m_trs / node_matrices), one node
 *    matrix per polygon, kept unchanged for "As in MaToRiuKo's viewer".
 */
import type { AnimObject, Bca0Anim } from './bca0.js';
import { curveSamples, layoutProof, sampleCurve } from './bca0.js';
import type { Bmd0Model, NodeObject } from './bmd0.js';
import { fx16 } from './reader.js';

export type Mat4 = Float64Array;
type R9 = number[];

const I9: R9 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float64Array(16);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) o[r * 4 + c] = a[r * 4]! * b[c]! + a[r * 4 + 1]! * b[4 + c]! + a[r * 4 + 2]! * b[8 + c]! + a[r * 4 + 3]! * b[12 + c]!;
  return o;
}

export function trs(t: number[], r9: R9, s: number[]): Mat4 {
  return Float64Array.of(r9[0]! * s[0]!, r9[1]! * s[1]!, r9[2]! * s[2]!, t[0]!, r9[3]! * s[0]!, r9[4]! * s[1]!, r9[5]! * s[2]!, t[1]!, r9[6]! * s[0]!, r9[7]! * s[1]!, r9[8]! * s[2]!, t[2]!, 0, 0, 0, 1);
}

/** Pivot-compressed rotation (apicula rotation.rs, via bmdview.py). */
export function pivotMatrix(sel: number, neg: number, a: number, b: number): R9 {
  const o = (neg & 1) === 0 ? 1 : -1;
  const c = (neg & 2) === 0 ? b : -b;
  const d = (neg & 4) === 0 ? a : -a;
  const table: [number, number, number][][] = [
    [[o, 0, 0], [0, a, b], [0, c, d]],
    [[0, o, 0], [a, 0, b], [c, 0, d]],
    [[0, 0, o], [a, b, 0], [c, d, 0]],
    [[0, a, b], [o, 0, 0], [0, c, d]],
    [[a, 0, b], [0, o, 0], [c, 0, d]],
    [[a, b, 0], [0, 0, o], [c, d, 0]],
    [[0, a, b], [0, c, d], [o, 0, 0]],
    [[a, 0, b], [c, 0, d], [0, o, 0]],
    [[a, b, 0], [c, d, 0], [0, 0, o]],
  ];
  const cols = table[Math.min(sel, 8)]!;
  const r: R9 = new Array(9).fill(0);
  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) r[row * 3 + col] = cols[col]![row]!;
  return r;
}

/** 13-bit signed 1.0.12 component. */
const s13 = (v: number) => ((v << 19) >> 19) / 4096;

/**
 * Orthonormal basis stored in 5 u16 (apicula basis_mat, via bmdview.py).
 * Components are 13-bit signed: bmdview.py reads them as 16-bit, which gives a
 * valid rotation for 9 of the 2,911 basis entries in batch 1; sign-extending
 * from 13 bits gives a valid rotation for all 2,911.
 */
export function basisMatrix(d5: number[]): R9 {
  const inp = [d5[4]!, d5[0]!, d5[1]!, d5[2]!, d5[3]!];
  const out = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 5; i++) {
    out[i] = (inp[i]! >> 3) & 0x1fff;
    out[5] = ((out[5]! << 3) | (inp[i]! & 7)) & 0xffff;
  }
  const [ax, ay, az] = [s13(out[1]!), s13(out[2]!), s13(out[3]!)];
  const [bx, by, bz] = [s13(out[4]!), s13(out[0]!), s13(out[5]!)];
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  return [ax, bx, cx, ay, by, cy, az, bz, cz];
}

/** A real rotation: unit rows, determinant ±1 (tolerance for 1.3.12 rounding). */
export function isRotation(r: R9, tol = 0.02): boolean {
  for (let i = 0; i < 3; i++) {
    const n = Math.hypot(r[i * 3]!, r[i * 3 + 1]!, r[i * 3 + 2]!);
    if (!(Math.abs(n - 1) <= tol)) return false;
  }
  const det = r[0]! * (r[4]! * r[8]! - r[5]! * r[7]!) - r[1]! * (r[3]! * r[8]! - r[5]! * r[6]!) + r[2]! * (r[3]! * r[7]! - r[4]! * r[6]!);
  return Math.abs(Math.abs(det) - 1) <= tol * 3;
}

/** Milestone-3 rest rotation: pivot rotations only (rot8 shown unrotated, as in bmdview.py). */
export function restRotation(o: NodeObject): R9 {
  return o.pivot ? pivotMatrix(o.pivot.select, o.pivot.neg, o.pivot.a, o.pivot.b) : I9;
}

/** Rest rotation including decoded rot8 rotations (file-consistent pose). */
export function fullRestRotation(o: NodeObject): R9 {
  return o.pivot ? pivotMatrix(o.pivot.select, o.pivot.neg, o.pivot.a, o.pivot.b) : (o.rotation ?? I9);
}

export function animRotation(anim: Bca0Anim, idx: number): R9 {
  const r = anim.r;
  if ((idx >> 15) & 1) {
    const o = anim.pivotTable + 6 * (idx & 0x7fff);
    const selneg = r.u16(o);
    return pivotMatrix(selneg & 0xf, (selneg >> 4) & 0xf, fx16(r.u16(o + 2)), fx16(r.u16(o + 4)));
  }
  const o = anim.basisTable + 10 * (idx & 0x7fff);
  return basisMatrix([0, 1, 2, 3, 4].map((t) => r.u16(o + 2 * t)));
}

export interface PoseOptions {
  /** MaToRiuKo's rule (bmdview.py 1.2.16): object translation keeps only X/Z (checked against CTRMap on battle backgrounds). */
  ignoreVerticalOffset: boolean;
}

/**
 * Milestone-3 pose (bmdview.py node_matrices): world matrix of every node via the
 * parent table, at rest (anim = null) or at a frame. Kept for comparison only.
 */
export function nodeMatrices(model: Bmd0Model, anim: Bca0Anim | null, frame: number, opt: PoseOptions): Mat4[] {
  const locals: Mat4[] = model.objects.map((o, i) => {
    const a = anim && i < anim.objects.length && anim.objects[i]!.animated ? anim.objects[i]! : null;
    if (!a) return trs(o.t, restRotation(o), o.legacyS);
    const t = [0, 1, 2].map((k) => sampleCurve(a.t[k]!, frame) ?? o.t[k]!);
    const s = [0, 1, 2].map((k) => sampleCurve(a.s[k]!, frame) ?? o.legacyS[k]!);
    const rv = rotationIndex(a, frame);
    return trs(t, rv === null ? restRotation(o) : animRotation(anim!, rv), s);
  });
  if (opt.ignoreVerticalOffset) for (const m of locals) m[7] = 0;
  const cache = new Map<number, Mat4>();
  const world = (i: number, depth: number): Mat4 => {
    const hit = cache.get(i);
    if (hit) return hit;
    const p = model.parent[i] ?? -1;
    const m = p < 0 || p === i || p >= locals.length || depth > 64 ? locals[i]! : mul(world(p, depth + 1), locals[i]!);
    cache.set(i, m);
    return m;
  };
  return locals.map((_, i) => world(i, 0));
}

/** Rotation-table index a rotation curve uses at a frame (nearest sample; null when none). */
function rotationIndex(a: AnimObject, frame: number): number | null {
  const c = a.rot;
  if (!c) return null;
  if (c.kind === 'const') return c.v;
  const s = curveSamples(c, frame);
  if (!s) return null;
  return c.vals[s[2] >= 0.5 ? s[1] : s[0]]!;
}

/**
 * Rotation of an animated object at a frame. Between two stored rotations (frame
 * steps 2 and 4) the two matrices are blended and re-orthonormalised, as the
 * Nitro SDK interpolates; on a stored frame the table entry is used as is.
 */
export function animatedRotation(anim: Bca0Anim, a: AnimObject, frame: number): R9 | null {
  const c = a.rot;
  if (!c) return null;
  if (c.kind === 'const') return animRotation(anim, c.v);
  const s = curveSamples(c, frame);
  if (!s) return null;
  const [i, j, g] = s;
  const r0 = animRotation(anim, c.vals[i]!);
  if (g === 0) return r0;
  const r1 = animRotation(anim, c.vals[j]!);
  return orthonormalize(r0.map((v, k) => v * (1 - g) + r1[k]! * g));
}

/** Gram–Schmidt on the columns (x, then y; z = x × y). */
function orthonormalize(m: R9): R9 {
  const n = (v: number[]) => {
    const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
    return v.map((x) => x / l);
  };
  const x = n([m[0]!, m[3]!, m[6]!]);
  let y = [m[1]!, m[4]!, m[7]!];
  const d = x[0]! * y[0]! + x[1]! * y[1]! + x[2]! * y[2]!;
  y = n(y.map((v, k) => v - d * x[k]!));
  const z = [x[1]! * y[2]! - x[2]! * y[1]!, x[2]! * y[0]! - x[0]! * y[2]!, x[0]! * y[1]! - x[1]! * y[0]!];
  return [x[0]!, y[0]!, z[0]!, x[1]!, y[1]!, z[1]!, x[2]!, y[2]!, z[2]!];
}

// ---------------------------------------------------------------- file-consistent pose

const IDENTITY = (): Mat4 => Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
const scaleMat = (k: number): Mat4 => Float64Array.of(k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1);

/** Usable position scale (a damaged header falls back to 1). */
export function usablePosScale(model: Bmd0Model): { up: number; down: number } {
  const ok = (v: number) => Number.isFinite(v) && v > 0 && v < 65536;
  if (!ok(model.posScale)) return { up: 1, down: 1 };
  return { up: model.posScale, down: ok(model.invPosScale) ? model.invPosScale : 1 / model.posScale };
}

/**
 * Local matrix of a node: its rest transform, or the animation's value where the
 * animation drives it. Animation flags (Nitro SDK): "identity" means T = 0,
 * R = I or S = 1; "base" means the model's rest value; otherwise the curves.
 */
export function localMatrix(o: NodeObject, a: AnimObject | null, anim: Bca0Anim | null, frame: number): Mat4 {
  if (!a || !anim) return trs(o.t, fullRestRotation(o), o.s);
  if (!a.animated) return IDENTITY();
  const t = a.tMode === 'identity' ? [0, 0, 0] : a.tMode === 'base' ? o.t : [0, 1, 2].map((k) => sampleCurve(a.t[k]!, frame) ?? o.t[k]!);
  const s = a.sMode === 'identity' ? [1, 1, 1] : a.sMode === 'base' ? o.s : [0, 1, 2].map((k) => sampleCurve(a.s[k]!, frame) ?? o.s[k]!);
  const r = a.rMode === 'identity' ? I9 : a.rMode === 'base' ? fullRestRotation(o) : (animatedRotation(anim, a, frame) ?? fullRestRotation(o));
  return trs(t, r, s);
}

export interface ModelPose {
  /** Matrix for vertices without a stack slot, per polygon (null = polygon never drawn). */
  polygon: (Mat4 | null)[];
  /** Matrix stack at the moment each polygon is drawn (for per-vertex slots); null when unused. */
  stack: (Mat4[] | null)[];
  /**
   * Polygons drawn while the last visibility command (0x02) said "hidden". The Nitro
   * SDK keeps one running flag (NODE sets it, SHP draws only while it is set);
   * milestone 4 keyed it to the last NODEDESC node instead. Not applied to the mesh.
   */
  hidden: boolean[];
  /**
   * Billboard state of each drawn polygon (null = none): the matrix the billboard
   * command acted on (`base`) and the transforms applied after it (`extra`: child
   * nodes, position scale). The game turns `base` to face the camera, keeping its
   * translation and axis scales (Nitro SDK BB / BBY); see billboardVertex().
   */
  billboard: (BillboardState | null)[];
}

export interface BillboardState {
  base: Mat4;
  extra: Mat4;
  yOnly: boolean;
}

/**
 * Runs the model's render commands as the DS does: node commands multiply the
 * current matrix by the node's local matrix (loading from / storing to the
 * 32-slot matrix stack), 0x0b / 0x2b apply the position scale, skinning stores a
 * weighted sum of stack × inverse-bind matrices, and each draw remembers the
 * current matrix and the stack for the display list's per-vertex slots.
 */
export function evaluatePose(model: Bmd0Model, anim: Bca0Anim | null, frame: number, opt: PoseOptions): ModelPose {
  const byNode = new Map<number, AnimObject>();
  if (anim) for (const a of anim.objects) if (!byNode.has(a.node)) byNode.set(a.node, a);
  const { up, down } = usablePosScale(model);
  const locals = model.objects.map((o, i) => {
    const m = localMatrix(o, byNode.get(i) ?? null, anim, frame);
    if (opt.ignoreVerticalOffset) m[7] = 0;
    return m;
  });
  const stack: Mat4[] = Array.from({ length: 32 }, IDENTITY);
  const n = model.polygons.length;
  const pose: ModelPose = { polygon: new Array(n).fill(null), stack: new Array(n).fill(null), hidden: new Array(n).fill(false), billboard: new Array(n).fill(null) };
  let visible = true;
  let cur = IDENTITY();
  // Billboard bookkeeping follows the matrices through the same stack slots.
  let bb = null as BillboardState | null;
  const slotBB: (BillboardState | null)[] = new Array(32).fill(null);
  for (const op of model.ops) {
    switch (op.op) {
      case 'node': {
        if (op.load >= 0) {
          cur = stack[op.load]!;
          bb = slotBB[op.load]!;
        }
        const local = locals[op.node] ?? IDENTITY();
        cur = mul(cur, local);
        if (bb) bb = { base: bb.base, extra: mul(bb.extra, local), yOnly: bb.yOnly };
        if (op.store >= 0) {
          stack[op.store] = cur;
          slotBB[op.store] = bb;
        }
        break;
      }
      case 'billboard':
        // `cur` keeps the unturned matrix (bounds, evidence, the milestone-4 look);
        // the turn itself needs the camera and is applied by the viewer.
        if (op.load >= 0) cur = stack[op.load]!;
        bb = { base: cur, extra: IDENTITY(), yOnly: op.yOnly };
        if (op.store >= 0) {
          stack[op.store] = cur;
          slotBB[op.store] = bb;
        }
        break;
      case 'restore':
        cur = stack[op.slot]!;
        bb = slotBB[op.slot]!;
        break;
      case 'posScale': {
        const sm = scaleMat(op.up ? up : down);
        cur = mul(cur, sm);
        if (bb) bb = { base: bb.base, extra: mul(bb.extra, sm), yOnly: bb.yOnly };
        break;
      }
      case 'skin': {
        const acc = new Float64Array(16);
        for (const t of op.terms) {
          const ib = model.invBinds.get(t.invBind);
          if (!ib) continue;
          const m = mul(stack[t.slot]!, ib);
          for (let e = 0; e < 12; e++) acc[e]! += t.weight * m[e]!;
        }
        acc[15] = 1;
        stack[op.store] = acc;
        slotBB[op.store] = null;
        break;
      }
      case 'visibility':
        visible = op.visible;
        break;
      case 'draw': {
        const p = model.polygons[op.polygon];
        if (!p || pose.polygon[op.polygon]) break;
        pose.polygon[op.polygon] = cur;
        if (p.slots.some((s) => s >= 0)) pose.stack[op.polygon] = stack.slice();
        pose.hidden[op.polygon] = !visible;
        // Per-vertex stack slots (skinned / multi-node lists) are not billboarded.
        pose.billboard[op.polygon] = bb && !p.slots.some((s) => s >= 0) ? bb : null;
        break;
      }
      default:
        break;
    }
  }
  return pose;
}

// ---------------------------------------------------------------- evidence

export interface ModelEvidence {
  /** Largest difference between the posed rest bounds and the declared box, relative to its diagonal (null = no box). */
  boxError: number | null;
  /** Same for the milestone-3 pose. */
  legacyBoxError: number | null;
  /** Skinning: number of terms and largest |stack × inverse bind − I| at rest (translation relative to the box). */
  skinTerms: number;
  skinError: number | null;
  /** rot8 rotations decoded / present. */
  rot8: { decoded: number; total: number };
}

/** Box agreement within this fraction of the diagonal counts as "matches the declared box". */
export const BOX_TOLERANCE = 0.001;
/** Skinning counts as verified when every term is the identity within this tolerance at rest. */
export const SKIN_TOLERANCE = 0.01;

function boundsOf(points: (fn: (x: number, y: number, z: number) => void) => void) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  points((x, y, z) => {
    const v = [x, y, z];
    for (let k = 0; k < 3; k++) {
      if (v[k]! < min[k]!) min[k] = v[k]!;
      if (v[k]! > max[k]!) max[k] = v[k]!;
    }
  });
  return { min, max };
}

function boxError(b: { min: number[]; max: number[] }, d: Bmd0Model['declaredBox']): number | null {
  if (!d || !Number.isFinite(b.min[0]!)) return null;
  const diag = Math.hypot(d.max[0] - d.min[0], d.max[1] - d.min[1], d.max[2] - d.min[2]);
  if (!(diag > 0)) return null;
  let e = 0;
  for (let k = 0; k < 3; k++) e = Math.max(e, Math.abs(b.min[k]! - d.min[k]!), Math.abs(b.max[k]! - d.max[k]!));
  return e / diag;
}

/** Transforms a vertex of polygon p with the file-consistent pose. */
export function poseVertex(pose: ModelPose, model: Bmd0Model, p: number, v: number, out: number[]): boolean {
  const poly = model.polygons[p]!;
  const slot = poly.slots[v]!;
  const m = slot >= 0 && pose.stack[p] ? pose.stack[p]![slot]! : pose.polygon[p];
  if (!m) return false;
  const x = poly.positions[v * 3]!, y = poly.positions[v * 3 + 1]!, z = poly.positions[v * 3 + 2]!;
  out[0] = m[0]! * x + m[1]! * y + m[2]! * z + m[3]!;
  out[1] = m[4]! * x + m[5]! * y + m[6]! * z + m[7]!;
  out[2] = m[8]! * x + m[9]! * y + m[10]! * z + m[11]!;
  return true;
}

/**
 * What the file itself says about this viewer's rest pose: agreement with the
 * converter's declared bounding box (both poses), skinning residual, rot8 count.
 */
export function modelEvidence(model: Bmd0Model): ModelEvidence {
  const opt = { ignoreVerticalOffset: false };
  const pose = evaluatePose(model, null, 0, opt);
  const o = [0, 0, 0];
  const fileBox = boundsOf((f) => model.polygons.forEach((p, pi) => { for (let v = 0; v < p.triangles * 3; v++) if (poseVertex(pose, model, pi, v, o)) f(o[0]!, o[1]!, o[2]!); }));
  const legacy = nodeMatrices(model, null, 0, opt);
  const legacyBox = boundsOf((f) =>
    model.polygons.forEach((p) => {
      const m = legacy[p.node];
      for (let v = 0; v < p.triangles * 3; v++) {
        const x = p.positions[v * 3]!, y = p.positions[v * 3 + 1]!, z = p.positions[v * 3 + 2]!;
        if (m) f(m[0]! * x + m[1]! * y + m[2]! * z + m[3]!, m[4]! * x + m[5]! * y + m[6]! * z + m[7]!, m[8]! * x + m[9]! * y + m[10]! * z + m[11]!);
        else f(x, y, z);
      }
    }),
  );
  // Skinning at rest: every stack × inverse-bind product must be the identity.
  let skinTerms = 0;
  let skinError: number | null = null;
  if (model.usesSkinning) {
    const locals = model.objects.map((ob) => trs(ob.t, fullRestRotation(ob), ob.s));
    const stack: Mat4[] = Array.from({ length: 32 }, IDENTITY);
    let cur = IDENTITY();
    const d = model.declaredBox;
    const span = d ? Math.max(1, Math.hypot(d.max[0] - d.min[0], d.max[1] - d.min[1], d.max[2] - d.min[2])) : 1;
    skinError = 0;
    for (const op of model.ops) {
      if (op.op === 'node') {
        if (op.load >= 0) cur = stack[op.load]!;
        cur = mul(cur, locals[op.node] ?? IDENTITY());
        if (op.store >= 0) stack[op.store] = cur;
      } else if (op.op === 'restore') cur = stack[op.slot]!;
      else if (op.op === 'billboard') {
        if (op.load >= 0) cur = stack[op.load]!;
        if (op.store >= 0) stack[op.store] = cur;
      } else if (op.op === 'skin') {
        const acc = new Float64Array(16);
        for (const t of op.terms) {
          skinTerms++;
          const ib = model.invBinds.get(t.invBind);
          if (!ib) {
            skinError = Infinity;
            continue;
          }
          const m = mul(stack[t.slot]!, ib);
          for (let e = 0; e < 12; e++) {
            const want = e === 0 || e === 5 || e === 10 ? 1 : 0;
            const err = Math.abs(m[e]! - want) / (e % 4 === 3 ? span : 1);
            if (!(err <= skinError)) skinError = Number.isFinite(err) ? Math.max(skinError, err) : Infinity;
            acc[e]! += t.weight * m[e]!;
          }
        }
        acc[15] = 1;
        stack[op.store] = acc;
      }
    }
  }
  const rot8 = model.objects.filter((ob) => ob.rotation || ob.undecodedRotation);
  return {
    boxError: boxError(fileBox, model.declaredBox),
    legacyBoxError: boxError(legacyBox, model.declaredBox),
    skinTerms,
    skinError,
    rot8: { decoded: rot8.filter((ob) => ob.rotation).length, total: rot8.length },
  };
}

const evidenceCache = new WeakMap<Bmd0Model, ModelEvidence>();
/** modelEvidence(), computed once per parsed model. */
export function cachedEvidence(model: Bmd0Model): ModelEvidence {
  let ev = evidenceCache.get(model);
  if (!ev) evidenceCache.set(model, (ev = modelEvidence(model)));
  return ev;
}

/** Skinning is usable when the file's inverse-bind matrices undo the rest pose exactly. */
export function skinningVerified(model: Bmd0Model, ev?: ModelEvidence): boolean {
  if (!model.usesSkinning) return true;
  const e = ev ?? cachedEvidence(model);
  return e.skinTerms > 0 && e.skinError !== null && e.skinError <= SKIN_TOLERANCE;
}

/**
 * Largest animated scale / translation the preview accepts (model units). Milestone 3
 * capped scale at 64; scale values are now proven by their stored inverses, and the
 * batch-1 title screen uses 70 and 160, so the cap is only a last guard.
 */
export const ANIM_PLAUSIBLE = { scale: 1024, translation: 4096 };

export interface AnimationCheck {
  playable: boolean;
  /** Why playback is not offered. */
  reason: null | 'objectCount' | 'invalidRotation' | 'implausibleValues' | 'unreadable' | 'skinning' | 'noFrames' | 'layout' | 'scalePairs' | 'nodeIds';
  /** First problem found, for the details panel. */
  detail: string | null;
}

/** Scale samples count as consistent when scale × stored inverse is 1 within this tolerance. */
export const SCALE_PAIR_TOLERANCE = 0.01;

/**
 * Reliability gate (milestone 4). Playback is offered only when all hold:
 *  1. the animation has frames and drives exactly the model's nodes;
 *  2. a skinned model's inverse-bind matrices undo its rest pose (skinningVerified);
 *  3. the curve layout is proven by the file itself (layoutProof);
 *  4. every rotation index used decodes to a real rotation;
 *  5. every scale sample agrees with the inverse the converter stored next to it;
 *  6. every translation and scale value is plausible.
 * None of this shows how the game plays the animation; the preview stays Experimental.
 */
export function checkAnimation(model: Bmd0Model, anim: Bca0Anim, skinOk?: boolean): AnimationCheck {
  if (anim.frames < 1) return { playable: false, reason: 'noFrames', detail: null };
  if (anim.objects.length !== model.objects.length) return { playable: false, reason: 'objectCount', detail: `${anim.objects.length} ≠ ${model.objects.length}` };
  const badNode = anim.objects.findIndex((o, i) => o.node !== i);
  if (badNode >= 0) return { playable: false, reason: 'nodeIds', detail: `object ${badNode} → node ${anim.objects[badNode]!.node}` };
  if (model.usesSkinning && !(skinOk ?? skinningVerified(model))) return { playable: false, reason: 'skinning', detail: null };
  try {
    const proof = layoutProof(anim);
    if (!proof.proven) return { playable: false, reason: 'layout', detail: proof.detail };
    for (let i = 0; i < anim.objects.length; i++) {
      const rot = anim.objects[i]!.rot;
      if (!rot) continue;
      const indices = rot.kind === 'const' ? [rot.v] : rot.vals;
      for (const idx of new Set(indices)) {
        if (!isRotation(animRotation(anim, idx | 0))) return { playable: false, reason: 'invalidRotation', detail: `object ${i}, rotation #${idx & 0x7fff}` };
      }
    }
    // Scale samples are stored with their inverse: the pair must agree.
    for (let i = 0; i < anim.objects.length; i++) {
      for (const c of anim.objects[i]!.s) {
        if (!c) continue;
        const pairs: [number, number][] = c.kind === 'const' ? (c.inv === null ? [] : [[c.v, c.inv]]) : c.vals.map((v, k) => [v, c.inv?.[k] ?? NaN]);
        // Tolerance plus the rounding of both stored values (1/4096 per value in 1.x.12).
        const bad = pairs.find(([v, inv]) => v !== 0 && !(Math.abs(v * inv - 1) <= SCALE_PAIR_TOLERANCE + (Math.abs(v) + Math.abs(inv)) / 4096));
        if (bad) return { playable: false, reason: 'scalePairs', detail: `object ${i}, scale ${bad[0]} × ${bad[1]}` };
      }
    }
    // Scale and translation values must be plausible (a last guard; milestone 3's only check).
    for (let i = 0; i < anim.objects.length; i++) {
      const o = anim.objects[i]!;
      for (const [what, curves, limit] of [['scale', o.s, ANIM_PLAUSIBLE.scale], ['translation', o.t, ANIM_PLAUSIBLE.translation]] as const)
        for (const c of curves) {
          const vals = !c ? [] : c.kind === 'const' ? [c.v] : c.vals;
          const bad = vals.find((v) => !Number.isFinite(v) || Math.abs(v) > limit);
          if (bad !== undefined) return { playable: false, reason: 'implausibleValues', detail: `object ${i}, ${what} ${bad}` };
        }
    }
  } catch (e) {
    return { playable: false, reason: 'unreadable', detail: (e as Error).message };
  }
  return { playable: true, reason: null, detail: null };
}

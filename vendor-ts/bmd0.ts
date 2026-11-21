/*
 * BMD0 (NSBMD) model parsing — a TypeScript port of MaToRiuKo's bmdview.py
 * (romtool 1.2.16, credited with permission), extended where measurements on
 * his batch-1 files showed it was needed. Every difference from bmdview.py is
 * listed in VIEWER-NOTES.md. Read-only: produces plain arrays for display.
 *
 * Milestone 4 adds what the file-consistent pose needs (pose.ts evaluatePose):
 * the position scale, the declared bounding box, rot8 rest rotations, the
 * inverse-bind matrices used by skinning, and the render commands as a list of
 * operations for the matrix-stack simulation. The milestone-3 fields are kept
 * unchanged so "As in MaToRiuKo's viewer" still reproduces bmdview.py.
 */
import { NitroError, Reader, fixed, fx16, fx32, readDict, rgb555 } from './reader.js';
import { paletteByName, parseTex0, type PalInfo, type Tex0, type TexInfo } from './tex0.js';

export interface NodeObject {
  name: string;
  flag: number;
  t: [number, number, number];
  s: [number, number, number];
  /** Pivot rotation (select, negate, a, b) when the object uses one. */
  pivot: { select: number; neg: number; a: number; b: number } | null;
  /**
   * Full 3×3 rest rotation ("rot8": the value at +2 plus eight 1.3.12 values),
   * row-major for column vectors. Null when the object has none or it is not a
   * valid rotation (then undecodedRotation is true).
   */
  rotation: number[] | null;
  /** True when the object has a non-pivot rest rotation that could not be decoded (shown unrotated). */
  undecodedRotation: boolean;
  /**
   * Scale as bmdview.py 1.2.16 reads it. For objects with a rot8 rotation it skips
   * the 16 rotation bytes, so it reads them as scale; kept only for the
   * "As in MaToRiuKo's viewer" pose. Equal to s for every other object.
   */
  legacyS: [number, number, number];
}

/** One model render command (SBC), in file order. */
export type SbcOp =
  | { op: 'node'; node: number; parent: number; flags: number; store: number; load: number }
  | { op: 'restore'; slot: number }
  | { op: 'material'; material: number }
  | { op: 'draw'; polygon: number }
  | { op: 'skin'; store: number; terms: { slot: number; invBind: number; weight: number }[] }
  | { op: 'posScale'; up: boolean }
  /** Billboard (0x07 / 0x08 and their 0x20 store / 0x40 load forms); store / load are stack slots or −1. */
  | { op: 'billboard'; node: number; yOnly: boolean; store: number; load: number }
  | { op: 'visibility'; node: number; visible: boolean };

export interface Material {
  name: string;
  diffuse: [number, number, number];
  ambient: [number, number, number];
  /** 0–31 (31 = opaque). */
  alpha: number;
  renderFront: boolean;
  renderBack: boolean;
  /** TEXIMAGE_PARAM bits 16–19: repeat S/T, flip S/T. */
  repeatS: boolean;
  repeatT: boolean;
  flipS: boolean;
  flipT: boolean;
  texture: string | null;
  palette: string | null;
  /** How the palette was chosen. */
  paletteFrom: 'table' | 'name' | null;
  /** File offset of the material record (read-only diagnostics). */
  fileOffset: number;
  /** POLYGON_ATTR bits 4–5: 0 modulate, 1 decal, 2 toon/highlight, 3 shadow (GBATEK). */
  polygonMode: 0 | 1 | 2 | 3;
  /** POLYGON_ATTR bits 0–3: lights enabled. */
  lightMask: number;
  /** POLYGON_ATTR bit 11: translucent pixels write depth. */
  translucentDepthUpdate: boolean;
  /** POLYGON_ATTR bits 24–29. */
  polygonId: number;
  /** DIF_AMB bit 15: the diffuse colour is set as the vertex colour when the material is applied. */
  diffuseAsVertexColour: boolean;
}

export interface Polygon {
  name: string;
  material: number;
  /** Node whose matrix applies when a vertex has no matrix-stack slot. */
  node: number;
  /** Triangles: 3 vertices each. Positions are in the model's local units (before node transforms). */
  positions: Float32Array;
  /** Texture coordinates in texels (divide by texture size for 0–1). */
  uvs: Float32Array;
  colors: Float32Array;
  /** 1 where a COLOR command (0x20) in this list set the vertex colour; 0 = the colour the material left. */
  colorSet: Uint8Array;
  /** True when the list has NORMAL commands (the DS lights these vertices when the material enables lights). */
  normals: boolean;
  /** Matrix-stack slot active for each vertex (−1 = none). */
  slots: Int16Array;
  triangles: number;
  /** File offset and size of the display list (read-only diagnostics). */
  displayList: { at: number; size: number };
}

export interface Bmd0Model {
  name: string;
  declared: { vertices: number; polygons: number; triangles: number; quads: number };
  objects: NodeObject[];
  /** parent[node] = parent node, or −1. */
  parent: number[];
  /** Matrix-stack slot → node stored there by the render commands (−1 = unknown/skinned). */
  slotNode: number[];
  materials: Material[];
  polygons: Polygon[];
  usesSkinning: boolean;
  /** Render-command opcodes this viewer did not understand (parsing stopped there). */
  unknownCommands: number[];
  /** Header position scale (vertices are stored divided by it) and its stored inverse. */
  posScale: number;
  invPosScale: number;
  /** Bounding box the original converter stored in the header, in model units (null if unusable). */
  declaredBox: { min: [number, number, number]; max: [number, number, number] } | null;
  /** Header scaling rule: 0 standard, 1 Maya segment-scale-compensate, 2 Softimage. */
  scalingRule: number;
  /** Render commands in file order. */
  ops: SbcOp[];
  /** Inverse-bind matrices by id (4×4 row-major, column vectors); only ids used by skinning are read. */
  invBinds: Map<number, Float64Array>;
  /** Nodes drawn as billboards (they face the camera in the game; drawn unturned here). */
  billboards: number;
  /** File offset of the model block (its render commands start at +4's offset; read-only diagnostics). */
  fileOffset: number;
}

export interface Bmd0 {
  models: Bmd0Model[];
  tex0: Tex0 | null;
  /** All textures in the file (some may not be used by any material). */
  textures: TexInfo[];
  palettes: PalInfo[];
}

/** Hard limits against malformed or hostile files. */
export const LIMITS = { models: 64, polygons: 1024, triangles: 600_000, objects: 255 };

/** Parameter counts of display-list commands (from bmdview.py's CMDSIZE; also used by diagnose.ts). */
export const CMDSIZE: Readonly<Record<number, number>> = {
  0x10: 1, 0x11: 0, 0x12: 1, 0x13: 1, 0x14: 1, 0x15: 0, 0x16: 16, 0x17: 12, 0x18: 16, 0x19: 12, 0x1a: 9, 0x1b: 3, 0x1c: 3,
  0x20: 1, 0x21: 1, 0x22: 1, 0x23: 2, 0x24: 1, 0x25: 1, 0x26: 1, 0x27: 1, 0x28: 1, 0x29: 1, 0x2a: 1, 0x2b: 1,
  0x30: 1, 0x31: 1, 0x32: 1, 0x33: 1, 0x34: 32, 0x40: 1, 0x41: 0, 0x50: 1, 0x60: 1, 0x70: 3, 0x71: 2, 0x72: 1,
};

interface Vtx {
  p: [number, number, number];
  uv: [number, number];
  c: [number, number, number];
  /** A COLOR command set c (otherwise c is the default white). */
  cs: boolean;
  slot: number;
}

/** Display list → triangles (bmdview.py read_display + build_tris, plus MTX_RESTORE slots). */
function buildTriangles(r: Reader, base: number, size: number, budget: { tris: number }, info: { normals: boolean } = { normals: false }): Vtx[][] {
  const tris: Vtx[][] = [];
  let colorSet = false;
  let pos: [number, number, number] = [0, 0, 0];
  let uv: [number, number] = [0, 0];
  let color: [number, number, number] = [1, 1, 1];
  let scl: [number, number, number] = [1, 1, 1];
  let slot = -1;
  let verts: Vtx[] = [];
  let mode: number | null = null;
  const add = () => verts.push({ p: [pos[0] * scl[0], pos[1] * scl[1], pos[2] * scl[2]], uv: [uv[0], uv[1]], c: [color[0], color[1], color[2]], cs: colorSet, slot });
  const flush = () => {
    const n = verts.length;
    const v = verts;
    if (mode === 0) for (let i = 0; i + 2 < n; i += 3) tris.push([v[i]!, v[i + 1]!, v[i + 2]!]);
    else if (mode === 1)
      for (let i = 0; i + 3 < n; i += 4) {
        tris.push([v[i]!, v[i + 1]!, v[i + 2]!]);
        tris.push([v[i]!, v[i + 2]!, v[i + 3]!]);
      }
    else if (mode === 2) for (let i = 0; i + 2 < n; i++) tris.push(i % 2 === 0 ? [v[i]!, v[i + 1]!, v[i + 2]!] : [v[i + 1]!, v[i]!, v[i + 2]!]);
    else if (mode === 3)
      // Quad strip: each quad is v[i], v[i+1], v[i+3], v[i+2] (MaToRiuKo's 1.2.15 fix).
      for (let i = 0; i + 3 < n; i += 2) {
        tris.push([v[i]!, v[i + 1]!, v[i + 3]!]);
        tris.push([v[i]!, v[i + 3]!, v[i + 2]!]);
      }
    verts = [];
    if (tris.length > budget.tris) throw new NitroError('TOO_LARGE', `More than ${LIMITS.triangles} triangles.`);
  };
  const end = base + size;
  r.need(base, size, 'display list');
  let l = base;
  while (l + 4 <= end) {
    const ids = [r.u8(l), r.u8(l + 1), r.u8(l + 2), r.u8(l + 3)];
    l += 4;
    for (const c of ids) {
      const sz = CMDSIZE[c];
      // 0x00 pads unused id slots: skip the slot, keep reading (bmdview.py 1.2.11).
      if (sz === undefined) continue;
      if (l + sz * 4 > end) {
        flush();
        return tris;
      }
      const p: number[] = [];
      for (let k = 0; k < sz; k++) p.push(r.u32(l + 4 * k));
      l += sz * 4;
      const a = p[0] ?? 0;
      switch (c) {
        case 0x14:
          slot = a & 31;
          break;
        case 0x23:
          pos = [fixed(a & 0xffff, 3, 12), fixed(a >>> 16, 3, 12), fixed(p[1]! & 0xffff, 3, 12)];
          add();
          break;
        case 0x24:
          pos = [fixed(a & 0x3ff, 3, 6), fixed((a >>> 10) & 0x3ff, 3, 6), fixed(a >>> 20, 3, 6)];
          add();
          break;
        case 0x25:
          pos = [fixed(a & 0xffff, 3, 12), fixed(a >>> 16, 3, 12), pos[2]];
          add();
          break;
        case 0x26:
          pos = [fixed(a & 0xffff, 3, 12), pos[1], fixed(a >>> 16, 3, 12)];
          add();
          break;
        case 0x27:
          pos = [pos[0], fixed(a & 0xffff, 3, 12), fixed(a >>> 16, 3, 12)];
          add();
          break;
        case 0x28:
          pos = [pos[0] + fixed(a & 0x3ff, 0, 9) / 8, pos[1] + fixed((a >>> 10) & 0x3ff, 0, 9) / 8, pos[2] + fixed(a >>> 20, 0, 9) / 8];
          add();
          break;
        case 0x22:
          uv = [fixed(a & 0xffff, 11, 4), fixed(a >>> 16, 11, 4)];
          break;
        case 0x20:
          color = [(a & 0x1f) / 31, ((a >> 5) & 0x1f) / 31, ((a >> 10) & 0x1f) / 31];
          colorSet = true;
          break;
        case 0x21:
          info.normals = true;
          break;
        case 0x1b:
          scl = [(p[0]! | 0) / 4096, (p[1]! | 0) / 4096, (p[2]! | 0) / 4096];
          break;
        case 0x40:
          mode = a & 3;
          verts = [];
          break;
        case 0x41:
          flush();
          mode = null;
          break;
      }
    }
  }
  if (verts.length) flush();
  return tris;
}

function parseObjects(r: Reader, mo: number): NodeObject[] {
  const n = r.u8(mo + 0x17);
  if (n > LIMITS.objects) throw new NitroError('TOO_LARGE', `${n} objects.`);
  const objsec = mo + 0x40;
  const dict = readDict(r, objsec, 4);
  const out: NodeObject[] = [];
  for (let i = 0; i < Math.min(n, dict.count); i++) {
    const o = objsec + r.u32(dict.entry(i));
    const flag = r.u16(o);
    const noT = flag & 1;
    const noR = (flag >> 1) & 1;
    const noS = (flag >> 2) & 1;
    const hasP = (flag >> 3) & 1;
    let q = o + 4;
    let t: [number, number, number] = [0, 0, 0];
    let s: [number, number, number] = [1, 1, 1];
    let pivot: NodeObject['pivot'] = null;
    let rotation: number[] | null = null;
    let rot8 = false;
    if (!noT) {
      t = [fx32(r.u32(q)), fx32(r.u32(q + 4)), fx32(r.u32(q + 8))];
      q += 12;
    }
    if (hasP) {
      // select/negate bits from the object flags (documented layout; matches the
      // animation's frame 0 in batch 1 where bmdview.py's (0, 0) does not).
      pivot = { select: (flag >> 4) & 0xf, neg: (flag >> 8) & 0xf, a: fx16(r.u16(q)), b: fx16(r.u16(q + 2)) };
      q += 4;
    }
    // bmdview.py reads scale right here, also after a rot8 rotation (kept for its mode).
    const legacyS: [number, number, number] = noS ? [1, 1, 1] : [fx32(r.u32(q)), fx32(r.u32(q + 4)), fx32(r.u32(q + 8))];
    if (!hasP && !noR) {
      // rot8: m0 is the value at +2, m1…m8 follow (16 bytes). Stored for row vectors,
      // so this viewer's column-vector matrix is its transpose. Batch 1: 114/114 are
      // valid rotations, and with this order 152/154 models match their declared box.
      rot8 = true;
      const m = [fx16(r.u16(o + 2)), ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => fx16(r.u16(q + 2 * k)))];
      const col = [m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!];
      if (isRotation9(col)) rotation = col;
      q += 16;
    }
    if (!noS) {
      s = [fx32(r.u32(q)), fx32(r.u32(q + 4)), fx32(r.u32(q + 8))];
      q += 24;
    }
    out.push({ name: dict.names[i]!, flag, t, s, pivot, rotation, undecodedRotation: rot8 && !rotation, legacyS: hasP || noR ? s : legacyS });
  }
  return out;
}

/** Unit rows and determinant ±1 (tolerance for 1.3.12 rounding). */
function isRotation9(m: number[], tol = 0.02): boolean {
  for (let i = 0; i < 3; i++) if (!(Math.abs(Math.hypot(m[i * 3]!, m[i * 3 + 1]!, m[i * 3 + 2]!) - 1) <= tol)) return false;
  const det = m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) - m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) + m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!);
  return Math.abs(Math.abs(det) - 1) <= tol * 3;
}

interface RenderCommands {
  ops: SbcOp[];
  parent: number[];
  polyNode: Map<number, number>;
  polyMat: Map<number, number>;
  slotNode: number[];
  usesSkinning: boolean;
  unknown: number[];
}

/** Model render commands (SBC): node hierarchy, material/polygon binding and matrix-stack slots. */
function parseRenderCommands(r: Reader, mo: number, objectCount: number): RenderCommands {
  const res: RenderCommands = { ops: [], parent: Array.from({ length: objectCount }, () => -1), polyNode: new Map(), polyMat: new Map(), slotNode: Array.from({ length: 32 }, () => -1), usesSkinning: false, unknown: [] };
  let p = mo + r.u32(mo + 4);
  let curNode = 0;
  let curMat = 0;
  for (let guard = 0; guard < 65536; guard++) {
    const c = r.u8(p++);
    if (c === 0x01) break;
    switch (c) {
      case 0x00:
        break;
      case 0x0b:
      case 0x2b: // multiply by the position scale (0x0b) or its inverse (0x2b)
        res.ops.push({ op: 'posScale', up: c === 0x0b });
        break;
      case 0x02: // node visibility: node, visible
        curNode = r.u8(p);
        res.ops.push({ op: 'visibility', node: r.u8(p), visible: r.u8(p + 1) !== 0 });
        p += 2;
        break;
      case 0x03: // restore matrix from stack slot
        curNode = res.slotNode[r.u8(p) & 31] ?? curNode;
        res.ops.push({ op: 'restore', slot: r.u8(p) & 31 });
        p += 1;
        break;
      case 0x04:
      case 0x24:
      case 0x44:
        curMat = r.u8(p);
        res.ops.push({ op: 'material', material: curMat });
        p += 1;
        break;
      case 0x05: {
        const poly = r.u8(p);
        res.polyNode.set(poly, curNode);
        res.polyMat.set(poly, curMat);
        res.ops.push({ op: 'draw', polygon: poly });
        p += 1;
        break;
      }
      case 0x06:
      case 0x26:
      case 0x46:
      case 0x66: {
        const node = r.u8(p);
        const parent = r.u8(p + 1);
        if (node < res.parent.length && parent !== node) res.parent[node] = parent < objectCount ? parent : -1;
        curNode = node;
        let q = p + 3;
        let store = -1;
        let load = -1;
        if (c === 0x26 || c === 0x66) {
          store = r.u8(q) & 31;
          res.slotNode[store] = node;
          q += 1;
        }
        if (c === 0x46 || c === 0x66) {
          load = r.u8(q) & 31;
          q += 1;
        }
        res.ops.push({ op: 'node', node, parent, flags: r.u8(p + 2), store, load });
        p = q;
        break;
      }
      case 0x07:
      case 0x27:
      case 0x47:
      case 0x67:
      case 0x08:
      case 0x28:
      case 0x48:
      case 0x68: {
        // Billboard / Y billboard. Like NODEDESC, the 0x20 form stores the result in a
        // stack slot and the 0x40 form restores a slot first; 0x60 has both, store slot
        // first (Nitro SDK sbc.h: BB idxNode [idxMtxDest] [idxMtxSrc]). Milestone 4 read
        // 0x47 / 0x48 with one parameter, so their slot byte was taken as the next command.
        let q = p + 1;
        let store = -1;
        let load = -1;
        if (c & 0x20) store = r.u8(q++) & 31;
        if (c & 0x40) load = r.u8(q++) & 31;
        if (store >= 0) res.slotNode[store] = r.u8(p);
        res.ops.push({ op: 'billboard', node: r.u8(p), yOnly: (c & 0x0f) === 0x08, store, load });
        p = q;
        break;
      }
      case 0x09: {
        // Skinning: the slot gets a weighted blend of (stack matrix × inverse bind matrix).
        res.usesSkinning = true;
        const dst = r.u8(p) & 31;
        const n = r.u8(p + 1);
        res.slotNode[dst] = -1;
        const terms: { slot: number; invBind: number; weight: number }[] = [];
        for (let k = 0; k < n; k++) terms.push({ slot: r.u8(p + 2 + 3 * k) & 31, invBind: r.u8(p + 3 + 3 * k), weight: r.u8(p + 4 + 3 * k) / 256 });
        res.ops.push({ op: 'skin', store: dst, terms });
        p += 2 + 3 * n;
        break;
      }
      case 0x0c:
      case 0x0d:
        p += 2;
        break;
      default:
        res.unknown.push(c);
        return res;
    }
  }
  return res;
}

function parseMaterials(r: Reader, mb: number, tex0: Tex0 | null): Material[] {
  const texOffset = r.u16(mb);
  const palOffset = r.u16(mb + 2);
  const dict = readDict(r, mb + 4, 4);
  const mats: Material[] = [];
  for (let i = 0; i < dict.count; i++) {
    const s = mb + r.u32(dict.entry(i));
    // Material: +4 diffuse/ambient, +12 POLYGON_ATTR, +20 TEXIMAGE_PARAM (verified on all
    // 116 materials of batch 1: size 44, alpha 31, front-only, repeat S/T).
    const difAmb = r.u32(s + 4);
    const pa = r.u32(s + 12);
    const tp = r.u32(s + 20);
    mats.push({
      name: dict.names[i]!,
      diffuse: rgb555(difAmb & 0x7fff),
      ambient: rgb555((difAmb >>> 16) & 0x7fff),
      alpha: (pa >>> 16) & 31,
      renderBack: ((pa >> 6) & 1) === 1,
      renderFront: ((pa >> 7) & 1) === 1,
      repeatS: ((tp >>> 16) & 1) === 1,
      repeatT: ((tp >>> 17) & 1) === 1,
      flipS: ((tp >>> 18) & 1) === 1,
      flipT: ((tp >>> 19) & 1) === 1,
      texture: null,
      palette: null,
      paletteFrom: null,
      fileOffset: s,
      polygonMode: ((pa >> 4) & 3) as Material['polygonMode'],
      lightMask: pa & 0xf,
      translucentDepthUpdate: ((pa >> 11) & 1) === 1,
      polygonId: (pa >>> 24) & 0x3f,
      diffuseAsVertexColour: ((difAmb >>> 15) & 1) === 1,
    });
  }
  // Texture and palette tables: name → list of material ids (one texture can serve several materials).
  const bind = (off: number, set: (m: Material, name: string) => void) => {
    const d = readDict(r, mb + off, 4);
    for (let i = 0; i < d.count; i++) {
      const e = d.entry(i);
      const at = mb + r.u16(e);
      const num = r.u8(e + 2);
      for (let k = 0; k < num; k++) {
        const id = r.u8(at + k);
        if (id < mats.length) set(mats[id]!, d.names[i]!);
      }
    }
  };
  bind(texOffset, (m, n) => (m.texture = n));
  bind(palOffset, (m, n) => {
    m.palette = n;
    m.paletteFrom = 'table';
  });
  if (tex0)
    for (const m of mats)
      if (m.texture && !m.palette) {
        const p = paletteByName(tex0.palettes, m.texture);
        if (p) {
          m.palette = p.name;
          m.paletteFrom = 'name';
        }
      }
  return mats;
}

export function parseBmd0(b: Uint8Array): Bmd0 {
  const r = new Reader(b);
  if (r.ascii(0, 4) !== 'BMD0') throw new NitroError('BAD_MAGIC', 'Not a BMD0 model.');
  const nsec = r.u16(0x0e);
  const sections: number[] = [];
  for (let i = 0; i < Math.min(nsec, 8); i++) sections.push(r.u32(0x10 + 4 * i));
  const mdl0 = sections.find((o) => r.has(o, 4) && r.ascii(o, 4) === 'MDL0');
  if (mdl0 === undefined) throw new NitroError('BAD_STRUCTURE', 'No MDL0 block.');
  const tex0Off = sections.find((o) => r.has(o, 4) && r.ascii(o, 4) === 'TEX0');
  const tex0 = tex0Off === undefined ? null : parseTex0(r, tex0Off);
  const mdict = readDict(r, mdl0 + 8, 4);
  if (mdict.count > LIMITS.models) throw new NitroError('TOO_LARGE', `${mdict.count} models.`);
  const budget = { tris: LIMITS.triangles };
  const models: Bmd0Model[] = [];
  for (let m = 0; m < mdict.count; m++) {
    let mo = mdl0 + r.u32(mdict.entry(m));
    if (r.ascii(mo, 4) === 'MDL0') mo = mdl0;
    const objects = parseObjects(r, mo);
    const rc = parseRenderCommands(r, mo, objects.length);
    const matOff = r.u32(mo + 8);
    const materials = matOff > 0 && r.has(mo + matOff, 8) ? parseMaterials(r, mo + matOff, tex0) : [];
    const polyStart = mo + r.u32(mo + 12);
    const numPoly = r.u8(mo + 25);
    if (numPoly > LIMITS.polygons) throw new NitroError('TOO_LARGE', `${numPoly} polygons.`);
    const pdict = readDict(r, polyStart, 4);
    const polygons: Polygon[] = [];
    for (let pi = 0; pi < Math.min(numPoly, pdict.count); pi++) {
      const dbase = polyStart + r.u32(pdict.entry(pi));
      const dl = { at: dbase + r.u32(dbase + 8), size: r.u32(dbase + 12) };
      const info = { normals: false };
      const tris = buildTriangles(r, dl.at, dl.size, budget, info);
      budget.tris -= tris.length;
      const nv = tris.length * 3;
      const positions = new Float32Array(nv * 3);
      const uvs = new Float32Array(nv * 2);
      const colors = new Float32Array(nv * 3);
      const colorSet = new Uint8Array(nv);
      const slots = new Int16Array(nv);
      let k = 0;
      for (const t of tris)
        for (const v of t) {
          positions.set(v.p, k * 3);
          uvs.set(v.uv, k * 2);
          colors.set(v.c, k * 3);
          colorSet[k] = v.cs ? 1 : 0;
          slots[k] = v.slot;
          k++;
        }
      polygons.push({
        name: pdict.names[pi]!,
        material: rc.polyMat.get(pi) ?? (pi < materials.length ? pi : 0),
        node: rc.polyNode.get(pi) ?? 0,
        positions,
        uvs,
        colors,
        colorSet,
        normals: info.normals,
        slots,
        triangles: tris.length,
        displayList: dl,
      });
    }
    // Header (Nitro model info): +0x14 rule bytes, +0x1c position scale and inverse,
    // +0x2c box x, y, z, w, h, d (1.3.12), +0x38 box scale.
    const posScale = fx32(r.u32(mo + 0x1c));
    const invPosScale = fx32(r.u32(mo + 0x20));
    const bx = [0, 1, 2, 3, 4, 5].map((k) => fx16(r.u16(mo + 0x2c + 2 * k)));
    const bs = fx32(r.u32(mo + 0x38));
    const declaredBox =
      bs > 0 && Number.isFinite(bs)
        ? { min: [bx[0]! * bs, bx[1]! * bs, bx[2]! * bs] as [number, number, number], max: [(bx[0]! + bx[3]!) * bs, (bx[1]! + bx[4]!) * bs, (bx[2]! + bx[5]!) * bs] as [number, number, number] }
        : null;
    // Inverse-bind matrices (skinning): 0x54 bytes each, a 4×3 fx32 matrix for row
    // vectors (then a 3×3 for normals, unused here). Read only for the ids in use.
    const invBinds = new Map<number, Float64Array>();
    const ibBase = mo + r.u32(mo + 0x10);
    for (const op of rc.ops)
      if (op.op === 'skin')
        for (const t of op.terms) {
          if (invBinds.has(t.invBind) || !r.has(ibBase + 0x54 * t.invBind, 48)) continue;
          const v = Array.from({ length: 12 }, (_, k) => fx32(r.u32(ibBase + 0x54 * t.invBind + 4 * k)));
          invBinds.set(t.invBind, Float64Array.of(v[0]!, v[3]!, v[6]!, v[9]!, v[1]!, v[4]!, v[7]!, v[10]!, v[2]!, v[5]!, v[8]!, v[11]!, 0, 0, 0, 1));
        }
    models.push({
      name: mdict.names[m]!,
      declared: { vertices: r.u16(mo + 36), polygons: r.u16(mo + 38), triangles: r.u16(mo + 40), quads: r.u16(mo + 42) },
      objects,
      parent: rc.parent,
      slotNode: rc.slotNode,
      materials,
      polygons,
      usesSkinning: rc.usesSkinning,
      unknownCommands: rc.unknown,
      posScale,
      invPosScale,
      declaredBox,
      scalingRule: r.u8(mo + 0x15),
      ops: rc.ops,
      invBinds,
      billboards: rc.ops.filter((o) => o.op === 'billboard').length,
      fileOffset: mo,
    });
  }
  return { models, tex0, textures: tex0?.textures ?? [], palettes: tex0?.palettes ?? [] };
}

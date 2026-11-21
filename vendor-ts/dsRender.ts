/*
 * Nintendo DS polygon rendering rules for the preview ("file" pose), as pure
 * functions so they can be tested without WebGL. ModelView.tsx's shaders mirror
 * dsFragment() and billboardViewPosition(); tests/nitro-ds-render.test.ts pins
 * both. The real shaders were also compared in headless Chrome (SwiftShader) on
 * synthetic cases during development; see VIEWER-NOTES.md §7.
 *
 * Sources: GBATEK, "DS 3D Polygon Attributes" (POLYGON_ATTR: light enable bits 0–3,
 * polygon mode bits 4–5, translucent depth update bit 11, alpha bits 16–20, alpha 0
 * = wireframe), "DS 3D Texture Blending" (modulation and decal formulas),
 * "DS 3D Rendering" (pixels with alpha 0 are not drawn; translucent polygons are
 * drawn after opaque ones and keep the old depth unless bit 11 is set),
 * DIF_AMB bit 15 (diffuse colour set as vertex colour), and the Nitro SDK
 * billboard commands (BB / BBY: the node's rotation is replaced by one facing the
 * camera; translation and axis scales are kept).
 *
 * Not reproduced (the game supplies them): light directions and colours, the toon
 * table, fog, edge marking, the shadow-volume stencil, the DS translucent sort
 * order (auto Y-sort or manual) and anti-aliasing.
 */
import type { Material, Polygon } from './bmd0.js';
import type { BillboardState } from './pose.js';

export type DsMode = 'modulate' | 'decal' | 'toon';

export interface DsMaterialRules {
  /** False for shadow polygons (mode 3): the DS uses them as a stencil, not as a visible surface. */
  surface: boolean;
  /** Alpha 0: the DS draws only the polygon edges, opaque. */
  wire: boolean;
  /** Polygon alpha 0–1 (1 for wireframe). */
  alpha: number;
  /** Toon/highlight depends on the game's toon table; drawn as modulate. */
  mode: DsMode;
  /** POLYGON_ATTR bit 11. */
  depthWriteTranslucent: boolean;
}

export function dsMaterialRules(m: Material | undefined): DsMaterialRules {
  if (!m) return { surface: true, wire: false, alpha: 1, mode: 'modulate', depthWriteTranslucent: false };
  const a = Math.max(0, Math.min(31, m.alpha));
  return {
    surface: m.polygonMode !== 3,
    wire: a === 0,
    alpha: a === 0 ? 1 : a / 31,
    mode: m.polygonMode === 1 ? 'decal' : m.polygonMode === 2 ? 'toon' : 'modulate',
    depthWriteTranslucent: m.translucentDepthUpdate,
  };
}

/** Lighting applies when the material enables a light and the list sends normals. */
export function isLit(m: Material | undefined, p: Pick<Polygon, 'normals'>): boolean {
  return !!m && m.lightMask !== 0 && p.normals;
}

/**
 * Vertex colour (0–1) before the first COLOR command of a list: the material's
 * diffuse colour when DIF_AMB bit 15 is set, otherwise white (the DS keeps the
 * previous colour, which a single model cannot know).
 */
export function startColour(m: Material | undefined): [number, number, number] {
  if (m && m.diffuseAsVertexColour) return [m.diffuse[0] / 255, m.diffuse[1] / 255, m.diffuse[2] / 255];
  return [1, 1, 1];
}

/**
 * Vertex colours for one polygon as the DS would use them (0–1, 3 per vertex).
 * Lit polygons get the material diffuse colour; the viewer's directional shade
 * stands in for the game's lights.
 */
export function polygonColours(m: Material | undefined, p: Pick<Polygon, 'colors' | 'colorSet' | 'normals' | 'triangles'>): Float32Array {
  const n = p.triangles * 3;
  const out = new Float32Array(n * 3);
  const start = startColour(m);
  const lit = isLit(m, p);
  const diffuse: [number, number, number] = m ? [m.diffuse[0] / 255, m.diffuse[1] / 255, m.diffuse[2] / 255] : [1, 1, 1];
  for (let v = 0; v < n; v++) {
    const c = lit ? diffuse : p.colorSet[v] ? [p.colors[v * 3]!, p.colors[v * 3 + 1]!, p.colors[v * 3 + 2]!] : start;
    out[v * 3] = c[0]!;
    out[v * 3 + 1] = c[1]!;
    out[v * 3 + 2] = c[2]!;
  }
  return out;
}

export interface DsFragmentInput {
  /** Texel RGBA 0–1, or null for an untextured polygon. */
  tex: [number, number, number, number] | null;
  vertex: [number, number, number];
  polyAlpha: number;
  mode: DsMode;
  /** Lit polygons are multiplied by the viewer's shade (stand-in for the game's lights). */
  shade: number;
}

export interface DsFragment {
  rgb: [number, number, number];
  a: number;
  /** Which pass draws it: alpha 1 → opaque, 0 < alpha < 1 → translucent, alpha 0 → not drawn. */
  pass: 'opaque' | 'translucent' | 'none';
}

/** Alpha at or above this counts as opaque (31/31 after float rounding). */
export const OPAQUE_ALPHA = 0.999;

/** GBATEK texture blending in 0–1 floats (the DS uses 6-bit steps with +1/−1 rounding). */
export function dsFragment(i: DsFragmentInput): DsFragment {
  let rgb: [number, number, number];
  let a: number;
  if (!i.tex) {
    rgb = [...i.vertex];
    a = i.polyAlpha;
  } else if (i.mode === 'decal') {
    const t = i.tex[3];
    rgb = [0, 1, 2].map((k) => i.tex![k]! * t + i.vertex[k]! * (1 - t)) as [number, number, number];
    a = i.polyAlpha;
  } else {
    rgb = [0, 1, 2].map((k) => i.tex![k]! * i.vertex[k]!) as [number, number, number];
    a = i.tex[3] * i.polyAlpha;
  }
  rgb = rgb.map((v) => v * i.shade) as [number, number, number];
  const pass = a <= 0 ? 'none' : a >= OPAQUE_ALPHA ? 'opaque' : 'translucent';
  return { rgb, a, pass };
}

// ---------------------------------------------------------------- billboards

/** Per-vertex billboard data for the shader: mode (1 full, 2 Y axis), anchor, scaled local offset, node Y axis. */
export interface BillboardVertex {
  mode: 1 | 2;
  anchor: [number, number, number];
  local: [number, number, number];
  axisY: [number, number, number];
}

/** Length of column j of a row-major 4×4 matrix's 3×3 part. */
const colLen = (m: ArrayLike<number>, j: number) => Math.hypot(m[j]!, m[4 + j]!, m[8 + j]!);

/**
 * Splits a billboarded vertex into what does not depend on the camera: the base
 * matrix's translation (anchor), the vertex after the later transforms scaled by
 * the base's axis scales (local), and the base's Y axis (for Y billboards).
 */
export function billboardVertex(s: BillboardState, x: number, y: number, z: number): BillboardVertex {
  const e = s.extra;
  const q = [e[0]! * x + e[1]! * y + e[2]! * z + e[3]!, e[4]! * x + e[5]! * y + e[6]! * z + e[7]!, e[8]! * x + e[9]! * y + e[10]! * z + e[11]!];
  const b = s.base;
  const sy = colLen(b, 1);
  return {
    mode: s.yOnly ? 2 : 1,
    anchor: [b[3]!, b[7]!, b[11]!],
    local: [q[0]! * colLen(b, 0), q[1]! * sy, q[2]! * colLen(b, 2)],
    axisY: sy > 0 ? [b[1]! / sy, b[5]! / sy, b[9]! / sy] : [0, 1, 0],
  };
}

/**
 * View-space position of a billboarded vertex (mirrors ModelView's vertex shader).
 * `view` is a column-major 4×4 view matrix (rotation must be orthonormal). Full
 * billboards take the screen axes; Y billboards keep the node's Y axis and turn
 * around it toward the viewer (falls back to the screen axes when Y points at it).
 */
export function billboardViewPosition(view: ArrayLike<number>, v: BillboardVertex): [number, number, number] {
  const tr = (p: number[], w: number) => [0, 1, 2].map((r) => view[r]! * p[0]! + view[4 + r]! * p[1]! + view[8 + r]! * p[2]! + view[12 + r]! * w);
  const a = tr(v.anchor, 1);
  let ax = [1, 0, 0], ay = [0, 1, 0], az = [0, 0, 1];
  if (v.mode === 2) {
    const yv = tr(v.axisY, 0);
    const yl = Math.hypot(yv[0]!, yv[1]!, yv[2]!) || 1;
    const y = yv.map((c) => c / yl);
    const z = [-y[0]! * y[2]!, -y[1]! * y[2]!, 1 - y[2]! * y[2]!];
    const zl = Math.hypot(z[0]!, z[1]!, z[2]!);
    if (zl > 1e-4) {
      ay = y;
      az = z.map((c) => c / zl);
      ax = [ay[1]! * az[2]! - ay[2]! * az[1]!, ay[2]! * az[0]! - ay[0]! * az[2]!, ay[0]! * az[1]! - ay[1]! * az[0]!];
    }
  }
  return [0, 1, 2].map((k) => a[k]! + ax[k]! * v.local[0] + ay[k]! * v.local[1] + az[k]! * v.local[2]) as [number, number, number];
}

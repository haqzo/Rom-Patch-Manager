export function dsMaterialRules(m) {
    if (!m)
        return { surface: true, wire: false, alpha: 1, mode: 'modulate', depthWriteTranslucent: false };
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
export function isLit(m, p) {
    return !!m && m.lightMask !== 0 && p.normals;
}
/**
 * Vertex colour (0–1) before the first COLOR command of a list: the material's
 * diffuse colour when DIF_AMB bit 15 is set, otherwise white (the DS keeps the
 * previous colour, which a single model cannot know).
 */
export function startColour(m) {
    if (m && m.diffuseAsVertexColour)
        return [m.diffuse[0] / 255, m.diffuse[1] / 255, m.diffuse[2] / 255];
    return [1, 1, 1];
}
/**
 * Vertex colours for one polygon as the DS would use them (0–1, 3 per vertex).
 * Lit polygons get the material diffuse colour; the viewer's directional shade
 * stands in for the game's lights.
 */
export function polygonColours(m, p) {
    const n = p.triangles * 3;
    const out = new Float32Array(n * 3);
    const start = startColour(m);
    const lit = isLit(m, p);
    const diffuse = m ? [m.diffuse[0] / 255, m.diffuse[1] / 255, m.diffuse[2] / 255] : [1, 1, 1];
    for (let v = 0; v < n; v++) {
        const c = lit ? diffuse : p.colorSet[v] ? [p.colors[v * 3], p.colors[v * 3 + 1], p.colors[v * 3 + 2]] : start;
        out[v * 3] = c[0];
        out[v * 3 + 1] = c[1];
        out[v * 3 + 2] = c[2];
    }
    return out;
}
/** Alpha at or above this counts as opaque (31/31 after float rounding). */
export const OPAQUE_ALPHA = 0.999;
/** GBATEK texture blending in 0–1 floats (the DS uses 6-bit steps with +1/−1 rounding). */
export function dsFragment(i) {
    let rgb;
    let a;
    if (!i.tex) {
        rgb = [...i.vertex];
        a = i.polyAlpha;
    }
    else if (i.mode === 'decal') {
        const t = i.tex[3];
        rgb = [0, 1, 2].map((k) => i.tex[k] * t + i.vertex[k] * (1 - t));
        a = i.polyAlpha;
    }
    else {
        rgb = [0, 1, 2].map((k) => i.tex[k] * i.vertex[k]);
        a = i.tex[3] * i.polyAlpha;
    }
    rgb = rgb.map((v) => v * i.shade);
    const pass = a <= 0 ? 'none' : a >= OPAQUE_ALPHA ? 'opaque' : 'translucent';
    return { rgb, a, pass };
}
/** Length of column j of a row-major 4×4 matrix's 3×3 part. */
const colLen = (m, j) => Math.hypot(m[j], m[4 + j], m[8 + j]);
/**
 * Splits a billboarded vertex into what does not depend on the camera: the base
 * matrix's translation (anchor), the vertex after the later transforms scaled by
 * the base's axis scales (local), and the base's Y axis (for Y billboards).
 */
export function billboardVertex(s, x, y, z) {
    const e = s.extra;
    const q = [e[0] * x + e[1] * y + e[2] * z + e[3], e[4] * x + e[5] * y + e[6] * z + e[7], e[8] * x + e[9] * y + e[10] * z + e[11]];
    const b = s.base;
    const sy = colLen(b, 1);
    return {
        mode: s.yOnly ? 2 : 1,
        anchor: [b[3], b[7], b[11]],
        local: [q[0] * colLen(b, 0), q[1] * sy, q[2] * colLen(b, 2)],
        axisY: sy > 0 ? [b[1] / sy, b[5] / sy, b[9] / sy] : [0, 1, 0],
    };
}
/**
 * View-space position of a billboarded vertex (mirrors ModelView's vertex shader).
 * `view` is a column-major 4×4 view matrix (rotation must be orthonormal). Full
 * billboards take the screen axes; Y billboards keep the node's Y axis and turn
 * around it toward the viewer (falls back to the screen axes when Y points at it).
 */
export function billboardViewPosition(view, v) {
    const tr = (p, w) => [0, 1, 2].map((r) => view[r] * p[0] + view[4 + r] * p[1] + view[8 + r] * p[2] + view[12 + r] * w);
    const a = tr(v.anchor, 1);
    let ax = [1, 0, 0], ay = [0, 1, 0], az = [0, 0, 1];
    if (v.mode === 2) {
        const yv = tr(v.axisY, 0);
        const yl = Math.hypot(yv[0], yv[1], yv[2]) || 1;
        const y = yv.map((c) => c / yl);
        const z = [-y[0] * y[2], -y[1] * y[2], 1 - y[2] * y[2]];
        const zl = Math.hypot(z[0], z[1], z[2]);
        if (zl > 1e-4) {
            ay = y;
            az = z.map((c) => c / zl);
            ax = [ay[1] * az[2] - ay[2] * az[1], ay[2] * az[0] - ay[0] * az[2], ay[0] * az[1] - ay[1] * az[0]];
        }
    }
    return [0, 1, 2].map((k) => a[k] + ax[k] * v.local[0] + ay[k] * v.local[1] + az[k] * v.local[2]);
}

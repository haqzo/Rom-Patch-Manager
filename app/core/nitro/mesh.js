import { billboardVertex, isLit, polygonColours } from './dsRender.js';
import { poseVertex } from './pose.js';
/** Floats per vertex in MeshBatch.billboard. */
export const BILLBOARD_STRIDE = 10;
function finish(byKey) {
    return [...byKey.values()].map(({ material, lit, a }) => ({
        material,
        lit,
        positions: new Float32Array(a.pos),
        uvs: new Float32Array(a.uv),
        colors: new Float32Array(a.col),
        billboard: a.bb ? new Float32Array(a.bb) : null,
        vertices: a.pos.length / 3,
    }));
}
function accFor(byKey, model, p) {
    const lit = isLit(model.materials[p.material], p);
    const key = `${p.material}:${lit ? 1 : 0}`;
    let e = byKey.get(key);
    if (!e)
        byKey.set(key, (e = { material: p.material, lit, a: { pos: [], uv: [], col: [], bb: null } }));
    return e.a;
}
/*
 * Milestone-3 mesh ("As in MaToRiuKo's viewer").
 * Every vertex of a polygon uses the polygon's node matrix, as in MaToRiuKo's
 * bmdview.py, whose battle-background output he compared with CTRMap. Per-vertex
 * matrix-stack slots inside display lists are parsed (Polygon.slots) but not
 * applied: on his batch-1 files a single slot→node table disagrees with that
 * evidence for 31 of 221 models, so it is left as an open question (VIEWER-NOTES.md).
 * Milestone 4 resolves that question with buildPosedMesh() below.
 */
export function buildMesh(model, matrices) {
    const byKey = new Map();
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let triangles = 0;
    for (const p of model.polygons) {
        const acc = accFor(byKey, model, p);
        const cols = polygonColours(model.materials[p.material], p);
        const n = p.triangles * 3;
        for (let v = 0; v < n; v++) {
            let x = p.positions[v * 3], y = p.positions[v * 3 + 1], z = p.positions[v * 3 + 2];
            const m = matrices ? matrices[p.node] : undefined;
            if (m) {
                const nx = m[0] * x + m[1] * y + m[2] * z + m[3];
                const ny = m[4] * x + m[5] * y + m[6] * z + m[7];
                const nz = m[8] * x + m[9] * y + m[10] * z + m[11];
                x = nx;
                y = ny;
                z = nz;
            }
            acc.pos.push(x, y, z);
            acc.uv.push(p.uvs[v * 2], p.uvs[v * 2 + 1]);
            acc.col.push(cols[v * 3], cols[v * 3 + 1], cols[v * 3 + 2]);
            if (x < min[0])
                min[0] = x;
            if (x > max[0])
                max[0] = x;
            if (y < min[1])
                min[1] = y;
            if (y > max[1])
                max[1] = y;
            if (z < min[2])
                min[2] = z;
            if (z > max[2])
                max[2] = z;
        }
        triangles += p.triangles;
    }
    if (!triangles) {
        min.fill(0);
        max.fill(0);
    }
    return { batches: finish(byKey), min, max, triangles, hiddenSkipped: 0, billboardPolygons: 0 };
}
/**
 * File-consistent mesh (milestone 4): every vertex uses the matrix the render
 * commands give it — its display-list stack slot when it has one (skinned and
 * multi-node meshes), otherwise the current matrix when its polygon is drawn,
 * which includes the model's position scale. Polygons the commands never draw
 * are left out.
 */
export function buildPosedMesh(model, pose, opt = {}) {
    const byKey = new Map();
    let hiddenSkipped = 0;
    let billboardPolygons = 0;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const o = [0, 0, 0];
    let triangles = 0;
    model.polygons.forEach((p, pi) => {
        if (!pose.polygon[pi])
            return;
        if (opt.skipHidden && pose.hidden[pi]) {
            hiddenSkipped++;
            return;
        }
        const acc = accFor(byKey, model, p);
        const cols = polygonColours(model.materials[p.material], p);
        const bbs = pose.billboard?.[pi] ?? null;
        if (bbs)
            billboardPolygons++;
        // Billboard data is kept per vertex; a batch gets the array once any vertex needs it.
        if (bbs && !acc.bb)
            acc.bb = new Array((acc.pos.length / 3) * BILLBOARD_STRIDE).fill(0);
        const n = p.triangles * 3;
        for (let v = 0; v < n; v++) {
            poseVertex(pose, model, pi, v, o);
            const [x, y, z] = o;
            acc.pos.push(x, y, z);
            acc.uv.push(p.uvs[v * 2], p.uvs[v * 2 + 1]);
            acc.col.push(cols[v * 3], cols[v * 3 + 1], cols[v * 3 + 2]);
            if (acc.bb) {
                if (bbs) {
                    const b = billboardVertex(bbs, p.positions[v * 3], p.positions[v * 3 + 1], p.positions[v * 3 + 2]);
                    acc.bb.push(b.mode, ...b.anchor, ...b.local, ...b.axisY);
                }
                else
                    acc.bb.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
            }
            if (x < min[0])
                min[0] = x;
            if (x > max[0])
                max[0] = x;
            if (y < min[1])
                min[1] = y;
            if (y > max[1])
                max[1] = y;
            if (z < min[2])
                min[2] = z;
            if (z > max[2])
                max[2] = z;
        }
        triangles += p.triangles;
    });
    if (!triangles) {
        min.fill(0);
        max.fill(0);
    }
    return { batches: finish(byKey), min, max, triangles, hiddenSkipped, billboardPolygons };
}

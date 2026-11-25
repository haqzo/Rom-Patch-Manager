/*
 * Safety checks for imported models, from real crashes:
 * - a model part with no vertices crashed PokeMMO ("Fatal Render Error") when surfing;
 * - header counts / bounding box that don't match the model (left over from a template)
 *   are fixed automatically; PokeMMO also crashed on those.
 */
import * as N from './nitro/index.js';

export function checkModel(bytes) {
  const out = { errors: [], warnings: [], fixedBytes: null };
  let m;
  try { m = N.parseBmd0(bytes).models[0]; } catch (e) { out.errors.push({ code: 'parse', detail: e.message }); return out; }
  if (!m) { out.errors.push({ code: 'parse', detail: 'no model' }); return out; }
  for (const p of m.polygons) if (!p.triangles) out.errors.push({ code: 'emptyPart', detail: p.name });
  if (m.unknownCommands.length) out.warnings.push({ code: 'unknownCmd', detail: m.unknownCommands.map((c) => '0x' + c.toString(16)).join(', ') });
  const tris = m.polygons.reduce((a, p) => a + p.triangles, 0);
  const d = m.declared;
  const b = bytes.slice();
  const dv = new DataView(b.buffer, b.byteOffset);
  const mo = m.fileOffset;
  let changed = false;
  if (d.triangles !== tris || d.polygons !== tris || d.vertices !== tris * 3 || d.quads !== 0) {
    dv.setUint16(mo + 36, Math.min(65535, tris * 3), true); dv.setUint16(mo + 38, tris, true); dv.setUint16(mo + 40, tris, true); dv.setUint16(mo + 42, 0, true);
    out.warnings.push({ code: 'counts', detail: `${d.triangles} → ${tris}` });
    changed = true;
  }
  // bounding box from the real rest-pose geometry (a box copied from a template doesn't fit the new model)
  if (tris && !m.ops.some((o) => o.op === 'skin') && (N.modelEvidence(m).boxError ?? 1) > N.BOX_TOLERANCE) {
    try {
      const pose = N.evaluatePose(m, null, 0, { ignoreVerticalOffset: false });
      const o = [0, 0, 0], mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      m.polygons.forEach((p, pi) => { for (let v = 0; v < p.triangles * 3; v++) if (N.poseVertex(pose, m, pi, v, o)) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], o[i]); mx[i] = Math.max(mx[i], o[i]); } });
      if (mn.every(Number.isFinite)) {
        const size = mx.map((x, i) => x - mn[i]);
        const bs = Math.max(Math.max(...mn.map(Math.abs), ...mx.map(Math.abs), ...size) / 7.5, 1 / 4096);
        [...mn, ...size].forEach((v, k) => dv.setInt16(mo + 0x2c + 2 * k, Math.round((v / bs) * 4096), true));
        dv.setInt32(mo + 0x38, Math.round(bs * 4096), true); dv.setInt32(mo + 0x3c, Math.round(4096 / bs), true);
        out.warnings.push({ code: 'box', detail: '' });
        changed = true;
      }
    } catch { /* keep the stored box */ }
  }
  if (changed) out.fixedBytes = b;
  return out;
}

/** True when a model is built on the Fly scene skeleton (world_root / Hero_body / joint1...). */
export function isFlyModel(bytes) {
  try {
    const names = N.parseBmd0(bytes).models[0].objects.map((o) => o.name);
    return names.includes('Hero_body') && names.includes('joint1');
  } catch { return false; }
}

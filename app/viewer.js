/*
 * 3D preview for Nintendo DS models (BMD0) with optional skeletal animation (BCA0).
 * Parsing/posing comes from the Patch Manager asset viewer (app/core/nitro, MaToRiuKo's
 * bmdview rules + the DS polygon rules); this file only draws it with WebGL2.
 * Drag = rotate, wheel = zoom, double-click = reset.
 */
import * as N from './core/nitro/index.js';

const VS = `#version 300 es
in vec3 aPos; in vec2 aUv; in vec3 aCol; in vec4 aBb0; in vec3 aBb1; in vec3 aBb2;
uniform mat4 uMv; uniform mat4 uProj;
out vec3 vPos; out vec2 vUv; out vec3 vCol;
void main() {
  vec4 p;
  if (aBb0.x > 0.5) {
    vec3 a = (uMv * vec4(aBb0.yzw, 1.0)).xyz;
    vec3 ax = vec3(1.0, 0.0, 0.0), ay = vec3(0.0, 1.0, 0.0), az = vec3(0.0, 0.0, 1.0);
    if (aBb0.x > 1.5) {
      vec3 y = mat3(uMv) * aBb2; float yl = length(y); if (yl > 0.0) y /= yl;
      vec3 z = vec3(0.0, 0.0, 1.0) - y * y.z; float zl = length(z);
      if (zl > 1e-4) { ay = y; az = z / zl; ax = cross(ay, az); }
    }
    p = vec4(a + ax * aBb1.x + ay * aBb1.y + az * aBb1.z, 1.0);
  } else p = uMv * vec4(aPos, 1.0);
  vPos = p.xyz; vUv = aUv; vCol = aCol; gl_Position = uProj * p;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec2 vUv; in vec3 vCol;
uniform sampler2D uTex; uniform bool uUseTex; uniform vec2 uTexSize;
uniform float uAlpha; uniform int uMode; uniform bool uLit; uniform int uPass;
out vec4 o;
void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos))); if (n.z < 0.0) n = -n;
  float shade = 0.45 + 0.55 * max(0.0, dot(n, normalize(vec3(-0.42, 0.60, 0.68))));
  vec3 c; float a;
  if (!uUseTex) { c = vCol; a = uAlpha; }
  else {
    vec4 t = texture(uTex, vUv / uTexSize);
    if (uMode == 1) { c = mix(vCol, t.rgb, t.a); a = uAlpha; }
    else { c = t.rgb * vCol; a = t.a * uAlpha; }
  }
  if (uLit) c *= shade;
  if (a <= 0.0) discard;
  bool opaque = a >= 0.999;
  if (uPass == 0 && !opaque) discard;
  if (uPass == 1 && opaque) discard;
  o = vec4(c, uPass == 0 ? 1.0 : a);
}`;

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function orbit(yaw, pitch, dist, c) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const r = [cy, sp * sy, -cp * sy, 0, 0, cp, sp, 0, sy, -sp * cy, cp * cy, 0];
  const tx = -(r[0] * c[0] + r[4] * c[1] + r[8] * c[2]);
  const ty = -(r[1] * c[0] + r[5] * c[1] + r[9] * c[2]);
  const tz = -(r[2] * c[0] + r[6] * c[1] + r[10] * c[2]) - dist;
  return new Float32Array([r[0], r[1], r[2], 0, r[4], r[5], r[6], 0, r[8], r[9], r[10], 0, tx, ty, tz, 1]);
}

/** Decode every texture a model's materials use. */
function decodeTextures(bytes, bmd) {
  const out = new Map();
  if (!bmd.tex0) return out;
  const r = new N.Reader(bytes);
  const wanted = new Map();
  for (const md of bmd.models) for (const m of md.materials) if (m.texture && !wanted.has(m.texture)) wanted.set(m.texture, m.palette);
  for (const [name, palName] of wanted) {
    const t = bmd.textures.find((x) => x.name === name);
    if (!t) continue;
    try {
      const { pal } = t.format === 7 ? { pal: null } : N.choosePalette(bmd.palettes, name, palName ?? null);
      const d = N.decodeTexture(r, bmd.tex0, t, pal);
      if (d.rgba) out.set(name, d);
    } catch { /* draw untextured */ }
  }
  return out;
}

/** Parse once; returns everything the viewer needs. Throws a readable error for non-models. */
export function loadModel(modelBytes, animBytes = null) {
  const bmd = N.parseBmd0(modelBytes);
  if (!bmd.models.length) throw new Error('No model inside this file.');
  let anim = null;
  if (animBytes) {
    try { const a = N.parseBca0(animBytes); anim = a.animations[0] || null; } catch { anim = null; }
  }
  return { bmd, model: bmd.models[0], anim, textures: decodeTextures(modelBytes, bmd) };
}

export function meshAt(loaded, frame) {
  const pose = N.evaluatePose(loaded.model, loaded.anim, frame, { ignoreVerticalOffset: false });
  return N.buildPosedMesh(loaded.model, pose, { skipHidden: true });
}

/** Framing box that ignores a few far-away vertices (speed lines, sky domes) so the subject fills the view. */
export function robustBox(mesh) {
  const xs = [[], [], []];
  for (const b of mesh.batches) for (let i = 0; i < b.positions.length; i += 3) for (let k = 0; k < 3; k++) xs[k].push(b.positions[i + k]);
  if (!xs[0].length) return { min: [0, 0, 0], max: [1, 1, 1] };
  const min = [], max = [], fmin = [], fmax = [];
  for (let k = 0; k < 3; k++) {
    const a = Float64Array.from(xs[k]).sort();
    const lo = a[Math.floor(a.length * 0.1)], hi = a[Math.min(a.length - 1, Math.floor(a.length * 0.9))];
    fmin.push(a[0]); fmax.push(a[a.length - 1]);
    const c = (lo + hi) / 2, h = Math.max((hi - lo) * 0.85, 1e-3);
    min.push(Math.max(a[0], c - h)); max.push(Math.min(a[a.length - 1], c + h));
  }
  // only zoom in when far-away outliers (speed lines, domes) would otherwise shrink the subject
  const span = (lo, hi) => Math.max(...[0, 1, 2].map((k) => hi[k] - lo[k]));
  return span(fmin, fmax) > 2.5 * span(min, max) ? { min, max } : { min: fmin, max: fmax };
}

export class ModelViewer {
  constructor(canvas, { background = [0.07, 0.08, 0.11, 1], interactive = true } = {}) {
    this.canvas = canvas;
    this.bg = background;
    const gl = canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available.');
    this.gl = gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    this.prog = p;
    this.u = {}; for (const n of ['uMv', 'uProj', 'uTex', 'uUseTex', 'uTexSize', 'uAlpha', 'uMode', 'uLit', 'uPass']) this.u[n] = gl.getUniformLocation(p, n);
    this.a = {}; for (const n of ['aPos', 'aUv', 'aCol', 'aBb0', 'aBb1', 'aBb2']) this.a[n] = gl.getAttribLocation(p, n);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.buf = { pos: gl.createBuffer(), uv: gl.createBuffer(), col: gl.createBuffer(), bb: gl.createBuffer() };
    this.tex = new Map();
    this.cam = { yaw: 0.6, pitch: 0.3, zoom: 1 };
    this.frame = 0; this.playing = false; this.loaded = null; this.mesh = null;
    this._raf = 0;
    if (interactive) this._bind();
    this._ro = new ResizeObserver(() => this.draw()); this._ro.observe(canvas);
  }

  _bind() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.cam.yaw += (e.clientX - drag.x) * 0.01;
      this.cam.pitch = Math.max(-1.5, Math.min(1.5, this.cam.pitch + (e.clientY - drag.y) * 0.01));
      drag = { x: e.clientX, y: e.clientY }; this.draw();
    });
    c.addEventListener('pointerup', () => (drag = null));
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.cam.zoom = Math.max(0.2, Math.min(30, this.cam.zoom * Math.exp(-e.deltaY * 0.0015))); this.draw(); }, { passive: false });
    c.addEventListener('dblclick', () => { this.resetCamera(); this.draw(); });
  }

  resetCamera() { this.cam = this.kind === 'scene' ? { yaw: 0, pitch: 0.2, zoom: 5 } : { yaw: 0.6, pitch: 0.3, zoom: 1 }; }

  /** kind: 'object' (surf, fly …: orbit around it) or 'scene' (battle background: look from inside). */
  show(loaded, kind = 'object') {
    const gl = this.gl;
    this.loaded = loaded; this.kind = kind;
    for (const t of this.tex.values()) gl.deleteTexture(t);
    this.tex.clear();
    for (const [name, t] of loaded.textures) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.width, t.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, t.rgba);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this.tex.set(name, tex);
    }
    this.frame = 0;
    this.mesh = meshAt(loaded, 0);
    this.box = robustBox(this.mesh);
    if (kind === 'object' && loaded.anim?.frames > 1) {
      // keep the whole motion in view: union of the poses at a few frames
      const n = loaded.anim.frames;
      for (let k = 1; k <= 8; k++) {
        const b = robustBox(meshAt(loaded, Math.floor((k * (n - 1)) / 8)));
        for (let i = 0; i < 3; i++) { this.box.min[i] = Math.min(this.box.min[i], b.min[i]); this.box.max[i] = Math.max(this.box.max[i], b.max[i]); }
      }
    }
    this.resetCamera();
    this.draw();
  }

  /** Re-frame the camera on the current pose. */
  fit() { if (this.mesh) { this.box = robustBox(this.mesh); this.draw(); } }

  get frames() { return this.loaded?.anim?.frames || 0; }

  setFrame(f) {
    if (!this.loaded) return;
    this.frame = this.frames ? ((f % this.frames) + this.frames) % this.frames : 0;
    this.mesh = meshAt(this.loaded, this.frame);
    this.draw();
  }

  play() {
    if (!this.frames || this.playing) return;
    this.playing = true;
    let last = performance.now(), acc = 0;
    const step = (now) => {
      if (!this.playing) return;
      acc += now - last; last = now;
      if (acc >= 1000 / 30) { const n = Math.floor(acc / (1000 / 30)); acc -= n * (1000 / 30); this.setFrame(this.frame + n); }
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }
  pause() { this.playing = false; cancelAnimationFrame(this._raf); }

  _upload(b) {
    const { gl, a, buf } = this;
    const put = (bf, data, loc, size) => { gl.bindBuffer(gl.ARRAY_BUFFER, bf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); if (loc < 0) return; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
    put(buf.pos, b.positions, a.aPos, 3); put(buf.uv, b.uvs, a.aUv, 2); put(buf.col, b.colors, a.aCol, 3);
    if (b.billboard) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.bb); gl.bufferData(gl.ARRAY_BUFFER, b.billboard, gl.DYNAMIC_DRAW);
      const stride = N.BILLBOARD_STRIDE * 4;
      [[a.aBb0, 4, 0], [a.aBb1, 3, 16], [a.aBb2, 3, 28]].forEach(([loc, size, off]) => { if (loc < 0) return; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off); });
    } else for (const loc of [a.aBb0, a.aBb1, a.aBb2]) { if (loc < 0) continue; gl.disableVertexAttribArray(loc); gl.vertexAttrib4f(loc, 0, 0, 0, 0); }
  }

  draw() {
    const { gl, u } = this;
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(...this.bg);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.mesh) return;
    gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.frontFace(gl.CCW);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    const { min, max } = this.box;
    let center = [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
    let span = Math.max(1e-3, ...[0, 1, 2].map((k) => max[k] - min[k]));
    let dist = (span * 1.45) / this.cam.zoom;
    if (h > w) dist *= h / w; // tall/narrow panes (side-by-side compare): keep the whole model in view
    if (this.kind === 'scene') {
      // Battle scenes share one coordinate system: look from the player's side like the DS camera.
      center = [0, 1.5, -74]; span = 360; dist = 100 * (5 / this.cam.zoom);
    }
    const view = orbit(this.cam.yaw, this.cam.pitch, dist, center);
    gl.uniformMatrix4fv(u.uProj, false, perspective(this.kind === 'scene' ? 1.0 : 0.6, w / h, Math.max(0.05, dist / 200), dist * 10 + span * 4));
    gl.uniformMatrix4fv(u.uMv, false, view);
    gl.uniform1i(u.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    const materials = this.loaded.model.materials;
    const setMat = (b) => {
      const m = materials[b.material];
      const front = m ? m.renderFront : true, back = m ? m.renderBack : false;
      if (!front && !back) return false;
      if (front && back) gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); gl.cullFace(front ? gl.BACK : gl.FRONT); }
      const td = m?.texture ? this.loaded.textures.get(m.texture) : null;
      const tex = m?.texture ? this.tex.get(m.texture) : null;
      gl.uniform1i(u.uUseTex, tex && td ? 1 : 0);
      if (tex && td) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        const wrap = (rep, flip) => (!rep ? gl.CLAMP_TO_EDGE : flip ? gl.MIRRORED_REPEAT : gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap(m.repeatS, m.flipS));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap(m.repeatT, m.flipT));
        gl.uniform2f(u.uTexSize, td.width, td.height);
      }
      const rules = N.dsMaterialRules(m);
      gl.uniform1f(u.uAlpha, rules.alpha);
      gl.uniform1i(u.uMode, rules.mode === 'decal' ? 1 : 0);
      gl.uniform1i(u.uLit, b.lit ? 1 : 0);
      return true;
    };
    const visible = this.mesh.batches.filter((b) => { const r = N.dsMaterialRules(materials[b.material]); return r.surface && !r.wire; });
    gl.disable(gl.BLEND);
    gl.uniform1i(u.uPass, 0);
    for (const b of visible) if (setMat(b)) { this._upload(b); gl.drawArrays(gl.TRIANGLES, 0, b.vertices); }
    const depth = (b) => { let z = 0; for (let i = 0; i < b.vertices; i += 3) z += view[2] * b.positions[i * 3] + view[6] * b.positions[i * 3 + 1] + view[10] * b.positions[i * 3 + 2] + view[14]; return b.vertices ? z / (b.vertices / 3) : 0; };
    const back = visible.map((b) => ({ b, z: depth(b) })).sort((p, q) => p.z - q.z);
    gl.enable(gl.BLEND);
    gl.uniform1i(u.uPass, 1);
    for (const { b } of back) {
      const r = N.dsMaterialRules(materials[b.material]);
      if (!setMat(b)) continue;
      gl.depthMask(r.depthWriteTranslucent);
      this._upload(b); gl.drawArrays(gl.TRIANGLES, 0, b.vertices);
    }
    gl.depthMask(true);
  }

  destroy() {
    this.pause();
    this._ro.disconnect();
    const gl = this.gl;
    for (const t of this.tex.values()) gl.deleteTexture(t);
    for (const b of Object.values(this.buf)) gl.deleteBuffer(b);
    gl.deleteProgram(this.prog);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

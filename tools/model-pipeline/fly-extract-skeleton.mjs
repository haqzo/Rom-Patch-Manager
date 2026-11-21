import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const N = await import('../../app/core/nitro/index.js');
const [mf, outDir] = process.argv.slice(2); fs.mkdirSync(outDir, { recursive: true });
const bytes = new Uint8Array(fs.readFileSync(mf)); const bmd = N.parseBmd0(bytes); const m = bmd.models[0]; const r = new N.Reader(bytes);
const pose = N.evaluatePose(m, null, 0, { ignoreVerticalOffset: false }); const o = [0, 0, 0];
const keep = { f_effect_a: 'flash_line', f_effect_b: 'flash_line', hero1: 'Hero_body' };
const out = [];
m.polygons.forEach((p, pi) => {
  const mt = m.materials[p.material]; if (!keep[mt.name]) return;
  const t = bmd.textures.find((x) => x.name === mt.texture);
  const { pal } = t.format === 7 ? { pal: null } : N.choosePalette(bmd.palettes, t.name, mt.palette ?? null);
  const d = N.decodeTexture(r, bmd.tex0, t, pal);
  const raw = `${outDir}/${t.name}.rgba`; fs.writeFileSync(raw, Buffer.from(d.rgba.buffer, d.rgba.byteOffset, d.rgba.byteLength));
  execFileSync('python3', ['-I', '-c', `from PIL import Image; import sys; Image.frombytes('RGBA',(${t.width},${t.height}),open(sys.argv[1],'rb').read()).save(sys.argv[2])`, raw, `${outDir}/${t.name}.png`]); fs.unlinkSync(raw);
  const P = [], U = [];
  for (let v = 0; v < p.triangles * 3; v++) { N.poseVertex(pose, m, pi, v, o); P.push([...o]); U.push([p.uvs[2 * v] / t.width, 1 - p.uvs[2 * v + 1] / t.height]); }
  out.push({ polygon: p.name, material: mt.name, texture: t.name, png: `${t.name}.png`, size: [t.width, t.height], fmt: t.format, joint: keep[mt.name], P, U, matHex: Buffer.from(bytes.slice(mt.fileOffset, mt.fileOffset + 44)).toString('hex') });
});
fs.writeFileSync(`${outDir}/aux.json`, JSON.stringify(out));
console.log(out.map((x) => `${x.polygon} mat=${x.material} tex=${x.texture} ${x.size} fmt${x.fmt} tris=${x.P.length / 3} -> ${x.joint}`).join('\n'));
const objs = m.objects.map((ob, i) => ({ name: ob.name, parent: m.parent[i], t: ob.t, s: ob.s, R: Array.from(N.restRotation(ob)) }));
fs.writeFileSync(`${outDir}/skeleton.json`, JSON.stringify(objs));

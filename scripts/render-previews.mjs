#!/usr/bin/env node
/* Renders library/previews/*.jpg with the app's own viewer in headless Chromium.
   Needs: python3 -m http.server 8765 running in the repo root, and Playwright. */
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'); // npm i -D playwright (dev only)
const lib = JSON.parse(fs.readFileSync('app/library/library.json', 'utf8'));
fs.mkdirSync('app/library/previews', { recursive: true });
const jobs = [];
for (const it of lib.items) {
  const v = it.view || (() => { const w = it.writes.find((x) => x.file.endsWith('.nsbmd')); return w ? { model: w.file, kind: 'object' } : null; })();
  if (v) jobs.push({ id: it.id, ...v, frame: it.cat === 'fly' ? 22 : 0 });
}
for (const m of lib.platforms?.models || []) if (m.file && !m.empty) jobs.push({ id: m.id, model: m.file, kind: 'object' });
for (const s of lib.battle.scenes) jobs.push({ id: s.id, model: s.model, anim: s.anim, kind: 'scene' });
const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const missingOnly = process.argv.includes('--missing');
const PORT = process.env.PREVIEW_PORT || 8765;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 480, height: 288 } });
for (const j of jobs) {
  if (only && !j.id.includes(only)) continue;
  if (missingOnly && fs.existsSync(`app/library/previews/${j.id}.jpg`)) continue;
  const q = new URLSearchParams({ m: '../app/library/files/' + j.model, k: j.kind });
  if (j.anim) q.set('a', '../app/library/files/' + j.anim);
  if (j.frame) q.set('f', j.frame);
  await p.goto(`http://localhost:${PORT}/scripts/preview-page.html?` + q);
  await p.waitForFunction(() => window.DONE, null, { timeout: 60000 });
  const r = await p.evaluate(() => window.DONE);
  if (!r.startsWith('ok')) { console.log('FAIL', j.id, r.slice(0, 200)); continue; }
  await p.screenshot({ path: `app/library/previews/${j.id}.jpg`, type: 'jpeg', quality: 84 });
  process.stdout.write('.');
}
await b.close();
// tell the app which previews exist (so it never requests missing images)
const skip = new Set(['hm-clean', 'hm-clean-alt', 'hm-mato', 'disc-none', 'disc-none-classic', 'disc-transparent', 'bg-transparent']);
for (const m of lib.platforms?.models || []) if (m.empty) skip.add(m.id);
for (const id of skip) fs.rmSync(`app/library/previews/${id}.jpg`, { force: true });
lib.thumbs = fs.readdirSync('app/library/previews').filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4)).sort();
fs.writeFileSync('app/library/library.json', JSON.stringify(lib, null, 1));
console.log(' done');

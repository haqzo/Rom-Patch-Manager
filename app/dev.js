/*
 * Dev mode (Haqzo & MaToRiuKo). Turn on with ?dev, off with ?dev=off. Loaded only when on.
 * - Library, categories, presets and publishing: dev-library.js (edits.json draft → GitHub).
 * - My items: private items kept in this browser (IndexedDB), never uploaded.
 * - Save the current changes as one item; add an item back to the changes.
 * - Packs (.rpmpack): share items as one file (Discord etc.), import them on another PC.
 * - Battle platform slot builder: a different model for each of the 34 slots.
 * Not secret: anyone can add ?dev. It only adds tools; nothing private is on the site.
 */
import { initLibraryDev, gh, token, REPO } from './dev-library.js';

const DB = 'rpm-dev', STORE = 'items';
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' }); if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); });
}
const allItems = async () => (await tx('readonly', (s) => s.getAll())) || [];
const putItem = (it) => tx('readwrite', (s) => s.put(it));
const delItem = (id) => tx('readwrite', (s) => s.delete(id));

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

// Black/White platform slots (a/0/1/1 #0-33) and what kind of place each one is (see tools/model-pipeline/make-grounds.py)
const PLATFORM_SLOTS = ['Plain route', 'Grass · spring', 'Grass · summer', 'Grass · autumn', 'Grass · winter', 'Rocky / sand', 'Building', 'Special (lavender)',
  'Pale grass', 'Tall grass · spring', 'Tall grass · summer', 'Tall grass · autumn', 'Tall grass · winter', 'Dirt', 'Water (surf)', 'Deep water',
  'Sand', 'Desert', 'Puddle / shallow', 'Snow', 'Indoor / paved', 'Cave', 'Ice', 'Special (red)', 'Bridge', 'Special (dark 1)', 'Special (dark 2)',
  'Marsh / dust', 'Dark grass · spring', 'Dark grass · summer', 'Dark grass · autumn', 'Dark grass · winter', 'Grass (other)', 'Stone'];
const GROUND_FOR_SLOT = { 0: 'Light_Path', 1: 'Green_Grass', 2: 'Green_Grass', 3: 'Autumn_Grass', 4: 'Snowy_Grass', 5: 'Rocks_Brown', 6: 'Paved', 7: 'Cave_Pool', 8: 'Pale_Grass',
  9: 'Forest', 10: 'Forest', 11: 'Autumn_Grass', 12: 'Snowy_Grass', 13: 'Dirt_Path', 14: 'River', 15: 'Cave_Pool', 16: 'Light_Path', 17: 'Light_Path', 18: 'River', 19: 'Snow',
  20: 'Paved', 21: 'Rocks_Grey', 22: 'Ice', 23: 'Paved', 24: 'Wood', 25: 'Paved', 26: 'Paved', 27: 'Dirt_Path', 28: 'Forest', 29: 'Forest', 30: 'Autumn_Grass', 31: 'Snowy_Grass', 32: 'Green_Grass', 33: 'Paved' };

// ---- publish one of My items to the public library (items.json; the site rebuilds itself in ~2-3 minutes)
const BRANCH = 'main', COMMUNITY = 'library-src/community';
const ghToken = () => token.get();
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'item';
const MAGIC_EXT = { BMD0: 'nsbmd', BCA0: 'nsbca', BTX0: 'nsbtx' };
const magicOf = (u8) => String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);

/** One commit with the files + the updated items.json. */
async function publishItem(it, form, onStep) {
  const id = `${form.cat === 'scene' ? 'bg' : form.cat}-${slug(form.name)}-${Date.now().toString(36).slice(-4)}`;
  const dir = `dev/${id}`;
  // unique files
  const files = [];
  const fileOf = (data) => { const u = new Uint8Array(data); let f = files.find((x) => x.data.length === u.length && x.data.every((v, i) => v === u[i])); if (!f) { f = { data: u, name: `${dir}/${files.length}.${MAGIC_EXT[magicOf(u)] || 'bin'}` }; files.push(f); } return f.name; };
  const name = { en: form.name }, desc = form.desc ? { en: form.desc } : undefined;
  let def;
  if (form.cat === 'scene') {
    const m = it.writes.find((w) => magicOf(new Uint8Array(w.data)) === 'BMD0'), a = it.writes.find((w) => magicOf(new Uint8Array(w.data)) === 'BCA0');
    if (!m) throw new Error('This item has no model (.nsbmd) for a battle background.');
    def = { scene: true, id, name, by: form.by, model: fileOf(m.data), ...(a ? { anim: fileOf(a.data) } : { modelOnly: true }) };
  } else {
    const writes = it.writes.map((w) => ({ path: w.path, member: w.member, file: fileOf(w.data) }));
    const vm = writes.find((w) => w.file.endsWith('.nsbmd')), va = writes.find((w) => w.file.endsWith('.nsbca'));
    def = { id, cat: form.cat, name, by: form.by, ...(desc ? { desc } : {}), writes, ...(vm ? { view: { model: vm.file, kind: 'object', ...(form.cat === 'fly' && va ? { anim: va.file } : {}) } } : {}) };
  }
  onStep('Reading the library…');
  const ref = await gh(`git/ref/heads/${BRANCH}`);
  const head = await gh(`git/commits/${ref.object.sha}`);
  const cur = await gh(`contents/${COMMUNITY}/items.json?ref=${ref.object.sha}`);
  const defs = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(cur.content.replace(/\n/g, '')), (c) => c.charCodeAt(0))));
  defs.push(def);
  onStep(`Uploading ${files.length} file(s)…`);
  const tree = [];
  for (const f of files) { const bl = await gh('git/blobs', { method: 'POST', body: JSON.stringify({ content: b64(f.data), encoding: 'base64' }) }); tree.push({ path: `${COMMUNITY}/${f.name}`, mode: '100644', type: 'blob', sha: bl.sha }); }
  const json = JSON.stringify(defs, null, 2) + '\n';
  const jb = await gh('git/blobs', { method: 'POST', body: JSON.stringify({ content: json, encoding: 'utf-8' }) });
  tree.push({ path: `${COMMUNITY}/items.json`, mode: '100644', type: 'blob', sha: jb.sha });
  onStep('Committing…');
  const t = await gh('git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
  const c = await gh('git/commits', { method: 'POST', body: JSON.stringify({ message: `Library: ${form.name} by ${form.by} (published from dev mode)`, tree: t.sha, parents: [ref.object.sha] }) });
  await gh(`git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
  return { id, commit: c.sha };
}

export function initDev(C) {
  const { S, esc, icon, toast, renderPanel, refreshChanges, platform, rom, checkModel, mb, dropTarget, readDropped } = C;
  const D = { items: [], sel: new Set(), plat: { files: [], map: {} }, pub: null, pubMsg: '' };
  const LD = initLibraryDev(C);
  const load = async () => { D.items = (await allItems()).sort((a, b) => b.created - a.created); };

  async function saveChanges() {
    const writes = S.changes.flatMap((c) => c.writes);
    if (!writes.length) { toast('Nothing in Your changes to save.', 'warn'); return; }
    const name = prompt('Name for this item:', S.changes.map((c) => C.changeTitle(c)).join(' + ').slice(0, 80));
    if (!name) return;
    await putItem({ id: 'my-' + Date.now().toString(36), name, by: 'Haqzo', created: Date.now(), writes: writes.map((w) => ({ path: w.path, member: w.member ?? null, data: w.data })) });
    await load(); toast('Saved to My items.', 'ok'); renderPanel();
  }
  async function addToChanges(it) {
    S.picks.custom.push({ id: Date.now().toString(36), name: it.name, sub: `My item · ${C.nFiles(it.writes.length)}`, writes: it.writes.map((w) => ({ ...w, data: new Uint8Array(w.data) })) });
    await refreshChanges(); toast('Added to Your changes.', 'ok');
  }
  async function exportPack(items) {
    if (!items.length) return;
    const pack = { format: 'rpmpack', version: 1, made: new Date().toISOString(), items: items.map((it) => ({ name: it.name, by: it.by, writes: it.writes.map((w) => ({ path: w.path, member: w.member, data: b64(new Uint8Array(w.data)) })) })) };
    const bytes = new TextEncoder().encode(JSON.stringify(pack));
    const base = items.length === 1 ? items[0].name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'item' : `${items.length}-items`;
    await C.saveBytes(`${base}.rpmpack`, bytes, 'rpmpack');
  }
  async function importPack(file) {
    try {
      const pack = JSON.parse(await file.text());
      if (pack.format !== 'rpmpack') throw new Error('Not a .rpmpack file.');
      for (const it of pack.items) await putItem({ id: 'my-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: it.name, by: it.by || '?', created: Date.now(), writes: it.writes.map((w) => ({ path: w.path, member: w.member, data: unb64(w.data) })) });
      await load(); toast(`Imported ${pack.items.length} item(s).`, 'ok'); renderPanel();
    } catch (e) { toast(`Pack error: ${e.message || e}`, 'bad'); }
  }

  function platWrites() {
    return Object.entries(D.plat.map).filter(([, f]) => f !== '').map(([m, f]) => ({ path: 'a/0/1/1', member: +m, data: D.plat.files[+f].bytes }));
  }
  function guessPlat() {
    D.plat.map = {};
    for (let m = 0; m < 34; m++) {
      const want = GROUND_FOR_SLOT[m].toLowerCase();
      const i = D.plat.files.findIndex((f) => f.name.toLowerCase().replace(/\.nsbmd$/, '').endsWith(want));
      D.plat.map[m] = i >= 0 ? String(i) : (D.plat.files.length === 1 ? '0' : '');
    }
  }

  function render(head, body) {
    head.innerHTML = `<div><h2>Dev tools <span class="pill info">DEV</span></h2><p>Manage the library, categories and presets, then publish. Drafts stay in this browser until you publish. Turn off with <code>?dev=off</code>.</p></div>`;
    const sizeOf = (it) => it.writes.reduce((a, w) => a + w.data.byteLength, 0);
    const pf = D.plat.files, used = platWrites();
    body.innerHTML = `<div class="dev">${LD.sections()}
      <details class="panel"><summary><h2>My items &amp; packs</h2></summary>
        <div class="row"><button class="primary" id="dvSave" ${S.changes.length ? '' : 'disabled'}>Save current changes as an item</button>
          <button class="secondary" id="dvImport">Import .rpmpack</button>
          <button class="ghost" id="dvExport" ${D.sel.size ? '' : 'disabled'}>Export selected as pack (${D.sel.size})</button></div>
        ${D.items.length ? `<ul class="devlist">${D.items.map((it) => `<li><label><input type="checkbox" data-sel="${esc(it.id)}" ${D.sel.has(it.id) ? 'checked' : ''}> <b>${esc(it.name)}</b></label>
          <span class="muted small">${esc(it.by)} · ${it.writes.length} files · ${mb(sizeOf(it))} · ${esc([...new Set(it.writes.map((w) => w.path))].join(', '))}</span>
          <span class="row"><button class="secondary small" data-add="${esc(it.id)}">Add to changes</button><button class="ghost small" data-pack="${esc(it.id)}">Pack</button><button class="secondary small" data-pub="${esc(it.id)}">Publish</button><button class="ghost small" data-del="${esc(it.id)}">Delete</button></span></li>`).join('')}</ul>`
          : '<p class="muted">Nothing saved yet. Pick things (library, Your files, template backgrounds…), then “Save current changes”.</p>'}
        <p class="muted small">Press <b>Publish</b> on one of My items to put it straight into the public library (sign in under <b>Publish</b> above first).</p>
        ${D.pub ? (() => { const it = D.items.find((x) => x.id === D.pub); const cats = [['surf', 'Surf'], ['fly', 'Fly (complete set)'], ['scene', 'Battle background (model + animation)'], ['platforms', 'Battle platforms'], ['hmbg', 'TM / HM / Fly backgrounds'], ['title', 'Title screen'], ['world', 'Overworld']];
          const guess = it.writes.some((w) => w.path === 'a/0/7/5') ? 'surf' : it.writes.some((w) => w.path === 'a/1/1/5') ? 'fly' : it.writes.some((w) => w.path === 'a/0/1/1' && w.member >= 34) ? 'scene' : it.writes.some((w) => w.path === 'a/0/1/1') ? 'platforms' : it.writes.some((w) => w.path === 'a/1/6/0') ? 'title' : 'surf';
          return `<div class="pubform"><b>Publish “${esc(it.name)}”</b>
          <div class="row"><label class="field" style="flex:1"><span>Name</span><input id="pbName" value="${esc(it.name)}"></label><label class="field"><span>By</span><input id="pbBy" value="${esc(it.by || 'Haqzo')}"></label></div>
          <label class="field"><span>Category</span><select id="pbCat">${cats.map(([v, l]) => `<option value="${v}" ${v === guess ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
          <label class="field"><span>Description (optional)</span><input id="pbDesc" placeholder="e.g. Pokémon X/Y Wailmer. Tested in PokeMMO."></label>
          <p class="muted small" style="margin:0">Files: ${esc([...new Set(it.writes.map((w) => `${w.path} #${w.member ?? 'all'}`))].slice(0, 6).join(', '))}${it.writes.length > 6 ? ' …' : ''}. For a battle background the model goes on the battle types people pick; the slots in the item don't matter.</p>
          <div class="row"><button class="primary" id="pbGo" ${ghToken() ? '' : 'disabled'}>Publish for everyone</button><button class="ghost" id="pbCancel">Cancel</button><span class="muted small" id="pbMsg">${esc(D.pubMsg)}</span></div></div>`; })() : (D.pubMsg ? `<p class="small">${D.pubMsg}</p>` : '')}
      </details>
      <details class="panel"><summary><h2>Battle platforms — one model per slot</h2></summary>
        <p class="muted small" style="margin:0">Drop several .nsbmd. Files named like <code>Ground_Green_Grass.nsbmd</code> are matched to the right slots automatically; change any slot by hand.</p>
        <div class="drop" id="dvPlatDrop" tabindex="0" role="button">${icon('upload', 'cart')}<b>Drop platform models</b><p>.nsbmd</p></div>
        ${pf.length ? `<ul class="filelist">${pf.map((f) => `<li><div><div>${esc(f.name)}</div><div class="kind">${(f.bytes.length / 1024).toFixed(1)} KB${f.fixed ? ' · counts fixed' : ''}</div>${(f.errors || []).map((e) => `<div class="err">${esc(e.code)} ${esc(e.detail || '')}</div>`).join('')}</div></li>`).join('')}</ul>
        <div class="platgrid">${Array.from({ length: 34 }, (_, m) => `<label><span>#${m} ${esc(PLATFORM_SLOTS[m])}</span><select data-slot="${m}"><option value="">— keep —</option>${pf.map((f, i) => `<option value="${i}" ${D.plat.map[m] === String(i) ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>`).join('')}</div>
        <div class="row"><button class="primary" id="dvPlatAdd" ${used.length && !pf.some((f) => f.errors?.length) ? '' : 'disabled'}>Add to changes (${used.length} slots)</button><button class="ghost" id="dvPlatClear">Clear</button></div>` : ''}
      </details></div>`;
    LD.wire(body);
    $('dvSave').onclick = saveChanges;
    $('dvImport').onclick = async () => { const [f] = await platform.pickFiles({ accept: '.rpmpack,application/json' }); if (f) importPack(f); };
    $('dvExport').onclick = () => exportPack(D.items.filter((x) => D.sel.has(x.id)));
    for (const c of body.querySelectorAll('[data-sel]')) c.onchange = () => { c.checked ? D.sel.add(c.dataset.sel) : D.sel.delete(c.dataset.sel); renderPanel(); };
    for (const b of body.querySelectorAll('[data-add]')) b.onclick = () => addToChanges(D.items.find((x) => x.id === b.dataset.add));
    for (const b of body.querySelectorAll('[data-pack]')) b.onclick = () => exportPack([D.items.find((x) => x.id === b.dataset.pack)]);
    for (const b of body.querySelectorAll('[data-del]')) b.onclick = async () => { const it = D.items.find((x) => x.id === b.dataset.del); if (!confirm(`Delete “${it.name}” from My items?`)) return; await delItem(it.id); D.sel.delete(it.id); await load(); renderPanel(); };
    for (const b of body.querySelectorAll('[data-pub]')) b.onclick = () => { D.pub = b.dataset.pub; D.pubMsg = ''; renderPanel(); const f = $('pbName'); f?.closest('details')?.setAttribute('open', ''); f?.scrollIntoView({ block: 'center' }); };
    if ($('pbCancel')) $('pbCancel').onclick = () => { D.pub = null; D.pubMsg = ''; renderPanel(); };
    if ($('pbGo')) $('pbGo').onclick = async () => {
      const form = { name: $('pbName').value.trim(), by: $('pbBy').value.trim() || 'Haqzo', cat: $('pbCat').value, desc: $('pbDesc').value.trim() };
      if (!form.name) { toast('Give it a name.', 'warn'); return; }
      const it = D.items.find((x) => x.id === D.pub);
      const bad = it.writes.filter((w) => magicOf(new Uint8Array(w.data)) === 'BMD0').map((w) => checkModel(new Uint8Array(w.data))).find((c) => c.errors.length);
      if (bad) { toast(`Model check failed: ${bad.errors.map((e) => e.code).join(', ')}`, 'bad'); return; }
      if (!confirm(`Publish “${form.name}” by ${form.by} to the public library? Everyone will see it in about 2–3 minutes.`)) return;
      $('pbGo').disabled = true;
      try {
        const r = await publishItem(it, form, (m) => { const el = $('pbMsg'); if (el) el.textContent = m; });
        D.pub = null; D.pubMsg = `✅ Published “${esc(form.name)}”. It shows up for everyone in about 2–3 minutes (then reload). <a href="https://github.com/${REPO}/actions" target="_blank" rel="noopener">Watch the build</a>`;
        toast('Published!', 'ok'); renderPanel();
      } catch (e) { const el = $('pbMsg'); if (el) el.textContent = e.message || String(e); toast(`Publish failed: ${e.message || e}`, 'bad'); $('pbGo').disabled = false; }
    };
    const pd = $('dvPlatDrop');
    const take = async (files) => { const got = (await readDropped(files)).filter((f) => f.magic === 'BMD0'); if (!got.length) { toast('No .nsbmd models in that drop.', 'warn'); return; } D.plat.files = got; guessPlat(); renderPanel(); };
    pd.onclick = async () => take(await platform.pickFiles({ accept: '.nsbmd', multiple: true }));
    dropTarget(pd, take);
    for (const s of body.querySelectorAll('[data-slot]')) s.onchange = () => { D.plat.map[s.dataset.slot] = s.value; renderPanel(); };
    if ($('dvPlatAdd')) $('dvPlatAdd').onclick = async () => {
      const w = platWrites();
      S.picks.custom.push({ id: Date.now().toString(36), name: `Platforms per slot (${new Set(Object.values(D.plat.map).filter(Boolean)).size} models)`, sub: `a/0/1/1 · ${w.length} slots`, writes: w });
      await refreshChanges(); toast('Added to Your changes.', 'ok');
    };
    if ($('dvPlatClear')) $('dvPlatClear').onclick = () => { D.plat = { files: [], map: {} }; renderPanel(); };
  }
  const $ = (id) => document.getElementById(id);
  load().then(() => { if (S.tab === 'dev') renderPanel(); });
  return { render, decorate: LD.decorate, draftFile: LD.draftFile, thumbUrl: LD.thumbUrl, onLibrary: LD.onLibrary, previewing: LD.previewing };
}

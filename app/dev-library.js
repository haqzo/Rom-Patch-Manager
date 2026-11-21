/*
 * Dev mode: library management (Haqzo & MaToRiuKo). Loaded only with ?dev.
 * Every change goes into a DRAFT (kept in this browser) = an edits.json document + new files.
 * The draft is previewed live in this browser only. Nothing reaches the website until "Publish"
 * (straight to the website, or as a pull request for review). Publishing needs a GitHub token with write
 * access to the repo: GitHub itself decides who may publish, not this page.
 */
import { EMPTY_EDITS, normalizeEdits, applyEdits, validateEdits, describeEdits } from './core/edits.js';

export const REPO = 'haqzo/Rom-Patch-Manager';
const BRANCH = 'main', COMMUNITY = 'library-src/community', EDITS = `${COMMUNITY}/edits.json`;
const ICONS = ['wave', 'wing', 'mountain', 'disc', 'spark', 'star', 'flag', 'box', 'upload', 'eye', 'check'];
const MAGIC_EXT = { BMD0: 'nsbmd', BCA0: 'nsbca', BTX0: 'nsbtx', NARC: 'narc' };
const magicOf = (u8) => String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
const clone = (x) => JSON.parse(JSON.stringify(x));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'item';
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
async function sha(u8, n = 16) { const h = new Uint8Array(await crypto.subtle.digest('SHA-256', u8)); return [...h].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, n); }

// ---------------------------------------------------------------- GitHub sign-in (a token; GitHub checks the permissions)
const TOKEN_KEY = 'rpm-gh-token';
export const token = {
  get() { try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
  remembered() { try { return !!localStorage.getItem(TOKEN_KEY); } catch { return false; } },
  set(t, remember) { try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t); } catch { /* */ } },
  clear() { try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch { /* */ } },
};
export async function gh(path, opt = {}) {
  const tk = token.get();
  const url = path.startsWith('https://') ? path : `https://api.github.com/repos/${REPO}${path ? '/' + path : ''}`;
  const r = await fetch(url, { ...opt, headers: { ...(tk ? { Authorization: `Bearer ${tk}` } : {}), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (r.status === 404 && opt.allow404) return null;
  if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch { /* */ } throw new Error(`GitHub ${r.status}: ${m || r.statusText}${r.status === 401 ? ' (sign in again: the token is wrong or expired)' : ''}${r.status === 403 || r.status === 404 ? ` (your token needs write access to ${REPO})` : ''}`); }
  return r.status === 204 ? null : r.json();
}

// ---------------------------------------------------------------- browser storage for the draft
function kv() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('rpm-dev', 2);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' }); if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function kvGet(k) { const d = await kv(); return new Promise((res) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); }
async function kvSet(k, v) { const d = await kv(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }

/** 3-way merge: my draft (made on top of `base`) onto what is published now (`remote`). */
export function mergeEdits(base, mine, remote) {
  const B = normalizeEdits(base), M = normalizeEdits(mine), R = clone(normalizeEdits(remote));
  for (const k of ['items', 'scenes', 'categories', 'previews', 'order']) {
    for (const id of new Set([...Object.keys(B[k]), ...Object.keys(M[k])])) {
      if (same(B[k][id], M[k][id])) continue;
      if (M[k][id] === undefined) delete R[k][id]; else R[k][id] = clone(M[k][id]);
    }
  }
  const added = M.remove.filter((x) => !B.remove.includes(x)), undone = B.remove.filter((x) => !M.remove.includes(x));
  R.remove = [...new Set([...R.remove.filter((x) => !undone.includes(x)), ...added])];
  if (!same(B.categoryOrder, M.categoryOrder)) R.categoryOrder = clone(M.categoryOrder);
  const pb = new Map(B.presets.map((p) => [p.id, p])), pm = new Map(M.presets.map((p) => [p.id, p]));
  let P = R.presets.filter((p) => !(pb.has(p.id) && !pm.has(p.id)));
  for (const [id, p] of pm) if (!same(pb.get(id), p)) { const i = P.findIndex((x) => x.id === id); if (i >= 0) P[i] = clone(p); else P.push(clone(p)); }
  R.presets = P;
  return R;
}

export function initLibraryDev(C) {
  const { S, esc, icon, toast, renderPanel, refreshChanges, checkModel, L, mb } = C;
  const $ = (id) => document.getElementById(id);
  const X = {
    pristine: clone(S.lib), // the published library as this browser got it
    draft: { edits: EMPTY_EDITS(), base: EMPTY_EDITS(), files: {} },
    remoteLoaded: false, preview: true, account: null, libCat: null, urls: new Map(), busy: '',
  };
  const E = () => X.draft.edits;
  const hasChanges = () => !same(normalizeEdits(X.draft.edits), normalizeEdits(X.draft.base));
  const fileMap = () => X.draft.files;

  // ---- loading: the published edits.json from GitHub (public, so it works signed out too) + the saved draft
  async function loadRemote() {
    const f = await gh(`contents/${EDITS}?ref=${BRANCH}`, { allow404: true });
    return f ? normalizeEdits(JSON.parse(fromB64(f.content))) : EMPTY_EDITS();
  }
  async function init() {
    const saved = await kvGet('draft').catch(() => null);
    if (saved) X.draft = { edits: normalizeEdits(saved.edits), base: normalizeEdits(saved.base), files: saved.files || {} };
    try {
      const remote = await loadRemote(); X.remoteLoaded = true;
      if (!saved) X.draft = { edits: clone(remote), base: clone(remote), files: {} };
      else if (!same(remote, X.draft.base)) { X.draft.edits = mergeEdits(X.draft.base, X.draft.edits, remote); X.draft.base = remote; await save(); }
    } catch (e) { console.warn('dev: could not load edits.json', e); }
    if (hasChanges() && X.preview) await applyPreview();
    if (token.get()) verify().catch((e) => { X.account = { login: '?', push: false, error: e.message || String(e) }; }).finally(() => { if (S.tab === 'dev') renderPanel(); });
    if (S.tab === 'dev') renderPanel();
  }
  async function save() { await kvSet('draft', { edits: X.draft.edits, base: X.draft.base, files: X.draft.files }); }

  // ---- live preview of the draft in this browser
  const resolveRef = (ref) => (ref.startsWith('lib:') ? ref.slice(4) : 'draft:' + ref);
  const toRef = (libName) => (libName?.startsWith('draft:') ? libName.slice(6) : libName ? 'lib:' + libName : null);
  async function applyPreview() {
    const lib = applyEdits(clone(X.pristine), E(), resolveRef);
    lib.files = { ...lib.files };
    await C.setLibrary(lib, true);
  }
  async function changed() {
    await save();
    if (X.preview) await applyPreview(); else renderPanel();
  }
  const draftFile = async (name) => { const b = X.draft.files[name.slice(6)]; if (!b) throw new Error('Draft file is gone: ' + name); return new Uint8Array(b); };
  function thumbUrl(id) {
    if (!X.preview) return null;
    const ref = E().previews?.[id]; const b = ref && X.draft.files[ref];
    if (!b) return null;
    if (!X.urls.has(ref)) X.urls.set(ref, URL.createObjectURL(new Blob([b], { type: 'image/jpeg' })));
    return X.urls.get(ref);
  }
  function onLibrary(lib) { X.pristine = clone(lib); if (!hasChanges()) for (const k of Object.keys(X.draft.files)) if (!JSON.stringify(E()).includes(k)) delete X.draft.files[k]; }

  // ---- adding files to the draft
  async function addFile(file) {
    const b = new Uint8Array(await file.arrayBuffer());
    const m = magicOf(b);
    if (m === 'BMD0') { const c = checkModel(b); if (c.errors.length) throw new Error(`${file.name}: model check failed (${c.errors.map((e) => e.code).join(', ')})`); }
    else if (!MAGIC_EXT[m]) throw new Error(`${file.name}: not a Nitro file (.nsbmd / .nsbca / .nsbtx / .narc)`);
    const ref = `dev/${await sha(b)}.${MAGIC_EXT[m]}`;
    X.draft.files[ref] = b;
    return { ref, magic: m, size: b.length, name: file.name };
  }
  async function addPreview(id, file) {
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas'); c.width = 480; c.height = 288;
    const g = c.getContext('2d'), s = Math.max(480 / bmp.width, 288 / bmp.height);
    g.imageSmoothingQuality = 'high'; g.drawImage(bmp, (480 - bmp.width * s) / 2, (288 - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
    const b = new Uint8Array(await blob.arrayBuffer());
    const ref = `dev/previews/${slug(id)}-${await sha(b, 8)}.jpg`;
    X.draft.files[ref] = b; E().previews[id] = ref;
  }
  const refSize = (ref) => { if (!ref) return ''; if (ref.startsWith('lib:')) { const fp = (S.lib.files || X.pristine.files)[ref.slice(4)]; return fp ? mb(+String(fp).split(':')[0]) : ''; } const b = X.draft.files[ref]; return b ? mb(b.length) : 'published'; };
  const refLabel = (ref) => (!ref ? '— choose a file —' : ref.startsWith('lib:') ? `library file ${ref.slice(4, 12)}… (${refSize(ref)})` : `new file ${ref.split('/').pop().slice(0, 8)}… (${refSize(ref)})`);
  const pick = (accept, multiple = false) => C.platform.pickFiles({ accept, multiple });

  // ---------------------------------------------------------------- modal editor
  let modal;
  function openModal(title, html, wire) {
    modal?.remove();
    modal = document.createElement('div');
    modal.className = 'modal'; modal.id = 'devModal';
    modal.innerHTML = `<div class="modal-card dev-card" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="dev-card-head"><h3>${esc(title)}</h3><button class="ghost small" data-x>Close</button></div><div class="dev-card-body">${html}</div></div>`;
    document.body.append(modal);
    modal.querySelector('[data-x]').onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
    wire(modal);
    modal.querySelector('input,select,textarea')?.focus();
  }
  const closeModal = () => { modal?.remove(); modal = null; };
  const val = (root, sel) => root.querySelector(sel)?.value.trim() ?? '';
  const tri = (root, key) => { const o = {}; for (const l of ['en', 'zh', 'es']) { const v = val(root, `[name="${key}-${l}"]`); if (v) o[l] = v; } return Object.keys(o).length ? o : undefined; };
  const triFields = (key, label, v = {}, area = false) => `<fieldset class="tri"><legend>${esc(label)}</legend>${['en', 'zh', 'es'].map((l) => `<label><span>${{ en: 'English', zh: '中文', es: 'Español' }[l]}</span>${area ? `<textarea name="${key}-${l}" rows="2">${esc(v?.[l] || '')}</textarea>` : `<input name="${key}-${l}" value="${esc(v?.[l] || '')}">`}</label>`).join('')}</fieldset>`;
  const usedBy = (id) => (S.lib.presets || []).filter((p) => Object.values(p.items || {}).includes(id) || Object.values(p.battle || {}).some((a) => a.scene === id)).map((p) => L(p.name));

  // ---- item editor (Surf, Fly, platforms, TM/HM, title, overworld, new categories)
  function editItem(id, catId) {
    const cur = id ? S.lib.items.find((x) => x.id === id) : null;
    const cat = S.lib.categories.find((c) => c.id === (cur?.cat || catId));
    if (!cat) return;
    const template = S.lib.items.find((x) => x.cat === cat.id && x.id !== id);
    const rows = cur ? cur.writes.map((w) => ({ path: w.path, member: w.member, ref: toRef(w.file) }))
      : template ? template.writes.map((w) => ({ path: w.path, member: w.member, ref: null }))
      : (cat.path ? (cat.members || [0]).map((m) => ({ path: cat.path, member: m, ref: null })) : [{ path: '', member: 0, ref: null }]);
    const st = { rows, cat: cat.id };
    const compatible = S.lib.categories.filter((c) => c.id !== 'battle' && (c.id === cat.id || !cur || cur.writes.every((w) => !c.target || c.target.startsWith(w.path) || !c.path || c.path === w.path)));
    const draw = (root) => {
      root.querySelector('#deRows').innerHTML = st.rows.map((r, i) => `<tr><td><input data-r="${i}" data-k="path" value="${esc(r.path)}" size="10"></td><td><input data-r="${i}" data-k="member" value="${esc(r.member ?? '')}" size="4" placeholder="all"></td>
        <td class="small ${r.ref ? '' : 'err'}">${esc(refLabel(r.ref))}</td><td><button class="secondary small" data-file="${i}">${r.ref ? 'Replace' : 'Choose'}…</button> <button class="ghost small" data-del="${i}" title="Remove this row">✕</button></td></tr>`).join('');
      for (const inp of root.querySelectorAll('#deRows input')) inp.onchange = () => { const r = st.rows[+inp.dataset.r]; r[inp.dataset.k] = inp.dataset.k === 'member' ? (inp.value === '' ? null : +inp.value) : inp.value.trim(); };
      for (const b of root.querySelectorAll('[data-del]')) b.onclick = () => { st.rows.splice(+b.dataset.del, 1); draw(root); };
      for (const b of root.querySelectorAll('[data-file]')) b.onclick = async () => {
        const [f] = await pick('.nsbmd,.nsbca,.nsbtx,.btx0,.narc'); if (!f) return;
        try {
          const a = await addFile(f), r = st.rows[+b.dataset.file], old = r.ref;
          const sameRows = old ? st.rows.filter((x) => x.ref === old) : [r];
          if (sameRows.length > 1 && !confirm(`This file is used in ${sameRows.length} places (e.g. all ${sameRows.length} slots). Replace it everywhere?\n\nOK = everywhere, Cancel = only this row.`)) r.ref = a.ref; else for (const x of sameRows) x.ref = a.ref;
          draw(root);
        } catch (e) { toast(e.message || String(e), 'bad'); }
      };
    };
    const thumb = C.thumbFor(id || '', cat.icon);
    openModal(cur ? `Edit “${L(cur.name)}”` : `New ${L(cat.name)} item`, `
      ${cur ? '' : `<label class="field"><span>Id (fixed once published)</span><input name="id" placeholder="${esc(cat.id)}-my-model"></label>`}
      ${triFields('name', 'Name', cur?.name)}
      <div class="row"><label class="field"><span>Creator credit (“by”)</span><input name="by" value="${esc(cur?.by || '')}"></label>
        <label class="field"><span>Category</span><select name="cat">${compatible.map((c) => `<option value="${esc(c.id)}" ${c.id === cat.id ? 'selected' : ''}>${esc(L(c.name))}</option>`).join('')}</select></label></div>
      ${triFields('desc', 'Description (optional)', cur?.desc, true)}
      <label class="field"><span>Extra note on the card (optional, English), e.g. “Includes its own water splash”</span><input name="linked" value="${esc(cur?.linked?.en || '')}"></label>
      <fieldset><legend>Files — what goes where in the ROM (archive path + entry number)</legend>
        <p class="muted small">Keep complete features complete (e.g. Fly = all its entries). New files are checked before they're accepted.</p>
        <table class="dev-rows"><thead><tr><th>Archive</th><th>Entry</th><th>File</th><th></th></tr></thead><tbody id="deRows"></tbody></table>
        <button class="ghost small" id="deAdd">+ Add a row</button></fieldset>
      <fieldset><legend>Preview picture</legend><div class="row"><div class="dev-thumb">${thumb}</div><button class="secondary small" id="dePic">Choose picture…</button>${E().previews?.[id] ? '<button class="ghost small" id="dePicDel">Use the automatic preview</button>' : ''}<span class="muted small">480×288, cropped to fit. Without one, the site renders a 3D preview.</span></div></fieldset>
      <div class="row dev-actions"><button class="primary" id="deSave">Save to draft</button>
        ${cur ? `<button class="secondary" id="deDup">Duplicate</button><button class="secondary" id="deArch">${cur.archived ? 'Restore' : 'Archive'}</button><button class="danger" id="deRm">Remove…</button>` : ''}
        <span class="muted small">Draft only — nothing is published yet.</span></div>`, (root) => {
      draw(root);
      root.querySelector('#deAdd').onclick = () => { const last = st.rows[st.rows.length - 1]; st.rows.push({ path: last?.path || cat.path || '', member: last ? (last.member ?? 0) + 1 : 0, ref: null }); draw(root); };
      root.querySelector('#dePic').onclick = async () => { const [f] = await pick('image/*'); if (!f) return; st.pic = f; root.querySelector('.dev-thumb').innerHTML = `<img src="${URL.createObjectURL(f)}" alt="">`; };
      if (root.querySelector('#dePicDel')) root.querySelector('#dePicDel').onclick = () => { st.picDel = true; root.querySelector('.dev-thumb').innerHTML = icon(cat.icon, 'glyph'); };
      root.querySelector('#deSave').onclick = async () => {
        const name = tri(root, 'name');
        if (!name?.en) { toast('Give it an English name.', 'warn'); return; }
        if (st.rows.some((r) => !r.ref || !r.path)) { toast('Every row needs an archive path and a file.', 'warn'); return; }
        const nid = cur ? cur.id : slug(val(root, '[name="id"]') || `${cat.id}-${name.en}`);
        if (!cur && (S.lib.items.some((x) => x.id === nid) || E().items[nid])) { toast(`The id “${nid}” is taken.`, 'warn'); return; }
        const d = { ...(E().items[nid] || {}) };
        d.name = name; d.by = val(root, '[name="by"]'); d.cat = val(root, '[name="cat"]');
        d.desc = tri(root, 'desc') || null; d.linked = val(root, '[name="linked"]') ? { ...(cur?.linked || {}), en: val(root, '[name="linked"]') } : null;
        d.writes = st.rows.map((r) => ({ path: r.path, member: r.member, file: r.ref }));
        const vm = d.writes.find((w) => /\.nsbmd$|^lib:.*\.nsbmd$/.test(w.file)) || (cur?.view ? { file: toRef(cur.view.model) } : null);
        if (vm) d.view = { ...(cur?.view || { kind: 'object' }), model: vm.file, ...(cur?.view?.anim ? { anim: toRef(cur.view.anim) } : {}) };
        if (!cur) d.new = true;
        else { // keep only what differs from the published entry, so the publish summary stays honest
          const pub = X.pristine.items.find((x) => x.id === nid);
          const pubView = pub?.view ? { ...pub.view, model: toRef(pub.view.model), ...(pub.view.anim ? { anim: toRef(pub.view.anim) } : {}) } : undefined;
          const pubVals = pub && { name: pub.name, by: pub.by || '', cat: pub.cat, desc: pub.desc || null, linked: pub.linked || null, writes: pub.writes.map((w) => ({ path: w.path, member: w.member, file: toRef(w.file) })), view: pubView };
          if (pubVals) for (const k of Object.keys(pubVals)) if (same(d[k] ?? null, pubVals[k] ?? null)) delete d[k];
        }
        if (cur && !Object.keys(d).some((k) => k !== 'archived') && !d.archived && !X.pristine.items.find((x) => x.id === nid)?.archived) delete E().items[nid];
        else E().items[nid] = d;
        if (st.pic) await addPreview(nid, st.pic); else if (st.picDel) delete E().previews[nid];
        closeModal(); toast('Saved to the draft. Publish it from the Dev tab.', 'ok'); await changed();
      };
      if (!cur) return;
      root.querySelector('#deDup').onclick = async () => {
        const nid = slug(`${cur.id}-copy-${Date.now().toString(36).slice(-4)}`);
        E().items[nid] = { new: true, cat: cur.cat, name: Object.fromEntries(Object.entries(cur.name).map(([k, v]) => [k, `${v} (copy)`])), by: cur.by, ...(cur.desc ? { desc: cur.desc } : {}), writes: cur.writes.map((w) => ({ path: w.path, member: w.member, file: toRef(w.file) })), ...(cur.view ? { view: { ...cur.view, model: toRef(cur.view.model), ...(cur.view.anim ? { anim: toRef(cur.view.anim) } : {}) } } : {}) };
        closeModal(); toast('Duplicated in the draft.', 'ok'); await changed();
      };
      root.querySelector('#deArch').onclick = async () => {
        if (!cur.archived && !confirm(`Archive “${L(cur.name)}”? It disappears for users (you can restore it later in dev mode).${usedBy(cur.id).length ? `\n\nUsed by presets: ${usedBy(cur.id).join(', ')}` : ''}`)) return;
        E().items[cur.id] = { ...(E().items[cur.id] || {}), archived: !cur.archived }; closeModal(); await changed();
      };
      root.querySelector('#deRm').onclick = () => removeEntry(cur.id, L(cur.name), 'items');
    });
  }
  async function removeEntry(id, name, kind) {
    const users = usedBy(id);
    if (users.length) { toast(`“${name}” is used by presets: ${users.join(', ')}. Take it out of them first.`, 'warn'); return; }
    if (!confirm(`Remove “${name}” permanently?\n\nWhen published, it disappears for everyone and its files are deleted from the library. This can't be undone from dev mode (Archive hides it instead and can be restored).`)) return;
    const onlyDraft = E()[kind][id]?.new;
    delete E()[kind][id]; delete E().previews[id];
    if (!onlyDraft && !E().remove.includes(id)) E().remove.push(id);
    closeModal(); toast(onlyDraft ? 'Removed from the draft.' : 'Marked for removal in the draft.', 'ok'); await changed();
  }

  // ---- battle background editor
  function editScene(id) {
    const cur = id ? S.lib.battle.scenes.find((x) => x.id === id) : null;
    const st = { model: cur ? toRef(cur.model) : null, anim: cur?.anim ? toRef(cur.anim) : null };
    const slots = S.lib.battle.slots;
    openModal(cur ? `Edit “${L(cur.name)}”` : 'New battle background', `
      ${cur ? '' : '<label class="field"><span>Id (fixed once published)</span><input name="id" placeholder="bg-my-scene"></label>'}
      ${triFields('name', 'Name', cur?.name)}
      <label class="field"><span>Creator credit (“by”)</span><input name="by" value="${esc(cur?.by || '')}"></label>
      <fieldset><legend>Files</legend>
        <div class="row"><span class="small" id="dsM">${esc(refLabel(st.model))}</span><button class="secondary small" id="dsModel">Model (.nsbmd)…</button></div>
        <div class="row"><span class="small" id="dsA">${esc(st.anim ? refLabel(st.anim) : 'no animation (model only)')}</span><button class="secondary small" id="dsAnim">Animation (.nsbca)…</button><button class="ghost small" id="dsNoAnim">Model only</button></div></fieldset>
      <fieldset><legend>Made for these battle types (used by “MaToRiuKo's collection”-style sets and shown on the card)</legend>
        <div class="dev-slots">${slots.map((s) => `<label><input type="checkbox" name="native" value="${s.model}" ${(cur?.native || []).includes(s.model) ? 'checked' : ''}> ${esc(L(s.name))}</label>`).join('')}</div></fieldset>
      <fieldset><legend>Preview picture</legend><div class="row"><div class="dev-thumb">${C.thumbFor(id || '', 'mountain')}</div><button class="secondary small" id="dePic">Choose picture…</button><span class="muted small">In-game screenshots look best (480×288).</span></div></fieldset>
      <div class="row dev-actions"><button class="primary" id="deSave">Save to draft</button>
        ${cur ? `<button class="secondary" id="deDup">Duplicate</button><button class="secondary" id="deArch">${cur.archived ? 'Restore' : 'Archive'}</button><button class="danger" id="deRm">Remove…</button>` : ''}</div>`, (root) => {
      const setFile = (k, label, accept) => async () => { const [f] = await pick(accept); if (!f) return; try { const a = await addFile(f); if (k === 'model' && a.magic !== 'BMD0') throw new Error('That is not a model (.nsbmd).'); if (k === 'anim' && a.magic !== 'BCA0') throw new Error('That is not an animation (.nsbca).'); st[k] = a.ref; root.querySelector(label).textContent = refLabel(a.ref); } catch (e) { toast(e.message, 'bad'); } };
      root.querySelector('#dsModel').onclick = setFile('model', '#dsM', '.nsbmd');
      root.querySelector('#dsAnim').onclick = setFile('anim', '#dsA', '.nsbca');
      root.querySelector('#dsNoAnim').onclick = () => { st.anim = null; root.querySelector('#dsA').textContent = 'no animation (model only)'; };
      root.querySelector('#dePic').onclick = async () => { const [f] = await pick('image/*'); if (!f) return; st.pic = f; root.querySelector('.dev-thumb').innerHTML = `<img src="${URL.createObjectURL(f)}" alt="">`; };
      root.querySelector('#deSave').onclick = async () => {
        const name = tri(root, 'name'); if (!name?.en) { toast('Give it an English name.', 'warn'); return; }
        if (!st.model) { toast('Choose a model.', 'warn'); return; }
        const nid = cur ? cur.id : slug(val(root, '[name="id"]') || `bg-${name.en}`);
        if (!cur && (S.lib.battle.scenes.some((x) => x.id === nid) || E().scenes[nid])) { toast(`The id “${nid}” is taken.`, 'warn'); return; }
        E().scenes[nid] = { ...(E().scenes[nid] || {}), name, by: val(root, '[name="by"]'), model: st.model, anim: st.anim, modelOnly: !st.anim, native: [...root.querySelectorAll('[name="native"]:checked')].map((x) => +x.value), ...(cur ? {} : { new: true }) };
        if (st.pic) await addPreview(nid, st.pic);
        closeModal(); toast('Saved to the draft.', 'ok'); await changed();
      };
      if (!cur) return;
      root.querySelector('#deDup').onclick = async () => { const nid = slug(`${cur.id}-copy-${Date.now().toString(36).slice(-4)}`); E().scenes[nid] = { new: true, name: Object.fromEntries(Object.entries(cur.name).map(([k, v]) => [k, `${v} (copy)`])), by: cur.by, model: toRef(cur.model), anim: cur.anim ? toRef(cur.anim) : null, modelOnly: !cur.anim || !!cur.modelOnly, native: [] }; closeModal(); await changed(); };
      root.querySelector('#deArch').onclick = async () => { if (!cur.archived && !confirm(`Archive “${L(cur.name)}”? It disappears for users until restored.`)) return; E().scenes[cur.id] = { ...(E().scenes[cur.id] || {}), archived: !cur.archived }; closeModal(); await changed(); };
      root.querySelector('#deRm').onclick = () => removeEntry(cur.id, L(cur.name), 'scenes');
    });
  }

  // ---- category editor
  function editCategory(id) {
    const cur = id ? S.lib.categories.find((c) => c.id === id) : null;
    const special = cur && ['surf', 'fly', 'battle', 'platforms', 'hmbg', 'title', 'world'].includes(cur.id);
    openModal(cur ? `Category “${L(cur.name)}”` : 'New category', `
      ${cur ? '' : '<label class="field"><span>Id (fixed once published)</span><input name="id" placeholder="e.g. effects"></label>'}
      ${triFields('name', 'Name', cur?.name)}
      ${triFields('hint', 'Description', cur?.hint, true)}
      <div class="row"><label class="field"><span>Icon</span><select name="icon">${ICONS.map((i) => `<option ${i === (cur?.icon || 'box') ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
        <label class="field"><span>Shown under the title (e.g. “a/0/7/5 #49”)</span><input name="target" value="${esc(cur?.target || '')}"></label></div>
      ${special ? '<p class="muted small">Built-in category: how its items work stays the same; you can change its name, description, icon, order and visibility.</p>' : `
      <fieldset><legend>What items in this category replace</legend>
        <div class="row"><label class="field"><span>Archive path for new items</span><input name="path" value="${esc(cur?.path || '')}" placeholder="a/1/5/7"></label>
          <label class="field"><span>Entry numbers (comma separated)</span><input name="members" value="${esc((cur?.members || [0]).join(', '))}"></label></div>
        <div class="row">${['BMD0', 'BCA0', 'BTX0'].map((m) => `<label><input type="checkbox" name="accepts" value="${m}" ${(cur?.accepts || ['BMD0']).includes(m) ? 'checked' : ''}> ${{ BMD0: 'Models (.nsbmd)', BCA0: 'Animations (.nsbca)', BTX0: 'Textures (.nsbtx / .BTX0)' }[m]}</label>`).join(' ')}</div>
        <p class="muted small">Users pick one item of this category, like Surf. Each item can still list its own files.</p></fieldset>`}
      <label><input type="checkbox" name="hidden" ${cur?.hidden ? 'checked' : ''}> Hidden (only visible in dev mode)</label>
      <div class="row dev-actions"><button class="primary" id="deSave">Save to draft</button></div>`, (root) => {
      root.querySelector('#deSave').onclick = async () => {
        const name = tri(root, 'name'); if (!name?.en) { toast('Give it an English name.', 'warn'); return; }
        const nid = cur ? cur.id : slug(val(root, '[name="id"]') || name.en);
        if (!cur && (S.lib.categories.some((c) => c.id === nid) || ['import', 'dev', 'presets'].includes(nid))) { toast(`The id “${nid}” is taken.`, 'warn'); return; }
        const d = { ...(E().categories[nid] || {}), name, hint: tri(root, 'hint') || { en: '' }, icon: val(root, '[name="icon"]'), target: val(root, '[name="target"]'), hidden: root.querySelector('[name="hidden"]').checked };
        if (!special) { d.path = val(root, '[name="path"]'); d.members = val(root, '[name="members"]').split(/[,\s]+/).filter(Boolean).map(Number).filter(Number.isInteger); d.accepts = [...root.querySelectorAll('[name="accepts"]:checked')].map((x) => x.value); }
        E().categories[nid] = d; closeModal(); await changed();
      };
    });
  }

  // ---- presets
  function editPreset(id) {
    const cur = id ? (E().presets.find((p) => p.id === id) || (S.lib.presets || []).find((p) => p.id === id)) : null;
    const st = { items: { ...(cur?.items || {}) }, battle: clone(cur?.battle || {}) };
    const cats = S.lib.categories.filter((c) => c.pick === 'one');
    const B = S.lib.battle;
    const draw = (root) => {
      root.querySelector('#dpItems').innerHTML = cats.map((c) => `<label class="field"><span>${esc(L(c.name))}</span><select data-cat="${esc(c.id)}"><option value="">— not included —</option>${S.lib.items.filter((x) => x.cat === c.id).map((x) => `<option value="${esc(x.id)}" ${st.items[c.id] === x.id ? 'selected' : ''}>${esc(L(x.name))}${x.archived ? ' (archived)' : ''}</option>`).join('')}</select></label>`).join('');
      root.querySelector('#dpBattle').innerHTML = B.slots.map((s) => { const a = st.battle[s.model]; return `<label class="field"><span>${esc(L(s.name))}</span><span class="row"><select data-slot="${s.model}"><option value="">— keep —</option>${B.scenes.map((x) => `<option value="${esc(x.id)}" ${a?.scene === x.id ? 'selected' : ''}>${esc(L(x.name))}</option>`).join('')}</select>
        <select data-mode="${s.model}" ${a ? '' : 'disabled'}><option value="both" ${a?.mode !== 'model' ? 'selected' : ''}>model + animation</option><option value="model" ${a?.mode === 'model' ? 'selected' : ''}>model only</option></select></span></label>`; }).join('');
      for (const s of root.querySelectorAll('[data-cat]')) s.onchange = () => { if (s.value) st.items[s.dataset.cat] = s.value; else delete st.items[s.dataset.cat]; };
      for (const s of root.querySelectorAll('[data-slot]')) s.onchange = () => { const m = s.dataset.slot; if (s.value) { const sc = B.scenes.find((x) => x.id === s.value); st.battle[m] = { scene: s.value, mode: sc.anim && !sc.modelOnly ? (st.battle[m]?.mode || 'both') : 'model' }; } else delete st.battle[m]; draw(root); };
      for (const s of root.querySelectorAll('[data-mode]')) s.onchange = () => { if (st.battle[s.dataset.mode]) st.battle[s.dataset.mode].mode = s.value; };
    };
    openModal(cur ? `Preset “${L(cur.name)}”` : 'New preset', `
      ${triFields('name', 'Name', cur?.name)}
      ${triFields('desc', 'Description (optional)', cur?.desc, true)}
      <div class="row"><label class="field"><span>Group (optional — presets with the same group are shown together)</span><input name="group" value="${esc(cur?.group || '')}"></label>
        <label><input type="checkbox" name="hidden" ${cur?.hidden ? 'checked' : ''}> Hidden (dev mode only)</label></div>
      <div class="row"><button class="secondary small" id="dpFill">Fill from my current picks</button><span class="muted small">Takes what's selected in the library right now.</span></div>
      <fieldset><legend>Included items</legend><div class="dev-grid2" id="dpItems"></div></fieldset>
      <details><summary><b>Battle backgrounds</b> <span class="muted small">(per battle type)</span></summary><div class="dev-grid2" id="dpBattle"></div></details>
      <div class="row dev-actions"><button class="primary" id="deSave">Save to draft</button>${cur ? '<button class="secondary" id="dpDup">Duplicate</button><button class="danger" id="dpDel">Delete…</button>' : ''}</div>`, (root) => {
      draw(root);
      root.querySelector('#dpFill').onclick = () => { st.items = { ...S.picks.items }; st.battle = clone(S.picks.battle); draw(root); };
      root.querySelector('#deSave').onclick = async () => {
        const name = tri(root, 'name'); if (!name?.en) { toast('Give it an English name.', 'warn'); return; }
        if (!Object.keys(st.items).length && !Object.keys(st.battle).length) { toast('A preset needs at least one item or battle background.', 'warn'); return; }
        const p = { id: cur?.id || slug(`preset-${name.en}`), name, ...(tri(root, 'desc') ? { desc: tri(root, 'desc') } : {}), ...(val(root, '[name="group"]') ? { group: val(root, '[name="group"]') } : {}), items: st.items, battle: st.battle, ...(root.querySelector('[name="hidden"]').checked ? { hidden: true } : {}) };
        if (!cur && E().presets.some((x) => x.id === p.id)) p.id += '-' + Date.now().toString(36).slice(-4);
        const i = E().presets.findIndex((x) => x.id === p.id); if (i >= 0) E().presets[i] = p; else E().presets.push(p);
        closeModal(); toast('Preset saved to the draft.', 'ok'); await changed();
      };
      if (!cur) return;
      root.querySelector('#dpDup').onclick = async () => { const p = { ...clone(cur), id: `${cur.id}-copy-${Date.now().toString(36).slice(-4)}`, name: Object.fromEntries(Object.entries(cur.name).map(([k, v]) => [k, `${v} (copy)`])) }; E().presets.push(p); closeModal(); await changed(); };
      root.querySelector('#dpDel').onclick = async () => { if (!confirm(`Delete the preset “${L(cur.name)}”? When published it's gone for everyone (the items in it stay).`)) return; E().presets = E().presets.filter((x) => x.id !== cur.id); closeModal(); await changed(); };
    });
  }

  // ---- order
  function move(kind, cat, id, dir) {
    if (kind === 'category') {
      const order = E().categoryOrder.length ? [...E().categoryOrder] : S.lib.categories.map((c) => c.id);
      for (const c of S.lib.categories) if (!order.includes(c.id)) order.push(c.id);
      const i = order.indexOf(id), j = i + dir; if (i < 0 || j < 0 || j >= order.length) return;
      [order[i], order[j]] = [order[j], order[i]]; E().categoryOrder = order;
    } else {
      const ids = cat === 'battle' ? S.lib.battle.scenes.map((x) => x.id) : S.lib.items.filter((x) => x.cat === cat).map((x) => x.id);
      const i = ids.indexOf(id), j = i + dir; if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]]; E().order[cat] = ids;
    }
    changed();
  }
  function movePreset(id, dir) { const P = E().presets, i = P.findIndex((p) => p.id === id), j = i + dir; if (i < 0 || j < 0 || j >= P.length) return; [P[i], P[j]] = [P[j], P[i]]; changed(); }

  // ---------------------------------------------------------------- publishing
  async function verify() {
    const user = await gh('https://api.github.com/user');
    const repo = await gh('');
    X.account = { login: user.login, push: !!repo.permissions?.push };
    return X.account;
  }
  const existsRef = (ref, extra) => (ref.startsWith('lib:') ? !!(X.pristine.files[ref.slice(4)] || S.lib.files[ref.slice(4)]) : !!X.draft.files[ref] || (extra && extra.includes(JSON.stringify(ref))));
  function problems(edits, remoteText) { return validateEdits(X.pristine, edits, (ref) => existsRef(ref, remoteText || JSON.stringify(X.draft.base))); }
  async function publish(mode, onStep) {
    if (!X.account?.push) throw new Error('Sign in with a GitHub token that has write access first.');
    onStep('Reading what is published…');
    const ref = await gh(`git/ref/heads/${BRANCH}`);
    const head = await gh(`git/commits/${ref.object.sha}`);
    const remote = await loadRemote();
    const merged = same(remote, X.draft.base) ? clone(E()) : mergeEdits(X.draft.base, E(), remote);
    for (const d of Object.values(merged.items)) delete d.new; for (const d of Object.values(merged.scenes)) delete d.new;
    const errs = problems(merged, JSON.stringify(remote)).filter((p) => p.level === 'error');
    if (errs.length) throw new Error('Fix these first:\n• ' + errs.map((e) => e.msg).join('\n• '));
    const text = JSON.stringify(merged);
    const files = Object.entries(X.draft.files).filter(([p]) => text.includes(JSON.stringify(p)));
    onStep(`Uploading ${files.length} file(s)…`);
    const tree = [];
    for (const [p, b] of files) { const bl = await gh('git/blobs', { method: 'POST', body: JSON.stringify({ content: b64(new Uint8Array(b)), encoding: 'base64' }) }); tree.push({ path: `${COMMUNITY}/${p}`, mode: '100644', type: 'blob', sha: bl.sha }); }
    const jb = await gh('git/blobs', { method: 'POST', body: JSON.stringify({ content: JSON.stringify(merged, null, 2) + '\n', encoding: 'utf-8' }) });
    tree.push({ path: EDITS, mode: '100644', type: 'blob', sha: jb.sha });
    const summary = describeEdits(remote, merged);
    const message = `Library edits from dev mode (${X.account.login})\n\n${summary.map((x) => '- ' + x).join('\n')}`;
    onStep('Committing…');
    const t = await gh('git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
    const c = await gh('git/commits', { method: 'POST', body: JSON.stringify({ message, tree: t.sha, parents: [ref.object.sha] }) });
    let url;
    if (mode === 'pr') {
      const branch = `dev/${slug(X.account.login)}-${Date.now().toString(36)}`;
      await gh('git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: c.sha }) });
      const pr = await gh('pulls', { method: 'POST', body: JSON.stringify({ title: `Library edits from dev mode (${X.account.login})`, head: branch, base: BRANCH, body: `${summary.map((x) => '- ' + x).join('\n')}\n\nMade in Rom Patch Manager dev mode. Merging publishes it on the website.` }) });
      url = pr.html_url;
      X.draft.base = clone(merged); X.draft.edits = clone(merged); // the PR is the source of truth now; keep the files for the preview
    } else {
      await gh(`git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
      url = `https://github.com/${REPO}/actions`;
      X.draft.base = clone(merged); X.draft.edits = clone(merged);
    }
    await save();
    return { url, summary };
  }

  // ---------------------------------------------------------------- Dev tab sections
  function sections() {
    const lib = S.lib, cats = lib.categories;
    const cat = X.libCat || cats.find((c) => c.id !== 'battle')?.id;
    const isBattle = cat === 'battle';
    const list = isBattle ? lib.battle.scenes : lib.items.filter((x) => x.cat === cat);
    const ed = isBattle ? E().scenes : E().items;
    const summary = describeEdits(X.draft.base, E());
    const probs = problems(E());
    const newFiles = Object.entries(X.draft.files).filter(([p]) => JSON.stringify(E()).includes(JSON.stringify(p)));
    const acct = X.account;
    const tag = (x) => `${ed[x.id]?.new ? '<span class="pill info">new</span>' : ed[x.id] ? '<span class="pill">edited</span>' : ''}${x.archived ? '<span class="pill">archived</span>' : ''}`;
    return `
    ${hasChanges() ? `<div class="callout dev-draft">${icon('warn')}<span><b>You have unpublished changes (${summary.length}).</b> ${X.preview ? 'This browser shows the draft.' : 'This browser shows the published library.'} Review and publish them under <b>Publish</b>.</span></div>` : ''}
    <details class="panel" open><summary><h2>Library</h2></summary>
      <div class="row"><label class="field"><span>Category</span><select id="dlCat">${cats.map((c) => `<option value="${esc(c.id)}" ${c.id === cat ? 'selected' : ''}>${esc(L(c.name))}${c.hidden ? ' (hidden)' : ''}</option>`).join('')}</select></label>
        <button class="primary small" id="dlNew">+ New ${isBattle ? 'battle background' : 'item'}</button><span class="muted small">Edit here or with the ✎ buttons in the normal tabs.</span></div>
      <ul class="devlist dev-lib">${list.map((x, i) => `<li class="${x.archived ? 'is-archived' : ''}"><span class="row"><b>${esc(L(x.name))}</b> <span class="muted small">${esc(x.id)} · ${esc(x.by || '')}${isBattle ? '' : ` · ${x.writes.length} file${x.writes.length === 1 ? '' : 's'}`}</span> ${tag(x)}</span>
        <span class="row"><button class="ghost small" data-up="${esc(x.id)}" ${i ? '' : 'disabled'} title="Move up">▲</button><button class="ghost small" data-down="${esc(x.id)}" ${i < list.length - 1 ? '' : 'disabled'} title="Move down">▼</button>
        <button class="secondary small" data-edit="${esc(x.id)}">Edit</button></span></li>`).join('') || '<li class="muted">Nothing in this category yet.</li>'}</ul>
    </details>
    <details class="panel"><summary><h2>Categories</h2></summary>
      <ul class="devlist">${cats.map((c, i) => `<li><span class="row">${icon(c.icon)} <b>${esc(L(c.name))}</b> <span class="muted small">${esc(c.id)}${c.hidden ? ' · hidden' : ''}</span> ${E().categories[c.id] ? '<span class="pill">edited</span>' : ''}</span>
        <span class="row"><button class="ghost small" data-cup="${esc(c.id)}" ${i ? '' : 'disabled'}>▲</button><button class="ghost small" data-cdown="${esc(c.id)}" ${i < cats.length - 1 ? '' : 'disabled'}>▼</button><button class="secondary small" data-cedit="${esc(c.id)}">Edit</button></span></li>`).join('')}</ul>
      <button class="primary small" id="dcNew">+ New category</button></details>
    <details class="panel"><summary><h2>Presets</h2></summary>
      <p class="muted small" style="margin:0">Official combinations users can apply from the Presets tab: items from any category plus battle backgrounds per battle type.</p>
      <ul class="devlist">${E().presets.map((p, i) => `<li><span class="row"><b>${esc(L(p.name))}</b> <span class="muted small">${esc(p.group || '')} · ${Object.keys(p.items || {}).length} items · ${Object.keys(p.battle || {}).length} battle types${p.hidden ? ' · hidden' : ''}</span></span>
        <span class="row"><button class="ghost small" data-pup="${esc(p.id)}" ${i ? '' : 'disabled'}>▲</button><button class="ghost small" data-pdown="${esc(p.id)}" ${i < E().presets.length - 1 ? '' : 'disabled'}>▼</button><button class="secondary small" data-pedit="${esc(p.id)}">Edit</button></span></li>`).join('') || '<li class="muted">No presets yet.</li>'}</ul>
      <button class="primary small" id="dpNew">+ New preset</button></details>
    <details class="panel" ${hasChanges() ? 'open' : ''}><summary><h2>Publish</h2></summary>
      <div class="dev-acct">${acct?.error ? `⛔ Sign-in check failed: ${esc(acct.error)}` : acct ? `Signed in as <b>${esc(acct.login)}</b> — ${acct.push ? '✅ can publish' : '⛔ this account has no write access to the repo'}` : token.get() ? 'Checking your GitHub sign-in…' : 'Not signed in. Publishing needs a GitHub token with write access to the repo (Haqzo and MaToRiuKo).'}
        <div class="row"><label class="field" style="flex:1"><span>GitHub token</span><input id="dvTok" type="password" placeholder="github_pat_… or ghp_…" autocomplete="off"></label>
          <label class="small"><input type="checkbox" id="dvRemember" ${token.remembered() ? 'checked' : ''}> Remember on this device</label>
          <button class="secondary small" id="dvSignIn">${token.get() ? 'Replace token' : 'Sign in'}</button>${token.get() ? '<button class="ghost small" id="dvSignOut">Sign out</button>' : ''}</div>
        <p class="muted small" style="margin:0">Without “remember” the token is forgotten when the browser closes. GitHub decides who may publish; this page never sends the token anywhere else.</p></div>
      ${hasChanges() ? `<h3>Changes in your draft</h3><ul class="dev-sum">${summary.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <p class="muted small">${newFiles.length} new file(s), ${mb(newFiles.reduce((a, [, b]) => a + b.byteLength, 0))}.</p>
        ${probs.length ? `<ul class="dev-probs">${probs.map((p) => `<li class="${p.level}">${p.level === 'error' ? '⛔' : '⚠️'} ${esc(p.msg)}</li>`).join('')}</ul>` : '<p class="small">✅ No missing files or broken references.</p>'}
        <div class="row"><label class="small"><input type="checkbox" id="dvPrev" ${X.preview ? 'checked' : ''}> Show the draft in this browser</label></div>
        <div class="row dev-actions"><button class="primary" id="dvPub" ${acct?.push && !probs.some((p) => p.level === 'error') ? '' : 'disabled'}>Publish to the website…</button>
          <button class="secondary" id="dvPR" ${acct?.push && !probs.some((p) => p.level === 'error') ? '' : 'disabled'}>Send for review (pull request)…</button>
          <button class="ghost" id="dvDiscard">Discard draft…</button><span class="muted small" id="dvPubMsg">${X.busy}</span></div>`
        : `<p class="muted">No unpublished changes.${X.lastPub ? ` Last publish: <a href="${esc(X.lastPub)}" target="_blank" rel="noopener">${X.lastPub.includes('/pull/') ? 'pull request' : 'watch the build'}</a> — the website updates 2–3 minutes after a publish; open tabs pick it up within 10 minutes.` : ''}</p>`}
      ${X.remoteLoaded ? '' : '<p class="muted small">Couldn\'t read the published edits from GitHub (offline?). Your draft is kept; publishing will try again.</p>'}
    </details>`;
  }
  function wire(body) {
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    $('dlCat').onchange = (e) => { X.libCat = e.target.value; renderPanel(); };
    const cat = X.libCat || S.lib.categories.find((c) => c.id !== 'battle')?.id, isBattle = cat === 'battle';
    on('dlNew', () => (isBattle ? editScene(null) : editItem(null, cat)));
    for (const b of body.querySelectorAll('[data-edit]')) b.onclick = () => (isBattle ? editScene(b.dataset.edit) : editItem(b.dataset.edit));
    for (const b of body.querySelectorAll('[data-up]')) b.onclick = () => move('item', cat, b.dataset.up, -1);
    for (const b of body.querySelectorAll('[data-down]')) b.onclick = () => move('item', cat, b.dataset.down, 1);
    for (const b of body.querySelectorAll('[data-cup]')) b.onclick = () => move('category', null, b.dataset.cup, -1);
    for (const b of body.querySelectorAll('[data-cdown]')) b.onclick = () => move('category', null, b.dataset.cdown, 1);
    for (const b of body.querySelectorAll('[data-cedit]')) b.onclick = () => editCategory(b.dataset.cedit);
    on('dcNew', () => editCategory(null));
    for (const b of body.querySelectorAll('[data-pedit]')) b.onclick = () => editPreset(b.dataset.pedit);
    for (const b of body.querySelectorAll('[data-pup]')) b.onclick = () => movePreset(b.dataset.pup, -1);
    for (const b of body.querySelectorAll('[data-pdown]')) b.onclick = () => movePreset(b.dataset.pdown, 1);
    on('dpNew', () => editPreset(null));
    on('dvSignIn', async () => {
      const tk = $('dvTok').value.trim(); if (!tk) { toast('Paste a token first.', 'warn'); return; }
      token.set(tk, $('dvRemember').checked); X.account = null;
      try { const a = await verify(); toast(a.push ? `Signed in as ${a.login}.` : `${a.login} has no write access to ${REPO}.`, a.push ? 'ok' : 'warn'); } catch (e) { toast(e.message, 'bad'); }
      renderPanel();
    });
    on('dvSignOut', () => { token.clear(); X.account = null; toast('Signed out. The token is removed from this browser.', 'ok'); renderPanel(); });
    const prev = $('dvPrev'); if (prev) prev.onchange = async () => { X.preview = prev.checked; if (X.preview) await applyPreview(); else await C.setLibrary(clone(X.pristine), true); };
    on('dvDiscard', async () => { if (!confirm('Throw away every unpublished change in your draft? This can\'t be undone.')) return; X.draft = { edits: clone(X.draft.base), base: X.draft.base, files: {} }; await save(); await C.setLibrary(clone(X.pristine), true); });
    const go = (mode) => async () => {
      const summary = describeEdits(X.draft.base, E());
      if (!confirm(`${mode === 'pr' ? 'Send these changes as a pull request? Nothing changes on the website until someone merges it.' : 'Publish these changes to the website? Everyone sees them in about 2–3 minutes.'}\n\n• ${summary.slice(0, 15).join('\n• ')}${summary.length > 15 ? `\n… and ${summary.length - 15} more` : ''}`)) return;
      X.busy = 'Publishing…'; renderPanel();
      try {
        const r = await publish(mode, (m) => { X.busy = m; const el = $('dvPubMsg'); if (el) el.textContent = m; });
        X.lastPub = r.url; X.busy = '';
        toast(mode === 'pr' ? 'Pull request created.' : 'Published! The website updates in 2–3 minutes.', 'ok');
      } catch (e) { X.busy = ''; toast(`Publish failed: ${e.message || e}`, 'bad'); alert(e.message || String(e)); }
      renderPanel();
    };
    on('dvPub', go('main')); on('dvPR', go('pr'));
  }

  // ---- small ✎ controls in the normal tabs (only in dev mode)
  function decorate(tab, head, body) {
    const tools = document.createElement('div'); tools.className = 'dev-ctx';
    const btn = (label, fn) => { const b = document.createElement('button'); b.className = 'ghost small'; b.textContent = label; b.onclick = fn; tools.append(b); };
    if (tab === 'presets') {
      btn('+ New preset', () => editPreset(null));
      for (const c of body.querySelectorAll('.card[data-preset]')) addPen(c, () => editPreset(c.dataset.preset));
    } else if (tab === 'battle') {
      btn('+ Add battle background', () => editScene(null)); btn('✎ Category', () => editCategory('battle'));
      for (const c of body.querySelectorAll('.card[data-id]')) addPen(c, () => editScene(c.dataset.id));
    } else {
      btn(`+ Add ${tab === 'fly' ? 'Fly set' : 'item'}`, () => editItem(null, tab)); btn('✎ Category', () => editCategory(tab));
      for (const c of body.querySelectorAll('.card[data-id]')) addPen(c, () => editItem(c.dataset.id));
    }
    head.append(tools);
  }
  function addPen(card, fn) {
    const b = document.createElement('button'); b.className = 'dev-pen'; b.title = 'Edit (dev mode)'; b.setAttribute('aria-label', 'Edit (dev mode)'); b.textContent = '✎';
    b.onclick = (e) => { e.stopPropagation(); fn(); };
    (card.querySelector('.thumb') || card).append(b);
  }

  init();
  return { sections, wire, decorate, draftFile, thumbUrl, onLibrary, previewing: () => hasChanges() && X.preview, editItem, editScene, editPreset, editCategory };
}

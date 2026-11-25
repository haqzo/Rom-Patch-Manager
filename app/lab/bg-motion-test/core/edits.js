/*
 * Library edits (dev mode). One JSON document, library-src/community/edits.json, describes every change made from
 * dev mode on top of the generated library: item / scene edits, new items, archive + remove, categories, order,
 * previews and official presets. The same functions run in the site build (scripts/add-community.mjs) and in the
 * browser (dev mode preview), so what you preview is what gets published.
 *
 * File references in edits: "lib:<name>" = a file already in the library (app/library/files/<name>);
 * anything else = a path inside library-src/community/ (e.g. "dev/ab12cd34.nsbmd").
 */
export const EMPTY_EDITS = () => ({ version: 1, items: {}, scenes: {}, remove: [], categories: {}, categoryOrder: [], order: {}, previews: {}, presets: [] });

export function normalizeEdits(e) {
  const E = { ...EMPTY_EDITS(), ...(e || {}) };
  for (const k of ['items', 'scenes', 'categories', 'order', 'previews']) E[k] = { ...(E[k] || {}) };
  for (const k of ['remove', 'categoryOrder', 'presets']) E[k] = [...(E[k] || [])];
  return E;
}

const ITEM_FIELDS = ['cat', 'name', 'by', 'desc', 'linked', 'view'];
const SCENE_FIELDS = ['name', 'by', 'modelOnly', 'native'];
const CAT_FIELDS = ['name', 'hint', 'icon', 'target', 'accepts', 'path', 'members'];

function sortBy(list, order, key = (x) => x.id) {
  if (!order?.length) return list;
  const pos = new Map(order.map((id, i) => [id, i]));
  return list.map((x, i) => [x, pos.has(key(x)) ? pos.get(key(x)) : order.length + i]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
}

/**
 * Apply edits to a library object (mutates and returns it).
 * resolve(ref) → library file name for a file reference.
 */
export function applyEdits(lib, edits, resolve) {
  const E = normalizeEdits(edits);
  const R = (ref) => (ref == null ? ref : resolve(ref));
  // categories: edit existing, create new generic ones (pick one item, like Surf)
  for (const [id, c] of Object.entries(E.categories)) {
    let cat = lib.categories.find((x) => x.id === id);
    if (!cat) {
      if (id === 'battle' || id === 'import' || id === 'dev' || id === 'presets') continue;
      cat = { id, icon: 'box', name: { en: id }, hint: { en: '' }, target: '', pick: 'one' };
      lib.categories.push(cat);
    }
    for (const f of CAT_FIELDS) if (c[f] !== undefined) cat[f] = c[f];
    if (c.hidden !== undefined) { if (c.hidden) cat.hidden = true; else delete cat.hidden; }
  }
  if (E.categoryOrder.length) lib.categories = sortBy(lib.categories, E.categoryOrder);
  // items
  for (const [id, d] of Object.entries(E.items)) {
    let it = lib.items.find((x) => x.id === id);
    if (!it) {
      if (!d.cat || !d.writes?.length) continue; // not enough to create an item
      it = { id, cat: d.cat, name: d.name || { en: id }, by: d.by || '', writes: [] };
      lib.items.push(it);
    }
    for (const f of ITEM_FIELDS) if (d[f] !== undefined) { if (d[f] === null) delete it[f]; else it[f] = f === 'view' ? { ...d.view, model: R(d.view.model), ...(d.view.anim ? { anim: R(d.view.anim) } : {}) } : d[f]; }
    if (d.writes) it.writes = d.writes.map((w) => ({ path: w.path, member: w.member, file: R(w.file) }));
    if (d.writes && d.view === undefined && it.view) { // keep the 3D preview pointing at a model of this item
      const m = it.writes.find((w) => /\.nsbmd$/i.test(w.file));
      if (m && !it.writes.some((w) => w.file === it.view.model)) it.view = { ...it.view, model: m.file };
    }
    if (!it.view && d.writes) { const m = it.writes.find((w) => /\.nsbmd$/i.test(w.file)); if (m) it.view = { model: m.file, kind: 'object' }; }
    if (d.archived !== undefined) { if (d.archived) it.archived = true; else delete it.archived; }
  }
  // battle scenes
  const B = lib.battle;
  for (const [id, d] of Object.entries(E.scenes)) {
    let sc = B.scenes.find((x) => x.id === id);
    if (!sc) {
      if (!d.model) continue;
      sc = { id, name: d.name || { en: id }, by: d.by || '', model: R(d.model) };
      B.scenes.push(sc);
    }
    for (const f of SCENE_FIELDS) if (d[f] !== undefined) { if (d[f] === null || d[f] === false) delete sc[f]; else sc[f] = d[f]; }
    if (d.model) sc.model = R(d.model);
    if (d.anim !== undefined) { if (d.anim) { sc.anim = R(d.anim); } else { delete sc.anim; sc.modelOnly = true; } }
    if (d.archived !== undefined) { if (d.archived) sc.archived = true; else delete sc.archived; }
  }
  // permanent removal
  const gone = new Set(E.remove);
  lib.items = lib.items.filter((x) => !gone.has(x.id));
  B.scenes = B.scenes.filter((x) => !gone.has(x.id));
  for (const st of B.sets) for (const [m, sid] of Object.entries(st.assign)) if (gone.has(sid)) delete st.assign[m];
  // order inside each category (items) and of the battle scenes
  for (const [cat, order] of Object.entries(E.order)) {
    if (cat === 'battle') { B.scenes = sortBy(B.scenes, order); continue; }
    const inCat = lib.items.filter((x) => x.cat === cat), others = lib.items.filter((x) => x.cat !== cat);
    const sorted = sortBy(inCat, order);
    const first = lib.items.findIndex((x) => x.cat === cat);
    lib.items = first < 0 ? others : [...others.slice(0, first), ...sorted, ...others.slice(first)];
  }
  // official presets
  lib.presets = E.presets.map((p) => ({ id: p.id, name: p.name, ...(p.desc ? { desc: p.desc } : {}), ...(p.group ? { group: p.group } : {}), items: { ...(p.items || {}) }, battle: { ...(p.battle || {}) }, ...(p.hidden ? { hidden: true } : {}) }));
  return lib;
}

/** Everything that would break: missing files, unknown ids, empty items. exists(ref) → boolean. */
export function validateEdits(lib, edits, exists) {
  const E = normalizeEdits(edits), out = [];
  const bad = (msg) => out.push({ level: 'error', msg }), warn = (msg) => out.push({ level: 'warn', msg });
  const refOk = (ref, where) => { if (ref && !exists(ref)) bad(`${where}: file “${ref}” is missing`); };
  const catIds = new Set([...lib.categories.map((c) => c.id), ...Object.keys(E.categories)]);
  for (const [id, d] of Object.entries(E.items)) {
    const known = lib.items.some((x) => x.id === id);
    if (!known && (!d.cat || !d.writes?.length)) bad(`New item “${id}” needs a category and at least one file`);
    if (d.cat && (!catIds.has(d.cat) || d.cat === 'battle')) bad(`Item “${id}”: unknown category “${d.cat}”`);
    for (const w of d.writes || []) {
      if (!w.path || !/^[\w/.-]+$/.test(w.path)) bad(`Item “${id}”: bad archive path “${w.path}”`);
      if (w.member != null && (!Number.isInteger(+w.member) || +w.member < 0)) bad(`Item “${id}”: bad entry number “${w.member}”`);
      refOk(w.file, `Item “${id}”`);
    }
    if (d.view?.model) refOk(d.view.model, `Item “${id}” preview model`);
    if (d.name && !d.name.en) warn(`Item “${id}” has no English name`);
  }
  for (const [id, d] of Object.entries(E.scenes)) {
    if (!lib.battle.scenes.some((x) => x.id === id) && !d.model) bad(`New battle background “${id}” needs a model`);
    refOk(d.model, `Battle background “${id}”`); if (d.anim) refOk(d.anim, `Battle background “${id}” animation`);
    for (const m of d.native || []) if (!lib.battle.slots.some((s) => s.model === +m)) bad(`Battle background “${id}”: unknown battle type ${m}`);
  }
  for (const [id, c] of Object.entries(E.categories)) if (!lib.categories.some((x) => x.id === id) && !c.name?.en) bad(`New category “${id}” needs a name`);
  for (const [id, ref] of Object.entries(E.previews)) refOk(ref, `Preview of “${id}”`);
  const gone = new Set(E.remove);
  const itemIds = new Set([...lib.items.map((x) => x.id), ...Object.keys(E.items)].filter((x) => !gone.has(x)));
  const sceneIds = new Set([...lib.battle.scenes.map((x) => x.id), ...Object.keys(E.scenes)].filter((x) => !gone.has(x)));
  const seen = new Set();
  for (const p of E.presets) {
    if (!p.id || seen.has(p.id)) bad(`Preset “${p.id || '?'}”: missing or duplicate id`); seen.add(p.id);
    if (!p.name?.en) bad(`Preset “${p.id}” needs a name`);
    for (const [cat, id] of Object.entries(p.items || {})) { if (!catIds.has(cat)) bad(`Preset “${p.id}”: unknown category “${cat}”`); if (!itemIds.has(id)) bad(`Preset “${p.id}”: item “${id}” doesn't exist`); }
    for (const [m, a] of Object.entries(p.battle || {})) {
      if (!lib.battle.slots.some((s) => s.model === +m)) bad(`Preset “${p.id}”: unknown battle type ${m}`);
      if (!sceneIds.has(a.scene)) bad(`Preset “${p.id}”: battle background “${a.scene}” doesn't exist`);
    }
    if (!Object.keys(p.items || {}).length && !Object.keys(p.battle || {}).length) warn(`Preset “${p.id}” is empty`);
  }
  for (const id of gone) for (const p of E.presets) if (Object.values(p.items || {}).includes(id) || Object.values(p.battle || {}).some((a) => a.scene === id)) bad(`“${id}” is removed but preset “${p.id}” still uses it`);
  return out;
}

/** Short human list of what an edits document changes compared to another (for "review before publishing"). */
export function describeEdits(before, after) {
  const A = normalizeEdits(before), B = normalizeEdits(after), out = [];
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  for (const [k, label] of [['items', 'Item'], ['scenes', 'Battle background'], ['categories', 'Category']]) {
    for (const id of new Set([...Object.keys(A[k]), ...Object.keys(B[k])])) {
      if (!A[k][id]) out.push(`${label} “${id}”: new edit (${Object.keys(B[k][id]).join(', ')})`);
      else if (!B[k][id]) out.push(`${label} “${id}”: edit undone`);
      else if (!same(A[k][id], B[k][id])) out.push(`${label} “${id}”: changed (${Object.keys(B[k][id]).filter((f) => !same(A[k][id][f], B[k][id][f])).join(', ')})`);
    }
  }
  for (const id of B.remove) if (!A.remove.includes(id)) out.push(`Remove “${id}” permanently`);
  for (const id of A.remove) if (!B.remove.includes(id)) out.push(`Un-remove “${id}”`);
  if (!same(A.categoryOrder, B.categoryOrder)) out.push('Category order changed');
  for (const k of new Set([...Object.keys(A.order), ...Object.keys(B.order)])) if (!same(A.order[k], B.order[k])) out.push(`Order changed in “${k}”`);
  for (const k of new Set([...Object.keys(A.previews), ...Object.keys(B.previews)])) if (!same(A.previews[k], B.previews[k])) out.push(`Preview picture for “${k}”`);
  const pa = new Map(A.presets.map((p) => [p.id, p])), pb = new Map(B.presets.map((p) => [p.id, p]));
  for (const [id, p] of pb) if (!pa.has(id)) out.push(`New preset “${p.name?.en || id}”`); else if (!same(pa.get(id), p)) out.push(`Preset “${p.name?.en || id}” changed`);
  for (const [id, p] of pa) if (!pb.has(id)) out.push(`Delete preset “${p.name?.en || id}”`);
  return out;
}

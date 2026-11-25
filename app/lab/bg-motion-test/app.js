/*
 * Rom Patch Manager — UI.
 * Open ROM → pick complete visual features (or import raw files) → preview → export .nds / .bps.
 */
import { t, L, setLang, getLang, LANGS, authorName } from './i18n.js';
import * as rom from './core/rom.js';
import { changesFor, overlaps, sizeGrowth, scanInstalled } from './core/plan.js';
import { ModelViewer, loadModel } from './viewer.js';
import { checkModel, isFlyModel } from './core/check.js';
import { buildFromTemplate, legalSizes } from './core/bgtemplate.js';
import { platform } from './platform.js';
import { makeA115, patchA115, decodeTexture, A115_MAX_SCALE } from './core/a115patch.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tick = () => new Promise((r) => setTimeout(r, 30));
const mb = (n) => (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + ' MB';
const SOFT_LIMIT = 25 * 1048576; // MaToRiuKo tested 24.8 MB of extra data loading fine in game (Nov 2026)
const nFiles = (n) => `${n} ${n === 1 ? t('memberOne') : t('membersCount')}`;

const ICON = {
  wave: '<path d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M7 11c1-4 4-7 9-7-2 2-3 4-3 7"/>',
  wing: '<path d="M3 17c5 0 9-3 11-8l7-4c-1 7-5 13-14 13H3zM9 15c2-1 4-3 5-6"/>',
  mountain: '<path d="M3 20h18L14 7l-4 6-2-3-5 10zM14 7l2-3"/>',
  disc: '<ellipse cx="12" cy="14" rx="9" ry="4"/><path d="M3 14v2c0 2.2 4 4 9 4s9-1.8 9-4v-2"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  upload: '<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  warn: '<path d="M12 3 2 20h20L12 3zM12 10v4M12 17v.5"/>',
  cart: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v5h8V3M8 13h8M8 17h5"/>',
  box: '<path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10"/>',
};
const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ICON.box}</svg>`;

/** Where each category's "original in your ROM" lives (what Preview original opens). */
const CAT_ORIG = {
  surf: { path: 'a/0/7/5', model: 49 },
  fly: { path: 'a/1/1/5', model: 58, anim: 60 },
  platforms: { path: 'a/0/1/1', model: 0 },
  title: { path: 'a/1/6/0', model: 240 },
  world: { path: 'a/1/5/7', model: 0 },
};
const FLY_OUT_MODEL = [58, 103, 107], FLY_OUT_ANIM = [60, 104, 108], FLY_IN_MODEL = [66, 111], FLY_IN_ANIM = [67, 112];

const S = {
  lib: null,
  files: new Map(), // library file name -> Uint8Array
  fps: new Map(),
  rom: null, // { bytes, R, info, name }
  scan: null,
  picks: { items: {}, battle: {}, extras: [], custom: [] },
  tab: 'surf',
  selSlots: new Set(),
  battleMode: 'both',
  imp: { target: 'surf', files: [], slot: 'sel', path: 'a/0/7/5', member: 49, archive: null, mapItem: 62 },
  mapNames: null,
  changes: [],
  filter: { q: '', by: '' },
  staticOnly: false,
  bgt: { tpl: null, imgs: {}, colors: {}, open: false },
};

// ---------------------------------------------------------------- library files
async function loadFile(name) {
  if (S.files.has(name)) return S.files.get(name);
  if (name.startsWith('draft:') && S.dev) { const b = await S.dev.draftFile(name); S.files.set(name, b); return b; }
  const r = await fetch('../../library/files/' + name);
  if (!r.ok) throw new Error('Missing library file ' + name);
  const b = new Uint8Array(await r.arrayBuffer());
  S.files.set(name, b);
  return b;
}
const getFile = (n) => { const b = S.files.get(n); if (!b) throw new Error('not loaded ' + n); return b; };
function filesOfPicks() {
  const lib = S.lib, need = new Set();
  for (const id of Object.values(S.picks.items)) lib.items.find((x) => x.id === id)?.writes.forEach((w) => need.add(w.file));
  for (const a of Object.values(S.picks.battle)) { const s = lib.battle.scenes.find((x) => x.id === a.scene); if (s) { need.add(s.model); if (s.anim) need.add(s.anim); } }
  for (const id of S.picks.extras) lib.battle.sets.find((x) => x.id === id)?.extras.forEach((w) => need.add(w.file));
  return [...need];
}
async function refreshChanges() {
  await Promise.all(filesOfPicks().map(loadFile));
  S.changes = changesFor(S.picks, S.lib, getFile);
  renderChanges();
}

// ---------------------------------------------------------------- toasts / busy
function toast(msg, kind = '', action = null) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `<div>${esc(msg)}</div>`;
  if (action) { const b = document.createElement('button'); b.className = 'link'; b.textContent = action.label; b.onclick = action.run; el.appendChild(b); }
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 9000 : 5500);
}
const busy = (text) => { $('busyText').textContent = text || ''; $('busy').hidden = !text; };

/** Small decision dialog. buttons: [{id, label, kind}] → resolves to the clicked id. */
function ask(title, body, buttons) {
  return new Promise((resolve) => {
    const m = $('askModal');
    $('askTitle').textContent = title;
    $('askBody').textContent = body;
    const box = $('askBtns');
    box.innerHTML = '';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.className = b.kind || 'secondary';
      el.textContent = b.label;
      el.onclick = () => { m.hidden = true; resolve(b.id); };
      box.appendChild(el);
    }
    m.hidden = false;
    box.lastChild?.focus();
  });
}

// ---------------------------------------------------------------- static text
function applyStatic() {
  document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : getLang();
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  $('lang').innerHTML = LANGS.map((l) => `<option value="${l.id}" ${l.id === getLang() ? 'selected' : ''}>${l.label}</option>`).join('');
  $('aboutVer').textContent = 'Version ' + platform.version;
}

// ---------------------------------------------------------------- ROM
async function openRomFile(file) {
  if (!file) return;
  if (/\.(zip|7z|rar)$/i.test(file.name)) { toast('Unzip the archive first and open the .nds inside.', 'bad'); return; }
  busy(t('openRom') + '…');
  await tick();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const R = rom.parseRom(bytes);
    const info = rom.describeRom(bytes, R);
    S.rom = { bytes, R, info, name: file.name };
    S.scan = scanInstalled(bytes, R, S.lib, S.fps);
    S.romThumbs = new Map();
    setTimeout(renderRomThumbs, 50);
  } catch (e) {
    toast(e.message || String(e), 'bad');
  } finally { busy(''); }
  renderRom(); renderPanel(); renderChanges();
}

/** Small renders of what each battle type shows in the opened ROM (rendered locally, nothing shipped). */
async function renderRomThumbs() {
  const romNow = S.rom;
  if (!romNow) return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px';
  document.body.appendChild(canvas);
  let v;
  try { v = new ModelViewer(canvas, { interactive: false }); } catch { canvas.remove(); return; }
  for (const s of S.lib.battle.slots) {
    if (S.rom !== romNow) break;
    const st = S.scan.battle[s.model];
    if (st !== 'original' && st !== 'custom') continue;
    try {
      const m = romMember(S.lib.battle.path, s.model), a = romMember(S.lib.battle.path, s.anim);
      v.show(loadModel(m, a && rom.magic(a) === 'BCA0' ? a : null), 'scene');
      S.romThumbs.set(s.model, canvas.toDataURL('image/jpeg', 0.8));
    } catch { /* leave text */ }
    await new Promise((r) => setTimeout(r, 0));
  }
  v.destroy(); canvas.remove();
  if (S.tab === 'battle' && S.rom === romNow) renderPanel();
}

function scanLabel(cat) {
  const v = S.scan?.items[cat];
  if (!v || v === 'unknown') return { text: '—', mod: false };
  if (v === 'original') return { text: t('original'), mod: false };
  if (v === 'custom') return { text: t('custom'), mod: true };
  return { text: L(S.lib.items.find((x) => x.id === v)?.name), mod: true };
}

function renderRom() {
  const el = $('romCard');
  if (!S.rom) {
    el.innerHTML = `<div class="drop" id="romDrop" tabindex="0" role="button">${icon('cart', 'cart')}<b>${esc(t('dropRom'))}</b><p>${esc(t('dropRomSub'))}</p><span class="primary">${esc(t('openRom'))}</span></div>`;
    const d = $('romDrop');
    d.onclick = pickRom; d.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') pickRom(); };
    dropTarget(d, (files) => openRomFile(files.find((f) => /\.nds$/i.test(f.name)) || files[0]));
    return;
  }
  const { info, name } = S.rom;
  const game = info.game ? info.game.name : info.title;
  const langName = { en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano', ja: '日本語', ko: '한국어' }[info.lang] || info.code;
  const isWhite = info.code.startsWith('IRA') || info.code.startsWith('IRD');
  const battleMods = S.scan ? Object.values(S.scan.battle).filter((v) => v !== 'original').length : 0;
  el.innerHTML = `
    <div class="rom-title"><div class="rom-badge ${isWhite ? 'white' : 'black'}">${isWhite ? 'W' : 'B'}</div>
      <div style="min-width:0"><div class="rom-name">${esc(game)}</div><div class="rom-file" title="${esc(name)}">${esc(name)}</div></div></div>
    <dl class="facts"><dt>Code</dt><dd>${esc(info.code)} · ${esc(langName)}</dd><dt>CRC32</dt><dd>${esc(info.crc)}</dd><dt>Size</dt><dd>${mb(info.size)} · ${info.files} ${esc(t('files'))}</dd></dl>
    ${info.clean ? `<span class="pill ok">${icon('check')}${esc(t('clean'))}</span>` : `<span class="pill info">${esc(t('modified'))}</span>`}
    ${!info.supported ? `<div class="callout">${icon('warn')}<span>${esc(t('unknownGame'))}</span></div>` : ''}
    <div class="now"><h4>${esc(t('nowInRom'))}</h4><ul>
      ${S.lib.categories.filter((c) => c.pick === 'one').map((c) => { const s = scanLabel(c.id); return `<li><span>${esc(L(c.name))}</span><span class="${s.mod ? 'is-mod' : ''}">${esc(s.text)}</span></li>`; }).join('')}
      <li><span>${esc(L(S.lib.categories.find((c) => c.id === 'battle').name))}</span><span class="${battleMods ? 'is-mod' : ''}">${battleMods ? `${battleMods} / 25 ${esc(t('slotsCount'))}` : esc(t('original'))}</span></li>
    </ul></div>
    <div class="row" style="margin-top:12px"><button class="ghost small" id="changeRom">${esc(t('changeRom'))}</button></div>`;
  $('changeRom').onclick = pickRom;
}
async function pickRom() { const [f] = await platform.pickFiles({ accept: '.nds' }); if (f) openRomFile(f); }

function dropTarget(el, onFiles) {
  el.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', async (e) => {
    e.preventDefault(); e.stopPropagation(); el.classList.remove('over');
    onFiles(await filesFromDrop(e.dataTransfer));
  });
}
async function filesFromDrop(dt) {
  const out = [];
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...dt.files];
  const walk = (entry, prefix) => new Promise((resolve) => {
    if (entry.isFile) entry.file((f) => { f.relPath = prefix + f.name; out.push(f); resolve(); }, () => resolve());
    else if (entry.isDirectory) {
      const r = entry.createReader(); const all = [];
      const read = () => r.readEntries(async (es) => { if (!es.length) { for (const x of all) await walk(x, prefix + entry.name + '/'); resolve(); } else { all.push(...es); read(); } }, () => resolve());
      read();
    } else resolve();
  });
  for (const e of entries) await walk(e, '');
  return out;
}

// ---------------------------------------------------------------- tabs & panels
// archived items / scenes and hidden categories only show in dev mode
const shown = (x) => !x.archived || !!S.dev;
const visibleCats = () => S.lib.categories.filter((c) => !c.hidden || S.dev);
const visiblePresets = () => (S.lib.presets || []).filter((p) => !p.hidden || S.dev);
function renderTabs() {
  const used = new Set([...Object.keys(S.picks.items), ...(Object.keys(S.picks.battle).length ? ['battle'] : []), ...(S.picks.custom.length ? ['import'] : [])]);
  const tabs = visibleCats().map((c) => ({ id: c.id, label: L(c.name), icon: c.icon }));
  if (visiblePresets().length || S.dev) tabs.unshift({ id: 'presets', label: t('presets'), icon: 'star' });
  tabs.push({ id: 'import', label: t('yourFiles'), icon: 'upload', sep: true });
  if (S.dev) tabs.push({ id: 'dev', label: 'Dev', icon: 'box' });
  $('tabs').innerHTML = tabs.map((x) => `<button class="tab ${x.sep ? 'sep' : ''}" role="tab" aria-selected="${S.tab === x.id}" data-tab="${x.id}">${icon(x.icon)}${esc(x.label)}${used.has(x.id) ? '<span class="dot"></span>' : ''}</button>`).join('');
  for (const b of $('tabs').querySelectorAll('.tab')) b.onclick = () => { if (S.tab !== b.dataset.tab) S.filter = { q: '', by: '' }; S.tab = b.dataset.tab; renderTabs(); renderPanel(); };
}

function renderPanel() {
  renderTabs();
  const head = $('catHead'), body = $('panel');
  body.scrollTop = 0;
  if (S.tab === 'import') { renderImport(head, body); return; }
  if (S.tab === 'dev') { if (S.dev) S.dev.render(head, body); else { S.tab = 'surf'; renderPanel(); } return; }
  if (S.tab === 'presets') { renderPresets(head, body); S.dev?.decorate('presets', head, body); return; }
  const cat = S.lib.categories.find((c) => c.id === S.tab);
  if (!cat) { S.tab = visibleCats()[0]?.id || 'import'; renderPanel(); return; }
  const orig = CAT_ORIG[cat.id];
  head.innerHTML = `<div><h2>${esc(L(cat.name))}</h2><p>${esc(L(cat.hint))}</p><div class="tech">${esc(cat.target)}</div></div>
    ${S.rom && (orig || cat.id === 'battle') ? `<button class="ghost small" id="prevOrig">${icon('eye')}${esc(t('previewOriginal'))}</button>` : ''}`;
  if ($('prevOrig')) $('prevOrig').onclick = () => {
    if (cat.id === 'battle') { const m = [...S.selSlots][0] ?? 34; previewRomSlot(m); return; }
    previewRomMember(L(cat.name), orig.path, orig.model, orig.anim, cat.id === 'battle' ? 'scene' : 'object');
  };
  if (cat.id === 'battle') { renderBattle(body); S.dev?.decorate('battle', head, body); return; }
  const items = S.lib.items.filter((x) => x.cat === cat.id && shown(x));
  const isHm = cat.id === 'hmbg';
  body.innerHTML = `${filterBar(items)}<div class="grid">${items.map((it) => itemCard(it, cat)).join('')}</div><p class="muted" id="fempty" hidden>${esc(t('noMatch'))}</p>${isHm ? a115Html() : ''}`;
  wireFilter(body);
  if (isHm) wireA115(body);
  for (const c of body.querySelectorAll('.card')) {
    c.onclick = (e) => { if (e.target.closest('.peek')) return; toggleItem(cat.id, c.dataset.id); };
    c.querySelector('.peek')?.addEventListener('click', (e) => { e.stopPropagation(); previewItem(c.dataset.id); });
  }
  S.dev?.decorate(cat.id, head, body);
}

function thumbHtml(id, glyph) {
  const draft = S.dev?.thumbUrl(id);
  if (draft) return `<img src="${draft}" alt="" loading="lazy" data-glyph="${glyph}">`;
  if (S.lib.thumbs && !S.lib.thumbs.includes(id)) return icon(glyph, 'glyph');
  return `<img src="../../library/previews/${esc(id)}.jpg" alt="" loading="lazy" data-glyph="${glyph}">`;
}
// missing preview images → category glyph (CSP-safe, no inline handlers)
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName === 'IMG' && img.dataset.glyph) { const span = document.createElement('span'); span.innerHTML = icon(img.dataset.glyph, 'glyph'); img.replaceWith(span.firstChild); }
}, true);

// ---- library filter (search + creator); hides cards in place so typing keeps focus
const filterKey = (x) => [x.name?.en, x.name?.zh, x.name?.es, x.by, x.desc?.en].filter(Boolean).join(' ').toLowerCase();
function filterBar(list) {
  const people = [...new Set(list.map((x) => x.by).filter(Boolean))].sort();
  if (S.filter.by && !people.includes(S.filter.by)) S.filter.by = '';
  return `<div class="filter-bar"><input type="search" id="fq" placeholder="${esc(t('search'))}" value="${esc(S.filter.q)}" aria-label="${esc(t('search'))}">
    <div class="seg" id="fby"><button data-by="" class="${S.filter.by ? '' : 'on'}">${esc(t('everyone'))}</button>${people.map((p) => `<button data-by="${esc(p)}" class="${S.filter.by === p ? 'on' : ''}">${esc(authorName(p))}</button>`).join('')}</div>
    <span class="muted" id="fcount"></span></div>`;
}
function applyFilter(body) {
  const q = S.filter.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0, total = 0;
  for (const c of body.querySelectorAll('.card[data-f]')) {
    total++;
    const ok = (!S.filter.by || c.dataset.by === S.filter.by) && q.every((w) => c.dataset.f.includes(w));
    c.hidden = !ok; if (ok) shown++;
  }
  for (const g of body.querySelectorAll('.fgroup')) g.hidden = !g.querySelector('.card[data-f]:not([hidden])');
  const n = $('fcount'); if (n) n.textContent = shown === total ? '' : `${shown} / ${total}`;
  const e = $('fempty'); if (e) e.hidden = shown > 0;
}
function wireFilter(body) {
  const q = $('fq'); if (!q) return;
  q.oninput = () => { S.filter.q = q.value; applyFilter(body); };
  for (const b of body.querySelectorAll('#fby button')) b.onclick = () => { S.filter.by = b.dataset.by; for (const x of body.querySelectorAll('#fby button')) x.classList.toggle('on', x === b); applyFilter(body); };
  applyFilter(body);
}

function itemCard(it, cat) {
  const sel = S.picks.items[cat.id] === it.id;
  const inRom = S.scan?.items[cat.id] === it.id;
  return `<div class="card ${sel ? 'sel' : ''}" data-id="${esc(it.id)}" data-f="${esc(filterKey(it))}" data-by="${esc(it.by)}" role="button" tabindex="0" aria-pressed="${sel}">
    <div class="thumb">${thumbHtml(it.id, cat.icon)}
      <div class="flag">${sel ? `<span class="pill sel">${icon('check')}${esc(t('selected'))}</span>` : ''}${inRom ? `<span class="pill in">${esc(t('installed'))}</span>` : ''}${it.archived ? '<span class="pill">Archived</span>' : ''}</div>
      ${it.view ? `<button class="peek" title="${esc(t('preview'))}" aria-label="${esc(t('preview'))}">${icon('eye')}</button>` : ''}</div>
    <div class="meta"><div class="name">${esc(L(it.name))}</div><div class="by">${esc(t('by'))} ${esc(authorName(it.by))}</div>
      ${it.desc ? `<div class="note">${esc(L(it.desc))}</div>` : ''}
      ${it.linked ? `<div class="note">${icon('box')} ${esc(L(it.linked))}</div>` : ''}</div></div>`;
}

async function toggleItem(cat, id) {
  if (S.picks.items[cat] === id) delete S.picks.items[cat]; else S.picks.items[cat] = id;
  renderPanel();
  await refreshChanges();
}

// ---------------------------------------------------------------- battle backgrounds
const sceneById = (id) => S.lib.battle.scenes.find((x) => x.id === id);
const slotName = (m) => L(S.lib.battle.slots.find((s) => s.model === m)?.name);
/** Slots whose animation was broken by PokeMMO's battle-camera update: 58 (Unova forest) and 60 (caves). */
const PROTECTED_SLOTS = [58, 60];
/** A scene counts as animated when it carries a skeletal animation and is not a model-only swap. */
const isAnimated = (s) => !!(s?.anim && !s.modelOnly);
const slotList = (arr) => arr.map((m) => `${m} ${L(S.lib.battle.slots.find((s) => s.model === m)?.name) || ''}`).join(' · ');

function renderBattle(body) {
  const B = S.lib.battle;
  const list = B.scenes.filter(shown).filter((s) => !S.staticOnly || !isAnimated(s));
  // one group per creator (scenes that belong to an old-style set get that set's name)
  const groups = [];
  for (const sc of list) {
    const title = sc.set ? L(B.sets.find((x) => x.id === sc.set)?.name) || sc.set : authorName(sc.by) || '—';
    let g = groups.find((x) => x.title === title);
    if (!g) groups.push((g = { title, scenes: [] }));
    g.scenes.push(sc);
  }
  const selWarn = [...S.selSlots].some((m) => B.slots.find((s) => s.model === m)?.warn);
  body.innerHTML = `
    <div class="battle-bar">
      <div class="seg" id="modeSeg"><button data-m="both" class="${S.battleMode === 'both' ? 'on' : ''}">${esc(t('modeBoth'))}</button><button data-m="model" class="${S.battleMode === 'model' ? 'on' : ''}">${esc(t('modeModel'))}</button></div>
      <span class="muted" style="font-size:12.5px">${esc(t('modeHint'))}</span>
    </div>
    <div class="group-title">${esc(t('slots'))} <span class="muted">— ${esc(t('slotsHint'))}</span>
      <button class="ghost small" id="slotAll">${esc(t('selectAll'))}</button><button class="ghost small" id="slotNone">${esc(t('selectNone'))}</button></div>
    ${selWarn ? `<div class="callout">${icon('warn')}<span>${esc(t('noAnimSlot'))}</span></div>` : ''}
    ${S.staticOnly ? `<div class="callout ok">${icon('box')}<span>${esc(t('staticOnly'))}</span><button class="link" id="staticAll">${esc(t('staticAll'))}</button></div>` : ''}
    <div class="slots">${B.slots.map(slotTile).join('')}</div>
    ${bgtHtml()}
    <div class="group-title">${esc(t('sets'))}</div>
    <div class="row">${B.sets.map((s) => `<button class="secondary small" data-set="${esc(s.id)}">${esc(L(s.name))}</button>`).join('')}</div>
    <div class="group-title">${esc(t('library'))}</div>${filterBar(list)}
    ${groups.map((g) => `<div class="fgroup"><div class="group-title">${esc(g.title)}</div><div class="grid">${g.scenes.map(sceneCard).join('')}</div></div>`).join('')}<p class="muted" id="fempty" hidden>${esc(t('noMatch'))}</p>`;
  wireFilter(body);
  const allBtn = $('staticAll');
  if (allBtn) allBtn.onclick = () => { S.staticOnly = false; renderPanel(); };
  for (const b of body.querySelectorAll('#modeSeg button')) b.onclick = () => { S.battleMode = b.dataset.m; renderPanel(); };
  $('slotAll').onclick = () => { B.slots.forEach((s) => S.selSlots.add(s.model)); renderPanel(); };
  $('slotNone').onclick = () => { S.selSlots.clear(); renderPanel(); };
  for (const el of body.querySelectorAll('.slot')) {
    const m = +el.dataset.m;
    el.onclick = (e) => {
      if (e.target.closest('.clear')) { delete S.picks.battle[m]; renderPanel(); refreshChanges(); return; }
      if (e.target.closest('.peek')) { previewSlot(m); return; }
      S.selSlots.has(m) ? S.selSlots.delete(m) : S.selSlots.add(m);
      renderPanel();
    };
  }
  for (const el of body.querySelectorAll('[data-set]')) el.onclick = () => applySet(el.dataset.set);
  wireBgt();
  for (const c of body.querySelectorAll('.card')) {
    c.onclick = (e) => { if (e.target.closest('.peek')) return; assignScene(c.dataset.id); };
    c.querySelector('.peek').addEventListener('click', (e) => { e.stopPropagation(); previewScene(c.dataset.id); });
  }
}

function slotTile(s) {
  const a = S.picks.battle[s.model];
  const on = S.selSlots.has(s.model);
  let mini, sub;
  if (a) { mini = thumbHtml(a.scene, 'mountain'); sub = L(sceneById(a.scene)?.name) + (a.mode === 'model' ? ` (${t('sceneModelOnly')})` : ''); }
  else if (S.scan) {
    const v = S.scan.battle[s.model];
    const shot = S.romThumbs?.get(s.model);
    if (v !== 'original' && v !== 'custom') { mini = thumbHtml(v, 'mountain'); sub = `${t('installed')}: ${L(sceneById(v)?.name)}`; }
    else { mini = shot ? `<img src="${shot}" alt="">` : esc(v === 'original' ? t('original') : t('custom')); sub = `${v === 'original' ? t('original') : t('custom')} · ${t('unchanged')}`; }
  } else { mini = icon('mountain', 'glyph'); sub = t('unchanged'); }
  return `<div class="slot ${on ? 'on' : ''}" data-m="${s.model}" role="checkbox" aria-checked="${on}" tabindex="0">
    <div class="mini">${mini}</div><span class="tick">${on ? icon('check') : ''}</span>
    ${a ? `<button class="clear" title="${esc(t('remove'))}">✕</button>` : ''}
    ${s.warn ? `<span class="warn-dot" title="${esc(t('noAnimSlot'))}">${icon('warn')}</span>` : ''}
    ${a || S.rom ? `<button class="peek" title="${esc(t('preview'))}">${icon('eye')}</button>` : ''}
    <div class="lbl"><b>${esc(L(s.name))}</b><span>${esc(sub)}</span></div></div>`;
}

function sceneCard(s) {
  const used = Object.values(S.picks.battle).filter((a) => a.scene === s.id).length;
  const native = (s.native || []).map(slotName).filter(Boolean);
  const animated = isAnimated(s);
  return `<div class="card ${used ? 'sel' : ''}" data-id="${esc(s.id)}" data-f="${esc(filterKey(s))}" data-by="${esc(s.by)}" role="button" tabindex="0">
    <div class="thumb">${thumbHtml(s.id, 'mountain')}
      <span class="motion-tag ${animated ? 'anim' : 'static'}">${icon(animated ? 'spark' : 'box')}${esc(t(animated ? 'badgeAnim' : 'badgeStatic'))}</span>
      <div class="flag">${used ? `<span class="pill sel">${icon('check')}${used} ${esc(t('slotsCount'))}</span>` : ''}${s.archived ? '<span class="pill">Archived</span>' : ''}</div>
      <button class="peek" title="${esc(t('preview'))}">${icon('eye')}</button></div>
    <div class="meta"><div class="name">${esc(L(s.name))}</div><div class="by">${esc(t('by'))} ${esc(authorName(s.by))}${!animated ? ' · ' + esc(t('sceneModelOnly')) : ''}</div>
      ${native.length ? `<div class="note">${esc(t('nativeSlot'))}: ${esc(native.slice(0, 3).join(', '))}${native.length > 3 ? ` +${native.length - 3}` : ''}</div>` : ''}${s.desc ? `<div class="note">${esc(L(s.desc))}</div>` : ''}</div></div>`;
}

async function assignScene(id) {
  if (!S.selSlots.size) { toast(t('pickSlotsFirst'), 'warn'); return; }
  const s = sceneById(id);
  const risky = [...S.selSlots].filter((m) => PROTECTED_SLOTS.includes(m));
  // model-only swaps never touch the animation, so they are safe on 58 / 60
  if (risky.length && isAnimated(s) && S.battleMode !== 'model') {
    const c = await ask(t('slotAskTitle'), t('slotAskBody').replace('{slots}', risky.join(' / ')), [
      { id: 'cancel', label: t('slotAskCancel'), kind: 'ghost' },
      { id: 'use', label: t('slotAskUse'), kind: 'secondary' },
      { id: 'static', label: t('slotAskStatic'), kind: 'primary' },
    ]);
    if (c === 'cancel') return;
    if (c === 'static') { S.staticOnly = true; renderPanel(); return; }
  }
  const mode = isAnimated(s) ? S.battleMode : 'model';
  for (const m of S.selSlots) S.picks.battle[m] = { scene: id, mode };
  renderPanel();
  await refreshChanges();
}

// ---------------------------------------------------------------- official presets (made in dev mode)
function presetParts(p) {
  const parts = [];
  for (const [cat, id] of Object.entries(p.items || {})) { const c = S.lib.categories.find((x) => x.id === cat), it = S.lib.items.find((x) => x.id === id); if (c && it) parts.push(`${L(c.name)}: ${L(it.name)}`); }
  const n = Object.keys(p.battle || {}).length;
  if (n) parts.push(`${t('presetBattle')}: ${n} ${t('slotsCount')}`);
  return parts;
}
function renderPresets(head, body) {
  head.innerHTML = `<div><h2>${esc(t('presets'))}</h2><p>${esc(t('presetsHint'))}</p></div>`;
  const P = visiblePresets(), groups = [...new Set(P.map((p) => p.group || ''))];
  body.innerHTML = P.length ? groups.map((g) => `${g ? `<div class="group-title">${esc(g)}</div>` : ''}<div class="grid presets">${P.filter((p) => (p.group || '') === g).map((p) => {
    const first = Object.values(p.items || {})[0] || Object.values(p.battle || {})[0]?.scene;
    return `<div class="card preset" data-preset="${esc(p.id)}"><div class="thumb">${first ? thumbHtml(first, 'star') : icon('star', 'glyph')}${p.hidden ? '<div class="flag"><span class="pill">Hidden</span></div>' : ''}</div>
      <div class="meta"><div class="name">${esc(L(p.name))}</div>${p.desc ? `<div class="note">${esc(L(p.desc))}</div>` : ''}
      <ul class="note plist">${presetParts(p).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <button class="primary small" data-apply="${esc(p.id)}">${esc(t('presetApply'))}</button></div></div>`; }).join('')}</div>`).join('')
    : `<p class="muted">${esc(t('presetsNone'))}</p>`;
  for (const b of body.querySelectorAll('[data-apply]')) b.onclick = () => applyPreset(b.dataset.apply);
}
async function applyPreset(id) {
  const p = S.lib.presets.find((x) => x.id === id); if (!p) return;
  const risky = Object.entries(p.battle || {}).filter(([m, a]) => PROTECTED_SLOTS.includes(+m) && isAnimated(sceneById(a.scene))).map(([m]) => +m);
  let skip = false;
  if (risky.length) {
    const c = await guardSet(risky);
    if (c === 'cancel') return;
    skip = c === 'skip';
  }
  for (const [cat, iid] of Object.entries(p.items || {})) if (S.lib.items.some((x) => x.id === iid)) S.picks.items[cat] = iid;
  for (const [m, a] of Object.entries(p.battle || {})) {
    if (skip && PROTECTED_SLOTS.includes(+m)) continue;
    if (sceneById(a.scene)) S.picks.battle[m] = { scene: a.scene, mode: a.mode || 'both' };
  }
  toast(t('presetApplied').replace('{n}', L(p.name)), 'ok');
  renderPanel(); await refreshChanges();
}

// ---------------------------------------------------------------- library refresh (new items without a reload)
/** Swap in a new library, keeping every selection that still exists. */
async function setLibrary(lib, fromDev = false) {
  if (!fromDev) S.dev?.onLibrary?.(lib);
  S.lib = lib; S.fps = new Map(Object.entries(lib.files));
  for (const [cat, id] of Object.entries(S.picks.items)) if (!lib.items.some((x) => x.id === id && x.cat === cat)) delete S.picks.items[cat];
  for (const [m, a] of Object.entries(S.picks.battle)) if (!lib.battle.scenes.some((x) => x.id === a.scene)) delete S.picks.battle[m];
  S.picks.extras = S.picks.extras.filter((id) => lib.battle.sets.some((x) => x.id === id));
  if (S.rom) { try { S.scan = scanInstalled(S.rom.bytes, S.rom.R, lib, S.fps); } catch { /* keep */ } }
  renderRom(); renderPanel(); await refreshChanges();
}
let libStamp = '';
async function checkLibrary() {
  if (S.dev?.previewing?.()) return; // dev mode is showing a draft
  try {
    const r = await fetch('../../library/library.json', { cache: 'no-cache' });
    if (!r.ok) return;
    const text = await r.text();
    if (text === libStamp) return;
    const first = !libStamp; libStamp = text;
    if (first) return;
    await setLibrary(JSON.parse(text));
    toast(t('libUpdated'), 'ok');
  } catch { /* offline: keep what we have */ }
}

/** Ask before an animated background lands on the protected slots. Returns 'ok' | 'skip' | 'cancel'. */
async function guardSet(ids) {
  const c = await ask(
    t('setAskTitle').replace('{slots}', ids.join(' / ')),
    t('setAskBody'),
    [
      { id: 'cancel', label: t('setAskCancel'), kind: 'ghost' },
      { id: 'skip', label: t('setAskSkip').replace('{slots}', ids.join(' / ')), kind: 'secondary' },
      { id: 'ok', label: t('setAskUse'), kind: 'primary' },
    ],
  );
  return c || 'cancel';
}

async function applySet(id) {
  const set = S.lib.battle.sets.find((x) => x.id === id);
  const risky = Object.entries(set.assign).filter(([m, sid]) => PROTECTED_SLOTS.includes(+m) && isAnimated(sceneById(sid))).map(([m]) => +m);
  let skip = false;
  if (risky.length) {
    const c = await guardSet(risky);
    if (c === 'cancel') return;
    skip = c === 'skip';
  }
  for (const [m, sid] of Object.entries(set.assign)) {
    if (skip && PROTECTED_SLOTS.includes(+m)) continue;
    const s = sceneById(sid); S.picks.battle[m] = { scene: sid, mode: isAnimated(s) ? 'both' : 'model' };
  }
  if (set.extras.length && !S.picks.extras.includes(id)) S.picks.extras.push(id);
  renderPanel();
  await refreshChanges();
}

// ---- make your own background from pictures (MaToRiuKo's template swap)
const bgtTpl = () => { const T = S.lib.templates || []; return T.find((x) => x.id === S.bgt.tpl) || T[0]; };
function bgtHtml() {
  const T = S.lib.templates || [];
  if (!T.length) return '';
  const tp = bgtTpl(), B = S.bgt;
  return `<details class="bgt panel" id="bgt" ${B.open ? 'open' : ''}><summary><b>${esc(t('bgtTitle'))}</b> <span class="muted">— ${esc(t('by'))} ${esc(authorName(tp.by))}</span></summary>
    <p class="muted" style="margin:6px 0 10px">${esc(t('bgtHint'))}</p>    <div class="row"><label class="field"><span>${esc(t('bgtTemplate'))}</span><select id="bgtTpl">${T.map((x) => `<option value="${esc(x.id)}" ${x.id === tp.id ? 'selected' : ''}>${esc(L(x.name))}</option>`).join('')}</select></label></div>
    <div class="bgt-slots">${tp.slots.map((sl) => { const im = B.imgs[sl.tex]; const sizes = legalSizes(sl.width, sl.height).map((z) => `${z.width}×${z.height}`).join(', ');
      return `<div class="bgt-slot"><div class="bgt-pic">${im ? `<img src="${im.url}" alt="">` : `<span class="muted">${esc(t('bgtKeep'))}</span>`}</div>
        <div><b>${esc(L(sl.name))}</b> <span class="muted">${sl.width}×${sl.height}</span>
          <div class="muted small">${esc(t('bgtSizes'))}: ${esc(sizes)}</div>
          ${im ? `<div class="small">${esc(im.name)} · ${im.width}×${im.height}${im.resized ? ` <span class="warn">(${esc(t('bgtResized').replace('{a}', im.resized))})</span>` : ''}</div>` : ''}
          <div class="row"><button class="secondary small" data-pic="${esc(sl.tex)}">${esc(t('bgtChoose'))}</button>
            ${im ? `<button class="ghost small" data-unpic="${esc(sl.tex)}">${esc(t('remove'))}</button>` : ''}
            <label class="field inline"><span>${esc(t('bgtColors'))}</span><select data-col="${esc(sl.tex)}">${[16, 256].map((n) => `<option value="${n}" ${(B.colors[sl.tex] || sl.colors) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div></div></div>`; }).join('')}</div>
    <div class="row"><button class="ghost" id="bgtPrev" ${Object.keys(B.imgs).length ? '' : 'disabled'}>${icon('eye')}${esc(t('preview'))}</button>
      <button class="primary" id="bgtUse" ${Object.keys(B.imgs).length && S.selSlots.size ? '' : 'disabled'}>${esc(t('bgtUse'))} (${S.selSlots.size})</button>
      ${!S.selSlots.size ? `<span class="muted small">${esc(t('pickSlotsFirst'))}</span>` : ''}</div></details>`;
}
async function readPicture(file, sl) {
  const bmp = await createImageBitmap(file);
  let w = bmp.width, h = bmp.height, resized = '';
  const legal = legalSizes(sl.width, sl.height);
  if (!legal.some((z) => z.width === w && z.height === h)) {
    const fit = legal.find((z) => z.width <= w && z.height <= h) || legal[legal.length - 1];
    resized = `${w}×${h}`; w = fit.width; h = fit.height;
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h);
  return { name: file.name, width: w, height: h, rgba: g.getImageData(0, 0, w, h).data, url: c.toDataURL('image/png'), resized };
}
async function bgtModel() {
  const tp = bgtTpl(), tpl = await loadFile(tp.file), imgs = {};
  for (const [tex, im] of Object.entries(S.bgt.imgs)) imgs[tex] = { ...im, colors: S.bgt.colors[tex] || tp.slots.find((x) => x.tex === tex).colors };
  return buildFromTemplate(tpl, imgs);
}
function wireBgt() {
  const d = $('bgt'); if (!d) return;
  const B = S.bgt, tp = bgtTpl();
  d.ontoggle = () => { B.open = d.open; };
  $('bgtTpl').onchange = (e) => { B.tpl = e.target.value; B.imgs = {}; B.colors = {}; renderPanel(); };
  for (const b of d.querySelectorAll('[data-pic]')) b.onclick = async () => {
    const [f] = await platform.pickFiles({ accept: 'image/png,image/jpeg,image/webp,image/gif,image/bmp' });
    if (!f) return;
    try { B.imgs[b.dataset.pic] = await readPicture(f, tp.slots.find((x) => x.tex === b.dataset.pic)); } catch (e) { toast(`${t('error')}: ${e.message || e}`, 'bad'); }
    renderPanel();
  };
  for (const b of d.querySelectorAll('[data-unpic]')) b.onclick = () => { delete B.imgs[b.dataset.unpic]; renderPanel(); };
  for (const s of d.querySelectorAll('[data-col]')) s.onchange = () => { B.colors[s.dataset.col] = +s.value; };
  $('bgtPrev').onclick = async () => {
    busy(t('building')); await tick();
    try { const model = await bgtModel(); busy(''); const m = [...S.selSlots][0] ?? 34; const slot = S.lib.battle.slots.find((x) => x.model === m);
      openViewer({ title: t('bgtName'), model, anim: null, kind: 'scene', original: S.rom ? { model: romMember(S.lib.battle.path, m), anim: slot ? romMember(S.lib.battle.path, slot.anim) : null, label: slotName(m) } : null, fileBase: 'my-background' });
    } catch (e) { busy(''); toast(`${t('error')}: ${e.message || e}`, 'bad'); }
  };
  $('bgtUse').onclick = async () => {
    if (!S.selSlots.size) { toast(t('pickSlotsFirst'), 'warn'); return; }
    busy(t('building')); await tick();
    try {
      const model = await bgtModel(); const slots = [...S.selSlots].sort((a, b) => a - b);
      for (const m of slots) delete S.picks.battle[m];
      S.picks.custom = S.picks.custom.filter((c) => !(c.bgt && c.slots.some((m) => slots.includes(m))));
      S.picks.custom.push({ id: Date.now().toString(36), bgt: true, slots, name: `${t('bgtName')} (${Object.values(S.bgt.imgs).map((x) => x.name).join(', ')})`, sub: `${slots.map(slotName).join(', ')} · ${t('sceneModelOnly')}`, writes: slots.map((m) => ({ path: S.lib.battle.path, member: m, data: model })) });
      busy(''); toast(t('bgtAdded'), 'ok'); renderPanel(); await refreshChanges();
    } catch (e) { busy(''); toast(`${t('error')}: ${e.message || e}`, 'bad'); }
  };
}

// ---------------------------------------------------------------- previews
function romMember(path, m) {
  try { return rom.readMember(S.rom.bytes, S.rom.R, path, m); } catch { return null; }
}
async function previewItem(id) {
  const it = S.lib.items.find((x) => x.id === id);
  const v = it.view || (() => { const w = it.writes.find((x) => x.file.endsWith('.nsbmd')); return w ? { model: w.file, kind: 'object' } : null; })();
  if (!v) { toast(t('noPreview')); return; }
  const model = await loadFile(v.model), anim = v.anim ? await loadFile(v.anim) : null;
  let original = null;
  if (S.rom) {
    const wm = it.writes.find((w) => w.file === v.model), wa = v.anim ? it.writes.find((w) => w.file === v.anim) : null;
    if (wm) original = { model: romMember(wm.path, wm.member), anim: wa ? romMember(wa.path, wa.member) : null };
  }
  openViewer({ title: L(it.name), model, anim, kind: v.kind, original, fileBase: it.id });
}
async function previewScene(id, slotModel = null) {
  const s = sceneById(id);
  const model = await loadFile(s.model), anim = s.anim ? await loadFile(s.anim) : null;
  let original = null;
  const m = slotModel ?? [...S.selSlots][0] ?? s.native?.[0] ?? 34;
  if (S.rom) { const slot = S.lib.battle.slots.find((x) => x.model === m); original = { model: romMember(S.lib.battle.path, m), anim: slot ? romMember(S.lib.battle.path, slot.anim) : null, label: slotName(m) }; }
  openViewer({ title: L(s.name), model, anim, kind: 'scene', original, fileBase: id });
}
function previewSlot(m) {
  const a = S.picks.battle[m];
  if (a) previewScene(a.scene, m); else previewRomSlot(m);
}
function previewRomSlot(m) {
  if (!S.rom) { toast(t('needRom'), 'warn'); return; }
  const slot = S.lib.battle.slots.find((x) => x.model === m);
  previewRomMember(slotName(m), S.lib.battle.path, m, slot?.anim, 'scene');
}
function previewRomMember(title, path, m, a, kind) {
  if (!S.rom) { toast(t('needRom'), 'warn'); return; }
  const model = romMember(path, m);
  if (!model || rom.magic(model) !== 'BMD0') { toast(`${path} #${m}: ${t('notModel')}`, 'warn'); return; }
  const anim = a != null ? romMember(path, a) : null;
  openViewer({ title: `${t('inRom')}: ${title}`, model, anim: anim && rom.magic(anim) === 'BCA0' ? anim : null, kind, original: null, fileBase: `${path.replace(/\//g, '')}_${m}` });
}

// ---------------------------------------------------------------- viewer modal
const V = { viewers: [], loaded: null, orig: null, mode: 'free', playing: false, raf: 0, frame: 0, opts: null };
function openViewer(opts) {
  V.opts = opts;
  try { V.loaded = loadModel(opts.model, opts.anim); } catch (e) { toast(`${t('notModel')} ${e.message || ''}`, 'bad'); return; }
  V.orig = null;
  if (opts.original?.model && rom.magic(opts.original.model) === 'BMD0') {
    try { V.orig = loadModel(opts.original.model, opts.original.anim && rom.magic(opts.original.anim) === 'BCA0' ? opts.original.anim : null); } catch { V.orig = null; }
  }
  V.mode = 'free'; V.frame = 0;
  $('viewerTitle').textContent = opts.title;
  $('viewerModal').hidden = false;
  layoutViewer();
}
function closeViewer() {
  stopPlay();
  V.viewers.forEach((v) => v.destroy()); V.viewers = [];
  $('viewerStage').innerHTML = '';
  $('viewerModal').hidden = true;
}
function layoutViewer() {
  stopPlay();
  V.viewers.forEach((v) => v.destroy()); V.viewers = [];
  const stage = $('viewerStage');
  const kind = V.opts.kind;
  let cells;
  if (V.mode === 'four') {
    const cams = kind === 'scene'
      ? [{ yaw: 0, pitch: 0.2, zoom: 5 }, { yaw: Math.PI / 2, pitch: 0.2, zoom: 2.5 }, { yaw: 0, pitch: 1.45, zoom: 1.6 }, { yaw: 0.6, pitch: 0.35, zoom: 1.6 }]
      : [{ yaw: 0, pitch: 0, zoom: 1 }, { yaw: Math.PI / 2, pitch: 0, zoom: 1 }, { yaw: 0, pitch: 1.5, zoom: 1 }, { yaw: 0.6, pitch: 0.3, zoom: 1 }];
    cells = t('views').map((label, i) => ({ label, loaded: V.loaded, cam: cams[i] }));
  } else if (V.mode === 'compare') {
    cells = [{ label: `${t('inRom')}${V.opts.original?.label ? ': ' + V.opts.original.label : ''}`, loaded: V.orig }, { label: t('replacement'), loaded: V.loaded }];
  } else cells = [{ label: '', loaded: V.loaded }];
  stage.className = 'viewer-stage ' + (cells.length === 4 ? 'four' : cells.length === 2 ? 'two' : 'one');
  stage.innerHTML = cells.map((c) => `<div class="vcell"><canvas></canvas>${c.label ? `<span class="cap">${esc(c.label)}</span>` : ''}${c.loaded ? '' : `<div class="nothing">${esc(t('noPreview'))}</div>`}</div>`).join('');
  const canvases = stage.querySelectorAll('canvas');
  cells.forEach((c, i) => {
    if (!c.loaded) return;
    try {
      const v = new ModelViewer(canvases[i]);
      v.show(c.loaded, kind);
      if (c.cam) { v.cam = { ...c.cam }; v.draw(); }
      V.viewers.push(v);
    } catch (e) { canvases[i].parentElement.insertAdjacentHTML('beforeend', `<div class="nothing">${esc(e.message)}</div>`); }
  });
  // toolbar
  const modes = [['free', t('freeView')], ['four', t('fourViews')]];
  $('viewMode').innerHTML = modes.map(([m, l]) => `<button data-m="${m}" class="${V.mode === m ? 'on' : ''}">${esc(l)}</button>`).join('');
  for (const b of $('viewMode').querySelectorAll('button')) b.onclick = () => { V.mode = b.dataset.m; layoutViewer(); };
  $('vCompare').hidden = !V.orig;
  $('vCompare').textContent = t('compare');
  $('vCompare').classList.toggle('on', V.mode === 'compare');
  $('vCompare').onclick = () => { V.mode = V.mode === 'compare' ? 'free' : 'compare'; layoutViewer(); };
  $('vAttach').textContent = t('attachAnim');
  $('vAttach').onclick = async () => {
    const [f] = await platform.pickFiles({ accept: '.nsbca,.bca' });
    if (!f) return;
    const b = new Uint8Array(await f.arrayBuffer());
    if (rom.magic(b) !== 'BCA0') { toast(t('notAnim'), 'bad'); return; }
    V.opts.anim = b; V.loaded = loadModel(V.opts.model, b); layoutViewer();
  };
  $('vExport').textContent = t('exportModel');
  $('vExport').onclick = async () => {
    await saveBytes(`${V.opts.fileBase}.nsbmd`, V.opts.model, 'nsbmd');
    if (V.opts.anim) await saveBytes(`${V.opts.fileBase}.nsbca`, V.opts.anim, 'nsbca');
  };
  const frames = Math.max(0, ...V.viewers.map((v) => v.frames));
  $('vFrame').max = Math.max(0, frames - 1); $('vFrame').value = 0; $('vFrame').disabled = !frames;
  $('vPlay').disabled = !frames;
  $('vPlay').textContent = t('play');
  $('vFrameNo').textContent = frames ? `0 / ${frames}` : '';
  $('vFrame').oninput = () => { stopPlay(); setFrame(+$('vFrame').value); };
  $('vPlay').onclick = () => (V.playing ? stopPlay() : startPlay());
  if (frames) startPlay();
}
function setFrame(f) {
  V.frame = f;
  V.viewers.forEach((v) => v.setFrame(f));
  const frames = Math.max(0, ...V.viewers.map((v) => v.frames));
  $('vFrame').value = frames ? f % frames : 0;
  $('vFrameNo').textContent = frames ? `${f % frames} / ${frames}` : '';
}
function startPlay() {
  V.playing = true; $('vPlay').textContent = t('pause');
  let last = performance.now(), acc = 0;
  const step = (now) => {
    if (!V.playing) return;
    acc += now - last; last = now;
    if (acc >= 33) { const n = Math.floor(acc / 33.3); acc -= n * 33.3; setFrame(V.frame + n); }
    V.raf = requestAnimationFrame(step);
  };
  V.raf = requestAnimationFrame(step);
}
function stopPlay() { V.playing = false; cancelAnimationFrame(V.raf); if ($('vPlay')) $('vPlay').textContent = t('play'); }

// ---------------------------------------------------------------- changes list
function changeView(c) {
  const lib = S.lib;
  if (c.kind === 'item') {
    const cat = lib.categories.find((x) => x.id === c.cat);
    return { thumb: c.item.id, glyph: cat.icon, title: L(c.item.name), sub: `${L(cat.name)} · ${nFiles(c.writes.length)}` };
  }
  if (c.kind === 'scene') return { thumb: c.scene.id, glyph: 'mountain', title: L(c.scene.name), sub: `${c.slots.map(slotName).join(', ')}${c.mode === 'model' ? ' · ' + t('sceneModelOnly') : ''}`, warn: c.slots.some((m) => lib.battle.slots.find((s) => s.model === m)?.warn) };
  if (c.kind === 'extras') return { glyph: 'spark', title: `${L(c.set.name)}: ${t('extras')}`, sub: `${nFiles(c.writes.length)}` };
  return { glyph: 'upload', title: c.custom.name, sub: c.custom.sub || `${nFiles(c.writes.length)}` };
}

function renderChanges() {
  const list = $('changeList');
  const ov = overlaps(S.changes);
  const byKey = new Map(S.changes.map((c) => [c.key, c]));
  if (!S.changes.length) list.innerHTML = `<li class="empty">${esc(t('noChanges'))}</li>`;
  else list.innerHTML = S.changes.map((c) => {
    const v = changeView(c);
    const over = ov.get(c.key) ? [...ov.get(c.key)].map((k) => changeView(byKey.get(k)).title).join(', ') : '';
    return `<li class="chg" data-key="${esc(c.key)}">${v.thumb && (!S.lib.thumbs || S.lib.thumbs.includes(v.thumb)) ? `<img src="../../library/previews/${esc(v.thumb)}.jpg" alt="" data-glyph="${v.glyph}">` : `<span class="ph">${icon(v.glyph)}</span>`}
      <div style="min-width:0"><b>${esc(v.title)}</b><small>${esc(v.sub)}</small>${v.warn ? `<small class="warn">${esc(t('noAnimSlot'))}</small>` : ''}${over ? `<small class="warn">${esc(t('overrides'))} ${esc(over)}</small>` : ''}</div>
      <button class="icon-btn" title="${esc(t('remove'))}" aria-label="${esc(t('remove'))}">✕</button></li>`;
  }).join('');
  for (const li of list.querySelectorAll('.chg')) li.querySelector('button').onclick = () => removeChange(li.dataset.key);
  $('clearAll').hidden = !S.changes.length;
  // size meter
  const meter = $('meter');
  if (S.rom && S.changes.length) {
    const g = sizeGrowth(S.rom.bytes, S.rom.R, S.changes);
    meter.hidden = false;
    meter.classList.toggle('warn', g > SOFT_LIMIT);
    $('meterVal').textContent = mb(g);
    $('meterFill').style.width = Math.min(100, (g / SOFT_LIMIT) * 100) + '%';
    $('meterNote').textContent = g > SOFT_LIMIT ? t('sizeWarn') : t('sizeOk');
  } else meter.hidden = true;
  $('saveNds').disabled = $('saveBps').disabled = !(S.rom && S.changes.length);
  renderTabs();
}

async function removeChange(key) {
  const c = S.changes.find((x) => x.key === key);
  if (!c) return;
  if (c.kind === 'item') delete S.picks.items[c.cat];
  else if (c.kind === 'scene') for (const m of c.slots) delete S.picks.battle[m];
  else if (c.kind === 'extras') S.picks.extras = S.picks.extras.filter((x) => x !== c.set.id);
  else S.picks.custom = S.picks.custom.filter((x) => 'custom:' + x.id !== key);
  renderPanel();
  await refreshChanges();
}

// ---------------------------------------------------------------- export
async function saveBytes(name, bytes, kind) {
  const r = await platform.save(name, bytes);
  if (!r) { toast(t('cancelled')); return null; }
  if (r.name) toast(`${t('saved')}: ${r.name}`);
  else toast(`${t('saved')} — ${t('inDownloads')}`);
  return r;
}
async function exportRom(asPatch) {
  if (!S.rom) { toast(t('needRom'), 'warn'); return; }
  if (!S.changes.length) { toast(t('needChanges'), 'warn'); return; }
  busy(t('building')); await tick();
  try {
    const writes = S.changes.flatMap((c) => c.writes);
    const { rom: out } = rom.buildRom(S.rom.bytes, writes);
    busy(t('verifying')); await tick();
    const base = S.rom.name.replace(/\.nds$/i, '');
    if (!asPatch) { busy(''); await saveBytes(`${base} (modded).nds`, out, 'nds'); return; }
    busy(t('makingPatch')); await tick();
    const bps = rom.makeBps(S.rom.bytes, out, `Rom Patch Manager — ${S.changes.map((c) => changeView(c).title).join(', ')}`);
    if (!rom.bytesEqual(rom.applyBps(bps, S.rom.bytes), out)) throw new Error('Patch check failed.');
    busy('');
    await saveBytes(`${base} (modded).bps`, bps, 'bps');
  } catch (e) {
    busy('');
    toast(`${t('error')}: ${e.message || e}`, 'bad');
  }
}

// ---------------------------------------------------------------- your files (custom import)
async function readDropped(files) {
  const out = [];
  for (const f of files) {
    if (f.size > 64 * 1048576) continue;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const m = rom.magic(bytes);
    if (!['BMD0', 'BCA0', 'BTX0', 'BTA0', 'BTP0', 'BMA0', 'BVA0', 'NARC'].includes(m)) continue;
    const item = { name: f.name, rel: f.relPath || f.webkitRelativePath || f.name, bytes, magic: m, role: '' };
    if (m === 'BMD0') {
      const c = checkModel(bytes);
      item.errors = c.errors;
      if (c.fixedBytes) { item.bytes = c.fixedBytes; item.fixed = true; }
      item.fly = isFlyModel(bytes);
    }
    out.push(item);
  }
  return out;
}
function autoRoles(files, target) {
  const isIn = (f) => /(^|\/)(in|fly_in|回收)(\/|$)|(^|[^a-z])in[^a-z]/i.test(f.rel.replace(f.name, '')) || /fly_in|land|降落|aterriz/i.test(f.name);
  for (const f of files) {
    if (target === 'fly') f.role = f.magic === 'BMD0' ? (isIn(f) ? 'inModel' : 'outModel') : f.magic === 'BCA0' ? (isIn(f) ? 'inAnim' : 'outAnim') : '';
    else if (target === 'adv') f.role = 'data';
    else if (target === 'map') f.role = f.magic === 'BTX0' ? 'data' : '';
    else f.role = f.magic === 'BMD0' ? 'model' : f.magic === 'BCA0' && target === 'battle' ? 'anim' : '';
  }
  // only one file per role
  const seen = new Set();
  for (const f of files) { if (!f.role) continue; if (seen.has(f.role)) f.role = ''; else seen.add(f.role); }
}

function importWrites() {
  const I = S.imp, by = (r) => I.files.find((f) => f.role === r)?.bytes;
  const w = [];
  if (I.target === 'surf') { const m = by('model'); if (m) w.push({ path: 'a/0/7/5', member: 49, data: m }); }
  if (I.target === 'platforms') { const m = by('model'); if (m) for (let i = 0; i < 34; i++) w.push({ path: 'a/0/1/1', member: i, data: m }); }
  if (I.target === 'battle') {
    const m = by('model'), a = by('anim');
    const slots = I.slot === 'sel' ? [...S.selSlots] : I.slot === 'all' ? S.lib.battle.slots.map((s) => s.model) : [+I.slot];
    if (m) for (const sm of slots) { w.push({ path: 'a/0/1/1', member: sm, data: m }); const s = S.lib.battle.slots.find((x) => x.model === sm); if (a && s) w.push({ path: 'a/0/1/1', member: s.anim, data: a }); }
  }
  if (I.target === 'fly') {
    const om = by('outModel'), oa = by('outAnim'), ia = by('inAnim');
    const im = by('inModel') || om; // one Fly model is used for take-off and landing unless a landing model is given
    if (om) FLY_OUT_MODEL.forEach((m) => w.push({ path: 'a/1/1/5', member: m, data: om }));
    if (oa) FLY_OUT_ANIM.forEach((m) => w.push({ path: 'a/1/1/5', member: m, data: oa }));
    if (im) FLY_IN_MODEL.forEach((m) => w.push({ path: 'a/1/1/5', member: m, data: im }));
    if (ia) FLY_IN_ANIM.forEach((m) => w.push({ path: 'a/1/1/5', member: m, data: ia }));
  }
  if (I.target === 'adv') { const d = by('data'); if (d) w.push({ path: I.path.trim(), member: +I.member, data: d }); }
  if (I.target === 'map') { const d = by('data'); if (d) w.push({ path: MAP_PATH, member: +I.mapItem, data: d }); }
  return w;
}

function renderImport(head, body) {
  const I = S.imp;
  head.innerHTML = `<div><h2>${esc(t('importTitle'))}</h2><p>${esc(t('importHint'))}</p></div>`;
  const roleOpts = {
    surf: [['model', t('model')]], platforms: [['model', t('model')]],
    battle: [['model', t('model')], ['anim', t('anim')]],
    fly: [['outModel', `${t('flyOut')}: ${t('model')}`], ['outAnim', `${t('flyOut')}: ${t('anim')}`], ['inModel', `${t('flyIn')}: ${t('model')}`], ['inAnim', `${t('flyIn')}: ${t('anim')}`]],
    adv: [['data', t('member')]],
    map: [['data', t('mapFile')]],
  }[I.target];
  const writes = importWrites();
  const slotSel = I.target === 'battle' ? `<label class="field"><span>${esc(L(S.lib.categories.find((c) => c.id === 'battle').name))}</span><select id="impSlot">
      <option value="sel" ${I.slot === 'sel' ? 'selected' : ''}>${esc(t('selected'))} (${S.selSlots.size})</option>
      <option value="all" ${I.slot === 'all' ? 'selected' : ''}>${esc(t('selectAll'))} (25)</option>
      ${S.lib.battle.slots.map((s) => `<option value="${s.model}" ${String(I.slot) === String(s.model) ? 'selected' : ''}>${esc(L(s.name))} (1_${s.model}${s.anim ? ' + 1_' + s.anim : ''})</option>`).join('')}</select></label>` : '';
  const mapSel = I.target === 'map' ? `<label class="field"><span>${esc(t('mapArea'))} (${MAP_PATH})</span><select id="impMap">${mapOptions()}</select></label>` : '';
  const adv = I.target === 'adv' ? `<div class="row"><label class="field" style="flex:1"><span>${esc(t('archive'))}</span><input id="impPath" value="${esc(I.path)}"></label><label class="field" style="width:110px"><span>${esc(t('member'))}</span><input id="impMember" type="number" min="0" value="${esc(I.member)}"></label></div>` : '';
  body.innerHTML = `<div class="imp">
    <section class="panel">
      <label class="field"><span>${esc(t('target'))}</span><select id="impTarget">
        ${[['surf', t('tSurf')], ['battle', t('tBattle')], ['platforms', t('tPlatform')], ['fly', t('tFlyAll')], ['map', t('tMap')], ['adv', t('tAdvanced')]].map(([v, l]) => `<option value="${v}" ${I.target === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      ${slotSel}${mapSel}${adv}
      <div class="drop" id="impDrop" tabindex="0" role="button">${icon('upload', 'cart')}<b>${esc(I.target === 'map' ? t('dropMap') : t('dropFiles'))}</b><p>${I.target === 'map' ? '.BTX0 · .narc' : '.nsbmd · .nsbca'}</p><span class="secondary small">${esc(t('chooseFiles'))}</span></div>
      ${I.files.length ? `<ul class="filelist">${I.files.map((f, i) => `<li><div><div>${esc(f.name)}</div><div class="kind">${f.magic}${f.fixed ? ' · ' + esc(t('countsFixed')) : ''}</div>${(f.errors || []).map((e) => `<div class="err">${esc(e.code === 'emptyPart' ? t('emptyPart').replace('{part}', e.detail) : t('badModel') + ' ' + e.detail)}</div>`).join('')}</div>
        <select data-i="${i}"><option value="">—</option>${roleOpts.map(([v, l]) => `<option value="${v}" ${f.role === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></li>`).join('')}</ul>` : ''}
      <div class="row">
        <button class="ghost" id="impPreview" ${I.files.some((f) => f.magic === 'BMD0' && f.role) ? '' : 'disabled'}>${icon('eye')}${esc(t('preview'))}</button>
        <button class="primary" id="impAdd" ${writes.length && !I.files.some((f) => f.role && f.errors?.length) ? '' : 'disabled'}>${esc(t('addToChanges'))}</button>
        ${writes.length ? `<span class="muted">${esc(nFiles(writes.length))}</span>` : ''}
      </div>
      ${I.target === 'battle' && I.slot === 'sel' && !S.selSlots.size ? `<p class="err">${esc(t('pickSlotsFirst'))}</p>` : ''}
    </section>
    <section class="panel">
      <h2>${esc(t('archiveImport'))}</h2><p class="muted" style="margin:0">${esc(t('archiveHint'))}</p>
      <div class="row"><button class="secondary" id="arcPick">${esc(t('chooseArchive'))}</button></div>
      ${archiveHtml()}
    </section></div>`;
  $('impTarget').onchange = async (e) => { I.target = e.target.value; if (I.target === 'map') await loadMapNames(); autoRoles(I.files, I.target); renderPanel(); };
  if ($('impSlot')) $('impSlot').onchange = (e) => { I.slot = e.target.value; renderPanel(); };
  if ($('impMap')) $('impMap').onchange = (e) => { I.mapItem = +e.target.value; renderPanel(); };
  if ($('impPath')) { $('impPath').onchange = (e) => { I.path = e.target.value; renderPanel(); }; $('impMember').onchange = (e) => { I.member = e.target.value; renderPanel(); }; }
  const d = $('impDrop');
  const take = async (files) => {
    const got = await readDropped(files); if (!got.length) { toast(t('notModel'), 'warn'); return; }
    // a whole archive (e.g. a map pack .narc) goes to the archive importer
    const narc = got.find((f) => f.magic === 'NARC');
    if (narc && !got.some((f) => f.magic !== 'NARC')) { loadArchiveBytes(narc.name, narc.bytes); return; }
    I.files = got.filter((f) => f.magic !== 'NARC');
    // single map area: item number from the file name (…_4_62_VillageBridge.BTX0 → 62)
    const btx = I.files.find((f) => f.magic === 'BTX0');
    if (btx && !I.files.some((f) => f.magic === 'BMD0')) {
      I.target = 'map';
      const n = (btx.name.match(/(?:^|[_\- ])4_(\d{1,3})(?=[_.\- ]|$)/) || btx.name.match(/(\d{1,3})(?=\.btx0?$)/i) || btx.name.match(/_(\d{1,3})(?=[_.])/));
      if (n && +n[1] < 282) I.mapItem = +n[1];
      await loadMapNames();
    }
    // Fly files are easy to drop into the wrong target: switch automatically when a model uses the Fly skeleton
    if (I.target !== 'fly' && I.files.some((f) => f.fly)) { I.target = 'fly'; toast(t('flyDetected'), 'ok'); }
    autoRoles(I.files, I.target); renderPanel();
  };
  d.onclick = async () => take(await platform.pickFiles({ accept: '.nsbmd,.nsbca,.nsbtx,.bmd,.bca,.btx0,.btx,.narc', multiple: true }));
  dropTarget(d, take);
  for (const s of body.querySelectorAll('.filelist select')) s.onchange = () => { I.files[+s.dataset.i].role = s.value; renderPanel(); };
  $('impPreview').onclick = () => {
    const model = I.files.find((f) => f.magic === 'BMD0' && /model|Model|data/.test(f.role))?.bytes;
    const anim = I.files.find((f) => f.magic === 'BCA0' && /anim|Anim/.test(f.role))?.bytes || null;
    if (!model) { toast(t('needModel'), 'warn'); return; }
    let original = null;
    const tgt = writes.find((w) => w.data === model);
    if (S.rom && tgt) original = { model: romMember(tgt.path, tgt.member), anim: null };
    openViewer({ title: t('importedName'), model, anim, kind: I.target === 'battle' ? 'scene' : 'object', original, fileBase: 'imported' });
  };
  $('impAdd').onclick = async () => {
    const w = importWrites();
    if (!w.length) return;
    const target = { surf: t('tSurf'), battle: t('tBattle'), platforms: t('tPlatform'), fly: t('tFlyAll'), map: `${MAP_PATH} #${I.mapItem} ${mapName(I.mapItem)}`, adv: `${I.path} #${I.member}` }[I.target];
    const name = `${I.files.find((f) => f.role)?.name || t('importedName')}`;
    S.picks.custom.push({ id: Date.now().toString(36), name, sub: `${target} · ${nFiles(w.length)}`, writes: w });
    I.files = [];
    renderPanel(); await refreshChanges();
  };
  $('arcPick').onclick = async () => { const [f] = await platform.pickFiles({ accept: '*' }); if (f) loadArchive(f); };
  wireArchive();
}

// ---- map textures (A014 = a/0/1/4, 282 areas; names from MaToRiuKo's romtool)
const MAP_PATH = 'a/0/1/4';
async function loadMapNames() {
  if (S.mapNames) return;
  try { S.mapNames = await (await fetch('data/mapnames.json')).json(); } catch { S.mapNames = { en: {}, zh: {} }; }
}
const mapName = (i) => (S.mapNames ? (getLang() === 'zh' ? S.mapNames.zh : S.mapNames.en)[i] || '' : '');
function mapOptions() {
  let n = 282;
  if (S.rom) { try { n = rom.parseNarc(rom.readFile(S.rom.bytes, S.rom.R, MAP_PATH))?.members.length || n; } catch { /* keep 282 */ } }
  return Array.from({ length: n }, (_, i) => `<option value="${i}" ${S.imp.mapItem === i ? 'selected' : ''}>#${i} ${esc(mapName(i))}</option>`).join('');
}

// ---- whole-archive batch import (Mato's "export the whole a/0/1/1 folder" workflow)
async function loadArchive(file) { loadArchiveBytes(file.name, new Uint8Array(await file.arrayBuffer())); }
function loadArchiveBytes(name, bytes) {
  const file = { name };
  if (!S.rom) { toast(t('needRom'), 'warn'); return; }
  const N = rom.parseNarc(bytes);
  if (!N) { toast('Not a NARC archive.', 'bad'); return; }
  const cands = [];
  for (const [p, id] of S.rom.R.paths) {
    const [s, e] = S.rom.R.files[id];
    if (e - s < 0x1c) continue;
    const RN = rom.parseNarc(S.rom.bytes.subarray(s, e));
    if (RN && RN.members.length === N.members.length) cands.push(p);
  }
  const guess = cands.find((p) => file.name.replace(/[^0-9a-z]/gi, '').toLowerCase().endsWith(p.replace(/\//g, ''))) || cands[0] || null;
  S.imp.archive = { name: file.name, N, bytes, cands, path: guess, picked: null };
  computeArchiveDiff();
  renderPanel();
}
function computeArchiveDiff() {
  const A = S.imp.archive;
  if (!A?.path) { if (A) A.diffs = []; return; }
  const RN = rom.parseNarc(rom.readFile(S.rom.bytes, S.rom.R, A.path));
  A.diffs = A.N.members.map((m, i) => (!rom.bytesEqual(m, RN.members[i]) ? { i, magic: rom.magic(m) || 'data', size: m.length } : null)).filter(Boolean);
  A.picked = new Set(A.diffs.map((d) => d.i));
}
function archiveHtml() {
  const A = S.imp.archive;
  if (!A) return '';
  if (!A.cands.length) return `<p class="err">${esc(t('archiveNoMatch'))}</p>`;
  return `<label class="field"><span>${esc(t('archiveMatch'))}</span><select id="arcPath">${A.cands.map((p) => `<option ${p === A.path ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
    <p class="muted" style="margin:0"><b>${A.diffs.length}</b> ${esc(t('archiveDiff'))}</p>
    <div class="diffs">${A.diffs.map((d) => `<label><input type="checkbox" data-i="${d.i}" ${A.picked.has(d.i) ? 'checked' : ''}> #${d.i} <span class="muted">${d.magic} · ${(d.size / 1024).toFixed(1)} KB</span></label>`).join('')}</div>
    <div class="row"><button class="primary" id="arcAdd" ${A.picked.size ? '' : 'disabled'}>${esc(t('addSelected'))} (${A.picked.size})</button>
      <button class="secondary" id="arcWhole" ${A.diffs.length ? '' : 'disabled'}>${esc(t('wholeArchive'))}</button></div>
    <p class="muted small" style="margin:0">${esc(t('wholeHint'))}</p>`;
}
function wireArchive() {
  const A = S.imp.archive;
  if (!A) return;
  if ($('arcPath')) $('arcPath').onchange = (e) => { A.path = e.target.value; computeArchiveDiff(); renderPanel(); };
  for (const c of document.querySelectorAll('.diffs input')) c.onchange = () => { c.checked ? A.picked.add(+c.dataset.i) : A.picked.delete(+c.dataset.i); $('arcAdd').textContent = `${t('addSelected')} (${A.picked.size})`; $('arcAdd').disabled = !A.picked.size; };
  if ($('arcWhole')) $('arcWhole').onclick = async () => {
    S.picks.custom.push({ id: Date.now().toString(36), name: `${A.name} → ${A.path}`, sub: `${t('wholeArchive')} · ${A.diffs.length} ${t('membersCount')} · ${mb(A.bytes.length)}`, writes: [{ path: A.path, member: null, data: A.bytes }] });
    S.imp.archive = null;
    renderPanel(); await refreshChanges();
  };
  if ($('arcAdd')) $('arcAdd').onclick = async () => {
    const writes = [...A.picked].sort((a, b) => a - b).map((i) => ({ path: A.path, member: i, data: A.N.members[i] }));
    S.picks.custom.push({ id: Date.now().toString(36), name: `${A.name} → ${A.path}`, sub: nFiles(writes.length), writes });
    S.imp.archive = null;
    renderPanel(); await refreshChanges();
  };
}


// ---------------------------------------------------------------- A115 #25 hm background (internal test)
// 1x = 就地打补丁（长度不变，沿用已验证逻辑）；2x/4x = 重建 TEX0 + 同步 UV + 材质 TEXIMAGE 宽高。
// 掩膜 poke_line_a 固定整块写成透明（A3I5 全 0x00 = alpha 0），不作为选项。
const A115 = { tpl: null, imgEl: null, natW: 0, natH: 0, mode: 0, colors: 256, scale: 1,
  out: null, used: 0, size: 0, mask: '', tw: 128, th: 64, tplLen: 0 };

async function a115Template() {
  if (!A115.tpl) {
    A115.tpl = new Uint8Array(await (await fetch('tpl_a115_25.nsbmd', { cache: 'no-cache' })).arrayBuffer());
    A115.tplLen = A115.tpl.length;
  }
  return A115.tpl;
}

/** 自动档：按上传图片的原始尺寸判定（>=512×256 → 4×，>=256×128 → 2×，否则 1×） */
function a115AutoScale() {
  if (!A115.natW) return 1;
  const s = Math.floor(Math.min(A115.natW / 128, A115.natH / 64));
  return s >= 4 ? A115_MAX_SCALE : (s >= 2 ? 2 : 1);
}
function a115Scale() { return A115.mode || a115AutoScale(); }

/** 任意尺寸 → 等比 cover 到目标尺寸 → 居中裁切（同 romtool _fit） */
function a115Fit(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const sc = Math.max(w / A115.natW, h / A115.natH);
  const dw = Math.max(1, Math.round(A115.natW * sc)), dh = Math.max(1, Math.round(A115.natH * sc));
  g.drawImage(A115.imgEl, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
  return { width: w, height: h, rgba: g.getImageData(0, 0, w, h).data };
}

function a115Paint(bytes) {
  const cv = $('a115cv');
  if (!cv) return;
  const d = decodeTexture(bytes, 'poke_line');
  const zoom = Math.max(2, Math.floor(1024 / d.width));
  cv.width = d.width * zoom; cv.height = d.height * zoom;
  const tmp = document.createElement('canvas');
  tmp.width = d.width; tmp.height = d.height;
  tmp.getContext('2d').putImageData(new ImageData(d.rgba, d.width, d.height), 0, 0);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < cv.height; y += 8) for (let x = 0; x < cv.width; x += 8) {
    g.fillStyle = ((x / 8 + y / 8) & 1) ? '#2a2f3a' : '#1d222b';
    g.fillRect(x, y, 8, 8);
  }
  g.drawImage(tmp, 0, 0, cv.width, cv.height);
}

function a115Html() {
  const cols = [256, 128, 64].map((n) => `<option value="${n}" ${A115.colors === n ? 'selected' : ''}>${n}</option>`).join('');
  const scales = [[0, t('a115Auto')], [1, '1× · 128×64'], [2, '2× · 256×128'], [A115_MAX_SCALE, '4× · 512×256']]
    .map(([v, lbl]) => `<option value="${v}" ${A115.mode === v ? 'selected' : ''}>${esc(lbl)}</option>`).join('');
  return `<section class="panel a115box">
    <div class="panel-head"><h2>${esc(t('a115Title'))}</h2></div>
    <p class="muted">${esc(t('a115Hint'))}</p>
    <div class="a115-row">
      <button class="secondary small" id="a115Pick">${icon('upload')}${esc(t('a115Pick'))}</button>
      <label class="a115-col"><span>${esc(t('a115Scale'))}</span><select id="a115Scale">${scales}</select></label>
      <label class="a115-col"><span>${esc(t('a115Colors'))}</span><select id="a115Colors"${a115Scale() > 1 ? ' disabled' : ''}>${cols}</select></label>
      <button class="primary small" id="a115Add"${A115.out ? '' : ' disabled'}>${icon('check')}${esc(t('a115Add'))}</button>
    </div>
    <div class="a115-stage"><canvas id="a115cv" width="512" height="256"></canvas></div>
    <div class="a115-meta muted" id="a115meta"></div>
  </section>`;
}

function a115Meta() {
  if (!A115.out) return t('a115Empty');
  return t('a115Meta').replace('{n}', A115.used).replace('{size}', A115.size)
    .replace('{w}', A115.tw).replace('{h}', A115.th).replace('{scale}', A115.scale).replace('{mask}', t('a115Yes'));
}

async function a115Build() {
  const tpl = await a115Template();
  if (!A115.imgEl) { A115.out = null; a115Paint(tpl); return; }
  const n = a115Scale();
  A115.scale = n;
  A115.tw = 128 * n; A115.th = 64 * n;
  const img = a115Fit(A115.tw, A115.th);
  const r = makeA115(tpl, 'poke_line', img, { scale: n, colors: n === 1 ? A115.colors : 256 });
  A115.out = r.out; A115.used = r.usedColors; A115.size = r.out.length;
  a115Paint(r.out);
}

async function a115SetScale() {
  const sel = $('a115Colors');
  if (sel) sel.disabled = a115Scale() > 1;
  if (!A115.imgEl) return;
  await a115Build();
  const meta = $('a115meta');
  if (meta) meta.textContent = a115Meta();
}

async function wireA115(body) {
  const pick = body.querySelector('#a115Pick'), add = body.querySelector('#a115Add');
  const scaleSel = body.querySelector('#a115Scale'), sel = body.querySelector('#a115Colors'), meta = body.querySelector('#a115meta');
  if (!pick) return;
  A115.imgEl ? await a115Build() : a115Paint(await a115Template());
  if (meta) meta.textContent = a115Meta();
  pick.onclick = async () => {
    const [f] = await platform.pickFiles({ accept: 'image/png,image/jpeg,image/webp,image/bmp,image/*' });
    if (!f) return;
    const url = URL.createObjectURL(f);
    try {
      const im = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error(t('a115NotImage')));
        i.src = url;
      });
      A115.imgEl = im; A115.natW = im.naturalWidth; A115.natH = im.naturalHeight;
      await a115Build();
      if (meta) meta.textContent = a115Meta();
      if (add) add.disabled = false;
      toast(t('a115Ready'));
    } catch (e) { toast(e.message || t('a115ReadErr'), 'bad'); }
    finally { URL.revokeObjectURL(url); }
  };
  scaleSel.onchange = async () => {
    A115.mode = +scaleSel.value;
    await a115SetScale();
  };
  sel.onchange = async () => {
    A115.colors = +sel.value;
    if (!A115.imgEl) return;
    await a115Build();
    if (meta) meta.textContent = a115Meta();
  };
  add.onclick = async () => {
    if (!A115.out) return;
    S.picks.custom.push({
      id: 'a115-' + Date.now().toString(36),
      name: t('a115ChangeName') + (A115.scale > 1 ? ' ' + A115.scale + '×' : ''),
      sub: 'a/1/1/5 #25',
      writes: [{ path: 'a/1/1/5', member: 25, data: A115.out }],
    });
    renderPanel(); await refreshChanges();
    toast(t('a115Added'));
  };
}

// ---------------------------------------------------------------- boot
async function boot() {
  applyStatic();
  try {
    libStamp = await (await fetch('../../library/library.json', { cache: 'no-cache' })).text();
    S.lib = JSON.parse(libStamp);
  } catch (e) {
    document.body.innerHTML = `<p style="padding:30px">Could not load the library: ${esc(e.message)}</p>`;
    return;
  }
  S.fps = new Map(Object.entries(S.lib.files));
  $('lang').onchange = (e) => { setLang(e.target.value); applyStatic(); renderRom(); renderPanel(); renderChanges(); };
  $('saveNds').onclick = () => exportRom(false);
  $('saveBps').onclick = () => exportRom(true);
  $('clearAll').onclick = async () => { S.picks = { items: {}, battle: {}, extras: [], custom: [] }; renderPanel(); await refreshChanges(); };
  $('vClose').onclick = closeViewer;
  $('viewerModal').onclick = (e) => { if (e.target === $('viewerModal')) closeViewer(); };
  $('aboutBtn').onclick = () => ($('aboutModal').hidden = false);
  $('aboutClose').onclick = () => ($('aboutModal').hidden = true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('viewerModal').hidden) closeViewer(); $('aboutModal').hidden = true; } });
  // a .nds dropped anywhere opens it
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    const f = [...e.dataTransfer.files].find((x) => /\.nds$/i.test(x.name));
    if (f) openRomFile(f);
  });
  // dev mode: ?dev turns it on (remembered in this browser), ?dev=off turns it off
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('dev')) { if (q.get('dev') === 'off') localStorage.removeItem('rpm-dev'); else localStorage.setItem('rpm-dev', '1'); }
    if (localStorage.getItem('rpm-dev') === '1') {
      const { initDev } = await import('./dev.js');
      S.dev = initDev({ S, esc, icon, toast, renderPanel, refreshChanges, platform, rom, checkModel, mb, dropTarget, readDropped, saveBytes, nFiles, changeTitle: (c) => changeView(c).title, L, setLibrary, thumbFor: thumbHtml, loadFile, openViewer, busy, tick, legalSizes });
      document.body.classList.add('is-dev');
    }
  } catch (e) { console.warn('dev mode', e); }
  renderRom(); renderPanel(); renderChanges();
  // new library items show up without a reload: check every 10 minutes and when the tab comes back
  setInterval(checkLibrary, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkLibrary(); });
  // keep the local launcher (serve.py) alive while this page is open
  if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) { const ping = () => fetch('/__ping', { cache: 'no-store' }).catch(() => {}); ping(); setInterval(ping, 10000); }
  // installable app (Chrome / Edge "Install"), works offline after the first visit
  if ('serviceWorker' in navigator && location.protocol !== 'file:') Promise.resolve().catch(() => {});
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
  window.addEventListener('appinstalled', () => { $('installBtn').hidden = true; installEvt = null; });
  $('installBtn').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; $('installBtn').hidden = true; };
  window.__studio = S; // handy for debugging and automated checks
}
boot();

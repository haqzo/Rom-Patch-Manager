/*
 * Turns what the user picked into a list of ROM writes, and reads back what a ROM
 * currently contains. Pure logic: no DOM.
 *
 * A "change" is one complete visual feature (a Surf model, a whole Fly bundle, one
 * battle scene in some battle types, …). Its writes always travel together.
 */
import * as rom from './rom.js';

/**
 * picks = {
 *   items: { [category]: itemId },                     // one per category
 *   battle: { [slotModelIndex]: { scene, mode } },     // mode 'both' | 'model'
 *   extras: [setId],                                   // set support graphics
 *   custom: [{ id, name, writes:[{path, member, data}] }]
 * }
 * getFile(name) -> Uint8Array (library file)
 * Returns [{ key, kind, label, writes:[{path, member, data}] }]
 */
export function changesFor(picks, lib, getFile) {
  const out = [];
  for (const cat of lib.categories) {
    const id = picks.items[cat.id];
    if (!id) continue;
    const it = lib.items.find((x) => x.id === id);
    if (!it) continue;
    out.push({ key: 'item:' + it.id, kind: 'item', cat: cat.id, item: it, writes: it.writes.map((w) => ({ path: w.path, member: w.member, data: getFile(w.file) })) });
  }
  // battle: group slots that use the same scene + mode into one change
  const groups = new Map();
  for (const [slot, a] of Object.entries(picks.battle)) {
    const k = a.scene + '|' + a.mode;
    if (!groups.has(k)) groups.set(k, { scene: a.scene, mode: a.mode, slots: [] });
    groups.get(k).slots.push(+slot);
  }
  for (const g of groups.values()) {
    const s = lib.battle.scenes.find((x) => x.id === g.scene);
    if (!s) continue;
    const writes = [];
    for (const m of g.slots.sort((a, b) => a - b)) {
      const slot = lib.battle.slots.find((x) => x.model === m);
      writes.push({ path: lib.battle.path, member: m, data: getFile(s.model) });
      if (g.mode === 'both' && s.anim && slot) writes.push({ path: lib.battle.path, member: slot.anim, data: getFile(s.anim) });
    }
    out.push({ key: 'scene:' + g.scene + ':' + g.mode, kind: 'scene', scene: s, mode: g.mode, slots: g.slots, writes });
  }
  for (const setId of picks.extras) {
    const set = lib.battle.sets.find((x) => x.id === setId);
    if (!set || !set.extras.length) continue;
    out.push({ key: 'extras:' + setId, kind: 'extras', set, writes: set.extras.map((w) => ({ path: w.path, member: w.member, data: getFile(w.file) })) });
  }
  for (const c of picks.custom) out.push({ key: 'custom:' + c.id, kind: 'custom', custom: c, writes: c.writes });
  return out;
}

/** Which earlier change gets (partly) replaced by a later one. */
export function overlaps(changes) {
  const owner = new Map();
  const res = new Map(); // key -> Set of keys it overrides
  for (const c of changes) for (const w of c.writes) {
    const k = w.path + '#' + (w.member ?? '*');
    const prev = owner.get(k);
    if (prev && prev !== c.key) { if (!res.has(c.key)) res.set(c.key, new Set()); res.get(c.key).add(prev); }
    owner.set(k, c.key);
  }
  return res;
}

/** Estimated growth of the ROM's archives (bytes), the number Mato's ~10 MB note is about. */
export function sizeGrowth(romBytes, R, changes) {
  const byPath = new Map();
  for (const c of changes) for (const w of c.writes) {
    if (!byPath.has(w.path)) byPath.set(w.path, new Map());
    byPath.get(w.path).set(w.member, w.data.length);
  }
  let grow = 0;
  for (const [path, mems] of byPath) {
    let file;
    try { file = rom.readFile(romBytes, R, path); } catch { continue; }
    const N = rom.parseNarc(file);
    if (!N) { const whole = mems.get(null) ?? mems.get(undefined); if (whole != null) grow += Math.max(0, whole - file.length); continue; }
    let d = 0;
    for (const [m, len] of mems) if (m != null && N.members[m]) d += rom.align(len, 4) - rom.align(N.members[m].length, 4);
    grow += Math.max(0, d);
  }
  return grow;
}

/**
 * What the ROM contains now, per category: library item id, 'original', or 'custom'.
 * fps: Map(fileName -> fingerprint) of library files.
 * originals: { 'a/0/7/5#49': fingerprint, … } of clean data (optional).
 */
export function scanInstalled(romBytes, R, lib, fps) {
  const cache = new Map();
  const memberFp = (path, m) => {
    const k = path + '#' + m;
    if (cache.has(k)) return cache.get(k);
    let v = null;
    try { v = rom.fingerprint(rom.readMember(romBytes, R, path, m)); } catch { v = null; }
    cache.set(k, v);
    return v;
  };
  const result = { items: {}, battle: {} };
  for (const cat of lib.categories) {
    if (cat.pick !== 'one') continue;
    const items = lib.items.filter((x) => x.cat === cat.id);
    let hit = null;
    for (const it of items) if (it.writes.every((w) => memberFp(w.path, w.member) === fps.get(w.file))) { hit = it.id; break; }
    if (!hit) {
      const orig = lib.originals?.[cat.id];
      if (orig) hit = orig.every((o) => memberFp(o.path, o.member) === o.fp) ? 'original' : 'custom';
      else hit = 'unknown';
    }
    result.items[cat.id] = hit;
  }
  for (const s of lib.battle.slots) {
    const f = memberFp(lib.battle.path, s.model);
    const sc = lib.battle.scenes.find((x) => fps.get(x.model) === f);
    const o = lib.originals?.battle?.[s.model];
    result.battle[s.model] = sc ? sc.id : o && o === f ? 'original' : 'custom';
  }
  return result;
}

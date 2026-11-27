// Battle-stage model IDs established by the Black/White lookup audit.
import * as rom from './rom.js';

export const PLATFORM_PATH = 'a/0/1/1';
export const LOOKUP_PATH = 'a/1/5/2';
export const MEMBERS = Object.freeze(Array.from({ length: 34 }, (_, member) => member));
export const GROUPS = Object.freeze([
  [0], [1, 2, 3, 4], [5], [6], [7], [8], [9, 10, 11, 12],
  ...Array.from({ length: 15 }, (_, i) => [13 + i]), [28, 29, 30, 31], [32], [33],
].map(Object.freeze));
export const SLOT = Object.freeze(Object.fromEntries(GROUPS.flatMap((members, group) =>
  members.map((member, variant) => [member, Object.freeze({ group, variant })]))));

export function validMember(member) {
  return Number.isInteger(member) && member >= 0 && member < MEMBERS.length;
}

export function modelHeader(bytes) {
  if (!bytes || bytes.length < 28 || rom.magic(bytes) !== 'BMD0' || rom.u32(bytes, 8) !== bytes.length) return false;
  const sections = rom.u16(bytes, 14);
  const indexEnd = 16 + 4 * sections;
  if (!sections || indexEnd > bytes.length || rom.u16(bytes, 12) !== 16) return false;
  let model = false;
  for (let index = 0; index < sections; index++) {
    const offset = rom.u32(bytes, 16 + 4 * index);
    if (offset < indexEnd || offset + 8 > bytes.length) return false;
    const size = rom.u32(bytes, offset + 4);
    if (size < 8 || offset + size > bytes.length) return false;
    if (rom.ascii(bytes, offset, 4) === 'MDL0') model = true;
  }
  return model;
}

function archive(bytes, R, path) {
  try { return rom.parseNarc(rom.readFile(bytes, R, path))?.members || []; } catch { return []; }
}

export function inspectPlatforms(bytes, R) {
  const supported = R.game?.family === 'bw';
  const models = supported ? archive(bytes, R, PLATFORM_PATH).slice(0, MEMBERS.length) : [];
  const valid = MEMBERS.filter(member => modelHeader(models[member]));
  const tables = supported ? archive(bytes, R, LOOKUP_PATH) : [];
  let groupSafe = false;
  let groupUsed = [];
  if (valid.length === MEMBERS.length && tables.length === 3 &&
      tables.every((table, index) => table.length === [684, 1280, 1700][index])) {
    const [environment, , stage] = tables;
    const used = new Set();
    groupSafe = GROUPS.every((members, group) => {
      const offset = group * 68;
      return rom.u32(stage, offset) === 0 &&
        [0, 1, 2, 3].every(variant => (rom.u32(stage, offset + 4 + variant * 4) | 0) === (members[variant] ?? -1)) &&
        Array.from({ length: 12 }, (_, i) => rom.u32(stage, offset + 20 + i * 4)).every(id => id === 0xffffffff);
    });
    for (let row = 0; row < 19 && groupSafe; row++) {
      const offset = row * 36;
      for (let i = 0; i < 17; i++) {
        const field = environment[offset + 2 + i], group = environment[offset + 19 + i];
        if ((field >= 20 && field !== 255) || group >= GROUPS.length) { groupSafe = false; break; }
        used.add(group);
      }
    }
    if (groupSafe) groupUsed = [...used];
  }
  return { code: R.h.code, revision: bytes[0x1e], models, valid, tables, groupSafe, groupUsed };
}

export function verifiedSource(info, profile) {
  return info?.clean && info.headerOk && info.size === 268435456 && profile?.groupSafe ? profile : null;
}

export function donorCompatible(target, donor) {
  return !!target?.groupSafe && !!donor?.groupSafe && target.code === donor.code
    && target.revision === donor.revision && target.tables.every((table, i) => rom.bytesEqual(table, donor.tables[i]));
}

export function modelFile(model, member, lib) {
  if (!validMember(member) || !model || (model.members && !model.members.includes(member))) return null;
  if (!model.set) return model.file || null;
  return lib.items.find(item => item.id === model.set && item.cat === 'platforms')
    ?.writes.find(write => write.path === PLATFORM_PATH && write.member === member)?.file || null;
}

export function cleanPlatformPicks(values, lib) {
  return Object.fromEntries(Object.entries(values || {}).filter(([key, choice]) => {
    const member = Number(key);
    if (!validMember(member) || String(member) !== key || !choice) return false;
    if (choice.kind === 'keep' || choice.kind === 'stock') return true;
    return choice.kind === 'model' && !!modelFile(lib.platforms?.models.find(model => model.id === choice.id), member, lib);
  }));
}

export function platformAssignments(picks, lib) {
  const set = lib.items.find(item => item.cat === 'platforms' && item.id === picks.items?.platforms);
  const out = new Map();
  for (const w of set?.writes || []) {
    if (w.path !== PLATFORM_PATH || !validMember(w.member) || out.has(w.member) || !w.file)
      throw new Error('Invalid platform set destination');
    out.set(w.member, { kind: 'inherit', file: w.file, set });
  }
  const overrides = picks.platforms || {};
  const clean = cleanPlatformPicks(overrides, lib);
  if (Object.keys(clean).length !== Object.keys(overrides).length) throw new Error('Invalid platform assignment');
  for (const [key, choice] of Object.entries(clean)) {
    const member = Number(key);
    const model = choice.kind === 'model' ? lib.platforms.models.find(model => model.id === choice.id) : null;
    out.set(member, { kind: choice.kind, model, file: modelFile(model, member, lib) });
  }
  return out;
}

export function platformProblems(picks, lib, target, stock) {
  const problems = [];
  for (const [member, a] of platformAssignments(picks, lib)) {
    if (target && !target.valid.includes(member)) problems.push({ member, code: 'bpInvalidTarget' });
    if (a.kind === 'stock' && (!stock || !modelHeader(stock.models[member]))) problems.push({ member, code: 'bpNeedDonor' });
  }
  return problems;
}

export function platformWrites(picks, lib, getFile, { target, stock } = {}) {
  const groups = new Map();
  for (const [member, a] of [...platformAssignments(picks, lib)].sort(([a], [b]) => a - b)) {
    const key = a.kind === 'inherit' ? 'item:' + a.set.id : 'platform:' + (a.model?.id || a.kind);
    if (!groups.has(key)) groups.set(key, { key, kind: a.set ? 'item' : 'platform', cat: 'platforms',
      item: a.set, model: a.model, assignment: a.kind, members: [], writes: [] });
    const group = groups.get(key);
    group.members.push(member);
    const bytes = a.file ? getFile(a.file) : a.kind === 'stock' ? stock?.models[member] : null;
    if (bytes && !modelHeader(bytes)) throw new Error(`Invalid platform model for #${member}`);
    if (bytes && (!target || (target.valid.includes(member) && !rom.bytesEqual(target.models[member], bytes))))
      group.writes.push({ path: PLATFORM_PATH, member, data: bytes });
  }
  return [...groups.values()];
}

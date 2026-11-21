/*
 * Asset Viewer data model: turn opened files into a list of entries (NARC
 * members included), identify each one, and find animations related to a model.
 * Read-only: entries are views into the bytes that were opened.
 */
import { parseNarc } from '../narc.js';
import { parseBca0, type Bca0 } from './bca0.js';
import type { Bmd0Model } from './bmd0.js';
import { checkAnimation, type AnimationCheck } from './pose.js';
import { AUTHOR_ANIMATION_PAIRS, archiveFromName } from './references.js';
import { nitroSections, sniffNitro, type Sniffed } from './sniff.js';
import { NitroError, Reader } from './reader.js';
import { choosePalette, decodeTexture, parseTex0, type DecodedTexture, type Tex0, type TextureMode } from './tex0.js';

export interface AssetEntry {
  /** Stable id within one opened source. */
  key: string;
  /** File name, or the containing file's name for NARC members. */
  name: string;
  /** Folder of the file relative to what was opened ('' at the top). */
  folder: string;
  /** Archive path (a/x/y/z) when known from the ROM or the file name. */
  archive: string | null;
  /** Member index inside a NARC, null for whole files. */
  member: number | null;
  /** key of the NARC entry this member belongs to. */
  parent: string | null;
  bytes: Uint8Array;
  sniff: Sniffed;
}

export const ENTRY_LIMITS = { members: 5000 };

export interface OpenedFile {
  name: string;
  relPath: string;
  bytes: Uint8Array;
}

/** Files plus the members of any NARC among them (one level, members of members are listed as files). */
export function expandEntries(files: OpenedFile[], romArchive: string | null = null): AssetEntry[] {
  const out: AssetEntry[] = [];
  let budget = ENTRY_LIMITS.members;
  files.forEach((f, fi) => {
    const rel = f.relPath.replace(/\\/g, '/');
    const folder = rel.includes('/') && !romArchive ? rel.slice(0, rel.lastIndexOf('/')) : '';
    const archive = romArchive ?? archiveFromName(rel);
    const key = `f${fi}`;
    const sniff = sniffNitro(f.bytes);
    out.push({ key, name: f.name, folder, archive, member: null, parent: null, bytes: f.bytes, sniff });
    if (sniff.kind !== 'NARC') return;
    const narc = parseNarc(f.bytes);
    if (!narc) return;
    narc.members.forEach((m, mi) => {
      if (budget-- <= 0) return;
      out.push({ key: `${key}#${mi}`, name: f.name, folder, archive, member: mi, parent: key, bytes: m, sniff: sniffNitro(m) });
    });
  });
  return out;
}

export interface RelatedAnimation {
  key: string;
  /** Why it is considered related (strongest first). */
  reason: 'authorPair' | 'sameName' | 'sameArchive' | 'sameFolder';
  /** Index of the animation inside the BCA0 file. */
  index: number;
  name: string;
  frames: number;
  check: AnimationCheck;
}

const RANK: Record<RelatedAnimation['reason'], number> = { authorPair: 0, sameName: 1, sameArchive: 2, sameFolder: 3 };
const stem = (n: string) => n.replace(/\.[^.]*$/, '').toLowerCase();

/**
 * BCA0 files that may animate this model. A candidate is listed only when its
 * object count matches the model's (or MaToRiuKo documents the pair); whether
 * it can be played is decided separately by checkAnimation().
 */
export function findRelatedAnimations(model: Bmd0Model, entry: AssetEntry, all: AssetEntry[], parsed: (e: AssetEntry) => Bca0 | null = safeBca0): RelatedAnimation[] {
  const out: RelatedAnimation[] = [];
  for (const e of all) {
    if (e.key === entry.key || e.sniff.kind !== 'BCA0') continue;
    let reason: RelatedAnimation['reason'] | null = null;
    const author = entry.archive && entry.member !== null && e.archive === entry.archive && e.member !== null
      && AUTHOR_ANIMATION_PAIRS.some((p) => p.archive === entry.archive && p.model === entry.member && p.anim === e.member);
    if (author) reason = 'authorPair';
    else if (entry.member === null && e.member === null && e.folder === entry.folder && stem(e.name) === stem(entry.name)) reason = 'sameName';
    else if (entry.parent && e.parent === entry.parent) reason = 'sameArchive';
    else if (entry.member === null && e.member === null && e.folder === entry.folder) reason = 'sameFolder';
    if (!reason) continue;
    const bca = parsed(e);
    if (!bca) continue;
    bca.animations.forEach((a, index) => {
      if (reason !== 'authorPair' && a.objects.length !== model.objects.length) return;
      out.push({ key: e.key, reason: reason!, index, name: a.name, frames: a.frames, check: checkAnimation(model, a) });
    });
  }
  return out.sort((a, b) => RANK[a.reason] - RANK[b.reason] || Number(b.check.playable) - Number(a.check.playable));
}

function safeBca0(e: AssetEntry): Bca0 | null {
  try {
    return parseBca0(e.bytes);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- textures

export interface TexturePreview {
  texture: string;
  palette: string | null;
  /** How the palette was chosen: 'guess' is shown as a guess. */
  paletteHow: 'table' | 'name' | 'guess' | null;
  format: number;
  decoded: DecodedTexture;
}

/** Textures of a TEX0 block (BMD0 or BTX0), each with the palette the viewer would use. */
export function previewTextures(bytes: Uint8Array, tex0: Tex0, mode: TextureMode, bindings: Map<string, string | null> = new Map()): TexturePreview[] {
  const r = new Reader(bytes);
  return tex0.textures.map((t) => {
    const { pal, how } = t.format === 7 ? { pal: null, how: null } : choosePalette(tex0.palettes, t.name, bindings.get(t.name) ?? null);
    return { texture: t.name, palette: pal?.name ?? null, paletteHow: how, format: t.format, decoded: decodeTexture(r, tex0, t, pal, mode) };
  });
}

/** Texture → palette bindings written in a model's material table. */
export function materialBindings(models: Bmd0Model[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const md of models) for (const mat of md.materials) if (mat.texture && mat.paletteFrom === 'table' && !m.has(mat.texture)) m.set(mat.texture, mat.palette);
  return m;
}

/** TEX0 block of a BTX0 texture file. */
export function parseBtx0(bytes: Uint8Array): Tex0 {
  const r = new Reader(bytes);
  if (r.ascii(0, 4) !== 'BTX0') throw new NitroError('BAD_MAGIC', 'Not a BTX0 file.');
  const off = nitroSections(bytes).find((s) => s.magic === 'TEX0')?.offset;
  if (off === undefined) throw new NitroError('BAD_STRUCTURE', 'No TEX0 block.');
  return parseTex0(r, off);
}

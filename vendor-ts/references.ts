/*
 * What MaToRiuKo's documentation says about specific archive members.
 * Evidence level is always 'author': it comes from his notes and romtool presets,
 * not from this app's own in-game testing. The viewer must show it that way.
 */

/** Verification levels from MaToRiuKo's resource notes (lowest to highest). */
export type EvidenceLevel = 'author' | 'signature' | 'rendered' | 'inGame';

export interface AuthorReference {
  /** Archive path inside the ROM, e.g. "a/0/7/5". */
  archive: string;
  member: number;
  /** Short role id (translated in the interface). */
  role: 'surfModel' | 'flyOutModel' | 'flyInModel' | 'flyOutAnim' | 'flyInAnim' | 'battleBgModel' | 'battleBgAnim';
  /** Internal resource name from his notes, when known (never translated). */
  resourceName?: string;
  /** Textures his notes list for it. */
  textures?: string[];
}

/** A075 #49 is the first priority of this milestone. */
export const SURF_MODEL = { archive: 'a/0/7/5', member: 49 } as const;

const A011_PAIRS: [number, number][] = [
  [34, 35], [36, 40], [37, 41], [38, 42], [39, 43], [44, 45], [46, 50], [47, 51], [48, 52], [49, 53], [54, 55], [56, 57],
  [58, 59], [60, 61], [62, 63], [64, 65], [66, 67], [68, 69], [70, 71], [72, 73], [74, 75], [76, 77],
];

/** Model → animation pairs his notes document (A115 Fly, A011 battle backgrounds). */
export const AUTHOR_ANIMATION_PAIRS: { archive: string; model: number; anim: number }[] = [
  ...A011_PAIRS.map(([model, anim]) => ({ archive: 'a/0/1/1', model, anim })),
  { archive: 'a/1/1/5', model: 58, anim: 60 },
  { archive: 'a/1/1/5', model: 103, anim: 104 },
  { archive: 'a/1/1/5', model: 107, anim: 108 },
  { archive: 'a/1/1/5', model: 66, anim: 67 },
  { archive: 'a/1/1/5', model: 111, anim: 112 },
];

export const AUTHOR_REFERENCES: AuthorReference[] = [
  { archive: 'a/0/7/5', member: 49, role: 'surfModel', resourceName: 'sea_ride', textures: ['hero_ride1', 'hero_ride2'] },
  ...[58, 103, 107].map((m) => ({ archive: 'a/1/1/5', member: m, role: 'flyOutModel' as const })),
  ...[66, 111].map((m) => ({ archive: 'a/1/1/5', member: m, role: 'flyInModel' as const })),
  ...[60, 104, 108].map((m) => ({ archive: 'a/1/1/5', member: m, role: 'flyOutAnim' as const })),
  ...[67, 112].map((m) => ({ archive: 'a/1/1/5', member: m, role: 'flyInAnim' as const })),
  ...A011_PAIRS.flatMap(([model, anim]) => [
    { archive: 'a/0/1/1', member: model, role: 'battleBgModel' as const },
    { archive: 'a/0/1/1', member: anim, role: 'battleBgAnim' as const },
  ]),
];

export function authorReference(archive: string | null, member: number | null): AuthorReference | null {
  if (!archive || member === null) return null;
  return AUTHOR_REFERENCES.find((r) => r.archive === archive && r.member === member) ?? null;
}

/**
 * Archive path from a file name such as "a075", "a075.narc" or "a/0/7/5"
 * (MaToRiuKo's files are named that way). Null when the name says nothing.
 */
export function archiveFromName(name: string): string | null {
  const base = name.replace(/\\/g, '/');
  const m = /(?:^|\/)a\/?([0-9])\/?([0-9])\/?([0-9])(?:\.narc)?$/i.exec(base);
  return m ? `a/${m[1]}/${m[2]}/${m[3]}` : null;
}

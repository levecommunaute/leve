import { randomBytes } from "crypto";

/** Sans caractères ambigus (O/0, I/1). */
export const VIDEO_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomFragment(): string {
  const bytes = randomBytes(8);
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += VIDEO_CODE_ALPHABET[bytes[i]! % VIDEO_CODE_ALPHABET.length]!;
  }
  return s;
}

/** Trois fragments distincts au format XXXX-YYYY-ZZZZ. */
export function randomFullVideoCode(): string {
  const set = new Set<string>();
  while (set.size < 3) {
    set.add(randomFragment());
  }
  return [...set].join("-");
}

/**
 * Accepte une saisie avec ou sans tirets ; vérifie 3×4 caractères valides.
 * Retourne le code normalisé XXXX-YYYY-ZZZZ ou null.
 */
export function normalizeAdminVideoCode(raw: string): string | null {
  const compact = raw.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
  if (compact.length !== 12) return null;
  const a = compact.slice(0, 4);
  const b = compact.slice(4, 8);
  const c = compact.slice(8, 12);
  for (const part of [a, b, c]) {
    for (const ch of part) {
      if (!VIDEO_CODE_ALPHABET.includes(ch)) return null;
    }
  }
  return `${a}-${b}-${c}`;
}

export function spreadTimestamps(maxSeconds: number): number[] {
  const cap = Math.max(120, Math.min(maxSeconds - 30, 7200));
  const lo = 30;
  const hi = Math.max(lo + 90, cap);
  const bytes = randomBytes(12);
  const picks: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = lo + ((bytes[i * 4]! << 16) | (bytes[i * 4 + 1]! << 8) | bytes[i * 4 + 2]!) % (hi - lo);
    picks.push(Math.floor(t));
  }
  picks.sort((a, b) => a - b);
  let n0 = picks[0] ?? lo;
  let n1 = picks[1] ?? n0 + 20;
  let n2 = picks[2] ?? n1 + 20;
  if (n0 === n1) n1 += 17;
  if (n1 === n2) n2 += 23;
  return [n0, n1, n2].map((n) => Math.min(n, hi));
}

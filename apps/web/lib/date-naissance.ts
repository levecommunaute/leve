/** Date de naissance JJ/MM/AAAA ↔ ISO YYYY-MM-DD + règles d'âge LEVE. */

export type AgeBracket = "under12" | "12to16" | "16to18" | "adult";

export type AgeMessageTone = "error" | "warn" | "info" | "ok";

export type AgeMessage = {
  tone: AgeMessageTone;
  text: string;
};

const MSG_UNDER_12 =
  "Vous devez avoir au moins 12 ans pour rejoindre LEVE.";
const MSG_12_TO_16 =
  "Vous avez moins de 16 ans. Un tuteur légal devra approuver les retraits en votre nom.";
const MSG_16_TO_18 =
  "Vous avez moins de 18 ans. Un tuteur légal devra approuver les retraits en votre nom.";
const MSG_ADULT = "✅ Âge vérifié — retrait direct autorisé.";
const MSG_RETRAIT_TUTEUR =
  "Retrait nécessite approbation d'un tuteur légal · Contactez l'admin";

/** Parse JJ/MM/AAAA (ou JJMMAAAA partiel non accepté) → ISO si date calendaire réelle. */
export function parseJjMmAaaa(
  input: string,
): { iso: string; day: number; month: number; year: number } | null {
  const trimmed = input.trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!isRealCalendarDate(year, month, day)) return null;
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { iso, day, month, year };
}

/** Valide une date ISO YYYY-MM-DD (calendaire réelle). */
export function parseIsoDate(
  input: string,
): { iso: string; day: number; month: number; year: number } | null {
  const trimmed = input.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!isRealCalendarDate(year, month, day)) return null;
  return { iso: trimmed, day, month, year };
}

export function formatIsoToJjMmAaaa(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return "";
  return `${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}/${String(parsed.year).padStart(4, "0")}`;
}

export function isRealCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/** Âge en années révolues (fuseau local du navigateur / serveur). */
export function ageFromBirthDate(
  year: number,
  month: number,
  day: number,
  now: Date = new Date(),
): number {
  let age = now.getFullYear() - year;
  const monthDiff = now.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < day)) {
    age -= 1;
  }
  return age;
}

export function ageFromIso(
  iso: string,
  now: Date = new Date(),
): number | null {
  const parsed = parseIsoDate(iso);
  if (!parsed) return null;
  return ageFromBirthDate(parsed.year, parsed.month, parsed.day, now);
}

export function ageBracketFromAge(age: number): AgeBracket {
  if (age < 12) return "under12";
  if (age < 16) return "12to16";
  if (age < 18) return "16to18";
  return "adult";
}

export function ageBracketFromIso(
  iso: string,
  now: Date = new Date(),
): AgeBracket | null {
  const age = ageFromIso(iso, now);
  if (age == null || age < 0) return null;
  return ageBracketFromAge(age);
}

/** Messages affichés sous le champ date (onglet Identité). */
export function profilAgeMessage(bracket: AgeBracket): AgeMessage {
  switch (bracket) {
    case "under12":
      return { tone: "error", text: MSG_UNDER_12 };
    case "12to16":
      return { tone: "warn", text: MSG_12_TO_16 };
    case "16to18":
      return { tone: "info", text: MSG_16_TO_18 };
    case "adult":
      return { tone: "ok", text: MSG_ADULT };
  }
}

/**
 * Contrôle retrait banque :
 * - under12 → bloqué
 * - 12–18 → message tuteur (pas de flux normal)
 * - adult → OK
 */
export function retraitAgeGate(bracket: AgeBracket): {
  allowNormal: boolean;
  message: string | null;
} {
  if (bracket === "under12") {
    return { allowNormal: false, message: MSG_UNDER_12 };
  }
  if (bracket === "12to16" || bracket === "16to18") {
    return { allowNormal: false, message: MSG_RETRAIT_TUTEUR };
  }
  return { allowNormal: true, message: null };
}

/** Filtre la saisie clavier vers un motif JJ/MM/AAAA (chiffres + /). */
export function maskJjMmAaaaInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

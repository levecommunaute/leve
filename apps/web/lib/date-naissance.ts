/** Date de naissance JJ/MM/AAAA ↔ ISO YYYY-MM-DD + règles d'âge LEVE. */

export type AgeBracket = "under12" | "12to16" | "16to18" | "adult";

export type AgeMessageTone = "error" | "warn" | "info" | "ok";

export type AgeMessage = {
  tone: AgeMessageTone;
  text: string;
};

/** État du champ date à la saisie (masque + validation temps réel). */
export type DateNaissanceFieldStatus =
  | "empty"
  | "incomplete"
  | "invalid"
  | "valid";

export type DateNaissanceAssessment = {
  status: DateNaissanceFieldStatus;
  error: string | null;
  iso: string | null;
  day: number | null;
  month: number | null;
  year: number | null;
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

const MONTH_FR = [
  "",
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Nombre de jours dans le mois. Si année inconnue, février = 29. */
export function daysInMonth(month: number, year: number | null): number {
  if (month === 2) {
    if (year == null) return 29;
    return isLeapYear(year) ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

function dayRangeError(month: number, maxDay: number): string {
  const name = MONTH_FR[month] ?? "ce mois";
  return `Le jour doit être entre 01 et ${String(maxDay).padStart(2, "0")} pour ${name}`;
}

/**
 * Masque automatique : chiffres seulement, `/` insérés.
 * "30" → "30/" · "3012" → "30/12/" · "30122024" → "30/12/2024"
 */
export function maskJjMmAaaaInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length === 0) return "";
  if (digits.length < 2) return digits;
  if (digits.length === 2) return `${digits}/`;
  if (digits.length < 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  if (digits.length === 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * Validation temps réel (partielle ou complète) avec messages précis.
 * Ne considère `valid` que pour une date JJ/MM/AAAA complète et réelle.
 */
export function assessJjMmAaaaInput(
  input: string,
  now: Date = new Date(),
): DateNaissanceAssessment {
  const empty: DateNaissanceAssessment = {
    status: "empty",
    error: null,
    iso: null,
    day: null,
    month: null,
    year: null,
  };

  const digits = input.replace(/\D/g, "").slice(0, 8);
  if (digits.length === 0) return empty;

  const currentYear = now.getFullYear();
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  if (digits.length >= 2) {
    day = Number(digits.slice(0, 2));
    if (day < 1 || day > 31) {
      return {
        status: "invalid",
        error: "Le jour doit être entre 01 et 31",
        iso: null,
        day,
        month: null,
        year: null,
      };
    }
  }

  if (digits.length >= 4) {
    month = Number(digits.slice(2, 4));
    if (month < 1 || month > 12) {
      return {
        status: "invalid",
        error: "Le mois doit être entre 01 et 12",
        iso: null,
        day,
        month,
        year: null,
      };
    }
    const maxWithoutYear = daysInMonth(month, null);
    if (day != null && day > maxWithoutYear) {
      return {
        status: "invalid",
        error: dayRangeError(month, maxWithoutYear),
        iso: null,
        day,
        month,
        year: null,
      };
    }
  }

  if (digits.length > 4 && digits.length < 8) {
    // Année partielle : pas d'erreur tant que le préfixe reste plausible
    const yearPrefix = Number(digits.slice(4));
    const yearDigits = digits.slice(4);
    // Ex. "3" ok · "9" ok · "202" ok · dès que le préfixe ne peut plus donner 1900–currentYear
    const minPossible = Number(yearDigits.padEnd(4, "0"));
    const maxPossible = Number(yearDigits.padEnd(4, "9"));
    if (maxPossible < 1900 || minPossible > currentYear) {
      return {
        status: "invalid",
        error: `L'année doit être entre 1900 et ${currentYear}`,
        iso: null,
        day,
        month,
        year: null,
      };
    }
    return {
      status: "incomplete",
      error: null,
      iso: null,
      day,
      month,
      year: yearPrefix,
    };
  }

  if (digits.length < 8) {
    return {
      status: "incomplete",
      error: null,
      iso: null,
      day,
      month,
      year: null,
    };
  }

  year = Number(digits.slice(4, 8));
  if (year < 1900 || year > currentYear) {
    return {
      status: "invalid",
      error: `L'année doit être entre 1900 et ${currentYear}`,
      iso: null,
      day,
      month,
      year,
    };
  }

  // day et month sont définis ici (8 chiffres)
  const d = day as number;
  const m = month as number;
  const maxDay = daysInMonth(m, year);
  if (d > maxDay) {
    return {
      status: "invalid",
      error: dayRangeError(m, maxDay),
      iso: null,
      day: d,
      month: m,
      year,
    };
  }

  // Pas de date future
  const candidate = new Date(year, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (candidate.getTime() > today.getTime()) {
    return {
      status: "invalid",
      error: "La date ne peut pas être dans le futur",
      iso: null,
      day: d,
      month: m,
      year,
    };
  }

  if (!isRealCalendarDate(year, m, d)) {
    return {
      status: "invalid",
      error: dayRangeError(m, maxDay),
      iso: null,
      day: d,
      month: m,
      year,
    };
  }

  const iso = `${String(year).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return {
    status: "valid",
    error: null,
    iso,
    day: d,
    month: m,
    year,
  };
}

/** Parse JJ/MM/AAAA → ISO si date calendaire réelle (non future). */
export function parseJjMmAaaa(
  input: string,
  now: Date = new Date(),
): { iso: string; day: number; month: number; year: number } | null {
  const assessed = assessJjMmAaaaInput(input, now);
  if (assessed.status !== "valid" || !assessed.iso) return null;
  return {
    iso: assessed.iso,
    day: assessed.day as number,
    month: assessed.month as number,
    year: assessed.year as number,
  };
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
  if (day < 1 || day > daysInMonth(month, year)) return false;
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

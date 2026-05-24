/** Extraction pays depuis auth.users (raw_user_meta_data) ou heuristique courriel. */

const ISO_TO_LABEL: Record<string, string> = {
  CA: "Canada",
  US: "États-Unis",
  FR: "France",
  BE: "Belgique",
  CH: "Suisse",
  LU: "Luxembourg",
  MA: "Maroc",
  SN: "Sénégal",
  CI: "Côte d'Ivoire",
  HT: "Haïti",
  GP: "Guadeloupe",
  MQ: "Martinique",
  RE: "La Réunion",
  GB: "Royaume-Uni",
  DE: "Allemagne",
  ES: "Espagne",
  IT: "Italie",
  PT: "Portugal",
  BR: "Brésil",
  MX: "Mexique",
  AU: "Australie",
  NZ: "Nouvelle-Zélande",
};

const TLD_TO_COUNTRY: Record<string, string> = {
  ca: "Canada",
  fr: "France",
  be: "Belgique",
  ch: "Suisse",
  lu: "Luxembourg",
  ma: "Maroc",
  sn: "Sénégal",
  ci: "Côte d'Ivoire",
  ht: "Haïti",
  uk: "Royaume-Uni",
  de: "Allemagne",
  es: "Espagne",
  it: "Italie",
  pt: "Portugal",
  br: "Brésil",
  mx: "Mexique",
  au: "Australie",
  nz: "Nouvelle-Zélande",
};

function normalizeCountryLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return "Inconnu";
  const upper = t.toUpperCase();
  if (ISO_TO_LABEL[upper]) return ISO_TO_LABEL[upper];
  if (t.length === 2 && ISO_TO_LABEL[upper]) return ISO_TO_LABEL[upper];
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function countryFromMeta(meta: Record<string, unknown>): string | null {
  const directKeys = ["country", "pays", "country_name", "countryName", "location"];
  for (const key of directKeys) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return normalizeCountryLabel(v);
  }
  for (const key of ["country_code", "countryCode", "pays_code"]) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) {
      const code = v.trim().toUpperCase();
      return ISO_TO_LABEL[code] ?? normalizeCountryLabel(v);
    }
  }
  const locale =
    (typeof meta.locale === "string" && meta.locale) ||
    (typeof meta.language === "string" && meta.language) ||
    null;
  if (locale) {
    const parts = locale.replace("_", "-").split("-");
    if (parts.length >= 2) {
      const region = parts[parts.length - 1]!.toUpperCase();
      if (ISO_TO_LABEL[region]) return ISO_TO_LABEL[region];
    }
  }
  return null;
}

function countryFromEmail(email: string | undefined): string | null {
  if (!email?.includes("@")) return null;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!domain) return null;
  const parts = domain.split(".");
  if (parts.length >= 3 && parts[parts.length - 2] === "qc" && parts[parts.length - 1] === "ca") {
    return "Canada";
  }
  const tld = parts[parts.length - 1] ?? "";
  if (TLD_TO_COUNTRY[tld]) return TLD_TO_COUNTRY[tld];
  if (tld === "com" || tld === "net" || tld === "org" || tld === "io" || tld === "test") {
    return null;
  }
  return null;
}

export function resolveMemberCountry(
  email: string | undefined,
  meta: Record<string, unknown> | undefined,
): { country: string; source: "meta" | "email" | "unknown" } {
  const fromMeta = countryFromMeta(meta ?? {});
  if (fromMeta) return { country: fromMeta, source: "meta" };
  const fromEmail = countryFromEmail(email);
  if (fromEmail) return { country: fromEmail, source: "email" };
  return { country: "Inconnu", source: "unknown" };
}

export const ADMIN_BYPASS_EMAIL = "levecommunaute@gmail.com";

export type AbonnementStatut = "actif" | "grace" | "expire";

export type ProfileAbonnement = {
  id: string;
  email: string | null;
  display_name: string | null;
  abonnement_verifie_at: string | null;
  abonnement_expire_at: string | null;
  abonnement_statut: AbonnementStatut | string | null;
  grace_debut_at: string | null;
  grace_expire_at: string | null;
};

export const ABONNEMENT_SELECT =
  "id,email,display_name,abonnement_verifie_at,abonnement_expire_at,abonnement_statut,grace_debut_at,grace_expire_at";

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isSubscriptionValid(expireAt: string | null | undefined): boolean {
  if (!expireAt) return false;
  return new Date(expireAt).getTime() > Date.now();
}

export function profileHasMembership(profile: ProfileAbonnement | null): boolean {
  return profile?.abonnement_verifie_at != null;
}

export function buildActiveSubscriptionPatch(now = new Date()) {
  const verified = now.toISOString();
  const expire = addMonths(now, 3).toISOString();
  return {
    abonnement_verifie_at: verified,
    abonnement_expire_at: expire,
    abonnement_statut: "actif" as const,
    grace_debut_at: null,
    grace_expire_at: null,
  };
}

export function buildRenewSubscriptionPatch(now = new Date()) {
  const expire = addMonths(now, 3).toISOString();
  return {
    abonnement_expire_at: expire,
    abonnement_statut: "actif" as const,
    grace_debut_at: null,
    grace_expire_at: null,
  };
}

export function buildGraceSubscriptionPatch(now = new Date()) {
  return {
    abonnement_statut: "grace" as const,
    grace_debut_at: now.toISOString(),
    grace_expire_at: addDays(now, 30).toISOString(),
  };
}

/** Routes bloquées pendant la période de grâce. */
export const GRACE_BLOCKED_HREFS = [
  "/banque",
  "/concours",
  "/transparence",
] as const;

export function isGraceBlockedHref(href: string): boolean {
  if (GRACE_BLOCKED_HREFS.includes(href as (typeof GRACE_BLOCKED_HREFS)[number])) {
    return true;
  }
  return /\/quiz\/?$/.test(href) || href.includes("/quiz");
}

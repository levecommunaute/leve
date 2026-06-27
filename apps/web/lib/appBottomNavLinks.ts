import { isCollaborateurMemberType } from "./pcol";

export type AppBottomNavLink = { href: string; label: string };

/** Liens de la barre fixe en bas — même ordre sur toutes les pages membres. */
export const APP_BOTTOM_NAV_LINKS: AppBottomNavLink[] = [
  { href: "/", label: "Accueil" },
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/videos", label: "Vidéos" },
  { href: "/banque", label: "Banque LEVE" },
  { href: "/pool-pa", label: "Pool PA" },
  { href: "/classement", label: "Classement" },
  { href: "/concours", label: "Concours" },
  { href: "/transparence", label: "Transparence" },
  { href: "/profil", label: "Profil" },
];

/** Liens visibles directement dans la barre mobile. */
export const APP_BOTTOM_NAV_PRIMARY_HREFS: readonly string[] = [
  "/",
  "/dashboard",
  "/videos",
  "/banque",
  "/classement",
];

/** Emojis affichés devant chaque lien (barre basse mobile). */
export const APP_BOTTOM_NAV_ICONS: Record<string, string> = {
  "/": "🏠",
  "/dashboard": "📊",
  "/videos": "🎬",
  "/banque": "🏦",
  "/pool-pa": "💧",
  "/classement": "🏆",
  "/concours": "🎯",
  "/transparence": "🔍",
  "/profil": "👤",
  "/collaborateur": "🤝",
};

/** Libellés courts pour la barre mobile. */
export const APP_BOTTOM_NAV_SHORT_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/banque": "Banque",
};

export function getAppBottomNavIcon(href: string): string {
  return APP_BOTTOM_NAV_ICONS[href] ?? "•";
}

export function getAppBottomNavShortLabel(link: AppBottomNavLink): string {
  return APP_BOTTOM_NAV_SHORT_LABELS[link.href] ?? link.label;
}

export function splitAppBottomNavLinks(links: AppBottomNavLink[]): {
  primary: AppBottomNavLink[];
  secondary: AppBottomNavLink[];
} {
  const primarySet = new Set<string>(APP_BOTTOM_NAV_PRIMARY_HREFS);
  const primary: AppBottomNavLink[] = [];
  for (const href of APP_BOTTOM_NAV_PRIMARY_HREFS) {
    const link = links.find((l) => l.href === href);
    if (link) primary.push(link);
  }
  const secondary = links.filter((l) => !primarySet.has(l.href));
  return { primary, secondary };
}

const COLLABORATEUR_NAV: AppBottomNavLink = {
  href: "/collaborateur",
  label: "Collaborateur",
};

/** Ajoute /collaborateur avant Profil pour les membres collaborateur. */
export function getAppBottomNavLinks(memberType?: string | null): AppBottomNavLink[] {
  if (!isCollaborateurMemberType(memberType)) {
    return APP_BOTTOM_NAV_LINKS;
  }
  const links = [...APP_BOTTOM_NAV_LINKS];
  const profilIdx = links.findIndex((l) => l.href === "/profil");
  const insertAt = profilIdx >= 0 ? profilIdx : links.length;
  links.splice(insertAt, 0, COLLABORATEUR_NAV);
  return links;
}

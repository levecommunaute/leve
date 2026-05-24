import { isCollaborateurMemberType } from "./pcol";

export type AppBottomNavLink = { href: string; label: string };

/** Liens de la barre fixe en bas — même ordre sur toutes les pages membres. */
export const APP_BOTTOM_NAV_LINKS: AppBottomNavLink[] = [
  { href: "/", label: "Accueil" },
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/videos", label: "Vidéos" },
  { href: "/banque", label: "Banque LEVE" },
  { href: "/classement", label: "Classement" },
  { href: "/concours", label: "Concours" },
  { href: "/transparence", label: "Transparence" },
  { href: "/profil", label: "Profil" },
];

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

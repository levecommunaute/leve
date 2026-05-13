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

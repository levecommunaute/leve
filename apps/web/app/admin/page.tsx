"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type JSX,
  type MouseEvent,
} from "react";

const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
});

const BG = "#080808";
const TEXT = "#F5F0E8";
const ROUGE = "#C0392B";
const GOLD = "#D4A017";
const VERT = "#2ECC71";
const BLEU = "#5DADE2";
const VIOLET = "#9B59B6";
const G2 = "#141414";
const G3 = "#1A1A1A";
const GLOBAL_STATS_REFRESH_MS = 60_000;

const STORAGE_KEY = "leve_admin_secret";

type VideoRow = {
  id: string;
  youtube_id: string;
  title: string | null;
  points_value: number | null;
  collaborateur_id: string | null;
};

type MemberRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  member_type: string | null;
  multiplier: number | string | null;
  /** Colonne Supabase en entier ; l’API peut renvoyer un nombre ou une chaîne selon le driver. */
  numero_membre: string | number | null;
  categorie: string | null;
  icone: string | null;
};

type BetaTesterRow = {
  id: string;
  numero_membre: string | number | null;
  display_name: string | null;
  email: string | null;
  beta_points: number | string | null;
  beta_temps_total_secondes: number | string | null;
  beta_derniere_activite: string | null;
};

type BetaEmailRow = {
  id: string;
  email: string;
  nom_testeur: string | null;
  actif: boolean;
  created_at: string | null;
};

type BetaBugSeverite = "P1" | "P2" | "P3";
type BetaBugStatut = "ouvert" | "en_cours" | "resolu" | "ferme";

type BetaBugRow = {
  id: string;
  membre_id: string | null;
  page: string;
  description: string;
  severite: BetaBugSeverite | string;
  statut: BetaBugStatut | string;
  created_at: string | null;
};

type QuizQuestionRow = {
  id: string;
  video_id: string;
  question: string;
  choix: string[] | null;
  bonne_reponse: string | null;
};

type FeatureFlagRow = {
  id: string;
  nom: string;
  actif: boolean;
  description: string | null;
  updated_at: string;
};

type FraisPlateformePalierRow = {
  id: string;
  palier_nom: string;
  palier_min: number;
  palier_max: number | null;
  pourcentage: number;
  actif: boolean;
  ordre: number;
};

type FraisPalierDraft = {
  palier_min: string;
  palier_max: string;
  pourcentage: string;
  actif: boolean;
};

const FRAIS_PLATEFORME_FLAG_NOM = "frais-plateforme";

function palierToDraft(p: FraisPlateformePalierRow): FraisPalierDraft {
  return {
    palier_min: String(p.palier_min),
    palier_max: p.palier_max == null ? "" : String(p.palier_max),
    pourcentage: String(p.pourcentage),
    actif: p.actif,
  };
}

function fraisPalierDraftDirty(p: FraisPlateformePalierRow, d: FraisPalierDraft): boolean {
  return (
    String(p.palier_min) !== d.palier_min.trim() ||
    (p.palier_max == null ? d.palier_max.trim() !== "" : String(p.palier_max) !== d.palier_max.trim()) ||
    String(p.pourcentage) !== d.pourcentage.trim() ||
    p.actif !== d.actif
  );
}

type CountryCount = {
  country: string;
  count: number;
};

type PoolMonthPoint = {
  month: string;
  pmq_balance: number;
  production_balance: number;
  fondation_balance: number;
  operations_balance: number;
  ptc_balance: number;
  pcol_balance: number;
  total_revenue: number;
};

type PoolCurrent = {
  pmq_balance: number;
  production_balance: number;
  fondation_balance: number;
  operations_balance: number;
  ptc_balance: number;
  pcol_balance: number;
  pa_balance: number;
  frais_plateforme_balance: number;
  taxe_pa_balance: number;
  total_revenue: number;
};

type GlobalStats = {
  membres_actifs: number;
  pts_ponderes_mois: number;
  quiz_mois: number;
  codes_mois: number;
  revenus_redistribues: number;
  pool_pmq: number;
  pool_ptc: number;
};

type TransparenceConfigRow = {
  cle: string;
  label: string;
  visible: boolean;
  ordre: number;
};

type ReseauSocialKey = "youtube" | "facebook" | "tiktok" | "instagram";

type ReseauSocialRow = {
  id: string;
  reseau: ReseauSocialKey;
  abonnes: number;
  actif: boolean;
  ordre: number;
  updated_at: string;
};

type ReseauSocialDraft = {
  abonnes: string;
  actif: boolean;
};

type FondateurConfigRow = {
  id: string;
  actif: boolean;
  membres_actuels: number;
  membres_max: number;
  message: string;
  updated_at: string;
};

type FondateurConfigDraft = {
  actif: boolean;
  membres_actuels: string;
  message: string;
};

type PtcUtilisationCategorie = "promotion" | "outils" | "reserve";

type PtcUtilisationConfigRow = {
  id: string;
  categorie: PtcUtilisationCategorie;
  actif: boolean;
  budget_alloue: number;
  updated_at: string;
};

type PtcUtilisationDraft = {
  actif: boolean;
  budget_alloue: string;
};

const PTC_UTILISATION_LABELS: Record<PtcUtilisationCategorie, string> = {
  promotion: "🚀 Promotion YouTube Ads",
  outils: "🛠️ Outils Production (Filmora, Epidemic Sound, hébergement)",
  reserve: "🏦 Réserve Trésorerie (objectif : 2 mois redistribution)",
};

const PTC_UNIT_DOLLARS = 5;

function ptcUtilisationToDraft(c: PtcUtilisationConfigRow): PtcUtilisationDraft {
  return {
    actif: c.actif,
    budget_alloue: String(c.budget_alloue),
  };
}

function ptcUtilisationDraftDirty(
  c: PtcUtilisationConfigRow,
  d: PtcUtilisationDraft,
): boolean {
  return (
    c.actif !== d.actif ||
    String(c.budget_alloue) !== d.budget_alloue.trim()
  );
}

type ActionnaireRow = {
  id: string;
  siege: number | null;
  nom: string;
  categorie: string;
  nb_actions: number;
  pourcentage: number | string;
  role: string | null;
  actif: boolean;
  locked: boolean;
};

type ActionnaireDraft = {
  nom: string;
  nb_actions: string;
  pourcentage: string;
  role: string;
};

function actionnaireToDraft(a: ActionnaireRow): ActionnaireDraft {
  return {
    nom: a.nom,
    nb_actions: String(a.nb_actions),
    pourcentage: String(a.pourcentage),
    role: a.role ?? "",
  };
}

function actionnaireDraftDirty(a: ActionnaireRow, d: ActionnaireDraft): boolean {
  return (
    a.nom !== d.nom.trim() ||
    String(a.nb_actions) !== d.nb_actions.trim() ||
    String(a.pourcentage) !== d.pourcentage.trim() ||
    (a.role ?? "") !== d.role.trim()
  );
}

type ActionsConfigRow = {
  id: string;
  total_actions_a: number;
  total_actions_b: number;
  total_actions_c: number;
  valeur_fondation: number;
  multiple_valorisation: number;
  prix_action_c_phase: number;
  locked: boolean;
  updated_at: string;
};

type ActionsConfigDraft = {
  total_actions_a: string;
  total_actions_b: string;
  total_actions_c: string;
  valeur_fondation: string;
  multiple_valorisation: string;
  prix_action_c_phase: string;
};

function actionsConfigToDraft(c: ActionsConfigRow): ActionsConfigDraft {
  return {
    total_actions_a: String(c.total_actions_a),
    total_actions_b: String(c.total_actions_b),
    total_actions_c: String(c.total_actions_c),
    valeur_fondation: String(c.valeur_fondation),
    multiple_valorisation: String(c.multiple_valorisation),
    prix_action_c_phase: String(c.prix_action_c_phase),
  };
}

function actionsConfigDraftDirty(c: ActionsConfigRow, d: ActionsConfigDraft): boolean {
  return (
    String(c.total_actions_a) !== d.total_actions_a.trim() ||
    String(c.total_actions_b) !== d.total_actions_b.trim() ||
    String(c.total_actions_c) !== d.total_actions_c.trim() ||
    String(c.valeur_fondation) !== d.valeur_fondation.trim() ||
    String(c.multiple_valorisation) !== d.multiple_valorisation.trim() ||
    String(c.prix_action_c_phase) !== d.prix_action_c_phase.trim()
  );
}

type RevenusDraft = {
  rev_youtube_adsense: string;
  rev_programmatique: string;
  rev_partenaires: string;
  rev_boutique: string;
  rev_autres: string;
  depenses_operationnelles: string;
};

const REVENUS_CHAMPS: { key: keyof RevenusDraft; label: string }[] = [
  { key: "rev_youtube_adsense", label: "YouTube AdSense" },
  { key: "rev_programmatique", label: "Programmatique" },
  { key: "rev_partenaires", label: "Partenaires" },
  { key: "rev_boutique", label: "Boutique" },
  { key: "rev_autres", label: "Autres" },
];

const EMPTY_REVENUS_DRAFT: RevenusDraft = {
  rev_youtube_adsense: "",
  rev_programmatique: "",
  rev_partenaires: "",
  rev_boutique: "",
  rev_autres: "",
  depenses_operationnelles: "",
};

function montantSaisi(raw: string): number {
  const n = Number(raw.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

type ValorisationRow = {
  mois: string;
  total_brut: number;
  revenus_annualises: number;
  valeur_societe: number;
  valeur_action: number;
  pool_25: number;
  pool_dividendes: number;
  prix_action_c: number;
};

type DividendeDistributionRow = {
  id: string;
  actionnaire_id: string;
  montant: number | string;
  statut: string | null;
  actionnaire: { nom: string; pourcentage: number | string } | null;
};

type DividendeDecisionRow = {
  id: string;
  trimestre: string;
  montant_distribue: number | string;
  notes: string | null;
  created_at: string;
  distributions: DividendeDistributionRow[];
};

function currentMoisYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentTrimestre(): string {
  const d = new Date();
  return `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`;
}

function trimestreOptions(): string[] {
  const y = new Date().getFullYear();
  const out: string[] = [];
  for (const year of [y - 1, y]) {
    for (let t = 1; t <= 4; t++) out.push(`${year}-T${t}`);
  }
  return out;
}

const RESEAU_SOCIAL_LABELS: Record<ReseauSocialKey, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  tiktok: "TikTok",
  instagram: "Instagram",
};

function reseauSocialToDraft(r: ReseauSocialRow): ReseauSocialDraft {
  return {
    abonnes: String(r.abonnes),
    actif: r.actif,
  };
}

function reseauSocialDraftDirty(r: ReseauSocialRow, d: ReseauSocialDraft): boolean {
  return String(r.abonnes) !== d.abonnes.trim() || r.actif !== d.actif;
}

function fondateurConfigToDraft(c: FondateurConfigRow): FondateurConfigDraft {
  return {
    actif: c.actif,
    membres_actuels: String(c.membres_actuels),
    message: c.message,
  };
}

function fondateurConfigDraftDirty(
  c: FondateurConfigRow,
  d: FondateurConfigDraft,
): boolean {
  return (
    c.actif !== d.actif ||
    String(c.membres_actuels) !== d.membres_actuels.trim() ||
    c.message !== d.message
  );
}

type RangConfigRow = {
  id: string;
  seuil_bronze: number;
  seuil_argent: number;
  seuil_or: number;
  seuil_diamant: number;
  bonus_bronze: number;
  bonus_argent: number;
  bonus_or: number;
  bonus_diamant: number;
  updated_at: string;
};

type RangConfigDraft = {
  seuil_bronze: string;
  seuil_argent: string;
  seuil_or: string;
  seuil_diamant: string;
  bonus_bronze: string;
  bonus_argent: string;
  bonus_or: string;
  bonus_diamant: string;
};

const RANG_TIER_FIELDS: {
  tier: string;
  label: string;
  seuilKey: keyof Pick<
    RangConfigDraft,
    "seuil_bronze" | "seuil_argent" | "seuil_or" | "seuil_diamant"
  >;
  bonusKey: keyof Pick<
    RangConfigDraft,
    "bonus_bronze" | "bonus_argent" | "bonus_or" | "bonus_diamant"
  >;
}[] = [
  { tier: "bronze", label: "Bronze", seuilKey: "seuil_bronze", bonusKey: "bonus_bronze" },
  { tier: "argent", label: "Argent", seuilKey: "seuil_argent", bonusKey: "bonus_argent" },
  { tier: "or", label: "Or", seuilKey: "seuil_or", bonusKey: "bonus_or" },
  { tier: "diamant", label: "Diamant", seuilKey: "seuil_diamant", bonusKey: "bonus_diamant" },
];

function bonusDecimalToPctString(v: number): string {
  const pct = v * 100;
  return Number.isInteger(pct) ? String(pct) : String(Math.round(pct * 100) / 100);
}

function rangConfigToDraft(c: RangConfigRow): RangConfigDraft {
  return {
    seuil_bronze: String(c.seuil_bronze),
    seuil_argent: String(c.seuil_argent),
    seuil_or: String(c.seuil_or),
    seuil_diamant: String(c.seuil_diamant),
    bonus_bronze: bonusDecimalToPctString(c.bonus_bronze),
    bonus_argent: bonusDecimalToPctString(c.bonus_argent),
    bonus_or: bonusDecimalToPctString(c.bonus_or),
    bonus_diamant: bonusDecimalToPctString(c.bonus_diamant),
  };
}

function rangConfigDraftDirty(c: RangConfigRow, d: RangConfigDraft): boolean {
  return (
    String(c.seuil_bronze) !== d.seuil_bronze.trim() ||
    String(c.seuil_argent) !== d.seuil_argent.trim() ||
    String(c.seuil_or) !== d.seuil_or.trim() ||
    String(c.seuil_diamant) !== d.seuil_diamant.trim() ||
    bonusDecimalToPctString(c.bonus_bronze) !== d.bonus_bronze.trim() ||
    bonusDecimalToPctString(c.bonus_argent) !== d.bonus_argent.trim() ||
    bonusDecimalToPctString(c.bonus_or) !== d.bonus_or.trim() ||
    bonusDecimalToPctString(c.bonus_diamant) !== d.bonus_diamant.trim()
  );
}

function transparenceConfigSectionLabel(cle: string): string {
  return cle === "frais_plateforme" || cle === "taxe_pa"
    ? "Section Frais plateforme"
    : "Section Soldes banque LEVE";
}

type PaTaxStats = {
  total: number;
  communaute: number;
  fonctionnement: number;
};

type TransparencyRow = {
  month: string;
  total_revenue: number;
  pmq_pool: number;
  production_pool: number;
  fondation_pool: number;
  operations_pool: number;
  value_per_point: number | null;
  total_members: number;
};

type TransparencyAnnual = {
  total_revenue: number;
  pmq_pool: number;
  production_pool: number;
  fondation_pool: number;
  operations_pool: number;
  total_members: number;
};

type ProductionVideoRow = {
  id: string;
  youtube_id: string;
  title: string | null;
  points_value: number | null;
  full_code: string | null;
  has_code: boolean;
  has_quiz: boolean;
  quiz_question_count: number;
  submission_count: number;
};

/** Ordre d'affichage dans « Déploiement des fonctionnalités » (flags définis en base). */
const FEATURE_FLAG_ORDER = [
  "beta-exclusif",
  "boutique",
  "concours",
  "classement",
  "verification-60-pct",
  "videos-mode-youtube",
  "pool-pa",
  "collaborateur",
] as const;

function sortFeatureFlags(flags: FeatureFlagRow[]): FeatureFlagRow[] {
  return [...flags].sort((a, b) => {
    const ia = FEATURE_FLAG_ORDER.indexOf(a.nom as (typeof FEATURE_FLAG_ORDER)[number]);
    const ib = FEATURE_FLAG_ORDER.indexOf(b.nom as (typeof FEATURE_FLAG_ORDER)[number]);
    const rankA = ia === -1 ? FEATURE_FLAG_ORDER.length : ia;
    const rankB = ib === -1 ? FEATURE_FLAG_ORDER.length : ib;
    if (rankA !== rankB) return rankA - rankB;
    return a.nom.localeCompare(b.nom, "fr");
  });
}

type QuizCorrectLetter = "a" | "b" | "c" | "d";

function quizChoix(row: QuizQuestionRow): string[] {
  if (!Array.isArray(row.choix)) return [];
  return row.choix.map((o) => String(o ?? ""));
}

function formatQuizCorrectDisplay(row: QuizQuestionRow): string {
  const choix = quizChoix(row);
  const bonne = (row.bonne_reponse ?? "").trim();
  if (!bonne) return "—";
  const idx = choix.findIndex((o) => o.trim().toLowerCase() === bonne.toLowerCase());
  if (idx >= 0) {
    const t = choix[idx]?.trim();
    return `${String.fromCharCode(65 + idx)} — ${t?.length ? t : "—"}`;
  }
  return bonne;
}

/** Valeurs envoyées au PATCH (normalisées côté API). */
type MemberTypeForm = "communaute" | "pionnier" | "fondateur" | "collaborateur";
type MultiplierValue = 1.0 | 1.2 | 2.0;

type MemberDraft = {
  member_type: MemberTypeForm;
  multiplier: MultiplierValue;
  numero_membre: string;
  categorie: string;
  icone: string;
};

function memberTypeToForm(raw: string | null): MemberTypeForm {
  const t = (raw ?? "").trim();
  const lower = t.toLowerCase();
  if (lower === "communaute" || lower === "communauté" || t === "Communauté" || t === "Communaute") return "communaute";
  if (lower === "pionnier" || t === "Pionnier") return "pionnier";
  if (lower === "fondateur" || t === "Fondateur") return "fondateur";
  if (lower === "collaborateur" || t === "Collaborateur") return "collaborateur";
  return "communaute";
}

function memberTypeLabel(form: MemberTypeForm): string {
  const labels: Record<MemberTypeForm, string> = {
    communaute: "Communauté",
    pionnier: "Pionnier",
    fondateur: "Fondateur",
    collaborateur: "Collaborateur",
  };
  return labels[form];
}

function displayMemberType(raw: string | null): string {
  return memberTypeLabel(memberTypeToForm(raw));
}

function memberDisplayLabel(m: MemberRow): string {
  const name = (m.display_name ?? "").trim();
  if (name) return name;
  const email = (m.email ?? "").trim();
  if (email) return email;
  return m.id.slice(0, 8);
}

function multiplierToForm(raw: number | string | null): MultiplierValue {
  const n = Number(raw);
  if (Math.abs(n - 1.2) < 1e-9) return 1.2;
  if (Math.abs(n - 2) < 1e-9) return 2.0;
  return 1.0;
}

/** Valeur affichée / éditée pour le N° (entier en base ; chaîne possible côté API héritée). */
function rowNumeroMembreString(m: MemberRow): string {
  const v = m.numero_membre;
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v));
  const s = String(v).trim();
  if (s === "") return "";
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  return s;
}

function memberRowDirty(m: MemberRow, d: MemberDraft): boolean {
  const categorieDirty = (m.categorie ?? "").trim() !== d.categorie.trim();
  const iconeDirty = (m.icone ?? "").trim() !== d.icone.trim();
  return (
    memberTypeToForm(m.member_type) !== d.member_type ||
    multiplierToForm(m.multiplier) !== d.multiplier ||
    rowNumeroMembreString(m) !== d.numero_membre ||
    (d.member_type === "collaborateur" && (categorieDirty || iconeDirty))
  );
}

function defaultMemberDraft(m: MemberRow): MemberDraft {
  return {
    member_type: memberTypeToForm(m.member_type),
    multiplier: multiplierToForm(m.multiplier),
    numero_membre: rowNumeroMembreString(m),
    categorie: (m.categorie ?? "").trim(),
    icone: (m.icone ?? "").trim(),
  };
}

const cad = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 6,
});

const intFmt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });

const pointsFmt = new Intl.NumberFormat("fr-CA", {
  maximumFractionDigits: 2,
});

const monthTitleFr = new Intl.DateTimeFormat("fr-CA", {
  month: "long",
  year: "numeric",
});

function formatMonthLabel(ym: string): string {
  const key = /^(\d{4})-(\d{2})/.exec(ym.trim());
  const y = key ? Number(key[1]) : NaN;
  const m = key ? Number(key[2]) : NaN;
  if (!y || !m) return ym;
  const d = new Date(Date.UTC(y, m - 1, 1));
  try {
    return monthTitleFr.format(d);
  } catch {
    return ym;
  }
}

function yesNoBadge(value: boolean): JSX.Element {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.2rem 0.55rem",
        borderRadius: "4px",
        fontSize: "0.68rem",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        background: value ? "rgba(46, 204, 113, 0.18)" : "rgba(192, 57, 43, 0.15)",
        color: value ? "#2ECC71" : ROUGE,
        border: `1px solid ${value ? "rgba(46, 204, 113, 0.35)" : "rgba(192, 57, 43, 0.35)"}`,
      }}
    >
      {value ? "Oui" : "Non"}
    </span>
  );
}

function onOffSwitch(props: {
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  label: string;
  onToggle: () => void;
}): JSX.Element {
  const { checked, disabled, busy, label, onToggle } = props;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || busy}
      onClick={onToggle}
      style={{
        flexShrink: 0,
        position: "relative",
        width: "3.25rem",
        height: "1.75rem",
        borderRadius: "4px",
        border: `1px solid ${checked ? "rgba(46, 204, 113, 0.5)" : "rgba(245, 240, 232, 0.2)"}`,
        background: checked ? "rgba(46, 204, 113, 0.35)" : "rgba(245, 240, 232, 0.08)",
        cursor: disabled || busy ? "wait" : "pointer",
        padding: 0,
        transition: "background 0.2s ease",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
    >
      <span
        style={{
          position: "absolute",
          top: "50%",
          left: checked ? "calc(100% - 1.35rem)" : "0.2rem",
          transform: "translateY(-50%)",
          width: "1.15rem",
          height: "1.15rem",
          borderRadius: "50%",
          background: checked ? "#2ECC71" : "rgba(245, 240, 232, 0.45)",
          transition: "left 0.2s ease, background 0.2s ease",
        }}
      />
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {checked ? "ON" : "OFF"}
      </span>
    </button>
  );
}

const POOL_SERIES = [
  { key: "pmq_balance" as const, color: GOLD, label: "PMQ", cardLabel: "PMQ" },
  {
    key: "production_balance" as const,
    color: "#3498DB",
    label: "Production",
    cardLabel: "Production",
  },
  {
    key: "fondation_balance" as const,
    color: "#9B59B6",
    label: "Fondation",
    cardLabel: "Fondation",
  },
  {
    key: "operations_balance" as const,
    color: "#7F8C8D",
    label: "Opérations",
    cardLabel: "Opérations",
  },
  {
    key: "ptc_balance" as const,
    color: "#E67E22",
    label: "PTC",
    cardLabel: "PTC — Pool de Croissance",
  },
  {
    key: "pcol_balance" as const,
    color: "#1ABC9C",
    label: "PCOL",
    cardLabel: "PCOL — Pool Collaborateur",
  },
];

function PoolAccumulationChart({ series }: { series: PoolMonthPoint[] }): JSX.Element {
  if (series.length === 0) {
    return <p style={{ opacity: 0.65, margin: 0 }}>Aucune redistribution enregistrée.</p>;
  }

  const W = 920;
  const H = 260;
  const pad = { l: 58, r: 18, t: 18, b: 38 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const maxY = Math.max(
    ...series.flatMap((row) => POOL_SERIES.map((s) => row[s.key])),
    1,
  );
  const xStep = series.length > 1 ? innerW / (series.length - 1) : 0;

  function yScale(v: number): number {
    return pad.t + innerH - (v / maxY) * innerH;
  }

  return (
    <div style={{ width: "100%", overflowX: "auto",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Évolution mensuelle des pools"
        style={{ display: "block", minWidth: "640px", width: "100%", height: "auto" }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.t + innerH * (1 - t);
          const val = maxY * t;
          return (
            <g key={t}>
              <line
                x1={pad.l}
                y1={y}
                x2={W - pad.r}
                y2={y}
                stroke="rgba(245,240,232,0.08)"
                strokeWidth={1}
              />
              <text
                x={pad.l - 8}
                y={y + 4}
                textAnchor="end"
                fill="rgba(245,240,232,0.45)"
                fontSize={10}
              >
                {cad.format(val)}
              </text>
            </g>
          );
        })}
        {series.map((row, i) => {
          const x = pad.l + (series.length > 1 ? i * xStep : innerW / 2);
          return (
            <text
              key={row.month}
              x={x}
              y={H - 10}
              textAnchor="middle"
              fill="rgba(245,240,232,0.5)"
              fontSize={10}
            >
              {row.month.slice(5)}
            </text>
          );
        })}
        {POOL_SERIES.map((s) => {
          const points = series
            .map((row, i) => {
              const x = pad.l + (series.length > 1 ? i * xStep : innerW / 2);
              const y = yScale(row[s.key]);
              return `${x},${y}`;
            })
            .join(" ");
          return (
            <polyline
              key={s.key}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              points={points}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "0.75rem" }}>
        {POOL_SERIES.map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem" }}>
            <span
              style={{
                width: "0.75rem",
                height: "0.75rem",
                borderRadius: "50%",
                background: s.color,
                display: "inline-block",
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}


function ValorisationChart({ series }: { series: ValorisationRow[] }): JSX.Element {
  if (series.length === 0) {
    return <p style={{ opacity: 0.65, margin: 0 }}>Aucune valorisation enregistrée.</p>;
  }

  const W = 920;
  const H = 240;
  const pad = { l: 70, r: 18, t: 18, b: 38 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const maxY = Math.max(...series.map((row) => row.valeur_societe), 1);
  const xStep = series.length > 1 ? innerW / (series.length - 1) : 0;

  function xAt(i: number): number {
    return pad.l + (series.length > 1 ? i * xStep : innerW / 2);
  }

  function yAt(v: number): number {
    return pad.t + innerH - (v / maxY) * innerH;
  }

  const points = series.map((row, i) => `${xAt(i)},${yAt(row.valeur_societe)}`).join(" ");

  return (
    <div style={{ width: "100%", overflowX: "auto",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Évolution de la valorisation par mois"
        style={{ display: "block", minWidth: "640px", width: "100%", height: "auto" }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.t + innerH * (1 - t);
          return (
            <g key={t}>
              <line
                x1={pad.l}
                y1={y}
                x2={W - pad.r}
                y2={y}
                stroke="rgba(245,240,232,0.08)"
                strokeWidth={1}
              />
              <text
                x={pad.l - 8}
                y={y + 4}
                textAnchor="end"
                fill="rgba(245,240,232,0.45)"
                fontSize={10}
              >
                {cad.format(maxY * t)}
              </text>
            </g>
          );
        })}
        {series.map((row, i) => (
          <text
            key={row.mois}
            x={xAt(i)}
            y={H - 10}
            textAnchor="middle"
            fill="rgba(245,240,232,0.5)"
            fontSize={10}
          >
            {row.mois}
          </text>
        ))}
        <polyline
          fill="none"
          stroke={GOLD}
          strokeWidth={2.5}
          points={points}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {series.map((row, i) => (
          <circle
            key={`pt-${row.mois}`}
            cx={xAt(i)}
            cy={yAt(row.valeur_societe)}
            r={3.5}
            fill={GOLD}
          />
        ))}
      </svg>
      <p style={{ margin: "0.6rem 0 0", fontSize: "0.78rem", opacity: 0.55 }}>
        Valeur de la société (CAD) par mois validé.
      </p>
    </div>
  );
}

function betaNumber(raw: number | string | null): number {
  const n = typeof raw === "number" ? raw : Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Bonus PA attribué aux 3 premiers testeurs à la fin du beta (index 0 = 1ʳᵉ place). */
const BETA_BONUS_PA = [100, 50, 25] as const;
const BETA_TOP_MEDAILLES = ["🥇", "🥈", "🥉"] as const;

function formatBetaTemps(totalSecondes: number): string {
  const s = Math.max(0, Math.floor(totalSecondes));
  const heures = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (heures > 0) return `${heures}h ${String(minutes).padStart(2, "0")}min`;
  return `${minutes}min`;
}

function formatBetaDateHeure(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function betaStatut(derniereActivite: string | null): { emoji: string; label: string } {
  if (!derniereActivite) return { emoji: "🔴", label: "Absent" };
  const t = new Date(derniereActivite).getTime();
  if (Number.isNaN(t)) return { emoji: "🔴", label: "Absent" };
  const heures = (Date.now() - t) / 3_600_000;
  if (heures < 24) return { emoji: "🟢", label: "Actif" };
  if (heures <= 72) return { emoji: "🟡", label: "Inactif" };
  return { emoji: "🔴", label: "Absent" };
}

const BETA_BUG_SEVERITES: { value: string; couleur: string }[] = [
  { value: "P1", couleur: "#C0392B" },
  { value: "P2", couleur: "#E67E22" },
  { value: "P3", couleur: "#D4A017" },
];

const BETA_BUG_STATUTS: { value: string; label: string }[] = [
  { value: "ouvert", label: "Ouvert" },
  { value: "en_cours", label: "En cours" },
  { value: "resolu", label: "Résolu" },
  { value: "ferme", label: "Fermé" },
];

function betaBugSeveriteCouleur(severite: string): string {
  return BETA_BUG_SEVERITES.find((s) => s.value === severite)?.couleur ?? "rgba(245,240,232,0.4)";
}

function betaBugStatutLabel(statut: string): string {
  return BETA_BUG_STATUTS.find((s) => s.value === statut)?.label ?? statut;
}

function cardStyle() {
  return {
    background: G2,
    border: "1px solid rgba(255, 255, 255, 0.04)",
    borderRadius: "4px",
    padding: "1.5rem",
    marginBottom: "1.75rem",
  };
}

const ADMIN_SECTION_SCROLL_OFFSET = 60;

const ADMIN_SECTIONS: { id: string; label: string }[] = [
  { id: "section-stats", label: "Stats" },
  { id: "section-codes", label: "Codes" },
  { id: "section-videos", label: "Vidéos" },
  { id: "section-quiz", label: "Quiz" },
  { id: "section-redistribution", label: "Redistribution" },
  { id: "section-map", label: "Carte" },
  { id: "section-pools", label: "Pools" },
  { id: "section-transparence-vis", label: "Transparence" },
  { id: "section-transparence-adv", label: "Transp. avancée" },
  { id: "section-production", label: "Production" },
  { id: "section-frais", label: "Frais" },
  { id: "section-reseaux", label: "Réseaux" },
  { id: "section-fondateur", label: "Fondateur" },
  { id: "section-rangs", label: "Rangs" },
  { id: "section-ptc", label: "PTC" },
  { id: "section-features", label: "Features" },
  { id: "section-actions", label: "Actions" },
  { id: "section-membres", label: "Membres" },
  { id: "section-beta", label: "Beta" },
  { id: "section-bugs", label: "Bugs" },
];

function scrollToAdminSection(sectionId: string, ev: MouseEvent<HTMLAnchorElement>): void {
  ev.preventDefault();
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.style.scrollMarginTop = `${ADMIN_SECTION_SCROLL_OFFSET}px`;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function sectionTitle(text: string): JSX.Element {
  return (
    <h2
      style={{
        fontFamily: "var(--font-bebas), Impact, sans-serif",
        fontSize: "2rem",
        letterSpacing: "0.14em",
        margin: "0 0 1.25rem",
        color: GOLD,
        borderLeft: `4px solid ${ROUGE}`,
        paddingLeft: "0.85rem",
      }}
    >
      {text}
    </h2>
  );
}

function subSectionTitle(text: string): JSX.Element {
  return (
    <h3
      style={{
        fontFamily: "var(--font-bebas), Impact, sans-serif",
        fontSize: "1.35rem",
        letterSpacing: "0.12em",
        margin: "0 0 1rem",
        color: TEXT,
        opacity: 0.92,
      }}
    >
      {text}
    </h3>
  );
}

function GlobalStatCard({
  title,
  value,
  accent,
  loading,
}: {
  title: string;
  value: string;
  accent: string;
  loading: boolean;
}): JSX.Element {
  return (
    <div
      style={{
        background: G2,
        borderTop: `2px solid ${accent}`,
        borderRadius: "4px",
        padding: "1rem 1.15rem",
        minHeight: "5.5rem",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-mono), ui-monospace, monospace",
          fontSize: "0.68rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          opacity: 0.55,
          margin: 0,
          lineHeight: 1.35,
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontFamily: "var(--font-bebas), Impact, sans-serif",
          fontSize: "clamp(1.75rem, 4vw, 2.35rem)",
          letterSpacing: "0.04em",
          margin: "0.4rem 0 0",
          color: TEXT,
          lineHeight: 1,
        }}
      >
        {loading ? "…" : value}
      </p>
    </div>
  );
}

const actionsSubCard = {
  background: "rgba(245, 240, 232, 0.025)",
  border: "1px solid rgba(245, 240, 232, 0.08)",
  borderRadius: "4px",
  padding: "1.25rem",
  marginBottom: "1.25rem",
} as const;

export default function AdminPage(): JSX.Element {
  const fonts = `${bebas.variable} ${dmSans.variable}`;

  const [hydrated, setHydrated] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [linkedVideoCodes, setLinkedVideoCodes] = useState<Record<string, string>>({});
  const [codeInputByVideo, setCodeInputByVideo] = useState<Record<string, string>>({});
  const [codeAssociateError, setCodeAssociateError] = useState<Record<string, string>>({});
  const [codeModifyConfirmVideoId, setCodeModifyConfirmVideoId] = useState<string | null>(null);
  const [codeModifyStep, setCodeModifyStep] = useState<1 | 2>(1);
  const [codeModifyReentryKey, setCodeModifyReentryKey] = useState("");
  const [codeLoadingId, setCodeLoadingId] = useState<string | null>(null);
  const [standaloneGeneratedCode, setStandaloneGeneratedCode] = useState<string | null>(null);
  const [standaloneGenLoading, setStandaloneGenLoading] = useState(false);
  const [standaloneGenCopied, setStandaloneGenCopied] = useState(false);
  const [standaloneGenError, setStandaloneGenError] = useState<string | null>(null);

  const [newYoutube, setNewYoutube] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newPoints, setNewPoints] = useState<15 | 25 | 30>(15);
  const [addVideoLoading, setAddVideoLoading] = useState(false);
  const [addVideoMsg, setAddVideoMsg] = useState<string | null>(null);

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [totalRevenue, setTotalRevenue] = useState("");
  const [redistLoading, setRedistLoading] = useState(false);
  const [redistResult, setRedistResult] = useState<{
    pmq_pool: number;
    value_per_point: number | null;
    total_distributed: number;
  } | null>(null);
  const [redistError, setRedistError] = useState<string | null>(null);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({});
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const [quizVideoId, setQuizVideoId] = useState("");
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionRow[]>([]);
  const [quizQuestionsLoading, setQuizQuestionsLoading] = useState(false);
  const [quizQuestionsError, setQuizQuestionsError] = useState<string | null>(null);
  const [newQuizQ, setNewQuizQ] = useState("");
  const [newQuizA, setNewQuizA] = useState("");
  const [newQuizB, setNewQuizB] = useState("");
  const [newQuizC, setNewQuizC] = useState("");
  const [newQuizD, setNewQuizD] = useState("");
  const [newQuizCorrect, setNewQuizCorrect] = useState<QuizCorrectLetter>("a");
  const [quizAddLoading, setQuizAddLoading] = useState(false);
  const [quizAddMsg, setQuizAddMsg] = useState<string | null>(null);
  const [quizDeleteId, setQuizDeleteId] = useState<string | null>(null);
  const [generateQuizLoadingId, setGenerateQuizLoadingId] = useState<string | null>(null);
  const [generateQuizError, setGenerateQuizError] = useState<Record<string, string>>({});
  const [generateQuizSuccess, setGenerateQuizSuccess] = useState<Record<string, number>>({});
  const [quizInfoByVideo, setQuizInfoByVideo] = useState<
    Record<string, { available: boolean; count: number }>
  >({});
  const [collaborateurSavingId, setCollaborateurSavingId] = useState<string | null>(null);
  const [collaborateurError, setCollaborateurError] = useState<Record<string, string>>({});

  const [featureFlags, setFeatureFlags] = useState<FeatureFlagRow[]>([]);
  const [featureFlagsLoading, setFeatureFlagsLoading] = useState(false);
  const [featureFlagsError, setFeatureFlagsError] = useState<string | null>(null);
  const [togglingFlagNom, setTogglingFlagNom] = useState<string | null>(null);

  const [fraisPaliers, setFraisPaliers] = useState<FraisPlateformePalierRow[]>([]);
  const [fraisPalierDrafts, setFraisPalierDrafts] = useState<Record<string, FraisPalierDraft>>({});
  const [fraisPlateformeLoading, setFraisPlateformeLoading] = useState(false);
  const [fraisPlateformeError, setFraisPlateformeError] = useState<string | null>(null);
  const [fraisPlateformeSaving, setFraisPlateformeSaving] = useState(false);
  const [fraisPlateformeSaveMsg, setFraisPlateformeSaveMsg] = useState<string | null>(null);

  const [memberMapCountries, setMemberMapCountries] = useState<CountryCount[]>([]);
  const [memberMapTotal, setMemberMapTotal] = useState(0);
  const [memberMapLoading, setMemberMapLoading] = useState(false);
  const [memberMapError, setMemberMapError] = useState<string | null>(null);

  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [globalStatsLoading, setGlobalStatsLoading] = useState(false);
  const [globalStatsError, setGlobalStatsError] = useState<string | null>(null);

  const [poolSeries, setPoolSeries] = useState<PoolMonthPoint[]>([]);
  const [poolCurrent, setPoolCurrent] = useState<PoolCurrent | null>(null);
  const [paTaxStats, setPaTaxStats] = useState<PaTaxStats | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);

  const [transparencyYear, setTransparencyYear] = useState(() => String(new Date().getFullYear()));
  const [transparencyMonth, setTransparencyMonth] = useState("");
  const [transparencyRows, setTransparencyRows] = useState<TransparencyRow[]>([]);
  const [transparencyAnnual, setTransparencyAnnual] = useState<TransparencyAnnual | null>(null);
  const [transparencyYears, setTransparencyYears] = useState<string[]>([]);
  const [transparencyLoading, setTransparencyLoading] = useState(false);
  const [transparencyError, setTransparencyError] = useState<string | null>(null);

  const [transparencePools, setTransparencePools] = useState<TransparenceConfigRow[]>([]);
  const [transparencePoolsLoading, setTransparencePoolsLoading] = useState(false);
  const [transparencePoolsError, setTransparencePoolsError] = useState<string | null>(null);
  const [togglingTransparencePool, setTogglingTransparencePool] = useState<string | null>(null);

  const [productionVideos, setProductionVideos] = useState<ProductionVideoRow[]>([]);
  const [productionLoading, setProductionLoading] = useState(false);
  const [productionError, setProductionError] = useState<string | null>(null);

  const [reseauxSociaux, setReseauxSociaux] = useState<ReseauSocialRow[]>([]);
  const [reseauxSociauxDrafts, setReseauxSociauxDrafts] = useState<Record<string, ReseauSocialDraft>>({});
  const [reseauxSociauxLoading, setReseauxSociauxLoading] = useState(false);
  const [reseauxSociauxError, setReseauxSociauxError] = useState<string | null>(null);
  const [reseauxSociauxSaving, setReseauxSociauxSaving] = useState(false);
  const [reseauxSociauxSaveMsg, setReseauxSociauxSaveMsg] = useState<string | null>(null);

  const [fondateurConfig, setFondateurConfig] = useState<FondateurConfigRow | null>(null);
  const [fondateurConfigDraft, setFondateurConfigDraft] = useState<FondateurConfigDraft | null>(
    null,
  );
  const [fondateurConfigLoading, setFondateurConfigLoading] = useState(false);
  const [fondateurConfigError, setFondateurConfigError] = useState<string | null>(null);
  const [fondateurConfigSaving, setFondateurConfigSaving] = useState(false);
  const [fondateurConfigSaveMsg, setFondateurConfigSaveMsg] = useState<string | null>(null);

  const [rangConfig, setRangConfig] = useState<RangConfigRow | null>(null);
  const [rangConfigDraft, setRangConfigDraft] = useState<RangConfigDraft | null>(null);
  const [rangConfigLoading, setRangConfigLoading] = useState(false);
  const [rangConfigError, setRangConfigError] = useState<string | null>(null);
  const [rangConfigSaving, setRangConfigSaving] = useState(false);
  const [rangConfigSaveMsg, setRangConfigSaveMsg] = useState<string | null>(null);

  const [ptcUtilisations, setPtcUtilisations] = useState<PtcUtilisationConfigRow[]>([]);
  const [ptcUtilisationDrafts, setPtcUtilisationDrafts] = useState<
    Record<string, PtcUtilisationDraft>
  >({});
  const [ptcUtilisationsLoading, setPtcUtilisationsLoading] = useState(false);
  const [ptcUtilisationsError, setPtcUtilisationsError] = useState<string | null>(null);
  const [ptcUtilisationsSaving, setPtcUtilisationsSaving] = useState(false);
  const [ptcUtilisationsSaveMsg, setPtcUtilisationsSaveMsg] = useState<string | null>(null);

  // — Système Actions & Dividendes —
  const [actionnaires, setActionnaires] = useState<ActionnaireRow[]>([]);
  const [actionnairesLoading, setActionnairesLoading] = useState(false);
  const [actionnairesError, setActionnairesError] = useState<string | null>(null);
  const [actionnairesMsg, setActionnairesMsg] = useState<string | null>(null);
  const [actionnaireDrafts, setActionnaireDrafts] = useState<Record<string, ActionnaireDraft>>({});
  const [actionnaireBusyId, setActionnaireBusyId] = useState<string | null>(null);

  const [actionsConfig, setActionsConfig] = useState<ActionsConfigRow | null>(null);
  const [actionsConfigDraft, setActionsConfigDraft] = useState<ActionsConfigDraft | null>(null);
  const [actionsConfigLoading, setActionsConfigLoading] = useState(false);
  const [actionsConfigError, setActionsConfigError] = useState<string | null>(null);
  const [actionsConfigBusy, setActionsConfigBusy] = useState(false);
  const [actionsConfigMsg, setActionsConfigMsg] = useState<string | null>(null);

  const [revenusMois, setRevenusMois] = useState(currentMoisYm);
  const [revenusDraft, setRevenusDraft] = useState<RevenusDraft>(EMPTY_REVENUS_DRAFT);
  const [revenusSaving, setRevenusSaving] = useState(false);
  const [revenusError, setRevenusError] = useState<string | null>(null);
  const [revenusMsg, setRevenusMsg] = useState<string | null>(null);

  const [valorisations, setValorisations] = useState<ValorisationRow[]>([]);
  const [valorisationsLoading, setValorisationsLoading] = useState(false);
  const [valorisationsError, setValorisationsError] = useState<string | null>(null);

  const [betaTesteurs, setBetaTesteurs] = useState<BetaTesterRow[]>([]);
  const [betaLoading, setBetaLoading] = useState(false);
  const [betaExporting, setBetaExporting] = useState(false);
  const [betaError, setBetaError] = useState<string | null>(null);
  const [betaBonusBusyId, setBetaBonusBusyId] = useState<string | null>(null);
  const [betaBonusDoneIds, setBetaBonusDoneIds] = useState<string[]>([]);
  const [betaBonusError, setBetaBonusError] = useState<string | null>(null);

  const [betaEmails, setBetaEmails] = useState<BetaEmailRow[]>([]);
  const [betaEmailsLoading, setBetaEmailsLoading] = useState(false);
  const [betaEmailsError, setBetaEmailsError] = useState<string | null>(null);
  const [betaEmailDraft, setBetaEmailDraft] = useState("");
  const [betaEmailNomDraft, setBetaEmailNomDraft] = useState("");
  const [betaEmailAdding, setBetaEmailAdding] = useState(false);
  const [betaEmailBusyId, setBetaEmailBusyId] = useState<string | null>(null);

  const [betaBugs, setBetaBugs] = useState<BetaBugRow[]>([]);
  const [betaBugsLoading, setBetaBugsLoading] = useState(false);
  const [betaBugsError, setBetaBugsError] = useState<string | null>(null);
  const [betaBugBusyId, setBetaBugBusyId] = useState<string | null>(null);

  const [divTrimestre, setDivTrimestre] = useState(currentTrimestre);
  const [divMontant, setDivMontant] = useState("");
  const [divDecisions, setDivDecisions] = useState<DividendeDecisionRow[]>([]);
  const [divLoading, setDivLoading] = useState(false);
  const [divSaving, setDivSaving] = useState(false);
  const [divError, setDivError] = useState<string | null>(null);
  const [divMsg, setDivMsg] = useState<string | null>(null);

  const getStoredSecret = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(STORAGE_KEY);
  }, []);

  const adminHeaders = useCallback(
    (init?: HeadersInit): Headers => {
      const h = new Headers(init);
      const s = getStoredSecret();
      if (s) {
        h.set("X-Admin-Secret", s);
        h.set("Authorization", `Bearer ${s}`);
      }
      return h;
    },
    [getStoredSecret],
  );

  useEffect(() => {
    setHydrated(true);
    const s = sessionStorage.getItem(STORAGE_KEY);
    if (s) setAuthed(true);
  }, []);

  const loadVideos = useCallback(async () => {
    setVideosLoading(true);
    try {
      const r = await fetch("/api/videos", { cache: "no-store" });
      const data = await r.json();
      setVideos(Array.isArray(data) ? (data as VideoRow[]) : []);
    } catch {
      setVideos([]);
    } finally {
      setVideosLoading(false);
    }
  }, []);

  const loadLinkedVideoCodes = useCallback(async (): Promise<void> => {
    try {
      const r = await fetch("/api/admin/code", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const j = (await r.json()) as { codes?: Record<string, string>; error?: string };
      if (!r.ok) {
        console.warn(j.error ?? "Erreur chargement des codes vidéo");
        setLinkedVideoCodes({});
        return;
      }
      setLinkedVideoCodes(j.codes ?? {});
    } catch {
      setLinkedVideoCodes({});
    }
  }, [adminHeaders]);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const r = await fetch("/api/admin/members", { headers: adminHeaders() });
      const j = (await r.json()) as { members?: MemberRow[]; error?: string };
      if (!r.ok) {
        setMembersError(j.error ?? "Erreur membres");
        setMembers([]);
        return;
      }
      setMembers(j.members ?? []);
    } catch (e) {
      setMembersError(e instanceof Error ? e.message : "Erreur réseau");
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, [adminHeaders]);

  const loadBetaSuivi = useCallback(async (): Promise<void> => {
    setBetaLoading(true);
    setBetaError(null);
    try {
      const r = await fetch("/api/admin/beta-suivi", { headers: adminHeaders(), cache: "no-store" });
      const j = (await r.json()) as { testeurs?: BetaTesterRow[]; error?: string };
      if (!r.ok) {
        setBetaError(j.error ?? "Erreur suivi beta");
        setBetaTesteurs([]);
        return;
      }
      const rows = (j.testeurs ?? [])
        .slice()
        .sort((a, b) => betaNumber(b.beta_points) - betaNumber(a.beta_points));
      setBetaTesteurs(rows);
    } catch (e) {
      setBetaError(e instanceof Error ? e.message : "Erreur réseau");
      setBetaTesteurs([]);
    } finally {
      setBetaLoading(false);
    }
  }, [adminHeaders]);

  const exportBetaCsv = useCallback(async (): Promise<void> => {
    setBetaExporting(true);
    setBetaError(null);
    try {
      const r = await fetch("/api/admin/beta-export-csv", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      if (!r.ok) {
        let message = "Erreur export CSV";
        try {
          const j = (await r.json()) as { error?: string };
          if (j.error) message = j.error;
        } catch {
          /* réponse non JSON */
        }
        setBetaError(message);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "beta-testeurs.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setBetaError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setBetaExporting(false);
    }
  }, [adminHeaders]);

  const loadBetaEmails = useCallback(async (): Promise<void> => {
    setBetaEmailsLoading(true);
    setBetaEmailsError(null);
    try {
      const r = await fetch("/api/admin/beta-emails", { headers: adminHeaders(), cache: "no-store" });
      const j = (await r.json()) as { emails?: BetaEmailRow[]; error?: string };
      if (!r.ok) {
        setBetaEmailsError(j.error ?? "Erreur liste emails beta");
        setBetaEmails([]);
        return;
      }
      setBetaEmails(j.emails ?? []);
    } catch (e) {
      setBetaEmailsError(e instanceof Error ? e.message : "Erreur réseau");
      setBetaEmails([]);
    } finally {
      setBetaEmailsLoading(false);
    }
  }, [adminHeaders]);

  const loadBetaBugs = useCallback(async (): Promise<void> => {
    setBetaBugsLoading(true);
    setBetaBugsError(null);
    try {
      const r = await fetch("/api/admin/beta-bugs", { headers: adminHeaders(), cache: "no-store" });
      const j = (await r.json()) as { bugs?: BetaBugRow[]; error?: string };
      if (!r.ok) {
        setBetaBugsError(j.error ?? "Erreur liste bugs beta");
        setBetaBugs([]);
        return;
      }
      setBetaBugs(j.bugs ?? []);
    } catch (e) {
      setBetaBugsError(e instanceof Error ? e.message : "Erreur réseau");
      setBetaBugs([]);
    } finally {
      setBetaBugsLoading(false);
    }
  }, [adminHeaders]);

  const loadFeatureFlags = useCallback(async (): Promise<void> => {
    setFeatureFlagsLoading(true);
    setFeatureFlagsError(null);
    try {
      const r = await fetch("/api/admin/feature-flags", { headers: adminHeaders() });
      const j = (await r.json()) as { flags?: FeatureFlagRow[]; error?: string };
      if (!r.ok) {
        setFeatureFlagsError(j.error ?? "Erreur feature flags");
        setFeatureFlags([]);
        return;
      }
      setFeatureFlags(j.flags ?? []);
    } catch (e) {
      setFeatureFlagsError(e instanceof Error ? e.message : "Erreur réseau");
      setFeatureFlags([]);
    } finally {
      setFeatureFlagsLoading(false);
    }
  }, [adminHeaders]);

  const loadFraisPlateforme = useCallback(async (): Promise<void> => {
    setFraisPlateformeLoading(true);
    setFraisPlateformeError(null);
    try {
      const r = await fetch("/api/admin/frais-plateforme", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const j = (await r.json()) as { paliers?: FraisPlateformePalierRow[]; error?: string };
      if (!r.ok) {
        setFraisPlateformeError(j.error ?? "Erreur frais plateforme");
        setFraisPaliers([]);
        return;
      }
      setFraisPaliers(j.paliers ?? []);
    } catch (e) {
      setFraisPlateformeError(e instanceof Error ? e.message : "Erreur réseau");
      setFraisPaliers([]);
    } finally {
      setFraisPlateformeLoading(false);
    }
  }, [adminHeaders]);

  const loadMemberMap = useCallback(async (): Promise<void> => {
    setMemberMapLoading(true);
    setMemberMapError(null);
    try {
      const r = await fetch("/api/admin/member-map", { headers: adminHeaders(), cache: "no-store" });
      const j = (await r.json()) as {
        countries?: CountryCount[];
        total?: number;
        error?: string;
      };
      if (!r.ok) {
        setMemberMapError(j.error ?? "Erreur carte membres");
        setMemberMapCountries([]);
        setMemberMapTotal(0);
        return;
      }
      setMemberMapCountries(j.countries ?? []);
      setMemberMapTotal(j.total ?? 0);
    } catch (e) {
      setMemberMapError(e instanceof Error ? e.message : "Erreur réseau");
      setMemberMapCountries([]);
      setMemberMapTotal(0);
    } finally {
      setMemberMapLoading(false);
    }
  }, [adminHeaders]);

  const loadGlobalStats = useCallback(async (): Promise<void> => {
    setGlobalStatsLoading(true);
    setGlobalStatsError(null);
    try {
      const headers = adminHeaders();
      console.log(
        "[loadGlobalStats] headers envoyés:",
        Object.fromEntries(headers.entries()),
      );
      if (!headers.get("Authorization")) {
        console.warn("[loadGlobalStats] header Authorization absent");
      }
      const r = await fetch("/api/admin/global-stats", {
        headers,
        cache: "no-store",
      });
      const j = (await r.json()) as GlobalStats & { error?: string };
      if (!r.ok) {
        setGlobalStatsError(j.error ?? "Erreur statistiques");
        return;
      }
      setGlobalStats({
        membres_actifs: Number(j.membres_actifs ?? 0),
        pts_ponderes_mois: Number(j.pts_ponderes_mois ?? 0),
        quiz_mois: Number(j.quiz_mois ?? 0),
        codes_mois: Number(j.codes_mois ?? 0),
        revenus_redistribues: Number(j.revenus_redistribues ?? 0),
        pool_pmq: Number(j.pool_pmq ?? 0),
        pool_ptc: Number(j.pool_ptc ?? 0),
      });
    } catch (e) {
      setGlobalStatsError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setGlobalStatsLoading(false);
    }
  }, [adminHeaders]);

  const loadPoolAccumulation = useCallback(async (): Promise<void> => {
    setPoolLoading(true);
    setPoolError(null);
    try {
      const r = await fetch("/api/admin/pool-accumulation", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const j = (await r.json()) as {
        series?: PoolMonthPoint[];
        current?: PoolCurrent | null;
        pa_tax_stats?: PaTaxStats | null;
        error?: string;
      };
      if (!r.ok) {
        setPoolError(j.error ?? "Erreur pools");
        setPoolSeries([]);
        setPoolCurrent(null);
        setPaTaxStats(null);
        return;
      }
      setPoolSeries(j.series ?? []);
      setPoolCurrent(j.current ?? null);
      setPaTaxStats(j.pa_tax_stats ?? null);
    } catch (e) {
      setPoolError(e instanceof Error ? e.message : "Erreur réseau");
      setPoolSeries([]);
      setPoolCurrent(null);
      setPaTaxStats(null);
    } finally {
      setPoolLoading(false);
    }
  }, [adminHeaders]);

  const loadTransparency = useCallback(async (): Promise<void> => {
    setTransparencyLoading(true);
    setTransparencyError(null);
    try {
      const params = new URLSearchParams();
      if (transparencyYear) params.set("year", transparencyYear);
      if (transparencyMonth) params.set("month", transparencyMonth);
      const qs = params.toString();
      const r = await fetch(`/api/admin/transparency${qs ? `?${qs}` : ""}`, {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const j = (await r.json()) as {
        rows?: TransparencyRow[];
        annual_totals?: TransparencyAnnual | null;
        available_years?: string[];
        error?: string;
      };
      if (!r.ok) {
        setTransparencyError(j.error ?? "Erreur transparence");
        setTransparencyRows([]);
        setTransparencyAnnual(null);
        return;
      }
      setTransparencyRows(j.rows ?? []);
      setTransparencyAnnual(j.annual_totals ?? null);
      if (j.available_years?.length) {
        setTransparencyYears(j.available_years);
      }
    } catch (e) {
      setTransparencyError(e instanceof Error ? e.message : "Erreur réseau");
      setTransparencyRows([]);
      setTransparencyAnnual(null);
    } finally {
      setTransparencyLoading(false);
    }
  }, [adminHeaders, transparencyYear, transparencyMonth]);

  const loadTransparencePools = useCallback(async (): Promise<void> => {
    setTransparencePoolsLoading(true);
    setTransparencePoolsError(null);
    try {
      const r = await fetch("/api/admin/transparence-config", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const j = (await r.json()) as { pools?: TransparenceConfigRow[]; error?: string };
      if (!r.ok) {
        setTransparencePoolsError(j.error ?? "Erreur visibilité transparence");
        setTransparencePools([]);
        return;
      }
      setTransparencePools(j.pools ?? []);
    } catch (e) {
      setTransparencePoolsError(e instanceof Error ? e.message : "Erreur réseau");
      setTransparencePools([]);
    } finally {
      setTransparencePoolsLoading(false);
    }
  }, [adminHeaders]);

  const loadProduction = useCallback(async (): Promise<void> => {
    setProductionLoading(true);
    setProductionError(null);
    try {
      const r = await fetch("/api/admin/production", { headers: adminHeaders(), cache: "no-store" });
      const j = (await r.json()) as { videos?: ProductionVideoRow[]; error?: string };
      if (!r.ok) {
        setProductionError(j.error ?? "Erreur production");
        setProductionVideos([]);
        return;
      }
      setProductionVideos(j.videos ?? []);
    } catch (e) {
      setProductionError(e instanceof Error ? e.message : "Erreur réseau");
      setProductionVideos([]);
    } finally {
      setProductionLoading(false);
    }
  }, [adminHeaders]);

  const loadReseauxSociaux = useCallback(async (): Promise<void> => {
    setReseauxSociauxLoading(true);
    setReseauxSociauxError(null);
    try {
      const r = await fetch("/api/admin/reseaux-sociaux", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const j = (await r.json()) as { reseaux?: ReseauSocialRow[]; error?: string };
      if (!r.ok) {
        setReseauxSociauxError(j.error ?? "Erreur réseaux sociaux");
        setReseauxSociaux([]);
        return;
      }
      setReseauxSociaux(j.reseaux ?? []);
    } catch (e) {
      setReseauxSociauxError(e instanceof Error ? e.message : "Erreur réseau");
      setReseauxSociaux([]);
    } finally {
      setReseauxSociauxLoading(false);
    }
  }, [adminHeaders]);

  const loadFondateurConfig = useCallback(async (): Promise<void> => {
    setFondateurConfigLoading(true);
    setFondateurConfigError(null);
    try {
      const r = await fetch("/api/admin/fondateur-config", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const j = (await r.json()) as { config?: FondateurConfigRow | null; error?: string };
      if (!r.ok) {
        setFondateurConfigError(j.error ?? "Erreur configuration fondateur");
        setFondateurConfig(null);
        setFondateurConfigDraft(null);
        return;
      }
      const config = j.config ?? null;
      setFondateurConfig(config);
      setFondateurConfigDraft(config ? fondateurConfigToDraft(config) : null);
    } catch (e) {
      setFondateurConfigError(e instanceof Error ? e.message : "Erreur réseau");
      setFondateurConfig(null);
      setFondateurConfigDraft(null);
    } finally {
      setFondateurConfigLoading(false);
    }
  }, [adminHeaders]);

  const loadRangConfig = useCallback(async (): Promise<void> => {
    setRangConfigLoading(true);
    setRangConfigError(null);
    try {
      const r = await fetch("/api/admin/rang-config", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const j = (await r.json()) as { config?: RangConfigRow | null; error?: string };
      if (!r.ok) {
        setRangConfigError(j.error ?? "Erreur configuration rangs");
        setRangConfig(null);
        setRangConfigDraft(null);
        return;
      }
      const config = j.config ?? null;
      setRangConfig(config);
      setRangConfigDraft(config ? rangConfigToDraft(config) : null);
    } catch (e) {
      setRangConfigError(e instanceof Error ? e.message : "Erreur réseau");
      setRangConfig(null);
      setRangConfigDraft(null);
    } finally {
      setRangConfigLoading(false);
    }
  }, [adminHeaders]);

  const loadPtcUtilisations = useCallback(async (): Promise<void> => {
    setPtcUtilisationsLoading(true);
    setPtcUtilisationsError(null);
    try {
      const r = await fetch("/api/admin/ptc-utilisations", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const j = (await r.json()) as {
        config?: PtcUtilisationConfigRow[];
        error?: string;
      };
      if (!r.ok) {
        setPtcUtilisationsError(j.error ?? "Erreur utilisations PTC");
        setPtcUtilisations([]);
        return;
      }
      setPtcUtilisations(j.config ?? []);
    } catch (e) {
      setPtcUtilisationsError(e instanceof Error ? e.message : "Erreur réseau");
      setPtcUtilisations([]);
    } finally {
      setPtcUtilisationsLoading(false);
    }
  }, [adminHeaders]);

  const loadQuizQuestions = useCallback(
    async (videoId: string): Promise<void> => {
      if (!videoId) {
        setQuizQuestions([]);
        setQuizQuestionsError(null);
        return;
      }
      setQuizQuestionsLoading(true);
      setQuizQuestionsError(null);
      try {
        const r = await fetch(
          `/api/admin/quiz-questions?video_id=${encodeURIComponent(videoId)}`,
          { headers: adminHeaders() },
        );
        const j = (await r.json()) as { questions?: QuizQuestionRow[]; error?: string };
        if (!r.ok) {
          setQuizQuestionsError(j.error ?? "Erreur chargement quiz");
          setQuizQuestions([]);
          return;
        }
        setQuizQuestions(j.questions ?? []);
      } catch (e) {
        setQuizQuestionsError(e instanceof Error ? e.message : "Erreur réseau");
        setQuizQuestions([]);
      } finally {
        setQuizQuestionsLoading(false);
      }
    },
    [adminHeaders],
  );

  const loadActionnaires = useCallback(async (): Promise<void> => {
    setActionnairesLoading(true);
    setActionnairesError(null);
    try {
      const r = await fetch("/api/admin/actionnaires", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const j = (await r.json()) as { actionnaires?: ActionnaireRow[]; error?: string };
      if (!r.ok) {
        setActionnairesError(j.error ?? "Erreur actionnaires");
        setActionnaires([]);
        return;
      }
      setActionnaires(j.actionnaires ?? []);
    } catch (e) {
      setActionnairesError(e instanceof Error ? e.message : "Erreur réseau");
      setActionnaires([]);
    } finally {
      setActionnairesLoading(false);
    }
  }, [adminHeaders]);

  const loadActionsConfig = useCallback(async (): Promise<void> => {
    setActionsConfigLoading(true);
    setActionsConfigError(null);
    try {
      const r = await fetch("/api/admin/actions-config", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const j = (await r.json()) as { config?: ActionsConfigRow; error?: string };
      if (!r.ok || !j.config) {
        setActionsConfigError(j.error ?? "Erreur configuration actions");
        setActionsConfig(null);
        setActionsConfigDraft(null);
        return;
      }
      setActionsConfig(j.config);
      setActionsConfigDraft(actionsConfigToDraft(j.config));
    } catch (e) {
      setActionsConfigError(e instanceof Error ? e.message : "Erreur réseau");
      setActionsConfig(null);
      setActionsConfigDraft(null);
    } finally {
      setActionsConfigLoading(false);
    }
  }, [adminHeaders]);

  const loadValorisations = useCallback(async (): Promise<void> => {
    setValorisationsLoading(true);
    setValorisationsError(null);
    try {
      const r = await fetch("/api/admin/valorisation-historique", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const j = (await r.json()) as { historique?: ValorisationRow[]; error?: string };
      if (!r.ok) {
        setValorisationsError(j.error ?? "Erreur valorisation");
        setValorisations([]);
        return;
      }
      setValorisations(j.historique ?? []);
    } catch (e) {
      setValorisationsError(e instanceof Error ? e.message : "Erreur réseau");
      setValorisations([]);
    } finally {
      setValorisationsLoading(false);
    }
  }, [adminHeaders]);

  const loadDividendes = useCallback(async (): Promise<void> => {
    setDivLoading(true);
    try {
      const r = await fetch("/api/actions/decision-dividendes", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const j = (await r.json()) as { decisions?: DividendeDecisionRow[]; error?: string };
      if (!r.ok) {
        setDivError(j.error ?? "Erreur historique dividendes");
        setDivDecisions([]);
        return;
      }
      setDivDecisions(j.decisions ?? []);
    } catch (e) {
      setDivError(e instanceof Error ? e.message : "Erreur réseau");
      setDivDecisions([]);
    } finally {
      setDivLoading(false);
    }
  }, [adminHeaders]);

  async function addBetaEmail(): Promise<void> {
    const email = betaEmailDraft.trim().toLowerCase();
    if (!email) {
      setBetaEmailsError("Email requis");
      return;
    }
    setBetaEmailAdding(true);
    setBetaEmailsError(null);
    try {
      const r = await fetch("/api/admin/beta-emails", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          email,
          nom_testeur: betaEmailNomDraft.trim() || null,
        }),
      });
      const j = (await r.json()) as { email?: BetaEmailRow; error?: string };
      if (!r.ok || !j.email) {
        setBetaEmailsError(j.error ?? "Échec de l'ajout");
        return;
      }
      const added = j.email;
      setBetaEmails((prev) => [added, ...prev]);
      setBetaEmailDraft("");
      setBetaEmailNomDraft("");
    } catch (e) {
      setBetaEmailsError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setBetaEmailAdding(false);
    }
  }

  async function toggleBetaEmail(row: BetaEmailRow): Promise<void> {
    setBetaEmailBusyId(row.id);
    setBetaEmailsError(null);
    try {
      const r = await fetch("/api/admin/beta-emails", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: row.id, actif: !row.actif }),
      });
      const j = (await r.json()) as { email?: BetaEmailRow; error?: string };
      if (!r.ok || !j.email) {
        setBetaEmailsError(j.error ?? "Échec du changement de statut");
        return;
      }
      const updated = j.email;
      setBetaEmails((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (e) {
      setBetaEmailsError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setBetaEmailBusyId(null);
    }
  }

  async function changeBetaBugStatut(row: BetaBugRow, statut: string): Promise<void> {
    if (statut === row.statut) return;
    setBetaBugBusyId(row.id);
    setBetaBugsError(null);
    try {
      const r = await fetch("/api/admin/beta-bugs", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: row.id, statut }),
      });
      const j = (await r.json()) as { bug?: BetaBugRow; error?: string };
      if (!r.ok || !j.bug) {
        setBetaBugsError(j.error ?? "Échec du changement de statut");
        return;
      }
      const updated = j.bug;
      setBetaBugs((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    } catch (e) {
      setBetaBugsError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setBetaBugBusyId(null);
    }
  }

  async function crediterBonusPa(membreId: string, ptsPa: number): Promise<void> {
    setBetaBonusBusyId(membreId);
    setBetaBonusError(null);
    try {
      const r = await fetch("/api/admin/beta-bonus-pa", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ membre_id: membreId, pts_pa: ptsPa }),
      });
      const j = (await r.json()) as { success?: boolean; error?: string };
      if (!r.ok || !j.success) {
        setBetaBonusError(j.error ?? "Échec du crédit du bonus PA");
        return;
      }
      setBetaBonusDoneIds((prev) => (prev.includes(membreId) ? prev : [...prev, membreId]));
    } catch (e) {
      setBetaBonusError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setBetaBonusBusyId(null);
    }
  }

  async function deleteBetaEmail(row: BetaEmailRow): Promise<void> {
    if (!window.confirm(`Supprimer « ${row.email} » de la liste des testeurs ?`)) {
      return;
    }
    setBetaEmailBusyId(row.id);
    setBetaEmailsError(null);
    try {
      const r = await fetch(`/api/admin/beta-emails?id=${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) {
        setBetaEmailsError(j.error ?? "Échec de la suppression");
        return;
      }
      setBetaEmails((prev) => prev.filter((e) => e.id !== row.id));
    } catch (e) {
      setBetaEmailsError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setBetaEmailBusyId(null);
    }
  }

  async function saveActionnaire(a: ActionnaireRow): Promise<void> {
    const d = actionnaireDrafts[a.id];
    if (!d) return;
    setActionnaireBusyId(a.id);
    setActionnairesError(null);
    setActionnairesMsg(null);
    try {
      const r = await fetch("/api/admin/actionnaires", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          id: a.id,
          nom: d.nom.trim(),
          nb_actions: d.nb_actions.trim(),
          pourcentage: d.pourcentage.trim(),
          role: d.role.trim() || null,
        }),
      });
      const j = (await r.json()) as { actionnaire?: ActionnaireRow; error?: string };
      if (!r.ok || !j.actionnaire) {
        setActionnairesError(j.error ?? "Échec de la sauvegarde");
        return;
      }
      const updated = j.actionnaire;
      setActionnaires((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setActionnairesMsg(`Actionnaire « ${updated.nom} » sauvegardé.`);
    } catch (e) {
      setActionnairesError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setActionnaireBusyId(null);
    }
  }

  async function toggleActionnaireLock(a: ActionnaireRow): Promise<void> {
    if (a.locked) {
      if (
        !window.confirm(
          "Êtes-vous sûr de vouloir modifier la structure des actionnaires ?",
        )
      ) {
        return;
      }
      if (
        !window.confirm(
          `Confirmer le déverrouillage de « ${a.nom} » ? Les champs deviendront éditables.`,
        )
      ) {
        return;
      }
    } else if (!window.confirm(`Verrouiller l'actionnaire « ${a.nom} » ?`)) {
      return;
    }

    setActionnaireBusyId(a.id);
    setActionnairesError(null);
    setActionnairesMsg(null);
    try {
      const r = await fetch("/api/admin/actionnaires", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: a.id, locked: !a.locked }),
      });
      const j = (await r.json()) as { actionnaire?: ActionnaireRow; error?: string };
      if (!r.ok || !j.actionnaire) {
        setActionnairesError(j.error ?? "Échec du changement de verrou");
        return;
      }
      const updated = j.actionnaire;
      setActionnaires((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } catch (e) {
      setActionnairesError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setActionnaireBusyId(null);
    }
  }

  async function saveActionsConfig(): Promise<void> {
    if (!actionsConfig || !actionsConfigDraft) return;
    setActionsConfigBusy(true);
    setActionsConfigError(null);
    setActionsConfigMsg(null);
    try {
      const r = await fetch("/api/admin/actions-config", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          total_actions_a: actionsConfigDraft.total_actions_a.trim(),
          total_actions_b: actionsConfigDraft.total_actions_b.trim(),
          total_actions_c: actionsConfigDraft.total_actions_c.trim(),
          valeur_fondation: actionsConfigDraft.valeur_fondation.trim(),
          multiple_valorisation: actionsConfigDraft.multiple_valorisation.trim(),
          prix_action_c_phase: actionsConfigDraft.prix_action_c_phase.trim(),
        }),
      });
      const j = (await r.json()) as { config?: ActionsConfigRow; error?: string };
      if (!r.ok || !j.config) {
        setActionsConfigError(j.error ?? "Échec de la sauvegarde");
        return;
      }
      setActionsConfig(j.config);
      setActionsConfigDraft(actionsConfigToDraft(j.config));
      setActionsConfigMsg("Configuration actions sauvegardée.");
    } catch (e) {
      setActionsConfigError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setActionsConfigBusy(false);
    }
  }

  async function toggleActionsConfigLock(): Promise<void> {
    if (!actionsConfig) return;
    if (actionsConfig.locked) {
      if (
        !window.confirm("Êtes-vous sûr de vouloir modifier la configuration générale des actions ?")
      ) {
        return;
      }
      if (!window.confirm("Confirmer le déverrouillage ? Les champs deviendront éditables.")) {
        return;
      }
    } else if (!window.confirm("Verrouiller la configuration générale des actions ?")) {
      return;
    }

    setActionsConfigBusy(true);
    setActionsConfigError(null);
    setActionsConfigMsg(null);
    try {
      const r = await fetch("/api/admin/actions-config", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ locked: !actionsConfig.locked }),
      });
      const j = (await r.json()) as { config?: ActionsConfigRow; error?: string };
      if (!r.ok || !j.config) {
        setActionsConfigError(j.error ?? "Échec du changement de verrou");
        return;
      }
      setActionsConfig(j.config);
      setActionsConfigDraft(actionsConfigToDraft(j.config));
    } catch (e) {
      setActionsConfigError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setActionsConfigBusy(false);
    }
  }

  async function handleValiderRevenus(): Promise<void> {
    if (
      !window.confirm(
        `Valider les revenus de ${revenusMois} et calculer la valorisation ? Cette action est définitive pour ce mois.`,
      )
    ) {
      return;
    }
    setRevenusSaving(true);
    setRevenusError(null);
    setRevenusMsg(null);
    try {
      const r = await fetch("/api/actions/valider-revenus", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          mois: revenusMois,
          rev_youtube_adsense: revenusDraft.rev_youtube_adsense.trim() || "0",
          rev_programmatique: revenusDraft.rev_programmatique.trim() || "0",
          rev_partenaires: revenusDraft.rev_partenaires.trim() || "0",
          rev_boutique: revenusDraft.rev_boutique.trim() || "0",
          rev_autres: revenusDraft.rev_autres.trim() || "0",
          depenses_operationnelles: revenusDraft.depenses_operationnelles.trim() || "0",
        }),
      });
      const j = (await r.json()) as {
        success?: boolean;
        valorisation?: ValorisationRow;
        error?: string;
      };
      if (!r.ok || !j.success || !j.valorisation) {
        setRevenusError(j.error ?? "Échec de la validation des revenus");
        return;
      }
      setRevenusMsg(
        `Revenus ${revenusMois} validés — valeur société : ${cad.format(j.valorisation.valeur_societe)}, valeur par action : ${cad.format(j.valorisation.valeur_action)}.`,
      );
      setRevenusDraft(EMPTY_REVENUS_DRAFT);
      void loadValorisations();
    } catch (e) {
      setRevenusError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setRevenusSaving(false);
    }
  }

  async function handleDistribuerDividendes(): Promise<void> {
    const montant = Number(divMontant.trim().replace(",", "."));
    if (!Number.isFinite(montant) || montant <= 0) {
      setDivError("Montant à distribuer invalide (nombre > 0).");
      return;
    }
    if (
      !window.confirm(
        `Distribuer ${cad.format(montant)} aux actionnaires actifs pour le trimestre ${divTrimestre} ?`,
      )
    ) {
      return;
    }
    setDivSaving(true);
    setDivError(null);
    setDivMsg(null);
    try {
      const r = await fetch("/api/actions/decision-dividendes", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ trimestre: divTrimestre, montant_distribue: montant }),
      });
      const j = (await r.json()) as { success?: boolean; error?: string };
      if (!r.ok || !j.success) {
        setDivError(j.error ?? "Échec de la distribution");
        return;
      }
      setDivMsg(`Distribution de ${cad.format(montant)} validée pour ${divTrimestre}.`);
      setDivMontant("");
      void loadDividendes();
    } catch (e) {
      setDivError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setDivSaving(false);
    }
  }

  useEffect(() => {
    if (!hydrated || !authed) return;
    void loadVideos();
    void loadLinkedVideoCodes();
    void loadMembers();
    void loadBetaSuivi();
    void loadBetaEmails();
    void loadBetaBugs();
    void loadFeatureFlags();
    void loadFraisPlateforme();
    void loadMemberMap();
    void loadGlobalStats();
    void loadPoolAccumulation();
    void loadTransparencePools();
    void loadProduction();
    void loadReseauxSociaux();
    void loadFondateurConfig();
    void loadRangConfig();
    void loadPtcUtilisations();
    void loadActionnaires();
    void loadActionsConfig();
    void loadValorisations();
    void loadDividendes();
  }, [
    hydrated,
    authed,
    loadVideos,
    loadLinkedVideoCodes,
    loadMembers,
    loadBetaSuivi,
    loadBetaEmails,
    loadBetaBugs,
    loadFeatureFlags,
    loadFraisPlateforme,
    loadMemberMap,
    loadGlobalStats,
    loadPoolAccumulation,
    loadTransparencePools,
    loadProduction,
    loadReseauxSociaux,
    loadFondateurConfig,
    loadRangConfig,
    loadPtcUtilisations,
    loadActionnaires,
    loadActionsConfig,
    loadValorisations,
    loadDividendes,
  ]);

  useEffect(() => {
    if (!hydrated || !authed) return;
    void loadTransparency();
  }, [hydrated, authed, loadTransparency]);

  useEffect(() => {
    if (!hydrated || !authed) return;
    const id = window.setInterval(() => void loadGlobalStats(), GLOBAL_STATS_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [hydrated, authed, loadGlobalStats]);

  useEffect(() => {
    if (!hydrated || !authed) return;
    if (!quizVideoId) {
      setQuizQuestions([]);
      setQuizQuestionsError(null);
      return;
    }
    void loadQuizQuestions(quizVideoId);
  }, [hydrated, authed, quizVideoId, loadQuizQuestions]);

  useEffect(() => {
    const next: Record<string, MemberDraft> = {};
    for (const m of members) {
      next[m.id] = defaultMemberDraft(m);
    }
    setMemberDrafts(next);
  }, [members]);

  useEffect(() => {
    const next: Record<string, FraisPalierDraft> = {};
    for (const p of fraisPaliers) {
      next[p.id] = palierToDraft(p);
    }
    setFraisPalierDrafts(next);
  }, [fraisPaliers]);

  useEffect(() => {
    const next: Record<string, ReseauSocialDraft> = {};
    for (const r of reseauxSociaux) {
      next[r.id] = reseauSocialToDraft(r);
    }
    setReseauxSociauxDrafts(next);
  }, [reseauxSociaux]);

  useEffect(() => {
    const next: Record<string, PtcUtilisationDraft> = {};
    for (const c of ptcUtilisations) {
      next[c.id] = ptcUtilisationToDraft(c);
    }
    setPtcUtilisationDrafts(next);
  }, [ptcUtilisations]);

  useEffect(() => {
    const next: Record<string, ActionnaireDraft> = {};
    for (const a of actionnaires) {
      next[a.id] = actionnaireToDraft(a);
    }
    setActionnaireDrafts(next);
  }, [actionnaires]);

  async function handleLogin(e: FormEvent): Promise<void> {
    e.preventDefault();
    setAuthError(null);
    setLoginLoading(true);
    try {
      const r = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: secretInput }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setAuthError(j.error ?? "Accès refusé");
        return;
      }
      sessionStorage.setItem(STORAGE_KEY, secretInput);
      setAuthed(true);
      setSecretInput("");
    } catch {
      setAuthError("Erreur réseau");
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout(): void {
    sessionStorage.removeItem(STORAGE_KEY);
    setAuthed(false);
    setLinkedVideoCodes({});
    setCodeInputByVideo({});
    setCodeAssociateError({});
    setCodeModifyConfirmVideoId(null);
    setStandaloneGeneratedCode(null);
    setStandaloneGenCopied(false);
    setStandaloneGenError(null);
    setRedistResult(null);
    setMembers([]);
    setMemberDrafts({});
    setEditingMemberId(null);
    setVideos([]);
    setQuizVideoId("");
    setQuizQuestions([]);
    setQuizQuestionsError(null);
    setNewQuizQ("");
    setNewQuizA("");
    setNewQuizB("");
    setNewQuizC("");
    setNewQuizD("");
    setNewQuizCorrect("a");
    setQuizAddMsg(null);
    setGenerateQuizLoadingId(null);
    setGenerateQuizError({});
    setGenerateQuizSuccess({});
    setQuizInfoByVideo({});
    setCollaborateurSavingId(null);
    setCollaborateurError({});
    setFeatureFlags([]);
    setFeatureFlagsError(null);
    setFraisPaliers([]);
    setFraisPalierDrafts({});
    setFraisPlateformeError(null);
    setFraisPlateformeSaveMsg(null);
    setMemberMapCountries([]);
    setMemberMapTotal(0);
    setMemberMapError(null);
    setPoolSeries([]);
    setPoolCurrent(null);
    setPoolError(null);
    setTransparencyRows([]);
    setTransparencyAnnual(null);
    setTransparencyYears([]);
    setTransparencyError(null);
    setProductionVideos([]);
    setProductionError(null);
    setFondateurConfig(null);
    setFondateurConfigDraft(null);
    setFondateurConfigError(null);
    setFondateurConfigSaveMsg(null);
    setRangConfig(null);
    setRangConfigDraft(null);
    setRangConfigError(null);
    setRangConfigSaveMsg(null);
    setActionnaires([]);
    setActionnaireDrafts({});
    setActionnairesError(null);
    setActionnairesMsg(null);
    setActionsConfig(null);
    setActionsConfigDraft(null);
    setActionsConfigError(null);
    setActionsConfigMsg(null);
    setRevenusDraft(EMPTY_REVENUS_DRAFT);
    setRevenusError(null);
    setRevenusMsg(null);
    setValorisations([]);
    setValorisationsError(null);
    setDivDecisions([]);
    setDivMontant("");
    setDivError(null);
    setDivMsg(null);
  }

  async function handleSaveFondateurConfig(): Promise<void> {
    if (!fondateurConfig || !fondateurConfigDraft) return;

    setFondateurConfigSaving(true);
    setFondateurConfigError(null);
    setFondateurConfigSaveMsg(null);
    try {
      if (!fondateurConfigDraftDirty(fondateurConfig, fondateurConfigDraft)) {
        setFondateurConfigSaveMsg("Aucune modification à enregistrer.");
        window.setTimeout(() => setFondateurConfigSaveMsg(null), 3000);
        return;
      }

      const membresActuels = Number(fondateurConfigDraft.membres_actuels.trim());
      if (
        !Number.isFinite(membresActuels) ||
        membresActuels < 0 ||
        !Number.isInteger(membresActuels)
      ) {
        setFondateurConfigError("Membres actuels invalides (entier ≥ 0)");
        return;
      }

      const res = await fetch("/api/admin/fondateur-config", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          actif: fondateurConfigDraft.actif,
          membres_actuels: membresActuels,
          message: fondateurConfigDraft.message,
        }),
      });
      const j = (await res.json()) as { config?: FondateurConfigRow; error?: string };
      if (!res.ok) {
        setFondateurConfigError(j.error ?? "Échec de la sauvegarde");
        return;
      }

      if (j.config) {
        setFondateurConfig(j.config);
        setFondateurConfigDraft(fondateurConfigToDraft(j.config));
      }

      setFondateurConfigSaveMsg("Configuration enregistrée.");
      window.setTimeout(() => setFondateurConfigSaveMsg(null), 3000);
    } catch (e) {
      setFondateurConfigError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setFondateurConfigSaving(false);
    }
  }

  async function handleSaveRangConfig(): Promise<void> {
    if (!rangConfig || !rangConfigDraft) return;

    setRangConfigSaving(true);
    setRangConfigError(null);
    setRangConfigSaveMsg(null);
    try {
      if (!rangConfigDraftDirty(rangConfig, rangConfigDraft)) {
        setRangConfigSaveMsg("Aucune modification à enregistrer.");
        window.setTimeout(() => setRangConfigSaveMsg(null), 3000);
        return;
      }

      const parseSeuil = (raw: string, label: string): number => {
        const n = Number(raw.trim().replace(",", "."));
        if (!Number.isFinite(n) || n < 0) {
          throw new Error(`Seuil ${label} invalide (nombre ≥ 0)`);
        }
        return n;
      };

      const parseBonusPct = (raw: string, label: string): number => {
        const n = Number(raw.trim().replace(",", "."));
        if (!Number.isFinite(n) || n < 0) {
          throw new Error(`Bonus ${label} invalide (pourcentage ≥ 0)`);
        }
        return n / 100;
      };

      const payload = {
        seuil_bronze: parseSeuil(rangConfigDraft.seuil_bronze, "Bronze"),
        seuil_argent: parseSeuil(rangConfigDraft.seuil_argent, "Argent"),
        seuil_or: parseSeuil(rangConfigDraft.seuil_or, "Or"),
        seuil_diamant: parseSeuil(rangConfigDraft.seuil_diamant, "Diamant"),
        bonus_bronze: parseBonusPct(rangConfigDraft.bonus_bronze, "Bronze"),
        bonus_argent: parseBonusPct(rangConfigDraft.bonus_argent, "Argent"),
        bonus_or: parseBonusPct(rangConfigDraft.bonus_or, "Or"),
        bonus_diamant: parseBonusPct(rangConfigDraft.bonus_diamant, "Diamant"),
      };

      const res = await fetch("/api/admin/rang-config", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as { config?: RangConfigRow; error?: string };
      if (!res.ok) {
        setRangConfigError(j.error ?? "Échec de la sauvegarde");
        return;
      }

      if (j.config) {
        setRangConfig(j.config);
        setRangConfigDraft(rangConfigToDraft(j.config));
      }

      setRangConfigSaveMsg("Configuration enregistrée.");
      window.setTimeout(() => setRangConfigSaveMsg(null), 3000);
    } catch (e) {
      setRangConfigError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setRangConfigSaving(false);
    }
  }

  async function handleSavePtcUtilisations(): Promise<void> {
    setPtcUtilisationsSaving(true);
    setPtcUtilisationsError(null);
    setPtcUtilisationsSaveMsg(null);
    try {
      const dirty = ptcUtilisations.filter((c) => {
        const d = ptcUtilisationDrafts[c.id] ?? ptcUtilisationToDraft(c);
        return ptcUtilisationDraftDirty(c, d);
      });

      if (dirty.length === 0) {
        setPtcUtilisationsSaveMsg("Aucune modification à enregistrer.");
        window.setTimeout(() => setPtcUtilisationsSaveMsg(null), 3000);
        return;
      }

      for (const c of dirty) {
        const d = ptcUtilisationDrafts[c.id] ?? ptcUtilisationToDraft(c);
        const budget = Number(d.budget_alloue.trim());
        if (!Number.isFinite(budget) || budget < 0) {
          setPtcUtilisationsError(
            `Budget invalide pour ${PTC_UTILISATION_LABELS[c.categorie]}`,
          );
          return;
        }

        const res = await fetch("/api/admin/ptc-utilisations", {
          method: "PATCH",
          headers: adminHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            categorie: c.categorie,
            actif: d.actif,
            budget_alloue: budget,
          }),
        });
        const j = (await res.json()) as {
          config?: PtcUtilisationConfigRow;
          error?: string;
        };
        if (!res.ok) {
          setPtcUtilisationsError(
            j.error ?? `Échec pour ${PTC_UTILISATION_LABELS[c.categorie]}`,
          );
          return;
        }
        if (j.config) {
          setPtcUtilisations((prev) =>
            prev.map((row) => (row.id === j.config!.id ? j.config! : row)),
          );
        }
      }

      setPtcUtilisationsSaveMsg("Configuration enregistrée.");
      window.setTimeout(() => setPtcUtilisationsSaveMsg(null), 3000);
    } catch (e) {
      setPtcUtilisationsError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setPtcUtilisationsSaving(false);
    }
  }

  async function handleSaveReseauxSociaux(): Promise<void> {
    setReseauxSociauxSaving(true);
    setReseauxSociauxError(null);
    setReseauxSociauxSaveMsg(null);
    try {
      const dirty = reseauxSociaux.filter((r) => {
        const d = reseauxSociauxDrafts[r.id] ?? reseauSocialToDraft(r);
        return reseauSocialDraftDirty(r, d);
      });

      if (dirty.length === 0) {
        setReseauxSociauxSaveMsg("Aucune modification à enregistrer.");
        window.setTimeout(() => setReseauxSociauxSaveMsg(null), 3000);
        return;
      }

      for (const r of dirty) {
        const d = reseauxSociauxDrafts[r.id] ?? reseauSocialToDraft(r);
        const abonnes = Number(d.abonnes.trim());
        if (!Number.isFinite(abonnes) || abonnes < 0 || !Number.isInteger(abonnes)) {
          setReseauxSociauxError(`Abonnés invalides pour ${RESEAU_SOCIAL_LABELS[r.reseau]}`);
          return;
        }

        const res = await fetch("/api/admin/reseaux-sociaux", {
          method: "PATCH",
          headers: adminHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            reseau: r.reseau,
            abonnes,
            actif: d.actif,
          }),
        });
        const j = (await res.json()) as { reseau?: ReseauSocialRow; error?: string };
        if (!res.ok) {
          setReseauxSociauxError(j.error ?? `Échec pour ${RESEAU_SOCIAL_LABELS[r.reseau]}`);
          return;
        }
        if (j.reseau) {
          setReseauxSociaux((prev) =>
            prev.map((row) => (row.id === j.reseau!.id ? j.reseau! : row)),
          );
        }
      }

      setReseauxSociauxSaveMsg("Configuration enregistrée.");
      window.setTimeout(() => setReseauxSociauxSaveMsg(null), 3000);
    } catch (e) {
      setReseauxSociauxError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setReseauxSociauxSaving(false);
    }
  }

  async function handleSaveFraisPlateforme(): Promise<void> {
    setFraisPlateformeSaving(true);
    setFraisPlateformeError(null);
    setFraisPlateformeSaveMsg(null);
    try {
      const paliers = fraisPaliers.map((p) => {
        const d = fraisPalierDrafts[p.id] ?? palierToDraft(p);
        return {
          id: p.id,
          palier_min: d.palier_min.trim() === "" ? 0 : Number(d.palier_min),
          palier_max: d.palier_max.trim() === "" ? null : Number(d.palier_max),
          pourcentage: Number(d.pourcentage),
          actif: d.actif,
        };
      });
      const r = await fetch("/api/admin/frais-plateforme", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ paliers }),
      });
      const j = (await r.json()) as { paliers?: FraisPlateformePalierRow[]; error?: string };
      if (!r.ok) {
        setFraisPlateformeError(j.error ?? "Échec de la sauvegarde");
        return;
      }
      setFraisPaliers(j.paliers ?? []);
      setFraisPlateformeSaveMsg("Configuration enregistrée.");
      window.setTimeout(() => setFraisPlateformeSaveMsg(null), 3000);
    } catch (e) {
      setFraisPlateformeError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setFraisPlateformeSaving(false);
    }
  }

  async function handleToggleTransparencePool(pool: TransparenceConfigRow): Promise<void> {
    const nextVisible = !pool.visible;
    setTogglingTransparencePool(pool.cle);
    setTransparencePoolsError(null);
    try {
      const r = await fetch("/api/admin/transparence-config", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ cle: pool.cle, visible: nextVisible }),
      });
      const j = (await r.json()) as { pool?: TransparenceConfigRow; error?: string };
      if (!r.ok) {
        setTransparencePoolsError(j.error ?? "Échec mise à jour");
        return;
      }
      if (j.pool) {
        setTransparencePools((prev) =>
          prev.map((p) => (p.cle === j.pool!.cle ? j.pool! : p)),
        );
      } else {
        await loadTransparencePools();
      }
    } catch (e) {
      setTransparencePoolsError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setTogglingTransparencePool(null);
    }
  }

  async function handleToggleFeatureFlag(flag: FeatureFlagRow): Promise<void> {
    const nextActif = !flag.actif;
    setTogglingFlagNom(flag.nom);
    setFeatureFlagsError(null);
    try {
      const r = await fetch("/api/admin/feature-flags", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ nom: flag.nom, actif: nextActif }),
      });
      const j = (await r.json()) as { flag?: FeatureFlagRow; error?: string };
      if (!r.ok) {
        setFeatureFlagsError(j.error ?? "Échec mise à jour");
        return;
      }
      if (j.flag) {
        setFeatureFlags((prev) =>
          prev.map((f) => (f.nom === j.flag!.nom ? j.flag! : f)),
        );
      } else {
        await loadFeatureFlags();
      }
    } catch (e) {
      setFeatureFlagsError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setTogglingFlagNom(null);
    }
  }

  async function generateStandaloneCode(): Promise<void> {
    setStandaloneGenLoading(true);
    setStandaloneGeneratedCode(null);
    setStandaloneGenCopied(false);
    setStandaloneGenError(null);
    try {
      const r = await fetch("/api/admin/code/generate", {
        cache: "no-store",
        headers: adminHeaders(),
      });
      const j = (await r.json()) as { code?: string; error?: string };
      if (!r.ok) {
        setStandaloneGeneratedCode(null);
        setStandaloneGenError(j.error ?? "Échec de la génération");
        return;
      }
      if (j.code) {
        setStandaloneGeneratedCode(j.code);
        setStandaloneGenError(null);
      }
    } catch {
      setStandaloneGenError("Erreur réseau");
    } finally {
      setStandaloneGenLoading(false);
    }
  }

  async function copyStandaloneCode(): Promise<void> {
    if (!standaloneGeneratedCode) return;
    try {
      await navigator.clipboard.writeText(standaloneGeneratedCode);
      setStandaloneGenCopied(true);
      setStandaloneGenError(null);
      window.setTimeout(() => setStandaloneGenCopied(false), 2000);
    } catch {
      setStandaloneGenError("Impossible de copier (permissions navigateur)");
    }
  }

  async function associateCodeToVideo(videoId: string): Promise<void> {
    const code = (codeInputByVideo[videoId] ?? "").trim();
    if (!code) {
      setCodeAssociateError((prev) => ({ ...prev, [videoId]: "Saisissez un code." }));
      return;
    }
    setCodeLoadingId(videoId);
    setCodeAssociateError((prev) => {
      const n = { ...prev };
      delete n[videoId];
      return n;
    });
    try {
      const r = await fetch("/api/admin/code", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ video_id: videoId, code }),
      });
      const j = (await r.json()) as { code?: string; error?: string };
      if (!r.ok) {
        setCodeAssociateError((prev) => ({ ...prev, [videoId]: j.error ?? "Erreur" }));
        return;
      }
      if (j.code) {
        const linked = j.code;
        setLinkedVideoCodes((prev) => ({ ...prev, [videoId]: linked }));
        setCodeInputByVideo((prev) => ({ ...prev, [videoId]: "" }));
      }
    } catch {
      setCodeAssociateError((prev) => ({ ...prev, [videoId]: "Erreur réseau" }));
    } finally {
      setCodeLoadingId(null);
    }
  }

  function closeCodeModifyModal(): void {
    setCodeModifyConfirmVideoId(null);
    setCodeModifyStep(1);
    setCodeModifyReentryKey("");
  }

  function handleCodeModifyConfirmKeyStep(): void {
    const vid = codeModifyConfirmVideoId;
    if (!vid) return;
    const stored =
      typeof window !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null;
    const entered = codeModifyReentryKey.trim();
    if (!stored || entered !== stored) {
      setCodeAssociateError((prev) => ({
        ...prev,
        [vid]: "Clé administrateur incorrecte",
      }));
      closeCodeModifyModal();
      return;
    }
    void deleteVideoLinkedCode(vid);
  }

  async function deleteVideoLinkedCode(videoId: string): Promise<void> {
    closeCodeModifyModal();
    setCodeLoadingId(videoId);
    try {
      const r = await fetch(`/api/admin/code?video_id=${encodeURIComponent(videoId)}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok) {
        setCodeAssociateError((prev) => ({ ...prev, [videoId]: j.error ?? "Erreur" }));
        return;
      }
      setLinkedVideoCodes((prev) => {
        const next = { ...prev };
        delete next[videoId];
        return next;
      });
      setCodeInputByVideo((prev) => ({ ...prev, [videoId]: "" }));
      setCodeAssociateError((prev) => {
        const n = { ...prev };
        delete n[videoId];
        return n;
      });
    } catch {
      setCodeAssociateError((prev) => ({ ...prev, [videoId]: "Erreur réseau" }));
    } finally {
      setCodeLoadingId(null);
    }
  }

  async function handleAddVideo(e: FormEvent): Promise<void> {
    e.preventDefault();
    setAddVideoMsg(null);
    setAddVideoLoading(true);
    try {
      const r = await fetch("/api/admin/videos", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          youtube_id: newYoutube.trim(),
          title: newTitle.trim(),
          points_value: newPoints,
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setAddVideoMsg(j.error ?? "Échec");
        return;
      }
      setNewYoutube("");
      setNewTitle("");
      setNewPoints(15);
      setAddVideoMsg("Vidéo ajoutée.");
      await loadVideos();
    } catch {
      setAddVideoMsg("Erreur réseau");
    } finally {
      setAddVideoLoading(false);
    }
  }

  async function handleRedistribution(e: FormEvent): Promise<void> {
    e.preventDefault();
    setRedistError(null);
    setRedistResult(null);
    const rev = Number(totalRevenue.replace(",", "."));
    if (!Number.isFinite(rev) || rev <= 0) {
      setRedistError("Indiquez un revenu valide.");
      return;
    }
    setRedistLoading(true);
    try {
      const r = await fetch("/api/admin/redistribution", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ month, total_revenue: rev }),
      });
      const j = (await r.json()) as {
        pmq_pool?: number;
        value_per_point?: number | null;
        total_distributed?: number;
        error?: string;
      };
      if (!r.ok) {
        setRedistError(j.error ?? "Erreur redistribution");
        if (r.status === 422 && j.pmq_pool != null) {
          setRedistResult({
            pmq_pool: j.pmq_pool,
            value_per_point: j.value_per_point ?? null,
            total_distributed: j.total_distributed ?? 0,
          });
        }
        return;
      }
      setRedistResult({
        pmq_pool: j.pmq_pool ?? 0,
        value_per_point: j.value_per_point ?? null,
        total_distributed: j.total_distributed ?? 0,
      });
      void loadPoolAccumulation();
      void loadTransparency();
    } catch {
      setRedistError("Erreur réseau");
    } finally {
      setRedistLoading(false);
    }
  }

  async function handleAddQuizQuestion(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!quizVideoId) {
      setQuizAddMsg("Sélectionnez une vidéo.");
      return;
    }
    setQuizAddMsg(null);
    setQuizAddLoading(true);
    try {
      const r = await fetch("/api/admin/quiz-questions", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          video_id: quizVideoId,
          question: newQuizQ.trim(),
          choix: [
            newQuizA.trim(),
            newQuizB.trim(),
            newQuizC.trim(),
            newQuizD.trim(),
          ],
          bonne_reponse: [newQuizA, newQuizB, newQuizC, newQuizD][
            newQuizCorrect.charCodeAt(0) - 97
          ]?.trim() ?? "",
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setQuizAddMsg(j.error ?? "Échec");
        return;
      }
      setNewQuizQ("");
      setNewQuizA("");
      setNewQuizB("");
      setNewQuizC("");
      setNewQuizD("");
      setNewQuizCorrect("a");
      setQuizAddMsg("Question ajoutée.");
      await loadQuizQuestions(quizVideoId);
    } catch {
      setQuizAddMsg("Erreur réseau");
    } finally {
      setQuizAddLoading(false);
    }
  }

  async function handleDeleteQuizQuestion(id: string): Promise<void> {
    if (!window.confirm("Supprimer cette question ?")) return;
    setQuizDeleteId(id);
    setQuizQuestionsError(null);
    try {
      const r = await fetch(`/api/admin/quiz-questions?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setQuizQuestionsError(j.error ?? "Suppression impossible");
        return;
      }
      if (quizVideoId) await loadQuizQuestions(quizVideoId);
    } catch (e) {
      setQuizQuestionsError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setQuizDeleteId(null);
    }
  }

  async function handleGenerateQuiz(video: VideoRow): Promise<void> {
    const title = (video.title ?? "").trim() || video.youtube_id;
    if (
      !window.confirm(
        `Générer automatiquement 15 questions quiz pour « ${title} » ? Cela peut prendre une minute.`,
      )
    ) {
      return;
    }
    setGenerateQuizLoadingId(video.id);
    setGenerateQuizError((prev) => {
      const next = { ...prev };
      delete next[video.id];
      return next;
    });
    setGenerateQuizSuccess((prev) => {
      const next = { ...prev };
      delete next[video.id];
      return next;
    });
    try {
      const r = await fetch("/api/admin/generate-quiz", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          video_id: video.id,
          youtube_id: video.youtube_id,
          title,
        }),
      });
      const j = (await r.json()) as { error?: string; questions_count?: number };
      if (!r.ok) {
        setGenerateQuizError((prev) => ({
          ...prev,
          [video.id]: j.error ?? "Échec génération quiz",
        }));
        return;
      }
      const count = j.questions_count ?? 15;
      setQuizInfoByVideo((prev) => ({
        ...prev,
        [video.id]: { available: true, count },
      }));
      setGenerateQuizSuccess((prev) => ({ ...prev, [video.id]: count }));
      window.setTimeout(() => {
        setGenerateQuizSuccess((prev) => {
          const next = { ...prev };
          delete next[video.id];
          return next;
        });
      }, 3000);
      if (quizVideoId === video.id) {
        await loadQuizQuestions(video.id);
      }
      void loadProduction();
    } catch {
      setGenerateQuizError((prev) => ({
        ...prev,
        [video.id]: "Erreur réseau",
      }));
    } finally {
      setGenerateQuizLoadingId(null);
    }
  }

  async function handleVideoCollaborateurChange(videoId: string, raw: string): Promise<void> {
    const collaborateurId = raw === "" ? null : raw;
    setCollaborateurSavingId(videoId);
    setCollaborateurError((prev) => {
      const next = { ...prev };
      delete next[videoId];
      return next;
    });
    try {
      const r = await fetch("/api/admin/videos", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: videoId, collaborateur_id: collaborateurId }),
      });
      const j = (await r.json()) as { video?: VideoRow; error?: string };
      if (!r.ok) {
        setCollaborateurError((prev) => ({
          ...prev,
          [videoId]: j.error ?? "Erreur enregistrement",
        }));
        return;
      }
      const savedId = j.video?.collaborateur_id ?? collaborateurId;
      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? { ...v, collaborateur_id: savedId } : v)),
      );
    } catch {
      setCollaborateurError((prev) => ({
        ...prev,
        [videoId]: "Erreur réseau",
      }));
    } finally {
      setCollaborateurSavingId(null);
    }
  }

  async function saveMember(id: string): Promise<void> {
    const m = members.find((x) => x.id === id);
    const d = memberDrafts[id] ?? (m ? defaultMemberDraft(m) : null);
    if (!m || !d || !memberRowDirty(m, d)) return;
    const numeroTrim = d.numero_membre.trim();
    const numParsed = Number(numeroTrim);
    const isNumeroOneToTen =
      numeroTrim !== "" &&
      Number.isFinite(numParsed) &&
      Number.isInteger(numParsed) &&
      numParsed >= 1 &&
      numParsed <= 10;
    if (isNumeroOneToTen && d.member_type !== "pionnier") {
      setMembersError("Les numéros 1-10 sont réservés aux Pionniers");
      return;
    }
    const numeroPayload: number | null =
      numeroTrim === "" ? null : parseInt(numeroTrim, 10);
    if (
      numeroTrim !== "" &&
      (Number.isNaN(numeroPayload) || !Number.isInteger(Number(numeroTrim)))
    ) {
      setMembersError("Numéro membre invalide (entier attendu)");
      return;
    }
    setSavingMemberId(id);
    setMembersError(null);
    try {
      const patchBody: Record<string, unknown> = {
        id,
        member_type: d.member_type.toLowerCase(),
        multiplier: d.multiplier,
        numero_membre: numeroPayload,
      };
      if (d.member_type === "collaborateur") {
        patchBody.categorie = d.categorie.trim() || null;
        patchBody.icone = d.icone.trim() || null;
      }
      const r = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(patchBody),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setMembersError(j.error ?? "Échec enregistrement");
        return;
      }
      setEditingMemberId(null);
      await loadMembers();
    } catch (e) {
      setMembersError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSavingMemberId(null);
    }
  }

  if (!hydrated) {
    return (
      <div
        className={fonts}
        style={{
          minHeight: "100vh",
          background: BG,
          color: TEXT,
          fontFamily: "var(--font-dm), system-ui, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ opacity: 0.65 }}>Chargement…</p>
      </div>
    );
  }

  const collaboratorMembers = members.filter(
    (m) => memberTypeToForm(m.member_type) === "collaborateur",
  );

  return (
    <div
      className={`${fonts} leve-admin-root`}
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT,
        fontFamily: "var(--font-dm), system-ui, sans-serif",
        paddingBottom: "4rem",
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .leve-admin-root input:not([type="checkbox"]):not([type="radio"]):focus,
            .leve-admin-root select:focus,
            .leve-admin-root textarea:focus {
              outline: none;
              border-color: ${GOLD} !important;
            }
            .leve-admin-table tbody tr:nth-child(odd) {
              background: ${G2};
            }
            .leve-admin-table tbody tr:nth-child(even) {
              background: ${G3};
            }
            .leve-admin-table tbody tr:hover {
              background: ${G3};
            }
            .leve-admin-root button {
              min-height: 44px;
            }
            .leve-admin-root input:not([type="checkbox"]):not([type="radio"]),
            .leve-admin-root select,
            .leve-admin-root textarea {
              min-height: 44px;
              font-size: 16px;
            }
            .leve-admin-root input[type="checkbox"],
            .leve-admin-root input[type="radio"] {
              min-height: unset;
              font-size: inherit;
            }
            .leve-admin-root div:has(> .leve-admin-table) {
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }
            .leve-admin-table {
              font-size: max(12px, 0.85rem);
            }
            .admin-global-stats-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 0.85rem;
            }
            @media (min-width: 768px) {
              .admin-global-stats-grid {
                grid-template-columns: repeat(3, minmax(0, 1fr));
              }
            }
            @media (min-width: 1024px) {
              .admin-global-stats-grid {
                grid-template-columns: repeat(4, minmax(0, 1fr));
              }
            }
            .admin-section-nav {
              display: none;
            }
            .leve-admin-root [id^="section-"] {
              scroll-margin-top: ${ADMIN_SECTION_SCROLL_OFFSET}px;
            }
            @media (max-width: 767px) {
              .admin-section-nav {
                display: flex;
                position: sticky;
                top: 4.25rem;
                z-index: 25;
                gap: 0.45rem;
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
                padding: 0.65rem 0 1rem;
                margin: -0.5rem 0 0.75rem;
                background: linear-gradient(180deg, ${BG} 70%, transparent);
                scrollbar-width: none;
              }
              .admin-section-nav::-webkit-scrollbar {
                display: none;
              }
              .admin-section-nav a {
                flex-shrink: 0;
                padding: 0.45rem 0.75rem;
                min-height: 44px;
                display: inline-flex;
                align-items: center;
                border-radius: 4px;
                border: 1px solid rgba(212, 160, 23, 0.35);
                background: rgba(212, 160, 23, 0.08);
                color: ${GOLD};
                font-size: max(12px, 0.78rem);
                letter-spacing: 0.06em;
                text-transform: uppercase;
                text-decoration: none;
                font-weight: 600;
                white-space: nowrap;
              }
              .admin-section-nav a:hover {
                background: rgba(212, 160, 23, 0.16);
              }
            }
          `,
        }}
      />
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 1.35rem",
          borderBottom: "1px solid rgba(245, 240, 232, 0.08)",
          position: "sticky",
          top: 0,
          background: "rgba(8, 8, 8, 0.94)",
          backdropFilter: "blur(10px)",
          zIndex: 30,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "2rem",
              letterSpacing: "0.14em",
              color: TEXT,
              textDecoration: "none",
            }}
          >
            LEVE
          </Link>
          {authed ? (
            <span
              style={{
                fontSize: "0.72rem",
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: GOLD,
                opacity: 0.95,
              }}
            >
              Admin
            </span>
          ) : null}
        </div>
        {authed ? (
          <button
            type="button"
            onClick={handleLogout}
            style={{
              ...btnOutline,
              padding: "0.45rem 1rem",
              fontSize: "0.8rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Déconnexion
          </button>
        ) : null}
      </header>

      {!authed ? (
        <main
          style={{
            maxWidth: "420px",
            margin: "4rem auto",
            padding: "0 1rem",
          }}
        >
          <div style={cardStyle()}>
            <h1
              style={{
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "2.75rem",
                letterSpacing: "0.12em",
                margin: "0 0 0.35rem",
                color: TEXT,
              }}
            >
              Accès admin
            </h1>
            <p style={{ opacity: 0.72, margin: "0 0 1.5rem", fontSize: "0.95rem" }}>
              Saisissez la clé secrète pour gérer les vidéos, la redistribution et les membres.
            </p>
            <form onSubmit={(ev) => void handleLogin(ev)}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.72rem",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  opacity: 0.55,
                  marginBottom: "0.45rem",
                }}
              >
                Clé administrateur
              </label>
              <input
                type="password"
                autoComplete="off"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "0.85rem 1rem",
                  background: "rgba(245, 240, 232, 0.06)",
                  border: "1px solid rgba(245, 240, 232, 0.14)",
                  borderRadius: "4px",
                  color: TEXT,
                  fontSize: "1rem",
                  marginBottom: "1rem",
                }}
              />
              {authError ? (
                <p style={{ color: ROUGE, fontSize: "0.88rem", margin: "0 0 1rem" }}>{authError}</p>
              ) : null}
              <button
                type="submit"
                disabled={loginLoading || !secretInput.trim()}
                style={{
                  width: "100%",
                  background: GOLD,
                  color: "#000000",
                  border: `1px solid ${GOLD}`,
                  padding: "0.95rem",
                  cursor: loginLoading || !secretInput.trim() ? "not-allowed" : "pointer",
                  opacity: loginLoading || !secretInput.trim() ? 0.55 : 1,
                  fontSize: "0.85rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {loginLoading ? "Vérification…" : "Entrer"}
              </button>
            </form>
          </div>
        </main>
      ) : (
        <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.25rem", position: "relative" }}>
          {codeModifyConfirmVideoId ? (
            <div
              role="presentation"
              onClick={() => closeCodeModifyModal()}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 200,
                background: "rgba(0, 0, 0, 0.72)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "1.25rem",
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="modify-code-confirm-title"
                onClick={(e) => e.stopPropagation()}
                style={{
                  maxWidth: "28rem",
                  width: "100%",
                  background: "#121212",
                  border: "1px solid rgba(245, 240, 232, 0.18)",
                  borderRadius: "4px",
                  padding: "1.35rem 1.5rem",
                }}
              >
                <h2
                  id="modify-code-confirm-title"
                  style={{
                    fontFamily: "var(--font-bebas), Impact, sans-serif",
                    fontSize: "1.25rem",
                    letterSpacing: "0.1em",
                    margin: "0 0 0.85rem",
                    color: GOLD,
                  }}
                >
                  {codeModifyStep === 1 ? "Modifier le code" : "Clé administrateur"}
                </h2>
                {codeModifyStep === 1 ? (
                  <p style={{ margin: "0 0 1.35rem", fontSize: "0.92rem", lineHeight: 1.55, opacity: 0.92 }}>
                    Attention — modifier ce code supprimera l&apos;ancien de toutes les bases de données et
                    invalidera les soumissions existantes. Confirmer ?
                  </p>
                ) : (
                  <div style={{ margin: "0 0 1.35rem",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                    <label
                      htmlFor="modify-code-reentry-key"
                      style={{
                        display: "block",
                        fontSize: "0.72rem",
                        letterSpacing: "0.2em",
                        textTransform: "uppercase",
                        opacity: 0.55,
                        marginBottom: "0.45rem",
                      }}
                    >
                      Clé administrateur
                    </label>
                    <input
                      id="modify-code-reentry-key"
                      type="password"
                      autoComplete="off"
                      value={codeModifyReentryKey}
                      onChange={(e) => setCodeModifyReentryKey(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && codeModifyReentryKey.trim()) {
                          e.preventDefault();
                          handleCodeModifyConfirmKeyStep();
                        }
                      }}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.75rem 0.85rem",
                        background: "rgba(245, 240, 232, 0.06)",
                        border: "1px solid rgba(245, 240, 232, 0.14)",
                        borderRadius: "4px",
                        color: TEXT,
                        fontSize: "0.92rem",
                      }}
                    />
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => closeCodeModifyModal()}
                    style={{
                      background: "transparent",
                      color: TEXT,
                      border: "1px solid rgba(245, 240, 232, 0.25)",
                      padding: "0.5rem 1rem",
                      cursor: "pointer",
                      fontSize: "0.78rem",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    Annuler
                  </button>
                  {codeModifyStep === 1 ? (
                    <button
                      type="button"
                      onClick={() => setCodeModifyStep(2)}
                      style={{
                        background: GOLD,
                        color: "#000000",
                        border: `1px solid ${GOLD}`,
                        padding: "0.5rem 1rem",
                        cursor: "pointer",
                        fontSize: "0.78rem",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                      }}
                    >
                      Confirmer
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        codeLoadingId === codeModifyConfirmVideoId || !codeModifyReentryKey.trim()
                      }
                      onClick={() => handleCodeModifyConfirmKeyStep()}
                      style={{
                        background: GOLD,
                        color: "#000000",
                        border: `1px solid ${GOLD}`,
                        padding: "0.5rem 1rem",
                        cursor:
                          codeLoadingId === codeModifyConfirmVideoId || !codeModifyReentryKey.trim()
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          codeLoadingId === codeModifyConfirmVideoId || !codeModifyReentryKey.trim()
                            ? 0.55
                            : 1,
                        fontSize: "0.78rem",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                      }}
                    >
                      {codeLoadingId === codeModifyConfirmVideoId ? "…" : "Confirmer"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
          <section id="section-stats" style={{ ...cardStyle(), marginBottom: "1.75rem" }}>
            {sectionTitle("STATISTIQUES GLOBALES")}
            {globalStatsError ? (
              <p style={{ color: ROUGE, margin: "0 0 0.85rem", fontSize: "0.9rem" }}>{globalStatsError}</p>
            ) : null}
            <div className="admin-global-stats-grid">
              <GlobalStatCard
                title="Membres actifs"
                value={intFmt.format(globalStats?.membres_actifs ?? 0)}
                accent={GOLD}
                loading={globalStatsLoading && !globalStats}
              />
              <GlobalStatCard
                title="Pts pondérés (mois)"
                value={pointsFmt.format(globalStats?.pts_ponderes_mois ?? 0)}
                accent={VERT}
                loading={globalStatsLoading && !globalStats}
              />
              <GlobalStatCard
                title="Quiz complétés (mois)"
                value={intFmt.format(globalStats?.quiz_mois ?? 0)}
                accent={BLEU}
                loading={globalStatsLoading && !globalStats}
              />
              <GlobalStatCard
                title="Codes soumis (mois)"
                value={intFmt.format(globalStats?.codes_mois ?? 0)}
                accent={ROUGE}
                loading={globalStatsLoading && !globalStats}
              />
              <GlobalStatCard
                title="Revenus redistribués"
                value={cad.format(globalStats?.revenus_redistribues ?? 0)}
                accent={GOLD}
                loading={globalStatsLoading && !globalStats}
              />
              <GlobalStatCard
                title="Pool PMQ"
                value={cad.format(globalStats?.pool_pmq ?? 0)}
                accent={ROUGE}
                loading={globalStatsLoading && !globalStats}
              />
              <GlobalStatCard
                title="Pool PTC"
                value={cad.format(globalStats?.pool_ptc ?? 0)}
                accent={VIOLET}
                loading={globalStatsLoading && !globalStats}
              />
            </div>
          </section>

          <nav className="admin-section-nav" aria-label="Sections admin">
            {ADMIN_SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(ev) => scrollToAdminSection(s.id, ev)}
              >
                {s.label}
              </a>
            ))}
          </nav>
          {/* GÉNÉRATEUR DE CODES */}
          <section id="section-codes" style={cardStyle()}>
            {sectionTitle("GÉNÉRATEUR DE CODES")}
            <p style={{ margin: "0 0 1rem", opacity: 0.72, fontSize: "0.9rem", maxWidth: "42rem" }}>
              Générez un code unique vérifié en base (non lié à une vidéo). Vous pouvez ensuite le coller dans le champ
              « Associer le code » pour la vidéo concernée.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
              <button
                type="button"
                disabled={standaloneGenLoading}
                onClick={() => void generateStandaloneCode()}
                style={{
                  background: "rgba(212, 160, 23, 0.12)",
                  color: GOLD,
                  border: `1px solid rgba(212, 160, 23, 0.35)`,
                  padding: "0.55rem 1rem",
                  cursor: standaloneGenLoading ? "wait" : "pointer",
                  fontSize: "0.75rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {standaloneGenLoading ? "…" : "Générer un code"}
              </button>
              {standaloneGeneratedCode ? (
                <>
                  <span
                    style={{
                      fontFamily: "var(--font-mono), ui-monospace, monospace",
                      fontSize: "1rem",
                      letterSpacing: "0.06em",
                      padding: "0.45rem 0.75rem",
                      background: "rgba(245, 240, 232, 0.06)",
                      borderRadius: "4px",
                      border: "1px solid rgba(245, 240, 232, 0.12)",
                    }}
                  >
                    {standaloneGeneratedCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyStandaloneCode()}
                    style={{
                      background: GOLD,
                      color: "#000000",
                      border: `1px solid ${GOLD}`,
                      padding: "0.5rem 0.95rem",
                      cursor: "pointer",
                      fontSize: "0.72rem",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                      borderRadius: "4px",
                    }}
                  >
                    {standaloneGenCopied ? "Copié" : "Copier"}
                  </button>
                </>
              ) : null}
            </div>
            {standaloneGenError ? (
              <p style={{ margin: "0.85rem 0 0", fontSize: "0.85rem", color: ROUGE, opacity: 0.95 }}>
                {standaloneGenError}
              </p>
            ) : null}
          </section>

          {/* SECTION VIDÉOS */}
          <section id="section-videos" style={cardStyle()}>
            {sectionTitle("VIDÉOS")}
            {videosLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement des vidéos…</p>
            ) : (
              <div style={{ overflowX: "auto",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                <table className="leve-admin-table"
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.9rem",
                  }}
                >
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                      <th style={{ padding: "0.65rem 0.5rem", letterSpacing: "0.08em", fontSize: "0.68rem", textTransform: "uppercase", opacity: 0.55 }}>
                        Titre
                      </th>
                      <th style={{ padding: "0.65rem 0.5rem", letterSpacing: "0.08em", fontSize: "0.68rem", textTransform: "uppercase", opacity: 0.55 }}>
                        YouTube
                      </th>
                      <th style={{ padding: "0.65rem 0.5rem", letterSpacing: "0.08em", fontSize: "0.68rem", textTransform: "uppercase", opacity: 0.55 }}>
                        Points
                      </th>
                      <th style={{ padding: "0.65rem 0.5rem", letterSpacing: "0.08em", fontSize: "0.68rem", textTransform: "uppercase", opacity: 0.55 }}>
                        Collaborateur
                      </th>
                      <th style={{ padding: "0.65rem 0.5rem", letterSpacing: "0.08em", fontSize: "0.68rem", textTransform: "uppercase", opacity: 0.55 }}>
                        Code
                      </th>
                      <th style={{ padding: "0.65rem 0.5rem", letterSpacing: "0.08em", fontSize: "0.68rem", textTransform: "uppercase", opacity: 0.55 }}>
                        Quiz
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {videos.map((v) => {
                      const linked = linkedVideoCodes[v.id];
                      const busy = codeLoadingId === v.id;
                      const quizBusy = generateQuizLoadingId === v.id;
                      const collabBusy = collaborateurSavingId === v.id;
                      const collabValue = v.collaborateur_id ?? "";
                      const collabOptions =
                        collabValue &&
                        !collaboratorMembers.some((m) => m.id === collabValue)
                          ? [
                              ...collaboratorMembers,
                              ...members.filter((m) => m.id === collabValue),
                            ]
                          : collaboratorMembers;
                      return (
                        <tr key={v.id} style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                          <td style={{ padding: "0.75rem 0.5rem", maxWidth: "280px" }}>{v.title ?? "—"}</td>
                          <td style={{ padding: "0.75rem 0.5rem", fontFamily: "var(--font-mono), ui-monospace, monospace", fontSize: "0.82rem" }}>
                            {v.youtube_id}
                          </td>
                          <td style={{ padding: "0.75rem 0.5rem" }}>{v.points_value ?? "—"}</td>
                          <td style={{ padding: "0.75rem 0.5rem", verticalAlign: "top", minWidth: "180px" }}>
                            <select
                              value={collabValue}
                              disabled={collabBusy || membersLoading}
                              onChange={(e) => void handleVideoCollaborateurChange(v.id, e.target.value)}
                              aria-label={`Collaborateur pour ${v.title ?? v.youtube_id}`}
                              style={{
                                width: "100%",
                                minWidth: "160px",
                                padding: "0.45rem 0.55rem",
                                fontSize: "0.82rem",
                                background: "rgba(245, 240, 232, 0.06)",
                                border: "1px solid rgba(245, 240, 232, 0.14)",
                                borderRadius: "4px",
                                color: TEXT,
                                cursor: collabBusy || membersLoading ? "wait" : "pointer",
                              }}
                            >
                              <option value="">Aucun</option>
                              {collabOptions.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {memberDisplayLabel(m)}
                                </option>
                              ))}
                            </select>
                            {collaborateurError[v.id] ? (
                              <p
                                style={{
                                  margin: "0.5rem 0 0",
                                  fontSize: "0.78rem",
                                  color: ROUGE,
                                  opacity: 0.95,
                                }}
                              >
                                {collaborateurError[v.id]}
                              </p>
                            ) : null}
                          </td>
                          <td style={{ padding: "0.75rem 0.5rem", verticalAlign: "top", minWidth: "240px" }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center" }}>
                              <input
                                type="text"
                                value={linked ?? (codeInputByVideo[v.id] ?? "")}
                                readOnly={!!linked}
                                onChange={(e) => {
                                  if (linked) return;
                                  setCodeInputByVideo((prev) => ({
                                    ...prev,
                                    [v.id]: e.target.value,
                                  }));
                                  setCodeAssociateError((prev) => {
                                    const n = { ...prev };
                                    delete n[v.id];
                                    return n;
                                  });
                                }}
                                placeholder="XXXX-YYYY-ZZZZ"
                                autoComplete="off"
                                spellCheck={false}
                                aria-label={`Code pour ${v.title ?? v.youtube_id}`}
                                disabled={busy}
                                style={{
                                  flex: "1 1 140px",
                                  minWidth: "120px",
                                  padding: "0.45rem 0.55rem",
                                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                                  fontSize: "0.8rem",
                                  background: linked ? "rgba(245, 240, 232, 0.04)" : "rgba(245, 240, 232, 0.06)",
                                  border: "1px solid rgba(245, 240, 232, 0.14)",
                                  borderRadius: "4px",
                                  color: TEXT,
                                  opacity: linked ? 0.92 : 1,
                                  cursor: linked ? "default" : "text",
                                }}
                              />
                              {linked ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setCodeModifyStep(1);
                                    setCodeModifyReentryKey("");
                                    setCodeModifyConfirmVideoId(v.id);
                                  }}
                                  style={{
                                    background: "rgba(192, 57, 43, 0.15)",
                                    color: ROUGE,
                                    border: `1px solid rgba(192, 57, 43, 0.4)`,
                                    padding: "0.45rem 0.65rem",
                                    cursor: busy ? "wait" : "pointer",
                                    fontSize: "0.68rem",
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {busy ? "…" : "Modifier le code"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void associateCodeToVideo(v.id)}
                                  style={{
                                    background: "rgba(212, 160, 23, 0.12)",
                                    color: GOLD,
                                    border: `1px solid rgba(212, 160, 23, 0.35)`,
                                    padding: "0.45rem 0.65rem",
                                    cursor: busy ? "wait" : "pointer",
                                    fontSize: "0.68rem",
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {busy ? "…" : "Associer le code"}
                                </button>
                              )}
                            </div>
                            {codeAssociateError[v.id] ? (
                              <p
                                style={{
                                  margin: "0.5rem 0 0",
                                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                                  fontSize: "0.78rem",
                                  color: ROUGE,
                                  opacity: 0.95,
                                }}
                              >
                                {codeAssociateError[v.id]}
                              </p>
                            ) : null}
                          </td>
                          <td style={{ padding: "0.75rem 0.5rem", verticalAlign: "top", minWidth: "180px",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                            <button
                              type="button"
                              disabled={quizBusy}
                              onClick={() => void handleGenerateQuiz(v)}
                              style={{
                                background: "rgba(212, 160, 23, 0.12)",
                                color: GOLD,
                                border: `1px solid rgba(212, 160, 23, 0.35)`,
                                padding: "0.45rem 0.65rem",
                                cursor: quizBusy ? "wait" : "pointer",
                                fontSize: "0.68rem",
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {quizBusy ? "⏳ Génération en cours..." : "Générer quiz automatique"}
                            </button>
                            {generateQuizSuccess[v.id] !== undefined ? (
                              <p
                                style={{
                                  margin: "0.5rem 0 0",
                                  fontSize: "0.78rem",
                                  color: "#2ECC71",
                                  opacity: 0.95,
                                }}
                              >
                                {`✅ ${generateQuizSuccess[v.id]} questions générées avec succès`}
                              </p>
                            ) : null}
                            {generateQuizError[v.id] ? (
                              <p
                                style={{
                                  margin: "0.5rem 0 0",
                                  fontSize: "0.78rem",
                                  color: ROUGE,
                                  opacity: 0.95,
                                }}
                              >
                                {`❌ Erreur : ${generateQuizError[v.id]}`}
                              </p>
                            ) : null}
                            {quizInfoByVideo[v.id] ? (
                              <p
                                style={{
                                  margin: "0.5rem 0 0",
                                  fontSize: "0.78rem",
                                  color: GOLD,
                                  opacity: 0.95,
                                }}
                              >
                                {`Quiz dispo: ${quizInfoByVideo[v.id]!.available ? "Oui" : "Non"} · Questions: ${quizInfoByVideo[v.id]!.count}`}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {videos.length === 0 ? <p style={{ opacity: 0.6, marginTop: "1rem" }}>Aucune vidéo.</p> : null}
              </div>
            )}

            <div
              style={{
                marginTop: "2rem",
                paddingTop: "1.5rem",
                borderTop: "1px solid rgba(245, 240, 232, 0.08)",
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  letterSpacing: "0.12em",
                  fontSize: "1.35rem",
                  margin: "0 0 1rem",
                  opacity: 0.9,
                }}
              >
                Nouvelle vidéo
              </h3>
              <form
                onSubmit={(ev) => void handleAddVideo(ev)}
                style={{
                  display: "grid",
                  gap: "1rem",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  alignItems: "end",
                }}
              >
                <div>
                  <label style={labelSm}>ID YouTube</label>
                  <input
                    value={newYoutube}
                    onChange={(e) => setNewYoutube(e.target.value)}
                    placeholder="dQw4w9WgXcQ"
                    style={inputBase}
                  />
                </div>
                <div>
                  <label style={labelSm}>Titre</label>
                  <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Titre affiché" style={inputBase} />
                </div>
                <div>
                  <label style={labelSm}>Points</label>
                  <select
                    value={newPoints}
                    onChange={(e) => setNewPoints(Number(e.target.value) as 15 | 25 | 30)}
                    style={{ ...inputBase, cursor: "pointer" }}
                  >
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={30}>30</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={addVideoLoading}
                  style={{
                    background: GOLD,
                    color: "#000000",
                    border: `1px solid ${GOLD}`,
                    padding: "0.75rem 1.25rem",
                    cursor: addVideoLoading ? "wait" : "pointer",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontSize: "0.72rem",
                    height: "fit-content",
                  }}
                >
                  {addVideoLoading ? "…" : "Ajouter"}
                </button>
              </form>
              {addVideoMsg ? (
                <p style={{ marginTop: "0.85rem", fontSize: "0.88rem", opacity: 0.85 }}>{addVideoMsg}</p>
              ) : null}
            </div>
          </section>

          {/* SECTION GESTION DES QUIZ */}
          <section id="section-quiz" style={cardStyle()}>
            {sectionTitle("GESTION DES QUIZ")}
            <div style={{ maxWidth: "520px", marginBottom: "1.5rem" }}>
              <label style={labelSm}>Vidéo</label>
              <select
                value={quizVideoId}
                onChange={(e) => {
                  setQuizVideoId(e.target.value);
                  setQuizAddMsg(null);
                }}
                style={{ ...inputBase, cursor: "pointer" }}
                aria-label="Vidéo pour le quiz"
              >
                <option value="">— Choisir une vidéo —</option>
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {(v.title ?? "Sans titre").slice(0, 80)}
                    {v.title && v.title.length > 80 ? "…" : ""} ({v.youtube_id})
                  </option>
                ))}
              </select>
            </div>
            {quizQuestionsError ? (
              <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{quizQuestionsError}</p>
            ) : null}
            {!quizVideoId ? (
              <p style={{ opacity: 0.65, margin: 0 }}>Sélectionnez une vidéo pour afficher et modifier les questions.</p>
            ) : quizQuestionsLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement des questions…</p>
            ) : (
              <div style={{ overflowX: "auto",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                <table className="leve-admin-table"
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.85rem",
                  }}
                >
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                      {["Question", "A", "B", "C", "D", "Bonne réponse", ""].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "0.65rem 0.5rem",
                            letterSpacing: "0.08em",
                            fontSize: "0.65rem",
                            textTransform: "uppercase",
                            opacity: 0.55,
                            minWidth: h === "Question" ? "10rem" : h === "" ? "5rem" : "4rem",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {quizQuestions.map((q) => {
                      const choix = quizChoix(q);
                      return (
                      <tr key={q.id} style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                        <td style={{ padding: "0.65rem 0.5rem", verticalAlign: "top", maxWidth: "220px" }}>{q.question}</td>
                        <td style={{ padding: "0.65rem 0.5rem", verticalAlign: "top", opacity: 0.92 }}>{choix[0] || "—"}</td>
                        <td style={{ padding: "0.65rem 0.5rem", verticalAlign: "top", opacity: 0.92 }}>{choix[1] || "—"}</td>
                        <td style={{ padding: "0.65rem 0.5rem", verticalAlign: "top", opacity: 0.92 }}>{choix[2] || "—"}</td>
                        <td style={{ padding: "0.65rem 0.5rem", verticalAlign: "top", opacity: 0.92 }}>{choix[3] || "—"}</td>
                        <td style={{ padding: "0.65rem 0.5rem", verticalAlign: "top", color: GOLD, fontSize: "0.8rem" }}>
                          {formatQuizCorrectDisplay(q)}
                        </td>
                        <td style={{ padding: "0.65rem 0.5rem", verticalAlign: "top" }}>
                          <button
                            type="button"
                            disabled={quizDeleteId === q.id}
                            onClick={() => void handleDeleteQuizQuestion(q.id)}
                            style={{
                              background: "transparent",
                              color: ROUGE,
                              border: `1px solid rgba(192, 57, 43, 0.45)`,
                              padding: "0.4rem 0.65rem",
                              cursor: quizDeleteId === q.id ? "wait" : "pointer",
                              fontSize: "0.68rem",
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                            }}
                          >
                            {quizDeleteId === q.id ? "…" : "Supprimer"}
                          </button>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
                {quizQuestions.length === 0 ? (
                  <p style={{ opacity: 0.6, marginTop: "1rem" }}>Aucune question pour cette vidéo.</p>
                ) : null}
              </div>
            )}

            <div
              style={{
                marginTop: "2rem",
                paddingTop: "1.5rem",
                borderTop: "1px solid rgba(245, 240, 232, 0.08)",
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  letterSpacing: "0.12em",
                  fontSize: "1.35rem",
                  margin: "0 0 1rem",
                  opacity: 0.9,
                }}
              >
                Nouvelle question
              </h3>
              <form onSubmit={(ev) => void handleAddQuizQuestion(ev)}>
                <label style={{ ...labelSm, marginBottom: "0.5rem" }}>Question</label>
                <textarea
                  value={newQuizQ}
                  onChange={(e) => setNewQuizQ(e.target.value)}
                  placeholder="Texte de la question"
                  rows={3}
                  style={{
                    ...inputBase,
                    resize: "vertical",
                    minHeight: "4.5rem",
                    marginBottom: "1rem",
                    display: "block",
                  }}
                />
                <div
                  style={{
                    display: "grid",
                    gap: "1rem",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    alignItems: "end",
                    marginBottom: "1rem",
                  }}
                >
                  <div>
                    <label style={labelSm}>Option A</label>
                    <input value={newQuizA} onChange={(e) => setNewQuizA(e.target.value)} style={inputBase} />
                  </div>
                  <div>
                    <label style={labelSm}>Option B</label>
                    <input value={newQuizB} onChange={(e) => setNewQuizB(e.target.value)} style={inputBase} />
                  </div>
                  <div>
                    <label style={labelSm}>Option C</label>
                    <input value={newQuizC} onChange={(e) => setNewQuizC(e.target.value)} style={inputBase} />
                  </div>
                  <div>
                    <label style={labelSm}>Option D</label>
                    <input value={newQuizD} onChange={(e) => setNewQuizD(e.target.value)} style={inputBase} />
                  </div>
                  <div>
                    <label style={labelSm}>Bonne réponse</label>
                    <select
                      value={newQuizCorrect}
                      onChange={(e) => setNewQuizCorrect(e.target.value as QuizCorrectLetter)}
                      style={{ ...inputBase, cursor: "pointer" }}
                      aria-label="Bonne réponse"
                    >
                      <option value="a">A</option>
                      <option value="b">B</option>
                      <option value="c">C</option>
                      <option value="d">D</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={quizAddLoading || !quizVideoId}
                    style={{
                      background: GOLD,
                      color: "#000000",
                      border: `1px solid ${GOLD}`,
                      padding: "0.75rem 1.25rem",
                      cursor: quizAddLoading || !quizVideoId ? "not-allowed" : "pointer",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      fontSize: "0.72rem",
                      height: "fit-content",
                      opacity: !quizVideoId ? 0.5 : 1,
                    }}
                  >
                    {quizAddLoading ? "…" : "Ajouter la question"}
                  </button>
                </div>
              </form>
              {quizAddMsg ? (
                <p style={{ marginTop: "0.85rem", fontSize: "0.88rem", opacity: 0.85 }}>{quizAddMsg}</p>
              ) : null}
            </div>
          </section>

          {/* SECTION REDISTRIBUTION */}
          <section id="section-redistribution" style={cardStyle()}>
            {sectionTitle("REDISTRIBUTION")}
            <form
              onSubmit={(ev) => void handleRedistribution(ev)}
              style={{
                display: "grid",
                gap: "1rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                alignItems: "end",
              }}
            >
              <div>
                <label style={labelSm}>Mois</label>
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={inputBase} />
              </div>
              <div>
                <label style={labelSm}>Revenu total (CAD)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={totalRevenue}
                  onChange={(e) => setTotalRevenue(e.target.value)}
                  placeholder="10000"
                  style={inputBase}
                />
              </div>
              <div>
                <button
                  type="submit"
                  disabled={redistLoading}
                  style={{
                    background: GOLD,
                    color: "#000000",
                    border: `1px solid ${GOLD}`,
                    padding: "0.85rem 1.5rem",
                    cursor: redistLoading ? "wait" : "pointer",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontSize: "0.75rem",
                    width: "100%",
                  }}
                >
                  {redistLoading ? "Traitement…" : "Déclencher la redistribution"}
                </button>
              </div>
            </form>
            {redistError ? <p style={{ color: ROUGE, marginTop: "1rem", fontSize: "0.9rem" }}>{redistError}</p> : null}
            {redistResult ? (
              <div
                style={{
                  marginTop: "1.5rem",
                  padding: "1.25rem",
                  borderRadius: "4px",
                  background: "rgba(212, 160, 23, 0.06)",
                  border: `1px solid rgba(212, 160, 23, 0.22)`,
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
              >
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.72rem", letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.55 }}>
                  Résultat
                </p>
                <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.9 }}>
                  <li>
                    <strong style={{ color: GOLD }}>pmq_pool</strong> : {cad.format(redistResult.pmq_pool)}
                  </li>
                  <li>
                    <strong style={{ color: GOLD }}>value_per_point</strong> :{" "}
                    {redistResult.value_per_point != null ? cad.format(redistResult.value_per_point) : "—"}
                  </li>
                  <li>
                    <strong style={{ color: GOLD }}>total_distributed</strong> :{" "}
                    {cad.format(redistResult.total_distributed)}
                  </li>
                </ul>
              </div>
            ) : null}
          </section>

          {/* CARTE DES MEMBRES */}
          <section id="section-map" style={cardStyle()}>
            {sectionTitle("CARTE DES MEMBRES")}
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.92rem", opacity: 0.72, lineHeight: 1.55 }}>
              Répartition géographique des membres (métadonnées auth.users ou domaine courriel). Vue
              synthétique par pays — le détail complet est dans le tableau ci-dessous.
            </p>
            {memberMapError ? (
              <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{memberMapError}</p>
            ) : null}
            {memberMapLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement de la carte…</p>
            ) : memberMapCountries.length === 0 ? (
              <p style={{ opacity: 0.6 }}>Aucun membre trouvé.</p>
            ) : (
              <>
                <p style={{ margin: "0 0 1rem", fontSize: "1.05rem" }}>
                  Total :{" "}
                  <strong style={{ color: GOLD, fontSize: "1.3rem" }}>{memberMapTotal}</strong> membre
                  {memberMapTotal !== 1 ? "s" : ""} ·{" "}
                  <strong style={{ color: GOLD }}>{memberMapCountries.length}</strong> pays / zones
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: "0.65rem",
                    marginBottom: "1.35rem",
                    padding: "1rem",
                    borderRadius: "4px",
                    background: "rgba(212, 160, 23, 0.04)",
                    border: "1px solid rgba(212, 160, 23, 0.15)",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                >
                  {memberMapCountries.slice(0, 12).map((row) => {
                    const max = memberMapCountries[0]?.count ?? 1;
                    const intensity = 0.35 + (row.count / max) * 0.65;
                    return (
                      <div
                        key={row.country}
                        title={`${row.country} — ${row.count} membre(s)`}
                        style={{
                          padding: "0.75rem 0.65rem",
                          borderRadius: "4px",
                          background: `rgba(192, 57, 43, ${intensity * 0.35})`,
                          border: `1px solid rgba(212, 160, 23, ${intensity * 0.45})`,
                          textAlign: "center",
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontFamily: "var(--font-bebas), Impact, sans-serif",
                            fontSize: "1.5rem",
                            letterSpacing: "0.06em",
                            color: GOLD,
                          }}
                        >
                          {row.count}
                        </p>
                        <p style={{ margin: "0.25rem 0 0", fontSize: "0.78rem", opacity: 0.85, lineHeight: 1.3 }}>
                          {row.country}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div style={{ overflowX: "auto",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                  <table className="leve-admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                        {["Pays / zone", "Membres", "%"].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: "0.65rem 0.5rem",
                              letterSpacing: "0.08em",
                              fontSize: "0.65rem",
                              textTransform: "uppercase",
                              opacity: 0.55,
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {memberMapCountries.map((row) => {
                        const pct = memberMapTotal > 0 ? (row.count / memberMapTotal) * 100 : 0;
                        return (
                          <tr key={row.country} style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                            <td style={{ padding: "0.6rem 0.5rem" }}>{row.country}</td>
                            <td style={{ padding: "0.6rem 0.5rem", color: GOLD, fontWeight: 600 }}>{row.count}</td>
                            <td style={{ padding: "0.6rem 0.5rem", opacity: 0.75 }}>
                              {pct.toFixed(1).replace(".", ",")} %
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* ACCUMULATION DES POOLS */}
          <section id="section-pools" style={cardStyle()}>
            {sectionTitle("ACCUMULATION DES POOLS")}
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.92rem", opacity: 0.72, lineHeight: 1.55 }}>
              Évolution mensuelle cumulative des pools PMQ, production, fondation, opérations, PTC et
              PCOL, calculée depuis <code style={{ fontSize: "0.82rem" }}>redistribution_history</code>{" "}
              et comparée aux soldes actuels de <code style={{ fontSize: "0.82rem" }}>banque_leve</code>.
            </p>
            {poolError ? (
              <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{poolError}</p>
            ) : null}
            {poolLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement des pools…</p>
            ) : (
              <>
                {poolCurrent ? (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                        gap: "0.75rem",
                        marginBottom: "1.35rem",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                    >
                      {POOL_SERIES.map((s) => (
                        <div
                          key={s.key}
                          style={{
                            padding: "0.85rem 1rem",
                            borderRadius: "4px",
                            background: "rgba(245, 240, 232, 0.04)",
                            border: `1px solid ${s.color}33`,
                          }}
                        >
                          <p style={{ margin: 0, fontSize: "0.65rem", letterSpacing: "0.14em", opacity: 0.55, textTransform: "uppercase" }}>
                            {s.cardLabel} (actuel)
                          </p>
                          <p style={{ margin: "0.35rem 0 0", color: s.color, fontWeight: 600, fontSize: "0.95rem" }}>
                            {cad.format(poolCurrent[s.key])}
                          </p>
                        </div>
                      ))}
                      <div
                        style={{
                          padding: "0.85rem 1rem",
                          borderRadius: "4px",
                          background: "rgba(245, 240, 232, 0.04)",
                          border: "1px solid rgba(46, 204, 113, 0.35)",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                      >
                        <p style={{ margin: 0, fontSize: "0.65rem", letterSpacing: "0.14em", opacity: 0.55, textTransform: "uppercase" }}>
                          Pool PA (actuel)
                        </p>
                        <p style={{ margin: "0.35rem 0 0", color: "#2ECC71", fontWeight: 600, fontSize: "0.95rem" }}>
                          {cad.format(poolCurrent.pa_balance)}
                        </p>
                      </div>
                      <div
                        style={{
                          padding: "0.85rem 1rem",
                          borderRadius: "4px",
                          background: "rgba(245, 240, 232, 0.04)",
                          border: "1px solid rgba(212, 160, 23, 0.35)",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                      >
                        <p style={{ margin: 0, fontSize: "0.65rem", letterSpacing: "0.14em", opacity: 0.55, textTransform: "uppercase" }}>
                          Frais plateforme (actuel)
                        </p>
                        <p style={{ margin: "0.35rem 0 0", color: GOLD, fontWeight: 600, fontSize: "0.95rem" }}>
                          {cad.format(poolCurrent.frais_plateforme_balance)}
                        </p>
                      </div>
                      <div
                        style={{
                          padding: "0.85rem 1rem",
                          borderRadius: "4px",
                          background: "rgba(245, 240, 232, 0.04)",
                          border: "1px solid rgba(46, 204, 113, 0.35)",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                      >
                        <p style={{ margin: 0, fontSize: "0.65rem", letterSpacing: "0.14em", opacity: 0.55, textTransform: "uppercase" }}>
                          Taxe PA communauté (actuel)
                        </p>
                        <p style={{ margin: "0.35rem 0 0", color: "#2ECC71", fontWeight: 600, fontSize: "0.95rem" }}>
                          {cad.format(poolCurrent.taxe_pa_balance)}
                        </p>
                      </div>
                    </div>
                    {paTaxStats && paTaxStats.total > 0 ? (
                      <div
                        style={{
                          marginBottom: "1.35rem",
                          padding: "1rem 1.15rem",
                          borderRadius: "4px",
                          background: "rgba(46, 204, 113, 0.06)",
                          border: "1px solid rgba(46, 204, 113, 0.22)",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                      >
                        <p
                          style={{
                            margin: "0 0 0.5rem",
                            fontSize: "0.68rem",
                            letterSpacing: "0.16em",
                            textTransform: "uppercase",
                            opacity: 0.55,
                          }}
                        >
                          Taxes 2 % — utilisations PA (cumul)
                        </p>
                        <p style={{ margin: 0, lineHeight: 1.85, fontSize: "0.88rem" }}>
                          Total collecté :{" "}
                          <strong style={{ color: "#2ECC71" }}>{cad.format(paTaxStats.total)}</strong>
                          {" · → Communauté (75 %) : "}
                          <strong style={{ color: "#2ECC71" }}>{cad.format(paTaxStats.communaute)}</strong>
                          {" · → Fonctionnement (25 %) : "}
                          <strong style={{ color: GOLD }}>{cad.format(paTaxStats.fonctionnement)}</strong>
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <PoolAccumulationChart series={poolSeries} />
                {poolSeries.length > 0 ? (
                  <div style={{ overflowX: "auto", marginTop: "1.25rem",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                    <table className="leve-admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                      <thead>
                        <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                          {[
                            "Mois",
                            "PMQ cumul.",
                            "Production cumul.",
                            "Fondation cumul.",
                            "Opérations cumul.",
                            "PTC cumul.",
                            "PCOL cumul.",
                          ].map((h) => (
                              <th
                                key={h}
                                style={{
                                  padding: "0.6rem 0.45rem",
                                  letterSpacing: "0.06em",
                                  fontSize: "0.62rem",
                                  textTransform: "uppercase",
                                  opacity: 0.55,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {[...poolSeries].reverse().map((row) => (
                          <tr key={row.month} style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                            <td style={{ padding: "0.55rem 0.45rem" }}>{formatMonthLabel(row.month)}</td>
                            <td style={{ padding: "0.55rem 0.45rem" }}>{cad.format(row.pmq_balance)}</td>
                            <td style={{ padding: "0.55rem 0.45rem" }}>{cad.format(row.production_balance)}</td>
                            <td style={{ padding: "0.55rem 0.45rem" }}>{cad.format(row.fondation_balance)}</td>
                            <td style={{ padding: "0.55rem 0.45rem" }}>{cad.format(row.operations_balance)}</td>
                            <td style={{ padding: "0.55rem 0.45rem" }}>{cad.format(row.ptc_balance)}</td>
                            <td style={{ padding: "0.55rem 0.45rem" }}>{cad.format(row.pcol_balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            )}
          </section>

          {/* VISIBILITÉ PAGE TRANSPARENCE */}
          <section id="section-transparence-vis" style={cardStyle()}>
            {sectionTitle("VISIBILITÉ PAGE /TRANSPARENCE")}
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.92rem", opacity: 0.72, lineHeight: 1.55 }}>
              Contrôle quels soldes sont affichés sur la page publique{" "}
              <em>Transparence</em> (table <code style={{ fontSize: "0.82rem" }}>transparence_config</code>
              ).
            </p>
            {transparencePoolsError ? (
              <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{transparencePoolsError}</p>
            ) : null}
            {transparencePoolsLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement…</p>
            ) : transparencePools.length === 0 ? (
              <p style={{ opacity: 0.6 }}>
                Aucune config. Exécutez la migration{" "}
                <code style={{ fontSize: "0.82rem" }}>banque_leve_frais_taxe_balance</code>.
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
                {transparencePools.map((pool) => {
                  const busy = togglingTransparencePool === pool.cle;
                  return (
                    <li
                      key={pool.cle}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "1rem",
                        padding: "0.85rem 1rem",
                        borderRadius: "4px",
                        background: "rgba(245, 240, 232, 0.04)",
                        border: "1px solid rgba(245, 240, 232, 0.1)",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                    >
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>{pool.label}</p>
                        <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", opacity: 0.55 }}>
                          {transparenceConfigSectionLabel(pool.cle)}
                        </p>
                      </div>
                      {onOffSwitch({
                        checked: pool.visible,
                        busy,
                        label: `${pool.label} — ${pool.visible ? "visible" : "masqué"}`,
                        onToggle: () => void handleToggleTransparencePool(pool),
                      })}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* TRANSPARENCE AVANCÉE */}
          <section id="section-transparence-adv" style={cardStyle()}>
            {sectionTitle("TRANSPARENCE AVANCÉE")}
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.92rem", opacity: 0.72, lineHeight: 1.55 }}>
              Historique complet des redistributions avec filtres par année et par mois. Total annuel et
              détail mensuel depuis <code style={{ fontSize: "0.82rem" }}>redistribution_history</code>.
              Les taxes 2&nbsp;% sur les utilisations PA alimentent{" "}
              <code style={{ fontSize: "0.82rem" }}>taxe_pa_balance</code> (75&nbsp;%) et{" "}
              <code style={{ fontSize: "0.82rem" }}>frais_plateforme_balance</code> (25&nbsp;%) — visibles
              sur la page publique <em>Transparence</em> si activés ci-dessus.
            </p>
            {paTaxStats && paTaxStats.total > 0 ? (
              <div
                style={{
                  marginBottom: "1.25rem",
                  padding: "0.9rem 1.1rem",
                  borderRadius: "4px",
                  background: "rgba(46, 204, 113, 0.06)",
                  border: "1px solid rgba(46, 204, 113, 0.2)",
                  fontSize: "0.88rem",
                  lineHeight: 1.7,
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
              >
                <strong style={{ color: "#2ECC71" }}>Taxes PA 2 % (cumul)</strong> —{" "}
                {cad.format(paTaxStats.total)} collectées · {cad.format(paTaxStats.communaute)} → taxe PA ·{" "}
                {cad.format(paTaxStats.fonctionnement)} → frais plateforme (part taxe)
                {poolCurrent ? (
                  <>
                    {" "}
                    · soldes : taxe PA{" "}
                    <strong style={{ color: "#2ECC71" }}>{cad.format(poolCurrent.taxe_pa_balance)}</strong>
                    {" "}
                    · frais plateforme{" "}
                    <strong style={{ color: GOLD }}>{cad.format(poolCurrent.frais_plateforme_balance)}</strong>
                  </>
                ) : null}
              </div>
            ) : null}
            <div
              style={{
                display: "grid",
                gap: "1rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                alignItems: "end",
                marginBottom: "1.25rem",
              }}
            >
              <div>
                <label style={labelSm}>Année</label>
                <select
                  value={transparencyYear}
                  onChange={(e) => setTransparencyYear(e.target.value)}
                  style={{ ...inputBase, cursor: "pointer" }}
                >
                  {(transparencyYears.length ? transparencyYears : [transparencyYear]).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div
                style={{ display: "flex", flexDirection: "column" }}
              >
                <label style={labelSm}>Mois (optionnel)</label>
                <input
                  type="month"
                  value={transparencyMonth}
                  onChange={(e) => setTransparencyMonth(e.target.value)}
                  style={inputBase}
                />
              </div>
              <div
                style={{ display: "flex", alignItems: "flex-end",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
              >
                <button
                  type="button"
                  onClick={() => setTransparencyMonth("")}
                  style={{
                    background: "transparent",
                    color: TEXT,
                    border: "1px solid rgba(245, 240, 232, 0.2)",
                    padding: "0.65rem 1rem",
                    cursor: "pointer",
                    fontSize: "0.72rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    width: "100%",
                  }}
                >
                  Tous les mois
                </button>
              </div>
            </div>
            {transparencyError ? (
              <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{transparencyError}</p>
            ) : null}
            {transparencyLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement…</p>
            ) : (
              <>
                {transparencyAnnual && transparencyYear ? (
                  <div
                    style={{
                      marginBottom: "1.25rem",
                      padding: "1.1rem 1.25rem",
                      borderRadius: "4px",
                      background: "rgba(212, 160, 23, 0.06)",
                      border: "1px solid rgba(212, 160, 23, 0.22)",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                  >
                    <p
                      style={{
                        margin: "0 0 0.65rem",
                        fontSize: "0.72rem",
                        letterSpacing: "0.2em",
                        textTransform: "uppercase",
                        opacity: 0.55,
                      }}
                    >
                      Total {transparencyYear}
                    </p>
                    <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.85, fontSize: "0.88rem" }}>
                      <li>
                        Revenu : <strong style={{ color: GOLD }}>{cad.format(transparencyAnnual.total_revenue)}</strong>
                      </li>
                      <li>
                        PMQ : <strong style={{ color: GOLD }}>{cad.format(transparencyAnnual.pmq_pool)}</strong>
                      </li>
                      <li>
                        Production :{" "}
                        <strong style={{ color: GOLD }}>{cad.format(transparencyAnnual.production_pool)}</strong>
                      </li>
                      <li>
                        Fondation :{" "}
                        <strong style={{ color: GOLD }}>{cad.format(transparencyAnnual.fondation_pool)}</strong>
                      </li>
                      <li>
                        Opérations :{" "}
                        <strong style={{ color: GOLD }}>{cad.format(transparencyAnnual.operations_pool)}</strong>
                      </li>
                    </ul>
                  </div>
                ) : null}
                <div style={{ overflowX: "auto",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                  <table className="leve-admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                        {[
                          "Mois",
                          "Revenu",
                          "PMQ",
                          "Production",
                          "Fondation",
                          "Opérations",
                          "$/pt",
                          "Membres",
                        ].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: "0.6rem 0.45rem",
                              letterSpacing: "0.06em",
                              fontSize: "0.62rem",
                              textTransform: "uppercase",
                              opacity: 0.55,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {transparencyRows.map((row) => (
                        <tr key={row.month} style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                          <td style={{ padding: "0.55rem 0.45rem" }}>{formatMonthLabel(row.month)}</td>
                          <td style={{ padding: "0.55rem 0.45rem" }}>{cad.format(row.total_revenue)}</td>
                          <td style={{ padding: "0.55rem 0.45rem" }}>{cad.format(row.pmq_pool)}</td>
                          <td style={{ padding: "0.55rem 0.45rem" }}>{cad.format(row.production_pool)}</td>
                          <td style={{ padding: "0.55rem 0.45rem" }}>{cad.format(row.fondation_pool)}</td>
                          <td style={{ padding: "0.55rem 0.45rem" }}>{cad.format(row.operations_pool)}</td>
                          <td style={{ padding: "0.55rem 0.45rem" }}>
                            {row.value_per_point != null ? cad.format(row.value_per_point) : "—"}
                          </td>
                          <td style={{ padding: "0.55rem 0.45rem" }}>{row.total_members}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {transparencyRows.length === 0 ? (
                    <p style={{ opacity: 0.6, marginTop: "1rem" }}>Aucune redistribution pour cette période.</p>
                  ) : null}
                </div>
              </>
            )}
          </section>

          {/* ÉQUIPE PRODUCTION */}
          <section id="section-production" style={cardStyle()}>
            {sectionTitle("ÉQUIPE PRODUCTION")}
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.92rem", opacity: 0.72, lineHeight: 1.55 }}>
              Vue technique pour la production : codes associés, disponibilité des quiz et volume de
              soumissions par vidéo.
            </p>
            {productionError ? (
              <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{productionError}</p>
            ) : null}
            {productionLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement…</p>
            ) : (
              <div style={{ overflowX: "auto",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                <table className="leve-admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                      {[
                        "Titre",
                        "YouTube",
                        "Points",
                        "Code",
                        "Code associé",
                        "Quiz dispo.",
                        "Questions",
                        "Soumissions",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "0.65rem 0.5rem",
                            letterSpacing: "0.08em",
                            fontSize: "0.65rem",
                            textTransform: "uppercase",
                            opacity: 0.55,
                            whiteSpace: h === "Code" ? "nowrap" : undefined,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {productionVideos.map((v) => (
                      <tr key={v.id} style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                        <td style={{ padding: "0.6rem 0.5rem", minWidth: "10rem" }}>{v.title ?? "—"}</td>
                        <td
                          style={{
                            padding: "0.6rem 0.5rem",
                            fontFamily: "var(--font-mono), ui-monospace, monospace",
                            fontSize: "0.78rem",
                          }}
                        >
                          {v.youtube_id}
                        </td>
                        <td style={{ padding: "0.6rem 0.5rem" }}>{v.points_value ?? "—"}</td>
                        <td
                          style={{
                            padding: "0.6rem 0.5rem",
                            fontFamily: "var(--font-mono), ui-monospace, monospace",
                            fontSize: "0.78rem",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {v.full_code ?? "—"}
                        </td>
                        <td style={{ padding: "0.6rem 0.5rem" }}>{yesNoBadge(v.has_code)}</td>
                        <td style={{ padding: "0.6rem 0.5rem" }}>{yesNoBadge(v.has_quiz)}</td>
                        <td style={{ padding: "0.6rem 0.5rem", textAlign: "center" }}>{v.quiz_question_count}</td>
                        <td style={{ padding: "0.6rem 0.5rem", textAlign: "center", color: GOLD, fontWeight: 600 }}>
                          {v.submission_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {productionVideos.length === 0 ? (
                  <p style={{ opacity: 0.6, marginTop: "1rem" }}>Aucune vidéo.</p>
                ) : null}
              </div>
            )}
          </section>

          {/* SECTION FRAIS DE PLATEFORME */}
          <section id="section-frais" style={cardStyle()}>
            {sectionTitle("FRAIS DE PLATEFORME")}
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.92rem", opacity: 0.72, lineHeight: 1.55 }}>
              Paliers de pourcentage appliqués selon le montant en USD. Le toggle principal active ou
              désactive le calcul côté serveur (feature flag{" "}
              <code style={{ fontSize: "0.82rem" }}>{FRAIS_PLATEFORME_FLAG_NOM}</code>).
            </p>
            {fraisPlateformeError ? (
              <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{fraisPlateformeError}</p>
            ) : null}
            {fraisPlateformeSaveMsg ? (
              <p style={{ color: "#2ECC71", marginBottom: "0.85rem", fontSize: "0.9rem" }}>{fraisPlateformeSaveMsg}</p>
            ) : null}

            {(() => {
              const fraisFlag = featureFlags.find((f) => f.nom === FRAIS_PLATEFORME_FLAG_NOM);
              const flagBusy = togglingFlagNom === FRAIS_PLATEFORME_FLAG_NOM;
              return (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                    padding: "1rem 1.1rem",
                    marginBottom: "1.25rem",
                    borderRadius: "4px",
                    background: "rgba(245, 240, 232, 0.04)",
                    border: "1px solid rgba(245, 240, 232, 0.1)",
                  }}
                >
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: "var(--font-bebas), Impact, sans-serif",
                        fontSize: "1.25rem",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      Frais plateforme (global)
                    </p>
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", opacity: 0.65 }}>
                      {fraisFlag?.description ?? "Active le calcul des frais sur les montants USD"}
                    </p>
                  </div>
                  {fraisFlag ? (
                    onOffSwitch({
                      checked: fraisFlag.actif,
                      busy: flagBusy,
                      label: `${FRAIS_PLATEFORME_FLAG_NOM} — ${fraisFlag.actif ? "activé" : "désactivé"}`,
                      onToggle: () => void handleToggleFeatureFlag(fraisFlag),
                    })
                  ) : (
                    <span style={{ fontSize: "0.85rem", opacity: 0.55 }}>Flag non chargé</span>
                  )}
                </div>
              );
            })()}

            {fraisPlateformeLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement des paliers…</p>
            ) : (
              <>
                <div style={{ overflowX: "auto",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                  <table className="leve-admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                        {["Palier", "Min ($)", "Max ($)", "%", "Actif", ""].map((h, i) => (
                          <th
                            key={`frais-h-${i}`}
                            style={{
                              padding: "0.65rem 0.5rem",
                              letterSpacing: "0.08em",
                              fontSize: "0.65rem",
                              textTransform: "uppercase",
                              opacity: 0.55,
                              minWidth: i === 0 ? "7rem" : i === 4 ? "4rem" : "5.5rem",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fraisPaliers.map((p) => {
                        const d = fraisPalierDrafts[p.id] ?? palierToDraft(p);
                        const dirty = fraisPalierDraftDirty(p, d);
                        return (
                          <tr
                            key={p.id}
                            style={{
                              borderBottom: "1px solid rgba(245,240,232,0.06)",
                              background: dirty ? "rgba(212, 160, 23, 0.06)" : undefined,
                            }}
                          >
                            <td style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>{p.palier_nom}</td>
                            <td style={{ padding: "0.6rem 0.5rem" }}>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={d.palier_min}
                                onChange={(e) =>
                                  setFraisPalierDrafts((prev) => ({
                                    ...prev,
                                    [p.id]: { ...d, palier_min: e.target.value },
                                  }))
                                }
                                aria-label={`${p.palier_nom} — minimum`}
                                style={{ ...inputBase, fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                              />
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem" }}>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={d.palier_max}
                                onChange={(e) =>
                                  setFraisPalierDrafts((prev) => ({
                                    ...prev,
                                    [p.id]: { ...d, palier_max: e.target.value },
                                  }))
                                }
                                placeholder="et plus"
                                aria-label={`${p.palier_nom} — maximum`}
                                style={{ ...inputBase, fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                              />
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem" }}>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step="0.001"
                                value={d.pourcentage}
                                onChange={(e) =>
                                  setFraisPalierDrafts((prev) => ({
                                    ...prev,
                                    [p.id]: { ...d, pourcentage: e.target.value },
                                  }))
                                }
                                aria-label={`${p.palier_nom} — pourcentage`}
                                style={{ ...inputBase, fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                              />
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", textAlign: "center" }}>
                              {onOffSwitch({
                                checked: d.actif,
                                label: `${p.palier_nom} — palier ${d.actif ? "actif" : "inactif"}`,
                                onToggle: () =>
                                  setFraisPalierDrafts((prev) => ({
                                    ...prev,
                                    [p.id]: { ...d, actif: !d.actif },
                                  })),
                              })}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", fontSize: "0.72rem", opacity: 0.45 }}>
                              {dirty ? "modifié" : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {fraisPaliers.length === 0 ? (
                  <p style={{ opacity: 0.6, marginTop: "1rem" }}>
                    Aucun palier. Exécutez la migration{" "}
                    <code style={{ fontSize: "0.82rem" }}>frais_plateforme_config</code>.
                  </p>
                ) : (
                  <div style={{ marginTop: "1.25rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
                    <button
                      type="button"
                      disabled={fraisPlateformeSaving || fraisPaliers.length === 0}
                      onClick={() => void handleSaveFraisPlateforme()}
                      style={{
                        padding: "0.65rem 1.35rem",
                        borderRadius: "4px",
                        background: GOLD,
                        color: "#000000",
                        border: `1px solid ${GOLD}`,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        fontSize: "0.78rem",
                        cursor: fraisPlateformeSaving ? "wait" : "pointer",
                        opacity: fraisPlateformeSaving ? 0.7 : 1,
                      }}
                    >
                      {fraisPlateformeSaving ? "Sauvegarde…" : "Sauvegarder"}
                    </button>
                    <span style={{ fontSize: "0.82rem", opacity: 0.55 }}>
                      Max vide = « et plus » (sans plafond)
                    </span>
                  </div>
                )}
              </>
            )}
          </section>

          {/* SECTION RÉSEAUX SOCIAUX */}
          <section id="section-reseaux" style={cardStyle()}>
            {sectionTitle("RÉSEAUX SOCIAUX")}
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.92rem", opacity: 0.72, lineHeight: 1.55 }}>
              Bandeau « En direct » en haut de la page d&apos;accueil. Activez un réseau et renseignez le
              nombre d&apos;abonnés affiché (table{" "}
              <code style={{ fontSize: "0.82rem" }}>reseaux_sociaux_config</code>).
            </p>
            {reseauxSociauxError ? (
              <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{reseauxSociauxError}</p>
            ) : null}
            {reseauxSociauxSaveMsg ? (
              <p style={{ color: "#2ECC71", marginBottom: "0.85rem", fontSize: "0.9rem" }}>{reseauxSociauxSaveMsg}</p>
            ) : null}
            {reseauxSociauxLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement…</p>
            ) : reseauxSociaux.length === 0 ? (
              <p style={{ opacity: 0.6, margin: 0 }}>
                Aucun réseau. Exécutez la migration{" "}
                <code style={{ fontSize: "0.82rem" }}>reseaux_sociaux_config</code>.
              </p>
            ) : (
              <>
                <div style={{ overflowX: "auto",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                  <table className="leve-admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                        {["Réseau", "Abonnés", "Actif", ""].map((h, i) => (
                          <th
                            key={`${h}-${i}`}
                            style={{
                              padding: "0.65rem 0.5rem",
                              letterSpacing: "0.08em",
                              fontSize: "0.65rem",
                              textTransform: "uppercase",
                              opacity: 0.55,
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reseauxSociaux.map((r) => {
                        const d = reseauxSociauxDrafts[r.id] ?? reseauSocialToDraft(r);
                        const dirty = reseauSocialDraftDirty(r, d);
                        return (
                          <tr
                            key={r.id}
                            style={{
                              borderBottom: "1px solid rgba(245,240,232,0.06)",
                              background: dirty ? "rgba(212, 160, 23, 0.06)" : undefined,
                            }}
                          >
                            <td style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>
                              {RESEAU_SOCIAL_LABELS[r.reseau]}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem" }}>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={d.abonnes}
                                onChange={(e) =>
                                  setReseauxSociauxDrafts((prev) => ({
                                    ...prev,
                                    [r.id]: { ...d, abonnes: e.target.value },
                                  }))
                                }
                                aria-label={`${RESEAU_SOCIAL_LABELS[r.reseau]} — abonnés`}
                                style={{ ...inputBase, fontSize: "0.82rem", padding: "0.5rem 0.55rem", maxWidth: "9rem" }}
                              />
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", textAlign: "center" }}>
                              {onOffSwitch({
                                checked: d.actif,
                                label: `${RESEAU_SOCIAL_LABELS[r.reseau]} — ${d.actif ? "actif" : "inactif"}`,
                                onToggle: () =>
                                  setReseauxSociauxDrafts((prev) => ({
                                    ...prev,
                                    [r.id]: { ...d, actif: !d.actif },
                                  })),
                              })}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", fontSize: "0.72rem", opacity: 0.45 }}>
                              {dirty ? "modifié" : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: "1.25rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
                  <button
                    type="button"
                    disabled={reseauxSociauxSaving}
                    onClick={() => void handleSaveReseauxSociaux()}
                    style={{
                      padding: "0.65rem 1.35rem",
                      borderRadius: "4px",
                      background: GOLD,
                      color: "#000000",
                      border: `1px solid ${GOLD}`,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      fontSize: "0.78rem",
                      cursor: reseauxSociauxSaving ? "wait" : "pointer",
                      opacity: reseauxSociauxSaving ? 0.7 : 1,
                    }}
                  >
                    {reseauxSociauxSaving ? "Sauvegarde…" : "Sauvegarder"}
                  </button>
                  <span style={{ fontSize: "0.82rem", opacity: 0.55 }}>
                    Le bandeau n&apos;apparaît que si au moins un réseau est actif.
                  </span>
                </div>
              </>
            )}
          </section>

          {/* SECTION FONDATEUR */}
          <section id="section-fondateur" style={cardStyle()}>
            {sectionTitle("FONDATEUR")}
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.92rem", opacity: 0.72, lineHeight: 1.55 }}>
              Bandeau « Statut Fondateur » sous les boutons de la page d&apos;accueil (table{" "}
              <code style={{ fontSize: "0.82rem" }}>fondateur_config</code>).
            </p>
            {fondateurConfigError ? (
              <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>
                {fondateurConfigError}
              </p>
            ) : null}
            {fondateurConfigSaveMsg ? (
              <p style={{ color: "#2ECC71", marginBottom: "0.85rem", fontSize: "0.9rem" }}>
                {fondateurConfigSaveMsg}
              </p>
            ) : null}
            {fondateurConfigLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement…</p>
            ) : !fondateurConfig || !fondateurConfigDraft ? (
              <p style={{ opacity: 0.6, margin: 0 }}>
                Aucune configuration. Exécutez la migration{" "}
                <code style={{ fontSize: "0.82rem" }}>fondateur_config</code>.
              </p>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "1rem",
                    marginBottom: "1.25rem",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                >
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, opacity: 0.85 }}>
                    Afficher le bandeau
                  </span>
                  {onOffSwitch({
                    checked: fondateurConfigDraft.actif,
                    label: `Fondateur — ${fondateurConfigDraft.actif ? "actif" : "inactif"}`,
                    onToggle: () =>
                      setFondateurConfigDraft((prev) =>
                        prev ? { ...prev, actif: !prev.actif } : prev,
                      ),
                  })}
                  <span style={{ fontSize: "0.82rem", opacity: 0.55 }}>
                    Max : {fondateurConfig.membres_max.toLocaleString("fr-FR")} places
                  </span>
                </div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "1rem",
                    fontSize: "0.78rem",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    opacity: 0.55,
                  }}
                >
                  Membres actuels
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={fondateurConfigDraft.membres_actuels}
                    onChange={(e) =>
                      setFondateurConfigDraft((prev) =>
                        prev ? { ...prev, membres_actuels: e.target.value } : prev,
                      )
                    }
                    aria-label="Membres actuels"
                    style={{
                      ...inputBase,
                      display: "block",
                      marginTop: "0.45rem",
                      maxWidth: "12rem",
                      fontSize: "0.85rem",
                    }}
                  />
                </label>
                <label
                  style={{
                    display: "block",
                    marginBottom: "1.25rem",
                    fontSize: "0.78rem",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    opacity: 0.55,
                  }}
                >
                  Message
                  <textarea
                    rows={3}
                    value={fondateurConfigDraft.message}
                    onChange={(e) =>
                      setFondateurConfigDraft((prev) =>
                        prev ? { ...prev, message: e.target.value } : prev,
                      )
                    }
                    aria-label="Message fondateur"
                    style={{
                      ...inputBase,
                      display: "block",
                      marginTop: "0.45rem",
                      resize: "vertical",
                      minHeight: "4.5rem",
                      fontSize: "0.85rem",
                      lineHeight: 1.5,
                    }}
                  />
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
                  <button
                    type="button"
                    disabled={fondateurConfigSaving}
                    onClick={() => void handleSaveFondateurConfig()}
                    style={{
                      padding: "0.65rem 1.35rem",
                      borderRadius: "4px",
                      background: GOLD,
                      color: "#000000",
                      border: `1px solid ${GOLD}`,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      fontSize: "0.78rem",
                      cursor: fondateurConfigSaving ? "wait" : "pointer",
                      opacity: fondateurConfigSaving ? 0.7 : 1,
                    }}
                  >
                    {fondateurConfigSaving ? "Sauvegarde…" : "Sauvegarder"}
                  </button>
                  <span style={{ fontSize: "0.82rem", opacity: 0.55 }}>
                    Le bandeau n&apos;apparaît que si le toggle est activé.
                  </span>
                </div>
              </>
            )}
          </section>

          {/* SECTION CONFIGURATION RANGS */}
          <section id="section-rangs" style={cardStyle()}>
            {sectionTitle("CONFIGURATION RANGS")}
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.92rem", opacity: 0.72, lineHeight: 1.55 }}>
              Seuils mensuels (pts pondérés quiz) et bonus appliqués aux points bruts lors de la
              soumission d&apos;un quiz (table{" "}
              <code style={{ fontSize: "0.82rem" }}>rang_config</code>).
            </p>
            {rangConfigError ? (
              <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>
                {rangConfigError}
              </p>
            ) : null}
            {rangConfigSaveMsg ? (
              <p style={{ color: "#2ECC71", marginBottom: "0.85rem", fontSize: "0.9rem" }}>
                {rangConfigSaveMsg}
              </p>
            ) : null}
            {rangConfigLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement…</p>
            ) : !rangConfig || !rangConfigDraft ? (
              <p style={{ opacity: 0.6, margin: 0 }}>
                Aucune configuration. Exécutez la migration{" "}
                <code style={{ fontSize: "0.82rem" }}>rang_config</code>.
              </p>
            ) : (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
                    gap: "1rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  {RANG_TIER_FIELDS.map(({ tier, label, seuilKey, bonusKey }) => (
                    <div
                      key={tier}
                      style={{
                        padding: "1rem",
                        borderRadius: "4px",
                        background: G2,
                        border: `1px solid ${G3}`,
                      }}
                    >
                      <p
                        style={{
                          margin: "0 0 0.85rem",
                          fontSize: "0.78rem",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          opacity: 0.65,
                        }}
                      >
                        {label}
                      </p>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "0.75rem",
                          fontSize: "0.72rem",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          opacity: 0.55,
                        }}
                      >
                        Seuil (pts pondérés)
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={rangConfigDraft[seuilKey]}
                          onChange={(e) =>
                            setRangConfigDraft((prev) =>
                              prev ? { ...prev, [seuilKey]: e.target.value } : prev,
                            )
                          }
                          aria-label={`Seuil ${label}`}
                          style={{
                            ...inputBase,
                            display: "block",
                            marginTop: "0.4rem",
                            width: "100%",
                            fontSize: "0.85rem",
                          }}
                        />
                      </label>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.72rem",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          opacity: 0.55,
                        }}
                      >
                        Bonus (%)
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={rangConfigDraft[bonusKey]}
                          onChange={(e) =>
                            setRangConfigDraft((prev) =>
                              prev ? { ...prev, [bonusKey]: e.target.value } : prev,
                            )
                          }
                          aria-label={`Bonus ${label}`}
                          style={{
                            ...inputBase,
                            display: "block",
                            marginTop: "0.4rem",
                            width: "100%",
                            fontSize: "0.85rem",
                          }}
                        />
                      </label>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
                  <button
                    type="button"
                    disabled={rangConfigSaving}
                    onClick={() => void handleSaveRangConfig()}
                    style={{
                      padding: "0.65rem 1.35rem",
                      borderRadius: "4px",
                      background: GOLD,
                      color: "#000000",
                      border: `1px solid ${GOLD}`,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      fontSize: "0.78rem",
                      cursor: rangConfigSaving ? "wait" : "pointer",
                      opacity: rangConfigSaving ? 0.7 : 1,
                    }}
                  >
                    {rangConfigSaving ? "Sauvegarde…" : "Sauvegarder"}
                  </button>
                  <span style={{ fontSize: "0.82rem", opacity: 0.55 }}>
                    Le rang est calculé sur les pts pondérés quiz du mois en cours (avant le quiz
                    soumis). Bronze = pas de bonus.
                  </span>
                </div>
              </>
            )}
          </section>

          {/* SECTION UTILISATIONS PTC */}
          <section id="section-ptc" style={cardStyle()}>
            {sectionTitle("UTILISATIONS PTC")}
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.92rem", opacity: 0.72, lineHeight: 1.55 }}>
              Répartition du Pool de Croissance (table{" "}
              <code style={{ fontSize: "0.82rem" }}>ptc_utilisations_config</code>).
            </p>
            {ptcUtilisationsError ? (
              <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>
                {ptcUtilisationsError}
              </p>
            ) : null}
            {ptcUtilisationsSaveMsg ? (
              <p style={{ color: "#2ECC71", marginBottom: "0.85rem", fontSize: "0.9rem" }}>
                {ptcUtilisationsSaveMsg}
              </p>
            ) : null}
            <div
              style={{
                marginBottom: "1.25rem",
                padding: "1rem 1.1rem",
                borderRadius: "4px",
                background: "rgba(212, 160, 23, 0.08)",
                border: "1px solid rgba(212, 160, 23, 0.25)",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
            >
              <p style={{ margin: 0, fontSize: "0.78rem", opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Solde PTC actuel
              </p>
              <p style={{ margin: "0.35rem 0 0", fontSize: "1.65rem", fontWeight: 700, color: GOLD }}>
                {poolCurrent != null
                  ? cad.format(poolCurrent.ptc_balance)
                  : poolLoading
                    ? "…"
                    : "—"}
              </p>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", opacity: 0.72 }}>
                Équivalent :{" "}
                {poolCurrent != null
                  ? (poolCurrent.ptc_balance / PTC_UNIT_DOLLARS).toLocaleString("fr-CA", {
                      maximumFractionDigits: 2,
                    })
                  : "—"}{" "}
                PTC (÷ {PTC_UNIT_DOLLARS} $)
              </p>
            </div>
            {ptcUtilisationsLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement…</p>
            ) : ptcUtilisations.length === 0 ? (
              <p style={{ opacity: 0.6, margin: 0 }}>
                Aucune configuration. Exécutez la migration{" "}
                <code style={{ fontSize: "0.82rem" }}>ptc_utilisations_config</code>.
              </p>
            ) : (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: "0.85rem",
                    marginBottom: "1.25rem",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                >
                  {ptcUtilisations.map((c) => {
                    const d = ptcUtilisationDrafts[c.id] ?? ptcUtilisationToDraft(c);
                    const dirty = ptcUtilisationDraftDirty(c, d);
                    return (
                      <article
                        key={c.id}
                        style={{
                          borderRadius: "4px",
                          padding: "1rem",
                          background: dirty
                            ? "rgba(212, 160, 23, 0.06)"
                            : "rgba(245, 240, 232, 0.04)",
                          border: "1px solid rgba(245, 240, 232, 0.1)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: "0.75rem",
                            marginBottom: "0.85rem",
                          }}
                        >
                          <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.45, fontWeight: 600 }}>
                            {PTC_UTILISATION_LABELS[c.categorie]}
                          </p>
                          {onOffSwitch({
                            checked: d.actif,
                            label: `${PTC_UTILISATION_LABELS[c.categorie]} — ${d.actif ? "actif" : "inactif"}`,
                            onToggle: () =>
                              setPtcUtilisationDrafts((prev) => ({
                                ...prev,
                                [c.id]: { ...d, actif: !d.actif },
                              })),
                          })}
                        </div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.72rem",
                            opacity: 0.55,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            marginBottom: "0.35rem",
                          }}
                        >
                          Budget alloué ($)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={d.budget_alloue}
                          onChange={(e) =>
                            setPtcUtilisationDrafts((prev) => ({
                              ...prev,
                              [c.id]: { ...d, budget_alloue: e.target.value },
                            }))
                          }
                          aria-label={`Budget — ${PTC_UTILISATION_LABELS[c.categorie]}`}
                          style={{ ...inputBase, fontSize: "0.82rem", padding: "0.5rem 0.55rem", width: "100%" }}
                        />
                      </article>
                    );
                  })}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
                  <button
                    type="button"
                    disabled={ptcUtilisationsSaving}
                    onClick={() => void handleSavePtcUtilisations()}
                    style={{
                      padding: "0.65rem 1.35rem",
                      borderRadius: "4px",
                      background: GOLD,
                      color: "#000000",
                      border: `1px solid ${GOLD}`,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      fontSize: "0.78rem",
                      cursor: ptcUtilisationsSaving ? "wait" : "pointer",
                      opacity: ptcUtilisationsSaving ? 0.7 : 1,
                    }}
                  >
                    {ptcUtilisationsSaving ? "Sauvegarde…" : "Sauvegarder"}
                  </button>
                </div>
              </>
            )}
          </section>

          {/* SECTION DÉPLOIEMENT DES FONCTIONNALITÉS */}
          <section id="section-features" style={cardStyle()}>
            {sectionTitle("DÉPLOIEMENT DES FONCTIONNALITÉS")}
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.92rem", opacity: 0.72, lineHeight: 1.55 }}>
              Activez ou désactivez les pages et espaces visibles sur le site. La modification est
              appliquée immédiatement dans Supabase.
            </p>
            {featureFlagsError ? (
              <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{featureFlagsError}</p>
            ) : null}
            {featureFlagsLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement des flags…</p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                }}
              >
                {sortFeatureFlags(featureFlags).map((flag) => {
                  const busy = togglingFlagNom === flag.nom;
                  return (
                    <li
                      key={flag.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "1rem",
                        padding: "1rem 1.1rem",
                        borderRadius: "4px",
                        background: "rgba(245, 240, 232, 0.04)",
                        border: "1px solid rgba(245, 240, 232, 0.1)",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                    >
                      <div>
                        <p
                          style={{
                            margin: 0,
                            fontFamily: "var(--font-bebas), Impact, sans-serif",
                            fontSize: "1.25rem",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                          }}
                        >
                          {flag.nom}
                        </p>
                        {flag.description ? (
                          <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", opacity: 0.65 }}>
                            {flag.description}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={flag.actif}
                        aria-label={`${flag.nom} — ${flag.actif ? "activé" : "désactivé"}`}
                        disabled={busy}
                        onClick={() => void handleToggleFeatureFlag(flag)}
                        style={{
                          flexShrink: 0,
                          position: "relative",
                          width: "3.25rem",
                          height: "1.75rem",
                          borderRadius: "4px",
                          border: `1px solid ${flag.actif ? "rgba(46, 204, 113, 0.5)" : "rgba(245, 240, 232, 0.2)"}`,
                          background: flag.actif ? "rgba(46, 204, 113, 0.35)" : "rgba(245, 240, 232, 0.08)",
                          cursor: busy ? "wait" : "pointer",
                          padding: 0,
                          transition: "background 0.2s ease",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: flag.actif ? "calc(100% - 1.35rem)" : "0.2rem",
                            transform: "translateY(-50%)",
                            width: "1.15rem",
                            height: "1.15rem",
                            borderRadius: "50%",
                            background: flag.actif ? "#2ECC71" : "rgba(245, 240, 232, 0.45)",
                            transition: "left 0.2s ease, background 0.2s ease",
                          }}
                        />
                        <span
                          style={{
                            position: "absolute",
                            width: 1,
                            height: 1,
                            padding: 0,
                            margin: -1,
                            overflow: "hidden",
                            clip: "rect(0,0,0,0)",
                            whiteSpace: "nowrap",
                            border: 0,
                          }}
                        >
                          {flag.actif ? "ON" : "OFF"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {!featureFlagsLoading && featureFlags.length === 0 ? (
              <p style={{ opacity: 0.6, margin: 0 }}>
                Aucun flag. Exécutez la migration Supabase{" "}
                <code style={{ fontSize: "0.82rem" }}>feature_flags</code>.
              </p>
            ) : null}
          </section>

          {/* SECTION SYSTÈME ACTIONS & DIVIDENDES */}
          <section id="section-actions" style={cardStyle()}>
            {sectionTitle("SYSTÈME ACTIONS & DIVIDENDES")}
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.92rem", opacity: 0.72, lineHeight: 1.55 }}>
              Structure des actionnaires (actions A et B), configuration de la valorisation, saisie
              des revenus mensuels et distribution trimestrielle des dividendes.
            </p>

            {/* 1. CONFIGURATION ACTIONNAIRES */}
            <div style={actionsSubCard}>
              {subSectionTitle("1. Configuration actionnaires")}
              {actionnairesError ? (
                <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{actionnairesError}</p>
              ) : null}
              {actionnairesMsg ? (
                <p style={{ color: "#2ECC71", marginBottom: "0.85rem", fontSize: "0.9rem" }}>{actionnairesMsg}</p>
              ) : null}
              {actionnairesLoading ? (
                <p style={{ opacity: 0.65 }}>Chargement des actionnaires…</p>
              ) : actionnaires.length === 0 ? (
                <p style={{ opacity: 0.6, margin: 0 }}>
                  Aucun actionnaire. Exécutez la migration Supabase{" "}
                  <code style={{ fontSize: "0.82rem" }}>actionnaires</code>.
                </p>
              ) : (
                <div style={{ overflowX: "auto",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                  <table className="leve-admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                        {["Siège", "Nom", "Catégorie", "Actions", "Pourcentage", "Rôle", "Actif", ""].map((h, i) => (
                          <th
                            key={`act-h-${i}`}
                            style={{
                              padding: "0.65rem 0.5rem",
                              letterSpacing: "0.08em",
                              fontSize: "0.65rem",
                              textTransform: "uppercase",
                              opacity: 0.55,
                              minWidth: i === 1 ? "9rem" : i === 5 ? "8rem" : i === 7 ? "9rem" : undefined,
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {actionnaires.map((a) => {
                        const d = actionnaireDrafts[a.id] ?? actionnaireToDraft(a);
                        const dirty = actionnaireDraftDirty(a, d);
                        const busy = actionnaireBusyId === a.id;
                        const editable = !a.locked;
                        return (
                          <tr
                            key={a.id}
                            style={{
                              borderBottom: "1px solid rgba(245,240,232,0.06)",
                              background: editable && dirty ? "rgba(212, 160, 23, 0.06)" : undefined,
                            }}
                          >
                            <td style={{ padding: "0.6rem 0.5rem", fontWeight: 600, color: GOLD }}>
                              {a.siege ?? "—"}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem" }}>
                              {editable ? (
                                <input
                                  type="text"
                                  value={d.nom}
                                  onChange={(e) =>
                                    setActionnaireDrafts((prev) => ({
                                      ...prev,
                                      [a.id]: { ...d, nom: e.target.value },
                                    }))
                                  }
                                  aria-label={`Siège ${a.siege ?? ""} — nom`}
                                  style={{ ...inputBase, fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                                />
                              ) : (
                                a.nom
                              )}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem" }}>Cat. {a.categorie}</td>
                            <td style={{ padding: "0.6rem 0.5rem", minWidth: "5rem" }}>
                              {editable ? (
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={d.nb_actions}
                                  onChange={(e) =>
                                    setActionnaireDrafts((prev) => ({
                                      ...prev,
                                      [a.id]: { ...d, nb_actions: e.target.value },
                                    }))
                                  }
                                  aria-label={`Siège ${a.siege ?? ""} — nombre d'actions`}
                                  style={{ ...inputBase, fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                                />
                              ) : (
                                a.nb_actions
                              )}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", minWidth: "5.5rem" }}>
                              {editable ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step="0.001"
                                  value={d.pourcentage}
                                  onChange={(e) =>
                                    setActionnaireDrafts((prev) => ({
                                      ...prev,
                                      [a.id]: { ...d, pourcentage: e.target.value },
                                    }))
                                  }
                                  aria-label={`Siège ${a.siege ?? ""} — pourcentage`}
                                  style={{ ...inputBase, fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                                />
                              ) : (
                                `${a.pourcentage} %`
                              )}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem" }}>
                              {editable ? (
                                <input
                                  type="text"
                                  value={d.role}
                                  onChange={(e) =>
                                    setActionnaireDrafts((prev) => ({
                                      ...prev,
                                      [a.id]: { ...d, role: e.target.value },
                                    }))
                                  }
                                  placeholder="Rôle"
                                  aria-label={`Siège ${a.siege ?? ""} — rôle`}
                                  style={{ ...inputBase, fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                                />
                              ) : (
                                a.role ?? "—"
                              )}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem" }}>{yesNoBadge(a.actif)}</td>
                            <td style={{ padding: "0.6rem 0.5rem" }}>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                                {editable ? (
                                  <button
                                    type="button"
                                    disabled={!dirty || busy}
                                    onClick={() => void saveActionnaire(a)}
                                    style={{
                                      background: dirty ? GOLD : "rgba(245, 240, 232, 0.06)",
                                      color: dirty ? "#000000" : TEXT,
                                      border: `1px solid ${dirty ? GOLD : "rgba(245, 240, 232, 0.12)"}`,
                                      padding: "0.45rem 0.55rem",
                                      cursor: !dirty || busy ? "not-allowed" : "pointer",
                                      fontSize: "0.68rem",
                                      letterSpacing: "0.1em",
                                      textTransform: "uppercase",
                                      opacity: dirty ? 1 : 0.5,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {busy ? "…" : "Sauvegarder"}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void toggleActionnaireLock(a)}
                                  style={{
                                    background: a.locked
                                      ? "rgba(212, 160, 23, 0.12)"
                                      : "rgba(245, 240, 232, 0.06)",
                                    color: a.locked ? GOLD : TEXT,
                                    border: `1px solid ${a.locked ? "rgba(212, 160, 23, 0.35)" : "rgba(245, 240, 232, 0.2)"}`,
                                    padding: "0.45rem 0.55rem",
                                    cursor: busy ? "wait" : "pointer",
                                    fontSize: "0.68rem",
                                    letterSpacing: "0.1em",
                                    textTransform: "uppercase",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {a.locked ? "🔓 Modifier" : "🔒 Verrouiller"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p style={{ margin: "0.75rem 0 0", fontSize: "0.78rem", opacity: 0.55,
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                    Total pourcentages :{" "}
                    {actionnaires
                      .reduce((s, a) => s + Number(a.pourcentage), 0)
                      .toFixed(3)}{" "}
                    % · Total actions :{" "}
                    {actionnaires.reduce((s, a) => s + a.nb_actions, 0)}
                  </p>
                </div>
              )}
            </div>

            {/* 2. CONFIGURATION GÉNÉRALE ACTIONS */}
            <div style={actionsSubCard}>
              {subSectionTitle("2. Configuration générale actions")}
              {actionsConfigError ? (
                <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{actionsConfigError}</p>
              ) : null}
              {actionsConfigMsg ? (
                <p style={{ color: "#2ECC71", marginBottom: "0.85rem", fontSize: "0.9rem" }}>{actionsConfigMsg}</p>
              ) : null}
              {actionsConfigLoading ? (
                <p style={{ opacity: 0.65 }}>Chargement de la configuration…</p>
              ) : !actionsConfig || !actionsConfigDraft ? (
                <p style={{ opacity: 0.6, margin: 0 }}>
                  Configuration introuvable. Exécutez la migration Supabase{" "}
                  <code style={{ fontSize: "0.82rem" }}>actions_config</code>.
                </p>
              ) : (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "1rem",
                      marginBottom: "1.1rem",
                    }}
                  >
                    <div>
                      <span style={labelSm}>Total actions A</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={actionsConfigDraft.total_actions_a}
                        disabled={actionsConfig.locked}
                        onChange={(e) =>
                          setActionsConfigDraft((prev) =>
                            prev ? { ...prev, total_actions_a: e.target.value } : prev,
                          )
                        }
                        aria-label="Total actions A"
                        style={{ ...inputBase, opacity: actionsConfig.locked ? 0.5 : 1 }}
                      />
                    </div>
                    <div>
                      <span style={labelSm}>Total actions B</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={actionsConfigDraft.total_actions_b}
                        disabled={actionsConfig.locked}
                        onChange={(e) =>
                          setActionsConfigDraft((prev) =>
                            prev ? { ...prev, total_actions_b: e.target.value } : prev,
                          )
                        }
                        aria-label="Total actions B"
                        style={{ ...inputBase, opacity: actionsConfig.locked ? 0.5 : 1 }}
                      />
                    </div>
                    <div>
                      <span style={labelSm}>Total actions C</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={actionsConfigDraft.total_actions_c}
                        disabled={actionsConfig.locked}
                        onChange={(e) =>
                          setActionsConfigDraft((prev) =>
                            prev ? { ...prev, total_actions_c: e.target.value } : prev,
                          )
                        }
                        aria-label="Total actions C"
                        style={{ ...inputBase, opacity: actionsConfig.locked ? 0.5 : 1 }}
                      />
                    </div>
                    <div>
                      <span style={labelSm}>Valeur fondation ($)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={actionsConfigDraft.valeur_fondation}
                        disabled={actionsConfig.locked}
                        onChange={(e) =>
                          setActionsConfigDraft((prev) =>
                            prev ? { ...prev, valeur_fondation: e.target.value } : prev,
                          )
                        }
                        aria-label="Valeur fondation"
                        style={{ ...inputBase, opacity: actionsConfig.locked ? 0.5 : 1 }}
                      />
                    </div>
                    <div>
                      <span style={labelSm}>Multiple de valorisation</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={actionsConfigDraft.multiple_valorisation}
                        disabled={actionsConfig.locked}
                        onChange={(e) =>
                          setActionsConfigDraft((prev) =>
                            prev ? { ...prev, multiple_valorisation: e.target.value } : prev,
                          )
                        }
                        aria-label="Multiple de valorisation"
                        style={{ ...inputBase, opacity: actionsConfig.locked ? 0.5 : 1 }}
                      />
                    </div>
                    <div>
                      <span style={labelSm}>Prix action C (phase) ($)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={actionsConfigDraft.prix_action_c_phase}
                        disabled={actionsConfig.locked}
                        onChange={(e) =>
                          setActionsConfigDraft((prev) =>
                            prev ? { ...prev, prix_action_c_phase: e.target.value } : prev,
                          )
                        }
                        aria-label="Prix action C (phase)"
                        style={{ ...inputBase, opacity: actionsConfig.locked ? 0.5 : 1 }}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                    <button
                      type="button"
                      disabled={
                        actionsConfig.locked ||
                        actionsConfigBusy ||
                        !actionsConfigDraftDirty(actionsConfig, actionsConfigDraft)
                      }
                      onClick={() => void saveActionsConfig()}
                      style={{
                        padding: "0.65rem 1.35rem",
                        borderRadius: "4px",
                        background: GOLD,
                        color: "#000000",
                        border: `1px solid ${GOLD}`,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        fontSize: "0.78rem",
                        cursor:
                          actionsConfig.locked || actionsConfigBusy ? "not-allowed" : "pointer",
                        opacity:
                          actionsConfig.locked ||
                          !actionsConfigDraftDirty(actionsConfig, actionsConfigDraft)
                            ? 0.5
                            : 1,
                      }}
                    >
                      {actionsConfigBusy ? "Sauvegarde…" : "Sauvegarder"}
                    </button>
                    <button
                      type="button"
                      disabled={actionsConfigBusy}
                      onClick={() => void toggleActionsConfigLock()}
                      style={{
                        padding: "0.65rem 1.35rem",
                        borderRadius: "4px",
                        background: actionsConfig.locked
                          ? "rgba(212, 160, 23, 0.12)"
                          : "rgba(245, 240, 232, 0.06)",
                        color: actionsConfig.locked ? GOLD : TEXT,
                        border: `1px solid ${actionsConfig.locked ? "rgba(212, 160, 23, 0.35)" : "rgba(245, 240, 232, 0.2)"}`,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        fontSize: "0.78rem",
                        cursor: actionsConfigBusy ? "wait" : "pointer",
                      }}
                    >
                      {actionsConfig.locked ? "🔓 Modifier" : "🔒 Verrouiller"}
                    </button>
                    <span style={{ fontSize: "0.82rem", opacity: 0.55 }}>
                      {actionsConfig.locked
                        ? "Configuration verrouillée."
                        : "Configuration déverrouillée — champs éditables."}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* 3. SAISIE REVENUS MENSUELS */}
            <div style={actionsSubCard}>
              {subSectionTitle("3. Saisie revenus mensuels")}
              {revenusError ? (
                <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{revenusError}</p>
              ) : null}
              {revenusMsg ? (
                <p style={{ color: "#2ECC71", marginBottom: "0.85rem", fontSize: "0.9rem" }}>{revenusMsg}</p>
              ) : null}
              <div style={{ maxWidth: "16rem", marginBottom: "1.1rem" }}>
                <span style={labelSm}>Mois</span>
                <input
                  type="month"
                  value={revenusMois}
                  onChange={(e) => setRevenusMois(e.target.value)}
                  aria-label="Mois des revenus"
                  style={inputBase}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                  gap: "1rem",
                  marginBottom: "1.1rem",
                }}
              >
                {REVENUS_CHAMPS.map(({ key, label }) => (
                  <div key={key}>
                    <span style={labelSm}>{label} ($)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={revenusDraft[key]}
                      onChange={(e) =>
                        setRevenusDraft((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      placeholder="0.00"
                      aria-label={label}
                      style={inputBase}
                    />
                  </div>
                ))}
                <div>
                  <span style={labelSm}>Dépenses opérationnelles ($)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={revenusDraft.depenses_operationnelles}
                    onChange={(e) =>
                      setRevenusDraft((prev) => ({
                        ...prev,
                        depenses_operationnelles: e.target.value,
                      }))
                    }
                    placeholder="0.00"
                    aria-label="Dépenses opérationnelles"
                    style={inputBase}
                  />
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                <p style={{ margin: 0, fontSize: "1rem" }}>
                  Total brut :{" "}
                  <strong style={{ color: GOLD, fontSize: "1.2rem" }}>
                    {cad.format(
                      REVENUS_CHAMPS.reduce((s, { key }) => s + montantSaisi(revenusDraft[key]), 0),
                    )}
                  </strong>
                </p>
                <button
                  type="button"
                  disabled={revenusSaving}
                  onClick={() => void handleValiderRevenus()}
                  style={{
                    padding: "0.65rem 1.35rem",
                    borderRadius: "4px",
                    background: GOLD,
                    color: "#000000",
                    border: `1px solid ${GOLD}`,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontSize: "0.78rem",
                    cursor: revenusSaving ? "wait" : "pointer",
                    opacity: revenusSaving ? 0.7 : 1,
                  }}
                >
                  {revenusSaving ? "Validation…" : "Valider et calculer valorisation"}
                </button>
              </div>
            </div>

            {/* 4. VALORISATION ACTUELLE */}
            <div style={actionsSubCard}>
              {subSectionTitle("4. Valorisation actuelle")}
              {valorisationsError ? (
                <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{valorisationsError}</p>
              ) : null}
              {valorisationsLoading ? (
                <p style={{ opacity: 0.65 }}>Chargement de la valorisation…</p>
              ) : valorisations.length === 0 ? (
                <p style={{ opacity: 0.6, margin: 0 }}>
                  Aucune valorisation. Validez d&apos;abord des revenus mensuels.
                </p>
              ) : (
                (() => {
                  const derniere = valorisations[valorisations.length - 1];
                  if (!derniere) return null;
                  const stats = [
                    { label: "Valeur société", value: cad.format(derniere.valeur_societe) },
                    { label: "Valeur par action", value: cad.format(derniere.valeur_action) },
                    { label: "Prix action Cat. C", value: cad.format(derniere.prix_action_c) },
                    { label: "Pool dividendes (mois)", value: cad.format(derniere.pool_dividendes) },
                  ];
                  return (
                    <>
                      <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", opacity: 0.65 }}>
                        Dernier mois validé : <strong>{formatMonthLabel(derniere.mois)}</strong>
                      </p>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                          gap: "1rem",
                          marginBottom: "1.5rem",
                        }}
                      >
                        {stats.map((s) => (
                          <div
                            key={s.label}
                            style={{
                              padding: "1rem 1.1rem",
                              borderRadius: "4px",
                              background: "rgba(245, 240, 232, 0.04)",
                              border: "1px solid rgba(245, 240, 232, 0.1)",
                            }}
                          >
                            <span style={labelSm}>{s.label}</span>
                            <strong style={{ color: GOLD, fontSize: "1.25rem" }}>{s.value}</strong>
                          </div>
                        ))}
                      </div>
                      <ValorisationChart series={valorisations} />
                    </>
                  );
                })()
              )}
            </div>

            {/* 5. DIVIDENDES */}
            <div style={{ ...actionsSubCard, marginBottom: 0 }}>
              {subSectionTitle("5. Dividendes")}
              {divError ? (
                <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{divError}</p>
              ) : null}
              {divMsg ? (
                <p style={{ color: "#2ECC71", marginBottom: "0.85rem", fontSize: "0.9rem" }}>{divMsg}</p>
              ) : null}
              {(() => {
                const derniereValo = valorisations[valorisations.length - 1];
                const poolReference = derniereValo ? derniereValo.pool_dividendes : 0;
                const totalDistribue = divDecisions.reduce(
                  (s, dec) => s + Number(dec.montant_distribue),
                  0,
                );
                const poolNet = Math.round((poolReference - totalDistribue) * 100) / 100;
                const poolInsuffisant = poolNet < 0;
                const poolDisponible = poolInsuffisant ? 0 : poolNet;
                const montantPreview = Number(divMontant.trim().replace(",", "."));
                const previewOk = Number.isFinite(montantPreview) && montantPreview > 0;
                const actifs = actionnaires.filter((a) => a.actif);
                return (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                        gap: "1rem",
                        marginBottom: "1.1rem",
                      }}
                    >
                      <div>
                        <span style={labelSm}>Trimestre</span>
                        <select
                          value={divTrimestre}
                          onChange={(e) => setDivTrimestre(e.target.value)}
                          aria-label="Trimestre de distribution"
                          style={{ ...inputBase, cursor: "pointer" }}
                        >
                          {trimestreOptions().map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span style={labelSm}>Pool dividendes disponible</span>
                        <p
                          style={{
                            margin: 0,
                            padding: "0.65rem 0 0.2rem",
                            fontSize: "1.2rem",
                            fontWeight: 600,
                            color: poolDisponible > 0 ? GOLD : TEXT,
                            opacity: poolDisponible > 0 ? 1 : 0.6,
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                        >
                          {cad.format(poolDisponible)}
                        </p>
                        {poolInsuffisant ? (
                          <p style={{ margin: 0, fontSize: "0.78rem", color: ROUGE }}>
                            Pool insuffisant pour ce trimestre
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <span style={labelSm}>Montant à distribuer ($)</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={divMontant}
                          onChange={(e) => setDivMontant(e.target.value)}
                          placeholder="0.00"
                          aria-label="Montant à distribuer"
                          style={inputBase}
                        />
                      </div>
                    </div>

                    {previewOk && actifs.length > 0 ? (
                      <div style={{ overflowX: "auto", marginBottom: "1.1rem",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                        <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", opacity: 0.65 }}>
                          Aperçu de la distribution :
                        </p>
                        <table className="leve-admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                          <thead>
                            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                              {["Actionnaire", "Pourcentage", "Montant"].map((h) => (
                                <th
                                  key={`div-prev-${h}`}
                                  style={{
                                    padding: "0.55rem 0.5rem",
                                    letterSpacing: "0.08em",
                                    fontSize: "0.65rem",
                                    textTransform: "uppercase",
                                    opacity: 0.55,
                                  }}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {actifs.map((a) => (
                              <tr key={`prev-${a.id}`} style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                                <td style={{ padding: "0.55rem 0.5rem" }}>{a.nom}</td>
                                <td style={{ padding: "0.55rem 0.5rem" }}>{a.pourcentage} %</td>
                                <td style={{ padding: "0.55rem 0.5rem", color: GOLD, fontWeight: 600 }}>
                                  {cad.format(
                                    Math.round(montantPreview * (Number(a.pourcentage) / 100) * 100) / 100,
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      disabled={divSaving || !previewOk}
                      onClick={() => void handleDistribuerDividendes()}
                      style={{
                        padding: "0.65rem 1.35rem",
                        borderRadius: "4px",
                        background: GOLD,
                        color: "#000000",
                        border: `1px solid ${GOLD}`,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        fontSize: "0.78rem",
                        cursor: divSaving ? "wait" : previewOk ? "pointer" : "not-allowed",
                        opacity: divSaving || !previewOk ? 0.6 : 1,
                        marginBottom: "1.5rem",
                      }}
                    >
                      {divSaving ? "Distribution…" : "Valider la distribution"}
                    </button>

                    <div>
                      <p style={{ margin: "0 0 0.75rem", fontSize: "0.92rem", fontWeight: 600 }}>
                        Historique des distributions
                      </p>
                      {divLoading ? (
                        <p style={{ opacity: 0.65 }}>Chargement de l&apos;historique…</p>
                      ) : divDecisions.length === 0 ? (
                        <p style={{ opacity: 0.6, margin: 0 }}>Aucune distribution passée.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                          {divDecisions.map((dec) => (
                            <div
                              key={dec.id}
                              style={{
                                padding: "0.85rem 1rem",
                                borderRadius: "4px",
                                background: "rgba(245, 240, 232, 0.04)",
                                border: "1px solid rgba(245, 240, 232, 0.1)",
                              }}
                            >
                              <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
                                <strong style={{ color: GOLD }}>{dec.trimestre}</strong> —{" "}
                                {cad.format(Number(dec.montant_distribue))}{" "}
                                <span style={{ opacity: 0.55, fontSize: "0.78rem" }}>
                                  ({new Date(dec.created_at).toLocaleDateString("fr-CA")})
                                </span>
                              </p>
                              <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.82rem", opacity: 0.85 }}>
                                {dec.distributions.map((dist) => (
                                  <li key={dist.id}>
                                    {dist.actionnaire?.nom ?? dist.actionnaire_id} —{" "}
                                    {dist.actionnaire ? `${dist.actionnaire.pourcentage} % — ` : ""}
                                    {cad.format(Number(dist.montant))}
                                    {dist.statut ? ` (${dist.statut})` : ""}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </section>

          {/* SECTION GESTION DES MEMBRES */}
          <section id="section-membres" style={cardStyle()}>
            {sectionTitle("GESTION DES MEMBRES")}
            <p style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>
              Total :{" "}
              <strong style={{ color: GOLD, fontSize: "1.35rem" }}>{membersLoading ? "…" : members.length}</strong>{" "}
              membre{members.length !== 1 ? "s" : ""}
            </p>
            {membersError ? <p style={{ color: ROUGE, marginBottom: "0.75rem" }}>{membersError}</p> : null}
            {membersLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement…</p>
            ) : (
              <div style={{ overflowX: "auto",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                <table className="leve-admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                      {["Id", "Nom", "Courriel", "Type", "Mult.", "N° membre", ""].map((h, i) => (
                        <th
                          key={`${h}-${i}`}
                          style={{
                            padding: "0.65rem 0.5rem",
                            letterSpacing: "0.08em",
                            fontSize: "0.65rem",
                            textTransform: "uppercase",
                            opacity: 0.55,
                            minWidth: i === 0 ? "7.5rem" : undefined,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                    {members.map((m) => {
                      const d = memberDrafts[m.id] ?? defaultMemberDraft(m);
                      const dirty = memberRowDirty(m, d);
                      const multKey = d.multiplier === 1.2 ? "1.2" : d.multiplier === 2 ? "2" : "1";
                      const multDisplay =
                        typeof m.multiplier === "number"
                          ? String(m.multiplier)
                          : m.multiplier != null && String(m.multiplier).length
                            ? String(m.multiplier)
                            : "—";
                      return (
                        <tbody key={m.id}>
                          <tr style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                            <td
                              style={{
                                padding: "0.6rem 0.5rem",
                                fontFamily: "var(--font-mono), ui-monospace, monospace",
                                fontSize: "0.72rem",
                                wordBreak: "break-all",
                                verticalAlign: "top",
                                maxWidth: "10rem",
                              }}
                              title={m.id}
                            >
                              {m.id}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top" }}>{m.display_name ?? "—"}</td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top" }}>{m.email ?? "—"}</td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top", minWidth: "6.5rem" }}>
                              {editingMemberId === m.id ? (
                                <select
                                  value={d.member_type}
                                  onChange={(e) => {
                                    const v = e.target.value as MemberTypeForm;
                                    setMemberDrafts((prev) => ({
                                      ...prev,
                                      [m.id]: { ...d, member_type: v },
                                    }));
                                  }}
                                  aria-label="Type de membre"
                                  style={{ ...inputBase, cursor: "pointer", fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                                >
                                  <option value="pionnier">pionnier</option>
                                  <option value="fondateur">fondateur</option>
                                  <option value="communaute">communaute</option>
                                  <option value="collaborateur">collaborateur</option>
                                </select>
                              ) : (
                                displayMemberType(m.member_type)
                              )}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top", minWidth: "3.5rem" }}>
                              {editingMemberId === m.id ? (
                                <select
                                  value={multKey}
                                  onChange={(e) => {
                                    const v = Number(e.target.value);
                                    const mult = (v === 1.2 ? 1.2 : v === 2 ? 2.0 : 1.0) as MultiplierValue;
                                    setMemberDrafts((prev) => ({
                                      ...prev,
                                      [m.id]: { ...d, multiplier: mult },
                                    }));
                                  }}
                                  aria-label="Multiplicateur"
                                  style={{ ...inputBase, cursor: "pointer", fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                                >
                                  <option value="1">1.0</option>
                                  <option value="1.2">1.2</option>
                                  <option value="2">2.0</option>
                                </select>
                              ) : (
                                multDisplay
                              )}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top", minWidth: "6.5rem" }}>
                              {editingMemberId === m.id ? (
                                <input
                                  type="text"
                                  value={d.numero_membre}
                                  onChange={(e) =>
                                    setMemberDrafts((prev) => ({
                                      ...prev,
                                      [m.id]: { ...d, numero_membre: e.target.value },
                                    }))
                                  }
                                  aria-label="Numéro membre"
                                  autoComplete="off"
                                  placeholder="N° membre"
                                  style={{ ...inputBase, fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                                />
                              ) : rowNumeroMembreString(m).length ? (
                                rowNumeroMembreString(m)
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top" }}>
                              {editingMemberId === m.id ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", alignItems: "stretch" }}>
                                  <button
                                    type="button"
                                    disabled={!dirty || savingMemberId === m.id}
                                    onClick={() => void saveMember(m.id)}
                                    style={{
                                      background: dirty ? GOLD : "rgba(245, 240, 232, 0.06)",
                                      color: dirty ? "#000000" : TEXT,
                                      border: `1px solid ${dirty ? GOLD : "rgba(245, 240, 232, 0.12)"}`,
                                      padding: "0.45rem 0.55rem",
                                      cursor: !dirty || savingMemberId === m.id ? "not-allowed" : "pointer",
                                      fontSize: "0.68rem",
                                      letterSpacing: "0.1em",
                                      textTransform: "uppercase",
                                      opacity: dirty ? 1 : 0.5,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {savingMemberId === m.id ? "…" : "Sauvegarder"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={savingMemberId === m.id}
                                    onClick={() => setEditingMemberId(null)}
                                    style={{
                                      background: "transparent",
                                      color: TEXT,
                                      border: "1px solid rgba(245, 240, 232, 0.2)",
                                      padding: "0.45rem 0.55rem",
                                      cursor: savingMemberId === m.id ? "wait" : "pointer",
                                      fontSize: "0.68rem",
                                      letterSpacing: "0.08em",
                                      textTransform: "uppercase",
                                      opacity: 0.85,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Annuler
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMemberDrafts((prev) => ({
                                      ...prev,
                                      [m.id]: defaultMemberDraft(m),
                                    }));
                                    setEditingMemberId(m.id);
                                  }}
                                  style={{
                                    background: "rgba(212, 160, 23, 0.12)",
                                    color: GOLD,
                                    border: "1px solid rgba(212, 160, 23, 0.35)",
                                    padding: "0.45rem 0.65rem",
                                    cursor: "pointer",
                                    fontSize: "0.68rem",
                                    letterSpacing: "0.1em",
                                    textTransform: "uppercase",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Modifier
                                </button>
                              )}
                            </td>
                          </tr>
                          {editingMemberId === m.id && d.member_type === "collaborateur" ? (
                            <tr style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                              <td colSpan={7} style={{ padding: "0.5rem 0.5rem 0.75rem", verticalAlign: "top" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "0.75rem 1.25rem",
                                    alignItems: "flex-end",
                                  }}
                                >
                                  <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", minWidth: "12rem" }}>
                                    <span style={{ fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.55 }}>
                                      Catégorie
                                    </span>
                                    <input
                                      type="text"
                                      value={d.categorie}
                                      onChange={(e) =>
                                        setMemberDrafts((prev) => ({
                                          ...prev,
                                          [m.id]: { ...d, categorie: e.target.value },
                                        }))
                                      }
                                      aria-label="Catégorie collaborateur"
                                      autoComplete="off"
                                      placeholder="Musique, Football, Histoire, Cuisine…"
                                      style={{ ...inputBase, fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                                    />
                                  </label>
                                  <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", minWidth: "8rem" }}>
                                    <span style={{ fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.55 }}>
                                      Icône
                                    </span>
                                    <input
                                      type="text"
                                      value={d.icone}
                                      onChange={(e) =>
                                        setMemberDrafts((prev) => ({
                                          ...prev,
                                          [m.id]: { ...d, icone: e.target.value },
                                        }))
                                      }
                                      aria-label="Icône collaborateur"
                                      autoComplete="off"
                                      placeholder="🎵 🏈 📚 🍳"
                                      style={{ ...inputBase, fontSize: "0.82rem", padding: "0.5rem 0.55rem", maxWidth: "8rem" }}
                                    />
                                  </label>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      );
                    })}
                </table>
                {members.length === 0 ? <p style={{ opacity: 0.6, marginTop: "1rem" }}>Aucun membre.</p> : null}
              </div>
            )}
          </section>

          {/* SECTION SUIVI BETA */}
          <section id="section-beta" style={cardStyle()}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.75rem",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
            >
              {sectionTitle("SUIVI BETA")}
              <button
                type="button"
                disabled={betaExporting || betaTesteurs.length === 0}
                onClick={() => void exportBetaCsv()}
                style={{
                  padding: "0.55rem 1.1rem",
                  borderRadius: "4px",
                  background: "transparent",
                  color: GOLD,
                  fontWeight: 600,
                  border: `1px solid ${GOLD}`,
                  cursor: betaExporting || betaTesteurs.length === 0 ? "not-allowed" : "pointer",
                  opacity: betaExporting || betaTesteurs.length === 0 ? 0.5 : 1,
                  fontSize: "0.85rem",
                }}
              >
                {betaExporting ? "Export…" : "Exporter CSV"}
              </button>
            </div>
            {betaError ? <p style={{ color: ROUGE, marginBottom: "0.75rem" }}>{betaError}</p> : null}
            {betaLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement…</p>
            ) : (
              (() => {
                const nb = betaTesteurs.length;
                const totalSecondes = betaTesteurs.reduce(
                  (acc, t) => acc + betaNumber(t.beta_temps_total_secondes),
                  0,
                );
                const totalPoints = betaTesteurs.reduce((acc, t) => acc + betaNumber(t.beta_points), 0);
                const moyenneSecondes = nb > 0 ? totalSecondes / nb : 0;
                const moyennePoints = nb > 0 ? totalPoints / nb : 0;
                const statCard = {
                  background: "rgba(245, 240, 232, 0.04)",
                  border: "1px solid rgba(245, 240, 232, 0.1)",
                  borderRadius: "4px",
                  padding: "0.85rem 1.1rem",
                  minWidth: "10rem",
                } as const;
                return (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
                      <div style={statCard}>
                        <span style={labelSm}>Testeurs</span>
                        <strong style={{ color: GOLD, fontSize: "1.45rem" }}>{nb}</strong>
                      </div>
                      <div style={statCard}>
                        <span style={labelSm}>Moyenne temps</span>
                        <strong style={{ color: GOLD, fontSize: "1.45rem" }}>
                          {formatBetaTemps(moyenneSecondes)}
                        </strong>
                      </div>
                      <div style={statCard}>
                        <span style={labelSm}>Moyenne points</span>
                        <strong style={{ color: GOLD, fontSize: "1.45rem" }}>
                          {Math.round(moyennePoints).toLocaleString("fr-CA")}
                        </strong>
                      </div>
                    </div>
                    <div style={{ overflowX: "auto",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                      <table className="leve-admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                        <thead>
                          <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                            {["N° membre", "Nom", "Courriel", "Temps total", "Points Beta", "Dernière activité", "Statut"].map(
                              (h) => (
                                <th
                                  key={h}
                                  style={{
                                    padding: "0.65rem 0.5rem",
                                    letterSpacing: "0.08em",
                                    fontSize: "0.65rem",
                                    textTransform: "uppercase",
                                    opacity: 0.55,
                                  }}
                                >
                                  {h}
                                </th>
                              ),
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {betaTesteurs.map((t, idx) => {
                            const statut = betaStatut(t.beta_derniere_activite);
                            const medaille = idx < 3 ? BETA_TOP_MEDAILLES[idx] : null;
                            return (
                              <tr key={t.id} style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                                <td style={{ padding: "0.6rem 0.5rem" }}>
                                  {t.numero_membre != null && String(t.numero_membre).length
                                    ? String(t.numero_membre)
                                    : "—"}
                                </td>
                                <td style={{ padding: "0.6rem 0.5rem" }}>
                                  {medaille ? <span style={{ marginRight: "0.4rem" }}>{medaille}</span> : null}
                                  {t.display_name ?? "—"}
                                </td>
                                <td style={{ padding: "0.6rem 0.5rem" }}>{t.email ?? "—"}</td>
                                <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>
                                  {formatBetaTemps(betaNumber(t.beta_temps_total_secondes))}
                                </td>
                                <td style={{ padding: "0.6rem 0.5rem", color: GOLD, fontWeight: 600 }}>
                                  {betaNumber(t.beta_points).toLocaleString("fr-CA")}
                                </td>
                                <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>
                                  {formatBetaDateHeure(t.beta_derniere_activite)}
                                </td>
                                <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>
                                  {statut.emoji} {statut.label}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {nb === 0 ? (
                        <p style={{ opacity: 0.6, marginTop: "1rem" }}>Aucun beta testeur.</p>
                      ) : null}
                    </div>

                    {nb > 0 ? (
                      <div
                        style={{
                          marginTop: "1.75rem",
                          padding: "1.25rem",
                          borderRadius: "4px",
                          background: "rgba(212, 175, 55, 0.06)",
                          border: `1px solid ${GOLD}33`,
                        }}
                      >
                        <h3
                          style={{
                            fontSize: "0.95rem",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: GOLD,
                            margin: "0 0 0.35rem",
                          }}
                        >
                          Top 3 testeurs — Bonus PA à la fin du beta
                        </h3>
                        <p style={{ opacity: 0.65, fontSize: "0.82rem", margin: "0 0 1.1rem" }}>
                          Les 3 premiers testeurs reçoivent un bonus PA. Créditez-le manuellement à la
                          fin du beta.
                        </p>
                        {betaBonusError ? (
                          <p style={{ color: ROUGE, marginBottom: "0.75rem", fontSize: "0.82rem" }}>
                            {betaBonusError}
                          </p>
                        ) : null}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
                          {betaTesteurs.slice(0, 3).map((t, idx) => {
                            const bonus = BETA_BONUS_PA[idx] ?? 0;
                            const credite = betaBonusDoneIds.includes(t.id);
                            const busy = betaBonusBusyId === t.id;
                            return (
                              <div
                                key={t.id}
                                style={{
                                  flex: "1 1 14rem",
                                  minWidth: "13rem",
                                  background: "rgba(245, 240, 232, 0.04)",
                                  border: "1px solid rgba(245, 240, 232, 0.1)",
                                  borderRadius: "4px",
                                  padding: "1rem",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "0.6rem",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  <span style={{ fontSize: "1.5rem" }}>{BETA_TOP_MEDAILLES[idx]}</span>
                                  <span style={{ fontWeight: 600 }}>{t.display_name ?? "—"}</span>
                                </div>
                                <div style={{ fontSize: "0.8rem", opacity: 0.7,
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                                  {betaNumber(t.beta_points).toLocaleString("fr-CA")} pts Beta
                                </div>
                                <div style={{ color: GOLD, fontWeight: 700, fontSize: "1.05rem" }}>
                                  Bonus : {bonus} PA
                                </div>
                                <button
                                  type="button"
                                  disabled={busy || credite}
                                  onClick={() => void crediterBonusPa(t.id, bonus)}
                                  style={{
                                    padding: "0.55rem 1rem",
                                    borderRadius: "4px",
                                    background: credite ? "transparent" : GOLD,
                                    color: credite ? GOLD : "#1a1a1a",
                                    fontWeight: 600,
                                    border: `1px solid ${GOLD}`,
                                    cursor: busy || credite ? "default" : "pointer",
                                    opacity: busy ? 0.6 : 1,
                                    fontSize: "0.85rem",
                                  }}
                                >
                                  {credite
                                    ? "✓ Bonus crédité"
                                    : busy
                                      ? "Crédit…"
                                      : "Créditer bonus PA"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </>
                );
              })()
            )}

            <div
              style={{
                marginTop: "2rem",
                paddingTop: "1.5rem",
                borderTop: "1px solid rgba(245,240,232,0.12)",
              }}
            >
              <h3
                style={{
                  fontSize: "0.95rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  opacity: 0.8,
                  margin: "0 0 1rem",
                }}
              >
                Emails autorisés (testeurs invités)
              </h3>
              {betaEmailsError ? (
                <p style={{ color: ROUGE, marginBottom: "0.75rem" }}>{betaEmailsError}</p>
              ) : null}

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  alignItems: "flex-end",
                  marginBottom: "1.25rem",
                }}
              >
                <div style={{ flex: "1 1 16rem", minWidth: "12rem" }}>
                  <span style={labelSm}>Email</span>
                  <input
                    type="email"
                    value={betaEmailDraft}
                    onChange={(e) => setBetaEmailDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !betaEmailAdding) void addBetaEmail();
                    }}
                    placeholder="testeur@gmail.com"
                    style={inputBase}
                  />
                </div>
                <div style={{ flex: "1 1 12rem", minWidth: "10rem" }}>
                  <span style={labelSm}>Nom testeur</span>
                  <input
                    type="text"
                    value={betaEmailNomDraft}
                    onChange={(e) => setBetaEmailNomDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !betaEmailAdding) void addBetaEmail();
                    }}
                    placeholder="Nom (optionnel)"
                    style={inputBase}
                  />
                </div>
                <button
                  type="button"
                  disabled={betaEmailAdding}
                  onClick={() => void addBetaEmail()}
                  style={{
                    padding: "0.65rem 1.25rem",
                    borderRadius: "4px",
                    background: GOLD,
                    color: "#000000",
                    fontWeight: 600,
                    border: `1px solid ${GOLD}`,
                    cursor: betaEmailAdding ? "wait" : "pointer",
                    opacity: betaEmailAdding ? 0.7 : 1,
                    fontSize: "0.9rem",
                  }}
                >
                  {betaEmailAdding ? "Ajout…" : "Ajouter"}
                </button>
              </div>

              {betaEmailsLoading ? (
                <p style={{ opacity: 0.65 }}>Chargement…</p>
              ) : (
                <div style={{ overflowX: "auto",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                  <table className="leve-admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                        {["Email", "Nom", "Statut", "Actions"].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: "0.65rem 0.5rem",
                              letterSpacing: "0.08em",
                              fontSize: "0.65rem",
                              textTransform: "uppercase",
                              opacity: 0.55,
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {betaEmails.map((row) => {
                        const busy = betaEmailBusyId === row.id;
                        return (
                          <tr key={row.id} style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                            <td style={{ padding: "0.6rem 0.5rem" }}>{row.email}</td>
                            <td style={{ padding: "0.6rem 0.5rem" }}>{row.nom_testeur ?? "—"}</td>
                            <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>
                              <span style={{ color: row.actif ? GOLD : "rgba(245,240,232,0.5)" }}>
                                {row.actif ? "Actif" : "Inactif"}
                              </span>
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void toggleBetaEmail(row)}
                                style={{
                                  marginRight: "0.5rem",
                                  padding: "0.4rem 0.85rem",
                                  borderRadius: "4px",
                                  background: "transparent",
                                  color: TEXT,
                                  border: "1px solid rgba(245,240,232,0.25)",
                                  cursor: busy ? "wait" : "pointer",
                                  opacity: busy ? 0.6 : 1,
                                  fontSize: "0.8rem",
                                }}
                              >
                                {row.actif ? "Désactiver" : "Activer"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void deleteBetaEmail(row)}
                                style={{
                                  padding: "0.4rem 0.85rem",
                                  borderRadius: "4px",
                                  background: "transparent",
                                  color: ROUGE,
                                  border: `1px solid ${ROUGE}`,
                                  cursor: busy ? "wait" : "pointer",
                                  opacity: busy ? 0.6 : 1,
                                  fontSize: "0.8rem",
                                }}
                              >
                                Supprimer
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {betaEmails.length === 0 ? (
                    <p style={{ opacity: 0.6, marginTop: "1rem" }}>Aucun email autorisé.</p>
                  ) : null}
                </div>
              )}
            </div>
          </section>

          {/* SECTION BUGS BETA */}
          <section id="section-bugs" style={cardStyle()}>
            {sectionTitle("BUGS BETA")}
            {betaBugsError ? (
              <p style={{ color: ROUGE, marginBottom: "0.75rem" }}>{betaBugsError}</p>
            ) : null}
            {betaBugsLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement…</p>
            ) : (
              (() => {
                const total = betaBugs.length;
                const ouvertsParSeverite = (sev: string) =>
                  betaBugs.filter((b) => b.severite === sev && b.statut === "ouvert").length;
                const p1 = ouvertsParSeverite("P1");
                const p2 = ouvertsParSeverite("P2");
                const p3 = ouvertsParSeverite("P3");
                const statCard = {
                  background: "rgba(245, 240, 232, 0.04)",
                  border: "1px solid rgba(245, 240, 232, 0.1)",
                  borderRadius: "4px",
                  padding: "0.85rem 1.1rem",
                  minWidth: "10rem",
                } as const;
                return (
                  <>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "1rem",
                        marginBottom: "1.25rem",
                      }}
                    >
                      <div style={statCard}>
                        <span style={labelSm}>Total bugs</span>
                        <strong style={{ color: GOLD, fontSize: "1.45rem" }}>{total}</strong>
                      </div>
                      <div style={statCard}>
                        <span style={labelSm}>P1 ouverts</span>
                        <strong
                          style={{ color: betaBugSeveriteCouleur("P1"), fontSize: "1.45rem" }}
                        >
                          {p1}
                        </strong>
                      </div>
                      <div style={statCard}>
                        <span style={labelSm}>P2 ouverts</span>
                        <strong
                          style={{ color: betaBugSeveriteCouleur("P2"), fontSize: "1.45rem" }}
                        >
                          {p2}
                        </strong>
                      </div>
                      <div style={statCard}>
                        <span style={labelSm}>P3 ouverts</span>
                        <strong
                          style={{ color: betaBugSeveriteCouleur("P3"), fontSize: "1.45rem" }}
                        >
                          {p3}
                        </strong>
                      </div>
                    </div>
                    <div style={{ overflowX: "auto",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                      <table className="leve-admin-table"
                        style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}
                      >
                        <thead>
                          <tr
                            style={{
                              textAlign: "left",
                              borderBottom: "1px solid rgba(245,240,232,0.12)",
                            }}
                          >
                            {["Sévérité", "Page", "Description", "Membre", "Date", "Statut", "Action"].map(
                              (h) => (
                                <th
                                  key={h}
                                  style={{
                                    padding: "0.65rem 0.5rem",
                                    letterSpacing: "0.08em",
                                    fontSize: "0.65rem",
                                    textTransform: "uppercase",
                                    opacity: 0.55,
                                  }}
                                >
                                  {h}
                                </th>
                              ),
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {betaBugs.map((bug) => {
                            const busy = betaBugBusyId === bug.id;
                            const couleur = betaBugSeveriteCouleur(bug.severite);
                            return (
                              <tr
                                key={bug.id}
                                style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}
                              >
                                <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "0.2rem 0.6rem",
                                      borderRadius: "4px",
                                      background: `${couleur}22`,
                                      color: couleur,
                                      border: `1px solid ${couleur}`,
                                      fontWeight: 700,
                                      fontSize: "0.72rem",
                                      letterSpacing: "0.04em",
                                    }}
                                  >
                                    {bug.severite}
                                  </span>
                                </td>
                                <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>
                                  {bug.page}
                                </td>
                                <td
                                  style={{
                                    padding: "0.6rem 0.5rem",
                                    minWidth: "16rem",
                                    maxWidth: "28rem",
                                  }}
                                >
                                  {bug.description}
                                </td>
                                <td
                                  style={{
                                    padding: "0.6rem 0.5rem",
                                    fontFamily: "monospace",
                                    fontSize: "0.72rem",
                                    opacity: 0.75,
                                  }}
                                >
                                  {bug.membre_id ?? "—"}
                                </td>
                                <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>
                                  {formatBetaDateHeure(bug.created_at)}
                                </td>
                                <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>
                                  {betaBugStatutLabel(bug.statut)}
                                </td>
                                <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>
                                  <select
                                    value={bug.statut}
                                    disabled={busy}
                                    onChange={(e) =>
                                      void changeBetaBugStatut(bug, e.target.value)
                                    }
                                    style={{
                                      padding: "0.4rem 0.6rem",
                                      borderRadius: "4px",
                                      background: "rgba(245,240,232,0.05)",
                                      color: TEXT,
                                      border: "1px solid rgba(245,240,232,0.25)",
                                      cursor: busy ? "wait" : "pointer",
                                      opacity: busy ? 0.6 : 1,
                                      fontSize: "0.8rem",
                                    }}
                                  >
                                    {BETA_BUG_STATUTS.map((s) => (
                                      <option key={s.value} value={s.value} style={{ color: BG }}>
                                        {s.label}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {total === 0 ? (
                        <p style={{ opacity: 0.6, marginTop: "1rem" }}>Aucun bug signalé.</p>
                      ) : null}
                    </div>
                  </>
                );
              })()
            )}
          </section>
        </main>
      )}
    </div>
  );
}

const labelSm = {
  display: "block",
  fontSize: "0.68rem",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  opacity: 0.5,
  marginBottom: "0.4rem",
} as const;

const inputBase = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.65rem 0.75rem",
  background: G3,
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "4px",
  color: TEXT,
  fontSize: "16px",
  minHeight: "44px",
} as const;

const btnFill = {
  background: GOLD,
  color: "#000000",
  border: `1px solid ${GOLD}`,
  borderRadius: "4px",
  fontWeight: 600,
  cursor: "pointer",
} as const;

const btnOutline = {
  background: "transparent",
  color: GOLD,
  border: `1px solid ${GOLD}`,
  borderRadius: "4px",
  fontWeight: 600,
  cursor: "pointer",
} as const;

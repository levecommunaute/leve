"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import React, {
  useCallback,
  useEffect,
  useState,
  type JSX,
} from "react";
import { RankBadge } from "../../components/rank-badge";
import { AppBottomNav } from "../../components/app-bottom-nav";
import { AppHeader } from "../../components/app-header";
import { EnDirectBanner } from "../../components/en-direct-banner";
import { MemberAvatar } from "../../components/member-avatar";
import { signOut } from "../../lib/auth";
import {
  PRESET_AVATARS,
  resolveAvatarMode,
  type AvatarMode,
} from "../../lib/avatar";
import { formatQuizTransactionLines } from "../../lib/quizTransactionDisplay";
import {
  getMonthlyMemberRankBadge,
  isCommunauteMemberType,
} from "../../lib/rank-badge";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";
import { checkJwtExpired, getSupabaseClient } from "../../lib/supabase";

const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
});

const BG = "var(--bg)";
const TEXT = "var(--text)";
const GOLD = "var(--accent)";
const ROUGE = "var(--accent-red)";

const SB = "https://lrolatbudvianeazliax.supabase.co";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

type CompteTab = "profil" | "banque" | "parametres";

const TABS: { id: CompteTab; label: string }[] = [
  { id: "profil", label: "PROFIL" },
  { id: "banque", label: "BANQUE" },
  { id: "parametres", label: "PARAMÈTRES" },
];

type ProfileRow = {
  display_name: string | null;
  email: string | null;
  member_type: string | null;
  multiplier: number | string | null;
  numero_membre: string | null;
  is_beta_tester: boolean | null;
  code_parrainage: string | null;
  profil_public: boolean | null;
  message_don: string | null;
  avatar_url: string | null;
  nom_legal: string | null;
  telephone: string | null;
  pays_residence_fiscale: string | null;
  palier_verification: number | string | null;
  retrait_methode: string | null;
  retrait_identifiant: string | null;
  retrait_gele_jusqua: string | null;
  notif_quiz: boolean | null;
  notif_redistribution: boolean | null;
  notif_concours: boolean | null;
  theme: string | null;
};

type PointsTxRow = {
  id: string;
  created_at: string;
  amount: number | string | null;
  type: string | null;
  description: string | null;
};

type BanqueMouvementRow = {
  id: string;
  created_at: string;
  montant: number | string | null;
  type: string | null;
  description: string | null;
};

type HistoryRow =
  | {
      id: string;
      created_at: string;
      kind: "points";
      amount: number;
      type: string | null;
      description: string | null;
    }
  | {
      id: string;
      created_at: string;
      kind: "dollars";
      amount: number;
      description: string;
    };

const MAX_MESSAGE_DON = 200;
const MIN_TRANSFER_CAD = 100;

const RETRAIT_METHODES = [
  "MonCash",
  "Xoom",
  "Remitly",
  "TAKSIMOTO",
  "Virement",
] as const;

const PROFIL_SELECT =
  "display_name,email,member_type,multiplier,numero_membre,is_beta_tester,code_parrainage,profil_public,message_don,avatar_url,nom_legal,telephone,pays_residence_fiscale,palier_verification,retrait_methode,retrait_identifiant,retrait_gele_jusqua,notif_quiz,notif_redistribution,notif_concours,theme";

function currentMonthDate(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function formatPmqPtValue(v: number): string {
  return `~$${v.toFixed(4)}/pt · Mois en cours`;
}

function transactionDescription(type: string | null | undefined): string {
  const t = (type ?? "").toLowerCase();
  if (t === "redistribution") return "Redistribution PMQ";
  if (
    t === "code" ||
    t === "video_code" ||
    t === "code_secret" ||
    t === "fragment"
  ) {
    return "Points code vidéo";
  }
  if (t === "quiz" || t === "quiz_bonus") return "Bonus quiz";
  if (t === "adjustment" || t === "manual") return "Ajustement solde";
  if (type?.trim()) return type.replace(/_/g, " ");
  return "Transaction";
}

function palierLabel(palier: number): string {
  if (palier >= 2) return "Palier 2 — vérifié";
  if (palier === 1) return "Palier 1 — partiel";
  return "Palier 0 — non vérifié";
}

const PP_PAGE_SIZE = 1000;

type MonthBounds = {
  startIso: string;
  endIso: string;
  monthDate: string;
  label: string;
};

function capitalizeFr(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function monthBoundsFor(year: number, monthIndex0: number): MonthBounds {
  const start = new Date(Date.UTC(year, monthIndex0, 1));
  const end = new Date(Date.UTC(year, monthIndex0 + 1, 1));
  const monthKey = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;
  const label =
    capitalizeFr(
      new Intl.DateTimeFormat("fr-CA", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(start),
    ) + " · UTC";
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    monthDate: `${monthKey}-01`,
    label,
  };
}

function currentAndPreviousMonthBounds(): {
  current: MonthBounds;
  previous: MonthBounds;
} {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const current = monthBoundsFor(y, m);
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  const previousStart = monthBoundsFor(prevY, prevM);
  return {
    current,
    previous: {
      startIso: previousStart.startIso,
      endIso: current.startIso,
      monthDate: previousStart.monthDate,
      label: previousStart.label,
    },
  };
}

function createdAtRangeFilter(bounds: MonthBounds): string {
  return (
    `&created_at=gte.${encodeURIComponent(bounds.startIso)}` +
    `&created_at=lt.${encodeURIComponent(bounds.endIso)}`
  );
}

async function fetchRestJson(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { apikey: KEY, Authorization: `Bearer ${token}` },
  });
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const message =
      json &&
      typeof json === "object" &&
      "message" in json &&
      typeof (json as { message: unknown }).message === "string"
        ? (json as { message: string }).message
        : null;
    await checkJwtExpired({ status: res.status, message });
    return null;
  }
  return json;
}

async function sumQuizPtsPonderesForMember(
  membreId: string,
  token: string,
  bounds: MonthBounds,
): Promise<number> {
  let total = 0;
  let offset = 0;
  for (;;) {
    const url =
      `${SB}/rest/v1/points_ponderes?membre_id=eq.${encodeURIComponent(membreId)}` +
      `&type=eq.quiz${createdAtRangeFilter(bounds)}` +
      `&select=pts_ponderes&offset=${offset}&limit=${PP_PAGE_SIZE}`;
    const data = await fetchRestJson(url, token);
    if (!Array.isArray(data)) break;
    for (const row of data) {
      total += Number((row as { pts_ponderes?: unknown }).pts_ponderes ?? 0);
    }
    if (data.length < PP_PAGE_SIZE) break;
    offset += PP_PAGE_SIZE;
  }
  return total;
}

function formatMemberTypeLabel(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "Communauté";
  const n = raw.trim();
  const lower = n.toLowerCase();
  if (lower === "communauté" || lower === "communaute" || n === "Communauté") {
    return "Communauté";
  }
  if (lower === "pionnier" || n === "Pionnier") return "Pionnier";
  if (lower === "fondateur" || n === "Fondateur") return "Fondateur";
  if (lower === "collaborateur" || n === "Collaborateur") return "Collaborateur";
  return n;
}

function displayNameFrom(profile: ProfileRow | null, session: Session): string {
  const meta = session.user.user_metadata as Record<string, unknown> | undefined;
  const fullName =
    typeof meta?.full_name === "string" ? meta.full_name : undefined;
  const displayName =
    typeof profile?.display_name === "string" ? profile.display_name.trim() : "";
  return displayName || fullName || session.user.email?.split("@")[0] || "Membre";
}

function memberTypeBadgeStyle(label: string): {
  background: string;
  color: string;
  border: string;
  fontFamily?: string;
} {
  if (label === "Fondateur" || label === "Pionnier") {
    return {
      background: "color-mix(in srgb, var(--accent) 12%, transparent)",
      color: GOLD,
      border: `1px solid ${GOLD}`,
      fontFamily: "var(--font-mono), ui-monospace, monospace",
    };
  }
  return {
    background: "color-mix(in srgb, var(--text) 4%, transparent)",
    color: "var(--text-55)",
    border: "1px solid var(--border-soft)",
  };
}

const pointsFmt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
const cad = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
});
const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});

function parametresSectionTitle(text: string): JSX.Element {
  return (
    <>
      <p
        className="leve-card-label"
        style={{
          margin: 0,
          fontSize: "0.72rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: GOLD,
          opacity: 0.95,
        }}
      >
        {text}
      </p>
      <div
        style={{
          borderBottom: "1px solid var(--border-soft)",
          margin: "0.55rem 0 1rem",
        }}
      />
    </>
  );
}

export default function ComptePage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [activeTab, setActiveTab] = useState<CompteTab>("profil");
  const [activeParamsTab, setActiveParamsTab] = useState<
    "public" | "identite" | "retrait" | "notifications"
  >("public");

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("initiales");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [draftAvatarMode, setDraftAvatarMode] =
    useState<AvatarMode>("initiales");
  const [messageDon, setMessageDon] = useState("");
  const [displayNameEdit, setDisplayNameEdit] = useState("");
  const [profilPublicSaving, setProfilPublicSaving] = useState(false);
  const [retraitMethode, setRetraitMethode] = useState("");
  const [retraitIdentifiant, setRetraitIdentifiant] = useState("");
  const [notifQuiz, setNotifQuiz] = useState(true);
  const [notifRedistribution, setNotifRedistribution] = useState(true);
  const [notifConcours, setNotifConcours] = useState(true);
  const [currentTheme, setCurrentTheme] = useState("A");
  const [themeLoading, setThemeLoading] = useState(false);
  const [availableThemes, setAvailableThemes] = useState<
    { theme_id: string; name: string }[]
  >([]);
  const [totalPointsPmq, setTotalPointsPmq] = useState(0);
  const [pmqMonthLabel, setPmqMonthLabel] = useState("");
  const [prevMonthLabel, setPrevMonthLabel] = useState("");
  const [prevMonthPtsPonderes, setPrevMonthPtsPonderes] = useState(0);
  const [prevMonthRedistributed, setPrevMonthRedistributed] = useState(false);
  const [monthlyPtsTotal, setMonthlyPtsTotal] = useState(0);
  const [pmqShare, setPmqShare] = useState<{
    mes_pts: number;
    total_pts: number;
    total_pts_pool: number;
    nb_membres_actifs: number;
    nb_membres_total: number;
    pourcentage: number;
  } | null>(null);
  const [soldeDollars, setSoldeDollars] = useState(0);
  const [pmqValuePerPoint, setPmqValuePerPoint] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [retraitOpen, setRetraitOpen] = useState(false);
  const [retraitPreview, setRetraitPreview] = useState<{
    montant: number;
    pourcentage: number;
    frais: number;
    montant_net: number;
    actif: boolean;
  } | null>(null);
  const [retraitLoading, setRetraitLoading] = useState(false);
  const [retraitSubmitting, setRetraitSubmitting] = useState(false);
  const [retraitError, setRetraitError] = useState<string | null>(null);
  const [retraitSuccess, setRetraitSuccess] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [referralCopied, setReferralCopied] = useState<"code" | "link" | null>(
    null,
  );

  const loadCompte = useCallback(async (activeSession: Session) => {
    const token = activeSession.access_token;
    const uid = activeSession.user.id;
    const { current: currentMonth, previous: prevMonth } =
      currentAndPreviousMonthBounds();

    setPmqMonthLabel(currentMonth.label);
    setPrevMonthLabel(prevMonth.label);
    setLoadError(null);

    const [
      profileRes,
      txRes,
      monthlyPts,
      prevMonthPts,
      prevHistRes,
      pmqShareRes,
      themesRes,
      banqueRes,
      pointsListRes,
      mouvementsRes,
      redistValueRes,
    ] = await Promise.all([
      fetchRestJson(
        `${SB}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=${PROFIL_SELECT}`,
        token,
      ),
      fetchRestJson(
        `${SB}/rest/v1/points_transactions?membre_id=eq.${encodeURIComponent(uid)}&type=eq.quiz` +
          `${createdAtRangeFilter(currentMonth)}&select=amount`,
        token,
      ),
      sumQuizPtsPonderesForMember(uid, token, currentMonth),
      sumQuizPtsPonderesForMember(uid, token, prevMonth),
      fetchRestJson(
        `${SB}/rest/v1/redistribution_history?month=eq.${encodeURIComponent(prevMonth.monthDate)}&select=month&limit=1`,
        token,
      ),
      fetch("/api/membres/pmq-share", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          const json = (await res.json().catch(() => null)) as {
            mes_pts?: unknown;
            total_pts?: unknown;
            total_pts_pool?: unknown;
            nb_membres_actifs?: unknown;
            nb_membres_total?: unknown;
            pourcentage?: unknown;
          } | null;
          if (!res.ok || !json) return null;
          const mes_pts = Number(json.mes_pts ?? 0);
          const total_pts = Number(json.total_pts ?? 0);
          const total_pts_pool = Number(
            json.total_pts_pool ?? json.total_pts ?? 0,
          );
          const nb_membres_actifs = Number(json.nb_membres_actifs ?? 0);
          const nb_membres_total = Number(json.nb_membres_total ?? 0);
          const pourcentage = Number(json.pourcentage ?? 0);
          if (
            !Number.isFinite(mes_pts) ||
            !Number.isFinite(total_pts) ||
            !Number.isFinite(total_pts_pool) ||
            !Number.isFinite(nb_membres_actifs) ||
            !Number.isFinite(nb_membres_total) ||
            !Number.isFinite(pourcentage)
          ) {
            return null;
          }
          return {
            mes_pts,
            total_pts,
            total_pts_pool,
            nb_membres_actifs,
            nb_membres_total,
            pourcentage,
          };
        })
        .catch(() => null),
      fetchRestJson(
        `${SB}/rest/v1/theme_config?enabled=eq.true&select=theme_id,name`,
        token,
      ),
      fetchRestJson(
        `${SB}/rest/v1/banque_membres?membre_id=eq.${encodeURIComponent(uid)}&select=solde_dollars`,
        token,
      ),
      fetchRestJson(
        `${SB}/rest/v1/points_transactions?membre_id=eq.${encodeURIComponent(uid)}&type=eq.quiz` +
          `&select=id,created_at,amount,type,description&order=created_at.desc&limit=20`,
        token,
      ),
      fetchRestJson(
        `${SB}/rest/v1/banque_membres_mouvements?membre_id=eq.${encodeURIComponent(uid)}` +
          `&select=id,created_at,montant,type,description&order=created_at.desc&limit=20`,
        token,
      ),
      fetchRestJson(
        `${SB}/rest/v1/redistribution_history?month=eq.${encodeURIComponent(currentMonthDate())}&select=value_per_point&limit=1`,
        token,
      ),
    ]);

    const profileData = Array.isArray(profileRes) ? profileRes[0] : null;
    const row = (profileData as ProfileRow | null) ?? null;
    setProfile(row);
    const nextAvatar =
      typeof row?.avatar_url === "string" ? row.avatar_url : null;
    setAvatarUrl(nextAvatar);
    setAvatarMode(resolveAvatarMode(nextAvatar));
    setMessageDon(typeof row?.message_don === "string" ? row.message_don : "");
    setDisplayNameEdit(
      typeof row?.display_name === "string" ? row.display_name : "",
    );
    setRetraitMethode(
      typeof row?.retrait_methode === "string" ? row.retrait_methode : "",
    );
    setRetraitIdentifiant(
      typeof row?.retrait_identifiant === "string"
        ? row.retrait_identifiant
        : "",
    );
    setNotifQuiz(row?.notif_quiz !== false);
    setNotifRedistribution(row?.notif_redistribution !== false);
    setNotifConcours(row?.notif_concours !== false);
    setCurrentTheme(
      typeof row?.theme === "string" && row.theme.trim() ? row.theme : "A",
    );
    setAvailableThemes(
      Array.isArray(themesRes)
        ? (themesRes as { theme_id: string; name: string }[])
        : [],
    );

    const txData = Array.isArray(txRes) ? txRes : [];
    const sum = txData.reduce(
      (acc: number, r: { amount: unknown }) => acc + Number(r.amount ?? 0),
      0,
    );
    setTotalPointsPmq(sum);
    setMonthlyPtsTotal(monthlyPts);
    setPrevMonthPtsPonderes(prevMonthPts);
    setPrevMonthRedistributed(
      Array.isArray(prevHistRes) && prevHistRes.length > 0,
    );
    setPmqShare(pmqShareRes);

    if (Array.isArray(banqueRes) && banqueRes[0]) {
      const n = Number(
        (banqueRes[0] as { solde_dollars?: unknown }).solde_dollars ?? 0,
      );
      setSoldeDollars(Number.isFinite(n) ? n : 0);
    } else {
      setSoldeDollars(0);
    }

    if (Array.isArray(redistValueRes) && redistValueRes[0]) {
      const raw = (redistValueRes[0] as { value_per_point?: unknown })
        .value_per_point;
      const n = raw != null && raw !== "" ? Number(raw) : Number.NaN;
      setPmqValuePerPoint(Number.isFinite(n) ? n : null);
    } else {
      setPmqValuePerPoint(null);
    }

    const merged: HistoryRow[] = [];
    if (Array.isArray(pointsListRes)) {
      for (const row of pointsListRes as PointsTxRow[]) {
        merged.push({
          id: `pt-${row.id}`,
          created_at: row.created_at,
          kind: "points",
          amount: Number(row.amount ?? 0),
          type: row.type,
          description: row.description ?? null,
        });
      }
    }
    if (Array.isArray(mouvementsRes)) {
      for (const row of mouvementsRes as BanqueMouvementRow[]) {
        merged.push({
          id: `bm-${row.id}`,
          created_at: row.created_at,
          kind: "dollars",
          amount: Number(row.montant ?? 0),
          description:
            row.description?.trim() ||
            (row.type === "redistribution"
              ? "Redistribution PMQ"
              : row.type?.replace(/_/g, " ") || "Crédit banque"),
        });
      }
    }
    merged.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    setHistory(merged.slice(0, 20));

    setDataLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function applyCookieSession(next: Session | null): Promise<void> {
      if (cancelled) return;
      if (!next) {
        setSession(null);
        router.replace("/");
        return;
      }
      setSession(next);
      await loadCompte(next);
    }

    function syncFromCookies(): void {
      void applyCookieSession(readSessionFromAuthCookies());
    }

    void applyCookieSession(readSessionFromAuthCookies());

    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        syncFromCookies();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const pollId = window.setInterval(syncFromCookies, 15000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(pollId);
    };
  }, [loadCompte, router]);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/");
    } catch {
      setSigningOut(false);
    }
  }

  async function copyReferral(
    value: string,
    kind: "code" | "link",
  ): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setReferralCopied(kind);
      window.setTimeout(() => setReferralCopied(null), 2000);
    } catch {
      /* ignore */
    }
  }

  async function openRetraitConfirm(): Promise<void> {
    if (!session || soldeDollars < MIN_TRANSFER_CAD) return;

    const nomLegal = profile?.nom_legal?.trim() ?? "";
    const telephone = profile?.telephone?.trim() ?? "";
    const paysFiscal = profile?.pays_residence_fiscale?.trim() ?? "";
    if (!nomLegal || !telephone || !paysFiscal) {
      setActiveTab("parametres");
      setLoadError("Complétez votre identité pour effectuer un retrait.");
      return;
    }

    const methode = profile?.retrait_methode?.trim() ?? "";
    if (!methode) {
      setActiveTab("parametres");
      setLoadError("Choisissez une méthode de paiement pour effectuer un retrait.");
      return;
    }

    setRetraitOpen(true);
    setRetraitError(null);
    setRetraitSuccess(null);
    setRetraitPreview(null);
    setRetraitLoading(true);

    try {
      const res = await fetch(
        `/api/frais-plateforme?montant=${encodeURIComponent(String(soldeDollars))}`,
      );
      const json = (await res.json()) as {
        error?: string;
        pourcentage?: number;
        frais?: number;
        montant_net?: number;
        actif?: boolean;
      };
      if (!res.ok) {
        setRetraitError(json.error ?? "Impossible de calculer les frais");
        return;
      }
      setRetraitPreview({
        montant: soldeDollars,
        pourcentage: Number(json.pourcentage ?? 0),
        frais: Number(json.frais ?? 0),
        montant_net: Number(json.montant_net ?? soldeDollars),
        actif: Boolean(json.actif),
      });
    } catch {
      setRetraitError("Erreur réseau");
    } finally {
      setRetraitLoading(false);
    }
  }

  function cancelRetrait(): void {
    setRetraitOpen(false);
    setRetraitPreview(null);
    setRetraitError(null);
  }

  async function confirmRetrait(): Promise<void> {
    if (!session || !retraitPreview) return;

    const geleUntil = profile?.retrait_gele_jusqua;
    if (
      typeof geleUntil === "string" &&
      geleUntil.trim() !== "" &&
      new Date(geleUntil).getTime() > Date.now()
    ) {
      setRetraitError(
        `Retraits gelés jusqu'au ${dateFmt.format(new Date(geleUntil))}`,
      );
      return;
    }

    const methode = profile?.retrait_methode?.trim() ?? "";
    if (!methode) {
      setRetraitOpen(false);
      setActiveTab("parametres");
      setLoadError("Choisissez une méthode de paiement pour effectuer un retrait.");
      return;
    }

    setRetraitSubmitting(true);
    setRetraitError(null);

    try {
      const res = await fetch("/api/banque/retrait", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ membre_id: session.user.id }),
      });
      const json = (await res.json()) as { error?: string; net?: number };
      if (!res.ok) {
        setRetraitError(json.error ?? "Retrait impossible");
        return;
      }
      setRetraitSuccess(
        `Retrait confirmé — vous recevrez ${cad.format(Number(json.net ?? retraitPreview.montant_net))}.`,
      );
      setRetraitOpen(false);
      setRetraitPreview(null);
      await loadCompte(session);
    } catch {
      setRetraitError("Erreur réseau");
    } finally {
      setRetraitSubmitting(false);
    }
  }

  async function changeTheme(themeId: string): Promise<void> {
    if (!session) return;
    setThemeLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("profiles")
        .update({ theme: themeId })
        .eq("id", session.user.id);
      if (!error) {
        setCurrentTheme(themeId);
        document.documentElement.setAttribute("data-theme", themeId);
      }
    } finally {
      setThemeLoading(false);
    }
  }

  async function handleSaveProfil(
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    if (!session) return false;
    setProfilPublicSaving(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/membres/profil", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as ProfileRow & { error?: string };
      if (!res.ok) {
        setLoadError(json.error ?? "Impossible de mettre à jour le profil.");
        return false;
      }
      setProfile((prev) => (prev ? { ...prev, ...json } : prev));
      if (json.message_don !== undefined) {
        setMessageDon(json.message_don ?? "");
      }
      if (json.display_name !== undefined) {
        setDisplayNameEdit(json.display_name ?? "");
      }
      if (json.avatar_url !== undefined) {
        const next = json.avatar_url ?? null;
        setAvatarUrl(next);
        setAvatarMode(resolveAvatarMode(next));
      }
      if (json.retrait_methode !== undefined) {
        setRetraitMethode(json.retrait_methode ?? "");
      }
      if (json.retrait_identifiant !== undefined) {
        setRetraitIdentifiant(json.retrait_identifiant ?? "");
      }
      if (json.notif_quiz !== undefined) setNotifQuiz(json.notif_quiz !== false);
      if (json.notif_redistribution !== undefined) {
        setNotifRedistribution(json.notif_redistribution !== false);
      }
      if (json.notif_concours !== undefined) {
        setNotifConcours(json.notif_concours !== false);
      }
      return true;
    } catch {
      setLoadError("Erreur réseau lors de la mise à jour du profil.");
      return false;
    } finally {
      setProfilPublicSaving(false);
    }
  }

  function openAvatarModal(): void {
    const mode = resolveAvatarMode(avatarUrl);
    setAvatarMode(mode);
    setDraftAvatarMode(mode);
    setAvatarModalOpen(true);
  }

  function closeAvatarModal(): void {
    if (avatarUploading || profilPublicSaving) return;
    setAvatarModalOpen(false);
    setDraftAvatarMode(resolveAvatarMode(avatarUrl));
    setAvatarMode(resolveAvatarMode(avatarUrl));
  }

  async function handleSelectAvatarMode(mode: AvatarMode): Promise<void> {
    setDraftAvatarMode(mode);
    if (mode === "initiales") {
      const ok = await handleSaveProfil({ avatar_url: null });
      if (ok) setAvatarModalOpen(false);
    }
  }

  async function handleSelectPresetEmoji(emoji: string): Promise<void> {
    setDraftAvatarMode("avatar");
    setAvatarMode("avatar");
    const ok = await handleSaveProfil({ avatar_url: emoji });
    if (ok) {
      setAvatarUrl(emoji);
      setAvatarModalOpen(false);
    }
  }

  async function handleUploadAvatarPhoto(file: File): Promise<void> {
    if (!session) return;
    setAvatarUploading(true);
    setLoadError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/membres/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body,
      });
      const json = (await res.json()) as {
        error?: string;
        avatar_url?: string;
      };
      if (!res.ok) {
        setLoadError(json.error ?? "Échec de l'upload de la photo.");
        return;
      }
      const next = json.avatar_url ?? null;
      setAvatarUrl(next);
      setAvatarMode("photo");
      setDraftAvatarMode("photo");
      setProfile((prev) => (prev ? { ...prev, avatar_url: next } : prev));
      setAvatarModalOpen(false);
    } catch {
      setLoadError("Erreur réseau lors de l'upload de la photo.");
    } finally {
      setAvatarUploading(false);
    }
  }

  const fonts = `${bebas.variable} ${dmSans.variable}`;

  if (session === undefined) {
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
        <p style={{ opacity: 0.7 }}>Chargement…</p>
      </div>
    );
  }

  if (session && !dataLoaded) {
    return (
      <div
        style={{
          background: "var(--bg)",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "color-mix(in srgb, var(--accent) 40%, transparent)",
          }}
        >
          Chargement...
        </p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const name = displayNameFrom(profile, session);
  const memberLabel = formatMemberTypeLabel(profile?.member_type ?? null);
  const memberBadge = memberTypeBadgeStyle(memberLabel);
  const effectiveAvatarUrl = avatarUrl;
  const mult = Number(profile?.multiplier ?? 1);
  const profileMultiplier = Number.isFinite(mult) && mult > 0 ? mult : 1;
  const multiplierDisplay = `${profileMultiplier.toFixed(1)}×`;
  const weightedPointsPmq = monthlyPtsTotal;
  const showRankBadge = isCommunauteMemberType(profile?.member_type);
  const monthlyRankBadge = showRankBadge
    ? getMonthlyMemberRankBadge(monthlyPtsTotal)
    : null;
  const emailDisplay =
    (typeof profile?.email === "string" ? profile.email.trim() : "") ||
    (typeof session.user.email === "string" ? session.user.email.trim() : "") ||
    "—";
  const referralCode =
    typeof profile?.code_parrainage === "string" &&
    profile.code_parrainage.trim()
      ? profile.code_parrainage.trim().toUpperCase()
      : null;
  const referralLink = referralCode
    ? `${window.location.origin}/?ref=${encodeURIComponent(referralCode)}`
    : null;
  const profilPublic = Boolean(profile?.profil_public);
  const palierVerification = Number(profile?.palier_verification ?? 0);
  const retraitGeleJusqua =
    typeof profile?.retrait_gele_jusqua === "string"
      ? profile.retrait_gele_jusqua
      : null;
  const retraitGeleActif =
    Boolean(retraitGeleJusqua) &&
    new Date(retraitGeleJusqua as string).getTime() > Date.now();
  let retraitGeleLabel = "";
  if (retraitGeleActif && retraitGeleJusqua) {
    try {
      retraitGeleLabel = dateFmt.format(new Date(retraitGeleJusqua));
    } catch {
      retraitGeleLabel = retraitGeleJusqua;
    }
  }

  const fieldLabelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.72rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: 0.55,
    marginBottom: "0.35rem",
  };
  const fieldInputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.55rem 0.75rem",
    borderRadius: "4px",
    border: "1px solid var(--border-strong)",
    background: "var(--bg)",
    color: TEXT,
    fontSize: "0.95rem",
    fontFamily: "inherit",
  };
  const saveBtnStyle: React.CSSProperties = {
    marginTop: "1rem",
    background: GOLD,
    color: BG,
    border: "none",
    borderRadius: "4px",
    padding: "0.55rem 1.1rem",
    fontSize: "0.85rem",
    fontWeight: 700,
    cursor: profilPublicSaving ? "wait" : "pointer",
    opacity: profilPublicSaving ? 0.6 : 1,
  };
  const parametresCardStyle: React.CSSProperties = {
    borderRadius: "4px",
    padding: "1.25rem 1.1rem",
    marginBottom: "1.25rem",
    background: "var(--bg-card)",
    border: "1px solid var(--border-soft)",
  };

  const canTransfer = soldeDollars >= MIN_TRANSFER_CAD;
  const progressPct = Math.min(
    100,
    Math.max(0, (soldeDollars / MIN_TRANSFER_CAD) * 100),
  );
  const moisCourantLabel =
    new Date()
      .toLocaleDateString("fr-CA", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
      .toUpperCase() + " · UTC";
  const typeMembre = profile?.member_type?.trim() || "—";
  const banqueWeightedPts = totalPointsPmq * profileMultiplier;
  const estimation =
    pmqValuePerPoint != null && Number.isFinite(pmqValuePerPoint)
      ? totalPointsPmq * pmqValuePerPoint
      : 0;

  function renderHistoryEntry(row: HistoryRow): {
    dateLabel: string;
    label: string;
    signed: string;
    color: string;
    quizLines: ReturnType<typeof formatQuizTransactionLines> | null;
    isDollars: boolean;
  } {
    const amt = row.amount;
    const isDollars = row.kind === "dollars";
    const signed = isDollars
      ? amt > 0
        ? `+${cad.format(amt)}`
        : cad.format(amt)
      : amt > 0
        ? `+${pointsFmt.format(amt)} pts`
        : `${pointsFmt.format(amt)} pts`;
    const color = amt >= 0 ? GOLD : ROUGE;
    const isQuizPoints = !isDollars && (row.type ?? "").toLowerCase() === "quiz";
    const quizLines = isQuizPoints
      ? formatQuizTransactionLines(row.amount, row.description, profileMultiplier)
      : null;
    const label = isDollars
      ? row.description
      : transactionDescription(row.type);
    let dateLabel = "—";
    try {
      dateLabel = dateFmt.format(new Date(row.created_at));
    } catch {
      dateLabel = row.created_at;
    }
    return { dateLabel, label, signed, color, quizLines, isDollars };
  }

  return (
    <div
      className={`${fonts} leve-page-compte`}
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        paddingBottom: "6rem",
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .banque-solde-amount {
              font-size: clamp(1.5rem, 5vw, 2.5rem) !important;
            }
            .banque-transfer-btn {
              min-height: 44px;
            }
            .banque-history-cards {
              display: none;
              flex-direction: column;
              gap: 0.65rem;
            }
            .banque-history-card {
              border-radius: 4px;
              padding: 1rem;
              background: color-mix(in srgb, var(--text) 4%, transparent);
              border: 1px solid var(--border-soft);
            }
            @media (max-width: 479px) {
              .banque-history-table-wrap {
                display: none !important;
              }
              .banque-history-cards {
                display: flex !important;
              }
            }
          `,
        }}
      />
      <EnDirectBanner />
      <AppHeader
        displayName={name}
        onSignOut={() => void handleSignOut()}
        signingOut={signingOut}
        rightExtra={
          <MemberAvatar
            displayName={name}
            avatarUrl={effectiveAvatarUrl}
            size={28}
          />
        }
      />

      <main
        className={activeTab === "banque" ? "leve-page-banque" : "leve-page-profil"}
        style={{ maxWidth: "960px", margin: "0 auto", padding: "1.25rem" }}
      >
        <nav
          role="tablist"
          aria-label="Compte"
          style={{
            display: "flex",
            width: "100%",
            borderBottom: "1px solid var(--border-soft)",
            marginBottom: "1.5rem",
          }}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  borderBottom: active
                    ? `2px solid ${GOLD}`
                    : "2px solid transparent",
                  color: active ? GOLD : TEXT,
                  opacity: active ? 1 : 0.4,
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.65rem",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  padding: "0.85rem 0.5rem",
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {activeTab === "profil" ? (
          <>
            {loadError ? (
              <p
                role="alert"
                style={{
                  color: ROUGE,
                  fontSize: "0.9rem",
                  marginBottom: "1rem",
                }}
              >
                {loadError}
              </p>
            ) : null}

            <section
              className="leve-hero"
              style={{
                borderRadius: "4px",
                padding: "1.75rem 1.5rem",
                marginBottom: "1.25rem",
                background: "var(--bg-card)",
                borderTop: `2px solid ${GOLD}`,
                borderLeft: "1px solid var(--border-soft)",
                borderRight: "1px solid var(--border-soft)",
                borderBottom: "1px solid var(--border-soft)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "1rem",
                  marginBottom: "0.75rem",
                }}
              >
                <MemberAvatar
                  displayName={name}
                  avatarUrl={effectiveAvatarUrl}
                  size={52}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      opacity: 0.65,
                      fontSize: "0.85rem",
                      fontFamily: "var(--font-mono), ui-monospace, monospace",
                    }}
                  >
                    Profil membre
                    {profile?.numero_membre
                      ? ` · #${profile.numero_membre}`
                      : ""}
                  </p>
                  <h1
                    style={{
                      fontFamily: "var(--font-mono), ui-monospace, monospace",
                      fontSize: "clamp(2rem, 7vw, 3rem)",
                      letterSpacing: "0.04em",
                      margin: "0.35rem 0 0",
                      lineHeight: 1.05,
                      color: TEXT,
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span>{name}</span>
                    {showRankBadge ? (
                      <RankBadge ptsPonderes={weightedPointsPmq} size="md" />
                    ) : null}
                  </h1>
                </div>
              </div>
              <span
                style={{
                  display: "inline-block",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "4px",
                  ...memberBadge,
                }}
              >
                {memberLabel}
              </span>
              {monthlyRankBadge ? (
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      marginTop: "0.6rem",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      padding: "0.3rem 0.65rem",
                      borderRadius: "4px",
                      background: monthlyRankBadge.background,
                      color: monthlyRankBadge.color,
                      border: monthlyRankBadge.border,
                    }}
                  >
                    {monthlyRankBadge.emoji} {monthlyRankBadge.label}
                  </span>
                </div>
              ) : null}
              {profile?.is_beta_tester ? (
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      marginTop: "0.6rem",
                      background:
                        "color-mix(in srgb, var(--accent) 14%, transparent)",
                      color: GOLD,
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      padding: "0.3rem 0.65rem",
                      borderRadius: "4px",
                      border:
                        "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                    }}
                  >
                    🧪 Testeur Beta
                  </span>
                </div>
              ) : null}
            </section>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "0.85rem",
                marginBottom: "1.75rem",
                fontFamily: "var(--font-mono), ui-monospace, monospace",
              }}
            >
              <article
                className="leve-card"
                style={{
                  position: "relative",
                  borderRadius: "4px",
                  padding: "1.1rem 1.1rem 2.35rem",
                  background: "var(--bg-card)",
                  border:
                    "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                }}
              >
                <p
                  className="profil-stat-label leve-card-label"
                  style={{
                    margin: 0,
                    fontSize: "0.72rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: GOLD,
                    opacity: 0.95,
                  }}
                >
                  {pmqMonthLabel
                    ? `Points PMQ · ${pmqMonthLabel}`
                    : "Points PMQ"}
                </p>
                <p
                  className="leve-card-value"
                  style={{
                    margin: "0.5rem 0 0",
                    fontSize: "1.65rem",
                    fontWeight: 700,
                    color: GOLD,
                  }}
                >
                  {pointsFmt.format(totalPointsPmq)}
                </p>
                <p
                  className="profil-stat-label"
                  style={{
                    margin: "0.75rem 0 0",
                    fontSize: "0.68rem",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    opacity: 0.5,
                  }}
                >
                  {pmqMonthLabel
                    ? `Points pondérés · ${pmqMonthLabel}`
                    : "Points pondérés (base redistribution)"}
                </p>
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    opacity: 0.75,
                  }}
                >
                  {pointsFmt.format(weightedPointsPmq)}
                </p>
                <p
                  style={{
                    margin: "0.3rem 0 0",
                    fontSize: "0.7rem",
                    opacity: 0.45,
                    lineHeight: 1.4,
                  }}
                >
                  Vos points × multiplicateur ×{profileMultiplier.toFixed(1)} —
                  utilisés pour calculer votre part de redistribution
                </p>
                {prevMonthLabel ? (
                  <p
                    style={{
                      position: "absolute",
                      right: "1.1rem",
                      bottom: "0.65rem",
                      margin: 0,
                      maxWidth: "100%",
                      textAlign: "right",
                      fontSize: "0.68rem",
                      opacity: 0.45,
                      lineHeight: 1.35,
                    }}
                  >
                    PMQ {prevMonthLabel} ·{" "}
                    {pointsFmt.format(prevMonthPtsPonderes)} pts →{" "}
                    {prevMonthRedistributed ? (
                      <Link
                        href="/banque"
                        style={{
                          color: "inherit",
                          textDecoration: "underline",
                          textUnderlineOffset: "2px",
                        }}
                      >
                        ✓ Consulter votre banque
                      </Link>
                    ) : (
                      "Redistribution en cours"
                    )}
                  </p>
                ) : null}
              </article>

              <article
                className="leve-card"
                style={{
                  borderRadius: "4px",
                  padding: "1.1rem",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-soft)",
                  borderTop: "2px solid var(--accent)",
                }}
              >
                <p
                  className="profil-stat-label leve-card-label"
                  style={{
                    margin: 0,
                    fontSize: "0.72rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    opacity: 0.55,
                  }}
                >
                  Multiplicateur
                </p>
                {pmqShare ? (
                  <div style={{ marginTop: "0.5rem" }}>
                    <p
                      className="leve-card-value"
                      style={{
                        margin: 0,
                        fontSize: "0.95rem",
                        fontWeight: 600,
                        color: GOLD,
                        fontFamily: "var(--font-mono), ui-monospace, monospace",
                        lineHeight: 1.35,
                      }}
                    >
                      {pmqShare.total_pts <= 0
                        ? `×${profileMultiplier.toFixed(1)} · Aucun quiz complété ce mois`
                        : `×${profileMultiplier.toFixed(1)} · ${pointsFmt.format(pmqShare.mes_pts)} pts · ${pmqShare.pourcentage.toFixed(1)}% du pool PMQ · ${pmqMonthLabel}`}
                    </p>
                    <div
                      style={{
                        marginTop: "0.55rem",
                        height: 3,
                        borderRadius: 2,
                        background:
                          "color-mix(in srgb, var(--accent) 18%, transparent)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(
                            100,
                            Math.max(
                              0,
                              pmqShare.total_pts > 0
                                ? pmqShare.pourcentage
                                : 0,
                            ),
                          )}%`,
                          background: GOLD,
                          borderRadius: 2,
                          transition: "width 0.35s ease",
                        }}
                      />
                    </div>
                    {pmqShare.total_pts > 0 ? (
                      <p
                        style={{
                          margin: "0.45rem 0 0",
                          fontSize: "0.65rem",
                          lineHeight: 1.35,
                          opacity: 0.45,
                          fontFamily:
                            "var(--font-mono), ui-monospace, monospace",
                        }}
                      >
                        {pmqShare.nb_membres_actifs} /{" "}
                        {pmqShare.nb_membres_total} membres actifs ce mois ·{" "}
                        {pointsFmt.format(pmqShare.total_pts_pool)} pts au total
                        dans le pool
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p
                    className="leve-card-value"
                    style={{
                      margin: "0.5rem 0 0",
                      fontSize: "1.65rem",
                      fontWeight: 700,
                      color: GOLD,
                    }}
                  >
                    {multiplierDisplay}
                  </p>
                )}
              </article>
            </div>

            <section
              style={{
                borderRadius: "4px",
                padding: "1.25rem 1.1rem",
                marginBottom: "1.75rem",
                background: "var(--bg-card)",
                border: "1px solid var(--border-soft)",
              }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  fontSize: "1.35rem",
                  letterSpacing: "0.06em",
                  color: ROUGE,
                  margin: "0 0 1rem",
                }}
              >
                Informations
              </h2>
              <dl
                style={{
                  margin: 0,
                  display: "grid",
                  gap: "0.85rem",
                  fontSize: "0.95rem",
                }}
              >
                <div>
                  <dt
                    style={{
                      opacity: 0.55,
                      fontSize: "0.72rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Type de membre
                  </dt>
                  <dd style={{ margin: "0.25rem 0 0" }}>{memberLabel}</dd>
                </div>
                <div>
                  <dt
                    style={{
                      opacity: 0.55,
                      fontSize: "0.72rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Numéro membre
                  </dt>
                  <dd style={{ margin: "0.25rem 0 0" }}>
                    {profile?.numero_membre != null &&
                    String(profile.numero_membre).trim()
                      ? `#${profile.numero_membre}`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt
                    style={{
                      opacity: 0.55,
                      fontSize: "0.72rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Courriel
                  </dt>
                  <dd style={{ margin: "0.25rem 0 0", wordBreak: "break-word" }}>
                    {emailDisplay}
                  </dd>
                </div>
              </dl>
            </section>

            <section
              style={{
                borderRadius: "4px",
                padding: "1.25rem 1.1rem",
                marginBottom: "1.75rem",
                background: "var(--bg-card)",
                border:
                  "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
              }}
            >
              <p
                className="leve-card-label"
                style={{
                  margin: 0,
                  fontSize: "0.72rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: GOLD,
                  opacity: 0.95,
                }}
              >
                CODE PARRAINAGE
              </p>
              {referralCode ? (
                <>
                  <p
                    style={{
                      margin: "0.65rem 0 1rem",
                      fontFamily: "var(--font-mono), ui-monospace, monospace",
                      fontSize: "1.35rem",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: GOLD,
                    }}
                  >
                    {referralCode}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.65rem",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => void copyReferral(referralCode, "code")}
                      style={{
                        background: "transparent",
                        color: TEXT,
                        border: "1px solid var(--border-strong)",
                        borderRadius: "4px",
                        padding: "0.45rem 0.85rem",
                        fontSize: "0.78rem",
                        cursor: "pointer",
                      }}
                    >
                      {referralCopied === "code" ? "Copié !" : "Copier le code"}
                    </button>
                    {referralLink ? (
                      <button
                        type="button"
                        onClick={() => void copyReferral(referralLink, "link")}
                        style={{
                          background: "transparent",
                          color: TEXT,
                          border: "1px solid var(--border-strong)",
                          borderRadius: "4px",
                          padding: "0.45rem 0.85rem",
                          fontSize: "0.78rem",
                          cursor: "pointer",
                        }}
                      >
                        {referralCopied === "link"
                          ? "Copié !"
                          : "Copier le lien"}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <p
                  style={{
                    margin: "0.65rem 0 0",
                    opacity: 0.65,
                    fontSize: "0.95rem",
                  }}
                >
                  Votre code parrainage sera disponible prochainement.
                </p>
              )}
            </section>
          </>
        ) : null}

        {activeTab === "banque" ? (
          <>
            {loadError ? (
              <p
                role="alert"
                style={{
                  color: ROUGE,
                  fontSize: "0.9rem",
                  marginBottom: "1rem",
                }}
              >
                {loadError}
              </p>
            ) : null}

            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.55rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: 0.3,
                marginBottom: "0.4rem",
              }}
            >
              MA BANQUE · LEVE MÉDIA INC.
            </p>
            <h1
              style={{
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "clamp(2rem, 8vw, 3.5rem)",
                lineHeight: 0.88,
                letterSpacing: "0.02em",
                marginBottom: "1.25rem",
              }}
            >
              BANQUE
              <br />
              <span style={{ color: GOLD }}>LEVE</span>
            </h1>

            <section
              className="leve-card"
              style={{
                borderRadius: "4px",
                padding: "1.5rem 1.35rem",
                marginBottom: "1rem",
                background: "var(--bg-card)",
                borderTop: "2px solid var(--accent)",
                border: "1px solid var(--border-soft)",
              }}
            >
              <p
                className="leve-card-label"
                style={{
                  margin: 0,
                  fontSize: "0.72rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  opacity: 0.3,
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                }}
              >
                SOLDE BANQUE · {moisCourantLabel}
              </p>
              <p
                className="banque-solde-amount leve-card-value"
                style={{
                  margin: "0.35rem 0 0.15rem",
                  fontSize: "clamp(2.25rem, 7vw, 3rem)",
                  fontWeight: 800,
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                  letterSpacing: "-0.02em",
                  color: GOLD,
                }}
              >
                {cad.format(soldeDollars)}
              </p>
              <p
                style={{
                  margin: "0.85rem 0 0.35rem",
                  fontSize: "0.78rem",
                  opacity: 0.75,
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                }}
              >
                Seuil de retrait : {cad.format(MIN_TRANSFER_CAD)}
              </p>
              <div
                style={{
                  height: "8px",
                  borderRadius: "4px",
                  background: "var(--border-soft)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progressPct}%`,
                    borderRadius: "4px",
                    background: canTransfer ? GOLD : ROUGE,
                    transition: "width 0.35s ease",
                  }}
                />
              </div>
              <p
                style={{
                  margin: "0.45rem 0 0",
                  fontSize: "0.78rem",
                  opacity: 0.7,
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                }}
              >
                {canTransfer
                  ? "Seuil atteint — transfert disponible"
                  : `${progressPct.toFixed(0)} % vers le seuil de ${cad.format(MIN_TRANSFER_CAD)}`}
              </p>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.58rem",
                  opacity: 0.35,
                  marginTop: "0.35rem",
                }}
              >
                Minimum $100 pour transférer · PayPal · Virement · Mobile Money
              </p>
            </section>

            <section
              className="leve-card"
              style={{
                borderRadius: "4px",
                padding: "1.5rem 1.35rem",
                marginBottom: "1.5rem",
                background: "var(--bg-card)",
                borderTop: `2px solid ${GOLD}`,
                borderRight: "1px solid var(--border-soft)",
                borderBottom: "1px solid var(--border-soft)",
                borderLeft: "1px solid var(--border-soft)",
                color: TEXT,
              }}
            >
              <p
                className="leve-card-label"
                style={{
                  margin: 0,
                  fontSize: "0.72rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  opacity: 0.85,
                  color: GOLD,
                }}
              >
                POINTS PMQ · {moisCourantLabel}
              </p>
              <p
                className="leve-card-value"
                style={{
                  margin: "0.35rem 0 0.15rem",
                  fontSize: "clamp(2.25rem, 7vw, 3rem)",
                  fontWeight: 800,
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                  letterSpacing: "-0.02em",
                  color: GOLD,
                }}
              >
                {pointsFmt.format(totalPointsPmq)} pts
              </p>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.65rem",
                  opacity: 0.45,
                  marginTop: "0.2rem",
                }}
              >
                Multiplicateur ×{profileMultiplier} · {typeMembre}
              </p>
              <p
                style={{
                  margin: "0.55rem 0 0",
                  fontSize: "0.78rem",
                  letterSpacing: "0.04em",
                  opacity: 0.75,
                  lineHeight: 1.4,
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                }}
              >
                {pmqValuePerPoint != null
                  ? formatPmqPtValue(pmqValuePerPoint)
                  : "(Revenus × 45%) ÷ Total pts · Variable mensuel"}
              </p>
              <p
                style={{
                  margin: "0.68rem 0 0",
                  fontSize: "0.68rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  opacity: 0.65,
                }}
              >
                Points pondérés (base redistribution)
              </p>
              <p
                style={{
                  margin: "0.2rem 0 0",
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  opacity: 0.85,
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                }}
              >
                {pointsFmt.format(banqueWeightedPts)} pts
              </p>
              <p
                style={{
                  margin: "0.3rem 0 0",
                  fontSize: "0.72rem",
                  opacity: 0.65,
                  lineHeight: 1.4,
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                }}
              >
                Vos points × multiplicateur ×{profileMultiplier.toFixed(1)} —
                utilisés pour calculer votre part de redistribution
              </p>
              <div
                style={{
                  borderTop: "1px solid var(--border-soft)",
                  marginTop: "0.85rem",
                  paddingTop: "0.85rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.52rem",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    opacity: 0.28,
                  }}
                >
                  ESTIMATION REDISTRIB.
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.9rem",
                    color: "var(--accent-green)",
                    fontWeight: 700,
                  }}
                >
                  {estimation > 0 ? `≈ $${estimation.toFixed(0)}` : "—"}
                </span>
              </div>
            </section>

            {!canTransfer ? (
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.65rem",
                  color: ROUGE,
                  opacity: 0.8,
                  margin: "0.5rem 0",
                }}
              >
                🔒 Solde insuffisant · $
                {(MIN_TRANSFER_CAD - soldeDollars).toFixed(2)} manquants
              </p>
            ) : null}

            <div
              style={{
                marginBottom: "2rem",
                fontFamily: "var(--font-mono), ui-monospace, monospace",
              }}
            >
              <button
                type="button"
                className="banque-transfer-btn"
                disabled={!canTransfer}
                onClick={() => void openRetraitConfirm()}
                style={{
                  width: "100%",
                  maxWidth: "420px",
                  padding: "0.85rem 1.25rem",
                  borderRadius: "4px",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  border: canTransfer
                    ? "1px solid color-mix(in srgb, var(--accent) 40%, transparent)"
                    : "2px solid var(--border-strong)",
                  background: canTransfer ? "transparent" : "var(--border-soft)",
                  color: canTransfer ? GOLD : "var(--text-40)",
                  cursor: canTransfer ? "pointer" : "not-allowed",
                }}
              >
                Transférer vers mon compte
              </button>

              {retraitOpen ? (
                <div
                  role="presentation"
                  onClick={cancelRetrait}
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 100,
                    background: "color-mix(in srgb, var(--bg) 72%, transparent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "1.25rem",
                  }}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="compte-retrait-confirm-title"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      maxWidth: "28rem",
                      width: "100%",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-strong)",
                      borderRadius: "4px",
                      padding: "1.35rem 1.5rem",
                    }}
                  >
                    <h3
                      id="compte-retrait-confirm-title"
                      style={{
                        margin: "0 0 1rem",
                        fontFamily: "var(--font-bebas), Impact, sans-serif",
                        fontSize: "1.25rem",
                        letterSpacing: "0.08em",
                        color: GOLD,
                      }}
                    >
                      Confirmer le transfert
                    </h3>

                    {retraitGeleActif ? (
                      <p
                        role="alert"
                        style={{
                          margin: "0 0 1rem",
                          padding: "0.7rem 0.85rem",
                          borderRadius: "4px",
                          background:
                            "color-mix(in srgb, var(--accent-red) 14%, transparent)",
                          border: `1px solid ${ROUGE}`,
                          color: ROUGE,
                          fontSize: "0.88rem",
                          fontWeight: 600,
                        }}
                      >
                        Retraits gelés jusqu&apos;au {retraitGeleLabel}
                      </p>
                    ) : null}

                    {retraitLoading ? (
                      <p style={{ opacity: 0.7, margin: 0 }}>
                        Calcul des frais…
                      </p>
                    ) : retraitPreview ? (
                      <div style={{ fontSize: "0.92rem", lineHeight: 1.7 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "1rem",
                          }}
                        >
                          <span style={{ opacity: 0.85 }}>Montant demandé</span>
                          <span style={{ fontWeight: 700 }}>
                            {cad.format(retraitPreview.montant)}
                          </span>
                        </div>
                        {retraitPreview.actif && retraitPreview.frais > 0 ? (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "1rem",
                              color: ROUGE,
                              fontFamily:
                                "var(--font-mono), ui-monospace, monospace",
                            }}
                          >
                            <span>
                              Frais plateforme{" "}
                              {retraitPreview.pourcentage % 1 === 0
                                ? retraitPreview.pourcentage.toFixed(0)
                                : retraitPreview.pourcentage}
                              %
                            </span>
                            <span style={{ fontWeight: 700 }}>
                              -{cad.format(retraitPreview.frais)}
                            </span>
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "1rem",
                              fontFamily:
                                "var(--font-mono), ui-monospace, monospace",
                            }}
                          >
                            <span style={{ opacity: 0.85 }}>
                              Frais plateforme
                            </span>
                            <span style={{ fontWeight: 700 }}>
                              {cad.format(0)}
                            </span>
                          </div>
                        )}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "1rem",
                            marginTop: "0.5rem",
                            paddingTop: "0.65rem",
                            borderTop: "1px solid var(--border-soft)",
                            fontFamily:
                              "var(--font-mono), ui-monospace, monospace",
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>Vous recevrez</span>
                          <span
                            style={{
                              fontWeight: 800,
                              color: GOLD,
                              fontSize: "1.05rem",
                            }}
                          >
                            {cad.format(retraitPreview.montant_net)}
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {retraitError ? (
                      <p
                        role="alert"
                        style={{
                          color: ROUGE,
                          margin: "0.85rem 0 0",
                          fontSize: "0.88rem",
                        }}
                      >
                        {retraitError}
                      </p>
                    ) : null}

                    <div
                      style={{
                        display: "flex",
                        gap: "0.65rem",
                        marginTop: "1.15rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        type="button"
                        disabled={
                          retraitSubmitting ||
                          retraitLoading ||
                          !retraitPreview ||
                          retraitGeleActif
                        }
                        onClick={() => void confirmRetrait()}
                        style={{
                          flex: "1 1 140px",
                          padding: "0.75rem 1rem",
                          borderRadius: "4px",
                          fontWeight: 700,
                          fontSize: "0.9rem",
                          border: "none",
                          background: ROUGE,
                          color: TEXT,
                          cursor:
                            retraitSubmitting ||
                            retraitLoading ||
                            !retraitPreview ||
                            retraitGeleActif
                              ? "wait"
                              : "pointer",
                          opacity:
                            retraitSubmitting ||
                            retraitLoading ||
                            !retraitPreview ||
                            retraitGeleActif
                              ? 0.6
                              : 1,
                        }}
                      >
                        {retraitSubmitting
                          ? "En cours…"
                          : "Confirmer le transfert"}
                      </button>
                      <button
                        type="button"
                        disabled={retraitSubmitting}
                        onClick={cancelRetrait}
                        style={{
                          flex: "1 1 100px",
                          padding: "0.75rem 1rem",
                          borderRadius: "4px",
                          fontWeight: 600,
                          fontSize: "0.9rem",
                          border: "1px solid var(--border-strong)",
                          background: "transparent",
                          color: TEXT,
                          cursor: retraitSubmitting ? "wait" : "pointer",
                        }}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {retraitSuccess ? (
                <p
                  role="status"
                  style={{
                    margin: "0.75rem 0 0",
                    fontSize: "0.88rem",
                    color: GOLD,
                    maxWidth: "420px",
                  }}
                >
                  {retraitSuccess}
                </p>
              ) : null}
            </div>

            <section>
              <h2
                style={{
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  fontSize: "1.35rem",
                  letterSpacing: "0.1em",
                  margin: "0 0 0.85rem",
                  color: TEXT,
                }}
              >
                Historique
              </h2>

              {history.length === 0 ? (
                <p
                  style={{
                    opacity: 0.78,
                    fontSize: "1rem",
                    lineHeight: 1.55,
                    padding: "1.25rem",
                    borderRadius: "4px",
                    border: "1px solid var(--border-soft)",
                    background:
                      "color-mix(in srgb, var(--text) 3%, transparent)",
                  }}
                >
                  Aucune transaction pour le moment. Soumets ton premier code!
                </p>
              ) : (
                <>
                  <div className="banque-history-cards">
                    {history.map((row) => {
                      const {
                        dateLabel,
                        label,
                        signed,
                        color,
                        quizLines,
                        isDollars,
                      } = renderHistoryEntry(row);
                      return (
                        <article key={row.id} className="banque-history-card">
                          <p
                            style={{
                              margin: 0,
                              fontSize: "0.8rem",
                              opacity: 0.55,
                            }}
                          >
                            {dateLabel}
                          </p>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: "0.75rem",
                              marginTop: "0.45rem",
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {quizLines ? (
                                <>
                                  <p style={{ margin: 0, fontWeight: 600 }}>
                                    {quizLines.line1}
                                  </p>
                                  <p
                                    style={{
                                      margin: "0.25rem 0 0",
                                      fontSize: "0.85rem",
                                      opacity: 0.8,
                                    }}
                                  >
                                    {quizLines.line2}
                                  </p>
                                </>
                              ) : (
                                <p style={{ margin: 0, fontWeight: 600 }}>
                                  {label}
                                </p>
                              )}
                              <p
                                style={{
                                  margin: "0.35rem 0 0",
                                  fontSize: "0.72rem",
                                  opacity: 0.55,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                }}
                              >
                                {isDollars ? "Banque $" : "Points PMQ"}
                              </p>
                            </div>
                            <span
                              style={{
                                color,
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {signed}
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <div
                    className="banque-history-table-wrap"
                    style={{
                      borderRadius: "4px",
                      border: "1px solid var(--border-soft)",
                      overflow: "hidden",
                      background:
                        "color-mix(in srgb, var(--text) 3%, transparent)",
                    }}
                  >
                    <div style={{ overflowX: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: "0.88rem",
                        }}
                      >
                        <thead>
                          <tr
                            style={{
                              textAlign: "left",
                              borderBottom: "1px solid var(--border-soft)",
                              background: "var(--bg-card-inner)",
                            }}
                          >
                            <th
                              style={{
                                padding: "0.75rem 1rem",
                                fontWeight: 600,
                                color: GOLD,
                                whiteSpace: "nowrap",
                              }}
                            >
                              Date
                            </th>
                            <th
                              style={{
                                padding: "0.75rem 1rem",
                                fontWeight: 600,
                              }}
                            >
                              Description
                            </th>
                            <th
                              style={{
                                padding: "0.75rem 1rem",
                                fontWeight: 600,
                                textAlign: "right",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Montant
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((row) => {
                            const {
                              dateLabel,
                              label,
                              signed,
                              color,
                              quizLines,
                              isDollars,
                            } = renderHistoryEntry(row);
                            return (
                              <tr
                                key={row.id}
                                style={{
                                  borderBottom: "1px solid var(--border-soft)",
                                }}
                              >
                                <td
                                  style={{
                                    padding: "0.7rem 1rem",
                                    whiteSpace: "nowrap",
                                    opacity: 0.9,
                                  }}
                                >
                                  {dateLabel}
                                </td>
                                <td
                                  style={{
                                    padding: "0.7rem 1rem",
                                    maxWidth: "360px",
                                  }}
                                >
                                  {quizLines ? (
                                    <>
                                      <span style={{ display: "block" }}>
                                        {quizLines.line1}
                                      </span>
                                      <span
                                        style={{
                                          display: "block",
                                          marginTop: "0.25rem",
                                          fontSize: "0.85rem",
                                          opacity: 0.8,
                                        }}
                                      >
                                        {quizLines.line2}
                                      </span>
                                    </>
                                  ) : (
                                    label
                                  )}
                                  <span
                                    style={{
                                      display: "block",
                                      marginTop: "0.2rem",
                                      fontSize: "0.72rem",
                                      opacity: 0.55,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.06em",
                                    }}
                                  >
                                    {isDollars ? "Banque $" : "Points PMQ"}
                                  </span>
                                </td>
                                <td
                                  style={{
                                    padding: "0.7rem 1rem",
                                    textAlign: "right",
                                    fontWeight: 700,
                                    color,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {signed}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </section>
          </>
        ) : null}

        {activeTab === "parametres" ? (
          <>
            {loadError ? (
              <p
                role="alert"
                style={{
                  color: ROUGE,
                  fontSize: "0.9rem",
                  marginBottom: "1rem",
                }}
              >
                {loadError}
              </p>
            ) : null}

            <nav
              role="tablist"
              aria-label="Paramètres"
              style={{
                display: "flex",
                width: "100%",
                borderBottom: "1px solid var(--border-soft)",
                marginBottom: "1.5rem",
              }}
            >
              {(
                [
                  { id: "public" as const, label: "Public" },
                  { id: "identite" as const, label: "Identité" },
                  { id: "retrait" as const, label: "Retrait" },
                  { id: "notifications" as const, label: "Notifications" },
                ] as const
              ).map((tab) => {
                const active = activeParamsTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveParamsTab(tab.id)}
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      borderBottom: active
                        ? "2px solid var(--accent)"
                        : "2px solid transparent",
                      color: active ? "var(--accent)" : TEXT,
                      opacity: active ? 1 : 0.4,
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.65rem",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      padding: "0.85rem 0.5rem",
                      cursor: "pointer",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>

            {activeParamsTab === "public" ? (
            <section style={parametresCardStyle}>
              {parametresSectionTitle("PROFIL PUBLIC")}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.65rem",
                  cursor: profilPublicSaving ? "wait" : "pointer",
                  fontSize: "0.92rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={profilPublic}
                  disabled={profilPublicSaving}
                  onChange={(e) =>
                    void handleSaveProfil({
                      profil_public: e.target.checked,
                      message_don: messageDon,
                    })
                  }
                  style={{
                    width: "1.1rem",
                    height: "1.1rem",
                    accentColor: GOLD,
                  }}
                />
                Activer mon profil public
              </label>
              <label
                htmlFor="compte-message-don"
                style={{ ...fieldLabelStyle, marginTop: "0.85rem" }}
              >
                Message don
              </label>
              <textarea
                id="compte-message-don"
                value={messageDon}
                maxLength={MAX_MESSAGE_DON}
                disabled={profilPublicSaving}
                onChange={(e) => setMessageDon(e.target.value)}
                rows={3}
                placeholder="Expliquez pourquoi vous sollicitez des points…"
                style={{
                  ...fieldInputStyle,
                  resize: "vertical",
                  lineHeight: 1.5,
                }}
              />
              <p
                style={{
                  margin: "0.35rem 0 0",
                  fontSize: "0.75rem",
                  opacity: 0.5,
                  textAlign: "right",
                }}
              >
                {messageDon.length}/{MAX_MESSAGE_DON}
              </p>
              <button
                type="button"
                disabled={profilPublicSaving}
                style={saveBtnStyle}
                onClick={() =>
                  void handleSaveProfil({
                    profil_public: profilPublic,
                    message_don: messageDon.trim(),
                  })
                }
              >
                {profilPublicSaving ? "…" : "Enregistrer"}
              </button>
            </section>
            ) : null}

            {activeParamsTab === "identite" ? (
            <section style={parametresCardStyle}>
              {parametresSectionTitle("IDENTITÉ")}
              <p style={fieldLabelStyle}>Avatar</p>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "0.55rem",
                  marginBottom: "1.15rem",
                }}
              >
                <button
                  type="button"
                  onClick={openAvatarModal}
                  aria-label="Modifier l'avatar"
                  style={{
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    lineHeight: 0,
                  }}
                >
                  <MemberAvatar
                    displayName={displayNameEdit.trim() || name}
                    avatarUrl={avatarUrl}
                    size={72}
                  />
                </button>
                <button
                  type="button"
                  onClick={openAvatarModal}
                  style={{
                    background: "transparent",
                    color: "var(--text-70)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "4px",
                    padding: "0.3rem 0.7rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    cursor: "pointer",
                  }}
                >
                  Modifier
                </button>
              </div>

              {avatarModalOpen ? (
                <div
                  role="presentation"
                  onClick={closeAvatarModal}
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 100,
                    background: "color-mix(in srgb, var(--bg) 72%, transparent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "1.25rem",
                  }}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="compte-avatar-modal-title"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: "100%",
                      maxWidth: "22rem",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-strong)",
                      borderRadius: "4px",
                      padding: "1.25rem 1.35rem",
                    }}
                  >
                    <h3
                      id="compte-avatar-modal-title"
                      style={{
                        margin: "0 0 1rem",
                        fontFamily: "var(--font-bebas), Impact, sans-serif",
                        fontSize: "1.25rem",
                        letterSpacing: "0.08em",
                        color: GOLD,
                      }}
                    >
                      Modifier l&apos;avatar
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        marginBottom: "1rem",
                      }}
                    >
                      <MemberAvatar
                        displayName={displayNameEdit.trim() || name}
                        avatarUrl={
                          draftAvatarMode === "initiales"
                            ? null
                            : draftAvatarMode === "avatar"
                              ? avatarUrl &&
                                resolveAvatarMode(avatarUrl) === "avatar"
                                ? avatarUrl
                                : PRESET_AVATARS[0]
                              : avatarUrl &&
                                  resolveAvatarMode(avatarUrl) === "photo"
                                ? avatarUrl
                                : null
                        }
                        size={72}
                      />
                    </div>
                    <div
                      role="group"
                      aria-label="Type d'avatar"
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.4rem",
                        marginBottom: "0.85rem",
                      }}
                    >
                      {(
                        [
                          { id: "initiales" as const, label: "Initiales" },
                          { id: "avatar" as const, label: "Avatar" },
                          { id: "photo" as const, label: "Photo" },
                        ] as const
                      ).map((opt) => {
                        const active = draftAvatarMode === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={profilPublicSaving || avatarUploading}
                            onClick={() => void handleSelectAvatarMode(opt.id)}
                            style={{
                              background: active
                                ? "color-mix(in srgb, var(--accent) 14%, transparent)"
                                : "transparent",
                              color: active ? GOLD : "var(--text-70)",
                              border: active
                                ? `1px solid ${GOLD}`
                                : "1px solid var(--border-strong)",
                              borderRadius: "4px",
                              padding: "0.4rem 0.75rem",
                              fontSize: "0.78rem",
                              fontWeight: 600,
                              cursor:
                                profilPublicSaving || avatarUploading
                                  ? "wait"
                                  : "pointer",
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {draftAvatarMode === "avatar" ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                          gap: "0.45rem",
                          marginBottom: "1rem",
                        }}
                      >
                        {PRESET_AVATARS.map((emoji) => {
                          const selected = avatarUrl === emoji;
                          return (
                            <button
                              key={emoji}
                              type="button"
                              disabled={profilPublicSaving}
                              onClick={() => void handleSelectPresetEmoji(emoji)}
                              aria-label={`Choisir ${emoji}`}
                              style={{
                                aspectRatio: "1",
                                borderRadius: "4px",
                                border: selected
                                  ? `1px solid ${GOLD}`
                                  : "1px solid var(--border-strong)",
                                background: selected
                                  ? "color-mix(in srgb, var(--accent) 14%, transparent)"
                                  : "color-mix(in srgb, var(--text) 4%, transparent)",
                                fontSize: "1.35rem",
                                cursor: profilPublicSaving ? "wait" : "pointer",
                              }}
                            >
                              {emoji}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    {draftAvatarMode === "photo" ? (
                      <div style={{ marginBottom: "1rem" }}>
                        <label
                          htmlFor="compte-avatar-photo"
                          style={{
                            display: "inline-block",
                            padding: "0.5rem 0.9rem",
                            borderRadius: "4px",
                            border: "1px solid var(--border-strong)",
                            background:
                              "color-mix(in srgb, var(--text) 4%, transparent)",
                            fontSize: "0.85rem",
                            cursor: avatarUploading ? "wait" : "pointer",
                            opacity: avatarUploading ? 0.6 : 1,
                          }}
                        >
                          {avatarUploading ? "Upload…" : "Choisir une photo"}
                        </label>
                        <input
                          id="compte-avatar-photo"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          disabled={avatarUploading || profilPublicSaving}
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) void handleUploadAvatarPhoto(file);
                          }}
                        />
                        <p
                          style={{
                            margin: "0.5rem 0 0",
                            fontSize: "0.75rem",
                            opacity: 0.5,
                          }}
                        >
                          JPEG, PNG, WebP ou GIF · max 2 Mo
                        </p>
                      </div>
                    ) : null}
                    {draftAvatarMode === "initiales" ? (
                      <p
                        style={{
                          margin: "0 0 1rem",
                          fontSize: "0.82rem",
                          opacity: 0.65,
                          lineHeight: 1.45,
                        }}
                      >
                        Cliquez sur « Initiales » pour enregistrer le cercle avec
                        vos initiales.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={avatarUploading || profilPublicSaving}
                      onClick={closeAvatarModal}
                      style={{
                        width: "100%",
                        padding: "0.65rem 1rem",
                        borderRadius: "4px",
                        fontWeight: 600,
                        fontSize: "0.88rem",
                        border: "1px solid var(--border-strong)",
                        background: "transparent",
                        color: TEXT,
                        cursor:
                          avatarUploading || profilPublicSaving
                            ? "wait"
                            : "pointer",
                      }}
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              ) : null}

              <label htmlFor="compte-pseudo" style={fieldLabelStyle}>
                Pseudo
              </label>
              <input
                id="compte-pseudo"
                type="text"
                value={displayNameEdit}
                disabled={profilPublicSaving}
                maxLength={80}
                onChange={(e) => setDisplayNameEdit(e.target.value)}
                style={fieldInputStyle}
              />
              <button
                type="button"
                disabled={profilPublicSaving}
                style={saveBtnStyle}
                onClick={() =>
                  void handleSaveProfil({
                    display_name: displayNameEdit.trim(),
                  })
                }
              >
                {profilPublicSaving ? "…" : "Enregistrer"}
              </button>
            </section>
            ) : null}

            {activeParamsTab === "retrait" ? (
            <section style={parametresCardStyle}>
              {parametresSectionTitle("RETRAIT")}
              {retraitGeleActif ? (
                <p
                  role="alert"
                  style={{
                    margin: "0 0 1rem",
                    padding: "0.75rem 1rem",
                    borderRadius: "4px",
                    background:
                      "color-mix(in srgb, var(--accent-red) 12%, transparent)",
                    border: `1px solid ${ROUGE}`,
                    color: ROUGE,
                    fontSize: "0.9rem",
                  }}
                >
                  Retraits gelés jusqu&apos;au {retraitGeleLabel}
                </p>
              ) : null}
              <p style={{ ...fieldLabelStyle, marginBottom: "0.5rem" }}>
                Palier de vérification
              </p>
              <p
                style={{
                  margin: "0 0 1rem",
                  fontSize: "0.92rem",
                  color: palierVerification > 0 ? GOLD : "var(--text-70)",
                }}
              >
                {palierLabel(
                  Number.isFinite(palierVerification) ? palierVerification : 0,
                )}
              </p>
              <label htmlFor="compte-retrait-methode" style={fieldLabelStyle}>
                Méthode de paiement
              </label>
              <select
                id="compte-retrait-methode"
                value={retraitMethode}
                disabled={profilPublicSaving}
                onChange={(e) => setRetraitMethode(e.target.value)}
                style={{ ...fieldInputStyle, cursor: "pointer" }}
              >
                <option value="">— Choisir —</option>
                {RETRAIT_METHODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <label
                htmlFor="compte-retrait-identifiant"
                style={{ ...fieldLabelStyle, marginTop: "0.85rem" }}
              >
                Identifiant du compte
              </label>
              <input
                id="compte-retrait-identifiant"
                type="text"
                value={retraitIdentifiant}
                disabled={profilPublicSaving}
                maxLength={200}
                placeholder="N° téléphone, courriel ou compte…"
                onChange={(e) => setRetraitIdentifiant(e.target.value)}
                style={fieldInputStyle}
              />
              <p
                style={{
                  margin: "0.65rem 0 0",
                  fontSize: "0.78rem",
                  opacity: 0.55,
                  lineHeight: 1.45,
                }}
              >
                Un changement de méthode ou d&apos;identifiant gèle les retraits
                pendant 72 heures.
              </p>
              <button
                type="button"
                disabled={profilPublicSaving || !retraitMethode}
                style={saveBtnStyle}
                onClick={() =>
                  void handleSaveProfil({
                    retrait_methode: retraitMethode || null,
                    retrait_identifiant: retraitIdentifiant.trim() || null,
                  })
                }
              >
                {profilPublicSaving ? "…" : "Enregistrer"}
              </button>
            </section>
            ) : null}

            {activeParamsTab === "notifications" ? (
              <>
            <section style={parametresCardStyle}>
              {parametresSectionTitle("APPARENCE")}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                  gap: "2px",
                }}
              >
                {availableThemes.map((t) => (
                  <button
                    key={t.theme_id}
                    type="button"
                    onClick={() => void changeTheme(t.theme_id)}
                    disabled={themeLoading}
                    style={{
                      padding: "0.65rem 0.85rem",
                      background:
                        currentTheme === t.theme_id
                          ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                          : "transparent",
                      border:
                        currentTheme === t.theme_id
                          ? "1px solid var(--accent)"
                          : "1px solid var(--border-soft)",
                      color:
                        currentTheme === t.theme_id
                          ? "var(--accent)"
                          : "var(--text-40)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.58rem",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      cursor: themeLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </section>

            <section style={parametresCardStyle}>
              {parametresSectionTitle("NOTIFICATIONS")}
              <div style={{ display: "grid", gap: "0.85rem" }}>
                {(
                  [
                    {
                      id: "compte-notif-quiz",
                      label: "Notifications quiz",
                      checked: notifQuiz,
                      set: setNotifQuiz,
                      key: "notif_quiz" as const,
                    },
                    {
                      id: "compte-notif-redistribution",
                      label: "Notifications redistribution",
                      checked: notifRedistribution,
                      set: setNotifRedistribution,
                      key: "notif_redistribution" as const,
                    },
                    {
                      id: "compte-notif-concours",
                      label: "Notifications concours",
                      checked: notifConcours,
                      set: setNotifConcours,
                      key: "notif_concours" as const,
                    },
                  ] as const
                ).map((item) => (
                  <label
                    key={item.id}
                    htmlFor={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.65rem",
                      cursor: profilPublicSaving ? "wait" : "pointer",
                      fontSize: "0.95rem",
                    }}
                  >
                    <input
                      id={item.id}
                      type="checkbox"
                      checked={item.checked}
                      disabled={profilPublicSaving}
                      onChange={(e) => {
                        item.set(e.target.checked);
                        void handleSaveProfil({ [item.key]: e.target.checked });
                      }}
                      style={{
                        width: "1.1rem",
                        height: "1.1rem",
                        accentColor: GOLD,
                      }}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </section>
              </>
            ) : null}
          </>
        ) : null}
      </main>

      <AppBottomNav session={session} memberType={profile?.member_type} />
    </div>
  );
}

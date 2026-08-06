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
import {
  formatPaTransferDonLines,
  formatQuizTransactionLines,
} from "../../lib/quizTransactionDisplay";
import {
  getMonthlyMemberRankBadge,
  isCommunauteMemberType,
} from "../../lib/rank-badge";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";
import { buildReferralLink } from "../../lib/parrainage";
import { checkJwtExpired, getSupabaseClient } from "../../lib/supabase";

const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });

const BG = "var(--bg)";
const TEXT = "var(--text)";
const ROUGE = "var(--accent-red)";
const GOLD = "var(--accent)";
const SB = "https://lrolatbudvianeazliax.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

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
  cotisation_active: boolean | null;
  cotisation_montant: number | string | null;
  cotisation_points_bonus: number | string | null;
  nom_legal: string | null;
  date_naissance: string | null;
  pays_residence_fiscale: string | null;
  telephone: string | null;
  adresse: string | null;
  palier_verification: number | string | null;
  profil_verifie_at: string | null;
  retrait_methode: string | null;
  retrait_identifiant: string | null;
  retrait_gele_jusqua: string | null;
  notif_quiz: boolean | null;
  notif_redistribution: boolean | null;
  notif_concours: boolean | null;
  theme: string | null;
};

const MAX_MESSAGE_DON = 200;
const COTISATION_MONTANTS = [5, 10, 15] as const;
type CotisationMontant = (typeof COTISATION_MONTANTS)[number];

const RETRAIT_METHODES = [
  "MonCash",
  "Xoom",
  "Remitly",
  "TAKSIMOTO",
  "Virement",
] as const;

type ProfilOnglet = "public" | "identite" | "retrait" | "notifications";

const PROFIL_ONGLETS: { id: ProfilOnglet; label: string }[] = [
  { id: "public", label: "Public" },
  { id: "identite", label: "Identité" },
  { id: "retrait", label: "Retrait" },
  { id: "notifications", label: "Notifications" },
];

const PROFIL_SELECT =
  "display_name,email,member_type,multiplier,numero_membre,is_beta_tester,code_parrainage,profil_public,message_don,avatar_url,cotisation_active,cotisation_montant,cotisation_points_bonus,nom_legal,date_naissance,pays_residence_fiscale,telephone,adresse,palier_verification,profil_verifie_at,retrait_methode,retrait_identifiant,retrait_gele_jusqua,notif_quiz,notif_redistribution,notif_concours,theme";

function parseProfilOnglet(raw: string | null): ProfilOnglet {
  if (
    raw === "identite" ||
    raw === "retrait" ||
    raw === "notifications" ||
    raw === "public"
  ) {
    return raw;
  }
  return "public";
}

function readOngletFromUrl(): ProfilOnglet {
  if (typeof window === "undefined") return "public";
  return parseProfilOnglet(
    new URLSearchParams(window.location.search).get("onglet"),
  );
}

function palierLabel(palier: number): string {
  if (palier >= 2) return "Palier 2 — vérifié";
  if (palier === 1) return "Palier 1 — partiel";
  return "Palier 0 — non vérifié";
}

function pointsBonusForMontant(montant: CotisationMontant): number {
  return montant * 2;
}

function parseCotisationMontant(raw: unknown): CotisationMontant {
  const n = Number(raw);
  if (n === 10 || n === 15) return n;
  return 5;
}

type QuizSubmissionRow = {
  video_id: string;
  score: number | null;
  points_awarded: number | null;
  completed_at?: string | null;
};

type PointsTxRow = {
  id: string;
  created_at: string;
  amount: number | string | null;
  description: string | null;
};

function formatMemberTypeLabel(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "Communauté";
  const n = raw.trim();
  const lower = n.toLowerCase();
  if (lower === "communauté" || lower === "communaute" || n === "Communauté") return "Communauté";
  if (lower === "pionnier" || n === "Pionnier") return "Pionnier";
  if (lower === "fondateur" || n === "Fondateur") return "Fondateur";
  if (lower === "collaborateur" || n === "Collaborateur") return "Collaborateur";
  return n;
}

function displayNameFrom(profile: ProfileRow | null, session: Session): string {
  const meta = session.user.user_metadata as Record<string, unknown> | undefined;
  const fullName = typeof meta?.full_name === "string" ? meta.full_name : undefined;
  const displayName = typeof profile?.display_name === "string" ? profile.display_name.trim() : "";
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
      background: "rgba(212, 160, 23, 0.08)",
      color: GOLD,
      border: `1px solid ${GOLD}`,
      fontFamily: "var(--font-mono), ui-monospace, monospace",
    };
  }
  return {
    background: "rgba(255, 255, 255, 0.04)",
    color: "#888888",
    border: "1px solid var(--border-soft)",
  };
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
  const label = capitalizeFr(
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

const pointsFmt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short" });

const MIN_DON_PTS = 5;
const MAX_DON_PTS = 50;

function readViewedMemberFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("membre")?.trim() ?? null;
}

export default function ProfilPage(): React.JSX.Element | null {
  const router = useRouter();
  const [viewedMemberParam, setViewedMemberParam] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [totalPointsPmq, setTotalPointsPmq] = useState(0);
  const [pmqMonthLabel, setPmqMonthLabel] = useState("");
  const [prevMonthLabel, setPrevMonthLabel] = useState("");
  const [prevMonthPtsPonderes, setPrevMonthPtsPonderes] = useState(0);
  const [prevMonthRedistributed, setPrevMonthRedistributed] = useState(false);
  const [quizRows, setQuizRows] = useState<{ video_id: string; title: string; score: number; points: number; at: string | null; }[]>([]);
  const [quizTxHistory, setQuizTxHistory] = useState<PointsTxRow[]>([]);
  const [donTxHistory, setDonTxHistory] = useState<PointsTxRow[]>([]);
  const [monthlyPtsTotal, setMonthlyPtsTotal] = useState(0);
  const [pmqShare, setPmqShare] = useState<{
    mes_pts: number;
    total_pts: number;
    pourcentage: number;
  } | null>(null);
  const [filleulsActifs, setFilleulsActifs] = useState(0);
  const [referralCopied, setReferralCopied] = useState<"code" | "link" | null>(null);
  const [parrainageFlagState, setParrainageFlagState] = useState<
    "loading" | "enabled" | "disabled"
  >("loading");
  const [donsFlagState, setDonsFlagState] = useState<
    "loading" | "enabled" | "disabled"
  >("loading");
  const [cotisationFlagState, setCotisationFlagState] = useState<
    "loading" | "enabled" | "disabled"
  >("loading");
  const [donModalOpen, setDonModalOpen] = useState(false);
  const [donPts, setDonPts] = useState(MIN_DON_PTS);
  const [donSubmitting, setDonSubmitting] = useState(false);
  const [donSuccess, setDonSuccess] = useState(false);
  const [profilPublicSaving, setProfilPublicSaving] = useState(false);
  const [messageDon, setMessageDon] = useState("");
  const [displayNameEdit, setDisplayNameEdit] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("initiales");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [draftAvatarMode, setDraftAvatarMode] = useState<AvatarMode>("initiales");
  const [nomLegal, setNomLegal] = useState("");
  const [dateNaissance, setDateNaissance] = useState("");
  const [paysResidenceFiscale, setPaysResidenceFiscale] = useState("");
  const [telephone, setTelephone] = useState("");
  const [adresse, setAdresse] = useState("");
  const [retraitMethode, setRetraitMethode] = useState("");
  const [retraitIdentifiant, setRetraitIdentifiant] = useState("");
  const [notifQuiz, setNotifQuiz] = useState(true);
  const [notifRedistribution, setNotifRedistribution] = useState(true);
  const [notifConcours, setNotifConcours] = useState(true);
  const [profilOnglet, setProfilOnglet] = useState<ProfilOnglet>("public");
  const [profilBanner, setProfilBanner] = useState<string | null>(null);
  const [cotisationActive, setCotisationActive] = useState(false);
  const [cotisationMontant, setCotisationMontant] = useState<CotisationMontant>(5);
  const [cotisationPointsBonus, setCotisationPointsBonus] = useState(10);
  const [cotisationSaving, setCotisationSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<string>("A");
  const [themeLoading, setThemeLoading] = useState(false);
  const [availableThemes, setAvailableThemes] = useState<{theme_id: string, name: string}[]>([]);

  const loadProfil = useCallback(async (activeSession: Session, targetId: string) => {
    const token = activeSession.access_token;
    const isOwnProfile = targetId === activeSession.user.id;

    const profileRes = await fetchRestJson(
      `${SB}/rest/v1/profiles?id=eq.${encodeURIComponent(targetId)}&select=${
        isOwnProfile
          ? PROFIL_SELECT
          : "display_name,email,member_type,multiplier,numero_membre,is_beta_tester,code_parrainage,profil_public,message_don,avatar_url"
      }`,
      token,
    );
    const profileData = Array.isArray(profileRes) ? profileRes[0] : null;
    const row = profileData as ProfileRow | null;
    setProfile(row);
    if (isOwnProfile) {
      setMessageDon(
        typeof row?.message_don === "string" ? row.message_don : "",
      );
      setDisplayNameEdit(
        typeof row?.display_name === "string" ? row.display_name : "",
      );
      {
        const nextAvatar =
          typeof row?.avatar_url === "string" ? row.avatar_url : null;
        setAvatarUrl(nextAvatar);
        setAvatarMode(resolveAvatarMode(nextAvatar));
      }
      setNomLegal(typeof row?.nom_legal === "string" ? row.nom_legal : "");
      setDateNaissance(
        typeof row?.date_naissance === "string"
          ? row.date_naissance.slice(0, 10)
          : "",
      );
      setPaysResidenceFiscale(
        typeof row?.pays_residence_fiscale === "string"
          ? row.pays_residence_fiscale
          : "",
      );
      setTelephone(typeof row?.telephone === "string" ? row.telephone : "");
      setAdresse(typeof row?.adresse === "string" ? row.adresse : "");
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
      const montant = parseCotisationMontant(row?.cotisation_montant);
      setCotisationActive(Boolean(row?.cotisation_active));
      setCotisationMontant(montant);
      const bonus = Number(row?.cotisation_points_bonus);
      setCotisationPointsBonus(
        Number.isFinite(bonus) && bonus > 0
          ? bonus
          : pointsBonusForMontant(montant),
      );
      setCurrentTheme(
        typeof row?.theme === "string" && row.theme.trim()
          ? row.theme
          : "A",
      );
    }

    const { current: currentMonth, previous: prevMonth } =
      currentAndPreviousMonthBounds();
    setPmqMonthLabel(currentMonth.label);
    setPrevMonthLabel(prevMonth.label);

    const [txRes, monthlyPts, prevMonthPts, prevHistRes, pmqShareRes] =
      await Promise.all([
      fetchRestJson(
        `${SB}/rest/v1/points_transactions?membre_id=eq.${encodeURIComponent(targetId)}&type=eq.quiz` +
          `${createdAtRangeFilter(currentMonth)}&select=amount`,
        token,
      ),
      sumQuizPtsPonderesForMember(targetId, token, currentMonth),
      sumQuizPtsPonderesForMember(targetId, token, prevMonth),
      fetchRestJson(
        `${SB}/rest/v1/redistribution_history?month=eq.${encodeURIComponent(prevMonth.monthDate)}&select=month&limit=1`,
        token,
      ),
      isOwnProfile
        ? fetch("/api/membres/pmq-share", {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then(async (res) => {
              const json = (await res.json().catch(() => null)) as {
                mes_pts?: unknown;
                total_pts?: unknown;
                pourcentage?: unknown;
              } | null;
              if (!res.ok || !json) return null;
              const mes_pts = Number(json.mes_pts ?? 0);
              const total_pts = Number(json.total_pts ?? 0);
              const pourcentage = Number(json.pourcentage ?? 0);
              if (
                !Number.isFinite(mes_pts) ||
                !Number.isFinite(total_pts) ||
                !Number.isFinite(pourcentage)
              ) {
                return null;
              }
              return { mes_pts, total_pts, pourcentage };
            })
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    const txData = Array.isArray(txRes) ? txRes : [];
    const sum = txData.reduce(
      (acc: number, row: { amount: unknown }) => acc + Number(row.amount ?? 0),
      0,
    );
    setTotalPointsPmq(sum);
    setMonthlyPtsTotal(monthlyPts);
    setPrevMonthPtsPonderes(prevMonthPts);
    setPrevMonthRedistributed(Array.isArray(prevHistRes) && prevHistRes.length > 0);
    setPmqShare(pmqShareRes);

    if (!isOwnProfile) {
      setQuizTxHistory([]);
      setDonTxHistory([]);
      setQuizRows([]);
      setFilleulsActifs(0);
      setDataLoaded(true);
      return;
    }

    const [txHistoryRes, donHistoryRes, quizRes, parrainagesRes, themesRes] = await Promise.all([
      fetchRestJson(
        `${SB}/rest/v1/points_transactions?membre_id=eq.${encodeURIComponent(targetId)}&type=eq.quiz&select=id,created_at,amount,description&order=created_at.desc&limit=20`,
        token,
      ),
      fetchRestJson(
        `${SB}/rest/v1/points_transactions?membre_id=eq.${encodeURIComponent(targetId)}&type=eq.pa_transfer&description=ilike.*Don*&select=id,created_at,amount,description&order=created_at.desc&limit=20`,
        token,
      ),
      fetchRestJson(
        `${SB}/rest/v1/quiz_submissions?membre_id=eq.${encodeURIComponent(targetId)}&select=video_id,score,points_awarded,completed_at&order=completed_at.desc&limit=5`,
        token,
      ),
      fetchRestJson(
        `${SB}/rest/v1/parrainages?parrain_id=eq.${encodeURIComponent(targetId)}&statut=eq.actif&select=id`,
        token,
      ),
      fetchRestJson(
        `${SB}/rest/v1/theme_config?enabled=eq.true&select=theme_id,name`,
        token,
      ),
    ]);

    setQuizTxHistory(Array.isArray(txHistoryRes) ? (txHistoryRes as PointsTxRow[]) : []);
    setDonTxHistory(Array.isArray(donHistoryRes) ? (donHistoryRes as PointsTxRow[]) : []);
    setFilleulsActifs(Array.isArray(parrainagesRes) ? parrainagesRes.length : 0);
    setAvailableThemes(
      Array.isArray(themesRes)
        ? (themesRes as { theme_id: string; name: string }[])
        : [],
    );

    const quizSubs = Array.isArray(quizRes) ? (quizRes as QuizSubmissionRow[]) : [];
    const ids = [...new Set(quizSubs.map((s) => s.video_id).filter(Boolean))];
    let titles = new Map<string, string>();
    if (ids.length > 0) {
      const vRes = await fetchRestJson(
        `${SB}/rest/v1/videos?id=in.(${ids.join(",")})&select=id,title`,
        token,
      );
      if (Array.isArray(vRes)) {
        titles = new Map(
          vRes.map((v: { id: string; title: string }) => [
            String(v.id),
            String(v.title ?? ""),
          ]),
        );
      }
    }
    setQuizRows(
      quizSubs.map((s) => ({
        video_id: s.video_id,
        title: titles.get(s.video_id)?.trim() || "Vidéo",
        score: Number(s.score ?? 0),
        points: Number(s.points_awarded ?? 0),
        at: s.completed_at ?? null,
      })),
    );
    setDataLoaded(true);
  }, []);

  useEffect(() => {
    setViewedMemberParam(readViewedMemberFromUrl());
    setProfilOnglet(readOngletFromUrl());
    const params = new URLSearchParams(window.location.search);
    if (params.get("msg") === "complet_profil") {
      setProfilBanner("Complétez votre profil pour effectuer un retrait");
      params.delete("msg");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
      );
    }
    const onPopState = (): void => {
      setViewedMemberParam(readViewedMemberFromUrl());
      setProfilOnglet(readOngletFromUrl());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [parrainageRes, donsRes, cotisationRes] = await Promise.all([
          fetch("/api/feature-flags?nom=parrainage", { cache: "no-store" }),
          fetch("/api/feature-flags?nom=dons-membres", { cache: "no-store" }),
          fetch("/api/feature-flags?nom=cotisation-membre", { cache: "no-store" }),
        ]);
        const parrainageJson = (await parrainageRes.json()) as { actif?: boolean };
        const donsJson = (await donsRes.json()) as { actif?: boolean };
        const cotisationJson = (await cotisationRes.json()) as { actif?: boolean };
        if (cancelled) return;
        setParrainageFlagState(parrainageJson.actif ? "enabled" : "disabled");
        setDonsFlagState(donsJson.actif ? "enabled" : "disabled");
        setCotisationFlagState(cotisationJson.actif ? "enabled" : "disabled");
      } catch {
        if (!cancelled) {
          setParrainageFlagState("disabled");
          setDonsFlagState("disabled");
          setCotisationFlagState("disabled");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
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
      const targetId = viewedMemberParam ?? next.user.id;
      await loadProfil(next, targetId);
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
  }, [loadProfil, router, viewedMemberParam]);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try { await signOut(); router.replace("/"); } catch { setSigningOut(false); }
  }

  async function copyReferral(value: string, kind: "code" | "link"): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setReferralCopied(kind);
      window.setTimeout(() => setReferralCopied(null), 2000);
    } catch {
      setLoadError("Impossible de copier dans le presse-papiers.");
    }
  }

  function selectProfilOnglet(next: ProfilOnglet): void {
    setProfilOnglet(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "public") params.delete("onglet");
    else params.set("onglet", next);
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
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
      if (json.nom_legal !== undefined) setNomLegal(json.nom_legal ?? "");
      if (json.date_naissance !== undefined) {
        setDateNaissance(
          typeof json.date_naissance === "string"
            ? json.date_naissance.slice(0, 10)
            : "",
        );
      }
      if (json.pays_residence_fiscale !== undefined) {
        setPaysResidenceFiscale(json.pays_residence_fiscale ?? "");
      }
      if (json.telephone !== undefined) setTelephone(json.telephone ?? "");
      if (json.adresse !== undefined) setAdresse(json.adresse ?? "");
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
      return;
    }
    // Avatar / Photo : attendre le choix emoji ou l'upload
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

  async function handleSaveCotisation(
    patch: { cotisation_active?: boolean; cotisation_montant?: CotisationMontant },
  ): Promise<void> {
    if (!session) return;
    setCotisationSaving(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/membres/cotisation", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as {
        error?: string;
        cotisation_active?: boolean;
        cotisation_montant?: number;
        cotisation_points_bonus?: number;
      };
      if (!res.ok) {
        setLoadError(json.error ?? "Impossible de mettre à jour la cotisation.");
        return;
      }
      const montant = parseCotisationMontant(json.cotisation_montant);
      const active = Boolean(json.cotisation_active);
      const bonus = Number(json.cotisation_points_bonus ?? pointsBonusForMontant(montant));
      setCotisationActive(active);
      setCotisationMontant(montant);
      setCotisationPointsBonus(bonus);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              cotisation_active: active,
              cotisation_montant: montant,
              cotisation_points_bonus: bonus,
            }
          : prev,
      );
    } catch {
      setLoadError("Erreur réseau lors de la mise à jour de la cotisation.");
    } finally {
      setCotisationSaving(false);
    }
  }

  async function handleConfirmDon(receveurId: string): Promise<void> {
    if (!session) return;
    setDonSubmitting(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/membres/don", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ receveur_id: receveurId, pts_pmq: donPts }),
      });
      const json = (await res.json()) as { error?: string; success?: boolean };
      if (!res.ok) {
        setLoadError(json.error ?? "Échec de l'envoi des points.");
        return;
      }
      setDonSuccess(true);
      window.setTimeout(() => {
        setDonModalOpen(false);
        setDonSuccess(false);
        setDonPts(MIN_DON_PTS);
        void loadProfil(session, receveurId);
      }, 1500);
    } catch {
      setLoadError("Erreur réseau lors de l'envoi des points.");
    } finally {
      setDonSubmitting(false);
    }
  }

  const fonts = `${bebas.variable} ${dmSans.variable}`;

  if (session === undefined) {
    return (
      <div className={fonts} style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "var(--font-dm), system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ opacity: 0.7 }}>Chargement…</p>
      </div>
    );
  }

  if (session && !dataLoaded) {
    return (
      <div style={{ background: "var(--bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(212,160,23,0.4)" }}>
          Chargement...
        </p>
      </div>
    );
  }

  if (!session) return null;

  const viewedMemberId = viewedMemberParam ?? session.user.id;
  const isOwnProfile = viewedMemberId === session.user.id;

  const name = isOwnProfile
    ? displayNameFrom(profile, session)
    : profile?.display_name?.trim() ||
      profile?.email?.split("@")[0] ||
      "Membre";
  const memberLabel = formatMemberTypeLabel(profile?.member_type ?? null);
  const memberBadge = memberTypeBadgeStyle(memberLabel);
  const effectiveAvatarUrl = isOwnProfile
    ? avatarUrl
    : (profile?.avatar_url ?? null);
  const mult = Number(profile?.multiplier ?? 1);
  const profileMultiplier = Number.isFinite(mult) && mult > 0 ? mult : 1;
  const multiplierDisplay = `${profileMultiplier.toFixed(1)}×`;
  const weightedPointsPmq = monthlyPtsTotal;
  const showRankBadge = isCommunauteMemberType(profile?.member_type);
  const monthlyRankBadge = showRankBadge
    ? getMonthlyMemberRankBadge(monthlyPtsTotal)
    : null;
  const emailDisplay = isOwnProfile
    ? (typeof profile?.email === "string" ? profile.email.trim() : "") ||
      (typeof session.user.email === "string" ? session.user.email.trim() : "") ||
      "—"
    : null;
  const showDonButton =
    !isOwnProfile && donsFlagState === "enabled" && Boolean(profile);
  const referralCode =
    typeof profile?.code_parrainage === "string" && profile.code_parrainage.trim()
      ? profile.code_parrainage.trim().toUpperCase()
      : null;
  const referralLink = referralCode ? buildReferralLink(referralCode) : null;
  const profilPublic = Boolean(profile?.profil_public);
  const publicProfileHref =
    profilPublic &&
    profile?.numero_membre != null &&
    String(profile.numero_membre).trim()
      ? `/profil/${String(profile.numero_membre).trim()}`
      : null;
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

  return (
    <div className={`${fonts} leve-page-profil`} style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-mono), ui-monospace, monospace", paddingBottom: "6rem" }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .profil-stat-label {
              font-size: max(12px, 0.72rem) !important;
            }
            .profil-tx-card {
              border-radius: 4px;
              padding: 1rem;
              background: rgba(245, 240, 232, 0.04);
              border: 1px solid var(--border-soft);
              display: flex;
              flex-wrap: wrap;
              align-items: flex-start;
              justify-content: space-between;
              gap: 0.5rem;
            }
            @media (max-width: 479px) {
              .profil-tx-card {
                flex-direction: column;
                align-items: stretch;
              }
              .profil-tx-amount {
                text-align: left !important;
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

      <main style={{ maxWidth: "960px", margin: "0 auto", padding: "1.25rem" }}>
        {loadError ? <p role="alert" style={{ color: ROUGE, fontSize: "0.9rem", marginBottom: "1rem" }}>{loadError}</p> : null}
        {!isOwnProfile && !profile ? (
          <p style={{ opacity: 0.7, fontSize: "0.95rem" }}>Membre introuvable.</p>
        ) : null}
        {profile ? (
        <>
        <section className="leve-hero" style={{ borderRadius: "4px", padding: "1.75rem 1.5rem", marginBottom: "1.25rem", background: "var(--bg-card)", borderTop: `2px solid ${GOLD}`, borderLeft: "1px solid var(--border-soft)", borderRight: "1px solid var(--border-soft)", borderBottom: "1px solid var(--border-soft)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "0.75rem" }}>
            <MemberAvatar
              displayName={name}
              avatarUrl={effectiveAvatarUrl}
              size={52}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, opacity: 0.65, fontSize: "0.85rem", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>Profil membre{profile?.numero_membre ? ` · #${profile.numero_membre}` : ""}</p>
              <h1 style={{ fontFamily: "var(--font-mono), ui-monospace, monospace", fontSize: "clamp(2rem, 7vw, 3rem)", letterSpacing: "0.04em", margin: "0.35rem 0 0", lineHeight: 1.05, color: TEXT, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
                <span>{name}</span>
                {showRankBadge ? (
                  <RankBadge ptsPonderes={weightedPointsPmq} size="md" />
                ) : null}
              </h1>
            </div>
          </div>
          <span style={{ display: "inline-block", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.35rem 0.75rem", borderRadius: "4px", ...memberBadge }}>{memberLabel}</span>
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
              <span style={{ display: "inline-block", marginTop: "0.6rem", background: "rgba(212, 160, 23, 0.14)", color: GOLD, fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.04em", padding: "0.3rem 0.65rem", borderRadius: "4px", border: "1px solid rgba(212, 160, 23, 0.35)" }}>
                🧪 Testeur Beta
              </span>
            </div>
          ) : null}
          {showDonButton ? (
            <div style={{ marginTop: "1rem" }}>
              <button
                type="button"
                onClick={() => {
                  setDonPts(MIN_DON_PTS);
                  setDonSuccess(false);
                  setDonModalOpen(true);
                }}
                style={{
                  background: "rgba(212, 160, 23, 0.12)",
                  color: GOLD,
                  border: `1px solid ${GOLD}`,
                  borderRadius: "4px",
                  padding: "0.55rem 1rem",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🎁 Envoyer des points
              </button>
            </div>
          ) : null}
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.85rem", marginBottom: "1.75rem",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
          <article className="leve-card" style={{ position: "relative", borderRadius: "4px", padding: "1.1rem 1.1rem 2.35rem", background: "var(--bg-card)", border: `1px solid rgba(212, 160, 23, 0.35)` }}>
            <p className="profil-stat-label leve-card-label" style={{ margin: 0, fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD, opacity: 0.95 }}>{pmqMonthLabel ? `Points PMQ · ${pmqMonthLabel}` : "Points PMQ"}</p>
            <p className="leve-card-value" style={{ margin: "0.5rem 0 0", fontSize: "1.65rem", fontWeight: 700, color: GOLD }}>{pointsFmt.format(totalPointsPmq)}</p>
            <p className="profil-stat-label" style={{ margin: "0.75rem 0 0", fontSize: "0.68rem", letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.5 }}>{pmqMonthLabel ? `Points pondérés · ${pmqMonthLabel}` : "Points pondérés (base redistribution)"}</p>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.95rem", fontWeight: 600, opacity: 0.75 }}>{pointsFmt.format(weightedPointsPmq)}</p>
            <p style={{ margin: "0.3rem 0 0", fontSize: "0.7rem", opacity: 0.45, lineHeight: 1.4 }}>
              Vos points × multiplicateur ×{profileMultiplier.toFixed(1)} — utilisé pour calculer votre part de redistribution
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
                PMQ {prevMonthLabel} · {pointsFmt.format(prevMonthPtsPonderes)}{" "}
                pts →{" "}
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
          <article className="leve-card" style={{ borderRadius: "4px", padding: "1.1rem", background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderTop: "2px solid var(--accent)" }}>
            <p className="profil-stat-label leve-card-label" style={{ margin: 0, fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.55 }}>Multiplicateur</p>
            {isOwnProfile && pmqShare ? (
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
                    : `×${profileMultiplier.toFixed(1)} · ${pointsFmt.format(pmqShare.mes_pts)} pts · ${pmqShare.pourcentage.toFixed(1)}% du pool`}
                </p>
                <div
                  style={{
                    marginTop: "0.55rem",
                    height: 3,
                    borderRadius: 2,
                    background: "rgba(212, 160, 23, 0.18)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, Math.max(0, pmqShare.total_pts > 0 ? pmqShare.pourcentage : 0))}%`,
                      background: GOLD,
                      borderRadius: 2,
                      transition: "width 0.35s ease",
                    }}
                  />
                </div>
              </div>
            ) : (
              <p className="leve-card-value" style={{ margin: "0.5rem 0 0", fontSize: "1.65rem", fontWeight: 700, color: GOLD }}>{multiplierDisplay}</p>
            )}
          </article>
        </div>

        {profilBanner ? (
          <p
            role="status"
            style={{
              color: GOLD,
              fontSize: "0.9rem",
              marginBottom: "1rem",
              padding: "0.75rem 1rem",
              borderRadius: "4px",
              background: "rgba(212, 160, 23, 0.1)",
              border: "1px solid rgba(212, 160, 23, 0.35)",
            }}
          >
            {profilBanner}
          </p>
        ) : null}

        {isOwnProfile ? (
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
              Mon profil
            </h2>
            <div
              role="tablist"
              aria-label="Sections du profil"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.4rem",
                marginBottom: "1.15rem",
                borderBottom: "1px solid var(--border-soft)",
                paddingBottom: "0.75rem",
              }}
            >
              {PROFIL_ONGLETS.map((tab) => {
                const active = profilOnglet === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => selectProfilOnglet(tab.id)}
                    style={{
                      background: active ? "rgba(212, 160, 23, 0.14)" : "transparent",
                      color: active ? GOLD : "var(--text-70)",
                      border: active
                        ? `1px solid ${GOLD}`
                        : "1px solid var(--border-strong)",
                      borderRadius: "4px",
                      padding: "0.4rem 0.75rem",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      cursor: "pointer",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {profilOnglet === "public" ? (
              <div role="tabpanel">
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
                      aria-labelledby="avatar-modal-title"
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
                        id="avatar-modal-title"
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
                                  ? "rgba(212, 160, 23, 0.14)"
                                  : "transparent",
                                color: active
                                  ? GOLD
                                  : "var(--text-70)",
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
                                onClick={() =>
                                  void handleSelectPresetEmoji(emoji)
                                }
                                aria-label={`Choisir ${emoji}`}
                                style={{
                                  aspectRatio: "1",
                                  borderRadius: "4px",
                                  border: selected
                                    ? `1px solid ${GOLD}`
                                    : "1px solid var(--border-strong)",
                                  background: selected
                                    ? "rgba(212, 160, 23, 0.14)"
                                    : "rgba(245, 240, 232, 0.04)",
                                  fontSize: "1.35rem",
                                  cursor: profilPublicSaving
                                    ? "wait"
                                    : "pointer",
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
                            htmlFor="avatar-photo"
                            style={{
                              display: "inline-block",
                              padding: "0.5rem 0.9rem",
                              borderRadius: "4px",
                              border: "1px solid var(--border-strong)",
                              background: "rgba(245, 240, 232, 0.04)",
                              fontSize: "0.85rem",
                              cursor: avatarUploading ? "wait" : "pointer",
                              opacity: avatarUploading ? 0.6 : 1,
                            }}
                          >
                            {avatarUploading ? "Upload…" : "Choisir une photo"}
                          </label>
                          <input
                            id="avatar-photo"
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
                          Cliquez sur « Initiales » pour enregistrer le cercle
                          avec vos initiales.
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

                <label htmlFor="profil-pseudo" style={fieldLabelStyle}>
                  Pseudo
                </label>
                <input
                  id="profil-pseudo"
                  type="text"
                  value={displayNameEdit}
                  disabled={profilPublicSaving}
                  maxLength={80}
                  onChange={(e) => setDisplayNameEdit(e.target.value)}
                  style={fieldInputStyle}
                />
                {emailDisplay ? (
                  <div style={{ marginTop: "1rem" }}>
                    <p style={fieldLabelStyle}>Courriel</p>
                    <p style={{ margin: 0, wordBreak: "break-word" }}>{emailDisplay}</p>
                  </div>
                ) : null}
                <div style={{ marginTop: "1rem" }}>
                  <p style={fieldLabelStyle}>Type de membre</p>
                  <p style={{ margin: 0 }}>{memberLabel}</p>
                </div>
                <div style={{ marginTop: "1rem" }}>
                  <p style={fieldLabelStyle}>Numéro membre</p>
                  <p style={{ margin: 0 }}>
                    {profile?.numero_membre != null &&
                    String(profile.numero_membre).trim()
                      ? `#${profile.numero_membre}`
                      : "—"}
                  </p>
                </div>
                {donsFlagState === "enabled" ? (
                  <>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.65rem",
                        cursor: profilPublicSaving ? "wait" : "pointer",
                        fontSize: "0.92rem",
                        marginTop: "1.15rem",
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
                        style={{ width: "1.1rem", height: "1.1rem", accentColor: GOLD }}
                      />
                      Activer mon profil public / demande de don
                    </label>
                    <label htmlFor="message-don" style={{ ...fieldLabelStyle, marginTop: "0.85rem" }}>
                      Message don
                    </label>
                    <textarea
                      id="message-don"
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
                    {publicProfileHref ? (
                      <p style={{ margin: "0.65rem 0 0", fontSize: "0.85rem", opacity: 0.75 }}>
                        Lien public :{" "}
                        <Link
                          href={publicProfileHref}
                          style={{ color: GOLD, wordBreak: "break-all" }}
                        >
                          {publicProfileHref}
                        </Link>
                      </p>
                    ) : null}
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={profilPublicSaving}
                  style={saveBtnStyle}
                  onClick={() =>
                    void handleSaveProfil({
                      display_name: displayNameEdit.trim(),
                      ...(donsFlagState === "enabled"
                        ? {
                            profil_public: profilPublic,
                            message_don: messageDon.trim(),
                          }
                        : {}),
                    })
                  }
                >
                  {profilPublicSaving ? "…" : "Enregistrer"}
                </button>
              </div>
            ) : null}

            {profilOnglet === "identite" ? (
              <div role="tabpanel" style={{ display: "grid", gap: "0.85rem" }}>
                <div>
                  <label htmlFor="nom-legal" style={fieldLabelStyle}>
                    Nom légal
                  </label>
                  <input
                    id="nom-legal"
                    type="text"
                    value={nomLegal}
                    disabled={profilPublicSaving}
                    maxLength={500}
                    onChange={(e) => setNomLegal(e.target.value)}
                    style={fieldInputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="date-naissance" style={fieldLabelStyle}>
                    Date de naissance
                  </label>
                  <input
                    id="date-naissance"
                    type="date"
                    value={dateNaissance}
                    disabled={profilPublicSaving}
                    onChange={(e) => setDateNaissance(e.target.value)}
                    style={fieldInputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="pays-fiscal" style={fieldLabelStyle}>
                    Pays de résidence fiscale
                  </label>
                  <input
                    id="pays-fiscal"
                    type="text"
                    value={paysResidenceFiscale}
                    disabled={profilPublicSaving}
                    maxLength={120}
                    onChange={(e) => setPaysResidenceFiscale(e.target.value)}
                    style={fieldInputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="telephone" style={fieldLabelStyle}>
                    Téléphone
                  </label>
                  <input
                    id="telephone"
                    type="tel"
                    value={telephone}
                    disabled={profilPublicSaving}
                    maxLength={40}
                    onChange={(e) => setTelephone(e.target.value)}
                    style={fieldInputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="adresse" style={fieldLabelStyle}>
                    Adresse
                  </label>
                  <textarea
                    id="adresse"
                    value={adresse}
                    disabled={profilPublicSaving}
                    maxLength={500}
                    rows={3}
                    onChange={(e) => setAdresse(e.target.value)}
                    style={{ ...fieldInputStyle, resize: "vertical", lineHeight: 1.5 }}
                  />
                </div>
                <button
                  type="button"
                  disabled={profilPublicSaving}
                  style={saveBtnStyle}
                  onClick={() =>
                    void handleSaveProfil({
                      nom_legal: nomLegal.trim() || null,
                      date_naissance: dateNaissance || null,
                      pays_residence_fiscale: paysResidenceFiscale.trim() || null,
                      telephone: telephone.trim() || null,
                      adresse: adresse.trim() || null,
                    })
                  }
                >
                  {profilPublicSaving ? "…" : "Enregistrer"}
                </button>
              </div>
            ) : null}

            {profilOnglet === "retrait" ? (
              <div role="tabpanel">
                {retraitGeleActif ? (
                  <p
                    role="alert"
                    style={{
                      margin: "0 0 1rem",
                      padding: "0.75rem 1rem",
                      borderRadius: "4px",
                      background: "rgba(192, 57, 43, 0.12)",
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
                <label htmlFor="retrait-methode" style={fieldLabelStyle}>
                  Méthode de retrait
                </label>
                <select
                  id="retrait-methode"
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
                  htmlFor="retrait-identifiant"
                  style={{ ...fieldLabelStyle, marginTop: "0.85rem" }}
                >
                  Identifiant du compte
                </label>
                <input
                  id="retrait-identifiant"
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
              </div>
            ) : null}

            {profilOnglet === "notifications" ? (
              <div role="tabpanel" style={{ display: "grid", gap: "0.85rem" }}>
                {(
                  [
                    {
                      id: "notif-quiz",
                      label: "Notifications quiz",
                      checked: notifQuiz,
                      set: setNotifQuiz,
                      key: "notif_quiz" as const,
                    },
                    {
                      id: "notif-redistribution",
                      label: "Notifications redistribution",
                      checked: notifRedistribution,
                      set: setNotifRedistribution,
                      key: "notif_redistribution" as const,
                    },
                    {
                      id: "notif-concours",
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
                      style={{ width: "1.1rem", height: "1.1rem", accentColor: GOLD }}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            ) : null}
          </section>
        ) : (
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
            <dl style={{ margin: 0, display: "grid", gap: "0.85rem", fontSize: "0.95rem" }}>
              <div>
                <dt
                  style={{
                    opacity: 0.55,
                    fontSize: "0.72rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Nom affiché
                </dt>
                <dd style={{ margin: "0.25rem 0 0" }}>{name}</dd>
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
            </dl>
          </section>
        )}

        {isOwnProfile ? (
          <section style={{ background: "var(--bg-card)", borderTop: "2px solid var(--accent)", padding: "1.25rem 1.5rem", marginBottom: "1.25rem" }}>
            <h2 style={{ fontFamily: "var(--font-bebas)", fontSize: "1.1rem", letterSpacing: "0.08em", color: "var(--accent)", marginBottom: "0.85rem" }}>
              MON THÈME
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "2px" }}>
              {availableThemes.map((t) => (
                <button
                  key={t.theme_id}
                  type="button"
                  onClick={() => void changeTheme(t.theme_id)}
                  disabled={themeLoading}
                  style={{
                    padding: "0.65rem 0.85rem",
                    background: currentTheme === t.theme_id ? "rgba(212,160,23,0.12)" : "transparent",
                    border: currentTheme === t.theme_id ? "1px solid var(--accent)" : "1px solid var(--border-soft)",
                    color: currentTheme === t.theme_id ? "var(--accent)" : "var(--text-40)",
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
        ) : null}

        {isOwnProfile && cotisationFlagState === "enabled" ? (
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
              Cotisation
            </h2>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.65rem",
                cursor: cotisationSaving ? "wait" : "pointer",
                fontSize: "0.95rem",
                marginBottom: "1rem",
              }}
            >
              <input
                type="checkbox"
                checked={cotisationActive}
                disabled={cotisationSaving}
                onChange={(e) =>
                  void handleSaveCotisation({
                    cotisation_active: e.target.checked,
                    cotisation_montant: cotisationMontant,
                  })
                }
                style={{ width: "1.1rem", height: "1.1rem", accentColor: GOLD }}
              />
              Activer ma cotisation mensuelle
            </label>
            <label
              htmlFor="cotisation-montant"
              style={{
                display: "block",
                fontSize: "0.72rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                opacity: 0.55,
                marginBottom: "0.35rem",
              }}
            >
              Montant mensuel
            </label>
            <select
              id="cotisation-montant"
              value={cotisationMontant}
              disabled={cotisationSaving}
              onChange={(e) => {
                const next = parseCotisationMontant(e.target.value);
                setCotisationMontant(next);
                setCotisationPointsBonus(pointsBonusForMontant(next));
                void handleSaveCotisation({
                  cotisation_active: cotisationActive,
                  cotisation_montant: next,
                });
              }}
              style={{
                width: "100%",
                maxWidth: "16rem",
                padding: "0.55rem 0.75rem",
                borderRadius: "4px",
                border: "1px solid var(--border-strong)",
                background: "var(--bg)",
                color: TEXT,
                fontSize: "0.95rem",
                fontFamily: "inherit",
                cursor: cotisationSaving ? "wait" : "pointer",
              }}
            >
              {COTISATION_MONTANTS.map((m) => (
                <option key={m} value={m}>
                  ${m}
                </option>
              ))}
            </select>
            <p
              style={{
                margin: "0.85rem 0 0",
                fontSize: "0.85rem",
                opacity: 0.7,
                lineHeight: 1.5,
              }}
            >
              Prélevée automatiquement le 1er du mois · Jamais sur votre argent personnel
            </p>
            <p
              style={{
                margin: "0.65rem 0 0",
                fontSize: "0.9rem",
                color: GOLD,
                fontWeight: 600,
              }}
            >
              +{cotisationPointsBonus} pts bonus / mois en compensation
            </p>
          </section>
        ) : null}

        {isOwnProfile && parrainageFlagState === "enabled" ? (
          <section style={{ borderRadius: "4px", padding: "1.25rem 1.1rem", marginBottom: "1.75rem", background: "var(--bg-card)", border: `1px solid rgba(212, 160, 23, 0.35)` }}>
            <h2 style={{ fontFamily: "var(--font-bebas), Impact, sans-serif", fontSize: "1.35rem", letterSpacing: "0.06em", color: GOLD, margin: "0 0 0.75rem" }}>Inviter un ami</h2>
            <p style={{ margin: "0 0 1rem", opacity: 0.75, fontSize: "0.9rem", lineHeight: 1.5 }}>
              Partagez votre code : votre ami reçoit +20 pts PMQ à l&apos;inscription, et vous recevez +50 pts
              lorsqu&apos;il est actif depuis 30 jours.
            </p>
            {referralCode ? (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.65rem", marginBottom: "0.85rem" }}>
                  <span style={{ fontFamily: "var(--font-mono), ui-monospace, monospace", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "0.08em", color: GOLD }}>
                    {referralCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyReferral(referralCode, "code")}
                    style={{ background: "transparent", color: TEXT, border: `1px solid var(--border-strong)`, borderRadius: "4px", padding: "0.4rem 0.75rem", fontSize: "0.78rem", cursor: "pointer" }}
                  >
                    {referralCopied === "code" ? "Copié ✓" : "Copier le code"}
                  </button>
                </div>
                {referralLink ? (
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.65rem", marginBottom: "0.85rem" }}>
                    <span style={{ fontSize: "0.85rem", opacity: 0.8, wordBreak: "break-all" }}>{referralLink}</span>
                    <button
                      type="button"
                      onClick={() => void copyReferral(referralLink, "link")}
                      style={{ background: "transparent", color: TEXT, border: `1px solid var(--border-strong)`, borderRadius: "4px", padding: "0.4rem 0.75rem", fontSize: "0.78rem", cursor: "pointer" }}
                    >
                      {referralCopied === "link" ? "Copié ✓" : "Copier le lien"}
                    </button>
                  </div>
                ) : null}
                <p style={{ margin: 0, fontSize: "0.88rem", opacity: 0.65 }}>
                  Filleuls actifs : <strong style={{ color: GOLD }}>{filleulsActifs}</strong>
                </p>
              </>
            ) : (
              <p style={{ margin: 0, opacity: 0.65, fontSize: "0.95rem" }}>Votre code parrainage sera disponible prochainement.</p>
            )}
          </section>
        ) : null}

        {isOwnProfile ? (
        <section style={{ marginBottom: "1.75rem" }}>
          <h2 style={{ fontFamily: "var(--font-bebas), Impact, sans-serif", fontSize: "1.35rem", letterSpacing: "0.08em", margin: "0 0 0.75rem", color: GOLD }}>Historique des transactions quiz</h2>
          <p style={{ margin: "0 0 1rem", opacity: 0.75, fontSize: "0.9rem" }}>Points PMQ crédités ou débités par quiz.</p>
          {quizTxHistory.length === 0 ? (
            <p style={{ opacity: 0.65, fontSize: "0.95rem" }}>Aucune transaction quiz pour le moment.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {quizTxHistory.map((tx) => {
                const amount = Number(tx.amount ?? 0);
                const lines = formatQuizTransactionLines(amount, tx.description, profileMultiplier);
                let dateLabel = "—";
                try {
                  dateLabel = dateFmt.format(new Date(tx.created_at));
                } catch {
                  dateLabel = tx.created_at;
                }
                const color = amount >= 0 ? GOLD : ROUGE;
                const signed =
                  amount > 0
                    ? `+${pointsFmt.format(amount)} pts`
                    : `${pointsFmt.format(amount)} pts`;
                return (
                  <li
                    key={tx.id}
                    className="profil-tx-card"
                  >
                    <div style={{ flex: "1 1 12rem", minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>{lines.line1}</p>
                      <p style={{ margin: "0.3rem 0 0", fontSize: "0.88rem", opacity: 0.8 }}>{lines.line2}</p>
                      <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", opacity: 0.55 }}>{dateLabel}</p>
                    </div>
                    <span className="profil-tx-amount" style={{ color, fontWeight: 700, whiteSpace: "nowrap" }}>{signed}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        ) : null}

        {isOwnProfile && donTxHistory.length > 0 ? (
        <section style={{ marginBottom: "1.75rem" }}>
          <h2 style={{ fontFamily: "var(--font-bebas), Impact, sans-serif", fontSize: "1.35rem", letterSpacing: "0.08em", margin: "0 0 0.75rem", color: GOLD }}>Historique des dons</h2>
          <p style={{ margin: "0 0 1rem", opacity: 0.75, fontSize: "0.9rem" }}>Points PMQ envoyés ou reçus entre membres.</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {donTxHistory.map((tx) => {
              const amount = Number(tx.amount ?? 0);
              const lines = formatPaTransferDonLines(tx.description);
              if (!lines) return null;
              let dateLabel = "—";
              try {
                dateLabel = dateFmt.format(new Date(tx.created_at));
              } catch {
                dateLabel = tx.created_at;
              }
              const color = amount >= 0 ? GOLD : ROUGE;
              const signed =
                amount > 0
                  ? `+${pointsFmt.format(amount)} pts`
                  : `${pointsFmt.format(amount)} pts`;
              return (
                <li
                  key={tx.id}
                  className="profil-tx-card"
                >
                  <div style={{ flex: "1 1 12rem", minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{lines.line1}</p>
                    <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", opacity: 0.55 }}>{dateLabel}</p>
                  </div>
                  <span className="profil-tx-amount" style={{ color, fontWeight: 700, whiteSpace: "nowrap" }}>{signed}</span>
                </li>
              );
            })}
          </ul>
        </section>
        ) : null}

        {isOwnProfile ? (
        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontFamily: "var(--font-bebas), Impact, sans-serif", fontSize: "1.35rem", letterSpacing: "0.08em", margin: "0 0 0.75rem", color: GOLD }}>Derniers quiz</h2>
          <p style={{ margin: "0 0 1rem", opacity: 0.75, fontSize: "0.9rem" }}>Les 5 dernières soumissions enregistrées.</p>
          {quizRows.length === 0 ? (
            <p style={{ opacity: 0.65, fontSize: "0.95rem" }}>Aucun quiz complété pour le moment.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {quizRows.map((row, i) => (
                <li key={`${row.video_id}-${row.at ?? i}`} style={{ borderRadius: "4px", padding: "1rem", background: "rgba(245, 240, 232, 0.04)", border: "1px solid var(--border-soft)", display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "0.5rem",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600 }}>{row.title}</p>
                    {row.at ? <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", opacity: 0.55 }}>{dateFmt.format(new Date(row.at))}</p> : null}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ color: GOLD, fontWeight: 700 }}>+{pointsFmt.format(row.points)} pts</span>
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", opacity: 0.75 }}>Score : {row.score} bonnes réponses</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        ) : null}
        </>
        ) : null}
      </main>

      {donModalOpen && !isOwnProfile ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="don-modal-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            background: "rgba(0, 0, 0, 0.72)",
          }}
          onClick={() => {
            if (!donSubmitting) setDonModalOpen(false);
          }}
        >
          <div
            style={{
              width: "min(100%, 22rem)",
              borderRadius: "4px",
              padding: "1.35rem",
              background: "var(--bg-card)",
              border: `1px solid rgba(212, 160, 23, 0.45)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="don-modal-title"
              style={{
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "1.45rem",
                letterSpacing: "0.06em",
                color: GOLD,
                margin: "0 0 0.75rem",
              }}
            >
              Envoyer des points
            </h2>
            <p style={{ margin: "0 0 1rem", fontSize: "0.88rem", opacity: 0.75, lineHeight: 1.5 }}>
              Transférer des points PMQ à <strong style={{ color: TEXT }}>{name}</strong> (min {MIN_DON_PTS} · max {MAX_DON_PTS} pts ce mois).
            </p>
            <label htmlFor="don-pts-range" style={{ display: "block", fontSize: "0.78rem", opacity: 0.65, marginBottom: "0.35rem" }}>
              Montant
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <input
                id="don-pts-range"
                type="range"
                min={MIN_DON_PTS}
                max={MAX_DON_PTS}
                step={1}
                value={donPts}
                onChange={(e) => setDonPts(Number(e.target.value))}
                disabled={donSubmitting || donSuccess}
                style={{ flex: 1, accentColor: GOLD }}
              />
              <input
                type="number"
                min={MIN_DON_PTS}
                max={MAX_DON_PTS}
                step={1}
                value={donPts}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) {
                    setDonPts(Math.min(MAX_DON_PTS, Math.max(MIN_DON_PTS, Math.round(n))));
                  }
                }}
                disabled={donSubmitting || donSuccess}
                style={{
                  width: "4.5rem",
                  padding: "0.35rem 0.45rem",
                  borderRadius: "4px",
                  border: "1px solid var(--border-strong)",
                  background: "var(--bg-card)",
                  color: GOLD,
                  fontWeight: 700,
                  textAlign: "center",
                }}
              />
            </div>
            {donSuccess ? (
              <p style={{ margin: "0 0 1rem", color: "var(--accent-green)", fontSize: "0.9rem" }}>
                Points envoyés avec succès ✓
              </p>
            ) : null}
            <div style={{ display: "flex", gap: "0.65rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                disabled={donSubmitting}
                onClick={() => setDonModalOpen(false)}
                style={{
                  background: "transparent",
                  color: TEXT,
                  border: "1px solid var(--border-strong)",
                  borderRadius: "4px",
                  padding: "0.45rem 0.85rem",
                  fontSize: "0.82rem",
                  cursor: donSubmitting ? "wait" : "pointer",
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={donSubmitting || donSuccess}
                onClick={() => void handleConfirmDon(viewedMemberId)}
                style={{
                  background: GOLD,
                  color: BG,
                  border: "none",
                  borderRadius: "4px",
                  padding: "0.45rem 0.95rem",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: donSubmitting || donSuccess ? "wait" : "pointer",
                }}
              >
                {donSubmitting ? "…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AppBottomNav session={session} memberType={profile?.member_type} />
    </div>
  );
}
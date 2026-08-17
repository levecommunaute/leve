"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { RankBadge } from "../../components/rank-badge";
import {
  getMonthlyMemberRankBadge,
  isCommunauteMemberType,
  type MonthlyRankConfig,
} from "../../lib/rank-badge";
import { AppBottomNav } from "../../components/app-bottom-nav";
import { AppHeader } from "../../components/app-header";
import { HeaderRight } from "../../components/header-right";
import { EnDirectBanner } from "../../components/en-direct-banner";
import { CartesPmqMultiplicateur } from "../../components/cartes-pmq-multiplicateur";
import { getAppBottomNavLinks } from "../../lib/appBottomNavLinks";
import { isGraceBlockedHref } from "../../lib/abonnement";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";
import { checkJwtExpired } from "../../lib/supabase";
import { endActiveBetaSession, useBetaTracking } from "../../lib/beta-tracking";
import { Play, Landmark, Trophy, ShieldCheck, ChevronRight, ArrowDownToLine } from "lucide-react";

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
const ROUGE = "var(--accent-red)";
const GOLD = "var(--accent)";
const SB = "https://lrolatbudvianeazliax.supabase.co";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

async function restJson<T>(
  path: string,
  accessToken: string,
): Promise<{ data: T; error: string | null }> {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const msg =
      json &&
      typeof json === "object" &&
      "message" in json &&
      typeof (json as { message: unknown }).message === "string"
        ? (json as { message: string }).message
        : res.statusText || "Erreur réseau";
    if (await checkJwtExpired({ status: res.status, message: msg })) {
      return { data: null as T, error: null };
    }
    return { data: null as T, error: msg };
  }
  return { data: json as T, error: null };
}

type ProfileRow = {
  display_name: string | null;
  member_type: string | null;
  multiplier: number | string | null;
  numero_membre: string | null;
  abonnement_statut: string | null;
  grace_expire_at: string | null;
  is_beta_tester: boolean | null;
  beta_points: number | string | null;
  beta_temps_total_secondes: number | string | null;
  abonnement_verifie_at?: string | null;
  avatar_url?: string | null;
};

type RangConfigRow = {
  seuil_argent?: unknown;
  seuil_or?: unknown;
  seuil_diamant?: unknown;
  bonus_argent?: unknown;
  bonus_or?: unknown;
  bonus_diamant?: unknown;
};

function parseRangConfigRow(row: RangConfigRow | null | undefined): MonthlyRankConfig {
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    seuil_argent: num(row?.seuil_argent, 100),
    seuil_or: num(row?.seuil_or, 300),
    seuil_diamant: num(row?.seuil_diamant, 600),
    bonus_argent: num(row?.bonus_argent, 0.15),
    bonus_or: num(row?.bonus_or, 0.35),
    bonus_diamant: num(row?.bonus_diamant, 0.6),
  };
}

function formatGraceCountdown(msLeft: number): string {
  if (msLeft <= 0) return "0j 00h 00m 00s";
  const totalSec = Math.floor(msLeft / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${days}j ${hours.toString().padStart(2, "0")}h ${minutes.toString().padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatMemberTypeLabel(raw: string | null | undefined): string {
  if (!raw) return "Communauté";
  const n = raw.trim();
  const lower = n.toLowerCase();
  if (lower === "communauté" || lower === "communaute" || n === "Communauté") return "Communauté";
  if (lower === "pionnier" || n === "Pionnier") return "Pionnier";
  if (lower === "fondateur" || n === "Fondateur") return "Fondateur";
  if (lower === "collaborateur" || n === "Collaborateur") return "Collaborateur";
  return n;
}

function displayNameFrom(
  profile: ProfileRow | null,
  session: Session,
): string {
  const meta = session.user.user_metadata as Record<string, unknown> | undefined;
  const fullName =
    typeof meta?.full_name === "string" ? meta.full_name : undefined;
  return (
    profile?.display_name?.trim() ||
    fullName ||
    session.user.email?.split("@")[0] ||
    "Membre"
  );
}

const cad = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
});

const pointsFmt = new Intl.NumberFormat("fr-CA", {
  maximumFractionDigits: 2,
});

function formatBetaTemps(totalSecondes: number): string {
  const s = Math.max(0, Math.floor(totalSecondes));
  const heures = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (heures > 0) return `${heures}h ${String(minutes).padStart(2, "0")}min`;
  return `${minutes}min`;
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
    // created_at >= 1er jour du mois N-1 AND created_at < 1er jour du mois N
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
  accessToken: string,
  membreId: string,
  bounds: MonthBounds,
): Promise<number> {
  let total = 0;
  let offset = 0;
  const base =
    `points_ponderes?membre_id=eq.${encodeURIComponent(membreId)}&type=eq.quiz` +
    `${createdAtRangeFilter(bounds)}&select=pts_ponderes`;
  for (;;) {
    const { data, error } = await restJson<{ pts_ponderes?: unknown }[]>(
      `${base}&offset=${offset}&limit=${PP_PAGE_SIZE}`,
      accessToken,
    );
    if (error) return 0;
    const rows = data ?? [];
    for (const row of rows) {
      total += Number(row.pts_ponderes ?? 0);
    }
    if (rows.length < PP_PAGE_SIZE) break;
    offset += PP_PAGE_SIZE;
  }
  return total;
}

async function sumAllQuizPtsPonderes(
  accessToken: string,
  bounds: MonthBounds,
): Promise<number> {
  let total = 0;
  let offset = 0;
  const range = createdAtRangeFilter(bounds);
  for (;;) {
    const { data, error } = await restJson<{ pts_ponderes?: unknown }[]>(
      `points_ponderes?type=eq.quiz${range}&select=pts_ponderes&offset=${offset}&limit=${PP_PAGE_SIZE}`,
      accessToken,
    );
    if (error) return 0;
    const rows = data ?? [];
    for (const row of rows) {
      total += Number(row.pts_ponderes ?? 0);
    }
    if (rows.length < PP_PAGE_SIZE) break;
    offset += PP_PAGE_SIZE;
  }
  return total;
}

export default function DashboardPage(): React.JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useBetaTracking(session, "dashboard");
  const [graceFromUrl, setGraceFromUrl] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [totalPointsPmq, setTotalPointsPmq] = useState(0);
  const [pmqBalance, setPmqBalance] = useState(0);
  const [memberPtsPonderes, setMemberPtsPonderes] = useState(0);
  const [totalPtsPonderesAll, setTotalPtsPonderesAll] = useState(0);
  const [prevMonthPtsPonderes, setPrevMonthPtsPonderes] = useState(0);
  const [prevMonthRedistributed, setPrevMonthRedistributed] = useState(false);
  const [pmqMonthLabel, setPmqMonthLabel] = useState("");
  const [prevMonthLabel, setPrevMonthLabel] = useState("");
  const [lastRedistributionCad, setLastRedistributionCad] = useState<
    number | null
  >(null);
  const [rangConfig, setRangConfig] = useState<MonthlyRankConfig | null>(null);
  const [pmqShare, setPmqShare] = useState<{
    mes_pts: number;
    total_pts: number;
    total_pts_pool: number;
    nb_membres_actifs: number;
    nb_membres_total: number;
    pourcentage: number;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [graceMsLeft, setGraceMsLeft] = useState<number | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get("grace");
    setGraceFromUrl(g === "1" || g === "true");
  }, []);

  const inGrace = profile?.abonnement_statut === "grace" || graceFromUrl;

  const graceExpireAt = profile?.grace_expire_at ?? null;

  useEffect(() => {
    if (!inGrace || !graceExpireAt) {
      setGraceMsLeft(null);
      return;
    }
    const target = new Date(graceExpireAt).getTime();
    const tick = (): void => {
      setGraceMsLeft(Math.max(0, target - Date.now()));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [inGrace, graceExpireAt]);

  const loadDashboard = useCallback(async (activeSession: Session) => {
    const token = activeSession.access_token;
    const uid = activeSession.user.id;
    const { current: currentMonth, previous: prevMonth } =
      currentAndPreviousMonthBounds();

    setPmqMonthLabel(currentMonth.label);
    setPrevMonthLabel(prevMonth.label);

    const [
      profileRes,
      txRes,
      histRes,
      prevHistRes,
      bankRes,
      rangRes,
      memberPpRes,
      prevPpRes,
      totalPp,
      pmqShareRes,
    ] = await Promise.all([
        restJson<ProfileRow[]>(
          `profiles?id=eq.${encodeURIComponent(uid)}&select=display_name,member_type,multiplier,numero_membre,abonnement_statut,grace_expire_at,is_beta_tester,beta_points,beta_temps_total_secondes,abonnement_verifie_at,avatar_url`,
          token,
        ),
        restJson<{ amount?: unknown }[]>(
          `points_transactions?membre_id=eq.${encodeURIComponent(uid)}&type=eq.quiz` +
            `${createdAtRangeFilter(currentMonth)}&select=amount`,
          token,
        ),
        restJson<{ total_revenue?: unknown; month?: string }[]>(
          `redistribution_history?select=total_revenue,month&order=month.desc&limit=1`,
          token,
        ),
        restJson<{ month?: string }[]>(
          `redistribution_history?month=eq.${encodeURIComponent(prevMonth.monthDate)}&select=month&limit=1`,
          token,
        ),
        restJson<{ pmq_balance?: unknown }[]>(
          `banque_leve?select=pmq_balance&limit=1`,
          token,
        ),
        restJson<RangConfigRow[]>(
          `rang_config?select=seuil_argent,seuil_or,seuil_diamant,bonus_argent,bonus_or,bonus_diamant&order=updated_at.desc&limit=1`,
          token,
        ),
        sumQuizPtsPonderesForMember(token, uid, currentMonth),
        sumQuizPtsPonderesForMember(token, uid, prevMonth),
        sumAllQuizPtsPonderes(token, currentMonth),
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
              error?: string;
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
      ]);

    const errMsg =
      profileRes.error ??
      txRes.error ??
      histRes.error ??
      prevHistRes.error ??
      bankRes.error ??
      rangRes.error ??
      null;
    setLoadError(errMsg);

    if (!profileRes.error) {
      const rows = profileRes.data ?? [];
      setProfile((rows[0] ?? null) as ProfileRow | null);
      const nextAvatar = typeof (rows[0] as ProfileRow | undefined)?.avatar_url === "string"
        ? (rows[0] as ProfileRow).avatar_url as string
        : null;
      setAvatarUrl(nextAvatar);
      const profileRow = rows[0] ?? null;
      if (!profileRow || (!profileRow.abonnement_verifie_at && !profileRow.is_beta_tester)) {
        handleSignOut();
        return;
      }
    }

    if (txRes.error) {
      setTotalPointsPmq(0);
    } else {
      const rows = txRes.data ?? [];
      const sum = rows.reduce(
        (acc, row) => acc + Number(row.amount ?? 0),
        0,
      );
      setTotalPointsPmq(sum);
    }

    if (histRes.error) {
      setLastRedistributionCad(null);
    } else {
      const hrows = histRes.data ?? [];
      const first = hrows[0];
      if (first?.total_revenue != null) {
        setLastRedistributionCad(Number(first.total_revenue));
      } else {
        setLastRedistributionCad(null);
      }
    }

    if (bankRes.error) {
      setPmqBalance(0);
    } else {
      const brow = (bankRes.data ?? [])[0];
      setPmqBalance(Number(brow?.pmq_balance ?? 0));
    }

    setMemberPtsPonderes(memberPpRes);
    setPrevMonthPtsPonderes(prevPpRes);
    setPrevMonthRedistributed(!prevHistRes.error && (prevHistRes.data ?? []).length > 0);
    setTotalPtsPonderesAll(totalPp);
    setPmqShare(pmqShareRes);

    if (rangRes.error) {
      setRangConfig(null);
    } else {
      const row = (rangRes.data ?? [])[0] as RangConfigRow | undefined;
      setRangConfig(parseRangConfigRow(row));
    }

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
      await loadDashboard(next);
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
  }, [loadDashboard, router]);

  const blockedNav = useMemo(
    () =>
      inGrace
        ? new Set(
            getAppBottomNavLinks(profile?.member_type)
              .filter((p) => isGraceBlockedHref(p.href))
              .map((p) => p.href),
          )
        : new Set<string>(),
    [inGrace, profile?.member_type],
  );

  function handleSignOut(): void {
    setSigningOut(true);
    void endActiveBetaSession();

    const cookieNames = document.cookie
      .split(";")
      .map((cookie) => cookie.trim().split("=")[0])
      .filter(
        (name): name is string =>
          typeof name === "string" &&
          (name.startsWith("sb-") || name.includes("supabase")),
      );

    const hostname = window.location.hostname.replace(/^www\./, "");
    const secure = window.location.protocol === "https:" ? ";secure" : "";
    const domains = [
      undefined,
      window.location.hostname,
      hostname ? `.${hostname}` : undefined,
    ];

    for (const name of cookieNames) {
      for (const domain of domains) {
        const domainPart = domain ? `;domain=${domain}` : "";
        document.cookie =
          `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;Max-Age=0;path=/` +
          `${domainPart}${secure}`;
      }
    }

    window.location.href = "/";
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
      <div style={{ background: "var(--bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(212,160,23,0.4)" }}>
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
  const mult = Number(profile?.multiplier ?? 1);
  const profileMultiplier = Number.isFinite(mult) && mult > 0 ? mult : 1;
  const weightedPointsPmq = memberPtsPonderes;
  const redistributionPending =
    pmqBalance <= 0 ||
    memberPtsPonderes <= 0 ||
    totalPtsPonderesAll <= 0;
  const pmqPoolReel = (lastRedistributionCad ?? 0) * 0.45;
  const redistributionEstimate = redistributionPending
    ? 0
    : pmqPoolReel * (memberPtsPonderes / totalPtsPonderesAll);
  const isBetaTester = profile?.is_beta_tester === true;
  const betaPoints = Number(profile?.beta_points ?? 0);
  const betaTempsSecondes = Number(profile?.beta_temps_total_secondes ?? 0);
  const betaMinutes = Math.floor(betaTempsSecondes / 60);
  const showRankBadge = isCommunauteMemberType(profile?.member_type);
  const monthlyRankBadge = showRankBadge
    ? getMonthlyMemberRankBadge(memberPtsPonderes, rangConfig ?? undefined)
    : null;
  return (
    <div
      className={`${fonts} leve-page-dashboard`}
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
            .dash-logo {
              font-size: clamp(1.2rem, 4vw, 2rem) !important;
            }
            .dash-shortcuts-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 0.65rem;
            }
            .dash-formule-text {
              font-size: max(12px, 0.75rem);
            }
            @media (max-width: 479px) {
              .dash-shortcuts-grid {
                grid-template-columns: 1fr;
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
        rightExtra={<HeaderRight displayName={name} avatarUrl={avatarUrl} />}
      />

      <main style={{ maxWidth: "960px", margin: "0 auto", padding: "1.25rem" }}>
        {isBetaTester ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem 1rem",
              marginBottom: "1.25rem",
              padding: "0.65rem 0.9rem",
              borderRadius: "10px",
              background: "rgba(212, 160, 23, 0.1)",
              border: `1px solid rgba(212, 160, 23, 0.45)`,
              fontSize: "0.85rem",
            }}
          >
            <span style={{ fontWeight: 700, color: GOLD }}>
              🧪 Mode Beta Testeur
            </span>
            <span style={{ opacity: 0.85 }}>
              Temps total : {pointsFmt.format(betaMinutes)} min
            </span>
            <span style={{ opacity: 0.85 }}>
              Points Beta : {pointsFmt.format(betaPoints)} pts
            </span>
            <Link
              href="/beta-dashboard"
              style={{
                marginLeft: "auto",
                color: GOLD,
                fontWeight: 600,
                textDecoration: "underline",
                textUnderlineOffset: "3px",
                whiteSpace: "nowrap",
              }}
            >
              Voir mon tableau de bord Beta →
            </Link>
          </div>
        ) : null}

        {inGrace ? (
          <div
            role="alert"
            style={{
              marginBottom: "1.25rem",
              padding: "1rem 1.15rem",
              borderRadius: "4px",
              background: "rgba(192, 57, 43, 0.22)",
              border: `2px solid ${ROUGE}`,
              color: TEXT,
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem" }}>
              Abonnement YouTube requis — période de grâce
            </p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.88rem", lineHeight: 1.5, opacity: 0.92 }}>
              Réabonnez-vous à{" "}
              <a
                href="https://www.youtube.com/@levecommunaute"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: GOLD, fontWeight: 600 }}
              >
                la chaîne LEVE
              </a>{" "}
              puis reconnectez-vous. L&apos;accès banque, quiz, concours et redistribution est
              suspendu.
            </p>
            {graceExpireAt && graceMsLeft != null ? (
              <p
                style={{
                  margin: "0.75rem 0 0",
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: ROUGE,
                }}
              >
                Temps restant : {formatGraceCountdown(graceMsLeft)}
              </p>
            ) : null}
          </div>
        ) : null}

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

        {/* Hero */}
        <section
          className="leve-hero"
          style={{
            borderRadius: "4px",
            padding: "1.75rem 1.5rem",
            marginBottom: "1.25rem",
            background:
              "linear-gradient(145deg, rgba(192, 57, 43, 0.12) 0%, var(--bg-card) 45%, rgba(212, 160, 23, 0.06) 100%)",
            border: "1px solid var(--border-soft)",
          }}
        >
          <p style={{ margin: 0, opacity: 0.65, fontSize: "0.85rem",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
            Espace membre
            {profile?.numero_membre ? ` · #${profile.numero_membre}` : ""}
          </p>
          <h1
            style={{
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              fontSize: "clamp(2.5rem, 8vw, 3.75rem)",
              letterSpacing: "0.04em",
              margin: "0.35rem 0 0.75rem",
              lineHeight: 1.05,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span>Bonjour {name}</span>
            {showRankBadge ? (
              <RankBadge ptsPonderes={weightedPointsPmq} size="md" />
            ) : null}
          </h1>
          <span
            className="leve-badge-accent"
            style={{
              display: "inline-block",
              background:
                memberLabel === "Fondateur" || memberLabel === "Pionnier"
                  ? "rgba(212, 160, 23, 0.08)"
                  : memberLabel === "Collaborateur"
                    ? "rgba(0, 180, 216, 0.08)"
                    : "rgba(255, 255, 255, 0.04)",
              color:
                memberLabel === "Fondateur" || memberLabel === "Pionnier"
                  ? "var(--accent)"
                  : memberLabel === "Collaborateur"
                    ? "var(--accent-teal)"
                    : "rgba(255, 255, 255, 0.35)",
              border:
                memberLabel === "Fondateur" || memberLabel === "Pionnier"
                  ? "1px solid rgba(212, 160, 23, 0.4)"
                  : memberLabel === "Collaborateur"
                    ? "1px solid rgba(0, 180, 216, 0.3)"
                    : "1px solid rgba(255, 255, 255, 0.12)",
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "0.35rem 0.75rem",
              borderRadius: "4px",
            }}
          >
            {memberLabel}
          </span>
        </section>

        {isBetaTester ? (
          <section
            style={{
              borderRadius: "4px",
              padding: "1.1rem 1.25rem",
              marginBottom: "1.25rem",
              background:
                "linear-gradient(135deg, rgba(212, 160, 23, 0.14) 0%, var(--bg-card) 70%)",
              border: "1px solid rgba(212, 160, 23, 0.4)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "1.25rem",
                letterSpacing: "0.06em",
                color: GOLD,
              }}
            >
              Testeur Beta Officiel 🧪
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "1.5rem",
                margin: "0.75rem 0 0",
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.6 }}>
                  Temps beta
                </p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "1.2rem", fontWeight: 700 }}>
                  {formatBetaTemps(betaTempsSecondes)}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.6 }}>
                  Points beta
                </p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "1.2rem", fontWeight: 700, color: GOLD,
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
                  {pointsFmt.format(betaPoints)}
                </p>
              </div>
            </div>
            <Link
              href="/beta-dashboard"
              style={{
                display: "inline-block",
                marginTop: "0.9rem",
                fontSize: "0.85rem",
                fontWeight: 600,
                color: GOLD,
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              Ouvrir le dashboard beta →
            </Link>
          </section>
        ) : null}

        {/* Stats */}
        <div
          style={{
            marginBottom: "1.75rem",
            fontFamily: "var(--font-mono), ui-monospace, monospace",
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
          }}
        >
          <CartesPmqMultiplicateur
            name={name}
            avatarUrl={avatarUrl}
            totalPointsPmq={totalPointsPmq}
            weightedPointsPmq={weightedPointsPmq}
            pmqMonthLabel={pmqMonthLabel}
            profileMultiplier={profileMultiplier}
            prevMonthLabel={prevMonthLabel}
            prevMonthPtsPonderes={prevMonthPtsPonderes}
            prevMonthRedistributed={prevMonthRedistributed}
            inGrace={inGrace}
            pmqShare={pmqShare}
            monthlyRankBadge={monthlyRankBadge}
            pointsFmt={pointsFmt}
            cad={cad}
          />
          <article
            className="leve-card"
            style={{
              borderRadius: "8px",
              padding: "1.25rem",
              background: "var(--bg-card)",
              border: "1px solid rgba(212,160,23,0.2)",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: "50%",
                  background: "rgba(212,160,23,0.08)",
                  border: "1px solid rgba(212,160,23,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <ArrowDownToLine size={20} strokeWidth={1.5} color={GOLD} />
              </div>
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  fontSize: "0.85rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  opacity: 0.7,
                }}
              >
                Dernière redistribution PMQ
              </p>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "row",
                gap: "2rem",
                flexWrap: "wrap",
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.7rem",
                    opacity: 0.55,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  Redistribution PMQ · 45%
                </p>
                <p
                  style={{
                    margin: "0.4rem 0 0",
                    fontSize: "2.5rem",
                    fontWeight: 700,
                    color: GOLD,
                    lineHeight: 1,
                  }}
                >
                  {lastRedistributionCad != null
                    ? cad.format(lastRedistributionCad * 0.45)
                    : "—"}
                </p>
              </div>
              <div
                style={{
                  width: 1,
                  background: "rgba(212,160,23,0.1)",
                  alignSelf: "stretch",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                {redistributionPending ? (
                  <p style={{ margin: 0, opacity: 0.75 }}>
                    Redistribution : en attente des revenus du mois
                  </p>
                ) : (
                  <>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.82rem",
                        opacity: 0.85,
                        lineHeight: 1.4,
                        fontWeight: 600,
                        fontFamily: "var(--font-mono), ui-monospace, monospace",
                      }}
                    >
                      Estimation redistribution : ~{cad.format(redistributionEstimate)}
                    </p>
                    <p
                      className="dash-formule-text"
                      style={{
                        margin: "0.25rem 0 0",
                        fontSize: "0.75rem",
                        opacity: 0.65,
                        lineHeight: 1.4,
                        fontFamily: "var(--font-mono), ui-monospace, monospace",
                      }}
                    >
                      Formule : ({cad.format(pmqPoolReel)} × tes pts{" "}
                      {pointsFmt.format(memberPtsPonderes)} ÷ total pts{" "}
                      {pointsFmt.format(totalPtsPonderesAll)})
                    </p>
                  </>
                )}
              </div>
            </div>
          </article>
        </div>

        {/* Quick actions */}
        <section style={{ marginBottom: "2rem" }}>
          <h2
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "1.35rem",
              letterSpacing: "0.08em",
              margin: "0 0 0.75rem",
              opacity: 0.9,
            }}
          >
            Raccourcis
          </h2>
          <div
            className="dash-shortcuts-grid"
            style={{
              fontFamily: "var(--font-mono), ui-monospace, monospace",
            }}
          >
            {[
              { href: "/videos", label: "Vidéos", icon: Play, blockOnGrace: false },
              { href: "/banque", label: "Banque LEVE", icon: Landmark, blockOnGrace: true },
              { href: "/classement", label: "Classement", icon: Trophy, blockOnGrace: false },
              { href: "/transparence", label: "Transparence", icon: ShieldCheck, blockOnGrace: true },
            ].map((item) => {
              const blocked = inGrace && item.blockOnGrace;
              const Icon = item.icon;
              const accentColor = blocked ? "var(--text-40)" : "var(--accent)";
              const cellStyle = {
                display: "flex",
                flexDirection: "row" as const,
                alignItems: "center",
                gap: "14px",
                padding: "1rem 1.1rem",
                borderLeft: blocked
                  ? "2px solid rgba(255,255,255,0.08)"
                  : "2px solid rgba(212,160,23,0.5)",
                borderTop: "1px solid var(--border-soft)",
                borderRight: "1px solid var(--border-soft)",
                borderBottom: "1px solid var(--border-soft)",
                background: "var(--bg-card)",
                borderRadius: "4px",
                textDecoration: "none",
                cursor: blocked ? "not-allowed" : "pointer",
                pointerEvents: blocked ? ("none" as const) : ("auto" as const),
              };
              const content = (
                <>
                  <span
                    style={{
                      width: 38,
                      height: 38,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(212,160,23,0.08)",
                      border: "1px solid rgba(212,160,23,0.15)",
                      borderRadius: "4px",
                      flexShrink: 0,
                    }}
                  >
                    <Icon strokeWidth={1.5} size={18} color={accentColor} />
                  </span>
                  <p
                    style={{
                      flex: 1,
                      fontFamily: "var(--font-bebas)",
                      fontSize: "1rem",
                      letterSpacing: "0.06em",
                      color: accentColor,
                      margin: 0,
                    }}
                  >
                    {item.label}
                  </p>
                  <ChevronRight
                    strokeWidth={1.5}
                    size={16}
                    color="var(--text-40)"
                    style={{ opacity: 0.5, flexShrink: 0 }}
                  />
                </>
              );
              if (blocked) {
                return (
                  <span key={item.href} className="leve-shortcut" style={cellStyle} title="Accès suspendu (période de grâce)">
                    {content}
                  </span>
                );
              }
              return (
                <Link key={item.href} href={item.href} className="leve-shortcut" style={cellStyle}>
                  {content}
                </Link>
              );
            })}
          </div>
        </section>
      </main>

      <AppBottomNav session={session} memberType={profile?.member_type} blockedHrefs={blockedNav} />

    </div>
  );
}

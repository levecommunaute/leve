"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { RankBadge } from "../../components/rank-badge";
import { AppBottomNav } from "../../components/app-bottom-nav";
import { AppHeader } from "../../components/app-header";
import { EnDirectBanner } from "../../components/en-direct-banner";
import { MemberAvatar } from "../../components/member-avatar";
import { signOut } from "../../lib/auth";
import {
  getMonthlyMemberRankBadge,
  isCommunauteMemberType,
} from "../../lib/rank-badge";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";
import { checkJwtExpired } from "../../lib/supabase";

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
  avatar_url: string | null;
};

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

export default function ComptePage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [activeTab, setActiveTab] = useState<CompteTab>("profil");

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [totalPointsPmq, setTotalPointsPmq] = useState(0);
  const [pmqMonthLabel, setPmqMonthLabel] = useState("");
  const [prevMonthLabel, setPrevMonthLabel] = useState("");
  const [prevMonthPtsPonderes, setPrevMonthPtsPonderes] = useState(0);
  const [prevMonthRedistributed, setPrevMonthRedistributed] = useState(false);
  const [monthlyPtsTotal, setMonthlyPtsTotal] = useState(0);
  const [pmqShare, setPmqShare] = useState<{
    mes_pts: number;
    total_pts: number;
    pourcentage: number;
  } | null>(null);
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
    ] = await Promise.all([
      fetchRestJson(
        `${SB}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=display_name,email,member_type,multiplier,numero_membre,is_beta_tester,code_parrainage,avatar_url`,
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
        .catch(() => null),
    ]);

    const profileData = Array.isArray(profileRes) ? profileRes[0] : null;
    const row = (profileData as ProfileRow | null) ?? null;
    setProfile(row);
    setAvatarUrl(typeof row?.avatar_url === "string" ? row.avatar_url : null);

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
                        : `×${profileMultiplier.toFixed(1)} · ${pointsFmt.format(pmqShare.mes_pts)} pts · ${pmqShare.pourcentage.toFixed(1)}% du pool`}
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
          <p style={{ margin: 0, opacity: 0.7 }}>Contenu banque</p>
        ) : null}
        {activeTab === "parametres" ? (
          <p style={{ margin: 0, opacity: 0.7 }}>Contenu paramètres</p>
        ) : null}
      </main>

      <AppBottomNav session={session} memberType={profile?.member_type} />
    </div>
  );
}

"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { RankBadge } from "../../components/rank-badge";
import { AppBottomNav } from "../../components/app-bottom-nav";
import { EnDirectBanner } from "../../components/en-direct-banner";
import { signOut } from "../../lib/auth";
import { formatQuizTransactionLines } from "../../lib/quizTransactionDisplay";
import {
  getMonthlyMemberRankBadge,
  isCommunauteMemberType,
} from "../../lib/rank-badge";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";
import { buildReferralLink } from "../../lib/parrainage";
import { checkJwtExpired } from "../../lib/supabase";

const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });

const BG = "#080808";
const TEXT = "#F5F0E8";
const ROUGE = "#C0392B";
const GOLD = "#D4A017";
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
};

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

function avatarInitials(displayName: string): string {
  const cleaned = displayName.trim().replace(/\s+/g, "");
  return (cleaned.slice(0, 2) || "ME").toUpperCase();
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
    border: "1px solid rgba(255, 255, 255, 0.15)",
  };
}

const PP_PAGE_SIZE = 1000;

function currentMonthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

async function sumMonthlyQuizPtsPonderes(
  membreId: string,
  token: string,
): Promise<number> {
  const monthStart = currentMonthStartIso();
  let total = 0;
  let offset = 0;
  for (;;) {
    const url =
      `${SB}/rest/v1/points_ponderes?membre_id=eq.${encodeURIComponent(membreId)}` +
      `&type=eq.quiz&created_at=gte.${encodeURIComponent(monthStart)}` +
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

export default function ProfilPage(): JSX.Element | null {
  const router = useRouter();
  const [viewedMemberParam, setViewedMemberParam] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [totalPointsPmq, setTotalPointsPmq] = useState(0);
  const [quizRows, setQuizRows] = useState<{ video_id: string; title: string; score: number; points: number; at: string | null; }[]>([]);
  const [quizTxHistory, setQuizTxHistory] = useState<PointsTxRow[]>([]);
  const [monthlyPtsTotal, setMonthlyPtsTotal] = useState(0);
  const [filleulsActifs, setFilleulsActifs] = useState(0);
  const [referralCopied, setReferralCopied] = useState<"code" | "link" | null>(null);
  const [parrainageFlagState, setParrainageFlagState] = useState<
    "loading" | "enabled" | "disabled"
  >("loading");
  const [donsFlagState, setDonsFlagState] = useState<
    "loading" | "enabled" | "disabled"
  >("loading");
  const [donModalOpen, setDonModalOpen] = useState(false);
  const [donPts, setDonPts] = useState(MIN_DON_PTS);
  const [donSubmitting, setDonSubmitting] = useState(false);
  const [donSuccess, setDonSuccess] = useState(false);
  const [profilPublicSaving, setProfilPublicSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadProfil = useCallback(async (activeSession: Session, targetId: string) => {
    const token = activeSession.access_token;
    const isOwnProfile = targetId === activeSession.user.id;

    const profileRes = await fetchRestJson(
      `${SB}/rest/v1/profiles?id=eq.${encodeURIComponent(targetId)}&select=display_name,email,member_type,multiplier,numero_membre,is_beta_tester,code_parrainage,profil_public`,
      token,
    );
    const profileData = Array.isArray(profileRes) ? profileRes[0] : null;
    setProfile(profileData as ProfileRow | null);

    const [txRes, monthlyPts] = await Promise.all([
      fetchRestJson(
        `${SB}/rest/v1/points_transactions?membre_id=eq.${encodeURIComponent(targetId)}&type=in.(quiz,parrainage,don_recu,don_envoye)&select=amount`,
        token,
      ),
      sumMonthlyQuizPtsPonderes(targetId, token),
    ]);

    const txData = Array.isArray(txRes) ? txRes : [];
    const sum = txData.reduce(
      (acc: number, row: { amount: unknown }) => acc + Number(row.amount ?? 0),
      0,
    );
    setTotalPointsPmq(sum);
    setMonthlyPtsTotal(monthlyPts);

    if (!isOwnProfile) {
      setQuizTxHistory([]);
      setQuizRows([]);
      setFilleulsActifs(0);
      return;
    }

    const [txHistoryRes, quizRes, parrainagesRes] = await Promise.all([
      fetchRestJson(
        `${SB}/rest/v1/points_transactions?membre_id=eq.${encodeURIComponent(targetId)}&type=in.(quiz,parrainage,don_recu,don_envoye)&select=id,created_at,amount,description&order=created_at.desc&limit=20`,
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
    ]);

    setQuizTxHistory(Array.isArray(txHistoryRes) ? (txHistoryRes as PointsTxRow[]) : []);
    setFilleulsActifs(Array.isArray(parrainagesRes) ? parrainagesRes.length : 0);

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
  }, []);

  useEffect(() => {
    setViewedMemberParam(readViewedMemberFromUrl());
    const onPopState = (): void => {
      setViewedMemberParam(readViewedMemberFromUrl());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [parrainageRes, donsRes] = await Promise.all([
          fetch("/api/feature-flags?nom=parrainage", { cache: "no-store" }),
          fetch("/api/feature-flags?nom=dons-membres", { cache: "no-store" }),
        ]);
        const parrainageJson = (await parrainageRes.json()) as { actif?: boolean };
        const donsJson = (await donsRes.json()) as { actif?: boolean };
        if (cancelled) return;
        setParrainageFlagState(parrainageJson.actif ? "enabled" : "disabled");
        setDonsFlagState(donsJson.actif ? "enabled" : "disabled");
      } catch {
        if (!cancelled) {
          setParrainageFlagState("disabled");
          setDonsFlagState("disabled");
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

  async function handleToggleProfilPublic(next: boolean): Promise<void> {
    if (!session) return;
    setProfilPublicSaving(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/membres/profil-public", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ profil_public: next }),
      });
      const json = (await res.json()) as {
        error?: string;
        profil_public?: boolean;
      };
      if (!res.ok) {
        setLoadError(json.error ?? "Impossible de mettre à jour le profil.");
        return;
      }
      setProfile((prev) =>
        prev ? { ...prev, profil_public: json.profil_public ?? next } : prev,
      );
    } catch {
      setLoadError("Erreur réseau lors de la mise à jour du profil.");
    } finally {
      setProfilPublicSaving(false);
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
  const initials = avatarInitials(name);
  const mult = Number(profile?.multiplier ?? 1);
  const profileMultiplier = Number.isFinite(mult) && mult > 0 ? mult : 1;
  const multiplierDisplay = `${profileMultiplier.toFixed(1)}×`;
  const weightedPointsPmq = totalPointsPmq * profileMultiplier;
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

  return (
    <div className={fonts} style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "var(--font-mono), ui-monospace, monospace", paddingBottom: "6rem" }}>
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
              border: 1px solid rgba(245, 240, 232, 0.1);
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
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid rgba(245, 240, 232, 0.08)", position: "sticky", top: 0, background: "rgba(8, 8, 8, 0.92)", backdropFilter: "blur(8px)", zIndex: 20 }}>
        <Link href="/" style={{ fontFamily: "var(--font-bebas), Impact, sans-serif", fontSize: "2rem", letterSpacing: "0.12em", color: TEXT, textDecoration: "none" }}>LEVE</Link>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.9rem", opacity: 0.85, maxWidth: "42vw", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          <button type="button" disabled={signingOut} onClick={() => void handleSignOut()} style={{ background: "transparent", color: ROUGE, border: `1px solid ${ROUGE}`, borderRadius: "4px", padding: "0.45rem 0.9rem", fontSize: "0.8rem", cursor: signingOut ? "wait" : "pointer" }}>
            {signingOut ? "…" : "Déconnexion"}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: "960px", margin: "0 auto", padding: "1.25rem" }}>
        {loadError ? <p role="alert" style={{ color: ROUGE, fontSize: "0.9rem", marginBottom: "1rem" }}>{loadError}</p> : null}
        {!isOwnProfile && !profile ? (
          <p style={{ opacity: 0.7, fontSize: "0.95rem" }}>Membre introuvable.</p>
        ) : null}
        {profile ? (
        <>
        <section style={{ borderRadius: "4px", padding: "1.75rem 1.5rem", marginBottom: "1.25rem", background: "#141414", borderTop: `2px solid ${GOLD}`, borderLeft: "1px solid rgba(245, 240, 232, 0.1)", borderRight: "1px solid rgba(245, 240, 232, 0.1)", borderBottom: "1px solid rgba(245, 240, 232, 0.1)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "0.75rem" }}>
            <div
              aria-hidden
              style={{
                flexShrink: 0,
                width: "3.25rem",
                height: "3.25rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#141414",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "4px",
                color: GOLD,
                fontFamily: "var(--font-mono), ui-monospace, monospace",
                fontSize: "1rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              {initials}
            </div>
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
          <article style={{ borderRadius: "4px", padding: "1.1rem", background: "rgba(245, 240, 232, 0.04)", border: `1px solid rgba(212, 160, 23, 0.35)` }}>
            <p className="profil-stat-label" style={{ margin: 0, fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD, opacity: 0.95 }}>Total points PMQ</p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "1.65rem", fontWeight: 700, color: GOLD }}>{pointsFmt.format(totalPointsPmq)}</p>
            <p className="profil-stat-label" style={{ margin: "0.75rem 0 0", fontSize: "0.68rem", letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.5 }}>Points pondérés (base redistribution)</p>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.95rem", fontWeight: 600, opacity: 0.75 }}>{pointsFmt.format(weightedPointsPmq)}</p>
            <p style={{ margin: "0.3rem 0 0", fontSize: "0.7rem", opacity: 0.45, lineHeight: 1.4 }}>
              Vos points × multiplicateur ×{profileMultiplier.toFixed(1)} — utilisé pour calculer votre part de redistribution
            </p>
          </article>
          <article style={{ borderRadius: "4px", padding: "1.1rem", background: "rgba(245, 240, 232, 0.04)", border: "1px solid rgba(245, 240, 232, 0.12)" }}>
            <p className="profil-stat-label" style={{ margin: 0, fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.55 }}>Multiplicateur</p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "1.65rem", fontWeight: 700, color: TEXT }}>{multiplierDisplay}</p>
          </article>
        </div>

        <section style={{ borderRadius: "4px", padding: "1.25rem 1.1rem", marginBottom: "1.75rem", background: "#111", border: "1px solid rgba(245, 240, 232, 0.08)" }}>
          <h2 style={{ fontFamily: "var(--font-bebas), Impact, sans-serif", fontSize: "1.35rem", letterSpacing: "0.06em", color: ROUGE, margin: "0 0 1rem" }}>Informations</h2>
          <dl style={{ margin: 0, display: "grid", gap: "0.85rem", fontSize: "0.95rem" }}>
            <div>
              <dt style={{ opacity: 0.55, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Nom affiché</dt>
              <dd style={{ margin: "0.25rem 0 0" }}>{name}</dd>
            </div>
            {emailDisplay ? (
              <div>
                <dt style={{ opacity: 0.55, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Courriel</dt>
                <dd style={{ margin: "0.25rem 0 0", wordBreak: "break-word" }}>{emailDisplay}</dd>
              </div>
            ) : null}
            <div>
              <dt style={{ opacity: 0.55, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Type de membre</dt>
              <dd style={{ margin: "0.25rem 0 0" }}>{memberLabel}</dd>
            </div>
            <div>
              <dt style={{ opacity: 0.55, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Numéro membre</dt>
              <dd style={{ margin: "0.25rem 0 0" }}>{profile?.numero_membre != null && String(profile.numero_membre).trim() ? `#${profile.numero_membre}` : "—"}</dd>
            </div>
            {isOwnProfile ? (
              <div>
                <dt style={{ opacity: 0.55, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Visibilité</dt>
                <dd style={{ margin: "0.5rem 0 0" }}>
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
                      onChange={(e) => void handleToggleProfilPublic(e.target.checked)}
                      style={{ width: "1.1rem", height: "1.1rem", accentColor: GOLD }}
                    />
                    Rendre mon profil public
                  </label>
                  {publicProfileHref ? (
                    <p style={{ margin: "0.65rem 0 0", fontSize: "0.85rem", opacity: 0.75 }}>
                      Lien public :{" "}
                      <Link href={publicProfileHref} style={{ color: GOLD, wordBreak: "break-all" }}>
                        {publicProfileHref}
                      </Link>
                    </p>
                  ) : profilPublic ? (
                    <p style={{ margin: "0.65rem 0 0", fontSize: "0.82rem", opacity: 0.55 }}>
                      Un numéro de membre est requis pour afficher le lien public.
                    </p>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        {isOwnProfile && parrainageFlagState === "enabled" ? (
          <section style={{ borderRadius: "4px", padding: "1.25rem 1.1rem", marginBottom: "1.75rem", background: "#111", border: `1px solid rgba(212, 160, 23, 0.35)` }}>
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
                    style={{ background: "transparent", color: TEXT, border: `1px solid rgba(245, 240, 232, 0.25)`, borderRadius: "4px", padding: "0.4rem 0.75rem", fontSize: "0.78rem", cursor: "pointer" }}
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
                      style={{ background: "transparent", color: TEXT, border: `1px solid rgba(245, 240, 232, 0.25)`, borderRadius: "4px", padding: "0.4rem 0.75rem", fontSize: "0.78rem", cursor: "pointer" }}
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

        {isOwnProfile ? (
        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontFamily: "var(--font-bebas), Impact, sans-serif", fontSize: "1.35rem", letterSpacing: "0.08em", margin: "0 0 0.75rem", color: GOLD }}>Derniers quiz</h2>
          <p style={{ margin: "0 0 1rem", opacity: 0.75, fontSize: "0.9rem" }}>Les 5 dernières soumissions enregistrées.</p>
          {quizRows.length === 0 ? (
            <p style={{ opacity: 0.65, fontSize: "0.95rem" }}>Aucun quiz complété pour le moment.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {quizRows.map((row, i) => (
                <li key={`${row.video_id}-${row.at ?? i}`} style={{ borderRadius: "4px", padding: "1rem", background: "rgba(245, 240, 232, 0.04)", border: "1px solid rgba(245, 240, 232, 0.1)", display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "0.5rem",
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
              background: "#141414",
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
                  border: "1px solid rgba(245, 240, 232, 0.2)",
                  background: "#111",
                  color: GOLD,
                  fontWeight: 700,
                  textAlign: "center",
                }}
              />
            </div>
            {donSuccess ? (
              <p style={{ margin: "0 0 1rem", color: "#2ECC71", fontSize: "0.9rem" }}>
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
                  border: "1px solid rgba(245, 240, 232, 0.25)",
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
"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { RankBadge } from "../../../components/rank-badge";
import { AppBottomNav } from "../../../components/app-bottom-nav";
import { EnDirectBanner } from "../../../components/en-direct-banner";
import { signOut } from "../../../lib/auth";
import { rankBadgeStyle, type RankTier } from "../../../lib/rank-badge";
import { readSessionFromAuthCookies } from "../../../lib/supabase-auth-cookies";

const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });

const BG = "#080808";
const TEXT = "#F5F0E8";
const ROUGE = "#C0392B";
const GOLD = "#D4A017";

const MIN_DON_PTS = 5;
const MAX_DON_PTS = 50;

type PublicProfile = {
  id: string;
  display_name: string | null;
  member_type: string | null;
  numero_membre: string | number | null;
  total_points_pmq: number;
  pts_ponderes: number;
  rank: { emoji: string; label: string; tier: string };
  filleuls_actifs: number;
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

function memberTypeBadgeStyle(label: string): {
  background: string;
  color: string;
  border: string;
} {
  if (label === "Fondateur" || label === "Pionnier") {
    return {
      background: "rgba(212, 160, 23, 0.08)",
      color: GOLD,
      border: `1px solid ${GOLD}`,
    };
  }
  return {
    background: "rgba(255, 255, 255, 0.04)",
    color: "#888888",
    border: "1px solid rgba(255, 255, 255, 0.15)",
  };
}

const pointsFmt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });

export default function ProfilPublicPage(): JSX.Element | null {
  const router = useRouter();
  const params = useParams();
  const numeroParam =
    typeof params.id === "string" ? params.id.trim() : "";

  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [donsFlagState, setDonsFlagState] = useState<
    "loading" | "enabled" | "disabled"
  >("loading");
  const [donModalOpen, setDonModalOpen] = useState(false);
  const [donPts, setDonPts] = useState(MIN_DON_PTS);
  const [donSubmitting, setDonSubmitting] = useState(false);
  const [donSuccess, setDonSuccess] = useState(false);

  const loadPublicProfile = useCallback(async (numero: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/membres/profil-public?numero=${encodeURIComponent(numero)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as PublicProfile & { error?: string };
      if (!res.ok) {
        setProfile(null);
        setLoadError(json.error ?? "Profil introuvable");
        return;
      }
      setProfile(json);
    } catch {
      setProfile(null);
      setLoadError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/feature-flags?nom=dons-membres", {
          cache: "no-store",
        });
        const json = (await res.json()) as { actif?: boolean };
        if (!cancelled) {
          setDonsFlagState(json.actif ? "enabled" : "disabled");
        }
      } catch {
        if (!cancelled) setDonsFlagState("disabled");
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
    }

    function syncFromCookies(): void {
      void applyCookieSession(readSessionFromAuthCookies());
    }

    void applyCookieSession(readSessionFromAuthCookies());

    const onVisible = (): void => {
      if (document.visibilityState === "visible") syncFromCookies();
    };
    document.addEventListener("visibilitychange", onVisible);
    const pollId = window.setInterval(syncFromCookies, 15000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(pollId);
    };
  }, [router]);

  useEffect(() => {
    if (!numeroParam) {
      setLoading(false);
      setLoadError("Numéro de membre invalide");
      return;
    }
    void loadPublicProfile(numeroParam);
  }, [loadPublicProfile, numeroParam]);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/");
    } catch {
      setSigningOut(false);
    }
  }

  async function handleConfirmDon(): Promise<void> {
    if (!session || !profile) return;
    setDonSubmitting(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/membres/don", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ receveur_id: profile.id, pts_pmq: donPts }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setLoadError(json.error ?? "Échec de l'envoi des points.");
        return;
      }
      setDonSuccess(true);
      window.setTimeout(() => {
        setDonModalOpen(false);
        setDonSuccess(false);
        setDonPts(MIN_DON_PTS);
        void loadPublicProfile(numeroParam);
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

  if (!session) return null;

  const name = profile?.display_name?.trim() || "Membre";
  const memberLabel = formatMemberTypeLabel(profile?.member_type ?? null);
  const memberBadge = memberTypeBadgeStyle(memberLabel);
  const rankColors = profile
    ? rankBadgeStyle(profile.rank.tier as RankTier)
    : null;
  const isOwnProfile = profile?.id === session.user.id;
  const showDonButton =
    profile != null &&
    !isOwnProfile &&
    donsFlagState === "enabled";

  return (
    <div
      className={fonts}
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT,
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        paddingBottom: "6rem",
      }}
    >
      <EnDirectBanner />
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 1.25rem",
          borderBottom: "1px solid rgba(245, 240, 232, 0.08)",
          position: "sticky",
          top: 0,
          background: "rgba(8, 8, 8, 0.92)",
          backdropFilter: "blur(8px)",
          zIndex: 20,
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-bebas), Impact, sans-serif",
            fontSize: "2rem",
            letterSpacing: "0.12em",
            color: TEXT,
            textDecoration: "none",
          }}
        >
          LEVE
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button
            type="button"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
            style={{
              background: "transparent",
              color: ROUGE,
              border: `1px solid ${ROUGE}`,
              borderRadius: "4px",
              padding: "0.45rem 0.9rem",
              fontSize: "0.8rem",
              cursor: signingOut ? "wait" : "pointer",
            }}
          >
            {signingOut ? "…" : "Déconnexion"}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: "960px", margin: "0 auto", padding: "1.25rem" }}>
        {loadError ? (
          <p role="alert" style={{ color: ROUGE, fontSize: "0.9rem", marginBottom: "1rem" }}>
            {loadError}
          </p>
        ) : null}

        {loading ? (
          <p style={{ opacity: 0.7 }}>Chargement du profil…</p>
        ) : profile ? (
          <>
            <section
              style={{
                borderRadius: "4px",
                padding: "1.75rem 1.5rem",
                marginBottom: "1.25rem",
                background: "#141414",
                borderTop: `2px solid ${GOLD}`,
                border: "1px solid rgba(245, 240, 232, 0.1)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  opacity: 0.65,
                  fontSize: "0.85rem",
                }}
              >
                Profil public
                {profile.numero_membre != null
                  ? ` · #${profile.numero_membre}`
                  : ""}
              </p>
              <h1
                style={{
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                  fontSize: "clamp(2rem, 7vw, 3rem)",
                  letterSpacing: "0.04em",
                  margin: "0.35rem 0 0.75rem",
                  lineHeight: 1.05,
                  color: TEXT,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span>{name}</span>
                <RankBadge ptsPonderes={profile.pts_ponderes} memberType={profile.member_type} size="md" />
              </h1>
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
              {rankColors ? (
                <span
                  style={{
                    display: "inline-block",
                    marginLeft: "0.5rem",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    padding: "0.3rem 0.65rem",
                    borderRadius: "4px",
                    background: rankColors.background,
                    color: rankColors.color,
                    border: rankColors.border,
                  }}
                >
                  {profile.rank.emoji} {profile.rank.label}
                </span>
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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "0.85rem",
                marginBottom: "1.75rem",
              }}
            >
              <article
                style={{
                  borderRadius: "4px",
                  padding: "1.1rem",
                  background: "rgba(245, 240, 232, 0.04)",
                  border: `1px solid rgba(212, 160, 23, 0.35)`,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.72rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: GOLD,
                    opacity: 0.95,
                  }}
                >
                  Points PMQ
                </p>
                <p
                  style={{
                    margin: "0.5rem 0 0",
                    fontSize: "1.65rem",
                    fontWeight: 700,
                    color: GOLD,
                  }}
                >
                  {pointsFmt.format(profile.total_points_pmq)}
                </p>
              </article>
              <article
                style={{
                  borderRadius: "4px",
                  padding: "1.1rem",
                  background: "rgba(245, 240, 232, 0.04)",
                  border: "1px solid rgba(245, 240, 232, 0.12)",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.72rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    opacity: 0.55,
                  }}
                >
                  Filleuls actifs
                </p>
                <p
                  style={{
                    margin: "0.5rem 0 0",
                    fontSize: "1.65rem",
                    fontWeight: 700,
                    color: TEXT,
                  }}
                >
                  {profile.filleuls_actifs}
                </p>
              </article>
            </div>
          </>
        ) : null}
      </main>

      {donModalOpen && profile ? (
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
            <p
              style={{
                margin: "0 0 1rem",
                fontSize: "0.88rem",
                opacity: 0.75,
                lineHeight: 1.5,
              }}
            >
              Transférer des points PMQ à{" "}
              <strong style={{ color: TEXT }}>{name}</strong> (min {MIN_DON_PTS} · max{" "}
              {MAX_DON_PTS} pts ce mois).
            </p>
            <label
              htmlFor="don-pts-range"
              style={{
                display: "block",
                fontSize: "0.78rem",
                opacity: 0.65,
                marginBottom: "0.35rem",
              }}
            >
              Montant
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
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
                    setDonPts(
                      Math.min(MAX_DON_PTS, Math.max(MIN_DON_PTS, Math.round(n))),
                    );
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
                onClick={() => void handleConfirmDon()}
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

      <AppBottomNav session={session} />
    </div>
  );
}

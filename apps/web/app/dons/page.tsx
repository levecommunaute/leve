"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { AppBottomNav } from "../../components/app-bottom-nav";
import { EnDirectBanner } from "../../components/en-direct-banner";
import { signOut } from "../../lib/auth";
import { rankBadgeStyle, type RankTier } from "../../lib/rank-badge";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";

const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });

const BG = "#080808";
const TEXT = "#F5F0E8";
const ROUGE = "#C0392B";
const GOLD = "#D4A017";

const MIN_DON_PTS = 5;
const MAX_DON_PTS = 50;

type DonMembre = {
  id: string;
  display_name: string | null;
  member_type: string | null;
  numero_membre: string | number | null;
  message_don: string;
  rank: { emoji: string; label: string; tier: string };
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

function displayName(membre: DonMembre): string {
  return membre.display_name?.trim() || "Membre";
}

export default function DonsPage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [memberType, setMemberType] = useState<string | null>(null);
  const [donsFlagState, setDonsFlagState] = useState<
    "loading" | "enabled" | "disabled"
  >("loading");
  const [membres, setMembres] = useState<DonMembre[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [donModalOpen, setDonModalOpen] = useState(false);
  const [selectedMembre, setSelectedMembre] = useState<DonMembre | null>(null);
  const [donPts, setDonPts] = useState(MIN_DON_PTS);
  const [donSubmitting, setDonSubmitting] = useState(false);
  const [donSuccess, setDonSuccess] = useState(false);

  const loadDons = useCallback(async (token: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/membres/dons", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        error?: string;
        actif?: boolean;
        membres?: DonMembre[];
      };
      if (res.status === 403 || json.actif === false) {
        setDonsFlagState("disabled");
        setMembres([]);
        return;
      }
      if (!res.ok) {
        setLoadError(json.error ?? "Impossible de charger les demandes.");
        setMembres([]);
        return;
      }
      setDonsFlagState("enabled");
      setMembres(Array.isArray(json.membres) ? json.membres : []);
    } catch {
      setLoadError("Erreur réseau");
      setMembres([]);
    } finally {
      setLoading(false);
    }
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
      await loadDons(next.access_token);
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
  }, [loadDons, router]);

  useEffect(() => {
    if (!session?.access_token) {
      setMemberType(null);
      return;
    }
    let cancelled = false;
    const SB = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    void (async () => {
      try {
        const res = await fetch(
          `${SB}/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=member_type`,
          {
            headers: {
              apikey: KEY,
              Authorization: `Bearer ${session.access_token}`,
            },
          },
        );
        const json = (await res.json()) as { member_type?: string }[];
        if (!cancelled) {
          setMemberType(Array.isArray(json) && json[0] ? json[0].member_type ?? null : null);
        }
      } catch {
        if (!cancelled) setMemberType(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/");
    } catch {
      setSigningOut(false);
    }
  }

  function openDonModal(membre: DonMembre): void {
    if (membre.id === session?.user.id) return;
    setSelectedMembre(membre);
    setDonPts(MIN_DON_PTS);
    setDonSuccess(false);
    setDonModalOpen(true);
  }

  async function handleConfirmDon(): Promise<void> {
    if (!session || !selectedMembre) return;
    setDonSubmitting(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/membres/don", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ receveur_id: selectedMembre.id, pts_pmq: donPts }),
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
        setSelectedMembre(null);
        setDonPts(MIN_DON_PTS);
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

  const visibleMembres = membres.filter((m) => m.id !== session.user.id);

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
      </header>

      <main
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          padding: donsFlagState === "disabled" ? "2rem 1.25rem" : "1.25rem",
          ...(donsFlagState === "disabled"
            ? {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "calc(100vh - 10rem)",
              }
            : {}),
        }}
      >
        {donsFlagState === "disabled" ? (
          <section
            aria-live="polite"
            style={{
              width: "100%",
              maxWidth: "480px",
              background: "#141414",
              border: `1px solid ${GOLD}`,
              borderRadius: "4px",
              padding: "2.5rem 1.75rem",
              textAlign: "center",
            }}
          >
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "clamp(1.75rem, 6vw, 2.5rem)",
                letterSpacing: "0.12em",
                color: TEXT,
              }}
            >
              DONS COMMUNAUTAIRES
            </h1>
            <p
              style={{
                margin: "1rem auto 0",
                maxWidth: "26rem",
                fontSize: "1rem",
                lineHeight: 1.65,
                opacity: 0.88,
                color: TEXT,
              }}
            >
              La fonctionnalité de dons entre membres arrive bientôt ! Vous pourrez
              envoyer des points PMQ à d&apos;autres membres de la communauté pour les
              soutenir.
            </p>
          </section>
        ) : (
          <>
            <h1
              style={{
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "clamp(2rem, 6vw, 2.75rem)",
                letterSpacing: "0.06em",
                color: GOLD,
                margin: "0 0 0.5rem",
              }}
            >
              Dons communautaires
            </h1>
            <p style={{ margin: "0 0 1.5rem", opacity: 0.75, fontSize: "0.92rem", lineHeight: 1.5 }}>
              Membres qui sollicitent des points PMQ. Envoyez entre {MIN_DON_PTS} et{" "}
              {MAX_DON_PTS} pts par transfert.
            </p>

            {loadError ? (
              <p role="alert" style={{ color: ROUGE, fontSize: "0.9rem", marginBottom: "1rem" }}>
                {loadError}
              </p>
            ) : null}

            {donsFlagState === "loading" || loading ? (
              <p style={{ opacity: 0.7 }}>Chargement…</p>
            ) : visibleMembres.length === 0 ? (
              <p style={{ opacity: 0.65, fontSize: "0.95rem" }}>
                Aucune demande de don pour le moment.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "grid",
                  gap: "0.85rem",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                }}
              >
                {visibleMembres.map((membre) => {
                  const name = displayName(membre);
                  const memberLabel = formatMemberTypeLabel(membre.member_type);
                  const memberBadge = memberTypeBadgeStyle(memberLabel);
                  const rankStyle = rankBadgeStyle(membre.rank.tier as RankTier);
                  const numero =
                    membre.numero_membre != null && String(membre.numero_membre).trim()
                      ? `#${String(membre.numero_membre).trim()}`
                      : null;

                  return (
                    <li
                      key={membre.id}
                      style={{
                        borderRadius: "4px",
                        padding: "1.15rem",
                        background: "#141414",
                        border: "1px solid rgba(245, 240, 232, 0.1)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.65rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: "0.45rem",
                        }}
                      >
                        <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>{name}</span>
                        {numero ? (
                          <span style={{ opacity: 0.55, fontSize: "0.82rem" }}>{numero}</span>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "0.68rem",
                            fontWeight: 600,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            padding: "0.3rem 0.6rem",
                            borderRadius: "4px",
                            ...memberBadge,
                          }}
                        >
                          {memberLabel}
                        </span>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "0.68rem",
                            fontWeight: 600,
                            letterSpacing: "0.06em",
                            padding: "0.3rem 0.6rem",
                            borderRadius: "4px",
                            ...rankStyle,
                          }}
                        >
                          {membre.rank.emoji} {membre.rank.label}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.9rem",
                          lineHeight: 1.55,
                          opacity: 0.85,
                          flex: 1,
                        }}
                      >
                        {membre.message_don}
                      </p>
                      <button
                        type="button"
                        onClick={() => openDonModal(membre)}
                        style={{
                          alignSelf: "flex-start",
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
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>

      {donModalOpen && selectedMembre ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dons-modal-title"
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
              id="dons-modal-title"
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
              Transférer des points PMQ à{" "}
              <strong style={{ color: TEXT }}>{displayName(selectedMembre)}</strong> (min {MIN_DON_PTS} · max{" "}
              {MAX_DON_PTS} pts ce mois).
            </p>
            <label htmlFor="dons-pts-range" style={{ display: "block", fontSize: "0.78rem", opacity: 0.65, marginBottom: "0.35rem" }}>
              Montant
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <input
                id="dons-pts-range"
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

      <AppBottomNav session={session} memberType={memberType} />
    </div>
  );
}

"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { isCollaborateurMemberType } from "../../lib/pcol";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";
import { useAppBottomNavLinks } from "../../lib/useAppBottomNavLinks";

const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });

const BG = "#080808";
const TEXT = "#F5F0E8";
const ROUGE = "#C0392B";
const GOLD = "#D4A017";
const VERT = "#2ECC71";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://lrolatbudvianeazliax.supabase.co";
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

const pointsFmt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
const cadFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});

type ProfileRow = {
  display_name: string | null;
  member_type: string | null;
};

type PendingRow = {
  id: string;
  video_id: string;
  video_title: string;
  points_amount: number;
  expires_at: string;
  status: string;
  created_at: string;
};

type VideoStats = {
  videoId: string;
  title: string;
  quizCount: number;
  ptsPcolGeneres: number;
  pendingAmount: number;
  pendingExpiresAt: string | null;
};

function msUntil(iso: string): number {
  return new Date(iso).getTime() - Date.now();
}

function daysRemaining(iso: string): number {
  const ms = msUntil(iso);
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expiré";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  return `${days}j ${hours.toString().padStart(2, "0")}h ${minutes.toString().padStart(2, "0")}m`;
}

export default function CollaborateurPage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [soldePcolDollars, setSoldePcolDollars] = useState<number | null>(null);
  const [pcolGenerePonderes, setPcolGenerePonderes] = useState(0);
  const [valeurParPt, setValeurParPt] = useState<number | null>(null);
  const [videoStats, setVideoStats] = useState<VideoStats[]>([]);
  const [pendingList, setPendingList] = useState<PendingRow[]>([]);
  const [totalQuizMembres, setTotalQuizMembres] = useState(0);
  const [totalPtsGeneresPonderes, setTotalPtsGeneresPonderes] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const navPages = useAppBottomNavLinks(session, profile?.member_type);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const loadCollaborateur = useCallback(async (activeSession: Session) => {
    const uid = activeSession.user.id;
    const token = activeSession.access_token;
    const headers = { apikey: KEY, Authorization: `Bearer ${token}` };

    const profileRes = await fetch(
      `${SB}/rest/v1/profiles?id=eq.${uid}&select=display_name,member_type`,
      { headers },
    ).then((r) => r.json());

    const prof = Array.isArray(profileRes) ? (profileRes[0] as ProfileRow) : null;
    setProfile(prof);

    if (!isCollaborateurMemberType(prof?.member_type)) {
      setLoadError("Accès réservé aux collaborateurs.");
      return;
    }

    const statsRes = await fetch("/api/collaborateur/stats", { cache: "no-store" });
    const statsJson = (await statsRes.json()) as {
      error?: string;
      solde_pcol_dollars?: number | null;
      pcol_genere_ponderes?: number;
      valeur_par_pt?: number | null;
      total_pts_generes_ponderes?: number;
      total_quiz_membres?: number;
      pending?: PendingRow[];
      videos?: {
        videoId: string;
        title: string;
        quizCount: number;
        ptsPcolGeneres: number;
        pendingAmount: number;
        pendingExpiresAt: string | null;
      }[];
    };

    if (!statsRes.ok) {
      setLoadError(statsJson.error ?? "Impossible de charger les statistiques");
      return;
    }

    setSoldePcolDollars(
      statsJson.solde_pcol_dollars != null ? Number(statsJson.solde_pcol_dollars) : null,
    );
    setPcolGenerePonderes(Number(statsJson.pcol_genere_ponderes ?? 0));
    setValeurParPt(
      statsJson.valeur_par_pt != null ? Number(statsJson.valeur_par_pt) : null,
    );
    setTotalPtsGeneresPonderes(Number(statsJson.total_pts_generes_ponderes ?? 0));
    setTotalQuizMembres(Number(statsJson.total_quiz_membres ?? 0));
    setPendingList(statsJson.pending ?? []);
    setVideoStats(
      (statsJson.videos ?? []).map((v) => ({
        videoId: v.videoId,
        title: v.title,
        quizCount: v.quizCount,
        ptsPcolGeneres: v.ptsPcolGeneres,
        pendingAmount: v.pendingAmount,
        pendingExpiresAt: v.pendingExpiresAt,
      })),
    );
    setLoadError(null);
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
      await loadCollaborateur(next);
    }

    void applyCookieSession(readSessionFromAuthCookies());

    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        void applyCookieSession(readSessionFromAuthCookies());
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const pollId = window.setInterval(() => {
      void applyCookieSession(readSessionFromAuthCookies());
    }, 15000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(pollId);
    };
  }, [loadCollaborateur, router]);

  async function handleRecuperer(pendingId: string): Promise<void> {
    setRecoveringId(pendingId);
    try {
      const res = await fetch("/api/collaborateur/recuperer-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pending_id: pendingId }),
      });
      const json = (await res.json()) as { error?: string; pts_recuperes?: number };
      if (!res.ok) {
        setLoadError(json.error ?? "Échec de la récupération");
        return;
      }
      if (session) await loadCollaborateur(session);
    } catch {
      setLoadError("Erreur réseau");
    } finally {
      setRecoveringId(null);
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

  const isCollab = isCollaborateurMemberType(profile?.member_type);

  return (
    <div
      className={fonts}
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT,
        fontFamily: "var(--font-dm), system-ui, sans-serif",
        paddingBottom: "6rem",
      }}
    >
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
          href="/dashboard"
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
        <span style={{ fontSize: "0.85rem", color: GOLD, letterSpacing: "0.06em" }}>
          Espace collaborateur
        </span>
      </header>

      <main style={{ maxWidth: "960px", margin: "0 auto", padding: "1.25rem" }}>
        {loadError ? (
          <p role="alert" style={{ color: ROUGE, fontSize: "0.9rem", marginBottom: "1rem" }}>
            {loadError}
          </p>
        ) : null}

        {!isCollab ? (
          <p style={{ opacity: 0.75 }}>Cette page est réservée aux membres de type collaborateur.</p>
        ) : (
          <>
            <section
              style={{
                borderRadius: "14px",
                padding: "1.75rem 1.5rem",
                marginBottom: "1.25rem",
                background:
                  "linear-gradient(145deg, rgba(212, 160, 23, 0.15) 0%, rgba(8, 8, 8, 0.9) 50%, rgba(192, 57, 43, 0.08) 100%)",
                border: "1px solid rgba(212, 160, 23, 0.35)",
              }}
            >
              <p style={{ margin: 0, opacity: 0.65, fontSize: "0.85rem" }}>Solde PCOL total ($)</p>
              <p
                style={{
                  margin: "0.35rem 0 0",
                  fontSize: "clamp(2.2rem, 8vw, 3.2rem)",
                  fontWeight: 700,
                  color: GOLD,
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  letterSpacing: "0.04em",
                }}
              >
                {soldePcolDollars != null ? cadFmt.format(soldePcolDollars) : "—"}
              </p>
              {valeurParPt != null ? (
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", opacity: 0.5 }}>
                  Valeur par pt (dernière redistribution) : {cadFmt.format(valeurParPt)}
                </p>
              ) : null}
              <p style={{ margin: "1rem 0 0", opacity: 0.65, fontSize: "0.85rem" }}>
                PCOL généré (pts pondérés)
              </p>
              <p
                style={{
                  margin: "0.25rem 0 0",
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: TEXT,
                }}
              >
                {pointsFmt.format(pcolGenerePonderes)} pts
              </p>
              <p style={{ margin: "0.75rem 0 0", fontSize: "0.85rem", opacity: 0.6, lineHeight: 1.5 }}>
                20 % des points pondérés gagnés par les membres sur vos vidéos · 12 % crédité
                directement · 8 % en pending récupérable 1 an
              </p>
            </section>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "0.85rem",
                marginBottom: "1.75rem",
              }}
            >
              <article
                style={{
                  borderRadius: "12px",
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
                  Quiz complétés (membres)
                </p>
                <p style={{ margin: "0.5rem 0 0", fontSize: "1.65rem", fontWeight: 700 }}>
                  {totalQuizMembres}
                </p>
              </article>
              <article
                style={{
                  borderRadius: "12px",
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
                  Points générés (pondérés)
                </p>
                <p style={{ margin: "0.5rem 0 0", fontSize: "1.65rem", fontWeight: 700, color: GOLD }}>
                  {pointsFmt.format(totalPtsGeneresPonderes)}
                </p>
              </article>
            </div>

            <section style={{ marginBottom: "2rem" }}>
              <h2
                style={{
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  fontSize: "1.35rem",
                  letterSpacing: "0.08em",
                  margin: "0 0 0.75rem",
                  color: GOLD,
                }}
              >
                Pending PCOL
              </h2>
              {pendingList.length === 0 ? (
                <p style={{ opacity: 0.65 }}>Aucun pending actif.</p>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  {pendingList.map((p) => {
                    const expired = msUntil(p.expires_at) <= 0;
                    const canRecover =
                      p.status === "pending" && !expired && p.points_amount > 0;
                    const daysLeft = daysRemaining(p.expires_at);

                    return (
                      <li
                        key={p.id}
                        style={{
                          borderRadius: "12px",
                          padding: "1.1rem",
                          background: expired
                            ? "rgba(192, 57, 43, 0.12)"
                            : "rgba(212, 160, 23, 0.1)",
                          border: `1px solid ${expired ? ROUGE : "rgba(212, 160, 23, 0.35)"}`,
                        }}
                      >
                        <p style={{ margin: 0, fontWeight: 600 }}>{p.video_title}</p>
                        <p style={{ margin: "0.5rem 0 0", fontSize: "0.88rem" }}>
                          <strong style={{ color: GOLD }}>
                            {pointsFmt.format(p.points_amount)} pts
                          </strong>{" "}
                          (8 %)
                        </p>
                        <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", opacity: 0.65 }}>
                          Expire le{" "}
                          {new Date(p.expires_at).toLocaleDateString("fr-CA", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                        <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", opacity: 0.65 }}>
                          {expired
                            ? "Expiré — points transférés au pool PTC"
                            : `${daysLeft} jour${daysLeft !== 1 ? "s" : ""} restant${daysLeft !== 1 ? "s" : ""} · ${formatCountdown(new Date(p.expires_at).getTime() - nowTick)}`}
                        </p>
                        {canRecover ? (
                          <button
                            type="button"
                            disabled={recoveringId === p.id}
                            onClick={() => void handleRecuperer(p.id)}
                            style={{
                              marginTop: "0.65rem",
                              background: VERT,
                              color: BG,
                              border: "none",
                              borderRadius: "6px",
                              padding: "0.5rem 1rem",
                              fontWeight: 700,
                              fontSize: "0.85rem",
                              cursor: recoveringId === p.id ? "wait" : "pointer",
                            }}
                          >
                            {recoveringId === p.id ? "…" : "Récupérer"}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section style={{ marginBottom: "2rem" }}>
              <h2
                style={{
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  fontSize: "1.35rem",
                  letterSpacing: "0.08em",
                  margin: "0 0 0.75rem",
                  color: GOLD,
                }}
              >
                Mes vidéos
              </h2>
              {videoStats.length === 0 ? (
                <p style={{ opacity: 0.65 }}>Aucune vidéo associée à votre compte.</p>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  {videoStats.map((v) => {
                    const hasPending = v.pendingAmount > 0 && v.pendingExpiresAt;
                    const expired =
                      hasPending && msUntil(v.pendingExpiresAt!) <= 0;

                    return (
                      <li
                        key={v.videoId}
                        style={{
                          borderRadius: "12px",
                          padding: "1.1rem",
                          background: "rgba(245, 240, 232, 0.04)",
                          border: "1px solid rgba(245, 240, 232, 0.1)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            justifyContent: "space-between",
                            gap: "0.5rem",
                            marginBottom: "0.65rem",
                          }}
                        >
                          <p style={{ margin: 0, fontWeight: 600, fontSize: "1rem" }}>{v.title}</p>
                          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>
                            {v.quizCount} membre{v.quizCount !== 1 ? "s" : ""} · quiz
                          </span>
                        </div>
                        <p style={{ margin: "0 0 0.5rem", fontSize: "0.88rem", opacity: 0.75 }}>
                          Points PCOL générés :{" "}
                          <strong style={{ color: GOLD }}>
                            {pointsFmt.format(v.ptsPcolGeneres)}
                          </strong>{" "}
                          pts pondérés
                        </p>
                        {hasPending ? (
                          <div
                            style={{
                              marginTop: "0.5rem",
                              padding: "0.75rem",
                              borderRadius: "8px",
                              background: expired
                                ? "rgba(192, 57, 43, 0.12)"
                                : "rgba(212, 160, 23, 0.1)",
                              border: `1px solid ${expired ? ROUGE : "rgba(212, 160, 23, 0.35)"}`,
                            }}
                          >
                            <p style={{ margin: 0, fontSize: "0.85rem" }}>
                              Pending actif :{" "}
                              <strong>{pointsFmt.format(v.pendingAmount)} pts</strong>
                            </p>
                            <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", opacity: 0.65 }}>
                              {expired
                                ? "Expiré"
                                : `Expire dans : ${formatCountdown(new Date(v.pendingExpiresAt!).getTime() - nowTick)} · ${daysRemaining(v.pendingExpiresAt!)} jour${daysRemaining(v.pendingExpiresAt!) !== 1 ? "s" : ""}`}
                            </p>
                          </div>
                        ) : (
                          <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.5 }}>
                            Aucun pending actif
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </main>

      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "rgba(8, 8, 8, 0.97)",
          borderTop: "1px solid rgba(245, 240, 232, 0.1)",
          padding: "0.5rem 0.35rem calc(0.5rem + env(safe-area-inset-bottom))",
          zIndex: 30,
        }}
      >
        <div
          style={{
            display: "flex",
            overflowX: "auto",
            gap: "0.5rem",
            justifyContent: "flex-start",
            maxWidth: "960px",
            margin: "0 auto",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
          }}
        >
          {navPages.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              style={{
                flex: "0 0 auto",
                fontSize: "0.68rem",
                color: p.href === "/collaborateur" ? GOLD : TEXT,
                opacity: p.href === "/collaborateur" ? 1 : 0.75,
                textDecoration: "none",
                padding: "0.35rem 0.5rem",
                whiteSpace: "nowrap",
              }}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

"use client";

export const dynamic = "force-dynamic";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { BonusBadge } from "../../components/bonus-badge";
import { useAppBottomNavLinks } from "../../lib/useAppBottomNavLinks";
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

const BG = "#080808";
const TEXT = "#F5F0E8";
const ROUGE = "#C0392B";
const GOLD = "#D4A017";
const SB = "https://lrolatbudvianeazliax.supabase.co";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

type VideoRow = {
  id: string;
  youtube_id: string;
  title: string | null;
  points_value: number | null;
  bonus_expire_at: string | null;
};

type SubmissionRow = {
  video_id: string;
};

type VideoMemberStatus = "completed" | "code_submitted" | "not_completed";

function memberStatusForVideo(
  videoId: string,
  quizVideoIds: Set<string>,
  codeVideoIds: Set<string>,
): VideoMemberStatus {
  if (quizVideoIds.has(videoId)) return "completed";
  if (codeVideoIds.has(videoId)) return "code_submitted";
  return "not_completed";
}

const STATUS_STYLES: Record<
  VideoMemberStatus,
  { label: string; icon: string; color: string; border: string; bg: string }
> = {
  completed: {
    label: "Quiz complété",
    icon: "✅",
    color: "#2ECC71",
    border: "#2ECC71",
    bg: "rgba(46, 204, 113, 0.06)",
  },
  code_submitted: {
    label: "Code trouvé",
    icon: "🔒",
    color: GOLD,
    border: GOLD,
    bg: "rgba(212, 160, 23, 0.08)",
  },
  not_completed: {
    label: "Non commencé",
    icon: "▶",
    color: "#888888",
    border: "rgba(255, 255, 255, 0.12)",
    bg: "transparent",
  },
};

type ProfileRow = {
  display_name: string | null;
  member_type: string | null;
};

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

function VideoThumb({ youtubeId, title }: { youtubeId: string; title: string }): JSX.Element {
  const urls = [
    `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
  ];
  const [idx, setIdx] = useState(0);
  const src = urls[Math.min(idx, urls.length - 1)]!;

  return (
    <div
      style={{
        position: "relative",
        aspectRatio: "16 / 9",
        overflow: "hidden",
        borderRadius: "4px",
        background: "rgba(245, 240, 232, 0.06)",
              }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={title}
        loading="lazy"
        onError={() => setIdx((p) => (p + 1 < urls.length ? p + 1 : p))}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </div>
  );
}

export default function VideosPage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const navPages = useAppBottomNavLinks(session, profile?.member_type);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [quizVideoIds, setQuizVideoIds] = useState<Set<string>>(() => new Set());
  const [codeVideoIds, setCodeVideoIds] = useState<Set<string>>(() => new Set());
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadVideos = useCallback(async (activeSession: Session) => {
    const token = activeSession.access_token;
    const uid = activeSession.user.id;
    setListLoading(true);
    setListError(null);

    const headers = {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    try {
      const [videosRes, quizRes, codeRes] = await Promise.all([
        fetch(
          `${SB}/rest/v1/videos?select=id,youtube_id,title,points_value,bonus_expire_at&order=created_at.desc`,
          { headers },
        ),
        fetch(
          `${SB}/rest/v1/quiz_submissions?membre_id=eq.${encodeURIComponent(uid)}&select=video_id`,
          { headers },
        ),
        fetch(
          `${SB}/rest/v1/code_submissions?membre_id=eq.${encodeURIComponent(uid)}&select=video_id`,
          { headers },
        ),
      ]);

      const [videosJson, quizJson, codeJson] = await Promise.all([
        videosRes.json(),
        quizRes.json(),
        codeRes.json(),
      ]);

      if (!videosRes.ok) {
        const msg =
          videosJson &&
          typeof videosJson === "object" &&
          "message" in videosJson &&
          typeof (videosJson as { message: unknown }).message === "string"
            ? (videosJson as { message: string }).message
            : "Impossible de charger les vidéos";
        if (await checkJwtExpired({ status: videosRes.status, message: msg })) {
          return;
        }
        setListError(msg);
        setVideos([]);
      } else {
        setVideos(Array.isArray(videosJson) ? (videosJson as VideoRow[]) : []);
      }

      if (quizRes.ok && Array.isArray(quizJson)) {
        setQuizVideoIds(
          new Set(
            (quizJson as SubmissionRow[])
              .map((r) => r.video_id)
              .filter((id): id is string => typeof id === "string" && id.length > 0),
          ),
        );
      } else {
        setQuizVideoIds(new Set());
      }

      if (codeRes.ok && Array.isArray(codeJson)) {
        setCodeVideoIds(
          new Set(
            (codeJson as SubmissionRow[])
              .map((r) => r.video_id)
              .filter((id): id is string => typeof id === "string" && id.length > 0),
          ),
        );
      } else {
        setCodeVideoIds(new Set());
      }
    } catch {
      setListError("Erreur réseau lors du chargement des vidéos.");
      setVideos([]);
      setQuizVideoIds(new Set());
      setCodeVideoIds(new Set());
    } finally {
      setListLoading(false);
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
      void loadVideos(next);
      const res = await fetch(
        `${SB}/rest/v1/profiles?id=eq.${encodeURIComponent(next.user.id)}&select=display_name,member_type`,
        {
          headers: {
            apikey: KEY,
            Authorization: `Bearer ${next.access_token}`,
            Accept: "application/json",
          },
        },
      );
      const json = (await res.json()) as unknown;
      if (!res.ok && (await checkJwtExpired({ status: res.status }))) {
        return;
      }
      if (!cancelled && res.ok && Array.isArray(json)) {
        setProfile((json[0] ?? null) as ProfileRow | null);
      } else if (!cancelled) {
        setProfile(null);
      }
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
  }, [router, loadVideos]);

  useEffect(() => {
    if (!session) return;
    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        void loadVideos(session);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [session, loadVideos]);

  function handleSignOut(): void {
    setSigningOut(true);

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

  if (!session) {
    return null;
  }

  const name = displayNameFrom(profile, session);

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
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .leve-videos-grid {
              display: grid;
              grid-template-columns: 1fr;
              gap: 1.1rem;
            }
            @media (min-width: 768px) {
              .leve-videos-grid {
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 1.25rem;
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span
            style={{
              fontSize: "0.9rem",
              opacity: 0.85,
              maxWidth: "42vw",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </span>
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

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "1.25rem" }}>
        <section
          style={{
            marginBottom: "1.75rem",
            paddingBottom: "1.25rem",
            borderBottom: "1px solid rgba(245, 240, 232, 0.08)",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "clamp(2.75rem, 10vw, 4.25rem)",
              letterSpacing: "0.14em",
              margin: 0,
              lineHeight: 1.05,
              color: TEXT,
            }}
          >
            VIDÉOS
          </h1>
          <p
            style={{
              margin: "0.65rem 0 0",
              fontSize: "1rem",
              opacity: 0.82,
              maxWidth: "36rem",
              lineHeight: 1.5,
            }}
          >
            Regarde, trouve le code secret, gagne des points
          </p>
        </section>

        {listError ? (
          <p style={{ color: ROUGE, fontSize: "0.95rem", marginBottom: "1rem" }}>{listError}</p>
        ) : null}

        {listLoading ? (
          <p style={{ opacity: 0.7 }}>Chargement des vidéos…</p>
        ) : videos.length === 0 ? (
          <p style={{ opacity: 0.75, fontSize: "1.05rem" }}>
            Aucune vidéo disponible pour le moment.
          </p>
        ) : (
          <div className="leve-videos-grid font-mono">
            {videos.map((v) => {
              const title = v.title?.trim() || "Vidéo";
              const pts = Number(v.points_value ?? 0);
              const ptsLabel = `${Number.isFinite(pts) ? pts : 0} pts`;
              const status = memberStatusForVideo(v.id, quizVideoIds, codeVideoIds);
              const statusStyle = STATUS_STYLES[status];

              return (
                <article
                  key={v.id}
                  style={{
                    borderRadius: "4px",
                    overflow: "hidden",
                    background: "#141414",
                    border: "1px solid rgba(245, 240, 232, 0.1)",
                    display: "flex",
                    flexDirection: "column",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                >
                  <VideoThumb youtubeId={v.youtube_id} title={title} />
                  <div style={{ padding: "1rem 1rem 1.1rem", flex: 1, display: "flex", flexDirection: "column" }}>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.4rem",
                        marginBottom: "0.65rem",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          fontFamily: "var(--font-mono), ui-monospace, monospace",
                          padding: "0.28rem 0.55rem",
                          borderRadius: "4px",
                          color: statusStyle.color,
                          background: statusStyle.bg,
                          border: `1px solid ${statusStyle.border}`,
                        }}
                      >
                        <span aria-hidden>{statusStyle.icon}</span>
                        {statusStyle.label}
                      </span>
                      <BonusBadge bonusExpireAt={v.bonus_expire_at} />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "0.65rem",
                        marginBottom: "0.85rem",
                      }}
                    >
                      <h2
                        style={{
                          margin: 0,
                          fontSize: "1.05rem",
                          fontWeight: 600,
                          lineHeight: 1.35,
                          color: TEXT,
                          flex: 1,
                        }}
                      >
                        {title}
                      </h2>
                      <span
                        title="Points disponibles pour cette vidéo"
                        style={{
                          flexShrink: 0,
                          background: "rgba(212, 160, 23, 0.15)",
                          color: GOLD,
                          border: `1px solid ${GOLD}`,
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          padding: "0.3rem 0.55rem",
                          borderRadius: "4px",
                        }}
                      >
                        {ptsLabel}
                      </span>
                    </div>
                    <Link
                      href={`/videos/${v.id}`}
                      style={{
                        marginTop: "auto",
                        display: "block",
                        textAlign: "center",
                        background: ROUGE,
                        color: TEXT,
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        padding: "0.65rem 1rem",
                        borderRadius: "4px",
                        textDecoration: "none",
                        border: `1px solid ${ROUGE}`,
                      }}
                    >
                      Voir & Soumettre
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
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
            maxWidth: "1100px",
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
                color: p.href === "/videos" ? GOLD : TEXT,
                opacity: p.href === "/videos" ? 1 : 0.75,
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

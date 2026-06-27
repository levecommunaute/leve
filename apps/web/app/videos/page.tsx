"use client";

export const dynamic = "force-dynamic";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { BonusBadge, isBonusActive } from "../../components/bonus-badge";
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
  description: string | null;
  points_value: number | null;
  bonus_expire_at: string | null;
  created_at: string | null;
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

function formatCodeInput(raw: string): string {
  const chars = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12);
  const parts: string[] = [];
  for (let i = 0; i < chars.length; i += 4) {
    parts.push(chars.slice(i, i + 4));
  }
  return parts.join("-");
}

function isCodeComplete(formatted: string): boolean {
  return formatted.replace(/-/g, "").length === 12;
}

function formatPublishedAgo(createdAt: string | null | undefined): string {
  if (!createdAt) return "";
  const ms = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) {
    const mins = Math.max(1, Math.floor(ms / 60_000));
    return mins <= 1 ? "Publié à l'instant" : `Publié il y a ${mins}min`;
  }
  if (hours < 24) return `Publié il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Publié il y a ${days}j`;
}

function formatBonusRemaining(bonusExpireAt: string | null | undefined): string {
  if (!bonusExpireAt) return "";
  const ms = new Date(bonusExpireAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h >= 1) return `${h}h restantes`;
  if (m >= 1) return `${m}min restantes`;
  return `${totalSec % 60}s restantes`;
}

function getAccessTokenFromCookies(): string {
  try {
    const allCookies = document.cookie.split(";");
    const parts: string[] = [];
    let i = 0;
    while (true) {
      const part = allCookies.find((c) =>
        c.trim().startsWith(`sb-lrolatbudvianeazliax-auth-token.${i}=`),
      );
      if (!part) break;
      parts.push(part.trim().split("=").slice(1).join("="));
      i++;
    }
    const combined = parts.join("").replace("base64-", "");
    const decoded = JSON.parse(atob(combined)) as { access_token?: string };
    return decoded?.access_token ?? "";
  } catch {
    return "";
  }
}

function pickHeroVideo(videos: VideoRow[]): { hero: VideoRow | null; rest: VideoRow[] } {
  const heroIndex = videos.findIndex((v) => isBonusActive(v.bonus_expire_at));
  if (heroIndex === -1) return { hero: null, rest: videos };
  const hero = videos[heroIndex]!;
  const rest = videos.filter((_, i) => i !== heroIndex);
  return { hero, rest };
}

function VideoThumb({
  youtubeId,
  title,
  borderRadius = "4px",
}: {
  youtubeId: string;
  title: string;
  borderRadius?: string;
}): JSX.Element {
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
        borderRadius,
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

function StatusBadge({ status }: { status: VideoMemberStatus }): JSX.Element {
  const statusStyle = STATUS_STYLES[status];
  return (
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
  );
}

function HeroBonusBadge({ bonusExpireAt }: { bonusExpireAt: string | null }): JSX.Element | null {
  const [visible, setVisible] = useState(() => isBonusActive(bonusExpireAt));
  const [remaining, setRemaining] = useState(() => formatBonusRemaining(bonusExpireAt));

  useEffect(() => {
    if (!bonusExpireAt) {
      setVisible(false);
      return;
    }
    const expireMs = new Date(bonusExpireAt).getTime();
    if (!Number.isFinite(expireMs)) {
      setVisible(false);
      return;
    }

    const tick = (): void => {
      const diff = expireMs - Date.now();
      if (diff <= 0) {
        setVisible(false);
        return;
      }
      setVisible(true);
      setRemaining(formatBonusRemaining(bonusExpireAt));
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [bonusExpireAt]);

  if (!visible) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        background: "rgba(212, 160, 23, 0.12)",
        color: GOLD,
        border: `1px solid ${GOLD}`,
        padding: "0.35rem 0.65rem",
        borderRadius: "4px",
        fontSize: "0.8rem",
        fontWeight: 700,
        letterSpacing: "0.04em",
      }}
    >
      ⚡ Bonus 72h · {remaining}
    </span>
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
  const [youtubeMode, setYoutubeMode] = useState(false);
  const [youtubeModeLoaded, setYoutubeModeLoaded] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [watchFirstYoutubeId, setWatchFirstYoutubeId] = useState<string | null>(null);
  const [matchedVideoId, setMatchedVideoId] = useState<string | null>(null);
  const [showQuizReadyModal, setShowQuizReadyModal] = useState(false);

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
          `${SB}/rest/v1/videos?select=id,youtube_id,title,description,points_value,bonus_expire_at,created_at&order=created_at.desc`,
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/feature-flags?nom=videos-mode-youtube", { cache: "no-store" });
        const j = (await r.json()) as { actif?: boolean };
        if (!cancelled) setYoutubeMode(Boolean(j.actif));
      } catch {
        if (!cancelled) setYoutubeMode(false);
      } finally {
        if (!cancelled) setYoutubeModeLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function handleCodeSubmit(): Promise<void> {
    if (!isCodeComplete(codeInput)) return;
    setCodeSubmitting(true);
    setCodeError(null);
    setWatchFirstYoutubeId(null);

    const token = getAccessTokenFromCookies();
    try {
      const res = await fetch("/api/code/valider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeInput, token }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        video_id?: string;
        youtube_id?: string;
      };

      if (
        data.message?.includes("Regarde d'abord la vidéo") &&
        typeof data.youtube_id === "string" &&
        data.youtube_id.length > 0
      ) {
        setWatchFirstYoutubeId(data.youtube_id);
      } else if (data.success && typeof data.video_id === "string") {
        setMatchedVideoId(data.video_id);
        setCodeVideoIds((prev) => new Set([...prev, data.video_id!]));
        setShowQuizReadyModal(true);
      } else {
        setCodeError(data.message || "Code incorrect");
      }
    } catch {
      setCodeError("Erreur réseau lors de la validation du code.");
    } finally {
      setCodeSubmitting(false);
    }
  }

  function startQuiz(): void {
    if (matchedVideoId) {
      router.push(`/videos/${matchedVideoId}/quiz`);
    }
  }

  const fonts = `${bebas.variable} ${dmSans.variable}`;

  if (session === undefined || !youtubeModeLoaded) {
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
  const { hero, rest } = pickHeroVideo(videos);

  function renderPlatformGrid(): JSX.Element {
    return (
      <div className="leve-videos-grid font-mono">
        {videos.map((v) => {
          const title = v.title?.trim() || "Vidéo";
          const pts = Number(v.points_value ?? 0);
          const ptsLabel = `${Number.isFinite(pts) ? pts : 0} pts`;
          const status = memberStatusForVideo(v.id, quizVideoIds, codeVideoIds);

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
                fontFamily: "var(--font-mono), ui-monospace, monospace",
              }}
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
                  <StatusBadge status={status} />
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
    );
  }

  function renderYoutubeListItem(v: VideoRow): JSX.Element {
    const title = v.title?.trim() || "Vidéo";
    const pts = Number(v.points_value ?? 0);
    const ptsLabel = `${Number.isFinite(pts) ? pts : 0} pts`;
    const status = memberStatusForVideo(v.id, quizVideoIds, codeVideoIds);

    return (
      <article
        key={v.id}
        style={{
          display: "flex",
          gap: "0.85rem",
          padding: "0.85rem 0",
          borderBottom: "1px solid rgba(245, 240, 232, 0.08)",
          fontFamily: "var(--font-mono), ui-monospace, monospace",
        }}
      >
        <div style={{ width: "168px", flexShrink: 0 }}>
          <VideoThumb youtubeId={v.youtube_id} title={title} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.4rem",
              marginBottom: "0.45rem",
            }}
          >
            <StatusBadge status={status} />
            <BonusBadge bonusExpireAt={v.bonus_expire_at} />
          </div>
          <h2
            style={{
              margin: "0 0 0.35rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              lineHeight: 1.35,
              color: TEXT,
            }}
          >
            {title}
          </h2>
          <p style={{ margin: 0, fontSize: "0.82rem", opacity: 0.65 }}>
            {formatPublishedAgo(v.created_at)} · {ptsLabel}
          </p>
          <a
            href={`https://www.youtube.com/watch?v=${v.youtube_id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              marginTop: "0.55rem",
              fontSize: "0.82rem",
              color: GOLD,
              textDecoration: "none",
            }}
          >
            ▶ Regarder la Vidéo
          </a>
        </div>
      </article>
    );
  }

  function renderYoutubeFeed(): JSX.Element {
    return (
      <div style={{ fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
        {hero ? (
          <article
            style={{
              marginBottom: "1.75rem",
              paddingBottom: "1.75rem",
              borderBottom: "1px solid rgba(245, 240, 232, 0.12)",
            }}
          >
            <div style={{ position: "relative", marginBottom: "1rem" }}>
              <VideoThumb youtubeId={hero.youtube_id} title={hero.title?.trim() || "Vidéo"} borderRadius="6px" />
              <div
                style={{
                  position: "absolute",
                  top: "0.75rem",
                  left: "0.75rem",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.45rem",
                }}
              >
                <HeroBonusBadge bonusExpireAt={hero.bonus_expire_at} />
              </div>
            </div>
            <h2
              style={{
                margin: "0 0 0.5rem",
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "clamp(1.75rem, 5vw, 2.5rem)",
                letterSpacing: "0.06em",
                lineHeight: 1.1,
              }}
            >
              {hero.title?.trim() || "Vidéo"}
            </h2>
            {hero.description?.trim() ? (
              <p
                style={{
                  margin: "0 0 0.75rem",
                  fontSize: "0.95rem",
                  opacity: 0.78,
                  lineHeight: 1.55,
                  maxWidth: "48rem",
                }}
              >
                {hero.description.trim()}
              </p>
            ) : null}
            <p style={{ margin: "0 0 1rem", fontSize: "0.88rem", opacity: 0.7 }}>
              {formatPublishedAgo(hero.created_at)} · {Number(hero.points_value ?? 0)} pts
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.75rem" }}>
              <StatusBadge
                status={memberStatusForVideo(hero.id, quizVideoIds, codeVideoIds)}
              />
            </div>
            <a
              href={`https://www.youtube.com/watch?v=${hero.youtube_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                background: ROUGE,
                color: TEXT,
                fontWeight: 700,
                fontSize: "0.95rem",
                padding: "0.7rem 1.25rem",
                borderRadius: "4px",
                textDecoration: "none",
                border: `1px solid ${ROUGE}`,
              }}
            >
              ▶ Regarder la Vidéo
            </a>
          </article>
        ) : null}
        <div>{rest.map((v) => renderYoutubeListItem(v))}</div>
      </div>
    );
  }

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

        <section
          style={{
            marginBottom: "1.75rem",
            padding: "1.1rem 1.15rem",
            borderRadius: "4px",
            background: "#141414",
            border: "1px solid rgba(245, 240, 232, 0.1)",
          }}
        >
          <h2
            style={{
              margin: "0 0 0.85rem",
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "1.35rem",
              letterSpacing: "0.1em",
              color: ROUGE,
            }}
          >
            SOUMETS TON CODE
          </h2>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              value={codeInput}
              onChange={(e) => {
                setCodeInput(formatCodeInput(e.target.value));
                if (codeError) setCodeError(null);
                if (watchFirstYoutubeId) setWatchFirstYoutubeId(null);
              }}
              placeholder="XXXX-YYYY-ZZZZ"
              disabled={codeSubmitting || showQuizReadyModal}
              style={{
                flex: "1 1 220px",
                minWidth: "220px",
                maxWidth: "320px",
                padding: "0.75rem 1rem",
                background: "#222",
                border: "1px solid rgba(245, 240, 232, 0.15)",
                color: TEXT,
                textAlign: "center",
                fontSize: "1.05rem",
                letterSpacing: "0.08em",
                fontFamily: "var(--font-mono), ui-monospace, monospace",
                borderRadius: "4px",
              }}
            />
            <button
              type="button"
              onClick={() => void handleCodeSubmit()}
              disabled={codeSubmitting || !isCodeComplete(codeInput) || showQuizReadyModal}
              style={{
                background: ROUGE,
                color: TEXT,
                border: `1px solid ${ROUGE}`,
                borderRadius: "4px",
                padding: "0.75rem 1.35rem",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: codeSubmitting ? "wait" : "pointer",
                opacity: codeSubmitting || !isCodeComplete(codeInput) ? 0.65 : 1,
              }}
            >
              {codeSubmitting ? "Validation…" : "VALIDER"}
            </button>
          </div>
          {watchFirstYoutubeId ? (
            <p style={{ margin: "0.85rem 0 0", color: GOLD, fontSize: "0.9rem", lineHeight: 1.5 }}>
              Regarde d&apos;abord la vidéo pour débloquer le code —{" "}
              <a
                href={`https://www.youtube.com/watch?v=${watchFirstYoutubeId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: GOLD, fontWeight: 600 }}
              >
                ▶ Regarder sur YouTube
              </a>
            </p>
          ) : codeError ? (
            <p style={{ margin: "0.85rem 0 0", color: ROUGE, fontSize: "0.9rem" }}>❌ {codeError}</p>
          ) : (
            <p style={{ margin: "0.75rem 0 0", fontSize: "0.82rem", opacity: 0.6, lineHeight: 1.45 }}>
              Le code est vérifié sur toutes les vidéos actives.
            </p>
          )}
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
        ) : youtubeMode ? (
          renderYoutubeFeed()
        ) : (
          renderPlatformGrid()
        )}
      </main>

      {showQuizReadyModal ? (
        <div
          role="presentation"
          onClick={() => setShowQuizReadyModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 1000,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="videos-quiz-ready-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "420px",
              background: "#111",
              border: "1px solid rgba(255,255,255,.1)",
              padding: "2rem",
              fontFamily: "var(--font-dm), system-ui, sans-serif",
            }}
          >
            <h2
              id="videos-quiz-ready-title"
              style={{
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "2rem",
                margin: "0 0 1rem",
                color: TEXT,
              }}
            >
              Prêt pour le quiz ?
            </h2>
            <p
              style={{
                margin: "0 0 2rem",
                opacity: 0.75,
                lineHeight: 1.5,
                fontFamily: "var(--font-mono), ui-monospace, monospace",
              }}
            >
              90 secondes · Sans pause · Sans reprise possible
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={startQuiz}
                style={{
                  background: ROUGE,
                  color: TEXT,
                  border: "none",
                  padding: "0.85rem 1.5rem",
                  cursor: "pointer",
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  fontSize: "1.1rem",
                  borderRadius: "4px",
                }}
              >
                Je suis prêt — Commencer
              </button>
              <button
                type="button"
                onClick={() => setShowQuizReadyModal(false)}
                style={{
                  background: "transparent",
                  color: TEXT,
                  border: "1px solid rgba(255,255,255,.2)",
                  padding: "0.75rem 1.5rem",
                  cursor: "pointer",
                  borderRadius: "4px",
                }}
              >
                Plus tard
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

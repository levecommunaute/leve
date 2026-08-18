"use client";

export const dynamic = "force-dynamic";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { BonusBadge, isBonusActive } from "../../components/bonus-badge";
import { AppBottomNav } from "../../components/app-bottom-nav";
import { AppHeader } from "../../components/app-header";
import { HeaderRight } from "../../components/header-right";
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
const ROUGE = "var(--accent-red)";
const GOLD = "var(--accent)";
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
  collaborateur_id: string | null;
  categorie?: string | null;
  tags?: string | null;
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
    color: "var(--accent-green)",
    border: "var(--accent-green)",
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
  avatar_url?: string | null;
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
}): React.JSX.Element {
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
        background: "var(--border-soft)",
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

function StatusBadge({ status }: { status: VideoMemberStatus }): React.JSX.Element {
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

function HeroBonusBadge({ bonusExpireAt }: { bonusExpireAt: string | null }): React.JSX.Element | null {
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

export default function VideosPage(): React.JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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
  const [alreadyCompletedMessage, setAlreadyCompletedMessage] = useState<string | null>(null);
  const [alreadyCompletedVideoId, setAlreadyCompletedVideoId] = useState<string | null>(null);
  const [watchFirstVideoId, setWatchFirstVideoId] = useState<string | null>(null);
  const [matchedVideoId, setMatchedVideoId] = useState<string | null>(null);
  const [showQuizReadyModal, setShowQuizReadyModal] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("leve-videos-view") as "grid" | "list") ?? "grid";
    }
    return "grid";
  });
  const [categories, setCategories] = useState<{nom:string, slug:string, is_gate:boolean}[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>("tous");

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
          `${SB}/rest/v1/videos?select=id,youtube_id,title,description,points_value,bonus_expire_at,created_at,collaborateur_id,categorie,tags&is_active=eq.true&order=created_at.desc`,
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
        const allVideos = Array.isArray(videosJson) ? (videosJson as VideoRow[]) : [];
        // Le collaborateur ne voit pas sa propre vidéo dans la liste.
        setVideos(allVideos.filter((v) => v.collaborateur_id !== uid));
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
      setDataLoaded(true);
    }
  }, []);

  const loadCategories = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(
        `${SB}/rest/v1/video_categories?select=nom,slug,is_gate&order=ordre.asc`,
        { headers: { apikey: KEY } }
      );
      if (res.ok) {
        const data = (await res.json()) as {nom:string, slug:string, is_gate:boolean}[];
        setCategories(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadCategories();

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
        `${SB}/rest/v1/profiles?id=eq.${encodeURIComponent(next.user.id)}&select=display_name,member_type,avatar_url`,
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
        const row = (json[0] ?? null) as ProfileRow | null;
        setProfile(row);
        const nextAvatar = typeof row?.avatar_url === "string" ? row.avatar_url : null;
        setAvatarUrl(nextAvatar);
      } else if (!cancelled) {
        setProfile(null);
        setAvatarUrl(null);
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
  }, [router, loadVideos, loadCategories]);

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
    setAlreadyCompletedMessage(null);
    setAlreadyCompletedVideoId(null);
    setWatchFirstVideoId(null);

    const token = getAccessTokenFromCookies();
    try {
      const res = await fetch("/api/code/valider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeInput, token }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        already_completed?: boolean;
        message?: string;
        video_id?: string;
        video_title?: string;
        youtube_id?: string;
      };

      if (data.already_completed) {
        const title = data.video_title?.trim() || "cette vidéo";
        setAlreadyCompletedMessage(`✅ Tu as déjà complété le quiz de '${title}'`);
        setAlreadyCompletedVideoId(
          typeof data.video_id === "string" && data.video_id.length > 0
            ? data.video_id
            : null
        );
      } else if (
        data.message?.includes("Regarde d'abord la vidéo") &&
        typeof data.video_id === "string" &&
        data.video_id.length > 0
      ) {
        setWatchFirstVideoId(data.video_id);
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

  function toggleViewMode(mode: "grid" | "list"): void {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("leve-videos-view", mode);
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
  const { hero, rest } = pickHeroVideo(videos);

  const leveVideos = [...videos.filter(v => v.categorie === 'leve')]
    .sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
  const leveCompleted = leveVideos.length === 0 || leveVideos.every(v => quizVideoIds.has(v.id));
  const leveProgress = leveVideos.length === 0 ? 1 : leveVideos.filter(v => quizVideoIds.has(v.id)).length;

  function isLeveUnlocked(index: number): boolean {
    if (index === 0) return true;
    return quizVideoIds.has(leveVideos[index - 1]?.id ?? "");
  }

  function statusOf(v: VideoRow): VideoMemberStatus {
    return memberStatusForVideo(v.id, quizVideoIds, codeVideoIds);
  }

  function filterByCat(vids: VideoRow[]): VideoRow[] {
    if (selectedCat === "tous") return vids;
    if (selectedCat === "leve") return vids.filter(v => v.categorie === "leve");
    return vids.filter(v => v.categorie === selectedCat);
  }

  function renderPlatformGrid(): React.JSX.Element {
    const filtered = filterByCat(videos);
    const bonusActif = filtered.filter(v => {
      const status = memberStatusForVideo(v.id, quizVideoIds, codeVideoIds);
      const bonus = v.bonus_expire_at ? new Date(v.bonus_expire_at) > new Date() : false;
      return status === 'not_completed' && bonus;
    });
    const disponibles = filtered.filter(v => {
      const status = memberStatusForVideo(v.id, quizVideoIds, codeVideoIds);
      const bonus = v.bonus_expire_at ? new Date(v.bonus_expire_at) > new Date() : false;
      return status === 'not_completed' && !bonus;
    });
    const codeSubmis = filtered.filter(v => {
      const status = memberStatusForVideo(v.id, quizVideoIds, codeVideoIds);
      return status === 'code_submitted';
    });
    const completes = filtered.filter(v => {
      const status = memberStatusForVideo(v.id, quizVideoIds, codeVideoIds);
      return status === 'completed';
    });

    const sectionHdr = (dot: string, label: string, count: number) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', marginTop: '0.75rem' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.5 }}>
          {label}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', opacity: 0.25, marginLeft: 'auto' }}>
          {count} vidéo{count > 1 ? 's' : ''}
        </span>
      </div>
    );

    const renderGridItem = (v: VideoRow, variant: 'bonus' | 'urgent' | 'normal' | 'done' | 'quiz') => {
      const borderColor = variant === 'bonus' ? 'var(--accent-green)' : variant === 'urgent' ? 'var(--accent-red)' : variant === 'quiz' ? 'var(--accent)' : variant === 'done' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.08)';
      const pts = v.points_value ?? 0;
      const thumbUrl = `https://img.youtube.com/vi/${v.youtube_id}/mqdefault.jpg`;
      const expiresSoon = v.bonus_expire_at ? (new Date(v.bonus_expire_at).getTime() - Date.now()) < 1000 * 60 * 60 * 6 : false;

      return (
        <div key={v.id} style={{ background: 'var(--bg-card)', borderLeft: `3px solid ${borderColor}`, display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1px', opacity: variant === 'done' ? 0.5 : 1, overflow: 'hidden' }}>
          {/* Thumbnail gauche */}
          <div style={{ width: '120px', minWidth: '120px', height: '68px', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
            <img
              src={thumbUrl}
              alt={v.title ?? ''}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: variant === 'done' ? 'grayscale(0.5)' : 'none' }}
            />
            {variant === 'bonus' || variant === 'urgent' ? (
              <div style={{ position: 'absolute', bottom: '3px', right: '4px', background: 'var(--bg-card-inner)', fontFamily: 'var(--font-mono)', fontSize: '0.44rem', color: 'var(--accent)', padding: '0.1rem 0.3rem', border: '1px solid rgba(212,160,23,0.3)' }}>
                +{variant === 'bonus' ? pts * 2 : pts} PTS
              </div>
            ) : null}
          </div>
          {/* Info droite */}
          <div style={{ flex: 1, minWidth: 0, padding: '0.55rem 0.75rem 0.55rem 0' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 500, marginBottom: '0.2rem', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.title}
            </div>
            {v.tags ? (
              <p style={{ margin: "2px 0 0", fontSize: "0.68rem",
                opacity: 0.5, letterSpacing: "0.02em" }}>
                {v.tags}
              </p>
            ) : null}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', opacity: 0.3, letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
              {formatPublishedAgo(v.created_at)}
            </div>
            {variant === 'bonus' && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: 'var(--accent-green)' }}>
                ⚡ +{pts * 2} pts avec ×2 {profile?.member_type ?? ''}
              </div>
            )}
            {variant === 'urgent' && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: 'var(--accent-red)' }}>
                ⚡ Bonus expire bientôt !
              </div>
            )}
            {variant === 'quiz' && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: 'var(--accent)' }}>
                ⚡ Code trouvé · Lance le quiz pour gagner tes points
              </div>
            )}
          </div>
          {/* Bouton droite */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0.55rem 0.85rem 0.55rem 0', flexShrink: 0 }}>
            {variant === 'quiz' ? (
              <a href={`/videos/${v.id}/quiz`}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.28rem 0.65rem', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                FAIRE LE QUIZ →
              </a>
            ) : variant !== 'done' ? (
              <a href={`/videos/${v.id}`}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.28rem 0.65rem', background: variant === 'bonus' || variant === 'urgent' ? 'var(--accent-red)' : 'transparent', border: variant === 'normal' ? '1px solid rgba(255,255,255,0.15)' : 'none', color: 'var(--text)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                {variant === 'urgent' ? 'URGENT →' : 'VOIR →'}
              </a>
            ) : (
              <>
                <a href={`/videos/${v.id}`}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.28rem 0.65rem', background: 'transparent', border: '1px solid rgba(46,204,113,0.2)', color: 'var(--accent-green)', textDecoration: 'none' }}>
                  REVOIR ✓
                </a>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.44rem', color: 'rgba(46,204,113,0.7)', marginTop: '0.2rem', textAlign: 'right' }}>
                  Revoir pour bonus
                </div>
              </>
            )}
          </div>
        </div>
      );
    };

    return (
      <div>
        {bonusActif.length > 0 && (
          <>
            {sectionHdr('var(--accent-green)', 'Points +2 — Moins de 72h', bonusActif.length)}
            {bonusActif.map(v => {
              const expiresSoon = v.bonus_expire_at ? (new Date(v.bonus_expire_at).getTime() - Date.now()) < 1000 * 60 * 60 * 6 : false;
              return renderGridItem(v, expiresSoon ? 'urgent' : 'bonus');
            })}
          </>
        )}
        {disponibles.length > 0 && (
          <>
            {sectionHdr('rgba(255,255,255,0.2)', 'Points disponibles — Bonus expiré', disponibles.length)}
            {disponibles.map(v => renderGridItem(v, 'normal'))}
          </>
        )}
        {codeSubmis.length > 0 && (
          <>
            {sectionHdr('var(--accent)', '🔒 Code soumis — Quiz en attente', codeSubmis.length)}
            {codeSubmis.map(v => renderGridItem(v, 'quiz'))}
          </>
        )}
        {completes.length > 0 && (
          <>
            {sectionHdr('var(--accent-green)', '✅ Vidéos complétées', completes.length)}
            {completes.map(v => renderGridItem(v, 'done'))}
          </>
        )}
      </div>
    );
  }

  function renderListView(): React.JSX.Element {
    const filtered = filterByCat(videos);
    const bonusActif = filtered.filter((v) => {
      const status = memberStatusForVideo(v.id, quizVideoIds, codeVideoIds);
      const bonus = v.bonus_expire_at ? new Date(v.bonus_expire_at) > new Date() : false;
      return status === "not_completed" && bonus;
    });
    const disponibles = filtered.filter((v) => {
      const status = memberStatusForVideo(v.id, quizVideoIds, codeVideoIds);
      const bonus = v.bonus_expire_at ? new Date(v.bonus_expire_at) > new Date() : false;
      return status === "not_completed" && !bonus;
    });
    const codeSubmis = filtered.filter((v) => {
      const status = memberStatusForVideo(v.id, quizVideoIds, codeVideoIds);
      return status === "code_submitted";
    });
    const completes = filtered.filter((v) => {
      const status = memberStatusForVideo(v.id, quizVideoIds, codeVideoIds);
      return status === "completed";
    });

    const sectionHdr = (dot: string, label: string, count: number) => (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0",
          marginTop: "0.75rem",
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dot,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.5rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            opacity: 0.5,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.46rem",
            opacity: 0.25,
            marginLeft: "auto",
          }}
        >
          {count} vidéo{count > 1 ? "s" : ""}
        </span>
      </div>
    );

    const renderItem = (v: VideoRow, variant: "bonus" | "urgent" | "normal" | "done" | "quiz") => {
      const borderColor =
        variant === "bonus"
          ? "var(--accent-green)"
          : variant === "urgent"
            ? "var(--accent-red)"
            : variant === "quiz"
              ? "var(--accent)"
              : variant === "done"
                ? "rgba(255,255,255,0.06)"
                : "rgba(255,255,255,0.08)";
      const pts = v.points_value ?? 0;
      const expiresSoon = v.bonus_expire_at
        ? new Date(v.bonus_expire_at).getTime() - Date.now() < 1000 * 60 * 60 * 6
        : false;
      return (
        <div
          key={v.id}
          style={{
            background: "var(--bg-card)",
            borderLeft: `3px solid ${borderColor}`,
            padding: "0.75rem 1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "1px",
            opacity: variant === "done" ? 0.5 : 1,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "0.78rem",
                fontWeight: 500,
                marginBottom: "0.2rem",
                lineHeight: 1.35,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {v.title}
            </div>
            {v.tags ? (
              <p style={{ margin: "2px 0 0", fontSize: "0.68rem",
                opacity: 0.5, letterSpacing: "0.02em" }}>
                {v.tags}
              </p>
            ) : null}
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.5rem",
                opacity: 0.3,
                letterSpacing: "0.06em",
              }}
            >
              {formatPublishedAgo(v.created_at)}
            </div>
            {variant === "bonus" && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.48rem",
                  color: "var(--accent-green)",
                  marginTop: "0.15rem",
                }}
              >
                ⚡ +{pts * 2} pts avec ×2 {profile?.member_type ?? ""}
              </div>
            )}
            {(variant === "urgent") && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.48rem",
                  color: "var(--accent-red)",
                  marginTop: "0.15rem",
                }}
              >
                ⚡ Bonus expire bientôt !
              </div>
            )}
            {variant === "quiz" && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.48rem",
                  color: "var(--accent)",
                  marginTop: "0.15rem",
                }}
              >
                ⚡ Code trouvé · Lance le quiz pour gagner tes points
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "0.3rem",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6rem",
                color: variant === "done" ? "rgba(255,255,255,0.25)" : "var(--accent)",
                fontWeight: 600,
              }}
            >
              {variant === "done"
                ? `✓ +${pts} pts`
                : `+${variant === "bonus" ? pts * 2 : pts} PTS`}
            </span>
            {variant === "quiz" ? (
              <a
                href={`/videos/${v.id}/quiz`}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.48rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "0.28rem 0.65rem",
                  background: "transparent",
                  border: "1px solid var(--accent)",
                  color: "var(--accent)",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                FAIRE LE QUIZ →
              </a>
            ) : variant !== "done" ? (
              <a
                href={`/videos/${v.id}`}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.48rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "0.28rem 0.65rem",
                  background:
                    variant === "bonus" || variant === "urgent" ? "var(--accent-red)" : "transparent",
                  border:
                    variant === "normal" ? "1px solid rgba(255,255,255,0.15)" : "none",
                  color: "var(--text)",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {variant === "urgent" ? "URGENT →" : "VOIR LA VIDÉO →"}
              </a>
            ) : (
              <>
                <a
                  href={`/videos/${v.id}`}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.48rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    padding: "0.28rem 0.65rem",
                    background: "transparent",
                    border: "1px solid rgba(46,204,113,0.2)",
                    color: "var(--accent-green)",
                    textDecoration: "none",
                  }}
                >
                  REVOIR ✓
                </a>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.44rem",
                    color: "rgba(46,204,113,0.7)",
                    marginTop: "0.2rem",
                    textAlign: "right",
                  }}
                >
                  Revoir pour bonus
                </div>
              </>
            )}
          </div>
        </div>
      );
    };

    return (
      <div>
        {bonusActif.length > 0 && (
          <>
            {sectionHdr("var(--accent-green)", "Points +2 — Moins de 72h", bonusActif.length)}
            {bonusActif.map((v) => {
              const expiresSoon = v.bonus_expire_at
                ? new Date(v.bonus_expire_at).getTime() - Date.now() < 1000 * 60 * 60 * 6
                : false;
              return renderItem(v, expiresSoon ? "urgent" : "bonus");
            })}
          </>
        )}
        {disponibles.length > 0 && (
          <>
            {sectionHdr(
              "rgba(255,255,255,0.2)",
              "Points disponibles — Bonus expiré",
              disponibles.length,
            )}
            {disponibles.map((v) => renderItem(v, "normal"))}
          </>
        )}
        {codeSubmis.length > 0 && (
          <>
            {sectionHdr("var(--accent)", "🔒 Code soumis — Quiz en attente", codeSubmis.length)}
            {codeSubmis.map((v) => renderItem(v, "quiz"))}
          </>
        )}
        {completes.length > 0 && (
          <>
            {sectionHdr("var(--accent-green)", "✅ Vidéos complétées", completes.length)}
            {completes.map((v) => renderItem(v, "done"))}
          </>
        )}
      </div>
    );
  }

  function renderYoutubeListItem(v: VideoRow): React.JSX.Element {
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
          borderBottom: "1px solid var(--border-soft)",
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

  function renderYoutubeFeed(): React.JSX.Element {
    return (
      <div style={{ fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
        {hero ? (
          <article
            style={{
              marginBottom: "1.75rem",
              paddingBottom: "1.75rem",
              borderBottom: "1px solid var(--border-soft)",
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
      className={`${fonts} leve-page-videos`}
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

      <AppHeader displayName={name} onSignOut={() => void handleSignOut()} signingOut={signingOut} rightExtra={<HeaderRight displayName={name} avatarUrl={avatarUrl} />} />

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "1.25rem" }}>
        <section
          className="leve-hero"
          style={{
            marginBottom: "1.75rem",
            paddingBottom: "1.25rem",
            borderBottom: "1px solid var(--border-soft)",
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
            background: "var(--bg-card)",
            border: "1px solid var(--border-soft)",
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
                if (alreadyCompletedMessage) setAlreadyCompletedMessage(null);
                if (alreadyCompletedVideoId) setAlreadyCompletedVideoId(null);
                if (watchFirstVideoId) setWatchFirstVideoId(null);
              }}
              placeholder="XXXX-YYYY-ZZZZ"
              disabled={codeSubmitting || showQuizReadyModal}
              style={{
                flex: "1 1 220px",
                minWidth: "220px",
                maxWidth: "320px",
                padding: "0.75rem 1rem",
                background: "var(--bg-card-inner)",
                border: "1px solid var(--border-strong)",
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
          {watchFirstVideoId ? (
            <p style={{ margin: "0.85rem 0 0", color: GOLD, fontSize: "0.9rem", lineHeight: 1.5 }}>
              Regarde d&apos;abord la vidéo pour débloquer le code —{" "}
              <a
                href={`/videos/${watchFirstVideoId}`}
                style={{ color: GOLD, fontWeight: 600 }}
              >
                Regarder la vidéo →
              </a>
            </p>
          ) : alreadyCompletedMessage ? (
            <p style={{ margin: "0.85rem 0 0", color: "var(--accent-green)", fontSize: "0.9rem", lineHeight: 1.5 }}>
              {alreadyCompletedMessage}
              {alreadyCompletedVideoId && (
                <>
                  <br />
                  <a
                    href={`/videos/${alreadyCompletedVideoId}`}
                    style={{
                      display: "inline-block",
                      marginTop: "0.4rem",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.52rem",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      padding: "0.28rem 0.65rem",
                      background: "transparent",
                      border: "1px solid rgba(46,204,113,0.3)",
                      color: "var(--accent-green)",
                      textDecoration: "none",
                    }}
                  >
                    Revoir la vidéo pour bonus →
                  </a>
                </>
              )}
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
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "2px",
                marginBottom: "0.75rem",
              }}
            >
              <button
                type="button"
                onClick={() => toggleViewMode("grid")}
                aria-label="Vue grille"
                aria-pressed={viewMode === "grid"}
                style={{
                  background: viewMode === "grid" ? "var(--border-soft)" : "transparent",
                  border: "1px solid var(--border-strong)",
                  color: viewMode === "grid" ? TEXT : "var(--text-40)",
                  padding: "0.4rem 0.55rem",
                  cursor: "pointer",
                  borderRadius: "2px 0 0 2px",
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
                  <rect x="0" y="0" width="6" height="6" rx="0.5" />
                  <rect x="8" y="0" width="6" height="6" rx="0.5" />
                  <rect x="0" y="8" width="6" height="6" rx="0.5" />
                  <rect x="8" y="8" width="6" height="6" rx="0.5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => toggleViewMode("list")}
                aria-label="Vue liste"
                aria-pressed={viewMode === "list"}
                style={{
                  background: viewMode === "list" ? "var(--border-soft)" : "transparent",
                  border: "1px solid var(--border-strong)",
                  color: viewMode === "list" ? TEXT : "var(--text-40)",
                  padding: "0.4rem 0.55rem",
                  cursor: "pointer",
                  borderRadius: "0 2px 2px 0",
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
                  <rect x="0" y="1" width="14" height="2" rx="0.5" />
                  <rect x="0" y="6" width="14" height="2" rx="0.5" />
                  <rect x="0" y="11" width="14" height="2" rx="0.5" />
                </svg>
              </button>
            </div>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: "0.4rem",
              margin: "0.75rem 0",
            }}>
              <button
                type="button"
                onClick={() => setSelectedCat("tous")}
                style={{
                  fontSize: "0.72rem", padding: "4px 12px", borderRadius: "20px",
                  border: selectedCat === "tous"
                    ? "1px solid rgba(212,160,23,0.6)"
                    : "1px solid rgba(245,240,232,0.12)",
                  background: selectedCat === "tous"
                    ? "rgba(212,160,23,0.12)"
                    : "rgba(245,240,232,0.04)",
                  color: selectedCat === "tous" ? "var(--accent)" : "rgba(245,240,232,0.55)",
                  cursor: "pointer",
                }}
              >
                Tous
              </button>
              {categories.map((c) => {
                const isLocked = !leveCompleted && !c.is_gate;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => { if (!isLocked) setSelectedCat(c.slug); }}
                    disabled={isLocked}
                    style={{
                      fontSize: "0.72rem", padding: "4px 12px", borderRadius: "20px",
                      border: isLocked
                        ? "1px solid rgba(245,240,232,0.08)"
                        : selectedCat === c.slug
                          ? "1px solid rgba(212,160,23,0.6)"
                          : "1px solid rgba(245,240,232,0.12)",
                      background: isLocked
                        ? "rgba(245,240,232,0.02)"
                        : selectedCat === c.slug
                          ? "rgba(212,160,23,0.12)"
                          : c.is_gate ? "rgba(74,144,217,0.08)" : "rgba(245,240,232,0.04)",
                      color: isLocked
                        ? "rgba(245,240,232,0.2)"
                        : selectedCat === c.slug
                          ? "var(--accent)"
                          : c.is_gate ? "rgba(74,144,217,0.9)" : "rgba(245,240,232,0.55)",
                      cursor: isLocked ? "not-allowed" : "pointer",
                      opacity: isLocked ? 0.5 : 1,
                    }}
                  >
                    {c.is_gate ? "🚀 " : ""}{c.nom}
                  </button>
                );
              })}
            </div>

            {!leveCompleted && leveVideos.length > 0 && (
              <section style={{
                background: "rgba(74,144,217,0.08)",
                border: "1.5px solid rgba(74,144,217,0.35)",
                borderRadius: "8px", padding: "1.1rem",
                marginBottom: "1rem",
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"0.4rem" }}>
                  <span style={{ fontSize:"1rem" }}>🚀</span>
                  <p style={{ margin:0, fontFamily:"var(--font-bebas)", fontSize:"1rem",
                    letterSpacing:"0.08em", color:"rgba(74,144,217,0.9)" }}>
                    LEVE — Commence ici
                  </p>
                  <span style={{
                    marginLeft:"auto", fontSize:"0.68rem", padding:"2px 8px",
                    borderRadius:"20px", background:"rgba(212,160,23,0.1)",
                    border:"1px solid rgba(212,160,23,0.3)", color:"var(--accent)",
                  }}>
                    🔒 {leveVideos.length - leveProgress} restante{leveVideos.length - leveProgress > 1 ? "s" : ""}
                  </span>
                </div>
                <p style={{ margin:"0 0 0.75rem", fontSize:"0.8rem", opacity:0.65, lineHeight:1.5 }}>
                  Regarde ces vidéos pour déverrouiller toute la plateforme.
                  Chaque nouvelle vidéo LEVE apparaît ici en priorité.
                </p>
                {leveVideos.map((v, index) => {
                  const done = quizVideoIds.has(v.id);
                  const codeSubmitted = codeVideoIds.has(v.id);
                  const unlocked = isLeveUnlocked(index);
                  return (
                    <div key={v.id} style={{
                      display:"flex", alignItems:"center", gap:"10px",
                      padding:"0.5rem 0.7rem",
                      background: done
                        ? "rgba(245,240,232,0.03)"
                        : unlocked
                          ? "rgba(74,144,217,0.06)"
                          : "rgba(245,240,232,0.02)",
                      borderRadius:"6px", marginBottom:"4px",
                      opacity: done ? 0.5 : 1,
                    }}>
                      <span style={{ fontSize:"0.9rem", flexShrink:0 }}>
                        {done ? "✅" : codeSubmitted ? "🔒" : unlocked ? "▶" : "🔒"}
                      </span>
                      <span style={{
                        flex:1, fontSize:"0.85rem", fontWeight:500,
                        color: unlocked ? "var(--text)" : "rgba(245,240,232,0.4)",
                      }}>
                        {v.title}
                      </span>
                      <span style={{ fontSize:"0.72rem", opacity:0.55 }}>
                        +{v.points_value} pts
                      </span>
                      {done ? (
                        <Link href={`/videos/${v.id}`} style={{
                          fontSize:"0.72rem", padding:"2px 10px", borderRadius:"4px",
                          border:"1px solid rgba(245,240,232,0.15)",
                          color:"rgba(245,240,232,0.4)", textDecoration:"none",
                        }}>REVOIR</Link>
                      ) : codeSubmitted ? (
                        <Link href={`/videos/${v.id}/quiz`} style={{
                          fontSize:"0.72rem", padding:"2px 10px", borderRadius:"4px",
                          background:"var(--accent)", color:"#000",
                          border:"none", textDecoration:"none", fontWeight:600,
                        }}>QUIZ →</Link>
                      ) : unlocked ? (
                        <Link href={`/videos/${v.id}`} style={{
                          fontSize:"0.72rem", padding:"2px 10px", borderRadius:"4px",
                          background:"rgba(74,144,217,0.15)",
                          border:"1px solid rgba(74,144,217,0.4)",
                          color:"rgba(74,144,217,0.9)", textDecoration:"none",
                        }}>VOIR →</Link>
                      ) : (
                        <span style={{
                          fontSize:"0.72rem", padding:"2px 10px", borderRadius:"4px",
                          border:"1px solid rgba(245,240,232,0.1)",
                          color:"rgba(245,240,232,0.25)",
                        }}>🔒</span>
                      )}
                    </div>
                  );
                })}
                <div style={{ height:4, borderRadius:2,
                  background:"rgba(74,144,217,0.15)", overflow:"hidden", marginTop:"0.75rem" }}>
                  <div style={{
                    height:"100%", borderRadius:2, background:"rgba(74,144,217,0.7)",
                    width:`${Math.round((leveProgress / leveVideos.length) * 100)}%`,
                    transition:"width 0.35s ease",
                  }} />
                </div>
                <p style={{ margin:"4px 0 0", fontSize:"0.68rem", opacity:0.5 }}>
                  {leveProgress} / {leveVideos.length} vidéos LEVE vues
                </p>
              </section>
            )}
            {!leveCompleted && (
              <div style={{ marginTop:"0.5rem" }}>
                {[
                  { label:"⚡ Points +2 — Moins de 72h", count: videos.filter(v => v.categorie !== 'leve' && statusOf(v) === 'not_completed' && isBonusActive(v.bonus_expire_at)).length },
                  { label:"Points disponibles — Bonus expiré", count: videos.filter(v => v.categorie !== 'leve' && statusOf(v) === 'not_completed' && !isBonusActive(v.bonus_expire_at)).length },
                  { label:"Code soumis — Quiz en attente", count: videos.filter(v => v.categorie !== 'leve' && statusOf(v) === 'code_submitted').length },
                  { label:"Vidéos complétées", count: videos.filter(v => v.categorie !== 'leve' && statusOf(v) === 'completed').length },
                ].filter(s => s.count > 0).map(s => (
                  <div key={s.label} style={{ marginBottom:"0.5rem" }}>
                    <div style={{
                      display:"flex", alignItems:"center", gap:"8px",
                      padding:"0.5rem 0", opacity:0.5,
                    }}>
                      <div style={{ width:8, height:8, borderRadius:"50%",
                        background:"rgba(245,240,232,0.3)", flexShrink:0 }} />
                      <span style={{ fontSize:"0.78rem", color:"var(--text)", fontWeight:500 }}>
                        {s.label}
                      </span>
                      <span style={{ marginLeft:"auto", fontSize:"0.72rem",
                        color:"rgba(245,240,232,0.5)",
                        display:"flex", alignItems:"center", gap:"4px" }}>
                        🔒 {s.count}
                      </span>
                    </div>
                    <div style={{
                      display:"flex", alignItems:"center", gap:"8px",
                      padding:"0.55rem 0.85rem",
                      background:"rgba(245,240,232,0.02)",
                      border:"0.5px solid rgba(245,240,232,0.08)",
                      borderRadius:"6px", opacity:0.45,
                    }}>
                      <span style={{ fontSize:"0.72rem" }}>🔒</span>
                      <span style={{ fontSize:"0.78rem", color:"rgba(245,240,232,0.5)" }}>
                        Termine les vidéos LEVE pour déverrouiller
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {viewMode === "list"
              ? (leveCompleted ? renderListView() : null)
              : youtubeMode
                ? renderYoutubeFeed()
                : (leveCompleted ? renderPlatformGrid() : null)}
          </>
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
              background: "var(--bg-card)",
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

      <AppBottomNav session={session} memberType={profile?.member_type} />
    </div>
  );
}

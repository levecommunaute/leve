"use client";

import { createBrowserClient } from "@repo/supabase/browser";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BonusBadge } from "../../../components/bonus-badge";
import { checkJwtExpired } from "../../../lib/supabase";

const WATCH_THRESHOLD = 60;
const PROGRESS_CHECK_MS = 2000;
const SAVE_PROGRESS_MS = 10000;
const SEEK_TOLERANCE_SEC = 5;

interface Video {
  id: string;
  youtube_id: string;
  title: string;
  points_value: number;
  bonus_expire_at: string | null;
}

interface VideoProgressRow {
  max_progress: number;
  unlocked: boolean;
}

interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  destroy(): void;
}

const YT_STATE_PLAYING = 1;
const CONTROLS_HIDE_MS = 3000;

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string | HTMLElement,
        config: {
          videoId: string;
          events?: {
            onReady?: (event: { target: YTPlayer }) => void;
            onStateChange?: (event: { data: number; target: YTPlayer }) => void;
          };
          playerVars?: Record<string, number | string>;
        },
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();

  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };

    if (window.YT?.Player) {
      resolve();
      return;
    }

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }
  });
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

function codeInputStyle(disabled: boolean): React.CSSProperties {
  return {
    flex: "1 1 220px",
    minWidth: "220px",
    maxWidth: "320px",
    padding: ".75rem 1rem",
    background: disabled ? "#1a1a1a" : "#222",
    border: "1px solid #333",
    color: disabled ? "rgba(245,240,232,0.45)" : "#F5F0E8",
    textAlign: "center",
    fontSize: "1.1rem",
    letterSpacing: "0.08em",
    fontFamily: "var(--font-mono), ui-monospace, monospace",
    cursor: disabled ? "not-allowed" : "text",
  };
}

const pageShell: React.CSSProperties = {
  background: "#080808",
  minHeight: "100vh",
  color: "#F5F0E8",
  fontFamily: "DM Sans,sans-serif",
};

export default function VideoPage(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();
  const rawId = params.id;
  const id = (Array.isArray(rawId) ? rawId[0] : rawId) ?? "";

  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [verification60Enabled, setVerification60Enabled] = useState<boolean>(false);
  const [flagLoaded, setFlagLoaded] = useState<boolean>(false);
  const [userId, setUserId] = useState<string>("");
  const [progressLoaded, setProgressLoaded] = useState<boolean>(false);
  const [codeUnlocked, setCodeUnlocked] = useState<boolean>(false);
  const [codeInput, setCodeInput] = useState<string>("");
  const [codeValidated, setCodeValidated] = useState<boolean>(false);
  const [showQuizReadyModal, setShowQuizReadyModal] = useState<boolean>(false);
  const [result, setResult] = useState<{
    success: boolean;
    message?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const videoShellRef = useRef<HTMLDivElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const controlsHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxProgressRef = useRef<number>(0);
  const lastKnownPositionRef = useRef<number>(0);
  const unlockedRef = useRef<boolean>(false);
  const userIdRef = useRef<string>("");
  const videoIdRef = useRef<string>("");

  const saveProgress = useCallback(async (): Promise<void> => {
    const membreId = userIdRef.current;
    const videoId = videoIdRef.current;
    if (!membreId || !videoId) return;

    const maxProgress = maxProgressRef.current;
    const unlocked = unlockedRef.current || maxProgress >= WATCH_THRESHOLD;

    const supabase = createBrowserClient();
    const { error } = await supabase.from("video_progress").upsert(
      {
        membre_id: membreId,
        video_id: videoId,
        max_progress: Math.round(maxProgress * 100) / 100,
        unlocked,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "membre_id,video_id" },
    );

    if (error) {
      if (await checkJwtExpired({ message: error.message })) return;
      console.error("video_progress upsert:", error.message);
    }
  }, []);

  const markUnlocked = useCallback((): void => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    setCodeUnlocked(true);
    void saveProgress();
  }, [saveProgress]);

  const showControls = useCallback((): void => {
    setControlsVisible(true);
    if (controlsHideTimeoutRef.current) {
      clearTimeout(controlsHideTimeoutRef.current);
    }
    controlsHideTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
  }, []);

  const handleRewind = useCallback((): void => {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(Math.max(0, player.getCurrentTime() - 10), true);
    showControls();
  }, [showControls]);

  const handlePlayPause = useCallback((): void => {
    const player = playerRef.current;
    if (!player) return;
    if (player.getPlayerState() === YT_STATE_PLAYING) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
    showControls();
  }, [showControls]);

  const handleFullscreen = useCallback((): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      const container = videoShellRef.current;
      if (!container?.requestFullscreen) return;
      void container.requestFullscreen();
    }
    showControls();
  }, [showControls]);

  const trackLinearProgress = useCallback((): void => {
    const player = playerRef.current;
    if (!player) return;

    const duration = player.getDuration();
    if (!duration || duration <= 0) return;

    const currentTime = player.getCurrentTime();
    const currentPct = (currentTime / duration) * 100;
    const timeDiff = currentTime - lastKnownPositionRef.current;

    lastKnownPositionRef.current = currentTime;

    if (timeDiff > SEEK_TOLERANCE_SEC) {
      return;
    }

    if (timeDiff >= 0 && currentPct > maxProgressRef.current) {
      maxProgressRef.current = currentPct;
    }

    if (maxProgressRef.current >= WATCH_THRESHOLD) {
      markUnlocked();
    }
  }, [markUnlocked]);

  useEffect(() => {
    const onFullscreenChange = (): void => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    onFullscreenChange();
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    videoIdRef.current = id;
  }, [id]);

  useEffect(() => {
    void (async () => {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user?.id) setUserId(session.user.id);
    })();
  }, []);

  useEffect(() => {
    if (!id) {
      setVideo(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from("videos")
        .select("id, youtube_id, title, points_value, bonus_expire_at")
        .eq("id", id)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        if (await checkJwtExpired({ message: error.message })) return;
        console.error("video load:", error.message);
        setVideo(null);
      } else {
        setVideo(data);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/feature-flags?nom=verification-60-pct", { cache: "no-store" });
        const j = (await r.json()) as { actif?: boolean };
        if (cancelled) return;
        setVerification60Enabled(Boolean(j.actif));
      } catch {
        if (!cancelled) setVerification60Enabled(false);
      } finally {
        if (!cancelled) setFlagLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!flagLoaded) return;
    if (!verification60Enabled) {
      unlockedRef.current = true;
      setCodeUnlocked(true);
      setProgressLoaded(true);
    }
  }, [flagLoaded, verification60Enabled]);

  useEffect(() => {
    if (!flagLoaded || !verification60Enabled || !id) return;

    if (!userId) {
      setProgressLoaded(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from("video_progress")
        .select("max_progress, unlocked")
        .eq("membre_id", userId)
        .eq("video_id", id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        if (await checkJwtExpired({ message: error.message })) return;
        console.error("video_progress load:", error.message);
      } else if (data) {
        const row = data as VideoProgressRow;
        const savedMax = Number(row.max_progress) || 0;
        maxProgressRef.current = savedMax;

        if (row.unlocked || savedMax >= WATCH_THRESHOLD) {
          unlockedRef.current = true;
          setCodeUnlocked(true);
        }
      }

      setProgressLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [flagLoaded, verification60Enabled, id, userId]);

  useEffect(() => {
    if (!flagLoaded || !verification60Enabled || !video?.youtube_id || !progressLoaded) return;

    let cancelled = false;

    void (async () => {
      await loadYouTubeIframeApi();
      if (cancelled || !playerContainerRef.current || !window.YT?.Player) return;

      const player = new window.YT.Player(playerContainerRef.current, {
        videoId: video.youtube_id,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          disablekb: 1,
          controls: 0,
          loop: 1,
          playlist: video.youtube_id,
        },
        events: {
          onReady: (event) => {
            const duration = event.target.getDuration();
            if (duration && duration > 0) {
              lastKnownPositionRef.current = event.target.getCurrentTime();
            }
            setIsPlaying(event.target.getPlayerState() === YT_STATE_PLAYING);
            showControls();
          },
          onStateChange: (event) => {
            setIsPlaying(event.data === YT_STATE_PLAYING);
          },
        },
      });

      playerRef.current = player;

      progressIntervalRef.current = setInterval(() => {
        trackLinearProgress();
      }, PROGRESS_CHECK_MS);

      saveIntervalRef.current = setInterval(() => {
        void saveProgress();
      }, SAVE_PROGRESS_MS);
    })();

    return () => {
      cancelled = true;
      void saveProgress();
      if (controlsHideTimeoutRef.current) {
        clearTimeout(controlsHideTimeoutRef.current);
        controlsHideTimeoutRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
        saveIntervalRef.current = null;
      }
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [
    flagLoaded,
    verification60Enabled,
    video?.youtube_id,
    progressLoaded,
    trackLinearProgress,
    saveProgress,
    showControls,
  ]);

  const handleSubmit = async (): Promise<void> => {
    setSubmitting(true);
    let token = "";
    try {
      const allCookies = document.cookie.split(";");
      const parts: string[] = [];
      let i = 0;
      while (true) {
        const part = allCookies.find((c) => c.trim().startsWith(`sb-lrolatbudvianeazliax-auth-token.${i}=`));
        if (!part) break;
        parts.push(part.trim().split("=").slice(1).join("="));
        i++;
      }
      const combined = parts.join("").replace("base64-", "");
      const decoded = JSON.parse(atob(combined));
      token = decoded?.access_token || "";
    } catch (e) {
      console.error("token error:", e);
    }
    const res = await fetch("/api/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: id, code: codeInput, token }),
    });
    const data = await res.json();
    setResult(data);
    if (data.success) {
      setCodeValidated(true);
      setShowQuizReadyModal(true);
    }
    setSubmitting(false);
  };

  const startQuiz = (): void => {
    router.push(`/videos/${id}/quiz`);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setCodeInput(formatCodeInput(e.target.value));
  };

  if (loading || !flagLoaded || (verification60Enabled && !progressLoaded)) {
    return (
      <div style={{ ...pageShell, display: "flex", alignItems: "center", justifyContent: "center" }}>
        Chargement...
      </div>
    );
  }

  if (!video) {
    return (
      <div style={{ ...pageShell, display: "flex", alignItems: "center", justifyContent: "center" }}>
        Video introuvable
      </div>
    );
  }

  const formLocked = verification60Enabled && !codeUnlocked;

  return (
    <main style={pageShell}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .video-page-title {
              font-size: clamp(1.2rem, 5vw, 2.5rem);
            }
            .video-page-nav-back {
              display: inline-flex;
              align-items: center;
              min-height: 44px;
              padding: 0.25rem 0.5rem;
            }
            .video-page-content {
              max-width: 900px;
              margin: 0 auto;
              padding: 2rem;
            }
            .video-page-code-box {
              padding: 2rem;
            }
            .video-player-shell {
              position: relative;
              width: 100%;
              height: 100%;
            }
            .video-player-block-overlay {
              position: absolute;
              inset: 0;
              z-index: 2;
              pointer-events: all;
              background: transparent;
            }
            .video-player-controls {
              position: absolute;
              inset: 0;
              z-index: 3;
              display: flex;
              align-items: flex-end;
              justify-content: center;
              padding-bottom: 1rem;
              pointer-events: none;
              opacity: 0;
              transition: opacity 0.25s ease;
            }
            .video-player-controls--visible {
              opacity: 1;
            }
            .video-player-controls-bar {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 1.5rem;
              padding: 0.65rem 1.25rem;
              background: rgba(0, 0, 0, 0.65);
              border-radius: 4px;
              pointer-events: none;
            }
            .video-player-btn {
              pointer-events: none;
              min-width: 44px;
              min-height: 44px;
              padding: 0 0.75rem;
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 4px;
              background: rgba(255, 255, 255, 0.08);
              color: #F5F0E8;
              font-family: var(--font-mono), ui-monospace, monospace;
              font-size: 0.85rem;
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              justify-content: center;
            }
            .video-player-controls--visible .video-player-btn {
              pointer-events: all;
            }
            .video-player-fullscreen-btn {
              position: absolute;
              right: 1rem;
              bottom: 1rem;
              pointer-events: none;
            }
            .video-player-controls--visible .video-player-fullscreen-btn {
              pointer-events: all;
            }
            .video-player-btn:hover {
              background: rgba(255, 255, 255, 0.15);
            }
            @media (max-width: 479px) {
              .video-page-nav {
                padding: 1rem !important;
              }
              .video-page-content {
                padding: 1rem;
              }
              .video-page-code-box {
                padding: 1rem;
              }
            }
          `,
        }}
      />
      <nav
        className="video-page-nav"
        style={{
          padding: "1rem 2rem",
          borderBottom: "1px solid rgba(255,255,255,.08)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{ fontFamily: "Bebas Neue,sans-serif", fontSize: "1.5rem", cursor: "pointer" }}
          onClick={() => router.push("/dashboard")}
        >
          LEVE
        </span>
        <span
          className="video-page-nav-back"
          style={{ opacity: 0.5, cursor: "pointer" }}
          onClick={() => router.push("/videos")}
        >
          Retour
        </span>
      </nav>
      <div
        className="video-page-content"
        style={{ fontFamily: "var(--font-mono), ui-monospace, monospace" }}
      >
        <h1 className="video-page-title" style={{ fontFamily: "Bebas Neue,sans-serif", margin: 0 }}>
          {video.title}
        </h1>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: "0.75rem",
          }}
        >
          <span
            style={{
              background: "#D4A017",
              color: "#080808",
              padding: ".25rem .75rem",
              fontSize: ".75rem",
            }}
          >
            {video.points_value} pts
          </span>
          <BonusBadge bonusExpireAt={video.bonus_expire_at} />
        </div>
        <div
          style={{
            margin: "2rem 0",
            aspectRatio: "16/9",
            fontFamily: "var(--font-mono), ui-monospace, monospace",
          }}
        >
          {verification60Enabled ? (
            <div ref={videoShellRef} className="video-player-shell">
              <div ref={playerContainerRef} style={{ width: "100%", height: "100%" }} />
              <div
                className="video-player-block-overlay"
                aria-hidden="true"
                onClick={showControls}
                onMouseEnter={showControls}
                onMouseMove={showControls}
              />
              <div
                className={`video-player-controls${controlsVisible ? " video-player-controls--visible" : ""}`}
                onMouseEnter={showControls}
              >
                <div className="video-player-controls-bar">
                  <button
                    type="button"
                    className="video-player-btn"
                    aria-label="Reculer 10 secondes"
                    onClick={handleRewind}
                  >
                    ◀ 10s
                  </button>
                  <button
                    type="button"
                    className="video-player-btn"
                    aria-label={isPlaying ? "Pause" : "Lecture"}
                    onClick={handlePlayPause}
                  >
                    {isPlaying ? "⏸" : "▶"}
                  </button>
                </div>
                <button
                  type="button"
                  className="video-player-btn video-player-fullscreen-btn"
                  aria-label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
                  onClick={handleFullscreen}
                >
                  {isFullscreen ? "↙" : "⛶"}
                </button>
              </div>
            </div>
          ) : (
            <iframe
              src={`https://www.youtube.com/embed/${video.youtube_id}`}
              allowFullScreen
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          )}
        </div>
        <div className="video-page-code-box" style={{ background: "#111", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
          <h2
            style={{
              fontFamily: "Bebas Neue,sans-serif",
              fontSize: "1.8rem",
              color: "#C0392B",
              marginBottom: "1.5rem",
            }}
          >
            SOUMETS TON CODE
          </h2>
          {formLocked ? (
            <p
              style={{
                margin: "0 0 1.5rem",
                padding: "1rem 1.25rem",
                background: "rgba(212, 160, 23, 0.12)",
                border: "1px solid rgba(212, 160, 23, 0.35)",
                fontSize: "0.95rem",
                lineHeight: 1.5,
              }}
            >
              Regardez au moins 60% de la vidéo pour déverrouiller le code 🔒
            </p>
          ) : null}
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              value={codeInput}
              onChange={handleCodeChange}
              placeholder="XXXX-YYYY-ZZZZ"
              disabled={formLocked || codeValidated}
              style={codeInputStyle(formLocked || codeValidated)}
            />
            {!codeValidated ? (
              <button
                onClick={() => void handleSubmit()}
                disabled={formLocked || submitting || !isCodeComplete(codeInput)}
                style={{
                  background: formLocked ? "#555" : "#C0392B",
                  color: "#fff",
                  border: "none",
                  padding: ".75rem 2rem",
                  cursor: formLocked ? "not-allowed" : "pointer",
                  opacity: formLocked ? 0.6 : 1,
                }}
              >
                VALIDER
              </button>
            ) : (
              <button
                onClick={startQuiz}
                style={{
                  background: "#C0392B",
                  color: "#fff",
                  border: "none",
                  padding: ".75rem 2rem",
                  cursor: "pointer",
                }}
              >
                Commencer le quiz
              </button>
            )}
          </div>
          {result && !result.success ? (
            <div
              style={{
                marginTop: "1.5rem",
                padding: "1rem",
                background: "rgba(192,57,43,.1)",
                fontFamily: "var(--font-mono), ui-monospace, monospace",
              }}
            >
              {`❌ ${result.message || "Code incorrect"}`}
            </div>
          ) : null}
        </div>
      </div>

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
            aria-labelledby="quiz-ready-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "420px",
              background: "#111",
              border: "1px solid rgba(255,255,255,.1)",
              padding: "2rem",
              fontFamily: "DM Sans,sans-serif",
            }}
          >
            <h2
              id="quiz-ready-title"
              style={{
                fontFamily: "Bebas Neue,sans-serif",
                fontSize: "2rem",
                margin: "0 0 1rem",
                color: "#F5F0E8",
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
                  background: "#C0392B",
                  color: "#fff",
                  border: "none",
                  padding: ".85rem 1.5rem",
                  cursor: "pointer",
                  fontFamily: "Bebas Neue,sans-serif",
                  fontSize: "1.1rem",
                }}
              >
                Je suis prêt — Commencer
              </button>
              <button
                type="button"
                onClick={() => setShowQuizReadyModal(false)}
                style={{
                  background: "transparent",
                  color: "#F5F0E8",
                  border: "1px solid rgba(255,255,255,.2)",
                  padding: ".75rem 1.5rem",
                  cursor: "pointer",
                }}
              >
                Plus tard
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

"use client";

import { createBrowserClient } from "@repo/supabase/browser";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { BonusBadge } from "../../../components/bonus-badge";
import { checkJwtExpired } from "../../../lib/supabase";

const WATCH_THRESHOLD = 80;
const PROGRESS_CHECK_MS = 2000;
const SAVE_PROGRESS_MS = 10000;
const SEEK_TOLERANCE_SEC = 5;

interface Video {
  id: string;
  youtube_id: string;
  title: string;
  points_value: number;
  bonus_expire_at: string | null;
  categorie?: string | null;
  tags?: string | null;
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
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  destroy(): void;
}

const YT_STATE_ENDED = 0;
const YT_STATE_PLAYING = 1;
const YT_STATE_PAUSED = 2;
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
    background: "var(--bg-card-inner)",
    border: "1px solid #333",
    color: disabled ? "var(--text-40)" : "var(--text)",
    textAlign: "center",
    fontSize: "1.1rem",
    letterSpacing: "0.08em",
    fontFamily: "var(--font-mono), ui-monospace, monospace",
    cursor: disabled ? "not-allowed" : "text",
  };
}

const pageShell: React.CSSProperties = {
  background: "var(--bg)",
  minHeight: "100vh",
  color: "var(--text)",
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
  const [controlsSwitchEnabled, setControlsSwitchEnabled] = useState<boolean>(false);
  const [pipEnabled, setPipEnabled] = useState<boolean>(false);
  const [flagLoaded, setFlagLoaded] = useState<boolean>(false);
  const [userId, setUserId] = useState<string>("");
  const [progressLoaded, setProgressLoaded] = useState<boolean>(false);
  const [codeUnlocked, setCodeUnlocked] = useState<boolean>(false);
  const [displayProgress, setDisplayProgress] = useState<number>(0);
  const [codeInput, setCodeInput] = useState<string>("");
  const [codeValidated, setCodeValidated] = useState<boolean>(false);
  const [quizAlreadyCompleted, setQuizAlreadyCompleted] = useState<boolean>(false);
  const [quizStatusLoaded, setQuizStatusLoaded] = useState<boolean>(false);
  const [showQuizReadyModal, setShowQuizReadyModal] = useState<boolean>(false);
  const [result, setResult] = useState<{
    success: boolean;
    message?: string;
    already_completed?: boolean;
  } | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [playerControls, setPlayerControls] = useState<0 | 1>(1);
  const [modeRevoirControlsReady, setModeRevoirControlsReady] = useState(false);

  const videoShellRef = useRef<HTMLDivElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const controlsHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRevoirTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxProgressRef = useRef<number>(0);
  const lastKnownPositionRef = useRef<number>(0);
  const unlockedRef = useRef<boolean>(false);
  const isResumingRef = useRef<boolean>(false);
  const hasPlayedRef = useRef<boolean>(false);
  const formLockedRef = useRef<boolean>(false);
  const quizDoneRef = useRef<boolean>(false);
  const userIdRef = useRef<string>("");
  const videoIdRef = useRef<string>("");
  const controlsSwitchEnabledRef = useRef<boolean>(false);
  const playerControlsRef = useRef<0 | 1>(1);
  const recreatePlayerRef = useRef<
    ((controls: 0 | 1, opts?: { seekTo?: number; autoplay?: boolean }) => void) | null
  >(null);

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
    if (quizAlreadyCompleted) {
      player.pauseVideo();
      setTimeout(() => {
        setControlsVisible(false);
        setModeRevoirControlsReady(false);
      }, 2000);
      return;
    }
    if (player.getPlayerState() === YT_STATE_PLAYING) {
      player.pauseVideo();
      setTimeout(() => {
        setControlsVisible(false);
      }, 100);
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

    setDisplayProgress(Math.min(100, Math.round(maxProgressRef.current)));

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

  const youtubeId = video?.youtube_id;

  useEffect(() => {
    function handleVisibility(): void {
      if (document.visibilityState !== "visible") return;
      if (!hasPlayedRef.current) return;
      if (unlockedRef.current) return;
      if (maxProgressRef.current <= 0) return;
      window.location.reload();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [youtubeId]);

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
        .select("id, youtube_id, title, points_value, bonus_expire_at, categorie, tags")
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
        const [r60, rSwitch, rPip] = await Promise.all([
          fetch("/api/feature-flags?nom=verification-60-pct", { cache: "no-store" }),
          fetch("/api/feature-flags?nom=video-controls-switch", { cache: "no-store" }),
          fetch("/api/feature-flags?nom=mini-player-pip", { cache: "no-store" }),
        ]);
        const j60 = (await r60.json()) as { actif?: boolean };
        const jSwitch = (await rSwitch.json()) as { actif?: boolean };
        const jPip = (await rPip.json()) as { actif?: boolean };
        if (cancelled) return;
        setVerification60Enabled(Boolean(j60.actif));
        setControlsSwitchEnabled(Boolean(jSwitch.actif));
        setPipEnabled(Boolean(jPip.actif));
      } catch {
        if (!cancelled) {
          setVerification60Enabled(false);
          setControlsSwitchEnabled(false);
          setPipEnabled(false);
        }
      } finally {
        if (!cancelled) setFlagLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    controlsSwitchEnabledRef.current = controlsSwitchEnabled;
  }, [controlsSwitchEnabled]);

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
        setDisplayProgress(Math.min(100, Math.round(savedMax)));

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
    if (!id) {
      setQuizAlreadyCompleted(false);
      setQuizStatusLoaded(true);
      return;
    }

    if (!userId) {
      setQuizAlreadyCompleted(false);
      setQuizStatusLoaded(true);
      return;
    }

    let cancelled = false;
    setQuizStatusLoaded(false);
    void (async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from("quiz_submissions")
        .select("id")
        .eq("membre_id", userId)
        .eq("video_id", id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        if (await checkJwtExpired({ message: error.message })) return;
        console.error("quiz_submissions load:", error.message);
        setQuizAlreadyCompleted(false);
      } else {
        setQuizAlreadyCompleted(Boolean(data?.id));
      }

      setQuizStatusLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, userId]);

  useEffect(() => {
    if (!flagLoaded || !verification60Enabled || !video?.youtube_id || !progressLoaded) return;

    let cancelled = false;
    const youtubeId = video.youtube_id;

    const createPlayer = (
      controls: 0 | 1,
      opts?: { seekTo?: number; autoplay?: boolean },
    ): void => {
      if (cancelled || !playerContainerRef.current || !window.YT?.Player) return;

      const container = playerContainerRef.current;
      container.innerHTML = "";
      const mount = document.createElement("div");
      mount.style.width = "100%";
      mount.style.height = "100%";
      container.appendChild(mount);

      playerControlsRef.current = controls;
      setPlayerControls(controls);

      const modeB = controlsSwitchEnabledRef.current;
      const playerVars: Record<string, number | string> = {
        rel: 0,
        modestbranding: 1,
      };

      if (!quizAlreadyCompleted) {
        playerVars.disablekb = 1;
      }
      playerVars.controls = controls;

      // Mode A: loop. Mode B: no loop so ENDED can fire and restore controls: 1.
      if (!modeB) {
        playerVars.loop = 1;
        playerVars.playlist = youtubeId;
      }

      const player = new window.YT.Player(mount, {
        videoId: youtubeId,
        playerVars,
        events: {
          onReady: (event) => {
            if (cancelled) return;
            const seekTo = opts?.seekTo;
            if (typeof seekTo === "number" && seekTo > 0) {
              event.target.seekTo(seekTo, true);
              lastKnownPositionRef.current = seekTo;
            } else {
              const duration = event.target.getDuration();
              if (duration && duration > 0) {
                lastKnownPositionRef.current = event.target.getCurrentTime();
              }
            }
            if (!opts?.seekTo && maxProgressRef.current > 0 && !unlockedRef.current) {
              const duration = event.target.getDuration();
              if (duration > 0) {
                const resumeAt = (maxProgressRef.current / 100) * duration;
                lastKnownPositionRef.current = resumeAt;
                isResumingRef.current = true;
                event.target.loadVideoById({
                  videoId: youtubeId,
                  startSeconds: resumeAt,
                });
              }
            }
            if (opts?.autoplay) {
              event.target.playVideo();
            }
            setIsPlaying(event.target.getPlayerState() === YT_STATE_PLAYING);
            showControls();
          },
          onStateChange: (event) => {
            if (cancelled) return;
            setIsPlaying(event.data === YT_STATE_PLAYING);

            if (event.data === 1 && isResumingRef.current) {
              isResumingRef.current = false;
              event.target.pauseVideo();
              return;
            }

            if (event.data === YT_STATE_PLAYING) {
              hasPlayedRef.current = true;
            }

            // Fullscreen auto en mode Première vue
            if (event.data === 1 && formLockedRef.current) {
              const shell = videoShellRef.current;
              if (shell && !document.fullscreenElement) {
                void shell.requestFullscreen().catch(() => {});
              }
            }

            if (quizDoneRef.current) {
              if (event.data === YT_STATE_PLAYING) {
                if (modeRevoirTimerRef.current) clearTimeout(modeRevoirTimerRef.current);
                modeRevoirTimerRef.current = setTimeout(() => {
                  setModeRevoirControlsReady(true);
                  showControls();
                }, 5000);
              }
              if (event.data === YT_STATE_PAUSED) {
                if (modeRevoirTimerRef.current) {
                  clearTimeout(modeRevoirTimerRef.current);
                  modeRevoirTimerRef.current = null;
                }
              }
            }

            // Mode A: controls: 1 permanent — no switch.
            if (!controlsSwitchEnabledRef.current) return;

            // Mode B: PLAYING → controls: 0 immediately; ENDED → controls: 1; PAUSED → keep controls: 0.
            if (event.data === YT_STATE_PLAYING) {
              if (playerControlsRef.current === 0) return;
              const seekTo = event.target.getCurrentTime();
              recreatePlayerRef.current?.(0, { seekTo, autoplay: true });
              return;
            }

            if (event.data === YT_STATE_PAUSED) {
              return;
            }

            if (event.data === YT_STATE_ENDED) {
              recreatePlayerRef.current?.(1, { seekTo: 0, autoplay: false });
            }
          },
        },
      });

      playerRef.current = player;
    };

    recreatePlayerRef.current = (controls, opts) => {
      if (cancelled) return;
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore destroy errors on already-torn-down iframes
      }
      playerRef.current = null;
      createPlayer(controls, opts);
    };

    void (async () => {
      await loadYouTubeIframeApi();
      if (cancelled || !playerContainerRef.current || !window.YT?.Player) return;

      createPlayer(1);

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
      recreatePlayerRef.current = null;
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
      if (modeRevoirTimerRef.current) clearTimeout(modeRevoirTimerRef.current);
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;
    };
  }, [
    flagLoaded,
    verification60Enabled,
    controlsSwitchEnabled,
    video?.youtube_id,
    progressLoaded,
    trackLinearProgress,
    saveProgress,
    showControls,
  ]);

  const handleSubmit = async (): Promise<void> => {
    setSubmitting(true);
    setResult(null);
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

    try {
      const res = await fetch("/api/code/valider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: id, code: codeInput, token }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        already_completed?: boolean;
      };

      if (data.already_completed) {
        setQuizAlreadyCompleted(true);
        setResult({
          success: false,
          already_completed: true,
          message: "✅ Tu as déjà complété le quiz de cette vidéo. Essaie une autre vidéo !",
        });
        setShowQuizReadyModal(false);
        return;
      }

      setResult({
        success: Boolean(data.success),
        message: data.message,
      });

      if (data.success) {
        setCodeValidated(true);
        setShowQuizReadyModal(true);
      }
    } catch {
      setResult({ success: false, message: "Erreur réseau lors de la validation du code." });
    } finally {
      setSubmitting(false);
    }
  };

  const startQuiz = (): void => {
    router.push(`/videos/${id}/quiz`);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setCodeInput(formatCodeInput(e.target.value));
  };

  const formLocked = !quizAlreadyCompleted && verification60Enabled && !codeUnlocked;

  useEffect(() => {
    formLockedRef.current = formLocked;
  }, [formLocked]);

  useEffect(() => {
    quizDoneRef.current = quizAlreadyCompleted;
  }, [quizAlreadyCompleted]);

  if (loading || !flagLoaded || !quizStatusLoaded || (verification60Enabled && !progressLoaded)) {
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

  const codeFieldDisabled = formLocked || codeValidated || quizAlreadyCompleted;

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
              pointer-events: none;
              background: transparent;
            }
            .video-player-block-overlay--active {
              pointer-events: all;
            }
            .video-player-progress-blocker {
              position: absolute;
              bottom: 0;
              left: 0;
              height: 60px;
              width: 100%;
              z-index: 10;
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
        style={{
          padding: "0.75rem 1.25rem",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          position: "sticky",
          top: 0,
          background: "rgba(8,8,8,0.92)",
          backdropFilter: "blur(8px)",
          zIndex: 20,
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/videos")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "transparent",
            border: "none",
            color: "rgba(245,240,232,0.55)",
            cursor: "pointer",
            fontSize: "0.82rem",
            padding: "4px 0",
          }}
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
          Vidéos
        </button>
        <span style={{ opacity: 0.2 }}>|</span>
        <span
          style={{
            fontFamily: "var(--font-bebas), Impact, sans-serif",
            fontSize: "1.1rem",
            letterSpacing: "0.1em",
            color: "var(--accent)",
            opacity: 0.9,
          }}
        >
          LEVE
        </span>
      </nav>
      <div
        className="video-page-content"
        style={{ fontFamily: "var(--font-mono), ui-monospace, monospace" }}
      >
        <div style={{ padding: "1.25rem 1.25rem 0.75rem" }}>
          {video.categorie || video.tags ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.4rem",
                marginBottom: "0.6rem",
              }}
            >
              {video.categorie ? (
                <span
                  style={{
                    fontSize: "0.68rem",
                    padding: "2px 8px",
                    borderRadius: "20px",
                    background: "rgba(74,144,217,0.1)",
                    border: "1px solid rgba(74,144,217,0.3)",
                    color: "rgba(74,144,217,0.9)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  {video.categorie}
                </span>
              ) : null}
              {video.tags ? (
                <span
                  style={{
                    fontSize: "0.68rem",
                    color: "rgba(245,240,232,0.4)",
                    letterSpacing: "0.02em",
                  }}
                >
                  {video.tags}
                </span>
              ) : null}
            </div>
          ) : null}

          <h1
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "clamp(1.5rem, 5vw, 2.25rem)",
              letterSpacing: "0.04em",
              color: "var(--text)",
              lineHeight: 1.1,
              margin: "0 0 0.75rem",
            }}
          >
            {video.title}
          </h1>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                background: "var(--accent)",
                color: "#080808",
                padding: "0.25rem 0.75rem",
                fontSize: "0.75rem",
                borderRadius: "4px",
                fontWeight: 600,
              }}
            >
              {video.points_value} pts
            </span>
            <BonusBadge bonusExpireAt={video.bonus_expire_at} />
          </div>
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
              {!controlsSwitchEnabled ? (
                <div
                  className="video-player-progress-blocker"
                  aria-hidden="true"
                  onClick={showControls}
                  onMouseEnter={showControls}
                  onMouseMove={showControls}
                />
              ) : null}
              {controlsSwitchEnabled ? (
                <div
                  className={`video-player-block-overlay${playerControls === 0 ? " video-player-block-overlay--active" : ""}`}
                  aria-hidden="true"
                  onClick={showControls}
                  onMouseEnter={showControls}
                  onMouseMove={showControls}
                />
              ) : null}
              {!formLocked && !quizAlreadyCompleted ? (
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
              ) : null}
            </div>
          ) : (
            <iframe
              src={`https://www.youtube.com/embed/${video.youtube_id}`}
              allowFullScreen
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          )}
        </div>
        {(() => {
          const modeRevoir = quizAlreadyCompleted;
          const modePremiere = !quizAlreadyCompleted && formLocked;

          if (modeRevoir) {
            return (
              <div style={{ padding: "1.25rem" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "0.75rem 1rem",
                    background: "rgba(46,204,113,0.08)",
                    border: "1px solid rgba(46,204,113,0.25)",
                    borderRadius: "8px",
                    marginBottom: "1rem",
                  }}
                >
                  <span style={{ fontSize: "1rem" }}>✅</span>
                  <span style={{ fontSize: "0.85rem", color: "rgba(46,204,113,0.9)" }}>
                    Quiz complété — +{video.points_value} pts gagnés
                  </span>
                </div>
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: "8px",
                    padding: "1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "var(--text)" }}>
                        1×
                      </p>
                      <p style={{ margin: 0, fontSize: "0.72rem", opacity: 0.5 }}>visionnages</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: 0, fontSize: "0.72rem", opacity: 0.5 }}>Bonus défini prochainement</p>
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "0.75rem",
                      background: "rgba(46,204,113,0.06)",
                      borderRadius: "6px",
                      border: "1px solid rgba(46,204,113,0.15)",
                      fontSize: "0.8rem",
                      color: "rgba(46,204,113,0.8)",
                      lineHeight: 1.5,
                    }}
                  >
                    Chaque réécoute compte. Un système de bonus sera mis en place pour les membres assidus.
                  </div>
                </div>
              </div>
            );
          }

          if (modePremiere) {
            return (
              <div style={{ padding: "1.25rem" }}>
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid rgba(212,160,23,0.2)",
                    borderRadius: "8px",
                    padding: "1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "0.75rem" }}>
                    <div style={{ flexShrink: 0, textAlign: "center", minWidth: "48px" }}>
                      <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)", lineHeight: 1 }}>
                        {displayProgress}%
                      </p>
                      <p style={{ margin: 0, fontSize: "0.65rem", opacity: 0.45 }}>/ 80%</p>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", lineHeight: 1.5, opacity: 0.75 }}>
                        Regarde la vidéo jusqu&apos;à 80% pour débloquer le formulaire de code.
                      </p>
                      <div style={{ height: 4, borderRadius: 2, background: "rgba(212,160,23,0.12)", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 2,
                          background: "var(--accent)",
                          width: `${Math.min(100, (displayProgress / 80) * 100)}%`,
                          transition: "width 0.5s ease",
                        }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div style={{ padding: "1.25rem" }}>
              {!codeValidated ? (
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: "8px",
                    padding: "1rem",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 0.6rem",
                      fontSize: "0.72rem",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      opacity: 0.55,
                    }}
                  >
                    Code secret de la vidéo
                  </p>
                  <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                    <input
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={codeInput}
                      onChange={handleCodeChange}
                      placeholder="XXXX-YYYY-ZZZZ"
                      disabled={codeFieldDisabled}
                      style={{
                        flex: 1,
                        height: "38px",
                        borderRadius: "4px",
                        background: "rgba(245,240,232,0.05)",
                        border: "1px solid rgba(245,240,232,0.15)",
                        color: "var(--text)",
                        padding: "0 0.75rem",
                        fontFamily: "var(--font-mono), ui-monospace, monospace",
                        fontSize: "0.88rem",
                        letterSpacing: "0.08em",
                      }}
                    />
                    <button
                      type="button"
                      disabled={formLocked || submitting || !isCodeComplete(codeInput)}
                      onClick={() => void handleSubmit()}
                      style={{
                        height: "38px",
                        padding: "0 1.25rem",
                        borderRadius: "4px",
                        background: "#C0392B",
                        color: "white",
                        border: "none",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        cursor: "pointer",
                        opacity: formLocked || submitting || !isCodeComplete(codeInput) ? 0.4 : 1,
                      }}
                    >
                      {submitting ? "…" : "VALIDER"}
                    </button>
                  </div>
                  {result && !result.success ? (
                    <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "#C0392B" }}>
                      {result.already_completed ? result.message : `❌ ${result.message || "Code incorrect"}`}
                    </p>
                  ) : null}
                  <p style={{ margin: "0.6rem 0 0", fontSize: "0.72rem", opacity: 0.45, lineHeight: 1.5 }}>
                    Le code apparaît dans la vidéo. Soumets-le pour faire le quiz et gagner tes points.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid rgba(46,204,113,0.25)",
                    borderRadius: "8px",
                    padding: "1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.85rem",
                        color: "rgba(46,204,113,0.9)",
                        fontWeight: 600,
                      }}
                    >
                      Code validé ✓
                    </p>
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", opacity: 0.55 }}>
                      Prêt pour le quiz
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={startQuiz}
                    style={{
                      height: "36px",
                      padding: "0 1.25rem",
                      borderRadius: "4px",
                      background: "var(--accent)",
                      color: "#000",
                      border: "none",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                    }}
                  >
                    COMMENCER LE QUIZ →
                  </button>
                </div>
              )}
            </div>
          );
        })()}
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
              background: "var(--bg-card)",
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
                color: "var(--text)",
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
                  color: "var(--text)",
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

      {pipEnabled ? (
        <div
          style={{
            position: "fixed",
            bottom: "5rem",
            left: "1rem",
            right: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            background: "rgba(18,18,18,0.95)",
            border: "1px solid rgba(245,240,232,0.1)",
            backdropFilter: "blur(8px)",
            zIndex: 25,
          }}
        >
          <span style={{ fontSize: "0.9rem" }}>▶</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: "0.78rem",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {video.title}
            </p>
            <p style={{ margin: 0, fontSize: "0.68rem", opacity: 0.45 }}>En cours de lecture</p>
          </div>
          <button
            type="button"
            onClick={() => setPipEnabled(false)}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(245,240,232,0.4)",
              cursor: "pointer",
              fontSize: "1rem",
              padding: "4px",
            }}
          >
            ×
          </button>
        </div>
      ) : null}
    </main>
  );
}

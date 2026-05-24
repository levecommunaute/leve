"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const SB = "https://lrolatbudvianeazliax.supabase.co";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

const WATCH_THRESHOLD = 0.6;
const WATCH_CHECK_MS = 5000;

interface Video {
  id: string;
  youtube_id: string;
  title: string;
  points_value: number;
}

interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

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

function inputStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "80px",
    padding: ".75rem",
    background: disabled ? "#1a1a1a" : "#222",
    border: "1px solid #333",
    color: disabled ? "rgba(245,240,232,0.45)" : "#F5F0E8",
    textAlign: "center",
    fontSize: "1.1rem",
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
  const id = params.id as string;

  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [verification60Enabled, setVerification60Enabled] = useState<boolean>(false);
  const [flagLoaded, setFlagLoaded] = useState<boolean>(false);
  const [codeUnlocked, setCodeUnlocked] = useState<boolean>(false);
  const [f1, setF1] = useState<string>("");
  const [f2, setF2] = useState<string>("");
  const [f3, setF3] = useState<string>("");
  const [result, setResult] = useState<{
    success: boolean;
    points_awarded?: number;
    message?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const watchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkWatchProgress = useCallback((): void => {
    const player = playerRef.current;
    if (!player) return;

    const duration = player.getDuration();
    if (!duration || duration <= 0) return;

    if (player.getCurrentTime() / duration >= WATCH_THRESHOLD) {
      setCodeUnlocked(true);
    }
  }, []);

  useEffect(() => {
    fetch(`${SB}/rest/v1/videos?id=eq.${id}&select=*`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    })
      .then((r) => r.json())
      .then((d: Video[]) => {
        setVideo(d[0] || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
      setCodeUnlocked(true);
    }
  }, [flagLoaded, verification60Enabled]);

  useEffect(() => {
    if (!flagLoaded || !verification60Enabled || !video?.youtube_id) return;

    let cancelled = false;

    void (async () => {
      await loadYouTubeIframeApi();
      if (cancelled || !playerContainerRef.current || !window.YT?.Player) return;

      const player = new window.YT.Player(playerContainerRef.current, {
        videoId: video.youtube_id,
        playerVars: {
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: () => {
            checkWatchProgress();
          },
          onStateChange: () => {
            checkWatchProgress();
          },
        },
      });

      playerRef.current = player;

      watchIntervalRef.current = setInterval(() => {
        checkWatchProgress();
      }, WATCH_CHECK_MS);
    })();

    return () => {
      cancelled = true;
      if (watchIntervalRef.current) {
        clearInterval(watchIntervalRef.current);
        watchIntervalRef.current = null;
      }
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [flagLoaded, verification60Enabled, video?.youtube_id, checkWatchProgress]);

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
      body: JSON.stringify({ video_id: id, code: f1 + "-" + f2 + "-" + f3, token }),
    });
    const data = await res.json();
    setResult(data);
    if (data.success) {
      router.push(`/videos/${id}/quiz`);
    }
    setSubmitting(false);
  };

  if (loading || !flagLoaded) {
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
      <nav
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
        <span style={{ opacity: 0.5, cursor: "pointer" }} onClick={() => router.push("/videos")}>
          Retour
        </span>
      </nav>
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem" }}>
        <h1 style={{ fontFamily: "Bebas Neue,sans-serif", fontSize: "2.5rem" }}>{video.title}</h1>
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
        <div style={{ margin: "2rem 0", aspectRatio: "16/9" }}>
          {verification60Enabled ? (
            <div ref={playerContainerRef} style={{ width: "100%", height: "100%" }} />
          ) : (
            <iframe
              src={`https://www.youtube.com/embed/${video.youtube_id}`}
              allowFullScreen
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          )}
        </div>
        <div style={{ background: "#111", padding: "2rem" }}>
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
              maxLength={4}
              value={f1}
              onChange={(e) => setF1(e.target.value.toUpperCase())}
              placeholder="XXXX"
              disabled={formLocked}
              style={inputStyle(formLocked)}
            />
            <span>-</span>
            <input
              maxLength={4}
              value={f2}
              onChange={(e) => setF2(e.target.value.toUpperCase())}
              placeholder="XXXX"
              disabled={formLocked}
              style={inputStyle(formLocked)}
            />
            <span>-</span>
            <input
              maxLength={4}
              value={f3}
              onChange={(e) => setF3(e.target.value.toUpperCase())}
              placeholder="XXXX"
              disabled={formLocked}
              style={inputStyle(formLocked)}
            />
            <button
              onClick={() => void handleSubmit()}
              disabled={formLocked || submitting || f1.length < 4 || f2.length < 4 || f3.length < 4}
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
          </div>
          {result ? (
            <div
              style={{
                marginTop: "1.5rem",
                padding: "1rem",
                background: result.success ? "rgba(46,204,113,.1)" : "rgba(192,57,43,.1)",
              }}
            >
              {result.success
                ? `✅ +${result.points_awarded} points`
                : `❌ ${result.message || "Code incorrect"}`}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

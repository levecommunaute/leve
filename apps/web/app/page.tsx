"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type JSX } from "react";
import { APP_BOTTOM_NAV_LINKS } from "../lib/appBottomNavLinks";
import { getSession, signInWithGoogle } from "../lib/auth";
import { readSessionFromAuthCookies } from "../lib/supabase-auth-cookies";
import { useYoutubeSubscriberCount } from "../lib/use-youtube-subscriber-count";

function isBadOAuthStateUrl(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("error") === "invalid_request" &&
    params.get("error_code") === "bad_oauth_state"
  );
}

function clearOAuthErrorParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("error");
  url.searchParams.delete("error_code");
  url.searchParams.delete("error_description");
  const next = url.pathname + url.search + url.hash;
  window.history.replaceState({}, "", next || "/");
}

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
const YOUTUBE_URL = "https://www.youtube.com/@levecommunaute";
const YOUTUBE_RED = "#FF0000";
const STATS_REFRESH_MS = 60_000;

type ReseauSocialKey = "youtube" | "facebook" | "tiktok" | "instagram";

type ReseauSocialRow = {
  id: string;
  reseau: ReseauSocialKey;
  abonnes: number;
  actif: boolean;
  ordre: number;
};

type FondateurConfigRow = {
  id: string;
  actif: boolean;
  membres_actuels: number;
  membres_max: number;
  message: string;
  updated_at: string;
};

const RESEAU_LABELS: Record<ReseauSocialKey, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  tiktok: "TikTok",
  instagram: "Instagram",
};

function formatAbonnes(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.max(0, Math.floor(n)));
}

const pools = [
  { label: "PMQ", pct: 45, desc: "Direct aux membres", color: ROUGE },
  { label: "Production", pct: 20, desc: "Équipe de création", color: GOLD },
  { label: "Fondation", pct: 10, desc: "Impact social", color: "#5DADE2" },
  { label: "Opérations", pct: 25, desc: "Infrastructure", color: "#555555" },
] as const;

const memberCards = [
  {
    title: "Pionnier",
    detail: "Numéros 1 à 1 000",
    multiplier: "Multiplicateur 2.0x",
    badge: "Rouge",
    badgeBg: ROUGE,
  },
  {
    title: "Fondateur",
    detail: "Numéros 1 001 à 10 000",
    multiplier: "Multiplicateur 2.0x",
    badge: "Or",
    badgeBg: GOLD,
  },
  {
    title: "Communauté",
    detail: "Membres réguliers",
    multiplier: "Multiplicateur 1.0x",
    badge: "Gris",
    badgeBg: "#888888",
  },
  {
    title: "Collaborateur",
    detail: "Créateurs invités",
    multiplier: "Multiplicateur 1.2x",
    badge: "Violet",
    badgeBg: "#8E44AD",
  },
] as const;

const steps = [
  {
    icon: "🎬",
    title: "Regarde les vidéos",
    text: "Abonne-toi à la chaîne YouTube LEVE et regarde les vidéos jusqu'à la fin.",
  },
  {
    icon: "🔍",
    title: "Trouve le code secret",
    text: "Chaque vidéo cache 3 fragments de code à des moments précis.",
  },
  {
    icon: "💰",
    title: "Gagne des points",
    text: "Soumets le code complet, fais le quiz et accumule des points PMQ.",
  },
] as const;

function YouTubeIcon({ size = 20 }: { size?: number }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path
        fill={YOUTUBE_RED}
        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
      />
    </svg>
  );
}

function FacebookIcon({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ flexShrink: 0 }}>
      <path
        fill="#1877F2"
        d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
      />
    </svg>
  );
}

function TikTokIcon({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ flexShrink: 0 }}>
      <path
        fill="#EE1D52"
        d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"
      />
    </svg>
  );
}

function InstagramIcon({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ flexShrink: 0 }}>
      <path
        fill="#E4405F"
        d="M12 2.163c3.204 0 3.584.012 4.85.07 1.17.054 1.97.24 2.43.403.59.22 1.01.48 1.45.92.44.44.7.86.92 1.45.163.46.35 1.26.403 2.43.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.053 1.17-.24 1.97-.403 2.43-.22.59-.48 1.01-.92 1.45-.44.44-.86.7-1.45.92-.46.163-1.26.35-2.43.403-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.17-.053-1.97-.24-2.43-.403a3.86 3.86 0 0 1-1.45-.92 3.86 3.86 0 0 1-.92-1.45c-.163-.46-.35-1.26-.403-2.43C2.175 15.747 2.163 15.367 2.163 12s.012-3.584.07-4.85c.053-1.17.24-1.97.403-2.43.22-.59.48-1.01.92-1.45.44-.44.86-.7 1.45-.92.46-.163 1.26-.35 2.43-.403C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.74 0 8.333.014 7.053.072 5.775.13 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.13 5.775.072 7.053.014 8.333 0 8.74 0 12s.014 3.667.072 4.947c.058 1.278.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.765.297 1.635.5 2.913.558C8.333 23.986 8.74 24 12 24s3.667-.014 4.947-.072c1.278-.058 2.148-.261 2.913-.558a5.87 5.87 0 0 0 2.126-1.384 5.87 5.87 0 0 0 1.384-2.126c.297-.765.5-1.635.558-2.913.058-1.28.072-1.687.072-4.947s-.014-3.667-.072-4.947c-.058-1.278-.261-2.148-.558-2.913a5.87 5.87 0 0 0-1.384-2.126A5.87 5.87 0 0 0 19.86.63c-.765-.297-1.635-.5-2.913-.558C15.667.014 15.26 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"
      />
    </svg>
  );
}

function ReseauSocialIcon({ reseau, size = 16 }: { reseau: ReseauSocialKey; size?: number }): JSX.Element {
  switch (reseau) {
    case "youtube":
      return <YouTubeIcon size={size} />;
    case "facebook":
      return <FacebookIcon size={size} />;
    case "tiktok":
      return <TikTokIcon size={size} />;
    case "instagram":
      return <InstagramIcon size={size} />;
  }
}

function RougeButton({
  children,
  onClick,
  className = "",
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-sm px-8 py-4 text-[0.95rem] font-semibold tracking-wide uppercase transition hover:brightness-110 active:brightness-95 ${className}`}
      style={{
        background: ROUGE,
        color: TEXT,
        fontFamily: "var(--font-dm), system-ui, sans-serif",
        border: "none",
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export default function Home(): JSX.Element {
  const router = useRouter();
  const fonts = `${bebas.variable} ${dmSans.variable}`;
  const [oauthRecovery, setOauthRecovery] = useState<
    "idle" | "checking" | "error" | "redirecting"
  >("idle");
  const [reseauxActifs, setReseauxActifs] = useState<ReseauSocialRow[]>([]);
  const [fondateurConfig, setFondateurConfig] = useState<FondateurConfigRow | null>(null);
  const [membresInscrits, setMembresInscrits] = useState<number | null>(null);
  const youtubeSubscriberCount = useYoutubeSubscriberCount();

  useEffect(() => {
    let cancelled = false;

    async function loadReseauxSociaux(): Promise<void> {
      try {
        const r = await fetch("/api/reseaux-sociaux", { cache: "no-store" });
        const j = (await r.json()) as { reseaux?: ReseauSocialRow[] };
        if (!cancelled && r.ok) {
          setReseauxActifs(j.reseaux ?? []);
        }
      } catch {
        if (!cancelled) setReseauxActifs([]);
      }
    }

    void loadReseauxSociaux();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadFondateurConfig(): Promise<void> {
      try {
        const r = await fetch("/api/fondateur-config", { cache: "no-store" });
        const j = (await r.json()) as { config?: FondateurConfigRow | null };
        if (!cancelled && r.ok && j.config?.actif) {
          setFondateurConfig(j.config);
        } else if (!cancelled) {
          setFondateurConfig(null);
        }
      } catch {
        if (!cancelled) setFondateurConfig(null);
      }
    }

    void loadFondateurConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadFondateurStats(): Promise<void> {
      try {
        const r = await fetch("/api/fondateur-stats", { cache: "no-store" });
        const j = (await r.json()) as { membres_inscrits?: number };
        if (!cancelled && r.ok && typeof j.membres_inscrits === "number") {
          setMembresInscrits(j.membres_inscrits);
        }
      } catch {
        // conserve la dernière valeur connue
      }
    }

    void loadFondateurStats();
    const id = window.setInterval(() => void loadFondateurStats(), STATS_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!isBadOAuthStateUrl()) return;

    let cancelled = false;
    setOauthRecovery("checking");

    async function handleBadOAuthState(): Promise<void> {
      const cookieSession = readSessionFromAuthCookies();
      const session = cookieSession ?? (await getSession());

      if (cancelled) return;

      clearOAuthErrorParams();

      if (session) {
        setOauthRecovery("redirecting");
        router.replace("/dashboard");
        return;
      }

      setOauthRecovery("error");
    }

    void handleBadOAuthState();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const showOAuthError = oauthRecovery === "error";

  const membresActuels = membresInscrits ?? 0;

  const fondateurPct =
    fondateurConfig && fondateurConfig.membres_max > 0
      ? Math.min(
          100,
          Math.round((membresActuels / fondateurConfig.membres_max) * 100),
        )
      : 0;

  return (
    <main
      className={fonts}
      style={{
        background: BG,
        color: TEXT,
        fontFamily: "var(--font-dm), system-ui, sans-serif",
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes leveHeroGradient {
              0%, 100% { opacity: 0.45; transform: translate(0, 0) scale(1); }
              33% { opacity: 0.65; transform: translate(4%, -3%) scale(1.06); }
              66% { opacity: 0.55; transform: translate(-3%, 4%) scale(1.03); }
            }
            @keyframes levePulse {
              0%, 100% { opacity: 0.08; }
              50% { opacity: 0.14; }
            }
            @keyframes leveLiveBlink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.35; }
            }
          `,
        }}
      />

      {reseauxActifs.length > 0 ? (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: "0.65rem 1.25rem",
            padding: "0.45rem 1rem",
            background: "#111111",
            borderBottom: "1px solid #1f1f1f",
            fontSize: "0.72rem",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              fontWeight: 600,
              color: TEXT,
            }}
          >
            <span
              aria-hidden
              style={{
                width: "0.5rem",
                height: "0.5rem",
                borderRadius: "50%",
                background: ROUGE,
                animation: "leveLiveBlink 1.2s ease-in-out infinite",
              }}
            />
            En direct
          </span>
          {reseauxActifs.map((r) => {
            const abonnes =
              r.reseau === "youtube" && youtubeSubscriberCount !== null
                ? youtubeSubscriberCount
                : r.abonnes;
            return (
              <span
                key={r.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  opacity: 0.92,
                }}
              >
                <ReseauSocialIcon reseau={r.reseau} size={14} />
                <span style={{ opacity: 0.7 }}>{RESEAU_LABELS[r.reseau]}</span>
                <span style={{ fontWeight: 600 }}>{formatAbonnes(abonnes)}</span>
              </span>
            );
          })}
        </div>
      ) : null}

      {/* ——— HERO ——— */}
      <section
        className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pb-24 pt-28 text-center md:pb-28"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{ animation: "levePulse 12s ease-in-out infinite" }}
        >
          <div
            className="absolute -left-[20%] top-[10%] h-[42rem] w-[42rem] rounded-full blur-[100px]"
            style={{
              background: `radial-gradient(circle, ${ROUGE}35 0%, transparent 62%)`,
              animation: "leveHeroGradient 18s ease-in-out infinite",
            }}
          />
          <div
            className="absolute -right-[15%] bottom-[15%] h-[38rem] w-[38rem] rounded-full blur-[90px]"
            style={{
              background: `radial-gradient(circle, ${GOLD}28 0%, transparent 60%)`,
              animation: "leveHeroGradient 22s ease-in-out infinite reverse",
            }}
          />
          <div
            className="absolute left-1/2 top-1/2 h-[30rem] w-[50rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
            style={{
              background: `radial-gradient(ellipse, ${TEXT}06 0%, transparent 58%)`,
            }}
          />
        </div>

        <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center gap-8">
          <h1
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "clamp(4.5rem, 22vw, 15rem)",
              lineHeight: 0.92,
              margin: 0,
              letterSpacing: "0.02em",
            }}
          >
            LEVE
          </h1>
          <p
            className="text-sm md:text-base"
            style={{
              letterSpacing: "0.45em",
              textTransform: "uppercase",
              opacity: 0.92,
            }}
          >
            Regarde. Trouve. Gagne.
          </p>
          <p className="max-w-2xl text-base leading-relaxed opacity-[0.82] md:text-lg">
            La première plateforme YouTube francophone qui redistribue ses revenus publicitaires à sa
            communauté.
          </p>
          {showOAuthError ? (
            <div
              className="flex max-w-md flex-col items-center gap-5 rounded-lg border px-8 py-8 text-center"
              style={{ borderColor: "#3a2020", background: "#120a0a" }}
              role="alert"
            >
              <p className="text-base leading-relaxed opacity-90">
                Une erreur est survenue, veuillez réessayer
              </p>
              <RougeButton onClick={() => void signInWithGoogle("rejoindre")}>
                Rejoindre
              </RougeButton>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-4">
              <RougeButton onClick={() => void signInWithGoogle("rejoindre")}>
                Rejoindre
              </RougeButton>
              <RougeButton
                onClick={() => void signInWithGoogle("connecter")}
                className="!bg-transparent"
                style={{ border: `2px solid ${ROUGE}` }}
              >
                Se connecter
              </RougeButton>
              <a
                href={YOUTUBE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 rounded-sm px-8 py-4 text-[0.95rem] font-semibold tracking-wide uppercase transition hover:bg-white/10 active:brightness-95"
                style={{
                  background: "transparent",
                  color: TEXT,
                  border: `2px solid ${TEXT}`,
                  fontFamily: "var(--font-dm), system-ui, sans-serif",
                  textDecoration: "none",
                }}
              >
                <YouTubeIcon />
                Voir la chaîne YouTube
              </a>
            </div>
          )}
          {fondateurConfig ? (
            <div
              className="mt-4 w-full max-w-lg rounded-lg border px-6 py-6 text-left"
              style={{
                borderColor: `${GOLD}55`,
                background: "rgba(212, 160, 23, 0.06)",
              }}
            >
              <p
                className="mb-4 text-center text-sm tracking-[0.2em] uppercase md:text-base"
                style={{ color: GOLD, fontWeight: 600 }}
              >
                Statut Fondateur — Les {formatAbonnes(fondateurConfig.membres_max)} premiers
              </p>
              <div
                className="mb-3 flex items-baseline justify-between gap-4"
                style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
              >
                <span className="text-3xl tracking-wide md:text-4xl" style={{ color: GOLD }}>
                  {formatAbonnes(membresActuels)}
                </span>
                <span className="text-lg opacity-60 md:text-xl">
                  / {formatAbonnes(fondateurConfig.membres_max)}
                </span>
              </div>
              <div
                aria-hidden
                className="mb-3 h-2.5 overflow-hidden rounded-full"
                style={{ background: "rgba(245, 240, 232, 0.1)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${fondateurPct}%`,
                    background: `linear-gradient(90deg, ${GOLD} 0%, #E8C547 100%)`,
                  }}
                />
              </div>
              <p
                className="mb-3 flex items-center justify-center gap-1.5 text-center text-sm md:text-base"
                style={{ opacity: 0.88 }}
              >
                <span aria-hidden style={{ color: YOUTUBE_RED }}>
                  🔴
                </span>
                <span>
                  {youtubeSubscriberCount !== null
                    ? formatAbonnes(youtubeSubscriberCount)
                    : "…"}{" "}
                  abonnés YouTube en direct
                </span>
              </p>
              <p className="mb-3 text-center text-sm opacity-80 md:text-base">
                {fondateurPct}% des places sont prises
              </p>
              {fondateurConfig.message.trim() ? (
                <p className="m-0 text-center text-sm leading-relaxed opacity-75 md:text-base">
                  {fondateurConfig.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* ——— COMMENT ÇA MARCHE ——— */}
      <section className="border-t px-6 py-20 md:py-28" style={{ borderColor: "#1a1a1a" }}>
        <div className="mx-auto max-w-6xl">
          <h2
            className="mb-14 text-center text-4xl tracking-wide md:text-5xl lg:text-[3.25rem]"
            style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
          >
            COMMENT ÇA MARCHE
          </h2>
          <div className="grid gap-10 md:grid-cols-3 md:gap-8">
            {steps.map((s) => (
              <div
                key={s.title}
                className="flex flex-col items-center rounded-lg border px-8 py-10 text-center backdrop-blur-sm"
                style={{ borderColor: "#262626", background: "#0c0c0c" }}
              >
                <span className="mb-6 text-4xl">{s.icon}</span>
                <h3 className="mb-4 text-lg font-semibold" style={{ color: GOLD }}>
                  {s.title}
                </h3>
                <p className="text-[0.95rem] leading-relaxed opacity-[0.78]">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ——— MEMBRES ——— */}
      <section className="border-t px-6 py-20 md:py-28" style={{ borderColor: "#1a1a1a" }}>
        <div className="mx-auto max-w-6xl">
          <h2
            className="mb-14 text-center text-4xl tracking-wide md:text-5xl lg:text-[3.25rem]"
            style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
          >
            LES MEMBRES LEVE
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {memberCards.map((m) => (
              <article
                key={m.title}
                className="flex flex-col rounded-lg border p-7"
                style={{ borderColor: "#2a2a2a", background: "#0d0d0d" }}
              >
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3
                    className="text-2xl tracking-wide"
                    style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
                  >
                    {m.title}
                  </h3>
                  <span
                    className="shrink-0 rounded px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider"
                    style={{ background: m.badgeBg, color: TEXT }}
                  >
                    {m.badge}
                  </span>
                </div>
                <p className="mb-2 text-sm opacity-80">{m.detail}</p>
                <p className="mt-auto text-sm font-medium" style={{ color: GOLD }}>
                  {m.multiplier}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ——— REDISTRIBUTION ——— */}
      <section className="border-t px-6 py-20 md:py-28" style={{ borderColor: "#1a1a1a" }}>
        <div className="mx-auto max-w-6xl">
          <h2
            className="mb-6 text-center text-3xl tracking-wide md:text-4xl lg:text-[2.75rem]"
            style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
          >
            LA REDISTRIBUTION MENSUELLE
          </h2>
          <p className="mx-auto mb-12 max-w-3xl text-center text-base leading-relaxed opacity-[0.8]">
            Chaque mois, <strong style={{ color: GOLD }}>45&nbsp;%</strong> des revenus publicitaires de
            LEVE sont redistribués aux membres au travers du programme PMQ. Le reste alimente la
            production, l&apos;impact social et les opérations de la plateforme.
          </p>

          <div
            className="mb-10 flex h-14 w-full overflow-hidden rounded-md md:h-16"
            style={{ boxShadow: "inset 0 0 0 1px #2a2a2a" }}
          >
            {pools.map((p) => (
              <div
                key={p.label}
                className="flex min-w-0 flex-1 items-center justify-center border-r border-black/30 text-xs font-bold text-white last:border-r-0 md:text-sm"
                style={{
                  flexBasis: `${p.pct}%`,
                  background: p.color,
                  textShadow: "0 1px 2px rgba(0,0,0,0.45)",
                }}
                title={`${p.pct}% — ${p.label}`}
              >
                <span className="truncate px-1 md:px-2">{p.pct}%</span>
              </div>
            ))}
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pools.map((p) => (
              <li
                key={p.label}
                className="flex gap-3 rounded-md border px-4 py-3"
                style={{ borderColor: "#2a2a2a", background: "#0d0d0d" }}
              >
                <span
                  className="mt-1 h-3 w-3 shrink-0 rounded-sm"
                  style={{ background: p.color }}
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-semibold">
                    {p.pct}% {p.label}
                  </p>
                  <p className="text-xs opacity-70">{p.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ——— CTA ——— */}
      <section className="border-t px-6 py-24 md:py-32" style={{ borderColor: "#1a1a1a" }}>
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 text-center">
          <h2
            className="text-4xl tracking-wide md:text-5xl lg:text-[3.5rem]"
            style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
          >
            PRÊT À REJOINDRE LEVE?
          </h2>
          <p className="max-w-xl text-base leading-relaxed opacity-[0.82]">
            Les premiers 1&nbsp;000 membres deviennent Pionniers avec un multiplicateur 2.0x.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <RougeButton onClick={() => void signInWithGoogle("rejoindre")}>
              Rejoindre
            </RougeButton>
            <RougeButton onClick={() => void signInWithGoogle("connecter")}>
              Se connecter
            </RougeButton>
          </div>
        </div>
      </section>

      {/* ——— FOOTER ——— */}
      <footer
        className="border-t px-6 py-12 text-sm"
        style={{ borderColor: "#1a1a1a", background: "#050505" }}
      >
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 md:flex-row md:justify-between md:gap-4">
          <p className="text-center opacity-75 md:text-left">
            LEVE MÉDIA INC. ·{" "}
            <a
              href="https://levecommunaute.com"
              className="underline decoration-white/30 underline-offset-4 hover:opacity-100"
              style={{ color: TEXT }}
              target="_blank"
              rel="noopener noreferrer"
            >
              levecommunaute.com
            </a>
          </p>
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 uppercase tracking-wide">
            {APP_BOTTOM_NAV_LINKS.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="opacity-75 transition hover:opacity-100"
                style={{ color: TEXT }}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </main>
  );
}

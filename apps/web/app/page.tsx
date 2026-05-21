"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import type { JSX } from "react";
import { APP_BOTTOM_NAV_LINKS } from "../lib/appBottomNavLinks";
import { signInWithGoogle } from "../lib/auth";

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
  const fonts = `${bebas.variable} ${dmSans.variable}`;

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
          `,
        }}
      />

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
          </div>
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

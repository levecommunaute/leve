"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import type { JSX } from "react";

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

export default function PasDeComptePage(): JSX.Element {
  const fonts = `${bebas.variable} ${dmSans.variable}`;

  return (
    <main
      className={fonts}
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT,
        fontFamily: "var(--font-dm), system-ui, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          maxWidth: "28rem",
          width: "100%",
          borderRadius: "4px",
          border: "1px solid rgba(245, 240, 232, 0.15)",
          background: "#0d0d0d",
          padding: "2rem 1.75rem",
          textAlign: "center",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
      >
        <h1
          style={{
            fontFamily: "var(--font-bebas), Impact, sans-serif",
            fontSize: "2rem",
            letterSpacing: "0.06em",
            margin: "0 0 1rem",
            color: GOLD,
          }}
        >
          Vous n&apos;avez pas encore de compte LEVE
        </h1>
        <p style={{ margin: "0 0 1.5rem", lineHeight: 1.55, opacity: 0.9 }}>
          Abonnez-vous à notre chaîne YouTube puis utilisez le bouton Rejoindre pour créer votre
          compte.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginBottom: "1rem",
            padding: "0.85rem 1.5rem",
            borderRadius: "4px",
            background: ROUGE,
            color: TEXT,
            fontWeight: 600,
            textDecoration: "none",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          Rejoindre
        </Link>
        <a
          href={YOUTUBE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            padding: "0.65rem 1.25rem",
            border: `1px solid ${GOLD}`,
            borderRadius: "4px",
            color: TEXT,
            textDecoration: "none",
            fontSize: "0.9rem",
          }}
        >
          Voir la chaîne YouTube
        </a>
      </div>
    </main>
  );
}

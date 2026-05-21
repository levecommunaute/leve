"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import type { JSX } from "react";
import { signInWithGoogle } from "../../../lib/auth";

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

export default function DejaMembrePage(): JSX.Element {
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
          borderRadius: "12px",
          border: "1px solid rgba(245, 240, 232, 0.15)",
          background: "#0d0d0d",
          padding: "2rem 1.75rem",
          textAlign: "center",
        }}
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
          Vous faites déjà partie de LEVE !
        </h1>
        <p style={{ margin: "0 0 1.5rem", lineHeight: 1.55, opacity: 0.9 }}>
          Vous avez déjà un compte LEVE. Utilisez le bouton Se connecter pour accéder à votre
          espace membre.
        </p>
        <button
          type="button"
          onClick={() => void signInWithGoogle("connecter")}
          style={{
            display: "inline-block",
            marginBottom: "1rem",
            padding: "0.85rem 1.5rem",
            borderRadius: "6px",
            background: ROUGE,
            color: TEXT,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            width: "100%",
          }}
        >
          Se connecter
        </button>
        <Link
          href="/"
          style={{
            display: "inline-block",
            padding: "0.65rem 1.25rem",
            border: `1px solid rgba(245, 240, 232, 0.25)`,
            borderRadius: "6px",
            color: TEXT,
            textDecoration: "none",
            fontSize: "0.9rem",
            opacity: 0.85,
          }}
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}

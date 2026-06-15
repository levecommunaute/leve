"use client";

export const dynamic = "force-dynamic";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useEffect, useState, type JSX } from "react";
import { signInWithGoogle } from "../../lib/auth";

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

/** Codes beta acceptés (code unique partagé). */
const VALID_BETA_CODES = ["LEVE2026BETA"];

type CodeStatus = "checking" | "valid" | "invalid";
type EmailStatus = "idle" | "checking" | "autorise" | "refuse";

export default function BetaPage(): JSX.Element {
  const fonts = `${bebas.variable} ${dmSans.variable}`;
  const [status, setStatus] = useState<CodeStatus>("checking");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    const valid =
      typeof code === "string" &&
      VALID_BETA_CODES.includes(code.trim().toUpperCase());
    setStatus(valid ? "valid" : "invalid");
  }, []);

  async function handleVerifyEmail(): Promise<void> {
    const value = email.trim().toLowerCase();
    if (!value) {
      setEmailError("Entrez votre adresse Gmail.");
      return;
    }
    setEmailStatus("checking");
    setEmailError(null);
    try {
      const r = await fetch(
        `/api/beta/verifier-email?email=${encodeURIComponent(value)}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as { autorise?: boolean; error?: string };
      if (!r.ok) {
        setEmailError(j.error ?? "Erreur lors de la vérification.");
        setEmailStatus("idle");
        return;
      }
      setEmailStatus(j.autorise ? "autorise" : "refuse");
    } catch {
      setEmailError("Erreur réseau. Réessayez.");
      setEmailStatus("idle");
    }
  }

  async function handleJoin(): Promise<void> {
    setJoining(true);
    setJoinError(null);
    try {
      // Redirige vers Google OAuth puis /auth/callback?mode=rejoindre&beta=true
      await signInWithGoogle("rejoindre", { beta: true });
    } catch {
      setJoinError("Impossible de lancer la connexion Google. Réessayez.");
      setJoining(false);
    }
  }

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
        {status === "checking" ? (
          <p style={{ margin: 0, opacity: 0.7 }}>Vérification du code…</p>
        ) : status === "valid" ? (
          <>
            <h1
              style={{
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "2rem",
                letterSpacing: "0.06em",
                margin: "0 0 1rem",
                color: GOLD,
              }}
            >
              Bienvenue dans la Beta LEVE
            </h1>
            {emailStatus === "autorise" ? (
              <>
                <p
                  style={{ margin: "0 0 1.5rem", lineHeight: 1.55, opacity: 0.9 }}
                >
                  Votre accès est confirmé. Connectez-vous avec Google pour créer
                  votre compte de beta testeur. Votre activité (pages visitées,
                  temps passé) sera suivie pour nous aider à améliorer LEVE.
                </p>
                <button
                  type="button"
                  disabled={joining}
                  onClick={() => void handleJoin()}
                  style={{
                    display: "inline-block",
                    padding: "0.85rem 1.5rem",
                    borderRadius: "6px",
                    background: ROUGE,
                    color: TEXT,
                    fontWeight: 600,
                    border: "none",
                    width: "100%",
                    boxSizing: "border-box",
                    fontSize: "1rem",
                    cursor: joining ? "wait" : "pointer",
                    opacity: joining ? 0.7 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  {joining ? "Redirection…" : "Rejoindre la beta avec Google"}
                </button>
                {joinError ? (
                  <p
                    role="alert"
                    style={{
                      margin: "1rem 0 0",
                      color: ROUGE,
                      fontSize: "0.9rem",
                    }}
                  >
                    {joinError}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p
                  style={{ margin: "0 0 1.5rem", lineHeight: 1.55, opacity: 0.9 }}
                >
                  Entrez votre adresse Gmail pour vérifier votre accès.
                </p>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && emailStatus !== "checking") {
                      void handleVerifyEmail();
                    }
                  }}
                  placeholder="votre.adresse@gmail.com"
                  autoComplete="email"
                  disabled={emailStatus === "checking"}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "0.85rem 1rem",
                    borderRadius: "6px",
                    border: "1px solid rgba(245, 240, 232, 0.2)",
                    background: "#080808",
                    color: TEXT,
                    fontSize: "1rem",
                    fontFamily: "inherit",
                    marginBottom: "0.85rem",
                  }}
                />
                <button
                  type="button"
                  disabled={emailStatus === "checking"}
                  onClick={() => void handleVerifyEmail()}
                  style={{
                    display: "inline-block",
                    padding: "0.85rem 1.5rem",
                    borderRadius: "6px",
                    background: GOLD,
                    color: BG,
                    fontWeight: 600,
                    border: "none",
                    width: "100%",
                    boxSizing: "border-box",
                    fontSize: "1rem",
                    cursor: emailStatus === "checking" ? "wait" : "pointer",
                    opacity: emailStatus === "checking" ? 0.7 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  {emailStatus === "checking"
                    ? "Vérification…"
                    : "Vérifier mon accès"}
                </button>
                {emailStatus === "refuse" ? (
                  <p
                    role="alert"
                    style={{
                      margin: "1rem 0 0",
                      color: ROUGE,
                      fontSize: "0.9rem",
                      lineHeight: 1.5,
                    }}
                  >
                    Votre email n&apos;est pas sur la liste des testeurs invités.
                    Contactez levecommunaute@gmail.com
                  </p>
                ) : null}
                {emailError ? (
                  <p
                    role="alert"
                    style={{
                      margin: "1rem 0 0",
                      color: ROUGE,
                      fontSize: "0.9rem",
                    }}
                  >
                    {emailError}
                  </p>
                ) : null}
              </>
            )}
          </>
        ) : (
          <>
            <h1
              style={{
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "2rem",
                letterSpacing: "0.06em",
                margin: "0 0 1rem",
                color: ROUGE,
              }}
            >
              Code beta invalide
            </h1>
            <p style={{ margin: "0 0 1.5rem", lineHeight: 1.55, opacity: 0.9 }}>
              Le code fourni est invalide ou manquant. Vérifiez le lien reçu ou
              contactez l&apos;équipe LEVE pour obtenir un code valide.
            </p>
            <Link
              href="/"
              style={{
                display: "inline-block",
                padding: "0.85rem 1.5rem",
                borderRadius: "6px",
                border: `1px solid ${GOLD}`,
                color: TEXT,
                fontWeight: 600,
                textDecoration: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              Retour à l&apos;accueil
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

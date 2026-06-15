"use client";

export const dynamic = "force-dynamic";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";
import { checkJwtExpired } from "../../lib/supabase";
import { useBetaTracking } from "../../lib/beta-tracking";

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

async function restJson<T>(
  path: string,
  accessToken: string,
): Promise<{ data: T; error: string | null }> {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const msg =
      json &&
      typeof json === "object" &&
      "message" in json &&
      typeof (json as { message: unknown }).message === "string"
        ? (json as { message: string }).message
        : res.statusText || "Erreur réseau";
    if (await checkJwtExpired({ status: res.status, message: msg })) {
      return { data: null as T, error: null };
    }
    return { data: null as T, error: msg };
  }
  return { data: json as T, error: null };
}

type BetaProfileRow = {
  display_name: string | null;
  is_beta_tester: boolean | null;
  beta_points: number | string | null;
  beta_derniere_activite: string | null;
  beta_temps_total_secondes: number | string | null;
};

type BetaActionRow = {
  id: string;
  action_type: string;
  page: string;
  points: number | null;
  created_at: string;
};

const ACTIONS_LIMIT = 30;
const PERMANENT_LINK = "leve-web.vercel.app/beta-dashboard";

function formatDureeTotale(totalSecondes: number): string {
  if (totalSecondes <= 0) return "0 min";
  const heures = Math.floor(totalSecondes / 3600);
  const minutes = Math.floor((totalSecondes % 3600) / 60);
  if (heures <= 0) return `${minutes} min`;
  return `${heures} h ${minutes.toString().padStart(2, "0")} min`;
}

const dateTimeFmt = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});

const pointsFmt = new Intl.NumberFormat("fr-CA", {
  maximumFractionDigits: 0,
});

function actionLabel(actionType: string): string {
  if (actionType === "page_view") return "Page visitée";
  return actionType;
}

export default function BetaDashboardPage(): JSX.Element | null {
  const router = useRouter();
  const fonts = `${bebas.variable} ${dmSans.variable}`;
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useBetaTracking(session, "beta-dashboard");
  const [profile, setProfile] = useState<BetaProfileRow | null>(null);
  const [actions, setActions] = useState<BetaActionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const copyPermanentLink = useCallback(() => {
    void navigator.clipboard
      .writeText(`https://${PERMANENT_LINK}`)
      .then(() => {
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard indisponible (HTTP, permissions) : on ignore silencieusement.
      });
  }, []);

  const loadBetaData = useCallback(
    async (activeSession: Session) => {
      const token = activeSession.access_token;
      const uid = activeSession.user.id;

      const [profileRes, actionsRes] = await Promise.all([
        restJson<BetaProfileRow[]>(
          `profiles?id=eq.${encodeURIComponent(uid)}` +
            `&select=display_name,is_beta_tester,beta_points,beta_derniere_activite,beta_temps_total_secondes`,
          token,
        ),
        restJson<BetaActionRow[]>(
          `beta_actions?membre_id=eq.${encodeURIComponent(uid)}` +
            `&select=id,action_type,page,points,created_at` +
            `&order=created_at.desc&limit=${ACTIONS_LIMIT}`,
          token,
        ),
      ]);

      setLoadError(profileRes.error ?? actionsRes.error ?? null);

      const profileRow = (profileRes.data ?? [])[0] ?? null;
      if (!profileRes.error && profileRow?.is_beta_tester !== true) {
        router.replace("/dashboard");
        return;
      }

      setProfile(profileRow);
      if (!actionsRes.error) {
        setActions(actionsRes.data ?? []);
      }
      setLoaded(true);
    },
    [router],
  );

  useEffect(() => {
    const next = readSessionFromAuthCookies();
    if (!next) {
      setSession(null);
      router.replace("/");
      return;
    }
    setSession(next);
    void loadBetaData(next);
  }, [loadBetaData, router]);

  if (session === undefined || (session && !loaded)) {
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

  const betaPoints = Number(profile?.beta_points ?? 0);
  const tempsTotal = Number(profile?.beta_temps_total_secondes ?? 0);
  const derniereActivite = profile?.beta_derniere_activite
    ? dateTimeFmt.format(new Date(profile.beta_derniere_activite))
    : "—";

  return (
    <div
      className={fonts}
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT,
        fontFamily: "var(--font-dm), system-ui, sans-serif",
        paddingBottom: "3rem",
      }}
    >
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
        <Link
          href="/dashboard"
          style={{
            color: GOLD,
            fontSize: "0.85rem",
            textDecoration: "none",
            border: `1px solid ${GOLD}`,
            borderRadius: "6px",
            padding: "0.45rem 0.9rem",
          }}
        >
          ← Dashboard
        </Link>
      </header>

      <main style={{ maxWidth: "960px", margin: "0 auto", padding: "1.25rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem 0.9rem",
            marginBottom: "1.25rem",
            padding: "0.65rem 0.9rem",
            borderRadius: "10px",
            background: "rgba(245, 240, 232, 0.04)",
            border: "1px solid rgba(245, 240, 232, 0.12)",
            fontSize: "0.85rem",
          }}
        >
          <span style={{ opacity: 0.7 }}>Accès direct :</span>
          <code
            style={{
              fontFamily: "monospace",
              fontSize: "0.82rem",
              color: GOLD,
              wordBreak: "break-all",
            }}
          >
            {PERMANENT_LINK}
          </code>
          <button
            type="button"
            onClick={copyPermanentLink}
            style={{
              marginLeft: "auto",
              background: "transparent",
              color: linkCopied ? GOLD : TEXT,
              border: `1px solid ${linkCopied ? GOLD : "rgba(245, 240, 232, 0.35)"}`,
              borderRadius: "6px",
              padding: "0.35rem 0.75rem",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {linkCopied ? "Lien copié ✓" : "Copier le lien"}
          </button>
        </div>

        {loadError ? (
          <p role="alert" style={{ color: ROUGE, fontSize: "0.9rem", marginBottom: "1rem" }}>
            {loadError}
          </p>
        ) : null}

        <section
          style={{
            borderRadius: "14px",
            padding: "1.75rem 1.5rem",
            marginBottom: "1.25rem",
            background:
              "linear-gradient(145deg, rgba(212, 160, 23, 0.12) 0%, rgba(8, 8, 8, 0.9) 45%, rgba(192, 57, 43, 0.06) 100%)",
            border: "1px solid rgba(245, 240, 232, 0.1)",
          }}
        >
          <p style={{ margin: 0, opacity: 0.65, fontSize: "0.85rem" }}>
            Programme Beta
          </p>
          <h1
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "clamp(2.25rem, 7vw, 3.25rem)",
              letterSpacing: "0.04em",
              margin: "0.35rem 0 0.5rem",
              lineHeight: 1.05,
            }}
          >
            Tableau de bord Beta
          </h1>
          <span
            style={{
              display: "inline-block",
              background: GOLD,
              color: BG,
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "0.35rem 0.75rem",
              borderRadius: "999px",
            }}
          >
            Beta testeur
          </span>
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "0.85rem",
            marginBottom: "1.75rem",
          }}
        >
          <article
            style={{
              borderRadius: "12px",
              padding: "1.1rem",
              background: "rgba(245, 240, 232, 0.04)",
              border: "1px solid rgba(212, 160, 23, 0.35)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "0.72rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: GOLD,
              }}
            >
              Temps total
            </p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "1.65rem", fontWeight: 700, color: GOLD }}>
              {formatDureeTotale(tempsTotal)}
            </p>
          </article>

          <article
            style={{
              borderRadius: "12px",
              padding: "1.1rem",
              background: "rgba(245, 240, 232, 0.04)",
              border: "1px solid rgba(245, 240, 232, 0.12)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "0.72rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                opacity: 0.55,
              }}
            >
              Points Beta
            </p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "1.65rem", fontWeight: 700 }}>
              {pointsFmt.format(betaPoints)}
            </p>
          </article>

          <article
            style={{
              borderRadius: "12px",
              padding: "1.1rem",
              background: "rgba(245, 240, 232, 0.04)",
              border: "1px solid rgba(245, 240, 232, 0.12)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "0.72rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                opacity: 0.55,
              }}
            >
              Dernière activité
            </p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "1.05rem", fontWeight: 700 }}>
              {derniereActivite}
            </p>
          </article>
        </div>

        <section>
          <h2
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "1.35rem",
              letterSpacing: "0.08em",
              margin: "0 0 0.75rem",
              opacity: 0.9,
            }}
          >
            Dernières actions
          </h2>
          {actions.length === 0 ? (
            <p style={{ fontSize: "0.9rem", opacity: 0.7 }}>
              Aucune action enregistrée pour le moment. Naviguez sur le site pour
              accumuler des points beta.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {actions.map((action) => (
                <li
                  key={action.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    padding: "0.75rem 0.9rem",
                    marginBottom: "0.5rem",
                    borderRadius: "10px",
                    background: "rgba(245, 240, 232, 0.04)",
                    border: "1px solid rgba(245, 240, 232, 0.1)",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>
                      {actionLabel(action.action_type)}{" "}
                      <span style={{ color: GOLD }}>· {action.page}</span>
                    </p>
                    <p style={{ margin: "0.2rem 0 0", fontSize: "0.78rem", opacity: 0.6 }}>
                      {dateTimeFmt.format(new Date(action.created_at))}
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: GOLD,
                      whiteSpace: "nowrap",
                    }}
                  >
                    +{action.points ?? 0} pts
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

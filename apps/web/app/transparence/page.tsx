"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";

/** Aligné sur la réponse JSON de `/api/redistribution/historique`. */
type RedistributionMois = {
  month: string;
  total_revenue: number;
  value_per_point: number | null;
  total_distributed: number;
};

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
const VERT = "#2ECC71";
const GRIS_OPS = "#7F8C8D";
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
    return { data: null as T, error: msg };
  }
  return { data: json as T, error: null };
}

type ProfileRow = {
  display_name: string | null;
};

type BanqueLeveRow = {
  id: string;
  total_revenue: number | string | null;
  ptc_balance: number | string | null;
  pmq_balance: number | string | null;
  pcol_balance: number | string | null;
  pa_balance: number | string | null;
  pool_operations: number | string | null;
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

const navPages: { href: string; label: string }[] = [
  { href: "/", label: "Accueil" },
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/videos", label: "Vidéos" },
  { href: "/banque", label: "Banque LEVE" },
  { href: "/classement", label: "Classement" },
  { href: "/transparence", label: "Transparence" },
];

const cad = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
});

const cadCompact = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});

const monthTitleFr = new Intl.DateTimeFormat("fr-CA", {
  month: "long",
  year: "numeric",
});

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(Date.UTC(y, m - 1, 1));
  try {
    return monthTitleFr.format(d);
  } catch {
    return ym;
  }
}

const poolCards = [
  {
    label: "PMQ",
    sub: "45 % membres",
    pct: "45 %",
    color: GOLD,
    border: `1px solid rgba(212, 160, 23, 0.45)`,
  },
  {
    label: "Production",
    sub: "20 %",
    pct: "20 %",
    color: ROUGE,
    border: `1px solid rgba(192, 57, 43, 0.45)`,
  },
  {
    label: "Fondation",
    sub: "10 %",
    pct: "10 %",
    color: VERT,
    border: `1px solid rgba(46, 204, 113, 0.45)`,
  },
  {
    label: "Opérations",
    sub: "25 %",
    pct: "25 %",
    color: GRIS_OPS,
    border: `1px solid rgba(127, 140, 141, 0.45)`,
  },
] as const;

export default function TransparencePage(): JSX.Element {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [banque, setBanque] = useState<BanqueLeveRow | null>(null);
  const [history, setHistory] = useState<RedistributionMois[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadProfile = useCallback(async (activeSession: Session) => {
    const profileRes = await restJson<ProfileRow[]>(
      `profiles?id=eq.${encodeURIComponent(activeSession.user.id)}&select=display_name`,
      activeSession.access_token,
    );
    if (!profileRes.error && profileRes.data) {
      const rows = profileRes.data;
      setProfile((rows[0] ?? null) as ProfileRow | null);
    }
  }, []);

  const loadPublicData = useCallback(async () => {
    setLoadError(null);

    const bankRes = await fetch(
      `${SB}/rest/v1/banque_leve?select=id,total_revenue,ptc_balance,pmq_balance,pcol_balance,pa_balance,pool_operations&limit=1`,
      {
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          Accept: "application/json",
        },
      },
    );
    const bankJson = (await bankRes.json()) as unknown;
    if (!bankRes.ok) {
      const msg =
        bankJson &&
        typeof bankJson === "object" &&
        "message" in bankJson &&
        typeof (bankJson as { message: unknown }).message === "string"
          ? (bankJson as { message: string }).message
          : bankRes.statusText || "Erreur banque";
      setLoadError(msg);
      setBanque(null);
    } else {
      const arr = Array.isArray(bankJson) ? bankJson : [];
      setBanque((arr[0] ?? null) as BanqueLeveRow | null);
    }

    try {
      const histRes = await fetch("/api/redistribution/historique", {
        cache: "no-store",
      }).then(async (r) => {
        const j = (await r.json()) as {
          error?: string;
          history?: RedistributionMois[];
        };
        if (!r.ok) {
          throw new Error(j.error ?? "Historique indisponible");
        }
        return j.history ?? [];
      });
      setHistory(histRes);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError((prev) => prev ?? msg);
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void loadPublicData();
  }, [loadPublicData]);

  useEffect(() => {
    let cancelled = false;

    async function applyCookieSession(next: Session | null): Promise<void> {
      if (cancelled) return;
      setSession(next ?? null);
      setAuthChecked(true);
      if (next) {
        await loadProfile(next);
      } else {
        setProfile(null);
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
  }, [loadProfile]);

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

  const fonts = `${bebas.variable} ${dmSans.variable}`;

  const name = session ? displayNameFrom(profile, session) : null;

  const tr = Number(banque?.total_revenue ?? 0);
  const poolPtc = Number(banque?.ptc_balance ?? 0);
  const poolPcol = Number(banque?.pcol_balance ?? 0);
  const poolPa = Number(banque?.pa_balance ?? 0);
  const poolOps = Number(banque?.pool_operations ?? 0);

  return (
    <div
      className={fonts}
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT,
        fontFamily: "var(--font-dm), system-ui, sans-serif",
        paddingBottom: "6rem",
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .leve-pool-grid {
              display: grid;
              grid-template-columns: 1fr;
              gap: 0.75rem;
            }
            @media (min-width: 720px) {
              .leve-pool-grid {
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 1rem;
              }
            }
          `,
        }}
      />

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
          href={session ? "/dashboard" : "/"}
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {!authChecked ? (
            <span style={{ fontSize: "0.8rem", opacity: 0.45 }}>…</span>
          ) : session && name ? (
            <>
              <span
                style={{
                  fontSize: "0.9rem",
                  opacity: 0.85,
                  maxWidth: "42vw",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {name}
              </span>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void handleSignOut()}
                style={{
                  background: "transparent",
                  color: ROUGE,
                  border: `1px solid ${ROUGE}`,
                  borderRadius: "6px",
                  padding: "0.45rem 0.9rem",
                  fontSize: "0.8rem",
                  cursor: signingOut ? "wait" : "pointer",
                }}
              >
                {signingOut ? "…" : "Déconnexion"}
              </button>
            </>
          ) : (
            <Link
              href="/"
              style={{
                fontSize: "0.85rem",
                color: GOLD,
                textDecoration: "none",
                opacity: 0.9,
              }}
            >
              Connexion
            </Link>
          )}
        </div>
      </header>

      <main style={{ maxWidth: "1024px", margin: "0 auto", padding: "1.25rem" }}>
        {loadError ? (
          <p
            role="alert"
            style={{
              color: ROUGE,
              fontSize: "0.9rem",
              marginBottom: "1rem",
            }}
          >
            {loadError}
          </p>
        ) : null}

        <section
          style={{
            marginBottom: "2rem",
            paddingBottom: "1.5rem",
            borderBottom: "1px solid rgba(245, 240, 232, 0.08)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.72rem",
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: ROUGE,
              fontWeight: 700,
            }}
          >
            Communauté
          </p>
          <h1
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "clamp(2.75rem, 10vw, 4.5rem)",
              letterSpacing: "0.18em",
              margin: "0.35rem 0 0.5rem",
              lineHeight: 1.02,
              color: TEXT,
            }}
          >
            TRANSPARENCE
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "1.05rem",
              opacity: 0.88,
              maxWidth: "28rem",
              lineHeight: 1.55,
            }}
          >
            Tous les chiffres, en temps réel
          </p>
        </section>

        <section style={{ marginBottom: "2.25rem" }}>
          <h2
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "1.2rem",
              letterSpacing: "0.14em",
              margin: "0 0 1rem",
              color: GOLD,
            }}
          >
            Répartition du revenu
          </h2>
          <div className="leve-pool-grid">
            {poolCards.map((c) => (
              <article
                key={c.label}
                style={{
                  borderRadius: "14px",
                  padding: "1.15rem 1rem",
                  background: "rgba(245, 240, 232, 0.03)",
                  border: c.border,
                  boxShadow: `0 8px 28px ${c.color}14`,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-bebas), Impact, sans-serif",
                    fontSize: "1.45rem",
                    letterSpacing: "0.08em",
                    color: c.color,
                  }}
                >
                  {c.label}
                </p>
                <p
                  style={{
                    margin: "0.35rem 0 0",
                    fontSize: "0.82rem",
                    opacity: 0.82,
                    lineHeight: 1.4,
                  }}
                >
                  {c.sub}
                </p>
                <p
                  style={{
                    margin: "0.75rem 0 0",
                    fontSize: "1.65rem",
                    fontWeight: 800,
                    color: TEXT,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {c.pct}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: "2.25rem" }}>
          <h2
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "1.2rem",
              letterSpacing: "0.14em",
              margin: "0 0 1rem",
              color: ROUGE,
            }}
          >
            Soldes banque LEVE
          </h2>
          {banque == null ? (
            <p style={{ opacity: 0.75, fontSize: "0.95rem" }}>
              Aucune donnée banque pour le moment.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "0.85rem",
              }}
            >
              <article
                style={{
                  gridColumn: "1 / -1",
                  borderRadius: "16px",
                  padding: "1.35rem 1.25rem",
                  background: `linear-gradient(125deg, rgba(212, 160, 23, 0.14) 0%, rgba(8,8,8,0.95) 55%, rgba(192, 57, 43, 0.08) 100%)`,
                  border: "1px solid rgba(245, 240, 232, 0.12)",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.72rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    opacity: 0.65,
                  }}
                >
                  Revenu total (référence)
                </p>
                <p
                  style={{
                    margin: "0.4rem 0 0",
                    fontSize: "clamp(1.75rem, 5vw, 2.35rem)",
                    fontWeight: 800,
                    color: GOLD,
                  }}
                >
                  {cad.format(Number.isFinite(tr) ? tr : 0)}
                </p>
              </article>
              {[
                { label: "Pool PTC", value: poolPtc, accent: GOLD },
                { label: "Pool production (PCOL)", value: poolPcol, accent: ROUGE },
                { label: "Pool fondation (PA)", value: poolPa, accent: VERT },
                { label: "Pool opérations", value: poolOps, accent: GRIS_OPS },
              ].map((row) => (
                <article
                  key={row.label}
                  style={{
                    borderRadius: "12px",
                    padding: "1.05rem",
                    background: "rgba(245, 240, 232, 0.04)",
                    border: `1px solid rgba(245, 240, 232, 0.1)`,
                    borderLeft: `3px solid ${row.accent}`,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.72rem",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      opacity: 0.6,
                    }}
                  >
                    {row.label}
                  </p>
                  <p
                    style={{
                      margin: "0.45rem 0 0",
                      fontSize: "1.25rem",
                      fontWeight: 700,
                    }}
                  >
                    {cad.format(Number.isFinite(row.value) ? row.value : 0)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "1.2rem",
              letterSpacing: "0.14em",
              margin: "0 0 1rem",
              color: TEXT,
            }}
          >
            Historique des redistributions
          </h2>
          <p
            style={{
              margin: "0 0 1.25rem",
              fontSize: "0.88rem",
              opacity: 0.72,
              lineHeight: 1.5,
              maxWidth: "40rem",
            }}
          >
            Revenu mensuel déduit du total PMQ redistribué (÷ 45 %). Valeur par
            point : montant par unité pondérée (points × multiplicateur) au
            moment de la redistribution.
          </p>

          {history.length === 0 ? (
            <p
              style={{
                opacity: 0.82,
                fontSize: "1.05rem",
                lineHeight: 1.55,
                padding: "1.35rem",
                borderRadius: "12px",
                border: "1px solid rgba(245, 240, 232, 0.1)",
                background: "rgba(245, 240, 232, 0.03)",
              }}
            >
              Première redistribution à venir
            </p>
          ) : (
            <div
              style={{
                borderRadius: "12px",
                border: "1px solid rgba(245, 240, 232, 0.1)",
                overflow: "hidden",
                background: "rgba(245, 240, 232, 0.03)",
              }}
            >
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.86rem",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid rgba(245, 240, 232, 0.12)",
                        background: "rgba(8, 8, 8, 0.55)",
                      }}
                    >
                      <th
                        style={{
                          padding: "0.8rem 1rem",
                          fontWeight: 600,
                          color: GOLD,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Mois
                      </th>
                      <th style={{ padding: "0.8rem 1rem", fontWeight: 600 }}>
                        Revenu total (estim.)
                      </th>
                      <th style={{ padding: "0.8rem 1rem", fontWeight: 600 }}>
                        Valeur / pt pondéré
                      </th>
                      <th
                        style={{
                          padding: "0.8rem 1rem",
                          fontWeight: 600,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Total redistribué
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr
                        key={row.month}
                        style={{
                          borderBottom: "1px solid rgba(245, 240, 232, 0.06)",
                        }}
                      >
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            textTransform: "capitalize",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatMonthLabel(row.month)}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          {cadCompact.format(row.total_revenue)}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          {row.value_per_point != null
                            ? cadCompact.format(row.value_per_point)
                            : "—"}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            textAlign: "right",
                            fontWeight: 700,
                            color: ROUGE,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {cadCompact.format(row.total_distributed)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>

      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "rgba(8, 8, 8, 0.97)",
          borderTop: "1px solid rgba(245, 240, 232, 0.1)",
          padding: "0.5rem 0.35rem calc(0.5rem + env(safe-area-inset-bottom))",
          zIndex: 30,
        }}
      >
        <div
          style={{
            display: "flex",
            overflowX: "auto",
            gap: "0.5rem",
            justifyContent: "flex-start",
            maxWidth: "1024px",
            margin: "0 auto",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
          }}
        >
          {navPages.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              style={{
                flex: "0 0 auto",
                fontSize: "0.68rem",
                color: p.href === "/transparence" ? GOLD : TEXT,
                opacity: p.href === "/transparence" ? 1 : 0.75,
                textDecoration: "none",
                padding: "0.35rem 0.5rem",
                whiteSpace: "nowrap",
              }}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

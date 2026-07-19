"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { AppBottomNav } from "../../components/app-bottom-nav";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";
import { checkJwtExpired } from "../../lib/supabase";

/** Aligné sur la réponse JSON de `/api/redistribution/historique` (lignes `redistribution_history`). */
type RedistributionMois = {
  month: string;
  total_revenue: number;
  value_per_point: number | null;
  /** Correspond au `pmq_pool` agrégé par mois. */
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
    if (await checkJwtExpired({ status: res.status, message: msg })) {
      return { data: null as T, error: null };
    }
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
  pmq_balance: number | string | null;
  production_balance: number | string | null;
  fondation_balance: number | string | null;
  operations_balance: number | string | null;
  ptc_balance: number | string | null;
  pcol_balance: number | string | null;
  pa_balance: number | string | null;
  frais_plateforme_balance: number | string | null;
  taxe_pa_balance: number | string | null;
};

type TransparenceConfigRow = {
  cle: string;
  label: string;
  visible: boolean;
  ordre: number;
};

type PtcStats = {
  ptc_balance: number;
  ptc_units: number;
  sources: {
    quiz_perdu: number;
    pending_expire: number;
    collab_perdu: number;
  };
};

/** Colonnes `banque_leve` contrôlées par `transparence_config.cle`. */
const BANQUE_BALANCE_COLUMN: Record<string, keyof BanqueLeveRow> = {
  pmq: "pmq_balance",
  production: "production_balance",
  fondation: "fondation_balance",
  operations: "operations_balance",
  ptc: "ptc_balance",
  pcol: "pcol_balance",
  pa: "pa_balance",
  frais_plateforme: "frais_plateforme_balance",
  taxe_pa: "taxe_pa_balance",
  frais_plateforme_balance: "frais_plateforme_balance",
  taxe_pa_balance: "taxe_pa_balance",
  pmq_balance: "pmq_balance",
  production_balance: "production_balance",
  fondation_balance: "fondation_balance",
  operations_balance: "operations_balance",
  ptc_balance: "ptc_balance",
  pcol_balance: "pcol_balance",
  pa_balance: "pa_balance",
};

const FRAIS_CONFIG_CLES = new Set([
  "frais_plateforme_balance",
  "taxe_pa_balance",
  "frais_plateforme",
  "taxe_pa",
]);

const FRAIS_LABEL_BY_CLE: Record<string, string> = {
  frais_plateforme_balance: "Frais plateforme collectés (5-8%)",
  frais_plateforme: "Frais plateforme collectés (5-8%)",
  taxe_pa_balance: "Taxe 2% PA — communauté (75%)",
  taxe_pa: "Taxe 2% PA — communauté (75%)",
};

const BANQUE_POOL_ACCENT: Record<string, string> = {
  pmq: GOLD,
  production: ROUGE,
  fondation: VERT,
  operations: GRIS_OPS,
  ptc: GOLD,
  pcol: ROUGE,
  pa: VERT,
  frais_plateforme: GOLD,
  taxe_pa: VERT,
  frais_plateforme_balance: GOLD,
  taxe_pa_balance: VERT,
};

const DEFAULT_TRANSPARENCE_CONFIG: TransparenceConfigRow[] = [
  { cle: "pmq", label: "PMQ — Pool Mensuelle Quiz", visible: true, ordre: 1 },
  {
    cle: "production",
    label: "Production — Équipe fondatrice (20%)",
    visible: true,
    ordre: 2,
  },
  { cle: "fondation", label: "Fondation LEVE (10%)", visible: true, ordre: 3 },
  {
    cle: "operations",
    label: "Opérations — LEVE MÉDIA INC. (25%)",
    visible: true,
    ordre: 4,
  },
  { cle: "ptc", label: "PTC — Pool de Croissance", visible: true, ordre: 5 },
  { cle: "pcol", label: "PCOL — Pool Collaborateur", visible: true, ordre: 6 },
  { cle: "pa", label: "PA — Pool Activités", visible: true, ordre: 7 },
  {
    cle: "frais_plateforme_balance",
    label: "Frais plateforme collectés (5-8%)",
    visible: true,
    ordre: 8,
  },
  {
    cle: "taxe_pa_balance",
    label: "Taxe 2% PA — communauté (75%)",
    visible: true,
    ordre: 9,
  },
];

function poolAccentForCle(cle: string): string {
  return BANQUE_POOL_ACCENT[cle] ?? TEXT;
}

function isFraisCle(cle: string): boolean {
  return FRAIS_CONFIG_CLES.has(cle);
}

function sectionForCle(cle: string): "banque" | "frais" {
  return isFraisCle(cle) ? "frais" : "banque";
}

function labelForCle(cle: string, fallback: string): string {
  return FRAIS_LABEL_BY_CLE[cle] ?? fallback;
}

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

const cad = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
});

const cadCompact = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});

function formatMonthLabel(ym: string): string {
  const key = /^(\d{4})-(\d{2})/.exec(ym.trim());
  const year = key ? Number(key[1]) : NaN;
  const month = key ? Number(key[2]) : NaN;
  if (!year || !month) return ym;
  // Composantes locales (pas UTC) : "2026-06-01" → juin, pas mai en fuseau EST.
  return new Date(year, month - 1, 1).toLocaleDateString("fr-CA", {
    month: "long",
    year: "numeric",
  });
}

const PTC_UNIT_DOLLARS = 5;

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
  const [transparenceConfig, setTransparenceConfig] = useState<
    TransparenceConfigRow[]
  >(DEFAULT_TRANSPARENCE_CONFIG);
  const [history, setHistory] = useState<RedistributionMois[]>([]);
  const [ptcStats, setPtcStats] = useState<PtcStats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

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
      `${SB}/rest/v1/banque_leve?select=id,total_revenue,pmq_balance,production_balance,fondation_balance,operations_balance,ptc_balance,pcol_balance,pa_balance,frais_plateforme_balance,taxe_pa_balance&limit=1`,
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

    const configRes = await fetch(
      `${SB}/rest/v1/transparence_config?select=cle,label,visible,ordre&order=ordre.asc`,
      {
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          Accept: "application/json",
        },
      },
    );
    const configJson = (await configRes.json()) as unknown;
    if (!configRes.ok) {
      setTransparenceConfig(DEFAULT_TRANSPARENCE_CONFIG);
    } else {
      const rows = Array.isArray(configJson) ? configJson : [];
      setTransparenceConfig(
        rows.filter(
          (row): row is TransparenceConfigRow =>
            row != null &&
            typeof row === "object" &&
            typeof (row as TransparenceConfigRow).cle === "string" &&
            typeof (row as TransparenceConfigRow).visible === "boolean",
        ),
      );
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

    try {
      const ptcRes = await fetch("/api/ptc/stats", { cache: "no-store" });
      const ptcJson = (await ptcRes.json()) as PtcStats & { error?: string };
      if (!ptcRes.ok) {
        throw new Error(ptcJson.error ?? "Stats PTC indisponibles");
      }
      setPtcStats(ptcJson);
    } catch {
      setPtcStats(null);
    }
    setDataLoaded(true);
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

  if (!dataLoaded) {
    return (
      <div style={{ background: "#080808", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(212,160,23,0.4)" }}>
          Chargement...
        </p>
      </div>
    );
  }

  const name = session ? displayNameFrom(profile, session) : null;

  const tr = Number(banque?.total_revenue ?? 0);

  type BalanceRow = {
    cle: string;
    label: string;
    value: number;
    accent: string;
    section: "banque" | "frais";
  };

  const balanceRows: BalanceRow[] = transparenceConfig
    .filter((cfg) => cfg.visible)
    .flatMap((cfg) => {
      const column = BANQUE_BALANCE_COLUMN[cfg.cle];
      if (!column || banque == null) return [];
      const raw = banque[column];
      const value = Number(raw ?? 0);
      return [
        {
          cle: cfg.cle,
          label: labelForCle(cfg.cle, cfg.label),
          value,
          accent: poolAccentForCle(cfg.cle),
          section: sectionForCle(cfg.cle),
        },
      ];
    });

  const banquePoolRows = balanceRows.filter((row) => row.section === "banque");
  const fraisPoolRows = balanceRows.filter((row) => row.section === "frais");

  const showBanqueSection = banquePoolRows.length > 0;
  const showFraisSection = transparenceConfig.some(
    (cfg) => isFraisCle(cfg.cle) && cfg.visible,
  );

  return (
    <div
      className={fonts}
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT,
        fontFamily: "var(--font-mono), ui-monospace, monospace",
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
            .leve-transparence-section-title {
              font-size: clamp(1rem, 4vw, 1.8rem);
            }
            .leve-transparence-stat-label {
              font-size: max(12px, 0.72rem);
            }
            .leve-transparence-filter-btn {
              min-height: 44px;
            }
            .leve-transparence-history-cards {
              display: none;
              flex-direction: column;
              gap: 0.65rem;
            }
            .leve-transparence-history-card {
              border-radius: 4px;
              padding: 1rem;
              background: rgba(245, 240, 232, 0.04);
              border: 1px solid rgba(245, 240, 232, 0.1);
            }
            .leve-transparence-history-card-month {
              margin: 0 0 0.65rem;
              font-weight: 600;
              color: ${GOLD};
              text-transform: capitalize;
              font-size: max(12px, 0.9rem);
            }
            .leve-transparence-history-card-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 0.5rem 0.75rem;
              font-size: max(12px, 0.82rem);
            }
            .leve-transparence-history-card-grid dt {
              margin: 0;
              opacity: 0.62;
              font-size: max(12px, 0.72rem);
              letter-spacing: 0.06em;
              text-transform: uppercase;
            }
            .leve-transparence-history-card-grid dd {
              margin: 0.15rem 0 0;
              font-weight: 600;
            }
            .leve-transparence-history-card-pmq {
              color: ${ROUGE};
            }
            @media (max-width: 479px) {
              .leve-transparence-history-table-wrap {
                display: none !important;
              }
              .leve-transparence-history-cards {
                display: flex !important;
              }
            }
            @media (min-width: 480px) {
              .leve-transparence-history-cards {
                display: none !important;
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
                  borderRadius: "4px",
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
            className="leve-transparence-section-title"
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
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
                  borderRadius: "4px",
                  padding: "1.15rem 1rem",
                  background: "#141414",
                  border: "1px solid rgba(245, 240, 232, 0.06)",
                  borderTop: `2px solid ${c.color}`,
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
                    color: c.color,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {c.pct}
                </p>
              </article>
            ))}
          </div>
        </section>

        {showBanqueSection ? (
          <section style={{ marginBottom: "2.25rem" }}>
            <h2
              className="leve-transparence-section-title"
              style={{
                fontFamily: "var(--font-bebas), Impact, sans-serif",
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
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
              >
                <article
                  style={{
                    gridColumn: "1 / -1",
                    borderRadius: "4px",
                    padding: "1.35rem 1.25rem",
                    background: `linear-gradient(125deg, rgba(212, 160, 23, 0.14) 0%, rgba(8,8,8,0.95) 55%, rgba(192, 57, 43, 0.08) 100%)`,
                    border: "1px solid rgba(245, 240, 232, 0.12)",
                  }}
                >
                  <p
                    className="leve-transparence-stat-label"
                    style={{
                      margin: 0,
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
                {banquePoolRows.map((row) => {
                  if (row.cle === "ptc") {
                    const ptcDollars =
                      ptcStats?.ptc_balance ??
                      (Number.isFinite(row.value) ? row.value : 0);
                    const ptcUnits =
                      ptcStats?.ptc_units ??
                      Math.round((ptcDollars / PTC_UNIT_DOLLARS) * 100) / 100;
                    const sources = ptcStats?.sources ?? {
                      quiz_perdu: 0,
                      pending_expire: 0,
                      collab_perdu: 0,
                    };

                    return (
                      <article
                        key={row.cle}
                        style={{
                          gridColumn: "1 / -1",
                          borderRadius: "4px",
                          padding: "1.25rem",
                          background: "rgba(212, 160, 23, 0.06)",
                          border: `1px solid rgba(212, 160, 23, 0.35)`,
                          borderLeft: `3px solid ${row.accent}`,
                        }}
                      >
                        <p
                          className="leve-transparence-stat-label"
                          style={{
                            margin: 0,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            opacity: 0.6,
                          }}
                        >
                          PTC — Pool de Croissance
                        </p>
                        <p
                          style={{
                            margin: "0.45rem 0 0",
                            fontSize: "1.45rem",
                            fontWeight: 700,
                            color: GOLD,
                          }}
                        >
                          {cad.format(ptcDollars)}
                        </p>
                        <p
                          style={{
                            margin: "0.35rem 0 0",
                            fontSize: "0.92rem",
                            opacity: 0.78,
                          }}
                        >
                          Équivalent : {ptcUnits.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} PTC générés
                        </p>
                        <div
                          className="leve-transparence-stat-label"
                          style={{
                            marginTop: "0.85rem",
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                            gap: "0.65rem",
                            fontSize: "max(12px, 0.82rem)",
                            opacity: 0.85,
                          }}
                        >
                          <span>
                            Points perdus quiz · {cad.format(sources.quiz_perdu)}
                          </span>
                          <span>
                            Pending expiré · {cad.format(sources.pending_expire)}
                          </span>
                          <span>
                            % collab perdu · {cad.format(sources.collab_perdu)}
                          </span>
                        </div>
                      </article>
                    );
                  }

                  return (
                  <article
                    key={row.cle}
                    style={{
                      borderRadius: "4px",
                      padding: "1.05rem",
                      background: "rgba(245, 240, 232, 0.04)",
                      border: `1px solid rgba(245, 240, 232, 0.1)`,
                      borderLeft: `3px solid ${row.accent}`,
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                  >
                    <p
                      className="leve-transparence-stat-label"
                      style={{
                        margin: 0,
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
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {showFraisSection ? (
          <section style={{ marginBottom: "2.25rem" }}>
            <h2
              className="leve-transparence-section-title"
              style={{
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                letterSpacing: "0.14em",
                margin: "0 0 1rem",
                color: GOLD,
              }}
            >
              Frais plateforme
            </h2>
            {banque == null ? (
              <p style={{ opacity: 0.75, fontSize: "0.95rem" }}>
                Aucune donnée pour le moment.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "0.85rem",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
              >
                {fraisPoolRows.map((row) => (
                  <article
                    key={row.cle}
                    style={{
                      borderRadius: "4px",
                      padding: "1.05rem",
                      background: "rgba(245, 240, 232, 0.04)",
                      border: `1px solid rgba(245, 240, 232, 0.1)`,
                      borderLeft: `3px solid ${row.accent}`,
                    }}
                  >
                    <p
                      className="leve-transparence-stat-label"
                      style={{
                        margin: 0,
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
        ) : null}

        <section>
          <h2
            className="leve-transparence-section-title"
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
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
            Revenu mensuel et valeur par point tels qu’enregistrés à la
            redistribution. Total redistribué : pool PMQ du mois.
          </p>

          {history.length === 0 ? (
            <p
              style={{
                opacity: 0.82,
                fontSize: "1.05rem",
                lineHeight: 1.55,
                padding: "1.35rem",
                borderRadius: "4px",
                border: "1px solid rgba(245, 240, 232, 0.1)",
                background: "rgba(245, 240, 232, 0.03)",
              }}
            >
              Première redistribution à venir
            </p>
          ) : (
            <div
              style={{
                borderRadius: "4px",
                border: "1px solid rgba(245, 240, 232, 0.1)",
                overflow: "hidden",
                background: "rgba(245, 240, 232, 0.03)",
              }}
            >
              <div
                className="leve-transparence-history-table-wrap"
                style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
              >
                <table
                  style={{
                    width: "100%",
                    minWidth: "520px",
                    borderCollapse: "collapse",
                    fontSize: "max(12px, 0.86rem)",
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
              <div className="leve-transparence-history-cards">
                {history.map((row) => (
                  <article
                    key={row.month}
                    className="leve-transparence-history-card"
                  >
                    <p className="leve-transparence-history-card-month">
                      {formatMonthLabel(row.month)}
                    </p>
                    <dl className="leve-transparence-history-card-grid">
                      <div>
                        <dt>Revenu</dt>
                        <dd>{cadCompact.format(row.total_revenue)}</dd>
                      </div>
                      <div>
                        <dt>PMQ</dt>
                        <dd className="leve-transparence-history-card-pmq">
                          {cadCompact.format(row.total_distributed)}
                        </dd>
                      </div>
                      <div>
                        <dt>Valeur / pt</dt>
                        <dd>
                          {row.value_per_point != null
                            ? cadCompact.format(row.value_per_point)
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      <AppBottomNav session={session} />
    </div>
  );
}

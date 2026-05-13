"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";

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
    return { data: null as T, error: msg };
  }
  return { data: json as T, error: null };
}

/** Indicatif jusqu’à redistribution réelle (aligné API /api/membre/solde). */
const CAD_PER_POINT = 0.1;
const MIN_TRANSFER_CAD = 100;

type ProfileRow = {
  display_name: string | null;
};

type PointsTxRow = {
  id: string;
  created_at: string;
  amount: number | string | null;
  type: string | null;
  metadata: Record<string, unknown> | null;
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

function transactionDescription(
  type: string | null | undefined,
  metadata: Record<string, unknown> | null,
): string {
  const t = (type ?? "").toLowerCase();
  if (t === "redistribution") {
    const month =
      typeof metadata?.month === "string" ? metadata.month : null;
    return month
      ? `Redistribution PMQ — ${month}`
      : "Redistribution PMQ";
  }
  if (
    t === "code" ||
    t === "video_code" ||
    t === "code_secret" ||
    t === "fragment"
  ) {
    const title =
      typeof metadata?.video_title === "string"
        ? metadata.video_title
        : typeof metadata?.title === "string"
          ? metadata.title
          : null;
    return title ? `Code vidéo — ${title}` : "Points code vidéo";
  }
  if (t === "quiz" || t === "quiz_bonus") {
    return "Bonus quiz";
  }
  if (t === "adjustment" || t === "manual") {
    return "Ajustement solde";
  }
  if (type?.trim()) {
    return type.replace(/_/g, " ");
  }
  return "Transaction";
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

const pointsFmt = new Intl.NumberFormat("fr-CA", {
  maximumFractionDigits: 2,
});

const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function BanquePage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);
  const [transactions, setTransactions] = useState<PointsTxRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadBanque = useCallback(async (activeSession: Session) => {
    const token = activeSession.access_token;
    const uid = activeSession.user.id;

    const [profileRes, sumRes, listRes] = await Promise.all([
      restJson<ProfileRow[]>(
        `profiles?id=eq.${encodeURIComponent(uid)}&select=display_name`,
        token,
      ),
      restJson<{ amount?: unknown }[]>(
        `points_transactions?membre_id=eq.${encodeURIComponent(uid)}&select=amount`,
        token,
      ),
      restJson<PointsTxRow[]>(
        `points_transactions?membre_id=eq.${encodeURIComponent(uid)}&select=id,created_at,amount,type,metadata&order=created_at.desc&limit=20`,
        token,
      ),
    ]);

    const errMsg =
      profileRes.error ?? sumRes.error ?? listRes.error ?? null;
    setLoadError(errMsg);

    if (!profileRes.error) {
      const rows = profileRes.data ?? [];
      setProfile((rows[0] ?? null) as ProfileRow | null);
    }

    if (sumRes.error) {
      setTotalPoints(0);
    } else {
      const rows = sumRes.data ?? [];
      const sum = rows.reduce(
        (acc, row) => acc + Number(row.amount ?? 0),
        0,
      );
      setTotalPoints(sum);
    }

    if (listRes.error) {
      setTransactions([]);
    } else {
      setTransactions((listRes.data ?? []) as PointsTxRow[]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function applyCookieSession(next: Session | null): Promise<void> {
      if (cancelled) return;
      if (!next) {
        setSession(null);
        router.replace("/");
        return;
      }
      setSession(next);
      await loadBanque(next);
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
  }, [loadBanque, router]);

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
  const estimatedCad = totalPoints * CAD_PER_POINT;
  const canTransfer = estimatedCad >= MIN_TRANSFER_CAD;

  if (session === undefined) {
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

  const name = displayNameFrom(profile, session);

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
          href="/"
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
        </div>
      </header>

      <main style={{ maxWidth: "960px", margin: "0 auto", padding: "1.25rem" }}>
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

        <h1
          style={{
            fontFamily: "var(--font-bebas), Impact, sans-serif",
            fontSize: "clamp(2.5rem, 8vw, 3.5rem)",
            letterSpacing: "0.14em",
            margin: "0 0 1.25rem",
            lineHeight: 1.05,
            color: TEXT,
          }}
        >
          MA BANQUE
        </h1>

        <section
          style={{
            borderRadius: "16px",
            padding: "1.5rem 1.35rem",
            marginBottom: "1.5rem",
            background: `linear-gradient(135deg, ${GOLD} 0%, #a67f12 55%, #7a5e0d 100%)`,
            border: "1px solid rgba(245, 240, 232, 0.25)",
            boxShadow: "0 12px 40px rgba(212, 160, 23, 0.15)",
            color: BG,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.72rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 700,
              opacity: 0.85,
            }}
          >
            Solde points PMQ
          </p>
          <p
            style={{
              margin: "0.35rem 0 0.15rem",
              fontSize: "clamp(2.25rem, 7vw, 3rem)",
              fontWeight: 800,
              fontFamily: "var(--font-dm), system-ui, sans-serif",
              letterSpacing: "-0.02em",
            }}
          >
            {pointsFmt.format(totalPoints)} pts
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "1.05rem",
              fontWeight: 600,
              opacity: 0.92,
            }}
          >
            Valeur estimée : {cad.format(estimatedCad)}
          </p>
          <p
            style={{
              margin: "0.65rem 0 0",
              fontSize: "0.78rem",
              opacity: 0.8,
              lineHeight: 1.45,
            }}
          >
            Estimation indicative (× {CAD_PER_POINT.toFixed(2)} $ / pt) — le montant
            réel suit les redistributions officielles.
          </p>
        </section>

        <div style={{ marginBottom: "2rem" }}>
          <button
            type="button"
            disabled={!canTransfer}
            style={{
              width: "100%",
              maxWidth: "420px",
              padding: "0.85rem 1.25rem",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "0.95rem",
              letterSpacing: "0.04em",
              border: `2px solid ${canTransfer ? ROUGE : "rgba(245, 240, 232, 0.2)"}`,
              background: canTransfer ? ROUGE : "rgba(245, 240, 232, 0.06)",
              color: canTransfer ? TEXT : "rgba(245, 240, 232, 0.45)",
              cursor: canTransfer ? "pointer" : "not-allowed",
            }}
          >
            Transférer vers mon compte
          </button>
          {!canTransfer ? (
            <p
              style={{
                margin: "0.5rem 0 0",
                fontSize: "0.82rem",
                color: ROUGE,
                opacity: 0.95,
              }}
            >
              Minimum $100 requis
              <span style={{ display: "block", marginTop: "0.25rem", opacity: 0.85 }}>
                Solde estimé : {cad.format(estimatedCad)}
              </span>
            </p>
          ) : null}
        </div>

        <section>
          <h2
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "1.35rem",
              letterSpacing: "0.1em",
              margin: "0 0 0.85rem",
              color: TEXT,
            }}
          >
            Historique
          </h2>

          {transactions.length === 0 ? (
            <p
              style={{
                opacity: 0.78,
                fontSize: "1rem",
                lineHeight: 1.55,
                padding: "1.25rem",
                borderRadius: "12px",
                border: "1px solid rgba(245, 240, 232, 0.1)",
                background: "rgba(245, 240, 232, 0.03)",
              }}
            >
              Aucune transaction pour le moment. Soumets ton premier code!
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
                    fontSize: "0.88rem",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid rgba(245, 240, 232, 0.12)",
                        background: "rgba(8, 8, 8, 0.5)",
                      }}
                    >
                      <th
                        style={{
                          padding: "0.75rem 1rem",
                          fontWeight: 600,
                          color: GOLD,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Date
                      </th>
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>
                        Description
                      </th>
                      <th
                        style={{
                          padding: "0.75rem 1rem",
                          fontWeight: 600,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Points
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((row) => {
                      const amt = Number(row.amount ?? 0);
                      const signed =
                        amt > 0
                          ? `+${pointsFmt.format(amt)}`
                          : pointsFmt.format(amt);
                      const color =
                        amt >= 0 ? GOLD : ROUGE;
                      let dateLabel = "—";
                      try {
                        dateLabel = dateFmt.format(new Date(row.created_at));
                      } catch {
                        dateLabel = row.created_at;
                      }
                      return (
                        <tr
                          key={row.id}
                          style={{
                            borderBottom:
                              "1px solid rgba(245, 240, 232, 0.06)",
                          }}
                        >
                          <td
                            style={{
                              padding: "0.7rem 1rem",
                              whiteSpace: "nowrap",
                              opacity: 0.9,
                            }}
                          >
                            {dateLabel}
                          </td>
                          <td style={{ padding: "0.7rem 1rem", maxWidth: "360px" }}>
                            {transactionDescription(row.type, row.metadata)}
                          </td>
                          <td
                            style={{
                              padding: "0.7rem 1rem",
                              textAlign: "right",
                              fontWeight: 700,
                              color,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {signed}
                          </td>
                        </tr>
                      );
                    })}
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
            maxWidth: "960px",
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
                color: p.href === "/banque" ? GOLD : TEXT,
                opacity: p.href === "/banque" ? 1 : 0.75,
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

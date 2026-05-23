"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { APP_BOTTOM_NAV_LINKS as navPages } from "../../lib/appBottomNavLinks";
import { formatQuizTransactionLines } from "../../lib/quizTransactionDisplay";
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

/** Client Supabase anon + JWT membre (RLS sur banque_membres, points_transactions, etc.). */
function createAuthedSupabase(accessToken: string): SupabaseClient {
  return createClient(SB, KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const MIN_TRANSFER_CAD = 100;
const PMQ_POINT_TYPES = ["quiz"] as const;

type ProfileRow = {
  display_name: string | null;
  multiplier: number | string | null;
};

type PointsTxRow = {
  id: string;
  created_at: string;
  amount: number | string | null;
  type: string | null;
  description: string | null;
};

type BanqueMembreRow = {
  solde_dollars: number | string | null;
};

type BanqueMouvementRow = {
  id: string;
  created_at: string;
  montant: number | string | null;
  type: string | null;
  description: string | null;
};

type HistoryRow =
  | {
      id: string;
      created_at: string;
      kind: "points";
      amount: number;
      type: string | null;
      description: string | null;
    }
  | { id: string; created_at: string; kind: "dollars"; amount: number; description: string };

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

function transactionDescription(type: string | null | undefined): string {
  const t = (type ?? "").toLowerCase();
  if (t === "redistribution") {
    return "Redistribution PMQ";
  }
  if (
    t === "code" ||
    t === "video_code" ||
    t === "code_secret" ||
    t === "fragment"
  ) {
    return "Points code vidéo";
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
  const [profileMultiplier, setProfileMultiplier] = useState(1);
  const [soldeDollars, setSoldeDollars] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadBanque = useCallback(async (activeSession: Session) => {
    const uid = activeSession.user.id;
    const sb = createAuthedSupabase(activeSession.access_token);

    const [profileRes, banqueRes, sumRes, pointsListRes, mouvementsRes] =
      await Promise.all([
        sb
          .from("profiles")
          .select("display_name, multiplier")
          .eq("id", uid)
          .maybeSingle(),
        sb
          .from("banque_membres")
          .select("solde_dollars")
          .eq("membre_id", uid)
          .maybeSingle(),
        sb
          .from("points_transactions")
          .select("amount")
          .eq("membre_id", uid)
          .in("type", [...PMQ_POINT_TYPES]),
        sb
          .from("points_transactions")
          .select("id, created_at, amount, type, description")
          .eq("membre_id", uid)
          .in("type", [...PMQ_POINT_TYPES])
          .order("created_at", { ascending: false })
          .limit(20),
        sb
          .from("banque_membres_mouvements")
          .select("id, created_at, montant, type, description")
          .eq("membre_id", uid)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    const errMsg =
      profileRes.error?.message ??
      banqueRes.error?.message ??
      sumRes.error?.message ??
      pointsListRes.error?.message ??
      mouvementsRes.error?.message ??
      null;
    setLoadError(errMsg);

    if (!profileRes.error) {
      const prof = (profileRes.data ?? null) as ProfileRow | null;
      setProfile(prof);
      const m = Number(prof?.multiplier ?? 1);
      setProfileMultiplier(Number.isFinite(m) && m > 0 ? m : 1);
    }

    if (banqueRes.error) {
      setSoldeDollars(0);
    } else {
      setSoldeDollars(Number((banqueRes.data as BanqueMembreRow | null)?.solde_dollars ?? 0));
    }

    if (sumRes.error) {
      setTotalPoints(0);
    } else {
      const sum = (sumRes.data ?? []).reduce(
        (acc, row) => acc + Number(row.amount ?? 0),
        0,
      );
      setTotalPoints(sum);
    }

    const merged: HistoryRow[] = [];
    if (!pointsListRes.error) {
      for (const row of (pointsListRes.data ?? []) as PointsTxRow[]) {
        merged.push({
          id: `pt-${row.id}`,
          created_at: row.created_at,
          kind: "points",
          amount: Number(row.amount ?? 0),
          type: row.type,
          description: row.description ?? null,
        });
      }
    }
    if (!mouvementsRes.error) {
      for (const row of (mouvementsRes.data ?? []) as BanqueMouvementRow[]) {
        merged.push({
          id: `bm-${row.id}`,
          created_at: row.created_at,
          kind: "dollars",
          amount: Number(row.montant ?? 0),
          description:
            row.description?.trim() ||
            (row.type === "redistribution"
              ? "Redistribution PMQ"
              : row.type?.replace(/_/g, " ") || "Crédit banque"),
        });
      }
    }
    merged.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    setHistory(merged.slice(0, 20));
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
  const canTransfer = soldeDollars >= MIN_TRANSFER_CAD;
  const progressPct = Math.min(
    100,
    Math.max(0, (soldeDollars / MIN_TRANSFER_CAD) * 100),
  );

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
  const weightedPointsPmq = totalPoints * profileMultiplier;

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
            marginBottom: "1rem",
            background: `linear-gradient(135deg, ${ROUGE} 0%, #8b291f 55%, #5c1a14 100%)`,
            border: "1px solid rgba(245, 240, 232, 0.2)",
            boxShadow: "0 12px 40px rgba(192, 57, 43, 0.12)",
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
            Solde Banque ($)
          </p>
          <p
            style={{
              margin: "0.35rem 0 0.15rem",
              fontSize: "clamp(2.25rem, 7vw, 3rem)",
              fontWeight: 800,
              fontFamily: "var(--font-dm), system-ui, sans-serif",
              letterSpacing: "-0.02em",
              color: GOLD,
            }}
          >
            {cad.format(soldeDollars)}
          </p>
          <p
            style={{
              margin: "0.85rem 0 0.35rem",
              fontSize: "0.78rem",
              opacity: 0.75,
            }}
          >
            Seuil de retrait : {cad.format(MIN_TRANSFER_CAD)}
          </p>
          <div
            style={{
              height: "8px",
              borderRadius: "999px",
              background: "rgba(245, 240, 232, 0.12)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPct}%`,
                borderRadius: "999px",
                background: canTransfer ? GOLD : ROUGE,
                transition: "width 0.35s ease",
              }}
            />
          </div>
          <p
            style={{
              margin: "0.45rem 0 0",
              fontSize: "0.78rem",
              opacity: 0.7,
            }}
          >
            {canTransfer
              ? "Seuil atteint — transfert disponible"
              : `${progressPct.toFixed(0)} % vers le seuil de ${cad.format(MIN_TRANSFER_CAD)}`}
          </p>
        </section>

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
            Points PMQ
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
              margin: "0.55rem 0 0",
              fontSize: "0.68rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              opacity: 0.65,
            }}
          >
            Points pondérés (base redistribution)
          </p>
          <p
            style={{
              margin: "0.2rem 0 0",
              fontSize: "1.05rem",
              fontWeight: 700,
              opacity: 0.85,
            }}
          >
            {pointsFmt.format(weightedPointsPmq)} pts
          </p>
          <p
            style={{
              margin: "0.3rem 0 0",
              fontSize: "0.72rem",
              opacity: 0.65,
              lineHeight: 1.4,
            }}
          >
            Vos points × multiplicateur ×{profileMultiplier.toFixed(1)} —
            utilisé pour calculer votre part de redistribution
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
              Minimum {cad.format(MIN_TRANSFER_CAD)} requis
              <span style={{ display: "block", marginTop: "0.25rem", opacity: 0.85 }}>
                Solde banque : {cad.format(soldeDollars)}
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

          {history.length === 0 ? (
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
                        Montant
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => {
                      const amt = row.amount;
                      const isDollars = row.kind === "dollars";
                      const signed = isDollars
                        ? amt > 0
                          ? `+${cad.format(amt)}`
                          : cad.format(amt)
                        : amt > 0
                          ? `+${pointsFmt.format(amt)} pts`
                          : `${pointsFmt.format(amt)} pts`;
                      const color = amt >= 0 ? GOLD : ROUGE;
                      const isQuizPoints =
                        !isDollars &&
                        (row.type ?? "").toLowerCase() === "quiz";
                      const quizLines = isQuizPoints
                        ? formatQuizTransactionLines(
                            row.amount,
                            row.description,
                            profileMultiplier,
                          )
                        : null;
                      const label = isDollars
                        ? row.description
                        : transactionDescription(row.type);
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
                            {quizLines ? (
                              <>
                                <span style={{ display: "block" }}>{quizLines.line1}</span>
                                <span
                                  style={{
                                    display: "block",
                                    marginTop: "0.25rem",
                                    fontSize: "0.85rem",
                                    opacity: 0.8,
                                  }}
                                >
                                  {quizLines.line2}
                                </span>
                              </>
                            ) : (
                              label
                            )}
                            <span
                              style={{
                                display: "block",
                                marginTop: "0.2rem",
                                fontSize: "0.72rem",
                                opacity: 0.55,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                              }}
                            >
                              {isDollars ? "Banque $" : "Points PMQ"}
                            </span>
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

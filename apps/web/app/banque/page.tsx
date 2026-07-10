"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { AppBottomNav } from "../../components/app-bottom-nav";
import { formatQuizTransactionLines } from "../../lib/quizTransactionDisplay";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";
import { checkJwtExpired } from "../../lib/supabase";

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
const G2 = "#141414";

function currentMonthDate(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function formatPmqPtValue(v: number): string {
  return `~$${v.toFixed(4)}/pt · Mois en cours`;
}

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
  member_type: string | null;
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
  const [pmqValuePerPoint, setPmqValuePerPoint] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [retraitOpen, setRetraitOpen] = useState(false);
  const [retraitPreview, setRetraitPreview] = useState<{
    montant: number;
    pourcentage: number;
    frais: number;
    montant_net: number;
    actif: boolean;
  } | null>(null);
  const [retraitLoading, setRetraitLoading] = useState(false);
  const [retraitSubmitting, setRetraitSubmitting] = useState(false);
  const [retraitError, setRetraitError] = useState<string | null>(null);
  const [retraitSuccess, setRetraitSuccess] = useState<string | null>(null);

  const loadBanque = useCallback(async (activeSession: Session) => {
    const uid = activeSession.user.id;
    const sb = createAuthedSupabase(activeSession.access_token);

    const [profileRes, banqueRes, sumRes, pointsListRes, mouvementsRes, redistRes] =
      await Promise.all([
        sb
          .from("profiles")
          .select("display_name, member_type, multiplier")
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
        sb
          .from("redistribution_history")
          .select("value_per_point")
          .eq("month", currentMonthDate())
          .maybeSingle(),
      ]);

    const errMsg =
      profileRes.error?.message ??
      banqueRes.error?.message ??
      sumRes.error?.message ??
      pointsListRes.error?.message ??
      mouvementsRes.error?.message ??
      null;
    if (errMsg && (await checkJwtExpired({ message: errMsg }))) {
      return;
    }
    setLoadError(errMsg);

    if (redistRes.error) {
      setPmqValuePerPoint(null);
    } else {
      const raw = (redistRes.data as { value_per_point?: unknown } | null)
        ?.value_per_point;
      const n =
        raw != null && raw !== "" ? Number(raw) : Number.NaN;
      setPmqValuePerPoint(Number.isFinite(n) ? n : null);
    }

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

  async function openRetraitConfirm(): Promise<void> {
    if (!session || soldeDollars < MIN_TRANSFER_CAD) return;
    setRetraitOpen(true);
    setRetraitError(null);
    setRetraitSuccess(null);
    setRetraitPreview(null);
    setRetraitLoading(true);

    try {
      const res = await fetch(
        `/api/frais-plateforme?montant=${encodeURIComponent(String(soldeDollars))}`,
      );
      const json = (await res.json()) as {
        error?: string;
        pourcentage?: number;
        frais?: number;
        montant_net?: number;
        actif?: boolean;
      };
      if (!res.ok) {
        setRetraitError(json.error ?? "Impossible de calculer les frais");
        return;
      }
      setRetraitPreview({
        montant: soldeDollars,
        pourcentage: Number(json.pourcentage ?? 0),
        frais: Number(json.frais ?? 0),
        montant_net: Number(json.montant_net ?? soldeDollars),
        actif: Boolean(json.actif),
      });
    } catch {
      setRetraitError("Erreur réseau");
    } finally {
      setRetraitLoading(false);
    }
  }

  function cancelRetrait(): void {
    setRetraitOpen(false);
    setRetraitPreview(null);
    setRetraitError(null);
  }

  async function confirmRetrait(): Promise<void> {
    if (!session || !retraitPreview) return;
    setRetraitSubmitting(true);
    setRetraitError(null);

    try {
      const res = await fetch("/api/banque/retrait", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ membre_id: session.user.id }),
      });
      const json = (await res.json()) as { error?: string; net?: number };
      if (!res.ok) {
        setRetraitError(json.error ?? "Retrait impossible");
        return;
      }
      setRetraitSuccess(
        `Retrait confirmé — vous recevrez ${cad.format(Number(json.net ?? retraitPreview.montant_net))}.`,
      );
      setRetraitOpen(false);
      setRetraitPreview(null);
      await loadBanque(session);
    } catch {
      setRetraitError("Erreur réseau");
    } finally {
      setRetraitSubmitting(false);
    }
  }

  const fonts = `${bebas.variable} ${dmSans.variable}`;
  const canTransfer = soldeDollars >= MIN_TRANSFER_CAD;
  const progressPct = Math.min(
    100,
    Math.max(0, (soldeDollars / MIN_TRANSFER_CAD) * 100),
  );
  const moisCourantLabel = new Date()
    .toLocaleDateString("fr-CA", { month: "long", year: "numeric" })
    .toUpperCase();
  const classementRang: number | null = null; // pas de fetch — badge masqué
  const estimation =
    pmqValuePerPoint != null && Number.isFinite(pmqValuePerPoint)
      ? totalPoints * pmqValuePerPoint
      : 0;
  const typeMembre = profile?.member_type?.trim() || "—";
  const weightedPointsPmq = totalPoints * profileMultiplier;

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

  function renderHistoryEntry(row: HistoryRow): {
    dateLabel: string;
    label: string;
    signed: string;
    color: string;
    quizLines: ReturnType<typeof formatQuizTransactionLines> | null;
    isDollars: boolean;
  } {
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
    const isQuizPoints = !isDollars && (row.type ?? "").toLowerCase() === "quiz";
    const quizLines = isQuizPoints
      ? formatQuizTransactionLines(row.amount, row.description, profileMultiplier)
      : null;
    const label = isDollars ? row.description : transactionDescription(row.type);
    let dateLabel = "—";
    try {
      dateLabel = dateFmt.format(new Date(row.created_at));
    } catch {
      dateLabel = row.created_at;
    }
    return { dateLabel, label, signed, color, quizLines, isDollars };
  }

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
            .banque-solde-amount {
              font-size: clamp(1.5rem, 5vw, 2.5rem) !important;
            }
            .banque-transfer-btn {
              min-height: 44px;
            }
            .banque-history-cards {
              display: none;
              flex-direction: column;
              gap: 0.65rem;
            }
            .banque-history-card {
              border-radius: 4px;
              padding: 1rem;
              background: rgba(245, 240, 232, 0.04);
              border: 1px solid rgba(245, 240, 232, 0.1);
            }
            @media (max-width: 479px) {
              .banque-history-table-wrap {
                display: none !important;
              }
              .banque-history-cards {
                display: flex !important;
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
              borderRadius: "4px",
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

        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.55rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            opacity: 0.3,
            marginBottom: "0.4rem",
          }}
        >
          MA BANQUE · LEVE MÉDIA INC.
        </p>
        <h1
          style={{
            fontFamily: "var(--font-bebas), Impact, sans-serif",
            fontSize: "clamp(2rem, 8vw, 3.5rem)",
            lineHeight: 0.88,
            letterSpacing: "0.02em",
            marginBottom: "1.25rem",
          }}
        >
          BANQUE
          <br />
          <span style={{ color: GOLD }}>LEVE</span>
        </h1>

        <section
          style={{
            borderRadius: "4px",
            padding: "1.5rem 1.35rem",
            marginBottom: "1rem",
            background: "#141414",
            borderTop: "2px solid #D4A017",
            border: "1px solid rgba(245, 240, 232, 0.06)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.72rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 700,
              opacity: 0.3,
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
          >
            SOLDE BANQUE · {moisCourantLabel}
          </p>
          <p
            className="banque-solde-amount"
            style={{
              margin: "0.35rem 0 0.15rem",
              fontSize: "clamp(2.25rem, 7vw, 3rem)",
              fontWeight: 800,
              fontFamily: "var(--font-mono), ui-monospace, monospace",
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
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
          >
            Seuil de retrait : {cad.format(MIN_TRANSFER_CAD)}
          </p>
          <div
            style={{
              height: "8px",
              borderRadius: "4px",
              background: "rgba(245, 240, 232, 0.12)",
              overflow: "hidden",
              }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPct}%`,
                borderRadius: "4px",
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
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
          >
            {canTransfer
              ? "Seuil atteint — transfert disponible"
              : `${progressPct.toFixed(0)} % vers le seuil de ${cad.format(MIN_TRANSFER_CAD)}`}
          </p>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.58rem",
              opacity: 0.35,
              marginTop: "0.35rem",
            }}
          >
            Minimum $100 pour transférer · PayPal · Virement · Mobile Money
          </p>
        </section>

        <section
          style={{
            borderRadius: "4px",
            padding: "1.5rem 1.35rem",
            marginBottom: "1.5rem",
            background: G2,
            borderTop: `2px solid ${GOLD}`,
            borderRight: "1px solid rgba(245, 240, 232, 0.1)",
            borderBottom: "1px solid rgba(245, 240, 232, 0.1)",
            borderLeft: "1px solid rgba(245, 240, 232, 0.1)",
            color: TEXT,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
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
                color: GOLD,
              }}
            >
              POINTS PMQ · {moisCourantLabel}
            </p>
            {classementRang != null ? (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.5rem",
                  color: ROUGE,
                  letterSpacing: "0.1em",
                  marginLeft: "auto",
                }}
              >
                #{classementRang} classement
              </span>
            ) : null}
          </div>
          <p
            style={{
              margin: "0.35rem 0 0.15rem",
              fontSize: "clamp(2.25rem, 7vw, 3rem)",
              fontWeight: 800,
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              letterSpacing: "-0.02em",
              color: GOLD,
            }}
          >
            {pointsFmt.format(totalPoints)} pts
          </p>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.65rem",
              opacity: 0.45,
              marginTop: "0.2rem",
            }}
          >
            Multiplicateur ×{profileMultiplier} · {typeMembre}
          </p>
          <p
            style={{
              margin: "0.55rem 0 0",
              fontSize: "0.78rem",
              letterSpacing: "0.04em",
              opacity: 0.75,
              lineHeight: 1.4,
              fontFamily: "var(--font-mono), ui-monospace, monospace",
            }}
          >
            {pmqValuePerPoint != null
              ? formatPmqPtValue(pmqValuePerPoint)
              : "(Revenus × 45%) ÷ Total pts · Variable mensuel"}
          </p>
          <p
            style={{
              margin: "0.68rem 0 0",
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
              fontFamily: "var(--font-mono), ui-monospace, monospace",
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
              fontFamily: "var(--font-mono), ui-monospace, monospace",
            }}
          >
            Vos points × multiplicateur ×{profileMultiplier.toFixed(1)} — utilisé pour calculer votre part de redistribution
          </p>
          <div
            style={{
              borderTop: "1px solid rgba(245,240,232,0.06)",
              marginTop: "0.85rem",
              paddingTop: "0.85rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.52rem",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                opacity: 0.28,
              }}
            >
              ESTIMATION REDISTRIB.
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.9rem",
                color: "#2ECC71",
                fontWeight: 700,
              }}
            >
              {estimation > 0 ? `≈ $${estimation.toFixed(0)}` : "—"}
            </span>
          </div>
        </section>

        {!canTransfer ? (
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.65rem",
              color: ROUGE,
              opacity: 0.8,
              margin: "0.5rem 0",
            }}
          >
            🔒 Solde insuffisant · ${(100 - soldeDollars).toFixed(2)} manquants
          </p>
        ) : null}

        <div style={{ marginBottom: "2rem",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
          <button
            type="button"
            className="banque-transfer-btn"
            disabled={!canTransfer}
            onClick={() => void openRetraitConfirm()}
            style={{
              width: "100%",
              maxWidth: "420px",
              padding: "0.85rem 1.25rem",
              borderRadius: "4px",
              fontWeight: 700,
              fontSize: "0.82rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              border: canTransfer
                ? "1px solid rgba(212, 160, 23, 0.4)"
                : "2px solid rgba(245, 240, 232, 0.2)",
              background: canTransfer ? "transparent" : "rgba(245, 240, 232, 0.06)",
              color: canTransfer ? GOLD : "rgba(245, 240, 232, 0.45)",
              cursor: canTransfer ? "pointer" : "not-allowed",
            }}
          >
            Transférer vers mon compte
          </button>

          {retraitOpen ? (
            <div
              role="presentation"
              onClick={cancelRetrait}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 100,
                background: "rgba(0, 0, 0, 0.72)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "1.25rem",
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="retrait-confirm-title"
                onClick={(e) => e.stopPropagation()}
                style={{
                  maxWidth: "28rem",
                  width: "100%",
                  background: "#121212",
                  border: "1px solid rgba(245, 240, 232, 0.18)",
                  borderRadius: "4px",
                  padding: "1.35rem 1.5rem",
                }}
              >
                <h3
                  id="retrait-confirm-title"
                  style={{
                    margin: "0 0 1rem",
                    fontFamily: "var(--font-bebas), Impact, sans-serif",
                    fontSize: "1.25rem",
                    letterSpacing: "0.08em",
                    color: GOLD,
                  }}
                >
                  Confirmer le transfert
                </h3>

                {retraitLoading ? (
                  <p style={{ opacity: 0.7, margin: 0 }}>Calcul des frais…</p>
                ) : retraitPreview ? (
                  <div style={{ fontSize: "0.92rem", lineHeight: 1.7 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "1rem",
                      }}
                    >
                      <span style={{ opacity: 0.85 }}>Montant demandé</span>
                      <span style={{ fontWeight: 700 }}>
                        {cad.format(retraitPreview.montant)}
                      </span>
                    </div>
                    {retraitPreview.actif && retraitPreview.frais > 0 ? (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "1rem",
                          color: ROUGE,
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                      >
                        <span>
                          Frais plateforme{" "}
                          {retraitPreview.pourcentage % 1 === 0
                            ? retraitPreview.pourcentage.toFixed(0)
                            : retraitPreview.pourcentage}
                          %
                        </span>
                        <span style={{ fontWeight: 700 }}>
                          -{cad.format(retraitPreview.frais)}
                        </span>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "1rem",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                      >
                        <span style={{ opacity: 0.85 }}>Frais plateforme</span>
                        <span style={{ fontWeight: 700 }}>{cad.format(0)}</span>
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "1rem",
                        marginTop: "0.5rem",
                        paddingTop: "0.65rem",
                        borderTop: "1px solid rgba(245, 240, 232, 0.12)",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                    >
                      <span style={{ fontWeight: 700 }}>Vous recevrez</span>
                      <span
                        style={{
                          fontWeight: 800,
                          color: GOLD,
                          fontSize: "1.05rem",
                        }}
                      >
                        {cad.format(retraitPreview.montant_net)}
                      </span>
                    </div>
                  </div>
                ) : null}

                {retraitError ? (
                  <p
                    role="alert"
                    style={{
                      color: ROUGE,
                      margin: "0.85rem 0 0",
                      fontSize: "0.88rem",
                    }}
                  >
                    {retraitError}
                  </p>
                ) : null}

                <div
                  style={{
                    display: "flex",
                    gap: "0.65rem",
                    marginTop: "1.15rem",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    disabled={retraitSubmitting || retraitLoading || !retraitPreview}
                    onClick={() => void confirmRetrait()}
                    style={{
                      flex: "1 1 140px",
                      padding: "0.75rem 1rem",
                      borderRadius: "4px",
                      fontWeight: 700,
                      fontSize: "0.9rem",
                      border: "none",
                      background: ROUGE,
                      color: TEXT,
                      cursor:
                        retraitSubmitting || retraitLoading || !retraitPreview
                          ? "wait"
                          : "pointer",
                      opacity:
                        retraitSubmitting || retraitLoading || !retraitPreview
                          ? 0.6
                          : 1,
                    }}
                  >
                    {retraitSubmitting ? "En cours…" : "Confirmer le transfert"}
                  </button>
                  <button
                    type="button"
                    disabled={retraitSubmitting}
                    onClick={cancelRetrait}
                    style={{
                      flex: "1 1 100px",
                      padding: "0.75rem 1rem",
                      borderRadius: "4px",
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      border: "1px solid rgba(245, 240, 232, 0.25)",
                      background: "transparent",
                      color: TEXT,
                      cursor: retraitSubmitting ? "wait" : "pointer",
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {retraitSuccess ? (
            <p
              role="status"
              style={{
                margin: "0.75rem 0 0",
                fontSize: "0.88rem",
                color: GOLD,
                maxWidth: "420px",
              }}
            >
              {retraitSuccess}
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
                borderRadius: "4px",
                border: "1px solid rgba(245, 240, 232, 0.1)",
                background: "rgba(245, 240, 232, 0.03)",
              }}
            >
              Aucune transaction pour le moment. Soumets ton premier code!
            </p>
          ) : (
            <>
              <div className="banque-history-cards">
                {history.map((row) => {
                  const { dateLabel, label, signed, color, quizLines, isDollars } =
                    renderHistoryEntry(row);
                  return (
                    <article key={row.id} className="banque-history-card">
                      <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.55 }}>{dateLabel}</p>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "0.75rem",
                          marginTop: "0.45rem",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {quizLines ? (
                            <>
                              <p style={{ margin: 0, fontWeight: 600 }}>{quizLines.line1}</p>
                              <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", opacity: 0.8 }}>
                                {quizLines.line2}
                              </p>
                            </>
                          ) : (
                            <p style={{ margin: 0, fontWeight: 600 }}>{label}</p>
                          )}
                          <p
                            style={{
                              margin: "0.35rem 0 0",
                              fontSize: "0.72rem",
                              opacity: 0.55,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            {isDollars ? "Banque $" : "Points PMQ"}
                          </p>
                        </div>
                        <span style={{ color, fontWeight: 700, whiteSpace: "nowrap" }}>{signed}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div
                className="banque-history-table-wrap"
                style={{
                  borderRadius: "4px",
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
                      const { dateLabel, label, signed, color, quizLines, isDollars } =
                        renderHistoryEntry(row);
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
            </>
          )}
        </section>
      </main>

      <AppBottomNav session={session} memberType={profile?.member_type} />
    </div>
  );
}

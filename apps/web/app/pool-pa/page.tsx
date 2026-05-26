"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { useAppBottomNavLinks } from "../../lib/useAppBottomNavLinks";
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
const VERT = "#2ECC71";
const SB = "https://lrolatbudvianeazliax.supabase.co";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

const PA_PRICE_CAD = 5;
const TAX_RATE = 0.02;

function createAuthedSupabase(accessToken: string): SupabaseClient {
  return createClient(SB, KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type ProfileRow = {
  display_name: string | null;
  member_type: string | null;
};

type BanqueMembreRow = {
  solde_dollars: number | string | null;
};

type PaTxRow = {
  id: string;
  created_at: string;
  type: string | null;
  amount: number | string | null;
  description: string | null;
  cost_usd: number | string | null;
  tax_usd: number | string | null;
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

function paTxLabel(row: PaTxRow): string {
  if (row.description?.trim()) return row.description.trim();
  const t = (row.type ?? "").toLowerCase();
  if (t === "purchase") return "Achat de points PA";
  if (t === "depense" || t === "utilisation") return "Utilisation PA";
  return row.type?.replace(/_/g, " ") ?? "Transaction PA";
}

const cad = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
});

const ptsFmt = new Intl.NumberFormat("fr-CA", {
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default function PoolPaPage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const navPages = useAppBottomNavLinks(session, profile?.member_type);
  const [soldePa, setSoldePa] = useState(0);
  const [soldeBanque, setSoldeBanque] = useState(0);
  const [history, setHistory] = useState<PaTxRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [ptsPa, setPtsPa] = useState(1);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [buySuccess, setBuySuccess] = useState<string | null>(null);
  const [featureFlagState, setFeatureFlagState] = useState<
    "loading" | "enabled" | "disabled"
  >("loading");

  const maxPtsAffordable = useMemo(() => {
    if (soldeBanque < PA_PRICE_CAD) return 0;
    return Math.floor(soldeBanque / PA_PRICE_CAD);
  }, [soldeBanque]);

  const cout = round2(ptsPa * PA_PRICE_CAD);
  const taxe = round2(cout * TAX_RATE);
  const canBuy =
    maxPtsAffordable >= 1 &&
    ptsPa >= 1 &&
    ptsPa <= maxPtsAffordable &&
    soldeBanque >= cout &&
    !buying;

  const loadPoolPa = useCallback(async (activeSession: Session) => {
    const uid = activeSession.user.id;
    const sb = createAuthedSupabase(activeSession.access_token);

    const [profileRes, banqueRes, achatSumRes] = await Promise.all([
      sb
        .from("profiles")
        .select("display_name, member_type")
        .eq("id", uid)
        .maybeSingle(),
      sb
        .from("banque_membres")
        .select("solde_dollars")
        .eq("membre_id", uid)
        .maybeSingle(),
      sb
        .from("pa_transactions")
        .select("amount")
        .eq("membre_id", uid)
        .eq("type", "purchase"),
    ]);

    const historyRes = await sb
      .from("pa_transactions")
      .select("id, created_at, type, amount, description, cost_usd, tax_usd")
      .eq("membre_id", uid)
      .order("created_at", { ascending: false })
      .limit(30);

    const errMsg =
      profileRes.error?.message ??
      banqueRes.error?.message ??
      achatSumRes.error?.message ??
      historyRes.error?.message ??
      null;
    setLoadError(errMsg);

    if (!profileRes.error) {
      setProfile((profileRes.data ?? null) as ProfileRow | null);
    }

    if (banqueRes.error) {
      setSoldeBanque(0);
    } else {
      setSoldeBanque(
        Number((banqueRes.data as BanqueMembreRow | null)?.solde_dollars ?? 0),
      );
    }

    if (achatSumRes.error) {
      setSoldePa(0);
    } else {
      const total = (achatSumRes.data ?? []).reduce(
        (acc, row) => acc + Number(row.amount ?? 0),
        0,
      );
      setSoldePa(total);
    }

    if (historyRes.error) {
      setHistory([]);
    } else {
      setHistory((historyRes.data ?? []) as PaTxRow[]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/feature-flags?nom=pool-pa", { cache: "no-store" });
        const j = (await r.json()) as { actif?: boolean };
        if (cancelled) return;
        setFeatureFlagState(j.actif ? "enabled" : "disabled");
      } catch {
        if (!cancelled) setFeatureFlagState("disabled");
      }
    })();
    return () => {
      cancelled = true;
    };
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
      await loadPoolPa(next);
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
  }, [loadPoolPa, router]);

  useEffect(() => {
    if (maxPtsAffordable < 1) {
      setPtsPa(1);
      return;
    }
    setPtsPa((prev) => Math.min(Math.max(1, prev), maxPtsAffordable));
  }, [maxPtsAffordable]);

  async function handleAcheter(): Promise<void> {
    if (!session || !canBuy) return;
    setBuying(true);
    setBuyError(null);
    setBuySuccess(null);

    try {
      const res = await fetch("/api/pa/acheter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          membre_id: session.user.id,
          pts_pa: ptsPa,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        pts_credites?: number;
        taxe?: number;
      };

      if (!res.ok) {
        setBuyError(json.error ?? "Achat impossible");
        return;
      }

      setBuySuccess(
        `${json.pts_credites ?? ptsPa} pt(s) PA crédité(s). Taxe : ${cad.format(json.taxe ?? taxe)}`,
      );
      await loadPoolPa(session);
    } catch {
      setBuyError("Erreur réseau");
    } finally {
      setBuying(false);
    }
  }

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
          <p role="alert" style={{ color: ROUGE, fontSize: "0.9rem", marginBottom: "1rem" }}>
            {loadError}
          </p>
        ) : null}

        <h1
          style={{
            fontFamily: "var(--font-bebas), Impact, sans-serif",
            fontSize: "clamp(2.5rem, 8vw, 3.5rem)",
            letterSpacing: "0.14em",
            margin: "0 0 0.35rem",
            lineHeight: 1.05,
            color: TEXT,
          }}
        >
          POOL ACTIVITÉS
        </h1>
        <p style={{ margin: "0 0 1.25rem", opacity: 0.75, fontSize: "0.95rem", lineHeight: 1.5 }}>
          Points d&apos;accès (PA) — {cad.format(PA_PRICE_CAD)} / pt · taxe {TAX_RATE * 100} % sur chaque achat
        </p>

        {featureFlagState === "loading" ? (
          <p style={{ opacity: 0.7 }}>Vérification de la fonctionnalité…</p>
        ) : featureFlagState === "disabled" ? (
          <section
            style={{
              borderRadius: "16px",
              padding: "3rem 1.75rem",
              textAlign: "center",
              marginBottom: "1.5rem",
              background:
                "linear-gradient(180deg, rgba(212, 160, 23, 0.07) 0%, rgba(8, 8, 8, 0.95) 55%)",
              border: "1px solid rgba(212, 160, 23, 0.22)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "clamp(1.75rem, 6vw, 2.5rem)",
                letterSpacing: "0.14em",
                color: GOLD,
              }}
            >
              Bientôt disponible
            </p>
            <p style={{ margin: "0.75rem 0 0", opacity: 0.82, lineHeight: 1.6 }}>
              Le Pool Activités PA arrive prochainement. Activez le drapeau{" "}
              <code style={{ fontSize: "0.85rem" }}>pool-pa</code> dans l&apos;admin pour l&apos;ouvrir.
            </p>
          </section>
        ) : (
          <>
            <section
              style={{
                borderRadius: "16px",
                padding: "1.5rem 1.35rem",
                marginBottom: "1rem",
                background: `linear-gradient(135deg, ${VERT} 0%, #1e8449 55%, #145a32 100%)`,
                border: "1px solid rgba(245, 240, 232, 0.2)",
                boxShadow: "0 12px 40px rgba(46, 204, 113, 0.12)",
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
                Solde PA
              </p>
              <p
                style={{
                  margin: "0.35rem 0 0",
                  fontSize: "clamp(2.25rem, 7vw, 3rem)",
                  fontWeight: 800,
                  fontFamily: "var(--font-dm), system-ui, sans-serif",
                }}
              >
                {ptsFmt.format(soldePa)} pt{soldePa !== 1 ? "s" : ""}
              </p>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.78rem", opacity: 0.8 }}>
                Total des achats (type achat)
              </p>
            </section>

            <section
              style={{
                borderRadius: "16px",
                padding: "1.5rem 1.35rem",
                marginBottom: "1.5rem",
                border: "1px solid rgba(245, 240, 232, 0.12)",
                background: "rgba(245, 240, 232, 0.03)",
              }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  fontSize: "1.35rem",
                  letterSpacing: "0.1em",
                  margin: "0 0 1rem",
                  color: GOLD,
                }}
              >
                Acheter des PA depuis ma Banque LEVE
              </h2>

              <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", opacity: 0.85 }}>
                Solde banque disponible :{" "}
                <strong style={{ color: GOLD }}>{cad.format(soldeBanque)}</strong>
                {maxPtsAffordable > 0 ? (
                  <span style={{ display: "block", marginTop: "0.35rem", fontSize: "0.82rem" }}>
                    Maximum achetable : {maxPtsAffordable} pt(s)
                  </span>
                ) : (
                  <span
                    style={{ display: "block", marginTop: "0.35rem", fontSize: "0.82rem", color: ROUGE }}
                  >
                    Solde insuffisant pour un achat (min. {cad.format(PA_PRICE_CAD)})
                  </span>
                )}
              </p>

              <label
                htmlFor="pts-pa"
                style={{
                  display: "block",
                  fontSize: "0.78rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: "0.5rem",
                  opacity: 0.8,
                }}
              >
                Nombre de points PA
              </label>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  id="pts-pa-range"
                  type="range"
                  min={1}
                  max={Math.max(1, maxPtsAffordable)}
                  value={Math.min(ptsPa, Math.max(1, maxPtsAffordable))}
                  disabled={maxPtsAffordable < 1}
                  onChange={(e) => setPtsPa(Number(e.target.value))}
                  style={{ flex: "1 1 180px", accentColor: GOLD }}
                />
                <input
                  id="pts-pa"
                  type="number"
                  min={1}
                  max={Math.max(1, maxPtsAffordable)}
                  value={ptsPa}
                  disabled={maxPtsAffordable < 1}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) {
                      setPtsPa(Math.min(Math.max(1, Math.floor(n)), Math.max(1, maxPtsAffordable)));
                    }
                  }}
                  style={{
                    width: "5rem",
                    padding: "0.5rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(245, 240, 232, 0.2)",
                    background: BG,
                    color: TEXT,
                    fontSize: "1rem",
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: "1.25rem",
                  display: "grid",
                  gap: "0.5rem",
                  fontSize: "0.92rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ opacity: 0.8 }}>Coût ({ptsPa} × {cad.format(PA_PRICE_CAD)})</span>
                  <strong>{cad.format(cout)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ opacity: 0.8 }}>Taxe 2 %</span>
                  <strong>{cad.format(taxe)}</strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingTop: "0.5rem",
                    borderTop: "1px solid rgba(245, 240, 232, 0.1)",
                    fontWeight: 700,
                  }}
                >
                  <span>Total débité banque</span>
                  <span style={{ color: GOLD }}>{cad.format(cout)}</span>
                </div>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", opacity: 0.6, lineHeight: 1.45 }}>
                  Taxe de 2 % sur le montant : 75 % → pool PA communauté, 25 % → fonctionnement LEVE.
                </p>
              </div>

              {buyError ? (
                <p role="alert" style={{ color: ROUGE, marginTop: "1rem", fontSize: "0.9rem" }}>
                  {buyError}
                </p>
              ) : null}
              {buySuccess ? (
                <p role="status" style={{ color: VERT, marginTop: "1rem", fontSize: "0.9rem" }}>
                  {buySuccess}
                </p>
              ) : null}

              <button
                type="button"
                disabled={!canBuy}
                onClick={() => void handleAcheter()}
                style={{
                  marginTop: "1.25rem",
                  width: "100%",
                  maxWidth: "420px",
                  padding: "0.85rem 1.25rem",
                  borderRadius: "10px",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  letterSpacing: "0.04em",
                  border: `2px solid ${canBuy ? ROUGE : "rgba(245, 240, 232, 0.2)"}`,
                  background: canBuy ? ROUGE : "rgba(245, 240, 232, 0.06)",
                  color: canBuy ? TEXT : "rgba(245, 240, 232, 0.45)",
                  cursor: canBuy ? "pointer" : "not-allowed",
                }}
              >
                {buying ? "Achat en cours…" : "Acheter"}
              </button>

              <p style={{ marginTop: "0.75rem", fontSize: "0.82rem", opacity: 0.65 }}>
                <Link href="/banque" style={{ color: GOLD }}>
                  Voir ma banque LEVE →
                </Link>
              </p>
            </section>
          </>
        )}

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
            Historique PA
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
              Aucune transaction PA pour le moment.
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
                      <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Description</th>
                      <th
                        style={{
                          padding: "0.75rem 1rem",
                          fontWeight: 600,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        PA
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => {
                      const amt = Number(row.amount ?? 0);
                      const isAchat = (row.type ?? "").toLowerCase() === "purchase";
                      const signed =
                        amt > 0
                          ? `+${ptsFmt.format(amt)} pt`
                          : `${ptsFmt.format(amt)} pt`;
                      let dateLabel = "—";
                      try {
                        dateLabel = dateFmt.format(new Date(row.created_at));
                      } catch {
                        dateLabel = row.created_at;
                      }
                      const coutRow = Number(row.cost_usd ?? 0);
                      const taxeRow = Number(row.tax_usd ?? 0);
                      return (
                        <tr
                          key={row.id}
                          style={{
                            borderBottom: "1px solid rgba(245, 240, 232, 0.06)",
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
                            {paTxLabel(row)}
                            {coutRow > 0 ? (
                              <span
                                style={{
                                  display: "block",
                                  marginTop: "0.2rem",
                                  fontSize: "0.78rem",
                                  opacity: 0.65,
                                }}
                              >
                                {cad.format(coutRow)}
                                {taxeRow > 0 ? ` · taxe ${cad.format(taxeRow)}` : ""}
                              </span>
                            ) : null}
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
                              {row.type ?? "PA"}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "0.7rem 1rem",
                              textAlign: "right",
                              fontWeight: 700,
                              color: isAchat && amt > 0 ? VERT : TEXT,
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
                color: p.href === "/pool-pa" ? GOLD : TEXT,
                opacity: p.href === "/pool-pa" ? 1 : 0.75,
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

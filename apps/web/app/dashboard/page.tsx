"use client";

import { createBrowserClient } from "@repo/supabase/browser";
import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";

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

type ProfileRow = {
  display_name: string | null;
  member_type: string | null;
  multiplier: number | string | null;
  numero_membre: string | null;
};

function formatMemberTypeLabel(raw: string | null | undefined): string {
  if (!raw) return "Communauté";
  const n = raw.trim();
  if (n.toLowerCase() === "communaute" || n === "Communauté") return "Communauté";
  if (n === "Pionnier") return "Pionnier";
  if (n === "Fondateur") return "Fondateur";
  if (n === "Collaborateur") return "Collaborateur";
  return n;
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

const pointsFmt = new Intl.NumberFormat("fr-CA", {
  maximumFractionDigits: 2,
});

const navPages: { href: string; label: string }[] = [
  { href: "/", label: "Accueil" },
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/videos", label: "Vidéos" },
  { href: "/banque", label: "Banque LEVE" },
  { href: "/classement", label: "Classement" },
  { href: "/transparence", label: "Transparence" },
];

export default function DashboardPage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [totalPointsPmq, setTotalPointsPmq] = useState(0);
  const [lastRedistributionCad, setLastRedistributionCad] = useState<
    number | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadDashboard = useCallback(async (activeSession: Session) => {
    const supabase = createBrowserClient();
    const uid = activeSession.user.id;

    const [profileRes, txRes, histRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, member_type, multiplier, numero_membre")
        .eq("id", uid)
        .maybeSingle(),
      supabase.from("points_transactions").select("amount").eq("user_id", uid),
      supabase
        .from("redistribution_history")
        .select("amount, month")
        .eq("user_id", uid)
        .order("month", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileRes.error) {
      setLoadError(profileRes.error.message);
    } else {
      setProfile(profileRes.data as ProfileRow | null);
      setLoadError(null);
    }

    if (txRes.error) {
      setLoadError(txRes.error.message);
      setTotalPointsPmq(0);
    } else {
      const rows = txRes.data ?? [];
      const sum = rows.reduce(
        (acc, row) => acc + Number(row.amount ?? 0),
        0,
      );
      setTotalPointsPmq(sum);
    }

    if (histRes.error) {
      setLoadError(histRes.error.message);
      setLastRedistributionCad(null);
    } else if (histRes.data?.amount != null) {
      setLastRedistributionCad(Number(histRes.data.amount));
    } else {
      setLastRedistributionCad(null);
    }
  }, []);

  useEffect(() => {
    const supabase = createBrowserClient();
    let cancelled = false;

    void (async () => {
      const {
        data: { session: initial },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!initial) {
        setSession(null);
        router.replace("/");
        return;
      }
      setSession(initial);
      await loadDashboard(initial);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (cancelled) return;
      if (!nextSession) {
        setSession(null);
        router.replace("/");
        return;
      }
      setSession(nextSession);
      await loadDashboard(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadDashboard, router]);

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
  const memberLabel = formatMemberTypeLabel(profile?.member_type ?? null);
  const mult = Number(profile?.multiplier ?? 1);
  const multiplierDisplay = `${Number.isFinite(mult) ? mult.toFixed(1) : "1.0"}×`;
  const isNewMember =
    totalPointsPmq === 0 && lastRedistributionCad === null;

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
      {/* Top bar */}
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

        {/* Hero */}
        <section
          style={{
            borderRadius: "14px",
            padding: "1.75rem 1.5rem",
            marginBottom: "1.25rem",
            background:
              "linear-gradient(145deg, rgba(192, 57, 43, 0.12) 0%, rgba(8, 8, 8, 0.9) 45%, rgba(212, 160, 23, 0.06) 100%)",
            border: "1px solid rgba(245, 240, 232, 0.1)",
          }}
        >
          <p style={{ margin: 0, opacity: 0.65, fontSize: "0.85rem" }}>
            Espace membre
            {profile?.numero_membre ? ` · #${profile.numero_membre}` : ""}
          </p>
          <h1
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "clamp(2.5rem, 8vw, 3.75rem)",
              letterSpacing: "0.04em",
              margin: "0.35rem 0 0.75rem",
              lineHeight: 1.05,
            }}
          >
            Bonjour {name}
          </h1>
          <span
            style={{
              display: "inline-block",
              background: ROUGE,
              color: TEXT,
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "0.35rem 0.75rem",
              borderRadius: "999px",
            }}
          >
            {memberLabel}
          </span>
        </section>

        {isNewMember ? (
          <p
            style={{
              fontSize: "0.95rem",
              opacity: 0.85,
              marginBottom: "1.25rem",
              lineHeight: 1.5,
            }}
          >
            Bienvenue sur LEVE. Vos points et redistributions apparaîtront ici
            dès que vous commencerez à accumuler des PMQ.
          </p>
        ) : null}

        {/* Stats */}
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
              border: `1px solid rgba(212, 160, 23, 0.35)`,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "0.72rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: GOLD,
                opacity: 0.95,
              }}
            >
              Total points PMQ
            </p>
            <p
              style={{
                margin: "0.5rem 0 0",
                fontSize: "1.65rem",
                fontWeight: 700,
                color: GOLD,
              }}
            >
              {pointsFmt.format(totalPointsPmq)}
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
              Multiplicateur
            </p>
            <p
              style={{
                margin: "0.5rem 0 0",
                fontSize: "1.65rem",
                fontWeight: 700,
                color: TEXT,
              }}
            >
              {multiplierDisplay}
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
              Dernière redistribution
            </p>
            <p
              style={{
                margin: "0.5rem 0 0",
                fontSize: "1.35rem",
                fontWeight: 700,
              }}
            >
              {lastRedistributionCad != null
                ? cad.format(lastRedistributionCad)
                : cad.format(0)}
            </p>
          </article>
        </div>

        {/* Quick actions */}
        <section style={{ marginBottom: "2rem" }}>
          <h2
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "1.35rem",
              letterSpacing: "0.08em",
              margin: "0 0 0.75rem",
              opacity: 0.9,
            }}
          >
            Raccourcis
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "0.65rem",
            }}
          >
            {[
              { href: "/videos", label: "Vidéos" },
              { href: "/banque", label: "Banque LEVE" },
              { href: "/classement", label: "Classement" },
              { href: "/transparence", label: "Transparence" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0.9rem",
                  borderRadius: "10px",
                  background: "rgba(192, 57, 43, 0.15)",
                  border: `1px solid ${ROUGE}`,
                  color: TEXT,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  textAlign: "center",
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      </main>

      {/* Bottom nav */}
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
                color: p.href === "/dashboard" ? GOLD : TEXT,
                opacity: p.href === "/dashboard" ? 1 : 0.75,
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

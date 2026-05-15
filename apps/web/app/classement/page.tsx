"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { APP_BOTTOM_NAV_LINKS as navPages } from "../../lib/appBottomNavLinks";
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
const SILVER = "#C8C8C8";
const BRONZE = "#B87333";
const VIOLET_BADGE = "#8E44AD";
const GRIS_COMM = "#6B6B6B";
const SB = "https://lrolatbudvianeazliax.supabase.co";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

const PAGE_SIZE = 1000;

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

type ClassementRow = {
  rank: number;
  membre_id: string;
  display_name: string;
  member_type: string;
  total_points: number;
};

const pointsFmt = new Intl.NumberFormat("fr-CA", {
  maximumFractionDigits: 2,
});

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

function formatMemberTypeLabel(raw: string | null | undefined): string {
  if (!raw) return "Communauté";
  const n = raw.trim();
  const lower = n.toLowerCase();
  if (lower === "communauté" || lower === "communaute" || n === "Communauté") return "Communauté";
  if (lower === "pionnier" || n === "Pionnier") return "Pionnier";
  if (lower === "fondateur" || n === "Fondateur") return "Fondateur";
  if (lower === "collaborateur" || n === "Collaborateur") return "Collaborateur";
  return n;
}

function memberTypeBadgeStyle(label: string): {
  background: string;
  color: string;
  border: string;
} {
  switch (label) {
    case "Pionnier":
      return {
        background: "rgba(192, 57, 43, 0.2)",
        color: ROUGE,
        border: `1px solid ${ROUGE}`,
      };
    case "Fondateur":
      return {
        background: "rgba(212, 160, 23, 0.18)",
        color: GOLD,
        border: `1px solid ${GOLD}`,
      };
    case "Collaborateur":
      return {
        background: "rgba(142, 68, 173, 0.22)",
        color: "#D6B8E8",
        border: `1px solid ${VIOLET_BADGE}`,
      };
    default:
      return {
        background: "rgba(107, 107, 107, 0.25)",
        color: "rgba(245, 240, 232, 0.85)",
        border: `1px solid ${GRIS_COMM}`,
      };
  }
}

async function aggregatePointsByUser(
  accessToken: string,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  let offset = 0;
  for (;;) {
    const { data, error } = await restJson<
      { membre_id?: unknown; amount?: unknown }[]
    >(
      `points_transactions?select=membre_id,amount&offset=${offset}&limit=${PAGE_SIZE}`,
      accessToken,
    );

    if (error) {
      throw new Error(error);
    }

    const rows = data ?? [];
    for (const row of rows) {
      const uid = String(row.membre_id ?? "");
      if (!uid) continue;
      const amt = Number(row.amount ?? 0);
      totals.set(uid, (totals.get(uid) ?? 0) + amt);
    }

    if (rows.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }
  return totals;
}

async function fetchClassementRows(
  accessToken: string,
): Promise<ClassementRow[]> {
  const totals = await aggregatePointsByUser(accessToken);

  const sortedIds = [...totals.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 100)
    .map(([id]) => id);

  if (sortedIds.length === 0) {
    return [];
  }

  const inList = sortedIds.map(encodeURIComponent).join(",");
  const { data: profiles, error: profilesError } = await restJson<
    {
      id: string;
      display_name: string | null;
      member_type: string | null;
      email: string | null;
    }[]
  >(
    `profiles?id=in.(${inList})&select=id,display_name,member_type,email`,
    accessToken,
  );

  if (profilesError) {
    throw new Error(profilesError);
  }

  const profileMap = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      p as {
        id: string;
        display_name: string | null;
        member_type: string | null;
        email: string | null;
      },
    ]),
  );

  return sortedIds.map((membreId, index) => {
    const p = profileMap.get(membreId);
    const label = formatMemberTypeLabel(p?.member_type ?? null);
    const display =
      p?.display_name?.trim() ||
      p?.email?.split("@")[0] ||
      "Membre";
    return {
      rank: index + 1,
      membre_id: membreId,
      display_name: display,
      member_type: label,
      total_points: totals.get(membreId) ?? 0,
    };
  });
}

function PodiumCard({
  row,
  place,
  accent,
  height,
  isCurrentUser,
}: {
  row: ClassementRow;
  place: 1 | 2 | 3;
  accent: string;
  height: string;
  isCurrentUser: boolean;
}): JSX.Element {
  const badge = memberTypeBadgeStyle(row.member_type);
  return (
    <div
      style={{
        flex: place === 1 ? "1.15" : "1",
        maxWidth: place === 1 ? "200px" : "170px",
        minHeight: height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "1rem 0.65rem 1.15rem",
        borderRadius: "14px",
        background: `linear-gradient(180deg, ${accent}22 0%, rgba(8,8,8,0.95) 55%, rgba(8,8,8,0.98) 100%)`,
        border: `2px solid ${accent}`,
        boxShadow:
          place === 1
            ? `0 0 32px ${accent}44, 0 12px 28px rgba(0,0,0,0.45)`
            : `0 8px 24px rgba(0,0,0,0.35)`,
        position: "relative",
        outline: isCurrentUser ? `2px solid rgba(212,160,23,0.45)` : "none",
        outlineOffset: 2,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-0.5rem",
          left: "50%",
          transform: "translateX(-50%)",
          width: "2.5rem",
          height: "2.5rem",
          borderRadius: "50%",
          background: accent,
          color: BG,
          fontFamily: "var(--font-bebas), Impact, sans-serif",
          fontSize: "1.35rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          letterSpacing: "0.06em",
          boxShadow: `0 4px 12px ${accent}66`,
        }}
      >
        {place}
      </div>
      <p
        style={{
          margin: "1.5rem 0 0.35rem",
          fontWeight: 700,
          fontSize: place === 1 ? "1.05rem" : "0.92rem",
          textAlign: "center",
          lineHeight: 1.25,
          wordBreak: "break-word",
        }}
      >
        {row.display_name}
      </p>
      <span
        style={{
          fontSize: "0.62rem",
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          padding: "0.25rem 0.5rem",
          borderRadius: "999px",
          marginBottom: "0.5rem",
          ...badge,
        }}
      >
        {row.member_type}
      </span>
      <p
        style={{
          margin: 0,
          fontSize: place === 1 ? "1.5rem" : "1.2rem",
          fontWeight: 800,
          color: accent,
        }}
      >
        {pointsFmt.format(row.total_points)}
      </p>
      <p style={{ margin: "0.15rem 0 0", fontSize: "0.7rem", opacity: 0.55 }}>
        pts PMQ
      </p>
    </div>
  );
}

function comingSoonSection(title: string): JSX.Element {
  return (
    <section
      aria-live="polite"
      style={{
        borderRadius: "16px",
        padding: "3rem 1.75rem",
        textAlign: "center",
        marginTop: "2rem",
        background:
          "linear-gradient(180deg, rgba(212, 160, 23, 0.07) 0%, rgba(8, 8, 8, 0.95) 55%)",
        border: "1px solid rgba(212, 160, 23, 0.22)",
        boxShadow: "0 0 0 1px rgba(245, 240, 232, 0.04) inset",
      }}
    >
      <p
        style={{
          margin: "0 0 0.75rem",
          fontFamily: "var(--font-bebas), Impact, sans-serif",
          fontSize: "clamp(1.75rem, 6vw, 2.5rem)",
          letterSpacing: "0.14em",
          color: GOLD,
          textTransform: "uppercase",
        }}
      >
        Bientôt disponible
      </p>
      <p
        style={{
          margin: "0 auto",
          maxWidth: "28rem",
          fontSize: "1rem",
          lineHeight: 1.65,
          opacity: 0.82,
        }}
      >
        La section {title} arrive prochainement sur LEVE. Revenez bientôt.
      </p>
    </section>
  );
}

export default function ClassementPage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [rows, setRows] = useState<ClassementRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [featureFlagState, setFeatureFlagState] = useState<
    "loading" | "enabled" | "disabled"
  >("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/feature-flags?nom=classement", { cache: "no-store" });
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

  const loadClassement = useCallback(async (activeSession: Session) => {
    const token = activeSession.access_token;
    const uid = activeSession.user.id;

    const profileRes = await restJson<ProfileRow[]>(
      `profiles?id=eq.${encodeURIComponent(uid)}&select=display_name`,
      token,
    );

    if (profileRes.error) {
      setLoadError(profileRes.error);
    } else {
      const rows = profileRes.data ?? [];
      setProfile((rows[0] ?? null) as ProfileRow | null);
    }

    try {
      const classementRows = await fetchClassementRows(token);
      setRows(classementRows);
      setLastRefresh(new Date());
      if (!profileRes.error) {
        setLoadError(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError(msg);
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
      try {
        await loadClassement(next);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
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
  }, [loadClassement, router]);

  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => {
      void loadClassement(session).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
      });
    }, 30_000);
    return () => window.clearInterval(id);
  }, [session, loadClassement]);

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

  if (featureFlagState === "loading") {
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

  if (featureFlagState === "disabled") {
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
        </header>
        <main style={{ maxWidth: "960px", margin: "0 auto", padding: "1.25rem" }}>
          {comingSoonSection("Classement")}
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
                  color: p.href === "/classement" ? GOLD : TEXT,
                  opacity: p.href === "/classement" ? 1 : 0.75,
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
  const uid = session.user.id;
  const top3 = rows.slice(0, 3);
  const second = top3[1];
  const first = top3[0];
  const third = top3[2];
  const tableRows = rows.slice(3);

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

        <div style={{ marginBottom: "0.35rem" }}>
          <h1
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "clamp(2.75rem, 9vw, 4rem)",
              letterSpacing: "0.18em",
              margin: 0,
              lineHeight: 1.02,
              color: TEXT,
            }}
          >
            CLASSEMENT
          </h1>
          <p
            style={{
              margin: "0.5rem 0 0",
              fontSize: "0.95rem",
              opacity: 0.72,
              letterSpacing: "0.02em",
            }}
          >
            Mis à jour en temps réel
          </p>
          {lastRefresh ? (
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.75rem", opacity: 0.45 }}>
              Dernière actualisation locale :{" "}
              {lastRefresh.toLocaleTimeString("fr-CA", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}{" "}
              · rafraîchissement auto 30 s
            </p>
          ) : null}
        </div>

        {rows.length === 0 && !loadError ? (
          <p
            style={{
              opacity: 0.78,
              marginTop: "2rem",
              fontSize: "1rem",
              lineHeight: 1.55,
            }}
          >
            Aucun point enregistré pour le moment. Le podium apparaîtra dès que les
            membres accumuleront des PMQ.
          </p>
        ) : null}

        {first ? (
          <section
            style={{
              marginTop: "1.75rem",
              marginBottom: "2rem",
              padding: "1.5rem 0.75rem 1.75rem",
              borderRadius: "18px",
              background:
                "linear-gradient(160deg, rgba(212,160,23,0.08) 0%, rgba(8,8,8,0.6) 40%, rgba(192,57,43,0.06) 100%)",
              border: "1px solid rgba(245, 240, 232, 0.1)",
            }}
          >
            <p
              style={{
                textAlign: "center",
                margin: "0 0 1.25rem",
                fontSize: "0.72rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: 0.55,
              }}
            >
              Podium
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-end",
                justifyContent: "center",
                gap: "0.65rem",
                flexWrap: "wrap",
              }}
            >
              {second ? (
                <PodiumCard
                  row={second}
                  place={2}
                  accent={SILVER}
                  height="200px"
                  isCurrentUser={second.membre_id === uid}
                />
              ) : null}
              {first ? (
                <PodiumCard
                  row={first}
                  place={1}
                  accent={GOLD}
                  height="240px"
                  isCurrentUser={first.membre_id === uid}
                />
              ) : null}
              {third ? (
                <PodiumCard
                  row={third}
                  place={3}
                  accent={BRONZE}
                  height="180px"
                  isCurrentUser={third.membre_id === uid}
                />
              ) : null}
            </div>
          </section>
        ) : null}

        {tableRows.length > 0 ? (
          <section style={{ marginBottom: "1.5rem" }}>
            <h2
              style={{
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "1.25rem",
                letterSpacing: "0.12em",
                margin: "0 0 0.85rem",
                opacity: 0.88,
              }}
            >
              Classement 4 — 100
            </h2>
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
                          padding: "0.75rem 0.85rem",
                          fontWeight: 600,
                          color: GOLD,
                          width: "3.5rem",
                        }}
                      >
                        #
                      </th>
                      <th style={{ padding: "0.75rem 0.85rem", fontWeight: 600 }}>
                        Membre
                      </th>
                      <th style={{ padding: "0.75rem 0.85rem", fontWeight: 600 }}>
                        Type
                      </th>
                      <th
                        style={{
                          padding: "0.75rem 0.85rem",
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
                    {tableRows.map((row) => {
                      const isMe = row.membre_id === uid;
                      const badge = memberTypeBadgeStyle(row.member_type);
                      return (
                        <tr
                          key={row.membre_id}
                          style={{
                            borderBottom: "1px solid rgba(245, 240, 232, 0.06)",
                            background: isMe
                              ? "linear-gradient(90deg, rgba(212,160,23,0.12) 0%, rgba(212,160,23,0.04) 100%)"
                              : undefined,
                            boxShadow: isMe
                              ? "inset 3px 0 0 0 rgba(212, 160, 23, 0.65)"
                              : undefined,
                          }}
                        >
                          <td
                            style={{
                              padding: "0.65rem 0.85rem",
                              fontWeight: 700,
                              opacity: isMe ? 1 : 0.85,
                              color: isMe ? GOLD : TEXT,
                            }}
                          >
                            {row.rank}
                          </td>
                          <td
                            style={{
                              padding: "0.65rem 0.85rem",
                              fontWeight: isMe ? 700 : 500,
                            }}
                          >
                            {row.display_name}
                            {isMe ? (
                              <span
                                style={{
                                  marginLeft: "0.35rem",
                                  fontSize: "0.65rem",
                                  opacity: 0.65,
                                  fontWeight: 600,
                                }}
                              >
                                (vous)
                              </span>
                            ) : null}
                          </td>
                          <td style={{ padding: "0.65rem 0.85rem" }}>
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: "0.62rem",
                                fontWeight: 600,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                padding: "0.22rem 0.45rem",
                                borderRadius: "999px",
                                ...badge,
                              }}
                            >
                              {row.member_type}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "0.65rem 0.85rem",
                              textAlign: "right",
                              fontWeight: 700,
                              color: GOLD,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {pointsFmt.format(row.total_points)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}
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
                color: p.href === "/classement" ? GOLD : TEXT,
                opacity: p.href === "/classement" ? 1 : 0.75,
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

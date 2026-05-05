"use client";

import { createBrowserClient } from "@repo/supabase/browser";
import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { signOut } from "../../lib/auth";

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

const PAGE_SIZE = 1000;

type ProfileRow = {
  display_name: string | null;
};

type ClassementRow = {
  rank: number;
  user_id: string;
  display_name: string;
  member_type: string;
  total_points: number;
};

const navPages: { href: string; label: string }[] = [
  { href: "/", label: "Accueil" },
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/videos", label: "Vidéos" },
  { href: "/banque", label: "Banque LEVE" },
  { href: "/classement", label: "Classement" },
  { href: "/transparence", label: "Transparence" },
];

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
  if (n.toLowerCase() === "communaute" || n === "Communauté") return "Communauté";
  if (n === "Pionnier") return "Pionnier";
  if (n === "Fondateur") return "Fondateur";
  if (n === "Collaborateur") return "Collaborateur";
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
  supabase: SupabaseClient,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("points_transactions")
      .select("user_id, amount")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    for (const row of rows) {
      const uid = String(row.user_id ?? "");
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
  supabase: SupabaseClient,
): Promise<ClassementRow[]> {
  const totals = await aggregatePointsByUser(supabase);

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

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name, member_type, email")
    .in("id", sortedIds);

  if (profilesError) {
    throw new Error(profilesError.message);
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

  return sortedIds.map((userId, index) => {
    const p = profileMap.get(userId);
    const label = formatMemberTypeLabel(p?.member_type ?? null);
    const display =
      p?.display_name?.trim() ||
      p?.email?.split("@")[0] ||
      "Membre";
    return {
      rank: index + 1,
      user_id: userId,
      display_name: display,
      member_type: label,
      total_points: totals.get(userId) ?? 0,
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

export default function ClassementPage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [rows, setRows] = useState<ClassementRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadClassement = useCallback(async (activeSession: Session) => {
    const supabase = createBrowserClient();
    const uid = activeSession.user.id;

    const profileRes = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", uid)
      .maybeSingle();

    if (profileRes.error) {
      setLoadError(profileRes.error.message);
    } else {
      setProfile(profileRes.data as ProfileRow | null);
    }

    try {
      const classementRows = await fetchClassementRows(supabase);
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
      try {
        await loadClassement(initial);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
      }
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
      try {
        await loadClassement(nextSession);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
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

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/");
    } catch {
      setSigningOut(false);
    }
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
                  isCurrentUser={second.user_id === uid}
                />
              ) : null}
              {first ? (
                <PodiumCard
                  row={first}
                  place={1}
                  accent={GOLD}
                  height="240px"
                  isCurrentUser={first.user_id === uid}
                />
              ) : null}
              {third ? (
                <PodiumCard
                  row={third}
                  place={3}
                  accent={BRONZE}
                  height="180px"
                  isCurrentUser={third.user_id === uid}
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
                      const isMe = row.user_id === uid;
                      const badge = memberTypeBadgeStyle(row.member_type);
                      return (
                        <tr
                          key={row.user_id}
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

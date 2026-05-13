"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { APP_BOTTOM_NAV_LINKS as navPages } from "../../lib/appBottomNavLinks";
import { signOut } from "../../lib/auth";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";

const SB = "https://lrolatbudvianeazliax.supabase.co";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

function supabaseRestHeaders(accessToken: string): HeadersInit {
  return {
    apikey: KEY,
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
}

type RestErr = { message: string };

async function fetchRest<T>(
  path: string,
  accessToken: string,
): Promise<{ data: T; error: null } | { data: null; error: RestErr }> {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    headers: supabaseRestHeaders(accessToken),
  });
  if (!res.ok) {
    let message = res.statusText || "Erreur réseau";
    try {
      const j = (await res.json()) as { message?: string; hint?: string };
      message = j.message ?? j.hint ?? message;
    } catch {
      try {
        message = (await res.text()) || message;
      } catch {
        /* ignore */
      }
    }
    return { data: null, error: { message } };
  }
  const data = (await res.json()) as T;
  return { data, error: null };
}


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

type ProfileRow = {
  display_name: string | null;
};

type ConcoursRow = {
  id: string;
  titre: string;
  description: string | null;
  date_fin: string;
  points_requis: number | string | null;
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

const pointsFmt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
const dateFinFmt = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "long",
  timeStyle: "short",
});

function pointsRequis(row: ConcoursRow): number {
  const n = Number(row.points_requis ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export default function ConcoursPage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [totalPointsPmq, setTotalPointsPmq] = useState(0);
  const [concours, setConcours] = useState<ConcoursRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [participatingId, setParticipatingId] = useState<string | null>(null);
  const [participatedIds, setParticipatedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [participationMsg, setParticipationMsg] = useState<{
    concoursId: string;
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const loadPage = useCallback(async (activeSession: Session) => {
    const token = activeSession.access_token;
    const uid = activeSession.user.id;
    const nowIso = new Date().toISOString();

    const [profileRes, txRes, concoursRes] = await Promise.all([
      fetchRest<ProfileRow[]>(
        `profiles?select=display_name&id=eq.${encodeURIComponent(uid)}`,
        token,
      ),
      fetchRest<{ amount?: unknown }[]>(
        `points_transactions?select=amount&membre_id=eq.${encodeURIComponent(uid)}`,
        token,
      ),
      fetchRest<ConcoursRow[]>(
        `concours?select=id,titre,description,date_fin,points_requis&date_fin=gte.${encodeURIComponent(nowIso)}&order=date_fin.asc`,
        token,
      ),
    ]);

    const errMsg =
      profileRes.error?.message ??
      txRes.error?.message ??
      concoursRes.error?.message ??
      null;
    setLoadError(errMsg);

    if (!profileRes.error) {
      const rows = profileRes.data ?? [];
      setProfile(rows[0] ?? null);
    }

    if (txRes.error) {
      setTotalPointsPmq(0);
    } else {
      const rows = txRes.data ?? [];
      const sum = rows.reduce(
        (acc, row) => acc + Number(row.amount ?? 0),
        0,
      );
      setTotalPointsPmq(sum);
    }

    if (concoursRes.error) {
      setConcours([]);
    } else {
      setConcours(concoursRes.data ?? []);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function applyCookieSession(next: Session | null): Promise<void> {
      if (cancelled) return;
      if (!next) {
        setSession(null);
        setProfile(null);
        setConcours([]);
        setTotalPointsPmq(0);
        setLoadError(null);
        return;
      }
      setSession(next);
      await loadPage(next);
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
  }, [loadPage]);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/");
    } catch {
      setSigningOut(false);
    }
  }

  function handleParticiper(row: ConcoursRow): void {
    const req = pointsRequis(row);
    if (totalPointsPmq < req) {
      setParticipationMsg({
        concoursId: row.id,
        kind: "err",
        text: `Il vous faut au moins ${pointsFmt.format(req)} points PMQ pour participer (solde actuel : ${pointsFmt.format(totalPointsPmq)}).`,
      });
      return;
    }

    setParticipatingId(row.id);
    setParticipationMsg(null);

    window.setTimeout(() => {
      setParticipatingId(null);
      setParticipatedIds((prev) => new Set(prev).add(row.id));
      setParticipationMsg({
        concoursId: row.id,
        kind: "ok",
        text: "Merci ! Votre participation est notée pour ce concours. Les gagnants seront contactés après la date de clôture.",
      });
    }, 280);
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
        <main
          style={{
            maxWidth: "960px",
            margin: "0 auto",
            padding: "2rem 1.25rem",
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, fontSize: "1.05rem", opacity: 0.85, lineHeight: 1.6 }}>
            Connecte-toi pour accéder aux concours
          </p>
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
                  color: p.href === "/concours" ? GOLD : TEXT,
                  opacity: p.href === "/concours" ? 1 : 0.75,
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
            Communauté LEVE
          </p>
          <h1
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "clamp(2rem, 7vw, 3rem)",
              letterSpacing: "0.04em",
              margin: "0.35rem 0 0.75rem",
              lineHeight: 1.05,
              color: TEXT,
            }}
          >
            Concours
          </h1>
          <p style={{ margin: 0, opacity: 0.8, fontSize: "0.95rem", maxWidth: "36rem" }}>
            Participez aux tirages et événements réservés aux membres. Chaque concours indique
            le seuil de points PMQ requis et la date limite.
          </p>
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
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
                opacity: 0.95,
              }}
            >
              Vos points PMQ
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
              Concours ouverts
            </p>
            <p
              style={{
                margin: "0.5rem 0 0",
                fontSize: "1.65rem",
                fontWeight: 700,
                color: TEXT,
              }}
            >
              {concours.length}
            </p>
          </article>
        </div>

        {concours.length === 0 ? (
          <section
            aria-live="polite"
            style={{
              borderRadius: "16px",
              padding: "2.5rem 1.75rem",
              textAlign: "center",
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
                fontSize: "1.5rem",
                letterSpacing: "0.12em",
                color: GOLD,
                textTransform: "uppercase",
              }}
            >
              Prochainement
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
              Aucun concours actif pour le moment. Revenez bientôt : les prochaines éditions
              seront annoncées ici, en toute transparence, pour la communauté LEVE.
            </p>
            <div
              style={{
                marginTop: "1.75rem",
                height: "1px",
                maxWidth: "120px",
                marginLeft: "auto",
                marginRight: "auto",
                background: `linear-gradient(90deg, transparent, ${ROUGE}, transparent)`,
                opacity: 0.65,
              }}
            />
          </section>
        ) : (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {concours.map((row) => {
              const req = pointsRequis(row);
              const already = participatedIds.has(row.id);
              const canParticiper = totalPointsPmq >= req && !already;
              const end = new Date(row.date_fin);
              const endLabel = Number.isNaN(end.getTime())
                ? "—"
                : dateFinFmt.format(end);
              const msg =
                participationMsg?.concoursId === row.id ? participationMsg : null;

              return (
                <li
                  key={row.id}
                  style={{
                    borderRadius: "14px",
                    padding: "1.35rem 1.25rem",
                    background: "#111",
                    border: "1px solid rgba(245, 240, 232, 0.1)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <h2
                      style={{
                        fontFamily: "var(--font-bebas), Impact, sans-serif",
                        fontSize: "1.65rem",
                        letterSpacing: "0.05em",
                        margin: "0 0 0.5rem",
                        color: ROUGE,
                        lineHeight: 1.1,
                      }}
                    >
                      {row.titre?.trim() || "Concours"}
                    </h2>
                    {row.description?.trim() ? (
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.95rem",
                          lineHeight: 1.55,
                          opacity: 0.88,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {row.description.trim()}
                      </p>
                    ) : null}
                  </div>

                  <dl
                    style={{
                      margin: 0,
                      display: "grid",
                      gap: "0.65rem",
                      fontSize: "0.9rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                        padding: "0.65rem 0.75rem",
                        borderRadius: "10px",
                        background: "rgba(245, 240, 232, 0.04)",
                        border: "1px solid rgba(245, 240, 232, 0.08)",
                      }}
                    >
                      <dt style={{ opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.72rem" }}>
                        Date de fin
                      </dt>
                      <dd style={{ margin: 0, fontWeight: 600 }}>{endLabel}</dd>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                        padding: "0.65rem 0.75rem",
                        borderRadius: "10px",
                        background: "rgba(212, 160, 23, 0.08)",
                        border: "1px solid rgba(212, 160, 23, 0.28)",
                      }}
                    >
                      <dt style={{ opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.72rem", color: GOLD }}>
                        Points requis
                      </dt>
                      <dd style={{ margin: 0, fontWeight: 700, color: GOLD }}>
                        {pointsFmt.format(req)} PMQ
                      </dd>
                    </div>
                  </dl>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                    <button
                      type="button"
                      disabled={participatingId === row.id || !canParticiper}
                      onClick={() => handleParticiper(row)}
                      style={{
                        alignSelf: "flex-start",
                        background: already
                          ? "rgba(46, 204, 113, 0.15)"
                          : canParticiper
                            ? ROUGE
                            : "rgba(192, 57, 43, 0.25)",
                        color: TEXT,
                        border: already ? `1px solid ${VERT}` : "none",
                        borderRadius: "8px",
                        padding: "0.65rem 1.35rem",
                        fontSize: "0.95rem",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        cursor:
                          participatingId === row.id
                            ? "wait"
                            : canParticiper
                              ? "pointer"
                              : "not-allowed",
                        opacity: already ? 0.9 : canParticiper ? 1 : 0.65,
                      }}
                    >
                      {participatingId === row.id
                        ? "Envoi…"
                        : already
                          ? "Participation envoyée"
                          : "Participer"}
                    </button>
                    {totalPointsPmq < req ? (
                      <p style={{ margin: 0, fontSize: "0.82rem", opacity: 0.65 }}>
                        Solde insuffisant : il manque{" "}
                        <span style={{ color: GOLD, fontWeight: 600 }}>
                          {pointsFmt.format(Math.max(0, req - totalPointsPmq))} pts
                        </span>{" "}
                        pour atteindre le seuil.
                      </p>
                    ) : null}
                    {msg ? (
                      <p
                        role={msg.kind === "err" ? "alert" : "status"}
                        style={{
                          margin: 0,
                          fontSize: "0.85rem",
                          color: msg.kind === "ok" ? GOLD : ROUGE,
                          lineHeight: 1.45,
                        }}
                      >
                        {msg.text}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
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
                color: p.href === "/concours" ? GOLD : TEXT,
                opacity: p.href === "/concours" ? 1 : 0.75,
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

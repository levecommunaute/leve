"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { useAppBottomNavLinks } from "../../lib/useAppBottomNavLinks";
import { signOut } from "../../lib/auth";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";

const SB = "https://lrolatbudvianeazliax.supabase.co";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

type RestErr = { message: string };
type FeatureFlagsState = "loading" | "enabled" | "disabled";
type ActionType = "vote_concours" | "tirage";

type ProfileRow = {
  display_name: string | null;
  member_type: string | null;
  multiplier: number | string | null;
};

type ConcoursRow = {
  id: string;
  titre: string;
  description: string | null;
  date_fin: string;
  points_requis: number | string | null;
};

type ConcoursArtisteRow = {
  id: string;
  artiste_nom: string | null;
  artiste_pays: string | null;
  categorie: string | null;
  total_votes_pts: number | string | null;
};

type TirageRow = {
  id: string;
  trimestre: string | null;
  date_tirage: string | null;
};

type VoteArtisteRow = {
  id: string;
};

type TirageTicketRow = {
  nb_tickets: number | string | null;
};

type MessageState = {
  kind: "ok" | "err";
  text: string;
} | null;

function supabaseRestHeaders(accessToken: string): HeadersInit {
  return {
    apikey: KEY,
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
}

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

const pointsFmt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "long",
  timeStyle: "short",
});

function displayNameFrom(profile: ProfileRow | null, session: Session): string {
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

function pts(n: number | string | null | undefined): number {
  const num = Number(n ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export default function ConcoursPage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const navPages = useAppBottomNavLinks(session);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [totalPointsPmq, setTotalPointsPmq] = useState(0);
  const [concours, setConcours] = useState<ConcoursRow[]>([]);
  const [artistes, setArtistes] = useState<ConcoursArtisteRow[]>([]);
  const [votesArtistesUsed, setVotesArtistesUsed] = useState(0);
  const [tirageActif, setTirageActif] = useState<TirageRow | null>(null);
  const [ticketsTirage, setTicketsTirage] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const [featureFlagsState, setFeatureFlagsState] = useState<FeatureFlagsState>("loading");
  const [flagConcoursArtistes, setFlagConcoursArtistes] = useState(false);
  const [flagTirage, setFlagTirage] = useState(false);

  const [participatingId, setParticipatingId] = useState<string | null>(null);
  const [participatedIds, setParticipatedIds] = useState<Set<string>>(() => new Set());
  const [participationMsg, setParticipationMsg] = useState<{
    concoursId: string;
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const [votingArtisteId, setVotingArtisteId] = useState<string | null>(null);
  const [voteArtisteMsg, setVoteArtisteMsg] = useState<MessageState>(null);

  const [buyingTicket, setBuyingTicket] = useState(false);
  const [ticketMsg, setTicketMsg] = useState<MessageState>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [concoursRes, artistesRes, tirageRes] = await Promise.all([
          fetch("/api/feature-flags?nom=concours", { cache: "no-store" }),
          fetch("/api/feature-flags?nom=concours-artistes", { cache: "no-store" }),
          fetch("/api/feature-flags?nom=tirage", { cache: "no-store" }),
        ]);
        const [concoursJson, artistesJson, tirageJson] = (await Promise.all([
          concoursRes.json(),
          artistesRes.json(),
          tirageRes.json(),
        ])) as Array<{ actif?: boolean }>;
        if (cancelled) return;
        const concoursOn = concoursJson?.actif ?? false;
        const artistesOn = artistesJson?.actif ?? false;
        const tirageOn = tirageJson?.actif ?? false;
        console.log("[concours] feature flags", {
          concours: concoursOn,
          "concours-artistes": artistesOn,
          tirage: tirageOn,
        });
        setFeatureFlagsState(concoursOn ? "enabled" : "disabled");
        setFlagConcoursArtistes(artistesOn);
        setFlagTirage(tirageOn);
      } catch {
        if (!cancelled) {
          setFeatureFlagsState("disabled");
          setFlagConcoursArtistes(false);
          setFlagTirage(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPage = useCallback(
    async (activeSession: Session) => {
      const token = activeSession.access_token;
      const uid = activeSession.user.id;
      const nowIso = new Date().toISOString();

      const baseReqs = await Promise.all([
        fetchRest<ProfileRow[]>(
          `profiles?select=display_name,member_type,multiplier&id=eq.${encodeURIComponent(uid)}`,
          token,
        ),
        fetchRest<{ amount?: unknown }[]>(
          `points_transactions?select=amount&membre_id=eq.${encodeURIComponent(uid)}&type=eq.quiz`,
          token,
        ),
        fetchRest<ConcoursRow[]>(
          `concours?select=id,titre,description,date_fin,points_requis&date_fin=gte.${encodeURIComponent(nowIso)}&order=date_fin.asc`,
          token,
        ),
        flagConcoursArtistes
          ? fetchRest<ConcoursArtisteRow[]>(
              "concours_artistes?select=id,artiste_nom,artiste_pays,categorie,total_votes_pts&actif=eq.true&order=artiste_nom.asc",
              token,
            )
          : Promise.resolve({ data: [] as ConcoursArtisteRow[], error: null }),
        flagConcoursArtistes
          ? fetchRest<VoteArtisteRow[]>(
              `votes_concours_artistes?select=id&membre_id=eq.${encodeURIComponent(uid)}`,
              token,
            )
          : Promise.resolve({ data: [] as VoteArtisteRow[], error: null }),
        flagTirage
          ? fetchRest<TirageRow[]>(
              "tirages?select=id,trimestre,date_tirage&actif=eq.true&order=date_tirage.asc&limit=1",
              token,
            )
          : Promise.resolve({ data: [] as TirageRow[], error: null }),
      ]);

      const [profileRes, txRes, concoursRes, artistesRes, votesRes, tiragesRes] = baseReqs;
      let ticketsRes:
        | { data: TirageTicketRow[]; error: null }
        | { data: null; error: RestErr } = { data: [], error: null };

      const activeTirage = tiragesRes.error ? null : (tiragesRes.data?.[0] ?? null);
      if (flagTirage && activeTirage?.id) {
        ticketsRes = await fetchRest<TirageTicketRow[]>(
          `tirage_tickets?select=nb_tickets&membre_id=eq.${encodeURIComponent(uid)}&tirage_id=eq.${encodeURIComponent(activeTirage.id)}`,
          token,
        );
      }

      const errMsg =
        profileRes.error?.message ??
        txRes.error?.message ??
        concoursRes.error?.message ??
        artistesRes.error?.message ??
        votesRes.error?.message ??
        tiragesRes.error?.message ??
        ticketsRes.error?.message ??
        null;
      setLoadError(errMsg);

      if (!profileRes.error) setProfile(profileRes.data?.[0] ?? null);
      if (!txRes.error) {
        const sum = (txRes.data ?? []).reduce((acc, row) => acc + Number(row.amount ?? 0), 0);
        setTotalPointsPmq(sum);
      } else {
        setTotalPointsPmq(0);
      }
      setConcours(concoursRes.error ? [] : (concoursRes.data ?? []));
      const artistesList = artistesRes.error ? [] : (artistesRes.data ?? []);
      setArtistes(artistesList);
      console.log("[concours] concours_artistes (actif=true)", {
        flagConcoursArtistes,
        error: artistesRes.error?.message ?? null,
        count: artistesList.length,
        sample: artistesList.slice(0, 3),
      });

      if (votesRes.error) {
        setVotesArtistesUsed(0);
      } else {
        setVotesArtistesUsed((votesRes.data ?? []).length);
      }

      setTirageActif(activeTirage);
      console.log("[concours] tirages (actif=true)", {
        flagTirage,
        error: tiragesRes.error?.message ?? null,
        activeTirage,
      });
      if (ticketsRes.error) {
        setTicketsTirage(0);
      } else {
        const total = (ticketsRes.data ?? []).reduce((acc, row) => {
          const value = Number(row.nb_tickets ?? 0);
          return acc + (Number.isFinite(value) && value > 0 ? value : 0);
        }, 0);
        setTicketsTirage(total);
      }
    },
    [flagConcoursArtistes, flagTirage],
  );

  useEffect(() => {
    if (featureFlagsState === "loading") return;

    let cancelled = false;
    async function applyCookieSession(next: Session | null): Promise<void> {
      if (cancelled) return;
      if (!next) {
        setSession(null);
        setProfile(null);
        setConcours([]);
        setArtistes([]);
        setTirageActif(null);
        setTicketsTirage(0);
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
      if (document.visibilityState === "visible") syncFromCookies();
    };
    document.addEventListener("visibilitychange", onVisible);
    const pollId = window.setInterval(syncFromCookies, 15000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(pollId);
    };
  }, [loadPage, featureFlagsState]);

  const isFounderBonusEligible = useMemo(() => {
    const memberType = (profile?.member_type ?? "").toLowerCase().trim();
    return memberType === "fondateur" && Number(profile?.multiplier ?? 1) >= 2;
  }, [profile?.member_type, profile?.multiplier]);

  async function spendPa(
    action: ActionType,
    ptsPa: number,
    targetId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    if (!session?.user.id) return { success: false, message: "Session invalide" };
    try {
      const res = await fetch("/api/pa/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membre_id: session.user.id,
          type: action,
          pts_pa: ptsPa,
          target_id: targetId,
        }),
      });
      const j = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        return { success: false, message: j.error || "Action impossible" };
      }
      return { success: true };
    } catch {
      return { success: false, message: "Erreur réseau" };
    }
  }

  async function handleVoteArtiste(artisteId: string): Promise<void> {
    if (votesArtistesUsed >= 3) {
      setVoteArtisteMsg({ kind: "err", text: "Maximum 3 votes atteint pour ce concours." });
      return;
    }
    setVotingArtisteId(artisteId);
    setVoteArtisteMsg(null);
    const result = await spendPa("vote_concours", 5, artisteId);
    setVotingArtisteId(null);
    if (!result.success) {
      setVoteArtisteMsg({ kind: "err", text: result.message });
      return;
    }
    setVoteArtisteMsg({
      kind: "ok",
      text: isFounderBonusEligible && votesArtistesUsed === 0
        ? "Vote enregistré (bonus fondateur appliqué)."
        : "Vote enregistré.",
    });
    if (session) await loadPage(session);
  }

  async function handleAcheterTicket(): Promise<void> {
    if (!tirageActif?.id) {
      setTicketMsg({ kind: "err", text: "Aucun tirage actif." });
      return;
    }
    if (ticketsTirage >= 10) {
      setTicketMsg({ kind: "err", text: "Maximum 10 tickets atteint pour ce trimestre." });
      return;
    }
    setBuyingTicket(true);
    setTicketMsg(null);
    const result = await spendPa("tirage", 10, tirageActif.id);
    setBuyingTicket(false);
    if (!result.success) {
      setTicketMsg({ kind: "err", text: result.message });
      return;
    }
    setTicketMsg({ kind: "ok", text: "Ticket ajouté avec succès." });
    if (session) await loadPage(session);
  }

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
    const req = Math.max(0, pts(row.points_requis));
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
        text: "Merci ! Votre participation est notée pour ce concours.",
      });
    }, 250);
  }

  const fonts = `${bebas.variable} ${dmSans.variable}`;
  const name = session && profile ? displayNameFrom(profile, session) : "";

  if (featureFlagsState === "loading" || session === undefined) {
    return (
      <div
        className={fonts}
        style={{
          minHeight: "100vh",
          background: BG,
          color: TEXT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-dm), system-ui, sans-serif",
        }}
      >
        <p style={{ opacity: 0.75 }}>Chargement…</p>
      </div>
    );
  }

  if (featureFlagsState === "disabled") {
    return (
      <div className={fonts} style={{ minHeight: "100vh", background: BG, color: TEXT }}>
        <main style={{ maxWidth: "960px", margin: "0 auto", padding: "2rem 1.25rem" }}>
          <p style={{ opacity: 0.8 }}>La section concours est désactivée pour le moment.</p>
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={fonts} style={{ minHeight: "100vh", background: BG, color: TEXT }}>
        <main style={{ maxWidth: "960px", margin: "0 auto", padding: "2rem 1.25rem" }}>
          <p style={{ opacity: 0.8 }}>Connecte-toi pour accéder aux concours.</p>
        </main>
      </div>
    );
  }

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
          zIndex: 20,
        }}
      >
        <Link href="/" style={{ fontFamily: "var(--font-bebas), Impact, sans-serif", fontSize: "2rem", letterSpacing: "0.12em", color: TEXT, textDecoration: "none" }}>
          LEVE
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.9rem", opacity: 0.85 }}>{name}</span>
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
        {loadError ? <p role="alert" style={{ color: ROUGE }}>{loadError}</p> : null}

        <section style={{ borderRadius: "14px", padding: "1.5rem", marginBottom: "1rem", background: "rgba(245, 240, 232, 0.03)", border: "1px solid rgba(245, 240, 232, 0.1)" }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-bebas), Impact, sans-serif", letterSpacing: "0.08em", fontSize: "2.2rem" }}>
            CONCOURS PMQ
          </h1>
          <p style={{ margin: "0.75rem 0 0", opacity: 0.85 }}>
            Solde PMQ: <strong style={{ color: GOLD }}>{pointsFmt.format(totalPointsPmq)}</strong>
          </p>
        </section>

        {concours.map((row) => {
          const req = Math.max(0, pts(row.points_requis));
          const already = participatedIds.has(row.id);
          const canParticiper = totalPointsPmq >= req && !already;
          const end = new Date(row.date_fin);
          const msg = participationMsg?.concoursId === row.id ? participationMsg : null;
          return (
            <section key={row.id} style={{ borderRadius: "14px", padding: "1.25rem", marginBottom: "0.9rem", background: "#111", border: "1px solid rgba(245, 240, 232, 0.1)" }}>
              <h2 style={{ margin: "0 0 0.5rem", color: ROUGE, fontFamily: "var(--font-bebas), Impact, sans-serif", letterSpacing: "0.06em" }}>
                {row.titre || "Concours"}
              </h2>
              {row.description ? <p style={{ margin: "0 0 0.5rem", opacity: 0.85 }}>{row.description}</p> : null}
              <p style={{ margin: 0, opacity: 0.7 }}>Date de fin: {Number.isNaN(end.getTime()) ? "?" : dateFmt.format(end)}</p>
              <p style={{ margin: "0.4rem 0 0.9rem", opacity: 0.8 }}>Points requis: {pointsFmt.format(req)} PMQ</p>
              <button
                type="button"
                disabled={participatingId === row.id || !canParticiper}
                onClick={() => handleParticiper(row)}
                style={{
                  background: canParticiper ? ROUGE : "rgba(192, 57, 43, 0.25)",
                  color: TEXT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.65rem 1.2rem",
                  cursor: canParticiper ? "pointer" : "not-allowed",
                }}
              >
                {participatingId === row.id ? "Envoi..." : already ? "Participation envoyée" : "Participer"}
              </button>
              {msg ? <p style={{ margin: "0.65rem 0 0", color: msg.kind === "ok" ? GOLD : ROUGE }}>{msg.text}</p> : null}
            </section>
          );
        })}

        {flagConcoursArtistes ? (
          <section style={{ borderRadius: "14px", padding: "1.5rem", marginTop: "1.5rem", background: "rgba(245, 240, 232, 0.03)", border: "1px solid rgba(245, 240, 232, 0.1)" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-bebas), Impact, sans-serif", letterSpacing: "0.08em", fontSize: "2rem" }}>
              CONCOURS ARTISTES
            </h2>
            <p style={{ margin: "0.65rem 0 1rem", opacity: 0.82 }}>
              Votes utilisés: {votesArtistesUsed}/3
              {isFounderBonusEligible ? " (1er vote gratuit bonus fondateur)" : ""}
            </p>
            {artistes.length === 0 ? (
              <p style={{ margin: 0, opacity: 0.75 }}>Aucun artiste actif pour le moment.</p>
            ) : (
              artistes.map((artiste) => (
                <article key={artiste.id} style={{ borderRadius: "12px", padding: "1rem", marginBottom: "0.75rem", background: "#111", border: "1px solid rgba(245, 240, 232, 0.1)" }}>
                  <h3 style={{ margin: 0, color: GOLD }}>{artiste.artiste_nom?.trim() || "Artiste"}</h3>
                  <p style={{ margin: "0.35rem 0 0.75rem", opacity: 0.82 }}>
                    {artiste.artiste_pays || "Pays ?"} · {artiste.categorie || "Catégorie ?"} · {pointsFmt.format(pts(artiste.total_votes_pts))} votes
                  </p>
                  <button
                    type="button"
                    disabled={votingArtisteId === artiste.id || votesArtistesUsed >= 3}
                    onClick={() => void handleVoteArtiste(artiste.id)}
                    style={{
                      background: ROUGE,
                      color: TEXT,
                      border: "none",
                      borderRadius: "8px",
                      padding: "0.6rem 1rem",
                      cursor: votesArtistesUsed >= 3 ? "not-allowed" : "pointer",
                      opacity: votesArtistesUsed >= 3 ? 0.55 : 1,
                    }}
                  >
                    {votingArtisteId === artiste.id ? "Vote..." : "Voter (5 pts PA)"}
                  </button>
                </article>
              ))
            )}
            {voteArtisteMsg ? (
              <p role={voteArtisteMsg.kind === "err" ? "alert" : "status"} style={{ color: voteArtisteMsg.kind === "ok" ? GOLD : ROUGE, margin: "0.35rem 0 0" }}>
                {voteArtisteMsg.text}
              </p>
            ) : null}
          </section>
        ) : null}

        {flagTirage ? (
          <section style={{ borderRadius: "14px", padding: "1.5rem", marginTop: "1.5rem", background: "rgba(245, 240, 232, 0.03)", border: "1px solid rgba(245, 240, 232, 0.1)" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-bebas), Impact, sans-serif", letterSpacing: "0.08em", fontSize: "2rem" }}>
              TIRAGE TRIMESTRIEL
            </h2>
            <p style={{ margin: "0.65rem 0 0.35rem", opacity: 0.82 }}>
              Trimestre: {tirageActif?.trimestre || "-"}
            </p>
            <p style={{ margin: "0 0 0.35rem", opacity: 0.82 }}>
              Date tirage: {tirageActif?.date_tirage ? dateFmt.format(new Date(tirageActif.date_tirage)) : "-"}
            </p>
            <p style={{ margin: "0 0 0.85rem", opacity: 0.82 }}>
              Vos tickets: {ticketsTirage}/10
            </p>
            <button
              type="button"
              disabled={buyingTicket || !tirageActif?.id || ticketsTirage >= 10}
              onClick={() => void handleAcheterTicket()}
              style={{
                background: ROUGE,
                color: TEXT,
                border: "none",
                borderRadius: "8px",
                padding: "0.6rem 1rem",
                cursor: ticketsTirage >= 10 ? "not-allowed" : "pointer",
                opacity: ticketsTirage >= 10 ? 0.55 : 1,
              }}
            >
              {buyingTicket ? "Achat..." : "Acheter un ticket (10 pts PA)"}
            </button>
            {ticketMsg ? (
              <p role={ticketMsg.kind === "err" ? "alert" : "status"} style={{ color: ticketMsg.kind === "ok" ? GOLD : ROUGE, margin: "0.6rem 0 0" }}>
                {ticketMsg.text}
              </p>
            ) : null}
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
        <div style={{ display: "flex", overflowX: "auto", gap: "0.5rem", maxWidth: "960px", margin: "0 auto" }}>
          {navPages.map((p) => (
            <Link key={p.href} href={p.href} style={{ flex: "0 0 auto", fontSize: "0.68rem", color: p.href === "/concours" ? GOLD : TEXT, opacity: p.href === "/concours" ? 1 : 0.75, textDecoration: "none", padding: "0.35rem 0.5rem", whiteSpace: "nowrap" }}>
              {p.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

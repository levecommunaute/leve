"use client";

import { createBrowserClient } from "@repo/supabase/browser";
import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { signOut } from "../../lib/auth";

const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });

const BG = "#080808";
const TEXT = "#F5F0E8";
const ROUGE = "#C0392B";
const GOLD = "#D4A017";
const SB = "https://lrolatbudvianeazliax.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

type ProfileRow = {
  display_name: string | null;
  email: string | null;
  member_type: string | null;
  multiplier: number | string | null;
  numero_membre: string | null;
};

type QuizSubmissionRow = {
  video_id: string;
  score: number | null;
  points_awarded: number | null;
  completed_at?: string | null;
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

function displayNameFrom(profile: ProfileRow | null, session: Session): string {
  const meta = session.user.user_metadata as Record<string, unknown> | undefined;
  const fullName = typeof meta?.full_name === "string" ? meta.full_name : undefined;
  return profile?.display_name?.trim() || fullName || session.user.email?.split("@")[0] || "Membre";
}

const navPages: { href: string; label: string }[] = [
  { href: "/", label: "Accueil" },
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/videos", label: "Vidéos" },
  { href: "/banque", label: "Banque LEVE" },
  { href: "/classement", label: "Classement" },
  { href: "/transparence", label: "Transparence" },
  { href: "/profil", label: "Profil" },
];

const pointsFmt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short" });

export default function ProfilPage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [totalPointsPmq, setTotalPointsPmq] = useState(0);
  const [quizRows, setQuizRows] = useState<{ video_id: string; title: string; score: number; points: number; at: string | null; }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadProfil = useCallback(async (activeSession: Session) => {
    const uid = activeSession.user.id;
    const token = activeSession.access_token;

    const [profileRes, txRes, quizRes] = await Promise.all([
      fetch(`${SB}/rest/v1/profiles?id=eq.${uid}&select=display_name,email,member_type,multiplier,numero_membre`, {
        headers: { apikey: KEY, Authorization: `Bearer ${token}` }
      }).then(r => r.json()),
      fetch(`${SB}/rest/v1/points_transactions?membre_id=eq.${uid}&select=amount`, {
        headers: { apikey: KEY, Authorization: `Bearer ${token}` }
      }).then(r => r.json()),
      fetch(`${SB}/rest/v1/quiz_submissions?membre_id=eq.${uid}&select=video_id,score,points_awarded,completed_at&order=completed_at.desc&limit=5`, {
        headers: { apikey: KEY, Authorization: `Bearer ${token}` }
      }).then(r => r.json()),
    ]);

    const profileData = Array.isArray(profileRes) ? profileRes[0] : null;
    setProfile(profileData as ProfileRow | null);

    const txData = Array.isArray(txRes) ? txRes : [];
    const sum = txData.reduce((acc: number, row: { amount: unknown }) => acc + Number(row.amount ?? 0), 0);
    setTotalPointsPmq(sum);

    const quizSubs = Array.isArray(quizRes) ? quizRes as QuizSubmissionRow[] : [];
    const ids = [...new Set(quizSubs.map((s) => s.video_id).filter(Boolean))];
    let titles = new Map<string, string>();
    if (ids.length > 0) {
      const vRes = await fetch(`${SB}/rest/v1/videos?id=in.(${ids.join(",")})&select=id,title`, {
        headers: { apikey: KEY, Authorization: `Bearer ${token}` }
      }).then(r => r.json());
      if (Array.isArray(vRes)) {
        titles = new Map(vRes.map((v: { id: string; title: string }) => [String(v.id), String(v.title ?? "")]));
      }
    }
    setQuizRows(quizSubs.map((s) => ({
      video_id: s.video_id,
      title: titles.get(s.video_id)?.trim() || "Vidéo",
      score: Number(s.score ?? 0),
      points: Number(s.points_awarded ?? 0),
      at: s.completed_at ?? null,
    })));

  }, []);

  useEffect(() => {
    const supabase = createBrowserClient();
    let cancelled = false;

    void (async () => {
      const { data: { session: initial } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!initial) { setSession(null); router.replace("/"); return; }
      setSession(initial);
      await loadProfil(initial);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (cancelled) return;
      if (!nextSession) { setSession(null); router.replace("/"); return; }
      setSession(nextSession);
      await loadProfil(nextSession);
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [loadProfil, router]);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try { await signOut(); router.replace("/"); } catch { setSigningOut(false); }
  }

  const fonts = `${bebas.variable} ${dmSans.variable}`;

  if (session === undefined) {
    return (
      <div className={fonts} style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "var(--font-dm), system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ opacity: 0.7 }}>Chargement…</p>
      </div>
    );
  }

  if (!session) return null;

  const name = displayNameFrom(profile, session);
  const memberLabel = formatMemberTypeLabel(profile?.member_type ?? null);
  const mult = Number(profile?.multiplier ?? 1);
  const multiplierDisplay = `${Number.isFinite(mult) ? mult.toFixed(1) : "1.0"}×`;
  const emailDisplay = profile?.email?.trim() || session.user.email?.trim() || "—";

  return (
    <div className={fonts} style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "var(--font-dm), system-ui, sans-serif", paddingBottom: "6rem" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid rgba(245, 240, 232, 0.08)", position: "sticky", top: 0, background: "rgba(8, 8, 8, 0.92)", backdropFilter: "blur(8px)", zIndex: 20 }}>
        <Link href="/" style={{ fontFamily: "var(--font-bebas), Impact, sans-serif", fontSize: "2rem", letterSpacing: "0.12em", color: TEXT, textDecoration: "none" }}>LEVE</Link>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.9rem", opacity: 0.85, maxWidth: "42vw", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          <button type="button" disabled={signingOut} onClick={() => void handleSignOut()} style={{ background: "transparent", color: ROUGE, border: `1px solid ${ROUGE}`, borderRadius: "6px", padding: "0.45rem 0.9rem", fontSize: "0.8rem", cursor: signingOut ? "wait" : "pointer" }}>
            {signingOut ? "…" : "Déconnexion"}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: "960px", margin: "0 auto", padding: "1.25rem" }}>
        {loadError ? <p role="alert" style={{ color: ROUGE, fontSize: "0.9rem", marginBottom: "1rem" }}>{loadError}</p> : null}

        <section style={{ borderRadius: "14px", padding: "1.75rem 1.5rem", marginBottom: "1.25rem", background: "linear-gradient(145deg, rgba(192, 57, 43, 0.12) 0%, rgba(8, 8, 8, 0.9) 45%, rgba(212, 160, 23, 0.06) 100%)", border: "1px solid rgba(245, 240, 232, 0.1)" }}>
          <p style={{ margin: 0, opacity: 0.65, fontSize: "0.85rem" }}>Profil membre{profile?.numero_membre ? ` · #${profile.numero_membre}` : ""}</p>
          <h1 style={{ fontFamily: "var(--font-bebas), Impact, sans-serif", fontSize: "clamp(2rem, 7vw, 3rem)", letterSpacing: "0.04em", margin: "0.35rem 0 0.75rem", lineHeight: 1.05, color: TEXT }}>{name}</h1>
          <span style={{ display: "inline-block", background: ROUGE, color: TEXT, fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.35rem 0.75rem", borderRadius: "999px" }}>{memberLabel}</span>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.85rem", marginBottom: "1.75rem" }}>
          <article style={{ borderRadius: "12px", padding: "1.1rem", background: "rgba(245, 240, 232, 0.04)", border: `1px solid rgba(212, 160, 23, 0.35)` }}>
            <p style={{ margin: 0, fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD, opacity: 0.95 }}>Total points PMQ</p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "1.65rem", fontWeight: 700, color: GOLD }}>{pointsFmt.format(totalPointsPmq)}</p>
          </article>
          <article style={{ borderRadius: "12px", padding: "1.1rem", background: "rgba(245, 240, 232, 0.04)", border: "1px solid rgba(245, 240, 232, 0.12)" }}>
            <p style={{ margin: 0, fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.55 }}>Multiplicateur</p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "1.65rem", fontWeight: 700, color: TEXT }}>{multiplierDisplay}</p>
          </article>
        </div>

        <section style={{ borderRadius: "12px", padding: "1.25rem 1.1rem", marginBottom: "1.75rem", background: "#111", border: "1px solid rgba(245, 240, 232, 0.08)" }}>
          <h2 style={{ fontFamily: "var(--font-bebas), Impact, sans-serif", fontSize: "1.35rem", letterSpacing: "0.06em", color: ROUGE, margin: "0 0 1rem" }}>Informations</h2>
          <dl style={{ margin: 0, display: "grid", gap: "0.85rem", fontSize: "0.95rem" }}>
            <div>
              <dt style={{ opacity: 0.55, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Nom affiché</dt>
              <dd style={{ margin: "0.25rem 0 0" }}>{name}</dd>
            </div>
            <div>
              <dt style={{ opacity: 0.55, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Courriel</dt>
              <dd style={{ margin: "0.25rem 0 0", wordBreak: "break-word" }}>{emailDisplay}</dd>
            </div>
            <div>
              <dt style={{ opacity: 0.55, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Type de membre</dt>
              <dd style={{ margin: "0.25rem 0 0" }}>{memberLabel}</dd>
            </div>
            <div>
              <dt style={{ opacity: 0.55, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Numéro membre</dt>
              <dd style={{ margin: "0.25rem 0 0" }}>{profile?.numero_membre?.trim() ? `#${profile.numero_membre}` : "—"}</dd>
            </div>
          </dl>
        </section>

        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontFamily: "var(--font-bebas), Impact, sans-serif", fontSize: "1.35rem", letterSpacing: "0.08em", margin: "0 0 0.75rem", color: GOLD }}>Derniers quiz</h2>
          <p style={{ margin: "0 0 1rem", opacity: 0.75, fontSize: "0.9rem" }}>Les 5 dernières soumissions enregistrées.</p>
          {quizRows.length === 0 ? (
            <p style={{ opacity: 0.65, fontSize: "0.95rem" }}>Aucun quiz complété pour le moment.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {quizRows.map((row, i) => (
                <li key={`${row.video_id}-${row.at ?? i}`} style={{ borderRadius: "10px", padding: "1rem", background: "rgba(245, 240, 232, 0.04)", border: "1px solid rgba(245, 240, 232, 0.1)", display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "0.5rem" }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600 }}>{row.title}</p>
                    {row.at ? <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", opacity: 0.55 }}>{dateFmt.format(new Date(row.at))}</p> : null}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ color: GOLD, fontWeight: 700 }}>+{pointsFmt.format(row.points)} pts</span>
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", opacity: 0.75 }}>Score : {row.score} bonnes réponses</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(8, 8, 8, 0.97)", borderTop: "1px solid rgba(245, 240, 232, 0.1)", padding: "0.5rem 0.35rem calc(0.5rem + env(safe-area-inset-bottom))", zIndex: 30 }}>
        <div style={{ display: "flex", overflowX: "auto", gap: "0.5rem", justifyContent: "flex-start", maxWidth: "960px", margin: "0 auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
          {navPages.map((p) => (
            <Link key={p.href} href={p.href} style={{ flex: "0 0 auto", fontSize: "0.68rem", color: p.href === "/profil" ? GOLD : TEXT, opacity: p.href === "/profil" ? 1 : 0.75, textDecoration: "none", padding: "0.35rem 0.5rem", whiteSpace: "nowrap" }}>{p.label}</Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
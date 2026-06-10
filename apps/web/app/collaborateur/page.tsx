"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { isCollaborateurMemberType } from "../../lib/pcol";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";
import { useAppBottomNavLinks } from "../../lib/useAppBottomNavLinks";

const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });

const BG = "#080808";
const TEXT = "#F5F0E8";
const ROUGE = "#C0392B";
const GOLD = "#D4A017";
const VERT = "#2ECC71";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://lrolatbudvianeazliax.supabase.co";
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

const pointsFmt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
const cadFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});

const PTC_UNIT_DOLLARS = 5;

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type ProfileRow = {
  display_name: string | null;
  member_type: string | null;
};

type PendingRow = {
  id: string;
  video_id: string;
  video_title: string;
  points_pending_cumul: number;
  valeur_dollars_cumul: number;
  date_expiration: string;
  statut: string;
  pourcentage_fixe: number | null;
  recupere_le: string | null;
};

type VideoStats = {
  videoId: string;
  title: string;
  quizCount: number;
  ptsPcolGeneres: number;
  pendingPoints: number;
  pendingDollars: number;
  dateExpiration: string | null;
  statut: string | null;
  pourcentageFixe: number | null;
  recupereLe: string | null;
};

type PcolTxRow = {
  video_id: string | null;
  collaborateur_id: string | null;
  pts_collab_ponderes: number | string | null;
  pts_membres_gagnes_ponderes: number | string | null;
  created_at?: string | null;
};

type MonthBounds = {
  startIso: string;
  endIso: string;
  monthDate: string;
  label: string;
};

type RedistMonthRow = {
  month?: string | null;
};

type VideoRow = {
  id: string;
  title: string | null;
};

type PendingDbRow = {
  id: string;
  video_id: string;
  points_pending_cumul: number | string | null;
  valeur_dollars_cumul: number | string | null;
  date_expiration: string | null;
  statut: string | null;
  pourcentage_fixe: number | string | null;
  recupere_le: string | null;
};

type RedistRow = {
  value_per_point: number | string | null;
};

type PtcInfo = {
  pts_perdus_mois: number;
  valeur_par_pt: number | null;
  dollars_mois: number | null;
  ptc_mois: number | null;
  ptc_balance: number;
  ptc_balance_units: number;
};

async function fetchPtcInfo(
  accessToken: string,
): Promise<{ data: PtcInfo | null; error: string | null }> {
  try {
    const res = await fetch("/api/collaborateur/ptc", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const json = (await res.json()) as Partial<PtcInfo> & { error?: string };
    if (!res.ok) {
      return { data: null, error: json?.error ?? "Erreur réseau" };
    }
    return {
      data: {
        pts_perdus_mois: Number(json.pts_perdus_mois ?? 0),
        valeur_par_pt: json.valeur_par_pt != null ? Number(json.valeur_par_pt) : null,
        dollars_mois: json.dollars_mois != null ? Number(json.dollars_mois) : null,
        ptc_mois: json.ptc_mois != null ? Number(json.ptc_mois) : null,
        ptc_balance: Number(json.ptc_balance ?? 0),
        ptc_balance_units: Number(json.ptc_balance_units ?? 0),
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function msUntil(iso: string): number {
  return new Date(iso).getTime() - Date.now();
}

function daysRemaining(iso: string): number {
  const ms = msUntil(iso);
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expiré";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  return `${days}j ${hours.toString().padStart(2, "0")}h ${minutes.toString().padStart(2, "0")}m`;
}

function isActivePendingStatut(statut: string): boolean {
  return statut === "pending";
}

function isInactiveStatut(statut: string): boolean {
  return statut === "transferred" || statut === "recupere" || statut === "expired";
}

function isTransferredStatut(statut: string): boolean {
  return statut === "transferred" || statut === "recupere";
}

function formatRecupereLe(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function transferredLabel(pourcentageFixe: number | null, recupereLe: string | null): string {
  const pct = pourcentageFixe != null ? `${pourcentageFixe}` : "—";
  return `✅ ${pct} % fixé — Récupéré le ${formatRecupereLe(recupereLe)}`;
}

function capitalizeFr(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function monthBoundsFor(year: number, monthIndex0: number): MonthBounds {
  const start = new Date(year, monthIndex0, 1);
  const end = new Date(year, monthIndex0 + 1, 1);
  const monthKey = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;
  const label = capitalizeFr(
    new Intl.DateTimeFormat("fr-CA", {
      month: "long",
      year: "numeric",
    }).format(start),
  );
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    monthDate: `${monthKey}-01`,
    label,
  };
}

function currentAndPreviousMonthBounds(): {
  current: MonthBounds;
  previous: MonthBounds;
} {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  return {
    current: monthBoundsFor(y, m),
    previous: monthBoundsFor(prevY, prevM),
  };
}

function createdAtRangeFilter(bounds: MonthBounds): string {
  return (
    `&created_at=gte.${encodeURIComponent(bounds.startIso)}` +
    `&created_at=lt.${encodeURIComponent(bounds.endIso)}`
  );
}

export default function CollaborateurPage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [soldePcolDollars, setSoldePcolDollars] = useState<number | null>(null);
  const [pcolMonthLabel, setPcolMonthLabel] = useState("");
  const [pcolCurrentMonthPts, setPcolCurrentMonthPts] = useState(0);
  const [prevMonthLabel, setPrevMonthLabel] = useState("");
  const [prevMonthPcolPts, setPrevMonthPcolPts] = useState(0);
  const [prevMonthRedistributed, setPrevMonthRedistributed] = useState(false);
  const [valeurParPt, setValeurParPt] = useState<number | null>(null);
  const [videoStats, setVideoStats] = useState<VideoStats[]>([]);
  const [pendingList, setPendingList] = useState<PendingRow[]>([]);
  const [totalQuizMembres, setTotalQuizMembres] = useState(0);
  const [totalPtsGeneresPonderes, setTotalPtsGeneresPonderes] = useState(0);
  const [ptcInfo, setPtcInfo] = useState<PtcInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const navPages = useAppBottomNavLinks(session, profile?.member_type);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const loadCollaborateur = useCallback(async (activeSession: Session) => {
    const uid = activeSession.user.id;
    const token = activeSession.access_token;
    const uidEnc = encodeURIComponent(uid);

    const profileRes = await restJson<ProfileRow[]>(
      `profiles?id=eq.${uidEnc}&select=display_name,member_type`,
      token,
    );

    if (profileRes.error) {
      setLoadError(profileRes.error);
      return;
    }

    const prof = profileRes.data?.[0] ?? null;
    setProfile(prof);

    if (!isCollaborateurMemberType(prof?.member_type)) {
      setLoadError("Accès réservé aux collaborateurs.");
      return;
    }

    const { current: currentMonth, previous: prevMonth } =
      currentAndPreviousMonthBounds();
    setPcolMonthLabel(currentMonth.label);
    setPrevMonthLabel(prevMonth.label);

    const [pcolRes, pcolCurrentRes, pcolPrevRes, videosRes, pendingRes, redistRes, prevHistRes, ptcRes] =
      await Promise.all([
        restJson<PcolTxRow[]>(
          `pcol_transactions?collaborateur_id=eq.${uidEnc}&select=video_id,collaborateur_id,pts_collab_ponderes,pts_membres_gagnes_ponderes,created_at&order=created_at.desc`,
          token,
        ),
        restJson<PcolTxRow[]>(
          `pcol_transactions?collaborateur_id=eq.${uidEnc}${createdAtRangeFilter(currentMonth)}&select=pts_collab_ponderes`,
          token,
        ),
        restJson<PcolTxRow[]>(
          `pcol_transactions?collaborateur_id=eq.${uidEnc}${createdAtRangeFilter(prevMonth)}&select=pts_collab_ponderes`,
          token,
        ),
        restJson<VideoRow[]>(
          `videos?collaborateur_id=eq.${uidEnc}&select=id,title&order=created_at.desc`,
          token,
        ),
        restJson<PendingDbRow[]>(
          `pending_pcol?collaborateur_id=eq.${uidEnc}&select=id,video_id,points_pending_cumul,valeur_dollars_cumul,date_expiration,statut,pourcentage_fixe,recupere_le&order=date_expiration.desc`,
          token,
        ),
        restJson<RedistRow[]>(
          `redistribution_history?select=value_per_point&order=created_at.desc&limit=1`,
          token,
        ),
        restJson<RedistMonthRow[]>(
          `redistribution_history?month=eq.${encodeURIComponent(prevMonth.monthDate)}&select=month&limit=1`,
          token,
        ),
        fetchPtcInfo(token),
      ]);

    const errMsg =
      pcolRes.error ??
      pcolCurrentRes.error ??
      pcolPrevRes.error ??
      videosRes.error ??
      pendingRes.error ??
      redistRes.error ??
      prevHistRes.error ??
      ptcRes.error ??
      null;
    if (errMsg) {
      setLoadError(errMsg);
      return;
    }

    const pcolRows = pcolRes.data ?? [];
    const videos = videosRes.data ?? [];
    const pendingRows = pendingRes.data ?? [];

    const valeurParPtRaw = redistRes.data?.[0]?.value_per_point;
    const valeurParPtNum =
      valeurParPtRaw != null && valeurParPtRaw !== ""
        ? Number(valeurParPtRaw)
        : null;
    const valeurParPtFinite =
      valeurParPtNum != null && Number.isFinite(valeurParPtNum) ? valeurParPtNum : null;

    const pcolGenere = pcolRows.reduce(
      (acc, r) => acc + Number(r.pts_collab_ponderes ?? 0),
      0,
    );
    const soldeDollars =
      valeurParPtFinite != null ? round2(pcolGenere * valeurParPtFinite) : null;

    const totalPtsGeneres = pcolRows.reduce(
      (acc, r) => acc + Number(r.pts_membres_gagnes_ponderes ?? 0),
      0,
    );

    const membresQuiz = new Set<string>();
    for (const row of pcolRows) {
      const mid = row.collaborateur_id != null ? String(row.collaborateur_id) : "";
      if (mid) membresQuiz.add(mid);
    }

    const videoTitleById = new Map(
      videos.map((v) => [String(v.id), String(v.title ?? "Vidéo")]),
    );

    const ptsCollabByVideo = new Map<string, number>();
    for (const row of pcolRows) {
      const vid = String(row.video_id ?? "");
      if (!vid) continue;
      ptsCollabByVideo.set(
        vid,
        (ptsCollabByVideo.get(vid) ?? 0) + Number(row.pts_collab_ponderes ?? 0),
      );
    }

    const pendingListMapped: PendingRow[] = pendingRows.map((p) => ({
      id: String(p.id),
      video_id: String(p.video_id),
      video_title: videoTitleById.get(String(p.video_id)) ?? "Vidéo",
      points_pending_cumul: Number(p.points_pending_cumul ?? 0),
      valeur_dollars_cumul: Number(p.valeur_dollars_cumul ?? 0),
      date_expiration: String(p.date_expiration ?? ""),
      statut: String(p.statut ?? "pending"),
      pourcentage_fixe:
        p.pourcentage_fixe != null && p.pourcentage_fixe !== ""
          ? Number(p.pourcentage_fixe)
          : null,
      recupere_le: p.recupere_le ? String(p.recupere_le) : null,
    }));

    const pendingByVideo = new Map<string, PendingRow>();
    for (const p of pendingListMapped) {
      pendingByVideo.set(p.video_id, p);
    }

    const quizCountByVideo = new Map<string, Set<string>>();
    for (const row of pcolRows) {
      const vid = String(row.video_id ?? "");
      const mid = row.collaborateur_id != null ? String(row.collaborateur_id) : "";
      if (!vid || !mid) continue;
      if (!quizCountByVideo.has(vid)) quizCountByVideo.set(vid, new Set());
      quizCountByVideo.get(vid)!.add(mid);
    }

    const videoStatsMapped: VideoStats[] = videos.map((v) => {
      const vid = String(v.id);
      const pending = pendingByVideo.get(vid);
      return {
        videoId: vid,
        title: String(v.title ?? "Vidéo"),
        quizCount: quizCountByVideo.get(vid)?.size ?? 0,
        ptsPcolGeneres: ptsCollabByVideo.get(vid) ?? 0,
        pendingPoints: pending?.points_pending_cumul ?? 0,
        pendingDollars: pending?.valeur_dollars_cumul ?? 0,
        dateExpiration: pending?.date_expiration ?? null,
        statut: pending?.statut ?? null,
        pourcentageFixe: pending?.pourcentage_fixe ?? null,
        recupereLe: pending?.recupere_le ?? null,
      };
    });

    const currentMonthPcol = (pcolCurrentRes.data ?? []).reduce(
      (acc, r) => acc + Number(r.pts_collab_ponderes ?? 0),
      0,
    );
    const prevMonthPcol = (pcolPrevRes.data ?? []).reduce(
      (acc, r) => acc + Number(r.pts_collab_ponderes ?? 0),
      0,
    );

    setSoldePcolDollars(soldeDollars);
    setPcolCurrentMonthPts(currentMonthPcol);
    setPrevMonthPcolPts(prevMonthPcol);
    setPtcInfo(ptcRes.data);
    setPrevMonthRedistributed(!prevHistRes.error && (prevHistRes.data ?? []).length > 0);
    setValeurParPt(valeurParPtFinite);
    setTotalPtsGeneresPonderes(totalPtsGeneres);
    setTotalQuizMembres(membresQuiz.size);
    setPendingList(pendingListMapped);
    setVideoStats(videoStatsMapped);
    setLoadError(null);
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
      await loadCollaborateur(next);
    }

    void applyCookieSession(readSessionFromAuthCookies());

    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        void applyCookieSession(readSessionFromAuthCookies());
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const pollId = window.setInterval(() => {
      void applyCookieSession(readSessionFromAuthCookies());
    }, 15000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(pollId);
    };
  }, [loadCollaborateur, router]);

  const fonts = `${bebas.variable} ${dmSans.variable}`;

  if (session === undefined) {
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
        }}
      >
        <p style={{ opacity: 0.7 }}>Chargement…</p>
      </div>
    );
  }

  if (!session) return null;

  const isCollab = isCollaborateurMemberType(profile?.member_type);

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
          href="/dashboard"
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
        <span style={{ fontSize: "0.85rem", color: GOLD, letterSpacing: "0.06em" }}>
          Espace collaborateur
        </span>
      </header>

      <main style={{ maxWidth: "960px", margin: "0 auto", padding: "1.25rem" }}>
        {loadError ? (
          <p role="alert" style={{ color: ROUGE, fontSize: "0.9rem", marginBottom: "1rem" }}>
            {loadError}
          </p>
        ) : null}

        {!isCollab ? (
          <p style={{ opacity: 0.75 }}>Cette page est réservée aux membres de type collaborateur.</p>
        ) : (
          <>
            <section
              style={{
                position: "relative",
                borderRadius: "14px",
                padding: "1.75rem 1.5rem",
                paddingBottom: prevMonthLabel ? "2.5rem" : "1.75rem",
                marginBottom: "1.25rem",
                background:
                  "linear-gradient(145deg, rgba(212, 160, 23, 0.15) 0%, rgba(8, 8, 8, 0.9) 50%, rgba(192, 57, 43, 0.08) 100%)",
                border: "1px solid rgba(212, 160, 23, 0.35)",
              }}
            >
              <p style={{ margin: 0, opacity: 0.65, fontSize: "0.85rem" }}>Solde PCOL total ($)</p>
              <p
                style={{
                  margin: "0.35rem 0 0",
                  fontSize: "clamp(2.2rem, 8vw, 3.2rem)",
                  fontWeight: 700,
                  color: GOLD,
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  letterSpacing: "0.04em",
                }}
              >
                {soldePcolDollars != null ? cadFmt.format(soldePcolDollars) : "—"}
              </p>
              {valeurParPt != null ? (
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", opacity: 0.5 }}>
                  Valeur par pt (dernière redistribution) : {cadFmt.format(valeurParPt)}
                </p>
              ) : null}
              <p style={{ margin: "1rem 0 0", opacity: 0.65, fontSize: "0.85rem" }}>
                PCOL · {pcolMonthLabel || "—"}
              </p>
              <p
                style={{
                  margin: "0.25rem 0 0",
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: TEXT,
                }}
              >
                {pointsFmt.format(pcolCurrentMonthPts)} pts
              </p>
              <p style={{ margin: "0.75rem 0 0", fontSize: "0.85rem", opacity: 0.6, lineHeight: 1.5 }}>
                20 % des points pondérés gagnés par les membres sur vos vidéos · 12 % crédité
                directement · 8 % en pending récupérable 1 an
              </p>
              {prevMonthLabel ? (
                <p
                  style={{
                    position: "absolute",
                    right: "1.1rem",
                    bottom: "0.65rem",
                    margin: 0,
                    maxWidth: "100%",
                    textAlign: "right",
                    fontSize: "0.68rem",
                    opacity: 0.45,
                    lineHeight: 1.35,
                  }}
                >
                  PCOL {prevMonthLabel} · {pointsFmt.format(prevMonthPcolPts)} pts →{" "}
                  {prevMonthRedistributed ? (
                    <Link
                      href="/banque"
                      style={{
                        color: "inherit",
                        textDecoration: "underline",
                        textUnderlineOffset: "2px",
                      }}
                    >
                      ✓ Consulter votre banque
                    </Link>
                  ) : (
                    "Redistribution en cours"
                  )}
                </p>
              ) : null}
            </section>

            <section
              style={{
                borderRadius: "14px",
                padding: "1.35rem 1.25rem",
                marginBottom: "1.25rem",
                background: "rgba(245, 240, 232, 0.03)",
                border: "1px solid rgba(245, 240, 232, 0.1)",
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
                PTC généré ce mois · {pcolMonthLabel || "—"}
              </p>
              <p style={{ margin: "0.65rem 0 0", fontSize: "1.05rem", lineHeight: 1.55 }}>
                {pointsFmt.format(ptcInfo?.pts_perdus_mois ?? 0)} pts perdus
                {ptcInfo?.valeur_par_pt != null
                  ? ` × ${cadFmt.format(ptcInfo.valeur_par_pt)}/pt`
                  : " × valeur/pt"}{" "}
                = {ptcInfo?.dollars_mois != null ? cadFmt.format(ptcInfo.dollars_mois) : "—"} →{" "}
                <span style={{ color: GOLD, fontWeight: 700 }}>
                  {ptcInfo?.ptc_mois != null
                    ? ptcInfo.ptc_mois.toLocaleString("fr-CA", { maximumFractionDigits: 2 })
                    : "—"}{" "}
                  PTC
                </span>{" "}
                (÷ {PTC_UNIT_DOLLARS} $)
              </p>
              <p style={{ margin: "0.65rem 0 0", fontSize: "0.95rem", lineHeight: 1.55 }}>
                PTC cumulé total :{" "}
                <span style={{ color: GOLD, fontWeight: 700 }}>
                  {ptcInfo != null
                    ? ptcInfo.ptc_balance_units.toLocaleString("fr-CA", {
                        maximumFractionDigits: 2,
                      })
                    : "—"}{" "}
                  PTC
                </span>
                {ptcInfo != null ? ` (${cadFmt.format(ptcInfo.ptc_balance)} ÷ ${PTC_UNIT_DOLLARS} $)` : null}
              </p>
              <p style={{ margin: "0.65rem 0 0", fontSize: "0.82rem", opacity: 0.6, lineHeight: 1.5 }}>
                Les PTC financent la croissance de LEVE (promotion, outils, réserve)
              </p>
            </section>

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
                  Quiz complétés (membres)
                </p>
                <p style={{ margin: "0.5rem 0 0", fontSize: "1.65rem", fontWeight: 700 }}>
                  {totalQuizMembres}
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
                  Points générés (pondérés)
                </p>
                <p style={{ margin: "0.5rem 0 0", fontSize: "1.65rem", fontWeight: 700, color: GOLD }}>
                  {pointsFmt.format(totalPtsGeneresPonderes)}
                </p>
              </article>
            </div>

            <section style={{ marginBottom: "2rem" }}>
              <h2
                style={{
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  fontSize: "1.35rem",
                  letterSpacing: "0.08em",
                  margin: "0 0 0.75rem",
                  color: GOLD,
                }}
              >
                Pending PCOL
              </h2>
              {pendingList.length === 0 ? (
                <p style={{ opacity: 0.65 }}>Aucun pending.</p>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  {pendingList.map((p) => {
                    const inactive = isInactiveStatut(p.statut);
                    const expired =
                      p.statut === "expired" ||
                      (isActivePendingStatut(p.statut) && msUntil(p.date_expiration) <= 0);
                    const daysLeft = daysRemaining(p.date_expiration);

                    return (
                      <li
                        key={p.id}
                        style={{
                          borderRadius: "12px",
                          padding: "1.1rem",
                          background: expired
                            ? "rgba(192, 57, 43, 0.12)"
                            : inactive
                              ? "rgba(245, 240, 232, 0.04)"
                              : "rgba(212, 160, 23, 0.1)",
                          border: `1px solid ${expired ? ROUGE : inactive ? "rgba(245, 240, 232, 0.15)" : "rgba(212, 160, 23, 0.35)"}`,
                          opacity: inactive ? 0.55 : 1,
                          textDecoration: inactive ? "line-through" : "none",
                        }}
                      >
                        <p style={{ margin: 0, fontWeight: 600, textDecoration: inactive ? "line-through" : "none" }}>
                          {p.video_title}
                        </p>
                        {isActivePendingStatut(p.statut) && !expired ? (
                          <>
                            <p style={{ margin: "0.5rem 0 0", fontSize: "0.88rem", textDecoration: "none" }}>
                              <strong style={{ color: GOLD }}>
                                {pointsFmt.format(p.points_pending_cumul)} pts
                              </strong>{" "}
                              · {cadFmt.format(p.valeur_dollars_cumul)}
                            </p>
                            <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", opacity: 0.65, textDecoration: "none" }}>
                              Expire le{" "}
                              {new Date(p.date_expiration).toLocaleDateString("fr-CA", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </p>
                            <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", opacity: 0.65, textDecoration: "none" }}>
                              {daysLeft} jour{daysLeft !== 1 ? "s" : ""} restant{daysLeft !== 1 ? "s" : ""} ·{" "}
                              {formatCountdown(new Date(p.date_expiration).getTime() - nowTick)}
                            </p>
                            <Link
                              href={`/videos/${p.video_id}`}
                              style={{
                                marginTop: "0.65rem",
                                display: "inline-block",
                                background: VERT,
                                color: BG,
                                border: "none",
                                borderRadius: "6px",
                                padding: "0.5rem 1rem",
                                fontWeight: 700,
                                fontSize: "0.85rem",
                                textDecoration: "none",
                              }}
                            >
                              Regarder la vidéo et faire le quiz pour récupérer
                            </Link>
                          </>
                        ) : isTransferredStatut(p.statut) ? (
                          <p style={{ margin: "0.5rem 0 0", fontSize: "0.88rem", color: VERT, textDecoration: "none" }}>
                            {transferredLabel(p.pourcentage_fixe, p.recupere_le)}
                          </p>
                        ) : (
                          <p style={{ margin: "0.5rem 0 0", fontSize: "0.88rem", color: ROUGE, textDecoration: "none" }}>
                            ❌ Expiré — points transférés en PTC
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section style={{ marginBottom: "2rem" }}>
              <h2
                style={{
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  fontSize: "1.35rem",
                  letterSpacing: "0.08em",
                  margin: "0 0 0.75rem",
                  color: GOLD,
                }}
              >
                Mes vidéos
              </h2>
              {videoStats.length === 0 ? (
                <p style={{ opacity: 0.65 }}>Aucune vidéo associée à votre compte.</p>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  {videoStats.map((v) => {
                    const inactive = v.statut != null && isInactiveStatut(v.statut);
                    const hasPending = v.statut != null;
                    const expired =
                      v.statut === "expired" ||
                      (v.statut === "pending" &&
                        v.dateExpiration != null &&
                        msUntil(v.dateExpiration) <= 0);

                    return (
                      <li
                        key={v.videoId}
                        style={{
                          borderRadius: "12px",
                          padding: "1.1rem",
                          background: "rgba(245, 240, 232, 0.04)",
                          border: "1px solid rgba(245, 240, 232, 0.1)",
                          opacity: inactive ? 0.55 : 1,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            justifyContent: "space-between",
                            gap: "0.5rem",
                            marginBottom: "0.65rem",
                          }}
                        >
                          <p
                            style={{
                              margin: 0,
                              fontWeight: 600,
                              fontSize: "1rem",
                              textDecoration: inactive ? "line-through" : "none",
                            }}
                          >
                            {v.title}
                          </p>
                          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>
                            {v.quizCount} membre{v.quizCount !== 1 ? "s" : ""} · quiz
                          </span>
                        </div>
                        <p style={{ margin: "0 0 0.5rem", fontSize: "0.88rem", opacity: 0.75 }}>
                          Points PCOL générés :{" "}
                          <strong style={{ color: GOLD }}>
                            {pointsFmt.format(v.ptsPcolGeneres)}
                          </strong>{" "}
                          pts pondérés
                        </p>
                        {hasPending ? (
                          <div
                            style={{
                              marginTop: "0.5rem",
                              padding: "0.75rem",
                              borderRadius: "8px",
                              background: expired
                                ? "rgba(192, 57, 43, 0.12)"
                                : inactive
                                  ? "rgba(245, 240, 232, 0.04)"
                                  : "rgba(212, 160, 23, 0.1)",
                              border: `1px solid ${expired ? ROUGE : inactive ? "rgba(245, 240, 232, 0.15)" : "rgba(212, 160, 23, 0.35)"}`,
                            }}
                          >
                            {v.statut === "pending" && !expired ? (
                              <>
                                <p style={{ margin: 0, fontSize: "0.85rem" }}>
                                  Pending :{" "}
                                  <strong>{pointsFmt.format(v.pendingPoints)} pts</strong>
                                  {" · "}
                                  {cadFmt.format(v.pendingDollars)}
                                </p>
                                <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", opacity: 0.65 }}>
                                  {v.dateExpiration
                                    ? `${daysRemaining(v.dateExpiration)} jour${daysRemaining(v.dateExpiration) !== 1 ? "s" : ""} restant${daysRemaining(v.dateExpiration) !== 1 ? "s" : ""} · ${formatCountdown(new Date(v.dateExpiration).getTime() - nowTick)}`
                                    : "—"}
                                </p>
                                <Link
                                  href={`/videos/${v.videoId}`}
                                  style={{
                                    marginTop: "0.5rem",
                                    display: "inline-block",
                                    fontSize: "0.8rem",
                                    color: VERT,
                                    fontWeight: 600,
                                    textDecoration: "none",
                                  }}
                                >
                                  Regarder la vidéo et faire le quiz pour récupérer
                                </Link>
                              </>
                            ) : v.statut != null && isTransferredStatut(v.statut) ? (
                              <p style={{ margin: 0, fontSize: "0.85rem", color: VERT }}>
                                {transferredLabel(v.pourcentageFixe, v.recupereLe)}
                              </p>
                            ) : (
                              <p style={{ margin: 0, fontSize: "0.85rem", color: ROUGE }}>
                                ❌ Expiré — points transférés en PTC
                              </p>
                            )}
                          </div>
                        ) : (
                          <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.5 }}>
                            Aucun pending
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
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
                color: p.href === "/collaborateur" ? GOLD : TEXT,
                opacity: p.href === "/collaborateur" ? 1 : 0.75,
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

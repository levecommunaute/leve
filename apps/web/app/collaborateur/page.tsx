"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type JSX } from "react";
import { isCollaborateurMemberType } from "../../lib/pcol";
import { readSessionFromAuthCookies } from "../../lib/supabase-auth-cookies";
import { checkJwtExpired } from "../../lib/supabase";
import { AppBottomNav } from "../../components/app-bottom-nav";

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
    if (await checkJwtExpired({ status: res.status, message: msg })) {
      return { data: null as T, error: null };
    }
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
  date_expiration: string;
  statut: string;
  pourcentage_fixe: number | null;
  recupere_le: string | null;
};

/** Ventilation PCOL d'une vidéo pour un mois (AAAA-MM). */
type VideoMonthBreakdown = {
  mois: string;
  label: string;
  ptsDirect: number;
  ptsPendingAttente: number;
  ptsRecuperes: number;
  ptsPtc: number;
  statut: string | null;
  pourcentageFixe: number | null;
};

type VideoStats = {
  videoId: string;
  title: string;
  quizCount: number;
  months: VideoMonthBreakdown[];
  dateExpiration: string | null;
  statut: string | null;
  pourcentageFixe: number | null;
  recupereLe: string | null;
};

type PcolTxRow = {
  video_id: string | null;
  pts_collab_ponderes: number | string | null;
  pts_membres_gagnes_ponderes: number | string | null;
  mois?: string | null;
  created_at?: string | null;
  paye?: boolean | null;
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
  date_expiration: string | null;
  statut: string | null;
  pourcentage_fixe: number | string | null;
  recupere_le: string | null;
};

type PendingTrancheDbRow = {
  id: string;
  video_id: string;
  mois: string;
  pts: number | string | null;
  pending_pcol:
    | {
        statut?: string | null;
        pourcentage_fixe?: number | string | null;
        date_expiration?: string | null;
        recupere_le?: string | null;
      }
    | {
        statut?: string | null;
        pourcentage_fixe?: number | string | null;
        date_expiration?: string | null;
        recupere_le?: string | null;
      }[]
    | null;
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
  const start = new Date(Date.UTC(year, monthIndex0, 1));
  const end = new Date(Date.UTC(year, monthIndex0 + 1, 1));
  const monthKey = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;
  const label = capitalizeFr(
    new Intl.DateTimeFormat("fr-CA", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start),
  ) + " · UTC";
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
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const current = monthBoundsFor(y, m);
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  const previousStart = monthBoundsFor(prevY, prevM);
  return {
    current,
    previous: {
      startIso: previousStart.startIso,
      endIso: current.startIso,
      monthDate: previousStart.monthDate,
      label: previousStart.label,
    },
  };
}

function createdAtRangeFilter(bounds: MonthBounds): string {
  return (
    `&created_at=gte.${encodeURIComponent(bounds.startIso)}` +
    `&created_at=lt.${encodeURIComponent(bounds.endIso)}`
  );
}

/** Label FR depuis clé AAAA-MM (ex. "2026-07" → "Juillet 2026"). */
function monthLabelFromKey(mois: string): string {
  const parts = mois.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  if (!y || !m || m < 1 || m > 12) return mois;
  return monthBoundsFor(y, m - 1).label;
}

/**
 * Ratio de récupération du pending 8 % à partir de pourcentage_fixe (12–20).
 * pts_recuperes = pts × ratio ; pts_ptc = pts × (1 - ratio).
 */
function pendingRecoveryRatio(pourcentageFixe: number): number {
  const recoveredPending = pourcentageFixe - 12;
  if (!Number.isFinite(recoveredPending)) return 0;
  return Math.min(1, Math.max(0, recoveredPending / 8));
}

function unwrapPendingEmbed(
  raw: PendingTrancheDbRow["pending_pcol"],
): {
  statut: string | null;
  pourcentageFixe: number | null;
  dateExpiration: string | null;
  recupereLe: string | null;
} {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row) {
    return {
      statut: null,
      pourcentageFixe: null,
      dateExpiration: null,
      recupereLe: null,
    };
  }
  const pct =
    row.pourcentage_fixe != null && row.pourcentage_fixe !== ""
      ? Number(row.pourcentage_fixe)
      : null;
  return {
    statut: row.statut != null ? String(row.statut) : null,
    pourcentageFixe: pct != null && Number.isFinite(pct) ? pct : null,
    dateExpiration: row.date_expiration ? String(row.date_expiration) : null,
    recupereLe: row.recupere_le ? String(row.recupere_le) : null,
  };
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
  const [isLoading, setIsLoading] = useState(true);
  const [nowTick, setNowTick] = useState(Date.now());

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
      setIsLoading(false);
      return;
    }

    const prof = profileRes.data?.[0] ?? null;
    setProfile(prof);

    if (!isCollaborateurMemberType(prof?.member_type)) {
      setLoadError("Accès réservé aux collaborateurs.");
      setIsLoading(false);
      return;
    }

    const { current: currentMonth, previous: prevMonth } =
      currentAndPreviousMonthBounds();
    setPcolMonthLabel(currentMonth.label);
    setPrevMonthLabel(prevMonth.label);

    const [pcolRes, pcolCurrentRes, pcolPrevRes, videosRes, pendingRes, tranchesRes, redistRes, prevHistRes, ptcRes] =
      await Promise.all([
        restJson<PcolTxRow[]>(
          `pcol_transactions?collaborateur_id=eq.${uidEnc}&select=video_id,pts_collab_ponderes,pts_membres_gagnes_ponderes,mois,created_at,paye&order=created_at.desc`,
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
          `pending_pcol?collaborateur_id=eq.${uidEnc}&select=id,video_id,points_pending_cumul,date_expiration,statut,pourcentage_fixe,recupere_le&order=date_expiration.desc`,
          token,
        ),
        restJson<PendingTrancheDbRow[]>(
          `pending_pcol_tranches?collaborateur_id=eq.${uidEnc}&paye=eq.false&select=id,video_id,mois,pts,pending_pcol(statut,pourcentage_fixe,date_expiration,recupere_le)&order=mois.desc`,
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
      tranchesRes.error ??
      redistRes.error ??
      prevHistRes.error ??
      ptcRes.error ??
      null;
    if (errMsg) {
      setLoadError(errMsg);
      setIsLoading(false);
      return;
    }

    const pcolRows = pcolRes.data ?? [];
    const videos = videosRes.data ?? [];
    const pendingRows = pendingRes.data ?? [];
    const trancheRows = tranchesRes.data ?? [];

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

    // pcol_transactions n'expose pas membre_id : 1 ligne = 1 quiz complété par un membre.
    const totalQuizCompletes = pcolRows.length;

    const videoTitleById = new Map(
      videos.map((v) => [String(v.id), String(v.title ?? "Vidéo")]),
    );

    const pendingListMapped: PendingRow[] = pendingRows.map((p) => ({
      id: String(p.id),
      video_id: String(p.video_id),
      video_title: videoTitleById.get(String(p.video_id)) ?? "Vidéo",
      points_pending_cumul: Number(p.points_pending_cumul ?? 0),
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

    const quizCountByVideo = new Map<string, number>();
    for (const row of pcolRows) {
      const vid = String(row.video_id ?? "");
      if (!vid) continue;
      quizCountByVideo.set(vid, (quizCountByVideo.get(vid) ?? 0) + 1);
    }

    // PCOL direct (12 %) impayé, groupé vidéo+mois
    const directByVideoMonth = new Map<string, number>();
    for (const row of pcolRows) {
      if (row.paye === true) continue;
      const vid = String(row.video_id ?? "");
      const mois = String(row.mois ?? "").trim();
      if (!vid || !mois) continue;
      const key = `${vid}:${mois}`;
      directByVideoMonth.set(
        key,
        (directByVideoMonth.get(key) ?? 0) + Number(row.pts_collab_ponderes ?? 0),
      );
    }

    // Tranches pending impayées, groupées vidéo+mois
    type TrancheAgg = {
      pts: number;
      statut: string | null;
      pourcentageFixe: number | null;
      dateExpiration: string | null;
      recupereLe: string | null;
    };
    const trancheByVideoMonth = new Map<string, TrancheAgg>();
    for (const row of trancheRows) {
      const vid = String(row.video_id ?? "");
      const mois = String(row.mois ?? "").trim();
      if (!vid || !mois) continue;
      const pts = Number(row.pts ?? 0);
      if (!(pts > 0)) continue;
      const embed = unwrapPendingEmbed(row.pending_pcol);
      const key = `${vid}:${mois}`;
      const prev = trancheByVideoMonth.get(key);
      if (prev) {
        prev.pts += pts;
      } else {
        trancheByVideoMonth.set(key, {
          pts,
          statut: embed.statut,
          pourcentageFixe: embed.pourcentageFixe,
          dateExpiration: embed.dateExpiration,
          recupereLe: embed.recupereLe,
        });
      }
    }

    const monthKeysByVideo = new Map<string, Set<string>>();
    for (const key of directByVideoMonth.keys()) {
      const [vid, mois] = key.split(":");
      if (!vid || !mois) continue;
      const set = monthKeysByVideo.get(vid) ?? new Set<string>();
      set.add(mois);
      monthKeysByVideo.set(vid, set);
    }
    for (const key of trancheByVideoMonth.keys()) {
      const [vid, mois] = key.split(":");
      if (!vid || !mois) continue;
      const set = monthKeysByVideo.get(vid) ?? new Set<string>();
      set.add(mois);
      monthKeysByVideo.set(vid, set);
    }

    const videoStatsMapped: VideoStats[] = videos.map((v) => {
      const vid = String(v.id);
      const pending = pendingByVideo.get(vid);
      const moisSet = monthKeysByVideo.get(vid) ?? new Set<string>();
      const monthsSorted = [...moisSet].sort((a, b) => b.localeCompare(a));

      const months: VideoMonthBreakdown[] = monthsSorted.map((mois) => {
        const key = `${vid}:${mois}`;
        const ptsDirect = round2(directByVideoMonth.get(key) ?? 0);
        const tranche = trancheByVideoMonth.get(key);
        const statut = tranche?.statut ?? pending?.statut ?? null;
        const pourcentageFixe =
          tranche?.pourcentageFixe ?? pending?.pourcentage_fixe ?? null;
        const ptsTranche = tranche?.pts ?? 0;

        let ptsPendingAttente = 0;
        let ptsRecuperes = 0;
        let ptsPtc = 0;

        if (statut === "transferred" || statut === "recupere") {
          const ratio =
            pourcentageFixe != null ? pendingRecoveryRatio(pourcentageFixe) : 0;
          ptsRecuperes = round2(ptsTranche * ratio);
          ptsPtc = round2(ptsTranche * (1 - ratio));
        } else if (statut === "expired") {
          ptsPtc = round2(ptsTranche);
        } else if (statut === "pending" || ptsTranche > 0) {
          ptsPendingAttente = round2(ptsTranche);
        }

        return {
          mois,
          label: monthLabelFromKey(mois),
          ptsDirect,
          ptsPendingAttente,
          ptsRecuperes,
          ptsPtc,
          statut,
          pourcentageFixe,
        };
      });

      return {
        videoId: vid,
        title: String(v.title ?? "Vidéo"),
        quizCount: quizCountByVideo.get(vid) ?? 0,
        months,
        dateExpiration: pending?.date_expiration ?? null,
        statut: pending?.statut ?? null,
        pourcentageFixe: pending?.pourcentage_fixe ?? null,
        recupereLe: pending?.recupere_le ?? null,
      };
    });

    const currentMonthKey = currentMonth.monthDate.slice(0, 7); // AAAA-MM
    const currentMonthPtsCollab = (pcolCurrentRes.data ?? []).reduce(
      (acc, r) => acc + Number(r.pts_collab_ponderes ?? 0),
      0,
    );
    // Portion récupérée du pending 8 % (tranches transferred) pour le mois courant
    const currentMonthPtsRecuperes = videoStatsMapped.reduce((acc, v) => {
      const m = v.months.find((x) => x.mois === currentMonthKey);
      return acc + (m?.ptsRecuperes ?? 0);
    }, 0);
    const currentMonthPcol = round2(currentMonthPtsCollab + currentMonthPtsRecuperes);

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
    setTotalQuizMembres(totalQuizCompletes);
    setPendingList(pendingListMapped);
    setVideoStats(videoStatsMapped);
    setLoadError(null);
    setIsLoading(false);
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

  if (session === undefined || (session != null && isLoading)) {
    return (
      <div
        className={fonts}
        style={{
          minHeight: "100vh",
          background: BG,
          color: TEXT,
          display: "flex",
          flexDirection: "column",
          gap: "0.85rem",
          alignItems: "center",
          justifyContent: "center",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
      >
        <span
          aria-hidden
          style={{
            width: "2.25rem",
            height: "2.25rem",
            borderRadius: "50%",
            border: "3px solid rgba(245, 240, 232, 0.15)",
            borderTopColor: GOLD,
            animation: "collab-spin 0.8s linear infinite",
          }}
        />
        <p style={{ margin: 0, opacity: 0.7 }}>Chargement…</p>
        <style>{`@keyframes collab-spin { to { transform: rotate(360deg); } }`}</style>
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
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        paddingBottom: "6rem",
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .collab-ptc-text {
              word-wrap: break-word;
              overflow-wrap: break-word;
            }
            .collab-pending-wrap {
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }
            .collab-pending-cards {
              min-width: 0;
            }
            @media (max-width: 479px) {
              .collab-prev-month {
                position: relative !important;
                right: auto !important;
                bottom: auto !important;
                margin-top: 1rem !important;
                text-align: left !important;
              }
              .collab-pcol-section {
                padding-bottom: 1.75rem !important;
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
              className="collab-pcol-section"
              style={{
                position: "relative",
                borderRadius: "4px",
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
                  className="collab-prev-month"
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
                borderRadius: "4px",
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
              <p className="collab-ptc-text" style={{ margin: "0.65rem 0 0", fontSize: "1.05rem", lineHeight: 1.55 }}>
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
              <p className="collab-ptc-text" style={{ margin: "0.65rem 0 0", fontSize: "0.95rem", lineHeight: 1.55 }}>
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
                  borderRadius: "4px",
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
                  borderRadius: "4px",
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
                <div className="collab-pending-wrap">
                <ul
                  className="collab-pending-cards"
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
                          borderRadius: "4px",
                          padding: "1.1rem",
                          background: expired
                            ? "rgba(192, 57, 43, 0.12)"
                            : inactive
                              ? "rgba(245, 240, 232, 0.04)"
                              : "rgba(212, 160, 23, 0.1)",
                          border: `1px solid ${expired ? ROUGE : inactive ? "rgba(245, 240, 232, 0.15)" : "rgba(212, 160, 23, 0.35)"}`,
                          opacity: inactive ? 0.55 : 1,
                          textDecoration: inactive ? "line-through" : "none",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
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
                              en attente de récupération
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
                                borderRadius: "4px",
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
                </div>
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
                    const expired =
                      v.statut === "expired" ||
                      (v.statut === "pending" &&
                        v.dateExpiration != null &&
                        msUntil(v.dateExpiration) <= 0);
                    const showRecoverCta =
                      v.statut === "pending" && !expired && v.dateExpiration != null;

                    return (
                      <li
                        key={v.videoId}
                        style={{
                          borderRadius: "4px",
                          padding: "1.1rem",
                          background: "rgba(245, 240, 232, 0.04)",
                          border: "1px solid rgba(245, 240, 232, 0.1)",
                          opacity: v.statut === "expired" ? 0.55 : 1,
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
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
                            }}
                          >
                            {v.title}
                          </p>
                          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>
                            {v.quizCount} membre{v.quizCount !== 1 ? "s" : ""} · quiz
                          </span>
                        </div>

                        {v.months.length === 0 ? (
                          <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.5 }}>
                            Aucun PCOL en attente de redistribution
                          </p>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.75rem",
                            }}
                          >
                            {v.months.map((m) => {
                              const totalPcol = round2(m.ptsDirect + m.ptsRecuperes);
                              const isTransferred =
                                m.statut != null && isTransferredStatut(m.statut);
                              const isPendingMonth =
                                m.statut === "pending" ||
                                (m.ptsPendingAttente > 0 && !isTransferred && m.statut !== "expired");

                              return (
                                <div
                                  key={m.mois}
                                  style={{
                                    padding: "0.75rem",
                                    borderRadius: "4px",
                                    background:
                                      m.statut === "expired"
                                        ? "rgba(192, 57, 43, 0.12)"
                                        : isTransferred
                                          ? "rgba(245, 240, 232, 0.04)"
                                          : "rgba(212, 160, 23, 0.1)",
                                    border: `1px solid ${
                                      m.statut === "expired"
                                        ? ROUGE
                                        : isTransferred
                                          ? "rgba(245, 240, 232, 0.15)"
                                          : "rgba(212, 160, 23, 0.35)"
                                    }`,
                                  }}
                                >
                                  <p style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.5 }}>
                                    PCOL direct (12%) :{" "}
                                    <strong style={{ color: GOLD }}>
                                      {pointsFmt.format(m.ptsDirect)} pts
                                    </strong>{" "}
                                    · {m.label}
                                  </p>

                                  {isTransferred ? (
                                    <>
                                      <p
                                        style={{
                                          margin: "0.35rem 0 0",
                                          fontSize: "0.85rem",
                                          lineHeight: 1.5,
                                          color: VERT,
                                        }}
                                      >
                                        Pending récupéré :{" "}
                                        <strong>{pointsFmt.format(m.ptsRecuperes)} pts</strong> ·{" "}
                                        {m.label} · (
                                        {m.pourcentageFixe != null
                                          ? `${m.pourcentageFixe}%`
                                          : "—"}{" "}
                                        fixé)
                                      </p>
                                      <p
                                        style={{
                                          margin: "0.35rem 0 0",
                                          fontSize: "0.85rem",
                                          lineHeight: 1.5,
                                          opacity: 0.85,
                                        }}
                                      >
                                        → PTC : {pointsFmt.format(m.ptsPtc)} pts
                                      </p>
                                    </>
                                  ) : isPendingMonth ? (
                                    <p
                                      style={{
                                        margin: "0.35rem 0 0",
                                        fontSize: "0.85rem",
                                        lineHeight: 1.5,
                                      }}
                                    >
                                      Pending :{" "}
                                      <strong style={{ color: GOLD }}>
                                        {pointsFmt.format(m.ptsPendingAttente)} pts
                                      </strong>{" "}
                                      · {m.label} · en attente de récupération
                                    </p>
                                  ) : m.statut === "expired" ? (
                                    <p
                                      style={{
                                        margin: "0.35rem 0 0",
                                        fontSize: "0.85rem",
                                        color: ROUGE,
                                        lineHeight: 1.5,
                                      }}
                                    >
                                      → PTC : {pointsFmt.format(m.ptsPtc)} pts (expiré)
                                    </p>
                                  ) : null}

                                  <p
                                    style={{
                                      margin: "0.45rem 0 0",
                                      fontSize: "0.85rem",
                                      fontWeight: 600,
                                      lineHeight: 1.5,
                                    }}
                                  >
                                    Total PCOL : {pointsFmt.format(totalPcol)} pts
                                  </p>
                                </div>
                              );
                            })}

                            <p
                              style={{
                                margin: 0,
                                fontSize: "0.78rem",
                                opacity: 0.55,
                                lineHeight: 1.45,
                              }}
                            >
                              La valeur en dollars sera calculée lors de la redistribution de{" "}
                              {(pcolMonthLabel || "ce mois").toLowerCase()}
                            </p>

                            {showRecoverCta ? (
                              <>
                                <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.65 }}>
                                  {v.dateExpiration
                                    ? `${daysRemaining(v.dateExpiration)} jour${daysRemaining(v.dateExpiration) !== 1 ? "s" : ""} restant${daysRemaining(v.dateExpiration) !== 1 ? "s" : ""} · ${formatCountdown(new Date(v.dateExpiration).getTime() - nowTick)}`
                                    : "—"}
                                </p>
                                <Link
                                  href={`/videos/${v.videoId}`}
                                  style={{
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
                            ) : null}
                          </div>
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

      <AppBottomNav session={session} memberType={profile?.member_type} />
    </div>
  );
}

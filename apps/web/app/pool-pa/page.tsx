"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { AppBottomNav } from "../../components/app-bottom-nav";
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
const VERT = "#2ECC71";
const VIOLET = "#7B5EA7";
const CARD_BG = "#141414";
const MODAL_BG = "#1A1A1A";
const MUTED = "rgba(245, 240, 232, 0.5)";
const PA_TAX_RATE = 0.02;
const TIP_AMOUNTS = [1, 2, 5, 10] as const;
const MIN_DON_PTS = 5;
const MAX_DON_PTS = 50;
const SB = "https://lrolatbudvianeazliax.supabase.co";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";

const PA_PRICE_CAD = 5;

function createAuthedSupabase(accessToken: string): SupabaseClient {
  return createClient(SB, KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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

type ProfileRow = {
  display_name: string | null;
  member_type: string | null;
};

type CollaborateurProfileRow = {
  id: string;
  display_name: string | null;
  categorie?: string | null;
  icone?: string | null;
};

type CollaborateurCard = {
  id: string;
  display_name: string;
  categorie: string | null;
  icone: string | null;
  video_count: number;
  solde_pa: number;
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
  cost_usd?: number | string | null;
  tax_usd?: number | string | null;
  cout_dollars?: number | string | null;
  taxe?: number | string | null;
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
  const t = (row.type ?? "").toLowerCase();
  const desc = row.description?.trim() ?? "";
  const descLower = desc.toLowerCase();

  if (t === "purchase") {
    return desc || "Achat de points PA";
  }

  if (descLower.includes("vote_concours")) {
    return "Vote — Concours Artistes";
  }
  if (descLower.includes("tirage")) {
    return "Ticket Tirage Trimestriel";
  }
  if (descLower.includes("pourboire")) {
    if (descLower.startsWith("pourboire reçu")) return desc;
    return desc || "Pourboire créateur";
  }
  if (desc === "Vote — Concours Artistes") {
    return desc;
  }

  if (t === "spend") {
    if (desc.startsWith("Taxe 2% — ")) return desc.slice("Taxe 2% — ".length);
    return "Dépense PA";
  }

  if (t === "tax") {
    if (desc.startsWith("Taxe 2% — ")) return desc.slice("Taxe 2% — ".length);
    return desc || "Taxe 2%";
  }
  if (t === "depense" || t === "utilisation") return "Utilisation PA";
  if (desc) return desc;
  return row.type?.replace(/_/g, " ") ?? "Transaction PA";
}

function paTxTypeLabel(type: string | null, description?: string | null): string {
  const t = (type ?? "").toLowerCase();
  const desc = description?.trim() ?? "";
  if (t === "purchase") return "Achat";
  if (t === "tip") return "Pourboire";
  if (t === "spend" && desc.startsWith("Taxe 2% —")) return "Taxe 2%";
  if (t === "spend") return "Dépense";
  if (t === "tax") return "Taxe 2%";
  return type ?? "PA";
}

function paTxCost(row: PaTxRow): number {
  return Number(row.cost_usd ?? row.cout_dollars ?? 0);
}

function paTxTax(row: PaTxRow): number {
  return Number(row.tax_usd ?? row.taxe ?? 0);
}

function isPaTaxLine(row: PaTxRow): boolean {
  return (row.description ?? "").includes("Taxe 2%");
}

const cad = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
});

const ptsFmt = new Intl.NumberFormat("fr-CA", {
  maximumFractionDigits: 0,
});

const ptsDecimalFmt = new Intl.NumberFormat("fr-CA", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function episodeLabel(count: number): string {
  const n = Math.max(0, Math.round(count));
  return n <= 1 ? `${n} épisode` : `${n} épisodes`;
}

function collabCategoryLabel(row: CollaborateurCard): string {
  return row.categorie?.trim() || "Contenu";
}

function formatMemberTypeLabel(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "Communauté";
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
  if (label === "Fondateur" || label === "Pionnier") {
    return {
      background: "rgba(212, 160, 23, 0.08)",
      color: GOLD,
      border: `1px solid ${GOLD}`,
    };
  }
  return {
    background: "rgba(255, 255, 255, 0.04)",
    color: "#888888",
    border: "1px solid rgba(255, 255, 255, 0.15)",
  };
}

type RecipientSearchResult = {
  id: string;
  display_name: string | null;
  member_type: string | null;
};

function IconVideo({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 10l4.553 -2.276a1 1 0 0 1 1.447 .894v6.764a1 1 0 0 1 -1.447 .894l-4.553 -2.276v-4z" />
      <rect x="3" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function IconCoin({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M14.8 9a2 2 0 0 0 -1.8 -1h-2a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4h-2a2 2 0 0 1 -1.8 -1" />
      <path d="M12 7v10" />
    </svg>
  );
}

export default function PoolPaPage(): JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
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
  const [collaborateurs, setCollaborateurs] = useState<CollaborateurCard[]>([]);
  const [collabLoadError, setCollabLoadError] = useState<string | null>(null);
  const [tipModalCollab, setTipModalCollab] = useState<CollaborateurCard | null>(null);
  const [tipAmount, setTipAmount] = useState<number>(TIP_AMOUNTS[0]);
  const [tipSending, setTipSending] = useState(false);
  const [tipError, setTipError] = useState<string | null>(null);
  const [tipSuccess, setTipSuccess] = useState<string | null>(null);
  const [donsFlagState, setDonsFlagState] = useState<
    "loading" | "enabled" | "disabled"
  >("loading");
  const [recipientNumero, setRecipientNumero] = useState("");
  const [recipientSearching, setRecipientSearching] = useState(false);
  const [recipientFound, setRecipientFound] = useState<RecipientSearchResult | null>(null);
  const [recipientSearchError, setRecipientSearchError] = useState<string | null>(null);
  const [donPts, setDonPts] = useState(MIN_DON_PTS);
  const [donSending, setDonSending] = useState(false);
  const [donError, setDonError] = useState<string | null>(null);
  const [donSuccess, setDonSuccess] = useState<string | null>(null);

  const maxPtsAffordable = useMemo(() => {
    if (soldeBanque < PA_PRICE_CAD) return 0;
    return Math.floor(soldeBanque / PA_PRICE_CAD);
  }, [soldeBanque]);

  const cout = round2(ptsPa * PA_PRICE_CAD);
  const canBuy =
    maxPtsAffordable >= 1 &&
    ptsPa >= 1 &&
    ptsPa <= maxPtsAffordable &&
    soldeBanque >= cout &&
    !buying;

  const tipTaxePts = useMemo(
    () => round2(tipAmount * PA_TAX_RATE),
    [tipAmount],
  );

  const tipTaxeCad = useMemo(
    () => round2(tipAmount * PA_PRICE_CAD * PA_TAX_RATE),
    [tipAmount],
  );

  const tipNetPts = useMemo(
    () => round2(tipAmount - tipTaxePts),
    [tipAmount, tipTaxePts],
  );

  const canConfirmTip =
    tipModalCollab != null &&
    tipAmount >= 1 &&
    soldePa >= tipAmount &&
    !tipSending;

  const loadCollaborateurs = useCallback(async (accessToken: string) => {
    let profilesRes = await restJson<CollaborateurProfileRow[]>(
      `profiles?member_type=eq.collaborateur&select=id,display_name,categorie,icone&order=display_name.asc`,
      accessToken,
    );
    if (profilesRes.error) {
      profilesRes = await restJson<CollaborateurProfileRow[]>(
        `profiles?member_type=eq.collaborateur&select=id,display_name&order=display_name.asc`,
        accessToken,
      );
    }

    const videosRes = await restJson<{ collaborateur_id: string | null }[]>(
      `videos?select=collaborateur_id&collaborateur_id=not.is.null`,
      accessToken,
    );

    const errMsg = profilesRes.error ?? videosRes.error ?? null;
    if (errMsg && (await checkJwtExpired({ message: errMsg }))) {
      return;
    }
    if (errMsg) {
      setCollabLoadError(errMsg);
      setCollaborateurs([]);
      return;
    }

    const videoCountById = new Map<string, number>();
    for (const row of videosRes.data ?? []) {
      const cid = String(row.collaborateur_id ?? "");
      if (!cid) continue;
      videoCountById.set(cid, (videoCountById.get(cid) ?? 0) + 1);
    }

    const soldeById = new Map<string, number>();
    try {
      const soldeRes = await fetch("/api/pa/collaborateurs", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (soldeRes.ok) {
        const soldeJson = (await soldeRes.json()) as {
          collaborateurs?: { id: string; solde_pa: number | string | null }[];
        };
        for (const row of soldeJson.collaborateurs ?? []) {
          soldeById.set(String(row.id), Number(row.solde_pa ?? 0));
        }
      }
    } catch {
      /* solde PA affiché à 0 si indisponible */
    }

    setCollabLoadError(null);
    setCollaborateurs(
      (profilesRes.data ?? []).map((p) => ({
        id: p.id,
        display_name: p.display_name?.trim() || "Collaborateur",
        categorie: p.categorie?.trim() || null,
        icone: p.icone?.trim() || null,
        video_count: videoCountById.get(p.id) ?? 0,
        solde_pa: soldeById.get(p.id) ?? 0,
      })),
    );
  }, []);

  const loadPoolPa = useCallback(async (activeSession: Session) => {
    const token = activeSession.access_token;
    const uid = activeSession.user.id;
    const sb = createAuthedSupabase(token);
    const paPathBase = `pa_transactions?membre_id=eq.${encodeURIComponent(uid)}`;

    const [profileRes, banqueRes, paSumRes, historyRes] = await Promise.all([
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
      restJson<{ amount?: unknown }[]>(`${paPathBase}&select=amount`, token),
      restJson<PaTxRow[]>(`${paPathBase}&select=*&order=created_at.desc`, token),
    ]);

    const errMsg =
      profileRes.error?.message ??
      banqueRes.error?.message ??
      paSumRes.error ??
      historyRes.error ??
      null;
    if (errMsg && (await checkJwtExpired({ message: errMsg }))) {
      return;
    }
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

    if (paSumRes.error) {
      setSoldePa(0);
    } else {
      const total = (paSumRes.data ?? []).reduce(
        (acc, row) => acc + Number(row.amount ?? 0),
        0,
      );
      setSoldePa(total);
    }

    if (historyRes.error) {
      setHistory([]);
    } else {
      setHistory(historyRes.data ?? []);
    }

    await loadCollaborateurs(token);
  }, [loadCollaborateurs]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [poolRes, donsRes] = await Promise.all([
          fetch("/api/feature-flags?nom=pool-pa", { cache: "no-store" }),
          fetch("/api/feature-flags?nom=dons-membres", { cache: "no-store" }),
        ]);
        const poolJson = (await poolRes.json()) as { actif?: boolean };
        const donsJson = (await donsRes.json()) as { actif?: boolean };
        if (cancelled) return;
        setFeatureFlagState(poolJson.actif ? "enabled" : "disabled");
        setDonsFlagState(donsJson.actif ? "enabled" : "disabled");
      } catch {
        if (!cancelled) {
          setFeatureFlagState("disabled");
          setDonsFlagState("disabled");
        }
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
      };

      if (!res.ok) {
        setBuyError(json.error ?? "Achat impossible");
        return;
      }

      setBuySuccess(`${json.pts_credites ?? ptsPa} pt(s) PA crédité(s).`);
      await loadPoolPa(session);
    } catch {
      setBuyError("Erreur réseau");
    } finally {
      setBuying(false);
    }
  }

  function openTipModal(collab: CollaborateurCard): void {
    setTipModalCollab(collab);
    setTipAmount(TIP_AMOUNTS[0]);
    setTipError(null);
    setTipSuccess(null);
  }

  function closeTipModal(): void {
    if (tipSending) return;
    setTipModalCollab(null);
    setTipError(null);
  }

  async function handleConfirmTip(): Promise<void> {
    if (!session || !tipModalCollab || !canConfirmTip) return;
    setTipSending(true);
    setTipError(null);
    setTipSuccess(null);

    try {
      const res = await fetch("/api/pa/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          membre_id: session.user.id,
          type: "pourboire",
          pts_pa: tipAmount,
          target_id: tipModalCollab.id,
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || !json.success) {
        setTipError(json.error ?? "Pourboire impossible");
        return;
      }

      setTipSuccess(
        `Pourboire de ${ptsFmt.format(tipAmount)} pt(s) envoyé à ${tipModalCollab.display_name}.`,
      );
      setTipModalCollab(null);
      await loadPoolPa(session);
    } catch {
      setTipError("Erreur réseau");
    } finally {
      setTipSending(false);
    }
  }

  async function handleChercherRecipient(): Promise<void> {
    if (!session) return;
    const numero = recipientNumero.trim();
    if (!numero) {
      setRecipientSearchError("Entrez un numéro de membre.");
      return;
    }
    setRecipientSearching(true);
    setRecipientSearchError(null);
    setRecipientFound(null);
    setDonError(null);
    setDonSuccess(null);
    try {
      const res = await fetch(
        `/api/membres/chercher?numero=${encodeURIComponent(numero)}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        },
      );
      const json = (await res.json()) as RecipientSearchResult & { error?: string };
      if (!res.ok) {
        setRecipientSearchError(json.error ?? "Membre introuvable");
        return;
      }
      setRecipientFound(json);
      setDonPts(MIN_DON_PTS);
    } catch {
      setRecipientSearchError("Erreur réseau");
    } finally {
      setRecipientSearching(false);
    }
  }

  async function handleEnvoyerDon(): Promise<void> {
    if (!session || !recipientFound) return;
    setDonSending(true);
    setDonError(null);
    setDonSuccess(null);
    try {
      const res = await fetch("/api/membres/don", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          receveur_id: recipientFound.id,
          pts_pmq: donPts,
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        setDonError(json.error ?? "Envoi impossible");
        return;
      }
      const label =
        recipientFound.display_name?.trim() || `membre #${recipientNumero.trim()}`;
      setDonSuccess(`${ptsFmt.format(donPts)} pt(s) PMQ envoyé(s) à ${label}.`);
      setRecipientFound(null);
      setRecipientNumero("");
      setDonPts(MIN_DON_PTS);
    } catch {
      setDonError("Erreur réseau");
    } finally {
      setDonSending(false);
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

  function renderPaHistoryEntry(row: PaTxRow): {
    dateLabel: string;
    signed: string;
    isAchat: boolean;
    isTipCredit: boolean;
    isTaxLine: boolean;
    taxeRow: number;
    coutRow: number;
  } {
    const amt = Number(row.amount ?? 0);
    const isAchat = (row.type ?? "").toLowerCase() === "purchase";
    const isTipCredit = (row.type ?? "").toLowerCase() === "tip" && amt > 0;
    const isTaxLine = isPaTaxLine(row);
    const taxeRow = paTxTax(row);
    const signed = isTaxLine
      ? taxeRow > 0
        ? `-${cad.format(taxeRow)}`
        : "—"
      : amt > 0
        ? `+${ptsFmt.format(amt)} pt`
        : `${ptsFmt.format(amt)} pt`;
    let dateLabel = "—";
    try {
      dateLabel = dateFmt.format(new Date(row.created_at));
    } catch {
      dateLabel = row.created_at;
    }
    const coutRow = paTxCost(row);
    return { dateLabel, signed, isAchat, isTipCredit, isTaxLine, taxeRow, coutRow };
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
            .pool-pa-buy-btn {
              min-height: 44px;
              font-size: max(14px, 0.95rem) !important;
            }
            @media (max-width: 479px) {
              .pool-pa-collab-grid {
                grid-template-columns: 1fr !important;
              }
            }
            .pool-pa-history-cards {
              display: none;
              flex-direction: column;
              gap: 0.65rem;
            }
            .pool-pa-history-card {
              border-radius: 4px;
              padding: 1rem;
              background: rgba(245, 240, 232, 0.04);
              border: 1px solid rgba(245, 240, 232, 0.1);
            }
            @media (max-width: 479px) {
              .pool-pa-history-table-wrap {
                display: none !important;
              }
              .pool-pa-history-cards {
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
        <p style={{ margin: "0 0 1.25rem", opacity: 0.75, fontSize: "0.95rem", lineHeight: 1.5,
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
          Points d&apos;accès (PA) — {cad.format(PA_PRICE_CAD)} / pt
        </p>

        {featureFlagState === "loading" ? (
          <p style={{ opacity: 0.7 }}>Vérification de la fonctionnalité…</p>
        ) : featureFlagState === "disabled" ? (
          <section
            style={{
              borderRadius: "4px",
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
                borderRadius: "4px",
                padding: "1.5rem 1.35rem",
                marginBottom: "1rem",
                background: "#141414",
                borderTop: "2px solid #7B5EA7",
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
                  opacity: 0.85,
                  color: "#F5F0E8",
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
                  color: "#7B5EA7",
                }}
              >
                {ptsFmt.format(soldePa)} pt{soldePa !== 1 ? "s" : ""}
              </p>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.78rem", opacity: 0.35 }}>
                Somme des transactions PA
              </p>
            </section>

            <section
              style={{
                borderRadius: "4px",
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

              <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", opacity: 0.85,
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
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
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}>
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
                    borderRadius: "4px",
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
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ opacity: 0.8 }}>Coût ({ptsPa} × {cad.format(PA_PRICE_CAD)})</span>
                  <strong>{cad.format(cout)}</strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingTop: "0.5rem",
                    borderTop: "1px solid rgba(245, 240, 232, 0.1)",
                    fontWeight: 700,
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
                >
                  <span>Total débité banque</span>
                  <span style={{ color: GOLD }}>{cad.format(cout)}</span>
                </div>
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
                className="pool-pa-buy-btn"
                disabled={!canBuy}
                onClick={() => void handleAcheter()}
                style={{
                  marginTop: "1.25rem",
                  width: "100%",
                  maxWidth: "420px",
                  padding: "0.85rem 1.25rem",
                  borderRadius: "4px",
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

            <section style={{ marginBottom: "1.5rem" }}>
              <h2
                style={{
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  fontSize: "1.35rem",
                  letterSpacing: "0.1em",
                  margin: "0 0 1rem",
                  color: VIOLET,
                }}
              >
                COLLABORATEURS
              </h2>

              {collabLoadError ? (
                <p role="alert" style={{ color: ROUGE, fontSize: "0.9rem", marginBottom: "0.75rem" }}>
                  {collabLoadError}
                </p>
              ) : null}
              {tipSuccess ? (
                <p role="status" style={{ color: VERT, fontSize: "0.9rem", marginBottom: "0.75rem" }}>
                  {tipSuccess}
                </p>
              ) : null}

              {collaborateurs.length === 0 ? (
                <p
                  style={{
                    opacity: 0.78,
                    fontSize: "0.95rem",
                    lineHeight: 1.55,
                    padding: "1.25rem",
                    borderRadius: "4px",
                    border: "1px solid rgba(123, 94, 167, 0.22)",
                    background: "rgba(123, 94, 167, 0.04)",
                  }}
                >
                  Aucun collaborateur disponible pour le moment.
                </p>
              ) : (
                <div
                  className="pool-pa-collab-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: "0.85rem",
                  }}
                >
                  {collaborateurs.map((collab) => (
                    <article
                      key={collab.id}
                      style={{
                        borderRadius: "4px",
                        padding: 0,
                        background: CARD_BG,
                        borderTop: `2px solid ${VIOLET}`,
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ padding: "1rem 1.25rem" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "0.65rem",
                            marginBottom: "0.5rem",
                          }}
                        >
                          <p
                            style={{
                              margin: 0,
                              fontWeight: 500,
                              fontSize: "14px",
                              lineHeight: 1.25,
                              color: TEXT,
                            }}
                          >
                            {collab.display_name}
                          </p>
                          <span
                            style={{
                              flexShrink: 0,
                              fontSize: "11px",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              background: "rgba(123, 94, 167, 0.08)",
                              color: VIOLET,
                              border: "1px solid rgba(123, 94, 167, 0.3)",
                            }}
                          >
                            Collaborateur
                          </span>
                        </div>

                        <p
                          style={{
                            margin: 0,
                            fontSize: "12px",
                            color: MUTED,
                            display: "flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            flexWrap: "wrap",
                          }}
                        >
                          {collab.icone ? (
                            <span
                              aria-hidden
                              style={{ fontSize: "14px", lineHeight: 1, flexShrink: 0 }}
                            >
                              {collab.icone}
                            </span>
                          ) : (
                            <IconVideo size={14} />
                          )}
                          <span>Membre Collaborateur</span>
                          <span>·</span>
                          <span>{collabCategoryLabel(collab)}</span>
                          <span>·</span>
                          <span>{episodeLabel(collab.video_count)}</span>
                        </p>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.75rem",
                          borderTop: "0.5px solid rgba(255, 255, 255, 0.08)",
                          padding: "0.875rem 1.25rem",
                        }}
                      >
                        <p style={{ margin: 0, fontSize: "12px", color: MUTED }}>
                          Solde PA : {ptsFmt.format(collab.solde_pa)} pt
                          {collab.solde_pa !== 1 ? "s" : ""}
                        </p>
                        <button
                          type="button"
                          onClick={() => openTipModal(collab)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            padding: "6px 14px",
                            borderRadius: "4px",
                            fontWeight: 500,
                            fontSize: "12px",
                            cursor: "pointer",
                            background: "rgba(123, 94, 167, 0.08)",
                            border: "1px solid rgba(123, 94, 167, 0.3)",
                            color: VIOLET,
                            whiteSpace: "nowrap",
                          }}
                        >
                          <IconCoin size={14} />
                          Envoyer un pourboire
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {donsFlagState === "enabled" ? (
              <section
                style={{
                  borderRadius: "4px",
                  padding: "1.5rem 1.35rem",
                  marginBottom: "1.5rem",
                  border: "1px solid rgba(212, 160, 23, 0.28)",
                  background: "rgba(212, 160, 23, 0.04)",
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
                  ENVOYER DES POINTS
                </h2>
                <p
                  style={{
                    margin: "0 0 1rem",
                    fontSize: "0.9rem",
                    opacity: 0.82,
                    lineHeight: 1.5,
                    fontFamily: "var(--font-mono), ui-monospace, monospace",
                  }}
                >
                  Transférer des points PMQ à un autre membre ({MIN_DON_PTS} à {MAX_DON_PTS} pts).
                </p>

                <label
                  htmlFor="recipient-numero"
                  style={{
                    display: "block",
                    fontSize: "0.78rem",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: "0.5rem",
                    opacity: 0.8,
                  }}
                >
                  Numéro de membre du destinataire
                </label>
                <div
                  style={{
                    display: "flex",
                    gap: "0.65rem",
                    flexWrap: "wrap",
                    marginBottom: "1rem",
                  }}
                >
                  <input
                    id="recipient-numero"
                    type="text"
                    inputMode="numeric"
                    value={recipientNumero}
                    disabled={recipientSearching || donSending}
                    onChange={(e) => {
                      setRecipientNumero(e.target.value);
                      setRecipientFound(null);
                      setRecipientSearchError(null);
                    }}
                    placeholder="Ex. 10042"
                    style={{
                      flex: "1 1 180px",
                      padding: "0.55rem 0.75rem",
                      borderRadius: "4px",
                      border: "1px solid rgba(245, 240, 232, 0.2)",
                      background: BG,
                      color: TEXT,
                      fontSize: "0.95rem",
                    }}
                  />
                  <button
                    type="button"
                    disabled={recipientSearching || donSending || !recipientNumero.trim()}
                    onClick={() => void handleChercherRecipient()}
                    style={{
                      padding: "0.55rem 1rem",
                      borderRadius: "4px",
                      fontWeight: 600,
                      fontSize: "0.88rem",
                      cursor:
                        recipientSearching || donSending || !recipientNumero.trim()
                          ? "not-allowed"
                          : "pointer",
                      background: "rgba(212, 160, 23, 0.12)",
                      border: `1px solid ${GOLD}`,
                      color: GOLD,
                      opacity:
                        recipientSearching || donSending || !recipientNumero.trim()
                          ? 0.55
                          : 1,
                    }}
                  >
                    {recipientSearching ? "Recherche…" : "Chercher"}
                  </button>
                </div>

                {recipientSearchError ? (
                  <p role="alert" style={{ color: ROUGE, fontSize: "0.88rem", margin: "0 0 1rem" }}>
                    {recipientSearchError}
                  </p>
                ) : null}

                {recipientFound ? (
                  <div
                    style={{
                      marginBottom: "1rem",
                      padding: "1rem",
                      borderRadius: "4px",
                      background: CARD_BG,
                      border: "1px solid rgba(245, 240, 232, 0.1)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.65rem",
                        flexWrap: "wrap",
                        marginBottom: "1rem",
                      }}
                    >
                      <p style={{ margin: 0, fontWeight: 600, fontSize: "0.95rem" }}>
                        {recipientFound.display_name?.trim() || "Membre"}
                      </p>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          padding: "0.3rem 0.65rem",
                          borderRadius: "4px",
                          ...memberTypeBadgeStyle(
                            formatMemberTypeLabel(recipientFound.member_type),
                          ),
                        }}
                      >
                        {formatMemberTypeLabel(recipientFound.member_type)}
                      </span>
                    </div>

                    <label
                      htmlFor="don-pts-range"
                      style={{
                        display: "block",
                        fontSize: "0.78rem",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        marginBottom: "0.5rem",
                        opacity: 0.8,
                      }}
                    >
                      Montant ({MIN_DON_PTS}–{MAX_DON_PTS} pts PMQ)
                    </label>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.75rem",
                        alignItems: "center",
                        flexWrap: "wrap",
                        marginBottom: "1rem",
                      }}
                    >
                      <input
                        id="don-pts-range"
                        type="range"
                        min={MIN_DON_PTS}
                        max={MAX_DON_PTS}
                        step={1}
                        value={donPts}
                        disabled={donSending}
                        onChange={(e) => setDonPts(Number(e.target.value))}
                        style={{ flex: "1 1 180px", accentColor: GOLD }}
                      />
                      <input
                        type="number"
                        min={MIN_DON_PTS}
                        max={MAX_DON_PTS}
                        step={1}
                        value={donPts}
                        disabled={donSending}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n)) {
                            setDonPts(
                              Math.min(
                                MAX_DON_PTS,
                                Math.max(MIN_DON_PTS, Math.round(n)),
                              ),
                            );
                          }
                        }}
                        style={{
                          width: "5rem",
                          padding: "0.5rem",
                          borderRadius: "4px",
                          border: "1px solid rgba(245, 240, 232, 0.2)",
                          background: BG,
                          color: GOLD,
                          fontWeight: 700,
                          fontSize: "1rem",
                          textAlign: "center",
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      disabled={donSending}
                      onClick={() => void handleEnvoyerDon()}
                      style={{
                        width: "100%",
                        maxWidth: "420px",
                        padding: "0.75rem 1.25rem",
                        borderRadius: "4px",
                        fontWeight: 700,
                        fontSize: "0.92rem",
                        letterSpacing: "0.04em",
                        border: `2px solid ${GOLD}`,
                        background: "rgba(212, 160, 23, 0.18)",
                        color: GOLD,
                        cursor: donSending ? "wait" : "pointer",
                        opacity: donSending ? 0.7 : 1,
                      }}
                    >
                      {donSending ? "Envoi en cours…" : "Envoyer"}
                    </button>
                  </div>
                ) : null}

                {donError ? (
                  <p role="alert" style={{ color: ROUGE, fontSize: "0.9rem", marginTop: "0.5rem" }}>
                    {donError}
                  </p>
                ) : null}
                {donSuccess ? (
                  <p role="status" style={{ color: VERT, fontSize: "0.9rem", marginTop: "0.5rem" }}>
                    {donSuccess}
                  </p>
                ) : null}
              </section>
            ) : null}
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
                borderRadius: "4px",
                border: "1px solid rgba(245, 240, 232, 0.1)",
                background: "rgba(245, 240, 232, 0.03)",
              }}
            >
              Aucune transaction PA pour le moment.
            </p>
          ) : (
            <>
              <div className="pool-pa-history-cards">
                {history.map((row) => {
                  const { dateLabel, signed, isAchat, isTipCredit, isTaxLine, taxeRow, coutRow } =
                    renderPaHistoryEntry(row);
                  return (
                    <article key={row.id} className="pool-pa-history-card">
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
                          <p style={{ margin: 0, fontWeight: 600 }}>{paTxLabel(row)}</p>
                          {isTaxLine && taxeRow > 0 ? (
                            <p style={{ margin: "0.2rem 0 0", fontSize: "0.78rem", opacity: 0.65 }}>
                              Taxe : {cad.format(taxeRow)}
                            </p>
                          ) : coutRow > 0 ? (
                            <p style={{ margin: "0.2rem 0 0", fontSize: "0.78rem", opacity: 0.65 }}>
                              {cad.format(coutRow)}
                              {taxeRow > 0 ? ` · taxe ${cad.format(taxeRow)}` : ""}
                            </p>
                          ) : null}
                          <p
                            style={{
                              margin: "0.35rem 0 0",
                              fontSize: "0.72rem",
                              opacity: 0.55,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            {paTxTypeLabel(row.type, row.description)}
                          </p>
                        </div>
                        <span
                          style={{
                            fontWeight: 700,
                            color: (isAchat || isTipCredit) && Number(row.amount ?? 0) > 0 ? VERT : TEXT,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {signed}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div
                className="pool-pa-history-table-wrap"
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
                      const { dateLabel, signed, isAchat, isTipCredit, isTaxLine, taxeRow, coutRow } =
                        renderPaHistoryEntry(row);
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
                            {isTaxLine && taxeRow > 0 ? (
                              <span
                                style={{
                                  display: "block",
                                  marginTop: "0.2rem",
                                  fontSize: "0.78rem",
                                  opacity: 0.65,
                                }}
                              >
                                Taxe : {cad.format(taxeRow)}
                              </span>
                            ) : coutRow > 0 ? (
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
                              {paTxTypeLabel(row.type, row.description)}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "0.7rem 1rem",
                              textAlign: "right",
                              fontWeight: 700,
                              color: (isAchat || isTipCredit) && Number(row.amount ?? 0) > 0 ? VERT : TEXT,
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

      {tipModalCollab ? (
        <div
          role="presentation"
          onClick={closeTipModal}
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
            aria-labelledby="tip-modal-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "26rem",
              width: "100%",
              background: MODAL_BG,
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "4px",
              padding: "1.25rem",
            }}
          >
            <h3
              id="tip-modal-title"
              style={{
                margin: "0 0 0.35rem",
                fontSize: "14px",
                fontWeight: 500,
                color: TEXT,
              }}
            >
              Pourboire à {tipModalCollab.display_name}
            </h3>
            <p style={{ margin: "0 0 1rem", fontSize: "12px", color: MUTED }}>
              Taxe 2% appliquée · Votre solde PA : {ptsFmt.format(soldePa)} pts
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              {TIP_AMOUNTS.map((amt) => {
                const selected = tipAmount === amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    disabled={tipSending}
                    onClick={() => setTipAmount(amt)}
                    style={{
                      padding: "0.55rem 0.35rem",
                      borderRadius: "4px",
                      fontWeight: 500,
                      fontSize: "12px",
                      cursor: tipSending ? "wait" : "pointer",
                      background: selected ? "rgba(123, 94, 167, 0.08)" : CARD_BG,
                      border: selected
                        ? `2px solid ${VIOLET}`
                        : "0.5px solid rgba(255, 255, 255, 0.08)",
                      color: selected ? VIOLET : TEXT,
                    }}
                  >
                    {amt} pt{amt > 1 ? "s" : ""}
                  </button>
                );
              })}
            </div>

            <div
              style={{
                display: "grid",
                gap: "0.45rem",
                fontSize: "12px",
                marginBottom: "1rem",
                padding: "0.75rem",
                borderRadius: "4px",
                background: CARD_BG,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <span style={{ color: MUTED }}>Montant envoyé</span>
                <strong style={{ color: TEXT }}>
                  {ptsFmt.format(tipAmount)} pt{tipAmount > 1 ? "s" : ""}
                </strong>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  color: ROUGE,
                }}
              >
                <span>Taxe 2%</span>
                <strong>{tipTaxeCad > 0 ? cad.format(tipTaxeCad) : "—"}</strong>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  color: VERT,
                  paddingTop: "0.45rem",
                  borderTop: "0.5px solid rgba(255, 255, 255, 0.08)",
                  fontWeight: 500,
                }}
              >
                <span>{tipModalCollab.display_name} reçoit</span>
                <span>
                  {ptsDecimalFmt.format(tipNetPts)} pt
                  {tipNetPts !== tipAmount ? (
                    <span style={{ opacity: 0.75, fontWeight: 400 }}>
                      {" "}
                      ({cad.format(round2(tipNetPts * PA_PRICE_CAD))})
                    </span>
                  ) : null}
                </span>
              </div>
            </div>

            {tipError ? (
              <p role="alert" style={{ color: ROUGE, fontSize: "12px", margin: "0 0 0.75rem" }}>
                {tipError}
              </p>
            ) : null}
            {soldePa < tipAmount ? (
              <p role="alert" style={{ color: ROUGE, fontSize: "12px", margin: "0 0 0.75rem" }}>
                Solde PA insuffisant pour ce montant.
              </p>
            ) : null}

            <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={tipSending}
                onClick={closeTipModal}
                style={{
                  flex: "1 1 120px",
                  padding: "0.65rem 1rem",
                  borderRadius: "4px",
                  fontWeight: 500,
                  fontSize: "12px",
                  cursor: tipSending ? "wait" : "pointer",
                  background: "transparent",
                  border: "0.5px solid rgba(255, 255, 255, 0.08)",
                  color: MUTED,
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!canConfirmTip}
                onClick={() => void handleConfirmTip()}
                style={{
                  flex: "1.5 1 160px",
                  padding: "0.65rem 1rem",
                  borderRadius: "4px",
                  fontWeight: 500,
                  fontSize: "12px",
                  cursor: canConfirmTip ? "pointer" : "not-allowed",
                  background: "rgba(123, 94, 167, 0.15)",
                  border: "1px solid rgba(123, 94, 167, 0.4)",
                  color: VIOLET,
                  opacity: canConfirmTip ? 1 : 0.55,
                }}
              >
                {tipSending ? "Envoi…" : "Confirmer le pourboire"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AppBottomNav session={session} memberType={profile?.member_type} />
    </div>
  );
}

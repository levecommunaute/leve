"use client";

import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type JSX } from "react";

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

const STORAGE_KEY = "leve_admin_secret";

type VideoRow = {
  id: string;
  youtube_id: string;
  title: string | null;
  points_value: number | null;
};

type MemberRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  member_type: string | null;
  multiplier: number | string | null;
  /** Colonne Supabase en entier ; l’API peut renvoyer un nombre ou une chaîne selon le driver. */
  numero_membre: string | number | null;
};

type QuizQuestionRow = {
  id: string;
  video_id: string;
  question: string;
  choix: string[] | null;
  bonne_reponse: string | null;
};

type FeatureFlagRow = {
  id: string;
  nom: string;
  actif: boolean;
  description: string | null;
  updated_at: string;
};

/** Ordre d'affichage dans « Déploiement des fonctionnalités » (flags définis en base). */
const FEATURE_FLAG_ORDER = [
  "boutique",
  "concours",
  "classement",
  "verification-60-pct",
  "pool-pa",
  "collaborateur",
] as const;

function sortFeatureFlags(flags: FeatureFlagRow[]): FeatureFlagRow[] {
  return [...flags].sort((a, b) => {
    const ia = FEATURE_FLAG_ORDER.indexOf(a.nom as (typeof FEATURE_FLAG_ORDER)[number]);
    const ib = FEATURE_FLAG_ORDER.indexOf(b.nom as (typeof FEATURE_FLAG_ORDER)[number]);
    const rankA = ia === -1 ? FEATURE_FLAG_ORDER.length : ia;
    const rankB = ib === -1 ? FEATURE_FLAG_ORDER.length : ib;
    if (rankA !== rankB) return rankA - rankB;
    return a.nom.localeCompare(b.nom, "fr");
  });
}

type QuizCorrectLetter = "a" | "b" | "c" | "d";

function quizChoix(row: QuizQuestionRow): string[] {
  if (!Array.isArray(row.choix)) return [];
  return row.choix.map((o) => String(o ?? ""));
}

function formatQuizCorrectDisplay(row: QuizQuestionRow): string {
  const choix = quizChoix(row);
  const bonne = (row.bonne_reponse ?? "").trim();
  if (!bonne) return "—";
  const idx = choix.findIndex((o) => o.trim().toLowerCase() === bonne.toLowerCase());
  if (idx >= 0) {
    const t = choix[idx]?.trim();
    return `${String.fromCharCode(65 + idx)} — ${t?.length ? t : "—"}`;
  }
  return bonne;
}

/** Valeurs envoyées au PATCH (normalisées côté API). */
type MemberTypeForm = "communaute" | "pionnier" | "fondateur" | "collaborateur";
type MultiplierValue = 1.0 | 1.2 | 2.0;

type MemberDraft = {
  member_type: MemberTypeForm;
  multiplier: MultiplierValue;
  numero_membre: string;
};

function memberTypeToForm(raw: string | null): MemberTypeForm {
  const t = (raw ?? "").trim();
  const lower = t.toLowerCase();
  if (lower === "communaute" || lower === "communauté" || t === "Communauté" || t === "Communaute") return "communaute";
  if (lower === "pionnier" || t === "Pionnier") return "pionnier";
  if (lower === "fondateur" || t === "Fondateur") return "fondateur";
  if (lower === "collaborateur" || t === "Collaborateur") return "collaborateur";
  return "communaute";
}

function memberTypeLabel(form: MemberTypeForm): string {
  const labels: Record<MemberTypeForm, string> = {
    communaute: "Communauté",
    pionnier: "Pionnier",
    fondateur: "Fondateur",
    collaborateur: "Collaborateur",
  };
  return labels[form];
}

function displayMemberType(raw: string | null): string {
  return memberTypeLabel(memberTypeToForm(raw));
}

function multiplierToForm(raw: number | string | null): MultiplierValue {
  const n = Number(raw);
  if (Math.abs(n - 1.2) < 1e-9) return 1.2;
  if (Math.abs(n - 2) < 1e-9) return 2.0;
  return 1.0;
}

/** Valeur affichée / éditée pour le N° (entier en base ; chaîne possible côté API héritée). */
function rowNumeroMembreString(m: MemberRow): string {
  const v = m.numero_membre;
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v));
  const s = String(v).trim();
  if (s === "") return "";
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  return s;
}

function memberRowDirty(m: MemberRow, d: MemberDraft): boolean {
  return (
    memberTypeToForm(m.member_type) !== d.member_type ||
    multiplierToForm(m.multiplier) !== d.multiplier ||
    rowNumeroMembreString(m) !== d.numero_membre
  );
}

function defaultMemberDraft(m: MemberRow): MemberDraft {
  return {
    member_type: memberTypeToForm(m.member_type),
    multiplier: multiplierToForm(m.multiplier),
    numero_membre: rowNumeroMembreString(m),
  };
}

const cad = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 6,
});


function cardStyle() {
  return {
    background: "rgba(245, 240, 232, 0.03)",
    border: "1px solid rgba(245, 240, 232, 0.1)",
    borderRadius: "14px",
    padding: "1.5rem",
    marginBottom: "1.75rem",
  };
}

function sectionTitle(text: string): JSX.Element {
  return (
    <h2
      style={{
        fontFamily: "var(--font-bebas), Impact, sans-serif",
        fontSize: "2rem",
        letterSpacing: "0.14em",
        margin: "0 0 1.25rem",
        color: GOLD,
        borderLeft: `4px solid ${ROUGE}`,
        paddingLeft: "0.85rem",
      }}
    >
      {text}
    </h2>
  );
}

export default function AdminPage(): JSX.Element {
  const fonts = `${bebas.variable} ${dmSans.variable}`;

  const [hydrated, setHydrated] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [linkedVideoCodes, setLinkedVideoCodes] = useState<Record<string, string>>({});
  const [codeInputByVideo, setCodeInputByVideo] = useState<Record<string, string>>({});
  const [codeAssociateError, setCodeAssociateError] = useState<Record<string, string>>({});
  const [codeModifyConfirmVideoId, setCodeModifyConfirmVideoId] = useState<string | null>(null);
  const [codeModifyStep, setCodeModifyStep] = useState<1 | 2>(1);
  const [codeModifyReentryKey, setCodeModifyReentryKey] = useState("");
  const [codeLoadingId, setCodeLoadingId] = useState<string | null>(null);
  const [standaloneGeneratedCode, setStandaloneGeneratedCode] = useState<string | null>(null);
  const [standaloneGenLoading, setStandaloneGenLoading] = useState(false);
  const [standaloneGenCopied, setStandaloneGenCopied] = useState(false);
  const [standaloneGenError, setStandaloneGenError] = useState<string | null>(null);

  const [newYoutube, setNewYoutube] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newPoints, setNewPoints] = useState<15 | 25 | 30>(15);
  const [addVideoLoading, setAddVideoLoading] = useState(false);
  const [addVideoMsg, setAddVideoMsg] = useState<string | null>(null);

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [totalRevenue, setTotalRevenue] = useState("");
  const [redistLoading, setRedistLoading] = useState(false);
  const [redistResult, setRedistResult] = useState<{
    pmq_pool: number;
    value_per_point: number | null;
    total_distributed: number;
  } | null>(null);
  const [redistError, setRedistError] = useState<string | null>(null);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({});
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const [quizVideoId, setQuizVideoId] = useState("");
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionRow[]>([]);
  const [quizQuestionsLoading, setQuizQuestionsLoading] = useState(false);
  const [quizQuestionsError, setQuizQuestionsError] = useState<string | null>(null);
  const [newQuizQ, setNewQuizQ] = useState("");
  const [newQuizA, setNewQuizA] = useState("");
  const [newQuizB, setNewQuizB] = useState("");
  const [newQuizC, setNewQuizC] = useState("");
  const [newQuizD, setNewQuizD] = useState("");
  const [newQuizCorrect, setNewQuizCorrect] = useState<QuizCorrectLetter>("a");
  const [quizAddLoading, setQuizAddLoading] = useState(false);
  const [quizAddMsg, setQuizAddMsg] = useState<string | null>(null);
  const [quizDeleteId, setQuizDeleteId] = useState<string | null>(null);

  const [featureFlags, setFeatureFlags] = useState<FeatureFlagRow[]>([]);
  const [featureFlagsLoading, setFeatureFlagsLoading] = useState(false);
  const [featureFlagsError, setFeatureFlagsError] = useState<string | null>(null);
  const [togglingFlagNom, setTogglingFlagNom] = useState<string | null>(null);

  const getStoredSecret = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(STORAGE_KEY);
  }, []);

  const adminHeaders = useCallback(
    (init?: HeadersInit): Headers => {
      const h = new Headers(init);
      const s = getStoredSecret();
      if (s) h.set("X-Admin-Secret", s);
      return h;
    },
    [getStoredSecret],
  );

  useEffect(() => {
    setHydrated(true);
    const s = sessionStorage.getItem(STORAGE_KEY);
    if (s) setAuthed(true);
  }, []);

  const loadVideos = useCallback(async () => {
    setVideosLoading(true);
    try {
      const r = await fetch("/api/videos", { cache: "no-store" });
      const data = await r.json();
      setVideos(Array.isArray(data) ? (data as VideoRow[]) : []);
    } catch {
      setVideos([]);
    } finally {
      setVideosLoading(false);
    }
  }, []);

  const loadLinkedVideoCodes = useCallback(async (): Promise<void> => {
    try {
      const r = await fetch("/api/admin/code", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const j = (await r.json()) as { codes?: Record<string, string>; error?: string };
      if (!r.ok) {
        console.warn(j.error ?? "Erreur chargement des codes vidéo");
        setLinkedVideoCodes({});
        return;
      }
      setLinkedVideoCodes(j.codes ?? {});
    } catch {
      setLinkedVideoCodes({});
    }
  }, [adminHeaders]);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const r = await fetch("/api/admin/members", { headers: adminHeaders() });
      const j = (await r.json()) as { members?: MemberRow[]; error?: string };
      if (!r.ok) {
        setMembersError(j.error ?? "Erreur membres");
        setMembers([]);
        return;
      }
      setMembers(j.members ?? []);
    } catch (e) {
      setMembersError(e instanceof Error ? e.message : "Erreur réseau");
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, [adminHeaders]);

  const loadFeatureFlags = useCallback(async (): Promise<void> => {
    setFeatureFlagsLoading(true);
    setFeatureFlagsError(null);
    try {
      const r = await fetch("/api/admin/feature-flags", { headers: adminHeaders() });
      const j = (await r.json()) as { flags?: FeatureFlagRow[]; error?: string };
      if (!r.ok) {
        setFeatureFlagsError(j.error ?? "Erreur feature flags");
        setFeatureFlags([]);
        return;
      }
      setFeatureFlags(j.flags ?? []);
    } catch (e) {
      setFeatureFlagsError(e instanceof Error ? e.message : "Erreur réseau");
      setFeatureFlags([]);
    } finally {
      setFeatureFlagsLoading(false);
    }
  }, [adminHeaders]);

  const loadQuizQuestions = useCallback(
    async (videoId: string): Promise<void> => {
      if (!videoId) {
        setQuizQuestions([]);
        setQuizQuestionsError(null);
        return;
      }
      setQuizQuestionsLoading(true);
      setQuizQuestionsError(null);
      try {
        const r = await fetch(
          `/api/admin/quiz-questions?video_id=${encodeURIComponent(videoId)}`,
          { headers: adminHeaders() },
        );
        const j = (await r.json()) as { questions?: QuizQuestionRow[]; error?: string };
        if (!r.ok) {
          setQuizQuestionsError(j.error ?? "Erreur chargement quiz");
          setQuizQuestions([]);
          return;
        }
        setQuizQuestions(j.questions ?? []);
      } catch (e) {
        setQuizQuestionsError(e instanceof Error ? e.message : "Erreur réseau");
        setQuizQuestions([]);
      } finally {
        setQuizQuestionsLoading(false);
      }
    },
    [adminHeaders],
  );

  useEffect(() => {
    if (!hydrated || !authed) return;
    void loadVideos();
    void loadLinkedVideoCodes();
    void loadMembers();
    void loadFeatureFlags();
  }, [hydrated, authed, loadVideos, loadLinkedVideoCodes, loadMembers, loadFeatureFlags]);

  useEffect(() => {
    if (!hydrated || !authed) return;
    if (!quizVideoId) {
      setQuizQuestions([]);
      setQuizQuestionsError(null);
      return;
    }
    void loadQuizQuestions(quizVideoId);
  }, [hydrated, authed, quizVideoId, loadQuizQuestions]);

  useEffect(() => {
    const next: Record<string, MemberDraft> = {};
    for (const m of members) {
      next[m.id] = defaultMemberDraft(m);
    }
    setMemberDrafts(next);
  }, [members]);

  async function handleLogin(e: FormEvent): Promise<void> {
    e.preventDefault();
    setAuthError(null);
    setLoginLoading(true);
    try {
      const r = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: secretInput }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setAuthError(j.error ?? "Accès refusé");
        return;
      }
      sessionStorage.setItem(STORAGE_KEY, secretInput);
      setAuthed(true);
      setSecretInput("");
    } catch {
      setAuthError("Erreur réseau");
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout(): void {
    sessionStorage.removeItem(STORAGE_KEY);
    setAuthed(false);
    setLinkedVideoCodes({});
    setCodeInputByVideo({});
    setCodeAssociateError({});
    setCodeModifyConfirmVideoId(null);
    setStandaloneGeneratedCode(null);
    setStandaloneGenCopied(false);
    setStandaloneGenError(null);
    setRedistResult(null);
    setMembers([]);
    setMemberDrafts({});
    setEditingMemberId(null);
    setVideos([]);
    setQuizVideoId("");
    setQuizQuestions([]);
    setQuizQuestionsError(null);
    setNewQuizQ("");
    setNewQuizA("");
    setNewQuizB("");
    setNewQuizC("");
    setNewQuizD("");
    setNewQuizCorrect("a");
    setQuizAddMsg(null);
    setFeatureFlags([]);
    setFeatureFlagsError(null);
  }

  async function handleToggleFeatureFlag(flag: FeatureFlagRow): Promise<void> {
    const nextActif = !flag.actif;
    setTogglingFlagNom(flag.nom);
    setFeatureFlagsError(null);
    try {
      const r = await fetch("/api/admin/feature-flags", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ nom: flag.nom, actif: nextActif }),
      });
      const j = (await r.json()) as { flag?: FeatureFlagRow; error?: string };
      if (!r.ok) {
        setFeatureFlagsError(j.error ?? "Échec mise à jour");
        return;
      }
      if (j.flag) {
        setFeatureFlags((prev) =>
          prev.map((f) => (f.nom === j.flag!.nom ? j.flag! : f)),
        );
      } else {
        await loadFeatureFlags();
      }
    } catch (e) {
      setFeatureFlagsError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setTogglingFlagNom(null);
    }
  }

  async function generateStandaloneCode(): Promise<void> {
    setStandaloneGenLoading(true);
    setStandaloneGeneratedCode(null);
    setStandaloneGenCopied(false);
    setStandaloneGenError(null);
    try {
      const r = await fetch("/api/admin/code/generate", {
        cache: "no-store",
        headers: adminHeaders(),
      });
      const j = (await r.json()) as { code?: string; error?: string };
      if (!r.ok) {
        setStandaloneGeneratedCode(null);
        setStandaloneGenError(j.error ?? "Échec de la génération");
        return;
      }
      if (j.code) {
        setStandaloneGeneratedCode(j.code);
        setStandaloneGenError(null);
      }
    } catch {
      setStandaloneGenError("Erreur réseau");
    } finally {
      setStandaloneGenLoading(false);
    }
  }

  async function copyStandaloneCode(): Promise<void> {
    if (!standaloneGeneratedCode) return;
    try {
      await navigator.clipboard.writeText(standaloneGeneratedCode);
      setStandaloneGenCopied(true);
      setStandaloneGenError(null);
      window.setTimeout(() => setStandaloneGenCopied(false), 2000);
    } catch {
      setStandaloneGenError("Impossible de copier (permissions navigateur)");
    }
  }

  async function associateCodeToVideo(videoId: string): Promise<void> {
    const code = (codeInputByVideo[videoId] ?? "").trim();
    if (!code) {
      setCodeAssociateError((prev) => ({ ...prev, [videoId]: "Saisissez un code." }));
      return;
    }
    setCodeLoadingId(videoId);
    setCodeAssociateError((prev) => {
      const n = { ...prev };
      delete n[videoId];
      return n;
    });
    try {
      const r = await fetch("/api/admin/code", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ video_id: videoId, code }),
      });
      const j = (await r.json()) as { code?: string; error?: string };
      if (!r.ok) {
        setCodeAssociateError((prev) => ({ ...prev, [videoId]: j.error ?? "Erreur" }));
        return;
      }
      if (j.code) {
        const linked = j.code;
        setLinkedVideoCodes((prev) => ({ ...prev, [videoId]: linked }));
        setCodeInputByVideo((prev) => ({ ...prev, [videoId]: "" }));
      }
    } catch {
      setCodeAssociateError((prev) => ({ ...prev, [videoId]: "Erreur réseau" }));
    } finally {
      setCodeLoadingId(null);
    }
  }

  function closeCodeModifyModal(): void {
    setCodeModifyConfirmVideoId(null);
    setCodeModifyStep(1);
    setCodeModifyReentryKey("");
  }

  function handleCodeModifyConfirmKeyStep(): void {
    const vid = codeModifyConfirmVideoId;
    if (!vid) return;
    const stored =
      typeof window !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null;
    const entered = codeModifyReentryKey.trim();
    if (!stored || entered !== stored) {
      setCodeAssociateError((prev) => ({
        ...prev,
        [vid]: "Clé administrateur incorrecte",
      }));
      closeCodeModifyModal();
      return;
    }
    void deleteVideoLinkedCode(vid);
  }

  async function deleteVideoLinkedCode(videoId: string): Promise<void> {
    closeCodeModifyModal();
    setCodeLoadingId(videoId);
    try {
      const r = await fetch(`/api/admin/code?video_id=${encodeURIComponent(videoId)}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok) {
        setCodeAssociateError((prev) => ({ ...prev, [videoId]: j.error ?? "Erreur" }));
        return;
      }
      setLinkedVideoCodes((prev) => {
        const next = { ...prev };
        delete next[videoId];
        return next;
      });
      setCodeInputByVideo((prev) => ({ ...prev, [videoId]: "" }));
      setCodeAssociateError((prev) => {
        const n = { ...prev };
        delete n[videoId];
        return n;
      });
    } catch {
      setCodeAssociateError((prev) => ({ ...prev, [videoId]: "Erreur réseau" }));
    } finally {
      setCodeLoadingId(null);
    }
  }

  async function handleAddVideo(e: FormEvent): Promise<void> {
    e.preventDefault();
    setAddVideoMsg(null);
    setAddVideoLoading(true);
    try {
      const r = await fetch("/api/admin/videos", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          youtube_id: newYoutube.trim(),
          title: newTitle.trim(),
          points_value: newPoints,
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setAddVideoMsg(j.error ?? "Échec");
        return;
      }
      setNewYoutube("");
      setNewTitle("");
      setNewPoints(15);
      setAddVideoMsg("Vidéo ajoutée.");
      await loadVideos();
    } catch {
      setAddVideoMsg("Erreur réseau");
    } finally {
      setAddVideoLoading(false);
    }
  }

  async function handleRedistribution(e: FormEvent): Promise<void> {
    e.preventDefault();
    setRedistError(null);
    setRedistResult(null);
    const rev = Number(totalRevenue.replace(",", "."));
    if (!Number.isFinite(rev) || rev <= 0) {
      setRedistError("Indiquez un revenu valide.");
      return;
    }
    setRedistLoading(true);
    try {
      const r = await fetch("/api/admin/redistribution", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ month, total_revenue: rev }),
      });
      const j = (await r.json()) as {
        pmq_pool?: number;
        value_per_point?: number | null;
        total_distributed?: number;
        error?: string;
      };
      if (!r.ok) {
        setRedistError(j.error ?? "Erreur redistribution");
        if (r.status === 422 && j.pmq_pool != null) {
          setRedistResult({
            pmq_pool: j.pmq_pool,
            value_per_point: j.value_per_point ?? null,
            total_distributed: j.total_distributed ?? 0,
          });
        }
        return;
      }
      setRedistResult({
        pmq_pool: j.pmq_pool ?? 0,
        value_per_point: j.value_per_point ?? null,
        total_distributed: j.total_distributed ?? 0,
      });
    } catch {
      setRedistError("Erreur réseau");
    } finally {
      setRedistLoading(false);
    }
  }

  async function handleAddQuizQuestion(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!quizVideoId) {
      setQuizAddMsg("Sélectionnez une vidéo.");
      return;
    }
    setQuizAddMsg(null);
    setQuizAddLoading(true);
    try {
      const r = await fetch("/api/admin/quiz-questions", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          video_id: quizVideoId,
          question: newQuizQ.trim(),
          choix: [
            newQuizA.trim(),
            newQuizB.trim(),
            newQuizC.trim(),
            newQuizD.trim(),
          ],
          bonne_reponse: [newQuizA, newQuizB, newQuizC, newQuizD][
            newQuizCorrect.charCodeAt(0) - 97
          ]?.trim() ?? "",
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setQuizAddMsg(j.error ?? "Échec");
        return;
      }
      setNewQuizQ("");
      setNewQuizA("");
      setNewQuizB("");
      setNewQuizC("");
      setNewQuizD("");
      setNewQuizCorrect("a");
      setQuizAddMsg("Question ajoutée.");
      await loadQuizQuestions(quizVideoId);
    } catch {
      setQuizAddMsg("Erreur réseau");
    } finally {
      setQuizAddLoading(false);
    }
  }

  async function handleDeleteQuizQuestion(id: string): Promise<void> {
    if (!window.confirm("Supprimer cette question ?")) return;
    setQuizDeleteId(id);
    setQuizQuestionsError(null);
    try {
      const r = await fetch(`/api/admin/quiz-questions?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setQuizQuestionsError(j.error ?? "Suppression impossible");
        return;
      }
      if (quizVideoId) await loadQuizQuestions(quizVideoId);
    } catch (e) {
      setQuizQuestionsError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setQuizDeleteId(null);
    }
  }

  async function saveMember(id: string): Promise<void> {
    const m = members.find((x) => x.id === id);
    const d = memberDrafts[id] ?? (m ? defaultMemberDraft(m) : null);
    if (!m || !d || !memberRowDirty(m, d)) return;
    const numeroTrim = d.numero_membre.trim();
    const numParsed = Number(numeroTrim);
    const isNumeroOneToTen =
      numeroTrim !== "" &&
      Number.isFinite(numParsed) &&
      Number.isInteger(numParsed) &&
      numParsed >= 1 &&
      numParsed <= 10;
    if (isNumeroOneToTen && d.member_type !== "pionnier") {
      setMembersError("Les numéros 1-10 sont réservés aux Pionniers");
      return;
    }
    const numeroPayload: number | null =
      numeroTrim === "" ? null : parseInt(numeroTrim, 10);
    if (
      numeroTrim !== "" &&
      (Number.isNaN(numeroPayload) || !Number.isInteger(Number(numeroTrim)))
    ) {
      setMembersError("Numéro membre invalide (entier attendu)");
      return;
    }
    setSavingMemberId(id);
    setMembersError(null);
    try {
      const r = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          id,
          member_type: d.member_type.toLowerCase(),
          multiplier: d.multiplier,
          numero_membre: numeroPayload,
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setMembersError(j.error ?? "Échec enregistrement");
        return;
      }
      setEditingMemberId(null);
      await loadMembers();
    } catch (e) {
      setMembersError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSavingMemberId(null);
    }
  }

  if (!hydrated) {
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
        <p style={{ opacity: 0.65 }}>Chargement…</p>
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
        paddingBottom: "4rem",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 1.35rem",
          borderBottom: "1px solid rgba(245, 240, 232, 0.08)",
          position: "sticky",
          top: 0,
          background: "rgba(8, 8, 8, 0.94)",
          backdropFilter: "blur(10px)",
          zIndex: 30,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "2rem",
              letterSpacing: "0.14em",
              color: TEXT,
              textDecoration: "none",
            }}
          >
            LEVE
          </Link>
          {authed ? (
            <span
              style={{
                fontSize: "0.72rem",
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: GOLD,
                opacity: 0.95,
              }}
            >
              Admin
            </span>
          ) : null}
        </div>
        {authed ? (
          <button
            type="button"
            onClick={handleLogout}
            style={{
              background: "transparent",
              color: TEXT,
              border: `1px solid rgba(192, 57, 43, 0.55)`,
              padding: "0.45rem 1rem",
              cursor: "pointer",
              fontSize: "0.8rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Déconnexion
          </button>
        ) : null}
      </header>

      {!authed ? (
        <main
          style={{
            maxWidth: "420px",
            margin: "4rem auto",
            padding: "0 1rem",
          }}
        >
          <div style={cardStyle()}>
            <h1
              style={{
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "2.75rem",
                letterSpacing: "0.12em",
                margin: "0 0 0.35rem",
                color: TEXT,
              }}
            >
              Accès admin
            </h1>
            <p style={{ opacity: 0.72, margin: "0 0 1.5rem", fontSize: "0.95rem" }}>
              Saisissez la clé secrète pour gérer les vidéos, la redistribution et les membres.
            </p>
            <form onSubmit={(ev) => void handleLogin(ev)}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.72rem",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  opacity: 0.55,
                  marginBottom: "0.45rem",
                }}
              >
                Clé administrateur
              </label>
              <input
                type="password"
                autoComplete="off"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "0.85rem 1rem",
                  background: "rgba(245, 240, 232, 0.06)",
                  border: "1px solid rgba(245, 240, 232, 0.14)",
                  borderRadius: "8px",
                  color: TEXT,
                  fontSize: "1rem",
                  marginBottom: "1rem",
                }}
              />
              {authError ? (
                <p style={{ color: ROUGE, fontSize: "0.88rem", margin: "0 0 1rem" }}>{authError}</p>
              ) : null}
              <button
                type="submit"
                disabled={loginLoading || !secretInput.trim()}
                style={{
                  width: "100%",
                  background: ROUGE,
                  color: TEXT,
                  border: "none",
                  padding: "0.95rem",
                  cursor: loginLoading || !secretInput.trim() ? "not-allowed" : "pointer",
                  opacity: loginLoading || !secretInput.trim() ? 0.55 : 1,
                  fontSize: "0.85rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {loginLoading ? "Vérification…" : "Entrer"}
              </button>
            </form>
          </div>
        </main>
      ) : (
        <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.25rem", position: "relative" }}>
          {codeModifyConfirmVideoId ? (
            <div
              role="presentation"
              onClick={() => closeCodeModifyModal()}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 200,
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
                aria-labelledby="modify-code-confirm-title"
                onClick={(e) => e.stopPropagation()}
                style={{
                  maxWidth: "28rem",
                  width: "100%",
                  background: "#121212",
                  border: "1px solid rgba(245, 240, 232, 0.18)",
                  borderRadius: "12px",
                  padding: "1.35rem 1.5rem",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
                }}
              >
                <h2
                  id="modify-code-confirm-title"
                  style={{
                    fontFamily: "var(--font-bebas), Impact, sans-serif",
                    fontSize: "1.25rem",
                    letterSpacing: "0.1em",
                    margin: "0 0 0.85rem",
                    color: GOLD,
                  }}
                >
                  {codeModifyStep === 1 ? "Modifier le code" : "Clé administrateur"}
                </h2>
                {codeModifyStep === 1 ? (
                  <p style={{ margin: "0 0 1.35rem", fontSize: "0.92rem", lineHeight: 1.55, opacity: 0.92 }}>
                    Attention — modifier ce code supprimera l&apos;ancien de toutes les bases de données et
                    invalidera les soumissions existantes. Confirmer ?
                  </p>
                ) : (
                  <div style={{ margin: "0 0 1.35rem" }}>
                    <label
                      htmlFor="modify-code-reentry-key"
                      style={{
                        display: "block",
                        fontSize: "0.72rem",
                        letterSpacing: "0.2em",
                        textTransform: "uppercase",
                        opacity: 0.55,
                        marginBottom: "0.45rem",
                      }}
                    >
                      Clé administrateur
                    </label>
                    <input
                      id="modify-code-reentry-key"
                      type="password"
                      autoComplete="off"
                      value={codeModifyReentryKey}
                      onChange={(e) => setCodeModifyReentryKey(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && codeModifyReentryKey.trim()) {
                          e.preventDefault();
                          handleCodeModifyConfirmKeyStep();
                        }
                      }}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.75rem 0.85rem",
                        background: "rgba(245, 240, 232, 0.06)",
                        border: "1px solid rgba(245, 240, 232, 0.14)",
                        borderRadius: "8px",
                        color: TEXT,
                        fontSize: "0.92rem",
                      }}
                    />
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => closeCodeModifyModal()}
                    style={{
                      background: "transparent",
                      color: TEXT,
                      border: "1px solid rgba(245, 240, 232, 0.25)",
                      padding: "0.5rem 1rem",
                      cursor: "pointer",
                      fontSize: "0.78rem",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    Annuler
                  </button>
                  {codeModifyStep === 1 ? (
                    <button
                      type="button"
                      onClick={() => setCodeModifyStep(2)}
                      style={{
                        background: ROUGE,
                        color: TEXT,
                        border: "none",
                        padding: "0.5rem 1rem",
                        cursor: "pointer",
                        fontSize: "0.78rem",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                      }}
                    >
                      Confirmer
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        codeLoadingId === codeModifyConfirmVideoId || !codeModifyReentryKey.trim()
                      }
                      onClick={() => handleCodeModifyConfirmKeyStep()}
                      style={{
                        background: ROUGE,
                        color: TEXT,
                        border: "none",
                        padding: "0.5rem 1rem",
                        cursor:
                          codeLoadingId === codeModifyConfirmVideoId || !codeModifyReentryKey.trim()
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          codeLoadingId === codeModifyConfirmVideoId || !codeModifyReentryKey.trim()
                            ? 0.55
                            : 1,
                        fontSize: "0.78rem",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                      }}
                    >
                      {codeLoadingId === codeModifyConfirmVideoId ? "…" : "Confirmer"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
          {/* GÉNÉRATEUR DE CODES */}
          <section style={cardStyle()}>
            {sectionTitle("GÉNÉRATEUR DE CODES")}
            <p style={{ margin: "0 0 1rem", opacity: 0.72, fontSize: "0.9rem", maxWidth: "42rem" }}>
              Générez un code unique vérifié en base (non lié à une vidéo). Vous pouvez ensuite le coller dans le champ
              « Associer le code » pour la vidéo concernée.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
              <button
                type="button"
                disabled={standaloneGenLoading}
                onClick={() => void generateStandaloneCode()}
                style={{
                  background: "rgba(212, 160, 23, 0.12)",
                  color: GOLD,
                  border: `1px solid rgba(212, 160, 23, 0.35)`,
                  padding: "0.55rem 1rem",
                  cursor: standaloneGenLoading ? "wait" : "pointer",
                  fontSize: "0.75rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {standaloneGenLoading ? "…" : "Générer un code"}
              </button>
              {standaloneGeneratedCode ? (
                <>
                  <span
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: "1rem",
                      letterSpacing: "0.06em",
                      padding: "0.45rem 0.75rem",
                      background: "rgba(245, 240, 232, 0.06)",
                      borderRadius: "8px",
                      border: "1px solid rgba(245, 240, 232, 0.12)",
                    }}
                  >
                    {standaloneGeneratedCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyStandaloneCode()}
                    style={{
                      background: ROUGE,
                      color: TEXT,
                      border: "none",
                      padding: "0.5rem 0.95rem",
                      cursor: "pointer",
                      fontSize: "0.72rem",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                      borderRadius: "8px",
                    }}
                  >
                    {standaloneGenCopied ? "Copié" : "Copier"}
                  </button>
                </>
              ) : null}
            </div>
            {standaloneGenError ? (
              <p style={{ margin: "0.85rem 0 0", fontSize: "0.85rem", color: ROUGE, opacity: 0.95 }}>
                {standaloneGenError}
              </p>
            ) : null}
          </section>

          {/* SECTION VIDÉOS */}
          <section style={cardStyle()}>
            {sectionTitle("VIDÉOS")}
            {videosLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement des vidéos…</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.9rem",
                  }}
                >
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                      <th style={{ padding: "0.65rem 0.5rem", letterSpacing: "0.08em", fontSize: "0.68rem", textTransform: "uppercase", opacity: 0.55 }}>
                        Titre
                      </th>
                      <th style={{ padding: "0.65rem 0.5rem", letterSpacing: "0.08em", fontSize: "0.68rem", textTransform: "uppercase", opacity: 0.55 }}>
                        YouTube
                      </th>
                      <th style={{ padding: "0.65rem 0.5rem", letterSpacing: "0.08em", fontSize: "0.68rem", textTransform: "uppercase", opacity: 0.55 }}>
                        Points
                      </th>
                      <th style={{ padding: "0.65rem 0.5rem", letterSpacing: "0.08em", fontSize: "0.68rem", textTransform: "uppercase", opacity: 0.55 }}>
                        Code
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {videos.map((v) => {
                      const linked = linkedVideoCodes[v.id];
                      const busy = codeLoadingId === v.id;
                      return (
                        <tr key={v.id} style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                          <td style={{ padding: "0.75rem 0.5rem", maxWidth: "280px" }}>{v.title ?? "—"}</td>
                          <td style={{ padding: "0.75rem 0.5rem", fontFamily: "ui-monospace, monospace", fontSize: "0.82rem" }}>
                            {v.youtube_id}
                          </td>
                          <td style={{ padding: "0.75rem 0.5rem" }}>{v.points_value ?? "—"}</td>
                          <td style={{ padding: "0.75rem 0.5rem", verticalAlign: "top", minWidth: "240px" }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center" }}>
                              <input
                                type="text"
                                value={linked ?? (codeInputByVideo[v.id] ?? "")}
                                readOnly={!!linked}
                                onChange={(e) => {
                                  if (linked) return;
                                  setCodeInputByVideo((prev) => ({
                                    ...prev,
                                    [v.id]: e.target.value,
                                  }));
                                  setCodeAssociateError((prev) => {
                                    const n = { ...prev };
                                    delete n[v.id];
                                    return n;
                                  });
                                }}
                                placeholder="XXXX-YYYY-ZZZZ"
                                autoComplete="off"
                                spellCheck={false}
                                aria-label={`Code pour ${v.title ?? v.youtube_id}`}
                                disabled={busy}
                                style={{
                                  flex: "1 1 140px",
                                  minWidth: "120px",
                                  padding: "0.45rem 0.55rem",
                                  fontFamily: "ui-monospace, monospace",
                                  fontSize: "0.8rem",
                                  background: linked ? "rgba(245, 240, 232, 0.04)" : "rgba(245, 240, 232, 0.06)",
                                  border: "1px solid rgba(245, 240, 232, 0.14)",
                                  borderRadius: "6px",
                                  color: TEXT,
                                  opacity: linked ? 0.92 : 1,
                                  cursor: linked ? "default" : "text",
                                }}
                              />
                              {linked ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setCodeModifyStep(1);
                                    setCodeModifyReentryKey("");
                                    setCodeModifyConfirmVideoId(v.id);
                                  }}
                                  style={{
                                    background: "rgba(192, 57, 43, 0.15)",
                                    color: ROUGE,
                                    border: `1px solid rgba(192, 57, 43, 0.4)`,
                                    padding: "0.45rem 0.65rem",
                                    cursor: busy ? "wait" : "pointer",
                                    fontSize: "0.68rem",
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {busy ? "…" : "Modifier le code"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void associateCodeToVideo(v.id)}
                                  style={{
                                    background: "rgba(212, 160, 23, 0.12)",
                                    color: GOLD,
                                    border: `1px solid rgba(212, 160, 23, 0.35)`,
                                    padding: "0.45rem 0.65rem",
                                    cursor: busy ? "wait" : "pointer",
                                    fontSize: "0.68rem",
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {busy ? "…" : "Associer le code"}
                                </button>
                              )}
                            </div>
                            {codeAssociateError[v.id] ? (
                              <p
                                style={{
                                  margin: "0.5rem 0 0",
                                  fontFamily: "ui-monospace, monospace",
                                  fontSize: "0.78rem",
                                  color: ROUGE,
                                  opacity: 0.95,
                                }}
                              >
                                {codeAssociateError[v.id]}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {videos.length === 0 ? <p style={{ opacity: 0.6, marginTop: "1rem" }}>Aucune vidéo.</p> : null}
              </div>
            )}

            <div
              style={{
                marginTop: "2rem",
                paddingTop: "1.5rem",
                borderTop: "1px solid rgba(245, 240, 232, 0.08)",
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  letterSpacing: "0.12em",
                  fontSize: "1.35rem",
                  margin: "0 0 1rem",
                  opacity: 0.9,
                }}
              >
                Nouvelle vidéo
              </h3>
              <form
                onSubmit={(ev) => void handleAddVideo(ev)}
                style={{
                  display: "grid",
                  gap: "1rem",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  alignItems: "end",
                }}
              >
                <div>
                  <label style={labelSm}>ID YouTube</label>
                  <input
                    value={newYoutube}
                    onChange={(e) => setNewYoutube(e.target.value)}
                    placeholder="dQw4w9WgXcQ"
                    style={inputBase}
                  />
                </div>
                <div>
                  <label style={labelSm}>Titre</label>
                  <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Titre affiché" style={inputBase} />
                </div>
                <div>
                  <label style={labelSm}>Points</label>
                  <select
                    value={newPoints}
                    onChange={(e) => setNewPoints(Number(e.target.value) as 15 | 25 | 30)}
                    style={{ ...inputBase, cursor: "pointer" }}
                  >
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={30}>30</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={addVideoLoading}
                  style={{
                    background: ROUGE,
                    color: TEXT,
                    border: "none",
                    padding: "0.75rem 1.25rem",
                    cursor: addVideoLoading ? "wait" : "pointer",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontSize: "0.72rem",
                    height: "fit-content",
                  }}
                >
                  {addVideoLoading ? "…" : "Ajouter"}
                </button>
              </form>
              {addVideoMsg ? (
                <p style={{ marginTop: "0.85rem", fontSize: "0.88rem", opacity: 0.85 }}>{addVideoMsg}</p>
              ) : null}
            </div>
          </section>

          {/* SECTION GESTION DES QUIZ */}
          <section style={cardStyle()}>
            {sectionTitle("GESTION DES QUIZ")}
            <div style={{ maxWidth: "520px", marginBottom: "1.5rem" }}>
              <label style={labelSm}>Vidéo</label>
              <select
                value={quizVideoId}
                onChange={(e) => {
                  setQuizVideoId(e.target.value);
                  setQuizAddMsg(null);
                }}
                style={{ ...inputBase, cursor: "pointer" }}
                aria-label="Vidéo pour le quiz"
              >
                <option value="">— Choisir une vidéo —</option>
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {(v.title ?? "Sans titre").slice(0, 80)}
                    {v.title && v.title.length > 80 ? "…" : ""} ({v.youtube_id})
                  </option>
                ))}
              </select>
            </div>
            {quizQuestionsError ? (
              <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{quizQuestionsError}</p>
            ) : null}
            {!quizVideoId ? (
              <p style={{ opacity: 0.65, margin: 0 }}>Sélectionnez une vidéo pour afficher et modifier les questions.</p>
            ) : quizQuestionsLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement des questions…</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.85rem",
                  }}
                >
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                      {["Question", "A", "B", "C", "D", "Bonne réponse", ""].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "0.65rem 0.5rem",
                            letterSpacing: "0.08em",
                            fontSize: "0.65rem",
                            textTransform: "uppercase",
                            opacity: 0.55,
                            minWidth: h === "Question" ? "10rem" : h === "" ? "5rem" : "4rem",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {quizQuestions.map((q) => {
                      const choix = quizChoix(q);
                      return (
                      <tr key={q.id} style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                        <td style={{ padding: "0.65rem 0.5rem", verticalAlign: "top", maxWidth: "220px" }}>{q.question}</td>
                        <td style={{ padding: "0.65rem 0.5rem", verticalAlign: "top", opacity: 0.92 }}>{choix[0] || "—"}</td>
                        <td style={{ padding: "0.65rem 0.5rem", verticalAlign: "top", opacity: 0.92 }}>{choix[1] || "—"}</td>
                        <td style={{ padding: "0.65rem 0.5rem", verticalAlign: "top", opacity: 0.92 }}>{choix[2] || "—"}</td>
                        <td style={{ padding: "0.65rem 0.5rem", verticalAlign: "top", opacity: 0.92 }}>{choix[3] || "—"}</td>
                        <td style={{ padding: "0.65rem 0.5rem", verticalAlign: "top", color: GOLD, fontSize: "0.8rem" }}>
                          {formatQuizCorrectDisplay(q)}
                        </td>
                        <td style={{ padding: "0.65rem 0.5rem", verticalAlign: "top" }}>
                          <button
                            type="button"
                            disabled={quizDeleteId === q.id}
                            onClick={() => void handleDeleteQuizQuestion(q.id)}
                            style={{
                              background: "transparent",
                              color: ROUGE,
                              border: `1px solid rgba(192, 57, 43, 0.45)`,
                              padding: "0.4rem 0.65rem",
                              cursor: quizDeleteId === q.id ? "wait" : "pointer",
                              fontSize: "0.68rem",
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                            }}
                          >
                            {quizDeleteId === q.id ? "…" : "Supprimer"}
                          </button>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
                {quizQuestions.length === 0 ? (
                  <p style={{ opacity: 0.6, marginTop: "1rem" }}>Aucune question pour cette vidéo.</p>
                ) : null}
              </div>
            )}

            <div
              style={{
                marginTop: "2rem",
                paddingTop: "1.5rem",
                borderTop: "1px solid rgba(245, 240, 232, 0.08)",
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  letterSpacing: "0.12em",
                  fontSize: "1.35rem",
                  margin: "0 0 1rem",
                  opacity: 0.9,
                }}
              >
                Nouvelle question
              </h3>
              <form onSubmit={(ev) => void handleAddQuizQuestion(ev)}>
                <label style={{ ...labelSm, marginBottom: "0.5rem" }}>Question</label>
                <textarea
                  value={newQuizQ}
                  onChange={(e) => setNewQuizQ(e.target.value)}
                  placeholder="Texte de la question"
                  rows={3}
                  style={{
                    ...inputBase,
                    resize: "vertical",
                    minHeight: "4.5rem",
                    marginBottom: "1rem",
                    display: "block",
                  }}
                />
                <div
                  style={{
                    display: "grid",
                    gap: "1rem",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    alignItems: "end",
                    marginBottom: "1rem",
                  }}
                >
                  <div>
                    <label style={labelSm}>Option A</label>
                    <input value={newQuizA} onChange={(e) => setNewQuizA(e.target.value)} style={inputBase} />
                  </div>
                  <div>
                    <label style={labelSm}>Option B</label>
                    <input value={newQuizB} onChange={(e) => setNewQuizB(e.target.value)} style={inputBase} />
                  </div>
                  <div>
                    <label style={labelSm}>Option C</label>
                    <input value={newQuizC} onChange={(e) => setNewQuizC(e.target.value)} style={inputBase} />
                  </div>
                  <div>
                    <label style={labelSm}>Option D</label>
                    <input value={newQuizD} onChange={(e) => setNewQuizD(e.target.value)} style={inputBase} />
                  </div>
                  <div>
                    <label style={labelSm}>Bonne réponse</label>
                    <select
                      value={newQuizCorrect}
                      onChange={(e) => setNewQuizCorrect(e.target.value as QuizCorrectLetter)}
                      style={{ ...inputBase, cursor: "pointer" }}
                      aria-label="Bonne réponse"
                    >
                      <option value="a">A</option>
                      <option value="b">B</option>
                      <option value="c">C</option>
                      <option value="d">D</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={quizAddLoading || !quizVideoId}
                    style={{
                      background: ROUGE,
                      color: TEXT,
                      border: "none",
                      padding: "0.75rem 1.25rem",
                      cursor: quizAddLoading || !quizVideoId ? "not-allowed" : "pointer",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      fontSize: "0.72rem",
                      height: "fit-content",
                      opacity: !quizVideoId ? 0.5 : 1,
                    }}
                  >
                    {quizAddLoading ? "…" : "Ajouter la question"}
                  </button>
                </div>
              </form>
              {quizAddMsg ? (
                <p style={{ marginTop: "0.85rem", fontSize: "0.88rem", opacity: 0.85 }}>{quizAddMsg}</p>
              ) : null}
            </div>
          </section>

          {/* SECTION REDISTRIBUTION */}
          <section style={cardStyle()}>
            {sectionTitle("REDISTRIBUTION")}
            <form
              onSubmit={(ev) => void handleRedistribution(ev)}
              style={{
                display: "grid",
                gap: "1rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                alignItems: "end",
              }}
            >
              <div>
                <label style={labelSm}>Mois</label>
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={inputBase} />
              </div>
              <div>
                <label style={labelSm}>Revenu total (CAD)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={totalRevenue}
                  onChange={(e) => setTotalRevenue(e.target.value)}
                  placeholder="10000"
                  style={inputBase}
                />
              </div>
              <div>
                <button
                  type="submit"
                  disabled={redistLoading}
                  style={{
                    background: `linear-gradient(135deg, ${ROUGE}, #9b2f24)`,
                    color: TEXT,
                    border: "none",
                    padding: "0.85rem 1.5rem",
                    cursor: redistLoading ? "wait" : "pointer",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontSize: "0.75rem",
                    width: "100%",
                  }}
                >
                  {redistLoading ? "Traitement…" : "Déclencher la redistribution"}
                </button>
              </div>
            </form>
            {redistError ? <p style={{ color: ROUGE, marginTop: "1rem", fontSize: "0.9rem" }}>{redistError}</p> : null}
            {redistResult ? (
              <div
                style={{
                  marginTop: "1.5rem",
                  padding: "1.25rem",
                  borderRadius: "10px",
                  background: "rgba(212, 160, 23, 0.06)",
                  border: `1px solid rgba(212, 160, 23, 0.22)`,
                }}
              >
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.72rem", letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.55 }}>
                  Résultat
                </p>
                <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.9 }}>
                  <li>
                    <strong style={{ color: GOLD }}>pmq_pool</strong> : {cad.format(redistResult.pmq_pool)}
                  </li>
                  <li>
                    <strong style={{ color: GOLD }}>value_per_point</strong> :{" "}
                    {redistResult.value_per_point != null ? cad.format(redistResult.value_per_point) : "—"}
                  </li>
                  <li>
                    <strong style={{ color: GOLD }}>total_distributed</strong> :{" "}
                    {cad.format(redistResult.total_distributed)}
                  </li>
                </ul>
              </div>
            ) : null}
          </section>

          {/* SECTION DÉPLOIEMENT DES FONCTIONNALITÉS */}
          <section style={cardStyle()}>
            {sectionTitle("DÉPLOIEMENT DES FONCTIONNALITÉS")}
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.92rem", opacity: 0.72, lineHeight: 1.55 }}>
              Activez ou désactivez les pages et espaces visibles sur le site. La modification est
              appliquée immédiatement dans Supabase.
            </p>
            {featureFlagsError ? (
              <p style={{ color: ROUGE, marginBottom: "0.85rem", fontSize: "0.9rem" }}>{featureFlagsError}</p>
            ) : null}
            {featureFlagsLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement des flags…</p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                }}
              >
                {sortFeatureFlags(featureFlags).map((flag) => {
                  const busy = togglingFlagNom === flag.nom;
                  return (
                    <li
                      key={flag.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "1rem",
                        padding: "1rem 1.1rem",
                        borderRadius: "10px",
                        background: "rgba(245, 240, 232, 0.04)",
                        border: "1px solid rgba(245, 240, 232, 0.1)",
                      }}
                    >
                      <div>
                        <p
                          style={{
                            margin: 0,
                            fontFamily: "var(--font-bebas), Impact, sans-serif",
                            fontSize: "1.25rem",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                          }}
                        >
                          {flag.nom}
                        </p>
                        {flag.description ? (
                          <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", opacity: 0.65 }}>
                            {flag.description}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={flag.actif}
                        aria-label={`${flag.nom} — ${flag.actif ? "activé" : "désactivé"}`}
                        disabled={busy}
                        onClick={() => void handleToggleFeatureFlag(flag)}
                        style={{
                          flexShrink: 0,
                          position: "relative",
                          width: "3.25rem",
                          height: "1.75rem",
                          borderRadius: "999px",
                          border: `1px solid ${flag.actif ? "rgba(46, 204, 113, 0.5)" : "rgba(245, 240, 232, 0.2)"}`,
                          background: flag.actif ? "rgba(46, 204, 113, 0.35)" : "rgba(245, 240, 232, 0.08)",
                          cursor: busy ? "wait" : "pointer",
                          padding: 0,
                          transition: "background 0.2s ease",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: flag.actif ? "calc(100% - 1.35rem)" : "0.2rem",
                            transform: "translateY(-50%)",
                            width: "1.15rem",
                            height: "1.15rem",
                            borderRadius: "50%",
                            background: flag.actif ? "#2ECC71" : "rgba(245, 240, 232, 0.45)",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
                            transition: "left 0.2s ease, background 0.2s ease",
                          }}
                        />
                        <span
                          style={{
                            position: "absolute",
                            width: 1,
                            height: 1,
                            padding: 0,
                            margin: -1,
                            overflow: "hidden",
                            clip: "rect(0,0,0,0)",
                            whiteSpace: "nowrap",
                            border: 0,
                          }}
                        >
                          {flag.actif ? "ON" : "OFF"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {!featureFlagsLoading && featureFlags.length === 0 ? (
              <p style={{ opacity: 0.6, margin: 0 }}>
                Aucun flag. Exécutez la migration Supabase{" "}
                <code style={{ fontSize: "0.82rem" }}>feature_flags</code>.
              </p>
            ) : null}
          </section>

          {/* SECTION GESTION DES MEMBRES */}
          <section style={cardStyle()}>
            {sectionTitle("GESTION DES MEMBRES")}
            <p style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>
              Total :{" "}
              <strong style={{ color: GOLD, fontSize: "1.35rem" }}>{membersLoading ? "…" : members.length}</strong>{" "}
              membre{members.length !== 1 ? "s" : ""}
            </p>
            {membersError ? <p style={{ color: ROUGE, marginBottom: "0.75rem" }}>{membersError}</p> : null}
            {membersLoading ? (
              <p style={{ opacity: 0.65 }}>Chargement…</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
                      {["Id", "Nom", "Courriel", "Type", "Mult.", "N° membre", ""].map((h, i) => (
                        <th
                          key={`${h}-${i}`}
                          style={{
                            padding: "0.65rem 0.5rem",
                            letterSpacing: "0.08em",
                            fontSize: "0.65rem",
                            textTransform: "uppercase",
                            opacity: 0.55,
                            minWidth: i === 0 ? "7.5rem" : undefined,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                    {members.map((m) => {
                      const d = memberDrafts[m.id] ?? defaultMemberDraft(m);
                      const dirty = memberRowDirty(m, d);
                      const multKey = d.multiplier === 1.2 ? "1.2" : d.multiplier === 2 ? "2" : "1";
                      const multDisplay =
                        typeof m.multiplier === "number"
                          ? String(m.multiplier)
                          : m.multiplier != null && String(m.multiplier).length
                            ? String(m.multiplier)
                            : "—";
                      return (
                        <tbody key={m.id}>
                          <tr style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}>
                            <td
                              style={{
                                padding: "0.6rem 0.5rem",
                                fontFamily: "ui-monospace, monospace",
                                fontSize: "0.72rem",
                                wordBreak: "break-all",
                                verticalAlign: "top",
                                maxWidth: "10rem",
                              }}
                              title={m.id}
                            >
                              {m.id}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top" }}>{m.display_name ?? "—"}</td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top" }}>{m.email ?? "—"}</td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top", minWidth: "6.5rem" }}>
                              {editingMemberId === m.id ? (
                                <select
                                  value={d.member_type}
                                  onChange={(e) => {
                                    const v = e.target.value as MemberTypeForm;
                                    setMemberDrafts((prev) => ({
                                      ...prev,
                                      [m.id]: { ...d, member_type: v },
                                    }));
                                  }}
                                  aria-label="Type de membre"
                                  style={{ ...inputBase, cursor: "pointer", fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                                >
                                  <option value="pionnier">pionnier</option>
                                  <option value="fondateur">fondateur</option>
                                  <option value="communaute">communaute</option>
                                  <option value="collaborateur">collaborateur</option>
                                </select>
                              ) : (
                                displayMemberType(m.member_type)
                              )}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top", minWidth: "3.5rem" }}>
                              {editingMemberId === m.id ? (
                                <select
                                  value={multKey}
                                  onChange={(e) => {
                                    const v = Number(e.target.value);
                                    const mult = (v === 1.2 ? 1.2 : v === 2 ? 2.0 : 1.0) as MultiplierValue;
                                    setMemberDrafts((prev) => ({
                                      ...prev,
                                      [m.id]: { ...d, multiplier: mult },
                                    }));
                                  }}
                                  aria-label="Multiplicateur"
                                  style={{ ...inputBase, cursor: "pointer", fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                                >
                                  <option value="1">1.0</option>
                                  <option value="1.2">1.2</option>
                                  <option value="2">2.0</option>
                                </select>
                              ) : (
                                multDisplay
                              )}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top", minWidth: "6.5rem" }}>
                              {editingMemberId === m.id ? (
                                <input
                                  type="text"
                                  value={d.numero_membre}
                                  onChange={(e) =>
                                    setMemberDrafts((prev) => ({
                                      ...prev,
                                      [m.id]: { ...d, numero_membre: e.target.value },
                                    }))
                                  }
                                  aria-label="Numéro membre"
                                  autoComplete="off"
                                  placeholder="N° membre"
                                  style={{ ...inputBase, fontSize: "0.82rem", padding: "0.5rem 0.55rem" }}
                                />
                              ) : rowNumeroMembreString(m).length ? (
                                rowNumeroMembreString(m)
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top" }}>
                              {editingMemberId === m.id ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", alignItems: "stretch" }}>
                                  <button
                                    type="button"
                                    disabled={!dirty || savingMemberId === m.id}
                                    onClick={() => void saveMember(m.id)}
                                    style={{
                                      background: dirty ? ROUGE : "rgba(245, 240, 232, 0.06)",
                                      color: TEXT,
                                      border: `1px solid ${dirty ? ROUGE : "rgba(245, 240, 232, 0.12)"}`,
                                      padding: "0.45rem 0.55rem",
                                      cursor: !dirty || savingMemberId === m.id ? "not-allowed" : "pointer",
                                      fontSize: "0.68rem",
                                      letterSpacing: "0.1em",
                                      textTransform: "uppercase",
                                      opacity: dirty ? 1 : 0.5,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {savingMemberId === m.id ? "…" : "Sauvegarder"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={savingMemberId === m.id}
                                    onClick={() => setEditingMemberId(null)}
                                    style={{
                                      background: "transparent",
                                      color: TEXT,
                                      border: "1px solid rgba(245, 240, 232, 0.2)",
                                      padding: "0.45rem 0.55rem",
                                      cursor: savingMemberId === m.id ? "wait" : "pointer",
                                      fontSize: "0.68rem",
                                      letterSpacing: "0.08em",
                                      textTransform: "uppercase",
                                      opacity: 0.85,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Annuler
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMemberDrafts((prev) => ({
                                      ...prev,
                                      [m.id]: defaultMemberDraft(m),
                                    }));
                                    setEditingMemberId(m.id);
                                  }}
                                  style={{
                                    background: "rgba(212, 160, 23, 0.12)",
                                    color: GOLD,
                                    border: "1px solid rgba(212, 160, 23, 0.35)",
                                    padding: "0.45rem 0.65rem",
                                    cursor: "pointer",
                                    fontSize: "0.68rem",
                                    letterSpacing: "0.1em",
                                    textTransform: "uppercase",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Modifier
                                </button>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      );
                    })}
                </table>
                {members.length === 0 ? <p style={{ opacity: 0.6, marginTop: "1rem" }}>Aucun membre.</p> : null}
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

const labelSm = {
  display: "block",
  fontSize: "0.68rem",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  opacity: 0.5,
  marginBottom: "0.4rem",
} as const;

const inputBase = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.65rem 0.75rem",
  background: "rgba(245, 240, 232, 0.05)",
  border: "1px solid rgba(245, 240, 232, 0.12)",
  borderRadius: "8px",
  color: TEXT,
  fontSize: "0.9rem",
} as const;

"use client";

import { createBrowserClient } from "@supabase/ssr";
import { Bebas_Neue, DM_Sans } from "next/font/google";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
} from "react";
import { signOut } from "../../../lib/auth";

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

type VideoRow = {
  id: string;
  youtube_id: string;
  title: string | null;
  points_value: number | null;
};

type ProfileRow = {
  display_name: string | null;
};

type QuizQuestionPayload = {
  id: string;
  question: string;
  options: string[];
};

function displayNameFrom(
  profile: ProfileRow | null,
  session: Session,
): string {
  const meta = session.user.user_metadata as Record<
    string,
    unknown
  > | undefined;
  const fullName =
    typeof meta?.full_name === "string" ? meta.full_name : undefined;
  return (
    profile?.display_name?.trim() ||
    fullName ||
    session.user.email?.split("@")[0] ||
    "Membre"
  );
}

function normalizeFragment(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

const LABELS = ["A", "B", "C", "D"];

const navPages: { href: string; label: string }[] = [
  { href: "/", label: "Accueil" },
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/videos", label: "Vidéos" },
  { href: "/banque", label: "Banque LEVE" },
  { href: "/classement", label: "Classement" },
  { href: "/transparence", label: "Transparence" },
];

export default function VideoDetailPage(): JSX.Element | null {
  const router = useRouter();
  const params = useParams();
  const rawId = params?.id;
  const videoId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [video, setVideo] = useState<VideoRow | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [frag1, setFrag1] = useState("");
  const [frag2, setFrag2] = useState("");
  const [frag3, setFrag3] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [codeTone, setCodeTone] = useState<"muted" | "ok" | "err">("muted");
  const [codePointsEarned, setCodePointsEarned] = useState<number | null>(null);
  const [codeUnlocked, setCodeUnlocked] = useState(false);

  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionPayload[]>([]);
  const [quizLoadError, setQuizLoadError] = useState<string | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [secondsLeft, setSecondsLeft] = useState(90);
  const [quizActive, setQuizActive] = useState(false);
  const [quizDone, setQuizDone] = useState(false);
  const [quizBusy, setQuizBusy] = useState(false);
  const [quizResult, setQuizResult] = useState<{
    correct: number;
    total: number;
    points: number;
  } | null>(null);

  const [signingOut, setSigningOut] = useState(false);
  const quizSubmitOnce = useRef(false);
  const timerSubmitRef = useRef(false);

  const fullCode = `${frag1}-${frag2}-${frag3}`;
  const fragmentsComplete =
    frag1.length === 4 && frag2.length === 4 && frag3.length === 4;

  useEffect(() => {
    if (!videoId || typeof videoId !== "string") return;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    let cancelled = false;

    void supabase
      .from("videos")
      .select("id, youtube_id, title, points_value")
      .eq("id", videoId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setVideoError(error.message);
          setVideo(null);
          return;
        }
        if (!data) {
          setVideoError("Vidéo introuvable");
          setVideo(null);
          return;
        }
        setVideo(data as VideoRow);
        setVideoError(null);
      });

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

      const profileRes = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", initial.user.id)
        .maybeSingle();
      if (!cancelled && !profileRes.error) {
        setProfile(profileRes.data as ProfileRow | null);
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
      const profileRes = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", nextSession.user.id)
        .maybeSingle();
      if (!cancelled && !profileRes.error) {
        setProfile(profileRes.data as ProfileRow | null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router, videoId]);

  const loadQuizQuestions = useCallback(async (): Promise<void> => {
    if (!videoId || typeof videoId !== "string") return;
    setQuizLoading(true);
    setQuizLoadError(null);
    try {
      const res = await fetch(
        `/api/quiz/questions?video_id=${encodeURIComponent(videoId)}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const data = (await res.json()) as {
        questions?: QuizQuestionPayload[];
        error?: string;
      };
      if (!res.ok) {
        setQuizQuestions([]);
        setQuizLoadError(data.error ?? "Impossible de charger le quiz");
        return;
      }
      setQuizQuestions(Array.isArray(data.questions) ? data.questions : []);
    } catch {
      setQuizLoadError("Erreur réseau — quiz");
      setQuizQuestions([]);
    } finally {
      setQuizLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    if (!codeUnlocked) return;
    void loadQuizQuestions();
  }, [codeUnlocked, loadQuizQuestions]);

  useEffect(() => {
    if (!quizActive || quizDone || quizQuestions.length === 0) {
      return;
    }
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 0 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [quizActive, quizDone, quizQuestions.length]);

  const submitQuiz = useCallback(async (): Promise<void> => {
    if (!videoId || typeof videoId !== "string") return;
    if (!session?.user?.id || quizSubmitOnce.current) return;
    quizSubmitOnce.current = true;
    setQuizBusy(true);
    try {
      const answersPayload = quizQuestions.map((q) => ({
        question_id: q.id,
        selected_index: quizAnswers[q.id] ?? -1,
      }));

      const res = await fetch("/api/quiz/submit", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: videoId,
          membre_id: session.user.id,
          answers: answersPayload,
          time_remaining_seconds: secondsLeft,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        score_correct?: number;
        score_total?: number;
        points_earned?: number;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        if (data?.error !== "already_submitted" && res.status !== 409) {
          quizSubmitOnce.current = false;
        }
        if (data?.error === "already_submitted" || res.status === 409) {
          setQuizResult({
            correct: Number(data.score_correct ?? 0),
            total: Number(data.score_total ?? quizQuestions.length),
            points: 0,
          });
          setQuizLoadError(data.message ?? "Quiz déjà enregistré.");
        } else {
          setQuizLoadError(data.message ?? data.error ?? "Erreur envoi quiz");
        }
        setQuizDone(true);
        setQuizActive(false);
        return;
      }

      setQuizResult({
        correct: Number(data.score_correct ?? 0),
        total: Number(data.score_total ?? quizQuestions.length),
        points: Number(data.points_earned ?? 0),
      });
      setQuizDone(true);
      setQuizActive(false);
    } catch {
      quizSubmitOnce.current = false;
      setQuizLoadError("Erreur réseau — quiz");
      setQuizDone(true);
      setQuizActive(false);
    } finally {
      setQuizBusy(false);
    }
  }, [
    videoId,
    session,
    quizQuestions,
    quizAnswers,
    secondsLeft,
  ]);

  useEffect(() => {
    if (!quizActive || quizDone || secondsLeft !== 0) return;
    if (timerSubmitRef.current) return;
    timerSubmitRef.current = true;
    void submitQuiz();
  }, [quizActive, quizDone, secondsLeft, submitQuiz]);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/");
    } catch {
      setSigningOut(false);
    }
  }

  async function handleCodeSubmit(): Promise<void> {
    if (!fragmentsComplete || !session?.user?.id || !video?.id || codeBusy) {
      return;
    }
    setCodeBusy(true);
    setCodeMessage(null);
    setCodeTone("muted");
    try {
      const res = await fetch("/api/code/valider", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: video.id,
          submitted_code: fullCode,
          membre_id: session.user.id,
        }),
      });
      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        setCodeTone("err");
        setCodeMessage(
          String(
            data.message ??
              data.error ??
              `Erreur serveur (${res.status})`,
          ),
        );
        return;
      }

      const alreadySubmitted = data.already_submitted === true;
      if (alreadySubmitted) {
        setCodeTone("err");
        setCodeMessage(String(data.message ?? "Tu as déjà soumis ce code"));
        return;
      }

      const acknowledged =
        data.success === true || data.valid === true;

      const incorrect =
        !acknowledged &&
        (data.error === "incorrect" || data.success === false);

      if (incorrect) {
        setCodeTone("err");
        setCodeMessage(
          String(
            data.message ?? "Code incorrect, regarde bien la vidéo",
          ),
        );
        return;
      }

      const pts =
        typeof data.points_earned === "number"
          ? data.points_earned
          : Number(data.points_earned ?? 0);
      setCodeTone("ok");
      setCodePointsEarned(Number.isFinite(pts) ? pts : 0);
      setCodeMessage(
        pts > 0
          ? `Code validé ! Tu gagnes ${pts} pts.`
          : "Code validé !",
      );
      setCodeUnlocked(true);
      quizSubmitOnce.current = false;
      timerSubmitRef.current = false;
      setQuizAnswers({});
      setQuizIndex(0);
      setSecondsLeft(90);
      setQuizDone(false);
      setQuizResult(null);
      setQuizLoadError(null);
      setQuizActive(true);
    } catch {
      setCodeTone("err");
      setCodeMessage("Une erreur est survenue. Réessaie.");
    } finally {
      setCodeBusy(false);
    }
  }

  function onPickOption(questionId: string, optionIndex: number): void {
    if (quizDone || !quizActive) return;
    setQuizAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));

    const isLast = quizIndex >= quizQuestions.length - 1;
    if (isLast) {
      timerSubmitRef.current = true;
      void submitQuiz();
    } else {
      setQuizIndex((i) => i + 1);
    }
  }

  function goBackQuestion(): void {
    if (!quizActive || quizDone || quizIndex <= 0) return;
    setQuizIndex((i) => i - 1);
  }

  const fonts = `${bebas.variable} ${dmSans.variable}`;

  if (session === undefined || !videoId || typeof videoId !== "string") {
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
  const ptsLabel =
    video?.points_value != null
      ? `${Number(video.points_value) || 0} pts`
      : "—";

  const currentQ =
    quizQuestions.length && quizIndex < quizQuestions.length
      ? quizQuestions[quizIndex]
      : null;

  const sectionWrap = {
    borderRadius: "14px",
    border: "1px solid rgba(245, 240, 232, 0.1)",
    background: "rgba(245, 240, 232, 0.03)",
    padding: "1.35rem 1.35rem",
    marginBottom: "1.75rem",
  };

  const inputFragStyle = {
    width: "80px",
    textAlign: "center",
    fontSize: "1.05rem",
    letterSpacing: "0.08em",
    fontWeight: 700,
    padding: "0.65rem 0.35rem",
    borderRadius: "8px",
    border: "1px solid rgba(245, 240, 232, 0.2)",
    background: "rgba(8, 8, 8, 0.6)",
    color: TEXT,
    fontFamily:
      "'DM Sans', ui-sans-serif, system-ui, sans-serif",
    textTransform: "uppercase",
  };

  if (video === null && !videoError) {
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
        <p style={{ opacity: 0.7 }}>Chargement de la vidéo…</p>
      </div>
    );
  }

  if (videoError || !video) {
    return (
      <div
        className={fonts}
        style={{
          minHeight: "100vh",
          background: BG,
          color: TEXT,
          fontFamily: "var(--font-dm), system-ui, sans-serif",
          padding: "1.25rem",
        }}
      >
        <header style={{ marginBottom: "1.25rem" }}>
          <Link
            href="/videos"
            style={{ color: GOLD, fontSize: "0.92rem", textDecoration: "none" }}
          >
            ← Vidéos
          </Link>
        </header>
        <p style={{ opacity: 0.85 }}>{videoError ?? "Vidéo introuvable"}</p>
      </div>
    );
  }

  const vidTitle = video.title?.trim() || "Vidéo";

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
          gap: "0.75rem",
          padding: "1rem 1.25rem",
          borderBottom: "1px solid rgba(245, 240, 232, 0.08)",
          position: "sticky",
          top: 0,
          background: "rgba(8, 8, 8, 0.94)",
          backdropFilter: "blur(8px)",
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", minWidth: 0 }}>
          <Link
            href="/videos"
            style={{
              flexShrink: 0,
              color: GOLD,
              fontSize: "0.82rem",
              textDecoration: "none",
              letterSpacing: "0.08em",
            }}
          >
            ← RETOUR
          </Link>
          <Link
            href="/dashboard"
            style={{
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              fontSize: "2rem",
              letterSpacing: "0.12em",
              color: TEXT,
              textDecoration: "none",
              lineHeight: 1,
            }}
          >
            LEVE
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexShrink: 0 }}>
          <span
            style={{
              fontSize: "0.78rem",
              opacity: 0.82,
              maxWidth: "32vw",
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
              padding: "0.42rem 0.75rem",
              fontSize: "0.75rem",
              cursor: signingOut ? "wait" : "pointer",
            }}
          >
            {signingOut ? "…" : "Déconnexion"}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: "860px", margin: "0 auto", padding: "1.35rem 1.15rem 2rem" }}>
        {/* Section 1 — Lecteur */}
        <section style={sectionWrap}>
          <div style={{ overflow: "hidden", borderRadius: "12px", border: "1px solid rgba(245, 240, 232, 0.1)" }}>
            <div style={{ aspectRatio: "16 / 9", background: "#111" }}>
              <iframe
                title={`Vidéo YouTube — ${vidTitle}`}
                src={`https://www.youtube.com/embed/${video.youtube_id}`}
                style={{ width: "100%", height: "100%", border: "none" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "1rem",
              marginTop: "1.25rem",
            }}
          >
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "clamp(1.95rem, 6vw, 2.85rem)",
                letterSpacing: "0.06em",
                lineHeight: 1.06,
              }}
            >
              {vidTitle}
            </h1>
            <span
              style={{
                flexShrink: 0,
                background: "rgba(212, 160, 23, 0.12)",
                color: GOLD,
                border: `1px solid ${GOLD}`,
                fontSize: "0.8rem",
                fontWeight: 700,
                letterSpacing: "0.06em",
                padding: "0.42rem 0.75rem",
                borderRadius: "10px",
                marginTop: "0.35rem",
              }}
            >
              {ptsLabel}
            </span>
          </div>
        </section>

        {/* Section 2 — Code */}
        <section style={sectionWrap}>
          <h2
            style={{
              margin: "0 0 1rem",
              fontFamily: "var(--font-bebas), Impact, sans-serif",
              letterSpacing: "0.22em",
              fontSize: "1.85rem",
            }}
          >
            SOUMETS TON CODE
          </h2>
          <p style={{ margin: "0 0 1rem", opacity: 0.78, lineHeight: 1.5, fontSize: "0.95rem" }}>
            Format : trois fragments affichés dans la vidéo. Regroupe-les comme affiché.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "0.65rem",
              marginBottom: "1.25rem",
            }}
          >
            <input
              aria-label="Fragment code 1"
              value={frag1}
              onChange={(e) => setFrag1(normalizeFragment(e.target.value))}
              maxLength={4}
              style={{ ...inputFragStyle, outlineColor: GOLD } as Record<string, string | number>}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              disabled={!!codeBusy}
              placeholder="XXXX"
            />
            <span style={{ opacity: 0.65, fontWeight: 700, letterSpacing: "0.1em" }}>—</span>
            <input
              aria-label="Fragment code 2"
              value={frag2}
              onChange={(e) => setFrag2(normalizeFragment(e.target.value))}
              maxLength={4}
              style={{ ...inputFragStyle, outlineColor: GOLD } as Record<string, string | number>}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              disabled={!!codeBusy}
              placeholder="XXXX"
            />
            <span style={{ opacity: 0.65, fontWeight: 700, letterSpacing: "0.1em" }}>—</span>
            <input
              aria-label="Fragment code 3"
              value={frag3}
              onChange={(e) => setFrag3(normalizeFragment(e.target.value))}
              maxLength={4}
              style={{ ...inputFragStyle, outlineColor: GOLD } as Record<string, string | number>}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              disabled={!!codeBusy}
              placeholder="XXXX"
            />
          </div>

          <button
            type="button"
            disabled={codeBusy || !fragmentsComplete}
            onClick={() => void handleCodeSubmit()}
            style={{
              background: fragmentsComplete ? ROUGE : "#5a332e",
              color: TEXT,
              fontWeight: 700,
              fontSize: "0.95rem",
              padding: "0.82rem 1.6rem",
              borderRadius: "10px",
              border: `1px solid ${fragmentsComplete ? ROUGE : "#4a2925"}`,
              cursor: fragmentsComplete && !codeBusy ? "pointer" : "not-allowed",
              letterSpacing: "0.06em",
            }}
          >
            {codeBusy ? "Vérification…" : "Valider le code"}
          </button>

          {!!codePointsEarned && codeTone === "ok" ? (
            <p style={{ margin: "1rem 0 0", color: GOLD, fontWeight: 600 }}>
              +{codePointsEarned} pts cumulés avec ce code (multiplicateur appliqué).
            </p>
          ) : null}

          {codeMessage ? (
            <p
              style={{
                margin: "1rem 0 0",
                opacity: codeTone === "muted" ? 0.72 : 1,
                color:
                  codeTone === "err"
                    ? "#e8a098"
                    : codeTone === "ok"
                      ? "#b8e08b"
                      : TEXT,
              }}
            >
              {codeMessage}
            </p>
          ) : null}
        </section>

        {/* Section 3 — Quiz */}
        {codeUnlocked ? (
          <section style={sectionWrap}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "1rem", marginBottom: "1rem" }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: "var(--font-bebas), Impact, sans-serif",
                  letterSpacing: "0.12em",
                  fontSize: "1.95rem",
                }}
              >
                QUIZ — 90 SECONDES
              </h2>
              {!quizDone && quizActive ? (
                <span
                  style={{
                    fontSize: "1.35rem",
                    fontVariantNumeric: "tabular-nums",
                    color: ROUGE,
                    fontWeight: 800,
                  }}
                >
                  {secondsLeft}s
                </span>
              ) : null}
            </div>

            {quizLoading ? (
              <p style={{ opacity: 0.75 }}>Chargement du quiz…</p>
            ) : !quizQuestions.length ? (
              <p style={{ opacity: 0.82, margin: "0.25rem 0 0" }}>
                Quiz non disponible pour cette vidéo
              </p>
            ) : quizDone && quizResult ? (
              <div style={{ paddingTop: "0.25rem" }}>
                <p style={{ margin: "0 0 0.5rem", fontSize: "1.08rem", fontWeight: 600 }}>
                  Score :{" "}
                  <span style={{ color: GOLD }}>
                    {quizResult.correct}/{quizResult.total}
                  </span>
                </p>
                <p style={{ margin: "0", opacity: 0.92 }}>
                  Bonus quiz :{" "}
                  <span style={{ color: GOLD, fontWeight: 700 }}>{quizResult.points} pts</span>
                  {quizLoadError && quizResult.points === 0 ? (
                    <span style={{ display: "block", marginTop: "0.5rem", color: "#e8a098", opacity: 0.95 }}>
                      {quizLoadError}
                    </span>
                  ) : null}
                </p>
              </div>
            ) : (
              <>
                <p style={{ margin: "0 0 0.95rem", opacity: 0.78, fontSize: "0.9rem", lineHeight: 1.5 }}>
                  Sélectionne la bonne réponse (A · B · C · D). Le quiz récompense jusqu’à 5 bonnes réponses avant la fin du chrono rouge.
                </p>

                {currentQ ? (
                  <div>
                    <p style={{ margin: "0 0 0.35rem", fontSize: "0.76rem", letterSpacing: "0.16em", color: GOLD, opacity: 0.9 }}>
                      QUESTION {quizIndex + 1} — 5
                    </p>
                    <p style={{ margin: "0 0 1rem", fontSize: "1.05rem", lineHeight: 1.46, fontWeight: 600 }}>
                      {currentQ.question}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                      {currentQ.options.slice(0, 4).map((opt, oi) => {
                        const active = quizAnswers[currentQ!.id] === oi;
                        return (
                          <button
                            key={`${currentQ!.id}-${oi}`}
                            type="button"
                            disabled={quizBusy}
                            onClick={() => void onPickOption(currentQ!.id, oi)}
                            style={{
                              display: "flex",
                              gap: "0.85rem",
                              alignItems: "flex-start",
                              textAlign: "left",
                              padding: "0.78rem 0.92rem",
                              borderRadius: "10px",
                              border: active ? `1px solid ${ROUGE}` : "1px solid rgba(245, 240, 232, 0.15)",
                              background: active ? "rgba(192, 57, 43, 0.12)" : "rgba(8, 8, 8, 0.45)",
                              color: TEXT,
                              cursor: quizBusy ? "wait" : "pointer",
                              fontSize: "0.93rem",
                              lineHeight: 1.4,
                            }}
                          >
                            <span
                              style={{
                                flexShrink: 0,
                                fontWeight: 800,
                                color: GOLD,
                                minWidth: "1.75rem",
                              }}
                            >
                              {LABELS[oi]}.
                            </span>
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ marginTop: "1.15rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        disabled={quizIndex <= 0}
                        onClick={goBackQuestion}
                        style={{
                          padding: "0.55rem 0.95rem",
                          borderRadius: "8px",
                          border: "1px solid rgba(245, 240, 232, 0.2)",
                          background: "transparent",
                          color: TEXT,
                          opacity: quizIndex <= 0 ? 0.35 : 1,
                          cursor: quizIndex <= 0 ? "not-allowed" : "pointer",
                          fontSize: "0.88rem",
                        }}
                      >
                        ← Précédent
                      </button>
                      <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>
                        {quizBusy ? "Envoi du quiz…" : null}
                      </span>
                      <button
                        type="button"
                        disabled={
                          quizBusy ||
                          quizAnswers[currentQ!.id] === undefined
                        }
                        onClick={() => {
                          const isLast = quizIndex >= quizQuestions.length - 1;
                          if (quizAnswers[currentQ!.id] === undefined) return;
                          if (isLast) {
                            timerSubmitRef.current = true;
                            void submitQuiz();
                          } else {
                            setQuizIndex((i) => Math.min(quizQuestions.length - 1, i + 1));
                          }
                        }}
                        style={{
                          padding: "0.55rem 1rem",
                          borderRadius: "8px",
                          border: `1px solid ${GOLD}`,
                          background: quizAnswers[currentQ!.id] !== undefined ? "rgba(212, 160, 23, 0.12)" : "transparent",
                          color: GOLD,
                          opacity: quizAnswers[currentQ!.id] !== undefined ? 1 : 0.38,
                          cursor:
                            quizAnswers[currentQ!.id] !== undefined ? "pointer" : "not-allowed",
                          fontWeight: 600,
                          fontSize: "0.88rem",
                        }}
                      >
                        {quizIndex >= quizQuestions.length - 1 ? "Terminer" : "Suivant →"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p style={{ opacity: 0.7 }}>Pas de question…</p>
                )}
              </>
            )}
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
            maxWidth: "860px",
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
                color: p.href.startsWith("/videos") ? GOLD : TEXT,
                opacity: p.href.startsWith("/videos") ? 1 : 0.75,
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
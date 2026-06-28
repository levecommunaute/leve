"use client";

import { createBrowserClient } from "@repo/supabase/browser";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { checkJwtExpired } from "../../../../lib/supabase";

const TIMER_SECONDS = 90;

interface Video {
  id: string;
  title: string;
}

type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  correct_answer: string;
};

const FEEDBACK_DELAY_MS = 1500;

const OPTION_STYLE_NEUTRAL: React.CSSProperties = {
  background: "#141414",
  border: "1px solid rgba(255,255,255,.08)",
  color: "#F5F0E8",
};

const OPTION_STYLE_CORRECT: React.CSSProperties = {
  background: "rgba(46,204,113,.15)",
  border: "1px solid #2ECC71",
  color: "#2ECC71",
};

const OPTION_STYLE_WRONG: React.CSSProperties = {
  background: "rgba(192,57,43,.15)",
  border: "1px solid #C0392B",
  color: "#C0392B",
};

/** bonne_reponse = lettre (a–d) ou, en legacy, texte d'une option options[]. */
function resolveCorrectIndex(correctAnswer: string, options: string[]): number {
  const raw = correctAnswer.trim();
  if (!raw) return -1;

  const letter = raw.toLowerCase();
  if (letter === "a" || letter === "b" || letter === "c" || letter === "d") {
    const idx = letter.charCodeAt(0) - 97;
    if (idx >= 0 && idx < options.length) return idx;
  }

  return options.findIndex((o) => o.trim().toLowerCase() === raw.toLowerCase());
}

function getOptionStyle(
  optionIndex: number,
  selectedIndex: number | undefined,
  correctIndex: number,
  revealed: boolean,
): React.CSSProperties {
  const base: React.CSSProperties = {
    textAlign: "left",
    padding: "0.75rem 1rem",
    fontSize: "max(14px, 0.95rem)",
    minHeight: "44px",
    display: "flex",
    alignItems: "center",
  };

  if (!revealed) {
    return {
      ...base,
      ...OPTION_STYLE_NEUTRAL,
      cursor: "pointer",
    };
  }

  const isCorrect = optionIndex === correctIndex;
  const isSelected = selectedIndex === optionIndex;

  if (isCorrect) {
    return { ...base, ...OPTION_STYLE_CORRECT, cursor: "default" };
  }

  if (isSelected) {
    return { ...base, ...OPTION_STYLE_WRONG, cursor: "default" };
  }

  return { ...base, ...OPTION_STYLE_NEUTRAL, cursor: "default" };
}

function formatTime(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Index 0–3 → lettre attendue par l’API (aligné sur l’ordre du tableau choix). */
function indexToAnswerLetter(index: number): "a" | "b" | "c" | "d" | null {
  if (index < 0 || index > 3) return null;
  return String.fromCharCode(97 + index) as "a" | "b" | "c" | "d";
}

export default function VideoQuizPage(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();
  const rawId = params.id;
  const videoId = (Array.isArray(rawId) ? rawId[0] : rawId) ?? "";

  const [video, setVideo] = useState<Video | null>(null);
  const [quiz_questions, setQuiz_questions] = useState<QuizQuestion[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string>("");
  const [secondsLeft, setSecondsLeft] = useState(TIMER_SECONDS);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [revealedQuestionId, setRevealedQuestionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    score_correct: number;
    score_total: number;
    points_earned: number;
    error?: string;
  } | null>(null);

  const submitOnce = useRef(false);
  const autoSubmitFired = useRef(false);
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secondsLeftRef = useRef(secondsLeft);

  useEffect(() => {
    secondsLeftRef.current = secondsLeft;
  }, [secondsLeft]);

  useEffect(() => {
    return () => {
      if (advanceTimeoutRef.current) clearTimeout(advanceTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user?.id) setUserId(session.user.id);
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const supabase = createBrowserClient();
        const [vResult, qRes] = await Promise.all([
          supabase.from("videos").select("id, title").eq("id", videoId).maybeSingle(),
          fetch(`/api/quiz/questions?video_id=${encodeURIComponent(videoId)}`, {
            credentials: "include",
          }),
        ]);
        if (cancelled) return;
        if (vResult.error) {
          if (await checkJwtExpired({ message: vResult.error.message })) return;
          console.error("video load:", vResult.error.message);
        }
        setVideo(vResult.data ?? null);
        if (!qRes.ok) {
          const err = await qRes.json().catch(() => ({}));
          if (await checkJwtExpired({ status: qRes.status })) return;
          setLoadError(
            typeof err?.error === "string"
              ? err.error
              : "Impossible de charger le quiz.",
          );
          setQuiz_questions([]);
          return;
        }
        const data = (await qRes.json()) as { quiz_questions?: QuizQuestion[] };
        const qs = Array.isArray(data.quiz_questions) ? data.quiz_questions : [];
        setQuiz_questions(qs);
        if (qs.length === 0) {
          setLoadError("Aucune question pour cette vidéo pour le moment.");
        } else {
          setPhase("running");
          setSecondsLeft(TIMER_SECONDS);
          setAnswers({});
          setCurrentQuestionIndex(0);
          setRevealedQuestionId(null);
          setResult(null);
          submitOnce.current = false;
          autoSubmitFired.current = false;
        }
      } catch {
        if (!cancelled) setLoadError("Erreur réseau.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  useEffect(() => {
    if (phase !== "running" || quiz_questions.length === 0) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 0 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, quiz_questions.length]);

  const doSubmit = useCallback(
    async (timeRemaining: number, answersOverride?: Record<string, number>) => {
      if (submitOnce.current || !userId || quiz_questions.length === 0) return;
      if (advanceTimeoutRef.current) {
        clearTimeout(advanceTimeoutRef.current);
        advanceTimeoutRef.current = null;
      }
      submitOnce.current = true;
      setSubmitting(true);
      setPhase("done");
      const finalAnswers = answersOverride ?? answers;
      try {
        const body = {
          video_id: videoId,
          membre_id: userId,
          time_remaining_seconds: timeRemaining,
          answers: quiz_questions.map((q) => {
            const raw = finalAnswers[q.id];
            const selected_answer =
              typeof raw === "number" ? indexToAnswerLetter(raw) : null;
            return {
              question_id: q.id,
              selected_answer,
            };
          }),
        };
        const res = await fetch("/api/quiz/submit", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data?.error === "already_submitted") {
            setResult({
              score_correct: 0,
              score_total: quiz_questions.length,
              points_earned: 0,
              error: "Tu as déjà complété le quiz pour cette vidéo.",
            });
          } else {
            setResult({
              score_correct: 0,
              score_total: quiz_questions.length,
              points_earned: 0,
              error:
                typeof data?.error === "string"
                  ? data.error
                  : "Envoi impossible.",
            });
          }
          return;
        }
        setResult({
          score_correct: Number(data.score_correct ?? 0),
          score_total: Number(data.score_total ?? quiz_questions.length),
          points_earned: Number(data.points_earned ?? 0),
        });
      } catch {
        setResult({
          score_correct: 0,
          score_total: quiz_questions.length,
          points_earned: 0,
          error: "Erreur réseau.",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [userId, videoId, quiz_questions, answers],
  );

  useEffect(() => {
    if (phase !== "running" || secondsLeft > 0) return;
    if (autoSubmitFired.current) return;
    autoSubmitFired.current = true;
    void doSubmit(0);
  }, [phase, secondsLeft, doSubmit]);

  const onSelect = (q: QuizQuestion, index: number) => {
    if (phase !== "running" || revealedQuestionId === q.id) return;

    const nextAnswers = { ...answers, [q.id]: index };
    setAnswers(nextAnswers);
    setRevealedQuestionId(q.id);

    if (advanceTimeoutRef.current) clearTimeout(advanceTimeoutRef.current);
    advanceTimeoutRef.current = setTimeout(() => {
      advanceTimeoutRef.current = null;
      const isLast = q.id === quiz_questions[quiz_questions.length - 1]?.id;
      if (isLast) {
        autoSubmitFired.current = true;
        void doSubmit(secondsLeftRef.current, nextAnswers);
        return;
      }
      setCurrentQuestionIndex((i) => i + 1);
      setRevealedQuestionId(null);
    }, FEEDBACK_DELAY_MS);
  };

  const handleManualSubmit = () => {
    if (phase !== "running" || submitting) return;
    autoSubmitFired.current = true;
    void doSubmit(secondsLeftRef.current);
  };

  const currentQuestion = quiz_questions[currentQuestionIndex];

  const shellStyle: React.CSSProperties = {
    background: "#080808",
    minHeight: "100vh",
    color: "#F5F0E8",
    fontFamily: "DM Sans, sans-serif",
  };

  if (loading) {
    return (
      <div
        style={{
          ...shellStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Chargement...
      </div>
    );
  }

  if (loadError && quiz_questions.length === 0) {
    return (
      <main style={shellStyle}>
        <nav
          style={{
            padding: "1rem 2rem",
            borderBottom: "1px solid rgba(255,255,255,.08)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: "Bebas Neue, sans-serif",
              fontSize: "1.5rem",
              cursor: "pointer",
            }}
            onClick={() => router.push("/dashboard")}
          >
            LEVE
          </span>
          <span
            style={{ opacity: 0.5, cursor: "pointer",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
            onClick={() => router.push(`/videos/${videoId}`)}
          >
            Retour
          </span>
        </nav>
        <div
          style={{
            maxWidth: "900px",
            margin: "0 auto",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          {loadError}
        </div>
      </main>
    );
  }

  const timerUrgent = secondsLeft <= 15 && phase === "running";

  return (
    <main style={shellStyle}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .quiz-page-content {
              max-width: 900px;
              margin: 0 auto;
              padding: 2rem;
            }
            .quiz-nav-back {
              display: inline-flex;
              align-items: center;
              min-height: 44px;
              padding: 0.25rem 0.5rem;
            }
            .quiz-option-btn {
              min-height: 44px;
              font-size: max(14px, 0.95rem);
            }
            .quiz-timer {
              font-size: clamp(1.5rem, 6vw, 1.75rem);
              font-family: "Bebas Neue", sans-serif;
              line-height: 1;
            }
            .quiz-timer-row {
              display: flex;
              align-items: center;
              gap: 1rem;
              margin-bottom: 2rem;
              flex-wrap: wrap;
            }
            @media (max-width: 479px) {
              .quiz-page-nav {
                padding: 1rem !important;
              }
              .quiz-page-content {
                padding: 1rem;
              }
              .quiz-timer-row {
                flex-direction: column;
                align-items: flex-start;
                gap: 0.35rem;
                margin-bottom: 1.5rem;
              }
              .quiz-timer {
                font-size: clamp(2rem, 10vw, 2.5rem);
              }
            }
          `,
        }}
      />
      <nav
        className="quiz-page-nav"
        style={{
          padding: "1rem 2rem",
          borderBottom: "1px solid rgba(255,255,255,.08)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontFamily: "Bebas Neue, sans-serif",
            fontSize: "1.5rem",
            cursor: "pointer",
          }}
          onClick={() => router.push("/dashboard")}
        >
          LEVE
        </span>
        <span
          className="quiz-nav-back"
          style={{ opacity: 0.5, cursor: "pointer", fontFamily: "var(--font-mono), ui-monospace, monospace" }}
          onClick={() => router.push(`/videos/${videoId}`)}
        >
          Retour
        </span>
      </nav>
      <div className="quiz-page-content">
        <h1
          style={{
            fontFamily: "Bebas Neue, sans-serif",
            fontSize: "clamp(1.2rem, 5vw, 2.5rem)",
            marginBottom: "0.5rem",
          }}
        >
          Quiz
        </h1>
        {video?.title ? (
          <p style={{ opacity: 0.75, marginBottom: "1.5rem" }}>{video.title}</p>
        ) : null}

        {phase === "running" ? (
          <div className="quiz-timer-row">
            <span
              className="quiz-timer"
              style={{
                color: timerUrgent ? "#C0392B" : "#D4A017",
              }}
            >
              {formatTime(secondsLeft)}
            </span>
            <span style={{ opacity: 0.6, fontSize: "max(14px, 0.9rem)" }}>
              {quiz_questions.length} questions · 90 secondes
            </span>
            {currentQuestion ? (
              <span style={{ opacity: 0.6, fontSize: "max(14px, 0.9rem)" }}>
                Question {currentQuestionIndex + 1} / {quiz_questions.length}
              </span>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {phase === "running" && currentQuestion ? (
            <div
              key={currentQuestion.id}
              style={{
                background: "#111",
                padding: "1.5rem",
                border: "1px solid rgba(255,255,255,.06)",
              }}
            >
              <p
                style={{
                  fontFamily: "Bebas Neue, sans-serif",
                  fontSize: "1.15rem",
                  marginBottom: "1rem",
                  color: "#F5F0E8",
                }}
              >
                {currentQuestionIndex + 1}. {currentQuestion.question}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {currentQuestion.options.map((opt, oi) => {
                  const selectedIndex = answers[currentQuestion.id];
                  const revealed = revealedQuestionId === currentQuestion.id;
                  const correctIndex = resolveCorrectIndex(
                    currentQuestion.correct_answer,
                    currentQuestion.options,
                  );
                  return (
                    <button
                      key={oi}
                      type="button"
                      className="quiz-option-btn"
                      disabled={revealed}
                      onClick={() => onSelect(currentQuestion, oi)}
                      style={getOptionStyle(oi, selectedIndex, correctIndex, revealed)}
                    >
                      {String.fromCharCode(65 + oi)}. {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {phase === "running" ? (
          <div style={{ marginTop: "2rem" }}>
            <button
              type="button"
              onClick={handleManualSubmit}
              disabled={submitting}
              style={{
                background: "#C0392B",
                color: "#fff",
                border: "none",
                padding: "0.75rem 2rem",
                cursor: submitting ? "wait" : "pointer",
                fontFamily: "Bebas Neue, sans-serif",
                fontSize: "1.1rem",
              }}
            >
              ENVOYER MES RÉPONSES
            </button>
          </div>
        ) : null}

        {phase === "done" ? (
          <div
            style={{
              marginTop: "2rem",
              padding: "1.5rem",
              background: result?.error
                ? "rgba(192,57,43,.1)"
                : "rgba(46,204,113,.1)",
              fontFamily: "var(--font-mono), ui-monospace, monospace",}}
          >
            {submitting ? (
              <p>Enregistrement...</p>
            ) : result?.error ? (
              <p>{result.error}</p>
            ) : result ? (
              <>
                <p style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: "1.5rem" }}>
                  Score : {result.score_correct} / {result.score_total}
                </p>
                <p style={{ marginTop: "0.5rem" }}>
                  +{result.points_earned.toFixed(2)} points
                </p>
              </>
            ) : null}
            {!submitting && result ? (
              <button
                type="button"
                onClick={() => router.push("/videos")}
                style={{
                  marginTop: "1rem",
                  background: "transparent",
                  color: "#F5F0E8",
                  border: "1px solid rgba(255,255,255,.2)",
                  padding: "0.5rem 1.25rem",
                  cursor: "pointer",
                }}
              >
                Autres vidéos
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}

/** Points par bonne réponse (aligné sur /api/quiz/submit). */
export const QUIZ_POINTS_PER_CORRECT = 4;

export type QuizTransactionLines = {
  line1: string;
  line2: string;
};

function formatMultiplier(mult: number): string {
  if (!Number.isFinite(mult) || mult <= 0) return "1";
  return Number.isInteger(mult) ? String(mult) : mult.toFixed(1);
}

/** Ex. « Quiz vidéo — 3/5 bonnes réponses · ×2 » */
export function parseQuizScoreFromDescription(
  description: string | null | undefined,
): { correct: number; total: number } | null {
  if (!description?.trim()) return null;
  const m = description.match(/(\d+)\s*\/\s*(\d+)\s+bonnes\s+r[eé]ponses/i);
  if (!m) return null;
  const correct = Number(m[1]);
  const total = Number(m[2]);
  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return { correct, total };
}

/** Ex. « · ×2 » ou « ×2.5 » dans la description. */
export function parseMultiplierFromDescription(
  description: string | null | undefined,
): number | null {
  if (!description?.trim()) return null;
  const m = description.match(/×\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = Number((m[1] ?? "0").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const pointsFmt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });

/**
 * Libellés en 2 lignes pour une transaction points de type quiz.
 * Multiplicateur : description (×N) puis profil.
 */
export function formatQuizTransactionLines(
  amount: number,
  description: string | null | undefined,
  profileMultiplier: number,
): QuizTransactionLines {
  const score = parseQuizScoreFromDescription(description);
  const multFromDesc = parseMultiplierFromDescription(description);
  const profileMult =
    Number.isFinite(profileMultiplier) && profileMultiplier > 0
      ? profileMultiplier
      : 1;
  const mult = multFromDesc ?? profileMult;

  const totalQuestions = score?.total ?? 5;
  let correct = score?.correct;
  if (correct == null || !Number.isFinite(correct)) {
    const absAmt = Math.abs(amount);
    const baseFromAmount =
      mult > 0 ? Math.round(absAmt / mult / QUIZ_POINTS_PER_CORRECT) : 0;
    correct = Math.max(0, Math.min(totalQuestions, baseFromAmount));
  }

  const basePts = correct * QUIZ_POINTS_PER_CORRECT;
  const multLabel = formatMultiplier(mult);

  return {
    line1: `Quiz ${correct}/${totalQuestions} bonnes réponses — base ${pointsFmt.format(basePts)} pts`,
    line2: `Multiplicateur ×${multLabel} appliqué — total ${pointsFmt.format(amount)} pts`,
  };
}

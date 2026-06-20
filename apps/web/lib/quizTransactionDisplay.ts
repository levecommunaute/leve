/** Valeur par défaut si points_value absent (aligné sur /api/quiz/submit). */
export const DEFAULT_VIDEO_POINTS_VALUE = 20;

export function pointsPerCorrectFromVideoValue(
  pointsValue?: number | null,
): number {
  const pv = Number(pointsValue);
  return (Number.isFinite(pv) && pv > 0 ? pv : DEFAULT_VIDEO_POINTS_VALUE) / 5;
}

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

/** Ex. « · 25 pts vidéo » dans la description (transactions récentes). */
export function parsePointsValueFromDescription(
  description: string | null | undefined,
): number | null {
  if (!description?.trim()) return null;
  const m = description.match(/(\d+)\s*pts\s*vid[eé]o/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
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

function parseBonusMultiplierFromDescription(
  description: string | null | undefined,
): number {
  return description?.includes("Bonus 72h") ? 2 : 1;
}

function resolvePointsPerCorrect(
  amount: number,
  description: string | null | undefined,
  score: { correct: number; total: number } | null,
  explicitPointsPerCorrect?: number,
): number {
  if (
    explicitPointsPerCorrect != null &&
    Number.isFinite(explicitPointsPerCorrect) &&
    explicitPointsPerCorrect > 0
  ) {
    return explicitPointsPerCorrect;
  }

  const pointsValueFromDesc = parsePointsValueFromDescription(description);
  if (pointsValueFromDesc != null) {
    return pointsPerCorrectFromVideoValue(pointsValueFromDesc);
  }

  const correct = score?.correct;
  if (correct != null && Number.isFinite(correct) && correct > 0) {
    const bonusMult = parseBonusMultiplierFromDescription(description);
    const derived = Math.abs(amount) / (correct * bonusMult);
    if (Number.isFinite(derived) && derived > 0) {
      return derived;
    }
  }

  return pointsPerCorrectFromVideoValue(DEFAULT_VIDEO_POINTS_VALUE);
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
  pointsPerCorrect?: number,
): QuizTransactionLines {
  const score = parseQuizScoreFromDescription(description);
  const multFromDesc = parseMultiplierFromDescription(description);
  const profileMult =
    Number.isFinite(profileMultiplier) && profileMultiplier > 0
      ? profileMultiplier
      : 1;
  const mult = multFromDesc ?? profileMult;

  const ppc = resolvePointsPerCorrect(amount, description, score, pointsPerCorrect);

  const totalQuestions = score?.total ?? 5;
  let correct = score?.correct;
  if (correct == null || !Number.isFinite(correct)) {
    const bonusMult = parseBonusMultiplierFromDescription(description);
    const absAmt = Math.abs(amount);
    const baseFromAmount = Math.round(absAmt / (ppc * bonusMult));
    correct = Math.max(0, Math.min(totalQuestions, baseFromAmount));
  }

  const basePts = correct * ppc;
  const bonusActif = description?.includes("Bonus 72h") ?? false;
  const bonusMultiplier = bonusActif ? 2 : 1;
  const weightedTotal = basePts * bonusMultiplier * mult;
  const multLabel = formatMultiplier(mult);

  const baseLine = `Quiz ${correct}/${totalQuestions} bonnes réponses — base ${pointsFmt.format(basePts)} pts`;

  return {
    line1: bonusActif
      ? `⚡ ${baseLine} · Bonus 72h ×2`
      : baseLine,
    line2: `Multiplicateur ×${multLabel} appliqué — total ${pointsFmt.format(weightedTotal)} pts pondérés`,
  };
}

import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

/** Points PMQ crédités par bonne réponse (aligné affichage banque type quiz). */
const POINTS_PER_CORRECT = 4;

type AnswerItem = {
  question_id?: string;
  selected_index?: number;
};

async function alreadySubmittedQuiz(
  svc: ReturnType<typeof getServiceSupabase>,
  userId: string,
  videoId: string,
): Promise<boolean> {
  const q = await svc
    .from("quiz_submissions")
    .select("id")
    .eq("user_id", userId)
    .eq("video_id", videoId)
    .maybeSingle();

  if (!q.error && q.data?.id) return true;

  const tx = await svc
    .from("points_transactions")
    .select("id, metadata")
    .eq("user_id", userId)
    .in("type", ["quiz", "quiz_bonus"]);

  if (!tx.error && tx.data?.length) {
    for (const row of tx.data) {
      const m = row.metadata as Record<string, unknown> | null;
      const vid = typeof m?.video_id === "string" ? m.video_id : "";
      if (vid === videoId) return true;
    }
  }

  return false;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authClient = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let body: {
    video_id?: string;
    membre_id?: string;
    answers?: AnswerItem[];
    time_remaining_seconds?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const videoId = typeof body.video_id === "string" ? body.video_id.trim() : "";
  const membreId = typeof body.membre_id === "string" ? body.membre_id.trim() : "";
  const answers = Array.isArray(body.answers) ? body.answers : [];
  const timeLeft = Number(body.time_remaining_seconds ?? 0);

  if (!videoId || !membreId) {
    return NextResponse.json(
      { error: "video_id et membre_id requis" },
      { status: 400 },
    );
  }

  if (membreId !== user.id) {
    return NextResponse.json({ error: "Identité incohérente" }, { status: 403 });
  }

  try {
    const svc = getServiceSupabase();

    if (await alreadySubmittedQuiz(svc, user.id, videoId)) {
      return NextResponse.json(
        {
          error: "already_submitted",
          message: "Quiz déjà enregistré pour cette vidéo",
        },
        { status: 409 },
      );
    }

    const ids = answers
      .map((a) => (typeof a.question_id === "string" ? a.question_id.trim() : ""))
      .filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ error: "Réponses manquantes" }, { status: 400 });
    }

    const { data: rows, error: fetchErr } = await svc
      .from("questions")
      .select(
        "id, video_id, question, option_a, option_b, option_c, option_d, correct_answer",
      )
      .eq("video_id", videoId)
      .in("id", [...new Set(ids)]);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const byId = new Map((rows ?? []).map((r) => [String(r.id), r]));

    let correct = 0;
    const graded: Record<string, boolean> = {};

    for (const ans of answers) {
      const qid = typeof ans.question_id === "string" ? ans.question_id.trim() : "";
      const idx =
        typeof ans.selected_index === "number" ? Math.floor(ans.selected_index) : -1;
      const row = byId.get(qid);
      if (!row || idx < 0 || idx > 3) continue;

      const ordered = [
        String(row.option_a ?? ""),
        String(row.option_b ?? ""),
        String(row.option_c ?? ""),
        String(row.option_d ?? ""),
      ];
      const chosen = ordered[idx]?.trim() ?? "";
      const correctAnswer = String(row.correct_answer ?? "").trim();
      const ok =
        chosen.length > 0 &&
        correctAnswer.length > 0 &&
        chosen.toUpperCase() === correctAnswer.toUpperCase();
      if (ok) correct += 1;
      graded[qid] = ok;
    }

    const denom = Math.max(rows?.length ?? 0, 1);
    const pointsEarned = correct * POINTS_PER_CORRECT;

    const { data: videoMeta } = await svc
      .from("videos")
      .select("title")
      .eq("id", videoId)
      .maybeSingle();

    /** Toujours enregistrer la tentative pour bloquer les doublons même à 0 pt. */
    await svc.from("points_transactions").insert({
      user_id: user.id,
      amount: pointsEarned,
      type: "quiz",
      metadata: {
        video_id: videoId,
        video_title: videoMeta?.title ?? null,
        correct,
        score_total: denom,
        time_remaining_seconds: timeLeft,
      },
    });

    const quizIns = await svc.from("quiz_submissions").insert({
      user_id: user.id,
      video_id: videoId,
      score_correct: correct,
      score_total: denom,
      points_awarded: pointsEarned,
      time_remaining_seconds: timeLeft,
      answers: graded,
    });
    if (quizIns.error) {
      console.warn("[api/quiz/submit] quiz_submissions:", quizIns.error.message);
    }

    return NextResponse.json({
      success: true,
      score_correct: correct,
      score_total: denom,
      points_earned: pointsEarned,
      time_remaining_seconds: timeLeft,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

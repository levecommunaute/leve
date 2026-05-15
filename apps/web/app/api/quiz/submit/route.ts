import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const POINTS_PER_CORRECT = 4;

type AnswerItem = {
  question_id?: string;
  selected_answer?: string | null;
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
    .eq("membre_id", userId)
    .eq("video_id", videoId)
    .maybeSingle();

  if (!q.error && q.data?.id) return true;

  const tx = await svc
    .from("points_transactions")
    .select("id")
    .eq("membre_id", userId)
    .eq("type", "quiz");

  if (!tx.error && tx.data?.length) return true;

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
      .from("quiz_questions")
      .select("id, video_id, question, choix, bonne_reponse")
      .eq("video_id", videoId)
      .in("id", [...new Set(ids)]);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const byId = new Map((rows ?? []).map((r) => [String(r.id), r]));

    let correct = 0;

    for (const ans of answers) {
      const qid = typeof ans.question_id === "string" ? ans.question_id.trim() : "";
      const row = byId.get(qid);
      if (!row) continue;

      const choix = (Array.isArray(row.choix) ? row.choix : []).map((o) => String(o ?? ""));
      const letterRaw =
        typeof ans.selected_answer === "string"
          ? ans.selected_answer.trim().toLowerCase()
          : "";
      let idx = -1;
      if (letterRaw === "a" || letterRaw === "b" || letterRaw === "c" || letterRaw === "d") {
        idx = letterRaw.charCodeAt(0) - 97;
      } else if (typeof ans.selected_index === "number") {
        idx = Math.floor(ans.selected_index);
      }
      if (idx < 0 || idx >= choix.length) continue;

      const chosen = choix[idx]?.trim() ?? "";
      const correctNorm = String(row.bonne_reponse ?? "").trim();
      const ok =
        chosen.length > 0 &&
        correctNorm.length > 0 &&
        chosen.toLowerCase() === correctNorm.toLowerCase();
      if (ok) correct += 1;
    }

    const denom = Math.max(rows?.length ?? 0, 1);
    const pointsEarned = correct * POINTS_PER_CORRECT;

    console.log("INSERTING PT:", { membre_id: user.id, amount: pointsEarned, type: "quiz" })

    const { error: ptError } = await svc.from("points_transactions").insert({
      membre_id: user.id,
      amount: pointsEarned,
      type: "quiz",
      description: `Quiz vidéo — ${correct}/${denom} bonnes réponses`,
    });

    console.log("PT ERROR:", JSON.stringify(ptError))

    const { error: qsError } = await svc.from("quiz_submissions").insert({
      membre_id: user.id,
      video_id: videoId,
      score: correct,
      points_awarded: pointsEarned,
    });

    console.log("QS ERROR:", JSON.stringify(qsError))

    return NextResponse.json({
      success: true,
      score_correct: correct,
      score_total: denom,
      points_earned: pointsEarned,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const POINTS_PER_CORRECT = 4;

/** "a" | "b" | "c" | "d" → index 0–3 dans le tableau choix. */
function letterToIndex(letter: string): number {
  const l = letter.trim().toLowerCase();
  if (l === "a" || l === "b" || l === "c" || l === "d") {
    return l.charCodeAt(0) - 97;
  }
  return -1;
}

/** bonne_reponse = lettre (a–d) ou, en legacy, texte d'une option choix[]. */
function resolveCorrectIndex(bonneReponse: string, choix: string[]): number {
  const raw = bonneReponse.trim();
  if (!raw) return -1;

  const letterIdx = letterToIndex(raw);
  if (letterIdx >= 0 && letterIdx < choix.length) return letterIdx;

  return choix.findIndex((o) => o.trim().toLowerCase() === raw.toLowerCase());
}

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
      if (choix.length === 0) continue;

      let selectedIdx = -1;
      if (typeof ans.selected_answer === "string") {
        selectedIdx = letterToIndex(ans.selected_answer);
      } else if (typeof ans.selected_index === "number") {
        selectedIdx = Math.floor(ans.selected_index);
      }
      if (selectedIdx < 0 || selectedIdx >= choix.length) continue;

      const correctIdx = resolveCorrectIndex(String(row.bonne_reponse ?? ""), choix);
      if (correctIdx >= 0 && selectedIdx === correctIdx) correct += 1;
    }

    const denom = Math.max(rows?.length ?? 0, 1);

    const { data: profile } = await svc
      .from("profiles")
      .select("multiplier")
      .eq("id", user.id)
      .single();
    const multiplicateur = Number(profile?.multiplier ?? 1);

    const pointsEarned = correct * POINTS_PER_CORRECT * multiplicateur;
    const pointsTotal = (rows?.length ?? 0) * POINTS_PER_CORRECT;
    const pointsPerdus =
      (pointsTotal - correct * POINTS_PER_CORRECT) * multiplicateur;

    const quizDescription = `Quiz vidéo — ${correct}/${denom} bonnes réponses · ×${multiplicateur}`;

    const ptRows: {
      membre_id: string;
      amount: number;
      type: string;
      description: string;
    }[] = [
      {
        membre_id: user.id,
        amount: pointsEarned,
        type: "quiz",
        description: quizDescription,
      },
    ];

    if (pointsPerdus > 0) {
      ptRows.push({
        membre_id: user.id,
        amount: -pointsPerdus,
        type: "ptc",
        description: `Quiz vidéo — points non obtenus · ×${multiplicateur}`,
      });
    }

    const { error: ptError } = await svc.from("points_transactions").insert(ptRows);

    if (ptError) {
      return NextResponse.json({ error: ptError.message }, { status: 500 });
    }

    const { error: qsError } = await svc.from("quiz_submissions").insert({
      membre_id: user.id,
      video_id: videoId,
      score: correct,
      points_awarded: pointsEarned,
    });

    if (qsError) {
      return NextResponse.json({ error: qsError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      score_correct: correct,
      score_total: denom,
      points_earned: pointsEarned,
      points_perdus: pointsPerdus,
      multiplicateur,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
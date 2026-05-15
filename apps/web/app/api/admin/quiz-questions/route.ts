import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const ANSWER_LETTERS = new Set(["a", "b", "c", "d"]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  const videoId = request.nextUrl.searchParams.get("video_id")?.trim() ?? "";
  if (!videoId) {
    return NextResponse.json({ error: "video_id requis" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("quiz_questions")
      .select("id, video_id, question, option_a, option_b, option_c, option_d, correct_answer")
      .eq("video_id", videoId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ questions: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: {
    video_id?: string;
    question?: string;
    option_a?: string;
    option_b?: string;
    option_c?: string;
    option_d?: string;
    correct_answer?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const videoId = typeof body.video_id === "string" ? body.video_id.trim() : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const optionA = typeof body.option_a === "string" ? body.option_a.trim() : "";
  const optionB = typeof body.option_b === "string" ? body.option_b.trim() : "";
  const optionC = typeof body.option_c === "string" ? body.option_c.trim() : "";
  const optionD = typeof body.option_d === "string" ? body.option_d.trim() : "";
  const letterRaw = typeof body.correct_answer === "string" ? body.correct_answer.trim().toLowerCase() : "";

  if (!videoId || !question) {
    return NextResponse.json({ error: "video_id et question requis" }, { status: 400 });
  }
  if (!optionA || !optionB || !optionC || !optionD) {
    return NextResponse.json({ error: "Les quatre options sont requises" }, { status: 400 });
  }
  if (!ANSWER_LETTERS.has(letterRaw)) {
    return NextResponse.json({ error: "correct_answer doit être a, b, c ou d" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const { data: vid, error: vErr } = await supabase
      .from("videos")
      .select("id, youtube_id")
      .eq("id", videoId)
      .maybeSingle();

    if (vErr) {
      return NextResponse.json({ error: vErr.message }, { status: 500 });
    }
    if (!vid?.id) {
      return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404 });
    }

    const youtubeId = typeof vid.youtube_id === "string" ? vid.youtube_id : "";

    const { data: inserted, error: insErr } = await supabase
      .from("quiz_questions")
      .insert({
        video_id: videoId,
        youtube_id: youtubeId,
        question,
        option_a: optionA,
        option_b: optionB,
        option_c: optionC,
        option_d: optionD,
        correct_answer: letterRaw,
      })
      .select("id, video_id, question, option_a, option_b, option_c, option_d, correct_answer")
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ question: inserted });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("quiz_questions").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

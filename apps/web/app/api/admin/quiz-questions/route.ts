import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

function asChoixArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => String(o ?? "").trim());
}

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
      .select("id, video_id, question, choix, bonne_reponse")
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
    choix?: unknown;
    bonne_reponse?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const videoId = typeof body.video_id === "string" ? body.video_id.trim() : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const choix = asChoixArray(body.choix);
  const bonneReponse =
    typeof body.bonne_reponse === "string" ? body.bonne_reponse.trim() : "";

  if (!videoId || !question) {
    return NextResponse.json({ error: "video_id et question requis" }, { status: 400 });
  }
  if (choix.length !== 4 || choix.some((o) => !o)) {
    return NextResponse.json({ error: "choix doit être un tableau de 4 options non vides" }, { status: 400 });
  }
  if (!bonneReponse || !choix.some((o) => o.toLowerCase() === bonneReponse.toLowerCase())) {
    return NextResponse.json(
      { error: "bonne_reponse doit correspondre à l'une des options" },
      { status: 400 },
    );
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
        choix,
        bonne_reponse: bonneReponse,
      })
      .select("id, video_id, question, choix, bonne_reponse")
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

import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

function shuffleInPlace<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authClient = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const videoId = request.nextUrl.searchParams.get("video_id")?.trim() ?? "";
  if (!videoId) {
    return NextResponse.json({ error: "video_id requis" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("quiz_questions")
      .select("id, question, option_a, option_b, option_c, option_d")
      .eq("video_id", videoId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    /** Ordre options identique au serveur (/api/quiz/submit compare l’index à option_a … option_d). */
    const picked = shuffleInPlace(rows).slice(0, 5).map((row) => ({
      id: row.id as string,
      question: row.question as string,
      options: [
        row.option_a,
        row.option_b,
        row.option_c,
        row.option_d,
      ].map((o) => String(o ?? "")),
    }));

    return NextResponse.json({ quiz_questions: picked });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

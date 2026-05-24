import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

export type ProductionVideoRow = {
  id: string;
  youtube_id: string;
  title: string | null;
  points_value: number | null;
  full_code: string | null;
  has_code: boolean;
  has_quiz: boolean;
  quiz_question_count: number;
  submission_count: number;
};

async function countByVideoId(
  supabase: ReturnType<typeof getServiceSupabase>,
  table: "quiz_questions" | "quiz_submissions",
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("video_id")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    for (const row of rows) {
      const vid = String(row.video_id ?? "").trim();
      if (!vid) continue;
      counts.set(vid, (counts.get(vid) ?? 0) + 1);
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return counts;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();

    const [videosRes, codesRes, quizCounts, submissionCounts] = await Promise.all([
      supabase
        .from("videos")
        .select("id, youtube_id, title, points_value")
        .order("created_at", { ascending: false }),
      supabase.from("codes").select("video_id, full_code"),
      countByVideoId(supabase, "quiz_questions"),
      countByVideoId(supabase, "quiz_submissions"),
    ]);

    if (videosRes.error) {
      return NextResponse.json({ error: videosRes.error.message }, { status: 500 });
    }
    if (codesRes.error) {
      return NextResponse.json({ error: codesRes.error.message }, { status: 500 });
    }

    const codesByVideo = new Map<string, string>();
    for (const row of codesRes.data ?? []) {
      if (typeof row.video_id === "string" && typeof row.full_code === "string") {
        codesByVideo.set(row.video_id, row.full_code);
      }
    }

    const videos: ProductionVideoRow[] = (videosRes.data ?? []).map((v) => {
      const id = String(v.id);
      const quizQuestionCount = quizCounts.get(id) ?? 0;
      const code = codesByVideo.get(id) ?? null;
      return {
        id,
        youtube_id: String(v.youtube_id ?? ""),
        title: v.title ?? null,
        points_value: v.points_value ?? null,
        full_code: code,
        has_code: code != null,
        has_quiz: quizQuestionCount > 0,
        quiz_question_count: quizQuestionCount,
        submission_count: submissionCounts.get(id) ?? 0,
      };
    });

    return NextResponse.json({ videos });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

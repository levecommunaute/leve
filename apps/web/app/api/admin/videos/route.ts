import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const ALLOWED_POINTS = new Set([15, 25, 30]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: {
    youtube_id?: string;
    title?: string;
    points_value?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const youtubeId = typeof body.youtube_id === "string" ? body.youtube_id.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const pointsValue = Number(body.points_value);

  if (!youtubeId || !title) {
    return NextResponse.json({ error: "youtube_id et title requis" }, { status: 400 });
  }
  if (!ALLOWED_POINTS.has(pointsValue)) {
    return NextResponse.json({ error: "points_value doit être 15, 25 ou 30" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("videos")
      .insert({
        youtube_id: youtubeId,
        title,
        points_value: pointsValue,
        description: "",
      })
      .select("id, youtube_id, title, points_value")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ video: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

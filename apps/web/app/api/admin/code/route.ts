import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";
import { normalizeAdminVideoCode, spreadTimestamps } from "../../../../lib/admin-video-code";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: { video_id?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const videoId = typeof body.video_id === "string" ? body.video_id.trim() : "";
  const codeRaw = typeof body.code === "string" ? body.code : "";

  if (!videoId) {
    return NextResponse.json({ error: "video_id requis" }, { status: 400 });
  }

  const fullCode = normalizeAdminVideoCode(codeRaw);
  if (!fullCode) {
    return NextResponse.json(
      {
        error:
          "Code invalide : attendu 12 caractères (A-Z sans I/O, chiffres sans 0/1), par ex. XXXX-YYYY-ZZZZ",
      },
      { status: 400 },
    );
  }

  try {
    const supabase = getServiceSupabase();

    const { data: video, error: vErr } = await supabase
      .from("videos")
      .select("id")
      .eq("id", videoId)
      .maybeSingle();

    if (vErr) {
      return NextResponse.json({ error: vErr.message }, { status: 500 });
    }
    if (!video) {
      return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404 });
    }

    const { data: other, error: oErr } = await supabase
      .from("codes")
      .select("video_id")
      .eq("full_code", fullCode)
      .maybeSingle();

    if (oErr) {
      return NextResponse.json({ error: oErr.message }, { status: 500 });
    }
    if (other && other.video_id !== videoId) {
      return NextResponse.json(
        { error: "Ce code est déjà associé à une autre vidéo" },
        { status: 409 },
      );
    }

    const maxTs = 1200;

    const { error: delErr } = await supabase.from("codes").delete().eq("video_id", videoId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    const timestamps = spreadTimestamps(maxTs);
    const expiresSeconds = Math.max(...timestamps);

    const { error: insErr } = await supabase.from("codes").insert({
      video_id: videoId,
      full_code: fullCode,
      expires_at: new Date(Date.now() + expiresSeconds * 1000).toISOString(),
    });
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ code: fullCode });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

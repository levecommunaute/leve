import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";
import { normalizeAdminVideoCode } from "../../../../lib/admin-video-code";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.from("codes").select("video_id, full_code");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const codes: Record<string, string> = {};
    for (const row of data ?? []) {
      if (typeof row.video_id === "string" && typeof row.full_code === "string") {
        codes[row.video_id] = row.full_code;
      }
    }

    return NextResponse.json({ codes });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const videoId = url.searchParams.get("video_id")?.trim() ?? "";

  if (!videoId) {
    return NextResponse.json({ error: "video_id requis" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();

    const { data: video, error: vErr } = await supabase.from("videos").select("id").eq("id", videoId).maybeSingle();

    if (vErr) {
      return NextResponse.json({ error: vErr.message }, { status: 500 });
    }
    if (!video) {
      return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404 });
    }

    const { error: subErr } = await supabase.from("code_submissions").delete().eq("video_id", videoId);
    if (subErr) {
      return NextResponse.json({ error: subErr.message }, { status: 500 });
    }

    const { error: codeErr } = await supabase.from("codes").delete().eq("video_id", videoId);
    if (codeErr) {
      return NextResponse.json({ error: codeErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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

    const { data: existingForVideo, error: existingErr } = await supabase
      .from("codes")
      .select("video_id")
      .eq("video_id", videoId)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }
    if (existingForVideo) {
      return NextResponse.json({ error: "Cette vidéo a déjà un code associé." }, { status: 409 });
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

    const { error: insErr } = await supabase.from("codes").insert({
      video_id: videoId,
      full_code: fullCode,
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

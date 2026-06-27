import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import { getFeatureFlag } from "../../../../lib/feature-flags";

export const dynamic = "force-dynamic";

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/-/g, "");
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const submitted_code =
    typeof body.submitted_code === "string"
      ? body.submitted_code
      : typeof body.code === "string"
        ? body.code
        : "";
  let video_id = typeof body.video_id === "string" ? body.video_id.trim() : "";

  if (!submitted_code) {
    return NextResponse.json({ success: false, error: "Champs manquants" }, { status: 400 });
  }

  const token =
    request.headers.get("authorization")?.replace("Bearer ", "") ||
    (typeof body.token === "string" ? body.token : "");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ success: false, error: "Configuration serveur manquante" }, { status: 503 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
  } = await authClient.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ success: false, error: "Non authentifie" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const normalized = normalizeCode(submitted_code);

  if (!video_id) {
    const { data: allCodes } = await supabase.from("codes").select("full_code, video_id");
    const match = (allCodes ?? []).find((c) => normalizeCode(c.full_code) === normalized);
    if (!match?.video_id) {
      return NextResponse.json({ success: false, message: "Code incorrect" });
    }
    video_id = match.video_id;
  } else {
    const { data: codeData } = await supabase
      .from("codes")
      .select("full_code")
      .eq("video_id", video_id)
      .maybeSingle();
    if (!codeData || normalizeCode(codeData.full_code) !== normalized) {
      return NextResponse.json({ success: false, message: "Code incorrect" });
    }
  }

  const youtubeMode = await getFeatureFlag("videos-mode-youtube");
  if (!youtubeMode) {
    const verification60 = await getFeatureFlag("verification-60-pct");
    if (verification60) {
      const { data: progress } = await supabase
        .from("video_progress")
        .select("max_progress")
        .eq("membre_id", user.id)
        .eq("video_id", video_id)
        .maybeSingle();

      const maxProgress = Number(progress?.max_progress) || 0;
      if (maxProgress < 60) {
        const { data: blockedVideo } = await supabase
          .from("videos")
          .select("youtube_id")
          .eq("id", video_id)
          .maybeSingle();

        return NextResponse.json({
          success: false,
          message: "Regarde d'abord la vidéo pour débloquer le code",
          video_id,
          youtube_id: blockedVideo?.youtube_id ?? "",
        });
      }
    }
  }

  const { data: vid } = await supabase
    .from("videos")
    .select("points_value, title, youtube_id")
    .eq("id", video_id)
    .single();
  const points = vid?.points_value || 15;

  await supabase.from("code_submissions").insert({
    membre_id: user.id,
    video_id,
    submitted_code,
    is_correct: true,
    points_awarded: points,
  });

  return NextResponse.json({
    success: true,
    points_awarded: points,
    video_id,
    youtube_id: vid?.youtube_id ?? "",
  });
}

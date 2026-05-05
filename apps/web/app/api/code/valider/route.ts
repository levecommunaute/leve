import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

function normalizeSubmittedCode(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== 12) return "";
  return `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}`;
}

async function alreadySubmittedCode(
  svc: ReturnType<typeof getServiceSupabase>,
  userId: string,
  videoId: string,
): Promise<boolean> {
  const tx = await svc
    .from("points_transactions")
    .select("id, metadata")
    .eq("user_id", userId)
    .in("type", ["code", "video_code", "code_secret"]);

  if (!tx.error && tx.data?.length) {
    for (const row of tx.data) {
      const m = row.metadata as Record<string, unknown> | null;
      const vid = typeof m?.video_id === "string" ? m.video_id : "";
      if (vid === videoId) return true;
    }
  }

  const legacy = await svc
    .from("code_submissions")
    .select("id")
    .eq("user_id", userId)
    .eq("video_id", videoId)
    .maybeSingle();

  if (!legacy.error && legacy.data?.id) return true;

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
    submitted_code?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const videoId = typeof body.video_id === "string" ? body.video_id.trim() : "";
  const submitted =
    typeof body.submitted_code === "string" ? body.submitted_code.trim() : "";

  if (!videoId || !submitted) {
    return NextResponse.json(
      { success: false, error: "video_id et submitted_code requis" },
      { status: 400 },
    );
  }

  const normalized = normalizeSubmittedCode(submitted);
  if (!normalized) {
    return NextResponse.json(
      { success: false, error: "incorrect", message: "Format : XXXX-XXXX-XXXX" },
      { status: 400 },
    );
  }

  try {
    const svc = getServiceSupabase();

    if (await alreadySubmittedCode(svc, user.id, videoId)) {
      return NextResponse.json({
        success: false,
        already_submitted: true,
        message: "Tu as déjà soumis ce code",
      });
    }

    const [{ data: video, error: vErr }, codesRes] = await Promise.all([
      svc.from("videos").select("id, title, points_value").eq("id", videoId).maybeSingle(),
      svc
        .from("video_codes")
        .select("fragment_code, timestamp_seconds")
        .eq("video_id", videoId)
        .order("timestamp_seconds", { ascending: true }),
    ]);

    if (vErr) {
      return NextResponse.json({ error: vErr.message }, { status: 500 });
    }
    if (!video) {
      return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404 });
    }

    const codesError = codesRes.error;
    const fragments = codesRes.data ?? [];
    if (codesError) {
      return NextResponse.json({ error: codesError.message }, { status: 500 });
    }

    if (fragments.length < 3) {
      return NextResponse.json(
        { success: false, error: "incorrect", message: "Code incorrect, regarde bien la vidéo" },
        { status: 200 },
      );
    }

    const expected = fragments
      .map((row) =>
        typeof row.fragment_code === "string" ? row.fragment_code.toUpperCase() : "",
      )
      .join("-");

    if (normalized !== expected) {
      return NextResponse.json({
        success: false,
        error: "incorrect",
        message: "Code incorrect, regarde bien la vidéo",
      });
    }

    const basePts = Number(video.points_value ?? 0);
    const { data: profile, error: pErr } = await svc
      .from("profiles")
      .select("multiplier")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    const mult = Number(profile?.multiplier ?? 1);
    const pointsEarned = Math.max(0, Math.round(basePts * (Number.isFinite(mult) ? mult : 1)));

    await svc.from("points_transactions").insert({
      user_id: user.id,
      amount: pointsEarned,
      type: "code",
      metadata: {
        video_id: videoId,
        video_title: video.title ?? null,
      },
    });

    const submissionIns = await svc.from("code_submissions").insert({
      user_id: user.id,
      video_id: videoId,
      submitted_code: normalized,
    });
    if (submissionIns.error) {
      console.warn("[api/code/valider] code_submissions:", submissionIns.error.message);
    }

    return NextResponse.json({
      success: true,
      valid: true,
      points_earned: pointsEarned,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

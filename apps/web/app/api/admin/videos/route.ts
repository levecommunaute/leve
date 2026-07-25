import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";
import { isCollaborateurMemberType } from "../../../../lib/pcol";

export const dynamic = "force-dynamic";

const ALLOWED_POINTS = new Set([15, 25, 30]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VIDEO_SELECT =
  "id, youtube_id, title, points_value, bonus_expire_at, collaborateur_id, is_active";

function parseCollaborateurId(raw: unknown): string | null | "invalid" {
  if (raw === null) return null;
  if (typeof raw !== "string") return "invalid";
  const t = raw.trim();
  if (!t) return null;
  if (!UUID_RE.test(t)) return "invalid";
  return t;
}

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
    const bonusExpireAt = new Date(
      Date.now() + 72 * 60 * 60 * 1000,
    ).toISOString();
    const { data, error } = await supabase
      .from("videos")
      .insert({
        youtube_id: youtubeId,
        title,
        points_value: pointsValue,
        description: "",
        bonus_expire_at: bonusExpireAt,
        is_active: true,
      })
      .select(VIDEO_SELECT)
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

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: { id?: string; collaborateur_id?: unknown; is_active?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  const hasIsActive = "is_active" in body;
  const hasCollaborateur = "collaborateur_id" in body;
  if (!hasIsActive && !hasCollaborateur) {
    return NextResponse.json(
      { error: "is_active ou collaborateur_id requis" },
      { status: 400 },
    );
  }

  const updates: {
    is_active?: boolean;
    collaborateur_id?: string | null;
  } = {};

  if (hasIsActive) {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "is_active doit être un booléen" }, { status: 400 });
    }
    updates.is_active = body.is_active;
  }

  if (hasCollaborateur) {
    const collaborateurId = parseCollaborateurId(body.collaborateur_id);
    if (collaborateurId === "invalid") {
      return NextResponse.json({ error: "collaborateur_id invalide" }, { status: 400 });
    }
    updates.collaborateur_id = collaborateurId;
  }

  try {
    const supabase = getServiceSupabase();

    if (updates.collaborateur_id) {
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("id, member_type")
        .eq("id", updates.collaborateur_id)
        .maybeSingle();

      if (profileErr) {
        return NextResponse.json({ error: profileErr.message }, { status: 500 });
      }
      if (!profile || !isCollaborateurMemberType(profile.member_type)) {
        return NextResponse.json(
          { error: "Le membre sélectionné n'est pas un collaborateur" },
          { status: 400 },
        );
      }
    }

    const { data, error } = await supabase
      .from("videos")
      .update(updates)
      .eq("id", id)
      .select(VIDEO_SELECT)
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

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();

    const { data: video, error: vErr } = await supabase
      .from("videos")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (vErr) {
      return NextResponse.json({ error: vErr.message }, { status: 500 });
    }
    if (!video) {
      return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404 });
    }

    const relatedDeletes: Array<{ table: string; run: () => PromiseLike<{ error: { message: string } | null }> }> = [
      { table: "quiz_submissions", run: () => supabase.from("quiz_submissions").delete().eq("video_id", id) },
      { table: "code_submissions", run: () => supabase.from("code_submissions").delete().eq("video_id", id) },
      { table: "quiz_questions", run: () => supabase.from("quiz_questions").delete().eq("video_id", id) },
      { table: "codes", run: () => supabase.from("codes").delete().eq("video_id", id) },
    ];

    for (const step of relatedDeletes) {
      const { error } = await step.run();
      if (error) {
        return NextResponse.json(
          { error: `${step.table}: ${error.message}` },
          { status: 500 },
        );
      }
    }

    const { error: videoErr } = await supabase.from("videos").delete().eq("id", id);
    if (videoErr) {
      return NextResponse.json({ error: videoErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

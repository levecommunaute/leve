import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";
import { isCollaborateurMemberType } from "../../../../lib/pcol";

export const dynamic = "force-dynamic";

const ALLOWED_POINTS = new Set([15, 25, 30]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: { id?: string; collaborateur_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }
  if (!("collaborateur_id" in body)) {
    return NextResponse.json({ error: "collaborateur_id requis" }, { status: 400 });
  }

  const collaborateurId = parseCollaborateurId(body.collaborateur_id);
  if (collaborateurId === "invalid") {
    return NextResponse.json({ error: "collaborateur_id invalide" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();

    if (collaborateurId) {
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("id, member_type")
        .eq("id", collaborateurId)
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
      .update({ collaborateur_id: collaborateurId })
      .eq("id", id)
      .select("id, youtube_id, title, points_value, collaborateur_id")
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

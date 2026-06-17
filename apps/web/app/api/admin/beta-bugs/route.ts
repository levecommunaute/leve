import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const SELECT_COLUMNS = "id, membre_id, page, description, severite, statut, created_at";

const STATUTS_VALIDES = ["ouvert", "en_cours", "resolu", "ferme"] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("beta_bugs")
      .select(SELECT_COLUMNS)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bugs: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  const statut = typeof body.statut === "string" ? body.statut.trim() : "";
  if (!STATUTS_VALIDES.includes(statut as (typeof STATUTS_VALIDES)[number])) {
    return NextResponse.json(
      { error: `statut invalide (attendu : ${STATUTS_VALIDES.join(", ")})` },
      { status: 400 },
    );
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("beta_bugs")
      .update({ statut })
      .eq("id", id)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Bug introuvable" }, { status: 404 });
    }

    return NextResponse.json({ bug: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

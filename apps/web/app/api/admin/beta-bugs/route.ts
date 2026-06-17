import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const STATUTS = ["ouvert", "en_cours", "resolu", "ferme"] as const;
type Statut = (typeof STATUTS)[number];

function isStatut(value: unknown): value is Statut {
  return typeof value === "string" && (STATUTS as readonly string[]).includes(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("beta_bugs")
      .select("id, membre_id, page, description, severite, statut, created_at")
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

  const id =
    typeof body.id === "string" && UUID_RE.test(body.id.trim()) ? body.id.trim() : null;
  if (!id) {
    return NextResponse.json({ error: "Identifiant de bug invalide" }, { status: 400 });
  }
  if (!isStatut(body.statut)) {
    return NextResponse.json(
      { error: `Statut invalide (attendu : ${STATUTS.join(", ")})` },
      { status: 400 },
    );
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("beta_bugs")
      .update({ statut: body.statut })
      .eq("id", id)
      .select("id, membre_id, page, description, severite, statut, created_at")
      .single();

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

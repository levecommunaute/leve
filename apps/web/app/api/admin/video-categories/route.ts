import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const SELECT_COLUMNS = "id, nom, slug";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("video_categories")
      .select(SELECT_COLUMNS)
      .order("ordre", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ categories: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: {
    nom?: string;
    slug?: string;
    couleur?: string;
    ordre?: number;
    is_gate?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const nom = typeof body.nom === "string" ? body.nom.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const couleur = typeof body.couleur === "string" ? body.couleur.trim() : "#888780";
  const ordre = Number.isFinite(Number(body.ordre)) ? Number(body.ordre) : 0;
  const isGate = body.is_gate === true;

  if (!nom || !slug) {
    return NextResponse.json({ error: "nom et slug requis" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("video_categories").insert({
      nom,
      slug,
      couleur,
      ordre,
      is_gate: isGate,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

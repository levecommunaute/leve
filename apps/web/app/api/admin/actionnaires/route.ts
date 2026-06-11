import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const SELECT_COLUMNS =
  "id, siege, nom, categorie, nb_actions, pourcentage, role, actif, locked, created_at, updated_at";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("actionnaires")
      .select(SELECT_COLUMNS)
      .order("siege", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ actionnaires: data ?? [] });
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

  const updates: Record<string, unknown> = {};

  if (body.nom !== undefined) {
    if (typeof body.nom !== "string" || !body.nom.trim()) {
      return NextResponse.json({ error: "nom invalide" }, { status: 400 });
    }
    updates.nom = body.nom.trim();
  }

  if (body.categorie !== undefined) {
    if (typeof body.categorie !== "string" || !body.categorie.trim()) {
      return NextResponse.json({ error: "categorie invalide" }, { status: 400 });
    }
    updates.categorie = body.categorie.trim();
  }

  if (body.nb_actions !== undefined) {
    const n =
      typeof body.nb_actions === "number"
        ? body.nb_actions
        : Number(String(body.nb_actions).trim());
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "nb_actions invalide (entier ≥ 0)" }, { status: 400 });
    }
    updates.nb_actions = n;
  }

  if (body.pourcentage !== undefined) {
    const n =
      typeof body.pourcentage === "number"
        ? body.pourcentage
        : Number(String(body.pourcentage).trim().replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return NextResponse.json({ error: "pourcentage invalide (0–100)" }, { status: 400 });
    }
    updates.pourcentage = Math.round(n * 1000) / 1000;
  }

  if (body.role !== undefined) {
    if (body.role !== null && typeof body.role !== "string") {
      return NextResponse.json({ error: "role invalide" }, { status: 400 });
    }
    updates.role = body.role === null ? null : (body.role as string).trim() || null;
  }

  if (body.actif !== undefined) {
    if (typeof body.actif !== "boolean") {
      return NextResponse.json({ error: "actif (boolean) requis" }, { status: 400 });
    }
    updates.actif = body.actif;
  }

  let lockedUpdate: boolean | undefined;
  if (body.locked !== undefined) {
    if (typeof body.locked !== "boolean") {
      return NextResponse.json({ error: "locked (boolean) requis" }, { status: 400 });
    }
    lockedUpdate = body.locked;
  }

  if (Object.keys(updates).length === 0 && lockedUpdate === undefined) {
    return NextResponse.json({ error: "Aucun champ à modifier" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();

    const { data: current, error: currentError } = await supabase
      .from("actionnaires")
      .select("id, locked")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      return NextResponse.json({ error: currentError.message }, { status: 500 });
    }
    if (!current) {
      return NextResponse.json({ error: "Actionnaire introuvable" }, { status: 404 });
    }

    // Champs modifiables uniquement si non verrouillé ; le toggle locked reste permis
    if (current.locked && Object.keys(updates).length > 0) {
      return NextResponse.json(
        { error: "Actionnaire verrouillé (locked = true)" },
        { status: 423 },
      );
    }

    if (lockedUpdate !== undefined) {
      updates.locked = lockedUpdate;
    }

    const { data, error } = await supabase
      .from("actionnaires")
      .update(updates)
      .eq("id", id)
      .select(SELECT_COLUMNS)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Échec de la mise à jour" },
        { status: 500 },
      );
    }

    return NextResponse.json({ actionnaire: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

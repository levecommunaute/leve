import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const SELECT_COLUMNS =
  "id, artiste_nom, artiste_pays, categorie, type_concours, actif, total_votes_pts";

const CONCOURS_CATEGORIES = ["musique", "art_visuel", "poesie", "micro_doc"] as const;
const CONCOURS_TYPES = ["international", "haiti_culture"] as const;

type ConcoursCategorie = (typeof CONCOURS_CATEGORIES)[number];
type ConcoursType = (typeof CONCOURS_TYPES)[number];

function isConcoursCategorie(value: string): value is ConcoursCategorie {
  return (CONCOURS_CATEGORIES as readonly string[]).includes(value);
}

function isConcoursType(value: string): value is ConcoursType {
  return (CONCOURS_TYPES as readonly string[]).includes(value);
}

function readNom(body: Record<string, unknown>): string {
  if (typeof body.artiste_nom === "string" && body.artiste_nom.trim()) {
    return body.artiste_nom.trim();
  }
  if (typeof body.nom === "string" && body.nom.trim()) {
    return body.nom.trim();
  }
  return "";
}

function readPays(body: Record<string, unknown>): string {
  if (typeof body.artiste_pays === "string" && body.artiste_pays.trim()) {
    return body.artiste_pays.trim();
  }
  if (typeof body.pays === "string" && body.pays.trim()) {
    return body.pays.trim();
  }
  return "";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("concours_artistes")
      .select(SELECT_COLUMNS)
      .order("artiste_nom", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ artistes: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const artiste_nom = readNom(body);
  if (!artiste_nom) {
    return NextResponse.json({ error: "Nom de l'artiste requis" }, { status: 400 });
  }

  const artiste_pays = readPays(body);
  if (!artiste_pays) {
    return NextResponse.json({ error: "Pays requis" }, { status: 400 });
  }

  const categorieRaw = typeof body.categorie === "string" ? body.categorie.trim() : "";
  if (!isConcoursCategorie(categorieRaw)) {
    return NextResponse.json(
      { error: "Catégorie invalide (musique, art_visuel, poesie, micro_doc)" },
      { status: 400 },
    );
  }

  const typeRaw = typeof body.type_concours === "string" ? body.type_concours.trim() : "";
  if (!isConcoursType(typeRaw)) {
    return NextResponse.json(
      { error: "Type concours invalide (international, haiti_culture)" },
      { status: 400 },
    );
  }

  const actif = typeof body.actif === "boolean" ? body.actif : true;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("concours_artistes")
      .insert({
        artiste_nom,
        artiste_pays,
        categorie: categorieRaw,
        type_concours: typeRaw,
        actif,
        total_votes_pts: 0,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ artiste: data });
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

  const patch: Record<string, unknown> = {};

  if (body.actif !== undefined) {
    if (typeof body.actif !== "boolean") {
      return NextResponse.json({ error: "actif doit être un booléen" }, { status: 400 });
    }
    patch.actif = body.actif;
  }

  if (body.nom !== undefined || body.artiste_nom !== undefined) {
    const artiste_nom = readNom(body);
    if (!artiste_nom) {
      return NextResponse.json({ error: "Nom invalide" }, { status: 400 });
    }
    patch.artiste_nom = artiste_nom;
  }

  if (body.pays !== undefined || body.artiste_pays !== undefined) {
    const artiste_pays = readPays(body);
    if (!artiste_pays) {
      return NextResponse.json({ error: "Pays invalide" }, { status: 400 });
    }
    patch.artiste_pays = artiste_pays;
  }

  if (body.categorie !== undefined) {
    const categorieRaw = typeof body.categorie === "string" ? body.categorie.trim() : "";
    if (!isConcoursCategorie(categorieRaw)) {
      return NextResponse.json({ error: "Catégorie invalide" }, { status: 400 });
    }
    patch.categorie = categorieRaw;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Aucun champ à modifier (actif, nom, pays, categorie)" },
      { status: 400 },
    );
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("concours_artistes")
      .update(patch)
      .eq("id", id)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Artiste introuvable" }, { status: 404 });
    }

    return NextResponse.json({ artiste: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("concours_artistes").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

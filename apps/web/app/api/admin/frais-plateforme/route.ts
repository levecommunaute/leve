import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";
import { getAllFraisPlateformePaliers } from "../../../../lib/frais-plateforme";

export const dynamic = "force-dynamic";

type PatchPalierInput = {
  id?: unknown;
  montant_min?: unknown;
  montant_max?: unknown;
  pourcentage?: unknown;
  actif?: unknown;
};

function parseAmount(raw: unknown, field: string): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: false, error: `${field} requis` };
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: `${field} invalide` };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

function parseOptionalMax(raw: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "montant_max invalide" };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

function parsePourcentage(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: false, error: "pourcentage requis" };
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return { ok: false, error: "pourcentage invalide (0–100)" };
  }
  return { ok: true, value: Math.round(n * 1000) / 1000 };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const paliers = await getAllFraisPlateformePaliers();
    return NextResponse.json({ paliers });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: { paliers?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  if (!Array.isArray(body.paliers)) {
    return NextResponse.json({ error: "paliers (array) requis" }, { status: 400 });
  }

  const updates: Array<{
    id: string;
    montant_min: number;
    montant_max: number | null;
    pourcentage: number;
    actif: boolean;
  }> = [];

  for (const item of body.paliers as PatchPalierInput[]) {
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "id requis pour chaque palier" }, { status: 400 });
    }

    const minParsed = parseAmount(item.montant_min, "montant_min");
    if (!minParsed.ok) return NextResponse.json({ error: minParsed.error }, { status: 400 });

    const maxParsed = parseOptionalMax(item.montant_max);
    if (!maxParsed.ok) return NextResponse.json({ error: maxParsed.error }, { status: 400 });

    if (maxParsed.value != null && maxParsed.value < minParsed.value) {
      return NextResponse.json(
        { error: "montant_max doit être supérieur ou égal à montant_min" },
        { status: 400 },
      );
    }

    const pctParsed = parsePourcentage(item.pourcentage);
    if (!pctParsed.ok) return NextResponse.json({ error: pctParsed.error }, { status: 400 });

    if (typeof item.actif !== "boolean") {
      return NextResponse.json({ error: "actif (boolean) requis pour chaque palier" }, { status: 400 });
    }

    updates.push({
      id,
      montant_min: minParsed.value,
      montant_max: maxParsed.value,
      pourcentage: pctParsed.value,
      actif: item.actif,
    });
  }

  try {
    const supabase = getServiceSupabase();
    let updatedCount = 0;

    for (const u of updates) {
      const { data, error } = await supabase
        .from("frais_plateforme_config")
        .update({
          montant_min: u.montant_min,
          montant_max: u.montant_max,
          pourcentage: u.pourcentage,
          actif: u.actif,
        })
        .eq("id", u.id)
        .select("id")
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ error: `Palier introuvable: ${u.id}` }, { status: 404 });
      }
      updatedCount += 1;
    }

    const paliers = await getAllFraisPlateformePaliers();
    return NextResponse.json({ paliers, updated_count: updatedCount });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

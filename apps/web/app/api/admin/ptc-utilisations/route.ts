import { type NextRequest, NextResponse } from "next/server";
import { requireAdminSecret } from "../../../../lib/admin-server";
import {
  getAllPtcUtilisationsConfig,
  isPtcUtilisationCategorie,
  updatePtcUtilisationConfig,
} from "../../../../lib/ptc-utilisations-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const config = await getAllPtcUtilisationsConfig();
    return NextResponse.json({ config });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: { categorie?: unknown; actif?: unknown; budget_alloue?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const categorie = typeof body.categorie === "string" ? body.categorie.trim() : "";
  if (!categorie || !isPtcUtilisationCategorie(categorie)) {
    return NextResponse.json({ error: "categorie invalide" }, { status: 400 });
  }

  const hasActif = body.actif !== undefined;
  const hasBudget = body.budget_alloue !== undefined;
  if (!hasActif && !hasBudget) {
    return NextResponse.json(
      { error: "actif ou budget_alloue requis" },
      { status: 400 },
    );
  }

  if (hasActif && typeof body.actif !== "boolean") {
    return NextResponse.json({ error: "actif (boolean) requis" }, { status: 400 });
  }

  let budgetAlloue: number | undefined;
  if (hasBudget) {
    const n =
      typeof body.budget_alloue === "number"
        ? body.budget_alloue
        : Number(String(body.budget_alloue).trim());
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: "budget_alloue invalide (nombre ≥ 0)" },
        { status: 400 },
      );
    }
    budgetAlloue = Math.round(n * 100) / 100;
  }

  try {
    const row = await updatePtcUtilisationConfig(categorie, {
      ...(hasActif ? { actif: body.actif as boolean } : {}),
      ...(budgetAlloue !== undefined ? { budget_alloue: budgetAlloue } : {}),
    });
    return NextResponse.json({ config: row });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message === "Catégorie PTC introuvable" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

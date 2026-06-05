import { type NextRequest, NextResponse } from "next/server";
import { requireAdminSecret } from "../../../../lib/admin-server";
import {
  getAllReseauxSociaux,
  isReseauSocialKey,
  updateReseauSocial,
} from "../../../../lib/reseaux-sociaux";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const reseaux = await getAllReseauxSociaux();
    return NextResponse.json({ reseaux });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: { reseau?: unknown; abonnes?: unknown; actif?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const reseau = typeof body.reseau === "string" ? body.reseau.trim() : "";
  if (!reseau || !isReseauSocialKey(reseau)) {
    return NextResponse.json({ error: "reseau invalide" }, { status: 400 });
  }

  const hasAbonnes = body.abonnes !== undefined;
  const hasActif = body.actif !== undefined;
  if (!hasAbonnes && !hasActif) {
    return NextResponse.json(
      { error: "abonnes ou actif requis" },
      { status: 400 },
    );
  }

  if (hasActif && typeof body.actif !== "boolean") {
    return NextResponse.json({ error: "actif (boolean) requis" }, { status: 400 });
  }

  let abonnes: number | undefined;
  if (hasAbonnes) {
    const n =
      typeof body.abonnes === "number"
        ? body.abonnes
        : Number(String(body.abonnes).trim());
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return NextResponse.json({ error: "abonnes invalide (entier ≥ 0)" }, { status: 400 });
    }
    abonnes = n;
  }

  try {
    const row = await updateReseauSocial(reseau, {
      ...(abonnes !== undefined ? { abonnes } : {}),
      ...(hasActif ? { actif: body.actif as boolean } : {}),
    });
    return NextResponse.json({ reseau: row });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message === "Réseau introuvable" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

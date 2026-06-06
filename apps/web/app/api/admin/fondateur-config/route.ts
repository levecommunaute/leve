import { type NextRequest, NextResponse } from "next/server";
import { requireAdminSecret } from "../../../../lib/admin-server";
import {
  getFondateurConfig,
  updateFondateurConfig,
} from "../../../../lib/fondateur-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const config = await getFondateurConfig();
    return NextResponse.json({ config });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: { actif?: unknown; membres_actuels?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const hasActif = body.actif !== undefined;
  const hasMembresActuels = body.membres_actuels !== undefined;
  const hasMessage = body.message !== undefined;

  if (!hasActif && !hasMembresActuels && !hasMessage) {
    return NextResponse.json(
      { error: "actif, membres_actuels ou message requis" },
      { status: 400 },
    );
  }

  if (hasActif && typeof body.actif !== "boolean") {
    return NextResponse.json({ error: "actif (boolean) requis" }, { status: 400 });
  }

  let membresActuels: number | undefined;
  if (hasMembresActuels) {
    const n =
      typeof body.membres_actuels === "number"
        ? body.membres_actuels
        : Number(String(body.membres_actuels).trim());
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return NextResponse.json(
        { error: "membres_actuels invalide (entier ≥ 0)" },
        { status: 400 },
      );
    }
    membresActuels = n;
  }

  let message: string | undefined;
  if (hasMessage) {
    if (typeof body.message !== "string") {
      return NextResponse.json({ error: "message (texte) requis" }, { status: 400 });
    }
    message = body.message;
  }

  try {
    const config = await updateFondateurConfig({
      ...(hasActif ? { actif: body.actif as boolean } : {}),
      ...(membresActuels !== undefined ? { membres_actuels: membresActuels } : {}),
      ...(message !== undefined ? { message } : {}),
    });
    return NextResponse.json({ config });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message === "Configuration fondateur introuvable" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";
import { getActionsConfig } from "../../../../lib/actions-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const config = await getActionsConfig();
    return NextResponse.json({ config });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message === "Configuration actions introuvable" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: {
    total_actions_a?: unknown;
    total_actions_b?: unknown;
    total_actions_c?: unknown;
    valeur_fondation?: unknown;
    multiple_valorisation?: unknown;
    prix_action_c_phase?: unknown;
    locked?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  for (const field of ["total_actions_a", "total_actions_b", "total_actions_c"] as const) {
    const raw = body[field];
    if (raw === undefined) continue;
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json(
        { error: `${field} invalide (entier ≥ 0)` },
        { status: 400 },
      );
    }
    updates[field] = n;
  }

  if (body.valeur_fondation !== undefined) {
    const n =
      typeof body.valeur_fondation === "number"
        ? body.valeur_fondation
        : Number(String(body.valeur_fondation).trim().replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: "valeur_fondation invalide (nombre ≥ 0)" },
        { status: 400 },
      );
    }
    updates.valeur_fondation = Math.round(n * 100) / 100;
  }

  if (body.multiple_valorisation !== undefined) {
    const n =
      typeof body.multiple_valorisation === "number"
        ? body.multiple_valorisation
        : Number(String(body.multiple_valorisation).trim().replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json(
        { error: "multiple_valorisation invalide (nombre > 0)" },
        { status: 400 },
      );
    }
    updates.multiple_valorisation = Math.round(n * 100) / 100;
  }

  if (body.prix_action_c_phase !== undefined) {
    const n =
      typeof body.prix_action_c_phase === "number"
        ? body.prix_action_c_phase
        : Number(String(body.prix_action_c_phase).trim().replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: "prix_action_c_phase invalide (nombre ≥ 0)" },
        { status: 400 },
      );
    }
    updates.prix_action_c_phase = Math.round(n * 100) / 100;
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
    const current = await getActionsConfig();

    // Champs modifiables uniquement si non verrouillé ; le toggle locked reste permis
    if (current.locked && Object.keys(updates).length > 0) {
      return NextResponse.json(
        { error: "Configuration verrouillée (locked = true)" },
        { status: 423 },
      );
    }

    if (lockedUpdate !== undefined) {
      updates.locked = lockedUpdate;
    }

    const { error } = await supabase
      .from("actions_config")
      .update(updates)
      .eq("id", current.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const config = await getActionsConfig();
    return NextResponse.json({ config });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message === "Configuration actions introuvable" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

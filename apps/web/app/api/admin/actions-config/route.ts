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
    multiple_valorisation?: unknown;
    total_actions?: unknown;
    escompte_phase1?: unknown;
    locked?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

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

  if (body.total_actions !== undefined) {
    const n =
      typeof body.total_actions === "number"
        ? body.total_actions
        : Number(String(body.total_actions).trim());
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json(
        { error: "total_actions invalide (entier > 0)" },
        { status: 400 },
      );
    }
    updates.total_actions = n;
  }

  if (body.escompte_phase1 !== undefined) {
    const n =
      typeof body.escompte_phase1 === "number"
        ? body.escompte_phase1
        : Number(String(body.escompte_phase1).trim().replace(",", "."));
    if (!Number.isFinite(n) || n <= 0 || n > 1) {
      return NextResponse.json(
        { error: "escompte_phase1 invalide (entre 0 et 1)" },
        { status: 400 },
      );
    }
    updates.escompte_phase1 = Math.round(n * 10000) / 10000;
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

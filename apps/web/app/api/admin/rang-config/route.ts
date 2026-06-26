import { type NextRequest, NextResponse } from "next/server";
import { requireAdminSecret } from "../../../../lib/admin-server";
import { getRangConfig, updateRangConfig } from "../../../../lib/rang-config";

export const dynamic = "force-dynamic";

function parseNonNegativeNumber(raw: unknown, field: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${field} invalide (nombre ≥ 0)`);
  }
  return n;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const config = await getRangConfig();
    return NextResponse.json({ config });
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

  const fields = [
    "seuil_bronze",
    "seuil_argent",
    "seuil_or",
    "seuil_diamant",
    "bonus_bronze",
    "bonus_argent",
    "bonus_or",
    "bonus_diamant",
  ] as const;

  const patch: Partial<Record<(typeof fields)[number], number>> = {};
  try {
    for (const field of fields) {
      const value = parseNonNegativeNumber(body[field], field);
      if (value !== undefined) patch[field] = value;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Au moins un champ seuil_* ou bonus_* requis" },
      { status: 400 },
    );
  }

  try {
    const config = await updateRangConfig(patch);
    return NextResponse.json({ config });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status =
      message === "Configuration rang introuvable" ||
      message.startsWith("Seuils incohérents") ||
      message.includes("invalide")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

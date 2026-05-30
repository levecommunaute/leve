import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";
import {
  getTransparenceConfig,
  type TransparencePoolKey,
} from "../../../../lib/transparence-config";

export const dynamic = "force-dynamic";

const VALID_KEYS: TransparencePoolKey[] = [
  "pmq",
  "production",
  "fondation",
  "operations",
  "ptc",
  "pcol",
  "pa",
  "frais_plateforme",
  "taxe_pa",
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const pools = await getTransparenceConfig();
    return NextResponse.json({ pools });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: { pool_key?: string; visible?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const poolKey = typeof body.pool_key === "string" ? body.pool_key.trim() : "";
  if (!poolKey || !VALID_KEYS.includes(poolKey as TransparencePoolKey)) {
    return NextResponse.json({ error: "pool_key invalide" }, { status: 400 });
  }
  if (typeof body.visible !== "boolean") {
    return NextResponse.json({ error: "visible (boolean) requis" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("transparence_config")
      .update({ visible: body.visible })
      .eq("pool_key", poolKey)
      .select("pool_key, label, section, visible, ordre, updated_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Pool introuvable" }, { status: 404 });
    }

    return NextResponse.json({ pool: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

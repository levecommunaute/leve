import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  const svc = getServiceSupabase();
  const { data, error } = await svc
    .from("theme_config")
    .select("theme_id, name, enabled")
    .order("theme_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: { theme_id?: string; enabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const theme_id = typeof body.theme_id === "string" ? body.theme_id.trim() : "";
  if (!theme_id) {
    return NextResponse.json({ error: "theme_id requis" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) requis" }, { status: 400 });
  }
  if (theme_id === "A") {
    return NextResponse.json({ error: "Le thème A ne peut pas être désactivé" }, { status: 400 });
  }

  const svc = getServiceSupabase();
  const { error } = await svc
    .from("theme_config")
    .update({ enabled: body.enabled })
    .eq("theme_id", theme_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

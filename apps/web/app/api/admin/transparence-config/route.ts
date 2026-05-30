import { type NextRequest, NextResponse } from "next/server";
import { requireAdminSecret } from "../../../../lib/admin-server";
import {
  getTransparenceConfig,
  updateTransparenceVisibility,
} from "../../../../lib/transparence-config";

export const dynamic = "force-dynamic";

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

  let body: { cle?: string; visible?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const cle = typeof body.cle === "string" ? body.cle.trim() : "";
  if (!cle) {
    return NextResponse.json({ error: "cle requise" }, { status: 400 });
  }
  if (typeof body.visible !== "boolean") {
    return NextResponse.json({ error: "visible (boolean) requis" }, { status: 400 });
  }

  try {
    const pool = await updateTransparenceVisibility(cle, body.visible);
    return NextResponse.json({ pool });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message === "Pool introuvable" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";
import { activateEligibleParrainages } from "../../../../lib/parrainage";

export const dynamic = "force-dynamic";

async function runActivation(): Promise<NextResponse> {
  try {
    const svc = getServiceSupabase();
    const result = await activateEligibleParrainages(svc);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Cron / admin : active les parrainages éligibles (filleul actif 30 j+) et crédite le parrain. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;
  return runActivation();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;
  return runActivation();
}

import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const membreId = typeof body.membre_id === "string" ? body.membre_id.trim() : "";
  if (!membreId) {
    return NextResponse.json({ error: "membre_id requis" }, { status: 400 });
  }

  const ptsPa = Number(body.pts_pa);
  if (!Number.isInteger(ptsPa) || ptsPa < 1) {
    return NextResponse.json({ error: "pts_pa invalide (entier ≥ 1)" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("pa_transactions").insert({
      membre_id: membreId,
      type: "purchase",
      amount: ptsPa,
      description: "Bonus Beta Top 3",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

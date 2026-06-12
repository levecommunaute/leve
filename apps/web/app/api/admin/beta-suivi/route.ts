import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, numero_membre, display_name, email, beta_points, beta_temps_total_secondes, beta_derniere_activite",
      )
      .eq("is_beta_tester", true)
      .order("beta_points", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ testeurs: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

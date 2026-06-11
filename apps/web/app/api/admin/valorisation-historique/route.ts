import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("valorisation_historique")
      .select(
        "mois, total_brut, revenus_annualises, valeur_societe, valeur_action, pool_25, pool_dividendes, prix_action_c, created_at",
      )
      .order("mois", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const historique = (data ?? []).map((row) => ({
      mois: row.mois as string,
      total_brut: Number(row.total_brut),
      revenus_annualises: Number(row.revenus_annualises),
      valeur_societe: Number(row.valeur_societe),
      valeur_action: Number(row.valeur_action),
      pool_25: Number(row.pool_25),
      pool_dividendes: Number(row.pool_dividendes),
      prix_action_c: Number(row.prix_action_c),
      created_at: row.created_at as string,
    }));

    return NextResponse.json({ historique });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

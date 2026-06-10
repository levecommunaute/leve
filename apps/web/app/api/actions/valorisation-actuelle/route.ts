import { NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("valorisation_historique")
      .select("mois, valeur_societe, valeur_action, prix_action_c")
      .order("mois", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Aucune valorisation disponible" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      valeur_societe: Number(data.valeur_societe),
      valeur_action: Number(data.valeur_action),
      prix_action_c: Number(data.prix_action_c),
      mois: data.mois,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

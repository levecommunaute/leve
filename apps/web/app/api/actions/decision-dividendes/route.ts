import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const round2 = (n: number): number => Math.round(n * 100) / 100;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("dividendes_decisions")
      .select(
        "id, trimestre, montant_distribue, notes, created_at, distributions:dividendes_distributions(id, actionnaire_id, pourcentage, montant, actionnaire:actionnaires(nom))",
      )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ decisions: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: { trimestre?: unknown; montant_distribue?: unknown; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const trimestre = typeof body.trimestre === "string" ? body.trimestre.trim() : "";
  if (!/^\d{4}-T[1-4]$/.test(trimestre)) {
    return NextResponse.json(
      { error: "trimestre invalide (format YYYY-T1 à YYYY-T4)" },
      { status: 400 },
    );
  }

  const montantRaw = body.montant_distribue;
  const montant_distribue =
    typeof montantRaw === "number"
      ? montantRaw
      : Number(String(montantRaw ?? "").trim().replace(",", "."));
  if (!Number.isFinite(montant_distribue) || montant_distribue <= 0) {
    return NextResponse.json(
      { error: "montant_distribue invalide (nombre > 0)" },
      { status: 400 },
    );
  }

  const notes =
    body.notes === undefined || body.notes === null
      ? null
      : typeof body.notes === "string"
        ? body.notes
        : null;

  try {
    const supabase = getServiceSupabase();

    const { data: actionnaires, error: actionnairesError } = await supabase
      .from("actionnaires")
      .select("id, nom, pourcentage")
      .eq("actif", true);

    if (actionnairesError) {
      return NextResponse.json({ error: actionnairesError.message }, { status: 500 });
    }
    if (!actionnaires || actionnaires.length === 0) {
      return NextResponse.json(
        { error: "Aucun actionnaire actif" },
        { status: 400 },
      );
    }

    const { data: decision, error: decisionError } = await supabase
      .from("dividendes_decisions")
      .insert({
        trimestre,
        montant_distribue: round2(montant_distribue),
        notes,
      })
      .select("id, trimestre, montant_distribue, notes, created_at")
      .single();

    if (decisionError || !decision) {
      return NextResponse.json(
        { error: decisionError?.message ?? "Échec de création de la décision" },
        { status: 500 },
      );
    }

    const rows = actionnaires.map((a) => {
      const pourcentage = Number(a.pourcentage);
      return {
        decision_id: decision.id,
        actionnaire_id: a.id,
        pourcentage,
        montant: round2(montant_distribue * (pourcentage / 100)),
      };
    });

    const { data: distributions, error: distributionsError } = await supabase
      .from("dividendes_distributions")
      .insert(rows)
      .select("id, decision_id, actionnaire_id, pourcentage, montant, created_at");

    if (distributionsError) {
      return NextResponse.json({ error: distributionsError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, decision, distributions });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

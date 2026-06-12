import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";
import { getActionsConfig } from "../../../../lib/actions-config";

export const dynamic = "force-dynamic";

const REVENUE_FIELDS = [
  "rev_youtube_adsense",
  "rev_programmatique",
  "rev_partenaires",
  "rev_boutique",
  "rev_autres",
] as const;

const round2 = (n: number): number => Math.round(n * 100) / 100;

function parseMontant(raw: unknown, field: string): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: false, error: `${field} requis` };
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: `${field} invalide` };
  }
  return { ok: true, value: round2(n) };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const mois = typeof body.mois === "string" ? body.mois.trim() : "";
  if (!/^\d{4}-\d{2}$/.test(mois)) {
    return NextResponse.json({ error: "mois invalide (format YYYY-MM)" }, { status: 400 });
  }
  // La colonne mois est de type DATE : on normalise au premier jour du mois
  const moisDate = `${mois}-01`;

  const revenus: Record<string, number> = {};
  for (const field of REVENUE_FIELDS) {
    const parsed = parseMontant(body[field], field);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    revenus[field] = parsed.value;
  }

  const depensesParsed = parseMontant(body.depenses_operationnelles, "depenses_operationnelles");
  if (!depensesParsed.ok) {
    return NextResponse.json({ error: depensesParsed.error }, { status: 400 });
  }

  const total_brut = round2(REVENUE_FIELDS.reduce((sum, f) => sum + (revenus[f] ?? 0), 0));

  try {
    const supabase = getServiceSupabase();

    let config;
    try {
      config = await getActionsConfig();
      console.log("[valider-revenus] actions_config OK:", {
        multiple_valorisation: config.multiple_valorisation,
        total_actions_a: config.total_actions_a,
        total_actions_b: config.total_actions_b,
        total_actions_c: config.total_actions_c,
        prix_action_c_phase: config.prix_action_c_phase,
      });
    } catch (configError) {
      console.error("[valider-revenus] Erreur lecture actions_config:", configError);
      throw configError;
    }

    if (!Number.isFinite(config.multiple_valorisation) || config.multiple_valorisation <= 0) {
      console.error(
        "[valider-revenus] multiple_valorisation invalide:",
        config.multiple_valorisation,
      );
      return NextResponse.json(
        { error: "multiple_valorisation invalide dans actions_config" },
        { status: 500 },
      );
    }

    const { error: revenusError } = await supabase
      .from("revenus_mensuels_actions")
      .insert({
        mois: moisDate,
        ...revenus,
        depenses_operationnelles: depensesParsed.value,
        valide_par_admin: true,
      });

    if (revenusError) {
      if (revenusError.code === "23505") {
        return NextResponse.json(
          { error: `Revenus déjà validés pour le mois ${mois}` },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: revenusError.message }, { status: 500 });
    }

    const total_actions =
      config.total_actions_a + config.total_actions_b + config.total_actions_c;
    if (total_actions <= 0) {
      return NextResponse.json(
        { error: "Total d'actions invalide dans actions_config" },
        { status: 500 },
      );
    }

    const revenus_annualises = round2(total_brut * 12);
    const valeur_societe = round2(revenus_annualises * config.multiple_valorisation);
    const valeur_action = round2(valeur_societe / total_actions);
    const pool_25 = round2(total_brut * 0.25);
    const pool_dividendes = round2(pool_25 * 0.4);
    // Escompte Phase 1 : 25 % de la valeur de l'action.
    // actions_config.prix_action_c_phase n'indique que la phase (1, 2, 3...), pas un prix.
    const prix_action_c = round2(valeur_action * 0.25);

    const valorisation = {
      mois: moisDate,
      total_brut,
      revenus_annualises,
      valeur_societe,
      valeur_action,
      pool_25,
      pool_dividendes,
      prix_action_c,
    };

    console.log("[valider-revenus] Insertion valorisation_historique, payload:", valorisation);

    const { data: valorisationData, error: valorisationError } = await supabase
      .from("valorisation_historique")
      .insert(valorisation)
      .select();

    if (valorisationError) {
      console.error("[valider-revenus] Erreur insertion valorisation_historique:", {
        code: valorisationError.code,
        message: valorisationError.message,
        details: valorisationError.details,
        hint: valorisationError.hint,
      });
      return NextResponse.json({ error: valorisationError.message }, { status: 500 });
    }

    console.log("[valider-revenus] valorisation_historique insérée:", valorisationData);

    return NextResponse.json({ success: true, valorisation });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

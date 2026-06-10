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
    const config = await getActionsConfig();

    const { error: revenusError } = await supabase
      .from("revenus_mensuels_actions")
      .insert({
        mois,
        ...revenus,
        depenses_operationnelles: depensesParsed.value,
        total_brut,
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

    const revenus_annualises = round2(total_brut * 12);
    const valeur_societe = round2(revenus_annualises * config.multiple_valorisation);
    const valeur_action = round2(valeur_societe / config.total_actions);
    const pool_25 = round2(total_brut * 0.25);
    const pool_dividendes = round2(pool_25 * 0.4);
    const prix_action_c = round2(valeur_action * config.escompte_phase1);

    const valorisation = {
      mois,
      total_brut,
      revenus_annualises,
      multiple_valorisation: config.multiple_valorisation,
      valeur_societe,
      valeur_action,
      pool_25,
      pool_dividendes,
      prix_action_c,
    };

    const { error: valorisationError } = await supabase
      .from("valorisation_historique")
      .insert(valorisation);

    if (valorisationError) {
      return NextResponse.json({ error: valorisationError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, valorisation });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

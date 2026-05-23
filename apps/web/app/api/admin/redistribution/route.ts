import { type NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

/** Répartition mensuelle LEVE (100 % du revenu du mois). */
const PMQ_RATE = 0.45;
const PRODUCTION_RATE = 0.2;
const FONDATION_RATE = 0.1;
const OPERATIONS_RATE = 0.25;

const PAGE_SIZE = 1000;
const MOUVEMENT_BATCH_SIZE = 500;

/** "2026-05" → "2026-05-01" pour la colonne date `month` de redistribution_history. */
function parseMonthInput(raw: string): { monthKey: string; monthDate: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const mon = Number(match[2]);
  if (mon < 1 || mon > 12) return null;
  const monthKey = `${match[1]}-${match[2]}`;
  return { monthKey, monthDate: `${monthKey}-01` };
}

type MemberWeight = {
  membre_id: string;
  pts_ponderes: number;
};

/** SUM(pts_ponderes) par membre_id pour type = quiz. */
async function aggregateQuizPonderes(
  supabase: SupabaseClient,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("points_ponderes")
      .select("membre_id, pts_ponderes")
      .eq("type", "quiz")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    for (const row of rows) {
      const membreId = String(row.membre_id ?? "").trim();
      if (!membreId) continue;
      const amt = Number(row.pts_ponderes ?? 0);
      if (!Number.isFinite(amt)) continue;
      totals.set(membreId, (totals.get(membreId) ?? 0) + amt);
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return totals;
}

/** Crédite le solde $ et journalise le mouvement pour chaque membre. */
async function creditBanqueMembres(
  supabase: SupabaseClient,
  credits: { membre_id: string; gain: number; description: string }[],
): Promise<void> {
  for (const { membre_id, gain, description } of credits) {
    if (!Number.isFinite(gain) || gain <= 0) continue;

    const { data: existing, error: fetchError } = await supabase
      .from("banque_membres")
      .select("solde_dollars")
      .eq("membre_id", membre_id)
      .maybeSingle();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    const previous = Number(existing?.solde_dollars ?? 0);
    const nextSolde = previous + gain;
    const now = new Date().toISOString();

    if (existing) {
      const { error: updateError } = await supabase
        .from("banque_membres")
        .update({ solde_dollars: nextSolde, updated_at: now })
        .eq("membre_id", membre_id);
      if (updateError) {
        throw new Error(updateError.message);
      }
    } else {
      const { error: insertError } = await supabase.from("banque_membres").insert({
        membre_id,
        solde_dollars: gain,
        updated_at: now,
      });
      if (insertError) {
        throw new Error(insertError.message);
      }
    }

  }

  const mouvementRows = credits
    .filter((c) => Number.isFinite(c.gain) && c.gain > 0)
    .map((c) => ({
      membre_id: c.membre_id,
      montant: c.gain,
      type: "redistribution",
      description: c.description,
    }));

  for (let i = 0; i < mouvementRows.length; i += MOUVEMENT_BATCH_SIZE) {
    const batch = mouvementRows.slice(i, i + MOUVEMENT_BATCH_SIZE);
    const { error: mouvementError } = await supabase
      .from("banque_membres_mouvements")
      .insert(batch);
    if (mouvementError) {
      throw new Error(mouvementError.message);
    }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: { month?: string; total_revenue?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed =
    typeof body.month === "string" ? parseMonthInput(body.month) : null;
  const totalRevenue = Number(body.total_revenue);

  if (!parsed) {
    return NextResponse.json(
      { error: "month attendu (format AAAA-MM)" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(totalRevenue) || totalRevenue <= 0) {
    return NextResponse.json({ error: "total_revenue invalide" }, { status: 400 });
  }

  const { monthKey, monthDate } = parsed;

  try {
    const supabase = getServiceSupabase();

    const { data: existing, error: existingError } = await supabase
      .from("redistribution_history")
      .select("id")
      .eq("month", monthDate)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json(
        { error: `Une redistribution existe déjà pour ${monthKey}` },
        { status: 409 },
      );
    }

    const { data: bank, error: bankError } = await supabase
      .from("banque_leve")
      .select(
        "id, total_revenue, pmq_balance, production_balance, fondation_balance, operations_balance",
      )
      .limit(1)
      .maybeSingle();

    if (bankError) {
      return NextResponse.json({ error: bankError.message }, { status: 500 });
    }
    if (!bank) {
      return NextResponse.json({ error: "banque_leve introuvable" }, { status: 404 });
    }

    const pmqPool = totalRevenue * PMQ_RATE;
    const productionPool = totalRevenue * PRODUCTION_RATE;
    const fondationPool = totalRevenue * FONDATION_RATE;
    const operationsPool = totalRevenue * OPERATIONS_RATE;

    const ponderesByMember = await aggregateQuizPonderes(supabase);

    const weights: MemberWeight[] = [];
    let totalPoids = 0;

    for (const [membreId, ptsPonderes] of ponderesByMember) {
      if (ptsPonderes > 0) {
        totalPoids += ptsPonderes;
        weights.push({ membre_id: membreId, pts_ponderes: ptsPonderes });
      }
    }

    if (weights.length === 0 || totalPoids <= 0) {
      return NextResponse.json(
        {
          pmq_pool: pmqPool,
          value_per_point: null,
          total_distributed: 0,
          total_members: 0,
          error: "Aucun point quiz pondéré",
        },
        { status: 422 },
      );
    }

    const valuePerPoint = pmqPool / totalPoids;
    let totalDistributed = 0;
    const bankCredits: { membre_id: string; gain: number; description: string }[] =
      [];

    for (const m of weights) {
      const payout = (pmqPool * m.pts_ponderes) / totalPoids;
      totalDistributed += payout;
      bankCredits.push({
        membre_id: m.membre_id,
        gain: payout,
        description: `Redistribution PMQ — ${monthKey}`,
      });
    }

    const { error: histError } = await supabase.from("redistribution_history").insert({
      month: monthDate,
      total_revenue: totalRevenue,
      pmq_pool: pmqPool,
      ptc_pool: 0,
      pcol_pool: 0,
      pa_pool: 0,
      total_members: weights.length,
      value_per_point: valuePerPoint,
    });

    if (histError) {
      return NextResponse.json({ error: histError.message }, { status: 500 });
    }

    for (let i = 0; i < bankCredits.length; i += MOUVEMENT_BATCH_SIZE) {
      const batch = bankCredits.slice(i, i + MOUVEMENT_BATCH_SIZE);
      try {
        await creditBanqueMembres(supabase, batch);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    const { error: updateBankError } = await supabase
      .from("banque_leve")
      .update({
        total_revenue: Number(bank.total_revenue ?? 0) + totalRevenue,
        pmq_balance: Number(bank.pmq_balance ?? 0) + pmqPool,
        production_balance: Number(bank.production_balance ?? 0) + productionPool,
        fondation_balance: Number(bank.fondation_balance ?? 0) + fondationPool,
        operations_balance: Number(bank.operations_balance ?? 0) + operationsPool,
      })
      .eq("id", bank.id);

    if (updateBankError) {
      return NextResponse.json({ error: updateBankError.message }, { status: 500 });
    }

    return NextResponse.json({
      pmq_pool: pmqPool,
      value_per_point: valuePerPoint,
      total_distributed: totalDistributed,
      total_members: weights.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

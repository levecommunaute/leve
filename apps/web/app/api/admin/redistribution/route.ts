import { type NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

/** Répartition mensuelle LEVE (100 % du revenu du mois). */
const PMQ_RATE = 0.45;
const PRODUCTION_RATE = 0.2;
const FONDATION_RATE = 0.1;
const OPERATIONS_RATE = 0.25;

const ELIGIBLE_POINT_TYPES = ["code", "quiz"] as const;
const PAGE_SIZE = 1000;
const TX_BATCH_SIZE = 500;

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
  points: number;
  multiplier: number;
  weight: number;
};

/** SUM(amount) par membre_id pour les types code et quiz. */
async function aggregateEligiblePoints(
  supabase: SupabaseClient,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("points_transactions")
      .select("membre_id, amount")
      .in("type", [...ELIGIBLE_POINT_TYPES])
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    for (const row of rows) {
      const membreId = String(row.membre_id ?? "").trim();
      if (!membreId) continue;
      const amt = Number(row.amount ?? 0);
      if (!Number.isFinite(amt)) continue;
      totals.set(membreId, (totals.get(membreId) ?? 0) + amt);
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return totals;
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

    const pointsByMember = await aggregateEligiblePoints(supabase);
    const memberIds = [...pointsByMember.keys()].filter(
      (id) => (pointsByMember.get(id) ?? 0) > 0,
    );

    if (memberIds.length === 0) {
      return NextResponse.json(
        {
          pmq_pool: pmqPool,
          value_per_point: null,
          total_distributed: 0,
          total_members: 0,
          error: "Aucun point éligible (types code, quiz)",
        },
        { status: 422 },
      );
    }

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, multiplier")
      .in("id", memberIds);

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 });
    }

    const multiplierById = new Map(
      (profiles ?? []).map((p) => [String(p.id), Number(p.multiplier ?? 1)]),
    );

    const weights: MemberWeight[] = [];
    let totalWeight = 0;

    for (const membreId of memberIds) {
      const points = pointsByMember.get(membreId) ?? 0;
      const multiplier = multiplierById.get(membreId) ?? 1;
      const weight = points * multiplier;
      if (weight > 0) {
        totalWeight += weight;
        weights.push({ membre_id: membreId, points, multiplier, weight });
      }
    }

    if (totalWeight <= 0) {
      return NextResponse.json(
        {
          pmq_pool: pmqPool,
          value_per_point: null,
          total_distributed: 0,
          total_members: 0,
          error: "Aucun poids positif (points × multiplicateur)",
        },
        { status: 422 },
      );
    }

    const valuePerPoint = pmqPool / totalWeight;
    let totalDistributed = 0;
    const txRows: Record<string, unknown>[] = [];

    for (const m of weights) {
      const payout = (pmqPool * m.weight) / totalWeight;
      totalDistributed += payout;
      txRows.push({
        membre_id: m.membre_id,
        amount: payout,
        type: "redistribution",
        description: `Redistribution PMQ — ${monthKey}`,
        metadata: {
          month: monthKey,
          points: m.points,
          multiplier: m.multiplier,
          weight: m.weight,
        },
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

    for (let i = 0; i < txRows.length; i += TX_BATCH_SIZE) {
      const batch = txRows.slice(i, i + TX_BATCH_SIZE);
      const { error: txError } = await supabase
        .from("points_transactions")
        .insert(batch);
      if (txError) {
        return NextResponse.json({ error: txError.message }, { status: 500 });
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

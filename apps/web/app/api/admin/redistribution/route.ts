import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

/** Aligné sur `redistribution-mensuelle` et `historique` (PMQ = 45 %). */
const PMQ = 0.45;
const PTC = 0.1;
const PCOL = 0.2;
const PA = 0.05;
const OPERATIONS = 0.25;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: { month?: string; total_revenue?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const month =
    typeof body.month === "string" && /^\d{4}-\d{2}$/.test(body.month.trim())
      ? body.month.trim()
      : null;
  const totalRevenue = Number(body.total_revenue);
  if (!month) {
    return NextResponse.json({ error: "month attendu (format AAAA-MM)" }, { status: 400 });
  }
  if (!Number.isFinite(totalRevenue) || totalRevenue <= 0) {
    return NextResponse.json({ error: "total_revenue invalide" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();

    const { data: existing } = await supabase
      .from("redistribution_history")
      .select("id")
      .eq("month", month)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `Une redistribution existe déjà pour ${month}` },
        { status: 409 },
      );
    }

    const { data: bank, error: bankError } = await supabase
      .from("banque_leve")
      .select("id, pool_ptc, pool_pcol, pool_pa, pool_operations")
      .limit(1)
      .maybeSingle();

    if (bankError) {
      return NextResponse.json({ error: bankError.message }, { status: 500 });
    }
    if (!bank) {
      return NextResponse.json({ error: "banque_leve introuvable" }, { status: 404 });
    }

    const pmqPool = totalRevenue * PMQ;
    const ptcAdd = totalRevenue * PTC;
    const pcolAdd = totalRevenue * PCOL;
    const paAdd = totalRevenue * PA;
    const operationsAdd = totalRevenue * OPERATIONS;

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, points, multiplier")
      .gt("points", 0);

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 });
    }

    const members = profiles ?? [];
    let totalWeight = 0;
    const weights: { id: string; points: number; multiplier: number; w: number }[] = [];

    for (const row of members) {
      const points = Number(row.points ?? 0);
      const multiplier = Number(row.multiplier ?? 1);
      const w = points * multiplier;
      if (w > 0) {
        totalWeight += w;
        weights.push({ id: row.id, points, multiplier, w });
      }
    }

    if (totalWeight <= 0) {
      return NextResponse.json(
        {
          pmq_pool: pmqPool,
          value_per_point: null,
          total_distributed: 0,
          error: "Aucun poids positif (points × multiplicateur)",
        },
        { status: 422 },
      );
    }

    const valuePerPoint = pmqPool / totalWeight;

    let totalDistributed = 0;
    const historyRows: Record<string, unknown>[] = [];
    const txRows: Record<string, unknown>[] = [];

    for (const m of weights) {
      const payout = (pmqPool * m.w) / totalWeight;
      totalDistributed += payout;
      historyRows.push({
        user_id: m.id,
        month,
        amount: payout,
        points_snapshot: m.points,
        multiplier_snapshot: m.multiplier,
      });
      txRows.push({
        user_id: m.id,
        amount: payout,
        type: "redistribution",
        metadata: { month, weight: m.w },
      });
    }

    if (historyRows.length) {
      const { error: histError } = await supabase.from("redistribution_history").insert(historyRows);
      if (histError) {
        return NextResponse.json({ error: histError.message }, { status: 500 });
      }
    }

    if (txRows.length) {
      const { error: txError } = await supabase.from("points_transactions").insert(txRows);
      if (txError) {
        return NextResponse.json({ error: txError.message }, { status: 500 });
      }
    }

    const { error: updateBankError } = await supabase
      .from("banque_leve")
      .update({
        pool_ptc: Number(bank.pool_ptc ?? 0) + ptcAdd,
        pool_pcol: Number(bank.pool_pcol ?? 0) + pcolAdd,
        pool_pa: Number(bank.pool_pa ?? 0) + paAdd,
        pool_operations: Number(bank.pool_operations ?? 0) + operationsAdd,
      })
      .eq("id", bank.id);

    if (updateBankError) {
      console.warn("[admin/redistribution] mise à jour banque:", updateBankError.message);
    }

    return NextResponse.json({
      pmq_pool: pmqPool,
      value_per_point: valuePerPoint,
      total_distributed: totalDistributed,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

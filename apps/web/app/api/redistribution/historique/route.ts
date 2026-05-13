import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Part du revenu allouée au pool PMQ lors de la redistribution (aligné Edge `redistribution-mensuelle`). */
const PMQ_SHARE = 0.45;

export type RedistributionMois = {
  month: string;
  /** Revenu mensuel déduit du total redistribué (÷ 45 % PMQ). */
  total_revenue: number;
  /** $ CAD par unité de pondération (point × multiplicateur) pour ce mois. */
  value_per_point: number | null;
  total_distributed: number;
};

function cutoffMonthKey(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - 11);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export async function GET(): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Configuration Supabase manquante" },
      { status: 500 },
    );
  }

  const supabase = createClient(url, key);
  const minMonth = cutoffMonthKey();

  const { data, error } = await supabase
    .from("redistribution_history")
    .select("month, total_revenue, points_snapshot, multiplier_snapshot")
    .gte("month", minMonth)
    .order("month", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const agg = new Map<
    string,
    { totalDistributed: number; weightSum: number }
  >();

  for (const row of rows) {
    const month = String(row.month ?? "");
    if (!month) continue;
    const amt = Number(row.total_revenue ?? 0);
    const pts = Number(row.points_snapshot ?? 0);
    const mult = Number(row.multiplier_snapshot ?? 1);
    const w =
      Number.isFinite(pts) && Number.isFinite(mult) ? pts * mult : 0;
    const cur = agg.get(month) ?? { totalDistributed: 0, weightSum: 0 };
    cur.totalDistributed += Number.isFinite(amt) ? amt : 0;
    cur.weightSum += w > 0 ? w : 0;
    agg.set(month, cur);
  }

  const months = [...agg.keys()].sort((a, b) => b.localeCompare(a)).slice(0, 12);

  const history: RedistributionMois[] = months.map((month) => {
    const { totalDistributed, weightSum } = agg.get(month)!;
    const total_revenue =
      PMQ_SHARE > 0 ? totalDistributed / PMQ_SHARE : totalDistributed;
    const value_per_point =
      weightSum > 0 ? totalDistributed / weightSum : null;
    return {
      month,
      total_revenue,
      value_per_point,
      total_distributed: totalDistributed,
    };
  });

  return NextResponse.json({ history });
}

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type RedistributionMois = {
  month: string;
  /** Revenu mensuel (champ `total_revenue` en base). */
  total_revenue: number;
  /** $ CAD par unité de pondération pour ce mois. */
  value_per_point: number | null;
  /** Montant PMQ redistribué (`pmq_pool`). */
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
    .select(
      "id, month, total_revenue, pmq_pool, ptc_pool, pcol_pool, pa_pool, total_members, value_per_point, created_at",
    )
    .gte("month", minMonth)
    .order("month", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const agg = new Map<
    string,
    {
      totalDistributed: number;
      totalRevenueSum: number;
      weightedVpp: number;
      vppWeight: number;
    }
  >();

  for (const row of rows) {
    const month = String(row.month ?? "");
    if (!month) continue;
    const pmq = Number(row.pmq_pool ?? 0);
    const tr = Number(row.total_revenue ?? 0);
    const vppRaw = row.value_per_point;
    const vpp =
      vppRaw != null && vppRaw !== ""
        ? Number(vppRaw)
        : null;

    const cur = agg.get(month) ?? {
      totalDistributed: 0,
      totalRevenueSum: 0,
      weightedVpp: 0,
      vppWeight: 0,
    };
    cur.totalDistributed += Number.isFinite(pmq) ? pmq : 0;
    cur.totalRevenueSum += Number.isFinite(tr) ? tr : 0;
    if (vpp != null && Number.isFinite(vpp) && pmq > 0) {
      cur.weightedVpp += vpp * pmq;
      cur.vppWeight += pmq;
    }
    agg.set(month, cur);
  }

  const months = [...agg.keys()].sort((a, b) => b.localeCompare(a)).slice(0, 12);

  const history: RedistributionMois[] = months.map((month) => {
    const { totalDistributed, totalRevenueSum, weightedVpp, vppWeight } =
      agg.get(month)!;
    let value_per_point: number | null =
      vppWeight > 0 ? weightedVpp / vppWeight : null;
    if (value_per_point == null) {
      const fallback = rows.find(
        (r) =>
          String(r.month ?? "") === month &&
          r.value_per_point != null &&
          r.value_per_point !== "",
      );
      if (fallback?.value_per_point != null && fallback.value_per_point !== "") {
        const n = Number(fallback.value_per_point);
        value_per_point = Number.isFinite(n) ? n : null;
      }
    }
    return {
      month,
      total_revenue: totalRevenueSum,
      value_per_point,
      total_distributed: totalDistributed,
    };
  });

  return NextResponse.json({ history });
}

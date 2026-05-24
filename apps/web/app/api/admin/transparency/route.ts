import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const PRODUCTION_RATE = 0.2;
const FONDATION_RATE = 0.1;
const OPERATIONS_RATE = 0.25;

function monthKeyFromDb(value: unknown): string {
  const s = String(value ?? "").trim();
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}` : s;
}

export type TransparencyRow = {
  month: string;
  total_revenue: number;
  pmq_pool: number;
  production_pool: number;
  fondation_pool: number;
  operations_pool: number;
  value_per_point: number | null;
  total_members: number;
};

function enrichRow(row: {
  month: unknown;
  total_revenue: unknown;
  pmq_pool: unknown;
  value_per_point: unknown;
  total_members: unknown;
}): TransparencyRow {
  const totalRevenue = Number(row.total_revenue ?? 0);
  const pmq = Number(row.pmq_pool ?? 0);
  const vppRaw = row.value_per_point;
  const vpp =
    vppRaw != null && vppRaw !== "" && Number.isFinite(Number(vppRaw))
      ? Number(vppRaw)
      : null;
  return {
    month: monthKeyFromDb(row.month),
    total_revenue: Number.isFinite(totalRevenue) ? totalRevenue : 0,
    pmq_pool: Number.isFinite(pmq) ? pmq : 0,
    production_pool: totalRevenue * PRODUCTION_RATE,
    fondation_pool: totalRevenue * FONDATION_RATE,
    operations_pool: totalRevenue * OPERATIONS_RATE,
    value_per_point: vpp,
    total_members: Number(row.total_members ?? 0),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const yearParam = url.searchParams.get("year")?.trim() ?? "";
  const monthParam = url.searchParams.get("month")?.trim() ?? "";

  const year = /^\d{4}$/.test(yearParam) ? yearParam : null;
  const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : null;

  try {
    const supabase = getServiceSupabase();
    let query = supabase
      .from("redistribution_history")
      .select(
        "id, month, total_revenue, pmq_pool, ptc_pool, pcol_pool, pa_pool, total_members, value_per_point, created_at",
      )
      .order("month", { ascending: false });

    if (year) {
      query = query.gte("month", `${year}-01-01`).lte("month", `${year}-12-31`);
    }
    if (month) {
      query = query.eq("month", `${month}-01`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: allMonths, error: yearsError } = await supabase
      .from("redistribution_history")
      .select("month");

    if (yearsError) {
      return NextResponse.json({ error: yearsError.message }, { status: 500 });
    }

    const availableYears = [
      ...new Set(
        (allMonths ?? [])
          .map((r) => monthKeyFromDb(r.month).slice(0, 4))
          .filter((y) => /^\d{4}$/.test(y)),
      ),
    ].sort((a, b) => b.localeCompare(a));

    const agg = new Map<string, TransparencyRow>();
    for (const row of data ?? []) {
      const enriched = enrichRow(row);
      if (!enriched.month) continue;
      const existing = agg.get(enriched.month);
      if (!existing) {
        agg.set(enriched.month, enriched);
      } else {
        agg.set(enriched.month, {
          month: enriched.month,
          total_revenue: existing.total_revenue + enriched.total_revenue,
          pmq_pool: existing.pmq_pool + enriched.pmq_pool,
          production_pool: existing.production_pool + enriched.production_pool,
          fondation_pool: existing.fondation_pool + enriched.fondation_pool,
          operations_pool: existing.operations_pool + enriched.operations_pool,
          value_per_point: enriched.value_per_point ?? existing.value_per_point,
          total_members: Math.max(existing.total_members, enriched.total_members),
        });
      }
    }

    const rows = [...agg.values()].sort((a, b) => b.month.localeCompare(a.month));

    const annualTotals = year
      ? rows.reduce(
          (acc, row) => ({
            total_revenue: acc.total_revenue + row.total_revenue,
            pmq_pool: acc.pmq_pool + row.pmq_pool,
            production_pool: acc.production_pool + row.production_pool,
            fondation_pool: acc.fondation_pool + row.fondation_pool,
            operations_pool: acc.operations_pool + row.operations_pool,
            total_members: acc.total_members + row.total_members,
          }),
          {
            total_revenue: 0,
            pmq_pool: 0,
            production_pool: 0,
            fondation_pool: 0,
            operations_pool: 0,
            total_members: 0,
          },
        )
      : null;

    return NextResponse.json({
      rows,
      filter: { year, month },
      annual_totals: annualTotals,
      available_years: availableYears,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

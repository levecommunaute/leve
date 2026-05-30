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

export type PoolMonthPoint = {
  month: string;
  pmq_balance: number;
  production_balance: number;
  fondation_balance: number;
  operations_balance: number;
  total_revenue: number;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();

    const { data: history, error: histError } = await supabase
      .from("redistribution_history")
      .select("month, total_revenue, pmq_pool")
      .order("month", { ascending: true });

    if (histError) {
      return NextResponse.json({ error: histError.message }, { status: 500 });
    }

    const byMonth = new Map<string, { totalRevenue: number; pmqPool: number }>();
    for (const row of history ?? []) {
      const month = monthKeyFromDb(row.month);
      if (!month) continue;
      const tr = Number(row.total_revenue ?? 0);
      const pmq = Number(row.pmq_pool ?? 0);
      const cur = byMonth.get(month) ?? { totalRevenue: 0, pmqPool: 0 };
      cur.totalRevenue += Number.isFinite(tr) ? tr : 0;
      cur.pmqPool += Number.isFinite(pmq) ? pmq : 0;
      byMonth.set(month, cur);
    }

    const months = [...byMonth.keys()].sort((a, b) => a.localeCompare(b));

    let pmqCum = 0;
    let productionCum = 0;
    let fondationCum = 0;
    let operationsCum = 0;

    const series: PoolMonthPoint[] = months.map((month) => {
      const { totalRevenue, pmqPool } = byMonth.get(month)!;
      pmqCum += pmqPool;
      productionCum += totalRevenue * PRODUCTION_RATE;
      fondationCum += totalRevenue * FONDATION_RATE;
      operationsCum += totalRevenue * OPERATIONS_RATE;
      return {
        month,
        pmq_balance: pmqCum,
        production_balance: productionCum,
        fondation_balance: fondationCum,
        operations_balance: operationsCum,
        total_revenue: totalRevenue,
      };
    });

    const { data: bank, error: bankError } = await supabase
      .from("banque_leve")
      .select(
        "pmq_balance, production_balance, fondation_balance, operations_balance, pa_balance, frais_plateforme_balance, taxe_pa_balance, total_revenue",
      )
      .limit(1)
      .maybeSingle();

    if (bankError) {
      return NextResponse.json({ error: bankError.message }, { status: 500 });
    }

    const { data: paTaxRows, error: paTaxError } = await supabase
      .from("pa_transactions")
      .select("tax_usd")
      .like("description", "Taxe 2% —%");

    if (paTaxError) {
      return NextResponse.json({ error: paTaxError.message }, { status: 500 });
    }

    let pa_tax_total = 0;
    for (const row of paTaxRows ?? []) {
      const taxeUsd = Number(row.tax_usd ?? 0);
      if (taxeUsd > 0) pa_tax_total += taxeUsd;
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const paTaxCommunauteFromTx = round2(pa_tax_total * 0.75);
    const paTaxFonctionnementFromTx = round2(pa_tax_total * 0.25);

    const current = bank
      ? {
          pmq_balance: Number(bank.pmq_balance ?? 0),
          production_balance: Number(bank.production_balance ?? 0),
          fondation_balance: Number(bank.fondation_balance ?? 0),
          operations_balance: Number(bank.operations_balance ?? 0),
          pa_balance: Number(bank.pa_balance ?? 0),
          frais_plateforme_balance: Number(bank.frais_plateforme_balance ?? 0),
          taxe_pa_balance: Number(bank.taxe_pa_balance ?? 0),
          total_revenue: Number(bank.total_revenue ?? 0),
        }
      : null;

    const pa_tax_stats = {
      total: round2(pa_tax_total),
      communaute: current
        ? Number(current.taxe_pa_balance)
        : paTaxCommunauteFromTx,
      fonctionnement: paTaxFonctionnementFromTx,
    };

    return NextResponse.json({ series, current, pa_tax_stats });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

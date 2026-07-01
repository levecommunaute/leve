import { type NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";
import { currentMonthStartIso } from "../../../../lib/rang-config";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

export type AdminGlobalStats = {
  membres_actifs: number;
  pts_ponderes_mois: number;
  quiz_mois: number;
  codes_mois: number;
  revenus_redistribues: number;
  pool_pmq: number;
  pool_ptc: number;
};

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthEndIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
}

async function paginatedSumPtsPonderes(
  supabase: SupabaseClient,
  filter: "mois" | "created_at",
): Promise<number> {
  const monthKey = currentMonthKey();
  const monthDate = `${monthKey}-01`;
  const monthStartIso = currentMonthStartIso();
  const monthEndIso = currentMonthEndIso();
  let total = 0;
  let offset = 0;

  for (;;) {
    let query = supabase.from("points_ponderes").select("pts_ponderes");
    if (filter === "mois") {
      query = query.or(`mois.eq.${monthKey},mois.eq.${monthDate}`);
    } else {
      query = query.gte("created_at", monthStartIso).lt("created_at", monthEndIso);
    }
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    for (const row of rows) {
      const amt = Number(row.pts_ponderes ?? 0);
      if (Number.isFinite(amt)) total += amt;
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return total;
}

async function sumPtsPonderesCurrentMonth(supabase: SupabaseClient): Promise<number> {
  try {
    return await paginatedSumPtsPonderes(supabase, "mois");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/mois|column|schema cache/i.test(msg)) {
      throw e;
    }
    return paginatedSumPtsPonderes(supabase, "created_at");
  }
}

async function countSinceMonthStart(
  supabase: SupabaseClient,
  table: "quiz_submissions" | "code_submissions",
  monthStartIso: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte("created_at", monthStartIso);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function countActiveMembers(supabase: SupabaseClient): Promise<number> {
  const result = await supabase.rpc("count_active_members");
  console.log("[global-stats] count_active_members raw:", JSON.stringify(result, null, 2));
  const { data, error } = result;
  if (error) {
    throw new Error(error.message);
  }
  return Number(data ?? 0);
}

async function sumRedistributionRevenue(supabase: SupabaseClient): Promise<number> {
  let total = 0;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("redistribution_history")
      .select("total_revenue")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    for (const row of rows) {
      const amt = Number(row.total_revenue ?? 0);
      if (Number.isFinite(amt)) total += amt;
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return total;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const denied = requireAdminSecret(request);
    if (denied) return denied;

    const supabase = getServiceSupabase();
    const monthStartIso = currentMonthStartIso();

    const [
      membresActifs,
      ptsPonderesMois,
      quizMois,
      codesMois,
      revenusRedistribues,
      bankRes,
    ] = await Promise.all([
      countActiveMembers(supabase),
      sumPtsPonderesCurrentMonth(supabase),
      countSinceMonthStart(supabase, "quiz_submissions", monthStartIso),
      countSinceMonthStart(supabase, "code_submissions", monthStartIso),
      sumRedistributionRevenue(supabase),
      supabase
        .from("banque_leve")
        .select("pmq_balance, ptc_balance")
        .limit(1)
        .maybeSingle(),
    ]);

    console.log("[global-stats] 1 membres:", membresActifs);
    console.log("[global-stats] 2 pts_ponderes:", ptsPonderesMois);
    console.log("[global-stats] 3 quiz:", quizMois);
    console.log("[global-stats] 4 codes:", codesMois);
    console.log("[global-stats] 5 revenus:", revenusRedistribues);
    const poolPmq = Number(bankRes.data?.pmq_balance ?? 0);
    const poolPtc = Number(bankRes.data?.ptc_balance ?? 0);
    console.log("[global-stats] 6 banque:", poolPmq, poolPtc);

    if (bankRes.error) {
      return NextResponse.json({ error: bankRes.error.message }, { status: 500 });
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    const stats: AdminGlobalStats = {
      membres_actifs: membresActifs,
      pts_ponderes_mois: round2(ptsPonderesMois),
      quiz_mois: quizMois,
      codes_mois: codesMois,
      revenus_redistribues: round2(revenusRedistribues),
      pool_pmq: round2(poolPmq),
      pool_ptc: round2(poolPtc),
    };

    return NextResponse.json(stats);
  } catch (e) {
    console.error("[global-stats] erreur fatale:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

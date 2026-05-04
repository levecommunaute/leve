import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PMQ = 0.45;
const PTC = 0.1;
const PCOL = 0.2;
const PA = 0.05;
const OPERATIONS = 0.25;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(
      { success: false, error: "Missing Supabase configuration" },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const now = new Date();
    if (now.getUTCDate() !== 1) {
      return jsonResponse({
        success: false,
        error:
          "redistribution-mensuelle is intended to run on the 1st of each month (UTC).",
      }, 400);
    }

    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const { data: existing } = await supabase
      .from("redistribution_history")
      .select("id")
      .eq("month", monthKey)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return jsonResponse({ success: true, total_distributed: 0, member_count: 0 });
    }

    const { data: bank, error: bankError } = await supabase
      .from("banque_leve")
      .select(
        "id, total_revenue, pool_ptc, pool_pcol, pool_pa, pool_operations",
      )
      .limit(1)
      .maybeSingle();

    if (bankError) throw bankError;
    if (!bank) {
      return jsonResponse(
        { success: false, error: "banque_leve row not found" },
        404,
      );
    }

    const totalRevenue = Number(bank.total_revenue ?? 0);
    if (totalRevenue <= 0) {
      return jsonResponse({ success: true, total_distributed: 0, member_count: 0 });
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

    if (profilesError) throw profilesError;

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
      return jsonResponse({
        success: false,
        error: "No positive points × multiplier weights to allocate PMQ",
      }, 422);
    }

    let totalDistributed = 0;
    const historyRows: Record<string, unknown>[] = [];
    const txRows: Record<string, unknown>[] = [];

    for (const m of weights) {
      const payout = (pmqPool * m.w) / totalWeight;
      totalDistributed += payout;
      historyRows.push({
        user_id: m.id,
        month: monthKey,
        amount: payout,
        points_snapshot: m.points,
        multiplier_snapshot: m.multiplier,
      });
      txRows.push({
        user_id: m.id,
        amount: payout,
        type: "redistribution",
        metadata: { month: monthKey, weight: m.w },
      });
    }

    if (historyRows.length) {
      const { error: histError } = await supabase
        .from("redistribution_history")
        .insert(historyRows);
      if (histError) throw histError;
    }

    if (txRows.length) {
      const { error: txError } = await supabase
        .from("points_transactions")
        .insert(txRows);
      if (txError) throw txError;
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
      console.warn(
        "[redistribution-mensuelle] banque_leve pool update failed (columns may differ):",
        updateBankError.message,
      );
    }

    return jsonResponse({
      success: true,
      total_distributed: totalDistributed,
      member_count: weights.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[redistribution-mensuelle]", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});

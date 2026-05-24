import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

  const nowIso = new Date().toISOString();

  try {
    const { data: pending, error: fetchError } = await supabase
      .from("pending_pcol")
      .select("id, pts_pending")
      .eq("recupere", false)
      .lt("date_expiration", nowIso);

    if (fetchError) throw fetchError;

    const rows = pending ?? [];
    if (rows.length === 0) {
      return jsonResponse({ success: true, expired_count: 0 });
    }

    const ids = rows.map((r) => r.id);
    const totalExpired = rows.reduce(
      (sum, r) => sum + Number(r.pts_pending ?? 0),
      0,
    );

    const { error: deleteError } = await supabase
      .from("pending_pcol")
      .delete()
      .in("id", ids);

    if (deleteError) throw deleteError;

    const { data: bank, error: bankError } = await supabase
      .from("banque_leve")
      .select("id, pool_ptc")
      .limit(1)
      .maybeSingle();

    if (bankError) throw bankError;
    if (bank && totalExpired > 0) {
      const { error: bankUpdateError } = await supabase
        .from("banque_leve")
        .update({
          pool_ptc: Number(bank.pool_ptc ?? 0) + totalExpired,
        })
        .eq("id", bank.id);

      if (bankUpdateError) {
        console.warn(
          "[expire-pending] banque_leve.pool_ptc update failed:",
          bankUpdateError.message,
        );
      }
    }

    return jsonResponse({ success: true, expired_count: rows.length, total_expired_pts: totalExpired });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[expire-pending]", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});

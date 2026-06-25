import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PTC_UNIT_DOLLARS = 5;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
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
  const mois = currentMonthKey();

  try {
    const { data: pending, error: fetchError } = await supabase
      .from("pending_pcol")
      .select(
        "id, collaborateur_id, points_pending_cumul, points_amount, pts_pending, valeur_dollars_cumul",
      )
      .eq("statut", "pending")
      .lt("date_expiration", nowIso);

    if (fetchError) throw fetchError;

    const rows = pending ?? [];
    if (rows.length === 0) {
      return jsonResponse({ success: true, expired_count: 0 });
    }

    const ids = rows.map((r) => r.id);
    let totalExpiredDollars = 0;
    let totalExpiredPts = 0;

    for (const row of rows) {
      const dollars = Number(row.valeur_dollars_cumul ?? 0);
      const pts = Number(
        row.points_pending_cumul ?? row.points_amount ?? row.pts_pending ?? 0,
      );
      totalExpiredDollars += dollars;
      totalExpiredPts += pts;
    }

    totalExpiredDollars = round2(totalExpiredDollars);
    totalExpiredPts = round2(totalExpiredPts);

    const { error: updateError } = await supabase
      .from("pending_pcol")
      .update({ statut: "expired", status: "expired", recupere: true })
      .in("id", ids);

    if (updateError) throw updateError;

    if (totalExpiredDollars > 0) {
      const { data: bank, error: bankError } = await supabase
        .from("banque_leve")
        .select("id, ptc_balance")
        .limit(1)
        .maybeSingle();

      if (bankError) throw bankError;

      if (bank?.id) {
        const { error: bankUpdateError } = await supabase
          .from("banque_leve")
          .update({
            ptc_balance: round2(Number(bank.ptc_balance ?? 0) + totalExpiredDollars),
          })
          .eq("id", bank.id);

        if (bankUpdateError) {
          console.warn(
            "[expire-pending] banque_leve.ptc_balance update failed:",
            bankUpdateError.message,
          );
        }
      }

      const mouvements = rows
        .map((row) => {
          const montant = round2(Number(row.valeur_dollars_cumul ?? 0));
          if (montant <= 0) return null;
          return {
            mois,
            source: "pending_expire" as const,
            montant,
            description: `PCOL pending expiré — vidéo ${String(row.video_id ?? "").slice(0, 8)}…`,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null);

      if (mouvements.length > 0) {
        const { error: mvtError } = await supabase
          .from("ptc_mouvements")
          .insert(mouvements);

        if (mvtError) {
          console.warn("[expire-pending] ptc_mouvements insert failed:", mvtError.message);
        }
      }
    }

    return jsonResponse({
      success: true,
      expired_count: rows.length,
      total_expired_pts: totalExpiredPts,
      total_expired_dollars: totalExpiredDollars,
      ptc_units: round2(totalExpiredDollars / PTC_UNIT_DOLLARS),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[expire-pending]", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});

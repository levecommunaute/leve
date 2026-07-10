import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Cotisation mensuelle membre — à lancer le 1er du mois après redistribution.
 * Pour chaque membre cotisation_active = true :
 *   si solde banque >= montant → débiter + créditer points bonus
 *   log points_transactions type = 'cotisation_membre'
 */

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PAGE_SIZE = 500;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function currentMonthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentMonthStartIso(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

type CotisationProfile = {
  id: string;
  cotisation_montant: number | string | null;
  cotisation_points_bonus: number | string | null;
};

async function fetchActiveCotisations(
  supabase: SupabaseClient,
): Promise<CotisationProfile[]> {
  const rows: CotisationProfile[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, cotisation_montant, cotisation_points_bonus")
      .eq("cotisation_active", true)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data ?? []) as CotisationProfile[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

async function alreadyChargedThisMonth(
  supabase: SupabaseClient,
  membreId: string,
  monthStart: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("points_transactions")
    .select("id")
    .eq("membre_id", membreId)
    .eq("type", "cotisation_membre")
    .gte("created_at", monthStart)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

async function processMember(
  supabase: SupabaseClient,
  profile: CotisationProfile,
  monthKey: string,
  monthStart: string,
): Promise<"charged" | "skipped_balance" | "skipped_already" | "skipped_invalid"> {
  if (await alreadyChargedThisMonth(supabase, profile.id, monthStart)) {
    return "skipped_already";
  }

  const montant = Number(profile.cotisation_montant ?? 0);
  const pointsBonus = Number(profile.cotisation_points_bonus ?? 0);

  if (!Number.isFinite(montant) || montant <= 0) {
    return "skipped_invalid";
  }
  if (!Number.isFinite(pointsBonus) || pointsBonus <= 0) {
    return "skipped_invalid";
  }

  const { data: banque, error: banqueError } = await supabase
    .from("banque_membres")
    .select("solde_dollars")
    .eq("membre_id", profile.id)
    .maybeSingle();

  if (banqueError) throw banqueError;

  const solde = Number(banque?.solde_dollars ?? 0);
  if (!Number.isFinite(solde) || solde < montant) {
    return "skipped_balance";
  }

  const nextSolde = Math.round((solde - montant) * 100) / 100;
  const now = new Date().toISOString();

  const { error: updateBanqueError } = await supabase
    .from("banque_membres")
    .update({ solde_dollars: nextSolde, updated_at: now })
    .eq("membre_id", profile.id);

  if (updateBanqueError) throw updateBanqueError;

  const { error: mvtError } = await supabase.from("banque_membres_mouvements").insert({
    membre_id: profile.id,
    montant: -montant,
    type: "cotisation_membre",
    description: `Cotisation mensuelle ${monthKey} · ${montant.toFixed(2)} $`,
  });

  if (mvtError) throw mvtError;

  const { error: ptError } = await supabase.from("points_transactions").insert({
    membre_id: profile.id,
    amount: pointsBonus,
    type: "cotisation_membre",
    description: `Cotisation mensuelle ${monthKey} · +${pointsBonus} pts bonus`,
  });

  if (ptError) throw ptError;

  return "charged";
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
      return jsonResponse(
        {
          success: false,
          error:
            "cotisation-cron is intended to run on the 1st of each month (UTC), after redistribution.",
        },
        400,
      );
    }

    const { data: flag, error: flagError } = await supabase
      .from("feature_flags")
      .select("actif")
      .eq("nom", "cotisation-membre")
      .maybeSingle();

    if (flagError) throw flagError;
    if (!flag?.actif) {
      return jsonResponse({
        success: true,
        skipped: true,
        reason: "feature flag cotisation-membre inactive",
        charged: 0,
        skipped_balance: 0,
        skipped_already: 0,
        skipped_invalid: 0,
      });
    }

    const monthKey = currentMonthKey(now);
    const monthStart = currentMonthStartIso(now);

    const { data: redistribution } = await supabase
      .from("redistribution_history")
      .select("id")
      .eq("month", monthKey)
      .limit(1)
      .maybeSingle();

    if (!redistribution) {
      console.warn(
        `[cotisation-cron] redistribution_history missing for ${monthKey} — proceeding anyway`,
      );
    }

    const members = await fetchActiveCotisations(supabase);

    let charged = 0;
    let skippedBalance = 0;
    let skippedAlready = 0;
    let skippedInvalid = 0;
    const errors: { membre_id: string; error: string }[] = [];

    for (const profile of members) {
      try {
        const result = await processMember(
          supabase,
          profile,
          monthKey,
          monthStart,
        );
        if (result === "charged") charged += 1;
        else if (result === "skipped_balance") skippedBalance += 1;
        else if (result === "skipped_already") skippedAlready += 1;
        else skippedInvalid += 1;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push({ membre_id: profile.id, error: message });
        console.error(`[cotisation-cron] membre ${profile.id}:`, message);
      }
    }

    return jsonResponse({
      success: errors.length === 0,
      month: monthKey,
      redistribution_found: Boolean(redistribution),
      candidates: members.length,
      charged,
      skipped_balance: skippedBalance,
      skipped_already: skippedAlready,
      skipped_invalid: skippedInvalid,
      errors: errors.length ? errors : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cotisation-cron]", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});

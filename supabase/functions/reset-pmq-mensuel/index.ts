import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PAGE_SIZE = 1000;
const INSERT_BATCH_SIZE = 500;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function fetchAllProfileIds(supabase: SupabaseClient): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;

    const rows = data ?? [];
    for (const row of rows) {
      const id = String(row.id ?? "").trim();
      if (id) ids.push(id);
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return ids;
}

async function aggregateQuizBruts(
  supabase: SupabaseClient,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("points_transactions")
      .select("membre_id, amount")
      .eq("type", "quiz")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;

    const rows = data ?? [];
    for (const row of rows) {
      const membreId = String(row.membre_id ?? "").trim();
      if (!membreId) continue;
      const amt = Number(row.amount ?? 0);
      if (!Number.isFinite(amt)) continue;
      totals.set(membreId, (totals.get(membreId) ?? 0) + amt);
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return totals;
}

async function aggregateQuizPonderes(
  supabase: SupabaseClient,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("points_ponderes")
      .select("membre_id, pts_ponderes")
      .eq("type", "quiz")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;

    const rows = data ?? [];
    for (const row of rows) {
      const membreId = String(row.membre_id ?? "").trim();
      if (!membreId) continue;
      const amt = Number(row.pts_ponderes ?? 0);
      if (!Number.isFinite(amt)) continue;
      totals.set(membreId, (totals.get(membreId) ?? 0) + amt);
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return totals;
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
    const mois = currentMonthKey();

    const [profileIds, brutsByMember, ponderesByMember] = await Promise.all([
      fetchAllProfileIds(supabase),
      aggregateQuizBruts(supabase),
      aggregateQuizPonderes(supabase),
    ]);

    const historiqueRows = profileIds.map((membreId) => ({
      membre_id: membreId,
      mois,
      pts_bruts: brutsByMember.get(membreId) ?? 0,
      pts_ponderes: ponderesByMember.get(membreId) ?? 0,
    }));

    for (let i = 0; i < historiqueRows.length; i += INSERT_BATCH_SIZE) {
      const batch = historiqueRows.slice(i, i + INSERT_BATCH_SIZE);
      const { error: insertError } = await supabase
        .from("pmq_historique")
        .insert(batch);
      if (insertError) throw insertError;
    }

    return jsonResponse({
      success: true,
      membres_traites: profileIds.length,
      mois,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[reset-pmq-mensuel]", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});

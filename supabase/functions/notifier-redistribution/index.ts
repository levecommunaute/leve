import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Body = {
  month: string;
  total_distributed: number;
  value_per_point: number;
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

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(
      { success: false, error: "Missing Supabase configuration" },
      500,
    );
  }

  let payload: Body;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const { month, total_distributed, value_per_point } = payload;
  if (!month || total_distributed == null || value_per_point == null) {
    return jsonResponse({
      success: false,
      error: "Required: month, total_distributed, value_per_point",
    }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, email, points")
      .not("email", "is", null);

    if (error) throw error;

    const list = profiles ?? [];
    let notified = 0;

    for (const p of list) {
      const email = String(p.email ?? "").trim();
      if (!email) continue;

      const points = Number(p.points ?? 0);
      const estimatedPayout = points * Number(value_per_point);

      const subject = `LEVE — Redistribution ${month}`;
      const body =
        `Bonjour,\n\n` +
        `La redistribution du mois ${month} a été traitée.\n` +
        `Montant total distribué aux membres : ${total_distributed}.\n` +
        `Avec vos points actuels (${points}), votre gain estimé est d'environ ${estimatedPayout} (valeur indicative par point : ${value_per_point}).\n\n` +
        `— L'équipe LEVE`;

      console.info(
        "[notifier-redistribution] email payload (no transactional email API in Edge; wire Resend/SMTP or Auth hook separately)",
        JSON.stringify({ to: email, subject, body, user_id: p.id }),
      );
      notified++;
    }

    return jsonResponse({ success: true, notified_count: notified });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[notifier-redistribution]", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});

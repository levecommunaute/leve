import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Body = {
  email: string;
  grace_expire_at: string;
  app_url?: string;
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

  const email = String(payload.email ?? "").trim();
  const graceExpireAt = payload.grace_expire_at;
  if (!email || !graceExpireAt) {
    return jsonResponse({
      success: false,
      error: "Required: email, grace_expire_at",
    }, 400);
  }

  const expireLabel = new Date(graceExpireAt).toLocaleString("fr-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Toronto",
  });
  const appUrl = payload.app_url?.replace(/\/$/, "") || "https://levecommunaute.com";
  const subject = "LEVE — Période de grâce (abonnement YouTube)";
  const body =
    `Bonjour,\n\n` +
    `Votre abonnement YouTube à la chaîne LEVE n'a pas été détecté lors de votre dernière connexion.\n` +
    `Vous disposez d'une période de grâce de 30 jours (jusqu'au ${expireLabel}) pour vous réabonner et conserver l'accès complet.\n\n` +
    `Réabonnez-vous ici : https://www.youtube.com/@levecommunaute\n` +
    `Puis reconnectez-vous : ${appUrl}\n\n` +
    `— L'équipe LEVE`;

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Envoi via Auth OTP (SMTP Supabase) — notification sans créer de compte
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${appUrl}/dashboard?grace=1`,
        data: { grace_notice: true, grace_expire_at: graceExpireAt },
      },
    });

    if (error) {
      console.error("[notifier-grace-abonnement] OTP:", error.message);
      console.info(
        "[notifier-grace-abonnement] fallback log",
        JSON.stringify({ to: email, subject, body }),
      );
      return jsonResponse({ success: true, sent: false, logged: true });
    }

    return jsonResponse({ success: true, sent: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[notifier-grace-abonnement]", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});

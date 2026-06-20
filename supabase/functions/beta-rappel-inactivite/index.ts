import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FROM = "LEVE Beta <noreply@levecommunaute.com>";
const RESEND_API_URL = "https://api.resend.com/emails";
const BETA_CODE = "LEVE2026BETA";
const DEFAULT_BETA_URL = "https://leve-staging.vercel.app/beta";
/** Inactivité (en jours) à partir de laquelle un rappel est envoyé. */
const INACTIVITE_JOURS = 3;
/** Date de fin du beta (UTC, ISO). Surchargée par l'env BETA_FIN_DATE. */
const DEFAULT_BETA_FIN_DATE = "2026-07-31T23:59:59Z";

type BetaProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  beta_derniere_activite: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getBetaUrl(): string {
  const base = (Deno.env.get("BETA_URL") ?? DEFAULT_BETA_URL).replace(
    /\/$/,
    "",
  );
  return `${base}?code=${BETA_CODE}`;
}

function getBetaFinDate(): Date {
  const raw = Deno.env.get("BETA_FIN_DATE") ?? DEFAULT_BETA_FIN_DATE;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? new Date(DEFAULT_BETA_FIN_DATE)
    : parsed;
}

/** Jours calendaires restants avant la fin du beta (>= 0). */
function joursRestants(finDate: Date): number {
  const diffMs = finDate.getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / 86_400_000));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rappelHtml(displayName: string, joursAvantFin: number): string {
  const name = escapeHtml(displayName.trim() || "testeur");
  const lien = escapeHtml(getBetaUrl());
  const joursLabel = joursAvantFin > 1
    ? `${joursAvantFin} jours`
    : `${joursAvantFin} jour`;

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px 28px;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">LEVE Beta</p>
          <h1 style="margin:0 0 20px;font-size:22px;font-weight:600;line-height:1.3;">Bonjour ${name}, on a besoin de vous ! 🧪</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
            Vous n'avez pas visité LEVE depuis <strong>${INACTIVITE_JOURS} jours</strong>.
            Votre regard de testeur nous est précieux pour finaliser la plateforme.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
            Il reste <strong>${joursLabel}</strong> avant la fin du beta. Profitez-en pour explorer
            les dernières nouveautés et nous remonter vos retours.
          </p>
          <p style="margin:0 0 12px;">
            <a href="${lien}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">Reprendre le test</a>
          </p>
          <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#52525b;">
            Ou copiez ce lien : <a href="${lien}" style="color:#18181b;">${lien}</a>
          </p>
        </td></tr>
        <tr><td style="padding-top:28px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;">
          L'équipe LEVE · <a href="https://levecommunaute.com" style="color:#71717a;">levecommunaute.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function rappelText(displayName: string, joursAvantFin: number): string {
  const name = displayName.trim() || "testeur";
  const joursLabel = joursAvantFin > 1
    ? `${joursAvantFin} jours`
    : `${joursAvantFin} jour`;
  return [
    `Bonjour ${name},`,
    "",
    `Vous n'avez pas visité LEVE depuis ${INACTIVITE_JOURS} jours.`,
    `Il reste ${joursLabel} avant la fin du beta.`,
    `Voici votre lien : ${getBetaUrl()}`,
    "",
    "L'équipe LEVE",
  ].join("\n");
}

async function sendResendEmail(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `${res.status}: ${body}` };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");

  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(
      { success: false, error: "Missing Supabase configuration" },
      500,
    );
  }
  if (!resendKey) {
    return jsonResponse({ success: false, error: "Missing RESEND_API_KEY" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const seuilIso = new Date(
      Date.now() - INACTIVITE_JOURS * 86_400_000,
    ).toISOString();

    const { data: profiles, error: fetchError } = await supabase
      .from("profiles")
      .select("id, email, display_name, beta_derniere_activite")
      .eq("is_beta_tester", true)
      .lt("beta_derniere_activite", seuilIso);

    if (fetchError) throw fetchError;

    const testeurs = (profiles ?? []) as BetaProfile[];
    const finDate = getBetaFinDate();
    const joursAvantFin = joursRestants(finDate);
    const subject = "🧪 LEVE Beta — On a besoin de vous !";

    let rappelsEnvoyes = 0;
    let skipped = 0;
    let failed = 0;
    const errors: { user_id: string; error: string }[] = [];

    for (const testeur of testeurs) {
      const email = String(testeur.email ?? "").trim();
      if (!email) {
        skipped++;
        continue;
      }

      const displayName = testeur.display_name ?? "";
      const result = await sendResendEmail(
        resendKey,
        email,
        subject,
        rappelHtml(displayName, joursAvantFin),
        rappelText(displayName, joursAvantFin),
      );

      if (result.ok) {
        rappelsEnvoyes++;
        console.info(`[beta-rappel-inactivite] sent → ${email}`);
      } else {
        failed++;
        errors.push({ user_id: testeur.id, error: result.error });
        console.error(
          `[beta-rappel-inactivite] Resend ${email}:`,
          result.error,
        );
      }
    }

    return jsonResponse({
      success: true,
      rappels_envoyes: rappelsEnvoyes,
      inactifs_detectes: testeurs.length,
      jours_avant_fin: joursAvantFin,
      skipped,
      failed,
      errors: errors.length ? errors : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[beta-rappel-inactivite]", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});

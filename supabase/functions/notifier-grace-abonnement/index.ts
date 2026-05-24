import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FROM = "LEVE <noreply@levecommunaute.com>";
const YOUTUBE_URL = "https://www.youtube.com/@levecommunaute";
const DEFAULT_APP_URL = "https://levecommunaute.com";
const RESEND_API_URL = "https://api.resend.com/emails";

/** Jours écoulés depuis grace_debut_at auxquels un courriel est envoyé. */
const NOTIFY_ELAPSED_DAYS = [0, 15, 25, 30] as const;
type NotifyDay = (typeof NOTIFY_ELAPSED_DAYS)[number];

type GraceProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  grace_debut_at: string | null;
  grace_expire_at: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getAppUrl(): string {
  return (Deno.env.get("APP_URL") ?? DEFAULT_APP_URL).replace(/\/$/, "");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatGraceExpireAt(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Toronto",
  });
}

/** Jours calendaires écoulés depuis grace_debut_at (fuseau America/Toronto). */
function daysElapsedSinceGraceStart(graceDebutAt: string): number {
  const tz = "America/Toronto";
  const dayKey = (d: Date) =>
    d.toLocaleDateString("en-CA", { timeZone: tz });
  const startMs = Date.parse(dayKey(new Date(graceDebutAt)));
  const nowMs = Date.parse(dayKey(new Date()));
  return Math.round((nowMs - startMs) / 86_400_000);
}

function subjectForDay(elapsed: NotifyDay): string {
  switch (elapsed) {
    case 0:
      return "Votre abonnement LEVE a expiré — vous avez 30 jours pour vous réabonner";
    case 15:
      return "Rappel — il vous reste 15 jours pour vous réabonner";
    case 25:
      return "⚠️ Urgent — 5 jours pour garder votre profil LEVE";
    case 30:
      return "Votre compte LEVE est suspendu";
  }
}

function emailLayout(body: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px 28px;">
        <tr><td>${body}</td></tr>
        <tr><td style="padding-top:28px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;">
          L'équipe LEVE · <a href="${DEFAULT_APP_URL}" style="color:#71717a;">levecommunaute.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function graceBodyHtml(
  displayName: string,
  elapsed: NotifyDay,
  graceExpireAt: string,
): string {
  const name = escapeHtml(displayName.trim() || "membre");
  const expireLabel = escapeHtml(formatGraceExpireAt(graceExpireAt));
  const appUrl = escapeHtml(getAppUrl());

  let intro: string;
  let detail: string;

  switch (elapsed) {
    case 0:
      intro =
        "Votre abonnement YouTube à la chaîne LEVE n'a pas été détecté lors de votre dernière connexion.";
      detail = `Vous disposez d'une <strong>période de grâce de 30 jours</strong> (jusqu'au ${expireLabel}) pour vous réabonner et conserver l'accès complet à votre profil.`;
      break;
    case 15:
      intro = "Ceci est un rappel concernant votre abonnement LEVE.";
      detail = `Il vous reste <strong>15 jours</strong> (jusqu'au ${expireLabel}) pour vous réabonner à la chaîne et éviter la suspension de votre compte.`;
      break;
    case 25:
      intro = "Votre période de grâce touche bientôt à sa fin.";
      detail = `Il ne vous reste que <strong>5 jours</strong> (jusqu'au ${expireLabel}) pour vous réabonner et garder votre profil LEVE.`;
      break;
    case 30:
      intro = "Votre période de grâce est terminée.";
      detail =
        "Votre compte LEVE est maintenant <strong>suspendu</strong>. Réabonnez-vous à la chaîne pour réactiver votre accès.";
      break;
  }

  return emailLayout(`
    <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">LEVE Communauté</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:600;line-height:1.3;">Bonjour ${name},</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${intro}</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${detail}</p>
    <p style="margin:0 0 12px;">
      <a href="${YOUTUBE_URL}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">Réabonnez-vous sur YouTube</a>
    </p>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#52525b;">
      Puis reconnectez-vous sur le site : <a href="${appUrl}" style="color:#18181b;">${appUrl}</a>
    </p>
  `);
}

async function sendResendEmail(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `${res.status}: ${text}` };
  }

  return { ok: true };
}

function isNotifyDay(days: number): days is NotifyDay {
  return (NOTIFY_ELAPSED_DAYS as readonly number[]).includes(days);
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
    return jsonResponse(
      { success: false, error: "Missing RESEND_API_KEY" },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: profiles, error: fetchError } = await supabase
      .from("profiles")
      .select(
        "id, email, display_name, grace_debut_at, grace_expire_at",
      )
      .eq("abonnement_statut", "grace")
      .not("grace_debut_at", "is", null);

    if (fetchError) throw fetchError;

    const members = (profiles ?? []) as GraceProfile[];
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const errors: { user_id: string; error: string }[] = [];

    for (const member of members) {
      const email = String(member.email ?? "").trim();
      const graceDebutAt = member.grace_debut_at;
      const graceExpireAt = member.grace_expire_at;

      if (!email || !graceDebutAt) {
        skipped++;
        continue;
      }

      const elapsed = daysElapsedSinceGraceStart(graceDebutAt);
      if (!isNotifyDay(elapsed)) {
        skipped++;
        continue;
      }

      const expireIso = graceExpireAt ??
        new Date(
          new Date(graceDebutAt).getTime() + 30 * 86_400_000,
        ).toISOString();

      const subject = subjectForDay(elapsed);
      const html = graceBodyHtml(
        member.display_name ?? "",
        elapsed,
        expireIso,
      );

      const result = await sendResendEmail(
        resendKey,
        email,
        subject,
        html,
      );

      if (result.ok) {
        sent++;
        console.info(
          `[notifier-grace-abonnement] sent day ${elapsed} → ${email}`,
        );
      } else {
        failed++;
        errors.push({ user_id: member.id, error: result.error });
        console.error(
          `[notifier-grace-abonnement] Resend ${email}:`,
          result.error,
        );
      }
    }

    return jsonResponse({
      success: true,
      processed: members.length,
      sent,
      skipped,
      failed,
      errors: errors.length ? errors : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[notifier-grace-abonnement]", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});

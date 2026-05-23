import { Resend } from "resend";

const FROM = "LEVE <noreply@levecommunaute.com>";
const YOUTUBE_URL = "https://www.youtube.com/@levecommunaute";
const DEFAULT_APP_URL = "https://levecommunaute.com";

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL).replace(/\/$/, "");
}

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[emails] RESEND_API_KEY manquant");
    return null;
  }
  return new Resend(apiKey);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function formatGraceExpireAt(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Toronto",
  });
}

function graceSubject(joursRestants: number): string {
  switch (joursRestants) {
    case 30:
      return "Votre abonnement LEVE a expiré";
    case 15:
      return "Rappel — Il vous reste 15 jours pour vous réabonner";
    case 5:
      return "⚠️ Urgent — 5 jours pour garder votre profil LEVE";
    case 0:
      return "Votre compte LEVE est suspendu";
    default:
      return `Rappel — Il vous reste ${joursRestants} jour${joursRestants > 1 ? "s" : ""} pour vous réabonner`;
  }
}

function graceBodyHtml(
  displayName: string,
  joursRestants: number,
  graceExpireAt: string,
): string {
  const name = escapeHtml(displayName.trim() || "membre");
  const expireLabel = escapeHtml(formatGraceExpireAt(graceExpireAt));
  const appUrl = escapeHtml(getAppUrl());

  let intro: string;
  let detail: string;

  switch (joursRestants) {
    case 30:
      intro =
        "Votre abonnement YouTube à la chaîne LEVE n'a pas été détecté lors de votre dernière connexion.";
      detail = `Vous disposez d'une <strong>période de grâce de 30 jours</strong> (jusqu'au ${expireLabel}) pour vous réabonner et conserver l'accès complet à votre profil.`;
      break;
    case 15:
      intro = "Ceci est un rappel concernant votre abonnement LEVE.";
      detail = `Il vous reste <strong>15 jours</strong> (jusqu'au ${expireLabel}) pour vous réabonner à la chaîne et éviter la suspension de votre compte.`;
      break;
    case 5:
      intro = "Votre période de grâce touche bientôt à sa fin.";
      detail = `Il ne vous reste que <strong>5 jours</strong> (jusqu'au ${expireLabel}) pour vous réabonner et garder votre profil LEVE.`;
      break;
    case 0:
      intro = "Votre période de grâce est terminée.";
      detail =
        "Votre compte LEVE est maintenant <strong>suspendu</strong>. Réabonnez-vous à la chaîne pour réactiver votre accès.";
      break;
    default:
      intro = "Ceci est un rappel concernant votre abonnement LEVE.";
      detail = `Il vous reste <strong>${joursRestants} jour${joursRestants > 1 ? "s" : ""}</strong> (jusqu'au ${expireLabel}) pour vous réabonner.`;
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

/** Email de bienvenue envoyé à l'inscription. */
export async function sendWelcomeEmail(
  email: string,
  displayName: string,
  numeroMembre: number,
): Promise<void> {
  const to = email.trim();
  if (!to) return;

  const resend = getResend();
  if (!resend) return;

  const name = escapeHtml(displayName.trim() || "membre");
  const numero = escapeHtml(String(numeroMembre));
  const appUrl = escapeHtml(getAppUrl());

  const html = emailLayout(`
    <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">LEVE Communauté</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:600;line-height:1.3;">Bienvenue, ${name} 🎉</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Vous faites maintenant partie de la communauté LEVE. Votre numéro de membre est
      <strong>#${numero}</strong> — conservez-le, il vous identifie parmi les membres.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
      Accédez à votre tableau de bord, gagnez des points et participez aux activités de la communauté.
    </p>
    <p style="margin:0 0 12px;">
      <a href="${appUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">Accéder au site LEVE</a>
    </p>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#52525b;">
      Abonnez-vous aussi à notre chaîne :
      <a href="${YOUTUBE_URL}" style="color:#18181b;">YouTube @levecommunaute</a>
    </p>
  `);

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject: "Bienvenue dans la communauté LEVE 🎉",
      html,
    });
    if (error) {
      console.error("[emails] sendWelcomeEmail:", error.message);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[emails] sendWelcomeEmail:", message);
  }
}

/** Email de période de grâce / suspension selon les jours restants. */
export async function sendGraceEmail(
  email: string,
  displayName: string,
  joursRestants: number,
  graceExpireAt: string,
): Promise<void> {
  const to = email.trim();
  if (!to) return;

  const resend = getResend();
  if (!resend) return;

  const subject = graceSubject(joursRestants);
  const html = graceBodyHtml(displayName, joursRestants, graceExpireAt);

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
    });
    if (error) {
      console.error("[emails] sendGraceEmail:", error.message);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[emails] sendGraceEmail:", message);
  }
}

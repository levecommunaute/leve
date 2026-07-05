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
      return "Votre abonnement LEVE a expiré — vous avez 30 jours pour vous réabonner";
    case 15:
      return "Rappel — il vous reste 15 jours pour vous réabonner";
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
  codeParrainage?: string | null,
): Promise<void> {
  const to = email.trim();
  if (!to) return;

  const resend = getResend();
  if (!resend) return;

  const name = escapeHtml(displayName.trim() || "membre");
  const numero = escapeHtml(String(numeroMembre));
  const appUrl = escapeHtml(getAppUrl());
  const code = codeParrainage?.trim().toUpperCase() ?? "";
  const hasCode = /^LEVE-[A-Z0-9]{6}$/.test(code);
  const codeHtml = hasCode ? escapeHtml(code) : "";
  const referralLink = hasCode
    ? escapeHtml(`${getAppUrl()}?ref=${encodeURIComponent(code)}`)
    : appUrl;

  const parrainageBlock = hasCode
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        Votre code parrainage est <strong style="letter-spacing:0.06em;">${codeHtml}</strong>.
        Partagez-le avec vos amis : <a href="${referralLink}" style="color:#18181b;">${referralLink}</a>
      </p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#15803d;background:#f0fdf4;border-radius:8px;padding:12px 14px;">
        <strong>+10 pts bonus</strong> — gagnez des points PMQ supplémentaires en invitant un ami avec votre code.
      </p>`
    : "";

  const html = emailLayout(`
    <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">LEVE Communauté</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:600;line-height:1.3;">Bienvenue, ${name} 🎉</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Vous faites maintenant partie de la communauté LEVE. Votre numéro de membre est
      <strong>#${numero}</strong> — conservez-le, il vous identifie parmi les membres.
    </p>
    ${parrainageBlock}
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

const BUG_REPORT_TO = "levecommunaute@gmail.com";

const SEVERITE_LABELS: Record<string, string> = {
  P1: "P1 — Bloquant",
  P2: "P2 — Majeur",
  P3: "P3 — Mineur",
};

/** Email de rapport de bug envoyé par un beta testeur. */
export async function sendBetaBugReportEmail(input: {
  page: string;
  description: string;
  severite: string;
  membreId: string | null;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const severiteLabel = SEVERITE_LABELS[input.severite] ?? input.severite;
  const page = escapeHtml(input.page);
  const description = escapeHtml(input.description).replace(/\n/g, "<br />");
  const severite = escapeHtml(severiteLabel);
  const membre = escapeHtml(input.membreId ?? "anonyme");
  const date = escapeHtml(
    new Date().toLocaleString("fr-CA", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/Toronto",
    }),
  );

  const html = emailLayout(`
    <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">LEVE Beta · Rapport de bug</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:600;line-height:1.3;">🐛 Nouveau bug signalé</h1>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:15px;line-height:1.6;">
      <tr><td style="padding:6px 0;color:#71717a;width:140px;">Sévérité</td><td style="padding:6px 0;font-weight:600;">${severite}</td></tr>
      <tr><td style="padding:6px 0;color:#71717a;">Page</td><td style="padding:6px 0;">${page}</td></tr>
      <tr><td style="padding:6px 0;color:#71717a;">Membre</td><td style="padding:6px 0;">${membre}</td></tr>
      <tr><td style="padding:6px 0;color:#71717a;">Date</td><td style="padding:6px 0;">${date}</td></tr>
    </table>
    <p style="margin:20px 0 6px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">Description</p>
    <div style="background:#f4f4f5;border-radius:8px;padding:16px;font-size:15px;line-height:1.6;color:#18181b;">${description}</div>
  `);

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: BUG_REPORT_TO,
      subject: `🐛 [Beta] ${severiteLabel} — ${input.page}`,
      html,
    });
    if (error) {
      console.error("[emails] sendBetaBugReportEmail:", error.message);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[emails] sendBetaBugReportEmail:", message);
  }
}

function formatMonthLabel(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!match) return monthKey;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return date.toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
}

function formatMontantDollars(amount: number): string {
  return Number(amount).toFixed(2);
}

/** Email envoyé après soumission réussie d'un quiz vidéo. */
export async function sendQuizCompletedEmail(
  email: string,
  displayName: string,
  videoTitle: string,
  score: number,
  totalQuestions: number,
  pointsGagnes: number,
  bonusActif: boolean,
): Promise<void> {
  const to = email.trim();
  if (!to) return;

  const resend = getResend();
  if (!resend) return;

  const name = escapeHtml(displayName.trim() || "membre");
  const title = escapeHtml(videoTitle.trim() || "Vidéo LEVE");
  const scoreLabel = escapeHtml(`${score}/${totalQuestions}`);
  const pointsLabel = escapeHtml(String(pointsGagnes));
  const appUrl = escapeHtml(getAppUrl());
  const dashboardUrl = `${appUrl}/dashboard`;

  const bonusBlock = bonusActif
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#15803d;background:#f0fdf4;border-radius:8px;padding:12px 14px;">
        <strong>Bonus 72h actif</strong> — vos points ont été doublés pour cette vidéo.
      </p>`
    : "";

  const html = emailLayout(`
    <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">LEVE Communauté</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:600;line-height:1.3;">Quiz complété 🎯</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Bonjour ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Vous avez terminé le quiz de <strong>${title}</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:15px;line-height:1.6;margin:0 0 20px;">
      <tr><td style="padding:6px 0;color:#71717a;width:160px;">Score</td><td style="padding:6px 0;font-weight:600;">${scoreLabel}</td></tr>
      <tr><td style="padding:6px 0;color:#71717a;">Points gagnés</td><td style="padding:6px 0;font-weight:600;">+${pointsLabel} pts</td></tr>
    </table>
    ${bonusBlock}
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
      Consultez votre tableau de bord pour suivre votre progression et vos points PMQ.
    </p>
    <p style="margin:0 0 12px;">
      <a href="${dashboardUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">Voir mon tableau de bord</a>
    </p>
  `);

  const subject = `🎯 Quiz complété — ${score}/${totalQuestions} · +${pointsGagnes} pts`;

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
    });
    if (error) {
      console.error("[emails] sendQuizCompletedEmail:", error.message);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[emails] sendQuizCompletedEmail:", message);
  }
}

/** Email envoyé après validation réussie d'un code vidéo. */
export async function sendCodeSoumisEmail(
  email: string,
  displayName: string,
  videoTitle: string,
  videoId: string,
): Promise<void> {
  const to = email.trim();
  if (!to) return;

  const resend = getResend();
  if (!resend) return;

  const name = escapeHtml(displayName.trim() || "membre");
  const title = escapeHtml(videoTitle.trim() || "Vidéo LEVE");
  const appUrl = escapeHtml(getAppUrl());
  const videoUrl = `${appUrl}/videos/${escapeHtml(videoId.trim())}`;

  const html = emailLayout(`
    <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">LEVE Communauté</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:600;line-height:1.3;">Code validé 🔑</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Bonjour ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Votre code pour <strong>${title}</strong> a été accepté. Bravo !
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
      Passez maintenant au quiz pour gagner des points PMQ et participer à la redistribution mensuelle.
    </p>
    <p style="margin:0 0 12px;">
      <a href="${videoUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">Faire le quiz maintenant</a>
    </p>
  `);

  const subject = `🔑 Code validé — ${videoTitle.trim() || "Vidéo LEVE"}`;

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
    });
    if (error) {
      console.error("[emails] sendCodeSoumisEmail:", error.message);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[emails] sendCodeSoumisEmail:", message);
  }
}

/** Email envoyé après crédit de redistribution PMQ mensuelle. */
export async function sendRedistributionEmail(
  email: string,
  displayName: string,
  montantCredite: number,
  mois: string,
): Promise<void> {
  const to = email.trim();
  if (!to) return;

  const resend = getResend();
  if (!resend) return;

  const name = escapeHtml(displayName.trim() || "membre");
  const montant = escapeHtml(formatMontantDollars(montantCredite));
  const moisLabel = escapeHtml(formatMonthLabel(mois));
  const appUrl = escapeHtml(getAppUrl());
  const banqueUrl = `${appUrl}/banque`;

  const html = emailLayout(`
    <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">LEVE Communauté</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:600;line-height:1.3;">Redistribution ${moisLabel} 💰</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Bonjour ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      <strong>${montant}&nbsp;$</strong> ont été crédités sur votre banque LEVE pour la redistribution de ${moisLabel}.
    </p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#52525b;">
      <strong>Formule PMQ :</strong> 45&nbsp;% des revenus mensuels de LEVE alimentent le pool PMQ.
      Votre part est calculée proportionnellement à vos points quiz pondérés par rapport au total
      communautaire du mois (points gagnés × votre multiplicateur).
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
      Consultez votre solde et l'historique de vos mouvements sur votre page banque.
    </p>
    <p style="margin:0 0 12px;">
      <a href="${banqueUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">Voir ma banque</a>
    </p>
  `);

  const subject = `💰 Redistribution ${formatMonthLabel(mois)} — ${formatMontantDollars(montantCredite)}$ crédités sur votre banque`;

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
    });
    if (error) {
      console.error("[emails] sendRedistributionEmail:", error.message);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[emails] sendRedistributionEmail:", message);
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

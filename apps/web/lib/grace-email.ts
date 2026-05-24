import { sendGraceEmail } from "./emails";

/** Notification immédiate jour 0 (le cron envoie les rappels J+15, J+25, J+30). */
export async function sendGracePeriodEmail(
  email: string,
  displayName: string,
  graceExpireAt: Date,
): Promise<void> {
  if (!email.trim()) return;

  try {
    await sendGraceEmail(
      email.trim(),
      displayName,
      30,
      graceExpireAt.toISOString(),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[grace-email]", message);
  }
}

import { getServiceSupabase } from "./admin-server";

/** Notification période de grâce via Supabase Edge Function (SMTP projet). */
export async function sendGracePeriodEmail(
  email: string,
  graceExpireAt: Date,
): Promise<void> {
  if (!email.trim()) return;

  try {
    const supabase = getServiceSupabase();
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

    const { error } = await supabase.functions.invoke("notifier-grace-abonnement", {
      body: {
        email: email.trim(),
        grace_expire_at: graceExpireAt.toISOString(),
        app_url: appUrl || undefined,
      },
    });

    if (error) {
      console.error("[grace-email] invoke:", error.message);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[grace-email]", message);
  }
}

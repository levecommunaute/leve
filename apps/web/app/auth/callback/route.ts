import { createServerClient } from "@repo/supabase/server";
import { NextResponse } from "next/server";
import {
  ABONNEMENT_SELECT,
  ADMIN_BYPASS_EMAIL,
  buildActiveSubscriptionPatch,
  buildGraceSubscriptionPatch,
  buildRenewSubscriptionPatch,
  isSubscriptionValid,
  profileHasMembership,
  type ProfileAbonnement,
} from "../../../lib/abonnement";
import { sendGracePeriodEmail } from "../../../lib/grace-email";
import { checkYoutubeSubscription } from "../../../lib/youtube-subscription";

export const dynamic = "force-dynamic";

type AuthMode = "rejoindre" | "connecter";

function parseMode(raw: string | null): AuthMode {
  return raw === "connecter" ? "connecter" : "rejoindre";
}

async function verifyYoutubeFromSession(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const providerToken = session?.provider_token;
  if (!providerToken) return false;
  try {
    return await checkYoutubeSubscription(providerToken);
  } catch (e) {
    console.error("[auth/callback] YouTube:", e);
    return false;
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const mode = parseMode(searchParams.get("mode"));

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=auth`);
  }

  const supabase = await createServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(`${origin}/?error=auth`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/?error=auth`);
  }

  const email = (user.email ?? "").trim().toLowerCase();

  if (email === ADMIN_BYPASS_EMAIL) {
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select(ABONNEMENT_SELECT)
    .eq("id", user.id)
    .maybeSingle();

  const profile = (existingProfile ?? null) as ProfileAbonnement | null;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const displayName =
    typeof meta?.full_name === "string"
      ? meta.full_name
      : email.split("@")[0] || "Membre";

  if (mode === "rejoindre") {
    const subscribed = await verifyYoutubeFromSession(supabase);

    if (!subscribed) {
      return NextResponse.redirect(`${origin}/auth/abonnement-requis`);
    }

    if (profileHasMembership(profile)) {
      return NextResponse.redirect(`${origin}/auth/deja-membre`);
    }

    const now = new Date();
    const { error: insertError } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? null,
        display_name: displayName,
        ...buildActiveSubscriptionPatch(now),
      },
      { onConflict: "id" },
    );

    if (insertError) {
      console.error("[auth/callback] profiles upsert:", insertError.message);
      return NextResponse.redirect(`${origin}/?error=profile`);
    }

    return NextResponse.redirect(`${origin}/dashboard`);
  }

  // mode === "connecter"
  if (!profileHasMembership(profile)) {
    return NextResponse.redirect(`${origin}/?error=no_profile`);
  }

  if (isSubscriptionValid(profile?.abonnement_expire_at)) {
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  const subscribed = await verifyYoutubeFromSession(supabase);
  const now = new Date();

  if (subscribed) {
    const { error: renewError } = await supabase
      .from("profiles")
      .update(buildRenewSubscriptionPatch(now))
      .eq("id", user.id);

    if (renewError) {
      console.error("[auth/callback] renew:", renewError.message);
    }

    return NextResponse.redirect(`${origin}/dashboard`);
  }

  const gracePatch = buildGraceSubscriptionPatch(now);
  const graceExpireAt = new Date(gracePatch.grace_expire_at);

  const { error: graceError } = await supabase
    .from("profiles")
    .update(gracePatch)
    .eq("id", user.id);

  if (graceError) {
    console.error("[auth/callback] grace:", graceError.message);
  }

  if (user.email) {
    await sendGracePeriodEmail(user.email, graceExpireAt);
  }

  return NextResponse.redirect(`${origin}/dashboard?grace=1`);
}

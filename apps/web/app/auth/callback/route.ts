import { createServerClient } from "@repo/supabase/server";
import { NextResponse } from "next/server";
import {
  ABONNEMENT_SELECT,
  ADMIN_BYPASS_EMAIL,
  buildActiveSubscriptionPatch,
  buildGraceSubscriptionPatch,
  buildRenewSubscriptionPatch,
  type ProfileAbonnement,
} from "../../../lib/abonnement";
import { getServiceSupabase } from "../../../lib/admin-server";
import { sendWelcomeEmail } from "../../../lib/emails";
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

    // Membre existant = abonnement_verifie_at renseigné (pas seulement une ligne dans profiles)
    if (profile?.abonnement_verifie_at != null) {
      return NextResponse.redirect(`${origin}/auth/deja-membre`);
    }

    const now = new Date();
    const { error: insertError } = await supabase
      .from("profiles")
      .upsert(
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

    if (user.email) {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("numero_membre, display_name")
        .eq("id", user.id)
        .maybeSingle();

      const numeroRaw = profileRow?.numero_membre;
      const numeroParsed =
        typeof numeroRaw === "number"
          ? numeroRaw
          : typeof numeroRaw === "string"
            ? Number(numeroRaw)
            : NaN;
      const numeroMembre = Number.isFinite(numeroParsed) ? numeroParsed : 0;

      const welcomeName =
        typeof profileRow?.display_name === "string" && profileRow.display_name.trim()
          ? profileRow.display_name
          : displayName;

      console.log("[auth/callback] sendWelcomeEmail before", {
        email: user.email,
        welcomeName,
        numeroMembre,
      });
      await sendWelcomeEmail(user.email, welcomeName, numeroMembre);
      console.log("[auth/callback] sendWelcomeEmail after", {
        email: user.email,
        numeroMembre,
      });
    }

    return NextResponse.redirect(`${origin}/dashboard`);
  }

  // mode === "connecter"
  if (!profile || profile.abonnement_verifie_at == null) {
    if (profile) {
      const svc = getServiceSupabase();
      const { error: banqueError } = await svc
        .from("banque_membres")
        .delete()
        .eq("membre_id", user.id);
      if (banqueError) {
        console.error("[auth/callback] banque_membres delete:", banqueError.message);
      }
      const { error: profileDeleteError } = await svc
        .from("profiles")
        .delete()
        .eq("id", user.id);
      if (profileDeleteError) {
        console.error("[auth/callback] profiles delete:", profileDeleteError.message);
      }
    }
    return NextResponse.redirect(`${origin}/auth/pas-de-compte`);
  }

  const expireAt = profile.abonnement_expire_at ?? null;

  // abonnement_expire_at > NOW() → dashboard sans revérification YouTube
  if (expireAt && new Date(expireAt).getTime() > Date.now()) {
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  // abonnement_expire_at < NOW() (ou absent) → revérifier l'abonnement YouTube
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
    await sendGracePeriodEmail(user.email, displayName, graceExpireAt);
  }

  return NextResponse.redirect(`${origin}/dashboard?grace=true`);
}

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
import {
  generateUniqueReferralCode,
  parseReferralRef,
  processReferralSignup,
} from "../../../lib/parrainage";
import { getClientIp, lookupGeoFromIp } from "../../../lib/geo-ip";
import { checkYoutubeSubscription } from "../../../lib/youtube-subscription";

export const dynamic = "force-dynamic";

type AuthMode = "rejoindre" | "connecter";

type ProfileUpsertPayload = {
  id: string;
  email: string | null;
  display_name: string;
  code_parrainage: string;
  derniere_activite: string;
  pays?: string;
  ville?: string;
  continent?: string;
  is_beta_tester?: boolean;
  numero_membre?: number;
  abonnement_verifie_at: string;
  abonnement_expire_at: string;
  abonnement_statut: "actif";
  grace_debut_at: null;
  grace_expire_at: null;
};

function parseMode(raw: string | null): AuthMode {
  return raw === "connecter" ? "connecter" : "rejoindre";
}

function logProfileError(
  label: string,
  error: { message: string; code?: string; details?: string; hint?: string },
  context?: Record<string, unknown>,
): void {
  console.error(`[auth/callback] ${label}`, {
    message: error.message,
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    ...context,
  });
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

/**
 * Crée / met à jour le profil membre après OAuth Google (mode rejoindre).
 * Utilise le service role pour éviter les échecs silencieux liés au RLS.
 * Vérifie ensuite que la ligne existe bien ; sinon retente une insertion.
 */
async function ensureProfileAfterOAuth(
  userId: string,
  payload: ProfileUpsertPayload,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const svc = getServiceSupabase();

  try {
    const { data: existingNumeroRow, error: existingNumeroError } = await svc
      .from("profiles")
      .select("numero_membre")
      .eq("id", userId)
      .maybeSingle();

    if (existingNumeroError) {
      logProfileError("profiles numero_membre select FAILED", existingNumeroError, {
        userId,
      });
      return { ok: false, reason: existingNumeroError.message };
    }

    const existingNumero = existingNumeroRow?.numero_membre;
    const hasNumero =
      existingNumero != null && String(existingNumero).trim() !== "";

    const profilePayload: ProfileUpsertPayload = { ...payload };

    if (!hasNumero) {
      const { data: nextNumero, error: numeroError } = await svc.rpc(
        "get_next_membre_numero",
      );

      if (numeroError) {
        logProfileError("get_next_membre_numero FAILED", numeroError, {
          userId,
          email: payload.email,
        });
        return { ok: false, reason: numeroError.message };
      }

      const parsed =
        typeof nextNumero === "number"
          ? nextNumero
          : typeof nextNumero === "string"
            ? Number(nextNumero)
            : NaN;

      if (!Number.isFinite(parsed)) {
        console.error("[auth/callback] get_next_membre_numero returned invalid", {
          userId,
          nextNumero,
        });
        return { ok: false, reason: "numero_membre_invalid" };
      }

      profilePayload.numero_membre = parsed;
      console.log("[auth/callback] numero_membre assigned", {
        userId,
        numero_membre: parsed,
      });
    }

    const { error: upsertError } = await svc
      .from("profiles")
      .upsert(profilePayload, {
        onConflict: "id",
      });

    if (upsertError) {
      logProfileError("profiles upsert FAILED", upsertError, {
        userId,
        email: profilePayload.email,
      });
      return { ok: false, reason: upsertError.message };
    }

    const { data: verified, error: verifyError } = await svc
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (verifyError) {
      logProfileError("profiles verify after upsert FAILED", verifyError, {
        userId,
      });
      return { ok: false, reason: verifyError.message };
    }

    if (verified?.id) {
      return { ok: true };
    }

    console.error(
      "[auth/callback] profiles MISSING after upsert — attempting insert",
      { userId, email: profilePayload.email },
    );

    const { error: insertError } = await svc
      .from("profiles")
      .insert(profilePayload);

    if (insertError) {
      logProfileError("profiles insert retry FAILED", insertError, {
        userId,
        email: profilePayload.email,
      });
      return { ok: false, reason: insertError.message };
    }

    const { data: retryVerified, error: retryVerifyError } = await svc
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (retryVerifyError) {
      logProfileError("profiles verify after insert FAILED", retryVerifyError, {
        userId,
      });
      return { ok: false, reason: retryVerifyError.message };
    }

    if (!retryVerified?.id) {
      console.error(
        "[auth/callback] profiles STILL MISSING after insert retry",
        { userId, email: profilePayload.email },
      );
      return { ok: false, reason: "profile_missing_after_insert" };
    }

    console.log("[auth/callback] profiles created via insert retry", {
      userId,
    });
    return { ok: true };
  } catch (e) {
    console.error("[auth/callback] profiles ensure EXCEPTION (not swallowed)", {
      userId,
      email: payload.email,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "profile_ensure_exception",
    };
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const mode = parseMode(searchParams.get("mode"));
  const beta = searchParams.get("beta") === "true";
  const referralRef = parseReferralRef(searchParams.get("ref"));

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

  // Service role : le RLS peut masquer le profil au client utilisateur
  const { data: existingProfile, error: existingProfileError } =
    await getServiceSupabase()
      .from("profiles")
      .select(ABONNEMENT_SELECT)
      .eq("id", user.id)
      .maybeSingle();

  if (existingProfileError) {
    logProfileError("profiles initial select FAILED", existingProfileError, {
      userId: user.id,
      email,
    });
  }

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
      // Lien beta utilisé par un membre existant : on le marque beta testeur
      if (beta) {
        const { error: betaError } = await getServiceSupabase()
          .from("profiles")
          .update({ is_beta_tester: true })
          .eq("id", user.id);
        if (betaError) {
          console.error("[auth/callback] beta flag:", betaError.message);
        }
      }
      return NextResponse.redirect(`${origin}/auth/deja-membre`);
    }

    const now = new Date();
    const svc = getServiceSupabase();
    let referralCode: string;

    try {
      referralCode = await generateUniqueReferralCode(svc);
    } catch (e) {
      console.error("[auth/callback] referral code:", e);
      return NextResponse.redirect(`${origin}/?error=profile`);
    }

    const clientIp = getClientIp(request);
    const geo = await lookupGeoFromIp(clientIp);
    if (geo.pays || geo.ville || geo.continent) {
      console.log("[auth/callback] geo", { ip: clientIp, ...geo });
    }

    const profilePayload: ProfileUpsertPayload = {
      id: user.id,
      email: user.email ?? null,
      display_name: displayName,
      code_parrainage: referralCode,
      derniere_activite: now.toISOString(),
      ...(geo.pays ? { pays: geo.pays } : {}),
      ...(geo.ville ? { ville: geo.ville } : {}),
      ...(geo.continent ? { continent: geo.continent } : {}),
      ...(beta ? { is_beta_tester: true } : {}),
      ...buildActiveSubscriptionPatch(now),
    };

    const ensureResult = await ensureProfileAfterOAuth(user.id, profilePayload);
    if (!ensureResult.ok) {
      console.error("[auth/callback] profiles creation aborted", {
        userId: user.id,
        email: user.email ?? null,
        reason: ensureResult.reason,
      });
      return NextResponse.redirect(`${origin}/?error=profile`);
    }

    if (referralRef) {
      try {
        await processReferralSignup(svc, user.id, referralRef);
      } catch (e) {
        console.error("[auth/callback] parrainage:", e);
      }
    }

    if (user.email) {
      const { data: profileRow } = await svc
        .from("profiles")
        .select("numero_membre, display_name, code_parrainage")
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

      const welcomeCode =
        parseReferralRef(
          typeof profileRow?.code_parrainage === "string"
            ? profileRow.code_parrainage
            : referralCode,
        ) ?? referralCode;

      console.log("[auth/callback] sendWelcomeEmail before", {
        email: user.email,
        welcomeName,
        numeroMembre,
        referralCode: welcomeCode,
      });
      await sendWelcomeEmail(user.email, welcomeName, numeroMembre, welcomeCode);
      console.log("[auth/callback] sendWelcomeEmail after", {
        email: user.email,
        numeroMembre,
      });
    }

    return NextResponse.redirect(`${origin}/dashboard`);
  }

  // mode === "connecter" — lecture + nettoyage via service role (RLS peut masquer le profil)
  const svc = getServiceSupabase();
  const { data: connecterProfileRow } = await svc
    .from("profiles")
    .select(ABONNEMENT_SELECT)
    .eq("id", user.id)
    .maybeSingle();

  const connecterProfile = (connecterProfileRow ?? null) as ProfileAbonnement | null;

  if (!connecterProfile || connecterProfile.abonnement_verifie_at == null) {
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

    return NextResponse.redirect(`${origin}/auth/pas-de-compte`);
  }

  const expireAt = connecterProfile.abonnement_expire_at ?? null;

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

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import {
  isPhotoAvatar,
  isPresetAvatar,
  PRESET_AVATARS,
} from "../../../../lib/avatar";
import {
  ageBracketFromIso,
  parseIsoDate,
} from "../../../../lib/date-naissance";
<<<<<<< HEAD
import { sendMethodeRetraitChangeeEmail } from "../../../../lib/emails";
=======
>>>>>>> main

export const dynamic = "force-dynamic";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const MAX_MESSAGE_DON = 200;
const MAX_TEXT = 500;
const MAX_TELEPHONE = 40;
const MAX_ADRESSE = 500;
const MAX_IDENTIFIANT = 200;
const MAX_AVATAR_URL = 500;

const RETRAIT_METHODES = [
  "MonCash",
  "Xoom",
  "Remitly",
  "TAKSIMOTO",
  "Virement",
] as const;

type RetraitMethode = (typeof RETRAIT_METHODES)[number];

const SELECT_FIELDS =
  "display_name, profil_public, message_don, avatar_url, nom_legal, date_naissance, pays_residence_fiscale, telephone, adresse, palier_verification, profil_verifie_at, retrait_methode, retrait_identifiant, retrait_gele_jusqua, notif_quiz, notif_redistribution, notif_concours";

async function resolveAuthUser(
  request: NextRequest,
): Promise<{ uid: string } | NextResponse> {
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();

  if (bearer) {
    const authClient = createClient(SB_URL, SB_ANON);
    const {
      data: { user },
      error,
    } = await authClient.auth.getUser(bearer);
    if (error || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    return { uid: user.id };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  return { uid: user.id };
}

function isRetraitMethode(value: string): value is RetraitMethode {
  return (RETRAIT_METHODES as readonly string[]).includes(value);
}

function parseOptionalString(
  value: unknown,
  field: string,
  maxLen: number,
  allowEmpty = true,
): string | null | NextResponse {
  if (value === null) return null;
  if (typeof value !== "string") {
    return NextResponse.json(
      { error: `${field} doit être une chaîne ou null` },
      { status: 400 },
    );
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    return NextResponse.json(
      { error: `${field} ne peut pas dépasser ${maxLen} caractères` },
      { status: 400 },
    );
  }
  if (!allowEmpty && trimmed.length === 0) {
    return NextResponse.json(
      { error: `${field} est requis` },
      { status: 400 },
    );
  }
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalDate(
  value: unknown,
  field: string,
): string | null | NextResponse {
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    return NextResponse.json(
      { error: `${field} doit être une date (YYYY-MM-DD) ou null` },
      { status: 400 },
    );
  }
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return NextResponse.json(
      { error: `${field} doit être une date valide au format YYYY-MM-DD` },
      { status: 400 },
    );
  }
  if (ageBracketFromIso(parsed.iso) === "under12") {
    return NextResponse.json(
      {
        error: "Vous devez avoir au moins 12 ans pour rejoindre LEVE.",
      },
      { status: 400 },
    );
  }
  return parsed.iso;
}

function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await resolveAuthUser(request);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  let gelRetrait = false;
  let gelJusqua: string | null = null;
  let logAction: string | null = null;
  const logDetails: Record<string, unknown> = {};

  if (body.display_name !== undefined) {
    const v = parseOptionalString(body.display_name, "display_name", 80, false);
    if (v instanceof NextResponse) return v;
    update.display_name = v;
    logAction = "profil_public";
    logDetails.display_name = true;
  }

  if (body.profil_public !== undefined) {
    if (typeof body.profil_public !== "boolean") {
      return NextResponse.json(
        { error: "profil_public doit être un booléen" },
        { status: 400 },
      );
    }
    update.profil_public = body.profil_public;
    logAction = "profil_public";
    logDetails.profil_public = body.profil_public;
  }

  if (body.message_don !== undefined) {
    const v = parseOptionalString(body.message_don, "message_don", MAX_MESSAGE_DON);
    if (v instanceof NextResponse) return v;
    update.message_don = v;
    logAction = "profil_public";
    logDetails.message_don = true;
  }

  if (body.avatar_url !== undefined) {
    if (body.avatar_url === null || body.avatar_url === "") {
      update.avatar_url = null;
      logAction = "profil_avatar";
      logDetails.avatar_mode = "initiales";
    } else if (typeof body.avatar_url === "string") {
      const trimmed = body.avatar_url.trim();
      if (trimmed.length > MAX_AVATAR_URL) {
        return NextResponse.json(
          { error: `avatar_url ne peut pas dépasser ${MAX_AVATAR_URL} caractères` },
          { status: 400 },
        );
      }
      if (isPresetAvatar(trimmed)) {
        update.avatar_url = trimmed;
        logAction = "profil_avatar";
        logDetails.avatar_mode = "avatar";
        logDetails.avatar_url = trimmed;
      } else if (isPhotoAvatar(trimmed)) {
        // Les photos doivent passer par /api/membres/avatar (upload Storage).
        // On autorise quand même une URL déjà hébergée sur notre bucket.
        const allowedHost = SB_URL.replace(/^https?:\/\//, "");
        let ok = false;
        try {
          const u = new URL(trimmed);
          ok =
            u.hostname === allowedHost ||
            u.pathname.includes("/storage/v1/object/public/avatars/");
        } catch {
          ok = false;
        }
        if (!ok) {
          return NextResponse.json(
            { error: "URL photo invalide — utilisez l'upload photo" },
            { status: 400 },
          );
        }
        update.avatar_url = trimmed;
        logAction = "profil_avatar";
        logDetails.avatar_mode = "photo";
      } else {
        return NextResponse.json(
          {
            error: `avatar_url doit être null, un emoji parmi ${PRESET_AVATARS.join(" ")} ou une URL photo`,
          },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "avatar_url doit être une chaîne ou null" },
        { status: 400 },
      );
    }
  }

  if (body.nom_legal !== undefined) {
    const v = parseOptionalString(body.nom_legal, "nom_legal", MAX_TEXT);
    if (v instanceof NextResponse) return v;
    update.nom_legal = v;
    logAction = "profil_identite";
  }

  if (body.date_naissance !== undefined) {
    const v = parseOptionalDate(body.date_naissance, "date_naissance");
    if (v instanceof NextResponse) return v;
    update.date_naissance = v;
    logAction = "profil_identite";
  }

  if (body.pays_residence_fiscale !== undefined) {
    const v = parseOptionalString(
      body.pays_residence_fiscale,
      "pays_residence_fiscale",
      120,
    );
    if (v instanceof NextResponse) return v;
    update.pays_residence_fiscale = v;
    logAction = "profil_identite";
  }

  if (body.telephone !== undefined) {
    const v = parseOptionalString(body.telephone, "telephone", MAX_TELEPHONE);
    if (v instanceof NextResponse) return v;
    update.telephone = v;
    logAction = "profil_identite";
  }

  if (body.adresse !== undefined) {
    const v = parseOptionalString(body.adresse, "adresse", MAX_ADRESSE);
    if (v instanceof NextResponse) return v;
    update.adresse = v;
    logAction = "profil_identite";
  }

  if (body.retrait_methode !== undefined) {
    if (body.retrait_methode === null || body.retrait_methode === "") {
      update.retrait_methode = null;
      gelRetrait = true;
      logAction = "profil_retrait";
    } else if (typeof body.retrait_methode === "string") {
      const methode = body.retrait_methode.trim();
      if (!isRetraitMethode(methode)) {
        return NextResponse.json(
          {
            error:
              "retrait_methode doit être MonCash, Xoom, Remitly, TAKSIMOTO ou Virement",
          },
          { status: 400 },
        );
      }
      update.retrait_methode = methode;
      gelRetrait = true;
      logAction = "profil_retrait";
      logDetails.retrait_methode = methode;
    } else {
      return NextResponse.json(
        { error: "retrait_methode doit être une chaîne ou null" },
        { status: 400 },
      );
    }
  }

  if (body.retrait_identifiant !== undefined) {
    const v = parseOptionalString(
      body.retrait_identifiant,
      "retrait_identifiant",
      MAX_IDENTIFIANT,
    );
    if (v instanceof NextResponse) return v;
    update.retrait_identifiant = v;
    gelRetrait = true;
    logAction = "profil_retrait";
    logDetails.retrait_identifiant = true;
  }

  if (body.notif_quiz !== undefined) {
    if (typeof body.notif_quiz !== "boolean") {
      return NextResponse.json(
        { error: "notif_quiz doit être un booléen" },
        { status: 400 },
      );
    }
    update.notif_quiz = body.notif_quiz;
    logAction = "profil_notifications";
  }

  if (body.notif_redistribution !== undefined) {
    if (typeof body.notif_redistribution !== "boolean") {
      return NextResponse.json(
        { error: "notif_redistribution doit être un booléen" },
        { status: 400 },
      );
    }
    update.notif_redistribution = body.notif_redistribution;
    logAction = "profil_notifications";
  }

  if (body.notif_concours !== undefined) {
    if (typeof body.notif_concours !== "boolean") {
      return NextResponse.json(
        { error: "notif_concours doit être un booléen" },
        { status: 400 },
      );
    }
    update.notif_concours = body.notif_concours;
    logAction = "profil_notifications";
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "Aucun champ à mettre à jour" },
      { status: 400 },
    );
  }

  const svc = getServiceSupabase();

  if (gelRetrait) {
    const { data: current, error: currentErr } = await svc
      .from("profiles")
      .select("retrait_methode, retrait_identifiant")
      .eq("id", auth.uid)
      .maybeSingle();

    if (currentErr) {
      return NextResponse.json({ error: currentErr.message }, { status: 500 });
    }

    const nextMethode =
      update.retrait_methode !== undefined
        ? (update.retrait_methode as string | null)
        : ((current?.retrait_methode as string | null) ?? null);
    const nextIdentifiant =
      update.retrait_identifiant !== undefined
        ? (update.retrait_identifiant as string | null)
        : ((current?.retrait_identifiant as string | null) ?? null);

    const prevMethode =
      typeof current?.retrait_methode === "string"
        ? current.retrait_methode
        : null;
    const prevIdentifiant =
      typeof current?.retrait_identifiant === "string"
        ? current.retrait_identifiant
        : null;

    const methodeChanged = nextMethode !== prevMethode;
    const identifiantChanged = nextIdentifiant !== prevIdentifiant;

    if (methodeChanged || identifiantChanged) {
      const gele = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      update.retrait_gele_jusqua = gele;
      gelJusqua = gele;
      logDetails.retrait_gele_jusqua = gele;
      logDetails.retrait_methode = nextMethode;
      logDetails.retrait_identifiant_change = identifiantChanged;
      logAction = "methode_retrait_changee";
    } else {
      gelRetrait = false;
    }
  }

  const { data, error } = await svc
    .from("profiles")
    .update(update)
    .eq("id", auth.uid)
    .select(SELECT_FIELDS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
  }

  if (logAction) {
    await svc.from("securite_journal").insert({
      membre_id: auth.uid,
      action: logAction,
      details: logDetails,
      ip: clientIp(request),
    });
  }

  if (gelRetrait && gelJusqua) {
    const [{ data: authUser }, { data: contact }] = await Promise.all([
      svc.auth.admin.getUserById(auth.uid),
      svc
        .from("profiles")
        .select("email, display_name, retrait_methode")
        .eq("id", auth.uid)
        .maybeSingle(),
    ]);
    const memberEmail = String(
      contact?.email ?? authUser?.user?.email ?? "",
    ).trim();
    const displayName =
      typeof contact?.display_name === "string" ? contact.display_name : "";
    const methode =
      typeof contact?.retrait_methode === "string"
        ? contact.retrait_methode
        : null;
    void sendMethodeRetraitChangeeEmail(
      memberEmail,
      displayName,
      gelJusqua,
      methode,
    );
  }

  return NextResponse.json({
    success: true,
    ...data,
  });
}

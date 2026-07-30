import { createHash, randomInt } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import {
  activerDelaiSecurite,
  type RetraitRow,
} from "../../../../lib/banque-retrait-securite";
import { sendRetraitCodeEmail, sendRetraitStatutEmail } from "../../../../lib/emails";
import { roundUSD } from "../../../../lib/frais-plateforme";

export const dynamic = "force-dynamic";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const MIN_RETRAIT_CAD = 100;
const CODE_TTL_MS = 10 * 60 * 1000;
const DELAY_MS = 24 * 60 * 60 * 1000;
const MAX_TENTATIVES = 3;

async function resolveAuthUser(
  request: NextRequest,
): Promise<{ uid: string; email: string | null } | NextResponse> {
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
    return { uid: user.id, email: user.email ?? null };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  return { uid: user.id, email: user.email ?? null };
}

function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

function hashCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

function generateSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** POST — génère un code email 6 chiffres et crée la demande de retrait. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await resolveAuthUser(request);
  if (auth instanceof NextResponse) return auth;

  let body: { membre_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const membreId = typeof body.membre_id === "string" ? body.membre_id.trim() : "";
  if (!membreId || membreId !== auth.uid) {
    return NextResponse.json({ error: "membre_id invalide" }, { status: 403 });
  }

  const supabase = getServiceSupabase();

  const { data: profil, error: profilError } = await supabase
    .from("profiles")
    .select(
      "display_name, email, nom_legal, telephone, pays_residence_fiscale, retrait_methode, retrait_identifiant, retrait_gele_jusqua",
    )
    .eq("id", membreId)
    .maybeSingle();

  if (profilError) {
    return NextResponse.json({ error: profilError.message }, { status: 500 });
  }

  const nomLegal =
    typeof profil?.nom_legal === "string" ? profil.nom_legal.trim() : "";
  const telephone =
    typeof profil?.telephone === "string" ? profil.telephone.trim() : "";
  const paysFiscal =
    typeof profil?.pays_residence_fiscale === "string"
      ? profil.pays_residence_fiscale.trim()
      : "";
  if (!nomLegal || !telephone || !paysFiscal) {
    return NextResponse.json(
      {
        error:
          "Complétez votre profil (nom légal, téléphone, pays de résidence fiscale) pour effectuer un retrait",
        redirect: "/profil?onglet=identite",
      },
      { status: 400 },
    );
  }

  const geleUntil =
    typeof profil?.retrait_gele_jusqua === "string"
      ? profil.retrait_gele_jusqua
      : null;
  if (geleUntil && new Date(geleUntil).getTime() > Date.now()) {
    return NextResponse.json(
      {
        error: `Retraits gelés jusqu'au ${geleUntil}`,
        retrait_gele_jusqua: geleUntil,
      },
      { status: 403 },
    );
  }

  const methode =
    typeof profil?.retrait_methode === "string"
      ? profil.retrait_methode.trim()
      : "";
  const identifiant =
    typeof profil?.retrait_identifiant === "string"
      ? profil.retrait_identifiant.trim()
      : "";
  if (!methode || !identifiant) {
    return NextResponse.json(
      {
        error: "Définissez une méthode et un identifiant de retrait dans votre profil",
        redirect: "/profil?onglet=retrait",
      },
      { status: 400 },
    );
  }

  const { data: pending } = await supabase
    .from("retraits")
    .select("id, statut")
    .eq("membre_id", membreId)
    .in("statut", ["en_attente", "code_confirme", "delai_securite"])
    .limit(5);

  const blocking = (pending ?? []).filter(
    (r) => r.statut === "code_confirme" || r.statut === "delai_securite",
  );
  if (blocking.length > 0) {
    return NextResponse.json(
      {
        error:
          "Un retrait est déjà en cours. Attendez la fin du délai ou annulez-le.",
        retrait_id: blocking[0]?.id,
      },
      { status: 409 },
    );
  }

  // Annuler les anciennes demandes en_attente (nouveau code)
  const staleIds = (pending ?? [])
    .filter((r) => r.statut === "en_attente")
    .map((r) => r.id);
  if (staleIds.length > 0) {
    await supabase
      .from("retraits")
      .update({
        statut: "annule",
        annule_at: new Date().toISOString(),
        annule_par: "remplace_par_nouveau_code",
      })
      .in("id", staleIds);
  }

  const { data: banque, error: banqueError } = await supabase
    .from("banque_membres")
    .select("solde_dollars")
    .eq("membre_id", membreId)
    .maybeSingle();

  if (banqueError) {
    return NextResponse.json({ error: banqueError.message }, { status: 500 });
  }

  const montant = roundUSD(Number(banque?.solde_dollars ?? 0));
  if (montant < MIN_RETRAIT_CAD) {
    return NextResponse.json(
      { error: `Minimum ${MIN_RETRAIT_CAD.toFixed(2)} $ requis pour un retrait` },
      { status: 400 },
    );
  }

  const code = generateSixDigitCode();
  const codeHash = hashCode(code);
  const now = Date.now();
  const codeExpireAt = new Date(now + CODE_TTL_MS).toISOString();

  const { data: created, error: insertErr } = await supabase
    .from("retraits")
    .insert({
      membre_id: membreId,
      montant,
      methode,
      identifiant_destination: identifiant,
      statut: "en_attente",
      code_confirmation: codeHash,
      code_expire_at: codeExpireAt,
      code_tentatives: 0,
    })
    .select("id, code_expire_at, montant")
    .maybeSingle();

  if (insertErr || !created) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Impossible de créer la demande" },
      { status: 500 },
    );
  }

  await supabase.from("securite_journal").insert({
    membre_id: membreId,
    action: "retrait_code_envoye",
    details: { retrait_id: created.id, montant },
    ip: clientIp(request),
  });

  const memberEmail = String(profil?.email ?? auth.email ?? "").trim();
  const displayName =
    typeof profil?.display_name === "string" ? profil.display_name : "";
  void sendRetraitCodeEmail(
    memberEmail,
    displayName,
    code,
    montant,
    codeExpireAt,
  );

  return NextResponse.json({
    sent: true,
    retrait_id: created.id,
    code_expire_at: created.code_expire_at,
    montant: Number(created.montant),
  });
}

/** PUT — vérifie le code email ; si valide → code_confirme + délai 24h. */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = await resolveAuthUser(request);
  if (auth instanceof NextResponse) return auth;

  let body: { membre_id?: string; retrait_id?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const membreId = typeof body.membre_id === "string" ? body.membre_id.trim() : "";
  const retraitId =
    typeof body.retrait_id === "string" ? body.retrait_id.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!membreId || membreId !== auth.uid) {
    return NextResponse.json({ error: "membre_id invalide" }, { status: 403 });
  }
  if (!retraitId) {
    return NextResponse.json({ error: "retrait_id requis" }, { status: 400 });
  }
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "Le code doit contenir 6 chiffres" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();

  const { data: retrait, error: retraitErr } = await supabase
    .from("retraits")
    .select(
      "id, membre_id, montant, statut, code_confirmation, code_expire_at, code_tentatives",
    )
    .eq("id", retraitId)
    .eq("membre_id", membreId)
    .maybeSingle();

  if (retraitErr) {
    return NextResponse.json({ error: retraitErr.message }, { status: 500 });
  }
  if (!retrait) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }
  if (retrait.statut !== "en_attente") {
    return NextResponse.json(
      { error: "Cette demande n'attend plus de code" },
      { status: 400 },
    );
  }

  const tentatives = Number(retrait.code_tentatives ?? 0);
  if (tentatives >= MAX_TENTATIVES) {
    return NextResponse.json(
      {
        error: "Trop de tentatives — demande bloquée. Relancez un nouveau code.",
        tentatives,
        blocked: true,
      },
      { status: 429 },
    );
  }

  const expireAt = retrait.code_expire_at
    ? new Date(retrait.code_expire_at).getTime()
    : 0;
  if (!expireAt || expireAt < Date.now()) {
    return NextResponse.json(
      { error: "Code expiré — demandez un nouveau code" },
      { status: 400 },
    );
  }

  const expectedHash =
    typeof retrait.code_confirmation === "string"
      ? retrait.code_confirmation
      : "";
  const submittedHash = hashCode(code);

  if (!expectedHash || submittedHash !== expectedHash) {
    const nextTentatives = tentatives + 1;
    await supabase
      .from("retraits")
      .update({ code_tentatives: nextTentatives })
      .eq("id", retraitId);

    if (nextTentatives >= MAX_TENTATIVES) {
      await supabase
        .from("retraits")
        .update({
          statut: "annule",
          annule_at: new Date().toISOString(),
          annule_par: "trop_tentatives_code",
        })
        .eq("id", retraitId);

      await supabase.from("securite_journal").insert({
        membre_id: membreId,
        action: "retrait_code_bloque",
        details: { retrait_id: retraitId, tentatives: nextTentatives },
        ip: clientIp(request),
      });

      return NextResponse.json(
        {
          error: "Trop de tentatives — demande annulée. Relancez un nouveau code.",
          tentatives: nextTentatives,
          blocked: true,
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      {
        error: `Code invalide (${nextTentatives}/${MAX_TENTATIVES} tentatives)`,
        tentatives: nextTentatives,
      },
      { status: 400 },
    );
  }

  const executableAPartirDe = new Date(Date.now() + DELAY_MS).toISOString();

  const { data: updated, error: updateErr } = await supabase
    .from("retraits")
    .update({
      statut: "code_confirme",
      executable_a_partir_de: executableAPartirDe,
      code_confirmation: null,
      code_expire_at: null,
    })
    .eq("id", retraitId)
    .eq("statut", "en_attente")
    .select("id, membre_id, montant, methode, statut, executable_a_partir_de")
    .maybeSingle();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: updateErr?.message ?? "Impossible de confirmer le code" },
      { status: 500 },
    );
  }

  const ip = clientIp(request);

  await supabase.from("securite_journal").insert({
    membre_id: membreId,
    action: "retrait_code_confirme",
    details: {
      retrait_id: retraitId,
      executable_a_partir_de: executableAPartirDe,
    },
    ip,
  });

  const { data: profil } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", membreId)
    .maybeSingle();

  const memberEmail = String(profil?.email ?? auth.email ?? "").trim();
  const displayName =
    typeof profil?.display_name === "string" ? profil.display_name : "";
  void sendRetraitStatutEmail(
    memberEmail,
    displayName,
    "code_confirme",
    Number(updated.montant),
    executableAPartirDe,
  );

  // Élément 2 — activer le délai 24h immédiatement après confirmation du code
  const delai = await activerDelaiSecurite(
    supabase,
    updated as RetraitRow,
    ip,
    auth.email,
  );

  if (!delai.ok) {
    // Code déjà confirmé — le frontend peut retenter l'activation du délai
    return NextResponse.json({
      success: true,
      code_confirme: true,
      delai_actif: false,
      error: delai.error,
      retrait_id: updated.id,
      statut: updated.statut,
      executable_a_partir_de: updated.executable_a_partir_de,
      montant: Number(updated.montant),
    });
  }

  return NextResponse.json({
    success: true,
    code_confirme: true,
    delai_actif: true,
    retrait_id: delai.row.id,
    statut: delai.row.statut,
    executable_a_partir_de: delai.row.executable_a_partir_de,
    montant: Number(delai.row.montant),
    frais_plateforme: delai.frais,
    frais_plateforme_pct: delai.pourcentage,
    net: delai.net,
  });
}

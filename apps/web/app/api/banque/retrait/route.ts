import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import {
  activerDelaiSecurite,
  executerRetraitsPrets,
  memberContact,
  type RetraitRow,
} from "../../../../lib/banque-retrait-securite";
import {
  ageBracketFromIso,
  retraitAgeGate,
} from "../../../../lib/date-naissance";
import { sendRetraitStatutEmail } from "../../../../lib/emails";
import { roundUSD } from "../../../../lib/frais-plateforme";

export const dynamic = "force-dynamic";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

/** GET — liste les retraits en cours + exécute ceux dont le délai est passé. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await resolveAuthUser(request);
  if (auth instanceof NextResponse) return auth;

  const supabase = getServiceSupabase();
  const ip = clientIp(request);

  const execResult = await executerRetraitsPrets(
    supabase,
    auth.uid,
    auth.email,
    ip,
  );

  const { data, error } = await supabase
    .from("retraits")
    .select(
      "id, montant, methode, identifiant_destination, statut, executable_a_partir_de, code_expire_at, created_at, execute_at, annule_at",
    )
    .eq("membre_id", auth.uid)
    .in("statut", ["en_attente", "code_confirme", "delai_securite"])
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    retraits: data ?? [],
    executed: execResult.executed,
    exec_errors: execResult.errors,
  });
}

/**
 * POST — après code confirmé : passe en delai_securite (hold fonds).
 * Vérifie aussi les retraits prêts à exécuter.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await resolveAuthUser(request);
  if (auth instanceof NextResponse) return auth;

  let body: { membre_id?: string; retrait_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const membreId = typeof body.membre_id === "string" ? body.membre_id.trim() : "";
  const retraitId =
    typeof body.retrait_id === "string" ? body.retrait_id.trim() : "";

  if (!membreId || membreId !== auth.uid) {
    return NextResponse.json({ error: "membre_id invalide" }, { status: 403 });
  }

  const supabase = getServiceSupabase();
  const ip = clientIp(request);

  const execResult = await executerRetraitsPrets(
    supabase,
    membreId,
    auth.email,
    ip,
  );

  if (!retraitId) {
    return NextResponse.json({
      success: true,
      executed: execResult.executed,
      exec_errors: execResult.errors,
    });
  }

  // Contrôles profil / âge (main) avant activation du délai de sécurité
  const { data: profilSecu, error: profilSecuError } = await supabase
    .from("profiles")
    .select(
      "nom_legal, date_naissance, telephone, pays_residence_fiscale, retrait_methode, retrait_gele_jusqua",
    )
    .eq("id", membreId)
    .maybeSingle();

  if (profilSecuError) {
    return NextResponse.json({ error: profilSecuError.message }, { status: 500 });
  }

  const nomLegal =
    typeof profilSecu?.nom_legal === "string" ? profilSecu.nom_legal.trim() : "";
  const telephone =
    typeof profilSecu?.telephone === "string" ? profilSecu.telephone.trim() : "";
  const paysFiscal =
    typeof profilSecu?.pays_residence_fiscale === "string"
      ? profilSecu.pays_residence_fiscale.trim()
      : "";
  const dateNaissance =
    typeof profilSecu?.date_naissance === "string"
      ? profilSecu.date_naissance.trim()
      : "";
  if (!nomLegal || !telephone || !paysFiscal || !dateNaissance) {
    return NextResponse.json(
      {
        error:
          "Complétez votre profil (nom légal, date de naissance, téléphone, pays de résidence fiscale) pour effectuer un retrait",
        redirect: "/profil?onglet=identite",
      },
      { status: 400 },
    );
  }

  const ageBracket = ageBracketFromIso(dateNaissance);
  if (!ageBracket) {
    return NextResponse.json(
      {
        error: "Date de naissance invalide — mettez à jour votre profil",
        redirect: "/profil?onglet=identite",
      },
      { status: 400 },
    );
  }
  const ageGate = retraitAgeGate(ageBracket);
  if (!ageGate.allowNormal) {
    return NextResponse.json(
      { error: ageGate.message ?? "Retrait non autorisé" },
      { status: 403 },
    );
  }

  const geleUntil =
    typeof profilSecu?.retrait_gele_jusqua === "string"
      ? profilSecu.retrait_gele_jusqua
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
    typeof profilSecu?.retrait_methode === "string"
      ? profilSecu.retrait_methode.trim()
      : "";
  if (!methode) {
    return NextResponse.json(
      {
        error: "Définissez une méthode de retrait dans votre profil",
        redirect: "/profil?onglet=retrait",
      },
      { status: 400 },
    );
  }

  const { data: retrait, error: retraitErr } = await supabase
    .from("retraits")
    .select(
      "id, membre_id, montant, methode, statut, executable_a_partir_de",
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

  if (retrait.statut === "delai_securite") {
    return NextResponse.json({
      success: true,
      retrait,
      already_active: true,
      executed: execResult.executed,
    });
  }

  const result = await activerDelaiSecurite(
    supabase,
    retrait as RetraitRow,
    ip,
    auth.email,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  const montant = roundUSD(Number(result.row.montant));

  return NextResponse.json({
    success: true,
    retrait: result.row,
    montant,
    frais_plateforme: result.frais,
    frais_plateforme_pct: result.pourcentage,
    net: result.net,
    executable_a_partir_de: result.row.executable_a_partir_de,
    executed: execResult.executed,
  });
}

/** DELETE — annule un retrait en delai_securite et rétabli le solde. */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await resolveAuthUser(request);
  if (auth instanceof NextResponse) return auth;

  let body: { membre_id?: string; retrait_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const membreId = typeof body.membre_id === "string" ? body.membre_id.trim() : "";
  const retraitId =
    typeof body.retrait_id === "string" ? body.retrait_id.trim() : "";

  if (!membreId || membreId !== auth.uid) {
    return NextResponse.json({ error: "membre_id invalide" }, { status: 403 });
  }
  if (!retraitId) {
    return NextResponse.json({ error: "retrait_id requis" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  const { data: retrait, error: retraitErr } = await supabase
    .from("retraits")
    .select("id, membre_id, montant, statut")
    .eq("id", retraitId)
    .eq("membre_id", membreId)
    .maybeSingle();

  if (retraitErr) {
    return NextResponse.json({ error: retraitErr.message }, { status: 500 });
  }
  if (!retrait) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }

  if (retrait.statut !== "delai_securite" && retrait.statut !== "code_confirme") {
    return NextResponse.json(
      { error: "Ce retrait ne peut plus être annulé" },
      { status: 400 },
    );
  }

  const montant = roundUSD(Number(retrait.montant));
  const now = new Date().toISOString();
  const wasHeld = retrait.statut === "delai_securite";

  const { error: updateErr } = await supabase
    .from("retraits")
    .update({
      statut: "annule",
      annule_at: now,
      annule_par: "membre",
    })
    .eq("id", retraitId)
    .in("statut", ["delai_securite", "code_confirme"]);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (wasHeld) {
    const { data: banque } = await supabase
      .from("banque_membres")
      .select("solde_dollars")
      .eq("membre_id", membreId)
      .maybeSingle();

    const solde = roundUSD(Number(banque?.solde_dollars ?? 0));
    await supabase
      .from("banque_membres")
      .update({
        solde_dollars: roundUSD(solde + montant),
        updated_at: now,
      })
      .eq("membre_id", membreId);

    await supabase.from("banque_membres_mouvements").insert({
      membre_id: membreId,
      montant,
      type: "retrait_annule",
      description: "Annulation retrait — délai de sécurité",
    });
  }

  await supabase.from("securite_journal").insert({
    membre_id: membreId,
    action: "retrait_annule",
    details: { retrait_id: retraitId, montant, was_held: wasHeld },
    ip: clientIp(request),
  });

  const contact = await memberContact(supabase, membreId, auth.email);
  void sendRetraitStatutEmail(
    contact.email,
    contact.displayName,
    "annule",
    montant,
    null,
  );

  return NextResponse.json({ success: true, statut: "annule", montant });
}

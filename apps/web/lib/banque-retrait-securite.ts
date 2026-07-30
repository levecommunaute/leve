import { sendRetraitStatutEmail } from "./emails";
import {
  calculerFraisPlateforme,
  crediterFraisPlateformeBalance,
  roundUSD,
} from "./frais-plateforme";
import { getServiceSupabase } from "./admin-server";

export type RetraitRow = {
  id: string;
  membre_id: string;
  montant: number | string;
  methode: string;
  statut: string;
  executable_a_partir_de: string | null;
};

type ServiceClient = ReturnType<typeof getServiceSupabase>;

export async function memberContact(
  supabase: ServiceClient,
  membreId: string,
  fallbackEmail: string | null,
): Promise<{ email: string; displayName: string }> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", membreId)
    .maybeSingle();
  return {
    email: String(data?.email ?? fallbackEmail ?? "").trim(),
    displayName:
      typeof data?.display_name === "string" ? data.display_name : "",
  };
}

/** Débite le solde + mouvement + active statut delai_securite. */
export async function activerDelaiSecurite(
  supabase: ServiceClient,
  retrait: RetraitRow,
  ip: string | null,
  authEmail: string | null,
): Promise<
  { ok: true; row: RetraitRow; frais: number; net: number; pourcentage: number } | {
    ok: false;
    error: string;
    status: number;
  }
> {
  if (retrait.statut !== "code_confirme") {
    return {
      ok: false,
      error: "Le code doit être confirmé avant le délai de sécurité",
      status: 400,
    };
  }

  const { data: profilSecu, error: profilSecuError } = await supabase
    .from("profiles")
    .select("retrait_gele_jusqua")
    .eq("id", retrait.membre_id)
    .maybeSingle();

  if (profilSecuError) {
    return { ok: false, error: profilSecuError.message, status: 500 };
  }

  const geleUntil =
    typeof profilSecu?.retrait_gele_jusqua === "string"
      ? profilSecu.retrait_gele_jusqua
      : null;
  if (geleUntil && new Date(geleUntil).getTime() > Date.now()) {
    return {
      ok: false,
      error: `Retraits gelés jusqu'au ${geleUntil}`,
      status: 403,
    };
  }

  const montant = roundUSD(Number(retrait.montant));
  const { data: banque, error: banqueError } = await supabase
    .from("banque_membres")
    .select("solde_dollars")
    .eq("membre_id", retrait.membre_id)
    .maybeSingle();

  if (banqueError) {
    return { ok: false, error: banqueError.message, status: 500 };
  }

  const solde = roundUSD(Number(banque?.solde_dollars ?? 0));
  if (solde < montant) {
    return {
      ok: false,
      error: "Solde insuffisant pour démarrer le délai de sécurité",
      status: 400,
    };
  }

  const { pourcentage, frais } = await calculerFraisPlateforme(montant);
  const net = roundUSD(Math.max(0, montant - frais));
  const now = new Date().toISOString();
  const executableAPartirDe =
    retrait.executable_a_partir_de ??
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: updateBanqueErr } = await supabase
    .from("banque_membres")
    .update({
      solde_dollars: roundUSD(solde - montant),
      updated_at: now,
    })
    .eq("membre_id", retrait.membre_id);

  if (updateBanqueErr) {
    return { ok: false, error: updateBanqueErr.message, status: 500 };
  }

  const { error: mvtErr } = await supabase.from("banque_membres_mouvements").insert({
    membre_id: retrait.membre_id,
    montant: -montant,
    type: "retrait",
    description:
      frais > 0
        ? `Retrait en délai de sécurité · net prévu ${net.toFixed(2)} $ (frais ${pourcentage}% : -${frais.toFixed(2)} $)`
        : `Retrait en délai de sécurité · ${net.toFixed(2)} $`,
  });

  if (mvtErr) {
    await supabase
      .from("banque_membres")
      .update({ solde_dollars: solde, updated_at: now })
      .eq("membre_id", retrait.membre_id);
    return { ok: false, error: mvtErr.message, status: 500 };
  }

  const { data: updated, error: updateErr } = await supabase
    .from("retraits")
    .update({
      statut: "delai_securite",
      executable_a_partir_de: executableAPartirDe,
    })
    .eq("id", retrait.id)
    .eq("statut", "code_confirme")
    .select(
      "id, membre_id, montant, methode, statut, executable_a_partir_de",
    )
    .maybeSingle();

  if (updateErr || !updated) {
    await supabase.from("banque_membres_mouvements").insert({
      membre_id: retrait.membre_id,
      montant,
      type: "retrait_annule",
      description: "Annulation automatique — échec activation délai",
    });
    await supabase
      .from("banque_membres")
      .update({ solde_dollars: solde, updated_at: now })
      .eq("membre_id", retrait.membre_id);
    return {
      ok: false,
      error: updateErr?.message ?? "Impossible d'activer le délai",
      status: 500,
    };
  }

  await supabase.from("securite_journal").insert({
    membre_id: retrait.membre_id,
    action: "retrait_delai_securite",
    details: {
      retrait_id: retrait.id,
      montant,
      executable_a_partir_de: executableAPartirDe,
      frais,
      net,
    },
    ip,
  });

  const contact = await memberContact(supabase, retrait.membre_id, authEmail);
  void sendRetraitStatutEmail(
    contact.email,
    contact.displayName,
    "delai_securite",
    montant,
    executableAPartirDe,
  );

  return {
    ok: true,
    row: updated as RetraitRow,
    frais,
    net,
    pourcentage,
  };
}

/** Exécute les retraits dont le délai est écoulé. */
export async function executerRetraitsPrets(
  supabase: ServiceClient,
  membreId: string,
  authEmail: string | null,
  ip: string | null,
): Promise<{ executed: string[]; errors: string[] }> {
  const nowIso = new Date().toISOString();
  const { data: ready, error } = await supabase
    .from("retraits")
    .select(
      "id, membre_id, montant, methode, statut, executable_a_partir_de",
    )
    .eq("membre_id", membreId)
    .eq("statut", "delai_securite")
    .lte("executable_a_partir_de", nowIso);

  if (error || !ready?.length) {
    return { executed: [], errors: error ? [error.message] : [] };
  }

  const executed: string[] = [];
  const errors: string[] = [];
  const contact = await memberContact(supabase, membreId, authEmail);

  for (const row of ready as RetraitRow[]) {
    const montant = roundUSD(Number(row.montant));
    const { pourcentage, frais } = await calculerFraisPlateforme(montant);
    const net = roundUSD(Math.max(0, montant - frais));
    const executeAt = new Date().toISOString();

    const { data: updated, error: updateErr } = await supabase
      .from("retraits")
      .update({
        statut: "execute",
        execute_at: executeAt,
      })
      .eq("id", row.id)
      .eq("statut", "delai_securite")
      .select("id")
      .maybeSingle();

    if (updateErr || !updated) {
      errors.push(updateErr?.message ?? `Échec exécution ${row.id}`);
      continue;
    }

    if (frais > 0) {
      try {
        await crediterFraisPlateformeBalance(supabase, frais);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push(message);
      }
    }

    await supabase.from("securite_journal").insert({
      membre_id: membreId,
      action: "retrait_execute",
      details: {
        retrait_id: row.id,
        montant,
        frais,
        frais_pct: pourcentage,
        net,
        methode: row.methode,
      },
      ip,
    });

    void sendRetraitStatutEmail(
      contact.email,
      contact.displayName,
      "execute",
      montant,
      null,
    );

    executed.push(row.id);
  }

  return { executed, errors };
}

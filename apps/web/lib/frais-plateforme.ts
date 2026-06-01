import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "./admin-server";
import { getFeatureFlag } from "./feature-flags";

export const PA_USD_PER_PT = 5;

export function roundUSD(n: number): number {
  return Math.round(n * 100) / 100;
}

export type FraisPlateformePalier = {
  id: string;
  palier_nom: string;
  palier_min: number;
  palier_max: number | null;
  pourcentage: number;
  actif: boolean;
  ordre: number;
};

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapPalierRow(row: Record<string, unknown>): FraisPlateformePalier {
  const maxRaw = row.palier_max;
  return {
    id: String(row.id ?? ""),
    palier_nom: String(row.palier_nom ?? ""),
    palier_min: toNumber(row.palier_min),
    palier_max: maxRaw == null || maxRaw === "" ? null : toNumber(maxRaw),
    pourcentage: toNumber(row.pourcentage),
    actif: Boolean(row.actif),
    ordre: Math.trunc(toNumber(row.ordre)),
  };
}

/** Paliers actifs triés par ordre (lecture service). */
export async function getFraisPlateformePaliersActifs(): Promise<FraisPlateformePalier[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("frais_plateforme_config")
    .select("id, palier_nom, palier_min, palier_max, pourcentage, actif, ordre")
    .eq("actif", true)
    .order("ordre", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapPalierRow(row as Record<string, unknown>));
}

/** Tous les paliers (admin), ordre ASC. */
export async function getAllFraisPlateformePaliers(): Promise<FraisPlateformePalier[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("frais_plateforme_config")
    .select("id, palier_nom, palier_min, palier_max, pourcentage, actif, ordre")
    .order("ordre", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapPalierRow(row as Record<string, unknown>));
}

export function trouverPalierPourMontant(
  paliers: FraisPlateformePalier[],
  montantUSD: number,
): FraisPlateformePalier | null {
  if (!Number.isFinite(montantUSD) || montantUSD < 0) return null;

  const sorted = [...paliers].sort((a, b) => a.ordre - b.ordre);
  for (const p of sorted) {
    if (montantUSD < p.palier_min) continue;
    if (p.palier_max != null && montantUSD > p.palier_max) continue;
    return p;
  }
  return null;
}

/**
 * Calcule les frais plateforme pour un montant USD.
 * Retourne { pourcentage: 0, frais: 0 } si le feature flag est désactivé.
 */
export async function calculerFraisPlateforme(
  montantUSD: number,
): Promise<{ pourcentage: number; frais: number }> {
  const enabled = await getFeatureFlag("frais-plateforme");
  if (!enabled) {
    return { pourcentage: 0, frais: 0 };
  }

  const paliers = await getFraisPlateformePaliersActifs();
  const palier = trouverPalierPourMontant(paliers, montantUSD);
  if (!palier) {
    return { pourcentage: 0, frais: 0 };
  }

  const pourcentage = palier.pourcentage;
  const frais = roundUSD(montantUSD * (pourcentage / 100));
  return { pourcentage, frais };
}

const PA_TAX_RATE = 0.02;
const PA_TAX_COMMUNAUTE_SHARE = 0.75;
const PA_TAX_FONCTIONNEMENT_SHARE = 0.25;

export type TaxePaUtilisation = {
  coutUSD: number;
  /** Taxe en pts : Math.round(pts × 2 %). */
  taxe: number;
  taxe_communaute: number;
  taxe_fonctionnement: number;
};

/** Taxe 2 % sur l'utilisation PA, débitée en pts (pas de frais plateforme). */
export function calculerTaxePaUtilisation(ptsEffectifs: number): TaxePaUtilisation {
  const pts = Math.max(0, Math.round(ptsEffectifs));
  const coutUSD = roundUSD(pts * PA_USD_PER_PT);
  const taxe = pts > 0 ? Math.round(pts * PA_TAX_RATE) : 0;
  const taxeUsd = roundUSD(taxe * PA_USD_PER_PT);
  const taxe_communaute = roundUSD(taxeUsd * PA_TAX_COMMUNAUTE_SHARE);
  const taxe_fonctionnement = roundUSD(taxeUsd * PA_TAX_FONCTIONNEMENT_SHARE);
  return {
    coutUSD,
    taxe,
    taxe_communaute,
    taxe_fonctionnement,
  };
}

/** Répartit la taxe 2 % PA : 75 % taxe_pa_balance, 25 % frais_plateforme_balance. */
export async function crediterTaxePaUtilisation(
  supabase: SupabaseClient,
  taxe_communaute: number,
  taxe_fonctionnement: number,
): Promise<void> {
  const taxePaAdd = roundUSD(taxe_communaute);
  const fraisAdd = roundUSD(taxe_fonctionnement);
  if (taxePaAdd <= 0 && fraisAdd <= 0) return;

  const { data: bank, error: fetchErr } = await supabase
    .from("banque_leve")
    .select("id, taxe_pa_balance, frais_plateforme_balance")
    .limit(1)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!bank?.id) throw new Error("banque_leve introuvable");

  const { error: updateErr } = await supabase
    .from("banque_leve")
    .update({
      ...(taxePaAdd > 0
        ? {
            taxe_pa_balance: roundUSD(
              Number(bank.taxe_pa_balance ?? 0) + taxePaAdd,
            ),
          }
        : {}),
      ...(fraisAdd > 0
        ? {
            frais_plateforme_balance: roundUSD(
              Number(bank.frais_plateforme_balance ?? 0) + fraisAdd,
            ),
          }
        : {}),
    })
    .eq("id", bank.id);

  if (updateErr) throw new Error(updateErr.message);
}

/** Crédite pa_balance (achats PA : pts × 5 $). */
export async function crediterPaBalance(
  supabase: SupabaseClient,
  costUsd: number,
): Promise<void> {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;

  const { data: bank, error: fetchErr } = await supabase
    .from("banque_leve")
    .select("id, pa_balance")
    .limit(1)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!bank?.id) throw new Error("banque_leve introuvable");

  const { error: updateErr } = await supabase
    .from("banque_leve")
    .update({
      pa_balance: roundUSD(Number(bank.pa_balance ?? 0) + costUsd),
    })
    .eq("id", bank.id);

  if (updateErr) throw new Error(updateErr.message);
}

/** Crédite frais_plateforme_balance (frais plateforme collectés). */
export async function crediterFraisPlateformeBalance(
  supabase: SupabaseClient,
  frais: number,
): Promise<void> {
  if (!Number.isFinite(frais) || frais <= 0) return;

  const { data: bank, error: fetchErr } = await supabase
    .from("banque_leve")
    .select("id, frais_plateforme_balance")
    .limit(1)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!bank?.id) throw new Error("banque_leve introuvable");

  const { error: updateErr } = await supabase
    .from("banque_leve")
    .update({
      frais_plateforme_balance: roundUSD(
        Number(bank.frais_plateforme_balance ?? 0) + frais,
      ),
    })
    .eq("id", bank.id);

  if (updateErr) throw new Error(updateErr.message);
}

/** @deprecated Utiliser crediterFraisPlateformeBalance */
export const crediterOperationsBalance = crediterFraisPlateformeBalance;

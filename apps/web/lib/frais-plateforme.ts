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

/** Crédite le pool opérations LEVE (frais plateforme collectés). */
export async function crediterOperationsBalance(
  supabase: SupabaseClient,
  frais: number,
): Promise<void> {
  if (!Number.isFinite(frais) || frais <= 0) return;

  const { data: bank, error: fetchErr } = await supabase
    .from("banque_leve")
    .select("id, operations_balance")
    .limit(1)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!bank?.id) throw new Error("banque_leve introuvable");

  const { error: updateErr } = await supabase
    .from("banque_leve")
    .update({
      operations_balance: roundUSD(Number(bank.operations_balance ?? 0) + frais),
    })
    .eq("id", bank.id);

  if (updateErr) throw new Error(updateErr.message);
}

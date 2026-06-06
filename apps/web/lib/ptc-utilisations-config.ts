import { getServiceSupabase } from "./admin-server";

export const PTC_UTILISATION_CATEGORIES = ["promotion", "outils", "reserve"] as const;

export type PtcUtilisationCategorie = (typeof PTC_UTILISATION_CATEGORIES)[number];

export type PtcUtilisationConfigRow = {
  id: string;
  categorie: PtcUtilisationCategorie;
  actif: boolean;
  budget_alloue: number;
  updated_at: string;
};

const SELECT =
  "id, categorie, actif, budget_alloue, updated_at";

export function isPtcUtilisationCategorie(value: string): value is PtcUtilisationCategorie {
  return (PTC_UTILISATION_CATEGORIES as readonly string[]).includes(value);
}

export async function getAllPtcUtilisationsConfig(): Promise<PtcUtilisationConfigRow[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("ptc_utilisations_config")
    .select(SELECT)
    .order("categorie", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...(row as PtcUtilisationConfigRow),
    budget_alloue: Number((row as PtcUtilisationConfigRow).budget_alloue ?? 0),
  }));
}

export async function updatePtcUtilisationConfig(
  categorie: PtcUtilisationCategorie,
  patch: { actif?: boolean; budget_alloue?: number },
): Promise<PtcUtilisationConfigRow> {
  const updates: { actif?: boolean; budget_alloue?: number } = {};
  if (patch.actif !== undefined) updates.actif = patch.actif;
  if (patch.budget_alloue !== undefined) updates.budget_alloue = patch.budget_alloue;

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("ptc_utilisations_config")
    .update(updates)
    .eq("categorie", categorie)
    .select(SELECT)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Catégorie PTC introuvable");

  return {
    ...(data as PtcUtilisationConfigRow),
    budget_alloue: Number((data as PtcUtilisationConfigRow).budget_alloue ?? 0),
  };
}

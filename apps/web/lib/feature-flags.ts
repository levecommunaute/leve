import { getServiceSupabase } from "./admin-server";

export type FeatureFlagRow = {
  id: string;
  nom: string;
  actif: boolean;
  description: string | null;
  updated_at: string;
};

/** Lit un feature flag par son nom. Retourne false si absent ou en cas d'erreur. */
export async function getFeatureFlag(nom: string): Promise<boolean> {
  const key = nom.trim();
  if (!key) return false;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("feature_flags")
      .select("actif")
      .eq("nom", key)
      .maybeSingle();

    if (error || !data) return false;
    return Boolean(data.actif);
  } catch {
    return false;
  }
}

/** Liste tous les feature flags (admin). */
export async function getAllFeatureFlags(): Promise<FeatureFlagRow[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("feature_flags")
    .select("id, nom, actif, description, updated_at")
    .order("nom", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as FeatureFlagRow[];
}

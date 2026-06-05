import { getServiceSupabase } from "./admin-server";

export const RESEAUX_SOCIAUX_VALIDES = ["youtube", "facebook", "tiktok", "instagram"] as const;

export type ReseauSocialKey = (typeof RESEAUX_SOCIAUX_VALIDES)[number];

export type ReseauSocialRow = {
  id: string;
  reseau: ReseauSocialKey;
  abonnes: number;
  actif: boolean;
  ordre: number;
  updated_at: string;
};

export function isReseauSocialKey(value: string): value is ReseauSocialKey {
  return (RESEAUX_SOCIAUX_VALIDES as readonly string[]).includes(value);
}

export async function getAllReseauxSociaux(): Promise<ReseauSocialRow[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("reseaux_sociaux_config")
    .select("id, reseau, abonnes, actif, ordre, updated_at")
    .order("ordre", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ReseauSocialRow[];
}

export async function getActiveReseauxSociaux(): Promise<ReseauSocialRow[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("reseaux_sociaux_config")
    .select("id, reseau, abonnes, actif, ordre, updated_at")
    .eq("actif", true)
    .order("ordre", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ReseauSocialRow[];
}

export async function updateReseauSocial(
  reseau: ReseauSocialKey,
  patch: { abonnes?: number; actif?: boolean },
): Promise<ReseauSocialRow> {
  const updates: { abonnes?: number; actif?: boolean } = {};
  if (patch.abonnes !== undefined) updates.abonnes = patch.abonnes;
  if (patch.actif !== undefined) updates.actif = patch.actif;

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("reseaux_sociaux_config")
    .update(updates)
    .eq("reseau", reseau)
    .select("id, reseau, abonnes, actif, ordre, updated_at")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Réseau introuvable");
  return data as ReseauSocialRow;
}

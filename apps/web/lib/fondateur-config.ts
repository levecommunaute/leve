import { getServiceSupabase } from "./admin-server";

export type FondateurConfigRow = {
  id: string;
  actif: boolean;
  membres_actuels: number;
  membres_max: number;
  message: string;
  updated_at: string;
};

const FONDATEUR_CONFIG_SELECT =
  "id, actif, membres_actuels, membres_max, message, updated_at";

export async function getFondateurConfig(): Promise<FondateurConfigRow | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("fondateur_config")
    .select(FONDATEUR_CONFIG_SELECT)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as FondateurConfigRow | null) ?? null;
}

export async function getActiveFondateurConfig(): Promise<FondateurConfigRow | null> {
  const config = await getFondateurConfig();
  if (!config?.actif) return null;
  return config;
}

export async function updateFondateurConfig(
  patch: {
    actif?: boolean;
    membres_actuels?: number;
    message?: string;
  },
): Promise<FondateurConfigRow> {
  const existing = await getFondateurConfig();
  if (!existing) throw new Error("Configuration fondateur introuvable");

  const updates: {
    actif?: boolean;
    membres_actuels?: number;
    message?: string;
  } = {};
  if (patch.actif !== undefined) updates.actif = patch.actif;
  if (patch.membres_actuels !== undefined) updates.membres_actuels = patch.membres_actuels;
  if (patch.message !== undefined) updates.message = patch.message;

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("fondateur_config")
    .update(updates)
    .eq("id", existing.id)
    .select(FONDATEUR_CONFIG_SELECT)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Configuration fondateur introuvable");
  return data as FondateurConfigRow;
}

import { getServiceSupabase } from "./admin-server";

export type TransparencePoolKey =
  | "pmq"
  | "production"
  | "fondation"
  | "operations"
  | "ptc"
  | "pcol"
  | "pa"
  | "frais_plateforme"
  | "taxe_pa";

export type TransparenceConfigRow = {
  cle: TransparencePoolKey;
  label: string;
  visible: boolean;
  ordre: number;
};

type TransparenceConfigDbRow = {
  cle?: string;
  pool_key?: string;
  label: string;
  visible: boolean;
  ordre: number;
};

function normalizeTransparenceRow(row: TransparenceConfigDbRow): TransparenceConfigRow {
  return {
    cle: (row.cle ?? row.pool_key) as TransparencePoolKey,
    label: row.label,
    visible: row.visible,
    ordre: row.ordre,
  };
}

export async function getTransparenceConfig(): Promise<TransparenceConfigRow[]> {
  const supabase = getServiceSupabase();

  const withCle = await supabase
    .from("transparence_config")
    .select("cle, label, visible, ordre")
    .order("ordre", { ascending: true });

  if (!withCle.error) {
    return ((withCle.data ?? []) as TransparenceConfigDbRow[]).map(normalizeTransparenceRow);
  }

  const withPoolKey = await supabase
    .from("transparence_config")
    .select("pool_key, label, visible, ordre")
    .order("ordre", { ascending: true });

  if (withPoolKey.error) throw new Error(withPoolKey.error.message);
  return ((withPoolKey.data ?? []) as TransparenceConfigDbRow[]).map(normalizeTransparenceRow);
}

export async function updateTransparenceVisibility(
  cle: string,
  visible: boolean,
): Promise<TransparenceConfigRow> {
  const supabase = getServiceSupabase();

  const byCle = await supabase
    .from("transparence_config")
    .update({ visible })
    .eq("cle", cle)
    .select("cle, label, visible, ordre")
    .maybeSingle();

  if (!byCle.error) {
    if (!byCle.data) throw new Error("Pool introuvable");
    return normalizeTransparenceRow(byCle.data as TransparenceConfigDbRow);
  }

  const byPoolKey = await supabase
    .from("transparence_config")
    .update({ visible })
    .eq("pool_key", cle)
    .select("pool_key, label, visible, ordre")
    .maybeSingle();

  if (byPoolKey.error) throw new Error(byPoolKey.error.message);
  if (!byPoolKey.data) throw new Error("Pool introuvable");
  return normalizeTransparenceRow(byPoolKey.data as TransparenceConfigDbRow);
}

export function transparenceVisibilityMap(
  rows: TransparenceConfigRow[],
): Record<TransparencePoolKey, boolean> {
  const defaults: Record<TransparencePoolKey, boolean> = {
    pmq: true,
    production: true,
    fondation: true,
    operations: true,
    ptc: true,
    pcol: true,
    pa: true,
    frais_plateforme: true,
    taxe_pa: true,
  };
  for (const row of rows) {
    defaults[row.cle] = row.visible;
  }
  return defaults;
}

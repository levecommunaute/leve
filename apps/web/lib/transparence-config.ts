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
  pool_key: TransparencePoolKey;
  label: string;
  section: "banque" | "frais";
  visible: boolean;
  ordre: number;
  updated_at: string;
};

export async function getTransparenceConfig(): Promise<TransparenceConfigRow[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("transparence_config")
    .select("pool_key, label, section, visible, ordre, updated_at")
    .order("ordre", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as TransparenceConfigRow[];
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
    defaults[row.pool_key] = row.visible;
  }
  return defaults;
}

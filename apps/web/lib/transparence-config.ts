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
  id: number;
  cle: TransparencePoolKey;
  label: string;
  visible: boolean;
  ordre: number;
};

export async function getTransparenceConfig(): Promise<TransparenceConfigRow[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("transparence_config")
    .select("id, cle, label, visible, ordre")
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
    defaults[row.cle] = row.visible;
  }
  return defaults;
}

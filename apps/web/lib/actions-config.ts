import { getServiceSupabase } from "./admin-server";

export type ActionsConfig = {
  id: string;
  cle: string;
  multiple_valorisation: number;
  total_actions: number;
  escompte_phase1: number;
  locked: boolean;
  updated_at: string;
};

export async function getActionsConfig(): Promise<ActionsConfig> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("actions_config")
    .select("*")
    .eq("cle", "principal")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Configuration actions introuvable");

  return {
    id: data.id,
    cle: data.cle,
    multiple_valorisation: Number(data.multiple_valorisation),
    total_actions: Number(data.total_actions),
    escompte_phase1: Number(data.escompte_phase1),
    locked: Boolean(data.locked),
    updated_at: data.updated_at,
  };
}

import { getServiceSupabase } from "./admin-server";

export type ActionsConfig = {
  id: string;
  total_actions_a: number;
  total_actions_b: number;
  total_actions_c: number;
  valeur_fondation: number;
  multiple_valorisation: number;
  prix_action_c_phase: number;
  locked: boolean;
  updated_at: string;
};

export async function getActionsConfig(): Promise<ActionsConfig> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("actions_config")
    .select(
      "id, total_actions_a, total_actions_b, total_actions_c, valeur_fondation, multiple_valorisation, prix_action_c_phase, locked, updated_at",
    )
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Configuration actions introuvable");

  return {
    id: data.id,
    total_actions_a: Number(data.total_actions_a),
    total_actions_b: Number(data.total_actions_b),
    total_actions_c: Number(data.total_actions_c),
    valeur_fondation: Number(data.valeur_fondation),
    multiple_valorisation: Number(data.multiple_valorisation),
    prix_action_c_phase: Number(data.prix_action_c_phase),
    locked: Boolean(data.locked),
    updated_at: data.updated_at,
  };
}

import { getServiceSupabase } from "./admin-server";

export type RangConfigRow = {
  id: string;
  seuil_bronze: number;
  seuil_argent: number;
  seuil_or: number;
  seuil_diamant: number;
  bonus_bronze: number;
  bonus_argent: number;
  bonus_or: number;
  bonus_diamant: number;
  updated_at: string;
};

export type RankBonusResult = {
  bonusRang: number;
  rankLabel: string | null;
  rankTier: "bronze" | "argent" | "or" | "diamant";
};

const RANG_CONFIG_SELECT =
  "id, seuil_bronze, seuil_argent, seuil_or, seuil_diamant, bonus_bronze, bonus_argent, bonus_or, bonus_diamant, updated_at";

const PP_PAGE_SIZE = 1000;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rowToRangConfig(data: Record<string, unknown>): RangConfigRow {
  return {
    id: String(data.id),
    seuil_bronze: num(data.seuil_bronze),
    seuil_argent: num(data.seuil_argent),
    seuil_or: num(data.seuil_or),
    seuil_diamant: num(data.seuil_diamant),
    bonus_bronze: num(data.bonus_bronze),
    bonus_argent: num(data.bonus_argent),
    bonus_or: num(data.bonus_or),
    bonus_diamant: num(data.bonus_diamant),
    updated_at: String(data.updated_at ?? ""),
  };
}

/** Début du mois courant (fuseau local), aligné sur le dashboard PMQ. */
export function currentMonthStartIso(d = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export async function getRangConfig(): Promise<RangConfigRow | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("rang_config")
    .select(RANG_CONFIG_SELECT)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? rowToRangConfig(data as Record<string, unknown>) : null;
}

export function computeRankBonus(
  ptsPonderesMois: number,
  config: RangConfigRow,
): RankBonusResult {
  const pts = Math.max(0, ptsPonderesMois);

  if (pts >= config.seuil_diamant) {
    const pct = Math.round(config.bonus_diamant * 100);
    return {
      bonusRang: 1 + config.bonus_diamant,
      rankLabel: pct > 0 ? `Rang Diamant +${pct}%` : null,
      rankTier: "diamant",
    };
  }
  if (pts >= config.seuil_or) {
    const pct = Math.round(config.bonus_or * 100);
    return {
      bonusRang: 1 + config.bonus_or,
      rankLabel: pct > 0 ? `Rang Or +${pct}%` : null,
      rankTier: "or",
    };
  }
  if (pts >= config.seuil_argent) {
    const pct = Math.round(config.bonus_argent * 100);
    return {
      bonusRang: 1 + config.bonus_argent,
      rankLabel: pct > 0 ? `Rang Argent +${pct}%` : null,
      rankTier: "argent",
    };
  }

  return { bonusRang: 1, rankLabel: null, rankTier: "bronze" };
}

export async function sumMemberQuizPtsPonderesMonth(
  membreId: string,
  monthStartIso = currentMonthStartIso(),
): Promise<number> {
  const supabase = getServiceSupabase();
  let total = 0;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("points_ponderes")
      .select("pts_ponderes")
      .eq("membre_id", membreId)
      .eq("type", "quiz")
      .gte("created_at", monthStartIso)
      .range(offset, offset + PP_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const rows = data ?? [];
    for (const row of rows) {
      total += num(row.pts_ponderes);
    }
    if (rows.length < PP_PAGE_SIZE) break;
    offset += PP_PAGE_SIZE;
  }

  return total;
}

export type RangConfigPatch = {
  seuil_bronze?: number;
  seuil_argent?: number;
  seuil_or?: number;
  seuil_diamant?: number;
  bonus_bronze?: number;
  bonus_argent?: number;
  bonus_or?: number;
  bonus_diamant?: number;
};

function validateRangConfigPatch(patch: RangConfigPatch): void {
  const seuils = {
    seuil_bronze: patch.seuil_bronze,
    seuil_argent: patch.seuil_argent,
    seuil_or: patch.seuil_or,
    seuil_diamant: patch.seuil_diamant,
  };

  for (const [key, value] of Object.entries(seuils)) {
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${key} invalide (nombre ≥ 0)`);
    }
  }

  for (const key of [
    "bonus_bronze",
    "bonus_argent",
    "bonus_or",
    "bonus_diamant",
  ] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${key} invalide (nombre ≥ 0)`);
    }
  }
}

export async function updateRangConfig(patch: RangConfigPatch): Promise<RangConfigRow> {
  validateRangConfigPatch(patch);

  const existing = await getRangConfig();
  if (!existing) throw new Error("Configuration rang introuvable");

  const merged = {
    seuil_bronze: patch.seuil_bronze ?? existing.seuil_bronze,
    seuil_argent: patch.seuil_argent ?? existing.seuil_argent,
    seuil_or: patch.seuil_or ?? existing.seuil_or,
    seuil_diamant: patch.seuil_diamant ?? existing.seuil_diamant,
    bonus_bronze: patch.bonus_bronze ?? existing.bonus_bronze,
    bonus_argent: patch.bonus_argent ?? existing.bonus_argent,
    bonus_or: patch.bonus_or ?? existing.bonus_or,
    bonus_diamant: patch.bonus_diamant ?? existing.bonus_diamant,
  };

  if (
    merged.seuil_argent < merged.seuil_bronze ||
    merged.seuil_or < merged.seuil_argent ||
    merged.seuil_diamant < merged.seuil_or
  ) {
    throw new Error("Seuils incohérents (Bronze ≤ Argent ≤ Or ≤ Diamant)");
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("rang_config")
    .update(patch)
    .eq("id", existing.id)
    .select(RANG_CONFIG_SELECT)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Configuration rang introuvable");
  return rowToRangConfig(data as Record<string, unknown>);
}

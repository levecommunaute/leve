export type RankTier =
  | "bronze"
  | "argent"
  | "or"
  | "diamant"
  | "pionnier"
  | "fondateur";

export type RankBadgeInfo = {
  emoji: string;
  label: string;
  tier: RankTier;
};

const BRONZE = "#CD7F32";
const SILVER = "#C0C0C0";
const GOLD = "#D4A017";
const DIAMOND = "#B9F2FF";
const ROUGE = "#C0392B";

function normalizeMemberType(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

/** Rang mensuel et bonus quiz : uniquement pour member_type Communauté. */
export function isCommunauteMemberType(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== "string") return true;
  const lower = normalizeMemberType(raw);
  return lower === "communauté" || lower === "communaute";
}

/** Badge de rang selon les points pondérés ; Pionnier/Fondateur remplacent le palier. */
export function getRankBadge(
  ptsPonderes: number,
  memberType?: string | null,
): RankBadgeInfo {
  const lower = normalizeMemberType(memberType);
  if (lower === "pionnier") {
    return { emoji: "⭐", label: "Pionnier", tier: "pionnier" };
  }
  if (lower === "fondateur") {
    return { emoji: "⭐", label: "Fondateur", tier: "fondateur" };
  }

  const pts = Math.max(0, Number(ptsPonderes) || 0);
  if (pts >= 600) {
    return { emoji: "💎", label: "Diamant", tier: "diamant" };
  }
  if (pts >= 300) {
    return { emoji: "🥇", label: "Or", tier: "or" };
  }
  if (pts >= 100) {
    return { emoji: "🥈", label: "Argent", tier: "argent" };
  }
  return { emoji: "🥉", label: "Bronze", tier: "bronze" };
}

export function rankBadgeStyle(tier: RankTier): {
  background: string;
  color: string;
  border: string;
} {
  switch (tier) {
    case "pionnier":
      return {
        background: "rgba(192, 57, 43, 0.2)",
        color: ROUGE,
        border: `1px solid ${ROUGE}`,
      };
    case "fondateur":
      return {
        background: "rgba(212, 160, 23, 0.18)",
        color: GOLD,
        border: `1px solid ${GOLD}`,
      };
    case "diamant":
      return {
        background: "rgba(185, 242, 255, 0.08)",
        color: DIAMOND,
        border: `1px solid ${DIAMOND}`,
      };
    case "or":
      return {
        background: "rgba(212, 160, 23, 0.08)",
        color: GOLD,
        border: `1px solid ${GOLD}`,
      };
    case "argent":
      return {
        background: "rgba(192, 192, 192, 0.08)",
        color: SILVER,
        border: `1px solid ${SILVER}`,
      };
    default:
      return {
        background: "rgba(205, 127, 50, 0.08)",
        color: BRONZE,
        border: `1px solid ${BRONZE}`,
      };
  }
}

export type MonthlyMemberRankBadge = {
  emoji: string;
  label: string;
  background: string;
  color: string;
  border: string;
};

export type MonthlyRankConfig = {
  seuil_argent: number;
  seuil_or: number;
  seuil_diamant: number;
  bonus_argent: number;
  bonus_or: number;
  bonus_diamant: number;
};

const DEFAULT_MONTHLY_RANK_CONFIG: MonthlyRankConfig = {
  seuil_argent: 100,
  seuil_or: 300,
  seuil_diamant: 600,
  bonus_argent: 0.15,
  bonus_or: 0.35,
  bonus_diamant: 0.6,
};

function bonusPctLabel(bonus: number): string {
  const pct = Math.round(Math.max(0, bonus) * 100);
  return pct > 0 ? ` · +${pct}%` : "";
}

/** Rang mensuel depuis rang_config — Bronze n'affiche pas de badge. */
export function getMonthlyMemberRankBadge(
  ptsPonderesMois: number,
  config: MonthlyRankConfig = DEFAULT_MONTHLY_RANK_CONFIG,
): MonthlyMemberRankBadge | null {
  const pts = Math.max(0, Number(ptsPonderesMois) || 0);
  if (pts >= config.seuil_diamant) {
    return {
      emoji: "💎",
      label: `Diamant${bonusPctLabel(config.bonus_diamant)}`,
      background: "rgba(185, 242, 255, 0.08)",
      color: DIAMOND,
      border: `1px solid ${DIAMOND}`,
    };
  }
  if (pts >= config.seuil_or) {
    return {
      emoji: "🥇",
      label: `Or${bonusPctLabel(config.bonus_or)}`,
      background: "rgba(212, 160, 23, 0.08)",
      color: GOLD,
      border: `1px solid ${GOLD}`,
    };
  }
  if (pts >= config.seuil_argent) {
    return {
      emoji: "🥈",
      label: `Argent${bonusPctLabel(config.bonus_argent)}`,
      background: "rgba(192, 192, 192, 0.08)",
      color: SILVER,
      border: `1px solid ${SILVER}`,
    };
  }
  return null;
}

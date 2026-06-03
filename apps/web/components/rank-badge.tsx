import type { CSSProperties, JSX } from "react";
import { getRankBadge, rankBadgeStyle } from "../lib/rank-badge";

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
} as const;

type RankBadgeProps = {
  ptsPonderes: number;
  memberType?: string | null;
  size?: "sm" | "md";
  style?: CSSProperties;
};

export function RankBadge({
  ptsPonderes,
  memberType,
  size = "sm",
  style,
}: RankBadgeProps): JSX.Element {
  const info = getRankBadge(ptsPonderes, memberType);
  const colors = rankBadgeStyle(info.tier);
  const isSmall = size === "sm";

  return (
    <span
      title={`Rang : ${info.label}`}
      style={{
        ...badgeStyle,
        fontSize: isSmall ? "0.62rem" : "0.72rem",
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: isSmall ? "0.2rem 0.45rem" : "0.28rem 0.55rem",
        borderRadius: "999px",
        whiteSpace: "nowrap",
        verticalAlign: "middle",
        ...colors,
        ...style,
      }}
    >
      <span aria-hidden style={{ fontSize: isSmall ? "0.85em" : "1em" }}>
        {info.emoji}
      </span>
      {info.label}
    </span>
  );
}

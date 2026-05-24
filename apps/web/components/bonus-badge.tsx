"use client";

import { useEffect, useState, type JSX } from "react";

export function isBonusActive(bonusExpireAt: string | null | undefined): boolean {
  if (!bonusExpireAt) return false;
  const t = new Date(bonusExpireAt).getTime();
  return Number.isFinite(t) && t > Date.now();
}

function formatRemainingMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

const badgeStyle = {
  display: "inline-block",
  background: "rgba(212, 160, 23, 0.15)",
  color: "#D4A017",
  border: "1px solid rgba(212, 160, 23, 0.4)",
  padding: "2px 8px",
  borderRadius: "4px",
  fontSize: "0.75rem",
  fontWeight: 600,
} as const;

type BonusBadgeProps = {
  bonusExpireAt: string | null | undefined;
};

export function BonusBadge({ bonusExpireAt }: BonusBadgeProps): JSX.Element | null {
  const [visible, setVisible] = useState(() => isBonusActive(bonusExpireAt));
  const [remaining, setRemaining] = useState(() => {
    if (!bonusExpireAt) return "";
    const ms = new Date(bonusExpireAt).getTime() - Date.now();
    return ms > 0 ? formatRemainingMs(ms) : "";
  });

  useEffect(() => {
    if (!bonusExpireAt) {
      setVisible(false);
      return;
    }
    const expireMs = new Date(bonusExpireAt).getTime();
    if (!Number.isFinite(expireMs)) {
      setVisible(false);
      return;
    }

    const tick = (): void => {
      const diff = expireMs - Date.now();
      if (diff <= 0) {
        setVisible(false);
        return;
      }
      setVisible(true);
      setRemaining(formatRemainingMs(diff));
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [bonusExpireAt]);

  if (!visible) return null;

  return (
    <span style={badgeStyle}>
      ⚡ Bonus ×2 — expire dans {remaining}
    </span>
  );
}

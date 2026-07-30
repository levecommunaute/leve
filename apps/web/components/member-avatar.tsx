"use client";

import React, { type JSX } from "react";
import {
  avatarInitials,
  colorFromName,
  isPhotoAvatar,
  isPresetAvatar,
  resolveAvatarMode,
} from "../lib/avatar";

type MemberAvatarProps = {
  displayName: string;
  avatarUrl?: string | null;
  size?: number;
  style?: React.CSSProperties;
  title?: string;
};

export function MemberAvatar({
  displayName,
  avatarUrl = null,
  size = 40,
  style,
  title,
}: MemberAvatarProps): JSX.Element {
  const mode = resolveAvatarMode(avatarUrl);
  const initials = avatarInitials(displayName);
  const bg = colorFromName(displayName);
  const base: React.CSSProperties = {
    flexShrink: 0,
    width: size,
    height: size,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    overflow: "hidden",
    fontFamily: "var(--font-mono), ui-monospace, monospace",
    fontWeight: 700,
    lineHeight: 1,
    userSelect: "none",
    ...style,
  };

  if (mode === "photo" && avatarUrl && isPhotoAvatar(avatarUrl)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={title ?? displayName}
        width={size}
        height={size}
        style={{
          ...base,
          objectFit: "cover" as const,
          background: "#141414",
        }}
      />
    );
  }

  if (
    mode === "avatar" &&
    avatarUrl &&
    (isPresetAvatar(avatarUrl) || !avatarUrl.includes("/"))
  ) {
    return (
      <span
        title={title ?? displayName}
        aria-label={title ?? displayName}
        style={{
          ...base,
          background: "rgba(245, 240, 232, 0.06)",
          fontSize: size * 0.48,
        }}
      >
        {avatarUrl}
      </span>
    );
  }

  return (
    <span
      title={title ?? displayName}
      aria-label={title ?? displayName}
      style={{
        ...base,
        background: bg,
        color: "#F5F0E8",
        fontSize: size * 0.34,
        letterSpacing: "0.04em",
      }}
    >
      {initials}
    </span>
  );
}

"use client";

import React from "react";
import { Bell } from "lucide-react";
import { MemberAvatar } from "./member-avatar";

interface HeaderRightProps {
  displayName: string;
  avatarUrl?: string | null;
}

export function HeaderRight({ displayName, avatarUrl }: HeaderRightProps): React.JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <MemberAvatar displayName={displayName} avatarUrl={avatarUrl ?? null} size={28} />
      <button
        type="button"
        onClick={() => console.log("notifications - à implémenter")} // TODO: page /notifications
        style={{
          position: "relative",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text)",
        }}
      >
        <Bell size={20} strokeWidth={1.5} />
        <span
          style={{
            position: "absolute",
            top: "-2px",
            right: "-2px",
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: "#C0392B",
          }}
        />
      </button>
    </div>
  );
}

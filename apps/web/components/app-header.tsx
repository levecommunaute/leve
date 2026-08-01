"use client";

import Link from "next/link";

interface AppHeaderProps {
  displayName?: string;
  onSignOut: () => void;
  signingOut?: boolean;
  rightExtra?: React.ReactNode;
}

export function AppHeader({ displayName, onSignOut, signingOut = false, rightExtra }: AppHeaderProps): JSX.Element {
  return (
    <header
      className="leve-nav"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1rem 1.25rem",
        borderBottom: "1px solid rgba(245,240,232,0.08)",
        position: "sticky",
        top: 0,
        background: "rgba(8,8,8,0.92)",
        backdropFilter: "blur(8px)",
        zIndex: 20,
      }}
    >
      <Link
        href="/"
        className="leve-nav-logo dash-logo"
        style={{
          fontFamily: "var(--font-bebas), Impact, sans-serif",
          fontSize: "2rem",
          letterSpacing: "0.12em",
          color: "#F5F0E8",
          textDecoration: "none",
        }}
      >
        LEVE
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {rightExtra}
        {displayName ? (
          <span
            style={{
              fontSize: "0.9rem",
              opacity: 0.85,
              maxWidth: "42vw",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </span>
        ) : null}
        <button
          type="button"
          disabled={signingOut}
          onClick={onSignOut}
          style={{
            background: "transparent",
            color: "#C0392B",
            border: "1px solid #C0392B",
            borderRadius: "4px",
            padding: "0.45rem 0.9rem",
            fontSize: "0.8rem",
            cursor: signingOut ? "wait" : "pointer",
          }}
        >
          {signingOut ? "…" : "Déconnexion"}
        </button>
      </div>
    </header>
  );
}

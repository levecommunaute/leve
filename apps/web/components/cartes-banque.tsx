"use client";
import React from "react";
import { Wallet, Gift, Clock, ChevronRight, TrendingUp } from "lucide-react";

export interface CartesBanqueProps {
  soldeDollars: number;
  moisCourantLabel: string;
  canTransfer: boolean;
  progressPct: number;
  totalPoints: number;
  profileMultiplier: number;
  typeMembre: string;
  banqueEstimation: number;
  onRetraitClick: () => void;
  pointsFmt: Intl.NumberFormat;
  cad: Intl.NumberFormat;
  GOLD: string;
  ROUGE: string;
}

const cardStyle = {
  borderRadius: "8px",
  padding: "1.25rem",
  background: "var(--bg-card)",
  border: "1px solid rgba(212,160,23,0.2)",
  display: "flex",
  flexDirection: "column" as const,
  gap: "1rem",
};

const separator = {
  height: 1,
  background: "rgba(212,160,23,0.1)",
  margin: 0,
};

const iconCircle = {
  width: 42,
  height: 42,
  borderRadius: "50%",
  background: "rgba(212,160,23,0.08)",
  border: "1px solid rgba(212,160,23,0.2)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
} as const;

export function CartesBanque({
  soldeDollars,
  moisCourantLabel,
  canTransfer,
  progressPct,
  totalPoints,
  profileMultiplier,
  typeMembre,
  banqueEstimation,
  onRetraitClick,
  pointsFmt,
  cad,
  GOLD,
  ROUGE,
}: CartesBanqueProps): React.JSX.Element {
  const bankBtnStyle = {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.85rem 1rem",
    borderRadius: "8px",
    background: "rgba(212,160,23,0.06)",
    border: "1px solid rgba(212,160,23,0.25)",
    color: GOLD,
    textDecoration: "none",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
  } as const;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
    .leve-cartes-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.85rem;
    }
    @media (max-width: 479px) {
      .leve-cartes-grid { grid-template-columns: 1fr; }
    }
  `,
        }}
      />
      <div className="leve-cartes-grid">
        <section className="leve-card" style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={iconCircle}>
              <Wallet size={20} strokeWidth={1.5} color={GOLD} />
            </div>
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "0.85rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                opacity: 0.7,
              }}
            >
              Solde Banque
            </p>
          </div>

          <div>
            <p
              style={{
                margin: 0,
                fontSize: "2.5rem",
                fontWeight: 700,
                color: GOLD,
                lineHeight: 1,
              }}
            >
              {cad.format(soldeDollars)}
            </p>
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.72rem", opacity: 0.5 }}>
              {moisCourantLabel}
            </p>
          </div>

          <div style={separator} />

          <div
            style={{
              height: 4,
              borderRadius: 2,
              background: "rgba(212,160,23,0.15)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, progressPct)}%`,
                background: canTransfer ? GOLD : ROUGE,
                borderRadius: 2,
                transition: "width 0.35s ease",
              }}
            />
          </div>
          <p style={{ margin: 0, fontSize: "0.75rem", opacity: 0.65 }}>
            {canTransfer
              ? "Seuil atteint — transfert disponible"
              : `${progressPct.toFixed(0)}% vers le seuil · 🔒 ${cad.format(100 - soldeDollars)} manquants`}
          </p>

          <div style={separator} />

          {canTransfer ? (
            <button type="button" onClick={onRetraitClick} style={bankBtnStyle}>
              <Gift size={18} strokeWidth={1.5} />
              <span style={{ flex: 1 }}>
                <span style={{ display: "block" }}>Retrait de récompense</span>
                <span
                  style={{
                    display: "block",
                    fontSize: "0.68rem",
                    opacity: 0.55,
                    fontWeight: 400,
                  }}
                >
                  {cad.format(soldeDollars)} disponible
                </span>
              </span>
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          ) : (
            <div
              style={{
                ...bankBtnStyle,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--text)",
                cursor: "not-allowed",
                opacity: 0.6,
              }}
            >
              <Clock size={18} strokeWidth={1.5} />
              <span style={{ flex: 1 }}>
                <span style={{ display: "block" }}>Retrait de récompense</span>
                <span
                  style={{
                    display: "block",
                    fontSize: "0.68rem",
                    opacity: 0.55,
                    fontWeight: 400,
                  }}
                >
                  Seuil $100 · {cad.format(soldeDollars)} disponible
                </span>
              </span>
            </div>
          )}

          <p style={{ margin: 0, fontSize: "0.72rem", opacity: 0.45 }}>
            Minimum $100 pour retrait · PayPal · Virement · Mobile Money
          </p>
        </section>

        <section className="leve-card" style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={iconCircle}>
              <TrendingUp size={20} strokeWidth={1.5} color={GOLD} />
            </div>
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-bebas), Impact, sans-serif",
                fontSize: "0.85rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                opacity: 0.7,
              }}
            >
              Points PMQ
            </p>
          </div>

          <div style={{ display: "flex", gap: "1rem" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "2.5rem",
                  fontWeight: 700,
                  color: GOLD,
                  lineHeight: 1,
                }}
              >
                {pointsFmt.format(totalPoints)}
              </p>
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.72rem", opacity: 0.5 }}>
                {moisCourantLabel}
              </p>
            </div>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                borderLeft: "1px solid rgba(212,160,23,0.1)",
                paddingLeft: "1rem",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "0.7rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  opacity: 0.55,
                }}
              >
                Points pondérés
              </p>
              <p
                style={{
                  margin: "0.35rem 0 0",
                  fontSize: "1.4rem",
                  fontWeight: 700,
                  color: GOLD,
                }}
              >
                {pointsFmt.format(totalPoints * profileMultiplier)}
              </p>
              <p
                style={{
                  margin: "0.35rem 0 0",
                  fontSize: "0.72rem",
                  opacity: 0.55,
                }}
              >
                ×{profileMultiplier.toFixed(1)} · {typeMembre}
              </p>
            </div>
          </div>

          <div style={separator} />

          <div>
            <p
              style={{
                margin: 0,
                fontSize: "0.7rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                opacity: 0.55,
              }}
            >
              Estimation redistribution
            </p>
            <p
              style={{
                margin: "0.35rem 0 0",
                fontSize: "1.1rem",
                fontWeight: 700,
                color: GOLD,
              }}
            >
              {banqueEstimation > 0 ? `~${cad.format(banqueEstimation)}` : "—"}
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

"use client";
import React from "react";
import Link from "next/link";
import { TrendingUp, Users, Landmark, Clock, ChevronRight } from "lucide-react";
import { MemberAvatar } from "./member-avatar";

export interface CartesPmqMultiplicateurProps {
  name: string;
  avatarUrl: string | null;
  totalPointsPmq: number;
  weightedPointsPmq: number;
  pmqMonthLabel: string;
  profileMultiplier: number;
  prevMonthLabel: string;
  prevMonthPtsPonderes: number;
  prevMonthRedistributed: boolean;
  inGrace: boolean;
  pmqShare: {
    mes_pts: number;
    total_pts: number;
    total_pts_pool: number;
    nb_membres_actifs: number;
    nb_membres_total: number;
    pourcentage: number;
  } | null;
  monthlyRankBadge: {
    emoji: string;
    label: string;
    background: string;
    color: string;
    border: string;
  } | null;
  isOwnProfile?: boolean;
  pointsFmt: Intl.NumberFormat;
  cad: Intl.NumberFormat;
}

const GOLD = "var(--accent)";
const TEXT = "var(--text)";

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
} as const;

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

export function CartesPmqMultiplicateur({
  name,
  avatarUrl,
  totalPointsPmq,
  weightedPointsPmq,
  pmqMonthLabel,
  profileMultiplier,
  prevMonthLabel,
  prevMonthPtsPonderes,
  prevMonthRedistributed,
  inGrace,
  pmqShare,
  monthlyRankBadge,
  isOwnProfile = true,
  pointsFmt,
}: CartesPmqMultiplicateurProps): React.JSX.Element {
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
        <article className="leve-card" style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <MemberAvatar displayName={name} avatarUrl={avatarUrl} size={42} />
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
              Mes points PMQ
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
                {pointsFmt.format(totalPointsPmq)}
              </p>
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.72rem", opacity: 0.5 }}>
                {pmqMonthLabel}
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
                {pointsFmt.format(weightedPointsPmq)}
              </p>
              <p
                style={{
                  margin: "0.35rem 0 0",
                  fontSize: "0.72rem",
                  opacity: 0.55,
                  lineHeight: 1.4,
                }}
              >
                Vos points × multiplicateur utilisés pour calculer votre part de
                redistribution.
              </p>
            </div>
          </div>

          <div style={separator} />

          {prevMonthRedistributed && !inGrace ? (
            <Link href="/banque" style={bankBtnStyle}>
              <Landmark size={18} strokeWidth={1.5} />
              <span style={{ flex: 1 }}>
                <span style={{ display: "block" }}>Consulter votre banque</span>
                <span
                  style={{
                    display: "block",
                    fontSize: "0.68rem",
                    opacity: 0.55,
                    fontWeight: 400,
                  }}
                >
                  PMQ {prevMonthLabel} · {pointsFmt.format(prevMonthPtsPonderes)} pts
                </span>
              </span>
              <ChevronRight size={16} strokeWidth={1.5} />
            </Link>
          ) : prevMonthRedistributed && inGrace ? (
            <div style={bankBtnStyle}>
              <Landmark size={18} strokeWidth={1.5} />
              <span style={{ flex: 1 }}>
                <span style={{ display: "block" }}>Consulter votre banque</span>
                <span
                  style={{
                    display: "block",
                    fontSize: "0.68rem",
                    opacity: 0.55,
                    fontWeight: 400,
                  }}
                >
                  PMQ {prevMonthLabel} · {pointsFmt.format(prevMonthPtsPonderes)} pts
                </span>
              </span>
              <ChevronRight size={16} strokeWidth={1.5} style={{ opacity: 0.3 }} />
            </div>
          ) : prevMonthLabel ? (
            <div
              style={{
                ...bankBtnStyle,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: TEXT,
              }}
            >
              <Clock size={18} strokeWidth={1.5} />
              <span style={{ flex: 1 }}>
                <span style={{ display: "block" }}>Redistribution en cours</span>
                <span
                  style={{
                    display: "block",
                    fontSize: "0.68rem",
                    opacity: 0.55,
                    fontWeight: 400,
                  }}
                >
                  PMQ {prevMonthLabel} · {pointsFmt.format(prevMonthPtsPonderes)} pts
                </span>
              </span>
            </div>
          ) : null}
        </article>

        <article className="leve-card" style={cardStyle}>
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
              Multiplicateur
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
                ×{profileMultiplier.toFixed(1)}
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
                Part du pool
              </p>
              {pmqShare && pmqShare.total_pts > 0 ? (
                <p
                  style={{
                    margin: "0.35rem 0 0",
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    color: GOLD,
                  }}
                >
                  {pmqShare.pourcentage.toFixed(1)}%{" "}
                  <span style={{ opacity: 0.55, fontSize: "0.85rem", fontWeight: 400 }}>
                    du pool PMQ
                  </span>
                </p>
              ) : (
                <p style={{ margin: "0.35rem 0 0", opacity: 0.45, fontSize: "0.82rem" }}>
                  Aucun quiz ce mois
                </p>
              )}
            </div>
          </div>

          <div style={separator} />

          {isOwnProfile && pmqShare ? (
            <>
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
                    width: `${Math.min(100, pmqShare.total_pts > 0 ? pmqShare.pourcentage : 0)}%`,
                    background: GOLD,
                    borderRadius: 2,
                    transition: "width 0.35s ease",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.7rem",
                  opacity: 0.5,
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <Users size={12} />
                  {pmqShare.nb_membres_actifs}/{pmqShare.nb_membres_total} actifs
                </span>
                <span>{pointsFmt.format(pmqShare.total_pts_pool)} pts au total</span>
              </div>
            </>
          ) : null}

          {monthlyRankBadge ? (
            <span
              style={{
                display: "inline-block",
                fontFamily: "var(--font-mono), ui-monospace, monospace",
                fontSize: "0.72rem",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "0.3rem 0.65rem",
                borderRadius: "4px",
                background: monthlyRankBadge.background,
                color: monthlyRankBadge.color,
                border: monthlyRankBadge.border,
              }}
            >
              {monthlyRankBadge.emoji} {monthlyRankBadge.label}
            </span>
          ) : null}
        </article>
      </div>
    </>
  );
}

"use client";

import { useState, type JSX } from "react";

const GOLD = "#D4A017";
const MAP_BG = "#141414";

export type MemberGeoRow = {
  pays: string | null;
  ville: string | null;
  continent: string | null;
};

type MapFilter = "tous" | "continent" | "pays" | "ville";

type StatRow = {
  label: string;
  count: number;
  continent?: string;
};

const CONTINENT_META: {
  key: string;
  label: string;
  color: string;
  cx: number;
  cy: number;
}[] = [
  { key: "Amériques", label: "Amériques", color: "#C0392B", cx: 200, cy: 230 },
  { key: "Europe", label: "Europe", color: "#4A90D9", cx: 520, cy: 155 },
  { key: "Afrique", label: "Afrique", color: "#D4A017", cx: 540, cy: 310 },
  { key: "Asie", label: "Asie", color: "#2ECC71", cx: 730, cy: 200 },
  { key: "Océanie", label: "Océanie", color: "#7B5EA7", cx: 850, cy: 390 },
];

const FILTERS: { id: MapFilter; label: string }[] = [
  { id: "tous", label: "Tous" },
  { id: "continent", label: "Par continent" },
  { id: "pays", label: "Par pays" },
  { id: "ville", label: "Par ville" },
];

function labelOrUnknown(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? t : "Inconnu";
}

function aggregate(
  members: MemberGeoRow[],
  mode: MapFilter,
  continentFilter: string | null,
): StatRow[] {
  const filtered = continentFilter
    ? members.filter((m) => labelOrUnknown(m.continent) === continentFilter)
    : members;

  const counts = new Map<string, { count: number; continent?: string }>();

  for (const m of filtered) {
    let key: string;
    let continent: string | undefined;
    if (mode === "continent") {
      key = labelOrUnknown(m.continent);
    } else if (mode === "ville") {
      const ville = labelOrUnknown(m.ville);
      const pays = labelOrUnknown(m.pays);
      key = ville === "Inconnu" ? "Inconnu" : `${ville} (${pays})`;
      continent = labelOrUnknown(m.continent);
    } else {
      // tous + pays → tableau par pays
      key = labelOrUnknown(m.pays);
      continent = labelOrUnknown(m.continent);
    }
    const prev = counts.get(key);
    if (prev) prev.count += 1;
    else counts.set(key, { count: 1, continent });
  }

  return [...counts.entries()]
    .map(([label, v]) => ({ label, count: v.count, continent: v.continent }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));
}

function continentCounts(members: MemberGeoRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of CONTINENT_META) map.set(c.key, 0);
  for (const m of members) {
    const key = labelOrUnknown(m.continent);
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function bubbleRadius(count: number, max: number): number {
  if (count <= 0) return 14;
  const t = max > 0 ? count / max : 0;
  return 18 + t * 42;
}

type Props = {
  members: MemberGeoRow[];
  total: number;
};

export function MemberWorldMap({ members, total }: Props): JSX.Element {
  const [filter, setFilter] = useState<MapFilter>("tous");
  const [selectedContinent, setSelectedContinent] = useState<string | null>(null);

  const byContinent = continentCounts(members);
  const maxContinent = Math.max(1, ...[...byContinent.values()]);
  const stats = aggregate(members, filter, selectedContinent);
  const statsTotal = selectedContinent
    ? members.filter((m) => labelOrUnknown(m.continent) === selectedContinent).length
    : total;
  const tableHeader =
    filter === "continent" ? "Continent" : filter === "ville" ? "Ville" : "Pays";

  return (
    <div>
      <p style={{ margin: "0 0 1rem", fontSize: "1.05rem" }}>
        Total :{" "}
        <strong style={{ color: GOLD, fontSize: "1.3rem" }}>{total}</strong> membre
        {total !== 1 ? "s" : ""}
        {selectedContinent ? (
          <>
            {" "}
            · filtre{" "}
            <strong style={{ color: GOLD }}>{selectedContinent}</strong> (
            {statsTotal})
          </>
        ) : null}
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.45rem",
          marginBottom: "1rem",
        }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              style={{
                padding: "0.45rem 0.9rem",
                borderRadius: "4px",
                border: active
                  ? `1px solid ${GOLD}`
                  : "1px solid rgba(245,240,232,0.14)",
                background: active ? "rgba(212,160,23,0.14)" : "transparent",
                color: active ? GOLD : "#F5F0E8",
                cursor: "pointer",
                fontSize: "0.78rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontFamily: "var(--font-mono), ui-monospace, monospace",
              }}
            >
              {f.label}
            </button>
          );
        })}
        {selectedContinent ? (
          <button
            type="button"
            onClick={() => setSelectedContinent(null)}
            style={{
              padding: "0.45rem 0.9rem",
              borderRadius: "4px",
              border: "1px solid rgba(192,57,43,0.45)",
              background: "rgba(192,57,43,0.12)",
              color: "#F5F0E8",
              cursor: "pointer",
              fontSize: "0.78rem",
              letterSpacing: "0.06em",
              fontFamily: "var(--font-mono), ui-monospace, monospace",
            }}
          >
            Retirer filtre continent
          </button>
        ) : null}
      </div>

      <div
        style={{
          background: MAP_BG,
          borderRadius: "4px",
          border: "1px solid rgba(245,240,232,0.08)",
          padding: "0.75rem",
          marginBottom: "1.35rem",
          overflow: "hidden",
        }}
      >
        <svg
          viewBox="0 0 1000 520"
          role="img"
          aria-label="Carte mondiale des membres par continent"
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          <rect width="1000" height="520" fill={MAP_BG} />
          {/* Silhouette monde simplifiée */}
          <g fill="rgba(245,240,232,0.06)" stroke="rgba(245,240,232,0.1)" strokeWidth="1">
            <path d="M80 140 C120 90 180 80 230 110 C280 140 300 200 270 250 C240 300 170 320 120 280 C70 240 50 180 80 140 Z" />
            <path d="M200 340 C230 320 270 330 290 370 C310 410 280 450 240 440 C200 430 170 380 200 340 Z" />
            <path d="M460 90 C510 70 560 80 590 120 C620 160 600 200 560 210 C520 220 470 190 460 150 C450 120 450 100 460 90 Z" />
            <path d="M500 230 C545 220 580 250 590 300 C600 350 570 400 530 410 C490 420 460 370 470 320 C480 270 480 240 500 230 Z" />
            <path d="M620 100 C700 70 800 90 860 150 C920 210 900 280 840 300 C780 320 700 280 660 220 C620 160 600 120 620 100 Z" />
            <path d="M780 340 C830 330 890 360 910 400 C930 440 890 470 840 460 C790 450 750 400 780 340 Z" />
          </g>

          {CONTINENT_META.map((c) => {
            const count = byContinent.get(c.key) ?? 0;
            const r = bubbleRadius(count, maxContinent);
            const active = selectedContinent === c.key;
            const dimmed = selectedContinent != null && !active;
            return (
              <g
                key={c.key}
                style={{ cursor: "pointer" }}
                opacity={dimmed ? 0.35 : 1}
                onClick={() =>
                  setSelectedContinent((prev) => (prev === c.key ? null : c.key))
                }
              >
                <circle
                  cx={c.cx}
                  cy={c.cy}
                  r={r + 6}
                  fill={c.color}
                  opacity={0.15}
                />
                <circle
                  cx={c.cx}
                  cy={c.cy}
                  r={r}
                  fill={c.color}
                  opacity={active ? 0.95 : 0.78}
                  stroke={active ? GOLD : "rgba(245,240,232,0.25)"}
                  strokeWidth={active ? 2.5 : 1}
                />
                <text
                  x={c.cx}
                  y={c.cy + 5}
                  textAnchor="middle"
                  fill={GOLD}
                  fontSize={r > 36 ? 22 : 16}
                  fontFamily="var(--font-bebas), Impact, sans-serif"
                  style={{ pointerEvents: "none" }}
                >
                  {count}
                </text>
                <text
                  x={c.cx}
                  y={c.cy + r + 18}
                  textAnchor="middle"
                  fill="#F5F0E8"
                  fontSize="12"
                  opacity={0.75}
                  fontFamily="var(--font-mono), ui-monospace, monospace"
                  style={{ pointerEvents: "none" }}
                >
                  {c.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem 1.25rem",
            justifyContent: "center",
            marginTop: "0.5rem",
            fontSize: "0.72rem",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            opacity: 0.7,
            fontFamily: "var(--font-mono), ui-monospace, monospace",
          }}
        >
          {CONTINENT_META.map((c) => (
            <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: c.color,
                  display: "inline-block",
                }}
              />
              {c.label}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          overflowX: "auto",
          fontFamily: "var(--font-mono), ui-monospace, monospace",
        }}
      >
        <table
          className="leve-admin-table"
          style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}
        >
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(245,240,232,0.12)" }}>
              {[tableHeader, "Membres", "%"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "0.65rem 0.5rem",
                    letterSpacing: "0.08em",
                    fontSize: "0.65rem",
                    textTransform: "uppercase",
                    opacity: 0.55,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: "0.75rem 0.5rem", opacity: 0.6 }}>
                  Aucune donnée pour ce filtre.
                </td>
              </tr>
            ) : (
              stats.map((row) => {
                const pct = statsTotal > 0 ? (row.count / statsTotal) * 100 : 0;
                const color =
                  CONTINENT_META.find((c) => c.key === (row.continent ?? row.label))
                    ?.color ?? GOLD;
                return (
                  <tr
                    key={row.label}
                    style={{ borderBottom: "1px solid rgba(245,240,232,0.06)" }}
                  >
                    <td style={{ padding: "0.6rem 0.5rem" }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: color,
                          marginRight: "0.55rem",
                          verticalAlign: "middle",
                        }}
                      />
                      {row.label}
                    </td>
                    <td
                      style={{
                        padding: "0.6rem 0.5rem",
                        color: GOLD,
                        fontWeight: 600,
                      }}
                    >
                      {row.count}
                    </td>
                    <td style={{ padding: "0.6rem 0.5rem", opacity: 0.75 }}>
                      {pct.toFixed(1).replace(".", ",")} %
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

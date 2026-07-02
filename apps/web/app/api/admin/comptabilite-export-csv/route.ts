import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;
const PA_TAX_COMMUNAUTE_SHARE = 0.75;
const PA_TAX_FONCTIONNEMENT_SHARE = 0.25;

type MoisFilter = {
  monthKey: string | null;
  monthDate: string | null;
  startIso: string | null;
  endIso: string | null;
};

type RedistributionRow = {
  month: unknown;
  total_revenue: unknown;
  pmq_pool: unknown;
  ptc_pool: unknown;
  pcol_pool: unknown;
  pa_pool: unknown;
  total_members: unknown;
  value_per_point: unknown;
};

type PaTransactionRow = {
  id: unknown;
  membre_id: unknown;
  created_at: string;
  type: string | null;
  amount: unknown;
  cost_usd: unknown;
  tax_usd: unknown;
  description: string | null;
};

type MouvementRow = {
  montant: unknown;
  type: string | null;
  description: string | null;
  created_at: string;
};

function parseMoisParam(raw: string | null): { filter: MoisFilter; error?: string } {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return { filter: { monthKey: null, monthDate: null, startIso: null, endIso: null } };
  }
  if (!/^\d{4}-\d{2}$/.test(trimmed)) {
    return {
      filter: { monthKey: null, monthDate: null, startIso: null, endIso: null },
      error: "Paramètre mois invalide (format attendu : YYYY-MM)",
    };
  }
  const [yearStr, monthStr] = trimmed.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (month < 1 || month > 12) {
    return {
      filter: { monthKey: null, monthDate: null, startIso: null, endIso: null },
      error: "Paramètre mois invalide",
    };
  }
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return {
    filter: {
      monthKey: trimmed,
      monthDate: `${trimmed}-01`,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    },
  };
}

function monthKeyFromDb(value: unknown): string {
  const s = String(value ?? "").trim();
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}` : s;
}

function toNumber(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseFraisRetrait(description: string | null): number {
  if (!description) return 0;
  const m = /frais plateforme [\d.]+% : -([\d.]+) \$/.exec(description);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

function paMontant(row: PaTransactionRow): number {
  const cost = toNumber(row.cost_usd);
  if (cost > 0) return round2(cost);
  return round2(toNumber(row.amount));
}

function paTaxe(row: PaTransactionRow): number {
  return round2(toNumber(row.tax_usd));
}

async function fetchRedistributions(
  filter: MoisFilter,
): Promise<RedistributionRow[]> {
  const supabase = getServiceSupabase();
  const rows: RedistributionRow[] = [];
  let offset = 0;

  for (;;) {
    let query = supabase
      .from("redistribution_history")
      .select(
        "month, total_revenue, pmq_pool, ptc_pool, pcol_pool, pa_pool, total_members, value_per_point",
      )
      .order("month", { ascending: true });

    if (filter.monthDate) {
      query = query.eq("month", filter.monthDate);
    }

    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const batch = (data ?? []) as RedistributionRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

async function fetchPaTransactions(filter: MoisFilter): Promise<PaTransactionRow[]> {
  const supabase = getServiceSupabase();
  const rows: PaTransactionRow[] = [];
  let offset = 0;

  for (;;) {
    let query = supabase
      .from("pa_transactions")
      .select("id, membre_id, type, amount, cost_usd, tax_usd, description, created_at")
      .order("created_at", { ascending: true });

    if (filter.startIso && filter.endIso) {
      query = query.gte("created_at", filter.startIso).lt("created_at", filter.endIso);
    }

    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const batch = (data ?? []) as PaTransactionRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

async function fetchMouvements(filter: MoisFilter): Promise<MouvementRow[]> {
  const supabase = getServiceSupabase();
  const rows: MouvementRow[] = [];
  let offset = 0;

  for (;;) {
    let query = supabase
      .from("banque_membres_mouvements")
      .select("montant, type, description, created_at")
      .order("created_at", { ascending: true });

    if (filter.startIso && filter.endIso) {
      query = query.gte("created_at", filter.startIso).lt("created_at", filter.endIso);
    }

    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const batch = (data ?? []) as MouvementRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

function buildSection1(redistributions: RedistributionRow[]): string[] {
  const lines: string[] = [];
  lines.push("Section 1 — REDISTRIBUTIONS");
  lines.push(
    [
      "date",
      "revenus",
      "PMQ pool",
      "PTC pool",
      "PCOL pool",
      "PA pool",
      "membres",
      "valeur/pt",
    ]
      .map(csvCell)
      .join(","),
  );

  for (const row of redistributions) {
    const vppRaw = row.value_per_point;
    const vpp =
      vppRaw != null && vppRaw !== "" && Number.isFinite(Number(vppRaw))
        ? round2(Number(vppRaw))
        : "";
    lines.push(
      [
        csvCell(monthKeyFromDb(row.month)),
        csvCell(round2(toNumber(row.total_revenue))),
        csvCell(round2(toNumber(row.pmq_pool))),
        csvCell(round2(toNumber(row.ptc_pool))),
        csvCell(round2(toNumber(row.pcol_pool))),
        csvCell(round2(toNumber(row.pa_pool))),
        csvCell(Math.trunc(toNumber(row.total_members))),
        csvCell(vpp),
      ].join(","),
    );
  }

  return lines;
}

function buildSection2(mouvements: MouvementRow[], paTransactions: PaTransactionRow[]): string[] {
  let fraisPlateformeMouvements = 0;
  let fraisRetraits = 0;

  for (const m of mouvements) {
    const type = String(m.type ?? "").trim();
    if (type === "frais_plateforme") {
      fraisPlateformeMouvements += Math.abs(toNumber(m.montant));
    } else if (type === "retrait") {
      fraisRetraits += parseFraisRetrait(m.description);
    }
  }

  let paTaxTotal = 0;
  for (const tx of paTransactions) {
    const desc = String(tx.description ?? "");
    const taxe = paTaxe(tx);
    if (desc.includes("Taxe 2%") || taxe > 0) {
      paTaxTotal += taxe;
    }
  }

  const taxePa = round2(paTaxTotal * PA_TAX_COMMUNAUTE_SHARE);
  const taxeFonctionnement = round2(paTaxTotal * PA_TAX_FONCTIONNEMENT_SHARE);
  const totalCollecte = round2(fraisPlateformeMouvements + fraisRetraits + taxeFonctionnement);

  return [
    "",
    "Section 2 — FRAIS PLATEFORME",
    ["total collecté", "taxe PA", "frais retraits"].map(csvCell).join(","),
    [csvCell(totalCollecte), csvCell(taxePa), csvCell(round2(fraisRetraits))].join(","),
  ];
}

function buildSection3(paTransactions: PaTransactionRow[]): string[] {
  const lines: string[] = [
    "",
    "Section 3 — TRANSACTIONS PA",
    ["date", "type", "montant", "taxe 2%"].map(csvCell).join(","),
  ];

  for (const tx of paTransactions) {
    lines.push(
      [
        csvCell(formatDate(tx.created_at)),
        csvCell(tx.type ?? ""),
        csvCell(paMontant(tx)),
        csvCell(paTaxe(tx)),
      ].join(","),
    );
  }

  return lines;
}

function buildSection4(mouvements: MouvementRow[]): string[] {
  let totalCredite = 0;
  for (const m of mouvements) {
    const montant = toNumber(m.montant);
    if (montant > 0) totalCredite += montant;
  }

  return [
    "",
    "Section 4 — BANQUE MEMBRES",
    [csvCell("total crédité aux membres")].join(","),
    [csvCell(round2(totalCredite))].join(","),
  ];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const { filter, error: moisError } = parseMoisParam(url.searchParams.get("mois"));
  if (moisError) {
    return NextResponse.json({ error: moisError }, { status: 400 });
  }

  try {
    const [redistributions, paTransactions, mouvements] = await Promise.all([
      fetchRedistributions(filter),
      fetchPaTransactions(filter),
      fetchMouvements(filter),
    ]);

    const csvLines = [
      ...buildSection1(redistributions),
      ...buildSection2(mouvements, paTransactions),
      ...buildSection3(paTransactions),
      ...buildSection4(mouvements),
    ];

    const csv = `\uFEFF${csvLines.join("\r\n")}\r\n`;
    const filename = filter.monthKey
      ? `leve-comptabilite-${filter.monthKey}.csv`
      : "leve-comptabilite-complet.csv";

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

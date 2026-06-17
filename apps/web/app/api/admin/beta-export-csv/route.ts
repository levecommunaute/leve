import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

type BetaProfile = {
  numero_membre: number | string | null;
  display_name: string | null;
  email: string | null;
  beta_points: number | string | null;
  beta_temps_total_secondes: number | string | null;
  beta_derniere_activite: string | null;
};

function toNumber(raw: number | string | null): number {
  const n = typeof raw === "number" ? raw : Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatDateHeure(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statut(derniereActivite: string | null): string {
  if (!derniereActivite) return "Absent";
  const t = new Date(derniereActivite).getTime();
  if (Number.isNaN(t)) return "Absent";
  const heures = (Date.now() - t) / 3_600_000;
  if (heures < 24) return "Actif";
  if (heures <= 72) return "Inactif";
  return "Absent";
}

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "numero_membre, display_name, email, beta_points, beta_temps_total_secondes, beta_derniere_activite",
      )
      .eq("is_beta_tester", true)
      .order("beta_points", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as BetaProfile[];
    const header = [
      "N° Membre",
      "Nom",
      "Email",
      "Temps Total (min)",
      "Points Beta",
      "Dernière Activité",
      "Statut",
    ];

    const lines = rows.map((r) => {
      const minutes = Math.floor(toNumber(r.beta_temps_total_secondes) / 60);
      return [
        csvCell(r.numero_membre != null ? String(r.numero_membre) : ""),
        csvCell(r.display_name ?? ""),
        csvCell(r.email ?? ""),
        csvCell(minutes),
        csvCell(toNumber(r.beta_points)),
        csvCell(formatDateHeure(r.beta_derniere_activite)),
        csvCell(statut(r.beta_derniere_activite)),
      ].join(",");
    });

    const csv = `\uFEFF${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="beta-testeurs.csv"',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const PMQ_POINT_TYPES = ["code", "quiz"] as const;

type PointsTxRow = {
  id: string;
  created_at: string;
  amount: number | string | null;
  type: string | null;
};

type BanqueMouvementRow = {
  id: string;
  created_at: string;
  montant: number | string | null;
  type: string | null;
  description: string | null;
};

export type SoldeTransaction = {
  id: string;
  created_at: string;
  description: string;
  amount: number;
  kind: "points" | "dollars";
};

function transactionDescription(type: string | null | undefined): string {
  const t = (type ?? "").toLowerCase();
  if (t === "redistribution") return "Redistribution PMQ";
  if (
    t === "code" ||
    t === "video_code" ||
    t === "code_secret" ||
    t === "fragment"
  ) {
    return "Points code vidéo";
  }
  if (t === "quiz" || t === "quiz_bonus") return "Bonus quiz";
  if (t === "adjustment" || t === "manual") return "Ajustement solde";
  if (type?.trim()) return type.replace(/_/g, " ");
  return "Transaction";
}

async function resolveDbClient(
  request: NextRequest,
): Promise<{ client: SupabaseClient; uid: string } | NextResponse> {
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();

  if (bearer) {
    const authClient = createClient(SB_URL, SB_ANON);
    const {
      data: { user },
      error,
    } = await authClient.auth.getUser(bearer);
    if (error || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const client = createClient(SB_URL, SB_ANON, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return { client, uid: user.id };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  return { client: supabase, uid: user.id };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const resolved = await resolveDbClient(request);
  if (resolved instanceof NextResponse) return resolved;

  const { client, uid } = resolved;

  const [banqueRes, sumRes, pointsListRes, mouvementsRes] = await Promise.all([
    client
      .from("banque_membres")
      .select("solde_dollars")
      .eq("membre_id", uid)
      .maybeSingle(),
    client
      .from("points_transactions")
      .select("amount")
      .eq("membre_id", uid)
      .in("type", [...PMQ_POINT_TYPES]),
    client
      .from("points_transactions")
      .select("id, created_at, amount, type")
      .eq("membre_id", uid)
      .in("type", [...PMQ_POINT_TYPES])
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("banque_membres_mouvements")
      .select("id, created_at, montant, type, description")
      .eq("membre_id", uid)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const err =
    banqueRes.error ??
    sumRes.error ??
    pointsListRes.error ??
    mouvementsRes.error;
  if (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const solde_dollars = Number(banqueRes.data?.solde_dollars ?? 0);
  const total_points_pmq = (sumRes.data ?? []).reduce(
    (acc, row) => acc + Number(row.amount ?? 0),
    0,
  );

  const transactions: SoldeTransaction[] = [];
  for (const row of (pointsListRes.data ?? []) as PointsTxRow[]) {
    transactions.push({
      id: `pt-${row.id}`,
      created_at: row.created_at,
      description: transactionDescription(row.type),
      amount: Number(row.amount ?? 0),
      kind: "points",
    });
  }
  for (const row of (mouvementsRes.data ?? []) as BanqueMouvementRow[]) {
    transactions.push({
      id: `bm-${row.id}`,
      created_at: row.created_at,
      description:
        row.description?.trim() ||
        (row.type === "redistribution"
          ? "Redistribution PMQ"
          : row.type?.replace(/_/g, " ") || "Crédit banque"),
      amount: Number(row.montant ?? 0),
      kind: "dollars",
    });
  }
  transactions.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return NextResponse.json({
    solde_dollars,
    solde: solde_dollars,
    total_points_pmq,
    total_points: total_points_pmq,
    transactions: transactions.slice(0, 20),
  });
}

import { createServerClient } from "@repo/supabase/server";
import { NextResponse } from "next/server";

/** Placeholder: valeur indicative en $ CAD par point PMQ jusqu’à la vraie redistribution. */
const CAD_PER_POINT = 0.1;

type PointsTxRow = {
  id: string;
  created_at: string;
  amount: number | string | null;
  type: string | null;
  metadata: Record<string, unknown> | null;
};

export type SoldeTransaction = {
  id: string;
  created_at: string;
  description: string;
  amount: number;
};

function transactionDescription(
  type: string | null | undefined,
  metadata: Record<string, unknown> | null,
): string {
  const t = (type ?? "").toLowerCase();
  if (t === "redistribution") {
    const month =
      typeof metadata?.month === "string" ? metadata.month : null;
    return month
      ? `Redistribution PMQ — ${month}`
      : "Redistribution PMQ";
  }
  if (
    t === "code" ||
    t === "video_code" ||
    t === "code_secret" ||
    t === "fragment"
  ) {
    const title =
      typeof metadata?.video_title === "string"
        ? metadata.video_title
        : typeof metadata?.title === "string"
          ? metadata.title
          : null;
    return title ? `Code vidéo — ${title}` : "Points code vidéo";
  }
  if (t === "quiz" || t === "quiz_bonus") {
    return "Bonus quiz";
  }
  if (t === "adjustment" || t === "manual") {
    return "Ajustement solde";
  }
  if (type?.trim()) {
    return type.replace(/_/g, " ");
  }
  return "Transaction";
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const uid = user.id;

  const [sumRes, listRes] = await Promise.all([
    supabase.from("points_transactions").select("amount").eq("user_id", uid),
    supabase
      .from("points_transactions")
      .select("id, created_at, amount, type, metadata")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (sumRes.error) {
    return NextResponse.json(
      { error: sumRes.error.message },
      { status: 500 },
    );
  }
  if (listRes.error) {
    return NextResponse.json(
      { error: listRes.error.message },
      { status: 500 },
    );
  }

  const rows = sumRes.data ?? [];
  const total_points = rows.reduce(
    (acc, row) => acc + Number(row.amount ?? 0),
    0,
  );
  const estimated_cad = total_points * CAD_PER_POINT;

  const rawList = (listRes.data ?? []) as PointsTxRow[];
  const transactions: SoldeTransaction[] = rawList.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    description: transactionDescription(row.type, row.metadata),
    amount: Number(row.amount ?? 0),
  }));

  return NextResponse.json({
    total_points,
    estimated_cad,
    transactions,
  });
}

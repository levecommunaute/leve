import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import { currentMonthStartIso } from "../../../../lib/rang-config";

export const dynamic = "force-dynamic";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PAGE_SIZE = 1000;

async function resolveAuthUser(
  request: NextRequest,
): Promise<{ uid: string } | NextResponse> {
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
    return { uid: user.id };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  return { uid: user.id };
}

function currentMonthEndIso(d = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
}

async function sumQuizPtsPonderes(
  supabase: SupabaseClient,
  opts: { membreId?: string; startIso: string; endIso: string },
): Promise<number> {
  let total = 0;
  let offset = 0;

  for (;;) {
    let query = supabase
      .from("points_ponderes")
      .select("pts_ponderes")
      .eq("type", "quiz")
      .gte("created_at", opts.startIso)
      .lt("created_at", opts.endIso);

    if (opts.membreId) {
      query = query.eq("membre_id", opts.membreId);
    }

    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    for (const row of rows) {
      const amt = Number(row.pts_ponderes ?? 0);
      if (Number.isFinite(amt)) total += amt;
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return total;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await resolveAuthUser(request);
  if (auth instanceof NextResponse) return auth;

  const startIso = currentMonthStartIso();
  const endIso = currentMonthEndIso();
  const svc = getServiceSupabase();

  try {
    const [mes_pts, total_pts] = await Promise.all([
      sumQuizPtsPonderes(svc, {
        membreId: auth.uid,
        startIso,
        endIso,
      }),
      sumQuizPtsPonderes(svc, { startIso, endIso }),
    ]);

    const pourcentage =
      total_pts > 0 ? (mes_pts / total_pts) * 100 : 0;

    return NextResponse.json({
      mes_pts,
      total_pts,
      pourcentage,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    console.error("[pmq-share]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

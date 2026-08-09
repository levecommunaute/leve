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
  opts: { membreId: string; startIso: string; endIso: string },
): Promise<number> {
  let total = 0;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("points_ponderes")
      .select("pts_ponderes")
      .eq("type", "quiz")
      .eq("membre_id", opts.membreId)
      .gte("created_at", opts.startIso)
      .lt("created_at", opts.endIso)
      .range(offset, offset + PAGE_SIZE - 1);
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

/** Pool communautaire du mois : total pts + membres distincts actifs (quiz). */
async function aggregateQuizPool(
  supabase: SupabaseClient,
  opts: { startIso: string; endIso: string },
): Promise<{ total_pts_pool: number; nb_membres_actifs: number }> {
  let total_pts_pool = 0;
  const membres = new Set<string>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("points_ponderes")
      .select("pts_ponderes, membre_id")
      .eq("type", "quiz")
      .gte("created_at", opts.startIso)
      .lt("created_at", opts.endIso)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    for (const row of rows) {
      const amt = Number(row.pts_ponderes ?? 0);
      if (Number.isFinite(amt)) total_pts_pool += amt;
      const mid = row.membre_id;
      if (typeof mid === "string" && mid.trim()) {
        membres.add(mid);
      }
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { total_pts_pool, nb_membres_actifs: membres.size };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await resolveAuthUser(request);
  if (auth instanceof NextResponse) return auth;

  const startIso = currentMonthStartIso();
  const endIso = currentMonthEndIso();
  const svc = getServiceSupabase();

  try {
    const [mes_pts, pool, membresTotalRes] = await Promise.all([
      sumQuizPtsPonderes(svc, {
        membreId: auth.uid,
        startIso,
        endIso,
      }),
      aggregateQuizPool(svc, { startIso, endIso }),
      svc
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .not("numero_membre", "is", null),
    ]);

    if (membresTotalRes.error) {
      throw new Error(membresTotalRes.error.message);
    }

    const nb_membres_total = membresTotalRes.count ?? 0;
    const total_pts = pool.total_pts_pool;
    const pourcentage =
      total_pts > 0 ? (mes_pts / total_pts) * 100 : 0;

    return NextResponse.json({
      mes_pts,
      total_pts,
      total_pts_pool: pool.total_pts_pool,
      nb_membres_actifs: pool.nb_membres_actifs,
      nb_membres_total,
      pourcentage,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    console.error("[pmq-share]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

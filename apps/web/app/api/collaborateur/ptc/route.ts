import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import { isCollaborateurMemberType } from "../../../../lib/pcol";
import { dollarsToPtcUnits, getPtcBalance, roundPtcMoney } from "../../../../lib/ptc";

export const dynamic = "force-dynamic";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function resolveUserId(request: NextRequest): Promise<string | null> {
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
    if (error || !user) return null;
    return user.id;
  }

  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

/** Bornes UTC du mois courant (équivalent DATE_TRUNC('month', NOW())). */
function currentMonthBoundsUtc(): { startIso: string; endIso: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const uid = await resolveUserId(request);
  if (!uid) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const svc = getServiceSupabase();

    const { data: profile } = await svc
      .from("profiles")
      .select("member_type")
      .eq("id", uid)
      .single();

    if (!isCollaborateurMemberType(profile?.member_type as string | null)) {
      return NextResponse.json(
        { error: "Accès réservé aux collaborateurs" },
        { status: 403 },
      );
    }

    const [membresRes, redistRes, ptcBalance] = await Promise.all([
      svc
        .from("pcol_transactions")
        .select("membre_id")
        .eq("collaborateur_id", uid)
        .not("membre_id", "is", null),
      svc
        .from("redistribution_history")
        .select("value_per_point")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getPtcBalance(),
    ]);

    if (membresRes.error) {
      return NextResponse.json({ error: membresRes.error.message }, { status: 500 });
    }
    if (redistRes.error) {
      return NextResponse.json({ error: redistRes.error.message }, { status: 500 });
    }

    const membreIds = [
      ...new Set(
        (membresRes.data ?? [])
          .map((r) => (r.membre_id != null ? String(r.membre_id) : ""))
          .filter((id) => id.length > 0),
      ),
    ];

    let ptsPerdusMois = 0;
    if (membreIds.length > 0) {
      const { startIso, endIso } = currentMonthBoundsUtc();
      const { data: ptcTxRows, error: ptcTxError } = await svc
        .from("points_transactions")
        .select("amount")
        .eq("type", "ptc")
        .in("membre_id", membreIds)
        .gte("created_at", startIso)
        .lt("created_at", endIso);

      if (ptcTxError) {
        return NextResponse.json({ error: ptcTxError.message }, { status: 500 });
      }

      // Les transactions type='ptc' sont des débits (amount négatif) : pts perdus = somme des |amount|.
      ptsPerdusMois = roundPtcMoney(
        (ptcTxRows ?? []).reduce((acc, r) => acc + Math.abs(Number(r.amount ?? 0)), 0),
      );
    }

    const valeurParPtRaw = redistRes.data?.value_per_point;
    const valeurParPtNum =
      valeurParPtRaw != null && valeurParPtRaw !== "" ? Number(valeurParPtRaw) : null;
    const valeurParPt =
      valeurParPtNum != null && Number.isFinite(valeurParPtNum) ? valeurParPtNum : null;

    const dollarsMois =
      valeurParPt != null ? roundPtcMoney(ptsPerdusMois * valeurParPt) : null;

    return NextResponse.json({
      pts_perdus_mois: ptsPerdusMois,
      valeur_par_pt: valeurParPt,
      dollars_mois: dollarsMois,
      ptc_mois: dollarsMois != null ? dollarsToPtcUnits(dollarsMois) : null,
      ptc_balance: ptcBalance,
      ptc_balance_units: dollarsToPtcUnits(ptcBalance),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import {
  PA_USD_PER_PT,
  calculerFraisPlateforme,
  crediterFraisPlateformeBalance,
  roundUSD,
} from "../../../../lib/frais-plateforme";

export const dynamic = "force-dynamic";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const PA_PRICE_CAD = PA_USD_PER_PT;

function round2(n: number): number {
  return roundUSD(n);
}

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await resolveAuthUser(request);
  if (auth instanceof NextResponse) return auth;

  let body: { membre_id?: string; pts_pa?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const membreId = typeof body.membre_id === "string" ? body.membre_id.trim() : "";
  const ptsPa = Number(body.pts_pa);

  if (!membreId || membreId !== auth.uid) {
    return NextResponse.json({ error: "membre_id invalide" }, { status: 403 });
  }
  if (!Number.isInteger(ptsPa) || ptsPa < 1) {
    return NextResponse.json({ error: "pts_pa invalide (entier ≥ 1)" }, { status: 400 });
  }

  const cout = round2(ptsPa * PA_PRICE_CAD);
  const { pourcentage: fraisPct, frais: fraisPlateforme } =
    await calculerFraisPlateforme(cout);
  const totalDebit = round2(cout + fraisPlateforme);

  const supabase = getServiceSupabase();

  const { data: banque, error: banqueError } = await supabase
    .from("banque_membres")
    .select("solde_dollars")
    .eq("membre_id", membreId)
    .maybeSingle();

  if (banqueError) {
    return NextResponse.json({ error: banqueError.message }, { status: 500 });
  }

  const solde = Number(banque?.solde_dollars ?? 0);
  if (!Number.isFinite(solde) || solde < totalDebit) {
    return NextResponse.json({ error: "Solde insuffisant" }, { status: 400 });
  }

  const nextSolde = round2(solde - totalDebit);
  const now = new Date().toISOString();

  const { error: updateBanqueError } = await supabase
    .from("banque_membres")
    .update({ solde_dollars: nextSolde, updated_at: now })
    .eq("membre_id", membreId);

  if (updateBanqueError) {
    return NextResponse.json({ error: updateBanqueError.message }, { status: 500 });
  }

  const { error: mouvementError } = await supabase.from("banque_membres_mouvements").insert({
    membre_id: membreId,
    montant: -cout,
    type: "achat_pa",
    description: `Achat ${ptsPa} pt(s) PA · ${cout.toFixed(2)} $`,
  });

  if (mouvementError) {
    return NextResponse.json({ error: mouvementError.message }, { status: 500 });
  }

  if (fraisPlateforme > 0) {
    const { error: fraisMvtErr } = await supabase.from("banque_membres_mouvements").insert({
      membre_id: membreId,
      montant: -fraisPlateforme,
      type: "frais_plateforme",
      description: `Frais plateforme ${fraisPct}% · ${fraisPlateforme.toFixed(2)} $`,
    });
    if (fraisMvtErr) {
      return NextResponse.json({ error: fraisMvtErr.message }, { status: 500 });
    }

    try {
      await crediterFraisPlateformeBalance(supabase, fraisPlateforme);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const { error: paError } = await supabase.from("pa_transactions").insert({
    membre_id: membreId,
    type: "purchase",
    amount: ptsPa,
    description: `Achat ${ptsPa} pt(s) PA`,
    cost_usd: cout,
  });

  if (paError) {
    return NextResponse.json({ error: paError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    pts_credites: ptsPa,
    cout,
    frais_plateforme: fraisPlateforme,
    frais_plateforme_pct: fraisPct,
    total_debite: totalDebit,
    solde_banque: nextSolde,
  });
}

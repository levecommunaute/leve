import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import {
  calculerFraisPlateforme,
  crediterFraisPlateformeBalance,
  roundUSD,
} from "../../../../lib/frais-plateforme";

export const dynamic = "force-dynamic";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const MIN_RETRAIT_CAD = 100;

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

  let body: { membre_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const membreId = typeof body.membre_id === "string" ? body.membre_id.trim() : "";
  if (!membreId || membreId !== auth.uid) {
    return NextResponse.json({ error: "membre_id invalide" }, { status: 403 });
  }

  const supabase = getServiceSupabase();

  const { data: banque, error: banqueError } = await supabase
    .from("banque_membres")
    .select("solde_dollars")
    .eq("membre_id", membreId)
    .maybeSingle();

  if (banqueError) {
    return NextResponse.json({ error: banqueError.message }, { status: 500 });
  }

  const montant = roundUSD(Number(banque?.solde_dollars ?? 0));
  if (montant < MIN_RETRAIT_CAD) {
    return NextResponse.json(
      { error: `Minimum ${MIN_RETRAIT_CAD.toFixed(2)} $ requis pour un retrait` },
      { status: 400 },
    );
  }

  const { pourcentage, frais } = await calculerFraisPlateforme(montant);
  const net = roundUSD(Math.max(0, montant - frais));
  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("banque_membres")
    .update({ solde_dollars: 0, updated_at: now })
    .eq("membre_id", membreId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const { error: mvtErr } = await supabase.from("banque_membres_mouvements").insert({
    membre_id: membreId,
    montant: -montant,
    type: "retrait",
    description:
      frais > 0
        ? `Retrait vers compte · net ${net.toFixed(2)} $ (frais plateforme ${pourcentage}% : -${frais.toFixed(2)} $)`
        : `Retrait vers compte · ${net.toFixed(2)} $`,
  });

  if (mvtErr) {
    return NextResponse.json({ error: mvtErr.message }, { status: 500 });
  }

  if (frais > 0) {
    try {
      await crediterFraisPlateformeBalance(supabase, frais);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    montant,
    frais_plateforme: frais,
    frais_plateforme_pct: pourcentage,
    net,
    solde_banque: 0,
  });
}

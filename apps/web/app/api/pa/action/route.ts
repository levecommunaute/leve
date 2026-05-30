import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import {
  calculerFraisPlateforme,
  calculerTaxePaUtilisation,
  crediterOperationsBalance,
  crediterTaxePaUtilisation,
  roundUSD,
} from "../../../../lib/frais-plateforme";

export const dynamic = "force-dynamic";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type ActionType = "vote_concours" | "tirage" | "pourboire";

function paActionDescription(type: ActionType): string {
  if (type === "vote_concours") return "Vote — Concours Artistes";
  if (type === "tirage") return "Ticket Tirage Trimestriel";
  return "Pourboire créateur";
}

async function resolveAuthUser(request: NextRequest): Promise<{ uid: string } | NextResponse> {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
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

  let body: {
    membre_id?: string;
    type?: ActionType;
    pts_pa?: number;
    target_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const membreId = typeof body.membre_id === "string" ? body.membre_id.trim() : "";
  const targetId = typeof body.target_id === "string" ? body.target_id.trim() : "";
  const type = body.type;
  const ptsPa = Number(body.pts_pa);

  if (!membreId || membreId !== auth.uid) {
    return NextResponse.json({ error: "membre_id invalide" }, { status: 403 });
  }
  if (!type || !["vote_concours", "tirage", "pourboire"].includes(type)) {
    return NextResponse.json({ error: "type invalide" }, { status: 400 });
  }
  if (!Number.isFinite(ptsPa) || ptsPa <= 0) {
    return NextResponse.json({ error: "pts_pa invalide" }, { status: 400 });
  }
  if (!targetId) {
    return NextResponse.json({ error: "target_id requis" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  const pts = Math.round(ptsPa);
  let effectiveDebit = pts;

  if (type === "vote_concours") {
    const { data: artistForLimit, error: artistLimitErr } = await supabase
      .from("concours_artistes")
      .select("id")
      .eq("id", targetId)
      .maybeSingle();
    if (artistLimitErr) {
      return NextResponse.json({ error: artistLimitErr.message }, { status: 500 });
    }
    if (!artistForLimit?.id) {
      return NextResponse.json({ error: "Artiste introuvable" }, { status: 404 });
    }

    const [
      { data: votes, error: votesErr },
      { data: existingVoteForArtist, error: duplicateErr },
      { data: profile, error: profileErr },
    ] = await Promise.all([
      supabase
        .from("votes_concours_artistes")
        .select("id")
        .eq("membre_id", membreId),
      supabase
        .from("votes_concours_artistes")
        .select("id")
        .eq("membre_id", membreId)
        .eq("concours_artiste_id", targetId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("member_type, multiplier")
        .eq("id", membreId)
        .maybeSingle(),
    ]);
    if (votesErr) return NextResponse.json({ error: votesErr.message }, { status: 500 });
    if (duplicateErr) return NextResponse.json({ error: duplicateErr.message }, { status: 500 });
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });
    if (existingVoteForArtist?.id) {
      return NextResponse.json(
        { error: "Vous avez déjà voté pour cet artiste" },
        { status: 400 },
      );
    }
    if ((votes ?? []).length >= 3) {
      return NextResponse.json(
        { error: "Maximum 3 votes par membre pour ce concours" },
        { status: 400 },
      );
    }
    const isFounder =
      String(profile?.member_type ?? "").toLowerCase() === "fondateur" &&
      Number(profile?.multiplier ?? 1) >= 2;
    if (isFounder && (votes ?? []).length === 0) {
      effectiveDebit = 0;
    }
  }

  if (type === "tirage") {
    const { data: ticketsRows, error: ticketErr } = await supabase
      .from("tirage_tickets")
      .select("nb_tickets")
      .eq("membre_id", membreId)
      .eq("tirage_id", targetId);
    if (ticketErr) return NextResponse.json({ error: ticketErr.message }, { status: 500 });
    const totalTickets = (ticketsRows ?? []).reduce(
      (acc, row) => acc + Number(row.nb_tickets ?? 0),
      0,
    );
    if (totalTickets >= 10) {
      return NextResponse.json({ error: "Maximum 10 tickets par trimestre" }, { status: 400 });
    }
  }

  const {
    coutUSD,
    taxe2pct,
    taxe_communaute,
    taxe_fonctionnement,
    taxDebitPts,
  } = calculerTaxePaUtilisation(effectiveDebit);
  const totalDebit = roundUSD(effectiveDebit + taxDebitPts);

  const { data: txs, error: paTxError } = await supabase
    .from("pa_transactions")
    .select("amount")
    .eq("membre_id", membreId);
  if (paTxError) return NextResponse.json({ error: paTxError.message }, { status: 500 });
  const solde = (txs ?? []).reduce((sum, tx) => sum + Number(tx.amount), 0);
  if (solde < totalDebit) {
    return NextResponse.json({ error: "Solde PA insuffisant" }, { status: 400 });
  }

  const { pourcentage: fraisPct, frais: fraisPlateforme } =
    await calculerFraisPlateforme(coutUSD);

  if (fraisPlateforme > 0) {
    const { data: banque, error: banqueErr } = await supabase
      .from("banque_membres")
      .select("solde_dollars")
      .eq("membre_id", membreId)
      .maybeSingle();
    if (banqueErr) return NextResponse.json({ error: banqueErr.message }, { status: 500 });
    const soldeBanque = Number(banque?.solde_dollars ?? 0);
    if (!Number.isFinite(soldeBanque) || soldeBanque < fraisPlateforme) {
      return NextResponse.json(
        { error: "Solde banque insuffisant pour les frais plateforme" },
        { status: 400 },
      );
    }
  }

  const actionDescription = paActionDescription(type);

  const { error: spendErr } = await supabase.from("pa_transactions").insert({
    membre_id: membreId,
    type: "spend",
    amount: -Math.round(effectiveDebit),
    description: actionDescription,
    cost_usd: coutUSD > 0 ? coutUSD : null,
  });
  if (spendErr) return NextResponse.json({ error: spendErr.message }, { status: 500 });

  if (taxe2pct > 0 && taxDebitPts > 0) {
    const { error: taxErr } = await supabase.from("pa_transactions").insert({
      membre_id: membreId,
      type: "tax",
      amount: -taxDebitPts,
      description: `Taxe 2% — ${actionDescription}`,
      cost_usd: coutUSD,
      tax_usd: taxe2pct,
      taxe: taxe2pct,
      taxe_communaute,
      taxe_fonctionnement,
    });
    if (taxErr) return NextResponse.json({ error: taxErr.message }, { status: 500 });

    try {
      await crediterTaxePaUtilisation(supabase, taxe_communaute, taxe_fonctionnement);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (fraisPlateforme > 0) {
    const { data: banque, error: banqueFetchErr } = await supabase
      .from("banque_membres")
      .select("solde_dollars")
      .eq("membre_id", membreId)
      .maybeSingle();
    if (banqueFetchErr) {
      return NextResponse.json({ error: banqueFetchErr.message }, { status: 500 });
    }
    const soldeBanque = Number(banque?.solde_dollars ?? 0);
    const nextSoldeBanque = roundUSD(soldeBanque - fraisPlateforme);
    const now = new Date().toISOString();

    const { error: banqueUpdErr } = await supabase
      .from("banque_membres")
      .update({ solde_dollars: nextSoldeBanque, updated_at: now })
      .eq("membre_id", membreId);
    if (banqueUpdErr) return NextResponse.json({ error: banqueUpdErr.message }, { status: 500 });

    const { error: fraisTxErr } = await supabase.from("pa_transactions").insert({
      membre_id: membreId,
      type: "spend",
      amount: 0,
      description: `Frais plateforme ${fraisPct}%`,
      cost_usd: fraisPlateforme,
    });
    if (fraisTxErr) return NextResponse.json({ error: fraisTxErr.message }, { status: 500 });

    try {
      await crediterOperationsBalance(supabase, fraisPlateforme);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (type === "vote_concours") {
    const { error: voteLogErr } = await supabase.from("votes_concours_artistes").insert({
      membre_id: membreId,
      concours_artiste_id: targetId,
      nb_votes: 1,
      pts_pa_depenses: effectiveDebit,
    });
    if (voteLogErr) return NextResponse.json({ error: voteLogErr.message }, { status: 500 });

    const { data: artistRow, error: artistErr } = await supabase
      .from("concours_artistes")
      .select("id, total_votes_pts")
      .eq("id", targetId)
      .maybeSingle();
    if (artistErr) return NextResponse.json({ error: artistErr.message }, { status: 500 });
    if (!artistRow?.id) {
      return NextResponse.json({ error: "Artiste introuvable" }, { status: 404 });
    }
    const nextVotes = Number(artistRow.total_votes_pts ?? 0) + 1;
    const { error: updateArtistErr } = await supabase
      .from("concours_artistes")
      .update({ total_votes_pts: nextVotes })
      .eq("id", targetId);
    if (updateArtistErr) {
      return NextResponse.json({ error: updateArtistErr.message }, { status: 500 });
    }
  }

  if (type === "tirage") {
    const { data: existing, error: existingErr } = await supabase
      .from("tirage_tickets")
      .select("id, nb_tickets")
      .eq("membre_id", membreId)
      .eq("tirage_id", targetId)
      .maybeSingle();
    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });

    if (existing?.id) {
      const next = Number(existing.nb_tickets ?? 0) + 1;
      const { error: updErr } = await supabase
        .from("tirage_tickets")
        .update({ nb_tickets: next })
        .eq("id", existing.id);
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    } else {
      const { error: insErr } = await supabase.from("tirage_tickets").insert({
        membre_id: membreId,
        tirage_id: targetId,
        nb_tickets: 1,
      });
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const TAX_RATE = 0.02;

type ActionType = "vote_concours" | "tirage" | "pourboire";

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
  let tax = Math.round(pts * TAX_RATE);

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
      tax = 0;
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

  const totalDebit = effectiveDebit + tax;
  const { data: txs, error: paTxError } = await supabase
    .from("pa_transactions")
    .select("amount")
    .eq("membre_id", membreId);
  if (paTxError) return NextResponse.json({ error: paTxError.message }, { status: 500 });
  const solde = (txs ?? []).reduce((sum, tx) => sum + Number(tx.amount), 0);
  if (solde < totalDebit) {
    return NextResponse.json({ error: "Solde PA insuffisant" }, { status: 400 });
  }

  const { error: spendErr } = await supabase.from("pa_transactions").insert({
    membre_id: membreId,
    type: "spend",
    amount: -Math.round(effectiveDebit),
    description: `Dépense PA: ${type}`,
  });
  if (spendErr) return NextResponse.json({ error: spendErr.message }, { status: 500 });

  if (tax > 0) {
    const taxRounded = Math.round(tax);
    const { error: taxErr } = await supabase.from("pa_transactions").insert({
      membre_id: membreId,
      type: "tax",
      amount: -taxRounded,
      description: "Taxe 2% sur action PA",
      tax_usd: taxRounded,
    });
    if (taxErr) return NextResponse.json({ error: taxErr.message }, { status: 500 });
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

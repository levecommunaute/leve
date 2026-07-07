import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../../lib/admin-server";
import { sendRedistributionEmail } from "../../../../../lib/emails";
import { PA_USD_PER_PT } from "../../../../../lib/frais-plateforme";
import {
  computeRankBonus,
  getRangConfig,
  sumMemberQuizPtsPonderesMonth,
} from "../../../../../lib/rang-config";
import {
  bonusRangForTier,
  computeTicketWeight,
  generateTirageSeed,
  pickWeightedWinner,
  type TirageWeightedEntry,
} from "../../../../../lib/tirage";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;
const PA_PER_TIRAGE_TICKET = 10;
const TIRAGE_GAGNANT_RATE = 0.8;
const TIRAGE_FONDATION_RATE = 0.1;
const TIRAGE_FONCTIONNEMENT_RATE = 0.1;

async function creditGagnantTirage(
  supabase: ReturnType<typeof getServiceSupabase>,
  membreId: string,
  montant: number,
  trimestre: string,
): Promise<void> {
  if (!Number.isFinite(montant) || montant <= 0) return;

  const { data: existing, error: fetchError } = await supabase
    .from("banque_membres")
    .select("solde_dollars")
    .eq("membre_id", membreId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const previous = Number(existing?.solde_dollars ?? 0);
  const nextSolde = previous + montant;
  const now = new Date().toISOString();

  if (existing) {
    const { error: updateError } = await supabase
      .from("banque_membres")
      .update({ solde_dollars: nextSolde, updated_at: now })
      .eq("membre_id", membreId);
    if (updateError) {
      throw new Error(updateError.message);
    }
  } else {
    const { error: insertError } = await supabase.from("banque_membres").insert({
      membre_id: membreId,
      solde_dollars: montant,
      updated_at: now,
    });
    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  const { error: mouvementError } = await supabase.from("banque_membres_mouvements").insert({
    membre_id: membreId,
    montant,
    type: "tirage",
    description: `Gain tirage trimestriel — ${trimestre}`,
  });
  if (mouvementError) {
    throw new Error(mouvementError.message);
  }
}

type TicketRow = {
  membre_id: string;
  nb_tickets: number | string | null;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();

    const { data: tirage, error: tirageErr } = await supabase
      .from("tirages")
      .select("id, trimestre, date_tirage, actif, gagnant_id, date_tirage_reel")
      .eq("actif", true)
      .order("date_tirage", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (tirageErr) {
      return NextResponse.json({ error: tirageErr.message }, { status: 500 });
    }
    if (!tirage?.id) {
      return NextResponse.json({ error: "Aucun tirage actif" }, { status: 404 });
    }
    if (tirage.gagnant_id || tirage.date_tirage_reel) {
      return NextResponse.json(
        { error: "Ce tirage a déjà été effectué" },
        { status: 409 },
      );
    }

    const ticketRows: TicketRow[] = [];
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("tirage_tickets")
        .select("membre_id, nb_tickets")
        .eq("tirage_id", tirage.id)
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const rows = (data ?? []) as TicketRow[];
      ticketRows.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const memberIds = [
      ...new Set(
        ticketRows
          .map((row) => String(row.membre_id ?? "").trim())
          .filter((id) => id.length > 0),
      ),
    ];

    if (memberIds.length === 0) {
      return NextResponse.json({ error: "Aucun ticket vendu pour ce tirage" }, { status: 422 });
    }

    const { data: profileRows, error: profileErr } = await supabase
      .from("profiles")
      .select("id, multiplier, display_name, email")
      .in("id", memberIds);

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    const profileById = new Map(
      (profileRows ?? []).map((row) => [String(row.id), row]),
    );

    const rangConfig = await getRangConfig();
    if (!rangConfig) {
      return NextResponse.json({ error: "Configuration des rangs introuvable" }, { status: 500 });
    }

    const bonusByMember = new Map<string, number>();
    for (const membreId of memberIds) {
      const ptsMois = await sumMemberQuizPtsPonderesMonth(membreId);
      const { rankTier } = computeRankBonus(ptsMois, rangConfig);
      bonusByMember.set(membreId, bonusRangForTier(rankTier));
    }

    const entries: TirageWeightedEntry[] = [];
    let totalTickets = 0;

    for (const row of ticketRows) {
      const membreId = String(row.membre_id ?? "").trim();
      if (!membreId) continue;

      const nb = Number(row.nb_tickets ?? 0);
      if (!Number.isFinite(nb) || nb <= 0) continue;

      const profile = profileById.get(membreId);
      const multiplicateurMembre = Number(profile?.multiplier ?? 1);
      const bonusRang = bonusByMember.get(membreId) ?? 1;
      const weight = computeTicketWeight(multiplicateurMembre, bonusRang);

      for (let i = 0; i < nb; i += 1) {
        entries.push({ membre_id: membreId, weight });
        totalTickets += 1;
      }
    }

    if (totalTickets === 0 || entries.length === 0) {
      return NextResponse.json({ error: "Aucun ticket valide pour le tirage" }, { status: 422 });
    }

    const dateTirageReel = new Date().toISOString();
    const seedSha256 = generateTirageSeed(dateTirageReel, totalTickets);
    const winner = pickWeightedWinner(entries, seedSha256);

    const montantPool = totalTickets * PA_PER_TIRAGE_TICKET * PA_USD_PER_PT;
    const montantGagnant = montantPool * TIRAGE_GAGNANT_RATE;
    const montantFondation = montantPool * TIRAGE_FONDATION_RATE;
    const montantFonctionnement = montantPool * TIRAGE_FONCTIONNEMENT_RATE;

    const { data: updated, error: updateErr } = await supabase
      .from("tirages")
      .update({
        gagnant_id: winner.membre_id,
        seed_sha256: seedSha256,
        date_tirage_reel: dateTirageReel,
        total_tickets: totalTickets,
        montant_pool: montantPool,
        montant_gagnant: montantGagnant,
        montant_fondation: montantFondation,
        montant_fonctionnement: montantFonctionnement,
        actif: false,
      })
      .eq("id", tirage.id)
      .is("gagnant_id", null)
      .select(
        "id, trimestre, gagnant_id, seed_sha256, date_tirage_reel, total_tickets, montant_pool, montant_gagnant, montant_fondation, montant_fonctionnement",
      )
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json(
        { error: "Le tirage a déjà été effectué (conflit)" },
        { status: 409 },
      );
    }

    const winnerProfile = profileById.get(winner.membre_id);
    const gagnantNom =
      winnerProfile?.display_name?.trim() ||
      winnerProfile?.email?.split("@")[0] ||
      "Membre";
    const gagnantEmail = String(winnerProfile?.email ?? "").trim();
    const trimestreLabel = String(tirage.trimestre ?? "");

    try {
      await creditGagnantTirage(supabase, winner.membre_id, montantGagnant, trimestreLabel);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const { data: bank, error: bankErr } = await supabase
      .from("banque_leve")
      .select("id, fondation_balance, operations_balance")
      .limit(1)
      .maybeSingle();

    if (bankErr) {
      return NextResponse.json({ error: bankErr.message }, { status: 500 });
    }
    if (!bank?.id) {
      return NextResponse.json({ error: "banque_leve introuvable" }, { status: 404 });
    }

    const { error: bankUpdateErr } = await supabase
      .from("banque_leve")
      .update({
        fondation_balance: Number(bank.fondation_balance ?? 0) + montantFondation,
        operations_balance: Number(bank.operations_balance ?? 0) + montantFonctionnement,
      })
      .eq("id", bank.id);

    if (bankUpdateErr) {
      return NextResponse.json({ error: bankUpdateErr.message }, { status: 500 });
    }

    if (gagnantEmail) {
      void sendRedistributionEmail(
        gagnantEmail,
        gagnantNom,
        montantGagnant,
        trimestreLabel,
        {
          kind: "tirage",
          seedSha256,
          totalTickets,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      tirage_id: updated.id,
      trimestre: updated.trimestre,
      gagnant_id: updated.gagnant_id,
      gagnant_nom: gagnantNom,
      seed_sha256: updated.seed_sha256,
      date_tirage_reel: updated.date_tirage_reel,
      total_tickets: updated.total_tickets,
      montant_pool: montantPool,
      montant_gagnant: montantGagnant,
      montant_fondation: montantFondation,
      montant_fonctionnement: montantFonctionnement,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

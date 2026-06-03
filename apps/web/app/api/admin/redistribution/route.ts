import { type NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";
import { PCOL_COLLAB_PENDING_SHARE } from "../../../../lib/pcol";

export const dynamic = "force-dynamic";

/** Répartition mensuelle LEVE (100 % du revenu du mois). */
const PMQ_RATE = 0.45;
const PRODUCTION_RATE = 0.2;
const FONDATION_RATE = 0.1;
const OPERATIONS_RATE = 0.25;

const PAGE_SIZE = 1000;
const MOUVEMENT_BATCH_SIZE = 500;

/** "2026-05" → "2026-05-01" pour la colonne date `month` de redistribution_history. */
function parseMonthInput(raw: string): { monthKey: string; monthDate: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const mon = Number(match[2]);
  if (mon < 1 || mon > 12) return null;
  const monthKey = `${match[1]}-${match[2]}`;
  return { monthKey, monthDate: `${monthKey}-01` };
}

type MemberPonderes = {
  quiz: number;
  ptc: number;
};

/** SUM(pts_ponderes) par membre_id, séparé quiz / ptc. */
async function aggregatePonderesByMember(
  supabase: SupabaseClient,
): Promise<Map<string, MemberPonderes>> {
  const totals = new Map<string, MemberPonderes>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("points_ponderes")
      .select("membre_id, pts_ponderes, type")
      .in("type", ["quiz", "ptc"])
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    for (const row of rows) {
      const membreId = String(row.membre_id ?? "").trim();
      if (!membreId) continue;
      const amt = Number(row.pts_ponderes ?? 0);
      if (!Number.isFinite(amt)) continue;
      const type = String(row.type ?? "").trim();
      const entry = totals.get(membreId) ?? { quiz: 0, ptc: 0 };
      if (type === "quiz") {
        entry.quiz += amt;
      } else if (type === "ptc") {
        entry.ptc += amt;
      }
      totals.set(membreId, entry);
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return totals;
}

/** SUM(pts_collab_ponderes) pour un mois PCOL (AAAA-MM). */
async function sumPcolCollabPonderesForMonth(
  supabase: SupabaseClient,
  monthKey: string,
): Promise<number> {
  let total = 0;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("pcol_transactions")
      .select("pts_collab_ponderes")
      .eq("mois", monthKey)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    for (const row of rows) {
      const amt = Number(row.pts_collab_ponderes ?? 0);
      if (Number.isFinite(amt)) total += amt;
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return total;
}

type PendingVideoKey = `${string}:${string}`;

function pendingVideoKey(collaborateurId: string, videoId: string): PendingVideoKey {
  return `${collaborateurId}:${videoId}`;
}

/** Points pending (8 % pondérés) par vidéo / collaborateur pour le mois PCOL. */
async function aggregatePendingPtsByVideo(
  supabase: SupabaseClient,
  monthKey: string,
): Promise<Map<PendingVideoKey, { collaborateurId: string; videoId: string; pts: number }>> {
  const totals = new Map<
    PendingVideoKey,
    { collaborateurId: string; videoId: string; pts: number }
  >();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("pcol_transactions")
      .select("collaborateur_id, video_id, pts_membres_gagnes_ponderes")
      .eq("mois", monthKey)
      .eq("type", "quiz")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    for (const row of rows) {
      const collaborateurId = String(row.collaborateur_id ?? "").trim();
      const videoId = String(row.video_id ?? "").trim();
      if (!collaborateurId || !videoId) continue;
      const ptsPonderes = Number(row.pts_membres_gagnes_ponderes ?? 0);
      if (!Number.isFinite(ptsPonderes) || ptsPonderes <= 0) continue;
      const pendingPts = ptsPonderes * PCOL_COLLAB_PENDING_SHARE;
      const key = pendingVideoKey(collaborateurId, videoId);
      const prev = totals.get(key);
      totals.set(key, {
        collaborateurId,
        videoId,
        pts: (prev?.pts ?? 0) + pendingPts,
      });
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return totals;
}

/** Crédite valeur_dollars_cumul du pending actif avec la valeur_par_pt du mois. */
async function crediterPendingMensuel(
  supabase: SupabaseClient,
  monthKey: string,
  valuePerPoint: number,
): Promise<number> {
  if (!Number.isFinite(valuePerPoint) || valuePerPoint <= 0) return 0;

  const pendingPtsByVideo = await aggregatePendingPtsByVideo(supabase, monthKey);
  if (pendingPtsByVideo.size === 0) return 0;

  let totalDollarsCredites = 0;

  for (const { collaborateurId, videoId, pts: nouveauxPtsPending } of pendingPtsByVideo.values()) {
    if (nouveauxPtsPending <= 0) continue;

    const { data: pendingRow, error: fetchErr } = await supabase
      .from("pending_pcol")
      .select("id, valeur_dollars_cumul")
      .eq("collaborateur_id", collaborateurId)
      .eq("video_id", videoId)
      .eq("statut", "pending")
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!pendingRow?.id) continue;

    const dollarAdd = nouveauxPtsPending * valuePerPoint;
    totalDollarsCredites += dollarAdd;
    const prevDollars = Number(pendingRow.valeur_dollars_cumul ?? 0);

    const { error: updErr } = await supabase
      .from("pending_pcol")
      .update({
        valeur_dollars_cumul: prevDollars + dollarAdd,
      })
      .eq("id", pendingRow.id);

    if (updErr) throw new Error(updErr.message);
  }

  return totalDollarsCredites;
}

/** Crédite le solde $ et journalise le mouvement pour chaque membre. */
async function creditBanqueMembres(
  supabase: SupabaseClient,
  credits: { membre_id: string; gain: number; description: string }[],
): Promise<void> {
  for (const { membre_id, gain, description } of credits) {
    if (!Number.isFinite(gain) || gain <= 0) continue;

    const { data: existing, error: fetchError } = await supabase
      .from("banque_membres")
      .select("solde_dollars")
      .eq("membre_id", membre_id)
      .maybeSingle();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    const previous = Number(existing?.solde_dollars ?? 0);
    const nextSolde = previous + gain;
    const now = new Date().toISOString();

    if (existing) {
      const { error: updateError } = await supabase
        .from("banque_membres")
        .update({ solde_dollars: nextSolde, updated_at: now })
        .eq("membre_id", membre_id);
      if (updateError) {
        throw new Error(updateError.message);
      }
    } else {
      const { error: insertError } = await supabase.from("banque_membres").insert({
        membre_id,
        solde_dollars: gain,
        updated_at: now,
      });
      if (insertError) {
        throw new Error(insertError.message);
      }
    }

  }

  const mouvementRows = credits
    .filter((c) => Number.isFinite(c.gain) && c.gain > 0)
    .map((c) => ({
      membre_id: c.membre_id,
      montant: c.gain,
      type: "redistribution",
      description: c.description,
    }));

  for (let i = 0; i < mouvementRows.length; i += MOUVEMENT_BATCH_SIZE) {
    const batch = mouvementRows.slice(i, i + MOUVEMENT_BATCH_SIZE);
    const { error: mouvementError } = await supabase
      .from("banque_membres_mouvements")
      .insert(batch);
    if (mouvementError) {
      throw new Error(mouvementError.message);
    }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: { month?: string; total_revenue?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed =
    typeof body.month === "string" ? parseMonthInput(body.month) : null;
  const totalRevenue = Number(body.total_revenue);

  if (!parsed) {
    return NextResponse.json(
      { error: "month attendu (format AAAA-MM)" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(totalRevenue) || totalRevenue <= 0) {
    return NextResponse.json({ error: "total_revenue invalide" }, { status: 400 });
  }

  const { monthKey, monthDate } = parsed;

  try {
    const supabase = getServiceSupabase();

    const { data: existing, error: existingError } = await supabase
      .from("redistribution_history")
      .select("id")
      .eq("month", monthDate)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json(
        { error: `Une redistribution existe déjà pour ${monthKey}` },
        { status: 409 },
      );
    }

    const { data: bank, error: bankError } = await supabase
      .from("banque_leve")
      .select(
        "id, total_revenue, pmq_balance, production_balance, fondation_balance, operations_balance, ptc_balance, pcol_balance",
      )
      .limit(1)
      .maybeSingle();

    if (bankError) {
      return NextResponse.json({ error: bankError.message }, { status: 500 });
    }
    if (!bank) {
      return NextResponse.json({ error: "banque_leve introuvable" }, { status: 404 });
    }

    const pmqPool = totalRevenue * PMQ_RATE;
    const productionPool = totalRevenue * PRODUCTION_RATE;
    const fondationPool = totalRevenue * FONDATION_RATE;
    const operationsPool = totalRevenue * OPERATIONS_RATE;

    const ponderesByMember = await aggregatePonderesByMember(supabase);

    let totalPoids = 0;
    let totalPtcPonderes = 0;
    const quizWeights: { membre_id: string; quiz_pts: number }[] = [];

    for (const [membreId, { quiz, ptc }] of ponderesByMember) {
      totalPoids += quiz + ptc;
      totalPtcPonderes += ptc;
      if (quiz > 0) {
        quizWeights.push({ membre_id: membreId, quiz_pts: quiz });
      }
    }

    if (totalPoids <= 0) {
      return NextResponse.json(
        {
          pmq_pool: pmqPool,
          value_per_point: null,
          total_distributed: 0,
          total_members: 0,
          ptc_total: 0,
          error: "Aucun point pondéré (quiz ou ptc)",
        },
        { status: 422 },
      );
    }

    const valuePerPoint = pmqPool / totalPoids;
    const ptcTotal = totalPtcPonderes * valuePerPoint;
    const totalPcolPtsPonderes = await sumPcolCollabPonderesForMonth(
      supabase,
      monthKey,
    );
    const totalPcolDollars = totalPcolPtsPonderes * valuePerPoint;
    let totalDistributed = 0;
    const bankCredits: { membre_id: string; gain: number; description: string }[] =
      [];

    for (const m of quizWeights) {
      const payout = m.quiz_pts * valuePerPoint;
      totalDistributed += payout;
      bankCredits.push({
        membre_id: m.membre_id,
        gain: payout,
        description: `Redistribution PMQ — ${monthKey}`,
      });
    }

    const { error: histError } = await supabase.from("redistribution_history").insert({
      month: monthDate,
      total_revenue: totalRevenue,
      pmq_pool: pmqPool,
      ptc_pool: ptcTotal,
      pcol_pool: totalPcolDollars,
      pa_pool: 0,
      total_members: quizWeights.length,
      value_per_point: valuePerPoint,
    });

    if (histError) {
      return NextResponse.json({ error: histError.message }, { status: 500 });
    }

    let pendingDollarsCredites = 0;
    try {
      pendingDollarsCredites = await crediterPendingMensuel(
        supabase,
        monthKey,
        valuePerPoint,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }

    for (let i = 0; i < bankCredits.length; i += MOUVEMENT_BATCH_SIZE) {
      const batch = bankCredits.slice(i, i + MOUVEMENT_BATCH_SIZE);
      try {
        await creditBanqueMembres(supabase, batch);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    const { error: updateBankError } = await supabase
      .from("banque_leve")
      .update({
        total_revenue: Number(bank.total_revenue ?? 0) + totalRevenue,
        pmq_balance: Number(bank.pmq_balance ?? 0) + pmqPool,
        production_balance: Number(bank.production_balance ?? 0) + productionPool,
        fondation_balance: Number(bank.fondation_balance ?? 0) + fondationPool,
        operations_balance: Number(bank.operations_balance ?? 0) + operationsPool,
        ptc_balance: Number(bank.ptc_balance ?? 0) + ptcTotal,
        pcol_balance: Number(bank.pcol_balance ?? 0) + totalPcolDollars,
      })
      .eq("id", bank.id);

    if (updateBankError) {
      return NextResponse.json({ error: updateBankError.message }, { status: 500 });
    }

    return NextResponse.json({
      pmq_pool: pmqPool,
      value_per_point: valuePerPoint,
      total_distributed: totalDistributed,
      total_members: quizWeights.length,
      ptc_total: ptcTotal,
      pcol_total: totalPcolDollars,
      pcol_pts_ponderes: totalPcolPtsPonderes,
      pending_dollars_credites: pendingDollarsCredites,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";
import { getFeatureFlag } from "../../../../lib/feature-flags";
import {
  isCollaborateurMemberType,
  PCOL_COLLAB_PENDING_SHARE,
} from "../../../../lib/pcol";
import { sendRedistributionEmail } from "../../../../lib/emails";
import { crediterPtc } from "../../../../lib/ptc";
import { redis } from "../../../../lib/redis";

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

/**
 * SUM(pts_ponderes) par membre_id, séparé quiz / ptc.
 * Flag `redistribution-cumulee` ON → tous les points (pré-monétisation).
 * Flag OFF → filtre sur le mois (created_at).
 */
async function aggregatePonderesByMember(
  supabase: SupabaseClient,
  monthKey: string,
): Promise<Map<string, MemberPonderes>> {
  const cumulee = await getFeatureFlag("redistribution-cumulee");

  const parts = monthKey.split("-").map(Number);
  const year = parts[0] ?? new Date().getFullYear();
  const month = parts[1] ?? new Date().getMonth() + 1;
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 1).toISOString();

  const totals = new Map<string, MemberPonderes>();
  let offset = 0;

  for (;;) {
    let query = supabase
      .from("points_ponderes")
      .select("membre_id, pts_ponderes, type")
      .in("type", ["quiz", "ptc"]);

    if (!cumulee) {
      query = query.gte("created_at", startDate).lt("created_at", endDate);
    }

    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);

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

/** IDs des profils de type Collaborateur. */
async function fetchActiveCollaborateurIds(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const ids = new Set<string>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, member_type")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    for (const row of rows) {
      const id = String(row.id ?? "").trim();
      if (id && isCollaborateurMemberType(row.member_type)) {
        ids.add(id);
      }
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return ids;
}

type VideoCreditKey = `${string}:${string}`;

function videoCreditKey(collaborateurId: string, videoId: string): VideoCreditKey {
  return `${collaborateurId}:${videoId}`;
}

async function fetchVideoTitles(
  supabase: SupabaseClient,
  videoIds: string[],
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const unique = [...new Set(videoIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += MOUVEMENT_BATCH_SIZE) {
    const batch = unique.slice(i, i + MOUVEMENT_BATCH_SIZE);
    const { data, error } = await supabase
      .from("videos")
      .select("id, title")
      .in("id", batch);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      titles.set(id, String(row.title ?? "Vidéo").trim() || "Vidéo");
    }
  }
  return titles;
}

type UnpaidPcolAggregate = {
  ptsByVideo: Map<VideoCreditKey, { collaborateurId: string; videoId: string; pts: number }>;
  transactionIdsByVideo: Map<VideoCreditKey, string[]>;
};

/**
 * SUM(pts_collab_ponderes) par collaborateur+vidéo pour les pcol_transactions
 * du mois non encore payées.
 */
async function aggregateUnpaidPtsCollabForMonth(
  supabase: SupabaseClient,
  monthKey: string,
): Promise<UnpaidPcolAggregate> {
  const ptsByVideo = new Map<
    VideoCreditKey,
    { collaborateurId: string; videoId: string; pts: number }
  >();
  const transactionIdsByVideo = new Map<VideoCreditKey, string[]>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("pcol_transactions")
      .select("id, collaborateur_id, video_id, pts_collab_ponderes")
      .eq("mois", monthKey)
      .eq("paye", false)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    for (const row of rows) {
      const id = String(row.id ?? "").trim();
      const collaborateurId = String(row.collaborateur_id ?? "").trim();
      const videoId = String(row.video_id ?? "").trim();
      if (!collaborateurId) continue;
      const pts = Number(row.pts_collab_ponderes ?? 0);
      if (!Number.isFinite(pts) || pts <= 0) continue;
      const key = videoCreditKey(collaborateurId, videoId || "_");
      if (id) {
        const ids = transactionIdsByVideo.get(key) ?? [];
        ids.push(id);
        transactionIdsByVideo.set(key, ids);
      }
      const prev = ptsByVideo.get(key);
      ptsByVideo.set(key, {
        collaborateurId,
        videoId,
        pts: (prev?.pts ?? 0) + pts,
      });
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { ptsByVideo, transactionIdsByVideo };
}

/** Marque les transactions PCOL comme payées après crédit banque_membres. */
async function markPcolTransactionsPaid(
  supabase: SupabaseClient,
  transactionIds: string[],
): Promise<void> {
  if (transactionIds.length === 0) return;

  for (let i = 0; i < transactionIds.length; i += MOUVEMENT_BATCH_SIZE) {
    const batch = transactionIds.slice(i, i + MOUVEMENT_BATCH_SIZE);
    const { error } = await supabase
      .from("pcol_transactions")
      .update({ paye: true })
      .in("id", batch);
    if (error) {
      throw new Error(error.message);
    }
  }
}

type BankCredit = { membre_id: string; gain: number; description: string };

/**
 * 12 % directs : crédite banque_membres pour chaque collaborateur actif
 * (pts_collab_ponderes du mois non payés × value_per_point), par vidéo.
 */
async function crediterPcol12Direct(
  supabase: SupabaseClient,
  monthKey: string,
  valuePerPoint: number,
): Promise<{
  credits: BankCredit[];
  totalDollars: number;
  transactionIdsToMarkPaid: string[];
}> {
  if (!Number.isFinite(valuePerPoint) || valuePerPoint <= 0) {
    return { credits: [], totalDollars: 0, transactionIdsToMarkPaid: [] };
  }

  const actifs = await fetchActiveCollaborateurIds(supabase);
  const { ptsByVideo, transactionIdsByVideo } = await aggregateUnpaidPtsCollabForMonth(
    supabase,
    monthKey,
  );

  const videoIds = [...ptsByVideo.values()].map((v) => v.videoId).filter(Boolean);
  const titles = await fetchVideoTitles(supabase, videoIds);

  const credits: BankCredit[] = [];
  const transactionIdsToMarkPaid: string[] = [];
  let totalDollars = 0;

  for (const [key, { collaborateurId, videoId, pts }] of ptsByVideo) {
    if (!actifs.has(collaborateurId) || pts <= 0) continue;
    const gain = pts * valuePerPoint;
    if (!Number.isFinite(gain) || gain <= 0) continue;
    totalDollars += gain;
    const titre = videoId ? (titles.get(videoId) ?? videoId.slice(0, 8)) : "—";
    credits.push({
      membre_id: collaborateurId,
      gain,
      description: `PCOL redistribution ${monthKey} — vidéo ${titre}`,
    });
    const ids = transactionIdsByVideo.get(key);
    if (ids?.length) transactionIdsToMarkPaid.push(...ids);
  }

  return {
    credits,
    totalDollars,
    transactionIdsToMarkPaid,
  };
}

/**
 * Ratio de récupération du pending 8 % à partir de pourcentage_fixe (12–20).
 * Ex. fixe=20 → 1.0 ; fixe=18 → 0.75 ; fixe=12 → 0.
 */
function pendingRecoveryRatio(pourcentageFixe: number): number {
  const pendingPctPoints = PCOL_COLLAB_PENDING_SHARE * 100; // 8
  const immediatePctPoints = 12;
  const recoveredPending = pourcentageFixe - immediatePctPoints;
  if (!Number.isFinite(recoveredPending) || pendingPctPoints <= 0) return 0;
  return Math.min(1, Math.max(0, recoveredPending / pendingPctPoints));
}

type TransferredTrancheRow = {
  id: string;
  collaborateurId: string;
  videoId: string;
  mois: string;
  pts: number;
  pourcentageFixe: number;
};

/** Tranches pending non payées, pending_pcol transferred, mois <= monthKey. */
async function fetchUnpaidTransferredTranches(
  supabase: SupabaseClient,
  monthKey: string,
): Promise<TransferredTrancheRow[]> {
  const results: TransferredTrancheRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("pending_pcol_tranches")
      .select(
        "id, collaborateur_id, video_id, mois, pts, pending_pcol!inner(statut, pourcentage_fixe)",
      )
      .lte("mois", monthKey)
      .eq("paye", false)
      .eq("pending_pcol.statut", "transferred")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    for (const row of rows) {
      const id = String(row.id ?? "").trim();
      const collaborateurId = String(row.collaborateur_id ?? "").trim();
      const videoId = String(row.video_id ?? "").trim();
      const mois = String(row.mois ?? "").trim();
      const pts = Number(row.pts ?? 0);
      const pending = row.pending_pcol as
        | { statut?: string; pourcentage_fixe?: number | null }
        | { statut?: string; pourcentage_fixe?: number | null }[]
        | null;
      const pendingRow = Array.isArray(pending) ? pending[0] : pending;
      const pourcentageFixe = Number(pendingRow?.pourcentage_fixe ?? 12);
      if (!id || !collaborateurId || !mois || !(pts > 0)) continue;
      results.push({
        id,
        collaborateurId,
        videoId,
        mois,
        pts,
        pourcentageFixe: Number.isFinite(pourcentageFixe) ? pourcentageFixe : 12,
      });
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return results;
}

async function markPendingTranchesPaid(
  supabase: SupabaseClient,
  trancheIds: string[],
): Promise<void> {
  if (trancheIds.length === 0) return;

  for (let i = 0; i < trancheIds.length; i += MOUVEMENT_BATCH_SIZE) {
    const batch = trancheIds.slice(i, i + MOUVEMENT_BATCH_SIZE);
    const { error } = await supabase
      .from("pending_pcol_tranches")
      .update({ paye: true })
      .in("id", batch);
    if (error) {
      throw new Error(error.message);
    }
  }
}

/**
 * Pending 8 % recovered : crédite banque pour les tranches transferred (mois <= monthKey).
 * valeur = pts × (pourcentage_fixe - 12) / 8 × value_per_point du mois de la tranche.
 */
async function crediterPendingTranchesTransferred(
  supabase: SupabaseClient,
  monthKey: string,
  valuePerPoint: number,
): Promise<{
  credits: BankCredit[];
  totalDollars: number;
  trancheIdsToMarkPaid: string[];
  ptcDollars: number;
}> {
  if (!Number.isFinite(valuePerPoint) || valuePerPoint <= 0) {
    return { credits: [], totalDollars: 0, trancheIdsToMarkPaid: [], ptcDollars: 0 };
  }

  const actifs = await fetchActiveCollaborateurIds(supabase);
  const tranches = await fetchUnpaidTransferredTranches(supabase, monthKey);
  if (tranches.length === 0) {
    return { credits: [], totalDollars: 0, trancheIdsToMarkPaid: [], ptcDollars: 0 };
  }

  const titles = await fetchVideoTitles(
    supabase,
    tranches.map((t) => t.videoId),
  );

  // VPP historique pour les tranches de mois antérieurs déjà redistribués.
  const priorMonths = [
    ...new Set(tranches.map((t) => t.mois).filter((m) => m !== monthKey)),
  ];
  const vppByMonth = new Map<string, number>([[monthKey, valuePerPoint]]);
  if (priorMonths.length > 0) {
    const monthDates = priorMonths.map((m) => `${m}-01`);
    const { data: histRows, error: histErr } = await supabase
      .from("redistribution_history")
      .select("month, value_per_point")
      .in("month", monthDates);
    if (histErr) throw new Error(histErr.message);
    for (const row of histRows ?? []) {
      const monthRaw = String(row.month ?? "");
      const key = monthRaw.slice(0, 7);
      const vpp = Number(row.value_per_point ?? 0);
      if (key && Number.isFinite(vpp) && vpp > 0) {
        vppByMonth.set(key, vpp);
      }
    }
  }

  // Agrège par collaborateur+vidéo+mois pour un mouvement lisible.
  const byVideo = new Map<
    string,
    {
      collaborateurId: string;
      videoId: string;
      mois: string;
      gain: number;
      trancheIds: string[];
    }
  >();
  let ptcDollars = 0;

  for (const t of tranches) {
    if (!actifs.has(t.collaborateurId)) continue;
    const vpp = vppByMonth.get(t.mois) ?? valuePerPoint;
    if (!(vpp > 0)) continue;
    const ratio = pendingRecoveryRatio(t.pourcentageFixe);
    const recoveredPts = t.pts * ratio;
    const lostPts = t.pts - recoveredPts;
    const gain = recoveredPts * vpp;
    ptcDollars += lostPts * vpp;

    const key = `${t.collaborateurId}:${t.videoId}:${t.mois}`;
    const prev = byVideo.get(key);
    if (prev) {
      prev.gain += gain;
      prev.trancheIds.push(t.id);
    } else {
      byVideo.set(key, {
        collaborateurId: t.collaborateurId,
        videoId: t.videoId,
        mois: t.mois,
        gain,
        trancheIds: [t.id],
      });
    }
  }

  const credits: BankCredit[] = [];
  const trancheIdsToMarkPaid: string[] = [];
  let totalDollars = 0;

  for (const { collaborateurId, videoId, mois, gain, trancheIds } of byVideo.values()) {
    trancheIdsToMarkPaid.push(...trancheIds);
    if (!(gain > 0)) continue;
    totalDollars += gain;
    const titre = titles.get(videoId) ?? videoId.slice(0, 8);
    credits.push({
      membre_id: collaborateurId,
      gain,
      description: `PCOL redistribution ${mois} — vidéo ${titre}`,
    });
  }

  return { credits, totalDollars, trancheIdsToMarkPaid, ptcDollars };
}

/** Crédite le solde $ et journalise le mouvement pour chaque membre. */
async function creditBanqueMembres(
  supabase: SupabaseClient,
  credits: BankCredit[],
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
  console.log("monthKey:", monthKey, "monthDate:", monthDate);

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

    const ponderesByMember = await aggregatePonderesByMember(supabase, monthKey);

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
    const bankCredits: BankCredit[] = [];

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
      console.log("redistribution_history insert error:", histError);
      return NextResponse.json({ error: histError.message }, { status: 500 });
    }

    let pcol12DollarsCredites = 0;
    let pendingDollarsCredites = 0;
    let pendingPtcDollars = 0;
    let pcolTransactionIdsToMarkPaid: string[] = [];
    let pendingTrancheIdsToMarkPaid: string[] = [];
    try {
      const {
        credits: pcol12Credits,
        totalDollars: pcol12Total,
        transactionIdsToMarkPaid,
      } = await crediterPcol12Direct(supabase, monthKey, valuePerPoint);
      pcol12DollarsCredites = pcol12Total;
      pcolTransactionIdsToMarkPaid = transactionIdsToMarkPaid;
      bankCredits.push(...pcol12Credits);

      const {
        credits: pendingCredits,
        totalDollars: pendingTotal,
        trancheIdsToMarkPaid,
        ptcDollars,
      } = await crediterPendingTranchesTransferred(
        supabase,
        monthKey,
        valuePerPoint,
      );
      pendingDollarsCredites = pendingTotal;
      pendingTrancheIdsToMarkPaid = trancheIdsToMarkPaid;
      pendingPtcDollars = ptcDollars;
      bankCredits.push(...pendingCredits);
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

    try {
      await markPcolTransactionsPaid(supabase, pcolTransactionIdsToMarkPaid);
      await markPendingTranchesPaid(supabase, pendingTrancheIdsToMarkPaid);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }

    if (ptcTotal > 0) {
      await crediterPtc({
        montant: ptcTotal,
        source: "quiz_perdu",
        description: `Redistribution mensuelle — quiz perdus (${monthKey})`,
        mois: monthKey,
      });
    }

    if (pendingPtcDollars > 0) {
      await crediterPtc({
        montant: pendingPtcDollars,
        source: "collab_perdu",
        description: `PCOL pending non récupéré — redistribution ${monthKey}`,
        mois: monthKey,
      });
    }

    const { error: updateBankError } = await supabase
      .from("banque_leve")
      .update({
        total_revenue: Number(bank.total_revenue ?? 0) + totalRevenue,
        pmq_balance: Number(bank.pmq_balance ?? 0) + pmqPool,
        production_balance: Number(bank.production_balance ?? 0) + productionPool,
        fondation_balance: Number(bank.fondation_balance ?? 0) + fondationPool,
        operations_balance: Number(bank.operations_balance ?? 0) + operationsPool,
        pcol_balance: Number(bank.pcol_balance ?? 0) + totalPcolDollars,
      })
      .eq("id", bank.id);

    if (updateBankError) {
      return NextResponse.json({ error: updateBankError.message }, { status: 500 });
    }

    const creditsByMember = new Map<string, number>();
    for (const { membre_id, gain } of bankCredits) {
      if (!Number.isFinite(gain) || gain <= 0) continue;
      creditsByMember.set(membre_id, (creditsByMember.get(membre_id) ?? 0) + gain);
    }

    if (creditsByMember.size > 0) {
      const memberIds = [...creditsByMember.keys()];
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", memberIds);

      const profileById = new Map(
        (profileRows ?? []).map((row) => [String(row.id), row]),
      );

      for (const [membreId, montantCredite] of creditsByMember) {
        const profile = profileById.get(membreId);
        const memberEmail = String(profile?.email ?? "").trim();
        if (!memberEmail) continue;
        void sendRedistributionEmail(
          memberEmail,
          String(profile?.display_name ?? ""),
          montantCredite,
          monthKey,
        );
      }
    }

    await redis.del("classement", "transparence");

    return NextResponse.json({
      pmq_pool: pmqPool,
      value_per_point: valuePerPoint,
      total_distributed: totalDistributed,
      total_members: quizWeights.length,
      ptc_total: ptcTotal,
      pcol_total: totalPcolDollars,
      pcol_pts_ponderes: totalPcolPtsPonderes,
      pcol_12_dollars_credites: pcol12DollarsCredites,
      pending_dollars_credites: pendingDollarsCredites,
      pending_ptc_dollars: pendingPtcDollars,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

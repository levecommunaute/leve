import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import {
  currentMonthKey,
  PCOL_COLLAB_IMMEDIATE_SHARE,
  PCOL_COLLAB_PENDING_SHARE,
  PCOL_MEMBER_SHARE,
  pctRecupereFromErrors,
  pourcentageFixeFromPctRecupere,
} from "../../../../lib/pcol";
import { sendQuizCompletedEmail } from "../../../../lib/emails";
import { isCommunauteMemberType } from "../../../../lib/rank-badge";
import {
  computeRankBonus,
  getRangConfig,
  sumMemberQuizPtsPonderesMonth,
} from "../../../../lib/rang-config";

export const dynamic = "force-dynamic";

type ServiceSupabase = ReturnType<typeof getServiceSupabase>;

/** Évite les artefacts flottants (ex. 19.200000000000003) en base PCOL. */
function pcolNum(v: number): number {
  return parseFloat(Number(v).toPrecision(10));
}

/** "a" | "b" | "c" | "d" → index 0–3 dans le tableau choix. */
function letterToIndex(letter: string): number {
  const l = letter.trim().toLowerCase();
  if (l === "a" || l === "b" || l === "c" || l === "d") {
    return l.charCodeAt(0) - 97;
  }
  return -1;
}

/** bonne_reponse = lettre (a–d) ou, en legacy, texte d'une option choix[]. */
function resolveCorrectIndex(bonneReponse: string, choix: string[]): number {
  const raw = bonneReponse.trim();
  if (!raw) return -1;

  const letterIdx = letterToIndex(raw);
  if (letterIdx >= 0 && letterIdx < choix.length) return letterIdx;

  return choix.findIndex((o) => o.trim().toLowerCase() === raw.toLowerCase());
}

type AnswerItem = {
  question_id?: string;
  selected_answer?: string | null;
  selected_index?: number;
};

function answerHasSelection(ans: AnswerItem): boolean {
  if (typeof ans.selected_answer === "string" && ans.selected_answer.trim()) {
    return letterToIndex(ans.selected_answer) >= 0;
  }
  if (typeof ans.selected_index === "number" && ans.selected_index >= 0) {
    return true;
  }
  return false;
}

async function alreadySubmittedQuiz(
  svc: ServiceSupabase,
  userId: string,
  videoId: string,
): Promise<boolean> {
  const q = await svc
    .from("quiz_submissions")
    .select("id")
    .eq("membre_id", userId)
    .eq("video_id", videoId)
    .maybeSingle();

  if (!q.error && q.data?.id) return true;

  const tx = await svc
    .from("points_transactions")
    .select("id")
    .eq("membre_id", userId)
    .eq("video_id", videoId)
    .eq("type", "quiz");

  if (!tx.error && tx.data?.length) return true;

  return false;
}

/**
 * Upsert la tranche mensuelle : INSERT ou UPDATE pts += ptsPending.
 * Le crédit $ se fait uniquement à la redistribution mensuelle.
 */
async function upsertPendingTranche(
  svc: ServiceSupabase,
  params: {
    pendingPcolId: string;
    collaborateurId: string;
    videoId: string;
    mois: string;
    ptsPending: number;
  },
): Promise<{ error: string | null }> {
  const { pendingPcolId, collaborateurId, videoId, mois, ptsPending } = params;
  if (!(ptsPending > 0)) return { error: null };

  const { data: existing, error: fetchErr } = await svc
    .from("pending_pcol_tranches")
    .select("id, pts")
    .eq("pending_pcol_id", pendingPcolId)
    .eq("mois", mois)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message };

  if (existing?.id) {
    const prevPts = Number(existing.pts ?? 0);
    const { error: updErr } = await svc
      .from("pending_pcol_tranches")
      .update({ pts: pcolNum(prevPts + ptsPending) })
      .eq("id", existing.id);
    return { error: updErr?.message ?? null };
  }

  const { error: insertErr } = await svc.from("pending_pcol_tranches").insert({
    pending_pcol_id: pendingPcolId,
    collaborateur_id: collaborateurId,
    video_id: videoId,
    mois,
    pts: ptsPending,
    paye: false,
  });
  return { error: insertErr?.message ?? null };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authClient = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let body: {
    video_id?: string;
    membre_id?: string;
    answers?: AnswerItem[];
    time_remaining_seconds?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const videoId = typeof body.video_id === "string" ? body.video_id.trim() : "";
  const membreId = typeof body.membre_id === "string" ? body.membre_id.trim() : "";
  const answers = Array.isArray(body.answers) ? body.answers : [];

  if (!videoId || !membreId) {
    return NextResponse.json(
      { error: "video_id et membre_id requis" },
      { status: 400 },
    );
  }

  if (membreId !== user.id) {
    return NextResponse.json({ error: "Identité incohérente" }, { status: 403 });
  }

  try {
    const svc = getServiceSupabase();

    const { data: videoRow } = await svc
      .from("videos")
      .select("id, title, collaborateur_id, created_at, bonus_expire_at, points_value")
      .eq("id", videoId)
      .maybeSingle();

    const videoPointsValue = Number(videoRow?.points_value ?? 20);
    const POINTS_PER_CORRECT = videoPointsValue / 5;

    const bonusActive = (() => {
      const raw = videoRow?.bonus_expire_at;
      if (!raw) return false;
      const t = new Date(String(raw)).getTime();
      return Number.isFinite(t) && t > Date.now();
    })();
    const bonusMultiplier = bonusActive ? 2 : 1;

    const collaborateurId =
      videoRow?.collaborateur_id != null ? String(videoRow.collaborateur_id) : null;
    const isCollaborateurVideo = Boolean(collaborateurId);
    const isOwnVideoQuiz = collaborateurId === user.id;

    const { data: pendingForRecovery } =
      isOwnVideoQuiz && collaborateurId
        ? await svc
            .from("pending_pcol")
            .select("id, statut")
            .eq("collaborateur_id", collaborateurId)
            .eq("video_id", videoId)
            .eq("statut", "pending")
            .maybeSingle()
        : { data: null };

    const allowRecoveryResubmit = Boolean(pendingForRecovery?.id);
    const previouslySubmitted =
      !allowRecoveryResubmit && (await alreadySubmittedQuiz(svc, user.id, videoId));

    if (previouslySubmitted) {
      return NextResponse.json(
        {
          error: "already_submitted",
          message: "Quiz déjà enregistré pour cette vidéo",
        },
        { status: 409 },
      );
    }

    const ids = answers
      .map((a) => (typeof a.question_id === "string" ? a.question_id.trim() : ""))
      .filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ error: "Réponses manquantes" }, { status: 400 });
    }

    const { data: rows, error: fetchErr } = await svc
      .from("quiz_questions")
      .select("id, video_id, question, choix, bonne_reponse")
      .eq("video_id", videoId)
      .in("id", [...new Set(ids)]);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const byId = new Map((rows ?? []).map((r) => [String(r.id), r]));

    let correct = 0;
    const hasAnySelectedAnswer = answers.some(answerHasSelection);

    for (const ans of answers) {
      const qid = typeof ans.question_id === "string" ? ans.question_id.trim() : "";
      const row = byId.get(qid);
      if (!row) continue;

      const choix = (Array.isArray(row.choix) ? row.choix : []).map((o) => String(o ?? ""));
      if (choix.length === 0) continue;

      let selectedIdx = -1;
      if (typeof ans.selected_answer === "string") {
        selectedIdx = letterToIndex(ans.selected_answer);
      } else if (typeof ans.selected_index === "number") {
        selectedIdx = Math.floor(ans.selected_index);
      }
      if (selectedIdx < 0 || selectedIdx >= choix.length) continue;

      const correctIdx = resolveCorrectIndex(String(row.bonne_reponse ?? ""), choix);
      if (correctIdx >= 0 && selectedIdx === correctIdx) correct += 1;
    }

    const denom = Math.max(rows?.length ?? 0, 1);
    const errors = denom - correct;

    const { data: profile } = await svc
      .from("profiles")
      .select("multiplier, display_name, email, member_type")
      .eq("id", user.id)
      .single();
    const multiplicateur = Number(profile?.multiplier ?? 1);
    const eligibleRankBonus = isCommunauteMemberType(profile?.member_type);

    const rangConfig = await getRangConfig();
    const ptsPonderesMois = await sumMemberQuizPtsPonderesMonth(user.id);
    const { bonusRang, rankLabel } =
      eligibleRankBonus && rangConfig
        ? computeRankBonus(ptsPonderesMois, rangConfig)
        : { bonusRang: 1, rankLabel: null as string | null };

    const pointsEarned =
      correct * POINTS_PER_CORRECT * bonusMultiplier * bonusRang;
    const pointsPerdus =
      (denom - correct) * POINTS_PER_CORRECT * bonusMultiplier * bonusRang;

    const pointsEarnedPonderes = pointsEarned * multiplicateur;
    const pointsPerdusPonderes = pointsPerdus * multiplicateur;

    const multSuffix = ` · ×${multiplicateur}`;
    const bonusSuffix = bonusActive ? " · Bonus 72h ×2" : "";
    const rankSuffix = rankLabel ? ` · ${rankLabel}` : "";
    const collabSuffix = isCollaborateurVideo ? " · vidéo collaborateur" : "";
    const quizLabel = bonusActive ? "Quiz + Bonus 72h" : "Quiz vidéo";
    const quizDescription = `${quizLabel} — ${correct}/${denom} bonnes réponses · ${videoPointsValue} pts vidéo${multSuffix}${bonusSuffix}${rankSuffix}${collabSuffix}`;
    const ptcDescription = bonusActive
      ? `Quiz vidéo — points non obtenus${multSuffix} · Bonus 72h ×2`
      : `Quiz vidéo — points non obtenus${multSuffix}`;

    const ptRows: {
      membre_id: string;
      amount: number;
      type: string;
      description: string;
    }[] = [
      {
        membre_id: user.id,
        amount: pointsEarned,
        type: "quiz",
        description: quizDescription,
      },
    ];

    if (pointsPerdus > 0) {
      ptRows.push({
        membre_id: user.id,
        amount: -pointsPerdus,
        type: "ptc",
        description: ptcDescription,
      });
    }

    const ppRows: {
      membre_id: string;
      video_id: string;
      pts_bruts: number;
      multiplicateur: number;
      pts_ponderes: number;
      type: string;
    }[] = [
      {
        membre_id: user.id,
        video_id: videoId,
        pts_bruts: pointsEarned,
        multiplicateur,
        pts_ponderes: pointsEarnedPonderes,
        type: "quiz",
      },
    ];

    if (pointsPerdus > 0) {
      ppRows.push({
        membre_id: user.id,
        video_id: videoId,
        pts_bruts: pointsPerdus,
        multiplicateur,
        pts_ponderes: pointsPerdusPonderes,
        type: "ptc",
      });
    }

    // Le collaborateur ne reçoit jamais de points PMQ/PTC sur sa propre vidéo,
    // même sans pending_pcol (quiz avant le 1er membre, transferred, expired).
    const skipMemberCredits = isOwnVideoQuiz;

    if (!skipMemberCredits) {
      const { error: ptError } = await svc.from("points_transactions").insert(ptRows);

      if (ptError) {
        return NextResponse.json({ error: ptError.message }, { status: 500 });
      }

      const { error: ppError } = await svc.from("points_ponderes").insert(ppRows);

      if (ppError) {
        return NextResponse.json({ error: ppError.message }, { status: 500 });
      }

      const { error: qsError } = await svc.from("quiz_submissions").insert({
        membre_id: user.id,
        video_id: videoId,
        score: correct,
        points_awarded: pointsEarned,
      });

      if (qsError) {
        return NextResponse.json({ error: qsError.message }, { status: 500 });
      }

      void svc
        .from("profiles")
        .update({ derniere_activite: new Date().toISOString() })
        .eq("id", user.id);

      const memberEmail = String(profile?.email ?? user.email ?? "").trim();
      if (memberEmail && (correct > 0 || hasAnySelectedAnswer)) {
        void sendQuizCompletedEmail(
          memberEmail,
          String(profile?.display_name ?? ""),
          String(videoRow?.title ?? "Vidéo LEVE"),
          correct,
          denom,
          pointsEarned,
          bonusActive,
        );
      }
    }

    if (isOwnVideoQuiz && collaborateurId) {
      // Récupération : fige le % et marque transferred. Crédit $ → redistribution.
      const pctRecupere = pctRecupereFromErrors(errors);
      const pourcentageFixe = pourcentageFixeFromPctRecupere(pctRecupere);
      const recupereLe = new Date().toISOString();

      const { data: pendingRow } = await svc
        .from("pending_pcol")
        .select("id, statut")
        .eq("collaborateur_id", collaborateurId)
        .eq("video_id", videoId)
        .maybeSingle();

      const videoPublishedAt = videoRow?.created_at
        ? new Date(String(videoRow.created_at))
        : new Date();
      const dateExpiration = new Date(videoPublishedAt);
      dateExpiration.setUTCFullYear(dateExpiration.getUTCFullYear() + 1);

      if (pendingRow?.id) {
        const { error: recupErr } = await svc
          .from("pending_pcol")
          .update({
            statut: "transferred",
            pourcentage_fixe: pourcentageFixe,
            recupere_le: recupereLe,
          })
          .eq("id", pendingRow.id);

        if (recupErr) {
          return NextResponse.json({ error: recupErr.message }, { status: 500 });
        }
      } else {
        const { error: insertErr } = await svc.from("pending_pcol").insert({
          collaborateur_id: collaborateurId,
          video_id: videoId,
          points_pending_cumul: 0,
          date_expiration: dateExpiration.toISOString(),
          statut: "transferred",
          pourcentage_fixe: pourcentageFixe,
          recupere_le: recupereLe,
        });

        if (insertErr) {
          return NextResponse.json({ error: insertErr.message }, { status: 500 });
        }
      }
    } else if (isCollaborateurVideo && collaborateurId && pointsEarned > 0) {
      // PCOL se génère dès le 1er quiz membre : ne pas attendre qu'un pending_pcol existe.
      const mois = currentMonthKey();
      const ptsPonderes = pcolNum(pointsEarnedPonderes);

      const { data: existingPending } = await svc
        .from("pending_pcol")
        .select("id, statut, pourcentage_fixe, points_pending_cumul")
        .eq("collaborateur_id", collaborateurId)
        .eq("video_id", videoId)
        .maybeSingle();

      const hasPendingRow = Boolean(existingPending?.id);
      const pendingStatut = hasPendingRow
        ? String(existingPending?.statut ?? "pending")
        : "pending";
      const isTransferred = pendingStatut === "transferred";
      const isExpired = pendingStatut === "expired";
      const isTransferredOrExpired = isTransferred || isExpired;

      let ptsCollab: number;
      let ptsPending: number;
      let ptsMembresNets: number;

      if (isTransferredOrExpired) {
        // Après récupération / expiration : tout le PCOL collab va en 12 % directs
        // (pourcentage_fixe), pas de nouvelle tranche pending.
        const pourcentageFixe = isExpired
          ? 12
          : Number(
              existingPending?.pourcentage_fixe ??
                PCOL_COLLAB_IMMEDIATE_SHARE * 100,
            );
        const collabShare = pourcentageFixe / 100;
        ptsMembresNets = pcolNum(ptsPonderes * PCOL_MEMBER_SHARE);
        ptsCollab = pcolNum(ptsPonderes * collabShare);
        ptsPending = 0;
      } else {
        // Pending absent ou encore "pending" : 12 % directs + 8 % pending.
        ptsCollab = pcolNum(ptsPonderes * PCOL_COLLAB_IMMEDIATE_SHARE);
        ptsPending = pcolNum(ptsPonderes * PCOL_COLLAB_PENDING_SHARE);
        ptsMembresNets = pcolNum(ptsPonderes * PCOL_MEMBER_SHARE);
      }

      let pendingId = existingPending?.id ? String(existingPending.id) : null;

      // Premier quiz membre : créer le pending 8 % (pts bruts seulement).
      if (!hasPendingRow && ptsPending > 0) {
        const videoPublishedAt = videoRow?.created_at
          ? new Date(String(videoRow.created_at))
          : new Date();
        const dateExpiration = new Date(videoPublishedAt);
        dateExpiration.setUTCFullYear(dateExpiration.getUTCFullYear() + 1);

        const { data: insertedPending, error: pendingErr } = await svc
          .from("pending_pcol")
          .insert({
            collaborateur_id: collaborateurId,
            video_id: videoId,
            points_pending_cumul: ptsPending,
            earned_date: new Date().toISOString(),
            date_expiration: dateExpiration.toISOString(),
            statut: "pending",
          })
          .select("id")
          .single();

        if (pendingErr) {
          return NextResponse.json({ error: pendingErr.message }, { status: 500 });
        }
        pendingId = insertedPending?.id ? String(insertedPending.id) : null;
      }

      const { error: pcolErr } = await svc.from("pcol_transactions").insert({
        collaborateur_id: collaborateurId,
        video_id: videoId,
        mois,
        pts_membres_gagnes: pcolNum(pointsEarned),
        pts_collab: ptsCollab,
        pts_membres_nets: ptsMembresNets,
        multiplicateur_membre: pcolNum(multiplicateur),
        pts_membres_gagnes_ponderes: ptsPonderes,
        pts_collab_ponderes: ptsCollab,
        pts_membres_nets_ponderes: ptsMembresNets,
        type: "quiz",
        paye: false,
      });

      if (pcolErr) {
        return NextResponse.json({ error: pcolErr.message }, { status: 500 });
      }

      // Pending ouvert : cumuler pts + upsert tranche du mois.
      if (pendingId && ptsPending > 0 && pendingStatut === "pending") {
        if (hasPendingRow) {
          const prevPts = Number(existingPending?.points_pending_cumul ?? 0);
          const { error: pendingErr } = await svc
            .from("pending_pcol")
            .update({
              points_pending_cumul: pcolNum(prevPts + ptsPending),
            })
            .eq("id", pendingId);

          if (pendingErr) {
            return NextResponse.json({ error: pendingErr.message }, { status: 500 });
          }
        }

        const trancheResult = await upsertPendingTranche(svc, {
          pendingPcolId: pendingId,
          collaborateurId,
          videoId,
          mois,
          ptsPending,
        });
        if (trancheResult.error) {
          return NextResponse.json({ error: trancheResult.error }, { status: 500 });
        }
      }
    }

    return NextResponse.json({
      success: true,
      score_correct: correct,
      score_total: denom,
      points_earned: pointsEarned,
      points_earned_bruts: pointsEarned,
      points_earned_ponderes: pointsEarnedPonderes,
      points_perdus: pointsPerdus,
      points_perdus_ponderes: pointsPerdusPonderes,
      multiplicateur,
      bonus_active: bonusActive,
      bonus_rang: bonusRang,
      rank_label: rankLabel,
      collaborateur_video: isCollaborateurVideo,
      own_video_recovery: isOwnVideoQuiz,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

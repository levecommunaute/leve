import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import {
  currentMonthKey,
  PCOL_COLLAB_IMMEDIATE_SHARE,
  PCOL_COLLAB_PENDING_SHARE,
  PCOL_COLLAB_TOTAL_SHARE,
  PCOL_MEMBER_SHARE,
  pctRecupereFromErrors,
  pourcentageFixeFromPctRecupere,
} from "../../../../lib/pcol";
import { sendQuizCompletedEmail } from "../../../../lib/emails";
import { crediterPtc } from "../../../../lib/ptc";

export const dynamic = "force-dynamic";

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
  svc: ReturnType<typeof getServiceSupabase>,
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

async function creditBanqueMembre(
  svc: ReturnType<typeof getServiceSupabase>,
  membreId: string,
  montant: number,
  description: string,
): Promise<void> {
  if (!Number.isFinite(montant) || montant <= 0) return;

  const { data: existing, error: fetchError } = await svc
    .from("banque_membres")
    .select("solde_dollars")
    .eq("membre_id", membreId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);

  const previous = Number(existing?.solde_dollars ?? 0);
  const nextSolde = previous + montant;
  const now = new Date().toISOString();

  if (existing) {
    const { error: updateError } = await svc
      .from("banque_membres")
      .update({ solde_dollars: nextSolde, updated_at: now })
      .eq("membre_id", membreId);
    if (updateError) throw new Error(updateError.message);
  } else {
    const { error: insertError } = await svc.from("banque_membres").insert({
      membre_id: membreId,
      solde_dollars: montant,
      updated_at: now,
    });
    if (insertError) throw new Error(insertError.message);
  }

  const { error: mvtError } = await svc.from("banque_membres_mouvements").insert({
    membre_id: membreId,
    montant,
    type: "pcol_recuperation",
    description,
  });
  if (mvtError) throw new Error(mvtError.message);
}

async function latestValeurParPt(
  svc: ReturnType<typeof getServiceSupabase>,
): Promise<number> {
  const { data: redistRow } = await svc
    .from("redistribution_history")
    .select("value_per_point")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return Number(redistRow?.value_per_point ?? 0);
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
      .select("multiplier, display_name, email")
      .eq("id", user.id)
      .single();
    const multiplicateur = Number(profile?.multiplier ?? 1);

    const pointsEarned = correct * POINTS_PER_CORRECT * bonusMultiplier;
    const pointsPerdus = (denom - correct) * POINTS_PER_CORRECT * bonusMultiplier;

    const pointsEarnedPonderes = pointsEarned * multiplicateur;
    const pointsPerdusPonderes = pointsPerdus * multiplicateur;

    const multSuffix = ` · ×${multiplicateur}`;
    const bonusSuffix = bonusActive ? " · Bonus 72h ×2" : "";
    const collabSuffix = isCollaborateurVideo ? " · vidéo collaborateur" : "";
    const quizLabel = bonusActive ? "Quiz + Bonus 72h" : "Quiz vidéo";
    const quizDescription = `${quizLabel} — ${correct}/${denom} bonnes réponses · ${videoPointsValue} pts vidéo${multSuffix}${bonusSuffix}${collabSuffix}`;
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
      pts_bruts: number;
      multiplicateur: number;
      pts_ponderes: number;
      type: string;
    }[] = [
      {
        membre_id: user.id,
        pts_bruts: pointsEarned,
        multiplicateur,
        pts_ponderes: pointsEarnedPonderes,
        type: "quiz",
      },
    ];

    if (pointsPerdus > 0) {
      ppRows.push({
        membre_id: user.id,
        pts_bruts: pointsPerdus,
        multiplicateur,
        pts_ponderes: pointsPerdusPonderes,
        type: "ptc",
      });
    }

    const skipMemberCredits = allowRecoveryResubmit;

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
      const pctRecupere = pctRecupereFromErrors(errors);
      const pourcentageFixe = pourcentageFixeFromPctRecupere(pctRecupere);
      const recupereLe = new Date().toISOString();

      const { data: pendingRow } = await svc
        .from("pending_pcol")
        .select("id, points_pending_cumul, valeur_dollars_cumul, statut")
        .eq("collaborateur_id", collaborateurId)
        .eq("video_id", videoId)
        .maybeSingle();

      const videoPublishedAt = videoRow?.created_at
        ? new Date(String(videoRow.created_at))
        : new Date();
      const dateExpiration = new Date(videoPublishedAt);
      dateExpiration.setUTCFullYear(dateExpiration.getUTCFullYear() + 1);

      const valeurDollarsCumul = Number(pendingRow?.valeur_dollars_cumul ?? 0);
      const valeurRecuperee =
        valeurDollarsCumul > 0 && pctRecupere > 0
          ? valeurDollarsCumul * (pctRecupere / PCOL_COLLAB_PENDING_SHARE)
          : 0;
      const valeurPtc = valeurDollarsCumul - valeurRecuperee;

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
          valeur_dollars_cumul: 0,
          date_expiration: dateExpiration.toISOString(),
          statut: "transferred",
          pourcentage_fixe: pourcentageFixe,
          recupere_le: recupereLe,
        });

        if (insertErr) {
          return NextResponse.json({ error: insertErr.message }, { status: 500 });
        }
      }

      if (valeurRecuperee > 0) {
        await creditBanqueMembre(
          svc,
          collaborateurId,
          valeurRecuperee,
          `Récupération PCOL pending — vidéo ${videoId.slice(0, 8)}… (${pourcentageFixe} % fixé)`,
        );
      }

      if (valeurPtc > 0) {
        const valeurParPtRecup = await latestValeurParPt(svc);
        const ptsPerdus =
          valeurParPtRecup > 0 ? pcolNum(valeurPtc / valeurParPtRecup) : 0;
        await crediterPtc({
          montant: valeurPtc,
          source: "collab_perdu",
          ptsEquivalent: ptsPerdus,
          collaborateurId,
        });
      }
    } else if (isCollaborateurVideo && collaborateurId && pointsEarned > 0) {
      const mois = currentMonthKey();
      const ptsPonderes = pcolNum(pointsEarnedPonderes);

      const { data: existingPending } = await svc
        .from("pending_pcol")
        .select("id, statut, pourcentage_fixe, points_pending_cumul, valeur_dollars_cumul")
        .eq("collaborateur_id", collaborateurId)
        .eq("video_id", videoId)
        .maybeSingle();

      const pendingStatut = String(existingPending?.statut ?? "pending");
      const isTransferred = pendingStatut === "transferred";
      const isExpired = pendingStatut === "expired";
      const isTransferredOrExpired = isTransferred || isExpired;

      let ptsCollab: number;
      let ptsPending: number;
      let ptsMembresNets: number;
      let ptsPtc = 0;

      if (isTransferredOrExpired) {
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
        if (isExpired) {
          ptsPtc = pcolNum(ptsPonderes * PCOL_COLLAB_PENDING_SHARE);
        } else {
          const ptcShare = PCOL_COLLAB_TOTAL_SHARE - collabShare;
          if (ptcShare > 0) {
            ptsPtc = pcolNum(ptsPonderes * ptcShare);
          }
        }
      } else {
        ptsCollab = pcolNum(ptsPonderes * PCOL_COLLAB_IMMEDIATE_SHARE);
        ptsPending = pcolNum(ptsPonderes * PCOL_COLLAB_PENDING_SHARE);
        ptsMembresNets = pcolNum(ptsPonderes * PCOL_MEMBER_SHARE);
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
      });

      if (pcolErr) {
        return NextResponse.json({ error: pcolErr.message }, { status: 500 });
      }

      if (ptsPtc > 0 && !skipMemberCredits) {
        const valeurParPt = await latestValeurParPt(svc);
        const valeurPtc = pcolNum(ptsPtc * valeurParPt);
        if (valeurPtc > 0) {
          await crediterPtc({
            montant: valeurPtc,
            source: "collab_perdu",
            ptsEquivalent: ptsPtc,
            collaborateurId,
          });
        }
      }

      const canAccumulatePending = pendingStatut === "pending";

      if (ptsPending > 0 && canAccumulatePending) {
        const valeurParPt = await latestValeurParPt(svc);
        const valeurDollarsNouveaux = ptsPending * valeurParPt;

        const videoPublishedAt = videoRow?.created_at
          ? new Date(String(videoRow.created_at))
          : new Date();
        const dateExpiration = new Date(videoPublishedAt);
        dateExpiration.setUTCFullYear(dateExpiration.getUTCFullYear() + 1);

        if (existingPending?.id) {
          const prevPts = Number(existingPending.points_pending_cumul ?? 0);
          const prevDollars = Number(existingPending.valeur_dollars_cumul ?? 0);

          const { error: pendingErr } = await svc
            .from("pending_pcol")
            .update({
              points_pending_cumul: prevPts + ptsPending,
              valeur_dollars_cumul: prevDollars + valeurDollarsNouveaux,
            })
            .eq("id", existingPending.id);

          if (pendingErr) {
            return NextResponse.json({ error: pendingErr.message }, { status: 500 });
          }
        } else {
          const { error: pendingErr } = await svc.from("pending_pcol").insert({
            collaborateur_id: collaborateurId,
            video_id: videoId,
            points_pending_cumul: ptsPending,
            valeur_dollars_cumul: valeurDollarsNouveaux,
            earned_date: new Date().toISOString(),
            date_expiration: dateExpiration.toISOString(),
            statut: "pending",
          });

          if (pendingErr) {
            return NextResponse.json({ error: pendingErr.message }, { status: 500 });
          }
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
      collaborateur_video: isCollaborateurVideo,
      own_video_recovery: isOwnVideoQuiz,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

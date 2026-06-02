import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import { isCollaborateurMemberType } from "../../../../lib/pcol";

export const dynamic = "force-dynamic";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const authClient = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const svc = getServiceSupabase();

    const { data: profile } = await svc
      .from("profiles")
      .select("member_type, display_name")
      .eq("id", user.id)
      .single();

    if (!isCollaborateurMemberType(profile?.member_type as string | null)) {
      return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status: 403 });
    }

    const uid = user.id;

    const [pcolRes, videosRes, pendingRes, redistRes] = await Promise.all([
      svc
        .from("pcol_transactions")
        .select(
          "video_id, membre_id, pts_collab_ponderes, pts_membres_gagnes_ponderes, type, created_at",
        )
        .eq("collaborateur_id", uid)
        .order("created_at", { ascending: false }),
      svc
        .from("videos")
        .select("id, title, youtube_id, created_at")
        .eq("collaborateur_id", uid)
        .order("created_at", { ascending: false }),
      svc
        .from("pending_pcol")
        .select(
          "id, video_id, points_pending_cumul, valeur_dollars_cumul, date_expiration, statut, pourcentage_fixe, recupere_le",
        )
        .eq("collaborateur_id", uid)
        .order("date_expiration", { ascending: false }),
      svc
        .from("redistribution_history")
        .select("value_per_point, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (pcolRes.error) {
      return NextResponse.json({ error: pcolRes.error.message }, { status: 500 });
    }
    if (videosRes.error) {
      return NextResponse.json({ error: videosRes.error.message }, { status: 500 });
    }
    if (pendingRes.error) {
      return NextResponse.json({ error: pendingRes.error.message }, { status: 500 });
    }
    if (redistRes.error) {
      return NextResponse.json({ error: redistRes.error.message }, { status: 500 });
    }

    const pcolRows = pcolRes.data ?? [];
    const valeurParPtRaw = redistRes.data?.value_per_point;
    const valeurParPt =
      valeurParPtRaw != null && valeurParPtRaw !== ""
        ? Number(valeurParPtRaw)
        : null;
    const valeurParPtFinite =
      valeurParPt != null && Number.isFinite(valeurParPt) ? valeurParPt : null;

    const pcolGenerePonderes = pcolRows.reduce(
      (acc, r) => acc + Number(r.pts_collab_ponderes ?? 0),
      0,
    );
    const soldePcolDollars =
      valeurParPtFinite != null
        ? round2(pcolGenerePonderes * valeurParPtFinite)
        : null;

    const totalPtsGeneresPonderes = pcolRows.reduce(
      (acc, r) => acc + Number(r.pts_membres_gagnes_ponderes ?? 0),
      0,
    );

    const membresQuiz = new Set<string>();
    for (const row of pcolRows) {
      const mid = row.membre_id != null ? String(row.membre_id) : "";
      if (mid) membresQuiz.add(mid);
    }
    const totalQuizMembres = membresQuiz.size;

    const videos = videosRes.data ?? [];
    const videoTitleById = new Map(
      videos.map((v) => [String(v.id), String(v.title ?? "Vidéo")]),
    );

    const ptsCollabByVideo = new Map<string, number>();
    for (const row of pcolRows) {
      const vid = String(row.video_id ?? "");
      if (!vid) continue;
      ptsCollabByVideo.set(
        vid,
        (ptsCollabByVideo.get(vid) ?? 0) + Number(row.pts_collab_ponderes ?? 0),
      );
    }

    const pendingRows = pendingRes.data ?? [];
    const pendingList = pendingRows.map((p) => ({
      id: String(p.id),
      video_id: String(p.video_id),
      video_title: videoTitleById.get(String(p.video_id)) ?? "Vidéo",
      points_pending_cumul: Number(p.points_pending_cumul ?? 0),
      valeur_dollars_cumul: Number(p.valeur_dollars_cumul ?? 0),
      date_expiration: String(p.date_expiration ?? ""),
      statut: String(p.statut ?? "pending"),
      pourcentage_fixe:
        p.pourcentage_fixe != null ? Number(p.pourcentage_fixe) : null,
      recupere_le: p.recupere_le ? String(p.recupere_le) : null,
    }));

    const pendingByVideo = new Map(
      pendingList.map((p) => [p.video_id, p]),
    );

    const quizCountByVideo = new Map<string, Set<string>>();
    for (const row of pcolRows) {
      const vid = String(row.video_id ?? "");
      const mid = row.membre_id != null ? String(row.membre_id) : "";
      if (!vid || !mid) continue;
      if (!quizCountByVideo.has(vid)) quizCountByVideo.set(vid, new Set());
      quizCountByVideo.get(vid)!.add(mid);
    }

    const videoStats = videos.map((v) => {
      const vid = String(v.id);
      const pending = pendingByVideo.get(vid);
      return {
        videoId: vid,
        title: String(v.title ?? "Vidéo"),
        youtube_id: v.youtube_id,
        quizCount: quizCountByVideo.get(vid)?.size ?? 0,
        ptsPcolGeneres: ptsCollabByVideo.get(vid) ?? 0,
        pendingPoints: pending?.points_pending_cumul ?? 0,
        pendingDollars: pending?.valeur_dollars_cumul ?? 0,
        dateExpiration: pending?.date_expiration ?? null,
        statut: pending?.statut ?? null,
        pourcentageFixe: pending?.pourcentage_fixe ?? null,
      };
    });

    return NextResponse.json({
      display_name: profile?.display_name ?? null,
      solde_pcol_dollars: soldePcolDollars,
      pcol_genere_ponderes: pcolGenerePonderes,
      valeur_par_pt: valeurParPtFinite,
      total_pts_generes_ponderes: totalPtsGeneresPonderes,
      total_quiz_membres: totalQuizMembres,
      pending: pendingList,
      videos: videoStats,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

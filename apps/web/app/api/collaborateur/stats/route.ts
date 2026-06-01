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
        .select("id, video_id, points_amount, expires_at, status, created_at")
        .eq("collaborateur_id", uid)
        .neq("status", "recovered"),
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
      points_amount: Number(p.points_amount ?? 0),
      expires_at: String(p.expires_at ?? ""),
      status: String(p.status ?? "pending"),
      created_at: String(p.created_at ?? ""),
    }));

    const pendingSumByVideo = new Map<string, number>();
    const pendingEarliestExpiryByVideo = new Map<string, string>();
    for (const p of pendingRows) {
      const vid = String(p.video_id ?? "");
      if (!vid) continue;
      const amt = Number(p.points_amount ?? 0);
      pendingSumByVideo.set(vid, (pendingSumByVideo.get(vid) ?? 0) + amt);
      const exp = String(p.expires_at ?? "");
      if (!exp) continue;
      const prev = pendingEarliestExpiryByVideo.get(vid);
      if (!prev || new Date(exp).getTime() < new Date(prev).getTime()) {
        pendingEarliestExpiryByVideo.set(vid, exp);
      }
    }

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
      return {
        videoId: vid,
        title: String(v.title ?? "Vidéo"),
        youtube_id: v.youtube_id,
        quizCount: quizCountByVideo.get(vid)?.size ?? 0,
        ptsPcolGeneres: ptsCollabByVideo.get(vid) ?? 0,
        pendingAmount: pendingSumByVideo.get(vid) ?? 0,
        pendingExpiresAt: pendingEarliestExpiryByVideo.get(vid) ?? null,
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

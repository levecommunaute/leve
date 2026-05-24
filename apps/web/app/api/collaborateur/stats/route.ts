import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import { isCollaborateurMemberType } from "../../../../lib/pcol";

export const dynamic = "force-dynamic";

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

    const [pcolRes, videosRes, pendingRes] = await Promise.all([
      svc
        .from("pcol_transactions")
        .select("video_id, pts_collab, pts_membres_gagnes, type, created_at")
        .eq("collaborateur_id", uid)
        .order("created_at", { ascending: false }),
      svc
        .from("videos")
        .select("id, title, youtube_id, created_at")
        .eq("collaborateur_id", uid)
        .order("created_at", { ascending: false }),
      svc
        .from("pending_pcol")
        .select("id, video_id, pts_pending, date_expiration, recupere, created_at")
        .eq("collaborateur_id", uid)
        .eq("recupere", false),
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

    const pcolRows = pcolRes.data ?? [];
    const soldePcol = pcolRows.reduce((acc, r) => acc + Number(r.pts_collab ?? 0), 0);
    const totalPtsGeneres = pcolRows.reduce(
      (acc, r) => acc + Number(r.pts_membres_gagnes ?? 0),
      0,
    );

    const videos = videosRes.data ?? [];
    const videoIds = videos.map((v) => String(v.id));

    const pendingByVideo = new Map(
      (pendingRes.data ?? []).map((p) => [String(p.video_id), p]),
    );

    const ptsByVideo = new Map<string, number>();
    for (const row of pcolRows) {
      const vid = String(row.video_id ?? "");
      if (!vid) continue;
      ptsByVideo.set(vid, (ptsByVideo.get(vid) ?? 0) + Number(row.pts_membres_gagnes ?? 0));
    }

    const quizCountByVideo = new Map<string, number>();
    if (videoIds.length > 0) {
      const { data: subs } = await svc
        .from("quiz_submissions")
        .select("video_id, membre_id")
        .in("video_id", videoIds);

      const seen = new Map<string, Set<string>>();
      for (const s of subs ?? []) {
        const vid = String(s.video_id ?? "");
        const mid = String(s.membre_id ?? "");
        if (!vid || !mid) continue;
        if (!seen.has(vid)) seen.set(vid, new Set());
        seen.get(vid)!.add(mid);
      }
      for (const [vid, members] of seen) {
        quizCountByVideo.set(vid, members.size);
      }
    }

    let totalQuizMembres = 0;
    const videoStats = videos.map((v) => {
      const vid = String(v.id);
      const quizCount = quizCountByVideo.get(vid) ?? 0;
      totalQuizMembres += quizCount;
      return {
        videoId: vid,
        title: String(v.title ?? "Vidéo"),
        youtube_id: v.youtube_id,
        quizCount,
        ptsGeneres: ptsByVideo.get(vid) ?? 0,
        pending: pendingByVideo.get(vid) ?? null,
      };
    });

    return NextResponse.json({
      display_name: profile?.display_name ?? null,
      solde_pcol: soldePcol,
      total_pts_generes: totalPtsGeneres,
      total_quiz_membres: totalQuizMembres,
      videos: videoStats,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

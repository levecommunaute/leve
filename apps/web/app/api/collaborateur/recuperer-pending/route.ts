import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import { currentMonthKey, isCollaborateurMemberType } from "../../../../lib/pcol";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authClient = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let body: { pending_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const pendingId =
    typeof body.pending_id === "string" ? body.pending_id.trim() : "";
  if (!pendingId) {
    return NextResponse.json({ error: "pending_id requis" }, { status: 400 });
  }

  try {
    const svc = getServiceSupabase();

    const { data: profile } = await svc
      .from("profiles")
      .select("member_type")
      .eq("id", user.id)
      .single();

    if (!isCollaborateurMemberType(profile?.member_type as string | null)) {
      return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status: 403 });
    }

    const { data: pending, error: fetchErr } = await svc
      .from("pending_pcol")
      .select(
        "id, collaborateur_id, video_id, points_amount, expires_at, status, pts_pending, date_expiration, recupere",
      )
      .eq("id", pendingId)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!pending) {
      return NextResponse.json({ error: "Pending introuvable" }, { status: 404 });
    }
    if (String(pending.collaborateur_id) !== user.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const status = String(pending.status ?? "");
    if (status === "recovered" || pending.recupere === true) {
      return NextResponse.json({ error: "Déjà récupéré" }, { status: 409 });
    }

    const expiresRaw = pending.expires_at ?? pending.date_expiration;
    const expiresAt = new Date(String(expiresRaw ?? ""));
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "expired", message: "Ce pending a expiré (> 1 an)" },
        { status: 410 },
      );
    }

    const pts = Number(pending.points_amount ?? pending.pts_pending ?? 0);
    if (pts <= 0) {
      return NextResponse.json({ error: "Aucun point à récupérer" }, { status: 400 });
    }

    const { error: updErr } = await svc
      .from("pending_pcol")
      .update({ status: "recovered", recupere: true })
      .eq("id", pendingId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    const { error: pcolErr } = await svc.from("pcol_transactions").insert({
      collaborateur_id: user.id,
      video_id: pending.video_id,
      mois: currentMonthKey(),
      pts_membres_gagnes: 0,
      pts_collab: pts,
      pts_membres_nets: 0,
      pts_membres_gagnes_ponderes: 0,
      pts_collab_ponderes: pts,
      pts_membres_nets_ponderes: 0,
      type: "pending",
    });

    if (pcolErr) {
      await svc
        .from("pending_pcol")
        .update({ status: "pending", recupere: false })
        .eq("id", pendingId);
      return NextResponse.json({ error: pcolErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, pts_recuperes: pts });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

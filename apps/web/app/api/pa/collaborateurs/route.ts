import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import { isCollaborateurMemberType } from "../../../../lib/pcol";

export const dynamic = "force-dynamic";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type CollaborateurRow = {
  id: string;
  display_name: string | null;
  categorie: string | null;
  icone: string | null;
  member_type: string | null;
};

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await resolveAuthUser(request);
  if (auth instanceof NextResponse) return auth;

  const supabase = getServiceSupabase();

  let profilesRaw: CollaborateurRow[] | null = null;

  const withMeta = await supabase
    .from("profiles")
    .select("id, display_name, categorie, icone, member_type")
    .order("display_name", { ascending: true });

  if (withMeta.error) {
    const fallback = await supabase
      .from("profiles")
      .select("id, display_name, member_type")
      .order("display_name", { ascending: true });
    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }
    profilesRaw = (fallback.data ?? []).map((p) => ({
      ...(p as Omit<CollaborateurRow, "categorie" | "icone">),
      categorie: null,
      icone: null,
    }));
  } else {
    profilesRaw = (withMeta.data ?? []) as CollaborateurRow[];
  }

  const profiles = (profilesRaw ?? []).filter((p) =>
    isCollaborateurMemberType((p as CollaborateurRow).member_type),
  ) as CollaborateurRow[];

  if (profiles.length === 0) {
    return NextResponse.json({ collaborateurs: [] });
  }

  const ids = profiles.map((p) => p.id);

  const [{ data: videosRaw, error: videosErr }, { data: paTxRaw, error: paErr }] =
    await Promise.all([
      supabase.from("videos").select("collaborateur_id").in("collaborateur_id", ids),
      supabase.from("pa_transactions").select("membre_id, amount").in("membre_id", ids),
    ]);

  if (videosErr) {
    return NextResponse.json({ error: videosErr.message }, { status: 500 });
  }
  if (paErr) {
    return NextResponse.json({ error: paErr.message }, { status: 500 });
  }

  const videoCountById = new Map<string, number>();
  for (const row of videosRaw ?? []) {
    const cid = String(row.collaborateur_id ?? "");
    if (!cid) continue;
    videoCountById.set(cid, (videoCountById.get(cid) ?? 0) + 1);
  }

  const soldePaById = new Map<string, number>();
  for (const row of paTxRaw ?? []) {
    const mid = String(row.membre_id ?? "");
    if (!mid) continue;
    soldePaById.set(mid, (soldePaById.get(mid) ?? 0) + Number(row.amount ?? 0));
  }

  const collaborateurs = profiles.map((p) => ({
    id: p.id,
    display_name: p.display_name?.trim() || "Collaborateur",
    categorie: p.categorie?.trim() || null,
    icone: p.icone?.trim() || null,
    video_count: videoCountById.get(p.id) ?? 0,
    solde_pa: soldePaById.get(p.id) ?? 0,
  }));

  return NextResponse.json({ collaborateurs });
}

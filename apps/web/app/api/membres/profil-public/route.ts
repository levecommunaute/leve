import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import { getRankBadge } from "../../../../lib/rank-badge";

export const dynamic = "force-dynamic";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const PMQ_TYPES = [
  "quiz",
  "parrainage",
  "code",
  "fragment",
  "video_code",
  "code_secret",
  "don_recu",
  "don_envoye",
  "pa_transfer",
] as const;

async function resolveAuthUser(
  request: NextRequest,
): Promise<{ uid: string } | NextResponse> {
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();

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

function normalizeNumero(raw: string): string {
  return raw.trim();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const numero = normalizeNumero(
    request.nextUrl.searchParams.get("numero") ?? "",
  );
  if (!numero) {
    return NextResponse.json({ error: "numero requis" }, { status: 400 });
  }

  const svc = getServiceSupabase();
  const { data: profile, error } = await svc
    .from("profiles")
    .select(
      "id, display_name, member_type, multiplier, numero_membre, profil_public",
    )
    .eq("numero_membre", numero)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!profile?.id || !profile.profil_public) {
    return NextResponse.json({ error: "Profil non public" }, { status: 404 });
  }

  const [txRes, parrainagesRes] = await Promise.all([
    svc
      .from("points_transactions")
      .select("amount")
      .eq("membre_id", profile.id)
      .in("type", [...PMQ_TYPES]),
    svc
      .from("parrainages")
      .select("id")
      .eq("parrain_id", profile.id)
      .eq("statut", "actif"),
  ]);

  if (txRes.error) {
    return NextResponse.json({ error: txRes.error.message }, { status: 500 });
  }
  if (parrainagesRes.error) {
    return NextResponse.json(
      { error: parrainagesRes.error.message },
      { status: 500 },
    );
  }

  const totalPointsPmq = (txRes.data ?? []).reduce(
    (acc, row) => acc + Number(row.amount ?? 0),
    0,
  );
  const mult = Number(profile.multiplier ?? 1);
  const multiplier = Number.isFinite(mult) && mult > 0 ? mult : 1;
  const ptsPonderes = totalPointsPmq * multiplier;
  const rank = getRankBadge(ptsPonderes, profile.member_type);

  return NextResponse.json({
    id: profile.id,
    display_name:
      typeof profile.display_name === "string"
        ? profile.display_name.trim()
        : null,
    member_type: profile.member_type,
    numero_membre: profile.numero_membre,
    total_points_pmq: totalPointsPmq,
    pts_ponderes: ptsPonderes,
    rank: {
      emoji: rank.emoji,
      label: rank.label,
      tier: rank.tier,
    },
    filleuls_actifs: (parrainagesRes.data ?? []).length,
  });
}

const MAX_MESSAGE_DON = 200;

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await resolveAuthUser(request);
  if (auth instanceof NextResponse) return auth;

  let body: { profil_public?: unknown; message_don?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const update: { profil_public?: boolean; message_don?: string | null } = {};

  if (body.profil_public !== undefined) {
    if (typeof body.profil_public !== "boolean") {
      return NextResponse.json(
        { error: "profil_public doit être un booléen" },
        { status: 400 },
      );
    }
    update.profil_public = body.profil_public;
  }

  if (body.message_don !== undefined) {
    if (body.message_don === null) {
      update.message_don = null;
    } else if (typeof body.message_don === "string") {
      const trimmed = body.message_don.trim();
      if (trimmed.length > MAX_MESSAGE_DON) {
        return NextResponse.json(
          { error: `message_don ne peut pas dépasser ${MAX_MESSAGE_DON} caractères` },
          { status: 400 },
        );
      }
      update.message_don = trimmed.length > 0 ? trimmed : null;
    } else {
      return NextResponse.json(
        { error: "message_don doit être une chaîne ou null" },
        { status: 400 },
      );
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "Aucun champ à mettre à jour" },
      { status: 400 },
    );
  }

  const svc = getServiceSupabase();
  const { data, error } = await svc
    .from("profiles")
    .update(update)
    .eq("id", auth.uid)
    .select("profil_public, numero_membre, message_don")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    profil_public: data.profil_public,
    numero_membre: data.numero_membre,
    message_don: data.message_don,
  });
}

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import { getFeatureFlag } from "../../../../lib/feature-flags";

export const dynamic = "force-dynamic";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const ALLOWED_MONTANTS = [5, 10, 15] as const;
type CotisationMontant = (typeof ALLOWED_MONTANTS)[number];

/** Points bonus = 2 × montant ($5 → 10, $10 → 20, $15 → 30). */
function pointsBonusForMontant(montant: CotisationMontant): number {
  return montant * 2;
}

function isAllowedMontant(value: number): value is CotisationMontant {
  return (ALLOWED_MONTANTS as readonly number[]).includes(value);
}

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

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await resolveAuthUser(request);
  if (auth instanceof NextResponse) return auth;

  const enabled = await getFeatureFlag("cotisation-membre");
  if (!enabled) {
    return NextResponse.json(
      { error: "La cotisation membre n'est pas activée" },
      { status: 403 },
    );
  }

  let body: { cotisation_active?: unknown; cotisation_montant?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const update: {
    cotisation_active?: boolean;
    cotisation_montant?: number;
    cotisation_points_bonus?: number;
  } = {};

  if (body.cotisation_active !== undefined) {
    if (typeof body.cotisation_active !== "boolean") {
      return NextResponse.json(
        { error: "cotisation_active doit être un booléen" },
        { status: 400 },
      );
    }
    update.cotisation_active = body.cotisation_active;
  }

  if (body.cotisation_montant !== undefined) {
    const montant = Number(body.cotisation_montant);
    if (!Number.isFinite(montant) || !isAllowedMontant(montant)) {
      return NextResponse.json(
        { error: "cotisation_montant doit être 5, 10 ou 15" },
        { status: 400 },
      );
    }
    update.cotisation_montant = montant;
    update.cotisation_points_bonus = pointsBonusForMontant(montant);
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
    .select("cotisation_active, cotisation_montant, cotisation_points_bonus")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    cotisation_active: Boolean(data.cotisation_active),
    cotisation_montant: Number(data.cotisation_montant ?? 5),
    cotisation_points_bonus: Number(data.cotisation_points_bonus ?? 10),
  });
}

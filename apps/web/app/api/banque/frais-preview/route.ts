import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { calculerFraisPlateforme, roundUSD } from "../../../../lib/frais-plateforme";

export const dynamic = "force-dynamic";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await resolveAuthUser(request);
  if (auth instanceof NextResponse) return auth;

  const montantRaw = request.nextUrl.searchParams.get("montant");
  const montant = roundUSD(Number(montantRaw));
  if (!Number.isFinite(montant) || montant <= 0) {
    return NextResponse.json({ error: "montant invalide" }, { status: 400 });
  }

  const { pourcentage, frais } = await calculerFraisPlateforme(montant);
  const net = roundUSD(Math.max(0, montant - frais));

  return NextResponse.json({
    montant,
    pourcentage,
    frais,
    net,
  });
}

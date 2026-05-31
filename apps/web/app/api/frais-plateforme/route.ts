import { type NextRequest, NextResponse } from "next/server";
import { calculerFraisPlateforme, roundUSD } from "../../../lib/frais-plateforme";
import { getFeatureFlag } from "../../../lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const montantRaw = request.nextUrl.searchParams.get("montant");
  const montant = roundUSD(Number(montantRaw));
  if (!Number.isFinite(montant) || montant <= 0) {
    return NextResponse.json({ error: "montant invalide" }, { status: 400 });
  }

  try {
    const actif = await getFeatureFlag("frais-plateforme");
    const { pourcentage, frais } = await calculerFraisPlateforme(montant);
    const montant_net = roundUSD(Math.max(0, montant - frais));

    return NextResponse.json({
      pourcentage,
      frais,
      montant_net,
      actif,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

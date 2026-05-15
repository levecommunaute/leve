import { type NextRequest, NextResponse } from "next/server";
import { getFeatureFlag } from "../../../lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const nom = request.nextUrl.searchParams.get("nom")?.trim();
  if (!nom) {
    return NextResponse.json({ error: "Paramètre nom requis" }, { status: 400 });
  }

  try {
    const actif = await getFeatureFlag(nom);
    return NextResponse.json({ nom, actif });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

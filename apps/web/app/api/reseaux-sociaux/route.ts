import { NextResponse } from "next/server";
import { getActiveReseauxSociaux } from "../../../lib/reseaux-sociaux";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const reseaux = await getActiveReseauxSociaux();
    return NextResponse.json({ reseaux });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

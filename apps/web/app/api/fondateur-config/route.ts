import { NextResponse } from "next/server";
import { getActiveFondateurConfig } from "../../../lib/fondateur-config";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const config = await getActiveFondateurConfig();
    return NextResponse.json({ config });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

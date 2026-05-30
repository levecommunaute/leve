import { NextResponse } from "next/server";
import {
  getTransparenceConfig,
  transparenceVisibilityMap,
} from "../../../../lib/transparence-config";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const pools = await getTransparenceConfig();
    return NextResponse.json({
      pools,
      visibility: transparenceVisibilityMap(pools),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../../lib/admin-server";
import { randomFullVideoCode } from "../../../../../lib/admin-video-code";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 64;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = randomFullVideoCode();
      const { data: row, error } = await supabase
        .from("codes")
        .select("id")
        .eq("full_code", candidate)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!row) {
        return NextResponse.json({ code: candidate });
      }
    }

    return NextResponse.json(
      { error: "Impossible de générer un code unique, réessayez." },
      { status: 503 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

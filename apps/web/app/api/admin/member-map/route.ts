import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

type ProfileGeoRow = {
  pays: string | null;
  ville: string | null;
  continent: string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();
    const members: ProfileGeoRow[] = [];
    let from = 0;

    for (;;) {
      const { data, error } = await supabase
        .from("profiles")
        .select("pays, ville, continent")
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const rows = (data ?? []) as ProfileGeoRow[];
      members.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return NextResponse.json({ members, total: members.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

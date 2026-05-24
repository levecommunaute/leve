import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";
import { resolveMemberCountry } from "../../../../lib/member-country";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();
    const counts = new Map<string, number>();
    let page = 1;

    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: PAGE_SIZE,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const users = data.users ?? [];
      for (const user of users) {
        const { country } = resolveMemberCountry(
          user.email,
          (user.user_metadata ?? {}) as Record<string, unknown>,
        );
        counts.set(country, (counts.get(country) ?? 0) + 1);
      }

      if (users.length < PAGE_SIZE) break;
      page += 1;
    }

    const countries = [...counts.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country, "fr"));

    const total = countries.reduce((sum, row) => sum + row.count, 0);

    return NextResponse.json({ countries, total });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

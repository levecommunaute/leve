import { createServerClient } from "@repo/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const PAGE_SIZE = 1000;

export type ClassementMember = {
  rank: number;
  user_id: string;
  display_name: string;
  member_type: string;
  total_points: number;
};

async function aggregatePointsByUser(
  supabase: SupabaseClient,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("points_transactions")
      .select("user_id, amount")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    for (const row of rows) {
      const uid = String(row.user_id ?? "");
      if (!uid) continue;
      const amt = Number(row.amount ?? 0);
      totals.set(uid, (totals.get(uid) ?? 0) + amt);
    }

    if (rows.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }
  return totals;
}

function formatMemberTypeLabel(raw: string | null | undefined): string {
  if (!raw) return "Communauté";
  const n = raw.trim();
  const lower = n.toLowerCase();
  if (lower === "communauté" || lower === "communaute" || n === "Communauté") return "Communauté";
  if (lower === "pionnier" || n === "Pionnier") return "Pionnier";
  if (lower === "fondateur" || n === "Fondateur") return "Fondateur";
  if (lower === "collaborateur" || n === "Collaborateur") return "Collaborateur";
  return n;
}

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const totals = await aggregatePointsByUser(supabase);

    const sortedIds = [...totals.entries()]
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .slice(0, 100)
      .map(([id]) => id);

    if (sortedIds.length === 0) {
      return NextResponse.json({
        members: [] as ClassementMember[],
        updated_at: new Date().toISOString(),
      });
    }

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name, member_type, email")
      .in("id", sortedIds);

    if (profilesError) {
      return NextResponse.json(
        { error: profilesError.message },
        { status: 500 },
      );
    }

    const profileMap = new Map(
      (profiles ?? []).map((p) => [
        p.id as string,
        p as {
          id: string;
          display_name: string | null;
          member_type: string | null;
          email: string | null;
        },
      ]),
    );

    const members: ClassementMember[] = sortedIds.map((userId, index) => {
      const p = profileMap.get(userId);
      const label = formatMemberTypeLabel(p?.member_type ?? null);
      const display =
        p?.display_name?.trim() ||
        p?.email?.split("@")[0] ||
        "Membre";
      return {
        rank: index + 1,
        user_id: userId,
        display_name: display,
        member_type: label,
        total_points: totals.get(userId) ?? 0,
      };
    });

    return NextResponse.json({
      members,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

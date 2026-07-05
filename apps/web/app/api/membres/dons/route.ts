import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import { getFeatureFlag } from "../../../../lib/feature-flags";
import { getRankBadge } from "../../../../lib/rank-badge";

export const dynamic = "force-dynamic";

const PMQ_TYPES = [
  "quiz",
  "parrainage",
  "code",
  "fragment",
  "video_code",
  "code_secret",
  "pa_transfer",
  "don_recu",
  "don_envoye",
] as const;

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const enabled = await getFeatureFlag("dons-membres");
  if (!enabled) {
    return NextResponse.json(
      { error: "Page indisponible", actif: false },
      { status: 403 },
    );
  }

  const svc = getServiceSupabase();
  const { data: profiles, error } = await svc
    .from("profiles")
    .select("id, display_name, member_type, multiplier, numero_membre, message_don")
    .eq("profil_public", true)
    .not("message_don", "is", null)
    .order("display_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (profiles ?? []).filter(
    (p) =>
      typeof p.message_don === "string" && p.message_don.trim().length > 0,
  );

  if (rows.length === 0) {
    return NextResponse.json({ actif: true, membres: [] });
  }

  const ids = rows.map((p) => p.id as string);
  const { data: txRows, error: txErr } = await svc
    .from("points_transactions")
    .select("membre_id, amount")
    .in("membre_id", ids)
    .in("type", [...PMQ_TYPES]);

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  const totals = new Map<string, number>();
  for (const tx of txRows ?? []) {
    const mid = String(tx.membre_id);
    totals.set(mid, (totals.get(mid) ?? 0) + Number(tx.amount ?? 0));
  }

  const membres = rows.map((p) => {
    const id = String(p.id);
    const totalPointsPmq = totals.get(id) ?? 0;
    const mult = Number(p.multiplier ?? 1);
    const multiplier = Number.isFinite(mult) && mult > 0 ? mult : 1;
    const ptsPonderes = totalPointsPmq * multiplier;
    const rank = getRankBadge(ptsPonderes, p.member_type as string | null);

    return {
      id,
      display_name:
        typeof p.display_name === "string" ? p.display_name.trim() : null,
      member_type: p.member_type,
      numero_membre: p.numero_membre,
      message_don: String(p.message_don).trim(),
      rank: {
        emoji: rank.emoji,
        label: rank.label,
        tier: rank.tier,
      },
    };
  });

  return NextResponse.json({ actif: true, membres });
}

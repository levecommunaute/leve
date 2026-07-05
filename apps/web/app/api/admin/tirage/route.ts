import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const TIRAGE_SELECT =
  "id, trimestre, date_tirage, actif, gagnant_id, seed_sha256, date_tirage_reel, total_tickets";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();

    const { data: tirage, error: tirageErr } = await supabase
      .from("tirages")
      .select(TIRAGE_SELECT)
      .eq("actif", true)
      .order("date_tirage", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (tirageErr) {
      return NextResponse.json({ error: tirageErr.message }, { status: 500 });
    }

    let ticketsVendus = 0;
    if (tirage?.id) {
      const { data: rows, error: ticketsErr } = await supabase
        .from("tirage_tickets")
        .select("nb_tickets")
        .eq("tirage_id", tirage.id);

      if (ticketsErr) {
        return NextResponse.json({ error: ticketsErr.message }, { status: 500 });
      }

      ticketsVendus = (rows ?? []).reduce((acc, row) => {
        const n = Number(row.nb_tickets ?? 0);
        return acc + (Number.isFinite(n) && n > 0 ? n : 0);
      }, 0);
    }

    const { data: dernier, error: dernierErr } = await supabase
      .from("tirages")
      .select(`${TIRAGE_SELECT}, profiles:gagnant_id(display_name, email)`)
      .not("gagnant_id", "is", null)
      .order("date_tirage_reel", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dernierErr) {
      return NextResponse.json({ error: dernierErr.message }, { status: 500 });
    }

    const gagnantProfile = dernier?.profiles as
      | { display_name?: string | null; email?: string | null }
      | { display_name?: string | null; email?: string | null }[]
      | null
      | undefined;
    const profile = Array.isArray(gagnantProfile) ? gagnantProfile[0] : gagnantProfile;

    return NextResponse.json({
      tirage_actif: tirage ?? null,
      tickets_vendus: ticketsVendus,
      dernier_tirage: dernier
        ? {
            id: dernier.id,
            trimestre: dernier.trimestre,
            gagnant_id: dernier.gagnant_id,
            gagnant_nom:
              profile?.display_name?.trim() ||
              profile?.email?.split("@")[0] ||
              null,
            seed_sha256: dernier.seed_sha256,
            date_tirage_reel: dernier.date_tirage_reel,
            total_tickets: dernier.total_tickets,
          }
        : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

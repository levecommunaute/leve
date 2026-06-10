import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ACTIONS = 100000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { email?: unknown; nb_actions_souhaitees?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "email invalide" }, { status: 400 });
  }

  const raw = body.nb_actions_souhaitees;
  const nb = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isInteger(nb) || nb <= 0 || nb > MAX_ACTIONS) {
    return NextResponse.json(
      { error: "nb_actions_souhaitees invalide (entier > 0)" },
      { status: 400 },
    );
  }

  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from("catc_interet_liste")
      .insert({ email, nb_actions_souhaitees: nb });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

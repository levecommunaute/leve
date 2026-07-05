import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import { getFeatureFlag } from "../../../../lib/feature-flags";

export const dynamic = "force-dynamic";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const MIN_DON = 5;
const MAX_DON = 50;

const PMQ_MONTHLY_TYPES = [
  "quiz",
  "parrainage",
  "code",
  "fragment",
  "video_code",
  "code_secret",
  "pa_transfer",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function currentMonthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

async function resolveAuthUser(
  request: NextRequest,
): Promise<{ uid: string } | NextResponse> {
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();

  if (bearer) {
    const authClient = createClient(SB_URL, SB_ANON);
    const {
      data: { user },
      error,
    } = await authClient.auth.getUser(bearer);
    if (error || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    return { uid: user.id };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  return { uid: user.id };
}

async function sumMonthlyPmqBalance(
  svc: ReturnType<typeof getServiceSupabase>,
  membreId: string,
): Promise<number> {
  const monthStart = currentMonthStartIso();
  const { data, error } = await svc
    .from("points_transactions")
    .select("amount")
    .eq("membre_id", membreId)
    .gte("created_at", monthStart)
    .in("type", [...PMQ_MONTHLY_TYPES]);

  if (error) throw new Error(error.message);

  return (data ?? []).reduce(
    (acc, row) => acc + Number(row.amount ?? 0),
    0,
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await resolveAuthUser(request);
  if (auth instanceof NextResponse) return auth;

  const enabled = await getFeatureFlag("dons-membres");
  if (!enabled) {
    return NextResponse.json(
      { error: "Les dons entre membres ne sont pas activés" },
      { status: 403 },
    );
  }

  let body: { receveur_id?: string; pts_pmq?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const receveurId =
    typeof body.receveur_id === "string" ? body.receveur_id.trim() : "";
  const ptsPmq = Number(body.pts_pmq);

  if (!receveurId || !UUID_RE.test(receveurId)) {
    return NextResponse.json({ error: "receveur_id invalide" }, { status: 400 });
  }
  if (receveurId === auth.uid) {
    return NextResponse.json(
      { error: "Impossible de s'envoyer des points à soi-même" },
      { status: 400 },
    );
  }
  if (
    !Number.isFinite(ptsPmq) ||
    !Number.isInteger(ptsPmq) ||
    ptsPmq < MIN_DON ||
    ptsPmq > MAX_DON
  ) {
    return NextResponse.json(
      { error: `pts_pmq doit être un entier entre ${MIN_DON} et ${MAX_DON}` },
      { status: 400 },
    );
  }

  const svc = getServiceSupabase();

  const { data: receveur, error: receveurErr } = await svc
    .from("profiles")
    .select("id")
    .eq("id", receveurId)
    .maybeSingle();

  if (receveurErr) {
    return NextResponse.json({ error: receveurErr.message }, { status: 500 });
  }
  if (!receveur?.id) {
    return NextResponse.json({ error: "Membre receveur introuvable" }, { status: 404 });
  }

  let monthlyBalance: number;
  try {
    monthlyBalance = await sumMonthlyPmqBalance(svc, auth.uid);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (monthlyBalance < ptsPmq) {
    return NextResponse.json(
      {
        error: `Solde PMQ insuffisant ce mois (${Math.max(0, Math.floor(monthlyBalance))} pts disponibles)`,
      },
      { status: 422 },
    );
  }

  const { data: donneurProfile } = await svc
    .from("profiles")
    .select("numero_membre")
    .eq("id", auth.uid)
    .maybeSingle();

  const { data: receveurProfile } = await svc
    .from("profiles")
    .select("numero_membre")
    .eq("id", receveurId)
    .maybeSingle();

  const donneurRef =
    donneurProfile?.numero_membre != null &&
    String(donneurProfile.numero_membre).trim()
      ? `#${String(donneurProfile.numero_membre).trim()}`
      : "#????";

  const receveurRef =
    receveurProfile?.numero_membre != null &&
    String(receveurProfile.numero_membre).trim()
      ? `#${String(receveurProfile.numero_membre).trim()}`
      : "#????";

  const { error: donError } = await svc.from("dons_membres").insert({
    donneur_id: auth.uid,
    receveur_id: receveurId,
    pts_pmq: ptsPmq,
  });

  if (donError) {
    return NextResponse.json({ error: donError.message }, { status: 500 });
  }

  const { error: debitError } = await svc.from("points_transactions").insert({
    membre_id: auth.uid,
    amount: -ptsPmq,
    type: "pa_transfer",
    description: `Don envoyé à ${receveurRef}`,
  });

  if (debitError) {
    return NextResponse.json({ error: debitError.message }, { status: 500 });
  }

  const { error: creditError } = await svc.from("points_transactions").insert({
    membre_id: receveurId,
    amount: ptsPmq,
    type: "pa_transfer",
    description: `Don reçu de ${donneurRef}`,
  });

  if (creditError) {
    return NextResponse.json({ error: creditError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";
import { sendBetaBugReportEmail } from "../../../../lib/emails";

export const dynamic = "force-dynamic";

const SEVERITES = ["P1", "P2", "P3"] as const;
type Severite = (typeof SEVERITES)[number];

function isSeverite(value: unknown): value is Severite {
  return typeof value === "string" && (SEVERITES as readonly string[]).includes(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const page =
    typeof body.page === "string" ? body.page.trim().slice(0, 500) : "";
  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 5000) : "";
  const severite = isSeverite(body.severite) ? body.severite : "P3";
  const membreId =
    typeof body.membre_id === "string" && UUID_RE.test(body.membre_id.trim())
      ? body.membre_id.trim()
      : null;

  if (!page) {
    return NextResponse.json({ error: "Page concernée requise" }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: "Description requise" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("beta_bugs")
      .insert({ membre_id: membreId, page, description, severite })
      .select("id, page, severite, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // L'envoi d'email ne doit pas faire échouer l'enregistrement du bug.
    await sendBetaBugReportEmail({ page, description, severite, membreId });

    return NextResponse.json({ bug: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

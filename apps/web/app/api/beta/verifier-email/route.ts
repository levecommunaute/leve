import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Paramètre email requis" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("beta_emails_autorises")
      .select("id")
      .eq("email", email)
      .eq("actif", true)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ autorise: Boolean(data) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

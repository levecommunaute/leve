import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@repo/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

function normalizeNumero(raw: string): string {
  return raw.trim();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await resolveAuthUser(request);
  if (auth instanceof NextResponse) return auth;

  const numero = normalizeNumero(
    request.nextUrl.searchParams.get("numero") ?? "",
  );
  if (!numero) {
    return NextResponse.json({ error: "numero requis" }, { status: 400 });
  }

  const svc = getServiceSupabase();
  const { data, error } = await svc
    .from("profiles")
    .select("id, display_name, member_type, profil_public, numero_membre")
    .eq("numero_membre", numero)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data?.id) {
    return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });
  }

  const hasNumero =
    data.numero_membre != null && String(data.numero_membre).trim() !== "";
  if (!data.profil_public && !hasNumero) {
    return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });
  }

  if (data.id === auth.uid) {
    return NextResponse.json(
      { error: "Impossible de s'envoyer des points à soi-même" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    id: data.id,
    display_name:
      typeof data.display_name === "string" ? data.display_name.trim() : null,
    member_type: data.member_type,
  });
}

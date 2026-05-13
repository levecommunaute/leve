import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const MEMBER_TYPES = new Set(["Communaute", "Pionnier", "Fondateur", "Collaborateur"]);

function normalizeMemberType(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  const lower = t.toLowerCase();
  const fromLower: Record<string, string> = {
    communaute: "Communaute",
    pionnier: "Pionnier",
    fondateur: "Fondateur",
    collaborateur: "Collaborateur",
  };
  const mapped = fromLower[lower];
  if (mapped !== undefined) return mapped;
  if (t === "Communauté") return "Communaute";
  if (MEMBER_TYPES.has(t)) return t;
  return null;
}

const ALLOWED_MULTIPLIERS = [1.0, 1.2, 2.0] as const;

function normalizeMultiplier(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n)) return null;
  for (const m of ALLOWED_MULTIPLIERS) {
    if (Math.abs(n - m) < 1e-9) return m;
  }
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, email, member_type, multiplier, numero_membre")
      .order("display_name", { ascending: true, nullsFirst: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ members: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: {
    id?: string;
    member_type?: unknown;
    multiplier?: unknown;
    numero_membre?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  const hasType = "member_type" in body;
  const hasMult = "multiplier" in body;
  const hasNum = "numero_membre" in body;
  if (!hasType && !hasMult && !hasNum) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  const patch: Record<string, string | number | null> = {};

  if (hasType) {
    const mt = normalizeMemberType(body.member_type);
    if (!mt) {
      return NextResponse.json(
        { error: "member_type invalide (communaute, pionnier, fondateur, collaborateur)" },
        { status: 400 },
      );
    }
    patch.member_type = mt;
  }

  if (hasMult) {
    const mult = normalizeMultiplier(body.multiplier);
    if (mult === null) {
      return NextResponse.json({ error: "multiplier doit être 1.0, 1.2 ou 2.0" }, { status: 400 });
    }
    patch.multiplier = mult;
  }

  if (hasNum) {
    if (body.numero_membre !== null && typeof body.numero_membre !== "string") {
      return NextResponse.json({ error: "numero_membre invalide" }, { status: 400 });
    }
    const raw =
      body.numero_membre === null ? "" : typeof body.numero_membre === "string" ? body.numero_membre.trim() : "";
    patch.numero_membre = raw.length ? raw : null;
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.from("profiles").update(patch).eq("id", id).select("id").maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

export function getServiceSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Returns null if authorized, otherwise a 401/503 NextResponse. */
export function requireAdminSecret(request: NextRequest): NextResponse | null {
  const expected = process.env.ADMIN_SECRET_KEY;
  if (!expected?.length) {
    return NextResponse.json(
      { error: "ADMIN_SECRET_KEY n'est pas configurée" },
      { status: 503 },
    );
  }
  const header =
    request.headers.get("x-admin-secret")?.trim() ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!header || header !== expected) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return null;
}

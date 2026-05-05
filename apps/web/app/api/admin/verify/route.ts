import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.ADMIN_SECRET_KEY;
  if (!expected?.length) {
    return NextResponse.json(
      { error: "ADMIN_SECRET_KEY n'est pas configurée" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const secret =
    typeof body === "object" &&
    body !== null &&
    "secret" in body &&
    typeof (body as { secret: unknown }).secret === "string"
      ? (body as { secret: string }).secret.trim()
      : "";

  if (!secret || secret !== expected) {
    return NextResponse.json({ error: "Clé incorrecte" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}

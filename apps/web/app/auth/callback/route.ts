import { createServerClient } from "@repo/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=auth`);
  }

  const supabase = await createServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
    code,
  );

  if (exchangeError) {
    return NextResponse.redirect(`${origin}/?error=auth`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({ id: user.id }, { onConflict: "id" });

    if (profileError) {
      console.error("profiles upsert:", profileError.message);
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}

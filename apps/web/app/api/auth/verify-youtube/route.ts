import { createServerClient } from "@repo/supabase/server";
import { NextResponse } from "next/server";
import { checkYoutubeSubscription } from "../../../../lib/youtube-subscription";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const providerToken = session?.provider_token;
  if (!providerToken) {
    return NextResponse.json({ subscribed: false });
  }

  try {
    const subscribed = await checkYoutubeSubscription(providerToken);
    return NextResponse.json({ subscribed });
  } catch {
    return NextResponse.json(
      { error: "Configuration YouTube manquante" },
      { status: 500 },
    );
  }
}

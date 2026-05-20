import { createServerClient } from "@repo/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type YouTubeSubscriptionsResponse = {
  items?: unknown[];
};

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

  const apiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  if (!apiKey || !channelId) {
    return NextResponse.json(
      { error: "Configuration YouTube manquante" },
      { status: 500 },
    );
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/subscriptions");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");
  url.searchParams.set("forChannelId", channelId);
  url.searchParams.set("key", apiKey);

  const ytRes = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${providerToken}`,
    },
  });

  if (!ytRes.ok) {
    return NextResponse.json({ subscribed: false });
  }

  const ytData = (await ytRes.json()) as YouTubeSubscriptionsResponse;
  const subscribed = Array.isArray(ytData.items) && ytData.items.length > 0;

  return NextResponse.json({ subscribed });
}

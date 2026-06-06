import { NextResponse } from "next/server";

const YOUTUBE_CHANNEL_ID = "UCiodwYm73GTbORxF4gDiZww";
const CACHE_SECONDS = 60;

type CachedStats = {
  subscriberCount: number;
  fetchedAt: number;
};

let cache: CachedStats | null = null;

type YouTubeChannelsResponse = {
  items?: Array<{
    statistics?: {
      subscriberCount?: string;
    };
  }>;
};

async function fetchSubscriberCount(): Promise<number> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("Configuration YouTube manquante");
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "statistics");
  url.searchParams.set("id", YOUTUBE_CHANNEL_ID);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), { next: { revalidate: CACHE_SECONDS } });
  if (!res.ok) {
    throw new Error(`YouTube API error: ${res.status}`);
  }

  const data = (await res.json()) as YouTubeChannelsResponse;
  const raw = data.items?.[0]?.statistics?.subscriberCount;
  const count = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(count) || count < 0) {
    throw new Error("Nombre d'abonnés YouTube invalide");
  }

  return count;
}

export async function GET(): Promise<NextResponse> {
  try {
    const now = Date.now();
    if (cache && now - cache.fetchedAt < CACHE_SECONDS * 1000) {
      return NextResponse.json(
        { subscriberCount: cache.subscriberCount },
        {
          headers: {
            "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
          },
        },
      );
    }

    const subscriberCount = await fetchSubscriberCount();
    cache = { subscriberCount, fetchedAt: now };

    return NextResponse.json(
      { subscriberCount },
      {
        headers: {
          "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
        },
      },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (cache) {
      return NextResponse.json(
        { subscriberCount: cache.subscriberCount },
        {
          headers: {
            "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
          },
        },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

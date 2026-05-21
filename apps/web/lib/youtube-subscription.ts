type YouTubeSubscriptionsResponse = {
  items?: unknown[];
};

/** Vérifie l'abonnement à la chaîne LEVE via l'API YouTube (scope readonly OAuth). */
export async function checkYoutubeSubscription(
  providerToken: string,
): Promise<boolean> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  if (!apiKey || !channelId) {
    throw new Error("Configuration YouTube manquante");
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/subscriptions");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");
  url.searchParams.set("forChannelId", channelId);
  url.searchParams.set("key", apiKey);

  const ytRes = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${providerToken}` },
  });

  const ytData = (await ytRes.json()) as YouTubeSubscriptionsResponse;
  if (!ytRes.ok) {
    return false;
  }

  return Array.isArray(ytData.items) && ytData.items.length > 0;
}

"use client";

import { useEffect, useState } from "react";

const REFRESH_MS = 60_000;

export function useYoutubeSubscriberCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const r = await fetch("/api/youtube-stats", { cache: "no-store" });
        const j = (await r.json()) as { subscriberCount?: number };
        if (!cancelled && r.ok && typeof j.subscriberCount === "number") {
          setCount(j.subscriberCount);
        }
      } catch {
        // conserve la dernière valeur connue
      }
    }

    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return count;
}

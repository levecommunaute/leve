import { NextResponse } from "next/server";
import { countFondateurMembresInscrits } from "../../../lib/fondateur-stats";

export const dynamic = "force-dynamic";

const CACHE_SECONDS = 60;

type CachedStats = {
  membres_inscrits: number;
  fetchedAt: number;
};

let cache: CachedStats | null = null;

export async function GET(): Promise<NextResponse> {
  try {
    const now = Date.now();
    if (cache && now - cache.fetchedAt < CACHE_SECONDS * 1000) {
      return NextResponse.json(
        { membres_inscrits: cache.membres_inscrits },
        {
          headers: {
            "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
          },
        },
      );
    }

    const membres_inscrits = await countFondateurMembresInscrits();
    cache = { membres_inscrits, fetchedAt: now };

    return NextResponse.json(
      { membres_inscrits },
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
        { membres_inscrits: cache.membres_inscrits },
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

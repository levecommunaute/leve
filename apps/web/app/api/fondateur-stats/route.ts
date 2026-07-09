import { NextResponse } from "next/server";
import { countFondateurMembresInscrits } from "../../../lib/fondateur-stats";
import { redis } from "../../../lib/redis";

export const dynamic = "force-dynamic";

const CACHE_KEY = "fondateur-stats";
const CACHE_TTL = 3600;
const CACHE_SECONDS = 60;

type FondateurStatsPayload = {
  membres_inscrits: number;
};

export async function GET(): Promise<NextResponse> {
  try {
    const cached = await redis.get<FondateurStatsPayload>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
        },
      });
    }

    const membres_inscrits = await countFondateurMembresInscrits();
    const payload: FondateurStatsPayload = { membres_inscrits };

    await redis.set(CACHE_KEY, payload, { ex: CACHE_TTL });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

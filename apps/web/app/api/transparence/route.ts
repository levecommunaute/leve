import { NextResponse } from "next/server";
import {
  getTransparenceConfig,
  transparenceVisibilityMap,
} from "../../../lib/transparence-config";
import { redis } from "../../../lib/redis";

export const dynamic = "force-dynamic";

const CACHE_KEY = "transparence";
const CACHE_TTL = 600;

type TransparencePayload = {
  pools: Awaited<ReturnType<typeof getTransparenceConfig>>;
  visibility: ReturnType<typeof transparenceVisibilityMap>;
};

export async function GET(): Promise<NextResponse> {
  try {
    const cached = await redis.get<TransparencePayload>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    const pools = await getTransparenceConfig();
    const payload: TransparencePayload = {
      pools,
      visibility: transparenceVisibilityMap(pools),
    };

    await redis.set(CACHE_KEY, payload, { ex: CACHE_TTL });

    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

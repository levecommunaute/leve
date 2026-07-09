import { NextResponse } from "next/server";
import { getActiveReseauxSociaux } from "../../../lib/reseaux-sociaux";
import { redis } from "../../../lib/redis";

export const dynamic = "force-dynamic";

const CACHE_KEY = "reseaux-sociaux";
const CACHE_TTL = 1800;

type ReseauxSociauxPayload = {
  reseaux: Awaited<ReturnType<typeof getActiveReseauxSociaux>>;
};

export async function GET(): Promise<NextResponse> {
  try {
    const cached = await redis.get<ReseauxSociauxPayload>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    const reseaux = await getActiveReseauxSociaux();
    const payload: ReseauxSociauxPayload = { reseaux };

    await redis.set(CACHE_KEY, payload, { ex: CACHE_TTL });

    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { randomBytes } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomFragment(): string {
  const bytes = randomBytes(8);
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += ALPHABET[bytes[i]! % ALPHABET.length]!;
  }
  return s;
}

function threeUniqueFragments(): string[] {
  const set = new Set<string>();
  while (set.size < 3) {
    set.add(randomFragment());
  }
  return [...set];
}

function spreadTimestamps(maxSeconds: number): number[] {
  const cap = Math.max(120, Math.min(maxSeconds - 30, 7200));
  const lo = 30;
  const hi = Math.max(lo + 90, cap);
  const bytes = randomBytes(12);
  const picks: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = lo + ((bytes[i * 4]! << 16) | (bytes[i * 4 + 1]! << 8) | bytes[i * 4 + 2]!) % (hi - lo);
    picks.push(Math.floor(t));
  }
  picks.sort((a, b) => a - b);
  let n0 = picks[0] ?? lo;
  let n1 = picks[1] ?? n0 + 20;
  let n2 = picks[2] ?? n1 + 20;
  if (n0 === n1) n1 += 17;
  if (n1 === n2) n2 += 23;
  return [n0, n1, n2].map((n) => Math.min(n, hi));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  let body: { video_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const videoId = typeof body.video_id === "string" ? body.video_id.trim() : "";
  if (!videoId) {
    return NextResponse.json({ error: "video_id requis" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();

    const { data: video, error: vErr } = await supabase
      .from("videos")
      .select("id")
      .eq("id", videoId)
      .maybeSingle();

    if (vErr) {
      return NextResponse.json({ error: vErr.message }, { status: 500 });
    }
    if (!video) {
      return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404 });
    }

    const maxTs = 1200;

    const { error: delErr } = await supabase.from("codes").delete().eq("video_id", videoId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    const fragments = threeUniqueFragments();
    const timestamps = spreadTimestamps(maxTs);
    const rows = fragments.map((fragment_code, i) => ({
      video_id: videoId,
      fragment_code,
      timestamp_seconds: timestamps[i]!,
    }));

    const { error: insErr } = await supabase.from("codes").insert(rows);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    const code = fragments.join(" · ");
    return NextResponse.json({ code, fragments });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

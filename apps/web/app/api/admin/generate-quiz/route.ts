import { type NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, requireAdminSecret } from "../../../../lib/admin-server";

export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";

type GeneratedQuestion = {
  question: string;
  choix: string[];
  bonne_reponse: string;
};

function extractJsonArray(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  const raw = fence ? (fence[1] ?? "").trim() : trimmed;
  return JSON.parse(raw);
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function parseTimedTextXml(xml: string): string {
  const segments: string[] = [];
  const regex = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const raw = (match[1] ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (raw) segments.push(decodeHtmlEntities(raw));
  }
  return segments.join(" ").trim();
}

// Récupère le transcript de la vidéo. L'endpoint captions de la YouTube Data API
// ne renvoie que les métadonnées des pistes (le téléchargement du texte exige
// OAuth), donc on l'utilise pour détecter la disponibilité puis on récupère le
// texte via l'endpoint public timedtext. Retourne null si rien d'exploitable.
async function fetchTranscript(youtubeId: string, apiKey: string): Promise<string | null> {
  try {
    const captionsUrl = new URL("https://www.googleapis.com/youtube/v3/captions");
    captionsUrl.searchParams.set("part", "snippet");
    captionsUrl.searchParams.set("videoId", youtubeId);
    captionsUrl.searchParams.set("key", apiKey);

    const captionsRes = await fetch(captionsUrl, { method: "GET" });
    if (!captionsRes.ok) return null;

    const captionsJson = (await captionsRes.json()) as {
      items?: { snippet?: { language?: string; trackKind?: string } }[];
    };
    const tracks = captionsJson.items ?? [];
    if (tracks.length === 0) return null;

    const preferred =
      tracks.find((t) => (t.snippet?.language ?? "").toLowerCase().startsWith("fr")) ??
      tracks.find((t) => (t.snippet?.language ?? "").toLowerCase().startsWith("en")) ??
      tracks[0];
    const langCandidates = [
      preferred?.snippet?.language,
      "fr",
      "en",
    ].filter((l): l is string => Boolean(l));

    for (const lang of langCandidates) {
      const timedTextUrl = new URL("https://www.youtube.com/api/timedtext");
      timedTextUrl.searchParams.set("lang", lang);
      timedTextUrl.searchParams.set("v", youtubeId);

      const ttRes = await fetch(timedTextUrl, { method: "GET" });
      if (!ttRes.ok) continue;
      const xml = await ttRes.text();
      const transcript = parseTimedTextXml(xml);
      if (transcript) {
        return transcript.length > 12000 ? `${transcript.slice(0, 12000)}…` : transcript;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeQuestion(item: unknown): GeneratedQuestion | null {
  if (!item || typeof item !== "object") return null;
  const q = item as Record<string, unknown>;
  const question = String(q.question ?? "").trim();
  const choix = Array.isArray(q.choix)
    ? q.choix.map((o) => String(o ?? "").trim())
    : [];
  let bonneReponse = String(q.bonne_reponse ?? "").trim();

  if (choix.length !== 4 || choix.some((o) => !o)) {
    return null;
  }

  if (!bonneReponse || !choix.some((o) => o.toLowerCase() === bonneReponse.toLowerCase())) {
    const letter = bonneReponse.toLowerCase();
    const map: Record<string, number> = { a: 0, b: 1, c: 2, d: 3 };
    if (letter in map) {
      bonneReponse = choix[map[letter as keyof typeof map] ?? 0] ?? "";
    }
  }

  if (!question || !bonneReponse || !choix.some((o) => o === bonneReponse)) {
    return null;
  }

  return { question, choix, bonne_reponse: bonneReponse };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY manquante" }, { status: 503 });
  }

  let body: { video_id?: string; youtube_id?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const videoId = typeof body.video_id === "string" ? body.video_id.trim() : "";
  const youtubeId = typeof body.youtube_id === "string" ? body.youtube_id.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!videoId || !youtubeId || !title) {
    return NextResponse.json(
      { error: "video_id, youtube_id et title requis" },
      { status: 400 },
    );
  }

  const youtubeKey = process.env.YOUTUBE_API_KEY;
  if (!youtubeKey) {
    return NextResponse.json({ error: "YOUTUBE_API_KEY manquante" }, { status: 503 });
  }

  try {
    const supabase = getServiceSupabase();
    const { data: vid, error: vErr } = await supabase
      .from("videos")
      .select("id")
      .eq("id", videoId)
      .maybeSingle();

    if (vErr) {
      return NextResponse.json({ error: vErr.message }, { status: 500 });
    }
    if (!vid?.id) {
      return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404 });
    }

    const youtubeUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    youtubeUrl.searchParams.set("part", "snippet");
    youtubeUrl.searchParams.set("id", youtubeId);
    youtubeUrl.searchParams.set("key", youtubeKey);

    const youtubeRes = await fetch(youtubeUrl, { method: "GET" });
    if (!youtubeRes.ok) {
      const errText = await youtubeRes.text();
      return NextResponse.json(
        { error: `YouTube API ${youtubeRes.status}: ${errText}` },
        { status: 502 },
      );
    }

    const youtubeJson = (await youtubeRes.json()) as {
      items?: { snippet?: { title?: string; description?: string } }[];
    };
    const snippet = youtubeJson.items?.[0]?.snippet;
    if (!snippet) {
      return NextResponse.json({ error: "Vidéo YouTube introuvable" }, { status: 404 });
    }

    const ytTitle = String(snippet.title ?? "").trim() || title;
    const ytDescription = String(snippet.description ?? "").trim();

    const transcript = await fetchTranscript(youtubeId, youtubeKey);
    const contexte = transcript ?? ytDescription;

    const prompt =
      `Génère 15 questions QCM en français sur cette vidéo YouTube LEVE intitulée '${ytTitle}'. ` +
      (contexte ? `Contexte de la vidéo : ${contexte}. ` : "") +
      "Format JSON strict uniquement. 4 choix (A/B/C/D). 1 bonne réponse. " +
      "5 questions faciles · 5 moyennes · 5 difficiles. " +
      "Retourne UNIQUEMENT un tableau JSON avec les champs : question, choix (array de 4), bonne_reponse (A/B/C/D)";

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return NextResponse.json(
        { error: `Anthropic API ${anthropicRes.status}: ${errText}` },
        { status: 502 },
      );
    }

    const anthropicJson = (await anthropicRes.json()) as {
      content?: { type?: string; text?: string }[];
    };
    const textBlock = anthropicJson.content?.find((c) => c.type === "text")?.text;
    if (!textBlock || typeof textBlock !== "string") {
      return NextResponse.json({ error: "Réponse Claude invalide" }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = extractJsonArray(textBlock);
    } catch {
      return NextResponse.json({ error: "Impossible de parser le JSON de Claude" }, { status: 422 });
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: "Claude n'a pas renvoyé un tableau JSON" }, { status: 422 });
    }

    const questions: GeneratedQuestion[] = [];
    for (const item of parsed.slice(0, 15)) {
      const normalized = normalizeQuestion(item);
      if (normalized) questions.push(normalized);
    }

    if (questions.length === 0) {
      return NextResponse.json(
        { error: "Aucune question valide extraite de la réponse Claude" },
        { status: 422 },
      );
    }

    const letters = ["A", "B", "C", "D"] as const;
    const rows = questions.map((q) => {
      const correctIndex = q.choix.findIndex((o) => o === q.bonne_reponse);
      return {
        video_id: videoId,
        question: q.question,
        choix: q.choix,
        bonne_reponse: letters[correctIndex >= 0 ? correctIndex : 0],
      };
    });

    const { error: delErr } = await supabase
      .from("quiz_questions")
      .delete()
      .eq("video_id", videoId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    const { data: inserted, error: insErr } = await supabase
      .from("quiz_questions")
      .insert(rows)
      .select("id");

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      questions_count: inserted?.length ?? questions.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
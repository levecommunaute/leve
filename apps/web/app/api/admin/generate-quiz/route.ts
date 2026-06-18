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

  const prompt =
    `Tu es un expert en création de quiz éducatifs. Génère exactement 15 questions QCM en français sur la vidéo YouTube intitulée '${title}'. ` +
    "Chaque question doit avoir 4 options (A, B, C, D) et une seule bonne réponse. " +
    "Retourne UNIQUEMENT un JSON valide sans markdown, format : " +
    "[{question: string, choix: [string, string, string, string], bonne_reponse: string}] " +
    "où bonne_reponse est le texte exact de la bonne réponse.";

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
        option_a: q.choix[0] ?? "",
        option_b: q.choix[1] ?? "",
        option_c: q.choix[2] ?? "",
        option_d: q.choix[3] ?? "",
        correct_answer: letters[correctIndex >= 0 ? correctIndex : 0],
      };
    });

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
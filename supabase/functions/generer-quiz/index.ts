import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-20250514";

type Body = {
  video_id: string;
  youtube_id: string;
  title: string;
  description: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractJsonArray(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  const raw = fence ? fence[1].trim() : trimmed;
  return JSON.parse(raw);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(
      { success: false, error: "Missing Supabase configuration" },
      500,
    );
  }
  if (!anthropicKey) {
    return jsonResponse(
      { success: false, error: "Missing ANTHROPIC_API_KEY" },
      500,
    );
  }

  let payload: Body;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const { video_id, youtube_id, title, description } = payload;
  if (!video_id || !youtube_id || title == null || description == null) {
    return jsonResponse({
      success: false,
      error: "Required: video_id, youtube_id, title, description",
    }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userPrompt =
    `Génère 15 questions QCM en français sur cette vidéo YouTube: ${title} - ${description}. ` +
    "Format JSON: [{question, option_a, option_b, option_c, option_d, correct_answer}] " +
    "(JSON valide uniquement : tableau de 15 objets avec ces clés en chaînes de caractères). " +
    "Ne renvoie que le JSON, sans markdown ni commentaires. " +
    "correct_answer doit être exactement égale à l'une des valeurs option_a, option_b, option_c ou option_d.";

  try {
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
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API ${anthropicRes.status}: ${errText}`);
    }

    const anthropicJson = await anthropicRes.json();
    const textBlock = anthropicJson?.content?.find((c: { type?: string }) =>
      c.type === "text"
    )?.text;
    if (!textBlock || typeof textBlock !== "string") {
      throw new Error("Unexpected Anthropic response shape");
    }

    const parsed = extractJsonArray(textBlock);
    if (!Array.isArray(parsed)) {
      throw new Error("Model did not return a JSON array");
    }

    const rows: Record<string, unknown>[] = [];
    for (const item of parsed.slice(0, 15)) {
      if (!item || typeof item !== "object") continue;
      const q = item as Record<string, unknown>;
      const question = String(q.question ?? "").trim();
      const option_a = String(q.option_a ?? "").trim();
      const option_b = String(q.option_b ?? "").trim();
      const option_c = String(q.option_c ?? "").trim();
      const option_d = String(q.option_d ?? "").trim();
      let correct = String(q.correct_answer ?? "").trim();
      const opts = [option_a, option_b, option_c, option_d];
      if (!opts.includes(correct)) {
        const letter = correct.toLowerCase();
        const map: Record<string, number> = {
          a: 0,
          b: 1,
          c: 2,
          d: 3,
        };
        if (letter in map) correct = opts[map[letter]];
      }
      if (!question || !opts.every(Boolean) || !opts.includes(correct)) {
        continue;
      }
      rows.push({
        video_id,
        youtube_id,
        question,
        option_a,
        option_b,
        option_c,
        option_d,
        correct_answer: correct,
      });
    }

    if (rows.length === 0) {
      return jsonResponse({
        success: false,
        error: "No valid questions parsed from model output",
      }, 422);
    }

    const { error: insertError } = await supabase
      .from("quiz_questions")
      .insert(rows);

    if (insertError) throw insertError;

    return jsonResponse({ success: true, questions_count: rows.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[generer-quiz]", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});

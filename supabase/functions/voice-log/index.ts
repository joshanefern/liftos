// deno-lint-ignore-file no-explicit-any
// Edge Function: voice-log
// Turns one spoken utterance from the active-workout logger into a
// structured intent the client can apply deterministically. The model only
// ever sees: the transcript, the session's exercise names (+ tracking),
// and the user's units. It decides SET DATA vs NOTE vs BOTH, matches
// spoken exercise names to the session list (echoing the EXACT name), and
// extracts per-set reps/weight/seconds with ordinal references intact.
//
// All hallucination containment lives client-side in lib/voiceApply.ts —
// this function's contract is "best-effort structure, honest confidence".
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
// Interpretation is a ~1s structured-extraction job — Haiku-class by
// default, overridable without a redeploy.
const VOICE_MODEL = Deno.env.get("VOICE_MODEL") ?? "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

type Payload = {
  transcript?: unknown;
  exercises?: unknown; // [{ name, tracking }]
  units?: unknown;
};

const SYSTEM = `You convert one spoken gym utterance into JSON for a workout logger. Respond with ONLY a JSON object, no prose.

Schema:
{
  "kind": "sets" | "note" | "both" | "unclear",
  "note": string | null,
  "actions": [
    {
      "exercise": string,      // EXACT name from SESSION_EXERCISES when the lifter means one of them (fix mishearings: "recline curls" → "Incline Curl"); otherwise the cleaned new-exercise name, Title Case
      "isNew": boolean,        // true ONLY when it is not in SESSION_EXERCISES
      "tracking": "reps" | "time" | null,   // "time" for holds (planks, wall sits, carries measured in seconds)
      "done": boolean,         // true when the exercise was reported finished with NO numbers spoken
      "sets": [ { "ordinal": int|null, "reps": int|null, "weight": number|null, "seconds": number|null } ]
    }
  ],
  "confidence": number  // 0..1 — how sure you are the STRUCTURE is what they meant
}

Rules:
- Naming an exercise as performed with NO counts at all ("I did goblet squats", "goblet squats done", "finished my planks") → kind "sets", one action { exercise, isNew, done: true, sets: [] }. The logger completes that exercise's planned sets. This is common — it is NOT "unclear".
- A SPECIFIC set reported done without effort numbers ("first set of bench done", "finished my second set of squats") → done: true with sets [ { "ordinal": N } ] — the logger completes only that set, never the whole exercise.
- "first set / second set" → ordinal 1 / 2. No ordinal words → ordinal null (sets apply in order).
- "3 sets of X" or "did 3 sets" with one effort value → emit that many identical set objects.
- "about 40 seconds" → seconds 40. Durations for holds go in seconds, never reps.
- "only 2" / "just 5" → the number is reps. Bodyweight speech usually has no weight — leave weight null, never invent one.
- Weights: "one thirty five" → 135. "two plates" → 225 if units are lb (45-lb plates each side of a 45-lb bar), 100 if kg (20-kg plates, 20-kg bar). Units are ${"the user's units"} — do not convert, echo the number they mean.
- Corrections win: "5 reps... no wait, 8" → reps 8 only.
- Feelings, aches, comparisons to previous sessions, gear notes → "note" (verbatim-ish, first person cleaned up). Numbers inside a feeling ("not able to do as much as last session") are NOT set data.
- An utterance can be both ("shoulder hurt on the last one, still got 8 at 185" → kind "both").
- If you genuinely cannot tell what they meant, kind "unclear", actions [], note null.
- NEVER invent sets, exercises, or numbers that were not spoken. Fewer actions is always better than wrong actions.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return json({ error: "missing authorization" }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user } } = await userClient.auth.getUser(
    authHeader.replace(/^Bearer\s+/i, ""),
  );
  if (!user) return json({ error: "invalid auth" }, 401);

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }

  const transcript =
    typeof payload.transcript === "string" ? payload.transcript.trim().slice(0, 600) : "";
  if (!transcript) return json({ error: "missing transcript" }, 400);

  const exercises = Array.isArray(payload.exercises)
    ? payload.exercises
        .filter((e: any) => e && typeof e.name === "string")
        .slice(0, 30)
        .map((e: any) => ({
          name: String(e.name).slice(0, 80),
          tracking: e.tracking === "time" ? "time" : "reps",
        }))
    : [];
  const units = payload.units === "kg" ? "kg" : "lb";

  const userMsg = `SESSION_EXERCISES (name · tracking):
${exercises.length > 0 ? exercises.map((e) => `- ${e.name} · ${e.tracking}`).join("\n") : "(none yet — blank session)"}

UNITS: ${units}

TRANSCRIPT: "${transcript}"`;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: VOICE_MODEL,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  if (!res.ok) {
    return json({ error: `interpreter failed: ${await res.text()}` }, 502);
  }

  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = body.content?.find((c) => c.type === "text")?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return json({ kind: "unclear", note: null, actions: [], confidence: 0 });

  try {
    const intent = JSON.parse(match[0]);
    // Shape-guard the top level; the client's apply engine bounds the rest.
    const kind = ["sets", "note", "both", "unclear"].includes(intent.kind)
      ? intent.kind
      : "unclear";
    return json({
      kind,
      note: typeof intent.note === "string" ? intent.note.slice(0, 500) : null,
      actions: Array.isArray(intent.actions) ? intent.actions.slice(0, 10) : [],
      confidence:
        typeof intent.confidence === "number"
          ? Math.max(0, Math.min(1, intent.confidence))
          : 0.5,
      transcript,
    });
  } catch {
    return json({ kind: "unclear", note: null, actions: [], confidence: 0, transcript });
  }
});

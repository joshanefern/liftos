// deno-lint-ignore-file no-explicit-any
// Edge Function: coach
// Grounded AI coach for LiftOS. Two modes:
//   - "chat":    streams an Anthropic Messages API response straight through
//                as SSE (content_block_delta events carry the text).
//   - "insight": one-shot, non-streaming request that returns a single
//                actionable insight sentence as { insight }.
// The client sends its computed training stats in `context`; they are injected
// verbatim into the system prompt so every reply is grounded in real data.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const COACH_MODEL = Deno.env.get("COACH_MODEL") ?? "claude-opus-5";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

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

type ChatMessage = { role: "user" | "assistant"; content: string };

type CoachPayload = {
  mode?: "chat" | "insight";
  messages?: ChatMessage[];
  context?: unknown;
  tone?: string;
};

type CoachTone = "direct" | "encouraging" | "technical";

const resolveTone = (raw: unknown): CoachTone =>
  raw === "encouraging" || raw === "technical" ? raw : "direct";

const TONE_BLOCKS: Record<CoachTone, string> = {
  direct:
    "Tone: straight-talking gym partner. Confident, warm, zero filler. Say the hard thing plainly, then back it with one of their numbers. Supportive — never soft-soaped, never preachy.",
  encouraging:
    "Tone: momentum-first. Open by naming a real win from the data (a number, a streak, a PR), then give the instruction. Energetic but never gushing — at most one exclamation mark per reply.",
  technical:
    "Tone: programming nerd. Terse and numbers-dense — loads, percentages, set counts, weekly tonnage. Skip motivation entirely; this athlete wants signal, not vibes.",
};

const FALLBACK_INSIGHT =
  "Keep your current training rhythm and focus on adding one rep or a small load increase to your first lift of the next session.";

// A legitimate CoachContext serializes to a few KB; messages are already
// capped, so cap context too — otherwise any authenticated user can burn
// input tokens with a multi-megabyte payload.
const CONTEXT_MAX_CHARS = 50_000;

const buildSystemPrompt = (context: unknown, tone: CoachTone): string => {
  const data = JSON.stringify(context ?? {}, null, 2);
  return [
    "You are the LiftOS coach — a real strength coach in the athlete's pocket.",
    "",
    "The athlete's live training data is below. It includes: week stats (sessions, volume, days trained), streak, consistency vs their target frequency, 8-week volume trend, top lifts (best weight x reps), muscle activation over the last 7 days, days-since-trained per muscle, profile goals (goal, experience, equipment, frequency, split, units), heart-rate summaries from captured wearable sessions when present (per-set peak/avg HR and rest between sets), and today_suggestion — the app's named pick for what to train today (with its one-line reason), shown to the athlete as the dashboard CTA. today_readiness, when present, is the app's overnight recovery verdict (primed / steady / run_down, plus an illness signal) computed from the athlete's own HealthKit baselines.",
    "",
    "<training_data>",
    data,
    "</training_data>",
    "",
    "How you write — non-negotiable:",
    "- Lead with the answer, bolded, in one short line. No preamble, no restating the question, no sign-offs.",
    "- Default to UNDER 80 words total. Go longer only when the athlete explicitly asks for a program, a plan, or deep detail.",
    "- Structure beats prose. After the bold lead, at most 3 short bullets — one idea each. Never bury numbers in a paragraph.",
    "- Multi-day plans and side-by-side comparisons go in a compact markdown table (e.g. Day | Focus | Sets), 3–7 rows. Never a table for a single fact.",
    "",
    TONE_BLOCKS[tone],
    "",
    "Grounding rules:",
    "- Cite the athlete's real numbers (weights, sets, volumes, days, heart rates). Never invent data — if it isn't in the data, say so in one clause.",
    "- No generic filler advice — every recommendation must be specific to this athlete's numbers, split, and goals.",
    "- When today_suggestion is present and the athlete asks what to train, recommend that pick by name and back it with a concrete number. Diverge only when the data clearly argues otherwise, and say why — they can see that pick on their dashboard, so a casual contradiction reads as a bug.",
    "- When today_readiness is present, never contradict it: on run_down favor keeping intensity and trimming volume (the app already did that to today's session); if illness is true, lean toward an easy day. Never invent a readiness verdict when the field is absent.",
    `- Use the athlete's units (${extractUnits(context)}) for all loads and volumes.`,
  ].join("\n");
};

const extractUnits = (context: unknown): string => {
  const profile = (context as { profile?: { units?: string } } | null)?.profile;
  return typeof profile?.units === "string" ? profile.units : "lb";
};

const sanitizeMessages = (raw: unknown): ChatMessage[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is ChatMessage =>
        m !== null &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  if (!ANTHROPIC_API_KEY) {
    return json({ error: "coach not configured: ANTHROPIC_API_KEY is unset" }, 503);
  }

  let payload: CoachPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }

  const mode = payload.mode === "insight" ? "insight" : "chat";

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return json({ error: "missing authorization" }, 401);
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(jwt);
  if (userError || !user) {
    return json(
      { error: "invalid auth", detail: userError?.message ?? "no user from jwt" },
      401,
    );
  }

  if (JSON.stringify(payload.context ?? {}).length > CONTEXT_MAX_CHARS) {
    return json({ error: "context too large" }, 413);
  }

  const system = buildSystemPrompt(payload.context, resolveTone(payload.tone));

  const anthropicHeaders: HeadersInit = {
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };

  if (mode === "chat") {
    const messages = sanitizeMessages(payload.messages);
    if (messages.length === 0) {
      return json({ error: "messages required for chat mode" }, 400);
    }

    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: anthropicHeaders,
      body: JSON.stringify({
        model: COACH_MODEL,
        max_tokens: 1024,
        stream: true,
        output_config: { effort: "low" },
        system,
        messages,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      return json(
        { error: `anthropic request failed (${upstream.status})`, detail },
        502,
      );
    }

    // Pipe Anthropic's SSE straight through to the browser.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        ...CORS_HEADERS,
      },
    });
  }

  // ── insight mode ──
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: anthropicHeaders,
    body: JSON.stringify({
      model: COACH_MODEL,
      max_tokens: 200,
      stream: false,
      output_config: { effort: "low" },
      system,
      messages: [
        {
          role: "user",
          content:
            "Give me exactly one specific, actionable insight sentence based on my training data. Cite at least one concrete number from the data. This sentence renders directly above a dashboard button that starts today_suggestion, so if today_suggestion is present, make the sentence support that pick — never recommend a conflicting workout, and if today_readiness is run_down or illness, never urge pushing harder. Respond with the single sentence only — no preamble, no list, no follow-up.",
        },
      ],
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return json(
      { error: `anthropic request failed (${upstream.status})`, detail },
      502,
    );
  }

  const body = (await upstream.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  };

  // Safety classifiers can decline with a 200 + stop_reason "refusal" —
  // never surface an empty/partial body as an insight.
  if (body.stop_reason === "refusal") {
    return json({ insight: FALLBACK_INSIGHT });
  }

  const text = (body.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();

  return json({ insight: text.length > 0 ? text : FALLBACK_INSIGHT });
});

import { listConversations } from "@/lib/coachStore";

/* ── The Progress page's AI read — rendered as DATA, never prose.
   Successful trackers (Whoop, Strava, Apple Fitness, Fitbod) put scores,
   trend chips, and one action on stats screens; paragraph advice lives in
   chat. So the model returns strict JSON — 2-3 label+value readings and a
   single next move — and the page renders them like every other stat row.

   Cached per day + log count in localStorage: a new day or a new logged
   session refreshes it; revisiting the tab does not re-bill the API. ── */

export type InsightItem = { label: string; value: string };
export type InsightNext = { label: string; prompt: string };
export type ProgressInsightData = { items: InsightItem[]; next: InsightNext | null };

export const INSIGHT_PROMPT =
  "Return STRICT JSON only — no prose, no markdown fences — matching exactly: " +
  '{"items":[{"label":"...","value":"..."}],"next":{"label":"...","prompt":"..."}} ' +
  "items: 2 or 3 rows, each one real reading from my data, angled at my goal. " +
  'label is at most 3 words ("Posterior chain", "Volume trend", "Bench"); ' +
  'value is a compact stat of at most 10 characters ("109d idle", "+12%", "3/wk", "stalled"). ' +
  "next: the single best next move. label at most 4 words; prompt is one sentence " +
  "I could send my coach to act on it. " +
  "Factor recent_conversations in if relevant. JSON only.";

const KEY = "liftos-progress-insight-v3";

type CachedInsight = { day: string; logCount: number; raw: string };

/** Parse the model's reply into render-safe data. Returns null on any
    shape surprise — the card then degrades to just the Ask link, never
    to malformed rows. */
export const parseInsight = (raw: string): ProgressInsightData | null => {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned) as {
      items?: { label?: unknown; value?: unknown }[];
      next?: { label?: unknown; prompt?: unknown } | null;
    };
    const items = (parsed.items ?? [])
      .filter(
        (item): item is { label: string; value: string } =>
          typeof item?.label === "string" &&
          item.label.trim().length > 0 &&
          typeof item?.value === "string" &&
          item.value.trim().length > 0,
      )
      .slice(0, 3)
      .map((item) => ({ label: item.label.trim().slice(0, 28), value: item.value.trim().slice(0, 12) }));
    if (items.length === 0) return null;
    const next =
      typeof parsed.next?.label === "string" &&
      parsed.next.label.trim().length > 0 &&
      typeof parsed.next?.prompt === "string" &&
      parsed.next.prompt.trim().length > 0
        ? { label: parsed.next.label.trim().slice(0, 32), prompt: parsed.next.prompt.trim().slice(0, 240) }
        : null;
    return { items, next };
  } catch {
    return null;
  }
};

export const loadCachedInsight = (logCount: number): ProgressInsightData | null => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedInsight;
    if (parsed.day !== new Date().toDateString() || parsed.logCount !== logCount) return null;
    return parseInsight(parsed.raw);
  } catch {
    return null;
  }
};

export const cacheInsight = (logCount: number, raw: string): void => {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ day: new Date().toDateString(), logCount, raw } satisfies CachedInsight),
    );
  } catch {
    /* storage unavailable — insight just regenerates next visit */
  }
};

/** The last couple of coach chats, trimmed hard: enough for the model to
    pick up context ("my shoulder", "cutting this month"), small enough to
    stay a footnote in the payload. */
export const recentChatExcerpts = (): { title: string; lines: string[] }[] =>
  listConversations()
    .slice(0, 2)
    .map((conversation) => ({
      title: conversation.title,
      lines: conversation.messages
        .slice(-6)
        .map((m) => `${m.role}: ${m.content.slice(0, 280)}`),
    }));

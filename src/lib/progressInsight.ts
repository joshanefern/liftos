import { listConversations } from "@/lib/coachStore";

/* ── The Progress page's AI insight. One grounded read on the whole
   picture: what's genuinely improving, the highest-leverage next move for
   the athlete's goal, one watch-out. Recent coach conversations ride
   along in the context so the insight reflects what the athlete has been
   telling the coach (injuries, constraints, focuses).

   Cached per day + log count in localStorage: a new day or a new logged
   session refreshes it; revisiting the tab does not re-bill the API. ── */

export const INSIGHT_PROMPT =
  "One glanceable insight for my Progress page. " +
  "Line 1: a single plain sentence, maximum 16 words — the most important " +
  "true thing about my training right now, angled at my goal. " +
  "Line 2, on its own line: 'Next: <the single move>' in maximum 8 words. " +
  "Factor recent_conversations in if relevant. " +
  "No bullets, no bold, no headings, nothing else.";

const KEY = "liftos-progress-insight-v2";

type CachedInsight = { day: string; logCount: number; text: string };

export const loadCachedInsight = (logCount: number): string | null => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedInsight;
    return parsed.day === new Date().toDateString() && parsed.logCount === logCount
      ? parsed.text
      : null;
  } catch {
    return null;
  }
};

export const cacheInsight = (logCount: number, text: string): void => {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ day: new Date().toDateString(), logCount, text } satisfies CachedInsight),
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

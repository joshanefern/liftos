import { listConversations } from "@/lib/coachStore";

/* ── The Progress page's AI insight. One grounded read on the whole
   picture: what's genuinely improving, the highest-leverage next move for
   the athlete's goal, one watch-out. Recent coach conversations ride
   along in the context so the insight reflects what the athlete has been
   telling the coach (injuries, constraints, focuses).

   Cached per day + log count in localStorage: a new day or a new logged
   session refreshes it; revisiting the tab does not re-bill the API. ── */

export const INSIGHT_PROMPT =
  "Progress-page insight: in at most 3 short bullets (under 60 words total), " +
  "tell me (1) the clearest real improvement in my recent training, " +
  "(2) the single highest-leverage next move for my goal, and " +
  "(3) one thing to watch out for. If recent_conversations in the data " +
  "mention injuries, constraints, or focuses, factor them in. " +
  "No preamble, no headings — just the bullets.";

const KEY = "liftos-progress-insight";

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

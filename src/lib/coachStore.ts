import type { ChatMessage } from "@/lib/coach";

/* ── Coach conversation persistence — the ChatGPT/Claude organization:
     every chat is a named conversation you can leave and come back to.
     localStorage-backed (device-local, offline-first); newest first. ── */

export type CoachConversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: string;
};

const KEY = "liftos-coach-conversations";
const MAX_CONVERSATIONS = 50;

/** First user message, tightened into a list title — the ChatGPT convention. */
export const titleFor = (messages: ChatMessage[]): string => {
  const first = messages.find((m) => m.role === "user")?.content.trim() ?? "";
  if (!first) return "New chat";
  const oneLine = first.replace(/\s+/g, " ");
  return oneLine.length <= 42 ? oneLine : `${oneLine.slice(0, 42).trimEnd()}…`;
};

export const newConversationId = (): string =>
  `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const listConversations = (): CoachConversation[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CoachConversation[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (c) =>
          c &&
          typeof c.id === "string" &&
          Array.isArray(c.messages) &&
          c.messages.length > 0,
      )
      // localeCompare returns 0 on ties so the stable sort preserves the
      // stored order (which is already newest-first by construction).
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
};

/** Insert-or-update one conversation; empty conversations are never stored. */
export const saveConversation = (
  id: string,
  messages: ChatMessage[],
): void => {
  if (messages.length === 0) return;
  try {
    const rest = listConversations().filter((c) => c.id !== id);
    const next: CoachConversation[] = [
      { id, title: titleFor(messages), messages, updatedAt: new Date().toISOString() },
      ...rest,
    ].slice(0, MAX_CONVERSATIONS);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full/unavailable — the live chat still works, history is best-effort.
  }
};

export const deleteConversation = (id: string): void => {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(listConversations().filter((c) => c.id !== id)),
    );
  } catch {
    // Best-effort.
  }
};

/** Compact relative stamp for the history list ("2h ago", "3d ago"). */
export const relativeStamp = (iso: string, nowMs: number = Date.now()): string => {
  const mins = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
};

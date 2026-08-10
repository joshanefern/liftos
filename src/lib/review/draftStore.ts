import type {
  EditableCardioBlock,
  EditableGroup,
} from "@/lib/review/buildEditable";

/**
 * Local draft persistence for the smart-review screen.
 *
 * The `captured_sessions` schema cannot represent drafts — `review_status` is
 * CHECK-constrained to ('pending' | 'reviewed' | 'dismissed') and there is no
 * draft-payload column — so in-progress edits live in localStorage, keyed by
 * the captured session id. The row itself stays 'pending', which correctly
 * keeps the session in the review queue: a draft is still awaiting review.
 * Mirrors the `liftos_active_workout_session` convention used by the live
 * logger. Drafts are cleared when the session is confirmed or dismissed.
 */

const DRAFT_VERSION = 1;

const keyFor = (sessionId: string): string =>
  `liftos_review_draft_${sessionId}`;

export type ReviewDraft = {
  version: number;
  groups: EditableGroup[];
  cardioBlock: EditableCardioBlock | null;
  label: string;
  labelIsAuto: boolean;
  saved_at: string;
};

export const saveReviewDraft = (
  sessionId: string,
  draft: Omit<ReviewDraft, "version" | "saved_at">,
): void => {
  try {
    const payload: ReviewDraft = {
      ...draft,
      version: DRAFT_VERSION,
      saved_at: new Date().toISOString(),
    };
    window.localStorage.setItem(keyFor(sessionId), JSON.stringify(payload));
  } catch {
    // Quota / private-mode failures are non-fatal; the session stays pending.
  }
};

export const loadReviewDraft = (sessionId: string): ReviewDraft | null => {
  try {
    const raw = window.localStorage.getItem(keyFor(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReviewDraft;
    if (parsed?.version !== DRAFT_VERSION || !Array.isArray(parsed.groups)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const clearReviewDraft = (sessionId: string): void => {
  try {
    window.localStorage.removeItem(keyFor(sessionId));
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
};

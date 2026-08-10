import {
  useCapturedSessions,
  type CapturedSessionSummary,
} from "@/context/CapturedSessionsProvider";
import { useEffect, useMemo } from "react";

/**
 * Pending smart-review sessions, newest first.
 *
 * Wraps CapturedSessionsProvider — one shared fetch, optimistic status
 * updates. The provider has no realtime subscription, so this hook refetches
 * when the window regains focus/visibility, throttled module-wide so several
 * consumers mounted at once (sidebar badge, tab bar badge, dashboard card)
 * trigger a single request rather than a stampede.
 */

const REFRESH_THROTTLE_MS = 15_000;
let lastFocusRefreshAt = 0;

export type UsePendingReviewsResult = {
  pendingCount: number;
  pendingSessions: CapturedSessionSummary[];
  loading: boolean;
  refresh: () => Promise<void>;
};

export const usePendingReviews = (): UsePendingReviewsResult => {
  const { sessions, loading, pendingCount, refresh } = useCapturedSessions();

  const pendingSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.review_status === "pending")
        .sort(
          (a, b) =>
            new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
        ),
    [sessions],
  );

  useEffect(() => {
    const maybeRefresh = (): void => {
      const now = Date.now();
      if (now - lastFocusRefreshAt < REFRESH_THROTTLE_MS) return;
      lastFocusRefreshAt = now;
      void refresh();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") maybeRefresh();
    };
    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return { pendingCount, pendingSessions, loading, refresh };
};

import { useEffect } from "react";

/**
 * Holds a screen wake lock while the calling component is mounted, so the
 * display stays on mid-workout. The browser auto-releases the lock when the
 * page loses visibility, so we re-acquire on visibilitychange. No-ops where
 * the Wake Lock API is unavailable.
 */
export const useWakeLock = (): void => {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let unmounted = false;

    const acquire = async (): Promise<void> => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (unmounted) {
          void lock.release().catch(() => undefined);
          return;
        }
        sentinel = lock;
      } catch {
        // Rejected (power-save mode, hidden document) — retry on next visibilitychange.
      }
    };

    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      unmounted = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);
};

import { useEffect, useRef } from "react";
import { useCapturedSessions } from "@/context/CapturedSessionsProvider";
import { useUser } from "@/context/UserContext";
import { fetchStravaActivities } from "@/lib/strava/refresh";

/* ── Auto-import of Strava activities on app open, throttled so casual
     reopens don't burn the user's Strava rate budget. There is no push
     channel here (webhooks need a public callback host), so "scheduled
     sync" honestly means: sync when the app comes to the foreground and
     the last sync is older than the throttle. The Dashboard row's manual
     refresh stays for impatient moments. Rendered ONCE app-wide via
     <StravaAutoSync/> in App.tsx. ── */

const THROTTLE_MS = 15 * 60_000;
const STAMP_KEY = "liftos_strava_last_autosync";

export const useStravaAutoSync = (): void => {
  const { profile } = useUser();
  const { refresh } = useCapturedSessions();
  const connected = profile?.wearable_connected ?? false;
  const syncing = useRef(false);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;

    const due = (): boolean => {
      try {
        const raw = window.localStorage.getItem(STAMP_KEY);
        return !raw || Date.now() - Number(raw) >= THROTTLE_MS;
      } catch {
        return true;
      }
    };

    const stamp = (when: number): void => {
      try {
        window.localStorage.setItem(STAMP_KEY, String(when));
      } catch {
        /* storage unavailable — throttling degrades to per-mount */
      }
    };

    const sync = async (): Promise<void> => {
      if (syncing.current || !due()) return;
      syncing.current = true;
      // Stamped up-front so concurrent foreground events can't double-fire;
      // a failure rewinds it to allow a retry in ~5 minutes instead of
      // burning the full window on a network hiccup.
      stamp(Date.now());
      try {
        const { inserted } = await fetchStravaActivities();
        if (!cancelled && inserted > 0) await refresh();
      } catch {
        stamp(Date.now() - (THROTTLE_MS - 5 * 60_000));
      } finally {
        syncing.current = false;
      }
    };

    const onVisible = (): void => {
      if (document.visibilityState === "visible") void sync();
    };

    void sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [connected, refresh]);
};

/** Mount-once host — INSIDE User + CapturedSessions providers, OUTSIDE the
    per-route AppShell (same contract as HealthKitAutoSync). */
export const StravaAutoSync = (): null => {
  useStravaAutoSync();
  return null;
};

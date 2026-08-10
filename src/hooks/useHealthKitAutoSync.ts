import { useEffect, useRef } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import { useCapturedSessions } from "@/context/CapturedSessionsProvider";
import { useUser } from "@/context/UserContext";
import {
  fetchHealthKitWorkouts,
  healthKitSupported,
  startHealthKitObserver,
} from "@/lib/healthkit";

/* ── Auto-import of HealthKit workouts. Honest scope: the observer fires
     while the app is FOREGROUND (or briefly backgrounded); true background
     wakes need a native observer + native upload and are deliberately not
     claimed here. Anything that lands while the app is closed is caught by
     the sync-on-mount below. Rendered ONCE app-wide via <HealthKitAutoSync/>
     in App.tsx — never per-route, so the listener isn't churned by
     navigation. ── */

export const useHealthKitAutoSync = (): void => {
  const { profile } = useUser();
  const { refresh } = useCapturedSessions();
  const connected = profile?.healthkit_connected ?? false;
  const syncing = useRef(false);
  // Observer fires arriving mid-sync coalesce into ONE trailing re-run —
  // dropping them would miss workouts that landed after the query snapshot.
  const rerun = useRef(false);

  useEffect(() => {
    if (!healthKitSupported() || !connected) return;
    let cancelled = false;
    let handle: PluginListenerHandle | null = null;

    const sync = async (): Promise<void> => {
      if (syncing.current) {
        rerun.current = true;
        return;
      }
      syncing.current = true;
      try {
        const { inserted } = await fetchHealthKitWorkouts();
        if (!cancelled && inserted > 0) await refresh();
      } catch {
        // Quiet by design — the Dashboard row's manual refresh surfaces
        // errors; the next observer fire or app open retries.
      } finally {
        syncing.current = false;
        if (rerun.current && !cancelled) {
          rerun.current = false;
          void sync();
        }
      }
    };

    startHealthKitObserver(() => void sync()).then((h) => {
      if (cancelled) void h?.remove();
      else handle = h;
    });
    // Catch everything that arrived while the app was closed.
    void sync();

    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, [connected, refresh]);
};

/** Mount-once host for the hook — must live INSIDE the User and
    CapturedSessions providers but OUTSIDE the per-route AppShell. */
export const HealthKitAutoSync = (): null => {
  useHealthKitAutoSync();
  return null;
};

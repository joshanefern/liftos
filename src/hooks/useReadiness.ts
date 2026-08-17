import { useUser } from "@/context/UserContext";
import { useDayKey } from "@/hooks/useDayKey";
import {
  fetchRecoveryMetrics,
  healthKitSupported,
  requestHealthKitAuthorization,
} from "@/lib/healthkit";
import {
  assessReadiness,
  type ReadinessAssessment,
  type RecoveryMetrics,
} from "@/lib/recovery";
import { useEffect, useState } from "react";

/* Overnight readiness for the home screen and coach.

   Fetch policy — overnight metrics change most in exactly the window users
   consult them (between a mid-night wake and morning), so the cache is valid
   only while all three hold:
     - younger than 6h,
     - fetched on the SAME local day, and
     - not fetched before 06:00 when it is now after 06:00 (a 02:30 fetch
       must not serve the 08:00 verdict — the night wasn't over).
   The assessment itself is recomputed on every mount AND on every dayKey
   tick (minute interval + visibility/focus — the app lives backgrounded on
   iOS without remounting), so the staleness guards inside assessReadiness
   always run against a fresh clock.

   Users who connected Apple Health before the recovery release authorized
   only workout reads; the four overnight types would silently return empty
   forever. requestHealthKitAuthorization presents a sheet ONLY for
   still-undetermined types, so it's asked once per device before the first
   metrics fetch — a no-op for fresh connects that already saw the full
   sheet. Gated on healthkit_connected so a never-connected user is never
   prompted from the home screen. */

const TTL_MS = 6 * 3_600_000;
const MORNING_HOUR = 6;
const RECOVERY_AUTH_KEY = "liftos_hk_recovery_auth_v1";

let cachedMetrics: { at: number; metrics: RecoveryMetrics | null } | null = null;

/** Test/QA hook: drop the module cache. */
export const clearReadinessCache = (): void => {
  cachedMetrics = null;
};

const cacheIsFresh = (now: Date): boolean => {
  if (!cachedMetrics) return false;
  const at = new Date(cachedMetrics.at);
  if (now.getTime() - cachedMetrics.at >= TTL_MS) return false;
  if (at.toDateString() !== now.toDateString()) return false;
  if (at.getHours() < MORNING_HOUR && now.getHours() >= MORNING_HOUR) return false;
  return true;
};

const ensureRecoveryAuth = async (): Promise<void> => {
  try {
    if (window.localStorage.getItem(RECOVERY_AUTH_KEY) === "done") return;
  } catch {
    /* storage unavailable — ask; iOS collapses repeat asks to a no-op */
  }
  try {
    await requestHealthKitAuthorization();
    window.localStorage.setItem(RECOVERY_AUTH_KEY, "done");
  } catch {
    /* sheet failed — queries return empty and the tier ladder stays honest */
  }
};

export const useReadiness = (): ReadinessAssessment | null => {
  const { profile } = useUser();
  const dayKey = useDayKey();
  const healthKitConnected =
    healthKitSupported() && (profile?.healthkit_connected ?? false);

  const [assessment, setAssessment] = useState<ReadinessAssessment | null>(() =>
    cachedMetrics ? assessReadiness(cachedMetrics.metrics) : null,
  );

  useEffect(() => {
    let cancelled = false;

    if (!healthKitConnected) {
      // No wearable pipeline — the engine's tier ladder handles null.
      setAssessment(assessReadiness(null));
      return;
    }

    if (cacheIsFresh(new Date())) {
      // Metrics reusable, but re-assess with a fresh clock — the night-age
      // and day-boundary guards live inside assessReadiness.
      setAssessment(assessReadiness(cachedMetrics!.metrics));
      return;
    }

    ensureRecoveryAuth()
      .then(() => fetchRecoveryMetrics())
      .then((metrics) => {
        cachedMetrics = { at: Date.now(), metrics };
        if (!cancelled) setAssessment(assessReadiness(metrics));
      })
      .catch(() => {
        if (!cancelled) setAssessment(assessReadiness(null));
      });
    return () => {
      cancelled = true;
    };
    // dayKey retriggers across midnight and on refocus — both matter on iOS
    // where the webview lives backgrounded for days without remounting.
  }, [healthKitConnected, dayKey]);

  return assessment;
};

import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import type { HRSample, SessionAggregates } from "@/lib/capture/types";
import type { RecoveryMetrics } from "@/lib/recovery";
import { supabase } from "@/lib/supabase";

/* ── HealthKit capture — THE capture path. The iOS app reads finished
     workouts (Apple Watch or iPhone) straight from HealthKit via the in-app
     HealthKitPlugin and inserts captured_sessions rows itself: RLS already
     lets a user insert their own rows, so there is no edge function, no
     OAuth, no tokens. Rows land in the pending-review pipeline; any watch
     that writes to Health (Apple Watch, Garmin, Whoop, Oura…) flows in. ── */

/** What the Swift plugin returns per workout (see ios/App/App/HealthKitPlugin.swift). */
export type HealthKitWorkout = {
  /** HKWorkout.uuid — globally unique, the dedupe key (external_id). */
  uuid: string;
  /** HKWorkoutActivityType raw value. */
  activityTypeRaw: number;
  startDate: string;
  endDate: string;
  duration_s: number;
  distance_m: number | null;
  calories: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  /** Seconds-since-start heart-rate samples, sorted ascending. */
  hr_samples: HRSample[];
};

type HealthKitPluginIface = {
  isAvailable(): Promise<{ available: boolean }>;
  /** Presents the Health permission sheet. Resolves when the sheet closes —
      iOS never reveals whether READ access was granted; denial just means
      queries come back empty. */
  requestAuthorization(): Promise<void>;
  queryWorkouts(options: { sinceISO: string }): Promise<{ workouts: HealthKitWorkout[] }>;
  /** Overnight recovery metrics (HRV, resting HR, sleep, respiratory rate)
      for the readiness engine — see src/lib/recovery.ts. */
  queryRecoveryMetrics(options: { days: number }): Promise<RecoveryMetrics>;
  /** Registers the HKObserverQuery + background delivery; idempotent. */
  startObserving(): Promise<void>;
  addListener(
    eventName: "workoutsChanged",
    listener: () => void,
  ): Promise<PluginListenerHandle>;
  /** Debug builds only — writes a synthetic strength workout to the local
      Health store; rejects in release builds. */
  debugSeedWorkout(options: { minutes?: number }): Promise<{ uuid: string }>;
};

const HealthKit = registerPlugin<HealthKitPluginIface>("HealthKit");

/** HealthKit is iOS-native only — never the web build. */
export const healthKitSupported = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

/* HKWorkoutActivityType raw values → the normalized activity strings
   inferReviewMode already understands (CARDIO_ACTIVITY_TYPES,
   "WeightTraining", "Workout", "Crossfit"). Anything unmapped becomes
   "Workout", the generic bucket whose review mode falls back to signals
   (detected sets / distance). */
const HK_ACTIVITY_TYPES: Record<number, string> = {
  11: "Crossfit", // crossTraining
  13: "Ride", // cycling
  16: "Elliptical",
  20: "WeightTraining", // functionalStrengthTraining
  24: "Hike", // hiking
  35: "Rowing",
  37: "Run", // running
  44: "StairStepper", // stairClimbing
  46: "Swim", // swimming
  50: "WeightTraining", // traditionalStrengthTraining
  52: "Walk", // walking
  57: "Yoga",
  59: "WeightTraining", // coreTraining
  60: "NordicSki", // crossCountrySkiing
  61: "AlpineSki", // downhillSkiing
  63: "Crossfit", // highIntensityIntervalTraining
  68: "StairStepper", // stairs
  69: "StairStepper", // stepTraining
  73: "Workout", // mixedCardio
  74: "Ride", // handCycling
};

export const activityTypeFromHK = (raw: number): string =>
  HK_ACTIVITY_TYPES[raw] ?? "Workout";

/** The captured_sessions insert row — the canonical shape (inherited from
    the retired Strava importer) so everything
    downstream (detection, review modes, SessionReview) is provider-blind. */
export type CapturedSessionInsert = {
  user_id: string;
  provider: "healthkit";
  external_id: string;
  started_at: string;
  ended_at: string;
  raw_payload: Record<string, unknown>;
  hr_samples: HRSample[] | null;
  motion_samples: null;
  aggregates: SessionAggregates;
  review_status: "pending";
};

export const healthKitWorkoutToRow = (
  workout: HealthKitWorkout,
  userId: string,
): CapturedSessionInsert => {
  const aggregates: SessionAggregates = {
    activity_type: activityTypeFromHK(workout.activityTypeRaw),
    duration_s: workout.duration_s,
  };
  if (workout.avg_hr != null) aggregates.avg_hr = workout.avg_hr;
  if (workout.max_hr != null) aggregates.max_hr = workout.max_hr;
  if (workout.distance_m != null && workout.distance_m > 0) {
    aggregates.distance_m = workout.distance_m;
  }
  if (workout.calories != null) aggregates.calories = workout.calories;

  return {
    user_id: userId,
    provider: "healthkit",
    external_id: workout.uuid,
    started_at: workout.startDate,
    ended_at: workout.endDate,
    // Summary only — the samples live in their own column, not the payload.
    raw_payload: {
      source: "healthkit",
      activity_type_raw: workout.activityTypeRaw,
      type: activityTypeFromHK(workout.activityTypeRaw),
      duration_s: workout.duration_s,
      distance_m: workout.distance_m,
      calories: workout.calories,
    },
    hr_samples: workout.hr_samples.length > 0 ? workout.hr_samples : null,
    motion_samples: null,
    aggregates,
    review_status: "pending",
  };
};

/* Always look back 30 days and let the (user_id, provider, external_id)
   unique key dedupe — a watermark would silently miss workouts that reach
   the iPhone's Health store late (Watch syncs can lag by hours). The native
   query is unbounded within the window (multi-source Health stores can
   exceed 100 rows), so nothing is silently truncated. */
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

/* A workout's heart-rate series routinely lands seconds-to-minutes AFTER
   the workout sample itself (separate HKQuantitySamples syncing from the
   Watch). Importing instantly would freeze a partial (or empty) HR trace
   into the row forever — so freshly-ended workouts wait one settle window
   and import on the next observer fire / sync-on-mount instead. */
const SETTLE_MS = 2 * 60 * 1000;

/** Pure, for tests: a workout is importable once its end is comfortably in
    the past. */
export const isSettled = (workout: HealthKitWorkout, nowMs: number): boolean =>
  nowMs - new Date(workout.endDate).getTime() >= SETTLE_MS;

/** Pull recent HealthKit workouts into captured_sessions. Mirrors
    the historical importer's return shape so the Dashboard toast code is shared. */
export const fetchHealthKitWorkouts = async (): Promise<{
  inserted: number;
  total_seen: number;
}> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to sync Apple Health");

  const now = Date.now();
  const sinceISO = new Date(now - LOOKBACK_MS).toISOString();
  const { workouts } = await HealthKit.queryWorkouts({ sinceISO });
  const settled = workouts.filter((w) => isSettled(w, now));
  if (settled.length === 0) return { inserted: 0, total_seen: workouts.length };

  const rows = settled.map((w) => healthKitWorkoutToRow(w, user.id));
  // DO NOTHING on conflict → the returned rows are exactly the new ones.
  const { data, error } = await supabase
    .from("captured_sessions")
    .upsert(rows, { onConflict: "user_id,provider,external_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;

  await repairMissingHeartRate(settled);

  return { inserted: data?.length ?? 0, total_seen: workouts.length };
};

/* The settle window covers the common case, but a row can still have been
   imported before its HR series finished syncing (long Watch lag, or a sync
   that ran mid-transfer). Insert-once means it would stay wrong forever —
   so every sync also repairs its own pending HealthKit rows that lack HR
   whenever the fresh query now carries samples for them. */
const repairMissingHeartRate = async (workouts: HealthKitWorkout[]): Promise<void> => {
  const withHR = new Map(
    workouts.filter((w) => w.hr_samples.length > 0).map((w) => [w.uuid, w]),
  );
  if (withHR.size === 0) return;

  const { data: stale } = await supabase
    .from("captured_sessions")
    .select("id, external_id")
    .eq("provider", "healthkit")
    .eq("review_status", "pending")
    .is("hr_samples", null)
    .in("external_id", [...withHR.keys()]);
  if (!stale || stale.length === 0) return;

  for (const row of stale) {
    const workout = withHR.get(row.external_id);
    if (!workout) continue;
    const fresh = healthKitWorkoutToRow(workout, "");
    await supabase
      .from("captured_sessions")
      .update({ hr_samples: fresh.hr_samples, aggregates: fresh.aggregates })
      .eq("id", row.id);
  }
};

/** Subscribe to Health-store workout changes and start the native observer.
    Returns the listener handle (remove() to stop listening; the native
    observer itself stays registered — it's idempotent and harmless). */
export const startHealthKitObserver = async (
  onWorkoutsChanged: () => void,
): Promise<PluginListenerHandle | null> => {
  if (!healthKitSupported()) return null;
  const handle = await HealthKit.addListener("workoutsChanged", onWorkoutsChanged);
  await HealthKit.startObserving();
  return handle;
};

/** Overnight metrics for the readiness engine (lib/recovery.ts). Returns
    null when there is no HealthKit to ask — web build, plugin missing, or a
    native failure — which the engine treats as tier 3 (no wearable). Denied
    READ permission is invisible on iOS (queries just come back empty), so
    empty arrays are returned as-is and the tier ladder handles the
    sparseness honestly. */
/** Present the HealthKit permission sheet for any still-undetermined read
    types. iOS shows nothing when everything was already decided, so this is
    safe to call before recovery queries for users who connected under a
    build with a smaller read set (their new types sit at .notDetermined and
    would silently query empty forever). */
export const requestHealthKitAuthorization = async (): Promise<void> => {
  if (!healthKitSupported()) return;
  await HealthKit.requestAuthorization();
};

export const fetchRecoveryMetrics = async (
  days = 60,
): Promise<RecoveryMetrics | null> => {
  if (!healthKitSupported()) return null;
  try {
    const metrics = await HealthKit.queryRecoveryMetrics({ days });
    return {
      hrv: metrics.hrv ?? [],
      restingHr: metrics.restingHr ?? [],
      sleep: metrics.sleep ?? [],
      respiratory: metrics.respiratory ?? [],
    };
  } catch {
    return null;
  }
};

/** QA hook (5-tap gesture on the Dashboard row): seed the local Health store
    with a fake session. The native side is compiled out of release builds. */
export const debugSeedHealthKitWorkout = (): Promise<{ uuid: string }> =>
  HealthKit.debugSeedWorkout({ minutes: 40 });

/** Availability check → permission sheet → flag the profile → first sync.
    Denied permission isn't detectable (Apple hides read grants), so the flow
    completes either way; a denied user just syncs zero workouts, exactly like
    a Strava account with no activities. */
export const connectHealthKit = async (): Promise<{
  inserted: number;
  total_seen: number;
}> => {
  const { available } = await HealthKit.isAvailable();
  if (!available) throw new Error("Health data isn't available on this device");

  await HealthKit.requestAuthorization();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // Upsert, not update: a user who abandoned onboarding has no profiles
    // row yet, and an UPDATE would match zero rows "successfully" — leaving
    // auto-sync permanently unarmed. Throw so the connect toast is honest.
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, healthkit_connected: true });
    if (error) throw new Error(`Could not save the connection: ${error.message}`);
  }

  return fetchHealthKitWorkouts();
};

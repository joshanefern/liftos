import { Capacitor, registerPlugin } from "@capacitor/core";
import type { HRSample, SessionAggregates } from "@/lib/capture/types";
import { supabase } from "@/lib/supabase";

/* ── HealthKit capture — the Strava-killer path. The iOS app reads finished
     workouts (Apple Watch or iPhone) straight from HealthKit via the in-app
     HealthKitPlugin and inserts captured_sessions rows itself: RLS already
     lets a user insert their own rows, so there is no edge function, no
     OAuth, no tokens. Rows land in the same pending-review pipeline Strava
     feeds. ── */

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
  /** Debug builds only — writes a synthetic strength workout to the local
      Health store; rejects in release builds. */
  debugSeedWorkout(options: { minutes?: number }): Promise<{ uuid: string }>;
};

const HealthKit = registerPlugin<HealthKitPluginIface>("HealthKit");

/** HealthKit is iOS-native only — never the web build. */
export const healthKitSupported = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

/* HKWorkoutActivityType raw values → the Strava-normalized strings
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

/** The captured_sessions insert row — mirrors the Strava edge function's
    shape field for field (strava-fetch-activities/index.ts) so everything
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

/* Always look back 30 days and let the (provider, external_id) unique key
   dedupe — a watermark would silently miss workouts that reach the iPhone's
   Health store late (Watch syncs can lag by hours). ~60 rows max, trivial. */
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

/** Pull recent HealthKit workouts into captured_sessions. Mirrors
    fetchStravaActivities' return shape so the Dashboard toast code is shared. */
export const fetchHealthKitWorkouts = async (): Promise<{
  inserted: number;
  total_seen: number;
}> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to sync Apple Health");

  const sinceISO = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const { workouts } = await HealthKit.queryWorkouts({ sinceISO });
  if (workouts.length === 0) return { inserted: 0, total_seen: 0 };

  const rows = workouts.map((w) => healthKitWorkoutToRow(w, user.id));
  // DO NOTHING on conflict → the returned rows are exactly the new ones.
  const { data, error } = await supabase
    .from("captured_sessions")
    .upsert(rows, { onConflict: "provider,external_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  return { inserted: data?.length ?? 0, total_seen: workouts.length };
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
    // Client-side own-row update — same RLS path Onboarding's profile upsert uses.
    await supabase
      .from("profiles")
      .update({ healthkit_connected: true })
      .eq("id", user.id);
  }

  return fetchHealthKitWorkouts();
};

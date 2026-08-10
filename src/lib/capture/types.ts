import type { ExerciseKind } from "@/data/liftosMock";

export type CaptureProvider = "strava" | "healthkit";

export type HRSample = {
  /** Seconds since session start. Samples assumed sorted ascending. */
  t: number;
  bpm: number;
};

export type MotionSample = {
  /** Seconds since session start. Samples assumed sorted ascending. */
  t: number;
  /** Aggregated motion intensity, normalized 0..1 (e.g. accelerometer RMS). */
  intensity: number;
};

export type SessionAggregates = {
  avg_hr?: number;
  max_hr?: number;
  calories?: number;
  distance_m?: number;
  duration_s?: number;
  /**
   * Provider-normalized activity category (Strava: "Run", "WeightTraining",
   * "Workout", "Crossfit", "Ride", "Swim", "Walk", "Hike", ...). Used together
   * with the count of detected sets to choose the review UI mode (cardio /
   * lifting / mixed / empty). Populated by the provider sync, milestone 5.
   */
  activity_type?: string;
};

export type CapturedSession = {
  id: string;
  provider: CaptureProvider;
  external_id: string;
  /** ISO timestamp. */
  started_at: string;
  /** ISO timestamp. */
  ended_at: string;
  hr_samples: HRSample[];
  motion_samples: MotionSample[] | null;
  aggregates: SessionAggregates;
  raw_payload: unknown;
};

export type DetectedSet = {
  id: string;
  /** Seconds since session start. */
  start_s: number;
  end_s: number;
  duration_s: number;
  peak_hr: number;
  avg_hr: number;
  /** Estimated reps from motion-peak count; null when motion data is absent. */
  estimated_reps: number | null;
  /** 0..1; UI should flag values < 0.6 for user attention. */
  confidence: number;
};

export type ExerciseHistoryEntry = {
  /** Canonical exercise name (lowercase recommended). */
  name: string;
  /** Typical peak HR observed in past sessions of this exercise. */
  typical_peak_hr?: number;
  /** Typical set duration in seconds. */
  typical_duration_s?: number;
  /** Default kind for matched groups; UI may override. */
  kind?: ExerciseKind;
};

export type DetectedExerciseGroup = {
  id: string;
  /** Best history match; null when no confident match. */
  suggested_name: string | null;
  /** Suggested kind from history match; null when no match. */
  suggested_kind: ExerciseKind | null;
  sets: DetectedSet[];
  /** 0..1; how confident the grouping is. */
  group_confidence: number;
};

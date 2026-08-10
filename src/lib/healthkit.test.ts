import { describe, expect, it } from "vitest";
import { inferReviewMode } from "@/context/CapturedSessionsProvider";
import {
  activityTypeFromHK,
  healthKitWorkoutToRow,
  isSettled,
  type HealthKitWorkout,
} from "./healthkit";

const workout = (overrides: Partial<HealthKitWorkout> = {}): HealthKitWorkout => ({
  uuid: "8E5D2A50-0000-4000-8000-000000000001",
  activityTypeRaw: 50,
  startDate: "2026-08-09T16:00:00Z",
  endDate: "2026-08-09T17:00:00Z",
  duration_s: 3600,
  distance_m: null,
  calories: 420,
  avg_hr: 132,
  max_hr: 171,
  hr_samples: [
    { t: 0, bpm: 90 },
    { t: 5, bpm: 110 },
  ],
  ...overrides,
});

describe("activityTypeFromHK", () => {
  it("maps both strength-training types to WeightTraining (lifting review mode)", () => {
    expect(activityTypeFromHK(50)).toBe("WeightTraining"); // traditional
    expect(activityTypeFromHK(20)).toBe("WeightTraining"); // functional
  });

  it("maps cardio types onto names inferReviewMode already treats as cardio", () => {
    // The whole point of the mapping: HealthKit rows must flow through the
    // existing Strava-shaped review matrix unchanged.
    for (const raw of [37, 13, 52, 24, 46, 16, 35]) {
      expect(inferReviewMode(activityTypeFromHK(raw), 5, {})).toBe("cardio");
    }
  });

  it("unknown types fall back to the generic Workout bucket", () => {
    expect(activityTypeFromHK(6)).toBe("Workout"); // basketball
    expect(activityTypeFromHK(3000)).toBe("Workout"); // other
  });
});

describe("isSettled", () => {
  const endedAt = new Date("2026-08-09T17:00:00Z").getTime();

  it("holds back workouts that ended under two minutes ago (HR still syncing from the Watch)", () => {
    expect(isSettled(workout(), endedAt + 60_000)).toBe(false);
  });

  it("admits workouts once the settle window has passed", () => {
    expect(isSettled(workout(), endedAt + 3 * 60_000)).toBe(true);
  });
});

describe("healthKitWorkoutToRow", () => {
  it("builds a Strava-shaped captured_sessions row", () => {
    const row = healthKitWorkoutToRow(workout(), "user-1");
    expect(row).toMatchObject({
      user_id: "user-1",
      provider: "healthkit",
      external_id: "8E5D2A50-0000-4000-8000-000000000001",
      started_at: "2026-08-09T16:00:00Z",
      ended_at: "2026-08-09T17:00:00Z",
      review_status: "pending",
      motion_samples: null,
    });
    expect(row.aggregates).toEqual({
      activity_type: "WeightTraining",
      duration_s: 3600,
      avg_hr: 132,
      max_hr: 171,
      calories: 420,
    });
    expect(row.hr_samples).toHaveLength(2);
  });

  it("a strength workout with HR sets up the lifting review mode", () => {
    const row = healthKitWorkoutToRow(workout(), "user-1");
    expect(inferReviewMode(row.aggregates.activity_type ?? null, 4, row.aggregates)).toBe(
      "lifting",
    );
  });

  it("omits zero/absent distance and nulls empty HR arrays", () => {
    const row = healthKitWorkoutToRow(
      workout({ distance_m: 0, avg_hr: null, max_hr: null, calories: null, hr_samples: [] }),
      "user-1",
    );
    expect(row.aggregates.distance_m).toBeUndefined();
    expect(row.aggregates.avg_hr).toBeUndefined();
    expect(row.hr_samples).toBeNull();
  });

  it("a run with distance flows to the cardio review mode", () => {
    const row = healthKitWorkoutToRow(
      workout({ activityTypeRaw: 37, distance_m: 5012 }),
      "user-1",
    );
    expect(row.aggregates.distance_m).toBe(5012);
    expect(inferReviewMode(row.aggregates.activity_type ?? null, 0, row.aggregates)).toBe(
      "cardio",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  buildStravaActivityPayload,
  buildUploadSets,
  localWallClockIso,
} from "./writeback";
import { stravaExerciseType } from "./exerciseEnum";
import type { WorkoutExercise } from "@/data/liftosMock";

const set = (over: Partial<WorkoutExercise["sets"][number]> = {}) => ({
  id: Math.random().toString(36).slice(2),
  reps: 8,
  weight: 185,
  completed: true,
  ...over,
});

const exercise = (over: Partial<WorkoutExercise> = {}): WorkoutExercise => ({
  id: Math.random().toString(36).slice(2),
  name: "Bench Press",
  category: "Chest",
  target: "3×8",
  sets: [set()],
  ...over,
});

// Local wall-clock instants keep assertions timezone-independent.
const startedLocal = new Date(2026, 7, 16, 14, 30, 0);
const finishedLocal = new Date(2026, 7, 16, 15, 42, 30);

const baseLog = {
  id: "log-abc123",
  name: "Push Day",
  exercises: [exercise()],
  started_at: startedLocal.toISOString(),
  finished_at: finishedLocal.toISOString(),
  duration_minutes: 72,
  completed_sets: 1,
  total_volume: 1480,
};

describe("localWallClockIso", () => {
  it("renders the device-local wall clock in ISO shape", () => {
    expect(localWallClockIso(new Date(2026, 0, 5, 9, 7, 3))).toBe(
      "2026-01-05T09:07:03Z",
    );
  });
});

describe("buildStravaActivityPayload", () => {
  it("builds name, stats, top-set lines, and attribution", () => {
    const payload = buildStravaActivityPayload(baseLog, "lb");
    expect(payload.name).toBe("Push Day");
    expect(payload.description).toContain("1 exercise · 1 set · 1,480 lb lifted");
    expect(payload.description).toContain("Bench Press — 185 lb × 8");
    expect(payload.description.endsWith("Logged with LiftOS")).toBe(true);
  });

  it("uses the local wall clock for start_date_local and exact elapsed seconds", () => {
    const payload = buildStravaActivityPayload(baseLog, "lb");
    expect(payload.start_date_local).toBe("2026-08-16T14:30:00Z");
    expect(payload.started_at).toBe(startedLocal.toISOString());
    expect(payload.elapsed_time).toBe(72 * 60 + 30);
  });

  it("picks the heaviest completed working set, ignoring warmups and incompletes", () => {
    const log = {
      ...baseLog,
      exercises: [
        exercise({
          sets: [
            set({ weight: 135, reps: 10, isWarmup: true }),
            set({ weight: 225, reps: 1, completed: false }),
            set({ weight: 185, reps: 8 }),
            set({ weight: 205, reps: 3 }),
          ],
        }),
      ],
    };
    const payload = buildStravaActivityPayload(log, "lb");
    expect(payload.description).toContain("Bench Press — 205 lb × 3");
    expect(payload.description).not.toContain("225");
    expect(payload.description).not.toContain("135");
  });

  it("renders timed exercises as holds, weighted holds with the load", () => {
    const log = {
      ...baseLog,
      exercises: [
        exercise({
          name: "Plank",
          sets: [set({ reps: 0, weight: 0, duration_seconds: 90 })],
        }),
        exercise({
          name: "Weighted Plank",
          sets: [set({ reps: 0, weight: 45, duration_seconds: 60 })],
        }),
      ],
    };
    const payload = buildStravaActivityPayload(log, "lb");
    expect(payload.description).toContain("Plank — 1:30");
    expect(payload.description).toContain("Weighted Plank — 1:00 @ 45 lb");
  });

  it("skips cardio and placeholder imports, falls back to reps-only lines", () => {
    const log = {
      ...baseLog,
      exercises: [
        exercise({ name: "Treadmill", kind: "cardio" as const }),
        exercise({ name: "Exercise 2", sets: [set()] }),
        exercise({ name: "Pull-ups", sets: [set({ weight: 0, reps: 12 })] }),
      ],
      completed_sets: 3,
    };
    const payload = buildStravaActivityPayload(log, "lb");
    expect(payload.description).not.toContain("Treadmill");
    expect(payload.description).not.toContain("Exercise 2");
    expect(payload.description).toContain("Pull-ups — 12 reps");
    expect(payload.description).toContain("1 exercise · 3 sets");
  });

  it("survives a missing started_at via duration_minutes and floors at 60s", () => {
    const payload = buildStravaActivityPayload(
      { ...baseLog, started_at: null, duration_minutes: 45 },
      "lb",
    );
    expect(payload.elapsed_time).toBe(45 * 60);
    const zero = buildStravaActivityPayload(
      { ...baseLog, started_at: null, duration_minutes: 0 },
      "lb",
    );
    expect(zero.elapsed_time).toBe(60);
  });

  it("carries the external id and a native upload payload", () => {
    const payload = buildStravaActivityPayload(baseLog, "lb");
    expect(payload.external_id).toBe("liftos-log-abc123");
    expect(payload.upload_json).not.toBeNull();
    expect(payload.upload_json?.version).toBe("1.0");
    expect(payload.upload_json?.start_time).toBe(startedLocal.toISOString());
    expect(payload.upload_json?.utc_offset).toBe(
      -startedLocal.getTimezoneOffset() * 60,
    );
    expect(payload.upload_json?.creator).toEqual({ name: "LiftOS" });
    // 185 lb → 83.9 kg
    expect(payload.upload_json?.sets).toEqual([
      { exercise_type: "BARBELL_BENCH_PRESS", repetitions: 8, weight: 83.9 },
    ]);
    expect(payload.description_short).toContain("Volume: 1,480 lb in 1 set");
    expect(payload.description_short.endsWith("Logged with LiftOS")).toBe(true);
  });

  it("defaults a blank session name and omits the volume stat at zero", () => {
    const payload = buildStravaActivityPayload(
      {
        ...baseLog,
        name: "  ",
        total_volume: 0,
        exercises: [exercise({ sets: [set({ weight: 0, reps: 12 })] })],
      },
      "lb",
    );
    expect(payload.name).toBe("Strength Training");
    expect(payload.description).not.toContain("lifted");
  });
});

describe("buildUploadSets", () => {
  it("keeps kg weights as-is, excludes warmups/incompletes/placeholders", () => {
    const sets = buildUploadSets(
      [
        exercise({
          sets: [
            set({ weight: 100, reps: 5 }),
            set({ weight: 60, reps: 10, isWarmup: true }),
            set({ weight: 110, reps: 3, completed: false }),
          ],
        }),
        exercise({ name: "Exercise 3" }),
      ],
      "kg",
    );
    expect(sets).toEqual([
      { exercise_type: "BARBELL_BENCH_PRESS", repetitions: 5, weight: 100 },
    ]);
  });

  it("renders timed sets with duration and cardio as CARDIO_GENERIC", () => {
    const sets = buildUploadSets(
      [
        exercise({
          name: "Plank",
          sets: [set({ reps: 0, weight: 0, duration_seconds: 90 })],
        }),
        exercise({
          name: "Rowing Machine",
          kind: "cardio",
          sets: [set({ reps: 0, weight: 0, duration_seconds: 600 })],
        }),
      ],
      "lb",
    );
    expect(sets).toEqual([
      { exercise_type: "PLANK_HOLD", duration: 90 },
      { exercise_type: "CARDIO_GENERIC", duration: 600 },
    ]);
  });
});

describe("stravaExerciseType", () => {
  it.each([
    ["Bench Press", "BARBELL_BENCH_PRESS"],
    ["Incline Dumbbell Press", "INCLINE_DUMBBELL_BENCH_PRESS"],
    ["Back Squat", "BARBELL_BACK_SQUAT"],
    ["Hack Squat", "MACHINE_HACK_SQUAT"],
    ["Deadlift", "BARBELL_DEADLIFT"],
    ["Romanian Deadlift", "BARBELL_ROMANIAN_DEADLIFT"],
    ["RDL", "BARBELL_ROMANIAN_DEADLIFT"],
    ["Lat Pulldown", "LAT_PULLDOWN"],
    ["Pull-ups", "PULL_UP_GENERIC"],
    ["Barbell Row", "BENT_OVER_BARBELL_ROW"],
    ["Overhead Press", "OVERHEAD_BARBELL_PRESS"],
    ["OHP", "OVERHEAD_BARBELL_PRESS"],
    ["Lateral Raise", "LATERAL_RAISE_GENERIC"],
    ["Tricep Pushdown", "CABLE_TRICEPS_PUSHDOWN"],
    ["Skull Crushers", "SKULL_CRUSHER"],
    ["Leg Press", "LEG_PRESS"],
    ["Leg Extension", "MACHINE_LEG_EXTENSION"],
    ["Bulgarian Split Squat", "BARBELL_BULGARIAN_SPLIT_SQUAT"],
    ["Hip Thrust", "BARBELL_HIP_THRUST"],
    ["Farmer's Walk", "FARMERS_CARRY"],
    ["Planks", "PLANK_HOLD"],
    ["Side Plank", "SIDE_PLANK_HOLD"],
    // Josh logs muscle-named entries — they must not fall to TOTAL_BODY.
    ["Biceps", "CURL_GENERIC"],
    ["forearms", "DUMBBELL_WRIST_CURL"],
    ["back", "ROW_GENERIC"],
    // Movement rules outrank muscle names: hack squat is not \bback\b.
    ["Mystery Movement 9000", "TOTAL_BODY_GENERIC"],
  ])("%s → %s", (name, expected) => {
    expect(stravaExerciseType(name)).toBe(expected);
  });
});

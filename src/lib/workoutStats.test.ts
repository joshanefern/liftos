import { describe, expect, it } from "vitest";
import type { WorkoutExercise } from "@/data/liftosMock";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { getTopLifts, getWeeklyVolumeTarget, getWeekStats } from "./workoutStats";

const log = (exercises: WorkoutExercise[]): WorkoutLog => ({
  id: "log-1",
  template_id: null,
  name: "Session",
  exercises,
  notes: null,
  started_at: null,
  finished_at: "2026-08-01T10:00:00Z",
  duration_minutes: null,
  total_sets: 0,
  completed_sets: 0,
  total_volume: 0,
  source: "manual",
  captured_session_id: null,
  created_at: "2026-08-01T10:00:00Z",
});

describe("getTopLifts", () => {
  it("excludes warmup sets from bests", () => {
    const logs = [
      log([
        {
          id: "bench",
          name: "Barbell Bench Press",
          category: "Chest",
          target: "t",
          sets: [
            { id: "w1", reps: 5, weight: 135, completed: true, isWarmup: true },
            { id: "s1", reps: 8, weight: 115, completed: true },
          ],
        },
        {
          id: "squat",
          name: "Back Squat",
          category: "Quads",
          target: "t",
          sets: [
            // Only warmups completed — exercise must not appear at all.
            { id: "w2", reps: 5, weight: 225, completed: true, isWarmup: true },
            { id: "s2", reps: 5, weight: 315, completed: false },
          ],
        },
      ]),
    ];
    expect(getTopLifts(logs)).toEqual([
      { name: "Barbell Bench Press", weight: 115, reps: 8 },
    ]);
  });
});

const volLog = (daysAgo: number, volume: number, minutes: number | null = null): WorkoutLog => {
  const finished = new Date(Date.now() - daysAgo * 864e5).toISOString();
  return {
    ...log([]),
    id: `vol-${daysAgo}-${volume}`,
    finished_at: finished,
    created_at: finished,
    duration_minutes: minutes,
    total_volume: volume,
  };
};

describe("getWeeklyVolumeTarget", () => {
  it("floors at 5,000 with no history", () => {
    expect(getWeeklyVolumeTarget([])).toBe(5000);
  });

  it("floors at 5,000 when the 4-week average is low", () => {
    // 10,000 over 4 weeks → avg 2,500 → ×1.1 = 2,750 → floor wins.
    expect(getWeeklyVolumeTarget([volLog(5, 10_000)])).toBe(5000);
  });

  it("targets 10% above the 4-week average, rounded to nearest 500", () => {
    // 36,000 over 4 weeks → avg 9,000 → ×1.1 = 9,900 → rounds to 10,000.
    const logs = [volLog(2, 9_000), volLog(9, 9_000), volLog(16, 9_000), volLog(23, 9_000)];
    expect(getWeeklyVolumeTarget(logs)).toBe(10_000);
  });

  it("ignores logs older than 28 days", () => {
    expect(getWeeklyVolumeTarget([volLog(40, 400_000)])).toBe(5000);
  });
});

describe("getWeekStats durations", () => {
  it("sums this week's duration_minutes, treating null as 0", () => {
    // Both logs finish "now", squarely inside the current Monday-start week.
    const stats = getWeekStats([volLog(0, 1000, 45), volLog(0, 500, null)]);
    expect(stats.sessions).toBe(2);
    expect(stats.totalMinutes).toBe(45);
    expect(stats.totalVolume).toBe(1500);
  });
});

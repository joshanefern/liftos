import { describe, expect, it } from "vitest";
import type { WorkoutExercise } from "@/data/liftosMock";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { featuredLift, getLiftTrends } from "./strengthTrend";
import { getWeeklyStreak } from "./workoutStats";

const DAY_MS = 86_400_000;
const daysAgo = (d: number): string => new Date(Date.now() - d * DAY_MS).toISOString();

const ex = (
  name: string,
  weight: number,
  opts: { completed?: boolean; isWarmup?: boolean } = {},
): WorkoutExercise => ({
  id: name,
  name,
  category: "c",
  target: "t",
  sets: [
    {
      id: `${name}-1`,
      reps: 5,
      weight,
      completed: opts.completed ?? true,
      isWarmup: opts.isWarmup ?? false,
    },
  ],
});

const log = (finished_at: string, exercises: WorkoutExercise[]): WorkoutLog => ({
  id: `log-${finished_at}`,
  template_id: null,
  name: "Session",
  exercises,
  notes: null,
  started_at: null,
  finished_at,
  duration_minutes: 45,
  total_sets: 1,
  completed_sets: 1,
  total_volume: 500,
  source: "manual",
  captured_session_id: null,
  created_at: finished_at,
});

describe("getLiftTrends", () => {
  it("tracks best working-set weight per session, oldest to newest", () => {
    const logs = [
      log(daysAgo(2), [ex("Bench Press", 205)]),
      log(daysAgo(30), [ex("Bench Press", 195)]),
      log(daysAgo(60), [ex("Bench Press", 185)]),
    ];
    const [bench] = getLiftTrends(logs);
    expect(bench.points).toEqual([185, 195, 205]);
    expect(bench.first).toBe(185);
    expect(bench.last).toBe(205);
    expect(bench.delta).toBe(20);
  });

  it("ignores warm-ups, incomplete sets, and lifts with too little history", () => {
    const logs = [
      log(daysAgo(1), [ex("Bench Press", 300, { isWarmup: true }), ex("Bench Press", 200)]),
      log(daysAgo(10), [ex("Bench Press", 400, { completed: false }), ex("Bench Press", 195)]),
      log(daysAgo(20), [ex("Bench Press", 190)]),
      log(daysAgo(5), [ex("Squat", 250)]), // one session only — no trend
    ];
    const trends = getLiftTrends(logs);
    expect(trends).toHaveLength(1);
    expect(trends[0].points).toEqual([190, 195, 200]);
  });

  it("ranks improving lifts first", () => {
    const logs = [
      log(daysAgo(1), [ex("Bench Press", 200), ex("Squat", 240)]),
      log(daysAgo(10), [ex("Bench Press", 195), ex("Squat", 250)]),
      log(daysAgo(20), [ex("Bench Press", 185), ex("Squat", 250)]),
    ];
    const trends = getLiftTrends(logs);
    expect(trends[0].name).toBe("Bench Press"); // +15 beats -10
  });
});

describe("featuredLift", () => {
  it("prefers the biggest gainer, falls back to most-trained when nothing improves", () => {
    const gaining = { name: "A", first: 1, last: 2, delta: 1, points: [1, 2], sessions: 2 };
    const flat = { name: "B", first: 5, last: 5, delta: 0, points: [5, 5, 5], sessions: 3 };
    expect(featuredLift([gaining, flat])?.name).toBe("A");
    expect(featuredLift([{ ...gaining, delta: -1, last: 0 }, flat])?.name).toBe("B");
    expect(featuredLift([])).toBeNull();
  });
});

describe("getWeeklyStreak", () => {
  it("counts consecutive weeks with a session, tolerating an open current week", () => {
    // A session yesterday is always in the current OR immediately previous
    // Mon-start week, so the streak must be exactly 1 regardless of today.
    expect(getWeeklyStreak([])).toBe(0);
    expect(getWeeklyStreak([log(daysAgo(1), [ex("Bench Press", 100)])])).toBe(1);
  });

  it("a gap week breaks the streak", () => {
    // Trained this week and 3 weeks ago, but not in between: streak is 1.
    const logs = [
      log(daysAgo(0), [ex("Bench Press", 100)]),
      log(daysAgo(21), [ex("Bench Press", 100)]),
    ];
    expect(getWeeklyStreak(logs)).toBe(1);
  });
});

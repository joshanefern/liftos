import { describe, expect, it } from "vitest";
import type { WorkoutExercise } from "@/data/liftosMock";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import {
  featuredLift,
  getLiftTrends,
  lastSessionDeltas,
  liftSessionSeries,
  lockedTrendCandidates,
  sessionImprovement,
} from "./strengthTrend";
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

describe("timed exercises", () => {
  const plank = (duration: number): WorkoutExercise => ({
    id: "plank",
    name: "Plank",
    tracking: "time",
    category: "Core",
    target: "t",
    sets: [{ id: `plank-${duration}`, duration_seconds: duration, completed: true }],
  });

  it("trends hold-only exercises on duration", () => {
    const logs = [
      log(daysAgo(2), [plank(90)]),
      log(daysAgo(10), [plank(75)]),
      log(daysAgo(20), [plank(60)]),
    ];
    const [trend] = getLiftTrends(logs);
    expect(trend.metric).toBe("time");
    expect(trend.points).toEqual([60, 75, 90]);
    expect(trend.delta).toBe(30);
  });

  it("weight trends outrank time trends; an improving hold beats a flat lift for the feature", () => {
    const logs = [
      log(daysAgo(2), [plank(90), ex("Bench Press", 200)]),
      log(daysAgo(10), [plank(75), ex("Bench Press", 200)]),
      log(daysAgo(20), [plank(60), ex("Bench Press", 200)]),
    ];
    const trends = getLiftTrends(logs);
    expect(trends.map((t) => t.name)).toEqual(["Bench Press", "Plank"]);
    expect(featuredLift(trends)?.name).toBe("Plank"); // +30s beats +0 lb
  });
});

describe("featuredLift", () => {
  const base = { metric: "weight" as const };
  it("prefers the biggest gainer, falls back to most-trained when nothing improves", () => {
    const gaining = { ...base, name: "A", first: 1, last: 2, delta: 1, points: [1, 2], sessions: 2 };
    const flat = { ...base, name: "B", first: 5, last: 5, delta: 0, points: [5, 5, 5], sessions: 3 };
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

describe("lockedTrendCandidates", () => {
  it("names lifts one session short, excluding junk and cardio", () => {
    const logs = [
      log(daysAgo(3), [ex("Squat", 250), ex("Exercise 1", 100)]),
      log(daysAgo(1), [ex("Bench Press", 200)]),
      log(daysAgo(10), [ex("Bench Press", 195)]),
    ];
    const locked = lockedTrendCandidates(logs, 84, 2);
    expect(locked).toEqual([{ name: "Squat", sessions: 1, needed: 1 }]);
  });
});

describe("lastSessionDeltas", () => {
  it("compares the latest workout's best sets against the previous occurrence", () => {
    const logs = [
      log(daysAgo(1), [ex("Bench Press", 82.5)]),
      log(daysAgo(8), [ex("Bench Press", 80)]),
    ];
    const [d] = lastSessionDeltas(logs);
    expect(d.name).toBe("Bench Press");
    expect(d.prev).toEqual([80, 5]);
    expect(d.last).toEqual([82.5, 5]);
    expect(d.direction).toBe("up");
  });

  it("skips lifts with no earlier occurrence and junk names", () => {
    const logs = [
      log(daysAgo(1), [ex("Exercise 1", 100), ex("Overhead Press", 95)]),
      log(daysAgo(8), [ex("Bench Press", 80)]),
    ];
    expect(lastSessionDeltas(logs)).toEqual([]);
  });
});

describe("sessionImprovement", () => {
  it("one signed % — latest session vs each lift's previous occurrence", () => {
    const logs = [
      log(daysAgo(1), [ex("Bench Press", 88)]),
      log(daysAgo(8), [ex("Bench Press", 80)]),
    ];
    // Same reps both sides → Epley cancels: (88-80)/80 = +10%.
    expect(sessionImprovement(logs)).toEqual({ pct: 10, lifts: 1 });
  });

  it("rep gains at the same weight count as improvement", () => {
    const heavy = ex("Bench Press", 100);
    heavy.sets[0].reps = 8;
    const logs = [log(daysAgo(1), [heavy]), log(daysAgo(8), [ex("Bench Press", 100)])];
    // e1RM 100×8 (126.67) vs 100×5 (116.67) → +8.57 → rounds to +9.
    expect(sessionImprovement(logs)).toEqual({ pct: 9, lifts: 1 });
  });

  it("averages across the session's lifts and can go negative", () => {
    const logs = [
      log(daysAgo(1), [ex("Bench Press", 88), ex("Squat", 90)]),
      log(daysAgo(8), [ex("Bench Press", 80), ex("Squat", 100)]),
    ];
    // Bench +10%, squat −10% → 0%.
    expect(sessionImprovement(logs)).toEqual({ pct: 0, lifts: 2 });
  });

  it("a top single never hides a better back-off set", () => {
    const single = ex("Bench Press", 105); // 105×1 — weight PR, low Epley
    single.sets[0].reps = 1;
    const backoff = ex("Bench Press", 100); // 100×9 — the session's best Epley
    backoff.sets[0].reps = 9;
    backoff.sets[0].id = "backoff-1";
    const prevSession = ex("Bench Press", 100);
    prevSession.sets[0].reps = 8;
    const latest = log(daysAgo(1), [single]);
    latest.exercises[0].sets.push(backoff.sets[0]);
    const logs = [latest, log(daysAgo(8), [prevSession])];
    // Best Epley per side: 100×9 (130) vs 100×8 (126.67) → +2.6 → +3, not −14.
    expect(sessionImprovement(logs)).toEqual({ pct: 3, lifts: 1 });
  });

  it("null with fewer than two logs or no comparable lift", () => {
    expect(sessionImprovement([log(daysAgo(1), [ex("Bench Press", 80)])])).toBeNull();
    const logs = [
      log(daysAgo(1), [ex("Overhead Press", 95)]),
      log(daysAgo(8), [ex("Bench Press", 80)]),
    ];
    expect(sessionImprovement(logs)).toBeNull();
  });

  it("skips junk names and shape-mismatched lifts", () => {
    const bodyweight = ex("Push Up", 0);
    bodyweight.sets[0].reps = 20;
    const logs = [
      log(daysAgo(1), [ex("Exercise 1", 200), bodyweight, ex("Bench Press", 88)]),
      log(daysAgo(8), [ex("Exercise 1", 100), ex("Push Up", 50), ex("Bench Press", 80)]),
    ];
    // Junk name and weighted-then-bodyweight push-up are skipped; only bench counts.
    expect(sessionImprovement(logs)).toEqual({ pct: 10, lifts: 1 });
  });
});

describe("liftSessionSeries", () => {
  it("one best-set point per session with a ≤10-rep estimate", () => {
    const logs = [
      log(daysAgo(1), [ex("Bench Press", 200)]),
      log(daysAgo(10), [ex("Bench Press", 190)]),
    ];
    const series = liftSessionSeries(logs, "bench press");
    expect(series.map((p) => p.weight)).toEqual([190, 200]);
    expect(series[1].e1rm).toBeCloseTo(233.33, 1);
  });
});

describe("placeholder exclusion", () => {
  it("junk imported names never chart", () => {
    const logs = [
      log(daysAgo(1), [ex("Exercise 1", 200)]),
      log(daysAgo(10), [ex("Exercise 1", 190)]),
      log(daysAgo(20), [ex("Exercise 1", 180)]),
    ];
    expect(getLiftTrends(logs)).toEqual([]);
  });
});

describe("review-hardening regressions", () => {
  it("duplicate entries of one lift in one log are one session, not two", () => {
    const dup = log(daysAgo(1), [ex("Bench Press", 80), ex("Bench Press", 85)]);
    expect(getLiftTrends([dup], 84, 2)).toEqual([]); // one session — no trend
    expect(lockedTrendCandidates([dup], 84, 2)).toEqual([
      { name: "Bench Press", sessions: 1, needed: 1 },
    ]);
    const series = liftSessionSeries([dup], "Bench Press");
    expect(series).toHaveLength(1);
    expect(series[0].weight).toBe(85); // merged to the log's best
  });

  it("reps-only bodyweight lifts produce series points and deltas", () => {
    const pushups = (iso: string, reps: number) =>
      log(iso, [
        {
          id: "pu",
          name: "Push-Up",
          category: "c",
          target: "t",
          sets: [{ id: `pu-${reps}`, reps, weight: 0, completed: true }],
        },
      ]);
    const logs = [pushups(daysAgo(1), 25), pushups(daysAgo(8), 22)];
    const series = liftSessionSeries(logs, "Push-Up");
    expect(series.map((p) => p.reps)).toEqual([22, 25]);
    const [d] = lastSessionDeltas(logs);
    expect(d.prev).toEqual([0, 22]);
    expect(d.last).toEqual([0, 25]);
    expect(d.direction).toBe("up");
  });

  it("a completed weight with zero reps is a failed lift — never a best set", () => {
    const l = log(daysAgo(1), [
      {
        id: "b",
        name: "Bench Press",
        category: "c",
        target: "t",
        sets: [
          { id: "b1", reps: 0, weight: 185, completed: true },
          { id: "b2", reps: 5, weight: 180, completed: true },
        ],
      },
    ]);
    const [point] = liftSessionSeries([l], "Bench Press");
    expect([point.weight, point.reps]).toEqual([180, 5]);
  });

  it("a session's longest hold survives a heavier shorter set", () => {
    const l = log(daysAgo(1), [
      {
        id: "p",
        name: "Plank",
        tracking: "time" as const,
        category: "Core",
        target: "t",
        sets: [
          { id: "p1", duration_seconds: 90, completed: true },
          { id: "p2", weight: 25, reps: 1, duration_seconds: 30, completed: true },
        ],
      },
    ]);
    const [point] = liftSessionSeries([l], "Plank");
    expect(point.duration).toBe(90);
  });
});

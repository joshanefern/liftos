import { describe, expect, it } from "vitest";
import type { WorkoutExercise } from "@/data/liftosMock";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import {
  countPRsThisMonth,
  getConsistency,
  getTopLifts,
  getWeekObservation,
  getWeeklyVolumeTarget,
  getWeekStats,
  plannedSessionsPerWeek,
} from "./workoutStats";

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

describe("plannedSessionsPerWeek", () => {
  it("reads the low end of an onboarding range", () => {
    expect(plannedSessionsPerWeek("1–2 days")).toBe(1);
    expect(plannedSessionsPerWeek("3–4 days")).toBe(3);
    expect(plannedSessionsPerWeek("5–6 days")).toBe(5);
    expect(plannedSessionsPerWeek("7 days")).toBe(7);
  });

  it("reads an exact onboarding answer as itself", () => {
    expect(plannedSessionsPerWeek("2 days")).toBe(2);
    expect(plannedSessionsPerWeek("3 days")).toBe(3);
    expect(plannedSessionsPerWeek("4 days")).toBe(4);
    expect(plannedSessionsPerWeek("5 days")).toBe(5);
    expect(plannedSessionsPerWeek("6 days")).toBe(6);
    expect(plannedSessionsPerWeek("1 day")).toBe(1);
  });

  it("accepts a bare number and caps at seven", () => {
    expect(plannedSessionsPerWeek("4")).toBe(4);
    expect(plannedSessionsPerWeek("10 days")).toBe(7);
  });

  it("is null when the answer is missing or has no number", () => {
    expect(plannedSessionsPerWeek(null)).toBeNull();
    expect(plannedSessionsPerWeek(undefined)).toBeNull();
    expect(plannedSessionsPerWeek("")).toBeNull();
    expect(plannedSessionsPerWeek("whenever")).toBeNull();
    expect(plannedSessionsPerWeek("0 days")).toBeNull();
  });
});

// A one-lift session at `iso` — the PR-count fixtures only need a weight.
const liftLog = (id: string, iso: string, name: string, weight: number, reps = 5): WorkoutLog => ({
  ...log([
    {
      id: `${id}-ex`,
      name,
      category: "c",
      target: "t",
      sets: [{ id: `${id}-set`, reps, weight, completed: true }],
    },
  ]),
  id,
  finished_at: iso,
  created_at: iso,
});

describe("countPRsThisMonth", () => {
  const now = new Date(2026, 8, 20, 12); // Sept 20 2026, local

  it("counts lifts that beat an earlier best this month, once per session", () => {
    const logs = [
      liftLog("a", "2026-09-01T10:00:00", "Bench Press", 100),
      liftLog("b", "2026-09-10T10:00:00", "Bench Press", 110),
    ];
    // Session a is the first-ever bench — not a record. Session b beats it
    // (weight AND e1rm events) but that's one lift, so one PR.
    expect(countPRsThisMonth(logs, now)).toBe(1);
  });

  it("never counts a first-ever performance", () => {
    const logs = [liftLog("a", "2026-09-05T10:00:00", "Back Squat", 200)];
    expect(countPRsThisMonth(logs, now)).toBe(0);
  });

  it("ignores sessions outside the calendar month", () => {
    const logs = [
      liftLog("a", "2026-08-01T10:00:00", "Bench Press", 100),
      liftLog("b", "2026-08-15T10:00:00", "Bench Press", 110),
    ];
    expect(countPRsThisMonth(logs, now)).toBe(0);
  });

  it("only history before a session can be beaten by it", () => {
    // Sept 5 beat Sept 1; Sept 10 beat Sept 5 — two records, and the later
    // bigger number must not erase the earlier one.
    const logs = [
      liftLog("c", "2026-09-10T10:00:00", "Bench Press", 110),
      liftLog("a", "2026-09-01T10:00:00", "Bench Press", 100),
      liftLog("b", "2026-09-05T10:00:00", "Bench Press", 105),
    ];
    expect(countPRsThisMonth(logs, now)).toBe(2);
  });

  it("counts a prior month's best as beatable history", () => {
    const logs = [
      liftLog("a", "2026-08-20T10:00:00", "Bench Press", 100),
      liftLog("b", "2026-09-02T10:00:00", "Bench Press", 105),
    ];
    expect(countPRsThisMonth(logs, now)).toBe(1);
  });
});

describe("getWeekObservation", () => {
  const base = { sessions: 1, planned: 3, weeklyStreak: 0, prsThisMonth: 0, prevWeekSessions: 0 };

  it("says nothing when there is nothing to say", () => {
    expect(getWeekObservation(base)).toBeNull();
    expect(getWeekObservation({ ...base, sessions: 0 })).toBeNull();
  });

  it("leads with a finished plan", () => {
    expect(
      getWeekObservation({ ...base, sessions: 3, prsThisMonth: 2, weeklyStreak: 5 }),
    ).toBe("This week's plan is done");
  });

  it("a plan can't be done with zero sessions, even when the plan is unknown", () => {
    expect(getWeekObservation({ ...base, sessions: 0, planned: null })).toBeNull();
  });

  it("then records this month, then the streak, then last week", () => {
    expect(getWeekObservation({ ...base, prsThisMonth: 1, weeklyStreak: 4 })).toBe(
      "1 personal record this month",
    );
    expect(getWeekObservation({ ...base, prsThisMonth: 3 })).toBe("3 personal records this month");
    expect(getWeekObservation({ ...base, weeklyStreak: 4, prevWeekSessions: 2 })).toBe(
      "4 weeks in a row",
    );
    expect(getWeekObservation({ ...base, weeklyStreak: 1, prevWeekSessions: 1 })).toBe(
      "Last week: 1 workout",
    );
    expect(getWeekObservation({ ...base, prevWeekSessions: 3 })).toBe("Last week: 3 workouts");
  });
});

describe("getConsistency", () => {
  // Sunday 27 Sep 2026, late afternoon — a day off for a Mon/Wed/Fri lifter.
  const NOW = new Date(2026, 8, 27, 17, 0, 0).getTime();
  const on = (month: number, day: number): WorkoutLog => {
    const finished = new Date(2026, month, day, 18, 30, 0).toISOString();
    return { ...log([]), id: `on-${month}-${day}`, finished_at: finished, created_at: finished };
  };
  // Eight workouts inside the last four weeks, on an account older than that.
  const eight = [on(7, 1), ...[3, 6, 9, 12, 15, 18, 21, 24].map((day) => on(8, day))];

  it("measures the last four weeks against an exact answer", () => {
    // "4 days" → 16 planned; 8 logged → 50%.
    expect(getConsistency(eight, "4 days", NOW)).toEqual({
      days: 28,
      done: 8,
      planned: 16,
      pct: 50,
    });
    // "2 days" → 8 planned; 8 logged → 100%.
    expect(getConsistency(eight, "2 days", NOW)?.pct).toBe(100);
    expect(getConsistency(eight, "6 days", NOW)?.pct).toBe(33);
  });

  it("measures a legacy range against its low end", () => {
    // "3–4 days" → 3 a week → 12 planned; 8 logged → 67%.
    expect(getConsistency(eight, "3–4 days", NOW)?.pct).toBe(67);
    // "1–2 days" → 4 planned; capped at 100.
    expect(getConsistency(eight, "1–2 days", NOW)).toMatchObject({ planned: 4, pct: 100 });
    expect(getConsistency(eight, "5–6 days", NOW)?.pct).toBe(40);
    // "7 days" → 28 planned.
    expect(getConsistency(eight, "7 days", NOW)?.pct).toBe(29);
  });

  it("ignores workouts older than four weeks", () => {
    // Sun 30 Aug is the 29th day back; Mon 31 Aug opens the window.
    expect(getConsistency([on(7, 30), on(8, 25)], "4 days", NOW)).toMatchObject({
      days: 28,
      done: 1,
      pct: 6,
    });
    expect(getConsistency([on(7, 1), on(7, 31), on(8, 25)], "4 days", NOW)?.done).toBe(2);
  });

  it("grades a one-week account on the week it has had", () => {
    // First workout Mon 21 Sep: 7 days counted → about 4 planned, not 16.
    expect(getConsistency([on(8, 21), on(8, 23), on(8, 25)], "4 days", NOW)).toEqual({
      days: 7,
      done: 3,
      planned: 4,
      pct: 75,
    });
    // Four of four is the plan kept, not a quarter of a month.
    expect(
      getConsistency([on(8, 21), on(8, 23), on(8, 24), on(8, 26)], "4 days", NOW),
    ).toEqual({ days: 7, done: 4, planned: 4, pct: 100 });
  });

  it("reads a first workout today as the plan met", () => {
    const today = { ...on(8, 27), finished_at: new Date(NOW - 3_600_000).toISOString() };
    expect(getConsistency([today], "4 days", NOW)).toEqual({
      days: 1,
      done: 1,
      planned: 1,
      pct: 100,
    });
  });

  it("agrees with the Calendar's planned count for a young account", () => {
    // First workout Mon 14 Sep, read Wed 23 Sep: 10 days → about 6 planned
    // (the same case consistency.test pins for plannedWorkoutsInMonth).
    const wednesday = new Date(2026, 8, 23, 12, 0, 0).getTime();
    expect(getConsistency([on(8, 14), on(8, 16), on(8, 21)], "4 days", wednesday)).toEqual({
      days: 10,
      done: 3,
      planned: 6,
      pct: 50,
    });
  });

  it("uses the full four weeks from the day the history is that long", () => {
    // Mon 31 Aug is 28 days counted; Tue 1 Sep is 27.
    expect(getConsistency([on(7, 31)], "4 days", NOW)).toMatchObject({ days: 28, planned: 16 });
    expect(getConsistency([on(8, 1)], "4 days", NOW)).toMatchObject({ days: 27, planned: 15 });
  });

  it("has nothing to grade when the plan is unknown", () => {
    expect(getConsistency(eight, null, NOW)).toBeNull();
    expect(getConsistency(eight, "", NOW)).toBeNull();
    expect(getConsistency(eight, "whenever", NOW)).toBeNull();
  });

  it("has nothing to grade before the first workout", () => {
    expect(getConsistency([], "4 days", NOW)).toBeNull();
    const future = { ...on(8, 28), finished_at: new Date(NOW + 86_400_000).toISOString() };
    const broken = { ...on(8, 20), finished_at: "not a date" };
    expect(getConsistency([future, broken], "4 days", NOW)).toBeNull();
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

import { describe, expect, it } from "vitest";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import {
  compactVolume,
  CONSISTENCY_EMPTY_COPY,
  describeConsistency,
  firstWorkoutTime,
  monthVolumeDelta,
  plannedWorkoutsInMonth,
  volumeComparison,
  weeksTrained,
  weekStreak,
} from "./consistency";

/* Local-time anchor: Wednesday 23 Sep 2026, midday. Sunday-start (the
   Calendar grid's rows): the week it sits in starts Sunday 20 Sep and an
   8-week window reaches back to Sunday 2 Aug. */
const NOW = new Date(2026, 8, 23, 12, 0, 0).getTime();
const DAY_MS = 86_400_000;

let counter = 0;
const logAt = (date: Date, volume = 1000): WorkoutLog => {
  counter += 1;
  const iso = date.toISOString();
  return {
    id: `log-${counter}`,
    template_id: null,
    name: "Session",
    exercises: [],
    notes: null,
    started_at: iso,
    finished_at: iso,
    duration_minutes: 45,
    total_sets: 3,
    completed_sets: 3,
    total_volume: volume,
    source: "manual",
    captured_session_id: null,
    created_at: iso,
  };
};

const daysAgo = (days: number, volume?: number): WorkoutLog =>
  logAt(new Date(NOW - days * DAY_MS), volume);

/** An account old enough that the full 8-week window applies. */
const longAgo = (): WorkoutLog => logAt(new Date(2026, 4, 4, 9, 0, 0));

describe("firstWorkoutTime", () => {
  it("is null with nothing logged", () => {
    expect(firstWorkoutTime([], NOW)).toBeNull();
  });

  it("finds the earliest workout whatever the order", () => {
    const logs = [daysAgo(3), daysAgo(20), daysAgo(9)];
    expect(firstWorkoutTime(logs, NOW)).toBe(NOW - 20 * DAY_MS);
  });

  it("ignores future and unparseable workouts", () => {
    const broken = { ...daysAgo(40), finished_at: "not a date" };
    expect(firstWorkoutTime([daysAgo(-2), broken], NOW)).toBeNull();
    expect(firstWorkoutTime([daysAgo(-2), broken, daysAgo(5)], NOW)).toBe(NOW - 5 * DAY_MS);
  });
});

describe("weeksTrained", () => {
  it("has no window at all with nothing logged", () => {
    expect(weeksTrained([], 8, NOW)).toEqual({ trained: 0, weeks: 0, wholeHistory: true });
  });

  it("is one week when the first workout was this week", () => {
    expect(weeksTrained([daysAgo(1)], 8, NOW)).toEqual({
      trained: 1,
      weeks: 1,
      wholeHistory: true,
    });
  });

  it("counts a week once however many sessions it holds", () => {
    const logs = [daysAgo(0), daysAgo(1), daysAgo(2)]; // Wed, Tue, Mon — same week
    expect(weeksTrained(logs, 8, NOW).trained).toBe(1);
  });

  it("is two weeks when the first workout was last week", () => {
    const lastWeek = logAt(new Date(2026, 8, 15, 18, 0, 0)); // Tue 15 Sep
    expect(weeksTrained([lastWeek, daysAgo(0)], 8, NOW)).toEqual({
      trained: 2,
      weeks: 2,
      wholeHistory: true,
    });
  });

  it("does not count a week that has only just opened against a short history", () => {
    // Trained last week, nothing yet this week: one week lived, one trained.
    const lastWeek = logAt(new Date(2026, 8, 15, 18, 0, 0)); // Tue 15 Sep
    expect(weeksTrained([lastWeek], 8, NOW)).toEqual({
      trained: 1,
      weeks: 1,
      wholeHistory: true,
    });
    // Two weeks running, then a new week opens.
    expect(weeksTrained([daysAgo(14), daysAgo(7)], 8, NOW)).toEqual({
      trained: 2,
      weeks: 2,
      wholeHistory: true,
    });
  });

  it("still counts a finished week that was skipped", () => {
    // Trained two weeks ago, skipped last week, nothing yet this week.
    expect(weeksTrained([daysAgo(14)], 8, NOW)).toEqual({
      trained: 1,
      weeks: 2,
      wholeHistory: true,
    });
  });

  it("leaves a week that has only just opened out of the full window too", () => {
    // Ten weeks running, none yet this week: nothing has been missed.
    const logs = [7, 14, 21, 28, 35, 42, 49, 56, 63, 70].map((days) => daysAgo(days));
    expect(weeksTrained(logs, 8, NOW)).toEqual({ trained: 8, weeks: 8, wholeHistory: false });
    // The week's first workout changes nothing the lifter can see.
    expect(weeksTrained([...logs, daysAgo(0)], 8, NOW)).toEqual({
      trained: 8,
      weeks: 8,
      wholeHistory: false,
    });
  });

  it("counts a missed week once it has ended", () => {
    // Trained every week until two weeks ago, skipped last week.
    const logs = [14, 21, 28, 35, 42, 49, 56, 63, 70].map((days) => daysAgo(days));
    expect(weeksTrained(logs, 8, NOW)).toEqual({ trained: 7, weeks: 8, wholeHistory: false });
  });

  it("measures the window on the weeks counted, not on the calendar", () => {
    // Seven weeks trained and the eighth has just opened: seven weeks
    // lived. An 8-week window here would reach back to a week before the
    // first workout.
    const logs = [7, 14, 21, 28, 35, 42, 49].map((days) => daysAgo(days));
    expect(weeksTrained(logs, 8, NOW)).toEqual({ trained: 7, weeks: 7, wholeHistory: true });
    expect(weeksTrained([...logs, daysAgo(0)], 8, NOW)).toEqual({
      trained: 8,
      weeks: 8,
      wholeHistory: false,
    });
  });

  it("never shows a lifter who trains every week a week missed", () => {
    // One workout every Wednesday from 1 Jul 2026, read at 9am every day
    // for fifteen weeks — Sundays included, before that week's workout.
    const wednesdays = Array.from({ length: 16 }, (_, i) => new Date(2026, 6, 1 + 7 * i, 18, 0, 0));
    for (let day = 0; day < 105; day += 1) {
      const now = new Date(2026, 6, 2 + day, 9, 0, 0).getTime();
      const logs = wednesdays.filter((d) => d.getTime() <= now).map((d) => logAt(d));
      const result = weeksTrained(logs, 8, now);
      expect(result.trained).toBe(result.weeks);
      expect(result.trained).toBe(Math.min(weekStreak(logs, now), 8));
    }
  });

  it("never measures a young account against weeks it did not have", () => {
    // First workout two weeks ago to the day: three calendar weeks touched.
    const result = weeksTrained([daysAgo(14), daysAgo(0)], 8, NOW);
    expect(result).toEqual({ trained: 2, weeks: 3, wholeHistory: true });
  });

  it("counts the gaps inside a short history", () => {
    // First workout five weeks back, then weeks skipped in between.
    const logs = [daysAgo(35), daysAgo(21), daysAgo(0)];
    expect(weeksTrained(logs, 8, NOW)).toEqual({ trained: 3, weeks: 6, wholeHistory: true });
  });

  it("uses the full window once the history is exactly eight weeks", () => {
    const firstSunday = logAt(new Date(2026, 7, 2, 9, 0, 0)); // Sun 2 Aug
    expect(weeksTrained([firstSunday, daysAgo(0)], 8, NOW)).toEqual({
      trained: 2,
      weeks: 8,
      wholeHistory: false,
    });
  });

  it("stays at eight weeks for a longer history", () => {
    const logs = [longAgo(), daysAgo(0), daysAgo(8), daysAgo(15), daysAgo(30)];
    expect(weeksTrained(logs, 8, NOW)).toEqual({ trained: 4, weeks: 8, wholeHistory: false });
  });

  it("reads zero for an established account that has not trained in the window", () => {
    expect(weeksTrained([longAgo()], 8, NOW)).toEqual({
      trained: 0,
      weeks: 8,
      wholeHistory: false,
    });
  });

  it("weeks start on Sunday — a Sunday session opens the same week as Monday's", () => {
    const saturday = logAt(new Date(2026, 8, 19, 18, 0, 0));
    const sunday = logAt(new Date(2026, 8, 20, 18, 0, 0));
    const monday = logAt(new Date(2026, 8, 21, 7, 0, 0));
    expect(weeksTrained([sunday, monday], 8, NOW)).toMatchObject({ trained: 1, weeks: 1 });
    expect(weeksTrained([saturday, sunday], 8, NOW)).toMatchObject({ trained: 2, weeks: 2 });
  });

  it("weekStartsOn = 1 counts Monday-start weeks instead", () => {
    const sunday = logAt(new Date(2026, 8, 20, 18, 0, 0));
    const monday = logAt(new Date(2026, 8, 21, 7, 0, 0));
    expect(weeksTrained([sunday, monday], 8, NOW, 1)).toMatchObject({ trained: 2, weeks: 2 });
    // With Monday starts the window reaches back to Mon 3 Aug, not Sun 2 Aug.
    // (A workout today keeps the window ending on the current week.)
    expect(
      weeksTrained([logAt(new Date(2026, 7, 2, 9, 0, 0)), daysAgo(0)], 8, NOW, 1).trained,
    ).toBe(1);
    expect(
      weeksTrained([logAt(new Date(2026, 7, 3, 9, 0, 0)), daysAgo(0)], 8, NOW, 1).trained,
    ).toBe(2);
  });

  it("includes the earliest week of the window and drops the one before it", () => {
    const earliestSunday = logAt(new Date(2026, 7, 2, 9, 0, 0)); // Sun 2 Aug
    const dayBefore = logAt(new Date(2026, 7, 1, 9, 0, 0)); // Sat 1 Aug
    expect(weeksTrained([earliestSunday, daysAgo(0)], 8, NOW).trained).toBe(2);
    expect(weeksTrained([dayBefore, daysAgo(0)], 8, NOW).trained).toBe(1);
  });

  it("moves the window back a week while the current week is empty", () => {
    // Nothing yet this week: the eight weeks end last week, so they open
    // on Sun 26 Jul.
    const opening = logAt(new Date(2026, 6, 26, 9, 0, 0)); // Sun 26 Jul
    const dayBefore = logAt(new Date(2026, 6, 25, 9, 0, 0)); // Sat 25 Jul
    expect(weeksTrained([longAgo(), opening], 8, NOW).trained).toBe(1);
    expect(weeksTrained([longAgo(), dayBefore], 8, NOW).trained).toBe(0);
  });

  it("honors a different window size", () => {
    const logs = [daysAgo(0), daysAgo(7), daysAgo(14), daysAgo(21), daysAgo(28)];
    expect(weeksTrained(logs, 4, NOW)).toEqual({ trained: 4, weeks: 4, wholeHistory: false });
  });

  it("ignores future and unparseable sessions", () => {
    const future = daysAgo(-3);
    const broken = { ...daysAgo(1), finished_at: "not a date" };
    expect(weeksTrained([future, broken], 8, NOW)).toEqual({
      trained: 0,
      weeks: 0,
      wholeHistory: true,
    });
  });

  it("never asks for a window smaller than one week", () => {
    expect(weeksTrained([daysAgo(0)], 0, NOW)).toMatchObject({ trained: 1, weeks: 1 });
  });

  it("counts whole weeks across a clock change", () => {
    // Wed 11 Nov back to Wed 14 Oct — US and EU clocks both change between.
    const november = new Date(2026, 10, 11, 12, 0, 0).getTime();
    const october = logAt(new Date(2026, 9, 14, 18, 0, 0));
    const thisWeek = logAt(new Date(2026, 10, 9, 18, 0, 0));
    expect(weeksTrained([october, thisWeek], 8, november)).toEqual({
      trained: 2,
      weeks: 5,
      wholeHistory: true,
    });
    expect(weeksTrained([october], 8, november)).toEqual({
      trained: 1,
      weeks: 4,
      wholeHistory: true,
    });
  });
});

describe("weekStreak", () => {
  it("is zero with nothing logged", () => {
    expect(weekStreak([], NOW)).toBe(0);
  });

  it("counts weeks in a row, not days", () => {
    // Mon / Fri one week, Tue the next, Wed this week — days off in between.
    const logs = [
      logAt(new Date(2026, 8, 7, 18, 0, 0)),
      logAt(new Date(2026, 8, 11, 18, 0, 0)),
      logAt(new Date(2026, 8, 15, 18, 0, 0)),
      daysAgo(0),
    ];
    expect(weekStreak(logs, NOW)).toBe(3);
  });

  it("stands through a current week that is still empty", () => {
    const logs = [daysAgo(7), daysAgo(14)];
    expect(weekStreak(logs, NOW)).toBe(2);
  });

  it("stops at the first skipped week", () => {
    const logs = [daysAgo(0), daysAgo(7), daysAgo(21), daysAgo(28)];
    expect(weekStreak(logs, NOW)).toBe(2);
  });

  it("is zero once this week and last week are both empty", () => {
    expect(weekStreak([daysAgo(14), daysAgo(21)], NOW)).toBe(0);
  });

  it("uses the Calendar's Sunday-start rows unless told otherwise", () => {
    const saturday = logAt(new Date(2026, 8, 19, 18, 0, 0));
    const sunday = logAt(new Date(2026, 8, 20, 18, 0, 0));
    expect(weekStreak([saturday, sunday], NOW)).toBe(2);
    expect(weekStreak([saturday, sunday], NOW, 1)).toBe(1);
  });

  it("ignores future and unparseable workouts", () => {
    const broken = { ...daysAgo(1), finished_at: "not a date" };
    expect(weekStreak([daysAgo(-2), broken], NOW)).toBe(0);
  });

  it("runs unbroken across a clock change", () => {
    const november = new Date(2026, 10, 11, 12, 0, 0).getTime();
    const logs = [0, 7, 14, 21, 28].map((days) => logAt(new Date(november - days * DAY_MS)));
    expect(weekStreak(logs, november)).toBe(5);
  });
});

describe("describeConsistency", () => {
  it("says when the history starts instead of printing a zero", () => {
    expect(describeConsistency(weeksTrained([], 8, NOW))).toEqual({
      value: null,
      caption: CONSISTENCY_EMPTY_COPY,
    });
    expect(CONSISTENCY_EMPTY_COPY).toBe(
      "Your consistency history starts with your first workout.",
    );
  });

  it("reads a first week as one week trained", () => {
    expect(describeConsistency(weeksTrained([daysAgo(1)], 8, NOW))).toEqual({
      value: 1,
      caption: "week trained so far",
    });
  });

  it("describes a short history as the lifter's first weeks", () => {
    expect(describeConsistency({ trained: 2, weeks: 2, wholeHistory: true })).toEqual({
      value: 2,
      caption: "of your first 2 weeks trained",
    });
    expect(describeConsistency({ trained: 1, weeks: 2, wholeHistory: true })).toEqual({
      value: 1,
      caption: "of your first 2 weeks trained",
    });
    expect(describeConsistency({ trained: 3, weeks: 6, wholeHistory: true }).caption).toBe(
      "of your first 6 weeks trained",
    );
  });

  it("uses the last eight weeks once the history is that long", () => {
    expect(describeConsistency({ trained: 5, weeks: 8, wholeHistory: false })).toEqual({
      value: 5,
      caption: "of the last 8 weeks trained",
    });
  });

  it("never pairs a one-week window with a plural or a fraction", () => {
    for (const wholeHistory of [true, false])
      for (const trained of [0, 1]) {
        const { value, caption } = describeConsistency({ trained, weeks: 1, wholeHistory });
        const read = `${value ?? ""} ${caption}`;
        expect(read).not.toMatch(/1 weeks/);
        expect(read).not.toMatch(/of (the last|your first) 1\b/);
      }
  });

  it("never tells a young account about the last 8 weeks", () => {
    for (const days of [0, 6, 14, 27, 41]) {
      const copy = describeConsistency(weeksTrained([daysAgo(days)], 8, NOW));
      expect(copy.caption).not.toContain("of the last");
    }
  });

  it("reads the same through the Sunday a history turns eight weeks old", () => {
    // One workout every Wednesday from 1 Jul 2026.
    const read = (now: Date) => {
      const logs = Array.from({ length: 16 }, (_, i) => new Date(2026, 6, 1 + 7 * i, 18, 0, 0))
        .filter((d) => d.getTime() <= now.getTime())
        .map((d) => logAt(d));
      const { value, caption } = describeConsistency(weeksTrained(logs, 8, now.getTime()));
      return `${value} ${caption}`;
    };
    expect(read(new Date(2026, 7, 13, 9))).toBe("7 of your first 7 weeks trained"); // Thu
    expect(read(new Date(2026, 7, 16, 9))).toBe("7 of your first 7 weeks trained"); // Sun
    expect(read(new Date(2026, 7, 20, 9))).toBe("8 of the last 8 weeks trained"); // Thu
    expect(read(new Date(2026, 7, 23, 9))).toBe("8 of the last 8 weeks trained"); // Sun
    expect(read(new Date(2026, 8, 27, 9))).toBe("8 of the last 8 weeks trained"); // Sun
  });
});

describe("plannedWorkoutsInMonth", () => {
  const SEPTEMBER = [2026, 8] as const;

  it("has no rate without a weekly plan or without history", () => {
    expect(plannedWorkoutsInMonth([daysAgo(1)], ...SEPTEMBER, null, NOW)).toBeNull();
    expect(plannedWorkoutsInMonth([daysAgo(1)], ...SEPTEMBER, 0, NOW)).toBeNull();
    expect(plannedWorkoutsInMonth([], ...SEPTEMBER, 4, NOW)).toBeNull();
  });

  it("has no rate for a month before the first workout", () => {
    expect(plannedWorkoutsInMonth([daysAgo(5)], 2026, 7, 4, NOW)).toBeNull();
  });

  it("has no rate for a month that has not started", () => {
    expect(plannedWorkoutsInMonth([daysAgo(5)], 2026, 9, 4, NOW)).toBeNull();
  });

  it("plans only from the first workout in the month the account began", () => {
    // First workout Mon 14 Sep → 10 days counted to the 23rd → about 6 planned.
    const logs = [
      logAt(new Date(2026, 8, 14, 18, 0, 0)),
      logAt(new Date(2026, 8, 16, 18, 0, 0)),
      logAt(new Date(2026, 8, 21, 18, 0, 0)),
    ];
    expect(plannedWorkoutsInMonth(logs, ...SEPTEMBER, 4, NOW)).toEqual({
      done: 3,
      planned: 6,
      pct: 50,
      sinceFirstWorkout: true,
    });
  });

  it("reads a first workout today as the plan met, not as a month missed", () => {
    expect(plannedWorkoutsInMonth([daysAgo(0)], ...SEPTEMBER, 4, NOW)).toEqual({
      done: 1,
      planned: 1,
      pct: 100,
      sinceFirstWorkout: true,
    });
  });

  it("plans the month so far for an established account", () => {
    // 23 days at 4 a week → about 13 planned.
    const logs = [longAgo(), daysAgo(1), daysAgo(3)];
    expect(plannedWorkoutsInMonth(logs, ...SEPTEMBER, 4, NOW)).toEqual({
      done: 2,
      planned: 13,
      pct: 15,
      sinceFirstWorkout: false,
    });
  });

  it("plans every day of a finished month", () => {
    // August has 31 days → about 18 planned at 4 a week.
    const logs = [longAgo(), logAt(new Date(2026, 7, 10, 18, 0, 0))];
    expect(plannedWorkoutsInMonth(logs, 2026, 7, 4, NOW)).toMatchObject({
      done: 1,
      planned: 18,
      sinceFirstWorkout: false,
    });
  });

  it("reads a real empty month as zero", () => {
    expect(plannedWorkoutsInMonth([longAgo()], 2026, 7, 4, NOW)).toMatchObject({
      done: 0,
      pct: 0,
    });
  });

  it("caps a month far over plan at three digits", () => {
    const logs = Array.from({ length: 12 }, () => daysAgo(0));
    expect(plannedWorkoutsInMonth(logs, ...SEPTEMBER, 1, NOW)).toMatchObject({
      done: 12,
      planned: 1,
      pct: 999,
    });
  });

  it("divides by the same whole number the caption shows", () => {
    // 3 a week over 7 days → 3 planned; 3 done must read 100, not 86.
    const logs = [
      logAt(new Date(2026, 8, 17, 9, 0, 0)),
      logAt(new Date(2026, 8, 19, 9, 0, 0)),
      logAt(new Date(2026, 8, 22, 9, 0, 0)),
    ];
    expect(plannedWorkoutsInMonth(logs, ...SEPTEMBER, 3, NOW)).toMatchObject({
      done: 3,
      planned: 3,
      pct: 100,
    });
  });
});

describe("monthVolumeDelta", () => {
  const SEPTEMBER = [2026, 8] as const;
  const AUGUST = [2026, 7] as const;
  const on = (month: number, day: number, volume: number): WorkoutLog =>
    logAt(new Date(2026, month, day, 18, 0, 0), volume);

  it("has no comparison with nothing logged", () => {
    expect(monthVolumeDelta([], ...SEPTEMBER, NOW)).toBeNull();
  });

  it("has no comparison against a month the account only partly existed for", () => {
    // First workout 17 Aug: August holds two weeks, September three. The
    // same training would read as a jump.
    const logs = [
      on(7, 17, 5000),
      on(7, 24, 5000),
      on(8, 7, 5000),
      on(8, 14, 5000),
      on(8, 21, 5000),
    ];
    expect(monthVolumeDelta(logs, ...SEPTEMBER, NOW)).toBeNull();
    // Even a first workout on the 2nd leaves the earlier month part-lived.
    expect(monthVolumeDelta([on(7, 2, 5000), on(8, 7, 9000)], ...SEPTEMBER, NOW)).toBeNull();
  });

  it("compares once the history opens on the 1st of the earlier month", () => {
    const logs = [on(7, 1, 4000), on(7, 15, 4000), on(8, 7, 6000), on(8, 14, 6000)];
    expect(monthVolumeDelta(logs, ...SEPTEMBER, NOW)).toBe(50);
    // The 1st counts whatever time of day the workout finished.
    const lateOnTheFirst = logAt(new Date(2026, 7, 1, 23, 30, 0), 8000);
    expect(monthVolumeDelta([lateOnTheFirst, on(8, 7, 12_000)], ...SEPTEMBER, NOW)).toBe(50);
  });

  it("has no comparison when the earlier month holds nothing", () => {
    expect(monthVolumeDelta([longAgo(), on(8, 7, 6000)], ...SEPTEMBER, NOW)).toBeNull();
    const weightless = { ...on(7, 10, 0), total_volume: Number.NaN };
    expect(monthVolumeDelta([longAgo(), weightless, on(8, 7, 6000)], ...SEPTEMBER, NOW)).toBeNull();
  });

  it("has no comparison for a month with nothing logged", () => {
    expect(monthVolumeDelta([longAgo(), on(7, 10, 6000)], ...SEPTEMBER, NOW)).toBeNull();
  });

  it("waits for an open month to end before calling it behind", () => {
    const behind = [longAgo(), on(7, 10, 9000), on(8, 7, 6000)];
    expect(monthVolumeDelta(behind, ...SEPTEMBER, NOW)).toBeNull();
    const even = [longAgo(), on(7, 10, 6000), on(8, 7, 6000)];
    expect(monthVolumeDelta(even, ...SEPTEMBER, NOW)).toBeNull();
    // Once October has begun, September is finished and reads as it was.
    const october = new Date(2026, 9, 2, 12, 0, 0).getTime();
    expect(monthVolumeDelta(behind, ...SEPTEMBER, october)).toBe(-33);
    expect(monthVolumeDelta(even, ...SEPTEMBER, october)).toBe(0);
  });

  it("shows an open month that is already ahead", () => {
    expect(monthVolumeDelta([longAgo(), on(7, 10, 4000), on(8, 7, 6000)], ...SEPTEMBER, NOW)).toBe(50);
  });

  it("holds a past month to the same rule, whatever today is", () => {
    // First workout 20 Jul. Read in late September the account is more
    // than eight weeks old, yet July was still only part-lived.
    const logs = [
      on(6, 20, 1000),
      on(7, 5, 6000),
      on(7, 19, 6000),
      on(8, 7, 9000),
      on(8, 14, 9000),
    ];
    expect(monthVolumeDelta(logs, ...AUGUST, NOW)).toBeNull();
    // August was lived from its 1st, so September can be held against it.
    expect(monthVolumeDelta(logs, ...SEPTEMBER, NOW)).toBe(50);
    // A history that opens before July makes July whole as well.
    const fromJune = [logAt(new Date(2026, 5, 30, 18, 0, 0), 1000), ...logs];
    expect(monthVolumeDelta(fromJune, ...AUGUST, NOW)).toBe(1100);
  });

  it("compares across a year boundary", () => {
    const january = new Date(2027, 0, 20, 12, 0, 0).getTime();
    const logs = [
      logAt(new Date(2026, 10, 3, 18, 0, 0), 1000),
      logAt(new Date(2026, 11, 10, 18, 0, 0), 4000),
      logAt(new Date(2027, 0, 5, 18, 0, 0), 5000),
    ];
    expect(monthVolumeDelta(logs, 2027, 0, january)).toBe(25);
  });

  it("ignores future and unparseable workouts", () => {
    const broken = { ...on(8, 8, 90_000), finished_at: "not a date" };
    const logs = [longAgo(), on(7, 10, 4000), on(8, 7, 6000), broken, daysAgo(-2, 90_000)];
    expect(monthVolumeDelta(logs, ...SEPTEMBER, NOW)).toBe(50);
  });
});

describe("volumeComparison", () => {
  it("compares the last 4 weeks with the 4 before", () => {
    const logs = [
      daysAgo(3, 5000),
      daysAgo(20, 6000),
      daysAgo(35, 4000),
      daysAgo(50, 6000),
      daysAgo(70, 3000),
    ];
    expect(volumeComparison(logs, NOW)).toEqual({ recent: 11_000, prior: 10_000, pct: 10 });
  });

  it("has no percentage while the account is younger than both windows", () => {
    // Six weeks of steady training: the earlier window only holds two of
    // them, so a percentage would read as a jump that never happened.
    const logs = [3, 10, 17, 24, 31, 38].map((d) => daysAgo(d, 5000));
    expect(volumeComparison(logs, NOW)).toEqual({ recent: 20_000, prior: 10_000, pct: null });
  });

  it("compares from the day the history covers both windows", () => {
    const logs = [daysAgo(3, 6000), daysAgo(35, 4000), daysAgo(56, 4000)];
    expect(volumeComparison(logs, NOW).pct).toBe(-25);
    expect(volumeComparison([daysAgo(3, 6000), daysAgo(35, 4000), daysAgo(55, 4000)], NOW).pct).toBeNull();
  });

  it("has no percentage until both windows hold volume", () => {
    expect(volumeComparison([daysAgo(3, 5000)], NOW)).toEqual({
      recent: 5000,
      prior: 0,
      pct: null,
    });
    expect(volumeComparison([daysAgo(40, 5000)], NOW).pct).toBeNull();
  });

  it("reports a genuine drop as negative", () => {
    const logs = [daysAgo(3, 4000), daysAgo(35, 8000), daysAgo(70, 8000)];
    expect(volumeComparison(logs, NOW).pct).toBe(-50);
  });

  it("drops sessions older than 8 weeks, in the future, or with junk volume", () => {
    const logs = [
      daysAgo(60, 9000),
      daysAgo(-1, 9000),
      { ...daysAgo(2, 0), total_volume: Number.NaN },
      daysAgo(4, 1500),
    ];
    expect(volumeComparison(logs, NOW)).toEqual({ recent: 1500, prior: 0, pct: null });
  });
});

describe("compactVolume", () => {
  it("keeps small totals whole and shortens thousands", () => {
    expect(compactVolume(950)).toBe("950");
    expect(compactVolume(999.6)).toBe("1000");
    expect(compactVolume(12_000)).toBe("12k");
    expect(compactVolume(48_250)).toBe("48.3k");
    expect(compactVolume(-5)).toBe("0");
  });
});

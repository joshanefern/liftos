import { describe, expect, it } from "vitest";
import type { WorkoutExercise } from "@/data/liftosMock";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import {
  formatImprovementPct,
  formatScoredSet,
  heroContrast,
  IMPROVEMENT_EMPTY_TITLE,
  improvementCaption,
  improvementIntro,
  improvementPending,
  liftChangeLine,
  beforeDiffers,
  shortWorkoutDate,
  shownLiftPcts,
  skippedSummary,
  usualBeforeAt,
  workoutDate,
  workoutTitle,
} from "./improvementCopy";
import {
  improvementBreakdown,
  type ImprovementBreakdown,
  type ImprovementLift,
} from "./strengthTrend";

/* Local-noon timestamps so the day never shifts with the test machine's zone. */
const at = (y: number, m: number, d: number): string => new Date(y, m - 1, d, 12).toISOString();
const NOW = new Date(2026, 8, 30, 16);

const benchLift: ImprovementLift = {
  name: "Bench Press",
  measure: "e1rm",
  prev: { weight: 185, reps: 8, seconds: 0 },
  last: { weight: 190, reps: 8, seconds: 0 },
  change: 2.7,
  pct: 3,
  prevAt: at(2026, 9, 21),
};

const breakdown = (over: Partial<ImprovementBreakdown> = {}): ImprovementBreakdown => ({
  latest: { id: "a", name: "Push Day", finishedAt: at(2026, 9, 28) },
  previous: { id: "b", name: "Push Day", finishedAt: at(2026, 9, 21) },
  lifts: [benchLift],
  skipped: [],
  pct: 3,
  firstLiftingWorkout: false,
  ...over,
});

describe("workoutTitle", () => {
  it("keeps a real name, drops the names quick starts and imports are saved under", () => {
    expect(workoutTitle("  Push   Day ")).toBe("Push Day");
    expect(workoutTitle("Workout")).toBeNull();
    expect(workoutTitle("quick start")).toBeNull();
    expect(workoutTitle("WeightTraining")).toBeNull();
    expect(workoutTitle("")).toBeNull();
    expect(workoutTitle(null)).toBeNull();
  });
});

describe("formatImprovementPct", () => {
  it("signed, with Even at zero", () => {
    expect(formatImprovementPct(4)).toBe("+4%");
    expect(formatImprovementPct(-3)).toBe("-3%");
    expect(formatImprovementPct(0)).toBe("Even");
    expect(formatImprovementPct(-0)).toBe("Even");
  });
  it("sheet rows can carry one decimal, every row alike", () => {
    expect(formatImprovementPct(2.6, 1)).toBe("+2.6%");
    expect(formatImprovementPct(-5.3, 1)).toBe("-5.3%");
    expect(formatImprovementPct(3, 1)).toBe("+3.0%");
    expect(formatImprovementPct(0, 1)).toBe("Even");
  });
});

/* ── The rows must average to the tile ────────────────────────────── */

const roundPct = (value: number): number => Math.round(value) || 0;
const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

const exercise = (
  name: string,
  sets: { weight?: number; reps?: number; duration_seconds?: number }[],
): WorkoutExercise => ({
  id: name,
  name,
  category: "c",
  target: "t",
  sets: sets.map((set, i) => ({ id: `${name}-${i}`, completed: true, ...set })),
});

const workout = (id: string, finished_at: string, exercises: WorkoutExercise[]): WorkoutLog => ({
  id,
  template_id: null,
  name: "Push Day",
  exercises,
  notes: null,
  started_at: null,
  finished_at,
  duration_minutes: 45,
  total_sets: 1,
  completed_sets: 1,
  total_volume: 0,
  source: "manual",
  captured_session_id: null,
  created_at: finished_at,
});

type Side = { weight?: number; reps?: number; duration_seconds?: number };

/** The latest workout vs the one before, one entry per lift. */
const session = (lifts: { name: string; before: Side; now: Side }[]): WorkoutLog[] => [
  workout("now", at(2026, 9, 28), lifts.map((l) => exercise(l.name, [l.now]))),
  workout("before", at(2026, 9, 21), lifts.map((l) => exercise(l.name, [l.before]))),
];

/** What a lifter checks: average the rows as shown, round — the tile. */
const expectRowsAverageToTile = (logs: WorkoutLog[]) => {
  const breakdown = improvementBreakdown(logs)!;
  const pct = breakdown.pct!;
  const shown = shownLiftPcts(breakdown.lifts, pct);
  expect(roundPct(mean(shown.values))).toBe(pct);
  breakdown.lifts.forEach((lift, i) => {
    const value = shown.values[i];
    // Each row stays an honest rounding of its own change…
    expect(Math.abs(value - lift.change)).toBeLessThanOrEqual(shown.decimals === 0 ? 0.5 : 0.1 + 1e-9);
    // …and never reads the wrong way round.
    if (value > 0) expect(lift.change).toBeGreaterThan(0);
    if (value < 0) expect(lift.change).toBeLessThan(0);
    expect(Object.is(value, -0)).toBe(false);
  });
  return { breakdown, shown };
};

describe("shownLiftPcts", () => {
  it("whole numbers when they already average to the tile", () => {
    const logs = session([
      { name: "Bench Press", before: { weight: 185, reps: 8 }, now: { weight: 190, reps: 8 } },
      { name: "Overhead Press", before: { weight: 95, reps: 8 }, now: { weight: 97.5, reps: 8 } },
    ]);
    const { shown } = expectRowsAverageToTile(logs);
    expect(shown).toEqual({ values: [3, 3], decimals: 0 }); // 2.7 and 2.6 → +3
  });

  it("one decimal when whole rows would average to another number (Even, +3, +3, +5 under +2)", () => {
    const logs = session([
      { name: "Bench Press", before: { weight: 185, reps: 8 }, now: { weight: 185, reps: 8 } },
      { name: "Overhead Press", before: { weight: 95, reps: 8 }, now: { weight: 97.5, reps: 8 } },
      { name: "Incline Dumbbell Press", before: { weight: 60, reps: 10 }, now: { weight: 60, reps: 11 } },
      { name: "Triceps Pushdown", before: { weight: 55, reps: 12 }, now: { weight: 57.5, reps: 12 } },
    ]);
    const { breakdown, shown } = expectRowsAverageToTile(logs);
    expect(breakdown.pct).toBe(2);
    expect(breakdown.lifts.map((l) => l.pct)).toEqual([0, 3, 3, 5]); // mean 2.75 — the old rows
    expect(shown).toEqual({ values: [0, 2.6, 2.5, 4.5], decimals: 1 }); // mean 2.4
  });

  it("an Even tile over rows that are not all even", () => {
    const logs = session([
      { name: "Bench Press", before: { weight: 185, reps: 8 }, now: { weight: 185, reps: 8 } },
      { name: "Overhead Press", before: { weight: 95, reps: 8 }, now: { weight: 90, reps: 8 } },
      { name: "Incline Dumbbell Press", before: { weight: 60, reps: 10 }, now: { weight: 60, reps: 11 } },
      { name: "Triceps Pushdown", before: { weight: 55, reps: 12 }, now: { weight: 57.5, reps: 12 } },
    ]);
    const { breakdown, shown } = expectRowsAverageToTile(logs);
    expect(breakdown.pct).toBe(0);
    expect(shown).toEqual({ values: [0, -5.3, 2.5, 4.5], decimals: 1 }); // mean 0.4
  });

  it("when a tenth still misses, the closest call takes its other tenth", () => {
    const lift = (change: number): ImprovementLift => ({ ...benchLift, change });
    // Mean 2.495 → +2, but 2.5 and 2.5 average to 2.5 → +3.
    expect(shownLiftPcts([lift(2.47), lift(2.52)], 2)).toEqual({ values: [2.4, 2.5], decimals: 1 });
    // Mean 2.507 → +3, but 2.4, 2.4, 2.6 average to 2.47 → +2: one row goes up.
    const up = shownLiftPcts([lift(2.44), lift(2.44), lift(2.64)], 3);
    expect(up.decimals).toBe(1);
    expect(roundPct(mean(up.values))).toBe(3);
    expect(up.values.filter((v, i) => v !== [2.4, 2.4, 2.6][i])).toHaveLength(1);
  });

  it("a single lift is the whole number", () => {
    const lift = (change: number): ImprovementLift => ({ ...benchLift, change });
    expect(shownLiftPcts([lift(2.5)], 3)).toEqual({ values: [3], decimals: 0 });
    expect(shownLiftPcts([lift(-0.4)], 0)).toEqual({ values: [0], decimals: 0 });
    expect(shownLiftPcts([], 0)).toEqual({ values: [], decimals: 0 });
  });

  it("every one-step change to a four-lift Push Day adds up (0, ±2.5, ±5 lb or ±1 rep per lift)", () => {
    const base = [
      { name: "Bench Press", weight: 185, reps: 8 },
      { name: "Overhead Press", weight: 95, reps: 8 },
      { name: "Incline Dumbbell Press", weight: 60, reps: 10 },
      { name: "Triceps Pushdown", weight: 55, reps: 12 },
    ];
    const steps = [[0, 0], [2.5, 0], [-2.5, 0], [5, 0], [-5, 0], [0, 1], [0, -1]];
    let withDecimals = 0;
    for (let n = 0; n < steps.length ** base.length; n += 1) {
      let k = n;
      const logs = session(
        base.map((lift) => {
          const [dw, dr] = steps[k % steps.length];
          k = Math.floor(k / steps.length);
          return {
            name: lift.name,
            before: { weight: lift.weight, reps: lift.reps },
            now: { weight: lift.weight + dw, reps: lift.reps + dr },
          };
        }),
      );
      if (expectRowsAverageToTile(logs).shown.decimals === 1) withDecimals += 1;
    }
    expect(withDecimals).toBe(433); // the sessions whole rows would have got wrong
  });

  it("random workouts of weights, holds and bodyweight reps all add up", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const pick = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
    let nudged = 0;
    for (let n = 0; n < 4000; n += 1) {
      const lifts = Array.from({ length: pick(2, 8) }, (_, i) => {
        const kind = pick(0, 5);
        if (kind === 0) {
          const s = pick(10, 120);
          return { name: `Hold ${i}`, before: { duration_seconds: s }, now: { duration_seconds: Math.max(5, s + pick(-15, 15)) } };
        }
        if (kind === 1) {
          const r = pick(3, 30);
          return { name: `Reps ${i}`, before: { reps: r }, now: { reps: Math.max(1, r + pick(-4, 4)) } };
        }
        const w = pick(4, 160) * 2.5;
        const r = pick(1, 15);
        return {
          name: `Lift ${i}`,
          before: { weight: w, reps: r },
          now: { weight: Math.max(2.5, w + pick(-4, 4) * 2.5), reps: Math.max(1, r + pick(-3, 3)) },
        };
      });
      const { breakdown, shown } = expectRowsAverageToTile(session(lifts));
      const plain = breakdown.lifts.map((l) => Math.round(l.change * 10) / 10 || 0);
      if (shown.decimals === 1 && shown.values.some((v, i) => v !== plain[i])) nudged += 1;
    }
    expect(nudged).toBeGreaterThan(0); // the nudge path is exercised, not just assumed
  });
});

describe("improvementCaption", () => {
  it("names the workout that was compared", () => {
    expect(improvementCaption("Push Day")).toEqual({
      workout: "Push Day",
      against: "vs the time before",
    });
  });
  it("falls back for a quick start or an unnamed import", () => {
    expect(improvementCaption("Workout").workout).toBe("Last workout");
    expect(improvementCaption("").workout).toBe("Last workout");
  });
});

describe("improvementIntro", () => {
  it("the same workout before it, when every lift came from one of the same name", () => {
    expect(improvementIntro(breakdown())).toBe(
      "Your latest Push Day compared with the Push Day before it. Each lift is scored on its best set, with weight and reps both counting.",
    );
  });
  it("each lift's own last time when they came from different workouts", () => {
    expect(improvementIntro(breakdown({ previous: null }))).toMatch(
      /^Your latest Push Day compared with the last time you did each lift\./,
    );
  });
  it("a quick start is 'your latest workout'", () => {
    const quick = breakdown({
      latest: { id: "a", name: "Workout", finishedAt: at(2026, 9, 28) },
      previous: { id: "b", name: "Workout", finishedAt: at(2026, 9, 21) },
    });
    expect(improvementIntro(quick)).toMatch(
      /^Your latest workout compared with the last time you did each lift\./,
    );
  });
  it("holds-only mentions no weight", () => {
    const holds = breakdown({
      lifts: [{ ...benchLift, name: "Plank", measure: "hold", prev: { weight: 0, reps: 0, seconds: 60 }, last: { weight: 0, reps: 0, seconds: 75 } }],
    });
    expect(improvementIntro(holds)).toMatch(/Each lift is scored on its best set\.$/);
  });
});

describe("formatScoredSet", () => {
  it("weight × reps in the lifter's unit, holds as time, bodyweight as reps", () => {
    expect(formatScoredSet({ weight: 182.5, reps: 10, seconds: 0 }, "e1rm", "lb")).toBe("182.5 lb × 10");
    expect(formatScoredSet({ weight: 80, reps: 5, seconds: 0 }, "e1rm", "kg")).toBe("80 kg × 5");
    expect(formatScoredSet({ weight: 0, reps: 0, seconds: 45 }, "hold", "lb")).toBe("45s");
    expect(formatScoredSet({ weight: 0, reps: 0, seconds: 65 }, "hold", "lb")).toBe("1:05");
    expect(formatScoredSet({ weight: 0, reps: 12, seconds: 0 }, "reps", "lb")).toBe("12 reps");
    expect(formatScoredSet({ weight: 0, reps: 1, seconds: 0 }, "reps", "lb")).toBe("1 rep");
  });
});

describe("dates", () => {
  it("weekday and day this year; the year only when it differs", () => {
    expect(workoutDate(at(2026, 9, 28), NOW)).toBe("Mon, Sep 28");
    expect(workoutDate(at(2025, 12, 29), NOW)).toBe("Mon, Dec 29, 2025");
    expect(shortWorkoutDate(at(2026, 9, 21), NOW)).toBe("Sep 21");
  });
});

describe("liftChangeLine", () => {
  it("before → after, with the before date only when asked", () => {
    expect(liftChangeLine(benchLift, "lb", false, NOW)).toBe("185 lb × 8 → 190 lb × 8");
    expect(liftChangeLine(benchLift, "lb", true, NOW)).toBe("185 lb × 8 on Sep 21 → 190 lb × 8");
  });
});

describe("usualBeforeAt / beforeDiffers", () => {
  const on = (iso: string): ImprovementLift => ({ ...benchLift, prevAt: iso });
  it("the day most lifts were last done; only the others carry their own date", () => {
    const lifts = [on(at(2026, 9, 21)), on(at(2026, 9, 21)), on(at(2026, 9, 25))];
    const usual = usualBeforeAt(lifts, NOW);
    expect(usual).toBe(at(2026, 9, 21));
    expect(lifts.map((l) => beforeDiffers(l, usual, NOW))).toEqual([false, false, true]);
  });
  it("a tie goes to the most recent day; nothing compared is null", () => {
    expect(usualBeforeAt([on(at(2026, 9, 21)), on(at(2026, 9, 25))], NOW)).toBe(at(2026, 9, 25));
    expect(usualBeforeAt([], NOW)).toBeNull();
  });
  it("two workouts on the same day are one day", () => {
    const morning = new Date(2026, 8, 21, 7).toISOString();
    const evening = new Date(2026, 8, 21, 19).toISOString();
    const usual = usualBeforeAt([on(morning), on(evening)], NOW);
    expect(beforeDiffers(on(morning), usual, NOW)).toBe(false);
  });
});

describe("skippedSummary", () => {
  it("one line, grouped by reason", () => {
    expect(skippedSummary([])).toBeNull();
    expect(skippedSummary([{ name: "Face Pull", reason: "first-time" }])).toBe(
      "Not counted: Face Pull (first time).",
    );
    expect(
      skippedSummary([
        { name: "Face Pull", reason: "first-time" },
        { name: "Dips", reason: "measured-differently" },
        { name: "Shrug", reason: "first-time" },
        { name: "Lunge", reason: "first-time" },
      ]),
    ).toBe(
      "Not counted: Face Pull, Shrug and Lunge (first time); Dips (logged differently last time).",
    );
  });
});

describe("improvementPending", () => {
  const pending = (over: Partial<ImprovementBreakdown>) =>
    improvementPending(breakdown({ lifts: [], pct: null, ...over }));

  it("a first lifting workout, or nothing at all, gets the first-run words", () => {
    const firstRun = { title: IMPROVEMENT_EMPTY_TITLE, notCounted: null, next: null };
    expect(improvementPending(null)).toEqual(firstRun);
    expect(
      pending({ firstLiftingWorkout: true, skipped: [{ name: "Bench Press", reason: "first-time" }] }),
    ).toEqual(firstRun);
  });

  it("a returning lifter's workout of new lifts is named, with what did not count", () => {
    expect(
      pending({
        latest: { id: "a", name: "Arm Day", finishedAt: at(2026, 9, 28) },
        skipped: [
          { name: "Hammer Curl", reason: "first-time" },
          { name: "Skull Crusher", reason: "first-time" },
        ],
      }),
    ).toEqual({
      title: "Arm Day was all new lifts",
      notCounted: "Not counted: Hammer Curl and Skull Crusher (first time).",
      next: "The number comes back after your next workout that repeats a lift.",
    });
  });

  it("a repeated lift logged another way says so — it was repeated", () => {
    expect(pending({ skipped: [{ name: "Triceps Pushdown", reason: "measured-differently" }] })).toEqual({
      title: "Push Day was logged differently than before",
      notCounted: "Not counted: Triceps Pushdown (logged differently last time).",
      next: "The number comes back after your next workout that repeats a lift, logged the same way as before.",
    });
  });

  it("both reasons at once; a quick start is 'your last workout'", () => {
    const skipped = [
      { name: "Face Pull", reason: "first-time" as const },
      { name: "Dips", reason: "measured-differently" as const },
    ];
    expect(pending({ skipped }).title).toBe("Nothing to compare in Push Day");
    const quick = { id: "a", name: "Workout", finishedAt: at(2026, 9, 28) };
    expect(pending({ latest: quick, skipped }).title).toBe("Nothing to compare in your last workout");
    expect(pending({ latest: quick, skipped: [skipped[0]] }).title).toBe("Your last workout was all new lifts");
  });
});

describe("heroContrast", () => {
  it("only for a percentage hero, naming its number and stretch", () => {
    expect(
      heroContrast({
        value: "+9%",
        label: "stronger overall",
        eyebrow: "Getting stronger",
        detail: "",
        scope: "how far your lifts have come over the last 12 weeks",
      }),
    ).toBe(
      "The +9% at the top of the page is a longer view: how far your lifts have come over the last 12 weeks.",
    );
    expect(
      heroContrast({ value: "5", label: "workouts this month", eyebrow: "", detail: "" }),
    ).toBeNull();
    expect(heroContrast(null)).toBeNull();
  });
});

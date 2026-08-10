import { describe, expect, it } from "vitest";
import type { WorkoutExercise, WorkoutSet } from "@/data/liftosMock";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { allTimePRs, bestWeight, detectSessionPRs, epley1RM, exercisePRs } from "./prs";

let setSeq = 0;
const set = (
  weight: number | undefined,
  reps: number | undefined,
  extra: Partial<WorkoutSet> & { isWarmup?: boolean } = {},
): WorkoutSet => ({
  id: `set-${++setSeq}`,
  weight,
  reps,
  completed: true,
  ...extra,
});

const ex = (name: string, sets: WorkoutSet[], kind?: WorkoutExercise["kind"]): WorkoutExercise => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  kind,
  category: "Test",
  target: "",
  sets,
});

let logSeq = 0;
const log = (finished_at: string, exercises: WorkoutExercise[], id?: string): WorkoutLog => ({
  id: id ?? `log-${++logSeq}`,
  template_id: null,
  name: "Session",
  exercises,
  notes: null,
  started_at: null,
  finished_at,
  duration_minutes: 60,
  total_sets: exercises.reduce((s, e) => s + e.sets.length, 0),
  completed_sets: 0,
  total_volume: 0,
  source: "manual",
  captured_session_id: null,
  created_at: finished_at,
});

// history arrays below are newest-first, matching useWorkoutLogs.

describe("epley1RM", () => {
  it("applies Epley: weight * (1 + reps/30)", () => {
    expect(epley1RM(200, 10)).toBeCloseTo(266.667, 2);
    expect(epley1RM(100, 30)).toBeCloseTo(200, 5);
    expect(epley1RM(315, 1)).toBeCloseTo(325.5, 5);
  });
});

describe("bestWeight", () => {
  const history = [
    log("2026-02-01T10:00:00Z", [ex("Bench Press", [set(205, 5)])]),
    log("2026-01-01T10:00:00Z", [
      ex("Bench Press", [
        set(185, 8),
        set(315, 1, { isWarmup: true } as Partial<WorkoutSet>), // warm-up never counts
        set(225, 1, { completed: false }), // failed / unfinished set never counts
        set(500, undefined), // completed but no reps tracked — no record
        set(400, 0), // zero reps = failed lift — no record
      ]),
    ]),
  ];

  it("returns the heaviest eligible set with reps and date", () => {
    const best = bestWeight(history, "Bench Press");
    expect(best).not.toBeNull();
    expect(best!.weight).toBe(205);
    expect(best!.reps).toBe(5);
    expect(best!.date).toBe("2026-02-01T10:00:00Z");
  });

  it("excludes warm-ups, incomplete sets, and zero/missing reps", () => {
    // If any of those counted, the max would be 225, 315, 400, or 500.
    expect(bestWeight(history, "Bench Press")!.weight).toBe(205);
  });

  it("returns null for an exercise never logged", () => {
    expect(bestWeight(history, "Deadlift")).toBeNull();
  });
});

describe("exercisePRs", () => {
  it("maxE1RM can come from a lighter, higher-rep set than maxWeight", () => {
    const history = [
      log("2026-02-01T10:00:00Z", [ex("Squat", [set(185, 12)])]), // e1RM 259
      log("2026-01-01T10:00:00Z", [ex("Squat", [set(205, 5)])]), // e1RM ~239.2
    ];
    const prs = exercisePRs(history, "Squat");
    expect(prs.maxWeight!.weight).toBe(205);
    expect(prs.maxE1RM!.weight).toBe(185);
    expect(prs.maxE1RM!.e1rm).toBeCloseTo(259, 5);
  });

  it("tracks best reps per weight tier, heaviest tier first", () => {
    const history = [
      log("2026-02-01T10:00:00Z", [ex("Row", [set(185, 10), set(205, 5)])]),
      log("2026-01-01T10:00:00Z", [ex("Row", [set(185, 8)])]),
    ];
    const prs = exercisePRs(history, "Row");
    expect(prs.maxRepsAtWeight.map((t) => [t.weight, t.reps])).toEqual([
      [205, 5],
      [185, 10],
    ]);
  });

  it("record date is the first achievement; an exact tie later does not move it", () => {
    const history = [
      log("2026-02-01T10:00:00Z", [ex("Bench Press", [set(205, 5)])]),
      log("2026-01-01T10:00:00Z", [ex("Bench Press", [set(205, 5)])]),
    ];
    const prs = exercisePRs(history, "Bench Press");
    expect(prs.maxWeight!.date).toBe("2026-01-01T10:00:00Z");
    expect(prs.dates.weight).toBe("2026-01-01T10:00:00Z");
    expect(prs.dates.e1rm).toBe("2026-01-01T10:00:00Z");
  });

  it("matches exercise names case- and whitespace-insensitively", () => {
    const history = [log("2026-01-01T10:00:00Z", [ex("Bench Press", [set(205, 5)])])];
    expect(exercisePRs(history, "  BENCH press ").maxWeight!.weight).toBe(205);
  });

  it("bodyweight exercise: rep records only, tier 0, no weight record", () => {
    const history = [
      log("2026-02-01T10:00:00Z", [ex("Pull-Up", [set(undefined, 12)], "bodyweight")]),
      log("2026-01-01T10:00:00Z", [ex("Pull-Up", [set(undefined, 10)], "bodyweight")]),
    ];
    const prs = exercisePRs(history, "Pull-Up");
    expect(prs.maxWeight).toBeNull();
    expect(prs.maxE1RM).toBeNull();
    expect(prs.maxRepsAtWeight).toEqual([
      expect.objectContaining({ weight: 0, reps: 12 }),
    ]);
  });

  it("empty history yields empty PRs", () => {
    const prs = exercisePRs([], "Bench Press");
    expect(prs.maxWeight).toBeNull();
    expect(prs.maxE1RM).toBeNull();
    expect(prs.maxRepsAtWeight).toEqual([]);
  });
});

describe("detectSessionPRs — warm-up exclusion", () => {
  it("a heavy warm-up in the session is not a PR", () => {
    const history = [log("2026-01-01T10:00:00Z", [ex("Bench Press", [set(205, 5)])])];
    const session = {
      name: "Push",
      exercises: [ex("Bench Press", [set(225, 3, { isWarmup: true } as Partial<WorkoutSet>), set(200, 5)])],
    };
    expect(detectSessionPRs(history, session)).toEqual([]);
  });

  it("a heavy warm-up in history does not hold the record", () => {
    const history = [
      log("2026-01-01T10:00:00Z", [
        ex("Bench Press", [set(245, 1, { isWarmup: true } as Partial<WorkoutSet>), set(205, 5)]),
      ]),
    ];
    const session = { name: "Push", exercises: [ex("Bench Press", [set(215, 5)])] };
    const events = detectSessionPRs(history, session);
    const weightPR = events.find((e) => e.kind === "weight");
    expect(weightPR).toBeDefined();
    expect(weightPR!.value).toBe(215);
    expect(weightPR!.previousValue).toBe(205);
  });
});

describe("detectSessionPRs — first-time exercise", () => {
  it("first-ever weighted performance emits one isFirst weight event", () => {
    const session = { name: "Push", exercises: [ex("Bench Press", [set(135, 5), set(155, 3)])] };
    const events = detectSessionPRs([], session);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      exerciseName: "Bench Press",
      kind: "weight",
      value: 155,
      previousValue: null,
      isFirst: true,
    });
  });

  it("first-ever bodyweight performance emits one isFirst reps event", () => {
    const session = { name: "Pull", exercises: [ex("Pull-Up", [set(undefined, 8)], "bodyweight")] };
    const events = detectSessionPRs([], session);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "reps", value: 8, previousValue: null, isFirst: true });
  });

  it("exercise unknown to history is first-time even when other exercises have history", () => {
    const history = [log("2026-01-01T10:00:00Z", [ex("Bench Press", [set(205, 5)])])];
    const session = { name: "Push", exercises: [ex("Overhead Press", [set(95, 8)])] };
    const events = detectSessionPRs(history, session);
    expect(events).toHaveLength(1);
    expect(events[0].isFirst).toBe(true);
  });

  it("no events for sets with no recordable data (cardio-style)", () => {
    const session = {
      name: "Run",
      exercises: [ex("Running", [{ id: "r1", duration_seconds: 1800, distance_m: 5000, completed: true }], "cardio")],
    };
    expect(detectSessionPRs([], session)).toEqual([]);
  });
});

describe("detectSessionPRs — ties and non-PRs", () => {
  const history = [log("2026-01-01T10:00:00Z", [ex("Bench Press", [set(205, 5)])])];

  it("matching the record exactly is not a PR", () => {
    const session = { name: "Push", exercises: [ex("Bench Press", [set(205, 5)])] };
    expect(detectSessionPRs(history, session)).toEqual([]);
  });

  it("a lighter session produces no events", () => {
    const session = { name: "Push", exercises: [ex("Bench Press", [set(185, 5)])] };
    expect(detectSessionPRs(history, session)).toEqual([]);
  });

  it("incomplete session sets are ignored", () => {
    const session = { name: "Push", exercises: [ex("Bench Press", [set(225, 5, { completed: false })])] };
    expect(detectSessionPRs(history, session)).toEqual([]);
  });

  it("zero or missing reps never produce a PR", () => {
    const session = { name: "Push", exercises: [ex("Bench Press", [set(500, 0), set(495, undefined)])] };
    expect(detectSessionPRs(history, session)).toEqual([]);
  });
});

describe("detectSessionPRs — weight + e1RM PRs in the same session", () => {
  it("one set can break both records; both events share its setId", () => {
    const history = [log("2026-01-01T10:00:00Z", [ex("Bench Press", [set(205, 5)])])];
    const s = set(215, 5);
    const session = { name: "Push", exercises: [ex("Bench Press", [s])] };
    const events = detectSessionPRs(history, session);
    expect(events.map((e) => e.kind).sort()).toEqual(["e1rm", "weight"]);
    const weightPR = events.find((e) => e.kind === "weight")!;
    const e1rmPR = events.find((e) => e.kind === "e1rm")!;
    expect(weightPR.value).toBe(215);
    expect(weightPR.previousValue).toBe(205);
    expect(weightPR.setId).toBe(s.id);
    expect(e1rmPR.value).toBeCloseTo(epley1RM(215, 5), 5);
    expect(e1rmPR.previousValue).toBeCloseTo(epley1RM(205, 5), 5);
    expect(e1rmPR.setId).toBe(s.id);
  });

  it("returns the best per kind: weight PR and e1RM PR can come from different sets", () => {
    const history = [log("2026-01-01T10:00:00Z", [ex("Bench Press", [set(205, 5)])])];
    const heavy = set(225, 3); // e1RM 247.5
    const volume = set(215, 5); // e1RM ~250.8
    const session = { name: "Push", exercises: [ex("Bench Press", [volume, heavy])] };
    const events = detectSessionPRs(history, session);
    expect(events.filter((e) => e.kind === "weight")).toHaveLength(1);
    expect(events.filter((e) => e.kind === "e1rm")).toHaveLength(1);
    expect(events.find((e) => e.kind === "weight")!.setId).toBe(heavy.id);
    expect(events.find((e) => e.kind === "e1rm")!.setId).toBe(volume.id);
  });
});

describe("detectSessionPRs — rep PRs", () => {
  it("bodyweight rep PR", () => {
    const history = [log("2026-01-01T10:00:00Z", [ex("Pull-Up", [set(undefined, 10)], "bodyweight")])];
    const session = { name: "Pull", exercises: [ex("Pull-Up", [set(undefined, 12), set(undefined, 9)], "bodyweight")] };
    const events = detectSessionPRs(history, session);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "reps", value: 12, previousValue: 10 });
    expect(events[0].isFirst).toBeUndefined();
  });

  it("rep PR only at tiers with a prior record; best improvement wins", () => {
    const history = [
      log("2026-01-01T10:00:00Z", [ex("Row", [set(185, 8), set(205, 5)])]),
    ];
    const session = { name: "Pull", exercises: [ex("Row", [set(185, 11), set(205, 6)])] };
    const events = detectSessionPRs(history, session);
    const repsPR = events.find((e) => e.kind === "reps");
    expect(repsPR).toBeDefined();
    expect(repsPR!.weight).toBe(185); // +3 beats +1
    expect(repsPR!.value).toBe(11);
    expect(repsPR!.previousValue).toBe(8);
    expect(events.filter((e) => e.kind === "reps")).toHaveLength(1);
  });

  it("a never-logged lighter weight is not a rep PR (but can be an e1RM PR)", () => {
    const history = [log("2026-01-01T10:00:00Z", [ex("Squat", [set(205, 5)])])];
    const session = { name: "Legs", exercises: [ex("Squat", [set(185, 12)])] };
    const events = detectSessionPRs(history, session);
    expect(events.find((e) => e.kind === "reps")).toBeUndefined();
    expect(events.find((e) => e.kind === "weight")).toBeUndefined();
    expect(events.find((e) => e.kind === "e1rm")).toBeDefined(); // 259 > 239.2
  });

  it("first weighted set on a previously bodyweight-only exercise is a weight PR with no previous", () => {
    const history = [log("2026-01-01T10:00:00Z", [ex("Pull-Up", [set(undefined, 10)], "bodyweight")])];
    const session = { name: "Pull", exercises: [ex("Pull-Up", [set(25, 5)])] };
    const events = detectSessionPRs(history, session);
    const weightPR = events.find((e) => e.kind === "weight");
    expect(weightPR).toBeDefined();
    expect(weightPR!.previousValue).toBeNull();
    expect(weightPR!.isFirst).toBeUndefined(); // the exercise itself is not new
  });
});

describe("detectSessionPRs — session already saved in history", () => {
  it("excludes the session log itself from the comparison baseline", () => {
    const sessionLog = log("2026-02-01T10:00:00Z", [ex("Bench Press", [set(225, 5)])], "saved-1");
    const history = [sessionLog, log("2026-01-01T10:00:00Z", [ex("Bench Press", [set(205, 5)])])];
    const events = detectSessionPRs(history, sessionLog);
    const weightPR = events.find((e) => e.kind === "weight");
    expect(weightPR).toBeDefined();
    expect(weightPR!.value).toBe(225);
    expect(weightPR!.previousValue).toBe(205);
  });
});

describe("allTimePRs", () => {
  it("summarizes per exercise and sorts by most recent improvement", () => {
    const history = [
      log("2026-03-01T10:00:00Z", [ex("Bench Press", [set(215, 5)])]),
      log("2026-02-01T10:00:00Z", [ex("Squat", [set(315, 3)])]),
      log("2026-01-01T10:00:00Z", [ex("Bench Press", [set(205, 5)]), ex("Squat", [set(275, 5)])]),
    ];
    const rows = allTimePRs(history);
    expect(rows.map((r) => r.exerciseName)).toEqual(["Bench Press", "Squat"]);
    expect(rows[0].maxWeight).toBe(215);
    expect(rows[0].lastImproved).toBe("2026-03-01T10:00:00Z");
    expect(rows[1].maxWeight).toBe(315);
    expect(rows[1].maxE1RM).toBeCloseTo(epley1RM(315, 3), 5);
  });

  it("an exact tie does not move lastImproved", () => {
    const history = [
      log("2026-02-01T10:00:00Z", [ex("Bench Press", [set(205, 5)])]),
      log("2026-01-01T10:00:00Z", [ex("Bench Press", [set(205, 5)])]),
    ];
    expect(allTimePRs(history)[0].lastImproved).toBe("2026-01-01T10:00:00Z");
  });

  it("bodyweight rep improvements update lastImproved; maxWeight stays null", () => {
    const history = [
      log("2026-03-01T10:00:00Z", [ex("Pull-Up", [set(undefined, 12)], "bodyweight")]),
      log("2026-01-01T10:00:00Z", [ex("Pull-Up", [set(undefined, 10)], "bodyweight")]),
    ];
    const rows = allTimePRs(history);
    expect(rows[0].maxWeight).toBeNull();
    expect(rows[0].maxE1RM).toBeNull();
    expect(rows[0].maxReps).toBe(12);
    expect(rows[0].lastImproved).toBe("2026-03-01T10:00:00Z");
  });

  it("first-ever session counts as an improvement", () => {
    const history = [log("2026-01-01T10:00:00Z", [ex("Deadlift", [set(315, 5)])])];
    expect(allTimePRs(history)[0].lastImproved).toBe("2026-01-01T10:00:00Z");
  });

  it("exercises with only warm-ups or incomplete sets are omitted", () => {
    const history = [
      log("2026-01-01T10:00:00Z", [
        ex("Bench Press", [set(205, 5)]),
        ex("Squat", [set(135, 5, { isWarmup: true } as Partial<WorkoutSet>), set(225, 5, { completed: false })]),
      ]),
    ];
    const rows = allTimePRs(history);
    expect(rows.map((r) => r.exerciseName)).toEqual(["Bench Press"]);
  });

  it("empty history yields no rows", () => {
    expect(allTimePRs([])).toEqual([]);
  });
});

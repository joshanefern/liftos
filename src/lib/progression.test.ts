import { describe, expect, it } from "vitest";
import type { WorkoutExercise, WorkoutSet } from "@/data/liftosMock";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { suggestProgression } from "./progression";

let setSeq = 0;
const set = (reps: number, weight: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: `s-${++setSeq}`,
  reps,
  weight,
  completed: true,
  ...extra,
});

const exercise = (name: string, sets: WorkoutSet[]): WorkoutExercise => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  category: "Test",
  target: "Test",
  sets,
});

const log = (finished_at: string, exercises: WorkoutExercise[]): WorkoutLog => ({
  id: `log-${finished_at}`,
  template_id: null,
  name: "Session",
  exercises,
  notes: null,
  started_at: null,
  finished_at,
  duration_minutes: null,
  total_sets: 0,
  completed_sets: 0,
  total_volume: 0,
  source: "manual",
  captured_session_id: null,
  created_at: finished_at,
});

const lb = { unit: "lb" as const };

describe("suggestProgression", () => {
  it("returns null with no history or when the exercise never appears", () => {
    expect(suggestProgression([], "Barbell Bench Press", lb)).toBeNull();
    const history = [log("2026-08-01T10:00:00Z", [exercise("Back Squat", [set(10, 275)])])];
    expect(suggestProgression(history, "Barbell Bench Press", lb)).toBeNull();
  });

  it("all sets at the top of the range → add_weight, +5 lb for upper body", () => {
    const history = [
      log("2026-08-01T10:00:00Z", [
        exercise("Barbell Bench Press", [set(12, 205), set(12, 205), set(13, 205)]),
      ]),
    ];
    const s = suggestProgression(history, "Barbell Bench Press", lb);
    expect(s).toMatchObject({ kind: "add_weight", delta: 5 });
    expect(s!.message).toContain("205 lb");
  });

  it("lower-body patterns get the bigger jump (+10 lb)", () => {
    const history = [
      log("2026-08-01T10:00:00Z", [
        exercise("Back Squat", [set(12, 275), set(12, 275)]),
      ]),
    ];
    expect(suggestProgression(history, "Back Squat", lb)).toMatchObject({
      kind: "add_weight",
      delta: 10,
    });
  });

  it("kg deltas are +2.5 upper / +5 lower", () => {
    const bench = [log("2026-08-01T10:00:00Z", [exercise("Bench Press", [set(12, 90)])])];
    const dead = [log("2026-08-01T10:00:00Z", [exercise("Deadlift", [set(12, 140)])])];
    expect(suggestProgression(bench, "Bench Press", { unit: "kg" })).toMatchObject({
      kind: "add_weight",
      delta: 2.5,
    });
    expect(suggestProgression(dead, "Deadlift", { unit: "kg" })).toMatchObject({
      kind: "add_weight",
      delta: 5,
    });
  });

  it("mid-range reps → add_reps", () => {
    const history = [
      log("2026-08-01T10:00:00Z", [
        exercise("Barbell Bench Press", [set(10, 205), set(9, 205), set(8, 205)]),
      ]),
    ];
    expect(suggestProgression(history, "Barbell Bench Press", lb)!.kind).toBe("add_reps");
  });

  it("a single set below range → hold", () => {
    const history = [
      log("2026-08-01T10:00:00Z", [
        exercise("Barbell Bench Press", [set(10, 205), set(9, 205), set(6, 205)]),
      ]),
    ];
    expect(suggestProgression(history, "Barbell Bench Press", lb)!.kind).toBe("hold");
  });

  it("most sets below range → deload of ~5% rounded to the plate increment", () => {
    const history = [
      log("2026-08-01T10:00:00Z", [
        exercise("Barbell Bench Press", [set(5, 205), set(5, 205), set(4, 205)]),
      ]),
    ];
    // 5% of 205 = 10.25 → -10 lb.
    expect(suggestProgression(history, "Barbell Bench Press", lb)).toMatchObject({
      kind: "deload",
      delta: -10,
    });
  });

  it("ignores warmup and incomplete sets", () => {
    const history = [
      log("2026-08-01T10:00:00Z", [
        exercise("Barbell Bench Press", [
          set(10, 45, { isWarmup: true }), // low-rep warmups must not trigger hold
          set(3, 135, { isWarmup: true }),
          set(2, 205, { completed: false }),
          set(12, 205),
          set(12, 205),
        ]),
      ]),
    ];
    expect(suggestProgression(history, "Barbell Bench Press", lb)).toMatchObject({
      kind: "add_weight",
      delta: 5,
    });
  });

  it("uses the most recent session containing the exercise, regardless of input order", () => {
    const older = log("2026-07-20T10:00:00Z", [
      exercise("Barbell Bench Press", [set(12, 200), set(12, 200)]),
    ]);
    const newer = log("2026-08-01T10:00:00Z", [
      exercise("Barbell Bench Press", [set(9, 205), set(9, 205)]),
    ]);
    // Oldest-first input on purpose.
    expect(suggestProgression([older, newer], "Barbell Bench Press", lb)!.kind).toBe("add_reps");
  });

  it("skips sessions where the exercise has no completed working sets", () => {
    const newer = log("2026-08-01T10:00:00Z", [
      exercise("Barbell Bench Press", [set(3, 135, { isWarmup: true }), set(2, 205, { completed: false })]),
    ]);
    const older = log("2026-07-20T10:00:00Z", [
      exercise("Barbell Bench Press", [set(12, 200), set(12, 200)]),
    ]);
    expect(suggestProgression([newer, older], "Barbell Bench Press", lb)!.kind).toBe("add_weight");
  });

  it("matches exercise names case-insensitively", () => {
    const history = [
      log("2026-08-01T10:00:00Z", [exercise("barbell bench press ", [set(12, 205)])]),
    ];
    expect(suggestProgression(history, "Barbell Bench Press", lb)!.kind).toBe("add_weight");
  });

  it("respects a custom target rep range", () => {
    const history = [
      log("2026-08-01T10:00:00Z", [exercise("Back Squat", [set(5, 315), set(5, 315)])]),
    ];
    expect(
      suggestProgression(history, "Back Squat", { unit: "lb", targetRepRange: [3, 5] }),
    ).toMatchObject({ kind: "add_weight", delta: 10 });
  });
});

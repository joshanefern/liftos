import { describe, expect, it } from "vitest";
import {
  exerciseListChanged,
  sessionToTemplateExercises,
} from "./sessionToTemplate";

describe("sessionToTemplateExercises", () => {
  it("keeps only exercises with completed working sets, achieved numbers as targets", () => {
    const result = sessionToTemplateExercises([
      {
        name: "Bench Press",
        sets: [
          { reps: "8", weight: "185", completed: true, isWarmup: true },
          { reps: "8", weight: "185", completed: true },
          { reps: "6", weight: "195", completed: true },
          { reps: "", weight: "", completed: false },
        ],
      },
      { name: "Skipped Row", sets: [{ reps: "", weight: "", completed: false }] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Bench Press");
    expect(result[0].sets).toHaveLength(2); // warmup + incomplete dropped
    expect(result[0].sets[0]).toMatchObject({ reps: 8, weight: 185 });
    expect(result[0].sets[1]).toMatchObject({ reps: 6, weight: 195 });
  });

  it("keeps holds as duration_seconds (logger stores them in the reps field)", () => {
    const result = sessionToTemplateExercises([
      {
        name: "Planks",
        tracking: "time",
        sets: [{ reps: "40", weight: "", completed: true }],
      },
    ]);
    expect(result[0].tracking).toBe("time");
    expect(result[0].sets[0]).toMatchObject({ reps: 0, duration_seconds: 40 });
  });
});

describe("exerciseListChanged", () => {
  const doneBench = {
    name: "Bench Press",
    sets: [{ reps: "8", weight: "185", completed: true }],
  };
  const donePlanks = {
    name: "Planks",
    tracking: "time" as const,
    sets: [{ reps: "40", weight: "", completed: true }],
  };

  it("false when the done list matches the seed", () => {
    expect(exerciseListChanged(["Bench Press"], [doneBench])).toBe(false);
  });

  it("true when an exercise was added (the planks case)", () => {
    expect(exerciseListChanged(["Bench Press"], [doneBench, donePlanks])).toBe(true);
  });

  it("true when a seed exercise was skipped entirely", () => {
    expect(
      exerciseListChanged(["Bench Press", "Cable Row"], [doneBench]),
    ).toBe(true);
  });

  it("false when nothing was completed at all (nothing to claim)", () => {
    expect(
      exerciseListChanged(
        ["Bench Press"],
        [{ name: "Bench Press", sets: [{ completed: false }] }],
      ),
    ).toBe(false);
  });
});

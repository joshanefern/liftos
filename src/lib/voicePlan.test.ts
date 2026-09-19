import { describe, expect, it } from "vitest";
import { sanitizePlan } from "./voice";

describe("sanitizePlan — dictated workouts are bounded before touching the builder", () => {
  it("keeps a clean plan intact", () => {
    const plan = sanitizePlan({
      name: "Push Day",
      exercises: [
        { name: "Bench Press", kind: "lift", sets: 4, reps: 8, weight: 135 },
        { name: "Bike", kind: "cardio", sets: 1, minutes: 20 },
      ],
      confidence: 0.9,
    });
    expect(plan.name).toBe("Push Day");
    expect(plan.exercises).toHaveLength(2);
    expect(plan.exercises[0]).toMatchObject({ sets: 4, reps: 8, weight: 135, kind: "lift" });
    expect(plan.exercises[1]).toMatchObject({ kind: "cardio", minutes: 20 });
  });

  it("defaults sets to 3, clamps absurd numbers, drops nameless rows", () => {
    const plan = sanitizePlan({
      exercises: [
        { name: "Squat" },
        { name: "", sets: 3 },
        { name: "Curl", sets: 99, reps: 9999, weight: 99999 },
      ],
    });
    expect(plan.exercises.map((e) => e.name)).toEqual(["Squat", "Curl"]);
    expect(plan.exercises[0].sets).toBe(3);
    expect(plan.exercises[1]).toMatchObject({ sets: 12, reps: 200, weight: 2000 });
  });

  it("survives garbage", () => {
    expect(sanitizePlan(null).exercises).toEqual([]);
    expect(sanitizePlan({ exercises: "nope" }).exercises).toEqual([]);
    expect(sanitizePlan({ name: 42 }).name).toBeNull();
  });
});

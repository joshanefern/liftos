import { describe, expect, it } from "vitest";
import { extractWorkoutPlan, planToTemplateExercises } from "./coachPlan";

describe("extractWorkoutPlan", () => {
  it("parses bullet plans with weights", () => {
    const reply = [
      "Here's your push day:",
      "- Bench Press: 3×8 @ 185",
      "- Overhead Press — 3x10 @ 95",
      "- Dips: 3×12",
      "Rest 2 minutes between sets.",
    ].join("\n");
    const plan = extractWorkoutPlan(reply);
    expect(plan).toHaveLength(3);
    expect(plan[0]).toEqual({ name: "Bench Press", sets: 3, reps: 8, weight: 185 });
    expect(plan[2]).toEqual({ name: "Dips", sets: 3, reps: 12, weight: 0 });
  });

  it("parses markdown table rows", () => {
    const reply = [
      "| Exercise | Sets |",
      "| --- | --- |",
      "| Squat | 4×6 @ 225 |",
      "| Leg Press | 3×10 @ 300 |",
    ].join("\n");
    const plan = extractWorkoutPlan(reply);
    expect(plan).toHaveLength(2);
    expect(plan[0].name).toBe("Squat");
    expect(plan[0].weight).toBe(225);
  });

  it("ignores day headers, rest lines, and prose", () => {
    const reply = [
      "Day 1: 3×8 focus",
      "Rest 2×5 minutes",
      "Your squat looks strong lately.",
    ].join("\n");
    expect(extractWorkoutPlan(reply)).toHaveLength(0);
  });

  it("dedupes repeated exercises, keeps the first prescription", () => {
    const reply = "- Bench: 3×8 @ 185\n- Bench: 5×5 @ 200";
    const plan = extractWorkoutPlan(reply);
    expect(plan).toHaveLength(1);
    expect(plan[0].sets).toBe(3);
  });
});

describe("planToTemplateExercises", () => {
  it("builds builder-shaped template exercises", () => {
    const [exercise] = planToTemplateExercises(
      [{ name: "Bench Press", sets: 3, reps: 8, weight: 185 }],
      "Coach plan",
    );
    expect(exercise.name).toBe("Bench Press");
    expect(exercise.target).toBe("3 × 8 @ 185");
    expect(exercise.sets).toHaveLength(3);
    expect(exercise.sets[0]).toMatchObject({ reps: 8, weight: 185 });
  });
});

describe("extractWorkoutPlan — table with weight in its own cell", () => {
  it("captures the weight column", () => {
    const reply = [
      "| Exercise | Sets x Reps | Weight |",
      "| Flat bench press | 4×6 | 185 lb |",
      "| Cable lateral raise | 3×12 | 20 lb |",
    ].join("\n");
    const plan = extractWorkoutPlan(reply);
    expect(plan).toHaveLength(2);
    expect(plan[0]).toEqual({ name: "Flat bench press", sets: 4, reps: 6, weight: 185 });
    expect(plan[1].weight).toBe(20);
  });
});

import { describe, expect, it } from "vitest";
import { buildSchedulePrompt, buildSplitPrompt, parseWeekPlan } from "./coachSetup";

const REPLY = `Here's your week!

## Push Day
Bench Press: 4x8
Overhead Press: 3x10
Incline Dumbbell Press: 3x10
Tricep Pushdown: 3x12

## Pull Day
Lat Pulldown: 4x10
Seated Row: 3x10
Bicep Curl: 3x12

## Leg Day
Goblet Squat: 4x10
Romanian Deadlift: 3x10
Leg Press: 3x12

Rest well between sessions!`;

describe("parseWeekPlan", () => {
  it("splits a coach reply into one saved workout per day section", () => {
    const days = parseWeekPlan(REPLY);
    expect(days.map((d) => d.name)).toEqual(["Push Day", "Pull Day", "Leg Day"]);
    expect(days[0].exercises).toHaveLength(4);
    expect(days[0].exercises[0].name).toBe("Bench Press");
    expect(days[0].exercises[0].sets).toHaveLength(4);
    expect(days[2].exercises.map((e) => e.name)).toContain("Goblet Squat");
  });

  it("drops thin sections and numbers a repeated day name", () => {
    const text = `## Push Day
Bench Press: 3x8
Overhead Press: 3x10

## Notes
Stay hydrated: it matters

## Push Day
Bench Press: 3x8
Dips: 3x10`;
    const days = parseWeekPlan(text);
    expect(days.map((d) => d.name)).toEqual(["Push Day", "Push Day 2"]);
  });

  it("handles bold and Day-N headers", () => {
    const text = `**Upper Body**
Bench Press: 3x8
Row: 3x10

Day 2: Lower Body
Squat: 3x5
Leg Curl: 3x12`;
    const days = parseWeekPlan(text);
    expect(days.map((d) => d.name)).toEqual(["Upper Body", "Lower Body"]);
  });

  it("caps the number of days", () => {
    const day = (n: number) => `## Full Body ${n}
Squat: 3x8
Bench Press: 3x8`;
    const text = Array.from({ length: 10 }, (_, i) => day(i + 1)).join("\n\n");
    expect(parseWeekPlan(text, 7)).toHaveLength(7);
  });

  it("returns nothing for prose with no plan", () => {
    expect(parseWeekPlan("Great question! Consistency beats intensity.")).toEqual([]);
  });

  it("handles parenthetical muscle lists, Workout/weekday titles, and numbered lines", () => {
    const text = `## Push Day (Chest, Shoulders, Triceps)
1. Bench Press: 3x8
2. Overhead Press: 3x10

## Workout B
1) Squat: 3x5
2) Leg Curl: 3x12

## Monday
Deadlift: 3x5
Row: 3x8`;
    const days = parseWeekPlan(text);
    expect(days.map((d) => d.name)).toEqual(["Push Day", "Workout B", "Monday"]);
    expect(days[0].exercises.map((e) => e.name)).toEqual([
      "Bench Press",
      "Overhead Press",
    ]);
  });

  it("numbers repeated day names instead of dropping the second cycle", () => {
    const cycle = `## Push Day
Bench Press: 3x8
Dips: 3x10

## Pull Day
Row: 3x8
Curl: 3x10`;
    const days = parseWeekPlan(`${cycle}\n\n${cycle}`);
    expect(days.map((d) => d.name)).toEqual([
      "Push Day",
      "Pull Day",
      "Push Day 2",
      "Pull Day 2",
    ]);
  });

  it("mid-section prose tips never become exercises or hijack sections", () => {
    const text = `## Pull Day
Lat Pulldown: 4x10
Pull ups to failure
Seated Row: 3x10
Add weight once you can hit 3x12 comfortably.
Bicep Curl: 3x12`;
    const days = parseWeekPlan(text);
    expect(days).toHaveLength(1);
    expect(days[0].exercises.map((e) => e.name)).toEqual([
      "Lat Pulldown",
      "Seated Row",
      "Bicep Curl",
    ]);
  });
});

describe("buildSchedulePrompt → parseWeekPlan round trip", () => {
  it("day·focus headers survive the parser as template names", () => {
    const prompt = buildSchedulePrompt(
      { goal: "Strength", experience: "Advanced", equipment: "Full gym", frequency: null, split: null, units: "lb" } as never,
      [
        { day: "Monday", focus: "Push" },
        { day: "Thursday", focus: "Legs" },
      ],
      "I love front squats",
    );
    expect(prompt).toContain("- Monday: Push");
    expect(prompt).toContain("- Thursday: Legs");
    expect(prompt).toContain("front squats");
    // The exact header format the prompt pins parses back into day names.
    const reply = `## Monday · Push
Bench Press: 4x6
Overhead Press: 3x8

## Thursday · Legs
Front Squat: 4x6
Romanian Deadlift: 3x8`;
    const days = parseWeekPlan(reply);
    expect(days.map((d) => d.name)).toEqual(["Monday · Push", "Thursday · Legs"]);
  });
});

describe("buildSplitPrompt", () => {
  it("carries the onboarding answers", () => {
    const prompt = buildSplitPrompt({
      goal: "Hypertrophy",
      experience: "Beginner",
      equipment: "Full gym",
      frequency: "3–4 days",
      split: "Push Pull Legs",
      units: "lb",
    } as never);
    expect(prompt).toContain("Hypertrophy");
    expect(prompt).toContain("3–4 days");
    expect(prompt).toContain("Push Pull Legs");
  });
});

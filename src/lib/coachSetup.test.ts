import { describe, expect, it } from "vitest";
import {
  WEEK_BUILD_KEY,
  WEEK_BUILD_STALE_MS,
  buildSchedulePrompt,
  buildSplitPrompt,
  clearWeekBuildMarker,
  markWeekBuildStarted,
  offersWeekPlan,
  parseWeekPlan,
  weekBuildInProgress,
  weekPlanRoom,
} from "./coachSetup";

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
      { mustHave: "front squats", avoid: "" },
    );
    expect(prompt).toContain("- Monday: Push");
    expect(prompt).toContain("- Thursday: Legs");
    expect(prompt).toContain("Must include: front squats");
    expect(prompt).not.toContain("Avoid (");
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

  it("carries must-have and avoid as two separate instructions", () => {
    const prompt = buildSchedulePrompt(
      null,
      [{ day: "Monday", focus: "Push" }],
      { mustHave: "  weighted pull-ups ", avoid: "bad left shoulder, no cables" },
    );
    expect(prompt).toContain("Must include: weighted pull-ups\n");
    expect(prompt).toContain("Avoid (injuries, missing equipment, movements to skip): bad left shoulder, no cables");
    // The must-have line comes first so the model reads the positive ask
    // before the exclusions.
    expect(prompt.indexOf("Must include")).toBeLessThan(prompt.indexOf("Avoid ("));
  });

  it("states the exact number of training days the lifter confirmed", () => {
    const four = buildSchedulePrompt(
      null,
      [
        { day: "Monday", focus: "Upper" },
        { day: "Tuesday", focus: "Lower" },
        { day: "Thursday", focus: "Upper" },
        { day: "Friday", focus: "Lower" },
      ],
      { mustHave: "", avoid: "" },
    );
    expect(four).toContain("exactly 4 training days");
    expect(four).toContain("Reply with NOTHING but 4 sections, one per day above");

    const one = buildSchedulePrompt(null, [{ day: "Monday", focus: "Full body" }], {
      mustHave: "",
      avoid: "",
    });
    expect(one).toContain("exactly 1 training day.");
    expect(one).toContain("Reply with NOTHING but 1 section, one per day above");
  });

  it("counts the schedule, not the onboarding answer it started from", () => {
    // Onboarding said 4 days; the lifter dropped to three in the sheet.
    const prompt = buildSchedulePrompt(
      { goal: null, experience: null, equipment: null, frequency: "4 days", split: null, units: "lb" } as never,
      [
        { day: "Monday", focus: "Push" },
        { day: "Wednesday", focus: "Pull" },
        { day: "Friday", focus: "Legs" },
      ],
      { mustHave: "", avoid: "" },
    );
    expect(prompt).toContain("exactly 3 training days");
    expect(prompt).not.toContain("4 days");
  });

  it("adds no note lines when both fields are blank", () => {
    const prompt = buildSchedulePrompt(null, [{ day: "Monday", focus: "Push" }], {
      mustHave: "   ",
      avoid: "",
    });
    expect(prompt).not.toContain("Must include");
    expect(prompt).not.toContain("Avoid (");
    expect(prompt).toContain("- Monday: Push\n\nReply with NOTHING");
  });

  it("clips a runaway note so the prompt stays bounded", () => {
    const prompt = buildSchedulePrompt(null, [{ day: "Monday", focus: "Push" }], {
      mustHave: "x".repeat(1000),
      avoid: "",
    });
    const line = prompt.split("\n").find((l) => l.startsWith("Must include"));
    expect(line).toBeDefined();
    expect(line!.length).toBeLessThanOrEqual("Must include: ".length + 300);
  });
});

describe("week-build marker", () => {
  const T0 = Date.parse("2026-09-26T10:00:00Z");
  const memoryStore = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    };
  };

  it("is not in progress until a build starts, and clears in finally", () => {
    const store = memoryStore();
    expect(weekBuildInProgress(T0, store)).toBe(false);
    markWeekBuildStarted(T0, store);
    expect(store.getItem(WEEK_BUILD_KEY)).toBe(new Date(T0).toISOString());
    expect(weekBuildInProgress(T0 + 1000, store)).toBe(true);
    clearWeekBuildMarker(store);
    expect(weekBuildInProgress(T0 + 1000, store)).toBe(false);
  });

  it("a remount inside 90s still sees the build; a hung run goes stale", () => {
    const store = memoryStore();
    markWeekBuildStarted(T0, store);
    expect(weekBuildInProgress(T0 + WEEK_BUILD_STALE_MS - 1, store)).toBe(true);
    expect(weekBuildInProgress(T0 + WEEK_BUILD_STALE_MS, store)).toBe(false);
    expect(weekBuildInProgress(T0 + 10 * 60_000, store)).toBe(false);
  });

  it("ignores garbage and a marker from the future", () => {
    const store = memoryStore();
    store.setItem(WEEK_BUILD_KEY, "not a date");
    expect(weekBuildInProgress(T0, store)).toBe(false);
    markWeekBuildStarted(T0 + 30_000, store);
    expect(weekBuildInProgress(T0, store)).toBe(false);
  });

  it("answers false and never throws when storage is unavailable", () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(() => markWeekBuildStarted(T0, throwing)).not.toThrow();
    expect(weekBuildInProgress(T0, throwing)).toBe(false);
    expect(() => clearWeekBuildMarker(throwing)).not.toThrow();
    expect(weekBuildInProgress(T0, null)).toBe(false);
  });

  it("defaults to sessionStorage, never localStorage", () => {
    window.sessionStorage.removeItem(WEEK_BUILD_KEY);
    markWeekBuildStarted(T0);
    expect(window.sessionStorage.getItem(WEEK_BUILD_KEY)).toBe(new Date(T0).toISOString());
    expect(window.localStorage.getItem(WEEK_BUILD_KEY)).toBeNull();
    expect(weekBuildInProgress(T0 + 5_000)).toBe(true);
    clearWeekBuildMarker();
    expect(window.sessionStorage.getItem(WEEK_BUILD_KEY)).toBeNull();
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

  it("quotes a legacy range as answered and never claims an exact count", () => {
    const prompt = buildSplitPrompt({
      goal: "Strength",
      experience: "Beginner",
      equipment: "Home gym",
      frequency: "5–6 days",
      split: "Not Sure / Other",
      units: "kg",
    } as never);
    expect(prompt).toContain("days per week: 5–6 days");
    expect(prompt).not.toContain("exactly");
    expect(prompt).toContain("Reply with NOTHING but one section per training day,");
  });

  it("states an exact answer as an exact number of workouts", () => {
    const prompt = buildSplitPrompt({
      goal: "Hypertrophy",
      experience: "Beginner",
      equipment: "Full gym",
      frequency: "4 days",
      split: "Upper Lower",
      units: "lb",
    } as never);
    expect(prompt).toContain("training days per week: exactly 4");
    expect(prompt).toContain("Reply with NOTHING but exactly 4 sections, one per training day,");
    // The stored text itself is not echoed — "days per week: 4 days" reads
    // like a typo to the model.
    expect(prompt).not.toContain("4 days");
  });

  it("asks for no count when the answer is missing", () => {
    const prompt = buildSplitPrompt({
      goal: "Strength",
      experience: "Beginner",
      equipment: null,
      frequency: null,
      split: null,
      units: "lb",
    } as never);
    expect(prompt).not.toContain("days per week");
    expect(prompt).toContain("Reply with NOTHING but one section per training day,");
    expect(buildSplitPrompt(null)).toContain("Build my first week of workouts.");
  });

  it("an exact-count reply still parses into that many workouts", () => {
    const reply = ["Upper A", "Lower A", "Upper B", "Lower B"]
      .map((name) => `## ${name}\nBench Press: 3x8\nSeated Row: 3x10`)
      .join("\n\n");
    expect(parseWeekPlan(reply)).toHaveLength(4);
  });
});

describe("the plan sheet after the welcome", () => {
  const LIMIT = 7;

  it("room is what the library has left, never negative", () => {
    expect(weekPlanRoom(0, LIMIT)).toBe(7);
    expect(weekPlanRoom(1, LIMIT)).toBe(6);
    expect(weekPlanRoom(7, LIMIT)).toBe(0);
    expect(weekPlanRoom(9, LIMIT)).toBe(0);
    expect(weekPlanRoom(-3, LIMIT)).toBe(7);
  });

  it("is still offered after one workout saved by hand", () => {
    expect(offersWeekPlan({ savedNames: ["Upper A"], plannedDays: 4, limit: LIMIT })).toBe(true);
  });

  it("is offered for as long as the planned week fits beside what is saved", () => {
    const saved = ["Upper A", "Lower A", "Upper B"];
    expect(offersWeekPlan({ savedNames: saved, plannedDays: 4, limit: LIMIT })).toBe(true);
    expect(offersWeekPlan({ savedNames: [...saved, "Lower B"], plannedDays: 4, limit: LIMIT })).toBe(
      false,
    );
    expect(offersWeekPlan({ savedNames: ["Only one"], plannedDays: 6, limit: LIMIT })).toBe(true);
    expect(offersWeekPlan({ savedNames: ["One", "Two"], plannedDays: 6, limit: LIMIT })).toBe(false);
  });

  it("is withdrawn once a plan from the sheet is in the library", () => {
    const plan = ["Monday · Push", "Wednesday · Pull", "Friday · Legs"];
    expect(offersWeekPlan({ savedNames: plan, plannedDays: 3, limit: LIMIT })).toBe(false);
    expect(offersWeekPlan({ savedNames: ["Upper A", ...plan], plannedDays: 3, limit: LIMIT })).toBe(
      false,
    );
    // A plan that only partly landed is still a plan: building again would
    // put a second Monday beside the first.
    expect(offersWeekPlan({ savedNames: ["Monday - Push"], plannedDays: 3, limit: LIMIT })).toBe(
      false,
    );
  });

  it("needs room for one workout when the training days were never answered", () => {
    const six = ["A", "B", "C", "D", "E", "F"];
    expect(offersWeekPlan({ savedNames: six, plannedDays: null, limit: LIMIT })).toBe(true);
    expect(offersWeekPlan({ savedNames: [...six, "G"], plannedDays: null, limit: LIMIT })).toBe(
      false,
    );
  });
});

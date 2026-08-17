import { describe, expect, it } from "vitest";
import type { WorkoutExercise } from "@/data/liftosMock";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { isPlaceholderName, placeholderNames } from "./exerciseNames";

const ex = (name: string): WorkoutExercise => ({
  id: name,
  name,
  category: "c",
  target: "t",
  sets: [],
});

const log = (exercises: WorkoutExercise[]): WorkoutLog => ({
  id: "log",
  template_id: null,
  name: "Session",
  exercises,
  notes: null,
  started_at: null,
  finished_at: "2026-01-01T10:00:00Z",
  duration_minutes: 45,
  total_sets: 0,
  completed_sets: 0,
  total_volume: 0,
  source: "review",
  captured_session_id: null,
  created_at: "2026-01-01T10:00:00Z",
});

describe("isPlaceholderName", () => {
  it("matches the review-flow fallback names only", () => {
    expect(isPlaceholderName("Exercise 1")).toBe(true);
    expect(isPlaceholderName("exercise 12")).toBe(true);
    expect(isPlaceholderName("  Exercise 2  ")).toBe(true);
    expect(isPlaceholderName("Bench Press")).toBe(false);
    expect(isPlaceholderName("Exercise Bike")).toBe(false);
    expect(isPlaceholderName("Exercises 1")).toBe(false);
  });
});

describe("placeholderNames", () => {
  it("returns distinct placeholders across logs, ignoring real names", () => {
    const logs = [
      log([ex("Exercise 1"), ex("Bench Press")]),
      log([ex("exercise 1"), ex("Exercise 2")]),
    ];
    expect(placeholderNames(logs)).toEqual(["Exercise 2", "exercise 1"]);
  });

  it("empty when history is clean", () => {
    expect(placeholderNames([log([ex("Squat")])])).toEqual([]);
  });
});

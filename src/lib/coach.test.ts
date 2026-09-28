import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@/context/UserContext";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import {
  buildCoachContext,
  coachContextWithoutHistory,
  WORKOUT_HISTORY_UNAVAILABLE,
  type TodaySuggestion,
} from "./coach";
import type { Suggestion } from "./suggestion";

describe("buildCoachContext — today_suggestion", () => {
  it("defaults to null when the caller has no engine pick", () => {
    const context = buildCoachContext([], null);
    expect(context.today_suggestion).toBeNull();
  });

  it("carries the pick's kind, title, and reason", () => {
    const pick: TodaySuggestion = {
      kind: "template",
      title: "Pull Day",
      reason: "Lats hasn't been trained in 6 days.",
    };
    const context = buildCoachContext([], null, [], pick);
    expect(context.today_suggestion).toEqual(pick);
  });

  it("strips client-only Suggestion fields (id, ctaLabel, muscles) from the prompt payload", () => {
    const full: Suggestion = {
      kind: "starter",
      id: "sp-full-body",
      title: "Full Body Foundation",
      ctaLabel: "Start Full Body Foundation",
      reason: "No blank pages — this one trains everything.",
      muscles: ["chest", "quadriceps"],
    };
    const context = buildCoachContext([], null, [], full);
    expect(context.today_suggestion).toEqual({
      kind: "starter",
      title: "Full Body Foundation",
      reason: "No blank pages — this one trains everything.",
    });
  });
});

describe("buildCoachContext — streak and consistency", () => {
  // Sunday 27 Sep 2026: a day off, and the first day of a Calendar week.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 27, 17, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const profile: UserProfile = {
    first_name: "QA",
    last_name: null,
    goal: "Strength",
    experience: "Intermediate",
    equipment: null,
    frequency: "4 days",
    split: null,
    units: "lb",
    wearable_connected: false,
    healthkit_connected: false,
  };

  const on = (month: number, day: number): WorkoutLog => {
    const finished = new Date(2026, month, day, 18, 30, 0).toISOString();
    return {
      id: `log-${month}-${day}`,
      template_id: null,
      name: "Session",
      exercises: [],
      notes: null,
      started_at: finished,
      finished_at: finished,
      duration_minutes: 50,
      total_sets: 12,
      completed_sets: 12,
      total_volume: 12_000,
      source: "manual",
      captured_session_id: null,
      created_at: finished,
    };
  };

  // Mon / Wed / Fri for six weeks, from Mon 17 Aug to Fri 25 Sep.
  const sixWeeks = [17, 19, 21, 24, 26, 28, 31, 33, 35, 38, 40, 42, 45, 47, 49, 52, 54, 56].map(
    (day) => on(7, day),
  );

  it("keeps the streak on a day off", () => {
    const context = buildCoachContext(sixWeeks, profile);
    expect(context.streak_weeks).toBe(6);
    expect(context.consistency_vs_plan).toEqual({
      window_days: 28,
      workouts_done: 12,
      workouts_planned: 16,
      pct: 75,
    });
  });

  it("grades a one-week account on its one week", () => {
    // Four of four planned, all in the week the account began.
    const context = buildCoachContext([on(8, 21), on(8, 23), on(8, 24), on(8, 26)], profile);
    expect(context.streak_weeks).toBe(1);
    expect(context.consistency_vs_plan).toEqual({
      window_days: 7,
      workouts_done: 4,
      workouts_planned: 4,
      pct: 100,
    });
    // Three of four, the last one two days ago.
    expect(
      buildCoachContext([on(8, 21), on(8, 23), on(8, 25)], profile).consistency_vs_plan,
    ).toMatchObject({ workouts_done: 3, workouts_planned: 4, pct: 75 });
  });

  it("sends no day streak and no bare percentage", () => {
    const context = buildCoachContext(sixWeeks, profile);
    expect(context).not.toHaveProperty("streak_days");
    expect(context).not.toHaveProperty("consistency_pct");
  });

  it("has no consistency figure without a plan or before the first workout", () => {
    expect(buildCoachContext(sixWeeks, null).consistency_vs_plan).toBeNull();
    expect(
      buildCoachContext(sixWeeks, { ...profile, frequency: null }).consistency_vs_plan,
    ).toBeNull();
    const fresh = buildCoachContext([], profile);
    expect(fresh.consistency_vs_plan).toBeNull();
    expect(fresh.streak_weeks).toBe(0);
  });
});

describe("coachContextWithoutHistory", () => {
  it("drops every figure computed from the workouts and says why", () => {
    const context = buildCoachContext([], null, [], {
      kind: "template",
      title: "Leg Day",
      reason: "You haven't hit Quads yet — start here.",
    });
    const sent = coachContextWithoutHistory(context);
    expect(Object.keys(sent).sort()).toEqual(["profile", "today_readiness", "workout_history"]);
    expect(sent.profile).toEqual(context.profile);
    expect(sent.workout_history).toBe(WORKOUT_HISTORY_UNAVAILABLE);
    expect(sent.workout_history).toMatch(/not an empty history/);
  });
});

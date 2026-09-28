import { describe, expect, it } from "vitest";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { extractWorkoutPlan } from "./coachPlan";
import {
  coachHistoryState,
  coachStarters,
  countRecentLogs,
  isVoiceHelpQuestion,
  MAX_COACH_STARTERS,
  recentWorkoutsForCoach,
  VOICE_HELP_QUESTION,
  voiceLoggingAnswer,
  type CoachHistoryFacts,
  type CoachStarterFacts,
} from "./coachStarters";

const NEW_LIFTER: CoachStarterFacts = {
  totalLogs: 0,
  logsLast7Days: 0,
  savedWorkouts: 0,
  hasWorkoutToday: true,
};

const RETURNING: CoachStarterFacts = {
  totalLogs: 18,
  logsLast7Days: 3,
  savedWorkouts: 3,
  hasWorkoutToday: true,
};

const labels = (facts: CoachStarterFacts): string[] => coachStarters(facts).map((s) => s.label);

describe("coachStarters", () => {
  it("offers a new lifter a first workout, a routine, and the voice explainer", () => {
    expect(labels(NEW_LIFTER)).toEqual([
      "Build my first workout",
      "Help me choose a routine",
      "How does voice logging work?",
    ]);
  });

  it("never offers a new lifter a review or an adjustment", () => {
    for (const hasWorkoutToday of [true, false]) {
      const offered = labels({ ...NEW_LIFTER, hasWorkoutToday });
      expect(offered).not.toContain("Review my last week");
      expect(offered).not.toContain("Review my last workout");
      expect(offered).not.toContain("Adjust today's workout");
    }
  });

  it("gives a returning lifter the four training questions", () => {
    expect(labels(RETURNING)).toEqual([
      "Adjust today's workout",
      "I only have 30 minutes",
      "Find a replacement for an exercise",
      "Review my last week",
    ]);
  });

  it("drops the adjustment when nothing is picked for today", () => {
    expect(labels({ ...RETURNING, hasWorkoutToday: false })).toEqual([
      "I only have 30 minutes",
      "Find a replacement for an exercise",
      "Review my last week",
    ]);
  });

  it("reviews the last workout when the last 7 days are empty", () => {
    const offered = labels({ ...RETURNING, logsLast7Days: 0 });
    expect(offered).toContain("Review my last workout");
    expect(offered).not.toContain("Review my last week");
  });

  it("treats saved workouts without any logs as a routine to work with, not a review", () => {
    expect(labels({ ...NEW_LIFTER, savedWorkouts: 3 })).toEqual([
      "Adjust today's workout",
      "I only have 30 minutes",
      "Find a replacement for an exercise",
      "How does voice logging work?",
    ]);
    expect(labels({ ...NEW_LIFTER, savedWorkouts: 3, hasWorkoutToday: false })).toEqual([
      "I only have 30 minutes",
      "Find a replacement for an exercise",
      "How does voice logging work?",
    ]);
  });

  it("never returns more than four, and never a duplicate", () => {
    const counts = [0, 1, 5];
    for (const totalLogs of counts)
      for (const logsLast7Days of counts)
        for (const savedWorkouts of counts)
          for (const hasWorkoutToday of [true, false]) {
            const offered = labels({ totalLogs, logsLast7Days, savedWorkouts, hasWorkoutToday });
            expect(offered.length).toBeGreaterThan(0);
            expect(offered.length).toBeLessThanOrEqual(MAX_COACH_STARTERS);
            expect(new Set(offered).size).toBe(offered.length);
          }
  });

  it("reads junk counts as zero and caps recent logs at the total", () => {
    expect(
      labels({
        totalLogs: Number.NaN,
        logsLast7Days: 4,
        savedWorkouts: -2,
        hasWorkoutToday: true,
      }),
    ).toEqual(labels(NEW_LIFTER));
  });

  it("answers only the voice question on the device", () => {
    const all = [NEW_LIFTER, RETURNING, { ...NEW_LIFTER, savedWorkouts: 2 }].flatMap(coachStarters);
    for (const starter of all) {
      expect(starter.action).toBe(starter.label === VOICE_HELP_QUESTION ? "local" : "draft");
    }
  });
});

describe("isVoiceHelpQuestion", () => {
  it("matches the chip's question whatever the case or punctuation", () => {
    expect(isVoiceHelpQuestion(VOICE_HELP_QUESTION)).toBe(true);
    expect(isVoiceHelpQuestion("  how does voice logging work  ")).toBe(true);
    expect(isVoiceHelpQuestion("How does  voice logging work??")).toBe(true);
  });

  it("leaves every other question for the coach", () => {
    expect(isVoiceHelpQuestion("How does voice logging work for squats?")).toBe(false);
    expect(isVoiceHelpQuestion("Review my last week")).toBe(false);
    expect(isVoiceHelpQuestion("")).toBe(false);
  });
});

describe("voiceLoggingAnswer", () => {
  const onPhone = voiceLoggingAnswer({ available: true });
  const elsewhere = voiceLoggingAnswer({ available: false });

  it("names the button, the example, the card and both ways to fix a mistake", () => {
    for (const answer of [onPhone, elsewhere]) {
      expect(answer).toContain("Tap to speak");
      expect(answer).toContain("3 sets of 8 at 185 on bench");
      expect(answer).toContain("**Logged** card");
      expect(answer).toContain("**Edit** or **Undo**");
      expect(answer).toContain("actually that was 12 reps");
      expect(answer).toContain("scratch that");
    }
  });

  it("says where voice lives when the mic is not on this device", () => {
    expect(elsewhere).toContain("part of the LiftOS iPhone app");
    expect(onPhone).not.toContain("part of the LiftOS iPhone app");
  });

  it("stays short and free of approximations", () => {
    for (const answer of [onPhone, elsewhere]) {
      expect(answer.split(/\s+/).length).toBeLessThan(110);
      expect(answer).not.toContain("~");
    }
  });

  it("never reads as a workout to save", () => {
    expect(extractWorkoutPlan(onPhone)).toHaveLength(0);
    expect(extractWorkoutPlan(elsewhere)).toHaveLength(0);
  });
});

/* Local-time anchor: Wednesday 23 Sep 2026, 08:00. */
const NOW = new Date(2026, 8, 23, 8, 0, 0).getTime();

let counter = 0;
const logAt = (date: Date, overrides: Partial<WorkoutLog> = {}): WorkoutLog => {
  counter += 1;
  const iso = date.toISOString();
  return {
    id: `log-${counter}`,
    template_id: null,
    name: "Push Day",
    exercises: [],
    notes: null,
    started_at: iso,
    finished_at: iso,
    duration_minutes: 50,
    total_sets: 3,
    completed_sets: 3,
    total_volume: 4200,
    source: "manual",
    captured_session_id: null,
    created_at: iso,
    ...overrides,
  };
};

describe("countRecentLogs", () => {
  it("counts workouts finished inside the window", () => {
    const logs = [
      logAt(new Date(2026, 8, 22, 19, 0, 0)),
      logAt(new Date(2026, 8, 17, 19, 0, 0)),
      logAt(new Date(2026, 8, 10, 19, 0, 0)),
    ];
    expect(countRecentLogs(logs, 7, NOW)).toBe(2);
  });

  it("ignores future and unparseable workouts", () => {
    const logs = [
      logAt(new Date(2026, 8, 25, 19, 0, 0)),
      { ...logAt(new Date(2026, 8, 22, 19, 0, 0)), finished_at: "not a date" },
    ];
    expect(countRecentLogs(logs, 7, NOW)).toBe(0);
    expect(countRecentLogs([], 7, NOW)).toBe(0);
  });
});

describe("recentWorkoutsForCoach", () => {
  const bench = {
    id: "e1",
    name: "Bench Press",
    category: "",
    target: "3 × 8",
    sets: [
      { id: "s0", reps: 10, weight: 95, completed: true, isWarmup: true },
      { id: "s1", reps: 8, weight: 185, completed: true },
      { id: "s2", reps: 6, weight: 185, completed: true },
      { id: "s3", reps: 8, weight: 205, completed: false },
    ],
  };
  const plank = {
    id: "e2",
    name: "Plank",
    tracking: "time" as const,
    category: "",
    target: "",
    sets: [
      { id: "s4", reps: 0, duration_seconds: 45, completed: true },
      { id: "s5", reps: 0, duration_seconds: 75, completed: true },
    ],
  };
  const pullUp = {
    id: "e3",
    name: "Pull Up",
    kind: "bodyweight" as const,
    category: "",
    target: "",
    sets: [{ id: "s6", reps: 9, completed: true }],
  };
  const run = {
    id: "e4",
    name: "Treadmill",
    kind: "cardio" as const,
    category: "",
    target: "",
    sets: [{ id: "s7", weight: 3.1, duration_seconds: 1800, completed: true }],
  };
  const untouched = {
    id: "e5",
    name: "Dips",
    category: "",
    target: "",
    sets: [{ id: "s8", reps: 10, weight: 0, completed: false }],
  };

  it("returns nothing when nothing is logged", () => {
    expect(recentWorkoutsForCoach([], "lb", NOW)).toEqual([]);
  });

  it("summarizes the last 7 days, newest first", () => {
    const logs = [
      logAt(new Date(2026, 8, 18, 19, 0, 0), { name: "Leg Day" }),
      logAt(new Date(2026, 8, 22, 19, 0, 0), { name: "Push Day" }),
      logAt(new Date(2026, 8, 1, 19, 0, 0), { name: "Old Day" }),
    ];
    const summary = recentWorkoutsForCoach(logs, "lb", NOW);
    expect(summary.map((w) => w.name)).toEqual(["Push Day", "Leg Day"]);
    expect(summary[0]).toMatchObject({ date: "2026-09-22", days_ago: 1, duration_min: 50 });
    expect(summary[1].days_ago).toBe(5);
  });

  it("falls back to the single most recent workout when the week is empty", () => {
    const logs = [
      logAt(new Date(2026, 7, 2, 19, 0, 0), { name: "Older" }),
      logAt(new Date(2026, 8, 1, 19, 0, 0), { name: "Latest" }),
    ];
    const summary = recentWorkoutsForCoach(logs, "lb", NOW);
    expect(summary.map((w) => w.name)).toEqual(["Latest"]);
    expect(summary[0].days_ago).toBe(22);
  });

  it("describes each exercise by its best completed working set", () => {
    const log = logAt(new Date(2026, 8, 22, 19, 0, 0), {
      exercises: [bench, plank, pullUp, run, untouched],
    });
    expect(recentWorkoutsForCoach([log], "kg", NOW)[0].exercises).toEqual([
      { name: "Bench Press", sets_done: 2, best_set: "185 kg × 8" },
      { name: "Plank", sets_done: 2, best_set: "1:15 hold" },
      { name: "Pull Up", sets_done: 1, best_set: "9 reps" },
      { name: "Treadmill", sets_done: 1, best_set: "30:00" },
    ]);
  });

  it("caps the list and skips future or unparseable workouts", () => {
    const logs = [
      ...Array.from({ length: 10 }, (_, i) => logAt(new Date(2026, 8, 22, 9 + i, 0, 0))),
      logAt(new Date(2026, 8, 24, 19, 0, 0), { name: "Future" }),
      { ...logAt(new Date(2026, 8, 22, 19, 0, 0)), name: "Broken", finished_at: "nope" },
    ];
    const summary = recentWorkoutsForCoach(logs, "lb", NOW);
    expect(summary).toHaveLength(7);
    expect(summary.map((w) => w.name)).not.toContain("Future");
    expect(summary.map((w) => w.name)).not.toContain("Broken");
  });

  it("reports a missing duration as null, never zero minutes", () => {
    const log = logAt(new Date(2026, 8, 22, 19, 0, 0), { duration_minutes: null });
    expect(recentWorkoutsForCoach([log], "lb", NOW)[0].duration_min).toBeNull();
  });
});

describe("coachHistoryState", () => {
  const LOADED: CoachHistoryFacts = {
    logs: 18,
    logsLoading: false,
    logsLoadFailed: false,
    savedWorkouts: 3,
    savedLoading: false,
    savedLoadFailed: false,
  };
  const EMPTY: CoachHistoryFacts = { ...LOADED, logs: 0, savedWorkouts: 0 };

  it("knows a loaded history and offers its chips", () => {
    expect(coachHistoryState(LOADED)).toEqual({
      logsKnown: true,
      noHistory: false,
      logsUnavailable: false,
      startersKnown: true,
    });
  });

  it("calls an account new only after both loads finished cleanly and empty", () => {
    expect(coachHistoryState(EMPTY)).toEqual({
      logsKnown: true,
      noHistory: true,
      logsUnavailable: false,
      startersKnown: true,
    });
  });

  it("waits while an empty list is still loading", () => {
    expect(coachHistoryState({ ...EMPTY, logsLoading: true })).toEqual({
      logsKnown: false,
      noHistory: false,
      logsUnavailable: false,
      startersKnown: false,
    });
    // The workouts are in and empty, the library is not: the first-day
    // chips depend on it, so they wait. The history line does not.
    expect(coachHistoryState({ ...EMPTY, savedLoading: true })).toMatchObject({
      logsKnown: true,
      noHistory: true,
      startersKnown: false,
    });
  });

  it("keeps everything when a reload fails over held workouts", () => {
    expect(coachHistoryState({ ...LOADED, logsLoadFailed: true })).toEqual({
      logsKnown: true,
      noHistory: false,
      logsUnavailable: false,
      startersKnown: true,
    });
  });

  it("keeps everything while held workouts reload", () => {
    expect(
      coachHistoryState({ ...LOADED, logsLoading: true, savedLoading: true }),
    ).toMatchObject({ logsKnown: true, startersKnown: true });
  });

  it("is not held back by the library once a workout is logged", () => {
    // A save whose list refresh failed, or a library that never loaded.
    expect(coachHistoryState({ ...LOADED, savedLoadFailed: true })).toMatchObject({
      logsKnown: true,
      startersKnown: true,
    });
    expect(
      coachHistoryState({ ...LOADED, savedWorkouts: 0, savedLoadFailed: true }),
    ).toMatchObject({ logsKnown: true, noHistory: false, startersKnown: true });
  });

  it("never reads a failed load with nothing held as a new account", () => {
    expect(coachHistoryState({ ...EMPTY, logsLoadFailed: true })).toEqual({
      logsKnown: false,
      noHistory: false,
      logsUnavailable: true,
      startersKnown: false,
    });
    // Still unavailable while a reload runs — the notice does not blink.
    expect(
      coachHistoryState({ ...EMPTY, logsLoadFailed: true, logsLoading: true }),
    ).toMatchObject({ logsKnown: false, logsUnavailable: true, startersKnown: false });
  });

  it("holds the first-day chips back when nothing is logged and the library failed", () => {
    // Empty logs are known; whether anything is saved is not.
    expect(coachHistoryState({ ...EMPTY, savedLoadFailed: true })).toEqual({
      logsKnown: true,
      noHistory: true,
      logsUnavailable: false,
      startersKnown: false,
    });
    // A held library settles it.
    expect(
      coachHistoryState({ ...EMPTY, savedWorkouts: 2, savedLoadFailed: true }),
    ).toMatchObject({ noHistory: true, startersKnown: true });
  });
});

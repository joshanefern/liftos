import { describe, expect, it } from "vitest";
import { buildProgressHero } from "./progressHero";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";

/* Synthetic logs: one exercise, one completed working set per session. */

const NOW = Date.parse("2026-08-19T12:00:00Z");
const DAY_MS = 86_400_000;

let idCounter = 0;
const makeLog = (
  daysAgo: number,
  name: string,
  weight: number,
  opts?: { volume?: number; minutes?: number },
): WorkoutLog => {
  idCounter += 1;
  const finished = new Date(NOW - daysAgo * DAY_MS).toISOString();
  return {
    id: `log-${idCounter}`,
    template_id: null,
    name: "Session",
    exercises: [
      {
        id: `ex-${idCounter}`,
        name,
        category: "Session",
        target: "",
        sets: [{ id: `set-${idCounter}`, reps: 5, weight, completed: true }],
      },
    ],
    notes: null,
    started_at: finished,
    finished_at: finished,
    duration_minutes: opts?.minutes ?? 45,
    total_sets: 1,
    completed_sets: 1,
    total_volume: opts?.volume ?? weight * 5,
    source: "manual",
    captured_session_id: null,
    created_at: finished,
  };
};

describe("buildProgressHero", () => {
  it("headlines overall strength gain for a Strength goal", () => {
    const logs = [
      makeLog(70, "Bench", 100),
      makeLog(40, "Bench", 110),
      makeLog(7, "Bench", 120),
    ];
    const hero = buildProgressHero(logs, "Strength", "lb", NOW);
    expect(hero).not.toBeNull();
    expect(hero!.value).toBe("+20%");
    expect(hero!.label).toBe("stronger overall");
    expect(hero!.eyebrow).toBe("Getting stronger");
    expect(hero!.detail).toContain("Bench");
  });

  it("prefers volume for a Hypertrophy goal", () => {
    const logs = [
      makeLog(40, "Row", 100, { volume: 4000 }),
      makeLog(35, "Row", 100, { volume: 4000 }),
      makeLog(10, "Row", 100, { volume: 5000 }),
      makeLog(5, "Row", 100, { volume: 5000 }),
    ];
    const hero = buildProgressHero(logs, "Hypertrophy", "lb", NOW);
    expect(hero).not.toBeNull();
    expect(hero!.label).toBe("more volume");
    expect(hero!.value).toBe("+25%");
    expect(hero!.eyebrow).toBe("Building muscle");
  });

  it("leads with consistency for Fat Loss, even when strength is up", () => {
    const logs = [
      makeLog(50, "Squat", 200),
      makeLog(20, "Squat", 225),
      makeLog(6, "Squat", 245),
    ];
    const hero = buildProgressHero(logs, "Fat Loss", "lb", NOW);
    expect(hero).not.toBeNull();
    expect(hero!.label).toBe("sessions this month");
    expect(hero!.value).toBe("2");
    expect(hero!.eyebrow).toBe("Putting in the work");
  });

  it("handles comma-joined multi-select goals", () => {
    const logs = [makeLog(30, "Bench", 100), makeLog(5, "Bench", 110)];
    const hero = buildProgressHero(logs, "Hypertrophy, Strength", "lb", NOW);
    // "strength" wins the focus check regardless of position in the string.
    expect(hero!.eyebrow).toBe("Getting stronger");
  });

  it("never shows a negative number — a shrinking lift falls through to consistency", () => {
    // Strength down AND volume down: only consistency is still positive.
    const logs = [
      makeLog(50, "Bench", 150, { volume: 6000 }),
      makeLog(20, "Bench", 140, { volume: 2000 }),
      makeLog(5, "Bench", 130, { volume: 2000 }),
    ];
    const hero = buildProgressHero(logs, "Strength", "lb", NOW);
    expect(hero).not.toBeNull();
    expect(hero!.value).toBe("2");
    expect(hero!.label).toBe("sessions this month");
    expect(hero!.detail).not.toMatch(/down|worse|less/i);
  });

  it("falls back to the all-time count after a long break", () => {
    // Older than the 84-day trend window and both volume windows.
    const logs = [makeLog(100, "Bench", 100), makeLog(95, "Bench", 110)];
    const hero = buildProgressHero(logs, null, "lb", NOW);
    expect(hero).not.toBeNull();
    expect(hero!.value).toBe("2");
    expect(hero!.label).toBe("workouts logged");
  });

  it("returns null with no history at all", () => {
    expect(buildProgressHero([], "Strength", "lb", NOW)).toBeNull();
  });
});

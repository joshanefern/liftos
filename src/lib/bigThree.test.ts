import { describe, expect, it } from "vitest";
import { prStrip } from "./bigThree";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";

const NOW = Date.parse("2026-08-16T12:00:00Z");

const log = (
  finishedAt: string,
  entries: [string, number, number][],
): WorkoutLog => ({
  id: finishedAt,
  template_id: null,
  name: "Session",
  exercises: entries.map(([name, weight, reps], i) => ({
    id: `${finishedAt}-${i}`,
    name,
    category: "",
    target: "",
    sets: [{ id: `${finishedAt}-${i}-s`, weight, reps, completed: true }],
  })),
  notes: null,
  started_at: null,
  finished_at: finishedAt,
  duration_minutes: 60,
  total_sets: entries.length,
  completed_sets: entries.length,
  total_volume: 0,
  source: "manual",
  captured_session_id: null,
  created_at: finishedAt,
});

describe("prStrip", () => {
  it("claims big-3 slots by name and keeps variants out", () => {
    const strip = prStrip(
      [
        log("2026-08-01T10:00:00Z", [
          ["Bench Press", 225, 5],
          ["Incline Bench Press", 245, 5], // must NOT claim the bench slot
          ["Back Squat", 315, 3],
          ["Romanian Deadlift", 365, 5], // must NOT claim the deadlift slot
          ["Deadlift", 405, 1],
        ]),
      ],
      NOW,
    );
    expect(strip.map((e) => [e.label, e.weight])).toEqual([
      ["Bench", 225],
      ["Squat", 315],
      ["Deadlift", 405],
    ]);
  });

  it("backfills missing slots with the heaviest other lifts", () => {
    const strip = prStrip(
      [
        log("2026-08-01T10:00:00Z", [
          ["Overhead Press", 135, 5],
          ["Barbell Row", 185, 8],
          ["Curl", 65, 10],
        ]),
      ],
      NOW,
    );
    expect(strip.map((e) => e.label)).toEqual(["Barbell Row", "Overhead Press", "Curl"]);
  });

  it("marks PRs broken in the last 72h and ignores placeholders", () => {
    const strip = prStrip(
      [
        log("2026-08-15T10:00:00Z", [["Bench Press", 230, 3]]),
        log("2026-08-01T10:00:00Z", [
          ["Bench Press", 225, 5],
          ["Exercise 2", 999, 5],
        ]),
      ],
      NOW,
    );
    expect(strip).toHaveLength(1);
    expect(strip[0]).toMatchObject({ label: "Bench", weight: 230, recent: true });
  });

  it("returns empty for weightless history", () => {
    expect(prStrip([log("2026-08-01T10:00:00Z", [["Plank", 0, 0]])], NOW)).toEqual([]);
  });
});

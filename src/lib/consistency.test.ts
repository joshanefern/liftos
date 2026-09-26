import { describe, expect, it } from "vitest";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { compactVolume, volumeComparison, weeksTrained } from "./consistency";

/* Local-time anchor: Wednesday 23 Sep 2026, midday. The week it sits in
   starts Monday 21 Sep; an 8-week window reaches back to Monday 3 Aug. */
const NOW = new Date(2026, 8, 23, 12, 0, 0).getTime();
const DAY_MS = 86_400_000;

let counter = 0;
const logAt = (date: Date, volume = 1000): WorkoutLog => {
  counter += 1;
  const iso = date.toISOString();
  return {
    id: `log-${counter}`,
    template_id: null,
    name: "Session",
    exercises: [],
    notes: null,
    started_at: iso,
    finished_at: iso,
    duration_minutes: 45,
    total_sets: 3,
    completed_sets: 3,
    total_volume: volume,
    source: "manual",
    captured_session_id: null,
    created_at: iso,
  };
};

const daysAgo = (days: number, volume?: number): WorkoutLog =>
  logAt(new Date(NOW - days * DAY_MS), volume);

describe("weeksTrained", () => {
  it("reads 0 of 8 with nothing logged", () => {
    expect(weeksTrained([], 8, NOW)).toEqual({ trained: 0, weeks: 8 });
  });

  it("counts a week once however many sessions it holds", () => {
    const logs = [daysAgo(0), daysAgo(1), daysAgo(2)]; // Wed, Tue, Mon — same week
    expect(weeksTrained(logs, 8, NOW).trained).toBe(1);
  });

  it("counts each distinct week inside the window", () => {
    const logs = [daysAgo(0), daysAgo(8), daysAgo(15), daysAgo(30)];
    expect(weeksTrained(logs, 8, NOW).trained).toBe(4);
  });

  it("weeks start on Monday — a Sunday session belongs to the week before", () => {
    const sunday = logAt(new Date(2026, 8, 20, 18, 0, 0));
    const monday = logAt(new Date(2026, 8, 21, 7, 0, 0));
    expect(weeksTrained([sunday, monday], 8, NOW).trained).toBe(2);
  });

  it("includes the earliest week of the window and drops the one before it", () => {
    const earliestMonday = logAt(new Date(2026, 7, 3, 9, 0, 0)); // Mon 3 Aug
    const dayBefore = logAt(new Date(2026, 7, 2, 9, 0, 0)); // Sun 2 Aug
    expect(weeksTrained([earliestMonday], 8, NOW).trained).toBe(1);
    expect(weeksTrained([dayBefore], 8, NOW).trained).toBe(0);
  });

  it("honors a different window size", () => {
    const logs = [daysAgo(0), daysAgo(7), daysAgo(14), daysAgo(21), daysAgo(28)];
    expect(weeksTrained(logs, 4, NOW)).toEqual({ trained: 4, weeks: 4 });
  });

  it("ignores future and unparseable sessions", () => {
    const future = daysAgo(-3);
    const broken = { ...daysAgo(1), finished_at: "not a date" };
    expect(weeksTrained([future, broken], 8, NOW).trained).toBe(0);
  });

  it("never returns a window smaller than one week", () => {
    expect(weeksTrained([daysAgo(0)], 0, NOW)).toEqual({ trained: 1, weeks: 1 });
  });
});

describe("volumeComparison", () => {
  it("compares the last 4 weeks with the 4 before", () => {
    const logs = [daysAgo(3, 5000), daysAgo(20, 6000), daysAgo(35, 4000), daysAgo(50, 6000)];
    expect(volumeComparison(logs, NOW)).toEqual({ recent: 11_000, prior: 10_000, pct: 10 });
  });

  it("has no percentage until both windows hold volume", () => {
    expect(volumeComparison([daysAgo(3, 5000)], NOW)).toEqual({
      recent: 5000,
      prior: 0,
      pct: null,
    });
    expect(volumeComparison([daysAgo(40, 5000)], NOW).pct).toBeNull();
  });

  it("reports a genuine drop as negative", () => {
    const logs = [daysAgo(3, 4000), daysAgo(35, 8000)];
    expect(volumeComparison(logs, NOW).pct).toBe(-50);
  });

  it("drops sessions older than 8 weeks, in the future, or with junk volume", () => {
    const logs = [
      daysAgo(60, 9000),
      daysAgo(-1, 9000),
      { ...daysAgo(2, 0), total_volume: Number.NaN },
      daysAgo(4, 1500),
    ];
    expect(volumeComparison(logs, NOW)).toEqual({ recent: 1500, prior: 0, pct: null });
  });
});

describe("compactVolume", () => {
  it("keeps small totals whole and shortens thousands", () => {
    expect(compactVolume(950)).toBe("950");
    expect(compactVolume(999.6)).toBe("1000");
    expect(compactVolume(12_000)).toBe("12k");
    expect(compactVolume(48_250)).toBe("48.3k");
    expect(compactVolume(-5)).toBe("0");
  });
});

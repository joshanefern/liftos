import { describe, expect, it } from "vitest";
import { detectSets } from "./detectSets";
import { groupSetsIntoExercises } from "./groupExercises";
import { cleanLiftingSession } from "./syntheticData";
import type { DetectedSet, ExerciseHistoryEntry } from "./types";

const makeSet = (overrides: Partial<DetectedSet>): DetectedSet => ({
  id: overrides.id ?? "set-x",
  start_s: 0,
  end_s: 0,
  duration_s: 60,
  peak_hr: 145,
  avg_hr: 130,
  estimated_reps: 10,
  confidence: 0.8,
  ...overrides,
});

describe("groupSetsIntoExercises — empty input", () => {
  it("returns an empty array", () => {
    expect(groupSetsIntoExercises([], [])).toEqual([]);
  });
});

describe("groupSetsIntoExercises — clustering", () => {
  it("groups consecutive similar sets into one exercise", () => {
    const sets = Array.from({ length: 5 }, (_, i) =>
      makeSet({ id: `s${i}`, peak_hr: 146 + (i % 2), duration_s: 60 + i }),
    );
    const groups = groupSetsIntoExercises(sets, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].sets).toHaveLength(5);
  });

  it("splits when peak HR steps outside the band", () => {
    const sets = [
      makeSet({ id: "a", peak_hr: 145 }),
      makeSet({ id: "b", peak_hr: 145 }),
      makeSet({ id: "c", peak_hr: 165 }),
      makeSet({ id: "d", peak_hr: 165 }),
    ];
    const groups = groupSetsIntoExercises(sets, []);
    expect(groups).toHaveLength(2);
    expect(groups[0].sets).toHaveLength(2);
    expect(groups[1].sets).toHaveLength(2);
  });

  it("splits when duration changes by more than 30%", () => {
    const sets = [
      makeSet({ id: "a", duration_s: 60, peak_hr: 145 }),
      makeSet({ id: "b", duration_s: 62, peak_hr: 145 }),
      makeSet({ id: "c", duration_s: 95, peak_hr: 145 }),
    ];
    const groups = groupSetsIntoExercises(sets, []);
    expect(groups).toHaveLength(2);
  });
});

describe("groupSetsIntoExercises — history matching", () => {
  const history: ExerciseHistoryEntry[] = [
    { name: "bench press", typical_peak_hr: 145, typical_duration_s: 60, kind: "weighted" },
    { name: "back squat", typical_peak_hr: 168, typical_duration_s: 80, kind: "weighted" },
  ];

  it("suggests a name when peak HR and duration are within bands", () => {
    const sets = [makeSet({ peak_hr: 146, duration_s: 62 })];
    const groups = groupSetsIntoExercises(sets, history);
    expect(groups[0].suggested_name).toBe("bench press");
    expect(groups[0].suggested_kind).toBe("weighted");
  });

  it("leaves suggested fields null when no entry matches", () => {
    const sets = [makeSet({ peak_hr: 110, duration_s: 30 })];
    const groups = groupSetsIntoExercises(sets, history);
    expect(groups[0].suggested_name).toBeNull();
    expect(groups[0].suggested_kind).toBeNull();
  });

  it("picks the closest match when multiple entries qualify", () => {
    const overlapping: ExerciseHistoryEntry[] = [
      { name: "bench press", typical_peak_hr: 148, typical_duration_s: 60, kind: "weighted" },
      { name: "incline press", typical_peak_hr: 144, typical_duration_s: 58, kind: "weighted" },
    ];
    const sets = [makeSet({ peak_hr: 144, duration_s: 58 })];
    const groups = groupSetsIntoExercises(sets, overlapping);
    expect(groups[0].suggested_name).toBe("incline press");
  });
});

describe("groupSetsIntoExercises — end-to-end with detected sets", () => {
  it("turns a clean lifting session into a single exercise group", () => {
    const session = cleanLiftingSession({ seed: 1 });
    const sets = detectSets(session.hr_samples, session.motion_samples);
    const groups = groupSetsIntoExercises(sets, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].sets.length).toBe(sets.length);
    expect(groups[0].group_confidence).toBeGreaterThan(0.5);
  });
});

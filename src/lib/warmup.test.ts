import { describe, expect, it } from "vitest";
import { generateWarmupSets, roundToIncrement } from "./warmup";

const shape = (sets: ReturnType<typeof generateWarmupSets>) =>
  sets.map((s) => ({ weight: s.weight, reps: s.reps }));

describe("generateWarmupSets — lb", () => {
  it("225 lb gets the full ramp", () => {
    expect(shape(generateWarmupSets(225, { unit: "lb" }))).toEqual([
      { weight: 45, reps: 10 },
      { weight: 90, reps: 8 },
      { weight: 135, reps: 5 },
      { weight: 180, reps: 3 },
    ]);
  });

  it("95 lb skips tiers that round below the bar", () => {
    // 40% of 95 rounds to 40 < bar → dropped.
    expect(shape(generateWarmupSets(95, { unit: "lb" }))).toEqual([
      { weight: 45, reps: 10 },
      { weight: 55, reps: 5 },
      { weight: 75, reps: 3 },
    ]);
  });

  it("dedupes tiers that round onto an earlier weight", () => {
    // 40% of 112 rounds to 45 = bar tier → dropped.
    expect(shape(generateWarmupSets(112, { unit: "lb" }))).toEqual([
      { weight: 45, reps: 10 },
      { weight: 65, reps: 5 },
      { weight: 90, reps: 3 },
    ]);
  });

  it("light working weight (< 1.5x bar) gets the short ramp", () => {
    expect(shape(generateWarmupSets(60, { unit: "lb" }))).toEqual([
      { weight: 45, reps: 10 },
      { weight: 50, reps: 3 },
    ]);
  });

  it("working weight at or below the bar yields no warmups", () => {
    expect(generateWarmupSets(45, { unit: "lb" })).toEqual([]);
    expect(generateWarmupSets(30, { unit: "lb" })).toEqual([]);
  });

  it("marks every set isWarmup and not completed, with unique ids", () => {
    const sets = generateWarmupSets(225, { unit: "lb" });
    sets.forEach((s) => {
      expect(s.isWarmup).toBe(true);
      expect(s.completed).toBe(false);
      expect(s.id).toMatch(/^set-/);
    });
    expect(new Set(sets.map((s) => s.id)).size).toBe(sets.length);
  });

  it("honors a custom scheme", () => {
    const sets = generateWarmupSets(200, {
      unit: "lb",
      scheme: [{ pct: 0.5, reps: 5 }],
    });
    expect(shape(sets)).toEqual([{ weight: 100, reps: 5 }]);
  });
});

describe("generateWarmupSets — kg", () => {
  it("100 kg gets the full ramp off a 20 kg bar", () => {
    expect(shape(generateWarmupSets(100, { unit: "kg" }))).toEqual([
      { weight: 20, reps: 10 },
      { weight: 40, reps: 8 },
      { weight: 60, reps: 5 },
      { weight: 80, reps: 3 },
    ]);
  });

  it("rounds tiers to 2.5 kg", () => {
    // 102.5 kg: 41 → 40, 61.5 → 62.5, 82 → 82.5.
    expect(shape(generateWarmupSets(102.5, { unit: "kg" }))).toEqual([
      { weight: 20, reps: 10 },
      { weight: 40, reps: 8 },
      { weight: 62.5, reps: 5 },
      { weight: 82.5, reps: 3 },
    ]);
  });

  it("light kg weight collapses to a single bar set", () => {
    // 25 kg short ramp: 80% rounds to 20 = bar → deduped.
    expect(shape(generateWarmupSets(25, { unit: "kg" }))).toEqual([
      { weight: 20, reps: 10 },
    ]);
  });
});

describe("roundToIncrement", () => {
  it("rounds to 5 lb / 2.5 kg", () => {
    expect(roundToIncrement(88, "lb")).toBe(90);
    expect(roundToIncrement(87, "lb")).toBe(85);
    expect(roundToIncrement(41, "kg")).toBe(40);
    expect(roundToIncrement(61.5, "kg")).toBe(62.5);
  });
});

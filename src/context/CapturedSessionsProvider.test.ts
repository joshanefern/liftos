import { describe, expect, it } from "vitest";
import {
  inferReviewMode,
  isCardioActivityType,
} from "./CapturedSessionsProvider";

describe("inferReviewMode — 5-row matrix", () => {
  // Row 1: cardio activity → cardio (any sets)
  it("Row 1: Run + 0 sets → cardio", () => {
    expect(inferReviewMode("Run", 0, {})).toBe("cardio");
  });
  it("Row 1: Run + N sets → cardio (interval bookends are dropped)", () => {
    expect(inferReviewMode("Run", 6, {})).toBe("cardio");
  });
  it("Row 1: Ride / Swim / Walk / Hike are cardio", () => {
    expect(inferReviewMode("Ride", 0, {})).toBe("cardio");
    expect(inferReviewMode("Swim", 0, {})).toBe("cardio");
    expect(inferReviewMode("Walk", 0, {})).toBe("cardio");
    expect(inferReviewMode("Hike", 0, {})).toBe("cardio");
  });

  // Row 2: WeightTraining + sets > 0 → lifting
  it("Row 2: WeightTraining + N sets → lifting", () => {
    expect(inferReviewMode("WeightTraining", 5, {})).toBe("lifting");
  });

  // Row 3: WeightTraining + 0 → empty
  it("Row 3: WeightTraining + 0 sets → empty", () => {
    expect(inferReviewMode("WeightTraining", 0, {})).toBe("empty");
  });

  // Row 4: Workout/Crossfit + distance + sets → mixed
  it("Row 4: Workout + distance > 0 + sets → mixed", () => {
    expect(inferReviewMode("Workout", 4, { distance_m: 1200 })).toBe("mixed");
  });
  it("Row 4: Crossfit + distance > 0 + sets → mixed", () => {
    expect(inferReviewMode("Crossfit", 4, { distance_m: 800 })).toBe("mixed");
  });
  it("Workout + sets but no distance → lifting (Row 4 falls through)", () => {
    expect(inferReviewMode("Workout", 4, {})).toBe("lifting");
  });
  it("Workout + no sets → empty", () => {
    expect(inferReviewMode("Workout", 0, {})).toBe("empty");
  });

  // Row 5: fallback
  it("Row 5: null type + 0 sets + 0 distance → empty", () => {
    expect(inferReviewMode(null, 0, {})).toBe("empty");
  });
  it("Row 5: null type + N sets → lifting", () => {
    expect(inferReviewMode(null, 3, {})).toBe("lifting");
  });
  it("Row 5: null type + distance > 0 + 0 sets → cardio", () => {
    expect(inferReviewMode(null, 0, { distance_m: 5000 })).toBe("cardio");
  });
  it("Row 5: null type + distance > 0 + sets → mixed", () => {
    expect(inferReviewMode(null, 3, { distance_m: 5000 })).toBe("mixed");
  });
});

describe("isCardioActivityType", () => {
  it("recognizes common Strava cardio types", () => {
    expect(isCardioActivityType("Run")).toBe(true);
    expect(isCardioActivityType("Ride")).toBe(true);
    expect(isCardioActivityType("Swim")).toBe(true);
    expect(isCardioActivityType("Hike")).toBe(true);
  });
  it("does not flag strength or mixed types as cardio", () => {
    expect(isCardioActivityType("WeightTraining")).toBe(false);
    expect(isCardioActivityType("Workout")).toBe(false);
    expect(isCardioActivityType("Crossfit")).toBe(false);
  });
  it("returns false for null or unknown types", () => {
    expect(isCardioActivityType(null)).toBe(false);
    expect(isCardioActivityType("Mystery")).toBe(false);
  });
});

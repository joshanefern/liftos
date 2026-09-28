import { describe, expect, it } from "vitest";
import { FINISH_GUARD_MS, finishGuarded } from "./finishGuard";

const LOGGED = 50_000;

describe("finishGuarded", () => {
  it("holds nothing before a last set has been logged", () => {
    expect(finishGuarded(null, 0)).toBe(false);
    expect(finishGuarded(null, LOGGED)).toBe(false);
  });

  it("holds the second half of a double tap", () => {
    for (const gap of [0, 80, 300, 399]) {
      expect(finishGuarded(LOGGED, LOGGED + gap)).toBe(true);
    }
  });

  it("holds a SLOW double tap — the taps that ended workouts", () => {
    expect(finishGuarded(LOGGED, LOGGED + 500)).toBe(true);
    expect(finishGuarded(LOGGED, LOGGED + 800)).toBe(true);
    expect(finishGuarded(LOGGED, LOGGED + FINISH_GUARD_MS - 1)).toBe(true);
  });

  it("lets a deliberate tap through once the moment has passed", () => {
    expect(finishGuarded(LOGGED, LOGGED + FINISH_GUARD_MS)).toBe(false);
    expect(finishGuarded(LOGGED, LOGGED + 1500)).toBe(false);
    expect(finishGuarded(LOGGED, LOGGED + 60_000)).toBe(false);
  });

  it("is about one second — not long enough to feel like a dead button", () => {
    expect(FINISH_GUARD_MS).toBeGreaterThan(800);
    expect(FINISH_GUARD_MS).toBeLessThanOrEqual(1200);
  });

  it("never stays shut when the clock ran backwards", () => {
    expect(finishGuarded(LOGGED, LOGGED - 1)).toBe(false);
    expect(finishGuarded(LOGGED, 0)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  formatHold,
  formatHoldDelta,
  formatHoldInput,
  inferTracking,
  parseHoldSeconds,
  sanitizeHold,
  trackingFor,
} from "./exerciseTracking";

describe("inferTracking", () => {
  it("reads holds, hangs, and carries as time", () => {
    for (const name of [
      "Plank",
      "planks", // plural, lower-case — the form Josh actually typed
      "Side Plank",
      "Weighted Plank",
      "Dead Hang",
      "Farmer Carry",
      "Farmer's Walk",
      "Wall Sit",
      "L-Sit",
      "Suitcase Carry",
      "Glute Bridge Hold",
    ]) {
      expect(inferTracking(name), name).toBe("time");
    }
  });

  it("reads ordinary lifts as reps", () => {
    for (const name of [
      "Bench Press",
      "Squat",
      "Pull-Up",
      "Lat Pulldown",
      "Push-Up",
      "Deadlift",
      // "hold"/"carry" must match whole words only:
      "Dumbbell Shoulder Press",
    ]) {
      expect(inferTracking(name), name).toBe("reps");
    }
  });
});

describe("trackingFor", () => {
  it("explicit setting beats inference in both directions", () => {
    expect(trackingFor({ name: "Plank", tracking: "reps" })).toBe("reps");
    expect(trackingFor({ name: "Bench Press", tracking: "time" })).toBe("time");
    expect(trackingFor({ name: "Plank" })).toBe("time");
  });
});

describe("parseHoldSeconds", () => {
  it("reads bare digits as seconds, longer digits as m:ss", () => {
    expect(parseHoldSeconds("45")).toBe(45);
    expect(parseHoldSeconds("90")).toBe(90);
    expect(parseHoldSeconds("130")).toBe(90);
    expect(parseHoldSeconds("1230")).toBe(750);
  });

  it("reads colon forms", () => {
    expect(parseHoldSeconds("1:30")).toBe(90);
    expect(parseHoldSeconds("0:45")).toBe(45);
    expect(parseHoldSeconds(":45")).toBe(45);
    expect(parseHoldSeconds("2:")).toBe(120);
  });

  it("rejects empty, zero, and junk", () => {
    expect(parseHoldSeconds("")).toBeNull();
    expect(parseHoldSeconds("0")).toBeNull();
    expect(parseHoldSeconds("0:00")).toBeNull();
    expect(parseHoldSeconds("abc")).toBeNull();
    expect(parseHoldSeconds("1:2:3")).toBeNull();
  });
});

describe("hold formatting", () => {
  it("formats sub-minute as seconds, beyond as m:ss", () => {
    expect(formatHold(45)).toBe("45s");
    expect(formatHold(90)).toBe("1:30");
    expect(formatHold(3725)).toBe("1:02:05");
  });

  it("input form is always m:ss", () => {
    expect(formatHoldInput(45)).toBe("0:45");
    expect(formatHoldInput(90)).toBe("1:30");
  });

  it("deltas carry a sign", () => {
    expect(formatHoldDelta(30)).toBe("+30s");
    expect(formatHoldDelta(-70)).toBe("-1:10");
  });
});

describe("sanitizeHold", () => {
  it("keeps digits and a single colon", () => {
    expect(sanitizeHold("1a:3b0")).toBe("1:30");
    expect(sanitizeHold("1:2:30")).toBe("12:30");
  });
});

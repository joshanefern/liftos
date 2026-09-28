import { describe, expect, it } from "vitest";
import { homeStatBlock } from "./statBlock";

const ready = { dataReady: true, logsLoadFailed: false, logCount: 0, templateCount: 0 };

describe("homeStatBlock", () => {
  it("a history that failed to load is never shown as numbers", () => {
    expect(homeStatBlock({ ...ready, logsLoadFailed: true })).toBe("load-failed");
  });

  it("says so even when the saved workouts did load", () => {
    expect(homeStatBlock({ ...ready, logsLoadFailed: true, templateCount: 3 })).toBe(
      "load-failed",
    );
  });

  it("a failed reload keeps the numbers that were already loaded", () => {
    expect(homeStatBlock({ ...ready, logsLoadFailed: true, logCount: 12 })).toBe("stats");
  });

  it("a workout finished while the history is still unloaded shows as itself", () => {
    expect(homeStatBlock({ ...ready, logsLoadFailed: true, logCount: 1 })).toBe("stats");
  });

  it("a new account with nothing saved gets the one line, not zeros", () => {
    // Also the answer when the saved-workouts query failed: that hook leaves
    // an empty list behind, and the history is known to be empty either way.
    expect(homeStatBlock(ready)).toBe("first-workout");
  });

  it("a new account with saved workouts previews the plan", () => {
    expect(homeStatBlock({ ...ready, templateCount: 4 })).toBe("plan");
  });

  it("a lifter with history gets the numbers", () => {
    expect(homeStatBlock({ ...ready, logCount: 18, templateCount: 3 })).toBe("stats");
  });

  it("nothing is decided while either query is still running", () => {
    for (const logsLoadFailed of [false, true]) {
      for (const templateCount of [0, 3]) {
        expect(
          homeStatBlock({ dataReady: false, logsLoadFailed, logCount: 0, templateCount }),
        ).toBe("stats");
      }
    }
  });
});

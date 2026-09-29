import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_REST_TIMER,
  MAX_REST_SECONDS,
  MIN_REST_SECONDS,
  REST_PRESETS,
  REST_TIMER_KEY,
  clampRestSeconds,
  loadRestTimerPrefs,
  nudgeRestSeconds,
  parseRestTimerPrefs,
  restTimerSummary,
  saveRestTimerPrefs,
} from "./restTimerPrefs";

const throwing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("rest timer defaults", () => {
  it("is off until the lifter adds it, with 2:00 ready to use", () => {
    expect(DEFAULT_REST_TIMER).toEqual({ on: false, seconds: 120 });
  });

  it("offers presets that are all usable lengths", () => {
    for (const seconds of REST_PRESETS) expect(clampRestSeconds(seconds)).toBe(seconds);
  });
});

describe("clampRestSeconds", () => {
  it("keeps lengths inside 0:15 … 10:00", () => {
    expect(clampRestSeconds(0)).toBe(MIN_REST_SECONDS);
    expect(clampRestSeconds(-30)).toBe(MIN_REST_SECONDS);
    expect(clampRestSeconds(12)).toBe(MIN_REST_SECONDS);
    expect(clampRestSeconds(601)).toBe(MAX_REST_SECONDS);
    expect(clampRestSeconds(3600)).toBe(MAX_REST_SECONDS);
  });

  it("rounds to the nearest 5 seconds", () => {
    expect(clampRestSeconds(92)).toBe(90);
    expect(clampRestSeconds(93)).toBe(95);
    expect(clampRestSeconds(104.9)).toBe(105);
  });

  it("reads anything that is not a number as the default length", () => {
    expect(clampRestSeconds("90")).toBe(120);
    expect(clampRestSeconds(null)).toBe(120);
    expect(clampRestSeconds(undefined)).toBe(120);
    expect(clampRestSeconds(Number.NaN)).toBe(120);
    expect(clampRestSeconds(Number.POSITIVE_INFINITY)).toBe(120);
  });
});

describe("nudgeRestSeconds", () => {
  it("moves by 15 seconds either way", () => {
    expect(nudgeRestSeconds(90, 1)).toBe(105);
    expect(nudgeRestSeconds(90, -1)).toBe(75);
  });

  it("stops at the ends", () => {
    expect(nudgeRestSeconds(MIN_REST_SECONDS, -1)).toBe(MIN_REST_SECONDS);
    expect(nudgeRestSeconds(MAX_REST_SECONDS, 1)).toBe(MAX_REST_SECONDS);
    expect(nudgeRestSeconds(595, 1)).toBe(MAX_REST_SECONDS);
  });
});

describe("parseRestTimerPrefs", () => {
  it("keeps a valid setting", () => {
    expect(parseRestTimerPrefs({ on: true, seconds: 90 })).toEqual({ on: true, seconds: 90 });
  });

  it("turns the timer on only for a real true", () => {
    expect(parseRestTimerPrefs({ on: "true", seconds: 90 }).on).toBe(false);
    expect(parseRestTimerPrefs({ on: 1, seconds: 90 }).on).toBe(false);
    expect(parseRestTimerPrefs({ seconds: 90 }).on).toBe(false);
  });

  it("falls back field by field", () => {
    expect(parseRestTimerPrefs({ on: true })).toEqual({ on: true, seconds: 120 });
    expect(parseRestTimerPrefs({ on: true, seconds: 5000 })).toEqual({ on: true, seconds: 600 });
  });

  it("is the default for anything that is not a settings object", () => {
    for (const raw of [null, undefined, "on", 90, true, [true, 90]]) {
      expect(parseRestTimerPrefs(raw)).toEqual(DEFAULT_REST_TIMER);
    }
  });
});

describe("loadRestTimerPrefs / saveRestTimerPrefs", () => {
  beforeEach(() => localStorage.clear());

  it("is the default when nothing was saved", () => {
    expect(loadRestTimerPrefs()).toEqual(DEFAULT_REST_TIMER);
  });

  it("remembers what was saved", () => {
    saveRestTimerPrefs({ on: true, seconds: 105 });
    expect(loadRestTimerPrefs()).toEqual({ on: true, seconds: 105 });
    expect(JSON.parse(localStorage.getItem(REST_TIMER_KEY) ?? "")).toEqual({ on: true, seconds: 105 });
  });

  it("saves, and hands back, a cleaned-up setting", () => {
    expect(saveRestTimerPrefs({ on: true, seconds: 7 })).toEqual({ on: true, seconds: 15 });
    expect(loadRestTimerPrefs()).toEqual({ on: true, seconds: 15 });
  });

  it("survives corrupt storage", () => {
    localStorage.setItem(REST_TIMER_KEY, "{not json");
    expect(loadRestTimerPrefs()).toEqual(DEFAULT_REST_TIMER);
    localStorage.setItem(REST_TIMER_KEY, '"on"');
    expect(loadRestTimerPrefs()).toEqual(DEFAULT_REST_TIMER);
    localStorage.setItem(REST_TIMER_KEY, '{"on":true,"seconds":"lots"}');
    expect(loadRestTimerPrefs()).toEqual({ on: true, seconds: 120 });
  });

  it("never throws when storage is unavailable", () => {
    expect(loadRestTimerPrefs(throwing)).toEqual(DEFAULT_REST_TIMER);
    expect(loadRestTimerPrefs(null)).toEqual(DEFAULT_REST_TIMER);
    expect(saveRestTimerPrefs({ on: true, seconds: 90 }, throwing)).toEqual({ on: true, seconds: 90 });
    expect(saveRestTimerPrefs({ on: true, seconds: 90 }, null)).toEqual({ on: true, seconds: 90 });
  });
});

describe("restTimerSummary", () => {
  it("says the setting in plain words", () => {
    expect(restTimerSummary({ on: false, seconds: 120 })).toBe("Off");
    expect(restTimerSummary({ on: true, seconds: 120 })).toBe("2:00 after each set");
    expect(restTimerSummary({ on: true, seconds: 105 })).toBe("1:45 after each set");
    expect(restTimerSummary({ on: true, seconds: 600 })).toBe("10:00 after each set");
  });
});

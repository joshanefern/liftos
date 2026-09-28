import { describe, expect, it } from "vitest";
import {
  currentSetOf,
  formatRestClock,
  hasOpenSet,
  openSetIds,
  pinAfterLogging,
  pinFor,
  progressLabel,
  resolveFocusId,
  rowStates,
  setOfLabel,
  setPosition,
  setSummary,
  setsProgress,
  settlePin,
  upNextOf,
  type FocusExercise,
  type FocusPin,
} from "./sessionFocus";

const set = (id: string, completed = false, isWarmup = false) => ({
  id,
  completed,
  ...(isWarmup ? { isWarmup: true } : {}),
});

/** `pattern` is one character per set: x = done, o = open, W = done
    warm-up, w = open warm-up. */
const exercise = (id: string, pattern: string): FocusExercise => ({
  id,
  name: id,
  sets: [...pattern].map((c, i) => set(`${id}-${i + 1}`, c === "x" || c === "W", c === "w" || c === "W")),
});

const workout = (...patterns: string[]): FocusExercise[] =>
  patterns.map((pattern, i) => exercise(`e${i + 1}`, pattern));

describe("currentSetOf", () => {
  it("points at the first open working set", () => {
    const current = currentSetOf(exercise("bench", "xoo"));
    expect(current?.set.id).toBe("bench-2");
    expect(current?.setIndex).toBe(1);
    expect(current?.ordinal).toBe(2);
    expect(current?.workingTotal).toBe(3);
  });

  it("skips warm-ups and leaves them out of the count", () => {
    const current = currentSetOf(exercise("squat", "wwoo"));
    expect(current?.set.id).toBe("squat-3");
    expect(current?.setIndex).toBe(2);
    expect(current?.ordinal).toBe(1);
    expect(current?.workingTotal).toBe(2);
  });

  it("returns to an earlier set that was un-completed", () => {
    expect(currentSetOf(exercise("bench", "oxo"))?.ordinal).toBe(1);
  });

  it("is null when every working set is done, open warm-ups or not", () => {
    expect(currentSetOf(exercise("bench", "xxx"))).toBeNull();
    expect(currentSetOf(exercise("bench", "wxx"))).toBeNull();
    expect(currentSetOf(exercise("bench", ""))).toBeNull();
  });
});

describe("setsProgress / hasOpenSet / openSetIds", () => {
  it("counts working sets only", () => {
    expect(setsProgress(exercise("a", "Wxoo"))).toEqual({ done: 1, total: 3, complete: false });
    expect(setsProgress(exercise("a", "wxx"))).toEqual({ done: 2, total: 2, complete: true });
  });

  it("never calls an exercise without working sets complete", () => {
    expect(setsProgress(exercise("a", "")).complete).toBe(false);
    expect(setsProgress(exercise("a", "W")).complete).toBe(false);
  });

  it("hasOpenSet ignores warm-ups", () => {
    expect(hasOpenSet(exercise("a", "wxx"))).toBe(false);
    expect(hasOpenSet(exercise("a", "Wxo"))).toBe(true);
  });

  it("openSetIds lists every unticked row, warm-ups included, in order", () => {
    expect(openSetIds(exercise("a", "wxoo"))).toEqual(["a-1", "a-3", "a-4"]);
    expect(openSetIds(exercise("a", "xx"))).toEqual([]);
  });
});

describe("rowStates", () => {
  it("marks exactly one current row", () => {
    expect(rowStates(exercise("a", "xoo"))).toEqual(["done", "current", "open"]);
  });

  it("keeps open warm-ups out of the current slot", () => {
    expect(rowStates(exercise("a", "wWoo"))).toEqual(["open", "done", "current", "open"]);
  });

  it("has no current row once the working sets are done", () => {
    expect(rowStates(exercise("a", "wxx"))).toEqual(["open", "done", "done"]);
  });
});

describe("resolveFocusId — no pin", () => {
  it("is the first exercise with an open working set", () => {
    expect(resolveFocusId(workout("ooo", "o", "o"), null)).toBe("e1");
    expect(resolveFocusId(workout("xxx", "o", "o"), null)).toBe("e2");
  });

  it("does not stop on an exercise whose only open rows are warm-ups", () => {
    expect(resolveFocusId(workout("wxx", "o"), null)).toBe("e2");
  });

  it("is null when everything is done or nothing is planned", () => {
    expect(resolveFocusId(workout("xx", "x"), null)).toBeNull();
    expect(resolveFocusId([], null)).toBeNull();
  });
});

describe("pins", () => {
  it("a manual pick wins over workout order", () => {
    const exercises = workout("ooo", "o", "o");
    const pin = pinFor(exercises, "e3");
    expect(pin).toEqual({ exerciseId: "e3", hadOpenSets: true });
    expect(resolveFocusId(exercises, pin)).toBe("e3");
  });

  it("sticks while the picked exercise still has work", () => {
    const pin: FocusPin = { exerciseId: "e2", hadOpenSets: true };
    const exercises = workout("ooo", "xo", "o");
    expect(settlePin(exercises, pin)).toBe(pin);
    expect(resolveFocusId(exercises, pin)).toBe("e2");
  });

  it("releases when the picked exercise is completed, back to the first open one", () => {
    const pin: FocusPin = { exerciseId: "e2", hadOpenSets: true };
    const exercises = workout("ooo", "xx", "o");
    expect(settlePin(exercises, pin)).toBeNull();
    expect(resolveFocusId(exercises, pin)).toBe("e1");
  });

  it("a pick on a finished exercise holds, so it can be reviewed", () => {
    const exercises = workout("xxx", "o");
    const pin = pinFor(exercises, "e1");
    expect(pin).toEqual({ exerciseId: "e1", hadOpenSets: false });
    expect(settlePin(exercises, pin)).toBe(pin);
    expect(resolveFocusId(exercises, pin)).toBe("e1");
  });

  it("a reviewed exercise that gets a set reopened behaves like any pick", () => {
    const review: FocusPin = { exerciseId: "e1", hadOpenSets: false };
    const reopened = settlePin(workout("xox", "o"), review);
    expect(reopened).toEqual({ exerciseId: "e1", hadOpenSets: true });
    // …and finishing it again hands the focus on.
    expect(settlePin(workout("xxx", "o"), reopened)).toBeNull();
  });

  it("drops a pin whose exercise no longer exists", () => {
    const pin: FocusPin = { exerciseId: "gone", hadOpenSets: true };
    const exercises = workout("oo");
    expect(pinFor(exercises, "gone")).toBeNull();
    expect(settlePin(exercises, pin)).toBeNull();
    expect(resolveFocusId(exercises, pin)).toBe("e1");
  });
});

describe("upNextOf", () => {
  it("is the focused exercise's current set", () => {
    const next = upNextOf(workout("xoo", "o"), null);
    expect(next?.exercise.id).toBe("e1");
    expect(next?.set.id).toBe("e1-2");
    expect(next?.ordinal).toBe(2);
    expect(next?.workingTotal).toBe(3);
  });

  it("moves to the next exercise after the last set", () => {
    const next = upNextOf(workout("xxx", "o", "o"), null);
    expect(next?.exercise.id).toBe("e2");
    expect(next?.ordinal).toBe(1);
    expect(next?.workingTotal).toBe(1);
  });

  it("follows a pick", () => {
    const next = upNextOf(workout("ooo", "o", "oo"), { exerciseId: "e3", hadOpenSets: true });
    expect(next?.exercise.id).toBe("e3");
  });

  it("looks past a finished exercise that is being reviewed", () => {
    const next = upNextOf(workout("xxx", "xo"), { exerciseId: "e1", hadOpenSets: false });
    expect(next?.exercise.id).toBe("e2");
    expect(next?.set.id).toBe("e2-2");
  });

  it("is null when the workout is done", () => {
    expect(upNextOf(workout("xx", "x"), null)).toBeNull();
    expect(upNextOf([], null)).toBeNull();
  });
});

describe("pinAfterLogging", () => {
  it("changes nothing while a working set is open anywhere", () => {
    const pin: FocusPin = { exerciseId: "e2", hadOpenSets: true };
    expect(pinAfterLogging(workout("xo", "x"), pin, "e2")).toBe(pin);
    expect(pinAfterLogging(workout("xo", "x"), null, "e1")).toBeNull();
    expect(pinAfterLogging(workout("xx", "xo"), null, "e1")).toBeNull();
  });

  it("stays on the exercise when its set was the last open one — log as you go", () => {
    // Quick start: one exercise, one set, just logged.
    const added: FocusPin = { exerciseId: "e1", hadOpenSets: true };
    expect(pinAfterLogging(workout("x"), added, "e1")).toEqual({
      exerciseId: "e1",
      hadOpenSets: false,
    });
  });

  it("stays on the last exercise of a planned workout", () => {
    expect(pinAfterLogging(workout("xxx", "xx"), null, "e2")).toEqual({
      exerciseId: "e2",
      hadOpenSets: false,
    });
  });

  it("keeps the card on that exercise through the settle that follows", () => {
    const exercises = workout("xxx", "xx");
    const pin = pinAfterLogging(exercises, null, "e2");
    expect(settlePin(exercises, pin)).toBe(pin);
    expect(resolveFocusId(exercises, pin)).toBe("e2");
  });

  it("the set added next is the current one, and logging it holds again", () => {
    const held = pinAfterLogging(workout("x"), null, "e1");
    const withSet = workout("xo");
    const working = settlePin(withSet, held);
    expect(working).toEqual({ exerciseId: "e1", hadOpenSets: true });
    expect(upNextOf(withSet, working)?.set.id).toBe("e1-2");
    const done = workout("xx");
    expect(pinAfterLogging(done, working, "e1")).toEqual({ exerciseId: "e1", hadOpenSets: false });
  });

  it("moves to the exercise just logged, away from one being looked over", () => {
    const reviewing: FocusPin = { exerciseId: "e1", hadOpenSets: false };
    expect(pinAfterLogging(workout("xx", "x"), reviewing, "e2")).toEqual({
      exerciseId: "e2",
      hadOpenSets: false,
    });
  });

  it("hands back the same pin when it already holds that exercise", () => {
    const held: FocusPin = { exerciseId: "e1", hadOpenSets: false };
    expect(pinAfterLogging(workout("xx"), held, "e1")).toBe(held);
  });

  it("ignores an exercise that is not in the workout", () => {
    expect(pinAfterLogging(workout("xx"), null, "gone")).toBeNull();
  });

  it("warm-ups left open do not count as work left", () => {
    expect(pinAfterLogging(workout("wx"), null, "e1")).toEqual({
      exerciseId: "e1",
      hadOpenSets: false,
    });
  });
});

describe("labels", () => {
  it("names the set position", () => {
    expect(setOfLabel(2, 3)).toBe("Set 2 of 3");
    expect(setPosition(2, 3)).toBe("set 2 of 3");
  });

  it("counts sets with the right plural", () => {
    expect(progressLabel({ done: 1, total: 3 })).toBe("1 of 3 sets");
    expect(progressLabel({ done: 0, total: 1 })).toBe("0 of 1 set");
    expect(progressLabel({ done: 0, total: 0 })).toBe("No sets");
  });

  it("formats the rest clock as m:ss", () => {
    expect(formatRestClock(120)).toBe("2:00");
    expect(formatRestClock(150)).toBe("2:30");
    expect(formatRestClock(9)).toBe("0:09");
    expect(formatRestClock(0)).toBe("0:00");
    expect(formatRestClock(-4)).toBe("0:00");
  });
});

describe("setSummary", () => {
  it("reads back a lift", () => {
    expect(setSummary({ reps: "8", weight: "135" }, "reps", "lb")).toBe("8 × 135 lb");
    expect(setSummary({ reps: "5", weight: "102.5" }, "reps", "kg")).toBe("5 × 102.5 kg");
  });

  it("reads back bodyweight reps", () => {
    expect(setSummary({ reps: "10", weight: "" }, "reps", "lb")).toBe("10 reps");
    expect(setSummary({ reps: "1", weight: "0" }, "reps", "lb")).toBe("1 rep");
  });

  it("reads back a weight logged without reps", () => {
    expect(setSummary({ reps: "", weight: "225" }, "reps", "lb")).toBe("225 lb");
  });

  it("reads back holds — bare digits are seconds", () => {
    expect(setSummary({ reps: "45", weight: "" }, "time", "lb")).toBe("45s");
    expect(setSummary({ reps: "1:30", weight: "25" }, "time", "lb")).toBe("1:30 at 25 lb");
  });

  it("reads back cardio — bare digits are minutes, the weight slot is distance", () => {
    expect(setSummary({ reps: "30", weight: "3.1" }, "cardio", "mi")).toBe("30 min · 3.1 mi");
    expect(setSummary({ reps: "30:30", weight: "" }, "cardio", "km")).toBe("30:30");
    expect(setSummary({ reps: "", weight: "5" }, "cardio", "km")).toBe("5 km");
  });

  it("says Done when a set was logged without numbers", () => {
    expect(setSummary({ reps: "", weight: "" }, "reps", "lb")).toBe("Done");
    expect(setSummary({ reps: "", weight: "" }, "time", "lb")).toBe("Done");
    expect(setSummary({ reps: "", weight: "" }, "cardio", "mi")).toBe("Done");
  });
});

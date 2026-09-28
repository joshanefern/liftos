import { describe, expect, it } from "vitest";
import { removableSetOf, removeSetLabel, withoutSet } from "./sessionSets";

/** One character per set: x = logged, o = open, W = logged warm-up,
    w = open warm-up. Ids are `${id}-${position}`. */
const exercise = (id: string, pattern: string) => ({
  id,
  name: id,
  sets: [...pattern].map((c, i) => ({
    id: `${id}-${i + 1}`,
    completed: c === "x" || c === "W",
    ...(c === "w" || c === "W" ? { isWarmup: true } : {}),
    reps: c === "x" ? "8" : "",
  })),
});

describe("removableSetOf", () => {
  it("is the last open set — the row Add set just made", () => {
    const target = removableSetOf(exercise("bench", "xxxo"));
    expect(target?.set.id).toBe("bench-4");
    expect(target?.ordinal).toBe(4);
  });

  it("with several open sets, the last one goes first", () => {
    expect(removableSetOf(exercise("bench", "xoo"))?.set.id).toBe("bench-3");
  });

  it("skips logged sets to reach an open one above them", () => {
    // Set 2 was marked not done; set 3 stays logged.
    const target = removableSetOf(exercise("bench", "xox"));
    expect(target?.set.id).toBe("bench-2");
    expect(target?.ordinal).toBe(2);
  });

  it("never offers a logged set", () => {
    expect(removableSetOf(exercise("bench", "xxx"))).toBeNull();
  });

  it("never offers an exercise's only working set", () => {
    expect(removableSetOf(exercise("plank", "o"))).toBeNull();
    expect(removableSetOf(exercise("squat", "WWo"))).toBeNull();
  });

  it("offers an open set when a logged working set would remain", () => {
    expect(removableSetOf(exercise("bench", "xo"))?.set.id).toBe("bench-2");
  });

  it("counts working sets only when it numbers the row", () => {
    const target = removableSetOf(exercise("squat", "WWxo"));
    expect(target?.set.id).toBe("squat-4");
    expect(target?.ordinal).toBe(2);
  });

  it("offers a skipped warm-up once the working sets are logged", () => {
    const target = removableSetOf(exercise("squat", "wxx"));
    expect(target?.set.id).toBe("squat-1");
    expect(target?.ordinal).toBeNull();
  });

  it("passes over the only working set to an open warm-up above it", () => {
    const target = removableSetOf(exercise("squat", "wwo"));
    expect(target?.set.id).toBe("squat-2");
    expect(target?.ordinal).toBeNull();
  });

  it("is null for an exercise with no sets", () => {
    expect(removableSetOf({ sets: [] })).toBeNull();
  });
});

describe("withoutSet", () => {
  it("takes the open set off and leaves every other row as it was", () => {
    const before = [exercise("bench", "xxxo"), exercise("row", "oo")];
    const after = withoutSet(before, "bench", "bench-4");
    expect(after[0].sets.map((s) => s.id)).toEqual(["bench-1", "bench-2", "bench-3"]);
    expect(after[0].sets[0]).toBe(before[0].sets[0]);
    expect(after[1]).toBe(before[1]);
  });

  it("refuses a logged set", () => {
    const before = [exercise("bench", "xxo")];
    expect(withoutSet(before, "bench", "bench-1")).toBe(before);
  });

  it("refuses the only working set, so an exercise is never left empty", () => {
    const single = [exercise("plank", "o")];
    expect(withoutSet(single, "plank", "plank-1")).toBe(single);
    const afterWarmups = [exercise("squat", "WWo")];
    expect(withoutSet(afterWarmups, "squat", "squat-3")).toBe(afterWarmups);
  });

  it("removes any open set, not only the last", () => {
    const after = withoutSet([exercise("bench", "xoo")], "bench", "bench-2");
    expect(after[0].sets.map((s) => s.id)).toEqual(["bench-1", "bench-3"]);
  });

  it("changes nothing for ids it does not know", () => {
    const before = [exercise("bench", "xo")];
    expect(withoutSet(before, "bench", "nope")).toBe(before);
    expect(withoutSet(before, "nope", "bench-2")).toBe(before);
  });

  it("removing down to one working set stops there", () => {
    let list = [exercise("bench", "ooo")];
    for (let i = 0; i < 5; i += 1) {
      const target = removableSetOf(list[0]);
      if (!target) break;
      list = withoutSet(list, "bench", target.set.id);
    }
    expect(list[0].sets.map((s) => s.id)).toEqual(["bench-1"]);
  });
});

describe("removeSetLabel", () => {
  it("names the set it takes off", () => {
    expect(removeSetLabel({ ordinal: 4 })).toBe("Remove set 4");
    expect(removeSetLabel({ ordinal: null })).toBe("Remove warm-up set");
  });
});

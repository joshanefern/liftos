import { describe, expect, it } from "vitest";
import { reuseRowIds } from "./voicePlanRows";

describe("reuseRowIds — rows stay put while the plan is re-interpreted live", () => {
  const prev = [
    { id: "a", name: "Bench Press" },
    { id: "b", name: "Incline Dumbbell Press" },
    { id: "c", name: "Bench Press" },
  ];
  it("keeps ids for same-named exercises, in order", () => {
    expect(reuseRowIds(prev, ["Bench Press", "Incline Dumbbell Press", "Bench Press"])).toEqual(["a", "b", "c"]);
  });
  it("matches loosely on case and punctuation", () => {
    expect(reuseRowIds(prev, ["bench press", "Incline Dumbbell-Press"])).toEqual(["a", "b"]);
  });
  it("a removed exercise's id is simply not reused", () => {
    expect(reuseRowIds(prev, ["Incline Dumbbell Press"])).toEqual(["b"]);
  });
  it("new or renamed exercises get null (a fresh id)", () => {
    expect(reuseRowIds(prev, ["Squat", "Bench Press", "Bench Press", "Bench Press"])).toEqual([null, "a", "c", null]);
  });
});

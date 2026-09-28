import { describe, expect, it } from "vitest";
import { libraryIsFull, templateLimitNotice } from "./templateLimit";

describe("libraryIsFull", () => {
  it("a library at the cap has no room for a new workout", () => {
    expect(libraryIsFull({ saved: 7, loading: false, max: 7 })).toBe(true);
  });

  it("a library over the cap has no room either", () => {
    expect(libraryIsFull({ saved: 9, loading: false, max: 7 })).toBe(true);
  });

  it("one under the cap still has room", () => {
    expect(libraryIsFull({ saved: 6, loading: false, max: 7 })).toBe(false);
  });

  it("an empty library has room", () => {
    expect(libraryIsFull({ saved: 0, loading: false, max: 7 })).toBe(false);
  });

  it("a library still loading is not called full — the count is not known yet", () => {
    expect(libraryIsFull({ saved: 0, loading: true, max: 7 })).toBe(false);
    expect(libraryIsFull({ saved: 7, loading: true, max: 7 })).toBe(false);
  });
});

describe("templateLimitNotice", () => {
  it("names the cap it was given, never a number of its own", () => {
    expect(templateLimitNotice(7).description).toBe(
      "You have 7 saved workouts — the max. Delete one in Workouts to make room.",
    );
    expect(templateLimitNotice(10).description).toContain("10 saved workouts");
  });

  it("says what happened in the title", () => {
    expect(templateLimitNotice(7).title).toBe("Workout limit reached");
  });

  it("never approximates", () => {
    const { title, description } = templateLimitNotice(7);
    expect(`${title} ${description}`).not.toContain("~");
  });
});

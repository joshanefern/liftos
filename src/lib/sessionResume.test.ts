import { describe, expect, it } from "vitest";
import { restoredRecentSetIds, restoredRest, restoredRestOwner } from "./sessionResume";

const NOW = 1_800_000_000_000;

describe("restoredRest", () => {
  it("brings back a rest that is still running", () => {
    const rest = { endsAt: NOW + 90_000, totalSeconds: 120 };
    expect(restoredRest(rest, NOW)).toEqual(rest);
  });

  it("keeps the extended length, so the ring fraction stays right", () => {
    // 2:00 rest, "+30 sec" tapped once, resumed with 2:20 left.
    expect(restoredRest({ endsAt: NOW + 140_000, totalSeconds: 150 }, NOW)).toEqual({
      endsAt: NOW + 140_000,
      totalSeconds: 150,
    });
  });

  it("drops a rest that ended while the lifter was away", () => {
    expect(restoredRest({ endsAt: NOW - 1, totalSeconds: 120 }, NOW)).toBeNull();
    expect(restoredRest({ endsAt: NOW, totalSeconds: 120 }, NOW)).toBeNull();
    expect(restoredRest({ endsAt: NOW - 600_000, totalSeconds: 120 }, NOW)).toBeNull();
  });

  it("drops a rest with more time left than its own length", () => {
    expect(restoredRest({ endsAt: NOW + 3_600_000, totalSeconds: 120 }, NOW)).toBeNull();
  });

  it("drops nothing-saved and malformed values", () => {
    expect(restoredRest(undefined, NOW)).toBeNull();
    expect(restoredRest(null, NOW)).toBeNull();
    expect(restoredRest("soon", NOW)).toBeNull();
    expect(restoredRest({}, NOW)).toBeNull();
    expect(restoredRest({ endsAt: NOW + 1000 }, NOW)).toBeNull();
    expect(restoredRest({ endsAt: "later", totalSeconds: 120 }, NOW)).toBeNull();
    expect(restoredRest({ endsAt: NOW + 1000, totalSeconds: 0 }, NOW)).toBeNull();
    expect(restoredRest({ endsAt: Number.NaN, totalSeconds: 120 }, NOW)).toBeNull();
  });

  it("returns only the two fields it checked", () => {
    const restored = restoredRest({ endsAt: NOW + 1000, totalSeconds: 120, extra: true }, NOW);
    expect(restored).toEqual({ endsAt: NOW + 1000, totalSeconds: 120 });
  });
});

describe("restoredRestOwner", () => {
  it("brings back which set started the rest", () => {
    const saved = { endsAt: NOW + 60_000, totalSeconds: 90, exerciseId: "e1", setId: "s2" };
    expect(restoredRestOwner(saved)).toEqual({ exerciseId: "e1", setId: "s2" });
    // The window itself is read as before — the owner rides alongside.
    expect(restoredRest(saved, NOW)).toEqual({ endsAt: NOW + 60_000, totalSeconds: 90 });
  });

  it("is null for a rest saved before rests had an owner", () => {
    expect(restoredRestOwner({ endsAt: NOW + 60_000, totalSeconds: 120 })).toBeNull();
  });

  it("drops malformed values", () => {
    expect(restoredRestOwner(undefined)).toBeNull();
    expect(restoredRestOwner(null)).toBeNull();
    expect(restoredRestOwner("e1")).toBeNull();
    expect(restoredRestOwner({ exerciseId: "e1" })).toBeNull();
    expect(restoredRestOwner({ exerciseId: "", setId: "s1" })).toBeNull();
    expect(restoredRestOwner({ exerciseId: "e1", setId: 2 })).toBeNull();
  });

  it("returns only the two fields it checked", () => {
    expect(restoredRestOwner({ exerciseId: "e1", setId: "s1", endsAt: 5 })).toEqual({
      exerciseId: "e1",
      setId: "s1",
    });
  });
});

describe("restoredRecentSetIds", () => {
  it("keeps the saved order, most recent first", () => {
    expect(restoredRecentSetIds(["s1", "s5"], 20)).toEqual(["s1", "s5"]);
  });

  it("is empty for progress saved before the list existed", () => {
    expect(restoredRecentSetIds(undefined, 20)).toEqual([]);
    expect(restoredRecentSetIds(null, 20)).toEqual([]);
    expect(restoredRecentSetIds("s1", 20)).toEqual([]);
    expect(restoredRecentSetIds({ 0: "s1" }, 20)).toEqual([]);
  });

  it("drops anything that is not a set id", () => {
    expect(restoredRecentSetIds(["s1", 7, null, "", { id: "s2" }, "s3"], 20)).toEqual(["s1", "s3"]);
  });

  it("stops at the cap", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `s${i}`);
    expect(restoredRecentSetIds(ids, 20)).toEqual(ids.slice(0, 20));
    expect(restoredRecentSetIds(ids, 0)).toEqual([]);
  });
});

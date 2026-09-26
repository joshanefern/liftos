import { describe, expect, it } from "vitest";
import { dictationVocabulary } from "./voiceVocabulary";

describe("dictationVocabulary", () => {
  it("puts the lifter's own names first, then the curated set, deduped and capped", () => {
    const v = dictationVocabulary([{ exercises: [{ name: "Zercher Squat" }, { name: "Bench Press" }] }]);
    expect(v[0]).toBe("zercher squat");
    expect(v.filter((s) => s === "bench press")).toHaveLength(1);
    expect(v).toContain("chest day");
    expect(v.length).toBeLessThanOrEqual(100);
  });
  it("never exceeds the plugin cap", () => {
    const many = [{ exercises: Array.from({ length: 200 }, (_, i) => ({ name: `Lift ${i}` })) }];
    expect(dictationVocabulary(many)).toHaveLength(100);
  });
});

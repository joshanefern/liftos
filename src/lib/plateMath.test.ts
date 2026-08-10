import { describe, expect, it } from "vitest";
import { formatPerSide, formatPlateMath, plateBreakdown } from "./plateMath";

describe("plateBreakdown", () => {
  it("loads 225 lb as 45+45 per side", () => {
    const r = plateBreakdown(225, { unit: "lb" });
    expect(r.perSide).toEqual([45, 45]);
    expect(r.total).toBe(225);
    expect(r.remainder).toBe(0);
    expect(r.barWeight).toBe(45);
  });

  it("loads 185 lb as 45+25 per side", () => {
    const r = plateBreakdown(185, { unit: "lb" });
    expect(r.perSide).toEqual([45, 25]);
    expect(r.total).toBe(185);
    expect(r.remainder).toBe(0);
  });

  it("loads 100 kg as 25+15 per side (greedy)", () => {
    const r = plateBreakdown(100, { unit: "kg" });
    expect(r.perSide).toEqual([25, 15]);
    expect(r.total).toBe(100);
    expect(r.remainder).toBe(0);
    expect(r.barWeight).toBe(20);
  });

  it("loads 100 kg as 25+10+5 per side when 15s are unavailable", () => {
    const r = plateBreakdown(100, { unit: "kg", availablePlates: [25, 20, 10, 5, 2.5, 1.25] });
    expect(r.perSide).toEqual([25, 10, 5]);
    expect(r.total).toBe(100);
    expect(r.remainder).toBe(0);
  });

  it("handles sub-bar targets with empty perSide", () => {
    const r = plateBreakdown(30, { unit: "lb" });
    expect(r.perSide).toEqual([]);
    expect(r.total).toBe(45);
    expect(r.remainder).toBe(-15);
  });

  it("rounds down non-loadable targets and reports the remainder", () => {
    const r = plateBreakdown(227, { unit: "lb" });
    expect(r.perSide).toEqual([45, 45]);
    expect(r.total).toBe(225);
    expect(r.remainder).toBe(2);
  });

  it("handles fractional kg plates without float drift", () => {
    const r = plateBreakdown(102.5, { unit: "kg" });
    expect(r.perSide).toEqual([25, 15, 1.25]);
    expect(r.total).toBe(102.5);
    expect(r.remainder).toBe(0);
  });

  it("returns a safe empty result for NaN and negative targets", () => {
    expect(plateBreakdown(NaN, { unit: "lb" })).toEqual({
      perSide: [],
      total: 0,
      remainder: 0,
      barWeight: 45,
    });
    expect(plateBreakdown(-50, { unit: "kg" })).toEqual({
      perSide: [],
      total: 0,
      remainder: 0,
      barWeight: 20,
    });
  });

  it("respects a custom bar weight and plate set", () => {
    const r = plateBreakdown(85, { unit: "lb", barWeight: 35, availablePlates: [25, 10] });
    expect(r.perSide).toEqual([25]);
    expect(r.total).toBe(85);
    expect(r.remainder).toBe(0);
    expect(r.barWeight).toBe(35);
  });

  it("ignores invalid entries in availablePlates", () => {
    const r = plateBreakdown(135, { unit: "lb", availablePlates: [45, -5, NaN, 0] });
    expect(r.perSide).toEqual([45]);
    expect(r.total).toBe(135);
  });
});

describe("formatPerSide", () => {
  it("joins plates with plus signs", () => {
    expect(formatPerSide([45, 25, 5])).toBe("45 + 25 + 5");
  });

  it("returns an empty string for no plates", () => {
    expect(formatPerSide([])).toBe("");
  });
});

describe("formatPlateMath", () => {
  it("formats an exact load", () => {
    expect(formatPlateMath(plateBreakdown(185, { unit: "lb" }))).toBe("45 + 25 per side");
  });

  it("notes the closest achievable total when off target", () => {
    expect(formatPlateMath(plateBreakdown(227, { unit: "lb" }))).toBe(
      "45 + 45 per side · closest: 225",
    );
  });

  it("formats bar-only results", () => {
    expect(formatPlateMath(plateBreakdown(45, { unit: "lb" }))).toBe("Bar only (45)");
    expect(formatPlateMath(plateBreakdown(30, { unit: "lb" }))).toBe("Bar only (45) · closest: 45");
  });

  it("returns a dash for empty results", () => {
    expect(formatPlateMath(plateBreakdown(NaN, { unit: "lb" }))).toBe("—");
  });
});

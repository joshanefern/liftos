import { describe, expect, it } from "vitest";
import {
  TRAINING_DAY_CHOICES,
  WEEKDAYS,
  exactTrainingDays,
  frequencyAnswer,
  leadingWeekday,
  spreadTrainingDays,
  trainingDaysPerWeek,
} from "./trainingDays";

describe("frequencyAnswer", () => {
  it("writes the stored text for an exact count", () => {
    expect(frequencyAnswer(4)).toBe("4 days");
    expect(frequencyAnswer(2)).toBe("2 days");
    expect(frequencyAnswer(1)).toBe("1 day");
  });

  it("every onboarding choice round-trips through both parsers", () => {
    for (const days of TRAINING_DAY_CHOICES) {
      const stored = frequencyAnswer(days);
      expect(exactTrainingDays(stored)).toBe(days);
      expect(trainingDaysPerWeek(stored)).toBe(days);
    }
  });
});

describe("exactTrainingDays", () => {
  it("reads a single number, with or without the unit", () => {
    expect(exactTrainingDays("4 days")).toBe(4);
    expect(exactTrainingDays("1 day")).toBe(1);
    expect(exactTrainingDays("4")).toBe(4);
    expect(exactTrainingDays(" 6 Days ")).toBe(6);
    expect(exactTrainingDays("7 days")).toBe(7);
  });

  it("is null for a legacy range — no exact count was ever given", () => {
    expect(exactTrainingDays("1–2 days")).toBeNull();
    expect(exactTrainingDays("3–4 days")).toBeNull();
    expect(exactTrainingDays("5–6 days")).toBeNull();
    expect(exactTrainingDays("3-4 days")).toBeNull();
  });

  it("is null when missing or unusable, and caps at seven", () => {
    expect(exactTrainingDays(null)).toBeNull();
    expect(exactTrainingDays(undefined)).toBeNull();
    expect(exactTrainingDays("")).toBeNull();
    expect(exactTrainingDays("whenever")).toBeNull();
    expect(exactTrainingDays("0 days")).toBeNull();
    expect(exactTrainingDays("10 days")).toBe(7);
  });
});

describe("trainingDaysPerWeek", () => {
  it("reads an exact answer as itself", () => {
    expect(trainingDaysPerWeek("2 days")).toBe(2);
    expect(trainingDaysPerWeek("4 days")).toBe(4);
    expect(trainingDaysPerWeek("6 days")).toBe(6);
    expect(trainingDaysPerWeek("4")).toBe(4);
  });

  it("reads a legacy range at its low end", () => {
    expect(trainingDaysPerWeek("1–2 days")).toBe(1);
    expect(trainingDaysPerWeek("3–4 days")).toBe(3);
    expect(trainingDaysPerWeek("5–6 days")).toBe(5);
    expect(trainingDaysPerWeek("7 days")).toBe(7);
  });

  it("is null when missing or unusable, and caps at seven", () => {
    expect(trainingDaysPerWeek(null)).toBeNull();
    expect(trainingDaysPerWeek(undefined)).toBeNull();
    expect(trainingDaysPerWeek("")).toBeNull();
    expect(trainingDaysPerWeek("whenever")).toBeNull();
    expect(trainingDaysPerWeek("0 days")).toBeNull();
    expect(trainingDaysPerWeek("10 days")).toBe(7);
  });
});

describe("spreadTrainingDays", () => {
  it("spreads each count across the week", () => {
    expect(spreadTrainingDays(1)).toEqual(["Monday"]);
    expect(spreadTrainingDays(2)).toEqual(["Monday", "Thursday"]);
    expect(spreadTrainingDays(3)).toEqual(["Monday", "Wednesday", "Friday"]);
    expect(spreadTrainingDays(4)).toEqual(["Monday", "Tuesday", "Thursday", "Friday"]);
    expect(spreadTrainingDays(5)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Friday",
      "Saturday",
    ]);
    expect(spreadTrainingDays(6)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
    expect(spreadTrainingDays(7)).toEqual([...WEEKDAYS]);
  });

  it("returns exactly N distinct days in week order", () => {
    for (let n = 1; n <= 7; n += 1) {
      const days = spreadTrainingDays(n);
      expect(days).toHaveLength(n);
      expect(new Set(days).size).toBe(n);
      const positions = days.map((d) => WEEKDAYS.indexOf(d));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it("never runs more than three days in a row while a rest day can break it up", () => {
    for (let n = 1; n <= 5; n += 1) {
      const positions = spreadTrainingDays(n).map((d) => WEEKDAYS.indexOf(d));
      let run = 1;
      let longest = 1;
      for (let i = 1; i < positions.length; i += 1) {
        run = positions[i] === positions[i - 1] + 1 ? run + 1 : 1;
        longest = Math.max(longest, run);
      }
      expect(longest).toBeLessThanOrEqual(3);
    }
  });

  it("is empty without a usable count, and clamps the rest", () => {
    expect(spreadTrainingDays(null)).toEqual([]);
    expect(spreadTrainingDays(undefined)).toEqual([]);
    expect(spreadTrainingDays(0)).toEqual([]);
    expect(spreadTrainingDays(-2)).toEqual([]);
    expect(spreadTrainingDays(Number.NaN)).toEqual([]);
    expect(spreadTrainingDays(9)).toEqual([...WEEKDAYS]);
    expect(spreadTrainingDays(3.7)).toEqual(["Monday", "Wednesday", "Friday"]);
  });

  it("hands back a fresh array the caller may change", () => {
    const first = spreadTrainingDays(3);
    first.push("Sunday");
    expect(spreadTrainingDays(3)).toEqual(["Monday", "Wednesday", "Friday"]);
  });

  it("a legacy range preselects its low end", () => {
    expect(spreadTrainingDays(trainingDaysPerWeek("3–4 days"))).toEqual([
      "Monday",
      "Wednesday",
      "Friday",
    ]);
    expect(spreadTrainingDays(trainingDaysPerWeek("5–6 days"))).toHaveLength(5);
    expect(spreadTrainingDays(trainingDaysPerWeek("1–2 days"))).toEqual(["Monday"]);
  });
});

describe("leadingWeekday", () => {
  it("reads the day the plan sheet puts first in a title", () => {
    expect(leadingWeekday("Monday · Push")).toBe("Monday");
    expect(leadingWeekday("Sunday · Full body")).toBe("Sunday");
    for (const day of WEEKDAYS) expect(leadingWeekday(`${day} · Legs`)).toBe(day);
  });

  it("reads it however the coach punctuated or cased the title", () => {
    expect(leadingWeekday("Thursday - Upper")).toBe("Thursday");
    expect(leadingWeekday("friday: legs")).toBe("Friday");
    expect(leadingWeekday("  WEDNESDAY — Pull")).toBe("Wednesday");
    expect(leadingWeekday("Tuesday")).toBe("Tuesday");
  });

  it("is null when the title opens with anything else", () => {
    expect(leadingWeekday("Push Day")).toBeNull();
    expect(leadingWeekday("Upper A")).toBeNull();
    expect(leadingWeekday("Heavy Monday")).toBeNull();
    expect(leadingWeekday("Mondays")).toBeNull();
    expect(leadingWeekday("Sun salutations")).toBeNull();
    expect(leadingWeekday("")).toBeNull();
  });
});

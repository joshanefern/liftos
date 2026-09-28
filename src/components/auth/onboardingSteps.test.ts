import { describe, expect, it } from "vitest";
import { exactTrainingDays, spreadTrainingDays, trainingDaysPerWeek } from "@/lib/trainingDays";
import { plannedSessionsPerWeek } from "@/lib/workoutStats";
import {
  EMPTY_ANSWERS,
  ONBOARDING_STEPS,
  OPTION_CAPTIONS,
  buildProfileRow,
} from "./onboardingSteps";

const step = (key: string) => {
  const found = ONBOARDING_STEPS.find((s) => s.key === key);
  if (!found) throw new Error(`no ${key} step`);
  return found;
};

describe("frequency step", () => {
  it("offers exact day counts, never a range", () => {
    expect(step("frequency").options).toEqual(["2 days", "3 days", "4 days", "5 days", "6 days"]);
    for (const option of step("frequency").options) {
      expect(option).not.toMatch(/[–-]/);
      expect(exactTrainingDays(option)).not.toBeNull();
    }
  });

  it("every choice reads back as the same number everywhere it is used", () => {
    step("frequency").options.forEach((option, i) => {
      const days = i + 2;
      expect(trainingDaysPerWeek(option)).toBe(days);
      expect(plannedSessionsPerWeek(option)).toBe(days);
      expect(spreadTrainingDays(trainingDaysPerWeek(option))).toHaveLength(days);
    });
  });

  it("carries no captions, and none are left over from the old ranges", () => {
    for (const option of step("frequency").options) {
      expect(OPTION_CAPTIONS[option]).toBeUndefined();
    }
    for (const legacy of ["1–2 days", "3–4 days", "5–6 days", "7 days"]) {
      expect(OPTION_CAPTIONS[legacy]).toBeUndefined();
    }
  });

  it("is no taller than the tallest step, so it never sets the card's height", () => {
    const tallest = Math.max(...ONBOARDING_STEPS.map((s) => s.options.length));
    expect(step("frequency").options.length).toBeLessThanOrEqual(tallest);
    expect(tallest).toBe(step("goal").options.length);
  });
});

describe("buildProfileRow", () => {
  it("saves frequency as the exact text that was chosen", () => {
    const row = buildProfileRow("user-1", {
      goal: ["Hypertrophy", "Strength"],
      experience: "Intermediate",
      equipment: "Full gym",
      frequency: "4 days",
      split: "Upper Lower",
      units: "lb",
    });
    expect(row).toEqual({
      id: "user-1",
      goal: "Hypertrophy, Strength",
      experience: "Intermediate",
      equipment: "Full gym",
      frequency: "4 days",
      split: "Upper Lower",
      units: "lb",
    });
    expect(typeof row.frequency).toBe("string");
  });

  it("joins one goal without a separator and keeps every column a string", () => {
    const row = buildProfileRow("user-2", { ...EMPTY_ANSWERS, goal: ["Fat Loss"], frequency: "2 days" });
    expect(row.goal).toBe("Fat Loss");
    expect(row.frequency).toBe("2 days");
    for (const value of Object.values(row)) expect(typeof value).toBe("string");
  });
});

describe("steps", () => {
  it("has one step per saved answer, in the order they are asked", () => {
    expect(ONBOARDING_STEPS.map((s) => s.key)).toEqual([
      "goal",
      "experience",
      "equipment",
      "frequency",
      "split",
      "units",
    ]);
    expect(Object.keys(EMPTY_ANSWERS).sort()).toEqual(
      ONBOARDING_STEPS.map((s) => s.key).sort(),
    );
  });

  it("only the goal step takes more than one answer", () => {
    expect(ONBOARDING_STEPS.filter((s) => s.multi).map((s) => s.key)).toEqual(["goal"]);
  });
});

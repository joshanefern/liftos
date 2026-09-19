import { describe, expect, it } from "vitest";
import type { VoiceIntent } from "@/lib/voiceApply";
import { foldUnilateralSets, mentionsUnilateral, spokenSetCount } from "./voiceUnilateral";

const intent = (sets: { reps?: number; weight?: number }[]): VoiceIntent => ({
  kind: "sets",
  actions: [{ exercise: "Bicep Curl", isNew: false, sets }],
  confidence: 0.9,
});

describe("unilateral guard — the owner's exact case", () => {
  it("'1 set of bicep curls on each arm' doubled by the model folds back to 1", () => {
    const t = "I did 1 set of bicep curls, 25 pounds for 10, on each arm";
    const out = foldUnilateralSets(intent([{ reps: 10, weight: 25 }, { reps: 10, weight: 25 }]), t);
    expect(out.actions?.[0].sets).toHaveLength(1);
  });

  it("'3 sets of single leg leg extension' doubled to 6 folds back to 3", () => {
    const t = "three sets of single leg leg extension at 60 for 12";
    const six = Array.from({ length: 6 }, () => ({ reps: 12, weight: 60 }));
    expect(foldUnilateralSets(intent(six), t).actions?.[0].sets).toHaveLength(3);
  });

  it("leaves a correct count alone", () => {
    const t = "3 sets of single leg leg extension";
    const three = Array.from({ length: 3 }, () => ({ reps: 12, weight: 60 }));
    expect(foldUnilateralSets(intent(three), t).actions?.[0].sets).toHaveLength(3);
  });

  it("never folds without a unilateral qualifier", () => {
    const t = "2 sets of curls at 25 for 10";
    const four = Array.from({ length: 4 }, () => ({ reps: 10, weight: 25 }));
    expect(foldUnilateralSets(intent(four), t).actions?.[0].sets).toHaveLength(4);
  });

  it("never folds when the halves differ (a genuine 2N report)", () => {
    const t = "2 sets each arm";
    const sets = [{ reps: 10, weight: 25 }, { reps: 10, weight: 25 }, { reps: 8, weight: 30 }, { reps: 8, weight: 30 }];
    expect(foldUnilateralSets(intent(sets), t).actions?.[0].sets).toHaveLength(4);
  });

  it("never folds when no set count was spoken", () => {
    const t = "curls on each arm, 25 for 10";
    expect(foldUnilateralSets(intent([{ reps: 10, weight: 25 }, { reps: 10, weight: 25 }]), t).actions?.[0].sets).toHaveLength(2);
  });
});

describe("helpers", () => {
  it("reads spoken set counts", () => {
    expect(spokenSetCount("I did 1 set of curls")).toBe(1);
    expect(spokenSetCount("three sets of squats")).toBe(3);
    expect(spokenSetCount("did a set of rows")).toBe(1);
    expect(spokenSetCount("bench press 135 for 8")).toBeNull();
  });
  it("recognises unilateral wording", () => {
    for (const t of ["on each arm", "per side", "single-leg extension", "one arm rows", "alternating curls", "both legs"]) {
      expect(mentionsUnilateral(t)).toBe(true);
    }
    expect(mentionsUnilateral("bench press for 8")).toBe(false);
  });
});

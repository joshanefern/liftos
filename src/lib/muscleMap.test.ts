import { describe, expect, it } from "vitest";
import { lookupMuscles } from "./muscleMap";

/* The map must never stay gray for a real exercise — especially ones named
   after the muscle itself ("biceps", "forearms", "back"), which is exactly
   how review imports and casual loggers name things. */

describe("lookupMuscles — muscle-name fallbacks", () => {
  it("maps bare muscle names", () => {
    expect(lookupMuscles("biceps")!.primary).toContain("biceps");
    expect(lookupMuscles("Bicep")!.primary).toContain("biceps");
    expect(lookupMuscles("forearms")!.primary).toContain("forearm");
    expect(lookupMuscles("back")!.primary).toContain("upper-back");
    expect(lookupMuscles("lower back")!.primary).toContain("lower-back");
    expect(lookupMuscles("shoulders")!.primary).toContain("front-deltoids");
    expect(lookupMuscles("quads")!.primary).toContain("quadriceps");
    expect(lookupMuscles("glutes")!.primary).toContain("gluteal");
    expect(lookupMuscles("core")!.primary).toContain("abs");
    expect(lookupMuscles("Leg Day")!.primary).toEqual(
      expect.arrayContaining(["quadriceps", "hamstring", "gluteal"]),
    );
    expect(lookupMuscles("arms")!.primary).toEqual(
      expect.arrayContaining(["biceps", "triceps"]),
    );
  });

  it("movement rules still win over name fallbacks", () => {
    // "hack squat" must never hit \bback\b; "back squat" is a squat.
    expect(lookupMuscles("hack squat")!.primary).toContain("quadriceps");
    expect(lookupMuscles("back squat")!.primary).toContain("quadriceps");
    expect(lookupMuscles("chest press machine")!.primary).toContain("chest");
    expect(lookupMuscles("bicep curls")!.primary).toContain("biceps");
  });

  it("new movement rules", () => {
    expect(lookupMuscles("wrist curl")!.primary).toContain("forearm");
    expect(lookupMuscles("farmer carry")!.primary).toEqual(
      expect.arrayContaining(["forearm", "trapezius"]),
    );
    expect(lookupMuscles("dead hang")!.primary).toContain("forearm");
    expect(lookupMuscles("back extension")!.primary).toContain("lower-back");
    expect(lookupMuscles("hip abduction")!.primary).toContain("abductors");
    expect(lookupMuscles("upright row")!.primary).toContain("trapezius");
  });

  it("a hang clean is not a grip exercise", () => {
    const mapping = lookupMuscles("hang clean");
    expect(mapping?.primary ?? []).not.toContain("forearm");
  });
});

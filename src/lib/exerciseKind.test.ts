import { describe, expect, it } from "vitest";
import { inferKind } from "./exerciseTracking";

describe("inferKind — cardio by name", () => {
  it.each([
    "Treadmill", "Treadmill run", "Running", "Jog", "Bike", "Cycling", "Peloton ride",
    "Rowing machine", "Rower", "Elliptical", "Stairmaster", "Stair climber", "Walk",
    "Incline walk", "Swimming", "Jump rope", "HIIT", "Assault bike", "Ski erg", "Battle ropes",
  ])("%s → cardio", (name) => {
    expect(inferKind(name)).toBe("cardio");
  });

  it.each([
    "Barbell Row", "Seated Row", "Pendlay Row", "Farmer's Walk", "Walking Lunge",
    "Sled Push", "Bench Press", "Goblet Squat", "Plank", "Suitcase Carry", "",
  ])("%s → weighted", (name) => {
    expect(inferKind(name)).toBe("weighted");
  });
});

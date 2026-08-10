import { describe, expect, it } from "vitest";
import { lookupMuscles, type Muscle } from "@/lib/muscleMap";
import { getStarterProgram, starterPrograms } from "./starterPrograms";

describe("starterPrograms — muscle map coverage", () => {
  it("every exercise name resolves to at least one primary muscle", () => {
    for (const program of starterPrograms) {
      for (const exercise of program.exercises) {
        const mapping = lookupMuscles(exercise.name);
        expect(mapping, `"${exercise.name}" (${program.id}) has no muscle mapping`).not.toBeNull();
        expect(
          mapping!.primary.length,
          `"${exercise.name}" (${program.id}) has no primary muscles`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("starterPrograms — template compatibility", () => {
  it("offers the promised program families", () => {
    const splits = new Set(starterPrograms.map((p) => p.split));
    expect(splits).toEqual(new Set(["Full Body", "Push / Pull / Legs", "Upper / Lower"]));
    expect(starterPrograms.filter((p) => p.split === "Push / Pull / Legs")).toHaveLength(3);
    expect(starterPrograms.filter((p) => p.split === "Upper / Lower")).toHaveLength(2);
  });

  it("program, exercise, and set ids are globally unique", () => {
    const ids = starterPrograms.flatMap((p) => [
      p.id,
      ...p.exercises.flatMap((e) => [e.id, ...e.sets.map((s) => s.id)]),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each exercise has 3-5 sets with realistic reps and no preset weight", () => {
    for (const program of starterPrograms) {
      for (const exercise of program.exercises) {
        expect(exercise.sets.length).toBeGreaterThanOrEqual(3);
        expect(exercise.sets.length).toBeLessThanOrEqual(5);
        for (const set of exercise.sets) {
          expect(set.reps).toBeGreaterThan(0);
          expect(set.reps).toBeLessThanOrEqual(20);
          expect(set.weight).toBeUndefined();
        }
      }
    }
  });

  it("carries the card metadata the Workouts page expects", () => {
    for (const program of starterPrograms) {
      expect(program.name.length).toBeGreaterThan(0);
      expect(program.focus.length).toBeGreaterThan(0);
      expect(program.description.length).toBeGreaterThan(0);
      expect(program.duration).toBeGreaterThan(0);
      expect(["Moderate", "Hard", "Very Hard"]).toContain(program.difficulty);
    }
  });
});

describe("starterPrograms — equipment tags", () => {
  it("every program carries a valid equipment tag", () => {
    for (const program of starterPrograms) {
      expect(["none", "dumbbells", "gym"], `${program.id} equipment`).toContain(program.equipment);
    }
  });

  it("Bodyweight Foundations is the no-equipment program", () => {
    const noneTagged = starterPrograms.filter((p) => p.equipment === "none");
    expect(noneTagged.map((p) => p.id)).toEqual(["bodyweight-foundations"]);
  });
});

describe("starterPrograms — Bodyweight Foundations", () => {
  const program = getStarterProgram("bodyweight-foundations")!;

  it("is a Full Body program so rule f's name/split match can find it", () => {
    expect(`${program.name} ${program.split}`.toLowerCase()).toContain("full body");
  });

  it("every exercise is bodyweight-kind (no weights to fill in)", () => {
    for (const exercise of program.exercises) {
      expect(exercise.kind, exercise.name).toBe("bodyweight");
    }
  });

  it("covers at least 5 distinct primary muscles across the body", () => {
    const primaries = new Set<Muscle>(
      program.exercises.flatMap((e) => lookupMuscles(e.name)?.primary ?? []),
    );
    expect(primaries.size).toBeGreaterThanOrEqual(5);
    // Top and bottom of the body map both light up on day one.
    const expected: Muscle[] = [
      "chest",
      "quadriceps",
      "gluteal",
      "front-deltoids",
      "lower-back",
      "abs",
    ];
    for (const muscle of expected) {
      expect(primaries.has(muscle), `${muscle} should be a primary mover`).toBe(true);
    }
  });
});

describe("getStarterProgram", () => {
  it("returns the program for a known id", () => {
    expect(getStarterProgram("barbell-5x5")?.name).toBe("Barbell 5×5");
  });

  it("returns undefined for an unknown id", () => {
    expect(getStarterProgram("nope")).toBeUndefined();
  });
});

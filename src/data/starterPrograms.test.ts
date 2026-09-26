import { describe, expect, it } from "vitest";
import { lookupMuscles, type Muscle } from "@/lib/muscleMap";
import {
  STARTER_DURATION_BUCKETS,
  STARTER_EQUIPMENT_OPTIONS,
  equipmentFromProfile,
  getStarterProgram,
  recommendedStarter,
  starterDurationBucket,
  starterPrograms,
  starterRunsOn,
  starterSetsLabel,
} from "./starterPrograms";

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

  it("every program's tag has a filter chip label", () => {
    const labelled = new Set(STARTER_EQUIPMENT_OPTIONS.map((o) => o.id));
    for (const program of starterPrograms) {
      expect(labelled.has(program.equipment), `${program.id} has no chip`).toBe(true);
    }
  });
});

describe("starterPrograms — library filters", () => {
  const bodyweight = getStarterProgram("bodyweight-foundations")!;
  const gym = getStarterProgram("barbell-5x5")!;

  it("a program runs on anything at or above its equipment tier", () => {
    expect(starterRunsOn(bodyweight, "none")).toBe(true);
    expect(starterRunsOn(bodyweight, "dumbbells")).toBe(true);
    expect(starterRunsOn(bodyweight, "gym")).toBe(true);
    expect(starterRunsOn(gym, "none")).toBe(false);
    expect(starterRunsOn(gym, "dumbbells")).toBe(false);
    expect(starterRunsOn(gym, "gym")).toBe(true);
  });

  it("no equipment chip ever shows an empty list", () => {
    for (const option of STARTER_EQUIPMENT_OPTIONS) {
      expect(starterPrograms.some((p) => starterRunsOn(p, option.id)), option.label).toBe(true);
    }
  });

  it("reads onboarding's equipment answer the way the engine does", () => {
    expect(equipmentFromProfile("None")).toBe("none");
    expect(equipmentFromProfile(" none ")).toBe("none");
    expect(equipmentFromProfile("Dumbbells only")).toBe("dumbbells");
    expect(equipmentFromProfile("Full gym")).toBeNull();
    expect(equipmentFromProfile("Home gym")).toBeNull();
    expect(equipmentFromProfile(null)).toBeNull();
    expect(equipmentFromProfile(undefined)).toBeNull();
  });

  it("buckets durations: ≤30 caps, 60+ floors, the middle rounds to the nearer chip", () => {
    expect(starterDurationBucket(20)).toBe("30");
    expect(starterDurationBucket(30)).toBe("30");
    expect(starterDurationBucket(31)).toBe("45");
    expect(starterDurationBucket(40)).toBe("45");
    expect(starterDurationBucket(45)).toBe("45");
    expect(starterDurationBucket(50)).toBe("45");
    expect(starterDurationBucket(55)).toBe("60");
    expect(starterDurationBucket(60)).toBe("60");
    expect(starterDurationBucket(90)).toBe("60");
  });

  it("every shipped duration lands on a chip, and every chip has a program", () => {
    const chips = new Set(STARTER_DURATION_BUCKETS.map((b) => b.id));
    for (const program of starterPrograms) {
      expect(chips.has(starterDurationBucket(program.duration)), program.id).toBe(true);
    }
    for (const chip of STARTER_DURATION_BUCKETS) {
      expect(
        starterPrograms.some((p) => starterDurationBucket(p.duration) === chip.id),
        chip.label,
      ).toBe(true);
    }
  });
});

describe("recommendedStarter", () => {
  it("the engine's starter pick wins outright", () => {
    expect(recommendedStarter(starterPrograms, "ppl-legs", { split: "Full Body", equipment: "None" })?.id).toBe(
      "ppl-legs",
    );
  });

  it("with no starter pick, the first program in the declared split is recommended", () => {
    expect(recommendedStarter(starterPrograms, null, { split: "Push Pull Legs" })?.id).toBe("ppl-push");
    expect(recommendedStarter(starterPrograms, null, { split: "Upper / Lower" })?.id).toBe("upper-lower-upper");
    expect(recommendedStarter(starterPrograms, null, { split: "Push / Pull / Legs" })?.id).toBe("ppl-push");
  });

  it("an unknown pick id falls back the same way", () => {
    expect(recommendedStarter(starterPrograms, "deleted-template-id", { split: "Upper Lower" })?.id).toBe(
      "upper-lower-upper",
    );
  });

  it("never recommends a gym program to a bodyweight-only lifter", () => {
    expect(recommendedStarter(starterPrograms, null, { split: "Push Pull Legs", equipment: "None" })?.id).toBe(
      "bodyweight-foundations",
    );
    expect(recommendedStarter(starterPrograms, null, { equipment: "Dumbbells only" })?.id).toBe(
      "bodyweight-foundations",
    );
  });

  it("no split, no pick → the first program", () => {
    expect(recommendedStarter(starterPrograms, null, null)?.id).toBe(starterPrograms[0].id);
    expect(recommendedStarter(starterPrograms, null, { split: "Not Sure / Other" })?.id).toBe(
      starterPrograms[0].id,
    );
  });

  it("returns undefined only when nothing ships", () => {
    expect(recommendedStarter([], null, null)).toBeUndefined();
  });
});

describe("starterSetsLabel", () => {
  it("reads sets × reps for lifts", () => {
    const squat = getStarterProgram("barbell-5x5")!.exercises[0];
    expect(starterSetsLabel(squat)).toBe("5 × 5");
  });

  it("reads minutes for a timed block", () => {
    expect(
      starterSetsLabel({
        id: "x",
        name: "Bike",
        category: "Cardio",
        target: "",
        sets: [{ id: "x-1", reps: 0, duration_seconds: 1200 }],
      }),
    ).toBe("20 min");
  });

  it("reads a set count when reps are left open", () => {
    expect(
      starterSetsLabel({ id: "y", name: "Row", category: "Back", target: "", sets: [{ id: "y-1" }, { id: "y-2" }, { id: "y-3" }] }),
    ).toBe("3 sets");
    expect(starterSetsLabel({ id: "z", name: "Row", category: "Back", target: "", sets: [{ id: "z-1" }] })).toBe("1 set");
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

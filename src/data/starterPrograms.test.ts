import { describe, expect, it } from "vitest";
import { lookupMuscles, type Muscle } from "@/lib/muscleMap";
import {
  STARTER_ANY_DURATION,
  STARTER_DURATION_CAPS,
  STARTER_EQUIPMENT_OPTIONS,
  equipmentFromProfile,
  getStarterProgram,
  recommendedStarter,
  starterFitsIn,
  starterPrograms,
  starterRunsOn,
  starterSetsLabel,
  type StarterDurationCap,
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
});

describe("starterPrograms — time filter", () => {
  const shownBy = (cap: StarterDurationCap | null): string[] =>
    starterPrograms.filter((p) => starterFitsIn(p, cap)).map((p) => p.id);

  it("a chip is a ceiling: the workout fits when it takes no longer", () => {
    expect(starterFitsIn({ duration: 20 }, 30)).toBe(true);
    expect(starterFitsIn({ duration: 30 }, 30)).toBe(true);
    expect(starterFitsIn({ duration: 31 }, 30)).toBe(false);
    expect(starterFitsIn({ duration: 40 }, 45)).toBe(true);
    expect(starterFitsIn({ duration: 45 }, 45)).toBe(true);
    expect(starterFitsIn({ duration: 50 }, 45)).toBe(false);
    expect(starterFitsIn({ duration: 55 }, 60)).toBe(true);
    expect(starterFitsIn({ duration: 60 }, 60)).toBe(true);
    expect(starterFitsIn({ duration: 61 }, 60)).toBe(false);
  });

  it("“Any” hides nothing, however long the workout", () => {
    expect(starterFitsIn({ duration: 5 }, null)).toBe(true);
    expect(starterFitsIn({ duration: 180 }, null)).toBe(true);
    expect(shownBy(null)).toEqual(starterPrograms.map((p) => p.id));
  });

  it("each chip returns exactly the workouts that fit", () => {
    expect(shownBy(30)).toEqual(["bodyweight-foundations"]);
    expect(shownBy(45)).toEqual(["full-body-foundations", "bodyweight-foundations", "barbell-5x5"]);
    expect(shownBy(60)).toEqual(starterPrograms.map((p) => p.id));
  });

  it("a longer chip never hides what a shorter one showed", () => {
    const caps = STARTER_DURATION_CAPS.map((chip) => chip.id);
    expect(caps).toEqual([...caps].sort((a, b) => a - b));
    for (let i = 1; i < caps.length; i += 1) {
      const longer = new Set(shownBy(caps[i]));
      for (const id of shownBy(caps[i - 1])) {
        expect(longer.has(id), `${id} missing from “up to ${caps[i]}”`).toBe(true);
      }
    }
  });

  it("no chip shows an empty list, and every workout is behind at least one chip", () => {
    for (const chip of STARTER_DURATION_CAPS) {
      expect(shownBy(chip.id).length, chip.label).toBeGreaterThan(0);
    }
    const reachable = new Set([null, ...STARTER_DURATION_CAPS.map((chip) => chip.id)].flatMap(shownBy));
    for (const program of starterPrograms) {
      expect(reachable.has(program.id), program.id).toBe(true);
    }
  });

  it("the 40- and 55-minute workouts each have an unambiguous chip", () => {
    expect(getStarterProgram("barbell-5x5")!.duration).toBe(40);
    expect(shownBy(30)).not.toContain("barbell-5x5");
    expect(shownBy(45)).toContain("barbell-5x5");
    expect(getStarterProgram("ppl-push")!.duration).toBe(55);
    expect(shownBy(45)).not.toContain("ppl-push");
    expect(shownBy(60)).toContain("ppl-push");
  });

  it("chips read “Up to N”, carry a spoken unit, and never a “~”", () => {
    for (const chip of STARTER_DURATION_CAPS) {
      expect(chip.label).toBe(`Up to ${chip.id}`);
      expect(chip.spoken).toBe(`Up to ${chip.id} minutes`);
    }
    expect(STARTER_ANY_DURATION.label).toBe("Any");
    const copy = [...STARTER_DURATION_CAPS.flatMap((c) => [c.label, c.spoken]), ...Object.values(STARTER_ANY_DURATION)];
    for (const text of copy) expect(text).not.toMatch(/[~≤+]/);
  });
});

describe("starterPrograms — vocabulary", () => {
  it("a single session is never called a program in what the lifter reads", () => {
    for (const program of starterPrograms) {
      for (const text of [program.name, program.focus, program.description]) {
        expect(text, `${program.id}: “${text}”`).not.toMatch(/program/i);
      }
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

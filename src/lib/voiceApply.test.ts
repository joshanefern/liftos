import { describe, expect, it } from "vitest";
import {
  applyVoiceIntent,
  type VoiceIntent,
  type VoiceLoggedExercise,
} from "./voiceApply";

const set = (over: Partial<VoiceLoggedExercise["sets"][number]> = {}) => ({
  id: `s-${Math.random().toString(36).slice(2)}`,
  reps: "",
  weight: "",
  completed: false,
  targetReps: 8 as number | null,
  targetTime: null,
  targetWeight: 185 as number | null,
  ...over,
});

const session = (): VoiceLoggedExercise[] => [
  {
    id: "e1",
    name: "Incline Curl",
    category: "Arms",
    target: "3×8",
    sets: [set(), set(), set()],
  },
  {
    id: "e2",
    name: "Bench Press",
    category: "Chest",
    target: "3×8",
    sets: [set({ isWarmup: true }), set(), set()],
  },
];

describe("applyVoiceIntent — done-without-numbers ('I did goblet squats')", () => {
  it("completes an existing exercise's planned sets from targets", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Incline Curl", done: true, sets: [] }],
    };
    const result = applyVoiceIntent(session(), intent);
    const rows = result.exercises[0].sets;
    expect(rows.every((r) => r.completed)).toBe(true);
    expect(rows[0]).toMatchObject({ reps: "8", weight: "185" });
    expect(result.setsLogged).toBe(3);
    expect(result.summary[0]).toBe("Incline Curl · 3 sets done");
    expect(result.empty).toBe(false);
  });

  it("keeps typed values, skips warm-ups, and never completes target-less blank rows", () => {
    const exercises: VoiceLoggedExercise[] = [
      {
        id: "e1",
        name: "Goblet Squat",
        category: "",
        target: "",
        sets: [
          set({ isWarmup: true }),
          set({ reps: "12", weight: "50", targetReps: null, targetWeight: null }),
          set({ targetReps: null, targetWeight: null }), // no target, nothing typed
        ],
      },
    ];
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Goblet Squat", done: true, sets: [] }],
    };
    const result = applyVoiceIntent(exercises, intent);
    const rows = result.exercises[0].sets;
    expect(rows[0].completed).toBe(false); // warm-up untouched
    expect(rows[1]).toMatchObject({ reps: "12", weight: "50", completed: true });
    expect(rows[2].completed).toBe(false);
    expect(result.setsLogged).toBe(1);
  });

  it("adds an unknown exercise instead of swallowing the words", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Goblet Squat", isNew: true, done: true, sets: [] }],
    };
    const result = applyVoiceIntent(session(), intent);
    expect(result.addedExercises).toEqual(["Goblet Squat"]);
    expect(result.exercises.at(-1)?.name).toBe("Goblet Squat");
    expect(result.exercises.at(-1)?.sets[0].completed).toBe(false);
    expect(result.summary[0]).toBe("Goblet Squat · (added) fill in your sets");
    expect(result.empty).toBe(false);
  });

  it("says so when the exercise is already fully done", () => {
    const exercises = session().map((e) =>
      e.id === "e1"
        ? { ...e, sets: e.sets.map((r) => ({ ...r, reps: "8", completed: true })) }
        : e,
    );
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Incline Curl", done: true, sets: [] }],
    };
    const result = applyVoiceIntent(exercises, intent);
    expect(result.summary[0]).toBe("Incline Curl · already done");
    expect(result.setsLogged).toBe(0);
    expect(result.empty).toBe(false);
  });

  it("name-inferred holds (no explicit tracking) fill hold targets, never reps-as-seconds", () => {
    // "Glute Bridge" carries no tracking field (coach plans and starters
    // never set one) but the NAME infers time — the done path must agree
    // with the save path or reps targets become phantom hold durations.
    const exercises: VoiceLoggedExercise[] = [
      {
        id: "e1",
        name: "Glute Bridge",
        category: "",
        target: "",
        sets: [set({ targetReps: 12, targetWeight: null, targetTime: 45 })],
      },
    ];
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Glute Bridge", done: true, sets: [] }],
    };
    const result = applyVoiceIntent(exercises, intent);
    expect(result.exercises[0].sets[0]).toMatchObject({ reps: "0:45", completed: true });
  });

  it("'first set of bench done' — done with an ordinal completes ONLY that set", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Incline Curl", done: true, sets: [{ ordinal: 1 }] }],
    };
    const result = applyVoiceIntent(session(), intent);
    const rows = result.exercises[0].sets;
    expect(rows[0].completed).toBe(true);
    expect(rows[1].completed).toBe(false);
    expect(rows[2].completed).toBe(false);
    expect(result.setsLogged).toBe(1);
    expect(result.summary[0]).toBe("Incline Curl · 1 set done");
  });

  it("zero-valued targets never complete rows", () => {
    const exercises: VoiceLoggedExercise[] = [
      {
        id: "e1",
        name: "Bench Press",
        category: "",
        target: "",
        sets: [set({ targetReps: 0, targetWeight: 0 })],
      },
    ];
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Bench Press", done: true, sets: [] }],
    };
    const result = applyVoiceIntent(exercises, intent);
    expect(result.exercises[0].sets[0].completed).toBe(false);
    expect(result.setsLogged).toBe(0);
    expect(result.summary[0]).toContain("no planned numbers");
    expect(result.empty).toBe(false);
  });

  it("fills timed exercises from their hold targets as m:ss", () => {
    const exercises: VoiceLoggedExercise[] = [
      {
        id: "e1",
        name: "Plank",
        tracking: "time",
        category: "",
        target: "",
        sets: [set({ targetReps: null, targetWeight: null, targetTime: 90 })],
      },
    ];
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Plank", done: true, sets: [] }],
    };
    const result = applyVoiceIntent(exercises, intent);
    expect(result.exercises[0].sets[0]).toMatchObject({ reps: "1:30", completed: true });
  });
});

describe("applyVoiceIntent — the owner's exact utterances", () => {
  it("'5 reps first set, only 2 on my second set of incline curls' hits ordinals", () => {
    // "recline curls" was already resolved to the session name by the
    // interpreter; ordinals land on working rows 1 and 2.
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [
        {
          exercise: "Incline Curl",
          sets: [
            { ordinal: 1, reps: 5 },
            { ordinal: 2, reps: 2 },
          ],
        },
      ],
    };
    const result = applyVoiceIntent(session(), intent);
    const rows = result.exercises[0].sets;
    expect(rows[0]).toMatchObject({ reps: "5", completed: true });
    expect(rows[1]).toMatchObject({ reps: "2", completed: true });
    expect(rows[2].completed).toBe(false);
    expect(result.setsLogged).toBe(2);
    expect(result.summary[0]).toContain("Incline Curl");
  });

  it("'about 40 seconds of planks, 3 sets' creates a timed exercise with 3 done holds", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [
        {
          exercise: "Planks",
          isNew: true,
          tracking: "time",
          sets: [{ seconds: 40 }, { seconds: 40 }, { seconds: 40 }],
        },
      ],
    };
    const result = applyVoiceIntent(session(), intent);
    const planks = result.exercises.at(-1)!;
    expect(planks.name).toBe("Planks");
    expect(planks.tracking).toBe("time");
    expect(planks.sets).toHaveLength(3);
    // m:ss form — a bare "40" was fine but "120" re-parsed as 1:20, so
    // holds always store colon format now.
    expect(planks.sets.every((s) => s.completed && s.reps === "0:40")).toBe(true);
    expect(result.addedExercises).toEqual(["Planks"]);
    expect(result.summary[0]).toBe("Planks · (added) 3 sets of 0:40 hold");
  });

  it("'legs feel tired…' becomes a note and touches no rows", () => {
    const intent: VoiceIntent = {
      kind: "note",
      note: "Legs feel tired — not able to do as much as last leg session.",
    };
    const base = session();
    const result = applyVoiceIntent(base, intent);
    expect(result.exercises).toEqual(base);
    expect(result.note).toContain("Legs feel tired");
    expect(result.setsLogged).toBe(0);
    expect(result.empty).toBe(false);
  });

  it("kind 'both' logs sets AND keeps the note", () => {
    const intent: VoiceIntent = {
      kind: "both",
      note: "Shoulder felt off on the last one.",
      actions: [{ exercise: "Bench Press", sets: [{ reps: 8, weight: 185 }] }],
    };
    const result = applyVoiceIntent(session(), intent);
    // Bench's first WORKING row (index 1 — row 0 is a warmup) gets the set.
    expect(result.exercises[1].sets[1]).toMatchObject({
      reps: "8",
      weight: "185",
      completed: true,
    });
    expect(result.note).toContain("Shoulder");
  });
});

describe("applyVoiceIntent — guards", () => {
  it("ordinals count working sets only (warmups invisible to 'first set')", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Bench Press", sets: [{ ordinal: 1, reps: 10 }] }],
    };
    const rows = applyVoiceIntent(session(), intent).exercises[1].sets;
    expect(rows[0].completed).toBe(false); // warmup untouched
    expect(rows[1]).toMatchObject({ reps: "10", completed: true });
  });

  it("an ordinal past the last row appends instead of exploding", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Incline Curl", sets: [{ ordinal: 9, reps: 6 }] }],
    };
    const rows = applyVoiceIntent(session(), intent).exercises[0].sets;
    expect(rows).toHaveLength(4);
    expect(rows[3]).toMatchObject({ reps: "6", completed: true });
  });

  it("sequential sets fill the next open rows, then append", () => {
    const base = session();
    base[0].sets[0] = set({ completed: true, reps: "8" });
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [
        { exercise: "Incline Curl", sets: [{ reps: 7 }, { reps: 6 }, { reps: 5 }] },
      ],
    };
    const rows = applyVoiceIntent(base, intent).exercises[0].sets;
    expect(rows[0].reps).toBe("8"); // already done — skipped
    expect(rows[1].reps).toBe("7");
    expect(rows[2].reps).toBe("6");
    expect(rows[3].reps).toBe("5"); // appended
  });

  it("an unmatched name NEVER lands on an existing exercise — it becomes new", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Cable Row", sets: [{ reps: 12, weight: 120 }] }],
    };
    const result = applyVoiceIntent(session(), intent);
    expect(result.exercises).toHaveLength(3);
    expect(result.exercises[0].sets.every((s) => !s.completed)).toBe(true);
    expect(result.addedExercises).toEqual(["Cable Row"]);
  });

  it("containment matching is applied only when unambiguous", () => {
    const base = [
      ...session(),
      {
        id: "e3",
        name: "Incline Curl Machine",
        category: "",
        target: "",
        sets: [set()],
      },
    ];
    // "Incline" matches two exercises → treated as new, corrupts neither.
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Incline", sets: [{ reps: 5 }] }],
    };
    const result = applyVoiceIntent(base, intent);
    expect(result.exercises).toHaveLength(4);
    expect(result.addedExercises).toEqual(["Incline"]);
  });

  it("bounds insane numbers and drops empty actions", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [
        { exercise: "Incline Curl", sets: [{ reps: 5000 }, { weight: -10 }] },
        { exercise: "Bench Press", sets: [{}] },
      ],
    };
    const base = session();
    const result = applyVoiceIntent(base, intent);
    expect(result.empty).toBe(true);
    expect(result.exercises).toEqual(base);
  });

  it("'unclear' applies nothing even when actions are present", () => {
    const intent: VoiceIntent = {
      kind: "unclear",
      actions: [{ exercise: "Incline Curl", sets: [{ reps: 5 }] }],
    };
    const base = session();
    const result = applyVoiceIntent(base, intent);
    expect(result.empty).toBe(true);
    expect(result.exercises).toEqual(base);
  });

  it("hold spoken for an existing reps exercise flips it to time tracking", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Incline Curl", sets: [{ seconds: 30 }] }],
    };
    const result = applyVoiceIntent(session(), intent);
    expect(result.exercises[0].tracking).toBe("time");
    expect(result.exercises[0].sets[0]).toMatchObject({ reps: "0:30", completed: true });
  });
});

describe("applyVoiceIntent — blocked tracking flip", () => {
  it("skips a spoken duration for a reps exercise with completed sets instead of writing m:ss into a reps column", () => {
    const base = session();
    base[0] = {
      ...base[0],
      sets: [{ ...base[0].sets[0], reps: "8", completed: true }, base[0].sets[1], base[0].sets[2]],
    };
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Incline Curl", sets: [{ seconds: 60 }] }],
    };
    const result = applyVoiceIntent(base, intent);
    // No flip, no phantom set, honest empty result → the UI re-asks.
    expect(result.exercises[0].tracking ?? "reps").toBe("reps");
    expect(result.exercises[0].sets.filter((s) => s.completed)).toHaveLength(1);
    expect(result.empty).toBe(true);
  });
});

describe("applyVoiceIntent — receipt lines say units and meaning", () => {
  it("weight × reps reads '185 lb × 8 reps'", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Bench Press", sets: [{ reps: 8, weight: 185 }] }],
    };
    expect(applyVoiceIntent(session(), intent).summary[0]).toBe("Bench Press · 185 lb × 8 reps");
  });

  it("honours the lifter's units", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Bench Press", sets: [{ reps: 8, weight: 80 }] }],
    };
    expect(applyVoiceIntent(session(), intent, { units: "kg" }).summary[0]).toBe(
      "Bench Press · 80 kg × 8 reps",
    );
  });

  it("bodyweight sets read as reps only, singular for one", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Incline Curl", sets: [{ reps: 10 }, { reps: 1 }] }],
    };
    expect(applyVoiceIntent(session(), intent).summary[0]).toBe("Incline Curl · 10 reps, 1 rep");
  });

  it("weight with no reps reads as the weight alone", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Incline Curl", sets: [{ weight: 25 }] }],
    };
    expect(applyVoiceIntent(session(), intent).summary[0]).toBe("Incline Curl · 25 lb");
  });

  it("holds read '0:45 hold', with the weight when one was spoken", () => {
    const plank: VoiceLoggedExercise[] = [
      {
        id: "p",
        name: "Plank",
        tracking: "time",
        category: "",
        target: "",
        sets: [set({ targetReps: null, targetWeight: null }), set({ targetReps: null, targetWeight: null })],
      },
    ];
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Plank", sets: [{ seconds: 45 }, { seconds: 45, weight: 25 }] }],
    };
    expect(applyVoiceIntent(plank, intent).summary[0]).toBe(
      "Plank · 0:45 hold, 0:45 hold at 25 lb",
    );
  });

  it("a hold of a minute or more keeps m:ss", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Wall Sit", isNew: true, tracking: "time", sets: [{ seconds: 90 }] }],
    };
    expect(applyVoiceIntent(session(), intent).summary[0]).toBe("Wall Sit · (added) 1:30 hold");
  });

  it("identical sets collapse to '3 sets of …' so the line fits a phone", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [
        { exercise: "Bench Press", sets: [{ reps: 8, weight: 185 }, { reps: 8, weight: 185 }, { reps: 8, weight: 185 }] },
      ],
    };
    expect(applyVoiceIntent(session(), intent).summary[0]).toBe(
      "Bench Press · 3 sets of 185 lb × 8 reps",
    );
  });

  it("differing sets are listed in order", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Bench Press", sets: [{ reps: 8, weight: 185 }, { reps: 6, weight: 185 }] }],
    };
    expect(applyVoiceIntent(session(), intent).summary[0]).toBe(
      "Bench Press · 185 lb × 8 reps, 185 lb × 6 reps",
    );
  });

  it("a new exercise is marked (added) in the detail, not the name", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Cable Row", sets: [{ reps: 12, weight: 120 }] }],
    };
    expect(applyVoiceIntent(session(), intent).summary[0]).toBe("Cable Row · (added) 120 lb × 12 reps");
  });

  it("note lines carry no separator; every other line has exactly one name/detail split", () => {
    const intent: VoiceIntent = {
      kind: "both",
      note: "Shoulder felt off.",
      actions: [{ exercise: "Bench Press", sets: [{ reps: 8, weight: 185 }] }],
    };
    const { summary } = applyVoiceIntent(session(), intent);
    expect(summary).toEqual(["Bench Press · 185 lb × 8 reps", "Note: “Shoulder felt off.”"]);
    expect(summary[0].indexOf(" · ")).toBe("Bench Press".length);
    expect(summary[1]).not.toContain(" · ");
  });
});

describe("applyVoiceIntent — touched rows", () => {
  it("lists every row written, in order, so Edit can focus the first", () => {
    const base = session();
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [
        { exercise: "Bench Press", sets: [{ reps: 8, weight: 185 }, { reps: 8, weight: 185 }] },
      ],
    };
    const result = applyVoiceIntent(base, intent);
    expect(result.touched).toEqual([
      { exerciseId: "e2", setId: base[1].sets[1].id },
      { exerciseId: "e2", setId: base[1].sets[2].id },
    ]);
  });

  it("an appended row is touched by its fresh id", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Incline Curl", sets: [{ ordinal: 9, reps: 6 }] }],
    };
    const result = applyVoiceIntent(session(), intent);
    const rows = result.exercises[0].sets;
    expect(result.touched).toEqual([{ exerciseId: "e1", setId: rows[3].id }]);
  });

  it("done-without-numbers touches each row it completed", () => {
    const base = session();
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Incline Curl", done: true, sets: [] }],
    };
    const result = applyVoiceIntent(base, intent);
    expect(result.touched.map((t) => t.setId)).toEqual(base[0].sets.map((r) => r.id));
    expect(result.touched.every((t) => t.exerciseId === "e1")).toBe(true);
  });

  it("a new exercise's sets are touched under its new id", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Cable Row", sets: [{ reps: 12, weight: 120 }, { reps: 10, weight: 120 }] }],
    };
    const result = applyVoiceIntent(session(), intent);
    const added = result.exercises.at(-1)!;
    expect(result.touched).toEqual(added.sets.map((s) => ({ exerciseId: added.id, setId: s.id })));
  });

  it("a note alone touches nothing", () => {
    const result = applyVoiceIntent(session(), { kind: "note", note: "Tired." });
    expect(result.touched).toEqual([]);
  });

  it("'already done' and 'no planned numbers' touch nothing", () => {
    const exercises = session().map((e) =>
      e.id === "e1"
        ? { ...e, sets: e.sets.map((r) => ({ ...r, reps: "8", completed: true })) }
        : e,
    );
    const result = applyVoiceIntent(exercises, {
      kind: "sets",
      actions: [{ exercise: "Incline Curl", done: true, sets: [] }],
    });
    expect(result.touched).toEqual([]);
  });
});

describe("applyVoiceIntent — corrections ('actually that was 12 reps')", () => {
  /** Session where Bicep Curl's first set was just voice-logged 25 × 10
      and Bench's first working set 185 × 8 — bench logged last. */
  const logged = (): VoiceLoggedExercise[] => [
    {
      id: "c",
      name: "Bicep Curl",
      category: "Arms",
      target: "",
      sets: [
        set({ id: "c1", reps: "10", weight: "25", completed: true, targetReps: 10, targetWeight: 25 }),
        set({ id: "c2", targetReps: 10, targetWeight: 25 }),
      ],
    },
    {
      id: "b",
      name: "Bench Press",
      category: "Chest",
      target: "",
      sets: [
        set({ id: "b0", isWarmup: true, reps: "10", weight: "95", completed: true }),
        set({ id: "b1", reps: "8", weight: "185", completed: true }),
        set({ id: "b2" }),
      ],
    },
  ];

  it("with a name: rewrites that exercise's last completed set, keeping unspoken fields", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Bicep Curl", correct: true, sets: [{ reps: 12 }] }],
    };
    const result = applyVoiceIntent(logged(), intent);
    const curl = result.exercises[0];
    expect(curl.sets).toHaveLength(2); // never a new set
    expect(curl.sets[0]).toMatchObject({ reps: "12", weight: "25", completed: true });
    expect(curl.sets[1].completed).toBe(false);
    expect(result.summary).toEqual(["Bicep Curl · corrected to 25 lb × 12 reps"]);
    expect(result.touched).toEqual([{ exerciseId: "c", setId: "c1" }]);
    expect(result.setsLogged).toBe(0);
    expect(result.empty).toBe(false);
  });

  it("'no wait, 185' with a name changes only the weight", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Bicep Curl", correct: true, sets: [{ weight: 30 }] }],
    };
    const result = applyVoiceIntent(logged(), intent);
    expect(result.exercises[0].sets[0]).toMatchObject({ reps: "10", weight: "30", completed: true });
    expect(result.summary[0]).toBe("Bicep Curl · corrected to 30 lb × 10 reps");
  });

  it("without a name: fixes the last completed set in the session (bench, not the curl)", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "", correct: true, sets: [{ reps: 6 }] }],
    };
    const result = applyVoiceIntent(logged(), intent);
    expect(result.exercises[0].sets[0].reps).toBe("10"); // curl untouched
    expect(result.exercises[1].sets[1]).toMatchObject({ reps: "6", weight: "185", completed: true });
    expect(result.exercises[1].sets).toHaveLength(3);
    expect(result.summary).toEqual(["Bench Press · corrected to 185 lb × 6 reps"]);
    expect(result.touched).toEqual([{ exerciseId: "b", setId: "b1" }]);
  });

  it("without a name: skips a trailing exercise that has nothing completed", () => {
    const base = [
      ...logged(),
      { id: "r", name: "Cable Row", category: "", target: "", sets: [set(), set()] },
    ];
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "", correct: true, sets: [{ reps: 6 }] }],
    };
    const result = applyVoiceIntent(base, intent);
    expect(result.exercises[2].sets.every((s) => !s.completed)).toBe(true);
    expect(result.exercises[1].sets[1].reps).toBe("6");
  });

  it("never picks a warm-up as the set to correct", () => {
    const base = logged();
    base[1].sets[1] = set({ id: "b1" }); // only the warm-up is completed on bench
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "", correct: true, sets: [{ reps: 6 }] }],
    };
    const result = applyVoiceIntent(base, intent);
    expect(result.exercises[1].sets[0]).toMatchObject({ reps: "10", weight: "95" }); // warm-up untouched
    expect(result.exercises[0].sets[0].reps).toBe("6"); // curl was the last real set
    expect(result.summary[0]).toBe("Bicep Curl · corrected to 25 lb × 6 reps");
  });

  it("an unmatched name falls back to the session's last set and says which one it changed", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Hammer Curl", isNew: true, correct: true, sets: [{ reps: 9 }] }],
    };
    const result = applyVoiceIntent(logged(), intent);
    expect(result.exercises).toHaveLength(2); // no exercise added
    expect(result.addedExercises).toEqual([]);
    expect(result.summary[0]).toBe("Bench Press · corrected to 185 lb × 9 reps");
  });

  it("nothing logged yet → honest line, no rows touched, not 'empty'", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Incline Curl", correct: true, sets: [{ reps: 12 }] }],
    };
    const base = session();
    const result = applyVoiceIntent(base, intent);
    expect(result.exercises).toEqual(base);
    expect(result.summary).toEqual(["Incline Curl · nothing logged yet to fix"]);
    expect(result.touched).toEqual([]);
    expect(result.empty).toBe(false);
  });

  it("nothing logged and no name → the line still reads as a sentence", () => {
    const result = applyVoiceIntent(session(), {
      kind: "sets",
      actions: [{ exercise: "", correct: true, sets: [{ reps: 12 }] }],
    });
    expect(result.summary).toEqual(["Last set · nothing logged yet to fix"]);
  });

  it("'actually my second set was 10' targets that set by ordinal", () => {
    const base = logged();
    base[0].sets[1] = set({ id: "c2", reps: "8", weight: "25", completed: true });
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Bicep Curl", correct: true, sets: [{ ordinal: 1, reps: 12 }] }],
    };
    const result = applyVoiceIntent(base, intent);
    expect(result.exercises[0].sets[0].reps).toBe("12");
    expect(result.exercises[0].sets[1].reps).toBe("8");
    expect(result.touched).toEqual([{ exerciseId: "c", setId: "c1" }]);
  });

  it("an ordinal past the last row corrects nothing (never appends)", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Bicep Curl", correct: true, sets: [{ ordinal: 5, reps: 12 }] }],
    };
    const base = logged();
    const result = applyVoiceIntent(base, intent);
    expect(result.exercises).toEqual(base);
    expect(result.summary[0]).toBe("Bicep Curl · nothing logged yet to fix");
  });

  it("holds correct as holds", () => {
    const plank: VoiceLoggedExercise[] = [
      {
        id: "p",
        name: "Plank",
        tracking: "time",
        category: "",
        target: "",
        sets: [set({ id: "p1", reps: "0:40", completed: true, targetReps: null, targetWeight: null })],
      },
    ];
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Plank", correct: true, sets: [{ seconds: 50 }] }],
    };
    const result = applyVoiceIntent(plank, intent);
    expect(result.exercises[0].sets[0]).toMatchObject({ reps: "0:50", completed: true });
    expect(result.summary[0]).toBe("Plank · corrected to 0:50 hold");
  });

  it("reps spoken for a hold can't land → says so, changes nothing", () => {
    const plank: VoiceLoggedExercise[] = [
      {
        id: "p",
        name: "Plank",
        tracking: "time",
        category: "",
        target: "",
        sets: [set({ id: "p1", reps: "0:40", completed: true, targetReps: null, targetWeight: null })],
      },
    ];
    const result = applyVoiceIntent(plank, {
      kind: "sets",
      actions: [{ exercise: "Plank", correct: true, sets: [{ reps: 8 }] }],
    });
    expect(result.exercises).toEqual(plank);
    expect(result.summary[0]).toBe("Plank · didn’t catch what to change");
    expect(result.touched).toEqual([]);
  });

  it("a correction reports in the lifter's units", () => {
    const result = applyVoiceIntent(
      logged(),
      { kind: "sets", actions: [{ exercise: "Bicep Curl", correct: true, sets: [{ reps: 12 }] }] },
      { units: "kg" },
    );
    expect(result.summary[0]).toBe("Bicep Curl · corrected to 25 kg × 12 reps");
  });

  it("a correction plus a fresh set in one utterance applies both, in order", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [
        { exercise: "Bench Press", correct: true, sets: [{ reps: 7 }] },
        { exercise: "Bench Press", sets: [{ reps: 6, weight: 185 }] },
      ],
    };
    const result = applyVoiceIntent(logged(), intent);
    const bench = result.exercises[1];
    expect(bench.sets[1].reps).toBe("7");
    expect(bench.sets[2]).toMatchObject({ reps: "6", weight: "185", completed: true });
    expect(bench.sets).toHaveLength(3);
    expect(result.summary).toEqual([
      "Bench Press · corrected to 185 lb × 7 reps",
      "Bench Press · 185 lb × 6 reps",
    ]);
    expect(result.setsLogged).toBe(1);
  });
});

describe("applyVoiceIntent — 'scratch the last one' (correct + undo)", () => {
  const logged = (): VoiceLoggedExercise[] => [
    {
      id: "c",
      name: "Bicep Curl",
      category: "Arms",
      target: "",
      sets: [
        set({ id: "c1", reps: "10", weight: "25", completed: true, targetReps: 10, targetWeight: 25 }),
        set({ id: "c2", reps: "9", weight: "25", completed: true, targetReps: 10, targetWeight: 25 }),
      ],
    },
  ];

  it("un-completes the last logged set and clears what was spoken in; targets stay", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "", correct: true, undo: true, sets: [] }],
    };
    const result = applyVoiceIntent(logged(), intent);
    const rows = result.exercises[0].sets;
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      reps: "",
      weight: "",
      completed: false,
      targetReps: 10,
      targetWeight: 25,
    });
    expect(rows[0]).toMatchObject({ reps: "10", weight: "25", completed: true });
    expect(result.summary).toEqual(["Bicep Curl · last set scratched"]);
    expect(result.touched).toEqual([{ exerciseId: "c", setId: "c2" }]);
    expect(result.setsLogged).toBe(0);
    expect(result.empty).toBe(false);
  });

  it("undo alone (interpreter forgot `correct`) still means scratch, never a set", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Bicep Curl", undo: true, sets: [] }],
    };
    const result = applyVoiceIntent(logged(), intent);
    expect(result.exercises[0].sets).toHaveLength(2);
    expect(result.exercises[0].sets[1].completed).toBe(false);
  });

  it("undo wins over numbers spoken alongside it", () => {
    const intent: VoiceIntent = {
      kind: "sets",
      actions: [{ exercise: "Bicep Curl", correct: true, undo: true, sets: [{ reps: 12 }] }],
    };
    const result = applyVoiceIntent(logged(), intent);
    expect(result.exercises[0].sets[1]).toMatchObject({ reps: "", completed: false });
  });

  it("nothing to scratch → honest line", () => {
    const base = session();
    const result = applyVoiceIntent(base, {
      kind: "sets",
      actions: [{ exercise: "", correct: true, undo: true, sets: [] }],
    });
    expect(result.exercises).toEqual(base);
    expect(result.summary).toEqual(["Last set · nothing logged yet to fix"]);
  });
});

describe("applyVoiceIntent — recency (recentSetIds) beats list order", () => {
  /** Superset logged curl 1 → bench 1 → curl 2. In LIST order bench is
      last; in TIME order curl 2 is. The UI supplies the time order. */
  const superset = (): VoiceLoggedExercise[] => [
    {
      id: "c",
      name: "Bicep Curl",
      category: "Arms",
      target: "",
      sets: [
        set({ id: "c1", reps: "10", weight: "25", completed: true, targetReps: 10, targetWeight: 25 }),
        set({ id: "c2", reps: "9", weight: "25", completed: true, targetReps: 10, targetWeight: 25 }),
        set({ id: "c3", targetReps: 10, targetWeight: 25 }),
      ],
    },
    {
      id: "b",
      name: "Bench Press",
      category: "Chest",
      target: "",
      sets: [
        set({ id: "b0", isWarmup: true, reps: "10", weight: "95", completed: true }),
        set({ id: "b1", reps: "8", weight: "185", completed: true }),
        set({ id: "b2" }),
      ],
    },
  ];
  const recent = ["c2", "b1", "c1"];

  it("'scratch that' clears curl 2 (the newest set), not bench", () => {
    const result = applyVoiceIntent(
      superset(),
      { kind: "sets", actions: [{ exercise: "", correct: true, undo: true, sets: [] }] },
      { recentSetIds: recent },
    );
    expect(result.exercises[0].sets[1]).toMatchObject({ reps: "", weight: "", completed: false });
    expect(result.exercises[1].sets[1]).toMatchObject({ reps: "8", weight: "185", completed: true });
    expect(result.summary).toEqual(["Bicep Curl · last set scratched"]);
    expect(result.touched).toEqual([{ exerciseId: "c", setId: "c2" }]);
  });

  it("'actually that was 12' rewrites curl 2, not bench", () => {
    const result = applyVoiceIntent(
      superset(),
      { kind: "sets", actions: [{ exercise: "", correct: true, sets: [{ reps: 12 }] }] },
      { recentSetIds: recent },
    );
    expect(result.exercises[0].sets[1]).toMatchObject({ reps: "12", weight: "25", completed: true });
    expect(result.exercises[1].sets[1].reps).toBe("8");
    expect(result.summary).toEqual(["Bicep Curl · corrected to 25 lb × 12 reps"]);
    expect(result.touched).toEqual([{ exerciseId: "c", setId: "c2" }]);
  });

  it("without recentSetIds the same session still falls back to list order (bench)", () => {
    const result = applyVoiceIntent(superset(), {
      kind: "sets",
      actions: [{ exercise: "", correct: true, undo: true, sets: [] }],
    });
    expect(result.summary).toEqual(["Bench Press · last set scratched"]);
    expect(result.exercises[0].sets[1].completed).toBe(true);
  });

  it("named: prefers that exercise's most recent row even when a later row is also done", () => {
    // Curl set 1 was (re)logged AFTER set 2 — list order would pick c2.
    const result = applyVoiceIntent(
      superset(),
      { kind: "sets", actions: [{ exercise: "Bicep Curl", correct: true, sets: [{ reps: 11 }] }] },
      { recentSetIds: ["b1", "c1", "c2"] },
    );
    expect(result.exercises[0].sets[0]).toMatchObject({ reps: "11", completed: true });
    expect(result.exercises[0].sets[1].reps).toBe("9");
    expect(result.touched).toEqual([{ exerciseId: "c", setId: "c1" }]);
  });

  it("named: ignores newer rows of OTHER exercises and stays in scope", () => {
    const result = applyVoiceIntent(
      superset(),
      { kind: "sets", actions: [{ exercise: "Bench Press", correct: true, sets: [{ reps: 6 }] }] },
      { recentSetIds: recent }, // c2 is newest, but bench was named
    );
    expect(result.exercises[1].sets[1]).toMatchObject({ reps: "6", weight: "185" });
    expect(result.exercises[0].sets[1].reps).toBe("9");
    expect(result.summary[0]).toBe("Bench Press · corrected to 185 lb × 6 reps");
  });

  it("named + ordinal: the spoken ordinal still wins over recency", () => {
    const result = applyVoiceIntent(
      superset(),
      { kind: "sets", actions: [{ exercise: "Bicep Curl", correct: true, sets: [{ ordinal: 1, reps: 12 }] }] },
      { recentSetIds: recent },
    );
    expect(result.exercises[0].sets[0].reps).toBe("12");
    expect(result.exercises[0].sets[1].reps).toBe("9");
  });

  it("stale ids fall back to the list-order walk", () => {
    const result = applyVoiceIntent(
      superset(),
      { kind: "sets", actions: [{ exercise: "", correct: true, sets: [{ reps: 6 }] }] },
      { recentSetIds: ["gone-1", "gone-2"] },
    );
    expect(result.summary).toEqual(["Bench Press · corrected to 185 lb × 6 reps"]);
    expect(result.touched).toEqual([{ exerciseId: "b", setId: "b1" }]);
  });

  it("skips ids that point at open rows or warm-ups and takes the next recent one", () => {
    // c3 was never completed, b0 is a warm-up → c2 is the real target.
    const result = applyVoiceIntent(
      superset(),
      { kind: "sets", actions: [{ exercise: "", correct: true, sets: [{ reps: 6 }] }] },
      { recentSetIds: ["c3", "b0", "c2", "b1"] },
    );
    expect(result.exercises[0].sets[1].reps).toBe("6");
    expect(result.exercises[1].sets[0]).toMatchObject({ reps: "10", weight: "95" }); // warm-up untouched
    expect(result.touched).toEqual([{ exerciseId: "c", setId: "c2" }]);
  });

  it("named with only stale ids falls back to that exercise's last completed row", () => {
    const result = applyVoiceIntent(
      superset(),
      { kind: "sets", actions: [{ exercise: "Bicep Curl", correct: true, sets: [{ reps: 6 }] }] },
      { recentSetIds: ["gone"] },
    );
    expect(result.touched).toEqual([{ exerciseId: "c", setId: "c2" }]);
  });

  it("a second 'scratch that' skips the row just scratched and takes the next most recent", () => {
    const result = applyVoiceIntent(
      superset(),
      {
        kind: "sets",
        actions: [
          { exercise: "", correct: true, undo: true, sets: [] },
          { exercise: "", correct: true, undo: true, sets: [] },
        ],
      },
      { recentSetIds: recent },
    );
    expect(result.exercises[0].sets[1].completed).toBe(false); // c2
    expect(result.exercises[1].sets[1].completed).toBe(false); // b1
    expect(result.exercises[0].sets[0].completed).toBe(true); // c1 stays
    expect(result.touched).toEqual([
      { exerciseId: "c", setId: "c2" },
      { exerciseId: "b", setId: "b1" },
    ]);
  });

  it("a set logged in the same utterance is newer than anything the UI remembers", () => {
    // "Curls, 10 at 25… actually that was 12": the row written a moment
    // ago (c3) is the target, not b1 from the UI's list.
    const result = applyVoiceIntent(
      superset(),
      {
        kind: "sets",
        actions: [
          { exercise: "Bicep Curl", sets: [{ reps: 10, weight: 25 }] },
          { exercise: "", correct: true, sets: [{ reps: 12 }] },
        ],
      },
      { recentSetIds: ["b1", "c2", "c1"] },
    );
    expect(result.exercises[0].sets[2]).toMatchObject({ reps: "12", weight: "25", completed: true });
    expect(result.exercises[1].sets[1].reps).toBe("8");
    expect(result.summary).toEqual([
      "Bicep Curl · 25 lb × 10 reps",
      "Bicep Curl · corrected to 25 lb × 12 reps",
    ]);
    expect(result.touched).toEqual([
      { exerciseId: "c", setId: "c3" },
      { exerciseId: "c", setId: "c3" },
    ]);
    expect(result.setsLogged).toBe(1);
  });

  it("recency corrections report in the lifter's units", () => {
    const result = applyVoiceIntent(
      superset(),
      { kind: "sets", actions: [{ exercise: "", correct: true, sets: [{ reps: 12 }] }] },
      { units: "kg", recentSetIds: recent },
    );
    expect(result.summary[0]).toBe("Bicep Curl · corrected to 25 kg × 12 reps");
  });
});

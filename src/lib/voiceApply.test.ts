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
    expect(result.summary[0]).toBe("Incline Curl — 3 sets done");
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
    expect(result.summary[0]).toContain("fill in your sets");
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
    expect(result.summary[0]).toBe("Incline Curl — already done");
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
    expect(result.summary[0]).toBe("Incline Curl — 1 set done");
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
    expect(result.summary[0]).toContain("Planks (added)");
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

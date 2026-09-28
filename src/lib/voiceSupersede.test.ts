import { describe, expect, it } from "vitest";
import {
  applyVoiceIntent,
  type VoiceIntent,
  type VoiceLoggedExercise,
} from "./voiceApply";
import { MIN_VOICE_CONFIDENCE, resolveVoiceFire, type AppliedVoiceLog } from "./voiceSupersede";

const row = (id: string, over: Partial<VoiceLoggedExercise["sets"][number]> = {}) => ({
  id,
  reps: "",
  weight: "",
  completed: false,
  targetReps: 8 as number | null,
  targetTime: null,
  targetWeight: 135 as number | null,
  ...over,
});

const session = (): VoiceLoggedExercise[] => [
  { id: "e1", name: "Bench Press", category: "", target: "", sets: [row("b1"), row("b2"), row("b3")] },
  {
    id: "e3",
    name: "Pull Up",
    kind: "bodyweight",
    category: "",
    target: "",
    sets: [row("p1", { targetReps: null, targetWeight: null })],
  },
];

const bench = (reps: number, weight: number, confidence = 0.95): VoiceIntent => ({
  kind: "sets",
  confidence,
  actions: [{ exercise: "Bench Press", sets: [{ reps, weight }] }],
});

const read = (list: VoiceLoggedExercise[]): string[] =>
  list.map(
    (e) =>
      `${e.name}: ${e.sets
        .map((s) => `${s.completed ? "x" : "·"}${s.reps || "-"}/${s.weight || "-"}`)
        .join(" ")}`,
  );

/** "bench 8 at 135", logged: the session before and after. */
const firstLog = (): AppliedVoiceLog => {
  const before = session();
  return { before, after: applyVoiceIntent(before, bench(8, 135)).exercises };
};

describe("resolveVoiceFire — the first fire", () => {
  it("applies an understood sentence to the session as it is", () => {
    const now = session();
    const outcome = resolveVoiceFire({ now, intent: bench(8, 135), first: null });
    expect(outcome.at).toBe("applied");
    if (outcome.at !== "applied") return;
    expect(outcome.replacesFirst).toBe(false);
    expect(outcome.base).toBe(now);
    expect(read(outcome.result.exercises)[0]).toBe("Bench Press: x8/135 ·-/- ·-/-");
  });

  it("misses on a failed interpretation, a guess, and an empty result", () => {
    const now = session();
    const misses: (VoiceIntent | null)[] = [
      null,
      bench(8, 135, MIN_VOICE_CONFIDENCE - 0.01),
      { kind: "unclear", confidence: 0.9, actions: [] },
    ];
    for (const intent of misses) {
      expect(resolveVoiceFire({ now, intent, first: null })).toEqual({
        at: "missed",
        firstLogKept: false,
      });
    }
  });

  it("keeps the confidence bar where it was", () => {
    expect(MIN_VOICE_CONFIDENCE).toBe(0.5);
    const now = session();
    expect(resolveVoiceFire({ now, intent: bench(8, 135, 0.5), first: null }).at).toBe("applied");
    // No confidence reported counts as sure, as it always has.
    const unrated: VoiceIntent = { kind: "sets", actions: bench(8, 135).actions };
    expect(resolveVoiceFire({ now, intent: unrated, first: null }).at).toBe("applied");
  });
});

describe("resolveVoiceFire — speech resumed in the grace window", () => {
  it("replaces the first log with the merged sentence, never stacks on it", () => {
    const first = firstLog();
    const outcome = resolveVoiceFire({ now: first.after, intent: bench(10, 135), first });
    expect(outcome.at).toBe("applied");
    if (outcome.at !== "applied") return;
    expect(outcome.replacesFirst).toBe(true);
    // Worked out against the session without the first log…
    expect(read(outcome.base)).toEqual(read(first.before));
    // …so the merged sentence lands in set 1, not as a second set.
    expect(read(outcome.result.exercises)[0]).toBe("Bench Press: x10/135 ·-/- ·-/-");
    expect(outcome.result.setsLogged).toBe(1);
  });

  it("does not touch the session it was given", () => {
    const first = firstLog();
    const now = first.after;
    const snapshot = JSON.stringify(now);
    resolveVoiceFire({ now, intent: bench(10, 135), first });
    resolveVoiceFire({ now, intent: null, first });
    expect(JSON.stringify(now)).toBe(snapshot);
    expect(read(now)[0]).toBe("Bench Press: x8/135 ·-/- ·-/-");
  });

  it("keeps the first log when the second interpretation FAILS", () => {
    const first = firstLog();
    expect(resolveVoiceFire({ now: first.after, intent: null, first })).toEqual({
      at: "missed",
      firstLogKept: true,
    });
  });

  it("keeps the first log when the second interpretation is a guess", () => {
    const first = firstLog();
    expect(
      resolveVoiceFire({ now: first.after, intent: bench(10, 135, 0.3), first }),
    ).toEqual({ at: "missed", firstLogKept: true });
  });

  it("keeps the first log when the merged sentence applies nothing", () => {
    const first = firstLog();
    const unclear: VoiceIntent = { kind: "unclear", confidence: 0.9, actions: [] };
    expect(resolveVoiceFire({ now: first.after, intent: unclear, first })).toEqual({
      at: "missed",
      firstLogKept: true,
    });
  });

  it("still lets '… scratch that' take the first log back", () => {
    // Understood, and lib/voiceApply answers it with a receipt line. A
    // bare scratch amends the first log rather than replacing it; either
    // way the lifter ends with nothing logged.
    const first = firstLog();
    const scratch: VoiceIntent = {
      kind: "sets",
      confidence: 0.9,
      actions: [{ exercise: "", correct: true, undo: true, sets: [] }],
    };
    const outcome = resolveVoiceFire({
      now: first.after,
      intent: scratch,
      first,
      options: { recentSetIds: ["b1"] },
    });
    expect(outcome.at).toBe("applied");
    if (outcome.at !== "applied") return;
    expect(outcome.replacesFirst).toBe(false);
    expect(read(outcome.result.exercises)[0]).toBe("Bench Press: ·-/- ·-/- ·-/-");
  });

  it("keeps what the lifter logged by hand between the two fires", () => {
    const first = firstLog();
    // Pull Up logged with the button after the voice log.
    const now = first.after.map((e) =>
      e.id === "e3"
        ? { ...e, sets: e.sets.map((s) => ({ ...s, reps: "9", completed: true })) }
        : e,
    );
    const outcome = resolveVoiceFire({ now, intent: bench(10, 135), first });
    expect(outcome.at).toBe("applied");
    if (outcome.at !== "applied") return;
    expect(read(outcome.base)).toEqual(["Bench Press: ·-/- ·-/- ·-/-", "Pull Up: x9/-"]);
    expect(read(outcome.result.exercises)).toEqual([
      "Bench Press: x10/135 ·-/- ·-/-",
      "Pull Up: x9/-",
    ]);
  });

  it("hands back what the NEXT fire needs to replace this one", () => {
    const first = firstLog();
    const second = resolveVoiceFire({ now: first.after, intent: bench(10, 135), first });
    expect(second.at).toBe("applied");
    if (second.at !== "applied") return;
    const third = resolveVoiceFire({
      now: second.result.exercises,
      intent: bench(12, 140),
      first: { before: second.base, after: second.result.exercises },
    });
    expect(third.at).toBe("applied");
    if (third.at !== "applied") return;
    expect(read(third.result.exercises)[0]).toBe("Bench Press: x12/140 ·-/- ·-/-");
  });

  it("passes units and recency straight through to the apply", () => {
    const first = firstLog();
    const outcome = resolveVoiceFire({
      now: first.after,
      intent: bench(10, 60),
      first,
      options: { units: "kg", recentSetIds: [] },
    });
    expect(outcome.at).toBe("applied");
    if (outcome.at !== "applied") return;
    expect(outcome.result.summary[0]).toContain("kg");
    expect(outcome.result.summary[0]).not.toContain("lb");
  });
});

describe("resolveVoiceFire — a bare correction amends the log it follows", () => {
  const scratch: VoiceIntent = {
    kind: "sets",
    confidence: 0.95,
    actions: [{ exercise: "", correct: true, undo: true, sets: [] }],
  };
  const twelve: VoiceIntent = {
    kind: "sets",
    confidence: 0.95,
    actions: [{ exercise: "", correct: true, sets: [{ reps: 12 }] }],
  };
  const pullUps: VoiceIntent = {
    kind: "sets",
    confidence: 0.95,
    actions: [{ exercise: "Pull Up", sets: [{ reps: 10 }] }],
  };

  /** Voice logs Pull Up 10, then the lifter logs Bench set 1 by hand. */
  const afterHandLog = () => {
    const before = session();
    const voiced = applyVoiceIntent(before, pullUps).exercises;
    const first: AppliedVoiceLog = { before, after: voiced };
    const now = voiced.map((e) =>
      e.id === "e1"
        ? {
            ...e,
            sets: e.sets.map((s, i) =>
              i === 0 ? { ...s, reps: "8", weight: "135", completed: true } : s,
            ),
          }
        : e,
    );
    // The hand-logged set is the most recent one the logger knows of.
    return { first, now, options: { recentSetIds: ["b1", "p1"] } };
  };
  const done = (list: VoiceLoggedExercise[], id: string) =>
    list.flatMap((e) => e.sets).find((s) => s.id === id);

  it("'scratch that' scratches the voice-logged set, not the hand-logged one", () => {
    const { first, now, options } = afterHandLog();
    const outcome = resolveVoiceFire({ now, intent: scratch, first, options });
    if (outcome.at !== "applied") throw new Error("expected applied");
    expect(outcome.replacesFirst).toBe(false);
    expect(outcome.base).toBe(now);
    expect(done(outcome.result.exercises, "p1")?.completed).toBe(false);
    expect(done(outcome.result.exercises, "b1")).toMatchObject({
      completed: true,
      reps: "8",
      weight: "135",
    });
  });

  it("'that was 12' rewrites the voice-logged set and leaves the hand-logged one", () => {
    const { first, now, options } = afterHandLog();
    const outcome = resolveVoiceFire({ now, intent: twelve, first, options });
    if (outcome.at !== "applied") throw new Error("expected applied");
    expect(outcome.replacesFirst).toBe(false);
    expect(done(outcome.result.exercises, "p1")).toMatchObject({ completed: true, reps: "12" });
    expect(done(outcome.result.exercises, "b1")).toMatchObject({ completed: true, reps: "8" });
  });

  it("a correction that NAMES an exercise still replaces the first log", () => {
    const { first, now, options } = afterHandLog();
    const named: VoiceIntent = {
      kind: "sets",
      confidence: 0.95,
      actions: [{ exercise: "Pull Up", sets: [{ reps: 12 }] }],
    };
    const outcome = resolveVoiceFire({ now, intent: named, first, options });
    if (outcome.at !== "applied") throw new Error("expected applied");
    expect(outcome.replacesFirst).toBe(true);
    expect(done(outcome.result.exercises, "p1")).toMatchObject({ completed: true, reps: "12" });
  });

  it("with no earlier voice log, a bare correction uses the logger's own recency", () => {
    const { now } = afterHandLog();
    const outcome = resolveVoiceFire({
      now,
      intent: scratch,
      first: null,
      options: { recentSetIds: ["b1", "p1"] },
    });
    if (outcome.at !== "applied") throw new Error("expected applied");
    expect(done(outcome.result.exercises, "b1")?.completed).toBe(false);
    expect(done(outcome.result.exercises, "p1")?.completed).toBe(true);
  });
});

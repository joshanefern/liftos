import { describe, expect, it } from "vitest";
import { revertVoiceApply, revertVoiceNote } from "./voiceRevert";

type Row = {
  id: string;
  reps: string;
  weight: string;
  completed: boolean;
  targetReps: number | null;
  targetWeight: number | null;
};
type Exercise = {
  id: string;
  name: string;
  tracking?: "reps" | "time";
  sets: Row[];
};

const open = (id: string): Row => ({
  id,
  reps: "",
  weight: "",
  completed: false,
  targetReps: 8,
  targetWeight: 135,
});
const logged = (id: string, reps = "8", weight = "135"): Row => ({
  ...open(id),
  reps,
  weight,
  completed: true,
});

const bench = (...sets: Row[]): Exercise => ({ id: "e1", name: "Bench Press", sets });
const pullUp = (...sets: Row[]): Exercise => ({ id: "e3", name: "Pull Up", sets });

const read = (list: Exercise[]): string[] =>
  list.map(
    (e) =>
      `${e.name}: ${e.sets
        .map((s) => (s.completed ? `[x] ${s.reps}/${s.weight}` : `[ ] ${s.reps}/${s.weight}`))
        .join(" | ")}`,
  );

describe("revertVoiceApply", () => {
  it("with nothing done since, puts the session back exactly", () => {
    const before = [bench(logged("s1"), open("s2"), open("s3")), pullUp(open("s5"))];
    const after = [before[0], pullUp(logged("s5", "10", ""))];
    expect(revertVoiceApply(before, after, after)).toEqual(before);
  });

  it("keeps a set logged by hand after the voice log — the reported case", () => {
    // "pull ups, 10 reps" by voice, then Complete set on Bench set 2, then Undo.
    const before = [bench(logged("s1"), open("s2"), open("s3")), pullUp(open("s5"))];
    const after = [before[0], pullUp(logged("s5", "10", ""))];
    const now = [bench(logged("s1"), logged("s2"), open("s3")), after[1]];
    expect(read(revertVoiceApply(before, after, now))).toEqual([
      "Bench Press: [x] 8/135 | [x] 8/135 | [ ] /",
      "Pull Up: [ ] /",
    ]);
  });

  it("keeps numbers typed into another row", () => {
    const before = [bench(logged("s1"), open("s2")), pullUp(open("s5"))];
    const after = [before[0], pullUp(logged("s5", "10", ""))];
    const now = [bench(logged("s1"), { ...open("s2"), reps: "6", weight: "145" }), after[1]];
    const reverted = revertVoiceApply(before, after, now);
    expect(reverted[0].sets[1]).toMatchObject({ reps: "6", weight: "145", completed: false });
    expect(reverted[1].sets[0]).toMatchObject({ reps: "", completed: false });
  });

  it("leaves a voice row alone once the lifter has edited it", () => {
    const before = [pullUp(open("s5"))];
    const after = [pullUp(logged("s5", "10", ""))];
    const now = [pullUp(logged("s5", "12", ""))];
    expect(revertVoiceApply(before, after, now)).toEqual(now);
  });

  it("removes a row voice added to an existing exercise", () => {
    const before = [bench(logged("s1"))];
    const after = [bench(logged("s1"), logged("set-voice-1", "8", "185"))];
    expect(read(revertVoiceApply(before, after, after))).toEqual(["Bench Press: [x] 8/135"]);
  });

  it("keeps a row voice added if it was edited afterwards", () => {
    const before = [bench(logged("s1"))];
    const after = [bench(logged("s1"), logged("set-voice-1", "8", "185"))];
    const now = [bench(logged("s1"), logged("set-voice-1", "8", "190"))];
    expect(revertVoiceApply(before, after, now)).toEqual(now);
  });

  it("removes an exercise voice added, empty first row included", () => {
    // "(added) fill in your sets" — the new row is never in `touched`.
    const before = [bench(logged("s1"))];
    const added: Exercise = { id: "exercise-voice-1", name: "Planks", tracking: "time", sets: [open("set-voice-2")] };
    const after = [...before, added];
    expect(revertVoiceApply(before, after, after)).toEqual(before);
  });

  it("keeps an exercise voice added once the lifter has logged in it", () => {
    const before = [bench(logged("s1"))];
    const added: Exercise = { id: "exercise-voice-1", name: "Planks", tracking: "time", sets: [open("set-voice-2")] };
    const after = [...before, added];
    const now = [before[0], { ...added, sets: [logged("set-voice-2", "0:45", "")] }];
    expect(revertVoiceApply(before, after, now)).toEqual(now);
  });

  it("keeps an exercise and a set the lifter added by hand", () => {
    const before = [bench(logged("s1"))];
    const after = [bench(logged("s1"), logged("set-voice-1"))];
    const byHand: Exercise = { id: "exercise-9", name: "Dips", sets: [open("set-9")] };
    const now = [bench(logged("s1"), logged("set-voice-1"), open("set-hand")), byHand];
    const reverted = revertVoiceApply(before, after, now);
    expect(reverted[0].sets.map((s) => s.id)).toEqual(["s1", "set-hand"]);
    expect(reverted[1]).toBe(byHand);
  });

  it("takes back a flip to timed that voice made", () => {
    const before: Exercise[] = [{ id: "e4", name: "Glute Bridge", sets: [open("s6")] }];
    const after: Exercise[] = [
      { id: "e4", name: "Glute Bridge", tracking: "time", sets: [logged("s6", "0:45", "")] },
    ];
    const reverted = revertVoiceApply(before, after, after);
    expect(reverted).toEqual(before);
    expect("tracking" in reverted[0]).toBe(false);
  });

  it("keeps a tracking choice the lifter made afterwards", () => {
    const before: Exercise[] = [{ id: "e4", name: "Glute Bridge", sets: [open("s6")] }];
    const after: Exercise[] = [
      { id: "e4", name: "Glute Bridge", tracking: "time", sets: [logged("s6", "0:45", "")] },
    ];
    const now: Exercise[] = [{ ...after[0], tracking: "reps" }];
    expect(revertVoiceApply(before, after, now)[0].tracking).toBe("reps");
  });

  it("does not bring back a set the lifter removed since", () => {
    const before = [bench(logged("s1"), open("s2"), open("s3"))];
    const after = [bench(logged("s1"), logged("s2"), open("s3"))];
    const now = [bench(logged("s1"), logged("s2"))];
    expect(revertVoiceApply(before, after, now)[0].sets.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("returns untouched exercises as the same objects", () => {
    const before = [bench(logged("s1"), open("s2")), pullUp(open("s5"))];
    const after = [before[0], pullUp(logged("s5", "10", ""))];
    const reverted = revertVoiceApply(before, after, after);
    expect(reverted[0]).toBe(before[0]);
  });

  it("undoes a spoken correction back to the logged value", () => {
    const before = [bench(logged("s1", "8", "135"))];
    const after = [bench(logged("s1", "12", "135"))];
    expect(revertVoiceApply(before, after, after)[0].sets[0].reps).toBe("8");
  });
});

describe("revertVoiceNote", () => {
  it("clears a note that was the only one", () => {
    expect(revertVoiceNote("felt strong", "felt strong")).toBe("");
  });

  it("removes the appended line and keeps what was there", () => {
    expect(revertVoiceNote("warm-up felt stiff\nfelt strong", "felt strong")).toBe("warm-up felt stiff");
  });

  it("keeps a note typed after the voice log — the reported case", () => {
    // Notes were empty, voice logged sets only, the lifter typed a note.
    expect(revertVoiceNote("left shoulder tight", null)).toBe("left shoulder tight");
  });

  it("keeps lines typed after the voice note", () => {
    expect(revertVoiceNote("stiff\nfelt strong\nleft shoulder tight", "felt strong")).toBe(
      "stiff\nleft shoulder tight",
    );
    expect(revertVoiceNote("felt strong\nleft shoulder tight", "felt strong")).toBe(
      "left shoulder tight",
    );
  });

  it("leaves the notes alone when the spoken line was rewritten", () => {
    expect(revertVoiceNote("stiff\nfelt stronger than last week", "felt strong")).toBe(
      "stiff\nfelt stronger than last week",
    );
  });

  it("removes only the last copy of a repeated line", () => {
    expect(revertVoiceNote("felt strong\nfelt strong", "felt strong")).toBe("felt strong");
  });
});

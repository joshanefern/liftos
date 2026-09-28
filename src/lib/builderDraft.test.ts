import { describe, expect, it } from "vitest";
import {
  BLANK_DRAFT_ROW,
  hasUnsavedWork,
  snapshotDraft,
  type BuilderDraft,
  type DraftRow,
} from "./builderDraft";

const row = (overrides: Partial<DraftRow> = {}): DraftRow => ({ ...BLANK_DRAFT_ROW, ...overrides });

/** A new workout as the builder opens it: no name, one empty row. */
const fresh = (): BuilderDraft => snapshotDraft({ name: "", rows: [row()], ask: "" });

/** A saved workout as the builder loads it for editing. */
const pushDay = (): BuilderDraft => ({
  name: "Push Day",
  rows: [
    row({ name: "Bench Press", sets: "4", reps: "8", weight: "135" }),
    row({ name: "Stairmaster", mode: "cardio", sets: "3", minutes: "20" }),
  ],
  ask: "",
});

describe("hasUnsavedWork — new workout", () => {
  it("a builder nobody has touched holds nothing", () => {
    expect(hasUnsavedWork(fresh(), { name: "", rows: [row()], ask: "" })).toBe(false);
  });

  it("a typed name is work", () => {
    expect(hasUnsavedWork(fresh(), { name: "Legs", rows: [row()] })).toBe(true);
  });

  it("a typed exercise name is work", () => {
    expect(hasUnsavedWork(fresh(), { name: "", rows: [row({ name: "Squat" })] })).toBe(true);
  });

  it("a typed number is work even before the exercise has a name", () => {
    expect(hasUnsavedWork(fresh(), { name: "", rows: [row({ reps: "8" })] })).toBe(true);
    expect(hasUnsavedWork(fresh(), { name: "", rows: [row({ weight: "135" })] })).toBe(true);
    expect(hasUnsavedWork(fresh(), { name: "", rows: [row({ sets: "5" })] })).toBe(true);
    expect(hasUnsavedWork(fresh(), { name: "", rows: [row({ mode: "cardio", minutes: "30" })] })).toBe(true);
  });

  it("whitespace is not work", () => {
    expect(hasUnsavedWork(fresh(), { name: "   ", rows: [row({ name: " \t" })], ask: "  \n" })).toBe(false);
  });

  it("empty rows added with “Add exercise” are not work", () => {
    expect(hasUnsavedWork(fresh(), { name: "", rows: [row(), row(), row()] })).toBe(false);
  });

  it("removing the only empty row is not work", () => {
    expect(hasUnsavedWork(fresh(), { name: "", rows: [] })).toBe(false);
  });

  it("the Lift/Cardio pill on an empty row is not work", () => {
    expect(hasUnsavedWork(fresh(), { name: "", rows: [row({ mode: "cardio" })] })).toBe(false);
  });

  it("clearing the sets box on an empty row is not work", () => {
    expect(hasUnsavedWork(fresh(), { name: "", rows: [row({ sets: "" })] })).toBe(false);
  });

  it("typing something and deleting it again leaves nothing to lose", () => {
    expect(hasUnsavedWork(fresh(), { name: "", rows: [row({ name: "" })], ask: "" })).toBe(false);
  });

  it("rows that arrived by voice or from the coach count like typed ones", () => {
    const dictated = [
      row({ name: "Bench Press", sets: "4", reps: "8", weight: "135" }),
      row({ name: "Bike", mode: "cardio", sets: "1", minutes: "20" }),
    ];
    expect(hasUnsavedWork(fresh(), { name: "", rows: dictated })).toBe(true);
    // The seeded empty row sitting above them changes nothing.
    expect(hasUnsavedWork(fresh(), { name: "", rows: [row(), ...dictated] })).toBe(true);
  });

  it("words in the coach's ask box are work", () => {
    expect(hasUnsavedWork(fresh(), { name: "", rows: [row()], ask: "45 min push day" })).toBe(true);
  });

  it("a missing ask reads as an empty one", () => {
    expect(hasUnsavedWork({ name: "", rows: [] }, { name: "", rows: [row()], ask: "" })).toBe(false);
  });

  it("speech or a design still on its way is work", () => {
    expect(hasUnsavedWork(fresh(), { name: "", rows: [row()] }, true)).toBe(true);
  });
});

describe("hasUnsavedWork — editing a saved workout", () => {
  it("opened and left alone holds nothing", () => {
    expect(hasUnsavedWork(snapshotDraft(pushDay()), pushDay())).toBe(false);
  });

  it("a renamed workout is work", () => {
    expect(hasUnsavedWork(snapshotDraft(pushDay()), { ...pushDay(), name: "Push Day A" })).toBe(true);
  });

  it("trailing spaces around the name are not a rename", () => {
    expect(hasUnsavedWork(snapshotDraft(pushDay()), { ...pushDay(), name: " Push Day  " })).toBe(false);
  });

  it("a changed number is work", () => {
    const edited = pushDay();
    edited.rows = [{ ...edited.rows[0], reps: "10" }, edited.rows[1]];
    expect(hasUnsavedWork(snapshotDraft(pushDay()), edited)).toBe(true);
  });

  it("a number changed and changed back is not", () => {
    const edited = pushDay();
    edited.rows = [{ ...edited.rows[0], reps: "8" }, edited.rows[1]];
    expect(hasUnsavedWork(snapshotDraft(pushDay()), edited)).toBe(false);
  });

  it("switching a named exercise between lift and cardio is work", () => {
    const edited = pushDay();
    edited.rows = [{ ...edited.rows[0], mode: "cardio" }, edited.rows[1]];
    expect(hasUnsavedWork(snapshotDraft(pushDay()), edited)).toBe(true);
  });

  it("a removed exercise is work", () => {
    const edited = pushDay();
    edited.rows = [edited.rows[0]];
    expect(hasUnsavedWork(snapshotDraft(pushDay()), edited)).toBe(true);
  });

  it("an added exercise is work, an added empty row is not", () => {
    const opened = snapshotDraft(pushDay());
    expect(hasUnsavedWork(opened, { ...pushDay(), rows: [...pushDay().rows, row({ name: "Dips" })] })).toBe(true);
    expect(hasUnsavedWork(opened, { ...pushDay(), rows: [...pushDay().rows, row()] })).toBe(false);
  });

  it("the same exercises in a different order is work", () => {
    const edited = pushDay();
    edited.rows = [edited.rows[1], edited.rows[0]];
    expect(hasUnsavedWork(snapshotDraft(pushDay()), edited)).toBe(true);
  });
});

describe("snapshotDraft", () => {
  it("is detached from the rows it was taken from", () => {
    const live = { name: "Legs", rows: [row({ name: "Squat" })] };
    const opened = snapshotDraft(live);
    live.rows[0].name = "Front Squat";
    live.name = "Leg Day";
    expect(opened.name).toBe("Legs");
    expect(opened.rows[0].name).toBe("Squat");
  });

  it("carries only what the lifter can see", () => {
    const withExtras = { ...row({ name: "Squat" }), id: "exercise-1", dirty: true };
    expect(snapshotDraft({ name: "Legs", rows: [withExtras] }).rows[0]).toEqual(row({ name: "Squat" }));
  });
});

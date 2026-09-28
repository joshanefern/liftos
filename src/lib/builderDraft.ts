/* ── Unsaved work in the workout builder.
   The builder asks before it throws anything away, and never asks when
   there is nothing to lose. "Something to lose" is decided here, away from
   the UI: what is on screen now is compared with what was on screen when
   the builder opened — one empty row for a new workout, the saved workout's
   rows for an edit. How a row got there (typed, dictated, designed by the
   coach) makes no difference. ── */

/** The fields of one builder row the lifter can see and change. */
export type DraftRow = {
  name: string;
  mode: "lift" | "cardio";
  sets: string;
  reps: string;
  weight: string;
  minutes: string;
};

export type BuilderDraft = {
  name: string;
  rows: readonly DraftRow[];
  /** The "Describe your workout" box — words typed or spoken to the coach. */
  ask?: string;
};

/** The row a new workout opens with, and what "Add exercise" appends. */
export const BLANK_DRAFT_ROW: DraftRow = {
  name: "",
  mode: "lift",
  sets: "3",
  reps: "",
  weight: "",
  minutes: "",
};

/** Nothing typed into it. The Lift/Cardio pill alone is a tap, not work, and
    a row without a name is dropped on save anyway. */
const isBlankRow = (row: DraftRow): boolean =>
  row.name.trim() === "" &&
  row.reps.trim() === "" &&
  row.weight.trim() === "" &&
  row.minutes.trim() === "" &&
  (row.sets.trim() === "" || row.sets.trim() === BLANK_DRAFT_ROW.sets);

const tidyRow = (row: DraftRow): DraftRow => ({
  name: row.name.trim(),
  mode: row.mode,
  sets: row.sets.trim(),
  reps: row.reps.trim(),
  weight: row.weight.trim(),
  minutes: row.minutes.trim(),
});

const sameRow = (a: DraftRow, b: DraftRow): boolean =>
  a.name === b.name &&
  a.mode === b.mode &&
  a.sets === b.sets &&
  a.reps === b.reps &&
  a.weight === b.weight &&
  a.minutes === b.minutes;

/** A detached, tidied copy: surrounding whitespace gone, blank rows dropped.
    Taken when the builder opens; later edits to the live rows cannot reach
    it. */
export const snapshotDraft = (draft: BuilderDraft): BuilderDraft => ({
  name: draft.name.trim(),
  rows: draft.rows.filter((row) => !isBlankRow(row)).map(tidyRow),
  ask: (draft.ask ?? "").trim(),
});

/** True when closing the builder now would lose something.
    `inFlight` covers words that have not landed as rows yet — speech still
    being interpreted, a design the coach is still writing. */
export const hasUnsavedWork = (
  opened: BuilderDraft,
  current: BuilderDraft,
  inFlight = false,
): boolean => {
  if (inFlight) return true;
  const before = snapshotDraft(opened);
  const now = snapshotDraft(current);
  if (before.name !== now.name || before.ask !== now.ask) return true;
  if (before.rows.length !== now.rows.length) return true;
  return before.rows.some((row, index) => !sameRow(row, now.rows[index]));
};

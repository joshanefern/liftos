/* ── Voice logging, deterministic half.
   The interpreter (edge fn "voice-log") turns a transcript into a
   VoiceIntent; this module applies that intent to the logger's live
   exercise state. Pure and heavily tested — every hallucination guard
   lives HERE, not in the model: unknown exercise names never touch
   existing rows, ordinals clamp, numbers are bounded sane.

   The logger's own types stay in the component; we type structurally
   against the exact shape it holds so state passes straight through. */

import { formatHoldInput } from "@/lib/exerciseTracking";

export type VoiceLoggedSet = {
  id: string;
  reps: string;
  weight: string;
  completed: boolean;
  targetReps: number | null;
  targetTime: number | null;
  targetWeight: number | null;
  isWarmup?: boolean;
};

export type VoiceLoggedExercise = {
  id: string;
  name: string;
  kind?: "weighted" | "bodyweight" | "cardio";
  tracking?: "reps" | "time";
  category: string;
  target: string;
  sets: VoiceLoggedSet[];
};

export type VoiceSet = {
  /** 1-based "first set / second set" reference; absent = fill next open. */
  ordinal?: number | null;
  reps?: number | null;
  weight?: number | null;
  seconds?: number | null;
};

export type VoiceAction = {
  /** EXACT session exercise name when matched; anything else = new. */
  exercise: string;
  isNew?: boolean;
  tracking?: "reps" | "time" | null;
  sets: VoiceSet[];
};

export type VoiceIntent = {
  kind: "sets" | "note" | "both" | "unclear";
  note?: string | null;
  actions?: VoiceAction[] | null;
  /** 0..1 from the interpreter; the UI previews instead of applying <0.6. */
  confidence?: number | null;
};

export type VoiceApplyResult = {
  exercises: VoiceLoggedExercise[];
  /** Human recap of what changed — the confirmation card + Undo label. */
  summary: string[];
  setsLogged: number;
  addedExercises: string[];
  note: string | null;
  /** True when nothing at all could be applied (unclear / empty intent). */
  empty: boolean;
};

const MAX_REPS = 200;
const MAX_WEIGHT = 2000;
const MAX_SECONDS = 3600;
const MAX_NEW_SETS = 20;

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Find the session exercise an action refers to. The interpreter is told
    to echo the exact session name, but we stay forgiving: exact normalized
    match, then containment either way. Never fuzzier than that — a wrong
    guess would silently corrupt a different lift's rows. */
const findExercise = (
  exercises: VoiceLoggedExercise[],
  name: string,
): VoiceLoggedExercise | null => {
  const n = norm(name);
  if (!n) return null;
  const exact = exercises.find((e) => norm(e.name) === n);
  if (exact) return exact;
  const contains = exercises.filter(
    (e) => norm(e.name).includes(n) || n.includes(norm(e.name)),
  );
  return contains.length === 1 ? contains[0] : null;
};

const sane = (v: number | null | undefined, max: number): number | null => {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const r = Math.round(v * 10) / 10;
  return r > 0 && r <= max ? r : null;
};

let idCounter = 0;
const freshId = (prefix: string): string =>
  `${prefix}-voice-${Date.now()}-${idCounter++}`;

const emptySet = (like?: VoiceLoggedSet): VoiceLoggedSet => ({
  id: freshId("set"),
  reps: "",
  weight: "",
  completed: false,
  targetReps: like?.targetReps ?? null,
  targetTime: like?.targetTime ?? null,
  targetWeight: like?.targetWeight ?? null,
});

/** Write one spoken set into a concrete row. Voice-logged sets are DONE
    sets — the lifter is reporting what happened. */
const writeSet = (
  row: VoiceLoggedSet,
  spoken: VoiceSet,
  timed: boolean,
): VoiceLoggedSet => {
  const reps = sane(spoken.reps, MAX_REPS);
  const weight = sane(spoken.weight, MAX_WEIGHT);
  const seconds = sane(spoken.seconds, MAX_SECONDS);
  return {
    ...row,
    // Timed rows keep the hold in the effort column as m:ss — a bare "120"
    // would re-parse as 1:20, silently corrupting a 2-minute hold at save.
    reps: timed
      ? seconds !== null
        ? formatHoldInput(Math.round(seconds))
        : row.reps
      : reps !== null
        ? String(Math.round(reps))
        : row.reps,
    weight: weight !== null ? String(weight) : row.weight,
    completed: true,
  };
};

const hasContent = (s: VoiceSet): boolean =>
  sane(s.reps, MAX_REPS) !== null ||
  sane(s.weight, MAX_WEIGHT) !== null ||
  sane(s.seconds, MAX_SECONDS) !== null;

const describeSet = (s: VoiceSet, timed: boolean): string => {
  const secs = sane(s.seconds, MAX_SECONDS);
  const reps = sane(s.reps, MAX_REPS);
  const weight = sane(s.weight, MAX_WEIGHT);
  if (timed && secs !== null) {
    const m = Math.floor(secs / 60);
    const rest = Math.round(secs % 60);
    const hold = m > 0 ? `${m}:${String(rest).padStart(2, "0")}` : `${rest}s`;
    return weight !== null ? `${hold} @ ${weight}` : hold;
  }
  if (reps !== null && weight !== null) return `${weight} × ${reps}`;
  if (reps !== null) return `${reps} reps`;
  if (weight !== null) return `@ ${weight}`;
  return "";
};

export const applyVoiceIntent = (
  exercises: VoiceLoggedExercise[],
  intent: VoiceIntent,
): VoiceApplyResult => {
  const note = intent.note?.trim() ? intent.note.trim() : null;
  const summary: string[] = [];
  const addedExercises: string[] = [];
  let setsLogged = 0;
  let next = exercises;

  const actions =
    intent.kind === "note" || intent.kind === "unclear"
      ? []
      : (intent.actions ?? []).filter((a) => a && a.sets?.some(hasContent));

  for (const action of actions) {
    const spokenSets = action.sets.filter(hasContent).slice(0, MAX_NEW_SETS);
    if (spokenSets.length === 0) continue;
    const existing = action.isNew ? null : findExercise(next, action.exercise);

    if (existing) {
      const timed =
        (action.tracking ?? existing.tracking ?? "reps") === "time" ||
        spokenSets.every((s) => sane(s.seconds, MAX_SECONDS) !== null && s.reps == null);
      let rows = [...existing.sets];
      // Sequential fill pointer: first non-warmup, not-completed row.
      const lines: string[] = [];
      for (const spoken of spokenSets) {
        const ordinal = sane(spoken.ordinal, 200);
        let index: number;
        if (ordinal !== null) {
          // "first set" counts working rows only; clamp to appending.
          const workingIdxs = rows
            .map((r, i) => (r.isWarmup ? -1 : i))
            .filter((i) => i >= 0);
          index =
            ordinal <= workingIdxs.length ? workingIdxs[ordinal - 1] : rows.length;
        } else {
          index = rows.findIndex((r) => !r.isWarmup && !r.completed);
          if (index < 0) index = rows.length;
        }
        if (index >= rows.length) rows = [...rows, emptySet(rows.at(-1))];
        rows = rows.map((r, i) => (i === index ? writeSet(r, spoken, timed) : r));
        setsLogged += 1;
        lines.push(describeSet(spoken, timed));
      }
      // Flip an exercise to time-tracking only when nothing rep-based has
      // been logged on it — retroactively reinterpreting completed rep rows
      // as N-second holds rewrote history.
      const hadCompletedRows = existing.sets.some((r) => r.completed && !r.isWarmup);
      next = next.map((e) =>
        e.id === existing.id
          ? {
              ...e,
              sets: rows,
              ...(timed && !hadCompletedRows && (e.tracking ?? "reps") !== "time"
                ? { tracking: "time" as const }
                : {}),
            }
          : e,
      );
      summary.push(`${existing.name} — ${lines.filter(Boolean).join(", ")}`);
      continue;
    }

    // New exercise (either declared new, or the name matched nothing —
    // NEVER guess an existing row). Planks-style holds come in as timed.
    const timed =
      action.tracking === "time" ||
      spokenSets.every((s) => sane(s.seconds, MAX_SECONDS) !== null && s.reps == null);
    const name = action.exercise.trim();
    if (!name) continue;
    const newExercise: VoiceLoggedExercise = {
      id: freshId("exercise"),
      name,
      kind: "weighted",
      ...(timed ? { tracking: "time" as const } : {}),
      category: "",
      target: "",
      sets: spokenSets.map((spoken) => writeSet(emptySet(), spoken, timed)),
    };
    setsLogged += spokenSets.length;
    addedExercises.push(name);
    next = [...next, newExercise];
    summary.push(
      `${name} (added) — ${spokenSets.map((s) => describeSet(s, timed)).filter(Boolean).join(", ")}`,
    );
  }

  if (note) summary.push(`Note: “${note}”`);

  return {
    exercises: next,
    summary,
    setsLogged,
    addedExercises,
    note,
    empty: summary.length === 0,
  };
};

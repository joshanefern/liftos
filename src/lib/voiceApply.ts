/* ── Voice logging, deterministic half.
   The interpreter (edge fn "voice-log") turns a transcript into a
   VoiceIntent; this module applies that intent to the logger's live
   exercise state. Pure and heavily tested — every hallucination guard
   lives HERE, not in the model: unknown exercise names never touch
   existing rows, ordinals clamp, numbers are bounded sane, and a
   correction never adds a set.

   The logger's own types stay in the component; we type structurally
   against the exact shape it holds so state passes straight through. */

import {
  formatHoldInput,
  inferKind,
  inferTracking,
  parseHoldSeconds,
  trackingFor,
} from "@/lib/exerciseTracking";

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
  /** "I did my goblet squats" — performed, no numbers spoken. The apply
      engine completes that exercise's planned sets from its targets. */
  done?: boolean;
  /** "actually that was 12 reps" — fix the set that was JUST logged.
      The engine rewrites that row with the spoken fields; it never adds
      a set. An empty/unmatched exercise name means the last set logged
      anywhere in the session. */
  correct?: boolean;
  /** "scratch that" — with `correct`, un-complete the last logged set
      and clear what was spoken into it (targets stay). */
  undo?: boolean;
  sets: VoiceSet[];
};

export type VoiceIntent = {
  kind: "sets" | "note" | "both" | "unclear";
  note?: string | null;
  actions?: VoiceAction[] | null;
  /** 0..1 from the interpreter; the UI re-asks instead of applying <0.5. */
  confidence?: number | null;
};

/** A set row the apply wrote or completed — the receipt's Edit button
    focuses the first one. */
export type VoiceTouchedSet = { exerciseId: string; setId: string };

export type VoiceApplyOptions = {
  /** Weight unit for receipt lines ("lb" | "kg"); defaults to "lb". */
  units?: string;
  /** Ids of the rows the lifter completed most recently, MOST RECENT FIRST.
      The logger keeps no timestamps, so without this "that was 12" /
      "scratch that" fall back to list order — wrong for supersets and any
      out-of-order logging. Ids that no longer resolve to a completed
      working row (stale, scratched, warm-up) are skipped. */
  recentSetIds?: string[];
};

export type VoiceApplyResult = {
  exercises: VoiceLoggedExercise[];
  /** Human recap of what changed — the confirmation card + Undo label.
      Each line is "<Exercise> · <detail>"; the UI splits on the first
      " · ". A note line has no separator. */
  summary: string[];
  /** Every set row written, completed, corrected or scratched, in the
      order it happened. */
  touched: VoiceTouchedSet[];
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

/** Name/detail separator on receipt lines. The UI splits on the FIRST
    one, so details may contain it only after the name. */
const SEP = " · ";
const line = (name: string, detail: string): string => `${name}${SEP}${detail}`;

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
    sets — the lifter is reporting what happened. Unspoken fields keep
    whatever the row already held, which is what makes corrections work. */
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

/** A spoken set that can land in the exercise's effort column: a hold or
    weight on a timed exercise, reps or weight on a reps one. Anything else
    would mark a row completed while writing nothing. */
const writable = (s: VoiceSet, timed: boolean): boolean =>
  timed
    ? sane(s.seconds, MAX_SECONDS) !== null || sane(s.weight, MAX_WEIGHT) !== null
    : sane(s.reps, MAX_REPS) !== null || sane(s.weight, MAX_WEIGHT) !== null;

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

type SetValues = { reps: number | null; weight: number | null; seconds: number | null };

/** Receipt detail for one set, units and meaning spelled out:
    "135 lb × 8 reps", "10 reps", "0:45 hold", "0:45 hold at 25 lb". */
const describeValues = (v: SetValues, timed: boolean, units: string): string => {
  const weight = v.weight !== null ? `${v.weight} ${units}` : null;
  if (timed) {
    if (v.seconds === null) return weight ?? "";
    const hold = `${formatHoldInput(Math.round(v.seconds))} hold`;
    return weight ? `${hold} at ${weight}` : hold;
  }
  const reps = v.reps !== null ? plural(Math.round(v.reps), "rep") : null;
  if (reps && weight) return `${weight} × ${reps}`;
  return reps ?? weight ?? "";
};

const describeSet = (s: VoiceSet, timed: boolean, units: string): string =>
  describeValues(
    {
      reps: sane(s.reps, MAX_REPS),
      weight: sane(s.weight, MAX_WEIGHT),
      seconds: sane(s.seconds, MAX_SECONDS),
    },
    timed,
    units,
  );

/** What a stored row now says — the "corrected to …" recap reads the
    merged row, not just the fields that were spoken. */
const describeRow = (row: VoiceLoggedSet, timed: boolean, units: string): string =>
  describeValues(
    {
      reps: timed ? null : sane(Number(row.reps), MAX_REPS),
      weight: sane(Number(row.weight), MAX_WEIGHT),
      seconds: timed ? sane(parseHoldSeconds(row.reps), MAX_SECONDS) : null,
    },
    timed,
    units,
  );

/** Several sets on one line. Identical sets collapse ("3 sets of 135 lb ×
    8 reps") so the detail column stays readable on a phone. */
const describeSets = (details: string[]): string => {
  const d = details.filter(Boolean);
  if (d.length === 0) return "";
  if (d.length > 1 && d.every((x) => x === d[0])) return `${d.length} sets of ${d[0]}`;
  return d.join(", ");
};

/** Indexes of working (non-warmup) rows, in order — what "first set" counts. */
const workingIndexes = (rows: VoiceLoggedSet[]): number[] =>
  rows.map((r, i) => (r.isWarmup ? -1 : i)).filter((i) => i >= 0);

/** Last completed working row in list order — the fallback when no
    recency information resolves (the logger keeps no timestamps). */
const lastCompletedIndex = (rows: VoiceLoggedSet[]): number => {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].completed && !rows[i].isWarmup) return i;
  }
  return -1;
};

type SetRef = { exercise: VoiceLoggedExercise; index: number };

/** The most recently completed working row per a most-recent-first id
    list, searched within `scope`. An id is skipped when it isn't in scope
    (a named correction ignores other lifts' rows), no longer exists, was
    since scratched, or is a warm-up. Null when nothing resolves. */
const recentCompleted = (scope: VoiceLoggedExercise[], recentIds: string[]): SetRef | null => {
  for (const id of recentIds) {
    for (const exercise of scope) {
      const index = exercise.sets.findIndex((r) => r.id === id);
      if (index < 0) continue;
      const row = exercise.sets[index];
      if (row.completed && !row.isWarmup) return { exercise, index };
    }
  }
  return null;
};

/** Which row a correction means. A named exercise → the spoken ordinal's
    row when there is one, else that exercise's most recently completed
    set. No name, or a name that matches nothing → the most recently
    completed set anywhere in the session. "Most recent" follows
    `recentIds` (most recent first) and falls back to list order only when
    none of them resolve. Null when nothing has been logged to fix. */
const correctionTarget = (
  exercises: VoiceLoggedExercise[],
  action: VoiceAction,
  recentIds: string[],
): SetRef | null => {
  const named = findExercise(exercises, action.exercise);
  if (named) {
    const ordinal = sane(action.sets?.find((s) => sane(s.ordinal, 200) !== null)?.ordinal, 200);
    if (ordinal !== null) {
      const idx = workingIndexes(named.sets)[ordinal - 1];
      return idx === undefined ? null : { exercise: named, index: idx };
    }
    const recent = recentCompleted([named], recentIds);
    if (recent) return recent;
    const idx = lastCompletedIndex(named.sets);
    return idx < 0 ? null : { exercise: named, index: idx };
  }
  const recent = recentCompleted(exercises, recentIds);
  if (recent) return recent;
  for (let i = exercises.length - 1; i >= 0; i -= 1) {
    const idx = lastCompletedIndex(exercises[i].sets);
    if (idx >= 0) return { exercise: exercises[i], index: idx };
  }
  return null;
};

export const applyVoiceIntent = (
  exercises: VoiceLoggedExercise[],
  intent: VoiceIntent,
  options?: VoiceApplyOptions,
): VoiceApplyResult => {
  const units = options?.units?.trim() || "lb";
  const recentSetIds = options?.recentSetIds ?? [];
  const note = intent.note?.trim() ? intent.note.trim() : null;
  const summary: string[] = [];
  const touched: VoiceTouchedSet[] = [];
  const addedExercises: string[] = [];
  let setsLogged = 0;
  let next = exercises;

  const actions =
    intent.kind === "note" || intent.kind === "unclear"
      ? []
      : (intent.actions ?? []).filter(
          (a) =>
            a &&
            (a.done === true ||
              a.correct === true ||
              a.undo === true ||
              a.sets?.some(hasContent)),
        );

  for (const action of actions) {
    const spokenSets = (action.sets ?? []).filter(hasContent).slice(0, MAX_NEW_SETS);

    // "Actually that was 12 reps" / "scratch that" — fix the set that was
    // just logged. Rewrites one existing row; never adds a set or an
    // exercise, whatever the interpreter put in `isNew`.
    if (action.correct === true || action.undo === true) {
      // Rows this utterance already touched are newer than anything the UI
      // remembers ("bench 185 for 8… actually 6" fixes the row just
      // written), so they lead the recency list.
      const recentIds = [...touched.map((t) => t.setId).reverse(), ...recentSetIds];
      const target = correctionTarget(next, action, recentIds);
      const spokenName = action.exercise.trim();
      if (!target) {
        summary.push(line(spokenName || "Last set", "nothing logged yet to fix"));
        continue;
      }
      const { exercise, index } = target;
      const row = exercise.sets[index];
      const timed = trackingFor(exercise) === "time";
      let updated: VoiceLoggedSet;
      let detail: string;
      if (action.undo === true) {
        const ordinal = sane(action.sets?.[0]?.ordinal, 200);
        updated = { ...row, reps: "", weight: "", completed: false };
        detail = ordinal !== null ? `set ${ordinal} scratched` : "last set scratched";
      } else {
        const spoken = spokenSets.find((s) => writable(s, timed));
        if (!spoken) {
          summary.push(line(exercise.name, "didn’t catch what to change"));
          continue;
        }
        updated = writeSet(row, spoken, timed);
        detail = `corrected to ${describeRow(updated, timed, units)}`;
      }
      next = next.map((e) =>
        e.id === exercise.id
          ? { ...e, sets: e.sets.map((r, i) => (i === index ? updated : r)) }
          : e,
      );
      touched.push({ exerciseId: exercise.id, setId: row.id });
      summary.push(line(exercise.name, detail));
      continue;
    }

    // "Did my goblet squats" — no numbers spoken. Complete the exercise's
    // planned sets: typed values stay, blank rows fill from their targets,
    // rows with neither are left alone (never invent a set that happened).
    if (spokenSets.length === 0) {
      if (action.done !== true) continue;
      const existing = action.isNew ? null : findExercise(next, action.exercise);
      if (existing) {
        // Same tracking rule as the logger/save path: explicit wins, name
        // inference fills in — raw `.tracking` alone turned "did my glute
        // bridges" into three 12-second holds.
        const timed = trackingFor(existing) === "time";
        const openRows = existing.sets.filter((r) => !r.isWarmup && !r.completed);
        if (openRows.length === 0) {
          summary.push(line(existing.name, "already done"));
          continue;
        }
        // "First set of bench done" — done with ordinal-only set refs
        // completes just those rows, never the whole exercise.
        const ordinals = (action.sets ?? [])
          .map((s) => sane(s.ordinal, 200))
          .filter((o): o is number => o !== null);
        const workingIdxs = workingIndexes(existing.sets);
        const onlyIdxs =
          ordinals.length > 0
            ? new Set(
                ordinals
                  .filter((o) => o <= workingIdxs.length)
                  .map((o) => workingIdxs[o - 1]),
              )
            : null;
        let doneCount = 0;
        const rows = existing.sets.map((row, i) => {
          if (row.isWarmup || row.completed) return row;
          if (onlyIdxs && !onlyIdxs.has(i)) return row;
          // The effort column (reps, or the hold on timed rows) must end up
          // filled — a weight with no effort is a failed lift, not a set.
          // Zero targets never fill (same >0 rule as the manual done path).
          const typedEffort = row.reps.trim() !== "";
          const fillEffort = timed
            ? row.targetTime !== null && row.targetTime > 0
              ? formatHoldInput(Math.round(row.targetTime))
              : null
            : row.targetReps !== null && row.targetReps > 0
              ? String(row.targetReps)
              : null;
          const fillWeight =
            row.targetWeight !== null && row.targetWeight > 0
              ? String(row.targetWeight)
              : null;
          if (!typedEffort && fillEffort === null) return row;
          doneCount += 1;
          touched.push({ exerciseId: existing.id, setId: row.id });
          return {
            ...row,
            reps: typedEffort ? row.reps : fillEffort ?? row.reps,
            weight: row.weight.trim() !== "" ? row.weight : fillWeight ?? row.weight,
            completed: true,
          };
        });
        if (doneCount === 0) {
          // Open rows exist but nothing honest to fill — say so instead of
          // letting an empty result read as "didn't catch that".
          summary.push(line(existing.name, "no planned numbers to fill; type them in"));
          continue;
        }
        next = next.map((e) => (e.id === existing.id ? { ...e, sets: rows } : e));
        setsLogged += doneCount;
        summary.push(line(existing.name, `${plural(doneCount, "set")} done`));
        continue;
      }
      // Named something not in the session: add it so the words are never
      // swallowed — the lifter fills in the numbers.
      const name = action.exercise.trim();
      if (!name) continue;
      const timed = (action.tracking ?? inferTracking(name)) === "time";
      next = [
        ...next,
        {
          id: freshId("exercise"),
          name,
          kind: inferKind(name),
          ...(timed ? { tracking: "time" as const } : {}),
          category: "",
          target: "",
          sets: [emptySet()],
        },
      ];
      addedExercises.push(name);
      summary.push(line(name, "(added) fill in your sets"));
      continue;
    }
    const existing = action.isNew ? null : findExercise(next, action.exercise);

    if (existing) {
      // Decide the exercise's FINAL tracking before writing anything, so the
      // stored format always matches how the save path will parse it. A flip
      // to time is blocked when completed rep rows exist (retroactive
      // reinterpretation rewrote history), and a blocked flip means timed
      // writes are unrepresentable — those spoken sets are skipped, not
      // wedged into a reps-parsed column as m:ss.
      const alreadyTimed = (existing.tracking ?? "reps") === "time";
      const wantsTimed =
        (action.tracking ?? existing.tracking ?? "reps") === "time" ||
        spokenSets.every((s) => sane(s.seconds, MAX_SECONDS) !== null && s.reps == null);
      const hadCompletedRows = existing.sets.some((r) => r.completed && !r.isWarmup);
      const timed = alreadyTimed || (wantsTimed && !hadCompletedRows);
      // Drop spoken sets whose content can't land in the final mode: a
      // seconds-only set on a reps exercise, or a reps-only set on a timed
      // one, would mark rows completed while writing nothing.
      const writableSets = spokenSets.filter((s) => writable(s, timed));
      if (writableSets.length === 0) continue;
      let rows = [...existing.sets];
      // Sequential fill pointer: first non-warmup, not-completed row.
      const details: string[] = [];
      for (const spoken of writableSets) {
        const ordinal = sane(spoken.ordinal, 200);
        let index: number;
        if (ordinal !== null) {
          // "first set" counts working rows only; clamp to appending.
          const workingIdxs = workingIndexes(rows);
          index =
            ordinal <= workingIdxs.length ? workingIdxs[ordinal - 1] : rows.length;
        } else {
          index = rows.findIndex((r) => !r.isWarmup && !r.completed);
          if (index < 0) index = rows.length;
        }
        if (index >= rows.length) rows = [...rows, emptySet(rows.at(-1))];
        rows = rows.map((r, i) => (i === index ? writeSet(r, spoken, timed) : r));
        setsLogged += 1;
        touched.push({ exerciseId: existing.id, setId: rows[index].id });
        details.push(describeSet(spoken, timed, units));
      }
      next = next.map((e) =>
        e.id === existing.id
          ? {
              ...e,
              sets: rows,
              ...(timed && !alreadyTimed ? { tracking: "time" as const } : {}),
            }
          : e,
      );
      summary.push(line(existing.name, describeSets(details)));
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
      kind: inferKind(name),
      ...(timed ? { tracking: "time" as const } : {}),
      category: "",
      target: "",
      sets: spokenSets.map((spoken) => writeSet(emptySet(), spoken, timed)),
    };
    setsLogged += spokenSets.length;
    addedExercises.push(name);
    next = [...next, newExercise];
    for (const s of newExercise.sets) touched.push({ exerciseId: newExercise.id, setId: s.id });
    summary.push(
      line(
        name,
        `(added) ${describeSets(spokenSets.map((s) => describeSet(s, timed, units)))}`,
      ),
    );
  }

  if (note) summary.push(`Note: “${note}”`);

  return {
    exercises: next,
    summary,
    touched,
    setsLogged,
    addedExercises,
    note,
    empty: summary.length === 0,
  };
};

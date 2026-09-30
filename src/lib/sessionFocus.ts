import { formatHold, parseCardioSeconds, parseHoldSeconds } from "@/lib/exerciseTracking";

/* ── Session focus — which exercise and set the live workout screen points
     at, and the words it uses for them.

     The screen shows ONE focus card (the exercise being worked) above a
     compact list of every exercise. Both read these decisions, so they can
     never disagree about what is current:

       focus     the first exercise with an open working set, unless the
                 lifter picked one by hand. A pick holds until that exercise
                 is complete, then the focus moves on by itself.
       current   the first open WORKING set of the focused exercise.
       warm-ups  never current and never counted — a skipped ramp must not
                 hold the focus on an exercise the lifter has moved past.
       all done  logging the last open set leaves the card on the exercise
                 it belonged to; the focus is null only when nothing has
                 been pointed at (a resumed or empty workout). ── */

export type FocusSet = { id: string; completed: boolean; isWarmup?: boolean };

export type FocusExercise<S extends FocusSet = FocusSet> = {
  id: string;
  name: string;
  sets: S[];
};

/** A manual pick from the exercise list. */
export type FocusPin = {
  exerciseId: string;
  /** Whether the exercise has had open work while pinned. A pin on an
      exercise with work left releases when that work is done; a pin placed
      on a finished exercise (to check or fix it) holds until the lifter
      picks something else. */
  hadOpenSets: boolean;
};

export type SetPosition<S extends FocusSet = FocusSet> = {
  set: S;
  /** Index in the exercise's full set list, warm-ups included. */
  setIndex: number;
  /** 1-based among working sets. */
  ordinal: number;
  workingTotal: number;
};

export type UpNext<E extends FocusExercise = FocusExercise> = {
  exercise: E;
} & SetPosition<E["sets"][number]>;

/** The first open working set of one exercise, or null when none is left. */
export const currentSetOf = <S extends FocusSet>(exercise: {
  sets: S[];
}): SetPosition<S> | null => {
  let workingTotal = 0;
  let found: { set: S; setIndex: number; ordinal: number } | null = null;
  for (let setIndex = 0; setIndex < exercise.sets.length; setIndex++) {
    const set = exercise.sets[setIndex];
    if (set.isWarmup) continue;
    workingTotal += 1;
    if (found === null && !set.completed) found = { set, setIndex, ordinal: workingTotal };
  }
  return found === null ? null : { ...found, workingTotal };
};

export const hasOpenSet = (exercise: { sets: FocusSet[] }): boolean =>
  exercise.sets.some((set) => !set.isWarmup && !set.completed);

export type SetsProgress = { done: number; total: number; complete: boolean };

/** Working sets only. An exercise with no working sets is never "complete". */
export const setsProgress = (exercise: { sets: FocusSet[] }): SetsProgress => {
  let done = 0;
  let total = 0;
  for (const set of exercise.sets) {
    if (set.isWarmup) continue;
    total += 1;
    if (set.completed) done += 1;
  }
  return { done, total, complete: total > 0 && done === total };
};

/** How each row of the focus card renders: a logged row, THE current row,
    or an open row that is not current (upcoming sets, unticked warm-ups). */
export type RowState = "done" | "current" | "open";

export const rowStates = (exercise: { sets: FocusSet[] }): RowState[] => {
  const current = currentSetOf(exercise);
  return exercise.sets.map((set, index) => {
    if (set.completed) return "done";
    return current !== null && current.setIndex === index ? "current" : "open";
  });
};

/** Every set "Complete remaining sets" would tick, in order — warm-ups too. */
export const openSetIds = (exercise: { sets: FocusSet[] }): string[] =>
  exercise.sets.filter((set) => !set.completed).map((set) => set.id);

/** Pin for a row the lifter tapped; null when the exercise is gone. */
export const pinFor = (exercises: FocusExercise[], exerciseId: string): FocusPin | null => {
  const exercise = exercises.find((e) => e.id === exerciseId);
  return exercise ? { exerciseId, hadOpenSets: hasOpenSet(exercise) } : null;
};

/** Bring a pin up to date with the sets. Returns the SAME object when
    nothing changed, so it is safe to feed straight into a state setter. */
export const settlePin = (exercises: FocusExercise[], pin: FocusPin | null): FocusPin | null => {
  if (pin === null) return null;
  const exercise = exercises.find((e) => e.id === pin.exerciseId);
  if (!exercise) return null;
  if (hasOpenSet(exercise)) return pin.hadOpenSets ? pin : { ...pin, hadOpenSets: true };
  return pin.hadOpenSets ? null : pin;
};

/** The pin once a set of `exerciseId` has just been logged. While any
    working set is still open, nothing changes: the pin is handed back and
    the usual rules move the focus on. With nothing left to log anywhere,
    the card stays on the exercise that was just logged, held the way a
    finished exercise picked from the list is — its logged sets and "Add
    set" stay on screen. Without this a workout logged as you go (one set
    planned at a time) loses its exercise from the card after every set. */
export const pinAfterLogging = (
  exercises: FocusExercise[],
  pin: FocusPin | null,
  exerciseId: string,
): FocusPin | null => {
  if (exercises.some(hasOpenSet)) return pin;
  if (!exercises.some((e) => e.id === exerciseId)) return pin;
  return pin !== null && pin.exerciseId === exerciseId && !pin.hadOpenSets
    ? pin
    : { exerciseId, hadOpenSets: false };
};

/** The focused exercise's id. With no pin in force it is the first exercise
    in workout order that still has an open working set — so an exercise
    that was skipped comes back up as soon as the picked one is finished.
    null = nothing left to do (or nothing planned). */
export const resolveFocusId = (exercises: FocusExercise[], pin: FocusPin | null): string | null => {
  const settled = settlePin(exercises, pin);
  if (settled !== null) return settled.exerciseId;
  return exercises.find(hasOpenSet)?.id ?? null;
};

/** The set that gets logged next: the focused exercise's current set, or —
    when the focus sits on a finished exercise — the first open set in the
    workout. null when every working set is done. */
export const upNextOf = <E extends FocusExercise>(
  exercises: E[],
  pin: FocusPin | null,
): UpNext<E> | null => {
  const focusId = resolveFocusId(exercises, pin);
  const ordered = [
    ...exercises.filter((e) => e.id === focusId),
    ...exercises.filter((e) => e.id !== focusId),
  ];
  for (const exercise of ordered) {
    const position = currentSetOf<E["sets"][number]>(exercise);
    if (position !== null) return { exercise, ...position };
  }
  return null;
};

/** Every working set in the workout is logged — and at least one was:
    the screen offers "Finish workout" in a card of its own under the
    focus card, never inside it. Warm-ups neither hold it back nor count
    toward it. A set un-marked or added takes it away again. */
export const everySetLogged = (exercises: FocusExercise[]): boolean =>
  !exercises.some(hasOpenSet) &&
  exercises.some((exercise) => exercise.sets.some((set) => !set.isWarmup && set.completed));

// ── Rest ────────────────────────────────────────────────────────────────────
//
// A rest belongs to the exercise whose set started it: it is the pause
// between that exercise's sets, and it ends with the exercise. So a rest
// starts only after a set that leaves its exercise with a working set
// still open (never after an exercise's last set), and a running rest
// stops being owed the moment that stops being true — the exercise is
// finished, or the set that started it is no longer logged.

/** The set whose logging started the running rest. */
export type RestOwner = { exerciseId: string; setId: string };

/** Whether a set just logged on `exerciseId` is followed by a rest (when
    the lifter has the rest timer on): only while that exercise still has
    an open working set. */
export const restsAfter = (exercises: FocusExercise[], exerciseId: string): boolean => {
  const exercise = exercises.find((e) => e.id === exerciseId);
  return exercise !== undefined && hasOpenSet(exercise);
};

/** Whether a running rest still has something to be a rest before. A
    rest with no known owner (saved before rests had one) holds while
    anything is left to log. */
export const restHolds = (exercises: FocusExercise[], owner: RestOwner | null): boolean => {
  if (owner === null) return exercises.some(hasOpenSet);
  const exercise = exercises.find((e) => e.id === owner.exerciseId);
  if (exercise === undefined || !hasOpenSet(exercise)) return false;
  return exercise.sets.some((set) => set.id === owner.setId && set.completed);
};

/** The set a voice log counts as logging, for the rest — the one whose
    logging ends the running rest and may start the next, exactly as a set
    logged by hand does. Only a row the log newly completed counts: "that
    was 12" rewrites a set already on the books, and the rest carries on
    through it. The last such row wins.

    `before` is the session the log was applied to. When the log REPLACES
    an earlier one (speech resumed in the grace window), that is the
    session with the earlier log taken back — so the rows the replacement
    logs again are new, and a running rest follows the replacement. The
    one exception: the replacement logging again the very set whose rest
    is running ("bench 8" … "at 135") — that is the same pause, and it
    carries on instead of restarting from full.

    null: the log leaves the rest alone. */
export const voiceLoggedSet = (
  before: FocusExercise[],
  after: FocusExercise[],
  touched: RestOwner[],
  running: RestOwner | null,
): RestOwner | null => {
  const loggedIn = (exercises: FocusExercise[]): Set<string> =>
    new Set(exercises.flatMap((e) => e.sets.filter((s) => s.completed).map((s) => s.id)));
  const was = loggedIn(before);
  const now = loggedIn(after);
  const last = [...touched].reverse().find((t) => now.has(t.setId) && !was.has(t.setId));
  if (last === undefined) return null;
  if (running !== null && running.setId === last.setId) return null;
  return { exerciseId: last.exerciseId, setId: last.setId };
};

/** The set a rest is a pause before — what its "Next:" line names: the
    owning exercise's current set. Without an owner, whatever is up next. */
export const restNextOf = <E extends FocusExercise>(
  exercises: E[],
  owner: RestOwner | null,
  pin: FocusPin | null,
): UpNext<E> | null => {
  if (owner === null) return upNextOf(exercises, pin);
  const exercise = exercises.find((e) => e.id === owner.exerciseId);
  if (exercise === undefined) return null;
  const position = currentSetOf<E["sets"][number]>(exercise);
  return position === null ? null : { exercise, ...position };
};

// ── Words ───────────────────────────────────────────────────────────────────

/** "set 2 of 3" — the mid-sentence form. */
export const setPosition = (ordinal: number, total: number): string =>
  `set ${ordinal} of ${total}`;

/** "Set 2 of 3" */
export const setOfLabel = (ordinal: number, total: number): string =>
  `Set ${ordinal} of ${total}`;

/** A logged set's check, for screen readers: "Set 2 logged — tap to
    unmark" · "Warm-up set logged — tap to unmark". `ordinal` is 1-based
    among working sets. The same words folded or open, so the one control
    never reads as two. */
export const unmarkLabel = (ordinal: number, isWarmup: boolean): string =>
  `${isWarmup ? "Warm-up set" : `Set ${ordinal}`} logged — tap to unmark`;

/** "1 of 3 sets" · "0 of 1 set" · "No sets" */
export const progressLabel = ({ done, total }: Pick<SetsProgress, "done" | "total">): string => {
  if (total === 0) return "No sets";
  return `${done} of ${total} ${total === 1 ? "set" : "sets"}`;
};

/** Rest countdown as m:ss — "2:00", "0:09". */
export const formatRestClock = (seconds: number): string => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const trimNumber = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");

const positive = (raw: string): number | null => {
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export type SummaryMode = "reps" | "time" | "cardio";

/** One-line read-back of a logged set: "8 × 135 lb", "10 reps", "1:30 at
    25 lb", "30 min · 3.1 mi". `unit` is the weight unit for lifts and holds
    and the distance unit for cardio. A set logged without any numbers
    reads "Done" — it still counts, there is just nothing to quote. */
export const setSummary = (
  set: { reps: string; weight: string },
  mode: SummaryMode,
  unit: string,
): string => {
  const load = positive(set.weight);

  if (mode === "cardio") {
    const seconds = parseCardioSeconds(set.reps);
    const parts: string[] = [];
    if (seconds !== null) {
      parts.push(seconds % 60 === 0 ? `${seconds / 60} min` : formatHold(seconds));
    }
    if (load !== null) parts.push(`${trimNumber(load)} ${unit}`);
    return parts.length > 0 ? parts.join(" · ") : "Done";
  }

  if (mode === "time") {
    const seconds = parseHoldSeconds(set.reps);
    if (seconds !== null) {
      return load !== null
        ? `${formatHold(seconds)} at ${trimNumber(load)} ${unit}`
        : formatHold(seconds);
    }
    return load !== null ? `${trimNumber(load)} ${unit}` : "Done";
  }

  const reps = positive(set.reps);
  if (reps !== null && load !== null) return `${trimNumber(reps)} × ${trimNumber(load)} ${unit}`;
  if (reps !== null) return `${trimNumber(reps)} ${reps === 1 ? "rep" : "reps"}`;
  return load !== null ? `${trimNumber(load)} ${unit}` : "Done";
};

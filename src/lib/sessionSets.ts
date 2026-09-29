/* ── Taking a set off an exercise during the live workout.

     "Add set" appends a row; this is its inverse. Without one, a row added
     by a slip of the thumb (or a planned set the lifter decides to drop)
     could only be got rid of by logging a set that never happened.

     Rules:
       open only   a logged set is never removed directly — it is
                   un-marked first (a tap on its check), so nothing that
                   counted disappears in one tap.
       last first  the row that goes is the LAST open one that can, the
                   mirror of where "Add set" puts a new one.
       never empty an exercise always keeps a working set. ── */

export type RemovableSet = { id: string; completed: boolean; isWarmup?: boolean };

export type RemovalTarget<S extends RemovableSet = RemovableSet> = {
  set: S;
  /** Index in the exercise's full set list, warm-ups included. */
  setIndex: number;
  /** 1-based among working sets; null for a warm-up row. */
  ordinal: number | null;
};

const canGo = (sets: RemovableSet[], index: number): boolean => {
  const set = sets[index];
  if (!set || set.completed) return false;
  if (set.isWarmup) return sets.length > 1;
  return sets.some((other, i) => i !== index && !other.isWarmup);
};

/** The row "Remove set" would take off, or null when nothing can go. */
export const removableSetOf = <S extends RemovableSet>(exercise: {
  sets: S[];
}): RemovalTarget<S> | null => {
  const { sets } = exercise;
  for (let setIndex = sets.length - 1; setIndex >= 0; setIndex -= 1) {
    const set = sets[setIndex];
    if (set.completed || !canGo(sets, setIndex)) continue;
    const ordinal = set.isWarmup
      ? null
      : sets.slice(0, setIndex + 1).filter((s) => !s.isWarmup).length;
    return { set, setIndex, ordinal };
  }
  return null;
};

/** The exercises with one set taken off. Returns the SAME array when the
    set is missing, logged, or the exercise's only working set. */
export const withoutSet = <E extends { id: string; sets: RemovableSet[] }>(
  exercises: E[],
  exerciseId: string,
  setId: string,
): E[] => {
  const exercise = exercises.find((e) => e.id === exerciseId);
  if (!exercise) return exercises;
  const index = exercise.sets.findIndex((set) => set.id === setId);
  if (index < 0 || !canGo(exercise.sets, index)) return exercises;
  return exercises.map((e) =>
    e.id === exerciseId ? { ...e, sets: e.sets.filter((set) => set.id !== setId) } : e,
  );
};

/** "Remove set 4" · "Remove warm-up set" */
export const removeSetLabel = (target: Pick<RemovalTarget, "ordinal">): string =>
  target.ordinal === null ? "Remove warm-up set" : `Remove set ${target.ordinal}`;

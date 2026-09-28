/* ── Undoing a voice log without undoing the lifter.

     Undo cannot simply put back the session as it was before the voice
     log: anything done by hand in between — a set logged with the button,
     a number typed, a note — would go with it. And Undo is not always a
     tap: speech that resumes inside the grace window takes the first log
     back by itself, once the merged sentence has been understood and is
     about to replace it (lib/voiceSupersede).

     So it is a three-way merge. Given the session BEFORE the voice log,
     straight AFTER it, and as it is NOW, only what voice changed is put
     back, and only where the lifter has not touched it since:

       row voice rewrote     restored, unless it was edited afterwards
       row voice added       removed, unless it was edited afterwards
       exercise voice added  removed, unless it was edited afterwards
       everything else       left exactly as it is now ── */

type Row = { id: string };
type Exercise = { id: string; sets: Row[] };

const fieldsOf = (value: object): Record<string, unknown> => value as Record<string, unknown>;

/** Same fields, same values. Rows hold only primitives. */
const sameFields = (a: object, b: object, skip?: string): boolean => {
  const left = fieldsOf(a);
  const right = fieldsOf(b);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (key === skip) continue;
    if (left[key] !== right[key]) return false;
  }
  return true;
};

const sameExercise = (a: Exercise, b: Exercise): boolean =>
  sameFields(a, b, "sets") &&
  a.sets.length === b.sets.length &&
  a.sets.every((row, i) => sameFields(row, b.sets[i]));

export const revertVoiceApply = <E extends Exercise>(before: E[], after: E[], now: E[]): E[] => {
  const beforeById = new Map(before.map((e) => [e.id, e]));
  const afterById = new Map(after.map((e) => [e.id, e]));
  const out: E[] = [];

  for (const exercise of now) {
    const was = beforeById.get(exercise.id);
    const became = afterById.get(exercise.id);
    // Not part of the voice log at all (added by hand since).
    if (!became) {
      out.push(exercise);
      continue;
    }
    if (!was) {
      // Voice added it: it goes, unless the lifter has worked in it since.
      if (!sameExercise(exercise, became)) out.push(exercise);
      continue;
    }

    const wasRows = new Map(was.sets.map((row) => [row.id, row]));
    const becameRows = new Map(became.sets.map((row) => [row.id, row]));
    let changed = false;
    const sets: Row[] = [];
    for (const row of exercise.sets) {
      const rowBecame = becameRows.get(row.id);
      const rowWas = wasRows.get(row.id);
      const untouchedSince = rowBecame !== undefined && sameFields(row, rowBecame);
      if (rowBecame !== undefined && rowWas === undefined) {
        if (untouchedSince) changed = true;
        else sets.push(row);
        continue;
      }
      if (rowWas !== undefined && untouchedSince && !sameFields(rowWas, rowBecame)) {
        sets.push(rowWas);
        changed = true;
        continue;
      }
      sets.push(row);
    }

    // Exercise-level fields voice set (a flip to timed) go back the same way.
    const merged: Record<string, unknown> = { ...fieldsOf(exercise), sets };
    const wasFields = fieldsOf(was);
    const becameFields = fieldsOf(became);
    const nowFields = fieldsOf(exercise);
    for (const key of new Set([...Object.keys(wasFields), ...Object.keys(becameFields)])) {
      if (key === "sets" || key === "id") continue;
      if (wasFields[key] === becameFields[key] || nowFields[key] !== becameFields[key]) continue;
      if (key in wasFields) merged[key] = wasFields[key];
      else delete merged[key];
      changed = true;
    }

    out.push(changed ? (merged as unknown as E) : exercise);
  }
  return out;
};

/** Take back the note a voice log appended, and nothing else. The logger
    appends it as a new line (or as the whole note when there was none).
    If the lifter has rewritten that line since, the notes stay as they are. */
export const revertVoiceNote = (now: string, note: string | null): string => {
  const spoken = note?.trim();
  if (!spoken) return now;
  if (now.trim() === spoken) return "";
  const appended = `\n${spoken}`;
  const at = now.lastIndexOf(appended);
  if (at >= 0) {
    const tail = now.slice(at + appended.length);
    // Only a whole line: "…\nfelt strong" must not match "…\nfelt stronger".
    if (tail === "" || tail.startsWith("\n")) return `${now.slice(0, at)}${tail}`;
  }
  if (now.startsWith(`${spoken}\n`)) return now.slice(spoken.length + 1);
  return now;
};

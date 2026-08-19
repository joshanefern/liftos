import type { WorkoutExercise, WorkoutSet } from "@/data/liftosMock";

/* ── "Save what I actually did as a workout." Turns a finished session's
   exercises (live logger state or a saved log row) into template
   exercises: completed working sets only, achieved numbers become the
   targets. Warmups are session-time artifacts and never saved. ── */

type DoneSetLike = {
  reps?: number | string | null;
  weight?: number | string | null;
  duration_seconds?: number | null;
  completed?: boolean;
  isWarmup?: boolean;
};

type DoneExerciseLike = {
  name: string;
  kind?: "weighted" | "bodyweight" | "cardio";
  tracking?: "reps" | "time";
  category?: string;
  target?: string;
  sets: DoneSetLike[];
};

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

let idCounter = 0;
const freshId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${idCounter++}`;

/** Template exercises from what was actually done. Exercises with zero
    completed working sets are dropped — an aspirational row you skipped is
    not part of the workout you did. */
export const sessionToTemplateExercises = (
  exercises: DoneExerciseLike[],
): WorkoutExercise[] => {
  const out: WorkoutExercise[] = [];
  for (const exercise of exercises) {
    const done = exercise.sets.filter((s) => s.completed && !s.isWarmup);
    if (done.length === 0) continue;
    const timed = exercise.tracking === "time";
    const sets: WorkoutSet[] = done.map((s) => ({
      id: freshId("set"),
      reps: timed ? 0 : Math.round(num(s.reps)),
      weight: num(s.weight),
      ...(timed
        ? {
            duration_seconds:
              typeof s.duration_seconds === "number" && s.duration_seconds > 0
                ? Math.round(s.duration_seconds)
                : Math.round(num(s.reps)), // logger keeps holds in the reps field as seconds
          }
        : {}),
    }));
    out.push({
      id: freshId("exercise"),
      name: exercise.name,
      ...(exercise.kind ? { kind: exercise.kind } : {}),
      ...(timed ? { tracking: "time" as const } : {}),
      category: exercise.category ?? "",
      target: "",
      sets,
    });
  }
  return out;
};

/** Did the session's exercise LIST drift from its template seed? (Names
    added or removed — set/rep changes alone are normal training, not a
    template change.) */
export const exerciseListChanged = (
  seedNames: string[],
  finalExercises: DoneExerciseLike[],
): boolean => {
  const norm = (s: string) => s.trim().toLowerCase();
  const seed = new Set(seedNames.map(norm));
  const done = sessionToTemplateExercises(finalExercises).map((e) => norm(e.name));
  if (done.length === 0) return false;
  const final = new Set(done);
  if (final.size !== seed.size) return true;
  for (const name of final) if (!seed.has(name)) return true;
  return false;
};

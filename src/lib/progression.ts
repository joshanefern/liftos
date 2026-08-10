import type { WorkoutSet } from "@/data/liftosMock";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { lookupMuscles, type Muscle } from "@/lib/muscleMap";
import type { WeightUnit } from "@/lib/warmup";

export type ProgressionKind = "add_weight" | "add_reps" | "hold" | "deload";

export type ProgressionSuggestion = {
  kind: ProgressionKind;
  /** Signed weight change in the user's unit; only on add_weight / deload. */
  delta?: number;
  message: string;
};

export type ProgressionOptions = {
  unit: WeightUnit;
  targetRepRange?: [number, number];
};

// Squat/deadlift/leg patterns tolerate bigger jumps than upper-body lifts.
const LOWER_BODY: Muscle[] = ["quadriceps", "hamstring", "gluteal", "adductor", "calves"];

const isLowerBody = (exerciseName: string): boolean => {
  const mapping = lookupMuscles(exerciseName);
  return mapping !== null && mapping.primary.some((m) => LOWER_BODY.includes(m));
};

const completedWorkingSets = (sets: WorkoutSet[]): WorkoutSet[] =>
  sets.filter((s) => s.completed && !s.isWarmup && typeof s.reps === "number");

const evaluate = (
  sets: WorkoutSet[],
  exerciseName: string,
  lo: number,
  hi: number,
  unit: WeightUnit,
): ProgressionSuggestion => {
  const reps = sets.map((s) => s.reps as number);
  const topWeight = Math.max(...sets.map((s) => s.weight ?? 0));
  const increment = unit === "kg" ? 2.5 : 5;

  if (reps.every((r) => r >= hi)) {
    const delta = isLowerBody(exerciseName) ? increment * 2 : increment;
    const at = topWeight > 0 ? ` at ${topWeight} ${unit}` : "";
    return {
      kind: "add_weight",
      delta,
      message: `Every set hit ${hi}+ reps${at} — add ${delta} ${unit} next session.`,
    };
  }

  const below = reps.filter((r) => r < lo).length;
  if (below > 0) {
    // Most sets under range → back off ~5%; a single miss just holds.
    if (below * 2 > reps.length && topWeight > 0) {
      const delta = -Math.max(
        increment,
        Math.round((topWeight * 0.05) / increment) * increment,
      );
      return {
        kind: "deload",
        delta,
        message: `Most sets fell below ${lo} reps — drop ~5% (${delta} ${unit}) and rebuild.`,
      };
    }
    return {
      kind: "hold",
      message: `A set fell below ${lo} reps — hold the weight until every set reaches ${lo}+.`,
    };
  }

  return {
    kind: "add_reps",
    message: `In range — add a rep, working toward ${hi} on every set before adding weight.`,
  };
};

/**
 * Double-progression hint from the most recent session containing the exercise
 * with at least one completed working (non-warmup) set. Null when no such
 * session exists.
 */
export const suggestProgression = (
  history: WorkoutLog[],
  exerciseName: string,
  opts: ProgressionOptions,
): ProgressionSuggestion | null => {
  const [lo, hi] = opts.targetRepRange ?? [8, 12];
  const normalized = exerciseName.trim().toLowerCase();
  if (!normalized) return null;

  // History arrives newest-first, but don't depend on it.
  const sorted = [...history].sort(
    (a, b) => new Date(b.finished_at).getTime() - new Date(a.finished_at).getTime(),
  );

  for (const log of sorted) {
    for (const ex of log.exercises) {
      if (ex.name.trim().toLowerCase() !== normalized) continue;
      const sets = completedWorkingSets(ex.sets);
      if (sets.length === 0) continue;
      return evaluate(sets, exerciseName, lo, hi, opts.unit);
    }
  }
  return null;
};

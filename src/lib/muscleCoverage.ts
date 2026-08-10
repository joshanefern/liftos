import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { lookupMuscles, type Muscle } from "@/lib/muscleMap";

/* ── Muscle coverage — the ONE staleness convention.
     Extracted from Progress so the Progress screen and the suggestion
     engine can never drift apart on what "days since trained" means. ── */

export const MUSCLE_LABELS: Partial<Record<Muscle, string>> = {
  trapezius: "Traps",
  "upper-back": "Upper back",
  "lower-back": "Lower back",
  chest: "Chest",
  biceps: "Biceps",
  triceps: "Triceps",
  forearm: "Forearms",
  "back-deltoids": "Rear delts",
  "front-deltoids": "Front delts",
  abs: "Abs",
  obliques: "Obliques",
  adductor: "Adductors",
  hamstring: "Hamstrings",
  quadriceps: "Quads",
  calves: "Calves",
  gluteal: "Glutes",
};

/** Human label in the Progress coverage style ("Rear delts", not "back-deltoids"). */
export const labelForMuscle = (muscle: Muscle): string =>
  MUSCLE_LABELS[muscle] ?? muscle.replace(/-/g, " ");

// Only muscles the activation engine can actually attribute exercises to —
// "abductors"/"neck" have no mappings, so listing them would be noise.
export const TRACKED_MUSCLES: Muscle[] = [
  "chest",
  "upper-back",
  "lower-back",
  "trapezius",
  "front-deltoids",
  "back-deltoids",
  "biceps",
  "triceps",
  "forearm",
  "abs",
  "obliques",
  "quadriceps",
  "hamstring",
  "gluteal",
  "adductor",
  "calves",
];

/**
 * Most recent finished_at (epoch ms) per muscle, counting only exercises where
 * that muscle is a PRIMARY mover with at least one completed set. Secondary
 * activation deliberately doesn't count — bench press shouldn't reset the
 * clock on rear delts.
 */
export const getLastTrainedByMuscle = (logs: WorkoutLog[]): Map<Muscle, number> => {
  const lastTrained = new Map<Muscle, number>();
  for (const log of logs) {
    const time = new Date(log.finished_at).getTime();
    if (!Number.isFinite(time)) continue;
    for (const exercise of log.exercises) {
      if (!exercise.sets.some((s) => s.completed)) continue;
      const mapping = lookupMuscles(exercise.name);
      if (!mapping) continue;
      for (const muscle of mapping.primary) {
        lastTrained.set(muscle, Math.max(lastTrained.get(muscle) ?? 0, time));
      }
    }
  }
  return lastTrained;
};

import type { WorkoutExercise } from "@/data/liftosMock";

/* ── When the coach writes out a workout ("Bench 3×8 @ 185", table rows,
   bullet plans), the reply becomes save-able: this parses those lines
   into template exercises so one tap lands the plan in My Workouts.
   Deterministic and conservative — fewer than two recognizable exercise
   lines means no offer at all. ── */

export type ParsedPlanExercise = {
  name: string;
  sets: number;
  reps: number;
  weight: number;
};

// "Bench Press: 3×8 @ 185", "- Squat — 4 x 6", "1. Bench Press: 3x8",
// "| Deadlift | 3×5 @ 225 |", and table rows with the weight in its own
// cell: "| Bench | 4×6 | 185 lb |".
const LINE_PATTERN =
  /^[\s|*•-]*(?:\d{1,2}[.)]\s+)?\**([A-Za-z][A-Za-z0-9 /()'’.-]{2,40}?)\**\s*[:|—–-]?\s*\|?\s*(\d{1,2})\s*[x×]\s*(\d{1,3})(?:\s*(?:@|at|\|)\s*(\d{1,4}(?:\.\d)?)\s*(?:lb|kg)?)?/i;

/** Words that mean the "name" wasn't an exercise — day headers, totals, and
    coaching prose ("Add weight once you can hit 3x12" is a tip, not a lift). */
const NOT_EXERCISES =
  /^(day|week|rest|warm ?up|cool ?down|total|superset|round|set|add|aim|try|increase|keep|focus|remember|note|start|perform|complete|repeat|alternate|progress|once|when|if|after)s?\b/i;

export const extractWorkoutPlan = (text: string): ParsedPlanExercise[] => {
  const seen = new Map<string, ParsedPlanExercise>();
  for (const rawLine of text.split("\n")) {
    const match = LINE_PATTERN.exec(rawLine);
    if (!match) continue;
    const name = match[1].trim().replace(/\s{2,}/g, " ");
    if (name.length < 3 || NOT_EXERCISES.test(name)) continue;
    const sets = Math.min(parseInt(match[2], 10) || 0, 20);
    const reps = Math.min(parseInt(match[3], 10) || 0, 200);
    if (sets < 1 || reps < 1) continue;
    const weight = match[4] ? Math.min(parseFloat(match[4]), 2000) : 0;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, { name, sets, reps, weight });
  }
  return [...seen.values()].slice(0, 12);
};

let planIdCounter = 0;

/** Template exercises from a parsed plan — same shape the builder saves. */
export const planToTemplateExercises = (
  plan: ParsedPlanExercise[],
  workoutName: string,
): WorkoutExercise[] =>
  plan.map((exercise) => {
    planIdCounter += 1;
    const id = `coach-${Date.now()}-${planIdCounter}`;
    return {
      id,
      name: exercise.name,
      category: workoutName,
      target: `${exercise.sets} × ${exercise.reps}${exercise.weight > 0 ? ` @ ${exercise.weight}` : ""}`,
      sets: Array.from({ length: exercise.sets }, (_, index) => ({
        id: `${id}-set-${index + 1}`,
        reps: exercise.reps,
        weight: exercise.weight,
      })),
    };
  });

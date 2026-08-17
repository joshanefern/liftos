import type { WorkoutLog } from "@/hooks/useWorkoutLogs";

export type Muscle =
  | "trapezius"
  | "upper-back"
  | "lower-back"
  | "chest"
  | "biceps"
  | "triceps"
  | "forearm"
  | "back-deltoids"
  | "front-deltoids"
  | "abs"
  | "obliques"
  | "adductor"
  | "abductors"
  | "hamstring"
  | "quadriceps"
  | "calves"
  | "gluteal"
  | "neck";

type MuscleMapping = { primary: Muscle[]; secondary: Muscle[] };

const exact: Record<string, MuscleMapping> = {
  // Push — chest
  "bench press": { primary: ["chest"], secondary: ["triceps", "front-deltoids"] },
  "barbell bench press": { primary: ["chest"], secondary: ["triceps", "front-deltoids"] },
  "incline bench press": { primary: ["chest"], secondary: ["front-deltoids", "triceps"] },
  "incline dumbbell press": { primary: ["chest"], secondary: ["front-deltoids", "triceps"] },
  "dumbbell bench press": { primary: ["chest"], secondary: ["triceps", "front-deltoids"] },
  "decline bench press": { primary: ["chest"], secondary: ["triceps"] },
  "machine chest press": { primary: ["chest"], secondary: ["triceps", "front-deltoids"] },
  "chest fly": { primary: ["chest"], secondary: ["front-deltoids"] },
  "cable fly": { primary: ["chest"], secondary: ["front-deltoids"] },
  "pec deck": { primary: ["chest"], secondary: [] },
  "push-up": { primary: ["chest"], secondary: ["triceps", "front-deltoids"] },
  "dip": { primary: ["chest", "triceps"], secondary: ["front-deltoids"] },

  // Push — shoulders
  "overhead press": { primary: ["front-deltoids"], secondary: ["triceps", "chest"] },
  "military press": { primary: ["front-deltoids"], secondary: ["triceps"] },
  "shoulder press": { primary: ["front-deltoids"], secondary: ["triceps"] },
  "dumbbell shoulder press": { primary: ["front-deltoids"], secondary: ["triceps"] },
  "arnold press": { primary: ["front-deltoids"], secondary: ["triceps"] },
  // Listed before the fuzzy push-up rule can claim it for chest — pike
  // push-ups shift the load onto the shoulders.
  "pike push-up": { primary: ["front-deltoids"], secondary: ["triceps", "chest"] },
  "lateral raise": { primary: ["back-deltoids", "front-deltoids"], secondary: [] },
  "cable lateral raise": { primary: ["back-deltoids", "front-deltoids"], secondary: [] },
  "front raise": { primary: ["front-deltoids"], secondary: [] },
  "rear delt fly": { primary: ["back-deltoids"], secondary: ["upper-back"] },
  "reverse fly": { primary: ["back-deltoids"], secondary: ["upper-back"] },
  "face pull": { primary: ["back-deltoids", "trapezius"], secondary: ["upper-back"] },

  // Push — triceps
  "tricep pushdown": { primary: ["triceps"], secondary: [] },
  "tricep extension": { primary: ["triceps"], secondary: [] },
  "skull crusher": { primary: ["triceps"], secondary: [] },
  "overhead tricep extension": { primary: ["triceps"], secondary: [] },
  "close grip bench press": { primary: ["triceps"], secondary: ["chest", "front-deltoids"] },

  // Pull — back
  "deadlift": {
    primary: ["hamstring", "gluteal", "lower-back"],
    secondary: ["trapezius", "upper-back", "forearm"],
  },
  "conventional deadlift": {
    primary: ["hamstring", "gluteal", "lower-back"],
    secondary: ["trapezius", "upper-back", "forearm"],
  },
  "sumo deadlift": {
    primary: ["gluteal", "hamstring", "adductor"],
    secondary: ["lower-back", "trapezius"],
  },
  "pull-up": { primary: ["upper-back"], secondary: ["biceps", "back-deltoids"] },
  "pullup": { primary: ["upper-back"], secondary: ["biceps", "back-deltoids"] },
  "weighted pull-up": { primary: ["upper-back"], secondary: ["biceps", "back-deltoids"] },
  "chin-up": { primary: ["upper-back", "biceps"], secondary: [] },
  "lat pulldown": { primary: ["upper-back"], secondary: ["biceps"] },
  "neutral-grip lat pulldown": { primary: ["upper-back"], secondary: ["biceps"] },
  "barbell row": { primary: ["upper-back"], secondary: ["biceps", "back-deltoids"] },
  "bent-over row": { primary: ["upper-back"], secondary: ["biceps", "lower-back"] },
  "dumbbell row": { primary: ["upper-back"], secondary: ["biceps"] },
  "chest-supported row": { primary: ["upper-back"], secondary: ["biceps", "back-deltoids"] },
  "cable row": { primary: ["upper-back"], secondary: ["biceps"] },
  "seated row": { primary: ["upper-back"], secondary: ["biceps"] },
  "t-bar row": { primary: ["upper-back"], secondary: ["biceps", "lower-back"] },
  "shrug": { primary: ["trapezius"], secondary: [] },
  "barbell shrug": { primary: ["trapezius"], secondary: [] },

  // Pull — biceps
  "bicep curl": { primary: ["biceps"], secondary: ["forearm"] },
  "barbell curl": { primary: ["biceps"], secondary: ["forearm"] },
  "dumbbell curl": { primary: ["biceps"], secondary: ["forearm"] },
  "hammer curl": { primary: ["biceps", "forearm"], secondary: [] },
  "preacher curl": { primary: ["biceps"], secondary: [] },
  "incline curl": { primary: ["biceps"], secondary: [] },
  "cable curl": { primary: ["biceps"], secondary: ["forearm"] },

  // Legs — quad-dominant
  "squat": { primary: ["quadriceps"], secondary: ["gluteal", "hamstring", "lower-back"] },
  "back squat": { primary: ["quadriceps"], secondary: ["gluteal", "hamstring", "lower-back"] },
  "front squat": { primary: ["quadriceps"], secondary: ["gluteal", "abs"] },
  "goblet squat": { primary: ["quadriceps"], secondary: ["gluteal"] },
  // No bar means no spinal loading — lower back drops off the air-squat list.
  "bodyweight squat": { primary: ["quadriceps"], secondary: ["gluteal", "hamstring"] },
  "air squat": { primary: ["quadriceps"], secondary: ["gluteal", "hamstring"] },
  "hack squat": { primary: ["quadriceps"], secondary: ["gluteal"] },
  "leg press": { primary: ["quadriceps"], secondary: ["gluteal", "hamstring"] },
  "leg extension": { primary: ["quadriceps"], secondary: [] },
  "lunge": { primary: ["quadriceps", "gluteal"], secondary: ["hamstring"] },
  "walking lunge": { primary: ["quadriceps", "gluteal"], secondary: ["hamstring"] },
  "reverse lunge": { primary: ["quadriceps", "gluteal"], secondary: ["hamstring"] },
  "bulgarian split squat": { primary: ["quadriceps", "gluteal"], secondary: ["hamstring"] },
  "step-up": { primary: ["quadriceps", "gluteal"], secondary: ["hamstring"] },

  // Legs — posterior chain
  "romanian deadlift": { primary: ["hamstring", "gluteal"], secondary: ["lower-back"] },
  "rdl": { primary: ["hamstring", "gluteal"], secondary: ["lower-back"] },
  "stiff-leg deadlift": { primary: ["hamstring", "gluteal"], secondary: ["lower-back"] },
  "leg curl": { primary: ["hamstring"], secondary: [] },
  "hamstring curl": { primary: ["hamstring"], secondary: [] },
  "hip thrust": { primary: ["gluteal"], secondary: ["hamstring"] },
  "barbell hip thrust": { primary: ["gluteal"], secondary: ["hamstring"] },
  "glute bridge": { primary: ["gluteal"], secondary: ["hamstring"] },
  "good morning": { primary: ["hamstring", "lower-back"], secondary: ["gluteal"] },
  // Floor back extension — spinal erectors do the lifting, glutes and rear
  // shoulders assist holding the arms/legs up.
  "superman": { primary: ["lower-back"], secondary: ["gluteal", "back-deltoids"] },

  // Legs — calves
  "calf raise": { primary: ["calves"], secondary: [] },
  "standing calf raise": { primary: ["calves"], secondary: [] },
  "seated calf raise": { primary: ["calves"], secondary: [] },

  // Core
  "plank": { primary: ["abs"], secondary: ["obliques"] },
  "crunch": { primary: ["abs"], secondary: [] },
  "sit-up": { primary: ["abs"], secondary: [] },
  "russian twist": { primary: ["obliques"], secondary: ["abs"] },
  "hanging leg raise": { primary: ["abs"], secondary: ["obliques"] },
  "ab wheel": { primary: ["abs"], secondary: ["obliques"] },
  "cable crunch": { primary: ["abs"], secondary: [] },
  "side plank": { primary: ["obliques"], secondary: ["abs"] },
};

const fuzzyRules: { match: (n: string) => boolean; mapping: MuscleMapping }[] = [
  // Push
  { match: (n) => n.includes("bench") && !n.includes("close grip"), mapping: { primary: ["chest"], secondary: ["triceps", "front-deltoids"] } },
  { match: (n) => n.includes("close grip") && n.includes("bench"), mapping: { primary: ["triceps"], secondary: ["chest", "front-deltoids"] } },
  { match: (n) => /\b(chest|pec)\b/.test(n) && (n.includes("press") || n.includes("fly")), mapping: { primary: ["chest"], secondary: ["front-deltoids", "triceps"] } },
  { match: (n) => n.includes("dip"), mapping: { primary: ["chest", "triceps"], secondary: ["front-deltoids"] } },
  { match: (n) => n.includes("push") && n.includes("up"), mapping: { primary: ["chest"], secondary: ["triceps", "front-deltoids"] } },

  // Shoulders
  { match: (n) => n.includes("overhead") && n.includes("press"), mapping: { primary: ["front-deltoids"], secondary: ["triceps"] } },
  { match: (n) => (n.includes("shoulder") || n.includes("ohp") || n.includes("military")) && n.includes("press"), mapping: { primary: ["front-deltoids"], secondary: ["triceps"] } },
  { match: (n) => n.includes("lateral") && n.includes("raise"), mapping: { primary: ["back-deltoids", "front-deltoids"], secondary: [] } },
  { match: (n) => n.includes("front") && n.includes("raise"), mapping: { primary: ["front-deltoids"], secondary: [] } },
  { match: (n) => (n.includes("rear") || n.includes("reverse")) && (n.includes("fly") || n.includes("delt")), mapping: { primary: ["back-deltoids"], secondary: ["upper-back"] } },
  { match: (n) => n.includes("face") && n.includes("pull"), mapping: { primary: ["back-deltoids", "trapezius"], secondary: ["upper-back"] } },
  { match: (n) => n.includes("shrug"), mapping: { primary: ["trapezius"], secondary: [] } },

  // Triceps
  { match: (n) => n.includes("tricep") || n.includes("skull"), mapping: { primary: ["triceps"], secondary: [] } },
  { match: (n) => n.includes("pushdown"), mapping: { primary: ["triceps"], secondary: [] } },

  // Back / pull
  { match: (n) => n.includes("deadlift") && !n.includes("romanian") && !n.includes("stiff") && !n.includes("rdl"), mapping: { primary: ["hamstring", "gluteal", "lower-back"], secondary: ["trapezius", "upper-back", "forearm"] } },
  { match: (n) => n.includes("rdl") || (n.includes("romanian") && n.includes("deadlift")) || (n.includes("stiff") && n.includes("deadlift")), mapping: { primary: ["hamstring", "gluteal"], secondary: ["lower-back"] } },
  { match: (n) => n.includes("good morning"), mapping: { primary: ["hamstring", "lower-back"], secondary: ["gluteal"] } },
  { match: (n) => n.includes("pull") && (n.includes("up") || n.includes("-up")), mapping: { primary: ["upper-back"], secondary: ["biceps", "back-deltoids"] } },
  { match: (n) => n.includes("chin"), mapping: { primary: ["upper-back", "biceps"], secondary: [] } },
  { match: (n) => n.includes("pulldown") || n.includes("lat pull"), mapping: { primary: ["upper-back"], secondary: ["biceps"] } },
  { match: (n) => n.includes("pullover") || (n.includes("pull") && n.includes("over")), mapping: { primary: ["chest", "upper-back"], secondary: ["triceps"] } },
  { match: (n) => n.includes("upright") && n.includes("row"), mapping: { primary: ["trapezius", "back-deltoids"], secondary: ["biceps"] } },
  { match: (n) => n.includes("row"), mapping: { primary: ["upper-back"], secondary: ["biceps", "back-deltoids"] } },
  { match: (n) => (n.includes("back") || n.includes("hyper")) && n.includes("extension"), mapping: { primary: ["lower-back"], secondary: ["gluteal", "hamstring"] } },
  { match: (n) => n.includes("carry") || n.includes("farmer"), mapping: { primary: ["forearm", "trapezius"], secondary: ["abs"] } },
  { match: (n) => n.includes("hang") && !n.includes("clean") && !n.includes("snatch"), mapping: { primary: ["forearm"], secondary: ["upper-back"] } },

  // Biceps / forearms
  { match: (n) => n.includes("hammer") && n.includes("curl"), mapping: { primary: ["biceps", "forearm"], secondary: [] } },
  { match: (n) => n.includes("preacher"), mapping: { primary: ["biceps"], secondary: [] } },
  { match: (n) => (n.includes("wrist") || n.includes("reverse")) && n.includes("curl"), mapping: { primary: ["forearm"], secondary: ["biceps"] } },
  { match: (n) => n.includes("curl") && !n.includes("leg"), mapping: { primary: ["biceps"], secondary: ["forearm"] } },

  // Legs
  { match: (n) => n.includes("squat"), mapping: { primary: ["quadriceps"], secondary: ["gluteal", "hamstring"] } },
  { match: (n) => n.includes("leg press") || n.includes("hack"), mapping: { primary: ["quadriceps"], secondary: ["gluteal", "hamstring"] } },
  { match: (n) => n.includes("leg extension") || (n.includes("leg") && n.includes("extension")), mapping: { primary: ["quadriceps"], secondary: [] } },
  { match: (n) => n.includes("lunge") || n.includes("split squat") || n.includes("step-up") || n.includes("step up"), mapping: { primary: ["quadriceps", "gluteal"], secondary: ["hamstring"] } },
  { match: (n) => (n.includes("leg") && n.includes("curl")) || n.includes("hamstring curl") || n.includes("nordic"), mapping: { primary: ["hamstring"], secondary: [] } },
  { match: (n) => n.includes("hip thrust") || n.includes("glute bridge") || n.includes("kickback"), mapping: { primary: ["gluteal"], secondary: ["hamstring"] } },
  { match: (n) => n.includes("abduct"), mapping: { primary: ["abductors"], secondary: ["gluteal"] } },
  { match: (n) => n.includes("adduct"), mapping: { primary: ["adductor"], secondary: [] } },
  { match: (n) => n.includes("calf") || n.includes("calves"), mapping: { primary: ["calves"], secondary: [] } },

  // Core
  { match: (n) => n.includes("plank") && !n.includes("side"), mapping: { primary: ["abs"], secondary: ["obliques"] } },
  { match: (n) => n.includes("side plank"), mapping: { primary: ["obliques"], secondary: ["abs"] } },
  { match: (n) => n.includes("crunch") || n.includes("sit-up") || n.includes("situp") || n.includes("ab wheel") || (n.includes("leg raise") && (n.includes("hanging") || n.includes("captain"))), mapping: { primary: ["abs"], secondary: [] } },
  { match: (n) => n.includes("twist") || n.includes("oblique") || n.includes("woodchop"), mapping: { primary: ["obliques"], secondary: ["abs"] } },

  // ── Muscle-name fallbacks — LAST, so movement rules always win. People
  //    name exercises (and review imports) after the muscle itself:
  //    "biceps", "forearms", "back", "leg day". A named muscle must never
  //    leave the map gray. Word-boundary matches keep "hack squat" away
  //    from \bback\b and "front raise" away from \barms?\b.
  { match: (n) => /\b(biceps?|bis)\b/.test(n), mapping: { primary: ["biceps"], secondary: ["forearm"] } },
  { match: (n) => /\b(triceps?|tris)\b/.test(n), mapping: { primary: ["triceps"], secondary: [] } },
  { match: (n) => /\b(forearms?|grip|wrists?)\b/.test(n), mapping: { primary: ["forearm"], secondary: [] } },
  { match: (n) => /\b(chest|pecs?)\b/.test(n), mapping: { primary: ["chest"], secondary: ["front-deltoids", "triceps"] } },
  { match: (n) => /\blats?\b/.test(n), mapping: { primary: ["upper-back"], secondary: ["biceps"] } },
  { match: (n) => /\blower back\b/.test(n), mapping: { primary: ["lower-back"], secondary: ["gluteal"] } },
  { match: (n) => /\bback\b/.test(n), mapping: { primary: ["upper-back"], secondary: ["back-deltoids", "biceps"] } },
  { match: (n) => /\b(shoulders?|delts?)\b/.test(n), mapping: { primary: ["front-deltoids", "back-deltoids"], secondary: ["trapezius"] } },
  { match: (n) => /\btraps?\b/.test(n), mapping: { primary: ["trapezius"], secondary: [] } },
  { match: (n) => /\b(quads?|quadriceps)\b/.test(n), mapping: { primary: ["quadriceps"], secondary: [] } },
  { match: (n) => /\b(hamstrings?|hammies)\b/.test(n), mapping: { primary: ["hamstring"], secondary: ["gluteal"] } },
  { match: (n) => /\b(glutes?|booty)\b/.test(n), mapping: { primary: ["gluteal"], secondary: ["hamstring"] } },
  { match: (n) => /\b(abs|core|abdominals?)\b/.test(n), mapping: { primary: ["abs"], secondary: ["obliques"] } },
  { match: (n) => /\blegs?\b/.test(n), mapping: { primary: ["quadriceps", "hamstring", "gluteal"], secondary: ["calves"] } },
  { match: (n) => /\barms?\b/.test(n), mapping: { primary: ["biceps", "triceps"], secondary: ["forearm"] } },
  { match: (n) => /\bneck\b/.test(n), mapping: { primary: ["neck"], secondary: ["trapezius"] } },
];

export const lookupMuscles = (exerciseName: string): MuscleMapping | null => {
  const normalized = exerciseName.trim().toLowerCase();
  if (exact[normalized]) return exact[normalized];
  for (const rule of fuzzyRules) {
    if (rule.match(normalized)) return rule.mapping;
  }
  return null;
};

export type MuscleActivation = {
  primary: Set<Muscle>;
  secondary: Set<Muscle>;
  unmatchedExercises: string[];
};

export const getMuscleActivation = (logs: WorkoutLog[], daysBack = 7): MuscleActivation => {
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const primary = new Set<Muscle>();
  const secondary = new Set<Muscle>();
  const unmatched = new Set<string>();

  for (const log of logs) {
    if (new Date(log.finished_at).getTime() < cutoff) continue;
    for (const exercise of log.exercises) {
      const hasCompletedSet = exercise.sets.some((s) => s.completed);
      if (!hasCompletedSet) continue;

      const mapping = lookupMuscles(exercise.name);
      if (!mapping) {
        unmatched.add(exercise.name);
        continue;
      }
      for (const m of mapping.primary) primary.add(m);
      for (const m of mapping.secondary) secondary.add(m);
    }
  }

  // A muscle that is primary anywhere shouldn't also be reported as secondary.
  for (const p of primary) secondary.delete(p);

  return { primary, secondary, unmatchedExercises: [...unmatched] };
};

import type { WorkoutExercise, WorkoutSet, WorkoutTemplate } from "@/data/liftosMock";

// Curated programs offered when a user has zero templates. Each entry maps 1:1
// to a Workouts-page card and seeds a real template/session on tap, so every
// program is a single startable workout (PPL ships as one program per day).
// Every exercise name below is an exact key in src/lib/muscleMap.ts — keep it
// that way so the muscle figure lights up from day one.

// What a program needs to be runnable — matched against onboarding's
// "What equipment do you have?" so a machine program is never suggested to
// someone training in their living room. "gym" = barbells/machines/cables,
// "dumbbells" = dumbbells (plus floor work), "none" = just a body and a floor.
export type StarterEquipment = "none" | "dumbbells" | "gym";

export type StarterProgram = WorkoutTemplate & {
  description: string;
  equipment: StarterEquipment;
};

// ── Library filters ──────────────────────────────────────────────────────
// The Workouts page filters starters by what the lifter HAS, not by an exact
// tag: dumbbells run every bodyweight program too, a full gym runs
// everything. Ranked so "runs on" is a single comparison.

export const STARTER_EQUIPMENT_OPTIONS: { id: StarterEquipment; label: string }[] = [
  { id: "gym", label: "Full gym" },
  { id: "dumbbells", label: "Dumbbells" },
  { id: "none", label: "Bodyweight" },
];

const EQUIPMENT_RANK: Record<StarterEquipment, number> = { none: 0, dumbbells: 1, gym: 2 };

/** True when the program is runnable with the equipment the lifter has. */
export const starterRunsOn = (program: StarterProgram, have: StarterEquipment): boolean =>
  EQUIPMENT_RANK[program.equipment] <= EQUIPMENT_RANK[have];

/** Onboarding's "What equipment do you have?" as a starter tag — the same
    reading the suggestion engine uses: "None" and "Dumbbells only" gate,
    "Full gym" / "Home gym" / unset gate nothing (null). */
export const equipmentFromProfile = (declared: string | null | undefined): StarterEquipment | null => {
  const normalized = declared?.trim().toLowerCase();
  if (normalized === "none") return "none";
  if (normalized === "dumbbells only") return "dumbbells";
  return null;
};

/** Duration chips: ≤30 is a cap, 60+ is a floor, everything between rounds
    to the nearer of 45 and 60 (40 and 50 read as "about 45", 55 as 60). */
export type StarterDurationBucket = "30" | "45" | "60";

export const STARTER_DURATION_BUCKETS: { id: StarterDurationBucket; label: string }[] = [
  { id: "30", label: "≤30 min" },
  { id: "45", label: "45 min" },
  { id: "60", label: "60+ min" },
];

export const starterDurationBucket = (minutes: number): StarterDurationBucket => {
  if (minutes <= 30) return "30";
  if (minutes >= 60) return "60";
  return Math.abs(minutes - 45) <= Math.abs(minutes - 60) ? "45" : "60";
};

/** "Push Pull Legs" (onboarding) and "Push / Pull / Legs" (starter) are the
    same split — compare letters only. Mirrors the suggestion engine. */
const normalizeSplit = (split: string): string => split.toLowerCase().replace(/[^a-z]/g, "");

/** The one starter the library flags "Recommended". The suggestion engine's
    pick wins when it is a starter; otherwise (the engine scored the
    lifter's own templates) the first program in their declared split that
    runs on their equipment; otherwise the first program that runs on their
    equipment. Never undefined while any program ships. */
export const recommendedStarter = (
  programs: StarterProgram[],
  pickId: string | null,
  profile: { split?: string | null; equipment?: string | null } | null | undefined,
): StarterProgram | undefined => {
  const pick = pickId ? programs.find((p) => p.id === pickId) : undefined;
  if (pick) return pick;
  const have = equipmentFromProfile(profile?.equipment);
  const runnable = have ? programs.filter((p) => starterRunsOn(p, have)) : programs;
  const pool = runnable.length > 0 ? runnable : programs;
  const split = profile?.split ? normalizeSplit(profile.split) : "";
  const inSplit = split ? pool.find((p) => normalizeSplit(p.split) === split) : undefined;
  return inSplit ?? pool[0];
};

/** The preview's per-exercise summary: "3 × 10", or "20 min" for a timed
    block, or "3 sets" when reps are left to the lifter. */
export const starterSetsLabel = (exercise: WorkoutExercise): string => {
  const first = exercise.sets[0];
  const count = exercise.sets.length;
  if (first?.duration_seconds) return `${Math.round(first.duration_seconds / 60)} min`;
  const reps = first?.reps ?? 0;
  return reps > 0 ? `${count} × ${reps}` : `${count} set${count === 1 ? "" : "s"}`;
};

// Weight stays undefined: the user fills in their own numbers on first log,
// and this works for both lb and kg accounts.
const repSets = (exerciseId: string, count: number, reps: number): WorkoutSet[] =>
  Array.from({ length: count }, (_, i) => ({ id: `${exerciseId}-set-${i + 1}`, reps }));

const exercise = (
  id: string,
  name: string,
  category: string,
  target: string,
  setCount: number,
  reps: number,
  kind: WorkoutExercise["kind"] = "weighted",
): WorkoutExercise => ({ id, name, kind, category, target, sets: repSets(id, setCount, reps) });

export const starterPrograms: StarterProgram[] = [
  {
    id: "full-body-foundations",
    name: "Full Body Foundations",
    split: "Full Body",
    focus: "Squat, push, pull, hinge, core — run it three days a week",
    duration: 45,
    difficulty: "Moderate",
    equipment: "gym", // dumbbells throughout, but Lat Pulldown needs a cable stack
    description: "A friendly first program that trains everything in one visit and leaves you feeling capable, not crushed.",
    exercises: [
      exercise("fbf-goblet-squat", "Goblet Squat", "Quads", "3 × 10 — sit deep, chest tall", 3, 10),
      exercise("fbf-db-bench", "Dumbbell Bench Press", "Chest", "3 × 10 — smooth and controlled", 3, 10),
      exercise("fbf-pulldown", "Lat Pulldown", "Back", "3 × 10 — pull elbows to your pockets", 3, 10),
      exercise("fbf-rdl", "Romanian Deadlift", "Hamstrings", "3 × 10 — slow eccentric, flat back", 3, 10),
      exercise("fbf-db-press", "Dumbbell Shoulder Press", "Shoulders", "3 × 10 — no leg drive", 3, 10),
      exercise("fbf-crunch", "Crunch", "Core", "3 × 15 — squeeze at the top", 3, 15, "bodyweight"),
    ],
  },
  {
    id: "bodyweight-foundations",
    name: "Bodyweight Foundations",
    split: "Full Body",
    focus: "Push, squat, lunge, bridge, core — no equipment needed",
    duration: 30,
    difficulty: "Moderate",
    equipment: "none",
    description: "A complete first program that needs nothing but you and the floor — every muscle group trained at home.",
    exercises: [
      exercise("bwf-pushup", "Push-Up", "Chest", "3 × 10 — body in one line, chest to the floor", 3, 10, "bodyweight"),
      exercise("bwf-squat", "Bodyweight Squat", "Quads", "3 × 15 — sit deep, heels down", 3, 15, "bodyweight"),
      exercise("bwf-lunge", "Reverse Lunge", "Quads", "3 × 10 — ten per leg, torso tall", 3, 10, "bodyweight"),
      exercise("bwf-bridge", "Glute Bridge", "Glutes", "3 × 12 — squeeze hard at the top", 3, 12, "bodyweight"),
      exercise("bwf-pike", "Pike Push-Up", "Shoulders", "3 × 8 — hips high, head toward the floor", 3, 8, "bodyweight"),
      exercise("bwf-superman", "Superman", "Back", "3 × 12 — lift arms and legs together, pause", 3, 12, "bodyweight"),
      exercise("bwf-situp", "Sit-Up", "Core", "3 × 15 — controlled down, no neck pulling", 3, 15, "bodyweight"),
    ],
  },
  {
    id: "barbell-5x5",
    name: "Barbell 5×5",
    split: "Full Body",
    focus: "Three barbell lifts, five sets of five, add weight every session",
    duration: 40,
    difficulty: "Hard",
    equipment: "gym",
    description: "The minimalist classic — squat, bench, and row your way to strength with nothing but a barbell.",
    exercises: [
      exercise("5x5-squat", "Back Squat", "Quads", "5 × 5 — same weight across all sets", 5, 5),
      exercise("5x5-bench", "Barbell Bench Press", "Chest", "5 × 5 — pause the first rep", 5, 5),
      exercise("5x5-row", "Barbell Row", "Back", "5 × 5 — strict, no body english", 5, 5),
    ],
  },
  {
    id: "ppl-push",
    name: "Push Day",
    split: "Push / Pull / Legs",
    focus: "Chest, shoulders, and triceps",
    duration: 55,
    difficulty: "Hard",
    equipment: "gym",
    description: "Every pressing muscle gets its turn — heavy bench first, then volume until the pump arrives.",
    exercises: [
      exercise("ppl-push-bench", "Barbell Bench Press", "Chest", "4 × 8 — leave 1-2 reps in reserve", 4, 8),
      exercise("ppl-push-ohp", "Overhead Press", "Shoulders", "3 × 8 — brace hard, full lockout", 3, 8),
      exercise("ppl-push-incline", "Incline Dumbbell Press", "Chest", "3 × 10 — deep stretch at the bottom", 3, 10),
      exercise("ppl-push-lateral", "Cable Lateral Raise", "Shoulders", "3 × 12 — light weight, clean reps", 3, 12),
      exercise("ppl-push-pushdown", "Tricep Pushdown", "Arms", "3 × 12 — elbows pinned", 3, 12),
    ],
  },
  {
    id: "ppl-pull",
    name: "Pull Day",
    split: "Push / Pull / Legs",
    focus: "Back thickness, lats, rear delts, and biceps",
    duration: 55,
    difficulty: "Hard",
    equipment: "gym",
    description: "Deadlifts open the show, then rows and curls build the back you can't see but everyone else can.",
    exercises: [
      exercise("ppl-pull-deadlift", "Deadlift", "Back", "3 × 5 — reset every rep", 3, 5),
      exercise("ppl-pull-pulldown", "Lat Pulldown", "Back", "3 × 10 — full stretch at the top", 3, 10),
      exercise("ppl-pull-row", "Barbell Row", "Back", "3 × 8 — pull to the lower ribs", 3, 8),
      exercise("ppl-pull-facepull", "Face Pull", "Shoulders", "3 × 15 — pull apart, not just back", 3, 15),
      exercise("ppl-pull-curl", "Barbell Curl", "Arms", "3 × 10 — no swinging", 3, 10),
      exercise("ppl-pull-hammer", "Hammer Curl", "Arms", "3 × 12 — squeeze the forearms", 3, 12),
    ],
  },
  {
    id: "ppl-legs",
    name: "Leg Day",
    split: "Push / Pull / Legs",
    focus: "Squat pattern, posterior chain, and calves",
    duration: 60,
    difficulty: "Very Hard",
    equipment: "gym",
    description: "The day nobody skips anymore — squats up front, hamstrings and calves to finish the job.",
    exercises: [
      exercise("ppl-legs-squat", "Back Squat", "Quads", "4 × 6 — heavy but crisp", 4, 6),
      exercise("ppl-legs-rdl", "Romanian Deadlift", "Hamstrings", "3 × 8 — feel the stretch", 3, 8),
      exercise("ppl-legs-press", "Leg Press", "Quads", "3 × 10 — full depth, controlled", 3, 10),
      exercise("ppl-legs-curl", "Leg Curl", "Hamstrings", "3 × 12 — pause at peak contraction", 3, 12),
      exercise("ppl-legs-calf", "Standing Calf Raise", "Calves", "4 × 12 — pause at the bottom", 4, 12),
    ],
  },
  {
    id: "upper-lower-upper",
    name: "Upper Body",
    split: "Upper / Lower",
    focus: "Balanced pressing and pulling in one efficient session",
    duration: 50,
    difficulty: "Hard",
    equipment: "gym",
    description: "Half of a two-day pair that covers your whole upper body — pair it with Lower Body across the week.",
    exercises: [
      exercise("ul-upper-bench", "Barbell Bench Press", "Chest", "4 × 8 — leave 1-2 reps in reserve", 4, 8),
      exercise("ul-upper-row", "Barbell Row", "Back", "4 × 8 — match your bench sets", 4, 8),
      exercise("ul-upper-ohp", "Overhead Press", "Shoulders", "3 × 10 — strict press", 3, 10),
      exercise("ul-upper-pulldown", "Lat Pulldown", "Back", "3 × 10 — lean back slightly", 3, 10),
      exercise("ul-upper-curl", "Dumbbell Curl", "Arms", "3 × 12 — alternate arms", 3, 12),
      exercise("ul-upper-skull", "Skull Crusher", "Arms", "3 × 12 — lower to the forehead, slowly", 3, 12),
    ],
  },
  {
    id: "upper-lower-lower",
    name: "Lower Body",
    split: "Upper / Lower",
    focus: "Quads, hamstrings, glutes, calves, and core",
    duration: 50,
    difficulty: "Hard",
    equipment: "gym",
    description: "The other half of the pair — legs and core get the full session they deserve.",
    exercises: [
      exercise("ul-lower-squat", "Back Squat", "Quads", "4 × 8 — consistent depth", 4, 8),
      exercise("ul-lower-rdl", "Romanian Deadlift", "Hamstrings", "4 × 8 — hinge, don't squat it", 4, 8),
      exercise("ul-lower-lunge", "Walking Lunge", "Quads", "3 × 10 — ten steps per leg", 3, 10),
      exercise("ul-lower-extension", "Leg Extension", "Quads", "3 × 12 — squeeze at lockout", 3, 12),
      exercise("ul-lower-calf", "Seated Calf Raise", "Calves", "3 × 15 — full range", 3, 15),
      exercise("ul-lower-legraise", "Hanging Leg Raise", "Core", "3 × 10 — no swinging", 3, 10, "bodyweight"),
    ],
  },
];

export const getStarterProgram = (id: string): StarterProgram | undefined =>
  starterPrograms.find((p) => p.id === id);

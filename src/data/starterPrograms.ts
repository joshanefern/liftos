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

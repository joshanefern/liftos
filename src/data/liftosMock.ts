export type ExerciseKind = "weighted" | "bodyweight" | "cardio";

export type WorkoutSet = {
  id: string;
  reps?: number;
  weight?: number;
  duration_seconds?: number;
  distance_m?: number;
  completed?: boolean;
  previous?: string;
  isWarmup?: boolean;
};

export type WorkoutExercise = {
  id: string;
  name: string;
  kind?: ExerciseKind;
  category: string;
  target: string;
  notes?: string;
  sets: WorkoutSet[];
};

export type WorkoutTemplate = {
  id: string;
  name: string;
  split: string;
  focus: string;
  duration: number;
  difficulty: "Moderate" | "Hard" | "Very Hard";
  exercises: WorkoutExercise[];
};

export const currentUser = {
  name: "Josh",
  goal: "Lean hypertrophy with strength carryover",
  experience: "Intermediate",
  frequency: 5,
  split: "Push / Pull / Legs / Upper / Lower",
  units: "lb",
};

export const workoutTemplates: WorkoutTemplate[] = [
  {
    id: "push-strength",
    name: "Push Strength",
    split: "Push",
    focus: "Bench priority, chest volume, triceps finish",
    duration: 58,
    difficulty: "Hard",
    exercises: [
      {
        id: "bench",
        name: "Barbell Bench Press",
        category: "Chest",
        target: "Top set plus back-off volume",
        notes: "Pause first rep on each working set.",
        sets: [
          { id: "bench-1", reps: 5, weight: 205, completed: true, previous: "195 x 5" },
          { id: "bench-2", reps: 5, weight: 205, completed: true, previous: "195 x 5" },
          { id: "bench-3", reps: 6, weight: 185, completed: false, previous: "185 x 6" },
        ],
      },
      {
        id: "incline-db",
        name: "Incline Dumbbell Press",
        category: "Chest",
        target: "Controlled hypertrophy work",
        sets: [
          { id: "incline-1", reps: 10, weight: 70, completed: true, previous: "65 x 10" },
          { id: "incline-2", reps: 10, weight: 70, completed: false, previous: "65 x 9" },
          { id: "incline-3", reps: 9, weight: 70, completed: false, previous: "65 x 9" },
        ],
      },
      {
        id: "lateral-raise",
        name: "Cable Lateral Raise",
        category: "Shoulders",
        target: "12-18 reps, clean lock-in",
        sets: [
          { id: "lat-1", reps: 15, weight: 20, completed: false },
          { id: "lat-2", reps: 15, weight: 20, completed: false },
          { id: "lat-3", reps: 14, weight: 20, completed: false },
        ],
      },
    ],
  },
  {
    id: "pull-hypertrophy",
    name: "Pull Hypertrophy",
    split: "Pull",
    focus: "Lats, upper back, rear delts, biceps",
    duration: 52,
    difficulty: "Hard",
    exercises: [
      {
        id: "weighted-pullup",
        name: "Weighted Pull-Up",
        category: "Back",
        target: "Strength-biased vertical pull",
        sets: [
          { id: "pullup-1", reps: 6, weight: 35, completed: true },
          { id: "pullup-2", reps: 6, weight: 35, completed: true },
          { id: "pullup-3", reps: 8, weight: 15, completed: false },
        ],
      },
      {
        id: "chest-row",
        name: "Chest-Supported Row",
        category: "Back",
        target: "Upper-back volume",
        sets: [
          { id: "row-1", reps: 10, weight: 115, completed: true },
          { id: "row-2", reps: 10, weight: 115, completed: false },
          { id: "row-3", reps: 10, weight: 105, completed: false },
        ],
      },
    ],
  },
  {
    id: "legs-performance",
    name: "Legs Performance",
    split: "Legs",
    focus: "Squat pattern, posterior chain, unilateral work",
    duration: 64,
    difficulty: "Very Hard",
    exercises: [
      {
        id: "squat",
        name: "Back Squat",
        category: "Quads",
        target: "Heavy triple, then volume",
        sets: [
          { id: "squat-1", reps: 3, weight: 315, completed: true },
          { id: "squat-2", reps: 5, weight: 275, completed: true },
          { id: "squat-3", reps: 5, weight: 275, completed: false },
        ],
      },
      {
        id: "rdl",
        name: "Romanian Deadlift",
        category: "Hamstrings",
        target: "Slow eccentric",
        sets: [
          { id: "rdl-1", reps: 8, weight: 245, completed: false },
          { id: "rdl-2", reps: 8, weight: 245, completed: false },
        ],
      },
    ],
  },
  {
    id: "upper-density",
    name: "Upper Density",
    split: "Upper",
    focus: "Efficient upper-body volume in under 50 minutes",
    duration: 46,
    difficulty: "Moderate",
    exercises: [
      {
        id: "machine-press",
        name: "Machine Chest Press",
        category: "Chest",
        target: "Stable pressing volume",
        sets: [
          { id: "machine-1", reps: 12, weight: 165, completed: false },
          { id: "machine-2", reps: 10, weight: 165, completed: false },
        ],
      },
      {
        id: "pulldown",
        name: "Neutral-Grip Lat Pulldown",
        category: "Back",
        target: "Lat-focused stretch",
        sets: [
          { id: "pulldown-1", reps: 11, weight: 150, completed: false },
          { id: "pulldown-2", reps: 10, weight: 150, completed: false },
        ],
      },
    ],
  },
];

export const recentWorkouts = [
  { name: "Push Strength", date: "Today", duration: 61, sets: 18, volume: 18420, focus: "Chest + Triceps" },
  { name: "Pull Hypertrophy", date: "Yesterday", duration: 49, sets: 16, volume: 15680, focus: "Back + Biceps" },
  { name: "Legs Performance", date: "Apr 18", duration: 67, sets: 20, volume: 27120, focus: "Squat + Posterior" },
  { name: "Upper Density", date: "Apr 16", duration: 44, sets: 15, volume: 13280, focus: "Upper volume" },
];

export const dailySummary = {
  workoutName: "Push Strength",
  totalExercises: 6,
  totalSets: 18,
  totalVolume: 18420,
  duration: 61,
  insight: "Chest volume is up 12% from last week while average reps stayed stable.",
  tomorrow: "Train Pull tomorrow and keep rows 1-2 reps shy of failure.",
};

export const weeklySummary = {
  workoutsCompleted: 5,
  totalSets: 87,
  totalVolume: 92480,
  strongestTrend: "Bench press e1RM has climbed 4.8% over 4 weeks.",
  consistencyScore: 92,
  insight: "Your upper-body volume is productive; keep lower-body sessions consistent to balance the split.",
};

export const weeklyTrend = [
  { week: "W1", volume: 74200, sets: 73, sessions: 4 },
  { week: "W2", volume: 80140, sets: 78, sessions: 4 },
  { week: "W3", volume: 85620, sets: 82, sessions: 5 },
  { week: "W4", volume: 82100, sets: 79, sessions: 4 },
  { week: "W5", volume: 88780, sets: 84, sessions: 5 },
  { week: "W6", volume: 91120, sets: 86, sessions: 5 },
  { week: "W7", volume: 90480, sets: 83, sessions: 5 },
  { week: "W8", volume: 92480, sets: 87, sessions: 5 },
];

export const exerciseProgress = [
  { lift: "Bench Press", current: 225, previous: 215, trend: "+4.7%", volume: 14200 },
  { lift: "Back Squat", current: 335, previous: 325, trend: "+3.1%", volume: 18750 },
  { lift: "Deadlift", current: 405, previous: 395, trend: "+2.5%", volume: 11840 },
  { lift: "Overhead Press", current: 145, previous: 140, trend: "+3.6%", volume: 8420 },
];

export const muscleGroupData = [
  { group: "Chest", sets: 18, target: 16 },
  { group: "Back", sets: 20, target: 18 },
  { group: "Quads", sets: 13, target: 14 },
  { group: "Hamstrings", sets: 10, target: 12 },
  { group: "Delts", sets: 15, target: 14 },
  { group: "Arms", sets: 14, target: 12 },
];

export const consistencyData = [
  { day: "Mon", trained: 1, label: "Push" },
  { day: "Tue", trained: 1, label: "Pull" },
  { day: "Wed", trained: 0, label: "Rest" },
  { day: "Thu", trained: 1, label: "Legs" },
  { day: "Fri", trained: 1, label: "Upper" },
  { day: "Sat", trained: 1, label: "Lower" },
  { day: "Sun", trained: 0, label: "Plan" },
];

// The mock coach dictionary, canned messages, and context cards that lived here
// are gone — the Coach page now streams real replies from the coach Edge
// Function, grounded in live training data (src/lib/coach.ts).

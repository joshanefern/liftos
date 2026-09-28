import { TRAINING_DAY_CHOICES, frequencyAnswer } from "@/lib/trainingDays";

/* ── The onboarding questions and the profile row they become. Kept apart
   from the screen so the saved shape can be tested without rendering it. ── */

export type OnboardingAnswers = {
  goal: string[];
  experience: string;
  equipment: string;
  /** Stored text for an exact count — "4 days". */
  frequency: string;
  split: string;
  units: string;
};

export const EMPTY_ANSWERS: OnboardingAnswers = {
  goal: [],
  experience: "",
  equipment: "",
  frequency: "",
  split: "",
  units: "",
};

export type OnboardingStep = {
  key: keyof OnboardingAnswers;
  label: string;
  options: readonly string[];
  multi: boolean;
};

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    key: "goal",
    label: "What are you training for?",
    options: ["Hypertrophy", "Strength", "Fat Loss", "General Fitness", "Not Sure"],
    multi: true,
  },
  {
    key: "experience",
    label: "How experienced are you?",
    options: ["Beginner", "Intermediate", "Advanced"],
    multi: false,
  },
  {
    key: "equipment",
    label: "What equipment do you have?",
    options: ["Full gym", "Home gym", "Dumbbells only", "None"],
    multi: false,
  },
  {
    key: "frequency",
    label: "How many days a week?",
    options: TRAINING_DAY_CHOICES.map(frequencyAnswer),
    multi: false,
  },
  {
    key: "split",
    label: "How will you split the week?",
    options: ["Push Pull Legs", "Upper Lower", "Full Body", "Not Sure / Other"],
    multi: false,
  },
  { key: "units", label: "Pounds or kilos?", options: ["lb", "kg"], multi: false },
];

/* What the user READS for a stored value. The stored value stays as-is:
   profiles.goal already holds "Hypertrophy" for every existing account, the
   Progress hero keys off it (progressHero.focusFor), and the coach prompt
   quotes it verbatim — so only the label changes, never the value. */
export const OPTION_LABELS: Record<string, string> = {
  "Hypertrophy": "Build muscle",
};

/* A caption says something the label does not. The day counts have none:
   "4 days" is already the whole answer. */
export const OPTION_CAPTIONS: Record<string, string> = {
  "Hypertrophy": "Add size (hypertrophy)",
  "Strength": "Lift heavier loads",
  "Fat Loss": "Burn body fat",
  "General Fitness": "Overall health focus",
  "Not Sure": "Find your path",
  "Beginner": "Just starting out",
  "Intermediate": "Some gym time",
  "Advanced": "Seasoned lifter",
  "Full gym": "All gear available",
  "Home gym": "Basic home setup",
  "Dumbbells only": "Free weights only",
  "None": "Bodyweight only",
  "Push Pull Legs": "3-day rotation",
  "Upper Lower": "Alternating body halves",
  "Full Body": "Full body each session",
  "Not Sure / Other": "Flexible approach",
  "lb": "Imperial units",
  "kg": "Metric units",
};

export type ProfileAnswersRow = {
  id: string;
  goal: string;
  experience: string;
  equipment: string;
  frequency: string;
  split: string;
  units: string;
};

/** The profiles row onboarding upserts. Goals join into one text column;
    frequency is saved exactly as chosen ("4 days"). */
export const buildProfileRow = (userId: string, answers: OnboardingAnswers): ProfileAnswersRow => ({
  id: userId,
  goal: answers.goal.join(", "),
  experience: answers.experience,
  equipment: answers.equipment,
  frequency: answers.frequency,
  split: answers.split,
  units: answers.units,
});

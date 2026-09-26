/* ── Recognizer vocabulary for dictating workouts.
   SFSpeechRecognizer's contextualStrings bias recognition toward these
   phrases — without them "chest day" came back as "chain day" and
   "anterior day" on a real iPhone. Curated gym language plus the lifter's
   own exercise names; capped because the plugin takes at most 100. ── */

const SPLITS = [
  "push day", "pull day", "leg day", "legs day", "chest day", "back day",
  "arm day", "arms day", "shoulder day", "shoulders day", "upper body",
  "lower body", "full body", "cardio day", "core day", "glute day",
];

const EXERCISES = [
  "bench press", "incline bench press", "incline dumbbell press", "dumbbell bench press",
  "overhead press", "shoulder press", "military press", "push press",
  "lateral raise", "front raise", "rear delt fly", "face pull", "upright row", "shrugs",
  "squat", "back squat", "front squat", "goblet squat", "hack squat", "leg press",
  "leg extension", "leg curl", "hamstring curl", "romanian deadlift", "deadlift",
  "sumo deadlift", "hip thrust", "glute bridge", "lunges", "walking lunges",
  "bulgarian split squat", "calf raise", "single leg leg extension",
  "pull up", "chin up", "lat pulldown", "barbell row", "bent over row", "dumbbell row",
  "seated row", "cable row", "t-bar row", "pendlay row",
  "bicep curl", "hammer curl", "preacher curl", "incline curl", "cable curl",
  "tricep pushdown", "tricep extension", "skull crushers", "dips", "close grip bench",
  "cable fly", "pec deck", "chest fly", "push ups",
  "plank", "hanging leg raise", "cable crunch", "ab wheel", "russian twist",
  "farmer's walk", "kettlebell swing",
  "treadmill", "stairmaster", "elliptical", "rowing machine", "assault bike",
  "stationary bike", "jump rope", "incline walk",
];

const COUNTS = [
  "sets of", "reps", "four by eight", "three by ten", "five by five",
  "each arm", "each leg", "per side", "single leg", "single arm",
  "at one thirty five", "at two twenty five", "pounds", "kilos", "minutes on the",
];

type Named = { exercises: { name: string }[] };

/** The lifter's own names first, then the curated set — deduped,
    lowercase, at most `cap` entries. */
export const dictationVocabulary = (own: Named[] = [], cap = 100): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string): void => {
    const s = raw.trim().toLowerCase();
    if (!s || seen.has(s) || out.length >= cap) return;
    seen.add(s);
    out.push(s);
  };
  for (const t of own) for (const e of t.exercises) add(e.name);
  for (const s of SPLITS) add(s);
  for (const e of EXERCISES) add(e);
  for (const c of COUNTS) add(c);
  return out;
};

import type { WorkoutExercise } from "@/data/liftosMock";
import type { UserProfile } from "@/context/UserContext";
import { extractWorkoutPlan, planToTemplateExercises } from "@/lib/coachPlan";

/* ── First-run week builder: one coach call turns the onboarding answers
   (goal / experience / equipment / frequency / split) into a full week of
   saved workouts. The model writes one section per training day in the
   exact line format extractWorkoutPlan already parses; everything else —
   splitting days, dropping junk sections, capping counts — is
   deterministic and lives here. ── */

export type GeneratedDay = {
  name: string;
  exercises: WorkoutExercise[];
};

/** The one-shot user message. The coach edge fn already carries the profile
    in its context; this restates the ask and pins the output format. */
export const buildSplitPrompt = (profile: UserProfile | null): string => {
  const wants: string[] = [];
  if (profile?.goal) wants.push(`goal: ${profile.goal}`);
  if (profile?.experience) wants.push(`experience: ${profile.experience}`);
  if (profile?.equipment) wants.push(`equipment: ${profile.equipment}`);
  if (profile?.frequency) wants.push(`days per week: ${profile.frequency}`);
  if (profile?.split) wants.push(`preferred split: ${profile.split}`);
  return `Build my first week of workouts${wants.length > 0 ? ` (${wants.join(", ")})` : ""}. If my split preference is "Not Sure / Other", pick the standard split for my frequency and experience.

Reply with NOTHING but one section per training day, in EXACTLY this format:

## <Workout name, e.g. Push Day>
<Exercise name>: <sets>x<reps>

5-8 exercises per day. No weights — I'll find my working weights as I go. No intro, no outro, no rest-day sections.`;
};

/** Marked day headers — the shapes the prompt pins plus what models emit
    anyway: "## Push Day", "**Pull Day**", "Day 1: Upper" (any dash). */
const MARKED_HEADERS = [
  /^#{1,4}\s+(.+?)\s*$/,
  /^\*\*(.+?)\*\*:?\s*$/,
  /^day\s*\d+\s*[·:–—-]\s*(.+?)\s*$/i,
];

/** Words that let a BARE line count as a day title. Marked headers skip
    this gate entirely. */
const DAY_WORDS =
  /\b(day|push|pull|legs?|upper|lower|full.?body|body|chest|back|shoulders?|arms?|core|glutes?|conditioning|strength|hypertrophy|workout|session|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

/** "Push Day (Chest, Shoulders, Triceps)" → "Push Day"; also sheds stray
    markdown and a leading "Day N ·" so titles read clean in the library. */
const cleanDayName = (raw: string): string => {
  const stripped = raw
    .replace(/[*_#]+/g, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
  const noPrefix = stripped.replace(/^day\s*\d+\s*[·:–—-]\s*/i, "").trim();
  return (noPrefix || stripped).slice(0, 60);
};

/** Split the coach's reply into day sections and parse each one with the
    same engine that powers "Save to My Workouts" in chat. Sections with
    fewer than 2 recognizable exercises are dropped; at most `cap` days. */
export const parseWeekPlan = (
  text: string,
  cap = 7,
): { name: string; exercises: WorkoutExercise[] }[] => {
  type Section = { name: string; lines: string[] };
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    // Exercise lines contain "3x8"-style set counts — never day headers.
    const looksLikeExercise = /\d\s*[x×]\s*\d/.test(line);
    if (!looksLikeExercise) {
      const marked = MARKED_HEADERS.map((p) => p.exec(line)).find(Boolean);
      const name = marked ? cleanDayName(marked[1] ?? line) : null;
      if (name) {
        current = { name, lines: [] };
        sections.push(current);
        continue;
      }
      // A bare title line ("Push Day") — kept strict so mid-section prose
      // like "Pull ups to failure" can't hijack a new section: at most 3
      // words, a day word, no sentence punctuation.
      const bare = cleanDayName(line);
      if (
        bare &&
        /^[A-Za-z]/.test(bare) &&
        !/[.:;!?,]$/.test(line) &&
        bare.split(/\s+/).length <= 3 &&
        DAY_WORDS.test(bare)
      ) {
        current = { name: bare, lines: [] };
        sections.push(current);
        continue;
      }
    }
    current?.lines.push(rawLine);
  }

  const days: { name: string; exercises: WorkoutExercise[] }[] = [];
  // A 6-day split legitimately repeats day names (Push/Pull/Legs ×2) — the
  // second cycle gets numbered, never dropped.
  const counts = new Map<string, number>();
  for (const section of sections) {
    if (days.length >= cap) break;
    const plan = extractWorkoutPlan(section.lines.join("\n"));
    if (plan.length < 2) continue;
    const key = section.name.toLowerCase();
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    const name = n === 1 ? section.name : `${section.name} ${n}`;
    days.push({ name, exercises: planToTemplateExercises(plan, name) });
  }
  return days;
};

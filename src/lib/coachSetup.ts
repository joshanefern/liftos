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

export type ScheduleDay = {
  /** "Monday" … "Sunday" */
  day: string;
  /** "Push", "Pull", "Legs", "Upper", "Lower", "Full body", … */
  focus: string;
};

/** The intake sheet's two free-text fields. Kept apart so the coach reads
    "must include" and "avoid" as two different instructions instead of one
    ambiguous note ("no squats" next to "front squats" is a coin flip). */
export type IntakeNotes = {
  /** Lifts the week has to include — "front squat, weighted pull-ups". */
  mustHave: string;
  /** Injuries, missing equipment, movements to leave out. */
  avoid: string;
};

const NOTE_LIMIT = 300;

/** The experienced lifter's 30-second intake: they told us WHEN they train
    and WHAT each day hits — the coach only fills in the exercises. Day
    headers double as template names ("Monday · Push"). */
export const buildSchedulePrompt = (
  profile: UserProfile | null,
  schedule: ScheduleDay[],
  notes: IntakeNotes,
): string => {
  const context: string[] = [];
  if (profile?.goal) context.push(`goal: ${profile.goal}`);
  if (profile?.experience) context.push(`experience: ${profile.experience}`);
  if (profile?.equipment) context.push(`equipment: ${profile.equipment}`);
  const mustHave = notes.mustHave.trim().slice(0, NOTE_LIMIT);
  const avoid = notes.avoid.trim().slice(0, NOTE_LIMIT);
  const extras: string[] = [];
  if (mustHave) extras.push(`Must include: ${mustHave}`);
  if (avoid) extras.push(`Avoid (injuries, missing equipment, movements to skip): ${avoid}`);
  const noteBlock = extras.length > 0 ? `\n${extras.join("\n")}` : "";
  return `Write my training week. This is MY schedule — keep every day exactly as given${context.length > 0 ? ` (${context.join(", ")})` : ""}:
${schedule.map((s) => `- ${s.day}: ${s.focus}`).join("\n")}${noteBlock}

Reply with NOTHING but one section per day above, in EXACTLY this format:

## ${schedule[0] ? `${schedule[0].day} · ${schedule[0].focus}` : "Monday · Push"}
<Exercise name>: <sets>x<reps>

5-8 exercises per day matched to that day's focus. No weights. No intro, no outro, no extra days.`;
};

/* ── In-progress marker. A week build outlives the Home screen: leave
   mid-build and come back and the hero must still say "Building…" — and
   must not let a second build start on top of the first (duplicate
   templates). The marker is the build's ISO start time in sessionStorage:
   session-scoped so a fresh launch never inherits it, and stale after 90s
   (a hung run's ceiling — the coach copy promises ~15s). Reading it is also
   the synchronous re-entrancy guard a double-tap needs, since React state
   hasn't flushed between two taps. ── */

export const WEEK_BUILD_KEY = "liftos-week-build";
export const WEEK_BUILD_STALE_MS = 90_000;

type MarkerStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** sessionStorage, or null where touching it throws (private mode, a
    blocked origin) — every helper then answers "no build in progress". */
const sessionStore = (): MarkerStore | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

/** True while a build started under 90s ago owns the marker. A marker
    from the future (clock set back mid-build) reads as stale rather than
    pinning the hero on "Building…" until the clock catches up. */
export const weekBuildInProgress = (
  now: number = Date.now(),
  store: MarkerStore | null = sessionStore(),
): boolean => {
  try {
    const raw = store?.getItem(WEEK_BUILD_KEY);
    if (!raw) return false;
    const elapsed = now - Date.parse(raw);
    return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < WEEK_BUILD_STALE_MS;
  } catch {
    return false;
  }
};

export const markWeekBuildStarted = (
  now: number = Date.now(),
  store: MarkerStore | null = sessionStore(),
): void => {
  try {
    store?.setItem(WEEK_BUILD_KEY, new Date(now).toISOString());
  } catch {
    // Storage refused the write — the in-memory guard still covers this mount.
  }
};

export const clearWeekBuildMarker = (store: MarkerStore | null = sessionStore()): void => {
  try {
    store?.removeItem(WEEK_BUILD_KEY);
  } catch {
    // Nothing to clear where nothing could be written.
  }
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
